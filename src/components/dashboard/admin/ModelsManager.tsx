"use client";

// ============================================================================
// MODELS MANAGER
//
// Three things on one screen, because they are one decision:
//
//   Roles    — which model id each agent job runs on. A pick here changes what
//              `MODELS.X` returns everywhere, immediately.
//   Catalogue — the rows the admin added. Enabling one for chat puts it in the
//              picker with its own per-turn credit price and minimum plan.
//   Rate card — the list prices the meter uses, built-in and custom, with the
//              last 30 days of spend beside each so the cost is not abstract.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Loader2, Pencil, Plug, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdminModelRow, ModelsView } from "@/lib/admin/models";
import { PLAN_TIERS } from "@/lib/billing/plans";
import { providerKeyNames, providerLabel, providerSpec, providersByGroup } from "@/lib/providers/registry";
import { archiveModelAction, setRoleModelAction, testModelAction, upsertModelAction, type AdminModelInput } from "@/actions/admin";
import { Empty, PlanPill, Section, fmtInt, fmtMicros } from "./primitives";

const select = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs dark:bg-input/30";

function blankModel(): AdminModelInput {
  return {
    id: "",
    label: "",
    blurb: "",
    provider: "vertex",
    baseUrl: null,
    apiKeyRef: null,
    contextWindow: null,
    maxOutputTokens: null,
    kind: "text",
    inputPerMTok: 0,
    outputPerMTok: 0,
    cachedPerMTok: null,
    perImage: null,
    perVideoSecond: null,
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
    tier: "frontier",
    enabledForChat: true,
    chatCredits: null,
    minPlan: null,
    isDefaultChat: false,
    sortOrder: 100,
  };
}

function fromRow(row: AdminModelRow): AdminModelInput {
  return {
    id: row.id,
    label: row.label,
    blurb: row.blurb ?? "",
    provider: row.provider,
    baseUrl: row.baseUrl,
    apiKeyRef: row.apiKeyRef,
    contextWindow: row.contextWindow,
    maxOutputTokens: row.maxOutputTokens,
    kind: row.kind as AdminModelInput["kind"],
    inputPerMTok: row.inputPerMTok,
    outputPerMTok: row.outputPerMTok,
    cachedPerMTok: row.cachedPerMTok,
    perImage: row.perImage,
    perVideoSecond: row.perVideoSecond,
    supportsThinking: row.supportsThinking,
    supportsTools: row.supportsTools,
    supportsVision: row.supportsVision,
    tier: row.tier as AdminModelInput["tier"],
    enabledForChat: row.enabledForChat,
    chatCredits: row.chatCredits,
    minPlan: (row.minPlan as AdminModelInput["minPlan"]) ?? null,
    isDefaultChat: row.isDefaultChat,
    sortOrder: row.sortOrder,
  };
}

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function ModelsManager({ view }: { view: ModelsView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminModelInput | null>(null);
  const [rolePicks, setRolePicks] = useState<Record<string, string>>(
    Object.fromEntries(view.roles.map((r) => [r.role, r.overridden ? r.current : ""]))
  );

  const refresh = () => startTransition(() => router.refresh());

  const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>, onOk?: () => void) => {
    setBusy(key);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (result.success) {
      onOk?.();
      refresh();
    } else setError(result.error || "That did not work.");
  };

  // Every id the role dropdowns can offer: built-in rate-card rows plus custom rows.
  const knownIds = Array.from(
    new Set([...view.builtIn.map((b) => b.id), ...view.custom.filter((c) => !c.archived).map((c) => c.id)])
  ).sort();

  return (
    <div className="space-y-5">
      {error && <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">{error}</div>}

      {/* Chat picker preview */}
      <Section
        title="What the chat picker shows right now"
        description={`The built-in brain plus every custom row enabled for chat. Flat price is ${view.flatChatCredits} credits per turn unless a row sets its own.`}
      >
        <div className="flex flex-wrap gap-2">
          {view.chatPicker.map((m) => (
            <div key={m.id} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${m.recommended ? "border-primary/50 bg-primary/5" : "border-slate-200 dark:border-slate-800"}`}>
              {m.recommended && <Sparkles className="h-3 w-3 text-primary" />}
              <span className="font-medium">{m.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{m.id}</span>
              <span className="text-[10px] text-muted-foreground">{providerLabel(m.provider)}</span>
              <span className="tabular-nums text-muted-foreground">{m.chatCredits} cr/turn</span>
              {m.minPlan && <PlanPill plan={m.minPlan} />}
              {m.custom && <Badge variant="outline" className="text-[10px]">custom</Badge>}
            </div>
          ))}
        </div>
      </Section>

      {/* Roles */}
      <Section title="Model per role" description="Leave blank to use the deployment default (env var or code). Changes apply on the next request.">
        <div className="grid gap-2 md:grid-cols-2">
          {view.roles.map((r) => (
            <div key={r.role} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{r.label}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{r.role}</div>
                </div>
                {r.overridden ? <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">overridden</Badge> : <Badge variant="outline" className="text-[10px]">default</Badge>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  list={`models-${r.role}`}
                  value={rolePicks[r.role] ?? ""}
                  onChange={(e) => setRolePicks((p) => ({ ...p, [r.role]: e.target.value }))}
                  placeholder={r.fallback}
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs dark:bg-input/30"
                />
                <datalist id={`models-${r.role}`}>
                  {knownIds.map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null || (rolePicks[r.role] ?? "") === (r.overridden ? r.current : "")}
                  onClick={() => run(`role-${r.role}`, () => setRoleModelAction({ role: r.role, modelId: (rolePicks[r.role] ?? "").trim() || null }))}
                >
                  {busy === `role-${r.role}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                {r.overridden && (
                  <Button size="sm" variant="ghost" title="Reset to default" disabled={busy !== null} onClick={() => run(`reset-${r.role}`, () => setRoleModelAction({ role: r.role, modelId: null }), () => setRolePicks((p) => ({ ...p, [r.role]: "" })))}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Running: <span className="font-mono">{r.current}</span>
                {r.overridden && <> · default <span className="font-mono">{r.fallback}</span></>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Custom catalogue */}
      <Section
        title="Custom models"
        description="Rows you add here. Enable one for chat and it appears in the picker with its own credit price; set a rate so the meter prices its calls."
        action={
          <Button size="sm" onClick={() => setEditing(blankModel())} disabled={editing !== null}>
            <Plus className="h-3.5 w-3.5" /> Add model
          </Button>
        }
      >
        {editing && (
          <ModelForm
            value={editing}
            onChange={setEditing}
            busy={busy === "save"}
            onCancel={() => setEditing(null)}
            onSave={() => run("save", () => upsertModelAction(editing), () => setEditing(null))}
          />
        )}

        {view.custom.length === 0 ? (
          <Empty>No custom models yet. The product runs on its built-in defaults.</Empty>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">Model</th>
                  <th className="py-1 pr-2 font-medium">Provider</th>
                  <th className="py-1 pr-2 font-medium">Kind</th>
                  <th className="py-1 pr-2 font-medium">Chat</th>
                  <th className="py-1 pr-2 text-right font-medium">Cr/turn</th>
                  <th className="py-1 pr-2 font-medium">Min plan</th>
                  <th className="py-1 pr-2 text-right font-medium">$/M in · out</th>
                  <th className="py-1 pr-2 text-right font-medium">30d</th>
                  <th className="py-1 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {view.custom.map((m) => (
                  <tr key={m.id} className={m.archived ? "opacity-50" : ""}>
                    <td className="py-1.5 pr-2">
                      <div className="font-medium">{m.label} {m.isDefaultChat && <Sparkles className="inline h-3 w-3 text-primary" />}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{m.id}</div>
                    </td>
                    <td className="py-1.5 pr-2">
                      <div>{providerLabel(m.provider)}</div>
                      {m.baseUrl && <div className="max-w-[180px] truncate font-mono text-[10px] text-muted-foreground" title={m.baseUrl}>{m.baseUrl}</div>}
                    </td>
                    <td className="py-1.5 pr-2">{m.kind} · {m.tier}</td>
                    <td className="py-1.5 pr-2">{m.archived ? "archived" : m.enabledForChat ? <span className="text-emerald-600 dark:text-emerald-400">enabled</span> : "off"}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{m.chatCredits ?? <span className="text-muted-foreground">flat</span>}</td>
                    <td className="py-1.5 pr-2">{m.minPlan ? <PlanPill plan={m.minPlan} /> : <span className="text-muted-foreground">any</span>}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{m.inputPerMTok} · {m.outputPerMTok}{m.perImage ? ` · ${m.perImage}/img` : ""}{m.perVideoSecond ? ` · ${m.perVideoSecond}/s` : ""}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{fmtInt(m.calls30d)} · {fmtMicros(m.costMicros30d)}</td>
                    <td className="py-1.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon-xs" variant="ghost" title="Edit" onClick={() => setEditing(fromRow(m))}><Pencil className="h-3 w-3" /></Button>
                        {!m.archived && (
                          <Button size="icon-xs" variant="ghost" title="Archive" disabled={busy !== null} onClick={() => run(`archive-${m.id}`, () => archiveModelAction({ id: m.id }))}>
                            {busy === `archive-${m.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Rate card */}
      <Section title="Built-in rate card" description="List prices the meter uses for the shipped models, with the last 30 days of measured spend.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">Model</th>
                <th className="py-1 pr-2 font-medium">Used for</th>
                <th className="py-1 pr-2 text-right font-medium">$/M in</th>
                <th className="py-1 pr-2 text-right font-medium">$/M out</th>
                <th className="py-1 pr-2 text-right font-medium">Per unit</th>
                <th className="py-1 pr-2 text-right font-medium">Calls 30d</th>
                <th className="py-1 text-right font-medium">Cost 30d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {view.builtIn.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 pr-2 font-mono">{r.id}{r.id === view.builtInChatModelId && <span className="ml-1 text-[10px] text-primary">chat</span>}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{r.role}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.inputPerMTok}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.outputPerMTok}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{r.perImage ? `$${r.perImage}/img` : r.perVideoSecond ? `$${r.perVideoSecond}/s` : "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtInt(r.calls30d)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtMicros(r.costMicros30d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function ModelForm({
  value,
  onChange,
  busy,
  onSave,
  onCancel,
}: {
  value: AdminModelInput;
  onChange: (v: AdminModelInput) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);

  const spec = useMemo(() => providerSpec(value.provider), [value.provider]);
  const remote = spec.wire !== "vertex";
  const keyNames = useMemo(() => providerKeyNames(), []);
  const needsBaseUrl = remote && (spec.requiresBaseUrl === true || spec.baseUrl === "");
  const baseUrlMissing = needsBaseUrl && !(value.baseUrl ?? "").trim();

  const set = <K extends keyof AdminModelInput>(key: K, v: AdminModelInput[K]) => onChange({ ...value, [key]: v });

  /**
   * Switching provider invalidates the endpoint and the key that belonged to the
   * old one, so both drop back to "use this provider's default" rather than
   * silently pointing a Claude row at an OpenAI URL.
   */
  const pickProvider = (id: string) => {
    setTest(null);
    onChange({ ...value, provider: id, baseUrl: null, apiKeyRef: null });
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    const result = await testModelAction(value);
    setTesting(false);
    if (!result.success) return setTest({ ok: false, text: result.error });
    setTest(
      result.test.ok
        ? { ok: true, text: `Reached ${spec.label} in ${result.test.latencyMs} ms — replied "${result.test.reply}".` }
        : { ok: false, text: result.test.error }
    );
  };

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {node}
      {hint && <span className="block text-[10px] text-muted-foreground">{hint}</span>}
    </label>
  );

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      {/* Where the model lives. Everything below this row depends on it. */}
      <div className="grid gap-3 md:grid-cols-3">
        {field("Provider", (
          <select value={value.provider ?? "vertex"} onChange={(e) => pickProvider(e.target.value)} className={select}>
            {providersByGroup().map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        ), spec.hint)}
        {field("Model id", (
          <>
            <Input
              list={`provider-examples-${spec.id}`}
              value={value.id}
              onChange={(e) => set("id", e.target.value)}
              placeholder={spec.examples[0] || "model-id"}
              className="h-8 font-mono text-xs"
            />
            <datalist id={`provider-examples-${spec.id}`}>
              {spec.examples.map((ex) => (
                <option key={ex} value={ex} />
              ))}
            </datalist>
          </>
        ), "The exact id the provider accepts.")}
        {field("Label", <Input value={value.label} onChange={(e) => set("label", e.target.value)} placeholder="Claude Opus 5" className="h-8 text-xs" />, "What users see in the picker.")}

        {remote && (
          <>
            {field("Base URL", (
              <Input
                value={value.baseUrl ?? ""}
                onChange={(e) => set("baseUrl", e.target.value || null)}
                placeholder={spec.baseUrl || "https://your-endpoint/v1"}
                className={`h-8 font-mono text-xs ${baseUrlMissing ? "border-rose-500/60" : ""}`}
              />
            ), needsBaseUrl ? "Required — this provider has no default endpoint." : "Blank uses the provider default above.")}
            {field("API key", (
              <select value={value.apiKeyRef ?? ""} onChange={(e) => set("apiKeyRef", e.target.value || null)} className={select}>
                <option value="">{spec.keyName ? `${spec.keyName} (provider default)` : "provider default"}</option>
                {keyNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ), "Set the value itself on the Keys screen.")}
            {field("Max output tokens", <Input type="number" value={value.maxOutputTokens ?? ""} onChange={(e) => set("maxOutputTokens", num(e.target.value))} placeholder={spec.wire === "anthropic" ? "16384" : "provider default"} className="h-8 text-xs" />, spec.wire === "anthropic" ? "Anthropic requires a ceiling; blank uses 16384." : "Blank lets the provider decide.")}
          </>
        )}

        {field("Kind", (
          <select value={value.kind} onChange={(e) => set("kind", e.target.value as AdminModelInput["kind"])} className={select}>
            <option value="text">text</option><option value="image">image</option><option value="video">video</option><option value="embed">embed</option>
          </select>
        ), "Only text models are pickable in chat.")}
        {field("Context window", <Input type="number" value={value.contextWindow ?? ""} onChange={(e) => set("contextWindow", num(e.target.value))} placeholder="200000" className="h-8 text-xs" />, "Shown to users. Display only.")}
        {field("Tier", (
          <select value={value.tier} onChange={(e) => set("tier", e.target.value as AdminModelInput["tier"])} className={select}>
            <option value="frontier">frontier</option><option value="fast">fast</option><option value="legacy">legacy</option>
          </select>
        ))}
        <div className="md:col-span-3">
          {field("Blurb", <Textarea value={value.blurb ?? ""} onChange={(e) => set("blurb", e.target.value)} placeholder="One line shown next to the model in the picker." className="min-h-[50px] text-xs" />)}
        </div>
        {field("$ per 1M input tokens", <Input type="number" step="0.01" value={value.inputPerMTok ?? 0} onChange={(e) => set("inputPerMTok", Number(e.target.value) || 0)} className="h-8 text-xs" />)}
        {field("$ per 1M output tokens", <Input type="number" step="0.01" value={value.outputPerMTok ?? 0} onChange={(e) => set("outputPerMTok", Number(e.target.value) || 0)} className="h-8 text-xs" />)}
        {field("$ per 1M cached tokens", <Input type="number" step="0.001" value={value.cachedPerMTok ?? ""} onChange={(e) => set("cachedPerMTok", num(e.target.value))} className="h-8 text-xs" />)}
        {field("$ per image", <Input type="number" step="0.001" value={value.perImage ?? ""} onChange={(e) => set("perImage", num(e.target.value))} className="h-8 text-xs" />)}
        {field("$ per video second", <Input type="number" step="0.001" value={value.perVideoSecond ?? ""} onChange={(e) => set("perVideoSecond", num(e.target.value))} className="h-8 text-xs" />)}
        {field("Credits per chat turn", <Input type="number" value={value.chatCredits ?? ""} onChange={(e) => set("chatCredits", num(e.target.value))} placeholder="flat" className="h-8 text-xs" />, "Blank = the catalogue's flat chat price.")}
        {field("Minimum plan", (
          <select value={value.minPlan ?? ""} onChange={(e) => set("minPlan", (e.target.value || null) as AdminModelInput["minPlan"])} className={select}>
            <option value="">any plan with chat</option>
            {PLAN_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        ))}
        {field("Sort order", <Input type="number" value={value.sortOrder ?? 100} onChange={(e) => set("sortOrder", Number(e.target.value) || 100)} className="h-8 text-xs" />)}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.enabledForChat ?? false} onChange={(e) => set("enabledForChat", e.target.checked)} /> Enabled for chat</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.isDefaultChat ?? false} onChange={(e) => set("isDefaultChat", e.target.checked)} /> Default chat brain</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.supportsThinking ?? true} onChange={(e) => set("supportsThinking", e.target.checked)} /> Thinking</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.supportsTools ?? true} onChange={(e) => set("supportsTools", e.target.checked)} /> Tools</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.supportsVision ?? true} onChange={(e) => set("supportsVision", e.target.checked)} /> Vision</label>
      </div>
      {test && (
        <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${test.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" : "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400"}`}>
          {test.text}
        </div>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {remote && (
          <Button size="sm" variant="outline" disabled={testing || busy || !value.id.trim() || baseUrlMissing} onClick={runTest}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Test connection
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onCancel}><X className="h-3.5 w-3.5" /> Cancel</Button>
        <Button size="sm" disabled={busy || !value.id.trim() || !value.label.trim() || baseUrlMissing} onClick={onSave}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save model
        </Button>
      </div>
    </div>
  );
}

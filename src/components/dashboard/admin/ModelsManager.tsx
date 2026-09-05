"use client";

// ============================================================================
// MODELS MANAGER
//
// Everything about a model on one screen, because it is one decision:
//
//   Companies — pick the company (OpenAI, Anthropic, Grok, an OpenAI-compatible
//              endpoint of your own…) and only that company's connection fields
//              appear. The credential is typed in right here; it used to live on
//              a separate Keys screen, which meant adding a model and making it
//              work were two errands.
//   Catalogue — the rows the admin added, each saying which parts of the product
//              it runs. Ticking a job repoints it immediately.
//   Roles     — the same pointers as a flat list, for when it is easier to read
//              job-first than model-first.
//   Rate card — the list prices the meter uses, built-in and custom, with the
//              last 30 days of spend beside each so the cost is not abstract.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Check,
  ExternalLink,
  Loader2,
  Pencil,
  Plug,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdminModelRow, ModelsView } from "@/lib/admin/models";
import type { ManagedKeyStatus, ModelRoleKey } from "@/lib/admin/runtimeConfig";
import { MODEL_JOBS, modelJob, sectionsForRoles, type ModelKind } from "@/lib/admin/modelSections";
import { PLAN_TIERS } from "@/lib/billing/plans";
import {
  PROVIDER_GROUP_LABEL,
  providerKeyNames,
  providerLabel,
  providerNeeds,
  providerSpec,
  providersByGroup,
} from "@/lib/providers/registry";
import { archiveModelAction, setRoleModelAction, testModelAction, upsertModelAction, type AdminModelInput } from "@/actions/admin";
import { KeyRow } from "./KeyRow";
import { Empty, PlanPill, Section, fmtInt, fmtMicros } from "./primitives";

const select = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs dark:bg-input/30";

/**
 * The form's working copy, carrying the id the row had when it was opened.
 *
 * `upsertModelAction` treats a changed id as a rename — it moves the row, the role
 * pointers and the chat-default pointer onto the new id — but only if it is told what
 * the old one was. The form used to post the draft alone, so that whole path was
 * unreachable from the screen: editing a row's id created a second row and left the
 * original enabled in the picker under the old id. Keeping `originalId` inside the
 * draft rather than beside it means the two cannot drift apart.
 */
type ModelDraft = AdminModelInput & { originalId: string | null };

function blankModel(provider = "vertex"): ModelDraft {
  return {
    originalId: null,
    id: "",
    label: "",
    blurb: "",
    provider,
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
    serves: [],
    reassign: false,
  };
}

function fromRow(row: AdminModelRow): ModelDraft {
  return {
    originalId: row.id,
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
    // The jobs this row holds right now, so unticking one releases it instead of
    // leaving it pointed here.
    serves: [...row.serves],
    reassign: false,
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
  const [editing, setEditing] = useState<ModelDraft | null>(null);
  /** Set when the save was refused only because a job already belongs to someone else. */
  const [needsReassign, setNeedsReassign] = useState(false);
  const [rolePicks, setRolePicks] = useState<Record<string, string>>(
    Object.fromEntries(view.roles.map((r) => [r.role, r.pinnedTo ?? ""]))
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

  const openForm = (draft: ModelDraft) => {
    setError(null);
    setNeedsReassign(false);
    setEditing(draft);
  };

  const saveModel = async () => {
    if (!editing) return;
    setBusy("save");
    setError(null);
    const result = await upsertModelAction(editing);
    setBusy(null);
    if (result.success) {
      setEditing(null);
      setNeedsReassign(false);
      refresh();
      return;
    }
    setError(result.error || "That did not work.");
    // A refused takeover is not a mistake to correct, it is a decision to confirm.
    setNeedsReassign("needsReassign" in result && result.needsReassign === true);
  };

  // Every id the role dropdowns can offer: built-in rate-card rows plus custom rows.
  const knownIds = Array.from(
    new Set([...view.builtIn.map((b) => b.id), ...view.custom.filter((c) => !c.archived).map((c) => c.id)])
  ).sort();

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
          {error}
          {needsReassign && (
            <div className="mt-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  setEditing((d) => (d ? { ...d, reassign: true } : d));
                  // The draft update and the save are separate renders, so send the
                  // confirmed copy directly rather than reading stale state.
                  if (editing) {
                    setBusy("save");
                    setError(null);
                    void upsertModelAction({ ...editing, reassign: true }).then((result) => {
                      setBusy(null);
                      if (result.success) {
                        setEditing(null);
                        setNeedsReassign(false);
                        refresh();
                      } else setError(result.error || "That did not work.");
                    });
                  }
                }}
              >
                {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Yes, move it to this model
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Companies — connect once, then every model of that company works */}
      <ProviderConnections
        providerKeys={view.providerKeys}
        encryptionReady={view.encryptionReady}
        models={view.custom}
        onAddModel={(providerId) => openForm(blankModel(providerId))}
        formOpen={editing !== null}
      />

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
      <Section title="Model per job" description="The same assignments as the tick-boxes on each model, read job-first. Leave blank to use the deployment default (env var or code). Changes apply on the next request.">
        <div className="grid gap-2 md:grid-cols-2">
          {view.roles.map((r) => (
            <div key={r.role} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{r.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {modelJob(r.role)?.sections.length
                      ? `Used in ${modelJob(r.role)!.sections.join(", ")}`
                      : "Not wired to a user section yet"}
                  </div>
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
                  disabled={busy !== null || (rolePicks[r.role] ?? "") === (r.pinnedTo ?? "")}
                  onClick={() => run(`role-${r.role}`, () => setRoleModelAction({ role: r.role, modelId: (rolePicks[r.role] ?? "").trim() || null }))}
                >
                  {busy === `role-${r.role}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                {/* Only where there is a pointer to clear. Keyed off "overridden" this
                    button also appeared for a chat brain chosen by a catalogue flag,
                    where pressing it deleted nothing and changed nothing. */}
                {r.pinnedTo !== null && (
                  <Button size="sm" variant="ghost" title="Reset to default" disabled={busy !== null} onClick={() => run(`reset-${r.role}`, () => setRoleModelAction({ role: r.role, modelId: null }), () => setRolePicks((p) => ({ ...p, [r.role]: "" })))}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Running: <span className="font-mono">{r.current}</span>
                {r.overridden && <> · default <span className="font-mono">{r.fallback}</span></>}
              </div>
              {r.pinnedTo !== null && r.pinnedTo !== r.current && (
                <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-500">
                  Pinned to <span className="font-mono">{r.pinnedTo}</span>, but that is not an enabled text
                  model, so chat runs <span className="font-mono">{r.current}</span> instead.
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Custom catalogue */}
      <Section
        title="Custom models"
        description="Rows you add here. Tick the jobs a row should run and it takes them over on the next request; tick 'available in chat' and it also appears in the user's model picker with its own credit price."
        action={
          <Button size="sm" onClick={() => openForm(blankModel())} disabled={editing !== null}>
            <Plus className="h-3.5 w-3.5" /> Add model
          </Button>
        }
      >
        {editing && (
          <ModelForm
            value={editing}
            onChange={setEditing}
            busy={busy === "save"}
            providerKeys={view.providerKeys}
            encryptionReady={view.encryptionReady}
            models={view.custom}
            onCancel={() => {
              setEditing(null);
              setNeedsReassign(false);
              setError(null);
            }}
            onSave={saveModel}
          />
        )}

        {view.custom.length === 0 ? (
          <Empty>No custom models yet. The product runs on its built-in defaults.</Empty>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">Model</th>
                  <th className="py-1 pr-2 font-medium">Company</th>
                  <th className="py-1 pr-2 font-medium">Runs</th>
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
                    <td className="py-1.5 pr-2">
                      {m.serves.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex max-w-[240px] flex-wrap gap-1">
                          {m.serves.map((role) => (
                            <Badge key={role} variant="outline" className="text-[10px]" title={modelJob(role)?.label}>
                              {modelJob(role)?.label.split(/ — |,/)[0] ?? role}
                            </Badge>
                          ))}
                          <span className="w-full text-[10px] text-muted-foreground">
                            in {sectionsForRoles(m.serves).join(", ")}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">{m.kind} · {m.tier}</td>
                    <td className="py-1.5 pr-2">{m.archived ? "archived" : m.enabledForChat ? <span className="text-emerald-600 dark:text-emerald-400">enabled</span> : "off"}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{m.chatCredits ?? <span className="text-muted-foreground">flat</span>}</td>
                    <td className="py-1.5 pr-2">{m.minPlan ? <PlanPill plan={m.minPlan} /> : <span className="text-muted-foreground">any</span>}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{m.inputPerMTok} · {m.outputPerMTok}{m.perImage ? ` · ${m.perImage}/img` : ""}{m.perVideoSecond ? ` · ${m.perVideoSecond}/s` : ""}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{fmtInt(m.calls30d)} · {fmtMicros(m.costMicros30d)}</td>
                    <td className="py-1.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon-xs" variant="ghost" title="Edit" onClick={() => openForm(fromRow(m))}><Pencil className="h-3 w-3" /></Button>
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
      <Section title="Built-in rate card" description="The prices the meter charges for the shipped models, with the last 30 days of measured spend. A row marked repriced is being charged at a rate from your catalogue, not the shipped one.">
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
                  <td className="py-1.5 pr-2 font-mono">
                    {r.id}
                    {r.id === view.builtInChatModelId && <span className="ml-1 text-[10px] text-primary">chat</span>}
                    {r.overridden && <Badge variant="outline" className="ml-1.5 text-[10px] font-sans">repriced</Badge>}
                  </td>
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

/**
 * Pick a company, get that company's connection settings and nothing else.
 *
 * This used to live on a separate Keys screen, which made adding a model and making
 * it work two separate errands in two places — and the Keys screen listed all
 * seventeen credentials at once whether or not the deployment used them. Here the
 * dropdown is the filter: OpenAI shows a key box, an OpenAI-compatible endpoint
 * shows a key box and says the address goes on each model row, and the built-in
 * Google path says there is nothing to do.
 */
function ProviderConnections({
  providerKeys,
  encryptionReady,
  models,
  onAddModel,
  formOpen,
}: {
  providerKeys: ManagedKeyStatus[];
  encryptionReady: boolean;
  models: AdminModelRow[];
  onAddModel: (providerId: string) => void;
  formOpen: boolean;
}) {
  const [company, setCompany] = useState("openai");
  const spec = useMemo(() => providerSpec(company), [company]);
  const needs = useMemo(() => providerNeeds(company), [company]);
  const keyStatus = providerKeys.find((k) => k.name === spec.keyName) ?? null;

  const mine = models.filter((m) => m.provider === spec.id && !m.archived);
  /** Companies with a live credential, for the at-a-glance strip. */
  const connected = new Set(providerKeys.filter((k) => k.source !== "unset").map((k) => k.name));

  return (
    <Section
      title="AI companies"
      description="Choose a company and only its connection settings appear. Once it is connected, every model you add for that company uses the same credential."
    >
      <div className="flex flex-wrap gap-1.5">
        {providersByGroup().flatMap((g) =>
          g.items.map((p) => {
            const live = !p.keyName || connected.has(p.keyName);
            const count = models.filter((m) => m.provider === p.id && !m.archived).length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setCompany(p.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                  p.id === company
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`} />
                {p.label}
                {count > 0 && <span className="text-muted-foreground">{count}</span>}
              </button>
            );
          })
        )}
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_1fr]">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Company</span>
            <select value={company} onChange={(e) => setCompany(e.target.value)} className={select}>
              {providersByGroup().map((g) => (
                <optgroup key={g.group} label={PROVIDER_GROUP_LABEL[g.group]}>
                  {g.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="block text-[10px] text-muted-foreground">{spec.hint}</span>
          </label>

          <div className="space-y-2">
            {!needs.apiKey ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                Nothing to connect — this path uses the deployment&apos;s own Google credentials.
              </div>
            ) : keyStatus ? (
              <KeyRow
                spec={keyStatus}
                encryptionReady={encryptionReady}
                bare
                title={spec.keyLabel || `${spec.label} API key`}
                footer={
                  spec.docsUrl ? (
                    <a
                      href={spec.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      Get a key <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : null
                }
              />
            ) : (
              <div className="text-xs text-muted-foreground">This company has no managed credential.</div>
            )}

            {needs.baseUrl && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  This company has no fixed address, so each model you add for it needs its own base URL —
                  something like <span className="font-mono">{spec.baseUrlPlaceholder || "https://your-host/v1"}</span>.
                </span>
              </div>
            )}
            {needs.baseUrlOptional && (
              <div className="text-[11px] text-muted-foreground">
                Address: <span className="font-mono">{spec.baseUrl}</span>. A model row may override it — for a
                different region, or a proxy.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={formOpen} onClick={() => onAddModel(spec.id)}>
                <Plus className="h-3.5 w-3.5" /> Add a {spec.label} model
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {mine.length === 0
                  ? "No models from this company yet."
                  : `${mine.length} model${mine.length === 1 ? "" : "s"}: ${mine.map((m) => m.label).join(", ")}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/**
 * Which parts of the product a model runs, as tick-boxes.
 *
 * Two things it has to say out loud, because both used to be discovered the hard
 * way: a job powers several user sections at once (ticking the article writer also
 * rewires Content Studio and Lead Goal), and each job can only belong to one model,
 * so ticking one here takes it off whoever holds it now.
 */
function JobPicker({
  kind,
  serves,
  onToggle,
  holders,
  selfId,
}: {
  kind: ModelKind;
  serves: ModelRoleKey[];
  onToggle: (role: ModelRoleKey, on: boolean) => void;
  /** Job → the model id holding it right now, for the takeover warning. */
  holders: Map<ModelRoleKey, string>;
  selfId: string;
}) {
  const eligible = MODEL_JOBS.filter((j) => j.accepts.includes(kind));
  const picked = serves.filter((r) => eligible.some((j) => j.role === r));
  const touched = sectionsForRoles(picked);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-background/60 p-3 dark:border-slate-800">
      <div className="text-[11px] font-semibold">Where this model is used</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">
        Tick a job and this model starts doing it, everywhere in the user dashboard that job appears. Only{" "}
        {kind === "text" ? "text" : kind} jobs are listed, because that is what this row is.
      </div>

      {eligible.length === 0 ? (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Nothing in the product runs on a {kind} model yet.
        </div>
      ) : (
        <div className="mt-2 grid gap-1.5 md:grid-cols-2">
          {eligible.map((job) => {
            const on = serves.includes(job.role);
            const holder = holders.get(job.role);
            const stealing = on && holder && holder !== selfId;
            return (
              <label
                key={job.role}
                className={`flex cursor-pointer gap-2 rounded-md border px-2.5 py-2 text-[11px] ${
                  on ? "border-primary/50 bg-primary/5" : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <input type="checkbox" className="mt-0.5" checked={on} onChange={(e) => onToggle(job.role, e.target.checked)} />
                <span className="min-w-0">
                  <span className="block font-medium">{job.label}</span>
                  <span className="block text-[10px] text-muted-foreground">Shows up in {job.sections.join(", ")}</span>
                  {job.caveat && <span className="mt-0.5 block text-[10px] text-muted-foreground">{job.caveat}</span>}
                  {!on && holder && (
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      Currently on <span className="font-mono">{holder}</span>
                    </span>
                  )}
                  {stealing && (
                    <span className="mt-0.5 block text-[10px] text-amber-600 dark:text-amber-500">
                      Takes this job off <span className="font-mono">{holder}</span>
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {touched.length > 0 && (
        <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[10px] text-primary">
          Users will see this model in: {touched.join(", ")}.
        </div>
      )}
    </div>
  );
}

function ModelForm({
  value,
  onChange,
  busy,
  onSave,
  onCancel,
  providerKeys,
  encryptionReady,
  models,
}: {
  value: ModelDraft;
  onChange: (v: ModelDraft) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  providerKeys: ManagedKeyStatus[];
  encryptionReady: boolean;
  models: AdminModelRow[];
}) {
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);

  const spec = useMemo(() => providerSpec(value.provider), [value.provider]);
  const remote = spec.wire !== "vertex";
  const keyNames = useMemo(() => providerKeyNames(), []);
  const needsBaseUrl = remote && (spec.requiresBaseUrl === true || spec.baseUrl === "");
  const baseUrlMissing = needsBaseUrl && !(value.baseUrl ?? "").trim();

  /**
   * The credential this row will actually send, resolved the same way the gateway
   * resolves it — the row's override first, the company's own key otherwise. The
   * field below is for that exact key, so a row cannot be saved pointing at a name
   * whose value was never typed in.
   */
  const effectiveKeyName = (value.apiKeyRef || spec.keyName || "").trim();
  const keyStatus = providerKeys.find((k) => k.name === effectiveKeyName) ?? null;

  /**
   * Job → the model holding it now, so a tick-box can say whose work it is taking.
   * Derived from the rows on screen; the server re-reads it before writing, because
   * this copy is as old as the last refresh.
   */
  const holders = useMemo(() => {
    const map = new Map<ModelRoleKey, string>();
    for (const row of models) for (const role of row.serves) map.set(role, row.id);
    return map;
  }, [models]);

  const set = <K extends keyof ModelDraft>(key: K, v: ModelDraft[K]) => onChange({ ...value, [key]: v });

  /**
   * Ticking a job also has to satisfy that job's rules, so the two that the server
   * would refuse are handled here instead: the chat brain needs the row to be
   * pickable in chat, and dropping it has to release the default too.
   */
  const toggleJob = (role: ModelRoleKey, on: boolean) => {
    const next = new Set(value.serves ?? []);
    if (on) next.add(role);
    else next.delete(role);
    const serves = [...next];
    const chat = serves.includes("CHAT_CONTROLLER");
    onChange({
      ...value,
      serves,
      isDefaultChat: chat,
      enabledForChat: chat ? true : value.enabledForChat,
      reassign: false,
    });
  };

  /** An edit that changes the id is a rename. Say so before it is saved, not after. */
  const renaming = !!value.originalId && value.originalId !== value.id.trim();

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
        ), renaming ? `Renames ${value.originalId} — the row, its role assignments and the chat default all move with it.` : "The exact id the provider accepts.")}
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
                <option value="">{spec.keyName ? `${spec.keyName} (company default)` : "company default"}</option>
                {keyNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ), "Which stored credential this row sends. Type the value in just below.")}
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

      {/* The credential, right here, so adding a model and making it work is one errand. */}
      {remote && keyStatus && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-background/60 p-3 dark:border-slate-800">
          <KeyRow
            spec={keyStatus}
            encryptionReady={encryptionReady}
            bare
            title={`${spec.label} credential`}
            footer={
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span>Shared by every {spec.label} model, so it only needs typing once.</span>
                {spec.docsUrl && (
                  <a href={spec.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Get a key <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            }
          />
          {keyStatus.source === "unset" && (
            <div className="mt-2 flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Not connected yet. You can still save the row — it just cannot answer until the key is in.</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.enabledForChat ?? false} onChange={(e) => set("enabledForChat", e.target.checked)} /> Enabled for chat</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.supportsThinking ?? true} onChange={(e) => set("supportsThinking", e.target.checked)} /> Thinking</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.supportsTools ?? true} onChange={(e) => set("supportsTools", e.target.checked)} /> Tools</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.supportsVision ?? true} onChange={(e) => set("supportsVision", e.target.checked)} /> Vision</label>
      </div>

      {/* Which parts of the user dashboard this row runs. The chat brain lives in here
          too, so there is one control for it rather than a job list and a stray flag. */}
      <JobPicker
        kind={value.kind ?? "text"}
        serves={value.serves ?? []}
        onToggle={toggleJob}
        holders={holders}
        selfId={value.id.trim()}
      />
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

"use client";

// ============================================================================
// SETTINGS PANEL
//
// The controller's whole configuration surface, inside the chat tab: which brain
// runs, how deeply it thinks, what language it answers in, what it is allowed to
// do on its own, and how its memory behaves. Changes save immediately.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, Lock, X } from "lucide-react";
import { listChatModels, resolveChatModel } from "@/lib/agents/controller/models";
import { providerLabel } from "@/lib/providers/registry";
import type { ChatSettings } from "@/lib/agents/controller/settingsShape";
import { Row, Section, Segmented, Slider, Toggle } from "./SettingsControls";

/** What the server said about each model for this account: price and plan lock. */
export interface ModelAvailability {
  chatCredits?: number;
  locked?: boolean;
  minPlan?: string | null;
  /** Which model company serves it, for the row's second line. */
  provider?: string;
  /** Context size in tokens, shown next to the price. */
  contextWindow?: number;
}

interface SettingsPanelProps {
  settings: ChatSettings;
  saving: boolean;
  onChange: (patch: Partial<ChatSettings>) => void;
  onClose: () => void;
  /** Per-model availability keyed by id; undefined until the settings fetch lands. */
  availability?: Record<string, ModelAvailability>;
  /** False when the admin has pinned every chat to the default brain. */
  pickerEnabled?: boolean;
  /** What a turn costs on a model that sets no price of its own. */
  defaultCredits?: number;
  /** This account's plan, so a locked row can say what it needs. */
  plan?: string | null;
}

/** "128K" / "1M" — a context window a person can read at a glance. */
function fmtContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M ctx`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K ctx`;
  return `${tokens} ctx`;
}

export function SettingsPanel({
  settings,
  saving,
  onChange,
  onClose,
  availability = {},
  pickerEnabled = true,
  defaultCredits,
  plan,
}: SettingsPanelProps) {
  const [instructions, setInstructions] = useState(settings.customInstructions);
  const [instructionsSaved, setInstructionsSaved] = useState(false);
  const models = listChatModels();
  // The model the next turn will genuinely run on, resolved the same way the request
  // handler resolves it: a saved pick that the admin has since disabled, or one this
  // plan may not use, is not what will serve the turn. Read straight from the id, this
  // panel used to price and describe the stale pick while the composer below it was
  // about to run the default brain — and no row in the list showed as selected.
  const model = resolveChatModel(settings.model, (id) => availability[id]?.locked === true);
  const fallenBack = !!settings.model && settings.model !== model.id;
  // One model is still worth listing: the user asked to see what the turn costs,
  // and hiding the list also hides the price.
  const showPicker = pickerEnabled && models.length > 0;
  const savedRow = fallenBack ? models.find((m) => m.id === settings.model) : undefined;
  const savedLabel = savedRow?.label ?? settings.model;
  const savedLockedPlan = fallenBack ? availability[settings.model]?.minPlan : null;

  const priceOf = (id: string) => availability[id]?.chatCredits ?? defaultCredits;
  const activePrice = priceOf(model.id);
  const baseline = defaultCredits;
  // A model priced above the standard turn is the one thing a user can be
  // surprised by after the fact, so it gets said out loud rather than implied.
  const premium =
    typeof activePrice === "number" && typeof baseline === "number" && activePrice > baseline
      ? Math.round((activePrice / Math.max(1, baseline)) * 10) / 10
      : null;

  const saveInstructions = () => {
    onChange({ customInstructions: instructions });
    setInstructionsSaved(true);
    setTimeout(() => setInstructionsSaved(false), 1800);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b mkt-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold mkt-text">Controller settings</h2>
          {saving && <Loader2 className="h-3 w-3 animate-spin mkt-faint" />}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg mkt-faint transition-colors hover:mkt-bg2 hover:mkt-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Brain">
          <div>
            <div className="mb-2 text-[12.5px] font-medium mkt-text">Model</div>
            {fallenBack && (
              <div className="mb-2 flex items-start gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {savedLockedPlan
                    ? `${savedLabel} needs the ${savedLockedPlan} plan, so turns run on ${model.label} until you upgrade or pick another model.`
                    : `${savedLabel} is no longer available, so turns run on ${model.label}. Pick a model below to make it stick.`}
                </span>
              </div>
            )}
            {showPicker ? (
              <div className="space-y-1.5">
                {models.map((m) => {
                  const info = availability[m.id] ?? {};
                  const locked = info.locked === true;
                  const active = m.id === model.id;
                  const credits = priceOf(m.id);
                  const provider = info.provider || m.provider;
                  const needsPlan = info.minPlan || m.minPlan || "higher";
                  const className = `block w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-[color:var(--mkt-accent)]/50 mkt-bg2"
                      : "mkt-border hover:mkt-bg2"
                  } ${locked ? "opacity-70" : ""}`;
                  const body = (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-[color:var(--mkt-accent)]" : "bg-[color:var(--mkt-border)]"}`} />
                        <span className="truncate text-[12.5px] font-medium mkt-text">{m.label}</span>
                        {locked ? (
                          <span className="ml-auto flex shrink-0 items-center gap-1 rounded border mkt-border px-1 text-[9.5px] uppercase tracking-wide mkt-faint">
                            <Lock className="h-2.5 w-2.5" />
                            {needsPlan}
                          </span>
                        ) : (
                          <span className="ml-auto shrink-0 rounded border border-[color:var(--mkt-accent)]/30 px-1 text-[10.5px] tabular-nums mkt-accent-text">
                            {typeof credits === "number" ? `${credits} cr/turn` : "—"}
                          </span>
                        )}
                      </div>
                      {m.blurb && <p className="mt-1 text-[11.5px] leading-snug mkt-faint">{m.blurb}</p>}
                      {/* The line that answers "can I use this, and what will it cost me?" */}
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] leading-snug mkt-faint">
                        {provider && <span>{providerLabel(provider)}</span>}
                        {info.contextWindow ? <span>· {fmtContext(info.contextWindow)}</span> : null}
                        <span>
                          ·{" "}
                          {locked
                            ? `Needs the ${needsPlan} plan — see plans`
                            : typeof credits === "number"
                              ? `You can use this — each turn spends ${credits} credit${credits === 1 ? "" : "s"}`
                              : "You can use this"}
                        </span>
                      </p>
                    </>
                  );
                  // A locked row is a link to the plans, not a dead button. The user
                  // asked for the list to say "you can use this" — the corollary is that
                  // a row saying you cannot has to be the thing that changes it. As a
                  // `disabled` button it swallowed the click and left the lock icon as
                  // the only explanation, with the upgrade page nowhere in reach.
                  return locked ? (
                    <Link
                      key={m.id}
                      href="/dashboard/billing"
                      title={`${m.label} needs the ${needsPlan} plan`}
                      className={className}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button key={m.id} type="button" onClick={() => onChange({ model: m.id })} className={className}>
                      {body}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-[color:var(--mkt-accent)]/50 mkt-bg2 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--mkt-accent)]" />
                  <span className="truncate text-[12.5px] font-medium mkt-text">{model.label}</span>
                  <span className="ml-auto shrink-0 rounded border border-[color:var(--mkt-accent)]/40 px-1 text-[9.5px] uppercase tracking-wide mkt-accent-text">
                    running
                  </span>
                </div>
                <p className="mt-1 text-[11.5px] leading-snug mkt-faint">{model.blurb}</p>
              </div>
            )}
            <p className="mt-1.5 text-[11px] leading-snug mkt-faint">
              {showPicker
                ? `The brain plans and runs the work. A turn on ${model.label} costs ${
                    typeof activePrice === "number" ? `${activePrice} credit${activePrice === 1 ? "" : "s"}` : "the standard price"
                  }, and every extra tool round it needs is charged on top. Images and video are produced by their own dedicated models.`
                : "This is the only brain — it plans and runs the work. Images and video are produced by their own dedicated models when it calls them, so nothing here changes those."}
            </p>
            {premium && (
              <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {model.label} is a premium brain: {premium}× the standard turn price ({activePrice} credits instead of {baseline}).
                  Long conversations on it burn credits faster — switch to a cheaper model for routine work.
                </span>
              </div>
            )}
            {plan && (
              <p className="mt-1.5 text-[10.5px] mkt-faint">
                You are on the <span className="uppercase">{plan}</span> plan. Locked models need a higher one —{" "}
                <Link href="/dashboard/billing" className="underline hover:mkt-text">
                  see plans
                </Link>
                .
              </p>
            )}
          </div>

          <Row label="Creativity" hint="Low is precise and repeatable. High is more inventive.">
            <Slider
              value={settings.temperature}
              min={0}
              max={1.5}
              step={0.1}
              onChange={(temperature) => onChange({ temperature })}
              format={(v) => v.toFixed(1)}
            />
          </Row>

          <Row label="Max tool rounds" hint="How many times it may plan → act before stopping.">
            <Slider
              value={settings.maxToolLoops}
              min={1}
              max={24}
              step={1}
              onChange={(maxToolLoops) => onChange({ maxToolLoops })}
            />
          </Row>
        </Section>

        <Section title="Thinking">
          <Row label="Depth" hint="How much reasoning it does before answering.">
            <Segmented
              value={settings.thinkingLevel}
              onChange={(thinkingLevel) => onChange({ thinkingLevel })}
              options={[
                { value: "off", label: "off" },
                { value: "concise", label: "low" },
                { value: "balanced", label: "med" },
                { value: "deep", label: "deep" },
              ]}
            />
          </Row>

          <Row label="Show thinking" hint="Live streams it beside the answer as it happens.">
            <Segmented
              value={settings.thinkingDisplay}
              onChange={(thinkingDisplay) => onChange({ thinkingDisplay })}
              options={[
                { value: "live", label: "live" },
                { value: "collapsed", label: "folded" },
                { value: "hidden", label: "off" },
              ]}
            />
          </Row>

          <Row label="Stream the answer" hint="Off waits for the full reply, then shows it at once.">
            <Toggle checked={settings.streamTokens} onChange={(streamTokens) => onChange({ streamTokens })} />
          </Row>

          <Row label="Tool detail" hint="How much of each step's input and output to show.">
            <Segmented
              value={settings.toolVisibility}
              onChange={(toolVisibility) => onChange({ toolVisibility })}
              options={[
                { value: "all", label: "full" },
                { value: "compact", label: "brief" },
                { value: "failures", label: "errors" },
              ]}
            />
          </Row>
        </Section>

        <Section title="Voice">
          <Row label="Language" hint="Auto mirrors whatever you write in.">
            <select
              value={settings.replyLanguage}
              onChange={(e) => onChange({ replyLanguage: e.target.value as ChatSettings["replyLanguage"] })}
              className="cursor-pointer rounded-lg border mkt-border bg-transparent px-2 py-1 text-[11.5px] mkt-text outline-none"
            >
              <option value="auto" className="mkt-bg">Auto</option>
              <option value="english" className="mkt-bg">English</option>
              <option value="roman-urdu" className="mkt-bg">Roman Urdu</option>
              <option value="urdu" className="mkt-bg">اردو</option>
            </select>
          </Row>

          <Row label="Answer style" hint="Executive leads with the outcome. Detailed explains the reasoning.">
            <Segmented
              value={settings.replyStyle}
              onChange={(replyStyle) => onChange({ replyStyle })}
              options={[
                { value: "executive", label: "exec" },
                { value: "detailed", label: "full" },
                { value: "concise", label: "terse" },
              ]}
            />
          </Row>

          <Row label="Follow-up suggestions" hint="Offers the next action under each answer.">
            <Toggle
              checked={settings.showSuggestions}
              onChange={(showSuggestions) => onChange({ showSuggestions })}
            />
          </Row>

          <div>
            <div className="text-[12.5px] font-medium mkt-text">Standing instructions</div>
            <div className="mb-2 mt-0.5 text-[11.5px] leading-snug mkt-faint">
              Applied to every message in this workspace, above everything else.
            </div>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="e.g. Always write captions in Roman Urdu. Never mention discounts. Sign off as Team Postloom."
              className="w-full resize-y rounded-xl border mkt-border bg-transparent px-2.5 py-2 text-[12.5px] leading-relaxed mkt-text outline-none placeholder:mkt-faint focus:border-[color:var(--mkt-accent)]/60"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[10.5px] mkt-faint">{instructions.length}/4000</span>
              <button
                type="button"
                onClick={saveInstructions}
                disabled={instructions === settings.customInstructions}
                className="flex items-center gap-1 rounded-lg border mkt-border px-2 py-1 text-[11.5px] mkt-text transition-colors hover:border-[color:var(--mkt-accent)]/60 disabled:opacity-40"
              >
                {instructionsSaved ? <Check className="h-3 w-3" /> : null}
                {instructionsSaved ? "Saved" : "Save"}
              </button>
            </div>
          </div>
        </Section>

        <Section title="Autonomy">
          <Row label="Before it acts" hint="Confirm makes it stop and ask before publishing, deleting or pushing.">
            <Segmented
              value={settings.autonomy}
              onChange={(autonomy) => onChange({ autonomy })}
              options={[
                { value: "auto", label: "act" },
                { value: "confirm", label: "ask" },
              ]}
            />
          </Row>

          <Row label="Web research" hint="Search, SERP lookups and page reading.">
            <Toggle checked={settings.allowWebSearch} onChange={(allowWebSearch) => onChange({ allowWebSearch })} />
          </Row>

          <Row label="Image & video generation" hint="Turning it off also hides it from the tool list.">
            <Toggle checked={settings.allowMediaGen} onChange={(allowMediaGen) => onChange({ allowMediaGen })} />
          </Row>

          <Row label="Publishing & scheduling" hint="Approving, scheduling and pushing posts live.">
            <Toggle
              checked={settings.allowPublishing}
              onChange={(allowPublishing) => onChange({ allowPublishing })}
            />
          </Row>

          <Row label="Plugins & MCP servers" hint="GitHub, HeyGen and anything connected in the Plugin tab.">
            <Toggle checked={settings.allowPlugins} onChange={(allowPlugins) => onChange({ allowPlugins })} />
          </Row>

          <Row label="Open links automatically" hint="Jump straight to a tab when it creates something there.">
            <Toggle checked={settings.autoOpenLinks} onChange={(autoOpenLinks) => onChange({ autoOpenLinks })} />
          </Row>
        </Section>

        <Section title="Memory">
          <Row label="Use memory" hint="Recalls what it knows about you on every turn.">
            <Toggle checked={settings.memoryEnabled} onChange={(memoryEnabled) => onChange({ memoryEnabled })} />
          </Row>

          <Row label="Learn automatically" hint="Saves durable facts from your conversations without being asked.">
            <Toggle
              checked={settings.memoryAutoSave}
              disabled={!settings.memoryEnabled}
              onChange={(memoryAutoSave) => onChange({ memoryAutoSave })}
            />
          </Row>

          <Row label="Facts recalled per turn" hint="Pinned facts always load, on top of this.">
            <Slider
              value={settings.memoryRecallTopK}
              min={0}
              max={30}
              step={1}
              onChange={(memoryRecallTopK) => onChange({ memoryRecallTopK })}
            />
          </Row>
        </Section>
      </div>
    </div>
  );
}

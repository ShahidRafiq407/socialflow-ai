"use client";

/**
 * CONNECTING A HAND-CODED SITE — the guide, in the app
 *
 * A WordPress user pastes a URL and an application password and is done. Someone
 * whose site is Next.js, Astro or Laravel has to write the receiving end, and the
 * previous version of this guide told them to "add a POST route" — true, and
 * useless. Nothing said which file, where the secret goes, or why the check came
 * back 401.
 *
 * So this is per-framework and exact: the file path, the line that holds the
 * secret, a handler that already verifies the signature, the traps specific to
 * that stack, and every failure status mapped to its one cause.
 *
 * None of it is written twice. The paths, header names, event names and
 * tolerances all come from `customContract.ts` — the module the publisher signs
 * with — so the guide cannot describe a request we do not send.
 */

import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Code2, Copy, ShieldCheck } from "lucide-react";
import {
  CUSTOM_HANDLERS,
  CUSTOM_PING_BODY,
  CUSTOM_PUBLISH_BODY,
  CUSTOM_REQUEST_HEADERS,
  CUSTOM_RESPONSE_CONTRACT,
  CUSTOM_TROUBLESHOOTING,
  CUSTOM_VERIFY_FACTS,
  DEFAULT_HANDLER_ID,
  SECRET_GENERATOR_COMMANDS,
  SIGNATURE_HEADER,
  SIGNED_STRING_TEMPLATE,
  SIGNING_SECRET_ENV,
  TIMESTAMP_HEADER,
  getHandlerRecipe,
} from "@/lib/cms/customContract";

/** Copy button that confirms itself and goes quiet again. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard access can be refused; the code is on screen either way.
          setCopied(false);
        }
      }}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
    >
      {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function Block({ code, max = "max-h-80" }: { code: string; max?: string }) {
  return (
    <pre
      className={`${max} overflow-auto rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground`}
    >
      <code className="font-mono whitespace-pre">{code}</code>
    </pre>
  );
}

/** A path or an env line — the thing the user has to reproduce character for character. */
function PathChip({ value }: { value: string }) {
  return (
    <span className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/60 px-2 py-1 font-mono text-[11px] text-foreground">
        {value}
      </code>
      <CopyButton text={value} label="Copy" />
    </span>
  );
}

/** One numbered step. The number sits in its own column so the paths line up. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** A labelled code block with its own copy button. */
function Snippet({ title, code, action }: { title: string; code: string; action?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <CopyButton text={code} label={action || "Copy"} />
      </div>
      <Block code={code} max="max-h-64" />
    </div>
  );
}

export default function CustomSiteGuide() {
  const [open, setOpen] = useState(false);
  const [stackId, setStackId] = useState<string>(DEFAULT_HANDLER_ID);
  const recipe = getHandlerRecipe(stackId);

  return (
    <section className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Code2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
          Publishing to a hand-coded site
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            Exact file, exact line, per framework
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-border p-4">
          {/* The whole guide below re-renders for whichever stack is picked here. */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pick your stack
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_HANDLERS.map((handler) => (
                <button
                  key={handler.id}
                  type="button"
                  onClick={() => setStackId(handler.id)}
                  aria-pressed={handler.id === stackId}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    handler.id === stackId
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {handler.label}
                </button>
              ))}
            </div>
          </div>
          <ol className="space-y-4">
            <Step n={1} title="Create this file in your project">
              <PathChip value={recipe.file} />
              {recipe.fileAlt && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  If your project keeps code in a <code className="font-mono">src/</code> folder,
                  it goes at <code className="font-mono text-foreground">{recipe.fileAlt}</code>{" "}
                  instead.
                </p>
              )}
              {recipe.alsoTouches && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  The snippet also edits{" "}
                  <code className="font-mono text-foreground">{recipe.alsoTouches}</code>.
                </p>
              )}
            </Step>

            <Step n={2} title={`Add the secret to your environment as ${SIGNING_SECRET_ENV}`}>
              <PathChip value={recipe.envLine} />
              <p className="text-[11px] leading-snug text-muted-foreground">
                Goes in <span className="text-foreground">{recipe.envFile}</span>. Generate the
                value — do not invent one by hand:
              </p>
              <Block code={SECRET_GENERATOR_COMMANDS} max="max-h-24" />
            </Step>
            <Step n={3} title="Paste this in — it already checks the signature">
              <Snippet
                title={`${recipe.label} · ${recipe.file}`}
                code={recipe.code}
                action="Copy handler"
              />
              <ul className="space-y-1 pt-0.5">
                {recipe.notes.map((note) => (
                  <li
                    key={note}
                    className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground"
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] leading-snug text-muted-foreground">
                The only line you write yourself is the one marked{" "}
                <code className="font-mono text-foreground">your code</code> — save the article,
                then return the URL it now lives at. Deploy before the next step.
              </p>
            </Step>

            <Step n={4} title="Paste the live URL and the same secret into the connector above">
              <p className="text-[11px] leading-snug text-muted-foreground">
                <span className="text-foreground">Publish endpoint</span> is the full public URL of
                the route you just deployed — exact path, live domain, and the URL a redirect would
                have sent us to rather than the one that redirects.{" "}
                <span className="text-foreground">Signing secret</span> is the same string as{" "}
                <code className="font-mono text-foreground">{SIGNING_SECRET_ENV}</code>, character
                for character.
              </p>
            </Step>
            <Step n={5} title="Press Connect & verify — here is exactly what that sends">
              <ul className="space-y-1">
                {CUSTOM_VERIFY_FACTS.map((fact) => (
                  <li
                    key={fact}
                    className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground"
                  >
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </Step>
          </ol>

          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
              What lands on your route
            </p>
            <Snippet title="Headers — on every request" code={CUSTOM_REQUEST_HEADERS} />
            <Snippet title="Body — Check connection" code={CUSTOM_PING_BODY} />
            <Snippet title="Body — a real publish" code={CUSTOM_PUBLISH_BODY} />
            <Snippet title="What you send back" code={CUSTOM_RESPONSE_CONTRACT} />
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              If the check fails, it is one of these
            </p>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {CUSTOM_TROUBLESHOOTING.map((row) => (
                <li key={row.symptom} className="flex flex-col gap-1 p-2.5 sm:flex-row sm:gap-3">
                  <code className="w-fit shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground sm:w-44">
                    {row.symptom}
                  </code>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="text-foreground">{row.cause}</span> {row.fix}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] leading-snug text-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              Verify the signature before you trust the body. The endpoint is public, so anyone who
              guesses the URL can post to it. What proves a request came from your workspace is the
              HMAC in <code className="font-mono">{SIGNATURE_HEADER}</code>, taken over{" "}
              <code className="font-mono">{SIGNED_STRING_TEMPLATE}</code> — the{" "}
              <code className="font-mono">{TIMESTAMP_HEADER}</code> value, a dot, then the raw body.
              Hash the raw bytes: parsing and re-serialising the JSON changes them and the signature
              will not match.
            </span>
          </p>
        </div>
      )}
    </section>
  );
}

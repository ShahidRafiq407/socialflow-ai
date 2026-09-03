"use client";

/**
 * THE CODED-SITE SETUP, PICKED RATHER THAN GUESSED
 *
 * The connector is language-agnostic — it POSTs signed JSON to a URL — but the
 * user's next three questions never are: which file, where does the secret go on
 * my host, and why did the check fail. A single Next.js example answers those for
 * one person in twenty and quietly implies everyone else is unsupported.
 *
 * So: pick the language, pick the framework, pick the host, and every instruction
 * below is rewritten for that combination. "My stack is not listed" is a real
 * option — it renders the contract as eight numbered steps, which is all anything
 * that speaks HTTP needs.
 *
 * Rendered in two places, deliberately the same component: inside the connect
 * dialog (`variant="modal"`) so the answer is where the form is, and in the guide
 * under the directory (`variant="page"`) with the wire format beside it.
 */

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, Terminal } from "lucide-react";
import {
  CUSTOM_VERIFY_FACTS,
  SECRET_GENERATOR_COMMANDS,
  SIGNING_SECRET_ENV,
} from "@/lib/cms/customContract";
import {
  CUSTOM_CURL_SELFTEST,
  CUSTOM_HOSTS,
  CUSTOM_LANGUAGES,
  DEFAULT_HANDLER_ID,
  DEFAULT_HOST_ID,
  DEFAULT_LANGUAGE,
  getHandlerRecipe,
  getHostGuide,
  handlersForLanguage,
} from "@/lib/cms/customStacks";

/** Copy button that confirms itself and goes quiet again. */
export function CopyButton({ text, label }: { text: string; label: string }) {
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
          // Clipboard access can be refused; the text is on screen either way.
          setCopied(false);
        }
      }}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Copied" : label}
    </button>
  );
}

/** A scrollable code block. Long handlers get their own scroll, not the dialog's. */
export function CodeBlock({ code, max = "max-h-72" }: { code: string; max?: string }) {
  return (
    <pre
      className={`${max} overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200`}
    >
      <code className="whitespace-pre font-mono">{code}</code>
    </pre>
  );
}

/** The thing the user has to reproduce character for character, with its copy button. */
function PathChip({ value }: { value: string }) {
  return (
    <span className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100">
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
      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** The traps for this stack or host — the lines that stop a 401 happening twice. */
function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li
          key={item}
          className="flex gap-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A labelled dropdown. Three of these decide everything else on screen. */
function Picker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="relative block">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  );
}
export default function CustomSiteSetup({
  variant = "page",
}: {
  /** "modal" drops the heading — the dialog already has one — and tightens the padding. */
  variant?: "modal" | "page";
}) {
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [stackId, setStackId] = useState<string>(DEFAULT_HANDLER_ID);
  const [hostId, setHostId] = useState<string>(DEFAULT_HOST_ID);
  const [testOpen, setTestOpen] = useState(false);

  const stacks = useMemo(() => handlersForLanguage(language), [language]);

  // Derived, not synced: changing the language immediately falls back to that
  // language's first framework, so the two dropdowns can never disagree with the
  // handler shown underneath them.
  const activeId = stacks.some((s) => s.id === stackId) ? stackId : stacks[0]?.id || DEFAULT_HANDLER_ID;
  const recipe = getHandlerRecipe(activeId);
  const host = getHostGuide(hostId);
  const isAny = recipe.id === "any";

  return (
    <div className={variant === "modal" ? "space-y-3" : "space-y-4"}>
      {/* The three answers everything below is rewritten for. */}
      <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900/40">
        <Picker
          label="Language"
          value={language}
          onChange={(value) => {
            setLanguage(value);
            setStackId(handlersForLanguage(value)[0]?.id || DEFAULT_HANDLER_ID);
          }}
          options={CUSTOM_LANGUAGES.map((l) => ({ value: l, label: l }))}
        />
        <Picker
          label="Framework"
          value={activeId}
          onChange={setStackId}
          options={stacks.map((s) => ({ value: s.id, label: s.label }))}
        />
        <Picker
          label="Hosted on"
          value={hostId}
          onChange={setHostId}
          options={CUSTOM_HOSTS.map((h) => ({ value: h.id, label: h.label }))}
        />
      </div>
      <ol className="space-y-4">
        <Step n={1} title={isAny ? "Add one POST route to your app" : "Create this file in your project"}>
          <PathChip value={recipe.file} />
          {recipe.fileAlt && (
            <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              If your project keeps code in a <code className="font-mono">src/</code> folder, it goes
              at{" "}
              <code className="font-mono text-slate-800 dark:text-slate-200">{recipe.fileAlt}</code>{" "}
              instead.
            </p>
          )}
          {recipe.alsoTouches && (
            <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              The snippet also edits{" "}
              <code className="font-mono text-slate-800 dark:text-slate-200">
                {recipe.alsoTouches}
              </code>
              .
            </p>
          )}
        </Step>

        <Step n={2} title={`Put the secret in ${SIGNING_SECRET_ENV} — on ${host.label}`}>
          <PathChip value={recipe.envLine} />
          <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Generate the value, do not invent one:
          </p>
          <CodeBlock code={SECRET_GENERATOR_COMMANDS} max="max-h-20" />
          <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {host.label} — exactly where
            </p>
            <p className="text-[11px] leading-snug text-slate-700 dark:text-slate-300">
              {host.where}
            </p>
            <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Then, to make it live:
              </span>{" "}
              {host.after}
            </p>
            <Warnings items={host.notes || []} />
          </div>
          <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            In local development it goes in{" "}
            <span className="text-slate-800 dark:text-slate-200">{recipe.envFile}</span>, and your
            code reads it with{" "}
            <code className="font-mono text-slate-800 dark:text-slate-200">{recipe.envRead}</code>.
          </p>
        </Step>
        <Step n={3} title="Paste this in — it already verifies the signature">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {recipe.label} · {recipe.file}
            </p>
            <CopyButton text={recipe.code} label={isAny ? "Copy steps" : "Copy handler"} />
          </div>
          <CodeBlock code={recipe.code} max="max-h-80" />
          <Warnings items={recipe.notes} />
          {!isAny && (
            <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              The only line you write yourself is the one marked{" "}
              <code className="font-mono text-slate-800 dark:text-slate-200">your code</code> — save
              the article, then return the URL it now lives at. Deploy before the next step.
            </p>
          )}
        </Step>
        <Step n={4} title="Prove it works before the app is involved">
          <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            This sends the same signed ping we send, from your machine. A 2xx here means the route is
            done, whatever your stack is.
          </p>
          <button
            type="button"
            onClick={() => setTestOpen((v) => !v)}
            aria-expanded={testOpen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Terminal className="h-3 w-3" />
            {testOpen ? "Hide the curl self-test" : "Show the curl self-test"}
            <ChevronDown className={`h-3 w-3 transition-transform ${testOpen ? "rotate-180" : ""}`} />
          </button>
          {testOpen && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-end">
                <CopyButton text={CUSTOM_CURL_SELFTEST} label="Copy test" />
              </div>
              <CodeBlock code={CUSTOM_CURL_SELFTEST} max="max-h-72" />
            </div>
          )}
        </Step>

        <Step
          n={5}
          title={`Paste this URL and the same secret ${
            variant === "modal" ? "into the fields below" : "into the connector"
          }`}
        >
          <PathChip value={recipe.endpoint} />
          <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Your live domain and the exact path of the route you deployed — and the URL a redirect
            would have sent us to, rather than the one that redirects.{" "}
            <span className="text-slate-800 dark:text-slate-200">Signing secret</span> is the same
            string as{" "}
            <code className="font-mono text-slate-800 dark:text-slate-200">
              {SIGNING_SECRET_ENV}
            </code>
            , character for character.
          </p>
        </Step>

        <Step n={6} title="Press Connect & verify — this is all it sends">
          <ul className="space-y-1">
            {CUSTOM_VERIFY_FACTS.map((fact) => (
              <li
                key={fact}
                className="flex gap-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400"
              >
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        </Step>
      </ol>
    </div>
  );
}


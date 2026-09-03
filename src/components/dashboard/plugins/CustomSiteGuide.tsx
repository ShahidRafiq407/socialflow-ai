"use client";

/**
 * CONNECTING A HAND-CODED SITE — the guide, in the app
 *
 * A WordPress user pastes a URL and an application password and is done. Someone
 * whose site is Next.js, Astro or Laravel has to write the receiving end, and
 * until now the only instructions were a block of help text under a form field.
 *
 * This is that documentation, with the two things help text cannot give: a handler
 * they can copy whole, and the signature check written out so they do not have to
 * infer it from a sentence. Nothing here is generated — the request shape and the
 * header names come from `customContract.ts`, the same module the publisher signs
 * with, so the guide cannot describe a request we do not send.
 */

import { useState } from "react";
import { Check, ChevronDown, Code2, Copy, ShieldCheck } from "lucide-react";
import {
  CUSTOM_HANDLER_EXAMPLE,
  CUSTOM_TARGET_CONTRACT,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/cms/customContract";

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
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
    >
      {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function Block({ code }: { code: string }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
      <code className="font-mono whitespace-pre">{code}</code>
    </pre>
  );
}

export default function CustomSiteGuide() {
  const [open, setOpen] = useState(false);

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
            Next.js · Astro · Laravel · anything with a route
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <ol className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">1.</span> Add a route to your site
              that accepts POST — anything public, e.g.{" "}
              <code className="font-mono text-[11px] text-foreground">/api/publish</code>.
            </li>
            <li>
              <span className="font-semibold text-foreground">2.</span> Invent a long random
              signing secret and put it in your site&apos;s environment.
            </li>
            <li>
              <span className="font-semibold text-foreground">3.</span> Paste the same URL and
              secret into the <span className="text-foreground">Custom / coded site</span>{" "}
              connector above.
            </li>
            <li>
              <span className="font-semibold text-foreground">4.</span> Press{" "}
              <span className="text-foreground">Check connection</span>. We send{" "}
              <code className="font-mono text-[11px] text-foreground">
                {'{ "event": "ping" }'}
              </code>{" "}
              and your route only has to answer 2xx.
            </li>
          </ol>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                What your route receives
              </p>
              <CopyButton text={CUSTOM_TARGET_CONTRACT} label="Copy" />
            </div>
            <Block code={CUSTOM_TARGET_CONTRACT} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                A handler you can paste
              </p>
              <CopyButton text={CUSTOM_HANDLER_EXAMPLE} label="Copy handler" />
            </div>
            <Block code={CUSTOM_HANDLER_EXAMPLE} />
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] leading-snug text-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              Verify the signature before you trust the body. The endpoint is public, so anyone
              who guesses the URL can post to it. What proves a request came from your workspace
              is the HMAC in <code className="font-mono">{SIGNATURE_HEADER}</code>, taken over the{" "}
              <code className="font-mono">{TIMESTAMP_HEADER}</code> value, a dot, then the raw
              body. Hash the raw bytes — parsing and re-serialising the JSON changes them and the
              signature will not match.
            </span>
          </p>
        </div>
      )}
    </section>
  );
}

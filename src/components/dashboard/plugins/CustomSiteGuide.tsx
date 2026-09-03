"use client";

/**
 * CONNECTING A HAND-CODED SITE — the guide, in the app
 *
 * A WordPress user pastes a URL and an application password and is done. Someone
 * whose site is hand-built has to write the receiving end, and telling them to
 * "add a POST route" is true and useless — it never says which file, where the
 * secret goes on their host, or why the check came back 401.
 *
 * The exact answer is per-stack, so it is picked, not assumed: `CustomSiteSetup`
 * holds the language / framework / host dropdowns and rewrites every step for
 * that combination. This file is the frame around it — the wire format, and every
 * failure status mapped to its one cause.
 *
 * None of it is written twice. Paths, header names, event names and tolerances all
 * come from `customContract.ts`, the module the publisher signs with, so the guide
 * cannot describe a request we do not send.
 */

import { useState } from "react";
import { ChevronDown, Code2, ShieldCheck } from "lucide-react";
import {
  CUSTOM_PING_BODY,
  CUSTOM_PUBLISH_BODY,
  CUSTOM_REQUEST_HEADERS,
  CUSTOM_RESPONSE_CONTRACT,
  CUSTOM_TROUBLESHOOTING,
  SIGNATURE_HEADER,
  SIGNED_STRING_TEMPLATE,
  TIMESTAMP_HEADER,
} from "@/lib/cms/customContract";
import CustomSiteSetup, { CodeBlock, CopyButton } from "./CustomSiteSetup";

/** A labelled code block with its own copy button. */
function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <CopyButton text={code} label="Copy" />
      </div>
      <CodeBlock code={code} max="max-h-64" />
    </div>
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
            Any language, any host — pick yours
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
          <p className="text-[11px] leading-snug text-muted-foreground">
            Your site does not have to be JavaScript, and it does not have to be on Vercel. Pick the
            three below and every path, env line and command changes to match. If your stack is not
            in the list, choose{" "}
            <span className="text-foreground">Any other language → My stack is not listed</span> —
            it is the same contract written as eight steps, which is all anything that speaks HTTP
            needs.
          </p>

          <CustomSiteSetup variant="page" />
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
              What lands on your route — identical for every stack above
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


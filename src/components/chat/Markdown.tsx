"use client";

// ============================================================================
// MARKDOWN
//
// The message renderer. Deliberately typographic rather than decorative: the
// answer should read like a well-set document, with code, tables and diagrams
// treated as first-class blocks.
// ============================================================================

import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { MermaidDiagram } from "./MermaidDiagram";

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => undefined
    );
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border mkt-border">
      <div className="flex items-center justify-between border-b mkt-border mkt-bg2 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide mkt-muted">{language || "code"}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] mkt-muted transition-colors hover:mkt-text"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[12.5px] leading-[1.7]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

interface MarkdownProps {
  children: string;
  /** Tighter type scale for thinking traces and tool output. */
  compact?: boolean;
}

export const Markdown = memo(function Markdown({ children, compact }: MarkdownProps) {
  return (
    <div
      className={
        compact
          ? "text-[12.5px] leading-[1.75] mkt-muted [&>*+*]:mt-2 [&_p]:my-0"
          : "text-[14.5px] leading-[1.75] mkt-text"
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children: c }) => <p className={compact ? "" : "my-3 first:mt-0 last:mb-0"}>{c}</p>,
          h1: ({ children: c }) => (
            <h1 className="mt-5 mb-2 text-[19px] font-semibold tracking-tight first:mt-0">{c}</h1>
          ),
          h2: ({ children: c }) => (
            <h2 className="mt-5 mb-2 text-[17px] font-semibold tracking-tight first:mt-0">{c}</h2>
          ),
          h3: ({ children: c }) => (
            <h3 className="mt-4 mb-1.5 text-[15px] font-semibold tracking-tight first:mt-0">{c}</h3>
          ),
          ul: ({ children: c }) => <ul className="my-3 list-disc space-y-1 pl-5">{c}</ul>,
          ol: ({ children: c }) => <ol className="my-3 list-decimal space-y-1 pl-5">{c}</ol>,
          li: ({ children: c }) => <li className="leading-[1.7] [&>p]:my-0">{c}</li>,
          a: ({ href, children: c }) => (
            <a
              href={href}
              target={href?.startsWith("/") ? undefined : "_blank"}
              rel="noopener noreferrer"
              className="mkt-accent-text underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              {c}
            </a>
          ),
          blockquote: ({ children: c }) => (
            <blockquote className="my-3 border-l-2 border-l-[color:var(--mkt-accent)]/50 pl-3 italic mkt-muted">
              {c}
            </blockquote>
          ),
          hr: () => <hr className="my-5 border-0 border-t mkt-border" />,
          strong: ({ children: c }) => <strong className="font-semibold mkt-text">{c}</strong>,
          table: ({ children: c }) => (
            <div className="my-3 overflow-x-auto rounded-xl border mkt-border">
              <table className="w-full border-collapse text-[13px]">{c}</table>
            </div>
          ),
          thead: ({ children: c }) => <thead className="mkt-bg2">{c}</thead>,
          th: ({ children: c }) => (
            <th className="border-b mkt-border px-3 py-2 text-left font-semibold">{c}</th>
          ),
          td: ({ children: c }) => <td className="border-b mkt-border px-3 py-2 align-top">{c}</td>,
          code: ({ className, children: c, ...rest }) => {
            const match = /language-(\w+)/.exec(className || "");
            const raw = String(c).replace(/\n$/, "");

            // Inline code has no language class and no newlines.
            if (!match && !raw.includes("\n")) {
              return (
                <code
                  className="rounded-[5px] border mkt-border mkt-bg2 px-[5px] py-[1.5px] font-mono text-[0.86em]"
                  {...rest}
                >
                  {c}
                </code>
              );
            }

            if (match?.[1] === "mermaid") return <MermaidDiagram code={raw} />;
            return <CodeBlock language={match?.[1] || ""} code={raw} />;
          },
          pre: ({ children: c }) => <>{c as ReactNode}</>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});

"use client";

// ============================================================================
// MERMAID DIAGRAM
//
// Renders a ```mermaid fence as a real diagram. Mermaid is imported lazily on
// first use so it never lands in the initial bundle, and a syntax error falls
// back to the source instead of blanking the message.
// ============================================================================

import { useEffect, useRef, useState } from "react";

let mermaidReady: Promise<any> | null = null;

function loadMermaid(dark: boolean): Promise<any> {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: dark ? "dark" : "default",
        fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui",
        themeVariables: dark
          ? { primaryColor: "#1c2a22", primaryTextColor: "#e8f0ea", lineColor: "#3db36b" }
          : { primaryColor: "#eef6f1", primaryTextColor: "#0f1c14", lineColor: "#18713c" },
      });
      return mermaid;
    });
  }
  return mermaidReady;
}

let diagramSeq = 0;

export function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mmd-${(diagramSeq += 1)}`);

  useEffect(() => {
    let cancelled = false;
    const dark = typeof document !== "undefined" && !document.documentElement.classList.contains("light");

    loadMermaid(dark)
      .then((mermaid) => mermaid.render(idRef.current, code))
      .then(({ svg: rendered }: { svg: string }) => {
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) {
    return (
      <div className="my-3 overflow-hidden rounded-xl border mkt-border">
        <div className="flex items-center justify-between px-3 py-1.5 text-[11px] mkt-bg2 mkt-muted">
          <span>mermaid — could not render, showing source</span>
        </div>
        <pre className="overflow-x-auto p-3 text-[12.5px] leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-3 flex h-24 items-center justify-center rounded-xl border mkt-border mkt-bg2 text-xs mkt-muted">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="mermaid-diagram my-3 overflow-x-auto rounded-xl border mkt-border mkt-bg2 p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      // Mermaid output is generated from the model's own diagram source and
      // sanitised by mermaid's strict security level before it reaches here.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

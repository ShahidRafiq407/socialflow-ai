"use client";

// ============================================================================
// ARTIFACT CARDS
//
// The payoff of a turn: the generated image playing in the thread, the video, and
// the button that opens the exact object in its own tab. Every card here came
// from a real tool result, so clicking one always lands somewhere that exists.
// ============================================================================

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Calendar,
  Download,
  ExternalLink,
  FileText,
  Globe,
  ImageIcon,
  Link2,
  Send,
  Video,
} from "lucide-react";
import type { Artifact } from "@/lib/agents/controller/types";

const KIND_ICON = {
  image: ImageIcon,
  video: Video,
  link: Link2,
  post: FileText,
  file: FileText,
  publish: Send,
  plan: Calendar,
  data: Globe,
} as const;

function OpenButton({ artifact }: { artifact: Artifact }) {
  if (!artifact.href) return null;
  const external = !artifact.href.startsWith("/");
  const label = artifact.hrefLabel || (external ? "Open" : "Open in tab");

  const className =
    "inline-flex items-center gap-1.5 rounded-lg border mkt-border mkt-bg2 px-2.5 py-1.5 text-[12px] font-medium mkt-text transition-colors hover:border-[color:var(--mkt-accent)]/60 hover:mkt-accent-text";

  if (external) {
    return (
      <a href={artifact.href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <Link href={artifact.href} className={className}>
      {label}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

function MediaFrame({ artifact }: { artifact: Artifact }) {
  const [broken, setBroken] = useState(false);
  if (!artifact.url || broken) return null;

  if (artifact.kind === "video") {
    return (
      <video
        src={artifact.url}
        controls
        playsInline
        preload="metadata"
        onError={() => setBroken(true)}
        className="max-h-[420px] w-full bg-black object-contain"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={artifact.url}
      alt={artifact.title}
      loading="lazy"
      onError={() => setBroken(true)}
      className="max-h-[460px] w-full object-contain mkt-bg2"
    />
  );
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const Icon = KIND_ICON[artifact.kind] || Link2;
  const hasMedia = (artifact.kind === "image" || artifact.kind === "video") && !!artifact.url;
  const metaEntries = Object.entries(artifact.meta || {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== false && v !== ""
  );

  return (
    <div className="overflow-hidden rounded-xl border mkt-border mkt-surface">
      {hasMedia && <MediaFrame artifact={artifact} />}

      <div className="flex items-start gap-3 p-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mkt-bg2 mkt-accent-text">
          <Icon className="h-3.5 w-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium mkt-text">{artifact.title}</div>
          {artifact.subtitle && <div className="truncate text-[12px] mkt-muted">{artifact.subtitle}</div>}

          {metaEntries.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {metaEntries.slice(0, 4).map(([key, value]) => (
                <span
                  key={key}
                  className="rounded-md border mkt-border px-1.5 py-0.5 text-[10.5px] mkt-faint"
                >
                  {key}
                  {value === true ? "" : `: ${String(value).slice(0, 40)}`}
                </span>
              ))}
            </div>
          )}

          {artifact.body && (
            <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed mkt-muted">{artifact.body}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {artifact.url && hasMedia && (
            <a
              href={artifact.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              title="Download"
              className="flex h-7 w-7 items-center justify-center rounded-lg border mkt-border mkt-muted transition-colors hover:mkt-text"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
          <OpenButton artifact={artifact} />
        </div>
      </div>
    </div>
  );
}

export function ArtifactCards({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) return null;

  return (
    <div className="my-3 space-y-2.5">
      {artifacts.map((artifact) => (
        <ArtifactCard key={artifact.id} artifact={artifact} />
      ))}
    </div>
  );
}

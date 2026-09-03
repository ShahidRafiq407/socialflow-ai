"use client";

/**
 * BRAND MARKS FOR THE PLUGIN DIRECTORY
 *
 * The directory is a list of logos, so the logos have to be real — a letter in a
 * grey square is what it looked like before and it read as unfinished. There are
 * no brand files in `public/`, and adding remote <img> tags would mean the grid
 * flickers in and renders differently for anyone with a blocker, so every mark is
 * inline SVG: no requests, no layout shift, correct in both themes.
 *
 * Where a mark is published as a single path (GitHub, Microsoft, Hugging Face) it
 * is drawn exactly. Where it is not, the mark is the brand's own colour with a
 * clean glyph rather than a wrong trace of the real artwork — at a 32px tile the
 * colour is what identifies the row anyway.
 *
 * Each component draws inside a 24×24 box and takes its size from `className`,
 * so the same mark serves the installed strip, the rows and the dialogs.
 */

import type { FC } from "react";
import type { PluginLogoId } from "@/lib/plugins/catalog";

type MarkProps = { className?: string };

function GithubMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#181717"
        d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.4 1.24-3.24-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.24a11.5 11.5 0 0 1 6 0c2.29-1.56 3.3-1.24 3.3-1.24.66 1.65.25 2.87.12 3.17.77.84 1.24 1.92 1.24 3.24 0 4.63-2.8 5.65-5.48 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58A11.99 11.99 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z"
      />
    </svg>
  );
}

function WooCommerceMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#7F54B3"
        d="M2.7 3h18.6A2.7 2.7 0 0 1 24 5.7v8.4a2.7 2.7 0 0 1-2.7 2.7h-6l1 4.2-6.7-4.2H2.7A2.7 2.7 0 0 1 0 14.1V5.7A2.7 2.7 0 0 1 2.7 3Z"
      />
      <path
        d="M3.6 7.2 5.7 13l1.9-4.3L9.5 13l1.9-4.3L13.3 13l2.1-5.8"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="9.6" r="1.5" fill="#fff" />
    </svg>
  );
}

function ShopifyMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#95BF47"
        d="M8.4 4.3h7.2a1.6 1.6 0 0 1 1.6 1.4l1.4 13.6a1.6 1.6 0 0 1-1.6 1.8H7a1.6 1.6 0 0 1-1.6-1.8L6.8 5.7a1.6 1.6 0 0 1 1.6-1.4Z"
      />
      <path
        fill="#5E8E3E"
        d="M15.6 4.3a1.6 1.6 0 0 1 1.6 1.4l1.4 13.6a1.6 1.6 0 0 1-1.6 1.8h-2.6V4.3Z"
      />
      <path
        d="M9.3 3.9a2.7 2.7 0 0 1 5.4 0v2"
        fill="none"
        stroke="#5E8E3E"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13.7 9.6a3 3 0 0 0-1.7-.5c-1 0-1.6.5-1.6 1.2 0 1.4 2.6 1.5 2.6 3.3 0 1.5-1.1 2.5-2.6 2.5a3.6 3.6 0 0 1-2.1-.7"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CanvaMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pluginCanva" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00C4CC" />
          <stop offset="100%" stopColor="#7D2AE8" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#pluginCanva)" />
      <path
        d="M15.4 9.1a3.7 3.7 0 0 0-2.8-1.2c-2.5 0-4.3 2.1-4.3 4.6 0 2 1.3 3.6 3.4 3.6 1.6 0 2.9-.9 3.6-2.2"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HeyGenMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#0B0B12" />
      <path
        d="M8.4 7v10M15.6 7v10M8.4 12h7.2"
        fill="none"
        stroke="#fff"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GmailMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#fff"
        d="M4 5.5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"
      />
      <path fill="#EA4335" d="M2.5 6 12 12.9 21.5 6A2 2 0 0 0 20 5.5H4A2 2 0 0 0 2.5 6Z" />
      <path fill="#34A853" d="M2 8.9 5.9 11.7v6.8H4a2 2 0 0 1-2-2V8.9Z" />
      <path fill="#4285F4" d="M22 8.9 18.1 11.7v6.8H20a2 2 0 0 0 2-2V8.9Z" />
    </svg>
  );
}

function WordPressMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#21759B" />
      <path
        d="M5.9 7.6 9.4 17l2.6-6.4L14.6 17l3.5-9.4"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GoogleDriveMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#FFBA00" d="M12 3 4.6 16.4H12V3Z" />
      <path fill="#00AC47" d="M12 3v13.4h7.4L12 3Z" />
      <path fill="#0066DA" d="M4.6 16.4h14.8L22 21H2l2.6-4.6Z" />
    </svg>
  );
}

function CodeMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#0F172A" />
      <path
        d="M9.4 8.6 6.2 12l3.2 3.4M14.6 8.6 17.8 12l-3.2 3.4M12.9 7.6l-1.8 8.8"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TagMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4F46E5"
        d="M11.3 2.3a2 2 0 0 1 1.4.6l8.4 8.4a2 2 0 0 1 0 2.8l-7 7a2 2 0 0 1-2.8 0l-8.4-8.4a2 2 0 0 1-.6-1.4V4.3a2 2 0 0 1 2-2h7Z"
      />
      <circle cx="7.6" cy="7.6" r="1.9" fill="#fff" />
    </svg>
  );
}

function McpMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 8.4V5.6M12 8.4 7.4 14M12 8.4 16.6 14"
        fill="none"
        stroke="#7C3AED"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="4.2" r="2.4" fill="#7C3AED" />
      <circle cx="6.2" cy="16" r="2.4" fill="#7C3AED" />
      <circle cx="17.8" cy="16" r="2.4" fill="#7C3AED" />
      <circle cx="12" cy="10.4" r="2.1" fill="#C4B5FD" />
    </svg>
  );
}

function HuggingFaceMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.4" fill="#FFD21E" />
      <circle cx="8.9" cy="10.4" r="1.3" fill="#3A3B45" />
      <circle cx="15.1" cy="10.4" r="1.3" fill="#3A3B45" />
      <path
        d="M8 14.2a4.6 4.6 0 0 0 8 0"
        fill="none"
        stroke="#3A3B45"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicrosoftMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="8.4" height="8.4" fill="#F25022" />
      <rect x="13.1" y="2.5" width="8.4" height="8.4" fill="#7FBA00" />
      <rect x="2.5" y="13.1" width="8.4" height="8.4" fill="#00A4EF" />
      <rect x="13.1" y="13.1" width="8.4" height="8.4" fill="#FFB900" />
    </svg>
  );
}

function ZapierMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.6v18.8M2.6 12h18.8M5.4 5.4l13.2 13.2M18.6 5.4 5.4 18.6"
        fill="none"
        stroke="#FF4F00"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StripeMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#635BFF" />
      <path
        d="M14.9 9.3a4.6 4.6 0 0 0-2.5-.7c-1.2 0-1.9.5-1.9 1.2 0 1.6 4 1.4 4 4.1 0 1.7-1.4 2.8-3.4 2.8a6 6 0 0 1-2.8-.7"
        fill="none"
        stroke="#fff"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MARKS: Record<PluginLogoId, FC<MarkProps>> = {
  github: GithubMark,
  wordpress: WordPressMark,
  woocommerce: WooCommerceMark,
  shopify: ShopifyMark,
  canva: CanvaMark,
  heygen: HeyGenMark,
  gmail: GmailMark,
  gdrive: GoogleDriveMark,
  code: CodeMark,
  tag: TagMark,
  mcp: McpMark,
  huggingface: HuggingFaceMark,
  microsoft: MicrosoftMark,
  zapier: ZapierMark,
  stripe: StripeMark,
};

/** The bare mark. Size it with `className`, e.g. `h-5 w-5`. */
export function PluginLogo({ id, className }: { id: PluginLogoId; className?: string }) {
  const Mark = MARKS[id] ?? CodeMark;
  return <Mark className={className} />;
}

const TILE = {
  sm: { box: "h-8 w-8 rounded-[10px]", mark: "h-[18px] w-[18px]" },
  md: { box: "h-10 w-10 rounded-xl", mark: "h-6 w-6" },
  lg: { box: "h-12 w-12 rounded-2xl", mark: "h-7 w-7" },
} as const;

/**
 * The rounded-square plate the directory is built out of. It is deliberately
 * light in both themes: these are brand colours, and they only read correctly
 * against white.
 */
export function PluginLogoTile({
  id,
  size = "md",
  className = "",
}: {
  id: PluginLogoId;
  size?: keyof typeof TILE;
  className?: string;
}) {
  const t = TILE[size];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-white ring-1 ring-black/[0.07] ${t.box} ${className}`}
    >
      <PluginLogo id={id} className={t.mark} />
    </span>
  );
}

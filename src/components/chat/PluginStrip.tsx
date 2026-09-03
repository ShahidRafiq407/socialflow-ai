"use client";

// ============================================================================
// CONNECTED PLUGINS, IN THE COMPOSER
//
// A connection made in the Plugins tab is invisible until it is used, and the
// user should not have to remember which ones they set up. So the composer shows
// them: one tap drops `@Gmail` into the message, and the controller already has
// the same list in its system prompt, so the mention resolves to real tools.
//
// A single scrollable line rather than a grid — this sits above the input and
// must never push the thread around as more plugins get connected.
// ============================================================================

import type { ConnectedPlugin } from "@/lib/plugins/connected";
import { PluginLogo } from "@/components/dashboard/plugins/BrandLogos";

export function PluginStrip({
  plugins,
  onInsert,
}: {
  plugins: ConnectedPlugin[];
  onInsert: (plugin: ConnectedPlugin) => void;
}) {
  if (plugins.length === 0) return null;

  return (
    <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="shrink-0 pr-0.5 text-[11px] mkt-faint">Connected</span>
      {plugins.map((plugin) => (
        <button
          key={plugin.key}
          type="button"
          onClick={() => onInsert(plugin)}
          title={
            plugin.can.length > 0
              ? `${plugin.hint} — ${plugin.can.join(", ")}`
              : plugin.hint
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border mkt-border mkt-surface pl-1 pr-2.5 py-1 text-[11.5px] mkt-muted transition-colors hover:border-[color:var(--mkt-accent)] hover:mkt-text"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.07]">
            <PluginLogo id={plugin.logo} className="h-3 w-3" />
          </span>
          {plugin.name}
        </button>
      ))}
    </div>
  );
}

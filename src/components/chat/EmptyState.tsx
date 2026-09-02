"use client";

// ============================================================================
// EMPTY STATE
//
// The first thing a user sees in a new chat. It exists to answer one question —
// "what can I actually ask this thing?" — so every card is a real, runnable
// instruction that exercises a different part of the project.
//
// Clicking a card RUNS it. Nothing is dropped into the composer for the user to
// press send on: a card that only fills in text is a card that has to be read,
// edited and confirmed before anything happens. Which means every prompt here
// has to stand on its own, with no attachment and no follow-up needed to start.
// ============================================================================

import { Boxes, FolderGit2, ImagePlus, Radar, Send, Sparkles } from "lucide-react";

interface EmptyStateProps {
  workspaceName: string;
  /** Runs the prompt immediately. */
  onRun: (text: string) => void;
  /** A turn is already in flight, so a card must not start a second one. */
  busy?: boolean;
}

const STARTERS: { icon: typeof Sparkles; title: string; prompt: string }[] = [
  {
    icon: ImagePlus,
    title: "Make an Instagram post",
    prompt:
      "Generate an Instagram feed post for my brand in AI Studio — write the caption and hashtags, generate the image, and give me the link to open it.",
  },
  {
    icon: Boxes,
    title: "Plan a whole week",
    prompt:
      "Build me a 7-day content plan across Instagram, LinkedIn and X, put it on the content board, and schedule everything at the best times.",
  },
  {
    icon: FolderGit2,
    title: "Document a project",
    prompt:
      "I want a project documented: tell me exactly what to attach, then write a proper README with a mermaid architecture diagram, organise the repo on GitHub, and turn it into a launch post I can publish.",
  },
  {
    icon: Radar,
    title: "Check the competition",
    prompt:
      "Research my top 3 competitors' social presence this month, tell me what is working for them, and turn the findings into posts I can approve.",
  },
];

export function EmptyState({ workspaceName, onRun, busy }: EmptyStateProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center px-5 py-10">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 mkt-accent-text" />
          <span className="text-[11px] font-semibold uppercase tracking-wider mkt-faint">
            Automate task
          </span>
        </div>

        <h2 className="mt-3 text-[26px] font-semibold leading-tight mkt-text">
          Tell me what to do for {workspaceName}.
        </h2>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed mkt-muted">
          I can run every tab in this project for you — write and generate posts, publish and
          schedule them, research, analyse whatever you upload, and use the tools you connected in
          Plugins. Ask in English or Roman Urdu. I remember what you tell me.
        </p>

        <div className="mt-7 grid gap-2 sm:grid-cols-2">
          {STARTERS.map((starter) => (
            <button
              key={starter.title}
              type="button"
              disabled={busy}
              onClick={() => onRun(starter.prompt)}
              title="Runs straight away"
              className="group flex flex-col gap-1.5 rounded-2xl border mkt-border px-3.5 py-3 text-left transition-colors hover:border-[color:var(--mkt-accent)]/60 hover:mkt-bg2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <starter.icon className="h-3.5 w-3.5 shrink-0 mkt-accent-text" />
                <span className="text-[12.5px] font-medium mkt-text">{starter.title}</span>
                <Send className="ml-auto h-3 w-3 shrink-0 opacity-0 transition-opacity mkt-faint group-hover:opacity-100" />
              </span>
              <span className="line-clamp-3 text-[11.5px] leading-snug mkt-faint">
                {starter.prompt}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-3 text-[11px] mkt-faint">Click any of these and I start on it right away.</p>
      </div>
    </div>
  );
}

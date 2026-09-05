import type { ModelRoleKey } from "./runtimeConfig";

// ============================================================================
// WHERE A MODEL IS USED
//
// The back office asks one question about every model it stores: which parts of
// the product should run on it. This file is the answer key.
//
// A "job" is one thing the product asks a model to do. Each job is stored in
// exactly one place — `ai.model.<ROLE>` — and read back through the `MODELS`
// getters, so ticking a job here is the same write the "Model per role" panel
// makes. There is no second copy of this on `AiModel`, deliberately: two stores
// could disagree, and the pointer is the one the product actually reads at
// request time.
//
// `sections` names the sidebar tabs a job really powers, which matters because
// most jobs power several. Ticking "Article generator" also changes Lead Goal;
// the admin should be told that on screen rather than discover it later.
//
// Client-safe: the only import is a type, which the compiler erases.
// ============================================================================

export type ModelKind = "text" | "image" | "video" | "embed";

export interface ModelJob {
  /** Where the choice is stored — the `ai.model.<ROLE>` setting key. */
  role: ModelRoleKey;
  /** What the job does, in the words the admin reads. */
  label: string;
  /** The user-facing dashboard tabs this job powers. */
  sections: string[];
  /** Model kinds allowed to take the job. Anything else is refused on save. */
  accepts: ModelKind[];
  /** A caveat worth stating on screen before the admin ticks the box. */
  caveat?: string;
}

/**
 * Every job an admin can point at a model, in the order the form shows them.
 * Chat-picker membership is NOT here: it is stored on `AiModel.enabledForChat`
 * (many models at once, which no single pointer can express) and edited by its
 * own checkbox.
 */
export const MODEL_JOBS: ModelJob[] = [
  {
    role: "CHAT_CONTROLLER",
    label: "The assistant's brain — talks to the user and runs the tools",
    sections: ["Automate Task"],
    accepts: ["text"],
    caveat: "Only a model that is available in chat can take this.",
  },
  {
    role: "CONTENT_CREATOR",
    label: "Writes the posts and captions",
    sections: ["Content Studio", "Lead Goal", "Automate Task", "Article Writer"],
    accepts: ["text"],
  },
  {
    role: "VISUALIZER",
    label: "Draws the images and carousel slides",
    sections: ["Content Studio", "Automate Task", "Lead Goal", "Article Writer"],
    accepts: ["image"],
  },
  {
    role: "VIDEO",
    label: "Makes the videos and reels",
    sections: ["Content Studio", "Automate Task", "Lead Goal"],
    accepts: ["video"],
  },
  {
    role: "ARTICLE_GENERATOR",
    label: "Writes long articles and suggests topics",
    sections: ["Article Writer", "Lead Goal"],
    accepts: ["text"],
    caveat: "Quick mode and topic ideas. Deep mode runs on the planner and the writer instead.",
  },
  {
    role: "TREND_RESEARCHER",
    label: "Searches the live web for trends",
    sections: ["Content Studio", "Lead Goal", "Article Writer"],
    accepts: ["text"],
    caveat: "Needs a model that can search the web, or it answers from memory only.",
  },
  {
    role: "COMPETITOR_ANALYST",
    label: "Studies rival brands",
    sections: ["Content Studio", "Lead Goal"],
    accepts: ["text"],
  },
  {
    role: "CEO_SUPERVISOR",
    label: "Approves the plan and grades the result",
    sections: ["Content Studio", "Lead Goal"],
    accepts: ["text"],
  },
  {
    role: "ORCHESTRATOR",
    label: "Breaks a big request into steps",
    sections: ["Automate Task", "Lead Goal", "Article Writer"],
    accepts: ["text"],
  },
  {
    role: "CHAT_UTILITY",
    label: "Background chores — chat titles, summaries, suggestions",
    sections: ["Automate Task", "Article Writer"],
    accepts: ["text"],
    caveat: "Runs on every turn, so a cheap model belongs here.",
  },
  {
    role: "SLIDE_REGENERATOR",
    label: "Rewrites a single carousel slide",
    sections: ["Content Studio"],
    accepts: ["text"],
  },
  {
    role: "EMBEDDING",
    label: "The assistant's long-term memory",
    sections: ["Automate Task"],
    accepts: ["embed"],
    caveat:
      "Memories are stored as 768-number vectors. A model with a different width is dropped, and memories written by the old one stay in the old space.",
  },
];

const JOB_BY_ROLE = new Map(MODEL_JOBS.map((j) => [j.role, j]));

export function modelJob(role: string): ModelJob | undefined {
  return JOB_BY_ROLE.get(role as ModelRoleKey);
}

/** Roles a model of this kind is allowed to take. */
export function jobsForKind(kind: string): ModelJob[] {
  return MODEL_JOBS.filter((j) => j.accepts.includes((kind || "text") as ModelKind));
}

/** True when a model of `kind` may hold `role`. */
export function jobAcceptsKind(role: string, kind: string): boolean {
  const job = JOB_BY_ROLE.get(role as ModelRoleKey);
  if (!job) return false;
  return job.accepts.includes((kind || "text") as ModelKind);
}

/** Every dashboard tab any job powers, for the "used in" summary line. */
export function sectionsForRoles(roles: string[]): string[] {
  const out = new Set<string>();
  for (const role of roles) {
    const job = JOB_BY_ROLE.get(role as ModelRoleKey);
    if (job) for (const s of job.sections) out.add(s);
  }
  return Array.from(out);
}

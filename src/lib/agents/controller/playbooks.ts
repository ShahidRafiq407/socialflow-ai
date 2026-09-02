// ============================================================================
// CONTROLLER PLAYBOOKS — procedural memory of tool sequences that worked
//
// Facts remember WHAT is true about a workspace. Playbooks remember HOW a task
// was carried out. When a turn finishes cleanly after chaining several tools,
// the ordered sequence of tools that worked is captured as a "playbook"; next
// time a similar request arrives, the closest playbook is injected into the
// prompt as a starting recipe. Recurring tasks then get faster and more
// reliable because the model starts from its own proven procedure instead of
// re-planning from scratch every time.
//
// Pure module — no prisma, no clock, no I/O. It only turns a turn's tool runs
// into a compact recipe and renders stored recipes for the prompt; the DB read
// and write live in ./memory (loadPlaybooks / savePlaybook), so all of this
// stays unit-testable in the node vitest env.
// ============================================================================

/** The Memory-table category playbooks are stored under. */
export const PLAYBOOK_CATEGORY = "playbook";

/**
 * Tools that are pure bookkeeping, not part of a reusable task recipe: the
 * memory meta-tools and the "I can't do this" logger. They are dropped from
 * both the stored sequence and the worthiness count, so a turn that only
 * remembered something or only logged a limitation never becomes a playbook.
 */
export const PLAYBOOK_NOISE_TOOLS = new Set<string>([
  "remember",
  "recall",
  "list_memories",
  "report_limitation",
]);

/** A recipe needs at least this many distinct real tools to be worth keeping. */
export const MIN_PLAYBOOK_TOOLS = 2;
/** A recipe longer than this is capped — the shape transfers, not the length. */
export const MAX_PLAYBOOK_STEPS = 12;
const MAX_TASK_CHARS = 200;

/** Minimal structural view of a tool run — matches ToolRun without importing it. */
export interface PlaybookToolRun {
  name: string;
  phase: string;
}

/**
 * The ordered tool sequence a turn actually completed: successful runs only,
 * bookkeeping tools removed, consecutive repeats collapsed (a per-platform loop
 * that called generate_image three times is one "generate_image" in the recipe
 * — the shape is what transfers, not the repetition), capped for length.
 */
export function extractSequence(runs: PlaybookToolRun[]): string[] {
  const out: string[] = [];
  for (const run of runs || []) {
    if (!run || run.phase !== "done") continue;
    const name = (run.name || "").trim();
    if (!name || PLAYBOOK_NOISE_TOOLS.has(name)) continue;
    if (out.length > 0 && out[out.length - 1] === name) continue; // collapse consecutive
    out.push(name);
    if (out.length >= MAX_PLAYBOOK_STEPS) break;
  }
  return out;
}

/** Number of distinct tools in a sequence. */
export function distinctToolCount(sequence: string[]): number {
  return new Set(sequence).size;
}

/**
 * A turn is worth capturing when it completed a genuine multi-tool procedure:
 * at least MIN_PLAYBOOK_TOOLS *distinct* real tools succeeded. A single tool,
 * or a turn that only did memory bookkeeping, is not a playbook.
 */
export function isPlaybookWorthy(runs: PlaybookToolRun[]): boolean {
  return distinctToolCount(extractSequence(runs)) >= MIN_PLAYBOOK_TOOLS;
}

/** Renders a sequence as "a → b → c". */
export function formatSequence(sequence: string[]): string {
  return sequence.join(" → ");
}

/**
 * Builds the stored playbook content. Task first so it dominates the embedding
 * (recall matches on task similarity), the proven steps second. Returns "" when
 * there is nothing worth storing.
 */
export function buildPlaybookContent(task: string, sequence: string[]): string {
  const cleanTask = (task || "").replace(/\s+/g, " ").trim().slice(0, MAX_TASK_CHARS);
  if (!cleanTask || distinctToolCount(sequence) < MIN_PLAYBOOK_TOOLS) return "";
  return `Task: ${cleanTask}\nSteps: ${formatSequence(sequence)}`;
}

export interface ParsedPlaybook {
  task: string;
  steps: string[];
}

/** Parses stored content back into task + steps, or null if it isn't a playbook. */
export function parsePlaybook(content: string): ParsedPlaybook | null {
  const text = (content || "").trim();
  if (!text.startsWith("Task:")) return null;

  const nl = text.indexOf("\n");
  const taskLine = nl === -1 ? text : text.slice(0, nl);
  const rest = nl === -1 ? "" : text.slice(nl + 1);

  const task = taskLine.slice("Task:".length).trim();
  const stepsLine = rest.trim();
  const stepsRaw = stepsLine.startsWith("Steps:") ? stepsLine.slice("Steps:".length) : "";
  const steps = stepsRaw
    .split("→")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!task || steps.length === 0) return null;
  return { task, steps };
}

/**
 * Renders matched playbooks for the system prompt. Returns "" when none parse,
 * so the caller omits the whole section rather than announce an empty one — the
 * model is never told it has a recipe it doesn't.
 */
export function formatPlaybooksForPrompt(playbooks: { content: string }[]): string {
  const lines: string[] = [];
  for (const pb of playbooks || []) {
    const parsed = parsePlaybook(pb?.content || "");
    if (!parsed) continue;
    lines.push(`- ${parsed.task}\n  Worked before: ${formatSequence(parsed.steps)}`);
  }
  return lines.join("\n");
}

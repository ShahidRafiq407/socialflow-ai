/**
 * WHICH MODEL, DECIDED IN ONE PLACE
 *
 * No stage in this pipeline names a model. A stage says what kind of thinking it
 * needs — reasoning, writing, research, something fast and cheap, vision — and
 * this file resolves that to an id. Two reasons it works that way: the twenty-three
 * stages would otherwise each have to be edited when a model is retired, and a
 * stage that names a model quietly becomes a stage that is expensive for no
 * reason anybody wrote down.
 *
 * Every capability can be overridden by an environment variable, so a deployment
 * can move the whole pipeline onto different models without a code change. The
 * fallbacks come from the shared `MODELS` map, so the Article Writer cannot drift
 * onto a model the rest of the product has stopped using.
 *
 * Server-only: it reaches the Vertex provider.
 */

import { MODELS, vertexProvider } from "@/lib/agents/llm";

/**
 * What a stage asks for.
 *
 * - `fast`      — classification, extraction, tidying. Cheap, called often.
 * - `reasoning` — judgement: intent, gaps, opportunity, scoring, the gates.
 * - `writing`   — prose a person will read.
 * - `research`  — grounded search, where the citations are the point.
 * - `vision`    — images.
 */
export type ModelCapability = "fast" | "reasoning" | "writing" | "research" | "vision";

interface CapabilitySpec {
  /** Deployment override. Set this to move a capability without touching code. */
  env: string;
  /** The shared default for this kind of work. */
  fallback: string;
  /** Where this kind of work sits between literal and loose. */
  temperature: number;
}

const CAPABILITIES: Record<ModelCapability, CapabilitySpec> = {
  fast: { env: "MODEL_ARTICLE_FAST", fallback: MODELS.CHAT_UTILITY, temperature: 0.2 },
  reasoning: { env: "MODEL_ARTICLE_REASONING", fallback: MODELS.ORCHESTRATOR, temperature: 0.3 },
  writing: { env: "MODEL_ARTICLE_WRITING", fallback: MODELS.CONTENT_CREATOR, temperature: 0.6 },
  research: { env: "MODEL_ARTICLE_RESEARCH", fallback: MODELS.TREND_RESEARCHER, temperature: 0.3 },
  vision: { env: "MODEL_ARTICLE_VISION", fallback: MODELS.VISUALIZER, temperature: 0.4 },
};
/** The model id this capability resolves to right now. */
export function resolveModel(capability: ModelCapability): string {
  const spec = CAPABILITIES[capability];
  const override = process.env[spec.env];
  return (typeof override === "string" && override.trim()) || spec.fallback;
}

/**
 * Counts what a stage spent, so the number the user is shown is a count and not
 * an estimate. One meter per stage; the store writes it to the row.
 */
export interface ModelMeter {
  calls: number;
  /** Every model this stage actually used, in order, for the run's own log. */
  models: string[];
}

export function newMeter(): ModelMeter {
  return { calls: 0, models: [] };
}

function record(meter: ModelMeter | undefined, model: string): void {
  if (!meter) return;
  meter.calls += 1;
  meter.models.push(model);
}

export interface AskOptions {
  system?: string;
  prompt: string;
  /** Overrides the capability's own setting, for a stage that needs it stricter. */
  temperature?: number;
  meter?: ModelMeter;
  signal?: AbortSignal;
}

/** Thrown when a model answered, but not with the shape the stage requires. */
export class ModelShapeError extends Error {
  constructor(stage: string, detail: string) {
    super(`${stage}: ${detail}`);
    this.name = "ModelShapeError";
  }
}
function messages(options: AskOptions): { role: string; content: string }[] {
  const out: { role: string; content: string }[] = [];
  if (options.system) out.push({ role: "system", content: options.system });
  out.push({ role: "user", content: options.prompt });
  return out;
}

/** Prose. Returns the text as the model wrote it, trimmed and nothing else. */
export async function askText(
  capability: ModelCapability,
  options: AskOptions
): Promise<string> {
  const model = resolveModel(capability);
  record(options.meter, model);
  const text = await vertexProvider.generateText(messages(options), {
    modelName: model,
    temperature: options.temperature ?? CAPABILITIES[capability].temperature,
  });
  return String(text ?? "").trim();
}

/**
 * JSON, validated by the caller.
 *
 * `parse` returns null when the payload is not what the stage needs, and this
 * throws — because the alternative is a stage that carries on with a half-empty
 * object and a later stage that reports its guesses as findings.
 */
export async function askJson<T>(
  capability: ModelCapability,
  stage: string,
  options: AskOptions,
  parse: (value: unknown) => T | null
): Promise<T> {
  const model = resolveModel(capability);
  record(options.meter, model);
  const result = await vertexProvider.generateJSONWithThoughts(messages(options), {
    modelName: model,
    temperature: options.temperature ?? 0.1,
    signal: options.signal,
  });
  const parsed = parse(result?.data);
  if (parsed === null || parsed === undefined) {
    throw new ModelShapeError(stage, "the model did not return the shape this stage needs.");
  }
  return parsed;
}
export interface GroundedSource {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Grounded search, with the sources it actually used.
 *
 * The sources come back from the grounding metadata, not from the model's prose,
 * which is the whole point: a URL the model typed into a sentence is a claim, a
 * URL in the grounding metadata is a document it was given. The research stage
 * stores these, and the evidence gate goes and fetches them.
 */
export async function askGrounded(
  capability: ModelCapability,
  options: AskOptions
): Promise<{ text: string; sources: GroundedSource[]; searchQueries: string[] }> {
  const model = resolveModel(capability);
  record(options.meter, model);
  const prompt = options.system ? `${options.system}\n\n${options.prompt}` : options.prompt;
  const result = await vertexProvider.generateGroundedWithThoughts(prompt, {
    modelName: model,
    temperature: options.temperature ?? CAPABILITIES[capability].temperature,
    signal: options.signal,
  });
  const sources: GroundedSource[] = (result?.sources || [])
    .filter((source) => typeof source?.url === "string" && /^https?:\/\//i.test(source.url))
    .map((source) => ({
      title: String(source.title || "").trim(),
      url: source.url,
      snippet: String(source.snippet || "").trim(),
    }));
  return {
    text: String(result?.text ?? "").trim(),
    sources,
    searchQueries: Array.isArray(result?.searchQueries) ? result.searchQueries.map(String) : [],
  };
}


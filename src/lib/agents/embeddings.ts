import { vertexProvider } from "./llm";

/**
 * Thin wrappers, and deliberately not billing boundaries.
 *
 * There is no `requireAction` here and no catalogue row for an embedding. Both
 * reasons matter: `VertexAIProvider.embed` already records a `UsageEvent` per
 * string against whatever meter context it runs inside, and `text-embedding-004`
 * is priced in `modelPricing.ts`, so the spend is measured and attributed rather
 * than invisible. And every caller — `agents/memory.ts` and
 * `controller/memory.ts` — runs inside a chat turn that has already been gated
 * and charged as `chat.message`, so a second gate here would be charging twice
 * for one turn. At $0.15/1M input a ~100-token memory embed is ~$0.000015: one
 * credit is worth about six hundred of them.
 */

/**
 * Embed a single text string into a float[] using the configured Vertex AI
 * embedding model (default: text-embedding-004, 768 dimensions).
 */
export async function embedText(text: string): Promise<number[]> {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  const [vec] = await vertexProvider.embed([trimmed]);
  return vec || [];
}

/**
 * Embed multiple strings in sequence. Returns an array of float[] aligned
 * with the input order (empty array if an embedding fails).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const clean = texts.map((t) => (t || "").trim()).filter(Boolean);
  if (clean.length === 0) return [];
  return vertexProvider.embed(clean);
}

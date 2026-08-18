import { vertexProvider } from "./llm";

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

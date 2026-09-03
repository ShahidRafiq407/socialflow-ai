/**
 * THE DRAFT, IN PIECES
 *
 * Four stages read the finished page rather than write it — the fact check, the
 * differentiation pass, the trust pass and the editor — and every one of them wants
 * the same two things: the body as prose, and the body split at its own H2s so a
 * finding can name the section it came from.
 *
 * It lives in one file because those findings sit next to each other in the report
 * the user reads. Two stages splitting the same HTML slightly differently would
 * quietly disagree about which section a sentence is in, which is the kind of
 * inconsistency nobody thinks to look for.
 */

import { stripHtml } from "@/lib/agents/workers/articleAssembly";

export interface DraftBlock {
  /** The section's H2. Empty for whatever comes before the first one. */
  heading: string;
  /** Its prose, tags removed and whitespace collapsed. */
  text: string;
}

/** The draft split where its own H2s are. */
export function draftBlocks(html: string): DraftBlock[] {
  return String(html || "")
    .split(/(?=<h2)/i)
    .filter((part) => part.trim())
    .map((part) => {
      const match = part.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      const heading = match ? stripHtml(match[1]) : "";
      const text = stripHtml(match ? part.replace(match[0], "") : part);
      return { heading, text };
    })
    .filter((block) => block.text.length > 0 || block.heading.length > 0);
}

/** The blocks as `## heading` + prose, up to a character budget. */
export function blocksAsText(blocks: DraftBlock[], maxChars: number): string {
  const out: string[] = [];
  let used = 0;
  for (const block of blocks) {
    const piece = `## ${block.heading || "(no heading)"}\n${block.text}`;
    if (used + piece.length > maxChars) {
      const room = maxChars - used;
      if (room > 200) out.push(piece.slice(0, room));
      break;
    }
    out.push(piece);
    used += piece.length + 2;
  }
  return out.join("\n\n");
}

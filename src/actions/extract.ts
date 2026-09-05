"use server";

import * as cheerio from "cheerio";
import { auth } from "@clerk/nextjs/server";
import { llm } from "@/lib/agents/llm";
import { HumanMessage } from "@langchain/core/messages";
import prisma from "@/lib/db";
import { runAction } from "@/lib/billing/entitlements";
import { activeWorkspaceQuery } from "@/lib/workspace/active";
import { parseUploadedFile } from "@/lib/agents/chat/documentParser";

/** The nine fields both readers fill in. Optional beyond the first four, because a
 *  thin about-page or a one-page brief will not carry all of them and half a brand
 *  is still worth saving. */
export interface ExtractedBrand {
  companyName: string;
  industry: string;
  targetAudience: string;
  brandTone: string;
  missionVision?: string;
  painPoints?: string;
  differentiator?: string;
  ctaOffer?: string;
  competitors?: string;
}

/**
 * Reads a website and returns what it says about the business behind it.
 *
 * Three callers: onboarding, the Brand DNA panel's "scan my site" button, and the
 * chat's `extract_brand_from_url` tool. The gate and the charge live here rather
 * than in any of them, because this is a `"use server"` export — it is a public
 * HTTP endpoint, and until this it was one that fetched an arbitrary URL and spent
 * a model call for anybody who could reach it.
 *
 * `billing` lets the chat pass the identity it already resolved. Without it the
 * signed-in user and their active workspace are used, which is what both browser
 * callers want.
 */
export async function extractFromUrl(
  url: string,
  billing?: { userId?: string; workspaceId?: string | null }
) {
  const signedIn = billing?.userId || (await auth()).userId;
  if (!signedIn) throw new Error("Unauthorized");

  const workspaceId = await resolveWorkspace(signedIn, billing?.workspaceId ?? null);

  return runAction(
    {
      userId: signedIn,
      action: "brand.analyze",
      workspaceId,
      referenceId: url.trim().slice(0, 200),
      surface: "brand",
      measureCost: true,
    },
    () => readSiteForBrand(url)
  );
}

/**
 * The same read, from a document instead of a URL.
 *
 * Free is sold on being able to teach the product a brand, and a great many small
 * businesses have a deck or a one-page brief long before they have a website worth
 * scraping — so this is the other half of that promise, not a convenience.
 *
 * The parse happens BEFORE the gate on purpose. `parseUploadedFile` runs no model:
 * it walks the container locally, so an image, a corrupt PDF or an empty deck can be
 * refused for nothing. Charging first and refunding on failure would reach the same
 * balance, but only after a ledger entry and its reversal — and on a plan with three
 * brand reads a month, a customer watching the counter should not have to trust a
 * refund that a crash could leave unwritten.
 */
export async function extractFromDocument(
  file: { name: string; type: string; content: string },
  billing?: { userId?: string; workspaceId?: string | null }
) {
  const signedIn = billing?.userId || (await auth()).userId;
  if (!signedIn) throw new Error("Unauthorized");

  const text = await readDocumentText(file);
  const workspaceId = await resolveWorkspace(signedIn, billing?.workspaceId ?? null);

  return runAction(
    {
      userId: signedIn,
      action: "brand.document",
      workspaceId,
      referenceId: (file.name || "document").slice(0, 200),
      surface: "brand",
      measureCost: true,
    },
    () => brandFromText(text)
  );
}

async function resolveWorkspace(userId: string, given: string | null): Promise<string | null> {
  if (given) return given;
  const active = await prisma.workspace
    .findFirst({ ...(await activeWorkspaceQuery(userId)), select: { id: true } })
    .catch(() => null);
  return active?.id ?? null;
}

/**
 * Turns an upload into the text the model will read, or throws the reason it cannot.
 *
 * Every branch here is a sentence a customer can act on. "Failed to parse" is not —
 * the difference between a scanned PDF and a wrong file is the difference between
 * "export it as text" and "pick another file", and only this function knows which.
 */
async function readDocumentText(file: { name: string; type: string; content: string }) {
  const parsed = await parseUploadedFile(file);

  if (parsed.error) throw new Error(parsed.error);

  if (parsed.kind === "image" || parsed.kind === "video" || parsed.kind === "audio") {
    throw new Error(
      `${parsed.name} has no text to read. Upload a PDF, Word file, or deck — or scan your website instead.`
    );
  }
  if (parsed.kind === "unsupported") {
    throw new Error(`We cannot read ${parsed.name}. Supported: PDF, DOCX, PPTX, XLSX, CSV, and plain text.`);
  }

  const text = (parsed.text || "").replace(/\s+/g, " ").trim();
  // A scanned deck parses cleanly and yields almost nothing, which is the one failure
  // that would otherwise reach the model and come back as a confidently empty brand.
  if (text.length < 200) {
    throw new Error(
      `${parsed.name} has too little readable text — ${text.length} characters. If it is a scan or all images, export a text version and try again.`
    );
  }
  return text;
}

async function readSiteForBrand(url: string) {
  try {
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    let response;
    try {
      response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });
    } catch {
      // If the connection is instantly reset (e.g., Cloudflare dropping TLS handshake), fetch throws before returning a response
      throw new Error(`The website's firewall blocked the connection completely (Network Error). Try a different site like stripe.com.`);
    }

    if (!response.ok) {
      throw new Error(`Website is blocking our scraper (Status: ${response.status})`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    if (!bodyText) {
      throw new Error("Could not find readable text on the website");
    }

    return brandFromText(bodyText);
  } catch (error: any) {
    console.error("Extraction error:", error);
    throw new Error(error.message || "Failed to extract data from URL");
  }
}

/**
 * The one model call behind both readers.
 *
 * Shared so the two priced actions cannot drift apart: `brand.analyze` and
 * `brand.document` are the same 2 credits precisely because they are the same
 * request over the same 10k-character window, and a prompt edited on one path only
 * would make one of those prices a lie.
 */
async function brandFromText(sourceText: string): Promise<ExtractedBrand> {
  const prompt = `
      Extract the following information from the provided text.
      Return ONLY a raw JSON object with this exact structure, nothing else:
      {
        "companyName": "The name of the company",
        "industry": "The industry the company operates in",
        "targetAudience": "A brief description of their target audience",
        "brandTone": "The tone of voice used in their branding (e.g., professional, playful, formal)",
        "missionVision": "What the business does / their mission and vision",
        "painPoints": "Customer pain points they solve",
        "differentiator": "Key differentiator or why they win against competitors",
        "ctaOffer": "Their primary call to action or main offer",
        "competitors": "Any mentioned or implied competitors/benchmarks (comma separated string)"
      }

      Text:
      ${sourceText.substring(0, 10000)}
    `;

  const res = await llm.invoke([new HumanMessage(prompt)]);
  const text = (res.content?.toString() || "").trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("Invalid JSON response from LLM");
  }
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as ExtractedBrand;
}

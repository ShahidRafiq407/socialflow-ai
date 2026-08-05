"use server";

import * as cheerio from "cheerio";
import { llm } from "@/lib/agents/llm";
import { HumanMessage } from "@langchain/core/messages";

export async function extractFromUrl(url: string) {
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
    } catch (networkError: any) {
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

    const prompt = `
      Extract the following information from the provided website text.
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
      
      Website Text:
      ${bodyText.substring(0, 10000)} // Limiting text to avoid token limits
    `;

    try {
      const res = await llm.invoke([new HumanMessage(prompt)]);
      const text = (res.content?.toString() || "").trim();
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
          companyName: string;
          industry: string;
          targetAudience: string;
          brandTone: string;
          missionVision?: string;
          painPoints?: string;
          differentiator?: string;
          ctaOffer?: string;
          competitors?: string;
        };
      }
      throw new Error("Invalid JSON response from LLM");
    } catch (err: any) {
      throw err;
    }
  } catch (error: any) {
    console.error("Extraction error:", error);
    throw new Error(error.message || "Failed to extract data from URL");
  }
}

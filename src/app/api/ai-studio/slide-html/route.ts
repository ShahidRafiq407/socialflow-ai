import { NextRequest, NextResponse } from "next/server";
import { GroqProvider } from "@/lib/providers/GroqProvider";

const groq = new GroqProvider();

// Beautiful theme configs for HTML/CSS slides
const THEMES: Record<string, { bg: string; text: string; accent: string; badge: string }> = {
  "gradient-purple": {
    bg: "background: linear-gradient(135deg, #1a0533 0%, #4c1d95 40%, #7c3aed 70%, #a855f7 100%);",
    text: "#fff",
    accent: "#c4b5fd",
    badge: "background: rgba(255,255,255,0.15); color: #fff;",
  },
  "gradient-blue": {
    bg: "background: linear-gradient(135deg, #0c1445 0%, #1e3a8a 40%, #2563eb 70%, #60a5fa 100%);",
    text: "#fff",
    accent: "#93c5fd",
    badge: "background: rgba(255,255,255,0.15); color: #fff;",
  },
  "gradient-orange": {
    bg: "background: linear-gradient(135deg, #431407 0%, #9a3412 40%, #ea580c 70%, #fb923c 100%);",
    text: "#fff",
    accent: "#fed7aa",
    badge: "background: rgba(255,255,255,0.15); color: #fff;",
  },
  "gradient-dark": {
    bg: "background: linear-gradient(135deg, #020617 0%, #0f172a 40%, #1e293b 70%, #334155 100%);",
    text: "#f1f5f9",
    accent: "#94a3b8",
    badge: "background: rgba(255,255,255,0.1); color: #cbd5e1;",
  },
  "gradient-green": {
    bg: "background: linear-gradient(135deg, #052e16 0%, #14532d 40%, #15803d 70%, #22c55e 100%);",
    text: "#fff",
    accent: "#bbf7d0",
    badge: "background: rgba(255,255,255,0.15); color: #fff;",
  },
};

function buildSlideHTML(
  title: string,
  body: string,
  step: number,
  total: number,
  theme: string,
  brandName: string,
  aspectRatio: "9:16" | "4:5" | "1:1",
  imageUrl?: string
): string {
  const t = THEMES[theme] || THEMES["gradient-purple"];

  const widthMap = { "9:16": "360px", "4:5": "400px", "1:1": "400px" };
  const heightMap = { "9:16": "640px", "4:5": "500px", "1:1": "400px" };
  const w = widthMap[aspectRatio];
  const h = heightMap[aspectRatio];

  const bgStyle = imageUrl 
    ? `background: linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.85)), url('${imageUrl}') center/cover no-repeat;`
    : t.bg;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 100vw; height: 100vh;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    overflow: hidden;
    margin: 0; padding: 0;
  }
  .slide {
    width: 100%; height: 100%;
    ${bgStyle}
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: clamp(14px, 4vh, 24px) clamp(14px, 4vw, 24px);
    box-sizing: border-box;
  }
  .noise {
    position: absolute; inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
    opacity: 0.08;
    pointer-events: none;
  }
  .orb1 {
    position: absolute; width: 220px; height: 220px;
    background: radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%);
    top: -60px; right: -50px; border-radius: 50%;
  }
  .orb2 {
    position: absolute; width: 160px; height: 160px;
    background: radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%);
    bottom: 35%; left: -50px; border-radius: 50%;
  }
  .badge {
    display: inline-flex; align-items: center; gap: 5px;
    ${t.badge}
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 100px;
    padding: 3px 10px;
    font-size: clamp(9px, 2.5vw, 11px); font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase;
    margin-bottom: clamp(6px, 2vh, 12px); width: fit-content;
  }
  .dot {
    width: 5px; height: 5px;
    background: ${t.accent};
    border-radius: 50%;
    display: inline-block;
  }
  .title {
    color: ${t.text};
    font-size: clamp(16px, 5.5vw, 24px);
    font-weight: 800;
    line-height: 1.25;
    margin-bottom: clamp(6px, 1.8vh, 10px);
    letter-spacing: -0.02em;
    text-shadow: 0 2px 8px rgba(0,0,0,0.6);
    word-break: break-word;
  }
  .body {
    color: ${t.accent};
    font-size: clamp(11px, 3.5vw, 14px);
    line-height: 1.5;
    font-weight: 400;
    margin-bottom: clamp(10px, 3vh, 18px);
    max-width: 98%;
    text-shadow: 0 1px 4px rgba(0,0,0,0.6);
    word-break: break-word;
  }
  .divider {
    width: 36px; height: 2px;
    background: ${t.accent};
    border-radius: 2px;
    margin-bottom: clamp(8px, 2vh, 14px);
    opacity: 0.6;
  }
  .footer {
    display: flex; align-items: center; justify-content: space-between;
    padding-top: clamp(8px, 1.5vh, 12px);
    border-top: 1px solid rgba(255,255,255,0.15);
    gap: 8px;
  }
  .brand {
    color: rgba(255,255,255,0.75);
    font-size: clamp(9px, 2.5vw, 11px); font-weight: 600;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 65%;
  }
  .counter {
    display: flex; gap: 4px; align-items: center; shrink: 0;
  }
  .counter-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: rgba(255,255,255,0.3);
    transition: all 0.2s;
  }
  .counter-dot.active {
    width: 14px; border-radius: 3px;
    background: ${t.accent};
  }
  .content-wrap { position: relative; z-index: 2; width: 100%; }
</style>
</head>
<body>
<div class="slide">
  <div class="noise"></div>
  <div class="orb1"></div>
  <div class="orb2"></div>
  <div class="content-wrap">
    <div class="badge"><span class="dot"></span>Step ${step} of ${total}</div>
    <div class="divider"></div>
    <h2 class="title">${title}</h2>
    <p class="body">${body}</p>
    <div class="footer">
      <span class="brand">${brandName.toUpperCase()}</span>
      <div class="counter">
        ${Array.from({ length: total }, (_, i) => `<div class="counter-dot${i + 1 === step ? " active" : ""}"></div>`).join("")}
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const { title, body, step, total, theme, brandName, aspectRatio, customPrompt, imageUrl } = await req.json();

    let finalTitle = title;
    let finalBody = body;
    let finalTheme = theme || "gradient-purple";

    // If custom prompt is provided, use Groq to regenerate slide content
    if (customPrompt) {
      const aiResponse = await groq.generateJSON([
        {
          role: "system",
          content: `You are a social media slide designer. Given a prompt, return a JSON object with:
{
  "title": "Short punchy heading (3-6 words)",
  "body": "1-2 sentences of value content",
  "theme": "one of: gradient-purple, gradient-blue, gradient-orange, gradient-dark, gradient-green"
}
Return ONLY valid JSON.`
        },
        {
          role: "user",
          content: `Create slide content for: "${customPrompt}". Step ${step} of ${total}.`
        }
      ]);

      try {
        let text = (aiResponse || "").toString().replace(/```json/g, "").replace(/```/g, "").trim();
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
        const parsed = JSON.parse(text);
        finalTitle = parsed.title || finalTitle;
        finalBody = parsed.body || finalBody;
        finalTheme = parsed.theme || finalTheme;
      } catch {
        // use defaults
      }
    }

    const html = buildSlideHTML(
      finalTitle,
      finalBody,
      step,
      total,
      finalTheme,
      brandName || "Brand",
      aspectRatio || "4:5",
      imageUrl
    );

    return NextResponse.json({ success: true, html });
  } catch (err: any) {
    console.error("[Slide HTML API] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

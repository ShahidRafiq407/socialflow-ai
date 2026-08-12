import { NextResponse } from "next/server";
import { llm } from "@/lib/agents/llm";
import { HumanMessage } from "@langchain/core/messages";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { title, body, step, theme, totalSlides, aspect, platform, imagePrompt } = await req.json();

    const cleanTitle = title || "Pro Tip";
    const cleanBody = body || "Key takeaway for your audience.";
    const currentStep = step || 1;
    const total = totalSlides || 5;

    // High quality background images matching topic
    const query = encodeURIComponent(imagePrompt || cleanTitle || "marketing strategy");
    const bgImageUrl = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop&q=${query}`;

    // Select color themes
    const themes: Record<string, { bg: string; text: string; accent: string; card: string }> = {
      "gradient-purple": {
        bg: "linear-gradient(135deg, #2e1065 0%, #7c3aed 50%, #4c1d95 100%)",
        text: "#ffffff",
        accent: "#a78bfa",
        card: "rgba(255, 255, 255, 0.12)",
      },
      "gradient-blue": {
        bg: "linear-gradient(135deg, #0f172a 0%, #1e40af 50%, #1e3a8a 100%)",
        text: "#ffffff",
        accent: "#60a5fa",
        card: "rgba(255, 255, 255, 0.12)",
      },
      "gradient-emerald": {
        bg: "linear-gradient(135deg, #064e3b 0%, #059669 50%, #022c22 100%)",
        text: "#ffffff",
        accent: "#34d399",
        card: "rgba(255, 255, 255, 0.12)",
      },
      "gradient-sunset": {
        bg: "linear-gradient(135deg, #831843 0%, #db2777 50%, #ea580c 100%)",
        text: "#ffffff",
        accent: "#f472b6",
        card: "rgba(255, 255, 255, 0.12)",
      },
    };

    const selectedTheme = themes[theme] || themes["gradient-purple"];

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 32px 24px;
      background: ${selectedTheme.bg};
      color: ${selectedTheme.text};
      overflow: hidden;
      position: relative;
    }
    .bg-overlay {
      position: absolute;
      inset: 0;
      background-image: url('${bgImageUrl}');
      background-size: cover;
      background-position: center;
      opacity: 0.18;
      mix-blend-mode: overlay;
    }
    .header {
      position: relative;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .badge {
      background: ${selectedTheme.accent};
      color: #0f172a;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 20px;
    }
    .counter {
      font-size: 12px;
      font-weight: 700;
      opacity: 0.8;
    }
    .content-box {
      position: relative;
      z-index: 10;
      background: ${selectedTheme.card};
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 24px;
      padding: 28px 24px;
      margin: 16px 0;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    }
    .title {
      font-size: 22px;
      font-weight: 800;
      line-height: 1.25;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }
    .body {
      font-size: 14px;
      font-weight: 500;
      line-height: 1.5;
      opacity: 0.95;
    }
    .footer {
      position: relative;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div class="bg-overlay"></div>
  <div class="header">
    <span class="badge">STEP ${currentStep} OF ${total}</span>
    <span class="counter">${currentStep}/${total}</span>
  </div>
  <div class="content-box">
    <h2 class="title">${cleanTitle}</h2>
    <p class="body">${cleanBody}</p>
  </div>
  <div class="footer">
    <span>SWIPE FOR NEXT STEP ➔</span>
  </div>
</body>
</html>`;

    return NextResponse.json({ success: true, html });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to generate slide" }, { status: 500 });
  }
}

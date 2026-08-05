import { AgentStateType } from "../graph/state";

function buildImageUrl(
  prompt: string,
  aspectRatio: string = "1:1",
  seed: number = 42
): string {
  let w = 1080, h = 1080;
  if (aspectRatio === "9:16") { w = 1080; h = 1920; }
  else if (aspectRatio === "16:9") { w = 1920; h = 1080; }
  else if (aspectRatio === "4:5") { w = 1080; h = 1350; }
  else if (aspectRatio === "2:3") { w = 1000; h = 1500; }

  const cleanText = (prompt || "modern digital marketing").replace(/[^a-zA-Z0-9 ,.-]/g, " ").trim();
  const encoded = encodeURIComponent(
    cleanText + ", professional commercial photography, studio lighting, photorealistic 8k, vibrant colors"
  );
  return `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&seed=${seed}&model=flux`;
}

function getFormatAspectRatio(format: string): string {
  if (["Reel", "Shorts", "Video", "Story", "Short Video", "Idea Pin"].includes(format)) return "9:16";
  if (["Feed"].includes(format)) return "1:1";
  if (["Carousel"].includes(format)) return "4:5";
  if (["Pin"].includes(format)) return "2:3";
  return "16:9";
}

export async function visualizerCreatorNode(state: AgentStateType) {
  console.log("--- [Visualizer Creator Agent] Generating Media URLs ---");

  if (!state.campaignPayload || !state.campaignPayload.platforms) {
    throw new Error("No campaign payload available for Visualizer.");
  }

  const payload = { ...state.campaignPayload };

  // Loop through all generated platforms and formats
  for (const platformId of Object.keys(payload.platforms)) {
    const formats = payload.platforms[platformId];
    for (const formatName of Object.keys(formats)) {
      const content = formats[formatName];
      
      // If there is a visual prompt, generate the image URL
      if (content.visualPrompt) {
        const aspectRatio = getFormatAspectRatio(formatName);
        const seed = Math.floor(Math.random() * 10000);
        content.imageUrl = buildImageUrl(content.visualPrompt, aspectRatio, seed);
      }
    }
  }

  return {
    campaignPayload: payload
  };
}

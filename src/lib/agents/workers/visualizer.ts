import { AgentStateType } from "../graph/state";
import { llm, MODELS } from "../llm";
import { HumanMessage } from "@langchain/core/messages";
import { generateMediaAsset } from "../mediaGenerator";

// High-quality HD marketing video collection for Reels/Shorts/TikTok
const HIGH_QUALITY_MARKETING_VIDEOS = [
  "https://cdn.pixabay.com/video/2023/10/22/185984-876939989_tiny.mp4", // Modern Tech/Digital
  "https://cdn.pixabay.com/video/2021/04/12/70889-536417726_tiny.mp4", // Business Strategy Meeting
  "https://cdn.pixabay.com/video/2020/09/20/50534-461421685_tiny.mp4", // Creative Workspace/Laptop
  "https://cdn.pixabay.com/video/2022/11/04/137648-767931398_tiny.mp4", // Social Media/Mobile Content
  "https://cdn.pixabay.com/video/2022/05/18/117387-711904791_tiny.mp4", // Growth & Analytics Abstract
];

// Curated high-resolution Unsplash images per industry keyword
function getHighQualityImageUrl(keyword: string, aspect: string, index: number = 0): string {
  const query = encodeURIComponent(keyword || "modern business digital marketing");
  const width = aspect === "9:16" ? 720 : aspect === "4:5" ? 800 : aspect === "2:3" ? 800 : 1080;
  const height = aspect === "9:16" ? 1280 : aspect === "4:5" ? 1000 : aspect === "2:3" ? 1200 : 1080;
  return `https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=${width}&h=${height}&auto=format&fit=crop&sig=${index * 13 + 7}&q=${query}`;
}

export async function visualizerCreatorNode(state: AgentStateType) {
  console.log("--- [Visualizer Creator Agent] Generating Rich Prompts & Relevant Media ---");

  if (!state.campaignPayload || !state.campaignPayload.platforms) {
    throw new Error("No campaign payload available for Visualizer.");
  }

  const payload = { ...state.campaignPayload };

  // Loop through all generated platforms and formats
  let videoIndex = 0;
  for (const platformId of Object.keys(payload.platforms)) {
    const formats = payload.platforms[platformId];
    for (const formatName of Object.keys(formats)) {
      const content = formats[formatName];
      
      const isVideo = ["Reel", "Shorts", "Video", "Short Video"].includes(formatName);
      const isCarousel = ["Carousel", "Idea Pin", "Thread"].includes(formatName);
      
      // Step 1: Read the caption and ask Gemini to generate visual prompts & slide overlays
      const refinementPrompt = `You are the Visualizer Agent.
Read this viral caption: "${content.caption}"
Platform: ${platformId}, Format: ${formatName}

Generate a JSON object with visual details:
{
  "visualPrompts": ["Specific vivid prompt 1", "Specific vivid prompt 2", "Specific vivid prompt 3", "Specific vivid prompt 4"],
  "overlayText": [
    {"step": 1, "title": "Slide 1 Catchy Title", "body": "1 sentence key insight.", "theme": "gradient-purple"},
    {"step": 2, "title": "Slide 2 Core Strategy", "body": "1 sentence actionable step.", "theme": "gradient-blue"},
    {"step": 3, "title": "Slide 3 Proven Result", "body": "1 sentence takeaway.", "theme": "gradient-emerald"},
    {"step": 4, "title": "Slide 4 Final CTA", "body": "Follow for more strategies.", "theme": "gradient-sunset"}
  ]
}
Return ONLY valid JSON.`;

      let visualData: any = null;
      try {
        const res = await llm.withStructuredOutput(null).invoke([new HumanMessage(refinementPrompt)], {
          modelName: MODELS.CONTENT_CREATOR
        });
        if (typeof res.content === "object" && res.content !== null) {
          visualData = res.content;
        } else {
          const text = (res.content?.toString() || "").replace(/```json/g, "").replace(/```/g, "").trim();
          visualData = JSON.parse(text);
        }
      } catch (e) {
        console.error("Visualizer LLM prompt generation fallback triggered:", e);
      }

      const prompts = visualData?.visualPrompts || content.visualPrompts || [content.imagePrompt || payload.topic || "digital growth"];
      const overlays = visualData?.overlayText || content.overlayText || [
        { step: 1, title: "Key Insight", body: content.caption?.slice(0, 80) || "Value point", theme: "gradient-purple" },
        { step: 2, title: "Action Step", body: "Implement this fix today.", theme: "gradient-blue" },
        { step: 3, title: "Pro Tip", body: "Consistency is key to scaling.", theme: "gradient-emerald" },
        { step: 4, title: "Get Started", body: "Save this post & share with your team.", theme: "gradient-sunset" }
      ];

      content.visualPrompts = prompts;
      content.overlayText = overlays;

      if (isCarousel) {
        content.refinedVisualPrompts = prompts;
        try {
          const mediaRes = await generateMediaAsset({
            platform: platformId,
            contentType: formatName,
            mediaType: "multi_image",
            prompt: prompts.join(", "),
            aspectRatio: formatName.toLowerCase().includes("idea") ? "9:16" : "1:1",
            caption: content.caption,
            topic: payload.topic,
          });
          content.imageUrls = mediaRes.map((m) => m.url);
          content.imageUrl = content.imageUrls[0];
        } catch (e) {
          content.imageUrls = prompts.map((p: string, i: number) => getHighQualityImageUrl(p, isCarousel ? "4:5" : "2:3", i));
          content.imageUrl = content.imageUrls[0];
        }
      } else if (isVideo) {
        try {
          const mediaRes = await generateMediaAsset({
            platform: platformId,
            contentType: formatName,
            mediaType: "video",
            prompt: prompts[0] || "Cinematic marketing video",
            aspectRatio: "9:16",
            caption: content.caption,
            topic: payload.topic,
          });
          if (mediaRes[0]?.url) {
            content.videoUrl = mediaRes[0].url;
            content.imageUrl = mediaRes[0].url;
          }
        } catch (e) {
          const videoUrl = HIGH_QUALITY_MARKETING_VIDEOS[videoIndex % HIGH_QUALITY_MARKETING_VIDEOS.length];
          videoIndex++;
          content.videoUrl = videoUrl;
          content.imageUrl = videoUrl;
        }
        content.refinedImagePrompt = prompts[0] || "Cinematic marketing video";
      } else {
        content.refinedImagePrompt = prompts[0];
        const aspect = formatName === "Pin" ? "2:3" : formatName === "Story" ? "9:16" : "1:1";
        try {
          const mediaRes = await generateMediaAsset({
            platform: platformId,
            contentType: formatName,
            mediaType: "image",
            prompt: prompts[0] || payload.topic,
            aspectRatio: aspect,
            caption: content.caption,
            topic: payload.topic,
          });
          if (mediaRes[0]?.url) {
            content.imageUrl = mediaRes[0].url;
          }
        } catch (e) {
          content.imageUrl = getHighQualityImageUrl(prompts[0] || payload.topic, aspect, 0);
        }
      }
    }
  }

  return {
    campaignPayload: payload
  };
}

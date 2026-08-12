import { AgentStateType } from "../graph/state";
import { llm, MODELS, vertexProvider } from "../llm";
import { HumanMessage } from "@langchain/core/messages";

function getFormatAspectRatio(format: string): string {
  if (["Reel", "Shorts", "Video", "Story", "Short Video", "Idea Pin"].includes(format)) return "9:16";
  if (["Feed"].includes(format)) return "1:1";
  if (["Carousel"].includes(format)) return "4:5";
  if (["Pin"].includes(format)) return "2:3";
  return "16:9";
}

export async function visualizerCreatorNode(state: AgentStateType) {
  console.log("--- [Visualizer Creator Agent] Generating Prompts & Media ---");

  if (!state.campaignPayload || !state.campaignPayload.platforms) {
    throw new Error("No campaign payload available for Visualizer.");
  }

  const payload = { ...state.campaignPayload };

  // Loop through all generated platforms and formats
  for (const platformId of Object.keys(payload.platforms)) {
    const formats = payload.platforms[platformId];
    for (const formatName of Object.keys(formats)) {
      const content = formats[formatName];
      
      const isVideo = ["Reel", "Shorts", "Video"].includes(formatName);
      const isCarousel = ["Carousel", "Idea Pin", "Thread"].includes(formatName);
      
      // Step 1: Read the caption and ask Gemini to refine the prompt
      const promptType = isVideo ? "Video Generation Prompt for Veo 3.1" : "Image Generation Prompt for Gemini 3.1 Flash Image";
      const refinementPrompt = `You are the Visualizer Agent.
Read this viral caption and generate highly detailed, cinematic visual prompts.
Caption: "${content.caption}"

If this is a multi-slide Carousel/Thread, generate exactly ${content.visualPrompts ? content.visualPrompts.length : 3} prompts.
If this is a single Image/Video, generate exactly 1 prompt.
Format: Return ONLY a JSON array of strings. No extra text.
Example: ["A cinematic wide shot of a neon city, 8k resolution, photorealistic", "Close up of a coffee cup on a modern desk"]`;

      let refinedPrompts = [];
      try {
          const res = await llm.withStructuredOutput(null).invoke([new HumanMessage(refinementPrompt)], {
              modelName: MODELS.VISUALIZER
          });
          const text = (res.content?.toString() || "").replace(/```json/g, "").replace(/```/g, "").trim();
          refinedPrompts = JSON.parse(text);
          if (!Array.isArray(refinedPrompts)) refinedPrompts = [refinedPrompts];
      } catch (e) {
          console.error("Visualizer LLM failed to generate refined prompts, falling back to content prompts.", e);
          refinedPrompts = isCarousel ? (content.visualPrompts || []) : [content.imagePrompt];
      }

      if (isCarousel) {
          content.refinedVisualPrompts = refinedPrompts;
          // In a production app, we would loop and call generateImage for each slide here
          content.imageUrls = refinedPrompts.map((p: string, i: number) => `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?seed=${i}`);
      } else {
          content.refinedImagePrompt = refinedPrompts[0];
          
          if (isVideo) {
             content.videoUrl = "https://cdn.pixabay.com/video/2023/10/22/185984-876939989_tiny.mp4"; // Mock Veo 3.1 return for now to keep frontend intact
             content.videoPromptUsed = refinedPrompts[0];
          } else {
             // Example of calling the real Vertex AI Image model:
             // const vertexImg = await vertexProvider.generateImage(refinedPrompts[0], { modelName: MODELS.VISUALIZER });
             // content.imageUrl = vertexImg;
             content.imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(refinedPrompts[0] || "")}?seed=42`;
          }
      }
    }
  }

  return {
    campaignPayload: payload
  };
}

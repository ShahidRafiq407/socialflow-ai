"use server";

export async function generateTTSVoiceover(text: string, voice: string = "en-US-ChristopherNeural") {
  try {
    // Edge-TTS API proxy or fallback helper
    if (!text || !text.trim()) {
      return { success: false, error: "Text is required for TTS" };
    }

    // Encoded text payload for audio synthesis
    const encodedText = encodeURIComponent(text.trim());
    // Google / Free TTS endpoint fallback for server-side audio generation
    const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en&client=tw-ob`;

    return {
      success: true,
      audioUrl,
      text: text.trim()
    };
  } catch (error: any) {
    console.error("TTS generation error:", error);
    return {
      success: false,
      error: error.message || "Failed to generate TTS voiceover"
    };
  }
}

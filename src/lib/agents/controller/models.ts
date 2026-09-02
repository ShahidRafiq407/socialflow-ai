// ============================================================================
// CONTROLLER MODEL REGISTRY
//
// The models a user can pick as the Automate controller's brain. Ids are the
// exact Vertex AI model strings; the provider's own fallback chain covers a
// model being unavailable in a region, so this list stays curated rather than
// exhaustive.
// ============================================================================

export interface ChatModelInfo {
  id: string;
  label: string;
  /** One-line pitch shown in the model picker. */
  blurb: string;
  /** Emits `thought` parts, so live thinking works. */
  supportsThinking: boolean;
  /** Reliable with native function declarations (needed for tool use). */
  supportsTools: boolean;
  supportsVision: boolean;
  /** Shown as the recommended default. */
  recommended?: boolean;
  tier: "frontier" | "fast" | "legacy";
}

export const DEFAULT_CHAT_MODEL = "gemini-3.1-pro-preview";

export const CHAT_MODELS: ChatModelInfo[] = [
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (Preview)",
    blurb: "Deepest reasoning and the most reliable multi-step tool use. Best for real work.",
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
    recommended: true,
    tier: "frontier",
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    blurb: "Near-frontier quality at roughly half the latency. Good default for quick asks.",
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
    tier: "fast",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    blurb: "Fastest and cheapest. Fine for lookups and short answers, weaker on long tool chains.",
    supportsThinking: false,
    supportsTools: true,
    supportsVision: true,
    tier: "fast",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    blurb: "Previous frontier generation. Kept as a stable escape hatch.",
    supportsThinking: true,
    supportsTools: true,
    supportsVision: true,
    tier: "legacy",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    blurb: "Previous fast generation. Very stable, less capable at planning.",
    supportsThinking: false,
    supportsTools: true,
    supportsVision: true,
    tier: "legacy",
  },
];

export function getChatModel(id: string | null | undefined): ChatModelInfo {
  return CHAT_MODELS.find((m) => m.id === id) || CHAT_MODELS[0];
}

export function isKnownChatModel(id: string | null | undefined): boolean {
  return !!id && CHAT_MODELS.some((m) => m.id === id);
}

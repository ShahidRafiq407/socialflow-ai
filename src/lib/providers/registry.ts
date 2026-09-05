// ============================================================================
// PROVIDER REGISTRY
//
// Which model companies this deployment can talk to, and how.
//
// A model row in the back office carries a `provider` id from this list. The
// registry says three things about it:
//
//   wire     — which client speaks to it. Only three exist: Google's Vertex SDK,
//              the OpenAI /chat/completions shape, and Anthropic's /v1/messages.
//              Every other vendor in the list is one of those two HTTP shapes
//              behind a different host, which is why adding DeepSeek or Qwen or
//              Kimi is a row in this file rather than a new client.
//   baseUrl  — the default endpoint, overridable per model row (Azure, a proxy,
//              a self-hosted vLLM).
//   keyName  — which managed key holds the credential. The admin sets it once on
//              the Keys screen and every model of that provider uses it; a single
//              row may still point at a different key with `apiKeyRef`.
//
// This file is client-safe: no prisma, no env reads, no secrets. The admin form
// imports it for its dropdown and its placeholder text.
// ============================================================================

/** The three HTTP dialects the gateway knows how to speak. */
export type ProviderWire = "vertex" | "openai" | "anthropic";

export interface ProviderSpec {
  /** Stored in `AiModel.provider`. */
  id: string;
  label: string;
  wire: ProviderWire;
  /** Default endpoint. Empty means "the row must supply one". */
  baseUrl: string;
  /** Managed key that holds the credential, unless the row overrides it. */
  keyName: string;
  /** Shown under the provider picker. */
  hint: string;
  /** Real model ids, offered as a datalist so the admin does not have to guess. */
  examples: string[];
  /** True when the endpoint is deployment-specific and must be typed in. */
  requiresBaseUrl?: boolean;
  /** Grouping for the picker. */
  group: "Google" | "Frontier" | "China" | "Aggregator" | "Self-hosted";
}

export const PROVIDERS: ProviderSpec[] = [
  {
    id: "vertex",
    label: "Google Vertex AI (built-in)",
    wire: "vertex",
    baseUrl: "",
    keyName: "",
    hint: "Uses the deployment's Google service account. No API key needed here.",
    examples: ["gemini-3.1-pro-preview", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-pro"],
    group: "Google",
  },
  {
    id: "openai",
    label: "OpenAI",
    wire: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyName: "OPENAI_API_KEY",
    hint: "Any OpenAI chat model. Reasoning models stream their summary as thinking.",
    examples: ["gpt-5.2", "gpt-5.2-mini", "gpt-5.1", "o4", "gpt-4.1", "gpt-4o"],
    group: "Frontier",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    wire: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    keyName: "ANTHROPIC_API_KEY",
    hint: "Native /v1/messages, so extended thinking and tool use both work.",
    examples: [
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-5-20250929",
    ],
    group: "Frontier",
  },
  {
    id: "azure-openai",
    label: "Azure OpenAI",
    wire: "openai",
    baseUrl: "",
    keyName: "AZURE_OPENAI_API_KEY",
    hint: "Base URL is your deployment: https://<resource>.openai.azure.com/openai/v1",
    examples: ["gpt-5.2", "gpt-4.1"],
    requiresBaseUrl: true,
    group: "Frontier",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    wire: "openai",
    baseUrl: "https://api.x.ai/v1",
    keyName: "XAI_API_KEY",
    hint: "OpenAI-compatible.",
    examples: ["grok-4", "grok-4-fast", "grok-3"],
    group: "Frontier",
  },
  {
    id: "mistral",
    label: "Mistral",
    wire: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    keyName: "MISTRAL_API_KEY",
    hint: "OpenAI-compatible.",
    examples: ["mistral-large-latest", "mistral-medium-latest", "magistral-medium-latest"],
    group: "Frontier",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    wire: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    keyName: "DEEPSEEK_API_KEY",
    hint: "OpenAI-compatible. deepseek-reasoner streams its chain as thinking.",
    examples: ["deepseek-chat", "deepseek-reasoner"],
    group: "China",
  },
  {
    id: "qwen",
    label: "Alibaba Qwen (DashScope)",
    wire: "openai",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    keyName: "DASHSCOPE_API_KEY",
    hint: "DashScope's OpenAI-compatible mode. Use the mainland host if your key is CN-region.",
    examples: ["qwen3-max", "qwen-plus", "qwen-turbo", "qwen3-coder-plus"],
    group: "China",
  },
  {
    id: "moonshot",
    label: "Moonshot (Kimi)",
    wire: "openai",
    baseUrl: "https://api.moonshot.ai/v1",
    keyName: "MOONSHOT_API_KEY",
    hint: "OpenAI-compatible. Very large context.",
    examples: ["kimi-k2-turbo-preview", "kimi-k2-0905-preview", "moonshot-v1-128k"],
    group: "China",
  },
  {
    id: "zhipu",
    label: "Zhipu (GLM)",
    wire: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyName: "ZHIPU_API_KEY",
    hint: "OpenAI-compatible. Use https://api.z.ai/api/paas/v4 for the international host.",
    examples: ["glm-4.6", "glm-4.5", "glm-4.5-air"],
    group: "China",
  },
  {
    id: "minimax",
    label: "MiniMax",
    wire: "openai",
    baseUrl: "https://api.minimax.io/v1",
    keyName: "MINIMAX_API_KEY",
    hint: "OpenAI-compatible.",
    examples: ["MiniMax-M2", "MiniMax-Text-01"],
    group: "China",
  },
  {
    id: "baidu",
    label: "Baidu ERNIE (Qianfan)",
    wire: "openai",
    baseUrl: "https://qianfan.baidubce.com/v2",
    keyName: "QIANFAN_API_KEY",
    hint: "Qianfan v2 speaks the OpenAI shape.",
    examples: ["ernie-5.0", "ernie-4.5-turbo-128k"],
    group: "China",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    wire: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    keyName: "OPENROUTER_API_KEY",
    hint: "One key, hundreds of models. Ids look like vendor/model.",
    examples: ["anthropic/claude-opus-5", "openai/gpt-5.2", "deepseek/deepseek-chat", "qwen/qwen3-max"],
    group: "Aggregator",
  },
  {
    id: "groq",
    label: "Groq",
    wire: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    keyName: "GROQ_API_KEY",
    hint: "Very fast inference for open-weight models.",
    examples: ["llama-4-maverick-17b-128e-instruct", "moonshotai/kimi-k2-instruct", "qwen/qwen3-32b"],
    group: "Aggregator",
  },
  {
    id: "together",
    label: "Together AI",
    wire: "openai",
    baseUrl: "https://api.together.xyz/v1",
    keyName: "TOGETHER_API_KEY",
    hint: "OpenAI-compatible.",
    examples: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen3-235B-A22B-fp8-tput"],
    group: "Aggregator",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    wire: "openai",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    keyName: "FIREWORKS_API_KEY",
    hint: "OpenAI-compatible. Ids look like accounts/fireworks/models/<name>.",
    examples: ["accounts/fireworks/models/deepseek-v3", "accounts/fireworks/models/qwen3-235b-a22b"],
    group: "Aggregator",
  },
  {
    id: "custom-openai",
    label: "Other OpenAI-compatible endpoint",
    wire: "openai",
    baseUrl: "",
    keyName: "CUSTOM_LLM_API_KEY",
    hint: "Anything that serves POST /chat/completions — vLLM, Ollama, LM Studio, a gateway.",
    examples: [],
    requiresBaseUrl: true,
    group: "Self-hosted",
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

/** The spec for a stored provider id, falling back to the built-in Google one. */
export function providerSpec(id: string | null | undefined): ProviderSpec {
  return BY_ID.get((id || "vertex").trim()) || BY_ID.get("vertex")!;
}

export function providerLabel(id: string | null | undefined): string {
  return providerSpec(id).label;
}

/** Which dialect a stored provider id speaks. */
export function providerWire(id: string | null | undefined): ProviderWire {
  return providerSpec(id).wire;
}

/** True for the built-in Google path, which needs no key and no base URL. */
export function isBuiltInProvider(id: string | null | undefined): boolean {
  return providerWire(id) === "vertex";
}

/** Every managed-key name a provider in this list can consume. */
export function providerKeyNames(): string[] {
  return Array.from(new Set(PROVIDERS.map((p) => p.keyName).filter(Boolean)));
}

/** Providers grouped for the admin picker, in registry order. */
export function providersByGroup(): Array<{ group: ProviderSpec["group"]; items: ProviderSpec[] }> {
  const groups: ProviderSpec["group"][] = ["Google", "Frontier", "China", "Aggregator", "Self-hosted"];
  return groups
    .map((group) => ({ group, items: PROVIDERS.filter((p) => p.group === group) }))
    .filter((g) => g.items.length > 0);
}

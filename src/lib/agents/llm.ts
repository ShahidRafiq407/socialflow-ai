import { providerFor, vertexClient } from "../providers/gateway";
import { CONTROLLER_MODEL_ID } from "./controller/models";
import { IMAGE_MODEL_ID, VIDEO_MODEL_ID } from "./mediaModels";
import { modelForRole } from "@/lib/admin/runtimeConfig";

// Centralized ELITE-tier Google Vertex AI model mapping
// Removed all flash, lite, and low-scale constraints to guarantee production depth
//
// Three layers decide each id, highest priority first:
//
//   1. The admin's pick in the back office (AppSetting "ai.model.<ROLE>"), read
//      through `modelForRole`. Live within the runtime-config cache window, on
//      every instance, without a deploy.
//   2. The environment variable named on each row.
//   3. The default written here.
//
// `MODELS` is a live object: every property is a getter, so the ~70 call sites
// that read `MODELS.CONTENT_CREATOR` at request time see the current pick.
const MODEL_DEFAULTS = {
  BRAND_ANALYST: () => "none", // Database processing

  // Premium frontier intelligence text infrastructure from your exact GCP project models list
  TREND_RESEARCHER: () => process.env.MODEL_TREND_RESEARCHER || "gemini-3.6-flash",
  COMPETITOR_ANALYST: () => process.env.MODEL_COMPETITOR_ANALYST || "gemini-3.5-flash-lite",
  CONTENT_CREATOR: () => process.env.MODEL_CONTENT_CREATOR || "gemini-3.1-pro-preview",
  CEO_SUPERVISOR: () => process.env.MODEL_CEO_AUDITOR || "gemini-3.1-pro-preview", // Exact model string from your Google Usage Dashboard
  ARTICLE_GENERATOR: () => process.env.MODEL_CONTENT_CREATOR || "gemini-3.1-pro-preview",

  // Master Grade Multimedia Pipelines (Maximum structural clarity)
  //
  // The ids come from mediaModels.ts, which the editors and the AI Studio pickers
  // read as well — server and UI cannot drift onto different models. Server-only
  // MODEL_IMAGE_GENERATOR / MODEL_VIDEO_GENERATOR still win if they are set, for
  // a deployment that wants the backend on a different render model than the one
  // the pickers advertise.
  VISUALIZER: () => process.env.MODEL_IMAGE_GENERATOR || IMAGE_MODEL_ID,
  // The video model generates short-form video from text/image prompts.
  VIDEO: () => process.env.MODEL_VIDEO_GENERATOR || VIDEO_MODEL_ID,

  // Regenerating a single slide's copy is a content-creator job, so it follows the
  // content-creator override rather than the (unrelated) competitor-analyst one.
  SLIDE_REGENERATOR: () =>
    process.env.MODEL_SLIDE_REGENERATOR || process.env.MODEL_CONTENT_CREATOR || "gemini-3.1-pro-preview",

  // The "Marketing Brain" orchestrator / planner / synthesizer model
  ORCHESTRATOR: () => process.env.MODEL_ORCHESTRATOR || "gemini-3.1-pro-preview",
  EMBEDDING: () => process.env.MODEL_EMBEDDING || "text-embedding-004",

  // The Automate Task controller. CHAT_CONTROLLER is the same id the chat picker
  // shows (see src/lib/agents/controller/models.ts) so the label can never drift
  // from the model that actually runs. CHAT_UTILITY is the small fast model for
  // the controller's background chores — naming a session, follow-up chips,
  // memory extraction, rolling summaries — none of which need the frontier model.
  CHAT_CONTROLLER: () => CONTROLLER_MODEL_ID,
  CHAT_UTILITY: () => process.env.MODEL_CHAT_UTILITY || "gemini-3.6-flash",
} as const;

export type ModelRole = keyof typeof MODEL_DEFAULTS;

/** The id a role runs on right now, admin pick first. */
export function resolveRoleModel(role: ModelRole): string {
  return modelForRole(role) || MODEL_DEFAULTS[role]();
}

/** The code/env default for a role, so the admin screen can show what "reset" returns to. */
export function defaultRoleModel(role: ModelRole): string {
  return MODEL_DEFAULTS[role]();
}

/**
 * The admin's explicit pick for a role, or null when they have not made one.
 *
 * `resolveRoleModel` folds the pick, the env var and the code default into one id,
 * which is right for "what runs now" but useless where something else also proposes
 * a model — the browser sending `imageModel` from a build-time constant, or a
 * MODEL_ARTICLE_WRITING env var. Those used to win over the back office, so ticking
 * a job on the Models screen changed nothing the user could see. Callers that have a
 * competing candidate ask this first and only fall back when it is null.
 */
export function pinnedRoleModel(role: ModelRole): string | null {
  const pinned = modelForRole(role);
  return pinned && pinned.trim() ? pinned.trim() : null;
}

export const MODELS: Record<ModelRole, string> = Object.defineProperties(
  {} as Record<ModelRole, string>,
  Object.fromEntries(
    (Object.keys(MODEL_DEFAULTS) as ModelRole[]).map((role) => [
      role,
      { enumerable: true, get: () => resolveRoleModel(role) },
    ])
  )
);

let currentWorkingModel: string | null = null;

export function getWorkingModelName() {
  return currentWorkingModel ?? MODELS.CONTENT_CREATOR;
}

export function setWorkingModelName(name: string) {
  currentWorkingModel = name;
}

/**
 * The Google client, for the code that specifically wants Vertex features
 * (grounding, vision, embeddings, image and video). It is the gateway's single
 * instance, re-exported so the ~40 existing imports of this name keep working.
 *
 * For plain text and JSON prefer the role-aware adapters below: they route
 * through the gateway, so a role an admin pinned to Claude or DeepSeek actually
 * runs there instead of being sent to Vertex under a foreign model id.
 */
export const vertexProvider = vertexClient();

function translateMessages(langchainMessages: any[]): any[] {
  return langchainMessages.map((msg) => {
    let role = "user";
    if (msg._getType) {
      const type = msg._getType();
      if (type === "system") role = "system";
      if (type === "ai") role = "assistant";
    } else if (msg.role) {
      role = msg.role;
    }
    let content = typeof msg === "string" ? msg : (msg.content || JSON.stringify(msg));
    return { role, content };
  });
}

class VertexLLMAdapter {
  async invoke(input: any[], options?: any) {
    const messages = translateMessages(input);
    const modelName = options?.modelName || currentWorkingModel;

    const generateOptions: any = {
      modelName,
      temperature: options?.temperature ?? 0.4, // Deep contextual focus
    };

    if (options?.tools) {
      generateOptions.tools = options.tools;
    }

    const content = await providerFor(modelName).generateText(messages, generateOptions);
    return { content };
  }

  withStructuredOutput(schema: any, config?: any) {
    return {
      invoke: async (input: any[], options?: any) => {
        const messages = translateMessages(input);
        const modelName = options?.modelName || currentWorkingModel;
        const content = await providerFor(modelName).generateJSON(messages, {
          modelName,
          temperature: 0.1, // Strict layout compliance
        });
        return { content };
      },
    };
  }
}

export const llm = new VertexLLMAdapter();

export const ceoLlm = {
  invoke: async (input: any[], options?: any) => {
    const messages = translateMessages(input);
    const model = MODELS.CEO_SUPERVISOR;
    const content = await providerFor(model).generateText(messages, {
      modelName: model,
      temperature: 0.2,
    });
    return { content };
  },
};

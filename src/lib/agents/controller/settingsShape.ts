// ============================================================================
// CONTROLLER SETTINGS — SHAPE
//
// The settings vocabulary and its normalizer, with no database import, so the
// chat UI can hold real defaults without dragging `pg` into the browser bundle.
// Persistence lives in ./settings, which re-exports everything here.
// ============================================================================

import { DEFAULT_CHAT_MODEL, isKnownChatModel } from "./models";

export type ThinkingLevelSetting = "off" | "concise" | "balanced" | "deep";
export type ThinkingDisplaySetting = "live" | "collapsed" | "hidden";
export type ReplyLanguageSetting = "auto" | "english" | "roman-urdu" | "urdu";
export type ReplyStyleSetting = "executive" | "detailed" | "concise";
export type AutonomySetting = "auto" | "confirm";
export type ToolVisibilitySetting = "all" | "compact" | "failures";

export interface ChatSettings {
  model: string;
  temperature: number;
  maxToolLoops: number;
  thinkingLevel: ThinkingLevelSetting;
  thinkingDisplay: ThinkingDisplaySetting;
  streamTokens: boolean;
  replyLanguage: ReplyLanguageSetting;
  replyStyle: ReplyStyleSetting;
  customInstructions: string;
  autonomy: AutonomySetting;
  allowWebSearch: boolean;
  allowMediaGen: boolean;
  allowPublishing: boolean;
  allowPlugins: boolean;
  memoryEnabled: boolean;
  memoryAutoSave: boolean;
  memoryRecallTopK: number;
  toolVisibility: ToolVisibilitySetting;
  autoOpenLinks: boolean;
  showSuggestions: boolean;
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  model: DEFAULT_CHAT_MODEL,
  temperature: 0.4,
  maxToolLoops: 8,
  thinkingLevel: "balanced",
  thinkingDisplay: "live",
  streamTokens: true,
  replyLanguage: "auto",
  replyStyle: "executive",
  customInstructions: "",
  autonomy: "auto",
  allowWebSearch: true,
  allowMediaGen: true,
  allowPublishing: true,
  allowPlugins: true,
  memoryEnabled: true,
  memoryAutoSave: true,
  memoryRecallTopK: 8,
  toolVisibility: "all",
  autoOpenLinks: false,
  showSuggestions: true,
};

const THINKING_LEVELS: ThinkingLevelSetting[] = ["off", "concise", "balanced", "deep"];
const THINKING_DISPLAYS: ThinkingDisplaySetting[] = ["live", "collapsed", "hidden"];
const REPLY_LANGUAGES: ReplyLanguageSetting[] = ["auto", "english", "roman-urdu", "urdu"];
const REPLY_STYLES: ReplyStyleSetting[] = ["executive", "detailed", "concise"];
const AUTONOMIES: AutonomySetting[] = ["auto", "confirm"];
const TOOL_VISIBILITIES: ToolVisibilitySetting[] = ["all", "compact", "failures"];

function pickEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Coerces any shape (a DB row, a request body, a partial patch) into valid
 * settings. Unknown or out-of-range values silently fall back rather than
 * rejecting, so a stale client can never lock a user out of their own chat.
 */
export function normalizeChatSettings(raw: unknown, base: ChatSettings = DEFAULT_CHAT_SETTINGS): ChatSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(r, k) && r[k] !== undefined && r[k] !== null;

  return {
    model: has("model") && isKnownChatModel(String(r.model)) ? String(r.model) : base.model,
    temperature: has("temperature") ? clampNumber(r.temperature, 0, 1.5, base.temperature) : base.temperature,
    maxToolLoops: has("maxToolLoops")
      ? Math.round(clampNumber(r.maxToolLoops, 1, 24, base.maxToolLoops))
      : base.maxToolLoops,
    thinkingLevel: has("thinkingLevel")
      ? pickEnum(r.thinkingLevel, THINKING_LEVELS, base.thinkingLevel)
      : base.thinkingLevel,
    thinkingDisplay: has("thinkingDisplay")
      ? pickEnum(r.thinkingDisplay, THINKING_DISPLAYS, base.thinkingDisplay)
      : base.thinkingDisplay,
    streamTokens: has("streamTokens") ? pickBool(r.streamTokens, base.streamTokens) : base.streamTokens,
    replyLanguage: has("replyLanguage")
      ? pickEnum(r.replyLanguage, REPLY_LANGUAGES, base.replyLanguage)
      : base.replyLanguage,
    replyStyle: has("replyStyle") ? pickEnum(r.replyStyle, REPLY_STYLES, base.replyStyle) : base.replyStyle,
    customInstructions: has("customInstructions")
      ? String(r.customInstructions).slice(0, 4000)
      : base.customInstructions,
    autonomy: has("autonomy") ? pickEnum(r.autonomy, AUTONOMIES, base.autonomy) : base.autonomy,
    allowWebSearch: has("allowWebSearch") ? pickBool(r.allowWebSearch, base.allowWebSearch) : base.allowWebSearch,
    allowMediaGen: has("allowMediaGen") ? pickBool(r.allowMediaGen, base.allowMediaGen) : base.allowMediaGen,
    allowPublishing: has("allowPublishing")
      ? pickBool(r.allowPublishing, base.allowPublishing)
      : base.allowPublishing,
    allowPlugins: has("allowPlugins") ? pickBool(r.allowPlugins, base.allowPlugins) : base.allowPlugins,
    memoryEnabled: has("memoryEnabled") ? pickBool(r.memoryEnabled, base.memoryEnabled) : base.memoryEnabled,
    memoryAutoSave: has("memoryAutoSave") ? pickBool(r.memoryAutoSave, base.memoryAutoSave) : base.memoryAutoSave,
    memoryRecallTopK: has("memoryRecallTopK")
      ? Math.round(clampNumber(r.memoryRecallTopK, 0, 30, base.memoryRecallTopK))
      : base.memoryRecallTopK,
    toolVisibility: has("toolVisibility")
      ? pickEnum(r.toolVisibility, TOOL_VISIBILITIES, base.toolVisibility)
      : base.toolVisibility,
    autoOpenLinks: has("autoOpenLinks") ? pickBool(r.autoOpenLinks, base.autoOpenLinks) : base.autoOpenLinks,
    showSuggestions: has("showSuggestions")
      ? pickBool(r.showSuggestions, base.showSuggestions)
      : base.showSuggestions,
  };
}

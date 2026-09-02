// ============================================================================
// CONTROLLER TOOL REGISTRY
//
// One list the runtime plans with: the 43 existing marketing/publishing/plugin
// tools (which write to the SAME tables every dashboard tab reads), plus the
// controller's own navigation, memory, analysis and capability tools, plus any
// MCP tools the workspace attached.
//
// Also owns the JSON-Schema → Gemini FunctionDeclaration conversion, because
// Vertex rejects the vendor-neutral keywords the existing tools happen to use.
// ============================================================================

import type { FunctionDeclaration } from "@google/genai";
import { TOOLS as MARKETING_TOOLS, type ToolContext, type ToolDef } from "@/lib/agents/chat/tools";
import { getWorkspaceMcpTools } from "@/lib/mcp/tools";
import type { ChatSettings } from "../settings";
import { NAVIGATION_TOOLS } from "./navigation";
import { MEMORY_TOOLS } from "./memory";
import { ANALYSIS_TOOLS } from "./analysis";
import { PLUGIN_TOOLS } from "./plugins";

export type { ToolContext, ToolDef };

/**
 * Tools that change something outside this chat (publish, delete, push, spend
 * credits). Surfaced to the UI and gated by the `confirm` autonomy setting.
 */
export const MUTATING_TOOLS = new Set([
  "publish_post",
  "delete_post",
  "approve_content",
  "cancel_scheduled_post",
  "schedule_post",
  "reschedule_post",
  "update_brand_dna",
  "update_lead_goal",
  "recalculate_growth_strategy",
  "github_create_repo",
  "github_push_files",
  "heygen_generate_video",
  "forget",
]);

/** Tools whose work is worth showing as a card rather than only as prose. */
export const MEDIA_TOOLS = new Set(["generate_image", "generate_video", "heygen_generate_video"]);

const WEB_TOOLS = new Set(["search_web", "fetch_serp", "scrape_url"]);
const PUBLISH_TOOLS = new Set(["publish_post", "approve_content", "schedule_post", "reschedule_post"]);
const PLUGIN_TOOL_PREFIXES = ["github_", "heygen_", "mcp__"];

function isPluginTool(name: string): boolean {
  return PLUGIN_TOOL_PREFIXES.some((p) => name.startsWith(p));
}

/**
 * Assembles the tool list for one turn, honouring the workspace's autonomy
 * switches. A disabled capability is removed entirely rather than refused at
 * call time, so the model never plans around a tool it cannot use.
 */
export async function buildToolRegistry(
  workspaceId: string,
  settings: ChatSettings
): Promise<{ tools: ToolDef[]; mcpCount: number }> {
  const base: ToolDef[] = [
    ...MARKETING_TOOLS,
    ...NAVIGATION_TOOLS,
    ...MEMORY_TOOLS,
    ...ANALYSIS_TOOLS,
    ...PLUGIN_TOOLS,
  ];

  let mcpTools: ToolDef[] = [];
  if (settings.allowPlugins) {
    try {
      mcpTools = await getWorkspaceMcpTools(workspaceId);
    } catch (err) {
      console.warn("[ToolRegistry] MCP load failed:", err instanceof Error ? err.message : err);
    }
  }

  const all = [...base, ...mcpTools];

  const filtered = all.filter((tool) => {
    if (!settings.allowWebSearch && WEB_TOOLS.has(tool.name)) return false;
    if (!settings.allowMediaGen && MEDIA_TOOLS.has(tool.name)) return false;
    if (!settings.allowPublishing && PUBLISH_TOOLS.has(tool.name)) return false;
    if (!settings.allowPlugins && isPluginTool(tool.name)) return false;
    if (!settings.memoryEnabled && ["remember", "recall", "list_memories", "forget"].includes(tool.name)) return false;
    return true;
  });

  // Later definitions win, so a workspace tool can never be shadowed twice.
  const byName = new Map<string, ToolDef>();
  for (const tool of filtered) byName.set(tool.name, tool);

  return { tools: Array.from(byName.values()), mcpCount: mcpTools.length };
}

// ---------------------------------------------------------------------------
// JSON Schema → Gemini Schema
// ---------------------------------------------------------------------------

const TYPE_MAP: Record<string, string> = {
  string: "STRING",
  number: "NUMBER",
  integer: "INTEGER",
  boolean: "BOOLEAN",
  array: "ARRAY",
  object: "OBJECT",
  null: "NULL",
};

const SUPPORTED_KEYS = new Set([
  "type", "description", "enum", "items", "properties", "required", "nullable",
  "format", "minimum", "maximum", "pattern", "title", "anyOf",
]);

/**
 * Vertex's Schema is a strict OpenAPI subset: unknown keywords such as
 * `additionalProperties`, `$schema`, `default` or `oneOf` make the whole
 * request fail with INVALID_ARGUMENT, and `type` must be the uppercase enum.
 * Depth is capped because Gemini rejects deeply nested tool schemas.
 */
export function toGeminiSchema(schema: any, depth = 0): any {
  if (!schema || typeof schema !== "object") return { type: "STRING" };
  if (depth > 5) return { type: "STRING", description: "Nested value (schema depth capped)." };

  const out: Record<string, any> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (!SUPPORTED_KEYS.has(key)) continue;

    if (key === "type") {
      const raw = Array.isArray(value) ? value.find((v) => v !== "null") : value;
      const mapped = TYPE_MAP[String(raw || "string").toLowerCase()];
      out.type = mapped || "STRING";
      if (Array.isArray(value) && value.includes("null")) out.nullable = true;
      continue;
    }

    if (key === "properties" && value && typeof value === "object") {
      const props: Record<string, any> = {};
      for (const [propName, propSchema] of Object.entries(value as Record<string, any>)) {
        props[propName] = toGeminiSchema(propSchema, depth + 1);
      }
      out.properties = props;
      continue;
    }

    if (key === "items") {
      out.items = toGeminiSchema(value, depth + 1);
      continue;
    }

    if (key === "anyOf" && Array.isArray(value)) {
      out.anyOf = value.map((v) => toGeminiSchema(v, depth + 1));
      continue;
    }

    if (key === "enum") {
      // Gemini only accepts string enums, and only on STRING-typed schemas.
      const values = Array.isArray(value) ? value.map((v) => String(v)) : [];
      if (values.length > 0) out.enum = values;
      continue;
    }

    if (key === "required" && Array.isArray(value)) {
      out.required = value.map((v) => String(v));
      continue;
    }

    out[key] = value;
  }

  if (!out.type) out.type = out.properties ? "OBJECT" : "STRING";
  if (out.enum && out.type !== "STRING") delete out.enum;

  // An OBJECT with no properties is rejected; give it a permissive shape.
  if (out.type === "OBJECT" && (!out.properties || Object.keys(out.properties).length === 0)) {
    delete out.properties;
    delete out.required;
  }

  // `required` must only name declared properties.
  if (out.required && out.properties) {
    out.required = (out.required as string[]).filter((r) => r in out.properties);
    if (out.required.length === 0) delete out.required;
  } else if (out.required && !out.properties) {
    delete out.required;
  }

  return out;
}

/** Gemini caps tool names at 64 chars of [a-zA-Z0-9_.-]. */
function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
}

/**
 * Converts tools into function declarations. Returns the mapping back to the
 * original tool names, since sanitizing can rename an MCP tool.
 */
export function toFunctionDeclarations(tools: ToolDef[]): {
  declarations: FunctionDeclaration[];
  nameMap: Map<string, string>;
} {
  const declarations: FunctionDeclaration[] = [];
  const nameMap = new Map<string, string>();
  const used = new Set<string>();

  for (const tool of tools) {
    let safe = sanitizeToolName(tool.name);
    if (used.has(safe)) {
      let n = 2;
      while (used.has(`${safe.slice(0, 60)}_${n}`)) n++;
      safe = `${safe.slice(0, 60)}_${n}`;
    }
    used.add(safe);
    nameMap.set(safe, tool.name);

    const params = toGeminiSchema(tool.parameters || { type: "object", properties: {} });
    if (params.type !== "OBJECT") {
      // Function parameters must be an object at the top level.
      declarations.push({
        name: safe,
        description: tool.description.slice(0, 1024),
        parameters: { type: "OBJECT", properties: {} } as any,
      });
      continue;
    }

    declarations.push({
      name: safe,
      description: tool.description.slice(0, 1024),
      parameters: params as any,
    });
  }

  return { declarations, nameMap };
}

/** Compact catalogue for the system prompt (grouped, so the model can scan it). */
export function describeToolsForPrompt(tools: ToolDef[]): string {
  const groups: { title: string; match: (name: string) => boolean }[] = [
    { title: "Research & web", match: (n) => WEB_TOOLS.has(n) },
    { title: "Media generation", match: (n) => MEDIA_TOOLS.has(n) },
    { title: "Navigation (deep links)", match: (n) => n === "open_tab" },
    { title: "Memory", match: (n) => ["remember", "recall", "list_memories", "forget"].includes(n) },
    { title: "Attachment analysis", match: (n) => ["analyze_media", "inspect_project", "read_uploaded_files"].includes(n) },
    { title: "Plugins & capabilities", match: (n) => n === "list_capabilities" || isPluginTool(n) },
  ];

  const claimed = new Set<string>();
  const sections: string[] = [];

  for (const group of groups) {
    const members = tools.filter((t) => group.match(t.name) && !claimed.has(t.name));
    if (members.length === 0) continue;
    for (const m of members) claimed.add(m.name);
    sections.push(`### ${group.title}\n` + members.map((t) => `- ${t.name}: ${t.description.split("\n")[0]}`).join("\n"));
  }

  const rest = tools.filter((t) => !claimed.has(t.name));
  if (rest.length > 0) {
    sections.push(
      `### Workspace data, content & publishing\n` +
        rest.map((t) => `- ${t.name}: ${t.description.split("\n")[0]}`).join("\n")
    );
  }

  return sections.join("\n\n");
}

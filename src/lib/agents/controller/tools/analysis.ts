// ============================================================================
// CONTROLLER TOOLS — ANALYSIS
//
// Deep analysis of whatever the user attached. Text-bearing files (pdf/docx/
// xlsx/pptx/zip/csv) are already parsed into `ctx.uploadedFiles` by
// documentParser; these tools cover the two things that needs more:
//
//   • analyze_media — hands image/video/audio bytes to the multimodal model, so
//     the controller can actually watch a video or read a screenshot.
//   • inspect_project — turns a zip/folder upload into a real code-level
//     understanding (languages, entry points, scripts, dependency graph) which
//     is what "make a proper README with a mermaid diagram" needs.
// ============================================================================

import type { Part } from "@google/genai";
import type { ToolDef } from "@/lib/agents/chat/tools";
import { vertexProvider, MODELS } from "../../llm";

interface UploadedFile {
  name: string;
  content: string;
  type: string;
  size?: number;
}

function dataUrlToInlinePart(content: string, fallbackMime: string): Part | null {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(content || "");
  if (match) {
    return { inlineData: { mimeType: match[1] || fallbackMime, data: match[2] } };
  }
  return null;
}

function isMediaFile(f: UploadedFile): boolean {
  const t = (f.type || "").toLowerCase();
  return (
    t.startsWith("image/") ||
    t.startsWith("video/") ||
    t.startsWith("audio/") ||
    /\.(png|jpe?g|webp|gif|mp4|mov|webm|mkv|mp3|wav|m4a|aac|ogg)$/i.test(f.name || "")
  );
}

// --- project inspection helpers ------------------------------------------------

const CODE_EXT_LANGUAGE: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript (React)", js: "JavaScript", jsx: "JavaScript (React)",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", swift: "Swift",
  cs: "C#", cpp: "C++", cc: "C++", c: "C", h: "C/C++ header", php: "PHP", sql: "SQL",
  sh: "Shell", css: "CSS", scss: "SCSS", html: "HTML", vue: "Vue", svelte: "Svelte",
  json: "JSON", yml: "YAML", yaml: "YAML", toml: "TOML", md: "Markdown", prisma: "Prisma schema",
};

const MANIFEST_FILES = [
  "package.json", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml",
  "build.gradle", "Gemfile", "composer.json", "Dockerfile", "docker-compose.yml",
  "next.config.js", "next.config.ts", "tsconfig.json", "vite.config.ts", "schema.prisma",
];

function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,10})$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

function baseName(path: string): string {
  const parts = String(path || "").split("/");
  return parts[parts.length - 1] || path;
}

export const ANALYSIS_TOOLS: ToolDef[] = [
  {
    name: "analyze_media",
    description:
      "Actually look at (or listen to) an attached image, video, or audio file and answer a question about it. " +
      "Use this for 'what's in this video', 'describe this screenshot', 'what does this ad say', 'transcribe this', " +
      "or before writing a caption for media the user uploaded. Works on the files the user attached to this message.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            "What you need to know about the media. Be specific — 'describe every scene, the on-screen text, the pacing, and the mood' beats 'describe this'.",
        },
        fileName: {
          type: "string",
          description: "Which attachment to analyse. Omit to analyse every attached image/video/audio together.",
        },
      },
      required: ["question"],
    },
    execute: async (args, ctx) => {
      const files = ((ctx.uploadedFiles || []) as UploadedFile[]).filter(isMediaFile);
      if (files.length === 0) {
        return {
          error:
            "No image, video, or audio attachment is present on this message. Ask the user to attach the file they want analysed.",
        };
      }

      const wanted = args.fileName
        ? files.filter((f) => f.name === args.fileName || baseName(f.name) === baseName(String(args.fileName)))
        : files;

      if (wanted.length === 0) {
        return {
          error: `No attachment named "${args.fileName}". Attached media: ${files.map((f) => f.name).join(", ")}`,
        };
      }

      const parts: Part[] = [];
      const analysed: string[] = [];
      const skipped: string[] = [];

      for (const f of wanted.slice(0, 4)) {
        const part = dataUrlToInlinePart(f.content, f.type || "application/octet-stream");
        if (part) {
          parts.push(part);
          analysed.push(f.name);
        } else {
          skipped.push(f.name);
        }
      }

      if (parts.length === 0) {
        return {
          error:
            "The attachment reached the tool without decodable binary content, so the model cannot see it. Ask the user to re-attach it.",
        };
      }

      parts.push({
        text:
          `Analyse the attached media and answer precisely. Report only what is actually visible/audible — never guess.\n\n` +
          `Question: ${args.question}\n\n` +
          `Structure the answer with short headed sections. If it is a video, include a timestamped beat-by-beat ` +
          `breakdown, all on-screen text verbatim, and the spoken audio transcript if there is speech.`,
      });

      ctx.onProgress?.(`Analysing ${analysed.length} file(s) with the vision model…`);

      try {
        const text = await vertexProvider.generateVisionText(parts, {
          modelName: MODELS.ORCHESTRATOR,
          temperature: 0.2,
        });
        return { analysis: text, filesAnalyzed: analysed, skipped: skipped.length > 0 ? skipped : undefined };
      } catch (err) {
        return { error: `Media analysis failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  },
  {
    name: "inspect_project",
    description:
      "Build a real structural understanding of an attached ZIP/project folder: file tree, languages, entry points, " +
      "package manifests, scripts, and dependencies. Call this BEFORE writing a README, an architecture diagram, or " +
      "pushing a project to GitHub — it gives you the actual contents instead of guesses.",
    parameters: {
      type: "object",
      properties: {
        fileName: { type: "string", description: "Which attached archive to inspect. Omit to use the first one." },
        includeFileContents: {
          type: "boolean",
          description: "Include the text of key manifest/source files (default true). Turn off for a tree-only view.",
        },
        maxFiles: { type: "number", description: "How many file contents to return (default 25, max 60)." },
      },
    },
    execute: async (args, ctx) => {
      const files = (ctx.uploadedFiles || []) as UploadedFile[];
      if (files.length === 0) {
        return { error: "No files are attached to this message." };
      }

      // documentParser flattens each archive into a text tree plus extracted
      // file contents, and the runtime passes that through as `content`.
      const archive =
        (args.fileName
          ? files.find((f) => f.name === args.fileName || baseName(f.name) === baseName(String(args.fileName)))
          : files.find((f) => /\.zip$/i.test(f.name) || (f.type || "").includes("zip"))) || files[0];

      if (!archive) {
        return { error: `No attachment named "${args.fileName}".` };
      }

      const raw = String(archive.content || "");
      if (!raw.trim()) {
        return { error: `"${archive.name}" contained no readable content.` };
      }

      // Reconstruct the path list from the parser's tree text.
      const paths = Array.from(
        new Set(
          raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => /[A-Za-z0-9_\-./]+\.[A-Za-z0-9]{1,10}$/.test(line) && !line.startsWith("#"))
            .map((line) => line.replace(/\s+\(.*$/, "").replace(/^[-*•]\s*/, ""))
            .filter((p) => p.length < 200)
        )
      );

      const languages: Record<string, number> = {};
      const directories = new Set<string>();
      for (const p of paths) {
        const ext = extOf(p);
        const lang = CODE_EXT_LANGUAGE[ext];
        if (lang) languages[lang] = (languages[lang] || 0) + 1;
        const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
        if (dir) directories.add(dir);
      }

      const manifests = paths.filter((p) => MANIFEST_FILES.includes(baseName(p)));
      const topDirs = Array.from(directories)
        .map((d) => d.split("/")[0])
        .reduce<Record<string, number>>((acc, d) => {
          if (d) acc[d] = (acc[d] || 0) + 1;
          return acc;
        }, {});

      const limit = Math.min(60, Math.max(1, Math.round(args.maxFiles || 25)));

      ctx.onProgress?.(`Mapped ${paths.length} path(s) across ${Object.keys(languages).length} language(s)…`);

      return {
        archive: archive.name,
        fileCount: paths.length,
        languages: Object.entries(languages)
          .sort((a, b) => b[1] - a[1])
          .map(([language, count]) => ({ language, count })),
        topLevelDirectories: Object.entries(topDirs)
          .sort((a, b) => b[1] - a[1])
          .map(([dir, count]) => ({ dir, count })),
        manifests,
        tree: raw.slice(0, 24_000),
        note:
          args.includeFileContents === false
            ? "File contents omitted by request."
            : `Tree and extracted contents above are capped for context safety (first ${limit} extracted files, 24k chars of tree).`,
      };
    },
  },
];

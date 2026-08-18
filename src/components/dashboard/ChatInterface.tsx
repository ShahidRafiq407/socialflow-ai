"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Send,
  Loader2,
  Bot,
  User,
  Paperclip,
  FolderOpen,
  Sparkles,
  Wrench,
  Brain,
  X,
  Plus,
  CheckCircle2,
  AlertCircle,
  Search,
  FileText,
  ChevronRight,
  Globe,
  Database,
  PenTool,
  Image as ImageIcon,
  Video as VideoIcon,
  Calendar as CalendarIcon,
} from "lucide-react";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  toolCalls?: any[];
}

interface ActivityItem {
  type: string;
  tool?: string;
  args?: any;
  result?: any;
  status?: "running" | "done";
  text?: string;
  count?: number;
}

interface UploadedFile {
  name: string;
  type: string;
  content: string;
}

const QUICK_COMMANDS = [
  { icon: Search, label: "Research latest trends", prompt: "Find the latest trending topics in my industry using live internet search and suggest 3 content ideas." },
  { icon: FileText, label: "Write a LinkedIn post", prompt: "Write a LinkedIn post using my Brand DNA." },
  { icon: ImageIcon, label: "Generate an image", prompt: "Generate a high-converting product showcase image for Instagram." },
  { icon: VideoIcon, label: "Create a Reel video", prompt: "Create a 9:16 vertical Reel video with visual motion prompt for TikTok." },
];

const TOOL_LABELS: Record<string, string> = {
  search_web: "Searching live internet",
  fetch_serp: "Running SERP analysis",
  scrape_url: "Scraping URL",
  get_brand_dna: "Reading Brand DNA",
  list_posts: "Listing posts",
  list_competitors: "Listing competitors",
  get_analytics: "Reading analytics",
  save_draft: "Saving draft post",
  schedule_post: "Scheduling post",
  generate_image: "Generating AI image (gemini-3-pro-image)",
  generate_video: "Generating AI video (gemini-omni-flash-preview)",
  create_campaign_post: "Creating full campaign post",
  update_brand_dna: "Updating Brand DNA",
  recall_memory: "Recalling memory",
  save_memory: "Saving memory",
  read_uploaded_files: "Reading uploaded files",
};

const IGNORED_DIRS =
  /(^|\/)(node_modules|\.git|\.next|dist|build|\.vercel|coverage|vendor|\.idea|\.vscode|out|\.turbo|\.cache|\.DS_Store)(\/|$)/;
const MAX_FILES = 200;

export function ChatInterface({ workspaceId }: { workspaceId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activity, isLoading]);

  function handleEvent(event: any) {
    if (event.type === "session") {
      if (event.sessionId) setSessionId(event.sessionId);
      return;
    }
    if (event.type === "error") {
      setError(event.message || "An error occurred in the AI brain.");
      return;
    }
    if (event.type === "tool_start") {
      setActivity((prev) => [...prev, { ...event, status: "running" }]);
    } else if (event.type === "tool_end") {
      setActivity((prev) =>
        prev.map((a) =>
          a.tool === event.tool && a.status === "running"
            ? { ...a, result: event.result, status: "done" }
            : a
        )
      );
    } else {
      setActivity((prev) => [...prev, event]);
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || isLoading) return;
    setInput("");
    setError("");
    setNotice("");
    setActivity([]);
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setIsLoading(true);

    let finalAnswer = "";
    const finalToolCalls: any[] = [];

    try {
      const res = await fetch("/api/agents/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, workspaceId, chatSessionId: sessionId, files }),
      });

      if (!res.ok || !res.body) throw new Error("Failed to connect to the brain.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(event);
            if (event.type === "done") finalAnswer = event.answer || "";
            if (event.type === "tool_end" && event.tool) finalToolCalls.push({ tool: event.tool, args: event.args, result: event.result });
          } catch {
            /* ignore partial */
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: finalAnswer || "No response.", toolCalls: finalToolCalls },
      ]);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong while contacting the AI brain." },
      ]);
    } finally {
      setIsLoading(false);
      setActivity([]);
      setFiles([]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;
    const read: UploadedFile[] = [];
    let skipped = 0;
    for (const f of Array.from(selected)) {
      const relPath = (f as any).webkitRelativePath || f.name;
      if (IGNORED_DIRS.test(relPath)) {
        skipped++;
        continue;
      }
      if (read.length >= MAX_FILES) break;
      const content = await readFileText(f);
      read.push({ name: relPath, type: f.type, content });
    }
    setFiles((prev) => [...prev, ...read]);
    if (skipped > 0) {
      setNotice(
        `Skipped ${skipped} system files (node_modules, .git, build, etc.). Loaded ${read.length} relevant files.`
      );
    } else {
      setNotice(`Loaded ${read.length} files.`);
    }
  }

  function readFileText(file: File): Promise<string> {
    return new Promise((resolve) => {
      // 1. Images → read as base64 data URL so Gemini can visually process them
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve(`[Image: ${file.name} — failed to read]`);
        reader.readAsDataURL(file);
        return;
      }

      // 2. PDFs → read as base64 data URL so Gemini multimodal engine can read documents
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve(`[PDF: ${file.name} — failed to read]`);
        reader.readAsDataURL(file);
        return;
      }

      // 3. Zip archives → provide structural summary
      if (/\.(zip|rar|7z|tar|gz)$/i.test(file.name)) {
        resolve(`[Archive file: ${file.name} (size: ${(file.size / 1024).toFixed(1)} KB)]`);
        return;
      }

      // 4. Executable / binary formats
      const binaryExt = /\.(exe|dll|so|dylib|bin|dat|iso|dmg|msi|apk|ipa|woff|woff2|ttf|otf|eot|mp3|mp4|avi|mov|mkv|wmv|flv|webm|ogg|wav|flac|aac|psd|ai|sketch|fig|blend|obj|stl|step|class|jar|pyc|o|a|lib|db|sqlite|sqlite3)$/i;
      if (binaryExt.test(file.name)) {
        resolve(`[Binary file: ${file.name} (${file.type || "unknown"}) — raw bytes not displayed]`);
        return;
      }

      // 5. Everything else (all code .ino, .py, .js, .ts, .md, .txt, .c, .cpp, .doc, configs, etc.) → read as text
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve(`[Failed to read: ${file.name}]`);
      reader.readAsText(file);
    });
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  function newChat() {
    setMessages([]);
    setActivity([]);
    setFiles([]);
    setSessionId(null);
    setError("");
    setNotice("");
  }

  return (
    <Card className="w-full flex flex-col h-full overflow-hidden py-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Marketing Brain</p>
            <p className="text-[11px] text-slate-500">Multi-agent AI that controls every tab with real data</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={newChat} className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Chat
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 dark:bg-slate-950/20">
        {messages.length === 0 && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-10">
            <Brain className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Your autonomous marketing AI team is ready</p>
            <p className="text-xs text-slate-400 max-w-sm">
              Ask anything — research trends, generate visual images (gemini-3-pro-image), create video reels, schedule posts, or read uploaded files.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="h-7 w-7 shrink-0 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center mt-0.5">
                <Bot className="h-3.5 w-3.5" />
              </div>
            )}
            <div className={`max-w-[80%] ${m.role === "user" ? "order-first" : ""}`}>
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-tr-sm"
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm"
                }`}
              >
                {m.content}
              </div>
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {m.toolCalls.map((t: any, j: number) => (
                    <span key={j} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      ⚙ {TOOL_LABELS[t.tool] || t.tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {m.role === "user" && (
              <div className="h-7 w-7 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center mt-0.5">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        ))}

        {/* Live agent activity — Claude-like expandable steps */}
        {isLoading && (
          <div className="flex gap-2.5 justify-start">
            <div className="h-7 w-7 shrink-0 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center mt-0.5">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="max-w-[85%] w-full rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3 text-xs space-y-1">
              {activity.length === 0 && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                </div>
              )}
              {activity.map((a, i) => {
                if (a.type === "memory") {
                  return <LiveStep key={i} icon={<Database className="h-3 w-3" />} label="Recalling long-term memory…" />;
                }
                if (a.type === "memory_done") {
                  return <LiveStep key={i} icon={<Database className="h-3 w-3" />} label={`Recalled ${a.count ?? 0} memories`} done detail={a.count ? "Loaded relevant context from past conversations" : "No relevant memories found"} />;
                }
                if (a.type === "planning") {
                  return <LiveStep key={i} icon={<Brain className="h-3 w-3" />} label="Planning which tools to use…" />;
                }
                if (a.type === "reasoning") {
                  return <LiveStep key={i} icon={<Sparkles className="h-3 w-3" />} label="Reasoning" done detail={a.text} />;
                }
                if (a.type === "synthesizing") {
                  return <LiveStep key={i} icon={<PenTool className="h-3 w-3" />} label="Writing final answer…" />;
                }
                if (a.type === "tool_start" || a.type === "tool_end") {
                  return (
                    <LiveStep
                      key={i}
                      icon={toolIcon(a.tool)}
                      label={toolStepLabel(a.tool, a.args)}
                      done={a.status === "done"}
                      detail={a.status === "done" ? formatToolResult(a.tool, a.result) : undefined}
                    />
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5">
        {notice && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {notice}
          </div>
        )}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f) => (
              <span key={f.name} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <FileText className="h-3 w-3 text-slate-400" />
                {f.name}
                <button type="button" onClick={() => removeFile(f.name)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {QUICK_COMMANDS.map((c) => {
              const Icon = c.icon;
              return (
                <button key={c.label} type="button" onClick={() => setInput(c.prompt)} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-400 transition-colors">
                  <Icon className="h-3 w-3" />
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <input type="file" multiple ref={fileInputRef} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <input
            type="file"
            multiple
            ref={folderInputRef}
            className="hidden"
            // @ts-ignore
            webkitdirectory=""
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button type="button" variant="outline" size="icon" title="Attach files / images / PDFs" onClick={() => fileInputRef.current?.click()} className="h-10 w-10 shrink-0">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" title="Upload folder" onClick={() => folderInputRef.current?.click()} className="h-10 w-10 shrink-0">
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Textarea
            placeholder="Ask the AI brain anything (e.g. 'generate an image and schedule a LinkedIn post')..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[40px] max-h-[120px] resize-none text-sm rounded-xl"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} className="h-10 px-4 rounded-xl font-semibold gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </Card>
  );
}

/* ── Expandable live step (Claude-like) ── */
function LiveStep({ icon, label, done, detail }: {
  icon: React.ReactNode;
  label: string;
  done?: boolean;
  detail?: string;
}) {
  if (detail) {
    return (
      <details className="group" open>
        <summary className="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          {done ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
          )}
          <span className="text-slate-500 shrink-0">{icon}</span>
          <span className="text-slate-700 dark:text-slate-200 font-medium">{label}</span>
          <ChevronRight className="h-3 w-3 text-slate-400 ml-auto shrink-0 transition-transform group-open:rotate-90" />
        </summary>
        <div className="ml-[22px] mt-1 pl-3 border-l-2 border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto">
          {detail}
        </div>
      </details>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
      )}
      <span className="text-slate-500 shrink-0">{icon}</span>
      <span className="text-slate-700 dark:text-slate-200 font-medium">{label}</span>
    </div>
  );
}

/* ── Tool step label with argument details ── */
function toolStepLabel(tool?: string, args?: any): string {
  const base = TOOL_LABELS[tool || ""] || tool || "Working";
  let detail = "";
  if (args?.query) detail = ` → "${args.query}"`;
  else if (args?.keyword) detail = ` → "${args.keyword}"`;
  else if (args?.url) detail = ` → ${args.url}`;
  else if (args?.platform) detail = ` → ${args.platform}${args.format ? ` (${args.format})` : ""}`;
  else if (args?.prompt) detail = ` → "${(args.prompt || "").slice(0, 40)}…"`;
  return `${base}${detail}`;
}

/* ── Tool-specific icon ── */
function toolIcon(tool?: string): React.ReactNode {
  switch (tool) {
    case "search_web": return <Globe className="h-3 w-3" />;
    case "fetch_serp": return <Search className="h-3 w-3" />;
    case "scrape_url": return <Globe className="h-3 w-3" />;
    case "get_brand_dna": return <Database className="h-3 w-3" />;
    case "list_posts": return <FileText className="h-3 w-3" />;
    case "list_competitors": return <Search className="h-3 w-3" />;
    case "get_analytics": return <Database className="h-3 w-3" />;
    case "save_draft": return <PenTool className="h-3 w-3" />;
    case "schedule_post": return <CalendarIcon className="h-3 w-3" />;
    case "generate_image": return <ImageIcon className="h-3 w-3" />;
    case "generate_video": return <VideoIcon className="h-3 w-3" />;
    case "create_campaign_post": return <Sparkles className="h-3 w-3" />;
    case "update_brand_dna": return <Database className="h-3 w-3" />;
    case "recall_memory": return <Brain className="h-3 w-3" />;
    case "save_memory": return <Brain className="h-3 w-3" />;
    case "read_uploaded_files": return <FileText className="h-3 w-3" />;
    default: return <Wrench className="h-3 w-3" />;
  }
}

/* ── Format tool results for the detail dropdown ── */
function formatToolResult(tool?: string, result?: any): string {
  if (!result) return "Completed.";
  if (result.error) return `Error: ${result.error}`;
  try {
    switch (tool) {
      case "search_web": {
        const sources = result.sources || [];
        let out = result.answer ? result.answer.slice(0, 400) : "";
        if (sources.length > 0) {
          out += "\n\nSources found:";
          for (const s of sources.slice(0, 5)) {
            out += `\n• ${s.title || s.url}${s.url ? " — " + s.url : ""}`;
          }
        }
        return out || "Search completed.";
      }
      case "fetch_serp": {
        const data = result.data || result;
        const results = data.topResults || [];
        let out = `Found ${results.length} organic results`;
        if (data.peopleAlsoAsk?.length) out += `, ${data.peopleAlsoAsk.length} PAA questions`;
        if (results.length > 0) {
          out += ":";
          for (const r of results.slice(0, 4)) {
            out += `\n${r.position}. ${r.title}\n   ${r.link}`;
          }
        }
        return out;
      }
      case "scrape_url": {
        const name = result.companyName || result.industry || "";
        return name ? `Extracted: ${name} (${result.industry || "unknown industry"})` : JSON.stringify(result).slice(0, 300);
      }
      case "get_brand_dna": {
        return `Brand: ${result.name || "—"}\nIndustry: ${result.industry || "—"}\nTone: ${result.tone || "—"}\nAudience: ${(result.targetAudience || "—").slice(0, 120)}`;
      }
      case "list_posts": {
        const posts = Array.isArray(result) ? result : [];
        return posts.length ? `Found ${posts.length} posts (${posts.map((p: any) => p.platform).filter(Boolean).join(", ")})` : "No posts found.";
      }
      case "list_competitors": {
        const comps = Array.isArray(result) ? result : [];
        return comps.length ? `Found ${comps.length} competitors:\n${comps.map((c: any) => `• ${c.name} (${c.platform})`).join("\n")}` : "No competitors tracked.";
      }
      case "get_analytics": {
        return `Impressions: ${result.totalImpressions?.toLocaleString() || "—"}\nClicks: ${result.totalClicks?.toLocaleString() || "—"}\nLeads: ${result.leadsAchieved || "—"}\nEngagement: ${result.avgEngagementRate || "—"}`;
      }
      case "generate_image": {
        return `Generated Image (gemini-3-pro-image)\nPlatform: ${result.platform || "Instagram"}\nAspect Ratio: ${result.aspectRatio || "1:1"}\nStatus: Saved to Content Library\nAsset URL: ${(result.url || "").slice(0, 80)}…`;
      }
      case "generate_video": {
        return `Generated Video Reel (gemini-omni-flash-preview)\nPlatform: ${result.platform || "Instagram"}\nAspect Ratio: ${result.aspectRatio || "9:16"}\nStatus: Saved to Media Assets\nVideo URL: ${(result.url || "").slice(0, 80)}…`;
      }
      case "schedule_post": {
        return `Post Scheduled for ${result.scheduledFor ? new Date(result.scheduledFor).toLocaleString() : "tomorrow"}\nPlatform: ${result.platform}\nStatus: SCHEDULED (Visible in Calendar & Content Library)`;
      }
      case "create_campaign_post": {
        return `Campaign Post Created & Saved!\nPlatform: ${result.platform}\nStatus: ${result.status}\nMedia: ${result.imageUrl ? "Image attached" : result.videoUrl ? "Video attached" : "Text"}\nID: ${result.id?.slice(0, 8) || "—"}`;
      }
      case "save_draft": {
        return `Draft saved → ${result.platform || ""} (${result.format || "Feed"})\nStatus: ${result.status || "DRAFT"} (Saved to Content Library)`;
      }
      case "read_uploaded_files": {
        const files = result.files || [];
        return files.length ? `Read ${files.length} files:\n${files.map((f: any) => `• ${f.name} (${f.type || "text"})`).join("\n")}` : result.note || "No files.";
      }
      default:
        return JSON.stringify(result).slice(0, 300);
    }
  } catch {
    return "Completed.";
  }
}




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
  { icon: Sparkles, label: "Summarize my analytics", prompt: "Summarize my workspace analytics and give me optimization tips." },
  { icon: Wrench, label: "Create a draft post", prompt: "Create a draft Instagram post about my latest product offering." },
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
      const textLike =
        file.type.startsWith("text/") ||
        /\.(txt|md|csv|json|js|ts|tsx|jsx|mjs|mts|html|css|py|java|c|h|cpp|rs|go|yml|yaml|xml|env|gitignore|prisma|sh|sql)$/i.test(
          file.name
        );
      if (textLike) {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve("");
        reader.readAsText(file);
      } else {
        resolve(`[Binary file: ${file.name} (${file.type || "unknown"}) — content not extracted in this version]`);
      }
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
    <Card className="w-full flex flex-col h-full overflow-hidden">
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
              Ask anything — research trends, write posts, create drafts, read uploaded files, or control any tab.
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

        {/* Live agent activity */}
        {isLoading && (
          <div className="flex gap-2.5 justify-start">
            <div className="h-7 w-7 shrink-0 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center mt-0.5">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3 text-xs space-y-1.5">
              {activity.length === 0 && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                </div>
              )}
              {activity.map((a, i) => {
                if (a.type === "memory") return <AgentStep key={i} label="Recalling memory…" done={false} />;
                if (a.type === "memory_done") return <AgentStep key={i} label={`Recalled ${a.count ?? 0} memories`} done />;
                if (a.type === "planning") return <AgentStep key={i} label="Planning tasks…" done={false} />;
                if (a.type === "reasoning") return <ReasonStep key={i} text={a.text || ""} />;
                if (a.type === "synthesizing") return <AgentStep key={i} label="Writing answer…" done={false} />;
                if (a.type === "tool_start" || a.type === "tool_end") {
                  return <AgentStep key={i} label={toolStepLabel(a.tool, a.args)} done={a.status === "done"} />;
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
          <Button type="button" variant="outline" size="icon" title="Attach files" onClick={() => fileInputRef.current?.click()} className="h-10 w-10 shrink-0">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" title="Upload folder" onClick={() => folderInputRef.current?.click()} className="h-10 w-10 shrink-0">
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Textarea
            placeholder="Ask the AI brain anything (e.g. 'research trends and schedule a post')..."
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

function AgentStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
      )}
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
    </div>
  );
}

function toolStepLabel(tool?: string, args?: any): string {
  const base = TOOL_LABELS[tool || ""] || tool || "Working";
  let detail = "";
  if (args?.query) detail = `: "${args.query}"`;
  else if (args?.keyword) detail = `: "${args.keyword}"`;
  else if (args?.url) detail = `: ${args.url}`;
  else if (args?.platform) detail = `: ${args.platform}${args.format ? ` (${args.format})` : ""}`;
  return `${base}${detail}`;
}

function ReasonStep({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <Sparkles className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />
      <span className="text-slate-600 dark:text-slate-300 italic">{text}</span>
    </div>
  );
}



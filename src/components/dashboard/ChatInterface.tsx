"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  History,
  MessageSquare,
  Copy,
  Check,
  Pencil,
  Download,
  Eye,
  Palette,
  ExternalLink,
  Trash2,
  Square,
  BarChart3,
  TrendingUp,
  RefreshCw,
  Layers,
  Clock,
  ArrowRight,
} from "lucide-react";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  toolCalls?: any[];
  suggestions?: string[];
}

interface ActivityItem {
  type: string;
  tool?: string;
  args?: any;
  result?: any;
  status?: "running" | "done" | "failed";
  text?: string;
  count?: number;
  progress?: string;
}

interface UploadedFile {
  name: string;
  type: string;
  content: string;
}

export interface ChatSessionItem {
  id: string;
  title: string;
  updatedAt: Date | string;
  messageCount?: number;
}

const QUICK_COMMANDS = [
  { icon: CalendarIcon, label: "Plan My Week", prompt: "Create a 7-day multi-platform content plan for my brand." },
  { icon: TrendingUp, label: "Find Trends", prompt: "Find the latest trending topics in my industry using live search and suggest 3 content ideas." },
  { icon: Sparkles, label: "Create Content", prompt: "Create today's social media content across my active platforms." },
  { icon: BarChart3, label: "Analyze Performance", prompt: "Analyze our recent content performance and tell me what we should change." },
  { icon: RefreshCw, label: "Repurpose Best Content", prompt: "Find my best-performing post and repurpose it for LinkedIn and X." },
  { icon: Layers, label: "Create Campaign", prompt: "Create a campaign for our new product launch with posts for all platforms." },
  { icon: Clock, label: "Manage Calendar", prompt: "Show me what is scheduled on my calendar for the next 7 days." },
  { icon: FileText, label: "Review Drafts", prompt: "Show me all drafts in my Content Library and help me finalize them." },
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
  get_post: "Reading post details",
  update_post: "Updating post",
  delete_post: "Deleting post",
  reschedule_post: "Rescheduling post",
  publish_post: "Publishing to social platform",
  approve_content: "Approving post",
  cancel_scheduled_post: "Cancelling scheduled post",
  get_calendar: "Reading scheduled calendar",
  get_workspace_state: "Checking workspace overview",
  list_campaigns: "Listing campaigns",
  get_content_library: "Browsing Content Library",
  repurpose_content: "Repurposing content",
  get_lead_goal: "Checking organic lead goal & KPIs",
  update_lead_goal: "Updating organic lead goal",
  recalculate_growth_strategy: "Recalculating growth strategy",
  explain_growth_strategy: "Analyzing strategy decisions",
};

const IGNORED_DIRS =
  /(^|\/)(node_modules|\.git|\.next|dist|build|\.vercel|coverage|vendor|\.idea|\.vscode|out|\.turbo|\.cache|\.DS_Store)(\/|$)/;
const MAX_FILES = 200;

export function ChatInterface({
  workspaceId,
  initialSessionId = null,
  initialMessages = [],
  initialSessionsList = [],
}: {
  workspaceId: string;
  initialSessionId?: string | null;
  initialMessages?: ChatMsg[];
  initialSessionsList?: ChatSessionItem[];
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [sessionsList, setSessionsList] = useState<ChatSessionItem[]>(initialSessionsList);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  function copyToClipboard(text: string, index: number) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  function editPrompt(text: string) {
    setInput(text);
    textareaRef.current?.focus();
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activity, isLoading]);

  function handleEvent(event: any) {
    if (event.type === "session") {
      if (event.sessionId) {
        setSessionId(event.sessionId);
        setSessionsList((prev) => {
          if (prev.some((s) => s.id === event.sessionId)) return prev;
          return [{ id: event.sessionId, title: event.title || "New Chat", updatedAt: new Date() }, ...prev];
        });
      }
      return;
    }
    if (event.type === "error") {
      setError(event.message || "An error occurred in the AI brain.");
      return;
    }
    if (event.type === "tool_progress") {
      setActivity((prev) =>
        prev.map((a) =>
          a.tool === event.tool && a.status === "running"
            ? { ...a, progress: event.progress, text: event.progress }
            : a
        )
      );
      return;
    }
    if (event.type === "tool_start") {
      setActivity((prev) => [...prev, { ...event, status: "running" }]);
    } else if (event.type === "tool_end") {
      const isFailed = Boolean(event.result?.error);
      setActivity((prev) =>
        prev.map((a) =>
          a.tool === event.tool && a.status === "running"
            ? { ...a, result: event.result, status: isFailed ? "failed" : "done" }
            : a
        )
      );
    } else {
      setActivity((prev) => [...prev, event]);
    }
  }

  async function loadSession(id: string) {
    if (id === sessionId) {
      setShowHistory(false);
      return;
    }
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/agents/chat/sessions?sessionId=${id}`);
      const data = await res.json();
      if (data?.session) {
        setSessionId(data.session.id);
        setMessages(
          (data.session.messages || []).map((m: any) => ({
            role: m.role === "USER" ? "user" : "assistant",
            content: m.content,
            toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls : undefined,
          }))
        );
      }
    } catch (e) {
      console.error("Failed to load session:", e);
    } finally {
      setLoadingHistory(false);
      setShowHistory(false);
    }
  }

  async function deleteSession(id: string) {
    if (!confirm("Are you sure you want to delete this chat?")) return;
    try {
      const res = await fetch(`/api/agents/chat/sessions?sessionId=${id}`, { method: "DELETE" });
      if (res.ok) {
        setSessionsList(prev => prev.filter(s => s.id !== id));
        if (id === sessionId) {
          setSessionId(null);
          setMessages([]);
        }
      }
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  }

  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
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
    let finalSuggestions: string[] = [];
    const finalToolCalls: any[] = [];
    
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch("/api/agents/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, workspaceId, chatSessionId: sessionId, files }),
        signal: abortControllerRef.current.signal,
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
            if (event.type === "done") {
              finalAnswer = event.answer || "";
              if (Array.isArray(event.suggestions)) {
                finalSuggestions = event.suggestions;
              }
            }
            if (event.type === "tool_end" && event.tool) finalToolCalls.push({ tool: event.tool, args: event.args, result: event.result });
          } catch {
            /* ignore partial */
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: finalAnswer || "No response.",
          toolCalls: finalToolCalls,
          suggestions: finalSuggestions.length > 0 ? finalSuggestions : undefined,
        },
      ]);
    } catch (err: any) {
      if (err.name === "AbortError") {
        setNotice("Generation stopped.");
      } else {
        setError(err.message || "Something went wrong.");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry, something went wrong while contacting the AI brain." },
        ]);
      }
    } finally {
      setIsLoading(false);
      setFiles([]);
      abortControllerRef.current = null;
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
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve(`[Image: ${file.name} — failed to read]`);
        reader.readAsDataURL(file);
        return;
      }
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve(`[PDF: ${file.name} — failed to read]`);
        reader.readAsDataURL(file);
        return;
      }
      if (/\.(zip|rar|7z|tar|gz)$/i.test(file.name)) {
        resolve(`[Archive file: ${file.name} (size: ${(file.size / 1024).toFixed(1)} KB)]`);
        return;
      }
      const binaryExt = /\.(exe|dll|so|dylib|bin|dat|iso|dmg|msi|apk|ipa|woff|woff2|ttf|otf|eot|mp3|mp4|avi|mov|mkv|wmv|flv|webm|ogg|wav|flac|aac|psd|ai|sketch|fig|blend|obj|stl|step|class|jar|pyc|o|a|lib|db|sqlite|sqlite3)$/i;
      if (binaryExt.test(file.name)) {
        resolve(`[Binary file: ${file.name} (${file.type || "unknown"}) — raw bytes not displayed]`);
        return;
      }
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
    setShowHistory(false);
  }

  return (
    <Card className="w-full flex flex-col h-full overflow-hidden py-0 relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Marketing Brain</p>
            <p className="text-[11px] text-slate-500">Autonomous marketing command center controlling your entire workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="h-8 text-xs gap-1.5"
            title="View chat history"
          >
            <History className="h-3.5 w-3.5" /> History {sessionsList.length > 0 && `(${sessionsList.length})`}
          </Button>
          <Button variant="outline" size="sm" onClick={newChat} className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Chat
          </Button>
        </div>
      </div>

      {/* Chat History Drawer / Dropdown */}
      {showHistory && (
        <div className="absolute top-[53px] right-4 z-50 w-80 max-h-[380px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Past Chat Sessions
            </p>
            <button type="button" onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {loadingHistory && (
            <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading session…
            </div>
          )}
          {!loadingHistory && sessionsList.length === 0 && (
            <div className="py-6 text-center text-xs text-slate-400">
              No previous chat history found.
            </div>
          )}
          {!loadingHistory &&
            sessionsList.map((s) => (
              <div key={s.id} className="relative group flex items-center">
                <button
                  type="button"
                  onClick={() => loadSession(s.id)}
                  className={`w-full text-left px-2.5 py-2 pr-8 rounded-lg text-xs transition-colors flex flex-col gap-0.5 ${
                    s.id === sessionId
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-medium"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="truncate font-medium flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3 shrink-0" />
                    {s.title || "Untitled Chat"}
                  </span>
                  <span className={`text-[10px] ${s.id === sessionId ? "opacity-80" : "text-slate-400"}`}>
                    {new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500 hover:text-white text-slate-400 transition-all"
                  title="Delete Chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 dark:bg-slate-950/20">
        {messages.length === 0 && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-10">
            <Brain className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Your autonomous marketing AI team is ready</p>
            <p className="text-xs text-slate-400 max-w-md">
              Give a natural-language instruction — plan weekly content, generate graphics & reels, research trends, manage your calendar, or analyze performance.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start w-full"}`}>
            {m.role === "assistant" && (
              <div className="h-8 w-8 shrink-0 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center mt-0.5 shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
            )}
            <div className={`${m.role === "user" ? "max-w-[80%]" : "flex-1 min-w-0"}`}>
              {m.role === "user" ? (
                <div className="group relative flex flex-col items-end">
                  <div className="rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-tr-sm shadow-sm">
                    {m.content}
                  </div>
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <button
                      type="button"
                      onClick={() => editPrompt(m.content)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Edit & resubmit prompt"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(m.content, i)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Copy prompt"
                    >
                      {copiedIndex === i ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col w-full min-w-0">
                  <div className="rounded-2xl px-4 py-3.5 text-sm bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-sm shadow-sm overflow-hidden leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
                        thead: ({ children }) => (
                          <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 font-semibold border-b border-slate-200 dark:border-slate-700">
                            {children}
                          </thead>
                        ),
                        tbody: ({ children }) => (
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {children}
                          </tbody>
                        ),
                        tr: ({ children }) => (
                          <tr className="even:bg-slate-50/50 dark:even:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            {children}
                          </tr>
                        ),
                        th: ({ children }) => (
                          <th className="px-3.5 py-2.5 border-r border-slate-200 dark:border-slate-700 last:border-r-0 font-semibold text-left whitespace-nowrap">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="px-3.5 py-2.5 border-r border-slate-100 dark:border-slate-800 last:border-r-0 align-top text-slate-700 dark:text-slate-300">
                            {children}
                          </td>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-bold text-slate-900 dark:text-slate-50">{children}</strong>
                        ),
                        p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-outside pl-5 my-2.5 space-y-1.5 leading-relaxed">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-outside pl-5 my-2.5 space-y-1.5 leading-relaxed">{children}</ol>,
                        li: ({ children }) => <li className="text-slate-700 dark:text-slate-300">{children}</li>,
                        h1: ({ children }) => <h1 className="text-lg font-bold text-slate-900 dark:text-white mt-4 mb-2 tracking-tight">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base font-bold text-slate-900 dark:text-white mt-3.5 mb-1.5 tracking-tight">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-3 mb-1">{children}</h3>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-slate-300 dark:border-slate-600 pl-3 my-2.5 italic text-slate-600 dark:text-slate-400">
                            {children}
                          </blockquote>
                        ),
                        code: ({ children, className }) => (
                          <CodeBlock className={className}>{children}</CodeBlock>
                        ),
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 font-medium underline underline-offset-2 hover:opacity-80">
                            {children}
                          </a>
                        ),
                        img: ({ src, alt }) => (
                          <GeneratedMediaCard src={typeof src === "string" ? src : undefined} alt={alt} />
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>

                  {/* Tool Call Badges */}
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {m.toolCalls.map((t: any, j: number) => {
                        const isErr = Boolean(t.result?.error);
                        return (
                          <span
                            key={j}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                              isErr
                                ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {isErr ? (
                              <AlertCircle className="h-2.5 w-2.5 text-red-500" />
                            ) : (
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                            )}
                            {TOOL_LABELS[t.tool] || t.tool}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Contextual Smart Action Suggestions */}
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex flex-col gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-indigo-500" /> Suggested next actions:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {m.suggestions.map((s, k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => {
                              setInput(s);
                              textareaRef.current?.focus();
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 transition-all text-left cursor-pointer"
                          >
                            <ArrowRight className="h-2.5 w-2.5 shrink-0 opacity-70" />
                            <span>{s}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Response Actions Toolbar */}
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(m.content, i)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Copy full response"
                    >
                      {copiedIndex === i ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" /> Copied to clipboard
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy Response
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {m.role === "user" && (
              <div className="h-8 w-8 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center mt-0.5">
                <User className="h-4 w-4" />
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
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Orchestrating plan…
                </div>
              )}
              {activity.map((a, i) => {
                if (
                  a.type === "memory" ||
                  a.type === "memory_done" ||
                  a.type === "planning" ||
                  a.type === "reasoning" ||
                  a.type === "synthesizing"
                ) {
                  return null;
                }
                if (a.type === "tool_start" || a.type === "tool_end") {
                  return (
                    <LiveStep
                      key={i}
                      icon={toolIcon(a.tool)}
                      label={toolStepLabel(a.tool, a.args)}
                      status={a.status}
                      progress={a.status === "running" ? a.progress : undefined}
                      detail={a.status === "done" || a.status === "failed" ? formatToolResult(a.tool, a.result) : (a.progress || undefined)}
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
                <button key={c.label} type="button" onClick={() => setInput(c.prompt)} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-400 transition-colors">
                  <Icon className="h-3 w-3 text-indigo-500" />
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
            ref={textareaRef}
            placeholder="Ask the AI brain anything (e.g. 'plan a 7-day content schedule', 'create a Reel and schedule it')..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[40px] max-h-[120px] resize-none text-sm rounded-xl"
          />
          {isLoading ? (
            <Button type="button" onClick={stopGeneration} className="h-10 px-4 rounded-xl font-semibold gap-1.5 bg-red-500 hover:bg-red-600 text-white" title="Stop generation">
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()} className="h-10 px-4 rounded-xl font-semibold gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </Card>
  );
}

/* ── Expandable live step (Claude-like) ── */
function LiveStep({ icon, label, status = "running", detail, progress }: {
  icon: React.ReactNode;
  label: string;
  status?: "running" | "done" | "failed";
  detail?: string;
  progress?: string;
}) {
  const isDone = status === "done";
  const isFailed = status === "failed";

  const statusIcon = isFailed ? (
    <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
  ) : isDone ? (
    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
  ) : (
    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
  );

  if (detail) {
    return (
      <details className="group" open>
        <summary className="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          {statusIcon}
          <span className="text-slate-500 shrink-0">{icon}</span>
          <span className={`font-medium ${isFailed ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200"}`}>{label}</span>
          {progress && !isDone && !isFailed && (
            <span className="text-[11px] font-normal text-indigo-600 dark:text-indigo-400 ml-2">
              ({progress})
            </span>
          )}
          <ChevronRight className="h-3 w-3 text-slate-400 ml-auto shrink-0 transition-transform group-open:rotate-90" />
        </summary>
        <div className={`ml-[22px] mt-1 pl-3 border-l-2 text-[11px] whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto ${
          isFailed
            ? "border-red-300 dark:border-red-800 text-red-600 dark:text-red-400"
            : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
        }`}>
          {detail}
        </div>
      </details>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {statusIcon}
      <span className="text-slate-500 shrink-0">{icon}</span>
      <span className={`font-medium ${isFailed ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200"}`}>{label}</span>
      {progress && !isDone && !isFailed && (
        <span className="text-[11px] font-normal text-indigo-600 dark:text-indigo-400 ml-2">
          ({progress})
        </span>
      )}
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
  else if (args?.prompt) detail = ` → "${(args.prompt || "").slice(0, 35)}…"`;
  else if (args?.targetPlatform) detail = ` → to ${args.targetPlatform}`;
  else if (args?.topic) detail = ` → "${args.topic}"`;
  else if (args?.scheduledFor) detail = ` → ${new Date(args.scheduledFor).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  else if (args?.id) detail = ` → #${args.id.slice(0, 8)}`;
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
    case "get_analytics": return <BarChart3 className="h-3 w-3" />;
    case "save_draft": return <PenTool className="h-3 w-3" />;
    case "schedule_post": return <CalendarIcon className="h-3 w-3" />;
    case "generate_image": return <ImageIcon className="h-3 w-3" />;
    case "generate_video": return <VideoIcon className="h-3 w-3" />;
    case "create_campaign_post": return <Sparkles className="h-3 w-3" />;
    case "update_brand_dna": return <Database className="h-3 w-3" />;
    case "recall_memory": return <Brain className="h-3 w-3" />;
    case "save_memory": return <Brain className="h-3 w-3" />;
    case "read_uploaded_files": return <FileText className="h-3 w-3" />;
    case "get_post": return <FileText className="h-3 w-3" />;
    case "update_post": return <Pencil className="h-3 w-3" />;
    case "delete_post": return <Trash2 className="h-3 w-3" />;
    case "reschedule_post": return <CalendarIcon className="h-3 w-3" />;
    case "publish_post": return <ExternalLink className="h-3 w-3" />;
    case "approve_content": return <CheckCircle2 className="h-3 w-3" />;
    case "cancel_scheduled_post": return <X className="h-3 w-3" />;
    case "get_calendar": return <CalendarIcon className="h-3 w-3" />;
    case "get_workspace_state": return <Layers className="h-3 w-3" />;
    case "list_campaigns": return <Sparkles className="h-3 w-3" />;
    case "get_content_library": return <FolderOpen className="h-3 w-3" />;
    case "repurpose_content": return <RefreshCw className="h-3 w-3" />;
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
        const searchDate = result.searchDate || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const queries = result.executedQueries && result.executedQueries.length > 0 ? result.executedQueries : [result.query || "Web Search"];
        const sources = result.sources || [];
        
        let out = `🔎 LIVE WEB RESEARCH\nSearch Date: ${searchDate}\n`;
        if (queries.length === 1) {
          out += `Executed Query: "${queries[0]}"\n`;
        } else {
          out += `Executed Queries (${queries.length}):\n${queries.map((q: string, idx: number) => `  ${idx + 1}. "${q}"`).join("\n")}\n`;
        }
        out += `Sources Found: ${sources.length}\n`;

        if (sources.length > 0) {
          out += `\nVerified Sources:\n`;
          for (const s of sources.slice(0, 6)) {
            const domain = s.domain || (s.url ? (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return ""; } })() : "");
            const pubDate = s.publicationDate || "Publication date unavailable";
            out += `• [${s.title || domain || "Source"}]${domain ? ` (${domain})` : ""}\n`;
            if (s.url) out += `  URL: ${s.url}\n`;
            out += `  Published: ${pubDate} | Searched: ${s.searchDate || searchDate}\n`;
            if (s.relevanceRationale) out += `  Relevance: ${s.relevanceRationale}\n`;
          }
        }

        if (result.answer) {
          out += `\nKey Research Findings:\n${result.answer.slice(0, 500)}${result.answer.length > 500 ? "…" : ""}`;
        }

        return out.trim() || "Search completed.";
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
      case "update_brand_dna": {
        return "Brand DNA updated and saved to workspace settings.";
      }
      case "recall_memory": {
        const mems = Array.isArray(result) ? result : [];
        return mems.length ? `Recalled ${mems.length} long-term facts:\n${mems.map((m: any) => `• [${m.category}] ${m.content}`).join("\n")}` : "No matching memories.";
      }
      case "save_memory": {
        return "Fact stored in long-term memory store.";
      }
      case "get_post": {
        return `Post Details (#${result.id?.slice(0, 8)})\nPlatform: ${result.platform} (${result.format || "Feed"})\nStatus: ${result.status}\nScheduled: ${result.scheduledFor ? new Date(result.scheduledFor).toLocaleString() : "None"}\nContent: ${(result.content || "").slice(0, 100)}…`;
      }
      case "update_post": {
        return `Post Updated (#${result.id?.slice(0, 8)})\nPlatform: ${result.platform} (${result.format || "Feed"})\nStatus: ${result.status}`;
      }
      case "delete_post": {
        return `Post Deleted (#${result.id?.slice(0, 8)})\nPlatform: ${result.platform || "—"}\nStatus: Removed from Content Library`;
      }
      case "reschedule_post": {
        return `Post Rescheduled (#${result.id?.slice(0, 8)})\nNew Date: ${result.newDate ? new Date(result.newDate).toLocaleString() : "—"}\nPlatform: ${result.platform}\nStatus: SCHEDULED`;
      }
      case "publish_post": {
        return `Published to ${result.platform} (#${result.id?.slice(0, 8)})\nStatus: ${result.status}${result.publishedAt ? ` at ${new Date(result.publishedAt).toLocaleTimeString()}` : ""}${result.publishError ? `\nError: ${result.publishError}` : ""}`;
      }
      case "approve_content": {
        return `Content Approved (#${result.id?.slice(0, 8)})\nPlatform: ${result.platform}\nStatus: ${result.status}`;
      }
      case "cancel_scheduled_post": {
        return `Post Cancelled (#${result.id?.slice(0, 8)})\nStatus: Moved back to DRAFT (unscheduled)`;
      }
      case "get_calendar": {
        const count = result.count || 0;
        const posts = result.posts || [];
        if (count === 0) return "No scheduled posts found in this date range.";
        return `Found ${count} scheduled items:\n${posts.map((p: any) => `• [${p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}] ${p.platform} (${p.format}): "${p.contentPreview}"`).join("\n")}`;
      }
      case "get_workspace_state": {
        const platforms = (result.connectedPlatforms || []).map((p: any) => p.platform).join(", ");
        const counts = Object.entries(result.contentCounts || {}).map(([k, v]) => `${k}: ${v}`).join(" | ");
        return `Workspace Overview\nConnected: ${platforms || "None"}\nContent Counts: ${counts || "0 posts"}\nBrand: ${result.brandDNA?.name || "—"} (${result.brandDNA?.tone || "standard"})`;
      }
      case "list_campaigns": {
        const campaigns = result.campaigns || [];
        if (campaigns.length === 0) return result.note || "No campaigns found.";
        return `Found ${campaigns.length} campaigns:\n${campaigns.map((c: any) => `• "${c.campaignTopic}": ${c.totalPosts} posts`).join("\n")}`;
      }
      case "get_content_library": {
        const count = result.count || 0;
        const posts = result.posts || [];
        if (count === 0) return "No posts match the filter criteria.";
        return `Content Library (${count} items):\n${posts.slice(0, 6).map((p: any) => `• [${p.status}] ${p.platform} (${p.format}): "${p.contentPreview}"`).join("\n")}`;
      }
      case "repurpose_content": {
        return `Repurposed for ${result.targetPlatform} (${result.targetFormat})\nNew Draft ID: #${result.id?.slice(0, 8)}\nStatus: DRAFT (Saved to Content Library)\nPreview: "${result.contentPreview}"`;
      }
      default:
        return JSON.stringify(result).slice(0, 300);
    }
  } catch {
    return "Completed.";
  }
}

/* ── VIP Google Gemini Style Table Component with Copy Action ── */
function MarkdownTable({ children }: { children?: React.ReactNode }) {
  const [tableCopied, setTableCopied] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  function copyTableText() {
    if (!tableRef.current) return;
    const text = tableRef.current.innerText;
    navigator.clipboard.writeText(text);
    setTableCopied(true);
    setTimeout(() => setTableCopied(false), 2000);
  }

  return (
    <div className="my-3.5 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm bg-white dark:bg-slate-900/90">
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
          <FileText className="h-3.5 w-3.5 text-indigo-500" /> Structured Table
        </span>
        <button
          type="button"
          onClick={copyTableText}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          title="Copy table data"
        >
          {tableCopied ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" /> Copied Table
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy Table
            </>
          )}
        </button>
      </div>
      <div ref={tableRef} className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">{children}</table>
      </div>
    </div>
  );
}

/* ── VIP Google Gemini Style Code Block Component with Copy Action ── */
function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const codeText = String(children).replace(/\n$/, "");
  const langMatch = /language-(\w+)/.exec(className || "");
  const lang = langMatch ? langMatch[1] : "";

  function copyCode() {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!className && !String(children).includes("\n")) {
    return (
      <code className="bg-slate-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-[12px] font-mono">
        {children}
      </code>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-950 text-slate-100 font-mono text-xs shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
        <span>{lang || "code"}</span>
        <button
          type="button"
          onClick={copyCode}
          className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[12px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

/* ── VIP Google Gemini Style Generated Media Card with Studio & Content Library Actions ── */
function GeneratedMediaCard({ src, alt }: { src?: string; alt?: string }) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);

  if (!src) return null;

  const isVideo = src.startsWith("data:video") || /\.(mp4|webm|mov)$/i.test(src);

  function handleDownload() {
    if (!src) return;
    setDownloading(true);
    try {
      const link = document.createElement("a");
      link.href = src;
      link.download = isVideo ? `socialflow-video-${Date.now()}.mp4` : `socialflow-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setTimeout(() => setDownloading(false), 1500);
    }
  }

  function handleOpenStudio() {
    try {
      sessionStorage.setItem(
        "socialflow:openInStudio",
        JSON.stringify({
          imageUrl: src,
          content: alt || "AI Generated Marketing Asset",
          mediaType: isVideo ? "video" : "image",
          format: isVideo ? "Reel" : "Feed",
        })
      );
      router.push("/dashboard/ai-studio");
    } catch (e) {
      console.error(e);
      router.push("/dashboard/ai-studio");
    }
  }

  return (
    <div className="my-3.5 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-800/40 shadow-md max-w-2xl">
      <div className="relative group overflow-hidden bg-slate-950 flex items-center justify-center min-h-[180px]">
        {isVideo ? (
          <video src={src} controls className="w-full max-h-[440px] rounded-t-xl object-contain bg-black" />
        ) : (
          <img src={src} alt={alt || "Generated visual"} className="w-full max-h-[440px] object-contain rounded-t-xl transition-transform hover:scale-[1.01] duration-300" />
        )}
      </div>

      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>Saved to Content Library</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push("/dashboard/content")}
            className="h-8 px-3 text-xs font-semibold gap-1.5 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shadow-2xs"
          >
            <Eye className="h-3.5 w-3.5 text-slate-500" /> Content Board
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleOpenStudio}
            className="h-8 px-3 text-xs font-semibold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-2xs"
          >
            <Palette className="h-3.5 w-3.5" /> {isVideo ? "Edit in Studio (Reel)" : "Edit in Studio (Feed)"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDownload}
            className="h-8 px-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shadow-2xs"
            title="Download high-resolution file"
          >
            {downloading ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Download className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}




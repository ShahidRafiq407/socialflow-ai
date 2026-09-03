"use client";

/**
 * ARTICLE EDITOR — the preview, the HTML and the schema, all editable
 *
 * A `contentEditable` surface cannot be a controlled React node: writing the
 * value back on every keystroke moves the caret to the start. So the DOM owns the
 * text while the editor is focused, and the parent's value is only pushed in when
 * it differs from what is already rendered — a regenerate or an HTML-tab edit.
 *
 * The styling is `.article-body` from `globals.css`. The old build injected a
 * 165-line `<style>` tag full of literal hex codes here, which is why the preview
 * stayed indigo-and-amber no matter which theme the dashboard was in.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Bold,
  Code2,
  Copy,
  Eye,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  MoveDown,
  MoveUp,
  Quote,
  Redo2,
  ScrollText,
  Trash2,
  Undo2,
  Unlink,
} from "lucide-react";
import type { EditorView } from "./constants";

export interface ArticleEditorHandle {
  /** Drops HTML at the caret, or at the end when the editor was never focused. */
  insertHtml: (html: string) => void;
  /** The live HTML, read straight from the DOM. */
  read: () => string;
}

export interface ArticleEditorProps {
  html: string;
  onChange: (html: string) => void;
  schemaMarkup: string;
  view: EditorView;
  onViewChange: (view: EditorView) => void;
  onOpenMedia: () => void;
  onNotify: (tone: "success" | "error" | "info", text: string) => void;
  wordCount: number;
  targetWordCount: number;
}
const MEDIA_SELECTOR = "figure, img, iframe";

const ArticleEditor = forwardRef<ArticleEditorHandle, ArticleEditorProps>(function ArticleEditor(
  {
    html,
    onChange,
    schemaMarkup,
    view,
    onViewChange,
    onOpenMedia,
    onNotify,
    wordCount,
    targetWordCount,
  },
  ref
) {
  const surface = useRef<HTMLDivElement | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<HTMLElement | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  /** Pushes the parent's value in only when the DOM is out of step with it. */
  useEffect(() => {
    const node = surface.current;
    if (!node || view !== "preview") return;
    if (node.innerHTML !== html) {
      node.innerHTML = html;
      setSelectedMedia(null);
    }
  }, [html, view]);

  const rememberCaret = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (surface.current?.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange();
    }
  }, []);

  const restoreCaret = useCallback(() => {
    const node = surface.current;
    if (!node) return;
    node.focus();
    const selection = window.getSelection();
    if (!selection) return;
    if (savedRange.current && node.contains(savedRange.current.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
      return;
    }
    const end = document.createRange();
    end.selectNodeContents(node);
    end.collapse(false);
    selection.removeAllRanges();
    selection.addRange(end);
  }, []);
  const flush = useCallback(() => {
    const node = surface.current;
    if (node) onChange(node.innerHTML);
  }, [onChange]);

  const insertHtml = useCallback(
    (fragment: string) => {
      if (view !== "preview") {
        // The HTML tab is a plain textarea; appending is the only sane position.
        onChange(`${html}\n${fragment}`);
        return;
      }
      restoreCaret();
      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!range) {
        onChange(`${html}\n${fragment}`);
        return;
      }
      range.deleteContents();
      const holder = document.createElement("div");
      holder.innerHTML = fragment;
      const frag = document.createDocumentFragment();
      while (holder.firstChild) frag.appendChild(holder.firstChild);
      const last = frag.lastChild;
      range.insertNode(frag);
      if (last) {
        const after = document.createRange();
        after.setStartAfter(last);
        after.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(after);
        savedRange.current = after.cloneRange();
      }
      flush();
    },
    [flush, html, onChange, restoreCaret, view]
  );

  useImperativeHandle(ref, () => ({
    insertHtml,
    read: () => surface.current?.innerHTML ?? html,
  }));

  function exec(command: string, value?: string) {
    if (view !== "preview") return;
    surface.current?.focus();
    document.execCommand(command, false, value);
    flush();
  }
  function selectMedia(node: HTMLElement | null) {
    surface.current
      ?.querySelectorAll(".media-selected")
      .forEach((el) => el.classList.remove("media-selected"));
    if (node) node.classList.add("media-selected");
    setSelectedMedia(node);
  }

  function handleSurfaceClick(event: React.MouseEvent<HTMLDivElement>) {
    const hit = (event.target as HTMLElement).closest(MEDIA_SELECTOR) as HTMLElement | null;
    selectMedia(hit && surface.current?.contains(hit) ? hit : null);
  }

  /** The block the toolbar acts on — a figure wrapper if there is one. */
  function mediaBlock(node: HTMLElement): HTMLElement {
    const figure = node.closest("figure") as HTMLElement | null;
    return figure || node;
  }

  function removeMedia() {
    if (!selectedMedia) return;
    mediaBlock(selectedMedia).remove();
    selectMedia(null);
    flush();
  }

  function moveMedia(direction: -1 | 1) {
    if (!selectedMedia) return;
    const block = mediaBlock(selectedMedia);
    const sibling = direction === -1 ? block.previousElementSibling : block.nextElementSibling;
    if (!sibling) {
      onNotify("info", direction === -1 ? "Already at the top." : "Already at the bottom.");
      return;
    }
    if (direction === -1) sibling.before(block);
    else sibling.after(block);
    flush();
  }

  function toggleMediaWidth() {
    if (!selectedMedia) return;
    const block = mediaBlock(selectedMedia);
    const narrowed = block.getAttribute("data-width") === "half";
    if (narrowed) {
      block.removeAttribute("data-width");
      block.style.maxWidth = "";
      block.style.marginInline = "";
    } else {
      block.setAttribute("data-width", "half");
      block.style.maxWidth = "55%";
      block.style.marginInline = "auto";
    }
    flush();
  }

  function applyLink() {
    const url = linkUrl.trim();
    setLinkOpen(false);
    setLinkUrl("");
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      onNotify("error", "A link has to start with http:// or https://.");
      return;
    }
    restoreCaret();
    document.execCommand("createLink", false, url);
    // Outbound links get the attributes an auditor looks for.
    surface.current?.querySelectorAll(`a[href="${url}"]`).forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
    flush();
  }
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      onNotify("success", `${what} copied.`);
    } catch {
      onNotify("error", "The clipboard is blocked in this browser. Select and copy by hand.");
    }
  }

  const tools: { icon: typeof Bold; title: string; run: () => void }[] = [
    { icon: Bold, title: "Bold", run: () => exec("bold") },
    { icon: Italic, title: "Italic", run: () => exec("italic") },
    { icon: Heading2, title: "Heading 2", run: () => exec("formatBlock", "<h2>") },
    { icon: Heading3, title: "Heading 3", run: () => exec("formatBlock", "<h3>") },
    { icon: List, title: "Bulleted list", run: () => exec("insertUnorderedList") },
    { icon: ListOrdered, title: "Numbered list", run: () => exec("insertOrderedList") },
    { icon: Quote, title: "Quote", run: () => exec("formatBlock", "<blockquote>") },
    {
      icon: Link2,
      title: "Add a link",
      run: () => {
        rememberCaret();
        setLinkOpen(true);
      },
    },
    { icon: Unlink, title: "Remove the link", run: () => exec("unlink") },
    { icon: ImagePlus, title: "Insert media", run: onOpenMedia },
    { icon: Undo2, title: "Undo", run: () => exec("undo") },
    { icon: Redo2, title: "Redo", run: () => exec("redo") },
  ];

  const views: { key: EditorView; label: string; icon: typeof Eye }[] = [
    { key: "preview", label: "Article", icon: Eye },
    { key: "html", label: "HTML", icon: Code2 },
    { key: "schema", label: "Schema", icon: ScrollText },
  ];

  const gap = targetWordCount > 0 ? wordCount - targetWordCount : 0;
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-1">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => {
                if (view === "preview" && v.key !== "preview") flush();
                onViewChange(v.key);
              }}
              className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                view === v.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <v.icon className="w-3.5 h-3.5" />
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            <strong className="text-foreground">{wordCount.toLocaleString()}</strong> words
          </span>
          {targetWordCount > 0 && (
            <span className={Math.abs(gap) <= targetWordCount * 0.05 ? "text-primary" : ""}>
              target {targetWordCount.toLocaleString()}
              {gap === 0 ? "" : gap > 0 ? ` (+${gap})` : ` (${gap})`}
            </span>
          )}
        </div>
      </div>

      {view === "preview" && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap items-center gap-1">
          {tools.map((tool) => (
            <button
              key={tool.title}
              type="button"
              title={tool.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={tool.run}
              className="w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center justify-center"
            >
              <tool.icon className="w-3.5 h-3.5" />
            </button>
          ))}
          {linkOpen && (
            <span className="flex items-center gap-1.5 ml-1">
              <input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyLink();
                  if (e.key === "Escape") setLinkOpen(false);
                }}
                placeholder="https://…"
                className="h-8 w-56 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:border-ring focus:outline-none"
              />
              <button
                type="button"
                onClick={applyLink}
                className="h-8 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
              >
                Link
              </button>
            </span>
          )}
        </div>
      )}
      {selectedMedia && view === "preview" && (
        <div className="px-4 py-2 border-b border-border bg-primary/5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary mr-1">
            {selectedMedia.tagName === "IFRAME" ? "Video selected" : "Image selected"}
          </span>
          <button
            type="button"
            onClick={() => moveMedia(-1)}
            className="h-7 px-2 rounded-md border border-border text-[11px] font-medium text-foreground hover:bg-muted inline-flex items-center gap-1"
          >
            <MoveUp className="w-3 h-3" /> Up
          </button>
          <button
            type="button"
            onClick={() => moveMedia(1)}
            className="h-7 px-2 rounded-md border border-border text-[11px] font-medium text-foreground hover:bg-muted inline-flex items-center gap-1"
          >
            <MoveDown className="w-3 h-3" /> Down
          </button>
          <button
            type="button"
            onClick={toggleMediaWidth}
            className="h-7 px-2 rounded-md border border-border text-[11px] font-medium text-foreground hover:bg-muted inline-flex items-center gap-1"
          >
            <Maximize2 className="w-3 h-3" />
            {mediaBlock(selectedMedia).getAttribute("data-width") === "half" ? "Full width" : "Half width"}
          </button>
          <button
            type="button"
            onClick={removeMedia}
            className="h-7 px-2 rounded-md border border-destructive/30 text-[11px] font-medium text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Remove
          </button>
        </div>
      )}

      {view === "preview" && (
        <div
          ref={surface}
          contentEditable
          suppressContentEditableWarning
          onInput={flush}
          onBlur={flush}
          onClick={handleSurfaceClick}
          onKeyUp={rememberCaret}
          onMouseUp={rememberCaret}
          className="article-body px-5 py-6 md:px-8 md:py-8 min-h-[28rem] max-h-[75vh] overflow-y-auto focus:outline-none"
        />
      )}

      {view === "html" && (
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Edited here, this is exactly what gets published.
            </p>
            <button
              type="button"
              onClick={() => void copy(html, "HTML")}
              className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>
          <textarea
            value={html}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="w-full h-[28rem] rounded-xl border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground focus:border-ring focus:outline-none"
          />
        </div>
      )}
      {view === "schema" && (
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              JSON-LD for this article. Publishing sends it to any platform that takes
              structured data; where a platform does not, it stays in the HTML.
            </p>
            <button
              type="button"
              disabled={!schemaMarkup}
              onClick={() => void copy(schemaMarkup, "Schema")}
              className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>
          {schemaMarkup ? (
            <pre className="w-full max-h-[28rem] overflow-auto rounded-xl border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {schemaMarkup}
            </pre>
          ) : (
            <p className="rounded-xl border border-border bg-background p-4 text-xs text-muted-foreground">
              This article has no schema block.
            </p>
          )}
        </div>
      )}
    </div>
  );
});

export default ArticleEditor;

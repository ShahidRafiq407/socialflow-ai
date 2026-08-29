import JSZip from "jszip";

// ============================================================================
// SECURE DOCUMENT PARSER
// Structurally reads uploads WITHOUT dumping raw bytes/base64 into the LLM and
// WITHOUT executing anything. Supported: PDF, DOCX, XLSX, PPTX, ZIP (safe tree
// walk), CSV/TXT/MD/JSON. Output is bounded to prevent memory/context floods.
// ============================================================================

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_TEXT_CHARS = 60_000;
export const MAX_ZIP_ENTRIES = 2000;
export const MAX_ZIP_UNCOMPRESSED = 50 * 1024 * 1024;
export const MAX_EXTRACTED_FILES = 200;

export type ParsedFileKind =
  | "pdf" | "docx" | "xlsx" | "pptx" | "zip" | "csv" | "text" | "image" | "unsupported";

export interface DocCitation {
  locator: string; // e.g. "Page 4", "Sheet: Leads", "Slide 2"
  verified: boolean;
}

export interface ParsedSection {
  title?: string;
  text: string;
  citation?: DocCitation;
}

export interface ParsedFile {
  name: string;
  type: string;
  size: number;
  kind: ParsedFileKind;
  text: string; // extracted text (bounded)
  sections: ParsedSection[];
  structure?: any;
  citations: DocCitation[];
  summary: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Validation & guards
// ---------------------------------------------------------------------------

const DANGEROUS_EXTENSIONS =
  /\.(exe|dll|so|dylib|bin|dat|iso|dmg|msi|apk|ipa|sh|bat|cmd|ps1|jar|class|pyc|o|a|lib|scr|cpl|reg|vbs|com|elf)$/i;

function safeExt(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

export function detectKind(name: string, type: string): ParsedFileKind {
  const t = (type || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (n.endsWith(".pdf") || t === "application/pdf") return "pdf";
  if (n.endsWith(".docx") || t === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (n.endsWith(".xlsx") || n.endsWith(".xlsm") || t === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (n.endsWith(".pptx") || t === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (n.endsWith(".zip")) return "zip";
  if (n.endsWith(".csv") || t === "text/csv") return "csv";
  if (["txt", "md", "json"].includes(safeExt(name)) || t.startsWith("text/")) return "text";
  return "unsupported";
}

export function rejectUnsafeFile(name: string, type: string): string | null {
  if (DANGEROUS_EXTENSIONS.test(name || "")) {
    return `Blocked "${name}" — executable/script files are not allowed.`;
  }
  return null;
}

export function decodeFileContent(
  content: string | ArrayBuffer | Buffer | null | undefined,
  type: string
): { bytes: Buffer; mime: string } {
  const mime = type || "application/octet-stream";
  if (content == null) throw new Error("Empty file content.");
  if (typeof content === "string") {
    const m = content.match(/^data:([^;]+);base64,([\s\S]*)$/);
    if (m) return { bytes: Buffer.from(m[2], "base64"), mime: m[1] || mime };
    return { bytes: Buffer.from(content, "utf8"), mime: "text/plain" };
  }
  const buf = content instanceof Buffer ? content : Buffer.from(content as ArrayBuffer);
  return { bytes: buf, mime };
}

function truncateText(text: string, max = MAX_TEXT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n… [truncated at ${max} chars]`;
}

// ---------------------------------------------------------------------------
// XML helpers (bounded regex over well-known tags — no DOMParser)
// ---------------------------------------------------------------------------

function stripTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextNodes(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && out.length < 5000) {
    const t = stripTags(m[1]);
    if (t) out.push(t);
  }
  return out;
}

function extractParagraphStyles(docXml: string): { text: string; isHeading: boolean }[] {
  const out: { text: string; isHeading: boolean }[] = [];
  const re = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(docXml)) !== null && out.length < 8000) {
    const pXml = m[0];
    const isHeading = /<w:pStyle[^>]*w:val="(Heading\d|Title)"/i.test(pXml);
    const text = stripTags(extractTextNodes(pXml, "w:t").join(" ")).trim();
    if (text) out.push({ text, isHeading });
  }
  return out;
}

function extractDocxTables(docXml: string): string[][] {
  const tables: string[][] = [];
  const re = /<w:tbl[ >][\s\S]*?<\/w:tbl>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(docXml)) !== null && tables.length < 200) {
    const rows: string[] = [];
    const trRe = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
    let r: RegExpExecArray | null;
    while ((r = trRe.exec(m[0])) !== null) {
      const cells = extractTextNodes(r[0], "w:t");
      rows.push(cells.map((c) => c.trim()).join(" | "));
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}
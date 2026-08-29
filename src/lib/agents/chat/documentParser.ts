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
// ---------------------------------------------------------------------------
// PDF text extraction (stream-level, no execution, no native deps)
// ---------------------------------------------------------------------------

function decodePdfLiteral(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\" && i + 1 < raw.length) {
      const n = raw[i + 1];
      if (n === "n") out += "\n";
      else if (n === "r") out += "\r";
      else if (n === "t") out += "\t";
      else if (n === "(" || n === ")" || n === "\\") out += n;
      else if (n >= "0" && n <= "7") {
        let oct = n;
        let j = i + 2;
        while (j < raw.length && j < i + 4 && raw[j] >= "0" && raw[j] <= "7") { oct += raw[j]; j++; }
        out += String.fromCharCode(parseInt(oct, 8));
        i = j - 1;
      } else out += n;
      i++;
    } else out += c;
  }
  return out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
}

function extractPdfText(bytes: Buffer): { text: string; pageCount: number } {
  const source = bytes.toString("latin1");
  const pageMatches = source.match(/\/Type\s*\/Page[^s]/g);
  const pageCount = Math.max(1, pageMatches ? pageMatches.length : 1);
  const texts: string[] = [];

  const tjRe = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tjRe.exec(source)) !== null) {
    const d = decodePdfLiteral(m[1]);
    if (d) texts.push(d);
  }

  const tjArrRe = /\[((?:[^\]])*)\]\s*TJ/g;
  while ((m = tjArrRe.exec(source)) !== null) {
    const parts = m[1].match(/\(((?:[^()\\]|\\.)*)\)/g) || [];
    const joined = parts.map((p) => decodePdfLiteral(p.slice(1, -1))).filter(Boolean).join("");
    if (joined.trim()) texts.push(joined);
  }

  try {
    const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
    const zlib = require("zlib");
    let sm: RegExpExecArray | null;
    while ((sm = streamRe.exec(source)) !== null) {
      try {
        const inflated = zlib.inflateSync(Buffer.from(sm[1].replace(/\s+$/, ""), "latin1")).toString("latin1");
        const subs = inflated.match(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g) || [];
        for (const s of subs) {
          const d = decodePdfLiteral(s.replace(/\)\s*Tj$/, "").replace(/^\(/, ""));
          if (d) texts.push(d);
        }
      } catch { /* not flate-compressed — ignore */ }
    }
  } catch { /* zlib unavailable — ignore */ }

  const text = truncateText(texts.join("\n").replace(/\n{3,}/g, "\n\n").trim());
  return { text, pageCount };
}

// ---------------------------------------------------------------------------
// ZIP handling (tree walk with path-traversal + zip-bomb guards)
// ---------------------------------------------------------------------------

function isZipBombName(name: string): boolean {
  return /(\.{2,}|^\/|\/\/)/.test(name);
}

async function inspectZip(bytes: Buffer): Promise<{
  tree: string;
  entries: { name: string; size: number; kind: ParsedFileKind }[];
  summary: string;
  supported: { name: string; content: string }[];
}> {
  const zip = await JSZip.loadAsync(bytes, { createFolders: true });
  const all = Object.values(zip.files);

  if (all.length > MAX_ZIP_ENTRIES) {
    throw new Error(`Archive has ${all.length} entries — exceeds safety limit of ${MAX_ZIP_ENTRIES}.`);
  }

  let total = 0;
  const safeEntries: { name: string; size: number }[] = [];
  const supported: { name: string; content: string }[] = [];

  for (const f of all) {
    if (isZipBombName(f.name)) throw new Error(`Unsafe path in archive: "${f.name}".`);
    if (f.dir) continue;
    let size = 0;
    try { size = (f as any)._data?.uncompressedSize ?? 0; } catch { size = 0; }
    if (size > MAX_ZIP_UNCOMPRESSED) {
      throw new Error(`Archive entry "${f.name}" claims ${(size / 1048576).toFixed(1)}MB — exceeds the ${MAX_ZIP_UNCOMPRESSED / 1048576}MB cap.`);
    }
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new Error("Archive total uncompressed size exceeds the safety cap.");
    safeEntries.push({ name: f.name, size });
  }

  if (safeEntries.length > MAX_EXTRACTED_FILES) {
    throw new Error(`Archive has ${safeEntries.length} files — exceeds the ${MAX_EXTRACTED_FILES} limit.`);
  }

  const byExt: Record<string, number> = {};
  const lines: string[] = [`${safeEntries.length} files:`];
  for (const e of safeEntries) {
    const kind = detectKind(e.name, "");
    const ext = safeExt(e.name) || "file";
    byExt[ext] = (byExt[ext] || 0) + 1;
    lines.push(`  - ${e.name} (${(e.size / 1024).toFixed(1)} KB)`);
    if (kind === "text" || kind === "csv") {
      try {
        const entry = zip.file(e.name);
        if (entry) {
          const content = await entry.async("string");
          supported.push({ name: e.name, content: truncateText(content, 12_000) });
        }
      } catch { /* skip unreadable */ }
    } else if (kind === "docx" || kind === "pdf") {
      // Binary document formats must be parsed structurally, never read as string.
      try {
        const entry = zip.file(e.name);
        if (entry) {
          const bytes = await entry.async("nodebuffer");
          const inner = await parseUploadedFile({ name: e.name, type: "", content: bytes });
          if (!inner.error && inner.text) {
            supported.push({ name: e.name, content: truncateText(inner.text, 12_000) });
          }
        }
      } catch { /* skip unreadable */ }
    }
  }

  const extSummary = Object.entries(byExt).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${n} ${e}`).join(", ");
  return {
    tree: lines.join("\n"),
    entries: safeEntries.map((e) => ({ name: e.name, size: e.size, kind: detectKind(e.name, "") })),
    summary: `${safeEntries.length} files (${extSummary || "no recognizable files"})`,
    supported,
  };
}
// ---------------------------------------------------------------------------
// Main parser entrypoint
// ---------------------------------------------------------------------------

export async function parseUploadedFile(input: {
  name: string;
  type: string;
  content: string | ArrayBuffer | Buffer | null | undefined;
}): Promise<ParsedFile> {
  const { name, type } = input;
  const kind = detectKind(name, type);

  const base: ParsedFile = {
    name, type: type || "application/octet-stream", size: 0, kind,
    text: "", sections: [], citations: [], summary: "",
  };

  const unsafe = rejectUnsafeFile(name, type);
  if (unsafe) return { ...base, error: unsafe };

  let bytes: Buffer;
  try {
    ({ bytes } = decodeFileContent(input.content, type));
  } catch (e: any) {
    return { ...base, error: `Failed to decode file: ${e?.message || "unknown"}` };
  }
  base.size = bytes.length;
  if (bytes.length > MAX_FILE_BYTES) {
    return { ...base, error: `File is ${(bytes.length / 1048576).toFixed(1)}MB — exceeds the ${MAX_FILE_BYTES / 1048576}MB limit.` };
  }

  switch (kind) {
    case "pdf": {
      const { text, pageCount } = extractPdfText(bytes);
      base.text = text;
      base.citations = [{ locator: `Page 1–${pageCount}`, verified: true }];
      base.summary = `${pageCount} page PDF, ${text.length.toLocaleString()} chars extracted`;
      base.sections = text
        ? [{ title: "PDF text", text: text.slice(0, 20_000), citation: { locator: `Pages 1–${pageCount}`, verified: true } }]
        : [{ title: "PDF (no searchable text)", text: "No extractable text layer (likely scanned/image-based)." }];
      break;
    }

    case "docx": {
      try {
        const zip = await JSZip.loadAsync(bytes);
        const docXml = await zip.file("word/document.xml")?.async("string");
        if (!docXml) throw new Error("word/document.xml not found");
        const paras = extractParagraphStyles(docXml);
        const tables = extractDocxTables(docXml);
        const text = truncateText(paras.map((p) => (p.isHeading ? `# ${p.text}` : p.text)).join("\n"));
        const headings = paras.filter((p) => p.isHeading);
        base.text = text;
        base.summary = `${paras.length} paragraphs, ${headings.length} headings, ${tables.length} tables`;
        base.citations = [{ locator: "word/document.xml (source)", verified: true }];
        base.sections = [
          { title: "Full text", text: text.slice(0, 20_000), citation: { locator: "word/document.xml", verified: true } },
        ];
        base.structure = { headings: headings.map((h) => h.text).slice(0, 50), tables };
      } catch (e: any) {
        base.error = `DOCX parse failed: ${e?.message || "unknown"}`;
      }
      break;
    }

    case "xlsx": {
      try {
        const zip = await JSZip.loadAsync(bytes);
        const shared = await zip.file("xl/sharedStrings.xml")?.async("string");
        const sharedStrings = shared ? extractTextNodes(shared, "t") : [];
        const sheetFiles = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f) && !f.endsWith("/"));
        const sheets: { name: string; rows: string[][] }[] = [];
        let colCount = 0;
        for (const sheet of sheetFiles.slice(0, 20)) {
          const xml = await zip.file(sheet)?.async("string");
          if (!xml) continue;
          const rows: string[][] = [];
          const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
          let r: RegExpExecArray | null;
          while ((r = rowRe.exec(xml)) !== null && rows.length < 500) {
            const cells: string[] = [];
            const cRe = /<c([^>]*)>([\s\S]*?)<\/c>/g;
            let c: RegExpExecArray | null;
            while ((c = cRe.exec(r[1])) !== null && cells.length < 100) {
              const attrs = c[1] || "";
              const tM = /(?:^|\s)t="([^"]*)"/.exec(attrs);
              const tAttr = tM ? tM[1] : "";
              const vMatch = /<v>([\s\S]*?)<\/v>/.exec(c[2]);
              let val = vMatch ? stripTags(vMatch[1]) : "";
              if (tAttr === "s" && val) {
                const idx = parseInt(val, 10);
                val = sharedStrings[idx] ?? val;
              }
              if (c[2].includes("<f>")) {
                const fMatch = /<f>([\s\S]*?)<\/f>/.exec(c[2]);
                val = fMatch ? `=${stripTags(fMatch[1])}` : val;
              }
              cells.push(val.trim());
            }
            if (cells.length) {
              colCount = Math.max(colCount, cells.length);
              rows.push(cells);
            }
          }
          sheets.push({ name: sheet.replace("xl/worksheets/", "").replace(".xml", ""), rows });
        }
        const textLines = sheets.flatMap((s) => [
          `# Sheet: ${s.name}`,
          ...s.rows.slice(0, 300).map((row, i) => `Row ${i + 1}: ${row.join(" | ")}`),
        ]);
        base.text = truncateText(textLines.join("\n"));
        base.summary = `${sheets.length} sheet(s), up to ${colCount} column(s)`;
        base.citations = sheets.map((s) => ({ locator: `Sheet: ${s.name}`, verified: true }));
        base.structure = { sheets: sheets.map((s) => ({ name: s.name, rowCount: s.rows.length })) };
      } catch (e: any) {
        base.error = `XLSX parse failed: ${e?.message || "unknown"}`;
      }
      break;
    }

    case "pptx": {
      try {
        const zip = await JSZip.loadAsync(bytes);
        const slideFiles = Object.keys(zip.files)
          .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
          .sort((a, b) => (parseInt(/\d+/.exec(a)?.[0] || "0", 10)) - (parseInt(/\d+/.exec(b)?.[0] || "0", 10)));
        const slides: { title: string; text: string }[] = [];
        for (const f of slideFiles.slice(0, 60)) {
          const xml = await zip.file(f)?.async("string");
          if (!xml) continue;
          const titles = extractTextNodes(xml, "a:t");
          slides.push({ title: (titles[0] || "").slice(0, 120), text: stripTags(titles.join(" ")) });
        }
        const text = slides
          .map((s, i) => `# Slide ${i + 1}${s.title ? ` — ${s.title}` : ""}\n${s.text}`)
          .join("\n\n");
        base.text = truncateText(text);
        base.summary = `${slides.length} slide(s)`;
        base.citations = slides.map((_, i) => ({ locator: `Slide ${i + 1}`, verified: true }));
        base.structure = { slides: slides.length };
      } catch (e: any) {
        base.error = `PPTX parse failed: ${e?.message || "unknown"}`;
      }
      break;
    }

    case "zip": {
      try {
        const info = await inspectZip(bytes);
        base.text = truncateText(info.tree);
        base.summary = info.summary;
        base.citations = [{ locator: `${info.supported.length} extractable file(s) analyzed`, verified: true }];
        base.structure = {
          entries: info.entries.slice(0, 200),
          supportedContents: info.supported.slice(0, 30).map((s) => ({ name: s.name, content: s.content })),
        };
      } catch (e: any) {
        base.error = `ZIP inspection failed: ${e?.message || "unknown"}`;
      }
      break;
    }

    case "csv": {
      const text = truncateText(bytes.toString("utf8"));
      const rows = text.split(/\r?\n/).filter(Boolean);
      base.text = text;
      base.summary = `${rows.length} row(s)`;
      base.citations = [{ locator: "CSV content", verified: true }];
      break;
    }

    case "text": {
      const text = truncateText(bytes.toString("utf8"));
      base.text = text;
      base.summary = `${text.length.toLocaleString()} chars`;
      base.citations = [{ locator: "Text file", verified: true }];
      break;
    }

    case "image": {
      base.summary = "Image attachment";
      base.citations = [{ locator: "Image", verified: true }];
      break;
    }

    default: {
      base.error = `Unsupported file type (.${safeExt(name) || "?"}). Supported: PDF, DOCX, XLSX, PPTX, ZIP, CSV, TXT, MD, JSON, images.`;
    }
  }

  return base;
}

export async function parseAllUploadedFiles(
  files: { name: string; type: string; content: string | ArrayBuffer | Buffer | null | undefined }[]
): Promise<ParsedFile[]> {
  const out: ParsedFile[] = [];
  let totalBytes = 0;
  for (const f of files) {
    const parsed = await parseUploadedFile(f);
    const content = f?.content;
    if (typeof content === "string") totalBytes += content.length;
    else if (content && typeof content === "object" && "byteLength" in (content as any)) {
      totalBytes += (content as any).byteLength;
    }
    out.push(parsed);
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    out.push({
      name: "_limit", type: "text/plain", size: 0, kind: "unsupported",
      text: "", sections: [], citations: [], summary: "",
      error: `Combined attachments exceed the ${MAX_TOTAL_BYTES / 1048576}MB safety limit.`,
    });
  }
  return out;
}
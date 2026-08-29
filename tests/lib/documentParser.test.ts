import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  detectKind,
  rejectUnsafeFile,
  decodeFileContent,
  parseUploadedFile,
  MAX_FILE_BYTES,
} from "@/lib/agents/chat/documentParser";

async function makeDocxBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:pStyle w:val="Heading1"/><w:r><w:t>Executive Summary</w:t></w:r></w:p>
        <w:p><w:r><w:t>Our Q3 pipeline grew 42%.</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Channel</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>ROI</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>LinkedIn</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>3.2x</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      </w:body>
    </w:document>`
  );
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types/>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function makeXlsxBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Impressions</t></si><si><t>Leads</t></si></sst>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>
      <row r="2"><c><v>12000</v></c><c><v>85</v></c></row>
    </sheetData></worksheet>`
  );
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types/>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function makePptxBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Q3 Launch</a:t><a:t>Revenue up 30% month over month.</a:t></p:sld>`
  );
  zip.file(
    "ppt/slides/slide2.xml",
    `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Next Steps</a:t><a:t>Expand to TikTok.</a:t></p:sld>`
  );
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types/>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("documentParser: kind detection & validation", () => {
  it("detects file kinds by extension and MIME", () => {
    expect(detectKind("a.pdf", "application/pdf")).toBe("pdf");
    expect(detectKind("b.docx", "")).toBe("docx");
    expect(detectKind("c.xlsx", "")).toBe("xlsx");
    expect(detectKind("d.pptx", "")).toBe("pptx");
    expect(detectKind("e.zip", "")).toBe("zip");
    expect(detectKind("f.csv", "text/csv")).toBe("csv");
    expect(detectKind("g.txt", "text/plain")).toBe("text");
    expect(detectKind("h.png", "image/png")).toBe("image");
    expect(detectKind("i.abc", "")).toBe("unsupported");
  });

  it("rejects executable/script files", () => {
    expect(rejectUnsafeFile("malware.exe", "")).toContain("Blocked");
    expect(rejectUnsafeFile("evil.sh", "")).toContain("Blocked");
    expect(rejectUnsafeFile("fine.pdf", "application/pdf")).toBeNull();
  });

  it("decodes base64 data URLs to bytes", () => {
    const { bytes, mime } = decodeFileContent(
      `data:application/pdf;base64,${Buffer.from("%PDF-1.4 hello").toString("base64")}`,
      "application/pdf"
    );
    expect(bytes.toString("utf8").startsWith("%PDF-1.4")).toBe(true);
    expect(mime).toBe("application/pdf");
  });

  it("bounds oversized files", async () => {
    const big = Buffer.alloc(MAX_FILE_BYTES + 1, 0x41);
    const parsed = await parseUploadedFile({ name: "big.txt", type: "text/plain", content: big });
    expect(parsed.error).toContain("exceeds");
  });
});
describe("documentParser: structured formats", () => {
  it("parses DOCX paragraphs, headings, and tables", async () => {
    const buf = await makeDocxBuffer();
    const parsed = await parseUploadedFile({
      name: "report.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: buf,
    });
    expect(parsed.kind).toBe("docx");
    expect(parsed.error).toBeUndefined();
    expect(parsed.text).toContain("Executive Summary");
    expect(parsed.text).toContain("42%");
    expect(parsed.summary).toContain("heading");
    expect(parsed.structure.tables.length).toBeGreaterThan(0);
    expect(parsed.citations.length).toBeGreaterThan(0);
  });

  it("parses XLSX sheets, rows, columns, and shared strings", async () => {
    const buf = await makeXlsxBuffer();
    const parsed = await parseUploadedFile({
      name: "metrics.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: buf,
    });
    expect(parsed.kind).toBe("xlsx");
    expect(parsed.error).toBeUndefined();
    expect(parsed.text).toContain("Sheet: sheet1");
    expect(parsed.text).toContain("Impressions");
    expect(parsed.text).toContain("12000");
    expect(parsed.citations[0].locator).toContain("Sheet");
  });

  it("parses PPTX slide titles and text", async () => {
    const buf = await makePptxBuffer();
    const parsed = await parseUploadedFile({
      name: "deck.pptx",
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      content: buf,
    });
    expect(parsed.kind).toBe("pptx");
    expect(parsed.error).toBeUndefined();
    expect(parsed.text).toContain("Q3 Launch");
    expect(parsed.text).toContain("Slide 2");
    expect(parsed.citations.length).toBe(2);
  });

  it("safely inspects ZIP (tree + supported file extraction)", async () => {
    const zip = new JSZip();
    zip.file("src/index.txt", "hello world");
    zip.file("src/data.csv", "a,b,c\n1,2,3");
    zip.file("src/app.exe", "MZfakebinary");
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const parsed = await parseUploadedFile({ name: "bundle.zip", type: "application/zip", content: buf });
    expect(parsed.kind).toBe("zip");
    expect(parsed.error).toBeUndefined();
    expect(parsed.text).toContain("src/index.txt");
    const supported = parsed.structure.supportedContents as { name: string; content: string }[];
    expect(supported.some((s: any) => s.name === "src/data.csv")).toBe(true);
  });

  it("parses DOCX entries inside ZIP structurally (no mojibake)", async () => {
    const zip = new JSZip();
    zip.file("docs/report.docx", await makeDocxBuffer());
    zip.file("readme.txt", "plain notes");
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const parsed = await parseUploadedFile({ name: "assets.zip", type: "application/zip", content: buf });
    expect(parsed.error).toBeUndefined();
    const supported = parsed.structure.supportedContents as { name: string; content: string }[];
    const docx = supported.find((s) => s.name === "docs/report.docx");
    expect(docx).toBeDefined();
    expect(docx!.content).toContain("Executive Summary");
    expect(docx!.content).not.toContain("PK"); // no raw zip bytes leaked
  });

  it("blocks path traversal entries in ZIP", async () => {
    const zip = new JSZip();
    zip.file("../evil.txt", "escape attempt");
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const parsed = await parseUploadedFile({ name: "bomb.zip", type: "application/zip", content: buf });
    expect(parsed.error).toContain("Unsafe path");
  });

  it("extracts text from a simple PDF", async () => {
    const pdf = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Count 1 /Kids [1 0 R] >>\nendobj\n" +
      "stream\nBT (Hello from PDF) Tj ET\nendstream\nendobj\n%%EOF\n",
      "latin1"
    );
    const parsed = await parseUploadedFile({ name: "d.pdf", type: "application/pdf", content: pdf });
    expect(parsed.kind).toBe("pdf");
    expect(parsed.error).toBeUndefined();
    expect(parsed.text).toContain("Hello from PDF");
    expect(parsed.citations[0].locator).toContain("Page");
  });
});
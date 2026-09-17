/**
 * Office Alternative Engine
 * ─────────────────────────
 * Generate structured documents, spreadsheets, presentations,
 * PDFs, and emails — all as portable data structures that can
 * be rendered in-browser, exported to standard formats, or
 * consumed by agents.
 *
 * Replaces Microsoft Word, Excel, PowerPoint, Outlook, Adobe Acrobat.
 *
 * Zero dependencies. Runs in browser or Node.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DocParagraph {
  type: "paragraph";
  text: string;
  style?: "heading1" | "heading2" | "heading3" | "heading4" | "body" | "quote" | "code" | "bullet" | "numbered" | "caption" | "toc";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  alignment?: "left" | "center" | "right" | "justify";
  indent?: number;
  spacing?: { before?: number; after?: number; line?: number };
}

export interface DocTable {
  type: "table";
  headers: string[];
  rows: string[][];
  columnWidths?: number[];
  headerStyle?: { bold?: boolean; bgColor?: string; color?: string };
  borderStyle?: "solid" | "dashed" | "dotted" | "none";
  caption?: string;
}

export interface DocImage {
  type: "image";
  dataUrl?: string;
  url?: string;
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
  alignment?: "left" | "center" | "right";
}

export interface DocPageBreak {
  type: "page-break";
}

export interface DocToc {
  type: "toc";
  title?: string;
  maxDepth?: number;
}

export interface DocHeader {
  type: "header";
  content: string;
  alignment?: "left" | "center" | "right";
}

export interface DocFooter {
  type: "footer";
  content: string;
  pageNum?: boolean;
}

export interface DocMetadata {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  createdAt?: string;
  modifiedAt?: string;
  revision?: number;
  template?: string;
}

export type DocElement = DocParagraph | DocTable | DocImage | DocPageBreak | DocToc;

export interface Document {
  metadata: DocMetadata;
  styles: DocStyle[];
  elements: DocElement[];
  headers?: DocHeader[];
  footers?: DocFooter[];
}

export interface DocStyle {
  name: string;
  basedOn?: string;
  font?: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  alignment?: "left" | "center" | "right" | "justify";
  bgColor?: string;
  indent?: number;
  spacing?: { before?: number; after?: number; line?: number };
  border?: { bottom?: { width?: number; color?: string; style?: string } };
}

// ─── Spreadsheet Types ──────────────────────────────────────────────────────

export interface SheetCell {
  value: string | number | boolean | null;
  formula?: string;
  format?: "text" | "number" | "currency" | "percent" | "date" | "scientific";
  decimals?: number;
  bold?: boolean;
  italic?: boolean;
  bgColor?: string;
  color?: string;
  border?: boolean;
  align?: "left" | "center" | "right";
  width?: number;
  wrap?: boolean;
}

export interface SheetRow {
  cells: SheetCell[];
  height?: number;
}

export interface SheetColumn {
  header: string;
  width?: number;
  type?: "auto" | "text" | "number" | "date" | "boolean";
  filterable?: boolean;
  sortable?: boolean;
}

export interface SheetChart {
  type: "bar" | "line" | "pie" | "scatter" | "area" | "doughnut";
  title: string;
  dataRange: string; // e.g. "A1:D10"
  categoryColumn: string;
  valueColumns: string[];
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface Spreadsheet {
  name: string;
  sheets: Sheet[];
  metadata?: DocMetadata;
}

export interface Sheet {
  name: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  charts?: SheetChart[];
  frozenRows?: number;
  frozenColumns?: number;
  autoFilter?: boolean;
  printArea?: string;
  pageSetup?: {
    orientation?: "portrait" | "landscape";
    paperSize?: "A4" | "letter" | "legal";
    margins?: { top: number; right: number; bottom: number; left: number };
  };
}

// ─── Presentation Types ─────────────────────────────────────────────────────

export type SlideLayout = "title" | "title-content" | "two-column" | "section-break" | "image-text" | "blank" | "comparison" | "quote" | "timeline" | "chart";

export interface SlideElement {
  type: "text" | "image" | "shape" | "chart" | "table" | "code" | "icon";
  content?: string;
  x: number; y: number;
  width: number; height: number;
  style?: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    bgColor?: string;
    bold?: boolean;
    italic?: boolean;
    alignment?: "left" | "center" | "right";
    borderRadius?: number;
    shadow?: boolean;
  };
  data?: unknown;
}

export interface Slide {
  id: number;
  layout: SlideLayout;
  title?: string;
  subtitle?: string;
  elements: SlideElement[];
  notes?: string; // speaker notes
  background?: { color?: string; gradient?: string; image?: string };
  transition?: "fade" | "slide" | "zoom" | "none";
  animation?: "none" | "entrance" | "emphasis";
}

export interface Presentation {
  title: string;
  author?: string;
  theme?: {
    primaryColor: string;
    secondaryColor: string;
    bgColor: string;
    textColor: string;
    fontFamily: string;
    accentColor: string;
  };
  slides: Slide[];
  metadata?: DocMetadata;
}

// ─── Email Types ────────────────────────────────────────────────────────────

export interface EmailAttachment {
  name: string;
  mimeType: string;
  data: string; // base64
  size?: number;
}

export interface Email {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyType: "text" | "html";
  attachments?: EmailAttachment[];
  replyTo?: string;
  headers?: Record<string, string>;
  scheduledAt?: string;
  readReceipt?: boolean;
  priority?: "low" | "normal" | "high";
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT (Word) GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export function createDocument(title: string, author?: string): Document {
  return {
    metadata: {
      title,
      author,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      revision: 1,
    },
    styles: defaultStyles(),
    elements: [],
  };
}

function defaultStyles(): DocStyle[] {
  return [
    { name: "Normal", font: "Calibri", size: 11, spacing: { after: 8, line: 1.15 } },
    { name: "Heading 1", basedOn: "Normal", font: "Calibri Light", size: 20, bold: true, color: "#1f3864", spacing: { before: 24, after: 8 }, border: { bottom: { width: 1, color: "#1f3864", style: "solid" } } },
    { name: "Heading 2", basedOn: "Normal", font: "Calibri Light", size: 16, bold: true, color: "#2e75b6", spacing: { before: 16, after: 8 } },
    { name: "Heading 3", basedOn: "Normal", font: "Calibri Light", size: 14, bold: true, color: "#2e75b6", spacing: { before: 12, after: 6 } },
    { name: "Title", basedOn: "Normal", font: "Calibri Light", size: 28, bold: true, color: "#1f3864", alignment: "center", spacing: { before: 48, after: 24 } },
    { name: "Subtitle", basedOn: "Normal", font: "Calibri", size: 14, italic: true, color: "#595959", alignment: "center", spacing: { after: 24 } },
    { name: "Code", font: "Consolas", size: 10, bgColor: "#f5f5f5", spacing: { before: 6, after: 6 } },
    { name: "Quote", basedOn: "Normal", italic: true, color: "#595959", indent: 48, border: { bottom: { width: 0, style: "none" } } },
  ];
}

export function addParagraph(doc: Document, text: string, style?: DocParagraph["style"], options?: Partial<DocParagraph>): Document {
  return {
    ...doc,
    elements: [...doc.elements, { type: "paragraph", text, style, ...options } as DocParagraph],
  };
}

export function addTable(doc: Document, headers: string[], rows: string[][], options?: Partial<DocTable>): Document {
  return {
    ...doc,
    elements: [...doc.elements, { type: "table", headers, rows, ...options } as DocTable],
  };
}

export function addImage(doc: Document, src: string, alt: string, options?: Partial<DocImage>): Document {
  return {
    ...doc,
    elements: [...doc.elements, { type: "image", dataUrl: src, alt, ...options } as DocImage],
  };
}

export function addPageBreak(doc: Document): Document {
  return {
    ...doc,
    elements: [...doc.elements, { type: "page-break" } as DocPageBreak],
  };
}

// ─── Markdown to Document ───────────────────────────────────────────────────

export function markdownToDocument(md: string, title?: string): Document {
  let doc = createDocument(title || "Document");
  const lines = md.split("\n");

  for (const line of lines) {
    if (line.startsWith("# ")) doc = addParagraph(doc, line.slice(2), "heading1");
    else if (line.startsWith("## ")) doc = addParagraph(doc, line.slice(3), "heading2");
    else if (line.startsWith("### ")) doc = addParagraph(doc, line.slice(4), "heading3");
    else if (line.startsWith("#### ")) doc = addParagraph(doc, line.slice(5), "heading4");
    else if (line.startsWith("> ")) doc = addParagraph(doc, line.slice(2), "quote");
    else if (line.startsWith("```")) { /* skip code fence markers */ }
    else if (line.startsWith("- ")) doc = addParagraph(doc, line.slice(2), "bullet");
    else if (/^\d+\.\s/.test(line)) doc = addParagraph(doc, line.replace(/^\d+\.\s/, ""), "numbered");
    else if (line.trim() === "") { /* skip blank lines */ }
    else doc = addParagraph(doc, line, "body");
  }

  return doc;
}

// ─── Document to HTML (for rendering) ──────────────────────────────────────

export function documentToHTML(doc: Document): string {
  const parts: string[] = [];

  parts.push(`<html><head><title>${doc.metadata.title}</title><style>${defaultCSS()}</style></head><body>`);

  for (const el of doc.elements) {
    if (el.type === "paragraph") {
      const p = el as DocParagraph;
      const tag = p.style?.startsWith("heading") ? `h${p.style.charAt(p.style.length - 1)}` : "p";
      const cls = p.style ? ` class="${p.style}"` : "";
      parts.push(`<${tag}${cls}>${p.text}</${tag}>`);
    } else if (el.type === "table") {
      const t = el as DocTable;
      parts.push("<table><thead><tr>");
      for (const h of t.headers) parts.push(`<th>${h}</th>`);
      parts.push("</tr></thead><tbody>");
      for (const row of t.rows) {
        parts.push("<tr>");
        for (const cell of row) parts.push(`<td>${cell}</td>`);
        parts.push("</tr>");
      }
      parts.push("</tbody></table>");
    } else if (el.type === "image") {
      const img = el as DocImage;
      const src = img.dataUrl || img.url || "";
      parts.push(`<figure><img src="${src}" alt="${img.alt}" style="max-width:${img.width ?? 100}%">`);
      if (img.caption) parts.push(`<figcaption>${img.caption}</figcaption>`);
      parts.push("</figure>");
    } else if (el.type === "page-break") {
      parts.push("<div style='page-break-after:always'></div>");
    }
  }

  parts.push("</body></html>");
  return parts.join("\n");
}

function defaultCSS(): string {
  return `
    body { font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.15; max-width: 8.5in; margin: 1in auto; color: #333; }
    h1 { font-size: 20pt; color: #1f3864; border-bottom: 1px solid #1f3864; padding-bottom: 4pt; }
    h2 { font-size: 16pt; color: #2e75b6; }
    h3 { font-size: 14pt; color: #2e75b6; }
    table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
    th, td { border: 1px solid #ccc; padding: 6pt 8pt; text-align: left; }
    th { background: #f2f2f2; font-weight: bold; }
    code { font-family: Consolas, monospace; font-size: 10pt; background: #f5f5f5; padding: 1pt 3pt; }
    pre { background: #f5f5f5; padding: 12pt; border-radius: 4pt; overflow-x: auto; }
    blockquote { border-left: 3px solid #2e75b6; padding-left: 12pt; color: #595959; font-style: italic; }
    img { max-width: 100%; }
    figcaption { font-size: 9pt; color: #666; text-align: center; margin-top: 4pt; }
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPREADSHEET (Excel) GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export function createSpreadsheet(name: string): Spreadsheet {
  return {
    name,
    sheets: [{
      name: "Sheet1",
      columns: [],
      rows: [],
    }],
    metadata: {
      title: name,
      createdAt: new Date().toISOString(),
    },
  };
}

export function addSheet(ss: Spreadsheet, name: string): Spreadsheet {
  return {
    ...ss,
    sheets: [...ss.sheets, { name, columns: [], rows: [] }],
  };
}

export function populateSheet(
  ss: Spreadsheet,
  sheetName: string,
  headers: string[],
  data: (string | number | boolean | null)[][],
  options?: { autoFilter?: boolean; freezeRows?: number },
): Spreadsheet {
  return {
    ...ss,
    sheets: ss.sheets.map((s) => {
      if (s.name !== sheetName) return s;
      return {
        ...s,
        columns: headers.map((h) => ({ header: h, width: Math.max(h.length * 8, 80), filterable: true, sortable: true })),
        rows: data.map((row) => ({
          cells: row.map((val) => ({
            value: val,
            format: typeof val === "number" ? "number" : "text",
          })),
        })),
        autoFilter: options?.autoFilter ?? true,
        frozenRows: options?.freezeRows ?? 1,
      };
    }),
  };
}

export function csvToSheet(name: string, csv: string): Sheet {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: SheetRow[] = lines.slice(1).map((line) => ({
    cells: line.split(",").map((val) => ({
      value: val.trim(),
      format: !isNaN(Number(val.trim())) ? "number" as const : "text" as const,
    })),
  }));

  return {
    name,
    columns: headers.map((h) => ({ header: h, width: Math.max(h.length * 8, 80), filterable: true, sortable: true })),
    rows,
    autoFilter: true,
    frozenRows: 1,
  };
}

export function sheetToCSV(sheet: Sheet): string {
  const headerRow = sheet.columns.map((c) => c.header).join(",");
  const dataRows = sheet.rows.map((row) =>
    row.cells.map((cell) => {
      const val = String(cell.value ?? "");
      return val.includes(",") ? `"${val}"` : val;
    }).join(","),
  );
  return [headerRow, ...dataRows].join("\n");
}

// ─── Pivot Table ────────────────────────────────────────────────────────────

export function createPivotTable(
  data: Record<string, unknown>[],
  groupBy: string,
  valueField: string,
  aggFunc: "sum" | "count" | "avg" | "min" | "max" = "sum",
): Sheet {
  const groups = new Map<string, number[]>();

  for (const row of data) {
    const key = String(row[groupBy] ?? "");
    const val = Number(row[valueField] ?? 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(val);
  }

  const pivotData: string[][] = [];
  for (const [key, values] of groups) {
    let agg: number;
    switch (aggFunc) {
      case "sum": agg = values.reduce((a, b) => a + b, 0); break;
      case "count": agg = values.length; break;
      case "avg": agg = values.reduce((a, b) => a + b, 0) / values.length; break;
      case "min": agg = Math.min(...values); break;
      case "max": agg = Math.max(...values); break;
    }
    pivotData.push([key, String(agg)]);
  }

  return {
    name: `Pivot: ${groupBy} × ${valueField}`,
    columns: [
      { header: groupBy, width: 120, filterable: true },
      { header: `${aggFunc.toUpperCase()}(${valueField})`, width: 120 },
    ],
    rows: pivotData.map((row) => ({
      cells: row.map((val) => ({
        value: val,
        format: !isNaN(Number(val)) ? "number" as const : "text" as const,
      })),
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESENTATION (PowerPoint) GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export function createPresentation(title: string, author?: string): Presentation {
  return {
    title,
    author,
    theme: {
      primaryColor: "#1f3864",
      secondaryColor: "#2e75b6",
      bgColor: "#ffffff",
      textColor: "#333333",
      fontFamily: "Calibri",
      accentColor: "#4472c4",
    },
    slides: [],
    metadata: {
      title,
      author,
      createdAt: new Date().toISOString(),
    },
  };
}

export function addSlide(pres: Presentation, layout: SlideLayout, options?: { title?: string; subtitle?: string; notes?: string }): Presentation {
  const elements: SlideElement[] = [];

  if (layout === "title") {
    if (options?.title) elements.push({ type: "text", content: options.title, x: 10, y: 35, width: 80, height: 20, style: { fontSize: 36, bold: true, alignment: "center" } });
    if (options?.subtitle) elements.push({ type: "text", content: options.subtitle, x: 10, y: 55, width: 80, height: 10, style: { fontSize: 18, italic: true, color: "#666", alignment: "center" } });
  } else if (layout === "title-content") {
    if (options?.title) elements.push({ type: "text", content: options.title, x: 5, y: 3, width: 90, height: 10, style: { fontSize: 28, bold: true } });
  }

  return {
    ...pres,
    slides: [...pres.slides, {
      id: pres.slides.length + 1,
      layout,
      title: options?.title,
      subtitle: options?.subtitle,
      elements,
      notes: options?.notes,
      transition: "fade",
    }],
  };
}

export function addTextToSlide(pres: Presentation, slideId: number, text: string, options: { x: number; y: number; width: number; height: number; fontSize?: number; bold?: boolean; color?: string }): Presentation {
  return {
    ...pres,
    slides: pres.slides.map((s) =>
      s.id === slideId
        ? { ...s, elements: [...s.elements, { type: "text" as const, content: text, ...options, style: { fontSize: options.fontSize, bold: options.bold, color: options.color } }] }
        : s,
    ),
  };
}

// ─── Markdown to Presentation ──────────────────────────────────────────────

export function markdownToPresentation(md: string, title?: string): Presentation {
  let pres = createPresentation(title || "Presentation");
  const lines = md.split("\n");
  let currentSlide: Slide | null = null;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      pres = addSlide(pres, "title", { title: line.slice(2) });
    } else if (line.startsWith("## ")) {
      pres = addSlide(pres, "title-content", { title: line.slice(3) });
    } else if (line.startsWith("---")) {
      // Section break
      currentSlide = null;
    } else if (line.trim() && pres.slides.length > 0) {
      const lastSlide = pres.slides[pres.slides.length - 1];
      pres = {
        ...pres,
        slides: pres.slides.map((s, i) =>
          i === pres.slides.length - 1
            ? {
              ...s,
              elements: [...s.elements, {
                type: "text" as const,
                content: line,
                x: 8, y: 20, width: 84, height: 60,
                style: { fontSize: 16 },
              }],
            }
            : s,
        ),
      };
    }
  }

  return pres;
}

// ─── Presentation to HTML (for rendering) ──────────────────────────────────

export function presentationToHTML(pres: Presentation): string {
  const theme = pres.theme!;
  const parts: string[] = [];

  parts.push(`<html><head><title>${pres.title}</title><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .slide { width: 960px; height: 540px; margin: 20px auto; border: 1px solid #ddd; position: relative; overflow: hidden; page-break-after: always; font-family: ${theme.fontFamily}; }
    .slide-num { position: absolute; bottom: 10px; right: 20px; font-size: 10px; color: #999; }
  </style></head><body>`);

  for (let i = 0; i < pres.slides.length; i++) {
    const slide = pres.slides[i];
    const bg = slide.background?.color || theme.bgColor;
    parts.push(`<div class="slide" style="background:${bg}">`);

    for (const el of slide.elements) {
      if (el.type === "text") {
        parts.push(`<div style="position:absolute;left:${el.x}%;top:${el.y}%;width:${el.width}%;height:${el.height}%;font-size:${el.style?.fontSize ?? 16}px;${el.style?.bold ? "font-weight:bold;" : ""}${el.style?.italic ? "font-style:italic;" : ""}color:${el.style?.color ?? theme.textColor};text-align:${el.style?.alignment ?? "left"}">${el.content ?? ""}</div>`);
      } else if (el.type === "image" && el.data) {
        parts.push(`<img src="${(el.data as { src: string }).src}" style="position:absolute;left:${el.x}%;top:${el.y}%;width:${el.width}%;max-height:${el.height}%;object-fit:contain">`);
      }
    }

    parts.push(`<div class="slide-num">${i + 1}</div></div>`);
  }

  parts.push("</body></html>");
  return parts.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATOR (structured content)
// ═══════════════════════════════════════════════════════════════════════════

export interface PDFPage {
  content: Array<{
    type: "text" | "image" | "table" | "line" | "rect";
    x: number; y: number;
    width?: number; height?: number;
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    fillColor?: string;
    align?: "left" | "center" | "right";
    bold?: boolean;
    dataUrl?: string;
    headers?: string[];
    rows?: string[][];
  }>;
}

export interface PDFDocument {
  title: string;
  pages: PDFPage[];
  metadata?: DocMetadata;
}

export function createPDF(title: string): PDFDocument {
  return {
    title,
    pages: [{ content: [] }],
    metadata: { title, createdAt: new Date().toISOString() },
  };
}

export function addPDFText(pdf: PDFDocument, text: string, options: { x: number; y: number; fontSize?: number; bold?: boolean; color?: string }): PDFDocument {
  const lastPage = pdf.pages[pdf.pages.length - 1];
  return {
    ...pdf,
    pages: pdf.pages.map((p, i) =>
      i === pdf.pages.length - 1
        ? { ...p, content: [...p.content, { type: "text", ...options, text, width: 400 }] }
        : p,
    ),
  };
}

// ─── Markdown to PDF ───────────────────────────────────────────────────────

export function markdownToPDF(md: string, title?: string): PDFDocument {
  const pdf = createPDF(title || "Document");
  const lines = md.split("\n");
  let y = 20;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      pdf.pages[0].content.push({ type: "text", x: 20, y, text: line.slice(2), fontSize: 24, bold: true, width: 500 });
      y += 35;
    } else if (line.startsWith("## ")) {
      pdf.pages[0].content.push({ type: "text", x: 20, y, text: line.slice(3), fontSize: 18, bold: true, width: 500 });
      y += 28;
    } else if (line.startsWith("### ")) {
      pdf.pages[0].content.push({ type: "text", x: 20, y, text: line.slice(4), fontSize: 14, bold: true, width: 500 });
      y += 22;
    } else if (line.trim()) {
      pdf.pages[0].content.push({ type: "text", x: 20, y, text: line, fontSize: 11, width: 500 });
      y += 18;
    }
    if (y > 760) { pdf.pages.push({ content: [] }); y = 20; }
  }

  return pdf;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export function createEmail(from: string, to: string[], subject: string, body: string, options?: { cc?: string[]; bcc?: string[]; html?: boolean; priority?: Email["priority"] }): Email {
  return {
    from,
    to,
    subject,
    body,
    bodyType: options?.html ? "html" : "text",
    cc: options?.cc,
    bcc: options?.bcc,
    priority: options?.priority ?? "normal",
  };
}

export function emailToHTML(email: Email): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #333; }
    .header { border-bottom: 2px solid #1f3864; padding-bottom: 8px; margin-bottom: 16px; }
    .meta { font-size: 12px; color: #666; }
    .body { line-height: 1.6; }
  </style></head><body>
    <div class="header"><strong>${email.subject}</strong></div>
    <div class="meta">
      From: ${email.from}<br>
      To: ${email.to.join(", ")}<br>
      ${email.cc ? `CC: ${email.cc.join(", ")}<br>` : ""}
      Date: ${new Date().toLocaleString()}
    </div>
    <div class="body"><pre style="font-family:inherit;white-space:pre-wrap">${email.body}</pre></div>
  </body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK FORMATTERS (for common tasks)
// ═══════════════════════════════════════════════════════════════════════════

export function quickReport(title: string, sections: Array<{ heading: string; content: string }>): Document {
  let doc = createDocument(title);
  doc = addParagraph(doc, title, "heading1");

  for (const section of sections) {
    doc = addParagraph(doc, section.heading, "heading2");
    doc = addParagraph(doc, section.content, "body");
  }

  return doc;
}

export function quickMeetingNotes(title: string, attendees: string[], agenda: string[], actionItems: Array<{ owner: string; task: string; deadline?: string }>): Document {
  let doc = createDocument(title);
  doc = addParagraph(doc, title, "heading1");
  doc = addParagraph(doc, `Date: ${new Date().toLocaleDateString()}`, "body");
  doc = addParagraph(doc, `Attendees: ${attendees.join(", ")}`, "body");
  doc = addParagraph(doc, "", "body");

  doc = addParagraph(doc, "Agenda", "heading2");
  for (const item of agenda) {
    doc = addParagraph(doc, item, "numbered");
  }

  if (actionItems.length > 0) {
    doc = addParagraph(doc, "Action Items", "heading2");
    doc = addTable(doc, ["Owner", "Task", "Deadline"], actionItems.map((a) => [a.owner, a.task, a.deadline ?? ""]));
  }

  return doc;
}

export function quickInvoice(invoiceNumber: string, from: string, to: string, items: Array<{ description: string; quantity: number; unitPrice: number }>): Document {
  let doc = createDocument(`Invoice #${invoiceNumber}`);
  doc = addParagraph(doc, `Invoice #${invoiceNumber}`, "heading1");
  doc = addParagraph(doc, `From: ${from}`, "body");
  doc = addParagraph(doc, `To: ${to}`, "body");
  doc = addParagraph(doc, `Date: ${new Date().toLocaleDateString()}`, "body");
  doc = addParagraph(doc, "", "body");

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  doc = addTable(doc, ["Description", "Qty", "Unit Price", "Total"],
    [...items.map((item) => [item.description, String(item.quantity), `$${item.unitPrice.toFixed(2)}`, `$${(item.quantity * item.unitPrice).toFixed(2)}`]),
      ["", "", "TOTAL", `$${total.toFixed(2)}`]]);

  return doc;
}

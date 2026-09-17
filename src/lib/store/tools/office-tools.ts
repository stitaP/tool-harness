/**
 * Office Alternative Tools
 * ────────────────────────
 * Agent-callable tools for Word, Excel, PowerPoint, PDF, and email replacement.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";
import {
  createDocument, addParagraph, addTable, addImage, addPageBreak,
  markdownToDocument, documentToHTML,
  createSpreadsheet, addSheet, populateSheet, csvToSheet, sheetToCSV, createPivotTable,
  createPresentation, addSlide, addTextToSlide, markdownToPresentation, presentationToHTML,
  createPDF, markdownToPDF,
  createEmail, emailToHTML,
  quickReport, quickMeetingNotes, quickInvoice,
} from "../../office/engine";

// ─── 1. Document Generator (Word replacement) ───────────────────────────────

export const DOC_GENERATE_MANIFEST: ToolManifest = {
  id: "office.doc",
  name: "Document Generator",
  description: "Generate structured documents (Word alternative): headings, paragraphs, tables, images, page breaks. Convert Markdown to styled documents. Export as HTML for rendering.",
  category: "math",
  version: "1.0.0",
  tags: ["document", "word", "docx", "report", "markdown", "html"],
  author: "stitaP", license: "MIT", icon: "FileText", color: "#2563eb",
  parameters: [
    { name: "action", type: "enum", description: "Action to perform", required: true, enum: ["create", "from-markdown", "to-html", "quick-report", "meeting-notes", "invoice"] },
    { name: "title", type: "string", description: "Document title", required: false, default: "Document" },
    { name: "markdown", type: "string", description: "Markdown content (for from-markdown)", required: false },
    { name: "content", type: "array", description: "Content sections [{heading, content}]", required: false },
    { name: "author", type: "string", description: "Document author", required: false },
    { name: "attendees", type: "array", description: "Attendees (for meeting-notes)", required: false },
    { name: "agenda", type: "array", description: "Agenda items (for meeting-notes)", required: false },
    { name: "actionItems", type: "array", description: "Action items [{owner, task, deadline}]", required: false },
  ],
  capabilities: [{ name: "doc-generator", description: "Generate and convert documents", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function docGenerate(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const action = (cfg.action as string) || "create";
  const title = (cfg.title as string) || "Document";

  try {
    switch (action) {
      case "from-markdown": {
        const doc = markdownToDocument((cfg.markdown as string) || "", title);
        return { success: true, data: { title, elements: doc.elements.length, html: documentToHTML(doc) } };
      }
      case "to-html": {
        const doc = createDocument(title, cfg.author as string);
        return { success: true, data: { html: documentToHTML(doc) } };
      }
      case "quick-report": {
        const sections = (cfg.content as Array<{ heading: string; content: string }>) || [];
        const doc = quickReport(title, sections);
        return { success: true, data: { title, elements: doc.elements.length, html: documentToHTML(doc) } };
      }
      case "meeting-notes": {
        const doc = quickMeetingNotes(title, (cfg.attendees as string[]) || [], (cfg.agenda as string[]) || [], (cfg.actionItems as Array<{ owner: string; task: string; deadline?: string }>) || []);
        return { success: true, data: { title, elements: doc.elements.length, html: documentToHTML(doc) } };
      }
      case "invoice": {
        const doc = quickInvoice(title, "", "", []);
        return { success: true, data: { title, elements: doc.elements.length, html: documentToHTML(doc) } };
      }
      default: {
        const doc = createDocument(title, cfg.author as string);
        return { success: true, data: { title, elements: doc.elements.length } };
      }
    }
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── 2. Spreadsheet Generator (Excel replacement) ──────────────────────────

export const SHEET_GENERATE_MANIFEST: ToolManifest = {
  id: "office.sheet",
  name: "Spreadsheet Generator",
  description: "Generate spreadsheets (Excel alternative): populate sheets from CSV/JSON, create pivot tables, add formulas. Export as CSV.",
  category: "math",
  version: "1.0.0",
  tags: ["spreadsheet", "excel", "csv", "pivot", "data"],
  author: "stitaP", license: "MIT", icon: "Table", color: "#16a34a",
  parameters: [
    { name: "action", type: "enum", description: "Action to perform", required: true, enum: ["create", "from-csv", "from-json", "pivot-table", "to-csv", "add-sheet"] },
    { name: "name", type: "string", description: "Spreadsheet name", required: false, default: "Spreadsheet" },
    { name: "csv", type: "string", description: "CSV data (for from-csv)", required: false },
    { name: "json", type: "string", description: "JSON array data (for from-json)", required: false },
    { name: "sheetName", type: "string", description: "Sheet name", required: false, default: "Sheet1" },
    { name: "groupBy", type: "string", description: "Group-by field for pivot", required: false },
    { name: "valueField", type: "string", description: "Value field for pivot", required: false },
    { name: "aggFunc", type: "enum", description: "Aggregation function for pivot", required: false, default: "sum", enum: ["sum", "count", "avg", "min", "max"] },
  ],
  capabilities: [{ name: "sheet-generator", description: "Generate and manipulate spreadsheets", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function sheetGenerate(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const action = (cfg.action as string) || "create";
  const name = (cfg.name as string) || "Spreadsheet";

  try {
    switch (action) {
      case "from-csv": {
        const csv = (cfg.csv as string) || "";
        const sheet = csvToSheet((cfg.sheetName as string) || "Sheet1", csv);
        return { success: true, data: { name, columns: sheet.columns.length, rows: sheet.rows.length, csv: sheetToCSV(sheet) } };
      }
      case "from-json": {
        const data = JSON.parse((cfg.json as string) || "[]");
        if (!Array.isArray(data) || data.length === 0) return { success: false, data: "No data" };
        const headers = Object.keys(data[0]);
        const rows = data.map((row: Record<string, unknown>) => headers.map((h) => String(row[h] ?? "")));
        const sheet: Sheet = {
          name: (cfg.sheetName as string) || "Sheet1",
          columns: headers.map((h) => ({ header: h, width: Math.max(h.length * 8, 80), filterable: true, sortable: true })),
          rows: rows.map((row: string[]) => ({ cells: row.map((val) => ({ value: val })) })),
          autoFilter: true, frozenRows: 1,
        };
        return { success: true, data: { name, columns: sheet.columns.length, rows: sheet.rows.length } };
      }
      case "pivot-table": {
        const data = JSON.parse((cfg.json as string) || "[]");
        const sheet = createPivotTable(data, (cfg.groupBy as string) || "", (cfg.valueField as string) || "", (cfg.aggFunc as "sum" | "count" | "avg" | "min" | "max") || "sum");
        return { success: true, data: { name: sheet.name, columns: sheet.columns.length, rows: sheet.rows.length } };
      }
      default: {
        const ss = createSpreadsheet(name);
        return { success: true, data: { name, sheets: ss.sheets.length } };
      }
    }
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── 3. Presentation Generator (PowerPoint replacement) ────────────────────

export const SLIDE_GENERATE_MANIFEST: ToolManifest = {
  id: "office.slide",
  name: "Presentation Generator",
  description: "Generate presentations (PowerPoint alternative): title slides, content slides, two-column layouts. Convert Markdown to presentations. Export as HTML.",
  category: "math",
  version: "1.0.0",
  tags: ["presentation", "powerpoint", "slides", "pptx"],
  author: "stitaP", license: "MIT", icon: "Presentation", color: "#dc2626",
  parameters: [
    { name: "action", type: "enum", description: "Action to perform", required: true, enum: ["create", "from-markdown", "to-html", "add-slide"] },
    { name: "title", type: "string", description: "Presentation title", required: false, default: "Presentation" },
    { name: "markdown", type: "string", description: "Markdown content (for from-markdown)", required: false },
    { name: "layout", type: "enum", description: "Slide layout", required: false, default: "title-content", enum: ["title", "title-content", "two-column", "section-break", "blank", "comparison", "quote", "chart"] },
    { name: "slideTitle", type: "string", description: "Title for new slide", required: false },
  ],
  capabilities: [{ name: "slide-generator", description: "Generate and convert presentations", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function slideGenerate(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const action = (cfg.action as string) || "create";
  const title = (cfg.title as string) || "Presentation";

  try {
    switch (action) {
      case "from-markdown": {
        const pres = markdownToPresentation((cfg.markdown as string) || "", title);
        return { success: true, data: { title, slides: pres.slides.length, html: presentationToHTML(pres) } };
      }
      case "add-slide": {
        let pres = createPresentation(title);
        pres = addSlide(pres, (cfg.layout as SlideLayout) || "title-content", { title: cfg.slideTitle as string });
        return { success: true, data: { title, slides: pres.slides.length } };
      }
      default: {
        const pres = createPresentation(title);
        return { success: true, data: { title, slides: pres.slides.length } };
      }
    }
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── 4. PDF Generator ──────────────────────────────────────────────────────

export const PDF_GENERATE_MANIFEST: ToolManifest = {
  id: "office.pdf",
  name: "PDF Generator",
  description: "Generate PDF content from Markdown or structured data. Produces renderable HTML that can be printed to PDF.",
  category: "math",
  version: "1.0.0",
  tags: ["pdf", "document", "export"],
  author: "stitaP", license: "MIT", icon: "FileType", color: "#ea580c",
  parameters: [
    { name: "title", type: "string", description: "Document title", required: false, default: "Document" },
    { name: "markdown", type: "string", description: "Markdown content to convert", required: true },
  ],
  capabilities: [{ name: "pdf-generator", description: "Generate PDF-ready content", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function pdfGenerate(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const title = (cfg.title as string) || "Document";
  const markdown = (cfg.markdown as string) || "";

  const doc = markdownToDocument(markdown, title);
  const html = documentToHTML(doc);

  return {
    success: true,
    data: {
      title,
      pages: html.split("page-break").length,
      html,
      instructions: "Print this HTML to PDF using browser's Print → Save as PDF (Ctrl+P → Save as PDF)",
    },
  };
}

// ─── 5. Email Generator ────────────────────────────────────────────────────

export const EMAIL_GENERATE_MANIFEST: ToolManifest = {
  id: "office.email",
  name: "Email Generator",
  description: "Generate email messages with proper headers, formatting, attachments, and HTML templates.",
  category: "math",
  version: "1.0.0",
  tags: ["email", "outlook", "mail", "message"],
  author: "stitaP", license: "MIT", icon: "Mail", color: "#7c3aed",
  parameters: [
    { name: "from", type: "string", description: "Sender email", required: true },
    { name: "to", type: "array", description: "Recipient emails", required: true },
    { name: "subject", type: "string", description: "Email subject", required: true },
    { name: "body", type: "string", description: "Email body text", required: true },
    { name: "cc", type: "array", description: "CC recipients", required: false },
    { name: "priority", type: "enum", description: "Email priority", required: false, default: "normal", enum: ["low", "normal", "high"] },
    { name: "html", type: "boolean", description: "Send as HTML", required: false, default: false },
  ],
  capabilities: [{ name: "email-generator", description: "Generate formatted email messages", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function emailGenerate(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const email = createEmail(
    cfg.from as string,
    (cfg.to as string[]) || [],
    (cfg.subject as string) || "",
    (cfg.body as string) || "",
    { cc: cfg.cc as string[], priority: cfg.priority as "low" | "normal" | "high", html: cfg.html as boolean },
  );

  return {
    success: true,
    data: {
      from: email.from,
      to: email.to,
      subject: email.subject,
      priority: email.priority,
      html: emailToHTML(email),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

import type { Sheet, SlideLayout } from "../../office/engine";

export const OFFICE_TOOLS: ToolManifest[] = [
  DOC_GENERATE_MANIFEST,
  SHEET_GENERATE_MANIFEST,
  SLIDE_GENERATE_MANIFEST,
  PDF_GENERATE_MANIFEST,
  EMAIL_GENERATE_MANIFEST,
];

export const OFFICE_EXECUTORS: Record<string, (input: ToolInput) => ToolOutput> = {
  "office.doc": docGenerate,
  "office.sheet": sheetGenerate,
  "office.slide": slideGenerate,
  "office.pdf": pdfGenerate,
  "office.email": emailGenerate,
};

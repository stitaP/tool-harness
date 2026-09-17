/**
 * stitaP In-House PDF Writer
 *
 * A self-contained PDF-1.4 generator following the ISO 32000 outline:
 * objects, xref table, content streams, and the base-14 fonts (Helvetica,
 * Helvetica-Bold, Helvetica-Oblique, Courier) which every conforming
 * viewer must render without embedding font files.
 *
 * Why in-house: stitaP runs air-gapped. Any dependency that fetches or
 * bundles a PDF engine would break the "zero external dependencies"
 * guarantee, and the base-14 font model means we ship no binary assets.
 *
 * Layout model (all coordinates in PDF points, origin bottom-left):
 * US Letter 612x792, 64pt margins, top-down cursor converted to
 * bottom-up baselines. Blocks are measured with real Helvetica AFM widths
 * so word-wrap matches what the reader sees.
 */

// ─── Public block model ──────────────────────────────────────────────

export type PdfBlock =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "bullet"; text: string }
  | { type: "note"; text: string }
  | { type: "code"; lines: string[] };

export interface PdfChapter {
  title: string;
  blocks: PdfBlock[];
}

// ─── Page geometry ───────────────────────────────────────────────────

const PAGE_W = 612;
const PAGE_H = 792;
const M = 64; // margin
const TOP = PAGE_H - M;
const BOTTOM = M + 34; // leave room for footer

// ─── Font metrics ────────────────────────────────────────────────────
/** Helvetica AFM widths for ASCII 32..126 (per 1000 em). */
const HELV: number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

type FontKey = "F1" | "F2" | "F3" | "F4";

function charWidth(c: string, font: FontKey): number {
  if (font === "F3") return 600; // Courier is monospaced
  const code = c.charCodeAt(0);
  if (code < 32 || code > 126) return 556;
  let w = HELV[code - 32];
  if (font === "F2") w = Math.round(w * 1.08); // bold is wider
  return w;
}

function measure(text: string, font: FontKey, size: number): number {
  let total = 0;
  for (const c of text) total += charWidth(c, font);
  return (total / 1000) * size;
}

/** Map typographic characters to WinAnsi-safe ASCII equivalents. */
export function sanitize(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "--")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-")
    .replace(/[\u2192\u21D2]/g, "->")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E\n]/g, "");
}

function escapePdf(text: string): string {
  return sanitize(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Greedy word wrap against measured widths. */
function wrap(text: string, font: FontKey, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, font, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      // hard-break pathological tokens longer than a full line
      let chunk = word;
      while (measure(chunk, font, size) > maxWidth) {
        let cut = chunk.length - 1;
        while (cut > 1 && measure(chunk.slice(0, cut), font, size) > maxWidth) cut--;
        lines.push(chunk.slice(0, cut));
        chunk = chunk.slice(cut);
      }
      line = chunk;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// ─── Layout engine ───────────────────────────────────────────────────

interface TextOp {
  x: number;
  y: number; // baseline from bottom
  font: FontKey;
  size: number;
  text: string;
  white?: boolean;
  grayText?: boolean;
}
interface RectOp {
  x: number;
  y: number;
  w: number;
  h: number;
  gray: number;
}
interface PageOps {
  texts: TextOp[];
  rects: RectOp[];
}
export interface TocEntry {
  title: string;
  page: number; // 1-based physical page
}
export interface BuildResult {
  bytes: Uint8Array;
  pageCount: number;
  toc: TocEntry[];
}

export function buildPdf(
  docTitle: string,
  docSubtitle: string,
  chapters: PdfChapter[],
): BuildResult {
  const pages: PageOps[] = [];
  let cur: PageOps = { texts: [], rects: [] };

  const newPage = () => {
    pages.push(cur);
    cur = { texts: [], rects: [] };
  };
  const pageIsEmpty = () => cur.texts.length === 0 && cur.rects.length === 0;

  let yTop = TOP;

  /** Draw wrapped lines top-down; breaks the page when out of room. */
  const put = (
    lines: string[],
    font: FontKey,
    size: number,
    leading: number,
    indent = 0,
  ): void => {
    for (const line of lines) {
      if (yTop - leading < BOTTOM && !pageIsEmpty()) {
        newPage();
        yTop = TOP;
      }
      yTop -= leading;
      cur.texts.push({ x: M + indent, y: yTop, font, size, text: escapePdf(line) });
    }
  };

  const toc: { title: string; bodyPage: number }[] = [];

  for (const chapter of chapters) {
    // Keep chapter heading with at least ~90pt of following space.
    if (yTop - 90 < BOTTOM && !pageIsEmpty()) {
      newPage();
      yTop = TOP;
    }
    toc.push({ title: chapter.title, bodyPage: pages.length + 1 });
    put(wrap(chapter.title, "F2", 20, PAGE_W - 2 * M), "F2", 20, 26);
    yTop -= 6;
    cur.rects.push({ x: M, y: yTop, w: PAGE_W - 2 * M, h: 1.2, gray: 0.75 });

    for (const block of chapter.blocks) {
      switch (block.type) {
        case "h2": {
          if (yTop - 50 < BOTTOM && !pageIsEmpty()) newPage(), (yTop = TOP);
          yTop -= 14;
          put(wrap(block.text, "F2", 14, PAGE_W - 2 * M), "F2", 14, 19);
          break;
        }
        case "h3": {
          if (yTop - 40 < BOTTOM && !pageIsEmpty()) newPage(), (yTop = TOP);
          yTop -= 10;
          put(wrap(block.text, "F2", 11.5, PAGE_W - 2 * M), "F2", 11.5, 16);
          break;
        }
        case "p":
          put(wrap(block.text, "F1", 10.5, PAGE_W - 2 * M), "F1", 10.5, 15);
          break;
        case "bullet":
          yTop -= 4;
          put(wrap(`- ${block.text}`, "F1", 10.5, PAGE_W - 2 * M - 8), "F1", 10.5, 15, 8);
          yTop -= 2;
          break;
        case "note": {
          const lines = wrap(block.text, "F4", 10, PAGE_W - 2 * M - 20);
          const h = lines.length * 14 + 14;
          if (yTop - h < BOTTOM && !pageIsEmpty()) newPage(), (yTop = TOP);
          yTop -= h;
          cur.rects.push({ x: M, y: yTop, w: PAGE_W - 2 * M, h, gray: 0.94 });
          cur.rects.push({ x: M, y: yTop, w: 3, h, gray: 0.45 });
          let ly = yTop + h - 16;
          for (const line of lines) {
            ly -= 14;
            cur.texts.push({ x: M + 12, y: ly + 14, font: "F4", size: 10, text: escapePdf(line) });
            void ly;
          }
          break;
        }
        case "code": {
          const clean = block.lines.map(sanitize);
          const lh = 11;
          const h = clean.length * lh + 12;
          if (yTop - h < BOTTOM && !pageIsEmpty()) newPage(), (yTop = TOP);
          yTop -= h;
          cur.rects.push({ x: M, y: yTop, w: PAGE_W - 2 * M, h, gray: 0.95 });
          let ly = yTop + h - 14;
          for (const line of clean) {
            // Truncate over-long code lines rather than wrap (preserve columns)
            let out = "";
            for (const ch of line) {
              if (measure(out + ch, "F3", 8.5) > PAGE_W - 2 * M - 16) break;
              out += ch;
            }
            cur.texts.push({ x: M + 8, y: ly, font: "F3", size: 8.5, text: escapePdf(out) });
            ly -= lh;
          }
          break;
        }
      }
    }
  }

  if (!pageIsEmpty()) newPage();

  // ─── Cover page ──────────────────────────────────────────────────
  const cover: PageOps = { texts: [], rects: [] };
  cover.rects.push({ x: 0, y: 0, w: PAGE_W, h: PAGE_H, gray: 0.08 });
  let cy = PAGE_H / 2 + 70;
  const titleLines = wrap(docTitle, "F2", 30, PAGE_W - 160);
  for (let i = titleLines.length - 1; i >= 0; i--) {
    cover.texts.push({
      x: M + 16,
      y: cy,
      font: "F2",
      size: 30,
      text: escapePdf(titleLines[i]),
      white: true,
    });
    cy -= 38;
  }
  cy -= 8;
  const subLines = wrap(docSubtitle, "F1", 13, PAGE_W - 160);
  for (let i = subLines.length - 1; i >= 0; i--) {
    cover.texts.push({
      x: M + 16,
      y: cy,
      font: "F1",
      size: 13,
      text: escapePdf(subLines[i]),
      grayText: true,
    });
    cy -= 18;
  }
  cy -= 24;
  cover.rects.push({ x: M + 16, y: cy, w: 120, h: 2, gray: 0.65 });
  cover.texts.push({
    x: M + 16,
    y: M + 10,
    font: "F1",
    size: 9,
    text: escapePdf(
      `stitaP Platform -- generated ${new Date().toISOString().slice(0, 10)} -- zero external dependencies`,
    ),
    grayText: true,
  });

  // ─── Table of contents pages ─────────────────────────────────────
  const tocLeading = 17;
  const entriesPerPage = Math.floor((TOP - BOTTOM - 60) / tocLeading);
  const tocPagesCount = Math.max(1, Math.ceil(toc.length / entriesPerPage));
  const pageOffset = 1 /*cover*/ + tocPagesCount;

  const tocPageOps: PageOps[] = [];
  let tp: PageOps = { texts: [], rects: [] };
  let tyCursor = TOP - 40;
  tp.texts.push({ x: M, y: tyCursor, font: "F2", size: 18, text: "Table of Contents" });
  tyCursor -= 34;
  for (const entry of toc) {
    if (tyCursor < BOTTOM) {
      tocPageOps.push(tp);
      tp = { texts: [], rects: [] };
      tyCursor = TOP - 20;
    }
    const pageNo = entry.bodyPage + pageOffset;
    tp.texts.push({
      x: M,
      y: tyCursor,
      font: "F1",
      size: 10.5,
      text: escapePdf(sanitize(entry.title)),
    });
    const numStr = String(pageNo);
    tp.texts.push({
      x: PAGE_W - M - measure(numStr, "F1", 10.5),
      y: tyCursor,
      font: "F1",
      size: 10.5,
      text: numStr,
    });
    const titleW = measure(sanitize(entry.title), "F1", 10.5);
    const dotsW = PAGE_W - M - numStr.length * 5.25 - 8 - (M + titleW + 8);
    if (dotsW > 12) {
      const n = Math.min(Math.floor(dotsW / 2.78), 200); // "." width at 10.5pt ≈ 2.92
      tp.texts.push({
        x: M + titleW + 8,
        y: tyCursor,
        font: "F1",
        size: 10.5,
        text: ".".repeat(n),
        grayText: true,
      });
    }
    tyCursor -= tocLeading;
  }
  if (tp.texts.length) tocPageOps.push(tp);

  const allPages = [cover, ...tocPageOps, ...pages];
  const total = allPages.length;

  // Footer on everything except the cover
  for (let i = 1; i < allPages.length; i++) {
    allPages[i].texts.push({
      x: M,
      y: M - 6,
      font: "F1",
      size: 8.5,
      text: escapePdf("stitaP Platform Manual"),
      grayText: true,
    });
    const label = `Page ${i + 1} of ${total}`;
    allPages[i].texts.push({
      x: PAGE_W - M - measure(label, "F1", 8.5),
      y: M - 6,
      font: "F1",
      size: 8.5,
      text: label,
      grayText: true,
    });
  }

  // ─── Content stream serialization ────────────────────────────────
  const streamFor = (p: PageOps): string => {
    let s = "";
    for (const r of p.rects) {
      s += `${r.gray.toFixed(3)} g ${r.x.toFixed(2)} ${r.y.toFixed(2)} ${r.w.toFixed(2)} ${r.h.toFixed(2)} re f\n`;
    }
    for (const t of p.texts) {
      const g = t.white ? "1" : t.grayText ? "0.45" : "0.13";
      s += `BT ${g} g /${t.font} ${t.size} Tf 1 0 0 1 ${t.x.toFixed(2)} ${t.y.toFixed(2)} Tm (${t.text}) Tj ET\n`;
    }
    return s;
  };

  // ─── Object assembly ─────────────────────────────────────────────
  const objects: (string | undefined)[] = [];
  const pageObjNums: number[] = [];
  // Reserve: 1 Catalog, 2 Pages, 3..6 Fonts, then content+page pairs per page.
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
  objects[6] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>";

  let nextObj = 7;
  for (const p of allPages) {
    const contentNum = nextObj++;
    const pageNum = nextObj++;
    pageObjNums.push(pageNum);
    const stream = streamFor(p);
    objects[contentNum] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    objects[pageNum] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> ` +
      `/Contents ${contentNum} 0 R >>`;
  }
  objects[2] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageObjNums.length} >>`;

  // ─── Byte assembly with xref table ───────────────────────────────
  const chunks: string[] = [];
  let offset = 0;
  const offsets: number[] = [];
  const push = (s: string) => {
    chunks.push(s);
    offset += s.length;
  };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  for (let i = 1; i < objects.length; i++) {
    const obj = objects[i];
    if (!obj) continue;
    offsets[i] = offset;
    push(`${i} 0 obj\n${obj}\nendobj\n`);
  }
  const xrefStart = offset;
  const maxObj = objects.length;
  let xref = `xref\n0 ${maxObj}\n0000000000 65535 f \n`;
  for (let i = 1; i < maxObj; i++) {
    xref += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${maxObj} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  // latin1 -> bytes (all content above is WinAnsi-safe single-byte text)
  const whole = chunks.join("");
  const bytes = new Uint8Array(whole.length);
  for (let i = 0; i < whole.length; i++) bytes[i] = whole.charCodeAt(i) & 0xff;

  return {
    bytes,
    pageCount: total,
    toc: toc.map((e) => ({ title: sanitize(e.title), page: e.bodyPage + pageOffset })),
  };
}

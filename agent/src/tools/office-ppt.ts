/**
 * Legacy PowerPoint 97–2003 (.ppt) reader → Markdown. Pure TypeScript, Node built-ins only.
 *
 * Follows [MS-PPT] (record layout, persist directory, slide lists, text atoms) and [MS-ODRAW] (the OfficeArt
 * drawing records that hold each slide's shapes):
 *   "Current User" → CurrentUserAtom.offsetToCurrentEdit → UserEditAtom chain → PersistDirectoryAtoms (persist id →
 *   stream offset) → DocumentContainer → SlideListWithTextContainer (slides / notes, in presentation order) →
 *   SlideContainer → DrawingContainer → OfficeArt shapes → ClientTextbox text (+ PlaceholderAtom kinds).
 * Output mirrors the .pptx converter in office.ts: `## Slide N: title`, bullets indented by paragraph level, tables
 * as Markdown tables, `> Notes: …` for speaker notes, " (hidden)" for hidden slides, footer/date/slide-number
 * placeholders skipped.
 */
import { Cfb } from "./office-cfb.js";
import { mdTable } from "./office-md.js";

export interface PptOptions { includeNotes?: boolean }

// record types ([MS-PPT] §2.13.24 RecordType, [MS-ODRAW] §2.2)
const RT = {
  Document: 0x03e8, Slide: 0x03ee, SlideAtom: 0x03ef, Notes: 0x03f0, NotesAtom: 0x03f1, SlidePersistAtom: 0x03f3,
  SlideShowSlideInfoAtom: 0x03f9, Drawing: 0x040c, PlaceholderAtom: 0x0bc3, OutlineTextRefAtom: 0x0f9e,
  TextHeaderAtom: 0x0f9f, TextCharsAtom: 0x0fa0, StyleTextPropAtom: 0x0fa1, TextBytesAtom: 0x0fa8,
  SlideListWithText: 0x0ff0, UserEditAtom: 0x0ff5, CurrentUserAtom: 0x0ff6, PersistDirectoryAtom: 0x1772,
  CryptSession10: 0x2f14,
  DgContainer: 0xf002, SpgrContainer: 0xf003, SpContainer: 0xf004, FSP: 0xf00a, FOPT: 0xf00b, ClientTextbox: 0xf00d,
  ChildAnchor: 0xf00f, ClientAnchor: 0xf010, ClientData: 0xf011, TertiaryFOPT: 0xf122,
} as const;

const ENCRYPTED_TOKEN = 0xf3d1c4df;
const MAX_DEPTH = 48;
const MAX_RECORDS = 2_000_000;

// TextHeaderAtom.textType
const TT_TITLE = 0, TT_NOTES = 2, TT_CENTER_TITLE = 6;
// PlaceholderAtom.placementId (PlaceholderEnum)
const PH_TITLE = new Set([0x01, 0x03, 0x0d, 0x0f, 0x11]);
const PH_SKIP = new Set([0x05, 0x07, 0x08, 0x09, 0x0a, 0x0b]); // notes slide image, date, slide number, footer, header
const PH_NOTES_BODY = new Set([0x06, 0x0c]);

interface Rec { ver: number; inst: number; type: number; off: number; start: number; end: number }

class Corrupt extends Error {}

/** Parse the 8-byte record header at `off`; the record must fit inside `limit`. */
function header(buf: Buffer, off: number, limit: number): Rec {
  if (off < 0 || off + 8 > limit) throw new Corrupt(`record header at offset ${off} runs past the end of its container`);
  const vi = buf.readUInt16LE(off);
  const len = buf.readUInt32LE(off + 4);
  const end = off + 8 + len;
  if (end > limit) throw new Corrupt(`record 0x${buf.readUInt16LE(off + 2).toString(16)} at offset ${off} (length ${len}) overruns its container`);
  return { ver: vi & 0xf, inst: vi >>> 4, type: buf.readUInt16LE(off + 2), off, start: off + 8, end };
}

class Reader {
  private count = 0;
  constructor(readonly buf: Buffer, readonly warnings: string[]) {}

  /** Child records of a container; a malformed tail is reported once and skipped. */
  children(r: Rec): Rec[] {
    const out: Rec[] = [];
    let off = r.start;
    while (off + 8 <= r.end) {
      if (++this.count > MAX_RECORDS) throw new Corrupt("too many records (corrupt file?)");
      let c: Rec;
      try { c = header(this.buf, off, r.end); } catch (e) { this.warn(`skipped malformed record data: ${(e as Error).message}`); break; }
      out.push(c);
      off = c.end;
    }
    return out;
  }

  child(r: Rec, type: number): Rec | undefined { return r.ver === 0xf ? this.children(r).find((c) => c.type === type) : undefined; }

  /** Depth-first search for records of `type` inside `r` (bounded depth). */
  findAll(r: Rec, type: number, out: Rec[] = [], depth = 0): Rec[] {
    if (depth > MAX_DEPTH || r.ver !== 0xf) return out;
    for (const c of this.children(r)) {
      if (c.type === type) out.push(c);
      else if (c.ver === 0xf) this.findAll(c, type, out, depth + 1);
    }
    return out;
  }

  private warned = new Set<string>();
  warn(msg: string) { if (!this.warned.has(msg) && this.warned.size < 20) { this.warned.add(msg); this.warnings.push(msg); } }
}

// ───────────── text decoding ─────────────

const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030,
  0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};
function cp1252(b: Buffer): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(CP1252[x] ?? x);
  return s;
}

interface TextBlock { textType: number; text: string; levels: number[] /* indent level per paragraph */ }

/** Indent level of each paragraph from a StyleTextPropAtom's TextPFRuns ([MS-PPT] §2.9.44, §2.9.18). */
function paragraphLevels(buf: Buffer, r: Rec, text: string): number[] {
  const paras = text.split("\r");
  const levels: number[] = new Array(paras.length).fill(0);
  // paragraph start offsets (in characters); a PF run covers `count` characters, including the paragraph mark
  const starts: number[] = [];
  let pos = 0;
  for (const p of paras) { starts.push(pos); pos += p.length + 1; }
  let off = r.start, charPos = 0;
  const total = text.length + 1;
  try {
    while (charPos < total && off + 10 <= r.end) {
      const count = buf.readUInt32LE(off);
      const indent = buf.readUInt16LE(off + 4);
      const masks = buf.readUInt32LE(off + 6);
      off += 10;
      const bit = (n: number) => (masks >>> n) & 1;
      if (bit(0) || bit(1) || bit(2) || bit(3)) off += 2; // bulletFlags
      if (bit(7)) off += 2;  // bulletChar
      if (bit(4)) off += 2;  // bulletFontRef
      if (bit(6)) off += 2;  // bulletSize
      if (bit(5)) off += 4;  // bulletColor
      if (bit(11)) off += 2; // textAlignment
      if (bit(12)) off += 2; // lineSpacing
      if (bit(13)) off += 2; // spaceBefore
      if (bit(14)) off += 2; // spaceAfter
      if (bit(8)) off += 2;  // leftMargin
      if (bit(10)) off += 2; // indent
      if (bit(15)) off += 2; // defaultTabSize
      if (bit(20)) { if (off + 2 > r.end) break; off += 2 + buf.readUInt16LE(off) * 4; } // tabStops
      if (bit(16)) off += 2; // fontAlign
      if (bit(17) || bit(18) || bit(19)) off += 2; // wrapFlags
      if (bit(21)) off += 2; // textDirection
      if (bit(23)) off += 2; // bulletBlipRef
      if (bit(24)) off += 4; // bulletAutoNumberScheme
      if (off > r.end || count === 0) break;
      const lvl = Math.min(8, indent);
      for (let k = 0; k < starts.length; k++) if (starts[k] >= charPos && starts[k] < charPos + count) levels[k] = lvl;
      charPos += count;
    }
  } catch { /* keep what we have */ }
  return levels;
}

/** Collect text blocks (TextHeaderAtom starts one; chars/bytes/style atoms attach to it) from a run of records. */
function textBlocks(rd: Reader, recs: Rec[]): TextBlock[] {
  const out: TextBlock[] = [];
  let cur: (TextBlock & { style?: Rec }) | undefined;
  const flush = () => {
    if (cur) { if (cur.style) cur.levels = paragraphLevels(rd.buf, cur.style, cur.text); delete cur.style; out.push(cur); }
    cur = undefined;
  };
  for (const r of recs) {
    if (r.type === RT.TextHeaderAtom) { flush(); cur = { textType: r.end - r.start >= 4 ? rd.buf.readUInt32LE(r.start) : 4, text: "", levels: [] }; }
    else if (r.type === RT.TextCharsAtom || r.type === RT.TextBytesAtom) {
      if (!cur) cur = { textType: 4, text: "", levels: [] };
      const b = rd.buf.subarray(r.start, r.end);
      cur.text = r.type === RT.TextCharsAtom ? b.subarray(0, b.length & ~1).toString("utf16le") : cp1252(b);
    } else if (r.type === RT.StyleTextPropAtom && cur) cur.style = r;
  }
  flush();
  return out;
}

/** Split a text block into paragraphs: 0x0D (and stray 0x0A) end a paragraph, 0x0B is a line break. */
function paragraphs(b: TextBlock): { text: string; level: number }[] {
  const raw = b.text.split("\r");
  const out: { text: string; level: number }[] = [];
  raw.forEach((p, k) => {
    for (const piece of p.split("\n")) {
      const t = piece.replace(/\u000b/g, " ").replace(/[\u0000-\u0008\u000c-\u001f\u007f￾￿]/g, "").replace(/\s+/g, " ").trim();
      if (t) out.push({ text: t, level: b.levels[k] ?? 0 });
    }
  });
  return out;
}

const norm = (s: string) => s.replace(/[\s\u000b\r\n]+/g, " ").trim();

// ───────────── document structure ─────────────

interface Doc { persist: Map<number, number>; doc?: Rec }

function readCurrentUser(cfb: Cfb): number | undefined {
  if (!cfb.has("Current User")) return undefined;
  const cu = cfb.read("Current User");
  if (cu.length < 20 || cu.readUInt16LE(2) !== RT.CurrentUserAtom) return undefined;
  if (cu.readUInt32LE(12) === ENCRYPTED_TOKEN) throw new Error("password-protected .ppt is not supported");
  return cu.readUInt32LE(16);
}

/** Walk the UserEditAtom chain and merge persist directories (newest edit wins). */
function liveDocument(rd: Reader, start: number): Doc {
  const buf = rd.buf;
  const persist = new Map<number, number>();
  const seen = new Set<number>();
  let off = start, docRef = -1;
  while (off > 0 || seen.size === 0) {
    if (seen.has(off) || seen.size > 4096) throw new Corrupt("loop in the UserEditAtom chain");
    seen.add(off);
    const ue = header(buf, off, buf.length);
    if (ue.type !== RT.UserEditAtom || ue.end - ue.start < 28) throw new Corrupt(`no UserEditAtom at offset ${off}`);
    if (docRef < 0) {
      docRef = buf.readUInt32LE(ue.start + 16);
      if (ue.end - ue.start >= 32 && buf.readUInt32LE(ue.start + 28) !== 0) throw new Error("password-protected .ppt is not supported");
    }
    const pd = header(buf, buf.readUInt32LE(ue.start + 12), buf.length);
    if (pd.type !== RT.PersistDirectoryAtom) throw new Corrupt("UserEditAtom does not point at a PersistDirectoryAtom");
    let p = pd.start;
    while (p + 4 <= pd.end) {
      const v = buf.readUInt32LE(p); p += 4;
      const id = v & 0xfffff, n = v >>> 20;
      for (let i = 0; i < n && p + 4 <= pd.end; i++, p += 4) if (!persist.has(id + i)) persist.set(id + i, buf.readUInt32LE(p));
    }
    off = buf.readUInt32LE(ue.start + 8);
    if (off === 0) break;
  }
  const docOff = persist.get(docRef);
  if (docOff === undefined) throw new Corrupt("document persist id missing from the persist directory");
  const doc = header(buf, docOff, buf.length);
  if (doc.type !== RT.Document) throw new Corrupt("persist directory does not point at the DocumentContainer");
  return { persist, doc };
}

/** Fallback: scan the stream's top-level records (persist directories in file order, last DocumentContainer). */
function scanDocument(rd: Reader): Doc {
  const buf = rd.buf;
  const persist = new Map<number, number>();
  let doc: Rec | undefined, off = 0;
  while (off + 8 <= buf.length) {
    let r: Rec;
    try { r = header(buf, off, buf.length); } catch { break; }
    if (r.type === RT.Document) doc = r;
    else if (r.type === RT.PersistDirectoryAtom) {
      let p = r.start;
      while (p + 4 <= r.end) {
        const v = buf.readUInt32LE(p); p += 4;
        const id = v & 0xfffff, n = v >>> 20;
        for (let i = 0; i < n && p + 4 <= r.end; i++, p += 4) persist.set(id + i, buf.readUInt32LE(p));
      }
    } else if (r.type === RT.CryptSession10) throw new Error("password-protected .ppt is not supported");
    off = r.end;
  }
  return { persist, doc };
}

// ───────────── shapes ─────────────

interface Shape {
  kind: "text" | "table";
  placeholder?: number;
  outlineRef?: number;  // OutlineTextRefAtom.index into the slide's SlideListWithText texts
  blocks: TextBlock[];
  rows?: string[][];
}

function shapeInfo(rd: Reader, sp: Rec) {
  const buf = rd.buf;
  let shapeType = 0, placeholder: number | undefined, outlineRef: number | undefined, deleted = false, isGroupShape = false, tableProps = false;
  let anchor: { top: number; left: number; bottom: number; right: number } | undefined;
  let blocks: TextBlock[] = [];
  for (const c of rd.children(sp)) {
    const len = c.end - c.start;
    if (c.type === RT.FSP && len >= 8) {
      shapeType = c.inst;
      const flags = buf.readUInt32LE(c.start + 4);
      isGroupShape = (flags & 1) !== 0;
      deleted = (flags & 8) !== 0;
    } else if ((c.type === RT.FOPT || c.type === RT.TertiaryFOPT) && c.ver === 3) {
      for (let k = 0, p = c.start; k < c.inst && p + 6 <= c.end; k++, p += 6) {
        const pid = buf.readUInt16LE(p) & 0x3fff;
        if (pid >= 0x39f && pid <= 0x3a1) tableProps = true; // tableProperties / tableRowProperties
      }
    } else if (c.type === RT.ChildAnchor && len >= 16) {
      anchor = { left: buf.readInt32LE(c.start), top: buf.readInt32LE(c.start + 4), right: buf.readInt32LE(c.start + 8), bottom: buf.readInt32LE(c.start + 12) };
    } else if (c.type === RT.ClientAnchor && !anchor) {
      if (len >= 16) anchor = { top: buf.readInt32LE(c.start), left: buf.readInt32LE(c.start + 4), right: buf.readInt32LE(c.start + 8), bottom: buf.readInt32LE(c.start + 12) };
      else if (len >= 8) anchor = { top: buf.readInt16LE(c.start), left: buf.readInt16LE(c.start + 2), right: buf.readInt16LE(c.start + 4), bottom: buf.readInt16LE(c.start + 6) };
    } else if (c.type === RT.ClientData && c.ver === 0xf) {
      const ph = rd.findAll(c, RT.PlaceholderAtom)[0];
      if (ph && ph.end - ph.start >= 5) placeholder = buf[ph.start + 4];
    } else if (c.type === RT.ClientTextbox && c.ver === 0xf) {
      const kids = rd.children(c);
      const ref = kids.find((k) => k.type === RT.OutlineTextRefAtom && k.end - k.start >= 4);
      if (ref) outlineRef = buf.readInt32LE(ref.start);
      blocks = textBlocks(rd, kids);
    }
  }
  return { shapeType, placeholder, outlineRef, deleted, isGroupShape, tableProps, anchor, blocks };
}

/** Lay table cell shapes out on a grid by their anchors. */
function tableRows(cells: { anchor: { top: number; left: number }; text: string }[]): string[][] {
  const tops = [...new Set(cells.map((c) => c.anchor.top))].sort((a, b) => a - b);
  const lefts = [...new Set(cells.map((c) => c.anchor.left))].sort((a, b) => a - b);
  const rows = tops.map(() => lefts.map(() => ""));
  for (const c of cells) rows[tops.indexOf(c.anchor.top)][lefts.indexOf(c.anchor.left)] = c.text;
  return rows;
}

const LINE_TYPES = new Set([20, 32, 33, 34, 35, 36, 37, 38, 39, 40]); // line + connectors

/** Shapes of a drawing in z-order; table groups are collapsed into one table shape. */
function drawingShapes(rd: Reader, drawing: Rec): Shape[] {
  const out: Shape[] = [];
  const walk = (grp: Rec, depth: number) => {
    if (depth > MAX_DEPTH) return;
    const kids = rd.children(grp).filter((k) => k.type === RT.SpContainer || k.type === RT.SpgrContainer);
    kids.forEach((k, idx) => {
      if (k.type === RT.SpgrContainer) {
        const first = rd.children(k).find((x) => x.type === RT.SpContainer);
        if (first && shapeInfo(rd, first).tableProps) {
          const cells: { anchor: { top: number; left: number }; text: string }[] = [];
          for (const cell of rd.children(k).filter((x) => x.type === RT.SpContainer).slice(1)) {
            const info = shapeInfo(rd, cell);
            if (!info.anchor || LINE_TYPES.has(info.shapeType) || info.deleted) continue;
            cells.push({ anchor: info.anchor, text: info.blocks.flatMap(paragraphs).map((p) => p.text).join("\n") });
          }
          if (cells.length) { out.push({ kind: "table", blocks: [], rows: tableRows(cells) }); return; }
        }
        walk(k, depth + 1);
        return;
      }
      if (idx === 0 && depth > 0) return; // the group's own shape record
      const info = shapeInfo(rd, k);
      if (info.deleted || info.isGroupShape) return;
      if (info.outlineRef === undefined && !info.blocks.length) return;
      out.push({ kind: "text", placeholder: info.placeholder, outlineRef: info.outlineRef, blocks: info.blocks });
    });
  };
  const dg = rd.findAll(drawing, RT.DgContainer)[0];
  if (!dg) return out;
  for (const c of rd.children(dg)) if (c.type === RT.SpgrContainer) walk(c, 0);
  return out;
}

// ───────────── slides ─────────────

interface ListEntry { persistId: number; slideId: number; texts: TextBlock[] }

function slideList(rd: Reader, doc: Rec, instance: number): ListEntry[] {
  const out: ListEntry[] = [];
  for (const list of rd.children(doc).filter((c) => c.type === RT.SlideListWithText && c.inst === instance)) {
    let cur: { e: ListEntry; recs: Rec[] } | undefined;
    const flush = () => { if (cur) { cur.e.texts = textBlocks(rd, cur.recs); out.push(cur.e); } cur = undefined; };
    for (const r of rd.children(list)) {
      if (r.type === RT.SlidePersistAtom && r.end - r.start >= 16) {
        flush();
        cur = { e: { persistId: rd.buf.readUInt32LE(r.start), slideId: rd.buf.readUInt32LE(r.start + 12), texts: [] }, recs: [] };
      } else if (cur) cur.recs.push(r);
    }
    flush();
  }
  return out;
}

function containerAt(rd: Reader, persist: Map<number, number>, id: number, type: number): Rec | undefined {
  const off = persist.get(id);
  if (off === undefined) return undefined;
  try {
    const r = header(rd.buf, off, rd.buf.length);
    return r.type === type ? r : undefined;
  } catch { return undefined; }
}

const isTitle = (s: { placeholder?: number }, b?: TextBlock) =>
  (s.placeholder !== undefined && PH_TITLE.has(s.placeholder)) || (s.placeholder === undefined && !!b && (b.textType === TT_TITLE || b.textType === TT_CENTER_TITLE));

/** Text blocks of one slide/notes page: drawing shapes first (in z-order), then any list text the drawing did not reference. */
function pageContent(rd: Reader, container: Rec | undefined, listTexts: TextBlock[]) {
  const items: ({ kind: "text"; title: boolean; skip: boolean; notesBody: boolean; block: TextBlock } | { kind: "table"; rows: string[][] })[] = [];
  const used = new Set<number>();
  const drawing = container ? rd.child(container, RT.Drawing) : undefined;
  if (drawing) {
    for (const s of drawingShapes(rd, drawing)) {
      if (s.kind === "table") { items.push({ kind: "table", rows: s.rows! }); continue; }
      const skip = s.placeholder !== undefined && PH_SKIP.has(s.placeholder);
      const notesBody = s.placeholder !== undefined && PH_NOTES_BODY.has(s.placeholder);
      let blocks = s.blocks.filter((b) => b.text.length);
      if (s.outlineRef !== undefined && listTexts[s.outlineRef] && !blocks.length) { blocks = [listTexts[s.outlineRef]]; used.add(s.outlineRef); }
      for (const b of blocks) items.push({ kind: "text", title: isTitle(s, b), skip, notesBody, block: b });
    }
  }
  listTexts.forEach((b, k) => { if (!used.has(k)) items.push({ kind: "text", title: isTitle({}, b), skip: false, notesBody: b.textType === TT_NOTES, block: b }); });
  // de-duplicate text present both in the drawing and in the slide list
  const seen = new Set<string>();
  return items.filter((it) => {
    if (it.kind !== "text") return true;
    const key = norm(it.block.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isHidden(rd: Reader, slide: Rec | undefined): boolean {
  const info = slide ? rd.child(slide, RT.SlideShowSlideInfoAtom) : undefined;
  return !!info && info.end - info.start >= 12 && (rd.buf.readUInt16LE(info.start + 10) & 0x4) !== 0;
}

export function pptToMarkdown(buf: Buffer, opts: PptOptions = {}): { markdown: string; warnings: string[] } {
  const warnings: string[] = [];
  const includeNotes = opts.includeNotes !== false;
  let cfb: Cfb;
  try { cfb = new Cfb(buf); } catch (e) { throw new Error(`not a readable .ppt file: ${(e as Error).message}`); }
  if (cfb.has("EncryptedSummary")) throw new Error("password-protected .ppt is not supported");
  if (!cfb.has("PowerPoint Document")) {
    if (cfb.has("PP40") || cfb.entries.some((e) => /^PP\d\d$/i.test(e.name))) throw new Error("PowerPoint 95 (or older) .ppt files are not supported — save as .pptx first");
    throw new Error('not a PowerPoint file (no "PowerPoint Document" stream)');
  }
  try {
    const stream = cfb.read("PowerPoint Document");
    const rd = new Reader(stream, warnings);
    let d: Doc | undefined;
    const cu = readCurrentUser(cfb);
    if (cu !== undefined) {
      try { d = liveDocument(rd, cu); } catch (e) {
        if (!(e instanceof Corrupt)) throw e;
        warnings.push(`edit chain unreadable (${e.message}); scanned the stream for the document instead`);
      }
    } else warnings.push('no "Current User" stream; scanned the stream for the document instead');
    if (!d) d = scanDocument(rd);
    if (!d.doc) throw new Corrupt("no DocumentContainer found");
    const doc = d.doc;
    if (rd.findAll(doc, RT.CryptSession10).length) throw new Error("password-protected .ppt is not supported");

    const slides = slideList(rd, doc, 0);
    const notesList = includeNotes ? slideList(rd, doc, 2) : [];
    const notesBySlideId = new Map<number, ListEntry>();
    const notesById = new Map<number, ListEntry>();
    for (const n of notesList) {
      notesById.set(n.slideId, n);
      const nc = containerAt(rd, d.persist, n.persistId, RT.Notes);
      const na = nc ? rd.child(nc, RT.NotesAtom) : undefined;
      if (na && na.end - na.start >= 4) notesBySlideId.set(stream.readUInt32LE(na.start), n);
    }

    const out: string[] = [];
    let missing = 0;
    slides.forEach((s, idx) => {
      const sc = containerAt(rd, d!.persist, s.persistId, RT.Slide);
      if (!sc) missing++;
      let title = "";
      const lines: string[] = [];
      for (const it of pageContent(rd, sc, s.texts)) {
        if (it.kind === "table") { if (it.rows.length) lines.push("\n" + mdTable(it.rows) + "\n"); continue; }
        if (it.skip) continue;
        const paras = paragraphs(it.block);
        if (it.title && !title) { title = paras.map((p) => p.text).join(" "); continue; }
        for (const p of paras) lines.push(`${"  ".repeat(p.level)}- ${p.text}`);
      }
      let sec = `## Slide ${idx + 1}${title ? `: ${title}` : ""}${isHidden(rd, sc) ? " (hidden)" : ""}`;
      const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (body) sec += "\n\n" + body;
      if (includeNotes) {
        const sa = sc ? rd.child(sc, RT.SlideAtom) : undefined;
        const notesId = sa && sa.end - sa.start >= 24 ? stream.readUInt32LE(sa.start + 16) : 0;
        const n = (notesId ? notesById.get(notesId) : undefined) ?? notesBySlideId.get(s.slideId);
        if (n) {
          const nc = containerAt(rd, d!.persist, n.persistId, RT.Notes);
          const notes = pageContent(rd, nc, n.texts)
            .filter((it): it is Extract<typeof it, { kind: "text" }> => it.kind === "text" && !it.skip && (it.notesBody || it.block.textType === TT_NOTES))
            .flatMap((it) => paragraphs(it.block).map((p) => p.text));
          if (notes.length) sec += "\n\n" + notes.map((l, k) => (k === 0 ? `> Notes: ${l}` : `> ${l}`)).join("\n");
        }
      }
      out.push(sec);
    });
    if (missing) warnings.push(`${missing} slide(s) had no drawing record; used the slide-list text only`);
    if (!out.length) warnings.push("presentation has no slides");
    return { markdown: out.join("\n\n"), warnings };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/password-protected|not supported/.test(msg)) throw e;
    throw new Error(`corrupt or truncated .ppt: ${msg}`);
  }
}

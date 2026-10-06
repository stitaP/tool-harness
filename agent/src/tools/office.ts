/**
 * office_to_markdown: Word / Excel / PowerPoint / OpenDocument → Markdown, with no dependencies.
 *
 * OOXML (ECMA-376) and ODF (OASIS OpenDocument 1.2/1.3) packages are ZIP archives of XML parts, so this
 * file carries a small ZIP reader (node:zlib for deflate) and a tolerant XML parser. Element names are
 * canonicalised through their namespace URI (w:, a:, p:, r:, office:, text:, table:, draw: …; SpreadsheetML
 * main and package relationships become unprefixed), so files written with unusual prefixes still parse.
 * Legacy binaries (.doc/.xls/.ppt) and RTF are read natively (office-doc/xls/ppt/rtf.ts on the MS-CFB reader in
 * office-cfb.ts) — no LibreOffice or other programs needed; LibreOffice is only an optional fallback if a native reader fails.
 */
import { Cfb, isCfb } from "./office-cfb.js";
import { docToMarkdown } from "./office-doc.js";
import { xlsToMarkdown } from "./office-xls.js";
import { pptToMarkdown } from "./office-ppt.js";
import { rtfToMarkdown } from "./office-rtf.js";
import { cellEsc, mdTable } from "./office-md.js";
export { mdTable };
import { execFile } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, extname, join, posix, relative } from "node:path";
import { promisify } from "node:util";
import { inflateRawSync } from "node:zlib";
import { blockedReason, protectedReason, resolvePath } from "../safety/paths.js";
import { type Tool, type ToolContext, obj, str, int, bool, arr } from "./types.js";

const execFileP = promisify(execFile);

export interface OfficeOptions { includeNotes?: boolean; sheets?: string[]; maxRows?: number }
export interface OfficeResult { markdown: string; format: string; warnings: string[] }

const OOXML_WORD = new Set([".docx", ".docm", ".dotx", ".dotm"]);
const OOXML_XL = new Set([".xlsx", ".xlsm", ".xltx", ".xltm"]);
const OOXML_PPT = new Set([".pptx", ".pptm", ".potx", ".potm", ".ppsx", ".ppsm"]);
const ODF = new Set([".odt", ".ods", ".odp", ".ott", ".ots", ".otp"]);
const LEGACY = new Set([".doc", ".dot", ".xls", ".xlt", ".ppt", ".pps", ".pot", ".rtf"]);
export const SUPPORTED_EXTENSIONS = [...OOXML_WORD, ...OOXML_XL, ...OOXML_PPT, ...ODF, ...LEGACY];

const MAX_INPUT_BYTES = 200 * 1024 * 1024;
const MAX_INFLATED_TOTAL = 200 * 1024 * 1024;

// ───────────────────────────── ZIP reader ─────────────────────────────

interface ZipEntry { name: string; method: number; flags: number; csize: number; usize: number; offset: number }

export class Zip {
  private entries = new Map<string, ZipEntry>();
  private inflated = 0;
  constructor(private buf: Buffer) {
    if (buf.length >= 8 && buf.readUInt32BE(0) === 0xd0cf11e0) throw new Error("this is an OLE compound file, not a ZIP package — it is password-protected/encrypted or a legacy binary Office file");
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("not a ZIP archive (no end-of-central-directory record)");
    let count = buf.readUInt16LE(eocd + 10);
    let cdOff = buf.readUInt32LE(eocd + 16);
    if ((count === 0xffff || cdOff === 0xffffffff) && eocd >= 20 && buf.readUInt32LE(eocd - 20) === 0x07064b50) {
      const z64 = Number(buf.readBigUInt64LE(eocd - 20 + 8));
      if (buf.readUInt32LE(z64) === 0x06064b50) { count = Number(buf.readBigUInt64LE(z64 + 32)); cdOff = Number(buf.readBigUInt64LE(z64 + 48)); }
    }
    let p = cdOff;
    for (let n = 0; n < count && p + 46 <= buf.length; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) break;
      const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
      let csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
      const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
      let offset = buf.readUInt32LE(p + 42);
      const name = buf.toString(flags & 0x800 ? "utf8" : "latin1", p + 46, p + 46 + nlen);
      // zip64 extra field: present values replace the 0xFFFFFFFF placeholders, in order
      let x = p + 46 + nlen;
      const xend = x + xlen;
      while (x + 4 <= xend) {
        const id = buf.readUInt16LE(x), sz = buf.readUInt16LE(x + 2);
        if (id === 1) {
          let q = x + 4;
          if (usize === 0xffffffff) { usize = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (csize === 0xffffffff) { csize = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (offset === 0xffffffff) { offset = Number(buf.readBigUInt64LE(q)); q += 8; }
        }
        x += 4 + sz;
      }
      p += 46 + nlen + xlen + clen;
      const norm = name.replace(/\\/g, "/").replace(/^\/+/, "");
      if (norm.split("/").includes("..")) continue; // path traversal: never readable
      this.entries.set(norm.toLowerCase(), { name: norm, method, flags, csize, usize, offset });
    }
  }
  names(): string[] { return [...this.entries.values()].map((e) => e.name); }
  has(name: string): boolean { return this.entries.has(name.replace(/^\/+/, "").toLowerCase()); }
  read(name: string): Buffer | null {
    const e = this.entries.get(name.replace(/^\/+/, "").toLowerCase());
    if (!e) return null;
    if (e.flags & 1) throw new Error(`ZIP entry ${e.name} is encrypted`);
    const b = this.buf;
    if (b.readUInt32LE(e.offset) !== 0x04034b50) throw new Error(`corrupt ZIP: bad local header for ${e.name}`);
    const start = e.offset + 30 + b.readUInt16LE(e.offset + 26) + b.readUInt16LE(e.offset + 28);
    const data = b.subarray(start, start + e.csize);
    const budget = MAX_INFLATED_TOTAL - this.inflated;
    if (e.usize > budget) throw new Error(`ZIP entry ${e.name} would exceed the ${MAX_INFLATED_TOTAL / 1048576} MB decompression limit (possible zip bomb)`);
    let out: Buffer;
    if (e.method === 0) out = Buffer.from(data);
    else if (e.method === 8) {
      try { out = inflateRawSync(data, { maxOutputLength: Math.max(1, budget) }); }
      catch (err: any) { throw new Error(/maxOutputLength|buffer|too large/i.test(String(err?.message)) ? `ZIP entry ${e.name} exceeds the decompression limit (possible zip bomb)` : `cannot inflate ${e.name}: ${err.message}`); }
    } else throw new Error(`ZIP entry ${e.name} uses unsupported compression method ${e.method}`);
    this.inflated += out.length;
    return out;
  }
  text(name: string): string | null { const b = this.read(name); return b ? b.toString("utf8") : null; }
}

// ───────────────────────────── XML parser ─────────────────────────────

export interface XNode { name: string; attrs: Record<string, string>; children: (XNode | string)[] }

const NS: Record<string, string> = {
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main": "w",
  "http://purl.oclc.org/ooxml/wordprocessingml/main": "w",
  "http://schemas.openxmlformats.org/drawingml/2006/main": "a",
  "http://purl.oclc.org/ooxml/drawingml/main": "a",
  "http://schemas.openxmlformats.org/presentationml/2006/main": "p",
  "http://purl.oclc.org/ooxml/presentationml/main": "p",
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships": "r",
  "http://purl.oclc.org/ooxml/officeDocument/relationships": "r",
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main": "",
  "http://purl.oclc.org/ooxml/spreadsheetml/main": "",
  "http://schemas.openxmlformats.org/package/2006/relationships": "",
  "http://schemas.openxmlformats.org/markup-compatibility/2006": "mc",
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing": "wp",
  "http://schemas.openxmlformats.org/drawingml/2006/chart": "c",
  "urn:schemas-microsoft-com:vml": "v",
  "urn:oasis:names:tc:opendocument:xmlns:office:1.0": "office",
  "urn:oasis:names:tc:opendocument:xmlns:text:1.0": "text",
  "urn:oasis:names:tc:opendocument:xmlns:table:1.0": "table",
  "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0": "draw",
  "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0": "presentation",
  "urn:oasis:names:tc:opendocument:xmlns:style:1.0": "style",
  "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0": "fo",
  "http://www.w3.org/1999/xlink": "xlink",
};

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function decodeEntities(s: string): string {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (m, e: string) => {
    if (e[0] !== "#") return ENT[e];
    const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(cp); } catch { return m; }
  });
}

/** Tolerant XML → tree. Names are canonicalised by namespace URI where known. DOCTYPE/PI/comments skipped, no entity expansion beyond the predefined ones. */
export function parseXml(src: string): XNode {
  const root: XNode = { name: "#document", attrs: {}, children: [] };
  const stack: { node: XNode; raw: string; ns: Record<string, string> }[] = [{ node: root, raw: "", ns: { xml: "http://www.w3.org/XML/1998/namespace" } }];
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = src.length;
  const canon = (raw: string, ns: Record<string, string>, isAttr: boolean): string => {
    const c = raw.indexOf(":");
    const prefix = c < 0 ? "" : raw.slice(0, c);
    if (isAttr && c < 0) return raw;
    const uri = ns[prefix];
    if (uri === undefined) return raw;
    const cp = NS[uri];
    if (cp === undefined) return raw;
    const local = c < 0 ? raw : raw.slice(c + 1);
    return cp ? `${cp}:${local}` : local;
  };
  while (i < n) {
    const lt = src.indexOf("<", i);
    const top = stack[stack.length - 1];
    if (lt < 0) { const t = src.slice(i); if (t) top.node.children.push(decodeEntities(t)); break; }
    if (lt > i) top.node.children.push(decodeEntities(src.slice(i, lt)));
    if (src.startsWith("<!--", lt)) { const e = src.indexOf("-->", lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith("<![CDATA[", lt)) { const e = src.indexOf("]]>", lt + 9); top.node.children.push(src.slice(lt + 9, e < 0 ? n : e)); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith("<?", lt)) { const e = src.indexOf("?>", lt + 2); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith("<!", lt)) {
      // DOCTYPE, possibly with an internal subset
      let j = lt + 2, depth = 0;
      for (; j < n; j++) { const ch = src[j]; if (ch === "[") depth++; else if (ch === "]") depth--; else if (ch === ">" && depth <= 0) break; }
      i = j + 1; continue;
    }
    if (src[lt + 1] === "/") {
      const e = src.indexOf(">", lt);
      const raw = src.slice(lt + 2, e < 0 ? n : e).trim();
      i = e < 0 ? n : e + 1;
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].raw === raw) { stack.length = k; break; }
      continue;
    }
    // start tag: find '>' outside quotes
    let j = lt + 1, q = "";
    for (; j < n; j++) { const ch = src[j]; if (q) { if (ch === q) q = ""; } else if (ch === '"' || ch === "'") q = ch; else if (ch === ">") break; }
    let body = src.slice(lt + 1, j);
    i = j + 1;
    const selfClose = body.endsWith("/");
    if (selfClose) body = body.slice(0, -1);
    const m = /^[^\s/>]+/.exec(body);
    if (!m) continue;
    const raw = m[0];
    const rawAttrs: [string, string][] = [];
    const re = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    re.lastIndex = raw.length;
    let am: RegExpExecArray | null;
    let ns = top.ns;
    while ((am = re.exec(body))) {
      const k = am[1], v = decodeEntities(am[2] ?? am[3] ?? "");
      if (k === "xmlns" || k.startsWith("xmlns:")) { if (ns === top.ns) ns = { ...ns }; ns[k === "xmlns" ? "" : k.slice(6)] = v; }
      else rawAttrs.push([k, v]);
    }
    const node: XNode = { name: canon(raw, ns, false), attrs: {}, children: [] };
    for (const [k, v] of rawAttrs) node.attrs[canon(k, ns, true)] = v;
    top.node.children.push(node);
    if (!selfClose) stack.push({ node, raw, ns });
  }
  return root;
}

const isEl = (c: XNode | string): c is XNode => typeof c !== "string";
export const kids = (nd: XNode | undefined, name?: string): XNode[] => (nd ? nd.children.filter((c): c is XNode => isEl(c) && (!name || c.name === name)) : []);
export const child = (nd: XNode | undefined, name: string): XNode | undefined => nd?.children.find((c): c is XNode => isEl(c) && c.name === name);
/** first descendant (depth-first, document order) */
export function find(nd: XNode | undefined, name: string): XNode | undefined {
  if (!nd) return undefined;
  for (const c of nd.children) if (isEl(c)) { if (c.name === name) return c; const r = find(c, name); if (r) return r; }
  return undefined;
}
export function findAll(nd: XNode | undefined, name: string, out: XNode[] = []): XNode[] {
  if (!nd) return out;
  for (const c of nd.children) if (isEl(c)) { if (c.name === name) out.push(c); else findAll(c, name, out); }
  return out;
}

// ───────────────────────────── Markdown helpers ─────────────────────────────

interface Seg { t: string; b?: boolean; i?: boolean; href?: string; raw?: boolean }

/** Merge formatting runs and render bold/italic/links. `brk` replaces line breaks ("  \n" in paragraphs, "<br>" in table cells). */
function renderSegs(segs: Seg[], brk: string): string {
  let out = "";
  let k = 0;
  const wrap = (t: string, b?: boolean, i?: boolean) => {
    const mk = b && i ? "***" : b ? "**" : i ? "_" : "";
    return t.split("\n").map((piece) => {
      if (!mk) return piece;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(piece)!;
      return m[2] ? `${m[1]}${mk}${m[2]}${mk}${m[3]}` : piece;
    }).join("\n");
  };
  while (k < segs.length) {
    const href = segs[k].href;
    let inner = "";
    while (k < segs.length && segs[k].href === href) {
      const s = segs[k];
      if (s.raw) { inner += s.t; k++; continue; }
      let t = s.t;
      k++;
      while (k < segs.length && segs[k].href === href && !segs[k].raw && !!segs[k].b === !!s.b && !!segs[k].i === !!s.i) t += segs[k++].t;
      inner += wrap(t, s.b, s.i);
    }
    if (href && inner.trim()) out += `[${inner.trim()}](${href.replace(/ /g, "%20").replace(/\)/g, "%29")})`;
    else out += inner;
  }
  return out.replace(/[ \t]*\n[ \t]*/g, brk === "<br>" ? "<br>" : brk).replace(/\t/g, " ");
}

function joinBlocks(blocks: { kind: "list" | "para"; text: string }[]): string {
  let out = "";
  blocks.forEach((b, k) => {
    if (!b.text.trim() && b.kind === "para") return;
    if (out) out += b.kind === "list" && blocks[k - 1]?.kind === "list" ? "\n" : "\n\n";
    out += b.text;
  });
  return out;
}

// ───────────────────────────── OPC relationships ─────────────────────────────

interface Rel { target: string; type: string; external: boolean }

function partDir(part: string) { const d = posix.dirname(part); return d === "." ? "" : d; }
function resolveTarget(fromPart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  return posix.normalize(posix.join(partDir(fromPart), target)).replace(/^(\.\.\/)+/, "");
}
function relsFor(zip: Zip, part: string): Map<string, Rel> {
  const relsPath = posix.join(partDir(part), "_rels", posix.basename(part) + ".rels");
  const m = new Map<string, Rel>();
  const xml = zip.text(relsPath);
  if (!xml) return m;
  for (const r of findAll(parseXml(xml), "Relationship")) {
    const external = r.attrs.TargetMode === "External";
    const target = r.attrs.Target ?? "";
    m.set(r.attrs.Id, { target: external ? target : resolveTarget(part, target), type: r.attrs.Type ?? "", external });
  }
  return m;
}
function mainPart(zip: Zip, typeSuffix: string, fallback: string): string {
  const rels = relsFor(zip, "");
  for (const r of rels.values()) if (r.type.endsWith("/officeDocument") || r.type.endsWith(typeSuffix)) return r.target;
  return fallback;
}
const onOff = (nd: XNode | undefined) => !!nd && !["0", "false", "off", "none"].includes((nd.attrs["w:val"] ?? "").toLowerCase());

// ───────────────────────────── WordprocessingML ─────────────────────────────

function convertDocx(zip: Zip, warnings: string[]): string {
  const docPart = mainPart(zip, "/officeDocument", "word/document.xml");
  const xml = zip.text(docPart);
  if (!xml) throw new Error(`missing main document part ${docPart}`);
  const rels = relsFor(zip, docPart);
  const relOf = (type: string, def: string) => { for (const r of rels.values()) if (r.type.endsWith("/" + type)) return r.target; return def; };

  // styles: id → heading level / list numbering inherited through basedOn
  const styles = new Map<string, { name: string; basedOn?: string; outline?: number; numId?: string; ilvl?: number }>();
  const stylesXml = zip.text(relOf("styles", "word/styles.xml"));
  if (stylesXml) for (const s of findAll(parseXml(stylesXml), "w:style")) {
    const pPr = child(s, "w:pPr");
    const numPr = child(pPr, "w:numPr");
    const ol = child(pPr, "w:outlineLvl")?.attrs["w:val"];
    styles.set(s.attrs["w:styleId"], {
      name: (child(s, "w:name")?.attrs["w:val"] ?? "").toLowerCase(), basedOn: child(s, "w:basedOn")?.attrs["w:val"],
      outline: ol !== undefined ? Number(ol) : undefined, numId: child(numPr, "w:numId")?.attrs["w:val"],
      ilvl: child(numPr, "w:ilvl") ? Number(child(numPr, "w:ilvl")!.attrs["w:val"]) : undefined,
    });
  }
  const styleChain = (id?: string) => { const out: NonNullable<ReturnType<typeof styles.get>>[] = []; let cur = id; for (let d = 0; cur && d < 10; d++) { const s = styles.get(cur); if (!s) break; out.push(s); cur = s.basedOn; } return out; };
  const headingLevel = (id?: string): number => {
    if (!id) return 0;
    for (const s of styleChain(id)) {
      const m = /^heading\s*([1-9])$/.exec(s.name);
      if (m) return Math.min(6, Number(m[1]));
      if (s.name === "title") return 1;
      if (s.outline !== undefined && s.outline < 9 && s.name.startsWith("heading")) return Math.min(6, s.outline + 1);
    }
    const m = /^heading([1-9])$/i.exec(id);
    if (m) return Math.min(6, Number(m[1]));
    return /^title$/i.test(id) ? 1 : 0;
  };

  // numbering: numId → abstract → per-level format
  const numFmt = new Map<string, Map<number, string>>();
  const numXml = zip.text(relOf("numbering", "word/numbering.xml"));
  if (numXml) {
    const doc = parseXml(numXml);
    const abs = new Map<string, Map<number, string>>();
    for (const a of findAll(doc, "w:abstractNum")) {
      const lv = new Map<number, string>();
      for (const l of kids(a, "w:lvl")) lv.set(Number(l.attrs["w:ilvl"]), child(l, "w:numFmt")?.attrs["w:val"] ?? "bullet");
      abs.set(a.attrs["w:abstractNumId"], lv);
    }
    for (const nm of findAll(doc, "w:num")) {
      const a = abs.get(child(nm, "w:abstractNumId")?.attrs["w:val"] ?? "");
      if (a) numFmt.set(nm.attrs["w:numId"], a);
    }
  }

  // footnotes
  const footnotes = new Map<string, XNode>();
  const fnPart = relOf("footnotes", "");
  const fnXml = fnPart ? zip.text(fnPart) : null;
  if (fnXml) for (const f of findAll(parseXml(fnXml), "w:footnote")) if (!f.attrs["w:type"] || f.attrs["w:type"] === "normal") footnotes.set(f.attrs["w:id"], f);
  const usedNotes: string[] = [];

  const SKIP = new Set(["w:pPr", "w:rPr", "w:del", "w:moveFrom", "w:instrText", "w:delText", "w:delInstrText", "w:fldData", "w:rPrChange", "w:pPrChange"]);
  const image = (nd: XNode): string | null => {
    const blip = find(nd, "a:blip"), vimg = find(nd, "v:imagedata");
    const id = blip?.attrs["r:embed"] ?? blip?.attrs["r:link"] ?? vimg?.attrs["r:id"];
    const rel = id ? rels.get(id) : undefined;
    if (!rel) return null;
    const alt = (find(nd, "wp:docPr")?.attrs.descr || "image").replace(/[\[\]\n]/g, " ").trim();
    return `![${alt}](${rel.external ? rel.target : posix.relative(partDir(docPart), rel.target)})`;
  };

  const inline = (nd: XNode, segs: Seg[], href?: string, b?: boolean, i?: boolean) => {
    for (const c of nd.children) {
      if (!isEl(c) || SKIP.has(c.name)) continue;
      switch (c.name) {
        case "w:r": {
          const rPr = child(c, "w:rPr");
          inline(c, segs, href, onOff(child(rPr, "w:b")) || undefined, onOff(child(rPr, "w:i")) || undefined);
          break;
        }
        case "w:t": segs.push({ t: c.children.filter((x): x is string => typeof x === "string").join(""), b, i, href }); break;
        case "w:tab": case "w:ptab": segs.push({ t: "\t", href }); break;
        case "w:br": case "w:cr": segs.push({ t: "\n", href }); break;
        case "w:noBreakHyphen": segs.push({ t: "-", b, i, href }); break;
        case "w:softHyphen": break;
        case "w:footnoteReference": { const id = c.attrs["w:id"]; if (footnotes.has(id)) { usedNotes.push(id); segs.push({ t: `[^${id}]`, raw: true, href }); } break; }
        case "w:drawing": case "w:pict": case "w:object": {
          const img = image(c);
          if (img) segs.push({ t: img, raw: true });
          for (const tb of findAll(c, "w:txbxContent")) for (const p of kids(tb, "w:p")) { const s: Seg[] = []; inline(p, s); const t = renderSegs(s, " ").trim(); if (t) segs.push({ t: (segs.length ? "\n" : "") + t, raw: true }); }
          break;
        }
        case "mc:AlternateContent": { const ch = child(c, "mc:Choice") ?? child(c, "mc:Fallback"); if (ch) inline(ch, segs, href, b, i); break; }
        case "w:hyperlink": {
          const rel = c.attrs["r:id"] ? rels.get(c.attrs["r:id"]) : undefined;
          inline(c, segs, rel ? rel.target : c.attrs["w:anchor"] ? `#${c.attrs["w:anchor"]}` : href, b, i);
          break;
        }
        default: inline(c, segs, href, b, i);
      }
    }
  };

  const paraInfo = (p: XNode) => {
    const pPr = child(p, "w:pPr");
    const styleId = child(pPr, "w:pStyle")?.attrs["w:val"];
    let numId = child(child(pPr, "w:numPr"), "w:numId")?.attrs["w:val"];
    let ilvl = Number(child(child(pPr, "w:numPr"), "w:ilvl")?.attrs["w:val"] ?? NaN);
    if (numId === undefined) for (const s of styleChain(styleId)) if (s.numId !== undefined) { numId = s.numId; if (Number.isNaN(ilvl)) ilvl = s.ilvl ?? 0; break; }
    if (Number.isNaN(ilvl)) ilvl = 0;
    return { styleId, numId: numId && numId !== "0" ? numId : undefined, ilvl };
  };
  const listMarker = (numId: string, ilvl: number) => { const f = numFmt.get(numId)?.get(ilvl) ?? "bullet"; return f === "bullet" || f === "none" ? "-" : "1."; };

  const cellText = (tc: XNode): string => {
    const parts: string[] = [];
    for (const c of kids(tc)) {
      if (c.name === "w:p") {
        const s: Seg[] = []; inline(c, s);
        const t = renderSegs(s, "<br>").trim();
        const info = paraInfo(c);
        if (t) parts.push(info.numId ? `${listMarker(info.numId, info.ilvl) === "-" ? "•" : "1."} ${t}` : t);
      } else if (c.name === "w:tbl") {
        for (const tr of findAll(c, "w:tr")) parts.push(kids(tr, "w:tc").map(cellText).join(" / "));
      } else if (c.name === "w:sdt") parts.push(cellText(child(c, "w:sdtContent") ?? c));
    }
    return parts.join("<br>");
  };
  const table = (tbl: XNode): string => {
    const rows: string[][] = [];
    for (const tr of findAll(tbl, "w:tr")) {
      if (findAll(tr, "w:tr").length) continue;
      const row: string[] = [];
      const cells: XNode[] = [];
      for (const c of kids(tr)) if (c.name === "w:tc") cells.push(c); else if (c.name === "w:sdt") cells.push(...kids(child(c, "w:sdtContent"), "w:tc"));
      for (const tc of cells) {
        const tcPr = child(tc, "w:tcPr");
        const vm = child(tcPr, "w:vMerge");
        row.push(vm && vm.attrs["w:val"] !== "restart" ? "" : cellText(tc));
        const span = Number(child(tcPr, "w:gridSpan")?.attrs["w:val"] ?? 1);
        for (let k = 1; k < span && k < 64; k++) row.push("");
      }
      rows.push(row);
    }
    return mdTable(rows);
  };

  const blocks: { kind: "list" | "para"; text: string }[] = [];
  const walkBody = (nd: XNode) => {
    for (const c of kids(nd)) {
      if (c.name === "w:p") {
        const info = paraInfo(c);
        const segs: Seg[] = [];
        inline(c, segs);
        const h = headingLevel(info.styleId);
        if (h) { const t = renderSegs(segs.map((s) => ({ ...s, b: false, i: false })), " ").trim(); if (t) blocks.push({ kind: "para", text: `${"#".repeat(h)} ${t}` }); continue; }
        const t = renderSegs(segs, "  \n").trim();
        if (!t) continue;
        const lit = /^([•◦▪‣·○■□])\s+/.exec(t);
        if (!info.numId && lit) {
          // typed bullet characters (common in converted/pasted documents): indent from w:ind left (720 twips per level)
          const left = Number(child(child(c, "w:pPr"), "w:ind")?.attrs["w:left"] ?? child(child(c, "w:pPr"), "w:ind")?.attrs["w:start"] ?? 720);
          blocks.push({ kind: "list", text: `${"  ".repeat(Math.max(0, Math.min(8, Math.round(left / 720) - 1)))}- ${t.slice(lit[0].length)}` });
          continue;
        }
        if (info.numId) { const mk = listMarker(info.numId, info.ilvl); blocks.push({ kind: "list", text: `${" ".repeat(Math.min(info.ilvl, 8) * (mk === "-" ? 2 : 3))}${mk} ${t}` }); }
        else blocks.push({ kind: "para", text: t });
      } else if (c.name === "w:tbl") blocks.push({ kind: "para", text: table(c) });
      else if (c.name === "w:sdt") walkBody(child(c, "w:sdtContent") ?? c);
      else if (c.name === "w:customXml" || c.name === "w:ins" || c.name === "w:moveTo") walkBody(c);
      else if (c.name === "mc:AlternateContent") { const ch = child(c, "mc:Choice") ?? child(c, "mc:Fallback"); if (ch) walkBody(ch); }
    }
  };
  const body = find(parseXml(xml), "w:body");
  if (!body) throw new Error("document has no w:body");
  walkBody(body);
  let md = joinBlocks(blocks);
  if (usedNotes.length) {
    const lines = [...new Set(usedNotes)].map((id) => {
      const s: Seg[] = [];
      for (const p of kids(footnotes.get(id), "w:p")) { inline(p, s); s.push({ t: " ", raw: true }); }
      return `[^${id}]: ${renderSegs(s, " ").replace(/\s+/g, " ").trim()}`;
    });
    md += "\n\n" + lines.join("\n");
  }
  if (!md.trim()) warnings.push("no text found in document");
  return md;
}

// ───────────────────────────── SpreadsheetML ─────────────────────────────

const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58]);
const BUILTIN_TIME = new Set([18, 19, 20, 21, 22, 32, 33, 45, 46, 47, 55, 56]);

function classifyFormat(id: number, code?: string): "date" | "time" | "datetime" | "percent" | null {
  if (code === undefined) {
    if (id === 22) return "datetime";
    if (BUILTIN_DATE.has(id)) return "date";
    if (BUILTIN_TIME.has(id)) return "time";
    if (id === 9 || id === 10) return "percent";
    return null;
  }
  const c = code.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[(?!h\]|m\]|s\])[^\]]*\]/gi, "").split(";")[0].toLowerCase();
  if (/general/.test(c) && !/[dy]/.test(c)) return null;
  const hasD = /[dy]/.test(c), hasT = /[hs]/.test(c), hasM = /m/.test(c);
  if (hasD || (hasM && !hasT)) return hasT ? "datetime" : "date";
  if (hasT) return "time";
  if (/%/.test(c)) return "percent";
  return null;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function serialToIso(serial: number, kind: "date" | "time" | "datetime", date1904: boolean): string {
  const ms = Math.round(((date1904 ? serial + 1462 : serial) - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  if (kind === "time") return time;
  if (kind === "date" && Math.abs(serial - Math.round(serial)) < 1e-9) return date;
  return kind === "date" ? date : `${date} ${time}`;
}
const fmtNum = (v: string) => { const x = Number(v); return Number.isFinite(x) && v.trim() !== "" ? String(parseFloat(x.toPrecision(15))) : v; };
const colIndex = (ref: string) => { const m = /^([A-Z]+)/i.exec(ref); if (!m) return -1; let n = 0; for (const ch of m[1].toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
function richText(si: XNode | undefined): string {
  if (!si) return "";
  let s = "";
  for (const c of kids(si)) {
    if (c.name === "t") s += c.children.filter((x): x is string => typeof x === "string").join("");
    else if (c.name === "r") for (const t of kids(c, "t")) s += t.children.filter((x): x is string => typeof x === "string").join("");
  }
  return s;
}

const MAX_COLS = 512;

/** trim empty trailing rows/cols and empty leading cols, then render; returns rows kept */
function finishGrid(rows: string[][]): string[][] {
  while (rows.length && rows[rows.length - 1].every((v) => !v)) rows.pop();
  let maxC = 0, minC = Infinity;
  for (const r of rows) r.forEach((v, k) => { if (v) { maxC = Math.max(maxC, k + 1); minC = Math.min(minC, k); } });
  if (!Number.isFinite(minC)) return [];
  return rows.map((r) => Array.from({ length: maxC - minC }, (_, k) => r[minC + k] ?? ""));
}

function convertXlsx(zip: Zip, opts: OfficeOptions, warnings: string[]): string {
  const wbPart = mainPart(zip, "/officeDocument", "xl/workbook.xml");
  const wbXml = zip.text(wbPart);
  if (!wbXml) throw new Error(`missing workbook part ${wbPart}`);
  const wb = parseXml(wbXml);
  const rels = relsFor(zip, wbPart);
  const relOf = (type: string, def: string) => { for (const r of rels.values()) if (r.type.endsWith("/" + type)) return r.target; return def; };
  const date1904 = ["1", "true"].includes(find(wb, "workbookPr")?.attrs.date1904 ?? "");

  const shared: string[] = [];
  const ssXml = zip.text(relOf("sharedStrings", "xl/sharedStrings.xml"));
  if (ssXml) for (const si of kids(find(parseXml(ssXml), "sst"), "si")) shared.push(richText(si));

  const xfKind: ("date" | "time" | "datetime" | "percent" | null)[] = [];
  const stXml = zip.text(relOf("styles", "xl/styles.xml"));
  if (stXml) {
    const st = parseXml(stXml);
    const custom = new Map<number, string>();
    for (const f of kids(find(st, "numFmts"), "numFmt")) custom.set(Number(f.attrs.numFmtId), f.attrs.formatCode ?? "");
    for (const xf of kids(find(st, "cellXfs"), "xf")) { const id = Number(xf.attrs.numFmtId ?? 0); xfKind.push(classifyFormat(id, custom.get(id))); }
  }

  const maxRows = Math.max(1, opts.maxRows ?? 500);
  const want = opts.sheets?.length ? new Set(opts.sheets.map((s) => s.toLowerCase())) : null;
  const sheets = kids(find(wb, "sheets"), "sheet");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sh of sheets) {
    const name = sh.attrs.name ?? "Sheet";
    if (want && !want.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const rel = rels.get(sh.attrs["r:id"]);
    const hidden = sh.attrs.state && sh.attrs.state !== "visible" ? ` (${sh.attrs.state})` : "";
    if (!rel || rel.type.endsWith("/chartsheet")) { out.push(`## ${name}${hidden}\n\n_(chart sheet — no cell data)_`); continue; }
    const xml = zip.text(rel.target);
    if (!xml) { warnings.push(`sheet "${name}": part ${rel.target} missing`); continue; }
    const sd = find(parseXml(xml), "sheetData");
    const rows: string[][] = [];
    let lastRowIdx = -1, lastNonEmpty = -1, colWarn = false;
    for (const r of kids(sd, "row")) {
      const ri = r.attrs.r ? Number(r.attrs.r) - 1 : lastRowIdx + 1;
      lastRowIdx = ri;
      const row: string[] = [];
      let ci = -1, any = false;
      for (const c of kids(r, "c")) {
        ci = c.attrs.r ? colIndex(c.attrs.r) : ci + 1;
        if (ci < 0) continue;
        if (ci >= MAX_COLS) { colWarn = true; continue; }
        const t = c.attrs.t ?? "n";
        const v = child(c, "v")?.children.filter((x): x is string => typeof x === "string").join("") ?? "";
        let val = "";
        if (t === "s") val = shared[Number(v)] ?? "";
        else if (t === "inlineStr") val = richText(child(c, "is"));
        else if (t === "b") val = v === "1" ? "TRUE" : v === "0" ? "FALSE" : v;
        else if (t === "str" || t === "e") val = v;
        else if (t === "d") val = v.replace(/T00:00:00(\.0+)?Z?$/, "");
        else if (v !== "") {
          const kind = xfKind[Number(c.attrs.s ?? 0)];
          const x = Number(v);
          if (kind && kind !== "percent" && Number.isFinite(x)) val = serialToIso(x, kind, date1904);
          else if (kind === "percent" && Number.isFinite(x)) val = fmtNum(String(x * 100)) + "%";
          else val = fmtNum(v);
        }
        if (val) any = true;
        row[ci] = val;
      }
      if (any) lastNonEmpty = ri;
      if (ri < maxRows) rows[ri] = row;
    }
    for (let k = 0; k < rows.length; k++) if (!rows[k]) rows[k] = [];
    if (colWarn) warnings.push(`sheet "${name}": columns beyond ${MAX_COLS} were dropped`);
    const grid = finishGrid(rows);
    let section = `## ${name}${hidden}\n\n${grid.length ? mdTable(grid) : "_(empty sheet)_"}`;
    if (lastNonEmpty >= maxRows) {
      section += `\n\n_(truncated: showing the first ${maxRows} of ${lastNonEmpty + 1} rows; raise max_rows to see more)_`;
      warnings.push(`sheet "${name}" truncated at ${maxRows} of ${lastNonEmpty + 1} rows`);
    }
    out.push(section);
  }
  if (want) for (const w of opts.sheets!) if (!seen.has(w.toLowerCase())) warnings.push(`sheet "${w}" not found (available: ${sheets.map((s) => s.attrs.name).join(", ")})`);
  return out.join("\n\n");
}

// ───────────────────────────── PresentationML ─────────────────────────────

function convertPptx(zip: Zip, opts: OfficeOptions, warnings: string[]): string {
  const presPart = mainPart(zip, "/officeDocument", "ppt/presentation.xml");
  const presXml = zip.text(presPart);
  if (!presXml) throw new Error(`missing presentation part ${presPart}`);
  const rels = relsFor(zip, presPart);
  let slideParts = kids(find(parseXml(presXml), "p:sldIdLst"), "p:sldId").map((s) => rels.get(s.attrs["r:id"])?.target).filter((t): t is string => !!t);
  if (!slideParts.length) slideParts = zip.names().filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n)).sort((a, b) => Number(/(\d+)\.xml$/i.exec(a)![1]) - Number(/(\d+)\.xml$/i.exec(b)![1]));
  const includeNotes = opts.includeNotes !== false;

  const paraText = (p: XNode, srels: Map<string, Rel>): string => {
    const segs: Seg[] = [];
    for (const r of kids(p)) {
      if (r.name === "a:r" || r.name === "a:fld") {
        const rPr = child(r, "a:rPr");
        const link = child(rPr, "a:hlinkClick")?.attrs["r:id"];
        const rel = link ? srels.get(link) : undefined;
        const t = kids(r, "a:t").map((x) => x.children.filter((y): y is string => typeof y === "string").join("")).join("");
        segs.push({ t, b: rPr?.attrs.b === "1" || rPr?.attrs.b === "true" || undefined, i: rPr?.attrs.i === "1" || rPr?.attrs.i === "true" || undefined, href: rel?.external ? rel.target : undefined });
      } else if (r.name === "a:br") segs.push({ t: " " });
    }
    return renderSegs(segs, " ").replace(/\s+/g, " ").trim();
  };
  const txBodyText = (tx: XNode | undefined, srels: Map<string, Rel>, sep: string) => kids(tx, "a:p").map((p) => paraText(p, srels)).filter(Boolean).join(sep);

  const out: string[] = [];
  slideParts.forEach((part, idx) => {
    const xml = zip.text(part);
    if (!xml) { warnings.push(`slide ${idx + 1}: part ${part} missing`); return; }
    const sld = parseXml(xml);
    const srels = relsFor(zip, part);
    let title = "";
    const lines: string[] = [];
    const walk = (tree: XNode | undefined) => {
      for (const sp of kids(tree)) {
        if (sp.name === "p:grpSp") { walk(sp); continue; }
        if (sp.name === "mc:AlternateContent") { walk(child(sp, "mc:Choice") ?? child(sp, "mc:Fallback")); continue; }
        if (sp.name === "p:sp") {
          const ph = find(child(sp, "p:nvSpPr"), "p:ph");
          const type = ph?.attrs.type ?? (ph ? "body" : "");
          if (["sldNum", "dt", "ftr", "hdr"].includes(type)) continue;
          const tx = child(sp, "p:txBody");
          if ((type === "title" || type === "ctrTitle") && !title) { title = txBodyText(tx, srels, " "); continue; }
          for (const p of kids(tx, "a:p")) {
            const t = paraText(p, srels);
            if (!t) continue;
            const lvl = Math.min(8, Number(child(p, "a:pPr")?.attrs.lvl ?? 0) || 0);
            lines.push(`${"  ".repeat(lvl)}- ${t}`);
          }
        } else if (sp.name === "p:graphicFrame") {
          const tbl = find(sp, "a:tbl");
          if (tbl) {
            const rows = kids(tbl, "a:tr").map((tr) => kids(tr, "a:tc").map((tc) => (tc.attrs.hMerge === "1" || tc.attrs.vMerge === "1" ? "" : txBodyText(child(tc, "a:txBody"), srels, "<br>"))));
            lines.push("\n" + mdTable(rows) + "\n");
          } else if (find(sp, "c:chart")) lines.push("_(chart)_");
          else if (find(sp, "a:graphicData")?.attrs.uri?.includes("diagram")) lines.push("_(SmartArt diagram)_");
        } else if (sp.name === "p:pic") {
          const id = find(sp, "a:blip")?.attrs["r:embed"];
          const rel = id ? srels.get(id) : undefined;
          const alt = (find(sp, "p:cNvPr")?.attrs.descr || "image").replace(/[\[\]\n]/g, " ").trim();
          if (rel) lines.push(`![${alt}](${rel.external ? rel.target : posix.relative(partDir(presPart), rel.target)})`);
        }
      }
    };
    walk(find(sld, "p:spTree"));
    const hidden = find(sld, "p:sld")?.attrs.show === "0" ? " (hidden)" : "";
    let sec = `## Slide ${idx + 1}${title ? `: ${title}` : ""}${hidden}`;
    const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (body) sec += "\n\n" + body;
    if (includeNotes) for (const r of srels.values()) if (r.type.endsWith("/notesSlide")) {
      const nx = zip.text(r.target);
      if (!nx) continue;
      const nrels = relsFor(zip, r.target);
      const notes: string[] = [];
      for (const sp of findAll(parseXml(nx), "p:sp")) {
        const ph = find(child(sp, "p:nvSpPr"), "p:ph");
        if (ph?.attrs.type !== "body") continue;
        const t = txBodyText(child(sp, "p:txBody"), nrels, "\n");
        if (t) notes.push(t);
      }
      if (notes.length) sec += "\n\n" + notes.join("\n").split("\n").map((l, k) => (k === 0 ? `> Notes: ${l}` : `> ${l}`)).join("\n");
    }
    out.push(sec);
  });
  if (!out.length) warnings.push("presentation has no slides");
  return out.join("\n\n");
}

// ───────────────────────────── OpenDocument ─────────────────────────────

function convertOdf(zip: Zip, ext: string, opts: OfficeOptions, warnings: string[]): { md: string; kind: string } {
  const xml = zip.text("content.xml");
  if (!xml) throw new Error("missing content.xml — not an OpenDocument package");
  const doc = parseXml(xml);
  const stylesDoc = zip.has("styles.xml") ? parseXml(zip.text("styles.xml")!) : undefined;

  // text styles (bold/italic), paragraph style parents (Title/Heading), list styles (bullet/number per level)
  const tstyle = new Map<string, { b?: boolean; i?: boolean; parent?: string; display?: string }>();
  const listStyles = new Map<string, ("bullet" | "number")[]>();
  for (const root of [stylesDoc, doc]) {
    for (const s of findAll(root, "style:style")) {
      const tp = child(s, "style:text-properties");
      const fw = tp?.attrs["fo:font-weight"], fs = tp?.attrs["fo:font-style"];
      tstyle.set(s.attrs["style:name"], { b: fw ? fw === "bold" || Number(fw) >= 600 : undefined, i: fs ? fs === "italic" || fs === "oblique" : undefined, parent: s.attrs["style:parent-style-name"], display: s.attrs["style:display-name"] });
    }
    for (const ls of findAll(root, "text:list-style")) {
      const lv: ("bullet" | "number")[] = [];
      for (const l of kids(ls)) { const n = Number(l.attrs["text:level"] ?? 1) - 1; lv[n] = l.name === "text:list-level-style-number" ? "number" : "bullet"; }
      listStyles.set(ls.attrs["style:name"], lv);
    }
  }
  const fmtOf = (name?: string) => {
    let b: boolean | undefined, i: boolean | undefined;
    for (let d = 0, cur = name; cur && d < 10; d++) { const s = tstyle.get(cur); if (!s) break; b ??= s.b; i ??= s.i; cur = s.parent; }
    return { b, i };
  };
  const paraHeading = (name?: string) => {
    for (let d = 0, cur = name; cur && d < 10; d++) {
      const s = tstyle.get(cur);
      const nm = (s?.display ?? cur).replace(/_20_/g, " ").toLowerCase();
      if (nm === "title") return 1;
      const m = /^heading ([1-9])$/.exec(nm);
      if (m) return Math.min(6, Number(m[1]));
      if (!s) break;
      cur = s.parent;
    }
    return 0;
  };

  const notes: string[] = [];
  const inline = (nd: XNode, segs: Seg[], b?: boolean, i?: boolean, href?: string) => {
    for (const c of nd.children) {
      if (typeof c === "string") { segs.push({ t: c.replace(/[ \t\r\n]+/g, " "), b, i, href }); continue; }
      switch (c.name) {
        case "text:span": { const f = fmtOf(c.attrs["text:style-name"]); inline(c, segs, f.b ?? b, f.i ?? i, href); break; }
        case "text:a": inline(c, segs, b, i, c.attrs["xlink:href"]); break;
        case "text:s": segs.push({ t: " ".repeat(Math.min(100, Number(c.attrs["text:c"] ?? 1) || 1)), href }); break;
        case "text:tab": segs.push({ t: "\t", href }); break;
        case "text:line-break": segs.push({ t: "\n", href }); break;
        case "text:note": {
          const id = String(notes.length + 1);
          const s: Seg[] = [];
          for (const p of findAll(child(c, "text:note-body"), "text:p")) { inline(p, s); s.push({ t: " ", raw: true }); }
          notes.push(`[^${id}]: ${renderSegs(s, " ").replace(/\s+/g, " ").trim()}`);
          segs.push({ t: `[^${id}]`, raw: true });
          break;
        }
        case "draw:frame": {
          const img = child(c, "draw:image");
          if (img?.attrs["xlink:href"]) segs.push({ t: `![${(child(c, "svg:desc") ? textOf(child(c, "svg:desc")!) : "") || "image"}](${img.attrs["xlink:href"]})`, raw: true });
          const tb = child(c, "draw:text-box");
          if (tb) for (const p of findAll(tb, "text:p")) { const s: Seg[] = []; inline(p, s); const t = renderSegs(s, " ").trim(); if (t) segs.push({ t: " " + t, raw: true }); }
          break;
        }
        case "office:annotation": case "office:annotation-end": case "text:tracked-changes": case "text:bookmark-ref": inline(c, segs, b, i, href); break;
        default: inline(c, segs, b, i, href);
      }
    }
  };
  const textOf = (nd: XNode): string => nd.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
  const para = (p: XNode, brk = "  \n") => { const s: Seg[] = []; inline(p, s); return renderSegs(s, brk).replace(/^ +| +$/gm, "").trim(); };

  const odfTable = (t: XNode, maxRows = Infinity): { rows: string[][]; total: number } => {
    const rows: string[][] = [];
    let ri = 0, last = -1;
    const visitRows = (nd: XNode) => {
      for (const r of kids(nd)) {
        if (r.name === "table:table-row") {
          const rep = Math.max(1, Number(r.attrs["table:number-rows-repeated"] ?? 1) || 1);
          const row: string[] = [];
          let ci = 0, any = false;
          for (const c of kids(r)) {
            if (c.name !== "table:table-cell" && c.name !== "table:covered-table-cell") continue;
            const crep = Math.max(1, Number(c.attrs["table:number-columns-repeated"] ?? 1) || 1);
            let v = "";
            if (c.name === "table:table-cell") {
              const vt = c.attrs["office:value-type"];
              const parts = kids(c).filter((x) => x.name === "text:p" || x.name === "text:h" || x.name === "text:list").map((x) => (x.name === "text:list" ? findAll(x, "text:p").map((p) => para(p, "<br>")).join("<br>") : para(x, "<br>")));
              v = parts.join("<br>");
              if (vt === "date" && c.attrs["office:date-value"]) v = c.attrs["office:date-value"].replace(/T00:00:00(\.0+)?$/, "");
              else if (!v && c.attrs["office:value"] !== undefined) v = fmtNum(c.attrs["office:value"]);
              else if (!v && vt === "boolean") v = String(c.attrs["office:boolean-value"]).toUpperCase();
            }
            if (v) { any = true; for (let k = 0; k < crep && ci + k < MAX_COLS; k++) row[ci + k] = v; }
            ci += crep;
          }
          if (any) {
            for (let k = 0; k < rep; k++) { if (ri + k < maxRows) rows[ri + k] = row.slice(); last = ri + k; if (k > 10000) break; }
          }
          ri += rep;
        } else if (["table:table-header-rows", "table:table-rows", "table:table-row-group"].includes(r.name)) visitRows(r);
      }
    };
    visitRows(t);
    for (let k = 0; k < rows.length; k++) if (!rows[k]) rows[k] = [];
    return { rows: finishGrid(rows), total: last + 1 };
  };

  const blocks: { kind: "list" | "para"; text: string }[] = [];
  const list = (l: XNode, depth: number, styleName?: string, cell = false) => {
    const sn = l.attrs["text:style-name"] ?? styleName;
    const kind = (sn && listStyles.get(sn)?.[depth]) ?? "bullet";
    for (const item of kids(l)) {
      if (item.name !== "text:list-item" && item.name !== "text:list-header") continue;
      let first = true;
      for (const c of kids(item)) {
        if (c.name === "text:list") { list(c, depth + 1, sn); continue; }
        if (c.name !== "text:p" && c.name !== "text:h") continue;
        const t = para(c);
        if (!t) continue;
        blocks.push({ kind: "list", text: `${"  ".repeat(depth)}${first ? (kind === "number" ? "1." : "-") : "  "} ${t}` });
        first = false;
      }
    }
  };
  const walkText = (nd: XNode | undefined) => {
    for (const c of kids(nd)) {
      switch (c.name) {
        case "text:h": { const t = para(c, " "); if (t) blocks.push({ kind: "para", text: `${"#".repeat(Math.min(6, Math.max(1, Number(c.attrs["text:outline-level"] ?? 1) || 1)))} ${t}` }); break; }
        case "text:p": { const h = paraHeading(c.attrs["text:style-name"]); const t = para(c, h ? " " : "  \n"); if (t) blocks.push({ kind: "para", text: h ? `${"#".repeat(h)} ${t}` : t }); break; }
        case "text:list": list(c, 0); break;
        case "table:table": blocks.push({ kind: "para", text: mdTable(odfTable(c).rows) }); break;
        case "text:section": case "text:index-body": case "text:table-of-content": case "text:alphabetical-index": case "text:illustration-index": case "text:soft-page-break": walkText(c); break;
      }
    }
  };

  const body = child(child(doc, "office:document-content") ?? find(doc, "office:document-content"), "office:body") ?? find(doc, "office:body");
  const textBody = child(body, "office:text"), sheetBody = child(body, "office:spreadsheet"), presBody = child(body, "office:presentation") ?? child(body, "office:drawing");
  if (textBody) {
    walkText(textBody);
    let md = joinBlocks(blocks);
    if (notes.length) md += "\n\n" + notes.join("\n");
    return { md, kind: "odt" };
  }
  if (sheetBody) {
    const maxRows = Math.max(1, opts.maxRows ?? 500);
    const want = opts.sheets?.length ? new Set(opts.sheets.map((s) => s.toLowerCase())) : null;
    const out: string[] = [];
    const all = kids(sheetBody, "table:table");
    for (const t of all) {
      const name = t.attrs["table:name"] ?? "Sheet";
      if (want && !want.has(name.toLowerCase())) continue;
      const { rows, total } = odfTable(t, maxRows);
      let sec = `## ${name}\n\n${rows.length ? mdTable(rows) : "_(empty sheet)_"}`;
      if (total > maxRows) { sec += `\n\n_(truncated: showing the first ${maxRows} of ${total} rows; raise max_rows to see more)_`; warnings.push(`sheet "${name}" truncated at ${maxRows} of ${total} rows`); }
      out.push(sec);
    }
    if (want) for (const w of opts.sheets!) if (!all.some((t) => (t.attrs["table:name"] ?? "").toLowerCase() === w.toLowerCase())) warnings.push(`sheet "${w}" not found`);
    return { md: out.join("\n\n"), kind: "ods" };
  }
  if (presBody) {
    const out: string[] = [];
    kids(presBody, "draw:page").forEach((pg, idx) => {
      let title = "";
      const lines: string[] = [];
      const listDepth = (nd: XNode, depth: number) => {
        for (const c of kids(nd)) {
          if (c.name === "text:p" || c.name === "text:h") { const t = para(c, " "); if (t) lines.push(`${"  ".repeat(Math.max(0, depth))}- ${t}`); }
          else if (c.name === "text:list") listDepth(c, depth + 1);
          else if (c.name === "text:list-item" || c.name === "text:list-header") listDepth(c, depth);
        }
      };
      const walk = (nd: XNode) => {
        for (const f of kids(nd)) {
          const cls = f.attrs["presentation:class"];
          if (f.name === "draw:g") { walk(f); continue; }
          if (f.name === "presentation:notes") continue;
          if (["page-number", "footer", "date-time", "header"].includes(cls ?? "")) continue;
          if (f.name === "draw:frame") {
            if (cls === "title" && !title) { title = findAll(f, "text:p").map((p) => para(p, " ")).filter(Boolean).join(" "); continue; }
            const tb = child(f, "draw:text-box");
            if (tb) listDepth(tb, -1);
            const tbl = child(f, "table:table");
            if (tbl) lines.push("\n" + mdTable(odfTable(tbl).rows) + "\n");
            const img = child(f, "draw:image");
            if (img?.attrs["xlink:href"] && !tb) lines.push(`![image](${img.attrs["xlink:href"]})`);
          } else if (f.name === "draw:custom-shape" || f.name === "draw:rect" || f.name === "draw:ellipse") listDepth(f, -1);
        }
      };
      walk(pg);
      let sec = `## Slide ${idx + 1}${title ? `: ${title}` : ""}`;
      const b = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (b) sec += "\n\n" + b;
      if (opts.includeNotes !== false) {
        const n = child(pg, "presentation:notes");
        const nt = n ? findAll(n, "draw:frame").filter((f) => f.attrs["presentation:class"] === "notes").flatMap((f) => findAll(f, "text:p").map((p) => para(p, " "))).filter(Boolean) : [];
        if (nt.length) sec += "\n\n" + nt.map((l, k) => (k === 0 ? `> Notes: ${l}` : `> ${l}`)).join("\n");
      }
      out.push(sec);
    });
    return { md: out.join("\n\n"), kind: "odp" };
  }
  warnings.push("no recognised office:text / office:spreadsheet / office:presentation body");
  return { md: "", kind: ext.slice(1) };
}

// ───────────────────────────── Legacy binaries ─────────────────────────────

function findOnPath(cmd: string): string | null {
  for (const d of (process.env.PATH ?? "").split(delimiter)) { if (!d) continue; const p = join(d, cmd); if (existsSync(p)) return p; }
  return null;
}
function sofficePath(): string | null {
  return findOnPath("soffice") ?? findOnPath("libreoffice") ?? (existsSync("/Applications/LibreOffice.app/Contents/MacOS/soffice") ? "/Applications/LibreOffice.app/Contents/MacOS/soffice" : null);
}

/** What a file really is, from its first bytes (extensions lie: Word saves RTF as .doc, people rename .docx → .doc). */
type OfficeKind = "zip" | "rtf" | "cfb" | "unknown";
function readHead(path: string): Buffer { const fd = openSync(path, "r"); try { const b = Buffer.alloc(8); readSync(fd, b, 0, 8, 0); return b; } finally { closeSync(fd); } }
function sniffOffice(head: Buffer): OfficeKind {
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4) return "zip";
  if (head.length >= 8 && isCfb(Buffer.concat([head, Buffer.alloc(Math.max(0, 512 - head.length))]))) return "cfb";
  if (head.toString("latin1", 0, 5) === "{\\rtf") return "rtf";
  return "unknown";
}

/** The package type of a ZIP-based file, from its parts (for files whose extension doesn't match). */
function zipKind(file: string): string | null {
  const z = new Zip(readFileSync(file));
  if (z.has("word/document.xml")) return ".docx";
  if (z.has("xl/workbook.xml")) return ".xlsx";
  if (z.has("ppt/presentation.xml")) return ".pptx";
  const mt = (z.text("mimetype") ?? "").trim();
  return mt.endsWith(".text") ? ".odt" : mt.endsWith(".spreadsheet") ? ".ods" : mt.endsWith(".presentation") ? ".odp" : null;
}

async function convertLegacy(file: string, ext: string, opts: OfficeOptions, warnings: string[]): Promise<OfficeResult> {
  const buf = readFileSync(file);
  const kind = sniffOffice(buf.subarray(0, 8));
  const done = (r: { markdown: string; warnings: string[] }, format: string): OfficeResult => {
    warnings.push(...r.warnings);
    return { markdown: r.markdown.replace(/\n{3,}/g, "\n\n").trim() + "\n", format, warnings };
  };
  try {
    if (kind === "zip") {
      const real = zipKind(file);
      if (!real) throw new Error("ZIP file is not a Word, Excel, PowerPoint or OpenDocument package");
      if (real !== ext) warnings.push(`file is named ${ext} but is really a ${real} package — converted as ${real}`);
      const r = await convertPackage(file, real, opts, warnings);
      r.markdown = r.markdown.replace(/\n{3,}/g, "\n\n").trim() + "\n";
      return r;
    }
    if (kind === "rtf") {
      if (ext !== ".rtf") warnings.push(`file is named ${ext} but is really RTF — converted as RTF`);
      return done(rtfToMarkdown(buf), "rtf");
    }
    if (kind === "cfb") {
      const c = new Cfb(buf);
      if (c.has("EncryptionInfo") || c.has("EncryptedPackage")) throw new Error("password-protected (encrypted) Office file is not supported — remove the password in Office and save again");
      if (c.has("WordDocument")) return done(docToMarkdown(buf), "doc");
      if (c.has("Workbook") || c.has("Book")) return done(xlsToMarkdown(buf, { sheets: opts.sheets, maxRows: opts.maxRows }), "xls");
      if (c.has("PowerPoint Document")) return done(pptToMarkdown(buf, { includeNotes: opts.includeNotes }), "ppt");
      throw new Error("compound file is not a Word, Excel or PowerPoint document");
    }
    throw new Error(`not a recognised Office file (no ZIP, RTF or compound-file signature)`);
  } catch (e: any) {
    // optional fallback: LibreOffice, if installed, for files the native readers cannot handle (never for encrypted files)
    const soffice = /password|encrypt/i.test(e.message) ? null : sofficePath();
    if (!soffice) throw e;
    warnings.push(`native reader failed (${e.message}); converted with LibreOffice instead`);
    const target = ext === ".xls" || ext === ".xlt" ? "xlsx" : ext === ".ppt" || ext === ".pps" || ext === ".pot" ? "pptx" : "docx";
    const tmp = mkdtempSync(join(tmpdir(), "office-"));
    try {
      await execFileP(soffice, [`-env:UserInstallation=file://${join(tmp, "profile")}`, "--headless", "--convert-to", target, "--outdir", tmp, file], { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
      const out = join(tmp, basename(file, extname(file)) + "." + target);
      const r = await convertPackage(out, "." + target, opts, warnings);
      r.markdown = r.markdown.replace(/\n{3,}/g, "\n\n").trim() + "\n";
      return { ...r, format: `${ext.slice(1)} (via LibreOffice)` };
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
}

// ───────────────────────────── Entry points ─────────────────────────────

async function convertPackage(file: string, ext: string, opts: OfficeOptions, warnings: string[]): Promise<OfficeResult> {
  const st = statSync(file);
  if (st.size > MAX_INPUT_BYTES) throw new Error(`file is ${(st.size / 1e6).toFixed(1)} MB — larger than the ${MAX_INPUT_BYTES / 1e6} MB limit`);
  const zip = new Zip(readFileSync(file));
  if (OOXML_WORD.has(ext)) return { markdown: convertDocx(zip, warnings), format: ext.slice(1), warnings };
  if (OOXML_XL.has(ext)) return { markdown: convertXlsx(zip, opts, warnings), format: ext.slice(1), warnings };
  if (OOXML_PPT.has(ext)) return { markdown: convertPptx(zip, opts, warnings), format: ext.slice(1), warnings };
  const r = convertOdf(zip, ext, opts, warnings);
  return { markdown: r.md, format: ext.slice(1), warnings };
}

export async function officeToMarkdown(path: string, opts: OfficeOptions = {}): Promise<OfficeResult> {
  const ext = extname(path).toLowerCase();
  const warnings: string[] = [];
  if (!existsSync(path)) throw new Error(`file not found: ${path}`);
  if (statSync(path).isDirectory()) throw new Error(`${path} is a directory`);
  if (LEGACY.has(ext)) return convertLegacy(path, ext, opts, warnings);
  if (OOXML_WORD.has(ext) || OOXML_XL.has(ext) || OOXML_PPT.has(ext) || ODF.has(ext)) {
    const kind = sniffOffice(readHead(path));
    if (kind !== "zip") return convertLegacy(path, ext, opts, warnings); // renamed legacy file, RTF, or encrypted OOXML
    const r = await convertPackage(path, ext, opts, warnings);
    r.markdown = r.markdown.replace(/\n{3,}/g, "\n\n").trim() + "\n";
    return r;
  }
  throw new Error(`unsupported format "${ext || basename(path)}" — supported: ${SUPPORTED_EXTENSIONS.join(" ")}`);
}

// ───────────────────────────── Tool ─────────────────────────────

function guard(ctx: ToolContext, p: string, write: boolean): string {
  const abs = resolvePath(ctx.cwd, p);
  const why = blockedReason(abs, ctx.rt?.cfg?.data?.security?.blocked_paths ?? [], write) ?? (write ? protectedReason(abs, ctx.rt?.cfg?.data?.security?.protected_paths ?? []) : null);
  if (why) throw new Error(why);
  return abs;
}

const TOOL_OUTPUT_CHARS = 12_000;

export const officeTool: Tool = {
  name: "office_to_markdown", toolset: "files", tier: "standard", parallelSafe: true,
  description: "Convert Word/Excel/PowerPoint/OpenDocument files (.docx .xlsx .pptx .odt .ods .odp; legacy .doc .xls .ppt .rtf, read natively — nothing to install) to Markdown: headings, lists, bold/italic, links, tables, one table per sheet, one section per slide with speaker notes. `path` may be a folder (every supported file in it). Use `output` to save the .md file(s).",
  parameters: obj({
    path: str("Office file, or a folder to convert every supported file in it (non-recursive)"),
    output: str("Optional: .md file to write (single input) or a folder (one <name>.md per input)"),
    include_notes: bool("Include PowerPoint speaker notes (default true)"),
    sheets: arr(str("sheet name"), "Excel/ODS: only these sheets"),
    max_rows: int("Excel/ODS: rows per sheet before truncating (default 500)"),
  }, ["path"]),
  async handler(a, ctx) {
    const src = guard(ctx, String(a.path ?? ""), false);
    if (!existsSync(src)) return `error: not found: ${src}`;
    let inputs: string[];
    const isDir = statSync(src).isDirectory();
    if (isDir) {
      inputs = readdirSync(src).filter((f) => !f.startsWith("~$") && !f.startsWith(".") && SUPPORTED_EXTENSIONS.includes(extname(f).toLowerCase())).sort().map((f) => join(src, f)).filter((f) => statSync(f).isFile());
      if (!inputs.length) return `error: no supported office files in ${src} (supported: ${SUPPORTED_EXTENSIONS.join(" ")})`;
    } else inputs = [src];
    const opts: OfficeOptions = {
      includeNotes: a.include_notes === undefined ? true : a.include_notes === true || a.include_notes === "true",
      sheets: Array.isArray(a.sheets) ? a.sheets.map(String) : typeof a.sheets === "string" && a.sheets ? a.sheets.split(",").map((s: string) => s.trim()) : undefined,
      maxRows: Number(a.max_rows) > 0 ? Math.floor(Number(a.max_rows)) : 500,
    };
    let outAbs: string | null = null, outIsDir = false;
    if (a.output) {
      outAbs = guard(ctx, String(a.output), true);
      outIsDir = inputs.length > 1 || (existsSync(outAbs) && statSync(outAbs).isDirectory()) || extname(outAbs).toLowerCase() !== ".md";
    }
    const parts: string[] = [], written: string[] = [], warnings: string[] = [], errors: string[] = [];
    for (const f of inputs) {
      try {
        const r = await officeToMarkdown(f, opts);
        warnings.push(...r.warnings.map((w) => (inputs.length > 1 ? `${basename(f)}: ${w}` : w)));
        parts.push(inputs.length > 1 ? `# ${basename(f)}\n\n${r.markdown}` : r.markdown);
        if (outAbs) {
          const dest = outIsDir ? join(outAbs, basename(f, extname(f)) + ".md") : outAbs;
          guard(ctx, dest, true);
          if (existsSync(dest)) ctx.rt?.checkpoints?.take?.(ctx.cwd, `before office_to_markdown ${relative(ctx.cwd, dest)}`, dest);
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, r.markdown);
          written.push(relative(ctx.cwd, dest) || dest);
        }
      } catch (e: any) {
        errors.push(`${basename(f)}: ${e?.message ?? e}`);
      }
    }
    if (!parts.length) return `error: ${errors.join("; ")}`;
    let md = parts.join("\n\n---\n\n");
    const limit = Math.max(2000, Math.min(TOOL_OUTPUT_CHARS, (ctx.maxOutputChars ?? Infinity) - 800));
    if (md.length > limit) md = md.slice(0, limit) + `\n\n… [truncated: ${md.length - limit} more characters${written.length ? ` — full Markdown is in ${written.join(", ")}` : " — pass output=<file.md> to save the full text, then read_file it"}]`;
    const tail: string[] = [];
    if (written.length) tail.push(`Wrote: ${written.join(", ")}`);
    if (warnings.length) tail.push(`Warnings: ${warnings.join("; ")}`);
    if (errors.length) tail.push(`Errors: ${errors.join("; ")}`);
    return tail.length ? `${md}\n\n${tail.join("\n")}` : md;
  },
};

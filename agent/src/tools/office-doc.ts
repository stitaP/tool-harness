/**
 * Legacy Word 97–2003 binary (.doc) → Markdown, following [MS-DOC]. Pure TypeScript, no dependencies, no external tools.
 *
 * Pipeline (section numbers refer to [MS-DOC]):
 *  1. CFB container → "WordDocument" stream; the FIB (§2.5) at its start gives the table stream ("0Table"/"1Table"),
 *     encryption flags, the CP counts (FibRgLw97) and the fc/lcb pairs (FibRgFcLcb97) located through the
 *     variable-length csw/cslw/cbRgFcLcb layout.
 *  2. Text through the piece table (§2.9.38 Clx → Pcdt → PlcPcd): every CP maps to one UTF-16 code unit, either
 *     8-bit (fCompressed, cp1252 with the 0x80–0x9F exceptions) or UTF-16LE.
 *  3. Paragraph properties: PlcBtePapx → PapxFkp pages → istd + sprms (fInTable, fTtp, itap, ilfo/ilvl, outline level).
 *     Character properties: PlcBteChpx → ChpxFkp → bold / italic / hidden.
 *  4. STSH style names (Heading 1..9, Title, built-in sti) → headings; PlfLst/PlfLfo → bullet vs numbered lists.
 *  5. Special characters (§2.8.25 ff.): 0x0D/0x07/0x0B/0x0C structure, fields 0x13/0x14/0x15 (instructions dropped,
 *     HYPERLINK → [text](url)), 0x01/0x08 pictures, 0x02 footnote/endnote references → [^n] notes.
 * Any structural failure past the piece table degrades to plain paragraphs with a warning; offsets are bounds-checked.
 */
import { Cfb, isCfb } from "./office-cfb.js";
import { mdTable } from "./office-md.js";
import { cp1252Char, joinBlocks, renderSegs, rtfToMarkdown, type Block, type Seg } from "./office-rtf.js";

// FibRgFcLcb97 indices (fc at 8*i, lcb at 8*i+4)
const FC = { Stshf: 1, PlcffndRef: 2, PlcffndTxt: 3, PlcfBteChpx: 12, PlcfBtePapx: 13, Clx: 33, PlcfendRef: 46, PlcfendTxt: 47, PlfLst: 73, PlfLfo: 74 } as const;

/** bounds-checked little-endian reads (out of range → 0) */
const u8 = (b: Buffer, o: number) => (o >= 0 && o < b.length ? b[o] : 0);
const u16 = (b: Buffer, o: number) => (o >= 0 && o + 2 <= b.length ? b.readUInt16LE(o) : 0);
const u32 = (b: Buffer, o: number) => (o >= 0 && o + 4 <= b.length ? b.readUInt32LE(o) : 0);
const i32 = (b: Buffer, o: number) => (o >= 0 && o + 4 <= b.length ? b.readInt32LE(o) : 0);

interface Sprm { op: number; off: number; len: number }
/** Iterate a grpprl (§2.6.1 Sprm: spra in the top 3 bits gives the operand size). */
function* sprms(b: Buffer, start: number, end: number): Generator<Sprm> {
  end = Math.min(end, b.length);
  let p = start;
  while (p + 2 <= end) {
    const op = b.readUInt16LE(p);
    p += 2;
    const spra = op >> 13;
    let len: number;
    let off = p;
    switch (spra) {
      case 0: case 1: len = 1; break;
      case 2: case 4: case 5: len = 2; break;
      case 3: len = 4; break;
      case 7: len = 3; break;
      default: // 6: variable
        if (op === 0xd608 || op === 0xd606) { len = u16(b, p) + 1; break; } // sprmTDefTable(10): cb is u16, counts itself minus 1
        if (op === 0xc615 && u8(b, p) === 255) { // sprmPChgTabs long form
          const del = u8(b, p + 1);
          const add = u8(b, p + 2 + del * 4);
          len = 1 + 1 + del * 4 + 1 + add * 3;
          break;
        }
        len = 1 + u8(b, p);
    }
    if (p + len > end) return;
    yield { op, off, len };
    p += len;
  }
}

interface Pap { istd: number; inTable: boolean; ttp: boolean; itap: number; innerCell: boolean; innerTtp: boolean; ilfo: number; ilvl: number; outline: number; dxaLeft: number }
interface Chp { b: boolean; i: boolean; vanish: boolean; hps: number }
interface Run<T> { fcStart: number; fcEnd: number; v: T }
interface Style { name: string; sti: number; base: number; outline: number; ilfo: number; ilvl: number; stk: number }
interface Piece { cpStart: number; cpEnd: number; fc: number; compressed: boolean }

function applyPapSprms(b: Buffer, start: number, end: number, p: Pap) {
  for (const s of sprms(b, start, end)) {
    switch (s.op) {
      case 0x2416: p.inTable = u8(b, s.off) !== 0; break; // sprmPFInTable
      case 0x2417: p.ttp = u8(b, s.off) !== 0; break; // sprmPFTtp
      case 0x6649: p.itap = i32(b, s.off); if (p.itap > 0) p.inTable = true; break; // sprmPItap
      case 0x664a: p.itap += i32(b, s.off); break; // sprmPDtap
      case 0x244b: p.innerCell = u8(b, s.off) !== 0; break; // sprmPFInnerTableCell
      case 0x244c: p.innerTtp = u8(b, s.off) !== 0; break; // sprmPFInnerTtp
      case 0x460b: p.ilfo = u16(b, s.off); break; // sprmPIlfo
      case 0x260a: p.ilvl = u8(b, s.off); break; // sprmPIlvl
      case 0x2640: p.outline = u8(b, s.off); break; // sprmPOutLvl
      case 0x4600: p.istd = u16(b, s.off); break; // sprmPIstd
      case 0x840f: case 0x845e: p.dxaLeft = b.readInt16LE(s.off); break; // sprmPDxaLeft(80)
    }
  }
}
function applyChpSprms(b: Buffer, start: number, end: number, c: Chp) {
  const flag = (v: number, cur: boolean) => (v === 0 ? false : v === 1 ? true : v === 0x81 ? !cur : v === 0x80 ? cur : cur);
  for (const s of sprms(b, start, end)) {
    if (s.op === 0x0835) c.b = flag(u8(b, s.off), c.b);
    else if (s.op === 0x0836) c.i = flag(u8(b, s.off), c.i);
    else if (s.op === 0x083c) c.vanish = flag(u8(b, s.off), c.vanish);
    else if (s.op === 0x4a43) c.hps = u16(b, s.off); // sprmCHps (half-points)
  }
}

/** Read the FKP-based property runs (PlcBtePapx / PlcBteChpx §2.8.6/§2.8.4 → PapxFkp §2.9.175 / ChpxFkp §2.9.33). */
function readFkpRuns<T>(word: Buffer, table: Buffer, fc: number, lcb: number, kind: "papx" | "chpx", parse: (fkp: Buffer, off: number) => T, empty: () => T): Run<T>[] {
  const runs: Run<T>[] = [];
  if (!lcb || fc + lcb > table.length || lcb < 8) return runs;
  const n = Math.floor((lcb - 4) / 8);
  const seen = new Set<number>();
  for (let k = 0; k < n; k++) {
    const pn = u32(table, fc + (n + 1) * 4 + k * 4) & 0x3fffff;
    if (seen.has(pn)) continue;
    seen.add(pn);
    const pg = pn * 512;
    if (pg + 512 > word.length) continue;
    const fkp = word.subarray(pg, pg + 512);
    const cnt = fkp[511];
    if (!cnt || (cnt + 1) * 4 > 511) continue;
    for (let i = 0; i < cnt; i++) {
      const fcStart = fkp.readUInt32LE(i * 4), fcEnd = fkp.readUInt32LE(i * 4 + 4);
      const bx = kind === "papx" ? (cnt + 1) * 4 + i * 13 : (cnt + 1) * 4 + i;
      if (bx >= 511) break;
      const off = fkp[bx] * 2;
      runs.push({ fcStart, fcEnd, v: off ? parse(fkp, off) : empty() });
    }
  }
  runs.sort((a, b) => a.fcStart - b.fcStart);
  return runs;
}
function findRun<T>(runs: Run<T>[], fc: number): T | undefined {
  let lo = 0, hi = runs.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    const r = runs[m];
    if (fc < r.fcStart) hi = m - 1;
    else if (fc >= r.fcEnd) lo = m + 1;
    else return r.v;
  }
  return undefined;
}

/** STSH (§2.9.271): istd → name, built-in sti, base style, outline level / list from the style's PAPX. */
function readStyles(table: Buffer, fc: number, lcb: number): Style[] {
  const out: Style[] = [];
  if (!lcb || fc + lcb > table.length) return out;
  const end = fc + lcb;
  const cbStshi = u16(table, fc);
  const cstd = u16(table, fc + 2), cbBase = u16(table, fc + 4) || 10;
  let p = fc + 2 + cbStshi;
  for (let istd = 0; istd < cstd && p + 2 <= end; istd++) {
    const cb = u16(table, p);
    const s = p + 2;
    p = s + cb;
    if (!cb || p > end) { out.push({ name: "", sti: 0x0ffe, base: 0x0fff, outline: 9, ilfo: 0, ilvl: 0, stk: 0 }); continue; }
    const sti = u16(table, s) & 0x0fff;
    const stk = u16(table, s + 2) & 0x000f, base = u16(table, s + 2) >> 4;
    const cupx = u16(table, s + 4) & 0x000f;
    const cch = u16(table, s + cbBase);
    const nameEnd = s + cbBase + 2 + cch * 2;
    const name = nameEnd <= p ? table.toString("utf16le", s + cbBase + 2, nameEnd) : "";
    const st: Style = { name, sti, base, outline: 9, ilfo: 0, ilvl: 0, stk };
    // grLPUpxSw: for paragraph styles the first UPX is the PAPX (istd u16 + grpprl); each LPUpx padded to even
    let q = nameEnd + 2;
    if (q & 1) q++;
    if (stk === 1 && cupx >= 1 && q + 2 <= p) {
      const cbUpx = u16(table, q);
      if (q + 2 + cbUpx <= p && cbUpx >= 2) {
        const pap: Pap = { istd, inTable: false, ttp: false, itap: 0, innerCell: false, innerTtp: false, ilfo: 0, ilvl: 0, outline: 9, dxaLeft: 0 };
        applyPapSprms(table, q + 4, q + 2 + cbUpx, pap);
        st.outline = pap.outline; st.ilfo = pap.ilfo; st.ilvl = pap.ilvl;
      }
    }
    out.push(st);
  }
  return out;
}

/** PlfLst + PlfLfo (§2.9.183/§2.9.182): ilfo → per-level "is bullet" (nfc 23 = bullet, 0xFF = no number). */
function readLists(table: Buffer, fcLst: number, lcbLst: number, fcLfo: number, lcbLfo: number): Map<number, boolean[]> {
  const byLsid = new Map<number, boolean[]>();
  const out = new Map<number, boolean[]>();
  if (lcbLst && fcLst + lcbLst <= table.length) {
    const end = fcLst + lcbLst;
    const cLst = u16(table, fcLst);
    const lstfs: { lsid: number; simple: boolean }[] = [];
    for (let k = 0; k < cLst && fcLst + 2 + (k + 1) * 28 <= end; k++) {
      const o = fcLst + 2 + k * 28;
      lstfs.push({ lsid: i32(table, o), simple: (u8(table, o + 26) & 1) !== 0 });
    }
    let p = fcLst + 2 + cLst * 28;
    for (const l of lstfs) {
      const levels: boolean[] = [];
      // the LVL records follow the PlfLst immediately, outside lcbPlfLst ([MS-DOC] §2.9.183)
      for (let lv = 0; lv < (l.simple ? 1 : 9) && p + 28 <= table.length; lv++) {
        const nfc = u8(table, p + 4);
        const cbChpx = u8(table, p + 24), cbPapx = u8(table, p + 25);
        levels.push(nfc === 23 || nfc === 0xff);
        p += 28 + cbPapx + cbChpx;
        const cch = u16(table, p);
        p += 2 + cch * 2;
      }
      byLsid.set(l.lsid, levels);
    }
  }
  if (lcbLfo && fcLfo + lcbLfo <= table.length) {
    const n = i32(table, fcLfo);
    for (let k = 0; k < n && k < 32767 && fcLfo + 4 + (k + 1) * 16 <= fcLfo + lcbLfo; k++) {
      const lv = byLsid.get(i32(table, fcLfo + 4 + k * 16));
      if (lv) out.set(k + 1, lv);
    }
  }
  return out;
}

const parseInstr = (instr: string): string | undefined => {
  const m = /^\s*HYPERLINK\b(.*)$/is.exec(instr);
  if (!m) return undefined;
  const rest = m[1];
  const anchor = /\\l\s+"([^"]*)"/.exec(rest) ?? /\\l\s+(\S+)/.exec(rest);
  const url = /^\s*"([^"]*)"/.exec(rest) ?? /^\s*([^\s\\"]+)/.exec(rest);
  if (url) return url[1] + (anchor ? `#${anchor[1]}` : "");
  return anchor ? `#${anchor[1]}` : undefined;
};

export function docToMarkdown(buf: Buffer): { markdown: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!isCfb(buf)) {
    // Word's "Save as RTF" files are very often named .doc
    if (/^\s*\{\\rtf/.test(buf.subarray(0, 32).toString("latin1"))) {
      const r = rtfToMarkdown(buf);
      return { markdown: r.markdown, warnings: ["file is RTF despite the .doc name", ...r.warnings] };
    }
    if (u16(buf, 0) === 0xa5db) throw new Error("unsupported .doc version (Word for Windows 2.x)");
    throw new Error("not a Word 97-2003 .doc file (no OLE2 compound file signature)");
  }
  const cfb = new Cfb(buf);
  if (!cfb.has("WordDocument")) {
    if (cfb.has("EncryptionInfo") || cfb.has("EncryptedPackage")) throw new Error("password-protected .doc is not supported");
    throw new Error("not a Word document (no WordDocument stream)");
  }
  const word = cfb.read("WordDocument");
  const wIdent = u16(word, 0);
  const nFib0 = u16(word, 2);
  const word6 = wIdent === 0xa5dc || (nFib0 >= 0x65 && nFib0 <= 0x69); // Word 6/95 (some localized builds use other wIdents)
  if (word.length < 0x22 || (wIdent !== 0xa5ec && !word6)) throw new Error("not a Word 97-2003 document (bad FIB signature)");
  const nFib = u16(word, 2);
  const flags = u16(word, 0x0a);
  // fEncrypted (RC4 / CryptoAPI or, with fObfuscated, XOR obfuscation); fObfuscated alone must be ignored
  if (flags & 0x0100) throw new Error(`password-protected .doc is not supported (the document is ${flags & 0x8000 ? "XOR-obfuscated" : "encrypted"})`);
  const fComplex = (flags & 0x0004) !== 0;

  // FIB variable layout: FibBase(32) | csw | fibRgW(csw*2) | cslw | fibRgLw(cslw*4) | cbRgFcLcb | fibRgFcLcbBlob(cb*8)
  const csw = u16(word, 0x20);
  const lwPos = 0x22 + csw * 2;
  const cslw = u16(word, lwPos);
  const rgLw = lwPos + 2;
  const fcPos = rgLw + cslw * 4;
  const cbRgFcLcb = u16(word, fcPos);
  const rgFc = fcPos + 2;
  const ccp = (k: number) => (k < cslw ? i32(word, rgLw + k * 4) : 0);
  const ccpText = Math.max(0, ccp(3)), ccpFtn = Math.max(0, ccp(4)), ccpHdd = Math.max(0, ccp(5)), ccpAtn = Math.max(0, ccp(7)), ccpEdn = Math.max(0, ccp(8));
  const fcLcb = (i: number) => (i < cbRgFcLcb ? { fc: u32(word, rgFc + i * 8), lcb: u32(word, rgFc + i * 8 + 4) } : { fc: 0, lcb: 0 });

  if (word6 || nFib < 0xc1) {
    // Word 6/95 (wIdent 0xA5DC, nFib 101–105): older fixed FIB; best effort on non-complex (not fast-saved) files —
    // the text is 8-bit at fcMin (FIB 0x18), ccpText at FIB 0x34
    const fcMin = u32(word, 0x18), fcMac = u32(word, 0x1c);
    if (fComplex || fcMin >= fcMac || fcMac > word.length) throw new Error(`unsupported .doc version (nFib ${nFib}; Word 6/95 files with fast-save are not supported)`);
    warnings.push(`Word 6/95 document (nFib ${nFib}): extracted plain text only`);
    const ccp95 = i32(word, 0x34);
    const n = ccp95 > 0 && fcMin + ccp95 <= fcMac ? ccp95 : fcMac - fcMin;
    let t = "";
    for (let k = 0; k < n; k++) t += cp1252Char(word[fcMin + k]);
    const md = plainParas(t);
    if (!md.trim()) warnings.push("no text found in document");
    return { markdown: md, warnings };
  }

  const tableName = flags & 0x0200 ? "1Table" : "0Table";
  if (!cfb.has(tableName)) throw new Error(`corrupt .doc: table stream ${tableName} is missing`);
  const table = cfb.read(tableName);

  // ── piece table ──
  const clx = fcLcb(FC.Clx);
  if (!clx.lcb || clx.fc + clx.lcb > table.length) throw new Error("corrupt .doc: piece table (Clx) out of range");
  let p = clx.fc;
  const clxEnd = clx.fc + clx.lcb;
  while (p < clxEnd && table[p] === 0x01) p += 3 + table.readInt16LE(p + 1); // Prc: clxt, cbGrpprl, GrpPrl
  if (p >= clxEnd || table[p] !== 0x02) throw new Error("corrupt .doc: piece table (Pcdt) not found");
  const lcbPlc = u32(table, p + 1);
  const plc = p + 5;
  if (plc + lcbPlc > table.length || lcbPlc < 16) throw new Error("corrupt .doc: piece table truncated");
  const nPcd = Math.floor((lcbPlc - 4) / 12);
  const pieces: Piece[] = [];
  for (let k = 0; k < nPcd; k++) {
    const cpStart = u32(table, plc + k * 4), cpEnd = u32(table, plc + (k + 1) * 4);
    const fcc = u32(table, plc + (nPcd + 1) * 4 + k * 8 + 2);
    const compressed = (fcc & 0x40000000) !== 0;
    const fc = compressed ? (fcc & 0x3fffffff) / 2 : fcc & 0x3fffffff;
    if (cpEnd <= cpStart) continue;
    pieces.push({ cpStart, cpEnd, fc, compressed });
  }
  const totalCp = ccpText + ccpFtn + ccpHdd + ccpAtn + ccpEdn;
  // every CP needs at least one byte of the WordDocument stream, which bounds corrupt counts
  const want = Math.min(pieces.length ? pieces[pieces.length - 1].cpEnd : 0, Math.max(ccpText, totalCp + 64), word.length);
  const chars: string[] = [];
  let truncated = false;
  for (const pc of pieces) {
    if (pc.cpStart >= want) break;
    const n = Math.min(pc.cpEnd, want) - pc.cpStart;
    while (chars.length < pc.cpStart) chars.push(""); // gap (corrupt) → empty
    for (let k = 0; k < n; k++) {
      if (pc.compressed) {
        const o = pc.fc + k;
        if (o >= word.length) { truncated = true; break; }
        chars.push(cp1252Char(word[o]));
      } else {
        const o = pc.fc + k * 2;
        if (o + 2 > word.length) { truncated = true; break; }
        chars.push(String.fromCharCode(word.readUInt16LE(o)));
      }
    }
  }
  if (truncated) warnings.push("text runs past the end of the WordDocument stream (truncated file?)");
  const text = chars.join("");
  const fcOf = (cp: number): number => {
    let lo = 0, hi = pieces.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      const pc = pieces[m];
      if (cp < pc.cpStart) hi = m - 1;
      else if (cp >= pc.cpEnd) lo = m + 1;
      else return pc.fc + (cp - pc.cpStart) * (pc.compressed ? 1 : 2);
    }
    return -1;
  };

  // ── formatting / styles / lists (optional: failures degrade) ──
  let papRuns: Run<Pap>[] = [], chpRuns: Run<Chp>[] = [], styles: Style[] = [], lists = new Map<number, boolean[]>();
  let structured = true;
  try {
    const newPap = (): Pap => ({ istd: 0, inTable: false, ttp: false, itap: 0, innerCell: false, innerTtp: false, ilfo: 0, ilvl: 0, outline: 9, dxaLeft: 0 });
    const bp = fcLcb(FC.PlcfBtePapx);
    papRuns = readFkpRuns(word, table, bp.fc, bp.lcb, "papx", (fkp, off) => {
      let cb = fkp[off], start = off + 1;
      let size: number;
      if (cb === 0) { cb = fkp[off + 1]; start = off + 2; size = cb * 2; } else size = cb * 2 - 1;
      const pap = newPap();
      pap.istd = u16(fkp, start);
      applyPapSprms(fkp, start + 2, Math.min(512, start + size), pap);
      return pap;
    }, newPap);
    const bc = fcLcb(FC.PlcfBteChpx);
    chpRuns = readFkpRuns(word, table, bc.fc, bc.lcb, "chpx", (fkp, off) => {
      const c: Chp = { b: false, i: false, vanish: false, hps: 0 };
      applyChpSprms(fkp, off + 1, Math.min(511, off + 1 + fkp[off]), c);
      return c;
    }, () => ({ b: false, i: false, vanish: false, hps: 0 }));
    const ss = fcLcb(FC.Stshf);
    styles = readStyles(table, ss.fc, ss.lcb);
    const ll = fcLcb(FC.PlfLst), lf = fcLcb(FC.PlfLfo);
    lists = readLists(table, ll.fc, ll.lcb, lf.fc, lf.lcb);
    if (!papRuns.length) { structured = false; warnings.push("paragraph properties not found; output is plain paragraphs"); }
  } catch (e) {
    structured = false;
    warnings.push(`could not read document structure (${(e as Error).message}); output is plain paragraphs`);
  }
  if (!structured) {
    const md = plainParas(text.slice(0, ccpText).replace(/\x13[^\x14\x15]*\x14?|\x15/g, ""));
    if (!md.trim()) warnings.push("no text found in document");
    return { markdown: md, warnings };
  }

  const styleChain = (istd: number): Style[] => {
    const out: Style[] = [];
    for (let s = istd, d = 0; d < 12 && s < styles.length && s !== 0x0fff; d++) { out.push(styles[s]); s = styles[s].base; }
    return out;
  };
  const headingOf = (pap: Pap): number => {
    for (const s of styleChain(pap.istd)) {
      const nm = s.name.toLowerCase().trim();
      const m = /^heading\s*([1-9])$/.exec(nm);
      if (m) return Math.min(6, Number(m[1]));
      if (nm === "title" || s.sti === 62) return 1;
      if (s.sti >= 1 && s.sti <= 9) return Math.min(6, s.sti);
      if (s.outline < 9 && nm.startsWith("heading")) return Math.min(6, s.outline + 1);
    }
    if (pap.outline < 9) return Math.min(6, pap.outline + 1);
    return 0;
  };
  const listOf = (pap: Pap): { ilfo: number; ilvl: number } | null => {
    let ilfo = pap.ilfo, ilvl = pap.ilvl;
    if (!ilfo) for (const s of styleChain(pap.istd)) if (s.ilfo) { ilfo = s.ilfo; if (!pap.ilvl) ilvl = s.ilvl; break; }
    return ilfo && ilfo < 0xf000 ? { ilfo, ilvl: Math.min(8, ilvl) } : null;
  };
  const papAt = (cp: number): Pap => findRun(papRuns, fcOf(cp)) ?? { istd: 0, inTable: false, ttp: false, itap: 0, innerCell: false, innerTtp: false, ilfo: 0, ilvl: 0, outline: 9, dxaLeft: 0 };
  let lastChp: { fcStart: number; fcEnd: number; v: Chp } | undefined;
  const chpAt = (cp: number): Chp => {
    const fc = fcOf(cp);
    if (lastChp && fc >= lastChp.fcStart && fc < lastChp.fcEnd) return lastChp.v;
    let lo = 0, hi = chpRuns.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      const r = chpRuns[m];
      if (fc < r.fcStart) hi = m - 1; else if (fc >= r.fcEnd) lo = m + 1; else { lastChp = r; return r.v; }
    }
    return { b: false, i: false, vanish: false, hps: 0 };
  };

  // ── notes: reference CPs (main text) → note text ranges ──
  const notes: string[] = [];
  const noteRefs = new Map<number, () => string>();
  const loadNotes = (refIdx: number, txtIdx: number, base: number, count: number) => {
    const ref = fcLcb(refIdx), txt = fcLcb(txtIdx);
    if (!ref.lcb || !txt.lcb || !count || ref.fc + ref.lcb > table.length || txt.fc + txt.lcb > table.length) return;
    const n = Math.floor((ref.lcb - 4) / 6);
    const nt = Math.floor(txt.lcb / 4);
    for (let k = 0; k < n && k + 1 < nt; k++) {
      const cpRef = u32(table, ref.fc + k * 4);
      const a = u32(table, txt.fc + k * 4), b = u32(table, txt.fc + (k + 1) * 4);
      if (a >= b || b > count) continue;
      noteRefs.set(cpRef, () => renderRange(base + a, base + b, true).replace(/\s+/g, " ").trim());
    }
  };

  // ── render ──
  /** Render a CP range of running text into Markdown inline text (fields resolved, specials mapped). */
  const fieldStack: { instr: string; inResult: boolean; href?: string }[] = [];
  const segsFor = (from: number, to: number, inNote: boolean): Seg[] => {
    const segs: Seg[] = [];
    for (let cp = from; cp < to && cp < text.length; cp++) {
      const c = text.charCodeAt(cp);
      const top = fieldStack[fieldStack.length - 1];
      if (c === 0x13) { fieldStack.push({ instr: "", inResult: false }); continue; }
      if (c === 0x14) { if (top) { top.inResult = true; top.href = parseInstr(top.instr); } continue; }
      if (c === 0x15) { fieldStack.pop(); continue; }
      if (top && !top.inResult) { top.instr += text[cp]; continue; }
      const ch = chpAt(cp);
      let t: string;
      switch (c) {
        case 0x0b: t = "\n"; break;
        case 0x09: t = "\t"; break;
        case 0x1e: t = "-"; break;
        case 0x1f: case 0x05: case 0x03: case 0x04: case 0x07: case 0x0d: case 0x0c: t = ""; break;
        case 0x01: t = "\u0000IMG"; break; // inline picture / OLE object
        case 0x08: t = ""; break; // drawn object anchor (shape / text box / floating picture)
        case 0x02: {
          const nt = !inNote ? noteRefs.get(cp) : undefined;
          if (nt) { const body = nt(); if (body) { notes.push(body); t = `\u0000N${notes.length}`; } else t = ""; } else t = "";
          break;
        }
        default: t = c < 0x20 ? "" : text[cp];
      }
      if (!t || (ch.vanish && t[0] !== "\u0000")) continue;
      let href: string | undefined;
      for (let k = fieldStack.length - 1; k >= 0; k--) if (fieldStack[k].href) { href = fieldStack[k].href; break; }
      const last = segs[segs.length - 1];
      if (last && last.b === ch.b && last.i === ch.i && last.href === href && last.fs === ch.hps) last.t += t;
      else segs.push({ t, b: ch.b, i: ch.i, href, fs: ch.hps });
    }
    return segs;
  };
  const finish = (s: string) => s.replace(/\u0000IMG/g, "![image]()").replace(/\u0000N(\d+)/g, "[^$1]");
  const renderRange = (from: number, to: number, inNote: boolean, brk = " ") => {
    const saved = fieldStack.splice(0);
    const out = finish(renderSegs(segsFor(from, to, inNote), brk));
    fieldStack.push(...saved);
    return out;
  };
  try {
    loadNotes(FC.PlcffndRef, FC.PlcffndTxt, ccpText, ccpFtn);
    loadNotes(FC.PlcfendRef, FC.PlcfendTxt, ccpText + ccpFtn + ccpHdd + ccpAtn, ccpEdn);
  } catch { warnings.push("could not read footnotes/endnotes"); }

  // documents without heading styles (e.g. written by TextEdit/Cocoa): a short, all-bold, single-size paragraph in a large
  // font reads as a heading — 20pt+ → #, 16pt+ → ##, 14pt+ → ###
  let usesHeadingStyles = false;
  for (let k = 0; k < papRuns.length && !usesHeadingStyles; k++) if (headingOf(papRuns[k].v)) usesHeadingStyles = true;
  const sizeHeading = (segs: Seg[]): number => {
    const txt = segs.filter((s) => s.t.trim());
    if (!txt.length || txt.some((s) => !s.b || s.href || s.fs !== txt[0].fs) || segs.some((s) => s.t.includes("\n"))) return 0;
    if (txt.map((s) => s.t).join("").trim().length > 150) return 0;
    const fs = txt[0].fs ?? 0;
    return fs >= 40 ? 1 : fs >= 32 ? 2 : fs >= 28 ? 3 : 0;
  };

  const blocks: Block[] = [];
  let rows: string[][] = [];
  let row: string[] = [];
  let cell: string[] = [];
  let innerRow: string[] = [];
  const flushTable = () => {
    if (innerRow.length) { cell.push(innerRow.join(" / ")); innerRow = []; }
    if (cell.length) { row.push(cell.join("<br>")); cell = []; }
    if (row.length) { rows.push(row); row = []; }
    if (rows.length) blocks.push({ kind: "para", text: mdTable(rows) });
    rows = [];
  };
  const end = Math.min(ccpText || text.length, text.length);
  let start = 0;
  let pictures = 0;
  let carry: Seg[] = [];
  for (let cp = 0; cp < end; cp++) {
    const c = text.charCodeAt(cp);
    if (c !== 0x0d && c !== 0x07 && c !== 0x0c && cp !== end - 1) continue;
    const pap = papAt(cp);
    const segs = carry.concat(segsFor(start, cp + 1, false));
    carry = [];
    start = cp + 1;
    // a paragraph mark inside field instructions does not end the visible paragraph
    if (fieldStack.some((f) => !f.inResult) && cp !== end - 1) { carry = segs; continue; }
    if (pap.inTable || pap.itap > 0) {
      const t = finish(renderSegs(segs, "<br>")).trim();
      if (pap.itap > 1 || pap.innerCell || pap.innerTtp) {
        // nested table: flattened into the enclosing cell — inner cells " / ", inner rows as lines
        if (pap.innerTtp) { if (innerRow.length) cell.push(innerRow.join(" / ")); innerRow = []; }
        else if (pap.innerCell) innerRow.push(t);
        else if (t) cell.push(t);
        continue;
      }
      if (pap.ttp) { if (cell.length || t) { cell.push(t); row.push(cell.filter(Boolean).join("<br>")); cell = []; } if (row.length) rows.push(row); row = []; continue; }
      if (t) cell.push(t);
      if (c === 0x07) { row.push(cell.join("<br>")); cell = []; }
      continue;
    }
    flushTable();
    const h = headingOf(pap);
    if (h) {
      const t = finish(renderSegs(segs.map((s) => ({ ...s, b: false, i: false })), " ")).trim();
      if (t) blocks.push({ kind: "para", text: `${"#".repeat(h)} ${t}` });
      continue;
    }
    let t = finish(renderSegs(segs, "  \n")).trim();
    if (!usesHeadingStyles) {
      const sh = sizeHeading(segs);
      if (sh) { blocks.push({ kind: "para", text: `${"#".repeat(sh)} ${finish(renderSegs(segs.map((s) => ({ ...s, b: false, i: false })), " ")).trim()}` }); continue; }
    }
    pictures += (t.match(/!\[image\]\(\)/g) ?? []).length;
    if (!t) continue;
    const li = listOf(pap);
    if (li) {
      const bullet = lists.get(li.ilfo)?.[li.ilvl] ?? true;
      const mk = bullet ? "-" : "1.";
      blocks.push({ kind: "list", text: `${" ".repeat(li.ilvl * (bullet ? 2 : 3))}${mk} ${t}` });
    } else {
      // typed bullets / numbers ("\t•\tText", "1\tText"): common in converted documents (e.g. TextEdit/Cocoa writers)
      const raw = segs.map((s) => s.t).join("");
      const lvl = Math.max(0, Math.min(8, Math.round(pap.dxaLeft / 720) - 1));
      const lit = /^\s*([•◦▪‣·○■□●])\s+/.exec(t);
      const num = /^\t?\d{1,3}[.)]?\t/.test(raw) ? /^\s*\d{1,3}[.)]?\s+/.exec(t) : null;
      if (lit) blocks.push({ kind: "list", text: `${"  ".repeat(lvl)}- ${t.slice(lit[0].length)}` });
      else if (num) blocks.push({ kind: "list", text: `${"   ".repeat(lvl)}1. ${t.slice(num[0].length)}` });
      else blocks.push({ kind: "para", text: t });
    }
  }
  flushTable();
  let md = joinBlocks(blocks);
  if (notes.length) md += "\n\n" + notes.map((t, k) => `[^${k + 1}]: ${t}`).join("\n");
  if (pictures) warnings.push(`${pictures} embedded picture(s)/object(s) shown as ![image]() placeholders`);
  if (!md.trim()) warnings.push("no text found in document");
  return { markdown: md, warnings };
}

/** Fallback: control characters → paragraph/line breaks, everything else dropped. */
function plainParas(t: string): string {
  return t.replace(/\x0b/g, "  \n").split(/[\r\x07\x0c]+/).map((s) => s.replace(/[\x00-\x08\x0e-\x1f]/g, "").replace(/\t/g, " ").trim()).filter(Boolean).join("\n\n");
}

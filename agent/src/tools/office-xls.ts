/**
 * Native reader for legacy Excel workbooks (.xls): BIFF8 (Excel 97–2003) and BIFF5/BIFF7 (Excel 5.0/95), following
 * [MS-XLS]. Pure TypeScript, Node built-ins only. Output matches the .xlsx conversion in office.ts: one `## <Sheet>`
 * section per sheet in workbook order with a Markdown table (first row as header).
 *
 * Layout: the "Workbook" (BIFF8) or "Book" (BIFF5) stream inside a Compound File is a sequence of records
 * [type u16][size u16][data]. It starts with the workbook-globals substream (BOF … EOF: shared strings, formats, XFs,
 * BOUNDSHEET entries pointing at each sheet's BOF), followed by one substream per sheet holding the cell records.
 */

import { Cfb, isCfb } from "./office-cfb.js";
import { mdTable } from "./office-md.js";

export interface XlsOptions { sheets?: string[]; maxRows?: number }

// record types ([MS-XLS] §2.3)
const R = {
  BOF: 0x0809, EOF: 0x000a, BOUNDSHEET: 0x0085, SST: 0x00fc, CONTINUE: 0x003c, FORMAT: 0x041e, XF: 0x00e0,
  DATEMODE: 0x0022, CODEPAGE: 0x0042, FILEPASS: 0x002f, LABELSST: 0x00fd, LABEL: 0x0204, NUMBER: 0x0203, RK: 0x027e,
  MULRK: 0x00bd, BOOLERR: 0x0205, FORMULA: 0x0006, STRING: 0x0207, RSTRING: 0x00d6, DIMENSIONS: 0x0200,
} as const;
const OLD_BOF = new Set([0x0009, 0x0209, 0x0409]); // BIFF2/3/4

const ERRORS: Record<number, string> = { 0x00: "#NULL!", 0x07: "#DIV/0!", 0x0f: "#VALUE!", 0x17: "#REF!", 0x1d: "#NAME?", 0x24: "#NUM!", 0x2a: "#N/A", 0x2b: "#GETTING_DATA" };
const MAX_COLS = 512;

class XlsError extends Error {}
const corrupt = (what: string) => new XlsError(`corrupt or truncated .xls: ${what}`);

// ───────────── number formats (same rules as the .xlsx converter in office.ts) ─────────────

type Kind = "date" | "time" | "datetime" | "percent" | null;
const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58]);
const BUILTIN_TIME = new Set([18, 19, 20, 21, 22, 32, 33, 45, 46, 47, 55, 56]);

function classifyFormat(id: number, code?: string): Kind {
  if (code === undefined) {
    if (id === 22) return "datetime";
    if (BUILTIN_DATE.has(id)) return "date";
    if (BUILTIN_TIME.has(id)) return "time";
    if (id === 9 || id === 10) return "percent";
    return null;
  }
  // drop quoted text, escapes, padding/fill (_x *x) and [colour]/[$-locale] brackets (but keep elapsed [h] [m] [s])
  const c = code.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/[_*]./g, "").replace(/\[(?!h\]|m\]|s\])[^\]]*\]/gi, "").split(";")[0].toLowerCase();
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
const fmtNum = (x: number) => (Number.isFinite(x) ? String(parseFloat(x.toPrecision(15))) : String(x));

function finishGrid(rows: string[][]): string[][] {
  while (rows.length && rows[rows.length - 1].every((v) => !v)) rows.pop();
  let maxC = 0, minC = Infinity;
  for (const r of rows) r.forEach((v, k) => { if (v) { maxC = Math.max(maxC, k + 1); minC = Math.min(minC, k); } });
  if (!Number.isFinite(minC)) return [];
  return rows.map((r) => Array.from({ length: maxC - minC }, (_, k) => r[minC + k] ?? ""));
}

// ───────────── record stream ─────────────

interface Rec { type: number; data: Buffer; pos: number }

/** Records of one substream: from the BOF at `start` to its matching EOF (nested BOF…EOF, e.g. embedded charts, included). */
function substream(stream: Buffer, start: number): { recs: Rec[]; truncated: boolean } {
  const recs: Rec[] = [];
  let pos = start, depth = 0;
  while (pos + 4 <= stream.length) {
    const type = stream.readUInt16LE(pos), size = stream.readUInt16LE(pos + 2);
    if (pos + 4 + size > stream.length) return { recs, truncated: true };
    recs.push({ type, data: stream.subarray(pos + 4, pos + 4 + size), pos });
    pos += 4 + size;
    if (type === R.BOF || OLD_BOF.has(type)) depth++;
    else if (type === R.EOF && --depth <= 0) return { recs, truncated: false };
    if (depth <= 0) return { recs, truncated: true }; // first record was not a BOF
  }
  return { recs, truncated: true };
}

/** Data of record i plus the CONTINUE records that immediately follow it. */
function withContinues(recs: Rec[], i: number): Buffer[] {
  const parts = [recs[i].data];
  for (let j = i + 1; j < recs.length && recs[j].type === R.CONTINUE; j++) parts.push(recs[j].data);
  return parts;
}

// ───────────── strings ─────────────

type Decode8 = (b: Buffer) => string;
const latin1: Decode8 = (b) => b.toString("latin1");
const CP_LABEL: Record<number, string> = { 874: "windows-874", 932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5", 1200: "utf-16le", 10000: "macintosh", 65001: "utf-8", 32768: "macintosh", 32769: "windows-1252" };
function decoderFor(cp: number, warnings: string[]): Decode8 {
  if (cp === 367 || cp === 0) return latin1;
  const label = CP_LABEL[cp] ?? (cp >= 1250 && cp <= 1258 ? `windows-${cp}` : undefined);
  if (!label) { warnings.push(`unknown code page ${cp}; 8-bit text decoded as Windows-1252`); return decoderFor(1252, []); }
  try {
    const td = new TextDecoder(label);
    return (b) => td.decode(b);
  } catch {
    warnings.push(`code page ${cp} is not supported by this Node build; 8-bit text decoded as Latin-1`);
    return latin1;
  }
}

/**
 * Cursor over a record's data and its CONTINUE records. Plain bytes flow across record boundaries; character data
 * that crosses into a CONTINUE record restarts with a new fHighByte flag byte ([MS-XLS] §2.5.293 XLUnicodeRichExtendedString).
 */
class Cursor {
  private i = 0;
  private p: number;
  constructor(private parts: Buffer[], offset = 0) { this.p = offset; }
  get done() { for (let k = this.i, q = this.p; k < this.parts.length; k++, q = 0) if (q < this.parts[k].length) return false; return true; }
  bytes(n: number): Buffer {
    const out: Buffer[] = [];
    while (n > 0) {
      if (this.i >= this.parts.length) throw corrupt("string data runs past the end of its record");
      const cur = this.parts[this.i];
      if (this.p >= cur.length) { this.i++; this.p = 0; continue; }
      const k = Math.min(n, cur.length - this.p);
      out.push(cur.subarray(this.p, this.p + k));
      this.p += k; n -= k;
    }
    return out.length === 1 ? out[0] : Buffer.concat(out);
  }
  u8() { return this.bytes(1)[0]; }
  u16() { return this.bytes(2).readUInt16LE(0); }
  u32() { return this.bytes(4).readUInt32LE(0); }
  skip(n: number) {
    while (n > 0) {
      if (this.i >= this.parts.length) throw corrupt("string data runs past the end of its record");
      const k = Math.min(n, this.parts[this.i].length - this.p);
      if (k <= 0) { this.i++; this.p = 0; continue; }
      this.p += k; n -= k;
    }
  }
  /** `cch` characters, 1 or 2 bytes each per the current fHighByte; re-reads the flag at each CONTINUE boundary. */
  chars(cch: number, high: boolean): string {
    let out = "";
    while (cch > 0) {
      if (this.i >= this.parts.length) throw corrupt("string data runs past the end of its record");
      const cur = this.parts[this.i];
      if (this.p >= cur.length) {
        if (++this.i >= this.parts.length) throw corrupt("string data runs past the end of its record");
        this.p = 0;
        high = (this.parts[this.i][0] & 1) === 1;
        this.p = 1;
        continue;
      }
      const per = high ? 2 : 1;
      const n = Math.min(cch, Math.floor((cur.length - this.p) / per));
      if (n === 0) { this.p = cur.length; continue; } // stray odd byte before a boundary
      const b = cur.subarray(this.p, this.p + n * per);
      out += high ? b.toString("utf16le") : b.toString("latin1");
      this.p += n * per; cch -= n;
    }
    return out;
  }
  /** 8-bit string (BIFF5) of `n` bytes; no flag bytes at CONTINUE boundaries. */
  text8(n: number, dec: Decode8) { return dec(this.bytes(n)); }
}

/** BIFF8 XLUnicodeString / XLUnicodeRichExtendedString body after the cch field. */
function unicodeBody(c: Cursor, cch: number): string {
  const flags = c.u8();
  const runs = flags & 0x08 ? c.u16() : 0;
  const ext = flags & 0x04 ? c.u32() : 0;
  const s = c.chars(cch, (flags & 1) === 1);
  if (runs) c.skip(runs * 4);
  if (ext) c.skip(ext);
  return s;
}

// ───────────── main ─────────────

export function xlsToMarkdown(buf: Buffer, opts: XlsOptions = {}): { markdown: string; warnings: string[] } {
  const warnings: string[] = [];
  try {
    return { markdown: convert(buf, opts, warnings), warnings };
  } catch (e) {
    if (e instanceof XlsError) throw e;
    if (e instanceof RangeError) throw corrupt("record data is damaged"); // a bounds slip in a corrupt record
    throw e;
  }
}

function workbookStream(buf: Buffer): Buffer {
  if (!isCfb(buf)) {
    if (buf.length >= 4 && buf.readUInt16LE(0) === R.BOF) return buf; // bare BIFF5/8 stream
    if (buf.length >= 2 && OLD_BOF.has(buf.readUInt16LE(0))) throw new XlsError("BIFF2–BIFF4 (Excel 2.x–4.0) workbooks are not supported");
    if (buf.subarray(0, 2).toString("latin1") === "PK") throw new XlsError("this file is an OOXML (.xlsx) workbook, not a legacy .xls");
    if (buf.length < 512 && buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) throw corrupt("compound file header is incomplete");
    throw new XlsError("not an Excel .xls file (no Compound File header)");
  }
  const cfbErr = (e: unknown) => corrupt(e instanceof RangeError ? "compound file structure is damaged" : (e as Error).message);
  let cfb: Cfb;
  try { cfb = new Cfb(buf); } catch (e) { throw cfbErr(e); }
  if (cfb.has("EncryptionInfo") || cfb.has("EncryptedPackage")) throw new XlsError("password-protected (encrypted) workbook is not supported");
  const name = cfb.has("Workbook") ? "Workbook" : cfb.has("Book") ? "Book" : null;
  if (!name) throw new XlsError("no Workbook stream — not an Excel .xls file");
  let s: Buffer;
  try { s = cfb.read(name); } catch (e) { throw cfbErr(e); }
  const declared = cfb.entries.find((e) => e.type === "stream" && e.path.toLowerCase() === name.toLowerCase())?.size ?? s.length;
  if (s.length < declared) throw corrupt(`${name} stream is ${s.length} of ${declared} bytes`);
  return s;
}

interface SheetInfo { name: string; pos: number; state: number; dt: number }

function convert(buf: Buffer, opts: XlsOptions, warnings: string[]): string {
  const stream = workbookStream(buf);
  const g = substream(stream, 0);
  if (!g.recs.length || g.recs[0].type !== R.BOF) {
    if (g.recs.length && OLD_BOF.has(g.recs[0].type)) throw new XlsError("BIFF2–BIFF4 (Excel 2.x–4.0) workbooks are not supported");
    throw corrupt("workbook stream does not start with a BOF record");
  }
  if (g.recs[0].data.length < 4) throw corrupt("short BOF record");
  const vers = g.recs[0].data.readUInt16LE(0);
  const biff8 = vers === 0x0600;
  if (!biff8 && vers !== 0x0500) throw new XlsError(`unsupported BIFF version 0x${vers.toString(16)}`);
  if (g.recs.some((r) => r.type === R.FILEPASS)) throw new XlsError("password-protected .xls is not supported");
  if (g.truncated) throw corrupt("workbook globals end unexpectedly");

  let date1904 = false;
  let dec8: Decode8 = decoderFor(1252, []);
  const formats = new Map<number, string>();
  const xfFmt: number[] = [];
  const sheets: SheetInfo[] = [];
  let sst: string[] = [];

  // CODEPAGE first: BIFF5 8-bit strings anywhere in the globals depend on it
  for (const r of g.recs) if (r.type === R.CODEPAGE && r.data.length >= 2) { const cp = r.data.readUInt16LE(0); if (!biff8 && cp !== 1200) dec8 = decoderFor(cp, warnings); }
  // short string: BIFF8 ShortXLUnicodeString (cch u8) / XLUnicodeString (cch u16) — BIFF5 8-bit with the same cch width
  const str = (c: Cursor, wide: boolean) => { const cch = wide ? c.u16() : c.u8(); return biff8 ? unicodeBody(c, cch) : c.text8(cch, dec8); };

  g.recs.forEach((r, i) => {
    const d = r.data;
    switch (r.type) {
      case R.DATEMODE: if (d.length >= 2) date1904 = d.readUInt16LE(0) === 1; break;
      case R.XF: if (d.length >= 4) xfFmt.push(d.readUInt16LE(2)); break;
      case R.FORMAT: {
        if (d.length < 3) break;
        try { const c = new Cursor([d], 2); formats.set(d.readUInt16LE(0), str(c, biff8)); }
        catch { warnings.push("unreadable FORMAT record skipped"); }
        break;
      }
      case R.BOUNDSHEET: {
        if (d.length < 7) { warnings.push("short BOUNDSHEET record skipped"); break; }
        let name: string;
        try { name = str(new Cursor([d], 6), false); } catch { name = `Sheet${sheets.length + 1}`; warnings.push(`unreadable name for sheet ${sheets.length + 1}`); }
        sheets.push({ name, pos: d.readUInt32LE(0), state: d[4] & 3, dt: d[5] });
        break;
      }
      case R.SST: if (biff8) sst = readSst(withContinues(g.recs, i), warnings); break;
    }
  });
  const xfKind: Kind[] = xfFmt.map((id) => classifyFormat(id, formats.get(id)));

  const maxRows = Math.max(1, opts.maxRows ?? 500);
  const want = opts.sheets?.length ? new Set(opts.sheets.map((s) => s.toLowerCase())) : null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sh of sheets) {
    if (want && !want.has(sh.name.toLowerCase())) continue;
    seen.add(sh.name.toLowerCase());
    const hidden = sh.state === 1 ? " (hidden)" : sh.state === 2 ? " (veryHidden)" : "";
    const head = `## ${sh.name}${hidden}`;
    if (sh.dt === 2) { out.push(`${head}\n\n_(chart sheet — no cell data)_`); continue; }
    if (sh.dt === 1) { out.push(`${head}\n\n_(Excel 4.0 macro sheet — not converted)_`); continue; }
    if (sh.dt === 6) { out.push(`${head}\n\n_(VBA module — not converted)_`); continue; }
    if (sh.pos + 4 > stream.length || stream.readUInt16LE(sh.pos) !== R.BOF) { warnings.push(`sheet "${sh.name}": substream not found at offset ${sh.pos}`); out.push(`${head}\n\n_(unreadable sheet)_`); continue; }
    const ss = substream(stream, sh.pos);
    if (!ss.recs.length) { warnings.push(`sheet "${sh.name}": substream at offset ${sh.pos} is truncated`); out.push(`${head}\n\n_(unreadable sheet)_`); continue; }
    const bofDt = ss.recs[0].data.length >= 4 ? ss.recs[0].data.readUInt16LE(2) : 0x10;
    if (bofDt === 0x20) { out.push(`${head}\n\n_(chart sheet — no cell data)_`); continue; }
    if (bofDt === 0x40) { out.push(`${head}\n\n_(Excel 4.0 macro sheet — not converted)_`); continue; }
    if (bofDt === 0x06) { out.push(`${head}\n\n_(VBA module — not converted)_`); continue; }
    if (ss.truncated) warnings.push(`sheet "${sh.name}": record stream ends unexpectedly; showing the cells read so far`);
    out.push(head + "\n\n" + renderSheet(sh.name, ss.recs, { biff8, sst, xfKind, date1904, dec8, maxRows }, warnings));
  }
  if (want) for (const w of opts.sheets!) if (!seen.has(w.toLowerCase())) warnings.push(`sheet "${w}" not found (available: ${sheets.map((s) => s.name).join(", ")})`);
  if (!sheets.length) warnings.push("workbook has no sheets");
  return out.join("\n\n");
}

function readSst(parts: Buffer[], warnings: string[]): string[] {
  const c = new Cursor(parts);
  const out: string[] = [];
  let unique: number;
  try { c.u32(); unique = c.u32(); } catch { warnings.push("shared string table is empty or corrupt"); return out; }
  try {
    while (out.length < unique && !c.done) out.push(unicodeBody(c, c.u16()));
  } catch { /* fall through to the count check */ }
  if (out.length < unique) warnings.push(`shared string table truncated: read ${out.length} of ${unique} strings`);
  return out;
}

interface Ctx { biff8: boolean; sst: string[]; xfKind: Kind[]; date1904: boolean; dec8: Decode8; maxRows: number }

function rkValue(rk: number): number {
  let v: number;
  if (rk & 2) v = (rk | 0) >> 2;
  else { const b = Buffer.alloc(8); b.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4); v = b.readDoubleLE(0); }
  return rk & 1 ? v / 100 : v;
}

function renderSheet(name: string, recs: Rec[], ctx: Ctx, warnings: string[]): string {
  const { maxRows } = ctx;
  const rows: string[][] = [];
  let lastNonEmpty = -1, colWarn = false, bad = 0;
  const set = (r: number, c: number, val: string) => {
    if (c >= MAX_COLS) { colWarn = true; return; }
    if (!val) return;
    if (r > lastNonEmpty) lastNonEmpty = r;
    if (r < maxRows) (rows[r] ??= [])[c] = val;
  };
  const num = (x: number, ixfe: number) => {
    const kind = ctx.xfKind[ixfe];
    if (kind && kind !== "percent" && Number.isFinite(x)) return serialToIso(x, kind, ctx.date1904);
    if (kind === "percent" && Number.isFinite(x)) return fmtNum(x * 100) + "%";
    return fmtNum(x);
  };
  const xlString = (parts: Buffer[], offset: number) => {
    const c = new Cursor(parts, offset);
    const cch = c.u16();
    return ctx.biff8 ? unicodeBody(c, cch) : c.text8(cch, ctx.dec8);
  };

  let pending: { r: number; c: number } | null = null;
  let depth = 0;
  for (let i = 0; i < recs.length; i++) {
    const { type, data: d } = recs[i];
    if (type === R.BOF) { depth++; continue; }
    if (type === R.EOF) { depth--; continue; }
    if (depth !== 1) continue; // embedded chart substreams
    try {
      switch (type) {
        case R.NUMBER: if (d.length >= 14) set(d.readUInt16LE(0), d.readUInt16LE(2), num(d.readDoubleLE(6), d.readUInt16LE(4))); else bad++; break;
        case R.RK: if (d.length >= 10) set(d.readUInt16LE(0), d.readUInt16LE(2), num(rkValue(d.readUInt32LE(6)), d.readUInt16LE(4))); else bad++; break;
        case R.MULRK: {
          if (d.length < 6) { bad++; break; }
          const r = d.readUInt16LE(0), c0 = d.readUInt16LE(2);
          const n = Math.floor((d.length - 6) / 6);
          for (let k = 0; k < n; k++) set(r, c0 + k, num(rkValue(d.readUInt32LE(4 + k * 6 + 2)), d.readUInt16LE(4 + k * 6)));
          break;
        }
        case R.LABELSST: {
          if (d.length < 10) { bad++; break; }
          const idx = d.readUInt32LE(6);
          if (idx >= ctx.sst.length) { bad++; break; }
          set(d.readUInt16LE(0), d.readUInt16LE(2), ctx.sst[idx]);
          break;
        }
        case R.LABEL: case R.RSTRING:
          if (d.length < 8) { bad++; break; }
          set(d.readUInt16LE(0), d.readUInt16LE(2), xlString(withContinues(recs, i), 6));
          break;
        case R.BOOLERR: {
          if (d.length < 8) { bad++; break; }
          const v = d[6];
          set(d.readUInt16LE(0), d.readUInt16LE(2), d[7] ? ERRORS[v] ?? "#ERR" : v ? "TRUE" : "FALSE");
          break;
        }
        case R.FORMULA: {
          if (d.length < 14) { bad++; break; }
          const r = d.readUInt16LE(0), c = d.readUInt16LE(2);
          pending = null;
          if (d.readUInt16LE(12) !== 0xffff) set(r, c, num(d.readDoubleLE(6), d.readUInt16LE(4)));
          else switch (d[6]) {
            case 0: pending = { r, c }; break; // string result follows in a STRING record
            case 1: set(r, c, d[8] ? "TRUE" : "FALSE"); break;
            case 2: set(r, c, ERRORS[d[8]] ?? "#ERR"); break;
            default: break; // 3 = empty string
          }
          break;
        }
        case R.STRING:
          if (pending) { set(pending.r, pending.c, xlString(withContinues(recs, i), 0)); pending = null; }
          break;
      }
    } catch (e) {
      if (!(e instanceof XlsError) && !(e instanceof RangeError)) throw e;
      bad++;
    }
  }
  if (bad) warnings.push(`sheet "${name}": ${bad} unreadable cell record(s) skipped`);
  if (colWarn) warnings.push(`sheet "${name}": columns beyond ${MAX_COLS} were dropped`);
  for (let k = 0; k < rows.length; k++) if (!rows[k]) rows[k] = [];
  const grid = finishGrid(rows);
  let section = grid.length ? mdTable(grid) : "_(empty sheet)_";
  if (lastNonEmpty >= maxRows) {
    section += `\n\n_(truncated: showing the first ${maxRows} of ${lastNonEmpty + 1} rows; raise max_rows to see more)_`;
    warnings.push(`sheet "${name}" truncated at ${maxRows} of ${lastNonEmpty + 1} rows`);
  }
  return section;
}

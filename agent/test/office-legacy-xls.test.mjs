import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dist } from "./helpers.mjs";

const { xlsToMarkdown } = await import(dist("tools/office-xls.js"));
const fx = (name) => readFileSync(new URL(`./fixtures/office/xls/${name}`, import.meta.url));
const conv = (name, opts) => xlsToMarkdown(fx(name), opts);
const sections = (md) => [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
/** the table rows (cells) of one sheet section */
function sheetRows(md, sheet) {
  const start = md.indexOf(`## ${sheet}\n`);
  assert.ok(start >= 0, `section ${sheet} missing`);
  const next = md.indexOf("\n## ", start + 1);
  const body = md.slice(start, next < 0 ? undefined : next);
  return body.split("\n").filter((l) => l.startsWith("| ") && !/^\| (--- \| )*---/.test(l)).map((l) => l.slice(2, -2).split(/ (?<!\\)\| /));
}

// ── synthetic BIFF streams (bare record streams, no compound file) ──
const rec = (type, data) => { const h = Buffer.alloc(4); h.writeUInt16LE(type, 0); h.writeUInt16LE(data.length, 2); return Buffer.concat([h, data]); };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const bof = (vers, dt) => rec(0x0809, Buffer.concat([u16(vers), u16(dt), Buffer.alloc(vers === 0x0600 ? 12 : 4)]));
const EOF = rec(0x000a, Buffer.alloc(0));
/** globals records + sheets [{name, cells: Buffer[] (records)}] → stream with correct BOUNDSHEET offsets */
function biff({ vers = 0x0600, globals = [], sheets }) {
  const name = (s) => (vers === 0x0600 ? Buffer.concat([Buffer.from([s.length, 0]), Buffer.from(s, "latin1")]) : Buffer.concat([Buffer.from([s.length]), Buffer.from(s, "latin1")]));
  const bsLen = sheets.map((s) => rec(0x0085, Buffer.concat([u32(0), Buffer.from([0, 0]), name(s.name)])).length);
  const head = bof(vers, 5).length + globals.reduce((a, g) => a + g.length, 0) + bsLen.reduce((a, b) => a + b, 0) + EOF.length;
  const bodies = sheets.map((s) => Buffer.concat([bof(vers, 0x10), ...s.cells, EOF]));
  let pos = head;
  const bss = sheets.map((s, i) => { const b = rec(0x0085, Buffer.concat([u32(pos), Buffer.from([s.state ?? 0, 0]), name(s.name)])); pos += bodies[i].length; return b; });
  return Buffer.concat([bof(vers, 5), ...globals, ...bss, EOF, ...bodies]);
}
const labelSst = (r, c, i) => rec(0x00fd, Buffer.concat([u16(r), u16(c), u16(15), u32(i)]));

test("xls: sheet order, names, hidden label (xlwt BIFF8)", () => {
  const { markdown, warnings } = conv("xlwt-basic.xls");
  assert.deepEqual(sections(markdown), ["Data", "Long", "Secret (hidden)", "Big", "Offset", "Empty"]);
  assert.match(markdown, /## Empty\n\n_\(empty sheet\)_/);
  assert.deepEqual(warnings, ['sheet "Long" truncated at 500 of 604 rows', 'sheet "Big" truncated at 500 of 1200 rows']);
});

test("xls: strings (unicode, pipe escaping), RK ints/decimals, numbers, booleans, dates, percent", () => {
  const rows = sheetRows(conv("xlwt-basic.xls").markdown, "Data");
  assert.deepEqual(rows[0], ["Name", "Qty", "Price", "Active", "When", "Share", "Total"]);
  assert.deepEqual(rows[1], ["Zoë", "1", "3.25", "TRUE", "2024-02-29", "25%", "3.25"]);
  assert.deepEqual(rows[2], ["日本語テキスト", "42", "0.3", "FALSE", "1999-12-31", "12.5%", "12.6"]); // 0.1+0.2 cleaned
  assert.deepEqual(rows[3], ["Ünïcödé € \\| pipe", "-7", "1234567.891", "TRUE", "1900-03-01", "100%", "-8641975.237"]);
  assert.deepEqual(rows[4], ["big int", "1000000", "1e-7", "FALSE", "2000-01-01", "0%", "0.1"]);
  assert.equal(rows[6][4], "2023-07-14 13:45:30"); // datetime format
  assert.equal(rows[7][4], "08:30:00"); // time-only format
  assert.equal(rows[8][4], "2.5"); // '0.0" days"' — letters inside quotes are not date tokens
  assert.deepEqual(rows[9].slice(0, 3), ["large", "123456789012", "1099511627776"]);
});

test("xls: formula cached results — number, string (STRING record), boolean, error", () => {
  const rows = sheetRows(conv("xlwt-basic.xls").markdown, "Data");
  assert.deepEqual(rows[10].slice(0, 6), ["formulas", "abcd", "TRUE", "#DIV/0!", "Grüße Ω", "FALSE"]);
  assert.equal(rows[11][1], "#N/A");
  // genuine Excel files from Apache POI
  assert.match(conv("SimpleWithFormula.xls").markdown, /\| replacemereplaceme \|/);
  assert.match(conv("StringFormulas.xls").markdown, /\| XYZ \|/);
});

test("xls: SST strings spanning CONTINUE records stay intact", () => {
  const md = conv("xlwt-basic.xls", { sheets: ["Long"], maxRows: 1000 }).markdown;
  const rows = sheetRows(md, "Long");
  const ascii = Array.from({ length: 1300 }, (_, i) => `[${String(i).padStart(5, "0")}]`).join("");
  assert.equal(rows[1][1], ascii); // 9100 chars, crosses 8224-byte record limit
  assert.equal(rows[2][1], "αβγδεζηθικλμνξοπρστυφχψω".repeat(400)); // 16-bit chars across CONTINUE
  assert.equal(rows[3][1], "value number 0000 ünï-0");
  assert.equal(rows[602][1], "plain value number 0599");
  assert.deepEqual(rows[603], ["end", "THE END"]); // last SST entry, well past several CONTINUEs
});

test("xls: SST continuation re-states fHighByte (compressed → UTF-16 switch mid-string)", () => {
  // string 0: "abc" + "ΔΕ" — first part compressed in SST, rest in CONTINUE with fHighByte=1
  // string 1: rich-text (cRun=1) + phonetic (cbExtRst=4) blocks are skipped; its header starts the CONTINUE
  const sst = rec(0x00fc, Buffer.concat([u32(2), u32(2), u16(5), Buffer.from([0]), Buffer.from("abc", "latin1")]));
  const cont = rec(0x003c, Buffer.concat([Buffer.from([1]), Buffer.from("ΔΕ", "utf16le"),
    u16(2), Buffer.from([0x0c]), u16(1), u32(4), Buffer.from("hi"), Buffer.alloc(4), Buffer.alloc(4, 0xee)]));
  const { markdown, warnings } = xlsToMarkdown(biff({ globals: [sst, cont], sheets: [{ name: "S", cells: [labelSst(0, 0, 0), labelSst(1, 0, 1)] }] }));
  assert.deepEqual(warnings, []);
  assert.deepEqual(sheetRows(markdown, "S"), [["abcΔΕ"], ["hi"]]);
});

test("xls: trims empty leading columns, keeps leading rows like .xlsx", () => {
  const rows = sheetRows(conv("xlwt-basic.xls", { sheets: ["offset"] }).markdown, "Offset");
  assert.deepEqual(rows, [["", ""], ["", ""], ["C3", "D3"], ["", ""], ["", "5.5"]]);
});

test("xls: 1904 date system", () => {
  assert.deepEqual(sheetRows(conv("xlwt-1904.xls").markdown, "Dates1904"), [["Label", "Date"], ["a", "2024-02-29"], ["b", "1904-01-02"], ["raw", "100"]]);
  // POI: same date stored in a 1900 and a 1904 workbook
  assert.match(conv("1904DateWindowing.xls").markdown, /\| 2000-01-01 \| 2000-01-01 \|/);
});

test("xls: built-in and custom date formats from Excel", () => {
  const rows = sheetRows(conv("DateFormats.xls").markdown, "Sheet1");
  assert.ok(rows.length >= 5);
  for (const r of rows) assert.equal(r[1], "2007-08-10");
});

test("xls: sheets filter and unknown sheet warning", () => {
  const { markdown, warnings } = conv("xlwt-basic.xls", { sheets: ["secret", "Nope"] });
  assert.deepEqual(sections(markdown), ["Secret (hidden)"]);
  assert.deepEqual(warnings, ['sheet "Nope" not found (available: Data, Long, Secret, Big, Offset, Empty)']);
});

test("xls: maxRows truncation stated in output and warnings", () => {
  const { markdown, warnings } = conv("xlwt-basic.xls", { sheets: ["Big"], maxRows: 10 });
  const rows = sheetRows(markdown, "Big");
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[9], ["9", "81"]);
  assert.match(markdown, /_\(truncated: showing the first 10 of 1200 rows; raise max_rows to see more\)_/);
  assert.deepEqual(warnings, ['sheet "Big" truncated at 10 of 1200 rows']);
  const def = conv("xlwt-basic.xls", { sheets: ["Big"] });
  assert.equal(sheetRows(def.markdown, "Big").length, 500);
  assert.deepEqual(def.warnings, ['sheet "Big" truncated at 500 of 1200 rows']);
});

test("xls: hidden sheet from Excel (POI)", () => {
  assert.deepEqual(sections(conv("TwoSheetsOneHidden.xls").markdown), ["Sheet1 (hidden)", "Sheet2"]);
});

test("xls: BIFF5 / Excel 95 workbook", () => {
  const { markdown } = conv("testEXCEL_95.xls");
  assert.equal(sections(markdown)[0], "Feuil1");
  const rows = sheetRows(markdown, "Feuil1");
  assert.equal(rows[0][0], "Sample Excel Worksheet - Numbers and their Squares");
  assert.deepEqual(rows[3].slice(1, 5), ["Number", "Square", "", "Formatted"]);
  assert.deepEqual(rows[5].slice(1, 5), ["1", "1", "", "100%"]);
  assert.deepEqual(rows[9].slice(1, 5), ["5", "25", "", "1125"]);
});

test("xls: BIFF5 synthetic stream with code page", () => {
  const label = (r, c, bytes) => rec(0x0204, Buffer.concat([u16(r), u16(c), u16(15), u16(bytes.length), bytes]));
  const rk = rec(0x027e, Buffer.concat([u16(1), u16(0), u16(15), u32((1234 << 2) | 2 | 1)]));
  const stream = biff({ vers: 0x0500, globals: [rec(0x0042, u16(1251))], sheets: [{ name: "L", cells: [label(0, 0, Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2])), rk] }] });
  const { markdown } = xlsToMarkdown(stream);
  assert.deepEqual(sheetRows(markdown, "L"), [["Привет"], ["12.34"]]); // cp1251 text; RK int with fX100
});

test("xls: workbook stream named BOOK (case-insensitive lookup)", () => {
  const md = conv("BOOK_in_capitals.xls").markdown;
  assert.deepEqual(sections(md), ["301. exposures by cpty and agreement_301_NTTX_EXCEL.rpt"]);
  assert.match(md, /\| Report Date: \| 2013-01-16 \|/);
});

test("xls: chart sheets noted without a table; embedded chart substreams skipped", () => {
  const a = conv("44010-SingleChart.xls").markdown;
  assert.deepEqual(sections(a), ["auto_1", "Graph2"]);
  assert.match(a, /## Graph2\n\n_\(chart sheet — no cell data\)_/);
  assert.match(a, /\| FSH-PWS1\.72 \| C18 \| 4 \| 46\.4 \| 0\.7 \|  \| 0\.769106 \| ECART \| 1 \| 0 \|/);
  assert.match(a, /\| Mesuré \|  \| Prédit RAD \|/);
  const rows = sheetRows(conv("SimpleChart.xls").markdown, "Sheet1"); // worksheet with an embedded chart (nested BOF/EOF)
  assert.deepEqual(rows[1], ["2000-01-02", "4"]);
  const synth = xlsToMarkdown(Buffer.concat([bof(0x0600, 5), rec(0x0085, Buffer.concat([u32(0), Buffer.from([0, 2, 1, 0]), Buffer.from("C")])), EOF]));
  assert.match(synth.markdown, /## C\n\n_\(chart sheet — no cell data\)_/);
});

test("xls: password-protected files → clear error", () => {
  assert.throws(() => conv("xor-encryption-abc.xls"), /password-protected \.xls is not supported/);
  assert.throws(() => conv("password.xls"), /password-protected/);
});

test("xls: truncated or corrupt input → error, never a crash or hang", () => {
  const full = fx("xlwt-basic.xls");
  for (const n of [0, 10, 511, 600, 4096, full.length >> 1, full.length - 700]) {
    assert.throws(() => xlsToMarkdown(full.subarray(0, n)), (e) => e instanceof Error && /corrupt or truncated|not an Excel|Compound File/.test(e.message), `length ${n}`);
  }
  assert.throws(() => xlsToMarkdown(Buffer.from("PK\x03\x04 not really")), /OOXML/);
  assert.throws(() => xlsToMarkdown(Buffer.from("hello world, definitely not a spreadsheet")), /not an Excel/);
  // truncated bare stream: globals cut mid-record
  const s = biff({ sheets: [{ name: "S", cells: [] }] });
  assert.throws(() => xlsToMarkdown(s.subarray(0, 30)), /corrupt or truncated/);
  // random byte flips in a real file: must return or throw an Error, quickly
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const small = fx("SimpleWithFormula.xls");
  for (let k = 0; k < 300; k++) {
    const b = Buffer.from(small);
    for (let j = 0; j < 8; j++) b[512 + Math.floor(rnd() * (b.length - 512))] = Math.floor(rnd() * 256);
    try { const r = xlsToMarkdown(b); assert.equal(typeof r.markdown, "string"); } catch (e) { assert.ok(e instanceof Error); }
  }
  // the POI fuzzer case
  try { xlsToMarkdown(fx("poi-clusterfuzz-4819588401201152.xls")); } catch (e) { assert.ok(e instanceof Error); }
});

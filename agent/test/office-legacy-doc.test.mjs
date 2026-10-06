// Native legacy Word (.doc, Word 97-2003 binary) and RTF readers → Markdown. No LibreOffice / textutil involved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dist } from "./helpers.mjs";

const { docToMarkdown } = await import(dist("tools/office-doc.js"));
const { rtfToMarkdown } = await import(dist("tools/office-rtf.js"));
const fx = (name) => readFileSync(new URL(`./fixtures/office/doc/${name}`, import.meta.url));
const has = (md, s) => assert.ok(md.includes(s), `expected ${JSON.stringify(s)} in:\n${md}`);
const lacks = (md, s) => assert.ok(!md.includes(s), `did not expect ${JSON.stringify(s)} in:\n${md}`);
const BS = "\\"; // build RTF control words without "\u…" escapes in this source file
const U = BS + "u";

// ───────────────────────────── .doc ─────────────────────────────

test("doc: textutil-written Word 97 file — headings, bold/italic, lists, table, cp1252/unicode text", () => {
  const { markdown: md, warnings } = docToMarkdown(fx("textutil-sample.doc"));
  assert.deepEqual(warnings, []);
  assert.ok(md.startsWith("# Quarterly Report\n\n"), md);
  has(md, "This is the **first** paragraph with _italic words_ and a café ünïcode € sign.");
  has(md, "\n## Highlights\n");
  has(md, "- Revenue grew\n- Costs fell\n  - Nested point\n1. Step one\n1. Step two");
  has(md, "| **Region** | **Sales** |\n| --- | --- |\n| North | 100 |\n| South | 250 |");
  has(md, "Visit Example Site for more.");
  assert.ok(md.endsWith("Closing paragraph."), md);
});

test("doc: Word 97 table (Apache POI simple-table.doc) → Markdown table between paragraphs", () => {
  const { markdown: md } = docToMarkdown(fx("poi-simple-table.doc"));
  has(md, "It contains a paragraph, a table consisting of 2 rows and 3 columns and a final paragraph.\n\n| Cell 1,1 | Cell 1,2 | Cell 1,3 |\n| --- | --- | --- |\n| Cell 2,1 | Cell 2,2 | Cell 2,3 |\n\nThis text is below the table.");
  lacks(md, "\x07");
});

test("doc: HYPERLINK field → [text](url), instructions dropped", () => {
  const { markdown: md } = docToMarkdown(fx("poi-hyperlink.doc"));
  assert.equal(md, "Before text; [Hyperlink text](http://testuri.org/); after text");
});

test("doc: heading style + bullet vs numbered lists with nesting (POI Lists.doc)", () => {
  const { markdown: md } = docToMarkdown(fx("poi-Lists.doc"));
  assert.ok(md.startsWith("# Heading Level 1\n\nThis document has different lists in it for testing"), md);
  has(md, "- Unordered list 1\n- UL 2\n- UL 3");
  has(md, "1. Ordered list 1\n1. OL 2\n1. OL 3");
  has(md, "- ML 1:2\n  - ML 2:1\n  - ML 2:2\n  - ML 2:3\n    - ML 3:1\n      - ML 4:1\n        - ML 5:1");
  has(md, "1. OL 2\n   1. OL 2.1\n   1. OL 2.2\n      1. OL 2.2.1");
  has(md, "Indented three times\n\nThe end!");
});

test("doc: field instructions removed, results kept; footnotes and endnotes become [^n] notes", () => {
  const { markdown: md } = docToMarkdown(fx("poi-test-fields.doc"));
  for (const bad of ["CREATEDATE", "MERGEFORMAT", "AUTHOR", "FILESIZE", "\x13", "\x14", "\x15"]) lacks(md, bad);
  assert.ok(md.startsWith("19/11/2010 14:49:00\n\n"), md);
  has(md, "Here is a link to an endnote[^1]");
  has(md, "Here is a link to a footnote[^2]");
  has(md, "Some annotation linking here");
  has(md, "[^1]: Field in EndNote. File size: 0");
  has(md, "[^2]: Footnote with field: Fridrich Strba");
  // header/footer and comment text are not part of the main story
  lacks(md, "Document1");
  lacks(md, "Field in comment");
});

test("doc: footnote + endnote references (POI footnote.doc)", () => {
  const { markdown: md } = docToMarkdown(fx("poi-footnote.doc"));
  assert.equal(md, "Test text[^1][^2]\n\n[^1]: TestFootnote\n[^2]: TestEndnote");
});

test("doc: password-protected file → clear error", () => {
  assert.throws(() => docToMarkdown(fx("poi-PasswordProtected.doc")), /password-protected \.doc is not supported/);
});

test("doc: Word 6/95 file (wIdent 0xA5DC) → plain text with a warning", () => {
  const r = docToMarkdown(fx("poi-Word6.doc"));
  assert.equal(r.markdown, "The quick brown fox jumps over the lazy dog");
  assert.ok(r.warnings.some((w) => /Word 6\/95/.test(w)), r.warnings.join());
});

test("doc: nested table is flattened into the enclosing cell (POI innertable.doc)", () => {
  const { markdown: md } = docToMarkdown(fx("poi-innertable.doc"));
  assert.equal(md, "| A | B | C |\n| --- | --- | --- |\n| D | E<br>1 / 2<br>3 / 4<br>F | G |\n| H | I | J |");
});

test("doc: missing paragraph properties → plain paragraphs with a warning", () => {
  const b = Buffer.from(fx("poi-simple-table.doc"));
  let fib = -1;
  for (let k = 512; k < b.length; k += 512) if (b[k] === 0xec && b[k + 1] === 0xa5) { fib = k; break; }
  assert.ok(fib > 0, "FIB not found");
  const csw = b.readUInt16LE(fib + 0x20), lw = fib + 0x22 + csw * 2, cslw = b.readUInt16LE(lw);
  const rgFc = lw + 2 + cslw * 4 + 2;
  b.writeUInt32LE(0, rgFc + 13 * 8 + 4); // lcbPlcfBtePapx = 0
  const { markdown: md, warnings } = docToMarkdown(b);
  assert.ok(warnings.some((w) => /plain paragraphs/.test(w)), warnings.join());
  has(md, "This text is below the table.");
  has(md, "Cell 2,3");
});

test("doc: an RTF file named .doc is delegated to the RTF reader", () => {
  const r = docToMarkdown(fx("tika-testRTF.rtf"));
  assert.equal(r.markdown, "Test d’indexation Word");
  assert.ok(r.warnings.some((w) => /RTF despite/.test(w)));
});

test("doc: garbage, empty, truncated and corrupted input → Error, never a crash or hang", () => {
  assert.throws(() => docToMarkdown(Buffer.alloc(0)), /not a Word 97-2003 \.doc/);
  assert.throws(() => docToMarkdown(Buffer.from("hello, I am not a Word file".repeat(40))), /not a Word 97-2003 \.doc/);
  const doc = fx("poi-simple-table.doc");
  assert.throws(() => docToMarkdown(doc.subarray(0, 4096)), Error);
  // a non-Word compound file
  assert.throws(() => docToMarkdown(fx("poi-PasswordProtected.doc").subarray(0, 512)), Error);
  // seeded random corruption: either a result or a thrown Error
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const name of ["poi-simple-table.doc", "poi-test-fields.doc", "textutil-sample.doc", "poi-Lists.doc"]) {
    const src = fx(name);
    for (let k = 0; k < 60; k++) {
      const b = Buffer.from(src);
      const n = 1 + Math.floor(rnd() * 40);
      for (let j = 0; j < n; j++) b[512 + Math.floor(rnd() * (b.length - 512))] = Math.floor(rnd() * 256);
      try {
        const r = docToMarkdown(b);
        assert.equal(typeof r.markdown, "string");
      } catch (e) {
        assert.ok(e instanceof Error, String(e));
      }
    }
  }
});

// ───────────────────────────── .rtf ─────────────────────────────

test("rtf: TextEdit/Cocoa RTF — size-based headings, bold/italic, \\' hex, lists, hyperlink, table", () => {
  const { markdown: md, warnings } = rtfToMarkdown(fx("textutil-sample.rtf"));
  assert.deepEqual(warnings, []);
  assert.ok(md.startsWith("# Quarterly Report\n\n"), md);
  has(md, "This is the **first** paragraph with _italic words_ and a café ünïcode € sign.");
  has(md, "\n## Highlights\n");
  has(md, "- Revenue grew\n- Costs fell\n  - Nested point\n1. Step one\n1. Step two");
  has(md, "Visit [Example Site](https://example.com/page) for more.");
  has(md, "| **Region** | **Sales** |\n| --- | --- |\n| North | 100 |\n| South | 250 |");
  assert.ok(md.endsWith("Closing paragraph."), md);
  for (const leak of ["Times-Roman", "Times-Bold", "disc", "HYPERLINK", "cssrgb"]) lacks(md, leak);
});

test("rtf: Word-style document — styles, unicode, nested groups, skipped destinations, lists, fields, footnote, table, \\bin", () => {
  const { markdown: md, warnings } = rtfToMarkdown(fx("word-style.rtf"));
  assert.deepEqual(warnings, []);
  assert.ok(md.startsWith("# Project Overview\n\n"), md);
  has(md, "Plain text with **bold**, _italic_ and ***both***. Accents: café, naïve, quote “hi”, euro €.");
  has(md, "Unicode: 你好 and");
  has(md, "smile ☺ done.");
  lacks(md, "?");
  has(md, "Nested group deeper deepest text ends here.");
  has(md, "\n## Lists\n");
  has(md, "- Apple\n- Banana\n  - Cavendish\n1. First step\n1. Second step");
  has(md, "See [the docs](https://example.org/docs) and 7 page.");
  has(md, "Line one  \nline two tabbed");
  has(md, "{braces} back\\slash.");
  has(md, "Footnote here[^1].");
  has(md, "[^1]: The note text.");
  has(md, "| Name | Qty | Note |\n| --- | --- | --- |\n| Widget | 4 | a\\|b |\n| Gadget | 10 | **x**<br>y |");
  has(md, "After table  done."); // the 4 bytes after \\bin4 are binary data, skipped
  for (const leak of ["SecretFontName", "Times New Roman", "Hidden Title", "Hidden Author", "Running header", "Hand written", "SHOULD NOT APPEAR", "heading 1", "Default Paragraph Font", "HYPERLINK", "PAGE", "89504e47", "\x00"]) lacks(md, leak);
});

test("rtf: Word-written RTF (Apache Tika testRTF.rtf) — large stylesheet/font tables skipped, cp1252 quote", () => {
  const { markdown: md, warnings } = rtfToMarkdown(fx("tika-testRTF.rtf"));
  assert.deepEqual(warnings, []);
  assert.equal(md, "Test d’indexation Word");
});

test("rtf: field inside a footnote stays in the note", () => {
  const r = rtfToMarkdown(`{${BS}rtf1 Text{${BS}footnote ${BS}pard See {${BS}field{${BS}*${BS}fldinst HYPERLINK "http://x.y/"}{${BS}fldrslt link}}${BS}par more} after${BS}par}`);
  assert.equal(r.markdown, "Text[^1] after\n\n[^1]: See [link](http://x.y/) more");
});

test("rtf: Word-written RTF with many HYPERLINK fields (Apache Tika testRTFHyperlink.rtf)", () => {
  const { markdown: md, warnings } = rtfToMarkdown(fx("tika-testRTFHyperlink.rtf"));
  assert.deepEqual(warnings, []);
  assert.ok(md.startsWith("Thank you for using Microsoft® Office Outlook® 2003!"), md.slice(0, 200));
  has(md, "read answers to our most [frequently asked questions](http://r.office.microsoft.com/r/rlidwelcomeFAQ?clid=1033).");
  has(md, "[Junk E-mail Filter](http://r.office.microsoft.com/r/rlidOutlookWelcomeMail2?clid=1033) - The new Junk E-mail Filter");
  has(md, "type your questions into the **Type a question for help** search box");
  assert.ok((md.match(/\]\(http:\/\/r\.office\.microsoft\.com/g) ?? []).length >= 12);
  for (const leak of ["HYPERLINK", "Times New Roman", "fldinst"]) lacks(md, leak);
});

test("rtf: per-font \\fcharset code pages (Word 2010, Czech text in a cp1250 font — Apache Tika)", () => {
  const { markdown: md } = rtfToMarkdown(fx("tika-testRTFWord2010CzechCharacters.rtf"));
  assert.ok(md.startsWith("Článek týdne\n\nČást svitku s textem Knihy Izajáš"), md.slice(0, 120));
  has(md, "Předpokládá se, že původními vlastníky knihovny");
  lacks(md, "Èlánek");
});

test("rtf: string and Buffer input give the same result", () => {
  const buf = fx("word-style.rtf");
  assert.deepEqual(rtfToMarkdown(buf.toString("latin1")), rtfToMarkdown(buf));
});

test("rtf: \\uN with \\ucN skip counts, negative N, and \\'hh fallbacks", () => {
  const r = rtfToMarkdown(`{${BS}rtf1${BS}ansi{${BS}uc2 A${U}8364${BS}'80${BS}'80B} C${U}-10179?${U}-8704? D${U}233${BS}'e9E${BS}par}`);
  // \u-10179 \u-8704 is the surrogate pair for U+1F600; \uc2 skips both fallback bytes after the euro sign
  assert.equal(r.markdown, "A€B C" + String.fromCodePoint(0x1f600) + " DéE");
});

test("rtf: old-style \\pn lists, \\outlinelevel headings, \\sect/\\page, control symbols", () => {
  const src = [
    `{${BS}rtf1${BS}ansi`,
    `${BS}pard${BS}outlinelevel2 Third level${BS}par`,
    `{${BS}pntext 1.${BS}tab}${BS}pard{${BS}*${BS}pn${BS}pnlvlbody${BS}pndec{${BS}pntxta .}}Numbered${BS}par`,
    `{${BS}pntext ${BS}'b7${BS}tab}${BS}pard{${BS}*${BS}pn${BS}pnlvlblt{${BS}pntxtb ${BS}'b7}}Bulleted${BS}par`,
    `${BS}pard Before${BS}page${BS}sect After${BS}emdash end${BS}par}`,
  ].join("\n");
  const { markdown: md } = rtfToMarkdown(src);
  assert.equal(md, "### Third level\n\n1. Numbered\n- Bulleted\n\nBefore\n\nAfter—end");
});

test("rtf: non-RTF, truncated and hostile input → Error or warning, never a crash", () => {
  assert.throws(() => rtfToMarkdown("plain text"), /not an RTF document/);
  assert.throws(() => rtfToMarkdown(Buffer.alloc(0)), /not an RTF document/);
  const trunc = rtfToMarkdown(fx("word-style.rtf").subarray(0, 1500));
  assert.ok(trunc.warnings.some((w) => /unbalanced/.test(w)), trunc.warnings.join());
  assert.equal(typeof trunc.markdown, "string");
  assert.throws(() => rtfToMarkdown(`{${BS}rtf1 ` + "{".repeat(100000)), /nesting too deep/);
  const binEnd = rtfToMarkdown(`{${BS}rtf1 ok${BS}par{${BS}bin999999 xx}`);
  assert.equal(binEnd.markdown, "ok");
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const src = fx("word-style.rtf");
  for (let k = 0; k < 200; k++) {
    const b = Buffer.from(src);
    for (let j = 0; j < 10; j++) b[10 + Math.floor(rnd() * (b.length - 10))] = Math.floor(rnd() * 128);
    const r = rtfToMarkdown(b);
    assert.equal(typeof r.markdown, "string");
  }
});

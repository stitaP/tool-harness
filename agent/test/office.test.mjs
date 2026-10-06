import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { dist } from "./helpers.mjs";

const { officeToMarkdown, officeTool, parseXml, Zip } = await import(dist("tools/office.js"));

// ── tiny ZIP writer (stored or deflated), CRC32 via table ──
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files, deflate = false) {
  const locals = [], central = [];
  let off = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8"), nm = Buffer.from(name);
    const comp = deflate ? deflateRawSync(data) : data, method = deflate ? 8 : 0, crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, comp); central.push(ch, nm);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  const n = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(n, 8); end.writeUInt16LE(n, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

const dir = mkdtempSync(join(tmpdir(), "stitap-office-test-"));
const put = (name, buf) => { const p = join(dir, name); writeFileSync(p, buf); return p; };
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const rels = (list) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG}">${list.map(([id, type, target, ext]) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"${ext ? ' TargetMode="External"' : ""}/>`).join("")}</Relationships>`;
const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`;

function makeDocx() {
  const p = (inner, style, num) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${num ? `<w:numPr><w:ilvl w:val="${num[1]}"/><w:numId w:val="${num[0]}"/></w:numPr>` : ""}</w:pPr>${inner}</w:p>`;
  const r = (t, rPr = "") => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  const tc = (t) => `<w:tc><w:p>${r(t)}</w:p></w:tc>`;
  const body = [
    p(r("Quarterly Report"), "Title"),
    p(r("Overview"), "Heading1"),
    p(r("Plain ") + r("bold", "<w:b/>") + r(" and ") + r("italic", "<w:i/>") + r(" text &amp; more.") + `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`),
    p(r("Details"), "Berschrift2"),
    p(r("first bullet"), null, ["1", "0"]),
    p(r("nested bullet"), null, ["1", "1"]),
    p(r("step one"), null, ["2", "0"]),
    p(`<w:hyperlink r:id="rId9">${r("Example site")}</w:hyperlink>` + r(" line") + `<w:r><w:br/><w:t>two</w:t></w:r>`),
    `<w:tbl><w:tr>${tc("Name")}${tc("Qty")}</w:tr><w:tr>${tc("Apples")}${tc("3 | 4")}</w:tr></w:tbl>`,
    p(`<w:r><w:drawing><wp:inline><wp:docPr id="1" name="Pic" descr="Logo"/><a:graphic><a:graphicData><a:blip r:embed="rId10"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`),
    `<w:sectPr/>`,
  ].join("");
  return zip({
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    "_rels/.rels": rels([["rId1", "officeDocument", "word/document.xml"]]),
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
    "word/_rels/document.xml.rels": rels([["rId9", "hyperlink", "https://example.com/a b", true], ["rId10", "image", "media/image1.png"], ["rId2", "styles", "styles.xml"], ["rId3", "numbering", "numbering.xml"]]),
    "word/styles.xml": `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Berschrift2"><w:name w:val="heading 2"/></w:style></w:styles>`,
    "word/numbering.xml": `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
  }, true);
}

function makeXlsx() {
  const S = `xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"`;
  const many = Array.from({ length: 30 }, (_, k) => `<row r="${k + 2}"><c r="A${k + 2}"><v>${k + 1}</v></c></row>`).join("");
  return zip({
    "_rels/.rels": rels([["rId1", "officeDocument", "xl/workbook.xml"]]),
    "xl/workbook.xml": `<workbook ${S}><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/><sheet name="Big" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": rels([["rId1", "worksheet", "worksheets/sheet1.xml"], ["rId2", "worksheet", "/xl/worksheets/sheet2.xml"], ["rId3", "sharedStrings", "sharedStrings.xml"], ["rId4", "styles", "styles.xml"]]),
    "xl/sharedStrings.xml": `<sst ${S} count="4" uniqueCount="4"><si><t>Item</t></si><si><t>Price</t></si><si><r><t>Wid</t></r><r><t>get</t></r></si><si><t>When</t></si></sst>`,
    "xl/styles.xml": `<styleSheet ${S}><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<worksheet ${S}><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>3</v></c><c r="D1" t="inlineStr"><is><t>Ok</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>0.30000000000000004</v></c><c r="C2" s="1"><v>45292</v></c><c r="D2" t="b"><v>1</v></c></row>
      <row r="3"><c r="A3" t="str"><f>A1</f><v>Item</v></c><c r="B3"><v>12</v></c><c r="C3" s="2"><v>45293</v></c></row>
      <row r="7"/></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet ${S}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>N</t></is></c></row>${many}</sheetData></worksheet>`,
  });
}

function makePptx() {
  const P = `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R}"`;
  const sp = (ph, paras) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph ${ph}/>` : ""}</p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/>${paras.map(([t, lvl]) => `<a:p>${lvl ? `<a:pPr lvl="${lvl}"/>` : ""}<a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>`;
  const slide = (inner) => `<p:sld ${P}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${inner}</p:spTree></p:cSld></p:sld>`;
  return zip({
    "_rels/.rels": rels([["rId1", "officeDocument", "ppt/presentation.xml"]]),
    "ppt/presentation.xml": `<p:presentation ${P}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": rels([["rId2", "slide", "slides/slide1.xml"], ["rId3", "slide", "slides/slide2.xml"]]),
    // slide2.xml is shown FIRST (sldIdLst order)
    "ppt/slides/slide2.xml": slide(sp('type="ctrTitle"', [["Welcome Deck"]]) + sp('type="subTitle" idx="1"', [["by the team"]])),
    "ppt/slides/slide1.xml": slide(sp('type="title"', [["Agenda"]]) + sp('idx="1"', [["Intro", 0], ["Details", 1], ["Wrap-up", 0]]) + sp('type="sldNum"', [["2"]]) +
      `<p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>K</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>V</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>a</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>1</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`),
    "ppt/slides/_rels/slide1.xml.rels": rels([["rId1", "notesSlide", "../notesSlides/notesSlide1.xml"]]),
    "ppt/notesSlides/notesSlide1.xml": `<p:notes ${P}><p:cSld><p:spTree>${sp('type="sldImg"', [])}${sp('type="body" idx="1"', [["Remember the demo"], ["and questions"]])}</p:spTree></p:cSld></p:notes>`,
  }, true);
}

function makeOdt() {
  const ns = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink"`;
  return zip({
    mimetype: "application/vnd.oasis.opendocument.text",
    "content.xml": `<?xml version="1.0"?><office:document-content ${ns}><office:automatic-styles><style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles><office:body><office:text>
      <text:h text:outline-level="1">Odt Title</text:h>
      <text:p>Hello <text:span text:style-name="T1">strong</text:span>   world<text:s text:c="2"/>end <text:a xlink:href="https://odf.example/">link</text:a></text:p>
      <text:list><text:list-item><text:p>one</text:p></text:list-item><text:list-item><text:p>two</text:p><text:list><text:list-item><text:p>two-a</text:p></text:list-item></text:list></text:list-item></text:list>
      <table:table table:name="T"><table:table-row><table:table-cell><text:p>h1</text:p></table:table-cell><table:table-cell><text:p>h2</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell table:number-columns-repeated="2"><text:p>x</text:p></table:table-cell></table:table-row><table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="1024"/></table:table-row></table:table>
    </office:text></office:body></office:document-content>`,
  });
}

const fakeCtx = (blocked = []) => ({ cwd: dir, rt: { cfg: { data: { security: { blocked_paths: blocked } } } }, session: { id: "s" }, requestApproval: async () => true, progress() {} });

test("office: xml parser handles entities, CDATA, comments, namespaces", () => {
  const doc = parseXml(`<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e "boom">]><!-- c --><x:root xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main" a="1&amp;2"><x:t>&lt;&#65;&#x42;&quot;&apos;&gt;</x:t><![CDATA[<raw>&amp;]]></x:root>`);
  const root = doc.children.find((c) => typeof c !== "string");
  assert.equal(root.name, "w:root");
  assert.equal(root.attrs.a, "1&2");
  assert.equal(root.children[0].children[0], `<AB"'>`);
  assert.equal(root.children[1], "<raw>&amp;");
});

test("office: zip reader rejects traversal entries and reads deflated parts", () => {
  const z = new Zip(zip({ "../evil.txt": "x", "ok/a.txt": "hello" }, true));
  assert.equal(z.text("ok/a.txt"), "hello");
  assert.equal(z.text("../evil.txt"), null);
  assert.ok(!z.names().some((n) => n.includes("..")));
});

test("office: docx headings, bold/italic, lists, table, hyperlink, image", async () => {
  const r = await officeToMarkdown(put("report.docx", makeDocx()));
  const md = r.markdown;
  assert.equal(r.format, "docx");
  assert.match(md, /^# Quarterly Report$/m);
  assert.match(md, /^# Overview$/m);
  assert.match(md, /^## Details$/m, "heading detected via style name even when id is localized");
  assert.match(md, /Plain \*\*bold\*\* and _italic_ text & more\./);
  assert.doesNotMatch(md, /PAGE/, "field codes ignored");
  assert.match(md, /^- first bullet\n  - nested bullet\n1\. step one$/m);
  assert.match(md, /\[Example site\]\(https:\/\/example\.com\/a%20b\) line {2}\ntwo/);
  assert.match(md, /\| Name \| Qty \|\n\| --- \| --- \|\n\| Apples \| 3 \\\| 4 \|/);
  assert.match(md, /!\[Logo\]\(media\/image1\.png\)/);
});

test("office: xlsx shared strings, numbers, dates, booleans, sheets filter, max_rows", async () => {
  const f = put("book.xlsx", makeXlsx());
  const r = await officeToMarkdown(f);
  assert.match(r.markdown, /^## Sales$/m);
  assert.match(r.markdown, /^## Big$/m);
  assert.match(r.markdown, /\| Item \| Price \| When \| Ok \|\n\| --- \| --- \| --- \| --- \|\n\| Widget \| 0\.3 \| 2024-01-01 \| TRUE \|\n\| Item \| 12 \| 2024-01-02 \| {2}\|/);
  assert.doesNotMatch(r.markdown, /\| {2}\| {2}\| {2}\| {2}\|/, "trailing empty row trimmed");
  const only = await officeToMarkdown(f, { sheets: ["big"], maxRows: 10 });
  assert.doesNotMatch(only.markdown, /Sales/);
  assert.match(only.markdown, /truncated: showing the first 10 of 31 rows/);
  assert.match(only.markdown, /\| 9 \|/);
  assert.doesNotMatch(only.markdown, /\| 10 \|/);
  assert.ok(only.warnings.some((w) => /truncated/.test(w)));
  const missing = await officeToMarkdown(f, { sheets: ["Nope"] });
  assert.ok(missing.warnings.some((w) => /"Nope" not found/.test(w)));
});

test("office: pptx slide order from sldIdLst, titles, bullets, tables, notes", async () => {
  const f = put("deck.pptx", makePptx());
  const md = (await officeToMarkdown(f)).markdown;
  const i1 = md.indexOf("## Slide 1: Welcome Deck"), i2 = md.indexOf("## Slide 2: Agenda");
  assert.ok(i1 >= 0 && i2 > i1, md);
  assert.match(md, /- by the team/);
  assert.match(md, /- Intro\n {2}- Details\n- Wrap-up/);
  assert.doesNotMatch(md, /^- 2$/m, "slide number placeholder skipped");
  assert.match(md, /\| K \| V \|\n\| --- \| --- \|\n\| a \| 1 \|/);
  assert.match(md, /> Notes: Remember the demo\n> and questions/);
  const noNotes = (await officeToMarkdown(f, { includeNotes: false })).markdown;
  assert.doesNotMatch(noNotes, /Notes:/);
});

test("office: odt headings, spans, lists, links, repeated table cells", async () => {
  const r = await officeToMarkdown(put("doc.odt", makeOdt()));
  const md = r.markdown;
  assert.match(md, /^# Odt Title$/m);
  assert.match(md, /Hello \*\*strong\*\* world {2}end \[link\]\(https:\/\/odf\.example\/\)/);
  assert.match(md, /^- one\n- two\n {2}- two-a$/m);
  assert.match(md, /\| h1 \| h2 \|\n\| --- \| --- \|\n\| x \| x \|$/m);
  assert.ok(md.length < 2000, "huge repeated empty rows/cols do not expand");
});

test("office: unsupported and missing files give clear errors", async () => {
  const f = put("notes.txt", "hi");
  await assert.rejects(officeToMarkdown(f), /unsupported format "\.txt".*\.docx/);
  await assert.rejects(officeToMarkdown(join(dir, "nope.docx")), /not found/);
  await assert.rejects(officeToMarkdown(put("broken.docx", "not a zip")), /not a recognised Office file/);
});

test("office: tool handler converts a file and a folder, writes outputs, honours blocked paths", async () => {
  const src = join(dir, "in");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "a.docx"), makeDocx());
  writeFileSync(join(src, "b.xlsx"), makeXlsx());
  writeFileSync(join(src, "~$a.docx"), "lock");
  writeFileSync(join(src, "skip.txt"), "x");

  const one = await officeTool.handler({ path: "in/a.docx", output: "out/a.md" }, fakeCtx());
  assert.match(one, /# Quarterly Report/);
  assert.match(one, /Wrote: out\/a\.md/);
  assert.match(readFileSync(join(dir, "out/a.md"), "utf8"), /\| Apples \|/);

  const many = await officeTool.handler({ path: "in", output: "mdout", max_rows: 5, sheets: ["Big"] }, fakeCtx());
  assert.ok(existsSync(join(dir, "mdout/a.md")) && existsSync(join(dir, "mdout/b.md")), many);
  assert.match(many, /# a\.docx/);
  assert.match(many, /b\.xlsx: sheet "Big" truncated/);
  assert.doesNotMatch(readFileSync(join(dir, "mdout/b.md"), "utf8"), /## Sales/);

  await assert.rejects(officeTool.handler({ path: "in/a.docx" }, fakeCtx([src])), /blocked/);
  await assert.rejects(officeTool.handler({ path: "in/a.docx", output: "secret/x.md" }, fakeCtx([join(dir, "secret")])), /blocked/);
  assert.match(await officeTool.handler({ path: "in/skip.txt" }, fakeCtx()), /unsupported format/);
});

test("office: tool output truncates long Markdown and points at the output file", async () => {
  const S = `xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"`;
  const rows = Array.from({ length: 400 }, (_, k) => `<row r="${k + 1}"><c r="A${k + 1}" t="inlineStr"><is><t>${"row " + k + " ".padEnd(60, "x")}</t></is></c></row>`).join("");
  put("long.xlsx", zip({
    "_rels/.rels": rels([["rId1", "officeDocument", "xl/workbook.xml"]]),
    "xl/workbook.xml": `<workbook ${S}><sheets><sheet name="L" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": rels([["rId1", "worksheet", "worksheets/sheet1.xml"]]),
    "xl/worksheets/sheet1.xml": `<worksheet ${S}><sheetData>${rows}</sheetData></worksheet>`,
  }));
  const out = await officeTool.handler({ path: "long.xlsx", output: "long.md" }, fakeCtx());
  assert.match(out, /truncated: \d+ more characters — full Markdown is in long\.md/);
  assert.ok(out.length < 13000);
  assert.match(readFileSync(join(dir, "long.md"), "utf8"), /row 399/);
});

test("office: legacy formats are read natively — no textutil or LibreOffice involved", async () => {
  const r = await officeToMarkdown(put("legacy.rtf", "{\\rtf1\\ansi{\\fonttbl\\f0 Helvetica;}\\f0\\pard First paragraph.\\par Second paragraph.\\par}"));
  assert.match(r.markdown, /First paragraph\.\n\nSecond paragraph\./);
  assert.equal(r.format, "rtf");
  assert.doesNotMatch(r.markdown, /Helvetica/, "font table must not leak");
  const fx = (p) => new URL(`./fixtures/office/${p}`, import.meta.url).pathname;
  assert.equal((await officeToMarkdown(fx("doc/poi-Lists.doc"))).format, "doc");
  assert.equal((await officeToMarkdown(fx("xls/SimpleWithFormula.xls"))).format, "xls");
  assert.equal((await officeToMarkdown(fx("ppt/basic_test_ppt_file.ppt"))).format, "ppt");
});

test("office: the real type wins over the extension; garbage legacy files give clear errors", async () => {
  const fx = (p) => new URL(`./fixtures/office/${p}`, import.meta.url).pathname;
  const { readFileSync } = await import("node:fs");
  const rtfAsDoc = await officeToMarkdown(put("report.doc", readFileSync(fx("doc/word-style.rtf"))));
  assert.equal(rtfAsDoc.format, "rtf");
  assert.match(rtfAsDoc.warnings.join(" "), /really RTF/);
  const docAsDocx = await officeToMarkdown(put("old.docx", readFileSync(fx("doc/poi-simple-table.doc"))));
  assert.equal(docAsDocx.format, "doc");
  await assert.rejects(officeToMarkdown(put("old.xls", "x")), /not a recognised Office file/);
  await assert.rejects(officeToMarkdown(fx("xls/password.xls")), /password-protected/);
});

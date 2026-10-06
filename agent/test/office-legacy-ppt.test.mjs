import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dist } from "./helpers.mjs";

const { pptToMarkdown } = await import(dist("tools/office-ppt.js"));
const fx = (name) => readFileSync(new URL(`./fixtures/office/ppt/${name}`, import.meta.url));
const slideHeads = (md) => md.split("\n").filter((l) => l.startsWith("## "));

test("ppt: simple deck — slides, titles, body bullets, notes", () => {
  const { markdown: md, warnings } = pptToMarkdown(fx("basic_test_ppt_file.ppt"));
  assert.deepEqual(warnings, []);
  assert.deepEqual(slideHeads(md), ["## Slide 1: This is a test title", "## Slide 2: This is the title on page 2"]);
  assert.match(md, /## Slide 1: This is a test title\n\n- This is a test subtitle\n- This is on page 1\n\n> Notes: These are the notes for page 1/);
  assert.match(md, /- This is page two\n- It has several blocks of text\n- None of them have formatting/);
  assert.match(md, /> Notes: These are the notes on page two, again lacking formatting/);
});

test("ppt: includeNotes=false drops speaker notes", () => {
  const { markdown: md } = pptToMarkdown(fx("basic_test_ppt_file.ppt"), { includeNotes: false });
  assert.doesNotMatch(md, /Notes:|notes for page 1/);
  assert.equal(slideHeads(md).length, 2);
  assert.match(md, /- This is on page 1/);
});

test("ppt: no text is duplicated between the slide list and the drawings", () => {
  for (const f of ["basic_test_ppt_file.ppt", "text_shapes.ppt", "bug-41015.ppt", "54111.ppt", "incorrect_slide_order.ppt"]) {
    const lines = pptToMarkdown(fx(f)).markdown.split("\n").filter((l) => /^\s*- /.test(l)).map((l) => l.trim());
    assert.equal(new Set(lines).size, lines.length, `${f}: duplicated bullets: ${lines.join(" / ")}`);
  }
  const md = pptToMarkdown(fx("basic_test_ppt_file.ppt")).markdown;
  assert.equal(md.split("This is a test title").length - 1, 1);
});

test("ppt: slides follow presentation order, not record order", () => {
  const { markdown: md } = pptToMarkdown(fx("incorrect_slide_order.ppt"));
  assert.deepEqual(slideHeads(md), ["## Slide 1: Slide 1", "## Slide 2: Slide 2", "## Slide 3: Slide 3"]);
  const order = ["First slide I added", "Third slide I added", "Second slide I added"].map((t) => md.indexOf(t));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], md);
});

test("ppt: paragraph indent levels become nested bullets", () => {
  const { markdown: md } = pptToMarkdown(fx("bug-41015.ppt"));
  assert.match(md, /^## Slide 1: sdfsdfsdf$/m);
  assert.match(md, /^- Dfgdfgdfg\n {2}- Sdfsdfs\n {2}- Sdfsdf$/m);
  assert.match(md, /^- Sdfsdfsdf$/m);
});

test("ppt: text stored only in slide drawings is extracted", () => {
  const { markdown: md } = pptToMarkdown(fx("text_shapes.ppt"));
  assert.match(md, /^## Slide 1: Title Placeholder$/m);
  for (const t of ["Text in a TextBox", "Rectangle", "Ellipse", "Octagon"]) assert.match(md, new RegExp(`^- ${t}$`, "m"));
});

test("ppt: non-ASCII text (CJK, half-width kana, non-BMP)", () => {
  const { markdown: md } = pptToMarkdown(fx("54880_chinese.ppt"));
  for (const t of ["Single byte", "複数の文字", "カタカナ", "ﾊﾝｶｸ", "𠮟", "表Mixパﾋﾟ𠮟"]) assert.ok(md.includes(`- ${t}`), `missing ${t}\n${md}`);
});

test("ppt: OfficeArt table becomes a Markdown table", () => {
  const { markdown: md } = pptToMarkdown(fx("54111.ppt"));
  assert.match(md, /^## Slide 1: Table sample$/m);
  assert.match(md, /^\| TH Cell 1 \| TH Cell 2 \| TH Cell 3 \| TH Cell 4 \|\n\| --- \| --- \| --- \| --- \|\n\| Row 1, Cell 1 \| Row 1, Cell 2 \|/m);
  assert.match(md, /^\| Row 5, Cell 1 \| Row 5, Cell 2 \| Row 5, Cell 3 \| Row 5, Cell 4 \|$/m);
  assert.doesNotMatch(md, /^- Row 1, Cell 1/m);
});

test("ppt: password-protected deck → clear error", () => {
  assert.throws(() => pptToMarkdown(fx("Password_Protected-hello.ppt")), /password-protected \.ppt is not supported/);
});

test("ppt: truncated or garbage input → error, not a crash or hang", () => {
  const buf = fx("basic_test_ppt_file.ppt");
  for (const n of [100, 600, 4096, 8000, 12000]) assert.throws(() => pptToMarkdown(buf.subarray(0, n)), /\.ppt|compound|stream|sector/i, `length ${n}`);
  assert.throws(() => pptToMarkdown(Buffer.from("not a presentation at all")), /not a readable \.ppt/);
});

test("ppt: broken Current User pointer → falls back to scanning, with a warning", () => {
  const buf = Buffer.from(fx("basic_test_ppt_file.ppt"));
  // CurrentUserAtom: 8-byte header (type 0x0FF6), size (0x14), headerToken 0xE391C05F, offsetToCurrentEdit
  const at = buf.indexOf(Buffer.from([0x14, 0x00, 0x00, 0x00, 0x5f, 0xc0, 0x91, 0xe3]));
  assert.ok(at > 0 && buf.readUInt16LE(at - 6) === 0x0ff6);
  buf.writeUInt32LE(0x7fffff00, at + 8);
  const { markdown: md, warnings } = pptToMarkdown(buf);
  assert.ok(warnings.some((w) => /scanned the stream/.test(w)), warnings.join("; "));
  assert.deepEqual(slideHeads(md), ["## Slide 1: This is a test title", "## Slide 2: This is the title on page 2"]);
  assert.match(md, /> Notes: These are the notes for page 1/);
});

test("ppt: corrupted record lengths inside the stream do not crash", () => {
  const orig = fx("basic_test_ppt_file.ppt");
  // stomp on a range of bytes in the file body repeatedly; every outcome must be a result or a thrown Error
  for (let seed = 1; seed <= 40; seed++) {
    const buf = Buffer.from(orig);
    let x = seed * 2654435761 >>> 0;
    for (let k = 0; k < 24; k++) { x = (x * 1103515245 + 12345) >>> 0; buf[1536 + (x % (buf.length - 1536))] = x >>> 24; }
    try { const r = pptToMarkdown(buf); assert.equal(typeof r.markdown, "string"); } catch (e) { assert.ok(e instanceof Error); }
  }
});

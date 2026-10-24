// convert_document: read documents of every kind (and links) and write the format the work needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, dist, call } from "./helpers.mjs";

const mac = process.platform === "darwin";

test("Google links map to Word / Excel / PowerPoint exports; Drive files to a download", async () => {
  const { exportUrl } = await import(dist("runtime/documents.js"));
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
  assert.deepEqual(exportUrl(`https://docs.google.com/document/d/${id}/edit?usp=sharing`), { url: `https://docs.google.com/document/d/${id}/export?format=docx`, ext: ".docx", kind: "Google Doc" });
  assert.equal(exportUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`).url, `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`);
  assert.equal(exportUrl(`https://docs.google.com/presentation/d/${id}/edit`).url, `https://docs.google.com/presentation/d/${id}/export/pptx`);
  assert.equal(exportUrl(`https://drive.google.com/file/d/${id}/view`).url, `https://drive.google.com/uc?export=download&id=${id}`);
  assert.equal(exportUrl("https://example.com/a.pdf").kind, "link");
});

test("markdown → html, tables, csv ↔ xlsx ↔ json, and the xlsx reads back", async () => {
  const { convertFile, markdownToHtml, markdownTables, writeXlsx } = await import(dist("tools/convert.js"));
  const { officeToMarkdown } = await import(dist("tools/office.js"));
  const d = mkdtempSync(join(tmpdir(), "conv-"));
  const src = (p) => ({ path: p, name: p.split("/").pop(), ext: "." + p.split(".").pop(), label: p.split("/").pop() });
  const html = markdownToHtml("# Plan <x>\n\n| a | b |\n|---|---|\n| 1 | **two** |\n\n- [x] done\n", "T");
  assert.match(html, /<h1>Plan &lt;x&gt;<\/h1>/); assert.match(html, /<td><strong>two<\/strong><\/td>/); assert.match(html, /☑ done/);
  assert.deepEqual(markdownTables("## Sales\n\n| Item | Qty |\n|---|---|\n| Rice | 2 |\n"), [{ name: "Sales", rows: [["Item", "Qty"], ["Rice", "2"]] }]);

  writeFileSync(join(d, "in.csv"), 'name,qty,note\nRice,2,"with, comma"\nDal,10,"say ""hi"""\n');
  assert.match(await convertFile(src(join(d, "in.csv")), join(d, "out.xlsx")), /Excel workbook: in \(3 rows\)/);
  const back = await officeToMarkdown(join(d, "out.xlsx"));
  assert.match(back.markdown, /\| Rice \| 2 \| with, comma \|/);
  await convertFile(src(join(d, "out.xlsx")), join(d, "again.csv"));
  assert.equal(readFileSync(join(d, "again.csv"), "utf8"), 'name,qty,note\nRice,2,"with, comma"\nDal,10,"say ""hi"""\n');
  await convertFile(src(join(d, "in.csv")), join(d, "out.json"));
  assert.deepEqual(JSON.parse(readFileSync(join(d, "out.json"), "utf8"))[1], { name: "Dal", qty: "10", note: 'say "hi"' });

  writeFileSync(join(d, "two.xlsx"), writeXlsx([{ name: "Jan", rows: [["a"], ["1"]] }, { name: "Feb", rows: [["b"], ["2"]] }]));
  assert.match(await convertFile(src(join(d, "two.xlsx")), join(d, "first.csv")), /the first of 2 tables: Jan, Feb/);
  await convertFile(src(join(d, "two.xlsx")), join(d, "feb.csv"), { sheet: "Feb" });
  assert.equal(readFileSync(join(d, "feb.csv"), "utf8"), "b\n2\n");
  await assert.rejects(convertFile(src(join(d, "two.xlsx")), join(d, "x.csv"), { sheet: "Mar" }), /no sheet\/table "Mar"; found: 1\. Jan, 2\. Feb/);
  await assert.rejects(convertFile(src(join(d, "in.csv")), join(d, "x.pptx")), /cannot write \.pptx/);
});

test("Word, RTF, ODT and PDF out of Markdown (macOS), and read back", { skip: !mac && "needs macOS textutil" }, async () => {
  const { convertFile } = await import(dist("tools/convert.js"));
  const { officeToMarkdown } = await import(dist("tools/office.js"));
  const { convertToMarkdown } = await import(dist("rag/convert.js"));
  const d = mkdtempSync(join(tmpdir(), "conv-"));
  writeFileSync(join(d, "spec.md"), "# Checkout spec\n\nPay with **UPI**.\n\n| Step | Who |\n|---|---|\n| Pay | Buyer |\n");
  const s = { path: join(d, "spec.md"), name: "spec.md", ext: ".md", label: "spec.md" };
  for (const ext of [".docx", ".rtf", ".odt"]) {
    await convertFile(s, join(d, "spec" + ext));
    const md = (await officeToMarkdown(join(d, "spec" + ext))).markdown;
    assert.match(md, /Checkout spec/, ext); assert.match(md, /UPI/, ext);
  }
  const how = await convertFile(s, join(d, "spec.pdf"));
  assert.match(how, /^PDF \((Chromium|cupsfilter)\)$/);
  assert.equal(readFileSync(join(d, "spec.pdf")).subarray(0, 5).toString(), "%PDF-");
  assert.match((await convertToMarkdown("spec.pdf", readFileSync(join(d, "spec.pdf")))).markdown, /Checkout spec/);
});

test("convert_document tool: reads a link without output; writes a file; the chat's documents list it", async () => {
  const t = await setup("web:\n  allow_private: true\n");
  const srv = createServer((req, res) => { res.writeHead(200, { "content-type": "text/csv", "content-disposition": 'attachment; filename="prices.csv"' }); res.end("item,price\nRice,120\n"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${srv.address().port}/export`;
  try {
    const s = t.rt.createSession({ source: "web", cwd: t.work });
    t.mock.script([
      { tool_calls: [call("convert_document", { source: url })] },
      { tool_calls: [call("convert_document", { source: url, output: "out/prices.xlsx" })] },
      { tool_calls: [call("convert_document", { source: "missing.docx" })] },
      { content: "Converted." },
    ]);
    await t.rt.send(s.id, "convert the price list", { source: "web" }); await t.rt.waitIdle(s.id);
    const ends = t.events.filter((e) => e.type === "tool_end" && e.name === "convert_document");
    assert.match(ends[0].result, /\| Rice \| 120 \|/);
    assert.match(ends[1].result, /Wrote .*out\/prices\.xlsx \(Excel workbook: prices/);
    assert.ok(existsSync(join(t.work, "out", "prices.xlsx")));
    assert.match(ends[2].result, /not found/);
    const { chatDocuments } = await import(dist("runtime/documents.js"));
    assert.ok(chatDocuments(t.rt, s.id).some((x) => x.path.endsWith("out/prices.xlsx")));
  } finally { srv.close(); await t.close(); }
});

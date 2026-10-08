import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { setup, dist } from "./helpers.mjs";

const POLICY = "Return policy\n\nCustomers may return unopened organic rice within 14 days of delivery for a full refund.\n\nShipping\n\nOrders above 499 rupees ship free across India.";
const mac = process.platform === "darwin";
const conv = async (name, buf) => (await import(dist("rag/convert.js"))).convertToMarkdown(name, Buffer.isBuffer(buf) ? buf : Buffer.from(buf));

test("rag convert: text, markdown, csv, html, json and code become markdown", async () => {
  assert.match((await conv("a.txt", POLICY)).markdown, /14 days/);
  assert.equal((await conv("a.md", "# T\n\nbody")).markdown, "# T\n\nbody\n");
  const csv = (await conv("sales.csv", 'item,qty\n"Rice, basmati",3\nDal,5\n')).markdown;
  assert.match(csv, /\| item \| qty \|/); assert.match(csv, /Rice, basmati/);
  const html = (await conv("p.html", "<html><head><title>FAQ</title></head><body><h2>Delivery</h2><p>Ships in 2 days.</p><script>x=1</script></body></html>")).markdown;
  assert.match(html, /# FAQ/); assert.match(html, /## Delivery/); assert.match(html, /Ships in 2 days/); assert.doesNotMatch(html, /x=1/);
  assert.match((await conv("c.json", '{"a":1}')).markdown, /```json/);
  assert.match((await conv("s.py", "print(1)")).markdown, /```python/);
});

test("rag convert: unreadable files are rejected with a reason, not guessed", async () => {
  await assert.rejects(conv("pic.png", Buffer.from([137, 80, 78, 71])), /images are not supported/);
  await assert.rejects(conv("x.bin", Buffer.from([1, 2, 0, 3, 0, 5])), /binary/);
  await assert.rejects(conv("empty.txt", Buffer.alloc(0)), /empty/);
});

test("rag convert: Word, RTF and PDF files are converted to markdown", { skip: !mac }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "ragfx-"));
  writeFileSync(join(dir, "policy.txt"), POLICY);
  for (const f of ["docx", "rtf"]) execFileSync("textutil", ["-convert", f, join(dir, "policy.txt"), "-output", join(dir, `policy.${f}`)]);
  for (const f of ["docx", "rtf"]) {
    const r = await conv(`policy.${f}`, readFileSync(join(dir, `policy.${f}`)));
    assert.match(r.markdown, /unopened organic rice within 14 days/, f);
    assert.match(r.markdown, /ship free across India/, f);
  }
  // PDF: print a page with headless Chromium, then read it back through PDFKit
  let pw; try { pw = createRequire(import.meta.url)("playwright-core"); } catch { return; }
  const br = await pw.chromium.launch({ headless: true });
  try {
    const pg = await br.newPage(); await pg.setContent(`<h1>Refund policy</h1><p>Returns accepted within 14 days of delivery.</p><p>Free shipping above 499 rupees.</p>`);
    const pdf = await pg.pdf();
    const r = await conv("policy.pdf", pdf);
    assert.equal(r.format, "pdf");
    assert.match(r.markdown, /Returns accepted within 14 days/);
    assert.match(r.markdown, /page 1/);
  } finally { await br.close(); }
});

test("rag store: chunks, ranks by relevance, replaces on re-upload, removes", async () => {
  const t = await setup();
  try {
    const R = t.rt.rag;
    const a = await R.add("policy.txt", Buffer.from(POLICY));
    await R.add("farm.md", Buffer.from("# Farms\n\n## Basmati\n\nBasmati rice is grown in Punjab and Haryana in long, aromatic grains.\n\n## Turmeric\n\nTurmeric is harvested in Erode, Tamil Nadu and has high curcumin."));
    assert.equal(R.list().length, 2);
    assert.ok(a.chunks >= 1 && a.chars > 50);
    assert.match(R.search("what is the refund window for returns?")[0].name, /policy\.txt/);
    assert.match(R.search("where is turmeric harvested")[0].text, /Erode/);
    assert.equal(R.search("quantum chromodynamics lagrangian").length, 0);   // nothing relevant: no hits, not nearest-guess
    const top = R.search("basmati punjab")[0]; assert.equal(top.name, "farm.md"); assert.match(top.heading, /Farms › Basmati/);
    const again = await R.add("policy.txt", Buffer.from("Return policy\n\nReturns within 30 days."));
    assert.equal(R.list().length, 2); assert.notEqual(again.id, a.id);
    assert.match(R.search("returns days")[0].text, /30 days/);
    assert.equal(R.remove(again.id), true); assert.equal(R.list().length, 1); assert.equal(R.markdown(again.id), null);
    // survives a restart
    const { RagStore } = await import(dist("rag/index.js"));
    assert.equal(new RagStore(t.home).list().length, 1);
  } finally { await t.close(); }
});

test("RAG bot: strict prompt, only rag_search tool, excerpts injected per question but not stored, not-found case", async () => {
  const t = await setup();
  try {
    await t.rt.rag.add("policy.txt", Buffer.from(POLICY));
    const s = t.rt.createSession({ source: "web", cwd: t.work });
    t.rt.setMode(s.id, "rag");
    const sess = t.rt.db.getSession(s.id);
    assert.equal(sess.meta.mode, "rag");
    assert.match(sess.system_prompt, /Answer ONLY from the text inside <documents>/);
    assert.deepEqual(sess.meta.tool_names, ["rag_search"]);
    assert.deepEqual(t.rt.activeTools(s.id).map((x) => x.name), ["rag_search"]);
    t.mock.script([{ content: "You can return unopened rice within 14 days [policy.txt §1]." }]);
    await t.rt.send(s.id, "How many days do I have to return rice?", { source: "web" }); await t.rt.waitIdle(s.id);
    const main = t.mock.requests.filter((r) => (r.messages?.[0]?.content ?? "").includes("RAG Bot")).at(-1);
    const sent = main.messages.filter((m) => m.role === "user").at(-1).content;
    assert.match(sent, /<documents shared="policy\.txt">/);
    assert.match(sent, /\[policy\.txt §1[^\]]*\]\n[\s\S]*14 days/);
    assert.match(sent, /Question: How many days do I have to return rice\?/);
    assert.deepEqual(main.tools.map((x) => x.function?.name ?? x.name), ["rag_search"]);
    assert.equal(t.rt.db.getMessages(s.id).find((m) => m.role === "user").content, "How many days do I have to return rice?");   // chat keeps the plain question
    // a question the documents cannot answer: the model is told nothing matched
    t.mock.reset(); t.mock.script([{ content: "I couldn't find this in the shared documents." }]);
    await t.rt.send(s.id, "Who won the 1998 football world cup?", { source: "web" }); await t.rt.waitIdle(s.id);
    const last = t.mock.requests.filter((r) => (r.messages?.[0]?.content ?? "").includes("RAG Bot")).at(-1).messages.filter((m) => m.role === "user").at(-1).content;
    assert.match(last, /No excerpt matched this question/);
    // back to the normal agent
    t.rt.setMode(s.id, "agent");
    const back = t.rt.db.getSession(s.id);
    assert.equal(back.meta.mode, undefined);
    assert.doesNotMatch(back.system_prompt, /RAG Bot/);
    assert.ok(t.rt.activeTools(s.id).length > 5);
  } finally { await t.close(); }
});

test("RAG bot: rag_search tool and empty store", async () => {
  const t = await setup();
  try {
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    const tool = t.rt.tools.get("rag_search"); const ctx = t.rt.toolContext(s.id);
    assert.match(await tool.handler({ query: "refund" }, ctx), /No matching excerpts/);
    await t.rt.rag.add("policy.txt", Buffer.from(POLICY));
    assert.match(await tool.handler({ query: "free shipping rupees" }, ctx), /\[policy\.txt §\d[^\]]*\][\s\S]*499/);
    const { excerptBlock } = await import(dist("rag/index.js"));
    t.rt.rag.remove(t.rt.rag.list()[0].id);
    assert.match(excerptBlock(t.rt.rag, "anything"), /No documents have been shared yet/);
  } finally { await t.close(); }
});

test("RAG http api: upload (base64) converts, lists, serves markdown, deletes; bad files are 422; mode endpoint", async () => {
  const t = await setup();
  try {
    const { startServer } = await import(dist("server/http.js"));
    const h = await startServer(t.rt, { port: 0 });
    const hd = { "x-stitap-token": h.token, "content-type": "application/json" };
    try {
      assert.equal((await fetch(h.url + "/api/rag/docs")).status, 401);
      const up = await fetch(h.url + "/api/rag/docs", { method: "POST", headers: hd, body: JSON.stringify({ name: "policy.txt", data: Buffer.from(POLICY).toString("base64") }) });
      assert.equal(up.status, 200); const { doc } = await up.json(); assert.equal(doc.name, "policy.txt");
      const bad = await fetch(h.url + "/api/rag/docs", { method: "POST", headers: hd, body: JSON.stringify({ name: "x.png", data: Buffer.from([1, 2, 3]).toString("base64") }) });
      assert.equal(bad.status, 422); assert.match((await bad.json()).error, /images are not supported/);
      assert.equal((await (await fetch(h.url + "/api/rag/docs", { headers: hd })).json()).docs.length, 1);
      const md = await fetch(h.url + `/api/rag/docs/${doc.id}/markdown?token=${h.token}`);
      assert.equal(md.status, 200); assert.match(await md.text(), /14 days/);
      assert.equal((await fetch(h.url + "/api/rag/search?q=refund+days", { headers: hd }).then((r) => r.json())).hits[0].name, "policy.txt");
      const s = t.rt.createSession({ source: "web", cwd: t.work });
      assert.equal((await fetch(h.url + `/api/sessions/${s.id}/mode`, { method: "POST", headers: hd, body: JSON.stringify({ mode: "rag" }) })).status, 200);
      assert.equal(t.rt.db.getSession(s.id).meta.mode, "rag");
      assert.equal((await fetch(h.url + `/api/sessions/${s.id}/mode`, { method: "POST", headers: hd, body: JSON.stringify({ mode: "nope" }) })).status, 400);
      assert.equal((await (await fetch(h.url + `/api/rag/docs/${doc.id}`, { method: "DELETE", headers: hd })).json()).ok, true);
      assert.equal((await fetch(h.url + `/api/rag/docs/${doc.id}/markdown?token=${h.token}`)).status, 404);
    } finally { await h.close(); }
  } finally { await t.close(); }
});

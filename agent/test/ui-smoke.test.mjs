// Opens the real web UI in headless Chromium: the page script must load without errors, existing chats must render their messages,
// and the Agent/RAG toggle, RAG tab and Kanban tab/board must work. (A missing function in the page script once blanked every chat.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { setup, dist } from "./helpers.mjs";

let chromium = null;
try { chromium = createRequire(import.meta.url)("playwright-core").chromium; if (!existsSync(chromium.executablePath())) chromium = null; } catch { chromium = null; }

test("web UI: no script errors; a chat with messages renders; toggle, RAG tab and Kanban board work", { skip: !chromium && "Chromium is not installed", timeout: 90000 }, async () => {
  const t = await setup();
  const { startServer } = await import(dist("server/http.js"));
  const h = await startServer(t.rt, { port: 0 });
  const br = await chromium.launch({ headless: true });
  try {
    t.mock.script([{ content: "Hello from the assistant." }]);
    const s = t.rt.createSession({ source: "web", cwd: t.work });
    await t.rt.send(s.id, "Say hello please", { source: "web" }); await t.rt.waitIdle(s.id);
    t.rt.kanban.create({ title: "A ticket" });
    const pg = await br.newPage({ viewport: { width: 1400, height: 850 } });
    const errs = [];
    pg.on("pageerror", (e) => errs.push(e.message));
    pg.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await pg.goto(`${h.url}/#s=${s.id}`);
    await pg.waitForSelector("#msgs .msg.user", { timeout: 15000 });
    assert.match(await pg.$eval("#msgs .msg.user", (e) => e.textContent), /Say hello please/);
    assert.match(await pg.$eval("#msgs", (e) => e.textContent), /Hello from the assistant\./);
    // switching chats renders the other one too
    const s2 = t.rt.createSession({ source: "web", cwd: t.work }); t.mock.script([{ content: "Second chat reply." }]);
    await t.rt.send(s2.id, "Second question", { source: "web" }); await t.rt.waitIdle(s2.id);
    await pg.goto(`${h.url}/#s=${s2.id}`); await pg.reload();
    await pg.waitForFunction(() => /Second chat reply\./.test(document.querySelector("#msgs")?.textContent ?? ""), null, { timeout: 15000 });
    // Agent / RAG Bot toggle
    await pg.click('#modeSw button[data-m="rag"]'); await pg.waitForFunction(() => document.body.classList.contains("ragmode"));
    assert.match(await pg.getAttribute("#input", "placeholder"), /shared documents/);
    assert.equal(t.rt.db.getSession(s2.id).meta.mode, "rag");
    await pg.click('#modeSw button[data-m="agent"]'); await pg.waitForFunction(() => !document.body.classList.contains("ragmode"));
    // RAG tab lists documents
    await t.rt.rag.add("note.txt", Buffer.from("Organic rice ships free above 499 rupees."));
    await pg.click('.tabs button[data-pane="rag"]');
    await pg.waitForFunction(() => /note\.txt/.test(document.querySelector("#ragList")?.textContent ?? ""), null, { timeout: 8000 });
    // Kanban tab and full board
    await pg.click('.tabs button[data-pane="kanban"]');
    await pg.waitForFunction(() => /Main/.test(document.querySelector("#kbSide")?.textContent ?? ""), null, { timeout: 8000 });
    await pg.click("#kbOpen"); await pg.waitForSelector("#kb.on");
    await pg.waitForFunction(() => document.querySelectorAll("#kbBody .kbphase, #kbBody .kbempty, #kbBody .kbcol").length > 0 || /A ticket/.test(document.querySelector("#kbBody")?.textContent ?? ""), null, { timeout: 8000 });
    assert.deepEqual(errs, []);
  } finally { await br.close(); await h.close(); await t.close(); }
});

test("model progress: reading shows the percent, writing shows tokens/s, idle is idle", async () => {
  const { modelProgress } = await import(dist("server/http.js"));
  const { mkdtempSync, writeFileSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const home = mkdtempSync(join(tmpdir(), "prog-"));
  const log = (...l) => writeFileSync(join(home, "model.log"), l.join("\n") + "\n");
  assert.equal(modelProgress(home).phase, "unknown");
  log("srv  update_slots: all slots are idle");
  assert.equal(modelProgress(home).phase, "idle");
  log("0.11.000 I slot launch_slot_: id  0 | task 5 | processing task", "0.12.000 I slot print_timing: id  0 | task 5 | prompt processing, n_tokens =   6144, progress = 0.39, t =  90.8 s / 67.66 tokens per second");
  assert.deepEqual(modelProgress(home), { phase: "reading", percent: 39, tokens: 6144, model: "strong" });
  log("0.11.000 I slot launch_slot_: id  0 | task 5 | processing task", "0.12.000 I slot print_timing: id  0 | task 5 | prompt processing, n_tokens =   6144, progress = 1.00", "0.14.000 I slot print_timing: id  0 | task 5 | n_gen =    120, tg =   9.00 t/s, tg_3s =   8.95 t/s");
  assert.deepEqual(modelProgress(home), { phase: "writing", tokens: 120, tps: 9, model: "strong" });
  log("0.14.000 I slot print_timing: id  0 | task 5 | n_gen = 120, tg = 9.00 t/s", "0.15.000 I slot      release: id  0 | task 5 | stop processing: n_tokens = 99");
  assert.equal(modelProgress(home).phase, "idle");                                        // a finished task is idle, not "writing"
});

test("web UI: a busy chat shows a visible 'working' line with live progress, and removes it when the model is done", { skip: !chromium && "Chromium is not installed", timeout: 60000 }, async () => {
  const t = await setup();
  const { writeFileSync } = await import("node:fs"); const { join } = await import("node:path");
  const { startServer } = await import(dist("server/http.js"));
  const h = await startServer(t.rt, { port: 0 }); const br = await chromium.launch({ headless: true });
  try {
    writeFileSync(join(t.home, "model.log"), "0.11.000 I slot launch_slot_: id  0 | task 5 | processing task\n0.12.000 I slot print_timing: id  0 | task 5 | prompt processing, n_tokens =   6144, progress = 0.39, t = 90.8 s / 67.66 tokens per second\n");
    const s = t.rt.createSession({ source: "web", cwd: t.work });
    const pg = await br.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(e.message));
    await pg.goto(`${h.url}/#s=${s.id}`); await pg.waitForSelector("#msgs .empty");
    await pg.evaluate(() => setBusy(true));
    await pg.waitForFunction(() => /39% done \(6,144 tokens\)/.test(document.querySelector("#msgs .working")?.textContent ?? ""), null, { timeout: 8000 });
    assert.match(await pg.$eval("#msgs .working", (e) => e.textContent), /reading the whole conversation before it answers/);
    await pg.evaluate(() => onEvent({ type: "token", text: "Hi" }));                     // the first word of the answer replaces the waiting line
    assert.equal(await pg.$$eval("#msgs .working", (e) => e.length), 0);
    await pg.evaluate(() => onEvent({ type: "tool_end", id: "x", name: "terminal", ok: true, result: "" }));   // after a tool, the model thinks again: the line returns
    await pg.waitForSelector("#msgs .working", { timeout: 3000 });
    await pg.evaluate(() => setBusy(false));
    assert.equal(await pg.$$eval("#msgs .working", (e) => e.length), 0);
    assert.deepEqual(errs, []);
  } finally { await br.close(); await h.close(); await t.close(); }
});

test("web UI: the Kanban bar on the main screen shows which card is being worked and the attempt number", { skip: !chromium && "Chromium is not installed", timeout: 90000 }, async () => {
  const t = await setup();
  const { startServer } = await import(dist("server/http.js"));
  const h = await startServer(t.rt, { port: 0 });
  const br = await chromium.launch({ headless: true });
  try {
    const card = t.rt.kanban.create({ title: "Write the footer" });
    t.rt.kanban.update(card.id, { status: "running", attempts: 2 }, { by: "worker" });
    t.rt.kanban.active.add(card.id);   // pretend a worker is on it
    const pg = await br.newPage({ viewport: { width: 1200, height: 800 } });
    await pg.goto(h.url);
    await pg.waitForFunction(() => { const b = document.querySelector("#kbBar"); return b && !b.hidden && /working on/.test(b.textContent); }, null, { timeout: 15000 });
    assert.match(await pg.$eval("#kbBar", (e) => e.textContent), /attempt 2 of 5/);
    assert.match(await pg.$eval("#kbAgent", (e) => e.textContent), /Agent is working on .* attempt 2 of 5/);   // full-board header
    t.rt.kanban.active.delete(card.id);   // worker gone: the bar must say so and offer Resume
    await pg.waitForFunction(() => /no worker is on it/.test(document.querySelector("#kbBar").textContent), null, { timeout: 15000 });
    assert.ok(await pg.$("#kbBar button"));
    await pg.waitForFunction(() => /Agent is NOT working/.test(document.querySelector("#kbAgent").textContent), null, { timeout: 15000 });
    // while a worker is active: Send is Stop, the box is locked, status lines appear in the chat; Stop pauses the board
    t.rt.kanban.active.add(card.id);
    await pg.waitForFunction(() => document.querySelector("#sendBtn").textContent === "Stop" && document.querySelector("#input").disabled, null, { timeout: 15000 });
    await pg.click("#sendBtn");
    await pg.waitForFunction(() => /Stopped Kanban/.test(document.querySelector("#msgs").textContent), null, { timeout: 15000 });
    assert.equal(t.rt.kanban.paused, true);
    await pg.waitForFunction(() => /Stopping|Paused by you/.test(document.querySelector("#kbAgent").textContent), null, { timeout: 15000 });
    assert.equal(await t.rt.kanban.tick(), 0);   // paused: nothing is dispatched
    t.rt.kanban.update(card.id, { status: "done" }, { by: "worker", reason: "tests passed" });
    await pg.waitForFunction(() => /✔ .* done/.test(document.querySelector("#msgs").textContent), null, { timeout: 15000 });
  } finally { await br.close(); await h.close?.(); await t.close(); }
});

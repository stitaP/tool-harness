// Story review in the Kanban tab: tick to approve (and take back), comments per story and per feature, "apply my comments", run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { setup, dist, call } from "./helpers.mjs";

let chromium = null, devices = null;
try { ({ chromium, devices } = createRequire(import.meta.url)("playwright-core")); if (!existsSync(chromium.executablePath())) chromium = null; } catch { chromium = null; }

function draftBoard(t) {
  const K = t.rt.kanban;
  const b = K.boards.create("Shop v1"); K.boards.setDraft(b.id, { draft: true });
  K.boards.use(K.boards.list().find((x) => x.id !== b.id)?.id ?? b.id);   // the draft is not the active board
  const e1 = K.create({ title: "Checkout", type: "epic", board: b.id, key_prefix: "SH" });
  const e2 = K.create({ title: "Catalog", type: "epic", board: b.id, key_prefix: "SH" });
  const s1 = K.create({ title: "Cart page", status: "backlog", board: b.id, parent: e1.key, key_prefix: "SH", acceptance: ["shows items"], summary: "A cart" });
  const s2 = K.create({ title: "Pay with UPI", status: "backlog", board: b.id, parent: e1.key, key_prefix: "SH", review_flags: ["which UPI provider?"] });
  const s3 = K.create({ title: "Product list", status: "backlog", board: b.id, parent: e2.key, key_prefix: "SH" });
  return { b, e1, e2, s1, s2, s3 };
}

test("review API: grouped by feature, tick approves and unticks, comments and open feedback, apply starts a chat", async () => {
  const t = await setup();
  const { startServer } = await import(dist("server/http.js"));
  const srv = await startServer(t.rt, { port: 0 });
  const H = { "content-type": "application/json", "x-stitap-token": srv.token };
  const post = async (b) => { const r = await fetch(`${srv.url}/api/kanban/review`, { method: "POST", headers: H, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json()) }; };
  try {
    const { b, e1, s1, s2, s3 } = draftBoard(t);
    const active = t.rt.kanban.boards.activeId();
    let d = await (await fetch(`${srv.url}/api/kanban/review?board=${b.id}`, { headers: H })).json();
    assert.deepEqual(d.epics.map((e) => [e.title, e.stories.map((s) => s.title)]), [["Checkout", ["Cart page", "Pay with UPI"]], ["Catalog", ["Product list"]]]);
    assert.deepEqual(d.counts, { stories: 3, approved: 0, flagged: 1, open: 0 });

    assert.deepEqual((await post({ board: b.id, action: "approve", keys: [s1.key, s3.key] })).changed.sort(), [s1.key, s3.key].sort());
    assert.equal(t.rt.kanban.get(s1.key).status, "ready");
    assert.equal(t.rt.kanban.boards.activeId(), active, "approving in review does not switch the workers' board");
    assert.deepEqual((await post({ board: b.id, action: "unapprove", keys: [s3.key] })).changed, [s3.key]);
    assert.equal(t.rt.kanban.get(s3.key).status, "backlog");

    assert.equal((await post({ board: b.id, action: "comment", key: s2.key, text: "Use Razorpay for UPI" })).ok, true);
    assert.equal((await post({ board: b.id, action: "comment", key: e1.key, text: "Add a coupon story" })).ok, true);
    assert.equal((await post({ board: b.id, action: "comment", key: s2.key, text: "  " })).status, 400);
    d = await (await fetch(`${srv.url}/api/kanban/review?board=${b.id}`, { headers: H })).json();
    assert.equal(d.counts.open, 2); assert.equal(d.counts.approved, 1);

    t.mock.script([
      { tool_calls: [call("kanban", { action: "comment", id: s2.key, text: "Switched the story to Razorpay UPI.", reply_to: t.rt.kanban.get(s2.key).comments[0].id })] },
      { content: "Done." },
    ]);
    const r = await post({ board: b.id, action: "apply" });
    assert.equal(r.tickets, 2); assert.match(r.session, /^s_/);
    await t.rt.waitIdle(r.session);
    const first = t.rt.db.getMessages(r.session).find((m) => m.role === "user").content;
    assert.match(first, /Use Razorpay for UPI/); assert.match(first, /Add a coupon story/); assert.match(first, /reply_to/);
    d = await (await fetch(`${srv.url}/api/kanban/review?board=${b.id}`, { headers: H })).json();
    assert.equal(d.counts.open, 1, "the answered comment is no longer open");

    const run = await post({ board: b.id, action: "run" });
    assert.equal(run.ok, true);
    assert.equal(t.rt.kanban.boards.activeId(), b.id);
    assert.equal(t.rt.kanban.get(s3.key).status, "backlog", "unticked stories stay drafts when running");
  } finally { t.rt.kanban.stopAll(); await new Promise((r) => setTimeout(r, 300)); await srv.close(); await t.close(); }
});

test("web UI (phone): Kanban tab › Review stories: tick, comment with a quick reply, filter", { skip: !chromium && "Chromium is not installed", timeout: 90000 }, async () => {
  const t = await setup();
  const { startServer } = await import(dist("server/http.js"));
  const srv = await startServer(t.rt, { port: 0 });
  const br = await chromium.launch({ headless: true });
  try {
    const { b, s1, s2 } = draftBoard(t);
    const pg = await br.newPage({ ...devices["iPhone 13"] });
    const errs = [];
    pg.on("pageerror", (e) => errs.push(e.message));
    pg.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await pg.goto(`${srv.url}/?kb=review`);
    // it opens on the draft board that waits for review
    await pg.waitForFunction((k) => document.querySelector(`#kbrv.on #rvList input[data-key="${k}"]`), s1.key);
    assert.equal(await pg.$eval("#rvBoard", (x) => x.value), b.id);
    // tick one story
    await pg.tap(`#rvList input[data-key="${s1.key}"]`);
    await pg.waitForFunction(() => /1\/3 approved/.test(document.querySelector("#rvCount").textContent));
    assert.equal(t.rt.kanban.get(s1.key).status, "ready");
    // the feature's tick shows "some" and approves the rest of it
    assert.equal(await pg.$eval(`#rvList input[data-epic]`, (x) => x.indeterminate), true);
    // open a story and comment with a quick reply
    await pg.tap(`#rvList [data-x="${s2.key}"]`);
    await pg.waitForSelector(".rvdet .flags");
    await pg.tap(`.rvsay[data-k="${s2.key}"] [data-q="Add more detail"]`);
    await pg.tap(`[data-send="${s2.key}"]`);
    await pg.waitForFunction(() => /waiting for the agent/.test(document.querySelector("#rvList").textContent));
    assert.equal(t.rt.kanban.get(s2.key).comments.at(-1).text, "Add more detail");
    assert.equal(t.rt.kanban.get(s2.key).comments.at(-1).by, "user");
    // filters
    await pg.tap('#rvChips [data-f="fb"]');
    assert.equal(await pg.$$eval("#rvList .rvstory", (r) => r.length), 1);
    await pg.tap('#rvChips [data-f="todo"]');
    assert.equal(await pg.$$eval("#rvList .rvstory", (r) => r.length), 2);
    // the whole feature at once
    await pg.tap('#rvChips [data-f="all"]');
    await pg.tap(`#rvList section[data-e] input[data-epic]`);
    await pg.waitForFunction(() => /2\/3 approved/.test(document.querySelector("#rvCount").textContent));
    assert.equal(t.rt.kanban.get(s2.key).status, "ready");
    // nothing wider than the phone
    assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await pg.tap("#rvClose");
    await pg.waitForFunction(() => !document.querySelector("#kbrv.on"));
    assert.deepEqual(errs, []);
  } finally { await br.close(); await srv.close(); await t.close(); }
});

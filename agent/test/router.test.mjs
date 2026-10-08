import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { dist } from "./helpers.mjs";

const { decide, scoreTask, turnActivity, ModelServer, RouterProvider } = await import(dist("providers/router.js"));

const u = (content) => ({ role: "user", content });
const a = (content = "") => ({ role: "assistant", content, tool_calls: [{ id: "1", name: "x", arguments: "{}" }] });
const t = (content) => ({ role: "tool", content, tool_call_id: "1" });
const base = { tokens: 1000, mode: "auto", current: null, dwellMs: 0, cfg: { min_dwell: 600, escalate_after: 8 }, ctx: { fast: 126976, strong: 40192 }, strongAvailable: true, hasStrong: true };

test("router policy: simple questions stay on the fast model", () => {
  assert.equal(decide({ ...base, messages: [u("what is the capital of France?")] }).tier, "fast");
  assert.equal(decide({ ...base, messages: [u("hi")] }).tier, "fast");
});
test("router policy: engineering requests go to the strong model", () => {
  assert.equal(decide({ ...base, messages: [u("refactor src/a/b.ts and src/c/d.ts to use the new parser")] }).tier, "strong");
  assert.equal(decide({ ...base, messages: [u("debug this:\n```js\nfoo()\n```")] }).tier, "strong");
  assert.ok(scoreTask("fix the failing test").score >= 2);
});
test("router policy: a long or failing turn escalates", () => {
  const long = [u("list the files"), ...Array.from({ length: 8 }, () => [a(), t("ok")]).flat()];
  assert.equal(decide({ ...base, messages: long }).tier, "strong");
  const failing = [u("run it"), a(), t("error: boom"), a(), t("Error: boom again")];
  assert.equal(decide({ ...base, messages: failing }).tier, "strong");
  assert.deepEqual(turnActivity(failing).errors, 2);
});
test("router policy: down-switch waits for the dwell time and the end of the turn", () => {
  const simple = [u("thanks")];
  assert.equal(decide({ ...base, current: "strong", dwellMs: 30_000, messages: simple }).tier, "strong");
  assert.equal(decide({ ...base, current: "strong", dwellMs: 700_000, messages: simple }).tier, "fast");
  assert.equal(decide({ ...base, current: "strong", dwellMs: 700_000, messages: [u("thanks"), a(), t("ok")] }).tier, "strong");
});
test("router policy: pinned modes, unavailable strong, and context that does not fit", () => {
  assert.equal(decide({ ...base, mode: "fast", messages: [u("refactor a/b.ts and c/d.ts")] }).tier, "fast");
  assert.equal(decide({ ...base, mode: "strong", messages: [u("hi")] }).tier, "strong");
  assert.equal(decide({ ...base, strongAvailable: false, messages: [u("refactor a/b.ts and c/d.ts")] }).tier, "fast");
  assert.equal(decide({ ...base, tokens: 60_000, messages: [u("refactor a/b.ts and c/d.ts")] }).tier, "fast");
  assert.equal(decide({ ...base, hasStrong: false, messages: [u("refactor a/b.ts and c/d.ts")] }).tier, "fast");
});

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });

test("router: ModelServer restarts the server to switch models, and RouterProvider routes requests", async () => {
  const port = await freePort();
  const fake = fileURLToPath(new URL("./fixtures/fake-llama-server.mjs", import.meta.url));
  const file = fileURLToPath(import.meta.url); // any existing file stands in for a GGUF
  const cfg = { enabled: true, mode: "auto", llama_server: fake, port, kv: "q8_0", threads: 1, min_dwell: 0, escalate_after: 8, start_timeout: 20,
    models: { fast: { name: "small", file }, strong: { name: "big", file } } };
  const srv = new ModelServer(() => cfg, mkdtempSync(join(tmpdir(), "router-")));
  const msgs = [];
  const inner = { id: "inner", model: "inner", contextWindow: 1000, async chat() { const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: "POST", body: "{}" }); const j = await r.json(); return { content: j.choices[0].message.content, toolCalls: [], usage: { input: 1, output: 1 }, finishReason: "stop", model: j.model }; } };
  const rp = new RouterProvider(inner, srv, () => cfg, (m) => msgs.push(m));
  const tools = [{ name: "x", description: "x", parameters: {} }];
  try {
    let r = await rp.chat({ messages: [u("hello there")], tools });
    assert.equal(r.content, "served by small");
    assert.equal(rp.contextWindow, 126976);
    r = await rp.chat({ messages: [u("refactor src/a/b.ts and src/c/d.ts")], tools });
    assert.equal(r.content, "served by big");
    assert.equal(rp.contextWindow, 40192);
    assert.ok(msgs.some((m) => /router → strong/.test(m)));
    r = await rp.chat({ messages: [u("thanks")], tools });
    assert.equal(r.content, "served by small");
  } finally { await srv.stop(); }
});

test("router policy: a caller can pin the tier (kanban workers and reviewers)", () => {
  assert.equal(decide({ ...base, pin: "strong", messages: [u("hi")] }).tier, "strong");
  assert.equal(decide({ ...base, pin: "fast", messages: [u("refactor src/a/b.ts and src/c/d.ts")] }).tier, "fast");
  assert.equal(decide({ ...base, pin: "strong", strongAvailable: false, messages: [u("hi")] }).tier, "fast");
});

test("router (resident): both models run at the same time on their own ports and requests go to the right one without a restart", async () => {
  const { DuoServer } = await import(dist("providers/router.js"));
  const [pf, ps] = [await freePort(), await freePort()];
  const fake = fileURLToPath(new URL("./fixtures/fake-llama-server.mjs", import.meta.url));
  const file = fileURLToPath(import.meta.url);
  const cfg = { enabled: true, resident: true, mode: "auto", llama_server: fake, port: ps, kv: "q8_0", threads: 1, min_dwell: 600, escalate_after: 8, start_timeout: 20,
    models: { fast: { name: "small", file, port: pf }, strong: { name: "big", file, port: ps } } };
  const srv = new DuoServer(() => cfg, mkdtempSync(join(tmpdir(), "duo-")));
  const msgs = [];
  const mk = (port) => ({ id: "i", model: "i", contextWindow: 1000, async chat() { const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: "POST", body: "{}" }); const j = await r.json(); return { content: j.choices[0].message.content, toolCalls: [], usage: { input: 0, output: 0 }, finishReason: "stop", model: j.model }; } });
  const inner = mk(ps);
  const rp = new RouterProvider(inner, srv, () => cfg, (m) => msgs.push(m), (tier, port) => mk(port));
  const tools = [{ name: "x", description: "x", parameters: {} }];
  try {
    await srv.ensureAll();
    assert.equal(srv.isUp("fast") && srv.isUp("strong"), true);                      // both resident at once
    assert.equal((await fetch(`http://127.0.0.1:${pf}/health`)).ok && (await fetch(`http://127.0.0.1:${ps}/health`)).ok, true);
    assert.equal(srv.ctx.fast, 126976); assert.equal(srv.ctx.strong, 40192);
    let r = await rp.chat({ messages: [u("hello there")], tools });
    assert.equal(r.content, "served by small");
    r = await rp.chat({ messages: [u("refactor src/a/b.ts and src/c/d.ts")], tools });
    assert.equal(r.content, "served by big");
    r = await rp.chat({ messages: [u("thanks")], tools });                            // goes straight back: no dwell, no restart
    assert.equal(r.content, "served by small");
    r = await rp.chat({ messages: [u("hello there")], tools, tier: "strong" });       // pinned by the caller
    assert.equal(r.content, "served by big");
    r = await rp.chat({ messages: [u("judge this")] });                               // aux call (no tools) uses the fast model
    assert.equal(r.content, "served by small");
    assert.equal(rp.resident, true);
  } finally { await srv.stop(); }
  assert.equal(srv.isUp("fast") || srv.isUp("strong"), false);
});

test("router (resident): a model that cannot start is reported and the other one still serves", async () => {
  const { DuoServer } = await import(dist("providers/router.js"));
  const pf = await freePort();
  const fake = fileURLToPath(new URL("./fixtures/fake-llama-server.mjs", import.meta.url));
  const file = fileURLToPath(import.meta.url);
  const cfg = { enabled: true, resident: true, mode: "auto", llama_server: fake, port: pf + 1000 > 65000 ? pf - 1000 : pf + 1000, kv: "q8_0", threads: 1, min_dwell: 600, escalate_after: 8, start_timeout: 5,
    models: { fast: { name: "small", file, port: pf }, strong: { name: "big", file: "/nonexistent/model.gguf" } } };
  const srv = new DuoServer(() => cfg, mkdtempSync(join(tmpdir(), "duo-")));
  const msgs = [];
  const rp = new RouterProvider({ id: "i", model: "i", contextWindow: 1, async chat() { throw new Error("unused"); } }, srv, () => cfg, (m) => msgs.push(m),
    (tier, port) => ({ id: "i", model: "i", contextWindow: 1000, async chat() { const j = await (await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: "POST", body: "{}" })).json(); return { content: j.choices[0].message.content, toolCalls: [], usage: { input: 0, output: 0 }, finishReason: "stop", model: "m" }; } }));
  try {
    await srv.ensureAll();
    assert.equal(srv.isUp("fast"), true); assert.equal(srv.isUp("strong"), false);
    assert.match(srv.errors.strong, /model file not found/);
    const r = await rp.chat({ messages: [u("refactor src/a/b.ts and src/c/d.ts")], tools: [{ name: "x", description: "x", parameters: {} }] });
    assert.equal(r.content, "served by small");                                        // wanted strong, got the fast one
  } finally { await srv.stop(); }
});

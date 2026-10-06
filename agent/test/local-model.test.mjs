// Local-model robustness: slow CPU prefill, model reloads, small-model paging, scripted resume.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setup, call, dist } from "./helpers.mjs";

const serve = (handler) => new Promise((resolve) => {
  // only chat calls reach the handler; the provider also asks a local server for its context size (GET /props)
  const srv = createServer((req, res) => { req.resume(); req.on("end", () => (req.url?.endsWith("/props") ? (res.writeHead(404), res.end()) : handler(req, res))); });
  srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/v1` }));
});
const okJson = (res, content) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] })); };

test("local model servers bypass fetch's 300 s header limit and honour request_timeout", async () => {
  const { OpenAIProvider, isLocalHttp } = await import(dist("providers/openai.js"));
  assert.equal(isLocalHttp("http://127.0.0.1:8080/v1"), true);
  assert.equal(isLocalHttp("http://192.168.1.20:11434/v1"), true);
  assert.equal(isLocalHttp("http://gpu-box.local:8000/v1"), true);
  assert.equal(isLocalHttp("https://api.openai.com/v1"), false);
  assert.equal(isLocalHttp("http://example.com/v1"), false);
  const { srv, url } = await serve((req, res) => setTimeout(() => okJson(res, "slow ok"), 300));
  try {
    const r = await new OpenAIProvider({ baseUrl: url, model: "m", timeoutMs: 5000 }).chat({ messages: [{ role: "user", content: "hi" }], stream: false });
    assert.equal(r.content, "slow ok");
    await assert.rejects(new OpenAIProvider({ baseUrl: url, model: "m", timeoutMs: 100 }).chat({ messages: [{ role: "user", content: "hi" }], stream: false }), /did not answer within/);
  } finally { srv.close(); }
});

test("a model that is still loading (503) is waited for, not failed", async () => {
  const { ResilientProvider, OpenAIProvider } = await import(dist("providers/index.js"));
  let n = 0;
  const { srv, url } = await serve((req, res) => {
    if (++n <= 2) { res.writeHead(503, { "content-type": "application/json", "retry-after": "0.05" }); return res.end('{"error":{"message":"Loading model","code":503}}'); }
    okJson(res, "loaded");
  });
  try {
    const p = new ResilientProvider([new OpenAIProvider({ baseUrl: url, model: "m" })], 0);
    const r = await p.chat({ messages: [{ role: "user", content: "hi" }], stream: false });
    assert.equal(r.content, "loaded"); assert.equal(n, 3);
  } finally { srv.close(); }
});

test("read_file pages within the slm output budget instead of being middle-truncated", async () => {
  const t = await setup("agent:\n  tool_profile: slm\n");
  try {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i + 1}: ${"x".repeat(40)}`);
    writeFileSync(join(t.work, "big.md"), lines.join("\n"));
    t.mock.script([{ tool_calls: [call("read_file", { path: "big.md" })] }, { content: "done" }]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "read it");
    const out = [...t.rt.db.getMessages(s.id)].find((m) => m.role === "tool").content;
    assert.ok(out.length <= 4000, `fits the budget (${out.length})`);
    assert.doesNotMatch(out, /omitted; full output saved/, "not middle-truncated");
    assert.match(out, /^\s*1\| line 1:/m);
    const next = Number(out.match(/offset=(\d+)/)[1]);
    assert.match(out, new RegExp(`^\\s*${next - 1}\\| line ${next - 1}:`, "m"), "ends on the line before the offset it suggests");
  } finally { await t.close(); }
});

test("-q with --resume continues the same session", async () => {
  const { url, srv } = await serve((req, res) => okJson(res, "ack"));
  const home = mkdtempSync(join(tmpdir(), "stitap-home-"));
  writeFileSync(join(home, "config.yaml"), `model:\n  provider: openai\n  base_url: ${url}\n  name: mock\n  tool_mode: native\ncurator:\n  enabled: false\n`);
  const bin = new URL("../bin/harness.mjs", import.meta.url).pathname;
  const env = { ...process.env, STITAP_HOME: home };
  const run = (...a) => new Promise((resolve) => {
    const c = spawn(process.execPath, [bin, ...a], { env }); let out = "";
    c.stdout.on("data", (d) => (out += d)); c.on("close", (code) => resolve({ code, out }));
  });
  try {
    const first = JSON.parse((await run("-q", "first message", "--json")).out.trim().split("\n").pop());
    const second = JSON.parse((await run("-q", "second message", "--resume", first.session, "--json")).out.trim().split("\n").pop());
    assert.equal(second.session, first.session, "same session");
    const bad = await run("-q", "x", "--resume", "s_does_not_exist");
    assert.equal(bad.code, 2);
  } finally { srv.close(); }
});

test("re-reading an unchanged file in the same task gets a 'make the change now' nudge", async () => {
  const t = await setup("agent:\n  tool_profile: slm\n");
  try {
    writeFileSync(join(t.work, "a.css"), ".a { color: red; }\n");
    t.mock.script([
      { tool_calls: [call("read_file", { path: "a.css" })] },
      { tool_calls: [call("read_file", { path: "a.css" })] },
      { tool_calls: [call("write_file", { path: "a.css", content: ".a { color: blue; }\n" })] },
      { tool_calls: [call("read_file", { path: "a.css" })] },
      { content: "done" },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "fix a.css");
    const reads = [...t.rt.db.getMessages(s.id)].filter((m) => m.role === "tool" && m.name === "read_file").map((m) => m.content);
    assert.doesNotMatch(reads[0], /already read this part/);
    assert.match(reads[1], /already read this part of a\.css/);
    assert.doesNotMatch(reads[2], /already read this part/, "a write resets the guard");
  } finally { await t.close(); }
});

test("compression keeps a token-budgeted tail so a small window does not re-compress every turn", async () => {
  const t = await setup("", {});
  try {
    t.rt.cfg.data.model.context_window = 12288;
    t.mock.script([{ match: "Conversation to summarize", content: "summary of earlier work", sticky: true }]);
    const { compressSession, estimateMessages } = await import(dist("loop/compression.js"));
    const s = t.rt.createSession({ source: "cli" });
    t.rt.db.addMessage(s.id, { role: "user", content: "build the design system" });
    for (let i = 0; i < 10; i++) {
      t.rt.db.addMessage(s.id, { role: "assistant", content: null, tool_calls: [{ id: `c${i}`, name: "read_file", arguments: `{"path":"f${i}.css"}` }] });
      t.rt.db.addMessage(s.id, { role: "tool", tool_call_id: `c${i}`, name: "read_file", content: "x".repeat(4000) });
    }
    const r = await compressSession(t.rt, s.id, {});
    assert.ok(r.ok);
    const after = estimateMessages(t.rt.db.getMessages(s.id));
    assert.ok(after < 12288 * 0.4, `after compression ~${after} tokens stays well under the 60% threshold`);
    const msgs = t.rt.db.getMessages(s.id);
    const firstTail = msgs.findIndex((m) => m.meta?.copied_from);
    assert.notEqual(msgs[firstTail]?.role, "tool", "tail never starts with an orphaned tool result");
  } finally { await t.close(); }
});

test("llama.cpp's context overflow message is classified as context_length (so the loop compresses and retries)", async () => {
  const { classifyHttpError } = await import(dist("providers/types.js"));
  const body = '{"error":{"code":400,"message":"request (12488 tokens) exceeds the available context size (12288 tokens), try increasing it","type":"exceed_context_size_error"}}';
  assert.equal(classifyHttpError(400, body).kind, "context_length");
});

test("an invalid tool call (llama.cpp 500 parse error) is fed back to the model instead of ending the turn", async () => {
  let n = 0; const seen = [];
  const { srv, url } = await serve((req, res) => {
    n++;
    if (n === 1) { res.writeHead(500, { "content-type": "application/json" }); return res.end('{"error":{"code":500,"message":"Failed to parse tool call arguments as JSON: [json.exception.parse_error.101] parse error at line 1, column 90: syntax error while parsing value - invalid string: missing closing quote"}}'); }
    okJson(res, "fixed it");
  });
  const t = await setup();
  try {
    t.rt.cfg.data.model.base_url = url; t.rt.cfg.data.model.tool_mode = "native";
    t.rt.cfg.data.model.name = "m"; t.rt.cfg.data.agent.stream = false;
    t.rt.resetProviders();
    const s = t.rt.createSession({ source: "cli" });
    const r = await t.rt.send(s.id, "write the css");
    const msgs = t.rt.db.getMessages(s.id);
    assert.ok(msgs.some((m) => m.meta?.tool_call_repair && /unescaped double quote/.test(m.content)), "repair hint added");
    assert.equal(r.final ?? msgs.at(-1).content, "fixed it");
    void seen;
  } finally { await t.close(); srv.close(); }
});

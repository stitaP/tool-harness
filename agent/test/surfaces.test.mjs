/** Surfaces: HTTP API + SSE, OpenAI-compatible endpoint, MCP server↔client, gateway, CLI. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setup, call, dist } from "./helpers.mjs";
import { startMockLLM } from "./mock-llm.mjs";

const BIN = fileURLToPath(new URL("../bin/harness.mjs", import.meta.url));

test("HTTP API: token required, session lifecycle, SSE events, slash commands", async () => {
  const t = await setup();
  const { startServer } = await import(dist("index.js"));
  const srv = await startServer(t.rt, { port: 0 });
  try {
    const H = { "content-type": "application/json", "x-stitap-token": srv.token };
    assert.equal((await fetch(`${srv.url}/api/sessions`)).status, 401);
    const { request } = await import("node:http");
    const status = await new Promise((res) => { const u = new URL(srv.url); const rq = request({ host: u.hostname, port: u.port, path: "/api/health", headers: { host: "evil.example" } }, (r) => { r.resume(); res(r.statusCode); }); rq.end(); });
    assert.equal(status, 403, "DNS-rebinding guard rejects foreign Host headers");
    const html = await (await fetch(`${srv.url}/`)).text();
    assert.ok(html.includes(srv.token), "UI gets the token injected");
    const { id } = await (await fetch(`${srv.url}/api/sessions`, { method: "POST", headers: H, body: "{}" })).json();
    // listen to SSE
    const ctrl = new AbortController();
    const evRes = await fetch(`${srv.url}/api/events?session=${id}&token=${srv.token}`, { signal: ctrl.signal });
    const reader = evRes.body.getReader();
    const seen = [];
    const pump = (async () => { const dec = new TextDecoder(); let buf = ""; try { for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); for (const m of buf.matchAll(/data: (\{.*\})\n/g)) seen.push(JSON.parse(m[1]).type); buf = buf.slice(buf.lastIndexOf("\n\n") + 2); } } catch { /* aborted */ } })();
    t.mock.script([{ tool_calls: [call("terminal", { command: "echo api-ok" })] }, { content: "API works" }]);
    const r = await fetch(`${srv.url}/api/sessions/${id}/messages`, { method: "POST", headers: H, body: JSON.stringify({ text: "run echo" }) });
    assert.equal(r.status, 202);
    await t.rt.waitIdle(id);
    await new Promise((res) => setTimeout(res, 300));
    const detail = await (await fetch(`${srv.url}/api/sessions/${id}`, { headers: H })).json();
    assert.equal(detail.messages.at(-1).content, "API works");
    assert.ok(seen.includes("tool_start") && seen.includes("turn_end") && seen.includes("token"), `SSE events: ${seen.join(",")}`);
    const cmd = await (await fetch(`${srv.url}/api/sessions/${id}/messages`, { method: "POST", headers: H, body: JSON.stringify({ text: "/status" }) })).json();
    assert.equal(cmd.command, true); assert.match(cmd.text, /Session/);
    ctrl.abort(); await pump;
  } finally { await srv.close(); await t.close(); }
});

test("OpenAI-compatible /v1/chat/completions (stream and non-stream)", async () => {
  const t = await setup();
  const { startServer } = await import(dist("index.js"));
  const srv = await startServer(t.rt, { port: 0 });
  try {
    const H = { "content-type": "application/json", authorization: `Bearer ${srv.token}` };
    const models = await (await fetch(`${srv.url}/v1/models`, { headers: H })).json();
    assert.equal(models.data[0].id, "stitap-agent");
    t.mock.script([{ content: "Paris." }]);
    const j = await (await fetch(`${srv.url}/v1/chat/completions`, { method: "POST", headers: H, body: JSON.stringify({ model: "stitap-agent", messages: [{ role: "user", content: "Capital of France?" }] }) })).json();
    assert.equal(j.choices[0].message.content, "Paris.");
    t.mock.script([{ content: "Streaming works fine." }]);
    const res = await fetch(`${srv.url}/v1/chat/completions`, { method: "POST", headers: { ...H, "x-session-id": "client-1" }, body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "hi" }] }) });
    const text = await res.text();
    const content = [...text.matchAll(/^data: (\{.*\})$/gm)].map((m) => JSON.parse(m[1]).choices[0]?.delta?.content ?? "").join("");
    assert.equal(content, "Streaming works fine.");
    assert.ok(text.includes("[DONE]"));
    assert.ok(t.rt.db.getMeta("api_session:client-1"), "keyed sessions persist");
  } finally { await srv.close(); await t.close(); }
});

test("MCP: `harness mcp serve` is consumable by the harness MCP client", async () => {
  const mock = await startMockLLM();
  const serverHome = mkdtempSync(join(tmpdir(), "stitap-mcps-"));
  writeFileSync(join(serverHome, "config.yaml"), `model:\n  provider: openai\n  base_url: ${mock.url}\n  name: mock\nmcp_serve:\n  toolsets: [files, store]\n`);
  writeFileSync(join(serverHome, "hello.txt"), "from the mcp server\n");
  const t = await setup(`mcp_servers:\n  me:\n    command: ${JSON.stringify(process.execPath)}\n    args: [${JSON.stringify(BIN)}, "mcp", "serve"]\n    env:\n      STITAP_HOME: ${JSON.stringify(serverHome)}\n    cwd: ${JSON.stringify(serverHome)}\n`);
  try {
    assert.match(t.rt.mcp.summary(), /me: ready — \d+ tools/);
    const names = t.rt.tools.all().filter((x) => x.toolset === "mcp:me").map((x) => x.name);
    assert.ok(names.includes("mcp__me__read_file"));
    assert.ok(names.includes("mcp__me__store_search"));
    t.rt.cfg.set("model.context_window", 131072); t.rt.resetProviders();   // a window this size keeps every tool in the schema (no tool planner)
    t.mock.script([{ tool_calls: [call("mcp__me__read_file", { path: join(serverHome, "hello.txt") })] }, { content: "read via MCP" }]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "read through mcp");
    assert.match(t.rt.db.getMessages(s.id).find((m) => m.role === "tool").content, /from the mcp server/);
  } finally { await t.close(); await mock.close(); }
});

test("gateway: pairing for unknown users, chat→session mapping, replies delivered", async () => {
  const t = await setup("gateway:\n  telegram:\n    enabled: false\n    allowed_users: [\"alice\"]\n");
  const { GatewayManager, approvePairing } = await import(dist("gateway/manager.js"));
  const sent = [];
  const fake = { platform: "telegram", maxLen: 4000, async start(fn) { this.fn = fn; }, async send(chat, text) { sent.push({ chat, text }); }, async stop() {} };
  const gw = new GatewayManager(t.rt);
  await fake.start((m) => gw.inbound(m));
  gw.adapters.set("telegram", fake);
  try {
    await gw.inbound({ platform: "telegram", chatId: "c2", userId: "99", userName: "mallory", text: "hi", isDM: true });
    assert.match(sent.at(-1).text, /harness pairing approve (\w+)/);
    const code = /pairing approve (\w+)/.exec(sent.at(-1).text)[1];
    assert.match(approvePairing(t.rt, code), /Approved mallory/);
    t.mock.script([{ content: "Hello from the agent" }]);
    await gw.inbound({ platform: "telegram", chatId: "c1", userId: "1", userName: "alice", text: "hello", isDM: true });
    const sid = t.rt.db.getMeta("gw:telegram:c1");
    await t.rt.waitIdle(sid);
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(sent.at(-1), { chat: "c1", text: "Hello from the agent" });
    await gw.inbound({ platform: "telegram", chatId: "c1", userId: "1", userName: "alice", text: "/status", isDM: true });
    assert.match(sent.at(-1).text, /Session/);
    await t.rt.deliver("telegram:c1", "cron says hi");
    assert.equal(sent.at(-1).text, "cron says hi");
  } finally { await t.close(); }
});

test("CLI: one-shot mode, --json, config set/get, sessions list", async () => {
  const mock = await startMockLLM();
  const home = mkdtempSync(join(tmpdir(), "stitap-cli-"));
  writeFileSync(join(home, "config.yaml"), `model:\n  provider: openai\n  base_url: ${mock.url}\n  name: mock\ncurator:\n  enabled: false\n`);
  const env = { ...process.env, STITAP_HOME: home, NO_COLOR: "1" };
  try {
    mock.script([{ tool_calls: [call("terminal", { command: "echo cli-works" })] }, { content: "The command printed cli-works." }]);
    const run = (args) => new Promise((res) => { const p = spawn(process.execPath, [BIN, ...args], { env, cwd: home }); let out = "", err = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d)); p.on("close", (code) => res({ code, out, err })); });
    const r = await run(["--json", "-q", "run echo"]);
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(r.out.trim().split("\n").at(-1));
    assert.equal(j.final, "The command printed cli-works.");
    assert.equal(j.tool_calls, 1);
    const set = spawnSync(process.execPath, [BIN, "config", "set", "agent.max_iterations", "42"], { env, encoding: "utf8" });
    assert.equal(set.status, 0, set.stderr);
    const get = spawnSync(process.execPath, [BIN, "config", "get", "agent.max_iterations"], { env, encoding: "utf8" });
    assert.equal(get.stdout.trim(), "42");
    const ls = spawnSync(process.execPath, [BIN, "sessions"], { env, encoding: "utf8" });
    assert.match(ls.stdout, /\[cli\]/);
    const help = spawnSync(process.execPath, [BIN, "--help"], { env, encoding: "utf8" });
    assert.match(help.stdout, /harness serve/);
  } finally { await mock.close(); }
});

test("browser tools drive a real page (skipped when Playwright/Chromium is absent)", async (tt) => {
  const exe = process.env.STITAP_CHROMIUM || "/opt/pw-browsers/chromium";
  const { existsSync } = await import("node:fs");
  const t = await setup(`browser:\n  executable_path: ${JSON.stringify(exe)}\n`);
  try {
    if (t.rt.tools.get("browser_navigate").available(t.rt) !== true || !existsSync(exe)) { tt.skip("playwright or chromium not installed"); return; }
    const { createServer } = await import("node:http");
    const site = createServer((req, res) => { res.setHeader("content-type", "text/html"); res.end(req.url === "/next" ? "<h1>Second page</h1>" : '<title>Demo</title><h1>Welcome</h1><a href="/next">Continue</a>'); });
    await new Promise((r) => site.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${site.address().port}/`;
    t.mock.script([
      { tool_calls: [call("browser_navigate", { url })] },
      { tool_calls: [call("browser_click", { text: "Continue" })] },
      { content: "navigated" },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "browse");
    const outs = t.rt.db.getMessages(s.id).filter((m) => m.role === "tool").map((m) => m.content);
    assert.match(outs[0], /Title: Demo[\s\S]*\[1\] a "Continue"/);
    assert.match(outs[1], /Second page/);
    site.close();
  } finally { await t.close(); }
});

test("settings API: typed settings, tool states, agents", async () => {
  const t = await setup();
  const { startServer } = await import(dist("index.js"));
  const srv = await startServer(t.rt, { port: 0 });
  try {
    const H = { "content-type": "application/json", "x-stitap-token": srv.token };
    const post = (p, b) => fetch(srv.url + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
    const get = (p) => fetch(srv.url + p, { headers: H }).then((r) => r.json());
    const s = await post("/api/settings", { "terminal.timeout": 300, "web.docs_domains": "docs.example.com\nexample.org/docs", "approvals.mode": "sometimes", "nope.key": 1 });
    assert.deepEqual(s.changed.sort(), ["terminal.timeout", "web.docs_domains"]);
    assert.equal(s.errors.length, 2);
    assert.deepEqual(t.rt.cfg.data.web.docs_domains, ["docs.example.com", "example.org/docs"]);
    assert.equal((await get("/api/settings"))["terminal.timeout"], 300);
    // tool states move a tool between tools.enabled / deferred / disabled
    assert.equal((await post("/api/tools/state", { name: "web_search", state: "off" })).state, "off");
    assert.ok(t.rt.cfg.data.tools.disabled.includes("web_search"));
    await post("/api/tools/state", { name: "web_search", state: "on_demand" });
    assert.ok(!t.rt.cfg.data.tools.disabled.includes("web_search") && t.rt.cfg.data.tools.deferred.includes("web_search"));
    const tools = await get("/api/tools");
    assert.equal(tools.find((x) => x.name === "web_search").state, "on_demand");
    assert.ok(tools.every((x) => x.description && x.toolset));
    // agents
    assert.equal((await post("/api/agents", { name: "bad name" })).status, 400);
    assert.equal((await post("/api/agents", { name: "r", tools: ["no_such_tool"] })).status, 400);
    await post("/api/agents", { name: "r", description: "reviewer", tools: ["read_file"], model: { temperature: "0.1" } });
    assert.deepEqual(t.rt.cfg.data.agents.r, { description: "reviewer", tools: ["read_file"], model: { temperature: 0.1 } });
    const { id } = await post("/api/sessions", { agent: "r" });
    assert.equal(t.rt.db.getSession(id).meta.agent, "r");
  } finally { await srv.close(); await t.close(); }
});

test("working folders: default for new chats, per-chat change updates the prompt, browse and mkdir", async () => {
  const t = await setup();
  const { startServer } = await import(dist("index.js"));
  const srv = await startServer(t.rt, { port: 0 });
  try {
    const H = { "content-type": "application/json", "x-stitap-token": srv.token };
    const post = (p, b) => fetch(srv.url + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
    const get = (p) => fetch(srv.url + p, { headers: H }).then((r) => r.json());
    const proj = join(t.work, "proj");
    assert.equal((await post("/api/fs/mkdir", { path: proj })).path, proj);
    assert.ok((await get(`/api/fs/dirs?path=${encodeURIComponent(t.work)}`)).dirs.includes("proj"));
    assert.equal((await post("/api/folders/default", { path: join(t.work, "missing") })).status, 400);
    assert.equal((await post("/api/folders/default", { path: proj })).default, proj);
    const { id } = await post("/api/sessions", {});
    assert.equal(t.rt.sessionCwd(id), proj, "new chats start in the default folder");
    t.rt.ensureSystemPrompt(id);
    const other = join(t.work, "other"); await post("/api/fs/mkdir", { path: other });
    assert.equal((await post(`/api/sessions/${id}/cwd`, { path: other })).cwd, other);
    assert.match(t.rt.db.getSession(id).system_prompt, new RegExp(`Working directory at session start: ${other.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.deepEqual((await get("/api/folders")).recent.slice(0, 2), [other, proj]);
  } finally { await srv.close(); await t.close(); }
});

test("HTTP API: archive / restore / delete chats; stats count a chat's sub-chats and cached tokens", async () => {
  const t = await setup();
  const { startServer } = await import(dist("index.js"));
  const srv = await startServer(t.rt, { port: 0 });
  try {
    const H = { "content-type": "application/json", "x-stitap-token": srv.token };
    const get = async (p) => (await fetch(`${srv.url}${p}`, { headers: H })).json();
    const parent = t.rt.createSession({ source: "web", title: "parent" });
    const child = t.rt.createSession({ source: "pipeline", title: "pipeline: phase-01", parent_id: parent.id });
    const other = t.rt.createSession({ source: "web", title: "other" });
    t.rt.db.addUsage({ session_id: parent.id, model: "m", input_tokens: 1000, output_tokens: 10, cached_tokens: 900, kind: "main" });
    t.rt.db.addUsage({ session_id: child.id, model: "m", input_tokens: 5000, output_tokens: 50, cached_tokens: 4000, kind: "main" });
    t.rt.db.addUsage({ session_id: other.id, model: "m", input_tokens: 7, output_tokens: 1, kind: "main" });
    const st = await get(`/api/stats?session=${parent.id}`);
    assert.deepEqual([st.session.calls, st.session.input, st.session.output, st.session.cached, st.session.chats], [2, 6000, 60, 4900, 2]);

    await fetch(`${srv.url}/api/sessions/${other.id}/archive`, { method: "POST", headers: H, body: JSON.stringify({ archived: true }) });
    assert.ok(!(await get("/api/sessions")).some((s) => s.id === other.id), "archived chats leave the list");
    assert.deepEqual((await get("/api/sessions?archived=1")).map((s) => s.id), [other.id]);
    await fetch(`${srv.url}/api/sessions/${other.id}/archive`, { method: "POST", headers: H, body: JSON.stringify({ archived: false }) });
    assert.ok((await get("/api/sessions")).some((s) => s.id === other.id), "restored");

    assert.equal((await fetch(`${srv.url}/api/sessions/${parent.id}`, { method: "DELETE", headers: H })).status, 200);
    assert.equal(t.rt.db.getSession(parent.id), null);
    assert.equal(t.rt.db.getSession(child.id), null, "sub-chats go with it");
    assert.ok(t.rt.db.getSession(other.id));
  } finally { await srv.close(); await t.close(); }
});

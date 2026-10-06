/**
 * End-to-end behaviour of the agent runtime against a scripted OpenAI-compatible
 * mock model — real tools, real shell, real SQLite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setup, call, dist } from "./helpers.mjs";

const lastAssistant = (rt, sid) => [...rt.db.getMessages(sid)].reverse().find((m) => m.role === "assistant" && !m.tool_calls?.length);

/** Provider-agnostic structural invariant: every tool_call has a result, no assistant→assistant. */
function assertValidHistory(rt, sid) {
  const msgs = rt.db.getMessages(sid);
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === "assistant" && m.tool_calls?.length) {
      const ids = new Set(m.tool_calls.map((c) => c.id));
      let j = i + 1;
      while (j < msgs.length && msgs[j].role === "tool") { ids.delete(msgs[j].tool_call_id); j++; }
      assert.equal(ids.size, 0, `tool calls without results at message ${i}`);
    }
    if (i > 0) assert.ok(!(m.role === "assistant" && msgs[i - 1].role === "assistant"), `two assistant messages in a row at ${i}`);
  }
}

test("multi-step task: plan, write file, run it, answer", async () => {
  const t = await setup();
  try {
    t.mock.script([
      { tool_calls: [call("todo_list", { action: "write", todos: [{ content: "write", status: "in_progress" }, { content: "run", status: "pending" }] })] },
      { tool_calls: [call("write_file", { path: "hello.js", content: "console.log(6*7)" })] },
      { tool_calls: [call("terminal", { command: `"${process.execPath}" hello.js` })] },
      { content: "The script printed 42." },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    const r = await t.rt.send(s.id, "write and run a script");
    assert.equal(r.final, "The script printed 42.");
    assert.equal(r.toolCalls, 3);
    const toolMsgs = t.rt.db.getMessages(s.id).filter((m) => m.role === "tool");
    assert.match(toolMsgs[2].content, /exit code: 0\n42/);
    assert.ok(existsSync(join(t.work, "hello.js")));
    assert.ok(t.events.some((e) => e.type === "todo"));
    assert.ok(t.events.some((e) => e.type === "token"));
    // native tool schema was sent to the model
    assert.ok(t.mock.requests[0].tools.some((x) => x.function.name === "terminal"));
    assertValidHistory(t.rt, s.id);
  } finally { await t.close(); }
});

test("terminal: cwd persists across calls", async () => {
  const t = await setup();
  try {
    mkdirSync(join(t.work, "sub"));
    t.mock.script([
      { tool_calls: [call("terminal", { command: "cd sub" })] },
      { tool_calls: [call("terminal", { command: "pwd" })] },
      { content: "done" },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "go");
    const outs = t.rt.db.getMessages(s.id).filter((m) => m.role === "tool");
    assert.match(outs[1].content, /\/sub\b/);
    assert.match(t.rt.sessionCwd(s.id), /sub$/);
  } finally { await t.close(); }
});

test("models without tool support fall back to the ReAct text protocol", async () => {
  const t = await setup("", { toolsUnsupported: true });
  try {
    t.mock.script([
      { content: 'Thought: list files\nAction: list_dir\nAction Input: {"path": "."}' },
      { content: "Thought: I know\nFinal Answer: The folder is empty." },
    ]);
    writeFileSync(join(t.work, "a.txt"), "x");
    const s = t.rt.createSession({ source: "cli" });
    const r = await t.rt.send(s.id, "what's here?");
    assert.equal(r.final, "The folder is empty.");
    assert.equal(r.toolCalls, 1);
    const reqs = t.mock.requests.filter((q) => !q.tools);
    assert.ok(reqs.some((q) => /Action Input/.test(q.messages[0].content)), "ReAct instructions were added to the system prompt");
    assert.ok(reqs.some((q) => q.messages.some((m) => /Observation \(list_dir\)/.test(m.content ?? ""))));
  } finally { await t.close(); }
});

test("misspelled tool names and sloppy JSON are repaired", async () => {
  const t = await setup();
  try {
    writeFileSync(join(t.work, "notes.txt"), "alpha\nbeta\n");
    t.mock.script([
      { tool_calls: [{ name: "readFile", arguments: "{'path': 'notes.txt',}" }] },
      { content: "ok" },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "read");
    const tool = t.rt.db.getMessages(s.id).find((m) => m.role === "tool");
    assert.match(tool.content, /1\| alpha/);
  } finally { await t.close(); }
});

test("approvals: dangerous commands are blocked when headless, run with yolo", async () => {
  const t = await setup();
  try {
    writeFileSync(join(t.work, "victim.txt"), "x");
    t.mock.script([{ tool_calls: [call("terminal", { command: "rm -rf victim.txt" })] }, { content: "tried" }]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "delete", { approvalMode: "deny" });
    assert.match(t.rt.db.getMessages(s.id).find((m) => m.role === "tool").content, /BLOCKED/);
    assert.ok(existsSync(join(t.work, "victim.txt")));
    t.mock.script([{ tool_calls: [call("terminal", { command: "rm -rf victim.txt" })] }, { content: "deleted" }]);
    t.rt.approvals.yoloSessions.add(s.id);
    await t.rt.send(s.id, "delete again");
    assert.ok(!existsSync(join(t.work, "victim.txt")));
  } finally { await t.close(); }
});

test("approvals: interactive approve via the approval manager", async () => {
  const t = await setup();
  try {
    t.mock.script([{ tool_calls: [call("terminal", { command: "sudo echo hi || echo fallback" })] }, { content: "ok" }]);
    const s = t.rt.createSession({ source: "web" });
    t.rt.on("event", (e) => { if (e.type === "approval_request") setTimeout(() => t.rt.approvals.respond(e.id, "session"), 50); });
    await t.rt.send(s.id, "go");
    const out = t.rt.db.getMessages(s.id).find((m) => m.role === "tool").content;
    assert.doesNotMatch(out, /BLOCKED/);
  } finally { await t.close(); }
});

test("interrupt stops a running command and leaves a valid history", async () => {
  const t = await setup();
  try {
    t.mock.script([{ tool_calls: [call("terminal", { command: `"${process.execPath}" -e "setTimeout(()=>{},20000)"` })] }, { content: "never" }]);
    const s = t.rt.createSession({ source: "cli" });
    const p = t.rt.send(s.id, "sleep");
    await new Promise((r) => setTimeout(r, 800));
    t.rt.interrupt(s.id);
    const r = await p;
    assert.equal(r.interrupted, true);
    assertValidHistory(t.rt, s.id);
    // next turn still works
    t.mock.reset();
    t.mock.script([{ content: "back" }]);
    const r2 = await t.rt.send(s.id, "hello");
    assert.equal(r2.final, "back");
  } finally { await t.close(); }
});

test("steer: a message sent mid-turn reaches the model in the next tool result", async () => {
  const t = await setup();
  try {
    t.mock.script([
      { tool_calls: [call("terminal", { command: `"${process.execPath}" -e "setTimeout(()=>{},1200)"` })] },
      { content: "adjusted" },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    const p = t.rt.send(s.id, "work");
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(t.rt.steer(s.id, "use port 9000 instead"), "steered");
    await p;
    const tool = t.rt.db.getMessages(s.id).find((m) => m.role === "tool");
    assert.match(tool.content, /use port 9000 instead/);
  } finally { await t.close(); }
});

test("context compression keeps working when the window fills up", async () => {
  const t = await setup("compression:\n  keep_last: 4\n  threshold: 0.6\n".replace("compression:", "compression:"), {});
  try {
    t.rt.cfg.data.model.context_window = 3000;
    const s = t.rt.createSession({ source: "cli" });
    for (let i = 0; i < 6; i++) {
      t.mock.script([{ content: `answer ${i} ` + "x".repeat(1500) }]);
      await t.rt.send(s.id, `question ${i} ` + "y".repeat(1500));
    }
    const all = t.rt.db.getMessages(s.id);
    assert.ok(all.some((m) => m.meta?.compression_summary), "a summary message exists");
    assert.ok(t.rt.db.getMessages(s.id, { includeArchived: true }).length > all.length, "originals archived, not deleted");
    assertValidHistory(t.rt, s.id);
  } finally { await t.close(); }
});

test("/goal: keeps working across turns until the judge says done", async () => {
  const t = await setup();
  try {
    t.mock.script([
      { match: "completion judge", content: '{"done": false, "impossible": false, "reason": "tests not run yet"}' },
      { match: "completion judge", content: '{"done": true, "impossible": false, "reason": "tests pass"}' },
      { content: "Step 1 done." },
      { content: "All tests pass (3 passed)." },
    ]);
    const { runCommand } = await import(dist("runtime/commands.js"));
    const s = t.rt.createSession({ source: "cli" });
    const r = await runCommand("/goal make the tests pass", { rt: t.rt, sid: s.id, source: "cli" });
    assert.ok(r.send);
    await t.rt.send(s.id, r.send);
    await t.rt.waitIdle(s.id);
    const g = t.rt.db.getMeta(`goal:${s.id}`);
    assert.equal(g.status, "done");
    assert.equal(g.turns, 2);
    const users = t.rt.db.getMessages(s.id).filter((m) => m.role === "user");
    assert.match(users[1].content, /Goal continuation 1\/20[\s\S]*tests not run yet/);
    assert.equal(lastAssistant(t.rt, s.id).content, "All tests pass (3 passed).");
  } finally { await t.close(); }
});

test("goal pauses at the turn budget", async () => {
  const t = await setup("goals:\n  max_turns: 2\n");
  try {
    t.mock.script([{ match: "completion judge", sticky: true, content: '{"done": false, "reason": "nope"}' }]);
    const s = t.rt.createSession({ source: "cli" });
    t.rt.db.setMeta(`goal:${s.id}`, { text: "impossible", status: "active", turns: 0, max_turns: 2, created_at: Date.now() });
    await t.rt.send(s.id, "start");
    await t.rt.waitIdle(s.id);
    const g = t.rt.db.getMeta(`goal:${s.id}`);
    assert.equal(g.status, "paused");
    assert.match(g.last_reason, /turn budget/);
  } finally { await t.close(); }
});

test("memory persists into the next session's system prompt; session_search recalls past chats", async () => {
  const t = await setup();
  try {
    t.mock.script([{ tool_calls: [call("memory", { action: "add", target: "user", content: "Prefers metric units and Python" })] }, { content: "Noted, the project codename is BLUEFIN." }]);
    const s1 = t.rt.createSession({ source: "cli" });
    await t.rt.send(s1.id, "remember I like metric");
    const s2 = t.rt.createSession({ source: "cli" });
    const sys = t.rt.ensureSystemPrompt(s2.id).system_prompt;
    assert.match(sys, /Prefers metric units and Python/);
    t.mock.script([{ tool_calls: [call("session_search", { query: "codename" })] }, { content: "It was BLUEFIN." }]);
    await t.rt.send(s2.id, "what was the codename?");
    const res = t.rt.db.getMessages(s2.id).find((m) => m.role === "tool").content;
    assert.match(res, /BLUEFIN/);
  } finally { await t.close(); }
});

test("skills: bundled index in prompt, create via tool, invoke via /skill-name", async () => {
  const t = await setup();
  try {
    const names = t.rt.skills.list().map((s) => s.name);
    assert.ok(names.includes("systematic-debugging"));
    assert.ok(t.rt.skills.list().every((s) => s.description.length > 20), "every bundled skill has a description");
    t.mock.script([{ tool_calls: [call("skill_manage", { action: "create", name: "deploy-widget", description: "Deploy the widget service. Use when asked to ship widget.", content: "1. build\n2. ship" })] }, { content: "saved" }]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "save a skill");
    assert.ok(t.rt.skills.get("deploy-widget"));
    const { runCommand } = await import(dist("runtime/commands.js"));
    const r = await runCommand("/deploy-widget to staging", { rt: t.rt, sid: s.id, source: "cli" });
    assert.match(r.send, /deploy-widget[\s\S]*to staging/);
    assert.match(t.rt.skills.view("deploy-widget"), /2\. ship/);
  } finally { await t.close(); }
});

test("delegate_task runs subagents in parallel with isolated sessions", async () => {
  const t = await setup();
  try {
    t.mock.script([
      { tool_calls: [call("delegate_task", { tasks: [{ goal: "task A" }, { goal: "task B" }], context: "be brief" })] },
      { content: "child result" },
      { content: "child result" },
      { content: "Both subtasks finished." },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    const r = await t.rt.send(s.id, "split the work");
    assert.equal(r.final, "Both subtasks finished.");
    const tool = t.rt.db.getMessages(s.id).find((m) => m.role === "tool");
    assert.match(tool.content, /Task 1: task A[\s\S]*Task 2: task B/);
    const kids = t.rt.db.listSessions({ includeChildren: true, source: "subagent" });
    assert.equal(kids.length, 2);
    assert.ok(kids.every((k) => k.parent_id === s.id));
  } finally { await t.close(); }
});

test("execute_code: script calls harness tools over local RPC", async () => {
  const t = await setup();
  try {
    writeFileSync(join(t.work, "data.txt"), "one\ntwo\nthree\n");
    const code = `import { tools } from "./stitap_tools.mjs";\nconst r = await tools.read_file({ path: "data.txt" });\nconsole.log("LINES", r.split("\\n").length);`;
    t.mock.script([{ tool_calls: [call("execute_code", { language: "javascript", code })] }, { content: "counted" }]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "count lines");
    const out = t.rt.db.getMessages(s.id).find((m) => m.role === "tool").content;
    assert.match(out, /exit code: 0[\s\S]*LINES \d+/);
  } finally { await t.close(); }
});

test("checkpoints: file writes are snapshotted and /rollback restores", async () => {
  const t = await setup();
  try {
    writeFileSync(join(t.work, "app.txt"), "original\n");
    t.mock.script([{ tool_calls: [call("write_file", { path: "app.txt", content: "broken\n" })] }, { content: "changed" }]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "change it");
    assert.equal(readFileSync(join(t.work, "app.txt"), "utf8"), "broken\n");
    const { runCommand } = await import(dist("runtime/commands.js"));
    const list = await runCommand("/rollback", { rt: t.rt, sid: s.id, source: "cli" });
    assert.match(list.text, /before write_file app\.txt/);
    const id = /^(\w+)\s/m.exec(list.text.split("\n")[1])[1];
    const r = await runCommand(`/rollback ${id}`, { rt: t.rt, sid: s.id, source: "cli" });
    assert.match(r.text, /Restored/);
    assert.equal(readFileSync(join(t.work, "app.txt"), "utf8"), "original\n");
  } finally { await t.close(); }
});

test("slash commands: /undo, /retry, /branch, /model, /new", async () => {
  const t = await setup();
  try {
    const { runCommand } = await import(dist("runtime/commands.js"));
    const s = t.rt.createSession({ source: "cli" });
    t.mock.script([{ content: "first answer" }]);
    await t.rt.send(s.id, "hello");
    const ctx = { rt: t.rt, sid: s.id, source: "cli" };
    const retry = await runCommand("/retry", ctx);
    assert.equal(retry.send, "hello");
    assert.equal(t.rt.db.getMessages(s.id).length, 0);
    t.mock.script([{ content: "second answer" }]);
    await t.rt.send(s.id, retry.send);
    const br = await runCommand("/branch", ctx);
    assert.equal(t.rt.db.getMessages(br.switchTo).length, 2);
    await runCommand("/undo", ctx);
    assert.equal(t.rt.db.getMessages(s.id).length, 0);
    await runCommand("/model qwen3:8b", ctx);
    assert.equal(t.rt.db.getSession(s.id).meta.model_override.name, "qwen3:8b");
    const nw = await runCommand("/new", ctx);
    assert.ok(nw.switchTo && nw.switchTo !== s.id);
  } finally { await t.close(); }
});

test("/loop runs a prompt repeatedly until --times", async () => {
  const t = await setup();
  try {
    const { runCommand } = await import(dist("runtime/commands.js"));
    const s = t.rt.createSession({ source: "cli" });
    t.mock.script([{ content: "tick one" }, { content: "tick two" }]);
    await runCommand("/loop check the queue --times 2", { rt: t.rt, sid: s.id, source: "cli" });
    for (let i = 0; i < 3; i++) { await t.rt.tickAutonomy(); await t.rt.waitIdle(s.id); await new Promise((r) => setTimeout(r, 1600)); }
    const l = t.rt.db.getMeta(`loop:${s.id}`);
    assert.equal(l.status, "done");
    assert.equal(l.ticks, 2);
  } finally { await t.close(); }
});

test("cron: natural schedule, run now, output saved and delivered", async () => {
  const t = await setup();
  try {
    t.mock.script([{ content: "Daily report: all systems nominal." }]);
    const job = t.rt.cron.create({ schedule: "daily at 7:00", prompt: "Write the daily report", deliver: "log" });
    assert.equal(job.schedule, "0 7 * * *");
    const out = await t.rt.cron.run(job.id);
    assert.match(out, /nominal/);
    const j = t.rt.cron.get(job.id);
    assert.equal(j.runs, 1); assert.equal(j.last_status, "ok");
    assert.match(readFileSync(j.last_output, "utf8"), /nominal/);
    assert.match(readFileSync(join(t.home, "logs", "deliveries.log"), "utf8"), /nominal/);
    const sess = t.rt.db.listSessions({ source: "cron" });
    assert.equal(sess.length, 1);
  } finally { await t.close(); }
});

test("kanban: dependent cards run in order in goal mode", async () => {
  const t = await setup();
  try {
    const a = t.rt.kanban.create({ title: "A" });
    const b = t.rt.kanban.create({ title: "B", depends_on: [a.id] });
    assert.deepEqual(t.rt.kanban.ready().map((c) => c.id), [a.id]);
    t.mock.script([{ content: "A complete" }]);
    assert.equal((await t.rt.kanban.work(a.id)).status, "done");
    assert.deepEqual(t.rt.kanban.ready().map((c) => c.id), [b.id]);
    t.mock.script([{ content: "B complete" }]);
    const done = await t.rt.kanban.work(b.id);
    assert.equal(done.status, "done");
    const sess = t.rt.db.getMessages(done.session_id);
    assert.match(sess[0].content, /Results of prerequisite cards:[\s\S]*A complete/);
  } finally { await t.close(); }
});

test("plugins: custom tool registration and pre_tool_call veto", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const home = mkdtempSync(join(tmpdir(), "stitap-plug-"));
  mkdirSync(join(home, "plugins"), { recursive: true });
  writeFileSync(join(home, "plugins", "demo.mjs"), `export default function register(ctx) {
    ctx.registerTool({ name: "shout", description: "uppercase text", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, handler: async (a) => a.text.toUpperCase() });
    ctx.on("pre_tool_call", ({ tool, args }) => tool === "terminal" && /forbidden/.test(args.command) ? "policy says no" : undefined);
  }`);
  const { startMockLLM } = await import("./mock-llm.mjs");
  const mock = await startMockLLM();
  writeFileSync(join(home, "config.yaml"), `model:\n  provider: openai\n  base_url: ${mock.url}\n  name: mock\ncurator:\n  enabled: false\n`);
  const { Runtime } = await import(dist("index.js"));
  const rt = await Runtime.create({ home, cwd: home });
  try {
    mock.script([{ tool_calls: [call("shout", { text: "hi" }), call("terminal", { command: "echo forbidden" })] }, { content: "ok" }]);
    const s = rt.createSession({ source: "cli" });
    await rt.send(s.id, "go");
    const tools = rt.db.getMessages(s.id).filter((m) => m.role === "tool");
    assert.equal(tools[0].content, "HI");
    assert.match(tools[1].content, /BLOCKED by plugin hook: policy says no/);
  } finally { await rt.shutdown(); await mock.close(); }
});

test("admin policy enforces settings that users cannot override", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "stitap-pol-"));
  const pol = join(dir, "policy.yaml");
  writeFileSync(pol, "enforce:\n  approvals.mode: deny\n  web.allow_private: false\ndisable_tools:\n  - execute_code\n");
  process.env.STITAP_POLICY_FILE = pol;
  const t = await setup("approvals:\n  mode: yolo\n");
  try {
    assert.equal(t.rt.cfg.data.approvals.mode, "deny");
    assert.throws(() => t.rt.cfg.set("approvals.mode", "yolo"), /administrator policy/);
    const s = t.rt.createSession({ source: "cli" });
    assert.ok(!t.rt.activeTools(s.id).some((x) => x.name === "execute_code"));
  } finally { delete process.env.STITAP_POLICY_FILE; await t.close(); }
});

test("JSON state backend works when node:sqlite is unavailable", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { openState } = await import(dist("state/db.js"));
  const db = openState(mkdtempSync(join(tmpdir(), "stitap-json-")), { forceJson: true });
  assert.equal(db.backend, "json");
  const s = db.createSession({ source: "cli", title: "x" });
  db.addMessage(s.id, { role: "user", content: "find the needle here" });
  db.addMessage(s.id, { role: "assistant", content: "ok" });
  assert.equal(db.getMessages(s.id).length, 2);
  assert.equal(db.search("needle").length, 1);
  db.setMeta("k", { a: 1 }); assert.deepEqual(db.getMeta("k"), { a: 1 });
  db.putRecord("cron", "1", { x: 1 }); assert.equal(db.listRecords("cron").length, 1);
  db.close();
});

test("tool store bridge: search and call a deterministic store tool", async () => {
  const t = await setup();
  try {
    const hits = await t.rt.storeBridge.search("linear system solve", 5);
    assert.ok(hits.length > 0, "store search returns tools");
    const lin = hits.find((h) => h.id === "math.linalg.solve");
    assert.ok(lin, "math.linalg.solve is executable");
    t.mock.script([{ tool_calls: [call("use_tool", { name: "store:math.linalg.solve", arguments: { operation: "solve", A: [[2, 0], [0, 4]], b: [2, 8] } })] }, { content: "x=1, y=2" }]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "solve");
    const out = t.rt.db.getMessages(s.id).find((m) => m.role === "tool").content;
    assert.doesNotMatch(out, /^error/);
    assert.match(out, /1[\s\S]*2/);
  } finally { await t.close(); }
});

test("output-limit cut-off: the truncated call is not run, history stays valid JSON, write_file can append", async () => {
  const t = await setup();
  try {
    const cut = `{"path": "big.js", "content": "const a = [\\n  'one',\\n  'tw`; // reply hit max_tokens mid-string
    t.mock.script([
      { tool_calls: [{ name: "write_file", arguments: cut }], finish_reason: "length" },
      { tool_calls: [call("write_file", { path: "big.js", content: "const a = [\n  'one',\n" })] },
      { tool_calls: [call("write_file", { path: "big.js", content: "  'two',\n];\n", append: true })] },
      { content: "written in two parts" },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    const r = await t.rt.send(s.id, "write a big file");
    assert.equal(r.final, "written in two parts");
    const toolMsgs = t.rt.db.getMessages(s.id).filter((m) => m.role === "tool");
    assert.match(toolMsgs[0].content, /output token limit.*NOT executed.*append=true/s);
    assert.match(toolMsgs[2].content, /^Appended 3 lines to big\.js/);
    assert.equal(readFileSync(join(t.work, "big.js"), "utf8"), "const a = [\n  'one',\n  'two',\n];\n");
    // every later request carried the cut-off call as valid JSON (llama.cpp --jinja rejects the request otherwise)
    for (const req of t.mock.requests.slice(1))
      for (const m of req.messages) for (const c of m.tool_calls ?? []) JSON.parse(c.function.arguments);
    const sent = t.mock.requests[1].messages.find((m) => m.tool_calls)?.tool_calls[0].function.arguments;
    assert.deepEqual(Object.keys(JSON.parse(sent)), ["path", "_invalid_arguments"]);
    assertValidHistory(t.rt, s.id);
  } finally { await t.close(); }
});

test("named agents: instructions, tool allow-list and step budget apply to a chat, /agent switches, delegate_task uses them", async () => {
  const t = await setup(`agents:
  reviewer:
    description: Reviews code for bugs
    instructions: Only report bugs with file and line.
    tools: [read_file, search_files]
    max_iterations: 2
`);
  try {
    t.mock.script([{ tool_calls: [call("read_file", { path: "x.txt" })] }, { tool_calls: [call("read_file", { path: "x.txt" })] }, { content: "never reached" }]);
    const s = t.rt.createSession({ source: "cli" });
    t.rt.applyAgent(s.id, "reviewer");
    const r = await t.rt.send(s.id, "review");
    assert.equal(r.iterations, 2, "agent max_iterations caps the turn");
    const req = t.mock.requests[0];
    assert.match(req.messages[0].content, /## Agent: reviewer\nOnly report bugs with file and line\./);
    assert.deepEqual(req.tools.map((x) => x.function.name).sort(), ["read_file", "search_files"]);
    const { runCommand } = await import(dist("runtime/commands.js"));
    const sw = await runCommand("/agent default", { rt: t.rt, sid: s.id, source: "cli" });
    assert.match(sw.text, /Switched this chat to agent "default"/);
    assert.equal(t.rt.db.getSession(s.id).meta.agent, undefined);
    assert.throws(() => t.rt.applyAgent(s.id, "nope"), /no agent "nope"/);
    // the main agent's prompt lists configured agents for delegation
    const main = t.rt.createSession({ source: "cli" });
    assert.match(t.rt.ensureSystemPrompt(main.id).system_prompt, /- reviewer: Reviews code for bugs/);
  } finally { await t.close(); }
});

test("loop detection: a repeated summary with rotating tool calls is warned, then stopped", async () => {
  const t = await setup();
  try {
    const summary = "I have successfully completed Phase 00: Scaffold for the project. All requirements have been implemented and verified.";
    const cycle = [call("terminal", { command: "echo ok" }), call("todo_list", { action: "read" }), call("memory", { action: "view" })];
    t.mock.script(Array.from({ length: 12 }, (_, i) => ({ content: summary, tool_calls: [cycle[i % 3]] })));
    const s = t.rt.createSession({ source: "cli" });
    const r = await t.rt.send(s.id, "do phase 00");
    assert.equal(r.final, summary);
    assert.ok(r.iterations <= 4, `stopped after ${r.iterations} steps`);
    assert.ok(t.events.some((e) => e.type === "status" && /Stopped a repeating loop/.test(e.text)));
    const notes = t.rt.db.getMessages(s.id).filter((m) => m.role === "tool" && /you are repeating yourself/.test(m.content));
    assert.equal(notes.length, 1, "warned once before stopping");
    assertValidHistory(t.rt, s.id);
  } finally { await t.close(); }
});

test("a new request answered with the previous reply word for word is retried once", async () => {
  const t = await setup();
  try {
    const summary = "I have successfully completed Phase 00: Scaffold for the project. All requirements have been implemented and verified. " + "Created folders, CSS files, README and tests. ".repeat(4);
    t.mock.script([{ content: summary }, { content: summary }, { content: "Starting Phase 01: reading the phase file now." }]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "do phase 00");
    const r = await t.rt.send(s.id, "now do phase 01");
    assert.equal(r.final, "Starting Phase 01: reading the phase file now.");
    assert.ok(t.events.some((e) => e.type === "discard_text"));
    const nudged = t.mock.requests.find((q) => /repeated your previous answer[\s\S]*now do phase 01/.test(q.messages.at(-1)?.content ?? ""));
    assert.ok(nudged, "the retry request carries the harness note");
    // the copy is not sent back: the stored placeholder replaces it
    assert.ok(nudged.messages.filter((m) => m.role === "assistant" && m.content === summary).length <= 1);
    assertValidHistory(t.rt, s.id);
  } finally { await t.close(); }
});

test("replaying an old answer with tool calls (after an interrupted turn) gets the current request restated", async () => {
  const t = await setup();
  try {
    const summary = "I have successfully completed Phase 00: Scaffold for the project. All requirements have been implemented and verified. " + "Created folders, CSS files, README and tests. ".repeat(4);
    t.mock.script([{ content: summary }]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "do phase 00");
    t.rt.db.addMessage(s.id, { role: "user", content: "phase-01.md" });
    t.rt.db.addMessage(s.id, { role: "assistant", content: "(interrupted)", meta: { interrupted: true } });
    t.mock.script([{ content: summary, tool_calls: [call("todo_list", { action: "read" })] }, { content: "Reading phase-01.md and starting Phase 01." }]);
    const r = await t.rt.send(s.id, "now do phase 01 from phase-01.md");
    assert.equal(r.final, "Reading phase-01.md and starting Phase 01.");
    const tool = t.rt.db.getMessages(s.id).filter((m) => m.role === "tool").at(-1);
    assert.match(tool.content, /repeats your answer to an earlier request[\s\S]*now do phase 01 from phase-01\.md/);
    assertValidHistory(t.rt, s.id);
  } finally { await t.close(); }
});

test("AGENTS.md tool names resolve to real Tool Store tools", async () => {
  const t = await setup();
  try {
    const { STORE_ALIASES } = await import(dist("runtime/store-bridge.js"));
    await t.rt.storeBridge.load();
    const ids = new Set(t.rt.storeBridge.list().map((x) => x.id));
    for (const [name, target] of Object.entries(STORE_ALIASES))
      for (const id of [target].flat()) assert.ok(ids.has(id), `${name} → ${id} is not a store tool`);
    const ctx = t.rt.toolContext(t.rt.createSession({ source: "cli" }).id);
    const use = t.rt.tools.get("use_tool");
    assert.match(String(await use.handler({ name: "spend_verify", arguments: { resource: "tokens", amount: 10 } }, ctx)), /"allowed": true/);
    assert.match(String(await use.handler({ name: "diagram_generate", arguments: {} }, ctx)), /covers several store tools[\s\S]*store:diagram\.user_journey/);
    assert.match(String(await t.rt.tools.get("tool_search").handler({ query: "viking_query" }, ctx)), /^- store:viking\.query/m);
  } finally { await t.close(); }
});

test("a summary repeated across steps is shown once; the turn reports plan progress", async () => {
  const t = await setup();
  try {
    const summary = "I have successfully completed the Phase 05 implementation for the e-commerce website. All required components, data files, and CSS styling have been created and tested.";
    t.mock.script([
      { content: summary, tool_calls: [call("todo_list", { action: "write", todos: [{ content: "a", status: "completed" }, { content: "b", status: "completed" }, { content: "c", status: "pending" }] })] },
      { content: summary, tool_calls: [call("todo_list", { action: "read" })] },
      { content: summary },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    const r = await t.rt.send(s.id, "finish phase 05");
    assert.equal(r.repeatedFinal, true);
    const stored = t.rt.db.getMessages(s.id).filter((m) => m.role === "assistant" && m.content === summary);
    assert.equal(stored.length, 2, "first step text + the final answer (history); the repeated step text is dropped");
    assert.equal(t.rt.db.getMessages(s.id).filter((m) => m.role === "assistant" && m.tool_calls?.length && m.content === summary).length, 1);
    assert.equal(t.events.filter((e) => e.type === "discard_text").length, 2, "repeat step + repeat final hidden");
    const end = t.events.find((e) => e.type === "turn_end");
    assert.equal(end.silent, true, "the repeated final is not rendered again");
    assert.deepEqual(end.plan, { done: 2, total: 3 });
    assertValidHistory(t.rt, s.id);
  } finally { await t.close(); }
});

test("protected paths, require in execute_code, and skill create-or-update", async () => {
  const t = await setup();
  try {
    writeFileSync(join(t.work, ".stitap-protected"), "# provided tests\ntests/**\n");
    mkdirSync(join(t.work, "tests"), { recursive: true });
    writeFileSync(join(t.work, "tests", "phase-01.test.js"), "// provided");
    t.mock.script([
      { tool_calls: [call("write_file", { path: "tests/phase-01.test.js", content: "// rewritten" })] },
      { tool_calls: [call("patch", { path: "tests/phase-01.test.js", old_string: "provided", new_string: "mine" })] },
      { tool_calls: [call("write_file", { path: "src/app.js", content: "ok" })] },
      { tool_calls: [call("execute_code", { language: "javascript", code: "const fs = require('fs'); console.log('CJS', typeof fs.readFileSync, __dirname.length > 0);" })] },
      { tool_calls: [call("skill_manage", { action: "create", name: "csv-cleanup", description: "Clean CSV files", content: "v1" })] },
      { tool_calls: [call("skill_manage", { action: "create", name: "csv-cleanup", description: "Clean CSV files", content: "v2" })] },
      { content: "done" },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "go");
    const tools = t.rt.db.getMessages(s.id).filter((m) => m.role === "tool").map((m) => m.content);
    assert.match(tools[0], /protected by .*\.stitap-protected/);
    assert.match(tools[1], /protected/);
    assert.equal(readFileSync(join(t.work, "tests", "phase-01.test.js"), "utf8"), "// provided", "provided test untouched");
    assert.match(tools[2], /^Created/);
    assert.match(tools[3], /CJS function true/);
    assert.match(tools[4], /^Created skill csv-cleanup/);
    assert.match(tools[5], /^Updated existing skill csv-cleanup/);
    assert.match(t.rt.skills.view("csv-cleanup"), /v2/);
  } finally { await t.close(); }
});

test("/pipeline runs spec documents in order, skips a stuck one, keeps one cumulative plan and reports at the end; /cron add works", async () => {
  const t = await setup();
  try {
    mkdirSync(join(t.work, "specs"));
    writeFileSync(join(t.work, "specs", "phase-00.md"), '# Phase 00\n**Test:** `node -e "process.exit(0)"`\nAlready done.\n');
    writeFileSync(join(t.work, "specs", "phase-01.md"), '# Phase 01\n**Test:** `node -e "process.exit(require(\'fs\').existsSync(\'a.txt\') ? 0 : 1)"`\nBuild A.\n');
    writeFileSync(join(t.work, "specs", "phase-02.md"), '# Phase 02\n**Test:** `node -e "process.exit(1)"`\nBuild B.\n');
    writeFileSync(join(t.work, "specs", "phase-03.md"), "# Phase 03\nNot in range.\n");
    t.mock.script([
      { tool_calls: [call("todo_list", { action: "write", todos: [{ content: "write A", status: "completed" }, { content: "test A", status: "completed" }] })] },
      { tool_calls: [call("write_file", { path: "a.txt", content: "A" })] },
      { content: "A done." },
      { content: "B attempt 1." }, { content: "B attempt 2." }, { content: "B final retry." },
    ]);
    const s = t.rt.createSession({ source: "cli" });
    const { runCommand } = await import(dist("runtime/commands.js"));
    const start = await runCommand("/pipeline start specs/phase-*.md --to 2 --attempts 2", { rt: t.rt, sid: s.id, source: "cli" });
    assert.match(start.text, /Pipeline started: 3 documents in order \(phase-00, phase-01, phase-02\)/);
    for (let i = 0; i < 200 && t.rt.pipelines.get(s.id)?.status === "active"; i++) await new Promise((r) => setTimeout(r, 100));
    const st = t.rt.pipelines.get(s.id);
    assert.equal(st.status, "done");
    assert.deepEqual(st.items.map((i) => [i.name, i.status, i.attempts]), [["phase-00", "done", 0], ["phase-01", "done", 1], ["phase-02", "stuck", 3]]);
    assert.match(st.items[0].note, /already passing/);
    const report = t.rt.db.getMessages(s.id).find((m) => m.meta?.pipeline_report);
    assert.match(report.content, /Pipeline finished: 2\/3 documents done/);
    const plan = t.rt.db.getMeta(`todo:${s.id}`);
    assert.ok(plan.some((p) => p.phase === "2. phase-01" && p.content === "write A"), "child plan merged into the origin plan");
    assert.ok(plan.some((p) => p.phase === "3. phase-02" && p.status === "cancelled" && /stuck/.test(p.content)));
    const children = t.rt.db.listSessions({ limit: 20 }).filter((x) => x.source === "pipeline");
    assert.equal(children.length, 4, "1 run for phase-01, 3 for phase-02");
    assert.match((await runCommand("/pipeline status", { rt: t.rt, sid: s.id, source: "cli" })).text, /Pipeline done \(chat "Pipeline: phase-00 → phase-02".*\): 2\/3 done, 1 stuck/);
    const cron = await runCommand('/cron add "every 30m" check the build', { rt: t.rt, sid: s.id, source: "cli" });
    assert.match(cron.text, /^Scheduled cron_/);
    assert.equal(t.rt.cron.list().length, 1);
  } finally { await t.close(); }
});

test("/pipeline regression gate: a document that breaks an earlier one is not done until it is fixed", async () => {
  const t = await setup();
  try {
    mkdirSync(join(t.work, "docs"));
    writeFileSync(join(t.work, "b.txt"), "ok");
    writeFileSync(join(t.work, "docs", "phase-00.md"), '# Phase 00\n**Test:** `node -e "process.exit(require(\'fs\').readFileSync(\'b.txt\',\'utf8\')===\'ok\' ? 0 : 1)"`\n');
    writeFileSync(join(t.work, "docs", "phase-01.md"), '# Phase 01\n**Test:** `node -e "process.exit(require(\'fs\').existsSync(\'a.txt\') ? 0 : 1)"`\n');
    t.mock.script([
      { tool_calls: [call("write_file", { path: "a.txt", content: "A" }), call("write_file", { path: "b.txt", content: "rewritten" })] },
      { content: "Phase 01 done." },
      { tool_calls: [call("write_file", { path: "b.txt", content: "ok" })] },
      { content: "Fixed phase 00 again." },
    ]);
    const s = t.rt.createSession({ source: "cli", cwd: t.work });
    const { runCommand } = await import(dist("runtime/commands.js"));
    await runCommand("/pipeline start docs/phase-*.md --from 1 --attempts 2", { rt: t.rt, sid: s.id, source: "cli" });
    for (let i = 0; i < 200 && t.rt.pipelines.get(s.id)?.status === "active"; i++) await new Promise((r) => setTimeout(r, 100));
    const it = t.rt.pipelines.get(s.id).items[0];
    assert.deepEqual([it.name, it.status, it.attempts], ["phase-01", "done", 2]);
    assert.deepEqual(it.regress.map((r) => r.name), ["phase-00"]);
    const retryPrompt = t.mock.requests.find((q) => /broke documents that passed before \(phase-00\)/.test(JSON.stringify(q.messages)));
    assert.ok(retryPrompt, "the retry tells the agent which earlier document it broke");
    assert.equal(readFileSync(join(t.work, "b.txt"), "utf8"), "ok");
  } finally { await t.close(); }
});

test("/pipeline stop works from another chat, and progress stays in the origin chat", async () => {
  const t = await setup();
  try {
    mkdirSync(join(t.work, "docs"));
    writeFileSync(join(t.work, "docs", "phase-01.md"), '# Phase 01\n**Test:** `node -e "process.exit(1)"`\n');
    t.mock.script([{ content: "working" }, { content: "still working" }, { content: "more" }]);
    const origin = t.rt.createSession({ source: "cli", cwd: t.work });
    const other = t.rt.createSession({ source: "cli", cwd: t.work });
    const { runCommand } = await import(dist("runtime/commands.js"));
    await runCommand("/pipeline start docs/phase-*.md --attempts 5", { rt: t.rt, sid: origin.id, source: "cli" });
    const r = await runCommand("/pipeline stop", { rt: t.rt, sid: other.id, source: "cli" });
    assert.match(JSON.stringify(r), /stopped.*another chat/);
    assert.equal(t.rt.pipelines.get(origin.id).status, "stopped");
    for (let i = 0; i < 50 && t.rt.pipelines.get(origin.id).items[0].status === "running"; i++) await new Promise((res) => setTimeout(res, 100));
    const notes = t.rt.db.getMessages(origin.id).filter((m) => m.meta?.pipeline_status).map((m) => m.content);
    assert.ok(notes.some((n) => /Pipeline started/.test(n)) && notes.some((n) => /Pipeline stopped/.test(n)), notes.join(" | "));
    assert.match(t.rt.db.getSession(origin.id).title, /^Pipeline: phase-01/);
  } finally { await t.close(); }
});

test("file_history lists, shows and restores an earlier version of a file; run_tests summarizes", async () => {
  const t = await setup();
  try {
    const page = Array.from({ length: 40 }, (_, i) => `<p>section ${i}</p>`).join("\n");
    writeFileSync(join(t.work, "about.html"), page);
    writeFileSync(join(t.work, "ok.test.mjs"), 'import { test } from "node:test"; test("fine", () => {});\n');
    t.mock.script([
      { tool_calls: [call("write_file", { path: "about.html", content: page + "\n<p>more</p>" })] },
      { tool_calls: [call("write_file", { path: "about.html", content: "<main></main>", replace_whole: true })] },
      { tool_calls: [call("file_history", { path: "about.html" })] },
      { content: "listed" },
    ]);
    const s = t.rt.createSession({ source: "cli", cwd: t.work });
    await t.rt.send(s.id, "go"); await t.rt.waitIdle(s.id);
    assert.equal(readFileSync(join(t.work, "about.html"), "utf8"), "<main></main>");
    const list = t.rt.db.getMessages(s.id).filter((m) => m.role === "tool").at(-1).content;
    assert.match(list, /about\.html now: 1 lines/);
    const id = /^([0-9a-f]{7,})\s.*40 lines/m.exec(list)?.[1];
    assert.ok(id, list);
    t.mock.script([
      { tool_calls: [call("file_history", { path: "about.html", action: "restore", version: id })] },
      { tool_calls: [call("run_tests", { command: "node --test ok.test.mjs" })] },
      { content: "restored" },
    ]);
    await t.rt.send(s.id, "restore"); await t.rt.waitIdle(s.id);
    assert.equal(readFileSync(join(t.work, "about.html"), "utf8"), page);
    assert.match(t.rt.db.getMessages(s.id).filter((m) => m.role === "tool").at(-1).content, /^PASS: 1\/1 passed/);
  } finally { await t.close(); }
});

test("pipeline sessions: a script that wipes a project file gets it put back", async () => {
  const t = await setup();
  try {
    const big = Array.from({ length: 60 }, (_, i) => `export const v${i} = ${i};`).join("\n");
    writeFileSync(join(t.work, "store.js"), big);
    t.mock.script([
      { tool_calls: [call("terminal", { command: "node -e \"require('fs').writeFileSync('store.js', 'x')\"" })] },
      { content: "done" },
    ]);
    const s = t.rt.createSession({ source: "pipeline", cwd: t.work });
    await t.rt.send(s.id, "go", { source: "pipeline", approvalMode: "yolo" }); await t.rt.waitIdle(s.id);
    assert.equal(readFileSync(join(t.work, "store.js"), "utf8"), big);
    assert.match(t.rt.db.getMessages(s.id).find((m) => m.role === "tool").content, /removed most of store\.js \(60→1 lines\).*put back/s);
  } finally { await t.close(); }
});

test("read_file: re-reading an unchanged file returns a short note; a changed file is sent again", async () => {
  const t = await setup();
  try {
    writeFileSync(join(t.work, "a.txt"), "alpha\nbeta");
    t.mock.script([
      { tool_calls: [call("read_file", { path: "a.txt" })] },
      { tool_calls: [call("read_file", { path: "a.txt" })] },
      { tool_calls: [call("patch", { path: "a.txt", old_string: "beta", new_string: "gamma" })] },
      { tool_calls: [call("read_file", { path: "a.txt" })] },
      { content: "ok" },
    ]);
    const s = t.rt.createSession({ source: "cli", cwd: t.work });
    await t.rt.send(s.id, "go"); await t.rt.waitIdle(s.id);
    const reads = t.rt.db.getMessages(s.id).filter((m) => m.role === "tool").map((m) => m.content);
    assert.match(reads[0], /alpha/);
    assert.match(reads[1], /unchanged since you last read it/);
    assert.match(reads[3], /gamma/);
  } finally { await t.close(); }
});

test("pipeline visual gate: tests pass but a wiped page sends the phase back", async (tt) => {
  const { pageCheckAvailable } = await import(dist("tools/pagecheck.js"));
  if (!pageCheckAvailable()) return tt.skip("playwright not installed");
  const t = await setup();
  try {
    const page = `<!doctype html><title>Home</title><main><h1>Organic groceries</h1><p>${"Fresh dal, ghee and spices from Indian farms. ".repeat(4)}</p></main>`;
    writeFileSync(join(t.work, "index.html"), page);
    mkdirSync(join(t.work, "docs"));
    writeFileSync(join(t.work, "docs", "phase-01.md"), '# Phase 01\n**Test:** `node -e "process.exit(require(\'fs\').existsSync(\'shop.html\') ? 0 : 1)"`\n');
    t.mock.script([
      { tool_calls: [call("write_file", { path: "shop.html", content: page.replace("Home", "Shop") }), call("write_file", { path: "index.html", content: "<!doctype html><main></main>" })] },
      { content: "Phase 01 done." },
      { tool_calls: [call("write_file", { path: "index.html", content: page })] },
      { content: "Restored the home page." },
    ]);
    const s = t.rt.createSession({ source: "cli", cwd: t.work });
    const { runCommand } = await import(dist("runtime/commands.js"));
    await runCommand("/pipeline start docs/phase-*.md --attempts 2", { rt: t.rt, sid: s.id, source: "cli" });
    for (let i = 0; i < 600 && t.rt.pipelines.get(s.id)?.status === "active"; i++) await new Promise((r) => setTimeout(r, 100));
    const it = t.rt.pipelines.get(s.id).items[0];
    assert.deepEqual([it.status, it.attempts], ["done", 2]);
    assert.ok(t.mock.requests.some((q) => /pages are broken in a real browser[\s\S]*index\.html[\s\S]*nearly empty/.test(JSON.stringify(q.messages))), "the retry names the broken page");
  } finally { await t.close(); }
});

test("on-demand tools: not sent with every call, but tool_search finds them and they can be called", async () => {
  const t = await setup();
  try {
    t.mock.script([
      { tool_calls: [call("tool_search", { query: "create a website template e-commerce store" })] },
      { tool_calls: [call("tool_search", { query: "loan EMI interest calculator" })] },
      { tool_calls: [call("tool_search", { query: "headless CMS content types strapi" })] },
      { tool_calls: [call("finance_calc", { kind: "emi", principal: 500000, rate: 12, months: 36 })] },
      { content: "done" },
    ]);
    const s = t.rt.createSession({ source: "cli", cwd: t.work });
    await t.rt.send(s.id, "go"); await t.rt.waitIdle(s.id);
    const sent = t.mock.requests[0].tools.map((x) => x.function.name);
    for (const n of ["site_template", "finance_calc", "strapi_cms"]) assert.ok(!sent.includes(n), `${n} is not in every request`);
    for (const n of ["run_tests", "page_check", "file_history"]) assert.ok(sent.includes(n), `${n} is always sent`);
    const results = t.rt.db.getMessages(s.id).filter((m) => m.role === "tool").map((m) => m.content);
    assert.match(results[0], /site_template/); assert.match(results[1], /finance_calc/); assert.match(results[2], /strapi_cms/);
    assert.match(results[3], /"emi":16607\.15/);
  } finally { await t.close(); }
});

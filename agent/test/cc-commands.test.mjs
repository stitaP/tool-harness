// Claude Code-style commands: /plan, /review, /context, !cmd, #note, /effort, /output-style, /add-dir, /hooks,
// /permissions, /fewer-permission-prompts, /worktree, delegate isolation, kanban worktrees, /tasks, /todos, vim keys …
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, dist, call } from "./helpers.mjs";

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const repo = (cwd) => { git(cwd, "init", "-q", "-b", "main"); git(cwd, "config", "user.email", "t@example.com"); git(cwd, "config", "user.name", "T"); writeFileSync(join(cwd, "a.txt"), "1\n"); git(cwd, "add", "."); git(cwd, "commit", "-qm", "init"); };
const NO_PLANNER = "agent:\n  tool_selection: \"off\"\n";
const cmd = async (t, line, sid, source = "cli") => { const { runCommand } = await import(dist("runtime/commands.js")); return runCommand(line, { rt: t.rt, sid, source }); };
const toolMsg = (rt, sid, name) => rt.db.getMessages(sid).filter((m) => m.role === "tool" && m.name === name);

test("read-only command check", async () => {
  const { readOnlyCommand } = await import(dist("runtime/modes.js"));
  for (const c of ["ls -la", "git status", "git log --oneline -5", "cat a.txt | grep x | wc -l", "rg foo src 2>&1", "find . -name '*.ts'", "cd src && ls", "npm ls 2>/dev/null"]) assert.equal(readOnlyCommand(c), true, c);
  for (const c of ["rm a.txt", "echo x > a.txt", "cat a >> b", "npm install", "git commit -m x", "find . -delete", "sed -i s/a/b/ f", "ls; rm -rf x", "echo $(rm x)", "git push", "tee out.txt"]) assert.equal(readOnlyCommand(c), false, c);
});

test("/plan: read-only until approved, then carries the plan out", async () => {
  const t = await setup(NO_PLANNER);
  try {
    writeFileSync(join(t.work, "x.txt"), "old\n");
    const s = t.rt.createSession({ source: "cli" });
    t.mock.script([
      { tool_calls: [call("write_file", { path: "x.txt", content: "new\n" })] },
      { tool_calls: [call("read_file", { path: "x.txt" })] },
      { content: "## Plan\n1. change x.txt to new" },
      { tool_calls: [call("write_file", { path: "x.txt", content: "new\n" })] },
      { content: "Done." },
    ]);
    const r = await cmd(t, "/plan update x.txt", s.id);
    assert.equal(t.rt.db.getSession(s.id).meta.plan_mode, true);
    await t.rt.send(s.id, r.send); await t.rt.waitIdle(s.id);
    assert.match(toolMsg(t.rt, s.id, "write_file")[0].content, /BLOCKED: plan mode is on/);
    assert.match(toolMsg(t.rt, s.id, "read_file")[0].content, /old/);
    assert.equal(readFileSync(join(t.work, "x.txt"), "utf8"), "old\n");
    assert.match(t.rt.db.getMessages(s.id).find((m) => m.role === "user").content, /Plan mode is ON/);
    assert.match((await cmd(t, "/plan show", s.id)).text, /## Plan/);
    const ap = await cmd(t, "/plan approve", s.id);
    assert.equal(t.rt.db.getSession(s.id).meta.plan_mode, undefined);
    await t.rt.send(s.id, ap.send); await t.rt.waitIdle(s.id);
    assert.equal(readFileSync(join(t.work, "x.txt"), "utf8"), "new\n");
    // "/plan show me the flow" is a task, not the show subcommand
    const r2 = await cmd(t, "/plan show me the flow", s.id);
    assert.equal(r2.send, "show me the flow");
  } finally { await t.close(); }
});

test("/review: sends the diff, the turn is read-only, the lock lifts afterwards", async () => {
  const t = await setup(NO_PLANNER);
  try {
    repo(t.work);
    writeFileSync(join(t.work, "a.txt"), "1\n2\n");
    writeFileSync(join(t.work, "new.js"), "export const x = 1;\n");
    const s = t.rt.createSession({ source: "cli" });
    const r = await cmd(t, "/review", s.id);
    assert.match(r.send, /```diff[\s\S]*a\.txt[\s\S]*\+2/);
    assert.match(r.send, /new\.js/);
    assert.equal(t.rt.db.getSession(s.id).meta.read_only_turn, "review");
    t.mock.script([{ tool_calls: [call("write_file", { path: "a.txt", content: "x" })] }, { content: "No defects found." }]);
    await t.rt.send(s.id, r.send); await t.rt.waitIdle(s.id);
    assert.match(toolMsg(t.rt, s.id, "write_file")[0].content, /this is a review/);
    assert.equal(t.rt.db.getSession(s.id).meta.read_only_turn, undefined);
    const sec = await cmd(t, "/security-review", s.id);
    assert.match(sec.send, /Security review[\s\S]*injection/);
    git(t.work, "add", "."); git(t.work, "commit", "-qm", "second");
    t.rt.db.updateSession(s.id, { meta: { ...t.rt.db.getSession(s.id).meta, read_only_turn: undefined } });
    const last = await cmd(t, "/simplify", s.id);
    assert.match(last.text, /last commit/);
    assert.equal(t.rt.db.getSession(s.id).meta.read_only_turn, undefined);
    const plain = mkdtempSync(join(tmpdir(), "stitap-nogit-"));
    t.rt.setSessionCwd(s.id, plain);
    assert.match((await cmd(t, "/review", s.id)).text, /not a git repository/);
  } finally { await t.close(); }
});

test("/context breaks the window down", async () => {
  const t = await setup(NO_PLANNER);
  try {
    const s = t.rt.createSession({ source: "cli" });
    t.mock.script([{ tool_calls: [call("read_file", { path: "nope.txt" })] }, { content: "hello" }]);
    await t.rt.send(s.id, "hi there"); await t.rt.waitIdle(s.id);
    const r = (await cmd(t, "/context", s.id)).text;
    assert.match(r, /Context: ~[\d.K]+ of 32\.0K tokens/);
    assert.match(r, /System prompt/); assert.match(r, /Tool schemas \(\d+\)/); assert.match(r, /tool results/); assert.match(r, /Free/);
  } finally { await t.close(); }
});

test("!cmd runs in the chat folder and reaches the model with the next message; #note saves memory", async () => {
  const t = await setup(NO_PLANNER);
  try {
    const { runInputPrefix } = await import(dist("runtime/commands.js"));
    const s = t.rt.createSession({ source: "cli" });
    const r = await runInputPrefix("!echo hello-shell && pwd", { rt: t.rt, sid: s.id, source: "cli" });
    assert.match(r.text, /hello-shell/); assert.match(r.text, /exit 0/);
    assert.equal((await runInputPrefix("!echo no", { rt: t.rt, sid: s.id, source: "telegram" })).text.includes("only from the terminal"), true);
    t.mock.script([{ content: "seen" }]);
    await t.rt.send(s.id, "what did I run?"); await t.rt.waitIdle(s.id);
    const u = t.rt.db.getMessages(s.id).find((m) => m.role === "user").content;
    assert.match(u, /^\[The user ran these commands[\s\S]*\$ echo hello-shell[\s\S]*what did I run\?$/);
    assert.equal(t.rt.db.getMeta(`shell_context:${s.id}`), null);
    const m = await runInputPrefix("# the staging db is read-only", { rt: t.rt, sid: s.id, source: "cli" });
    assert.match(m.text, /Saved to memory/);
    assert.ok(t.rt.memory.entries("memory").some((e) => e.includes("staging db is read-only")));
    await runInputPrefix("#user prefers tabs", { rt: t.rt, sid: s.id, source: "cli" });
    assert.ok(t.rt.memory.entries("user").some((e) => e.includes("prefers tabs")));
    assert.equal(await runInputPrefix("## heading\nwith body", { rt: t.rt, sid: s.id, source: "cli" }), null);
    assert.equal(await runInputPrefix("plain text", { rt: t.rt, sid: s.id, source: "cli" }), null);
  } finally { await t.close(); }
});

test("/effort reaches the model request; providers map it", async () => {
  const t = await setup(NO_PLANNER);
  try {
    const s = t.rt.createSession({ source: "cli" });
    assert.match((await cmd(t, "/effort high", s.id)).text, /Effort high/);
    assert.match((await cmd(t, "/effort bogus", s.id)).text, /Unknown effort/);
    t.mock.script([{ content: "ok" }]);
    await t.rt.send(s.id, "think hard"); await t.rt.waitIdle(s.id);
    const body = t.mock.requests.filter((b) => b.tools).at(-1);
    assert.equal(body.chat_template_kwargs.enable_thinking, true); assert.equal(body.reasoning_effort, "high");
    await cmd(t, "/effort off", s.id);
    t.mock.script([{ content: "ok" }]);
    await t.rt.send(s.id, "quick"); await t.rt.waitIdle(s.id);
    assert.equal(t.mock.requests.filter((b) => b.tools).at(-1).chat_template_kwargs.enable_thinking, false);
    await cmd(t, "/effort default", s.id);
    assert.equal(t.rt.db.getSession(s.id).meta.effort, undefined);
  } finally { await t.close(); }
  const { applyClaudeEffort } = await import(dist("providers/anthropic.js"));
  const { applyEffort } = await import(dist("providers/openai.js"));
  let b = { max_tokens: 4096, temperature: 0.3 }; applyClaudeEffort(b, "claude-opus-5-5", "xhigh");
  assert.deepEqual(b.output_config, { effort: "xhigh" }); assert.deepEqual(b.thinking, { type: "adaptive" }); assert.equal(b.temperature, undefined);
  b = { max_tokens: 4096 }; applyClaudeEffort(b, "claude-opus-5-5", "off");
  assert.equal(b.thinking, undefined); assert.equal(b.output_config.effort, "low");
  b = { max_tokens: 4096, temperature: 0.3 }; applyClaudeEffort(b, "claude-haiku-4-5", "medium");
  assert.deepEqual(b.thinking, { type: "enabled", budget_tokens: 8192 }); assert.ok(b.max_tokens > 8192); assert.equal(b.output_config, undefined);
  b = {}; applyEffort(b, "max", "https://api.openai.com/v1"); assert.equal(b.reasoning_effort, "high"); assert.equal(b.chat_template_kwargs, undefined);
});

test("/output-style and /add-dir change the instructions; edits in an added folder get its own checkpoints", async () => {
  const t = await setup(NO_PLANNER);
  try {
    const s = t.rt.createSession({ source: "cli" });
    assert.match((await cmd(t, "/output-style", s.id)).text, /explanatory/);
    await cmd(t, "/output-style learning", s.id);
    assert.match(t.rt.db.getSession(s.id).system_prompt, /## Output style\n.*TODO\(human\)/);
    mkdirSync(join(t.home, "output-styles"), { recursive: true });
    writeFileSync(join(t.home, "output-styles", "pirate.md"), "description: Talks like a pirate\nAnswer like a pirate.");
    assert.match((await cmd(t, "/output-style list", s.id)).text, /pirate — Talks like a pirate/);
    await cmd(t, "/output-style pirate", s.id);
    assert.match(t.rt.db.getSession(s.id).system_prompt, /## Output style\nAnswer like a pirate\./);

    const other = mkdtempSync(join(tmpdir(), "stitap-extra-"));
    writeFileSync(join(other, "AGENTS.md"), "Use tabs in this repo.");
    writeFileSync(join(other, "b.txt"), "one\n");
    assert.match((await cmd(t, `/add-dir ${other}`, s.id)).text, /Added/);
    const sp = t.rt.db.getSession(s.id).system_prompt;
    assert.match(sp, /## Additional working directories[\s\S]*stitap-extra-/); assert.match(sp, /Use tabs in this repo\./);
    assert.equal(t.rt.checkpointRoot(s.id, join(other, "b.txt"), t.work), other);
    t.mock.script([{ tool_calls: [call("write_file", { path: join(other, "b.txt"), content: "two\n", replace_whole: true })] }, { content: "ok" }]);
    await t.rt.send(s.id, "edit b"); await t.rt.waitIdle(s.id);
    assert.equal(readFileSync(join(other, "b.txt"), "utf8"), "two\n");
    assert.ok(t.rt.checkpoints.list(other, 5).length >= 1);
    assert.match((await cmd(t, "/rollback", s.id)).text, /stitap-extra-/);
    await cmd(t, `/add-dir remove ${other}`, s.id);
    assert.doesNotMatch(t.rt.db.getSession(s.id).system_prompt, /Additional working directories/);
  } finally { await t.close(); }
});

test("/hooks: a pre_tool_call shell hook that exits 2 blocks the call", async () => {
  const t = await setup(NO_PLANNER);
  try {
    const s = t.rt.createSession({ source: "cli" });
    const hook = join(t.home, "deny-writes.sh");
    writeFileSync(hook, "#!/bin/sh\ncat > /dev/null\necho 'writes are frozen today' >&2\nexit 2\n");
    assert.match((await cmd(t, `/hooks add pre_tool_call --match ^write_file$ sh ${hook}`, s.id)).text, /Hook added/);
    assert.match((await cmd(t, "/hooks", s.id)).text, /pre_tool_call\n  1\. sh .*deny-writes\.sh   \[only tools matching/);
    assert.match((await cmd(t, "/hooks test pre_tool_call write_file", s.id)).text, /exit 2[\s\S]*would BLOCK/);
    t.mock.script([{ tool_calls: [call("write_file", { path: "z.txt", content: "z" }), call("list_dir", {})] }, { content: "ok" }]);
    await t.rt.send(s.id, "write z"); await t.rt.waitIdle(s.id);
    assert.match(toolMsg(t.rt, s.id, "write_file")[0].content, /BLOCKED by hook .*writes are frozen today/);
    assert.equal(existsSync(join(t.work, "z.txt")), false);
    assert.doesNotMatch(toolMsg(t.rt, s.id, "list_dir")[0].content, /BLOCKED/);
    await cmd(t, "/hooks remove pre_tool_call 1", s.id);
    assert.deepEqual(t.rt.cfg.data.hooks.pre_tool_call, []);
  } finally { await t.close(); }
});

test("/permissions and /fewer-permission-prompts", async () => {
  const t = await setup(NO_PLANNER);
  try {
    const s = t.rt.createSession({ source: "cli" });
    await cmd(t, '/permissions allow "git push origin *"', s.id);
    assert.deepEqual(t.rt.cfg.data.approvals.allow_patterns, ["git push origin *"]);
    assert.match((await cmd(t, "/permissions", s.id)).text, /1\. git push origin \*/);
    await cmd(t, "/permissions deny web_search", s.id);
    assert.ok(t.rt.cfg.data.tools.disabled.includes("web_search"));
    await cmd(t, "/permissions remove 1", s.id);
    assert.deepEqual(t.rt.cfg.data.approvals.allow_patterns, []);
    const put = (command, decision = "once") => t.rt.db.putRecord("approval_log", `al_${Math.random()}`, { tool: "terminal", command, decision, at: Date.now() });
    put("git reset --hard HEAD~1"); put("git reset --hard HEAD~1");
    put("docker system prune -a"); put("docker system prune --volumes"); put("docker system prune -af");
    put("rm -rf build"); put("rm -rf build"); put("rm -rf dist"); put("rm -rf out");
    put("never mind", "deny");
    const { permissionSuggestions } = await import(dist("runtime/cc-commands.js"));
    const sug = permissionSuggestions(t.rt).map((x) => x.pattern);
    assert.ok(sug.includes("docker system *")); assert.ok(sug.includes("git reset --hard HEAD~1")); assert.ok(sug.includes("rm -rf build"));
    assert.ok(!sug.includes("rm -rf *")); assert.ok(!sug.includes("never mind"));
    assert.match((await cmd(t, "/fewer-permission-prompts", s.id)).text, /docker system \*/);
    await cmd(t, "/fewer-permission-prompts apply 1", s.id);
    assert.equal(t.rt.cfg.data.approvals.allow_patterns.length, 1);
  } finally { await t.close(); }
});

test("/worktree: isolated branch, then merge back", async () => {
  const t = await setup(NO_PLANNER);
  try {
    repo(t.work);
    const s = t.rt.createSession({ source: "cli", cwd: t.work });
    const r = await cmd(t, "/worktree new feat", s.id);
    assert.match(r.text, /branch stitap\/feat/);
    const wcwd = t.rt.sessionCwd(s.id);
    assert.match(wcwd, /\.stitap-worktrees\/feat$/);
    writeFileSync(join(wcwd, "f.txt"), "feature\n");
    assert.equal(existsSync(join(t.work, "f.txt")), false);
    assert.match((await cmd(t, "/worktree status", s.id)).text, /1 uncommitted/);
    assert.match(git(t.work, "status", "--porcelain"), /^$/);   // .stitap-worktrees is excluded
    const m = await cmd(t, "/worktree merge add f", s.id);
    assert.match(m.text, /merged 1 commit/i);
    assert.equal(readFileSync(join(t.work, "f.txt"), "utf8"), "feature\n");
    assert.equal(t.rt.sessionCwd(s.id), t.work);
    assert.equal(git(t.work, "branch", "--list", "stitap/feat"), "");
  } finally { await t.close(); }
});

test("delegate_task isolation=worktree keeps the subagent's changes on a branch", async () => {
  const t = await setup(NO_PLANNER);
  try {
    repo(t.work);
    const s = t.rt.createSession({ source: "cli", cwd: t.work });
    t.mock.script([
      { tool_calls: [call("delegate_task", { goal: "create sub.txt", isolation: "worktree" })] },
      { tool_calls: [call("write_file", { path: "sub.txt", content: "from sub\n" })] },
      { content: "created sub.txt" },
      { content: "parent done" },
    ]);
    await t.rt.send(s.id, "delegate it"); await t.rt.waitIdle(s.id);
    const out = toolMsg(t.rt, s.id, "delegate_task")[0].content;
    const branch = /branch (stitap\/sub-\S+)/.exec(out)?.[1];
    assert.ok(branch, out);
    assert.equal(existsSync(join(t.work, "sub.txt")), false);
    assert.equal(git(t.work, "show", `${branch}:sub.txt`), "from sub");
  } finally { await t.close(); }
});

test("kanban.worktrees: the worker runs in its own worktree and the card merges when done", async () => {
  const t = await setup(`${NO_PLANNER}kanban:\n  worktrees: true\n  verify: false\n`);
  try {
    repo(t.work);
    const K = t.rt.kanban;
    const c = K.create({ title: "add x.js", cwd: t.work, files: ["x.js"], test_cmd: "test -s x.js" });
    t.mock.script([
      { tool_calls: [call("write_file", { path: "x.js", content: "export const answer = () => 42;\n" })] },
      { tool_calls: [call("terminal", { command: `git add x.js && git commit -qm "${c.key}: add x.js"` })] },
      { content: "Added x.js; test passes." },
    ]);
    const done = await K.work(c.id);
    assert.equal(done.status, "done", JSON.stringify(done.comments.map((x) => x.text)));
    assert.equal(done.worktree, undefined);
    assert.equal(readFileSync(join(t.work, "x.js"), "utf8"), "export const answer = () => 42;\n");
    assert.match(git(t.work, "log", "--format=%s"), new RegExp(`${c.key}: merge kanban/${c.key}`));
    assert.ok(done.comments.some((x) => /Working in worktree/.test(x.text)));
    assert.equal(existsSync(join(t.work, ".stitap-worktrees", c.key)), false);
    // a dirty main checkout runs the card there instead
    writeFileSync(join(t.work, "dirty.txt"), "x");
    const d = K.create({ title: "y", cwd: t.work });
    t.mock.script([{ content: "nothing to do" }]);
    const r = await K.work(d.id);
    assert.ok(r.comments.some((x) => /Worktree skipped/.test(x.text)));
  } finally { await t.close(); }
});

test("/todos, /tasks, /statusline, /init, /bug, /release-notes, /terminal-setup, /keybindings, /vim", async () => {
  const t = await setup(NO_PLANNER);
  try {
    const s = t.rt.createSession({ source: "cli" });
    assert.match((await cmd(t, "/todos", s.id)).text, /No todo list/);
    t.rt.db.setMeta(`todo:${s.id}`, [{ id: "1", content: "write it", status: "completed", phase: "Build" }, { id: "2", content: "test it", status: "in_progress", phase: "Build" }]);
    assert.match((await cmd(t, "/todos", s.id)).text, /1\/2 done\nBuild:\n  \[x\] 1\. write it\n  \[>\] 2\. test it/);
    const p = t.rt.processes.start(t.rt.terminal, "sleep 30", t.work, s.id, false);
    assert.match((await cmd(t, "/tasks", s.id)).text, new RegExp(`${p.id}  \\[running\\]`));
    assert.match((await cmd(t, `/bashes kill ${p.id}`, s.id)).text, /Stopping/);
    const sl = (await cmd(t, "/statusline", s.id)).text;
    assert.match(sl, /^mock · ctx \d+%/);
    await cmd(t, "/plan on", s.id); await cmd(t, "/effort low", s.id);
    assert.match((await cmd(t, "/statusline", s.id)).text, /PLAN MODE · effort low/);
    await cmd(t, "/statusline command echo custom-line", s.id);
    assert.match((await cmd(t, "/statusline", s.id)).text, /^custom-line/);
    await cmd(t, "/statusline off", s.id);
    assert.match((await cmd(t, "/statusline", s.id)).text, /off/);
    writeFileSync(join(t.work, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
    const init = await cmd(t, "/init", s.id);
    assert.match(init.send, /Create AGENTS\.md[\s\S]*npm scripts: test = node --test/);
    writeFileSync(join(t.work, "CLAUDE.md"), "# notes\n");
    assert.match((await cmd(t, "/init", s.id)).send, /Improve the existing CLAUDE\.md/);
    const bug = (await cmd(t, "/bug the reply was empty", s.id)).text;
    const file = /written to (\S+\.md)/.exec(bug)[1];
    assert.match(readFileSync(file, "utf8"), /## What happened\nthe reply was empty/);
    assert.ok((await cmd(t, "/release-notes", s.id)).text.length > 20);
    assert.match((await cmd(t, "/terminal-setup", s.id)).text, /Option/);
    await cmd(t, "/keybindings set ctrl+g /status", s.id);
    assert.equal(t.rt.cfg.data.ui.keybindings["ctrl+g"], "/status");
    assert.match((await cmd(t, "/keybindings set ctrl+c /status", s.id)).text, /built-in/);
    assert.match((await cmd(t, "/keybindings", s.id)).text, /ctrl\+g\s+\/status/);
    await cmd(t, "/vim on", s.id); assert.equal(t.rt.cfg.data.ui.vim, true);
    await cmd(t, "/vim", s.id); assert.equal(t.rt.cfg.data.ui.vim, false);
    assert.match((await cmd(t, "/help", s.id)).text, /\/worktree new[\s\S]*INPUT PREFIXES/);
  } finally { await t.close(); }
});

test("vim keys", async () => {
  const { newVimState, vimKey } = await import(dist("cli/vim.js"));
  const st = newVimState();
  let line = "hello big world", cur = line.length;
  const k = (ch, name) => { const r = vimKey(st, line, cur, ch, name); if (r.action) return r.action; line = r.line; cur = r.cursor; return null; };
  assert.equal(k("x"), "passthrough");                    // insert mode passes keys through
  k("", "escape"); assert.equal(st.mode, "normal"); assert.equal(cur, 14);
  k("0"); assert.equal(cur, 0);
  k("w"); assert.equal(cur, 6);
  k("d"); k("w"); assert.equal(line, "hello world"); assert.equal(cur, 6);
  k("u"); assert.equal(line, "hello big world");
  k("$"); k("x"); assert.equal(line, "hello big worl");
  k("0"); k("c"); k("w"); assert.equal(line, " big worl"); assert.equal(st.mode, "insert");
  k("", "escape"); k("0"); k("r"); k("B"); assert.equal(line, "Bbig worl");
  k("~"); assert.equal(line, "bbig worl");
  k("d"); k("d"); assert.equal(line, ""); k("p"); assert.equal(line, "bbig worl");
  k("A"); assert.equal(st.mode, "insert"); assert.equal(cur, line.length);
  k("", "escape"); assert.equal(k("k"), "history_prev");
});

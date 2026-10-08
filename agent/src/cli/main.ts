/** `harness` command-line entry point. */
import { importPlan } from "../kanban/plan.js";
import { existsSync, readFileSync, statSync, watch, openSync, readSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Runtime, VERSION } from "../runtime/runtime.js";
import { ConfigStore, resolveHome } from "../config.js";
import { repl } from "./repl.js";
import { doctor } from "./doctor.js";
import { browserCommand } from "./browser-cmd.js";
import { setup } from "./setup.js";
import { startServer } from "../server/http.js";
import { GatewayManager, approvePairing } from "../gateway/manager.js";
import { serveMcp } from "../mcp/server.js";
import { presetConfig, presetList } from "../mcp/presets.js";
import { runBatch } from "../batch/runner.js";
import { exportSession } from "../runtime/export.js";
import { insights } from "../runtime/commands.js";
import { stringifyYaml, parseScalar } from "../util/yaml.js";
import { bold, cyan, gray, green, magenta, red, toolLine } from "./ui.js";

interface Flags { profile?: string; cwd?: string; model?: string; yolo?: boolean; resume?: string; json?: boolean; port?: number; host?: string; verbose?: boolean; [k: string]: any }

export function parseArgs(argv: string[]): { cmd: string[]; flags: Flags } {
  const flags: Flags = {};
  const cmd: string[] = [];
  const valueFlags: Record<string, string> = { "-p": "profile", "--profile": "profile", "--cwd": "cwd", "-m": "model", "--model": "model", "--resume": "resume", "-r": "resume", "--port": "port", "--host": "host", "-q": "query", "--query": "query", "--format": "format", "--deliver": "deliver", "--out": "out", "--concurrency": "concurrency", "--days": "days", "--name": "name", "--skills": "skills", "--goal": "goal", "--base-url": "base-url", "--provider": "provider", "--context-window": "context-window" };
  const BOOL = new Set(["--yolo", "--json", "-v", "--verbose", "-f", "--follow", "--errors", "--now", "--gateway", "--no-open", "-h", "--help", "--version"]);
  let queryFromRest = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (valueFlags[a]) {
      const next = argv[i + 1];
      // never swallow another flag as the value: `-q --yolo "task"` means query = "task"
      if (next === undefined || BOOL.has(next) || valueFlags[next]) { if (valueFlags[a] === "query") queryFromRest = true; continue; }
      flags[valueFlags[a]] = argv[++i]; continue;
    }
    if (a.startsWith("--") && a.includes("=")) { const [k, v] = a.slice(2).split("="); flags[k] = v; continue; }
    if (a === "--yolo") flags.yolo = true;
    else if (a === "--json") flags.json = true;
    else if (a === "-v" || a === "--verbose") flags.verbose = true;
    else if (a === "-f" || a === "--follow") flags.follow = true;
    else if (a === "--errors") flags.errors = true;
    else if (a === "--now") flags.now = true;
    else if (a === "--gateway") flags.gateway = true;
    else if (a === "--no-open") flags.noOpen = true;
    else if (a === "-h" || a === "--help") flags.help = true;
    else if (a === "--version") flags.version = true;
    else cmd.push(a);
  }
  if (queryFromRest && !flags.query && cmd.length) flags.query = cmd.splice(0).join(" ");
  return { cmd, flags };
}

const HELP = `${bold("harness")} — stitaP agent runtime ${VERSION}

${bold("Chat")}
  harness                         interactive terminal chat
  harness "task…"  |  -q "task"   one-shot: run a task and print the result (--json for JSON)
  harness ui                      start the server and open the web chat
  harness --resume <session>      continue a session (with -q: send one more message to it)

${bold("Server & integrations")}
  harness serve [--port 7420] [--host 127.0.0.1] [--gateway]   web chat + API + OpenAI-compatible /v1 + cron/kanban workers
  harness gateway                 serve + Telegram/Discord/Slack/webhook gateway
  harness mcp serve               expose tools over MCP (stdio) for Claude Desktop, Cursor, VS Code…
  harness mcp list                status of configured MCP servers
  harness mcp presets | add <preset> [args]   one-line setup: filesystem, fetch, sqlite, postgres, memory
  harness pairing list | approve <code>

${bold("Setup")}
  harness setup                   first-run wizard          harness doctor        diagnose
  harness browser setup           install browser control (uses your Chrome if installed)
  harness browser chrome          start your Chrome with a debug port and attach the agent to it
  harness browser status          which browser the agent will use
  harness model [name] [--base-url …] [--provider openai|anthropic]
  harness config get <key> | set <key> <value> | path | show
  harness secret set <NAME> <value>                          (stored in ~/.stitap/.env)

${bold("Automation")}
  harness cron list | add "<schedule>" "<prompt>" [--deliver telegram:<id>] | run <id> | pause <id> | resume <id> | rm <id> | tick
  harness kanban list | board | report | show <key> | add "<title>" [--goal ..] [--test "<cmd>"] [--type epic|task|bug] | comment <key> "<text>" [--reply <id>] | run | resume | test <key> | verify <key> | gentests <key> | regression [key] | sync <key> | import <planDir> --project <dir> [--tests <dir>] [--key PT]
  harness batch <prompts.jsonl> --out traj.jsonl [--concurrency 4]

${bold("Data")}
  harness sessions [list | show <id> | export <id> --format md|json|sharegpt | rm <id>]
  harness skills [list | show <name>]     harness memory     harness insights [--days 7]
  harness logs [-f] [--errors]

${bold("Flags")}  -p/--profile <name>  --cwd <dir>  -m/--model <name>  --yolo  -v/--verbose
`;

async function makeRuntime(f: Flags, extra: { mcp?: boolean } = {}): Promise<Runtime> {
  const rt = await Runtime.create({ profile: f.profile, cwd: f.cwd ? resolve(f.cwd) : process.cwd(), mcp: extra.mcp });
  if (f.model) rt.cfg.data.model = { ...rt.cfg.data.model, name: f.model };
  return rt;
}

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try { spawn(cmd, args, { stdio: "ignore", detached: true }).unref(); } catch { /* headless */ }
}

async function oneShot(f: Flags, prompt: string) {
  const rt = await makeRuntime(f);
  // --resume <id> continues an existing session (scripted fix-and-retry loops); otherwise start a new one
  const resumed = f.resume ? rt.db.getSession(f.resume) : null;
  if (f.resume && !resumed) { console.error(`no session ${f.resume} (see: harness sessions list)`); await rt.shutdown(); process.exitCode = 2; return; }
  const s = resumed ?? rt.createSession({ source: "cli", title: prompt.slice(0, 60) });
  if (f.yolo) rt.approvals.yoloSessions.add(s.id);
  rt.attached.set(s.id, 1);
  let streamed = false;
  if (!f.json) rt.on("event", (ev) => {
    if (ev.sessionId !== s.id) return;
    if (ev.type === "token") { process.stdout.write(ev.text); streamed = true; }
    if (ev.type === "assistant_step" && streamed) { process.stdout.write("\n"); streamed = false; }
    if (ev.type === "tool_start") process.stderr.write(toolLine(ev.name, ev.args) + "\n");
    if (ev.type === "tool_end" && !ev.ok) process.stderr.write(red(`  ✗ ${String(ev.result).split("\n")[0].slice(0, 200)}\n`));
    if (ev.type === "approval_request") process.stderr.write(red(`  ⚠ needs approval (${ev.reason}): ${ev.command} — denied in one-shot mode (use --yolo or the interactive chat)\n`));
  });
  if (f.goal) rt.db.setMeta(`goal:${s.id}`, { text: f.goal === "true" ? prompt : f.goal, status: "active", turns: 0, max_turns: rt.cfg.data.goals.max_turns, created_at: Date.now() });
  const r = await rt.send(s.id, prompt, { source: "cli", approvalMode: f.yolo ? "yolo" : "deny" });
  await rt.waitIdle(s.id);
  const last = [...rt.db.getMessages(s.id)].reverse().find((m) => m.role === "assistant" && !m.tool_calls?.length);
  const final = last?.content ?? r.final;
  if (f.json) console.log(JSON.stringify({ session: s.id, final, error: r.error ?? null, iterations: r.iterations, tool_calls: r.toolCalls, usage: r.usage }));
  else if (!streamed) console.log(final); else process.stdout.write("\n");
  await rt.shutdown();
  process.exitCode = r.error ? 1 : 0;
}

export async function main(argv: string[]): Promise<void> {
  const { cmd, flags: f } = parseArgs(argv);
  if (f.version) { console.log(VERSION); return; }
  if (f.help || cmd[0] === "help") { console.log(HELP); return; }
  if (f.query) return oneShot(f, f.query);
  const [c, ...rest] = cmd;

  switch (c) {
    case undefined: {
      const rt = await makeRuntime(f);
      await repl(rt, { sessionId: f.resume, yolo: f.yolo });
      await rt.shutdown();
      return;
    }
    case "serve": case "ui": case "gateway": case "daemon": {
      const rt = await makeRuntime(f);
      const srv = await startServer(rt, { port: f.port ? Number(f.port) : undefined, host: f.host });
      rt.startBackground();
      await rt.storeBridge.load();
      console.log(`${green("●")} stitaP agent ${VERSION} serving ${bold(srv.url)}  ${gray(`(model ${rt.cfg.data.model.name}, home ${rt.home})`)}`);
      console.log(gray(`  web chat: ${srv.url}/   API token: ${join(rt.home, "server.token")}   OpenAI-compatible: ${srv.url}/v1`));
      if (c === "gateway" || f.gateway) {
        const gw = new GatewayManager(rt);
        const started = await gw.start(srv);
        console.log(gray(`  gateway: ${started.join(", ") || "no platforms enabled (see gateway: in config.yaml)"}`));
      }
      if (c === "ui" && !f.noOpen) openBrowser(`${srv.url}/`);
      const stop = async () => { console.log(gray("\nshutting down…")); await srv.close(); await rt.shutdown(); process.exit(0); };
      process.on("SIGINT", stop); process.on("SIGTERM", stop);
      await new Promise(() => undefined);
      return;
    }
    case "mcp": {
      if (rest[0] === "serve") { const rt = await makeRuntime(f); await serveMcp(rt); await rt.shutdown(); return; }
      if (rest[0] === "presets") { console.log(`MCP presets:\n${presetList()}`); return; }
      if (rest[0] === "add") {
        const home = resolveHome(f.profile), cfg = new ConfigStore(home);
        const [, preset, ...pargs] = rest;
        try {
          const entry = presetConfig(preset ?? "", pargs, process.cwd());
          cfg.set(`mcp_servers.${f.name ?? preset}`, entry);
          console.log(`added MCP server "${f.name ?? preset}": ${[entry.command, ...(entry.args ?? [])].join(" ")}\nrestart the chat (or run \`harness mcp list\`) to connect`);
        } catch (e: any) { console.error(e.message); process.exitCode = 1; }
        return;
      }
      const rt = await makeRuntime(f);
      console.log(rt.mcp.summary());
      for (const conn of rt.mcp.conns.values()) for (const t of conn.tools) console.log(`  ${conn.name}.${t.name}: ${(t.description ?? "").slice(0, 100)}`);
      await rt.shutdown();
      return;
    }
    case "setup": { const cfg = new ConfigStore(resolveHome(f.profile)); await setup(cfg); return; }
    case "browser": { const home = resolveHome(f.profile); const cfg = new ConfigStore(home); process.exitCode = await browserCommand(cfg, home, rest[0], f); return; }
    case "doctor": { const rt = await makeRuntime(f); process.exitCode = await doctor(rt, { quick: rest[0] === "quick" }); await rt.shutdown(); return; }
    case "model": {
      const cfg = new ConfigStore(resolveHome(f.profile));
      if (rest[0]) cfg.set("model.name", rest[0]);
      if (f["base-url"]) cfg.set("model.base_url", f["base-url"]);
      if (f.provider) cfg.set("model.provider", f.provider);
      if (f["context-window"]) cfg.set("model.context_window", Number(f["context-window"]));
      console.log(stringifyYaml({ model: cfg.data.model }));
      return;
    }
    case "config": {
      const cfg = new ConfigStore(resolveHome(f.profile));
      const [sub, key, ...v] = rest;
      if (sub === "path") console.log(cfg.path);
      else if (sub === "get") console.log(stringifyYaml(cfg.get(key) ?? null));
      else if (sub === "set") { cfg.set(key, parseScalar(v.join(" "))); console.log(green(`${key} = ${JSON.stringify(cfg.get(key))}`)); }
      else console.log(stringifyYaml(cfg.data));
      return;
    }
    case "secret": {
      const cfg = new ConfigStore(resolveHome(f.profile));
      if (rest[0] === "set" && rest[1]) { cfg.setSecret(rest[1], rest[2] ?? ""); console.log(green(`saved ${rest[1]} to ${join(cfg.home, ".env")}`)); }
      else console.log(Object.keys(cfg.env).join("\n") || "(no secrets)");
      return;
    }
    case "cron": {
      const rt = await makeRuntime(f, { mcp: rest[0] === "run" || rest[0] === "tick" });
      const [sub = "list", a1, a2] = rest;
      if (sub === "list") for (const j of rt.cron.list()) console.log(`${j.id}  [${j.enabled ? "on " : "off"}] ${j.schedule_text.padEnd(18)} next ${new Date(j.next_run).toLocaleString()} → ${j.deliver}  ${j.name}`);
      else if (sub === "add") { const j = rt.cron.create({ schedule: a1, prompt: a2, deliver: f.deliver, name: f.name, skills: f.skills?.split(",") }); console.log(green(`added ${j.id} (${j.schedule}), next run ${new Date(j.next_run).toLocaleString()}`)); }
      else if (sub === "run") console.log(await rt.cron.run(a1));
      else if (sub === "pause" || sub === "resume") { rt.cron.update(a1, { enabled: sub === "resume" }); console.log("ok"); }
      else if (sub === "rm" || sub === "remove") console.log(rt.cron.remove(a1) ? "removed" : "not found");
      else if (sub === "tick") { const n = await rt.cron.tick(); console.log(`fired ${n} job(s)`); await new Promise((r) => setTimeout(r, 500)); while ((rt as any).cron.running?.size) await new Promise((r) => setTimeout(r, 500)); }
      await rt.shutdown();
      return;
    }
    case "kanban": {
      const rt = await makeRuntime(f);
      const [sub = "list", a1, a2] = rest;
      const K = rt.kanban;
      try {
        if (sub === "add") console.log(K.create({ title: a1, body: f.goal ?? "", test_cmd: f.test, type: f.type, parent: f.parent, cwd: f.cwd }).key);
        else if (sub === "run") { K.recover(); const ready = K.ready(); for (const card of ready.slice(0, rt.cfg.data.kanban.workers)) { const done = await K.work(card.id); console.log(`${done.key ?? done.id} → ${done.status}`); } if (!ready.length) console.log("no ready cards"); }
        else if (sub === "resume") { const r = K.recover(); console.log(`re-queued ${r.length} interrupted card(s)`); }
        else if (sub === "show") console.log(K.show(a1));
        else if (sub === "board") console.log(K.board());
        else if (sub === "report") console.log(K.report());
        else if (sub === "comment") { K.comment(a1, a2, "user", f.reply); console.log("ok"); }
        else if (sub === "test") { const t = await K.runTests(a1); console.log(`exit ${t.code}\n${t.output}`); }
        else if (sub === "verify") { const v = await K.verify(a1); console.log(v.markdown); if (!v.ok) process.exitCode = 1; }
        else if (sub === "gentests") console.log(`wrote ${K.genTests(a1)}`);
        else if (sub === "regression") console.log(await K.regression(a1));
        else if (sub === "sync") console.log(`linked ${await K.syncCommits(a1)} commit(s)`);
        else if (sub === "import") console.log(importPlan(K, { planDir: a1, projectDir: f.project, testsDir: f.tests, keyPrefix: f.key }));
        else for (const k of K.list()) console.log(K.fmt(k));
      } catch (e: any) { console.error(`kanban: ${e.message}`); process.exitCode = 1; }
      await rt.shutdown();
      return;
    }
    case "batch": {
      const rt = await makeRuntime(f);
      const out = f.out ?? "trajectories.jsonl";
      const r = await runBatch(rt, rest[0], out, { concurrency: Number(f.concurrency) || 4, approvalMode: f.yolo ? "yolo" : "deny", onProgress: (d, t) => process.stderr.write(`\r${d}/${t}`) });
      console.log(`\n${r.ok} ok, ${r.failed} failed → ${out}`);
      await rt.shutdown();
      return;
    }
    case "sessions": {
      const rt = await makeRuntime(f, { mcp: false });
      const [sub = "list", id] = rest;
      if (sub === "list") for (const s of rt.db.listSessions({ limit: 30 })) console.log(`${s.id}  ${new Date(s.updated_at).toLocaleString()}  [${s.source}] ${s.title}`);
      else if (sub === "show") for (const m of rt.db.getMessages(id)) console.log(`${m.role === "user" ? green("you") : m.role === "assistant" ? magenta("agent") : gray(m.role)}: ${(m.content ?? (m.tool_calls ?? []).map((t) => `${t.name}(${t.arguments})`).join(" ")).slice(0, 2000)}\n`);
      else if (sub === "export") console.log(exportSession(rt, id, (f.format ?? "md") as any, f.out));
      else if (sub === "rm") { rt.db.deleteSession(id); console.log("deleted"); }
      await rt.shutdown();
      return;
    }
    case "skills": {
      const rt = await makeRuntime(f, { mcp: false });
      if (rest[0] === "show") console.log(rt.skills.view(rest[1]));
      else for (const s of rt.skills.list()) console.log(`${cyan(s.name.padEnd(28))} ${gray(`[${s.category}/${s.source}]`)} ${s.description.slice(0, 100)}`);
      await rt.shutdown();
      return;
    }
    case "memory": { const rt = await makeRuntime(f, { mcp: false }); console.log(rt.memory.snapshot() || "(empty)"); await rt.shutdown(); return; }
    case "insights": { const rt = await makeRuntime(f, { mcp: false }); console.log(insights(rt, Number(f.days) || 7)); await rt.shutdown(); return; }
    case "pairing": {
      const rt = await makeRuntime(f, { mcp: false });
      if (rest[0] === "approve") console.log(approvePairing(rt, rest[1] ?? ""));
      else { const l = rt.db.listRecords<any>("pairing"); console.log(l.map((p) => `${p.code}  ${p.platform}  ${p.userName} (${p.userId})  ${new Date(p.at).toLocaleString()}`).join("\n") || "no pending pairing requests"); }
      await rt.shutdown();
      return;
    }
    case "logs": {
      const home = resolveHome(f.profile);
      const file = join(home, "logs", f.errors ? "errors.log" : "agent.log");
      if (!existsSync(file)) { console.log("(no logs yet)"); return; }
      const text = readFileSync(file, "utf8").split("\n");
      console.log(text.slice(-80).join("\n"));
      if (f.follow) {
        let pos = statSync(file).size;
        watch(file, () => {
          const size = statSync(file).size;
          if (size < pos) pos = 0;
          const fd = openSync(file, "r"); const buf = Buffer.alloc(size - pos); readSync(fd, buf, 0, buf.length, pos); closeSync(fd);
          pos = size; process.stdout.write(buf.toString());
        });
        await new Promise(() => undefined);
      }
      return;
    }
    case "version": console.log(VERSION); return;
    default:
      return oneShot(f, cmd.join(" "));
  }
}

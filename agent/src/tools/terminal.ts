import { existsSync } from "node:fs";
import { dangerReason, isMutating } from "../safety/dangerous.js";
import { resolvePath } from "../safety/paths.js";
import { type Tool, obj, str, int, bool, enm } from "./types.js";

export const terminalTool: Tool = {
  name: "terminal",
  toolset: "terminal",
  tier: "slm",
  description:
    "Run a shell command on the user's machine (non-interactive). The working directory persists between calls (use `cd`). " +
    "Use for running programs, tests, git, package managers, builds. Set background=true for servers or long jobs, then use process_manage. " +
    "Never use interactive commands (vim, less, top); pass -y/--yes flags. Prefer read_file/patch over cat/sed for file edits.",
  parameters: obj({
    command: str("The command to run"),
    timeout: int("Timeout in seconds (default from config, max 3600)"),
    background: bool("Run in the background and return a process id immediately"),
    workdir: str("Directory to run in (defaults to the session's current directory)"),
  }, ["command"]),
  async handler(a, ctx) {
    const command = String(a.command ?? "").trim();
    if (!command) return "error: empty command";
    const rt = ctx.rt;
    const cwd = a.workdir ? resolvePath(ctx.cwd, a.workdir) : ctx.cwd;
    const why = dangerReason(command);
    if (why) {
      const ok = await ctx.requestApproval({ tool: "terminal", command, reason: why });
      if (!ok) return `BLOCKED: this command was not approved (${why}). Do not retry it; choose a safer approach or ask the user.`;
    }
    if (isMutating(command)) rt.checkpoints.take(cwd, `before: ${command.slice(0, 120)}`);
    if (a.background) {
      const p = rt.processes.start(rt.terminal, command, cwd, ctx.session.id, true);
      return `Started background process ${p.id} (pid ${p.pid ?? "?"}). Use process_manage with action=poll/log/wait/kill and id=${p.id}. You'll be notified when it exits.`;
    }
    const timeoutS = Math.min(Number(a.timeout) || rt.cfg.data.terminal.timeout, 3600);
    let lastFlush = 0, pending = "";
    const res = await rt.terminal.exec(command, {
      cwd, timeoutMs: timeoutS * 1000, signal: ctx.signal,
      onOutput: (chunk) => {
        pending += chunk;
        const now = Date.now();
        if (now - lastFlush > 120) { ctx.progress(pending); pending = ""; lastFlush = now; }
      },
    });
    if (pending) ctx.progress(pending);
    if (res.cwd && res.cwd !== ctx.cwd && existsSync(res.cwd)) ctx.setCwd(res.cwd);
    const head = res.interrupted ? "[interrupted by user]" : res.timedOut ? `[timed out after ${timeoutS}s — consider background=true]` : `exit code: ${res.exitCode}`;
    const body = res.output.trim() || "(no output)";
    return `${head}\n${body}${res.truncatedBytes ? `\n[${res.truncatedBytes} more bytes not captured]` : ""}${res.cwd !== cwd ? `\n[cwd is now ${res.cwd}]` : ""}`;
  },
};

export const processTool: Tool = {
  name: "process_manage",
  toolset: "terminal",
  tier: "standard",
  description: "Manage background processes started with terminal(background=true): list, poll (new output), log (tail), wait (until exit or timeout), kill, write (send stdin).",
  parameters: obj({
    action: enm(["list", "poll", "log", "wait", "kill", "write"], "What to do"),
    id: str("Process id (all actions except list)"),
    input: str("Text to send to stdin (write); include \\n for Enter"),
    timeout: int("Seconds to wait (wait; default 60)"),
  }, ["action"]),
  async handler(a, ctx) {
    const P = ctx.rt.processes;
    const fmt = (p: any) => `${p.id} [${p.status}${p.exitCode !== null ? ` exit ${p.exitCode}` : ""}] ${p.command.slice(0, 100)} (started ${new Date(p.startedAt).toLocaleTimeString()})`;
    switch (a.action) {
      case "list": { const l = P.list(ctx.session.id); return l.length ? l.map(fmt).join("\n") : "No background processes."; }
      case "poll": { const r = P.poll(a.id); return r ? `${fmt(r.proc)}\n--- new output ---\n${r.newOutput || "(none)"}` : `unknown process ${a.id}`; }
      case "log": { const t = P.tail(a.id, 8000); const p = P.get(a.id); return p ? `${fmt(p)}\n--- last output ---\n${t || "(empty)"}\nFull log: ${p.logFile}` : `unknown process ${a.id}`; }
      case "wait": { const p = await P.wait(a.id, (Number(a.timeout) || 60) * 1000, ctx.signal); return p ? `${fmt(p)}\n--- last output ---\n${P.tail(a.id, 4000) || "(empty)"}` : `unknown process ${a.id}`; }
      case "kill": return P.kill(a.id) ? `stopped ${a.id} (interrupted; force-killed after 3 s if it does not exit)` : `process ${a.id} is not running`;
      case "write": return P.write(a.id, String(a.input ?? "")) ? "sent" : `process ${a.id} is not running`;
      default: return `unknown action ${a.action}`;
    }
  },
};

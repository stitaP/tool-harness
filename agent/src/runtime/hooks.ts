/**
 * Lifecycle hooks and plugins.
 *
 * Plugins: ~/.stitap/plugins/<name>.mjs or <name>/index.mjs exporting
 *   export default function register(ctx) {
 *     ctx.registerTool({ name, description, parameters, toolset, handler })
 *     ctx.on("pre_tool_call", ({ sessionId, tool, args }) => "reason to block" | undefined)
 *     ctx.on("post_tool_call", ({ tool, args, result }) => {})
 *     ctx.on("on_turn_end" | "on_session_start" | "on_session_end" | "pre_llm_call", (payload) => {})
 *   }
 * Shell hooks (config.yaml):  hooks: { post_tool_call: ["notify-send done"] } — payload JSON on stdin.
 *   An entry can also be { match: "<tool name regex>", command: "…" } to run only for some tools.
 *   pre_tool_call shell hooks are awaited (10s): exit code 2 blocks the call, stderr is the reason the model sees.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Runtime } from "./runtime.js";
import type { Tool } from "../tools/types.js";
import { log } from "../util/log.js";

type Handler = (payload: any) => any;
export type ShellHook = string | { match?: string; command: string };
export interface ShellRun { command: string; code: number | null; stdout: string; stderr: string; ms: number }

const hookCommand = (h: ShellHook) => (typeof h === "string" ? h : h.command);
function hookMatches(h: ShellHook, payload: any): boolean {
  if (typeof h === "string" || !h.match) return true;
  try { return new RegExp(h.match).test(String(payload?.tool ?? "")); } catch { return false; }
}
export const HOOK_EVENTS = ["pre_tool_call", "post_tool_call", "pre_llm_call", "on_turn_end", "on_session_start", "on_session_end", "on_message"] as const;

export class HookBus {
  private handlers = new Map<string, Handler[]>();
  loaded: { name: string; path: string; tools: string[]; error?: string }[] = [];

  constructor(private rt: Runtime) {}

  on(event: string, fn: Handler): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(fn);
  }

  async emit(event: string, payload: any): Promise<any[]> {
    const out: any[] = [];
    for (const fn of this.handlers.get(event) ?? []) {
      try { out.push(await fn(payload)); } catch (e: any) { log.warn(`hook ${event} failed: ${e.message}`); }
    }
    if (event !== "pre_tool_call") for (const h of this.shellHooks(event)) if (hookMatches(h, payload)) this.runShell(hookCommand(h), { event, ...payload });
    return out;
  }

  shellHooks(event: string): ShellHook[] { return ((this.rt.cfg.data.hooks as any)?.[event] ?? []).filter((h: any) => typeof h === "string" ? h.trim() : h?.command); }

  /** Plugin handlers registered per event (for /hooks). */
  handlerCount(event: string): number { return this.handlers.get(event)?.length ?? 0; }

  /** Run a shell hook and wait for it: exit code, stdout and stderr. */
  runShellWait(cmd: string, payload: any, timeoutMs = 10_000): Promise<ShellRun> {
    const started = Date.now();
    return new Promise((res) => {
      let stdout = "", stderr = "", done = false;
      const finish = (code: number | null) => { if (done) return; done = true; clearTimeout(t); res({ command: cmd, code, stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 4000), ms: Date.now() - started }); };
      let child: ReturnType<typeof spawn>;
      try {
        const shell = this.rt.terminal.shell;
        child = spawn(shell.exe, shell.args(cmd), { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, cwd: payload?.cwd });
      } catch (e: any) { stderr = e.message; finish(127); return; }
      const t = setTimeout(() => { stderr += `\n[hook timed out after ${timeoutMs / 1000}s]`; try { child.kill("SIGKILL"); } catch { /* gone */ } finish(null); }, timeoutMs);
      child.stdout?.on("data", (b) => { stdout += b; });
      child.stderr?.on("data", (b) => { stderr += b; });
      child.on("error", (e) => { stderr += e.message; finish(127); });
      child.on("close", (code) => finish(code));
      child.stdin?.on("error", () => { /* hook did not read stdin */ });
      child.stdin?.end(JSON.stringify(payload));
    });
  }

  private runShell(cmd: string, payload: any): void {
    try {
      const shell = this.rt.terminal.shell;
      const child = spawn(shell.exe, shell.args(cmd), { stdio: ["pipe", "ignore", "ignore"], detached: false, windowsHide: true });
      child.on("error", () => { /* ignore */ });
      child.stdin?.end(JSON.stringify(payload));
    } catch (e: any) { log.warn(`shell hook failed: ${e.message}`); }
  }

  /** Returns a block message if any pre_tool_call hook vetoes the call. */
  async preTool(sessionId: string, tool: string, args: any): Promise<string | null> {
    const res = await this.emit("pre_tool_call", { sessionId, tool, args });
    const veto = res.find((r) => typeof r === "string" && r.length);
    if (veto) return `BLOCKED by plugin hook: ${veto}`;
    const payload = { event: "pre_tool_call", sessionId, tool, args, cwd: this.rt.db.getSession(sessionId) ? this.rt.sessionCwd(sessionId) : undefined };
    for (const h of this.shellHooks("pre_tool_call")) {
      if (!hookMatches(h, payload)) continue;
      const r = await this.runShellWait(hookCommand(h), payload);
      if (r.code === 2) return `BLOCKED by hook (${hookCommand(h).slice(0, 80)}): ${(r.stderr || r.stdout).trim() || "no reason given"}`;
      if (r.code !== 0) log.warn(`pre_tool_call hook "${hookCommand(h)}" exited ${r.code}: ${r.stderr.slice(0, 200)}`);
    }
    return null;
  }

  async postTool(sessionId: string, tool: string, args: any, result: string): Promise<void> {
    await this.emit("post_tool_call", { sessionId, tool, args, result });
  }

  async loadPlugins(dir: string): Promise<void> {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const entry = statSync(p).isDirectory() ? ["index.mjs", "index.js"].map((f) => join(p, f)).find(existsSync) : /\.(mjs|js)$/.test(e) ? p : null;
      if (!entry) continue;
      const rec = { name: e.replace(/\.(mjs|js)$/, ""), path: entry, tools: [] as string[], error: undefined as string | undefined };
      try {
        const mod = await import(pathToFileURL(entry).href);
        const register = mod.default ?? mod.register;
        if (typeof register !== "function") throw new Error("plugin must export a default register(ctx) function");
        await register({
          registerTool: (t: Tool) => { this.rt.tools.register({ tier: "standard", ...t, toolset: t.toolset || `plugin:${rec.name}` }); rec.tools.push(t.name); },
          on: (ev: string, fn: Handler) => this.on(ev, fn),
          config: this.rt.cfg.data,
          home: this.rt.home,
          log: (m: string) => log.info(`[plugin ${rec.name}] ${m}`),
        });
      } catch (err: any) {
        rec.error = err.message;
        log.error(`plugin ${e} failed to load: ${err.message}`);
      }
      this.loaded.push(rec);
    }
  }
}

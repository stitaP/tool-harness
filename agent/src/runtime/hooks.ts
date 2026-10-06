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
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Runtime } from "./runtime.js";
import type { Tool } from "../tools/types.js";
import { log } from "../util/log.js";

type Handler = (payload: any) => any;
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
    for (const cmd of (this.rt.cfg.data.hooks as any)?.[event] ?? []) this.runShell(cmd, { event, ...payload });
    return out;
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
    return veto ? `BLOCKED by plugin hook: ${veto}` : null;
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

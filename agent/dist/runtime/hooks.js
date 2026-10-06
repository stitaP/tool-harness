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
import { log } from "../util/log.js";
export const HOOK_EVENTS = ["pre_tool_call", "post_tool_call", "pre_llm_call", "on_turn_end", "on_session_start", "on_session_end", "on_message"];
export class HookBus {
    rt;
    handlers = new Map();
    loaded = [];
    constructor(rt) {
        this.rt = rt;
    }
    on(event, fn) {
        if (!this.handlers.has(event))
            this.handlers.set(event, []);
        this.handlers.get(event).push(fn);
    }
    async emit(event, payload) {
        const out = [];
        for (const fn of this.handlers.get(event) ?? []) {
            try {
                out.push(await fn(payload));
            }
            catch (e) {
                log.warn(`hook ${event} failed: ${e.message}`);
            }
        }
        for (const cmd of this.rt.cfg.data.hooks?.[event] ?? [])
            this.runShell(cmd, { event, ...payload });
        return out;
    }
    runShell(cmd, payload) {
        try {
            const shell = this.rt.terminal.shell;
            const child = spawn(shell.exe, shell.args(cmd), { stdio: ["pipe", "ignore", "ignore"], detached: false, windowsHide: true });
            child.on("error", () => { });
            child.stdin?.end(JSON.stringify(payload));
        }
        catch (e) {
            log.warn(`shell hook failed: ${e.message}`);
        }
    }
    /** Returns a block message if any pre_tool_call hook vetoes the call. */
    async preTool(sessionId, tool, args) {
        const res = await this.emit("pre_tool_call", { sessionId, tool, args });
        const veto = res.find((r) => typeof r === "string" && r.length);
        return veto ? `BLOCKED by plugin hook: ${veto}` : null;
    }
    async postTool(sessionId, tool, args, result) {
        await this.emit("post_tool_call", { sessionId, tool, args, result });
    }
    async loadPlugins(dir) {
        if (!existsSync(dir))
            return;
        for (const e of readdirSync(dir)) {
            const p = join(dir, e);
            const entry = statSync(p).isDirectory() ? ["index.mjs", "index.js"].map((f) => join(p, f)).find(existsSync) : /\.(mjs|js)$/.test(e) ? p : null;
            if (!entry)
                continue;
            const rec = { name: e.replace(/\.(mjs|js)$/, ""), path: entry, tools: [], error: undefined };
            try {
                const mod = await import(pathToFileURL(entry).href);
                const register = mod.default ?? mod.register;
                if (typeof register !== "function")
                    throw new Error("plugin must export a default register(ctx) function");
                await register({
                    registerTool: (t) => { this.rt.tools.register({ tier: "standard", ...t, toolset: t.toolset || `plugin:${rec.name}` }); rec.tools.push(t.name); },
                    on: (ev, fn) => this.on(ev, fn),
                    config: this.rt.cfg.data,
                    home: this.rt.home,
                    log: (m) => log.info(`[plugin ${rec.name}] ${m}`),
                });
            }
            catch (err) {
                rec.error = err.message;
                log.error(`plugin ${e} failed to load: ${err.message}`);
            }
            this.loaded.push(rec);
        }
    }
}

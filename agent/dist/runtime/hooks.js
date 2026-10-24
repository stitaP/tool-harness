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
import { log } from "../util/log.js";
const hookCommand = (h) => (typeof h === "string" ? h : h.command);
function hookMatches(h, payload) {
    if (typeof h === "string" || !h.match)
        return true;
    try {
        return new RegExp(h.match).test(String(payload?.tool ?? ""));
    }
    catch {
        return false;
    }
}
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
        if (event !== "pre_tool_call")
            for (const h of this.shellHooks(event))
                if (hookMatches(h, payload))
                    this.runShell(hookCommand(h), { event, ...payload });
        return out;
    }
    shellHooks(event) { return (this.rt.cfg.data.hooks?.[event] ?? []).filter((h) => typeof h === "string" ? h.trim() : h?.command); }
    /** Plugin handlers registered per event (for /hooks). */
    handlerCount(event) { return this.handlers.get(event)?.length ?? 0; }
    /** Run a shell hook and wait for it: exit code, stdout and stderr. */
    runShellWait(cmd, payload, timeoutMs = 10_000) {
        const started = Date.now();
        return new Promise((res) => {
            let stdout = "", stderr = "", done = false;
            const finish = (code) => { if (done)
                return; done = true; clearTimeout(t); res({ command: cmd, code, stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 4000), ms: Date.now() - started }); };
            let child;
            try {
                const shell = this.rt.terminal.shell;
                child = spawn(shell.exe, shell.args(cmd), { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, cwd: payload?.cwd });
            }
            catch (e) {
                stderr = e.message;
                finish(127);
                return;
            }
            const t = setTimeout(() => { stderr += `\n[hook timed out after ${timeoutMs / 1000}s]`; try {
                child.kill("SIGKILL");
            }
            catch { /* gone */ } finish(null); }, timeoutMs);
            child.stdout?.on("data", (b) => { stdout += b; });
            child.stderr?.on("data", (b) => { stderr += b; });
            child.on("error", (e) => { stderr += e.message; finish(127); });
            child.on("close", (code) => finish(code));
            child.stdin?.on("error", () => { });
            child.stdin?.end(JSON.stringify(payload));
        });
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
        if (veto)
            return `BLOCKED by plugin hook: ${veto}`;
        const payload = { event: "pre_tool_call", sessionId, tool, args, cwd: this.rt.db.getSession(sessionId) ? this.rt.sessionCwd(sessionId) : undefined };
        for (const h of this.shellHooks("pre_tool_call")) {
            if (!hookMatches(h, payload))
                continue;
            const r = await this.runShellWait(hookCommand(h), payload);
            if (r.code === 2)
                return `BLOCKED by hook (${hookCommand(h).slice(0, 80)}): ${(r.stderr || r.stdout).trim() || "no reason given"}`;
            if (r.code !== 0)
                log.warn(`pre_tool_call hook "${hookCommand(h)}" exited ${r.code}: ${r.stderr.slice(0, 200)}`);
        }
        return null;
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

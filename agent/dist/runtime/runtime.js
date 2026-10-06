/**
 * Runtime: the long-lived agent process. Owns state, tools, providers,
 * sessions (each with a FIFO turn queue), approvals, background schedulers,
 * and an event stream that every client (CLI, web, gateway, API) subscribes to.
 */
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, statSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { resourcePath } from "../util/resources.js";
import { ConfigStore, resolveHome } from "../config.js";
import { openState } from "../state/db.js";
import { buildAuxProvider, buildMainProvider } from "../providers/index.js";
import { ToolRegistry } from "../tools/registry.js";
import { LocalBackend, DockerBackend, SshBackend, ProcessRegistry } from "../tools/backends.js";
import { terminalTool, processTool } from "../tools/terminal.js";
import { runTestsTool } from "../tools/tests.js";
import { fileHistoryTool } from "../tools/history.js";
import { pageCheckTool } from "../tools/pagecheck.js";
import { siteTemplateTool } from "../tools/sitetemplate.js";
import { financeTool } from "../tools/finance.js";
import { strapiTool } from "../tools/strapi.js";
import { readFileTool, writeFileTool, patchTool, searchFilesTool, listDirTool } from "../tools/files.js";
import { webSearchTool, webExtractTool } from "../tools/web.js";
import { docsLookupTool } from "../tools/docs.js";
import { officeTool } from "../tools/office.js";
import { captureTools } from "../tools/capture.js";
import { webtestTool } from "../tools/webtest.js";
import { PipelineRunner, pipelineTool } from "../loop/pipeline.js";
import { todoTool, memoryTool, skillsListTool, skillViewTool, skillManageTool, sessionSearchTool, clarifyTool, toolSearchTool, useToolTool } from "../tools/agent-tools.js";
import { delegateTool } from "../tools/delegate.js";
import { executeCodeTool, findPython } from "../tools/execute-code.js";
import { visionTool } from "../tools/vision.js";
import { browserTools, closeBrowsers } from "../tools/browser.js";
import { desktopTool } from "../tools/desktop.js";
import { ApprovalManager } from "../safety/approvals.js";
import { Checkpoints } from "../safety/checkpoints.js";
import { MemoryStore } from "../memory/store.js";
import { SkillStore } from "../skills/store.js";
import { buildSystemPrompt } from "../prompt/builder.js";
import { runTurn } from "../loop/agent.js";
import { afterTurn, goalKey, heartbeatKey, heartbeatPrompt, loopKey, loopPrompt } from "../loop/autonomy.js";
import { curate } from "../loop/curator.js";
import { CronScheduler, cronTool } from "../cron/scheduler.js";
import { KanbanBoard, kanbanTool } from "../kanban/board.js";
import { McpManager } from "../mcp/client.js";
import { HookBus } from "./hooks.js";
import { StoreBridge } from "./store-bridge.js";
import { log } from "../util/log.js";
import { errMsg, newId } from "../util/misc.js";
import { redact } from "../util/redact.js";
export const VERSION = "0.1.0";
class SessionRunner {
    rt;
    sid;
    queue = [];
    busy = false;
    ctrl = null;
    steers = [];
    idleWaiters = [];
    constructor(rt, sid) {
        this.rt = rt;
        this.sid = sid;
    }
    enqueue(text, o = {}) {
        return new Promise((resolveP, reject) => {
            this.queue.push({ ...o, text, resolve: resolveP, reject });
            void this.pump();
        });
    }
    idle() { return !this.busy && this.queue.length === 0; }
    waitIdle() {
        if (this.idle())
            return Promise.resolve();
        return new Promise((r) => this.idleWaiters.push(r));
    }
    interrupt(clearQueue = false) {
        if (clearQueue) {
            for (const q of this.queue.splice(0))
                q.resolve({ final: "(cancelled)", iterations: 0, toolCalls: 0, toolNames: [], interrupted: true, usage: { input: 0, output: 0 } });
        }
        this.rt.approvals.cancelSession(this.sid);
        this.rt.cancelClarify(this.sid);
        if (this.ctrl && !this.ctrl.signal.aborted) {
            this.ctrl.abort();
            return true;
        }
        return false;
    }
    steer(text) {
        if (this.busy) {
            this.steers.push(text);
            this.rt.emitEvent(this.sid, { type: "status", text: "Steer message will be delivered after the current step" });
            return "steered";
        }
        void this.enqueue(text, { source: "user" });
        return "queued";
    }
    async pump() {
        if (this.busy)
            return;
        const item = this.queue.shift();
        if (!item) {
            for (const w of this.idleWaiters.splice(0))
                w();
            return;
        }
        this.busy = true;
        this.ctrl = new AbortController();
        const rt = this.rt, sid = this.sid;
        const source = item.source ?? "user";
        rt.emitEvent(sid, { type: "busy", busy: true });
        rt.emitEvent(sid, { type: "user_message", text: item.text, source, internal: !!item.internal });
        let result;
        try {
            const session = rt.db.getSession(sid);
            result = await runTurn(rt, {
                sessionId: sid, userText: item.text, images: item.images, signal: this.ctrl.signal,
                headlessApproval: item.approvalMode, userMeta: { source, ...(item.meta ?? {}) },
                takeSteer: () => (this.steers.length ? this.steers.splice(0).join("\n") : null),
                depth: session?.source === "subagent" ? 1 : 0,
                maxIterations: session?.meta?.max_iterations || undefined,
            });
        }
        catch (e) {
            result = { final: `Error: ${errMsg(e)}`, error: errMsg(e), iterations: 0, toolCalls: 0, toolNames: [], interrupted: false, usage: { input: 0, output: 0 } };
        }
        const silent = /^\s*(NO_REPLY|\[SILENT\])\s*$/.test(result.final) || !!result.repeatedFinal;
        const todos = rt.db.getMeta(`todo:${sid}`) ?? [];
        const plan = todos.length ? { done: todos.filter((t) => t.status === "completed" || t.status === "cancelled").length, total: todos.length } : undefined;
        rt.emitEvent(sid, { type: "turn_end", final: result.final, interrupted: result.interrupted, error: result.error, usage: result.usage, iterations: result.iterations, toolCalls: result.toolCalls, source, silent, plan });
        this.ctrl = null;
        void rt.hooks.emit("on_turn_end", { sessionId: sid, source, final: result.final, toolCalls: result.toolCalls });
        // leftover steer text becomes the next user message
        if (this.steers.length)
            this.queue.unshift({ text: this.steers.splice(0).join("\n"), source: "user", resolve: () => undefined, reject: () => undefined });
        try {
            rt.maybeTitle(sid);
            const s = rt.db.getSession(sid);
            if (rt.cfg.data.curator.enabled && result.toolCalls >= rt.cfg.data.curator.min_tool_calls && s && !["subagent", "cron", "kanban", "api", "webhook"].includes(s.source)) {
                void curate(rt, sid).catch((e) => log.warn(`curator: ${errMsg(e)}`));
            }
            // goal judge / loop bookkeeping happens before the session is reported idle
            const follow = await afterTurn(rt, sid, result.final, { interrupted: result.interrupted, error: result.error, source });
            if (follow)
                this.queue.push({ text: follow.prompt, source: follow.kind, internal: true, approvalMode: item.approvalMode, resolve: () => undefined, reject: () => undefined });
        }
        catch (e) {
            log.warn(`post-turn processing failed: ${errMsg(e)}`);
        }
        this.busy = false;
        rt.emitEvent(sid, { type: "busy", busy: false });
        item.resolve(result);
        void this.pump();
    }
}
export class Runtime extends EventEmitter {
    opts;
    home;
    cfg;
    db;
    tools = new ToolRegistry();
    memory;
    skills;
    approvals;
    checkpoints;
    processes;
    hooks;
    mcp;
    cron;
    pipelines;
    kanban;
    storeBridge;
    terminal;
    gateway = null;
    startCwd;
    runners = new Map();
    providerCache = new Map();
    auxProv = null;
    toolCache = new Map();
    clarifies = new Map();
    tickers = [];
    caps = null;
    attached = new Map(); // sessionId → interactive clients watching
    constructor(opts) {
        super();
        this.opts = opts;
        this.setMaxListeners(200);
        this.home = opts.home ?? resolveHome(opts.profile);
        this.cfg = new ConfigStore(this.home);
        log.init(this.home);
        this.db = openState(this.home);
        this.startCwd = resolve(opts.cwd ?? this.cfg.data.terminal.cwd ?? process.cwd() ?? ".") || process.cwd();
        this.memory = new MemoryStore(join(this.home, "memories"), () => this.cfg.data.memory);
        this.skills = new SkillStore(join(this.home, "skills"), Runtime.bundledSkillsDir(), () => this.cfg.data.skills.external_dirs ?? []);
        this.approvals = new ApprovalManager(() => this.cfg.data.approvals.mode, () => this.cfg.data.approvals.allow_patterns ?? [], (p) => { try {
            this.cfg.set("approvals.allow_patterns", [...(this.cfg.data.approvals.allow_patterns ?? []), p]);
        }
        catch (e) {
            log.warn(errMsg(e));
        } }, (p) => this.emitEvent(p.sessionId, { type: "approval_request", ...p }), () => this.cfg.data.approvals.timeout * 1000);
        this.checkpoints = new Checkpoints(this.home, () => this.cfg.data.checkpoints.enabled, this.cfg.data.checkpoints.max_files);
        this.processes = new ProcessRegistry(join(this.home, "logs"));
        this.terminal = this.makeBackend();
        this.hooks = new HookBus(this);
        this.mcp = new McpManager(this);
        this.cron = new CronScheduler(this);
        this.pipelines = new PipelineRunner(this);
        this.kanban = new KanbanBoard(this);
        this.storeBridge = new StoreBridge(() => this.cfg.data.store_bridge.enabled, () => this.cfg.data.store_bridge.path, this);
        this.registerBuiltinTools();
        this.processes.on("exit", (p) => this.onProcessExit(p));
    }
    static bundledSkillsDir() {
        return resourcePath("skills");
    }
    static async create(opts = {}) {
        const rt = new Runtime(opts);
        if (opts.plugins !== false && rt.cfg.data.plugins.enabled)
            await rt.hooks.loadPlugins(join(rt.home, "plugins"));
        if (opts.mcp !== false)
            await rt.mcp.startAll();
        return rt;
    }
    makeBackend() {
        const t = this.cfg.data.terminal;
        if (t.backend === "docker")
            return new DockerBackend(t.docker_image, this.startCwd);
        if (t.backend === "ssh") {
            if (!t.ssh_host)
                throw new Error("terminal.ssh_host is required for the ssh backend");
            return new SshBackend(t.ssh_host);
        }
        return new LocalBackend(t.shell);
    }
    registerBuiltinTools() {
        for (const t of [
            terminalTool, processTool, runTestsTool, fileHistoryTool, pageCheckTool, siteTemplateTool, financeTool, strapiTool, readFileTool, writeFileTool, patchTool, searchFilesTool, listDirTool, officeTool,
            webSearchTool, webExtractTool, docsLookupTool, todoTool, memoryTool, skillsListTool, skillViewTool, skillManageTool,
            sessionSearchTool, clarifyTool, toolSearchTool, useToolTool, delegateTool, executeCodeTool, visionTool,
            cronTool, pipelineTool, kanbanTool, ...browserTools, desktopTool, ...captureTools, webtestTool,
        ])
            this.tools.register(t);
    }
    // ── events ────────────────────────────────────────────────────
    emitEvent(sessionId, ev) {
        this.emit("event", { sessionId, ts: Date.now(), ...ev });
    }
    // ── sessions ──────────────────────────────────────────────────
    createSession(p) {
        const cwd = p.cwd || this.defaultCwd();
        const s = this.db.createSession({ model: this.cfg.data.model.name, ...p, cwd });
        if (resolve(cwd) !== this.startCwd)
            this.rememberCwd(cwd);
        void this.hooks.emit("on_session_start", { sessionId: s.id, source: s.source });
        return s;
    }
    getOrCreateSession(id, source, extra = {}) {
        if (id) {
            const s = this.db.getSession(id);
            if (s)
                return s;
        }
        return this.createSession({ ...(id ? { id } : {}), source, ...extra });
    }
    ensureSystemPrompt(sid) {
        const s = this.db.getSession(sid);
        if (!s)
            throw new Error(`no session ${sid}`);
        if (s.system_prompt)
            return s;
        const agent = s.meta.agent ? this.cfg.data.agents?.[s.meta.agent] : undefined;
        const extra = agent?.instructions ? `## Agent: ${s.meta.agent}\n${agent.instructions.trim()}` : undefined;
        const prompt = buildSystemPrompt(this, { cwd: s.cwd || this.defaultCwd(), source: s.source, personality: s.meta.personality, profile: s.meta.tool_profile, extra });
        this.db.updateSession(sid, { system_prompt: prompt });
        return { ...s, system_prompt: prompt };
    }
    /** Rebuild the system prompt now (breaks the prompt cache; used by --now commands). */
    refreshSystemPrompt(sid) {
        this.db.updateSession(sid, { system_prompt: null });
        this.toolCache.delete(sid);
        const s = this.db.getSession(sid);
        if (s)
            this.db.updateSession(sid, { meta: { ...s.meta, tool_names: undefined } });
        this.ensureSystemPrompt(sid);
    }
    /** Run this chat as a named agent from config `agents:` (null/"default" = plain settings). Rebuilds prompt and tools. */
    applyAgent(sid, name) {
        const s = this.db.getSession(sid);
        if (!s)
            throw new Error(`no session ${sid}`);
        const n = name && name !== "default" ? name : null;
        const a = n ? this.cfg.data.agents?.[n] : undefined;
        if (n && !a)
            throw new Error(`no agent "${n}" (defined: ${Object.keys(this.cfg.data.agents ?? {}).join(", ") || "none"})`);
        const m = a?.model && Object.values(a.model).some((v) => v !== undefined && v !== "") ? Object.fromEntries(Object.entries(a.model).filter(([, v]) => v !== undefined && v !== "")) : undefined;
        this.db.updateSession(sid, { system_prompt: null, meta: {
                ...s.meta, agent: n ?? undefined, personality: a?.personality ?? undefined, tool_profile: a?.tool_profile ?? undefined,
                tool_names: a?.tools?.length ? a.tools : undefined, model_override: m, max_iterations: a?.max_iterations ?? undefined,
            } });
        this.toolCache.delete(sid);
    }
    sessionCwd(sid) {
        const s = this.db.getSession(sid);
        return s?.cwd && existsSync(s.cwd) ? s.cwd : this.defaultCwd();
    }
    /** agent.default_cwd when it is an existing folder, else the folder the harness started in. */
    defaultCwd() {
        const d = String(this.cfg.data.agent.default_cwd ?? "").trim().replace(/^~(?=\/|$)/, homedir());
        try {
            if (d && statSync(d).isDirectory())
                return resolve(d);
        }
        catch { /* missing */ }
        return this.startCwd;
    }
    /** Recently used working folders, most recent first (for the folder picker). */
    recentCwds() { return (this.db.getMeta("recent_cwds") ?? []).filter((p) => existsSync(p)); }
    rememberCwd(p) {
        this.db.setMeta("recent_cwds", [resolve(p), ...(this.db.getMeta("recent_cwds") ?? []).filter((x) => x !== resolve(p))].slice(0, 12));
    }
    /**
     * Change a chat's working folder. `remember` (folder picker, /cwd) records it as a recent folder and rebuilds the
     * system prompt so it names the new folder; tools that `cd` during a turn pass nothing.
     */
    setSessionCwd(sid, p, opts = {}) {
        this.db.updateSession(sid, { cwd: p });
        if (!opts.remember)
            return;
        this.rememberCwd(p);
        const s = this.db.getSession(sid);
        if (s?.system_prompt && !this.isBusy(sid))
            this.refreshSystemPrompt(sid);
    }
    /** Tools in the model schema for this session — fixed at first use for cache stability. */
    activeTools(sid, allowed) {
        let list = this.toolCache.get(sid);
        if (!list) {
            const s = this.db.getSession(sid);
            const names = s?.meta?.tool_names;
            if (names?.length)
                list = names.map((n) => this.tools.get(n)).filter((t) => !!t && this.tools.isAvailable(t, this));
            else {
                list = this.tools.active(this, { profile: s?.meta?.tool_profile });
                if (s)
                    this.db.updateSession(sid, { meta: { ...s.meta, tool_names: list.map((t) => t.name) } });
            }
            this.toolCache.set(sid, list);
        }
        return allowed ? list.filter((t) => allowed.has(t.name)) : list;
    }
    providerFor(sid) {
        if (this.opts.provider)
            return this.opts.provider;
        const s = this.db.getSession(sid);
        const override = s?.meta?.model_override;
        const key = override ? JSON.stringify(override) : "main";
        let p = this.providerCache.get(key);
        if (!p) {
            p = buildMainProvider(this.cfg, (m) => this.emitEvent(sid, { type: "status", text: m }), override);
            this.providerCache.set(key, p);
        }
        return p;
    }
    aux() {
        if (this.opts.auxProvider)
            return this.opts.auxProvider;
        if (this.opts.provider && !Object.keys(this.cfg.data.aux ?? {}).length)
            return this.opts.provider;
        return (this.auxProv ??= buildAuxProvider(this.cfg));
    }
    resetProviders() { this.providerCache.clear(); this.auxProv = null; }
    runner(sid) {
        let r = this.runners.get(sid);
        if (!r) {
            r = new SessionRunner(this, sid);
            this.runners.set(sid, r);
        }
        return r;
    }
    isBusy(sid) { return this.runners.get(sid)?.busy ?? false; }
    send(sid, text, o = {}) {
        if (!this.db.getSession(sid))
            throw new Error(`no session ${sid}`);
        return this.runner(sid).enqueue(text, o);
    }
    interrupt(sid, clearQueue = false) { return this.runners.get(sid)?.interrupt(clearQueue) ?? false; }
    steer(sid, text) { return this.runner(sid).steer(text); }
    waitIdle(sid) { return this.runners.get(sid)?.waitIdle() ?? Promise.resolve(); }
    /** Run a prompt in a fresh session with nobody watching; waits for goal continuations to finish. */
    async runHeadless(o) {
        const s = this.createSession({ source: o.source, title: o.title ?? "", cwd: o.cwd ?? this.defaultCwd(), meta: o.tools ? { tool_names: o.tools } : {} });
        if (o.goal)
            this.db.setMeta(goalKey(s.id), { text: o.goal, status: "active", turns: 0, max_turns: this.cfg.data.goals.max_turns, created_at: Date.now() });
        const first = await this.send(s.id, o.prompt, { source: o.source, approvalMode: o.approvalMode ?? "deny" });
        await this.waitIdle(s.id);
        const last = [...this.db.getMessages(s.id)].reverse().find((m) => m.role === "assistant" && !m.tool_calls?.length);
        return { sessionId: s.id, final: last?.content ?? first.final, error: first.error, goal: this.db.getMeta(goalKey(s.id)) ?? undefined };
    }
    /** A tool context for calling tools outside an agent turn (MCP server, scripts, tests). */
    toolContext(sid, signal = new AbortController().signal, approvalMode = "deny") {
        const session = this.db.getSession(sid);
        return {
            rt: this, session, toolCallId: newId("call_"), depth: 0, budget: { remaining: this.cfg.data.agent.max_iterations },
            get cwd() { return session ? (session.cwd || process.cwd()) : process.cwd(); },
            setCwd: (p) => this.setSessionCwd(sid, p), signal,
            progress: (text) => this.emitEvent(sid, { type: "tool_output", text }),
            requestApproval: (req) => this.approvals.check({ ...req, sessionId: sid }, { headlessMode: approvalMode }),
            clarify: async () => null,
        };
    }
    // ── clarify ───────────────────────────────────────────────────
    askClarify(sessionId, question, choices) {
        const s = this.db.getSession(sessionId);
        const interactive = (this.attached.get(sessionId) ?? 0) > 0 || ["telegram", "discord", "slack"].includes(s?.source ?? "");
        if (!interactive)
            return Promise.resolve(null);
        const id = newId("cl_");
        return new Promise((res) => {
            this.clarifies.set(id, { sessionId, question, choices, resolve: res });
            this.emitEvent(sessionId, { type: "clarify_request", id, question, choices });
            setTimeout(() => { if (this.clarifies.has(id))
                this.respondClarify(id, null); }, 15 * 60_000).unref?.();
        });
    }
    respondClarify(id, answer) {
        const c = this.clarifies.get(id);
        if (!c)
            return false;
        this.clarifies.delete(id);
        c.resolve(answer);
        this.emitEvent(c.sessionId, { type: "clarify_resolved", id, answer });
        return true;
    }
    pendingClarify(sessionId) { return [...this.clarifies.entries()].filter(([, c]) => c.sessionId === sessionId).map(([id, c]) => ({ id, question: c.question, choices: c.choices })); }
    cancelClarify(sessionId) { for (const [id, c] of [...this.clarifies])
        if (c.sessionId === sessionId)
            this.respondClarify(id, null); }
    // ── titles ────────────────────────────────────────────────────
    maybeTitle(sid) {
        const s = this.db.getSession(sid);
        if (!s || s.title)
            return;
        const first = this.db.getMessages(sid).find((m) => m.role === "user");
        if (!first?.content)
            return;
        const heuristic = first.content.replace(/\s+/g, " ").replace(/\n[\s\S]*/, "").slice(0, 60);
        this.db.updateSession(sid, { title: heuristic });
        this.emitEvent(sid, { type: "title", title: heuristic });
        void this.aux().chat({ messages: [{ role: "system", content: "Write a 3-6 word title for this conversation. Reply with the title only, no quotes." }, { role: "user", content: first.content.slice(0, 2000) }], maxTokens: 20, temperature: 0.2, stream: false })
            .then((r) => {
            const t = r.content.replace(/^["'#\s]+|["'\s.]+$/g, "").slice(0, 80);
            if (t && t.length > 2) {
                this.db.updateSession(sid, { title: t });
                this.emitEvent(sid, { type: "title", title: t });
            }
        }).catch(() => undefined);
    }
    // ── environment ───────────────────────────────────────────────
    capabilities() {
        if (this.caps)
            return this.caps;
        const out = [`node ${process.versions.node}`];
        const probe = (cmd, args, label) => {
            try {
                const v = execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 4000 }).trim().split("\n")[0];
                out.push(`${label}${v ? ` (${v.slice(0, 40)})` : ""}`);
            }
            catch { /* absent */ }
        };
        const py = findPython();
        if (py)
            probe(py, ["--version"], "python");
        probe("git", ["--version"], "git");
        probe("docker", ["--version"], "docker");
        probe("rg", ["--version"], "ripgrep");
        if (process.platform === "win32")
            probe("pwsh", ["-NoLogo", "-Command", "$PSVersionTable.PSVersion.ToString()"], "pwsh");
        probe("uv", ["--version"], "uv");
        probe("cargo", ["--version"], "cargo");
        probe("java", ["-version"], "java");
        probe("go", ["version"], "go");
        this.caps = out;
        return out;
    }
    // ── delivery (cron, kanban, notifications) ────────────────────
    async deliver(target, text) {
        const t = target || "log";
        const [kind, ...rest] = t.split(":");
        const arg = rest.join(":");
        if (kind === "log") {
            appendFileSync(join(this.home, "logs", "deliveries.log"), `\n[${new Date().toISOString()}]\n${redact(text)}\n`);
            this.emitEvent("*", { type: "notification", text });
            return;
        }
        if (kind === "session") {
            this.emitEvent(arg, { type: "notification", text });
            return;
        }
        if (kind === "webhook") {
            const res = await fetch(arg, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, source: "stitap" }), signal: AbortSignal.timeout(20000) });
            if (!res.ok)
                throw new Error(`webhook delivery failed: HTTP ${res.status}`);
            return;
        }
        if (this.gateway && this.gateway.platforms().includes(kind)) {
            await this.gateway.send(kind, arg, text);
            return;
        }
        throw new Error(`cannot deliver to "${target}" (platform not running?)`);
    }
    onProcessExit(p) {
        if (!p.notifyOnExit || p.status === "killed")
            return;
        const r = this.runners.get(p.sessionId);
        if (!r)
            return;
        const tail = this.processes.tail(p.id, 1500) ?? "";
        const msg = `[Background process ${p.id} finished with exit code ${p.exitCode}: ${p.command.slice(0, 120)}]\nLast output:\n${tail}`;
        this.emitEvent(p.sessionId, { type: "notification", text: `Background process ${p.id} exited (${p.exitCode})` });
        if (r.busy)
            r.steers.push(msg);
        else
            void r.enqueue(msg, { source: "notification", internal: true });
    }
    // ── background ticker: cron, kanban, /loop, /heartbeat ─────────
    ownsTicker() {
        const me = `${hostname()}:${process.pid}`;
        const cur = this.db.getMeta("ticker_owner");
        if (!cur || cur.owner === me || Date.now() - cur.at > 90_000) {
            this.db.setMeta("ticker_owner", { owner: me, at: Date.now() });
            return true;
        }
        return false;
    }
    startBackground() {
        if (this.tickers.length)
            return;
        const fast = setInterval(() => { void this.tickAutonomy().catch((e) => log.warn(`autonomy tick: ${errMsg(e)}`)); }, 5000);
        const slow = setInterval(() => {
            if (!this.ownsTicker())
                return;
            void this.cron.tick().catch((e) => log.warn(`cron tick: ${errMsg(e)}`));
            void this.kanban.tick().catch((e) => log.warn(`kanban tick: ${errMsg(e)}`));
            void this.pipelines.tick().catch((e) => log.warn(`pipeline tick: ${errMsg(e)}`));
        }, 30_000);
        fast.unref();
        slow.unref();
        this.tickers.push(fast, slow);
        setTimeout(() => { if (this.ownsTicker()) {
            void this.cron.tick();
            void this.pipelines.tick();
        } }, 2000).unref();
    }
    async tickAutonomy() {
        const now = Date.now();
        for (const { key, value } of this.db.listMeta("loop:")) {
            const l = value;
            const sid = key.slice(5);
            if (l.status !== "active" || l.next_at > now || !this.db.getSession(sid))
                continue;
            const r = this.runner(sid);
            if (!r.idle())
                continue;
            l.next_at = now + 365 * 86400_000; // re-armed by afterTurn
            this.db.setMeta(loopKey(sid), l);
            void r.enqueue(loopPrompt(l), { source: "loop", internal: true });
        }
        for (const { key, value } of this.db.listMeta("heartbeat:")) {
            const h = value;
            const sid = key.slice(10);
            if (h.status !== "active" || h.next_at > now || !this.db.getSession(sid))
                continue;
            const r = this.runner(sid);
            if (!r.idle())
                continue;
            h.next_at = now + h.interval_ms;
            h.fires++;
            this.db.setMeta(heartbeatKey(sid), h);
            void r.enqueue(heartbeatPrompt(h), { source: "heartbeat", internal: true });
        }
    }
    async shutdown() {
        for (const t of this.tickers)
            clearInterval(t);
        this.tickers = [];
        for (const r of this.runners.values())
            r.interrupt(true);
        this.processes.killAll();
        this.mcp.closeAll();
        await closeBrowsers();
        await this.storeBridge.close();
        for (const s of this.runners.keys())
            await this.hooks.emit("on_session_end", { sessionId: s });
        this.db.close();
    }
}

/**
 * Runtime: the long-lived agent process. Owns state, tools, providers,
 * sessions (each with a FIFO turn queue), approvals, background schedulers,
 * and an event stream that every client (CLI, web, gateway, API) subscribes to.
 */
import { gitTool, githubTool } from "../tools/git.js";
import { BenchRecorder } from "./bench.js";
import { codeSearchTool } from "../tools/codeindex.js";
import { lspTool, stopAllLsp } from "../tools/lsp.js";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, statSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { resourcePath } from "../util/resources.js";
import { ConfigStore, resolveHome, type ModelConfig } from "../config.js";
import { openState, type Session, type StateDB } from "../state/db.js";
import { buildAuxProvider, buildMainProvider, type Provider } from "../providers/index.js";
import { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/types.js";
import { LocalBackend, DockerBackend, SshBackend, ProcessRegistry, type TerminalBackend } from "../tools/backends.js";
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
import { runTurn, type TurnResult } from "../loop/agent.js";
import { afterTurn, goalKey, heartbeatKey, heartbeatPrompt, loopKey, loopPrompt, type GoalState, type HeartbeatState, type LoopState } from "../loop/autonomy.js";
import { curate } from "../loop/curator.js";
import { CronScheduler, cronTool } from "../cron/scheduler.js";
import { KanbanBoard, kanbanTool } from "../kanban/board.js";
import { RouterProvider, type DuoServer } from "../providers/router.js";
import { RagStore, ragSearchTool, RAG_SYSTEM_PROMPT } from "../rag/index.js";
import { McpManager } from "../mcp/client.js";
import { HookBus } from "./hooks.js";
import { StoreBridge } from "./store-bridge.js";
import { log } from "../util/log.js";
import { errMsg, newId } from "../util/misc.js";
import { redact } from "../util/redact.js";

export const VERSION = "0.1.0";

export interface RuntimeOptions {
  profile?: string;
  home?: string;
  cwd?: string;
  provider?: Provider;      // override main model (tests / SDK)
  auxProvider?: Provider;   // override auxiliary model
  plugins?: boolean;
  mcp?: boolean;
}

export interface SendOptions { source?: string; images?: string[]; meta?: Record<string, any>; approvalMode?: string; internal?: boolean }
export interface QueueItem extends SendOptions { text: string; resolve: (r: TurnResult) => void; reject: (e: any) => void }

export interface Delivery { platform: string; target: string; text: string }
export interface GatewayLike { send(platform: string, target: string, text: string): Promise<void>; platforms(): string[] }

class SessionRunner {
  queue: QueueItem[] = [];
  busy = false;
  ctrl: AbortController | null = null;
  steers: string[] = [];
  private idleWaiters: (() => void)[] = [];
  constructor(private rt: Runtime, readonly sid: string) {}

  enqueue(text: string, o: SendOptions = {}): Promise<TurnResult> {
    return new Promise((resolveP, reject) => {
      this.queue.push({ ...o, text, resolve: resolveP, reject });
      void this.pump();
    });
  }

  idle() { return !this.busy && this.queue.length === 0; }

  waitIdle(): Promise<void> {
    if (this.idle()) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  interrupt(clearQueue = false): boolean {
    if (clearQueue) {
      for (const q of this.queue.splice(0)) q.resolve({ final: "(cancelled)", iterations: 0, toolCalls: 0, toolNames: [], interrupted: true, usage: { input: 0, output: 0 } });
    }
    this.rt.approvals.cancelSession(this.sid);
    this.rt.cancelClarify(this.sid);
    if (this.ctrl && !this.ctrl.signal.aborted) { this.ctrl.abort(); return true; }
    return false;
  }

  steer(text: string): "steered" | "queued" {
    if (this.busy) { this.steers.push(text); this.rt.emitEvent(this.sid, { type: "status", text: "Steer message will be delivered after the current step" }); return "steered"; }
    void this.enqueue(text, { source: "user" });
    return "queued";
  }

  private async pump() {
    if (this.busy) return;
    const item = this.queue.shift();
    if (!item) { for (const w of this.idleWaiters.splice(0)) w(); return; }
    this.busy = true;
    this.ctrl = new AbortController();
    const rt = this.rt, sid = this.sid;
    const source = item.source ?? "user";
    rt.emitEvent(sid, { type: "busy", busy: true });
    rt.emitEvent(sid, { type: "user_message", text: item.text, source, internal: !!item.internal });
    let result: TurnResult;
    try {
      const session = rt.db.getSession(sid);
      result = await runTurn(rt, {
        sessionId: sid, userText: item.text, images: item.images, signal: this.ctrl.signal,
        headlessApproval: item.approvalMode, userMeta: { source, ...(item.meta ?? {}) },
        takeSteer: () => (this.steers.length ? this.steers.splice(0).join("\n") : null),
        depth: session?.source === "subagent" ? 1 : 0,
        maxIterations: session?.meta?.max_iterations || undefined,
      });
    } catch (e) {
      result = { final: `Error: ${errMsg(e)}`, error: errMsg(e), iterations: 0, toolCalls: 0, toolNames: [], interrupted: false, usage: { input: 0, output: 0 } };
    }
    const silent = /^\s*(NO_REPLY|\[SILENT\])\s*$/.test(result.final) || !!result.repeatedFinal;
    const todos: { status: string }[] = rt.db.getMeta(`todo:${sid}`) ?? [];
    const plan = todos.length ? { done: todos.filter((t) => t.status === "completed" || t.status === "cancelled").length, total: todos.length } : undefined;
    rt.emitEvent(sid, { type: "turn_end", final: result.final, interrupted: result.interrupted, error: result.error, usage: result.usage, iterations: result.iterations, toolCalls: result.toolCalls, source, silent, plan });
    this.ctrl = null;
    void rt.hooks.emit("on_turn_end", { sessionId: sid, source, final: result.final, toolCalls: result.toolCalls });
    // leftover steer text becomes the next user message
    if (this.steers.length) this.queue.unshift({ text: this.steers.splice(0).join("\n"), source: "user", resolve: () => undefined, reject: () => undefined });
    try {
      rt.maybeTitle(sid);
      const s = rt.db.getSession(sid);
      if (rt.cfg.data.curator.enabled && result.toolCalls >= rt.cfg.data.curator.min_tool_calls && s && !["subagent", "cron", "kanban", "api", "webhook"].includes(s.source) && s.meta?.mode !== "rag") {
        void curate(rt, sid).catch((e) => log.warn(`curator: ${errMsg(e)}`));
      }
      // goal judge / loop bookkeeping happens before the session is reported idle
      const follow = await afterTurn(rt, sid, result.final, { interrupted: result.interrupted, error: result.error, source });
      if (follow) this.queue.push({ text: follow.prompt, source: follow.kind, internal: true, approvalMode: item.approvalMode, resolve: () => undefined, reject: () => undefined });
    } catch (e) { log.warn(`post-turn processing failed: ${errMsg(e)}`); }
    this.busy = false;
    rt.emitEvent(sid, { type: "busy", busy: false });
    item.resolve(result);
    void this.pump();
  }
}

export class Runtime extends EventEmitter {
  readonly home: string;
  readonly cfg: ConfigStore;
  readonly db: StateDB;
  readonly tools = new ToolRegistry();
  readonly memory: MemoryStore;
  readonly skills: SkillStore;
  readonly approvals: ApprovalManager;
  readonly checkpoints: Checkpoints;
  readonly processes: ProcessRegistry;
  readonly hooks: HookBus;
  readonly mcp: McpManager;
  readonly cron: CronScheduler;
  readonly pipelines: PipelineRunner;
  readonly kanban: KanbanBoard;
  readonly rag: RagStore;
  readonly storeBridge: StoreBridge;
  readonly bench: BenchRecorder;
  terminal: TerminalBackend;
  gateway: GatewayLike | null = null;
  readonly startCwd: string;
  private runners = new Map<string, SessionRunner>();
  private providerCache = new Map<string, Provider>();
  private auxProv: Provider | null = null;
  private toolCache = new Map<string, Tool[]>();
  private clarifies = new Map<string, { sessionId: string; question: string; choices?: string[]; resolve: (a: string | null) => void }>();
  private tickers: NodeJS.Timeout[] = [];
  private caps: string[] | null = null;
  readonly attached = new Map<string, number>(); // sessionId → interactive clients watching

  private constructor(private opts: RuntimeOptions) {
    super();
    this.setMaxListeners(200);
    this.home = opts.home ?? resolveHome(opts.profile);
    this.cfg = new ConfigStore(this.home);
    log.init(this.home);
    this.db = openState(this.home);
    this.startCwd = resolve(opts.cwd ?? this.cfg.data.terminal.cwd ?? process.cwd() ?? ".") || process.cwd();
    this.memory = new MemoryStore(join(this.home, "memories"), () => this.cfg.data.memory);
    this.skills = new SkillStore(join(this.home, "skills"), Runtime.bundledSkillsDir(), () => this.cfg.data.skills.external_dirs ?? []);
    this.approvals = new ApprovalManager(
      () => this.cfg.data.approvals.mode,
      () => this.cfg.data.approvals.allow_patterns ?? [],
      (p) => { try { this.cfg.set("approvals.allow_patterns", [...(this.cfg.data.approvals.allow_patterns ?? []), p]); } catch (e) { log.warn(errMsg(e)); } },
      (p) => this.emitEvent(p.sessionId, { type: "approval_request", ...p }),
      () => this.cfg.data.approvals.timeout * 1000,
    );
    this.checkpoints = new Checkpoints(this.home, () => this.cfg.data.checkpoints.enabled, this.cfg.data.checkpoints.max_files);
    this.processes = new ProcessRegistry(join(this.home, "logs"));
    this.terminal = this.makeBackend();
    this.hooks = new HookBus(this);
    this.mcp = new McpManager(this);
    this.cron = new CronScheduler(this);
    this.pipelines = new PipelineRunner(this);
    this.kanban = new KanbanBoard(this);
    this.rag = new RagStore(this.home);
    this.storeBridge = new StoreBridge(() => this.cfg.data.store_bridge.enabled, () => this.cfg.data.store_bridge.path, this);
    this.bench = new BenchRecorder(this);
    this.registerBuiltinTools();
    this.processes.on("exit", (p) => this.onProcessExit(p));
  }

  static bundledSkillsDir(): string {
    return resourcePath("skills");
  }

  static async create(opts: RuntimeOptions = {}): Promise<Runtime> {
    const rt = new Runtime(opts);
    if (opts.plugins !== false && rt.cfg.data.plugins.enabled) await rt.hooks.loadPlugins(join(rt.home, "plugins"));
    if (opts.mcp !== false) await rt.mcp.startAll();
    return rt;
  }

  private makeBackend(): TerminalBackend {
    const t = this.cfg.data.terminal;
    if (t.backend === "docker") return new DockerBackend(t.docker_image, this.startCwd);
    if (t.backend === "ssh") { if (!t.ssh_host) throw new Error("terminal.ssh_host is required for the ssh backend"); return new SshBackend(t.ssh_host); }
    return new LocalBackend(t.shell);
  }

  private registerBuiltinTools() {
    for (const t of [
      terminalTool, processTool, runTestsTool, gitTool, githubTool, codeSearchTool, lspTool, fileHistoryTool, pageCheckTool, siteTemplateTool, financeTool, strapiTool, readFileTool, writeFileTool, patchTool, searchFilesTool, listDirTool, officeTool,
      webSearchTool, webExtractTool, docsLookupTool, todoTool, memoryTool, skillsListTool, skillViewTool, skillManageTool,
      sessionSearchTool, clarifyTool, toolSearchTool, useToolTool, delegateTool, executeCodeTool, visionTool,
      cronTool, pipelineTool, kanbanTool, ragSearchTool, ...browserTools, desktopTool, ...captureTools, webtestTool,
    ]) this.tools.register(t);
  }

  // ── events ────────────────────────────────────────────────────
  emitEvent(sessionId: string, ev: Record<string, any>): void {
    this.emit("event", { sessionId, ts: Date.now(), ...ev });
  }

  // ── sessions ──────────────────────────────────────────────────
  createSession(p: Partial<Session> & { source: string }): Session {
    const cwd = p.cwd || this.defaultCwd();
    const s = this.db.createSession({ model: this.cfg.data.model.name, ...p, cwd });
    if (resolve(cwd) !== this.startCwd) this.rememberCwd(cwd);
    void this.hooks.emit("on_session_start", { sessionId: s.id, source: s.source });
    return s;
  }

  getOrCreateSession(id: string | undefined, source: string, extra: Partial<Session> = {}): Session {
    if (id) { const s = this.db.getSession(id); if (s) return s; }
    return this.createSession({ ...(id ? { id } : {}), source, ...extra });
  }

  ensureSystemPrompt(sid: string): Session {
    const s = this.db.getSession(sid);
    if (!s) throw new Error(`no session ${sid}`);
    if (s.system_prompt) return s;
    if (s.meta.mode === "rag") { this.db.updateSession(sid, { system_prompt: RAG_SYSTEM_PROMPT }); return { ...s, system_prompt: RAG_SYSTEM_PROMPT }; }
    const agent = s.meta.agent ? this.cfg.data.agents?.[s.meta.agent] : undefined;
    const extra = agent?.instructions ? `## Agent: ${s.meta.agent}\n${agent.instructions.trim()}` : undefined;
    const prompt = buildSystemPrompt(this, { cwd: s.cwd || this.defaultCwd(), source: s.source, personality: s.meta.personality, profile: s.meta.tool_profile, extra });
    this.db.updateSession(sid, { system_prompt: prompt });
    return { ...s, system_prompt: prompt };
  }

  /** Rebuild the system prompt now (breaks the prompt cache; used by --now commands). */
  refreshSystemPrompt(sid: string): void {
    this.db.updateSession(sid, { system_prompt: null });
    this.toolCache.delete(sid);
    const s = this.db.getSession(sid);
    if (s) this.db.updateSession(sid, { meta: { ...s.meta, tool_names: undefined } });
    this.ensureSystemPrompt(sid);
  }

  /** Switch a chat between the normal agent and the RAG bot (answers only from the shared documents). */
  setMode(sid: string, mode: "agent" | "rag"): void {
    const s = this.db.getSession(sid);
    if (!s) throw new Error(`no session ${sid}`);
    const meta = { ...s.meta };
    if (mode === "rag") Object.assign(meta, { mode: "rag", tool_names: ["rag_search"], tool_names_explicit: true, tool_selection: undefined });
    else Object.assign(meta, { mode: undefined, tool_names: undefined, tool_names_explicit: undefined });
    this.db.updateSession(sid, { system_prompt: null, meta });
    this.toolCache.delete(sid);
    this.ensureSystemPrompt(sid);
  }

  /** Run this chat as a named agent from config `agents:` (null/"default" = plain settings). Rebuilds prompt and tools. */
  applyAgent(sid: string, name: string | null): void {
    const s = this.db.getSession(sid);
    if (!s) throw new Error(`no session ${sid}`);
    const n = name && name !== "default" ? name : null;
    const a = n ? this.cfg.data.agents?.[n] : undefined;
    if (n && !a) throw new Error(`no agent "${n}" (defined: ${Object.keys(this.cfg.data.agents ?? {}).join(", ") || "none"})`);
    const m = a?.model && Object.values(a.model).some((v) => v !== undefined && v !== "") ? Object.fromEntries(Object.entries(a.model).filter(([, v]) => v !== undefined && v !== "")) : undefined;
    this.db.updateSession(sid, { system_prompt: null, meta: {
      ...s.meta, agent: n ?? undefined, personality: a?.personality ?? undefined, tool_profile: a?.tool_profile ?? undefined,
      tool_names: a?.tools?.length ? a.tools : undefined, tool_names_explicit: a?.tools?.length ? true : undefined, model_override: m, max_iterations: a?.max_iterations ?? undefined,
    } });
    this.toolCache.delete(sid);
  }

  sessionCwd(sid: string): string {
    const s = this.db.getSession(sid);
    return s?.cwd && existsSync(s.cwd) ? s.cwd : this.defaultCwd();
  }

  /** agent.default_cwd when it is an existing folder, else the folder the harness started in. */
  defaultCwd(): string {
    const d = String(this.cfg.data.agent.default_cwd ?? "").trim().replace(/^~(?=\/|$)/, homedir());
    try { if (d && statSync(d).isDirectory()) return resolve(d); } catch { /* missing */ }
    return this.startCwd;
  }

  /** Recently used working folders, most recent first (for the folder picker). */
  recentCwds(): string[] { return (this.db.getMeta<string[]>("recent_cwds") ?? []).filter((p) => existsSync(p)); }
  private rememberCwd(p: string): void {
    this.db.setMeta("recent_cwds", [resolve(p), ...(this.db.getMeta<string[]>("recent_cwds") ?? []).filter((x) => x !== resolve(p))].slice(0, 12));
  }

  /**
   * Change a chat's working folder. `remember` (folder picker, /cwd) records it as a recent folder and rebuilds the
   * system prompt so it names the new folder; tools that `cd` during a turn pass nothing.
   */
  setSessionCwd(sid: string, p: string, opts: { remember?: boolean } = {}): void {
    this.db.updateSession(sid, { cwd: p });
    if (!opts.remember) return;
    this.rememberCwd(p);
    const s = this.db.getSession(sid);
    if (s?.system_prompt && !this.isBusy(sid)) this.refreshSystemPrompt(sid);
  }

  /** Tools in the model schema for this session — fixed at first use for cache stability. */
  activeTools(sid: string, allowed?: Set<string>): Tool[] {
    let list = this.toolCache.get(sid);
    if (!list) {
      const s = this.db.getSession(sid);
      const names: string[] | undefined = s?.meta?.tool_names;
      if (names?.length) list = names.map((n) => this.tools.get(n)).filter((t): t is Tool => !!t && this.tools.isAvailable(t, this));
      else {
        list = this.tools.active(this, { profile: s?.meta?.tool_profile });
        // planner-selected tools (loop/toolselect.ts) come on top of the compact core
        const extras: string[] = s?.meta?.tool_extras ?? [];
        if (extras.length) {
          const have = new Set(list.map((t) => t.name));
          for (const n of extras) { const t = this.tools.get(n); if (t && !have.has(n) && this.tools.isAvailable(t, this)) list.push(t); }
          list.sort((a, b) => a.name.localeCompare(b.name));
        }
        if (s) this.db.updateSession(sid, { meta: { ...s.meta, tool_names: list.map((t) => t.name) } });
      }
      this.toolCache.set(sid, list);
      if (this.shrinkToWindow(sid, list)) return this.activeTools(sid, allowed);
    }
    return allowed ? list.filter((t) => allowed.has(t.name)) : list;
  }

  dropToolCache(sid: string) { this.toolCache.delete(sid); }

  /**
   * The system prompt and tool schemas are sent with every call. When they take most of a small window (51 tools
   * are ~12K tokens, a 16K window leaves nothing for the conversation, and compression cannot shrink them) the chat
   * moves to the compact core profile and, unless agent.tool_selection is "off", the tool planner picks the extra
   * tools each task needs (loop/toolselect.ts). agent.tool_selection "on" does that for every chat.
   */
  private shrinkToWindow(sid: string, list: Tool[]): boolean {
    const s = this.db.getSession(sid);
    const mode = this.cfg.data.agent.tool_selection;
    if (!s || s.meta?.tool_names_explicit || s.meta?.tool_selection) return false;
    const compact = s.meta?.tool_profile === "slm" || (!s.meta?.tool_profile && this.cfg.data.agent.tool_profile === "slm");
    const window = this.providerFor(sid).contextWindow;
    const fixed = Math.ceil((JSON.stringify(this.tools.schemas(list)).length + (s.system_prompt?.length ?? 0)) / 3.2);
    const tooBig = window > 0 && fixed > window * 0.55;
    if (compact && mode !== "on") return false;
    if (!compact && !tooBig && mode !== "on") return false;
    if (tooBig && !compact) {
      this.emitEvent(sid, { type: "status", text: `Tools and instructions take ~${fixed} of ${window} tokens; this chat uses the compact tool set${mode === "off" ? " (other tools via tool_search)" : " and the tool planner picks the rest per task"}` });
      log.warn(`session ${sid}: fixed prompt ~${fixed} tokens of a ${window}-token window; compact tools${mode === "off" ? "" : " + planner"}`);
    }
    this.db.updateSession(sid, { meta: { ...s.meta, tool_profile: "slm", tool_names: undefined, ...(mode === "off" ? {} : { tool_selection: true }) } });
    this.refreshSystemPrompt(sid);
    return true;
  }

  providerFor(sid: string): Provider {
    if (this.opts.provider) return this.opts.provider;
    const s = this.db.getSession(sid);
    const override: Partial<ModelConfig> | undefined = s?.meta?.model_override;
    const key = override ? JSON.stringify(override) : "main";
    let p = this.providerCache.get(key);
    if (!p) {
      p = buildMainProvider(this.cfg, (m) => this.emitEvent(sid, { type: "status", text: m }), override);
      this.providerCache.set(key, p);
    }
    return p;
  }

  aux(): Provider {
    if (this.opts.auxProvider) return this.opts.auxProvider;
    if (this.opts.provider && !Object.keys(this.cfg.data.aux ?? {}).length) return this.opts.provider;
    return (this.auxProv ??= buildAuxProvider(this.cfg));
  }

  resetProviders(): void { this.providerCache.clear(); this.auxProv = null; }

  runner(sid: string): SessionRunner {
    let r = this.runners.get(sid);
    if (!r) { r = new SessionRunner(this, sid); this.runners.set(sid, r); }
    return r;
  }

  isBusy(sid: string): boolean { return this.runners.get(sid)?.busy ?? false; }

  send(sid: string, text: string, o: SendOptions = {}): Promise<TurnResult> {
    if (!this.db.getSession(sid)) throw new Error(`no session ${sid}`);
    return this.runner(sid).enqueue(text, o);
  }

  interrupt(sid: string, clearQueue = false): boolean { return this.runners.get(sid)?.interrupt(clearQueue) ?? false; }
  steer(sid: string, text: string) { return this.runner(sid).steer(text); }
  waitIdle(sid: string): Promise<void> { return this.runners.get(sid)?.waitIdle() ?? Promise.resolve(); }

  /** Run a prompt in a fresh session with nobody watching; waits for goal continuations to finish. */
  async runHeadless(o: { prompt: string; source: string; title?: string; approvalMode?: string; goal?: string; cwd?: string; tools?: string[]; tier?: "fast" | "strong"; prefer?: "fast" | "strong"; onSession?: (sessionId: string) => void }): Promise<{ sessionId: string; final: string; error?: string; goal?: GoalState }> {
    const s = this.createSession({ source: o.source, title: o.title ?? "", cwd: o.cwd ?? this.defaultCwd(), meta: { ...(o.tools ? { tool_names: o.tools, tool_names_explicit: true } : {}), ...(o.tier ? { router_tier: o.tier } : {}), ...(o.prefer ? { router_prefer: o.prefer } : {}) } });
    o.onSession?.(s.id);
    if (o.goal) this.db.setMeta(goalKey(s.id), { text: o.goal, status: "active", turns: 0, max_turns: this.cfg.data.goals.max_turns, created_at: Date.now() } satisfies GoalState);
    const first = await this.send(s.id, o.prompt, { source: o.source, approvalMode: o.approvalMode ?? "deny" });
    await this.waitIdle(s.id);
    const last = [...this.db.getMessages(s.id)].reverse().find((m) => m.role === "assistant" && !m.tool_calls?.length);
    return { sessionId: s.id, final: last?.content ?? first.final, error: first.error, goal: this.db.getMeta<GoalState>(goalKey(s.id)) ?? undefined };
  }

  /** A tool context for calling tools outside an agent turn (MCP server, scripts, tests). */
  toolContext(sid: string, signal: AbortSignal = new AbortController().signal, approvalMode = "deny"): import("../tools/types.js").ToolContext {
    const session = this.db.getSession(sid)!;
    return {
      rt: this, session, toolCallId: newId("call_"), depth: 0, budget: { remaining: this.cfg.data.agent.max_iterations },
      get cwd() { return session ? (session.cwd || process.cwd()) : process.cwd(); },
      setCwd: (p: string) => this.setSessionCwd(sid, p), signal,
      progress: (text: string) => this.emitEvent(sid, { type: "tool_output", text }),
      requestApproval: (req) => this.approvals.check({ ...req, sessionId: sid }, { headlessMode: approvalMode }),
      clarify: async () => null,
    };
  }

  // ── clarify ───────────────────────────────────────────────────
  askClarify(sessionId: string, question: string, choices?: string[]): Promise<string | null> {
    const s = this.db.getSession(sessionId);
    const interactive = (this.attached.get(sessionId) ?? 0) > 0 || ["telegram", "discord", "slack"].includes(s?.source ?? "");
    if (!interactive) return Promise.resolve(null);
    const id = newId("cl_");
    return new Promise((res) => {
      this.clarifies.set(id, { sessionId, question, choices, resolve: res });
      this.emitEvent(sessionId, { type: "clarify_request", id, question, choices });
      setTimeout(() => { if (this.clarifies.has(id)) this.respondClarify(id, null); }, 15 * 60_000).unref?.();
    });
  }
  respondClarify(id: string, answer: string | null): boolean {
    const c = this.clarifies.get(id);
    if (!c) return false;
    this.clarifies.delete(id);
    c.resolve(answer);
    this.emitEvent(c.sessionId, { type: "clarify_resolved", id, answer });
    return true;
  }
  pendingClarify(sessionId: string) { return [...this.clarifies.entries()].filter(([, c]) => c.sessionId === sessionId).map(([id, c]) => ({ id, question: c.question, choices: c.choices })); }
  cancelClarify(sessionId: string) { for (const [id, c] of [...this.clarifies]) if (c.sessionId === sessionId) this.respondClarify(id, null); }

  // ── titles ────────────────────────────────────────────────────
  maybeTitle(sid: string): void {
    const s = this.db.getSession(sid);
    if (!s || s.title) return;
    const first = this.db.getMessages(sid).find((m) => m.role === "user");
    if (!first?.content) return;
    const heuristic = first.content.replace(/\s+/g, " ").replace(/\n[\s\S]*/, "").slice(0, 60);
    this.db.updateSession(sid, { title: heuristic });
    this.emitEvent(sid, { type: "title", title: heuristic });
    void this.aux().chat({ messages: [{ role: "system", content: "Write a 3-6 word title for this conversation. Reply with the title only, no quotes." }, { role: "user", content: first.content.slice(0, 2000) }], maxTokens: 20, temperature: 0.2, stream: false })
      .then((r) => {
        const t = r.content.replace(/^["'#\s]+|["'\s.]+$/g, "").slice(0, 80);
        if (t && t.length > 2) { this.db.updateSession(sid, { title: t }); this.emitEvent(sid, { type: "title", title: t }); }
      }).catch(() => undefined);
  }

  // ── environment ───────────────────────────────────────────────
  capabilities(): string[] {
    if (this.caps) return this.caps;
    const out: string[] = [`node ${process.versions.node}`];
    const probe = (cmd: string, args: string[], label: string) => {
      try { const v = execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 4000 }).trim().split("\n")[0]; out.push(`${label}${v ? ` (${v.slice(0, 40)})` : ""}`); } catch { /* absent */ }
    };
    const py = findPython();
    if (py) probe(py, ["--version"], "python");
    probe("git", ["--version"], "git");
    probe("docker", ["--version"], "docker");
    probe("rg", ["--version"], "ripgrep");
    if (process.platform === "win32") probe("pwsh", ["-NoLogo", "-Command", "$PSVersionTable.PSVersion.ToString()"], "pwsh");
    probe("uv", ["--version"], "uv");
    probe("cargo", ["--version"], "cargo");
    probe("java", ["-version"], "java");
    probe("go", ["version"], "go");
    this.caps = out;
    return out;
  }

  // ── delivery (cron, kanban, notifications) ────────────────────
  async deliver(target: string, text: string): Promise<void> {
    const t = target || "log";
    const [kind, ...rest] = t.split(":");
    const arg = rest.join(":");
    if (kind === "log") {
      appendFileSync(join(this.home, "logs", "deliveries.log"), `\n[${new Date().toISOString()}]\n${redact(text)}\n`);
      this.emitEvent("*", { type: "notification", text });
      return;
    }
    if (kind === "session") { this.emitEvent(arg, { type: "notification", text }); return; }
    if (kind === "webhook") {
      const res = await fetch(arg, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, source: "stitap" }), signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`webhook delivery failed: HTTP ${res.status}`);
      return;
    }
    if (this.gateway && this.gateway.platforms().includes(kind)) { await this.gateway.send(kind, arg, text); return; }
    throw new Error(`cannot deliver to "${target}" (platform not running?)`);
  }

  private onProcessExit(p: { id: string; command: string; exitCode: number | null; sessionId: string; notifyOnExit: boolean; status: string }) {
    if (!p.notifyOnExit || p.status === "killed") return;
    const r = this.runners.get(p.sessionId);
    if (!r) return;
    const tail = this.processes.tail(p.id, 1500) ?? "";
    const msg = `[Background process ${p.id} finished with exit code ${p.exitCode}: ${p.command.slice(0, 120)}]\nLast output:\n${tail}`;
    this.emitEvent(p.sessionId, { type: "notification", text: `Background process ${p.id} exited (${p.exitCode})` });
    if (r.busy) r.steers.push(msg); else void r.enqueue(msg, { source: "notification", internal: true });
  }

  // ── background ticker: cron, kanban, /loop, /heartbeat ─────────
  private ownsTicker(): boolean {
    const me = `${hostname()}:${process.pid}`;
    const cur = this.db.getMeta<{ owner: string; at: number }>("ticker_owner");
    if (!cur || cur.owner === me || Date.now() - cur.at > 90_000) { this.db.setMeta("ticker_owner", { owner: me, at: Date.now() }); return true; }
    return false;
  }

  startBackground(): void {
    if (this.tickers.length) return;
    const fast = setInterval(() => { void this.tickAutonomy().catch((e) => log.warn(`autonomy tick: ${errMsg(e)}`)); }, 5000);
    const slow = setInterval(() => {
      if (!this.ownsTicker()) return;
      void this.cron.tick().catch((e) => log.warn(`cron tick: ${errMsg(e)}`));
      void this.kanban.tick().catch((e) => log.warn(`kanban tick: ${errMsg(e)}`));
      void this.pipelines.tick().catch((e) => log.warn(`pipeline tick: ${errMsg(e)}`));
    }, 30_000);
    fast.unref(); slow.unref();
    this.tickers.push(fast, slow);
    // resident router: bring both models up now instead of on the first request
    try { const p: any = this.providerFor(""); if (p instanceof RouterProvider && p.resident) void (p.server as DuoServer).ensureAll().catch((e: any) => log.warn(`router: ${errMsg(e)}`)); } catch (e) { log.warn(`router start: ${errMsg(e)}`); }
    setTimeout(() => { if (this.ownsTicker()) { try { this.kanban.recover(); } catch (e) { log.warn(`kanban recover: ${errMsg(e)}`); } void this.cron.tick(); void this.pipelines.tick(); } }, 2000).unref();
  }

  async tickAutonomy(): Promise<void> {
    const now = Date.now();
    for (const { key, value } of this.db.listMeta("loop:")) {
      const l = value as LoopState;
      const sid = key.slice(5);
      if (l.status !== "active" || l.next_at > now || !this.db.getSession(sid)) continue;
      const r = this.runner(sid);
      if (!r.idle()) continue;
      l.next_at = now + 365 * 86400_000; // re-armed by afterTurn
      this.db.setMeta(loopKey(sid), l);
      void r.enqueue(loopPrompt(l), { source: "loop", internal: true });
    }
    for (const { key, value } of this.db.listMeta("heartbeat:")) {
      const h = value as HeartbeatState;
      const sid = key.slice(10);
      if (h.status !== "active" || h.next_at > now || !this.db.getSession(sid)) continue;
      const r = this.runner(sid);
      if (!r.idle()) continue;
      h.next_at = now + h.interval_ms;
      h.fires++;
      this.db.setMeta(heartbeatKey(sid), h);
      void r.enqueue(heartbeatPrompt(h), { source: "heartbeat", internal: true });
    }
  }

  async shutdown(): Promise<void> {
    for (const t of this.tickers) clearInterval(t);
    this.tickers = [];
    for (const r of this.runners.values()) r.interrupt(true);
    this.processes.killAll();
    this.mcp.closeAll();
    stopAllLsp();
    await closeBrowsers();
    await this.storeBridge.close();
    for (const s of this.runners.keys()) await this.hooks.emit("on_session_end", { sessionId: s });
    this.db.close();
  }
}

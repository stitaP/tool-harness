/**
 * Model router: one llama-server that the harness itself starts, restarts and stops, serving a small fast model
 * for simple turns and a stronger one for hard turns. On a 16 GB Mac both cannot be resident at once, so a switch
 * is a restart (a few seconds for the 4B, 1-3 minutes for the 30B); the policy therefore switches up eagerly but
 * down only after a dwell time, and never to a model whose context window cannot hold the conversation.
 *
 * config.yaml:
 *   router:
 *     enabled: true
 *     mode: auto                       # auto | fast | strong (pinned)
 *     models:
 *       fast:   { name: qwen3-4b,         file: ~/models/Qwen3-4B-Instruct-2507-Q4_0.gguf, fit_margin_mb: 1024 }
 *       strong: { name: qwen3-coder-30b,  file: ~/models/Qwen3-Coder-30B-A3B-UD-IQ2_M.gguf, fit_margin_mb: 768, min_wired_mb: 12800 }
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Msg } from "../state/db.js";
import { log } from "../util/log.js";
import { sleep } from "../util/misc.js";
import type { ChatRequest, ChatResponse, Provider } from "./types.js";

export type Tier = "fast" | "strong";

export interface RouterModel {
  name: string; file: string; fit_margin_mb?: number; min_wired_mb?: number; context?: number; extra_args?: string[];
  /** resident mode: the port this model's own server listens on (default: strong = router.port, fast = router.port + 1) */
  port?: number;
  /** a different llama-server build for this model (e.g. the PrismML fork for ternary Bonsai) */
  llama_server?: string;
  kv?: string;
}
export interface RouterConfig {
  enabled: boolean;
  mode: "auto" | Tier;
  llama_server: string;
  port: number;
  kv: string;
  threads: number;
  /** seconds a model stays loaded before auto mode may switch back to the fast one */
  min_dwell: number;
  /** model calls in one turn after which the fast model hands the turn to the strong one */
  escalate_after: number;
  start_timeout: number;
  models: { fast?: RouterModel; strong?: RouterModel };
  /** keep BOTH models loaded at once, each on its own port, and route per request with no restarts (needs the memory for both) */
  resident?: boolean;
  /** resident mode: the tier that does the work unless something says otherwise (default "fast", the old behaviour) */
  default_tier?: Tier;
  /** resident mode: tiers that stay on disk until a request needs them (e.g. ["fast"]); they are stopped again after idle_unload_min idle minutes */
  on_demand?: Tier[];
  idle_unload_min?: number;
}

export const ROUTER_DEFAULTS: RouterConfig = {
  enabled: false, mode: "auto", llama_server: "llama-server", port: 8081, kv: "q8_0", threads: 4,
  min_dwell: 600, escalate_after: 8, start_timeout: 300, models: {},
};

const expand = (p: string) => p.replace(/^~(?=\/|$)/, homedir());

// ── routing policy (pure, unit-tested) ──────────────────────────────────────────────────

const HARD = /\b(implement|refactor|debug|architect|design|migrate|rewrite|investigate|optimi[sz]e|review|plan|integrat\w*|write (?:a |an |the )?(?:test|tests|function|class|module|script|parser|server|api)|fix (?:the |this |a )?(?:bug|failing|error|test)|multi-?file|root cause|why (?:does|is|do)\b.{0,40}\b(?:fail|crash|slow|break))/i;
const PATHS = /(?:^|[\s"'`(])(?:\.{0,2}\/)?[\w.-]+\/[\w./-]+\.\w{1,6}\b/g;

export interface RouteInput {
  messages: Msg[];
  /** estimated prompt tokens (messages + tool schemas) */
  tokens: number;
  mode: "auto" | Tier;
  current: Tier | null;
  /** ms since the current model finished loading */
  dwellMs: number;
  cfg: Pick<RouterConfig, "min_dwell" | "escalate_after">;
  /** context window of each model as last seen (0 = unknown) */
  ctx: Record<Tier, number>;
  strongAvailable: boolean;
  hasStrong: boolean;
  /** a caller (kanban worker/reviewer) can require a tier for this request */
  pin?: Tier;
  /** a caller's preferred tier: used unless the turn is going badly (failing tools, very long), then it escalates */
  prefer?: Tier;
  /** the tier that does the work when nothing else decides (resident mode with default_tier: "strong") */
  defaultTier?: Tier;
}
export interface RouteDecision { tier: Tier; reason: string }

/** What happened since the user's last message: model calls (assistant messages) and failed tool results. */
export function turnActivity(messages: Msg[]): { calls: number; errors: number; lastUser: string; goal: boolean } {
  let i = messages.length - 1;
  let calls = 0, errors = 0;
  for (; i >= 0 && messages[i].role !== "user"; i--) {
    const m = messages[i];
    if (m.role === "assistant") calls++;
    else if (m.role === "tool" && /^(error|\[error|failed|traceback|command failed|exit code [1-9])/i.test((m.content ?? "").trim())) errors++;
  }
  const text = i >= 0 ? String(messages[i].content ?? "") : "";
  return { calls, errors, lastUser: text, goal: /^\[?(goal|continue)\b|standing goal/i.test(text.trim()) };
}

export function scoreTask(text: string): { score: number; why: string[] } {
  const why: string[] = [];
  let score = 0;
  const t = text.trim();
  if (t.length > 600) { score += 2; why.push("long request"); }
  else if (t.length > 250) { score += 1; why.push("detailed request"); }
  if (/```/.test(t)) { score += 2; why.push("code block"); }
  if (HARD.test(t)) { score += 2; why.push("engineering keyword"); }
  if ((t.match(PATHS) ?? []).length >= 2) { score += 2; why.push("several files"); }
  if (/\b(step by step|then|after that|finally)\b/i.test(t) && t.length > 150) { score += 1; why.push("multi-step"); }
  return { score, why };
}

export function decide(inp: RouteInput): RouteDecision {
  const { mode, current, cfg } = inp;
  if (!inp.hasStrong) return { tier: "fast", reason: "no strong model configured" };
  if (inp.pin === "fast") return { tier: "fast", reason: "pinned to fast by the caller" };
  if (inp.pin === "strong") return inp.strongAvailable ? { tier: "strong", reason: "pinned to strong by the caller" } : { tier: "fast", reason: "strong model unavailable" };
  if (mode === "fast") return { tier: "fast", reason: "pinned to fast" };
  if (mode === "strong") return inp.strongAvailable ? { tier: "strong", reason: "pinned to strong" } : { tier: "fast", reason: "strong model unavailable" };

  const act = turnActivity(inp.messages);
  const { score, why } = scoreTask(act.lastUser);
  let want: RouteDecision;
  if (inp.prefer || inp.defaultTier === "strong") {
    // a fixed home tier instead of the keyword heuristics: the preferred tier works until the turn goes badly
    const home: Tier = inp.prefer ?? "strong";
    const bad = act.calls >= cfg.escalate_after ? `turn passed ${cfg.escalate_after} model calls` : act.errors >= 2 ? `${act.errors} failed tool calls this turn` : "";
    if (home === "fast" && bad) want = { tier: "strong", reason: bad };
    else want = { tier: home, reason: inp.prefer ? `${home} preferred for this kind of work` : "strong is the default model" };
    if (want.tier === "strong" && !inp.strongAvailable) return { tier: "fast", reason: `${want.reason}, but the strong model is unavailable` };
    if (want.tier === "strong" && inp.tokens > (inp.ctx.strong || 32768) * 0.85) return { tier: "fast", reason: `${want.reason}, but the conversation does not fit the strong model's window` };
    return want;
  }
  if (act.calls >= cfg.escalate_after) want = { tier: "strong", reason: `turn passed ${cfg.escalate_after} model calls` };
  else if (act.errors >= 2) want = { tier: "strong", reason: `${act.errors} failed tool calls this turn` };
  else if (act.goal) want = { tier: "strong", reason: "standing goal" };
  else if (score >= 2) want = { tier: "strong", reason: why.join(", ") };
  else want = { tier: "fast", reason: score ? why.join(", ") : "simple request" };

  if (want.tier === "strong") {
    const room = inp.ctx.strong || 32768;
    if (!inp.strongAvailable) return { tier: "fast", reason: `${want.reason}, but the strong model cannot start (GPU memory limit)` };
    if (inp.tokens > room * 0.85) return { tier: "fast", reason: `${want.reason}, but the conversation (${inp.tokens} tokens) does not fit the strong model's ${room}-token window` };
    return want;
  }
  // wants fast while strong is loaded: keep strong inside a turn and for the dwell time, a restart is not free
  if (current === "strong") {
    if (act.calls > 0) return { tier: "strong", reason: "finishing the turn on the strong model" };
    if (inp.dwellMs < cfg.min_dwell * 1000) return { tier: "strong", reason: `strong model loaded ${Math.round(inp.dwellMs / 1000)}s ago (dwell ${cfg.min_dwell}s)` };
  }
  return want;
}

// ── server manager ──────────────────────────────────────────────────────────────────────

export function wiredLimitMb(): number {
  if (process.platform !== "darwin") return Infinity;
  try { return Number(execFileSync("sysctl", ["-n", "iogpu.wired_limit_mb"], { encoding: "utf8" }).trim()) || 0; } catch { return 0; }
}

export class ModelServer {
  current: Tier | null = null;
  loadedAt = 0;
  readonly ctx: Record<Tier, number> = { fast: 0, strong: 0 };
  private child: ChildProcess | null = null;
  private logStream: WriteStream | null = null;
  private lock: Promise<unknown> = Promise.resolve();
  private strongBlockedUntil = 0;
  /** an llama-server we did not start is answering on the port: we cannot restart it, so we never switch */
  external: string | null = null;
  onStatus: (m: string) => void = () => undefined;

  constructor(private cfg: () => RouterConfig, private logDir: string) {
    process.once("exit", () => this.kill());
    for (const s of ["SIGINT", "SIGTERM"] as const) process.once(s, () => { this.kill(); process.exit(0); });
  }

  private get baseUrl() { return `http://127.0.0.1:${this.cfg().port}`; }

  strongAvailable(): boolean {
    const m = this.cfg().models.strong;
    if (!m || Date.now() < this.strongBlockedUntil) return false;
    if (m.min_wired_mb && wiredLimitMb() < m.min_wired_mb) {
      this.strongBlockedUntil = Date.now() + 5 * 60_000;
      this.onStatus(`strong model needs the GPU memory limit raised: sudo sysctl iogpu.wired_limit_mb=${Math.round(m.min_wired_mb / 256) * 256 + 512}`);
      return false;
    }
    return !!existsSync(expand(m.file));
  }

  private async probe(): Promise<{ alias: string; ctx: number } | null> {
    try {
      const r = await fetch(`${this.baseUrl}/props`, { signal: AbortSignal.timeout(2000) });
      if (!r.ok) return null;
      const j: any = await r.json();
      return { alias: String(j.model_alias ?? j.model_path ?? ""), ctx: Number(j?.default_generation_settings?.n_ctx ?? 0) };
    } catch { return null; }
  }

  /** Make `tier` the loaded model. Calls are serialized; resolves when the server answers /health. */
  ensure(tier: Tier): Promise<void> {
    const run = this.lock.then(() => this.doEnsure(tier));
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async doEnsure(tier: Tier): Promise<void> {
    const model = this.cfg().models[tier];
    if (!model) throw new Error(`router: no "${tier}" model configured`);
    if (this.current === tier && this.child && this.child.exitCode === null) return;
    if (!this.child) {
      const up = await this.probe();
      if (up) {
        const t = (["fast", "strong"] as Tier[]).find((k) => this.cfg().models[k]?.name === up.alias);
        this.external = up.alias;
        if (t) { this.current = t; this.loadedAt ||= Date.now(); this.ctx[t] = up.ctx; }
        if (t !== tier) log.warn(`router: another llama-server (${up.alias}) already owns port ${this.cfg().port}; staying on it`);
        return;
      }
    }
    await this.stop();
    this.external = null;
    this.onStatus(`loading ${model.name} (${tier}) — this takes ${tier === "strong" ? "1-3 minutes" : "a few seconds"}`);
    await this.start(tier, model);
  }

  private async start(tier: Tier, m: RouterModel): Promise<void> {
    const c = this.cfg();
    this.logStream?.end();
    this.logStream = createWriteStream(join(this.logDir, "model.log"), { flags: "a" });
    const { child, ctx } = await launchLlama(c, m, c.port, this.logStream, (ch) => {
      this.child = ch;
      ch.on("exit", () => { if (this.child === ch) { this.child = null; this.current = null; } });
    });
    this.current = tier; this.loadedAt = Date.now(); this.ctx[tier] = ctx;
    this.onStatus(`${m.name} ready (${ctx.toLocaleString()}-token context)`);
    void child;
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = null; this.current = null;
    if (child.exitCode === null) {
      const done = new Promise<void>((res) => child.once("exit", () => res()));
      child.kill("SIGTERM");
      await Promise.race([done, sleep(15_000)]);
      if (child.exitCode === null) { child.kill("SIGKILL"); await Promise.race([done, sleep(5000)]); }
    }
  }

  kill(): void { try { this.child?.kill("SIGKILL"); } catch { /* gone */ } this.child = null; }
}


/** Start one llama-server and wait until it answers. Shared by the one-at-a-time ModelServer and the resident DuoServer. */
export async function launchLlama(c: RouterConfig, m: RouterModel, port: number, log: WriteStream, onChild?: (ch: ChildProcess) => void): Promise<{ child: ChildProcess; ctx: number }> {
  const file = expand(m.file);
  if (!existsSync(file)) throw new Error(`router: model file not found: ${file}`);
  const bin = expand(m.llama_server ?? c.llama_server);
  const kv = m.kv ?? c.kv;
  const ctxArgs = m.context ? ["-c", String(m.context), "-ngl", "99"] : [];
  const args = ["-m", file, ...ctxArgs, "--fit", "on", "--fit-target", String(m.fit_margin_mb ?? 1024), "-np", "1", "-fa", "on",
    "-ctk", kv, "-ctv", kv, "-t", String(c.threads), "--mlock", "--jinja", "--metrics", "--host", "127.0.0.1", "--port", String(port), "--alias", m.name, ...(m.extra_args ?? []).map(String)];
  log.write(`\n=== ${new Date().toISOString()} router: starting ${m.name} on :${port} (${bin})\n`);
  const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout!.pipe(log, { end: false });
  child.stderr!.pipe(log, { end: false });
  onChild?.(child);
  let spawnErr: Error | null = null;
  child.on("error", (e) => { spawnErr = e; });
  const deadline = Date.now() + c.start_timeout * 1000;
  while (Date.now() < deadline) {
    if (spawnErr) throw new Error(`router: cannot run ${bin}: ${(spawnErr as Error).message}`);
    if (child.exitCode !== null) throw new Error(`router: llama-server exited (${child.exitCode}) while loading ${m.name}; see the model log`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok && /"ok"/.test(await r.text())) break;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  if (child.exitCode !== null) throw new Error(`router: ${m.name} failed to start`);
  let ctx = 0;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/props`, { signal: AbortSignal.timeout(3000) });
    const j: any = await r.json();
    ctx = Number(j?.default_generation_settings?.n_ctx ?? 0);
  } catch { /* leave 0 */ }
  if (!ctx && child.exitCode === null && Date.now() >= deadline) { try { child.kill("SIGKILL"); } catch { /* gone */ } throw new Error(`router: ${m.name} did not become ready in ${c.start_timeout}s`); }
  return { child, ctx };
}

/**
 * Resident mode: BOTH models stay loaded, each in its own llama-server on its own port, so switching tiers costs nothing.
 * The strong model starts first with a large --fit-target, which makes llama.cpp leave that much GPU memory free; the fast
 * model then fits into what is left. Everything is sized automatically (no context size is chosen by hand).
 */
export class DuoServer {
  current: Tier | null = null;
  loadedAt = 0;
  readonly ctx: Record<Tier, number> = { fast: 0, strong: 0 };
  readonly external: string | null = null;
  onStatus: (m: string) => void = () => undefined;
  private slots = new Map<Tier, { child: ChildProcess; port: number; log: WriteStream }>();
  private lock: Promise<unknown> = Promise.resolve();
  private failed = new Map<Tier, number>();
  readonly errors: Partial<Record<Tier, string>> = {};
  private lastUsed = new Map<Tier, number>();
  private inflight = new Map<Tier, number>();
  private reaper: ReturnType<typeof setInterval> | null = null;

  constructor(private cfg: () => RouterConfig, private logDir: string) {
    process.once("exit", () => this.kill());
    for (const s of ["SIGINT", "SIGTERM"] as const) process.once(s, () => { this.kill(); process.exit(0); });
  }

  /** a tier that stays on disk until a request needs it */
  isOnDemand(tier: Tier): boolean { return !!this.cfg().on_demand?.includes(tier); }
  /** a request on this tier started / finished (the idle timer never stops a model that is answering) */
  begin(tier: Tier) { this.inflight.set(tier, (this.inflight.get(tier) ?? 0) + 1); this.lastUsed.set(tier, Date.now()); }
  end(tier: Tier) { this.inflight.set(tier, Math.max(0, (this.inflight.get(tier) ?? 1) - 1)); this.lastUsed.set(tier, Date.now()); }
  /** stop on-demand models that have been idle for idle_unload_min minutes, so the memory is free again */
  private startReaper() {
    if (this.reaper) return;
    this.reaper = setInterval(() => {
      const c = this.cfg(), limit = (c.idle_unload_min ?? 10) * 60_000;
      if (limit <= 0) return;
      for (const tier of ["fast", "strong"] as Tier[]) {
        if (!this.isOnDemand(tier) || !this.isUp(tier) || (this.inflight.get(tier) ?? 0) > 0) continue;
        if (Date.now() - (this.lastUsed.get(tier) ?? 0) < limit) continue;
        const slot = this.slots.get(tier); if (!slot) continue;
        this.slots.delete(tier); try { slot.child.kill("SIGTERM"); } catch { /* gone */ }
        if (this.current === tier) this.current = [...this.slots.keys()][0] ?? null;
        this.onStatus(`${c.models[tier]?.name ?? tier} was idle for ${c.idle_unload_min ?? 10} min: unloaded (it loads again when needed)`);
      }
    }, 30_000);
    this.reaper.unref();
  }

  portOf(tier: Tier): number {
    const c = this.cfg();
    return c.models[tier]?.port ?? (tier === "strong" ? c.port : c.port + 1);
  }
  isUp(tier: Tier): boolean { const s = this.slots.get(tier); return !!s && s.child.exitCode === null; }
  strongAvailable(): boolean {
    const m = this.cfg().models.strong;
    if (!m) return false;
    if (this.isUp("strong")) return true;
    if ((this.failed.get("strong") ?? 0) > Date.now()) return false;     // failed recently: do not retry on every request
    if (m.min_wired_mb && wiredLimitMb() < m.min_wired_mb) { this.errors.strong = `needs iogpu.wired_limit_mb >= ${m.min_wired_mb}`; return false; }
    return existsSync(expand(m.file));
  }

  /** Make sure `tier` is serving. Never stops the other model. */
  ensure(tier: Tier): Promise<void> {
    const run = this.lock.then(() => this.doEnsure(tier));
    this.lock = run.catch(() => undefined);
    return run;
  }
  private async doEnsure(tier: Tier): Promise<void> {
    const c = this.cfg(), m = c.models[tier];
    if (!m) throw new Error(`router: no "${tier}" model configured`);
    if (this.isUp(tier)) { this.current = tier; this.lastUsed.set(tier, Date.now()); return; }
    const port = this.portOf(tier);
    // adopt a server that is already answering on that port (a previous run, or one started by hand)
    try {
      const r = await fetch(`http://127.0.0.1:${port}/props`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) { const j: any = await r.json(); this.ctx[tier] = Number(j?.default_generation_settings?.n_ctx ?? 0); this.current = tier; this.loadedAt ||= Date.now(); this.onStatus(`${m.name} already running on :${port}`); return; }
    } catch { /* nothing there */ }
    this.onStatus(`loading ${m.name} (${tier}) on :${port}`);
    const log = createWriteStream(join(this.logDir, tier === "strong" ? "model.log" : "model-fast.log"), { flags: "a" });
    try {
      const { child, ctx } = await launchLlama(c, m, port, log, (ch) => {
        this.slots.set(tier, { child: ch, port, log });
        ch.on("exit", () => { if (this.slots.get(tier)?.child === ch) this.slots.delete(tier); });
      });
      this.ctx[tier] = ctx; this.current = tier; this.loadedAt = Date.now(); this.lastUsed.set(tier, Date.now()); delete this.errors[tier]; this.startReaper();
      this.onStatus(`${m.name} ready on :${port} (${ctx.toLocaleString()}-token context)`);
      void child;
    } catch (e: any) {
      this.errors[tier] = e.message; this.failed.set(tier, Date.now() + 5 * 60_000);
      const s = this.slots.get(tier); if (s) { try { s.child.kill("SIGKILL"); } catch { /* gone */ } this.slots.delete(tier); }
      throw e;
    }
  }
  /** Load both models, strong first. A model that cannot load is reported but does not stop the other. */
  async ensureAll(): Promise<void> {
    const c = this.cfg();
    for (const tier of ["strong", "fast"] as Tier[]) {
      if (!c.models[tier]) continue;
      if (this.isOnDemand(tier)) { this.onStatus(`${c.models[tier]!.name} (${tier}) stays on disk until it is needed`); continue; }
      try { await this.ensure(tier); } catch (e: any) { log.warn(`router (resident): ${tier} model did not start: ${e.message}`); this.onStatus(`${tier} model did not start: ${e.message}`); }
    }
  }
  async stop(): Promise<void> {
    const all = [...this.slots.values()]; this.slots.clear(); this.current = null;
    await Promise.all(all.map(async ({ child }) => {
      if (child.exitCode !== null) return;
      const done = new Promise<void>((res) => child.once("exit", () => res()));
      child.kill("SIGTERM");
      await Promise.race([done, sleep(15_000)]);
      if (child.exitCode === null) { child.kill("SIGKILL"); await Promise.race([done, sleep(5000)]); }
    }));
  }
  kill(): void { if (this.reaper) clearInterval(this.reaper); for (const { child } of this.slots.values()) { try { child.kill("SIGKILL"); } catch { /* gone */ } } this.slots.clear(); }
}

// ── provider ────────────────────────────────────────────────────────────────────────────

const estimate = (messages: Msg[], tools?: { name: string; description: string; parameters: any }[]) =>
  Math.round((messages.reduce((n, m) => n + (m.content?.length ?? 0) + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0), 0) + (tools ? JSON.stringify(tools).length : 0)) / 3.2);

export class RouterProvider implements Provider {
  /** manual override from /route, persisted only for this process */
  mode: "auto" | Tier;
  last: RouteDecision | null = null;
  private inners = new Map<Tier, Provider>();
  constructor(private inner: Provider, readonly server: ModelServer | DuoServer, private cfg: () => RouterConfig, private onEvent?: (m: string) => void,
    /** resident mode: build the provider that talks to one tier's own port */
    private makeInner?: (tier: Tier, port: number, name: string, ctx: number) => Provider) {
    this.mode = cfg().mode;
    server.onStatus = (m) => this.onEvent?.(m);
  }
  get resident(): boolean { return this.server instanceof DuoServer; }
  get id() { return `router:${this.server.current ?? "idle"}:${this.inner.id}`; }
  get model() { const t = this.server.current; return (t && this.cfg().models[t]?.name) || this.inner.model; }
  get contextWindow() { const t = this.server.current; return (t && this.server.ctx[t]) || this.inner.contextWindow; }

  /** The provider for a tier: the shared one when a single server is swapped, one per port in resident mode. */
  private innerFor(tier: Tier): Provider {
    if (!(this.server instanceof DuoServer) || !this.makeInner) return this.inner;
    const m = this.cfg().models[tier]!;
    const key = `${tier}:${this.server.portOf(tier)}:${this.server.ctx[tier]}`;
    let p = this.inners.get(tier) as (Provider & { __key?: string }) | undefined;
    if (!p || p.__key !== key) { p = this.makeInner(tier, this.server.portOf(tier), m.name, this.server.ctx[tier]) as Provider & { __key?: string }; p.__key = key; this.inners.set(tier, p); }
    return p;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const c = this.cfg();
    const duo = this.server instanceof DuoServer ? this.server : null;
    // aux calls (judge, titles, summaries) carry no tools: they run on a model that is already up (the fast one in resident mode)
    if (!req.tools?.length) {
      if (duo) {
        // background calls never load a model that is on demand: use the fast one only if it is already up
        const t: Tier = duo.isUp("fast") ? "fast" : duo.isUp("strong") || !c.models.fast ? "strong" : "fast";
        if (!duo.isUp(t)) await duo.ensure(t);
        duo.begin(t); try { return await this.innerFor(t).chat(req); } finally { duo.end(t); }
      }
      if (this.server.current) return this.inner.chat(req);
    }
    const hasStrong = !!c.models.strong;
    const d = decide({
      messages: req.messages, tokens: estimate(req.messages, req.tools), mode: this.mode, current: this.server.current,
      dwellMs: duo ? Number.MAX_SAFE_INTEGER : this.server.current ? Date.now() - this.server.loadedAt : 0, cfg: c, ctx: this.server.ctx,
      strongAvailable: hasStrong && this.server.strongAvailable(), hasStrong, pin: req.tier, prefer: req.prefer, defaultTier: duo ? c.default_tier : undefined,
    });
    this.last = d;
    if (duo) {
      // both models are resident: no restart, just talk to the right port (start it if it is not up yet)
      if (d.tier !== duo.current) this.onEvent?.(`router → ${d.tier} model: ${d.reason}`);
      let use: Tier = d.tier;
      try { await duo.ensure(d.tier); }
      catch (e: any) {
        const other: Tier = d.tier === "fast" ? "strong" : "fast";
        log.warn(`router: ${d.tier} model unavailable: ${e.message}`);
        this.onEvent?.(`router: the ${d.tier} model is not available (${e.message}); using the ${other} model`);
        await duo.ensure(other); use = other;
      }
      duo.begin(use);
      try { return await this.innerFor(use).chat(req); } finally { duo.end(use); }
    }
    if (d.tier !== this.server.current) {
      this.onEvent?.(`router → ${d.tier} model: ${d.reason}`);
      try { await this.server.ensure(d.tier); }
      catch (e: any) {
        log.warn(`router: switch to ${d.tier} failed: ${e.message}`);
        this.onEvent?.(`router: could not load the ${d.tier} model (${e.message}); using what is loaded`);
        if (!this.server.current) await this.server.ensure(d.tier === "fast" ? "strong" : "fast");
      }
    }
    return this.inner.chat(req);
  }
}

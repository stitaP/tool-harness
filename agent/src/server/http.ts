/**
 * harnessd HTTP server: web chat UI, JSON API + Server-Sent Events, an
 * OpenAI-compatible endpoint, and inbound webhooks. Zero dependencies.
 * Binds to 127.0.0.1 by default; every API call needs the local token.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir, totalmem } from "node:os";
import type { McpServerConfig } from "../mcp/client.js";
import { benchText, summarize } from "../runtime/bench.js";
import { MCP_PRESETS, presetConfig } from "../mcp/presets.js";
import { currentBrowserId, detectBrowsers, resetBrowsers, testBrowser } from "../tools/browser.js";
import { resourcePath } from "../util/resources.js";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Runtime } from "../runtime/runtime.js";
import { VERSION } from "../runtime/runtime.js";
import { listCommands, looksLikeCommand, runCommand, insights } from "../runtime/commands.js";
import { barePathHint, expandReferences } from "../prompt/references.js";
import { goalKey, loopKey, heartbeatKey } from "../loop/autonomy.js";
import { handleChatCompletions, handleModels } from "./openai-api.js";
import { boardSummary, cardDetail, evidenceFile } from "../kanban/dashboard.js";
import { log } from "../util/log.js";
import { errMsg } from "../util/misc.js";

export function serverToken(home: string): string {
  const p = join(home, "server.token");
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  const t = randomBytes(24).toString("base64url");
  writeFileSync(p, t);
  try { chmodSync(p, 0o600); } catch { /* windows */ }
  return t;
}

function uiDir(): string { return resourcePath("ui"); }

async function body(req: IncomingMessage, limit = 25 * 1024 * 1024): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error("request too large"); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { _raw: raw }; }
}

function json(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

const run = promisify(execFile);
const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** Settings editable from the web UI: config path → type. Everything else stays in config.yaml. */
type SettingSpec = { type: "string" } | { type: "int"; min: number; max: number } | { type: "number"; min: number; max: number } | { type: "bool" } | { type: "enum"; values: string[] } | { type: "list" };
const SETTINGS: Record<string, SettingSpec> = {
  "model.name": { type: "string" }, "model.base_url": { type: "string" }, "model.provider": { type: "enum", values: ["openai", "anthropic"] },
  "model.context_window": { type: "int", min: 1024, max: 2_000_000 }, "model.max_output_tokens": { type: "int", min: 0, max: 200_000 },
  "model.temperature": { type: "number", min: 0, max: 2 }, "model.request_timeout": { type: "int", min: 10, max: 86_400 },
  "agent.tool_profile": { type: "enum", values: ["slm", "standard", "full"] }, "agent.max_iterations": { type: "int", min: 1, max: 1000 },
  "agent.personality": { type: "string" }, "agent.default_cwd": { type: "string" }, "approvals.mode": { type: "enum", values: ["ask", "deny", "yolo"] },
  "compression.enabled": { type: "bool" }, "compression.threshold": { type: "number", min: 0.3, max: 0.95 },
  "goals.max_turns": { type: "int", min: 1, max: 2000 },
  "delegation.max_concurrent": { type: "int", min: 1, max: 16 }, "delegation.max_iterations": { type: "int", min: 1, max: 500 },
  "web.docs_lookup": { type: "enum", values: ["ask", "always", "never"] }, "web.search_provider": { type: "enum", values: ["duckduckgo", "searxng", "brave", "tavily"] },
  "cron.enabled": { type: "bool" }, "cron.approval_mode": { type: "enum", values: ["deny", "ask", "yolo"] },
  // per-tool settings (Settings → Tools)
  "terminal.backend": { type: "enum", values: ["local", "docker", "ssh"] }, "terminal.shell": { type: "string" }, "terminal.timeout": { type: "int", min: 5, max: 86_400 },
  "terminal.docker_image": { type: "string" }, "terminal.ssh_host": { type: "string" },
  "browser.mode": { type: "enum", values: ["launch", "connect"] }, "browser.headless": { type: "bool" }, "browser.channel": { type: "string" },
  "browser.cdp_url": { type: "string" }, "browser.executable_path": { type: "string" },
  "desktop.enabled": { type: "bool" }, "desktop.approve_reads": { type: "bool" }, "capture.enabled": { type: "bool" }, "capture.skip_permission_check": { type: "bool" },
  "web.searxng_url": { type: "string" }, "web.allow_private": { type: "bool" }, "web.docs_domains": { type: "list" }, "web.egress_allowlist": { type: "list" },
  "checkpoints.enabled": { type: "bool" }, "agent.max_tool_output_chars": { type: "int", min: 1000, max: 1_000_000 }, "agent.parallel_tools": { type: "bool" },
  "security.redact_tool_output": { type: "bool" }, "security.blocked_paths": { type: "list" }, "security.protected_paths": { type: "list" },
  "memory.memory_chars": { type: "int", min: 200, max: 100_000 }, "memory.user_chars": { type: "int", min: 200, max: 100_000 },
  "curator.enabled": { type: "bool" }, "curator.auto_save_skills": { type: "bool" },
};
function coerceSetting(spec: SettingSpec, v: any): any {
  switch (spec.type) {
    case "string": return typeof v === "string" ? v.trim() : undefined;
    case "bool": return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : undefined;
    case "enum": return spec.values.includes(v) ? v : undefined;
    case "int": { const n = Number(v); return Number.isInteger(n) && n >= spec.min && n <= spec.max ? n : undefined; }
    case "number": { const n = Number(v); return Number.isFinite(n) && n >= spec.min && n <= spec.max ? n : undefined; }
    case "list": {
      const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,]/) : null;
      return arr ? arr.map((x) => String(x).trim()).filter(Boolean) : undefined;
    }
  }
}

/** Apple-silicon GPU memory from the IOAccelerator registry (no sudo). null elsewhere. */
async function gpuStats(): Promise<any> {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await run("ioreg", ["-r", "-d", "1", "-c", "IOAccelerator"], { timeout: 3000 });
    const num = (k: string) => { const m = new RegExp(`"${k}"=(\\d+)`).exec(stdout); return m ? Number(m[1]) : undefined; };
    let limitMb = 0;
    try { limitMb = Number((await run("sysctl", ["-n", "iogpu.wired_limit_mb"], { timeout: 2000 })).stdout.trim()) || 0; } catch { /* older macOS */ }
    // iogpu.wired_limit_mb=0 means macOS's default GPU working-set cap, about 2/3 of RAM on 16-32 GB machines
    const limit = limitMb > 0 ? limitMb * 1048576 : Math.round(totalmem() * 2 / 3);
    return { inUse: num("In use system memory"), allocated: num("Alloc system memory"), utilization: num("Device Utilization %"), limit, limitIsDefault: limitMb <= 0, ram: totalmem() };
  } catch { return null; }
}

/** Live decode rate from llama.cpp's /slots: n_decoded growth of busy slots between two polls. */
let lastSlots: { at: number; tasks: Map<number, number> } | null = null;
async function liveRate(baseUrl: string): Promise<any> {
  if (!baseUrl) return null;
  try {
    const r = await fetch(baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "") + "/slots", { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    const slots: any[] = await r.json();
    const now = Date.now(), tasks = new Map<number, number>();
    let busy = 0, decoded = 0, delta = 0;
    for (const s of slots) {
      if (!s.is_processing || s.id_task === undefined) continue;
      const n = s.next_token?.[0]?.n_decoded ?? 0;
      busy++; decoded += n; tasks.set(s.id_task, n);
      const prev = lastSlots?.tasks.get(s.id_task);
      if (prev !== undefined && n >= prev) delta += n - prev;
    }
    const tps = lastSlots && now > lastSlots.at && busy ? delta / ((now - lastSlots.at) / 1000) : null;
    lastSlots = { at: now, tasks };
    return { slots: slots.length, busy, decoded, tps };
  } catch { return null; }
}

function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface ServerHandle { url: string; token: string; close(): Promise<void>; webhooks: Map<string, (payload: any, req: IncomingMessage) => Promise<any>> }

export async function startServer(rt: Runtime, opts: { host?: string; port?: number } = {}): Promise<ServerHandle> {
  const host = opts.host ?? rt.cfg.data.server.host;
  const port = opts.port ?? rt.cfg.data.server.port;
  const token = serverToken(rt.home);
  const apiKey = rt.cfg.data.server.api_key || rt.cfg.secret("STITAP_API_KEY") || "";
  const webhooks = new Map<string, (payload: any, req: IncomingMessage) => Promise<any>>();
  const allowedOrigins = new Set(rt.cfg.data.server.cors_origins ?? []);
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  // recent model-call speeds for the side panel (in memory; token totals come from the usage table)
  const speeds: { at: number; sessionId: string; genTps: number; promptTps?: number; genTokens: number }[] = [];
  const contexts = new Map<string, { used: number; window: number; compact_at: number | null; at: number }>();
  speeds.push(...(rt.db.getMeta<typeof speeds>("stats_speeds") ?? []));   // last speeds from before a restart
  const contextOf = (id: string) => contexts.get(id) ?? rt.db.getMeta(`stats_ctx:${id}`) ?? null;
  rt.on("event", (ev: any) => {
    if (ev.type === "model_call" && ev.context) {
      contexts.set(ev.sessionId, { ...ev.context, at: Date.now() });
      rt.db.setMeta(`stats_ctx:${ev.sessionId}`, contexts.get(ev.sessionId));   // shown again after a restart
    }
    if (ev.type === "compressed") contexts.delete(ev.sessionId); // stale until the next call reports the new size
    if (ev.type !== "model_call" || !ev.timings) return;
    speeds.push({ at: Date.now(), sessionId: ev.sessionId, ...ev.timings });
    if (speeds.length > 50) speeds.shift();
    rt.db.setMeta("stats_speeds", speeds.slice(-20));
  });

  const authed = (req: IncomingMessage, url: URL): boolean => {
    const h = String(req.headers["x-stitap-token"] ?? "");
    const bearer = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const q = url.searchParams.get("token") ?? "";
    for (const cand of [h, bearer, q]) if (cand && (safeEq(cand, token) || (apiKey && safeEq(cand, apiKey)))) return true;
    return false;
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const origin = String(req.headers.origin ?? "");
    // DNS-rebinding guard for loopback binds
    const hostHeader = String(req.headers.host ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
    if (loopback && !["localhost", "127.0.0.1", "::1"].includes(hostHeader)) { res.writeHead(403).end("forbidden host"); return; }
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-headers", "content-type, x-stitap-token, authorization");
      res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("vary", "origin");
    }
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    const p = url.pathname;
    try {
      // ── static UI ──
      if (req.method === "GET" && (p === "/" || p === "/index.html" || p === "/chat")) {
        const file = join(uiDir(), "index.html");
        if (!existsSync(file)) { res.writeHead(404).end("UI not found"); return; }
        const html = readFileSync(file, "utf8").replace("__STITAP_TOKEN__", token);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'" });
        res.end(html);
        return;
      }
      if (p === "/favicon.ico") { res.writeHead(204).end(); return; }
      if (p === "/api/health") return json(res, 200, { ok: true, version: VERSION });
      // token hand-off to the stitaP web app on an allow-listed origin
      if (p === "/api/pair" && req.method === "GET") {
        if (origin && !allowedOrigins.has(origin)) return json(res, 403, { error: "origin not allowed" });
        return json(res, 200, { token });
      }
      // ── webhooks (own secret, no token) ──
      if (p.startsWith("/webhook/") && req.method === "POST") {
        const name = decodeURIComponent(p.slice(9));
        const h = webhooks.get(name);
        if (!h) return json(res, 404, { error: "unknown webhook" });
        return json(res, 200, await h(await body(req), req));
      }
      if (!authed(req, url)) return json(res, 401, { error: "missing or invalid token" });

      // ── OpenAI-compatible ──
      if (p === "/v1/models" && req.method === "GET") return handleModels(rt, res);
      if (p === "/v1/chat/completions" && req.method === "POST") return handleChatCompletions(rt, req, res, await body(req));

      // ── events (SSE) ──
      if (p === "/api/events" && req.method === "GET") {
        const sid = url.searchParams.get("session") ?? "";
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
        res.write(`event: hello\ndata: ${JSON.stringify({ session: sid })}\n\n`);
        if (sid) rt.attached.set(sid, (rt.attached.get(sid) ?? 0) + 1);
        const send = (ev: any) => { if (!sid || ev.sessionId === sid || ev.sessionId === "*") res.write(`data: ${JSON.stringify(ev)}\n\n`); };
        rt.on("event", send);
        const ka = setInterval(() => res.write(`: ping\n\n`), 15000);
        req.on("close", () => {
          clearInterval(ka); rt.off("event", send);
          if (sid) { const n = (rt.attached.get(sid) ?? 1) - 1; if (n <= 0) rt.attached.delete(sid); else rt.attached.set(sid, n); }
        });
        return;
      }

      if (p === "/api/info") {
        return json(res, 200, {
          version: VERSION, home: rt.home, model: rt.cfg.data.model.name, provider: rt.cfg.data.model.provider, base_url: rt.cfg.data.model.base_url,
          profile: rt.cfg.data.agent.tool_profile, approvals: rt.cfg.data.approvals.mode, terminal: rt.terminal.describe(), capabilities: rt.capabilities(),
          commands: listCommands(), skills: rt.skills.list().map((s) => ({ name: s.name, description: s.description, category: s.category, source: s.source })),
          store: rt.storeBridge.count, mcp: rt.mcp.summary(), policy: rt.cfg.policy ? { enforced: Object.keys(rt.cfg.policy.enforce ?? {}), message: rt.cfg.policy.message } : null,
        });
      }
      if (p === "/api/stats" && req.method === "GET") {
        const sid = url.searchParams.get("session") ?? "";
        // input counts the whole prompt each call; cached = the part the server reused from its prompt cache (no compute)
        const sum = (rows: { input_tokens: number; output_tokens: number; cached_tokens?: number | null }[]) => ({
          calls: rows.length, input: rows.reduce((n, r) => n + r.input_tokens, 0), output: rows.reduce((n, r) => n + r.output_tokens, 0),
          cached: rows.reduce((n, r) => n + (r.cached_tokens ?? 0), 0), cachedKnown: rows.some((r) => typeof r.cached_tokens === "number"),
        });
        // a chat's own calls plus those of the chats it started (pipeline documents, subagents)
        const tree = sid ? rt.db.sessionTree(sid) : [];
        const treeSet = new Set(tree);
        const mine = sid ? speeds.filter((s) => treeSet.has(s.sessionId)) : speeds;
        const recent = mine.slice(-10);
        const avg = recent.length ? recent.reduce((n, s) => n + s.genTokens, 0) / recent.reduce((n, s) => n + s.genTokens / s.genTps, 0) : null;
        const [gpu, live] = await Promise.all([gpuStats(), rt.cfg.data.model.provider === "openai" ? liveRate(rt.cfg.data.model.base_url ?? "") : null]);
        return json(res, 200, {
          session: sid ? { ...sum(tree.flatMap((id) => rt.db.usageSince(0, id))), chats: tree.length } : null,
          total: sum(rt.db.usageSince(0)),
          rate: { last: mine.at(-1) ?? null, avg, live },
          gpu, context_window: rt.providerFor(sid).contextWindow || rt.cfg.data.model.context_window,
          // a chat running a pipeline does its work in child chats: show the running document's context there
          context: sid ? contextOf(sid) ?? (() => { const cur = rt.pipelines.get(sid)?.items.find((i) => i.status === "running"); return cur?.sessionId ? contextOf(cur.sessionId) : null; })() : null,
          pipeline: sid ? (() => { const p = rt.pipelines.get(sid); if (!p) return null; const cur = p.items.find((i) => i.status === "running"); return { status: p.status, done: p.items.filter((i) => i.status === "done").length, stuck: p.items.filter((i) => i.status === "stuck").length, total: p.items.length, current: cur ? `${cur.name} (attempt ${cur.attempts})` : null }; })() : null,
          compact_at: rt.cfg.data.compression.enabled ? rt.cfg.data.compression.threshold : null,
        });
      }
      if (p === "/api/sessions" && req.method === "GET") {
        const archived = url.searchParams.get("archived") === "1";
        return json(res, 200, rt.db.listSessions({ limit: Number(url.searchParams.get("limit")) || 50, archived }).map((s) => ({ id: s.id, title: s.title, source: s.source, updated_at: s.updated_at, created_at: s.created_at, busy: rt.isBusy(s.id), archived: !!s.meta?.archived })));
      }
      if (p === "/api/sessions" && req.method === "POST") {
        const b = await body(req);
        const s = rt.createSession({ source: "web", title: b.title ?? "", cwd: b.cwd || undefined });
        if (b.agent && b.agent !== "default") { try { rt.applyAgent(s.id, String(b.agent)); } catch (e) { return json(res, 400, { error: errMsg(e) }); } }
        return json(res, 200, { id: s.id });
      }
      // ── settings: an allow-listed, type-checked subset of config.yaml ──
      if (p === "/api/settings" && req.method === "GET") {
        return json(res, 200, Object.fromEntries(Object.keys(SETTINGS).map((k) => [k, rt.cfg.get(k)])));
      }
      if (p === "/api/settings" && req.method === "POST") {
        const b = await body(req);
        const changed: string[] = [], errors: string[] = [];
        for (const [k, raw] of Object.entries(b)) {
          const spec = SETTINGS[k];
          if (!spec) { errors.push(`${k}: not a setting`); continue; }
          const v = coerceSetting(spec, raw);
          if (v === undefined) { errors.push(`${k}: invalid value ${JSON.stringify(raw)}`); continue; }
          if (k === "agent.default_cwd" && v && !isDir(String(v).replace(/^~(?=\/|$)/, homedir()))) { errors.push(`${k}: not a folder: ${v}`); continue; }
          if (JSON.stringify(rt.cfg.get(k)) === JSON.stringify(v)) continue;
          try { rt.cfg.set(k, v); changed.push(k); } catch (e) { errors.push(`${k}: ${errMsg(e)}`); }
        }
        if (changed.some((k) => k.startsWith("model."))) rt.resetProviders();
        return json(res, errors.length && !changed.length ? 400 : 200, { changed, errors });
      }
      // ── agents (config.yaml agents:) ──
      if (p === "/api/agents" && req.method === "GET") {
        return json(res, 200, Object.entries(rt.cfg.data.agents ?? {}).map(([name, d]) => ({ name, ...d })));
      }
      if (p === "/api/agents" && req.method === "POST") {
        const b = await body(req);
        const name = String(b.name ?? "").trim();
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(name) || name === "default") return json(res, 400, { error: "name: letters, digits, - and _ only (not 'default')" });
        const str = (x: any) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
        const num = (x: any) => (x === "" || x === null || x === undefined || !Number.isFinite(Number(x)) ? undefined : Number(x));
        const def: Record<string, any> = {
          description: str(b.description), instructions: str(b.instructions),
          tool_profile: ["slm", "standard", "full"].includes(b.tool_profile) ? b.tool_profile : undefined,
          tools: Array.isArray(b.tools) ? b.tools.map(String).filter(Boolean) : undefined,
          personality: str(b.personality), max_iterations: num(b.max_iterations),
        };
        const model = { name: str(b.model?.name), base_url: str(b.model?.base_url), provider: str(b.model?.provider), temperature: num(b.model?.temperature) };
        if (Object.values(model).some((v) => v !== undefined)) def.model = Object.fromEntries(Object.entries(model).filter(([, v]) => v !== undefined));
        if (def.tools && !def.tools.length) delete def.tools;
        const unknown = (def.tools ?? []).filter((t: string) => !rt.tools.get(t));
        if (unknown.length) return json(res, 400, { error: `unknown tool(s): ${unknown.join(", ")}` });
        const agents: Record<string, any> = { ...(rt.cfg.data.agents ?? {}) };
        if (b.rename_from && b.rename_from !== name) delete agents[b.rename_from];
        agents[name] = Object.fromEntries(Object.entries(def).filter(([, v]) => v !== undefined));
        rt.cfg.set("agents", agents);
        return json(res, 200, { name, ...agents[name] });
      }
      const agm = /^\/api\/agents\/([^/]+)$/.exec(p);
      if (agm && req.method === "DELETE") {
        const agents: Record<string, any> = { ...(rt.cfg.data.agents ?? {}) };
        delete agents[decodeURIComponent(agm[1])];
        rt.cfg.set("agents", agents);
        return json(res, 200, { ok: true });
      }
      // ── working folders: default for new chats, recent ones, and a folder browser ──
      if (p === "/api/folders" && req.method === "GET") {
        return json(res, 200, { default: rt.defaultCwd(), configured: rt.cfg.data.agent.default_cwd ?? "", start: rt.startCwd, home: homedir(), recent: rt.recentCwds() });
      }
      if (p === "/api/folders/default" && req.method === "POST") {
        const b = await body(req);
        const raw = String(b.path ?? "").trim();
        const dir = raw ? resolve(raw.replace(/^~(?=\/|$)/, homedir())) : "";
        if (dir && !isDir(dir)) return json(res, 400, { error: `not a folder: ${dir}` });
        rt.cfg.set("agent.default_cwd", dir);
        return json(res, 200, { default: rt.defaultCwd() });
      }
      if (p === "/api/fs/dirs" && req.method === "GET") {
        const dir = resolve((url.searchParams.get("path") || homedir()).replace(/^~(?=\/|$)/, homedir()));
        if (!isDir(dir)) return json(res, 400, { error: `not a folder: ${dir}` });
        let dirs: string[] = [];
        try { dirs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort((a, b) => a.localeCompare(b)); } catch (e) { return json(res, 403, { error: errMsg(e) }); }
        return json(res, 200, { path: dir, parent: dirname(dir) !== dir ? dirname(dir) : null, dirs: dirs.slice(0, 500) });
      }
      if (p === "/api/fs/mkdir" && req.method === "POST") {
        const b = await body(req);
        const dir = resolve(String(b.path ?? "").trim().replace(/^~(?=\/|$)/, homedir()));
        if (!isDir(dirname(dir))) return json(res, 400, { error: `parent folder does not exist: ${dirname(dir)}` });
        try { mkdirSync(dir, { recursive: false }); } catch (e: any) { if (e.code !== "EEXIST") return json(res, 400, { error: errMsg(e) }); }
        return json(res, 200, { path: dir });
      }
      // ── browser choice for the browser_* tools ──
      if (p === "/api/browsers" && req.method === "GET") {
        return json(res, 200, { current: currentBrowserId(rt), browsers: detectBrowsers() });
      }
      if (p === "/api/browsers" && req.method === "POST") {
        const b = await body(req);
        const choice = detectBrowsers().find((x) => x.id === b.id);
        if (!choice) return json(res, 404, { error: `unknown browser ${b.id}` });
        if (!choice.supported) return json(res, 400, { error: `${choice.label}: ${choice.note ?? "not supported"}` });
        for (const [k, v] of Object.entries(choice.set)) rt.cfg.set(`browser.${k}`, v);
        await resetBrowsers();
        return json(res, 200, { current: choice.id });
      }
      if (p === "/api/browsers/test" && req.method === "POST") {
        try { return json(res, 200, { ok: true, message: await testBrowser(rt) }); }
        catch (e) { return json(res, 200, { ok: false, message: errMsg(e) }); }
      }
      // ── tools: every registered tool with its state (auto | always | on_demand | off) ──
      if (p === "/api/tools" && req.method === "GET") {
        const tc = rt.cfg.data.tools as any;
        const state = (name: string, set: string) => tc.disabled.includes(name) ? "off" : (tc.deferred ?? []).includes(name) ? "on_demand" : ((tc.enabled ?? []).includes(name) || (tc.enabled ?? []).includes(set)) ? "always" : "auto";
        return json(res, 200, rt.tools.all().map((t) => {
          let why: string | undefined;
          try { const a = t.available?.(rt); if (typeof a === "string") why = a; else if (a === false) why = "not available on this machine"; } catch (e) { why = errMsg(e); }
          if (rt.cfg.policy?.disable_tools?.includes(t.name)) why = "disabled by administrator policy";
          return { name: t.name, toolset: t.toolset, tier: t.tier ?? "standard", description: t.description, deferred: !!t.deferred, mcp: t.toolset.startsWith("mcp:"), state: state(t.name, t.toolset), unavailable: why };
        }).sort((a, b) => a.toolset.localeCompare(b.toolset) || a.name.localeCompare(b.name)));
      }
      if (p === "/api/tools/state" && req.method === "POST") {
        const b = await body(req);
        const name = String(b.name ?? ""), st = String(b.state ?? "");
        if (!rt.tools.get(name)) return json(res, 404, { error: `no tool ${name}` });
        if (!["auto", "always", "on_demand", "off"].includes(st)) return json(res, 400, { error: "state: auto | always | on_demand | off" });
        const tc = rt.cfg.data.tools as any;
        const without = (l: string[] | undefined) => (l ?? []).filter((x) => x !== name);
        rt.cfg.set("tools.disabled", st === "off" ? [...without(tc.disabled), name] : without(tc.disabled));
        rt.cfg.set("tools.deferred", st === "on_demand" ? [...without(tc.deferred), name] : without(tc.deferred));
        rt.cfg.set("tools.enabled", st === "always" ? [...without(tc.enabled), name] : without(tc.enabled));
        // tool lists are fixed per chat (prompt-cache stability): optionally re-apply to the chat the user is in
        if (b.session && rt.db.getSession(String(b.session)) && !rt.isBusy(String(b.session))) rt.refreshSystemPrompt(String(b.session));
        return json(res, 200, { name, state: st });
      }
      const sm = /^\/api\/sessions\/([^/]+)(\/[a-z]+)?$/.exec(p);
      if (sm) {
        const sid = decodeURIComponent(sm[1]);
        const sub = sm[2] ?? "";
        const s = rt.db.getSession(sid);
        if (!s) return json(res, 404, { error: "no such session" });
        if (!sub && req.method === "GET") {
          return json(res, 200, {
            session: { ...s, system_prompt: undefined }, busy: rt.isBusy(sid), cwd: rt.sessionCwd(sid), model: rt.providerFor(sid).model,
            messages: rt.db.getMessages(sid).map((m) => ({ id: m.id, role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id, name: m.name, created_at: m.created_at, meta: m.meta ? { source: m.meta.source, compression_summary: m.meta.compression_summary } : undefined })),
            todos: rt.db.getMeta(`todo:${sid}`) ?? [], goal: rt.db.getMeta(goalKey(sid)), loop: rt.db.getMeta(loopKey(sid)), heartbeat: rt.db.getMeta(heartbeatKey(sid)),
            approvals: rt.approvals.list(sid), clarify: rt.pendingClarify(sid),
          });
        }
        if (!sub && req.method === "DELETE") {
          // the chat and everything it started (pipeline documents, subagents); a running pipeline stops
          for (const id of rt.db.sessionTree(sid).reverse()) {
            rt.interrupt(id, true);
            if (rt.pipelines.get(id)?.status === "active" || rt.pipelines.get(id)?.status === "paused") rt.pipelines.setStatus(id, "stopped");
            for (const k of [`todo:${id}`, `goal:${id}`, `pipeline:${id}`, `stats_ctx:${id}`]) rt.db.deleteMeta(k);
            rt.db.deleteSession(id);
          }
          return json(res, 200, { ok: true });
        }
        if (sub === "/mode" && req.method === "POST") {
          const b = await body(req);
          if (b.mode !== "agent" && b.mode !== "rag") return json(res, 400, { error: "mode must be agent or rag" });
          rt.setMode(sid, b.mode);
          return json(res, 200, { ok: true, mode: b.mode });
        }
        if (sub === "/archive" && req.method === "POST") {
          const b = await body(req);
          const on = b.archived !== false;
          rt.db.updateSession(sid, { meta: { ...(s.meta ?? {}), archived: on } });
          return json(res, 200, { ok: true, archived: on });
        }
        if (sub === "/messages" && req.method === "POST") {
          const b = await body(req);
          const text = String(b.text ?? "").trim();
          if (!text) return json(res, 400, { error: "empty message" });
          if (looksLikeCommand(text, rt)) {
            const r = await runCommand(text, { rt, sid, source: "web" });
            if (r?.send) void rt.send(r.switchTo ?? sid, r.send, { source: "web" });
            return json(res, 200, { command: true, ...r });
          }
          const { text: refs, images } = await expandReferences(rt, text, rt.sessionCwd(sid));
          const expanded = barePathHint(refs, rt.sessionCwd(sid));
          const allImages = [...images, ...(Array.isArray(b.images) ? b.images.filter((x: any) => typeof x === "string" && x.startsWith("data:image/")) : [])];
          const queued = rt.isBusy(sid);
          void rt.send(sid, expanded, { source: "web", images: allImages });
          return json(res, 202, { queued });
        }
        if (sub === "/cwd" && req.method === "POST") {
          const b = await body(req);
          const dir = resolve(String(b.path ?? "").trim().replace(/^~(?=\/|$)/, homedir()));
          if (!isDir(dir)) return json(res, 400, { error: `not a folder: ${dir}` });
          rt.setSessionCwd(sid, dir, { remember: true });
          if (b.default) rt.cfg.set("agent.default_cwd", dir);
          return json(res, 200, { cwd: rt.sessionCwd(sid), default: rt.defaultCwd() });
        }
        if (sub === "/interrupt" && req.method === "POST") { const b = await body(req); return json(res, 200, { interrupted: rt.interrupt(sid, !!b.clear) }); }
        if (sub === "/steer" && req.method === "POST") { const b = await body(req); return json(res, 200, { result: rt.steer(sid, String(b.text ?? "")) }); }
      }
      const am = /^\/api\/approvals\/([^/]+)$/.exec(p);
      if (am && req.method === "POST") { const b = await body(req); return json(res, 200, { ok: rt.approvals.respond(am[1], b.decision ?? "deny") }); }
      const cm = /^\/api\/clarify\/([^/]+)$/.exec(p);
      if (cm && req.method === "POST") { const b = await body(req); return json(res, 200, { ok: rt.respondClarify(cm[1], b.answer ?? null) }); }
      if (p === "/api/cron") return json(res, 200, rt.cron.list());
      // ── RAG bot: shared documents converted to markdown ──
      if (p === "/api/rag/docs" && req.method === "GET") return json(res, 200, { docs: rt.rag.list() });
      if (p === "/api/rag/docs" && req.method === "POST") {
        const b = await body(req, 80 * 1024 * 1024);
        const name = String(b.name ?? "").trim();
        if (!name || typeof b.data !== "string") return json(res, 400, { error: "name and base64 data are required" });
        try { return json(res, 200, { doc: await rt.rag.add(name, Buffer.from(b.data, "base64")) }); }
        catch (e) { return json(res, 422, { error: errMsg(e), name }); }
      }
      const rdm = /^\/api\/rag\/docs\/([^/]+)(\/markdown)?$/.exec(p);
      if (rdm && req.method === "DELETE" && !rdm[2]) return json(res, 200, { ok: rt.rag.remove(decodeURIComponent(rdm[1])) });
      if (rdm && rdm[2] && req.method === "GET") {
        const md = rt.rag.markdown(decodeURIComponent(rdm[1])), doc = rt.rag.get(decodeURIComponent(rdm[1]));
        if (md === null || !doc) return json(res, 404, { error: "no such document" });
        res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "content-disposition": `inline; filename="${doc.name.replace(/[^\w.-]+/g, "_")}.md"`, "x-content-type-options": "nosniff" });
        res.end(md);
        return;
      }
      if (p === "/api/rag/search" && req.method === "GET") return json(res, 200, { hits: rt.rag.search(url.searchParams.get("q") ?? "", 8) });
      if (p === "/api/kanban") return json(res, 200, rt.kanban.list());
      if (p === "/api/kanban/board" && req.method === "GET") return json(res, 200, boardSummary(rt));
      if (p === "/api/kanban/dispatch" && req.method === "POST") return json(res, 200, { dispatched: await rt.kanban.tick() });
      if (p === "/api/kanban/resume" && req.method === "POST") { const r = rt.kanban.recover(); return json(res, 200, { requeued: r.length, dispatched: await rt.kanban.tick() }); }
      const kev = /^\/api\/kanban\/evidence\/([^/]+)\/(.+)$/.exec(p);
      if (kev && req.method === "GET") {
        const f = evidenceFile(rt, decodeURIComponent(kev[1]), decodeURIComponent(kev[2]));
        if (!f) return json(res, 404, { error: "not found" });
        res.writeHead(200, { "content-type": f.type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
        res.end(f.data);
        return;
      }
      const kcm = /^\/api\/kanban\/card\/([^/]+)\/comment$/.exec(p);
      if (kcm && req.method === "POST") {
        const b = await body(req);
        try { rt.kanban.comment(decodeURIComponent(kcm[1]), String(b.text ?? "").slice(0, 5000), "user", b.reply_to || undefined); return json(res, 200, { ok: true }); }
        catch (e) { return json(res, 400, { error: errMsg(e) }); }
      }
      const kc = /^\/api\/kanban\/card\/([^/]+)$/.exec(p);
      if (kc && req.method === "GET") { const d = cardDetail(rt, decodeURIComponent(kc[1])); return d ? json(res, 200, d) : json(res, 404, { error: "no such card" }); }
      if (p === "/api/skills" && req.method === "GET") return json(res, 200, { skills: rt.skills.list().map((s) => ({ name: s.name, description: s.description, category: s.category, source: s.source })), dirs: rt.cfg.data.skills.external_dirs ?? [] });
      if (p === "/api/skills/dirs" && req.method === "POST") {
        const b = await body(req);
        const dir = String(b.path ?? "").trim().replace(/^~(?=\/|$)/, homedir());
        const dirs: string[] = [...(rt.cfg.data.skills.external_dirs ?? [])].filter((d) => d !== dir);
        if (!b.remove) {
          if (!dir || !existsSync(dir)) return json(res, 400, { error: `folder not found: ${dir || "(empty)"}` });
          dirs.push(dir);
        }
        rt.cfg.set("skills.external_dirs", dirs); rt.skills.invalidate();
        return json(res, 200, { dirs, count: rt.skills.list().length });
      }
      const skm = /^\/api\/skills\/([^/]+)$/.exec(p);
      if (skm && req.method === "GET") {
        const sk = rt.skills.get(decodeURIComponent(skm[1]));
        if (!sk) return json(res, 404, { error: "no such skill" });
        return json(res, 200, { name: sk.name, description: sk.description, category: sk.category, source: sk.source, content: rt.skills.view(sk.name) });
      }
      // ── MCP servers: status, add (saved to config.yaml), reconnect, remove ──
      if (p === "/api/mcp" && req.method === "GET") {
        const servers: Record<string, any> = rt.cfg.data.mcp_servers ?? {};
        const names = [...new Set([...Object.keys(servers), ...rt.mcp.conns.keys()])];
        return json(res, 200, names.map((name) => {
          const c = servers[name] ?? {}, conn = rt.mcp.conns.get(name);
          return {
            name, enabled: c.enabled !== false, status: conn?.status ?? (c.enabled === false ? "disabled" : "not started"), error: conn?.error,
            transport: c.url ? "http" : "stdio", target: c.url ?? [c.command, ...(c.args ?? [])].filter(Boolean).join(" "),
            env: Object.keys(c.env ?? {}), headers: Object.keys(c.headers ?? {}), tools: (conn?.tools ?? []).map((t) => t.name),
          };
        }));
      }
      if (p === "/api/mcp/presets" && req.method === "GET") return json(res, 200, Object.entries(MCP_PRESETS).map(([name, x]) => ({ name, description: x.description, usage: x.usage })));
      if (p === "/api/mcp" && req.method === "POST") {
        const b = await body(req);
        const name = String(b.name ?? b.preset ?? "").trim();
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) return json(res, 400, { error: "name: letters, digits, - and _ only" });
        if (b.preset) {
          let entry: McpServerConfig;
          try { entry = presetConfig(String(b.preset), Array.isArray(b.args) ? b.args.map(String) : [], rt.defaultCwd()); } catch (e: any) { return json(res, 400, { error: e.message }); }
          rt.cfg.set(`mcp_servers.${name}`, entry);
          const conn = await rt.mcp.start(name, entry);
          return json(res, 200, { name, status: conn.status, error: conn.error, tools: conn.tools.map((t) => t.name) });
        }
        const kv = (x: any) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, String(v)])) : undefined);
        const cfgIn: McpServerConfig = b.url
          ? { url: String(b.url), ...(kv(b.headers) ? { headers: kv(b.headers) } : {}) }
          : { command: String(b.command ?? ""), args: Array.isArray(b.args) ? b.args.map(String) : [], ...(kv(b.env) ? { env: kv(b.env) } : {}) };
        if (!cfgIn.url && !cfgIn.command) return json(res, 400, { error: "give a command (stdio) or a url (HTTP)" });
        rt.cfg.set(`mcp_servers.${name}`, cfgIn);
        const conn = await rt.mcp.start(name, cfgIn);
        return json(res, 200, { name, status: conn.status, error: conn.error, tools: conn.tools.map((t) => t.name) });
      }
      const mm = /^\/api\/mcp\/([^/]+)(\/reconnect)?$/.exec(p);
      if (mm) {
        const name = decodeURIComponent(mm[1]);
        const servers: Record<string, any> = { ...(rt.cfg.data.mcp_servers ?? {}) };
        if (mm[2] && req.method === "POST") {
          if (!servers[name]) return json(res, 404, { error: "no such server" });
          const conn = await rt.mcp.start(name, servers[name]);
          return json(res, 200, { name, status: conn.status, error: conn.error, tools: conn.tools.map((t) => t.name) });
        }
        if (!mm[2] && req.method === "DELETE") {
          rt.mcp.stop(name);
          delete servers[name];
          rt.cfg.set("mcp_servers", servers);
          return json(res, 200, { ok: true });
        }
      }
      if (p === "/api/memory") return json(res, 200, { memory: rt.memory.entries("memory"), user: rt.memory.entries("user") });
      if (p === "/api/bench") { const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days")) || 7)); return json(res, 200, { days, summary: summarize(rt.bench.rows(days)), text: benchText(rt.bench.rows(days), days) }); }
      if (p === "/api/insights") return json(res, 200, { text: insights(rt, Number(url.searchParams.get("days")) || 7) });
      return json(res, 404, { error: "not found" });
    } catch (e) {
      log.error(`http ${req.method} ${p}: ${errMsg(e)}`);
      if (!res.headersSent) json(res, 500, { error: errMsg(e) });
      else res.end();
    }
  });

  await new Promise<void>((resolveP, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolveP());
  });
  const addr = server.address() as any;
  const shownHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  const url = `http://${shownHost.includes(":") ? `[${shownHost}]` : shownHost}:${addr.port}`;
  log.info(`server listening on ${url}`);
  return {
    url, token, webhooks,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

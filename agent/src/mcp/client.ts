/**
 * Model Context Protocol client — stdio and Streamable HTTP transports.
 * Each configured server's tools are registered as `mcp__<server>__<tool>`.
 *
 * config.yaml:
 *   mcp_servers:
 *     github:   { command: npx, args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } }
 *     internal: { url: https://mcp.example.com/mcp, headers: { Authorization: "Bearer ${MCP_TOKEN}" }, include: [search, fetch] }
 */
import { spawn, type ChildProcess } from "node:child_process";
import type { Runtime } from "../runtime/runtime.js";
import type { Tool } from "../tools/types.js";
import { log } from "../util/log.js";
import { sseEvents } from "../providers/types.js";

const PROTOCOL = "2025-06-18";

export interface McpServerConfig { command?: string; args?: string[]; env?: Record<string, string>; cwd?: string; url?: string; headers?: Record<string, string>; include?: string[]; exclude?: string[]; enabled?: boolean; timeout?: number }
export interface McpToolDef { name: string; description?: string; inputSchema?: any }

function expandVars(s: string, secret: (k: string) => string | undefined): string {
  return s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, k) => secret(k) ?? "");
}

export class McpConnection {
  tools: McpToolDef[] = [];
  status: "starting" | "ready" | "error" | "closed" = "starting";
  error?: string;
  private child?: ChildProcess;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout }>();
  private buf = "";
  private sessionHeader?: string;

  constructor(readonly name: string, private cfg: McpServerConfig, private secret: (k: string) => string | undefined) {}

  private timeoutMs() { return (this.cfg.timeout ?? 120) * 1000; }

  async start(): Promise<void> {
    try {
      if (this.cfg.command) this.spawnStdio();
      else if (!this.cfg.url) throw new Error("mcp server needs `command` or `url`");
      await this.request("initialize", { protocolVersion: PROTOCOL, capabilities: { roots: { listChanged: false } }, clientInfo: { name: "stitap-harness", version: "0.1.0" } });
      await this.notify("notifications/initialized", {});
      const tools: McpToolDef[] = [];
      let cursor: string | undefined;
      do {
        const r = await this.request("tools/list", cursor ? { cursor } : {});
        tools.push(...(r.tools ?? []));
        cursor = r.nextCursor;
      } while (cursor);
      const inc = this.cfg.include, exc = this.cfg.exclude ?? [];
      this.tools = tools.filter((t) => (!inc?.length || inc.includes(t.name)) && !exc.includes(t.name));
      this.status = "ready";
    } catch (e: any) {
      this.status = "error";
      this.error = e.message;
      log.warn(`MCP server ${this.name} failed: ${e.message}`);
      this.close();
    }
  }

  private spawnStdio() {
    const env: Record<string, string> = { ...(process.env as any) };
    for (const [k, v] of Object.entries(this.cfg.env ?? {})) env[k] = expandVars(String(v), this.secret);
    const args = (this.cfg.args ?? []).map((a) => expandVars(String(a), this.secret));
    this.child = spawn(this.cfg.command!, args, { cwd: this.cfg.cwd, env, stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32", windowsHide: true });
    this.child.stdout!.on("data", (b: Buffer) => {
      this.buf += b.toString("utf8");
      let i: number;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (line) this.onMessage(line);
      }
    });
    this.child.stderr!.on("data", (b: Buffer) => log.debug(`[mcp ${this.name}] ${b.toString().trim().slice(0, 300)}`));
    this.child.on("exit", (code) => {
      this.status = "closed";
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(`MCP server ${this.name} exited (${code})`)); }
      this.pending.clear();
    });
    this.child.on("error", (e) => { this.status = "error"; this.error = e.message; });
  }

  private onMessage(line: string) {
    let msg: any;
    try { msg = JSON.parse(line); } catch { return; }
    this.handle(msg);
  }

  private handle(msg: any) {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error))); else p.resolve(msg.result);
      return;
    }
    if (msg.method && msg.id !== undefined) {
      // server → client requests
      const reply = (result: any, error?: any) => this.send({ jsonrpc: "2.0", id: msg.id, ...(error ? { error } : { result }) });
      if (msg.method === "ping") reply({});
      else if (msg.method === "roots/list") reply({ roots: [] });
      else reply(undefined, { code: -32601, message: `method ${msg.method} not supported by client` });
    }
  }

  private send(obj: any) {
    if (this.child) this.child.stdin!.write(JSON.stringify(obj) + "\n");
  }

  private async httpPost(obj: any): Promise<any> {
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL };
    for (const [k, v] of Object.entries(this.cfg.headers ?? {})) headers[k] = expandVars(String(v), this.secret);
    if (this.sessionHeader) headers["mcp-session-id"] = this.sessionHeader;
    const res = await fetch(this.cfg.url!, { method: "POST", headers, body: JSON.stringify(obj), signal: AbortSignal.timeout(this.timeoutMs()) });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionHeader = sid;
    if (res.status === 202 || obj.id === undefined) return null;
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/event-stream")) {
      for await (const ev of sseEvents(res)) {
        let m: any;
        try { m = JSON.parse(ev.data); } catch { continue; }
        if (m.id === obj.id) return m;
        this.handle(m);
      }
      throw new Error("MCP stream ended without a response");
    }
    return res.json();
  }

  async request(method: string, params: any): Promise<any> {
    const id = this.nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    if (this.cfg.url && !this.cfg.command) {
      const r = await this.httpPost(msg);
      if (r?.error) throw new Error(r.error.message ?? JSON.stringify(r.error));
      return r?.result;
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`MCP ${this.name} ${method} timed out`)); }, this.timeoutMs());
      this.pending.set(id, { resolve, reject, timer });
      this.send(msg);
    });
  }

  async notify(method: string, params: any) {
    const msg = { jsonrpc: "2.0", method, params };
    if (this.cfg.url && !this.cfg.command) await this.httpPost(msg).catch(() => undefined);
    else this.send(msg);
  }

  async call(tool: string, args: any): Promise<string> {
    const r = await this.request("tools/call", { name: tool, arguments: args ?? {} });
    const parts = (r?.content ?? []).map((c: any) => c.type === "text" ? c.text : c.type === "image" ? `[image ${c.mimeType}, ${Math.round((c.data?.length ?? 0) * 0.75 / 1024)} KB]` : c.type === "resource" ? (c.resource?.text ?? `[resource ${c.resource?.uri}]`) : JSON.stringify(c));
    if (r?.structuredContent && !parts.length) parts.push(JSON.stringify(r.structuredContent, null, 2));
    const text = parts.join("\n") || "(empty result)";
    return r?.isError ? `error from ${this.name}.${tool}: ${text}` : text;
  }

  close() {
    try { this.child?.kill(); } catch { /* ignore */ }
    this.status = this.status === "error" ? "error" : "closed";
  }
}

export class McpManager {
  conns = new Map<string, McpConnection>();
  constructor(private rt: Runtime) {}

  async startAll(): Promise<void> {
    const servers = this.rt.cfg.data.mcp_servers ?? {};
    await Promise.all(Object.entries(servers).filter(([, c]: any) => c?.enabled !== false).map(([name, c]) => this.start(name, c as McpServerConfig)));
  }

  async start(name: string, cfg: McpServerConfig): Promise<McpConnection> {
    this.conns.get(name)?.close();
    this.rt.tools.unregisterWhere((t) => t.toolset === `mcp:${name}`);
    const conn = new McpConnection(name, cfg, (k) => this.rt.cfg.secret(k));
    this.conns.set(name, conn);
    await conn.start();
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, "_");
    const many = conn.tools.length > 20;
    for (const t of conn.tools) {
      const tool: Tool = {
        name: `mcp__${safe(name)}__${safe(t.name)}`.slice(0, 64), toolset: `mcp:${name}`, tier: "standard", deferred: many,
        description: `[MCP ${name}] ${t.description ?? t.name}`.slice(0, 1024),
        parameters: t.inputSchema && t.inputSchema.type === "object" ? t.inputSchema : { type: "object", properties: {} },
        handler: (args) => conn.call(t.name, args),
      };
      this.rt.tools.register(tool);
    }
    return conn;
  }

  async reload(): Promise<string> {
    this.closeAll();
    this.rt.cfg.reload();
    await this.startAll();
    return this.summary();
  }

  summary(): string {
    if (!this.conns.size) return "No MCP servers configured (add them under mcp_servers in config.yaml).";
    return [...this.conns.values()].map((c) => `${c.name}: ${c.status}${c.error ? ` (${c.error})` : ""} — ${c.tools.length} tools`).join("\n");
  }

  stop(name: string): void {
    this.conns.get(name)?.close();
    this.conns.delete(name);
    this.rt.tools.unregisterWhere((t) => t.toolset === `mcp:${name}`);
  }

  closeAll() { for (const c of this.conns.values()) c.close(); this.conns.clear(); }
}

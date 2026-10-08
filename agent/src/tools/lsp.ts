/**
 * lsp: language-server answers for the agent. Text search finds names; a language server knows which `render` is
 * meant, where it is defined, who calls it, and what the compiler thinks is wrong with a file. Servers are started
 * on first use per project root, spoken to over stdio JSON-RPC, and stopped after 5 idle minutes.
 *
 * Built-in servers (install the ones you need): typescript-language-server, pyright-langserver, gopls, rust-analyzer,
 * clangd, sourcekit-lsp. Override or add under `lsp.servers` in config.yaml:
 *   lsp: { servers: { ruby: { command: solargraph, args: [stdio], exts: [.rb] } } }
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { log } from "../util/log.js";
import { type Tool, obj, str, int, enm } from "./types.js";

export interface LspServerDef { command: string; args?: string[]; exts: string[]; roots?: string[]; languageId?: string; install?: string }

export const DEFAULT_SERVERS: Record<string, LspServerDef> = {
  typescript: { command: "typescript-language-server", args: ["--stdio"], exts: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"], roots: ["tsconfig.json", "jsconfig.json", "package.json"], install: "npm i -g typescript typescript-language-server" },
  python: { command: "pyright-langserver", args: ["--stdio"], exts: [".py"], roots: ["pyproject.toml", "setup.py", "pyrightconfig.json", "requirements.txt"], install: "npm i -g pyright" },
  go: { command: "gopls", exts: [".go"], roots: ["go.mod"], install: "go install golang.org/x/tools/gopls@latest" },
  rust: { command: "rust-analyzer", exts: [".rs"], roots: ["Cargo.toml"], install: "rustup component add rust-analyzer" },
  c: { command: "clangd", exts: [".c", ".h", ".cc", ".cpp", ".hpp", ".m", ".mm"], roots: ["compile_commands.json", "compile_flags.txt", ".clangd"], install: "xcode-select --install (clangd) or brew install llvm" },
  swift: { command: "sourcekit-lsp", exts: [".swift"], roots: ["Package.swift"], install: "xcode-select --install" },
};
const LANG_ID: Record<string, string> = { ".ts": "typescript", ".tsx": "typescriptreact", ".js": "javascript", ".jsx": "javascriptreact", ".mjs": "javascript", ".cjs": "javascript", ".py": "python", ".go": "go", ".rs": "rust", ".c": "c", ".h": "c", ".cc": "cpp", ".cpp": "cpp", ".hpp": "cpp", ".m": "objective-c", ".mm": "objective-cpp", ".swift": "swift" };
const IDLE_MS = 5 * 60_000;

export interface Diagnostic { range: { start: { line: number; character: number } }; severity?: number; message: string; source?: string; code?: string | number }

export class LspClient {
  private child: ChildProcess;
  private buf = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private versions = new Map<string, number>();
  readonly diags = new Map<string, { list: Diagnostic[]; at: number }>();
  private idle?: NodeJS.Timeout;
  ready: Promise<void>;
  closed = false;

  constructor(readonly name: string, def: LspServerDef, readonly root: string, private onClose: () => void) {
    this.child = spawn(def.command, def.args ?? [], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout!.on("data", (b: Buffer) => this.onData(b));
    this.child.stderr!.on("data", (b: Buffer) => log.debug(`[lsp ${name}] ${b.toString().slice(0, 200).trim()}`));
    this.child.on("exit", () => this.shutdownState());
    this.ready = new Promise((res, rej) => {
      this.child.once("error", (e: any) => { this.shutdownState(); rej(new Error(e.code === "ENOENT" ? `${def.command} is not installed${def.install ? ` — ${def.install}` : ""}` : e.message)); });
      this.request("initialize", {
        processId: process.pid, rootUri: pathToFileURL(root).href, workspaceFolders: [{ uri: pathToFileURL(root).href, name: "root" }],
        capabilities: {
          textDocument: { synchronization: { didSave: false }, publishDiagnostics: { relatedInformation: false }, definition: {}, references: {}, hover: { contentFormat: ["plaintext", "markdown"] }, documentSymbol: { hierarchicalDocumentSymbolSupport: true } },
          workspace: { workspaceFolders: true },
        },
      }, 60_000).then(() => { this.notify("initialized", {}); res(); }, rej);
    });
    this.ready.catch(() => undefined);
    this.touch();
  }

  private touch() { clearTimeout(this.idle); this.idle = setTimeout(() => this.close(), IDLE_MS); this.idle.unref?.(); }

  private shutdownState() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.idle);
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("language server exited")); }
    this.pending.clear();
    this.onClose();
  }

  private send(msg: any) {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...msg }), "utf8");
    this.child.stdin!.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  }

  private onData(b: Buffer) {
    this.buf = Buffer.concat([this.buf, b]);
    for (;;) {
      const sep = this.buf.indexOf("\r\n\r\n");
      if (sep < 0) return;
      const m = /Content-Length:\s*(\d+)/i.exec(this.buf.subarray(0, sep).toString("ascii"));
      if (!m) { this.buf = this.buf.subarray(sep + 4); continue; }
      const len = Number(m[1]), start = sep + 4;
      if (this.buf.length < start + len) return;
      const raw = this.buf.subarray(start, start + len).toString("utf8");
      this.buf = this.buf.subarray(start + len);
      try { this.onMessage(JSON.parse(raw)); } catch { /* malformed frame */ }
    }
  }

  private onMessage(m: any) {
    if (m.id !== undefined && (m.result !== undefined || m.error) && this.pending.has(m.id)) {
      const p = this.pending.get(m.id)!; this.pending.delete(m.id); clearTimeout(p.timer);
      m.error ? p.reject(new Error(m.error.message ?? "LSP error")) : p.resolve(m.result);
    } else if (m.method === "textDocument/publishDiagnostics") {
      this.diags.set(m.params.uri, { list: m.params.diagnostics ?? [], at: Date.now() });
    } else if (m.id !== undefined && m.method) {
      // server → client requests: answer so the server does not wait (configuration, progress, registration)
      this.send({ id: m.id, result: m.method === "workspace/configuration" ? (m.params?.items ?? []).map(() => null) : null });
    }
  }

  request(method: string, params: any, timeoutMs = 30_000): Promise<any> {
    if (this.closed) return Promise.reject(new Error("language server is not running"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out after ${timeoutMs / 1000}s`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  notify(method: string, params: any) { if (!this.closed) this.send({ method, params }); }

  /** Make the server see the file's current content. */
  sync(file: string, languageId: string): string {
    this.touch();
    const uri = pathToFileURL(file).href;
    const text = readFileSync(file, "utf8");
    const v = (this.versions.get(uri) ?? 0) + 1;
    this.versions.set(uri, v);
    this.diags.delete(uri);
    if (v === 1) this.notify("textDocument/didOpen", { textDocument: { uri, languageId, version: v, text } });
    else this.notify("textDocument/didChange", { textDocument: { uri, version: v }, contentChanges: [{ text }] });
    return uri;
  }

  /** Wait until diagnostics for `uri` arrive and stop changing (servers publish in several rounds). */
  async diagnostics(uri: string, maxMs = 8000): Promise<Diagnostic[]> {
    const t0 = Date.now();
    let seenAt = 0;
    while (Date.now() - t0 < maxMs) {
      const d = this.diags.get(uri);
      if (d) { if (d.at !== seenAt) seenAt = d.at; else if (Date.now() - d.at > 700) return d.list; }
      else if (Date.now() - t0 > 2500 && this.versions.get(uri)) { /* some servers publish nothing for clean files */ if (Date.now() - t0 > 3500) return []; }
      await new Promise((r) => setTimeout(r, 100));
    }
    return this.diags.get(uri)?.list ?? [];
  }

  close() {
    if (this.closed) return;
    try { this.send({ id: this.nextId++, method: "shutdown" }); this.notify("exit", {}); } catch { /* gone */ }
    setTimeout(() => { try { this.child.kill("SIGKILL"); } catch { /* gone */ } }, 1500).unref?.();
    this.shutdownState();
  }
  kill() { try { this.child.kill("SIGKILL"); } catch { /* gone */ } this.shutdownState(); }
}

const clients = new Map<string, LspClient>();
process.once("exit", () => { for (const c of clients.values()) c.kill(); });

export function serverFor(file: string, servers: Record<string, LspServerDef>): { key: string; def: LspServerDef } | null {
  const ext = extname(file).toLowerCase();
  for (const [key, def] of Object.entries(servers)) if (def.exts.includes(ext)) return { key, def };
  return null;
}

export function projectRoot(file: string, def: LspServerDef, fallback: string): string {
  let d = dirname(file), best: string | null = null;
  for (let i = 0; i < 20; i++) {
    if ((def.roots ?? []).some((r) => existsSync(join(d, r)))) best = d;   // keep climbing: the outermost marker is the workspace (monorepos)
    if (existsSync(join(d, ".git"))) break;
    const up = dirname(d); if (up === d) break; d = up;
  }
  return best ?? fallback;
}

export async function clientFor(key: string, def: LspServerDef, root: string): Promise<LspClient> {
  const id = `${key}@${root}`;
  let c = clients.get(id);
  if (!c || c.closed) {
    c = new LspClient(key, def, root, () => clients.delete(id));
    clients.set(id, c);
  }
  await c.ready;
  return c;
}

export function stopAllLsp() { for (const c of clients.values()) c.kill(); clients.clear(); }

const SEVERITY = ["", "error", "warning", "info", "hint"];

/** Column (0-based) for a 1-based line: the first occurrence of `symbol`, else the first identifier. */
export function columnOf(lineText: string, symbol?: string): number | null {
  if (symbol) { const i = lineText.indexOf(symbol); return i >= 0 ? i : null; }
  const m = /[A-Za-z_$][\w$]*/.exec(lineText);
  return m ? m.index : null;
}

type Loc = { uri: string; range: { start: { line: number; character: number } } } | { targetUri: string; targetSelectionRange: { start: { line: number; character: number } } };
function fmtLocs(locs: any, root: string, limit = 30): string {
  const arr: Loc[] = (Array.isArray(locs) ? locs : locs ? [locs] : []);
  if (!arr.length) return "(none)";
  const rows = arr.slice(0, limit).map((l: any) => {
    const uri = l.uri ?? l.targetUri, st = (l.range ?? l.targetSelectionRange).start;
    let file = uri; try { file = fileURLToPath(uri); } catch { /* non-file uri */ }
    let text = ""; try { text = readFileSync(file, "utf8").split("\n")[st.line]?.trim().slice(0, 140) ?? ""; } catch { /* unreadable */ }
    const rel = file.startsWith(root) ? relative(root, file) : file;
    return `${rel}:${st.line + 1}:${st.character + 1}  ${text}`;
  });
  return rows.join("\n") + (arr.length > limit ? `\n… ${arr.length - limit} more` : "");
}

function flattenSymbols(syms: any[], depth = 0, out: string[] = []): string[] {
  const KIND = ["", "file", "module", "namespace", "package", "class", "method", "property", "field", "constructor", "enum", "interface", "function", "variable", "constant", "string", "number", "boolean", "array", "object", "key", "null", "enumMember", "struct", "event", "operator", "typeParam"];
  for (const s of syms ?? []) {
    const line = (s.selectionRange ?? s.range ?? s.location?.range)?.start?.line ?? 0;
    out.push(`${String(line + 1).padStart(5)}  ${"  ".repeat(depth)}${(KIND[s.kind] ?? "").padEnd(9)} ${s.name}`);
    if (s.children) flattenSymbols(s.children, depth + 1, out);
  }
  return out;
}

export const lspTool: Tool = {
  name: "lsp", toolset: "files",
  description: "Ask the project's language server (TypeScript/JS, Python, Go, Rust, C/C++, Swift). Actions: diagnostics (compiler errors and warnings for path — run after editing) · " +
    "definition / references / hover (path, line, and symbol = the identifier on that line) · symbols (path: outline). Lines are 1-based. Needs the language server installed; the error says how.",
  parameters: obj({
    action: enm(["diagnostics", "definition", "references", "hover", "symbols"], "What to ask"),
    path: str("Source file"),
    line: int("1-based line (definition/references/hover)"),
    symbol: str("The identifier on that line to ask about (default: the first identifier)"),
  }, ["action", "path"]),
  available: (rt) => rt.cfg.data.lsp?.enabled !== false,
  async handler(a, ctx) {
    const servers: Record<string, LspServerDef> = { ...DEFAULT_SERVERS, ...(ctx.rt.cfg.data.lsp?.servers ?? {}) };
    const file = isAbsolute(String(a.path)) ? String(a.path) : resolve(ctx.cwd, String(a.path));
    if (!existsSync(file)) return `error: ${file} does not exist`;
    const sv = serverFor(file, servers);
    if (!sv) return `error: no language server is configured for ${extname(file) || "this file type"} (configured: ${Object.entries(servers).map(([k, d]) => `${k} ${d.exts.join("/")}`).join("; ")})`;
    const root = projectRoot(file, sv.def, ctx.cwd);
    let c: LspClient;
    try { c = await clientFor(sv.key, sv.def, root); } catch (e: any) { return `error: ${e.message}`; }
    const uri = c.sync(file, sv.def.languageId ?? LANG_ID[extname(file).toLowerCase()] ?? sv.key);
    const rel = relative(root, file);
    try {
      if (a.action === "diagnostics") {
        const d = await c.diagnostics(uri);
        if (!d.length) return `${rel}: no problems reported`;
        const sorted = [...d].sort((x, y) => (x.severity ?? 1) - (y.severity ?? 1) || x.range.start.line - y.range.start.line);
        return `${rel}: ${d.length} problem(s)\n` + sorted.slice(0, 40).map((x) => `${rel}:${x.range.start.line + 1}:${x.range.start.character + 1} ${SEVERITY[x.severity ?? 1]}${x.code !== undefined ? ` ${x.code}` : ""}: ${x.message.split("\n")[0].slice(0, 220)}`).join("\n") + (d.length > 40 ? `\n… ${d.length - 40} more` : "");
      }
      if (a.action === "symbols") {
        const r = await c.request("textDocument/documentSymbol", { textDocument: { uri } });
        const rows = flattenSymbols(r ?? []);
        return rows.length ? rows.slice(0, 200).join("\n") : "(no symbols)";
      }
      const line = Number(a.line);
      if (!(line >= 1)) return "error: give a 1-based line";
      const lineText = readFileSync(file, "utf8").split("\n")[line - 1];
      if (lineText === undefined) return `error: ${rel} has fewer than ${line} lines`;
      const col = columnOf(lineText, a.symbol ? String(a.symbol) : undefined);
      if (col === null) return `error: "${a.symbol}" is not on line ${line}: ${lineText.trim().slice(0, 120)}`;
      const pos = { line: line - 1, character: col };
      await c.diagnostics(uri, 1500).catch(() => undefined);   // let the server finish analysing the file first
      if (a.action === "definition") return fmtLocs(await c.request("textDocument/definition", { textDocument: { uri }, position: pos }), root);
      if (a.action === "references") return fmtLocs(await c.request("textDocument/references", { textDocument: { uri }, position: pos, context: { includeDeclaration: true } }), root);
      if (a.action === "hover") {
        const h = await c.request("textDocument/hover", { textDocument: { uri }, position: pos });
        const v = h?.contents;
        const text = typeof v === "string" ? v : Array.isArray(v) ? v.map((x: any) => x.value ?? x).join("\n") : v?.value ?? "";
        return text.trim().slice(0, 2000) || "(no hover information)";
      }
      return "error: unknown action";
    } catch (e: any) { return `error: ${e.message}`; }
  },
};

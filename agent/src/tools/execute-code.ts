/**
 * execute_code — programmatic tool calling. The agent writes a Python or
 * JavaScript script that can call harness tools through a local RPC endpoint,
 * collapsing many tool round-trips into one turn.
 */
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { killTree, NONINTERACTIVE_ENV, childEnv } from "./backends.js";
import { truncateMiddle } from "../util/misc.js";
import { type Tool, type ToolContext, obj, str, enm, int } from "./types.js";

const NOT_VIA_RPC = new Set(["execute_code", "delegate_task", "clarify", "use_tool"]);

let pyCmd: string | null | undefined;
export function findPython(): string | null {
  if (pyCmd !== undefined) return pyCmd;
  for (const c of platform() === "win32" ? ["python", "py", "python3"] : ["python3", "python"]) {
    try { execFileSync(c, ["--version"], { stdio: "ignore" }); return (pyCmd = c); } catch { /* next */ }
  }
  return (pyCmd = null);
}

const PY_HELPER = (port: number, token: string) => `import json, urllib.request
_URL = "http://127.0.0.1:${port}/call"
_TOKEN = "${token}"
def call(tool, **kwargs):
    """Call a stitaP tool and return its text result."""
    req = urllib.request.Request(_URL, data=json.dumps({"tool": tool, "args": kwargs}).encode(), headers={"content-type": "application/json", "x-token": _TOKEN})
    with urllib.request.urlopen(req, timeout=600) as r:
        body = json.loads(r.read().decode())
    if body.get("error"):
        raise RuntimeError(body["error"])
    return body["result"]
class _Tools:
    def __getattr__(self, name):
        return lambda **kw: call(name, **kw)
tools = _Tools()
`;

const JS_HELPER = (port: number, token: string) => `export async function call(tool, args = {}) {
  const r = await fetch("http://127.0.0.1:${port}/call", { method: "POST", headers: { "content-type": "application/json", "x-token": "${token}" }, body: JSON.stringify({ tool, args }) });
  const body = await r.json();
  if (body.error) throw new Error(body.error);
  return body.result;
}
export const tools = new Proxy({}, { get: (_t, name) => (args) => call(String(name), args) });
`;

async function withRpc<T>(ctx: ToolContext, fn: (port: number, token: string) => Promise<T>): Promise<T> {
  const token = randomBytes(16).toString("hex");
  const active = ctx.rt.activeTools(ctx.session.id).filter((t) => !NOT_VIA_RPC.has(t.name));
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/call" || req.headers["x-token"] !== token) { res.writeHead(403).end(); return; }
    let body = "";
    for await (const c of req) body += c;
    let out: any;
    try {
      const { tool, args } = JSON.parse(body);
      const t = ctx.rt.tools.resolveName(String(tool), active);
      if (!t) throw new Error(`tool ${tool} not available to scripts`);
      const r = await t.handler(args ?? {}, ctx);
      out = { result: typeof r === "string" ? r : r.content };
    } catch (e: any) { out = { error: e.message ?? String(e) }; }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as any).port;
  try { return await fn(port, token); } finally { server.close(); }
}

export const executeCodeTool: Tool = {
  name: "execute_code", toolset: "code", tier: "standard",
  description:
    "Run a Python or JavaScript script locally. Scripts can call your tools programmatically: Python `from stitap_tools import tools, call` then `tools.web_search(query='x')`; " +
    "JavaScript `import { tools, call } from './stitap_tools.mjs'` then `await tools.read_file({path:'a.txt'})`. Use it to batch 3+ tool calls with logic in between, or for data processing. Print what you need to see.",
  parameters: obj({ language: enm(["python", "javascript"], "script language"), code: str("the script"), timeout: int("seconds (default 300)") }, ["code"]),
  async handler(a, ctx) {
    const lang = a.language === "javascript" || a.language === "js" || a.language === "node" ? "javascript" : "python";
    const exe = lang === "python" ? findPython() : process.execPath;
    if (!exe) return "error: Python is not installed on this machine. Use language=javascript (Node is always available).";
    const dir = mkdtempSync(join(tmpdir(), "stitap-code-"));
    const timeout = Math.min(Number(a.timeout) || 300, 1800) * 1000;
    try {
      return await withRpc(ctx, (port, token) => new Promise<string>((resolve) => {
        const file = join(dir, lang === "python" ? "main.py" : "main.mjs");
        writeFileSync(join(dir, lang === "python" ? "stitap_tools.py" : "stitap_tools.mjs"), lang === "python" ? PY_HELPER(port, token) : JS_HELPER(port, token));
        // scripts run as ES modules; give CommonJS-style code `require`, `__dirname`, `__filename` (small models write it often)
        const code = String(a.code);
        const shim = lang === "javascript" && /\b(require\s*\(|__dirname|__filename)/.test(code) && !/\b(const|let|var)\s+require\b/.test(code)
          ? `import { createRequire as __stitapCR } from "node:module"; import { fileURLToPath as __stitapF } from "node:url"; import { dirname as __stitapD } from "node:path";\nconst require = __stitapCR(import.meta.url); const __filename = __stitapF(import.meta.url); const __dirname = __stitapD(__filename);\n`
          : "";
        writeFileSync(file, shim + code);
        const child = spawn(exe, [file], { cwd: ctx.cwd, env: { ...childEnv(), ...NONINTERACTIVE_ENV, PYTHONPATH: [dir, process.env.PYTHONPATH].filter(Boolean).join(platform() === "win32" ? ";" : ":"), NODE_PATH: dir }, stdio: ["ignore", "pipe", "pipe"], detached: platform() !== "win32", windowsHide: true });
        let out = "";
        const onData = (b: Buffer) => { const s = b.toString(); out += s; ctx.progress(s); };
        child.stdout.on("data", onData); child.stderr.on("data", onData);
        const timer = setTimeout(() => { out += `\n[timed out after ${timeout / 1000}s]`; killTree(child); }, timeout);
        const onAbort = () => { out += "\n[interrupted]"; killTree(child); };
        ctx.signal.addEventListener("abort", onAbort, { once: true });
        child.on("error", (e) => { clearTimeout(timer); resolve(`error: ${e.message}`); });
        child.on("close", (code) => {
          clearTimeout(timer); ctx.signal.removeEventListener("abort", onAbort);
          resolve(`exit code: ${code}\n${truncateMiddle(out.trim() || "(no output)", 30000)}`);
        });
      }));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  },
};

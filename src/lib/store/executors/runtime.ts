/**
 * Executors for execution environments, sandboxes and the agent's own
 * capabilities (memory, skills, self-improvement, terminal, kanban).
 *
 * In the agent runtime code runs for real: env.* uses the language runtimes
 * installed on the machine; sandbox.* adds isolation (Docker/Podman when
 * present, otherwise OS sandboxing — unshare / sandbox-exec — plus Node's
 * permission model and a network guard) and reports the level it achieved.
 * agent.* delegates to the host agent when it installs capabilities via
 * setAgentHost(), else uses the engines in lib/agent with persisted state.
 */
import { getAgentMemory, type MemoryType } from "@/lib/agent/memory";
import { getSkillManager } from "@/lib/agent/skills";
import { getSelfImprover } from "@/lib/agent/self-improve";
import { getKanbanManager } from "@/lib/agent/kanban";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { getScenario, getScenariosByCategory, searchScenarios, buildPolicyFromScenario } from "@/lib/sandbox/scenarios";
import { agentHost } from "./hooks";
import { execs, json, num, str, bool, list, persisted, secret, nodeModule, isNode, dataDir, uid, r2, type ExecMap } from "./util";


// ─── process helpers ─────────────────────────────────────────────────────────

function node(): { cp: any; fs: any; path: any; os: any } {
  const cp = nodeModule("node:child_process");
  if (!cp || !isNode()) throw new Error("running code needs the agent runtime (Node.js); the browser app runs it in its in-page sandbox");
  return { cp, fs: nodeModule("node:fs"), path: nodeModule("node:path"), os: nodeModule("node:os") };
}
const WIN = () => process.platform === "win32";
function which(cmd: string): string | null {
  const { cp } = node();
  try { return String(cp.execFileSync(WIN() ? "where" : "which", [cmd], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).split(/\r?\n/)[0].trim() || null; } catch { return null; }
}
interface RunResult { exitCode: number; stdout: string; stderr: string; durationMs: number; timedOut: boolean }
function spawnRun(bin: string, args: string[], o: { cwd?: string; env?: Record<string, string>; input?: string; timeoutMs?: number; maxOut?: number } = {}): Promise<RunResult> {
  const { cp } = node();
  const t0 = Date.now(), cap = o.maxOut ?? 200000;
  return new Promise((resolve) => {
    let stdout = "", stderr = "", timedOut = false;
    const child = cp.spawn(bin, args, { cwd: o.cwd, env: o.env ?? process.env, windowsHide: true, detached: !WIN() });
    const kill = () => { timedOut = true; try { WIN() ? child.kill() : process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } };
    const t = setTimeout(kill, o.timeoutMs ?? 30000);
    child.stdout.on("data", (d: any) => { if (stdout.length < cap) stdout += d; });
    child.stderr.on("data", (d: any) => { if (stderr.length < cap) stderr += d; });
    child.on("error", (e: Error) => { clearTimeout(t); resolve({ exitCode: 127, stdout, stderr: stderr + e.message, durationMs: Date.now() - t0, timedOut }); });
    child.on("close", (code: number | null) => { clearTimeout(t); resolve({ exitCode: code ?? (timedOut ? 124 : 1), stdout, stderr: timedOut ? `${stderr}\n[killed after ${o.timeoutMs ?? 30000} ms]` : stderr, durationMs: Date.now() - t0, timedOut }); });
    child.stdin.on("error", () => undefined);
    child.stdin.end(o.input ?? "");
  });
}
/** Environment without the parent's secrets: PATH/locale/home only, plus explicit vars. */
function cleanEnv(home: string, extra: Record<string, string> = {}): Record<string, string> {
  const keep = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "COMSPEC", "PATHEXT", "TEMP", "TMP", "LANG", "LC_ALL", "TERM", "WINDIR"];
  const env: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!;
  return { ...env, HOME: home, USERPROFILE: home, TMPDIR: home, ...extra };
}

// ─── language runtimes ───────────────────────────────────────────────────────

type Lang = "javascript" | "typescript" | "python" | "rust" | "shell";
const LANG_ALIASES: Record<string, Lang> = { js: "javascript", node: "javascript", javascript: "javascript", ts: "typescript", typescript: "typescript", py: "python", python: "python", python3: "python", rust: "rust", rs: "rust", sh: "shell", bash: "shell", shell: "shell", powershell: "shell" };
const lang = (v: unknown): Lang => { const l = LANG_ALIASES[str(v).toLowerCase()]; if (!l) throw new Error(`unsupported language "${str(v)}" (javascript, typescript, python, rust, shell)`); return l; };

interface Runtime { bin: string; version: string; file: string; args: (file: string, memMB: number) => string[]; compile?: (file: string, out: string) => [string, string[]] }
function nodeMajorMinor(): [number, number] { const [a, b] = process.versions.node.split(".").map(Number); return [a, b]; }
function detectRuntime(l: Lang): Runtime {
  const ver = (bin: string, args = ["--version"]) => { try { return String(node().cp.execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim().split("\n")[0]; } catch (e: any) { return String(e.stderr ?? "").trim().split("\n")[0] || "unknown"; } };
  if (l === "javascript") return { bin: process.execPath, version: `node ${process.version}`, file: "main.mjs", args: (f, m) => [`--max-old-space-size=${m}`, f] };
  if (l === "typescript") {
    const [maj, min] = nodeMajorMinor();
    if (maj > 22 || (maj === 22 && min >= 6)) return { bin: process.execPath, version: `node ${process.version} (type stripping)`, file: "main.mts", args: (f, m) => [`--max-old-space-size=${m}`, ...(maj < 23 || (maj === 23 && min < 6) ? ["--experimental-strip-types", "--no-warnings"] : []), f] };
    const deno = which("deno"); if (deno) return { bin: deno, version: ver(deno), file: "main.ts", args: (f) => ["run", "--quiet", f] };
    const tsx = which("tsx"); if (tsx) return { bin: tsx, version: ver(tsx), file: "main.ts", args: (f) => [f] };
    throw new Error("TypeScript needs Node.js ≥ 22.6, deno or tsx");
  }
  if (l === "python") {
    const py = (WIN() ? ["python", "py", "python3"] : ["python3", "python"]).map(which).find(Boolean);
    if (!py) throw new Error("Python is not installed (python3 not on PATH)");
    return { bin: py, version: ver(py), file: "main.py", args: (f) => ["-u", f] };
  }
  if (l === "rust") {
    const rustc = which("rustc");
    if (!rustc) throw new Error("Rust needs rustc on PATH (https://rustup.rs)");
    return { bin: "", version: ver(rustc), file: "main.rs", args: () => [], compile: (f, out) => [rustc, ["--edition", "2021", "-O", "-o", out, f]] };
  }
  if (WIN()) return { bin: "powershell", version: "PowerShell", file: "main.ps1", args: (f) => ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", f] };
  const sh = which("bash") ?? "/bin/sh";
  return { bin: sh, version: ver(sh).slice(0, 60), file: "main.sh", args: (f) => [f] };
}

async function runCode(l: Lang, code: string, o: { dir: string; cwd?: string; env: Record<string, string>; stdin?: string; timeoutMs: number; memMB: number; wrap?: (bin: string, args: string[]) => [string, string[]]; preArgs?: string[] }): Promise<RunResult & { runtime: string }> {
  const { fs, path } = node();
  const rt = detectRuntime(l);
  const file = path.join(o.dir, rt.file);
  fs.writeFileSync(file, code);
  let bin = rt.bin, args = rt.args(file, o.memMB);
  if (rt.compile) {
    const out = path.join(o.dir, WIN() ? "main.exe" : "main");
    const [cb, ca] = rt.compile(file, out);
    const c = await spawnRun(cb, ca, { cwd: o.dir, timeoutMs: Math.max(o.timeoutMs, 120000) });
    if (c.exitCode !== 0) return { ...c, runtime: rt.version, stderr: `compile error:\n${c.stderr}` };
    bin = out; args = [];
  }
  if (o.preArgs && bin === process.execPath) args = [...o.preArgs, ...args];
  if (o.wrap) [bin, args] = o.wrap(bin, args);
  const r = await spawnRun(bin, args, { cwd: o.cwd ?? o.dir, env: o.env, input: o.stdin, timeoutMs: o.timeoutMs });
  return { ...r, runtime: rt.version };
}

// ─── env.* ───────────────────────────────────────────────────────────────────

interface EnvRec { id: string; name: string; language: Lang; dir: string; memoryLimitMB: number; timeoutMs: number; envVars: Record<string, string>; runtime: string; createdAt: string; runs: number; lastRunAt?: string }
const envs = persisted<{ envs: EnvRec[] }>("environments", () => ({ envs: [] }));
const getEnv = (id: string) => { const e = envs.get().envs.find((x) => x.id === id || x.name === id); if (!e) throw new Error(`environment ${id} not found — env.create first`); return e; };
const parseVars = (v: unknown): Record<string, string> => { if (!v) return {}; const j = json<any>(v, null); if (j && typeof j === "object") return Object.fromEntries(Object.entries(j).map(([k, x]) => [k, String(x)])); return Object.fromEntries(str(v).split(/[\n,;]/).map((l) => l.split("=")).filter((p) => p[0]?.trim()).map(([k, ...r]) => [k.trim(), r.join("=").trim()])); };

// ─── sandbox.* ───────────────────────────────────────────────────────────────

type Iso = "none" | "basic" | "full" | "paranoid";
interface NetPolicy { allowAll: boolean; allowPatterns: string[]; blockPatterns: string[] }
interface SbRec { id: string; name: string; description: string; scenarioId?: string; isolationLevel: Iso; tags: string[]; dir: string; status: "idle" | "running" | "error" | "destroyed"; network: NetPolicy; envVars: Record<string, string>; memoryMB: number; timeSecs: number; createdAt: string; executions: number; lastIsolation?: string; snapshots: { id: string; path: string; at: string }[] }
const sbs = persisted<{ sandboxes: SbRec[] }>("sandboxes", () => ({ sandboxes: [] }));
const getSb = (id: string) => { const s = sbs.get().sandboxes.find((x) => x.id === id || x.name === id); if (!s) throw new Error(`sandbox ${id} not found`); if (s.status === "destroyed") throw new Error(`sandbox ${id} was destroyed`); return s; };
const workDir = (s: SbRec) => node().path.join(s.dir, "work");
function inBox(s: SbRec, p: string): string {
  const { path } = node();
  const root = path.resolve(workDir(s)), full = path.resolve(root, p.replace(/^\/+/, ""));
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("path escapes the sandbox");
  return full;
}

/** ESM preload for sandboxed Node: enforces the network policy and logs every connection attempt. */
function netGuard(s: SbRec): string {
  const { fs, path } = node();
  const f = path.join(s.dir, "netguard.mjs");
  const log = path.join(s.dir, "network.jsonl");
  fs.writeFileSync(f, `import net from "node:net"; import tls from "node:tls"; import fs from "node:fs";
const P = ${JSON.stringify(s.network)}; const LOG = ${JSON.stringify(log)};
const glob = (u, p) => new RegExp("^" + p.replace(/[.+^$()|[\\]\\\\]/g, "\\\\$&").replace(/\\*/g, ".*").replace(/\\?/g, ".") + "$", "i").test(u);
const allowed = (u) => { if (P.blockPatterns.some((p) => p !== "*" && glob(u, p))) return false; if (P.allowAll) return true; return P.allowPatterns.some((p) => glob(u, p)); };
const rec = (o) => { try { fs.appendFileSync(LOG, JSON.stringify({ ...o, at: new Date().toISOString() }) + "\\n"); } catch {} };
const of = globalThis.fetch;
globalThis.fetch = async (input, init) => { const url = typeof input === "string" ? input : input.url ?? String(input); const ok = allowed(url); const t = Date.now(); if (!ok) { rec({ kind: "fetch", url, method: init?.method ?? "GET", allowed: false }); throw new TypeError("network blocked by sandbox policy: " + url); } try { const r = await of(input, init); rec({ kind: "fetch", url, method: init?.method ?? "GET", allowed: true, status: r.status, ms: Date.now() - t }); return r; } catch (e) { rec({ kind: "fetch", url, allowed: true, error: String(e) }); throw e; } };
const wrap = (mod, name) => { const o = mod[name]; mod[name] = function (...a) { const opt = typeof a[0] === "object" ? a[0] : { port: a[0], host: typeof a[1] === "string" ? a[1] : "localhost" }; const host = opt.host ?? opt.servername ?? "localhost"; const url = (name === "connect" && mod === tls ? "https://" : "tcp://") + host + ":" + (opt.port ?? ""); if (opt.path) return o.apply(this, a); const ok = allowed(url) || allowed("https://" + host + "/*") || allowed("http://" + host + "/*"); rec({ kind: "socket", url, allowed: ok }); if (!ok) throw new Error("network blocked by sandbox policy: " + url); return o.apply(this, a); }; };
wrap(net, "connect"); wrap(net, "createConnection"); wrap(tls, "connect");
`);
  return f;
}

let dockerCache: string | null | undefined;
function containerRuntime(): string | null {
  if (dockerCache !== undefined) return dockerCache;
  for (const b of ["docker", "podman"]) if (which(b)) { const r = node().cp.spawnSync(b, ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8", timeout: 8000 }); if (r.status === 0) return (dockerCache = b); }
  return (dockerCache = null);
}
let unshareOk: boolean | undefined;
function canUnshare(): boolean {
  if (unshareOk !== undefined) return unshareOk;
  if (process.platform !== "linux" || !which("unshare")) return (unshareOk = false);
  return (unshareOk = node().cp.spawnSync("unshare", ["-rn", "true"], { timeout: 5000 }).status === 0);
}
const IMAGES: Record<Lang, string> = { javascript: "node:22-alpine", typescript: "node:22-alpine", python: "python:3.12-alpine", rust: "rust:1-alpine", shell: "alpine:3" };

async function sandboxExec(s: SbRec, code: string, l: Lang, timeoutMs: number) {
  const { path, fs } = node();
  const wd = workDir(s);
  fs.mkdirSync(wd, { recursive: true });
  const env = cleanEnv(wd, s.envVars);
  const blockAll = !s.network.allowAll && !s.network.allowPatterns.length;
  // 1) containers for full/paranoid when available
  const ctr = (s.isolationLevel === "full" || s.isolationLevel === "paranoid") && !secret("STITAP_SANDBOX_NO_DOCKER") ? containerRuntime() : null;
  if (ctr) {
    const rt = l === "typescript" ? "main.mts" : detectRuntimeFile(l);
    fs.writeFileSync(path.join(wd, rt), code);
    const cmd = l === "javascript" ? ["node", rt] : l === "typescript" ? ["node", "--experimental-strip-types", "--no-warnings", rt] : l === "python" ? ["python", "-u", rt] : l === "rust" ? ["sh", "-c", `rustc -O -o /tmp/m ${rt} && /tmp/m`] : ["sh", rt];
    const net = s.isolationLevel === "paranoid" || blockAll ? "none" : "bridge";
    const args = ["run", "--rm", "-i", "--network", net, "--memory", `${s.memoryMB}m`, "--cpus", "1", "--pids-limit", "128", "-v", `${wd}:/work`, "-w", "/work", ...(s.isolationLevel === "paranoid" ? ["--read-only", "--tmpfs", "/tmp", "--cap-drop", "ALL", "--security-opt", "no-new-privileges"] : []), ...Object.entries(s.envVars).flatMap(([k, v]) => ["-e", `${k}=${v}`]), IMAGES[l], ...cmd];
    const r = await spawnRun(ctr, args, { timeoutMs: timeoutMs + 60000 });
    return { ...r, isolation: `${ctr} (${IMAGES[l]}, network=${net})` };
  }
  // 2) local process with OS sandboxing where possible
  const layers: string[] = [];
  const pre: string[] = [];
  if (s.isolationLevel !== "none" && (l === "javascript" || l === "typescript")) {
    pre.push("--import", `file://${netGuard(s).replace(/\\/g, "/")}`);
    layers.push("node-network-guard");
    const [maj] = nodeMajorMinor();
    if (s.isolationLevel !== "basic") { pre.push(maj >= 23 ? "--permission" : "--experimental-permission", `--allow-fs-read=${wd}`, `--allow-fs-read=${s.dir}`, `--allow-fs-write=${wd}`, `--allow-fs-write=${s.dir}`); layers.push("node-permission(fs=sandbox, no child processes)"); }
  }
  let wrap: ((bin: string, args: string[]) => [string, string[]]) | undefined;
  if (s.isolationLevel !== "none" && blockAll && canUnshare()) { wrap = (b, a) => ["unshare", ["-rn", b, ...a]]; layers.push("linux-netns(no network)"); }
  else if (s.isolationLevel !== "none" && process.platform === "darwin" && which("sandbox-exec")) {
    const prof = `(version 1)(allow default)${blockAll ? "(deny network*)" : ""}(deny file-write*)(allow file-write* (subpath "${wd}") (subpath "${s.dir}") (subpath "/private/var/folders") (literal "/dev/null"))`;
    wrap = (b, a) => ["sandbox-exec", ["-p", prof, b, ...a]]; layers.push(`macos-sandbox(${blockAll ? "no network, " : ""}writes=sandbox)`);
  }
  if (s.isolationLevel !== "none") layers.push("scrubbed-env", `cwd=${path.basename(s.dir)}`);
  const r = await runCode(l, code, { dir: wd, env, timeoutMs, memMB: s.memoryMB, wrap, preArgs: pre });
  return { ...r, isolation: layers.length ? `process + ${layers.join(" + ")}` : "process (no isolation)" };
}
const detectRuntimeFile = (l: Lang) => ({ javascript: "main.mjs", typescript: "main.mts", python: "main.py", rust: "main.rs", shell: "main.sh" })[l];

function readNetLog(s: SbRec): any[] {
  const { fs, path } = node();
  const f = path.join(s.dir, "network.jsonl");
  return fs.existsSync(f) ? String(fs.readFileSync(f, "utf8")).split("\n").filter(Boolean).map((l: string) => json<any>(l, {})) : [];
}

// ─── engine persistence (snapshot private state of the lib/agent singletons) ─

function snap(o: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "function") continue;
    out[k] = v instanceof Map ? { __map: [...v.entries()] } : v instanceof Set ? { __set: [...v] } : v;
  }
  return JSON.parse(JSON.stringify(out));
}
function restore(o: any, d: any): void {
  for (const [k, v] of Object.entries(d ?? {})) {
    if (v && typeof v === "object" && "__map" in (v as any)) o[k] = new Map((v as any).__map);
    else if (v && typeof v === "object" && "__set" in (v as any)) o[k] = new Set((v as any).__set);
    else o[k] = v;
  }
}
function engine<T>(ns: string, get: () => T): { e: () => T; save: () => void } {
  const st = persisted<{ s: any }>(ns, () => ({ s: null }));
  let loaded = false;
  const e = () => { const x = get(); if (!loaded) { loaded = true; if (st.get().s) restore(x, st.get().s); } return x; };
  return { e, save: () => { st.get().s = snap(e()); st.save(); } };
}
const MEM = engine("agent-memory", getAgentMemory), SK = engine("agent-skills", getSkillManager), SI = engine("agent-self-improve", getSelfImprover), KB = engine("agent-kanban", getKanbanManager);

// ─── terminal (real shell, background processes) ─────────────────────────────

interface Proc { id: string; command: string; child: any; out: string; err: string; read: number; status: "running" | "exited" | "killed"; exitCode?: number; startedAt: string; endedAt?: string }
const procs = new Map<string, Proc>();
function shellArgs(cmd: string): [string, string[]] { return WIN() ? ["powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd]] : [which("bash") ?? "/bin/sh", ["-c", cmd]]; }

// ─── executors ───────────────────────────────────────────────────────────────

const viaHost = async (name: string, i: Record<string, unknown>) => { const h = agentHost(name); return h ? { handled: true, value: await h(i) } : { handled: false, value: undefined }; };

export const RUNTIME_EXECUTORS: ExecMap = execs({
  // env
  "env.create": (i) => {
    const { fs, path } = node();
    const l = lang(i.language);
    const rt = detectRuntime(l);
    const id = uid("env").toLowerCase();
    const dir = path.join(dataDir() ?? node().os.tmpdir(), "envs", id);
    fs.mkdirSync(dir, { recursive: true });
    const rec: EnvRec = { id, name: str(i.name, id), language: l, dir, memoryLimitMB: num(i.memoryLimitMB, 512), timeoutMs: num(i.timeoutMs, 30000), envVars: parseVars(i.envVars), runtime: rt.version, createdAt: new Date().toISOString(), runs: 0 };
    envs.get().envs.push(rec); envs.save();
    return rec;
  },
  "env.run": async (i) => {
    const e = getEnv(str(i.environmentId));
    const { fs, path } = node();
    const cwd = i.workDir ? path.resolve(e.dir, str(i.workDir).replace(/^\/+/, "")) : e.dir;
    if (!cwd.startsWith(e.dir)) throw new Error("workDir must stay inside the environment");
    fs.mkdirSync(cwd, { recursive: true });
    const r = await runCode(e.language, str(i.code), { dir: e.dir, cwd, env: cleanEnv(e.dir, e.envVars), stdin: i.stdin ? str(i.stdin) : undefined, timeoutMs: num(i.timeoutMs, e.timeoutMs), memMB: e.memoryLimitMB });
    e.runs++; e.lastRunAt = new Date().toISOString(); envs.save();
    return { environmentId: e.id, language: e.language, ...r, success: r.exitCode === 0 };
  },
  "env.list": (i) => {
    const l = i.language ? lang(i.language) : null;
    return { environments: envs.get().envs.filter((e) => !l || e.language === l), installedRuntimes: (["javascript", "typescript", "python", "rust", "shell"] as Lang[]).map((x) => { try { return { language: x, runtime: detectRuntime(x).version, available: true }; } catch (err: any) { return { language: x, available: false, reason: err.message }; } }) };
  },
  "env.destroy": (i) => {
    const e = getEnv(str(i.environmentId));
    try { node().fs.rmSync(e.dir, { recursive: true, force: true }); } catch { /* already gone */ }
    envs.get().envs = envs.get().envs.filter((x) => x.id !== e.id); envs.save();
    return { destroyed: true, environmentId: e.id };
  },

  // sandbox
  "sandbox.create": (i) => {
    const { fs, path } = node();
    const sc = i.scenarioId ? getScenario(str(i.scenarioId)) : undefined;
    if (i.scenarioId && !sc) throw new Error(`unknown scenario ${str(i.scenarioId)} — see sandbox.scenarios`);
    const pol = sc ? buildPolicyFromScenario(sc) : null;
    const iso = (str(i.isolationLevel, sc?.isolationLevel ?? "basic") as Iso);
    const id = uid("sbx").toLowerCase();
    const dir = path.join(dataDir() ?? node().os.tmpdir(), "sandboxes", id);
    const rec: SbRec = {
      id, name: str(i.name, sc?.name ?? id), description: str(i.description, sc?.description ?? ""), scenarioId: sc?.id, isolationLevel: iso, tags: list(i.tags ?? sc?.tags), dir, status: "idle",
      network: pol ? { allowAll: pol.network.allowAll, allowPatterns: pol.network.allowPatterns, blockPatterns: pol.network.blockPatterns } : iso === "none" ? { allowAll: true, allowPatterns: [], blockPatterns: [] } : { allowAll: false, allowPatterns: [], blockPatterns: ["*"] },
      envVars: { ...(sc?.envVars ?? {}) }, memoryMB: pol?.resources.maxMemoryMB ?? 256, timeSecs: pol?.resources.maxTimeSecs ?? 30, createdAt: new Date().toISOString(), executions: 0, snapshots: [],
    };
    fs.mkdirSync(path.join(dir, "work"), { recursive: true });
    for (const f of sc?.initialFiles ?? []) { const p = inBox(rec, f.path); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.content); }
    sbs.get().sandboxes.push(rec); sbs.save();
    const available = { containers: containerRuntime(), linuxNetns: canUnshare(), macosSandbox: process.platform === "darwin" && !!which("sandbox-exec") };
    return { sandbox: rec, isolationAvailable: available, note: (iso === "full" || iso === "paranoid") && !available.containers ? "Docker/Podman not available: full/paranoid run as OS-sandboxed processes (see isolation in sandbox.exec results)" : undefined };
  },
  "sandbox.exec": async (i) => {
    const s = getSb(str(i.sandboxId));
    const l = i.language ? lang(i.language) : /^\s*(interface |type \w+\s*=|enum \w+)|:\s*(string|number|boolean)\b/m.test(str(i.code)) ? "typescript" : "javascript";
    s.status = "running"; sbs.save();
    try {
      const r = await sandboxExec(s, str(i.code), l, num(i.timeoutMs, s.timeSecs * 1000));
      s.status = r.exitCode === 0 ? "idle" : "error"; s.executions++; s.lastIsolation = r.isolation; sbs.save();
      return { sandboxId: s.id, language: l, ...r, success: r.exitCode === 0 };
    } catch (e) { s.status = "error"; sbs.save(); throw e; }
  },
  "sandbox.list": (i) => {
    const f = str(i.filter, "all");
    return { sandboxes: sbs.get().sandboxes.filter((s) => (f === "all" ? s.status !== "destroyed" : s.status === f) && (!i.scenarioId || s.scenarioId === str(i.scenarioId)) && (!i.tag || s.tags.includes(str(i.tag)))).map(({ dir, ...s }) => ({ ...s, dir })) };
  },
  "sandbox.destroy": (i) => {
    const s = getSb(str(i.sandboxId));
    try { node().fs.rmSync(s.dir, { recursive: true, force: true }); } catch { /* gone */ }
    s.status = "destroyed"; sbs.save();
    return { destroyed: true, sandboxId: s.id };
  },
  "sandbox.scenarios": (i) => {
    const cat = str(i.category, "all");
    let r = cat === "all" ? getSandboxManager().getScenarios() : getScenariosByCategory(cat as any);
    if (i.search) { const ids = new Set(searchScenarios(str(i.search)).map((s) => s.id)); r = r.filter((s) => ids.has(s.id)); }
    return { count: r.length, scenarios: r.map((s) => ({ id: s.id, name: s.name, description: s.description, category: s.category, isolationLevel: s.isolationLevel, tags: s.tags, files: s.initialFiles.length })) };
  },
  "sandbox.snapshot": (i) => {
    const s = getSb(str(i.sandboxId)), { fs, path } = node();
    if (i.restore) {
      const sn = s.snapshots.find((x) => x.id === str(i.restore));
      if (!sn) throw new Error(`snapshot ${str(i.restore)} not found (${s.snapshots.map((x) => x.id).join(", ") || "none"})`);
      fs.rmSync(workDir(s), { recursive: true, force: true });
      fs.cpSync(sn.path, workDir(s), { recursive: true });
      return { restored: sn.id, sandboxId: s.id };
    }
    const id = uid("snap").toLowerCase(), dest = path.join(dataDir() ?? node().os.tmpdir(), "sandbox-snapshots", s.id, id);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(workDir(s), dest, { recursive: true });
    let files = 0, bytes = 0;
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; } } };
    walk(dest);
    s.snapshots.push({ id, path: dest, at: new Date().toISOString() }); sbs.save();
    return { snapshotId: id, path: dest, files, bytes, snapshots: s.snapshots.length, restoreWith: `sandbox.snapshot sandboxId=${s.id} restore=${id}` };
  },
  "sandbox.files": (i) => {
    const s = getSb(str(i.sandboxId)), { fs, path } = node(), action = str(i.action, "list"), p = inBox(s, str(i.path, "/"));
    if (action === "write") { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, str(i.content)); return { written: path.relative(workDir(s), p), bytes: str(i.content).length }; }
    if (action === "read") { if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) throw new Error(`no file ${str(i.path)}`); return { path: str(i.path), content: String(fs.readFileSync(p, "utf8")).slice(0, 200000) }; }
    if (action === "delete") { if (p === path.resolve(workDir(s))) throw new Error("refusing to delete the sandbox root"); fs.rmSync(p, { recursive: true, force: true }); return { deleted: str(i.path) }; }
    const out: { path: string; size: number; type: string }[] = [];
    const walk = (d: string) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); const rel = path.relative(workDir(s), q).split(path.sep).join("/"); if (e.isDirectory()) { out.push({ path: rel + "/", size: 0, type: "dir" }); walk(q); } else out.push({ path: rel, size: fs.statSync(q).size, type: "file" }); if (out.length > 1000) return; } };
    walk(p);
    return { files: out };
  },
  "sandbox.network": (i) => {
    const s = getSb(str(i.sandboxId)), action = str(i.action, "summary");
    if (action === "policy") {
      if (i.allowAll !== undefined || i.allowPatterns || i.blockPatterns) {
        s.network = { allowAll: i.allowAll !== undefined ? bool(i.allowAll) : s.network.allowAll, allowPatterns: i.allowPatterns ? list(i.allowPatterns) : s.network.allowPatterns, blockPatterns: i.blockPatterns ? list(i.blockPatterns) : s.network.blockPatterns };
        sbs.save();
      }
      return { sandboxId: s.id, policy: s.network, enforcement: s.isolationLevel === "none" ? "not enforced (isolation none)" : "node guard for JS/TS; OS network namespace / container when everything is blocked" };
    }
    const log = readNetLog(s);
    if (action === "log") return { sandboxId: s.id, entries: log.slice(-num(i.limit, 100)) };
    const hosts: Record<string, { requests: number; blocked: number }> = {};
    for (const e of log) { let h = e.url; try { h = new URL(e.url).host; } catch { /* raw */ } hosts[h] ??= { requests: 0, blocked: 0 }; hosts[h].requests++; if (!e.allowed) hosts[h].blocked++; }
    return { sandboxId: s.id, total: log.length, blocked: log.filter((e) => !e.allowed).length, hosts, policy: s.network };
  },

  // agent
  "agent.memory": async (i) => {
    const h = await viaHost("memory", i); if (h.handled) return h.value;
    const m = MEM.e(), action = str(i.action, "query");
    if (action === "add") {
      const key = str(i.key, str(i.content).slice(0, 40));
      m.removeByKey(key);
      const e = m.add({ type: (str(i.type, "fact") as MemoryType), key, content: str(i.content), importance: num(i.importance, 0.5), tags: list(i.tags) });
      MEM.save(); return { added: e };
    }
    if (action === "remove") { const n = i.key ? m.removeByKey(str(i.key)) : m.remove(str(i.id ?? i.search)) ? 1 : 0; MEM.save(); return { removed: n }; }
    if (action === "stats") return m.stats();
    if (action === "summarise" || action === "summarize") { const r = m.summarise(); MEM.save(); return r; }
    if (action === "to-prompt") return { prompt: m.toSLMPrompt(num(i.limit, 2000)) };
    const r = m.query({ type: i.type ? (str(i.type) as MemoryType) : undefined, search: i.search ? str(i.search) : i.key ? str(i.key) : undefined, tags: i.tags ? list(i.tags) : undefined, limit: num(i.limit, 20) });
    MEM.save();
    return str(i.format) === "compact" ? { results: r.map((x) => `[${x.type}] ${x.key}: ${x.content}`) } : { count: r.length, results: r };
  },
  "agent.skills": async (i) => {
    const h = await viaHost("skills", i); if (h.handled) return h.value;
    const s = SK.e(), action = str(i.action, "list");
    const steps = () => { const j = json<any>(i.steps, null); return (Array.isArray(j) ? j : list(i.steps)).map((x: any) => (typeof x === "string" ? { action: x } : { action: str(x.action ?? x.description), toolId: x.toolId, input: x.input })); };
    const out = (sk: any) => (str(i.format) === "slm-prompt" ? { id: sk.id, prompt: sk.slmPrompt } : sk);
    switch (action) {
      case "create": case "extract": { if (!i.name) throw new Error("name is required"); const sk = s.extractFromTask({ name: str(i.name), description: str(i.description), category: (str(i.category, "custom") as any), steps: steps(), tags: list(i.tags) }); if (action === "create") (sk as any).source = { type: "user-created" }; SK.save(); return out(sk); }
      case "get": { const sk = s.get(str(i.skillId)) ?? s.list().find((x) => x.name === str(i.name ?? i.skillId)); if (!sk) throw new Error(`skill ${str(i.skillId ?? i.name)} not found`); return out(sk); }
      case "search": return { results: s.search(str(i.search ?? i.name)).map(out) };
      case "refine": { const r = s.refine(str(i.skillId)); SK.save(); return r; }
      case "delete": { const ok = s.delete(str(i.skillId)); SK.save(); if (!ok) throw new Error(`skill ${str(i.skillId)} not found`); return { deleted: true }; }
      case "stats": return s.stats();
      default: return { skills: s.list().filter((x) => !i.category || x.category === str(i.category)).map((x) => ({ id: x.id, name: x.name, description: x.description, category: x.category, steps: x.steps.length, timesUsed: x.stats.timesUsed, confidence: x.confidence })) };
    }
  },
  "agent.self-improve": async (i) => {
    const h = await viaHost("selfImprove", i); if (h.handled) return h.value;
    const si = SI.e(), action = str(i.action, "summary");
    if (action === "record") {
      const t = json<any>(i.taskData, {});
      if (!t.goal) throw new Error("taskData must include goal, steps [{toolId, success, durationMs, error?}], success");
      const steps = (t.steps ?? []).map((x: any) => ({ toolId: str(x.toolId ?? x.tool), input: x.input ?? {}, success: x.success !== false, durationMs: num(x.durationMs, 0), error: x.error }));
      si.recordTask({ id: t.id ?? uid("task").toLowerCase(), goal: str(t.goal), toolsUsed: t.toolsUsed ?? [...new Set(steps.map((x: any) => x.toolId))], steps, success: t.success ?? steps.every((x: any) => x.success), durationMs: num(t.durationMs, steps.reduce((a: number, x: any) => a + x.durationMs, 0)), timestamp: t.timestamp ?? new Date().toISOString(), errors: t.errors ?? steps.filter((x: any) => !x.success).map((x: any) => ({ type: /timeout|timed out/i.test(x.error ?? "") ? "timeout" : /network|fetch|ECONN|ENOTFOUND/i.test(x.error ?? "") ? "network" : /permission|denied|forbidden|401|403/i.test(x.error ?? "") ? "permission" : /invalid|required|validation/i.test(x.error ?? "") ? "validation" : "unknown", message: str(x.error, "failed"), toolId: x.toolId })), ...(t.skillId ? { skillId: t.skillId } : {}) } as any);
      SI.save(); return { recorded: true, stats: si.getStats() };
    }
    if (action === "patterns") { const p = si.detectPatterns(); SI.save(); return { patterns: p }; }
    if (action === "suggestions") { const s = si.generateSuggestions(); SI.save(); return { suggestions: s }; }
    if (action === "auto-apply") { const a = si.autoApply(); SI.save(); return { applied: a }; }
    if (action === "stats") return si.getStats();
    return str(i.format) === "json" ? { stats: si.getStats(), patterns: si.getPatterns(), suggestions: si.getSuggestions() } : { summary: si.toSLMSummary() };
  },
  "agent.terminal": async (i) => {
    const h = await viaHost("terminal", i); if (h.handled) return h.value;
    const action = str(i.action, i.command ? "run" : "list");
    if (action === "list") return { processes: [...procs.values()].map((p) => ({ id: p.id, command: p.command, status: p.status, exitCode: p.exitCode, startedAt: p.startedAt, endedAt: p.endedAt })) };
    if (action === "run" || (i.command && !i.processId)) {
      const cmd = str(i.command);
      if (!cmd) throw new Error("command is required");
      const { path, os } = node();
      const cwd = i.cwd ? path.resolve(str(i.cwd).replace(/^~(?=$|\/)/, os.homedir())) : process.cwd();
      const [bin, args] = shellArgs(cmd);
      if (bool(i.background)) {
        const { cp } = node();
        const child = cp.spawn(bin, args, { cwd, env: process.env, windowsHide: true });
        const p: Proc = { id: uid("proc").toLowerCase(), command: cmd, child, out: "", err: "", read: 0, status: "running", startedAt: new Date().toISOString() };
        child.stdout.on("data", (d: any) => { p.out += d; if (p.out.length > 2e6) { const cut = p.out.length - 1e6; p.out = p.out.slice(cut); p.read = Math.max(0, p.read - cut); } });
        child.stderr.on("data", (d: any) => { p.err += d; if (p.err.length > 1e6) p.err = p.err.slice(-5e5); });
        child.on("close", (c: number | null) => { p.status = p.status === "killed" ? "killed" : "exited"; p.exitCode = c ?? undefined; p.endedAt = new Date().toISOString(); });
        child.on("error", (e: Error) => { p.err += e.message; p.status = "exited"; p.exitCode = 127; });
        procs.set(p.id, p);
        return { processId: p.id, pid: child.pid, status: "running", cwd };
      }
      const r = await spawnRun(bin, args, { cwd, timeoutMs: num(i.timeoutSecs, 120) * 1000, env: process.env as any });
      return { command: cmd, cwd, ...r };
    }
    const p = procs.get(str(i.processId));
    if (!p) throw new Error(`process ${str(i.processId)} not found`);
    if (action === "poll") { const chunk = p.out.slice(p.read); p.read = p.out.length; return { processId: p.id, status: p.status, exitCode: p.exitCode, newOutput: chunk.slice(-50000), stderr: p.err.slice(-10000) }; }
    if (action === "log") return { processId: p.id, status: p.status, stdout: p.out.slice(-100000), stderr: p.err.slice(-20000) };
    if (action === "wait") { const until = Date.now() + num(i.timeoutSecs, 30) * 1000; while (p.status === "running" && Date.now() < until) await new Promise((r) => setTimeout(r, 200)); return { processId: p.id, status: p.status, exitCode: p.exitCode, stdout: p.out.slice(-50000), stderr: p.err.slice(-10000), timedOut: p.status === "running" }; }
    if (action === "kill") { if (p.status === "running") { p.status = "killed"; p.child.kill(WIN() ? undefined : "SIGTERM"); } return { processId: p.id, status: p.status }; }
    if (action === "write") { if (p.status !== "running") throw new Error("process is not running"); p.child.stdin.write(str(i.command ?? i.input)); return { processId: p.id, written: str(i.command ?? i.input).length }; }
    throw new Error(`unknown terminal action ${action}`);
  },
  "agent.kanban": async (i) => {
    const h = await viaHost("kanban", i); if (h.handled) return h.value;
    const k = KB.e(), action = str(i.action), b = str(i.boardId);
    const done = <T>(v: T) => { KB.save(); return v; };
    const need = (v: unknown, what: string) => { if (v === undefined || v === null || v === "") throw new Error(`${what} is required for ${action}`); return v; };
    switch (action) {
      case "create-board": return done(k.createBoard(str(i.boardName ?? i.title, "Board"), str(i.description)));
      case "list-boards": return { boards: k.listBoards().map((x: any) => ({ id: x.id, name: x.name, tasks: x.tasks?.length ?? 0 })) };
      case "snapshot": { const s = k.getSnapshot(str(need(i.boardId, "boardId"))); if (!s) throw new Error(`board ${b} not found`); return s; }
      case "add-task": return done(k.addTask(str(need(i.boardId, "boardId")), { title: str(need(i.title, "title")), description: str(i.description), priority: i.priority as any, dependsOn: i.dependsOn ? list(i.dependsOn) : undefined, assignee: i.assignee ? str(i.assignee) : undefined }));
      case "move-task": { const t = k.moveTask(b, str(need(i.taskId, "taskId")), str(need(i.status, "status")) as any); if (!t) throw new Error("task not found (or dependencies not done)"); return done(t); }
      case "assign-task": { const ok = k.assignTask(b, str(need(i.taskId, "taskId")), str(need(i.workerId ?? i.assignee, "workerId"))); if (!ok) throw new Error("task or worker not found"); return done({ assigned: true }); }
      case "delete-task": { const ok = k.deleteTask(b, str(need(i.taskId, "taskId"))); return done({ deleted: ok }); }
      case "fan-out": { const subs = json<any[]>(i.subtasks, []); const arr = (Array.isArray(subs) ? subs : list(i.subtasks)).map((x: any) => (typeof x === "string" ? { title: x } : x)); return done({ subtasks: k.fanOut(b, str(need(i.taskId, "taskId")), arr) }); }
      case "add-comment": { const c = k.addComment(b, str(need(i.taskId, "taskId")), str(i.author, "agent"), str(need(i.comment, "comment"))); if (!c) throw new Error("task not found"); return done(c); }
      case "register-worker": return done(k.registerWorker(b, { id: str(i.workerId, uid("worker").toLowerCase()), name: str(i.workerName, "worker"), type: (str(i.workerType, "agent") as any), status: "idle", capabilities: [] }));
      case "heartbeat": return done({ ok: k.heartbeat(b, str(need(i.workerId, "workerId"))) });
      case "get-ready": return { tasks: k.getReadyTasks(b) };
      case "get-stale": return { workers: k.getStaleWorkers(b, num(i.staleSecs, 60)) };
      default: throw new Error(`unknown kanban action ${action}`);
    }
  },
});

void r2;

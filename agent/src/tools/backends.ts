/**
 * Terminal execution backends: local (bash/zsh/sh or PowerShell/cmd), docker, ssh.
 * Every command runs non-interactively with a timeout; the working directory
 * persists across calls by reading it back after each command.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, createWriteStream, type WriteStream } from "node:fs";
import { platform } from "node:os";
import { join, resolve } from "node:path";
import { EventEmitter } from "node:events";
import { newId, shortId, sha1 } from "../util/misc.js";

export interface ExecOptions { cwd: string; timeoutMs: number; signal?: AbortSignal; onOutput?: (chunk: string) => void; env?: Record<string, string> }
export interface ExecResult { exitCode: number | null; output: string; cwd: string; timedOut: boolean; interrupted: boolean; truncatedBytes: number }

const MARK = "__STITAP_CWD__";
const MAX_CAPTURE = 4 * 1024 * 1024;

/** The harness's environment for user commands, minus what belongs to the harness's own process:
 * NODE_TEST_CONTEXT (set when the harness runs under `node --test`) makes every `node --test` the user runs skip its files. */
export function childEnv(): NodeJS.ProcessEnv {
  const { NODE_TEST_CONTEXT: _drop, ...env } = process.env;
  return env;
}

export const NONINTERACTIVE_ENV: Record<string, string> = {
  CI: "1", GIT_PAGER: "cat", PAGER: "cat", GIT_TERMINAL_PROMPT: "0", DEBIAN_FRONTEND: "noninteractive",
  PYTHONUNBUFFERED: "1", NO_COLOR: "1", TERM: "dumb", PIP_DISABLE_PIP_VERSION_CHECK: "1", npm_config_yes: "true",
};

export type ShellKind = "posix" | "powershell" | "cmd";
export interface ShellSpec { kind: ShellKind; exe: string; args: (script: string) => string[] }

function which(cmd: string): boolean {
  try {
    execFileSync(platform() === "win32" ? "where" : "which", [cmd], { stdio: "ignore" });
    return true;
  } catch { return false; }
}

export function detectShell(pref = "auto"): ShellSpec {
  const isWin = platform() === "win32";
  const pick = pref !== "auto" ? pref : isWin ? (which("pwsh") ? "pwsh" : "powershell") : process.env.SHELL && existsSync(process.env.SHELL) && /(bash|zsh)$/.test(process.env.SHELL) ? process.env.SHELL : existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh";
  if (/pwsh|powershell/i.test(pick)) return { kind: "powershell", exe: pick, args: (s) => ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", s] };
  if (/(^|\\)cmd(\.exe)?$/i.test(pick)) return { kind: "cmd", exe: pick, args: (s) => ["/d", "/s", "/c", s] };
  return { kind: "posix", exe: pick, args: (s) => ["-c", s] };
}

export function wrapForCwd(cmd: string, kind: ShellKind): string {
  if (kind === "powershell") return `$ErrorActionPreference='Continue'; & { ${cmd}\n}; $__ec = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }; Write-Output "\`n${MARK}$((Get-Location).Path)"; exit $__ec`;
  if (kind === "cmd") return `${cmd} & echo. & echo ${MARK}%CD%`;
  return `${cmd}\n__st_ec=$?; printf '\\n${MARK}%s\\n' "$(pwd)"; exit $__st_ec`;
}

export function parseCwd(output: string, fallback: string): { output: string; cwd: string } {
  const i = output.lastIndexOf(MARK);
  if (i < 0) return { output, cwd: fallback };
  const after = output.slice(i + MARK.length);
  const line = after.split(/\r?\n/)[0].trim();
  return { output: output.slice(0, i).replace(/\r?\n$/, ""), cwd: line || fallback };
}

export function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    if (platform() === "win32") execFileSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch { try { child.kill("SIGKILL"); } catch { /* gone */ } }
}

function runChild(exe: string, args: string[], opts: ExecOptions & { spawnCwd?: string }, kind: ShellKind): Promise<ExecResult> {
  return new Promise((resolveP) => {
    const child = spawn(exe, args, {
      cwd: opts.spawnCwd ?? opts.cwd, env: { ...childEnv(), ...NONINTERACTIVE_ENV, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"], detached: platform() !== "win32", windowsHide: true,
    });
    let out = "", dropped = 0, timedOut = false, interrupted = false;
    const onData = (b: Buffer) => {
      const s = b.toString("utf8");
      if (out.length < MAX_CAPTURE) out += s; else dropped += s.length;
      opts.onOutput?.(s.includes(MARK) ? s.slice(0, s.indexOf(MARK)) : s);
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, opts.timeoutMs);
    const onAbort = () => { interrupted = true; killTree(child); };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const done = (code: number | null) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      const p = parseCwd(out, opts.cwd);
      void kind;
      resolveP({ exitCode: code, output: p.output, cwd: p.cwd, timedOut, interrupted, truncatedBytes: dropped });
    };
    child.on("error", (e) => { out += `\n[spawn error] ${e.message}`; done(127); });
    child.on("close", (code) => done(code));
  });
}

export interface BackgroundHandle { pid?: number; child: ChildProcess }

export interface TerminalBackend {
  readonly name: string;
  readonly shell: ShellSpec;
  exec(cmd: string, opts: ExecOptions): Promise<ExecResult>;
  spawnBackground(cmd: string, cwd: string): BackgroundHandle;
  describe(): string;
}

export class LocalBackend implements TerminalBackend {
  readonly name = "local";
  readonly shell: ShellSpec;
  constructor(shellPref = "auto") { this.shell = detectShell(shellPref); }
  exec(cmd: string, opts: ExecOptions) {
    const cwd = existsSync(opts.cwd) ? opts.cwd : process.cwd();
    return runChild(this.shell.exe, this.shell.args(wrapForCwd(cmd, this.shell.kind)), { ...opts, cwd }, this.shell.kind);
  }
  spawnBackground(cmd: string, cwd: string): BackgroundHandle {
    const child = spawn(this.shell.exe, this.shell.args(cmd), { cwd, env: { ...childEnv(), ...NONINTERACTIVE_ENV }, stdio: ["pipe", "pipe", "pipe"], detached: platform() !== "win32", windowsHide: true });
    return { pid: child.pid, child };
  }
  describe() { return `local (${this.shell.kind}: ${this.shell.exe})`; }
}

export class DockerBackend implements TerminalBackend {
  readonly name = "docker";
  readonly shell: ShellSpec = { kind: "posix", exe: "sh", args: (s) => ["-c", s] };
  private container: string;
  private started = false;
  constructor(private image: string, private mountDir: string) {
    this.container = `stitap-${sha1(resolve(mountDir) + image).slice(0, 10)}`;
  }
  private ensure() {
    if (this.started) return;
    try {
      const st = execFileSync("docker", ["inspect", "-f", "{{.State.Running}}", this.container], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (st !== "true") execFileSync("docker", ["start", this.container], { stdio: "ignore" });
    } catch {
      const mount = resolve(this.mountDir);
      const target = platform() === "win32" ? "/workspace" : mount;
      execFileSync("docker", ["run", "-d", "--name", this.container, "-v", `${mount}:${target}`, "-w", target, "--init", this.image, "sleep", "infinity"], { stdio: "ignore" });
    }
    this.started = true;
  }
  private mapCwd(cwd: string) { return platform() === "win32" ? "/workspace" : cwd; }
  exec(cmd: string, opts: ExecOptions) {
    this.ensure();
    const inner = `cd ${JSON.stringify(this.mapCwd(opts.cwd))} 2>/dev/null; ${wrapForCwd(cmd, "posix")}`;
    return runChild("docker", ["exec", "-i", this.container, "sh", "-c", inner], { ...opts, spawnCwd: process.cwd() }, "posix");
  }
  spawnBackground(cmd: string, cwd: string): BackgroundHandle {
    this.ensure();
    const child = spawn("docker", ["exec", "-i", this.container, "sh", "-c", `cd ${JSON.stringify(this.mapCwd(cwd))}; ${cmd}`], { stdio: ["pipe", "pipe", "pipe"] });
    return { pid: child.pid, child };
  }
  describe() { return `docker (${this.image}, container ${this.container})`; }
}

export class SshBackend implements TerminalBackend {
  readonly name = "ssh";
  readonly shell: ShellSpec = { kind: "posix", exe: "bash", args: (s) => ["-c", s] };
  constructor(private host: string) {}
  exec(cmd: string, opts: ExecOptions) {
    const inner = `cd ${JSON.stringify(opts.cwd)} 2>/dev/null; ${wrapForCwd(cmd, "posix")}`;
    return runChild("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", this.host, "bash", "-lc", JSON.stringify(inner)], { ...opts, spawnCwd: process.cwd() }, "posix");
  }
  spawnBackground(cmd: string, cwd: string): BackgroundHandle {
    const child = spawn("ssh", ["-o", "BatchMode=yes", this.host, "bash", "-lc", JSON.stringify(`cd ${JSON.stringify(cwd)}; ${cmd}`)], { stdio: ["pipe", "pipe", "pipe"] });
    return { pid: child.pid, child };
  }
  describe() { return `ssh (${this.host})`; }
}

// ─── background process registry ────────────────────────────────────────────

export interface BgProcess {
  id: string; command: string; cwd: string; sessionId: string; pid?: number; startedAt: number;
  status: "running" | "exited" | "killed"; exitCode: number | null; endedAt?: number;
  notifyOnExit: boolean; logFile: string;
}

export class ProcessRegistry extends EventEmitter {
  private procs = new Map<string, BgProcess & { buf: string; read: number; child: ChildProcess; log: WriteStream }>();
  constructor(private logDir: string) { super(); }

  start(backend: TerminalBackend, command: string, cwd: string, sessionId: string, notifyOnExit = true): BgProcess {
    const id = shortId("p_");
    const h = backend.spawnBackground(command, cwd);
    const logFile = join(this.logDir, `${id}.log`);
    const log = createWriteStream(logFile);
    const rec = { id, command, cwd, sessionId, pid: h.pid, startedAt: Date.now(), status: "running" as const, exitCode: null, notifyOnExit, logFile, buf: "", read: 0, child: h.child, log };
    this.procs.set(id, rec as any);
    const onData = (b: Buffer) => {
      const s = b.toString("utf8");
      log.write(s);
      rec.buf += s;
      if (rec.buf.length > 256 * 1024) { const cut = rec.buf.length - 200 * 1024; rec.buf = rec.buf.slice(cut); rec.read = Math.max(0, rec.read - cut); }
    };
    h.child.stdout?.on("data", onData);
    h.child.stderr?.on("data", onData);
    h.child.on("error", (e) => onData(Buffer.from(`\n[spawn error] ${e.message}\n`)));
    h.child.on("close", (code) => {
      const r = this.procs.get(id) as any;
      if (r.status === "running") r.status = "exited";
      r.exitCode = code; r.endedAt = Date.now();
      log.end();
      this.emit("exit", this.public(r));
    });
    return this.public(rec);
  }

  private public(r: any): BgProcess {
    const { buf: _b, read: _r, child: _c, log: _l, ...p } = r;
    return p;
  }

  list(sessionId?: string): BgProcess[] { return [...this.procs.values()].filter((p) => !sessionId || p.sessionId === sessionId).map((p) => this.public(p)); }
  get(id: string) { const p = this.procs.get(id); return p ? this.public(p) : null; }

  poll(id: string): { proc: BgProcess; newOutput: string } | null {
    const p = this.procs.get(id);
    if (!p) return null;
    const out = p.buf.slice(p.read);
    p.read = p.buf.length;
    return { proc: this.public(p), newOutput: out };
  }

  tail(id: string, chars = 4000): string | null { const p = this.procs.get(id); return p ? p.buf.slice(-chars) : null; }

  write(id: string, data: string): boolean {
    const p = this.procs.get(id);
    if (!p || p.status !== "running" || !p.child.stdin) return false;
    p.child.stdin.write(data);
    return true;
  }

  async wait(id: string, timeoutMs: number, signal?: AbortSignal): Promise<BgProcess | null> {
    const p = this.procs.get(id);
    if (!p) return null;
    if (p.status !== "running") return this.public(p);
    await new Promise<void>((res) => {
      const t = setTimeout(res, timeoutMs);
      const onExit = (x: BgProcess) => { if (x.id === id) { clearTimeout(t); this.off("exit", onExit); res(); } };
      this.on("exit", onExit);
      signal?.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true });
    });
    return this.public(this.procs.get(id));
  }

  /** Stop gracefully: SIGINT to the process group (lets recorders/servers flush), SIGKILL after graceMs if still alive. */
  kill(id: string, graceMs = 3000): boolean {
    const p = this.procs.get(id);
    if (!p || p.status !== "running") return false;
    p.status = "killed";
    const pid = p.child.pid;
    if (!pid || platform() === "win32" || graceMs <= 0) { killTree(p.child); return true; }
    try { process.kill(-pid, "SIGINT"); } catch { try { p.child.kill("SIGINT"); } catch { /* gone */ } }
    const t = setTimeout(() => { if (p.child.exitCode === null && p.child.signalCode === null) killTree(p.child); }, graceMs);
    t.unref?.();
    return true;
  }

  killAll(): void { for (const p of this.procs.values()) if (p.status === "running") killTree(p.child); }
}

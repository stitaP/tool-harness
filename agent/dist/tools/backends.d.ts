/**
 * Terminal execution backends: local (bash/zsh/sh or PowerShell/cmd), docker, ssh.
 * Every command runs non-interactively with a timeout; the working directory
 * persists across calls by reading it back after each command.
 */
import { type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
export interface ExecOptions {
    cwd: string;
    timeoutMs: number;
    signal?: AbortSignal;
    onOutput?: (chunk: string) => void;
    env?: Record<string, string>;
}
export interface ExecResult {
    exitCode: number | null;
    output: string;
    cwd: string;
    timedOut: boolean;
    interrupted: boolean;
    truncatedBytes: number;
}
/** The harness's environment for user commands, minus what belongs to the harness's own process:
 * NODE_TEST_CONTEXT (set when the harness runs under `node --test`) makes every `node --test` the user runs skip its files. */
export declare function childEnv(): NodeJS.ProcessEnv;
export declare const NONINTERACTIVE_ENV: Record<string, string>;
export type ShellKind = "posix" | "powershell" | "cmd";
export interface ShellSpec {
    kind: ShellKind;
    exe: string;
    args: (script: string) => string[];
}
export declare function detectShell(pref?: string): ShellSpec;
export declare function wrapForCwd(cmd: string, kind: ShellKind): string;
export declare function parseCwd(output: string, fallback: string): {
    output: string;
    cwd: string;
};
export declare function killTree(child: ChildProcess): void;
export interface BackgroundHandle {
    pid?: number;
    child: ChildProcess;
}
export interface TerminalBackend {
    readonly name: string;
    readonly shell: ShellSpec;
    exec(cmd: string, opts: ExecOptions): Promise<ExecResult>;
    spawnBackground(cmd: string, cwd: string): BackgroundHandle;
    describe(): string;
}
export declare class LocalBackend implements TerminalBackend {
    readonly name = "local";
    readonly shell: ShellSpec;
    constructor(shellPref?: string);
    exec(cmd: string, opts: ExecOptions): Promise<ExecResult>;
    spawnBackground(cmd: string, cwd: string): BackgroundHandle;
    describe(): string;
}
export declare class DockerBackend implements TerminalBackend {
    private image;
    private mountDir;
    readonly name = "docker";
    readonly shell: ShellSpec;
    private container;
    private started;
    constructor(image: string, mountDir: string);
    private ensure;
    private mapCwd;
    exec(cmd: string, opts: ExecOptions): Promise<ExecResult>;
    spawnBackground(cmd: string, cwd: string): BackgroundHandle;
    describe(): string;
}
export declare class SshBackend implements TerminalBackend {
    private host;
    readonly name = "ssh";
    readonly shell: ShellSpec;
    constructor(host: string);
    exec(cmd: string, opts: ExecOptions): Promise<ExecResult>;
    spawnBackground(cmd: string, cwd: string): BackgroundHandle;
    describe(): string;
}
export interface BgProcess {
    id: string;
    command: string;
    cwd: string;
    sessionId: string;
    pid?: number;
    startedAt: number;
    status: "running" | "exited" | "killed";
    exitCode: number | null;
    endedAt?: number;
    notifyOnExit: boolean;
    logFile: string;
}
export declare class ProcessRegistry extends EventEmitter {
    private logDir;
    private procs;
    constructor(logDir: string);
    start(backend: TerminalBackend, command: string, cwd: string, sessionId: string, notifyOnExit?: boolean): BgProcess;
    private public;
    list(sessionId?: string): BgProcess[];
    get(id: string): BgProcess | null;
    poll(id: string): {
        proc: BgProcess;
        newOutput: string;
    } | null;
    tail(id: string, chars?: number): string | null;
    write(id: string, data: string): boolean;
    wait(id: string, timeoutMs: number, signal?: AbortSignal): Promise<BgProcess | null>;
    /** Stop gracefully: SIGINT to the process group (lets recorders/servers flush), SIGKILL after graceMs if still alive. */
    kill(id: string, graceMs?: number): boolean;
    killAll(): void;
}

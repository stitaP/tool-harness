import { BenchRecorder } from "./bench.js";
import { EventEmitter } from "node:events";
import { ConfigStore } from "../config.js";
import { type Session, type StateDB } from "../state/db.js";
import { type Provider } from "../providers/index.js";
import { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/types.js";
import { ProcessRegistry, type TerminalBackend } from "../tools/backends.js";
import { PipelineRunner } from "../loop/pipeline.js";
import { ApprovalManager } from "../safety/approvals.js";
import { Checkpoints } from "../safety/checkpoints.js";
import { MemoryStore } from "../memory/store.js";
import { SkillStore } from "../skills/store.js";
import { type TurnResult } from "../loop/agent.js";
import { type GoalState } from "../loop/autonomy.js";
import { CronScheduler } from "../cron/scheduler.js";
import { KanbanBoard } from "../kanban/board.js";
import { RagStore } from "../rag/index.js";
import { McpManager } from "../mcp/client.js";
import { HookBus } from "./hooks.js";
import { StoreBridge } from "./store-bridge.js";
export declare const VERSION = "0.1.0";
export interface RuntimeOptions {
    profile?: string;
    home?: string;
    cwd?: string;
    provider?: Provider;
    auxProvider?: Provider;
    plugins?: boolean;
    mcp?: boolean;
}
export interface SendOptions {
    source?: string;
    images?: string[];
    meta?: Record<string, any>;
    approvalMode?: string;
    internal?: boolean;
}
export interface QueueItem extends SendOptions {
    text: string;
    resolve: (r: TurnResult) => void;
    reject: (e: any) => void;
}
export interface Delivery {
    platform: string;
    target: string;
    text: string;
}
export interface GatewayLike {
    send(platform: string, target: string, text: string): Promise<void>;
    platforms(): string[];
}
declare class SessionRunner {
    private rt;
    readonly sid: string;
    queue: QueueItem[];
    busy: boolean;
    ctrl: AbortController | null;
    steers: string[];
    private idleWaiters;
    constructor(rt: Runtime, sid: string);
    enqueue(text: string, o?: SendOptions): Promise<TurnResult>;
    idle(): boolean;
    waitIdle(): Promise<void>;
    interrupt(clearQueue?: boolean): boolean;
    steer(text: string): "steered" | "queued";
    private pump;
}
export declare class Runtime extends EventEmitter {
    private opts;
    readonly home: string;
    readonly cfg: ConfigStore;
    readonly db: StateDB;
    readonly tools: ToolRegistry;
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
    gateway: GatewayLike | null;
    readonly startCwd: string;
    private runners;
    private providerCache;
    private auxProv;
    private toolCache;
    private clarifies;
    private tickers;
    private caps;
    readonly attached: Map<string, number>;
    private constructor();
    static bundledSkillsDir(): string;
    static create(opts?: RuntimeOptions): Promise<Runtime>;
    private makeBackend;
    private registerBuiltinTools;
    emitEvent(sessionId: string, ev: Record<string, any>): void;
    createSession(p: Partial<Session> & {
        source: string;
    }): Session;
    getOrCreateSession(id: string | undefined, source: string, extra?: Partial<Session>): Session;
    ensureSystemPrompt(sid: string): Session;
    /** Rebuild the system prompt now (breaks the prompt cache; used by --now commands). */
    refreshSystemPrompt(sid: string): void;
    /** Switch a chat between the normal agent and the RAG bot (answers only from the shared documents). */
    setMode(sid: string, mode: "agent" | "rag"): void;
    /** Run this chat as a named agent from config `agents:` (null/"default" = plain settings). Rebuilds prompt and tools. */
    applyAgent(sid: string, name: string | null): void;
    sessionCwd(sid: string): string;
    /** agent.default_cwd when it is an existing folder, else the folder the harness started in. */
    defaultCwd(): string;
    /** Recently used working folders, most recent first (for the folder picker). */
    recentCwds(): string[];
    private rememberCwd;
    /**
     * Change a chat's working folder. `remember` (folder picker, /cwd) records it as a recent folder and rebuilds the
     * system prompt so it names the new folder; tools that `cd` during a turn pass nothing.
     */
    setSessionCwd(sid: string, p: string, opts?: {
        remember?: boolean;
    }): void;
    /** Tools in the model schema for this session — fixed at first use for cache stability. */
    activeTools(sid: string, allowed?: Set<string>): Tool[];
    dropToolCache(sid: string): void;
    /**
     * The system prompt and tool schemas are sent with every call. When they take most of a small window (51 tools
     * are ~12K tokens, a 16K window leaves nothing for the conversation, and compression cannot shrink them) the chat
     * moves to the compact core profile and, unless agent.tool_selection is "off", the tool planner picks the extra
     * tools each task needs (loop/toolselect.ts). agent.tool_selection "on" does that for every chat.
     */
    private shrinkToWindow;
    providerFor(sid: string): Provider;
    aux(): Provider;
    resetProviders(): void;
    runner(sid: string): SessionRunner;
    isBusy(sid: string): boolean;
    send(sid: string, text: string, o?: SendOptions): Promise<TurnResult>;
    interrupt(sid: string, clearQueue?: boolean): boolean;
    steer(sid: string, text: string): "steered" | "queued";
    waitIdle(sid: string): Promise<void>;
    /** Run a prompt in a fresh session with nobody watching; waits for goal continuations to finish. */
    runHeadless(o: {
        prompt: string;
        source: string;
        title?: string;
        approvalMode?: string;
        goal?: string;
        cwd?: string;
        tools?: string[];
        tier?: "fast" | "strong";
        prefer?: "fast" | "strong";
        onSession?: (sessionId: string) => void;
    }): Promise<{
        sessionId: string;
        final: string;
        error?: string;
        goal?: GoalState;
    }>;
    /** A tool context for calling tools outside an agent turn (MCP server, scripts, tests). */
    toolContext(sid: string, signal?: AbortSignal, approvalMode?: string): import("../tools/types.js").ToolContext;
    askClarify(sessionId: string, question: string, choices?: string[]): Promise<string | null>;
    respondClarify(id: string, answer: string | null): boolean;
    pendingClarify(sessionId: string): {
        id: string;
        question: string;
        choices: string[] | undefined;
    }[];
    cancelClarify(sessionId: string): void;
    maybeTitle(sid: string): void;
    capabilities(): string[];
    deliver(target: string, text: string): Promise<void>;
    private onProcessExit;
    private ownsTicker;
    startBackground(): void;
    tickAutonomy(): Promise<void>;
    shutdown(): Promise<void>;
}
export {};

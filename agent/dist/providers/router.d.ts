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
import { type ChildProcess } from "node:child_process";
import { type WriteStream } from "node:fs";
import type { Msg } from "../state/db.js";
import type { ChatRequest, ChatResponse, Provider } from "./types.js";
export type Tier = "fast" | "strong";
export interface RouterModel {
    name: string;
    file: string;
    fit_margin_mb?: number;
    min_wired_mb?: number;
    context?: number;
    extra_args?: string[];
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
    models: {
        fast?: RouterModel;
        strong?: RouterModel;
    };
    /** keep BOTH models loaded at once, each on its own port, and route per request with no restarts (needs the memory for both) */
    resident?: boolean;
}
export declare const ROUTER_DEFAULTS: RouterConfig;
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
}
export interface RouteDecision {
    tier: Tier;
    reason: string;
}
/** What happened since the user's last message: model calls (assistant messages) and failed tool results. */
export declare function turnActivity(messages: Msg[]): {
    calls: number;
    errors: number;
    lastUser: string;
    goal: boolean;
};
export declare function scoreTask(text: string): {
    score: number;
    why: string[];
};
export declare function decide(inp: RouteInput): RouteDecision;
export declare function wiredLimitMb(): number;
export declare class ModelServer {
    private cfg;
    private logDir;
    current: Tier | null;
    loadedAt: number;
    readonly ctx: Record<Tier, number>;
    private child;
    private logStream;
    private lock;
    private strongBlockedUntil;
    /** an llama-server we did not start is answering on the port: we cannot restart it, so we never switch */
    external: string | null;
    onStatus: (m: string) => void;
    constructor(cfg: () => RouterConfig, logDir: string);
    private get baseUrl();
    strongAvailable(): boolean;
    private probe;
    /** Make `tier` the loaded model. Calls are serialized; resolves when the server answers /health. */
    ensure(tier: Tier): Promise<void>;
    private doEnsure;
    private start;
    stop(): Promise<void>;
    kill(): void;
}
/** Start one llama-server and wait until it answers. Shared by the one-at-a-time ModelServer and the resident DuoServer. */
export declare function launchLlama(c: RouterConfig, m: RouterModel, port: number, log: WriteStream, onChild?: (ch: ChildProcess) => void): Promise<{
    child: ChildProcess;
    ctx: number;
}>;
/**
 * Resident mode: BOTH models stay loaded, each in its own llama-server on its own port, so switching tiers costs nothing.
 * The strong model starts first with a large --fit-target, which makes llama.cpp leave that much GPU memory free; the fast
 * model then fits into what is left. Everything is sized automatically (no context size is chosen by hand).
 */
export declare class DuoServer {
    private cfg;
    private logDir;
    current: Tier | null;
    loadedAt: number;
    readonly ctx: Record<Tier, number>;
    readonly external: string | null;
    onStatus: (m: string) => void;
    private slots;
    private lock;
    private failed;
    readonly errors: Partial<Record<Tier, string>>;
    constructor(cfg: () => RouterConfig, logDir: string);
    portOf(tier: Tier): number;
    isUp(tier: Tier): boolean;
    strongAvailable(): boolean;
    /** Make sure `tier` is serving. Never stops the other model. */
    ensure(tier: Tier): Promise<void>;
    private doEnsure;
    /** Load both models, strong first. A model that cannot load is reported but does not stop the other. */
    ensureAll(): Promise<void>;
    stop(): Promise<void>;
    kill(): void;
}
export declare class RouterProvider implements Provider {
    private inner;
    readonly server: ModelServer | DuoServer;
    private cfg;
    private onEvent?;
    /** resident mode: build the provider that talks to one tier's own port */
    private makeInner?;
    /** manual override from /route, persisted only for this process */
    mode: "auto" | Tier;
    last: RouteDecision | null;
    private inners;
    constructor(inner: Provider, server: ModelServer | DuoServer, cfg: () => RouterConfig, onEvent?: ((m: string) => void) | undefined, 
    /** resident mode: build the provider that talks to one tier's own port */
    makeInner?: ((tier: Tier, port: number, name: string, ctx: number) => Provider) | undefined);
    get resident(): boolean;
    get id(): string;
    get model(): string;
    get contextWindow(): number;
    /** The provider for a tier: the shared one when a single server is swapped, one per port in resident mode. */
    private innerFor;
    chat(req: ChatRequest): Promise<ChatResponse>;
}

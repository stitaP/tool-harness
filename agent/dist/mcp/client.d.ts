import type { Runtime } from "../runtime/runtime.js";
export interface McpServerConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    url?: string;
    headers?: Record<string, string>;
    include?: string[];
    exclude?: string[];
    enabled?: boolean;
    timeout?: number;
}
export interface McpToolDef {
    name: string;
    description?: string;
    inputSchema?: any;
}
export declare class McpConnection {
    readonly name: string;
    private cfg;
    private secret;
    tools: McpToolDef[];
    status: "starting" | "ready" | "error" | "closed";
    error?: string;
    private child?;
    private nextId;
    private pending;
    private buf;
    private sessionHeader?;
    constructor(name: string, cfg: McpServerConfig, secret: (k: string) => string | undefined);
    private timeoutMs;
    start(): Promise<void>;
    private spawnStdio;
    private onMessage;
    private handle;
    private send;
    private httpPost;
    request(method: string, params: any): Promise<any>;
    notify(method: string, params: any): Promise<void>;
    call(tool: string, args: any): Promise<string>;
    close(): void;
}
export declare class McpManager {
    private rt;
    conns: Map<string, McpConnection>;
    constructor(rt: Runtime);
    startAll(): Promise<void>;
    start(name: string, cfg: McpServerConfig): Promise<McpConnection>;
    reload(): Promise<string>;
    summary(): string;
    stop(name: string): void;
    closeAll(): void;
}

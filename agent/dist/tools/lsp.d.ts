import { type Tool } from "./types.js";
export interface LspServerDef {
    command: string;
    args?: string[];
    exts: string[];
    roots?: string[];
    languageId?: string;
    install?: string;
}
export declare const DEFAULT_SERVERS: Record<string, LspServerDef>;
export interface Diagnostic {
    range: {
        start: {
            line: number;
            character: number;
        };
    };
    severity?: number;
    message: string;
    source?: string;
    code?: string | number;
}
export declare class LspClient {
    readonly name: string;
    readonly root: string;
    private onClose;
    private child;
    private buf;
    private nextId;
    private pending;
    private versions;
    readonly diags: Map<string, {
        list: Diagnostic[];
        at: number;
    }>;
    private idle?;
    ready: Promise<void>;
    closed: boolean;
    constructor(name: string, def: LspServerDef, root: string, onClose: () => void);
    private touch;
    private shutdownState;
    private send;
    private onData;
    private onMessage;
    request(method: string, params: any, timeoutMs?: number): Promise<any>;
    notify(method: string, params: any): void;
    /** Make the server see the file's current content. */
    sync(file: string, languageId: string): string;
    /** Wait until diagnostics for `uri` arrive and stop changing (servers publish in several rounds). */
    diagnostics(uri: string, maxMs?: number): Promise<Diagnostic[]>;
    close(): void;
    kill(): void;
}
export declare function serverFor(file: string, servers: Record<string, LspServerDef>): {
    key: string;
    def: LspServerDef;
} | null;
export declare function projectRoot(file: string, def: LspServerDef, fallback: string): string;
export declare function clientFor(key: string, def: LspServerDef, root: string): Promise<LspClient>;
export declare function stopAllLsp(): void;
/** Column (0-based) for a 1-based line: the first occurrence of `symbol`, else the first identifier. */
export declare function columnOf(lineText: string, symbol?: string): number | null;
export declare const lspTool: Tool;

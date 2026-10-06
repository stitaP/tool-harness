import type { Msg } from "../state/db.js";
import { type ChatRequest, type ChatResponse, type Provider } from "./types.js";
export interface OpenAIOptions {
    baseUrl: string;
    model: string;
    apiKey?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    temperature?: number;
    headers?: Record<string, string>;
    extraBody?: Record<string, any>;
    timeoutMs?: number;
}
/**
 * Tool-call arguments as sent back in history. Servers that render chat templates (llama.cpp --jinja) parse them
 * as JSON and reject the whole request otherwise, so one cut-off call in history would fail every later turn.
 * Invalid arguments are replaced by a small valid stand-in (the tool result already explains the failure).
 */
export declare function wireArgs(raw: string | undefined): string;
export declare function toOpenAIMessages(messages: Msg[]): any[];
/** Plain http:// to loopback, private-LAN or .local hosts (no proxy, no TLS). */
export declare function isLocalHttp(url: string): boolean;
export declare class OpenAIProvider implements Provider {
    private o;
    readonly id: string;
    readonly model: string;
    contextWindow: number;
    private noStreamOptions;
    private ctxChecked;
    constructor(o: OpenAIOptions);
    /** A local llama.cpp server decides its context size at start (e.g. `--fit`); use what it actually runs with,
     * not the config value, so the stats and autocompaction match. Re-checked at most once a minute. */
    detectContext(): Promise<number>;
    chat(req: ChatRequest): Promise<ChatResponse>;
    private post;
    private readJson;
    private readStream;
    private finish;
}

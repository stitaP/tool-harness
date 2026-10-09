import type { Msg, ToolCall } from "../state/db.js";
export interface ToolSchema {
    name: string;
    description: string;
    parameters: any;
}
export interface ChatRequest {
    messages: Msg[];
    tools?: ToolSchema[];
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    onToken?: (t: string) => void;
    onReasoning?: (t: string) => void;
    stop?: string[];
    /** ask for a JSON object reply (judge/curator); providers do best effort */
    json?: boolean;
    stream?: boolean;
    /** model router: require this tier for the request (kanban workers and reviewers) */
    tier?: "fast" | "strong";
    /** model router: use this tier unless the turn is going badly (then it escalates) */
    prefer?: "fast" | "strong";
}
export interface ChatResponse {
    content: string;
    toolCalls: ToolCall[];
    usage: {
        input: number;
        output: number;
    };
    finishReason: string;
    model: string;
    reasoning?: string;
    /** generation speed: llama.cpp `timings` when the server sends them, otherwise measured from the stream */
    /** cacheTokens: prompt tokens reused from the server's cache; promptTokens: prompt tokens actually computed (llama.cpp) */
    timings?: {
        genTps: number;
        promptTps?: number;
        genTokens: number;
        genMs: number;
        cacheTokens?: number;
        promptTokens?: number;
    };
}
export interface Provider {
    readonly id: string;
    readonly model: string;
    readonly contextWindow: number;
    chat(req: ChatRequest): Promise<ChatResponse>;
}
export type ErrorKind = "rate_limit" | "context_length" | "auth" | "server" | "network" | "bad_request" | "tools_unsupported" | "aborted" | "bad_tool_call" | "compute";
export declare class ProviderError extends Error {
    readonly kind: ErrorKind;
    readonly status?: number | undefined;
    readonly retryAfterMs?: number | undefined;
    constructor(message: string, kind: ErrorKind, status?: number | undefined, retryAfterMs?: number | undefined);
    get retryable(): boolean;
}
export declare function classifyHttpError(status: number, body: string, retryAfter?: string | null): ProviderError;
/** Async iterator over SSE `data:` payloads from a fetch Response. */
export declare function sseEvents(res: Response, signal?: AbortSignal): AsyncGenerator<{
    event?: string;
    data: string;
}>;
/** Strip <think>…</think> blocks some local reasoning models emit inline. */
export declare function splitThinking(text: string): {
    content: string;
    reasoning: string;
};
export declare function extractInlineToolCalls(text: string, toolNames: string[], tools?: {
    name: string;
    parameters?: any;
}[]): {
    calls: {
        name: string;
        arguments: string;
    }[];
    rest: string;
};

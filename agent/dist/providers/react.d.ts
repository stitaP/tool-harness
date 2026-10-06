/**
 * ReAct text-protocol adapter: lets models WITHOUT native tool calling use
 * tools. History stays in OpenAI format internally; this adapter renders it
 * as Thought/Action/Observation text and parses replies back into tool calls.
 */
import type { Msg } from "../state/db.js";
import type { ChatRequest, ChatResponse, Provider, ToolSchema } from "./types.js";
export declare function reactToolBlock(tools: ToolSchema[]): string;
export declare function renderReactHistory(messages: Msg[]): Msg[];
export declare function parseReact(text: string, toolNames: string[]): {
    thought: string;
    action?: {
        name: string;
        args: any;
    };
    final: string;
};
export declare class ReactAdapter implements Provider {
    private inner;
    readonly id: string;
    readonly model: string;
    constructor(inner: Provider);
    get contextWindow(): number;
    chat(req: ChatRequest): Promise<ChatResponse>;
}
/** In-process provider driven by a function — used by tests and the SDK. */
export declare class FunctionProvider implements Provider {
    private fn;
    readonly model: string;
    readonly id = "function";
    readonly contextWindow: number;
    constructor(fn: (req: ChatRequest) => Promise<Partial<ChatResponse>> | Partial<ChatResponse>, model?: string, ctx?: number);
    chat(req: ChatRequest): Promise<ChatResponse>;
}

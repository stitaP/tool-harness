import type { Runtime } from "./runtime.js";
type Handler = (payload: any) => any;
export declare const HOOK_EVENTS: readonly ["pre_tool_call", "post_tool_call", "pre_llm_call", "on_turn_end", "on_session_start", "on_session_end", "on_message"];
export declare class HookBus {
    private rt;
    private handlers;
    loaded: {
        name: string;
        path: string;
        tools: string[];
        error?: string;
    }[];
    constructor(rt: Runtime);
    on(event: string, fn: Handler): void;
    emit(event: string, payload: any): Promise<any[]>;
    private runShell;
    /** Returns a block message if any pre_tool_call hook vetoes the call. */
    preTool(sessionId: string, tool: string, args: any): Promise<string | null>;
    postTool(sessionId: string, tool: string, args: any, result: string): Promise<void>;
    loadPlugins(dir: string): Promise<void>;
}
export {};

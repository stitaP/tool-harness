import type { Runtime } from "./runtime.js";
type Handler = (payload: any) => any;
export type ShellHook = string | {
    match?: string;
    command: string;
};
export interface ShellRun {
    command: string;
    code: number | null;
    stdout: string;
    stderr: string;
    ms: number;
}
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
    shellHooks(event: string): ShellHook[];
    /** Plugin handlers registered per event (for /hooks). */
    handlerCount(event: string): number;
    /** Run a shell hook and wait for it: exit code, stdout and stderr. */
    runShellWait(cmd: string, payload: any, timeoutMs?: number): Promise<ShellRun>;
    private runShell;
    /** Returns a block message if any pre_tool_call hook vetoes the call. */
    preTool(sessionId: string, tool: string, args: any): Promise<string | null>;
    postTool(sessionId: string, tool: string, args: any, result: string): Promise<void>;
    loadPlugins(dir: string): Promise<void>;
}
export {};

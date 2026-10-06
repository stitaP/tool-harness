import type { Runtime } from "../runtime/runtime.js";
import type { ToolSchema } from "../providers/types.js";
import type { Tool } from "./types.js";
export declare class ToolRegistry {
    private tools;
    register(t: Tool): void;
    unregister(name: string): void;
    unregisterWhere(pred: (t: Tool) => boolean): void;
    get(name: string): Tool | undefined;
    all(): Tool[];
    isAvailable(t: Tool, rt: Runtime): boolean;
    /** Tools sent in the model schema for a session. Stable for the session's life. */
    active(rt: Runtime, opts?: {
        profile?: string;
        allowed?: Set<string>;
    }): Tool[];
    /** Tools reachable via tool_search / use_tool (everything available but not active). */
    discoverable(rt: Runtime, active: Tool[]): Tool[];
    schemas(tools: Tool[]): ToolSchema[];
    /** Repair a hallucinated / misspelled tool name. */
    resolveName(name: string, candidates: Tool[]): Tool | undefined;
    search(query: string, pool: Tool[], limit?: number): Tool[];
}

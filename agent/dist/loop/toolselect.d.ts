import type { Runtime } from "../runtime/runtime.js";
import type { ToolSchema } from "../providers/types.js";
import type { Tool } from "../tools/types.js";
export declare const MAX_EXTRAS = 10;
/** "Run a command. Longer text…" → "Run a command." (≤ 110 chars) */
export declare function oneLine(t: Pick<Tool, "description"> & {
    summary?: string;
}): string;
export declare function catalog(tools: Tool[]): string;
export interface Selection {
    tools: string[];
    search: string[];
    plan: string[];
}
export declare function parseSelection(raw: string, known: Set<string>, resolve: (n: string) => string | undefined): Selection;
/** Same tool, shorter schema: property descriptions cut, the tool description cut. Names, types, enums and `required` stay. */
export declare function compactSchema(s: ToolSchema, over?: number): ToolSchema;
export declare function compactSchemas(schemas: ToolSchema[]): ToolSchema[];
/** Is the planner active for this chat? */
export declare function selectionActive(rt: Runtime, sid: string): boolean;
/**
 * Plan the tools for a task. Adds the picked tools to the chat and returns a short note for the model (loaded
 * tools, search hits, suggested steps), or null when nothing was decided.
 */
export declare function planTools(rt: Runtime, sid: string, task: string, signal?: AbortSignal): Promise<{
    note: string | null;
    added: string[];
}>;

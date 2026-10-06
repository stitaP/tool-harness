import { type Tool } from "./types.js";
export interface TodoItem {
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
    phase?: string;
}
/** Compact plan view: totals, per-phase progress, the item in progress and the next pending ones. Null when empty. */
export declare function planProgress(rt: {
    db: {
        getMeta<T>(k: string): T | null;
    };
}, sid: string, next?: number): string | null;
export declare const todoTool: Tool;
export declare const memoryTool: Tool;
export declare const skillsListTool: Tool;
export declare const skillViewTool: Tool;
export declare const skillManageTool: Tool;
export declare const sessionSearchTool: Tool;
export declare const clarifyTool: Tool;
export declare const toolSearchTool: Tool;
export declare const useToolTool: Tool;

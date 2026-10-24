import type { Runtime } from "./runtime.js";
export declare function readOnlyCommand(command: string): boolean;
export type ReadOnlyKind = "plan" | "review";
/** Why a tool call is refused in a read-only turn, or null when it may run. */
export declare function readOnlyBlock(rt: Runtime, sid: string, tool: string, args: any): string | null;
export declare const PLAN_NOTE = "[Plan mode is ON. Investigate first with read-only tools (read files, search, git status/diff/log, read-only shell commands). Do not create, edit or delete anything and do not run builds, installs or tests that write files. When you understand the task, reply with a numbered plan under a \"## Plan\" heading: the files you will change, what changes in each, and how you will verify the result. The user approves it with /plan approve.]";
export declare const EFFORTS: readonly ["off", "low", "medium", "high", "xhigh", "max"];
export type Effort = (typeof EFFORTS)[number];
export declare const effortOf: (rt: Runtime, sid: string) => Effort | undefined;
export declare const OUTPUT_STYLES: Record<string, {
    description: string;
    prompt: string;
}>;
/** Built-in styles plus `<home>/output-styles/<name>.md` files (first line `description: …` is optional). */
export declare function listOutputStyles(rt: Runtime): Record<string, {
    description: string;
    prompt: string;
    source: string;
}>;
export declare function outputStylePrompt(rt: Runtime, name: string | undefined): string | undefined;
export declare const shellKey: (sid: string) => string;
export interface ShellRun {
    command: string;
    exitCode: number | null;
    output: string;
    at: number;
}
/** Shell runs the user made since the last message, as a block the model sees; clears them. */
export declare function takeShellContext(rt: Runtime, sid: string): string;
/** What the status line shows: model, router tier, context use, git branch, folder and active modes. */
export declare function statusInfo(rt: Runtime, sid: string): Promise<{
    session: string;
    model: string;
    tier: string | undefined;
    context_used: number;
    context_window: number;
    context_pct: number;
    cwd: string;
    branch: string;
    plan_mode: boolean;
    effort: "off" | "low" | "medium" | "high" | "xhigh" | "max" | undefined;
    output_style: string | undefined;
    yolo: boolean;
    worktree: string | undefined;
    busy: boolean;
}>;
export declare function formatStatus(i: Awaited<ReturnType<typeof statusInfo>>): string;
/** The status line text: `ui.statusline.command` (gets the info as JSON on stdin, first stdout line is shown) or the built-in one. */
export declare function statusLine(rt: Runtime, sid: string): Promise<string | null>;

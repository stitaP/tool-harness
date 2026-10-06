import { type Tool } from "./types.js";
/** "[REDACTED]" is how hidden secrets are displayed, never real code: writing it back corrupts the file. */
export declare function placeholderError(before: string, after: string): string | null;
/** Overwriting most of an existing file is how earlier work gets lost (a page replaced by an empty shell). */
export declare function shrinkError(before: string, after: string, rel: string, canForce: boolean): string | null;
export declare const readFileTool: Tool;
export declare const writeFileTool: Tool;
/** Exact replace; otherwise whitespace-insensitive line-block match. */
export declare function applyEdit(text: string, oldS: string, newS: string, replaceAll: boolean): {
    text: string;
    count: number;
    fuzzy: boolean;
};
/** Where old_string most likely was meant to match: the file's lines nearest to it, numbered, to copy from. */
export declare function closestBlock(text: string, oldS: string): string;
export declare const patchTool: Tool;
export declare const searchFilesTool: Tool;
export declare const listDirTool: Tool;

import type { Runtime } from "../runtime/runtime.js";
/** A folder as an indented tree with sizes, so the agent knows what is there and reads files when it needs them. */
export declare function folderTree(root: string, maxEntries?: number, maxDepth?: number): {
    text: string;
    files: number;
    bytes: number;
    shown: number;
};
export declare function expandReferences(rt: Runtime, text: string, cwd: string): Promise<{
    text: string;
    images: string[];
}>;
/**
 * A message that is nothing but the path of an existing file ("/Users/me/plan/phase-01.md") is an unclear request for a
 * small model: say what is meant. Returns the text unchanged otherwise.
 */
export declare function barePathHint(text: string, cwd: string): string;

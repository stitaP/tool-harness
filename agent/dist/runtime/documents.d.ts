import type { Runtime } from "./runtime.js";
export type DocKind = "markdown" | "html" | "image" | "pdf" | "office" | "table" | "text" | "binary";
/** Extensions that count as documents (listed by `/open`, linked in chat); code files open too but are not listed. */
export declare const DOC_EXT: Set<string>;
export declare const MIME: Record<string, string>;
export declare const docKind: (p: string) => DocKind;
/**
 * Why `abs` may not be shown, or null when it may. Allowed: anything under the home folder, the temp folder or the
 * harness home, except `security.blocked_paths` and secret files (.env, private keys, the state database).
 */
export declare function viewBlocked(rt: Runtime, abs: string): string | null;
/** Resolve a path the user or the agent gave (relative to the chat's folder, `~` allowed); throws when it can't be shown. */
export declare function resolveDoc(rt: Runtime, sid: string | null, p: string): string;
export interface DocEntry {
    path: string;
    name: string;
    kind: DocKind | "dir";
    size: number;
    mtime: number;
}
export declare function docEntry(abs: string): DocEntry | null;
/** The entries of a folder: sub-folders first, then files; hidden files and build folders skipped. */
export declare function listFolder(dir: string, max?: number): DocEntry[];
/**
 * Documents this chat created or pointed at, newest first: paths the agent wrote with a file tool, and document paths
 * named in tool results or replies (a design run's report.md, an exported PDF …). Only files that still exist.
 */
export declare function chatDocuments(rt: Runtime, sid: string, max?: number): DocEntry[];
/** Open a file in the desktop's own viewer (the terminal REPL has no viewer of its own). */
export declare function openOnDesktop(abs: string): Promise<string | null>;
/**
 * Show a document to the user of chat `sid`: the web chat opens its viewer (an `open_document` event); a terminal
 * chat opens the desktop viewer. Returns what happened, for the tool result or the command reply.
 */
export declare function showDocument(rt: Runtime, sid: string, abs: string, source: string): Promise<string>;
export declare const isUrl: (p: string) => boolean;
/** Where a web document is downloaded from: Google files are exported as Word / Excel / PowerPoint. */
export declare function exportUrl(url: string): {
    url: string;
    ext?: string;
    kind: string;
};
/**
 * Download a document link into <home>/downloads and return the local copy (fetched again each time, so an edited
 * Google file shows its latest version). Only files shared as "anyone with the link" can be read.
 */
export declare function fetchDocUrl(rt: Runtime, url: string): Promise<{
    path: string;
    source: string;
    kind: string;
}>;

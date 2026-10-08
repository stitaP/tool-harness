import { type Tool } from "./types.js";
export interface Symbol {
    name: string;
    kind: string;
    line: number;
}
interface Chunk {
    start: number;
    end: number;
    tf: Map<string, number>;
    len: number;
}
interface FileEntry {
    path: string;
    mtime: number;
    size: number;
    symbols: Symbol[];
    chunks: Chunk[];
    pathTokens: Set<string>;
}
export interface Index {
    root: string;
    files: Map<string, FileEntry>;
    truncated: boolean;
    builtAt: number;
}
export declare function tokenize(s: string): string[];
export declare function extractSymbols(path: string, text: string): Symbol[];
/** Build or incrementally refresh the index for `root`. */
export declare function buildIndex(root: string, force?: boolean): Index;
export interface Hit {
    path: string;
    start: number;
    end: number;
    score: number;
    symbols: Symbol[];
}
export declare function search(idx: Index, query: string, limit?: number): Hit[];
export declare function findSymbols(idx: Index, query: string, limit?: number): {
    path: string;
    sym: Symbol;
    rank: number;
}[];
export declare const codeSearchTool: Tool;
export {};

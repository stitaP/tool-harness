import { mdTable } from "./office-md.js";
export { mdTable };
import { type Tool } from "./types.js";
export interface OfficeOptions {
    includeNotes?: boolean;
    sheets?: string[];
    maxRows?: number;
}
export interface OfficeResult {
    markdown: string;
    format: string;
    warnings: string[];
}
export declare const SUPPORTED_EXTENSIONS: string[];
export declare class Zip {
    private buf;
    private entries;
    private inflated;
    constructor(buf: Buffer);
    names(): string[];
    has(name: string): boolean;
    read(name: string): Buffer | null;
    text(name: string): string | null;
}
export interface XNode {
    name: string;
    attrs: Record<string, string>;
    children: (XNode | string)[];
}
export declare function decodeEntities(s: string): string;
/** Tolerant XML → tree. Names are canonicalised by namespace URI where known. DOCTYPE/PI/comments skipped, no entity expansion beyond the predefined ones. */
export declare function parseXml(src: string): XNode;
export declare const kids: (nd: XNode | undefined, name?: string) => XNode[];
export declare const child: (nd: XNode | undefined, name: string) => XNode | undefined;
/** first descendant (depth-first, document order) */
export declare function find(nd: XNode | undefined, name: string): XNode | undefined;
export declare function findAll(nd: XNode | undefined, name: string, out?: XNode[]): XNode[];
export declare function officeToMarkdown(path: string, opts?: OfficeOptions): Promise<OfficeResult>;
export declare const officeTool: Tool;

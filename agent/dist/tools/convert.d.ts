import { type Tool } from "./types.js";
export declare const CONVERT_OUT: string[];
export declare function markdownToHtml(src: string, title?: string): string;
export interface Table {
    name: string;
    rows: string[][];
}
/** Every Markdown table, named after the heading above it (a sheet name in a converted workbook). */
export declare function markdownTables(md: string): Table[];
export declare function parseDelimited(text: string, sep: string): string[][];
export declare function writeXlsx(tables: Table[]): Buffer;
interface Source {
    path: string;
    name: string;
    ext: string;
    label: string;
    markdown?: string;
    rows?: string[][];
}
/** Convert `src` into `out` (format from its extension). Returns a one-line note on what was written. */
export declare function convertFile(src: Source, out: string, o?: {
    sheet?: string;
    title?: string;
}): Promise<string>;
export declare const convertDocumentTool: Tool;
export {};

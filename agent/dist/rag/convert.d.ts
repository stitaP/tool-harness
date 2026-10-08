export interface Converted {
    markdown: string;
    format: string;
    warnings: string[];
}
export declare const RAG_EXTENSIONS: string[];
/** Convert one uploaded file. Throws with a clear reason when the format cannot be read. */
export declare function convertToMarkdown(name: string, buf: Buffer): Promise<Converted>;

export interface PptOptions {
    includeNotes?: boolean;
}
export declare function pptToMarkdown(buf: Buffer, opts?: PptOptions): {
    markdown: string;
    warnings: string[];
};

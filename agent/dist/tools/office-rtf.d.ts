export declare function cp1252Char(b: number): string;
/** formatted run; shared with the .doc reader */
export interface Seg {
    t: string;
    b: boolean;
    i: boolean;
    href?: string;
    fs?: number;
}
/** Merge runs and render bold/italic/links (same conventions as the .docx converter). */
export declare function renderSegs(segs: Seg[], brk: string): string;
export interface Block {
    kind: "list" | "para";
    text: string;
}
export declare function joinBlocks(blocks: Block[]): string;
export declare function rtfToMarkdown(input: string | Buffer): {
    markdown: string;
    warnings: string[];
};

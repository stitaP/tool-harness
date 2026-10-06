/** Dependency-free HTML → readable text/markdown-ish conversion for web_extract. */
export declare function decodeEntities(s: string): string;
export declare function htmlTitle(html: string): string;
export declare function htmlToText(html: string, baseUrl?: string): string;

import { type Tool } from "./types.js";
export interface PageResult {
    page: string;
    ok: boolean;
    problems: string[];
    textChars: number;
}
export declare const pageCheckAvailable: () => boolean;
/** HTML pages of the site: the folder's own and one level of subfolders (admin/…), not tests/docs/node_modules. */
export declare function sitePages(root: string): string[];
/** Load each page and judge it. `minText`: fewer visible characters than this means the page rendered empty. */
export declare function checkPages(root: string, pages?: string[], o?: {
    minText?: number;
    timeoutMs?: number;
}): Promise<PageResult[]>;
export declare function formatPages(rs: PageResult[]): string;
export declare const pageCheckTool: Tool;

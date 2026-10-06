import { type Tool } from "./types.js";
export interface TemplateEntry {
    id: string;
    title: string;
    category: string;
    framework: string;
    status: "adapted" | "listed";
    license: string;
    upstream: string;
    source: {
        type: "git";
        repo: string;
        commit: string;
    } | {
        type: "create";
        command: string;
        creates: string;
    };
    patch?: string;
    remove?: string[];
    env?: Record<string, string>;
    backend?: string;
    /** brand settings: literal find → replacement (placeholders allowed) in the generated files */
    replace?: {
        file: string;
        find: string;
        with: string;
    }[];
    defaults?: Record<string, string>;
    install?: string;
    dev?: string;
    port?: number;
    provides?: string[];
    after_create?: string[];
    notes?: string;
}
export declare const TEMPLATES_DIR: string;
export declare function loadCatalog(dir?: string): TemplateEntry[];
/** {name}-style placeholders; unknown ones become empty. */
export declare function fill(tpl: string, vars: Record<string, string | number | undefined>): string;
/** Set KEY=value lines in a .env text (replace existing keys, append new ones). */
export declare function mergeEnv(text: string, values: Record<string, string>): string;
export declare const siteTemplateTool: Tool;

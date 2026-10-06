/**
 * docs_lookup: when the agent lacks knowledge of an API, library or concept, look it up online — only in official
 * documentation, and only with the user's consent (asked once per chat; unattended runs need web.docs_lookup: always).
 */
import { type Tool } from "./types.js";
/** Official documentation sites (host, or host/path prefix). Extend with web.docs_domains in config.yaml. */
export declare const OFFICIAL_DOCS: string[];
export declare function isOfficialDoc(url: string, extra?: string[]): boolean;
export declare const docsLookupTool: Tool;

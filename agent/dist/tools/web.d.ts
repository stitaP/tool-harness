import type { Runtime } from "../runtime/runtime.js";
import { type Tool } from "./types.js";
export declare function guardedFetch(rt: Runtime, url: string, init?: RequestInit, signal?: AbortSignal): Promise<Response>;
export interface Hit {
    title: string;
    url: string;
    snippet: string;
}
/**
 * Search for unattended work (design research): the configured provider first; when it fails or finds nothing,
 * wait a moment and try DuckDuckGo lite, then Wikipedia. Returns the hits and which source answered.
 */
export declare function searchWebResilient(rt: Runtime, q: string, n: number, o?: {
    signal?: AbortSignal;
    waitMs?: number;
    sleep?: (ms: number) => Promise<void>;
}): Promise<{
    hits: Hit[];
    source: string;
    errors: string[];
}>;
/** Search with the configured provider (web.search_provider). */
export declare function searchWeb(rt: Runtime, q: string, n: number, signal?: AbortSignal): Promise<Hit[]>;
export declare const webSearchTool: Tool;
export declare function extractUrl(rt: Runtime, url: string, maxChars: number, signal?: AbortSignal): Promise<string>;
export declare const webExtractTool: Tool;

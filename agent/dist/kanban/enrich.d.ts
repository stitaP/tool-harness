/**
 * Add "REFERENCE NOTES" to tickets: for each technical term a ticket uses (aria-live, JWT, localStorage, <dialog>, Open Graph …)
 * look it up on OFFICIAL documentation sites (MDN, W3C, nodejs.org, …) and write one plain sentence plus the link into the ticket.
 * Only the term itself is searched (never ticket text or project data), only official pages are used, and nothing is changed
 * when the lookup finds nothing. Results are cached, so a term is looked up once however many tickets use it.
 * Triggered on purpose: `kanban enrich`, the board's "Add web notes" button, or `kanban import --enrich`.
 */
import type { Runtime } from "../runtime/runtime.js";
import { type Hit } from "../tools/web.js";
import type { Card } from "./board.js";
export interface Term {
    id: string;
    re: RegExp;
    query: string;
    label: string; /** a word the explaining paragraph is likely to contain */
    key?: string;
}
export interface Fetcher {
    search: (q: string) => Promise<Hit[]>;
    extract: (url: string) => Promise<string>;
}
export interface RefNote {
    term: string;
    label: string;
    summary: string;
    url: string;
    at: number;
}
/** Words the phase specs use that a small model may not know well. Each query is a generic documentation search. */
export declare const TERMS: Term[];
export declare const NOTES_MARK = "REFERENCE NOTES";
/** Standards bodies and specs that count as official for the terms above (added to the harness's list of official documentation sites). */
export declare const ENRICH_DOMAINS: string[];
/** The paragraph of a documentation page that explains the thing, in plain words (skips titles, banners, link lists). Prefers one that names the term. */
export declare function firstParagraph(text: string, term?: string): string;
export declare function termsIn(c: Pick<Card, "title" | "body" | "acceptance">): Term[];
export interface EnrichResult {
    cards: number;
    notes: number;
    terms: number;
    looked_up: number;
    failed: string[];
    skipped?: string;
}
export declare function enrichBoard(rt: Runtime, o?: {
    board?: string;
    fetcher?: Fetcher;
    onProgress?: (m: string) => void;
    signal?: AbortSignal;
    maxTermsPerCard?: number;
}): Promise<EnrichResult>;
export declare function describeEnrich(r: EnrichResult): string;

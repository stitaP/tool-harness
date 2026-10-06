export declare const newId: (prefix?: string) => string;
/** Short random id (no timestamp prefix, so ids made in the same millisecond never collide). */
export declare const shortId: (prefix?: string, bytes?: number) => string;
export declare const sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
export declare function abortError(msg?: string): Error;
export declare const isAbort: (e: any) => boolean;
/** Rough token estimate (chars/4) — good enough for budgeting and compression triggers. */
export declare function estimateTokens(text: string | null | undefined): number;
/** Keep head and tail of a long string, marking the omitted middle. */
export declare function truncateMiddle(s: string, max: number, note?: string): string;
export declare const sha1: (s: string) => string;
export declare function nowIso(): string;
/** Parse "90s", "10m", "2h", "1d" → milliseconds. */
export declare function parseDuration(s: string): number | null;
export declare function fmtDuration(ms: number): string;
/** Split a command line respecting quotes (for slash command args). */
export declare function splitArgs(s: string): string[];
/** Levenshtein distance for fuzzy tool-name repair. */
export declare function editDistance(a: string, b: string): number;
export declare function safeJson(v: any): string;
export declare function errMsg(e: any): string;
export declare function deepMerge<T>(base: T, over: any): T;
export declare function getPath(obj: any, path: string): any;
export declare function setPath(obj: any, path: string, value: any): void;

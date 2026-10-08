/**
 * Benchmark recorder: every model call and every finished goal is folded into small per-day aggregates
 * (model × tool profile × prompt-size bucket), kept in the state db. It answers "is the 30B worth its slower
 * prompt?" and "what does the speed do as the context fills?" from real use, without keeping a row per call.
 */
import type { Runtime } from "./runtime.js";
export interface BenchRow {
    day: string;
    model: string;
    profile: string;
    bucket: string;
    calls: number;
    gen_tokens: number;
    gen_ms: number;
    prompt_tokens: number;
    prompt_ms: number;
    input_tokens: number;
    cache_tokens: number;
    min_tps: number;
    max_tps: number;
    goals_done: number;
    goals_paused: number;
}
export declare const BUCKETS: readonly ["<4K", "4-16K", "16-64K", ">64K"];
export declare const bucketOf: (inputTokens: number) => "<4K" | "4-16K" | "16-64K" | ">64K";
export declare class BenchRecorder {
    private rt;
    constructor(rt: Runtime);
    private profile;
    private row;
    private save;
    private call;
    private goal;
    rows(days: number): BenchRow[];
}
export interface BenchSummary {
    model: string;
    profile: string;
    calls: number;
    gen_tps: number | null;
    prompt_tps: number | null;
    cache_hit: number | null;
    goals_done: number;
    goals_paused: number;
    by_bucket: {
        bucket: string;
        calls: number;
        gen_tps: number | null;
    }[];
}
export declare function summarize(rows: BenchRow[]): BenchSummary[];
export declare function benchText(rows: BenchRow[], days: number): string;

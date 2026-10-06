/**
 * "Keep working until done":
 *  - /goal       standing objective; an auxiliary judge checks each turn and the
 *                runtime auto-continues until done / paused / budget spent
 *  - /loop       re-run a prompt on an interval or back-to-back, until LOOP_COMPLETE,
 *                --times N, or an --until condition judged true
 *  - /heartbeat  idle-only periodic check-in for this session
 * State lives in state_meta so it survives restarts.
 */
import type { Runtime } from "../runtime/runtime.js";
export interface GoalState {
    text: string;
    contract?: string;
    status: "active" | "paused" | "done" | "failed";
    turns: number;
    max_turns: number;
    last_reason?: string;
    created_at: number;
}
export interface LoopState {
    prompt: string;
    mode: "interval" | "dynamic";
    interval_ms: number;
    times?: number;
    until?: string;
    ticks: number;
    max_ticks: number;
    next_at: number;
    status: "active" | "paused" | "done";
    last_reason?: string;
}
export interface HeartbeatState {
    prompt: string;
    interval_ms: number;
    next_at: number;
    status: "active" | "paused";
    fires: number;
}
export declare const goalKey: (sid: string) => string;
export declare const loopKey: (sid: string) => string;
export declare const heartbeatKey: (sid: string) => string;
export declare function judge(rt: Runtime, sid: string, objective: string, contract: string | undefined, lastReply: string, kind: "goal" | "condition"): Promise<{
    done: boolean;
    impossible: boolean;
    reason: string;
}>;
export declare function draftContract(rt: Runtime, objective: string): Promise<string>;
export declare function continuationPrompt(g: GoalState, plan?: string | null): string;
export declare function loopPrompt(l: LoopState): string;
export declare function heartbeatPrompt(h: HeartbeatState): string;
/** Called after each completed turn. Returns a follow-up prompt to enqueue, if any. */
export declare function afterTurn(rt: Runtime, sid: string, final: string, info: {
    interrupted: boolean;
    error?: string;
    source: string;
}): Promise<{
    prompt: string;
    kind: string;
} | null>;

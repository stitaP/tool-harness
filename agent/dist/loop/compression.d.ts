/**
 * Context compression: when the conversation approaches the model's context
 * window, summarize the middle with the auxiliary model and keep the tail
 * verbatim. Originals are archived (still searchable), never deleted.
 */
import type { Msg } from "../state/db.js";
import type { Runtime } from "../runtime/runtime.js";
export declare function estimateMessages(msgs: Msg[]): number;
/**
 * Facts re-attached after every compaction, straight from state (like Claude Code re-attaching todos and recent files):
 * the plan, the standing goal, files touched and the working directory survive however lossy the summary is.
 */
export declare function stateBlock(rt: Runtime, sessionId: string, middle: Msg[]): string;
export declare function compressSession(rt: Runtime, sessionId: string, opts?: {
    signal?: AbortSignal;
    reason?: string;
    focus?: string;
}): Promise<{
    ok: boolean;
    before: number;
    after: number;
    note: string;
}>;

/**
 * Curator: background review after complex turns. Extracts durable memory and,
 * when a reusable procedure emerged, writes (or proposes) a skill — the
 * closed learning loop. Runs on the auxiliary model; never blocks the user.
 */
import type { Runtime } from "../runtime/runtime.js";
export declare function curate(rt: Runtime, sid: string): Promise<{
    memory: number;
    skill?: string;
} | null>;

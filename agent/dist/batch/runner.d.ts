import type { Runtime } from "../runtime/runtime.js";
export declare function runBatch(rt: Runtime, input: string, out: string, opts?: {
    concurrency?: number;
    approvalMode?: string;
    onProgress?: (done: number, total: number) => void;
}): Promise<{
    ok: number;
    failed: number;
}>;

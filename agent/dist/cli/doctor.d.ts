import type { Runtime } from "../runtime/runtime.js";
export declare function doctor(rt: Runtime, opts?: {
    quick?: boolean;
}): Promise<number>;

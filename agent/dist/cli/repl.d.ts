import type { Runtime } from "../runtime/runtime.js";
export declare function repl(rt: Runtime, opts: {
    sessionId?: string;
    yolo?: boolean;
}): Promise<void>;

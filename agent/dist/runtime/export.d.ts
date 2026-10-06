import type { Runtime } from "./runtime.js";
import type { Msg } from "../state/db.js";
export declare function toShareGPT(system: string, msgs: Msg[]): {
    conversations: {
        from: string;
        value: string;
    }[];
};
export declare function exportSession(rt: Runtime, sid: string, fmt?: "md" | "json" | "sharegpt", path?: string): string;

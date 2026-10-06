import type { ToolContext } from "../tools/types.js";
import type { Runtime } from "./runtime.js";
type Args = Record<string, unknown>;
/** Returns a reason when a store call needs human approval, else null. */
export declare function storeApprovalReason(id: string, a: Args): string | null;
interface StoreTool {
    id: string;
    name: string;
    category: string;
    description: string;
    tags: string[];
    executable: boolean;
    parameters: {
        name: string;
        type: string;
        description: string;
        required: boolean;
        enum?: string[];
    }[];
}
/**
 * Names used in AGENTS.md / CAR-framework docs → the Tool Store ids that implement them. An array means the name covers
 * several tools (the caller is told to pick one). Keeps documented names working even though the store uses dotted ids.
 */
export declare const STORE_ALIASES: Record<string, string | string[]>;
export declare class StoreBridge {
    private enabled;
    private customPath;
    private rt?;
    private mod;
    private tools;
    private loading;
    error: string | null;
    constructor(enabled: () => boolean, customPath: () => string, rt?: Runtime | undefined);
    /** Install the agent's secrets, model and capabilities into the store. */
    private installHooks;
    private defaultPath;
    load(): Promise<void>;
    get count(): {
        total: number;
        executable: number;
    };
    search(query: string, n: number): Promise<{
        id: string;
        category: string;
        description: string;
        params: string;
    }[]>;
    list(): StoreTool[];
    call(id: string, args: Record<string, unknown>, ctx?: Pick<ToolContext, "requestApproval">): Promise<string>;
    /** Close store-owned browsers (called on shutdown). */
    close(): Promise<void>;
}
export {};

import type { Runtime } from "../runtime/runtime.js";
export interface TurnOptions {
    sessionId: string;
    userText: string | null;
    images?: string[];
    signal: AbortSignal;
    depth?: number;
    allowedTools?: Set<string>;
    budget?: {
        remaining: number;
    };
    maxIterations?: number;
    headlessApproval?: string;
    takeSteer?: () => string | null;
    clarify?: (q: string, choices?: string[]) => Promise<string | null>;
    userMeta?: Record<string, any>;
    noTools?: boolean;
}
export interface TurnResult {
    final: string;
    iterations: number;
    toolCalls: number;
    toolNames: string[];
    interrupted: boolean;
    error?: string;
    usage: {
        input: number;
        output: number;
    };
    budgetExhausted?: boolean;
    /** the final text was already shown earlier in this turn (clients should not render it again) */
    repeatedFinal?: boolean;
}
/**
 * max_tokens for one model call: whatever the context window has left after the prompt (minus a 5% margin for
 * estimate error), capped by `model.max_output_tokens` when it is > 0 (0 = auto, limited only by the context) and by
 * the provider's own output ceiling. Never below 512, so a nearly full window still gets a usable reply.
 */
export declare function outputBudget(contextWindow: number, promptTokens: number, cap: number, ceiling?: number): number;
export declare function runTurn(rt: Runtime, o: TurnOptions): Promise<TurnResult>;
/** Make the stored history valid again after an interruption or crash. */
export declare function repairDangling(rt: Runtime, sid: string, closing: string): void;

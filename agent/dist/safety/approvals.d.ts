import type { ApprovalRequest } from "../tools/types.js";
export type Decision = "once" | "session" | "always" | "deny";
export interface Pending extends ApprovalRequest {
    id: string;
    createdAt: number;
    resolve: (d: Decision) => void;
}
export declare class ApprovalManager {
    private getMode;
    private getAllowPatterns;
    private persistAllow;
    private onRequest;
    private timeoutMs;
    /** every decision a person made (for /fewer-permission-prompts) */
    private onDecision?;
    pending: Map<string, Pending>;
    private sessionAllow;
    yoloSessions: Set<string>;
    constructor(getMode: () => string, getAllowPatterns: () => string[], persistAllow: (pattern: string) => void, onRequest: (p: Omit<Pending, "resolve">) => void, timeoutMs: () => number, 
    /** every decision a person made (for /fewer-permission-prompts) */
    onDecision?: ((req: ApprovalRequest, d: Decision) => void) | undefined);
    /** Returns true when the action may proceed. */
    check(req: ApprovalRequest, opts?: {
        headlessMode?: string;
    }): Promise<boolean>;
    respond(id: string, d: Decision): boolean;
    /** Answer the oldest pending request for a session (used by /approve, /deny). */
    respondLatest(sessionId: string, d: Decision): boolean;
    cancelSession(sessionId: string): void;
    /** Commands and tools approved for the rest of this session ("session" answers). */
    sessionAllowed(sessionId: string): string[];
    list(sessionId?: string): {
        id: string;
        createdAt: number;
        tool: string;
        command: string;
        reason: string;
        sessionId: string;
    }[];
}

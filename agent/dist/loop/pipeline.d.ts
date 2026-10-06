import type { Runtime } from "../runtime/runtime.js";
import { type Tool } from "../tools/types.js";
export interface PipelineItem {
    name: string;
    path: string;
    prompt: string;
    check?: string;
    status: "pending" | "running" | "done" | "stuck";
    /** checks of earlier documents in the same folder (lower number): they must keep passing (regression gate) */
    regress?: {
        name: string;
        check: string;
    }[];
    attempts: number;
    sessionId?: string;
    startedAt?: number;
    finishedAt?: number;
    note?: string;
    checkOutput?: string;
}
export interface PipelineState {
    originSid: string;
    cwd: string;
    items: PipelineItem[];
    status: "active" | "paused" | "done" | "stopped";
    createdAt: number;
    maxTurns: number;
    timeoutMin: number;
    maxAttempts: number;
    retriedStuck: boolean;
    report?: string;
    reportFile?: string;
}
export declare const pipelineKey: (sid: string) => string;
/** "phase-*.md" style globs (`*` and `?` within the last path segment), resolved against `cwd`, sorted naturally. */
export declare function expandDocs(cwd: string, args: string[]): string[];
export declare function filterRange(paths: string[], from?: number, to?: number): string[];
/** The doc's own test command, e.g. `**Test:** \`node --test tests/phase-07.test.js\`` → that command. */
export declare function docCheck(text: string): string | undefined;
/** The doc's ready-made agent prompt (a "## … prompt" section of `>` quote lines), if any. */
export declare function docPrompt(text: string): string | undefined;
/** Earlier documents' checks (same folder, lower number, with a **Test:** line): "Done when … `npm test` is green". */
export declare function regressionChecks(path: string): {
    name: string;
    check: string;
}[];
export declare function buildItem(path: string, cwd: string, checkTpl?: string): PipelineItem;
export declare class PipelineRunner {
    private rt;
    private running;
    constructor(rt: Runtime);
    get(sid: string): PipelineState | null;
    /** Every pipeline, newest first. */
    list(): PipelineState[];
    /** The pipeline a command in chat `sid` means: this chat's own while it runs, else the one running elsewhere
     * (a pipeline is easy to lose: its chat may be closed or cleared), else this chat's finished one. */
    find(sid: string): {
        state: PipelineState;
        elsewhere: boolean;
    } | {
        ambiguous: PipelineState[];
    } | null;
    describe(s: PipelineState): string;
    /** A one-line progress note kept in the origin chat, so the run stays visible after reloads. */
    private note;
    private save;
    start(originSid: string, cwd: string, paths: string[], opts?: {
        check?: string;
        maxTurns?: number;
        timeoutMin?: number;
        maxAttempts?: number;
    }): PipelineState;
    /** Called by the runtime's background ticker and after start/resume: drive every active pipeline. */
    tick(): Promise<void>;
    setStatus(sid: string, status: PipelineState["status"]): PipelineState | null;
    /** Give up on the running document now and move to the next one. */
    skip(sid: string): string;
    private run;
    private runItem;
    /** page → renders fine, for a static site in `cwd`; null when there are no pages or no browser to check with. */
    private pageStates;
    /** The origin chat's plan: one phase per document, containing that document's own todo items (cumulative). */
    syncPlan(s: PipelineState): void;
    report(s: PipelineState): string;
    private finish;
    /** Put stuck documents back in the queue and continue. */
    retry(sid: string): PipelineState | null;
}
/** Lets the agent itself start and manage a pipeline when the user asks in plain words ("run phases 6 to 20 one by one"). */
export declare const pipelineTool: Tool;

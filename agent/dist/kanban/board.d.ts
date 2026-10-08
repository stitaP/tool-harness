import type { Runtime } from "../runtime/runtime.js";
import { type Tool } from "../tools/types.js";
import type { Step } from "../tools/webtest.js";
export type CardStatus = "backlog" | "ready" | "running" | "review" | "blocked" | "done";
export type CardType = "epic" | "task" | "bug";
export interface CardComment {
    id?: string;
    at: number;
    by: string;
    text: string;
    reply_to?: string;
}
export interface CardCommit {
    hash: string;
    message: string;
    at: number;
}
export interface StatusChange {
    at: number;
    from: CardStatus | null;
    to: CardStatus;
    by: string;
    reason?: string;
}
export interface TestResult {
    at: number;
    cmd: string;
    code: number;
    output: string;
}
export interface Card {
    id: string;
    title: string;
    body: string;
    status: CardStatus;
    priority: number;
    depends_on: string[];
    review: boolean;
    comments: CardComment[];
    session_id?: string;
    result?: string;
    created_at: number;
    updated_at: number;
    attempts: number;
    key?: string;
    type?: CardType;
    parent?: string;
    links?: string[];
    acceptance?: string[];
    test_cmd?: string;
    test_result?: TestResult;
    spec?: string;
    cwd?: string;
    functional?: Step[];
    kind?: "tests" | "story" | "gate";
    section?: string;
    files?: string[];
    exports?: Record<string, string[]>;
    order?: number;
    verification?: {
        at: number;
        ok: boolean;
        report: string;
        shots: number;
    };
    branch?: string;
    checkpoint?: {
        head: string;
        stash?: string;
        at: number;
    };
    commits?: CardCommit[];
    history?: StatusChange[];
}
export type NewCard = {
    title: string;
    body?: string;
    priority?: number;
    depends_on?: string[];
    status?: CardStatus;
    review?: boolean;
    type?: CardType;
    parent?: string;
    links?: string[];
    acceptance?: string[];
    test_cmd?: string;
    spec?: string;
    cwd?: string;
    functional?: Step[];
    key_prefix?: string;
    kind?: Card["kind"];
    section?: string;
    files?: string[];
    exports?: Record<string, string[]>;
    order?: number;
};
export declare class KanbanBoard {
    private rt;
    private active;
    constructor(rt: Runtime);
    isActive(id: string): boolean;
    private get cfg();
    list(status?: CardStatus): Card[];
    /** Look a card up by id or by key (PT-12, case-insensitive). */
    get(ref: string): Card | null;
    private need;
    private save;
    private nextKey;
    create(p: NewCard): Card;
    update(ref: string, patch: Partial<Card>, meta?: {
        by?: string;
        reason?: string;
    }): Card;
    comment(ref: string, text: string, by?: string, reply_to?: string): Card;
    /** Delete a card that has not been worked (used when a plan is re-imported in more detail). */
    remove(ref: string): boolean;
    /** An epic is running while any child runs/is ready, blocked if a child is, done when all children are done. */
    private rollup;
    cwdOf(c: Card): string;
    private gitDir;
    /** Record a commit on the card (idempotent on hash). */
    linkCommit(ref: string, commit: {
        hash: string;
        message?: string;
    }): Card;
    /** Find commits whose message starts with the card key and link them. Returns the number of new links. */
    syncCommits(ref: string): Promise<number>;
    beginGit(c: Card): Promise<void>;
    endGit(c: Card): Promise<void>;
    private missingTestFiles;
    /** Run the card's test command. The result is stored on the card. */
    runTests(ref: string): Promise<TestResult>;
    /** Move a card to done only if its tests pass. */
    complete(ref: string, by?: string): Promise<{
        card: Card;
        passed: boolean;
        detail: string;
    }>;
    /** Browser verification runs at the phase gate (and for hand-made cards with a spec), not after every story of a phase. */
    private wantsVerification;
    /** Full phase verification (built, unit, navigate, screenshots, functional, regression). Evidence is stored on the card. */
    verify(ref: string): Promise<import("./verify.js").VerifyReport>;
    /** Write tests/verify/<phase>.verify.test.mjs from the card's spec. */
    genTests(ref: string): string;
    /** Re-run tests for done cards; a failure reopens the card and files a linked bug. */
    regression(ref?: string): Promise<string>;
    ready(): Card[];
    /** Put cards that were left running by a crash or power cut back on the queue. */
    recover(): Card[];
    tick(): Promise<number>;
    private buildPrompt;
    work(ref: string): Promise<Card>;
    fmt(c: Card): string;
    show(ref: string): string;
    board(): string;
    report(): string;
}
export declare const kanbanTool: Tool;

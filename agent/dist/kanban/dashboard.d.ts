import type { Runtime } from "../runtime/runtime.js";
import type { CardStatus } from "./board.js";
/** What the worker agent has been doing: its last few messages and tool calls. */
export declare function activity(rt: Runtime, sessionId?: string, n?: number): {
    at: number;
    role: string;
    text: string;
    tools: string[];
}[];
export declare function boardSummary(rt: Runtime, boardRef?: string): {
    now: number;
    board: {
        id: string;
        name: string;
        archived: boolean;
        active: boolean;
        description: string;
    };
    boards: (import("./boards.js").BoardInfo & {
        cards: number;
        done: number;
        active: boolean;
    })[];
    enabled: boolean;
    workers: number;
    counts: {
        [k: string]: number;
    };
    total: number;
    epics: {
        key: string;
        title: string;
        status: CardStatus;
        total: number;
        done: number;
        running: number;
        blocked: number;
        review: number;
        waiting: number;
        ready: number;
    }[];
    cards: {
        id: string;
        key: string;
        type: import("./board.js").CardType;
        kind: "tests" | "gate" | "story" | null;
        section: string | null;
        title: string;
        status: CardStatus;
        display: string;
        waits_on: string[];
        parent: string | null;
        priority: number;
        attempts: number;
        criteria: number;
        cases: number;
        summary: string;
        depends_on: string[];
        updated_at: number;
        created_at: number;
        session_id: string | null;
        active: boolean;
        commits: number;
        comments: number;
        test: {
            code: number;
            at: number;
        } | null;
        has_test: boolean;
        verification: {
            ok: boolean;
            at: number;
            shots: number;
        } | null;
    }[];
    working: {
        key: string;
        title: string;
        active: boolean;
        attempts: number;
        session_id: string | null;
        activity: {
            at: number;
            role: string;
            text: string;
            tools: string[];
        }[];
    }[];
    recent: {
        key: string;
        title: string;
        at: number;
        from: CardStatus | null;
        to: CardStatus;
        by: string;
        reason?: string;
    }[];
};
export declare function cardDetail(rt: Runtime, ref: string): {
    board_info: {
        id: string;
        name: string;
        archived: boolean;
        active: boolean;
    } | null;
    links_view: import("./boards.js").LinkView[];
    depends_on_keys: string[];
    active: boolean;
    activity: {
        at: number;
        role: string;
        text: string;
        tools: string[];
    }[];
    cwd_resolved: string;
    evidence: {
        dir: string;
        shots: string[];
        other: string[];
    };
    report: string | null;
    children: {
        key: string | undefined;
        title: string;
        status: CardStatus;
        kind: "tests" | "gate" | "story" | null;
    }[];
    parent_card: {
        key: string | undefined;
        title: string;
    } | null;
    siblings: (string | undefined)[];
    waits_on: string[];
    dependents: {
        key: string | undefined;
        title: string;
        status: CardStatus;
    }[];
    id: string;
    title: string;
    body: string;
    status: CardStatus;
    priority: number;
    depends_on: string[];
    review: boolean;
    comments: import("./board.js").CardComment[];
    session_id?: string;
    result?: string;
    created_at: number;
    updated_at: number;
    attempts: number;
    key?: string;
    type?: import("./board.js").CardType;
    parent?: string;
    links?: string[];
    acceptance?: string[];
    test_cmd?: string;
    test_result?: import("./board.js").TestResult;
    spec?: string;
    cwd?: string;
    functional?: import("../tools/webtest.js").Step[];
    board?: string;
    refs?: import("./boards.js").CardRef[];
    summary?: string;
    test_cases?: string[];
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
    commits?: import("./board.js").CardCommit[];
    history?: import("./board.js").StatusChange[];
} | null;
/** A file under a card's evidence folder. Path traversal and unknown types are refused. */
export declare function evidenceFile(rt: Runtime, ref: string, rel: string): {
    data: Buffer;
    type: string;
} | null;

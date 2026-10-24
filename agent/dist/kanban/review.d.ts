/**
 * Story review from the Kanban tab (made for a phone): every epic with its stories, a tick per story to approve it
 * (backlog → ready; untick puts it back), comments per story and per epic, and "apply my comments", which starts a chat
 * that rewrites the commented tickets and answers each comment. Open feedback = a person's comment nobody answered yet.
 */
import type { Card, CardComment } from "./board.js";
import type { Runtime } from "../runtime/runtime.js";
/** A person's comments that have no answer (a reply to them) yet. */
export declare const openFeedback: (c: Card) => CardComment[];
export declare function reviewData(rt: Runtime, boardRef?: string): {
    board: {
        id: string;
        name: string;
        draft: boolean;
        design: string;
        active: boolean;
    };
    boards: {
        id: string;
        name: string;
        draft: boolean;
        cards: number;
    }[];
    epics: {
        stories: {
            key: string;
            title: string;
            status: import("./board.js").CardStatus;
            approved: boolean;
            locked: boolean;
            summary: string;
            body: string;
            acceptance: string[];
            test_cases: string[];
            flags: string[];
            comments: {
                id: string | undefined;
                by: string;
                text: string;
                at: number;
                reply_to: string | null;
            }[];
            open: number;
        }[];
        key: string;
        title: string;
        status: import("./board.js").CardStatus;
        approved: boolean;
        locked: boolean;
        summary: string;
        body: string;
        acceptance: string[];
        test_cases: string[];
        flags: string[];
        comments: {
            id: string | undefined;
            by: string;
            text: string;
            at: number;
            reply_to: string | null;
        }[];
        open: number;
    }[];
    counts: {
        stories: number;
        approved: number;
        flagged: number;
        open: number;
    };
};
/** Approve (backlog → ready) or un-approve (ready → backlog) stories; started work is left alone. */
export declare function setApproval(rt: Runtime, boardRef: string, keys: string[], approve: boolean): {
    changed: string[];
    board: string;
};
/** Start a chat that rewrites the tickets with open feedback and answers each comment; returns its session id. */
export declare function applyFeedback(rt: Runtime, boardRef: string): Promise<{
    session: string;
    tickets: number;
}>;

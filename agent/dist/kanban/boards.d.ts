import type { Runtime } from "../runtime/runtime.js";
import type { Card, KanbanBoard } from "./board.js";
export interface BoardInfo {
    id: string;
    name: string;
    description?: string;
    created_at: number;
    archived?: boolean;
    archived_at?: number;
}
export type LinkType = "relates to" | "blocks" | "is blocked by" | "duplicates" | "clones";
export declare const LINK_TYPES: LinkType[];
export declare const LINK_INVERSE: Record<LinkType, string>;
export interface CardRef {
    key: string;
    type: LinkType;
    at: number;
    pending?: boolean;
}
export interface LinkView {
    type: string;
    direction: "out" | "in";
    key: string;
    title: string;
    status: string;
    board: string | null;
    boardName: string | null;
    pending: boolean;
}
export declare function normalizeLinkType(t: string): LinkType;
export declare class Boards {
    private rt;
    private K;
    private inited;
    constructor(rt: Runtime, K: KanbanBoard);
    private get home();
    private cards;
    private putCard;
    private all;
    /** Make sure a default board exists and that every ticket belongs to a board (tickets made before boards existed are adopted). */
    private ensure;
    activeId(): string;
    active(): BoardInfo;
    get(ref: string): BoardInfo | null;
    private need;
    list(o?: {
        archived?: boolean | "all";
    }): (BoardInfo & {
        cards: number;
        done: number;
        active: boolean;
    })[];
    create(name: string, description?: string): BoardInfo;
    /** Make a board the active one: what the UI shows, what import fills and what the workers serve. */
    use(ref: string): BoardInfo;
    rename(ref: string, name: string): BoardInfo;
    archive(ref: string): BoardInfo;
    unarchive(ref: string): BoardInfo;
    private snapshot;
    /** Write the board to a JSON file (default: <home>/kanban/saved/<name>.json). The board itself stays where it is. */
    save(ref: string, file?: string): string;
    /** Load a saved board file as a NEW board. Ticket ids are always new; keys are kept unless they clash, then renumbered. */
    restore(file: string, name?: string): BoardInfo;
    private nextFree;
    /** Remove every ticket of a board. A snapshot is written first (restore it to undo). */
    clear(ref: string, o?: {
        snapshot?: boolean;
    }): {
        removed: number;
        snapshot?: string;
    };
    /** Permanently delete a board and its tickets (snapshot first). */
    delete(ref: string): {
        removed: number;
        snapshot?: string;
    };
    /** Move tickets to another board. An epic takes its tickets with it. Dependencies and links keep working across boards. */
    move(refs: string[], toRef: string): number;
    /** Link a ticket to another, on any board. `to` may be a key that does not exist yet (kept pending until it appears). */
    link(fromRef: string, typeIn: string, toRef: string): CardRef;
    unlink(fromRef: string, toRef: string, typeIn?: string): number;
    /** "is blocked by" / "blocks" are real scheduling dependencies. */
    private applyBlocking;
    private releaseBlocking;
    /** A new ticket may be the target of links made earlier to its (then unknown) key. */
    resolvePending(created: Card): void;
    /** Outgoing links of a ticket plus links other tickets (on any board) make to it. */
    linksOf(card: Card): LinkView[];
}

import type { Runtime } from "../runtime/runtime.js";
import type { Card, KanbanBoard } from "./board.js";
export interface BoardInfo {
    id: string;
    name: string;
    description?: string;
    created_at: number;
    archived?: boolean;
    archived_at?: number;
    /** made from a design document and not approved yet: its tickets wait in backlog for review */
    draft?: boolean;
    design?: string;
    project?: string;
    approved_at?: number;
    /** the project (projects.ts) this board belongs to; `project` above is the board's own folder */
    project_id?: string;
    archived_by_project?: boolean;
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
    create(name: string, description?: string, project?: string): BoardInfo;
    /** A board whose folder lies inside a project's folder joins that project (when it is in none yet). */
    private autoAttach;
    /** Change a board: name, description, folder ("" removes it) and project (project name or id, "" takes it out). */
    update(ref: string, patch: {
        name?: string;
        description?: string;
        project?: string;
        project_id?: string;
    }): BoardInfo;
    /** One board in text: project, folder, description, tickets per status. */
    show(ref: string): string;
    /** Set (or with "" remove) the project folder a board's tickets are worked in. */
    setProject(ref: string, project: string): BoardInfo;
    /** The project folder of the board a ticket is on, if that board has one. */
    projectOf(boardId?: string): string | undefined;
    /** Mark a board as a draft made from a design (or clear the mark). */
    setDraft(ref: string, d: {
        draft: boolean;
        design?: string;
        project?: string;
    }): BoardInfo;
    /**
     * The reviewer's go-ahead: backlog tickets of the board (all, or only `keys`) move to "ready", the board stops being a draft
     * once every ticket is approved, and it becomes the active board so the workers serve it. Epics stay as they are (they roll up).
     */
    approve(ref: string, o?: {
        keys?: string[];
        use?: boolean;
    }): {
        board: BoardInfo;
        approved: string[];
    };
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

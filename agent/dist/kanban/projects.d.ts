import type { Runtime } from "../runtime/runtime.js";
import type { BoardInfo } from "./boards.js";
import type { KanbanBoard } from "./board.js";
export interface ProjectFolder {
    name: string;
    path: string;
    primary?: boolean;
    note?: string;
}
export interface ProjectInfo {
    id: string;
    name: string;
    description?: string;
    folders: ProjectFolder[];
    created_at: number;
    updated_at?: number;
    archived?: boolean;
    archived_at?: number;
}
export type ProjectView = ProjectInfo & {
    boards: {
        id: string;
        name: string;
        archived: boolean;
        active: boolean;
        cards: number;
        done: number;
    }[];
    cards: number;
    done: number;
    active: boolean;
};
export declare const folderPath: (p: string) => string;
export declare class Projects {
    private rt;
    private K;
    constructor(rt: Runtime, K: KanbanBoard);
    private all;
    private put;
    private boardsRaw;
    private putBoard;
    get(ref: string): ProjectInfo | null;
    need(ref: string): ProjectInfo;
    /** Every project with its boards and progress. Archived ones only with archived: true / "all". */
    list(o?: {
        archived?: boolean | "all";
    }): ProjectView[];
    private view;
    /** The project of the active board, if it has one. */
    active(): ProjectInfo | null;
    /** The project a board belongs to. */
    ofBoard(boardId?: string): ProjectInfo | null;
    /** The project that owns a path (the one with the deepest folder containing it). */
    forPath(path: string): ProjectInfo | null;
    create(name: string, o?: {
        description?: string;
        folders?: {
            name: string;
            path: string;
            primary?: boolean;
            note?: string;
        }[];
        boards?: string[];
    }): ProjectInfo;
    update(ref: string, patch: {
        name?: string;
        description?: string;
    }): ProjectInfo;
    private withFolder;
    addFolder(ref: string, f: {
        name: string;
        path: string;
        primary?: boolean;
        note?: string;
    }): ProjectInfo;
    updateFolder(ref: string, name: string, patch: {
        path?: string;
        new_name?: string;
        primary?: boolean;
        note?: string;
    }): ProjectInfo;
    /** Remove a folder from the project (the folder on disk stays). Refused while tickets still name it. */
    removeFolder(ref: string, name: string): ProjectInfo;
    private folderOf;
    primary(p: ProjectInfo | null): ProjectFolder | undefined;
    /** Path of a named folder of the project a board belongs to (undefined when either is missing). */
    folderFor(boardId: string | undefined, name: string | undefined): string | undefined;
    /** Check a ticket's folder name against its board's project; returns the canonical name. */
    checkFolder(boardId: string | undefined, name: string): string;
    /** Put a board in a project (projectRef "" takes it out). */
    attach(boardRef: string, projectRef: string): BoardInfo;
    /** Make a project active: open its active board, else its newest unarchived board, else a new board named after it. */
    use(ref: string): {
        project: ProjectInfo;
        board: BoardInfo;
    };
    archive(ref: string): ProjectInfo;
    unarchive(ref: string): ProjectInfo;
    /** Delete the project record. Its boards stay (unassigned) unless deleteBoards, which deletes each with a snapshot. */
    delete(ref: string, o?: {
        deleteBoards?: boolean;
    }): {
        boards: string[];
        snapshots: string[];
    };
    private cardsOf;
    show(ref: string): string;
    describe(): string;
}

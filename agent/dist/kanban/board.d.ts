/**
 * Kanban board: many tasks with dependencies, dispatched to worker sessions.
 * A worker runs each card in goal mode (judge-verified completion).
 */
import type { Runtime } from "../runtime/runtime.js";
import { type Tool } from "../tools/types.js";
export type CardStatus = "backlog" | "ready" | "running" | "review" | "blocked" | "done";
export interface Card {
    id: string;
    title: string;
    body: string;
    status: CardStatus;
    priority: number;
    depends_on: string[];
    review: boolean;
    comments: {
        at: number;
        by: string;
        text: string;
    }[];
    session_id?: string;
    result?: string;
    created_at: number;
    updated_at: number;
    attempts: number;
}
export declare class KanbanBoard {
    private rt;
    private active;
    constructor(rt: Runtime);
    list(status?: CardStatus): Card[];
    get(id: string): Card | null;
    private save;
    create(p: {
        title: string;
        body?: string;
        priority?: number;
        depends_on?: string[];
        status?: CardStatus;
        review?: boolean;
    }): Card;
    update(id: string, patch: Partial<Card>): Card;
    comment(id: string, text: string, by?: string): Card;
    ready(): Card[];
    tick(): Promise<number>;
    work(id: string): Promise<Card>;
}
export declare const kanbanTool: Tool;

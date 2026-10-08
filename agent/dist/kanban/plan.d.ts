import type { KanbanBoard } from "./board.js";
export interface Section {
    num: number;
    title: string;
    heading: string;
    level: number;
    body: string;
}
/** Numbered sections of a phase spec. The level of the first numbered heading decides which headings are stories. */
export declare function parseSections(md: string): Section[];
/** Acceptance criteria for a section: its list items and rule sentences, capped, with exports and files first. */
export declare function sectionAcceptance(sec: Section, manifest: {
    files: string[];
    exports: Record<string, string[]>;
}): string[];
export declare function importPlan(board: KanbanBoard, o: {
    planDir: string;
    projectDir?: string;
    testsDir?: string;
    keyPrefix?: string;
    split?: boolean;
}): string;

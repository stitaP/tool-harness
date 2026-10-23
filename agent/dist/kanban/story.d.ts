import type { Section } from "./plan.js";
export interface StoryInput {
    num: string;
    phaseShort: string;
    goal: string;
    spec: string;
    sec: Section;
    manifest: {
        files: string[];
        exports: Record<string, string[]>;
    };
    contextDocs: string[];
    /** files already promised by other tickets on the board: file → ticket key */
    made: Map<string, string>;
    total: number;
    index: number;
}
export interface Story {
    title: string;
    summary: string;
    body: string;
    acceptance: string[];
    testCases: string[];
}
interface Row {
    sig: string;
    name: string;
    says: string;
}
export declare function tableRows(body: string): Row[];
/** Official documentation to read for the languages and APIs a piece of work uses. */
export declare function researchFor(files: string[], text: string, kind?: "story" | "tests"): string[];
export declare function buildStory(i: StoryInput): Story;
export {};

import type { Runtime } from "../runtime/runtime.js";
import type { ChatRequest } from "../providers/types.js";
import { type Hit } from "../tools/web.js";
export interface DesignSource {
    title: string;
    markdown: string;
    origin: string;
    files: string[];
}
export interface Chunk {
    index: number;
    heading: string;
    text: string;
}
export interface ChunkNotes {
    index: number;
    heading: string;
    summary: string;
    goals: string[];
    components: {
        name: string;
        purpose: string;
    }[];
    requirements: string[];
    constraints: string[];
    technologies: string[];
    unknowns: string[];
}
export interface EpicPlan {
    id: string;
    title: string;
    goal: string;
    sections: number[];
}
export interface Overview {
    title: string;
    summary: string;
    stack: string[];
    test_strategy: string;
    epics: EpicPlan[];
}
export interface Question {
    q: string;
    why: string;
    query: string;
}
export interface Finding {
    question: string;
    query: string;
    answer: string;
    facts: string[];
    sources: {
        title: string;
        url: string;
    }[];
    searchedWith: string;
    failed?: string;
}
export interface StoryPlan {
    id: string;
    epic: string;
    title: string;
    what: string;
    why: string;
    depends_on: string[];
    files: string[];
    steps: string[];
    acceptance: string[];
    test_cases: string[];
    check_cmd: string;
    references: string[];
    undo: string;
    size: string;
}
export interface DesignProgress {
    stage: "read" | "outline" | "research" | "plan" | "review" | "board" | "done" | "error";
    message: string;
    done?: number;
    total?: number;
    at: number;
}
export interface DesignResult {
    board: {
        id: string;
        name: string;
    };
    epics: number;
    stories: number;
    findings: number;
    dir: string;
    report: string;
    gaps: string[];
    keys: string[];
}
/** What the pipeline needs from the outside world; tests pass fakes. */
export interface DesignDeps {
    chat: (req: ChatRequest) => Promise<{
        content: string;
    }>;
    search: (q: string) => Promise<{
        hits: Hit[];
        source: string;
        errors: string[];
    }>;
    extract: (url: string, maxChars: number) => Promise<string>;
    contextWindow: number;
}
export interface DesignOptions {
    source: string;
    project: string;
    board?: string;
    keyPrefix?: string;
    research?: boolean;
    maxSearches?: number;
    storiesPerEpic?: number;
    signal?: AbortSignal;
    onProgress?: (p: DesignProgress) => void;
}
/** One file as Markdown-ish text. Throws with a plain fix when the format needs a tool that is missing. */
export declare function fileToText(path: string): string;
/** Read a design from a file, a folder (every readable file, in name order) or an http(s) URL. */
export declare function readDesign(src: string, extract?: (url: string, max: number) => Promise<string>, cwd?: string): Promise<DesignSource>;
/** Split by headings into chunks of at most maxChars, keeping each chunk's heading path; text without headings is split by paragraphs. */
export declare function chunkDesign(md: string, maxChars: number): Chunk[];
export declare function outlineChunk(deps: DesignDeps, title: string, c: Chunk, total: number, signal?: AbortSignal): Promise<ChunkNotes>;
export declare function makeOverview(deps: DesignDeps, title: string, notes: ChunkNotes[], budget: number, signal?: AbortSignal): Promise<Overview>;
export declare function planQuestions(deps: DesignDeps, ov: Overview, notes: ChunkNotes[], max: number, signal?: AbortSignal): Promise<Question[]>;
/** Choose which search hits to read: official documentation first, never video or social sites, at most `n`. */
export declare function pickPages(hits: Hit[], n: number, extraOfficial?: string[]): Hit[];
export declare function researchQuestion(deps: DesignDeps, ov: Overview, q: Question, pagesPer: number, signal?: AbortSignal): Promise<Finding>;
/** Links the design itself cites (a "Sources" list, inline links): read first, they are what the author relied on. */
export declare function citedUrls(md: string, max?: number): string[];
export declare function readCited(deps: DesignDeps, ov: Overview, urls: string[], signal?: AbortSignal): Promise<Finding[]>;
export declare function researchMarkdown(ov: Overview, fs: Finding[]): string;
export declare function planEpic(deps: DesignDeps, ov: Overview, epic: EpicPlan, chunks: Chunk[], notes: ChunkNotes[], fs: Finding[], prior: StoryPlan[], budget: number, perEpic: number, signal?: AbortSignal): Promise<StoryPlan[]>;
/** Unique ids, dependencies that exist and point backwards (no cycles), at least one acceptance item. Returns the stories in a valid order. */
export declare function normalizePlan(stories: StoryPlan[]): StoryPlan[];
export declare function reviewPlan(deps: DesignDeps, ov: Overview, notes: ChunkNotes[], stories: StoryPlan[], budget: number, signal?: AbortSignal): Promise<string[]>;
export declare function storyBody(s: StoryPlan, ov: Overview, epic: EpicPlan, specRel: string, fs: Finding[]): string;
/** Key prefix from the title: "The Agentic Phone" → "TAP"; never clashes with keys already used. */
export declare function keyPrefixFor(title: string, used: Set<string>): string;
export declare function defaultDeps(rt: Runtime): DesignDeps;
export declare function designToBoard(rt: Runtime, o: DesignOptions, deps?: DesignDeps): Promise<DesignResult>;
export interface DesignJob {
    id: string;
    source: string;
    project: string;
    status: "running" | "done" | "error" | "stopped";
    started: number;
    finished?: number;
    log: DesignProgress[];
    result?: DesignResult;
    error?: string;
}
export declare function startDesignJob(rt: Runtime, o: Omit<DesignOptions, "signal" | "onProgress">, deps?: DesignDeps): DesignJob;
export declare function designJob(rt: Runtime, id?: string): DesignJob | null;
export declare function stopDesignJob(id?: string): boolean;
export declare function describeJob(j: DesignJob | null): string;

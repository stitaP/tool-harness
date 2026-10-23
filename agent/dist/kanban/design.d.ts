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
    queries?: string[];
    pdfs?: string[];
}
export interface RepoHit {
    full_name: string;
    url: string;
    clone_url: string;
    description: string;
    stars: number;
    license: string;
    size_kb: number;
    pushed_at: string;
    language: string;
    archived?: boolean;
}
export interface PriorArt {
    repo: string;
    url: string;
    license: string;
    stars: number;
    pushed: string;
    language: string;
    path?: string;
    cloned: boolean;
    verdict: "fork" | "library" | "reference" | "skip";
    fit: string;
    covers: string[];
    gaps: string[];
    risks: string[];
    how_to_use: string;
    error?: string;
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
    flags?: string[];
}
export interface DesignProgress {
    stage: "read" | "outline" | "research" | "prior-art" | "plan" | "check" | "review" | "board" | "done" | "error";
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
    priorArt: PriorArt[];
    pdfs: string[];
    fixed: number;
    flagged: number;
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
    /** a page or document as text; PDFs are downloaded into saveDir (when given) and converted */
    extract: (url: string, maxChars: number, saveDir?: string) => Promise<string>;
    contextWindow: number;
    /** does this URL open (status below 400)? used to drop dead references */
    probe?: (url: string) => Promise<boolean>;
    /** GitHub repository search, best first */
    github?: (q: string, n: number) => Promise<RepoHit[]>;
    /** shallow-clone a repository into dest (never runs anything from it) */
    clone?: (cloneUrl: string, dest: string) => Promise<void>;
    /** is this command installed here? (checks a story's check command) */
    which?: (cmd: string) => boolean;
}
export interface DesignOptions {
    source: string;
    project: string;
    board?: string;
    research?: boolean;
    /** look for free GitHub repos that already do this, download and judge them (default: kanban.design.prior_art) */
    priorArt?: boolean;
    maxSearches?: number;
    storiesPerEpic?: number;
    signal?: AbortSignal;
    onProgress?: (p: DesignProgress) => void;
}
/** One file as Markdown-ish text. PDF and office files go through the document converter (pdftotext or macOS PDFKit; built-in Word/RTF/ODT readers). */
export declare function fileToText(path: string): Promise<string>;
/** Read a design from a file, a folder (every readable file, in name order) or an http(s) URL. */
export declare function readDesign(src: string, extract?: (url: string, max: number, saveDir?: string) => Promise<string>, cwd?: string, saveDir?: string): Promise<DesignSource>;
/** Split by headings into chunks of at most maxChars, keeping each chunk's heading path; text without headings is split by paragraphs. */
export declare function chunkDesign(md: string, maxChars: number): Chunk[];
export declare function outlineChunk(deps: DesignDeps, title: string, c: Chunk, total: number, signal?: AbortSignal): Promise<ChunkNotes>;
export declare function makeOverview(deps: DesignDeps, title: string, notes: ChunkNotes[], budget: number, signal?: AbortSignal): Promise<Overview>;
export declare function planQuestions(deps: DesignDeps, ov: Overview, notes: ChunkNotes[], max: number, signal?: AbortSignal): Promise<Question[]>;
/** Choose which search hits to read: official documentation first, never video or social sites, at most `n`. PDFs are picked separately. */
export declare function pickPages(hits: Hit[], n: number, extraOfficial?: string[]): Hit[];
export declare const isPdfUrl: (u: string) => boolean;
/** PDFs among the hits (papers, specifications, datasheets, manuals), in search order. */
export declare function pickPdfs(hits: Hit[], n: number): Hit[];
export interface ResearchOpts {
    pagesPer: number;
    pdfsPer: number;
    rounds: number;
    budget: number;
    saveDir?: string;
}
/**
 * One question, researched in rounds: search, read the best pages and PDFs, answer from them; when the model says the answer is
 * incomplete it proposes new search words and the next round adds what they find (pages already read are skipped).
 */
export declare function researchQuestion(deps: DesignDeps, ov: Overview, q: Question, o: ResearchOpts | number, signal?: AbortSignal): Promise<Finding>;
/** Links the design itself cites (a "Sources" list, inline links): read first, they are what the author relied on. */
export declare function citedUrls(md: string, max?: number): string[];
export declare function readCited(deps: DesignDeps, ov: Overview, urls: string[], signal?: AbortSignal, saveDir?: string): Promise<Finding[]>;
export declare function researchMarkdown(ov: Overview, fs: Finding[]): string;
/** Licenses that allow use and modification (SPDX ids as GitHub reports them). Copyleft ones are allowed but flagged. */
export declare const FREE_LICENSES: Set<string>;
export declare function repoQueries(deps: DesignDeps, ov: Overview, signal?: AbortSignal): Promise<string[]>;
/** Free-licensed, not archived, not huge; most stars first. */
export declare function pickRepos(hits: RepoHit[], max: number, maxMb: number): RepoHit[];
/** What a reviewer reads first in a repo: README, file tree, manifests, languages. Read only; nothing is executed. */
export declare function repoSnapshot(dir: string, budget?: number): string;
export declare function judgeRepo(deps: DesignDeps, ov: Overview, notes: ChunkNotes[], r: RepoHit, snapshot: string, signal?: AbortSignal): Promise<Omit<PriorArt, "repo" | "url" | "license" | "stars" | "pushed" | "language" | "cloned" | "path">>;
export declare function findPriorArt(deps: DesignDeps, ov: Overview, notes: ChunkNotes[], dir: string, o: {
    max: number;
    maxMb: number;
}, say: (m: string, d?: number, t?: number) => void, signal?: AbortSignal): Promise<PriorArt[]>;
export declare function priorArtMarkdown(ov: Overview, arts: PriorArt[], project: string): string;
export declare function planEpic(deps: DesignDeps, ov: Overview, epic: EpicPlan, chunks: Chunk[], notes: ChunkNotes[], fs: Finding[], prior: StoryPlan[], budget: number, perEpic: number, signal?: AbortSignal, art?: string): Promise<StoryPlan[]>;
/** Unique ids, dependencies that exist and point backwards (no cycles), at least one acceptance item. Returns the stories in a valid order. */
export declare function normalizePlan(stories: StoryPlan[]): StoryPlan[];
/** Rule checks a person would make when reading a story; each problem is one short sentence. */
export declare function checkStory(s: StoryPlan, which?: (cmd: string) => boolean): string[];
/** The model's own review of one epic's stories: independent, valuable, small, testable, true to the spec. */
export declare function critiqueStories(deps: DesignDeps, ov: Overview, epic: EpicPlan, stories: StoryPlan[], signal?: AbortSignal): Promise<Map<string, string[]>>;
/** Rewrite the stories that have problems (ids and epics stay); returns the rewritten ones. */
export declare function fixStories(deps: DesignDeps, ov: Overview, epic: EpicPlan, bad: {
    story: StoryPlan;
    problems: string[];
}[], fs: Finding[], budget: number, signal?: AbortSignal): Promise<StoryPlan[]>;
/** New stories for requirements nobody covers; each is placed in the epic it belongs to. */
export declare function fillGaps(deps: DesignDeps, ov: Overview, gaps: string[], stories: StoryPlan[], fs: Finding[], budget: number, signal?: AbortSignal): Promise<StoryPlan[]>;
/** Keep the stories grouped by epic in epic order (gap stories land at the end of their epic), then re-check dependencies. */
export declare function orderByEpic(stories: StoryPlan[], ov: Overview): StoryPlan[];
export declare function reviewPlan(deps: DesignDeps, ov: Overview, notes: ChunkNotes[], stories: StoryPlan[], budget: number, signal?: AbortSignal): Promise<string[]>;
export declare function storyBody(s: StoryPlan, ov: Overview, epic: EpicPlan, specRel: string, fs: Finding[]): string;
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

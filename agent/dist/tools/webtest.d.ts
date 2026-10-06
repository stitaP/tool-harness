import { type Tool } from "./types.js";
export declare function resolvePw(): string | null;
export declare function loadPlaywright(): Promise<any>;
export type BrowserName = "chromium" | "webkit" | "firefox";
export type StepAction = "goto" | "click" | "fill" | "press" | "select" | "check" | "uncheck" | "hover" | "wait" | "expect_text" | "expect_visible" | "expect_url" | "expect_title" | "screenshot";
export interface Step {
    action: StepAction;
    selector?: string;
    text?: string;
    value?: string;
    url?: string;
    key?: string;
    ms?: number;
    name?: string;
}
export interface ScenarioOptions {
    url?: string;
    steps: Step[];
    name?: string;
    /** output root: results go to <dir>/test-results/<name>-<ts>/ and the spec to <dir>/tests/ */
    dir: string;
    browser?: BrowserName;
    headed?: boolean;
    viewport?: {
        width: number;
        height: number;
    };
    video?: boolean;
    trace?: boolean;
    screenshot_each_step?: boolean;
    /** per-step timeout for actions and expectations (default 10000 ms) */
    stepTimeoutMs?: number;
    /** egress allowlist (web.egress_allowlist); private hosts are allowed like browser.ts */
    allowlist?: string[];
    executablePath?: string;
    signal?: AbortSignal;
    progress?: (s: string) => void;
}
export interface StepResult {
    index: number;
    action: StepAction;
    target: string;
    ok: boolean;
    durationMs: number;
    screenshot?: string;
    error?: string;
}
export interface ScenarioResult {
    ok: boolean;
    name: string;
    outDir: string;
    steps: StepResult[];
    failedStep?: StepResult;
    error?: string;
    reportPath: string;
    specPath?: string;
    videoPath?: string;
    tracePath?: string;
    summary: string;
}
/** Playwright Test code equivalent to the steps. */
export declare function generateSpec(name: string, steps: Step[], opts?: {
    url?: string;
    screenshotEachStep?: boolean;
}): string;
/** Run a step list with playwright-core and save evidence. Stops at the first failed step. */
export declare function runScenario(opts: ScenarioOptions): Promise<ScenarioResult>;
export interface ParsedFailure {
    title: string;
    file?: string;
    project?: string;
    status: string;
    error: string;
    attachments: {
        name: string;
        contentType?: string;
        path: string;
    }[];
}
export interface ParsedReport {
    total: number;
    expected: number;
    unexpected: number;
    flaky: number;
    skipped: number;
    durationMs: number;
    failures: ParsedFailure[];
    errors: string[];
}
/** Parse the output of Playwright's json reporter (suites → specs → tests → results). */
export declare function parseJsonReport(json: any, rootDir?: string): ParsedReport;
export declare function formatReport(r: ParsedReport, source: string): string;
export declare function scaffoldFiles(url: string, browsers: BrowserName[], name: string): Record<string, string>;
export declare const webtestTool: Tool;

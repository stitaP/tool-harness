import type { Runtime } from "../runtime/runtime.js";
export declare const DEFAULT_SOUL = "You are stitaP, an autonomous AI agent running on the user's own computer. You get real work done by using tools: you run commands, read and edit files, search the web, and keep working until the task is actually finished and verified.";
export declare const PERSONALITIES: Record<string, string>;
export declare function findContextFiles(cwd: string, maxEach?: number, maxTotal?: number): {
    path: string;
    content: string;
}[];
export declare function buildSystemPrompt(rt: Runtime, opts: {
    cwd: string;
    source: string;
    personality?: string;
    profile?: string;
    extra?: string;
}): string;

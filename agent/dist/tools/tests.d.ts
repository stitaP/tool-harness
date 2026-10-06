import { type Tool } from "./types.js";
/** Compact summary of node:test output (spec or TAP reporter); other runners get their filtered tail. */
export declare function summarizeTests(output: string, exitCode: number | null, maxFailures?: number): string;
export declare const runTestsTool: Tool;

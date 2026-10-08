import { type Tool } from "./types.js";
interface Run {
    code: number;
    out: string;
}
export declare function run(cmd: string, args: string[], cwd: string, signal?: AbortSignal, timeoutMs?: number): Promise<Run>;
export declare const gitTool: Tool;
export declare function ghAvailable(): boolean;
export declare const githubTool: Tool;
export {};

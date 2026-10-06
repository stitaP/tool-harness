import type { Runtime } from "./runtime.js";
export interface CommandContext {
    rt: Runtime;
    sid: string;
    source: string;
}
export interface CommandResult {
    text?: string;
    switchTo?: string;
    exit?: boolean;
    send?: string;
    clear?: boolean;
}
export declare function insights(rt: Runtime, days: number): string;
export declare function commandNames(): string[];
export declare function listCommands(): {
    name: string;
    usage: string;
    help: string;
    group: string;
}[];
/**
 * Is this chat line a slash command (vs. a message that merely starts with "/", like a pasted path
 * "/Users/me/project/IDEA.md implement this")? The name must end at whitespace or end of line, and a bare
 * "/name" that exists on disk (e.g. "/tmp") is a path unless it is a known command or skill.
 */
export declare function looksLikeCommand(line: string, rt?: {
    skills: {
        get(n: string): unknown;
    };
}): boolean;
export declare function runCommand(line: string, c: CommandContext): Promise<CommandResult | null>;

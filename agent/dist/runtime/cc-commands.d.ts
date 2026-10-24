import type { CommandContext, CommandResult, Cmd } from "./commands.js";
import type { Runtime } from "./runtime.js";
interface Diff {
    label: string;
    diff: string;
    files: string[];
}
/**
 * What to review: a PR number (gh pr diff), a git ref (changes on this branch since it), --staged, or by default the
 * uncommitted changes plus new files — falling back to the last commit when the tree is clean. Paths narrow it.
 */
export declare function collectDiff(cwd: string, args: string[]): Promise<Diff | {
    error: string;
}>;
export declare function contextReport(rt: Runtime, sid: string): string;
export declare function permissionSuggestions(rt: Runtime): {
    pattern: string;
    count: number;
    why: string;
}[];
export declare const KEY_RE: RegExp;
/**
 * Input prefixes, as in Claude Code: `!cmd` runs a shell command in this chat's folder right away (its output goes to
 * the agent with the next message; terminal and web chat only), `#note` saves a memory entry (`#user …` for facts about
 * the user). Returns null when the line is a normal message.
 */
export declare function runInputPrefix(line: string, c: CommandContext): Promise<CommandResult | null>;
export declare const CC_COMMANDS: Cmd[];
export {};

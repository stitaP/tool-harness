/** Dangerous-command detection for the terminal tool (bash, PowerShell, cmd). */
export declare function dangerReason(command: string): string | null;
export declare function isMutating(command: string): boolean;
/** User-approved patterns: exact command, prefix with trailing *, or /regex/ */
export declare function matchesAllow(command: string, patterns: string[]): boolean;

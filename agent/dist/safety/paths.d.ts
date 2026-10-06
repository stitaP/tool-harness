export declare function expandHome(p: string): string;
export declare function resolvePath(cwd: string, p: string): string;
export declare function blockedReason(abs: string, blocked: string[], write: boolean): string | null;
/**
 * Files the agent's file tools must never change: `security.protected_paths` (absolute or ~ globs) plus the patterns in a
 * `.stitap-protected` file (one glob per line, relative to that file's folder, # comments) found in the target's folder
 * or any parent — e.g. a project marks `tests/**` so provided tests can't be rewritten.
 */
export declare function protectedReason(abs: string, globs?: string[]): string | null;
/** Throws when a URL is not allowed by egress policy. */
export declare function checkEgress(url: string, opts: {
    allowPrivate: boolean;
    allowlist: string[];
}): Promise<URL>;

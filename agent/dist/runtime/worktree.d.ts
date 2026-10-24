export interface Worktree {
    name: string;
    path: string;
    branch: string;
    base: string;
    root: string;
    cwd: string;
}
export declare const safeName: (n: string) => string;
/** The main checkout's top folder for a path inside a repo (also from inside a worktree), or null outside git. */
export declare function repoRoot(cwd: string): Promise<string | null>;
/**
 * Create (or reuse) a worktree named `name` on branch `<prefix><name>` from the current HEAD of `cwd`'s repo.
 * `cwd` inside the worktree is the same sub-folder as `cwd` inside the main checkout.
 */
export declare function createWorktree(cwd: string, name: string, prefix?: string): Promise<Worktree>;
export declare function listWorktrees(cwd: string): Promise<{
    path: string;
    branch: string;
}[]>;
/** Uncommitted changes in a worktree (porcelain lines), and commits it has that `base` does not. */
export declare function worktreeChanges(w: Pick<Worktree, "path" | "base" | "branch">): Promise<{
    dirty: string[];
    ahead: number;
}>;
/** Commit everything in the worktree (if anything changed). */
export declare function commitAll(path: string, message: string): Promise<boolean>;
/** Merge the worktree's branch into the branch checked out in the main folder. Aborts and throws on a conflict. */
export declare function mergeWorktree(w: Pick<Worktree, "root" | "branch">, message?: string): Promise<string>;
/** Remove the worktree folder; also delete its branch when `deleteBranch` (only if merged, unless `force`). */
export declare function removeWorktree(w: Pick<Worktree, "root" | "path" | "branch">, opts?: {
    deleteBranch?: boolean;
    force?: boolean;
}): Promise<void>;

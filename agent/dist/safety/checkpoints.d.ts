export interface Checkpoint {
    id: string;
    time: number;
    message: string;
}
export declare class Checkpoints {
    private home;
    private enabled;
    private maxFiles;
    constructor(home: string, enabled: () => boolean, maxFiles?: number);
    /** One store per folder, however it is spelled (macOS reports /var/… as /private/var/…). */
    private repoFor;
    private unsafeRoot;
    private git;
    /** Walk the tree once: file count, bytes of snapshot-able files, and files too big to snapshot (relative paths). */
    private scan;
    /** Snapshot cwd. Returns checkpoint id or null when skipped. */
    take(cwd: string, message: string, fileHint?: string): string | null;
    private backupFile;
    list(cwd: string, limit?: number): Checkpoint[];
    diff(cwd: string, id?: string): string;
    /** Versions of one file (newest first): each checkpoint where its content differs from the previous one. */
    fileVersions(cwd: string, rel: string, limit?: number): (Checkpoint & {
        lines: number | null;
    })[];
    /** A file's content at checkpoint `id`, or null when it did not exist then. */
    fileAt(cwd: string, id: string, rel: string): string | null;
    /** Files that lost most of their content (or were deleted) since checkpoint `id`: what a script that rewrote files did. */
    shrunkSince(cwd: string, id: string, minLines?: number, keep?: number): {
        path: string;
        was: number;
        now: number;
    }[];
    /** Put these files (relative paths) back as they were at checkpoint `id`. */
    restorePaths(cwd: string, id: string, paths: string[]): void;
    /** Restore files to checkpoint `id` (default: latest). Safety-snapshots current state first. */
    rollback(cwd: string, id?: string): string;
    private restoreFile;
}

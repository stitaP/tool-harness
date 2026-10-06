export interface SkillInfo {
    name: string;
    description: string;
    category: string;
    path: string;
    dir: string;
    source: "user" | "bundled" | "external";
    meta: Record<string, any>;
}
export declare function parseFrontmatter(text: string): {
    meta: Record<string, any>;
    body: string;
};
export declare class SkillStore {
    private userDir;
    private bundledDir;
    private externalDirs;
    private cache;
    constructor(userDir: string, bundledDir: string, externalDirs: () => string[]);
    invalidate(): void;
    private scan;
    list(): SkillInfo[];
    get(name: string): SkillInfo | undefined;
    index(maxChars?: number): string;
    view(name: string, file?: string): string;
    create(name: string, description: string, body: string, category?: string, extra?: Record<string, any>, overwrite?: boolean): SkillInfo;
    write(name: string, content: string): void;
    writeFile(name: string, file: string, content: string): void;
    /** Editing a bundled skill copies it into the user dir first (bundled files stay pristine). */
    private ensureUserCopy;
    delete(name: string): void;
    mtime(): number;
}

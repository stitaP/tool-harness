export type MemTarget = "memory" | "user";
export declare class MemoryStore {
    private dir;
    private limits;
    constructor(dir: string, limits: () => {
        memory_chars: number;
        user_chars: number;
    });
    private file;
    limit(t: MemTarget): number;
    entries(t: MemTarget): string[];
    private save;
    size(t: MemTarget): number;
    add(t: MemTarget, content: string): string;
    replace(t: MemTarget, oldText: string, content: string): string;
    remove(t: MemTarget, oldText: string): string;
    snapshot(): string;
}

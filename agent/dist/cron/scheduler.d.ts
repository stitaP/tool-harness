import type { Runtime } from "../runtime/runtime.js";
import { type Tool } from "../tools/types.js";
export interface CronJob {
    id: string;
    name: string;
    schedule: string;
    schedule_text: string;
    prompt: string;
    skills: string[];
    deliver: string;
    enabled: boolean;
    next_run: number;
    last_run?: number;
    last_status?: "ok" | "error";
    last_output?: string;
    runs: number;
    created_at: number;
    once?: boolean;
    /** run as a standing goal: the headless session keeps working (judged each turn) until done or out of turns */
    goal?: string;
    cwd?: string;
}
/** Recurring phrase/cron first, then one-off times ("in 2h", "at 23:30", "tomorrow at 9"), which run once. */
export declare function parseSchedule(text: string): {
    expr: string;
    once: boolean;
};
export declare class CronScheduler {
    private rt;
    private running;
    constructor(rt: Runtime);
    list(): CronJob[];
    get(id: string): CronJob | null;
    create(p: {
        name?: string;
        schedule: string;
        prompt: string;
        skills?: string[];
        deliver?: string;
        once?: boolean;
        goal?: string;
        cwd?: string;
    }): CronJob;
    update(id: string, patch: Partial<CronJob>): CronJob;
    remove(id: string): boolean;
    tick(): Promise<number>;
    run(id: string): Promise<string>;
}
export declare const cronTool: Tool;

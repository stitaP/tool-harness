/**
 * 5-field cron expressions (minute hour day-of-month month day-of-week) plus a
 * natural-language front end ("every 15m", "daily at 9:00", "weekdays at 8:30").
 * Evaluated in local time.
 */
type Field = Set<number>;
export interface CronSpec {
    minute: Field;
    hour: Field;
    dom: Field;
    month: Field;
    dow: Field;
    domStar: boolean;
    dowStar: boolean;
    source: string;
}
export declare function parseCron(expr: string): CronSpec;
/** Next fire time strictly after `from`. */
export declare function nextCron(expr: string | CronSpec, from?: Date): Date;
/**
 * Natural language → cron expression, or {everyMs} for sub-minute-precision
 * intervals that don't map to cron (e.g. every 7 minutes still maps via step).
 */
export declare function naturalToCron(text: string): string;
/**
 * One-off times as a cron expression pinned to that minute/day/month (the scheduler marks such jobs `once`):
 * "now", "in 90m", "in 2 hours", "at 23:30", "today at 6pm", "tonight at 11", "tomorrow at 9:15". Null if not one.
 */
export declare function oneOffCron(text: string, now?: Date): string | null;
export {};

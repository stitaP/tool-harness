export type Level = "debug" | "info" | "warn" | "error";
export declare class Logger {
    private dir;
    level: Level;
    echo: boolean;
    init(home: string): void;
    private write;
    log(level: Level, msg: string, meta?: Record<string, any>): void;
    debug(m: string, meta?: any): void;
    info(m: string, meta?: any): void;
    warn(m: string, meta?: any): void;
    error(m: string, meta?: any): void;
}
export declare const log: Logger;

import type { ConfigStore } from "../config.js";
export declare function findChrome(os?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string | null;
/** Chrome refuses remote debugging on its default profile (since v136), so the agent gets its own profile dir. */
export declare function chromeArgs(port: number, profileDir: string): string[];
export declare function browserCommand(cfg: ConfigStore, home: string, sub: string | undefined, f: Record<string, any>): Promise<number>;

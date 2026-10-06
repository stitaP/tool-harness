import type { ConfigStore } from "../config.js";
export declare function setup(cfg: ConfigStore, opts?: {
    nonInteractive?: Record<string, string>;
}): Promise<void>;

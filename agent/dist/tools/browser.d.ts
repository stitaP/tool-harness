import type { Runtime } from "../runtime/runtime.js";
import { type Tool } from "./types.js";
export declare function playwrightAvailable(): boolean;
/**
 * browser config: mode safari (the real Safari via safaridriver — default on macOS) | launch (Playwright's bundled Chromium) |
 * chrome (an installed Chromium-based browser: channel chrome/msedge or executable_path, own profile) | connect (a running Chrome over CDP)
 */
export interface BrowserCfg {
    mode: "safari" | "launch" | "chrome" | "connect";
    headless: boolean;
    executable_path: string;
    channel: string;
    cdp_url: string;
    user_data_dir: string;
    args: string[];
}
export declare function browserCfg(rt: Runtime): BrowserCfg;
export declare function closeBrowsers(): Promise<void>;
export interface BrowserChoice {
    id: string;
    label: string;
    supported: boolean;
    note?: string;
    set: Partial<BrowserCfg>;
}
/** Browsers installed on this machine that the browser tools can drive (plus the ones they can't, with why). */
export declare function detectBrowsers(): BrowserChoice[];
/** Open the configured browser on a blank page and close it again; throws with a readable reason. */
export declare function testBrowser(rt: Runtime): Promise<string>;
/** Forget open browser sessions (after the browser choice changes) so the next tool call uses the new one. */
export declare function resetBrowsers(): Promise<void>;
/** Which detected browser the current config points at. */
export declare function currentBrowserId(rt: Runtime): string;
export declare const browserTools: Tool[];

import { type Tool } from "./types.js";
export type OS = "darwin" | "win32" | "linux";
export type Action = "screenshot" | "ui_tree" | "click" | "double_click" | "right_click" | "move" | "drag" | "scroll" | "type" | "key" | "open_app" | "focus_app" | "list_apps" | "open" | "cursor_position" | "screen_size" | "clipboard_read" | "clipboard_write";
export declare const ACTIONS: Action[];
/** A command to run: argv (no shell) plus optional stdin. */
export interface Cmd {
    file: string;
    args: string[];
    stdin?: string;
    detached?: boolean;
    fallback?: Cmd;
}
export interface Env {
    os: OS;
    wayland: boolean;
    has: (bin: string) => boolean;
}
export declare function which(bin: string, path?: string): boolean;
export declare function detectEnv(): Env;
export declare function availability(env: Env): true | string;
/** "Ctrl+Shift+T" / "cmd+c" / "Enter" → { mods: ["ctrl","shift"], key: "t" } */
export declare function parseCombo(combo: string): {
    mods: string[];
    key: string;
};
/** Escape text for WinForms SendKeys. */
export declare const sendKeysEscape: (s: string) => string;
export interface Args {
    action: Action;
    x?: number;
    y?: number;
    to_x?: number;
    to_y?: number;
    text?: string;
    keys?: string;
    amount?: number;
    direction?: "up" | "down" | "left" | "right";
    app?: string;
    target?: string;
    path?: string;
    limit?: number;
}
/** Build the command(s) for an action. Pure: no side effects, unit-testable for every OS. */
export declare function build(env: Env, a: Args, shotPath: string): Cmd[];
export declare function exec(c: Cmd, timeoutMs?: number, signal?: AbortSignal): Promise<string>;
export interface DesktopDeps {
    env?: Env;
    run?: (c: Cmd, timeoutMs: number, signal?: AbortSignal) => Promise<string>;
}
export declare function makeDesktopTool(deps?: DesktopDeps): Tool;
export declare const desktopTool: Tool;

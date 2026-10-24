/**
 * Vim keys for the terminal chat's input line (/vim). Pure: takes the line, cursor and a key, returns the new state,
 * so repl.ts only wires it to readline. Insert mode passes keys through; Esc enters normal mode.
 */
export interface VimState {
    mode: "insert" | "normal";
    pending: string;
    yank: string;
    undo: {
        line: string;
        cursor: number;
    }[];
}
export interface VimResult {
    line: string;
    cursor: number;
    action?: "history_prev" | "history_next" | "passthrough";
}
export declare const newVimState: () => VimState;
/** One key in normal mode (or Esc in insert mode). `ch` is the typed character, `name` readline's key name. */
export declare function vimKey(st: VimState, line: string, cursor: number, ch: string, name?: string): VimResult;

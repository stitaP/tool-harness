import type { Card, KanbanBoard } from "./board.js";
import { type Step } from "../tools/webtest.js";
export interface Manifest {
    files: string[];
    exports: Record<string, string[]>;
    pages: string[];
}
export interface CheckLine {
    name: string;
    ok: boolean;
    skipped?: boolean;
    detail: string;
}
export interface VerifyReport {
    key: string;
    ok: boolean;
    checks: CheckLine[];
    evidenceDir: string;
    shots: string[];
    markdown: string;
}
/** Files, exports and pages a phase spec promises. */
export declare function parseManifest(md: string): Manifest;
export declare function exportsName(src: string, name: string): boolean;
/** Files that must exist and exports that must be present. Returns the problems found (empty = built). */
export declare function checkBuilt(cwd: string, files?: string[], exports?: Record<string, string[]>): string[];
/** Files named in a section's heading/opening lines, the exports declared in its code blocks, and (for a "folders" section) the folders it lists. */
export declare function sectionManifest(heading: string, body: string): {
    files: string[];
    exports: Record<string, string[]>;
};
/** Browser steps the tests story wrote for a phase: tests/functional/<phase>.functional.json (a JSON array of webtest steps). */
export declare function loadFunctional(cwd: string, spec?: string): Step[];
export declare function verifyCard(board: KanbanBoard, ref: string, o?: {
    skipRegression?: boolean;
}): Promise<VerifyReport>;
/** A dependency-free node:test file for the static part of a phase: files, exports, pages and their local references. */
export declare function generateVerifyTest(card: Card, manifest: Manifest): string;
/** Write tests/verify/<phase>.verify.test.mjs for a card with a spec. Returns the path. */
export declare function writeVerifyTest(board: KanbanBoard, ref: string): string;

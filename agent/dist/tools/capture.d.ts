/**
 * capture — image and video evidence: screen_capture (screenshots), screen_record (background screen video),
 * camera_capture (webcam photo / clip). macOS, Windows, Linux (X11 and Wayland). Zero npm dependencies.
 *
 * Backends (from the official docs: man screencapture, https://ffmpeg.org/ffmpeg-devices.html, grim/scrot/import manuals):
 *   macOS    screenshots  screencapture -x -t fmt [-R x,y,w,h | -D n | -l windowid] [-T s] [-C]
 *                         (window id found with JXA → CGWindowListCopyWindowInfo)
 *            recording    screencapture -v [-V s] [-R] [-D] [-g]  → fallback ffmpeg -f avfoundation -i "Capture screen N:none"
 *            camera       ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "<index|name>"
 *   Windows  screenshots  PowerShell System.Drawing CopyFromScreen (Screen.AllScreens / user32 GetWindowRect)
 *            recording    ffmpeg -f gdigrab -i desktop | title=<window>
 *            camera       ffmpeg -f dshow -i video="<name>"
 *   Linux    screenshots  Wayland: grim · X11: import | scrot | gnome-screenshot | ffmpeg -f x11grab -frames:v 1
 *            recording    Wayland: wf-recorder · X11: ffmpeg -f x11grab -i $DISPLAY
 *            camera       ffmpeg -f v4l2 -i /dev/videoN
 *
 * screen_capture is read-only (no approval unless desktop.approve_reads: true). screen_record start and every
 * camera_capture ask for approval. Command construction is pure and exported for tests.
 */
import { type ChildProcess } from "node:child_process";
import { type Tool } from "./types.js";
import { type OS, type Cmd } from "./desktop.js";
export type { OS, Cmd };
export interface CaptureEnv {
    os: OS;
    wayland: boolean;
    has: (bin: string) => boolean;
    display?: string;
}
export declare function detectCaptureEnv(): CaptureEnv;
export declare const FFMPEG_INSTALL: Record<OS, string>;
/** Message returned when no recorder / camera backend exists. */
export declare function installMessage(os: OS, what: string): string;
export interface Region {
    x: number;
    y: number;
    width: number;
    height: number;
}
export declare function parseRegion(r: any): Region | undefined;
export interface ScreenshotOpts {
    target?: "screen" | "region" | "window" | "display";
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    window?: string;
    /** resolved native window id (macOS CGWindowID, X11 window id) for target=window */
    windowId?: string;
    display?: number;
    delay?: number;
    cursor?: boolean;
    format?: "png" | "jpg";
}
/** JXA: print "<id>\t<owner>\t<title>\t<w>x<h>" of the best on-screen window matching an app name or title substring. */
export declare const MAC_FIND_WINDOW = "\nObjC.import('CoreGraphics');\nvar info = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1 | 16, 0))) || [];\nvar q = String(argv[0] || '').toLowerCase();\nvar wins = info.filter(function (w) { return w.kCGWindowLayer === 0 && w.kCGWindowBounds && w.kCGWindowBounds.Width > 1 && w.kCGWindowBounds.Height > 1; });\nvar own = function (w) { return String(w.kCGWindowOwnerName || '').toLowerCase(); };\nvar ttl = function (w) { return String(w.kCGWindowName || '').toLowerCase(); };\nvar hit = wins.filter(function (w) { return own(w) === q; })[0] || wins.filter(function (w) { return ttl(w).indexOf(q) >= 0 && q; })[0]\n  || wins.filter(function (w) { return own(w).indexOf(q) >= 0; })[0];\nif (!hit) return 'NOTFOUND\\t' + wins.slice(0, 15).map(function (w) { return w.kCGWindowOwnerName + (w.kCGWindowName ? ' \u2014 ' + w.kCGWindowName : ''); }).join('; ');\nreturn hit.kCGWindowNumber + '\\t' + hit.kCGWindowOwnerName + '\\t' + (hit.kCGWindowName || '') + '\\t' + Math.round(hit.kCGWindowBounds.Width) + 'x' + Math.round(hit.kCGWindowBounds.Height);";
/** Command that resolves a window name to a native id (macOS / X11), or null when the screenshot command does it itself. */
export declare function buildWindowLookupCommand(env: CaptureEnv, window: string): Cmd | null;
/** Parse the lookup output → window id, or throw with the visible windows listed. */
export declare function parseWindowLookup(env: CaptureEnv, out: string, window: string): string;
/** Build the screenshot command(s). Pure. For target=window on macOS / X11 pass opts.windowId (see buildWindowLookupCommand). */
export declare function buildScreenshotCommand(env: CaptureEnv, opts: ScreenshotOpts, outPath: string): Cmd[];
export type RecBackend = "screencapture" | "ffmpeg" | "wf-recorder";
export interface RecordOpts {
    duration?: number;
    fps?: number;
    region?: Region;
    audio?: boolean;
    display?: number;
    window?: string;
}
export interface RecCandidate {
    backend: RecBackend;
    cmd: Cmd;
    ext: "mov" | "mp4";
    stop: "stdin-q" | "sigint";
    notes: string[];
}
/** Ordered recorder candidates for this machine (empty → nothing installed). `outPath` may contain "{ext}". Pure. */
export declare function buildRecordCommands(env: CaptureEnv, opts: RecordOpts, outPath: string): RecCandidate[];
export interface CameraOpts {
    mode?: "photo" | "video";
    duration?: number;
    device?: string | number;
}
export declare function buildCameraListCommand(env: CaptureEnv): Cmd;
/** Video device names from `-list_devices` output (avfoundation or dshow). */
export declare function parseCameraList(os: OS, out: string): string[];
/** Pure: the ffmpeg command for a photo (-frames:v 1) or a clip (-t). `device` must be resolved (dshow needs a name). */
export declare function buildCameraCommand(env: CaptureEnv, opts: CameraOpts, outPath: string): Cmd;
/** macOS: prints true/false — whether the app running the harness has Screen Recording permission. */
export declare const MAC_SCREEN_PERMISSION_CHECK: Cmd;
export declare const MAC_SCREEN_PERMISSION_MESSAGE: string;
export interface RunResult {
    code: number | null;
    stdout: string;
    stderr: string;
}
export type Runner = (c: Cmd, timeoutMs: number, signal?: AbortSignal) => Promise<RunResult>;
export declare const runCmd: Runner;
export declare function permissionHint(os: OS, file: string, msg: string): string;
/** Width × height from a PNG or JPEG header (no decoding). */
export declare function imageSize(path: string): {
    width: number;
    height: number;
} | undefined;
export interface Recording {
    sessionId: string;
    path: string;
    backend: RecBackend;
    stop: "stdin-q" | "sigint";
    startedAt: number;
    proc: ChildProcess;
    exited: Promise<number | null>;
    done: boolean;
    code: number | null;
    stderr: string;
    timers: NodeJS.Timeout[];
    notes: string[];
}
/** Active recordings, one per session id. */
export declare const recordings: Map<string, Recording>;
export interface CaptureDeps {
    env?: CaptureEnv;
    run?: Runner;
    spawn?: (file: string, args: string[]) => ChildProcess;
    /** ms to wait after starting a recorder to catch immediate failures (default 2000) */
    startupMs?: number;
}
export declare function makeCaptureTools(deps?: CaptureDeps): Tool[];
export declare const captureTools: Tool[];

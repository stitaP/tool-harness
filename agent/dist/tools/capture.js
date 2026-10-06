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
import { execFile, spawn as nodeSpawn } from "node:child_process";
import { mkdirSync, statSync, existsSync, openSync, readSync, closeSync, readdirSync } from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { obj, str, int, num, enm, bool } from "./types.js";
import { detectEnv as detectDesktopEnv } from "./desktop.js";
export function detectCaptureEnv() {
    const e = detectDesktopEnv();
    return { os: e.os, wayland: e.wayland, has: e.has, display: process.env.DISPLAY };
}
export const FFMPEG_INSTALL = {
    darwin: "brew install ffmpeg",
    win32: "winget install Gyan.FFmpeg",
    linux: "sudo apt install ffmpeg",
};
/** Message returned when no recorder / camera backend exists. */
export function installMessage(os, what) {
    return `error: no ${what} available — ffmpeg is not installed${os === "linux" ? " (and no wf-recorder for Wayland)" : ""}. ` +
        `Install it with: ${FFMPEG_INSTALL[os]}` + (os === "linux" ? " (Wayland screen recording: sudo apt install wf-recorder)" : "") +
        ", then try again.";
}
// ----------------------------------------------------------------------------- helpers
const ps = (script) => ({
    file: "powershell", args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
});
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const n = (v, what) => {
    const x = Number(v);
    if (v === undefined || v === null || v === "" || !Number.isFinite(x))
        throw new Error(`${what} is required`);
    return Math.round(x);
};
export function parseRegion(r) {
    if (r === undefined || r === null || r === "")
        return undefined;
    let p = r;
    if (typeof r === "string") {
        const m = r.split(/[\s,x]+/).filter(Boolean).map(Number);
        p = { x: m[0], y: m[1], width: m[2], height: m[3] };
    }
    else if (Array.isArray(r))
        p = { x: r[0], y: r[1], width: r[2], height: r[3] };
    const reg = { x: n(p.x, "region x"), y: n(p.y, "region y"), width: n(p.width, "region width"), height: n(p.height, "region height") };
    if (reg.width <= 0 || reg.height <= 0)
        throw new Error("region width and height must be positive");
    return reg;
}
/** JXA: print "<id>\t<owner>\t<title>\t<w>x<h>" of the best on-screen window matching an app name or title substring. */
export const MAC_FIND_WINDOW = `
ObjC.import('CoreGraphics');
var info = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1 | 16, 0))) || [];
var q = String(argv[0] || '').toLowerCase();
var wins = info.filter(function (w) { return w.kCGWindowLayer === 0 && w.kCGWindowBounds && w.kCGWindowBounds.Width > 1 && w.kCGWindowBounds.Height > 1; });
var own = function (w) { return String(w.kCGWindowOwnerName || '').toLowerCase(); };
var ttl = function (w) { return String(w.kCGWindowName || '').toLowerCase(); };
var hit = wins.filter(function (w) { return own(w) === q; })[0] || wins.filter(function (w) { return ttl(w).indexOf(q) >= 0 && q; })[0]
  || wins.filter(function (w) { return own(w).indexOf(q) >= 0; })[0];
if (!hit) return 'NOTFOUND\\t' + wins.slice(0, 15).map(function (w) { return w.kCGWindowOwnerName + (w.kCGWindowName ? ' — ' + w.kCGWindowName : ''); }).join('; ');
return hit.kCGWindowNumber + '\\t' + hit.kCGWindowOwnerName + '\\t' + (hit.kCGWindowName || '') + '\\t' + Math.round(hit.kCGWindowBounds.Width) + 'x' + Math.round(hit.kCGWindowBounds.Height);`;
/** Command that resolves a window name to a native id (macOS / X11), or null when the screenshot command does it itself. */
export function buildWindowLookupCommand(env, window) {
    if (env.os === "darwin")
        return { file: "osascript", args: ["-l", "JavaScript", "-e", `function run(argv) {\n${MAC_FIND_WINDOW}\n}`, window] };
    if (env.os === "win32")
        return null;
    if (env.wayland)
        throw new Error("capturing a single window is not supported on Wayland (grim captures outputs/regions); use target=region");
    if (!env.has("xdotool"))
        throw new Error("capturing a window on X11 needs xdotool (sudo apt install xdotool)");
    return { file: "xdotool", args: ["search", "--onlyvisible", "--name", window] };
}
/** Parse the lookup output → window id, or throw with the visible windows listed. */
export function parseWindowLookup(env, out, window) {
    const line = out.trim().split(/\r?\n/)[0] ?? "";
    if (env.os === "darwin") {
        const [id, rest] = line.split("\t");
        if (!id || id === "NOTFOUND" || !/^\d+$/.test(id))
            throw new Error(`no on-screen window matches "${window}"${rest ? `. Visible windows: ${rest}` : ""}`);
        return id;
    }
    if (!/^\d+$/.test(line))
        throw new Error(`no visible window matches "${window}"`);
    return line;
}
const WIN_CAPTURE_PRELUDE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class CapU32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
[void][CapU32]::SetProcessDPIAware()
`;
/** Build the screenshot command(s). Pure. For target=window on macOS / X11 pass opts.windowId (see buildWindowLookupCommand). */
export function buildScreenshotCommand(env, opts, outPath) {
    const target = opts.target ?? "screen";
    const fmt = opts.format === "jpg" ? "jpg" : "png";
    const reg = target === "region" ? parseRegion({ x: opts.x, y: opts.y, width: opts.width, height: opts.height }) : undefined;
    const disp = target === "display" ? Math.max(1, n(opts.display ?? 1, "display")) : undefined;
    if (target === "window" && !opts.window && !opts.windowId)
        throw new Error("window (app name or title) is required for target=window");
    // ---------------------------------------------------------------- macOS
    if (env.os === "darwin") {
        const args = ["-x", "-t", fmt];
        if (reg)
            args.push("-R", `${reg.x},${reg.y},${reg.width},${reg.height}`);
        if (disp)
            args.push("-D", String(disp));
        if (target === "window") {
            if (!opts.windowId)
                throw new Error("windowId not resolved");
            args.push("-o", "-l", String(opts.windowId));
        }
        if (opts.delay && opts.delay > 0)
            args.push("-T", String(Math.round(opts.delay)));
        if (opts.cursor)
            args.push("-C");
        args.push(outPath);
        return [{ file: "screencapture", args }];
    }
    // ---------------------------------------------------------------- Windows
    if (env.os === "win32") {
        let bounds;
        if (reg)
            bounds = `$L=${reg.x}; $T=${reg.y}; $W=${reg.width}; $H=${reg.height}`;
        else if (disp)
            bounds = `$all=[System.Windows.Forms.Screen]::AllScreens; if (${disp} -gt $all.Count) { throw "display ${disp} not found (there are $($all.Count))" }; $b=$all[${disp - 1}].Bounds; $L=$b.Left; $T=$b.Top; $W=$b.Width; $H=$b.Height`;
        else if (target === "window") {
            const w = String(opts.window);
            bounds = `$q=${lit(w)}; $p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -like $q -or $_.MainWindowTitle -like ('*' + $q + '*')) } | Select-Object -First 1
if (-not $p) { throw ('no window matches "' + $q + '"') }
$h=$p.MainWindowHandle; if ([CapU32]::IsIconic($h)) { [void][CapU32]::ShowWindow($h, 9) }; [void][CapU32]::SetForegroundWindow($h); Start-Sleep -Milliseconds 350
$r = New-Object CapU32+RECT; [void][CapU32]::GetWindowRect($h, [ref]$r); $L=$r.Left; $T=$r.Top; $W=$r.Right-$r.Left; $H=$r.Bottom-$r.Top`;
        }
        else
            bounds = `$b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $L=$b.Left; $T=$b.Top; $W=$b.Width; $H=$b.Height`;
        const cursor = opts.cursor ? `$cp=[System.Windows.Forms.Cursor]::Position; [System.Windows.Forms.Cursors]::Default.Draw($g, (New-Object System.Drawing.Rectangle(($cp.X-$L), ($cp.Y-$T), 32, 32)))\n` : "";
        const imf = fmt === "jpg" ? "Jpeg" : "Png";
        return [ps(`${WIN_CAPTURE_PRELUDE}${bounds}
if ($W -le 0 -or $H -le 0) { throw 'empty capture area' }
$bmp = New-Object System.Drawing.Bitmap $W, $H; $g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($L, $T, 0, 0, $bmp.Size)
${cursor}$bmp.Save(${lit(outPath)}, [System.Drawing.Imaging.ImageFormat]::${imf}); $g.Dispose(); $bmp.Dispose()
"$($W)x$($H)"`)];
    }
    // ---------------------------------------------------------------- Linux
    if (env.wayland) {
        if (target === "window")
            throw new Error("capturing a single window is not supported on Wayland; use target=region");
        if (!env.has("grim"))
            throw new Error("no Wayland screenshot tool: install grim (sudo apt install grim)");
        const args = ["-t", fmt === "jpg" ? "jpeg" : "png"];
        if (reg)
            args.push("-g", `${reg.x},${reg.y} ${reg.width}x${reg.height}`);
        if (opts.cursor)
            args.push("-c");
        args.push(outPath);
        return [{ file: "grim", args }];
    }
    const display = env.display || ":0";
    if (target === "window") {
        if (!opts.windowId)
            throw new Error("windowId not resolved");
        if (!env.has("import"))
            throw new Error("capturing a window on X11 needs ImageMagick import (sudo apt install imagemagick)");
        return [{ file: "import", args: ["-window", String(opts.windowId), outPath] }];
    }
    // display=N on X11: one X screen spans all monitors; capture the root window (noted by the handler).
    if (env.has("import"))
        return [{ file: "import", args: ["-window", "root", ...(reg ? ["-crop", `${reg.width}x${reg.height}+${reg.x}+${reg.y}`, "+repage"] : []), outPath] }];
    if (env.has("scrot"))
        return [{ file: "scrot", args: ["-o", ...(opts.cursor ? ["-p"] : []), ...(reg ? ["-a", `${reg.x},${reg.y},${reg.width},${reg.height}`] : []), outPath] }];
    if (env.has("gnome-screenshot") && !reg)
        return [{ file: "gnome-screenshot", args: [...(opts.cursor ? ["-p"] : []), "-f", outPath] }];
    if (env.has("ffmpeg")) {
        return [{ file: "ffmpeg", args: ["-hide_banner", "-loglevel", "error", "-y", "-f", "x11grab", "-draw_mouse", opts.cursor ? "1" : "0",
                    ...(reg ? ["-video_size", `${reg.width}x${reg.height}`] : []), "-i", reg ? `${display}+${reg.x},${reg.y}` : display, "-frames:v", "1", outPath] }];
    }
    throw new Error("no screenshot tool found. Install one of: sudo apt install imagemagick (import) | scrot | gnome-screenshot | ffmpeg; on Wayland: grim");
}
/** Ordered recorder candidates for this machine (empty → nothing installed). `outPath` may contain "{ext}". Pure. */
export function buildRecordCommands(env, opts, outPath) {
    const fps = Math.max(1, Math.min(60, Math.round(Number(opts.fps) || 15)));
    const dur = opts.duration && opts.duration > 0 ? Math.round(opts.duration) : 0;
    const reg = opts.region;
    const out = (ext) => outPath.replace("{ext}", ext);
    const ff = (input, ext, notes = []) => ({
        backend: "ffmpeg", ext: ext, stop: "stdin-q", notes,
        cmd: { file: "ffmpeg", args: ["-hide_banner", "-loglevel", "warning", "-y", ...input, ...(dur ? ["-t", String(dur)] : []), "-pix_fmt", "yuv420p", out(ext)] },
    });
    const list = [];
    if (env.os === "darwin") {
        const args = ["-x", "-v"];
        if (dur)
            args.push("-V", String(dur));
        if (reg)
            args.push("-R", `${reg.x},${reg.y},${reg.width},${reg.height}`);
        if (opts.display && opts.display > 1)
            args.push("-D", String(Math.round(opts.display)));
        if (opts.audio)
            args.push("-g");
        args.push(out("mov"));
        list.push({ backend: "screencapture", cmd: { file: "screencapture", args }, ext: "mov", stop: "stdin-q", notes: fps !== 15 ? ["screencapture ignores fps"] : [] });
        if (env.has("ffmpeg")) {
            const screen = `Capture screen ${Math.max(0, Math.round(opts.display ?? 1) - 1)}`;
            list.push(ff(["-f", "avfoundation", "-capture_cursor", "1", "-framerate", String(fps), "-i", `${screen}:${opts.audio ? "0" : "none"}`,
                ...(reg ? ["-vf", `crop=${reg.width}:${reg.height}:${reg.x}:${reg.y}`] : [])], "mp4", reg ? ["region is cropped in capture pixels (on Retina displays points × 2)"] : []));
        }
        return list;
    }
    if (env.os === "win32") {
        if (!env.has("ffmpeg"))
            return list;
        const input = ["-f", "gdigrab", "-framerate", String(fps), "-draw_mouse", "1"];
        if (reg)
            input.push("-offset_x", String(reg.x), "-offset_y", String(reg.y), "-video_size", `${reg.width}x${reg.height}`);
        input.push("-i", opts.window ? `title=${opts.window}` : "desktop");
        list.push(ff(input, "mp4", opts.audio ? ["audio is not captured with gdigrab (needs a dshow audio device)"] : []));
        return list;
    }
    if (env.wayland && env.has("wf-recorder")) {
        const args = ["-f", out("mp4"), "-r", String(fps)];
        if (reg)
            args.push("-g", `${reg.x},${reg.y} ${reg.width}x${reg.height}`);
        if (opts.audio)
            args.push("-a");
        list.push({ backend: "wf-recorder", cmd: { file: "wf-recorder", args }, ext: "mp4", stop: "sigint", notes: [] });
    }
    if (!env.wayland && env.has("ffmpeg")) {
        const display = env.display || ":0";
        const input = ["-f", "x11grab", "-framerate", String(fps), "-draw_mouse", "1"];
        if (reg)
            input.push("-video_size", `${reg.width}x${reg.height}`);
        input.push("-i", reg ? `${display}+${reg.x},${reg.y}` : display);
        if (opts.audio)
            input.push("-f", "pulse", "-i", "default");
        list.push(ff(input, "mp4"));
    }
    return list;
}
export function buildCameraListCommand(env) {
    if (env.os === "darwin")
        return { file: "ffmpeg", args: ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""] };
    if (env.os === "win32")
        return { file: "ffmpeg", args: ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"] };
    return env.has("v4l2-ctl") ? { file: "v4l2-ctl", args: ["--list-devices"] } : { file: "ffmpeg", args: ["-hide_banner", "-sources", "v4l2"] };
}
/** Video device names from `-list_devices` output (avfoundation or dshow). */
export function parseCameraList(os, out) {
    const names = [];
    if (os === "darwin") {
        let inVideo = false;
        for (const l of out.split(/\r?\n/)) {
            if (/AVFoundation video devices/i.test(l)) {
                inVideo = true;
                continue;
            }
            if (/AVFoundation audio devices/i.test(l))
                inVideo = false;
            const m = inVideo && l.match(/\]\s*\[(\d+)\]\s*(.+)$/);
            if (m)
                names.push(`${m[1]}: ${m[2].trim()}`);
        }
        return names;
    }
    if (os === "win32") {
        let legacyVideo = false;
        for (const l of out.split(/\r?\n/)) {
            const m = l.match(/"([^"]+)"\s*\((video|audio|none)\)/); // ffmpeg ≥ 4.4 format
            if (m) {
                if (m[2] === "video")
                    names.push(m[1]);
                continue;
            }
            if (/DirectShow video devices/i.test(l)) {
                legacyVideo = true;
                continue;
            }
            if (/DirectShow audio devices/i.test(l))
                legacyVideo = false;
            const q = legacyVideo && !/Alternative name/i.test(l) && l.match(/\]\s*"([^"]+)"/);
            if (q)
                names.push(q[1]);
        }
        return names;
    }
    return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /\/dev\/video\d+/.test(s) || (s && !s.startsWith("/")));
}
/** Pure: the ffmpeg command for a photo (-frames:v 1) or a clip (-t). `device` must be resolved (dshow needs a name). */
export function buildCameraCommand(env, opts, outPath) {
    const video = opts.mode === "video";
    const dur = Math.max(1, Math.min(120, Math.round(Number(opts.duration) || 5)));
    const dev = opts.device === undefined || opts.device === "" ? undefined : String(opts.device);
    const tail = video ? ["-t", String(dur), "-pix_fmt", "yuv420p", outPath] : ["-ss", "0.8", "-frames:v", "1", "-update", "1", outPath];
    const head = ["-hide_banner", "-loglevel", "error", "-y"];
    if (env.os === "darwin") {
        // avfoundation accepts an index or the device name; "0" is the default camera
        return { file: "ffmpeg", args: [...head, "-f", "avfoundation", "-framerate", "30", "-video_size", "1280x720", "-i", (dev ?? "0").match(/^(\d+):/)?.[1] ?? dev ?? "0", ...tail] };
    }
    if (env.os === "win32") {
        if (!dev)
            throw new Error("dshow needs a camera name (use device=list)");
        return { file: "ffmpeg", args: [...head, "-f", "dshow", "-i", `video=${dev}`, ...tail] };
    }
    const path = !dev ? "/dev/video0" : /^\d+$/.test(dev) ? `/dev/video${dev}` : dev;
    return { file: "ffmpeg", args: [...head, "-f", "v4l2", "-framerate", "30", "-video_size", "1280x720", "-i", path, ...tail] };
}
/** macOS: prints true/false — whether the app running the harness has Screen Recording permission. */
export const MAC_SCREEN_PERMISSION_CHECK = {
    file: "osascript", args: ["-l", "JavaScript", "-e", 'ObjC.bindFunction("CGPreflightScreenCaptureAccess", ["bool", []]); $.CGPreflightScreenCaptureAccess()'],
};
export const MAC_SCREEN_PERMISSION_MESSAGE = "error: macOS Screen Recording permission is missing for the app running the harness (Terminal / your editor / node). " +
    "Without it captures show only the desktop wallpaper and menu bar. Allow it in System Settings → Privacy & Security → Screen Recording, " +
    "then quit and reopen that app. (Set capture.skip_permission_check: true to capture anyway.)";
export const runCmd = (c, timeoutMs, signal) => new Promise((res) => {
    try {
        const p = execFile(c.file, c.args, { timeout: timeoutMs, maxBuffer: 8 << 20, windowsHide: true, signal }, (err, stdout, stderr) => {
            const code = err ? (typeof err.code === "number" ? err.code : null) : 0;
            res({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") || (err && code === null ? String(err.message) : "") });
        });
        if (c.stdin !== undefined)
            p.stdin?.end(c.stdin);
    }
    catch (e) {
        res({ code: null, stdout: "", stderr: String(e?.message ?? e) });
    }
});
export function permissionHint(os, file, msg) {
    if (/ENOENT/.test(msg))
        return `${file} is not installed (${msg.trim()})`;
    if (os === "darwin" && file === "screencapture" && /could not create image|not permitted|not authorized|denied/i.test(msg))
        return `${msg.trim()}\nmacOS blocked the capture: allow the app running the harness (Terminal / your editor / node) in System Settings → Privacy & Security → Screen Recording, then restart that app.`;
    if (os === "darwin" && file === "ffmpeg" && /not authorized|denied|permission|Failed to create AV capture/i.test(msg))
        return `${msg.trim()}\nmacOS blocked the device: allow the app running the harness in System Settings → Privacy & Security → Camera (or Screen Recording / Microphone).`;
    return msg.trim();
}
/** Width × height from a PNG or JPEG header (no decoding). */
export function imageSize(path) {
    let fd;
    try {
        fd = openSync(path, "r");
        const buf = Buffer.alloc(65536);
        const len = readSync(fd, buf, 0, buf.length, 0);
        if (len >= 24 && buf.readUInt32BE(0) === 0x89504e47)
            return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
        if (len > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
            let i = 2;
            while (i + 9 < len) {
                if (buf[i] !== 0xff) {
                    i++;
                    continue;
                }
                const m = buf[i + 1];
                if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
                    return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
                i += 2 + buf.readUInt16BE(i + 2);
            }
        }
    }
    catch { /* unknown */ }
    finally {
        if (fd !== undefined)
            try {
                closeSync(fd);
            }
            catch { /* */ }
    }
    return undefined;
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
const fmtBytes = (b) => (b > 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const sizeOf = (p) => { try {
    return statSync(p).size;
}
catch {
    return 0;
} };
const sleep = (ms, signal) => new Promise((res) => { const t = setTimeout(res, ms); signal?.addEventListener?.("abort", () => { clearTimeout(t); res(); }, { once: true }); });
function outputPath(ctx, given, prefix, ext) {
    if (given) {
        const p = String(given);
        return isAbsolute(p) ? p : resolve(ctx.cwd, p);
    }
    return join(ctx.rt.home, "files", "captures", `${prefix}-${stamp()}.${ext}`);
}
const ensureDir = (p) => mkdirSync(dirname(p), { recursive: true });
/** Active recordings, one per session id. */
export const recordings = new Map();
const MAX_RECORD_MS = 30 * 60 * 1000;
let exitHook = false;
function installExitHook() {
    if (exitHook)
        return;
    exitHook = true;
    process.once("exit", () => { for (const r of recordings.values())
        try {
            r.proc.kill("SIGINT");
        }
        catch { /* */ } });
}
async function stopRecording(r) {
    r.timers.forEach(clearTimeout);
    if (!r.done) {
        try {
            if (r.stop === "stdin-q")
                r.proc.stdin?.write("q\n");
            else
                r.proc.kill("SIGINT");
        }
        catch { /* already gone */ }
        const t1 = await Promise.race([r.exited.then(() => true), sleep(4000).then(() => false)]);
        if (!t1 && !r.done) {
            try {
                r.proc.kill("SIGINT");
            }
            catch { /* */ }
            const t2 = await Promise.race([r.exited.then(() => true), sleep(8000).then(() => false)]);
            if (!t2 && !r.done) {
                try {
                    r.proc.kill("SIGKILL");
                }
                catch { /* */ }
                await Promise.race([r.exited, sleep(2000)]);
            }
        }
    }
    try {
        r.proc.stdin?.end();
    }
    catch { /* */ }
    if (recordings.get(r.sessionId) === r)
        recordings.delete(r.sessionId);
}
function recordingSummary(r, verb) {
    const secs = ((Date.now() - r.startedAt) / 1000).toFixed(1);
    const size = sizeOf(r.path);
    if (!size) {
        const err = r.stderr.trim().split(/\r?\n/).slice(-4).join("\n");
        return `error: recording ${verb} but no video was written to ${r.path}${err ? `\n${permissionHint(process.platform, r.backend, err)}` : ""}`;
    }
    return `${verb === "stopped" ? "Stopped recording" : "Recording finished"}: ${r.path}\nduration ≈ ${secs}s · ${fmtBytes(size)} · backend ${r.backend}` +
        (r.notes.length ? `\nnote: ${r.notes.join("; ")}` : "") +
        `\nTo inspect it, extract frames (e.g. ffmpeg -i ${JSON.stringify(r.path)} -vf fps=1 frame-%02d.png) and use vision_analyze.`;
}
export function makeCaptureTools(deps = {}) {
    let cached;
    const getEnv = () => (cached ??= deps.env ?? detectCaptureEnv());
    const run = deps.run ?? runCmd;
    const spawnProc = deps.spawn ?? ((file, args) => nodeSpawn(file, args, { stdio: ["pipe", "ignore", "pipe"], windowsHide: true }));
    const startupMs = deps.startupMs ?? 2000;
    /** macOS: null when allowed (or unknown), else the permission message */
    const screenPermission = async (ctx) => {
        if (getEnv().os !== "darwin" || ctx.rt.cfg?.data?.capture?.skip_permission_check === true)
            return null;
        const r = await run(MAC_SCREEN_PERMISSION_CHECK, 15000, ctx.signal);
        return r.code === 0 && r.stdout.trim() === "false" ? MAC_SCREEN_PERMISSION_MESSAGE : null;
    };
    const disabled = (rt) => (rt?.cfg?.data?.capture?.enabled === false ? "capture tools disabled (capture.enabled: false)" : true);
    // ------------------------------------------------------------------ screen_capture
    const screenCapture = {
        name: "screen_capture", toolset: "capture", tier: "standard",
        description: "Save a screenshot as testing evidence (macOS, Windows, Linux). target=screen (all screens, default) | region (x,y,width,height) | " +
            "window (app name or window-title substring) | display (1-based monitor number). Options: delay seconds, cursor, format png|jpg, path. " +
            "Returns the saved file path; inspect it with vision_analyze.",
        parameters: obj({
            target: enm(["screen", "region", "window", "display"], "what to capture (default screen)"),
            x: int("region left (screen points)"), y: int("region top"), width: int("region width"), height: int("region height"),
            window: str("for target=window: application name (e.g. Safari) or part of the window title"),
            display: int("for target=display: monitor number, 1 = main"),
            delay: num("seconds to wait before capturing"),
            cursor: bool("include the mouse pointer"),
            format: enm(["png", "jpg"], "image format (default png)"),
            path: str("output file (relative to the working directory); default <home>/files/captures/shot-<time>.<ext>"),
        }),
        available: (rt) => disabled(rt),
        async handler(a, ctx) {
            const env = getEnv();
            const target = a.target ?? "screen";
            if (!["screen", "region", "window", "display"].includes(target))
                return `error: unknown target ${target}`;
            const fmt = a.format === "jpg" || a.format === "jpeg" ? "jpg" : "png";
            if (ctx.rt.cfg?.data?.desktop?.approve_reads === true) {
                const ok = await ctx.requestApproval({ tool: "screen_capture", command: `screen_capture:${target}`, reason: "take a screenshot" });
                if (!ok)
                    return `BLOCKED: the user did not approve the screenshot. Do not retry it; ask the user.`;
            }
            const denied = await screenPermission(ctx);
            if (denied)
                return denied;
            const out = outputPath(ctx, a.path, "shot", fmt);
            const opts = { ...a, target, format: fmt };
            const notes = [];
            try {
                ensureDir(out);
                if (target === "window") {
                    if (!a.window)
                        return "error: window (app name or title substring) is required for target=window";
                    const look = buildWindowLookupCommand(env, String(a.window));
                    if (look) {
                        const r = await run(look, 20000, ctx.signal);
                        if (r.code !== 0)
                            return `error: ${permissionHint(env.os, look.file, r.stderr || r.stdout || `exit ${r.code}`)}`;
                        opts.windowId = parseWindowLookup(env, r.stdout, String(a.window));
                    }
                }
                if (env.os !== "darwin" && a.delay > 0)
                    await sleep(Math.min(120, Number(a.delay)) * 1000, ctx.signal);
                if (env.os === "linux" && target === "display")
                    notes.push("on Linux the whole X screen / all outputs are captured (display selection is not supported)");
                if (a.cursor && env.os === "linux" && !env.wayland && env.has("import"))
                    notes.push("ImageMagick import does not draw the cursor");
                const cmds = buildScreenshotCommand(env, opts, out);
                const timeout = 30000 + (env.os === "darwin" && a.delay > 0 ? Number(a.delay) * 1000 : 0);
                for (const c of cmds) {
                    const r = await run(c, timeout, ctx.signal);
                    if (r.code !== 0)
                        return `error: ${permissionHint(env.os, c.file, r.stderr || r.stdout || `${c.file} exited with ${r.code}`)}`;
                }
            }
            catch (e) {
                return `error: ${e.message}`;
            }
            if (!existsSync(out) || !sizeOf(out)) {
                return env.os === "darwin"
                    ? `error: screenshot was not created. ${permissionHint("darwin", "screencapture", "could not create image")}`
                    : "error: screenshot was not created";
            }
            const dim = imageSize(out);
            return `Saved screenshot to ${out}${dim ? ` (${dim.width}×${dim.height} px)` : ""}.` +
                (notes.length ? `\nnote: ${notes.join("; ")}` : "") +
                `\nInspect it with vision_analyze (image=${out}).`;
        },
    };
    // ------------------------------------------------------------------ screen_record
    const screenRecord = {
        name: "screen_record", toolset: "capture", tier: "standard",
        description: "Record the screen to a video file as testing evidence. action=start (needs user approval) | stop | status. " +
            "duration seconds records that long then stops by itself (≤60 s waits and returns the file); without duration it runs in the background until action=stop (safety cap 30 min). " +
            "Options: fps (default 15), region {x,y,width,height}, audio, path. Uses screencapture on macOS, ffmpeg (gdigrab/x11grab/avfoundation) or wf-recorder.",
        parameters: obj({
            action: enm(["start", "stop", "status"], "start (default), stop or status"),
            duration: num("seconds to record; omit to record until action=stop"),
            path: str("output video file; default <home>/files/captures/rec-<time>.mov|.mp4"),
            fps: int("frames per second (default 15; ffmpeg/wf-recorder)"),
            region: obj({ x: int("left"), y: int("top"), width: int("width"), height: int("height") }, ["x", "y", "width", "height"]),
            audio: bool("also record the default microphone (default false)"),
        }),
        available: (rt) => disabled(rt),
        async handler(a, ctx) {
            const env = getEnv();
            const sid = ctx.session?.id ?? "default";
            const action = a.action ?? "start";
            if (action === "status") {
                if (!recordings.size)
                    return "No active screen recordings.";
                return [...recordings.values()].map((r) => `${r.sessionId === sid ? "* " : "  "}${r.path} · ${r.backend} · ${((Date.now() - r.startedAt) / 1000).toFixed(0)}s${r.done ? " (finished)" : ""}`).join("\n");
            }
            if (action === "stop") {
                const r = recordings.get(sid);
                if (!r)
                    return "error: no active recording in this session (action=status lists them).";
                await stopRecording(r);
                return recordingSummary(r, "stopped");
            }
            if (action !== "start")
                return `error: unknown action ${action}`;
            if (recordings.has(sid) && !recordings.get(sid).done)
                return `error: already recording to ${recordings.get(sid).path}; call action=stop first.`;
            let region;
            try {
                region = parseRegion(a.region);
            }
            catch (e) {
                return `error: ${e.message}`;
            }
            const duration = a.duration !== undefined && Number(a.duration) > 0 ? Number(a.duration) : undefined;
            const base = a.path ? outputPath(ctx, a.path, "rec", "mp4") : outputPath(ctx, undefined, "rec", "{ext}");
            const cands = buildRecordCommands(env, { duration, fps: a.fps, region, audio: !!a.audio }, base);
            if (!cands.length)
                return installMessage(env.os, "screen recorder");
            const denied = await screenPermission(ctx);
            if (denied)
                return denied;
            const what = `${region ? `region ${region.x},${region.y} ${region.width}x${region.height}` : "the screen"}${duration ? ` for ${duration}s` : " until stopped"}${a.audio ? " with microphone audio" : ""}`;
            const ok = await ctx.requestApproval({ tool: "screen_record", command: `screen_record:start ${what}`, reason: "record the screen" });
            if (!ok)
                return `BLOCKED: the user did not approve recording ${what}. Do not retry it; ask the user.`;
            const failures = [];
            for (const c of cands) {
                const path = c.cmd.args[c.cmd.args.length - 1];
                try {
                    ensureDir(path);
                }
                catch (e) {
                    return `error: ${e.message}`;
                }
                let proc;
                try {
                    proc = spawnProc(c.cmd.file, c.cmd.args);
                }
                catch (e) {
                    failures.push(`${c.backend}: ${e.message}`);
                    continue;
                }
                const rec = { sessionId: sid, path, backend: c.backend, stop: c.stop, startedAt: Date.now(), proc, done: false, code: null, stderr: "", timers: [], notes: c.notes, exited: Promise.resolve(null) };
                rec.exited = new Promise((res) => {
                    proc.once("error", (e) => { rec.stderr += String(e.message); rec.done = true; res(null); });
                    proc.once("exit", (code) => { rec.done = true; rec.code = code; res(code); });
                });
                proc.stderr?.on("data", (d) => { rec.stderr = (rec.stderr + d).slice(-4000); });
                const early = await Promise.race([rec.exited.then(() => true), sleep(startupMs).then(() => false)]);
                if (early && (rec.code !== 0 || !sizeOf(path))) {
                    const msg = rec.stderr.trim().split(/\r?\n/).slice(-3).join(" ") || `exit ${rec.code}`;
                    failures.push(`${c.backend}: ${permissionHint(env.os, c.backend, msg)}`);
                    continue;
                }
                recordings.set(sid, rec);
                installExitHook();
                if (rec.done) {
                    recordings.delete(sid);
                    return recordingSummary(rec, "finished");
                }
                const capMs = duration ? duration * 1000 + 15000 : MAX_RECORD_MS;
                const t = setTimeout(() => { void stopRecording(rec); }, capMs);
                t.unref?.();
                rec.timers.push(t);
                if (duration && c.backend === "wf-recorder") {
                    const t2 = setTimeout(() => { void stopRecording(rec); }, duration * 1000);
                    t2.unref?.();
                    rec.timers.push(t2);
                }
                if (duration && duration <= 60) {
                    ctx.progress?.(`recording ${what}…`);
                    await Promise.race([rec.exited, sleep(duration * 1000 + 20000, ctx.signal)]);
                    await stopRecording(rec);
                    return recordingSummary(rec, "finished");
                }
                return `Recording ${what} with ${c.backend} → ${path}` +
                    (duration ? `\nIt stops by itself after ${duration}s; action=stop ends it early.` : `\nCall screen_record action=stop to finish (auto-stops after 30 min).`) +
                    (c.notes.length ? `\nnote: ${c.notes.join("; ")}` : "");
            }
            const hasFfmpeg = cands.some((c) => c.backend === "ffmpeg");
            return `error: could not start screen recording.\n${failures.join("\n")}` +
                (env.os === "darwin" && !hasFfmpeg ? `\nmacOS screencapture -v can refuse to record when not run from an interactive session. Install ffmpeg as a fallback recorder: ${FFMPEG_INSTALL.darwin} (and allow Screen Recording for the app running the harness).` : "");
        },
    };
    // ------------------------------------------------------------------ camera_capture
    const cameraCapture = {
        name: "camera_capture", toolset: "capture", tier: "standard",
        description: "Take a photo or a short video clip with the computer's camera (needs user approval every time). mode=photo (default) | video (duration seconds, default 5, max 120). " +
            "device: camera name or index; device=list lists cameras. Uses ffmpeg (avfoundation / dshow / v4l2).",
        parameters: obj({
            mode: enm(["photo", "video"], "photo (default) or video"),
            duration: num("video length in seconds (default 5, max 120)"),
            device: str("camera name or index; 'list' returns the available cameras"),
            path: str("output file; default <home>/files/captures/cam-<time>.jpg|.mp4"),
        }),
        available: (rt) => disabled(rt),
        async handler(a, ctx) {
            const env = getEnv();
            const device = a.device === undefined || a.device === null ? undefined : String(a.device).trim();
            const listing = device?.toLowerCase() === "list";
            const ffNeeded = !(listing && env.os === "linux");
            if (ffNeeded && !env.has("ffmpeg"))
                return installMessage(env.os, "camera backend");
            if (listing)
                return listCameras(env);
            const video = a.mode === "video";
            const duration = Math.max(1, Math.min(120, Math.round(Number(a.duration) || 5)));
            const what = video ? `record ${duration}s of camera video` : "take a camera photo";
            const ok = await ctx.requestApproval({ tool: "camera_capture", command: `camera_capture:${video ? "video" : "photo"} ${what}${device ? ` (device ${device})` : ""}`, reason: "use the camera" });
            if (!ok)
                return `BLOCKED: the user did not approve using the camera. Do not retry it; ask the user.`;
            let dev = device || undefined;
            if (env.os === "win32" && !dev) {
                const names = await cameraNames(env);
                if (!names.length)
                    return "error: no camera found (ffmpeg -list_devices true -f dshow -i dummy listed none)";
                dev = names[0];
            }
            else if (env.os === "win32" && /^\d+$/.test(dev)) {
                const names = await cameraNames(env);
                dev = names[Number(dev)] ?? dev;
            }
            const out = outputPath(ctx, a.path, "cam", video ? "mp4" : "jpg");
            try {
                ensureDir(out);
            }
            catch (e) {
                return `error: ${e.message}`;
            }
            let cmd;
            try {
                cmd = buildCameraCommand(env, { mode: video ? "video" : "photo", duration, device: dev }, out);
            }
            catch (e) {
                return `error: ${e.message}`;
            }
            if (video)
                ctx.progress?.(`recording ${duration}s from the camera…`);
            const r = await run(cmd, (video ? duration : 3) * 1000 + 30000, ctx.signal);
            if (r.code !== 0 || !sizeOf(out))
                return `error: camera capture failed: ${permissionHint(env.os, "ffmpeg", (r.stderr || r.stdout).trim().split(/\r?\n/).slice(-4).join("\n") || `exit ${r.code}`)}`;
            const dim = video ? undefined : imageSize(out);
            return `Saved camera ${video ? `video (${duration}s, ${fmtBytes(sizeOf(out))})` : "photo"} to ${out}${dim ? ` (${dim.width}×${dim.height} px)` : ""}.` +
                (video ? "" : `\nInspect it with vision_analyze (image=${out}).`);
        },
    };
    async function cameraNames(env) {
        const r = await run(buildCameraListCommand(env), 20000);
        return parseCameraList(env.os, r.stderr + "\n" + r.stdout);
    }
    async function listCameras(env) {
        if (env.os === "linux") {
            let devs = [];
            try {
                devs = readdirSync("/dev").filter((f) => /^video\d+$/.test(f)).map((f) => `/dev/${f}`);
            }
            catch { /* */ }
            if (env.has("v4l2-ctl")) {
                const r = await run(buildCameraListCommand(env), 20000);
                if (r.stdout.trim())
                    return `Cameras (v4l2-ctl --list-devices):\n${r.stdout.trim()}`;
            }
            return devs.length ? `Video devices:\n${devs.join("\n")}` : "No /dev/video* devices found.";
        }
        const names = await cameraNames(env);
        return names.length ? `Cameras (${env.os === "darwin" ? "index: name, use the index or name as device" : "use the name as device"}):\n${names.join("\n")}` : "No cameras found.";
    }
    return [screenCapture, screenRecord, cameraCapture];
}
export const captureTools = makeCaptureTools();

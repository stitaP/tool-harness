/**
 * desktop — operate the computer's GUI on macOS, Windows and Linux (X11 or Wayland).
 *
 * One tool, many actions: screenshot, ui_tree (on-screen controls as text, for models without vision),
 * click / double_click / right_click / move / drag / scroll, type / key, open_app / focus_app /
 * list_apps / open, cursor_position / screen_size, clipboard_read / clipboard_write.
 *
 * Everything that changes something (input, opening apps, writing the clipboard) asks for approval
 * through the normal approvals system unless the session is in yolo mode or the action matches an
 * allow pattern ("desktop:*", "desktop:type", …).
 *
 * Backends (no extra installs on macOS and Windows):
 *   macOS    screencapture · osascript (JXA + CoreGraphics events, System Events) · open · pbcopy/pbpaste
 *            needs Screen Recording + Accessibility permission for the app that runs the harness
 *   Windows  PowerShell (System.Drawing, user32 SendInput/mouse_event, SendKeys, UI Automation, Clipboard)
 *   Linux    X11: xdotool, wmctrl, xclip|xsel, import|scrot|gnome-screenshot ·
 *            Wayland: ydotool, grim, wl-copy/wl-paste · ui_tree: python3 + pyatspi (optional)
 */
import { execFile, spawn } from "node:child_process";
import { mkdirSync, statSync, existsSync } from "node:fs";
import { join, delimiter } from "node:path";
import { obj, str, int, enm } from "./types.js";
export const ACTIONS = ["screenshot", "ui_tree", "click", "double_click", "right_click", "move", "drag", "scroll",
    "type", "key", "open_app", "focus_app", "list_apps", "open", "cursor_position", "screen_size", "clipboard_read", "clipboard_write"];
const READ_ONLY = new Set(["screenshot", "ui_tree", "list_apps", "cursor_position", "screen_size", "clipboard_read"]);
export function which(bin, path = process.env.PATH ?? "") {
    const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
    for (const dir of path.split(delimiter)) {
        if (!dir)
            continue;
        for (const e of exts) {
            try {
                if (statSync(join(dir, bin + e)).isFile())
                    return true;
            }
            catch { /* next */ }
        }
    }
    return false;
}
export function detectEnv() {
    const os = (process.platform === "darwin" || process.platform === "win32") ? process.platform : "linux";
    const wayland = os === "linux" && (process.env.XDG_SESSION_TYPE === "wayland" || (!!process.env.WAYLAND_DISPLAY && !process.env.DISPLAY));
    const cache = new Map();
    return { os: os, wayland, has: (b) => { if (!cache.has(b))
            cache.set(b, which(b)); return cache.get(b); } };
}
export function availability(env) {
    if (env.os === "darwin")
        return which("osascript") || env.has("osascript") ? true : "osascript not found";
    if (env.os === "win32")
        return env.has("powershell") || env.has("pwsh") ? true : "PowerShell not found";
    if (env.wayland)
        return env.has("ydotool") || env.has("grim") ? true : "Wayland: install ydotool (input) and grim (screenshots)";
    if (!process.env.DISPLAY)
        return "no graphical display (DISPLAY is not set)";
    return env.has("xdotool") ? true : "X11: install xdotool (and xclip, wmctrl, imagemagick or scrot)";
}
// ----------------------------------------------------------------------------- key names
const KEY_ALIASES = {
    return: "enter", esc: "escape", del: "delete", bksp: "backspace", pgup: "pageup", pgdn: "pagedown",
    control: "ctrl", option: "alt", opt: "alt", command: "cmd", meta: "cmd", super: "cmd", win: "cmd", windows: "cmd",
    arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right", spacebar: "space",
};
const MODS = new Set(["ctrl", "alt", "shift", "cmd"]);
/** "Ctrl+Shift+T" / "cmd+c" / "Enter" → { mods: ["ctrl","shift"], key: "t" } */
export function parseCombo(combo) {
    const parts = String(combo).split(/\s*\+\s*/).filter(Boolean).map((p) => { const l = p.toLowerCase(); return KEY_ALIASES[l] ?? l; });
    if (!parts.length)
        throw new Error("empty key");
    const mods = parts.filter((p) => MODS.has(p));
    const keys = parts.filter((p) => !MODS.has(p));
    if (keys.length > 1)
        throw new Error(`one key per combo, got: ${keys.join(", ")}`);
    return { mods, key: keys[0] ?? mods.pop() };
}
const MAC_KEYCODE = {
    enter: 36, tab: 48, space: 49, backspace: 51, escape: 53, delete: 117, home: 115, end: 119, pageup: 116, pagedown: 121,
    left: 123, right: 124, down: 125, up: 126, f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101,
    f10: 109, f11: 103, f12: 111,
};
const XDO_KEY = {
    enter: "Return", tab: "Tab", space: "space", backspace: "BackSpace", escape: "Escape", delete: "Delete", home: "Home", end: "End",
    pageup: "Prior", pagedown: "Next", left: "Left", right: "Right", up: "Up", down: "Down", ctrl: "ctrl", alt: "alt", shift: "shift", cmd: "super",
};
const SENDKEYS = {
    enter: "{ENTER}", tab: "{TAB}", space: " ", backspace: "{BACKSPACE}", escape: "{ESC}", delete: "{DEL}", home: "{HOME}", end: "{END}",
    pageup: "{PGUP}", pagedown: "{PGDN}", left: "{LEFT}", right: "{RIGHT}", up: "{UP}", down: "{DOWN}",
};
// Linux evdev key codes (ydotool)
const EVDEV = {
    escape: 1, backspace: 14, tab: 15, enter: 28, ctrl: 29, shift: 42, alt: 56, space: 57, cmd: 125, home: 102, up: 103, pageup: 104,
    left: 105, right: 106, end: 107, down: 108, pagedown: 109, delete: 111,
    q: 16, w: 17, e: 18, r: 19, t: 20, y: 21, u: 22, i: 23, o: 24, p: 25, a: 30, s: 31, d: 32, f: 33, g: 34, h: 35, j: 36, k: 37, l: 38,
    z: 44, x: 45, c: 46, v: 47, b: 48, n: 49, m: 50, "1": 2, "2": 3, "3": 4, "4": 5, "5": 6, "6": 7, "7": 8, "8": 9, "9": 10, "0": 11,
};
for (let i = 1; i <= 12; i++) {
    XDO_KEY[`f${i}`] = `F${i}`;
    SENDKEYS[`f${i}`] = `{F${i}}`;
    EVDEV[`f${i}`] = i <= 10 ? 58 + i : 86 + i;
}
/** Escape text for WinForms SendKeys. */
export const sendKeysEscape = (s) => s.replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`).replace(/\r?\n/g, "{ENTER}");
// ----------------------------------------------------------------------------- script builders
const ps = (script) => ({
    file: "powershell", args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
});
const jxa = (body, ...argv) => ({ file: "osascript", args: ["-l", "JavaScript", "-e", `function run(argv) {\n${body}\n}`, ...argv] });
const WIN_PRELUDE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class U32 {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
[void][U32]::SetProcessDPIAware()
function Click([int]$x,[int]$y,[uint32]$down,[uint32]$up,[int]$n){ [void][U32]::SetCursorPos($x,$y); for($i=0;$i -lt $n;$i++){ [U32]::mouse_event($down,0,0,0,[UIntPtr]::Zero); [U32]::mouse_event($up,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60 } }
`;
const MAC_MOUSE = `
ObjC.import('CoreGraphics');
function post(type, x, y, btn, clicks) { var e = $.CGEventCreateMouseEvent(null, type, {x: x, y: y}, btn); if (clicks) $.CGEventSetIntegerValueField(e, 1, clicks); $.CGEventPost(0, e); delay(0.02); }
`;
const PY_ATSPI = `
import sys
try:
    import pyatspi
except ImportError:
    print("ui_tree needs python3-pyatspi (apt install python3-pyatspi / at-spi2-core)"); sys.exit(0)
desk = pyatspi.Registry.getDesktop(0); out = []; limit = int(sys.argv[1])
def walk(node, depth):
    if len(out) >= limit or node is None or depth > 25: return
    try:
        role = node.getRoleName(); name = (node.name or "").strip(); st = node.getState()
        ext = node.queryComponent().getExtents(pyatspi.DESKTOP_COORDS) if st.contains(pyatspi.STATE_SHOWING) else None
    except Exception: return
    if name and ext and ext.width > 0:
        out.append(f"{role} {name!r} at ({ext.x + ext.width//2},{ext.y + ext.height//2})")
    for i in range(min(node.childCount, 200)):
        try: walk(node.getChildAtIndex(i), depth + 1)
        except Exception: pass
for app in desk:
    try:
        for w in app:
            if w.getState().contains(pyatspi.STATE_ACTIVE): out.append(f"# {app.name}: {w.name}"); walk(w, 0)
    except Exception: pass
print("\\n".join(out) or "(no active window found through AT-SPI)")
`;
const need = (v, what) => { if (v === undefined || v === null || v === "" || Number.isNaN(v))
    throw new Error(`${what} is required for this action`); return v; };
const xy = (a) => [Math.round(Number(need(a.x, "x"))), Math.round(Number(need(a.y, "y")))];
/** Build the command(s) for an action. Pure: no side effects, unit-testable for every OS. */
export function build(env, a, shotPath) {
    const act = a.action;
    const limit = Math.max(10, Math.min(400, Number(a.limit) || 150));
    const amount = Math.max(1, Math.min(50, Math.round(Number(a.amount) || 5)));
    // ---------------------------------------------------------------- macOS
    if (env.os === "darwin") {
        switch (act) {
            case "screenshot": return [{ file: "screencapture", args: ["-x", "-t", "png", shotPath] }];
            case "click":
            case "double_click":
            case "right_click":
            case "move": {
                const [x, y] = xy(a);
                if (act === "move")
                    return [jxa(`${MAC_MOUSE} post(5, ${x}, ${y}, 0, 0); return "ok";`)];
                if (act === "right_click")
                    return [jxa(`${MAC_MOUSE} post(5, ${x}, ${y}, 0, 0); post(3, ${x}, ${y}, 1, 1); post(4, ${x}, ${y}, 1, 1); return "ok";`)];
                const n = act === "double_click" ? 2 : 1;
                return [jxa(`${MAC_MOUSE} post(5, ${x}, ${y}, 0, 0); for (var i = 1; i <= ${n}; i++) { post(1, ${x}, ${y}, 0, i); post(2, ${x}, ${y}, 0, i); } return "ok";`)];
            }
            case "drag": {
                const [x, y] = xy(a);
                const tx = Math.round(Number(need(a.to_x, "to_x"))), ty = Math.round(Number(need(a.to_y, "to_y")));
                return [jxa(`${MAC_MOUSE} post(5, ${x}, ${y}, 0, 0); post(1, ${x}, ${y}, 0, 1); for (var i = 1; i <= 12; i++) post(6, ${x} + (${tx} - ${x}) * i / 12, ${y} + (${ty} - ${y}) * i / 12, 0, 0); post(2, ${tx}, ${ty}, 0, 1); return "ok";`)];
            }
            case "scroll": {
                const d = a.direction ?? "down";
                const v = d === "up" ? amount : d === "down" ? -amount : 0;
                const h = d === "left" ? amount : d === "right" ? -amount : 0;
                const move = a.x !== undefined && a.y !== undefined ? `post(5, ${Math.round(a.x)}, ${Math.round(a.y)}, 0, 0);` : "";
                return [jxa(`${MAC_MOUSE} ${move} var e = $.CGEventCreateScrollWheelEvent2(null, 1, 2, ${v}, ${h}, 0); $.CGEventPost(0, e); return "ok";`)];
            }
            case "type": return [jxa(`var se = Application('System Events'); se.keystroke(argv[0]); return "ok";`, String(need(a.text, "text")))];
            case "key": {
                const { mods, key } = parseCombo(need(a.keys, "keys"));
                const using = JSON.stringify(mods.map((m) => ({ cmd: "command down", ctrl: "control down", alt: "option down", shift: "shift down" }[m])));
                const code = MAC_KEYCODE[key];
                const press = code !== undefined ? `se.keyCode(${code}, {using: ${using}})` : `se.keystroke(${JSON.stringify(key)}, {using: ${using}})`;
                return [jxa(`var se = Application('System Events'); ${press}; return "ok";`)];
            }
            case "open_app": return [{ file: "open", args: ["-a", String(need(a.app, "app"))] }];
            case "focus_app": return [jxa(`Application(argv[0]).activate(); return "ok";`, String(need(a.app, "app")))];
            case "open": return [{ file: "open", args: [String(need(a.target, "target"))] }];
            case "list_apps": return [jxa(`var p = Application('System Events').processes.whose({backgroundOnly: false}); var n = p.name(), f = p.frontmost(); return n.map(function(x, i){ return (f[i] ? '* ' : '  ') + x; }).join('\\n');`)];
            case "cursor_position": return [jxa(`ObjC.import('CoreGraphics'); var p = $.CGEventGetLocation($.CGEventCreate(null)); return Math.round(p.x) + ',' + Math.round(p.y);`)];
            case "screen_size": return [jxa(`ObjC.import('AppKit'); var f = $.NSScreen.mainScreen.frame; return f.size.width + 'x' + f.size.height;`)];
            case "clipboard_read": return [{ file: "pbpaste", args: [] }];
            case "clipboard_write": return [{ file: "pbcopy", args: [], stdin: String(need(a.text, "text")) }];
            case "ui_tree": return [jxa(`
var se = Application('System Events'); var p = se.processes.whose({frontmost: true})[0]; var out = ['# ' + p.name()];
var wins = p.windows(); if (!wins.length) return out.concat('(no windows)').join('\\n');
var w = wins[0]; out.push('window: ' + w.name());
var items = w.entireContents(); var lim = ${limit};
for (var i = 0; i < items.length && out.length < lim; i++) {
  var e = items[i], role = '', name = '', pos = null, size = null;
  try { role = e.role(); } catch (x) {}
  try { name = e.name() || e.title() || e.description() || ''; } catch (x) {}
  try { if (!name) name = String(e.value() || ''); } catch (x) {}
  try { pos = e.position(); size = e.size(); } catch (x) {}
  if (!name || !pos || !size || size[0] <= 0) continue;
  out.push(role.replace('AX', '') + ' ' + JSON.stringify(String(name).slice(0, 80)) + ' at (' + Math.round(pos[0] + size[0] / 2) + ',' + Math.round(pos[1] + size[1] / 2) + ')');
}
return out.join('\\n');`)];
        }
    }
    // ---------------------------------------------------------------- Windows
    if (env.os === "win32") {
        const run = (s) => [ps(WIN_PRELUDE + s)];
        const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
        switch (act) {
            case "screenshot": return run(`$b = [System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size); $bmp.Save(${lit(shotPath)}, [System.Drawing.Imaging.ImageFormat]::Png); 'ok'`);
            case "click": {
                const [x, y] = xy(a);
                return run(`Click ${x} ${y} 0x02 0x04 1; 'ok'`);
            }
            case "double_click": {
                const [x, y] = xy(a);
                return run(`Click ${x} ${y} 0x02 0x04 2; 'ok'`);
            }
            case "right_click": {
                const [x, y] = xy(a);
                return run(`Click ${x} ${y} 0x08 0x10 1; 'ok'`);
            }
            case "move": {
                const [x, y] = xy(a);
                return run(`[void][U32]::SetCursorPos(${x}, ${y}); 'ok'`);
            }
            case "drag": {
                const [x, y] = xy(a);
                const tx = Math.round(Number(need(a.to_x, "to_x"))), ty = Math.round(Number(need(a.to_y, "to_y")));
                return run(`[void][U32]::SetCursorPos(${x},${y}); [U32]::mouse_event(0x02,0,0,0,[UIntPtr]::Zero); for($i=1;$i -le 12;$i++){ [void][U32]::SetCursorPos([int](${x}+(${tx}-${x})*$i/12),[int](${y}+(${ty}-${y})*$i/12)); Start-Sleep -Milliseconds 15 }; [U32]::mouse_event(0x04,0,0,0,[UIntPtr]::Zero); 'ok'`);
            }
            case "scroll": {
                const d = a.direction ?? "down";
                const horiz = d === "left" || d === "right";
                const sign = d === "up" || d === "right" ? 1 : -1;
                const move = a.x !== undefined && a.y !== undefined ? `[void][U32]::SetCursorPos(${Math.round(a.x)}, ${Math.round(a.y)}); ` : "";
                return run(`${move}[U32]::mouse_event(${horiz ? "0x01000" : "0x0800"},0,0,${sign * 120 * amount},[UIntPtr]::Zero); 'ok'`);
            }
            case "type": return run(`[System.Windows.Forms.SendKeys]::SendWait(${lit(sendKeysEscape(String(need(a.text, "text"))))}); 'ok'`);
            case "key": {
                const { mods, key } = parseCombo(need(a.keys, "keys"));
                if (mods.includes("cmd")) { // Windows key: SendKeys cannot send it → keybd_event
                    const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : { enter: 0x0d, tab: 0x09, escape: 0x1b, left: 0x25, up: 0x26, right: 0x27, down: 0x28, space: 0x20 }[key] ?? 0;
                    return run(`[U32]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); ${vk ? `[U32]::keybd_event(${vk},0,0,[UIntPtr]::Zero); [U32]::keybd_event(${vk},0,2,[UIntPtr]::Zero); ` : ""}[U32]::keybd_event(0x5B,0,2,[UIntPtr]::Zero); 'ok'`);
                }
                const prefix = mods.map((m) => ({ ctrl: "^", alt: "%", shift: "+" }[m])).join("");
                const k = SENDKEYS[key] ?? (key.length === 1 ? sendKeysEscape(key) : `{${key.toUpperCase()}}`);
                return run(`[System.Windows.Forms.SendKeys]::SendWait(${lit(prefix + k)}); 'ok'`);
            }
            case "open_app": return run(`Start-Process ${lit(String(need(a.app, "app")))}; 'ok'`);
            case "open": return run(`Start-Process ${lit(String(need(a.target, "target")))}; 'ok'`);
            case "focus_app": return run(`$w = New-Object -ComObject WScript.Shell; $p = Get-Process | Where-Object { $_.MainWindowTitle -and ($_.ProcessName -like ${lit(String(need(a.app, "app")))} -or $_.MainWindowTitle -like ('*' + ${lit(String(a.app))} + '*')) } | Select-Object -First 1; if (-not $p) { throw 'no window found for that app' }; [void]$w.AppActivate($p.Id); 'ok'`);
            case "list_apps": return run(`$fg = [U32]::GetForegroundWindow(); Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { $(if ($_.MainWindowHandle -eq $fg) { '* ' } else { '  ' }) + $_.ProcessName + ' - ' + $_.MainWindowTitle }`);
            case "cursor_position": return run(`$p = [System.Windows.Forms.Cursor]::Position; "$($p.X),$($p.Y)"`);
            case "screen_size": return run(`$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "$($b.Width)x$($b.Height)"`);
            case "clipboard_read": return run(`Get-Clipboard -Raw`);
            case "clipboard_write": return [{ ...ps(WIN_PRELUDE + `Set-Clipboard -Value ([Console]::In.ReadToEnd()); 'ok'`), stdin: String(need(a.text, "text")) }];
            case "ui_tree": return run(`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::FromHandle([U32]::GetForegroundWindow())
$out = New-Object System.Collections.Generic.List[string]; $out.Add('# ' + $root.Current.Name)
$all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
foreach ($e in $all) { if ($out.Count -ge ${limit}) { break }; $c = $e.Current; if (-not $c.Name -or $c.IsOffscreen) { continue }; $r = $c.BoundingRectangle; if ($r.Width -le 0) { continue }
  $out.Add($c.ControlType.ProgrammaticName.Replace('ControlType.','') + ' ' + ($c.Name.Substring(0, [Math]::Min(80, $c.Name.Length)) | ConvertTo-Json) + ' at (' + [int]($r.X + $r.Width/2) + ',' + [int]($r.Y + $r.Height/2) + ')') }
$out -join "\`n"`);
        }
    }
    // ---------------------------------------------------------------- Linux
    const xdo = (...args) => ({ file: "xdotool", args });
    const ydo = (...args) => ({ file: "ydotool", args });
    switch (act) {
        case "screenshot":
            if (env.wayland)
                return [{ file: "grim", args: [shotPath] }];
            if (env.has("import"))
                return [{ file: "import", args: ["-window", "root", shotPath] }];
            if (env.has("scrot"))
                return [{ file: "scrot", args: ["-o", shotPath] }];
            if (env.has("gnome-screenshot"))
                return [{ file: "gnome-screenshot", args: ["-f", shotPath] }];
            if (env.has("spectacle"))
                return [{ file: "spectacle", args: ["-b", "-n", "-o", shotPath] }];
            throw new Error("no screenshot tool: install imagemagick (import), scrot or gnome-screenshot");
        case "click":
        case "double_click":
        case "right_click":
        case "move": {
            const [x, y] = xy(a);
            if (env.wayland) {
                const mv = ydo("mousemove", "--absolute", "-x", String(x), "-y", String(y));
                if (act === "move")
                    return [mv];
                const code = act === "right_click" ? "0xC1" : "0xC0";
                return [mv, ydo("click", ...(act === "double_click" ? ["--repeat", "2"] : []), code)];
            }
            if (act === "move")
                return [xdo("mousemove", "--sync", String(x), String(y))];
            return [xdo("mousemove", "--sync", String(x), String(y), "click", ...(act === "double_click" ? ["--repeat", "2", "--delay", "80"] : []), act === "right_click" ? "3" : "1")];
        }
        case "drag": {
            const [x, y] = xy(a);
            const tx = String(Math.round(Number(need(a.to_x, "to_x")))), ty = String(Math.round(Number(need(a.to_y, "to_y"))));
            if (env.wayland)
                return [ydo("mousemove", "--absolute", "-x", String(x), "-y", String(y)), ydo("click", "0x40"), ydo("mousemove", "--absolute", "-x", tx, "-y", ty), ydo("click", "0x80")];
            return [xdo("mousemove", "--sync", String(x), String(y), "mousedown", "1", "mousemove", "--sync", tx, ty, "mouseup", "1")];
        }
        case "scroll": {
            const d = a.direction ?? "down";
            if (env.wayland)
                return [ydo("mousemove", "--wheel", "-x", String(d === "left" ? -amount : d === "right" ? amount : 0), "-y", String(d === "up" ? amount : d === "down" ? -amount : 0))];
            const btn = { up: "4", down: "5", left: "6", right: "7" }[d];
            const pre = a.x !== undefined && a.y !== undefined ? ["mousemove", "--sync", String(Math.round(a.x)), String(Math.round(a.y))] : [];
            return [xdo(...pre, "click", "--repeat", String(amount), "--delay", "30", btn)];
        }
        case "type":
            return env.wayland ? [ydo("type", "--", String(need(a.text, "text")))] : [xdo("type", "--delay", "12", "--", String(need(a.text, "text")))];
        case "key": {
            const { mods, key } = parseCombo(need(a.keys, "keys"));
            if (env.wayland) {
                const codes = [...mods, key].map((k) => { const c = EVDEV[k]; if (c === undefined)
                    throw new Error(`key "${k}" is not supported on Wayland`); return c; });
                return [ydo("key", ...codes.map((c) => `${c}:1`), ...[...codes].reverse().map((c) => `${c}:0`))];
            }
            return [xdo("key", "--clearmodifiers", [...mods, key].map((k) => XDO_KEY[k] ?? k).join("+"))];
        }
        case "open_app": {
            const app = String(need(a.app, "app"));
            return [env.has("gtk-launch") && !app.includes("/") ? { file: "gtk-launch", args: [app], detached: true } : { file: app, args: [], detached: true }];
        }
        case "open": return [{ file: "xdg-open", args: [String(need(a.target, "target"))], detached: true }];
        case "focus_app":
            {
                const viaXdo = xdo("search", "--onlyvisible", "--name", String(need(a.app, "app")), "windowactivate");
                return [env.has("wmctrl") ? { file: "wmctrl", args: ["-a", String(a.app)], fallback: viaXdo } : viaXdo];
            }
        case "list_apps":
            {
                const viaXdo = xdo("search", "--onlyvisible", "--name", ".", "getwindowname", "%@");
                return [env.has("wmctrl") ? { file: "wmctrl", args: ["-l", "-p"], fallback: viaXdo } : viaXdo];
            }
        case "cursor_position": return [xdo("getmouselocation", "--shell")];
        case "screen_size": return [xdo("getdisplaygeometry")];
        case "clipboard_read":
            if (env.wayland)
                return [{ file: "wl-paste", args: ["--no-newline"] }];
            return [env.has("xclip") ? { file: "xclip", args: ["-selection", "clipboard", "-o"] } : { file: "xsel", args: ["--clipboard", "--output"] }];
        case "clipboard_write": {
            const t = String(need(a.text, "text"));
            if (env.wayland)
                return [{ file: "wl-copy", args: [], stdin: t }];
            return [env.has("xclip") ? { file: "xclip", args: ["-selection", "clipboard", "-i"], stdin: t } : { file: "xsel", args: ["--clipboard", "--input"], stdin: t }];
        }
        case "ui_tree": return [{ file: "python3", args: ["-c", PY_ATSPI, String(limit)] }];
    }
    throw new Error(`unknown action: ${act}`);
}
// ----------------------------------------------------------------------------- execution
export async function exec(c, timeoutMs = 30000, signal) {
    if (c.fallback) {
        try {
            return await exec({ ...c, fallback: undefined }, timeoutMs, signal);
        }
        catch {
            return exec(c.fallback, timeoutMs, signal);
        }
    }
    if (c.detached) {
        return new Promise((resolve, reject) => {
            try {
                const p = spawn(c.file, c.args, { detached: true, stdio: "ignore" });
                p.once("error", (e) => reject(e));
                setTimeout(() => { p.unref(); resolve("started"); }, 300);
            }
            catch (e) {
                reject(e);
            }
        });
    }
    if (c.stdin !== undefined && ["xclip", "xsel", "wl-copy"].includes(c.file)) {
        // these fork a helper that owns the clipboard; never wait on its stdout or the call hangs until the timeout
        return new Promise((resolve, reject) => {
            const p = spawn(c.file, c.args, { stdio: ["pipe", "ignore", "pipe"] });
            let err = "";
            p.stderr?.on("data", (d) => { err += d; });
            p.once("error", (e) => reject(new Error(hint(c.file, String(e.message)))));
            p.once("exit", (code) => (code === 0 ? resolve("") : reject(new Error(hint(c.file, err.trim() || `exit ${code}`)))));
            p.stdin?.end(c.stdin);
            setTimeout(() => resolve(""), timeoutMs).unref?.();
        });
    }
    return new Promise((resolve, reject) => {
        const p = execFile(c.file, c.args, { timeout: timeoutMs, maxBuffer: 8 << 20, windowsHide: true, signal }, (err, stdout, stderr) => {
            if (err) {
                const msg = String(stderr || err.message).trim();
                reject(new Error(hint(c.file, msg)));
            }
            else
                resolve(String(stdout).trim());
        });
        if (c.stdin !== undefined) {
            p.stdin?.end(c.stdin);
        }
    });
}
function hint(file, msg) {
    if (file === "osascript" && /not allowed|assistive|-1719|-25211|1002/i.test(msg))
        return `${msg}\nmacOS blocked this: allow the app running the harness (Terminal / your editor / node) in System Settings → Privacy & Security → Accessibility.`;
    if (file === "screencapture" && /could not create image|not permitted/i.test(msg))
        return `${msg}\nmacOS blocked the screenshot: allow it in System Settings → Privacy & Security → Screen Recording.`;
    if (/ENOENT/.test(msg))
        return `${file} is not installed (${msg})`;
    if (file === "ydotool" && /socket|ydotoold/i.test(msg))
        return `${msg}\nStart the ydotool daemon: sudo systemctl enable --now ydotoold (or run ydotoold).`;
    return msg;
}
function describe(a) {
    const at = a.x !== undefined ? ` at (${a.x},${a.y})` : "";
    switch (a.action) {
        case "type": return `type ${JSON.stringify(String(a.text ?? "").slice(0, 120))}`;
        case "key": return `press ${a.keys}`;
        case "open_app":
        case "focus_app": return `${a.action} ${a.app}`;
        case "open": return `open ${a.target}`;
        case "drag": return `drag from (${a.x},${a.y}) to (${a.to_x},${a.to_y})`;
        case "clipboard_write": return `write ${String(a.text ?? "").length} chars to the clipboard`;
        default: return `${a.action}${at}`;
    }
}
export function makeDesktopTool(deps = {}) {
    const getEnv = (() => { let e; return () => (e ??= deps.env ?? detectEnv()); })();
    const run = deps.run ?? exec;
    return {
        name: "desktop", toolset: "desktop", tier: "standard",
        description: "Operate the computer's screen, mouse, keyboard, apps and clipboard (macOS, Windows, Linux). " +
            "Look first: action=ui_tree lists the focused window's controls with their centre coordinates (works without vision); " +
            "action=screenshot saves a PNG (inspect with vision_analyze). Then act: click/double_click/right_click/move at x,y; drag to to_x,to_y; " +
            "scroll direction+amount; type text; key keys like 'cmd+c', 'ctrl+shift+t', 'Enter'; open_app app; focus_app app; list_apps; " +
            "open target (file, folder or URL with the default app); cursor_position; screen_size; clipboard_read; clipboard_write text. " +
            "Coordinates are screen points (logical pixels). Actions that change something need the user's approval.",
        parameters: obj({
            action: enm(ACTIONS, "what to do"),
            x: int("x coordinate (screen points)"), y: int("y coordinate"),
            to_x: int("drag end x"), to_y: int("drag end y"),
            text: str("text to type or to put on the clipboard"),
            keys: str("key combo, e.g. Enter, Tab, cmd+c, ctrl+shift+t, alt+F4"),
            direction: enm(["up", "down", "left", "right"], "scroll direction (default down)"),
            amount: int("scroll steps (default 5)"),
            app: str("application name, e.g. Safari, Google Chrome, notepad, firefox"),
            target: str("file path, folder or URL to open with its default app"),
            limit: int("max ui_tree lines (default 150)"),
            path: str("screenshot output path (optional)"),
        }, ["action"]),
        available(rt) {
            if (rt.cfg.data.desktop?.enabled === false)
                return "desktop tool disabled (desktop.enabled: false)";
            return availability(getEnv());
        },
        async handler(a, ctx) {
            const env = getEnv();
            if (!ACTIONS.includes(a.action))
                return `error: unknown action ${a.action}. Use one of: ${ACTIONS.join(", ")}`;
            const approveReads = ctx.rt.cfg.data.desktop?.approve_reads === true;
            if (!READ_ONLY.has(a.action) || approveReads) {
                const ok = await ctx.requestApproval({ tool: "desktop", command: `desktop:${a.action} ${describe(a)}`, reason: `operate the ${env.os === "darwin" ? "Mac" : env.os === "win32" ? "Windows PC" : "Linux desktop"}: ${describe(a)}` });
                if (!ok)
                    return `BLOCKED: the user did not approve "${describe(a)}". Do not retry it; ask the user or choose another way.`;
            }
            let shot = "";
            if (a.action === "screenshot") {
                const dir = join(ctx.rt.home, "files", "screenshots");
                mkdirSync(dir, { recursive: true });
                shot = a.path ? String(a.path) : join(dir, `desktop-${Date.now()}.png`);
            }
            let cmds;
            try {
                cmds = build(env, a, shot);
            }
            catch (e) {
                return `error: ${e.message}`;
            }
            const outs = [];
            try {
                for (const c of cmds)
                    outs.push(await run(c, a.action === "ui_tree" ? 60000 : 30000, ctx.signal));
            }
            catch (e) {
                return `error: ${e.message}`;
            }
            const out = outs.filter(Boolean).join("\n");
            switch (a.action) {
                case "screenshot":
                    return existsSync(shot) ? `Saved screenshot to ${shot}. Look at it with vision_analyze (image=${shot}), or use action=ui_tree for a text list of controls.` : `error: screenshot was not created${out ? `: ${out}` : ""}`;
                case "ui_tree":
                case "list_apps":
                case "clipboard_read": return out || "(empty)";
                case "cursor_position": {
                    const m = out.match(/X=(\d+)\s+Y=(\d+)/);
                    return m ? `${m[1]},${m[2]}` : out;
                }
                case "screen_size": return out.replace(/\s+/, "x");
                default: return `done: ${describe(a)}${out && out !== "ok" ? `\n${out}` : ""}`;
            }
        },
    };
}
export const desktopTool = makeDesktopTool();

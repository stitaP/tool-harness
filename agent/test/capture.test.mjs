// capture tools: screen_capture / screen_record / camera_capture — pure command builders per OS, install messages,
// approvals, and (macOS only) one optional live region screenshot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dist } from "./helpers.mjs";

const cap = await import(dist("tools/capture.js"));
const { buildScreenshotCommand, buildWindowLookupCommand, parseWindowLookup, buildRecordCommands, buildCameraCommand,
  buildCameraListCommand, parseCameraList, makeCaptureTools, captureTools, installMessage, parseRegion, imageSize } = cap;

const envOf = (os, { wayland = false, have = [], display = ":1" } = {}) => ({ os, wayland, display, has: (b) => have.includes(b) });
const decodePs = (c) => Buffer.from(c.args.at(-1), "base64").toString("utf16le");
const argv = (c) => [c.file, ...c.args];
const dir = mkdtempSync(join(tmpdir(), "stitap-capture-"));
const ctxOf = ({ approve = true, cfg = {}, asked = [] } = {}) => ({
  rt: { cfg: { data: cfg }, home: dir }, cwd: dir, session: { id: `s-${Math.random()}` }, signal: undefined,
  progress() {}, requestApproval: async (r) => { asked.push(r); return approve; },
});

test("exports three tools in the capture toolset", () => {
  assert.deepEqual(captureTools.map((t) => t.name), ["screen_capture", "screen_record", "camera_capture"]);
  for (const t of captureTools) { assert.equal(t.toolset, "capture"); assert.equal(t.tier, "standard"); assert.equal(t.parameters.type, "object"); }
  assert.match(captureTools[0].available({ cfg: { data: { capture: { enabled: false } } } }), /disabled/);
  assert.equal(captureTools[0].available({ cfg: { data: {} } }), true);
});

test("parseRegion accepts objects, arrays and strings", () => {
  assert.deepEqual(parseRegion({ x: 1, y: 2, width: 3, height: 4 }), { x: 1, y: 2, width: 3, height: 4 });
  assert.deepEqual(parseRegion([1, 2, 3, 4]), { x: 1, y: 2, width: 3, height: 4 });
  assert.deepEqual(parseRegion("10,20,300,200"), { x: 10, y: 20, width: 300, height: 200 });
  assert.equal(parseRegion(undefined), undefined);
  assert.throws(() => parseRegion({ x: 1, y: 2, width: 0, height: 4 }), /positive/);
});

test("macOS screenshot: screencapture flags per target/option", () => {
  const e = envOf("darwin");
  assert.deepEqual(argv(buildScreenshotCommand(e, {}, "/o.png")[0]), ["screencapture", "-x", "-t", "png", "/o.png"]);
  assert.deepEqual(argv(buildScreenshotCommand(e, { target: "region", x: 0, y: 10, width: 200, height: 120, format: "jpg" }, "/o.jpg")[0]),
    ["screencapture", "-x", "-t", "jpg", "-R", "0,10,200,120", "/o.jpg"]);
  assert.deepEqual(argv(buildScreenshotCommand(e, { target: "display", display: 2, delay: 3, cursor: true }, "/o.png")[0]),
    ["screencapture", "-x", "-t", "png", "-D", "2", "-T", "3", "-C", "/o.png"]);
  assert.deepEqual(argv(buildScreenshotCommand(e, { target: "window", window: "Safari", windowId: "194" }, "/o.png")[0]),
    ["screencapture", "-x", "-t", "png", "-o", "-l", "194", "/o.png"]);
  assert.throws(() => buildScreenshotCommand(e, { target: "region", x: 1 }, "/o.png"), /required/);
  assert.throws(() => buildScreenshotCommand(e, { target: "window" }, "/o.png"), /window/);
  // window lookup: JXA via CGWindowListCopyWindowInfo, window name passed as argv
  const look = buildWindowLookupCommand(e, "Safari");
  assert.equal(look.file, "osascript"); assert.equal(look.args.at(-1), "Safari");
  assert.match(look.args[3], /CGWindowListCopyWindowInfo/);
  assert.doesNotThrow(() => new Function(look.args[3].replace(/^function run\(argv\) \{/, "").replace(/\}$/, "")));
  assert.equal(parseWindowLookup(e, "194\tSafari\tApple\t1348x970\n", "Safari"), "194");
  assert.throws(() => parseWindowLookup(e, "NOTFOUND\tTerminal; Finder", "Nope"), /Visible windows: Terminal; Finder/);
});

test("Windows screenshot: PowerShell CopyFromScreen for screen / region / display / window", () => {
  const e = envOf("win32");
  const scr = buildScreenshotCommand(e, {}, "C:\\o.png")[0];
  assert.equal(scr.file, "powershell"); assert.ok(scr.args.includes("-EncodedCommand"));
  assert.match(decodePs(scr), /VirtualScreen/); assert.match(decodePs(scr), /CopyFromScreen/); assert.match(decodePs(scr), /ImageFormat\]::Png/);
  const reg = decodePs(buildScreenshotCommand(e, { target: "region", x: 5, y: 6, width: 70, height: 80, format: "jpg" }, "C:\\o.jpg")[0]);
  assert.match(reg, /\$L=5; \$T=6; \$W=70; \$H=80/); assert.match(reg, /ImageFormat\]::Jpeg/);
  const disp = decodePs(buildScreenshotCommand(e, { target: "display", display: 2 }, "C:\\o.png")[0]);
  assert.match(disp, /AllScreens/); assert.match(disp, /\$all\[1\]\.Bounds/);
  const win = decodePs(buildScreenshotCommand(e, { target: "window", window: "Note'pad", cursor: true }, "C:\\o.png")[0]);
  assert.match(win, /GetWindowRect/); assert.match(win, /'Note''pad'/, "window title is a quoted PowerShell literal"); assert.match(win, /Cursors\]::Default\.Draw/);
  assert.equal(buildWindowLookupCommand(e, "x"), null, "Windows finds the window inside the screenshot script");
});

test("Linux screenshot: grim on Wayland, import/scrot/gnome-screenshot/ffmpeg on X11", () => {
  const way = envOf("linux", { wayland: true, have: ["grim"] });
  assert.deepEqual(argv(buildScreenshotCommand(way, {}, "/o.png")[0]), ["grim", "-t", "png", "/o.png"]);
  assert.deepEqual(argv(buildScreenshotCommand(way, { target: "region", x: 1, y: 2, width: 30, height: 40, cursor: true, format: "jpg" }, "/o.jpg")[0]),
    ["grim", "-t", "jpeg", "-g", "1,2 30x40", "-c", "/o.jpg"]);
  assert.throws(() => buildScreenshotCommand(way, { target: "window", window: "x", windowId: "1" }, "/o.png"), /Wayland/);
  assert.throws(() => buildScreenshotCommand(envOf("linux", { wayland: true }), {}, "/o.png"), /grim/);
  const reg = { target: "region", x: 1, y: 2, width: 30, height: 40 };
  assert.deepEqual(argv(buildScreenshotCommand(envOf("linux", { have: ["import", "scrot"] }), {}, "/o.png")[0]), ["import", "-window", "root", "/o.png"]);
  assert.deepEqual(argv(buildScreenshotCommand(envOf("linux", { have: ["import"] }), reg, "/o.png")[0]), ["import", "-window", "root", "-crop", "30x40+1+2", "+repage", "/o.png"]);
  assert.deepEqual(argv(buildScreenshotCommand(envOf("linux", { have: ["scrot"] }), { ...reg, cursor: true }, "/o.png")[0]), ["scrot", "-o", "-p", "-a", "1,2,30,40", "/o.png"]);
  assert.deepEqual(argv(buildScreenshotCommand(envOf("linux", { have: ["gnome-screenshot"] }), {}, "/o.png")[0]), ["gnome-screenshot", "-f", "/o.png"]);
  const ff = buildScreenshotCommand(envOf("linux", { have: ["gnome-screenshot", "ffmpeg"] }), reg, "/o.png")[0];   // gnome-screenshot cannot do regions
  assert.equal(ff.file, "ffmpeg");
  assert.deepEqual(ff.args.slice(ff.args.indexOf("-f")), ["-f", "x11grab", "-draw_mouse", "0", "-video_size", "30x40", "-i", ":1+1,2", "-frames:v", "1", "/o.png"]);
  assert.throws(() => buildScreenshotCommand(envOf("linux"), {}, "/o.png"), /imagemagick.*scrot.*gnome-screenshot/i);
  // X11 window: xdotool lookup then import -window <id>
  assert.deepEqual(argv(buildWindowLookupCommand(envOf("linux", { have: ["xdotool"] }), "Firefox")), ["xdotool", "search", "--onlyvisible", "--name", "Firefox"]);
  assert.throws(() => buildWindowLookupCommand(envOf("linux"), "Firefox"), /xdotool/);
  assert.equal(parseWindowLookup(envOf("linux"), "4194307\n4194310\n", "Firefox"), "4194307");
  assert.deepEqual(argv(buildScreenshotCommand(envOf("linux", { have: ["import"] }), { target: "window", window: "F", windowId: "42" }, "/o.png")[0]), ["import", "-window", "42", "/o.png"]);
});

test("screen recording commands per OS", () => {
  const reg = { x: 10, y: 20, width: 640, height: 480 };
  // macOS: screencapture -v first (with -V / -R / -g), ffmpeg avfoundation fallback when installed
  const mac = buildRecordCommands(envOf("darwin", { have: ["ffmpeg"] }), { duration: 7, region: reg, audio: true, fps: 20 }, "/r.{ext}");
  assert.equal(mac.length, 2);
  assert.equal(mac[0].backend, "screencapture"); assert.equal(mac[0].stop, "stdin-q");
  assert.deepEqual(argv(mac[0].cmd), ["screencapture", "-x", "-v", "-V", "7", "-R", "10,20,640,480", "-g", "/r.mov"]);
  const ffm = mac[1].cmd.args;
  assert.equal(mac[1].backend, "ffmpeg");
  assert.deepEqual(ffm.slice(ffm.indexOf("-f"), ffm.indexOf("-f") + 9), ["-f", "avfoundation", "-capture_cursor", "1", "-framerate", "20", "-i", "Capture screen 0:0", "-vf"]);
  assert.ok(ffm.includes("crop=640:480:10:20")); assert.deepEqual(ffm.slice(-5), ["-t", "7", "-pix_fmt", "yuv420p", "/r.mp4"]);
  const macPlain = buildRecordCommands(envOf("darwin"), {}, "/r.{ext}");
  assert.equal(macPlain.length, 1, "no ffmpeg → only screencapture");
  assert.deepEqual(argv(macPlain[0].cmd), ["screencapture", "-x", "-v", "/r.mov"]);
  // Windows: gdigrab
  const win = buildRecordCommands(envOf("win32", { have: ["ffmpeg"] }), { region: reg, fps: 10 }, "C:\\r.{ext}")[0];
  assert.equal(win.cmd.file, "ffmpeg"); assert.equal(win.stop, "stdin-q");
  const wa = win.cmd.args;
  assert.deepEqual(wa.slice(wa.indexOf("-f"), wa.indexOf("-i") + 2), ["-f", "gdigrab", "-framerate", "10", "-draw_mouse", "1", "-offset_x", "10", "-offset_y", "20", "-video_size", "640x480", "-i", "desktop"]);
  assert.equal(wa.at(-1), "C:\\r.mp4"); assert.ok(!wa.includes("-t"));
  const wt = buildRecordCommands(envOf("win32", { have: ["ffmpeg"] }), { window: "Calculator" }, "C:\\r.mp4")[0].cmd.args;
  assert.ok(wt.includes("title=Calculator"));
  assert.deepEqual(buildRecordCommands(envOf("win32"), {}, "C:\\r.mp4"), []);
  // Linux Wayland: wf-recorder (SIGINT to stop); X11: ffmpeg x11grab
  const wf = buildRecordCommands(envOf("linux", { wayland: true, have: ["wf-recorder"] }), { region: reg, audio: true }, "/r.{ext}")[0];
  assert.equal(wf.stop, "sigint");
  assert.deepEqual(argv(wf.cmd), ["wf-recorder", "-f", "/r.mp4", "-r", "15", "-g", "10,20 640x480", "-a"]);
  const x11 = buildRecordCommands(envOf("linux", { have: ["ffmpeg"], display: ":0" }), { region: reg, duration: 4, audio: true }, "/r.mp4")[0].cmd.args;
  assert.deepEqual(x11.slice(x11.indexOf("-f"), x11.indexOf("-t")), ["-f", "x11grab", "-framerate", "15", "-draw_mouse", "1", "-video_size", "640x480", "-i", ":0+10,20", "-f", "pulse", "-i", "default"]);
  assert.deepEqual(buildRecordCommands(envOf("linux", { wayland: true, have: ["ffmpeg"] }), {}, "/r.mp4"), [], "Wayland without wf-recorder has no recorder");
});

test("camera commands per OS and device list parsing", () => {
  const mac = buildCameraCommand(envOf("darwin"), {}, "/c.jpg").args;
  assert.deepEqual(mac.slice(mac.indexOf("-f")), ["-f", "avfoundation", "-framerate", "30", "-video_size", "1280x720", "-i", "0", "-ss", "0.8", "-frames:v", "1", "-update", "1", "/c.jpg"]);
  const macVid = buildCameraCommand(envOf("darwin"), { mode: "video", duration: 500, device: "1: FaceTime HD Camera" }, "/c.mp4").args;
  assert.ok(macVid.includes("1")); assert.deepEqual(macVid.slice(-5), ["-t", "120", "-pix_fmt", "yuv420p", "/c.mp4"], "duration capped at 120");
  const win = buildCameraCommand(envOf("win32"), { device: "Integrated Camera", mode: "video", duration: 3 }, "C:\\c.mp4").args;
  assert.deepEqual(win.slice(win.indexOf("-f"), win.indexOf("-f") + 4), ["-f", "dshow", "-i", "video=Integrated Camera"]);
  assert.throws(() => buildCameraCommand(envOf("win32"), {}, "C:\\c.jpg"), /name/);
  const lin = buildCameraCommand(envOf("linux"), { device: "2" }, "/c.jpg").args;
  assert.deepEqual(lin.slice(lin.indexOf("-f"), lin.indexOf("-i") + 2), ["-f", "v4l2", "-framerate", "30", "-video_size", "1280x720", "-i", "/dev/video2"]);
  assert.ok(buildCameraCommand(envOf("linux"), {}, "/c.jpg").args.includes("/dev/video0"));
  assert.deepEqual(argv(buildCameraListCommand(envOf("darwin"))).slice(1), ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]);
  assert.deepEqual(argv(buildCameraListCommand(envOf("win32"))).slice(1), ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"]);
  const avf = `[AVFoundation indev @ 0x1] AVFoundation video devices:\n[AVFoundation indev @ 0x1] [0] FaceTime HD Camera\n[AVFoundation indev @ 0x1] [1] Capture screen 0\n[AVFoundation indev @ 0x1] AVFoundation audio devices:\n[AVFoundation indev @ 0x1] [0] MacBook Microphone`;
  assert.deepEqual(parseCameraList("darwin", avf), ["0: FaceTime HD Camera", "1: Capture screen 0"]);
  const ds = `[dshow @ 0x1] "Integrated Camera" (video)\n[dshow @ 0x1]   Alternative name "@device_pnp_x"\n[dshow @ 0x1] "Microphone (Realtek)" (audio)`;
  assert.deepEqual(parseCameraList("win32", ds), ["Integrated Camera"]);
  const legacy = `[dshow @ 0x1] DirectShow video devices\n[dshow @ 0x1]  "USB Cam"\n[dshow @ 0x1]     Alternative name "@x"\n[dshow @ 0x1] DirectShow audio devices\n[dshow @ 0x1]  "Mic"`;
  assert.deepEqual(parseCameraList("win32", legacy), ["USB Cam"]);
});

test("install messages when no recorder / ffmpeg is available", async () => {
  assert.match(installMessage("darwin", "x"), /brew install ffmpeg/);
  assert.match(installMessage("win32", "x"), /winget install Gyan\.FFmpeg/);
  assert.match(installMessage("linux", "x"), /sudo apt install ffmpeg/);
  const spawned = [];
  const spawn = (f, a) => { spawned.push(f); throw new Error("must not spawn"); };
  for (const [os, re] of [["win32", /winget install Gyan\.FFmpeg/], ["linux", /sudo apt install ffmpeg/]]) {
    const [, rec, cam] = makeCaptureTools({ env: envOf(os), spawn, run: async () => { throw new Error("must not run"); } });
    const asked = [];
    assert.match(await rec.handler({ action: "start" }, ctxOf({ asked })), re);
    assert.match(await cam.handler({}, ctxOf({ asked })), re);
    assert.match(await cam.handler({ mode: "video" }, ctxOf({ asked })), re);
    assert.equal(asked.length, 0, "no approval prompt when nothing can run");
  }
  const [, , macCam] = makeCaptureTools({ env: envOf("darwin"), spawn, run: async () => ({ code: 0, stdout: "true", stderr: "" }) });
  assert.match(await macCam.handler({ device: "list" }, ctxOf()), /brew install ffmpeg/);
  assert.equal(spawned.length, 0);
});

test("approvals: declined screen_record start and camera_capture spawn nothing", async () => {
  const spawned = [], ran = [];
  const spawn = (f) => { spawned.push(f); throw new Error("must not spawn"); };
  const run = async (c) => { ran.push(c.file); return { code: 0, stdout: c.file === "osascript" ? "true" : "", stderr: "" }; };
  for (const os of ["darwin", "win32", "linux"]) {
    const [shot, rec, cam] = makeCaptureTools({ env: envOf(os, { have: ["ffmpeg"] }), spawn, run });
    const asked = [];
    const r1 = await rec.handler({ action: "start", duration: 5 }, ctxOf({ approve: false, asked }));
    assert.match(r1, /^BLOCKED/, `${os} record`);
    const r2 = await cam.handler({ mode: "photo", device: "0" }, ctxOf({ approve: false, asked }));
    assert.match(r2, /^BLOCKED/, `${os} camera`);
    assert.deepEqual(asked.map((a) => a.reason), ["record the screen", "use the camera"]);
    assert.deepEqual(asked.map((a) => a.tool), ["screen_record", "camera_capture"]);
    // status / stop need no approval
    assert.match(await rec.handler({ action: "status" }, ctxOf({ approve: false, asked })), /No active/);
    assert.match(await rec.handler({ action: "stop" }, ctxOf({ approve: false, asked })), /no active recording/);
    assert.equal(asked.length, 2);
  }
  assert.deepEqual(spawned, []);
  assert.ok(!ran.includes("ffmpeg"), "ffmpeg never ran");
});

test("screen_capture asks for approval only when desktop.approve_reads is true", async () => {
  const run = async () => ({ code: 0, stdout: "", stderr: "" });
  const [shot] = makeCaptureTools({ env: envOf("win32"), run });
  const asked = [];
  const r = await shot.handler({ target: "region", x: 0, y: 0, width: 10, height: 10, path: "a.png" }, ctxOf({ asked }));
  assert.equal(asked.length, 0);
  assert.match(r, /screenshot was not created/, "fake runner wrote nothing");
  const blocked = await shot.handler({}, ctxOf({ asked, approve: false, cfg: { desktop: { approve_reads: true } } }));
  assert.match(blocked, /^BLOCKED/); assert.equal(asked.length, 1);
});

test("screen_capture resolves relative paths against cwd and reports permission denial on macOS", async () => {
  const cmds = [];
  const run = async (c) => { cmds.push(c); return { code: 0, stdout: c.file === "osascript" ? "false" : "", stderr: "" }; };
  const [shot] = makeCaptureTools({ env: envOf("darwin"), run });
  const r = await shot.handler({ target: "region", x: 0, y: 0, width: 5, height: 5 }, ctxOf());
  assert.match(r, /Screen Recording permission is missing/);
  assert.equal(cmds.length, 1, "nothing captured without permission");
  const cmds2 = [];
  const run2 = async (c) => { cmds2.push(c); return { code: 0, stdout: "", stderr: "" }; };
  const [shot2] = makeCaptureTools({ env: envOf("darwin"), run: run2 });
  await shot2.handler({ path: "sub/x.png", format: "jpg" }, ctxOf({ cfg: { capture: { skip_permission_check: true } } }));
  assert.equal(cmds2.length, 1);
  assert.deepEqual(cmds2[0].args, ["-x", "-t", "jpg", join(dir, "sub/x.png")]);
});

test("imageSize reads PNG and JPEG headers", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000c800000078", "hex");
  const p = join(dir, "h.png");
  writeFileSync(p, Buffer.concat([png, Buffer.alloc(16)]));
  assert.deepEqual(imageSize(p), { width: 200, height: 120 });
  const jpg = Buffer.from("ffd8ffe000104a46494600010100000100010000ffc0001108007800c803012200021101031101", "hex");
  const j = join(dir, "h.jpg"); writeFileSync(j, Buffer.concat([jpg, Buffer.alloc(16)]));
  assert.deepEqual(imageSize(j), { width: 200, height: 120 });
});

test("live (macOS): region screenshot or a clear permission message", { skip: process.platform !== "darwin" }, async (t) => {
  const out = join(dir, "live.png");
  const r = await captureTools[0].handler({ target: "region", x: 0, y: 0, width: 200, height: 120, path: out }, ctxOf());
  if (/permission/i.test(r) && /Screen Recording/.test(r)) { t.skip(`Screen Recording permission missing: ${r.slice(0, 80)}`); return; }
  assert.match(r, /^Saved screenshot to /, r);
  assert.ok(existsSync(out));
  assert.equal(readFileSync(out).subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "PNG signature");
});

test("screen_record lifecycle with a fake ffmpeg: start in background, status, stop sends q", async () => {
  const { EventEmitter } = await import("node:events");
  const writes = [];
  let outFile;
  const spawn = (file, args) => {
    outFile = args.at(-1);
    const p = new EventEmitter();
    p.stderr = new EventEmitter();
    p.stdin = { write: (s) => { writes.push(s); writeFileSync(outFile, Buffer.alloc(2048)); setTimeout(() => p.emit("exit", 0), 5); return true; }, end() {} };
    p.kill = () => true;
    return p;
  };
  const [, rec] = makeCaptureTools({ env: envOf("win32", { have: ["ffmpeg"] }), spawn, run: async () => ({ code: 0, stdout: "", stderr: "" }), startupMs: 20 });
  const ctx = ctxOf();
  const started = await rec.handler({ action: "start", path: "clip.mp4", fps: 12 }, ctx);
  assert.match(started, /Recording the screen until stopped with ffmpeg/);
  assert.equal(outFile, join(dir, "clip.mp4"));
  assert.match(await rec.handler({ action: "start" }, ctx), /already recording/);
  assert.match(await rec.handler({ action: "status" }, ctx), /clip\.mp4 · ffmpeg/);
  const stopped = await rec.handler({ action: "stop" }, ctx);
  assert.deepEqual(writes, ["q\n"]);
  assert.match(stopped, /Stopped recording: .*clip\.mp4\nduration ≈ [\d.]+s · 2 KB · backend ffmpeg/);
  assert.match(await rec.handler({ action: "status" }, ctx), /No active/);
});

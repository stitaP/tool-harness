// desktop + browser tools: command builders for macOS / Windows / Linux, real X11 runs (Xvfb), browser connect/chrome modes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { build, parseCombo, sendKeysEscape, makeDesktopTool, ACTIONS, which, availability } from "../dist/tools/desktop.js";
import { browserTools, closeBrowsers, playwrightAvailable } from "../dist/tools/browser.js";
import { chromeArgs, findChrome } from "../dist/cli/browser-cmd.js";
import { ToolRegistry } from "../dist/tools/registry.js";

const envOf = (os, wayland = false, have = ["xclip", "wmctrl", "import", "gtk-launch"]) => ({ os, wayland, has: (b) => have.includes(b) });
const SAMPLE = { x: 10, y: 20, to_x: 30, to_y: 40, text: "héllo {x}+1\nnext", keys: "ctrl+shift+t", app: "Notes", target: "https://example.com", direction: "up", amount: 3 };
const decodePs = (c) => Buffer.from(c.args.at(-1), "base64").toString("utf16le");

test("parseCombo and SendKeys escaping", () => {
  assert.deepEqual(parseCombo("Ctrl+Shift+T"), { mods: ["ctrl", "shift"], key: "t" });
  assert.deepEqual(parseCombo("cmd+c"), { mods: ["cmd"], key: "c" });
  assert.deepEqual(parseCombo("Return"), { mods: [], key: "enter" });
  assert.deepEqual(parseCombo("option+ArrowUp"), { mods: ["alt"], key: "up" });
  assert.deepEqual(parseCombo("shift"), { mods: [], key: "shift" });
  assert.throws(() => parseCombo("a+b"));
  assert.equal(sendKeysEscape("a+b^(c){d}%~\n"), "a{+}b{^}{(}c{)}{{}d{}}{%}{~}{ENTER}");
});

test("every action builds a command on every OS", () => {
  for (const env of [envOf("darwin"), envOf("win32"), envOf("linux"), envOf("linux", true, ["wl-copy", "wl-paste", "grim", "ydotool"])]) {
    for (const action of ACTIONS) {
      if (env.wayland && action === "key") continue;   // covered below (needs evdev-mappable keys)
      const cmds = build(env, { action, ...SAMPLE }, "/tmp/s.png");
      assert.ok(cmds.length >= 1, `${env.os}${env.wayland ? "/wayland" : ""} ${action}`);
      for (const c of cmds) assert.ok(c.file && Array.isArray(c.args), `${env.os} ${action} argv`);
    }
  }
  assert.throws(() => build(envOf("darwin"), { action: "click" }, ""), /x is required/);
});

test("macOS: JXA scripts parse as JavaScript and use the right primitives", () => {
  const env = envOf("darwin");
  for (const action of ACTIONS) {
    for (const c of build(env, { action, ...SAMPLE }, "/tmp/s.png")) {
      if (c.file !== "osascript") continue;
      assert.deepEqual(c.args.slice(0, 2), ["-l", "JavaScript"]);
      assert.doesNotThrow(() => new Function(c.args[3]), `${action} JXA syntax`);
    }
  }
  const [shot] = build(env, { action: "screenshot" }, "/tmp/s.png");
  assert.deepEqual([shot.file, ...shot.args], ["screencapture", "-x", "-t", "png", "/tmp/s.png"]);
  const [dbl] = build(env, { action: "double_click", x: 5, y: 6 }, "");
  assert.match(dbl.args[3], /CGEventCreateMouseEvent/); assert.match(dbl.args[3], /i <= 2/);
  const [ty] = build(env, { action: "type", text: "a\"b" }, "");
  assert.equal(ty.args.at(-1), "a\"b", "text passed as argv, never interpolated");
  const [k] = build(env, { action: "key", keys: "cmd+shift+4" }, "");
  assert.match(k.args[3], /keystroke\("4", \{using: \["command down","shift down"\]\}\)/);
  const [ent] = build(env, { action: "key", keys: "Enter" }, "");
  assert.match(ent.args[3], /keyCode\(36/);
  assert.deepEqual(build(env, { action: "clipboard_write", text: "x" }, "")[0], { file: "pbcopy", args: [], stdin: "x" });
  assert.deepEqual(build(env, { action: "open_app", app: "Safari" }, "")[0], { file: "open", args: ["-a", "Safari"] });
});

test("Windows: PowerShell is base64 UTF-16 and contains the right calls", () => {
  const env = envOf("win32");
  const ps = (a) => { const [c] = build(env, a, "C:\\t\\s.png"); assert.equal(c.file, "powershell"); assert.ok(c.args.includes("-EncodedCommand")); return decodePs(c); };
  assert.match(ps({ action: "screenshot" }), /CopyFromScreen[\s\S]*Save\('C:\\t\\s\.png'/);
  assert.match(ps({ action: "click", x: 3, y: 4 }), /Click 3 4 0x02 0x04 1/);
  assert.match(ps({ action: "double_click", x: 3, y: 4 }), /Click 3 4 0x02 0x04 2/);
  assert.match(ps({ action: "right_click", x: 3, y: 4 }), /Click 3 4 0x08 0x10 1/);
  assert.match(ps({ action: "scroll", direction: "down", amount: 2 }), /mouse_event\(0x0800,0,0,-240/);
  assert.match(ps({ action: "type", text: "it's 5+5" }), /SendWait\('it''s 5\{\+\}5'\)/);
  assert.match(ps({ action: "key", keys: "ctrl+shift+Escape" }), /SendWait\('\^\+\{ESC\}'\)/);
  assert.match(ps({ action: "key", keys: "alt+F4" }), /SendWait\('%\{F4\}'\)/);
  assert.match(ps({ action: "key", keys: "win+r" }), /keybd_event\(0x5B[\s\S]*keybd_event\(82,/);
  assert.match(ps({ action: "ui_tree" }), /AutomationElement\]::FromHandle/);
  assert.match(ps({ action: "list_apps" }), /\$\(if \(\$_\.MainWindowHandle -eq \$fg\)/);
  const [cw] = build(env, { action: "clipboard_write", text: "multi\nline" }, "");
  assert.equal(cw.stdin, "multi\nline"); assert.match(decodePs(cw), /Set-Clipboard -Value \(\[Console\]::In\.ReadToEnd\(\)\)/);
  for (const action of ACTIONS) assert.match(ps({ action, ...SAMPLE }), /SetProcessDPIAware/);
});

test("Linux: X11 (xdotool) and Wayland (ydotool, grim, wl-clipboard)", () => {
  const x = envOf("linux");
  assert.deepEqual(build(x, { action: "click", x: 1, y: 2 }, "")[0].args, ["mousemove", "--sync", "1", "2", "click", "1"]);
  assert.deepEqual(build(x, { action: "double_click", x: 1, y: 2 }, "")[0].args, ["mousemove", "--sync", "1", "2", "click", "--repeat", "2", "--delay", "80", "1"]);
  assert.deepEqual(build(x, { action: "key", keys: "cmd+Enter" }, "")[0].args, ["key", "--clearmodifiers", "super+Return"]);
  assert.deepEqual(build(x, { action: "type", text: "-rf" }, "")[0].args, ["type", "--delay", "12", "--", "-rf"], "-- guards text starting with -");
  assert.deepEqual(build(x, { action: "scroll", direction: "down", amount: 2 }, "")[0].args, ["click", "--repeat", "2", "--delay", "30", "5"]);
  assert.deepEqual(build(x, { action: "screenshot" }, "/t.png")[0], { file: "import", args: ["-window", "root", "/t.png"] });
  assert.equal(build(envOf("linux", false, ["scrot"]), { action: "screenshot" }, "/t.png")[0].file, "scrot");
  assert.throws(() => build(envOf("linux", false, []), { action: "screenshot" }, "/t.png"), /no screenshot tool/);
  const w = envOf("linux", true);
  const [mv, cl] = build(w, { action: "right_click", x: 7, y: 8 }, "");
  assert.deepEqual(mv.args, ["mousemove", "--absolute", "-x", "7", "-y", "8"]); assert.deepEqual(cl.args, ["click", "0xC1"]);
  assert.deepEqual(build(w, { action: "key", keys: "ctrl+c" }, "")[0].args, ["key", "29:1", "46:1", "46:0", "29:0"]);
  assert.throws(() => build(w, { action: "key", keys: "ctrl+F13" }, ""), /not supported on Wayland/);
  assert.deepEqual(build(w, { action: "screenshot" }, "/t.png")[0], { file: "grim", args: ["/t.png"] });
  assert.deepEqual(build(w, { action: "clipboard_write", text: "q" }, "")[0], { file: "wl-copy", args: [], stdin: "q" });
});

test("approval: input actions ask, read actions do not; denial blocks", async () => {
  const calls = []; const asked = [];
  const tool = makeDesktopTool({ env: envOf("linux"), run: async (c) => { calls.push(c); return "ok"; } });
  const ctx = (approve) => ({ rt: { cfg: { data: { desktop: {} } }, home: tmpdir() }, cwd: tmpdir(), session: { id: "s" }, signal: undefined,
    requestApproval: async (r) => { asked.push(r.command); return approve; } });
  assert.match(await tool.handler({ action: "type", text: "hi" }, ctx(false)), /BLOCKED/);
  assert.equal(calls.length, 0);
  assert.match(await tool.handler({ action: "click", x: 1, y: 2 }, ctx(true)), /done: click at \(1,2\)/);
  assert.equal(calls.length, 1);
  await tool.handler({ action: "screen_size" }, ctx(false));
  assert.equal(asked.length, 2, "screen_size did not ask");
  assert.deepEqual(asked, ["desktop:type type \"hi\"", "desktop:click click at (1,2)"]);
});

test("tools.enabled forces browser/desktop into the small-model profile", () => {
  const r = new ToolRegistry();
  r.register({ name: "read_file", toolset: "files", tier: "slm", description: "", parameters: {}, handler: async () => "" });
  r.register({ name: "desktop", toolset: "desktop", tier: "standard", description: "", parameters: {}, handler: async () => "" });
  r.register({ name: "browser_click", toolset: "browser", tier: "standard", description: "", parameters: {}, handler: async () => "" });
  const rt = (enabled) => ({ cfg: { data: { agent: { tool_profile: "slm" }, tools: { disabled: [], deferred: [], enabled } } } });
  assert.deepEqual(r.active(rt([])).map((t) => t.name), ["read_file"]);
  assert.deepEqual(r.active(rt(["browser", "desktop"])).map((t) => t.name), ["browser_click", "desktop", "read_file"]);
});

test("Chrome launcher arguments and lookup", () => {
  assert.deepEqual(chromeArgs(9333, "/p"), ["--remote-debugging-port=9333", "--user-data-dir=/p", "--no-first-run", "--no-default-browser-check"]);
  assert.equal(findChrome("darwin", { HOME: "/nonexistent" }), null);
  assert.equal(findChrome("win32", { PROGRAMFILES: "/nonexistent" }), null);
});

// ------------------------------------------------------------------ live: X11 desktop + browser over CDP
const CHROMIUM = process.env.STITAP_TEST_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const canX = process.platform === "linux" && which("Xvfb") && which("xdotool") && existsSync(CHROMIUM);
let xvfb, chrome, server, port, dir;
const PAGE = `<!doctype html><title>Desk test</title><body style="margin:0">
<input id="nm" style="position:absolute;left:40px;top:40px;width:300px;height:40px;font-size:20px">
<button id="go" style="position:absolute;left:40px;top:120px;width:200px;height:50px" onclick="document.title='clicked:'+document.getElementById('nm').value">Go</button>
<select id="sel" style="position:absolute;left:40px;top:200px"><option value="a">Apple</option><option value="b">Banana</option></select>
<input id="up" type="file" style="position:absolute;left:40px;top:260px">
<p id="late" style="position:absolute;left:40px;top:320px"></p>
<script>setTimeout(()=>{document.getElementById('late').textContent='ready now'},800)</script></body>`;

async function cdp(path) { const r = await fetch(`http://127.0.0.1:9339${path}`); return r.json(); }
async function pageEval(expr) {
  const pg = (await cdp("/json/list")).find((t) => t.type === "page" && t.url.includes("/desk"));
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const res = await new Promise((r) => { ws.addEventListener("message", (m) => r(JSON.parse(m.data))); ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true } })); });
  ws.close(); return res.result?.result?.value;
}
const fakeCtx = (cfg = {}) => ({ rt: { cfg: { data: { web: { egress_allowlist: [] }, desktop: {}, ...cfg } }, home: dir }, cwd: dir, session: { id: "live" }, signal: undefined, requestApproval: async () => true });

before(async () => {
  if (!canX) return;
  dir = mkdtempSync(join(tmpdir(), "desk-"));
  server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); port = server.address().port;
  xvfb = spawn("Xvfb", [":97", "-screen", "0", "1024x768x24"], { stdio: "ignore" });
  process.env.DISPLAY = ":97";
  await new Promise((r) => setTimeout(r, 800));
  chrome = spawn(CHROMIUM, ["--no-sandbox", "--remote-debugging-port=9339", `--user-data-dir=${dir}/prof`, "--window-position=0,0", "--window-size=1000,700",
    "--no-first-run", "--disable-gpu", `--app=http://127.0.0.1:${port}/desk`], { stdio: "ignore", env: { ...process.env, DISPLAY: ":97" } });
  for (let i = 0; i < 60; i++) { try { await cdp("/json/version"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  await new Promise((r) => setTimeout(r, 1500));
});
after(async () => { await closeBrowsers(); chrome?.kill(); xvfb?.kill(); server?.close(); });

test("live X11: screenshot, click, type, key, scroll, clipboard, cursor, screen size", { skip: !canX && "needs Xvfb, xdotool and Chromium" }, async () => {
  const tool = makeDesktopTool();
  const ctx = fakeCtx();
  assert.equal(availability({ os: "linux", wayland: false, has: which }), true);
  assert.equal(await tool.handler({ action: "screen_size" }, ctx), "1024x768");
  const shot = await tool.handler({ action: "screenshot" }, ctx);
  const png = shot.match(/Saved screenshot to (\S+\.png)/)[1];
  assert.ok(statSync(png).size > 1000 && readFileSync(png).subarray(1, 4).toString() === "PNG");
  // where is the input on screen? window offset + element rect
  const off = await pageEval("JSON.stringify({x: window.screenX + (window.outerWidth - window.innerWidth), y: window.screenY + (window.outerHeight - window.innerHeight)})");
  const o = JSON.parse(off);
  assert.match(await tool.handler({ action: "click", x: o.x + 190, y: o.y + 60 }, ctx), /done/);
  assert.match(await tool.handler({ action: "type", text: "Asha R" }, ctx), /done/);
  assert.equal(await pageEval("document.getElementById('nm').value"), "Asha R");
  await tool.handler({ action: "key", keys: "BackSpace" }, ctx);
  await tool.handler({ action: "key", keys: "ctrl+a" }, ctx);
  await tool.handler({ action: "type", text: "Meera" }, ctx);
  assert.equal(await pageEval("document.getElementById('nm').value"), "Meera");
  await tool.handler({ action: "double_click", x: o.x + 140, y: o.y + 145 }, ctx);
  assert.equal(await pageEval("document.title"), "clicked:Meera");
  assert.match(await tool.handler({ action: "scroll", direction: "down", amount: 2, x: o.x + 500, y: o.y + 400 }, ctx), /done/);
  assert.equal(await tool.handler({ action: "cursor_position" }, ctx), `${o.x + 500},${o.y + 400}`);
  if (which("xclip")) {
    const t0 = Date.now();
    await tool.handler({ action: "clipboard_write", text: "from the agent ✓" }, ctx);
    assert.ok(Date.now() - t0 < 5000, "clipboard_write returns at once");
    assert.equal(await tool.handler({ action: "clipboard_read" }, ctx), "from the agent ✓");
  }
  assert.match(await tool.handler({ action: "list_apps" }, ctx), /Desk test|clicked/);
});

test("live browser: connect over CDP — own tab, tabs, wait, select, upload, detach leaves Chrome running", { skip: (!canX || !playwrightAvailable()) && "needs Chromium + playwright" }, async () => {
  const T = Object.fromEntries(browserTools.map((t) => [t.name, t]));
  const ctx = fakeCtx({ browser: { mode: "connect", cdp_url: "http://127.0.0.1:9339" } });
  const before = (await cdp("/json/list")).filter((t) => t.type === "page").length;
  let s = await T.browser_navigate.handler({ url: `http://127.0.0.1:${port}/desk2` }, ctx);
  assert.match(s, /Desk test/);
  assert.equal((await cdp("/json/list")).filter((t) => t.type === "page").length, before + 1, "agent opened its own tab");
  s = await T.browser_wait.handler({ text: "ready now" }, ctx);
  assert.match(s, /ready now/);
  s = await T.browser_select.handler({ selector: "#sel", value: "Banana" }, ctx);
  writeFileSync(join(dir, "doc.txt"), "hello");
  s = await T.browser_upload.handler({ selector: "#up", paths: ["doc.txt"] }, ctx);
  assert.match(s, /attached 1 file/);
  const tabs = await T.browser_tabs.handler({ action: "list" }, ctx);
  assert.match(tabs, /\* \[\d\] Desk test — http:\/\/127\.0\.0\.1:\d+\/desk2/);
  s = await T.browser_tabs.handler({ action: "new", url: `http://127.0.0.1:${port}/desk3` }, ctx);
  assert.match(s, /desk3/);
  assert.match(await T.browser_eval.handler({ expression: "location.pathname" }, ctx), /desk3/);
  assert.match(await T.browser_close.handler({}, ctx), /your Chrome keeps running/);
  const after = (await cdp("/json/list")).filter((t) => t.type === "page");
  assert.equal(after.length, before, "only the agent's tabs were closed");
  assert.ok(after.some((t) => t.url.endsWith("/desk")), "the user's tab is untouched");
});

test("live browser: chrome mode with a persistent profile", { skip: (!canX || !playwrightAvailable()) && "needs Chromium + playwright" }, async () => {
  const T = Object.fromEntries(browserTools.map((t) => [t.name, t]));
  const ctx = { ...fakeCtx({ browser: { mode: "chrome", executable_path: CHROMIUM, headless: true, user_data_dir: join(dir, "agent-prof") } }), session: { id: "chrome-mode" } };
  const s = await T.browser_navigate.handler({ url: `http://127.0.0.1:${port}/desk4` }, ctx);
  assert.match(s, /Desk test/);
  await T.browser_close.handler({}, ctx);
  assert.ok(existsSync(join(dir, "agent-prof", "Default")), "profile persisted on disk");
});

test("CLI: -q never swallows a following flag", async () => {
  const { parseArgs } = await import("../dist/cli/main.js");
  assert.deepEqual(parseArgs(["-q", "--yolo", "do the thing"]).flags, { yolo: true, query: "do the thing" });
  assert.deepEqual(parseArgs(["--yolo", "-q", "do it"]).flags, { yolo: true, query: "do it" });
  assert.equal(parseArgs(["-q", "list files", "--json"]).flags.query, "list files");
  assert.deepEqual(parseArgs(["browser", "chrome", "--port", "9333"]), { cmd: ["browser", "chrome"], flags: { port: "9333" } });
});

/**
 * Safari backend for the browser tools: drives the real Safari through Apple's safaridriver (W3C WebDriver),
 * behind the small subset of Playwright's Page/Locator API that browser.ts uses — so every browser_* tool works
 * unchanged. Safari allows one automation session at a time: all chats share it, each chat gets its own window.
 *
 * One-time setup on the Mac: `safaridriver --enable` (asks for the password), and in Safari: Settings ▸ Advanced ▸
 * "Show features for web developers", then Develop ▸ "Allow Remote Automation".
 */
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
export const SAFARIDRIVER = "/usr/bin/safaridriver";
export const SAFARI_SETUP = "Safari is not set up for automation. One time: (1) run `safaridriver --enable` in Terminal (it asks for your password); " +
    "(2) in Safari open Settings ▸ Advanced, tick \"Show features for web developers\", then choose Develop ▸ \"Allow Remote Automation\". Then try again.";
export function safariAvailable() {
    if (process.platform !== "darwin")
        return "Safari automation needs macOS";
    return existsSync(SAFARIDRIVER) || "safaridriver not found (it ships with Safari in /usr/bin)";
}
const ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const KEYS = {
    Enter: "", Return: "", Tab: "", Escape: "", Esc: "", Backspace: "", Delete: "", Space: " ",
    ArrowUp: "", ArrowDown: "", ArrowLeft: "", ArrowRight: "", Home: "", End: "", PageUp: "", PageDown: "",
    Shift: "", Control: "", Ctrl: "", Alt: "", Option: "", Meta: "", Command: "", Cmd: "",
};
const keyOf = (k) => KEYS[k] ?? (k.length === 1 ? k : (() => { throw new Error(`unknown key "${k}"`); })());
function freePort() {
    return new Promise((res, rej) => { const s = createServer(); s.unref(); s.on("error", rej); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
}
/** The single safaridriver process + WebDriver session, started on first use. */
class Driver {
    child;
    base = "";
    sid = "";
    starting;
    current = "";
    async ensure() {
        if (this.sid)
            return;
        this.starting ??= this.start().finally(() => { this.starting = undefined; });
        return this.starting;
    }
    async start() {
        const port = await freePort();
        this.child = spawn(SAFARIDRIVER, ["-p", String(port)], { stdio: "ignore" });
        this.child.on("exit", () => { this.child = undefined; this.sid = ""; this.current = ""; });
        this.base = `http://127.0.0.1:${port}`;
        for (let i = 0; i < 50; i++) {
            try {
                if ((await fetch(`${this.base}/status`)).ok)
                    break;
            }
            catch { /* not up yet */ }
            await new Promise((r) => setTimeout(r, 100));
        }
        try {
            const r = await this.raw("POST", "/session", { capabilities: { alwaysMatch: { browserName: "safari" } } });
            this.sid = r.sessionId ?? r.value?.sessionId;
            if (!this.sid)
                throw new Error("no session id");
        }
        catch (e) {
            this.child?.kill();
            throw new Error(/remote automation|not enabled|allow/i.test(e.message) || /session not created/i.test(e.message) ? `${SAFARI_SETUP} (${e.message.slice(0, 160)})` : `could not start Safari: ${e.message}`);
        }
        this.current = (await this.cmd("GET", "/window"));
    }
    async raw(method, path, body) {
        const r = await fetch(this.base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.value?.error)
            throw new Error(`${j.value?.error ?? r.status}: ${j.value?.message ?? r.statusText}`);
        return j;
    }
    async cmd(method, path, body) {
        await this.ensure();
        return (await this.raw(method, `/session/${this.sid}${path}`, body ?? (method === "POST" ? {} : undefined))).value;
    }
    /** Run a command in a given window (switching only when needed). */
    async on(handle, method, path, body) {
        await this.ensure();
        if (handle && this.current !== handle) {
            await this.cmd("POST", "/window", { handle });
            this.current = handle;
        }
        return this.cmd(method, path, body);
    }
    async newWindow() {
        await this.ensure();
        const used = new Set([...contexts.values()].flatMap((c) => c.handles()));
        const first = this.current;
        if (first && !used.has(first))
            return first; // the session's initial window, not yet claimed
        const r = await this.cmd("POST", "/window/new", { type: "tab" });
        return r.handle;
    }
    async closeWindow(handle) {
        if (!this.sid)
            return;
        const left = await this.on(handle, "DELETE", "/window").catch(() => []);
        this.current = "";
        if (!left?.length)
            await this.quit();
    }
    async quit() {
        if (this.sid)
            await this.raw("DELETE", `/session/${this.sid}`).catch(() => undefined);
        this.sid = "";
        this.current = "";
        this.child?.kill();
        this.child = undefined;
    }
}
const driver = new Driver();
const contexts = new Set();
class SafariElement {
    page;
    using;
    value;
    constructor(page, using, value) {
        this.page = page;
        this.using = using;
        this.value = value;
    }
    first() { return this; }
    async id(timeout = 15000) {
        const end = Date.now() + timeout;
        for (;;) {
            try {
                const r = await this.page.cmd("POST", "/element", { using: this.using, value: this.value });
                return r[ELEMENT];
            }
            catch (e) {
                if (Date.now() > end)
                    throw new Error(`element not found: ${this.value} (${e.message})`);
            }
            await new Promise((r) => setTimeout(r, 250));
        }
    }
    async waitFor(o = {}) { await this.id(o.timeout ?? 15000); }
    async click(o = {}) { await this.page.cmd("POST", `/element/${await this.id(o.timeout)}/click`); }
    async fill(text, o = {}) { const id = await this.id(o.timeout); await this.page.cmd("POST", `/element/${id}/clear`).catch(() => undefined); await this.page.cmd("POST", `/element/${id}/value`, { text }); }
    async type(text) { await this.page.cmd("POST", `/element/${await this.id()}/value`, { text }); }
    async press(key) { await this.page.cmd("POST", `/element/${await this.id()}/value`, { text: key.split("+").map(keyOf).join("") }); }
    async setInputFiles(files, o = {}) { await this.page.cmd("POST", `/element/${await this.id(o.timeout)}/value`, { text: files.join("\n") }); }
    async selectOption(v, o = {}) {
        const id = await this.id(o.timeout);
        const want = typeof v === "string" ? v : v.label;
        const ok = await this.page.cmd("POST", "/execute/sync", {
            script: "const s = arguments[0], w = arguments[1]; const o = [...s.options].find(x => x.label === w || x.text === w || x.value === w); if (!o) return false; s.value = o.value; s.dispatchEvent(new Event('input', {bubbles: true})); s.dispatchEvent(new Event('change', {bubbles: true})); return true;",
            args: [{ [ELEMENT]: id }, want],
        });
        if (!ok)
            throw new Error(`no option "${want}"`);
    }
}
/** The part of Playwright's Page that browser.ts uses, backed by one Safari window. */
export class SafariPage {
    handle;
    ctx;
    closed = false;
    lastUrl = "about:blank";
    keyboard = { press: (k) => this.pressKeys(k) };
    constructor(handle, ctx) {
        this.handle = handle;
        this.ctx = ctx;
    }
    cmd(method, path, body) { return driver.on(this.handle, method, path, body); }
    isClosed() { return this.closed; }
    url() { return this.lastUrl; }
    on(_event, _fn) { }
    async title() { return String(await this.cmd("GET", "/title")); }
    async refreshUrl() { this.lastUrl = String(await this.cmd("GET", "/url").catch(() => this.lastUrl)); }
    async goto(url, _o) { await this.cmd("POST", "/url", { url }); await this.refreshUrl(); }
    async goBack() { await this.cmd("POST", "/back"); await this.refreshUrl(); }
    async waitForLoadState(_state, o = {}) {
        const end = Date.now() + (o.timeout ?? 10000);
        while (Date.now() < end && (await this.cmd("POST", "/execute/sync", { script: "return document.readyState", args: [] }).catch(() => "complete")) !== "complete")
            await new Promise((r) => setTimeout(r, 200));
        await this.refreshUrl();
    }
    waitForTimeout(ms) { return new Promise((r) => setTimeout(r, ms)); }
    async evaluate(expr) {
        const r = await this.cmd("POST", "/execute/sync", { script: `return (${expr});`, args: [] });
        await this.refreshUrl();
        return r;
    }
    locator(selector) { return new SafariElement(this, "css selector", selector); }
    getByText(text, _o) {
        const lit = text.includes('"') ? `concat("${text.split('"').join(`", '"', "`)}")` : `"${text}"`;
        // the deepest element whose text contains it
        return new SafariElement(this, "xpath", `//*[contains(normalize-space(.), ${lit}) and not(.//*[contains(normalize-space(.), ${lit})])]`);
    }
    async pressKeys(combo) {
        const keys = combo.split("+").map(keyOf);
        const down = keys.map((value) => ({ type: "keyDown", value })), up = [...keys].reverse().map((value) => ({ type: "keyUp", value }));
        await this.cmd("POST", "/actions", { actions: [{ type: "key", id: "kbd", actions: [...down, ...up] }] });
        await this.cmd("DELETE", "/actions").catch(() => undefined);
    }
    async screenshot(o) {
        // WebDriver captures the visible viewport (fullPage is not supported by Safari)
        writeFileSync(o.path, Buffer.from(String(await this.cmd("GET", "/screenshot")), "base64"));
    }
    async bringToFront() { await this.cmd("GET", "/window"); await this.refreshUrl(); }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.ctx.forget(this);
        await driver.closeWindow(this.handle);
    }
}
/** The part of Playwright's BrowserContext that browser.ts uses: one chat's Safari windows. */
export class SafariContext {
    list = [];
    constructor() { contexts.add(this); }
    handles() { return this.list.map((p) => p.handle); }
    pages() { return this.list.filter((p) => !p.isClosed()); }
    forget(p) { this.list = this.list.filter((x) => x !== p); }
    async newPage() {
        const p = new SafariPage(await driver.newWindow(), this);
        this.list.push(p);
        return p;
    }
    async close() {
        for (const p of [...this.list])
            await p.close().catch(() => undefined);
        contexts.delete(this);
    }
}
export async function closeSafari() {
    for (const c of [...contexts])
        await c.close();
    await driver.quit();
}

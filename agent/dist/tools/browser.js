/**
 * Browser automation via Playwright (optional dependency — enabled when the
 * `playwright` package and a Chromium are installed). One browser page per
 * agent session. Snapshots number interactive elements as [ref] for clicking.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SafariContext, closeSafari, safariAvailable } from "./safari.js";
import { pathToFileURL } from "node:url";
import { checkEgress } from "../safety/paths.js";
import { truncateMiddle } from "../util/misc.js";
import { obj, str, int, bool, enm, arr } from "./types.js";
import { resolvePath } from "../safety/paths.js";
let pwAvailable = null;
const PW_PKGS = ["playwright", "playwright-core"];
function resolvePw() {
    for (const base of [process.cwd() + "/", import.meta.url]) {
        for (const pkg of PW_PKGS) {
            try {
                return createRequire(base).resolve(pkg);
            }
            catch { /* next */ }
        }
    }
    return null;
}
export function playwrightAvailable() {
    if (pwAvailable !== null)
        return pwAvailable;
    return (pwAvailable = resolvePw() !== null);
}
async function loadPlaywright() {
    const p = resolvePw();
    if (!p)
        throw new Error("playwright is not installed — run: harness browser setup");
    return await import(pathToFileURL(p).href);
}
export function browserCfg(rt) {
    const b = (rt.cfg.data.browser ?? {});
    const explicit = rt.cfg.userSet("browser.mode");
    const mode = process.env.STITAP_BROWSER_MODE || (explicit ? b.mode : undefined) || (process.platform === "darwin" ? "safari" : "launch");
    return {
        mode: ["safari", "launch", "chrome", "connect"].includes(mode) ? mode : "launch",
        headless: b.headless ?? mode === "launch",
        executable_path: b.executable_path || process.env.STITAP_CHROMIUM || "",
        channel: b.channel || (mode === "chrome" ? "chrome" : ""),
        cdp_url: process.env.STITAP_CDP_URL || b.cdp_url || "http://127.0.0.1:9222",
        user_data_dir: b.user_data_dir || join(rt.home, "browser-profile"),
        args: Array.isArray(b.args) ? b.args.map(String) : [],
    };
}
const sessions = new Map();
function watch(s, p) {
    p.on("console", (m) => { s.console.push(`[${m.type()}] ${m.text()}`); if (s.console.length > 200)
        s.console.shift(); });
}
async function open(ctx) {
    let s = sessions.get(ctx.session.id);
    if (s && !s.page.isClosed())
        return s;
    if (s) { // page closed: pick another tab of the same context, else open one
        const live = s.context.pages().filter((x) => !x.isClosed());
        s.page = live.at(-1) ?? await s.context.newPage();
        watch(s, s.page);
        return s;
    }
    const c = browserCfg(ctx.rt);
    let browser = null, context, p;
    if (c.mode === "safari") {
        context = new SafariContext();
        p = await context.newPage();
        s = { browser: null, context, page: p, console: ["(Safari does not expose console messages to automation — use browser_eval to inspect state)"], mode: c.mode };
        sessions.set(ctx.session.id, s);
        return s;
    }
    const pw = await loadPlaywright();
    const chromium = pw.chromium ?? pw.default?.chromium;
    if (c.mode === "connect") {
        try {
            browser = await chromium.connectOverCDP(c.cdp_url, { timeout: 10000 });
        }
        catch (e) {
            throw new Error(`could not attach to Chrome at ${c.cdp_url} (${e.message.split("\n")[0]}). Start it with: harness browser chrome`);
        }
        context = browser.contexts()[0] ?? await browser.newContext();
        p = await context.newPage(); // a new tab: never take over the tab the user is looking at
        p.__stitap = true;
    }
    else if (c.mode === "chrome") {
        mkdirSync(c.user_data_dir, { recursive: true });
        context = await chromium.launchPersistentContext(c.user_data_dir, {
            headless: c.headless, channel: c.executable_path ? undefined : c.channel || "chrome", executablePath: c.executable_path || undefined,
            viewport: null, args: ["--no-first-run", "--no-default-browser-check", ...c.args],
        });
        p = context.pages()[0] ?? await context.newPage();
    }
    else {
        browser = await chromium.launch({ headless: c.headless, executablePath: c.executable_path || undefined, channel: c.channel || undefined, args: c.args });
        context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        p = await context.newPage();
    }
    s = { browser, context, page: p, console: [], mode: c.mode };
    watch(s, p);
    sessions.set(ctx.session.id, s);
    return s;
}
async function page(ctx) { return (await open(ctx)).page; }
async function closeSession(s) {
    if (s.mode === "safari")
        await s.context.close().catch(() => undefined);
    else if (s.mode === "connect") { // leave the user's Chrome running: close only our tabs, then disconnect
        for (const pg of s.context.pages())
            if (pg.__stitap)
                await pg.close().catch(() => undefined);
        await s.page.close().catch(() => undefined);
        await s.browser?.close().catch(() => undefined);
    }
    else if (s.browser)
        await s.browser.close().catch(() => undefined);
    else
        await s.context.close().catch(() => undefined);
}
export async function closeBrowsers() {
    for (const s of sessions.values())
        await closeSession(s);
    sessions.clear();
    await closeSafari().catch(() => undefined);
}
/** Browsers installed on this machine that the browser tools can drive (plus the ones they can't, with why). */
export function detectBrowsers() {
    const out = [];
    const app = (names) => names.flatMap((n) => [join("/Applications", n), join(homedir(), "Applications", n)]).find((p) => existsSync(p));
    if (process.platform === "darwin") {
        const safari = app(["Safari.app"]) ?? (existsSync("/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app") ? "Safari" : undefined);
        const sa = safariAvailable();
        if (safari)
            out.push({ id: "safari", label: "Safari", supported: sa === true, note: sa === true ? "real Safari via safaridriver (needs Allow Remote Automation once); always visible, no headless" : String(sa), set: { mode: "safari", channel: "", executable_path: "" } });
        const chromium = [
            ["chrome", "Google Chrome", "Google Chrome.app", { mode: "chrome", channel: "chrome", executable_path: "" }],
            ["edge", "Microsoft Edge", "Microsoft Edge.app", { mode: "chrome", channel: "msedge", executable_path: "" }],
            ["brave", "Brave", "Brave Browser.app", { mode: "chrome", channel: "", executable_path: "/Contents/MacOS/Brave Browser" }],
            ["chromium", "Chromium", "Chromium.app", { mode: "chrome", channel: "", executable_path: "/Contents/MacOS/Chromium" }],
            ["arc", "Arc", "Arc.app", { mode: "chrome", channel: "", executable_path: "/Contents/MacOS/Arc" }],
            ["vivaldi", "Vivaldi", "Vivaldi.app", { mode: "chrome", channel: "", executable_path: "/Contents/MacOS/Vivaldi" }],
        ];
        for (const [id, label, bundle, set] of chromium) {
            const p = app([bundle]);
            if (!p)
                continue;
            out.push({ id, label, supported: playwrightAvailable(), note: playwrightAvailable() ? "own profile, can run hidden" : "needs: harness browser setup", set: { ...set, executable_path: set.executable_path ? p + set.executable_path : "" } });
        }
        if (app(["Firefox.app"]))
            out.push({ id: "firefox", label: "Firefox", supported: false, note: "not supported (automation needs Playwright's own Firefox build)", set: {} });
    }
    else {
        out.push({ id: "chrome", label: "Google Chrome", supported: playwrightAvailable(), set: { mode: "chrome", channel: "chrome", executable_path: "" } });
        out.push({ id: "edge", label: "Microsoft Edge", supported: playwrightAvailable(), set: { mode: "chrome", channel: "msedge", executable_path: "" } });
    }
    const cache = process.platform === "darwin" ? join(homedir(), "Library", "Caches", "ms-playwright") : process.platform === "win32" ? join(process.env.LOCALAPPDATA ?? "", "ms-playwright") : join(homedir(), ".cache", "ms-playwright");
    const bundled = existsSync(cache) && readdirSync(cache).some((d) => d.startsWith("chromium"));
    out.push({ id: "bundled", label: "Playwright Chromium (bundled)", supported: playwrightAvailable() && bundled, note: bundled ? "separate test browser, can run hidden" : "not downloaded (npx playwright install chromium)", set: { mode: "launch", channel: "", executable_path: "" } });
    out.push({ id: "connect", label: "Attach to a running Chrome (CDP)", supported: playwrightAvailable(), note: "uses your open Chrome with its logins — start it with: harness browser chrome", set: { mode: "connect", channel: "", executable_path: "" } });
    return out;
}
/** Open the configured browser on a blank page and close it again; throws with a readable reason. */
export async function testBrowser(rt) {
    const ctx = { rt, session: { id: "__browser_test__" } };
    try {
        const s = await open(ctx);
        await s.page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 20000 });
        return `${browserCfg(rt).mode} browser works`;
    }
    finally {
        const s = sessions.get("__browser_test__");
        if (s) {
            await closeSession(s);
            sessions.delete("__browser_test__");
        }
    }
}
/** Forget open browser sessions (after the browser choice changes) so the next tool call uses the new one. */
export async function resetBrowsers() { await closeBrowsers(); }
/** Which detected browser the current config points at. */
export function currentBrowserId(rt) {
    const c = browserCfg(rt);
    if (c.mode === "safari")
        return "safari";
    if (c.mode === "launch")
        return c.executable_path ? "custom" : "bundled";
    if (c.mode === "connect")
        return "connect";
    if (c.executable_path)
        return detectBrowsers().find((b) => b.set.executable_path === c.executable_path)?.id ?? "custom";
    return c.channel === "msedge" ? "edge" : "chrome";
}
const SNAPSHOT_JS = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  document.querySelectorAll('[data-stitap-ref]').forEach(e => e.removeAttribute('data-stitap-ref'));
  const sel = 'a[href], button, input, textarea, select, [role=button], [role=link], [role=tab], [role=checkbox], [role=menuitem], [contenteditable=true], summary';
  let n = 0; const items = [];
  for (const el of document.querySelectorAll(sel)) {
    if (!vis(el) || n >= 250) continue;
    n++; el.setAttribute('data-stitap-ref', String(n));
    const tag = el.tagName.toLowerCase(); const type = el.getAttribute('type') || '';
    const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    items.push('[' + n + '] ' + tag + (type ? '[' + type + ']' : '') + ' ' + JSON.stringify(label) + (tag === 'a' ? ' -> ' + el.getAttribute('href') : ''));
  }
  const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').trim();
  return { title: document.title, url: location.href, text, items };
})()`;
async function snapshot(p, maxChars = 12000) {
    const s = await p.evaluate(SNAPSHOT_JS);
    return `URL: ${s.url}\nTitle: ${s.title}\n\n## Interactive elements (use ref with browser_click/browser_type)\n${s.items.join("\n") || "(none)"}\n\n## Page text\n${truncateMiddle(s.text, maxChars)}`;
}
function target(p, a) {
    if (a.ref !== undefined && a.ref !== null && a.ref !== "")
        return p.locator(`[data-stitap-ref="${String(a.ref).replace(/[^0-9]/g, "")}"]`).first();
    if (a.selector)
        return p.locator(a.selector).first();
    if (a.text)
        return p.getByText(a.text, { exact: false }).first();
    throw new Error("provide ref (from browser_snapshot), selector, or text");
}
const avail = (rt) => browserCfg(rt).mode === "safari" ? safariAvailable() : playwrightAvailable() || "playwright not installed (run: harness browser setup)";
const mk = (t) => ({ ...t, toolset: "browser", tier: "standard", available: avail });
export const browserTools = [
    mk({
        name: "browser_navigate", description: "Open a URL in the agent's browser and return a snapshot (text + numbered interactive elements).",
        parameters: obj({ url: str("http(s) URL") }, ["url"]),
        async handler(a, ctx) {
            await checkEgress(a.url, { allowPrivate: true, allowlist: ctx.rt.cfg.data.web.egress_allowlist });
            const p = await page(ctx);
            await p.goto(a.url, { waitUntil: "domcontentloaded", timeout: 45000 });
            await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
            return snapshot(p);
        },
    }),
    mk({ name: "browser_snapshot", description: "Re-read the current page (text + numbered interactive elements).", parameters: obj({ max_chars: int("max page text chars") }), async handler(a, ctx) { return snapshot(await page(ctx), Number(a.max_chars) || 12000); } }),
    mk({
        name: "browser_click", description: "Click an element by ref (from snapshot), CSS selector, or visible text. Returns the new snapshot.",
        parameters: obj({ ref: str("element ref number"), selector: str("CSS selector"), text: str("visible text") }),
        async handler(a, ctx) { const p = await page(ctx); await target(p, a).click({ timeout: 15000 }); await p.waitForLoadState("domcontentloaded").catch(() => undefined); await p.waitForTimeout(400); return snapshot(p); },
    }),
    mk({
        name: "browser_type", description: "Type into an input by ref/selector. submit=true presses Enter afterwards.",
        parameters: obj({ ref: str("element ref"), selector: str("CSS selector"), text: str("text to type"), submit: bool("press Enter"), clear: bool("clear first (default true)") }, ["text"]),
        async handler(a, ctx) {
            const p = await page(ctx);
            const el = target(p, { ref: a.ref, selector: a.selector });
            if (a.clear !== false)
                await el.fill(String(a.text), { timeout: 15000 });
            else
                await el.type(String(a.text));
            if (a.submit) {
                await el.press("Enter");
                await p.waitForLoadState("domcontentloaded").catch(() => undefined);
                await p.waitForTimeout(600);
            }
            return snapshot(p);
        },
    }),
    mk({ name: "browser_press", description: "Press a keyboard key (Enter, Tab, Escape, ArrowDown, Control+a …).", parameters: obj({ key: str("key") }, ["key"]), async handler(a, ctx) { const p = await page(ctx); await p.keyboard.press(String(a.key)); await p.waitForTimeout(300); return snapshot(p, 4000); } }),
    mk({ name: "browser_scroll", description: "Scroll the page.", parameters: obj({ direction: enm(["down", "up", "top", "bottom"], "direction") }, ["direction"]), async handler(a, ctx) { const p = await page(ctx); const d = a.direction; await p.evaluate(`window.scrollTo(0, ${d === "top" ? 0 : d === "bottom" ? "document.body.scrollHeight" : `window.scrollY + ${d === "up" ? -1 : 1} * window.innerHeight * 0.8`})`); await p.waitForTimeout(400); return snapshot(p, 6000); } }),
    mk({ name: "browser_back", description: "Go back in history.", parameters: obj({}), async handler(_a, ctx) { const p = await page(ctx); await p.goBack().catch(() => undefined); return snapshot(p); } }),
    mk({
        name: "browser_screenshot", description: "Save a screenshot PNG and return its path (inspect it with vision_analyze).",
        parameters: obj({ full_page: bool("capture the whole page"), path: str("output path (optional)") }),
        async handler(a, ctx) { const p = await page(ctx); const dir = join(ctx.rt.home, "files", "screenshots"); mkdirSync(dir, { recursive: true }); const out = a.path || join(dir, `shot-${Date.now()}.png`); await p.screenshot({ path: out, fullPage: !!a.full_page }); return `Saved screenshot to ${out}`; },
    }),
    mk({ name: "browser_console", description: "Recent console messages from the page.", parameters: obj({}), async handler(_a, ctx) { await page(ctx); return sessions.get(ctx.session.id)?.console.slice(-60).join("\n") || "(no console output)"; } }),
    mk({ name: "browser_eval", description: "Evaluate a JavaScript expression in the page and return the JSON result.", parameters: obj({ expression: str("JS expression") }, ["expression"]), async handler(a, ctx) { const p = await page(ctx); const r = await p.evaluate(String(a.expression)); return truncateMiddle(JSON.stringify(r, null, 2) ?? "undefined", 12000); } }),
    mk({ name: "browser_close", description: "Close the browser for this session.", parameters: obj({}), async handler(_a, ctx) { const s = sessions.get(ctx.session.id); if (s) {
            await closeSession(s);
            sessions.delete(ctx.session.id);
        } return s?.mode === "connect" ? "closed the agent's tabs and detached (your Chrome keeps running)" : "closed"; } }),
    mk({
        name: "browser_tabs", description: "List, open, switch or close tabs. action=list shows [index] title — url (* = current).",
        parameters: obj({ action: enm(["list", "new", "switch", "close"], "what to do"), index: int("tab index from list"), url: str("URL for action=new") }, ["action"]),
        async handler(a, ctx) {
            const s = await open(ctx);
            const tabs = () => s.context.pages().filter((x) => !x.isClosed());
            if (a.action === "new") {
                if (a.url)
                    await checkEgress(a.url, { allowPrivate: true, allowlist: ctx.rt.cfg.data.web.egress_allowlist });
                const p = await s.context.newPage();
                p.__stitap = true;
                s.page = p;
                watch(s, p);
                if (a.url) {
                    await p.goto(a.url, { waitUntil: "domcontentloaded", timeout: 45000 });
                    return snapshot(p);
                }
                return "opened a new tab";
            }
            const list = tabs();
            const pick = () => { const i = Number(a.index); if (!Number.isInteger(i) || i < 0 || i >= list.length)
                throw new Error(`index must be 0..${list.length - 1}`); return list[i]; };
            if (a.action === "switch") {
                s.page = pick();
                await s.page.bringToFront().catch(() => undefined);
                return snapshot(s.page);
            }
            if (a.action === "close") {
                const p = pick();
                await p.close();
                if (p === s.page)
                    s.page = tabs().at(-1) ?? await s.context.newPage();
                return "closed tab " + a.index;
            }
            const rows = await Promise.all(list.map(async (p, i) => `${p === s.page ? "*" : " "} [${i}] ${(await p.title().catch(() => "")) || "(untitled)"} — ${p.url()}`));
            return rows.join("\n") || "(no tabs)";
        },
    }),
    mk({
        name: "browser_wait", description: "Wait until text or a CSS selector appears on the page (or just wait ms). Returns the snapshot.",
        parameters: obj({ text: str("text to wait for"), selector: str("CSS selector to wait for"), ms: int("milliseconds to wait (max 30000)"), timeout: int("max wait for text/selector in ms (default 15000)") }),
        async handler(a, ctx) {
            const p = await page(ctx);
            const t = Math.min(Number(a.timeout) || 15000, 60000);
            if (a.text)
                await p.getByText(String(a.text), { exact: false }).first().waitFor({ timeout: t });
            else if (a.selector)
                await p.locator(String(a.selector)).first().waitFor({ timeout: t });
            else
                await p.waitForTimeout(Math.min(Number(a.ms) || 1000, 30000));
            return snapshot(p, 6000);
        },
    }),
    mk({
        name: "browser_select", description: "Choose an option in a <select> dropdown by its value or visible label.",
        parameters: obj({ ref: str("element ref"), selector: str("CSS selector"), value: str("option value or label") }, ["value"]),
        async handler(a, ctx) {
            const p = await page(ctx);
            const el = target(p, { ref: a.ref, selector: a.selector });
            const v = String(a.value);
            await el.selectOption({ label: v }, { timeout: 5000 }).catch(() => el.selectOption(v, { timeout: 10000 }));
            return snapshot(p, 6000);
        },
    }),
    mk({
        name: "browser_upload", description: "Attach local file(s) to a file input (by ref or selector).",
        parameters: obj({ ref: str("element ref of the file input"), selector: str("CSS selector"), paths: arr(str("file path"), "files to upload") }, ["paths"]),
        async handler(a, ctx) {
            const p = await page(ctx);
            const files = a.paths.map((f) => resolvePath(ctx.cwd, f));
            const ok = await ctx.requestApproval({ tool: "browser_upload", command: `browser_upload ${files.join(" ")}`, reason: `upload ${files.length} file(s) to ${p.url()}` });
            if (!ok)
                return "BLOCKED: upload not approved";
            await target(p, { ref: a.ref, selector: a.selector }).setInputFiles(files, { timeout: 15000 });
            return `attached ${files.length} file(s)\n` + await snapshot(p, 4000);
        },
    }),
];

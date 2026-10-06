/**
 * harness browser setup | chrome [--port 9222] | status
 *   setup   install playwright-core next to the harness (pure JS, no browser download when Chrome/Edge is installed),
 *           and pick a mode: your installed Chrome (own profile) if found, else download Playwright's Chromium.
 *   chrome  start your Chrome with remote debugging on a dedicated profile and attach the agent to it (mode=connect):
 *           the agent opens its own tabs in a real, visible Chrome where you can sign in once and stay signed in.
 *   status  what the agent will use.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { playwrightAvailable, browserCfg } from "../tools/browser.js";
import { SAFARI_SETUP, safariAvailable } from "../tools/safari.js";
import { which } from "../tools/desktop.js";
import { gray, green, red } from "./ui.js";
const AGENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export function findChrome(os = process.platform, env = process.env) {
    const c = [];
    if (os === "darwin") {
        for (const base of ["/Applications", join(env.HOME ?? "", "Applications")])
            c.push(`${base}/Google Chrome.app/Contents/MacOS/Google Chrome`, `${base}/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`, `${base}/Chromium.app/Contents/MacOS/Chromium`, `${base}/Brave Browser.app/Contents/MacOS/Brave Browser`);
    }
    else if (os === "win32") {
        for (const base of [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean))
            c.push(join(base, "Google", "Chrome", "Application", "chrome.exe"), join(base, "Microsoft", "Edge", "Application", "msedge.exe"), join(base, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"));
    }
    else {
        for (const b of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"]) {
            if (which(b)) {
                const r = spawnSync("sh", ["-c", `command -v ${b}`], { encoding: "utf8" });
                if (r.stdout.trim())
                    return r.stdout.trim();
            }
        }
    }
    return c.find((p) => existsSync(p)) ?? null;
}
/** Chrome refuses remote debugging on its default profile (since v136), so the agent gets its own profile dir. */
export function chromeArgs(port, profileDir) {
    return [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check"];
}
async function cdpUp(url) {
    try {
        const r = await fetch(url.replace(/\/$/, "") + "/json/version", { signal: AbortSignal.timeout(1500) });
        if (r.ok)
            return (await r.json()).Browser ?? "ok";
    }
    catch { /* not up */ }
    return null;
}
export async function browserCommand(cfg, home, sub, f) {
    const rtLike = { cfg, home };
    if (sub === "setup") {
        if (!playwrightAvailable()) {
            console.log(gray(`installing playwright-core into ${AGENT_DIR} …`));
            const npm = process.platform === "win32" ? "npm.cmd" : "npm";
            const r = spawnSync(npm, ["install", "playwright-core@1", "--no-save", "--no-audit", "--no-fund", "--prefix", AGENT_DIR], { stdio: "inherit", shell: process.platform === "win32" });
            if (r.status !== 0) {
                console.log(red("npm install failed"));
                return 1;
            }
        }
        const chrome = findChrome();
        if (process.platform === "darwin" && safariAvailable() === true && !f.chrome) {
            cfg.set("browser.mode", "safari");
            console.log(green("browser: Safari (macOS default; use --chrome for a Chromium browser)"));
            console.log(gray(SAFARI_SETUP.replace(/^Safari is not set up for automation\. /, "If you haven't yet: ")));
        }
        else if (chrome) {
            cfg.set("browser.mode", "chrome");
            cfg.set("browser.headless", f.headless === true || f.headless === "true");
            if (!/Google Chrome|chrome\.exe|google-chrome/.test(chrome))
                cfg.set("browser.executable_path", chrome);
            console.log(green(`browser: using your installed browser (${chrome}) with its own agent profile`));
        }
        else {
            console.log(gray("no Chrome/Edge found — downloading Playwright's Chromium …"));
            const cli = join(AGENT_DIR, "node_modules", "playwright-core", "cli.js");
            const r = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
            if (r.status !== 0) {
                console.log(red("chromium download failed"));
                return 1;
            }
            cfg.set("browser.mode", "launch");
        }
        if (cfg.get("agent.tool_profile") === "slm") {
            const en = new Set(cfg.get("tools.enabled") ?? []);
            en.add("browser");
            en.add("desktop");
            cfg.set("tools.enabled", [...en]);
            console.log(green("small-model profile: browser and desktop tools switched on (tools.enabled)"));
        }
        console.log(green("done.") + gray(" Try: harness \"open example.com and tell me the heading\""));
        return 0;
    }
    if (sub === "chrome") {
        const port = Number(f.port) || 9222;
        const url = `http://127.0.0.1:${port}`;
        let up = await cdpUp(url);
        if (!up) {
            const chrome = findChrome();
            if (!chrome) {
                console.log(red("Chrome / Edge not found. Install Google Chrome, or set browser.executable_path."));
                return 1;
            }
            const profile = cfg.get("browser.user_data_dir") || join(home, "chrome-agent-profile");
            mkdirSync(profile, { recursive: true });
            spawn(chrome, chromeArgs(port, profile), { detached: true, stdio: "ignore" }).unref();
            for (let i = 0; i < 40 && !up; i++) {
                await new Promise((r) => setTimeout(r, 250));
                up = await cdpUp(url);
            }
            if (!up) {
                console.log(red(`Chrome started but is not answering on ${url}. Close all Chrome windows using that profile and retry.`));
                return 1;
            }
            console.log(green(`started ${up} (profile ${profile})`));
        }
        else
            console.log(green(`attached to running ${up} on ${url}`));
        cfg.set("browser.mode", "connect");
        cfg.set("browser.cdp_url", url);
        console.log(gray("browser.mode = connect: the agent opens its own tabs in this Chrome window. Sign in to sites there once; the profile keeps you signed in."));
        return 0;
    }
    const c = browserCfg(rtLike);
    console.log(`playwright: ${playwrightAvailable() ? green("installed") : red("missing — run: harness browser setup")}`);
    console.log(`mode:       ${c.mode}${c.mode === "connect" ? ` (${c.cdp_url}: ${(await cdpUp(c.cdp_url)) ?? red("not reachable — run: harness browser chrome")})` : ""}`);
    console.log(`chrome:     ${findChrome() ?? gray("not found")}`);
    console.log(`headless:   ${c.headless}`);
    return 0;
}

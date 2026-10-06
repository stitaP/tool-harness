/**
 * webtest: browser testing for web applications with Playwright.
 *  - install:  download Playwright browsers (chromium/webkit/firefox) via playwright-core's cli.js
 *  - init:     scaffold a Playwright Test project (config, example spec, page object base)
 *  - scenario: run a step list right now with playwright-core and keep evidence
 *              (per-step screenshots, video, trace.zip, report.md, generated spec)
 *  - run:      run an existing Playwright Test project and parse its JSON report
 *  - report:   summarize the latest results in a folder
 * playwright-core is optional and resolved at runtime (same lookup as browser.ts).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { Runtime } from "../runtime/runtime.js";
import { checkEgress, resolvePath } from "../safety/paths.js";
import { truncateMiddle } from "../util/misc.js";
import { type Tool, type ToolContext, obj, str, int, bool, enm, arr } from "./types.js";

// ---------- playwright-core resolution (mirrors browser.ts) ----------

const PW_PKGS = ["playwright", "playwright-core"];
export function resolvePw(): string | null {
  for (const base of [process.cwd() + "/", import.meta.url]) {
    for (const pkg of PW_PKGS) { try { return createRequire(base).resolve(pkg); } catch { /* next */ } }
  }
  return null;
}
export async function loadPlaywright(): Promise<any> {
  const p = resolvePw();
  if (!p) throw new Error("playwright is not installed — run: harness browser setup");
  const m = await import(pathToFileURL(p).href);
  return m.chromium ? m : (m.default ?? m);
}
/** cli.js of the resolved playwright / playwright-core package. */
function pwCli(): string | null {
  const p = resolvePw();
  if (!p) return null;
  let d = dirname(p);
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(d, "package.json")) && existsSync(join(d, "cli.js"))) return join(d, "cli.js");
    d = dirname(d);
  }
  return null;
}

// ---------- types ----------

export type BrowserName = "chromium" | "webkit" | "firefox";
export type StepAction = "goto" | "click" | "fill" | "press" | "select" | "check" | "uncheck" | "hover" | "wait"
  | "expect_text" | "expect_visible" | "expect_url" | "expect_title" | "screenshot";
export interface Step { action: StepAction; selector?: string; text?: string; value?: string; url?: string; key?: string; ms?: number; name?: string }

export interface ScenarioOptions {
  url?: string;
  steps: Step[];
  name?: string;
  /** output root: results go to <dir>/test-results/<name>-<ts>/ and the spec to <dir>/tests/ */
  dir: string;
  browser?: BrowserName;
  headed?: boolean;
  viewport?: { width: number; height: number };
  video?: boolean;
  trace?: boolean;
  screenshot_each_step?: boolean;
  /** per-step timeout for actions and expectations (default 10000 ms) */
  stepTimeoutMs?: number;
  /** egress allowlist (web.egress_allowlist); private hosts are allowed like browser.ts */
  allowlist?: string[];
  executablePath?: string;
  signal?: AbortSignal;
  progress?: (s: string) => void;
}
export interface StepResult { index: number; action: StepAction; target: string; ok: boolean; durationMs: number; screenshot?: string; error?: string }
export interface ScenarioResult {
  ok: boolean; name: string; outDir: string; steps: StepResult[];
  failedStep?: StepResult; error?: string;
  reportPath: string; specPath?: string; videoPath?: string; tracePath?: string; summary: string;
}

const ACTIONS: StepAction[] = ["goto", "click", "fill", "press", "select", "check", "uncheck", "hover", "wait", "expect_text", "expect_visible", "expect_url", "expect_title", "screenshot"];
const BROWSERS: BrowserName[] = ["chromium", "webkit", "firefox"];

const slug = (s: string) => (s || "scenario").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "scenario";
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const q = (s: string) => JSON.stringify(String(s));
const pad = (n: number) => String(n).padStart(2, "0");
const firstLine = (s: string) => String(s ?? "").replace(/\u001b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3).join(" ");

function describeTarget(s: Step): string {
  switch (s.action) {
    case "goto": return s.url ?? "";
    case "press": return [s.selector, s.key].filter(Boolean).join(" ← ");
    case "fill": case "select": return `${s.selector ?? ""} = ${s.value ?? s.text ?? ""}`;
    case "wait": return s.selector ?? (s.text ? `text "${s.text}"` : `${s.ms ?? 1000} ms`);
    case "expect_text": return s.selector ? `${s.selector} ∋ "${s.text ?? s.value ?? ""}"` : `"${s.text ?? s.value ?? ""}"`;
    case "expect_url": return s.url ?? s.text ?? s.value ?? "";
    case "expect_title": return s.text ?? s.value ?? "";
    case "screenshot": return s.name ?? "";
    default: return s.selector ?? s.text ?? "";
  }
}

function normalizeSteps(url: string | undefined, steps: Step[]): Step[] {
  const out = (Array.isArray(steps) ? steps : []).map((s) => ({ ...s, action: String(s?.action ?? "") as StepAction }));
  for (const s of out) if (!ACTIONS.includes(s.action)) throw new Error(`unknown step action "${s.action}" (use ${ACTIONS.join("|")})`);
  if (url && out[0]?.action !== "goto") out.unshift({ action: "goto", url });
  if (out[0]?.action === "goto" && !out[0].url) out[0].url = url;
  return out;
}

// ---------- spec generation ----------

function locExpr(sel: string | undefined, text?: string): string {
  if (sel) return `page.locator(${q(sel)}).first()`;
  if (text) return `page.getByText(${q(text)}).first()`;
  throw new Error("step needs a selector");
}

/** Playwright Test code equivalent to the steps. */
export function generateSpec(name: string, steps: Step[], opts: { url?: string; screenshotEachStep?: boolean } = {}): string {
  const st = normalizeSteps(opts.url, steps);
  const each = opts.screenshotEachStep ?? false;
  const L: string[] = [];
  L.push(`// Generated by stitaP webtest (scenario "${name.replace(/[\r\n"]/g, " ")}"). Edit freely.`);
  L.push(`import { test, expect } from '@playwright/test';`, ``);
  L.push(`test(${q(name)}, async ({ page }) => {`);
  st.forEach((s, i) => {
    const n = pad(i + 1);
    const shot = (file: string, full = false) => `  await page.screenshot({ path: test.info().outputPath(${q(file)})${full ? ", fullPage: true" : ""} });`;
    L.push(`  // step ${i + 1}: ${s.action} ${describeTarget(s).replace(/\n/g, " ")}`);
    switch (s.action) {
      case "goto": L.push(`  await page.goto(${q(s.url ?? "/")});`); break;
      case "click": L.push(`  await ${locExpr(s.selector, s.text)}.click();`); break;
      case "fill": L.push(`  await ${locExpr(s.selector)}.fill(${q(s.value ?? s.text ?? "")});`); break;
      case "press": L.push(s.selector ? `  await ${locExpr(s.selector)}.press(${q(s.key ?? "Enter")});` : `  await page.keyboard.press(${q(s.key ?? "Enter")});`); break;
      case "select": L.push(`  await ${locExpr(s.selector)}.selectOption(${q(s.value ?? s.text ?? "")});`); break;
      case "check": L.push(`  await ${locExpr(s.selector, s.text)}.check();`); break;
      case "uncheck": L.push(`  await ${locExpr(s.selector, s.text)}.uncheck();`); break;
      case "hover": L.push(`  await ${locExpr(s.selector, s.text)}.hover();`); break;
      case "wait":
        if (s.selector || s.text) L.push(`  await ${locExpr(s.selector, s.text)}.waitFor();`);
        else L.push(`  await page.waitForTimeout(${Number(s.ms) || 1000});`);
        break;
      case "expect_text": {
        const t = s.text ?? s.value ?? "";
        L.push(s.selector ? `  await expect(${locExpr(s.selector)}).toContainText(${q(t)});` : `  await expect(page.getByText(${q(t)}).first()).toBeVisible();`);
        break;
      }
      case "expect_visible": L.push(`  await expect(${locExpr(s.selector, s.text)}).toBeVisible();`); break;
      case "expect_url": L.push(`  await expect(page).toHaveURL(new RegExp(${q(escRe(s.url ?? s.text ?? s.value ?? ""))}));`); break;
      case "expect_title": L.push(`  await expect(page).toHaveTitle(new RegExp(${q(escRe(s.text ?? s.value ?? ""))}));`); break;
      case "screenshot": L.push(shot(`step-${n}-screenshot${s.name ? "-" + slug(s.name) : ""}.png`, true)); break;
    }
    if (each && s.action !== "screenshot") L.push(shot(`step-${n}-${s.action}.png`));
  });
  L.push(`});`, ``);
  return L.join("\n");
}

// ---------- scenario runner ----------

async function poll(fn: () => Promise<boolean>, timeoutMs: number, what: () => Promise<string> | string): Promise<void> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (await fn().catch(() => false)) return;
    if (Date.now() > end) throw new Error(`timed out after ${timeoutMs} ms: ${await what()}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function execStep(page: any, s: Step, t: number, check: (u: string) => Promise<void>, startUrl?: string): Promise<void> {
  const loc = () => locExprRuntime(page, s.selector, s.text);
  switch (s.action) {
    case "goto": {
      const cur = page.url();
      const baseUrl = cur && cur !== "about:blank" ? cur : startUrl;
      let u: string;
      try { u = new URL(s.url ?? "/", baseUrl).href; } catch { throw new Error(`invalid URL "${s.url ?? ""}" (relative URLs need a start url)`); }
      await check(u);
      await page.goto(u, { waitUntil: "domcontentloaded", timeout: Math.max(t, 30000) });
      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
      return;
    }
    case "click": await loc().click({ timeout: t }); await page.waitForLoadState("domcontentloaded").catch(() => undefined); return;
    case "fill": await locExprRuntime(page, s.selector).fill(String(s.value ?? s.text ?? ""), { timeout: t }); return;
    case "press":
      if (s.selector) await locExprRuntime(page, s.selector).press(String(s.key ?? "Enter"), { timeout: t });
      else await page.keyboard.press(String(s.key ?? "Enter"));
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      return;
    case "select": {
      const el = locExprRuntime(page, s.selector); const v = String(s.value ?? s.text ?? "");
      await el.selectOption(v, { timeout: t }).catch(() => el.selectOption({ label: v }, { timeout: t }));
      return;
    }
    case "check": await loc().check({ timeout: t }); return;
    case "uncheck": await loc().uncheck({ timeout: t }); return;
    case "hover": await loc().hover({ timeout: t }); return;
    case "wait":
      if (s.selector || s.text) await loc().waitFor({ state: "visible", timeout: Math.max(t, Number(s.ms) || 0) });
      else await page.waitForTimeout(Math.min(Number(s.ms) || 1000, 60000));
      return;
    case "expect_text": {
      const want = String(s.text ?? s.value ?? "");
      if (s.selector) {
        const el = locExprRuntime(page, s.selector);
        await poll(async () => String(await el.innerText({ timeout: 500 })).includes(want), t, async () => `expected ${s.selector} to contain "${want}" (got "${truncateMiddle(String(await el.innerText({ timeout: 300 }).catch(() => "<not found>")), 200)}")`);
      } else {
        await poll(async () => await page.getByText(want).first().isVisible(), t, () => `expected visible text "${want}" on ${page.url()}`);
      }
      return;
    }
    case "expect_visible": { const el = loc(); await poll(() => el.isVisible(), t, () => `expected ${s.selector ?? s.text} to be visible`); return; }
    case "expect_url": { const want = String(s.url ?? s.text ?? s.value ?? ""); await poll(async () => page.url().includes(want), t, () => `expected URL to contain "${want}" (got ${page.url()})`); return; }
    case "expect_title": { const want = String(s.text ?? s.value ?? ""); await poll(async () => String(await page.title()).includes(want), t, async () => `expected title to contain "${want}" (got "${await page.title().catch(() => "")}")`); return; }
    case "screenshot": return;   // taken by the caller
  }
}
function locExprRuntime(page: any, sel?: string, text?: string): any {
  if (sel) return page.locator(sel).first();
  if (text) return page.getByText(text).first();
  throw new Error("step needs a selector");
}

const cell = (s: string) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function writeReport(r: Omit<ScenarioResult, "summary" | "reportPath">, meta: { url?: string; browser: string; started: Date; specRel?: string }): string {
  const L: string[] = [];
  L.push(`# Scenario: ${r.name}`, ``);
  L.push(`- Result: **${r.ok ? "PASSED" : "FAILED"}** (${r.steps.filter((s) => s.ok).length}/${r.steps.length} steps passed)`);
  L.push(`- Browser: ${meta.browser}`, `- Start URL: ${meta.url ?? "(none)"}`, `- Started: ${meta.started.toISOString()}`);
  if (r.videoPath) L.push(`- Video: [${relative(r.outDir, r.videoPath)}](${relative(r.outDir, r.videoPath)})`);
  if (r.tracePath) L.push(`- Trace: [trace.zip](trace.zip) — open with \`npx playwright show-trace ${r.tracePath}\``);
  if (meta.specRel) L.push(`- Generated spec: \`${meta.specRel}\``);
  L.push(``, `| # | action | target | result | duration | screenshot |`, `|---|---|---|---|---|---|`);
  for (const s of r.steps) {
    const shot = s.screenshot ? `[${relative(r.outDir, s.screenshot)}](${relative(r.outDir, s.screenshot)})` : "";
    L.push(`| ${s.index} | ${s.action} | ${cell(s.target)} | ${s.ok ? "pass" : "**FAIL**"} | ${s.durationMs} ms | ${shot} |`);
  }
  if (r.failedStep) {
    const f = r.failedStep;
    L.push(``, `## Failure`, ``, `Step ${f.index} (${f.action} ${cell(f.target)}) failed:`, ``, "```", f.error ?? "", "```");
    if (f.screenshot) L.push(``, `![failure screenshot](${relative(r.outDir, f.screenshot)})`);
  }
  const p = join(r.outDir, "report.md");
  writeFileSync(p, L.join("\n") + "\n");
  return p;
}

const GEN_MARK = "// Generated by stitaP webtest";

/** Run a step list with playwright-core and save evidence. Stops at the first failed step. */
export async function runScenario(opts: ScenarioOptions): Promise<ScenarioResult> {
  const name = opts.name?.trim() || "scenario";
  const browserName: BrowserName = BROWSERS.includes(opts.browser as BrowserName) ? opts.browser as BrowserName : "chromium";
  const steps = normalizeSteps(opts.url, opts.steps);
  if (!steps.length) throw new Error("no steps (give url and/or steps)");
  const t = Math.max(500, Number(opts.stepTimeoutMs) || 10000);
  const viewport = opts.viewport?.width && opts.viewport?.height ? { width: Math.round(opts.viewport.width), height: Math.round(opts.viewport.height) } : { width: 1280, height: 800 };
  const video = opts.video !== false, trace = opts.trace !== false, each = opts.screenshot_each_step !== false;
  const started = new Date();
  const outDir = join(opts.dir, "test-results", `${slug(name)}-${started.toISOString().replace(/[:.]/g, "-").replace("Z", "")}`);
  mkdirSync(outDir, { recursive: true });
  const check = (u: string) => checkEgress(u, { allowPrivate: true, allowlist: opts.allowlist ?? [] }).then(() => undefined);
  const progress = opts.progress ?? (() => undefined);

  const pw = await loadPlaywright();
  const bt = pw[browserName];
  if (!bt) throw new Error(`playwright has no ${browserName}`);
  const exe = opts.executablePath || undefined;
  if (!exe && !existsSync(bt.executablePath())) throw new Error(`${browserName} is not downloaded — run webtest action=install browsers=["${browserName}"]`);

  const results: StepResult[] = [];
  let videoPath: string | undefined, tracePath: string | undefined, failed: StepResult | undefined;
  const browser = await bt.launch({ headless: !opts.headed, executablePath: exe });
  try {
    const context = await browser.newContext({ viewport, ...(video ? { recordVideo: { dir: outDir, size: viewport } } : {}) });
    if (trace) await context.tracing.start({ screenshots: true, snapshots: true, sources: false, title: name });
    const page = await context.newPage();
    const onAbort = () => { browser.close().catch(() => undefined); };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      for (let i = 0; i < steps.length; i++) {
        if (opts.signal?.aborted) throw new Error("interrupted");
        const s = steps[i], idx = i + 1, t0 = Date.now();
        const r: StepResult = { index: idx, action: s.action, target: describeTarget(s), ok: true, durationMs: 0 };
        progress(`step ${idx}/${steps.length}: ${s.action} ${r.target}\n`);
        try {
          await execStep(page, s, t, check, opts.url);
          r.durationMs = Date.now() - t0;
          if (s.action === "screenshot" || each) {
            const file = join(outDir, `step-${pad(idx)}-${s.action}.png`);
            await page.screenshot({ path: file, fullPage: s.action === "screenshot", timeout: 15000 }).then(() => { r.screenshot = file; }).catch(() => undefined);
          }
        } catch (e: any) {
          r.ok = false; r.durationMs = Date.now() - t0;
          r.error = String(e?.message ?? e).replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 12).join("\n");
          const file = join(outDir, `step-${pad(idx)}-${s.action}-failed.png`);
          await page.screenshot({ path: file, timeout: 10000 }).then(() => { r.screenshot = file; }).catch(() => undefined);
          failed = r;
        }
        results.push(r);
        if (!r.ok) break;
      }
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
      if (trace) { tracePath = join(outDir, "trace.zip"); await context.tracing.stop({ path: tracePath }).catch(() => { tracePath = undefined; }); }
      const vid = video ? page.video() : null;
      await context.close().catch(() => undefined);
      if (vid) {
        const src = await vid.path().catch(() => null);
        if (src && existsSync(src)) { videoPath = join(outDir, "video.webm"); try { renameSync(src, videoPath); } catch { videoPath = src; } }
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  // generated spec: becomes part of the project's tests/ folder
  let specPath: string | undefined;
  try {
    const testsDir = join(opts.dir, "tests");
    mkdirSync(testsDir, { recursive: true });
    specPath = join(testsDir, `${slug(name)}.spec.ts`);
    if (existsSync(specPath) && !readFileSync(specPath, "utf8").startsWith(GEN_MARK)) specPath = join(testsDir, `${slug(name)}.generated.spec.ts`);
    writeFileSync(specPath, generateSpec(name, steps, { screenshotEachStep: each }));
  } catch { specPath = undefined; }

  const ok = !failed;
  const base = { ok, name, outDir, steps: results, failedStep: failed, error: failed?.error, specPath, videoPath, tracePath };
  const reportPath = writeReport(base, { url: steps[0]?.url, browser: browserName, started, specRel: specPath ? relative(opts.dir, specPath) : undefined });
  const lines = [
    `Scenario "${name}": ${ok ? "PASSED" : "FAILED"} — ${results.filter((s) => s.ok).length}/${steps.length} steps passed (${browserName}${opts.headed ? ", headed" : ""})`,
  ];
  if (failed) lines.push(`Failed at step ${failed.index} (${failed.action} ${failed.target}): ${firstLine(failed.error ?? "")}`, failed.screenshot ? `Failure screenshot: ${failed.screenshot}` : "");
  lines.push(`Evidence: ${outDir}`, `Report: ${reportPath}`);
  if (videoPath) lines.push(`Video: ${videoPath}`);
  if (tracePath) lines.push(`Trace: ${tracePath} (npx playwright show-trace ${tracePath})`);
  if (specPath) lines.push(`Spec: ${specPath}`);
  return { ...base, reportPath, summary: lines.filter(Boolean).join("\n") };
}

// ---------- JSON report parsing (Playwright JSON reporter) ----------

export interface ParsedFailure { title: string; file?: string; project?: string; status: string; error: string; attachments: { name: string; contentType?: string; path: string }[] }
export interface ParsedReport { total: number; expected: number; unexpected: number; flaky: number; skipped: number; durationMs: number; failures: ParsedFailure[]; errors: string[] }

/** Parse the output of Playwright's json reporter (suites → specs → tests → results). */
export function parseJsonReport(json: any, rootDir = ""): ParsedReport {
  const failures: ParsedFailure[] = [];
  let expected = 0, unexpected = 0, flaky = 0, skipped = 0;
  const walk = (suite: any, titles: string[]) => {
    const here = suite.title && !/\.(spec|test)\.[cm]?[jt]sx?$/.test(suite.title) ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const st = String(test.status ?? (spec.ok ? "expected" : "unexpected"));
        if (st === "expected") expected++; else if (st === "flaky") flaky++; else if (st === "skipped") skipped++; else unexpected++;
        if (st !== "unexpected") continue;
        const res = test.results ?? [];
        const last = res[res.length - 1] ?? {};
        const errs = [last.error?.message, ...(last.errors ?? []).map((e: any) => e?.message)].filter(Boolean);
        const attachments: ParsedFailure["attachments"] = [];
        for (const r of res) for (const a of r.attachments ?? []) if (a?.path) attachments.push({ name: String(a.name ?? ""), contentType: a.contentType, path: rootDir && !a.path.startsWith("/") ? join(rootDir, a.path) : a.path });
        failures.push({
          title: [...here, spec.title].filter(Boolean).join(" › "), file: spec.file ?? suite.file, project: test.projectName || test.projectId || undefined,
          status: String(last.status ?? "failed"), error: firstLine(String(errs[0] ?? "")).slice(0, 600), attachments,
        });
      }
    }
    for (const s of suite.suites ?? []) walk(s, here);
  };
  for (const s of json?.suites ?? []) walk(s, []);
  const stats = json?.stats ?? {};
  if (typeof stats.expected === "number") { expected = stats.expected; unexpected = stats.unexpected ?? unexpected; flaky = stats.flaky ?? flaky; skipped = stats.skipped ?? skipped; }
  return {
    total: expected + unexpected + flaky + skipped, expected, unexpected, flaky, skipped, durationMs: Math.round(Number(stats.duration) || 0),
    failures, errors: (json?.errors ?? []).map((e: any) => firstLine(e?.message ?? String(e))),
  };
}

export function formatReport(r: ParsedReport, source: string): string {
  const L = [`Playwright results (${source}): ${r.unexpected ? "FAILED" : "PASSED"} — ${r.total} tests: ${r.expected} passed, ${r.unexpected} failed, ${r.flaky} flaky, ${r.skipped} skipped${r.durationMs ? ` in ${(r.durationMs / 1000).toFixed(1)} s` : ""}`];
  for (const e of r.errors) L.push(`Global error: ${e}`);
  for (const f of r.failures.slice(0, 25)) {
    L.push(``, `✗ ${f.title}${f.project ? ` [${f.project}]` : ""}${f.file ? ` (${f.file})` : ""}`, `  ${f.error || f.status}`);
    for (const a of f.attachments.slice(0, 8)) L.push(`  ${a.name}: ${a.path}`);
  }
  if (r.failures.length > 25) L.push(`… ${r.failures.length - 25} more failures`);
  return L.join("\n");
}

// ---------- init scaffolding ----------

export function scaffoldFiles(url: string, browsers: BrowserName[], name: string): Record<string, string> {
  const dev: Record<BrowserName, string> = { chromium: "Desktop Chrome", webkit: "Desktop Safari", firefox: "Desktop Firefox" };
  const projects = browsers.map((b) => `    { name: '${b}', use: { ...devices['${dev[b]}'] } },`).join("\n");
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  return {
    "package.json": JSON.stringify({
      name: slug(name), private: true, version: "0.0.0", type: "module",
      scripts: { test: "playwright test", "test:headed": "playwright test --headed", report: "playwright show-report", "install-browsers": `playwright install ${browsers.join(" ")}` },
      devDependencies: { "@playwright/test": "^1.50.0", "@types/node": "^20.0.0" },
    }, null, 2) + "\n",
    "playwright.config.ts": `import { defineConfig, devices } from '@playwright/test';

/** See https://playwright.dev/docs/test-configuration */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // per-test artifacts; kept separate so other evidence under test-results/ is not wiped on each run
  outputDir: 'test-results/artifacts',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? ${q(url)},
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
${projects}
  ],
});
`,
    "tests/pages/BasePage.ts": `import { type Page, type Locator, expect } from '@playwright/test';

/** Page-object base class: https://playwright.dev/docs/pom */
export class BasePage {
  constructor(readonly page: Page, readonly path: string = '/') {}

  async open(): Promise<void> {
    await this.page.goto(this.path);
  }

  byRole(role: Parameters<Page['getByRole']>[0], name?: string): Locator {
    return this.page.getByRole(role, name ? { name } : undefined);
  }

  byText(text: string): Locator {
    return this.page.getByText(text);
  }

  async expectTitle(pattern: string | RegExp): Promise<void> {
    await expect(this.page).toHaveTitle(pattern);
  }

  async snap(name: string): Promise<void> {
    await this.page.screenshot({ path: \`test-results/screenshots/\${name}.png\`, fullPage: true });
  }
}
`,
    "tests/example.spec.ts": `import { test, expect } from '@playwright/test';
import { BasePage } from './pages/BasePage';

test.describe('${host.replace(/'/g, "")} smoke', () => {
  test('home page loads', async ({ page }) => {
    const home = new BasePage(page, '/');
    await home.open();
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('home.png'), fullPage: true });
  });
});
`,
    "README.md": `# ${name} — Playwright tests

End-to-end tests for ${url}, built with [Playwright Test](https://playwright.dev/docs/intro).

\`\`\`sh
npm install
npx playwright install ${browsers.join(" ")}
npx playwright test               # all browsers (${browsers.join(", ")})
npx playwright test --headed      # watch it run
npx playwright show-report        # HTML report
npx playwright show-trace test-results/artifacts/<test>/trace.zip
BASE_URL=https://staging.example.com npx playwright test
\`\`\`

Layout: \`playwright.config.ts\` (baseURL, screenshot on, video/trace retained on failure, JSON report in
\`test-results/results.json\`), \`tests/*.spec.ts\` (tests), \`tests/pages/\` (page objects).
Evidence: \`test-results/artifacts/\` (screenshots, videos, traces), \`playwright-report/\` (HTML).
`,
    ".gitignore": "node_modules/\ntest-results/\nplaywright-report/\nblob-report/\n",
  };
}

// ---------- process helper ----------

function runProc(cmd: string, args: string[], o: { cwd: string; timeoutMs: number; signal?: AbortSignal; env?: Record<string, string>; progress?: (s: string) => void }): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: o.cwd, env: { ...process.env, ...o.env }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", pending = "", last = 0, timedOut = false;
    const on = (b: Buffer) => {
      const s = b.toString(); output += s; if (output.length > 400_000) output = output.slice(-300_000);
      pending += s; const now = Date.now();
      if (o.progress && now - last > 150) { o.progress(pending); pending = ""; last = now; }
    };
    child.stdout.on("data", on); child.stderr.on("data", on);
    const kill = () => { try { child.kill("SIGTERM"); setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, 3000).unref(); } catch { /* gone */ } };
    const timer = setTimeout(() => { timedOut = true; kill(); }, o.timeoutMs);
    o.signal?.addEventListener("abort", kill, { once: true });
    child.on("error", (e) => { output += `\n${e.message}`; });
    child.on("close", (code) => {
      clearTimeout(timer); o.signal?.removeEventListener("abort", kill);
      if (pending && o.progress) o.progress(pending);
      resolve({ code, output, timedOut });
    });
  });
}

// ---------- tool ----------

function pickBrowsers(v: any): BrowserName[] {
  const list = (Array.isArray(v) ? v : v ? [v] : ["chromium"]).map((x: any) => String(x).toLowerCase().replace(/^safari$/, "webkit").replace(/^chrome$/, "chromium"));
  const bad = list.filter((b: string) => !BROWSERS.includes(b as BrowserName));
  if (bad.length) throw new Error(`unknown browser(s) ${bad.join(", ")} — use chromium, webkit (Safari engine) or firefox`);
  return [...new Set(list)] as BrowserName[];
}

function newestScenarioReport(dir: string): string | null {
  const root = join(dir, "test-results");
  if (!existsSync(root)) return null;
  let best: string | null = null, bestM = 0;
  for (const d of readdirSync(root)) {
    const p = join(root, d, "report.md");
    if (existsSync(p)) { const m = statSync(p).mtimeMs; if (m > bestM) { bestM = m; best = p; } }
  }
  return best;
}

const stepSchema = obj({
  action: enm(ACTIONS, "step action"),
  selector: str("Playwright selector: CSS, text=…, role=button[name=\"…\"], #id, [data-testid=…]"),
  text: str("text (expect_text/expect_title/wait; click/hover by visible text)"),
  value: str("value for fill/select"),
  url: str("URL for goto (relative resolves against the current page) or substring for expect_url"),
  key: str("key for press (Enter, Tab, Control+a …)"),
  ms: int("milliseconds for wait"),
  name: str("label for screenshot"),
}, ["action"]);

export const webtestTool: Tool = {
  name: "webtest",
  toolset: "testing",
  tier: "standard",
  description:
    "Browser testing for web apps with Playwright. action=scenario runs a list of steps now (goto/click/fill/press/select/check/uncheck/hover/wait/" +
    "expect_text/expect_visible/expect_url/expect_title/screenshot) and saves evidence: per-step screenshots, video, trace.zip, report.md, plus a generated " +
    "tests/<name>.spec.ts. action=init scaffolds a Playwright Test project (config with baseURL/screenshots/video/trace, page objects, example spec). " +
    "action=run executes an existing project's tests and summarizes failures with attachments; action=report summarizes the latest results; " +
    "action=install downloads browsers (chromium, webkit = Safari engine, firefox).",
  parameters: obj({
    action: enm(["install", "init", "scenario", "run", "report"], "what to do"),
    dir: str("project / output folder (default: current directory)"),
    url: str("start URL (scenario) or baseURL (init)"),
    name: str("scenario or project name"),
    steps: arr(stepSchema, "scenario steps, executed in order; stops at the first failure"),
    browser: enm(BROWSERS, "browser for scenario (default chromium; webkit = Safari engine)"),
    browsers: arr(enm(BROWSERS, "browser"), "browsers for install/init projects (default [chromium])"),
    headed: bool("show the browser window"),
    viewport: obj({ width: int("px"), height: int("px") }, ["width", "height"]),
    video: bool("record video (scenario, default true)"),
    trace: bool("record a Playwright trace (scenario, default true)"),
    screenshot_each_step: bool("screenshot after every step (scenario, default true)"),
    step_timeout_ms: int("per-step timeout for scenario actions/expectations (default 10000)"),
    install_deps: bool("init: run npm install afterwards (needs approval)"),
    grep: str("run: only tests matching this regex"),
    project: str("run: only this project (e.g. chromium)"),
    timeout: int("run/install: overall timeout in seconds (default 600)"),
  }, ["action"]),
  available: (_rt: Runtime) => resolvePw() !== null || "playwright-core is not installed (run: harness browser setup)",
  async handler(a, ctx: ToolContext) {
    const dir = a.dir ? resolvePath(ctx.cwd, String(a.dir)) : ctx.cwd;
    const allowlist: string[] = (ctx.rt.cfg.data as any)?.web?.egress_allowlist ?? [];
    const timeoutMs = Math.min(Math.max(Number(a.timeout) || 600, 10), 3600) * 1000;
    switch (a.action) {
      case "install": {
        const browsers = pickBrowsers(a.browsers);
        const cli = pwCli();
        if (!cli) return "error: playwright-core is not installed (run: harness browser setup)";
        const ok = await ctx.requestApproval({ tool: "webtest", command: `playwright install ${browsers.join(" ")}`, reason: `download Playwright browser builds (${browsers.join(", ")}; ~100-200 MB each)` });
        if (!ok) return "BLOCKED: browser download not approved.";
        const r = await runProc(process.execPath, [cli, "install", ...browsers], { cwd: dir, timeoutMs: Math.max(timeoutMs, 1_200_000), signal: ctx.signal, progress: ctx.progress });
        const head = r.timedOut ? "[timed out]" : `exit code: ${r.code}`;
        return `${head}\n${truncateMiddle(r.output.trim() || "(no output)", 3000)}${r.code === 0 ? `\nInstalled: ${browsers.join(", ")}` : ""}`;
      }
      case "init": {
        const url = String(a.url ?? "http://localhost:3000");
        const browsers = pickBrowsers(a.browsers);
        const files = scaffoldFiles(url, browsers, String(a.name ?? (dir.split(/[\\/]/).pop() || "webapp")));
        mkdirSync(dir, { recursive: true });
        const created: string[] = [], skipped: string[] = [];
        for (const [rel, body] of Object.entries(files)) {
          const p = join(dir, rel);
          if (existsSync(p)) { skipped.push(rel); continue; }
          mkdirSync(dirname(p), { recursive: true });
          writeFileSync(p, body);
          created.push(rel);
        }
        const L = [`Scaffolded Playwright Test project in ${dir} (baseURL ${url}; projects: ${browsers.join(", ")})`];
        if (created.length) L.push(`Created: ${created.join(", ")}`);
        if (skipped.length) L.push(`Skipped (already exist, not overwritten): ${skipped.join(", ")}`);
        if (a.install_deps) {
          const ok = await ctx.requestApproval({ tool: "webtest", command: `npm install (in ${dir})`, reason: "install @playwright/test from the npm registry" });
          if (!ok) L.push("npm install was not approved — run it yourself: npm install");
          else {
            // Windows: Node (20.12+/18.20+) refuses to spawn .cmd files without a shell, so go through cmd.exe (fixed args)
            const [npm, npmArgs] = process.platform === "win32"
              ? ["cmd.exe", ["/d", "/s", "/c", "npm install --no-audit --no-fund"]]
              : ["npm", ["install", "--no-audit", "--no-fund"]];
            const r = await runProc(npm, npmArgs, { cwd: dir, timeoutMs, signal: ctx.signal, progress: ctx.progress });
            L.push(r.code === 0 ? "npm install: ok" : `npm install failed (exit ${r.code}${r.timedOut ? ", timed out" : ""}):\n${truncateMiddle(r.output, 2000)}`);
          }
        } else L.push("Next: npm install (or rerun with install_deps=true), then webtest action=run.");
        L.push("Browsers: webtest action=install (or npx playwright install).");
        return L.join("\n");
      }
      case "scenario": {
        try {
          const r = await runScenario({
            url: a.url, steps: a.steps ?? [], name: a.name, dir, browser: a.browser, headed: !!a.headed, viewport: a.viewport,
            video: a.video, trace: a.trace, screenshot_each_step: a.screenshot_each_step, stepTimeoutMs: a.step_timeout_ms,
            allowlist, signal: ctx.signal, progress: ctx.progress,
          });
          return { content: r.summary, meta: { ok: r.ok, outDir: r.outDir, report: r.reportPath, spec: r.specPath, video: r.videoPath, trace: r.tracePath } };
        } catch (e: any) { return `error: ${firstLine(e?.message ?? String(e))}`; }
      }
      case "run": {
        const cli = [join(dir, "node_modules", "@playwright", "test", "cli.js"), join(dir, "node_modules", "playwright", "cli.js")].find(existsSync);
        if (!cli) return `error: no local @playwright/test in ${dir}. Run webtest action=init with install_deps=true (or npm install -D @playwright/test there).`;
        const out = join(dir, "test-results", "results.json");
        const args = [cli, "test", "--reporter=list,json"];
        if (a.grep) args.push("--grep", String(a.grep));
        if (a.project) args.push("--project", String(a.project));
        if (a.headed) args.push("--headed");
        // the project's baseURL is the app under test: apply the same egress check as browser navigation
        const cfgUrl = (() => { try { return /baseURL:[^'"\n]*['"]([^'"]+)['"]/.exec(readFileSync(join(dir, "playwright.config.ts"), "utf8"))?.[1]; } catch { return undefined; } })();
        if (cfgUrl) { try { await checkEgress(cfgUrl, { allowPrivate: true, allowlist }); } catch (e: any) { return `BLOCKED: ${e.message}`; } }
        const r = await runProc(process.execPath, args, { cwd: dir, timeoutMs, signal: ctx.signal, progress: ctx.progress, env: { PLAYWRIGHT_JSON_OUTPUT_NAME: out, FORCE_COLOR: "0" } });
        let json: any = null;
        try { json = JSON.parse(readFileSync(out, "utf8")); } catch { /* fall through */ }
        if (!json) return `${r.timedOut ? `[timed out after ${timeoutMs / 1000}s]` : `exit code: ${r.code}`} — no JSON report produced\n${truncateMiddle(r.output.trim(), 4000)}`;
        const parsed = parseJsonReport(json, dir);
        return { content: `${r.timedOut ? "[timed out] " : ""}${formatReport(parsed, relative(ctx.cwd, out) || out)}\nHTML report: npx playwright show-report (in ${dir})`, meta: { ...parsed, failures: parsed.failures.length } };
      }
      case "report": {
        const json = join(dir, "test-results", "results.json");
        const md = newestScenarioReport(dir);
        const jm = existsSync(json) ? statSync(json).mtimeMs : 0, mm = md ? statSync(md).mtimeMs : 0;
        if (!jm && !mm) return `No results in ${dir} (looked for test-results/results.json and test-results/*/report.md).`;
        if (jm >= mm) {
          try { return formatReport(parseJsonReport(JSON.parse(readFileSync(json, "utf8")), dir), json) + (md ? `\nLatest scenario report: ${md}` : ""); }
          catch (e: any) { return `error: could not parse ${json}: ${e.message}`; }
        }
        return `Latest scenario report: ${md}\n\n${truncateMiddle(readFileSync(md!, "utf8"), 8000)}${jm ? `\nTest-run results: ${json}` : ""}`;
      }
      default: return `unknown action ${a.action}`;
    }
  },
};

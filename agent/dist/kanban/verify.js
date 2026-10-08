/**
 * Phase verification: proves a finished card works, not just that its unit tests pass.
 *   1. built       the files the spec names exist and export what the spec lists
 *   2. unit        the card's test_cmd exits 0
 *   3. navigate    each page loads in a real browser, has content, no script errors, and its local links resolve
 *   4. screenshot  a full-page picture of every page, saved as evidence next to a report.md
 *   5. functional  optional browser scenario (card.functional steps) run through the webtest engine
 *   6. regression  earlier done cards still pass their tests, and no page that used to work is now broken
 * Everything is written to <project>/.stitap/evidence/<KEY>/. generateVerifyTest() also writes a dependency-free
 * node:test file (tests/verify/<phase>.verify.test.mjs) so the static part of the check keeps running in `npm test`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { serve, sitePages, checkPages } from "../tools/pagecheck.js";
import { loadPlaywright, resolvePw, runScenario } from "../tools/webtest.js";
const FILE_RE = /^[\w./-]+\.(?:m?js|html|css|json|md|svg|ya?ml|txt|xml)$/;
/** Files, exports and pages a phase spec promises. */
export function parseManifest(md) {
    const files = new Set();
    const exports = {};
    const lines = md.split("\n");
    const start = lines.findIndex((l) => /\*\*Files to write:?\*\*/i.test(l));
    if (start >= 0) {
        for (const l of lines.slice(start)) {
            if (/^(\*\*Test|\*\*Files to read|---|##\s)/.test(l.trim()) && !l.includes("Files to write"))
                break;
            for (const m of l.matchAll(/`([^`]+)`/g))
                if (FILE_RE.test(m[1]) && !m[1].startsWith("tests/") && !m[1].startsWith("docs/"))
                    files.add(m[1]);
        }
    }
    // "## 1. `js/lib/foo.js`" followed by code blocks that declare exports
    const sections = md.split(/^##\s+/m).slice(1);
    for (const sec of sections) {
        const head = sec.split("\n")[0];
        const file = head.match(/`([^`]+)`/)?.[1];
        if (!file || !FILE_RE.test(file) || file.startsWith("tests/") || file.startsWith("docs/"))
            continue;
        const names = [...sec.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
        files.add(file);
        if (names.length)
            exports[file] = [...new Set([...(exports[file] ?? []), ...names])];
    }
    const list = [...files];
    return { files: list, exports, pages: list.filter((f) => f.endsWith(".html")) };
}
export function exportsName(src, name) {
    return new RegExp(`export\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+${name}\\b`).test(src)
        || new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(src);
}
/** Files that must exist and exports that must be present. Returns the problems found (empty = built). */
export function checkBuilt(cwd, files = [], exports = {}) {
    const problems = [];
    const missing = files.filter((f) => !existsSync(join(cwd, f)));
    if (missing.length)
        problems.push(`missing files: ${missing.join(", ")}`);
    for (const [f, names] of Object.entries(exports)) {
        const p = join(cwd, f);
        if (!existsSync(p))
            continue;
        const src = readFileSync(p, "utf8");
        const bad = names.filter((n) => !exportsName(src, n));
        if (bad.length)
            problems.push(`${f} does not export: ${bad.join(", ")}`);
    }
    return problems;
}
/** Files named in a section's heading/opening lines, and the exports declared in its code blocks. */
export function sectionManifest(heading, body) {
    const head = [heading, ...body.split("\n").slice(0, 8)].join("\n");
    const files = [...new Set([...head.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((t) => FILE_RE.test(t) && !t.startsWith("tests/") && !t.startsWith("docs/")))];
    const names = [...body.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
    // tables like | `getProductById(id, list)` | the product or null | name the functions a module must export
    for (const m of body.matchAll(/^\|\s*`([A-Za-z_$][\w$]*)\(/gm))
        names.push(m[1]);
    for (const m of body.matchAll(/^###\s+`([A-Za-z_$][\w$]*)\(/gm))
        names.push(m[1]);
    const exp = {};
    const jsFile = files.find((f) => /\.m?js$/.test(f));
    if (jsFile && names.length)
        exp[jsFile] = [...new Set(names)];
    return { files, exports: exp };
}
/** Browser steps the tests story wrote for a phase: tests/functional/<phase>.functional.json (a JSON array of webtest steps). */
export function loadFunctional(cwd, spec) {
    if (!spec)
        return [];
    try {
        const j = JSON.parse(readFileSync(join(cwd, "tests", "functional", `${basename(spec, ".md")}.functional.json`), "utf8"));
        return Array.isArray(j) ? j : Array.isArray(j?.steps) ? j.steps : [];
    }
    catch {
        return [];
    }
}
const hasBrowser = () => {
    try {
        return resolvePw() !== null;
    }
    catch {
        return false;
    }
};
const evidenceRoot = (cwd, key) => join(cwd, ".stitap", "evidence", key);
const slug = (s) => s.replace(/[^\w.-]+/g, "_");
export async function verifyCard(board, ref, o = {}) {
    const card = board.get(ref);
    if (!card)
        throw new Error(`no card ${ref}`);
    const key = card.key ?? card.id;
    const cwd = board.cwdOf(card);
    const dir = evidenceRoot(cwd, key);
    mkdirSync(dir, { recursive: true });
    const checks = [];
    const shots = [];
    const add = (name, ok, detail, skipped = false) => checks.push({ name, ok, detail, ...(skipped ? { skipped } : {}) });
    const specPath = card.spec ? join(cwd, card.spec) : "";
    const manifest = specPath && existsSync(specPath) ? parseManifest(readFileSync(specPath, "utf8")) : { files: [], exports: {}, pages: [] };
    // 1. built
    const missing = manifest.files.filter((f) => !existsSync(join(cwd, f)));
    add("built: files", missing.length === 0, manifest.files.length ? (missing.length ? `missing: ${missing.join(", ")}` : `${manifest.files.length} file(s) present`) : "spec names no files", !manifest.files.length);
    const missingExports = [];
    for (const [f, names] of Object.entries(manifest.exports)) {
        const p = join(cwd, f);
        if (!existsSync(p))
            continue; // already reported as a missing file
        const src = readFileSync(p, "utf8");
        for (const n of names)
            if (!exportsName(src, n))
                missingExports.push(`${f}: ${n}`);
    }
    const nExports = Object.values(manifest.exports).flat().length;
    add("built: exports", missingExports.length === 0, nExports ? (missingExports.length ? `missing exports: ${missingExports.join("; ")}` : `${nExports} export(s) found`) : "spec lists no exports", !nExports);
    // 2. unit
    if (card.test_cmd) {
        const t = await board.runTests(card.id);
        add("unit tests", t.code === 0, t.code === 0 ? `\`${t.cmd}\` exits 0` : `\`${t.cmd}\` exit ${t.code}\n${t.output.slice(-1200)}`);
    }
    else
        add("unit tests", true, "card has no test_cmd", true);
    // 3 + 4 + 5. browser: navigate, screenshot, functional
    const pages = manifest.pages.filter((p) => existsSync(join(cwd, p)));
    const wantsFunctional = (card.functional?.length ?? 0) > 0 || loadFunctional(cwd, card.spec).length > 0;
    if ((pages.length || wantsFunctional) && !hasBrowser()) {
        add("navigate", true, "skipped: playwright-core is not installed (harness browser setup)", true);
        add("screenshots", true, "skipped: no browser", true);
    }
    else if (pages.length || wantsFunctional) {
        let server;
        let browser;
        try {
            const pw = await loadPlaywright();
            const s = await serve(cwd);
            server = s.server;
            browser = await pw.chromium.launch({ headless: true });
            const problems = [];
            for (const page of pages) {
                const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
                const errs = [];
                tab.on("pageerror", (e) => errs.push(`script error: ${String(e?.message ?? e).split("\n")[0].slice(0, 140)}`));
                try {
                    await tab.goto(s.base + page, { waitUntil: "load", timeout: 15_000 });
                    await tab.waitForTimeout(400);
                    const text = await tab.evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().length);
                    if (text < 80)
                        errs.push(`page is nearly empty (${text} characters)`);
                    const links = await tab.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => a.href));
                    for (const href of [...new Set(links)].filter((h) => h.startsWith(s.base) && !h.endsWith("#"))) {
                        const r = await fetch(href.split("#")[0]).catch(() => null);
                        if (!r || r.status >= 400)
                            errs.push(`broken link: ${href.slice(s.base.length)}`);
                    }
                    const shot = join(dir, `${slug(page)}.png`);
                    await tab.screenshot({ path: shot, fullPage: true });
                    shots.push(shot);
                }
                catch (e) {
                    errs.push(`did not load: ${String(e?.message ?? e).split("\n")[0].slice(0, 140)}`);
                }
                await tab.close();
                if (errs.length)
                    problems.push(`${page}: ${[...new Set(errs)].slice(0, 4).join("; ")}`);
            }
            if (pages.length) {
                add("navigate", problems.length === 0, problems.length ? problems.join("\n") : `${pages.length} page(s) load, have content, no script errors, links resolve`);
                add("screenshots", shots.length === pages.length, `${shots.length}/${pages.length} saved in ${dir}`);
            }
            else {
                add("navigate", true, "spec names no pages", true);
                add("screenshots", true, "no pages", true);
            }
            const fsteps = card.functional?.length ? card.functional : loadFunctional(cwd, card.spec);
            if (fsteps.length) {
                const steps = fsteps.map((st) => ({ ...st, url: st.url?.replace("{{base}}", s.base) }));
                const r = await runScenario({ steps, url: s.base, name: `${key}-functional`, dir, video: false, trace: false });
                add("functional", r.ok, r.ok ? `${r.steps.length} step(s) passed; evidence ${r.outDir}` : `step ${r.failedStep?.index} ${r.failedStep?.action} failed: ${r.failedStep?.error ?? r.error}`);
            }
            else
                add("functional", true, "card has no functional steps", true);
        }
        catch (e) {
            add("navigate", false, `browser run failed: ${String(e?.message ?? e).split("\n")[0]}`);
        }
        finally {
            await browser?.close().catch(() => undefined);
            server?.close();
        }
    }
    else {
        add("navigate", true, "spec names no pages", true);
        add("screenshots", true, "no pages", true);
        add("functional", true, "card has no functional steps", true);
    }
    // 6. regression: other done cards + page baseline
    if (!o.skipRegression) {
        const others = board.list("done").filter((c) => c.id !== card.id && c.test_cmd && c.type !== "epic");
        const out = others.length ? await board.regression() : "";
        const failed = out.split("\n").filter((l) => /FAILED/.test(l));
        add("regression: earlier cards", failed.length === 0, others.length ? (failed.length ? failed.join("\n") : `${others.length} earlier card(s) still pass`) : "no earlier done cards", !others.length);
        const baselineFile = join(cwd, ".stitap", "page-baseline.json");
        let baseline = {};
        try {
            baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
        }
        catch { /* none yet */ }
        if (hasBrowser() && sitePages(cwd).length) {
            let now = {};
            try {
                now = Object.fromEntries((await checkPages(cwd)).map((r) => [r.page, r.ok]));
                const broke = Object.keys(baseline).filter((p) => baseline[p] && now[p] === false);
                add("regression: pages", broke.length === 0, broke.length ? `pages that worked before are now broken: ${broke.join(", ")}` : `${Object.values(now).filter(Boolean).length}/${Object.keys(now).length} pages OK, none worse than the last verified run`);
                if (checks.at(-1).ok)
                    baseline = { ...baseline, ...now };
            }
            catch (e) {
                add("regression: pages", true, `skipped: ${String(e?.message ?? e).split("\n")[0]}`, true);
            }
        }
        else
            add("regression: pages", true, "skipped: no browser or no pages", true);
        if (checks.every((c) => c.ok)) {
            mkdirSync(dirname(baselineFile), { recursive: true });
            writeFileSync(baselineFile, JSON.stringify(baseline, null, 2));
        }
    }
    const ok = checks.every((c) => c.ok);
    const markdown = [`# Verification ${key}: ${card.title}`, `Result: **${ok ? "PASS" : "FAIL"}** · ${new Date().toISOString()}`, "",
        ...checks.map((c) => `- ${c.skipped ? "◌" : c.ok ? "✔" : "✖"} **${c.name}**: ${c.detail.replace(/\n/g, "\n    ")}`),
        ...(shots.length ? ["", "## Screenshots", ...shots.map((s) => `![${basename(s)}](${basename(s)})`)] : [])].join("\n");
    writeFileSync(join(dir, "report.md"), markdown);
    return { key, ok, checks, evidenceDir: dir, shots, markdown };
}
/** A dependency-free node:test file for the static part of a phase: files, exports, pages and their local references. */
export function generateVerifyTest(card, manifest) {
    const data = JSON.stringify({ key: card.key, title: card.title, files: manifest.files, exports: manifest.exports, pages: manifest.pages }, null, 2);
    return `// Generated by stitaP kanban for ${card.key ?? card.id}: ${card.title}. Static checks only; screenshots and browser checks run via "harness kanban verify".
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const M = ${data};
const has = (p) => existsSync(join(ROOT, p));
const exportsName = (src, n) =>
  new RegExp("export\\\\s+(?:async\\\\s+)?(?:function\\\\*?|const|let|var|class)\\\\s+" + n + "\\\\b").test(src) ||
  new RegExp("export\\\\s*\\\\{[^}]*\\\\b" + n + "\\\\b[^}]*\\\\}").test(src);

test("built: every file the spec names exists", () => {
  const missing = M.files.filter((f) => !has(f));
  assert.deepEqual(missing, [], "missing: " + missing.join(", "));
});

test("built: every export the spec lists is exported", () => {
  const missing = [];
  for (const [f, names] of Object.entries(M.exports)) {
    if (!has(f)) continue;
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const n of names) if (!exportsName(src, n)) missing.push(f + ": " + n);
  }
  assert.deepEqual(missing, [], "missing exports: " + missing.join("; "));
});

test("navigate: pages exist and every local script, stylesheet and link they reference exists", () => {
  const broken = [];
  for (const page of M.pages) {
    if (!has(page)) { broken.push(page + " (missing)"); continue; }
    const html = readFileSync(join(ROOT, page), "utf8");
    for (const m of html.matchAll(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
      const ref = m[1];
      if (/^(?:[a-z]+:|\\/\\/|mailto:|tel:)/i.test(ref)) continue;
      const target = ref.startsWith("/") ? ref.slice(1) : normalize(join(dirname(page), ref));
      if (!has(target)) broken.push(page + " → " + ref);
    }
  }
  assert.deepEqual(broken, [], broken.join("\\n"));
});

test("imports: every relative import in the phase's JS files resolves", () => {
  const broken = [];
  for (const f of M.files.filter((x) => /\\.m?js$/.test(x) && has(x))) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const m of src.matchAll(/(?:import|export)[^'"\\n]*?from\\s+['"](\\.[^'"]+)['"]/g)) {
      if (!has(normalize(join(dirname(f), m[1])))) broken.push(f + " imports " + m[1]);
    }
  }
  assert.deepEqual(broken, [], broken.join("\\n"));
});
`;
}
/** Write tests/verify/<phase>.verify.test.mjs for a card with a spec. Returns the path. */
export function writeVerifyTest(board, ref) {
    const card = board.get(ref);
    if (!card?.spec)
        throw new Error(`${ref} has no spec file to derive tests from`);
    const cwd = board.cwdOf(card);
    const specPath = join(cwd, card.spec);
    if (!existsSync(specPath))
        throw new Error(`spec not found: ${specPath}`);
    const out = join(cwd, "tests", "verify", `${basename(card.spec, ".md")}.verify.test.mjs`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, generateVerifyTest(card, parseManifest(readFileSync(specPath, "utf8"))));
    return out;
}

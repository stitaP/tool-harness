#!/usr/bin/env node
// Executes every Tool Store tool: the scenario suites (01-…10-) exercise each
// domain with realistic inputs; afterwards every tool that no suite touched is
// called with arguments synthesised from its manifest, so a missing executor or
// a crash anywhere in the catalog fails the run.
//
//   node test/store/run-all.mjs            # all suites
//   node test/store/run-all.mjs browser ai # only matching suites
//
// Needs the store bundle (npm run build:store). Suites that need Chromium or
// ffmpeg are skipped (and reported) when those are not installed.
import { mkdtempSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "stitap-store-test-"));
process.env.STITAP_DATA_DIR = dataDir;
if (!process.env.STITAP_CHROMIUM && existsSync("/opt/pw-browsers/chromium")) process.env.STITAP_CHROMIUM = "/opt/pw-browsers/chromium";
const m = await import(pathToFileURL(join(here, "..", "..", "store", "store.mjs")).href);

const which = (c) => { try { execFileSync(process.platform === "win32" ? "where" : "which", [c], { stdio: "ignore" }); return true; } catch { return false; } };
const has = { ffmpeg: which("ffmpeg"), chromium: false, tesseract: which("tesseract") };
try { const probe = await m.executeTool("browser.navigate", { url: "data:text/html,<title>ok</title>", sessionId: "__probe" }); has.chromium = probe.success; } catch { /* no playwright */ }

const quiet = process.argv.includes("--quiet");
const filters = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const called = new Set();
let unexpected = 0, ok = 0, expectedErr = 0;
const failures = [], envGaps = [];
const ENV_GAP = /not installed|needs Playwright|no text-to-speech engine|fetch failed|not configured|Host not in allowlist|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|no clipboard|no display|could not download/i;
async function run(id, args = {}, expect = false) {
  called.add(id);
  const t0 = Date.now();
  let r;
  try { r = await m.executeTool(id, args); } catch (e) { r = { success: false, error: `THREW: ${e.message}` }; }
  // A tool that fails only because this machine lacks a binary, browser, credential or network
  // route reports it explicitly; count that as an environment gap, not a defect.
  const envGap = !r.success && expect === false && ENV_GAP.test(String(r.error ?? ""));
  if (envGap) envGaps.push(`${id}: ${String(r.error).slice(0, 120)}`);
  const bad = envGap ? false : expect === "any" ? String(r.error ?? "").startsWith("THREW") : r.success === (expect === true);
  if (bad) { unexpected++; failures.push(`${id}: ${String(JSON.stringify(r.success ? r.data : r.error)).slice(0, 300)}`); } else if (r.success) ok++; else expectedErr++;
  if (!quiet || bad) console.log(`${bad ? "BAD " : r.success ? "OK  " : "ERR~"} ${id} (${Date.now() - t0}ms) ${String(JSON.stringify(r.success ? r.data : r.error)).slice(0, 160)}`);
  return r.data;
}

// fixtures
let clip = null, ocrImage = null;
if (has.ffmpeg) {
  clip = join(dataDir, "clip.mp4");
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=640x360:d=6:r=25", "-f", "lavfi", "-i", "sine=f=440:d=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);
}
if (which("convert")) { ocrImage = join(dataDir, "ocr.png"); spawnSync("convert", ["-size", "600x120", "xc:white", "-pointsize", "40", "-fill", "black", "-annotate", "+20+75", "Invoice total 3003 rupees", ocrImage]); }

const suites = readdirSync(here).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort().filter((f) => !filters.length || filters.some((x) => f.includes(x)));
const skipped = [];
for (const f of suites) {
  const mod = await import(pathToFileURL(join(here, f)).href);
  const missing = (mod.needs ?? []).filter((n) => !has[n]);
  if (f.includes("ai") && !ocrImage) missing.push("imagemagick (OCR fixture)");
  if (missing.length) { skipped.push(`${f} (needs ${missing.join(", ")})`); continue; }
  console.log(`\n── ${f}`);
  await mod.default({ run, m, clip, ocrImage, dataDir });
}

// Coverage: call every remaining tool with synthesised arguments.
if (!filters.length) {
  const SAMPLE = { url: "https://example.com", text: "Hello world", query: "test", expression: "x^2 + 3*x", data: "[1,2,3,4,5]", values: "[1,2,3,4,5]", csv: "a,b\n1,2\n3,4", code: "print(1)", language: "python", html: "<h1>Title</h1><ol><li>Step one</li></ol>", content: "Sample content", title: "Sample", name: "sample", email: "a@example.com", message: "hello", amount: 1000, principal: 100000, rate: 8, years: 5, months: 12 };
  const synth = (p) => {
    if (SAMPLE[p.name] !== undefined) return SAMPLE[p.name];
    if (p.enum?.length) return p.enum[0];
    switch (p.type) { case "number": case "integer": return 2; case "boolean": return false; case "array": return /num|value|data|sample|point/i.test(p.name) ? [1, 2, 3, 4, 5] : ["a", "b"]; case "object": return {}; default: return /id$/i.test(p.name) ? "test-id" : /path|file/i.test(p.name) ? join(dataDir, "nope.txt") : "test"; }
  };
  const rest = m.listTools().filter((t) => !called.has(t.id) && !/^(browser|video\.record|os\.power|hardware\.|os\.tray|os\.notify|voice|sms|email\.send|payment\.(create|subscription))/.test(t.id));
  console.log(`\n── coverage: ${rest.length} tools not exercised by a suite — calling with synthesised arguments`);
  for (const t of rest) {
    const args = Object.fromEntries(t.parameters.filter((p) => p.required).map((p) => [p.name, synth(p)]));
    await run(t.id, args, "any");
  }
}
await m.closeStoreBrowsers?.();

const total = m.listTools();
const noExec = total.filter((t) => !t.executable).map((t) => t.id);
console.log(`\n${total.length} tools · ${total.length - noExec.length} with executors · exercised ${called.size}`);
console.log(`calls: ${ok} ok · ${expectedErr} expected/environment errors · ${unexpected} unexpected`);
if (envGaps.length) console.log(`environment gaps (install/configure to enable):\n  ${[...new Set(envGaps)].join("\n  ")}`);
if (skipped.length) console.log(`skipped suites: ${skipped.join("; ")}`);
if (noExec.length) console.log(`NO EXECUTOR: ${noExec.join(", ")}`);
if (failures.length) console.log(`\nfailures:\n  ${failures.join("\n  ")}`);
process.exit(unexpected || noExec.length ? 1 : 0);

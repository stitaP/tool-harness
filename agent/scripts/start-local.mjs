#!/usr/bin/env node
/**
 * Start stitaP agent locally — Windows, macOS and Linux: a llama.cpp model server plus the agent's web chat.
 *
 *   node agent/scripts/start-local.mjs <model.gguf> [--no-open]
 *
 * Ctrl-C stops both. Settings (environment variables):
 *   CTX=auto            context size; auto = the largest that fits in free GPU memory (llama.cpp --fit)
 *   FIT_MARGIN_MB=1024  GPU memory to leave free when CTX=auto
 *   KV=q8_0             context-cache precision: q8_0 | f16 | q4_0 (q4_0 doubles the context, slightly less accurate)
 *   NGL=                GPU layers when CTX is fixed (default all; 0 = CPU only)
 *   PROFILE=slm         agent tool profile: slm (fast, ~10 tools) | standard | full
 *   THREADS=4           CPU threads
 *   PORT=8081 UI_PORT=7420
 *   LLAMA_SERVER=llama-server   path to the llama.cpp server binary if it is not on PATH
 *   STITAP_ROOT=~/.stitap       where the agent keeps config, chats, memory and skills
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, platform, totalmem } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS = join(AGENT, "bin", "harness.mjs");
const isWin = platform() === "win32", isMac = platform() === "darwin";
const env = process.env;
const args = process.argv.slice(2);
const noOpen = args.includes("--no-open");
const MODEL = args.find((a) => !a.startsWith("--")) ?? env.MODEL ?? "";
const CTX = env.CTX ?? "auto", KV = env.KV ?? "q8_0", FIT_MARGIN_MB = env.FIT_MARGIN_MB ?? "1024", PROFILE = env.PROFILE ?? "slm", THREADS = env.THREADS ?? "4";
const PORT = Number(env.PORT ?? 8081), UI_PORT = Number(env.UI_PORT ?? 7420);
const LLAMA = env.LLAMA_SERVER ?? "llama-server";
const ROOT = env.STITAP_ROOT ?? join(homedir(), ".stitap");
const LOGDIR = join(ROOT, "logs");

const say = (m) => console.log(`\n=== ${new Date().toTimeString().slice(0, 8)}  ${m}`);
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };
const has = (cmd) => spawnSync(isWin ? "where" : "sh", isWin ? [cmd] : ["-c", `command -v "${cmd}"`], { stdio: "ignore" }).status === 0 || existsSync(cmd);
const portFree = (p) => new Promise((res) => { const s = createServer(); s.once("error", () => res(false)); s.listen(p, "127.0.0.1", () => s.close(() => res(true))); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const harness = (...a) => spawnSync(process.execPath, [HARNESS, ...a], { env: { ...env, STITAP_ROOT: ROOT }, stdio: ["ignore", "ignore", "inherit"] });

// ── checks ──
if (!MODEL) die("give the model file: node agent/scripts/start-local.mjs /path/to/model.gguf");
if (!existsSync(MODEL)) die(`model not found: ${MODEL}`);
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 20 || (maj === 20 && min < 3)) die(`Node.js 20.3+ is required (you have ${process.version})`);
if (!has(LLAMA)) die(`llama.cpp's llama-server was not found. ${isWin ? "Windows: winget install llama.cpp — or download a release zip from https://github.com/ggml-org/llama.cpp/releases and set LLAMA_SERVER=C:\\path\\to\\llama-server.exe" : isMac ? "macOS: brew install llama.cpp" : "Linux: see docs/install-local.md (prebuilt release, build from source, or brew)"}`);
if (!existsSync(join(AGENT, "dist", "cli", "main.js"))) die("the agent is not built yet — run in the tool-harness folder: npm install && npm run agent:build");
for (const p of [PORT, UI_PORT]) if (!(await portFree(p))) die(`port ${p} is in use — stop the other server (or set PORT / UI_PORT)`);
const modelMb = Math.round(statSync(MODEL).size / 1048576);
if (isMac) {
  const r = spawnSync("sysctl", ["-n", "iogpu.wired_limit_mb"], { encoding: "utf8" });
  const limit = Number(r.stdout?.trim()) || Math.round(totalmem() / 1048576 * 2 / 3);
  if (modelMb + 1500 > limit) console.log(`note: this model (${modelMb} MB) is close to the GPU memory limit (${limit} MB). Raise it once per boot, e.g. on a 16 GB Mac:\n  sudo sysctl iogpu.wired_limit_mb=13312`);
} else if (has("nvidia-smi")) {
  const r = spawnSync("nvidia-smi", ["--query-gpu=name,memory.total,memory.used", "--format=csv,noheader,nounits"], { encoding: "utf8" });
  if (r.status === 0) for (const l of r.stdout.trim().split("\n")) { const [n, tot, used] = l.split(",").map((x) => x.trim()); console.log(`GPU: ${n} — ${Number(tot) - Number(used)} of ${tot} MB free (model ${modelMb} MB)`); }
} else console.log("note: no NVIDIA GPU found — llama.cpp uses Vulkan/Metal if its build supports them, otherwise the CPU (much slower; prefer the 4B model).");

// a model larger than RAM cannot be locked in memory (that would freeze the machine) and runs from disk — very slowly
const ramMb = Math.round(totalmem() / 1048576);
const tooBig = modelMb > ramMb * 0.75;
if (tooBig) {
  console.log(`\nwarning: this model (${Math.round(modelMb / 1024)} GB) is larger than this machine can hold in memory (${Math.round(ramMb / 1024)} GB RAM).`);
  console.log("It will run partly from disk and be very slow (around 1 token/s or less). Memory locking is turned off for it.");
  console.log("Pick a model that fits (docs/install-local.md §1) — on a 16 GB Mac: Qwen3-Coder-30B-A3B UD-IQ2_M or Qwen3-4B Q4_0.");
  if (!env.ALLOW_BIG_MODEL) { console.log("To start it anyway, set ALLOW_BIG_MODEL=1."); process.exit(1); }
}

const ALIAS = env.ALIAS ?? basename(MODEL, ".gguf").toLowerCase();
mkdirSync(LOGDIR, { recursive: true });
let llama, ui, stopping = false;
const stop = (code = 0) => { if (stopping) return; stopping = true; say("stopping"); ui?.kill(); llama?.kill(); setTimeout(() => process.exit(code), 500); };
process.on("SIGINT", () => stop(0)); process.on("SIGTERM", () => stop(0));

// ── 1. model server ──
say(`1/3 model server: ${basename(MODEL)} (CTX=${CTX}, KV=${KV}) — log: ${join(LOGDIR, "model.log")}`);
const ctxArgs = CTX === "auto" ? [] : ["-c", CTX, "-ngl", env.NGL ?? "99"];   // --fit only adjusts what is not given
const largs = ["-m", MODEL, ...ctxArgs, "--fit", "on", "--fit-target", FIT_MARGIN_MB, "-np", "1", "-fa", "on", "-ctk", KV, "-ctv", KV,
  "-t", THREADS, ...(isWin || tooBig ? [] : ["--mlock"]), "--jinja", "--metrics", "--host", "127.0.0.1", "--port", String(PORT), "--alias", ALIAS];
const modelLog = openSync(join(LOGDIR, "model.log"), "w");
llama = isWin
  ? spawn(LLAMA, largs, { stdio: ["ignore", modelLog, modelLog] })
  // raise the locked-memory limit when allowed so --mlock can keep the weights in RAM
  : spawn("sh", ["-c", 'ulimit -l unlimited 2>/dev/null; exec "$0" "$@"', LLAMA, ...largs], { stdio: ["ignore", modelLog, modelLog] });
llama.on("exit", (code) => { if (!stopping) { console.error(`\nthe model server stopped (exit ${code}) — see ${join(LOGDIR, "model.log")}`); stop(1); } });
const base = `http://127.0.0.1:${PORT}`;
let up = false;
for (let i = 0; i < 300 && !up; i++) { try { up = (await (await fetch(`${base}/health`)).json()).status === "ok"; } catch { /* starting */ } if (!up) await sleep(1000); }
if (!up) die(`the model server did not start within 5 minutes (see ${join(LOGDIR, "model.log")})`);
const ctxReal = (await (await fetch(`${base}/props`)).json()).default_generation_settings.n_ctx;
console.log(`context: ${ctxReal} tokens`);

// ── 2. speed test ──
say("2/3 speed test");
try {
  const t = (await (await fetch(`${base}/completion`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Write a Python function that parses a CSV file into a list of dicts.", n_predict: 160, cache_prompt: false }) })).json()).timings;
  console.log(`generation ${t.predicted_per_second.toFixed(1)} tok/s · prompt ${t.prompt_per_second.toFixed(1)} tok/s`);
} catch { console.log("(speed test skipped)"); }

// ── 3. agent + web chat ──
say(`3/3 stitaP agent → http://127.0.0.1:${UI_PORT}  (data: ${ROOT})`);
harness("model", ALIAS, "--base-url", `${base}/v1`, "--provider", "openai");
harness("config", "set", "model.context_window", String(ctxReal));
harness("config", "set", "model.max_output_tokens", "0");      // 0 = auto: whatever the context has left
harness("config", "set", "model.request_timeout", "600");
harness("config", "set", "agent.tool_profile", PROFILE);
const serveLog = openSync(join(LOGDIR, "serve.log"), "w");
ui = spawn(process.execPath, [HARNESS, "serve", "--port", String(UI_PORT)], { env: { ...env, STITAP_ROOT: ROOT }, cwd: homedir(), stdio: ["ignore", serveLog, serveLog] });
const url = `http://127.0.0.1:${UI_PORT}/`;
for (let i = 0; i < 30; i++) { try { if ((await fetch(url)).ok) break; } catch { /* starting */ } await sleep(1000); }
const headless = !isWin && !isMac && !env.DISPLAY && !env.WAYLAND_DISPLAY;
if (!noOpen && !headless) spawn(isWin ? "cmd" : isMac ? "open" : "xdg-open", isWin ? ["/c", "start", "", url] : [url], { stdio: "ignore", detached: true }).unref();
console.log(`Running: ${url}${headless ? "  (server without a display: from your computer run  ssh -N -L " + UI_PORT + ":127.0.0.1:" + UI_PORT + " <user>@<this-server>  and open that URL)" : ""}`);
console.log("Leave this window open; Ctrl-C stops the agent and the model.");

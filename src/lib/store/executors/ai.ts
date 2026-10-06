/**
 * Executors for AI tools: Hugging Face Hub models (search/download/manage),
 * LLM calls and context management, Indic OCR, and documentation parsing.
 */
import {
  searchModels, getModelInfo, startDownload, listDownloadedModels, deleteDownloadedModel, setHFTokenProvider,
  QUANT_LEVELS, POPULAR_MODELS, recommendQuant, getModelsForRAM, formatBytes, type HFGGUFFile,
} from "@/lib/huggingface";
import { estimateTokens, truncateContext } from "@/lib/store/tools/llm-tools";
import { extractStepsFromHTML, detectDocumentType, parseFAQFromHTML, generateNarration } from "@/lib/store/tools/doc-tools";
import { PROMPTS, parseLLMOutput, mergeWithFallback, generateFromParsedDocs } from "@/lib/slm/llm-pipeline";
import { parseDocumentation, estimateNarrationDuration } from "@/lib/slm/doc-parser";
import { processCrawledPages } from "@/lib/slm/website-crawler";
import { INDIC_LANGUAGES, INDIC_PROFILES, detectScript, detectMixedScript, normalizeIndicText, indicLanguageByCode } from "@/lib/nlp/indic-ocr";
import { callLlm, hasLlm, llmJson } from "./hooks";
import { execs, json, num, str, bool, list, persisted, secret, nodeModule, isNode, isBrowser, dataDir, r2, type ExecMap } from "./util";

setHFTokenProvider(() => secret("HF_TOKEN", "HUGGING_FACE_HUB_TOKEN", "HUGGINGFACE_TOKEN"));

const B = () => (globalThis as any).Buffer;

// ─── Hugging Face: Node downloads into the models folder ─────────────────────

function modelsDir(): string {
  const path = nodeModule("node:path");
  return secret("STITAP_MODELS_DIR") ?? path.join(dataDir() ?? ".", "models");
}

interface DlJob { id: string; modelId: string; filename: string; path: string; total: number; done: number; status: "downloading" | "completed" | "error"; error?: string; startedAt: number }
const jobs = new Map<string, DlJob>();

async function downloadTo(url: string, dest: string, job: DlJob): Promise<void> {
  const fs = nodeModule("node:fs"), path = nodeModule("node:path");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = dest + ".part";
  const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  const tok = secret("HF_TOKEN", "HUGGING_FACE_HUB_TOKEN", "HUGGINGFACE_TOKEN");
  const res = await fetch(url, { headers: { ...(have ? { range: `bytes=${have}-` } : {}), ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, redirect: "follow" });
  if (!res.ok && res.status !== 206) throw new Error(`download failed ${res.status}${res.status === 401 || res.status === 403 ? " (gated model? set HF_TOKEN)" : ""}`);
  const resumed = res.status === 206;
  job.done = resumed ? have : 0;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len) job.total = job.done + len;
  const out = fs.createWriteStream(part, { flags: resumed ? "a" : "w" });
  const reader = (res.body as any).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(value)) await new Promise((r) => out.once("drain", r));
      job.done += value.length;
    }
  } finally { await new Promise((r) => out.end(r)); }
  fs.renameSync(part, dest);
}

function pickFile(files: HFGGUFFile[], quant: string | undefined, maxRAMGB: number | undefined): HFGGUFFile {
  if (!files.length) throw new Error("this repository has no GGUF files (llama.cpp needs GGUF — search with ggufOnly=true)");
  if (quant) {
    const q = quant.toUpperCase();
    const f = files.find((x) => x.quant.toUpperCase() === q) ?? files.find((x) => x.filename.toUpperCase().includes(q));
    if (!f) throw new Error(`no ${quant} file; available: ${files.map((x) => x.quant).join(", ")}`);
    return f;
  }
  const ram = maxRAMGB ?? (nodeModule("node:os") ? nodeModule("node:os").totalmem() / 1073741824 : 8);
  const fits = files.filter((f) => f.sizeBytes / 1073741824 * 1.2 <= ram * 0.85);
  const rank = (f: HFGGUFFile) => QUANT_LEVELS.find((q) => q.id === f.quant.toUpperCase())?.qualityScore ?? 5;
  const pool = fits.length ? fits : [...files].sort((a, b) => a.sizeBytes - b.sizeBytes).slice(0, 1);
  // Prefer Q4_K_M-class files: best quality whose size fits, ties → smaller
  return pool.sort((a, b) => rank(b) - rank(a) || a.sizeBytes - b.sizeBytes)[0];
}

function scanModels(): { modelId: string; filename: string; path: string; sizeBytes: number; size: string; complete: boolean; modified: string }[] {
  const fs = nodeModule("node:fs"), path = nodeModule("node:path");
  const root = modelsDir();
  if (!fs.existsSync(root)) return [];
  const out: any[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(gguf|bin|safetensors)(\.part)?$/i.test(e.name)) {
        const st = fs.statSync(p), rel = path.relative(root, path.dirname(p)).split(path.sep).join("/");
        out.push({ modelId: rel, filename: e.name.replace(/\.part$/, ""), path: p, sizeBytes: st.size, size: formatBytes(st.size), complete: !e.name.endsWith(".part"), modified: st.mtime.toISOString() });
      }
    }
  };
  walk(root);
  return out;
}

// ─── LLM context store ───────────────────────────────────────────────────────

type Msg = { role: string; content: string };
const contexts = persisted<Record<string, Msg[]>>("llm-contexts", () => ({}));
const msgs = (v: unknown): Msg[] => {
  const j = json<any>(v, []);
  return (Array.isArray(j) ? j : [j]).filter(Boolean).map((m: any) => (typeof m === "string" ? { role: "user", content: m } : { role: str(m.role, "user"), content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }));
};
const tokens = (m: Msg[]) => m.reduce((s, x) => s + estimateTokens(x.content) + 4, 0);

/** Extractive summary: first sentence of each turn plus lines that look like facts/decisions. */
function extractiveSummary(m: Msg[], maxTokens: number): string {
  const lines: string[] = [];
  for (const x of m) {
    const first = x.content.replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0].slice(0, 200);
    const keys = x.content.split("\n").filter((l) => /\b(decid|must|should|todo|error|fixed|result|answer|important|=)\b/i.test(l)).slice(0, 3);
    lines.push(`- ${x.role}: ${first}${keys.length ? ` | ${keys.map((k) => k.trim().slice(0, 120)).join(" | ")}` : ""}`);
  }
  let s = lines.join("\n");
  while (estimateTokens(s) > maxTokens && lines.length > 1) { lines.splice(Math.floor(lines.length / 2), 1); s = lines.join("\n"); }
  return s;
}

async function summarize(m: Msg[], maxTokens: number): Promise<{ summary: string; method: string }> {
  if (hasLlm()) {
    const r = await callLlm({ system: "Summarise this conversation for later continuation. Keep facts, decisions, open tasks, names, numbers. Be terse.", prompt: m.map((x) => `${x.role}: ${x.content}`).join("\n\n").slice(0, 120000), maxTokens: Math.max(256, maxTokens) });
    return { summary: r.text, method: "llm" };
  }
  return { summary: extractiveSummary(m, maxTokens), method: "extractive" };
}

// ─── OCR (tesseract CLI → tesseract.js) ──────────────────────────────────────

function which(cmd: string): boolean {
  const cp = nodeModule("node:child_process");
  if (!cp) return false;
  try { cp.execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" }); return true; } catch { return false; }
}

/** Image input (path, data URL, base64, http URL) → local file path. */
async function imageFile(img: string): Promise<string> {
  const fs = nodeModule("node:fs"), path = nodeModule("node:path"), os = nodeModule("node:os");
  if (!fs) throw new Error("OCR on this platform needs the agent runtime");
  if (/^https?:\/\//.test(img)) {
    const res = await fetch(img);
    if (!res.ok) throw new Error(`image download failed ${res.status}`);
    const f = path.join(os.tmpdir(), `stitap-ocr-${Date.now()}${path.extname(new URL(img).pathname) || ".png"}`);
    fs.writeFileSync(f, new Uint8Array(await res.arrayBuffer()));
    return f;
  }
  const p = img.startsWith("~") ? path.join(os.homedir(), img.slice(1)) : img;
  if (img.length < 1024 && fs.existsSync(p)) return p;
  const m = /^data:image\/(\w+);base64,(.*)$/s.exec(img);
  const data = m ? m[2] : img.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 200))) throw new Error("image must be a file path, URL, data URL or base64");
  const f = path.join(os.tmpdir(), `stitap-ocr-${Date.now()}.${m?.[1] ?? "png"}`);
  fs.writeFileSync(f, B().from(data, "base64"));
  return f;
}

let cliLangs: string[] | null = null;
function tesseractLangs(dir?: string): string[] {
  const cp = nodeModule("node:child_process");
  try { return String(cp.execFileSync("tesseract", ["--list-langs", ...(dir ? ["--tessdata-dir", dir] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).split("\n").slice(1).map((s) => s.trim()).filter(Boolean); } catch (e: any) { return String(e.stdout ?? "").split("\n").slice(1).map((s: string) => s.trim()).filter(Boolean); }
}

/** Ensure traineddata for `langs` is available to the tesseract CLI; returns a --tessdata-dir if we had to download. */
async function ensureLangs(langs: string[]): Promise<string | undefined> {
  cliLangs ??= tesseractLangs();
  const missing = langs.filter((l) => !cliLangs!.includes(l));
  if (!missing.length) return undefined;
  const fs = nodeModule("node:fs"), path = nodeModule("node:path");
  const dir = path.join(dataDir() ?? ".", "tessdata");
  fs.mkdirSync(dir, { recursive: true });
  const local = tesseractLangs(dir);
  // the CLI reads one tessdata dir: copy system models we also need
  const sysDir = /"(.+?)"/.exec(String((() => { try { return nodeModule("node:child_process").execFileSync("tesseract", ["--list-langs"], { encoding: "utf8" }); } catch (e: any) { return e.stdout ?? ""; } })()))?.[1];
  for (const l of langs) {
    if (local.includes(l)) continue;
    const sys = sysDir && path.join(sysDir, `${l}.traineddata`);
    if (sys && fs.existsSync(sys)) { fs.copyFileSync(sys, path.join(dir, `${l}.traineddata`)); continue; }
    const base = secret("TESSDATA_URL") ?? "https://github.com/tesseract-ocr/tessdata_fast/raw/main";
    const res = await fetch(`${base}/${l}.traineddata`, { redirect: "follow" });
    if (!res.ok) throw new Error(`could not download ${l}.traineddata (${res.status}); install the tesseract-ocr-${l} language pack or set TESSDATA_URL`);
    fs.writeFileSync(path.join(dir, `${l}.traineddata`), new Uint8Array(await res.arrayBuffer()));
  }
  return dir;
}

interface OcrOut { text: string; confidence: number; blocks: { text: string; confidence: number; bounds: { x: number; y: number; width: number; height: number } }[]; engine: string }

async function ocr(file: string, langs: string[]): Promise<OcrOut> {
  if (which("tesseract")) {
    const dir = await ensureLangs(langs);
    const cp = nodeModule("node:child_process");
    const r = cp.spawnSync("tesseract", [file, "stdout", "-l", langs.join("+"), ...(dir ? ["--tessdata-dir", dir] : []), "--psm", "3", "-c", "tessedit_create_tsv=1"], { encoding: "utf8", maxBuffer: 64 << 20 });
    if (r.status !== 0) throw new Error(`tesseract: ${String(r.stderr).trim().split("\n").pop()}`);
    const rows = String(r.stdout).trim().split("\n").slice(1).map((l) => l.split("\t")).filter((c) => c.length >= 12 && c[11].trim());
    const lines = new Map<string, { words: string[]; confs: number[]; x0: number; y0: number; x1: number; y1: number }>();
    for (const c of rows) {
      const key = `${c[2]}-${c[3]}-${c[4]}`, x = +c[6], y = +c[7], w = +c[8], h = +c[9];
      const L = lines.get(key) ?? { words: [], confs: [], x0: x, y0: y, x1: x + w, y1: y + h };
      L.words.push(c[11]); L.confs.push(+c[10]); L.x0 = Math.min(L.x0, x); L.y0 = Math.min(L.y0, y); L.x1 = Math.max(L.x1, x + w); L.y1 = Math.max(L.y1, y + h);
      lines.set(key, L);
    }
    const blocks = [...lines.values()].map((L) => ({ text: L.words.join(" "), confidence: r2(L.confs.reduce((a, b) => a + b, 0) / L.confs.length / 100), bounds: { x: L.x0, y: L.y0, width: L.x1 - L.x0, height: L.y1 - L.y0 } }));
    const all = rows.map((c) => +c[10]).filter((x) => x >= 0);
    return { text: blocks.map((b) => b.text).join("\n"), confidence: all.length ? r2(all.reduce((a, b) => a + b, 0) / all.length / 100) : 0, blocks, engine: "tesseract-cli" };
  }
  let T: any;
  try { T = await import(/* @vite-ignore */ "tesseract.js" as string); } catch { throw new Error("no OCR engine: install the `tesseract` CLI (with Indic language packs) or the tesseract.js package"); }
  const worker = await (T.createWorker ?? T.default.createWorker)(langs.join("+"));
  try {
    const { data } = await worker.recognize(file);
    return { text: data.text.trim(), confidence: r2(data.confidence / 100), blocks: (data.lines ?? []).map((l: any) => ({ text: l.text.trim(), confidence: r2(l.confidence / 100), bounds: { x: l.bbox.x0, y: l.bbox.y0, width: l.bbox.x1 - l.bbox.x0, height: l.bbox.y1 - l.bbox.y0 } })), engine: "tesseract.js" };
  } finally { await worker.terminate(); }
}

const SCRIPT_TO_LANG: Record<string, string> = { devanagari: "hin", bengali: "ben", tamil: "tam", telugu: "tel", kannada: "kan", malayalam: "mal", gujarati: "guj", gurmukhi: "pan", oriya: "ori", odia: "ori", latin: "eng" };

/** Script detection from pixels: tesseract OSD, else OCR with all candidate scripts and count codepoints. */
async function detectImageScript(file: string): Promise<{ script: string; language: string; confidence: number; method: string }> {
  if (which("tesseract")) {
    const cp = nodeModule("node:child_process");
    const r = cp.spawnSync("tesseract", [file, "stdout", "--psm", "0"], { encoding: "utf8" });
    const script = /Script:\s*(\w+)/.exec(String(r.stdout))?.[1];
    const conf = Number(/Script confidence:\s*([\d.]+)/.exec(String(r.stdout))?.[1] ?? 0);
    if (r.status === 0 && script) { const lang = SCRIPT_TO_LANG[script.toLowerCase()] ?? "eng"; return { script, language: lang, confidence: r2(Math.min(1, conf / 10)), method: "tesseract-osd" }; }
  }
  const o = await ocr(file, ["hin", "tel", "tam", "eng"]);
  const lang = detectScript(o.text);
  return { script: indicLanguageByCode(lang)?.script ?? "Latin", language: lang, confidence: o.confidence, method: "ocr-codepoints" };
}

async function recognize(img: string, language: string, profile?: string, extra: string[] = []) {
  if (isBrowser()) throw new Error("use the in-app OCR panel in the browser; store OCR runs in the agent runtime");
  const file = await imageFile(img);
  let langs: string[], mode: "auto" | "explicit" | "profile", detected;
  if (profile && INDIC_PROFILES[profile]) { langs = INDIC_PROFILES[profile].languages; mode = "profile"; }
  else if (language && language !== "auto") { langs = [language]; mode = "explicit"; }
  else { detected = await detectImageScript(file); langs = [detected.language]; mode = "auto"; }
  langs = [...new Set([...langs, ...extra, "eng"])].slice(0, 4);
  const o = await ocr(file, langs);
  const lang = detectScript(o.text), family = indicLanguageByCode(lang)?.scriptFamily ?? "latin";
  const text = normalizeIndicText(o.text, family);
  const warnings = [...(o.confidence < 0.6 ? [`low confidence (${o.confidence})`] : []), ...(detectMixedScript(text).isMixed ? [`mixed scripts: ${detectMixedScript(text).scripts.join(", ")}`] : [])];
  return { text, language: lang, languagesUsed: langs, script: indicLanguageByCode(lang)?.script ?? "Latin", confidence: o.confidence, blocks: o.blocks, detectionMode: mode, detected, engine: o.engine, warnings };
}

// ─── docs helpers ────────────────────────────────────────────────────────────

const strip = (h: string) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** Plain text / markdown → minimal HTML so the HTML parsers can work on it. */
function asHtml(content: string): string {
  if (/<\w+[^>]*>/.test(content)) return content;
  return content.split(/\n{2,}/).map((b) => {
    if (/^#{1,6}\s/.test(b)) { const n = /^#+/.exec(b)![0].length; return `<h${n}>${b.replace(/^#+\s*/, "")}</h${n}>`; }
    if (/^\s*(\d+[.)]|[-*])\s/m.test(b)) { const ordered = /^\s*\d/.test(b); return `<${ordered ? "ol" : "ul"}>${b.split("\n").filter((l) => l.trim()).map((l) => `<li>${l.replace(/^\s*(\d+[.)]|[-*])\s*/, "")}</li>`).join("")}</${ordered ? "ol" : "ul"}>`; }
    if (/^```/.test(b)) return `<pre><code>${b.replace(/^```\w*\n?|```$/g, "")}</code></pre>`;
    return `<p>${b}</p>`;
  }).join("\n");
}

function extractApi(html: string, includeExamples: boolean) {
  const openapi = /<script[^>]*type=["']application\/(?:json|openapi\+json)["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (openapi) { try { const spec = JSON.parse(openapi); if (spec.openapi || spec.swagger) return { source: "embedded-openapi", spec }; } catch { /* not a spec */ } }
  const endpoints: { method: string; path: string; summary: string; parameters: { name: string; type: string; required: boolean; description: string; in: string }[]; examples: string[] }[] = [];
  const sections = html.split(/(?=<h[1-4][^>]*>)/i);
  for (const sec of sections) {
    const head = strip(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(sec)?.[1] ?? "");
    const m = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[\w\/{}:.\-]*)/.exec(strip(sec));
    if (!m) continue;
    const params: any[] = [];
    for (const t of sec.matchAll(/<table[\s\S]*?<\/table>/gi)) {
      const rows = [...t[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1])));
      const hdr = (rows[0] ?? []).map((h) => h.toLowerCase());
      const col = (re: RegExp) => hdr.findIndex((h) => re.test(h));
      const [ni, ti, ri, di] = [col(/name|param|field/), col(/type/), col(/required/), col(/desc/)];
      for (const r of rows.slice(1)) if (r[ni >= 0 ? ni : 0]) params.push({ name: r[ni >= 0 ? ni : 0], type: ti >= 0 ? r[ti] : "string", required: ri >= 0 ? /yes|true|required/i.test(r[ri]) : /required/i.test(r.join(" ")), description: di >= 0 ? r[di] : r.slice(1).join(" "), in: m[2].includes(`{${r[ni >= 0 ? ni : 0]}}`) ? "path" : m[1] === "GET" ? "query" : "body" });
    }
    for (const pm of m[2].matchAll(/\{(\w+)\}/g)) if (!params.some((p) => p.name === pm[1])) params.push({ name: pm[1], type: "string", required: true, description: "", in: "path" });
    const examples = includeExamples ? [...sec.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map((x) => strip(x[1])).slice(0, 3) : [];
    endpoints.push({ method: m[1], path: m[2], summary: head || strip(sec).slice(0, 120), parameters: params, examples });
  }
  return { source: "html", endpoints };
}

function toOpenApi(title: string, endpoints: ReturnType<typeof extractApi>["endpoints"] & any[]) {
  const paths: Record<string, any> = {};
  for (const e of endpoints) {
    const body = e.parameters.filter((p: any) => p.in === "body");
    paths[e.path] ??= {};
    paths[e.path][e.method.toLowerCase()] = {
      summary: e.summary,
      parameters: e.parameters.filter((p: any) => p.in !== "body").map((p: any) => ({ name: p.name, in: p.in, required: p.in === "path" || p.required, description: p.description, schema: { type: /int|number/i.test(p.type) ? "number" : /bool/i.test(p.type) ? "boolean" : "string" } })),
      ...(body.length ? { requestBody: { content: { "application/json": { schema: { type: "object", required: body.filter((p: any) => p.required).map((p: any) => p.name), properties: Object.fromEntries(body.map((p: any) => [p.name, { type: /int|number/i.test(p.type) ? "number" : /bool/i.test(p.type) ? "boolean" : /array|\[\]/i.test(p.type) ? "array" : "string", description: p.description }])) } } } } } : {}),
      ...(e.examples.length ? { "x-examples": e.examples } : {}),
      responses: { "200": { description: "OK" } },
    };
  }
  return { openapi: "3.0.3", info: { title, version: "1.0.0" }, paths };
}

/** Build a tutorial script from steps (rule-based narration, optionally polished by the model). */
function scriptFromSteps(title: string, steps: string[], style: string, level: string, intros: boolean) {
  const scenes: { type: string; narration: string; duration: number; transition: string }[] = [];
  if (intros) scenes.push({ type: "title", narration: `${title}. In this ${level} tutorial you'll learn it in ${steps.length} steps.`, duration: 4, transition: "fade" });
  steps.forEach((s, k) => { const n = generateNarration(s, `Step ${k + 1} of ${steps.length}`, style, level); scenes.push({ type: "step", narration: n, duration: Math.max(3, Math.round(estimateNarrationDuration(n))), transition: k ? "cut" : "fade" }); });
  if (intros) scenes.push({ type: "end", narration: `That's it — you've completed ${title}.`, duration: 3, transition: "fade" });
  return scenes;
}

// ─── executors ───────────────────────────────────────────────────────────────

export const AI_EXECUTORS: ExecMap = execs({
  // Hugging Face
  "huggingface.search": async (i) => {
    const r = await searchModels({ query: str(i.query), ggufOnly: i.ggufOnly === undefined ? true : bool(i.ggufOnly), maxRAMGB: i.maxRAMGB ? num(i.maxRAMGB) : undefined, limit: num(i.limit, 10) });
    return { total: r.total, models: r.models.map((m) => ({ id: m.id, author: m.author, downloads: m.downloads, likes: m.likes, params: m.params, quantLevels: m.quantLevels, estimatedRAMGB: m.estimatedRAMGB, pipelineTag: m.pipelineTag, gated: m._gated, lastModified: m.lastModified })) };
  },
  "huggingface.download": async (i) => {
    const modelId = str(i.modelId);
    const info = await getModelInfo(modelId);
    const file = i.filename ? info.ggufFiles.find((f) => f.filename === str(i.filename)) ?? (() => { throw new Error(`file ${str(i.filename)} not in ${modelId}`); })() : pickFile(info.ggufFiles, i.quant ? str(i.quant) : undefined, i.maxRAMGB ? num(i.maxRAMGB) : undefined);
    if (!isNode()) { const job = await startDownload(modelId, file); return { jobId: job.id, status: job.status, file: file.filename, size: file.sizeHuman, storage: "browser (IndexedDB)" }; }
    const path = nodeModule("node:path"), fs = nodeModule("node:fs");
    const dest = path.join(modelsDir(), ...modelId.split("/"), file.filename);
    if (fs.existsSync(dest)) return { status: "completed", path: dest, file: file.filename, quant: file.quant, size: file.sizeHuman, alreadyPresent: true };
    const job: DlJob = { id: `dl-${Date.now().toString(36)}`, modelId, filename: file.filename, path: dest, total: file.sizeBytes, done: 0, status: "downloading", startedAt: Date.now() };
    jobs.set(job.id, job);
    const p = downloadTo(file.downloadUrl, dest, job).then(() => { job.status = "completed"; }, (e) => { job.status = "error"; job.error = e.message; });
    const wait = i.wait === undefined ? file.sizeBytes < 200 * 1048576 : bool(i.wait);
    if (wait) { await p; if (job.status === "error") throw new Error(job.error); return { status: "completed", path: dest, file: file.filename, quant: file.quant, size: formatBytes(job.done) }; }
    return { status: "downloading", jobId: job.id, path: dest, file: file.filename, quant: file.quant, size: file.sizeHuman, note: "large file downloads in the background (resumable); check progress with huggingface.list_downloaded" };
  },
  "huggingface.list_downloaded": async () => {
    if (!isNode()) return { models: await listDownloadedModels() };
    const active = [...jobs.values()].map((j) => ({ jobId: j.id, modelId: j.modelId, filename: j.filename, status: j.status, percent: j.total ? r2((j.done / j.total) * 100, 1) : undefined, downloaded: formatBytes(j.done), speedMBps: r2(j.done / 1048576 / Math.max(1, (Date.now() - j.startedAt) / 1000), 1), error: j.error }));
    return { folder: modelsDir(), models: scanModels(), downloads: active };
  },
  "huggingface.delete": async (i) => {
    const modelId = str(i.modelId), filename = str(i.filename);
    if (!isNode()) { await deleteDownloadedModel(modelId, filename); return { deleted: true }; }
    const fs = nodeModule("node:fs"), path = nodeModule("node:path");
    const root = path.resolve(modelsDir()), f = path.resolve(root, ...modelId.split("/"), filename);
    if (!f.startsWith(root + path.sep)) throw new Error("path escapes the models folder");
    let freed = 0;
    for (const p of [f, f + ".part"]) if (fs.existsSync(p)) { freed += fs.statSync(p).size; fs.unlinkSync(p); }
    if (!freed) throw new Error(`${modelId}/${filename} is not downloaded`);
    return { deleted: true, freed: formatBytes(freed) };
  },
  "huggingface.quant_info": (i) => {
    if (!i.quant) return { quants: QUANT_LEVELS };
    const q = str(i.quant).toUpperCase().replace(/^.*?(I?Q\d[\w_]*|F16|F32|BF16).*$/i, "$1").toUpperCase();
    const hit = QUANT_LEVELS.find((x) => x.id.toUpperCase() === q);
    if (!hit) throw new Error(`unknown quant "${str(i.quant)}" (${QUANT_LEVELS.map((x) => x.id).join(", ")})`);
    return { ...hit, gbPer1BParams: r2(hit.bitsPerWeight / 8, 2), example7B: `${r2(7 * hit.bitsPerWeight / 8 * 1.1, 1)} GB file, ~${r2(7 * hit.bitsPerWeight / 8 * 1.1 + 1, 1)} GB RAM` };
  },
  "huggingface.recommend": (i) => {
    const ram = num(i.ramGB), cat = i.category ? str(i.category).toLowerCase() : "";
    const list_ = getModelsForRAM(ram).filter((m) => !cat || m.category === cat);
    return { ramGB: ram, count: list_.length, models: list_.map((m) => { const q = recommendQuant(ram, m.params); return { id: m.id, name: m.name, params: m.params, category: m.category, minRAMGB: m.minRAMGB, recommendedQuant: q.id, quality: q.qualityScore, description: m.description }; }).sort((a, b) => parseFloat(b.params) * (/B/i.test(b.params) ? 1000 : 1) - parseFloat(a.params) * (/B/i.test(a.params) ? 1000 : 1)), categories: [...new Set(POPULAR_MODELS.map((m) => m.category))] };
  },

  // LLM
  "llm.call": async (i) => {
    const messages = msgs(i.messages) as any;
    const provider = str(i.provider).toLowerCase(), model = str(i.model);
    const endpoint = i.endpoint ? str(i.endpoint) : provider === "ollama" ? (secret("OLLAMA_HOST") ?? "http://127.0.0.1:11434") + "/v1" : provider === "lmstudio" ? "http://127.0.0.1:1234/v1" : provider === "llamacpp" || provider === "llama.cpp" ? "http://127.0.0.1:8080/v1" : provider === "groq" ? "https://api.groq.com/openai/v1" : provider === "together" ? "https://api.together.xyz/v1" : provider === "deepseek" ? "https://api.deepseek.com/v1" : provider === "mistral" ? "https://api.mistral.ai/v1" : "";
    const t0 = Date.now();
    if (endpoint) {
      const key = secret(`${provider.toUpperCase().replace(/\W/g, "_")}_API_KEY`, "LLM_API_KEY");
      const url = /\/chat\/completions$/.test(endpoint) ? endpoint : `${endpoint.replace(/\/+$/, "")}/chat/completions`;
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), num(i.timeout, 120000));
      try {
        const res = await fetch(url, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model, messages, max_tokens: i.maxTokens ? num(i.maxTokens) : undefined, temperature: i.temperature !== undefined ? num(i.temperature) : undefined, stream: false }) });
        const body = await res.text();
        if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}: ${body.slice(0, 300)}`);
        const j = JSON.parse(body);
        return { content: j.choices?.[0]?.message?.content ?? "", model: j.model ?? model, provider, usage: j.usage, latencyMs: Date.now() - t0 };
      } finally { clearTimeout(to); }
    }
    const r = await callLlm({ messages, model: model && provider !== "default" && provider !== "agent" ? model : undefined, maxTokens: i.maxTokens ? num(i.maxTokens) : undefined, temperature: i.temperature !== undefined ? num(i.temperature) : undefined });
    return { content: r.text, model: r.model, provider: r.provider ?? "agent", usage: r.usage, latencyMs: Date.now() - t0 };
  },
  "llm.manageContext": async (i) => {
    const id = str(i.contextId, "default"), action = str(i.action, "export"), all = contexts.get();
    const cur = (all[id] ??= []);
    const max = num(i.maxTokens, 4000);
    if (action === "add") { cur.push(...msgs(i.messages)); contexts.save(); return { contextId: id, messages: cur.length, tokens: tokens(cur) }; }
    if (action === "clear") { all[id] = []; contexts.save(); return { contextId: id, cleared: true }; }
    const source = i.messages ? msgs(i.messages) : cur;
    if (action === "summarize") { const s = await summarize(source, Math.min(max, 1500)); return { contextId: id, ...s, originalTokens: tokens(source), summaryTokens: estimateTokens(s.summary) }; }
    if (action === "trim") {
      const strategy = str(i.strategy, "sliding");
      let out: Msg[];
      if (strategy === "summary" && tokens(source) > max) {
        const sys = source.filter((m) => m.role === "system"), rest = source.filter((m) => m.role !== "system");
        const keep = truncateContext(rest, Math.floor(max * 0.6), "sliding");
        const older = rest.slice(0, rest.length - keep.length);
        const s = older.length ? await summarize(older, Math.floor(max * 0.3)) : null;
        out = [...sys, ...(s ? [{ role: "system", content: `Summary of earlier conversation (${s.method}):\n${s.summary}` }] : []), ...keep];
      } else out = truncateContext(source, max, strategy === "recent" ? "sliding" : strategy);
      if (!i.messages) { all[id] = out; contexts.save(); }
      return { contextId: id, strategy, before: { messages: source.length, tokens: tokens(source) }, after: { messages: out.length, tokens: tokens(out) }, messages: out };
    }
    return { contextId: id, messages: cur, count: cur.length, tokens: tokens(cur) };
  },
  "llm.generateScript": async (i) => {
    const title = str(i.title), html = asHtml(str(i.content));
    const pages = processCrawledPages([{ url: "inline://content", html, order: 0 }], { baseUrl: "inline://", helpSection: { url: "inline://content", maxPages: 1 } } as any);
    const parsed = parseDocumentation(pages, { tutorialTitle: title, audienceLevel: str(i.audienceLevel, "intermediate") as any, voiceStyle: (str(i.style) === "detailed" ? "detailed" : str(i.style) === "casual" ? "conversational" : "concise") });
    const fallback = generateFromParsedDocs(parsed);
    if (!hasLlm() && !i.provider) return { script: fallback, generator: "rule-based", note: "no model configured — rule-based script from the document structure" };
    const p = PROMPTS.generateScript;
    const r = await (i.provider && i.model ? AI_EXECUTORS["llm.call"]({ provider: i.provider, model: i.model, messages: [{ role: "system", content: p.system }, { role: "user", content: p.user(strip(html).slice(0, 30000), { audience: str(i.audienceLevel, "intermediate"), style: str(i.style, "concise") }) }] }).then((o) => { if (!o.success) throw new Error(o.error); return { text: (o.data as any).content }; }) : callLlm({ system: p.system, prompt: p.user(strip(html).slice(0, 30000), { audience: str(i.audienceLevel, "intermediate"), style: str(i.style, "concise") }), json: true, maxTokens: p.maxTokens ?? 4000 }));
    const merged = mergeWithFallback(parseLLMOutput(r.text), fallback);
    if (i.maxScenes && merged.scenes.length > num(i.maxScenes)) merged.scenes = merged.scenes.slice(0, num(i.maxScenes));
    return { script: merged, generator: "llm" };
  },

  // OCR
  "ocr.indic.detect": async (i) => {
    const file = await imageFile(str(i.image));
    const d = await detectImageScript(file);
    const lang = indicLanguageByCode(d.language);
    return { ...d, languageName: lang?.name, scriptFamily: lang?.scriptFamily, suggestedProfile: Object.entries(INDIC_PROFILES).find(([, p]) => p.languages[0] === d.language)?.[0] };
  },
  "ocr.indic.recognize": (i) => recognize(str(i.image), str(i.language, "auto"), i.profile ? str(i.profile) : undefined, list(i.additionalLanguages)),
  "ocr.indic.batch": async (i) => {
    const images = list(i.images), results: any[] = [];
    for (const [k, img] of images.entries()) { try { results.push({ index: k, ...(await recognize(img, str(i.language, "auto"))) }); } catch (e: any) { results.push({ index: k, error: e.message }); } }
    const okR = results.filter((r) => !r.error);
    return { total: images.length, succeeded: okR.length, failed: results.length - okR.length, averageConfidence: okR.length ? r2(okR.reduce((s, r) => s + r.confidence, 0) / okR.length) : 0, results };
  },
  "ocr.indic.postprocess": (i) => {
    const text = str(i.text);
    let fam = str(i.scriptFamily, "auto");
    if (fam === "auto") fam = indicLanguageByCode(detectScript(text))?.scriptFamily ?? "latin";
    const out = normalizeIndicText(text, fam);
    return { text: out, scriptFamily: fam, changed: out !== text, mixed: detectMixedScript(out), languages: INDIC_LANGUAGES.filter((l) => l.scriptFamily === fam).map((l) => l.code) };
  },

  // docs
  "doc.extractSteps": (i) => {
    const html = asHtml(str(i.html));
    const steps = extractStepsFromHTML(html, num(i.maxSteps, 50));
    return { count: steps.length, steps: steps.map((s: any) => ({ ...s, ...(bool(i.includeCodeBlocks, true) ? {} : { code: undefined, codeBlocks: undefined }), ...(bool(i.includeImages, true) ? {} : { images: undefined }) })) };
  },
  "doc.detectTutorial": (i) => detectDocumentType(asHtml(str(i.html)), i.url ? str(i.url) : undefined, i.title ? str(i.title) : undefined),
  "doc.parseFAQ": (i) => {
    const pairs = parseFAQFromHTML(asHtml(str(i.html)), num(i.maxPairs, 100));
    return { count: pairs.length, pairs: bool(i.includeMetadata) ? pairs : pairs.map((p) => ({ question: p.question, answer: p.answer })) };
  },
  "doc.generateScript": async (i) => {
    const raw = json<any[]>(i.steps, []);
    const steps = (Array.isArray(raw) ? raw : list(i.steps)).map((s: any) => (typeof s === "string" ? s : str(s.content ?? s.title ?? s.text)));
    const title = str(i.title, "Tutorial"), style = str(i.narrationStyle, "concise"), level = str(i.audienceLevel, "beginner");
    let scenes = scriptFromSteps(title, steps, style, level, i.includeIntros === undefined ? true : bool(i.includeIntros));
    let generator = "rule-based";
    if (hasLlm() && bool(i.polish, true)) {
      try {
        const r = await callLlm({ system: `Rewrite tutorial narration for text-to-speech: ${style} style, ${level} audience, sentences under 20 words. Keep the same number of scenes and their order. Reply as JSON {"narrations": [..]}.`, prompt: JSON.stringify(scenes.map((s) => s.narration)), json: true });
        const n = llmJson<{ narrations: string[] }>(r.text).narrations;
        if (Array.isArray(n) && n.length === scenes.length) { scenes = scenes.map((s, k) => ({ ...s, narration: n[k], duration: Math.max(3, Math.round(estimateNarrationDuration(n[k]))) })); generator = "llm-polished"; }
      } catch { /* keep rule-based narration */ }
    }
    let total = scenes.reduce((a, s) => a + s.duration, 0);
    if (i.estimatedDuration && total) { const k = num(i.estimatedDuration) / total; scenes = scenes.map((s) => ({ ...s, duration: Math.max(2, Math.round(s.duration * k)) })); total = scenes.reduce((a, s) => a + s.duration, 0); }
    return { title, scenes, totalDuration: total, generator, narration: scenes.map((s) => s.narration).join("\n\n") };
  },
  "doc.extractAPI": (i) => {
    const html = asHtml(str(i.html)), fmt = str(i.format, "auto"), ex = i.includeExamples === undefined ? true : bool(i.includeExamples);
    const r = extractApi(html, ex);
    const title = strip(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "API");
    if ("spec" in r) return { format: "openapi", source: r.source, spec: r.spec };
    if (!r.endpoints.length) throw new Error("no endpoints found (looked for 'METHOD /path' patterns and embedded OpenAPI JSON)");
    if (fmt === "openapi" || fmt === "auto") return { format: "openapi", endpoints: r.endpoints.length, spec: toOpenApi(title, r.endpoints as any), ...(fmt === "auto" ? { raw: r.endpoints } : {}) };
    if (fmt === "markdown") return { format: "markdown", endpoints: r.endpoints.length, markdown: r.endpoints.map((e) => [`### ${e.method} ${e.path}`, e.summary, e.parameters.length ? ["| name | in | type | required | description |", "|---|---|---|---|---|", ...e.parameters.map((p) => `| ${p.name} | ${p.in} | ${p.type} | ${p.required ? "yes" : "no"} | ${p.description} |`)].join("\n") : "", ...e.examples.map((x) => "```\n" + x + "\n```")].filter(Boolean).join("\n\n")).join("\n\n") };
    return { format: "custom", endpoints: r.endpoints };
  },
});

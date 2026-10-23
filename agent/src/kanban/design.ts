/**
 * Design document → researched, reviewable kanban board.
 *   1. read      any design: Markdown, text, HTML, PDF (pdftotext), Word/RTF/ODT/Pages (textutil or pandoc), a web page, or a folder of them
 *   2. outline   read it section by section (sized to the model's context) and note goals, parts, requirements, technologies, unknowns
 *   3. research  turn the technologies and unknowns into questions, search the web for each (configured provider, then DuckDuckGo lite,
 *                then Wikipedia), read the best pages (official documentation first, plus the sources the design itself cites) and keep
 *                short findings with their source URLs
 *   4. plan      split the work into epics, then each epic into small stories in the story-card shape: context, steps, files,
 *                acceptance criteria, test cases, a check command, references; a final review pass lists what the plan missed
 *   5. board     a NEW board, every ticket in "backlog" (a draft): nothing runs until a person reviews it and approves the board
 *                (or single tickets). Approving moves the tickets to "ready", makes the board active and, if asked, starts workers.
 * Everything the run produced is kept in <project>/.stitap/design/<slug>/: source.md (the spec the tickets point at), outline.json,
 * research.md, plan.json and report.md.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import type { Runtime } from "../runtime/runtime.js";
import type { ChatRequest } from "../providers/types.js";
import { searchWebResilient, extractUrl, type Hit } from "../tools/web.js";
import { isOfficialDoc } from "../tools/docs.js";
import { htmlToText, htmlTitle } from "../util/html.js";
import { repairJson } from "../util/jsonrepair.js";
import { expandHome } from "../safety/paths.js";
import { errMsg, shortId } from "../util/misc.js";
import type { Card } from "./board.js";

// ── types ─────────────────────────────────────────────────────────
export interface DesignSource { title: string; markdown: string; origin: string; files: string[] }
export interface Chunk { index: number; heading: string; text: string }
export interface ChunkNotes { index: number; heading: string; summary: string; goals: string[]; components: { name: string; purpose: string }[]; requirements: string[]; constraints: string[]; technologies: string[]; unknowns: string[] }
export interface EpicPlan { id: string; title: string; goal: string; sections: number[] }
export interface Overview { title: string; summary: string; stack: string[]; test_strategy: string; epics: EpicPlan[] }
export interface Question { q: string; why: string; query: string }
export interface Finding { question: string; query: string; answer: string; facts: string[]; sources: { title: string; url: string }[]; searchedWith: string; failed?: string }
export interface StoryPlan { id: string; epic: string; title: string; what: string; why: string; depends_on: string[]; files: string[]; steps: string[]; acceptance: string[]; test_cases: string[]; check_cmd: string; references: string[]; undo: string; size: string }
export interface DesignProgress { stage: "read" | "outline" | "research" | "plan" | "review" | "board" | "done" | "error"; message: string; done?: number; total?: number; at: number }
export interface DesignResult { board: { id: string; name: string }; epics: number; stories: number; findings: number; dir: string; report: string; gaps: string[]; keys: string[] }

/** What the pipeline needs from the outside world; tests pass fakes. */
export interface DesignDeps {
  chat: (req: ChatRequest) => Promise<{ content: string }>;
  search: (q: string) => Promise<{ hits: Hit[]; source: string; errors: string[] }>;
  extract: (url: string, maxChars: number) => Promise<string>;
  contextWindow: number;
}
export interface DesignOptions {
  source: string;
  project: string;
  board?: string;
  keyPrefix?: string;
  research?: boolean;
  maxSearches?: number;
  storiesPerEpic?: number;
  signal?: AbortSignal;
  onProgress?: (p: DesignProgress) => void;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "design";
const strs = (v: any, max = 40): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x).filter((y) => typeof y === "string").join(": ") : String(x ?? ""))).map((x) => x.trim()).filter(Boolean).slice(0, max);
const uniq = (xs: string[]) => { const seen = new Set<string>(); return xs.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); };
const has = (cmd: string) => { try { execFileSync("/bin/sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }); return true; } catch { return false; } };

// ── 1. read ───────────────────────────────────────────────────────
const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".rst", ".adoc", ".org", ".text"]);
const HTML_EXT = new Set([".html", ".htm", ".xhtml"]);
const OFFICE_EXT = new Set([".docx", ".doc", ".rtf", ".odt", ".pages", ".wordml", ".webarchive"]);
const DATA_EXT = new Set([".json", ".yaml", ".yml", ".toml", ".xml", ".csv"]);
const READABLE = (f: string) => { const e = extname(f).toLowerCase(); return TEXT_EXT.has(e) || HTML_EXT.has(e) || OFFICE_EXT.has(e) || DATA_EXT.has(e) || e === ".pdf"; };

/** One file as Markdown-ish text. Throws with a plain fix when the format needs a tool that is missing. */
export function fileToText(path: string): string {
  const e = extname(path).toLowerCase();
  if (TEXT_EXT.has(e)) return readFileSync(path, "utf8");
  if (HTML_EXT.has(e)) { const h = readFileSync(path, "utf8"); const t = htmlTitle(h); return `${t ? `# ${t}\n\n` : ""}${htmlToText(h)}`; }
  if (DATA_EXT.has(e)) return `# ${basename(path)}\n\n\`\`\`${e.slice(1)}\n${readFileSync(path, "utf8")}\n\`\`\``;
  if (e === ".pdf") {
    if (!has("pdftotext")) throw new Error(`cannot read ${basename(path)}: PDF needs pdftotext (install it with: brew install poppler), or export the PDF as text/Markdown first`);
    return execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", path, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  }
  if (OFFICE_EXT.has(e)) {
    if (has("pandoc") && e !== ".pages") return execFileSync("pandoc", [path, "-t", "gfm", "--wrap=none"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (has("textutil")) return execFileSync("textutil", ["-convert", "txt", "-stdout", path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    throw new Error(`cannot read ${basename(path)}: install pandoc (brew install pandoc) or save it as Markdown/HTML/PDF`);
  }
  throw new Error(`unsupported design file type: ${basename(path)}`);
}

/** Read a design from a file, a folder (every readable file, in name order) or an http(s) URL. */
export async function readDesign(src: string, extract?: (url: string, max: number) => Promise<string>, cwd = process.cwd()): Promise<DesignSource> {
  const s = src.trim();
  if (/^https?:\/\//i.test(s)) {
    if (!extract) throw new Error("reading a URL needs web access");
    const text = await extract(s, 600_000);
    const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? s;
    return { title, markdown: text, origin: s, files: [s] };
  }
  const p = resolve(cwd, expandHome(s));
  if (!existsSync(p)) throw new Error(`design not found: ${p}`);
  if (statSync(p).isDirectory()) {
    const files = walk(p).filter(READABLE).sort();
    if (!files.length) throw new Error(`no readable design files in ${p} (Markdown, text, HTML, PDF, Word, RTF, ODT)`);
    const parts = files.map((f) => { const t = fileToText(f); return /^\s*#\s/.test(t) ? t : `# ${relative(p, f)}\n\n${t}`; });
    return { title: basename(p), markdown: parts.join("\n\n"), origin: p, files };
  }
  const md = fileToText(p);
  const title = /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? basename(p, extname(p));
  return { title, markdown: md, origin: p, files: [p] };
}
function walk(dir: string, depth = 0): string[] {
  if (depth > 4) return [];
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    if (n.startsWith(".") || n === "node_modules") continue;
    const f = join(dir, n);
    const st = statSync(f);
    if (st.isDirectory()) out.push(...walk(f, depth + 1)); else if (st.size < 50 * 1024 * 1024) out.push(f);
  }
  return out;
}

// ── 2. outline ────────────────────────────────────────────────────
/** Split by headings into chunks of at most maxChars, keeping each chunk's heading path; text without headings is split by paragraphs. */
export function chunkDesign(md: string, maxChars: number): Chunk[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: { heading: string; text: string }[] = [];
  const path: string[] = [];
  let cur: { heading: string; lines: string[] } = { heading: "", lines: [] };
  let fence = false;
  const flush = () => { const t = cur.lines.join("\n").trim(); if (t) blocks.push({ heading: cur.heading, text: t }); };
  for (const l of lines) {
    if (/^\s*```/.test(l)) fence = !fence;
    const h = !fence && /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) {
      flush();
      const lvl = h[1].length; path.length = lvl - 1; path[lvl - 1] = h[2].trim();
      cur = { heading: path.filter(Boolean).join(" › "), lines: [l] };
    } else cur.lines.push(l);
  }
  flush();
  const chunks: Chunk[] = [];
  let acc: { heading: string; last: string; parts: string[]; size: number } | null = null;
  // a chunk that holds several sections is named by its first and last heading
  const push = () => { if (acc && acc.parts.length) chunks.push({ index: chunks.length, heading: acc.last && acc.last !== acc.heading ? `${acc.heading} … ${acc.last}` : acc.heading, text: acc.parts.join("\n\n") }); acc = null; };
  for (const b of blocks) {
    // a block bigger than a chunk is cut at paragraph boundaries
    const pieces: string[] = [];
    if (b.text.length <= maxChars) pieces.push(b.text);
    else { let buf = ""; for (const para of b.text.split(/\n{2,}/)) { if (buf && buf.length + para.length + 2 > maxChars) { pieces.push(buf); buf = ""; } buf = buf ? `${buf}\n\n${para}` : para.slice(0, maxChars); } if (buf) pieces.push(buf); }
    for (const piece of pieces) {
      if (acc && acc.size + piece.length + 2 > maxChars) push();
      if (!acc) acc = { heading: b.heading, last: b.heading, parts: [], size: 0 };
      acc.parts.push(piece); acc.size += piece.length + 2; acc.last = b.heading;
    }
  }
  push();
  return chunks;
}

const SYS = "You are a senior engineer turning a design document into a build plan. You read carefully, never invent requirements, and reply with ONE JSON object only (no prose, no code fences).";

async function askJson<T = any>(deps: DesignDeps, user: string, maxTokens: number, signal?: AbortSignal): Promise<T> {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error("design run stopped");
    const r = await deps.chat({ messages: [{ role: "system", content: SYS }, { role: "user", content: attempt ? `${user}\n\nYour previous reply was not valid JSON. Reply with the JSON object only.` : user }] as any, maxTokens, temperature: 0.2, json: true, stream: false, tier: "strong", signal });
    last = r.content ?? "";
    try { const j = repairJson(last); if (j && typeof j === "object") return j as T; } catch { /* retry */ }
  }
  throw new Error(`the model did not return JSON (reply started: ${cut(last.replace(/\s+/g, " "), 160)})`);
}

export async function outlineChunk(deps: DesignDeps, title: string, c: Chunk, total: number, signal?: AbortSignal): Promise<ChunkNotes> {
  const j = await askJson(deps, [
    `Design document: "${title}". This is part ${c.index + 1} of ${total}${c.heading ? `, section "${c.heading}"` : ""}.`,
    "Extract what a build team needs from THIS part only. Use the document's own words and names. Empty lists are fine.",
    'JSON shape: {"summary": "2-3 sentences", "goals": ["outcome the user wants"], "components": [{"name": "exact name", "purpose": "one line"}], "requirements": ["concrete must/should statement"], "constraints": ["limit: hardware, budget, law, platform, performance"], "technologies": ["named language, library, protocol, product, standard or API"], "unknowns": ["thing the document leaves open or a builder would need to look up"]}',
    "", "PART:", c.text,
  ].join("\n"), 1800, signal);
  return {
    index: c.index, heading: c.heading, summary: cut(String(j.summary ?? ""), 600),
    goals: strs(j.goals, 12), requirements: strs(j.requirements, 30), constraints: strs(j.constraints, 15), technologies: strs(j.technologies, 20), unknowns: strs(j.unknowns, 12),
    components: (Array.isArray(j.components) ? j.components : []).slice(0, 15).map((x: any) => ({ name: String(x?.name ?? x ?? "").trim(), purpose: String(x?.purpose ?? "").trim() })).filter((x: any) => x.name),
  };
}

function digest(notes: ChunkNotes[], budget: number): string {
  const lines: string[] = [];
  for (const n of notes) {
    lines.push(`[${n.index}] ${n.heading || "(untitled part)"}: ${n.summary}`);
    if (n.requirements.length) lines.push(`    requirements: ${n.requirements.slice(0, 8).join("; ")}`);
    if (n.components.length) lines.push(`    parts: ${n.components.slice(0, 8).map((c) => c.name).join(", ")}`);
  }
  let s = lines.join("\n");
  if (s.length > budget) s = notes.map((n) => `[${n.index}] ${n.heading}: ${cut(n.summary, 200)}`).join("\n").slice(0, budget);
  return s;
}

export async function makeOverview(deps: DesignDeps, title: string, notes: ChunkNotes[], budget: number, signal?: AbortSignal): Promise<Overview> {
  const tech = uniq(notes.flatMap((n) => n.technologies)).slice(0, 40);
  const j = await askJson(deps, [
    `Design document: "${title}". Below is a digest of every part ([n] = part number).`,
    "Plan the BUILD. Group the work into 2-10 epics in a sensible build order (foundations first). Each epic lists the part numbers it draws on.",
    "Only plan what the document asks to be built; background, market or history parts belong to no epic.",
    'JSON shape: {"title": "short project name", "summary": "one paragraph: what is being built and for whom", "stack": ["languages, frameworks, tools the build uses"], "test_strategy": "how work is checked in this project: test runner, commands, simulators", "epics": [{"id": "E1", "title": "…", "goal": "outcome in one sentence", "sections": [0, 3]}]}',
    "", `TECHNOLOGIES NAMED: ${tech.join(", ") || "(none)"}`, "", "DIGEST:", digest(notes, budget),
  ].join("\n"), 2000, signal);
  const epics = (Array.isArray(j.epics) ? j.epics : []).slice(0, 12).map((e: any, i: number) => ({
    id: String(e?.id ?? `E${i + 1}`).trim() || `E${i + 1}`, title: cut(String(e?.title ?? `Epic ${i + 1}`).trim(), 90), goal: cut(String(e?.goal ?? "").trim(), 300),
    sections: (Array.isArray(e?.sections) ? e.sections : []).map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n < notes.length),
  }));
  if (!epics.length) throw new Error("the model found nothing to build in this design");
  // ids must be unique
  const seen = new Set<string>();
  for (const [i, e] of epics.entries()) { if (seen.has(e.id)) e.id = `E${i + 1}`; seen.add(e.id); }
  return { title: cut(String(j.title ?? title).trim() || title, 80), summary: cut(String(j.summary ?? ""), 1200), stack: strs(j.stack, 20), test_strategy: cut(String(j.test_strategy ?? ""), 600), epics };
}

// ── 3. research ───────────────────────────────────────────────────
export async function planQuestions(deps: DesignDeps, ov: Overview, notes: ChunkNotes[], max: number, signal?: AbortSignal): Promise<Question[]> {
  if (max <= 0) return [];
  const unknowns = uniq(notes.flatMap((n) => n.unknowns)).slice(0, 30);
  const tech = uniq([...ov.stack, ...notes.flatMap((n) => n.technologies)]).slice(0, 40);
  const j = await askJson(deps, [
    `Project: ${ov.title}. ${ov.summary}`,
    `Before writing stories, a builder must check facts on the web. Write at most ${max} research questions, most important first.`,
    "Good questions: how to install or use a named technology, its current version and API, official limits, setup steps on the target platform, how to test it, and the open points below.",
    "Each needs a short web search query (keywords, no quotes, include the product name).",
    'JSON shape: {"questions": [{"q": "question", "why": "which part of the build needs it", "query": "search words"}]}',
    "", `TECHNOLOGIES: ${tech.join(", ") || "(none)"}`, `OPEN POINTS: ${unknowns.join(" | ") || "(none)"}`,
    `EPICS: ${ov.epics.map((e) => `${e.id} ${e.title}`).join("; ")}`,
  ].join("\n"), 1500, signal);
  return (Array.isArray(j.questions) ? j.questions : []).map((x: any) => ({ q: cut(String(x?.q ?? x?.question ?? "").trim(), 240), why: cut(String(x?.why ?? "").trim(), 200), query: cut(String(x?.query ?? x?.q ?? "").trim(), 120) }))
    .filter((x: Question) => x.q && x.query).slice(0, max);
}

/** Choose which search hits to read: official documentation first, never video or social sites, at most `n`. */
export function pickPages(hits: Hit[], n: number, extraOfficial: string[] = []): Hit[] {
  const bad = /youtube\.com|youtu\.be|facebook\.com|twitter\.com|x\.com\/|instagram\.com|tiktok\.com|pinterest\.|linkedin\.com|quora\.com/i;
  const ok = hits.filter((h) => /^https?:\/\//.test(h.url) && !bad.test(h.url));
  const rank = (h: Hit) => (isOfficialDoc(h.url, extraOfficial) ? 0 : /github\.com|readthedocs|docs\.|developer\.|wikipedia\.org|\.org\//i.test(h.url) ? 1 : 2);
  return ok.map((h, i) => ({ h, i })).sort((a, b) => rank(a.h) - rank(b.h) || a.i - b.i).slice(0, n).map((x) => x.h);
}

export async function researchQuestion(deps: DesignDeps, ov: Overview, q: Question, pagesPer: number, signal?: AbortSignal): Promise<Finding> {
  const f: Finding = { question: q.q, query: q.query, answer: "", facts: [], sources: [], searchedWith: "" };
  let r: { hits: Hit[]; source: string; errors: string[] };
  try { r = await deps.search(q.query); } catch (e) { f.failed = `search failed: ${errMsg(e)}`; return f; }
  f.searchedWith = r.source;
  if (!r.hits.length) { f.failed = `no results (${r.errors.join("; ")})`; return f; }
  const pages: { hit: Hit; text: string }[] = [];
  for (const h of pickPages(r.hits, pagesPer)) {
    if (signal?.aborted) break;
    try { const text = await deps.extract(h.url, 9000); if (text && !/^\S+\nHTTP \d/.test(text)) pages.push({ hit: h, text }); } catch { /* skip page */ }
  }
  const evidence = pages.length ? pages.map((p, i) => `SOURCE ${i + 1}: ${p.hit.title} — ${p.hit.url}\n${p.text}`).join("\n\n---\n\n")
    : r.hits.slice(0, 6).map((h, i) => `RESULT ${i + 1}: ${h.title} — ${h.url}\n${h.snippet}`).join("\n");
  const j = await askJson(deps, [
    `Project: ${ov.title}. Research question: ${q.q}`, q.why ? `Why it matters: ${q.why}` : "",
    "Answer ONLY from the sources below. If they do not answer it, say so in the answer and leave facts empty. Each fact must say which SOURCE number it came from.",
    'JSON shape: {"answer": "2-4 sentences a builder can act on", "facts": ["exact fact (versions, commands, names, limits) [SOURCE n]"], "used_sources": [1, 2]}',
    "", evidence,
  ].filter(Boolean).join("\n"), 1200, signal);
  f.answer = cut(String(j.answer ?? "").trim(), 900);
  f.facts = strs(j.facts, 8).map((x) => cut(x, 300));
  const used = (Array.isArray(j.used_sources) ? j.used_sources : []).map(Number).filter((n: number) => n >= 1);
  const list = pages.length ? pages.map((p) => p.hit) : r.hits.slice(0, 6);
  f.sources = (used.length ? used.map((n: number) => list[n - 1]).filter(Boolean) : list.slice(0, 2)).map((h: Hit) => ({ title: cut(h.title, 120), url: h.url }));
  return f;
}

/** Links the design itself cites (a "Sources" list, inline links): read first, they are what the author relied on. */
export function citedUrls(md: string, max = 8): string[] {
  const urls = [...md.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ""));
  return uniq(urls.filter((u) => !/\.(png|jpe?g|gif|svg|webp|mp4|zip)(\?|$)/i.test(u))).slice(0, max);
}

export async function readCited(deps: DesignDeps, ov: Overview, urls: string[], signal?: AbortSignal): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const u of urls) {
    if (signal?.aborted) break;
    let text = "";
    try { text = await deps.extract(u, 7000); } catch (e) { out.push({ question: `What does the cited source ${u} say?`, query: "", answer: "", facts: [], sources: [{ title: u, url: u }], searchedWith: "cited", failed: errMsg(e) }); continue; }
    const j = await askJson(deps, [`Project: ${ov.title}. The design cites this source. Note the facts from it a builder needs (versions, limits, commands, names).`,
      'JSON shape: {"topic": "what the page is about, a few words", "answer": "1-3 sentences", "facts": ["exact fact"]}', "", `SOURCE: ${u}\n${text}`].join("\n"), 900, signal);
    out.push({ question: `Cited source: ${cut(String(j.topic ?? u), 100)}`, query: "", answer: cut(String(j.answer ?? ""), 700), facts: strs(j.facts, 6).map((x) => cut(x, 300)), sources: [{ title: cut(String(j.topic ?? u), 120), url: u }], searchedWith: "cited" });
  }
  return out;
}

export function researchMarkdown(ov: Overview, fs: Finding[]): string {
  const L = [`# Research for ${ov.title}`, "", `${fs.filter((f) => !f.failed).length} of ${fs.length} questions answered. Every fact names the page it came from.`, ""];
  for (const [i, f] of fs.entries()) {
    L.push(`## R${i + 1}. ${f.question}`);
    if (f.query) L.push(`Search: \`${f.query}\`${f.searchedWith ? ` (via ${f.searchedWith})` : ""}`);
    if (f.failed) { L.push("", `Not answered: ${f.failed}`, ""); continue; }
    L.push("", f.answer || "(no answer in the sources)");
    if (f.facts.length) L.push("", ...f.facts.map((x) => `- ${x}`));
    if (f.sources.length) L.push("", "Sources:", ...f.sources.map((s) => `- [${s.title}](${s.url})`));
    L.push("");
  }
  return L.join("\n");
}

// ── 4. plan ───────────────────────────────────────────────────────
function findingsText(fs: Finding[], budget: number): string {
  const lines = fs.filter((f) => !f.failed && (f.answer || f.facts.length)).map((f, i) => `R${i + 1} ${f.question}\n  ${f.answer}${f.facts.length ? `\n  facts: ${f.facts.join(" | ")}` : ""}\n  source: ${f.sources.map((s) => s.url).join(" ")}`);
  let s = lines.join("\n");
  if (s.length > budget) s = s.slice(0, budget) + "\n…";
  return s || "(no research findings)";
}

export async function planEpic(deps: DesignDeps, ov: Overview, epic: EpicPlan, chunks: Chunk[], notes: ChunkNotes[], fs: Finding[], prior: StoryPlan[], budget: number, perEpic: number, signal?: AbortSignal): Promise<StoryPlan[]> {
  const secIdx = epic.sections.length ? epic.sections : notes.map((n) => n.index);
  // the epic's own parts in full while they fit, then the notes of the rest
  let spec = ""; const specBudget = Math.floor(budget * 0.55);
  for (const i of secIdx) { const c = chunks[i]; if (!c) continue; const add = `\n\n### [${i}] ${c.heading}\n${c.text}`; if (spec.length + add.length > specBudget) { const n = notes[i]; spec += `\n\n### [${i}] ${c.heading} (notes only)\n${n?.summary ?? ""}\nrequirements: ${n?.requirements.join("; ") ?? ""}`; } else spec += add; }
  spec = spec.slice(0, specBudget);
  const earlier = prior.map((s) => `${s.id} ${s.title}`).join("\n").slice(0, 3000);
  const j = await askJson(deps, [
    `Project: ${ov.title}. ${ov.summary}`, `Stack: ${ov.stack.join(", ") || "see spec"}. How work is checked: ${ov.test_strategy || "see spec"}.`,
    `EPIC ${epic.id}: ${epic.title}. Goal: ${epic.goal}`,
    `Write the user stories for THIS epic: ${Math.max(2, perEpic - 4)}-${perEpic} small stories, each finishable in one day by one developer, in build order.`,
    "Rules:",
    "- Follow the spec exactly: its names, file paths, versions and choices. Do not add features it does not ask for.",
    "- Use the research findings for versions, commands and APIs; put the URLs you relied on in references.",
    "- steps are concrete actions (create file X, run command Y). acceptance items are checkable facts. test_cases are specific inputs and expected results.",
    "- check_cmd is ONE shell command run from the project folder that exits 0 only when the story is done (a test file, a build, a script). Empty string if no command can check it.",
    `- depends_on uses story ids from this epic or the earlier stories listed below. Story ids look like ${epic.id}-S1, ${epic.id}-S2 …`,
    'JSON shape: {"stories": [{"id": "E1-S1", "title": "imperative, under 80 chars", "what": "what is built", "why": "why it matters for the goal", "depends_on": [], "files": ["path/to/file"], "steps": ["…"], "acceptance": ["…"], "test_cases": ["…"], "check_cmd": "…", "references": ["https://…"], "undo": "how to roll it back", "size": "S|M|L"}]}',
    "", "EARLIER STORIES (already planned):", earlier || "(none)",
    "", "RESEARCH FINDINGS:", findingsText(fs, Math.floor(budget * 0.25)),
    "", "SPEC FOR THIS EPIC:", spec,
  ].join("\n"), 6000, signal);
  return (Array.isArray(j.stories) ? j.stories : []).slice(0, perEpic + 4).map((s: any, i: number) => ({
    id: String(s?.id ?? `${epic.id}-S${i + 1}`).trim() || `${epic.id}-S${i + 1}`, epic: epic.id, title: cut(String(s?.title ?? `Story ${i + 1}`).trim(), 90),
    what: cut(String(s?.what ?? "").trim(), 800), why: cut(String(s?.why ?? "").trim(), 500), depends_on: strs(s?.depends_on, 10),
    files: strs(s?.files, 15).filter((f) => !/\s/.test(f) && f.length < 200), steps: strs(s?.steps, 20).map((x) => cut(x, 400)), acceptance: strs(s?.acceptance, 15).map((x) => cut(x, 300)),
    test_cases: strs(s?.test_cases, 20).map((x) => cut(x, 300)), check_cmd: cleanCmd(String(s?.check_cmd ?? "")), references: strs(s?.references, 8).filter((u) => /^https?:\/\//.test(u)),
    undo: cut(String(s?.undo ?? "").trim(), 400), size: /^[SML]$/i.test(String(s?.size ?? "")) ? String(s.size).toUpperCase() : "M",
  })).filter((s: StoryPlan) => s.title);
}
function cleanCmd(c: string): string {
  const x = c.trim().replace(/^`+|`+$/g, "").replace(/^\$\s*/, "");
  if (!x || /^(n\/?a|none|empty|-)$/i.test(x) || x.length > 300 || /\n/.test(x)) return "";
  return x;
}

/** Unique ids, dependencies that exist and point backwards (no cycles), at least one acceptance item. Returns the stories in a valid order. */
export function normalizePlan(stories: StoryPlan[]): StoryPlan[] {
  const seen = new Map<string, number>();
  for (const s of stories) { const n = seen.get(s.id) ?? 0; seen.set(s.id, n + 1); if (n) s.id = `${s.id}-${n + 1}`; }
  const ids = new Set(stories.map((s) => s.id));
  const pos = new Map(stories.map((s, i) => [s.id, i]));
  for (const s of stories) {
    s.depends_on = uniq(s.depends_on.filter((d) => ids.has(d) && d !== s.id && (pos.get(d) ?? Infinity) < (pos.get(s.id) ?? 0)));
    if (!s.acceptance.length) s.acceptance = [s.check_cmd ? `\`${s.check_cmd}\` exits 0` : `${s.what || s.title} is done and shown working`];
  }
  return stories;
}

export async function reviewPlan(deps: DesignDeps, ov: Overview, notes: ChunkNotes[], stories: StoryPlan[], budget: number, signal?: AbortSignal): Promise<string[]> {
  const reqs = uniq(notes.flatMap((n) => n.requirements)).join("\n").slice(0, Math.floor(budget * 0.5));
  const plan = stories.map((s) => `${s.id} ${s.title}`).join("\n").slice(0, Math.floor(budget * 0.4));
  const j = await askJson(deps, [`Project: ${ov.title}. Check the story list against the requirements of the design.`,
    "List requirements that NO story covers, stories that contradict the design, and ordering mistakes. Be specific and short; an empty list is fine.",
    'JSON shape: {"gaps": ["…"]}', "", "REQUIREMENTS:", reqs || "(none listed)", "", "STORIES:", plan].join("\n"), 1500, signal);
  return strs(j.gaps, 25).map((x) => cut(x, 300));
}

// ── 5. board ──────────────────────────────────────────────────────
export function storyBody(s: StoryPlan, ov: Overview, epic: EpicPlan, specRel: string, fs: Finding[]): string {
  const refs = uniq([...s.references]);
  const L = [
    "CONTEXT CAPSULE (read this first)",
    `- What: ${s.what || s.title}`,
    `- Why: ${s.why || epic.goal}`,
    `- Where it sits: epic ${epic.id} "${epic.title}" of ${ov.title}`,
    `- Spec: ${specRel} (the design this board was made from; research notes are next to it in research.md)`,
    ...(s.files.length ? [`- Files: ${s.files.join(", ")}`] : []),
    "", "STEPS", ...s.steps.map((x, i) => `${i + 1}. ${x}`),
    "", "HOW TO CHECK IT WORKS", s.check_cmd ? `- Command: ${s.check_cmd}  (must exit 0)` : "- No single command: show each acceptance item working and note the evidence in a comment.",
    ...(s.test_cases.length ? ["", "TEST CASES", ...s.test_cases.map((x) => `- ${x}`)] : []),
    ...(s.undo ? ["", "HOW TO UNDO IT", `- ${s.undo}`] : []),
    ...(refs.length ? ["", "REFERENCES (from the research; read before coding)", ...refs.map((u) => `- ${u}`)] : []),
    "", "RULES",
    "- Build what the spec and this card say; if they disagree or something is unclear, comment on this ticket instead of guessing.",
    "- Look up exact versions, commands and APIs in the references or official docs before using them.",
    `- Commit with the ticket key first. Size: ${s.size}.`,
  ];
  void fs;
  return L.join("\n");
}

/** Key prefix from the title: "The Agentic Phone" → "TAP"; never clashes with keys already used. */
export function keyPrefixFor(title: string, used: Set<string>): string {
  const words = title.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  let base = (words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "DS").slice(0, 3)).slice(0, 4);
  if (base.length < 2) base = (base + "DS").slice(0, 2);
  let p = base, n = 2;
  while (used.has(p)) p = `${base}${n++}`;
  return p;
}

// ── run ───────────────────────────────────────────────────────────
export function defaultDeps(rt: Runtime): DesignDeps {
  const prov = rt.providerFor("");
  return {
    chat: (req) => prov.chat(req),
    search: (q) => searchWebResilient(rt, q, 8, { waitMs: rt.cfg.data.kanban.design?.search_delay_ms ?? 2500 }),
    extract: (url, max) => extractUrl(rt, url, max),
    contextWindow: prov.contextWindow || 32000,
  };
}

export async function designToBoard(rt: Runtime, o: DesignOptions, deps: DesignDeps = defaultDeps(rt)): Promise<DesignResult> {
  const K = rt.kanban;
  const cfg = rt.cfg.data.kanban.design ?? {} as any;
  const say = (stage: DesignProgress["stage"], message: string, done?: number, total?: number) => o.onProgress?.({ stage, message, done, total, at: Date.now() });
  const sig = o.signal;
  const stop = () => { if (sig?.aborted) throw new Error("design run stopped"); };
  const project = resolve(expandHome(o.project));
  if (!existsSync(project)) mkdirSync(project, { recursive: true });
  // context budget in characters for one request: about 3 characters per token, keep half of the window for the reply and instructions
  const budget = Math.max(6000, Math.min(120_000, Math.floor(deps.contextWindow * 3 * 0.5)));

  say("read", `Reading ${o.source}`);
  // a relative path is looked up where the command was run, then in the project
  const base = /^https?:\/\//i.test(o.source) || existsSync(resolve(process.cwd(), expandHome(o.source))) ? process.cwd() : project;
  const src = await readDesign(o.source, deps.extract, base);
  if (src.markdown.trim().length < 200) throw new Error(`the design is too short to plan from (${src.markdown.trim().length} characters)`);
  const dir = join(project, ".stitap", "design", `${slug(src.title)}-${new Date().toISOString().slice(0, 10)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "source.md"), src.markdown);
  const specRel = relative(project, join(dir, "source.md"));
  const chunks = chunkDesign(src.markdown, Math.min(budget, 24_000));
  say("read", `Read "${src.title}": ${src.markdown.length.toLocaleString()} characters in ${chunks.length} part(s)`);

  const notes: ChunkNotes[] = [];
  for (const c of chunks) {
    stop();
    say("outline", `Reading part ${c.index + 1} of ${chunks.length}: ${c.heading || "(start)"}`, c.index, chunks.length);
    try { notes.push(await outlineChunk(deps, src.title, c, chunks.length, sig)); }
    catch (e) { if (sig?.aborted) throw e; notes.push({ index: c.index, heading: c.heading, summary: `(could not read this part: ${errMsg(e)})`, goals: [], components: [], requirements: [], constraints: [], technologies: [], unknowns: [] }); }
  }
  stop();
  say("outline", "Grouping the work into epics");
  const ov = await makeOverview(deps, src.title, notes, budget, sig);
  writeFileSync(join(dir, "outline.json"), JSON.stringify({ overview: ov, notes }, null, 1));
  say("outline", `${ov.epics.length} epic(s): ${ov.epics.map((e) => e.title).join(" · ")}`);

  const findings: Finding[] = [];
  if (o.research !== false) {
    const max = Math.max(0, o.maxSearches ?? cfg.max_searches ?? 12);
    const cited = citedUrls(src.markdown, Math.min(cfg.max_cited ?? 6, Math.max(0, Math.floor(max / 2))));
    if (cited.length) {
      say("research", `Reading ${cited.length} source(s) the design cites`, 0, cited.length);
      try { findings.push(...await readCited(deps, ov, cited, sig)); } catch (e) { if (sig?.aborted) throw e; say("research", `Cited sources skipped: ${errMsg(e)}`); }
    }
    stop();
    const qs = await planQuestions(deps, ov, notes, max, sig).catch((e) => { if (sig?.aborted) throw e; say("research", `Could not plan research questions: ${errMsg(e)}`); return [] as Question[]; });
    for (const [i, q] of qs.entries()) {
      stop();
      say("research", `Researching ${i + 1}/${qs.length}: ${q.q}`, i, qs.length);
      try { findings.push(await researchQuestion(deps, ov, q, cfg.pages_per_question ?? 2, sig)); }
      catch (e) { if (sig?.aborted) throw e; findings.push({ question: q.q, query: q.query, answer: "", facts: [], sources: [], searchedWith: "", failed: errMsg(e) }); }
    }
    const ok = findings.filter((f) => !f.failed).length;
    say("research", `Research done: ${ok} of ${findings.length} answered${findings.length && !ok ? " — web search is not working; set web.search_provider (searxng, brave or tavily)" : ""}`);
  } else say("research", "Research skipped (--no-research)");
  writeFileSync(join(dir, "research.md"), researchMarkdown(ov, findings));

  const perEpic = Math.max(2, Math.min(15, o.storiesPerEpic ?? cfg.stories_per_epic ?? 8));
  let stories: StoryPlan[] = [];
  for (const [i, e] of ov.epics.entries()) {
    stop();
    say("plan", `Writing stories for ${e.id} ${e.title}`, i, ov.epics.length);
    try { stories.push(...await planEpic(deps, ov, e, chunks, notes, findings, stories, budget, perEpic, sig)); }
    catch (err) { if (sig?.aborted) throw err; say("plan", `${e.id}: no stories (${errMsg(err)})`); }
  }
  stories = normalizePlan(stories);
  if (!stories.length) throw new Error("the model wrote no stories; try a stronger model (router tier strong) or a smaller design");
  stop();
  say("review", "Checking the plan against the design's requirements");
  const gaps = await reviewPlan(deps, ov, notes, stories, budget, sig).catch((e) => { if (sig?.aborted) throw e; return [`(plan review failed: ${errMsg(e)})`]; });
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ overview: ov, stories, gaps }, null, 1));

  stop();
  say("board", "Creating the draft board");
  const used = new Set(K.listAll().map((c) => (c.key ?? "").replace(/-\d+$/, "")));
  const prefix = (o.keyPrefix || keyPrefixFor(ov.title, used)).toUpperCase().replace(/[^A-Z0-9]/g, "") || "DS";
  let name = (o.board ?? ov.title).trim() || "Design";
  for (let n = 2; K.boards.get(name); n++) name = `${(o.board ?? ov.title).trim()} (${n})`;
  const b = K.boards.create(name, `Draft from ${src.origin}. Review the tickets, then approve the board to run it.`);
  K.boards.setDraft(b.id, { draft: true, design: relative(project, dir), project });
  const byId = new Map<string, Card>();
  const keys: string[] = [];
  const epicCard = new Map<string, Card>();
  for (const e of ov.epics) {
    const mine = stories.filter((s) => s.epic === e.id);
    if (!mine.length) continue;
    const c = K.create({ title: `${e.id} · ${e.title}`, type: "epic", status: "backlog", board: b.id, key_prefix: prefix, cwd: project, spec: specRel,
      body: `GOAL: ${e.goal}\n\nPart of: ${ov.title}\n${ov.summary}\n\nDesign sections: ${e.sections.map((i) => chunks[i]?.heading).filter(Boolean).join("; ") || "all"}` });
    epicCard.set(e.id, c); keys.push(c.key!);
  }
  let prio = stories.length * 10;
  for (const s of stories) {
    const e = ov.epics.find((x) => x.id === s.epic)!;
    const c = K.create({ title: s.title, type: "task", kind: "story", status: "backlog", board: b.id, key_prefix: prefix, parent: epicCard.get(s.epic)?.key, cwd: project, spec: specRel,
      priority: prio, depends_on: s.depends_on.map((d) => byId.get(d)?.id).filter((x): x is string => !!x), acceptance: s.acceptance, test_cases: s.test_cases,
      ...(s.check_cmd ? { test_cmd: s.check_cmd } : {}), ...(s.files.length ? { files: s.files } : {}),
      ...(s.check_cmd ? { writes_tests: true } : {}), summary: cut(s.what || s.title, 300), body: storyBody(s, ov, e, specRel, findings) });
    byId.set(s.id, c); keys.push(c.key!); prio -= 10;
  }
  const report = [
    `# ${ov.title}: design → board`, "", `Board: **${b.name}** (draft, ${stories.length} stories in ${epicCard.size} epics, keys ${prefix}-…)`, `Source: ${src.origin}`, "",
    "## Summary", ov.summary, "", `Stack: ${ov.stack.join(", ") || "-"}`, `Checking: ${ov.test_strategy || "-"}`, "",
    "## Research", `${findings.filter((f) => !f.failed).length} of ${findings.length} questions answered; details in research.md.`, "",
    "## Gaps the review found (check these before approving)", ...(gaps.length ? gaps.map((g) => `- ${g}`) : ["- none"]), "",
    "## Stories", ...stories.map((s) => `- ${byId.get(s.id)?.key} ${s.title}${s.depends_on.length ? ` (after ${s.depends_on.map((d) => byId.get(d)?.key).join(", ")})` : ""}`),
  ].join("\n");
  writeFileSync(join(dir, "report.md"), report);
  const firstEpic = [...epicCard.values()][0];
  if (firstEpic && gaps.length) K.comment(firstEpic.id, `Plan review: things the stories may not cover yet. Add or edit tickets before approving.\n- ${gaps.join("\n- ")}`, "system");
  say("done", `Draft board "${b.name}" ready for review: ${stories.length} stories, ${findings.filter((f) => !f.failed).length} research findings`);
  return { board: { id: b.id, name: b.name }, epics: epicCard.size, stories: stories.length, findings: findings.filter((f) => !f.failed).length, dir, report: join(dir, "report.md"), gaps, keys };
}

// ── background jobs (UI, tool) ────────────────────────────────────
export interface DesignJob { id: string; source: string; project: string; status: "running" | "done" | "error" | "stopped"; started: number; finished?: number; log: DesignProgress[]; result?: DesignResult; error?: string }
const jobs = new Map<string, { job: DesignJob; ctl: AbortController }>();

export function startDesignJob(rt: Runtime, o: Omit<DesignOptions, "signal" | "onProgress">, deps?: DesignDeps): DesignJob {
  for (const { job } of jobs.values()) if (job.status === "running") throw new Error(`a design run is already going (${job.id}: ${job.source}); stop it first or wait`);
  const ctl = new AbortController();
  const job: DesignJob = { id: shortId("d_"), source: o.source, project: o.project, status: "running", started: Date.now(), log: [] };
  jobs.set(job.id, { job, ctl });
  const save = () => { try { rt.db.setMeta(`design_job:${job.id}`, { ...job, log: job.log.slice(-200) }); } catch { /* ignore */ } };
  void designToBoard(rt, { ...o, signal: ctl.signal, onProgress: (p) => { job.log.push(p); rt.emitEvent("*", { type: "kanban_design", job: job.id, progress: p }); } }, deps)
    .then((r) => { job.status = "done"; job.result = r; })
    .catch((e) => { job.status = ctl.signal.aborted ? "stopped" : "error"; job.error = errMsg(e); job.log.push({ stage: "error", message: job.error, at: Date.now() }); rt.emitEvent("*", { type: "kanban_design", job: job.id, progress: job.log[job.log.length - 1] }); })
    .finally(() => { job.finished = Date.now(); save(); });
  return job;
}
export function designJob(rt: Runtime, id?: string): DesignJob | null {
  if (id) return jobs.get(id)?.job ?? rt.db.getMeta<DesignJob>(`design_job:${id}`) ?? null;
  const all = [...jobs.values()].map((x) => x.job).sort((a, b) => b.started - a.started);
  return all[0] ?? null;
}
export function stopDesignJob(id?: string): boolean {
  const j = id ? jobs.get(id) : [...jobs.values()].find((x) => x.job.status === "running");
  if (!j || j.job.status !== "running") return false;
  j.ctl.abort(); return true;
}
export function describeJob(j: DesignJob | null): string {
  if (!j) return "No design run yet.";
  const last = j.log.slice(-12).map((p) => `- [${p.stage}] ${p.message}`).join("\n");
  const head = `Design run ${j.id} (${j.status}) from ${j.source} into ${j.project}`;
  if (j.result) return `${head}\nBoard "${j.result.board.name}" (draft): ${j.result.stories} stories in ${j.result.epics} epics, ${j.result.findings} research findings.\nReport: ${j.result.report}\n${j.result.gaps.length ? `Review found ${j.result.gaps.length} gap(s): ${j.result.gaps.slice(0, 5).join("; ")}\n` : ""}Next: review the tickets (kanban show <KEY>, edit with kanban update), then kanban action=approve board="${j.result.board.name}".\n${last}`;
  return `${head}${j.error ? `\nError: ${j.error}` : ""}\n${last}`;
}

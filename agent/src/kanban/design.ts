/**
 * Design document → researched, reviewable kanban board.
 *   1. read      any design: Markdown, text, HTML, PDF (pdftotext), Word/RTF/ODT/Pages (textutil or pandoc), a web page, or a folder of them
 *   2. outline   read it section by section (sized to the model's context) and note goals, parts, requirements, technologies, unknowns
 *   3. research  turn the technologies and unknowns into questions, search the web for each (configured provider, then DuckDuckGo lite,
 *                then Wikipedia), read the best pages (official documentation first, plus the sources the design itself cites), download
 *                and read relevant PDFs, and search again with new words while an answer is incomplete; findings keep their source URLs
 *   3b. prior art  find free (open-licensed) GitHub repos that already do the same thing, download them (shallow clone, never run),
 *                and judge each: fork it, use it as a library, read it for reference, or skip; the plan builds on the good ones
 *   4. plan      split the work into epics, then each epic into small stories in the story-card shape: context, steps, files,
 *                acceptance criteria, test cases, a check command, references
 *   4b. check    every story is checked (steps, testable acceptance, test cases, a check command whose tool exists, references that
 *                open, size) and critiqued by the model; failing stories are rewritten once; requirements no story covers get new
 *                stories; whatever is still wrong is flagged on the ticket for the reviewer
 *   5. board     a NEW board, every ticket in "backlog" (a draft): nothing runs until a person reviews it and approves the board
 *                (or single tickets). Approving moves the tickets to "ready", makes the board active and, if asked, starts workers.
 * Keys are hierarchical: each epic is a main feature numbered across all boards (MF010 = the 10th), its stories follow it (US0101,
 * US0102 …), see kanban.numbering. Everything the run produced is kept in <project>/.stitap/design/<slug>/: source.md (the spec the
 * tickets point at), outline.json, research.md, sources/ (downloaded PDFs), prior-art/ (cloned repos) + prior-art.md, plan.json, report.md.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import type { Runtime } from "../runtime/runtime.js";
import type { ChatRequest } from "../providers/types.js";
import { searchWebResilient, extractUrl, guardedFetch, type Hit } from "../tools/web.js";
import { convertToMarkdown } from "../rag/convert.js";
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
export interface Finding { question: string; query: string; answer: string; facts: string[]; sources: { title: string; url: string }[]; searchedWith: string; failed?: string; queries?: string[]; pdfs?: string[] }
export interface RepoHit { full_name: string; url: string; clone_url: string; description: string; stars: number; license: string; size_kb: number; pushed_at: string; language: string; archived?: boolean }
export interface PriorArt { repo: string; url: string; license: string; stars: number; pushed: string; language: string; path?: string; cloned: boolean; verdict: "fork" | "library" | "reference" | "skip"; fit: string; covers: string[]; gaps: string[]; risks: string[]; how_to_use: string; error?: string }
export interface StoryPlan { id: string; epic: string; title: string; what: string; why: string; depends_on: string[]; files: string[]; steps: string[]; acceptance: string[]; test_cases: string[]; check_cmd: string; references: string[]; undo: string; size: string; flags?: string[] }
export interface DesignProgress { stage: "read" | "outline" | "research" | "prior-art" | "plan" | "check" | "review" | "board" | "done" | "error"; message: string; done?: number; total?: number; at: number }
export interface DesignResult { board: { id: string; name: string }; epics: number; stories: number; findings: number; dir: string; report: string; gaps: string[]; keys: string[]; priorArt: PriorArt[]; pdfs: string[]; fixed: number; flagged: number }

/** What the pipeline needs from the outside world; tests pass fakes. */
export interface DesignDeps {
  chat: (req: ChatRequest) => Promise<{ content: string }>;
  search: (q: string) => Promise<{ hits: Hit[]; source: string; errors: string[] }>;
  /** a page or document as text; PDFs are downloaded into saveDir (when given) and converted */
  extract: (url: string, maxChars: number, saveDir?: string) => Promise<string>;
  contextWindow: number;
  /** does this URL open (status below 400)? used to drop dead references */
  probe?: (url: string) => Promise<boolean>;
  /** GitHub repository search, best first */
  github?: (q: string, n: number) => Promise<RepoHit[]>;
  /** shallow-clone a repository into dest (never runs anything from it) */
  clone?: (cloneUrl: string, dest: string) => Promise<void>;
  /** is this command installed here? (checks a story's check command) */
  which?: (cmd: string) => boolean;
}
export interface DesignOptions {
  source: string;
  project: string;
  board?: string;
  research?: boolean;
  /** look for free GitHub repos that already do this, download and judge them (default: kanban.design.prior_art) */
  priorArt?: boolean;
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

/** One file as Markdown-ish text. PDF and office files go through the document converter (pdftotext or macOS PDFKit; built-in Word/RTF/ODT readers). */
export async function fileToText(path: string): Promise<string> {
  const e = extname(path).toLowerCase();
  if (TEXT_EXT.has(e)) return readFileSync(path, "utf8");
  if (HTML_EXT.has(e)) { const h = readFileSync(path, "utf8"); const t = htmlTitle(h); return `${t ? `# ${t}\n\n` : ""}${htmlToText(h)}`; }
  if (DATA_EXT.has(e)) return `# ${basename(path)}\n\n\`\`\`${e.slice(1)}\n${readFileSync(path, "utf8")}\n\`\`\``;
  if (e === ".pdf" || OFFICE_EXT.has(e)) {
    try { return (await convertToMarkdown(basename(path), readFileSync(path))).markdown; }
    catch (err) {
      if (OFFICE_EXT.has(e) && has("textutil")) return execFileSync("textutil", ["-convert", "txt", "-stdout", path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      throw new Error(`cannot read ${basename(path)}: ${errMsg(err)}`);
    }
  }
  throw new Error(`unsupported design file type: ${basename(path)}`);
}

/** Read a design from a file, a folder (every readable file, in name order) or an http(s) URL. */
export async function readDesign(src: string, extract?: (url: string, max: number, saveDir?: string) => Promise<string>, cwd = process.cwd(), saveDir?: string): Promise<DesignSource> {
  const s = src.trim();
  if (/^https?:\/\//i.test(s)) {
    if (!extract) throw new Error("reading a URL needs web access");
    const text = await extract(s, 600_000, saveDir);
    const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? s;
    return { title, markdown: text, origin: s, files: [s] };
  }
  const p = resolve(cwd, expandHome(s));
  if (!existsSync(p)) throw new Error(`design not found: ${p}`);
  if (statSync(p).isDirectory()) {
    const files = walk(p).filter(READABLE).sort();
    if (!files.length) throw new Error(`no readable design files in ${p} (Markdown, text, HTML, PDF, Word, RTF, ODT)`);
    const parts: string[] = [];
    for (const f of files) { const t = await fileToText(f); parts.push(/^\s*#\s/.test(t) ? t : `# ${relative(p, f)}\n\n${t}`); }
    return { title: basename(p), markdown: parts.join("\n\n"), origin: p, files };
  }
  const md = await fileToText(p);
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

/** Choose which search hits to read: official documentation first, never video or social sites, at most `n`. PDFs are picked separately. */
export function pickPages(hits: Hit[], n: number, extraOfficial: string[] = []): Hit[] {
  const ok = hits.filter((h) => /^https?:\/\//.test(h.url) && !BAD_SITE.test(h.url) && !isPdfUrl(h.url));
  const rank = (h: Hit) => (isOfficialDoc(h.url, extraOfficial) ? 0 : /github\.com|readthedocs|docs\.|developer\.|wikipedia\.org|\.org\//i.test(h.url) ? 1 : 2);
  return ok.map((h, i) => ({ h, i })).sort((a, b) => rank(a.h) - rank(b.h) || a.i - b.i).slice(0, n).map((x) => x.h);
}
const BAD_SITE = /youtube\.com|youtu\.be|facebook\.com|twitter\.com|x\.com\/|instagram\.com|tiktok\.com|pinterest\.|linkedin\.com|quora\.com/i;
export const isPdfUrl = (u: string) => /\.pdf(?:[?#]|$)/i.test(u);
/** PDFs among the hits (papers, specifications, datasheets, manuals), in search order. */
export function pickPdfs(hits: Hit[], n: number): Hit[] { return hits.filter((h) => /^https?:\/\//.test(h.url) && isPdfUrl(h.url) && !BAD_SITE.test(h.url)).slice(0, n); }

export interface ResearchOpts { pagesPer: number; pdfsPer: number; rounds: number; budget: number; saveDir?: string }
/**
 * One question, researched in rounds: search, read the best pages and PDFs, answer from them; when the model says the answer is
 * incomplete it proposes new search words and the next round adds what they find (pages already read are skipped).
 */
export async function researchQuestion(deps: DesignDeps, ov: Overview, q: Question, o: ResearchOpts | number, signal?: AbortSignal): Promise<Finding> {
  const opt: ResearchOpts = typeof o === "number" ? { pagesPer: o, pdfsPer: 1, rounds: 1, budget: 40_000 } : o;
  const f: Finding = { question: q.q, query: q.query, answer: "", facts: [], sources: [], searchedWith: "", queries: [], pdfs: [] };
  const pages: { hit: Hit; text: string }[] = [];
  const seen = new Set<string>();
  let snippets: Hit[] = [];
  let query = q.query;
  for (let round = 0; round < Math.max(1, opt.rounds) && query; round++) {
    if (signal?.aborted) break;
    f.queries!.push(query);
    let r: { hits: Hit[]; source: string; errors: string[] };
    try { r = await deps.search(query); } catch (e) { if (!pages.length) f.failed = `search failed: ${errMsg(e)}`; break; }
    if (r.source) f.searchedWith = f.searchedWith && f.searchedWith !== r.source ? `${f.searchedWith}, ${r.source}` : r.source;
    if (!r.hits.length) { if (!pages.length && !snippets.length) f.failed = `no results (${r.errors.join("; ")})`; break; }
    f.failed = undefined;
    snippets = [...snippets, ...r.hits.filter((h) => !seen.has(h.url))].slice(0, 12);
    for (const h of [...pickPages(r.hits.filter((x) => !seen.has(x.url)), opt.pagesPer), ...pickPdfs(r.hits.filter((x) => !seen.has(x.url)), opt.pdfsPer)]) {
      if (signal?.aborted) break;
      seen.add(h.url);
      try {
        const text = await deps.extract(h.url, isPdfUrl(h.url) ? 14_000 : 9000, opt.saveDir);
        if (!text || /^\S+\nHTTP \d/.test(text)) continue;
        if (/^# PDF\b/.test(text) || isPdfUrl(h.url)) f.pdfs!.push(h.url);
        pages.push({ hit: h, text });
      } catch { /* skip that page */ }
    }
    // the evidence must fit the request: newest pages are cut first
    const per = Math.max(1500, Math.floor((opt.budget * 0.75) / Math.max(1, pages.length)));
    const evidence = pages.length ? pages.map((p, i) => `SOURCE ${i + 1}: ${p.hit.title} — ${p.hit.url}\n${p.text.slice(0, per)}`).join("\n\n---\n\n")
      : snippets.slice(0, 8).map((h, i) => `RESULT ${i + 1}: ${h.title} — ${h.url}\n${h.snippet}`).join("\n");
    const last = round + 1 >= Math.max(1, opt.rounds);
    const j = await askJson(deps, [
      `Project: ${ov.title}. Research question: ${q.q}`, q.why ? `Why it matters: ${q.why}` : "",
      "Answer ONLY from the sources below. Each fact must say which SOURCE number it came from.",
      last ? 'JSON shape: {"answer": "2-4 sentences a builder can act on", "facts": ["exact fact (versions, commands, names, limits) [SOURCE n]"], "used_sources": [1, 2]}'
        : 'JSON shape: {"answer": "2-4 sentences a builder can act on", "facts": ["exact fact (versions, commands, names, limits) [SOURCE n]"], "used_sources": [1, 2], "complete": true, "next_query": "if complete is false: DIFFERENT search words that would find the missing part (an official doc, a spec PDF, a version number)"}',
      "", evidence,
    ].filter(Boolean).join("\n"), 1200, signal);
    f.answer = cut(String(j.answer ?? "").trim(), 900);
    f.facts = strs(j.facts, 10).map((x) => cut(x, 300));
    const used = (Array.isArray(j.used_sources) ? j.used_sources : []).map(Number).filter((n: number) => n >= 1);
    const list = pages.length ? pages.map((p) => p.hit) : snippets.slice(0, 8);
    f.sources = (used.length ? used.map((n: number) => list[n - 1]).filter(Boolean) : list.slice(0, 2)).map((h: Hit) => ({ title: cut(h.title, 120), url: h.url }));
    const next = String(j.next_query ?? "").trim();
    query = !last && j.complete === false && next && !f.queries!.some((x) => x.toLowerCase() === next.toLowerCase()) ? cut(next, 120) : "";
  }
  return f;
}

/** Links the design itself cites (a "Sources" list, inline links): read first, they are what the author relied on. */
export function citedUrls(md: string, max = 8): string[] {
  const urls = [...md.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ""));
  return uniq(urls.filter((u) => !/\.(png|jpe?g|gif|svg|webp|mp4|zip)(\?|$)/i.test(u))).slice(0, max);
}

export async function readCited(deps: DesignDeps, ov: Overview, urls: string[], signal?: AbortSignal, saveDir?: string): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const u of urls) {
    if (signal?.aborted) break;
    let text = "";
    try { text = await deps.extract(u, isPdfUrl(u) ? 12_000 : 7000, saveDir); } catch (e) { out.push({ question: `What does the cited source ${u} say?`, query: "", answer: "", facts: [], sources: [{ title: u, url: u }], searchedWith: "cited", failed: errMsg(e) }); continue; }
    const j = await askJson(deps, [`Project: ${ov.title}. The design cites this source. Note the facts from it a builder needs (versions, limits, commands, names).`,
      'JSON shape: {"topic": "what the page is about, a few words", "answer": "1-3 sentences", "facts": ["exact fact"]}', "", `SOURCE: ${u}\n${text}`].join("\n"), 900, signal);
    out.push({ question: `Cited source: ${cut(String(j.topic ?? u), 100)}`, query: "", answer: cut(String(j.answer ?? ""), 700), facts: strs(j.facts, 6).map((x) => cut(x, 300)), sources: [{ title: cut(String(j.topic ?? u), 120), url: u }], searchedWith: "cited", pdfs: /^# PDF\b/.test(text) || isPdfUrl(u) ? [u] : [] });
  }
  return out;
}

export function researchMarkdown(ov: Overview, fs: Finding[]): string {
  const L = [`# Research for ${ov.title}`, "", `${fs.filter((f) => !f.failed).length} of ${fs.length} questions answered. Every fact names the page it came from.`, ""];
  for (const [i, f] of fs.entries()) {
    L.push(`## R${i + 1}. ${f.question}`);
    if (f.query) L.push(`Search: ${(f.queries?.length ? f.queries : [f.query]).map((x) => `\`${x}\``).join(" → ")}${f.searchedWith ? ` (via ${f.searchedWith})` : ""}`);
    if (f.pdfs?.length) L.push(`PDFs read: ${f.pdfs.join(", ")}`);
    if (f.failed) { L.push("", `Not answered: ${f.failed}`, ""); continue; }
    L.push("", f.answer || "(no answer in the sources)");
    if (f.facts.length) L.push("", ...f.facts.map((x) => `- ${x}`));
    if (f.sources.length) L.push("", "Sources:", ...f.sources.map((s) => `- [${s.title}](${s.url})`));
    L.push("");
  }
  return L.join("\n");
}

// ── 3b. prior art: free repositories that already do this ─────────
/** Licenses that allow use and modification (SPDX ids as GitHub reports them). Copyleft ones are allowed but flagged. */
export const FREE_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0", "0BSD", "Unlicense", "CC0-1.0", "Zlib", "BSL-1.0", "Artistic-2.0", "EPL-2.0",
  "GPL-2.0", "GPL-3.0", "LGPL-2.1", "LGPL-3.0", "AGPL-3.0"]);
const COPYLEFT = /^(A?GPL|LGPL|MPL|EPL)/;

export async function repoQueries(deps: DesignDeps, ov: Overview, signal?: AbortSignal): Promise<string[]> {
  const j = await askJson(deps, [`Project: ${ov.title}. ${ov.summary}`, `Stack: ${ov.stack.join(", ") || "-"}. Epics: ${ov.epics.map((e) => e.title).join("; ")}`,
    "Write 1-3 GitHub repository search queries (2-5 keywords each, no quotes or operators) that would find open-source projects already doing the same thing or its biggest part.",
    'JSON shape: {"queries": ["…"]}'].join("\n"), 400, signal);
  return uniq(strs(j.queries, 3).map((x) => cut(x.replace(/["']/g, ""), 80)));
}

/** Free-licensed, not archived, not huge; most stars first. */
export function pickRepos(hits: RepoHit[], max: number, maxMb: number): RepoHit[] {
  const seen = new Set<string>();
  return hits.filter((r) => { const k = r.full_name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return FREE_LICENSES.has(r.license) && !r.archived && r.size_kb <= maxMb * 1024; })
    .sort((a, b) => b.stars - a.stars).slice(0, max);
}

/** What a reviewer reads first in a repo: README, file tree, manifests, languages. Read only; nothing is executed. */
export function repoSnapshot(dir: string, budget = 12_000): string {
  const files: string[] = [];
  const walkRepo = (d: string, depth: number) => {
    if (depth > 5 || files.length > 400) return;
    for (const n of readdirSync(d).sort()) {
      if (n === ".git" || n === "node_modules" || n === "vendor" || n === "dist" || n === "build") continue;
      const f = join(d, n); let st; try { st = statSync(f); } catch { continue; }
      if (st.isDirectory()) walkRepo(f, depth + 1); else files.push(relative(dir, f));
    }
  };
  walkRepo(dir, 0);
  const langs: Record<string, number> = {};
  for (const f of files) { const e = extname(f).toLowerCase(); if (e) langs[e] = (langs[e] ?? 0) + 1; }
  const readme = files.find((f) => /^readme(\.md|\.rst|\.txt)?$/i.test(f));
  const manifests = files.filter((f) => /^(package\.json|Cargo\.toml|pyproject\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?|requirements\.txt|CMakeLists\.txt|meson\.build|composer\.json|Gemfile)$/.test(f));
  const read = (f: string, n: number) => { try { return readFileSync(join(dir, f), "utf8").slice(0, n); } catch { return ""; } };
  return [
    `FILES (${files.length}${files.length > 400 ? "+" : ""}): ${files.slice(0, 150).join(", ")}`,
    `FILE TYPES: ${Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([e, n]) => `${e} ${n}`).join(", ")}`,
    ...manifests.slice(0, 4).map((m) => `MANIFEST ${m}:\n${read(m, 1500)}`),
    readme ? `README:\n${read(readme, Math.floor(budget * 0.6))}` : "README: (none)",
  ].join("\n\n").slice(0, budget);
}

export async function judgeRepo(deps: DesignDeps, ov: Overview, notes: ChunkNotes[], r: RepoHit, snapshot: string, signal?: AbortSignal): Promise<Omit<PriorArt, "repo" | "url" | "license" | "stars" | "pushed" | "language" | "cloned" | "path">> {
  const reqs = uniq(notes.flatMap((n) => n.requirements)).slice(0, 40).join("\n");
  const j = await askJson(deps, [`Project: ${ov.title}. ${ov.summary}`, `Our stack: ${ov.stack.join(", ") || "-"}`,
    `Judge whether the open-source repo ${r.full_name} (${r.license}, ${r.stars} stars, last push ${r.pushed_at.slice(0, 10)}, ${r.language || "?"}) is a good starting point.`,
    "verdict: fork = start from its code; library = depend on it; reference = read it for ideas only; skip = not useful. Be strict: a mismatched stack or a stale, half-finished repo is reference or skip.",
    'JSON shape: {"verdict": "fork|library|reference|skip", "fit": "2-3 sentences", "covers": ["our requirement it already does"], "gaps": ["our requirement it lacks"], "risks": ["maintenance, quality, stack or license risk"], "how_to_use": "one concrete sentence: what to take from it and where"}',
    "", "OUR REQUIREMENTS:", reqs || "(see summary)", "", "THE REPO:", snapshot].join("\n"), 1200, signal);
  const v = String(j.verdict ?? "").toLowerCase();
  return { verdict: (["fork", "library", "reference", "skip"].includes(v) ? v : "reference") as PriorArt["verdict"], fit: cut(String(j.fit ?? ""), 600),
    covers: strs(j.covers, 12).map((x) => cut(x, 200)), gaps: strs(j.gaps, 12).map((x) => cut(x, 200)), risks: strs(j.risks, 8).map((x) => cut(x, 200)), how_to_use: cut(String(j.how_to_use ?? ""), 400) };
}

export async function findPriorArt(deps: DesignDeps, ov: Overview, notes: ChunkNotes[], dir: string, o: { max: number; maxMb: number }, say: (m: string, d?: number, t?: number) => void, signal?: AbortSignal): Promise<PriorArt[]> {
  if (!deps.github || !deps.clone || o.max <= 0) return [];
  const queries = await repoQueries(deps, ov, signal);
  const hits: RepoHit[] = [];
  for (const q of queries) { if (signal?.aborted) break; try { hits.push(...await deps.github(q, 10)); } catch (e) { say(`GitHub search "${q}" failed: ${errMsg(e)}`); } }
  const chosen = pickRepos(hits, o.max, o.maxMb);
  say(`${hits.length} repo(s) found for ${queries.map((q) => `"${q}"`).join(", ") || "(no queries)"}; ${chosen.length} free-licensed and small enough to download`);
  const out: PriorArt[] = [];
  for (const [i, r] of chosen.entries()) {
    if (signal?.aborted) break;
    const dest = join(dir, "prior-art", r.full_name.replace(/[^\w.-]+/g, "__"));
    const base: PriorArt = { repo: r.full_name, url: r.url, license: r.license, stars: r.stars, pushed: r.pushed_at.slice(0, 10), language: r.language, cloned: false, verdict: "reference", fit: "", covers: [], gaps: [], risks: [], how_to_use: "" };
    say(`Downloading and judging ${r.full_name} (${r.license}, ${r.stars}★)`, i, chosen.length);
    try {
      if (!existsSync(dest)) await deps.clone(r.clone_url, dest);
      base.cloned = true; base.path = dest;
      const verdict = await judgeRepo(deps, ov, notes, r, repoSnapshot(dest), signal);
      Object.assign(base, verdict);
    } catch (e) { if (signal?.aborted) throw e; base.error = errMsg(e); base.verdict = "skip"; }
    if (COPYLEFT.test(r.license)) base.risks.push(`${r.license} is copyleft: code copied from it brings its license terms with it (derived work must stay under ${r.license}).`);
    out.push(base);
  }
  return out;
}

export function priorArtMarkdown(ov: Overview, arts: PriorArt[], project: string): string {
  const L = [`# Prior art for ${ov.title}`, "", "Free-licensed repositories that already do part of this. They were downloaded read-only (shallow clone); nothing in them was run.", ""];
  if (!arts.length) L.push("None found or downloaded.");
  for (const a of arts) {
    L.push(`## ${a.repo} — ${a.verdict.toUpperCase()}`, `${a.url} · ${a.license} · ${a.stars}★ · last push ${a.pushed} · ${a.language || "?"}${a.path ? ` · local copy: ${relative(project, a.path)}` : ""}`);
    if (a.error) L.push("", `Could not download or judge it: ${a.error}`);
    if (a.fit) L.push("", a.fit);
    if (a.how_to_use) L.push("", `How to use it: ${a.how_to_use}`);
    if (a.covers.length) L.push("", "Already does:", ...a.covers.map((x) => `- ${x}`));
    if (a.gaps.length) L.push("", "Missing:", ...a.gaps.map((x) => `- ${x}`));
    if (a.risks.length) L.push("", "Risks:", ...a.risks.map((x) => `- ${x}`));
    L.push("");
  }
  return L.join("\n");
}
function priorArtText(arts: PriorArt[], project: string): string {
  const use = arts.filter((a) => a.verdict !== "skip");
  return use.length ? use.map((a) => `- ${a.repo} (${a.verdict}, ${a.license}) ${a.url}${a.path ? ` local: ${relative(project, a.path)}` : ""}\n  how: ${a.how_to_use}\n  already does: ${a.covers.slice(0, 6).join("; ")}`).join("\n") : "(none worth building on)";
}

// ── 4. plan ───────────────────────────────────────────────────────
function findingsText(fs: Finding[], budget: number): string {
  const lines = fs.filter((f) => !f.failed && (f.answer || f.facts.length)).map((f, i) => `R${i + 1} ${f.question}\n  ${f.answer}${f.facts.length ? `\n  facts: ${f.facts.join(" | ")}` : ""}\n  source: ${f.sources.map((s) => s.url).join(" ")}`);
  let s = lines.join("\n");
  if (s.length > budget) s = s.slice(0, budget) + "\n…";
  return s || "(no research findings)";
}

export async function planEpic(deps: DesignDeps, ov: Overview, epic: EpicPlan, chunks: Chunk[], notes: ChunkNotes[], fs: Finding[], prior: StoryPlan[], budget: number, perEpic: number, signal?: AbortSignal, art = ""): Promise<StoryPlan[]> {
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
    "- Where PRIOR ART below already does part of this epic, build on it: a step says what to take from which repo (respect its license), and the repo URL goes in references. Do not plan work the chosen repo already does.",
    "- steps are concrete actions (create file X, run command Y). acceptance items are checkable facts. test_cases are specific inputs and expected results.",
    "- check_cmd is ONE shell command run from the project folder that exits 0 only when the story is done (a test file, a build, a script). Empty string if no command can check it.",
    `- depends_on uses story ids from this epic or the earlier stories listed below. Story ids look like ${epic.id}-S1, ${epic.id}-S2 …`,
    'JSON shape: {"stories": [{"id": "E1-S1", "title": "imperative, under 80 chars", "what": "what is built", "why": "why it matters for the goal", "depends_on": [], "files": ["path/to/file"], "steps": ["…"], "acceptance": ["…"], "test_cases": ["…"], "check_cmd": "…", "references": ["https://…"], "undo": "how to roll it back", "size": "S|M|L"}]}',
    "", "EARLIER STORIES (already planned):", earlier || "(none)",
    "", "RESEARCH FINDINGS:", findingsText(fs, Math.floor(budget * 0.2)),
    "", "PRIOR ART (downloaded repos):", art || "(none)",
    "", "SPEC FOR THIS EPIC:", spec,
  ].join("\n"), 6000, signal);
  return (Array.isArray(j.stories) ? j.stories : []).slice(0, perEpic + 4).map((s: any, i: number) => toStory(s, epic.id, `${epic.id}-S${i + 1}`)).filter((s: StoryPlan) => s.title);
}
const STORY_SHAPE = '{"id": "E1-S1", "title": "imperative, under 80 chars", "what": "what is built", "why": "why it matters for the goal", "depends_on": [], "files": ["path/to/file"], "steps": ["…"], "acceptance": ["…"], "test_cases": ["…"], "check_cmd": "…", "references": ["https://…"], "undo": "how to roll it back", "size": "S|M|L"}';
function toStory(s: any, epicId: string, fallbackId: string): StoryPlan {
  return ({
    id: String(s?.id ?? fallbackId).trim() || fallbackId, epic: epicId, title: cut(String(s?.title ?? "").trim(), 90),
    what: cut(String(s?.what ?? "").trim(), 800), why: cut(String(s?.why ?? "").trim(), 500), depends_on: strs(s?.depends_on, 10),
    files: strs(s?.files, 15).filter((f) => !/\s/.test(f) && f.length < 200), steps: strs(s?.steps, 20).map((x) => cut(x, 400)), acceptance: strs(s?.acceptance, 15).map((x) => cut(x, 300)),
    test_cases: strs(s?.test_cases, 20).map((x) => cut(x, 300)), check_cmd: cleanCmd(String(s?.check_cmd ?? "")), references: strs(s?.references, 8).filter((u) => /^https?:\/\//.test(u)),
    undo: cut(String(s?.undo ?? "").trim(), 400), size: /^[SML]$/i.test(String(s?.size ?? "")) ? String(s.size).toUpperCase() : "M",
  });
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

// ── 4b. check and fix stories ─────────────────────────────────────
const VAGUE = /\b(properly|correctly|works? (?:well|fine|as expected)|user[- ]friendly|intuitive|fast|quick(?:ly)?|efficient(?:ly)?|robust|seamless(?:ly)?|appropriate(?:ly)?|as needed|good|nice|etc\.?|and so on|reasonable)\b/i;
const RISKY_CMD = /\brm\s+-rf?\b|\bsudo\b|\bmkfs\b|\bdd\s+if=|>\s*\/dev\/|curl[^|]*\|\s*(?:ba|z)?sh|\bshutdown\b|\breboot\b|git\s+push/i;
/** Rule checks a person would make when reading a story; each problem is one short sentence. */
export function checkStory(s: StoryPlan, which: (cmd: string) => boolean = () => true): string[] {
  const p: string[] = [];
  if (!s.what) p.push("says nothing about what is built");
  if (s.steps.length < 2) p.push("has fewer than 2 concrete steps");
  if (!s.acceptance.length) p.push("has no acceptance criteria");
  for (const a of s.acceptance) if (VAGUE.test(a) && !/\d/.test(a)) p.push(`acceptance item is not checkable: "${cut(a, 80)}" (say what to observe, with a number or exact result)`);
  if (s.test_cases.length < (s.size === "S" ? 1 : 2)) p.push(`has ${s.test_cases.length} test case(s); give ${s.size === "S" ? "at least 1" : "at least 2"} specific inputs with expected results`);
  if (s.check_cmd) {
    if (RISKY_CMD.test(s.check_cmd)) p.push(`check command is destructive or leaves the machine: "${s.check_cmd}"`);
    const tool = s.check_cmd.trim().split(/\s+/)[0].replace(/^\.\//, "");
    if (tool && !/[/=]/.test(tool) && !["cd", "test", "[", "true", "env", "sh", "bash"].includes(tool) && !which(tool)) p.push(`check command needs "${tool}", which is not installed here; install it in an earlier story or use a different check`);
  } else if (/\.(m?js|ts|py|rs|go|java|kt|c|cpp|sh)$/i.test(s.files.join(" "))) p.push("writes code but has no check command (a test or build that exits 0 when done)");
  for (const f of s.files) if (f.startsWith("/") || f.startsWith("~") || f.split("/").includes("..")) p.push(`file path "${f}" must be relative to the project`);
  if (s.size === "L") p.push("is too big for one day (size L): split it");
  if (s.title.length > 80) p.push("title is longer than 80 characters");
  return uniq(p);
}

/** The model's own review of one epic's stories: independent, valuable, small, testable, true to the spec. */
export async function critiqueStories(deps: DesignDeps, ov: Overview, epic: EpicPlan, stories: StoryPlan[], signal?: AbortSignal): Promise<Map<string, string[]>> {
  const list = stories.map((s) => `${s.id} "${s.title}"\n  what: ${s.what}\n  steps: ${s.steps.join(" | ")}\n  acceptance: ${s.acceptance.join(" | ")}\n  tests: ${s.test_cases.join(" | ")}\n  check: ${s.check_cmd || "(none)"} · after: ${s.depends_on.join(", ") || "-"}`).join("\n").slice(0, 20_000);
  const j = await askJson(deps, [`Project: ${ov.title}. Epic ${epic.id}: ${epic.title} — ${epic.goal}`,
    "Review these user stories like a strict tech lead. A good story is small (one day), independent where possible, delivers something checkable, has acceptance criteria a tester can verify, test cases with concrete inputs and expected results, and a check command that really proves it.",
    "List only real problems. Stories without problems are left out.",
    'JSON shape: {"issues": [{"id": "E1-S2", "problems": ["…"]}]}', "", list].join("\n"), 1500, signal);
  const out = new Map<string, string[]>();
  for (const x of Array.isArray(j.issues) ? j.issues : []) { const id = String(x?.id ?? ""); const pr = strs(x?.problems, 6).map((y) => cut(y, 240)); if (id && pr.length) out.set(id, pr); }
  return out;
}

/** Rewrite the stories that have problems (ids and epics stay); returns the rewritten ones. */
export async function fixStories(deps: DesignDeps, ov: Overview, epic: EpicPlan, bad: { story: StoryPlan; problems: string[] }[], fs: Finding[], budget: number, signal?: AbortSignal): Promise<StoryPlan[]> {
  if (!bad.length) return [];
  const j = await askJson(deps, [`Project: ${ov.title}. Epic ${epic.id}: ${epic.title} — ${epic.goal}`,
    "Rewrite each story below so that every listed problem is solved. Keep its id, its intent and the spec's names. Split nothing; if a story is too big, make it smaller and say in steps what moves to a later story.",
    `JSON shape: {"stories": [${STORY_SHAPE}]}`, "", "RESEARCH FINDINGS:", findingsText(fs, Math.floor(budget * 0.2)), "",
    "STORIES AND THEIR PROBLEMS:", JSON.stringify(bad.map((b) => ({ story: { ...b.story, flags: undefined }, problems: b.problems }))).slice(0, Math.floor(budget * 0.6))].join("\n"), 6000, signal);
  const ids = new Set(bad.map((b) => b.story.id));
  return (Array.isArray(j.stories) ? j.stories : []).map((x: any) => toStory(x, epic.id, "")).filter((x: StoryPlan) => ids.has(x.id) && x.title);
}

/** New stories for requirements nobody covers; each is placed in the epic it belongs to. */
export async function fillGaps(deps: DesignDeps, ov: Overview, gaps: string[], stories: StoryPlan[], fs: Finding[], budget: number, signal?: AbortSignal): Promise<StoryPlan[]> {
  if (!gaps.length) return [];
  const j = await askJson(deps, [`Project: ${ov.title}. ${ov.summary}`, `Epics: ${ov.epics.map((e) => `${e.id} ${e.title}`).join("; ")}`,
    "The plan review found requirements that no story covers. Write the missing stories (one day each). Put each in the right epic (\"epic\": \"E2\") and give it an id like E2-G1. depends_on may name existing story ids.",
    `JSON shape: {"stories": [${STORY_SHAPE.replace('"id": "E1-S1",', '"id": "E2-G1", "epic": "E2",')}]}`, "", "UNCOVERED:", ...gaps.map((g) => `- ${g}`), "",
    "EXISTING STORIES:", stories.map((s) => `${s.id} ${s.title}`).join("\n").slice(0, 6000), "", "RESEARCH FINDINGS:", findingsText(fs, Math.floor(budget * 0.2))].join("\n"), 5000, signal);
  const epics = new Set(ov.epics.map((e) => e.id));
  return (Array.isArray(j.stories) ? j.stories : []).slice(0, Math.max(3, gaps.length * 2)).map((x: any, i: number) => {
    const ep = epics.has(String(x?.epic)) ? String(x.epic) : ov.epics[ov.epics.length - 1].id;
    return toStory(x, ep, `${ep}-G${i + 1}`);
  }).filter((x: StoryPlan) => x.title);
}

/** Keep the stories grouped by epic in epic order (gap stories land at the end of their epic), then re-check dependencies. */
export function orderByEpic(stories: StoryPlan[], ov: Overview): StoryPlan[] {
  const rank = new Map(ov.epics.map((e, i) => [e.id, i]));
  return normalizePlan(stories.map((s, i) => ({ s, i })).sort((a, b) => (rank.get(a.s.epic) ?? 99) - (rank.get(b.s.epic) ?? 99) || a.i - b.i).map((x) => x.s));
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
    ...(s.flags?.length ? ["", "REVIEW FLAGS (the automatic check could not fix these: decide before approving)", ...s.flags.map((x) => `- ${x}`)] : []),
    "", "RULES",
    "- Build what the spec and this card say; if they disagree or something is unclear, comment on this ticket instead of guessing.",
    "- Look up exact versions, commands and APIs in the references or official docs before using them.",
    `- Commit with the ticket key first. Size: ${s.size}.`,
  ];
  void fs;
  return L.join("\n");
}

// ── run ───────────────────────────────────────────────────────────
const run = (cmd: string, args: string[], o: { cwd?: string; timeout?: number; env?: Record<string, string> } = {}) => new Promise<string>((res, rej) =>
  execFile(cmd, args, { cwd: o.cwd, timeout: o.timeout ?? 180_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...(o.env ?? {}) } }, (e, out, err) => (e ? rej(new Error(`${cmd} failed: ${(err || e.message).toString().trim().split("\n").slice(-2).join(" ")}`)) : res(String(out)))));

export function defaultDeps(rt: Runtime): DesignDeps {
  const prov = rt.providerFor("");
  const cfg = rt.cfg.data.kanban.design;
  /** Download a PDF (size-capped) into saveDir/sources, convert it to text. */
  const pdf = async (url: string, max: number, saveDir?: string): Promise<string> => {
    const res = await guardedFetch(rt, url);
    if (!res.ok) return `${url}\nHTTP ${res.status} ${res.statusText}`;
    const cap = (cfg.max_pdf_mb ?? 40) * 1024 * 1024;
    if (Number(res.headers.get("content-length") ?? 0) > cap) throw new Error(`PDF larger than ${cfg.max_pdf_mb ?? 40} MB`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > cap) throw new Error(`PDF larger than ${cfg.max_pdf_mb ?? 40} MB`);
    if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error("not a PDF");
    if (saveDir) { const d = join(saveDir, "sources"); mkdirSync(d, { recursive: true }); writeFileSync(join(d, `${slug(url.replace(/^https?:\/\//, "")).slice(0, 80)}.pdf`), buf); }
    const md = (await convertToMarkdown("doc.pdf", buf)).markdown;
    return `# PDF: ${url}\nSource: ${url}\n\n${md.length > max ? md.slice(0, max) + "\n…" : md}`;
  };
  return {
    chat: (req) => prov.chat(req),
    search: (q) => searchWebResilient(rt, q, 8, { waitMs: cfg.search_delay_ms ?? 2500 }),
    extract: async (url, max, saveDir) => {
      if (isPdfUrl(url)) return pdf(url, max, saveDir);
      const t = await extractUrl(rt, url, max);
      return /^\S+\n\(PDF document/.test(t) ? pdf(url, max, saveDir) : t;
    },
    contextWindow: prov.contextWindow || 32000,
    probe: async (url) => {
      try { let r = await guardedFetch(rt, url, { method: "HEAD" }); if (r.status === 405 || r.status === 403) r = await guardedFetch(rt, url); return r.status < 400 || r.status === 429; }
      catch { return false; }
    },
    github: async (q, n) => {
      const token = rt.cfg.secret("GITHUB_TOKEN");
      const res = await guardedFetch(rt, `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${n}`,
        { headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
      if (res.status === 403 || res.status === 429) throw new Error("GitHub search rate limit reached (set GITHUB_TOKEN in .env for more)");
      if (!res.ok) throw new Error(`GitHub search HTTP ${res.status}`);
      const j: any = await res.json();
      return (j.items ?? []).map((r: any) => ({ full_name: r.full_name, url: r.html_url, clone_url: r.clone_url, description: r.description ?? "", stars: r.stargazers_count ?? 0,
        license: r.license?.spdx_id ?? "", size_kb: r.size ?? 0, pushed_at: r.pushed_at ?? "", language: r.language ?? "", archived: !!r.archived }));
    },
    clone: async (cloneUrl, dest) => {
      if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(cloneUrl)) throw new Error(`refusing to clone ${cloneUrl}: only https://github.com repositories`);
      mkdirSync(join(dest, ".."), { recursive: true });
      // shallow, no hooks, no LFS downloads, no symlinks followed out of the folder; nothing from the repo is run
      await run("git", ["-c", "core.symlinks=false", "-c", "core.hooksPath=/dev/null", "clone", "--depth", "1", "--single-branch", "--no-tags", cloneUrl, dest],
        { timeout: 240_000, env: { GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1" } });
    },
    which: has,
  };
}

export async function designToBoard(rt: Runtime, o: DesignOptions, deps: DesignDeps = defaultDeps(rt)): Promise<DesignResult> {
  const K = rt.kanban;
  const cfg = rt.cfg.data.kanban.design;
  const say = (stage: DesignProgress["stage"], message: string, done?: number, total?: number) => o.onProgress?.({ stage, message, done, total, at: Date.now() });
  const sig = o.signal;
  const stop = () => { if (sig?.aborted) throw new Error("design run stopped"); };
  const soft = <T>(stage: DesignProgress["stage"], what: string, fallback: T) => (e: any): T => { if (sig?.aborted) throw e; say(stage, `${what}: ${errMsg(e)}`); return fallback; };
  const project = resolve(expandHome(o.project));
  if (!existsSync(project)) mkdirSync(project, { recursive: true });
  // context budget in characters for one request: about 3 characters per token, keep half of the window for the reply and instructions
  const budget = Math.max(6000, Math.min(120_000, Math.floor(deps.contextWindow * 3 * 0.5)));

  say("read", `Reading ${o.source}`);
  // a relative path is looked up where the command was run, then in the project
  const base = /^https?:\/\//i.test(o.source) || existsSync(resolve(process.cwd(), expandHome(o.source))) ? process.cwd() : project;
  const pre = join(project, ".stitap", "design", "_incoming");
  const src = await readDesign(o.source, deps.extract, base, pre);
  if (src.markdown.trim().length < 200) throw new Error(`the design is too short to plan from (${src.markdown.trim().length} characters)`);
  const dir = join(project, ".stitap", "design", `${slug(src.title)}-${new Date().toISOString().slice(0, 10)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "source.md"), src.markdown);
  const specRel = relative(project, join(dir, "source.md"));
  const chunks = chunkDesign(src.markdown, Math.min(budget, 24_000));
  say("read", `Read "${src.title}": ${src.markdown.length.toLocaleString()} characters in ${chunks.length} part(s)`);

  // 2. outline
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

  // 3. research (pages, PDFs, follow-up rounds)
  const findings: Finding[] = [];
  if (o.research !== false) {
    const max = Math.max(0, o.maxSearches ?? cfg.max_searches ?? 12);
    const cited = citedUrls(src.markdown, Math.min(cfg.max_cited ?? 6, Math.max(0, Math.floor(max / 2))));
    if (cited.length) {
      say("research", `Reading ${cited.length} source(s) the design cites`, 0, cited.length);
      findings.push(...await readCited(deps, ov, cited, sig, dir).catch(soft("research", "Cited sources skipped", [] as Finding[])));
    }
    stop();
    const qs = await planQuestions(deps, ov, notes, max, sig).catch(soft("research", "Could not plan research questions", [] as Question[]));
    const ro: ResearchOpts = { pagesPer: cfg.pages_per_question ?? 2, pdfsPer: cfg.pdfs_per_question ?? 1, rounds: cfg.research_rounds ?? 2, budget, saveDir: dir };
    for (const [i, q] of qs.entries()) {
      stop();
      say("research", `Researching ${i + 1}/${qs.length}: ${q.q}`, i, qs.length);
      try { findings.push(await researchQuestion(deps, ov, q, ro, sig)); }
      catch (e) { if (sig?.aborted) throw e; findings.push({ question: q.q, query: q.query, answer: "", facts: [], sources: [], searchedWith: "", failed: errMsg(e) }); }
    }
    const ok = findings.filter((f) => !f.failed).length;
    say("research", `Research done: ${ok} of ${findings.length} answered, ${findings.reduce((n, f) => n + (f.pdfs?.length ?? 0), 0)} PDF(s) read${findings.length && !ok ? " — web search is not working; set web.search_provider (searxng, brave or tavily)" : ""}`);
  } else say("research", "Research skipped (--no-research)");
  writeFileSync(join(dir, "research.md"), researchMarkdown(ov, findings));
  const pdfs = uniq(findings.flatMap((f) => f.pdfs ?? []));

  // 3b. prior art
  let arts: PriorArt[] = [];
  if (o.research !== false && (o.priorArt ?? cfg.prior_art ?? true)) {
    stop();
    say("prior-art", "Looking for free GitHub projects that already do this");
    arts = await findPriorArt(deps, ov, notes, dir, { max: cfg.max_repos ?? 3, maxMb: cfg.max_repo_mb ?? 200 }, (m, d, t) => say("prior-art", m, d, t), sig).catch(soft("prior-art", "Prior-art search skipped", [] as PriorArt[]));
    writeFileSync(join(dir, "prior-art.md"), priorArtMarkdown(ov, arts, project));
    say("prior-art", arts.length ? `Judged ${arts.length} repo(s): ${arts.map((a) => `${a.repo} → ${a.verdict}`).join(", ")}` : "No usable repos found");
  }
  const art = priorArtText(arts, project);

  // 4. plan
  const perEpic = Math.max(2, Math.min(15, o.storiesPerEpic ?? cfg.stories_per_epic ?? 8));
  let stories: StoryPlan[] = [];
  for (const [i, e] of ov.epics.entries()) {
    stop();
    say("plan", `Writing stories for ${e.id} ${e.title}`, i, ov.epics.length);
    stories.push(...await planEpic(deps, ov, e, chunks, notes, findings, stories, budget, perEpic, sig, art).catch(soft("plan", `${e.id}: no stories`, [] as StoryPlan[])));
  }
  stories = normalizePlan(stories);
  if (!stories.length) throw new Error("the model wrote no stories; try a stronger model (router tier strong) or a smaller design");

  // 4b. check every story, let the model critique each epic, rewrite what fails once, then flag what is left
  const which = deps.which ?? (() => true);
  let fixed = 0;
  const dead = new Set<string>();
  if (deps.probe && cfg.check_references !== false) {
    const urls = uniq(stories.flatMap((s) => s.references)).slice(0, 80);
    say("check", `Checking ${urls.length} reference link(s)`);
    for (const u of urls) { if (sig?.aborted) break; if (!(await deps.probe(u))) dead.add(u); }
    for (const s of stories) s.references = s.references.filter((u) => !dead.has(u));
  }
  for (const [i, e] of ov.epics.entries()) {
    stop();
    const mine = stories.filter((s) => s.epic === e.id);
    if (!mine.length) continue;
    say("check", `Checking the stories of ${e.id} ${e.title}`, i, ov.epics.length);
    const critique = await critiqueStories(deps, ov, e, mine, sig).catch(soft("check", `${e.id}: model review skipped`, new Map<string, string[]>()));
    const bad = mine.map((s) => ({ story: s, problems: uniq([...checkStory(s, which), ...(critique.get(s.id) ?? [])]) })).filter((b) => b.problems.length);
    if (!bad.length) continue;
    say("check", `${e.id}: rewriting ${bad.length} story(ies) with problems`);
    const redone = await fixStories(deps, ov, e, bad, findings, budget, sig).catch(soft("check", `${e.id}: rewrite failed`, [] as StoryPlan[]));
    for (const b of bad) {
      const r = redone.find((x) => x.id === b.story.id);
      const cand = r ? { ...r, depends_on: r.depends_on.length ? r.depends_on : b.story.depends_on, references: r.references.filter((u) => !dead.has(u)) } : b.story;
      const left = checkStory(cand, which);
      if (r && left.length < checkStory(b.story, which).length + (critique.get(b.story.id)?.length ?? 0)) { Object.assign(b.story, cand); fixed++; }
      // what the rule check still finds, plus the model's points when the story was not rewritten, go to the reviewer
      b.story.flags = uniq([...checkStory(b.story, which), ...(r ? [] : critique.get(b.story.id) ?? [])]);
      if (!b.story.flags.length) delete b.story.flags;
    }
  }
  stories = normalizePlan(stories);

  // gaps: requirements no story covers get new stories, then one more review
  stop();
  say("review", "Checking the plan against the design's requirements");
  let gaps = await reviewPlan(deps, ov, notes, stories, budget, sig).catch(soft("review", "Plan review failed", [] as string[]));
  let added = 0;
  if (gaps.length) {
    say("review", `Writing stories for ${gaps.length} uncovered requirement(s)`);
    const extra = await fillGaps(deps, ov, gaps, stories, findings, budget, sig).catch(soft("review", "Gap stories failed", [] as StoryPlan[]));
    for (const x of extra) { const f = checkStory(x, which); if (f.length) x.flags = f; }
    added = extra.length;
    if (extra.length) { stories = orderByEpic([...stories, ...extra], ov); gaps = await reviewPlan(deps, ov, notes, stories, budget, sig).catch(soft("review", "Second plan review failed", gaps)); }
  }
  const flagged = stories.filter((s) => s.flags?.length).length;
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ overview: ov, stories, gaps, priorArt: arts }, null, 1));

  // 5. board: MF### per epic (main feature), US###n per story under it
  stop();
  say("board", "Creating the draft board");
  let name = (o.board ?? ov.title).trim() || "Design";
  for (let n = 2; K.boards.get(name); n++) name = `${(o.board ?? ov.title).trim()} (${n})`;
  const b = K.boards.create(name, `Draft from ${src.origin}. Review the tickets, then approve the board to run it.`);
  K.boards.setDraft(b.id, { draft: true, design: relative(project, dir), project });
  const byId = new Map<string, Card>();
  const keys: string[] = [];
  const epicCard = new Map<string, Card>();
  for (const e of ov.epics) {
    if (!stories.some((s) => s.epic === e.id)) continue;
    const c = K.create({ title: e.title, type: "epic", numbering: "feature", status: "backlog", board: b.id, cwd: project, spec: specRel,
      body: `GOAL: ${e.goal}\n\nPart of: ${ov.title}\n${ov.summary}\n\nDesign sections: ${e.sections.map((i) => chunks[i]?.heading).filter(Boolean).join("; ") || "all"}${arts.some((a) => a.verdict !== "skip") ? `\n\nPrior art (see ${relative(project, join(dir, "prior-art.md"))}):\n${priorArtText(arts, project)}` : ""}` });
    epicCard.set(e.id, c); keys.push(c.key!);
  }
  let prio = stories.length * 10;
  for (const s of stories) {
    const e = ov.epics.find((x) => x.id === s.epic)!;
    const c = K.create({ title: s.title, type: "task", kind: "story", status: "backlog", board: b.id, parent: epicCard.get(s.epic)?.key, cwd: project, spec: specRel,
      priority: prio, depends_on: s.depends_on.map((d) => byId.get(d)?.id).filter((x): x is string => !!x), acceptance: s.acceptance, test_cases: s.test_cases,
      ...(s.check_cmd ? { test_cmd: s.check_cmd, writes_tests: true } : {}), ...(s.files.length ? { files: s.files } : {}), ...(s.flags?.length ? { review_flags: s.flags } : {}),
      summary: cut(s.what || s.title, 300), body: storyBody(s, ov, e, specRel, findings) });
    if (s.flags?.length) K.comment(c.id, `Needs review: the automatic check could not fix these.\n- ${s.flags.join("\n- ")}`, "system");
    byId.set(s.id, c); keys.push(c.key!); prio -= 10;
  }
  const answered = findings.filter((f) => !f.failed).length;
  const report = [
    `# ${ov.title}: design → board`, "", `Board: **${b.name}** (draft): ${stories.length} stories in ${epicCard.size} main features (${[...epicCard.values()].map((c) => c.key).join(", ")})`, `Source: ${src.origin}`, "",
    "## Summary", ov.summary, "", `Stack: ${ov.stack.join(", ") || "-"}`, `Checking: ${ov.test_strategy || "-"}`, "",
    "## Research", `${answered} of ${findings.length} questions answered (research.md), ${pdfs.length} PDF(s) read and saved in sources/.`, ...pdfs.map((u) => `- ${u}`), "",
    "## Prior art", ...(arts.length ? arts.map((a) => `- ${a.repo} (${a.license}, ${a.stars}★): **${a.verdict}** — ${a.how_to_use || a.fit || a.error || ""}`) : ["- none"]), "",
    "## Story check", `${fixed} story(ies) rewritten by the check, ${added} added for uncovered requirements, ${flagged} still flagged for review${dead.size ? `, ${dead.size} dead reference link(s) removed` : ""}.`, "",
    "## Requirements still uncovered (check before approving)", ...(gaps.length ? gaps.map((g) => `- ${g}`) : ["- none"]), "",
    "## Stories", ...stories.map((s) => `- ${byId.get(s.id)?.key} ${s.title}${s.depends_on.length ? ` (after ${s.depends_on.map((d) => byId.get(d)?.key).join(", ")})` : ""}${s.flags?.length ? " ⚑" : ""}`),
  ].join("\n");
  writeFileSync(join(dir, "report.md"), report);
  const firstEpic = [...epicCard.values()][0];
  if (firstEpic && gaps.length) K.comment(firstEpic.id, `Plan review: requirements the stories may still not cover. Add or edit tickets before approving.\n- ${gaps.join("\n- ")}`, "system");
  say("done", `Draft board "${b.name}" ready for review: ${stories.length} stories (${flagged} flagged), ${answered} research findings, ${pdfs.length} PDF(s), ${arts.length} repo(s) judged`);
  return { board: { id: b.id, name: b.name }, epics: epicCard.size, stories: stories.length, findings: answered, dir, report: join(dir, "report.md"), gaps, keys, priorArt: arts, pdfs, fixed, flagged };
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
  if (j.result) return `${head}\nBoard "${j.result.board.name}" (draft): ${j.result.stories} stories in ${j.result.epics} main features, ${j.result.findings} research findings, ${j.result.pdfs?.length ?? 0} PDF(s), ${j.result.priorArt?.length ?? 0} repo(s) judged; ${j.result.flagged ?? 0} story(ies) flagged for review.\nReport: ${j.result.report}\n${j.result.gaps.length ? `Review found ${j.result.gaps.length} gap(s): ${j.result.gaps.slice(0, 5).join("; ")}\n` : ""}Next: review the tickets (kanban show <KEY>, edit with kanban update), then kanban action=approve board="${j.result.board.name}".\n${last}`;
  return `${head}${j.error ? `\nError: ${j.error}` : ""}\n${last}`;
}

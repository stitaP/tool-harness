/**
 * Turn one numbered section of a phase spec into a user story a SMALL model can follow.
 * Plain words, short lines, one fixed layout, nothing implied:
 *   WHAT TO BUILD · WHY · READ THESE FIRST · FILES · NAMES TO EXPORT · STEPS · WHAT EACH PART MUST DO · EXAMPLES · RULES · TEST CASES · DONE WHEN
 * Test cases are derived from every table row and rule of the section (a normal case plus the edge cases its wording hints at),
 * and padded with checks every file needs (it exists, the names match, its imports resolve, no leftovers).
 */
import { posix } from "node:path";
import type { Section } from "./plan.js";

export interface StoryInput {
  num: string; phaseShort: string; goal: string; spec: string; sec: Section;
  manifest: { files: string[]; exports: Record<string, string[]> };
  contextDocs: string[];
  /** files already promised by other tickets on the board: file → ticket key */
  made: Map<string, string>;
  total: number; index: number;
}
export interface Story { title: string; summary: string; body: string; acceptance: string[]; testCases: string[] }

const plain = (s: string) => s.replace(/\*\*/g, "").replace(/__/g, "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const FILE_RE = /^(?:\.[\w.-]+|[\w./-]+\.(?:m?js|html|css|json|md|svg|ya?ml|txt|xml))$/;
const isJs = (f: string) => /\.m?js$/.test(f);

interface Row { sig: string; name: string; says: string }
export function tableRows(body: string): Row[] {
  const rows: Row[] = [];
  for (const l of body.split("\n")) {
    const m = /^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/.exec(l);
    if (!m || /^[-: ]+$/.test(m[2])) continue;
    rows.push({ sig: m[1], name: /^([A-Za-z_$][\w$]*)/.exec(m[1])?.[1] ?? m[1], says: plain(m[2]).replace(/`/g, "") });
  }
  return rows;
}
function codeBlocks(body: string): { lang: string; text: string }[] {
  const out: { lang: string; text: string }[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g; let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push({ lang: m[1], text: m[2].replace(/\s+$/, "") });
  return out;
}
/** Every prose line (not code, not a table row, not a heading) as one plain sentence. */
function proseItems(body: string): string[] {
  const out: string[] = []; let fence = false;
  for (const raw of body.split("\n")) {
    if (/^```/.test(raw)) { fence = !fence; continue; }
    if (fence || /^\s*\|/.test(raw) || /^\s*#/.test(raw) || !raw.trim() || /^\s*---+\s*$/.test(raw)) continue;
    const t = plain(raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/^>\s*/, ""));
    if (t.length > 3) out.push(cut(t, 240));
  }
  return [...new Set(out)];
}
function importsOf(body: string, file?: string): string[] {
  if (!file) return [];
  const out: string[] = [];
  for (const b of codeBlocks(body)) for (const m of b.text.matchAll(/(?:from|import)\s+['"](\.{1,2}\/[^'"]+)['"]/g)) out.push(posix.normalize(posix.join(posix.dirname(file), m[1])));
  return [...new Set(out)];
}
function relatedFiles(body: string, own: string[]): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/`([^`\s]+)`/g)) { const t = m[1]; if (FILE_RE.test(t) && !own.includes(t) && !t.startsWith("tests/") && !t.startsWith("docs/")) out.add(t); }
  return [...out].slice(0, 8);
}

/** Edge cases a row's wording hints at, in plain sentences. */
function edgeCases(f: string, says: string, sig: string): string[] {
  const s = says.toLowerCase(), out: string[] = [];
  if (/\bnull\b/.test(s)) out.push(`${f}, edge case: an id or name that does not exist returns null (not undefined, not an error).`);
  if (/new array|copy|never .*sort\(\)|does not (?:change|mutate)|without (?:changing|mutating)/.test(s)) out.push(`After ${f} runs, the list you gave it is unchanged (same order, same length).`);
  if (/clamp/.test(s)) out.push(`${f}: a value below the minimum and a value above the maximum are both pulled back inside the limits.`);
  if (/trim|lowercase|case/.test(s)) out.push(`${f}: extra spaces around the input and capital letters do not change the result.`);
  if (/empty|''|""/.test(s)) out.push(`${f} with an empty input behaves exactly as the spec says for "empty".`);
  if (/default/.test(s) || /=\s*[\w'"\[{]/.test(sig)) out.push(`Calling ${f} WITHOUT the optional argument uses the default value from the spec.`);
  if (/sort|order|desc|asc|rating/.test(s)) out.push(`${f}: with three or more items the order is exactly as described (check first, middle and last).`);
  if (/>=|<=|≥|≤|\bmax|\bmin|limit|above|below|free|at least|up to/.test(s) || /\d/.test(s)) out.push(`${f}: check the number at the edge: exactly on the limit, one below it, one above it.`);
  if (/\b(true|false|boolean)\b/.test(s)) out.push(`${f} returns real true / false (a boolean), not a truthy or falsy value.`);
  if (/array|list|items|products/.test(s)) out.push(`${f} with an empty list returns an empty result (or the value the spec names), and does not crash.`);
  if (/unique|duplicate|never the product itself|no duplicates/.test(s)) out.push(`${f}: the result has no duplicates and never includes the item you asked about.`);
  return out;
}

export function buildStory(i: StoryInput): Story {
  const { sec, manifest: man } = i;
  const files = man.files, jsFile = files.find(isJs);
  const rows = tableRows(sec.body), names = Object.values(man.exports).flat();
  const label = plain(sec.heading).replace(/`/g, "");
  const main = files[0];
  const verb = !main ? "Do" : !/\.[\w]+$/.test(main) && !main.startsWith(".") ? "Create the folder" : /\.html$/.test(main) ? "Build the page" : /\.css$/.test(main) ? "Write the styles" : isJs(main) ? "Write" : "Create";
  const isFolders = /\bfolders?\b|\bdirector(?:y|ies)\b/i.test(sec.heading);
  const title = isFolders ? `Phase ${i.num} · ${label.replace(/^(\w)/, (c) => c.toUpperCase())}` : `Phase ${i.num} · ${main ? `${verb} ${files.length > 1 ? files.slice(0, 2).join(" and ") + (files.length > 2 ? ` +${files.length - 2}` : "") : main}` : label.replace(/^(\w)/, (c) => c.toUpperCase())}`;
  const summary = cut(`${main ? `${verb} ${files.join(", ")}` : label}${names.length ? ` with ${names.length} exported name${names.length === 1 ? "" : "s"} (${names.slice(0, 4).join(", ")}${names.length > 4 ? ", …" : ""})` : ""} for phase ${i.num}: ${i.phaseShort}.`, 230);
  const imports = importsOf(sec.body, jsFile), related = relatedFiles(sec.body, files);
  const prose = proseItems(sec.body), blocks = codeBlocks(sec.body);

  // ── resources ──
  const res: string[] = [];
  const backend = Number(i.num) >= 12 || /\bserver\/|\bapi\b|\badmin\b/i.test(sec.body);
  for (const d of i.contextDocs) {
    if (/backend/.test(d)) { if (backend) res.push(`${d}: the backend rules (API, roles, data files). Read it before touching server or admin code.`); }
    else res.push(`${d}: the project rules (folders, names, style). Read it first.`);
  }
  res.push(`${i.spec}, section "${i.sec.num}. ${label}": the full spec for THIS story (copied below).`);
  for (const f of imports) res.push(`${f}: your file imports it${i.made.get(f) ? ` (built by ticket ${i.made.get(f)})` : ""}. Open it to see the exact names it exports.`);
  for (const f of related) if (!imports.includes(f)) res.push(`${f}: mentioned in the spec${i.made.get(f) ? ` (built by ticket ${i.made.get(f)})` : ""}. Read it, do not change it.`);

  // ── what each part must do ──
  const must: string[] = [];
  for (const r of rows) must.push(`${r.sig}: ${r.says}`);
  for (const p of prose) must.push(p);

  // ── test cases ──
  const tc: string[] = [];
  for (const f of files) tc.push(`The ${/\.[\w]+$/.test(f) || f.startsWith(".") ? "file" : "folder"} ${f} exists.`);
  for (const [f, ns] of Object.entries(man.exports)) tc.push(`${f} exports exactly these names, spelled the same: ${ns.join(", ")}.`);
  if (jsFile) { tc.push(`${jsFile} can be imported without any error (its own imports all exist).`); tc.push(`${jsFile} has no leftover console.log or debugger lines.`); }
  for (const r of rows) {
    tc.push(`${r.name}, normal case: ${cut(r.says, 170)}`);
    for (const e of edgeCases(r.name, r.says, r.sig).slice(0, 3)) tc.push(e);
  }
  for (const m of must.filter((x) => !rows.some((r) => x.startsWith(r.sig + ":"))).slice(0, 10)) tc.push(`Rule: ${cut(m, 150)}`);
  if (!rows.length && !names.length) {
    // config or markup stories (folders, .gitignore, page skeletons, notes files): every line of the example is something that must be there
    for (const b of blocks.filter((x) => !isJs("a." + x.lang))) {
      const isHtml = /html/.test(b.lang) || /^\s*</.test(b.text);
      const lines = b.text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//") && !/^[}\]);]+$/.test(l));
      for (const l of lines.slice(0, 14)) tc.push(isHtml ? `The markup contains: ${cut(l, 140)}` : /^[\w.-]+(?:\/[\w.-]+)*\/?(?:\s+[\w.-]+(?:\/[\w.-]+)*\/?)+$/.test(l) ? `These folders/files exist: ${cut(l, 140)}` : `It contains the line: ${cut(l, 140)}`);
    }
  }
  for (const f of files.filter((x) => /\.html$/.test(x))) {
    tc.push(`${f} opens in the browser with no console errors.`); tc.push(`Every link and script in ${f} points to a file that exists.`);
    tc.push(`${f} shows its main content at phone width (360 px) and at desktop width (1280 px), with no sideways scrolling.`);
    if (/<h1|h1\b/i.test(sec.body)) tc.push(`${f} has the heading structure the spec asks for (check the h1).`);
  }
  for (const f of files.filter((x) => /\.css$/.test(x))) { tc.push(`${f} is loaded by the pages that need it (the page looks styled, not plain).`); tc.push(`${f} uses the design tokens from css/tokens.css where the spec says so, not new colours.`); }
  tc.push(`Only the files of this story were changed (check with git: nothing else in the diff).`);
  tc.push(`Names, file paths and folders match the spec letter for letter (no renaming, no extra files).`);
  // every story gets at least 8 real checks: top up with the ones every deliverable needs
  const pads = [`Open each file you made from top to bottom: nothing is unfinished (no TODO, no empty function, no placeholder text).`,
    `The tests of earlier phases still pass after your change (nothing else broke).`, `git shows your files committed, and the commit message starts with the ticket key.`,
    `Someone who has only the spec can find every name you used: names are clear and match the spec.`];
  for (const p of pads) if (new Set(tc).size < 8) tc.push(p);
  const testCases = [...new Set(tc)].slice(0, 40);

  // ── the story text ──
  const L: string[] = [];
  L.push(`STORY ${i.index} of ${i.total} in phase ${i.num} (${i.phaseShort})`);
  L.push("", "WHAT TO BUILD", `- ${summary}`);
  L.push("", "WHY", `- The goal of phase ${i.num}: ${i.goal ? cut(plain(i.goal).replace(/^./, (c) => c.toLowerCase()), 260) : "see the spec."}`, "- Other files will use your work, so every name must be exactly as written.");
  L.push("", "YOUR FOCUS", `- Do only this story. Do not start the next one. Do not change files that belong to other stories.`);
  L.push("", "READ THESE FIRST", ...res.map((r, k) => `${k + 1}. ${r}`));
  if (files.length) L.push("", "FILES YOU MUST LEAVE IN PLACE", ...files.map((f) => `- ${f}`));
  if (names.length) L.push("", "NAMES YOU MUST EXPORT (spell them exactly)", ...Object.entries(man.exports).flatMap(([f, ns]) => ns.map((n) => `- ${n}   (in ${f})`)));
  L.push("", "STEPS",
    `1. Read the files in "READ THESE FIRST".`,
    `2. ${files.length ? `Create or update: ${files.join(", ")}.` : "Make the change the spec describes."}`,
    `3. Work down the list "WHAT EACH PART MUST DO" one line at a time. Tick each line off when it is done.`,
    `4. Compare with the "TEST CASES" list below. Try each one. Fix anything that fails.`,
    `5. Commit with the ticket key first, for example "<KEY>: ${files[0] ? `add ${posix.basename(files[0])}` : "done"}".`,
    `6. If something is unclear, write a comment on this ticket. Do not guess.`);
  if (must.length) L.push("", "WHAT EACH PART MUST DO", ...must.map((m, k) => `${k + 1}. ${m}`));
  if (blocks.length) { L.push("", "EXAMPLES FROM THE SPEC (copy the shape exactly)"); for (const b of blocks.slice(0, 3)) L.push("```" + b.lang, ...b.text.split("\n").slice(0, 40), "```"); }
  L.push("", "RULES",
    "- Use only what the spec says. Do not add extra features or extra files.",
    "- Keep every name, path and spelling exactly as written.",
    "- Do not leave console.log or debug lines.",
    "- If a word or an API is new to you, look it up with the docs_lookup tool (official sites only) before you guess, and write what you learned as a comment on this ticket.",
    "- Do not write or change the phase tests here; they are written after all stories are built.");
  L.push("", "TEST CASES (each one must be true when you are done)", ...testCases.map((t, k) => `${k + 1}. ${t}`));
  L.push("", "DONE WHEN", "- every line in WHAT EACH PART MUST DO is true", "- every test case above is true", "- the files and names listed above exist", "- the work is committed with the ticket key");

  const acceptance = [...files.map((f) => `${f} exists`), ...Object.entries(man.exports).map(([f, ns]) => `${f} exports ${ns.join(", ")}`), ...must.slice(0, 18).map((m) => cut(m, 200))];
  return { title, summary, body: L.join("\n"), acceptance: [...new Set(acceptance)].slice(0, 28), testCases };
}

/**
 * Turn a folder of phase specs (phase-NN.md + 00-*.md context files) into a groomed board.
 * Per phase:  one epic, then
 *   • one STORY per numbered section of the spec (## 1. `js/lib/catalog.js` …), each with its own acceptance
 *     criteria, the files and exports that section promises (checked when the card is finished) and a pointer to the section,
 *   • a "Write tests" story AFTER the stories (built, unit, navigate, functional, screenshots, regression) when the project has no tests yet,
 *   • a "Phase gate" story that runs the phase's test command and the full verification (pages, screenshots, regression).
 * Stories are chained in document order; the next phase starts after the previous gate. Re-importing is safe: phases that
 * are already split are skipped, and an old one-ticket-per-phase card that nobody has started is replaced.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { expandHome } from "../safety/paths.js";
import type { Card, KanbanBoard } from "./board.js";
import { sectionManifest } from "./verify.js";
import { buildStory } from "./story.js";

export interface Section { num: number; title: string; heading: string; level: number; body: string }

/** Numbered sections of a phase spec. The level of the first numbered heading decides which headings are stories. */
export function parseSections(md: string): Section[] {
  const lines = md.split("\n");
  const heads: { i: number; level: number; text: string; num?: number }[] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^```/.test(l)) fence = !fence;
    if (fence) return;
    const m = /^(#{2,4})\s+(.*)$/.exec(l);
    if (!m) return;
    const n = /^(\d+)\.\s+(.*)$/.exec(m[2]);
    heads.push({ i, level: m[1].length, text: n ? n[2] : m[2], ...(n ? { num: Number(n[1]) } : {}) });
  });
  const first = heads.find((h) => h.num !== undefined);
  if (!first) {   // no numbered sections: every level-2 heading that is not a meta section is a story
    const META = /^(done when|try it|hermes prompt|already provided|goal|test|files to (read|write)|context)\b/i;
    const l2 = heads.filter((h) => h.level === 2);
    const out: Section[] = [];
    l2.forEach((h) => {
      if (META.test(h.text.trim())) return;
      const end = heads.slice(heads.indexOf(h) + 1).find((n) => n.level <= 2)?.i ?? lines.length;
      out.push({ num: out.length + 1, title: h.text.trim(), heading: h.text.trim(), level: 2, body: lines.slice(h.i + 1, end).join("\n").trim() });
    });
    return out;
  }
  const out: Section[] = [];
  heads.forEach((h, k) => {
    if (h.num === undefined || h.level !== first.level) return;
    const end = heads.slice(k + 1).find((n) => n.level <= h.level)?.i ?? lines.length;
    out.push({ num: h.num, title: h.text.trim(), heading: h.text.trim(), level: h.level, body: lines.slice(h.i + 1, end).join("\n").trim() });
  });
  return out;
}

function section(md: string, heading: RegExp): string {
  const lines = md.split("\n");
  const i = lines.findIndex((l) => heading.test(l));
  if (i < 0) return "";
  const out: string[] = [];
  for (const l of lines.slice(i + 1)) { if (/^(##\s|---\s*$)/.test(l)) break; out.push(l); }
  return out.join("\n").trim();
}

const clean = (s: string) => s.replace(/`/g, "").replace(/\s+/g, " ").trim();
const bullet = (l: string) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim();

/** Acceptance criteria for a section: its list items and rule sentences, capped, with exports and files first. */
export function sectionAcceptance(sec: Section, manifest: { files: string[]; exports: Record<string, string[]> }): string[] {
  const out: string[] = [];
  for (const f of manifest.files) out.push(`${f} exists`);
  for (const [f, names] of Object.entries(manifest.exports)) out.push(`${f} exports ${names.join(", ")}`);
  let fence = false;
  for (const raw of sec.body.split("\n")) {
    if (/^```/.test(raw)) { fence = !fence; continue; }
    if (fence) continue;
    const row = /^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/.exec(raw);
    if (row && !/^[-: ]+$/.test(row[2])) out.push(clean(`${row[1]}: ${row[2]}`).slice(0, 220));
    else if (/^\s*(?:[-*+]|\d+[.)])\s+\S/.test(raw)) out.push(clean(bullet(raw)));
    else if (/\b(must|never|exactly|only|always|required?|default|return|throws?)\b/i.test(raw) && raw.trim().length > 25 && raw.trim().length < 240 && !/^\s*[|#>]/.test(raw)) out.push(clean(raw));
  }
  const uniq = [...new Set(out.filter(Boolean))];
  if (uniq.length <= manifest.files.length + Object.keys(manifest.exports).length) {
    const para = sec.body.split(/\n{2,}/).map((p) => clean(p)).find((p) => p.length > 20 && !p.startsWith("```"));
    if (para) uniq.push(para.slice(0, 220));
  }
  return uniq.slice(0, 24);
}

function copyDir(from: string, to: string, filter: (f: string) => boolean = () => true): number {
  let n = 0;
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const src = join(from, f);
    if (!filter(f) || statSync(src).isDirectory()) continue;
    const dst = join(to, f);
    if (!existsSync(dst)) { copyFileSync(src, dst); n++; } // never overwrite work the project already has
  }
  return n;
}

export function importPlan(board: KanbanBoard, o: { planDir: string; projectDir?: string; testsDir?: string; keyPrefix?: string; split?: boolean; board?: string }): string {
  const planDir = resolve(expandHome(o.planDir));
  if (!existsSync(planDir)) return `plan folder not found: ${planDir}`;
  const phases = readdirSync(planDir).filter((f) => /^phase-\d+\.md$/.test(f)).sort();
  if (!phases.length) return `no phase-NN.md files in ${planDir}`;
  const project = o.projectDir ? resolve(expandHome(o.projectDir)) : undefined;
  const notes: string[] = [];
  if (o.board) { const b = board.boards.get(o.board) ?? board.boards.create(o.board); board.boards.use(b.id); notes.push(`board: "${b.name}" (now active)`); }
  let testsProvided = false;
  if (project) {
    mkdirSync(project, { recursive: true });
    const docs = copyDir(planDir, join(project, "docs"), (f) => /^(phase-\d+|00-[\w-]+)\.md$/.test(f));
    notes.push(`copied ${docs} doc file(s) into ${join(project, "docs")}`);
    if (o.testsDir) {
      const tdir = resolve(expandHome(o.testsDir));
      testsProvided = existsSync(tdir);
      notes.push(testsProvided ? `copied ${copyDir(tdir, join(project, "tests"))} test file(s) into ${join(project, "tests")}` : `tests folder not found: ${tdir}`);
    }
  }
  const contextDocs = readdirSync(planDir).filter((f) => /^00-[\w-]+\.md$/.test(f)).map((f) => `docs/${f}`);
  const read = `Read first: ${contextDocs.join(", ")}`;
  const made = new Map<string, string>();     // file -> the ticket that delivers it (so a story can say where to read an imported file)
  for (const c of board.listAll()) for (const f of c.files ?? []) if (c.key) made.set(f, c.key);
  let prevTail: string | undefined;
  let epics = 0, stories = 0, replaced = 0, kept = 0;
  const all = () => board.list();

  for (const file of phases) {
    const md = readFileSync(join(planDir, file), "utf8");
    const num = basename(file, ".md").replace("phase-", "");
    const spec = `docs/${file}`;
    const title = md.split("\n")[0].replace(/^#\s*/, "").trim() || `Phase ${num}`;
    const short = title.replace(/^Phase\s+\d+:\s*/i, "");
    const goal = (md.match(/\*\*Goal:\*\*\s*([\s\S]*?)(?:\n\s*\n|\n\*\*)/)?.[1] ?? "").replace(/\s+/g, " ").trim();
    const testCmd = md.match(/\*\*Test:\*\*\s*`([^`]+)`/)?.[1];
    const secs = parseSections(md);
    const existing = all().filter((c) => c.spec === spec && c.type !== "epic");
    const already = existing.some((c) => c.kind === "story" || c.kind === "gate");
    if (already) { prevTail = existing.find((c) => c.kind === "gate")?.id ?? existing.sort((a, b) => b.created_at - a.created_at)[0]?.id; kept++; continue; }
    // an old one-ticket-per-phase card: replace it when nobody started it, otherwise leave the phase alone
    const legacy = existing.filter((c) => !c.kind);
    if (legacy.some((c) => c.attempts > 0 || (c.commits?.length ?? 0) > 0 || c.status === "done" || c.status === "running")) { prevTail = legacy[0].id; kept++; continue; }
    let epic = all().find((c) => c.spec === spec && c.type === "epic");
    for (const c of legacy) { board.remove(c.id); replaced++; }
    // dependencies that pointed at a removed card now point at this phase's gate (fixed below through prevTail)
    if (!epic) { epic = board.create({ title, type: "epic", body: goal, spec, cwd: project, key_prefix: o.keyPrefix }); epics++; }
    const base = 1000 - Number(num) * 40;
    let order = 0;
    const mk = (p: Parameters<KanbanBoard["create"]>[0]) => board.create({ ...p, parent: epic!.key, spec, cwd: project, key_prefix: o.keyPrefix, priority: base - order++ });
    let prev = prevTail;

    // 2. one story per numbered section, written in plain words with everything a small model needs
    const storyIds: string[] = [], storyInfo: { key: string; label: string; cases: string[] }[] = [];
    secs.forEach((sec, ix) => {
      const man = sectionManifest(sec.heading, sec.body);
      const st = buildStory({ num, phaseShort: short, goal, spec, sec, manifest: man, contextDocs, made, total: secs.length, index: ix + 1 });
      const s1 = mk({ title: st.title, type: "task", kind: "story", section: `${sec.num}. ${clean(sec.heading)}`, summary: st.summary, test_cases: st.testCases,
        depends_on: prev ? [prev] : [], files: man.files, exports: man.exports, acceptance: st.acceptance, body: st.body });
      for (const f of man.files) if (s1.key) made.set(f, s1.key);
      prev = s1.id; storyIds.push(s1.id); storyInfo.push({ key: s1.key!, label: man.files[0] ?? clean(sec.heading), cases: st.testCases }); stories++;
    });

    // 3. tests are written AFTER the stories are built (from the spec and from what was actually built), unless the project already has them
    const testFile = /(tests?\/[\w./-]+\.m?js)/.exec(testCmd ?? "")?.[1];
    const hasTests = testsProvided && !!project && !!testFile && existsSync(join(project, testFile));
    if (testCmd && testFile && !hasTests) {
      const fn = `tests/functional/phase-${num}.functional.json`, MIN = 4;
      const keys = storyInfo.map((x) => x.key);
      // every story key must appear in the title of at least MIN tests: that is how "more test cases for every story" is enforced
      const check = keys.length ? `test -f ${testFile} && grep -q "test(" ${testFile} && for k in ${keys.join(" ")}; do [ "$(grep -c "$k" ${testFile})" -ge ${MIN} ] || { echo "write at least ${MIN} tests for $k: put the key in each test title"; exit 1; }; done` : `test -f ${testFile} && grep -q "test(" ${testFile}`;
      const perStory = storyInfo.map((x) => `### ${x.key} (${x.label})\n${x.cases.map((c, k) => `${k + 1}. ${c}`).join("\n")}`).join("\n\n");
      const t = mk({ title: `Phase ${num} · Write the tests (${storyInfo.length} stories, at least ${MIN} tests each)`, type: "task", kind: "tests", section: "tests",
        summary: `Write ${testFile} and ${fn}: at least ${MIN} tests for each of the ${storyInfo.length} stories of phase ${num}, plus browser steps with screenshots.`,
        depends_on: prev ? [prev] : [], test_cmd: check,
        test_cases: storyInfo.flatMap((x) => x.cases.slice(0, 6).map((c) => `${x.key}: ${c}`)),
        acceptance: [
          `${testFile} exists and every story key (${keys.join(", ")}) appears in the titles of at least ${MIN} tests each`,
          "BUILT: for every story, the files exist and the names are exported exactly as spelled in the story",
          "UNIT: every function is called with a normal input AND with its edge cases (the story's TEST CASES list), and the result is checked",
          "NAVIGATE: every page of this phase opens and its links and assets resolve",
          `FUNCTIONAL: ${fn} holds browser steps (goto, click, fill, expect_text …) that follow the spec's "Try it" / user flows`,
          "SCREENSHOT: the browser steps take a screenshot of each page so the result can be looked at",
          "REGRESSION: the tests of earlier phases still pass (the gate runs them again)",
          "every test passes against what was built; a failing test means a bug to fix in the feature, not in the test"],
        body: [`WHAT TO DO`, `- The ${storyInfo.length} stories of phase ${num} (${short}) are built. Now write the tests.`, "", "FILES TO WRITE", `- ${testFile}   (node:test; run it with: ${testCmd})`, `- ${fn}   (a JSON array of browser steps; use {{base}} in goto urls)`, "",
          "HOW", `1. For EACH story below, write at least ${MIN} tests. Start every test title with the story key, like: test("${keys[0] ?? "PT-1"}: getProductById returns null for an unknown id", ...)`,
          "2. Use the story's TEST CASES as your list. Write one test per line where you can.", "3. Read the real code first (and the spec " + spec + ") so each test checks what the code really exports.",
          "4. Run the tests. They must pass. If one fails, the feature has a bug: fix the feature, do not weaken the test.", `5. Commit with the ticket key first: "<KEY>: tests for phase ${num}".`, "", "TEST CASES PER STORY", perStory].join("\n") });
      prev = t.id; stories++;
    }

    // 4. the gate: whole-phase tests + verification
    const tryIt = section(md, /^##\s+Try it/i);
    const doneWhen = section(md, /^##\s+Done when/i);
    const accept = [...(doneWhen ? doneWhen.split("\n").map((l) => clean(bullet(l))).filter(Boolean) : []), ...(tryIt ? tryIt.split("\n").map((l) => clean(bullet(l))).filter((l) => l.length > 5).slice(0, 6) : [])];
    if (testCmd) accept.push(`\`${testCmd}\` exits 0`);
    if (!accept.length && goal) accept.push(goal);
    const gate = mk({ title: `Phase ${num} · Gate: "${short}" works end to end`, type: "task", kind: "gate", section: "gate",
      depends_on: prev ? [prev] : [], test_cmd: testCmd, acceptance: accept,
      body: `Close phase ${num}. ${read}, ${spec}.\n1) Run \`${testCmd ?? "the phase checks"}\` and fix whatever fails (never edit the frozen tests).\n2) Check every page of this phase in the browser: loads, has content, no console errors, links work.\n3) Append a "Phase ${num}" entry to docs/PROGRESS.md (files created, exports, notes).\n${tryIt ? `4) Walk through the spec's "Try it" steps:\n${tryIt}\n` : ""}${doneWhen ? `\nDone when:\n${doneWhen}` : ""}` });
    prevTail = gate.id; stories++;
    void storyIds;
  }
  // epics were rolled up as cards were added
  return [`Imported ${epics} new phase(s), ${stories} stories/tasks created (${kept} phases already groomed, ${replaced} old one-ticket cards replaced).`, ...notes].join("\n");
}

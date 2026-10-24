import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, dist, story } from "./helpers.mjs";

const D = () => import(dist("kanban/design.js"));

const DESIGN = `# Pocket Notes

A small note-taking web app that works offline.

## 1. Goals
- Users write notes and find them again quickly.
- Everything works without a network (see https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

## 2. Storage
Notes are kept in IndexedDB. Each note has an id, a title, a body and updatedAt.
The app must survive a reload with all notes intact.

## 3. Search
Search matches title and body, case-insensitive, and returns newest first.

## 4. Market history
Paper notebooks were popular in the 1800s. (Background only.)
`;

/** A model that answers each pipeline prompt with the JSON that step expects. */
function fakeChat(log) {
  return async (req) => {
    const u = req.messages[req.messages.length - 1].content;
    log.push(u.slice(0, 60));
    let j;
    if (/This is part \d+ of/.test(u)) j = { summary: "part summary", goals: ["offline notes"], components: [{ name: "store", purpose: "keeps notes" }], requirements: [/Search/.test(u) ? "search is case-insensitive" : "notes survive reload"], constraints: [], technologies: ["IndexedDB"], unknowns: ["IndexedDB transaction API"] };
    else if (/Plan the BUILD/.test(u)) j = { title: "Pocket Notes", summary: "Offline note app.", stack: ["JavaScript", "IndexedDB", "node:test"], test_strategy: "node --test", epics: [{ id: "E1", title: "Storage", goal: "notes persist", sections: [0, 1] }, { id: "E2", title: "Search", goal: "find notes", sections: [2] }] };
    else if (/research questions/.test(u)) j = { questions: [{ q: "How do IndexedDB transactions work?", why: "storage", query: "IndexedDB transaction readwrite" }, { q: "Unanswerable thing?", why: "x", query: "nothing-will-match" }] };
    else if (/Research question:/.test(u)) j = /transaction-spec-pdf/.test(u) || !/"complete"/.test(u)
      ? { answer: "Open a readwrite transaction on the object store; the spec PDF gives the lifetime rules.", facts: ["db.transaction(store, 'readwrite') [SOURCE 1]"], used_sources: [1, 2], complete: true }
      : { answer: "Partly: transactions exist.", facts: [], used_sources: [1], complete: false, next_query: "IndexedDB transaction lifetime spec pdf" };
    else if (/GitHub repository search queries/.test(u)) j = { queries: ["offline notes indexeddb"] };
    else if (/Judge whether the open-source repo/.test(u)) j = /good-notes/.test(u) ? { verdict: "fork", fit: "Same stack, does storage.", covers: ["notes survive reload"], gaps: ["search"], risks: [], how_to_use: "Copy its db.js as js/store.js." } : { verdict: "skip", fit: "Unrelated.", covers: [], gaps: [], risks: [], how_to_use: "" };
    else if (/strict tech lead/.test(u)) j = { issues: [{ id: "E2-S1", problems: ["search order is not tested"] }] };
    else if (/Rewrite each story below/.test(u)) j = { stories: JSON.parse(u.slice(u.indexOf("STORIES AND THEIR PROBLEMS:") + 28)).filter((b) => b.story.id !== "E1-S2").map((b) => ({ ...b.story,
      steps: b.story.steps.length >= 2 ? b.story.steps : [...b.story.steps, "run the check"], acceptance: ["a saved note is listed again after a reload"], test_cases: ["save 'a', reload: 'a' is listed", "two notes come back newest first"] })) };
    else if (/no story covers/.test(u)) j = { stories: [{ id: "E1-G1", epic: "E1", title: "Delete a note", what: "delete", why: "cleanup", depends_on: ["E1-S1"], files: ["js/store.js"], steps: ["add deleteNote", "test it"], acceptance: ["a deleted note is gone after reload"], test_cases: ["delete 'a': list is empty"], check_cmd: "node --test tests/store.test.js", references: [], undo: "", size: "S" }] };
    else if (/The design cites this source/.test(u)) j = { topic: "IndexedDB API", answer: "IndexedDB stores structured data in the browser.", facts: ["asynchronous API"] };
    else if (/EPIC E1/.test(u)) j = { stories: [
      { id: "E1-S1", title: "Create the notes store", what: "IndexedDB store", why: "persist", depends_on: [], files: ["js/store.js"], steps: ["write js/store.js"], acceptance: ["notes survive reload"], test_cases: ["save then load returns the note"], check_cmd: "node --test tests/store.test.js", references: ["https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API"], undo: "delete js/store.js", size: "S" },
      { id: "E1-S2", title: "Load notes on start", what: "load", why: "reload", depends_on: ["E1-S1", "E9-S9", "E1-S3"], files: [], steps: ["call load"], acceptance: [], test_cases: [], check_cmd: "n/a", references: [], undo: "", size: "M" },
      { id: "E1-S2", title: "Duplicate id story", what: "dup", why: "", depends_on: ["E1-S2"], files: [], steps: [], acceptance: ["x"], test_cases: [], check_cmd: "", references: [], undo: "", size: "S" }] };
    else if (/EPIC E2/.test(u)) j = { stories: [{ id: "E2-S1", title: "Search notes", what: "search", why: "find", depends_on: ["E1-S1"], files: ["js/search.js"], steps: ["write search"], acceptance: ["case-insensitive"], test_cases: ["'Milk' finds 'milk'"], check_cmd: "node --test tests/search.test.js", references: [], undo: "", size: "S" }] };
    else if (/Check the story list/.test(u)) j = { gaps: /Delete a note/.test(u) ? [] : ["No story covers deleting notes."] };
    else j = {};
    return { content: JSON.stringify(j) };
  };
}
const fakeDeps = (log = []) => ({
  chat: fakeChat(log),
  search: async (q) => (/nothing-will-match/.test(q) ? { hits: [], source: "", errors: ["duckduckgo: no results", "wikipedia: no results"] }
    : /spec pdf/.test(q) ? { hits: [{ title: "IndexedDB 3.0 spec", url: "https://w3c.example/IndexedDB-3.pdf", snippet: "" }], source: "duckduckgo-lite", errors: ["duckduckgo: captcha"] }
    : { hits: [{ title: "Video", url: "https://www.youtube.com/watch?v=1", snippet: "" }, { title: "Blog", url: "https://someblog.example/idb", snippet: "" }, { title: "IDBTransaction - MDN", url: "https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction", snippet: "" }], source: "duckduckgo", errors: [] }),
  extract: async (url) => (/\.pdf$/.test(url) ? `# PDF: ${url}\nSource: ${url}\n\ntransaction-spec-pdf: a transaction ends when no requests are pending.` : `# Page\nSource: ${url}\n\nSome documentation text about transactions.`),
  contextWindow: 32000,
  probe: async (url) => !/dead\.example/.test(url),
  github: async () => [
    { full_name: "a/good-notes", url: "https://github.com/a/good-notes", clone_url: "https://github.com/a/good-notes.git", description: "", stars: 50, license: "MIT", size_kb: 300, pushed_at: "2026-09-01T00:00:00Z", language: "JavaScript" },
    { full_name: "b/no-license", url: "https://github.com/b/no-license", clone_url: "https://github.com/b/no-license.git", description: "", stars: 900, license: "", size_kb: 10, pushed_at: "2026-01-01T00:00:00Z", language: "JavaScript" },
    { full_name: "c/other", url: "https://github.com/c/other", clone_url: "https://github.com/c/other.git", description: "", stars: 20, license: "GPL-3.0", size_kb: 100, pushed_at: "2025-01-01T00:00:00Z", language: "Go" }],
  clone: async (_u, dest) => { mkdirSync(dest, { recursive: true }); writeFileSync(join(dest, "README.md"), `# ${dest.split("/").pop()}\nOffline notes.`); writeFileSync(join(dest, "package.json"), "{}"); },
  which: (cmd) => cmd !== "cargo",
});

test("design: chunking keeps headings, respects the size, and splits huge blocks", async () => {
  const { chunkDesign } = await D();
  const cs = chunkDesign(DESIGN, 400);
  assert.ok(cs.length >= 2);
  assert.ok(cs.every((c) => c.text.length <= 420));
  assert.match(cs.map((c) => c.heading).join("|"), /Pocket Notes › 2\. Storage/);
  const big = chunkDesign(`# A\n\n${"word ".repeat(400)}\n\n${"more ".repeat(400)}`, 1000);
  assert.ok(big.length >= 2 && big.every((c) => c.text.length <= 1000));
  // code fences do not start sections
  assert.equal(chunkDesign("# T\n```\n# not a heading\n```\ntext", 1000)[0].text.includes("# not a heading"), true);
});

test("design: reads Markdown, HTML and folders", async () => {
  const { readDesign } = await D();
  const dir = mkdtempSync(join(tmpdir(), "design-"));
  writeFileSync(join(dir, "a.md"), "# Alpha\n\ntext a");
  writeFileSync(join(dir, "b.html"), "<html><head><title>Beta</title></head><body><h1>Beta</h1><p>text b</p></body></html>");
  writeFileSync(join(dir, "skip.png"), "x");
  const one = await readDesign(join(dir, "a.md"));
  assert.equal(one.title, "Alpha");
  const all = await readDesign(dir);
  assert.equal(all.files.length, 2);
  assert.match(all.markdown, /text a[\s\S]*text b/);
  await assert.rejects(readDesign(join(dir, "missing.md")), /design not found/);
  await assert.rejects(readDesign("https://example.com/x"), /needs web access/);
});

test("design: page picking, cited links, plan normalising and key prefixes", async () => {
  const { pickPages, pickPdfs, citedUrls, normalizePlan } = await D();
  const picked = pickPages([{ title: "v", url: "https://youtube.com/watch?v=1" }, { title: "b", url: "https://blog.example/x" }, { title: "m", url: "https://developer.mozilla.org/en-US/docs/Web/API/fetch" }], 2);
  assert.deepEqual(picked.map((h) => h.title), ["m", "b"]);
  assert.deepEqual(citedUrls("see https://a.org/x. and (https://b.org/y) and https://a.org/x and https://c.org/pic.png"), ["https://a.org/x", "https://b.org/y"]);
  const s = (id, deps = [], acc = ["ok"]) => ({ id, epic: "E1", title: id, what: "", why: "", depends_on: deps, files: [], steps: [], acceptance: acc, test_cases: [], check_cmd: "", references: [], undo: "", size: "M" });
  const n = normalizePlan([s("A"), s("B", ["A", "C", "Z"], []), s("C", ["B"]), s("A", ["A"])]);
  assert.deepEqual(n.map((x) => x.id), ["A", "B", "C", "A-2"]);
  assert.deepEqual(n[1].depends_on, ["A"]);          // forward (C) and unknown (Z) dependencies are dropped
  assert.deepEqual(n[2].depends_on, ["B"]);
  assert.equal(n[1].acceptance.length, 1);           // filled in
  assert.deepEqual(pickPdfs([{ title: "a", url: "https://x.org/a.pdf" }, { title: "b", url: "https://x.org/b.html" }, { title: "c", url: "https://x.org/c.PDF?dl=1" }], 5).map((h) => h.title), ["a", "c"]);
});

test("design → board: researched draft tickets that only run after approval", async () => {
  const t = await setup();
  try {
    const { designToBoard } = await D();
    const K = t.rt.kanban;
    const src = join(t.work, "design.md"); writeFileSync(src, DESIGN);
    const proj = join(t.work, "proj");
    const log = [], progress = [];
    const before = K.boards.activeId();
    const r = await designToBoard(t.rt, { source: src, project: proj, onProgress: (p) => progress.push(p) }, fakeDeps(log));
    assert.equal(r.stories, 5); assert.equal(r.epics, 2);       // 4 planned + 1 written for the uncovered requirement
    assert.deepEqual(r.gaps, []);                                // the gap story closed it
    assert.deepEqual(r.pdfs, ["https://w3c.example/IndexedDB-3.pdf"]);
    assert.deepEqual(r.priorArt.map((a) => [a.repo, a.verdict]), [["a/good-notes", "fork"], ["c/other", "skip"]]);   // no-license repo never downloaded
    assert.ok(existsSync(join(r.dir, "prior-art", "a__good-notes", "README.md")));
    assert.match(readFileSync(join(r.dir, "prior-art.md"), "utf8"), /GPL-3\.0 is copyleft/);
    // research: the cited MDN page plus one answered question; the unanswerable one is recorded as not answered
    const research = readFileSync(join(r.dir, "research.md"), "utf8");
    assert.match(research, /IDBTransaction - MDN\]\(https:\/\/developer\.mozilla\.org/);
    assert.match(research, /Not answered: no results/);
    assert.match(research, /`IndexedDB transaction readwrite` → `IndexedDB transaction lifetime spec pdf` \(via duckduckgo, duckduckgo-lite\)/);   // a second round
    assert.match(research, /PDFs read: https:\/\/w3c\.example\/IndexedDB-3\.pdf/);
    assert.equal(r.findings, 2);
    assert.ok(existsSync(join(r.dir, "source.md")) && existsSync(join(r.dir, "plan.json")) && existsSync(join(r.dir, "report.md")));
    // the board is a draft, not active, and nothing can be dispatched
    const b = K.boards.get(r.board.id);
    assert.equal(b.draft, true); assert.equal(b.name, "Pocket Notes");
    assert.equal(K.boards.activeId(), before);
    const cards = K.list(undefined, r.board.id);
    assert.ok(cards.every((c) => c.status === "backlog"));
    const features = cards.filter((c) => c.type === "epic").map((c) => c.key).sort();
    assert.deepEqual(features, ["MF001", "MF002"]);
    assert.ok(cards.filter((c) => c.parent === "MF001").every((c) => /^US001\d$/.test(c.key)));
    assert.ok(cards.filter((c) => c.parent === "MF002").every((c) => /^US002\d$/.test(c.key)));
    const s1 = cards.find((c) => c.title === "Create the notes store");
    assert.equal(s1.test_cmd, "node --test tests/store.test.js");
    assert.deepEqual(s1.files, ["js/store.js"]);
    assert.match(s1.body, /CONTEXT CAPSULE[\s\S]*STEPS\n1\. write js\/store\.js[\s\S]*REFERENCES[\s\S]*IndexedDB_API/);
    assert.equal(s1.spec, ".stitap/design/" + r.dir.split("/.stitap/design/")[1] + "/source.md");
    assert.equal(s1.writes_tests, true);
    // the story writes its own test file: a missing test file is a failing check, not "copy the reference tests first"
    mkdirSync(join(proj, "js"), { recursive: true }); writeFileSync(join(proj, "js/store.js"), "export async function saveNote(db, note) { return db.put(note); }\n");
    K.update(s1.key, { status: "ready" });
    const v = await K.complete(s1.key, "user");
    assert.equal(v.passed, false); assert.match(v.detail, /tests failed/); assert.doesNotMatch(v.detail, /missing/);
    K.update(s1.key, { status: "backlog" });
    const s2 = cards.find((c) => c.title === "Load notes on start");
    assert.equal(s2.key, "US0012");
    // the check could not fix it (the model did not rewrite it): flagged for the reviewer, with a comment
    assert.ok(s2.review_flags.some((f) => /fewer than 2 concrete steps/.test(f)));
    assert.match(s2.comments.at(-1).text, /Needs review/);
    const del = cards.find((c) => c.title === "Delete a note");
    assert.equal(del.parent, "MF001"); assert.equal(del.key, "US0014");
    assert.equal(r.fixed >= 1, true);
    assert.deepEqual(s2.depends_on, [s1.id]);           // E9-S9 (unknown) and E1-S3 (unknown) dropped
    assert.equal(s2.test_cmd, undefined);                // "n/a" is not a command
    assert.equal(s2.writes_tests, undefined);
    const search = cards.find((c) => c.title === "Search notes");
    assert.deepEqual(search.depends_on, [s1.id]);        // across epics
    assert.equal(search.review_flags, undefined);        // rewritten by the fix pass: two test cases now
    assert.equal(search.test_cases.length, 2);
    assert.equal(cards.find((c) => c.type === "epic" && /Storage/.test(c.title)).status, "backlog");
    assert.match(cards.find((c) => c.type === "epic" && /Storage/.test(c.title)).body, /a\/good-notes \(fork, MIT\)/);
    assert.ok(progress.some((p) => p.stage === "research") && progress.at(-1).stage === "done");
    // approving one ticket, then the rest
    let a = K.boards.approve(r.board.id, { keys: [s1.key] });
    assert.deepEqual(a.approved, [s1.key]); assert.equal(a.board.draft, true);
    assert.equal(K.boards.activeId(), r.board.id);
    assert.deepEqual(K.ready().map((c) => c.key), [s1.key]);
    assert.throws(() => K.boards.approve(r.board.id, { keys: ["US9999"] }), /not a ticket/);
    a = K.boards.approve(r.board.id);
    assert.equal(a.approved.length, 4); assert.equal(a.board.draft, false);
    assert.equal(K.get(s2.key).status, "ready");
  } finally { await t.close(); }
});

test("design: a model that never returns JSON fails clearly, and a stop request stops the run", async () => {
  const t = await setup();
  try {
    const { designToBoard, outlineChunk } = await D();
    const deps = { ...fakeDeps(), chat: async () => ({ content: "Sure! Here is my answer in prose." }) };
    await assert.rejects(outlineChunk(deps, "T", { index: 0, heading: "h", text: "x" }, 1), /did not return JSON/);
    const src = join(t.work, "d.md"); writeFileSync(src, DESIGN);
    const ctl = new AbortController(); ctl.abort();
    await assert.rejects(designToBoard(t.rt, { source: src, project: join(t.work, "p"), signal: ctl.signal }, fakeDeps()), /stopped/);
  } finally { await t.close(); }
});

test("kanban tool: design runs in the background; approve needs a board", async () => {
  const t = await setup();
  try {
    const { startDesignJob, designJob } = await D();
    const src = join(t.work, "d.md"); writeFileSync(src, DESIGN);
    const job = startDesignJob(t.rt, { source: src, project: join(t.work, "p2") }, fakeDeps());
    assert.throws(() => startDesignJob(t.rt, { source: src, project: join(t.work, "p3") }, fakeDeps()), /already going/);
    for (let i = 0; i < 100 && designJob(t.rt, job.id).status === "running"; i++) await new Promise((r) => setTimeout(r, 20));
    const j = designJob(t.rt, job.id);
    assert.equal(j.status, "done"); assert.equal(j.result.stories, 5);
    const { kanbanTool } = await import(dist("kanban/board.js"));
    const asked = [];
    const ctx = { rt: t.rt, cwd: t.work, session: { source: "web" }, clarify: async (q) => { asked.push(q); return asked.length === 1 ? null : "Approve"; } };
    assert.match(await kanbanTool.handler({ action: "design_status", id: job.id }, ctx), /Board "Pocket Notes" \(draft\): 5 stories in 2 main features/);
    // the agent cannot approve by itself: nobody answering means no approval
    assert.match(await kanbanTool.handler({ action: "approve", board: "Pocket Notes" }, ctx), /Not approved/);
    assert.equal(t.rt.kanban.list("backlog", t.rt.kanban.boards.get("Pocket Notes").id).filter((c) => c.type !== "epic").length, 5);
    assert.match(await kanbanTool.handler({ action: "approve", board: "Pocket Notes" }, ctx), /Approved 5 ticket\(s\)/);
    assert.match(asked[1], /Approve 5 draft ticket\(s\) on "Pocket Notes"/);
  } finally { await t.close(); }
});

test("HTTP: review edits, single and board approval, design job validation", async () => {
  const t = await setup();
  const { startServer } = await import(dist("index.js"));
  const srv = await startServer(t.rt, { port: 0 });
  try {
    const H = { "content-type": "application/json", "x-stitap-token": srv.token };
    const K = t.rt.kanban;
    const b = K.boards.create("Draft X"); K.boards.setDraft(b.id, { draft: true });
    const a = story(K, { title: "A", status: "backlog", board: b.id, key_prefix: "DX" });
    const c = story(K, { title: "B", status: "backlog", board: b.id, key_prefix: "DX" });
    const patch = (key, body) => fetch(`${srv.url}/api/kanban/card/${key}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
    let r = await patch(a.key, { title: "A, edited", acceptance: "first\n\nsecond", depends_on: "", test_cmd: "node --test tests/a.test.js" });
    assert.equal(r.status, 200);
    let got = K.get(a.key);
    assert.equal(got.title, "A, edited"); assert.deepEqual(got.acceptance, ["first", "second"]); assert.equal(got.test_cmd, "node --test tests/a.test.js");
    assert.match(got.comments.at(-1).text, /Edited in review: title, acceptance, test_cmd, depends_on/);
    assert.equal((await patch(c.key, { depends_on: [c.key] })).status, 400);                 // not on itself
    assert.equal((await patch(c.key, { depends_on: ["DX-99"] })).status, 400);               // must exist
    assert.equal((await patch(c.key, { status: "done" })).status, 200);                      // ignored: done is never set by an edit
    assert.equal(K.get(c.key).status, "backlog");
    r = await patch(a.key, { status: "ready" });
    assert.equal(K.get(a.key).status, "ready");
    const sum = await (await fetch(`${srv.url}/api/kanban/board?board=${b.id}`, { headers: H })).json();
    assert.equal(sum.board.draft, true);
    const ap = await (await fetch(`${srv.url}/api/kanban/boards`, { method: "POST", headers: H, body: JSON.stringify({ action: "approve", board: b.id }) })).json();
    assert.deepEqual(ap.approved, [c.key]); assert.equal(ap.board.draft, false); assert.equal(ap.dispatched, 0);
    assert.equal(K.boards.activeId(), b.id);
    const bad = await fetch(`${srv.url}/api/kanban/design`, { method: "POST", headers: H, body: JSON.stringify({ source: "x.md" }) });
    assert.equal(bad.status, 400); assert.match((await bad.json()).error, /project is required/);
    assert.equal((await (await fetch(`${srv.url}/api/kanban/design`, { headers: H })).json()).job === undefined, false);
  } finally { await srv.close(); await t.close(); }
});

test("numbering: MF010 is the 10th main feature, its stories are US0101, US0102 …, bugs BG0101; keys stay unique", async () => {
  const t = await setup();
  try {
    const K = t.rt.kanban;
    let f;
    for (let i = 1; i <= 10; i++) f = K.create({ title: `Feature ${i}`, type: "epic", numbering: "feature" });
    assert.equal(f.key, "MF010");
    const a = K.create({ title: "Design the tables", parent: "MF010" });
    const b = K.create({ title: "Write migrations", parent: "MF010" });
    const bug = K.create({ title: "Index missing", type: "bug", parent: "MF010" });
    assert.deepEqual([a.key, b.key, bug.key], ["US0101", "US0102", "BG0101"]);
    assert.equal(K.create({ title: "First of feature 1", parent: "MF001" }).key, "US0011");
    for (let i = 3; i <= 10; i++) K.create({ title: `s${i}`, parent: "MF010" });
    assert.equal(K.create({ title: "eleventh", parent: "MF010" }).key, "US01011");   // feature digits are fixed, so this still reads as feature 010, story 11
    assert.throws(() => K.create({ title: "plain" }), /needs a main feature: no parent given\. First create the main feature .*Main features on this board: MF\d{3}/);   // no story without its epic
    assert.throws(() => K.create({ title: "orphan", parent: "PT-3" }), /PT-3 is not one/);
    assert.throws(() => K.create({ title: "old style", type: "epic", key_prefix: "PT" }) && K.create({ title: "x", key_prefix: "PT" }), /needs a main feature/);
    assert.throws(() => K.create({ title: "dup", key: "US0101" }), /already used/);
    assert.equal(K.featureNumber("MF010"), "010"); assert.equal(K.featureNumber("PT-3"), null);
    assert.ok(K.boards.link(a.key, "relates to", "US0102"));                           // new keys are valid link targets
  } finally { await t.close(); }
});

test("commit hook: the key must be followed by a separator (US0101 does not accept US01010: …)", async () => {
  const t = await setup();
  try {
    const { execFileSync } = await import("node:child_process");
    const git = (...a) => execFileSync("git", a, { cwd: t.work, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git("init", "-q", "-b", "main"); git("config", "user.email", "t@example.com"); git("config", "user.name", "T");
    writeFileSync(join(t.work, "a.txt"), "1"); git("add", "."); git("commit", "-qm", "init");
    const K = t.rt.kanban;
    K.create({ title: "F", type: "epic", numbering: "feature" });
    const c = K.create({ title: "story", parent: "MF001", cwd: t.work });
    await K.beginGit(c);
    writeFileSync(join(t.work, "a.txt"), "2"); git("add", ".");
    assert.throws(() => git("commit", "-qm", `${c.key}0: wrong ticket`), /must start with the active card key/);
    git("commit", "-qm", `${c.key}: right ticket`);
    await K.endGit(c);
  } finally { await t.close(); }
});

test("story check: rules a reviewer applies, and prior-art selection", async () => {
  const { checkStory, pickRepos, repoSnapshot } = await D();
  const base = { id: "E1-S1", epic: "E1", title: "Add search", what: "search", why: "", depends_on: [], files: ["js/search.js"], steps: ["write it", "test it"], acceptance: ["'milk' finds 'Milk'"], test_cases: ["'milk' → 1 hit", "'' → all notes"], check_cmd: "node --test tests/search.test.js", references: [], undo: "", size: "M" };
  assert.deepEqual(checkStory(base), []);
  const p = checkStory({ ...base, steps: ["x"], acceptance: ["search works properly"], test_cases: [], check_cmd: "cargo test", files: ["/etc/x", "../y"], size: "L" }, (c) => c !== "cargo");
  for (const re of [/fewer than 2/, /not checkable/, /0 test case/, /needs "cargo"/, /\/etc\/x" must be relative/, /\.\.\/y" must be relative/, /too big/]) assert.ok(p.some((x) => re.test(x)), `missing ${re}`);
  assert.match(checkStory({ ...base, check_cmd: "rm -rf build && npm test" }).join(), /destructive/);
  assert.match(checkStory({ ...base, check_cmd: "" }).join(), /no check command/);
  assert.deepEqual(checkStory({ ...base, acceptance: ["responds fast: under 200 ms for 1000 notes"] }), []);   // a number makes "fast" checkable
  const R = (n, lic, stars, kb = 10, archived = false) => ({ full_name: n, url: "", clone_url: "", description: "", stars, license: lic, size_kb: kb, pushed_at: "", language: "", archived });
  assert.deepEqual(pickRepos([R("a", "MIT", 5), R("b", "", 999), R("c", "NOASSERTION", 50), R("d", "Apache-2.0", 70), R("e", "MIT", 80, 999_999), R("f", "MIT", 90, 10, true), R("A", "MIT", 5)], 3, 200).map((r) => r.full_name), ["d", "a"]);
  const dir = mkdtempSync(join(tmpdir(), "repo-"));
  mkdirSync(join(dir, "src")); mkdirSync(join(dir, "node_modules")); mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, "README.md"), "# Repo\nDoes notes."); writeFileSync(join(dir, "package.json"), '{"name":"r"}'); writeFileSync(join(dir, "src", "db.js"), "x"); writeFileSync(join(dir, "node_modules", "junk.js"), "x");
  const snap = repoSnapshot(dir);
  assert.match(snap, /FILES \(3\): README\.md, package\.json, src\/db\.js/);
  assert.match(snap, /MANIFEST package\.json:\n\{"name":"r"\}/); assert.match(snap, /README:\n# Repo/);
});

test("while a design run is going, a chat cannot build its own plan next to it", async () => {
  const t = await setup();
  try {
    const { startDesignJob, stopDesignJob, describeJob } = await D();
    let release; const gate = new Promise((r) => (release = r));
    const deps = { ...fakeDeps(), chat: async (...x) => { await gate; return fakeDeps().chat(...x); } };
    const src = join(t.work, "d.md"); writeFileSync(src, DESIGN);
    const proj = join(t.work, "p9");
    const job = startDesignJob(t.rt, { source: src, project: proj }, deps);
    const { kanbanTool } = await import(dist("kanban/board.js"));
    const ctx = { rt: t.rt, cwd: t.work, session: { source: "web" }, clarify: async () => "Approve" };
    assert.match(describeJob(job), /STILL RUNNING[\s\S]*End your turn now/);
    for (const action of ["board_new", "create", "import", "approve", "dispatch"]) assert.match(await kanbanTool.handler({ action, name: "Phase 07", title: "x", path: t.work }, ctx), /Refused: design run/, action);
    assert.match(await kanbanTool.handler({ action: "boards" }, ctx), /Main/);   // reading is fine
    const { writeFileTool } = await import(dist("tools/files.js"));
    const wctx = { ...ctx, cwd: proj, setCwd() {}, signal: new AbortController().signal, progress() {}, requestApproval: async () => true, depth: 0 };
    await assert.rejects(writeFileTool.handler({ path: join(proj, "index.html"), content: "<h1>x</h1>" }, wctx), /design run is building/);
    stopDesignJob(job.id); release();
    for (let i = 0; i < 100 && job.status === "running"; i++) await new Promise((r) => setTimeout(r, 20));
    assert.notEqual(job.status, "running");
    assert.doesNotMatch(await kanbanTool.handler({ action: "board_new", name: "After" }, ctx), /Refused/);
  } finally { await t.close(); }
});

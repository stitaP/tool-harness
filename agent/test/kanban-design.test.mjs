import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, dist } from "./helpers.mjs";

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
    else if (/Research question:/.test(u)) j = { answer: "Open a readwrite transaction on the object store.", facts: ["db.transaction(store, 'readwrite') [SOURCE 1]"], used_sources: [1] };
    else if (/The design cites this source/.test(u)) j = { topic: "IndexedDB API", answer: "IndexedDB stores structured data in the browser.", facts: ["asynchronous API"] };
    else if (/EPIC E1/.test(u)) j = { stories: [
      { id: "E1-S1", title: "Create the notes store", what: "IndexedDB store", why: "persist", depends_on: [], files: ["js/store.js"], steps: ["write js/store.js"], acceptance: ["notes survive reload"], test_cases: ["save then load returns the note"], check_cmd: "node --test tests/store.test.js", references: ["https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API"], undo: "delete js/store.js", size: "S" },
      { id: "E1-S2", title: "Load notes on start", what: "load", why: "reload", depends_on: ["E1-S1", "E9-S9", "E1-S3"], files: [], steps: ["call load"], acceptance: [], test_cases: [], check_cmd: "n/a", references: [], undo: "", size: "M" },
      { id: "E1-S2", title: "Duplicate id story", what: "dup", why: "", depends_on: ["E1-S2"], files: [], steps: [], acceptance: ["x"], test_cases: [], check_cmd: "", references: [], undo: "", size: "S" }] };
    else if (/EPIC E2/.test(u)) j = { stories: [{ id: "E2-S1", title: "Search notes", what: "search", why: "find", depends_on: ["E1-S1"], files: ["js/search.js"], steps: ["write search"], acceptance: ["case-insensitive"], test_cases: ["'Milk' finds 'milk'"], check_cmd: "node --test tests/search.test.js", references: [], undo: "", size: "S" }] };
    else if (/Check the story list/.test(u)) j = { gaps: ["No story covers deleting notes."] };
    else j = {};
    return { content: JSON.stringify(j) };
  };
}
const fakeDeps = (log = []) => ({
  chat: fakeChat(log),
  search: async (q) => (/nothing-will-match/.test(q) ? { hits: [], source: "", errors: ["duckduckgo: no results", "wikipedia: no results"] }
    : { hits: [{ title: "Video", url: "https://www.youtube.com/watch?v=1", snippet: "" }, { title: "Blog", url: "https://someblog.example/idb", snippet: "" }, { title: "IDBTransaction - MDN", url: "https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction", snippet: "" }], source: "duckduckgo", errors: [] }),
  extract: async (url) => `# Page\nSource: ${url}\n\nSome documentation text about transactions.`,
  contextWindow: 32000,
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
  const { pickPages, citedUrls, normalizePlan, keyPrefixFor } = await D();
  const picked = pickPages([{ title: "v", url: "https://youtube.com/watch?v=1" }, { title: "b", url: "https://blog.example/x" }, { title: "m", url: "https://developer.mozilla.org/en-US/docs/Web/API/fetch" }], 2);
  assert.deepEqual(picked.map((h) => h.title), ["m", "b"]);
  assert.deepEqual(citedUrls("see https://a.org/x. and (https://b.org/y) and https://a.org/x and https://c.org/pic.png"), ["https://a.org/x", "https://b.org/y"]);
  const s = (id, deps = [], acc = ["ok"]) => ({ id, epic: "E1", title: id, what: "", why: "", depends_on: deps, files: [], steps: [], acceptance: acc, test_cases: [], check_cmd: "", references: [], undo: "", size: "M" });
  const n = normalizePlan([s("A"), s("B", ["A", "C", "Z"], []), s("C", ["B"]), s("A", ["A"])]);
  assert.deepEqual(n.map((x) => x.id), ["A", "B", "C", "A-2"]);
  assert.deepEqual(n[1].depends_on, ["A"]);          // forward (C) and unknown (Z) dependencies are dropped
  assert.deepEqual(n[2].depends_on, ["B"]);
  assert.equal(n[1].acceptance.length, 1);           // filled in
  assert.equal(keyPrefixFor("The Agentic Phone", new Set(["PT"])), "TAP");
  assert.equal(keyPrefixFor("Pocket Notes", new Set(["PN"])), "PN2");
  assert.equal(keyPrefixFor("x", new Set()), "XDS".slice(0, 2) === "XD" ? "XD" : "X");
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
    assert.equal(r.stories, 4); assert.equal(r.epics, 2);
    assert.deepEqual(r.gaps, ["No story covers deleting notes."]);
    // research: the cited MDN page plus one answered question; the unanswerable one is recorded as not answered
    const research = readFileSync(join(r.dir, "research.md"), "utf8");
    assert.match(research, /IDBTransaction - MDN\]\(https:\/\/developer\.mozilla\.org/);
    assert.match(research, /Not answered: no results/);
    assert.equal(r.findings, 2);
    assert.ok(existsSync(join(r.dir, "source.md")) && existsSync(join(r.dir, "plan.json")) && existsSync(join(r.dir, "report.md")));
    // the board is a draft, not active, and nothing can be dispatched
    const b = K.boards.get(r.board.id);
    assert.equal(b.draft, true); assert.equal(b.name, "Pocket Notes");
    assert.equal(K.boards.activeId(), before);
    const cards = K.list(undefined, r.board.id);
    assert.ok(cards.every((c) => c.status === "backlog"));
    assert.ok(cards.every((c) => c.key.startsWith("PN-")));
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
    assert.deepEqual(s2.depends_on, [s1.id]);           // E9-S9 (unknown) and E1-S3 (unknown) dropped
    assert.equal(s2.test_cmd, undefined);                // "n/a" is not a command
    assert.equal(s2.writes_tests, undefined);
    const search = cards.find((c) => c.title === "Search notes");
    assert.deepEqual(search.depends_on, [s1.id]);        // across epics
    assert.equal(cards.find((c) => c.type === "epic" && /Storage/.test(c.title)).status, "backlog");
    assert.match(cards.find((c) => c.type === "epic" && /Storage/.test(c.title)).comments.map((x) => x.text).join(), /deleting notes/);
    assert.ok(progress.some((p) => p.stage === "research") && progress.at(-1).stage === "done");
    // approving one ticket, then the rest
    let a = K.boards.approve(r.board.id, { keys: [s1.key] });
    assert.deepEqual(a.approved, [s1.key]); assert.equal(a.board.draft, true);
    assert.equal(K.boards.activeId(), r.board.id);
    assert.deepEqual(K.ready().map((c) => c.key), [s1.key]);
    assert.throws(() => K.boards.approve(r.board.id, { keys: ["PN-999"] }), /not a ticket/);
    a = K.boards.approve(r.board.id);
    assert.equal(a.approved.length, 3); assert.equal(a.board.draft, false);
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
    assert.equal(j.status, "done"); assert.equal(j.result.stories, 4);
    const { kanbanTool } = await import(dist("kanban/board.js"));
    const ctx = { rt: t.rt, cwd: t.work, session: { source: "web" } };
    assert.match(await kanbanTool.handler({ action: "design_status", id: job.id }, ctx), /Board "Pocket Notes" \(draft\): 4 stories/);
    assert.match(await kanbanTool.handler({ action: "approve", board: "Pocket Notes" }, ctx), /Approved 4 ticket\(s\)/);
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
    const a = K.create({ title: "A", status: "backlog", board: b.id, key_prefix: "DX" });
    const c = K.create({ title: "B", status: "backlog", board: b.id, key_prefix: "DX" });
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

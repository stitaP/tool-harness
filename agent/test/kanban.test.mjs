import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, dist } from "./helpers.mjs";

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const repo = (cwd) => { git(cwd, "init", "-q", "-b", "main"); git(cwd, "config", "user.email", "t@example.com"); git(cwd, "config", "user.name", "T"); writeFileSync(join(cwd, "a.txt"), "1"); git(cwd, "add", "."); git(cwd, "commit", "-qm", "init"); };

test("kanban: keys, types, history, threaded comments, lookup by key", async () => {
  const t = await setup();
  try {
    const K = t.rt.kanban;
    const epic = K.create({ title: "Phase 1", type: "epic" });
    const a = K.create({ title: "Do A", parent: epic.key, acceptance: ["A works"] });
    const b = K.create({ title: "Do B", depends_on: [a.key] });
    assert.deepEqual([epic.key, a.key, b.key], ["PT-1", "PT-2", "PT-3"]);
    assert.equal(K.get("pt-2").id, a.id);
    assert.equal(b.depends_on[0], a.id);
    assert.deepEqual(K.ready().map((c) => c.key), ["PT-2"]); // epic never dispatched; B waits for A
    K.update(a.key, { status: "blocked" }, { by: "me", reason: "waiting" });
    const h = K.get(a.key).history;
    assert.deepEqual(h.map((x) => x.to), ["ready", "blocked"]);
    assert.equal(h[1].by, "me");
    const c1 = K.comment(a.key, "why blocked?", "user").comments[0];
    const c2 = K.comment(a.key, "needs the API", "agent", c1.id).comments[1];
    assert.equal(c2.reply_to, c1.id);
    assert.throws(() => K.comment(a.key, "x", "agent", "nope"), /no comment/);
    assert.equal(K.get(epic.key).status, "blocked"); // epic rolls up from its children
    assert.match(K.show(a.key), /↳ .* agent: needs the API/);
  } finally { await t.close(); }
});

test("kanban: git link records commits by key and reports the branch", async () => {
  const t = await setup();
  try {
    repo(t.work);
    const K = t.rt.kanban;
    const c = K.create({ title: "Feature", cwd: t.work });
    writeFileSync(join(t.work, "b.txt"), "x"); git(t.work, "add", "."); git(t.work, "commit", "-qm", `${c.key}: add b`);
    writeFileSync(join(t.work, "c.txt"), "x"); git(t.work, "add", "."); git(t.work, "commit", "-qm", "unrelated");
    assert.equal(await K.syncCommits(c.key), 1);
    assert.equal(await K.syncCommits(c.key), 0); // idempotent
    const got = K.get(c.key).commits;
    assert.equal(got.length, 1);
    assert.match(got[0].message, /PT-1: add b/);
    assert.throws(() => K.linkCommit(c.key, { hash: "zzz" }), /not a commit hash/);
  } finally { await t.close(); }
});

test("kanban: tests gate done; a failing run requeues, then blocks after max attempts", async () => {
  const t = await setup("kanban:\n  max_attempts: 2\n  enforce_commit_keys: false\n");
  try {
    repo(t.work);
    const K = t.rt.kanban;
    const c = K.create({ title: "Make file", cwd: t.work, test_cmd: "test -f done.txt" });
    let r = await K.work(c.key);
    assert.equal(r.status, "ready"); // judge said done, tests said no
    assert.notEqual(r.test_result.code, 0);
    assert.match(K.get(c.key).comments.map((x) => x.text).join("\n"), /Tests failed/);
    r = await K.work(c.key);
    assert.equal(r.status, "blocked"); // attempts exhausted
    writeFileSync(join(t.work, "done.txt"), "ok");
    const v = await K.complete(c.key);
    assert.equal(v.passed, true);
    assert.equal(K.get(c.key).status, "done");
    assert.equal(K.get(c.key).test_result.code, 0);
  } finally { await t.close(); }
});

test("kanban: manual update to done runs the tests first (tool)", async () => {
  const t = await setup();
  try {
    const K = t.rt.kanban;
    const c = K.create({ title: "T", cwd: t.work, test_cmd: "test -f ok.txt" });
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    const tool = t.rt.tools.get("kanban");
    const ctx = t.rt.toolContext(s.id, undefined, "yolo");
    assert.match(await tool.handler({ action: "update", id: c.key, status: "done" }, ctx), /ready|tests failed/);
    assert.notEqual(K.get(c.key).status, "done");
    writeFileSync(join(t.work, "ok.txt"), "1");
    assert.match(await tool.handler({ action: "update", id: c.key, status: "done" }, ctx), /tests passed/);
    assert.equal(K.get(c.key).status, "done");
  } finally { await t.close(); }
});

test("kanban: cards missing their test files are blocked, not worked", async () => {
  const t = await setup();
  try {
    const K = t.rt.kanban;
    const c = K.create({ title: "P", cwd: t.work, test_cmd: "node --test tests/phase-01.test.js" });
    const r = await K.work(c.key);
    assert.equal(r.status, "blocked");
    assert.equal(r.attempts, 0);
    assert.match(K.get(c.key).comments.at(-1).text, /test file\(s\) missing: tests\/phase-01\.test\.js/);
  } finally { await t.close(); }
});

test("kanban: recover() requeues cards left running by a crash and keeps their notes", async () => {
  const t = await setup("kanban:\n  max_attempts: 2\n");
  try {
    const K = t.rt.kanban;
    const a = K.create({ title: "A" }); const b = K.create({ title: "B" });
    K.update(a.key, { status: "running", attempts: 1 });
    K.update(b.key, { status: "running", attempts: 2 });
    const out = K.recover();
    assert.equal(out.length, 2);
    assert.equal(K.get(a.key).status, "ready");
    assert.equal(K.get(b.key).status, "blocked");
    assert.match(K.get(a.key).comments[0].text, /Interrupted by a restart/);
    assert.equal(K.recover().length, 0);
  } finally { await t.close(); }
});

test("kanban: worker installs the commit hook that enforces the card key, and removes the marker after", async () => {
  const t = await setup();
  try {
    repo(t.work);
    const K = t.rt.kanban;
    const c = K.create({ title: "Hooked", cwd: t.work });
    await K.beginGit(K.get(c.key));
    const gd = join(t.work, ".git");
    assert.ok(existsSync(join(gd, "hooks", "commit-msg")));
    writeFileSync(join(t.work, "x.txt"), "1"); git(t.work, "add", ".");
    assert.throws(() => execFileSync("git", ["commit", "-qm", "no key"], { cwd: t.work, stdio: "pipe" }), /Command failed/);
    git(t.work, "commit", "-qm", `${c.key}: with key`);
    assert.ok(K.get(c.key).checkpoint.head);
    assert.equal(K.get(c.key).branch, "main");
    await K.endGit(K.get(c.key));
    assert.equal(existsSync(join(gd, "stitap-card")), false);
    assert.equal(K.get(c.key).commits.length, 1);
  } finally { await t.close(); }
});

test("kanban: regression reopens a failing done card and files one linked bug", async () => {
  const t = await setup();
  try {
    const K = t.rt.kanban;
    writeFileSync(join(t.work, "ok.txt"), "1");
    const c = K.create({ title: "Stable", cwd: t.work, test_cmd: "test -f ok.txt" });
    K.update(c.key, { status: "done" });
    assert.match(await K.regression(), /PT-1 ok/);
    writeFileSync(join(t.work, "ok.txt"), "1"); execFileSync("rm", [join(t.work, "ok.txt")]);
    const out = await K.regression();
    assert.match(out, /FAILED → reopened, bug PT-2/);
    assert.equal(K.get(c.key).status, "ready");
    const bug = K.get("PT-2");
    assert.equal(bug.type, "bug");
    assert.deepEqual(bug.links, ["PT-1"]);
    assert.equal(bug.test_cmd, c.test_cmd);
    K.update(c.key, { status: "done" });
    await K.regression(c.key);
    assert.equal(K.list().filter((x) => x.type === "bug").length, 1); // no duplicate bug
  } finally { await t.close(); }
});

test("kanban: import turns phase specs into chained epics and tasks and copies docs and tests", async () => {
  const t = await setup();
  try {
    const plan = mkdtempSync(join(tmpdir(), "plan-")); const tests = mkdtempSync(join(tmpdir(), "tests-"));
    writeFileSync(join(plan, "00-context.md"), "ctx");
    writeFileSync(join(plan, "phase-00.md"), "# Phase 00: Scaffold\n\n**Goal:** folders and config.\n**Test:** `node --test tests/phase-00.test.js`\n\n## Done when\n- folders exist\n- package.json is ESM\n");
    writeFileSync(join(plan, "phase-01.md"), "# Phase 01: CSS\n\n**Goal:** tokens and base styles.\n\n**Test:** `node --test tests/phase-01.test.js`\n");
    writeFileSync(join(tests, "phase-00.test.js"), "//"); writeFileSync(join(tests, "phase-01.test.js"), "//");
    const proj = mkdtempSync(join(tmpdir(), "proj-"));
    const K = t.rt.kanban;
    const { importPlan } = await import(dist("kanban/plan.js"));
    const msg = importPlan(K, { planDir: plan, projectDir: proj, testsDir: tests, keyPrefix: "SH" });
    assert.match(msg, /Imported 2 new phase/);
    assert.ok(existsSync(join(proj, "docs", "phase-00.md")) && existsSync(join(proj, "docs", "00-context.md")) && existsSync(join(proj, "tests", "phase-01.test.js")));
    const tasks = K.list().filter((c) => c.type === "task").sort((a, b) => b.priority - a.priority);
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].test_cmd, "node --test tests/phase-00.test.js");
    assert.deepEqual(tasks[0].acceptance, ["folders exist", "package.json is ESM", "`node --test tests/phase-00.test.js` exits 0"]);
    assert.equal(tasks[0].spec, "docs/phase-00.md");
    assert.match(tasks[0].key, /^SH-\d+$/);
    assert.deepEqual(tasks[1].depends_on, [tasks[0].id]);
    assert.deepEqual(K.ready().map((c) => c.id), [tasks[0].id]); // phase 01 waits for phase 00
    assert.equal(K.list().filter((c) => c.type === "epic").length, 2);
    assert.match(importPlan(K, { planDir: plan, projectDir: proj }), /Imported 0 phase\(s\) \(2 already/); // idempotent
    assert.match(K.get(tasks[0].id).body, /docs\/00-context\.md, docs\/phase-00\.md/);
  } finally { await t.close(); }
});

test("kanban: worker prompt carries spec, acceptance, test rule, key rule and resume context", async () => {
  const t = await setup();
  try {
    repo(t.work);
    const K = t.rt.kanban;
    const c = K.create({ title: "Cart", cwd: t.work, spec: "docs/phase-09.md", acceptance: ["cart works"], test_cmd: "true" });
    await K.work(c.key);
    const workerReq = () => JSON.stringify(t.mock.requests.filter((r) => JSON.stringify(r.messages).includes("Kanban card PT-1")).at(-1).messages);
    const first = workerReq();
    assert.match(first, /Specification file: docs\/phase-09\.md/);
    assert.match(first, /Acceptance criteria/);
    assert.match(first, /never write, edit or delete files under tests\//);
    assert.match(first, /must start with \\"PT-1\\"/);
    K.update(c.key, { status: "ready" }); // simulate a re-queue
    t.mock.reset();
    await K.work(c.key);
    assert.match(workerReq(), /resumed card \(attempt 2\)/);
  } finally { await t.close(); }
});

test("kanban dashboard: board summary, card detail and evidence access (no path traversal)", async () => {
  const t = await setup();
  try {
    const { boardSummary, cardDetail, evidenceFile } = await import(dist("kanban/dashboard.js"));
    const K = t.rt.kanban;
    const e = K.create({ title: "Phase 01", type: "epic", cwd: t.work });
    const a = K.create({ title: "A", parent: e.key, cwd: t.work }); const b = K.create({ title: "B", parent: e.key, cwd: t.work, depends_on: [a.key] });
    K.update(a.key, { status: "done" });
    const s = boardSummary(t.rt);
    assert.equal(s.total, 2);
    assert.equal(s.counts.done, 1);
    assert.deepEqual(s.epics.map((x) => [x.key, x.done, x.total]), [[e.key, 1, 2]]);
    assert.deepEqual(s.cards.find((c) => c.key === b.key).depends_on, [a.key]);
    mkdirSync(join(t.work, ".stitap", "evidence", a.key), { recursive: true });
    writeFileSync(join(t.work, ".stitap", "evidence", a.key, "home.png"), "PNG");
    writeFileSync(join(t.work, "secret.png"), "NO");
    assert.deepEqual(cardDetail(t.rt, a.key).evidence.shots, ["home.png"]);
    assert.equal(evidenceFile(t.rt, a.key, "home.png").type, "image/png");
    assert.equal(evidenceFile(t.rt, a.key, "../../../secret.png"), null);   // outside the evidence folder
    assert.equal(evidenceFile(t.rt, a.key, "../../../package.json"), null);
    assert.equal(evidenceFile(t.rt, "PT-99", "home.png"), null);
    assert.equal(cardDetail(t.rt, "PT-99"), null);
  } finally { await t.close(); }
});

test("kanban import accepts ~ paths (agents write ~/Documents/…)", async () => {
  const t = await setup();
  try {
    const { homedir } = await import("node:os"); const { importPlan } = await import(dist("kanban/plan.js"));
    const rel = join("stitap-tilde-test", String(Date.now()));
    const plan = join(homedir(), ".cache", rel, "plan"), proj = join(homedir(), ".cache", rel, "proj");
    mkdirSync(plan, { recursive: true });
    writeFileSync(join(plan, "phase-00.md"), "# Phase 00: Scaffold\n\n**Goal:** folders.\n**Test:** `true`\n");
    try {
      const msg = importPlan(t.rt.kanban, { planDir: `~/.cache/${rel}/plan`, projectDir: `~/.cache/${rel}/proj` });
      assert.match(msg, /Imported 1 new phase/);
      assert.ok(existsSync(join(proj, "docs", "phase-00.md")));
      assert.equal(t.rt.kanban.cwdOf(t.rt.kanban.list().find((c) => c.type === "task")).startsWith(homedir()), true);
    } finally { (await import("node:fs")).rmSync(join(homedir(), ".cache", "stitap-tilde-test"), { recursive: true, force: true }); }
  } finally { await t.close(); }
});

test("agent turn: a model that prints <function=kanban> XML as text still runs the kanban import", async () => {
  const t = await setup("approvals:\n  mode: yolo\n");
  try {
    const plan = mkdtempSync(join(tmpdir(), "plan-")); const proj = mkdtempSync(join(tmpdir(), "proj-"));
    for (const n of ["00", "01"]) writeFileSync(join(plan, `phase-${n}.md`), `# Phase ${n}: Thing ${n}\n\n**Goal:** goal ${n}.\n**Test:** \`true\`\n`);
    const s = t.rt.createSession({ source: "web", cwd: proj });
    t.mock.script([
      { content: `Importing now.\n<function=kanban>\n<parameter=action>\nimport\n</parameter>\n<parameter=path>\n${plan}\n</parameter>\n<parameter=project>\n${proj}\n</parameter>\n<parameter=key_prefix>\nPT\n</parameter>\n</function>\n</tool_call>` },
      { content: "Imported both phases." },
    ]);
    await t.rt.send(s.id, "set up the board", { source: "web", approvalMode: "yolo" }); await t.rt.waitIdle(s.id);
    const msgs = t.rt.db.getMessages(s.id);
    const tool = msgs.find((m) => m.role === "tool" && m.name === "kanban");
    assert.ok(tool, "the kanban tool ran");
    assert.match(tool.content, /Imported 2 new phase/);
    assert.equal(t.rt.kanban.list().filter((c) => c.type === "epic").length, 2);
    assert.ok(existsSync(join(proj, "docs", "phase-01.md")));
    assert.doesNotMatch(msgs.filter((m) => m.role === "assistant").map((m) => m.content).join("\n"), /<function=|<\/tool_call>/);   // markup is not shown as chat text
  } finally { await t.close(); }
});

const PHASE3 = `# Phase 03: Catalog

**Goal:** product helpers.
**Test:** \`node --test tests/phase-03.test.js\`

## 1. \`js/lib/catalog.js\`
Every function that takes \`list\` uses \`list = products\` as the default parameter.

| Function | Behaviour |
|---|---|
| \`getProductById(id, list)\` | the product or \`null\` |
| \`minPrice(product)\` | lowest variant \`price\` |

## 2. \`js/lib/cart.js\`
\`\`\`js
export const MAX_QTY = 10;
export function createCart(storage) {}
\`\`\`
- adding more than MAX_QTY clamps to MAX_QTY
- remove(id) deletes the line

### \`calculateTotals(items)\`
Shipping is free above 499.

## Done when
- all helpers behave as listed

## Try it
Open shop.html and add a product.

## Hermes prompt
> ignore
`;

test("kanban import: a phase becomes stories per spec section, then tests AFTER the stories, then a gate", async () => {
  const t = await setup();
  try {
    const plan = mkdtempSync(join(tmpdir(), "plan-")); const proj = mkdtempSync(join(tmpdir(), "proj-"));
    writeFileSync(join(plan, "phase-03.md"), PHASE3);
    const K = t.rt.kanban;
    const { importPlan, parseSections } = await import(dist("kanban/plan.js"));
    assert.deepEqual(parseSections(PHASE3).map((s) => [s.num, s.heading]), [[1, "`js/lib/catalog.js`"], [2, "`js/lib/cart.js`"]]);
    assert.match(parseSections(PHASE3)[1].body, /calculateTotals/);                      // ### sub-headings stay inside their story
    importPlan(K, { planDir: plan, projectDir: proj });
    const cards = K.list().filter((c) => c.type !== "epic").sort((a, b) => b.priority - a.priority);
    assert.deepEqual(cards.map((c) => c.kind), ["story", "story", "tests", "gate"]);       // tests come AFTER development
    const [s1, s2, tests, gate] = cards;
    assert.equal(s1.depends_on.length, 0);
    assert.deepEqual([s2, tests, gate].map((c, i) => c.depends_on[0] === cards[i].id), [true, true, true]);   // strict chain
    assert.deepEqual(s1.files, ["js/lib/catalog.js"]);
    assert.deepEqual(s1.exports, { "js/lib/catalog.js": ["getProductById", "minPrice"] });   // table rows name the functions
    assert.ok(s1.acceptance.includes("getProductById(id, list): the product or null"));
    assert.deepEqual(s2.exports["js/lib/cart.js"].sort(), ["MAX_QTY", "calculateTotals", "createCart"]);
    assert.ok(s2.acceptance.includes("adding more than MAX_QTY clamps to MAX_QTY"));
    assert.equal(gate.test_cmd, "node --test tests/phase-03.test.js");
    assert.ok(gate.acceptance.includes("all helpers behave as listed") && gate.acceptance.some((a) => /Open shop\.html/.test(a)));
    assert.match(tests.title, /built, unit, navigate, functional, screenshots, regression/);
    assert.ok(tests.acceptance.some((a) => /tests\/functional\/phase-03\.functional\.json/.test(a)));
    assert.deepEqual(K.ready().map((c) => c.id), [s1.id]);
    assert.equal(K.get(cards[0].parent).type, "epic");
  } finally { await t.close(); }
});

test("kanban stories are finished by a file/export check, not by the whole-phase tests", async () => {
  const t = await setup();
  try {
    const plan = mkdtempSync(join(tmpdir(), "plan-")); const proj = mkdtempSync(join(tmpdir(), "proj-"));
    writeFileSync(join(plan, "phase-03.md"), PHASE3);
    const K = t.rt.kanban; const { importPlan } = await import(dist("kanban/plan.js"));
    importPlan(K, { planDir: plan, projectDir: proj });
    const s1 = K.list().filter((c) => c.kind === "story").sort((a, b) => b.priority - a.priority)[0];
    K.update(s1.key, { status: "running", attempts: 1 });
    let v = await K.complete(s1.key);
    assert.equal(v.passed, false); assert.match(v.detail, /missing files: js\/lib\/catalog\.js/);
    mkdirSync(join(proj, "js/lib"), { recursive: true });
    writeFileSync(join(proj, "js/lib/catalog.js"), "export function getProductById() {}\n");
    v = await K.complete(s1.key); assert.match(v.detail, /does not export: minPrice/);
    writeFileSync(join(proj, "js/lib/catalog.js"), "export function getProductById() {}\nexport const minPrice = () => 0;\n");
    v = await K.complete(s1.key);
    assert.equal(v.passed, true); assert.equal(K.get(s1.key).status, "done");   // no browser verification for a story
    assert.equal(K.get(s1.key).verification, undefined);
  } finally { await t.close(); }
});

test("kanban import: an old one-ticket-per-phase board is regroomed in place; started phases are left alone; re-import is a no-op", async () => {
  const t = await setup();
  try {
    const plan = mkdtempSync(join(tmpdir(), "plan-")); const proj = mkdtempSync(join(tmpdir(), "proj-"));
    writeFileSync(join(plan, "phase-03.md"), PHASE3);
    writeFileSync(join(plan, "phase-04.md"), PHASE3.replace("Phase 03: Catalog", "Phase 04: Other"));
    const K = t.rt.kanban; const { importPlan } = await import(dist("kanban/plan.js"));
    for (const n of ["03", "04"]) { const e = K.create({ title: `Phase ${n}`, type: "epic", spec: `docs/phase-${n}.md`, cwd: proj }); K.create({ title: `Implement Phase ${n}`, parent: e.key, spec: `docs/phase-${n}.md`, cwd: proj, test_cmd: "true" }); }
    const started = K.list().find((c) => c.title === "Implement Phase 04"); K.update(started.key, { attempts: 1, status: "blocked" });
    const msg = importPlan(K, { planDir: plan, projectDir: proj });
    assert.match(msg, /1 old one-ticket cards replaced/); assert.match(msg, /1 phases already groomed/);
    assert.equal(K.list().filter((c) => c.spec === "docs/phase-03.md" && c.type === "epic").length, 1);   // the epic was reused
    assert.deepEqual(K.list().filter((c) => c.spec === "docs/phase-03.md" && c.type !== "epic").map((c) => c.kind).sort(), ["gate", "story", "story", "tests"]);
    assert.ok(K.get(started.key));                                                                         // the started card survived
    const before = K.list().length;
    importPlan(K, { planDir: plan, projectDir: proj });
    assert.equal(K.list().length, before);
  } finally { await t.close(); }
});

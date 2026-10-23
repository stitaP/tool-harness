import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setup, dist } from "./helpers.mjs";

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const repo = (cwd) => { git(cwd, "init", "-q", "-b", "main"); git(cwd, "config", "user.email", "t@example.com"); git(cwd, "config", "user.name", "T"); writeFileSync(join(cwd, "a.txt"), "1"); git(cwd, "add", "."); git(cwd, "commit", "-qm", "init"); };

test("done: a ticket cannot be done before the tickets it depends on", async () => {
  const t = await setup("kanban:\n  enforce_commit_keys: false\n");
  try {
    const K = t.rt.kanban;
    const a = K.create({ title: "A", cwd: t.work });
    const b = K.create({ title: "B", cwd: t.work, depends_on: [a.key] });
    let v = await K.complete(b.key);
    assert.equal(v.passed, false); assert.match(v.detail, /waiting on PT-1/);
    assert.equal(K.get(b.key).status, "ready");
    assert.equal((await K.complete(a.key)).passed, true);
    v = await K.complete(b.key);
    assert.equal(v.passed, true);
  } finally { await t.close(); }
});

test("done: placeholder files and a worker that ended in an error do not count", async () => {
  const t = await setup("kanban:\n  enforce_commit_keys: false\n");
  try {
    const K = t.rt.kanban;
    mkdirSync(join(t.work, "css/pages"), { recursive: true });
    writeFileSync(join(t.work, "css/pages/cart.css"), "/* pages/cart.css: cart page layout and sections */\n");
    const c = K.create({ title: "cart.css", cwd: t.work, files: ["css/pages/cart.css"] });
    let v = await K.complete(c.key);
    assert.equal(v.passed, false); assert.match(v.detail, /only a placeholder/);
    writeFileSync(join(t.work, "css/pages/cart.css"), ".cart { display: grid; gap: var(--space-4); }\n.cart__total { font-weight: 700; }\n");
    K.update(c.key, { result: "Error: aborted" });
    v = await K.complete(c.key, "worker");
    assert.equal(v.passed, false); assert.match(v.detail, /ended with an error/);
    v = await K.complete(c.key, "user");   // a person checking by hand is not a crashed session
    assert.equal(v.passed, true);
  } finally { await t.close(); }
});

test("done: the work must be committed under the ticket key", async () => {
  const t = await setup();
  try {
    repo(t.work);
    const K = t.rt.kanban;
    const c = K.create({ title: "x.js", cwd: t.work, files: ["x.js"] });
    writeFileSync(join(t.work, "x.js"), "export const answer = () => 42; // the real thing\n");
    let v = await K.complete(c.key);
    assert.equal(v.passed, false); assert.match(v.detail, /no commit message starts with PT-1/); assert.match(v.detail, /not committed .*x\.js/);
    git(t.work, "add", "x.js"); git(t.work, "commit", "-qm", "unrelated message");
    v = await K.complete(c.key);
    assert.equal(v.passed, false); assert.match(v.detail, /no commit message starts with PT-1/); assert.doesNotMatch(v.detail, /new or modified/);
    git(t.work, "commit", "-q", "--allow-empty", "-m", `${c.key}: already done by PT-0`);
    v = await K.complete(c.key);
    assert.equal(v.passed, true); assert.equal(K.get(c.key).commits.length, 1);
  } finally { await t.close(); }
});

test("spec guard: a kanban worker cannot edit the phase spec; chat can", async () => {
  const { specOwnsError } = await import(dist("tools/files.js"));
  const ctx = (source) => ({ cwd: "/proj", session: { source }, rt: { kanban: { listAll: () => [{ spec: "plan/my-spec.md", cwd: "/proj" }], cwdOf: (c) => c.cwd } } });
  assert.match(specOwnsError(ctx("kanban"), "/proj/docs/phase-02.md"), /is the specification/);
  assert.match(specOwnsError(ctx("kanban"), "/proj/docs/00-context.md"), /is the specification/);
  assert.match(specOwnsError(ctx("kanban"), "/proj/plan/my-spec.md"), /is the specification/);
  assert.equal(specOwnsError(ctx("kanban"), "/proj/docs/PROGRESS.md"), null);
  assert.equal(specOwnsError(ctx("kanban"), "/proj/js/lib/cart.js"), null);
  assert.equal(specOwnsError(ctx("web"), "/proj/docs/phase-02.md"), null);
});

test("story manifest: a section that labels several files delivers all of them", async () => {
  const { sectionManifest } = await import(dist("kanban/verify.js"));
  const body = "**`js/pages/admin/boot.js`**\n```js\nexport const session = 1;\nexport function bootAdmin() {}\n```\n**`login.js`**: if already logged in → index.html. Render the form\n**`dashboard.js`**: `bootAdmin('dashboard', 'Dashboard')`\n";
  const m = sectionManifest("7. Page scripts (side effects allowed)", body);
  assert.deepEqual(m.files, ["js/pages/admin/boot.js", "js/pages/admin/login.js", "js/pages/admin/dashboard.js"]);
  assert.deepEqual(m.exports, { "js/pages/admin/boot.js": ["session", "bootAdmin"] });
  // a heading that names its file keeps exactly that file
  assert.deepEqual(sectionManifest("2. `js/lib/cart.js`", "**`helper.js`**: not a deliverable here").files, ["js/lib/cart.js"]);
});

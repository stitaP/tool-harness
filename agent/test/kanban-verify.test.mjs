import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, dist } from "./helpers.mjs";

const SPEC = `# Phase 08: Product page

**Goal:** product detail.
**Files to write:** \`js/lib/qty.js\`, \`product.html\`, \`css/product.css\`.
**Test:** \`true\`

---

## 1. \`js/lib/qty.js\`
\`\`\`js
export function clamp(n, lo, hi) {}
export const MAX_QTY = 10;
\`\`\`
`;
const mk = (extra = {}) => {
  const d = mkdtempSync(join(tmpdir(), "proj-"));
  for (const f of ["docs", "js/lib", "css"]) mkdirSync(join(d, f), { recursive: true });
  writeFileSync(join(d, "docs", "phase-08.md"), SPEC);
  for (const [f, c] of Object.entries(extra)) { mkdirSync(join(d, f, ".."), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
};
const PAGE = (body = "<p>" + "Hello organic world. ".repeat(10) + "</p>", link = "other.html") =>
  `<!doctype html><html><head><meta charset="utf-8"><title>P</title><link rel="stylesheet" href="css/product.css"></head><body><h1>Product</h1>${body}<a href="${link}">Other</a></body></html>`;

test("verify: parseManifest reads files, exports and pages from a phase spec", async () => {
  const { parseManifest, exportsName } = await import(dist("kanban/verify.js"));
  const m = parseManifest(SPEC);
  assert.deepEqual(m.files.sort(), ["css/product.css", "js/lib/qty.js", "product.html"]);
  assert.deepEqual(m.exports, { "js/lib/qty.js": ["clamp", "MAX_QTY"] });
  assert.deepEqual(m.pages, ["product.html"]);
  assert.ok(exportsName("export const MAX_QTY = 1;", "MAX_QTY") && exportsName("export { a, MAX_QTY }", "MAX_QTY") && !exportsName("const MAX_QTY = 1;", "MAX_QTY"));
});

test("verify: generated tests/verify file fails on missing files/exports/links and passes once built", async () => {
  const t = await setup();
  try {
    const proj = mk();
    const K = t.rt.kanban;
    const c = K.create({ title: "P8", cwd: proj, spec: "docs/phase-08.md", test_cmd: "true" });
    const out = K.genTests(c.key);
    assert.equal(out, join(proj, "tests", "verify", "phase-08.verify.test.mjs"));
    const run = () => spawnSync(process.execPath, ["--test", out], { cwd: proj, encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    let r = run();
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /missing: .*qty\.js/);
    writeFileSync(join(proj, "js/lib/qty.js"), "export function clamp() {}\n"); writeFileSync(join(proj, "css/product.css"), "body{}"); writeFileSync(join(proj, "product.html"), PAGE());
    r = run();
    assert.match(r.stdout, /missing exports: js\/lib\/qty\.js: MAX_QTY/);
    assert.match(r.stdout, /product\.html → other\.html/); // broken local link
    writeFileSync(join(proj, "js/lib/qty.js"), "export function clamp() {}\nexport const MAX_QTY = 10;\n"); writeFileSync(join(proj, "other.html"), PAGE());
    r = run();
    assert.equal(r.status, 0, r.stdout);
  } finally { await t.close(); }
});

test("verify: browser pass saves a screenshot per page and a report; broken pages and links fail it", async () => {
  const t = await setup();
  try {
    const proj = mk({ "js/lib/qty.js": "export function clamp() {}\nexport const MAX_QTY = 10;\n", "css/product.css": "body{font-family:sans-serif}", "product.html": PAGE(), "other.html": PAGE() });
    const K = t.rt.kanban;
    const c = K.create({ title: "P8", cwd: proj, spec: "docs/phase-08.md", test_cmd: "true" });
    let rep = await K.verify(c.key);
    assert.equal(rep.ok, true, rep.markdown);
    assert.equal(rep.shots.length, 1);
    assert.ok(existsSync(rep.shots[0]) && readFileSync(rep.shots[0]).length > 1000);
    assert.ok(existsSync(join(proj, ".stitap", "evidence", c.key, "report.md")));
    assert.match(rep.markdown, /✔ \*\*navigate\*\*/);
    assert.equal(K.get(c.key).verification.ok, true);
    // a broken link and a script error fail the navigate check
    writeFileSync(join(proj, "product.html"), PAGE("<script>throw new Error('boom')</script><p>" + "text ".repeat(30) + "</p>", "nowhere.html"));
    rep = await K.verify(c.key);
    assert.equal(rep.ok, false);
    const nav = rep.checks.find((x) => x.name === "navigate");
    assert.match(nav.detail, /script error: boom/);
    assert.match(nav.detail, /broken link: nowhere\.html/);
    // empty page
    writeFileSync(join(proj, "product.html"), PAGE("")); 
    assert.match((await K.verify(c.key)).checks.find((x) => x.name === "navigate").detail, /nearly empty/);
  } finally { await t.close(); }
}, { timeout: 120000 });

test("verify: a new card that breaks an earlier page or earlier tests is caught as a regression", async () => {
  const t = await setup();
  try {
    const proj = mk({ "js/lib/qty.js": "export function clamp() {}\nexport const MAX_QTY = 10;\n", "css/product.css": "body{}", "product.html": PAGE(), "other.html": PAGE(), "flag.txt": "1" });
    writeFileSync(join(proj, "docs", "phase-09.md"), "# Phase 09: Other\n\n**Files to write:** `other.html`.\n");
    const K = t.rt.kanban;
    const a = K.create({ title: "P8", cwd: proj, spec: "docs/phase-08.md", test_cmd: "true" });
    const done = await K.complete(a.key);
    assert.equal(done.passed, true, done.detail);          // verification ran inside complete() and set the page baseline
    assert.equal(K.get(a.key).status, "done");
    const early = K.create({ title: "Flag", cwd: proj, test_cmd: "test -f flag.txt" });
    K.update(early.key, { status: "done" });
    // phase 09 "implementation" wipes product.html and deletes the flag file the earlier card depends on
    writeFileSync(join(proj, "product.html"), PAGE(""));
    execFileSync("rm", [join(proj, "flag.txt")]);
    const b = K.create({ title: "P9", cwd: proj, spec: "docs/phase-09.md", test_cmd: "true" });
    const res = await K.complete(b.key);
    assert.equal(res.passed, false);
    assert.equal(res.detail, "verification failed");
    const cm = K.get(b.key).comments.map((x) => x.text).join("\n");
    assert.match(cm, /regression: earlier cards/);
    assert.match(cm, /regression: pages: pages that worked before are now broken: product\.html/);
    assert.equal(K.get(early.key).status, "ready");           // reopened
    assert.ok(K.list().some((x) => x.type === "bug" && x.links?.includes(early.key)));
  } finally { await t.close(); }
}, { timeout: 180000 });

test("verify: functional steps run through the webtest engine against the project", async () => {
  const t = await setup();
  try {
    const proj = mk({ "js/lib/qty.js": "export function clamp() {}\nexport const MAX_QTY = 10;\n", "css/product.css": "body{}", "product.html": PAGE() });
    const K = t.rt.kanban;
    const ok = K.create({ title: "F", cwd: proj, spec: "docs/phase-08.md", functional: [{ action: "goto", url: "{{base}}product.html" }, { action: "expect_text", text: "Product" }, { action: "click", text: "Other" }] });
    assert.equal((await K.verify(ok.key)).checks.find((x) => x.name === "functional").ok, true);
    const bad = K.create({ title: "F2", cwd: proj, spec: "docs/phase-08.md", functional: [{ action: "goto", url: "{{base}}product.html" }, { action: "expect_text", text: "Add to cart" }], });
    const f = (await K.verify(bad.key)).checks.find((x) => x.name === "functional");
    assert.equal(f.ok, false);
    assert.match(f.detail, /step \d+ expect_text failed/);
  } finally { await t.close(); }
}, { timeout: 180000 });

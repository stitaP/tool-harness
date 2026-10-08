import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setup } from "./helpers.mjs";
import { dist } from "./helpers.mjs";

const { columnOf } = await import(dist("tools/lsp.js"));
const haveClangd = (() => { try { execFileSync("clangd", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();

test("lsp: column lookup", () => {
  assert.equal(columnOf("  const total = add(1, 2);", "add"), 16);
  assert.equal(columnOf("  const total = add(1, 2);"), 2);
  assert.equal(columnOf("x = 1", "nope"), null);
});

test("lsp: missing server gives an install hint; unknown extension is explained", async () => {
  const t = await setup("lsp:\n  servers:\n    ghost:\n      command: definitely-not-a-language-server\n      exts: ['.ghost']\n");
  try {
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    const ctx = t.rt.toolContext(s.id);
    writeFileSync(join(t.work, "a.ghost"), "x"); writeFileSync(join(t.work, "a.zzz"), "x");
    assert.match(await t.rt.tools.get("lsp").handler({ action: "diagnostics", path: "a.ghost" }, ctx), /not installed/);
    assert.match(await t.rt.tools.get("lsp").handler({ action: "diagnostics", path: "a.zzz" }, ctx), /no language server is configured/);
  } finally { await t.close(); }
});

test("lsp: clangd diagnostics, definition and references (skipped when clangd is missing)", { skip: !haveClangd, timeout: 90_000 }, async () => {
  const t = await setup();
  try {
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    const ctx = t.rt.toolContext(s.id);
    mkdirSync(join(t.work, "src"));
    writeFileSync(join(t.work, "compile_flags.txt"), "-xc\n");
    writeFileSync(join(t.work, "src/m.c"), "int add(int a, int b) { return a + b; }\nint main(void) {\n  int r = add(1, 2);\n  return undefined_name + r;\n}\n");
    const lsp = t.rt.tools.get("lsp");
    const d = await lsp.handler({ action: "diagnostics", path: "src/m.c" }, ctx);
    assert.match(d, /undefined_name/);
    assert.match(await lsp.handler({ action: "definition", path: "src/m.c", line: 3, symbol: "add" }, ctx), /src\/m\.c:1:5/);
    assert.match(await lsp.handler({ action: "references", path: "src/m.c", line: 1, symbol: "add" }, ctx), /src\/m\.c:3/);
    assert.match(await lsp.handler({ action: "symbols", path: "src/m.c" }, ctx), /main/);
  } finally { await t.close(); }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dist } from "./helpers.mjs";

const { buildIndex, search, findSymbols, extractSymbols, tokenize } = await import(dist("tools/codeindex.js"));

test("code index: tokenizer splits camelCase and snake_case", () => {
  assert.deepEqual(tokenize("parseHTTPResponse_body"), ["parse", "http", "response", "body"]);
});
test("code index: symbols across languages", () => {
  assert.deepEqual(extractSymbols("a.ts", "export async function loadUser(id) {\n}\nexport class Repo {}\nconst go = async (x) => x;").map((s) => s.name), ["loadUser", "Repo", "go"]);
  assert.deepEqual(extractSymbols("a.py", "def fetch_all():\n  pass\nclass Cache:\n  pass").map((s) => s.name), ["fetch_all", "Cache"]);
  assert.deepEqual(extractSymbols("a.go", "func (s *Server) Start() error {\n}").map((s) => s.name), ["Start"]);
  assert.deepEqual(extractSymbols("a.rs", "pub async fn run() {}\nstruct Conf {}").map((s) => s.name), ["run", "Conf"]);
  assert.deepEqual(extractSymbols("README.md", "# Title\ntext\n## Install").map((s) => s.name), ["Title", "Install"]);
});
test("code index: ranked search, symbol lookup, incremental refresh", () => {
  const root = mkdtempSync(join(tmpdir(), "idx-"));
  mkdirSync(join(root, "src")); mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "src/net.ts"), "export function retryWithBackoff(fn) {\n  // exponential backoff between http attempts\n}\n");
  writeFileSync(join(root, "src/ui.ts"), "export function renderButton() {\n  return '<button>';\n}\n");
  writeFileSync(join(root, "node_modules/junk.js"), "function retryWithBackoff() {}");
  let idx = buildIndex(root);
  assert.equal(idx.files.size, 2);
  const hits = search(idx, "http retry backoff");
  assert.equal(hits[0].path, "src/net.ts");
  assert.equal(findSymbols(idx, "renderButton")[0].path, "src/ui.ts");
  assert.equal(findSymbols(idx, "retry")[0].sym.name, "retryWithBackoff");
  writeFileSync(join(root, "src/ui.ts"), "export function drawWidget() {}\n"); utimesSync(join(root, "src/ui.ts"), new Date(), new Date(Date.now() + 5000));
  idx = buildIndex(root);
  assert.equal(findSymbols(idx, "renderButton").length, 0);
  assert.equal(findSymbols(idx, "drawWidget").length, 1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, dist } from "./helpers.mjs";

const { oneLine, catalog, parseSelection, compactSchema } = await import(dist("loop/toolselect.js"));

test("planner: one-line catalog entries", () => {
  assert.equal(oneLine({ description: "Run a shell command in the working folder. Long explanation follows here with many details." }), "Run a shell command in the working folder");
  assert.equal(oneLine({ description: "x".repeat(300) }).length, 110);
  assert.equal(catalog([{ name: "a", description: "Does a thing for you. More." }]), "a — Does a thing for you");
});

test("planner: selection parsing is forgiving and only keeps known tools", () => {
  const known = new Set(["browser_open", "office", "git"]);
  const resolve = (n) => (n === "gitt" ? "git" : undefined);
  const s = parseSelection('```json\n{"tools": ["office", "bogus", "gitt", "office"], "search": ["loan amortization", "a", "b"], "plan": "one step"}\n```', known, resolve);
  assert.deepEqual(s.tools, ["office", "git"]);
  assert.deepEqual(s.search, ["loan amortization", "a"]);
  assert.deepEqual(s.plan, ["one step"]);
  assert.deepEqual(parseSelection("no json at all", known, resolve), { tools: [], search: [], plan: [] });
});

test("planner: big schemas are abbreviated, small ones untouched", () => {
  const big = { name: "t", description: "d".repeat(400), parameters: { type: "object", required: ["a"], properties: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p${i}`, { type: "string", description: "long description ".repeat(10) }])) } };
  const c = compactSchema(big);
  assert.ok(JSON.stringify(c).length < JSON.stringify(big).length * 0.6);
  assert.deepEqual(c.parameters.required, ["a"]);
  assert.equal(Object.keys(c.parameters.properties).length, 12);
  const small = { name: "s", description: "d", parameters: { type: "object", properties: { a: { type: "string", description: "x" } } } };
  assert.equal(compactSchema(small), small);
});

test("planner: on a small window the chat gets the compact core plus the tools the planner picked", async () => {
  const t = await setup("agent:\n  tool_profile: standard\n");
  try {
    t.rt.cfg.set("model.context_window", 16384); t.rt.resetProviders();
    t.mock.script([
      { match: "tool planner", content: '{"tools":["finance_calc"],"search":[],"plan":["compute the payment","report it"]}' },
      { content: "done" },
    ]);
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    await t.rt.send(s.id, "what is the monthly payment on a 250000 loan at 6% for 30 years?");
    const meta = t.rt.db.getSession(s.id).meta;
    assert.equal(meta.tool_selection, true);
    assert.deepEqual(meta.tool_extras, ["finance_calc"]);
    const names = t.rt.activeTools(s.id).map((x) => x.name);
    assert.ok(names.includes("finance_calc") && names.includes("terminal") && names.includes("tool_search"));
    assert.ok(names.length < 30, `only core + picks, got ${names.length}`);
    const user = t.rt.db.getMessages(s.id).find((m) => m.role === "user").content;
    assert.match(user, /\[Planner\]\nTools loaded for this task: finance_calc/);
    assert.match(user, /1\. compute the payment/);
    // the main request carries the picked tool and no unrelated heavy ones
    const reqs = t.mock.requests;
    const main = reqs.filter((r) => r.tools?.length).at(-1);
    const sent = main.tools.map((x) => x.function.name);
    assert.ok(sent.includes("finance_calc") && !sent.includes("webtest"));
    // tool_search with an exact name returns the full documentation
    const doc = await t.rt.tools.get("tool_search").handler({ query: "finance_calc" }, t.rt.toolContext(s.id));
    assert.match(doc, /^finance_calc \[/);
  } finally { await t.close(); }
});

test("planner: a failing planner never blocks the task", async () => {
  const t = await setup("agent:\n  tool_profile: standard\n");
  try {
    t.rt.cfg.set("model.context_window", 16384); t.rt.resetProviders();
    t.mock.script([{ match: "tool planner", content: "I cannot help with that" }, { content: "fine" }]);
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    const r = await t.rt.send(s.id, "summarize the files in this folder please");
    assert.equal(r.final, "fine");
  } finally { await t.close(); }
});

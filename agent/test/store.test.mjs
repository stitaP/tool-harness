// Tool Store integration: every catalog tool has an executor, the agent's
// secrets/model/capabilities are wired into the store, and side-effecting
// store tools are approval-gated. (Full per-tool run: node test/store/run-all.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, call, dist } from "./helpers.mjs";

const lastTool = (rt, sid) => [...rt.db.getMessages(sid)].reverse().find((m) => m.role === "tool")?.content ?? "";

test("store: every catalog tool has an executor", async () => {
  const t = await setup();
  try {
    await t.rt.storeBridge.load();
    const { total, executable } = t.rt.storeBridge.count;
    assert.ok(total >= 360, `catalog has ${total} tools`);
    assert.equal(executable, total, `missing executors: ${t.rt.storeBridge.list().filter((x) => !x.executable).map((x) => x.id).join(", ")}`);
  } finally { await t.close(); }
});

test("store: approval policy flags side-effecting calls only", async () => {
  const { storeApprovalReason } = await import(dist("runtime/store-bridge.js"));
  assert.match(storeApprovalReason("email.send", { to: ["a@b.c"] }), /email/);
  assert.match(storeApprovalReason("ecom.process_refund", { orderId: "O1" }), /refund/);
  assert.match(storeApprovalReason("database.query", { query: "DELETE FROM t" }), /modif/);
  assert.equal(storeApprovalReason("database.query", { query: "SELECT 1" }), null);
  assert.equal(storeApprovalReason("database.migrate", { dryRun: true }), null);
  assert.match(storeApprovalReason("os.execute", { command: "rm -rf /tmp/x" }) ?? "", /./);
  assert.equal(storeApprovalReason("os.execute", { command: "ls -la" }), null);
  assert.equal(storeApprovalReason("storage.upload", { provider: "local" }), null);
  assert.equal(storeApprovalReason("math.linalg.solve", {}), null);
});

test("store: gated tool is blocked when approvals are denied", async () => {
  const t = await setup("approvals:\n  mode: deny\n");
  try {
    t.mock.script([{ tool_calls: [call("use_tool", { name: "store:email.send", arguments: { provider: "resend", to: ["x@example.com"], from: "a@example.com", subject: "hi", text: "t" } })] }, { content: "could not send" }]);
    const s = t.rt.createSession({ source: "cli" });
    await t.rt.send(s.id, "email them");
    assert.match(lastTool(t.rt, s.id), /BLOCKED: store:email\.send/);
  } finally { await t.close(); }
});

test("store: tools use the agent's model and secrets through host hooks", async () => {
  const t = await setup("approvals:\n  mode: yolo\n");
  try {
    t.mock.script([{ match: "Customer wrote", content: "Hi Ravi, your order is on its way.", sticky: true }]);
    await t.rt.storeBridge.load();
    // llm.call with no endpoint → routed to the agent's configured (mock) model
    const out = await t.rt.storeBridge.call("llm.call", { provider: "agent", model: "mock", messages: [{ role: "user", content: "Customer wrote: where is my order?" }] });
    assert.match(out, /on its way/);
    // secrets come from the agent config/.env resolver
    t.rt.cfg.setSecret("RESEND_API_KEY", "re_test_key");
    const sent = await t.rt.storeBridge.call("email.send", { provider: "resend", to: ["x@example.com"], from: "a@example.com", subject: "hi", text: "t" }, { requestApproval: async () => true });
    assert.doesNotMatch(sent, /not configured/, "RESEND_API_KEY was resolved from the agent's secrets");
  } finally { await t.close(); }
});

test("store: agent.memory writes to the agent's own memory", async () => {
  const t = await setup();
  try {
    await t.rt.storeBridge.load();
    await t.rt.storeBridge.call("agent.memory", { action: "add", type: "user", key: "lang", content: "prefers Telugu summaries" });
    assert.ok(t.rt.memory.entries("user").some((e) => /Telugu/.test(e)));
    const q = await t.rt.storeBridge.call("agent.memory", { action: "query", search: "telugu" });
    assert.match(q, /Telugu/);
  } finally { await t.close(); }
});

test("store: offline tools across domains run end-to-end", async () => {
  const t = await setup();
  try {
    await t.rt.storeBridge.load();
    const run = async (id, a) => { const r = await t.rt.storeBridge.call(id, a, { requestApproval: async () => true }); assert.doesNotMatch(r, /^(error|store tool|unknown)/, `${id}: ${r.slice(0, 200)}`); return r; };
    await run("diagram.er_diagram", { entities: [{ name: "User", fields: ["id:int"] }], relationships: [] });
    await run("payment.invoice", { items: [{ name: "TV", quantity: 1, unitPrice: 100 }], currency: "INR", tax: 0.18 });
    await run("ecom.upsert_product", { name: "Fan", price: 3000, stock: 5 });
    await run("typography.telugu.css", {});
    await run("codegen.validate", { language: "javascript", code: "const x = 1;" });
    await run("cfd.solve.navier-stokes", { ni: 16, nj: 16 });
    await run("browser.color-palette", { action: "generate", brandColor: "#4f46e5" });
    const env = JSON.parse(await run("env.create", { name: "js", language: "javascript" }));
    assert.match(await run("env.run", { environmentId: env.id, code: "console.log(6*7)" }), /42/);
  } finally { await t.close(); }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.mjs";

test("a small context window switches a standard-profile chat to the compact tool profile", async () => {
  const t = await setup("agent:\n  tool_profile: standard\n");
  try {
    t.rt.cfg.set("model.context_window", 16384);
    t.rt.resetProviders();
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    t.rt.ensureSystemPrompt(s.id);
    const before = t.rt.tools.active(t.rt, { profile: "standard" }).length;
    const tools = t.rt.activeTools(s.id);
    assert.ok(tools.length < before, `${tools.length} < ${before}`);
    assert.equal(t.rt.db.getSession(s.id).meta.tool_profile, "slm");
    assert.ok(t.events.some((e) => e.type === "status" && /compact tool set/.test(e.text)));
    // a chat that already stored the big tool list is fixed the same way
    const s2 = t.rt.createSession({ source: "test", cwd: t.work, meta: { tool_names: t.rt.tools.active(t.rt, { profile: "standard" }).map((x) => x.name) } });
    t.rt.ensureSystemPrompt(s2.id);
    assert.ok(t.rt.activeTools(s2.id).length < before);
    // an explicit allow-list is respected
    const s3 = t.rt.createSession({ source: "test", cwd: t.work, meta: { tool_names: ["terminal", "read_file"], tool_names_explicit: true } });
    assert.equal(t.rt.activeTools(s3.id).length, 2);
  } finally { await t.close(); }
});

test("a large window keeps the standard profile", async () => {
  const t = await setup("agent:\n  tool_profile: standard\n");
  try {
    t.rt.cfg.set("model.context_window", 131072); t.rt.resetProviders();
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    t.rt.ensureSystemPrompt(s.id);
    assert.ok(t.rt.activeTools(s.id).length > 30);
  } finally { await t.close(); }
});

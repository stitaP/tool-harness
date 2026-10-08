import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.mjs";
import { dist } from "./helpers.mjs";

const { summarize, benchText, bucketOf } = await import(dist("runtime/bench.js"));

test("bench: buckets", () => {
  assert.deepEqual([100, 5000, 20000, 90000].map(bucketOf), ["<4K", "4-16K", "16-64K", ">64K"]);
});

test("bench: model calls and goal outcomes are aggregated per model × profile × prompt size", async () => {
  const t = await setup();
  try {
    const s = t.rt.createSession({ source: "test", cwd: t.work });
    const mc = (input, genTps, tokens) => t.rt.emitEvent(s.id, { type: "model_call", model: "mock", usage: { input, output: tokens }, timings: { genTps, promptTps: 400, genTokens: tokens, genMs: tokens / genTps * 1000, cacheTokens: input / 2, promptTokens: input / 2 } });
    mc(1000, 30, 60); mc(1000, 20, 60); mc(30000, 10, 100);
    t.rt.emitEvent(s.id, { type: "goal", state: { status: "active" } });
    t.rt.emitEvent(s.id, { type: "goal", state: { status: "done" } });
    t.rt.emitEvent(s.id, { type: "goal", state: { status: "paused" } });
    const sum = summarize(t.rt.bench.rows(1));
    assert.equal(sum.length, 1);
    const m = sum[0];
    assert.equal(m.calls, 3);
    assert.equal(m.gen_tps, 14.7); // 220 tokens / (2+3+10 s)
    assert.deepEqual(m.by_bucket.map((b) => [b.bucket, b.calls, b.gen_tps]), [["<4K", 2, 24], ["16-64K", 1, 10]]);
    assert.equal(m.cache_hit, 50);
    assert.equal(m.goals_done, 1); assert.equal(m.goals_paused, 1);
    assert.match(benchText(t.rt.bench.rows(1), 1), /mock\s+standard\s+3\s+14\.7/);
  } finally { await t.close(); }
});

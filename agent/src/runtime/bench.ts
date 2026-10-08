/**
 * Benchmark recorder: every model call and every finished goal is folded into small per-day aggregates
 * (model × tool profile × prompt-size bucket), kept in the state db. It answers "is the 30B worth its slower
 * prompt?" and "what does the speed do as the context fills?" from real use, without keeping a row per call.
 */
import type { Runtime } from "./runtime.js";

export interface BenchRow {
  day: string; model: string; profile: string; bucket: string;
  calls: number; gen_tokens: number; gen_ms: number; prompt_tokens: number; prompt_ms: number;
  input_tokens: number; cache_tokens: number; min_tps: number; max_tps: number;
  goals_done: number; goals_paused: number;
}

export const BUCKETS = ["<4K", "4-16K", "16-64K", ">64K"] as const;
export const bucketOf = (inputTokens: number) => inputTokens < 4096 ? BUCKETS[0] : inputTokens < 16384 ? BUCKETS[1] : inputTokens < 65536 ? BUCKETS[2] : BUCKETS[3];
const KIND = "bench";
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

export class BenchRecorder {
  constructor(private rt: Runtime) {
    rt.on("event", (ev: any) => {
      try {
        if (ev.type === "model_call" && ev.timings) this.call(ev);
        else if (ev.type === "goal" && ev.state && ev.state.status !== "active") this.goal(ev);
      } catch { /* statistics must never break a turn */ }
    });
  }

  private profile(sid: string): string {
    return this.rt.db.getSession(sid)?.meta?.tool_profile ?? this.rt.cfg.data.agent.tool_profile;
  }
  private row(day: string, model: string, profile: string, bucket: string): BenchRow {
    const id = `${day}|${model}|${profile}|${bucket}`;
    return this.rt.db.getRecord<BenchRow>(KIND, id) ?? { day, model, profile, bucket, calls: 0, gen_tokens: 0, gen_ms: 0, prompt_tokens: 0, prompt_ms: 0, input_tokens: 0, cache_tokens: 0, min_tps: 0, max_tps: 0, goals_done: 0, goals_paused: 0 };
  }
  private save(r: BenchRow) { this.rt.db.putRecord(KIND, `${r.day}|${r.model}|${r.profile}|${r.bucket}`, r); }

  private call(ev: any) {
    const t = ev.timings;
    const input = ev.usage?.input ?? 0;
    const r = this.row(dayOf(ev.ts ?? Date.now()), String(ev.model ?? "?"), this.profile(ev.sessionId), bucketOf(input));
    r.calls++; r.gen_tokens += t.genTokens; r.gen_ms += t.genMs || (t.genTps > 0 ? t.genTokens / t.genTps * 1000 : 0);
    if (t.promptTps > 0 && t.promptTokens > 0) { r.prompt_tokens += t.promptTokens; r.prompt_ms += t.promptTokens / t.promptTps * 1000; }
    r.input_tokens += input; r.cache_tokens += t.cacheTokens ?? 0;
    r.min_tps = r.min_tps ? Math.min(r.min_tps, t.genTps) : t.genTps; r.max_tps = Math.max(r.max_tps, t.genTps);
    this.save(r);
  }

  private goal(ev: any) {
    const done = ev.state.status === "done";
    const r = this.row(dayOf(ev.ts ?? Date.now()), this.rt.providerFor(ev.sessionId).model, this.profile(ev.sessionId), "goals");
    if (done) r.goals_done++; else r.goals_paused++;
    this.save(r);
  }

  rows(days: number): BenchRow[] {
    const since = dayOf(Date.now() - (days - 1) * 86_400_000);
    return this.rt.db.listRecords<BenchRow>(KIND).filter((r) => r.day >= since);
  }
}

export interface BenchSummary {
  model: string; profile: string; calls: number; gen_tps: number | null; prompt_tps: number | null; cache_hit: number | null; goals_done: number; goals_paused: number;
  by_bucket: { bucket: string; calls: number; gen_tps: number | null }[];
}

const tps = (tokens: number, ms: number) => ms > 0 ? Math.round(tokens / ms * 10000) / 10 : null;

export function summarize(rows: BenchRow[]): BenchSummary[] {
  const groups = new Map<string, BenchRow[]>();
  for (const r of rows) { const k = `${r.model}|${r.profile}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
  const out: BenchSummary[] = [];
  for (const [k, rs] of groups) {
    const [model, profile] = k.split("|");
    const sum = (f: (r: BenchRow) => number, rr = rs) => rr.reduce((n, r) => n + f(r), 0);
    const input = sum((r) => r.input_tokens);
    out.push({
      model, profile, calls: sum((r) => r.calls), gen_tps: tps(sum((r) => r.gen_tokens), sum((r) => r.gen_ms)), prompt_tps: tps(sum((r) => r.prompt_tokens), sum((r) => r.prompt_ms)),
      cache_hit: input ? Math.round(sum((r) => r.cache_tokens) / input * 100) : null, goals_done: sum((r) => r.goals_done), goals_paused: sum((r) => r.goals_paused),
      by_bucket: BUCKETS.map((b) => { const br = rs.filter((r) => r.bucket === b); return { bucket: b, calls: sum((r) => r.calls, br), gen_tps: tps(sum((r) => r.gen_tokens, br), sum((r) => r.gen_ms, br)) }; }).filter((x) => x.calls),
    });
  }
  return out.sort((a, b) => b.calls - a.calls);
}

export function benchText(rows: BenchRow[], days: number): string {
  const s = summarize(rows);
  if (!s.length) return `No benchmark data for the last ${days} day(s) yet. It is recorded from your normal chats.`;
  const f = (n: number | null, d = "–") => n === null ? d : String(n);
  const lines = [`Model benchmarks, last ${days} day(s) (generation speed is token-weighted)`,
    `${"model".padEnd(22)} ${"profile".padEnd(9)} ${"calls".padStart(6)} ${"gen t/s".padStart(8)} ${"prefill t/s".padStart(12)} ${"cache".padStart(6)}  goals done/paused`];
  for (const m of s) {
    lines.push(`${m.model.slice(0, 22).padEnd(22)} ${m.profile.padEnd(9)} ${String(m.calls).padStart(6)} ${f(m.gen_tps).padStart(8)} ${f(m.prompt_tps).padStart(12)} ${(m.cache_hit === null ? "–" : m.cache_hit + "%").padStart(6)}  ${m.goals_done}/${m.goals_paused}`);
    if (m.by_bucket.length > 1) lines.push(`${"".padEnd(22)} by prompt size: ${m.by_bucket.map((b) => `${b.bucket} ${f(b.gen_tps)} t/s (${b.calls})`).join(" · ")}`);
  }
  return lines.join("\n");
}

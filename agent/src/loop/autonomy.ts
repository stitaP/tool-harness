/**
 * "Keep working until done":
 *  - /goal       standing objective; an auxiliary judge checks each turn and the
 *                runtime auto-continues until done / paused / budget spent
 *  - /loop       re-run a prompt on an interval or back-to-back, until LOOP_COMPLETE,
 *                --times N, or an --until condition judged true
 *  - /heartbeat  idle-only periodic check-in for this session
 * State lives in state_meta so it survives restarts.
 */
import type { Runtime } from "../runtime/runtime.js";
import { repairJson } from "../util/jsonrepair.js";
import { errMsg } from "../util/misc.js";
import { planProgress } from "../tools/agent-tools.js";

export interface GoalState { text: string; contract?: string; status: "active" | "paused" | "done" | "failed"; turns: number; max_turns: number; last_reason?: string; created_at: number }
export interface LoopState { prompt: string; mode: "interval" | "dynamic"; interval_ms: number; times?: number; until?: string; ticks: number; max_ticks: number; next_at: number; status: "active" | "paused" | "done"; last_reason?: string }
export interface HeartbeatState { prompt: string; interval_ms: number; next_at: number; status: "active" | "paused"; fires: number }

export const goalKey = (sid: string) => `goal:${sid}`;
export const loopKey = (sid: string) => `loop:${sid}`;
export const heartbeatKey = (sid: string) => `heartbeat:${sid}`;

function recentActivity(rt: Runtime, sid: string, n = 14): string {
  const msgs = rt.db.getMessages(sid).slice(-60);
  const lines: string[] = [];
  for (const m of msgs) {
    if (m.role === "assistant" && m.tool_calls?.length) for (const c of m.tool_calls) lines.push(`→ ${c.name}(${c.arguments.slice(0, 160)})`);
    else if (m.role === "tool") lines.push(`  ← ${(m.content ?? "").replace(/\s+/g, " ").slice(0, 220)}`);
  }
  return lines.slice(-n * 2).join("\n") || "(no tool activity)";
}

export async function judge(rt: Runtime, sid: string, objective: string, contract: string | undefined, lastReply: string, kind: "goal" | "condition"): Promise<{ done: boolean; impossible: boolean; reason: string }> {
  const sys = `You are a strict, evidence-based completion judge for an autonomous agent. Decide whether the ${kind === "goal" ? "goal" : "condition"} is FULLY satisfied right now, based on the agent's latest reply and its recent tool activity. Require concrete evidence (command output, test results, files written). Claims without evidence are not enough. If it clearly cannot be achieved (missing access, contradictory requirements), set impossible=true.
Reply with ONLY a JSON object: {"done": boolean, "impossible": boolean, "reason": "one or two sentences; if not done, say what is still missing"}`;
  const plan = kind === "goal" ? planProgress(rt, sid) : null;
  const user = `${kind === "goal" ? "Goal" : "Condition"}: ${objective}\n${contract ? `\nCompletion contract (all must hold):\n${contract}\n` : ""}${plan ? `\nThe agent's plan (pending items mean the goal is not done unless they are clearly no longer needed):\n${plan}\n` : ""}\nRecent tool activity:\n${recentActivity(rt, sid)}\n\nAgent's latest reply:\n${lastReply.slice(0, 6000)}`;
  try {
    const r = await rt.aux().chat({ messages: [{ role: "system", content: sys }, { role: "user", content: user }], maxTokens: 300, temperature: 0, json: true, stream: false });
    const j = repairJson(r.content);
    return { done: !!j.done, impossible: !!j.impossible, reason: String(j.reason ?? "").slice(0, 500) };
  } catch (e) {
    // fail open: an unavailable judge never wedges the loop; the turn budget still bounds it
    return { done: false, impossible: false, reason: `judge unavailable (${errMsg(e)})` };
  }
}

export async function draftContract(rt: Runtime, objective: string): Promise<string> {
  const r = await rt.aux().chat({
    messages: [
      { role: "system", content: "Turn the objective into a short completion contract: 3-7 checkable acceptance criteria as a markdown list. Each criterion must be verifiable by running a command or inspecting a file/output. No preamble." },
      { role: "user", content: objective },
    ], maxTokens: 400, temperature: 0.2, stream: false,
  });
  return r.content.trim();
}

export function continuationPrompt(g: GoalState, plan?: string | null): string {
  return `[Goal continuation ${g.turns}/${g.max_turns}] Keep working toward the standing goal:\n${g.text}\n${g.contract ? `\nCompletion contract:\n${g.contract}\n` : ""}${plan ? `\nYour plan:\n${plan}\n(Work on the in-progress item, then the next pending ones; mark items with todo_list action=update as you finish them.)\n` : ""}\nJudge's assessment of your last turn: ${g.last_reason || "not yet complete"}\n\nDo the next concrete steps now (don't redo finished work). When everything is achieved and verified, state that clearly with the evidence.`;
}

export function loopPrompt(l: LoopState): string {
  return `[Loop tick ${l.ticks + 1}${l.times ? `/${l.times}` : ""}] ${l.prompt}\n\n(When the task is finished or no longer relevant, end your reply with LOOP_COMPLETE on its own line.)`;
}

export function heartbeatPrompt(h: HeartbeatState): string {
  return `[Heartbeat] ${h.prompt}\n\n(If nothing meaningful changed since the last check, reply only with NO_REPLY. Don't invent work.)`;
}

/** Called after each completed turn. Returns a follow-up prompt to enqueue, if any. */
export async function afterTurn(rt: Runtime, sid: string, final: string, info: { interrupted: boolean; error?: string; source: string }): Promise<{ prompt: string; kind: string } | null> {
  if (info.interrupted) return null;
  // /loop
  const l = rt.db.getMeta<LoopState>(loopKey(sid));
  if (l && l.status === "active" && info.source === "loop") {
    l.ticks++;
    let stop: string | null = null;
    if (/(^|\n)\s*LOOP_COMPLETE\s*$/m.test(final)) stop = "agent reported LOOP_COMPLETE";
    else if (l.times && l.ticks >= l.times) stop = `ran ${l.times} times`;
    else if (l.max_ticks && l.ticks >= l.max_ticks) stop = `reached loops.max_ticks (${l.max_ticks})`;
    else if (l.until) {
      const j = await judge(rt, sid, l.until, undefined, final, "condition");
      if (j.done) stop = `condition met: ${j.reason}`;
      else if (j.impossible) { l.status = "paused"; l.last_reason = `paused — judged unachievable: ${j.reason}`; }
    }
    if (stop) { l.status = "done"; l.last_reason = stop; }
    l.next_at = Date.now() + (l.mode === "dynamic" ? 1500 : l.interval_ms);
    rt.db.setMeta(loopKey(sid), l);
    rt.emitEvent(sid, { type: "loop", state: l });
    return null; // the ticker fires the next tick
  }
  // /goal
  const g = rt.db.getMeta<GoalState>(goalKey(sid));
  if (!g || g.status !== "active") return null;
  if (info.error && /authentication|cannot reach/i.test(info.error)) {
    g.status = "paused"; g.last_reason = `paused after error: ${info.error}`;
    rt.db.setMeta(goalKey(sid), g); rt.emitEvent(sid, { type: "goal", state: g });
    return null;
  }
  rt.emitEvent(sid, { type: "status", text: "Checking goal completion…" });
  const j = await judge(rt, sid, g.text, g.contract, final, "goal");
  g.turns++;
  g.last_reason = j.reason;
  const looped = [...rt.db.getMessages(sid)].reverse().find((m) => m.role === "assistant")?.meta?.loop_stopped;
  if (j.done) g.status = "done";
  else if (j.impossible) { g.status = "paused"; g.last_reason = `paused — judged unachievable: ${j.reason}`; }
  else if (looped) { g.status = "paused"; g.last_reason = `paused — the agent was repeating itself instead of making progress (/goal resume to continue). ${j.reason}`; }
  else if (g.turns >= g.max_turns) { g.status = "paused"; g.last_reason = `paused — turn budget (${g.max_turns}) used. ${j.reason}`; }
  rt.db.setMeta(goalKey(sid), g);
  rt.emitEvent(sid, { type: "goal", state: g });
  return g.status === "active" ? { prompt: continuationPrompt(g, planProgress(rt, sid)), kind: "goal" } : null;
}

import { runTurn } from "../loop/agent.js";
import { repairJson } from "../util/jsonrepair.js";
import { errMsg } from "../util/misc.js";
import { type Tool, obj, str, arr, int, enm } from "./types.js";
import { commitAll, createWorktree, removeWorktree, worktreeChanges, type Worktree } from "../runtime/worktree.js";

/** Simple async semaphore shared by all delegations in the process. */
class Semaphore {
  private q: (() => void)[] = [];
  private n = 0;
  constructor(private max: () => number) {}
  async acquire() { if (this.n < this.max()) { this.n++; return; } await new Promise<void>((r) => this.q.push(r)); this.n++; }
  release() { this.n--; const next = this.q.shift(); if (next) next(); }
}
let sem: Semaphore | null = null;

const BLOCKED_FOR_CHILDREN = new Set(["clarify", "memory", "skill_manage", "cronjob_manage", "pipeline_manage", "kanban"]);

export const delegateTool: Tool = {
  name: "delegate_task", toolset: "delegation", tier: "standard",
  description:
    "Delegate work to subagents with their own fresh context (they don't see this conversation — give them everything they need). " +
    "Use for independent research/coding subtasks or to parallelize. `tasks` runs several in parallel. Optional output_schema (JSON Schema) makes them return JSON.",
  parameters: obj({
    goal: str("single task description (or use tasks)"),
    tasks: arr(obj({ goal: str("task"), context: str("extra context") }, ["goal"]), "several independent tasks to run in parallel"),
    context: str("shared context for all subagents: files, constraints, what 'done' means"),
    tools: arr(str("tool name"), "restrict subagents to these tools"),
    output_schema: { type: "object", description: "JSON Schema the result must follow" },
    max_iterations: int("per-subagent iteration cap"),
    agent: str("optional: run the subagents as this configured agent (its instructions, tools and model)"),
    isolation: enm(["none", "worktree"], "worktree: each subagent works in its own git worktree branch, so parallel subagents cannot overwrite each other or your files; you get the branch to merge (default none)"),
  }),
  async handler(a, ctx) {
    const rt = ctx.rt;
    if (ctx.depth >= 2) return "error: maximum delegation depth reached — do this task yourself.";
    sem ??= new Semaphore(() => rt.cfg.data.delegation.max_concurrent);
    const tasks: { goal: string; context?: string }[] = Array.isArray(a.tasks) && a.tasks.length ? a.tasks : a.goal ? [{ goal: a.goal }] : [];
    if (!tasks.length) return "error: provide goal or tasks";
    const agentDef = a.agent ? rt.cfg.data.agents?.[a.agent] : undefined;
    if (a.agent && !agentDef) return `error: no agent "${a.agent}" (configured: ${Object.keys(rt.cfg.data.agents ?? {}).join(", ") || "none"})`;
    const parentTools = agentDef?.tools?.length ? agentDef.tools : rt.activeTools(ctx.session.id).map((t) => t.name);
    const allowed = new Set<string>((Array.isArray(a.tools) && a.tools.length ? a.tools : parentTools).filter((n: string) => !BLOCKED_FOR_CHILDREN.has(n) && (ctx.depth < 1 || n !== "delegate_task")));
    const cap = Math.min(Number(a.max_iterations) || rt.cfg.data.delegation.max_iterations, rt.cfg.data.delegation.max_iterations);
    const schemaNote = a.output_schema ? `\n\nReturn your final answer as ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(a.output_schema)}` : "";

    const runOne = async (t: { goal: string; context?: string }, i: number) => {
      await sem!.acquire();
      try {
        if (ctx.signal.aborted) return { i, goal: t.goal, ok: false, out: "[interrupted]" };
        let wt: Worktree | null = null;
        if (a.isolation === "worktree") {
          try { wt = await createWorktree(ctx.cwd, `sub-${Date.now().toString(36)}-${i}`); }
          catch (e) { return { i, goal: t.goal, ok: false, out: `error: isolation=worktree needs a git repository with at least one commit (${errMsg(e)})` }; }
        }
        const child = rt.createSession({ source: "subagent", parent_id: ctx.session.id, title: `sub${a.agent ? `(${a.agent})` : ""}: ${t.goal.slice(0, 50)}`, cwd: wt?.cwd ?? ctx.cwd });
        if (a.agent) rt.applyAgent(child.id, a.agent);
        rt.emitEvent(ctx.session.id, { type: "subagent", id: child.id, goal: t.goal, state: "started" });
        const fwd = (ev: any) => { if (ev.sessionId === child.id && ev.type === "tool_start") rt.emitEvent(ctx.session.id, { type: "subagent", id: child.id, state: "tool", tool: ev.name }); };
        rt.on("event", fwd);
        const budget = { remaining: Math.max(1, Math.min(cap, ctx.budget.remaining)) };
        const before = budget.remaining;
        let r;
        try {
          r = await runTurn(rt, {
            sessionId: child.id, signal: ctx.signal, depth: ctx.depth + 1, allowedTools: allowed, budget, maxIterations: cap,
            userText: `${t.goal}${t.context || a.context ? `\n\nContext:\n${[a.context, t.context].filter(Boolean).join("\n")}` : ""}${schemaNote}\n\nWork autonomously; you cannot ask questions. End with a complete, self-contained result.`,
            clarify: async () => null, headlessApproval: rt.approvals.yoloSessions.has(ctx.session.id) ? "yolo" : undefined,
          });
        } finally { rt.off("event", fwd); }
        ctx.budget.remaining -= before - budget.remaining;
        let out = r.final;
        if (a.output_schema) { try { out = JSON.stringify(repairJson(out), null, 2); } catch { /* leave as text */ } }
        if (wt) out += await settleWorktree(wt, t.goal);
        rt.emitEvent(ctx.session.id, { type: "subagent", id: child.id, state: r.error ? "failed" : "done" });
        return { i, goal: t.goal, ok: !r.error && !r.interrupted, out, iterations: r.iterations, sid: child.id };
      } catch (e) {
        return { i, goal: t.goal, ok: false, out: `error: ${errMsg(e)}` };
      } finally { sem!.release(); }
    };
    const results = await Promise.all(tasks.map(runOne));
    if (results.length === 1) return results[0].out;
    return results.map((r) => `## Task ${r.i + 1}: ${r.goal}\n${r.ok ? "" : "(not fully completed)\n"}${r.out}`).join("\n\n");
  },
};

/** After an isolated subagent: commit what it left, drop the worktree when nothing changed, else hand over the branch. */
async function settleWorktree(wt: Worktree, goal: string): Promise<string> {
  try {
    await commitAll(wt.path, `subagent: ${goal.replace(/\s+/g, " ").slice(0, 60)}`);
    const ch = await worktreeChanges(wt);
    if (!ch.ahead) { await removeWorktree(wt, { deleteBranch: true, force: true }); return "\n\n[worktree: no file changes; removed]"; }
    return `\n\n[worktree: ${ch.ahead} commit(s) on branch ${wt.branch} in ${wt.path}. Review with git diff ${wt.base}...${wt.branch}; merge with: git merge --no-ff ${wt.branch} (then: git worktree remove ${wt.path} && git branch -d ${wt.branch})]`;
  } catch (e) { return `\n\n[worktree ${wt.path}: ${errMsg(e)}]`; }
}

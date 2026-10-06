import { runTurn } from "../loop/agent.js";
import { repairJson } from "../util/jsonrepair.js";
import { errMsg } from "../util/misc.js";
import { obj, str, arr, int } from "./types.js";
/** Simple async semaphore shared by all delegations in the process. */
class Semaphore {
    max;
    q = [];
    n = 0;
    constructor(max) {
        this.max = max;
    }
    async acquire() { if (this.n < this.max()) {
        this.n++;
        return;
    } await new Promise((r) => this.q.push(r)); this.n++; }
    release() { this.n--; const next = this.q.shift(); if (next)
        next(); }
}
let sem = null;
const BLOCKED_FOR_CHILDREN = new Set(["clarify", "memory", "skill_manage", "cronjob_manage", "pipeline_manage", "kanban"]);
export const delegateTool = {
    name: "delegate_task", toolset: "delegation", tier: "standard",
    description: "Delegate work to subagents with their own fresh context (they don't see this conversation — give them everything they need). " +
        "Use for independent research/coding subtasks or to parallelize. `tasks` runs several in parallel. Optional output_schema (JSON Schema) makes them return JSON.",
    parameters: obj({
        goal: str("single task description (or use tasks)"),
        tasks: arr(obj({ goal: str("task"), context: str("extra context") }, ["goal"]), "several independent tasks to run in parallel"),
        context: str("shared context for all subagents: files, constraints, what 'done' means"),
        tools: arr(str("tool name"), "restrict subagents to these tools"),
        output_schema: { type: "object", description: "JSON Schema the result must follow" },
        max_iterations: int("per-subagent iteration cap"),
        agent: str("optional: run the subagents as this configured agent (its instructions, tools and model)"),
    }),
    async handler(a, ctx) {
        const rt = ctx.rt;
        if (ctx.depth >= 2)
            return "error: maximum delegation depth reached — do this task yourself.";
        sem ??= new Semaphore(() => rt.cfg.data.delegation.max_concurrent);
        const tasks = Array.isArray(a.tasks) && a.tasks.length ? a.tasks : a.goal ? [{ goal: a.goal }] : [];
        if (!tasks.length)
            return "error: provide goal or tasks";
        const agentDef = a.agent ? rt.cfg.data.agents?.[a.agent] : undefined;
        if (a.agent && !agentDef)
            return `error: no agent "${a.agent}" (configured: ${Object.keys(rt.cfg.data.agents ?? {}).join(", ") || "none"})`;
        const parentTools = agentDef?.tools?.length ? agentDef.tools : rt.activeTools(ctx.session.id).map((t) => t.name);
        const allowed = new Set((Array.isArray(a.tools) && a.tools.length ? a.tools : parentTools).filter((n) => !BLOCKED_FOR_CHILDREN.has(n) && (ctx.depth < 1 || n !== "delegate_task")));
        const cap = Math.min(Number(a.max_iterations) || rt.cfg.data.delegation.max_iterations, rt.cfg.data.delegation.max_iterations);
        const schemaNote = a.output_schema ? `\n\nReturn your final answer as ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(a.output_schema)}` : "";
        const runOne = async (t, i) => {
            await sem.acquire();
            try {
                if (ctx.signal.aborted)
                    return { i, goal: t.goal, ok: false, out: "[interrupted]" };
                const child = rt.createSession({ source: "subagent", parent_id: ctx.session.id, title: `sub${a.agent ? `(${a.agent})` : ""}: ${t.goal.slice(0, 50)}`, cwd: ctx.cwd });
                if (a.agent)
                    rt.applyAgent(child.id, a.agent);
                rt.emitEvent(ctx.session.id, { type: "subagent", id: child.id, goal: t.goal, state: "started" });
                const fwd = (ev) => { if (ev.sessionId === child.id && ev.type === "tool_start")
                    rt.emitEvent(ctx.session.id, { type: "subagent", id: child.id, state: "tool", tool: ev.name }); };
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
                }
                finally {
                    rt.off("event", fwd);
                }
                ctx.budget.remaining -= before - budget.remaining;
                let out = r.final;
                if (a.output_schema) {
                    try {
                        out = JSON.stringify(repairJson(out), null, 2);
                    }
                    catch { /* leave as text */ }
                }
                rt.emitEvent(ctx.session.id, { type: "subagent", id: child.id, state: r.error ? "failed" : "done" });
                return { i, goal: t.goal, ok: !r.error && !r.interrupted, out, iterations: r.iterations, sid: child.id };
            }
            catch (e) {
                return { i, goal: t.goal, ok: false, out: `error: ${errMsg(e)}` };
            }
            finally {
                sem.release();
            }
        };
        const results = await Promise.all(tasks.map(runOne));
        if (results.length === 1)
            return results[0].out;
        return results.map((r) => `## Task ${r.i + 1}: ${r.goal}\n${r.ok ? "" : "(not fully completed)\n"}${r.out}`).join("\n\n");
    },
};

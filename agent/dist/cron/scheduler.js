/**
 * Durable cron scheduler. Jobs live in the state DB; the daemon ticks every
 * 30s (or an OS scheduler can call `harness cron tick`). Each run is a fresh
 * headless session; results are saved and delivered (log, chat platform, webhook).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { naturalToCron, nextCron, oneOffCron } from "../util/cron.js";
import { shortId, errMsg } from "../util/misc.js";
import { log } from "../util/log.js";
import { obj, str, enm, arr, bool } from "../tools/types.js";
/** Recurring phrase/cron first, then one-off times ("in 2h", "at 23:30", "tomorrow at 9"), which run once. */
export function parseSchedule(text) {
    try {
        return { expr: naturalToCron(text), once: false };
    }
    catch (e) {
        const o = oneOffCron(text);
        if (o)
            return { expr: o, once: true };
        throw e;
    }
}
export class CronScheduler {
    rt;
    running = new Set();
    constructor(rt) {
        this.rt = rt;
    }
    list() { return this.rt.db.listRecords("cron").sort((a, b) => a.next_run - b.next_run); }
    get(id) { return this.rt.db.getRecord("cron", id) ?? this.list().find((j) => j.name === id) ?? null; }
    create(p) {
        const { expr, once } = parseSchedule(p.schedule);
        const job = {
            id: shortId("cron_"), name: p.name || (p.goal ?? p.prompt).slice(0, 40), schedule: expr, schedule_text: p.schedule,
            prompt: p.prompt, skills: p.skills ?? [], deliver: p.deliver || "log", enabled: true,
            next_run: nextCron(expr).getTime(), runs: 0, created_at: Date.now(), once: p.once || once,
            ...(p.goal ? { goal: p.goal } : {}), ...(p.cwd ? { cwd: p.cwd } : {}),
        };
        this.rt.db.putRecord("cron", job.id, job);
        return job;
    }
    update(id, patch) {
        const j = this.get(id);
        if (!j)
            throw new Error(`no cron job ${id}`);
        const n = { ...j, ...patch };
        if (patch.schedule) {
            const ps = parseSchedule(patch.schedule);
            n.schedule = ps.expr;
            n.once = ps.once || n.once;
            n.schedule_text = patch.schedule;
            n.next_run = nextCron(n.schedule).getTime();
        }
        if (patch.enabled === true && !j.enabled)
            n.next_run = nextCron(n.schedule).getTime();
        this.rt.db.putRecord("cron", n.id, n);
        return n;
    }
    remove(id) { const j = this.get(id); if (!j)
        return false; this.rt.db.deleteRecord("cron", j.id); return true; }
    async tick() {
        if (!this.rt.cfg.data.cron.enabled)
            return 0;
        const now = Date.now();
        let fired = 0;
        for (const j of this.list()) {
            if (!j.enabled || j.next_run > now || this.running.has(j.id))
                continue;
            fired++;
            void this.run(j.id);
        }
        return fired;
    }
    async run(id) {
        const job = this.get(id);
        if (!job)
            throw new Error(`no cron job ${id}`);
        if (this.running.has(job.id))
            return "already running";
        this.running.add(job.id);
        // schedule next first so a crash never causes a tight re-fire loop (missed runs coalesce)
        this.rt.db.putRecord("cron", job.id, { ...job, next_run: nextCron(job.schedule).getTime() });
        let output = "", status = "ok";
        try {
            const skillHint = job.skills.length ? `First load these skills with skill_view: ${job.skills.join(", ")}.\n\n` : "";
            const r = await this.rt.runHeadless({ prompt: `${skillHint}${job.prompt}`, source: "cron", title: `${job.goal ? "goal" : "cron"}: ${job.name}`, approvalMode: this.rt.cfg.data.cron.approval_mode, goal: job.goal, cwd: job.cwd });
            output = r.final;
            if (r.error)
                status = "error";
        }
        catch (e) {
            output = `cron job failed: ${errMsg(e)}`;
            status = "error";
        }
        finally {
            this.running.delete(job.id);
        }
        const dir = join(this.rt.home, "cron", "output", job.id);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
        writeFileSync(file, `# ${job.name}\n\n${output}\n`);
        const cur = this.get(job.id);
        if (cur) {
            const upd = { ...cur, last_run: Date.now(), last_status: status, last_output: file, runs: cur.runs + 1 };
            if (cur.once)
                upd.enabled = false;
            this.rt.db.putRecord("cron", job.id, upd);
        }
        if (output.trim() && !/^\s*(NO_REPLY|\[SILENT\])\s*$/.test(output)) {
            await this.rt.deliver(job.deliver, `⏰ ${job.name}\n\n${output}`).catch((e) => log.warn(`cron delivery failed: ${errMsg(e)}`));
        }
        return output;
    }
}
export const cronTool = {
    name: "cronjob_manage", toolset: "cron", tier: "standard",
    description: "Schedule recurring or one-off agent jobs that run unattended (reports, checks, backups) and deliver results. Schedules: cron ('0 9 * * 1-5'), phrases ('every 30m', 'daily at 9:00', 'weekdays at 8:30', 'every monday at 10') or one-off times ('now', 'in 2h', 'at 23:30', 'tomorrow at 9'). deliver: 'log' (default), 'telegram:<chat_id>', 'discord:<channel_id>', 'slack:<channel>', 'webhook:<url>', 'session:<id>'.",
    parameters: obj({
        action: enm(["create", "list", "pause", "resume", "remove", "run", "update"], "operation"),
        id: str("job id or name (pause/resume/remove/run/update)"),
        name: str("job name"),
        schedule: str("when to run"),
        prompt: str("the instruction the job executes (self-contained; no chat context is available)"),
        goal: str("optional: run as a long task — the job keeps working turn after turn until this goal is judged done (use for big multi-step work)"),
        skills: arr(str("skill name"), "skills to load first"),
        deliver: str("where to send the result"),
        once: bool("run only once"),
    }, ["action"]),
    async handler(a, ctx) {
        const C = ctx.rt.cron;
        const fmt = (j) => `${j.id} "${j.name}" [${j.enabled ? "on" : "paused"}] ${j.schedule_text} (${j.schedule}) next ${new Date(j.next_run).toLocaleString()} → ${j.deliver}${j.last_status ? `; last ${j.last_status}` : ""}`;
        switch (a.action) {
            case "create": {
                if (!a.schedule || !a.prompt)
                    return "error: schedule and prompt are required";
                let deliver = a.deliver;
                if (!deliver && ctx.session.meta?.platform_target)
                    deliver = ctx.session.meta.platform_target;
                return `Scheduled: ${fmt(C.create({ name: a.name, schedule: a.schedule, prompt: a.prompt, skills: a.skills, deliver, once: a.once, goal: a.goal, cwd: ctx.cwd }))}`;
            }
            case "list": {
                const l = C.list();
                return l.length ? l.map(fmt).join("\n") : "No scheduled jobs.";
            }
            case "pause": return fmt(C.update(a.id, { enabled: false }));
            case "resume": return fmt(C.update(a.id, { enabled: true }));
            case "update": return fmt(C.update(a.id, { ...(a.name ? { name: a.name } : {}), ...(a.schedule ? { schedule: a.schedule } : {}), ...(a.prompt ? { prompt: a.prompt } : {}), ...(a.deliver ? { deliver: a.deliver } : {}) }));
            case "remove": return C.remove(a.id) ? "removed" : `no job ${a.id}`;
            case "run": {
                const out = await C.run(a.id);
                return `Ran job. Output:\n${out.slice(0, 3000)}`;
            }
            default: return `unknown action ${a.action}`;
        }
    },
};

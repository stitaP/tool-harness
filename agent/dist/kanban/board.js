import { shortId, errMsg } from "../util/misc.js";
import { log } from "../util/log.js";
import { obj, str, enm, arr, int, bool } from "../tools/types.js";
export class KanbanBoard {
    rt;
    active = new Set();
    constructor(rt) {
        this.rt = rt;
    }
    list(status) {
        return this.rt.db.listRecords("kanban").filter((c) => !status || c.status === status)
            .sort((a, b) => b.priority - a.priority || a.created_at - b.created_at);
    }
    get(id) { return this.rt.db.getRecord("kanban", id); }
    save(c) { c.updated_at = Date.now(); this.rt.db.putRecord("kanban", c.id, c); this.rt.emitEvent("*", { type: "kanban", card: c }); }
    create(p) {
        const c = { id: shortId("k_"), title: p.title, body: p.body ?? "", status: p.status ?? "ready", priority: p.priority ?? 0, depends_on: p.depends_on ?? [], review: !!p.review, comments: [], created_at: Date.now(), updated_at: Date.now(), attempts: 0 };
        this.save(c);
        return c;
    }
    update(id, patch) {
        const c = this.get(id);
        if (!c)
            throw new Error(`no card ${id}`);
        const n = { ...c, ...patch };
        this.save(n);
        return n;
    }
    comment(id, text, by = "agent") {
        const c = this.get(id);
        if (!c)
            throw new Error(`no card ${id}`);
        c.comments.push({ at: Date.now(), by, text });
        this.save(c);
        return c;
    }
    ready() {
        const all = this.list();
        const done = new Set(all.filter((c) => c.status === "done").map((c) => c.id));
        return all.filter((c) => c.status === "ready" && !this.active.has(c.id) && c.depends_on.every((d) => done.has(d)));
    }
    async tick() {
        if (!this.rt.cfg.data.kanban.enabled)
            return 0;
        const slots = Math.max(0, this.rt.cfg.data.kanban.workers - this.active.size);
        const cards = this.ready().slice(0, slots);
        for (const c of cards)
            void this.work(c.id);
        return cards.length;
    }
    async work(id) {
        let c = this.get(id);
        if (!c)
            throw new Error(`no card ${id}`);
        this.active.add(id);
        c = this.update(id, { status: "running", attempts: c.attempts + 1 });
        try {
            const deps = c.depends_on.map((d) => this.get(d)).filter(Boolean).map((d) => `- ${d.title}: ${(d.result ?? "").slice(0, 600)}`).join("\n");
            const prompt = `Kanban card ${c.id}: ${c.title}\n\n${c.body}${deps ? `\n\nResults of prerequisite cards:\n${deps}` : ""}${c.comments.length ? `\n\nComments:\n${c.comments.map((x) => `- ${x.by}: ${x.text}`).join("\n")}` : ""}\n\nComplete this card. Finish with a short report of what you did and the evidence.`;
            const r = await this.rt.runHeadless({ prompt, source: "kanban", title: `kanban: ${c.title}`, goal: `${c.title}\n${c.body}`, approvalMode: this.rt.cfg.data.cron.approval_mode });
            const status = r.goal?.status === "done" ? (c.review ? "review" : "done") : "blocked";
            c = this.update(id, { status, session_id: r.sessionId, result: r.final.slice(0, 8000) });
            if (status === "blocked")
                this.comment(id, `Worker stopped: ${r.goal?.last_reason ?? r.error ?? "not completed"}`, "worker");
        }
        catch (e) {
            log.error(`kanban card ${id} failed: ${errMsg(e)}`);
            c = this.update(id, { status: "blocked" });
            this.comment(id, `Worker error: ${errMsg(e)}`, "worker");
        }
        finally {
            this.active.delete(id);
        }
        await this.rt.deliver("log", `Kanban card ${c.id} "${c.title}" → ${c.status}`).catch(() => undefined);
        return c;
    }
}
export const kanbanTool = {
    name: "kanban", toolset: "kanban", tier: "full",
    description: "Kanban board for multi-task projects: create cards (with dependencies), list/show, update status, comment, and dispatch cards to background worker agents that run each card until done.",
    parameters: obj({
        action: enm(["create", "list", "show", "update", "comment", "dispatch"], "operation"),
        id: str("card id"),
        title: str("card title"),
        body: str("details / acceptance criteria"),
        status: enm(["backlog", "ready", "running", "review", "blocked", "done"], "status"),
        priority: int("higher runs first"),
        depends_on: arr(str("card id"), "cards that must be done first"),
        review: bool("require human review before done"),
        text: str("comment text"),
    }, ["action"]),
    async handler(a, ctx) {
        const K = ctx.rt.kanban;
        const fmt = (c) => `${c.id} [${c.status}] p${c.priority} ${c.title}${c.depends_on.length ? ` (after ${c.depends_on.join(",")})` : ""}`;
        switch (a.action) {
            case "create": return `Created ${fmt(K.create({ title: String(a.title ?? "untitled"), body: a.body, priority: a.priority, depends_on: a.depends_on, status: a.status, review: a.review }))}`;
            case "list": {
                const l = K.list(a.status);
                return l.length ? l.map(fmt).join("\n") : "Board is empty.";
            }
            case "show": {
                const c = K.get(a.id);
                return c ? `${fmt(c)}\n\n${c.body}\n\nComments:\n${c.comments.map((x) => `- ${x.by}: ${x.text}`).join("\n") || "(none)"}\n\nResult:\n${c.result ?? "(none)"}` : `no card ${a.id}`;
            }
            case "update": return fmt(K.update(a.id, { ...(a.title ? { title: a.title } : {}), ...(a.body ? { body: a.body } : {}), ...(a.status ? { status: a.status } : {}), ...(a.priority !== undefined ? { priority: a.priority } : {}), ...(a.depends_on ? { depends_on: a.depends_on } : {}) }));
            case "comment": return fmt(K.comment(a.id, String(a.text ?? ""), "agent"));
            case "dispatch": {
                const n = await K.tick();
                return `Dispatched ${n} card(s) to workers.`;
            }
            default: return `unknown action ${a.action}`;
        }
    },
};

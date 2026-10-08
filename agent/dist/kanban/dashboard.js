/**
 * Data for the web UI's Kanban tab: a slim board, one card in full (with what its worker agent is doing right now
 * and the evidence files), and safe access to evidence screenshots/reports. Read-only apart from what the board does.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
const STATUSES = ["backlog", "ready", "running", "review", "blocked", "done"];
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".webm": "video/webm", ".zip": "application/zip" };
const snip = (s, n = 220) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/** What the worker agent has been doing: its last few messages and tool calls. */
export function activity(rt, sessionId, n = 8) {
    if (!sessionId)
        return [];
    try {
        return rt.db.getMessages(sessionId).slice(-n).map((m) => ({
            at: m.created_at ?? 0, role: m.role,
            text: snip(m.role === "tool" ? `${m.name ?? "tool"}: ${m.content}` : m.content, m.role === "tool" ? 160 : 260),
            tools: (Array.isArray(m.tool_calls) ? m.tool_calls : []).map((t) => t?.name ?? t?.function?.name).filter(Boolean),
        }));
    }
    catch {
        return [];
    }
}
function slim(rt, c, byId) {
    return {
        id: c.id, key: c.key ?? c.id, type: c.type ?? "task", title: c.title, status: c.status, parent: c.parent ?? null, priority: c.priority, attempts: c.attempts,
        depends_on: c.depends_on.map((d) => byId.get(d)?.key ?? d), updated_at: c.updated_at, created_at: c.created_at, session_id: c.session_id ?? null,
        active: rt.kanban.isActive(c.id), commits: c.commits?.length ?? 0, comments: c.comments.length,
        test: c.test_result ? { code: c.test_result.code, at: c.test_result.at } : null, has_test: !!c.test_cmd,
        verification: c.verification ? { ok: c.verification.ok, at: c.verification.at, shots: c.verification.shots } : null,
    };
}
export function boardSummary(rt) {
    const all = rt.kanban.list();
    const byId = new Map(all.map((c) => [c.id, c]));
    const cards = all.map((c) => slim(rt, c, byId));
    const work = cards.filter((c) => c.type !== "epic");
    const counts = Object.fromEntries(STATUSES.map((s) => [s, work.filter((c) => c.status === s).length]));
    const epics = cards.filter((c) => c.type === "epic").map((e) => {
        const kids = work.filter((c) => c.parent === e.key);
        return { key: e.key, title: e.title, status: e.status, total: kids.length, done: kids.filter((k) => k.status === "done").length };
    });
    const working = all.filter((c) => c.status === "running" && c.type !== "epic").map((c) => ({ key: c.key ?? c.id, title: c.title, active: rt.kanban.isActive(c.id), attempts: c.attempts, session_id: c.session_id ?? null, activity: activity(rt, c.session_id, 4) }));
    const recent = all.flatMap((c) => (c.history ?? []).map((h) => ({ ...h, key: c.key ?? c.id, title: c.title }))).sort((a, b) => b.at - a.at).slice(0, 15);
    return { now: Date.now(), enabled: rt.cfg.data.kanban.enabled, workers: rt.cfg.data.kanban.workers, counts, total: work.length, epics, cards, working, recent };
}
function evidenceRoot(rt, c) { return join(rt.kanban.cwdOf(c), ".stitap", "evidence", c.key ?? c.id); }
function listEvidence(root) {
    const out = [];
    const walk = (d, depth) => {
        if (!existsSync(d) || depth > 3)
            return;
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const full = join(d, e.name);
            if (e.isDirectory())
                walk(full, depth + 1);
            else if (MIME[extname(e.name).toLowerCase()])
                out.push(relative(root, full).split(sep).join("/"));
        }
    };
    walk(root, 0);
    return out.sort();
}
export function cardDetail(rt, ref) {
    const c = rt.kanban.get(ref);
    if (!c)
        return null;
    const byId = new Map(rt.kanban.list().map((x) => [x.id, x]));
    const root = evidenceRoot(rt, c);
    const files = listEvidence(root);
    return {
        ...c, depends_on_keys: c.depends_on.map((d) => byId.get(d)?.key ?? d), active: rt.kanban.isActive(c.id),
        activity: activity(rt, c.session_id, 12), cwd_resolved: rt.kanban.cwdOf(c),
        evidence: { dir: root, shots: files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)), other: files.filter((f) => !/\.(png|jpe?g|webp)$/i.test(f)) },
        report: existsSync(join(root, "report.md")) ? readFileSync(join(root, "report.md"), "utf8").slice(0, 8000) : null,
        children: [...byId.values()].filter((x) => x.parent === c.key).map((x) => ({ key: x.key, title: x.title, status: x.status })),
    };
}
/** A file under a card's evidence folder. Path traversal and unknown types are refused. */
export function evidenceFile(rt, ref, rel) {
    const c = rt.kanban.get(ref);
    if (!c)
        return null;
    const root = resolve(evidenceRoot(rt, c));
    const file = resolve(root, rel);
    const type = MIME[extname(file).toLowerCase()];
    if (!type || !(file === root || file.startsWith(root + sep)) || !existsSync(file) || !statSync(file).isFile())
        return null;
    return { data: readFileSync(file), type };
}

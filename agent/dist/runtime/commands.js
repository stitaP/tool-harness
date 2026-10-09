/**
 * Slash commands — one table shared by the CLI, web chat, and messaging gateway.
 * Mutations that affect the system prompt or tool schema take effect next
 * session unless `--now` is passed (prompt-cache friendly).
 */
import { importPlan } from "../kanban/plan.js";
import { enrichBoard, describeEnrich } from "../kanban/enrich.js";
import { expandDocs, filterRange } from "../loop/pipeline.js";
import { existsSync } from "node:fs";
import { compressSession, estimateMessages } from "../loop/compression.js";
import { draftContract, goalKey, heartbeatKey, loopKey } from "../loop/autonomy.js";
import { PERSONALITIES } from "../prompt/builder.js";
import { fmtDuration, parseDuration, splitArgs } from "../util/misc.js";
import { exportSession } from "./export.js";
import { benchText } from "./bench.js";
import { RouterProvider } from "../providers/router.js";
const ok = (text) => ({ text });
function lastUserIndex(rt, sid) {
    const msgs = rt.db.getMessages(sid);
    for (let i = msgs.length - 1; i >= 0; i--)
        if (msgs[i].role === "user" && !msgs[i].meta?.compression_summary)
            return { msgs, i };
    return { msgs, i: -1 };
}
function sessionLine(rt, s, i) {
    const n = rt.db.getMessages(s.id).filter((m) => m.role === "user").length;
    return `${i !== undefined ? `${i + 1}. ` : ""}${s.id}  ${new Date(s.updated_at).toLocaleString()}  [${s.source}] ${s.title || "(untitled)"} — ${n} msg`;
}
const COMMANDS = [
    { name: "help", group: "general", usage: "/help", help: "List commands", handler: () => ok(helpText()) },
    { name: "new", aliases: ["reset"], group: "session", usage: "/new [title]", help: "Start a fresh conversation", handler: (a, c) => {
            const cur = c.rt.db.getSession(c.sid);
            const s = c.rt.createSession({ source: cur?.source ?? c.source, title: a.trim(), cwd: cur?.cwd, meta: cur?.meta?.platform_target ? { platform_target: cur.meta.platform_target } : {} });
            return { text: `New session ${s.id}`, switchTo: s.id, clear: true };
        } },
    { name: "sessions", aliases: ["history-list"], group: "session", usage: "/sessions [n]", help: "List recent sessions", handler: (a, c) => {
            const l = c.rt.db.listSessions({ limit: Number(a) || 15 });
            return ok(l.map((s, i) => sessionLine(c.rt, s, i)).join("\n") || "No sessions yet.");
        } },
    { name: "resume", group: "session", usage: "/resume <id|number>", help: "Switch to a previous session", handler: (a, c) => {
            const arg = a.trim();
            const list = c.rt.db.listSessions({ limit: 50 });
            const s = /^\d+$/.test(arg) ? list[Number(arg) - 1] : c.rt.db.getSession(arg) ?? list.find((x) => x.id.startsWith(arg) || x.title.toLowerCase().includes(arg.toLowerCase()));
            if (!s)
                return ok(`No session matching "${arg}". Use /sessions.`);
            return { text: `Resumed ${s.id} — ${s.title || "(untitled)"}`, switchTo: s.id, clear: true };
        } },
    { name: "title", group: "session", usage: "/title <text>", help: "Rename this session", handler: (a, c) => { c.rt.db.updateSession(c.sid, { title: a.trim() }); return ok(`Title set: ${a.trim()}`); } },
    { name: "retry", group: "session", usage: "/retry", help: "Re-run your last message", handler: (_a, c) => {
            if (c.rt.isBusy(c.sid))
                return ok("Busy — /stop first.");
            const { msgs, i } = lastUserIndex(c.rt, c.sid);
            if (i < 0)
                return ok("Nothing to retry.");
            const text = msgs[i].content ?? "";
            c.rt.db.archiveMessages(msgs.slice(i).map((m) => m.id));
            return { text: "Retrying…", send: text };
        } },
    { name: "undo", group: "session", usage: "/undo", help: "Remove your last message and the reply", handler: (_a, c) => {
            if (c.rt.isBusy(c.sid))
                return ok("Busy — /stop first.");
            const { msgs, i } = lastUserIndex(c.rt, c.sid);
            if (i < 0)
                return ok("Nothing to undo.");
            c.rt.db.archiveMessages(msgs.slice(i).map((m) => m.id));
            return ok(`Removed the last exchange: "${(msgs[i].content ?? "").slice(0, 80)}"`);
        } },
    { name: "branch", aliases: ["fork"], group: "session", usage: "/branch [title]", help: "Copy this conversation into a new session", handler: (a, c) => {
            const cur = c.rt.db.getSession(c.sid);
            const s = c.rt.createSession({ source: cur.source, parent_id: cur.id, title: a.trim() || `${cur.title} (branch)`, cwd: cur.cwd, system_prompt: cur.system_prompt, meta: { ...cur.meta } });
            for (const m of c.rt.db.getMessages(c.sid))
                c.rt.db.addMessage(s.id, { role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id, name: m.name, meta: m.meta });
            return { text: `Branched into ${s.id}`, switchTo: s.id };
        } },
    { name: "history", group: "session", usage: "/history [n]", help: "Show recent messages", handler: (a, c) => {
            const msgs = c.rt.db.getMessages(c.sid).filter((m) => m.role === "user" || (m.role === "assistant" && m.content)).slice(-(Number(a) || 10));
            return ok(msgs.map((m) => `${m.role === "user" ? "you" : "agent"}: ${(m.content ?? "").slice(0, 300)}`).join("\n\n") || "(empty)");
        } },
    { name: "export", group: "session", usage: "/export [md|json|sharegpt] [path]", help: "Export this session", handler: (a, c) => {
            const [fmt = "md", path] = splitArgs(a);
            const file = exportSession(c.rt, c.sid, fmt, path);
            return ok(`Exported to ${file}`);
        } },
    { name: "compress", aliases: ["compact"], group: "context", usage: "/compact [focus]", help: "Summarize older context now (it also happens automatically near the context limit)", handler: async (a, c) => {
            if (c.rt.isBusy(c.sid))
                return ok("Busy — try again when idle.");
            const r = await compressSession(c.rt, c.sid, { focus: a.trim() || undefined, reason: "manual" });
            return ok(r.ok ? `Compressed: ${r.note}` : `Not compressed: ${r.note}`);
        } },
    { name: "usage", group: "context", usage: "/usage", help: "Token usage for this session", handler: (_a, c) => {
            const rows = c.rt.db.usageSince(0, c.sid);
            const i = rows.reduce((n, r) => n + r.input_tokens, 0), o = rows.reduce((n, r) => n + r.output_tokens, 0);
            const msgs = c.rt.db.getMessages(c.sid);
            return ok(`This session: ${rows.length} model calls, ${i.toLocaleString()} input + ${o.toLocaleString()} output tokens.\nCurrent context ≈ ${estimateMessages(msgs).toLocaleString()} tokens of ${c.rt.providerFor(c.sid).contextWindow.toLocaleString()}.`);
        } },
    { name: "bench", group: "context", usage: "/bench [days]", help: "Speed and goal results per model and tool profile, by prompt size", handler: (a, c) => { const d = Math.max(1, Number(a) || 7); return ok(benchText(c.rt.bench.rows(d), d)); } },
    { name: "insights", group: "context", usage: "/insights [days]", help: "Usage across sessions", handler: (a, c) => ok(insights(c.rt, Number(a) || 7)) },
    { name: "model", group: "config", usage: "/model [name | provider:name | base_url=… | reset]", help: "Show or switch the model for this session", handler: (a, c) => {
            const s = c.rt.db.getSession(c.sid);
            const arg = a.trim();
            if (!arg) {
                const p = c.rt.providerFor(c.sid);
                return ok(`Model: ${p.model} (${p.id})${s.meta.model_override ? " [session override]" : ""}\nContext window: ${p.contextWindow}`);
            }
            if (arg === "reset") {
                c.rt.db.updateSession(c.sid, { meta: { ...s.meta, model_override: undefined } });
                return ok(`Model reset to ${c.rt.cfg.data.model.name}`);
            }
            const ov = {};
            for (const part of splitArgs(arg)) {
                const kv = /^([a-z_]+)=(.*)$/.exec(part);
                if (kv)
                    ov[kv[1]] = /^\d+$/.test(kv[2]) ? Number(kv[2]) : kv[2];
                else if (/^(openai|anthropic|ollama|openrouter|llamacpp|lmstudio|vllm|azure):/.test(part)) {
                    const [p, ...n] = part.split(":");
                    ov.provider = p === "anthropic" ? "anthropic" : "openai";
                    ov.name = n.join(":");
                }
                else
                    ov.name = part;
            }
            c.rt.db.updateSession(c.sid, { meta: { ...s.meta, model_override: { ...(s.meta.model_override ?? {}), ...ov } } });
            return ok(`Session model → ${JSON.stringify({ ...(s.meta.model_override ?? {}), ...ov })}. (Use \`harness config set model.name …\` to change the default.)`);
        } },
    { name: "route", group: "config", usage: "/route [auto | fast | strong]", help: "Model router: show which model is loaded and why, or pin fast/strong (auto picks per request)", handler: (a, c) => {
            const p = c.rt.providerFor(c.sid);
            if (!(p instanceof RouterProvider))
                return ok("The router is off. Enable it with: harness config set router.enabled true (and define router.models.fast / strong).");
            const arg = a.trim().toLowerCase();
            if (arg) {
                if (!["auto", "fast", "strong"].includes(arg))
                    return ok("Usage: /route [auto | fast | strong]");
                p.mode = arg;
            }
            const srv = p.server;
            if (p.resident) {
                const line = (t) => { const m = c.rt.cfg.data.router.models[t]; return m ? `${t}: ${m.name} — ${srv.isUp(t) ? `running on :${srv.portOf(t)}, ${srv.ctx[t].toLocaleString()}-token context` : `not running${srv.errors[t] ? ` (${srv.errors[t]})` : ""}`}` : `${t}: not configured`; };
                return ok(`Router mode: ${p.mode} (both models resident, no restarts)\n${line("strong")}\n${line("fast")}\nLast used: ${srv.current ?? "none"}\nLast decision: ${p.last ? `${p.last.tier} — ${p.last.reason}` : "none"}`);
            }
            return ok(`Router mode: ${p.mode}\nLoaded: ${srv.current ? `${srv.current} (${p.model}, ${srv.ctx[srv.current].toLocaleString()}-token context)` : "nothing yet"}${srv.external ? ` [external server ${srv.external}: no switching]` : ""}\nLast decision: ${p.last ? `${p.last.tier} — ${p.last.reason}` : "none"}`);
        } },
    { name: "tools", group: "config", usage: "/tools [list | disable <name> | enable <name>] [--now]", help: "Show or toggle tools", handler: (a, c) => {
            const [sub, name] = splitArgs(a.replace("--now", ""));
            const now = a.includes("--now");
            if (sub === "disable" || sub === "enable") {
                const cur = new Set(c.rt.cfg.data.tools.disabled);
                if (sub === "disable")
                    cur.add(name);
                else
                    cur.delete(name);
                c.rt.cfg.set("tools.disabled", [...cur]);
                if (now)
                    c.rt.refreshSystemPrompt(c.sid);
                return ok(`${sub}d ${name}${now ? " (applied now)" : " — takes effect in new sessions (add --now to apply here)"}`);
            }
            const act = c.rt.activeTools(c.sid);
            const more = c.rt.tools.discoverable(c.rt, act);
            const sb = c.rt.storeBridge.count;
            return ok(`Active (${act.length}): ${act.map((t) => t.name).join(", ")}\nDiscoverable via tool_search (${more.length}): ${more.map((t) => t.name).join(", ") || "none"}\nTool store: ${sb.executable} executable of ${sb.total} catalog tools`);
        } },
    { name: "skills", group: "learning", usage: "/skills [query]", help: "List skills", handler: (a, c) => {
            const q = a.trim().toLowerCase();
            const l = c.rt.skills.list().filter((s) => !q || `${s.name} ${s.description}`.toLowerCase().includes(q));
            return ok(l.map((s) => `/${s.name} — ${s.description.slice(0, 120)} [${s.source}]`).join("\n") || "No skills.");
        } },
    { name: "memory", group: "learning", usage: "/memory", help: "Show stored memory", handler: (_a, c) => ok(c.rt.memory.snapshot() || "Memory is empty.") },
    { name: "agent", group: "config", usage: "/agent [name | default | list]", help: "Show, list or switch this chat's agent (instructions, tools, model)", handler: (a, c) => {
            const n = a.trim();
            const defs = c.rt.cfg.data.agents ?? {};
            const cur = c.rt.db.getSession(c.sid)?.meta?.agent;
            if (!n)
                return ok(`This chat's agent: ${cur ?? "default"}. Available: default${Object.keys(defs).length ? ", " + Object.keys(defs).join(", ") : ""}. Configure agents in Settings (⚙) or under agents: in config.yaml.`);
            if (n === "list")
                return ok(["default — plain settings", ...Object.entries(defs).map(([k, d]) => `${k} — ${d.description || "(no description)"}`)].join("\n"));
            try {
                c.rt.applyAgent(c.sid, n);
            }
            catch (e) {
                return ok(e.message);
            }
            return ok(`Switched this chat to agent "${n}". Its instructions, tools and model apply from the next message.`);
        } },
    { name: "personality", group: "config", usage: "/personality [name|off]", help: "Set the personality for new turns (applies with --now or next session)", handler: (a, c) => {
            const n = a.replace("--now", "").trim();
            if (!n)
                return ok(`Personalities: ${Object.keys(PERSONALITIES).join(", ")} (or any free text)`);
            const s = c.rt.db.getSession(c.sid);
            c.rt.db.updateSession(c.sid, { meta: { ...s.meta, personality: n === "off" ? "" : n } });
            c.rt.refreshSystemPrompt(c.sid);
            return ok(`Personality: ${n}`);
        } },
    { name: "goal", group: "autonomy", usage: "/goal <text> | draft <text> | status | show | pause | resume | clear", help: "Standing goal: keep working until a judge confirms it's done", handler: async (a, c) => {
            const [sub, ...rest] = a.trim().split(/\s+/);
            const key = goalKey(c.sid);
            const g = c.rt.db.getMeta(key);
            const fmt = (x) => `Goal [${x.status}] ${x.turns}/${x.max_turns} turns\n${x.text}${x.contract ? `\nContract:\n${x.contract}` : ""}${x.last_reason ? `\nLast judgement: ${x.last_reason}` : ""}`;
            switch ((sub ?? "").toLowerCase()) {
                case "":
                case "status":
                case "show": return ok(g ? fmt(g) : "No goal set. Usage: /goal <what done looks like>");
                case "pause":
                    if (!g)
                        return ok("No goal.");
                    g.status = "paused";
                    c.rt.db.setMeta(key, g);
                    return ok("Goal paused.");
                case "resume":
                    if (!g)
                        return ok("No goal.");
                    g.status = "active";
                    g.turns = 0;
                    c.rt.db.setMeta(key, g);
                    return { text: "Goal resumed.", send: `Continue working on the goal: ${g.text}` };
                case "clear":
                    c.rt.db.deleteMeta(key);
                    return ok("Goal cleared.");
                case "draft": {
                    const text = rest.join(" ");
                    const contract = await draftContract(c.rt, text);
                    const ng = { text, contract, status: "active", turns: 0, max_turns: c.rt.cfg.data.goals.max_turns, created_at: Date.now() };
                    c.rt.db.setMeta(key, ng);
                    return { text: `Goal set with contract:\n${contract}`, send: `New goal: ${text}\n\nCompletion contract:\n${contract}\n\nStart now. Plan with todo_list, then execute.` };
                }
                default: {
                    const text = a.trim();
                    const ng = { text, status: "active", turns: 0, max_turns: c.rt.cfg.data.goals.max_turns, created_at: Date.now() };
                    c.rt.db.setMeta(key, ng);
                    return { text: `Goal set (max ${ng.max_turns} turns). Working…`, send: `New goal: ${text}\n\nWork autonomously until it is fully done and verified. Plan with todo_list, then execute.` };
                }
            }
        } },
    { name: "loop", group: "autonomy", usage: "/loop [every <dur>] <prompt> [--times N] [--until <condition>] | status | pause | resume | stop", help: "Re-run a prompt on an interval (or back-to-back) until complete", handler: (a, c) => {
            const key = loopKey(c.sid);
            const cur = c.rt.db.getMeta(key);
            const t = a.trim();
            if (!t || t === "status")
                return ok(cur ? `Loop [${cur.status}] ${cur.ticks} ticks, ${cur.mode === "dynamic" ? "back-to-back" : `every ${fmtDuration(cur.interval_ms)}`}: ${cur.prompt}${cur.last_reason ? `\n${cur.last_reason}` : ""}` : "No loop. Usage: /loop every 5m check the deploy --until it is green");
            if (t === "stop" || t === "clear") {
                c.rt.db.deleteMeta(key);
                return ok("Loop stopped.");
            }
            if (t === "pause" && cur) {
                cur.status = "paused";
                c.rt.db.setMeta(key, cur);
                return ok("Loop paused.");
            }
            if (t === "resume" && cur) {
                cur.status = "active";
                cur.next_at = Date.now();
                c.rt.db.setMeta(key, cur);
                return ok("Loop resumed.");
            }
            let rest = t, interval = 0, times, until;
            const ev = /^every\s+(\S+)\s+/i.exec(rest);
            if (ev) {
                interval = parseDuration(ev[1]) ?? 0;
                if (interval < 60_000)
                    return ok("Minimum loop interval is 60s.");
                rest = rest.slice(ev[0].length);
            }
            const tm = /\s--times\s+(\d+)/.exec(rest);
            if (tm) {
                times = Number(tm[1]);
                rest = rest.replace(tm[0], "");
            }
            const um = /\s--until\s+(.+)$/.exec(rest);
            if (um) {
                until = um[1].trim();
                rest = rest.replace(um[0], "");
            }
            const l = { prompt: rest.trim(), mode: interval ? "interval" : "dynamic", interval_ms: interval, times, until, ticks: 0, max_ticks: c.rt.cfg.data.loops.max_ticks, next_at: Date.now(), status: "active" };
            c.rt.db.setMeta(key, l);
            return ok(`Loop started (${interval ? `every ${fmtDuration(interval)}` : "back-to-back"}${times ? `, ${times} times` : ""}${until ? `, until: ${until}` : ""}).`);
        } },
    { name: "heartbeat", group: "autonomy", usage: "/heartbeat every <dur> <prompt> | status | pause | resume | clear", help: "Idle-only periodic check-in for this session", handler: (a, c) => {
            const key = heartbeatKey(c.sid);
            const cur = c.rt.db.getMeta(key);
            const t = a.trim();
            if (!t || t === "status")
                return ok(cur ? `Heartbeat [${cur.status}] every ${fmtDuration(cur.interval_ms)}, next in ${fmtDuration(Math.max(0, cur.next_at - Date.now()))}: ${cur.prompt}` : "No heartbeat.");
            if (t === "clear") {
                c.rt.db.deleteMeta(key);
                return ok("Heartbeat cleared.");
            }
            if (t === "pause" && cur) {
                cur.status = "paused";
                c.rt.db.setMeta(key, cur);
                return ok("Heartbeat paused.");
            }
            if (t === "resume" && cur) {
                cur.status = "active";
                cur.next_at = Date.now() + cur.interval_ms;
                c.rt.db.setMeta(key, cur);
                return ok("Heartbeat resumed.");
            }
            const m = /^every\s+(\S+)\s+([\s\S]+)$/i.exec(t);
            if (!m)
                return ok("Usage: /heartbeat every 10m <prompt>");
            const ms = parseDuration(m[1]);
            if (!ms || ms < 60_000)
                return ok("Minimum interval is 60s.");
            c.rt.db.setMeta(key, { prompt: m[2].trim(), interval_ms: ms, next_at: Date.now() + ms, status: "active", fires: 0 });
            return ok(`Heartbeat every ${fmtDuration(ms)}.`);
        } },
    { name: "stop", group: "control", usage: "/stop", help: "Interrupt the current turn and clear the queue", handler: (_a, c) => ok(c.rt.interrupt(c.sid, true) ? "Stopping…" : "Nothing running.") },
    { name: "steer", group: "control", usage: "/steer <text>", help: "Send guidance to the running turn without stopping it", handler: (a, c) => ok(c.rt.steer(c.sid, a.trim()) === "steered" ? "Steer queued for the next step." : "Sent as a new message.") },
    { name: "queue", group: "control", usage: "/queue <text>", help: "Queue a message to run after the current turn", handler: (a, c) => { void c.rt.send(c.sid, a.trim(), { source: c.source }); return ok("Queued."); } },
    { name: "approve", group: "control", usage: "/approve [session|always]", help: "Approve the pending dangerous action", handler: (a, c) => ok(c.rt.approvals.respondLatest(c.sid, a.trim() === "always" ? "always" : a.trim() === "session" ? "session" : "once") ? "Approved." : "Nothing pending.") },
    { name: "deny", group: "control", usage: "/deny", help: "Deny the pending action", handler: (_a, c) => ok(c.rt.approvals.respondLatest(c.sid, "deny") ? "Denied." : "Nothing pending.") },
    { name: "yolo", group: "control", usage: "/yolo [on|off]", help: "Auto-approve dangerous actions in this session", handler: (a, c) => {
            if (c.rt.cfg.isLocked("approvals.mode"))
                return ok("Approval mode is locked by administrator policy.");
            const on = a.trim() !== "off";
            if (on)
                c.rt.approvals.yoloSessions.add(c.sid);
            else
                c.rt.approvals.yoloSessions.delete(c.sid);
            return ok(on ? "YOLO on for this session — dangerous commands run without asking." : "YOLO off.");
        } },
    { name: "rollback", group: "files", usage: "/rollback [checkpoint]", help: "Restore files to a checkpoint", handler: (a, c) => {
            if (!a.trim()) {
                const l = c.rt.checkpoints.list(c.rt.sessionCwd(c.sid), 15);
                if (!l.length)
                    return ok("No checkpoints for this directory.");
                return ok(`Checkpoints (newest first) — /rollback <id>:\n${l.map((x) => `${x.id}  ${new Date(x.time).toLocaleString()}  ${x.message}`).join("\n")}`);
            }
            return ok(c.rt.checkpoints.rollback(c.rt.sessionCwd(c.sid), a.trim()));
        } },
    { name: "diff", group: "files", usage: "/diff [checkpoint]", help: "Show changes since the last (or given) checkpoint", handler: (a, c) => ok(c.rt.checkpoints.diff(c.rt.sessionCwd(c.sid), a.trim() || undefined).slice(0, 20000)) },
    { name: "cwd", aliases: ["cd"], group: "files", usage: "/cwd [path]", help: "Show or change the working directory", handler: async (a, c) => {
            if (!a.trim())
                return ok(c.rt.sessionCwd(c.sid));
            const { resolvePath } = await import("../safety/paths.js");
            const { existsSync } = await import("node:fs");
            const p = resolvePath(c.rt.sessionCwd(c.sid), a.trim());
            if (!existsSync(p))
                return ok(`No such directory: ${p}`);
            c.rt.setSessionCwd(c.sid, p, { remember: true });
            return ok(`cwd → ${p}`);
        } },
    { name: "schedule", group: "automation", usage: "/schedule <when> | <task>   (or /schedule list)", help: "Run a long task later as a goal in its own session, e.g. /schedule in 2h | build the API in PLAN.md", handler: (a, c) => {
            const text = a.trim();
            if (!text || text === "list") {
                const jobs = c.rt.cron.list().filter((j) => j.goal);
                return ok(jobs.map((j) => `${j.id} [${j.enabled ? "on" : "done/off"}] ${j.schedule_text} → next ${new Date(j.next_run).toLocaleString()}: ${j.name}`).join("\n") || "No scheduled long tasks. Usage: /schedule <when> | <task>");
            }
            const bar = text.indexOf("|");
            if (bar < 0)
                return ok("Usage: /schedule <when> | <task>   e.g. /schedule tonight at 11 | refactor src/api and make the tests pass");
            const when = text.slice(0, bar).trim(), task = text.slice(bar + 1).trim();
            if (!when || !task)
                return ok("Both a time and a task are needed: /schedule <when> | <task>");
            try {
                const j = c.rt.cron.create({
                    schedule: when, goal: task, cwd: c.rt.sessionCwd(c.sid), deliver: `session:${c.sid}`,
                    prompt: `${task}\n\nThis is a long unattended task: first write a plan with todo_list (group items with phase), then work through it item by item, marking items done with todo_list action=update.`,
                });
                return ok(`Scheduled ${j.id}: "${j.name}" ${j.once ? "once" : "repeating"} — next run ${new Date(j.next_run).toLocaleString()} in ${j.cwd}. It runs as a goal in its own session (see the chat list) and reports back here.`);
            }
            catch (e) {
                return ok(`Could not schedule: ${e.message}`);
            }
        } },
    { name: "pipeline", group: "automation", usage: "/pipeline start <docs or glob> [--from N] [--to N] [--check \"cmd\"] [--timeout MIN] [--turns N] [--attempts N] | status | list | pause | resume | skip | retry | stop | report", help: "Work through many spec documents one after another, unattended; stuck ones are skipped; one cumulative plan; report at the end", handler: (a, c) => {
            const P = c.rt.pipelines;
            const [sub = "status", ...rest] = splitArgs(a);
            if (sub === "start") {
                const flags = {};
                const files = [];
                for (let i = 0; i < rest.length; i++) {
                    if (rest[i].startsWith("--"))
                        flags[rest[i].slice(2)] = rest[++i] ?? "";
                    else
                        files.push(rest[i]);
                }
                if (!files.length)
                    return ok("Usage: /pipeline start Idea_plan/phase-*.md --from 6   (documents run in order; relative paths use this chat's folder)");
                const cwd = c.rt.sessionCwd(c.sid);
                const num = (k) => (flags[k] !== undefined && flags[k] !== "" ? Number(flags[k]) : undefined);
                const paths = filterRange(expandDocs(cwd, files), num("from"), num("to"));
                if (!paths.length)
                    return ok(`No documents matched ${files.join(" ")} in ${cwd}.`);
                try {
                    const st = P.start(c.sid, cwd, paths, { check: flags.check, maxTurns: num("turns"), timeoutMin: num("timeout"), maxAttempts: num("attempts") });
                    const checks = st.items.filter((i) => i.check).length;
                    return ok(`Pipeline started: ${st.items.length} documents in order (${st.items.map((i) => i.name).join(", ")}).\nEach runs as a goal in its own chat in ${cwd}; ${checks} have a test the pipeline checks itself. Stuck documents are skipped and retried once at the end. The plan on the right covers all documents; the report comes here at the end. /pipeline status to follow.`);
                }
                catch (e) {
                    return ok(e.message);
                }
            }
            if (sub === "list")
                return ok(P.list().map((x) => P.describe(x)).join("\n") || "No pipelines yet.");
            const f = P.find(c.sid);
            if (!f)
                return ok("No pipeline. Start one: /pipeline start Idea_plan/phase-*.md --from 6");
            if ("ambiguous" in f)
                return ok(`Several pipelines are running; run the command in the chat that started the one you mean:\n${f.ambiguous.map((x) => P.describe(x)).join("\n")}`);
            const s = f.state, o = s.originSid;
            const where = f.elsewhere ? " (started in another chat)" : "";
            if (sub === "status")
                return ok(P.describe(s) + where);
            if (sub === "pause") {
                P.setStatus(o, "paused");
                return ok(`Pipeline paused after the current document${where}.`);
            }
            if (sub === "resume") {
                P.setStatus(o, "active");
                return ok(`Pipeline resumed${where}.`);
            }
            if (sub === "stop") {
                P.setStatus(o, "stopped");
                return ok(`Pipeline stopped${where}; the running document was interrupted.`);
            }
            if (sub === "skip")
                return ok(P.skip(o));
            if (sub === "retry") {
                P.retry(o);
                return ok(`Retrying stuck documents${where}.`);
            }
            if (sub === "report")
                return ok(s.report ?? P.report(s));
            return ok("Usage: /pipeline [start … | status | list | pause | resume | skip | retry | stop | report]");
        } },
    { name: "cron", group: "automation", usage: "/cron [list | add \"<schedule>\" <task> | run <id> | pause <id> | resume <id> | remove <id>]", help: "Manage scheduled jobs", handler: async (a, c) => {
            const [sub = "list", id] = splitArgs(a);
            const C = c.rt.cron;
            if (sub === "list")
                return ok(C.list().map((j) => `${j.id} [${j.enabled ? "on" : "off"}] ${j.schedule_text} → ${j.deliver}: ${j.name}`).join("\n") || "No jobs. Add one: /cron add \"daily at 9:00\" <task>");
            if (sub === "add") {
                // /cron add "<schedule>" <task>   or   /cron add <schedule> | <task>
                const m = /^add\s+(?:"([^"]+)"|'([^']+)'|([^|]+?)\s*\|)\s*([\s\S]+)$/.exec(a.trim());
                if (!m)
                    return ok('Usage: /cron add "<schedule>" <task>   e.g. /cron add "every 30m" check the build — or /cron add daily at 9:00 | summarise new issues');
                try {
                    const j = C.create({ schedule: (m[1] ?? m[2] ?? m[3]).trim(), prompt: m[4].trim(), deliver: `session:${c.sid}`, cwd: c.rt.sessionCwd(c.sid) });
                    return ok(`Scheduled ${j.id}: "${j.name}" ${j.schedule_text}${j.once ? " (once)" : ""} — next ${new Date(j.next_run).toLocaleString()}; results come to this chat.`);
                }
                catch (e) {
                    return ok(`Could not schedule: ${e.message}`);
                }
            }
            if (sub === "run")
                return ok((await C.run(id)).slice(0, 4000));
            if (sub === "pause") {
                C.update(id, { enabled: false });
                return ok("Paused.");
            }
            if (sub === "resume") {
                C.update(id, { enabled: true });
                return ok("Resumed.");
            }
            if (sub === "remove")
                return ok(C.remove(id) ? "Removed." : "Not found.");
            return ok('Usage: /cron [list | add "<schedule>" <task> | run <id> | pause <id> | resume <id> | remove <id>]');
        } },
    { name: "kanban", group: "automation", usage: "/kanban [enrich | boards | board new|use|rename|archive|unarchive|clear|delete|save <name> | restore <file> | move <keys> to <board> | link <key> <type> <key> | unlink <key> <key> | list | board | report | show <key> | add <title> | comment <key> <text> | reply <key> <comment-id> <text> | run | resume | test <key> | verify <key> | gentests <key> | regression [key] | sync <key> | import <planDir> [projectDir] [testsDir]]", help: "Jira-style kanban board", handler: async (a, c) => {
            const [sub = "list", ...rest] = splitArgs(a);
            const K = c.rt.kanban;
            try {
                if (sub === "enrich")
                    return ok(describeEnrich(await enrichBoard(c.rt, { board: rest[0] })));
                if (sub === "boards")
                    return ok(K.describeBoards());
                if (sub === "board" && rest.length) {
                    const [act, ...r] = rest;
                    const nm = r.join(" ");
                    if (act === "new") {
                        const b = K.boards.create(nm);
                        K.boards.use(b.id);
                        return ok(`Board "${b.name}" created and active.`);
                    }
                    if (act === "use")
                        return ok(`Active board: "${K.boards.use(nm).name}"`);
                    if (act === "rename") {
                        const [from, ...to] = r;
                        return ok(`Renamed to "${K.boards.rename(from, to.join(" ")).name}"`);
                    }
                    if (act === "archive")
                        return ok(`Archived "${K.boards.archive(nm).name}"`);
                    if (act === "unarchive")
                        return ok(`Unarchived "${K.boards.unarchive(nm).name}"`);
                    if (act === "save")
                        return ok(`Saved to ${K.boards.save(nm || K.boards.active().name)}`);
                    if (act === "restore")
                        return ok(`Restored as "${K.boards.restore(r[0], r.slice(1).join(" ") || undefined).name}" (use it with /kanban board use <name>)`);
                    if (act === "clear" || act === "delete") {
                        const yes = r.includes("--yes");
                        const target = r.filter((x) => x !== "--yes").join(" ") || K.boards.active().name;
                        if (!yes)
                            return ok(`This ${act === "clear" ? "removes every ticket from" : "deletes"} "${target}". A snapshot is saved first. Repeat with --yes: /kanban board ${act} ${target} --yes`);
                        const x = act === "clear" ? K.boards.clear(target) : K.boards.delete(target);
                        return ok(`Removed ${x.removed} ticket(s). Snapshot: ${x.snapshot} (restore with /kanban board restore <file>)`);
                    }
                    return ok("Usage: /kanban board new|use|rename|archive|unarchive|clear|delete|save|restore <name>");
                }
                if (sub === "move") {
                    const i = rest.lastIndexOf("to");
                    if (i < 1)
                        return ok("Usage: /kanban move PT-1 PT-2 to <board>");
                    return ok(`Moved ${K.boards.move(rest.slice(0, i), rest.slice(i + 1).join(" "))} ticket(s).`);
                }
                if (sub === "link") {
                    const [a, ...m] = rest;
                    const b = m.pop() ?? "";
                    const r = K.boards.link(a, m.join(" ") || "relates to", b);
                    return ok(`${K.get(a)?.key} ${r.type} ${r.key}${r.pending ? " (pending: that ticket does not exist yet)" : ""}`);
                }
                if (sub === "unlink")
                    return ok(`Removed ${K.boards.unlink(rest[0], rest[1])} link(s).`);
                if (sub === "add") {
                    const k = K.create({ title: rest.join(" ") });
                    return ok(`Added ${k.key} (${k.id})`);
                }
                if (sub === "run")
                    return ok(`Dispatched ${await K.tick()} card(s).`);
                if (sub === "resume") {
                    const r = K.recover();
                    return ok(`Re-queued ${r.length} interrupted card(s); dispatched ${await K.tick()}.`);
                }
                if (sub === "show")
                    return ok(K.show(rest[0]));
                if (sub === "board")
                    return ok(K.board());
                if (sub === "report")
                    return ok(K.report());
                if (sub === "comment") {
                    K.comment(rest[0], rest.slice(1).join(" "), "user");
                    return ok("Comment added.");
                }
                if (sub === "reply") {
                    K.comment(rest[0], rest.slice(2).join(" "), "user", rest[1]);
                    return ok("Reply added.");
                }
                if (sub === "test") {
                    const t = await K.runTests(rest[0]);
                    return ok(`exit ${t.code}\n${t.output}`);
                }
                if (sub === "verify")
                    return ok((await K.verify(rest[0])).markdown);
                if (sub === "gentests")
                    return ok(`Wrote ${K.genTests(rest[0])}`);
                if (sub === "regression")
                    return ok(await K.regression(rest[0]));
                if (sub === "sync")
                    return ok(`Linked ${await K.syncCommits(rest[0])} new commit(s).`);
                if (sub === "import")
                    return ok(importPlan(K, { planDir: rest[0], projectDir: rest[1], testsDir: rest[2] }));
            }
            catch (e) {
                return ok(`kanban: ${e.message}`);
            }
            return ok(K.list().map((k) => K.fmt(k)).join("\n") || "Board is empty.");
        } },
    { name: "mcp", group: "integrations", usage: "/mcp", help: "MCP server status", handler: (_a, c) => ok(c.rt.mcp.summary()) },
    { name: "reload-mcp", group: "integrations", usage: "/reload-mcp", help: "Restart MCP servers (new tools apply to new sessions)", handler: async (_a, c) => ok(await c.rt.mcp.reload()) },
    { name: "reload", group: "config", usage: "/reload", help: "Reload config.yaml and .env", handler: (_a, c) => { c.rt.cfg.reload(); c.rt.resetProviders(); c.rt.skills.invalidate(); return ok("Config reloaded."); } },
    { name: "plugins", group: "integrations", usage: "/plugins", help: "Loaded plugins", handler: (_a, c) => ok(c.rt.hooks.loaded.map((p) => `${p.name}: ${p.error ? `ERROR ${p.error}` : `${p.tools.length} tools`}`).join("\n") || "No plugins in ~/.stitap/plugins.") },
    { name: "status", group: "general", usage: "/status", help: "Session status", handler: (_a, c) => {
            const s = c.rt.db.getSession(c.sid);
            const g = c.rt.db.getMeta(goalKey(c.sid));
            const procs = c.rt.processes.list(c.sid).filter((p) => p.status === "running");
            return ok([`Session ${s.id} "${s.title}" [${s.source}]`, `Model: ${c.rt.providerFor(c.sid).model}`, `cwd: ${c.rt.sessionCwd(c.sid)}`, `Busy: ${c.rt.isBusy(c.sid)}`, `Approvals: ${c.rt.approvals.yoloSessions.has(c.sid) ? "yolo" : c.rt.cfg.data.approvals.mode}`, g ? `Goal: [${g.status}] ${g.text.slice(0, 80)}` : "Goal: none", `Background processes: ${procs.length}`].join("\n"));
        } },
];
export function insights(rt, days) {
    const since = Date.now() - days * 86400_000;
    const rows = rt.db.usageSince(since);
    const byModel = new Map();
    for (const r of rows) {
        const m = byModel.get(r.model) ?? { calls: 0, i: 0, o: 0 };
        m.calls++;
        m.i += r.input_tokens;
        m.o += r.output_tokens;
        byModel.set(r.model, m);
    }
    const sessions = rt.db.listSessions({ limit: 1000, includeChildren: true }).filter((s) => s.updated_at >= since);
    const bySource = new Map();
    for (const s of sessions)
        bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1);
    return [`Last ${days} day(s): ${sessions.length} sessions, ${rows.length} model calls`,
        ...[...byModel].map(([m, v]) => `  ${m}: ${v.calls} calls, ${v.i.toLocaleString()} in / ${v.o.toLocaleString()} out tokens`),
        `Sessions by surface: ${[...bySource].map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`,
        `Skills: ${rt.skills.list().length} (${rt.skills.list().filter((s) => s.source === "user").length} learned/user) · Memory: ${rt.memory.size("memory")}/${rt.memory.limit("memory")} + user ${rt.memory.size("user")}/${rt.memory.limit("user")} chars`,
        `Scheduled jobs: ${rt.cron.list().length} · Kanban cards: ${rt.kanban.list().length}`].join("\n");
}
function helpText() {
    const groups = new Map();
    for (const c of COMMANDS) {
        if (!groups.has(c.group))
            groups.set(c.group, []);
        groups.get(c.group).push(c);
    }
    return [...groups].map(([g, cs]) => `${g.toUpperCase()}\n${cs.map((c) => `  ${c.usage.padEnd(44)} ${c.help}`).join("\n")}`).join("\n\n") +
        "\n\nSKILLS\n  /<skill-name> [request]                      Run a task with a skill loaded";
}
export function commandNames() {
    return COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
}
export function listCommands() { return COMMANDS.map((c) => ({ name: c.name, usage: c.usage, help: c.help, group: c.group })); }
const COMMAND_RE = /^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/;
/**
 * Is this chat line a slash command (vs. a message that merely starts with "/", like a pasted path
 * "/Users/me/project/IDEA.md implement this")? The name must end at whitespace or end of line, and a bare
 * "/name" that exists on disk (e.g. "/tmp") is a path unless it is a known command or skill.
 */
export function looksLikeCommand(line, rt) {
    const m = COMMAND_RE.exec(line.trim());
    if (!m)
        return false;
    const name = m[1].toLowerCase();
    if (COMMANDS.some((x) => x.name === name || x.aliases?.includes(name)) || rt?.skills.get(name))
        return true;
    return !existsSync("/" + m[1]);
}
export async function runCommand(line, c) {
    const m = COMMAND_RE.exec(line.trim());
    if (!m)
        return null;
    const name = m[1].toLowerCase(), args = m[2] ?? "";
    const cmd = COMMANDS.find((x) => x.name === name || x.aliases?.includes(name));
    if (cmd)
        return cmd.handler(args, c);
    const skill = c.rt.skills.get(name);
    if (skill) {
        return { send: `Use the "${skill.name}" skill for this. Load it with skill_view first.\n\n${args.trim() || "Run it."}` };
    }
    return { text: `Unknown command /${name}. Try /help.` };
}

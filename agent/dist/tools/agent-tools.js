import { STORE_ALIASES } from "../runtime/store-bridge.js";
import { obj, str, int, bool, enm, arr } from "./types.js";
import { parseToolArgs } from "../util/jsonrepair.js";
const TODO_MAX = 500;
const ICON = { pending: "[ ]", in_progress: "[~]", completed: "[x]", cancelled: "[-]" };
const todoKey = (sid) => `todo:${sid}`;
const line = (t) => `${ICON[t.status] ?? "[ ]"} ${t.id}. ${t.content}`;
/** Compact plan view: totals, per-phase progress, the item in progress and the next pending ones. Null when empty. */
export function planProgress(rt, sid, next = 8) {
    const todos = rt.db.getMeta(todoKey(sid)) ?? [];
    if (!todos.length)
        return null;
    const done = todos.filter((t) => t.status === "completed" || t.status === "cancelled").length;
    const out = [`${done}/${todos.length} done`];
    const phases = [...new Set(todos.map((t) => t.phase).filter(Boolean))];
    if (phases.length > 1)
        out.push(...phases.map((ph) => {
            const items = todos.filter((t) => t.phase === ph);
            const d = items.filter((t) => t.status === "completed" || t.status === "cancelled").length;
            return `  ${d === items.length ? "✓" : d ? "…" : " "} ${ph}: ${d}/${items.length}`;
        }));
    const cur = todos.filter((t) => t.status === "in_progress");
    if (cur.length)
        out.push("In progress:", ...cur.map(line));
    const pending = todos.filter((t) => t.status === "pending");
    if (pending.length)
        out.push(`Next${pending.length > next ? ` (${next} of ${pending.length} pending)` : ""}:`, ...pending.slice(0, next).map(line));
    return out.join("\n");
}
export const todoTool = {
    name: "todo_list", toolset: "planning", tier: "slm",
    description: "Your task plan for multi-step work (up to 500 items; survives context compaction; the user sees it live). " +
        "Big plans: create once with action=write (group items with `phase`), then add items with action=add and change status with action=update — never resend the whole list. " +
        "Keep exactly one item in_progress. action=read shows progress and next items (full=true for every item).",
    parameters: obj({
        action: enm(["write", "add", "update", "read"], "write = replace the plan, add = append items, update = change items by id, read = show"),
        todos: arr(obj({ id: str("short id (auto-numbered if omitted)"), content: str("task"), status: enm(["pending", "in_progress", "completed", "cancelled"], "status"), phase: str("optional group, e.g. 'Phase 2: API'") }, []), "items for write/add; for update only id plus the fields that change"),
        full: bool("read: list every item"),
    }, ["action"]),
    async handler(a, ctx) {
        const key = todoKey(ctx.session.id);
        let todos = ctx.rt.db.getMeta(key) ?? [];
        const items = Array.isArray(a.todos) ? a.todos : [];
        const nextId = () => String(todos.reduce((n, t) => Math.max(n, Number(t.id) || 0), 0) + 1);
        const make = (t) => ({ id: String(t.id ?? nextId()), content: String(t.content ?? ""), status: t.status ?? "pending", ...(t.phase ? { phase: String(t.phase) } : {}) });
        let note = "";
        if (a.action === "write") {
            todos = [];
            for (const t of items)
                todos.push(make(t));
        }
        else if (a.action === "add") {
            for (const t of items) {
                const n = make(t);
                if (todos.some((x) => x.id === n.id))
                    n.id = nextId();
                todos.push(n);
            }
        }
        else if (a.action === "update") {
            const missing = [];
            for (const u of items) {
                const t = todos.find((x) => x.id === String(u.id));
                if (!t) {
                    missing.push(String(u.id));
                    continue;
                }
                if (u.status)
                    t.status = u.status;
                if (u.content)
                    t.content = String(u.content);
                if (u.phase)
                    t.phase = String(u.phase);
            }
            if (missing.length)
                note = `\n(no item with id ${missing.join(", ")} — read the plan for the right ids)`;
        }
        if (a.action !== "read") {
            if (todos.length > TODO_MAX)
                return `error: plans are limited to ${TODO_MAX} items; group work into larger items`;
            ctx.rt.db.setMeta(key, todos);
            ctx.rt.emitEvent(ctx.session.id, { type: "todo", todos });
        }
        if (!todos.length)
            return "Todo list is empty.";
        if (a.full || todos.length <= 25) {
            const done = todos.filter((t) => t.status === "completed").length;
            let cur = "";
            const rows = todos.map((t) => { const h = t.phase && t.phase !== cur ? `${(cur = t.phase)}\n` : ""; return h + line(t); });
            return `${done}/${todos.length} done\n${rows.join("\n")}${note}`;
        }
        return planProgress(ctx.rt, ctx.session.id) + note;
    },
};
export const memoryTool = {
    name: "memory", toolset: "memory", tier: "slm",
    description: "Persistent memory across sessions. target=user for facts about the user (preferences, role, style); target=memory for your own notes (environment facts, project conventions, lessons learned). " +
        "Save durable, reusable facts — not task progress. Memory is bounded: when full, consolidate with replace/remove.",
    parameters: obj({
        action: enm(["add", "replace", "remove", "view"], "operation"),
        target: enm(["memory", "user"], "which store (default memory)"),
        content: str("text to add / replacement text"),
        old_text: str("substring identifying the entry to replace/remove"),
    }, ["action"]),
    async handler(a, ctx) {
        const M = ctx.rt.memory, t = a.target === "user" ? "user" : "memory";
        switch (a.action) {
            case "add": return M.add(t, String(a.content ?? ""));
            case "replace": return M.replace(t, String(a.old_text ?? ""), String(a.content ?? ""));
            case "remove": return M.remove(t, String(a.old_text ?? ""));
            default: {
                const es = M.entries(t);
                return `${t} (${M.size(t)}/${M.limit(t)} chars):\n${es.map((e) => `- ${e}`).join("\n") || "(empty)"}\nNote: changes apply to the system prompt from the next session.`;
            }
        }
    },
};
export const skillsListTool = {
    name: "skills_list", toolset: "skills", tier: "standard", parallelSafe: true,
    description: "List available skills (reusable procedures) with their descriptions, optionally filtered by category or keyword.",
    parameters: obj({ query: str("keyword filter"), category: str("category filter") }),
    async handler(a, ctx) {
        let l = ctx.rt.skills.list();
        if (a.category)
            l = l.filter((s) => s.category === a.category);
        if (a.query) {
            const q = String(a.query).toLowerCase();
            l = l.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q));
        }
        return l.length ? l.map((s) => `${s.category}/${s.name}: ${s.description}`).join("\n") : "no skills found";
    },
};
export const skillViewTool = {
    name: "skill_view", toolset: "skills", tier: "slm", parallelSafe: true,
    description: "Load a skill's full instructions (SKILL.md) before doing a task it covers. Optional `file` loads a supporting file from the skill.",
    parameters: obj({ name: str("skill name"), file: str("supporting file path inside the skill") }, ["name"]),
    async handler(a, ctx) { return ctx.rt.skills.view(String(a.name), a.file); },
};
export const skillManageTool = {
    name: "skill_manage", toolset: "skills", tier: "standard",
    description: "Create or improve skills — your procedural memory. Save a skill only for a reusable procedure (a workflow the user will want again, a tricky fix that will recur) — never for one project's tasks or phases. " +
        "a concise SKILL.md with when-to-use, steps, commands, pitfalls and verification. Patch existing skills when you find they are wrong or incomplete.",
    parameters: obj({
        action: enm(["create", "patch", "edit", "write_file", "delete"], "operation"),
        name: str("skill name (lowercase-with-dashes)"),
        description: str("one sentence: what it does and WHEN to use it (create)"),
        content: str("markdown body (create), full SKILL.md (edit), or file content (write_file)"),
        category: str("category folder (create; default 'learned')"),
        old_string: str("text to replace (patch)"),
        new_string: str("replacement (patch)"),
        file: str("supporting file path (write_file)"),
    }, ["action", "name"]),
    async handler(a, ctx) {
        const S = ctx.rt.skills;
        switch (a.action) {
            case "create": {
                const existed = S.get(String(a.name))?.source === "user";
                const s = S.create(String(a.name), String(a.description ?? ""), String(a.content ?? ""), a.category || "learned", {}, true);
                ctx.rt.emitEvent(ctx.session.id, { type: "skill_saved", name: s.name });
                return `${existed ? "Updated existing" : "Created"} skill ${s.name} at ${s.path}`;
            }
            case "edit":
                S.write(String(a.name), String(a.content ?? ""));
                return `Updated ${a.name}`;
            case "patch": {
                const { applyEdit } = await import("./files.js");
                const cur = S.view(String(a.name)).replace(/\n\n\[Supporting files[\s\S]*$/, "");
                S.write(String(a.name), applyEdit(cur, String(a.old_string ?? ""), String(a.new_string ?? ""), false).text);
                return `Patched ${a.name}`;
            }
            case "write_file":
                S.writeFile(String(a.name), String(a.file ?? ""), String(a.content ?? ""));
                return `Wrote ${a.file} in ${a.name}`;
            case "delete":
                S.delete(String(a.name));
                return `Deleted ${a.name} (moved to skills/.trash)`;
            default: return `unknown action ${a.action}`;
        }
    },
};
export const sessionSearchTool = {
    name: "session_search", toolset: "memory", tier: "standard", parallelSafe: true,
    description: "Search past conversations (all sessions) by keywords to recall earlier work, decisions or user-provided details. summarize=true returns a focused summary.",
    parameters: obj({ query: str("keywords"), limit: int("max hits (default 8)"), summarize: bool("summarize findings with the auxiliary model") }, ["query"]),
    async handler(a, ctx) {
        const hits = ctx.rt.db.search(String(a.query), Math.min(Number(a.limit) || 8, 30));
        if (!hits.length)
            return "no matches in past sessions";
        const text = hits.map((h) => `[${new Date(h.created_at).toISOString().slice(0, 16).replace("T", " ")}] session ${h.session_id}${h.title ? ` "${h.title}"` : ""} (${h.role}): ${h.snippet.replace(/\s+/g, " ")}`).join("\n");
        if (!a.summarize)
            return text;
        try {
            const r = await ctx.rt.aux().chat({ messages: [
                    { role: "system", content: "Summarize what these past-conversation excerpts say about the query. Be factual and brief; cite session ids." },
                    { role: "user", content: `Query: ${a.query}\n\nExcerpts:\n${text}` },
                ], maxTokens: 600, signal: ctx.signal, stream: false });
            return `${r.content}\n\n(raw hits)\n${text}`;
        }
        catch {
            return text;
        }
    },
};
export const clarifyTool = {
    name: "clarify", toolset: "interaction", tier: "standard",
    description: "Ask the user a question when you are blocked on a decision only they can make (offer 2-4 choices when possible). Don't use it for things you can find out yourself.",
    parameters: obj({ question: str("question for the user"), choices: arr(str("choice"), "suggested answers") }, ["question"]),
    async handler(a, ctx) {
        const ans = await ctx.clarify(String(a.question), Array.isArray(a.choices) ? a.choices.map(String) : undefined);
        return ans === null ? "No answer (user unavailable). Proceed with the most reasonable assumption and state it in your reply." : `User answered: ${ans}`;
    },
};
export const toolSearchTool = {
    name: "tool_search", toolset: "meta", tier: "slm", parallelSafe: true,
    description: "Find additional tools that are not in your default list (MCP tools, browser, the stitaP tool store with 350+ domain tools: finance, math, OCR, CFD, diagrams, office, etc.). Then call one with use_tool.",
    parameters: obj({ query: str("what you need, e.g. 'loan amortization' or 'browser screenshot'"), limit: int("max results (default 8)") }, ["query"]),
    async handler(a, ctx) {
        const rt = ctx.rt;
        const n = Math.min(Number(a.limit) || 8, 20);
        // an exact tool name returns that tool's full documentation (the planner sends big schemas abbreviated)
        const exact = rt.tools.get(String(a.query).trim());
        if (exact && rt.tools.isAvailable(exact, rt))
            return `${exact.name} [${exact.toolset}]\n${exact.description}\n\nparameters: ${JSON.stringify(exact.parameters, null, 1)}`;
        const active = rt.activeTools(ctx.session.id);
        const pool = rt.tools.discoverable(rt, active);
        const native = rt.tools.search(String(a.query), pool, n).map((t) => `- ${t.name} [${t.toolset}]: ${t.description.slice(0, 200)}\n  params: ${JSON.stringify(t.parameters?.properties ?? {}).slice(0, 300)}`);
        // a documented alias (e.g. "viking_query") → put the store tools it stands for first
        const al = STORE_ALIASES[String(a.query).trim()];
        const aliasIds = al ? (Array.isArray(al) ? al : [al]) : [];
        const found = await rt.storeBridge.search(String(a.query), n);
        const extra = aliasIds.length ? (await Promise.all(aliasIds.map((id) => rt.storeBridge.search(id, 3)))).flat().filter((t) => aliasIds.includes(t.id)) : [];
        const seenIds = new Set();
        const store = [...extra, ...found].filter((t) => !seenIds.has(t.id) && seenIds.add(t.id)).slice(0, Math.max(n, extra.length)).map((t) => `- store:${t.id} [store/${t.category}]: ${t.description.slice(0, 200)}\n  params: ${t.params}`);
        const all = [...native, ...store].slice(0, n * 2);
        return all.length ? `${all.join("\n")}\n\nCall with use_tool(name, arguments).` : "no matching tools";
    },
};
export const useToolTool = {
    name: "use_tool", toolset: "meta", tier: "slm",
    description: "Call a tool found with tool_search (including 'store:<id>' tools) by name with a JSON arguments object.",
    parameters: obj({ name: str("tool name from tool_search"), arguments: { type: "object", description: "arguments object" } }, ["name"]),
    async handler(a, ctx) {
        const name = String(a.name ?? "");
        let args = a.arguments ?? {};
        if (typeof args === "string")
            args = parseToolArgs(args);
        if (name.startsWith("store:"))
            return ctx.rt.storeBridge.call(name.slice(6), args, ctx);
        if (!ctx.rt.tools.get(name) && STORE_ALIASES[name])
            return ctx.rt.storeBridge.call(name, args, ctx); // documented names (AGENTS.md)
        const t = ctx.rt.tools.get(name);
        if (!t || !ctx.rt.tools.isAvailable(t, ctx.rt))
            return `unknown or unavailable tool "${name}" — use tool_search first`;
        if (["use_tool", "tool_search"].includes(t.name))
            return "cannot nest use_tool";
        if (ctx.allowedTools && !ctx.allowedTools.has(t.name))
            return `tool ${t.name} is not allowed in this context`;
        const r = await t.handler(args, ctx);
        return typeof r === "string" ? r : r.content;
    },
};

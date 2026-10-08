/**
 * Tool planner. A small model cannot carry 50 tool schemas (~12K tokens) in a small window, and it will not
 * think to search for a tool it has never seen. So per task:
 *   1. every tool has a one-line catalog entry (the first sentence of its description);
 *   2. the model reads the task and the one-line catalog (~1K tokens) and picks the tools it needs, plus up to
 *      two search queries for capabilities the catalog only hints at (the 350+ store tools, MCP tools);
 *   3. only the picked tools get their schemas loaded, and a tool whose parameters are many or long is sent in a
 *      compact form; its full parameter documentation is one `tool_search <name>` away.
 * Picked tools stay for the chat (capped), so later turns keep their tools and the server's prompt cache.
 */
import { readdirSync } from "node:fs";
import { extractJsonBlock, repairJson } from "../util/jsonrepair.js";
import { log } from "../util/log.js";
export const MAX_EXTRAS = 10;
const COMPACT_OVER = 1200; // schema characters
/** "Run a command. Longer text…" → "Run a command." (≤ 110 chars) */
export function oneLine(t) {
    const text = (t.summary ?? t.description).replace(/\s+/g, " ").trim();
    const m = /^(.{20,110}?[.;:])(\s|$)/.exec(text);
    return (m ? m[1] : text.slice(0, 110)).replace(/[.:;]$/, "");
}
export function catalog(tools) {
    return tools.map((t) => `${t.name} — ${oneLine(t)}`).join("\n");
}
const PROMPT = `You are the tool planner for an AI agent that has a very small context window. Read the task and the catalog of extra tools (name — what it does). Pick only the tools the task will need; the agent already has its core tools (shell, files, search, todo, memory) and can fetch any other tool later with tool_search. For capabilities that the catalog only hints at (domain calculators, MCP servers, documents), give up to 2 short search queries. Also give a plan of at most 4 short steps.
Reply with JSON only: {"tools":["name",...],"search":["query"],"plan":["step","step"]}
Pick at most 6 tools; pick none when the core tools are enough.`;
export function parseSelection(raw, known, resolve) {
    const out = { tools: [], search: [], plan: [] };
    const block = extractJsonBlock(raw);
    if (!block)
        return out;
    let j;
    try {
        j = repairJson(block);
    }
    catch {
        return out;
    }
    const strs = (v) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map((x) => String(x).trim()).filter(Boolean);
    for (const n of strs(j?.tools)) {
        const r = known.has(n) ? n : resolve(n);
        if (r && known.has(r) && !out.tools.includes(r))
            out.tools.push(r);
    }
    out.tools = out.tools.slice(0, 6);
    out.search = strs(j?.search).slice(0, 2).map((s) => s.slice(0, 80));
    out.plan = strs(j?.plan).slice(0, 4).map((s) => s.slice(0, 140));
    return out;
}
/** Same tool, shorter schema: property descriptions cut, the tool description cut. Names, types, enums and `required` stay. */
export function compactSchema(s, over = COMPACT_OVER) {
    if (JSON.stringify(s.parameters).length <= over)
        return s;
    const cut = (v, depth = 0) => {
        if (Array.isArray(v))
            return v.map((x) => cut(x, depth + 1));
        if (!v || typeof v !== "object")
            return v;
        const o = {};
        for (const [k, x] of Object.entries(v)) {
            if (k === "description" && typeof x === "string")
                o[k] = x.length > 70 ? x.slice(0, 67) + "…" : x;
            else if (k === "examples" || k === "default" && typeof x === "string" && x.length > 40)
                continue;
            else
                o[k] = cut(x, depth + 1);
        }
        return o;
    };
    return { ...s, description: s.description.length > 260 ? s.description.slice(0, 257) + "…" : s.description, parameters: cut(s.parameters) };
}
export function compactSchemas(schemas) { return schemas.map((s) => compactSchema(s)); }
/** Is the planner active for this chat? */
export function selectionActive(rt, sid) {
    return !!rt.db.getSession(sid)?.meta?.tool_selection;
}
function folderHint(cwd) {
    try {
        return readdirSync(cwd).filter((f) => !f.startsWith(".")).slice(0, 30).join(", ");
    }
    catch {
        return "";
    }
}
/**
 * Plan the tools for a task. Adds the picked tools to the chat and returns a short note for the model (loaded
 * tools, search hits, suggested steps), or null when nothing was decided.
 */
export async function planTools(rt, sid, task, signal) {
    const s = rt.db.getSession(sid);
    if (!s)
        return { note: null, added: [] };
    const core = new Set(rt.tools.active(rt, { profile: "slm" }).map((t) => t.name));
    const pool = rt.tools.all().filter((t) => !core.has(t.name) && rt.tools.isAvailable(t, rt));
    const known = new Set(pool.map((t) => t.name));
    let sel = { tools: [], search: [], plan: [] };
    try {
        const r = await rt.aux().chat({
            messages: [
                { role: "system", content: `${PROMPT}\n\nCatalog of extra tools:\n${catalog(pool)}` },
                { role: "user", content: `Working folder: ${s.cwd || rt.defaultCwd()} (${folderHint(s.cwd || rt.defaultCwd())})\n\nTask:\n${task.slice(0, 1800)}` },
            ],
            maxTokens: 350, temperature: 0, json: true, stream: false, signal,
        });
        sel = parseSelection(r.content, known, (n) => rt.tools.resolveName(n, pool)?.name);
    }
    catch (e) {
        log.warn(`tool planner failed: ${e.message}`);
        return { note: null, added: [] };
    }
    // search hits for capabilities the catalog only hints at: native tools first, then the tool store
    const hits = [];
    for (const q of sel.search) {
        for (const t of rt.tools.search(q, pool.filter((p) => !sel.tools.includes(p.name)), 2)) {
            if (!sel.tools.includes(t.name) && sel.tools.length < 8)
                sel.tools.push(t.name);
        }
        try {
            for (const t of await rt.storeBridge.search(q, 3))
                hits.push(`store:${t.id} — ${t.description.slice(0, 90)} | params: ${String(t.params).slice(0, 160)}`);
        }
        catch { /* store not available */ }
    }
    const prev = s.meta.tool_extras ?? [];
    const merged = [...prev.filter((n) => !sel.tools.includes(n)), ...sel.tools].slice(-MAX_EXTRAS);
    const added = sel.tools.filter((n) => !prev.includes(n));
    if (added.length || merged.length !== prev.length) {
        rt.db.updateSession(sid, { meta: { ...s.meta, tool_extras: merged, tool_names: undefined } });
        rt.dropToolCache(sid);
    }
    const parts = [];
    if (sel.tools.length)
        parts.push(`Tools loaded for this task: ${sel.tools.join(", ")}.`);
    const big = sel.tools.filter((n) => { const t = rt.tools.get(n); return t && JSON.stringify(t.parameters).length > COMPACT_OVER; });
    if (big.length)
        parts.push(`Parameters of ${big.join(", ")} are abbreviated; run tool_search with the tool's exact name for its full parameter documentation before the first call.`);
    if (hits.length)
        parts.push(`Related store tools (call with use_tool):\n${hits.slice(0, 5).map((h) => `- ${h}`).join("\n")}`);
    if (sel.plan.length)
        parts.push(`Suggested steps (a suggestion, not an instruction):\n${sel.plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}`);
    return { note: parts.length ? `[Planner]\n${parts.join("\n")}` : null, added };
}

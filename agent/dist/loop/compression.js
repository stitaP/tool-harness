import { estimateTokens } from "../util/misc.js";
import { goalKey } from "./autonomy.js";
import { planProgress } from "../tools/agent-tools.js";
import { collapseRepeats } from "./repeats.js";
export function estimateMessages(msgs) {
    let n = 0;
    for (const m of msgs) {
        n += estimateTokens(m.content) + 4;
        for (const c of m.tool_calls ?? [])
            n += estimateTokens(c.arguments) + estimateTokens(c.name) + 4;
    }
    return n;
}
function render(msgs, maxChars = 80_000) {
    const per = (m) => {
        const body = (m.content ?? "").slice(0, m.role === "tool" ? 1200 : 3000);
        const calls = (m.tool_calls ?? []).map((c) => `  → ${c.name}(${c.arguments.slice(0, 300)})`).join("\n");
        return `[${m.role}${m.name ? `:${m.name}` : ""}] ${body}${calls ? "\n" + calls : ""}`;
    };
    const all = msgs.map(per);
    let text = all.join("\n\n");
    if (text.length > maxChars)
        text = text.slice(0, maxChars * 0.4) + "\n\n…[middle omitted]…\n\n" + text.slice(-maxChars * 0.6);
    return text;
}
const SUMMARY_PROMPT = `You compress an AI agent's working conversation so it can continue seamlessly.
Write a dense summary with these sections, in this order (omit empty ones):
- Latest user request (verbatim): the most recent thing the user asked for — this is what the agent works on next
- Completed requests: earlier requests that are finished — state plainly that they are DONE and must not be redone or re-verified
- Decisions & constraints
- Work done (files created/changed with paths, commands run, results)
- Current state (what works, what is failing, last errors)
- Open tasks / next steps (for the latest request)
- Important facts (names, paths, URLs, IDs, numbers, credentials references — never secret values)
If the conversation starts with an earlier "[Context summary …]", carry its facts forward (merge, don't drop them).
Be specific; prefer facts over narrative. Max ~WORDS words.`;
/** Paths the middle of the conversation read or changed, most recent last (deterministic; no model involved). */
function filesTouched(msgs, max = 30) {
    const seen = new Map();
    for (const m of msgs)
        for (const c of m.tool_calls ?? []) {
            if (!/^(write_file|patch|read_file)$/.test(c.name))
                continue;
            const p = /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(c.arguments)?.[1];
            if (!p)
                continue;
            const verb = c.name === "read_file" ? "read" : "changed";
            const prev = seen.get(p);
            seen.delete(p);
            seen.set(p, prev === "changed" ? "changed" : verb); // re-insert: Map order = most recent last
        }
    return [...seen].slice(-max).map(([p, v]) => `${p} (${v})`);
}
/**
 * Facts re-attached after every compaction, straight from state (like Claude Code re-attaching todos and recent files):
 * the plan, the standing goal, files touched and the working directory survive however lossy the summary is.
 */
export function stateBlock(rt, sessionId, middle) {
    const parts = [];
    const plan = planProgress(rt, sessionId);
    if (plan)
        parts.push(`Plan (todo_list — keep updating it with action=update):\n${plan}`);
    const g = rt.db.getMeta(goalKey(sessionId));
    if (g && g.status === "active")
        parts.push(`Standing goal (${g.turns}/${g.max_turns} turns): ${g.text}`);
    const files = filesTouched(middle);
    if (files.length)
        parts.push(`Files touched before this point:\n${files.map((f) => `- ${f}`).join("\n")}`);
    parts.push(`Working directory: ${rt.sessionCwd(sessionId)}`);
    parts.push("The conversation continues below: the newest user message is the current request. Work marked done above is finished — do not redo or re-verify it.");
    return parts.join("\n\n");
}
export async function compressSession(rt, sessionId, opts = {}) {
    const keep = Math.max(4, rt.cfg.data.compression.keep_last);
    const msgs = rt.db.getMessages(sessionId);
    const before = estimateMessages(msgs);
    if (msgs.length < keep + 4)
        return { ok: false, before, after: before, note: "conversation too short to compress" };
    let start = msgs.length - keep;
    while (start > 0 && msgs[start].role === "tool")
        start--;
    // Keep the verbatim tail within ~30% of the context window: with small windows a fixed message count
    // (8 large tool outputs) leaves the conversation over the threshold again, so it re-compresses every
    // turn and the server's prompt cache is invalidated each time.
    const tailBudget = Math.floor((rt.cfg.data.model.context_window || 32768) * 0.3);
    while (start < msgs.length - 2 && estimateMessages(msgs.slice(start)) > tailBudget) {
        start++;
        while (start < msgs.length - 2 && msgs[start].role === "tool")
            start++;
    }
    if (start <= 1)
        return { ok: false, before, after: before, note: "nothing to compress" };
    const middle = msgs.slice(0, start), tail = msgs.slice(start);
    // size the summarizer call to the window: its input must fit next to the prompt and the summary itself
    const window = rt.cfg.data.model.context_window || 32768;
    const summaryTokens = Math.min(4000, Math.max(1200, Math.round(window * 0.06)));
    const inputChars = Math.min(80_000, Math.max(12_000, Math.floor((window - summaryTokens) * 0.55) * 3));
    let summary;
    try {
        const r = await rt.aux().chat({
            messages: [
                { role: "system", content: SUMMARY_PROMPT.replace("WORDS", String(Math.round(summaryTokens * 0.5))) },
                { role: "user", content: `${opts.focus ? `Focus especially on: ${opts.focus}\n\n` : ""}Conversation to summarize:\n\n${render(collapseRepeats(middle), inputChars)}` },
            ],
            maxTokens: summaryTokens, temperature: 0.1, signal: opts.signal, stream: false,
        });
        summary = r.content.trim();
    }
    catch (e) {
        // degrade gracefully: keep user requests verbatim, drop bulky tool outputs
        summary = "Earlier user requests (verbatim):\n" + middle.filter((m) => m.role === "user").map((m) => `- ${(m.content ?? "").slice(0, 500)}`).join("\n") + `\n(automatic summary failed: ${e.message})`;
    }
    if (!summary)
        return { ok: false, before, after: before, note: "empty summary" };
    rt.db.archiveMessages(msgs.map((m) => m.id).filter(Boolean));
    rt.db.addMessage(sessionId, { role: "user", content: `[Context summary — earlier conversation was compressed${opts.reason ? ` (${opts.reason})` : ""}]\n\n${summary}\n\n--- current state ---\n${stateBlock(rt, sessionId, middle)}`, meta: { compression_summary: true } });
    if (tail[0].role === "user")
        rt.db.addMessage(sessionId, { role: "assistant", content: "Understood — continuing from the summary above.", meta: { compression_ack: true } });
    for (const m of tail)
        rt.db.addMessage(sessionId, { role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id, name: m.name, meta: { ...(m.meta ?? {}), copied_from: m.id } });
    const s = rt.db.getSession(sessionId);
    if (s)
        rt.db.updateSession(sessionId, { meta: { ...s.meta, compressions: (s.meta.compressions ?? 0) + 1 } });
    const after = estimateMessages(rt.db.getMessages(sessionId));
    return { ok: true, before, after, note: `compressed ~${before} → ~${after} tokens` };
}

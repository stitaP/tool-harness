/** Session export: markdown transcript, raw JSON, or ShareGPT trajectory (for fine-tuning SLMs). */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
export function toShareGPT(system, msgs) {
    const conv = [{ from: "system", value: system }];
    for (const m of msgs) {
        if (m.role === "user")
            conv.push({ from: "human", value: m.content ?? "" });
        else if (m.role === "assistant") {
            const calls = (m.tool_calls ?? []).map((c) => `<tool_call>\n${JSON.stringify({ name: c.name, arguments: safeParse(c.arguments) })}\n</tool_call>`).join("\n");
            conv.push({ from: "gpt", value: [m.content ?? "", calls].filter(Boolean).join("\n") });
        }
        else if (m.role === "tool")
            conv.push({ from: "tool", value: `<tool_response>\n${JSON.stringify({ name: m.name, content: m.content })}\n</tool_response>` });
    }
    return { conversations: conv };
}
function safeParse(s) { try {
    return JSON.parse(s);
}
catch {
    return s;
} }
export function exportSession(rt, sid, fmt = "md", path) {
    const s = rt.db.getSession(sid);
    if (!s)
        throw new Error(`no session ${sid}`);
    const msgs = rt.db.getMessages(sid);
    const dir = join(rt.home, "files", "exports");
    mkdirSync(dir, { recursive: true });
    const file = path ?? join(dir, `${sid}.${fmt === "md" ? "md" : fmt === "json" ? "json" : "sharegpt.jsonl"}`);
    if (fmt === "json")
        writeFileSync(file, JSON.stringify({ session: s, messages: msgs }, null, 2));
    else if (fmt === "sharegpt")
        appendFileSync(file, JSON.stringify(toShareGPT(s.system_prompt ?? "", msgs)) + "\n");
    else {
        const lines = [`# ${s.title || sid}`, "", `_${new Date(s.created_at).toLocaleString()} · ${s.source} · ${s.model}_`, ""];
        for (const m of msgs) {
            if (m.role === "user")
                lines.push(`## You\n\n${m.content}\n`);
            else if (m.role === "assistant") {
                if (m.content)
                    lines.push(`## Agent\n\n${m.content}\n`);
                for (const c of m.tool_calls ?? [])
                    lines.push(`> 🔧 \`${c.name}\` ${c.arguments.slice(0, 500)}\n`);
            }
            else if (m.role === "tool")
                lines.push("```\n" + (m.content ?? "").slice(0, 3000) + "\n```\n");
        }
        writeFileSync(file, lines.join("\n"));
    }
    return file;
}

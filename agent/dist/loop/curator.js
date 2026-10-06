import { repairJson } from "../util/jsonrepair.js";
import { log } from "../util/log.js";
const PROMPT = `You review an AI agent's just-finished task to improve its long-term memory and skills.
Return ONLY JSON:
{
  "user_facts": ["durable facts about the user: preferences, role, conventions (max 3, only if clearly stated)"],
  "memory_facts": ["durable facts about the environment/project/tools learned (max 3)"],
  "skill": null | { "name": "lowercase-dash-name", "description": "what it does and WHEN to use it", "body": "markdown: When to use / Steps / Commands / Pitfalls / Verification" }
}
Rules: skip trivia and task progress. Only propose a skill for a non-trivial, reusable multi-step procedure that worked. Prefer null over a weak skill. If an existing skill already covers it, return null.`;
export async function curate(rt, sid) {
    const msgs = rt.db.getMessages(sid).slice(-50);
    const transcript = msgs.map((m) => {
        if (m.role === "tool")
            return `[tool ${m.name}] ${(m.content ?? "").slice(0, 400)}`;
        const calls = (m.tool_calls ?? []).map((c) => ` → ${c.name}(${c.arguments.slice(0, 200)})`).join("");
        return `[${m.role}] ${(m.content ?? "").slice(0, 1500)}${calls}`;
    }).join("\n").slice(-30000);
    const existing = rt.skills.list().map((s) => s.name).join(", ");
    let j;
    try {
        const r = await rt.aux().chat({ messages: [{ role: "system", content: PROMPT }, { role: "user", content: `Existing skills: ${existing || "(none)"}\n\nTranscript:\n${transcript}` }], maxTokens: 1500, temperature: 0.1, json: true, stream: false });
        j = repairJson(r.content);
    }
    catch (e) {
        log.warn(`curator failed: ${e.message}`);
        return null;
    }
    let memory = 0;
    for (const f of (j.user_facts ?? []).slice(0, 3)) {
        try {
            rt.memory.add("user", String(f));
            memory++;
        }
        catch { /* full or dup */ }
    }
    for (const f of (j.memory_facts ?? []).slice(0, 3)) {
        try {
            rt.memory.add("memory", String(f));
            memory++;
        }
        catch { /* full or dup */ }
    }
    let skill;
    const s = j.skill;
    if (s && s.name && s.description && s.body && !rt.skills.get(String(s.name))) {
        const name = String(s.name).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
        try {
            if (rt.cfg.data.curator.auto_save_skills) {
                rt.skills.create(name, String(s.description), String(s.body), "learned", { origin: `curator:${sid}` });
                skill = name;
            }
            else {
                rt.db.setMeta(`skill_draft:${name}`, { name, description: s.description, body: s.body, session: sid, at: Date.now() });
                skill = `${name} (draft)`;
            }
        }
        catch (e) {
            log.warn(`curator skill save failed: ${e.message}`);
        }
    }
    if (memory || skill)
        rt.emitEvent(sid, { type: "curator", memory, skill });
    return { memory, skill };
}

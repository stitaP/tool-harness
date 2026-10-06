import { newId } from "../util/misc.js";
import { repairJson } from "../util/jsonrepair.js";
export function reactToolBlock(tools) {
    const lines = tools.map((t) => {
        const props = t.parameters?.properties ?? {};
        const req = t.parameters?.required ?? [];
        const args = Object.entries(props).map(([k, v]) => `${k}${req.includes(k) ? "" : "?"}: ${v.type ?? "any"}`).join(", ");
        return `- ${t.name}(${args}): ${t.description.split("\n")[0]}`;
    });
    return `## Tools
You can call tools. To call one, reply with EXACTLY this format and then stop:

Thought: <short reasoning>
Action: <tool name>
Action Input: <JSON object with the arguments>

You will then receive "Observation: <result>". Repeat as needed. When you are done, reply normally WITHOUT an Action line — that reply is shown to the user.

Available tools:
${lines.join("\n")}`;
}
export function renderReactHistory(messages) {
    const out = [];
    const pushUser = (text) => {
        const last = out[out.length - 1];
        if (last && last.role === "user")
            last.content = `${last.content}\n\n${text}`;
        else
            out.push({ role: "user", content: text });
    };
    for (const m of messages) {
        if (m.role === "assistant" && m.tool_calls?.length) {
            const parts = [m.content ? `Thought: ${m.content}` : "Thought: I'll use a tool."];
            const c = m.tool_calls[0];
            parts.push(`Action: ${c.name}`, `Action Input: ${c.arguments || "{}"}`);
            out.push({ role: "assistant", content: parts.join("\n") });
        }
        else if (m.role === "tool") {
            pushUser(`Observation (${m.name ?? "tool"}): ${m.content ?? ""}`);
        }
        else if (m.role === "user") {
            pushUser(m.content ?? "");
        }
        else {
            out.push({ ...m, tool_calls: undefined });
        }
    }
    return out;
}
export function parseReact(text, toolNames) {
    const actionM = /Action\s*:\s*`?([A-Za-z0-9_.\-]+)`?/i.exec(text);
    const thoughtM = /Thought\s*:\s*([\s\S]*?)(?=\n\s*Action\s*:|\n\s*Final Answer\s*:|$)/i.exec(text);
    const finalM = /Final Answer\s*:\s*([\s\S]*)$/i.exec(text);
    if (actionM && (!finalM || (finalM.index ?? 0) > (actionM.index ?? 0))) {
        const name = actionM[1];
        const after = text.slice((actionM.index ?? 0) + actionM[0].length);
        const inputM = /Action Input\s*:\s*([\s\S]*?)(?=\n\s*Observation\s*:|$)/i.exec(after);
        let args = {};
        const raw = inputM?.[1]?.trim() ?? "";
        if (raw) {
            try {
                args = repairJson(raw);
            }
            catch {
                args = raw;
            }
        }
        // unknown names are still returned: the loop repairs or reports them to the model
        void toolNames;
        return { thought: thoughtM?.[1]?.trim() ?? "", action: { name, args }, final: "" };
    }
    const final = finalM ? finalM[1].trim() : text.replace(/^\s*Thought\s*:[^\n]*\n?/i, "").trim();
    return { thought: thoughtM?.[1]?.trim() ?? "", final };
}
export class ReactAdapter {
    inner;
    id;
    model;
    constructor(inner) {
        this.inner = inner;
        this.id = `react:${inner.id}`;
        this.model = inner.model;
    }
    get contextWindow() { return this.inner.contextWindow; }
    async chat(req) {
        if (!req.tools?.length)
            return this.inner.chat(req);
        const msgs = renderReactHistory(req.messages);
        const sysIdx = msgs.findIndex((m) => m.role === "system");
        const block = reactToolBlock(req.tools);
        if (sysIdx >= 0)
            msgs[sysIdx] = { ...msgs[sysIdx], content: `${msgs[sysIdx].content}\n\n${block}` };
        else
            msgs.unshift({ role: "system", content: block });
        let buffered = "";
        let decided = null;
        const res = await this.inner.chat({
            ...req, tools: undefined, messages: msgs, stop: [...(req.stop ?? []), "\nObservation:", "Observation:"],
            onToken: (t) => {
                // Only stream once we know this is a final answer (no Action line).
                buffered += t;
                if (decided === null && buffered.length > 40)
                    decided = /Action\s*:/i.test(buffered) ? "action" : /^\s*Thought\s*:/i.test(buffered) ? null : "final";
                if (decided === null && /Final Answer\s*:/i.test(buffered))
                    decided = "final";
                if (decided === "final")
                    req.onToken?.(t);
            },
        });
        const p = parseReact(res.content, req.tools.map((t) => t.name));
        if (p.action) {
            return { ...res, content: p.thought, toolCalls: [{ id: newId("call_"), name: p.action.name, arguments: typeof p.action.args === "string" ? p.action.args : JSON.stringify(p.action.args) }] };
        }
        return { ...res, content: p.final, toolCalls: [] };
    }
}
/** In-process provider driven by a function — used by tests and the SDK. */
export class FunctionProvider {
    fn;
    model;
    id = "function";
    contextWindow;
    constructor(fn, model = "function", ctx = 32768) {
        this.fn = fn;
        this.model = model;
        this.contextWindow = ctx;
    }
    async chat(req) {
        const r = await this.fn(req);
        if (r.content && req.onToken)
            req.onToken(r.content);
        return { content: r.content ?? "", toolCalls: (r.toolCalls ?? []).map((c) => ({ ...c, id: c.id || newId("call_") })), usage: r.usage ?? { input: 0, output: 0 }, finishReason: r.finishReason ?? "stop", model: this.model };
    }
}

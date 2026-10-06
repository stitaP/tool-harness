import { newId } from "../util/misc.js";
export function handleModels(rt, res) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: [{ id: "stitap-agent", object: "model", owned_by: "stitap", created: 0 }, { id: `stitap-agent/${rt.cfg.data.model.name}`, object: "model", owned_by: "stitap", created: 0 }] }));
}
function textOf(c) {
    if (typeof c === "string")
        return c;
    if (Array.isArray(c))
        return c.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    return "";
}
export async function handleChatCompletions(rt, req, res, b) {
    const msgs = Array.isArray(b.messages) ? b.messages : [];
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "no user message" } }));
        return;
    }
    const keyed = String(req.headers["x-session-id"] ?? b.user ?? "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80);
    let sid;
    if (keyed) {
        const metaKey = `api_session:${keyed}`;
        sid = rt.db.getMeta(metaKey) ?? "";
        if (!sid || !rt.db.getSession(sid)) {
            sid = rt.createSession({ source: "api", title: `api: ${keyed}` }).id;
            rt.db.setMeta(metaKey, sid);
        }
    }
    else {
        sid = rt.createSession({ source: "api" }).id;
        const prior = msgs.slice(0, msgs.lastIndexOf(lastUser)).filter((m) => m.role === "user" || m.role === "assistant");
        for (const m of prior)
            rt.db.addMessage(sid, { role: m.role, content: textOf(m.content) });
        const sys = msgs.find((m) => m.role === "system");
        if (sys)
            rt.db.updateSession(sid, { meta: { api_system: textOf(sys.content) } });
    }
    const images = Array.isArray(lastUser.content) ? lastUser.content.filter((p) => p.type === "image_url").map((p) => p.image_url?.url).filter(Boolean) : [];
    const id = `chatcmpl-${newId()}`;
    const created = Math.floor(Date.now() / 1000);
    const model = b.model || "stitap-agent";
    if (b.stream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
        chunk({ role: "assistant", content: "" });
        let streamed = false;
        const onEv = (ev) => {
            if (ev.sessionId !== sid)
                return;
            if (ev.type === "token") {
                streamed = true;
                chunk({ content: ev.text });
            }
            if (ev.type === "tool_start")
                chunk({ content: "" }); // keep-alive while tools run
        };
        rt.on("event", onEv);
        const ka = setInterval(() => res.write(": keep-alive\n\n"), 15000);
        req.on("close", () => { if (!res.writableEnded)
            rt.interrupt(sid); });
        try {
            const r = await rt.send(sid, textOf(lastUser.content), { source: "api", images, approvalMode: "deny" });
            if (!streamed)
                chunk({ content: r.final });
            chunk({}, "stop");
            res.write("data: [DONE]\n\n");
        }
        finally {
            clearInterval(ka);
            rt.off("event", onEv);
            res.end();
        }
        return;
    }
    const r = await rt.send(sid, textOf(lastUser.content), { source: "api", images, approvalMode: "deny" });
    res.writeHead(200, { "content-type": "application/json", "x-session-id": sid });
    res.end(JSON.stringify({
        id, object: "chat.completion", created, model,
        choices: [{ index: 0, message: { role: "assistant", content: r.final }, finish_reason: "stop" }],
        usage: { prompt_tokens: r.usage.input, completion_tokens: r.usage.output, total_tokens: r.usage.input + r.usage.output },
    }));
}

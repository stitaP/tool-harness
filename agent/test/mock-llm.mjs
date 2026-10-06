// Scriptable OpenAI-compatible mock server for end-to-end tests (no real model needed).
// POST /__script  [{content, tool_calls:[{name, arguments}], finish_reason?} | {match: "regex", ...}]  — queue replies
// GET  /__requests — every chat request received
import { createServer } from "node:http";

export async function startMockLLM({ port = 0, stream = true, toolsUnsupported = false } = {}) {
  let queue = [];
  const requests = [];
  const fallback = (body) => ({ content: "OK" });
  const server = createServer(async (req, res) => {
    let raw = ""; for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    if (req.url === "/__script") { queue.push(...body); res.end("{}"); return; }
    if (req.url === "/__requests") { res.end(JSON.stringify(requests)); return; }
    if (req.url?.endsWith("/models")) { res.end(JSON.stringify({ data: [{ id: "mock" }] })); return; }
    if (!req.url?.endsWith("/chat/completions")) { res.statusCode = 404; res.end(); return; }
    requests.push(body);
    if (toolsUnsupported && body.tools) { res.statusCode = 400; res.end(JSON.stringify({ error: { message: "this model does not support tools" } })); return; }
    // aux calls (judge/title/summary/curator) are answered by matching rules, main calls pop the queue
    const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
    const sys = body.messages?.[0]?.content ?? "";
    let r;
    const ruleIdx = queue.findIndex((q) => q.match && new RegExp(q.match, "i").test(typeof sys === "string" ? sys + "\n" + JSON.stringify(lastUser?.content ?? "") : ""));
    if (ruleIdx >= 0) { r = queue[ruleIdx]; if (!r.sticky) queue.splice(ruleIdx, 1); }
    else if (/completion judge/i.test(sys)) r = { content: '{"done": true, "impossible": false, "reason": "default judge: done"}' };
    else if (/title for this conversation/i.test(sys)) r = { content: "Mock Title" };
    else if (/review an AI agent's just-finished task/i.test(sys)) r = { content: '{"user_facts":[],"memory_facts":[],"skill":null}' };
    else if (/compress an AI agent's working conversation/i.test(sys)) r = { content: "SUMMARY: earlier work summarized." };
    else { const i = queue.findIndex((q) => !q.match); r = i >= 0 ? queue.splice(i, 1)[0] : fallback(body); }
    if (r.status) { res.statusCode = r.status; res.end(JSON.stringify({ error: { message: r.error ?? "error" } })); return; }
    const calls = (r.tool_calls ?? []).map((c, i) => ({ id: c.id ?? `call_${Date.now()}_${i}`, type: "function", function: { name: c.name, arguments: typeof c.arguments === "string" ? c.arguments : JSON.stringify(c.arguments ?? {}) } }));
    const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 };
    if (body.stream && stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      const content = r.content ?? "";
      for (const piece of content.match(/.{1,8}/gs) ?? []) send({ choices: [{ index: 0, delta: { content: piece } }] });
      calls.forEach((c, i) => {
        send({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: c.id, type: "function", function: { name: c.function.name, arguments: "" } }] } }] });
        const a = c.function.arguments; const mid = Math.floor(a.length / 2);
        send({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: a.slice(0, mid) } }] } }] });
        send({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: a.slice(mid) } }] } }] });
      });
      send({ choices: [{ index: 0, delta: {}, finish_reason: r.finish_reason ?? (calls.length ? "tool_calls" : "stop") }] });
      send({ choices: [], usage });
      res.end("data: [DONE]\n\n");
    } else {
      res.end(JSON.stringify({ model: "mock", choices: [{ index: 0, message: { role: "assistant", content: r.content ?? "", tool_calls: calls.length ? calls : undefined }, finish_reason: r.finish_reason ?? (calls.length ? "tool_calls" : "stop") }], usage }));
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/v1`;
  return { url, script: (items) => queue.push(...items), requests, reset: () => { queue = []; requests.length = 0; }, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}

/**
 * Expose the harness as an MCP server over stdio (`harness mcp serve`), so
 * Claude Desktop, Cursor, VS Code, Hermes or any MCP host can use its tools —
 * including the Tool Store and a full `stitap_agent` task runner.
 */
import { createInterface } from "node:readline";
import { VERSION } from "../runtime/runtime.js";
import { errMsg } from "../util/misc.js";
export async function serveMcp(rt) {
    const sess = rt.createSession({ source: "mcp", title: "MCP server" });
    const toolsets = new Set(rt.cfg.data.mcp_serve.toolsets ?? []);
    const exposed = () => rt.tools.all().filter((t) => toolsets.has(t.toolset) && rt.tools.isAvailable(t, rt) && !["clarify", "use_tool", "tool_search"].includes(t.name));
    const extra = [
        { name: "stitap_agent", description: "Run a complete task with the stitaP agent (it plans, uses tools, and works until done). Returns the final answer.", inputSchema: { type: "object", properties: { task: { type: "string", description: "what to do" }, session_id: { type: "string", description: "continue an earlier agent session" } }, required: ["task"] } },
        ...(toolsets.has("store") ? [
            { name: "store_search", description: "Search the stitaP Tool Store (finance, math, engineering, OCR, office, diagram tools…).", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
            { name: "store_call", description: "Call a Tool Store tool by id with arguments.", inputSchema: { type: "object", properties: { id: { type: "string" }, arguments: { type: "object" } }, required: ["id"] } },
        ] : []),
    ];
    const write = (o) => process.stdout.write(JSON.stringify(o) + "\n");
    const rl = createInterface({ input: process.stdin });
    rl.on("line", async (line) => {
        let msg;
        try {
            msg = JSON.parse(line);
        }
        catch {
            return;
        }
        if (msg.id === undefined)
            return; // notifications
        const reply = (result) => write({ jsonrpc: "2.0", id: msg.id, result });
        const fail = (code, message) => write({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
        try {
            switch (msg.method) {
                case "initialize":
                    return reply({ protocolVersion: msg.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "stitap-harness", version: VERSION } });
                case "ping": return reply({});
                case "tools/list":
                    return reply({ tools: [...extra, ...exposed().map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters }))] });
                case "tools/call": {
                    const name = msg.params?.name, args = msg.params?.arguments ?? {};
                    let text;
                    if (name === "stitap_agent") {
                        const sid = args.session_id && rt.db.getSession(args.session_id) ? args.session_id : rt.createSession({ source: "mcp", title: String(args.task).slice(0, 60) }).id;
                        const r = await rt.send(sid, String(args.task), { source: "mcp", approvalMode: "deny" });
                        text = `${r.final}\n\n(session_id: ${sid})`;
                    }
                    else if (name === "store_search") {
                        text = (await rt.storeBridge.search(String(args.query), 15)).map((t) => `${t.id}: ${t.description}\n  params: ${t.params}`).join("\n") || "no results";
                    }
                    else if (name === "store_call") {
                        text = await rt.storeBridge.call(String(args.id), args.arguments ?? {});
                    }
                    else {
                        const t = exposed().find((x) => x.name === name);
                        if (!t)
                            return fail(-32602, `unknown tool ${name}`);
                        const r = await t.handler(args, rt.toolContext(sess.id));
                        text = typeof r === "string" ? r : r.content;
                    }
                    return reply({ content: [{ type: "text", text }], isError: /^error:/i.test(text) });
                }
                default: return fail(-32601, `method not found: ${msg.method}`);
            }
        }
        catch (e) {
            return reply({ content: [{ type: "text", text: `error: ${errMsg(e)}` }], isError: true });
        }
    });
    await new Promise((r) => rl.on("close", () => r()));
}

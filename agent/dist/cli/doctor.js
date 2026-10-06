/** `harness doctor` — diagnose the installation, model connectivity and capabilities. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../runtime/runtime.js";
import { policyPath } from "../config.js";
import { green, red, yellow, bold, gray } from "./ui.js";
export async function doctor(rt, opts = {}) {
    let problems = 0;
    const okL = (s) => console.log(`${green("✔")} ${s}`);
    const warn = (s) => console.log(`${yellow("!")} ${s}`);
    const bad = (s) => { problems++; console.log(`${red("✗")} ${s}`); };
    console.log(bold(`stitaP harness ${VERSION} — doctor`));
    console.log(gray(`home: ${rt.home}`));
    const [maj, min] = process.versions.node.split(".").map(Number);
    if (maj > 22 || (maj === 22 && min >= 13) || maj >= 23)
        okL(`Node ${process.versions.node}`);
    else if (maj >= 20)
        warn(`Node ${process.versions.node} works, but Node 22.13+ is recommended (built-in SQLite + search)`);
    else
        bad(`Node ${process.versions.node} is too old — install Node 20.3+ (22 LTS recommended)`);
    okL(`state store: ${rt.db.backend}${rt.db.backend === "json" ? gray(" (upgrade Node for SQLite full-text search)") : ""}`);
    okL(`terminal backend: ${rt.terminal.describe()}`);
    console.log(`${green("✔")} detected: ${rt.capabilities().join(", ")}`);
    if (existsSync(policyPath()))
        okL(`admin policy: ${policyPath()} (enforces ${Object.keys(rt.cfg.policy?.enforce ?? {}).join(", ") || "nothing"})`);
    const m = rt.cfg.data.model;
    console.log(gray(`\nmodel: ${m.provider} ${m.name} @ ${m.base_url}`));
    if (!opts.quick) {
        try {
            const t0 = Date.now();
            const r = await rt.aux().chat({ messages: [{ role: "user", content: "Reply with exactly: pong" }], maxTokens: 10, temperature: 0, stream: false });
            okL(`model responds (${Date.now() - t0} ms): ${JSON.stringify(r.content.slice(0, 40))}`);
            const probe = rt.createSession({ source: "doctor", title: "doctor" });
            const tr = await rt.providerFor(probe.id).chat({
                messages: [{ role: "system", content: "Use the tool." }, { role: "user", content: "What is 21+21? Use the add tool." }],
                tools: [{ name: "add", description: "add two numbers", parameters: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] } }],
                maxTokens: 200, temperature: 0, stream: false,
            });
            rt.db.deleteSession(probe.id);
            if (tr.toolCalls.length)
                okL(`tool calling works (${tr.toolCalls[0].name} ${tr.toolCalls[0].arguments})`);
            else
                warn("model answered without calling the tool — tool use may be unreliable; try a larger model or tool_mode: react");
        }
        catch (e) {
            bad(`model call failed: ${e.message}`);
            console.log(gray("   fix: run `harness setup`, or `harness config set model.base_url …` / `model.name …`; start your local server (e.g. `ollama serve`)."));
        }
    }
    await rt.storeBridge.load();
    if (rt.storeBridge.error)
        warn(`tool store: ${rt.storeBridge.error}`);
    else
        okL(`tool store: ${rt.storeBridge.count.executable} executable / ${rt.storeBridge.count.total} catalog tools`);
    okL(`skills: ${rt.skills.list().length} (${rt.skills.list().filter((s) => s.source === "user").length} user)`);
    const browserOk = rt.tools.get("browser_navigate")?.available?.(rt) === true;
    const bmode = (rt.cfg.data.browser?.mode ?? "launch");
    if (browserOk)
        okL(`browser automation: playwright found (mode ${bmode})`);
    else
        warn("browser automation: playwright not installed (run: harness browser setup)");
    const dt = rt.tools.get("desktop")?.available?.(rt);
    if (dt === true)
        okL(`desktop control: available on ${process.platform}${process.platform === "darwin" ? " (grant Accessibility + Screen Recording to the app running the harness)" : ""}`);
    else
        warn(`desktop control: ${dt ?? "not registered"}`);
    console.log(gray(`mcp: ${rt.mcp.summary().replace(/\n/g, "; ")}`));
    if (!existsSync(join(rt.home, ".env")))
        console.log(gray(`secrets: none yet (${join(rt.home, ".env")})`));
    for (const [p, c] of Object.entries(rt.cfg.data.gateway)) {
        if (p !== "webhooks" && c.enabled) {
            const env = c.token_env ?? c.bot_token_env;
            if (rt.cfg.secret(env))
                okL(`gateway ${p}: token present`);
            else
                bad(`gateway ${p} enabled but ${env} is not set`);
        }
    }
    console.log(problems ? red(`\n${problems} problem(s) found.`) : green("\nAll good."));
    return problems ? 1 : 0;
}

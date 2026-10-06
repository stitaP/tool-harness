/** Interactive terminal chat (zero-dependency readline REPL). */
import { createInterface } from "node:readline";
import { commandNames, looksLikeCommand, runCommand } from "../runtime/commands.js";
import { barePathHint, expandReferences } from "../prompt/references.js";
import { BANNER, bold, cyan, dim, gray, green, indent, magenta, red, toolLine, yellow } from "./ui.js";
export async function repl(rt, opts) {
    let sid = (opts.sessionId && rt.db.getSession(opts.sessionId)?.id) || rt.createSession({ source: "cli" }).id;
    if (opts.yolo)
        rt.approvals.yoloSessions.add(sid);
    rt.attached.set(sid, 1);
    rt.startBackground();
    const out = process.stdout;
    let streaming = false;
    let pending = null;
    let toolOutLines = 0;
    const completer = (line) => {
        if (!line.startsWith("/"))
            return [[], line];
        const all = [...commandNames(), ...rt.skills.list().map((s) => s.name)].map((n) => `/${n}`);
        const hits = all.filter((c) => c.startsWith(line));
        return [hits.length ? hits : all, line];
    };
    const rl = createInterface({ input: process.stdin, output: out, completer, historySize: 500, terminal: process.stdin.isTTY });
    const prompt = () => { rl.setPrompt(rt.isBusy(sid) ? dim("… ") : green("› ")); rl.prompt(true); };
    const println = (s) => {
        if (streaming) {
            out.write("\n");
            streaming = false;
        }
        out.write(s + "\n");
    };
    console.log(BANNER);
    const s0 = rt.db.getSession(sid);
    console.log(gray(`session ${sid} · model ${rt.providerFor(sid).model} · cwd ${rt.sessionCwd(sid)}${s0.title ? ` · "${s0.title}"` : ""}`));
    const onEvent = (ev) => {
        if (ev.sessionId !== sid && ev.sessionId !== "*")
            return;
        switch (ev.type) {
            case "token":
                if (!streaming) {
                    out.write(magenta("● "));
                    streaming = true;
                }
                out.write(ev.text);
                break;
            case "assistant_step":
                if (streaming) {
                    out.write("\n");
                    streaming = false;
                }
                break;
            case "tool_start":
                println(toolLine(ev.name, ev.args));
                toolOutLines = 0;
                break;
            case "tool_output": {
                if (toolOutLines > 12)
                    break;
                const lines = String(ev.text).split("\n").filter((l) => l.trim());
                for (const l of lines) {
                    if (toolOutLines++ > 12) {
                        println(gray("  │ …"));
                        break;
                    }
                    println(gray(`  │ ${l.slice(0, 200)}`));
                }
                break;
            }
            case "tool_end": {
                if (!ev.ok)
                    println(red(`  ✗ ${String(ev.result).split("\n")[0].slice(0, 200)}`));
                else if (toolOutLines === 0) {
                    const first = String(ev.result ?? "").split("\n").filter(Boolean).slice(0, 3).join("\n");
                    if (first)
                        println(indent(first.slice(0, 400)));
                }
                break;
            }
            case "todo":
                println(ev.todos.map((t) => `  ${t.status === "completed" ? green("✔") : t.status === "in_progress" ? yellow("▸") : gray("○")} ${t.content}`).join("\n"));
                break;
            case "status":
                println(gray(`  · ${ev.text}`));
                break;
            case "compressed":
                println(gray(`  · context ${ev.text}`));
                break;
            case "approval_request":
                pending = { kind: "approval", id: ev.id };
                println(yellow(`\n⚠  Approval needed (${ev.reason}):\n   ${ev.command}\n   [y] once  [s] this session  [a] always  [n] deny`));
                prompt();
                break;
            case "clarify_request":
                pending = { kind: "clarify", id: ev.id, choices: ev.choices };
                println(cyan(`\n? ${ev.question}`) + (ev.choices?.length ? "\n" + ev.choices.map((c, i) => `   ${i + 1}. ${c}`).join("\n") : ""));
                prompt();
                break;
            case "goal":
                println(gray(`  · goal [${ev.state.status}] ${ev.state.turns}/${ev.state.max_turns}: ${ev.state.last_reason ?? ""}`));
                break;
            case "subagent":
                if (ev.state !== "tool")
                    println(gray(`  ↳ subagent ${ev.id.slice(-6)} ${ev.state}${ev.goal ? `: ${ev.goal.slice(0, 80)}` : ""}`));
                break;
            case "curator":
                println(gray(`  · learned: ${ev.memory} memory item(s)${ev.skill ? `, skill ${ev.skill}` : ""}`));
                break;
            case "notification":
                println(cyan(`🔔 ${String(ev.text).slice(0, 500)}`));
                break;
            case "user_message":
                if (ev.internal)
                    println(gray(`  ↻ ${String(ev.text).split("\n")[0].slice(0, 120)}`));
                break;
            case "turn_end":
                if (streaming) {
                    out.write("\n");
                    streaming = false;
                }
                else if (ev.final && !ev.silent)
                    println(`${magenta("●")} ${ev.final}`);
                if (ev.error)
                    println(red(`  ${ev.error}`));
                println(gray(`  ${ev.iterations} step(s), ${ev.toolCalls} tool call(s)${ev.usage?.input ? `, ${ev.usage.input + ev.usage.output} tokens` : ""}${ev.interrupted ? " — interrupted" : ""}`));
                setTimeout(prompt, 0);
                break;
        }
    };
    rt.on("event", onEvent);
    let ctrlC = 0;
    rl.on("SIGINT", () => {
        if (rt.isBusy(sid)) {
            rt.interrupt(sid);
            println(yellow("  ⏹ interrupting…"));
            return;
        }
        if (++ctrlC >= 2 || !rl.line) {
            rl.close();
            return;
        }
        out.write("\n");
        prompt();
    });
    let buffer = [];
    let inBlock = false;
    const handle = async (raw) => {
        ctrlC = 0;
        if (pending) {
            const p = pending;
            pending = null;
            const a = raw.trim().toLowerCase();
            if (p.kind === "approval")
                rt.approvals.respond(p.id, a.startsWith("s") ? "session" : a.startsWith("a") ? "always" : a.startsWith("y") ? "once" : "deny");
            else {
                const n = Number(a);
                rt.respondClarify(p.id, p.choices && n >= 1 && n <= p.choices.length ? p.choices[n - 1] : raw.trim() || null);
            }
            return;
        }
        if (raw.trim() === '"""') {
            if (inBlock) {
                inBlock = false;
                const t = buffer.join("\n");
                buffer = [];
                await submit(t);
            }
            else
                inBlock = true;
            return;
        }
        if (inBlock) {
            buffer.push(raw);
            return;
        }
        if (raw.endsWith("\\")) {
            buffer.push(raw.slice(0, -1));
            return;
        }
        const text = [...buffer, raw].join("\n");
        buffer = [];
        await submit(text);
    };
    const submit = async (text) => {
        const t = text.trim();
        if (!t) {
            prompt();
            return;
        }
        if (t === "/quit" || t === "/exit" || t === "/q") {
            rl.close();
            return;
        }
        if (t === "/clear") {
            console.clear();
            prompt();
            return;
        }
        if (looksLikeCommand(t, rt)) {
            const r = await runCommand(t, { rt, sid, source: "cli" });
            if (r?.text)
                println(r.text);
            if (r?.switchTo) {
                rt.attached.delete(sid);
                sid = r.switchTo;
                rt.attached.set(sid, 1);
                if (opts.yolo)
                    rt.approvals.yoloSessions.add(sid);
                const s = rt.db.getSession(sid);
                println(gray(`session ${sid}${s.title ? ` · "${s.title}"` : ""}`));
                if (r.clear) {
                    const recent = rt.db.getMessages(sid).filter((m) => (m.role === "user" || m.role === "assistant") && m.content && !m.meta?.compression_summary).slice(-4);
                    for (const m of recent)
                        println(m.role === "user" ? `${green("›")} ${m.content.slice(0, 300)}` : `${magenta("●")} ${m.content.slice(0, 600)}`);
                }
            }
            if (r?.send)
                void rt.send(sid, r.send, { source: "cli" });
            if (r?.exit)
                rl.close();
            if (!r?.send)
                prompt();
            return;
        }
        if (rt.isBusy(sid))
            println(gray("  (queued — runs after the current turn; use /steer to redirect now, Ctrl+C to interrupt)"));
        const { text: refs, images } = await expandReferences(rt, t, rt.sessionCwd(sid));
        const expanded = barePathHint(refs, rt.sessionCwd(sid));
        void rt.send(sid, expanded, { source: "cli", images });
    };
    rl.on("line", (l) => { void handle(l); });
    prompt();
    await new Promise((r) => rl.on("close", () => r()));
    rt.off("event", onEvent);
    rt.attached.delete(sid);
    if (rt.isBusy(sid))
        rt.interrupt(sid, true);
    console.log(dim(`\nbye — resume with: harness --resume ${sid}`));
    void bold;
}

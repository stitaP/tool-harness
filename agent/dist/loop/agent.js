/**
 * The agent turn loop: call the model, execute tool calls, feed results back,
 * repeat until the model answers without tools, the iteration budget runs out,
 * or the user interrupts. Strict role alternation is preserved at all times.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProviderError } from "../providers/types.js";
import { parseToolArgs } from "../util/jsonrepair.js";
import { errMsg, isAbort, truncateMiddle } from "../util/misc.js";
import { redactToolOutput } from "../util/redact.js";
import { log } from "../util/log.js";
import { compressSession, estimateMessages } from "./compression.js";
import { collapseRepeats, sameReply } from "./repeats.js";
function callKey(c) { return `${c.name}:${c.arguments}`; }
const LOOP_WINDOW = 12;
/**
 * max_tokens for one model call: whatever the context window has left after the prompt (minus a 5% margin for
 * estimate error), capped by `model.max_output_tokens` when it is > 0 (0 = auto, limited only by the context) and by
 * the provider's own output ceiling. Never below 512, so a nearly full window still gets a usable reply.
 */
export function outputBudget(contextWindow, promptTokens, cap, ceiling) {
    const room = contextWindow - promptTokens - Math.max(256, Math.round(contextWindow * 0.05));
    let n = cap > 0 ? Math.min(cap, room) : room;
    if (ceiling)
        n = Math.min(n, ceiling);
    return Math.max(512, n);
}
export async function runTurn(rt, o) {
    const sid = o.sessionId;
    const session = rt.ensureSystemPrompt(sid);
    const emit = (ev) => rt.emitEvent(sid, ev);
    const usage = { input: 0, output: 0 };
    const result = { final: "", iterations: 0, toolCalls: 0, toolNames: [], interrupted: false, usage };
    const maxIter = o.maxIterations ?? rt.cfg.data.agent.max_iterations;
    const budget = o.budget ?? { remaining: maxIter };
    // the reply that answered the previous message: a new request answered with the same text means the model
    // copied it instead of responding (common once a long reply sits in history several times)
    const source = String(o.userMeta?.source ?? "user");
    // replies to earlier requests (skipping placeholders like "(interrupted)"): a new request answered with one of them
    // means the model is replaying an old turn instead of responding
    const priorReplies = o.userText !== null && !o.depth && !["goal", "loop", "heartbeat"].includes(source)
        ? rt.db.getMessages(sid).filter((m) => m.role === "assistant" && (m.content ?? "").length >= 120 && !m.meta?.compression_ack && !m.meta?.interrupted && !m.meta?.repeat_discarded).slice(-6).map((m) => m.content)
        : [];
    const replaysOld = (text) => priorReplies.some((p) => sameReply(p, text));
    let repeatNudged = false, staleWarned = false;
    // texts already shown to the user in this turn: a step that repeats one is hidden (small models re-send their summary with every tool call)
    const shownTexts = [];
    const alreadyShown = (t) => shownTexts.some((x) => sameReply(x, t));
    // ── user message ────────────────────────────────────────────────
    if (o.userText !== null) {
        let text = o.userText;
        const userTurns = rt.db.getMessages(sid).filter((m) => m.role === "user").length;
        const every = rt.cfg.data.agent.memory_nudge_every;
        if (every > 0 && userTurns > 0 && userTurns % every === 0 && !o.depth) {
            text += "\n\n(Reminder: if you've learned durable facts about the user or environment, save them with the memory tool.)";
        }
        rt.db.addMessage(sid, { role: "user", content: text, meta: { ...(o.images?.length ? { images: o.images } : {}), ...o.userMeta } });
    }
    const tools = o.noTools ? [] : rt.activeTools(sid, o.allowedTools);
    const schemas = rt.tools.schemas(tools);
    const provider = rt.providerFor(sid);
    const maxOut = rt.cfg.data.agent.tool_profile === "slm" ? Math.min(rt.cfg.data.agent.max_tool_output_chars, 4000) : rt.cfg.data.agent.max_tool_output_chars;
    const recent = []; // recent tool-call keys (window LOOP_WINDOW)
    const recentTexts = []; // recent assistant texts that came with tool calls
    let textRepeats = 0;
    // read-without-act guard: small models often re-read files they were about to fix (and re-read them again
    // after context compression) without ever editing. Track reads/writes per path for this turn.
    const fileReads = new Map();
    const pathOf = (c) => {
        try {
            const a = JSON.parse(c.arguments || "{}");
            return typeof a.path === "string" ? a.path.replace(/^\.\//, "") : null;
        }
        catch {
            return null;
        }
    };
    let compressedThisTurn = 0;
    let badToolCalls = 0;
    let tokenCalib = 1, lastRawEstimate = 0, lastCompressAt = -99, overflowRetries = 0;
    let emptyRetries = 0;
    const ctxBase = (callId, name) => ({
        rt, session, toolCallId: callId, depth: o.depth ?? 0, allowedTools: o.allowedTools, budget, maxOutputChars: maxOut,
        get cwd() { return rt.sessionCwd(sid); },
        setCwd: (p) => rt.setSessionCwd(sid, p),
        signal: o.signal,
        progress: (text) => emit({ type: "tool_output", id: callId, name, text }),
        requestApproval: (req) => rt.approvals.check({ ...req, sessionId: sid }, { headlessMode: o.headlessApproval }),
        clarify: o.clarify ?? ((q, ch) => rt.askClarify(sid, q, ch)),
    });
    const execOne = async (call) => {
        const tool = rt.tools.resolveName(call.name, tools) ?? (o.allowedTools ? undefined : rt.tools.resolveName(call.name, rt.tools.discoverable(rt, tools)));
        const started = Date.now();
        if (!tool) {
            const msg = `error: unknown tool "${call.name}". Available tools: ${tools.map((t) => t.name).join(", ")}. Use tool_search to find others.`;
            emit({ type: "tool_end", id: call.id, name: call.name, ok: false, result: msg, ms: 0 });
            return msg;
        }
        let args;
        try {
            args = parseToolArgs(call.arguments, tool.parameters);
        }
        catch (e) {
            const msg = `error: ${errMsg(e)}. Send arguments as a JSON object matching: ${JSON.stringify(tool.parameters?.properties ?? {}).slice(0, 600)}`;
            emit({ type: "tool_end", id: call.id, name: tool.name, ok: false, result: msg, ms: 0 });
            return msg;
        }
        const missing = (tool.parameters?.required ?? []).filter((k) => args[k] === undefined || args[k] === null || args[k] === "");
        if (missing.length) {
            const msg = `error: missing required argument(s): ${missing.join(", ")}`;
            emit({ type: "tool_end", id: call.id, name: tool.name, ok: false, result: msg, ms: 0 });
            return msg;
        }
        emit({ type: "tool_start", id: call.id, name: tool.name, args });
        const hookBlock = await rt.hooks.preTool(sid, tool.name, args);
        if (hookBlock) {
            emit({ type: "tool_end", id: call.id, name: tool.name, ok: false, result: hookBlock, ms: 0 });
            return hookBlock;
        }
        let out, ok = true;
        // unattended runs: a script (terminal / execute_code) must not wipe project files the file tools would protect
        const guardCwd = rt.sessionCwd(sid); // the command may cd elsewhere: compare the folder it started in
        const scriptGuard = session.source === "pipeline" && (tool.name === "terminal" || tool.name === "execute_code")
            ? rt.checkpoints.take(guardCwd, `before ${tool.name} (pipeline)`) : null;
        try {
            const r = await tool.handler(args, ctxBase(call.id, tool.name));
            out = typeof r === "string" ? r : r.content;
            if (scriptGuard && !scriptGuard.startsWith("file-"))
                out += restoreShrunk(rt, guardCwd, scriptGuard);
        }
        catch (e) {
            ok = false;
            out = isAbort(e) ? "[interrupted by user]" : `error: ${errMsg(e)}`;
            if (!isAbort(e))
                log.warn(`tool ${tool.name} failed: ${errMsg(e)}`);
        }
        if (out === undefined || out === null)
            out = "(no output)";
        if (rt.cfg.data.security.redact_tool_output)
            out = redactToolOutput(out, rt.cfg.allSecretValues());
        if (out.length > maxOut) {
            const dir = join(rt.home, "spill");
            mkdirSync(dir, { recursive: true });
            const file = join(dir, `${sid}-${call.id.replace(/[^a-zA-Z0-9_-]/g, "")}.txt`);
            writeFileSync(file, out);
            out = truncateMiddle(out, maxOut, `full output saved to ${file} — read it with read_file offset/limit or search_files`);
        }
        await rt.hooks.postTool(sid, tool.name, args, out);
        emit({ type: "tool_end", id: call.id, name: tool.name, ok, result: out.slice(0, 4000), ms: Date.now() - started });
        result.toolNames.push(tool.name);
        return out;
    };
    try {
        for (;;) {
            if (o.signal.aborted)
                throw Object.assign(new Error("interrupted"), { name: "AbortError" });
            if (result.iterations >= maxIter || budget.remaining <= 0) {
                result.budgetExhausted = true;
                break;
            }
            let history = rt.db.getMessages(sid);
            // preflight compression
            // compress whenever needed, but not again within 3 model calls of the previous compression
            if (rt.cfg.data.compression.enabled && result.iterations - lastCompressAt >= 3) {
                const sys = rt.db.getSession(sid)?.system_prompt ?? "";
                const raw = estimateMessages(history) + Math.ceil(sys.length / 4) + Math.ceil(JSON.stringify(schemas).length / 4);
                // chars/4 under-counts code/CSS/HTML; scale by what the server actually reported last call
                const est = Math.round(raw * tokenCalib);
                if (est > provider.contextWindow * rt.cfg.data.compression.threshold) {
                    emit({ type: "status", text: "Compressing context…" });
                    const r = await compressSession(rt, sid, { signal: o.signal, reason: "context window pressure" });
                    compressedThisTurn++;
                    lastCompressAt = result.iterations;
                    if (r.ok) {
                        emit({ type: "compressed", text: r.note });
                        history = rt.db.getMessages(sid);
                    }
                }
            }
            result.iterations++;
            budget.remaining--;
            const messages = [{ role: "system", content: rt.db.getSession(sid)?.system_prompt ?? "" }, ...collapseRepeats(history)];
            lastRawEstimate = estimateMessages(messages) + Math.ceil(JSON.stringify(schemas).length / 4);
            const mc = rt.cfg.data.model;
            const maxTokens = outputBudget(provider.contextWindow, Math.round(lastRawEstimate * tokenCalib), mc.max_output_tokens ?? 4096, mc.provider === "anthropic" ? 32000 : undefined);
            await rt.hooks.emit("pre_llm_call", { sessionId: sid, iteration: result.iterations });
            let resp;
            try {
                resp = await provider.chat({
                    messages, tools: schemas.length ? schemas : undefined, signal: o.signal, maxTokens,
                    onToken: (t) => emit({ type: "token", text: t }),
                    onReasoning: (t) => emit({ type: "reasoning", text: t }),
                    stream: rt.cfg.data.agent.stream,
                });
            }
            catch (e) {
                if (e instanceof ProviderError && e.kind === "bad_tool_call" && badToolCalls++ < 3) {
                    // tell the model what went wrong instead of ending the turn (small models often break JSON
                    // escaping in long file contents, e.g. unescaped double quotes)
                    const col = Number(/column (\d+)/.exec(e.message)?.[1] ?? 0);
                    const hint = col > 2500
                        ? `the call was too long (${col} characters) and was cut off before it finished — do NOT resend it whole; change the file in several small patch calls (one rule or block each)`
                        : /missing closing quote|invalid string|unexpected end/i.test(e.message)
                            ? "the arguments were cut off or contained an unescaped double quote"
                            : "the arguments were not valid JSON";
                    emit({ type: "status", text: "Invalid tool call from the model — asking it to retry" });
                    rt.db.addMessage(sid, { role: "user", content: `[Your last tool call could not be executed: ${hint}. Retry it. Inside JSON strings escape every double quote as \\" and newlines as \\n. For large content prefer several smaller patch calls, or write_file with the complete file.]`, meta: { tool_call_repair: true } });
                    result.iterations--;
                    budget.remaining++;
                    continue;
                }
                if (e instanceof ProviderError && e.kind === "context_length" && overflowRetries++ < 3) {
                    emit({ type: "status", text: "Context too long — compressing and retrying…" });
                    await compressSession(rt, sid, { signal: o.signal, reason: "provider rejected context length" });
                    compressedThisTurn++;
                    result.iterations--;
                    budget.remaining++;
                    continue;
                }
                throw e;
            }
            usage.input += resp.usage.input;
            usage.output += resp.usage.output;
            if (resp.usage.input > 0 && lastRawEstimate > 0)
                tokenCalib = Math.min(3, Math.max(1, resp.usage.input / lastRawEstimate));
            rt.db.addUsage({ session_id: sid, model: resp.model, input_tokens: resp.usage.input, output_tokens: resp.usage.output, cached_tokens: resp.timings?.cacheTokens, kind: o.depth ? "subagent" : "main" });
            emit({ type: "model_call", model: resp.model, usage: resp.usage, timings: resp.timings, context: { used: resp.usage.input + resp.usage.output, window: provider.contextWindow, compact_at: rt.cfg.data.compression.enabled ? rt.cfg.data.compression.threshold : null } });
            if (!resp.toolCalls.length && !resp.content.trim()) {
                if (emptyRetries++ < 2) {
                    emit({ type: "status", text: "Empty model response — retrying" });
                    continue;
                }
                result.final = "(The model returned an empty response. Try rephrasing, or switch models with /model.)";
                rt.db.addMessage(sid, { role: "assistant", content: result.final });
                break;
            }
            if (resp.toolCalls.length) {
                // loop detection: small models sometimes finish, then keep re-sending the same summary with a rotating set
                // of tool calls (run tests → read plan → save skill → …). Warn once, then end the turn.
                const text = (resp.content ?? "").replace(/\s+/g, " ").trim();
                const sameText = text.length >= 80 && recentTexts.includes(text);
                textRepeats = sameText ? textRepeats + 1 : 0;
                if (text) {
                    recentTexts.push(text);
                    if (recentTexts.length > 4)
                        recentTexts.shift();
                }
                const keys = resp.toolCalls.map(callKey);
                for (const k of keys) {
                    recent.push(k);
                    if (recent.length > LOOP_WINDOW)
                        recent.shift();
                }
                const maxCount = Math.max(...keys.map((k) => recent.filter((x) => x === k).length));
                if (textRepeats >= 2 || maxCount >= 5) {
                    const why = textRepeats >= 2 ? "repeating the same reply" : `making the same ${resp.toolCalls[keys.findIndex((k) => recent.filter((x) => x === k).length === maxCount)].name} call over and over`;
                    emit({ type: "status", text: `Stopped a repeating loop: the model kept ${why}` });
                    result.final = resp.content?.trim() || `(Stopped: the model kept ${why}.)`;
                    if (alreadyShown(result.final)) {
                        emit({ type: "discard_text" });
                        result.repeatedFinal = true;
                    }
                    rt.db.addMessage(sid, { role: "assistant", content: result.final, meta: { loop_stopped: true } });
                    break;
                }
                const staleNote = !staleWarned && text && replaysOld(resp.content ?? "")
                    ? `\n\n[Note: this reply repeats your answer to an earlier request. The current request is:\n"${(o.userText ?? "").slice(0, 800)}"\nWork on that request now (if it names a file, read it and do what it asks) — do not redo finished work.]`
                    : "";
                if (staleNote)
                    staleWarned = true;
                const loopNote = staleNote || sameText || maxCount >= 3
                    ? staleNote || `\n\n[Note: you are repeating yourself — ${sameText ? "you already sent this exact reply" : "you have made this call several times"} and the results have not changed. If the task is complete, reply with your final answer and NO tool calls. Otherwise do something different.]`
                    : "";
                const dupStep = !!text && alreadyShown(resp.content ?? "");
                if (dupStep)
                    emit({ type: "discard_text" }); // hide the repeat; keep only the tool calls
                else if (text)
                    shownTexts.push(resp.content);
                rt.db.addMessage(sid, { role: "assistant", content: dupStep ? null : resp.content || null, tool_calls: resp.toolCalls });
                emit({ type: "assistant_step", text: resp.content, calls: resp.toolCalls.map((c) => ({ id: c.id, name: c.name })) });
                const safe = rt.cfg.data.agent.parallel_tools && resp.toolCalls.length > 1 &&
                    resp.toolCalls.every((c) => rt.tools.resolveName(c.name, tools)?.parallelSafe);
                const outputs = new Array(resp.toolCalls.length);
                // the reply hit the output-token limit: its last call was cut off mid-arguments. Never run it — JSON repair
                // would "close" the string and e.g. write half a file — and tell the model how to split the work.
                const cutOff = resp.finishReason === "length" ? resp.toolCalls.length - 1 : -1;
                const run = async (c, i) => {
                    if (i !== cutOff)
                        return execOne(c);
                    const msg = `error: your reply reached the output token limit while writing this ${c.name} call (${c.arguments.length} characters), so it was cut off and NOT executed. ` +
                        (c.name === "write_file" ? "Split the file: write_file the first part (about 150 lines), then add the rest with further write_file calls using append=true." : "Send smaller arguments, splitting the work over several calls.");
                    emit({ type: "tool_end", id: c.id, name: c.name, ok: false, result: msg, ms: 0 });
                    return msg;
                };
                if (safe) {
                    await Promise.all(resp.toolCalls.map(async (c, i) => { outputs[i] = await run(c, i); }));
                }
                else {
                    for (const [i, c] of resp.toolCalls.entries()) {
                        if (o.signal.aborted) {
                            outputs[i] = "[skipped: interrupted by user]";
                            continue;
                        }
                        outputs[i] = await run(c, i);
                    }
                }
                // read-without-act guard
                for (const [i, c] of resp.toolCalls.entries()) {
                    const p = pathOf(c);
                    if (!p)
                        continue;
                    if (c.name === "write_file" || c.name === "patch") {
                        for (const k of [...fileReads.keys()])
                            if (k.startsWith(`${p}#`))
                                fileReads.delete(k);
                        continue;
                    }
                    if (c.name !== "read_file" || /^error/.test(outputs[i] ?? ""))
                        continue;
                    const offsetKey = `${p}#${(() => { try {
                        return JSON.parse(c.arguments || "{}").offset ?? 1;
                    }
                    catch {
                        return 1;
                    } })()}`;
                    const n = (fileReads.get(offsetKey) ?? 0) + 1;
                    fileReads.set(offsetKey, n);
                    if (n >= 2)
                        outputs[i] += `\n\n[Note: you already read this part of ${p} earlier in this task and have not changed the file since. Do not read it again — make the change now with patch or write_file.]`;
                }
                if (loopNote)
                    outputs[outputs.length - 1] += loopNote;
                const steer = o.takeSteer?.();
                if (steer)
                    outputs[outputs.length - 1] += `\n\n[Message from the user while you were working]: ${steer}`;
                resp.toolCalls.forEach((c, i) => rt.db.addMessage(sid, { role: "tool", tool_call_id: c.id, name: c.name, content: outputs[i] }));
                result.toolCalls += resp.toolCalls.length;
                if (o.signal.aborted)
                    throw Object.assign(new Error("interrupted"), { name: "AbortError" });
                continue;
            }
            result.final = resp.content.trim();
            if (alreadyShown(result.final)) {
                emit({ type: "discard_text" });
                result.repeatedFinal = true;
            }
            else if (!repeatNudged && replaysOld(result.final)) {
                // ask once for a real answer; the copy is not kept in history (it would reinforce the pattern)
                repeatNudged = true;
                emit({ type: "discard_text" });
                emit({ type: "status", text: "The reply repeated the previous answer — asking the model to respond to your latest message" });
                rt.db.addMessage(sid, { role: "assistant", content: "[I repeated my previous answer instead of responding — discarded.]", meta: { repeat_discarded: true } });
                rt.db.addMessage(sid, { role: "user", content: `[Harness note: your reply repeated your previous answer and did not respond to the latest message:\n"${(o.userText ?? "").slice(0, 800)}"\nRespond to that message now. If it names a file, read the file and do what it asks.]`, meta: { repeat_nudge: true, source: "harness" } });
                result.final = "";
                continue;
            }
            rt.db.addMessage(sid, { role: "assistant", content: result.final });
            break;
        }
        if (result.budgetExhausted && !result.final) {
            emit({ type: "status", text: "Iteration budget reached — asking for a summary" });
            const history = rt.db.getMessages(sid);
            const last = history[history.length - 1];
            const note = "[Iteration budget reached. Stop calling tools. Summarize what you accomplished, what remains, and the next step.]";
            const msgs = [{ role: "system", content: rt.db.getSession(sid)?.system_prompt ?? "" }, ...history];
            if (last?.role === "tool")
                msgs[msgs.length - 1] = { ...last, content: `${last.content}\n\n${note}` };
            else
                msgs.push({ role: "user", content: note });
            const r = await provider.chat({ messages: msgs, signal: o.signal, onToken: (t) => emit({ type: "token", text: t }), stream: rt.cfg.data.agent.stream });
            result.final = r.content.trim() || "(stopped: iteration budget reached)";
            rt.db.addMessage(sid, { role: "assistant", content: result.final, meta: { budget_summary: true } });
        }
    }
    catch (e) {
        if (isAbort(e) || o.signal.aborted) {
            result.interrupted = true;
            repairDangling(rt, sid, "(interrupted)");
            result.final = result.final || "(interrupted)";
        }
        else {
            result.error = errMsg(e);
            log.error(`turn failed in ${sid}: ${result.error}`);
            const msg = `Error: ${result.error}`;
            repairDangling(rt, sid, msg);
            result.final = msg;
        }
    }
    return result;
}
/** Make the stored history valid again after an interruption or crash. */
export function repairDangling(rt, sid, closing) {
    const msgs = rt.db.getMessages(sid);
    const last = msgs[msgs.length - 1];
    if (!last)
        return;
    if (last.role === "assistant" && !last.tool_calls?.length)
        return;
    // tool calls without results (all or some siblings)
    const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant" && m.tool_calls?.length);
    if (lastAssistant) {
        const after = msgs.slice(msgs.indexOf(lastAssistant) + 1);
        const have = new Set(after.filter((m) => m.role === "tool").map((m) => m.tool_call_id));
        for (const c of lastAssistant.tool_calls)
            if (!have.has(c.id))
                rt.db.addMessage(sid, { role: "tool", tool_call_id: c.id, name: c.name, content: "[interrupted before this tool ran]" });
    }
    const now = rt.db.getMessages(sid);
    if (now[now.length - 1]?.role === "user" || now[now.length - 1]?.role === "tool") {
        rt.db.addMessage(sid, { role: "assistant", content: closing, meta: { interrupted: true } });
    }
}
/** Undo a script's wipe of project files (most lines gone, or deleted) and tell the model what happened. */
function restoreShrunk(rt, cwd, checkpoint) {
    const hit = rt.checkpoints.shrunkSince(cwd, checkpoint);
    if (!hit.length)
        return "";
    rt.checkpoints.restorePaths(cwd, checkpoint, hit.map((h) => h.path));
    log.warn(`restored ${hit.length} file(s) wiped by a script: ${hit.map((h) => h.path).join(", ")}`);
    return `\n\n[harness] This command removed most of ${hit.map((h) => `${h.path} (${h.was}→${h.now} lines)`).join(", ")}; ` +
        `${hit.length === 1 ? "it was" : "they were"} put back. Change existing files with patch instead of rewriting them from a script.`;
}

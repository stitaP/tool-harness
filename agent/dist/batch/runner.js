/**
 * Batch runner: run the agent over many prompts in parallel and write
 * ShareGPT trajectories (JSONL) — eval sets and fine-tuning data for SLMs.
 * Input: .jsonl with {"prompt": "..."} per line, or a .txt with one prompt per line.
 */
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { toShareGPT } from "../runtime/export.js";
export async function runBatch(rt, input, out, opts = {}) {
    const raw = readFileSync(input, "utf8").split(/\r?\n/).filter((l) => l.trim());
    const prompts = raw.map((l) => { try {
        const j = JSON.parse(l);
        return String(j.prompt ?? j.input ?? j.question ?? l);
    }
    catch {
        return l;
    } });
    writeFileSync(out, "");
    let next = 0, ok = 0, failed = 0, done = 0;
    const worker = async () => {
        for (;;) {
            const i = next++;
            if (i >= prompts.length)
                return;
            const r = await rt.runHeadless({ prompt: prompts[i], source: "batch", title: `batch #${i + 1}`, approvalMode: opts.approvalMode ?? "deny" }).catch((e) => ({ sessionId: "", final: "", error: String(e) }));
            if (r.sessionId) {
                const s = rt.db.getSession(r.sessionId);
                appendFileSync(out, JSON.stringify({ index: i, prompt: prompts[i], error: r.error ?? null, ...toShareGPT(s.system_prompt ?? "", rt.db.getMessages(r.sessionId)) }) + "\n");
            }
            if (r.error || !r.sessionId)
                failed++;
            else
                ok++;
            opts.onProgress?.(++done, prompts.length);
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, worker));
    return { ok, failed };
}

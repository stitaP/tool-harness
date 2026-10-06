/**
 * run_tests: run a test command and return only what matters: the counts and, per failing test, its name,
 * location and assertion. Raw `node --test` output is mostly stack frames; a small model reading it hundreds
 * of times per phase spends its context (and prefill time) on noise.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { obj, str, int } from "./types.js";
const STACK = /^\s*at\s|node:internal|^\s*(generatedMessage|code|operator|diff):|^\s*[{}]\s*$/;
/** Compact summary of node:test output (spec or TAP reporter); other runners get their filtered tail. */
export function summarizeTests(output, exitCode, maxFailures = 12) {
    const text = output.replace(/\x1b\[[0-9;]*m/g, "");
    const num = (k) => { const m = new RegExp(`^(?:ℹ|#) ${k} (\\d+)`, "m").exec(text); return m ? Number(m[1]) : null; };
    const tests = num("tests"), pass = num("pass"), fail = num("fail");
    const failures = [];
    const spec = text.split(/^✖ failing tests:\s*$/m)[1];
    if (spec) {
        for (const block of spec.split(/^(?=test at )/m).map((b) => b.trim()).filter(Boolean)) {
            const lines = block.split("\n").filter((l) => l.trim() && !STACK.test(l));
            failures.push(lines.slice(0, 8).map((l) => l.replace(/^\s{2,}/, "  ")).join("\n"));
        }
    }
    else {
        // TAP: "not ok 3 - name" followed by an indented YAML block
        const re = /^\s*not ok \d+ - (.+)$([\s\S]*?)(?=^\s*(?:not )?ok \d+ |^# |(?![\s\S]))/gm;
        for (let m; (m = re.exec(text));) {
            if (/^\s*# Subtest/.test(m[2]))
                continue;
            const keep = m[2].split("\n").filter((l) => /^\s*(location|error|expected|actual|failureType):/.test(l)).map((l) => "  " + l.trim());
            failures.push([`✖ ${m[1].trim()}`, ...keep.slice(0, 6)].join("\n"));
        }
    }
    const head = tests !== null ? `${fail ? "FAIL" : exitCode === 0 ? "PASS" : "FAIL"}: ${pass ?? "?"}/${tests} passed${fail ? `, ${fail} failed` : ""}` : `exit code ${exitCode}`;
    if (failures.length)
        return `${head}\n\n${failures.slice(0, maxFailures).join("\n\n")}${failures.length > maxFailures ? `\n\n… ${failures.length - maxFailures} more failing tests` : ""}`;
    if (exitCode === 0)
        return head;
    // crashed before any test ran (syntax error, missing module) or another runner: the meaningful tail
    const tail = text.split("\n").filter((l) => l.trim() && !STACK.test(l)).slice(-30).join("\n");
    return `${head}\n${tail}`;
}
export const runTestsTool = {
    name: "run_tests", toolset: "terminal", tier: "slm",
    description: "Run tests and get a short result: pass/fail counts plus each failing test's name, location and assertion (stack traces removed). " +
        "Prefer this over terminal for running tests. Default command: npm test.",
    parameters: obj({ command: str("Test command, e.g. `node --test tests/phase-07.test.js` (default: npm test)"), timeout: int("Seconds (default 300)") }, []),
    async handler(a, ctx) {
        const command = String(a.command ?? "").trim() || "npm test";
        if (!/\b(test|spec|jest|vitest|mocha|pytest|cargo test|go test)\b/i.test(command))
            return "error: run_tests only runs test commands; use terminal for anything else";
        const timeoutS = Math.min(Number(a.timeout) || 300, 1800);
        const res = await ctx.rt.terminal.exec(command, { cwd: ctx.cwd, timeoutMs: timeoutS * 1000, signal: ctx.signal });
        if (res.interrupted)
            return "[interrupted by user]";
        let summary = summarizeTests(res.output, res.timedOut ? null : res.exitCode);
        if (res.timedOut)
            summary = `[timed out after ${timeoutS}s: a test is probably left waiting (an open server or timer)]\n${summary}`;
        if (summary.length < res.output.length) {
            const dir = join(ctx.rt.home, "spill");
            mkdirSync(dir, { recursive: true });
            const file = join(dir, `${ctx.session.id}-${ctx.toolCallId.replace(/[^a-zA-Z0-9_-]/g, "")}-tests.txt`);
            writeFileSync(file, res.output);
            summary += `\n(full output: ${file})`;
        }
        return summary;
    },
};

/**
 * file_history: earlier versions of a file from the automatic checkpoints, so the agent can see what it (or an
 * earlier phase) replaced and put working code back instead of rewriting it from memory.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative } from "node:path";
import { blockedReason, protectedReason, resolvePath } from "../safety/paths.js";
import { obj, str, int, enm } from "./types.js";
const when = (t) => new Date(t).toLocaleString("en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
export const fileHistoryTool = {
    name: "file_history", toolset: "files", tier: "slm",
    description: "Earlier versions of a file (saved automatically before every edit). action=list shows versions with line counts; action=show prints one version; action=restore puts it back. " +
        "Use when a test from an earlier phase broke, or a file lost content, to recover the working code instead of rewriting it.",
    parameters: obj({
        path: str("File path"),
        action: enm(["list", "show", "restore"], "list (default), show or restore"),
        version: str("show/restore: version id from list"),
        offset: int("show: first line (default 1)"),
        limit: int("show: number of lines (default 200)"),
    }, ["path"]),
    async handler(a, ctx) {
        const abs = resolvePath(ctx.cwd, a.path);
        const rel = relative(ctx.cwd, abs);
        if (!rel || rel.startsWith(".."))
            return "error: file_history works for files inside the working folder";
        const cp = ctx.rt.checkpoints;
        const action = a.action ?? "list";
        if (action === "list") {
            const vs = cp.fileVersions(ctx.cwd, rel);
            if (!vs.length)
                return `No saved versions of ${rel}.`;
            const now = existsSync(abs) ? readFileSync(abs, "utf8").split("\n").length : 0;
            return `${rel} now: ${now ? `${now} lines` : "missing"}. Saved versions (newest first):\n` +
                vs.map((v) => `${v.id}  ${when(v.time)}  ${v.lines === null ? "(did not exist)" : `${v.lines} lines`}${v.lines && now && v.lines > now * 1.5 ? "  ← much longer than now" : ""}`).join("\n") +
                `\nfile_history action=show version=<id> to read one; action=restore to put it back.`;
        }
        if (!a.version)
            return "error: version is required (from action=list)";
        const text = cp.fileAt(ctx.cwd, String(a.version), rel);
        if (text === null)
            return `error: ${rel} does not exist in version ${a.version}`;
        if (action === "show") {
            const lines = text.split("\n"), from = Math.max(1, Number(a.offset) || 1), n = Math.max(1, Number(a.limit) || 200);
            const part = lines.slice(from - 1, from - 1 + n).map((l, i) => `${String(from + i).padStart(5)}  ${l}`).join("\n");
            return `${rel} at ${a.version} (${lines.length} lines):\n${part}${from - 1 + n < lines.length ? `\n… more: offset=${from + n}` : ""}`;
        }
        const why = blockedReason(abs, ctx.rt.cfg.data.security.blocked_paths, true) ?? protectedReason(abs, ctx.rt.cfg.data.security.protected_paths);
        if (why)
            return `error: ${why}`;
        cp.take(ctx.cwd, `before file_history restore ${rel}`, abs);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, text);
        return `Restored ${rel} to version ${a.version} (${text.split("\n").length} lines). Re-apply any newer changes you still need with patch, then run the tests.`;
    },
};

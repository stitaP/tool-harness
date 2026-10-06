import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { promisify } from "node:util";
import { blockedReason, protectedReason, resolvePath } from "../safety/paths.js";
import { obj, str, int, bool, enm, arr } from "./types.js";
const execFileP = promisify(execFile);
const SKIP_DIRS = new Set(["node_modules", ".git", ".hg", ".svn", "dist", "build", ".venv", "venv", "__pycache__", ".next", "target", ".cache", ".idea", ".turbo", "coverage"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const SENSITIVE_WRITE = /(^|[\\/])(\.env(\.[^\\/]*)?|\.bashrc|\.zshrc|\.profile|\.bash_profile|authorized_keys|config\.yaml)$/;
function guard(ctx, p, write) {
    const abs = resolvePath(ctx.cwd, p);
    const why = blockedReason(abs, ctx.rt.cfg.data.security.blocked_paths, write) ?? (write ? protectedReason(abs, ctx.rt.cfg.data.security.protected_paths) : null);
    if (why)
        throw new Error(why);
    return abs;
}
const PLACEHOLDER = /\[REDACTED[^\]]*\]/g;
const countPlaceholders = (t) => (t.match(PLACEHOLDER) ?? []).length;
/** "[REDACTED]" is how hidden secrets are displayed, never real code: writing it back corrupts the file. */
export function placeholderError(before, after) {
    return countPlaceholders(after) > countPlaceholders(before)
        ? "content contains \"[REDACTED]\", a display placeholder for a hidden value, not code. Write the real expression (re-read the file or the spec), or read the value from an environment variable."
        : null;
}
/** Overwriting most of an existing file is how earlier work gets lost (a page replaced by an empty shell). */
export function shrinkError(before, after, rel, canForce) {
    const was = before.split("\n").length, now = after.split("\n").length;
    if (was < 20 || now >= was * 0.5)
        return null;
    return `this would replace ${rel} (${was} lines) with ${now} lines, dropping most of the existing file. Change existing files with patch, or add with append=true.` +
        (canForce ? " If you really mean to replace the whole file, call write_file again with replace_whole=true." : " Unattended runs can't replace whole files; use patch.");
}
function isBinary(buf) {
    const n = Math.min(buf.length, 8000);
    for (let i = 0; i < n; i++)
        if (buf[i] === 0)
            return true;
    return false;
}
/** Last read of each file part per session, to answer a re-read of an unchanged file without resending it. */
const lastReads = new Map();
/** The earlier result is still in the conversation (not archived by compression)? */
function stillInContext(ctx, callId) {
    try {
        return ctx.rt.db.getMessages(ctx.session.id).some((m) => m.role === "tool" && m.tool_call_id === callId);
    }
    catch {
        return false;
    }
}
export const readFileTool = {
    name: "read_file", toolset: "files", tier: "slm", parallelSafe: true,
    description: "Read a text file with line numbers. Use offset/limit to page through large files. For images use vision_analyze.",
    parameters: obj({ path: str("File path (relative to cwd or absolute)"), offset: int("1-based line to start from (default 1)"), limit: int("Max lines to return (default 400)"), reread: bool("Send the file again even if it is unchanged since your last read") }, ["path"]),
    async handler(a, ctx) {
        const abs = guard(ctx, a.path, false);
        if (!existsSync(abs))
            return `error: file not found: ${abs}`;
        const st = statSync(abs);
        if (st.isDirectory())
            return `error: ${abs} is a directory — use list_dir`;
        if (IMAGE_EXT.has(extname(abs).toLowerCase()))
            return `${abs} is an image (${st.size} bytes). Use vision_analyze to look at it.`;
        if (st.size > 20 * 1024 * 1024)
            return `error: file is ${(st.size / 1e6).toFixed(1)} MB — too large to read; use search_files or terminal (head/tail).`;
        const buf = readFileSync(abs);
        if (isBinary(buf))
            return `${abs} is a binary file (${st.size} bytes); not shown.`;
        const lines = buf.toString("utf8").split(/\r?\n/);
        const offset = Math.max(1, Number(a.offset) || 1);
        const limit = Math.max(1, Math.min(Number(a.limit) || 400, 2000));
        const key = `${ctx.session.id}|${abs}|${offset}|${limit}`, prev = lastReads.get(key);
        if (prev && a.reread !== true && prev.mtimeMs === st.mtimeMs && prev.size === st.size && stillInContext(ctx, prev.callId)) {
            return `${relative(ctx.cwd, abs) || abs} is unchanged since you last read it (${lines.length} lines): use that earlier read_file result. (reread=true sends it again.)`;
        }
        lastReads.delete(key);
        lastReads.set(key, { mtimeMs: st.mtimeMs, size: st.size, callId: ctx.toolCallId });
        if (lastReads.size > 5000)
            lastReads.delete(lastReads.keys().next().value);
        let slice = lines.slice(offset - 1, offset - 1 + limit);
        const w = String(offset + slice.length).length;
        const fmt = (l, i) => `${String(offset + i).padStart(w)}| ${l.length > 2000 ? l.slice(0, 2000) + " …[line truncated]" : l}`;
        // Page on whole lines within the model's tool-output budget, so a small model gets the first part of
        // the file plus an exact "continue at offset=N" instead of a middle-truncated blob it cannot see.
        const budget = (ctx.maxOutputChars ?? Infinity) - 200;
        if (Number.isFinite(budget)) {
            let used = 0, n = 0;
            while (n < slice.length && used + fmt(slice[n], n).length + 1 <= budget) {
                used += fmt(slice[n], n).length + 1;
                n++;
            }
            slice = slice.slice(0, Math.max(1, n));
        }
        const body = slice.map(fmt).join("\n");
        const more = offset - 1 + slice.length < lines.length ? `\n… ${lines.length - (offset - 1 + slice.length)} more lines — NOT shown yet. Call read_file again with offset=${offset + slice.length} to read them.` : "";
        return `${relative(ctx.cwd, abs) || abs} (${lines.length} lines)\n${body}${more}`;
    },
};
export const writeFileTool = {
    name: "write_file", toolset: "files", tier: "slm",
    description: "Create or overwrite a file with the given content (parent directories are created). For small changes to existing files prefer patch. For long files (over ~150 lines) write the first part, then add the rest in further calls with append=true.",
    parameters: obj({ path: str("File path"), content: str("File content (the whole file, or the next part when append=true)"), append: { type: "boolean", description: "Add content to the end of the file instead of replacing it" }, replace_whole: { type: "boolean", description: "Confirm replacing most of an existing file (only after being told to)" } }, ["path", "content"]),
    async handler(a, ctx) {
        const abs = guard(ctx, a.path, true);
        {
            const before = existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, "utf8") : "";
            const content = String(a.content ?? "");
            const append = a.append === true || a.append === "true";
            const bad = placeholderError(before, append ? before + content : content) ??
                (append || a.replace_whole === true && ctx.session.source !== "pipeline" ? null : shrinkError(before, content, relative(ctx.cwd, abs) || abs, ctx.session.source !== "pipeline"));
            if (bad)
                throw new Error(bad);
        }
        if (SENSITIVE_WRITE.test(abs) && existsSync(abs)) {
            const ok = await ctx.requestApproval({ tool: "write_file", command: `write ${abs}`, reason: "overwriting a sensitive configuration file" });
            if (!ok)
                return "BLOCKED: not approved.";
        }
        ctx.rt.checkpoints.take(ctx.cwd, `before write_file ${relative(ctx.cwd, abs)}`, abs);
        mkdirSync(dirname(abs), { recursive: true });
        const content = String(a.content ?? "");
        const existed = existsSync(abs);
        const rel = relative(ctx.cwd, abs) || abs;
        if (a.append === true || a.append === "true") {
            appendFileSync(abs, content);
            const total = readFileSync(abs, "utf8");
            return `Appended ${content.split("\n").length} lines to ${rel} (now ${total.split("\n").length} lines, ${Buffer.byteLength(total)} bytes)`;
        }
        writeFileSync(abs, content);
        return `${existed ? "Overwrote" : "Created"} ${rel} (${content.split("\n").length} lines, ${Buffer.byteLength(content)} bytes)`;
    },
};
function normLine(l) { return l.replace(/\s+/g, " ").trim(); }
/** Exact replace; otherwise whitespace-insensitive line-block match. */
export function applyEdit(text, oldS, newS, replaceAll) {
    if (oldS === "")
        throw new Error("old_string is empty; use write_file to create files");
    const exact = text.split(oldS).length - 1;
    if (exact === 1 || (exact > 1 && replaceAll))
        return { text: text.split(oldS).join(newS), count: exact, fuzzy: false };
    if (exact > 1)
        throw new Error(`old_string matches ${exact} places; include more surrounding context or set replace_all=true`);
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const want = oldS.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "").split("\n").map(normLine);
    const hits = [];
    for (let i = 0; i + want.length <= lines.length; i++) {
        let ok = true;
        for (let j = 0; j < want.length; j++)
            if (normLine(lines[i + j]) !== want[j]) {
                ok = false;
                break;
            }
        if (ok)
            hits.push(i);
    }
    if (!hits.length)
        throw new Error("old_string not found (even ignoring whitespace). Re-read the file and copy the exact text.");
    if (hits.length > 1 && !replaceAll)
        throw new Error(`old_string matches ${hits.length} places (ignoring whitespace); add context or set replace_all=true`);
    // keep the file's indentation for the first line when the model dropped it
    const indent = /^\s*/.exec(lines[hits[0]])[0];
    const newLines = newS.replace(/\r\n/g, "\n").split("\n");
    const fixed = /^\s/.test(newLines[0]) || !indent ? newLines : newLines.map((l, k) => (k === 0 || l.trim() ? indent + l : l));
    for (const h of [...hits].reverse())
        lines.splice(h, want.length, ...fixed);
    return { text: lines.join(eol), count: hits.length, fuzzy: true };
}
/** Where old_string most likely was meant to match: the file's lines nearest to it, numbered, to copy from. */
export function closestBlock(text, oldS) {
    const want = oldS.split("\n").map(normLine).filter(Boolean);
    if (!want.length)
        return "";
    const lines = text.split(/\r?\n/);
    const words = (l) => new Set(l.toLowerCase().match(/[a-z0-9_$.#-]{2,}/g) ?? []);
    const target = want.map(words);
    const sim = (a, b) => { if (!a.size || !b.size)
        return 0; let n = 0; for (const w of a)
        if (b.has(w))
            n++; return n / Math.max(a.size, b.size); };
    let best = -1, bestScore = 0;
    for (let i = 0; i < lines.length; i++) {
        let sc = 0;
        for (let j = 0; j < want.length && i + j < lines.length; j++)
            sc += sim(words(lines[i + j]), target[j]);
        if (sc > bestScore) {
            bestScore = sc;
            best = i;
        }
    }
    if (best < 0 || bestScore / want.length < 0.3)
        return "";
    const from = Math.max(0, best - 2), to = Math.min(lines.length, best + want.length + 2);
    return `\nClosest text in the file (lines ${from + 1}-${to}); copy old_string exactly from here:\n` +
        lines.slice(from, to).map((l, k) => `${String(from + k + 1).padStart(5)}  ${l}`).join("\n");
}
export const patchTool = {
    name: "patch", toolset: "files", tier: "slm",
    description: "Edit a file by replacing old_string with new_string (old_string must match uniquely; whitespace differences are tolerated). Use `edits` for several replacements in one call.",
    parameters: obj({
        path: str("File path"),
        old_string: str("Exact existing text to replace (include enough context to be unique)"),
        new_string: str("Replacement text"),
        replace_all: bool("Replace every occurrence"),
        edits: arr(obj({ old_string: str("text to find"), new_string: str("replacement"), replace_all: bool("all occurrences") }, ["old_string", "new_string"]), "Multiple edits applied in order"),
    }, ["path"]),
    async handler(a, ctx) {
        const abs = guard(ctx, a.path, true);
        if (!existsSync(abs))
            return `error: file not found: ${abs} (use write_file to create it)`;
        const edits = Array.isArray(a.edits) && a.edits.length ? a.edits : [{ old_string: a.old_string, new_string: a.new_string ?? "", replace_all: a.replace_all }];
        let text = readFileSync(abs, "utf8");
        const notes = [];
        for (const [i, e] of edits.entries()) {
            try {
                const r = applyEdit(text, String(e.old_string ?? ""), String(e.new_string ?? ""), !!e.replace_all);
                text = r.text;
                notes.push(`edit ${i + 1}: ${r.count} replacement(s)${r.fuzzy ? " (whitespace-tolerant match)" : ""}`);
            }
            catch (err) {
                const hint = /not found/.test(err.message) ? closestBlock(text, String(e.old_string ?? "")) : "";
                return `error in edit ${i + 1}: ${err.message}. No changes were written.${hint}`;
            }
        }
        const bad = placeholderError(readFileSync(abs, "utf8"), text);
        if (bad)
            return `error: ${bad} No changes were written.`;
        ctx.rt.checkpoints.take(ctx.cwd, `before patch ${relative(ctx.cwd, abs)}`, abs);
        writeFileSync(abs, text);
        return `Patched ${relative(ctx.cwd, abs) || abs}: ${notes.join("; ")}`;
    },
};
let rgAvailable = null;
async function hasRg() {
    if (rgAvailable === null) {
        try {
            await execFileP("rg", ["--version"]);
            rgAvailable = true;
        }
        catch {
            rgAvailable = false;
        }
    }
    return rgAvailable;
}
function globToRe(g) {
    const re = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "§§").replace(/\*/g, "[^/\\\\]*").replace(/\?/g, ".").replace(/§§/g, ".*");
    return new RegExp(`(^|[/\\\\])${re}$`, "i");
}
function walk(root, onFile, max = 200_000) {
    let n = 0;
    const stack = [root];
    while (stack.length) {
        const d = stack.pop();
        let entries = [];
        try {
            entries = readdirSync(d, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const e of entries) {
            if (e.name.startsWith(".") && e.name !== "." && SKIP_DIRS.has(e.name))
                continue;
            const p = join(d, e.name);
            if (e.isDirectory()) {
                if (!SKIP_DIRS.has(e.name))
                    stack.push(p);
            }
            else if (e.isFile()) {
                if (onFile(p) === false || ++n > max)
                    return;
            }
        }
    }
}
export const searchFilesTool = {
    name: "search_files", toolset: "files", tier: "slm", parallelSafe: true,
    description: "Search file contents with a regex (mode=content), or find files by name glob (mode=files). Skips node_modules/.git/build dirs. Uses ripgrep when installed.",
    parameters: obj({
        pattern: str("Regex for content search, or glob like '*.py' for mode=files"),
        path: str("Directory or file to search (default cwd)"),
        glob: str("Only search files matching this glob, e.g. '*.ts'"),
        mode: enm(["content", "files", "count"], "content (default) | files | count"),
        case_insensitive: bool("Ignore case"),
        max_results: int("Max results (default 100)"),
    }, ["pattern"]),
    async handler(a, ctx) {
        const root = guard(ctx, a.path || ".", false);
        const max = Math.min(Number(a.max_results) || 100, 1000);
        const mode = a.mode ?? "content";
        if (mode === "files") {
            const re = globToRe(a.pattern.includes("*") || a.pattern.includes("?") ? a.pattern : `*${a.pattern}*`);
            const out = [];
            walk(root, (p) => { if (re.test(p))
                out.push(relative(ctx.cwd, p)); return out.length < max; });
            return out.length ? out.join("\n") : "no matching files";
        }
        if (await hasRg()) {
            const args = ["--no-heading", "--line-number", "--color", "never", "--max-columns", "300", "--max-columns-preview"];
            if (a.case_insensitive)
                args.push("-i");
            if (a.glob)
                args.push("--glob", a.glob);
            if (mode === "count")
                args.push("--count");
            args.push("-e", a.pattern, root);
            try {
                const { stdout } = await execFileP("rg", args, { maxBuffer: 32 * 1024 * 1024, cwd: ctx.cwd });
                const lines = stdout.split("\n").filter(Boolean).map((l) => l.startsWith(root) ? relative(ctx.cwd, l.slice(0, l.indexOf(":", root.length))) + l.slice(l.indexOf(":", root.length)) : l);
                return lines.slice(0, max).join("\n") + (lines.length > max ? `\n… ${lines.length - max} more matches` : "");
            }
            catch (e) {
                if (e.code === 1)
                    return "no matches";
                if (e.code === 2 && e.stderr)
                    return `search error: ${String(e.stderr).slice(0, 300)}`;
            }
        }
        let re;
        try {
            re = new RegExp(a.pattern, a.case_insensitive ? "i" : "");
        }
        catch (e) {
            return `invalid regex: ${e.message}`;
        }
        const gre = a.glob ? globToRe(a.glob) : null;
        const out = [];
        const counts = [];
        walk(statSync(root).isFile() ? root : root, (p) => {
            if (gre && !gre.test(p))
                return;
            let buf;
            try {
                const st = statSync(p);
                if (st.size > 5_000_000)
                    return;
                buf = readFileSync(p);
            }
            catch {
                return;
            }
            if (isBinary(buf))
                return;
            const lines = buf.toString("utf8").split(/\r?\n/);
            let c = 0;
            for (let i = 0; i < lines.length; i++) {
                if (re.test(lines[i])) {
                    c++;
                    if (mode === "content")
                        out.push(`${relative(ctx.cwd, p)}:${i + 1}:${lines[i].slice(0, 300)}`);
                }
                if (out.length >= max)
                    return false;
            }
            if (mode === "count" && c)
                counts.push(`${relative(ctx.cwd, p)}:${c}`);
        });
        const res = mode === "count" ? counts : out;
        return res.length ? res.join("\n") : "no matches";
    },
};
export const listDirTool = {
    name: "list_dir", toolset: "files", tier: "standard", parallelSafe: true,
    description: "List a directory as a tree (default depth 2), skipping node_modules/.git/build folders.",
    parameters: obj({ path: str("Directory (default cwd)"), depth: int("Depth 1-4 (default 2)") }),
    async handler(a, ctx) {
        const root = guard(ctx, a.path || ".", false);
        if (!existsSync(root))
            return `error: not found: ${root}`;
        const depth = Math.min(Math.max(Number(a.depth) || 2, 1), 4);
        const out = [root];
        let count = 0;
        const rec = (d, lvl, prefix) => {
            let entries = [];
            try {
                entries = readdirSync(d, { withFileTypes: true }).sort((x, y) => Number(y.isDirectory()) - Number(x.isDirectory()) || x.name.localeCompare(y.name));
            }
            catch {
                return;
            }
            for (const e of entries) {
                if (++count > 400) {
                    out.push(`${prefix}… (truncated)`);
                    return;
                }
                if (e.isDirectory()) {
                    out.push(`${prefix}${e.name}/${SKIP_DIRS.has(e.name) ? " (skipped)" : ""}`);
                    if (!SKIP_DIRS.has(e.name) && lvl < depth)
                        rec(join(d, e.name), lvl + 1, prefix + "  ");
                }
                else {
                    let size = "";
                    try {
                        const s = statSync(join(d, e.name)).size;
                        size = s > 1024 ? ` (${(s / 1024).toFixed(0)} KB)` : ` (${s} B)`;
                    }
                    catch { /* ignore */ }
                    out.push(`${prefix}${e.name}${size}`);
                }
            }
        };
        rec(root, 1, "  ");
        return out.join("\n");
    },
};

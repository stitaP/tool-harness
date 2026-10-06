/**
 * @-references in user messages:
 *   @file:path  @file:path:10-40  @folder:path  @diff  @staged  @url:https://…
 * Expanded inline (appended as context blocks); images become vision inputs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { resolvePath } from "../safety/paths.js";
import { extractUrl } from "../tools/web.js";
const REF_RE = /(^|\s)@(file|folder|url|diff|staged)(?::(\S+))?/g;
const IMG = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
const TREE_SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".output", "coverage", ".venv", "venv", "__pycache__", ".cache", "target", ".turbo"]);
/** A folder as an indented tree with sizes, so the agent knows what is there and reads files when it needs them. */
export function folderTree(root, maxEntries = 400, maxDepth = 4) {
    let files = 0, bytes = 0, shown = 0;
    const lines = [];
    const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
    const walk = (dir, depth) => {
        let entries = [];
        try {
            entries = readdirSync(dir).sort();
        }
        catch {
            return;
        }
        for (const name of entries) {
            if (name.startsWith(".") && name !== ".env.example")
                continue;
            const full = `${dir}/${name}`;
            let st;
            try {
                st = statSync(full);
            }
            catch {
                continue;
            }
            if (st.isDirectory()) {
                if (TREE_SKIP.has(name)) {
                    if (shown < maxEntries) {
                        lines.push(`${"  ".repeat(depth)}${name}/ (skipped)`);
                        shown++;
                    }
                    continue;
                }
                if (shown < maxEntries) {
                    lines.push(`${"  ".repeat(depth)}${name}/`);
                    shown++;
                }
                if (depth + 1 < maxDepth)
                    walk(full, depth + 1);
            }
            else {
                files++;
                bytes += st.size;
                if (shown < maxEntries) {
                    lines.push(`${"  ".repeat(depth)}${name}  ${size(st.size)}`);
                    shown++;
                }
            }
        }
    };
    walk(root, 0);
    return { text: lines.join("\n"), files, bytes, shown };
}
export async function expandReferences(rt, text, cwd) {
    const blocks = [];
    const images = [];
    const matches = [...text.matchAll(REF_RE)];
    // everything referenced in one message shares about a third of the model's context (~3.5 characters per token)
    let budget = Math.max(8000, Math.round((rt.providerFor("").contextWindow || rt.cfg.data.model.context_window || 32768) * 0.33 * 3.5));
    const take = (body, what) => {
        if (body.length <= budget) {
            budget -= body.length;
            return body;
        }
        const part = body.slice(0, Math.max(0, budget));
        budget = 0;
        return `${part}\n…[${what} cut here: the referenced files are larger than fits in the context — read the rest with read_file offset/limit]`;
    };
    for (const m of matches.slice(0, 10)) {
        const kind = m[2], arg = m[3] ?? "";
        try {
            if (kind === "file") {
                const [p, range] = arg.split(/:(?=\d+(-\d+)?$)/);
                const abs = resolvePath(cwd, p);
                if (!existsSync(abs)) {
                    blocks.push(`[@file:${arg}: not found]`);
                    continue;
                }
                const mime = IMG[extname(abs).toLowerCase()];
                if (mime) {
                    images.push(`data:${mime};base64,${readFileSync(abs).toString("base64")}`);
                    blocks.push(`[attached image ${relative(cwd, abs)}]`);
                    continue;
                }
                let lines = readFileSync(abs, "utf8").split(/\r?\n/);
                let label = relative(cwd, abs);
                if (range) {
                    const [a, b] = range.split("-").map(Number);
                    lines = lines.slice(a - 1, b || a);
                    label += `:${range}`;
                }
                const body = lines.join("\n");
                blocks.push(`<file path="${label}" lines="${lines.length}">\n${take(body, label)}\n</file>`);
            }
            else if (kind === "folder") {
                const abs = resolvePath(cwd, arg || ".");
                const tree = folderTree(abs);
                const head = `${tree.files} files, ${(tree.bytes / 1048576).toFixed(1)} MB${tree.shown >= 400 ? " (first 400 entries shown)" : ""} — contents are not pasted; read files with read_file and find things with search_files`;
                blocks.push(`<folder path="${relative(cwd, abs) || "."}" summary="${head}">\n${take(tree.text, "folder listing")}\n</folder>`);
            }
            else if (kind === "diff" || kind === "staged") {
                const args = kind === "staged" ? ["diff", "--cached"] : ["diff"];
                const d = execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
                blocks.push(`<git-${kind}>\n${d ? take(d, "diff") : "(no changes)"}\n</git-${kind}>`);
            }
            else if (kind === "url") {
                blocks.push(`<url href="${arg}">\n${await extractUrl(rt, arg, 20000)}\n</url>`);
            }
        }
        catch (e) {
            blocks.push(`[@${kind}${arg ? ":" + arg : ""}: ${e.message}]`);
        }
    }
    return { text: blocks.length ? `${text}\n\n--- referenced context ---\n${blocks.join("\n\n")}` : text, images };
}
/**
 * A message that is nothing but the path of an existing file ("/Users/me/plan/phase-01.md") is an unclear request for a
 * small model: say what is meant. Returns the text unchanged otherwise.
 */
export function barePathHint(text, cwd) {
    const t = text.trim();
    if (!t || /\s/.test(t))
        return text;
    const p = t.replace(/^~(?=\/|$)/, homedir());
    const abs = isAbsolute(p) ? p : resolve(cwd, p);
    try {
        if (!statSync(abs).isFile())
            return text;
    }
    catch {
        return text;
    }
    return `${t}\n\n(The message is just this file's path: read ${abs} and carry out what it asks.)`;
}

/**
 * code_search: a ranked, symbol-aware index of the working folder, built with no model and no dependencies.
 * With a 16K-127K token window the agent cannot read its way around a repo; this answers "where is X handled?"
 * with a few path:line hits (BM25 over ~40-line chunks, boosted by path and symbol-name matches) instead of
 * whole files. The index lives in memory, per folder, and re-reads only files whose size or mtime changed.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { obj, str, int, enm } from "./types.js";
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".rb", ".php",
    ".sh", ".bash", ".zsh", ".sql", ".html", ".css", ".scss", ".vue", ".svelte", ".json", ".yaml", ".yml", ".toml", ".md", ".txt", ".lua", ".dart", ".scala", ".ex", ".exs"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "out", "target", "coverage", ".next", ".venv", "venv", "__pycache__", ".cache", "vendor", "Pods", ".idea", ".gradle"]);
const MAX_FILES = 8000, MAX_BYTES = 400_000, CHUNK = 40, STEP = 30;
const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "are", "was", "not", "but", "you", "all", "can", "has", "have", "use", "used", "does", "how", "what", "where", "when", "which", "into"]);
export function tokenize(s) {
    const out = [];
    for (const w of s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[^A-Za-z0-9]+/)) {
        const t = w.toLowerCase();
        if (t.length >= 2 && !STOP.has(t))
            out.push(t);
    }
    return out;
}
// definition patterns: [regex with the name in group 1, kind]
const DEFS = [
    [/^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, "class"],
    [/^\s*(?:export\s+)?(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)/, "interface"],
    [/^\s*(?:export\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/, "type"],
    [/^\s*(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/, "enum"],
    [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, "function"],
    [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/, "function"],
    [/^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*[:=]/, "const"],
    [/^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|override\s+|get\s+|set\s+)+([A-Za-z_$][\w$]*)\s*\(/, "method"],
    [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, "function"],
    [/^\s*class\s+([A-Za-z_]\w*)/, "class"],
    [/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, "function"],
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/, "function"],
    [/^\s*(?:pub\s+)?(?:struct|enum|trait|impl)\s+([A-Za-z_]\w*)/, "type"],
    [/^\s*(?:public|private|protected|internal|open|final|static|\s)*(?:class|struct|protocol|extension|object)\s+([A-Za-z_]\w*)/, "class"],
    [/^\s*(?:public|private|protected|internal|static|final|\s)*(?:[\w<>\[\],?]+\s+)+([a-z_]\w*)\s*\([^;]*\)\s*(?:throws[^{]*)?\{\s*$/, "method"],
    [/^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{/, "function"],
    [/^#{1,3}\s+(.+?)\s*#*$/, "heading"],
];
const NOT_NAMES = new Set(["if", "for", "while", "switch", "catch", "return", "else", "function", "constructor", "new", "await", "typeof"]);
export function extractSymbols(path, text) {
    const ext = extname(path);
    const out = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length && out.length < 400; i++) {
        const ln = lines[i];
        if (ln.length > 300)
            continue;
        for (const [re, kind] of DEFS) {
            if (kind === "heading" && ext !== ".md")
                continue;
            if (ext === ".md" && kind !== "heading")
                continue;
            const m = re.exec(ln);
            if (m && m[1] && !NOT_NAMES.has(m[1])) {
                out.push({ name: m[1], kind, line: i + 1 });
                break;
            }
        }
    }
    return out;
}
function listFiles(root) {
    let files = [];
    try {
        const o = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
        files = o.split("\0").filter(Boolean);
    }
    catch {
        const walk = (dir, depth) => {
            if (depth > 12 || files.length > MAX_FILES * 2)
                return;
            let ents;
            try {
                ents = readdirSync(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const e of ents) {
                if (e.name.startsWith(".") && e.name !== ".github")
                    continue;
                const full = join(dir, e.name);
                if (e.isDirectory()) {
                    if (!SKIP_DIR.has(e.name))
                        walk(full, depth + 1);
                }
                else if (e.isFile())
                    files.push(relative(root, full));
            }
        };
        walk(root, 0);
    }
    files = files.filter((f) => TEXT_EXT.has(extname(f).toLowerCase()) && !f.split(/[\\/]/).some((p) => SKIP_DIR.has(p)));
    return { files: files.slice(0, MAX_FILES), truncated: files.length > MAX_FILES };
}
function indexFile(root, rel, st) {
    let text;
    try {
        text = readFileSync(join(root, rel), "utf8");
    }
    catch {
        return null;
    }
    if (text.includes("\0"))
        return null;
    const lines = text.split("\n");
    const chunks = [];
    for (let s = 0; s < lines.length; s += STEP) {
        const e = Math.min(lines.length, s + CHUNK);
        const tf = new Map();
        let len = 0;
        for (let i = s; i < e; i++)
            for (const t of tokenize(lines[i].slice(0, 400))) {
                tf.set(t, (tf.get(t) ?? 0) + 1);
                len++;
            }
        if (len)
            chunks.push({ start: s + 1, end: e, tf, len });
        if (e >= lines.length)
            break;
    }
    return { path: rel, mtime: st.mtimeMs, size: st.size, symbols: extractSymbols(rel, text), chunks, pathTokens: new Set(tokenize(rel)) };
}
const cache = new Map();
/** Build or incrementally refresh the index for `root`. */
export function buildIndex(root, force = false) {
    root = resolve(root);
    let idx = force ? undefined : cache.get(root);
    const { files, truncated } = listFiles(root);
    const next = new Map();
    for (const rel of files) {
        let st;
        try {
            st = statSync(join(root, rel));
        }
        catch {
            continue;
        }
        if (!st.isFile() || st.size > MAX_BYTES)
            continue;
        const old = idx?.files.get(rel);
        if (old && old.mtime === st.mtimeMs && old.size === st.size) {
            next.set(rel, old);
            continue;
        }
        const e = indexFile(root, rel, st);
        if (e)
            next.set(rel, e);
    }
    idx = { root, files: next, truncated, builtAt: Date.now() };
    cache.set(root, idx);
    return idx;
}
export function search(idx, query, limit = 8) {
    const q = [...new Set(tokenize(query))];
    if (!q.length)
        return [];
    const df = new Map();
    let n = 0, totalLen = 0;
    for (const f of idx.files.values())
        for (const c of f.chunks) {
            n++;
            totalLen += c.len;
            for (const t of q)
                if (c.tf.has(t))
                    df.set(t, (df.get(t) ?? 0) + 1);
        }
    if (!n)
        return [];
    const avg = totalLen / n, k1 = 1.4, b = 0.75;
    const idf = (t) => Math.log(1 + (n - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
    const hits = [];
    for (const f of idx.files.values()) {
        const pathBoost = q.reduce((s, t) => s + (f.pathTokens.has(t) ? 1.5 : 0), 0);
        for (const c of f.chunks) {
            let s = 0;
            for (const t of q) {
                const tf = c.tf.get(t);
                if (tf)
                    s += idf(t) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * c.len / avg));
            }
            const syms = f.symbols.filter((y) => y.line >= c.start && y.line <= c.end);
            for (const y of syms) {
                const yt = new Set(tokenize(y.name));
                const m = q.filter((t) => yt.has(t)).length;
                if (m)
                    s += 3 * m * (m === yt.size ? 2 : 1);
            }
            if (s > 0)
                hits.push({ path: f.path, start: c.start, end: c.end, score: s + pathBoost, symbols: syms });
        }
    }
    hits.sort((a, b) => b.score - a.score);
    // overlapping chunks of one file collapse into the best one
    const out = [];
    for (const h of hits) {
        if (out.some((o) => o.path === h.path && h.start <= o.end && h.end >= o.start))
            continue;
        out.push(h);
        if (out.length >= limit)
            break;
    }
    return out;
}
export function findSymbols(idx, query, limit = 25) {
    const q = query.trim().toLowerCase();
    const qt = tokenize(query);
    const out = [];
    for (const f of idx.files.values())
        for (const sym of f.symbols) {
            const n = sym.name.toLowerCase();
            let rank = 0;
            if (n === q)
                rank = 100;
            else if (n.startsWith(q))
                rank = 60;
            else if (n.includes(q))
                rank = 40;
            else {
                const st = new Set(tokenize(sym.name));
                const m = qt.filter((t) => st.has(t)).length;
                if (m && m === qt.length)
                    rank = 30;
            }
            if (rank)
                out.push({ path: f.path, sym, rank: rank - (sym.kind === "method" ? 1 : 0) });
        }
    return out.sort((a, b) => b.rank - a.rank || a.path.localeCompare(b.path)).slice(0, limit);
}
function snippet(root, h, lines = 6) {
    let text;
    try {
        text = readFileSync(join(root, h.path), "utf8").split("\n");
    }
    catch {
        return "";
    }
    const first = h.symbols[0]?.line ?? h.start;
    return text.slice(first - 1, first - 1 + lines).map((l, i) => `   ${String(first + i).padStart(4)}│ ${l.slice(0, 160)}`).join("\n");
}
export const codeSearchTool = {
    name: "code_search", toolset: "files", tier: "slm",
    description: "Find code by meaning-ish keywords in the working folder, ranked, with path:line. Cheaper than reading files: use it first to locate where something is defined or handled. " +
        "Actions: search (query: words like \"retry backoff http\") · symbols (query: a function/class name or part of one) · outline (path: every definition in a file) · refresh (rebuild the index).",
    parameters: obj({
        action: enm(["search", "symbols", "outline", "refresh"], "Default: search"),
        query: str("Keywords (search) or a name (symbols)"),
        path: str("File for outline"),
        limit: int("Max results (default 8 for search, 25 for symbols)"),
    }, []),
    async handler(a, ctx) {
        const act = String(a.action ?? (a.path && !a.query ? "outline" : "search"));
        const idx = buildIndex(ctx.cwd, act === "refresh");
        const stats = `${idx.files.size} files${idx.truncated ? " (index capped; narrow the working folder)" : ""}`;
        if (act === "refresh")
            return `index rebuilt: ${stats}`;
        if (act === "outline") {
            const rel = relative(idx.root, resolve(ctx.cwd, String(a.path ?? "")));
            const f = idx.files.get(rel.split(sep).join("/")) ?? idx.files.get(rel);
            if (!f)
                return `error: ${a.path} is not in the index (${stats})`;
            return f.symbols.length ? f.symbols.map((s) => `${String(s.line).padStart(5)}  ${s.kind.padEnd(9)} ${s.name}`).join("\n") : "(no definitions found; read the file)";
        }
        const query = String(a.query ?? "").trim();
        if (!query)
            return "error: give a query";
        if (act === "symbols") {
            const r = findSymbols(idx, query, Math.min(Number(a.limit) || 25, 80));
            return r.length ? r.map((x) => `${x.path}:${x.sym.line}  ${x.sym.kind} ${x.sym.name}`).join("\n") : `no symbol matching "${query}" (${stats}); try action:"search"`;
        }
        const hits = search(idx, query, Math.min(Number(a.limit) || 8, 30));
        if (!hits.length)
            return `no matches for "${query}" (${stats})`;
        return hits.map((h) => `${h.path}:${h.start}-${h.end}${h.symbols.length ? `  [${h.symbols.slice(0, 3).map((s) => `${s.kind} ${s.name}`).join(", ")}]` : ""}\n${snippet(idx.root, h)}`).join("\n\n");
    },
};

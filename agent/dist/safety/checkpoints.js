/**
 * Working-directory checkpoints in a shadow git repository (never touches the
 * user's own .git). Taken automatically before file writes and mutating shell
 * commands; restored with /rollback. Falls back to per-file backups when git
 * is unavailable.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, realpathSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, relative, sep } from "node:path";
import { sha1 } from "../util/misc.js";
import { log } from "../util/log.js";
const EXCLUDES = ["node_modules/", ".git/", "dist/", "build/", ".venv/", "venv/", "__pycache__/", "*.pyc", ".next/", "target/", ".cache/", "*.log", ".DS_Store",
    // model weights, archives, media, databases: big, binary, and not what an agent edits
    "*.gguf", "*.safetensors", "*.bin", "*.pt", "*.pth", "*.ckpt", "*.onnx", "*.npy", "*.npz", "*.h5",
    "*.zip", "*.tar", "*.gz", "*.tgz", "*.xz", "*.7z", "*.dmg", "*.iso", "*.mp4", "*.mov", "*.mkv", "*.wav",
    "*.db", "*.db-wal", "*.db-shm", "*.sqlite", "*.sqlite3"];
const SKIP_DIRS = ["node_modules", ".git", ".venv", "venv", "target", "dist", "build", "__pycache__", ".next", ".cache"];
/** Files larger than this are never snapshotted (they would be copied into the shadow repo on every write). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** A working tree whose snapshot-able files exceed this is too big for whole-tree checkpoints (per-file backups instead). */
const MAX_TREE_BYTES = 1024 * 1024 * 1024;
const gitignoreEscape = (p) => p.replace(/[\\*?[\]!#]/g, "\\$&").replace(/^ | $/g, "\\ ");
let gitOk = null;
function hasGit() {
    if (gitOk === null) {
        try {
            execFileSync("git", ["--version"], { stdio: "ignore" });
            gitOk = true;
        }
        catch {
            gitOk = false;
        }
    }
    return gitOk;
}
export class Checkpoints {
    home;
    enabled;
    maxFiles;
    constructor(home, enabled, maxFiles = 20000) {
        this.home = home;
        this.enabled = enabled;
        this.maxFiles = maxFiles;
    }
    /** One store per folder, however it is spelled (macOS reports /var/… as /private/var/…). */
    repoFor(cwd) {
        let p = resolve(cwd);
        try {
            p = realpathSync(p);
        }
        catch { /* not there (yet): the plain path */ }
        return join(this.home, "checkpoints", sha1(p).slice(0, 16));
    }
    unsafeRoot(cwd) {
        const r = resolve(cwd);
        return r === resolve(homedir()) || r === sep || /^[A-Za-z]:\\?$/.test(r);
    }
    git(cwd, args, input) {
        const gd = this.repoFor(cwd);
        return execFileSync("git", ["--git-dir", gd, "--work-tree", resolve(cwd), ...args], {
            cwd, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, GIT_AUTHOR_NAME: "stitap", GIT_AUTHOR_EMAIL: "stitap@localhost", GIT_COMMITTER_NAME: "stitap", GIT_COMMITTER_EMAIL: "stitap@localhost" },
        });
    }
    /** Walk the tree once: file count, bytes of snapshot-able files, and files too big to snapshot (relative paths). */
    scan(dir, limit, skip = []) {
        const r = { files: 0, bytes: 0, big: [] };
        const excludedExt = new RegExp(`(${EXCLUDES.filter((x) => x.startsWith("*.")).map((x) => x.slice(1).replace(/\./g, "\\.")).join("|")})$`, "i");
        const walk = (d) => {
            if (r.files > limit)
                return;
            let entries = [];
            try {
                entries = readdirSync(d, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const e of entries) {
                if (SKIP_DIRS.includes(e.name))
                    continue;
                const full = join(d, e.name);
                if (e.isDirectory()) {
                    if (!skip.includes(full))
                        walk(full);
                    continue;
                }
                if (!e.isFile())
                    continue;
                r.files++;
                if (r.files > limit)
                    return;
                if (excludedExt.test(e.name))
                    continue;
                let size = 0;
                try {
                    size = statSync(full).size;
                }
                catch {
                    continue;
                }
                if (size > MAX_FILE_BYTES)
                    r.big.push(relative(dir, full).split(sep).join("/"));
                else
                    r.bytes += size;
            }
        };
        walk(dir);
        return r;
    }
    /** Snapshot cwd. Returns checkpoint id or null when skipped. */
    take(cwd, message, fileHint) {
        if (!this.enabled())
            return null;
        try {
            if (!hasGit() || this.unsafeRoot(cwd))
                return fileHint ? this.backupFile(fileHint) : null;
            const gd = this.repoFor(cwd);
            // the harness's own home (with these checkpoints) may live inside the working tree: never snapshot it
            const home = resolve(this.home), inside = relative(resolve(cwd), home);
            const homeRel = inside && !inside.startsWith("..") && !isAbsolute(inside) ? inside.split(sep).join("/") : null;
            const tree = this.scan(resolve(cwd), this.maxFiles, homeRel ? [home] : []);
            if (tree.files > this.maxFiles || tree.bytes > MAX_TREE_BYTES)
                return fileHint ? this.backupFile(fileHint) : null;
            if (!existsSync(gd)) {
                mkdirSync(gd, { recursive: true });
                execFileSync("git", ["init", "--bare", "-q", gd], { stdio: "ignore" });
                writeFileSync(join(gd, "stitap-workdir"), resolve(cwd));
            }
            // rewritten every time: large files come and go
            mkdirSync(join(gd, "info"), { recursive: true });
            writeFileSync(join(gd, "info", "exclude"), [...EXCLUDES, ...(homeRel ? [`/${gitignoreEscape(homeRel)}/`] : []), ...tree.big.map((p) => "/" + gitignoreEscape(p))].join("\n") + "\n");
            this.git(cwd, ["add", "-A", "."]);
            this.git(cwd, ["commit", "-q", "--allow-empty", "--no-verify", "-m", message.slice(0, 200)]);
            return this.git(cwd, ["rev-parse", "--short", "HEAD"]).trim();
        }
        catch (e) {
            log.warn(`checkpoint failed: ${e.message?.slice(0, 200)}`);
            return fileHint ? this.backupFile(fileHint) : null;
        }
    }
    backupFile(path) {
        if (!existsSync(path))
            return null;
        const st = statSync(path);
        if (st.isDirectory() || st.size > MAX_FILE_BYTES)
            return null;
        const id = `file-${Date.now()}`;
        const dest = join(this.home, "checkpoints", "files", id, sha1(resolve(path)).slice(0, 12));
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(path, dest);
        writeFileSync(dest + ".path", resolve(path));
        return id;
    }
    list(cwd, limit = 20) {
        if (!hasGit() || !existsSync(this.repoFor(cwd)))
            return [];
        try {
            return this.git(cwd, ["log", `-${limit}`, "--format=%h%x09%ct%x09%s"]).trim().split("\n").filter(Boolean).map((l) => {
                const [id, t, ...m] = l.split("\t");
                return { id, time: Number(t) * 1000, message: m.join("\t") };
            });
        }
        catch {
            return [];
        }
    }
    diff(cwd, id) {
        if (!hasGit() || !existsSync(this.repoFor(cwd)))
            return "(no checkpoints for this directory)";
        try {
            this.git(cwd, ["add", "-A", "."]);
            return this.git(cwd, ["diff", "--stat", "--patch", "--cached", id ?? "HEAD"]) || "(no changes since checkpoint)";
        }
        catch (e) {
            return `diff failed: ${e.message}`;
        }
    }
    /** Versions of one file (newest first): each checkpoint where its content differs from the previous one. */
    fileVersions(cwd, rel, limit = 15) {
        if (!hasGit() || !existsSync(this.repoFor(cwd)))
            return [];
        try {
            const out = this.git(cwd, ["log", `-${limit}`, "--format=%h%x09%ct%x09%s", "--", rel]).trim();
            return out.split("\n").filter(Boolean).map((l) => {
                const [id, t, ...m] = l.split("\t");
                const text = this.fileAt(cwd, id, rel);
                return { id, time: Number(t) * 1000, message: m.join("\t"), lines: text === null ? null : text.split("\n").length };
            });
        }
        catch {
            return [];
        }
    }
    /** A file's content at checkpoint `id`, or null when it did not exist then. */
    fileAt(cwd, id, rel) {
        if (!/^[0-9a-f]{4,40}$/i.test(id))
            return null;
        try {
            return this.git(cwd, ["show", `${id}:${rel.split(sep).join("/")}`]);
        }
        catch {
            return null;
        }
    }
    /** Files that lost most of their content (or were deleted) since checkpoint `id`: what a script that rewrote files did. */
    shrunkSince(cwd, id, minLines = 20, keep = 0.5) {
        if (!hasGit() || !existsSync(this.repoFor(cwd)) || !/^[0-9a-f]{4,40}$/i.test(id))
            return [];
        try {
            this.git(cwd, ["add", "-A", "."]);
            const out = [];
            for (const line of this.git(cwd, ["diff", "--cached", "--numstat", "--no-renames", id]).trim().split("\n").filter(Boolean)) {
                const [, del, path] = line.split("\t");
                if (!path || del === "-" || Number(del) < minLines * keep)
                    continue;
                const before = this.fileAt(cwd, id, path);
                if (before === null)
                    continue;
                const was = before.split("\n").length;
                const abs = join(resolve(cwd), path);
                const now = existsSync(abs) ? readFileSync(abs, "utf8").split("\n").length : 0;
                if (was >= minLines && now < was * keep)
                    out.push({ path, was, now });
            }
            return out;
        }
        catch {
            return [];
        }
    }
    /** Put these files (relative paths) back as they were at checkpoint `id`. */
    restorePaths(cwd, id, paths) {
        if (paths.length)
            this.git(cwd, ["checkout", id, "--", ...paths]);
    }
    /** Restore files to checkpoint `id` (default: latest). Safety-snapshots current state first. */
    rollback(cwd, id) {
        if (id?.startsWith("file-"))
            return this.restoreFile(id);
        if (!hasGit() || !existsSync(this.repoFor(cwd)))
            return "No checkpoints for this directory.";
        const target = id ?? this.list(cwd, 1)[0]?.id;
        if (!target)
            return "No checkpoints yet.";
        const before = this.take(cwd, `before rollback to ${target}`);
        const changed = this.git(cwd, ["diff", "--name-only", target, "HEAD"]).trim().split("\n").filter(Boolean);
        this.git(cwd, ["checkout", target, "--", "."]);
        const created = this.git(cwd, ["diff", "--name-only", "--diff-filter=A", target, "HEAD"]).trim().split("\n").filter(Boolean);
        return `Restored ${changed.length} file(s) to checkpoint ${target}. (Pre-rollback state saved as ${before}.)` +
            (created.length ? `\nFiles created after the checkpoint were left in place: ${created.slice(0, 20).join(", ")}` : "");
    }
    restoreFile(id) {
        const dir = join(this.home, "checkpoints", "files", id);
        if (!existsSync(dir))
            return `unknown checkpoint ${id}`;
        const restored = [];
        for (const f of readdirSync(dir).filter((x) => !x.endsWith(".path"))) {
            const target = readFileSync(join(dir, f + ".path"), "utf8");
            copyFileSync(join(dir, f), target);
            restored.push(relative(process.cwd(), target));
        }
        return `Restored ${restored.join(", ")}`;
    }
}

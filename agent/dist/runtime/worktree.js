/**
 * Git worktrees: a separate checkout of the same repository on its own branch, so a chat, a subagent or a kanban
 * worker can change files without touching the main checkout (or each other). They live in
 * `<repo>/.stitap-worktrees/<name>`, which is added to the repo's .git/info/exclude.
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
function git(args, cwd, timeoutMs = 60_000) {
    return new Promise((res) => execFile("git", args, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }, (err, stdout, stderr) => {
        res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout ?? ""}${stderr ?? ""}`.trim() });
    }));
}
export const safeName = (n) => n.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `wt-${Date.now().toString(36)}`;
/** The main checkout's top folder for a path inside a repo (also from inside a worktree), or null outside git. */
export async function repoRoot(cwd) {
    const common = await git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
    if (common.code !== 0 || !common.out)
        return null;
    const top = await git(["rev-parse", "--show-toplevel"], cwd);
    if (top.code !== 0)
        return null;
    // the common dir of a normal repo is <root>/.git
    const c = common.out.split("\n")[0];
    return c.endsWith("/.git") ? c.slice(0, -5) : top.out.split("\n")[0];
}
/**
 * Create (or reuse) a worktree named `name` on branch `<prefix><name>` from the current HEAD of `cwd`'s repo.
 * `cwd` inside the worktree is the same sub-folder as `cwd` inside the main checkout.
 */
export async function createWorktree(cwd, name, prefix = "stitap/") {
    const root = await repoRoot(cwd);
    if (!root)
        throw new Error(`${cwd} is not inside a git repository`);
    const top = (await git(["rev-parse", "--show-toplevel"], cwd)).out.split("\n")[0];
    // git reports real paths (macOS: /var → /private/var), so compare against the real path of cwd
    const sub = relative(top, realpathSync(resolve(cwd)));
    const n = safeName(name);
    const branch = `${prefix}${n}`;
    const path = join(root, ".stitap-worktrees", n);
    const base = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).out || "HEAD";
    if ((await git(["rev-parse", "--verify", "HEAD"], cwd)).code !== 0)
        throw new Error("the repository has no commits yet; commit once before creating a worktree");
    excludeDir(root);
    if (!existsSync(path)) {
        mkdirSync(join(root, ".stitap-worktrees"), { recursive: true });
        const exists = (await git(["rev-parse", "--verify", `refs/heads/${branch}`], root)).code === 0;
        const r = await git(exists ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, "HEAD"], top);
        if (r.code !== 0)
            throw new Error(`git worktree add failed: ${r.out}`);
    }
    return { name: n, path, branch, base, root, cwd: sub ? join(path, sub) : path };
}
function excludeDir(root) {
    try {
        const f = join(root, ".git", "info", "exclude");
        const cur = existsSync(f) ? readFileSync(f, "utf8") : "";
        if (!cur.split("\n").includes("/.stitap-worktrees/")) {
            mkdirSync(join(root, ".git", "info"), { recursive: true });
            appendFileSync(f, `${cur && !cur.endsWith("\n") ? "\n" : ""}/.stitap-worktrees/\n`);
        }
    }
    catch { /* not a plain .git folder: harmless, the folder just shows as untracked */ }
}
export async function listWorktrees(cwd) {
    const r = await git(["worktree", "list", "--porcelain"], cwd);
    if (r.code !== 0)
        return [];
    const out = [];
    let cur = null;
    for (const l of r.out.split("\n")) {
        if (l.startsWith("worktree ")) {
            cur = { path: l.slice(9), branch: "" };
            out.push(cur);
        }
        else if (l.startsWith("branch ") && cur)
            cur.branch = l.slice(7).replace(/^refs\/heads\//, "");
    }
    return out.filter((w) => w.path.includes("/.stitap-worktrees/"));
}
/** Uncommitted changes in a worktree (porcelain lines), and commits it has that `base` does not. */
export async function worktreeChanges(w) {
    const st = await git(["status", "--porcelain"], w.path);
    const ahead = await git(["rev-list", "--count", `${w.base}..${w.branch}`], w.path);
    return { dirty: st.code === 0 ? st.out.split("\n").filter(Boolean) : [], ahead: Number(ahead.out) || 0 };
}
/** Commit everything in the worktree (if anything changed). */
export async function commitAll(path, message) {
    if (!(await git(["status", "--porcelain"], path)).out)
        return false;
    await git(["add", "-A"], path);
    const r = await git(["commit", "-q", "-m", message], path);
    if (r.code !== 0)
        throw new Error(`commit failed: ${r.out}`);
    return true;
}
/** Merge the worktree's branch into the branch checked out in the main folder. Aborts and throws on a conflict. */
export async function mergeWorktree(w, message) {
    const r = await git(["merge", "--no-ff", "--no-edit", ...(message ? ["-m", message] : []), w.branch], w.root, 120_000);
    if (r.code !== 0) {
        await git(["merge", "--abort"], w.root);
        throw new Error(`merging ${w.branch} failed (the merge was aborted, nothing changed): ${r.out.slice(0, 600)}`);
    }
    return r.out;
}
/** Remove the worktree folder; also delete its branch when `deleteBranch` (only if merged, unless `force`). */
export async function removeWorktree(w, opts = {}) {
    const r = await git(["worktree", "remove", ...(opts.force ? ["--force"] : []), w.path], w.root);
    if (r.code !== 0 && existsSync(w.path))
        throw new Error(`git worktree remove failed: ${r.out}`);
    await git(["worktree", "prune"], w.root);
    if (opts.deleteBranch)
        await git(["branch", opts.force ? "-D" : "-d", w.branch], w.root);
}

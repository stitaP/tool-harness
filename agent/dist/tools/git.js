/**
 * git and github: typed tools over the git and gh CLIs. A small model does far better with `git {action: "commit"}`
 * than with free-form shell (no quoting mistakes, no `reset --hard`, compact output), and every command that changes
 * something goes through the approval prompt. No shell is involved: arguments are passed to execFile as an array.
 */
import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { obj, str, int, bool, arr, enm } from "./types.js";
const MAX_OUT = 8000;
export function run(cmd, args, cwd, signal, timeoutMs = 60_000) {
    return new Promise((res) => {
        execFile(cmd, args, { cwd, signal, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1", GIT_PAGER: "cat", PAGER: "cat", NO_COLOR: "1" } }, (err, stdout, stderr) => {
            const out = `${stdout ?? ""}${stderr && (err || !stdout) ? (stdout ? "\n" : "") + stderr : ""}`.trimEnd();
            res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: err?.code === "ENOENT" ? `${cmd} is not installed` : out });
        });
    });
}
const clip = (s, max = MAX_OUT) => s.length <= max ? s : `${s.slice(0, max)}\n… ${s.length - max} more characters (narrow it with paths, ref or limit)`;
const safeRef = (s) => /^[\w./~^@{}-][\w./~^@{}:-]*$/.test(String(s ?? "")) && !String(s).startsWith("-");
const safePaths = (p) => (Array.isArray(p) ? p : p ? [p] : []).map(String).filter((x) => x && !x.startsWith("-"));
const GIT_ACTIONS = ["status", "diff", "log", "show", "branch", "add", "commit", "checkout", "stash", "restore_file", "push", "pull"];
const MUTATING = new Set(["add", "commit", "checkout", "stash", "restore_file", "push", "pull"]);
export const gitTool = {
    name: "git", toolset: "git",
    description: "Git in the current folder. Actions: status (short, with branch) · diff (staged:true for the index; ref to compare; paths) · log (limit, paths) · show (ref) · " +
        "branch (name to create and switch to it; otherwise list) · add (paths, or all:true) · commit (message; all:true = -a) · checkout (ref) · stash (op: push|pop|list) · " +
        "restore_file (paths; discards uncommitted changes to them) · push · pull. Never forces; history is not rewritten.",
    parameters: obj({
        action: enm(GIT_ACTIONS, "What to do"),
        paths: arr(str("path"), "Files for diff/log/add/commit/restore_file"),
        message: str("Commit message (first line is the subject)"),
        ref: str("Branch, tag or commit for diff/show/checkout/log"),
        name: str("New branch name (branch action)"),
        staged: bool("diff: show staged changes"),
        all: bool("add: stage everything · commit: also stage tracked modifications"),
        limit: int("log: number of commits (default 15, max 100)"),
        op: enm(["push", "pop", "list"], "stash operation (default push)"),
        remote: str("push/pull remote (default origin)"),
    }, ["action"]),
    async handler(a, ctx) {
        const act = String(a.action);
        const g = (...args) => run("git", args, ctx.cwd, ctx.signal);
        if (!GIT_ACTIONS.includes(act))
            return `error: unknown action "${act}" (${GIT_ACTIONS.join(", ")})`;
        const inside = await g("rev-parse", "--is-inside-work-tree");
        if (inside.code !== 0)
            return `error: ${ctx.cwd} is not inside a git repository`;
        const paths = safePaths(a.paths);
        if (a.ref !== undefined && !safeRef(a.ref))
            return "error: invalid ref";
        const ask = async (what) => (MUTATING.has(act) && !(await ctx.requestApproval({ tool: "git", command: `git ${what}`, reason: `git ${act}` }))) ? `declined: git ${what}` : null;
        const fin = (r) => (r.code === 0 ? clip(r.out) || "(done)" : `error (exit ${r.code}): ${clip(r.out, 3000)}`);
        switch (act) {
            case "status": return fin(await g("status", "--short", "--branch", "--untracked-files=normal"));
            case "diff": {
                const args = ["diff", "--no-color", "--stat=100", "--patch", ...(a.staged ? ["--staged"] : []), ...(a.ref ? [String(a.ref)] : []), ...(paths.length ? ["--", ...paths] : [])];
                const r = await g(...args);
                return r.code === 0 ? clip(r.out) || "(no changes)" : fin(r);
            }
            case "log": return fin(await g("log", `-n${Math.min(Number(a.limit) || 15, 100)}`, "--date=short", "--pretty=format:%h %ad %an  %s", ...(a.ref ? [String(a.ref)] : []), ...(paths.length ? ["--", ...paths] : [])));
            case "show": return fin(await g("show", "--no-color", "--stat", "--patch", String(a.ref || "HEAD")));
            case "branch": {
                if (!a.name)
                    return fin(await g("branch", "--list", "--verbose", "--no-color"));
                if (!safeRef(a.name))
                    return "error: invalid branch name";
                const d = await ask(`switch -c ${a.name}`);
                if (d)
                    return d;
                return fin(await g("switch", "-c", String(a.name)));
            }
            case "add": {
                if (!a.all && !paths.length)
                    return "error: add needs paths or all:true";
                const d = await ask(`add ${a.all ? "-A" : paths.join(" ")}`);
                if (d)
                    return d;
                const r = await g("add", ...(a.all ? ["-A"] : ["--", ...paths]));
                return r.code ? fin(r) : fin(await g("status", "--short", "--branch"));
            }
            case "commit": {
                const msg = String(a.message ?? "").trim();
                if (!msg)
                    return "error: commit needs a message";
                const d = await ask(`commit ${a.all ? "-a " : ""}-m ${JSON.stringify(msg.split("\n")[0])}`);
                if (d)
                    return d;
                const r = await g("commit", ...(a.all ? ["-a"] : []), "-m", msg, ...(paths.length ? ["--", ...paths] : []));
                return fin(r);
            }
            case "checkout": {
                if (!a.ref)
                    return "error: checkout needs a ref";
                const d = await ask(`switch ${a.ref}`);
                if (d)
                    return d;
                return fin(await g("switch", "--", String(a.ref)).then(async (r) => r.code ? g("checkout", String(a.ref)) : r));
            }
            case "stash": {
                const op = String(a.op || "push");
                if (!["push", "pop", "list"].includes(op))
                    return "error: op must be push, pop or list";
                if (op === "list")
                    return fin(await g("stash", "list"));
                const d = await ask(`stash ${op}`);
                if (d)
                    return d;
                return fin(await g("stash", op, ...(op === "push" ? ["--include-untracked"] : [])));
            }
            case "restore_file": {
                if (!paths.length)
                    return "error: restore_file needs paths";
                const d = await ask(`restore -- ${paths.join(" ")}  (discards uncommitted changes)`);
                if (d)
                    return d;
                return fin(await g("restore", "--", ...paths));
            }
            case "push": {
                const remote = String(a.remote || "origin");
                if (!safeRef(remote))
                    return "error: invalid remote";
                const d = await ask(`push ${remote}`);
                if (d)
                    return d;
                const br = (await g("rev-parse", "--abbrev-ref", "HEAD")).out.trim();
                const hasUp = (await g("rev-parse", "--abbrev-ref", "@{upstream}")).code === 0;
                return fin(await run("git", ["push", ...(hasUp ? [] : ["-u", remote, br])], ctx.cwd, ctx.signal, 180_000));
            }
            case "pull": {
                const d = await ask("pull --ff-only");
                if (d)
                    return d;
                return fin(await run("git", ["pull", "--ff-only"], ctx.cwd, ctx.signal, 180_000));
            }
        }
        return "error: unreachable";
    },
};
const GH_ACTIONS = ["pr_list", "pr_view", "pr_diff", "pr_checks", "pr_create", "pr_comment", "issue_list", "issue_view", "issue_create", "issue_comment", "repo_view"];
const GH_MUTATING = new Set(["pr_create", "pr_comment", "issue_create", "issue_comment"]);
let ghFound = null;
export function ghAvailable() {
    ghFound ??= (process.env.PATH ?? "").split(delimiter).some((d) => { try {
        accessSync(join(d, "gh"), constants.X_OK);
        return true;
    }
    catch {
        return false;
    } });
    return ghFound;
}
export const githubTool = {
    name: "github", toolset: "git",
    description: "GitHub through the gh CLI (must be logged in: gh auth login). Actions: pr_list · pr_view (number; default: this branch's PR) · pr_diff · pr_checks (CI status) · " +
        "pr_create (title, body; base, draft) · pr_comment (number, body) · issue_list (state, label) · issue_view (number) · issue_create (title, body) · issue_comment (number, body) · repo_view.",
    parameters: obj({
        action: enm(GH_ACTIONS, "What to do"),
        number: int("PR or issue number"),
        title: str("Title for pr_create / issue_create"),
        body: str("Body or comment text"),
        base: str("pr_create: base branch (default: the repo's default)"),
        draft: bool("pr_create: open as a draft"),
        state: enm(["open", "closed", "all"], "pr_list / issue_list state (default open)"),
        label: str("issue_list: filter by label"),
        limit: int("list length (default 15, max 50)"),
    }, ["action"]),
    available: () => ghAvailable(),
    async handler(a, ctx) {
        const act = String(a.action);
        if (!GH_ACTIONS.includes(act))
            return `error: unknown action "${act}" (${GH_ACTIONS.join(", ")})`;
        const n = a.number !== undefined ? String(Math.trunc(Number(a.number))) : "";
        if (a.number !== undefined && !/^\d+$/.test(n))
            return "error: number must be a positive integer";
        const lim = String(Math.min(Number(a.limit) || 15, 50));
        const state = ["open", "closed", "all"].includes(a.state) ? a.state : "open";
        let args;
        switch (act) {
            case "pr_list":
                args = ["pr", "list", "--state", state, "--limit", lim];
                break;
            case "pr_view":
                args = ["pr", "view", ...(n ? [n] : []), "--comments"];
                break;
            case "pr_diff":
                args = ["pr", "diff", ...(n ? [n] : []), "--color", "never"];
                break;
            case "pr_checks":
                args = ["pr", "checks", ...(n ? [n] : [])];
                break;
            case "issue_list":
                args = ["issue", "list", "--state", state, "--limit", lim, ...(a.label ? ["--label", String(a.label)] : [])];
                break;
            case "issue_view":
                if (!n)
                    return "error: issue_view needs a number";
                args = ["issue", "view", n, "--comments"];
                break;
            case "repo_view":
                args = ["repo", "view"];
                break;
            case "pr_create": {
                if (!a.title)
                    return "error: pr_create needs a title";
                args = ["pr", "create", "--title", String(a.title), "--body", String(a.body ?? ""), ...(a.base ? ["--base", String(a.base)] : []), ...(a.draft ? ["--draft"] : [])];
                break;
            }
            case "issue_create":
                if (!a.title)
                    return "error: issue_create needs a title";
                args = ["issue", "create", "--title", String(a.title), "--body", String(a.body ?? "")];
                break;
            case "pr_comment":
                if (!n || !a.body)
                    return "error: pr_comment needs number and body";
                args = ["pr", "comment", n, "--body", String(a.body)];
                break;
            case "issue_comment":
                if (!n || !a.body)
                    return "error: issue_comment needs number and body";
                args = ["issue", "comment", n, "--body", String(a.body)];
                break;
            default: return "error: unreachable";
        }
        if (GH_MUTATING.has(act) && !(await ctx.requestApproval({ tool: "github", command: `gh ${args.slice(0, 2).join(" ")} ${a.title ?? n}`, reason: `publish to GitHub (${act}): visible to others` })))
            return `declined: ${act}`;
        const r = await run("gh", args, ctx.cwd, ctx.signal, 120_000);
        return r.code === 0 ? clip(r.out) || "(done)" : `error (exit ${r.code}): ${clip(r.out, 3000)}${/auth|login/i.test(r.out) ? "\nRun `gh auth login` in a terminal." : ""}`;
    },
};

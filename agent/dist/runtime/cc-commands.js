/**
 * Slash commands modelled on Claude Code's: /plan, /review, /security-review, /simplify, /init, /context, /hooks,
 * /permissions, /add-dir, /todos, /tasks, /worktree, /effort, /output-style, /statusline, /fewer-permission-prompts,
 * /release-notes, /bug, /vim, /keybindings, /terminal-setup — plus the `!cmd` (run in the shell) and `#note`
 * (save to memory) input prefixes. They join the table in commands.ts.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { estimateMessages } from "../loop/compression.js";
import { HOOK_EVENTS } from "./hooks.js";
import { isMutating } from "../safety/dangerous.js";
import { resolvePath } from "../safety/paths.js";
import { resourceRoot } from "../util/resources.js";
import { redactToolOutput } from "../util/redact.js";
import { splitArgs } from "../util/misc.js";
import { EFFORTS, effortOf, formatStatus, listOutputStyles, shellKey, statusInfo, statusLine } from "./modes.js";
import { chatDocuments, fetchDocUrl, isUrl, openOnDesktop, resolveDoc } from "./documents.js";
import { commitAll, createWorktree, listWorktrees, mergeWorktree, removeWorktree, safeName, worktreeChanges } from "./worktree.js";
const ok = (text) => ({ text });
const tk = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : "-");
function run(cmd, args, cwd, timeoutMs = 30_000) {
    return new Promise((res) => execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1" } }, (err, stdout, stderr) => {
        res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout ?? ""}${err ? stderr ?? "" : ""}`.replace(/\s+$/, "") });
    }));
}
/**
 * What to review: a PR number (gh pr diff), a git ref (changes on this branch since it), --staged, or by default the
 * uncommitted changes plus new files — falling back to the last commit when the tree is clean. Paths narrow it.
 */
export async function collectDiff(cwd, args) {
    if ((await run("git", ["rev-parse", "--is-inside-work-tree"], cwd)).code !== 0)
        return { error: `${cwd} is not a git repository, so there is no diff to review. Run it in a project folder (/cwd <path>).` };
    const paths = args.filter((a) => !a.startsWith("-") && existsSync(resolvePath(cwd, a)));
    const rest = args.filter((a) => !paths.includes(a));
    const pr = rest.find((a) => /^#?\d+$/.test(a));
    const tail = paths.length ? ["--", ...paths] : [];
    if (pr) {
        const n = pr.replace("#", "");
        const r = await run("gh", ["pr", "diff", n], cwd, 60_000);
        if (r.code !== 0)
            return { error: `gh pr diff ${n} failed: ${r.out.slice(0, 300) || "is the GitHub CLI (gh) installed and logged in?"}` };
        return { label: `pull request #${n}`, diff: r.out, files: [...r.out.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]) };
    }
    let label, diff;
    if (rest.includes("--staged") || rest.includes("--cached")) {
        label = "staged changes";
        diff = (await run("git", ["diff", "--cached", ...tail], cwd)).out;
    }
    else {
        const ref = rest.find((a) => !a.startsWith("-"));
        if (ref && (await run("git", ["rev-parse", "--verify", "-q", `${ref}^{commit}`], cwd)).code === 0) {
            label = `changes since ${ref}`;
            diff = (await run("git", ["diff", `${ref}...HEAD`, ...tail], cwd)).out;
        }
        else {
            label = "uncommitted changes";
            diff = (await run("git", ["diff", "HEAD", ...tail], cwd)).out;
            const untracked = (await run("git", ["ls-files", "--others", "--exclude-standard", ...tail], cwd)).out.split("\n").filter(Boolean);
            for (const f of untracked.slice(0, 15)) {
                try {
                    const p = join(cwd, f);
                    if (statSync(p).size > 40_000) {
                        diff += `\n--- /dev/null\n+++ b/${f}\n(new file, ${statSync(p).size} bytes — read it with read_file)\n`;
                        continue;
                    }
                    const text = readFileSync(p, "utf8");
                    if (text.includes("\u0000"))
                        continue;
                    diff += `\ndiff --git a/${f} b/${f}\nnew file\n--- /dev/null\n+++ b/${f}\n${text.split("\n").map((l) => `+${l}`).join("\n")}\n`;
                }
                catch { /* unreadable */ }
            }
            if (!diff.trim()) {
                label = "the last commit (the working tree is clean)";
                diff = (await run("git", ["show", "HEAD", "--format=commit %H%nAuthor: %an%n%n    %s%n", ...tail], cwd)).out;
            }
        }
    }
    if (!diff.trim())
        return { error: `No changes found (${label}).` };
    return { label, diff, files: [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]) };
}
function diffBlock(rt, sid, d) {
    const max = Math.max(8000, Math.min(60_000, Math.floor(rt.providerFor(sid).contextWindow * 4 * 0.35)));
    const body = d.diff.length > max ? `${d.diff.slice(0, max)}\n… [diff cut at ${max} of ${d.diff.length} characters: read the rest with git action=diff and a path, or read_file]` : d.diff;
    return `Files: ${[...new Set(d.files)].join(", ") || "(see diff)"}\n\n\`\`\`diff\n${body}\n\`\`\``;
}
const REVIEW_RULES = `Report only defects you verified by reading the code (read_file, search_files, code_search, git): wrong logic, missed edge cases, broken error handling, races, leaks, API misuse, missing awaits, regressions against callers. Skip style and naming nits.
For each finding give: severity (high / medium / low) — file:line — what goes wrong, as a concrete input or state and the wrong result — the fix in one or two lines. Most severe first. If nothing solid survives checking, say "No defects found" and name what you checked.`;
const SECURITY_RULES = `Look for vulnerabilities an attacker could actually reach: injection (SQL, shell, template, path traversal, XSS), broken authentication or authorization checks, secrets or keys in code or logs, SSRF and unchecked URLs, unsafe deserialization or eval, weak or misused crypto, missing input validation at trust boundaries, insecure defaults (CORS, debug, permissions), and risky new dependencies.
Verify each one by reading the code paths (read_file, search_files). For each finding give: severity (critical / high / medium / low) — file:line — how it is exploited (attacker input → effect) — the fix. Leave out theoretical issues with no reachable path. If none survive, say so and list what you checked.`;
async function reviewCmd(kind, a, c) {
    if (c.rt.isBusy(c.sid))
        return ok("Busy — /stop first or wait for the current turn.");
    const words = splitArgs(a);
    const cwd = c.rt.sessionCwd(c.sid);
    const d = await collectDiff(cwd, words);
    if ("error" in d)
        return ok(d.error);
    const focus = words.filter((w) => !w.startsWith("-") && !/^#?\d+$/.test(w) && !existsSync(resolvePath(cwd, w))).join(" ");
    const s = c.rt.db.getSession(c.sid);
    c.rt.db.updateSession(c.sid, { meta: { ...s.meta, read_only_turn: "review" } });
    const title = kind === "review" ? "Code review" : "Security review";
    return {
        text: `${title} of ${d.label} (${new Set(d.files).size} file(s)); this turn is read-only.`,
        send: `${title}: ${d.label} in ${cwd}. This is a read-only review: do not edit files or run commands that change anything.\n${kind === "review" ? REVIEW_RULES : SECURITY_RULES}${focus ? `\nFocus especially on: ${focus}` : ""}\n\n${diffBlock(c.rt, c.sid, d)}`,
    };
}
// ── /init ───────────────────────────────────────────────────────
const MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "setup.py", "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", "Makefile", "CMakeLists.txt", "Package.swift", "deno.json", "tsconfig.json", "docker-compose.yml", "Dockerfile", ".github/workflows"];
function projectFacts(cwd) {
    const out = [];
    let entries = [];
    try {
        entries = readdirSync(cwd).filter((e) => !e.startsWith(".") || [".github", ".env.example"].includes(e)).slice(0, 60);
    }
    catch { /* unreadable */ }
    out.push(`Top level: ${entries.map((e) => { try {
        return statSync(join(cwd, e)).isDirectory() ? `${e}/` : e;
    }
    catch {
        return e;
    } }).join(", ")}`);
    for (const m of MANIFESTS)
        if (existsSync(join(cwd, m)))
            out.push(`Has ${m}`);
    try {
        const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
        if (pkg.scripts)
            out.push(`npm scripts: ${Object.entries(pkg.scripts).map(([k, v]) => `${k} = ${v}`).join("; ").slice(0, 1500)}`);
    }
    catch { /* none */ }
    for (const r of ["README.md", "README", "readme.md"])
        if (existsSync(join(cwd, r))) {
            out.push(`${r} (start):\n${readFileSync(join(cwd, r), "utf8").slice(0, 1500)}`);
            break;
        }
    return out.join("\n");
}
async function initCmd(a, c) {
    if (c.rt.isBusy(c.sid))
        return ok("Busy — /stop first or wait for the current turn.");
    const cwd = c.rt.sessionCwd(c.sid);
    const existing = ["AGENTS.md", "CLAUDE.md", ".stitap.md"].filter((f) => existsSync(join(cwd, f)));
    const target = existing[0] ?? "AGENTS.md";
    const prompt = `${existing.length ? `Improve the existing ${target} in ${cwd}` : `Create ${target} in ${cwd}`}: the instructions file every future chat in this project reads first.
Explore the project before writing (list_dir, read_file of manifests, build files, CI config, a few central source files, existing docs, .cursorrules or .github/copilot-instructions.md if present). Then write a short, specific file (aim for 40-120 lines) with:
- What the project is, in two or three sentences.
- The exact commands to install, build, run, lint and test — including how to run a single test. Check them in the manifests; run a cheap one (e.g. the test listing) to confirm when you can.
- The architecture: the main folders and modules, and how a request or data flows through them.
- Conventions a newcomer would get wrong: code style that differs from the defaults, naming, error handling, where tests live, generated files not to edit.
Do not include generic advice ("write clean code", "add tests"), secrets, or lists of every file. ${existing.length ? "Keep what is still correct, fix what is outdated, and keep the user's own notes." : ""}${a.trim() ? `\nThe user adds: ${a.trim()}` : ""}

What the harness found:
${projectFacts(cwd)}`;
    return { text: `${existing.length ? "Updating" : "Writing"} ${join(cwd, target)}…`, send: prompt };
}
// ── /context ────────────────────────────────────────────────────
export function contextReport(rt, sid) {
    const s = rt.ensureSystemPrompt(sid);
    const p = rt.providerFor(sid);
    const window = p.contextWindow;
    const sys = s.system_prompt ?? "";
    const sections = sys.split(/\n\n(?=## )/).map((x, i) => ({ name: i === 0 ? "Identity" : x.slice(3, x.indexOf("\n") > 0 ? x.indexOf("\n") : 60).trim(), tokens: Math.ceil(x.length / 4) }));
    const sysT = Math.ceil(sys.length / 4);
    const tools = rt.activeTools(sid);
    const toolT = tools.map((t) => ({ name: t.name, tokens: Math.ceil(JSON.stringify(rt.tools.schemas([t])).length / 4) })).sort((a, b) => b.tokens - a.tokens);
    const toolsT = toolT.reduce((n, t) => n + t.tokens, 0);
    const msgs = rt.db.getMessages(sid);
    const b = { user: 0, reply: 0, calls: 0, results: 0, summaries: 0 };
    const bigResults = [];
    for (const m of msgs) {
        const n = estimateMessages([m]);
        if (m.meta?.compression_summary)
            b.summaries += n;
        else if (m.role === "user")
            b.user += n;
        else if (m.role === "tool") {
            b.results += n;
            bigResults.push({ name: m.name ?? "tool", tokens: n });
        }
        else if (m.role === "assistant") {
            const callsT = estimateMessages([{ role: "assistant", content: null, tool_calls: m.tool_calls }]);
            b.calls += m.tool_calls?.length ? callsT : 0;
            b.reply += n - (m.tool_calls?.length ? callsT : 0);
        }
    }
    const msgT = b.user + b.reply + b.calls + b.results + b.summaries;
    const total = sysT + toolsT + msgT;
    const thr = rt.cfg.data.compression.threshold;
    const width = 40, fill = (n) => Math.round((n / Math.max(window, 1)) * width);
    const bar = "▓".repeat(Math.min(width, fill(sysT))) + "▒".repeat(Math.min(width, fill(toolsT))) + "█".repeat(Math.min(width, fill(msgT)));
    const last = rt.db.usageSince(0, sid).at(-1);
    const lines = [
        `Context: ~${tk(total)} of ${tk(window)} tokens (${pct(total, window)})${rt.cfg.data.compression.enabled ? ` · compacts automatically at ${Math.round(thr * 100)}% (${tk(Math.round(window * thr))})` : " · auto-compaction is off"}`,
        `[${(bar + "░".repeat(width)).slice(0, width)}]  ▓ system  ▒ tools  █ messages  ░ free`,
        `  System prompt        ${tk(sysT).padStart(7)}  ${pct(sysT, window)}`,
        `    ${sections.filter((x) => x.tokens >= 20).sort((a, b) => b.tokens - a.tokens).slice(0, 8).map((x) => `${x.name.slice(0, 40)} ${tk(x.tokens)}`).join(" · ")}`,
        `  Tool schemas (${tools.length})${" ".repeat(Math.max(1, 6 - String(tools.length).length))}${tk(toolsT).padStart(7)}  ${pct(toolsT, window)}`,
        `    largest: ${toolT.slice(0, 6).map((t) => `${t.name} ${tk(t.tokens)}`).join(" · ") || "none"}`,
        `  Messages (${msgs.length})${" ".repeat(Math.max(1, 10 - String(msgs.length).length))}${tk(msgT).padStart(7)}  ${pct(msgT, window)}`,
        `    your messages ${tk(b.user)} · replies ${tk(b.reply)} · tool calls ${tk(b.calls)} · tool results ${tk(b.results)}${b.summaries ? ` · summaries ${tk(b.summaries)}` : ""}`,
        `  Free                 ${tk(Math.max(0, window - total)).padStart(7)}  ${pct(Math.max(0, window - total), window)}`,
    ];
    const big = bigResults.sort((a, b) => b.tokens - a.tokens).slice(0, 4).filter((x) => x.tokens > 500);
    if (big.length)
        lines.push(`Largest tool results: ${big.map((x) => `${x.name} ${tk(x.tokens)}`).join(", ")}`);
    if (last)
        lines.push(`Last model call: the server counted ${last.input_tokens.toLocaleString()} input tokens (the numbers above are estimates, characters ÷ 4).`);
    if (total > window * thr * 0.8)
        lines.push("Tip: /compact [what to keep] summarizes older messages now; /tools disable <name> --now shrinks the tool schemas.");
    return lines.join("\n");
}
// ── /todos, /tasks ──────────────────────────────────────────────
const ICON = { completed: "[x]", in_progress: "[>]", pending: "[ ]", cancelled: "[-]" };
function todosText(rt, sid) {
    const todos = rt.db.getMeta(`todo:${sid}`) ?? [];
    if (!todos.length)
        return "No todo list in this chat. The agent writes one with todo_list for multi-step work.";
    const done = todos.filter((t) => t.status === "completed" || t.status === "cancelled").length;
    const lines = [`Todo list: ${done}/${todos.length} done`];
    let phase;
    for (const t of todos) {
        if (t.phase && t.phase !== phase) {
            phase = t.phase;
            lines.push(`${phase}:`);
        }
        lines.push(`${t.phase ? "  " : ""}${ICON[t.status] ?? "[ ]"} ${t.id}. ${t.content}`);
    }
    return lines.join("\n");
}
function tasksCmd(a, c) {
    const [sub = "list", id, n] = splitArgs(a);
    const P = c.rt.processes;
    if (sub === "kill" || sub === "stop") {
        if (!id)
            return ok("Usage: /tasks kill <id>");
        return ok(P.kill(id) ? `Stopping ${id}.` : `${id} is not running (see /tasks).`);
    }
    if (sub === "log" || sub === "tail") {
        const t = id ? P.tail(id, Math.min(Number(n) || 4000, 20_000)) : null;
        return ok(t === null ? `No process ${id ?? ""}. See /tasks.` : t || "(no output yet)");
    }
    const all = sub === "all";
    const list = P.list(all ? undefined : c.sid);
    if (!list.length)
        return ok(all ? "No background processes." : "No background processes in this chat (/tasks all for every chat). The agent starts them with terminal background=true.");
    return ok([`Background processes${all ? "" : " in this chat"} — /tasks log <id>, /tasks kill <id>:`, ...list.map((p) => {
            const age = Math.round(((p.endedAt ?? Date.now()) - p.startedAt) / 1000);
            return `${p.id}  [${p.status}${p.exitCode !== null && p.exitCode !== undefined ? ` exit ${p.exitCode}` : ""}]  ${age}s  ${p.command.slice(0, 100)}${all ? `  (chat ${p.sessionId})` : ""}`;
        })].join("\n"));
}
// ── /permissions, /fewer-permission-prompts ─────────────────────
function permissionsCmd(a, c) {
    const cfg = c.rt.cfg;
    const [sub, ...rest] = splitArgs(a);
    const arg = rest.join(" ").trim();
    try {
        switch (sub) {
            case "allow": {
                if (!arg)
                    return ok('Usage: /permissions allow <command | prefix* | /regex/>   e.g. /permissions allow "git push origin *"');
                cfg.set("approvals.allow_patterns", [...new Set([...(cfg.data.approvals.allow_patterns ?? []), arg])]);
                return ok(`Allowed without asking: ${arg}`);
            }
            case "remove":
            case "unallow": {
                const cur = cfg.data.approvals.allow_patterns ?? [];
                const i = /^\d+$/.test(arg) ? Number(arg) - 1 : cur.indexOf(arg);
                if (i < 0 || i >= cur.length)
                    return ok(`No allow rule "${arg}". See /permissions.`);
                cfg.set("approvals.allow_patterns", cur.filter((_, j) => j !== i));
                return ok(`Removed allow rule: ${cur[i]}`);
            }
            case "deny": {
                if (!arg)
                    return ok("Usage: /permissions deny <tool name>   (the tool is turned off for new chats)");
                if (!c.rt.tools.get(arg))
                    return ok(`No tool named ${arg}. See /tools.`);
                cfg.set("tools.disabled", [...new Set([...cfg.data.tools.disabled, arg])]);
                c.rt.refreshSystemPrompt(c.sid);
                return ok(`Denied tool ${arg} (applied to this chat now and to new chats).`);
            }
            case "undeny": {
                cfg.set("tools.disabled", cfg.data.tools.disabled.filter((t) => t !== arg));
                c.rt.refreshSystemPrompt(c.sid);
                return ok(`Tool ${arg} is allowed again.`);
            }
            case "mode": {
                if (!["ask", "deny", "yolo"].includes(arg))
                    return ok("Usage: /permissions mode ask|deny|yolo   (ask = prompt for dangerous actions, deny = refuse them, yolo = never ask)");
                cfg.set("approvals.mode", arg);
                return ok(`Approval mode: ${arg}`);
            }
            case "block": {
                if (!arg)
                    return ok("Usage: /permissions block <path>   (file tools can neither read nor write there)");
                cfg.set("security.blocked_paths", [...new Set([...cfg.data.security.blocked_paths, arg])]);
                return ok(`Blocked path: ${arg}`);
            }
            case "protect": {
                if (!arg)
                    return ok("Usage: /permissions protect <path glob>   (file tools can read but never write there)");
                cfg.set("security.protected_paths", [...new Set([...(cfg.data.security.protected_paths ?? []), arg])]);
                return ok(`Protected (read-only for the agent): ${arg}`);
            }
            case undefined:
            case "":
            case "list": break;
            default: return ok("Usage: /permissions [allow <pattern> | remove <n> | deny <tool> | undeny <tool> | mode ask|deny|yolo | block <path> | protect <glob>]");
        }
    }
    catch (e) {
        return ok(e.message);
    }
    const allow = cfg.data.approvals.allow_patterns ?? [];
    const sess = c.rt.approvals.sessionAllowed(c.sid);
    return ok([
        `Approval mode: ${c.rt.approvals.yoloSessions.has(c.sid) ? "yolo (this chat, /yolo off to stop)" : cfg.data.approvals.mode}${cfg.isLocked("approvals.mode") ? " [locked by policy]" : ""} — dangerous commands and sensitive writes ${cfg.data.approvals.mode === "ask" ? "ask first" : cfg.data.approvals.mode === "deny" ? "are refused" : "run without asking"}`,
        `Allowed without asking (${allow.length}):${allow.length ? "\n" + allow.map((p, i) => `  ${i + 1}. ${p}`).join("\n") : " none"}`,
        `Allowed for this chat only: ${sess.length ? sess.join(", ") : "none"}`,
        `Denied tools: ${[...cfg.data.tools.disabled, ...(cfg.policy?.disable_tools ?? []).map((t) => `${t} (policy)`)].join(", ") || "none"}`,
        `Blocked paths: ${cfg.data.security.blocked_paths.join(", ") || "none"}`,
        `Protected paths: ${(cfg.data.security.protected_paths ?? []).join(", ") || "none"} (+ any .stitap-protected file)`,
        `Unattended runs (cron, kanban, pipeline): ${cfg.data.cron.approval_mode}`,
        "Change: /permissions allow <pattern> · remove <n> · deny <tool> · undeny <tool> · mode ask|deny|yolo · block <path> · protect <glob>. Suggestions from your past answers: /fewer-permission-prompts",
    ].join("\n"));
}
/** Never offered as a blanket rule, however often it was approved. */
const NEVER_BROAD = /^(sudo|rm|dd|mkfs|chmod|chown|shutdown|reboot|kill|killall|pkill|eval|curl|wget|bash|sh|zsh|python3?|node|ssh|scp|launchctl|diskutil|security)\b|--force|-f\b|push\s+.*-f|\|\s*(sh|bash)/;
export function permissionSuggestions(rt) {
    const log = rt.db.listRecords("approval_log").filter((r) => r.decision !== "deny" && r.command);
    const allow = rt.cfg.data.approvals.allow_patterns ?? [];
    const covered = (cmd) => allow.some((p) => (p.endsWith("*") ? cmd.startsWith(p.slice(0, -1)) : p === cmd));
    const exact = new Map();
    for (const r of log)
        if (!covered(r.command))
            exact.set(r.command, (exact.get(r.command) ?? 0) + 1);
    const out = [];
    const byPrefix = new Map();
    for (const cmd of exact.keys()) {
        const words = cmd.trim().split(/\s+/);
        if (words.length >= 3 && !NEVER_BROAD.test(cmd)) {
            const pre = words.slice(0, 2).join(" ") + " ";
            if (!byPrefix.has(pre))
                byPrefix.set(pre, new Set());
            byPrefix.get(pre).add(cmd);
        }
    }
    const viaPrefix = new Set();
    for (const [pre, cmds] of byPrefix)
        if (cmds.size >= 3) {
            out.push({ pattern: `${pre}*`, count: [...cmds].reduce((n, x) => n + (exact.get(x) ?? 0), 0), why: `${cmds.size} different "${pre.trim()} …" commands approved` });
            cmds.forEach((x) => viaPrefix.add(x));
        }
    for (const [cmd, n] of exact)
        if (n >= 2 && !viaPrefix.has(cmd))
            out.push({ pattern: cmd, count: n, why: `approved ${n} times` });
    return out.sort((a, b) => b.count - a.count).slice(0, 15);
}
function fewerPromptsCmd(a, c) {
    const sug = permissionSuggestions(c.rt);
    const [sub, ...pick] = splitArgs(a);
    if (sub === "apply") {
        if (!sug.length)
            return ok("Nothing to apply.");
        const idx = pick.length ? pick.flatMap((p) => p.split(",")).map((x) => Number(x) - 1).filter((i) => i >= 0 && i < sug.length) : sug.map((_, i) => i);
        const add = idx.map((i) => sug[i].pattern);
        try {
            c.rt.cfg.set("approvals.allow_patterns", [...new Set([...(c.rt.cfg.data.approvals.allow_patterns ?? []), ...add])]);
        }
        catch (e) {
            return ok(e.message);
        }
        return ok(`Added ${add.length} allow rule(s):\n${add.map((p) => `  ${p}`).join("\n")}\nUndo one with /permissions remove <n>.`);
    }
    const n = c.rt.db.listRecords("approval_log").length;
    if (!sug.length)
        return ok(`No suggestions: ${n ? `none of your ${n} recorded approval answers repeats often enough` : "no approval answers recorded yet"}. Commands you approve twice (or 3+ variants of the same two-word prefix) show up here.`);
    return ok([`From ${n} approval answers, these would have skipped the prompt (commands like rm, sudo, curl or --force are never offered as a prefix rule):`,
        ...sug.map((s, i) => `  ${i + 1}. ${s.pattern}   — ${s.why}`),
        "Add all: /fewer-permission-prompts apply   ·   some: /fewer-permission-prompts apply 1,3"].join("\n"));
}
// ── /hooks ──────────────────────────────────────────────────────
async function hooksCmd(a, c) {
    const H = c.rt.hooks;
    const args = splitArgs(a);
    const [sub, ev] = args;
    const cur = (e) => (c.rt.cfg.data.hooks?.[e] ?? []);
    const fmt = (h) => (typeof h === "string" ? h : `${h.command}${h.match ? `   [only tools matching /${h.match}/]` : ""}`);
    try {
        if (sub === "add") {
            if (!ev || !HOOK_EVENTS.includes(ev))
                return ok(`Usage: /hooks add <event> [--match <tool regex>] <command>\nEvents: ${HOOK_EVENTS.join(", ")}`);
            let rest = args.slice(2), match;
            const mi = rest.indexOf("--match");
            if (mi >= 0) {
                match = rest[mi + 1];
                rest = rest.filter((_, i) => i !== mi && i !== mi + 1);
            }
            const command = rest.join(" ").trim();
            if (!command)
                return ok("Give the shell command to run. The event payload arrives as JSON on stdin.");
            if (match) {
                try {
                    new RegExp(match);
                }
                catch {
                    return ok(`Not a valid regular expression: ${match}`);
                }
            }
            c.rt.cfg.set(`hooks.${ev}`, [...cur(ev), match ? { match, command } : command]);
            return ok(`Hook added for ${ev}: ${command}${ev === "pre_tool_call" ? "\nExit code 2 blocks the tool call (stderr is shown to the model); 0 lets it run." : ""}`);
        }
        if (sub === "remove") {
            const i = Number(args[2]) - 1, list = cur(ev ?? "");
            if (!ev || !(i >= 0 && i < list.length))
                return ok("Usage: /hooks remove <event> <n>   (numbers from /hooks)");
            c.rt.cfg.set(`hooks.${ev}`, list.filter((_, j) => j !== i));
            return ok(`Removed: ${fmt(list[i])}`);
        }
        if (sub === "test") {
            if (!ev || !HOOK_EVENTS.includes(ev))
                return ok(`Usage: /hooks test <event> [tool]   Events: ${HOOK_EVENTS.join(", ")}`);
            const list = H.shellHooks(ev);
            if (!list.length)
                return ok(`No shell hooks for ${ev}.`);
            const payload = { event: ev, sessionId: c.sid, cwd: c.rt.sessionCwd(c.sid), tool: args[2] ?? "terminal", args: { command: "echo test" }, result: "test", test: true };
            const out = [];
            for (const h of list) {
                const r = await H.runShellWait(typeof h === "string" ? h : h.command, payload);
                out.push(`$ ${fmt(h)}\n  exit ${r.code ?? "timeout"} in ${r.ms} ms${ev === "pre_tool_call" ? (r.code === 2 ? " → would BLOCK the call" : " → call allowed") : ""}${r.stdout ? `\n  stdout: ${r.stdout.trim().slice(0, 500)}` : ""}${r.stderr ? `\n  stderr: ${r.stderr.trim().slice(0, 500)}` : ""}`);
            }
            return ok(`Test payload: ${JSON.stringify(payload)}\n\n${out.join("\n\n")}`);
        }
    }
    catch (e) {
        return ok(e.message);
    }
    const lines = HOOK_EVENTS.map((e) => {
        const list = cur(e), plug = H.handlerCount(e);
        return `${e}${plug ? `  (+${plug} plugin handler${plug === 1 ? "" : "s"})` : ""}${list.length ? "\n" + list.map((h, i) => `  ${i + 1}. ${fmt(h)}`).join("\n") : ""}`;
    });
    return ok(`Hooks (shell commands get the event as JSON on stdin; pre_tool_call exit 2 blocks the call):\n${lines.join("\n")}\n\n/hooks add <event> [--match <tool regex>] <command> · /hooks remove <event> <n> · /hooks test <event> [tool]`);
}
// ── /add-dir ────────────────────────────────────────────────────
function addDirCmd(a, c) {
    const [sub, ...rest] = splitArgs(a);
    const s = c.rt.db.getSession(c.sid);
    const dirs = s.meta.extra_dirs ?? [];
    const save = (next) => { c.rt.db.updateSession(c.sid, { meta: { ...s.meta, extra_dirs: next.length ? next : undefined } }); c.rt.refreshSystemPrompt(c.sid); };
    if (!sub || sub === "list")
        return ok(dirs.length ? `Working directories: ${c.rt.sessionCwd(c.sid)} (main)\n${dirs.map((d) => `  + ${d}${existsSync(d) ? "" : " (missing)"}`).join("\n")}` : `Only ${c.rt.sessionCwd(c.sid)}. Add another folder: /add-dir <path>`);
    if (sub === "remove" || sub === "rm") {
        const p = resolvePath(c.rt.sessionCwd(c.sid), rest.join(" "));
        if (!dirs.includes(p))
            return ok(`${p} is not an added directory.`);
        save(dirs.filter((d) => d !== p));
        return ok(`Removed ${p}.`);
    }
    const p = resolvePath(c.rt.sessionCwd(c.sid), [sub, ...rest].join(" "));
    try {
        if (!statSync(p).isDirectory())
            return ok(`Not a folder: ${p}`);
    }
    catch {
        return ok(`No such folder: ${p}`);
    }
    if (p === c.rt.sessionCwd(c.sid) || dirs.includes(p))
        return ok(`${p} is already in this chat.`);
    save([...dirs, p]);
    return ok(`Added ${p}. The agent sees it in its instructions (with its AGENTS.md/CLAUDE.md), and file edits there get their own checkpoints (/diff, /rollback <id> --dir ${basename(p)}).`);
}
async function worktreeCmd(a, c) {
    const [sub = "status", ...rest] = splitArgs(a);
    if (c.rt.isBusy(c.sid) && !["status", "list"].includes(sub))
        return ok("Busy — /stop first.");
    const s = c.rt.db.getSession(c.sid);
    const wt = s.meta.worktree;
    const setMeta = (w) => c.rt.db.updateSession(c.sid, { meta: { ...c.rt.db.getSession(c.sid).meta, worktree: w } });
    const leave = (w) => { setMeta(undefined); c.rt.setSessionCwd(c.sid, existsSync(w.origin) ? w.origin : w.root, { remember: true }); };
    try {
        if (sub === "new" || sub === "create") {
            if (wt)
                return ok(`This chat already works in worktree ${wt.name} (${wt.path}). /worktree exit first.`);
            const w = await createWorktree(c.rt.sessionCwd(c.sid), rest.join("-") || `chat-${c.sid.slice(-6)}`);
            setMeta({ ...w, origin: c.rt.sessionCwd(c.sid) });
            c.rt.setSessionCwd(c.sid, w.cwd, { remember: true });
            return ok(`Worktree ${w.name} on branch ${w.branch} (from ${w.base}).\nThis chat now works in ${w.cwd}; the main checkout ${w.root} is untouched.\nWhen done: /worktree merge (commit + merge into ${w.base}) or /worktree exit [--remove].`);
        }
        if (sub === "list") {
            const l = await listWorktrees(c.rt.sessionCwd(c.sid));
            return ok(l.length ? l.map((w) => `${w.branch.padEnd(30)} ${w.path}${wt?.path === w.path ? "   ← this chat" : ""}`).join("\n") : "No stitaP worktrees in this repository.");
        }
        if (sub === "status") {
            if (!wt)
                return ok("This chat works in the main checkout. /worktree new [name] to start an isolated branch.");
            const ch = await worktreeChanges(wt);
            return ok(`Worktree ${wt.name}: branch ${wt.branch} from ${wt.base}\nFolder: ${wt.path}\n${ch.ahead} commit(s) ahead of ${wt.base}, ${ch.dirty.length} uncommitted change(s)${ch.dirty.length ? `:\n${ch.dirty.slice(0, 20).join("\n")}` : ""}`);
        }
        if (sub === "merge") {
            if (!wt)
                return ok("This chat is not in a worktree.");
            const committed = await commitAll(wt.path, rest.join(" ") || `stitaP worktree ${wt.name}`);
            const ch = await worktreeChanges(wt);
            if (!ch.ahead) {
                leave(wt);
                await removeWorktree(wt, { deleteBranch: true, force: true });
                return ok(`Nothing to merge; removed worktree ${wt.name}. Back in ${wt.origin}.`);
            }
            await mergeWorktree(wt, `Merge ${wt.branch}`);
            leave(wt);
            await removeWorktree(wt, { deleteBranch: true });
            return ok(`${committed ? "Committed the open changes, then merged" : "Merged"} ${ch.ahead} commit(s) from ${wt.branch} into ${wt.base} and removed the worktree. Back in ${wt.origin}.`);
        }
        if (sub === "exit") {
            if (!wt)
                return ok("This chat is not in a worktree.");
            leave(wt);
            if (rest.includes("--remove")) {
                const ch = await worktreeChanges(wt);
                if ((ch.dirty.length || ch.ahead) && !rest.includes("--force"))
                    return ok(`Back in ${wt.origin}. Kept ${wt.path}: it has ${ch.ahead} unmerged commit(s) and ${ch.dirty.length} uncommitted change(s) (add --force to delete them).`);
                await removeWorktree(wt, { deleteBranch: true, force: true });
                return ok(`Back in ${wt.origin}; worktree ${wt.name} and branch ${wt.branch} removed.`);
            }
            return ok(`Back in ${wt.origin}. The worktree stays at ${wt.path} (branch ${wt.branch}); /worktree remove ${wt.name} deletes it.`);
        }
        if (sub === "remove") {
            const name = safeName(rest.filter((x) => x !== "--force").join("-"));
            const l = await listWorktrees(c.rt.sessionCwd(c.sid));
            const w = l.find((x) => basename(x.path) === name);
            if (!w)
                return ok(`No worktree ${name}. See /worktree list.`);
            const root = w.path.slice(0, w.path.indexOf("/.stitap-worktrees/"));
            if (wt?.path === w.path)
                leave(wt);
            await removeWorktree({ root, path: w.path, branch: w.branch }, { deleteBranch: true, force: rest.includes("--force") });
            return ok(`Removed worktree ${name} (branch ${w.branch}${rest.includes("--force") ? "" : " deleted if it was merged"}).`);
        }
    }
    catch (e) {
        return ok(`worktree: ${e.message}`);
    }
    return ok("Usage: /worktree new [name] | status | list | merge [message] | exit [--remove [--force]] | remove <name> [--force]");
}
// ── /effort, /output-style, /statusline ─────────────────────────
function effortCmd(a, c) {
    const v = a.trim().toLowerCase();
    const s = c.rt.db.getSession(c.sid);
    const p = c.rt.providerFor(c.sid);
    if (!v)
        return ok(`Reasoning effort: ${effortOf(c.rt, c.sid) ?? "model default"} (${p.model}).\nSet: /effort ${EFFORTS.join("|")}|default. Claude models get output_config.effort with adaptive thinking (a thinking budget on older ones); local and OpenAI-compatible servers get reasoning_effort and enable_thinking.`);
    if (["default", "auto", "reset"].includes(v)) {
        c.rt.db.updateSession(c.sid, { meta: { ...s.meta, effort: undefined } });
        return ok("Effort: model default.");
    }
    if (!EFFORTS.includes(v))
        return ok(`Unknown effort "${v}". Use ${EFFORTS.join(", ")} or default.`);
    c.rt.db.updateSession(c.sid, { meta: { ...s.meta, effort: v } });
    return ok(`Effort ${v} for this chat, from the next model call.${v === "off" ? " (Models that cannot switch thinking off run at their lowest effort.)" : ""}`);
}
function outputStyleCmd(a, c) {
    const v = a.trim();
    const styles = listOutputStyles(c.rt);
    const s = c.rt.db.getSession(c.sid);
    if (!v || v === "list")
        return ok(`Output style: ${s.meta.output_style ?? (c.rt.cfg.data.agent.output_style || "default")}\n${["default — the normal style", ...Object.entries(styles).map(([k, x]) => `${k} — ${x.description}${x.source === "built-in" ? "" : ` (${x.source})`}`)].join("\n")}\nSet: /output-style <name> (or any free text). Your own: a .md file in ${join(c.rt.home, "output-styles")}.`);
    const name = v === "off" ? "default" : v;
    c.rt.db.updateSession(c.sid, { meta: { ...s.meta, output_style: name === "default" ? undefined : name } });
    c.rt.refreshSystemPrompt(c.sid);
    return ok(`Output style: ${name}${styles[name] || name === "default" ? "" : " (free text)"} — applies from the next message.`);
}
async function statuslineCmd(a, c) {
    const [sub, ...rest] = splitArgs(a);
    try {
        if (sub === "on" || sub === "off") {
            c.rt.cfg.set("ui.statusline.enabled", sub === "on");
            return ok(`Status line ${sub}.`);
        }
        if (sub === "command") {
            const cmd = rest.join(" ").trim();
            if (!cmd)
                return ok("Usage: /statusline command <shell command>   (gets the status as JSON on stdin; its first output line is shown)");
            c.rt.cfg.set("ui.statusline.command", cmd);
            c.rt.cfg.set("ui.statusline.enabled", true);
            return ok(`Status line command set. Preview:\n${await statusLine(c.rt, c.sid)}`);
        }
        if (sub === "reset") {
            c.rt.cfg.set("ui.statusline.command", "");
            return ok(`Built-in status line:\n${formatStatus(await statusInfo(c.rt, c.sid))}`);
        }
        if (sub === "json")
            return ok(JSON.stringify(await statusInfo(c.rt, c.sid), null, 2));
    }
    catch (e) {
        return ok(e.message);
    }
    const line = await statusLine(c.rt, c.sid);
    return ok(`${line ?? "(status line is off)"}\n\nShown above the prompt in the terminal and in the web chat footer. /statusline on|off · command <cmd> · reset · json (the fields a command receives)`);
}
// ── /release-notes, /bug ────────────────────────────────────────
async function releaseNotes() {
    const root = resourceRoot();
    for (const f of ["CHANGELOG.md", "../CHANGELOG.md", "RELEASE_NOTES.md"]) {
        const p = join(root, f);
        if (existsSync(p))
            return readFileSync(p, "utf8").slice(0, 6000);
    }
    const r = await run("git", ["log", "--date=short", "--format=%ad  %s", "-30"], root);
    if (r.code === 0 && r.out)
        return `stitaP harness — recent changes (git log of ${root}):\n${r.out}`;
    let v = "unknown";
    try {
        v = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    }
    catch { /* not packaged */ }
    return `stitaP harness ${v}. No CHANGELOG.md or git history found in ${root}.`;
}
function bugCmd(a, c) {
    const rt = c.rt;
    const what = a.trim();
    if (!what)
        return ok("Usage: /bug <what went wrong>   — writes a report with the session, model and recent log to a file you can attach.");
    const s = rt.db.getSession(c.sid);
    const msgs = rt.db.getMessages(c.sid).slice(-12).map((m) => `[${m.role}${m.name ? `:${m.name}` : ""}] ${(m.content ?? (m.tool_calls ? m.tool_calls.map((t) => `${t.name}(${t.arguments.slice(0, 200)})`).join(", ") : "")).slice(0, 800)}`);
    let logTail = "";
    try {
        logTail = readFileSync(join(rt.home, "logs", "agent.log"), "utf8").split("\n").slice(-60).join("\n");
    }
    catch { /* no log yet */ }
    const p = rt.providerFor(c.sid);
    const report = redactToolOutput([
        `# stitaP bug report — ${new Date().toISOString()}`, "", `## What happened`, what, "",
        `## Environment`, `- harness ${(() => { try {
            return JSON.parse(readFileSync(join(resourceRoot(), "package.json"), "utf8")).version;
        }
        catch {
            return "?";
        } })()} · node ${process.versions.node} · ${process.platform} ${process.arch}`,
        `- model ${p.model} (${p.id}), context ${p.contextWindow}, provider ${rt.cfg.data.model.provider}, tool profile ${s.meta.tool_profile ?? rt.cfg.data.agent.tool_profile}`,
        `- session ${s.id} [${s.source}] "${s.title}", cwd ${rt.sessionCwd(c.sid)}`, "",
        `## Last messages`, "```", ...msgs, "```", "", `## agent.log (last 60 lines)`, "```", logTail, "```",
    ].join("\n"), rt.cfg.allSecretValues());
    const dir = join(rt.home, "bugs");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `bug-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
    writeFileSync(file, report);
    return ok(`Bug report written to ${file} (secrets from .env are redacted; read it before sharing). To file it on GitHub: gh issue create --title "${what.slice(0, 60).replace(/"/g, "'")}" --body-file "${file}"`);
}
// ── /vim, /keybindings, /terminal-setup ─────────────────────────
const BUILTIN_KEYS = [
    ["Enter", "send the message"], ["\\ at line end", "continue on the next line"], ['""" on its own line', "start / end a multi-line block"],
    ["Option/Alt+Enter", "new line (after /terminal-setup)"], ["Tab", "complete /commands and skills"], ["Ctrl+C", "interrupt the running turn; twice to quit"],
    ["Up / Down", "input history"], ["Ctrl+A / Ctrl+E", "start / end of line"], ["Ctrl+W", "delete the word before the cursor"], ["Ctrl+U / Ctrl+K", "delete to start / end of line"],
    ["Ctrl+L", "clear the screen"], ["!<command>", "run a shell command yourself; its output goes to the agent with your next message"], ["#<note>", "save a note to memory (#user <note> for facts about you)"],
];
export const KEY_RE = /^(ctrl|meta|alt)\+([a-z0-9])$/;
function keybindingsCmd(a, c) {
    const [sub, key, ...rest] = splitArgs(a);
    const cur = { ...(c.rt.cfg.data.ui?.keybindings ?? {}) };
    try {
        if (sub === "set") {
            const k = String(key ?? "").toLowerCase().replace(/^option\+/, "alt+");
            const cmd = rest.join(" ").trim();
            if (!KEY_RE.test(k) || !cmd.startsWith("/"))
                return ok("Usage: /keybindings set <ctrl+x | alt+x> </command …>   e.g. /keybindings set ctrl+g /status");
            if (["ctrl+c", "ctrl+d", "ctrl+a", "ctrl+e", "ctrl+w", "ctrl+u", "ctrl+k", "ctrl+l"].includes(k))
                return ok(`${k} is a built-in key; pick another one.`);
            cur[k] = cmd;
            c.rt.cfg.set("ui.keybindings", cur);
            return ok(`${k} → ${cmd} (terminal chat; applies right away).`);
        }
        if (sub === "remove") {
            const k = String(key ?? "").toLowerCase();
            if (!(k in cur))
                return ok(`${k} has no binding.`);
            delete cur[k];
            c.rt.cfg.set("ui.keybindings", cur);
            return ok(`Removed ${k}.`);
        }
    }
    catch (e) {
        return ok(e.message);
    }
    return ok([`Keys in the terminal chat${c.rt.cfg.data.ui?.vim ? " (vim mode on: Esc = normal mode)" : ""}:`, ...BUILTIN_KEYS.map(([k, d]) => `  ${k.padEnd(22)} ${d}`),
        `Your bindings:${Object.keys(cur).length ? "\n" + Object.entries(cur).map(([k, v]) => `  ${k.padEnd(22)} ${v}`).join("\n") : " none"}`,
        "Add: /keybindings set ctrl+g /status · remove: /keybindings remove ctrl+g"].join("\n"));
}
function vimCmd(a, c) {
    const cur = !!c.rt.cfg.data.ui?.vim;
    const v = a.trim().toLowerCase();
    const on = v === "on" ? true : v === "off" ? false : !cur;
    try {
        c.rt.cfg.set("ui.vim", on);
    }
    catch (e) {
        return ok(e.message);
    }
    return ok(on ? `Vim mode on (terminal chat). Esc → normal mode: h l w b e 0 ^ $ x X D C dd cc dw cw r~ p u, i a I A to insert, j/k for history. ${c.source === "cli" ? "" : "It only affects the terminal chat."}` : "Vim mode off.");
}
function terminalSetup() {
    const tp = process.env.TERM_PROGRAM ?? "", term = process.env.TERM ?? "";
    const lines = [`Your terminal: ${tp || term || "unknown"}. Option/Alt+Enter inserts a new line once the terminal sends Option as Meta (Esc+):`];
    if (/iTerm/i.test(tp))
        lines.push("iTerm2: Settings → Profiles → Keys → General → Left Option key: Esc+. (Or Keys → Key Mappings → + → Shift+Return → Send Text with \"vim\" Special Chars: \\e\\r for Shift+Enter.)");
    else if (/Apple_Terminal/.test(tp))
        lines.push("Terminal.app: Settings → Profiles → Keyboard → tick \"Use Option as Meta key\".");
    else if (/vscode/i.test(tp))
        lines.push('VS Code: add to keybindings.json:\n  { "key": "shift+enter", "command": "workbench.action.terminal.sendSequence", "args": { "text": "\\u001b\\r" }, "when": "terminalFocus" }');
    else if (/WezTerm/i.test(tp))
        lines.push("WezTerm: Option already acts as Meta by default (send_composed_key_when_left_alt_is_pressed = false).");
    else if (/ghostty/i.test(tp) || /ghostty/i.test(term))
        lines.push("Ghostty: add `macos-option-as-alt = true` to ~/.config/ghostty/config.");
    else if (/kitty/i.test(term))
        lines.push("kitty: add `macos_option_as_alt yes` to kitty.conf.");
    else
        lines.push("Enable \"Option as Meta/Alt\" in your terminal's keyboard settings.");
    lines.push("Without it: end a line with \\ to continue, or wrap a block in lines of \"\"\". Phone (stitaP Control web terminal): use \\ at the line end.");
    return lines.join("\n");
}
// ── /plan ───────────────────────────────────────────────────────
function lastReply(rt, sid) {
    return [...rt.db.getMessages(sid)].reverse().find((m) => m.role === "assistant" && !m.tool_calls?.length && m.content)?.content ?? "";
}
function planCmd(a, c) {
    const s = c.rt.db.getSession(c.sid);
    const set = (on) => c.rt.db.updateSession(c.sid, { meta: { ...c.rt.db.getSession(c.sid).meta, plan_mode: on || undefined } });
    const t = a.trim();
    const first = t.split(/\s+/)[0].toLowerCase();
    // a bare word is a subcommand ("/plan show"); "/plan show me the auth flow" is a task. approve takes notes.
    const sub = ["approve", "go", "accept"].includes(first) || t.toLowerCase() === first ? first : "__task";
    switch (sub) {
        case "":
        case "status": return ok(s.meta.plan_mode ? "Plan mode is ON: the agent can only read and investigate. /plan approve carries out its plan; /plan off leaves without running it." : "Plan mode is off. /plan <task> plans first (read-only), then you approve with /plan approve.");
        case "on":
            set(true);
            return ok("Plan mode on: the next turns are read-only until you /plan approve or /plan off.");
        case "off":
            set(false);
            return ok("Plan mode off.");
        case "show": {
            const p = lastReply(c.rt, c.sid);
            return ok(p ? p.slice(0, 8000) : "No plan yet.");
        }
        case "approve":
        case "go":
        case "accept": {
            if (c.rt.isBusy(c.sid))
                return ok("Busy — wait for the plan to finish first.");
            const plan = lastReply(c.rt, c.sid);
            if (!s.meta.plan_mode && !plan)
                return ok("No plan to approve. Start one with /plan <task>.");
            set(false);
            const notes = t.slice(first.length).trim();
            return { text: "Plan approved — plan mode off, carrying it out.", send: `The plan is approved${notes ? ` with these changes: ${notes}` : ""}. Carry it out now: put its steps in todo_list, do them one by one, and verify the result as the plan says.` };
        }
        default:
            if (c.rt.isBusy(c.sid))
                return ok("Busy — /stop first.");
            set(true);
            return { text: "Plan mode on (read-only). The agent investigates and proposes a plan; /plan approve runs it.", send: t };
    }
}
// ── `!cmd` and `#note` ──────────────────────────────────────────
/**
 * Input prefixes, as in Claude Code: `!cmd` runs a shell command in this chat's folder right away (its output goes to
 * the agent with the next message; terminal and web chat only), `#note` saves a memory entry (`#user …` for facts about
 * the user). Returns null when the line is a normal message.
 */
export async function runInputPrefix(line, c) {
    const t = line.trim();
    if (/^#(?!#)\s*\S/.test(t) && !t.includes("\n") && t.length <= 1000) {
        const m = /^#\s*(user\s*:?\s+)?([\s\S]+)$/i.exec(t);
        const target = m[1] ? "user" : "memory";
        const r = c.rt.memory.add(target, m[2].trim());
        return ok(`${/^error/i.test(r) ? r : `Saved to ${target === "user" ? "user profile" : "memory"}: ${m[2].trim()}`} (new chats see it; this chat keeps its current instructions).`);
    }
    if (t.startsWith("!") && t.length > 1 && !t.startsWith("!=")) {
        if (!["cli", "web"].includes(c.source))
            return ok("!commands run only from the terminal or web chat.");
        const command = t.slice(1).trim();
        const cwd = c.rt.sessionCwd(c.sid);
        if (isMutating(command))
            c.rt.checkpoints.take(cwd, `before !${command.slice(0, 100)}`);
        const res = await c.rt.terminal.exec(command, { cwd, timeoutMs: c.rt.cfg.data.terminal.timeout * 1000 });
        if (res.cwd && res.cwd !== cwd && existsSync(res.cwd))
            c.rt.setSessionCwd(c.sid, res.cwd);
        const out = res.output.length > 6000 ? `${res.output.slice(0, 2000)}\n…\n${res.output.slice(-3500)}` : res.output;
        const runs = c.rt.db.getMeta(shellKey(c.sid)) ?? [];
        c.rt.db.setMeta(shellKey(c.sid), [...runs, { command, exitCode: res.exitCode, output: redactToolOutput(out, c.rt.cfg.allSecretValues()), at: Date.now() }].slice(-5));
        return ok(`${out || "(no output)"}\n[exit ${res.exitCode ?? "?"}${res.timedOut ? ", timed out" : ""}${res.cwd !== cwd ? ` · cwd ${res.cwd}` : ""} · the agent sees this with your next message]`);
    }
    return null;
}
// ── table ───────────────────────────────────────────────────────
/** /open: show a document in the web chat's viewer (the terminal opens the desktop viewer); no path lists this chat's documents. */
async function openCmd(a, c) {
    const arg = a.trim();
    const docs = chatDocuments(c.rt, c.sid);
    if (!arg) {
        if (c.source === "web")
            return { open: "*" };
        return ok(docs.length ? `Documents of this chat (newest first):\n${docs.map((d, i) => `  ${i + 1}. ${d.path}`).join("\n")}\n/open <number or path> to open one.` : "This chat has not made any documents yet. /open <path> opens any file.");
    }
    if (isUrl(arg)) {
        if (c.source === "web")
            return { open: arg };
        try {
            const r = await fetchDocUrl(c.rt, arg);
            if (c.source === "cli") {
                const err = await openOnDesktop(r.path);
                return ok(err ?? `Opened the ${r.kind} (copy: ${r.path}).`);
            }
            return ok(`Downloaded the ${r.kind} to ${r.path}; the viewer is part of the web chat.`);
        }
        catch (e) {
            return ok(e.message);
        }
    }
    const pick = /^\d{1,3}$/.test(arg) && !existsSync(resolvePath(c.rt.sessionCwd(c.sid), arg)) ? docs[Number(arg) - 1]?.path : arg;
    if (!pick)
        return ok(`There is no document ${arg}; /open lists them.`);
    let abs;
    try {
        abs = resolveDoc(c.rt, c.sid, pick);
    }
    catch (e) {
        return ok(e.message);
    }
    if (c.source === "web")
        return { open: abs };
    if (c.source === "cli") {
        const err = await openOnDesktop(abs);
        return ok(err ? `${abs}: ${err}` : `Opened ${abs}.`);
    }
    return ok(`The document viewer is part of the web chat. The file is at ${abs}.`);
}
export const CC_COMMANDS = [
    { name: "open", aliases: ["view", "docs"], group: "files", usage: "/open [path | number | link]", help: "Show a document (design doc, report, PDF, Word, Excel, PowerPoint, CSV, HTML, image, or a Google Docs/Sheets/Slides link) in the document viewer; no path lists this chat's documents", handler: openCmd },
    { name: "plan", group: "autonomy", usage: "/plan <task> | approve [changes] | on | off | show", help: "Plan mode: investigate read-only and propose a plan; nothing changes until you approve", handler: planCmd },
    { name: "review", group: "review", usage: "/review [PR# | ref | --staged] [paths] [focus]", help: "Read-only code review of the uncommitted changes (or a PR / branch): ranked, verified findings", handler: (a, c) => reviewCmd("review", a, c) },
    { name: "security-review", group: "review", usage: "/security-review [PR# | ref | --staged] [paths]", help: "Read-only security review of the pending changes", handler: (a, c) => reviewCmd("security", a, c) },
    { name: "simplify", group: "review", usage: "/simplify [PR# | ref | --staged] [paths]", help: "Clean up the changed code (reuse, dead code, efficiency) without changing behaviour, then re-run the tests", handler: async (a, c) => {
            if (c.rt.isBusy(c.sid))
                return ok("Busy — /stop first.");
            const d = await collectDiff(c.rt.sessionCwd(c.sid), splitArgs(a));
            if ("error" in d)
                return ok(d.error);
            return { text: `Simplifying ${d.label}…`, send: `Clean up these changes (${d.label}) without changing what the code does:\n- reuse existing helpers instead of new duplicates (search the code base first),\n- remove dead code, leftover debug output and needless indirection,\n- simplify convoluted conditions and loops, fix obvious inefficiencies (repeated work, N+1 calls),\n- match the naming and style of the surrounding code.\nChange files with patch in small steps. Then run the project's tests or build and fix anything you broke. Finish with a short list of what you changed and the test result. Leave anything that is a judgment call alone.\n\n${diffBlock(c.rt, c.sid, d)}` };
        } },
    { name: "init", group: "files", usage: "/init [notes]", help: "Explore the project and write (or improve) its AGENTS.md instructions file", handler: initCmd },
    { name: "context", group: "context", usage: "/context", help: "Where the context window goes: system prompt, tool schemas, messages, free space", handler: (_a, c) => ok(contextReport(c.rt, c.sid)) },
    { name: "todos", group: "session", usage: "/todos [clear]", help: "Show this chat's todo list", handler: (a, c) => { if (a.trim() === "clear") {
            c.rt.db.deleteMeta(`todo:${c.sid}`);
            return ok("Todo list cleared.");
        } return ok(todosText(c.rt, c.sid)); } },
    { name: "tasks", aliases: ["bashes", "jobs"], group: "control", usage: "/tasks [all | log <id> | kill <id>]", help: "Background processes the agent started: list, read output, stop", handler: tasksCmd },
    { name: "hooks", group: "integrations", usage: "/hooks [add <event> [--match re] <cmd> | remove <event> <n> | test <event>]", help: "Show, add, remove and test lifecycle hooks (pre_tool_call exit 2 blocks a call)", handler: hooksCmd },
    { name: "permissions", aliases: ["allowed-tools"], group: "control", usage: "/permissions [allow <p> | remove <n> | deny <tool> | undeny <tool> | mode <m> | block <path> | protect <glob>]", help: "Approval mode, allow rules, denied tools and blocked paths", handler: permissionsCmd },
    { name: "fewer-permission-prompts", group: "control", usage: "/fewer-permission-prompts [apply [n,…]]", help: "Suggest allow rules from the commands you keep approving", handler: fewerPromptsCmd },
    { name: "add-dir", group: "files", usage: "/add-dir <path> | list | remove <path>", help: "Work in more folders than the chat's own (instructions + checkpoints)", handler: addDirCmd },
    { name: "worktree", group: "files", usage: "/worktree new [name] | status | list | merge | exit [--remove] | remove <name>", help: "Work on an isolated git worktree branch, then merge it back", handler: worktreeCmd },
    { name: "effort", aliases: ["think"], group: "config", usage: "/effort [off|low|medium|high|xhigh|max|default]", help: "Reasoning effort / thinking for this chat", handler: effortCmd },
    { name: "output-style", group: "config", usage: "/output-style [name | off | list]", help: "Answer style: concise, explanatory, learning, report or your own", handler: outputStyleCmd },
    { name: "statusline", group: "config", usage: "/statusline [on | off | command <cmd> | reset | json]", help: "The status line (model, context %, branch, modes); or your own command", handler: statuslineCmd },
    { name: "vim", group: "config", usage: "/vim [on|off]", help: "Vim keys in the terminal chat", handler: vimCmd },
    { name: "keybindings", group: "config", usage: "/keybindings [set <key> <command> | remove <key>]", help: "Keyboard shortcuts; bind ctrl+/alt+ keys to slash commands", handler: keybindingsCmd },
    { name: "terminal-setup", group: "config", usage: "/terminal-setup", help: "How to get Option/Shift+Enter new lines in your terminal", handler: () => ok(terminalSetup()) },
    { name: "release-notes", group: "general", usage: "/release-notes", help: "What changed in the harness", handler: async () => ok(await releaseNotes()) },
    { name: "bug", group: "general", usage: "/bug <what went wrong>", help: "Write a bug report (session, model, log) to a file", handler: bugCmd },
];

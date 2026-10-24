/**
 * Per-chat modes that change how a turn runs: plan mode (read-only until the user approves a plan), reasoning effort,
 * output style, the status line, and shell output the user ran with `!cmd` (handed to the model with the next message).
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Runtime } from "./runtime.js";
import { estimateMessages } from "../loop/compression.js";

// ── plan mode / read-only turns ────────────────────────────────

/** Tools that never change anything. Tools with an `action` are checked per action below. */
const READ_ONLY_TOOLS = new Set([
  "read_file", "search_files", "list_dir", "code_search", "lsp", "web_search", "web_extract", "docs_lookup", "todo_list",
  "skills_list", "skill_view", "session_search", "clarify", "tool_search", "vision_analyze", "rag_search", "office_to_markdown",
  "browser_navigate", "browser_snapshot", "browser_screenshot", "browser_tabs", "browser_console", "browser_wait", "browser_back", "browser_scroll",
]);
const READ_ONLY_ACTIONS: Record<string, (a: any) => boolean> = {
  git: (a) => ["status", "diff", "log", "show"].includes(a.action) || (a.action === "branch" && !a.name),
  github: (a) => ["pr_list", "pr_view", "pr_diff", "pr_checks", "issue_list", "issue_view", "repo_view"].includes(a.action),
  file_history: (a) => (a.action ?? "list") !== "restore",
  kanban: (a) => ["list", "show", "board", "report", "boards", "design_status"].includes(a.action),
  process_manage: (a) => ["list", "poll", "log", "wait"].includes(a.action),
};

/** Programs that only read. A command passes when every piece of a pipeline / && chain starts with one of these. */
const READ_ONLY_COMMANDS = /^(ls|cat|head|tail|less|more|grep|egrep|fgrep|rg|ag|find|fd|wc|pwd|tree|file|stat|which|whereis|type|echo|printf|du|df|date|env|printenv|uname|whoami|id|hostname|sort|uniq|cut|tr|awk|jq|yq|diff|cmp|md5|md5sum|shasum|sha256sum|basename|dirname|realpath|readlink|nl|column|xxd|hexdump|od|strings|ps|top -l 1|lsof|uptime|sw_vers|node -v|node --version|npm -v|npm --version|npm ls|npm view|npm outdated|pip list|pip show|pip freeze|python3? --version|cargo --version|go version|go list|go env|tsc --version|git (status|log|diff|show|blame|branch|rev-parse|ls-files|ls-tree|remote -v|describe|shortlog|tag -l|tag --list|config --get|stash list|reflog|grep|cat-file)|gh (pr|issue) (list|view|diff|checks|status)|gh repo view)(\s|$)/;

export function readOnlyCommand(command: string): boolean {
  const c = command.trim();
  if (!c) return false;
  // writing redirections (keep 2>&1 and >/dev/null), command substitution and background jobs are not read-only
  if (/>|\$\(|`|&\s*$|\btee\b/.test(c.replace(/2>&1|[12]?>\s*\/dev\/null/g, ""))) return false;
  if (/\bfind\b[^|;&]*\s-(delete|exec|execdir|ok|fprint)\b/.test(c)) return false;
  if (/\bsed\b|\bperl\b|\bxargs\b/.test(c)) return false;
  return c.split(/\|\||&&|;|\|/).map((p) => p.trim().replace(/^(sudo\s+)?(cd\s+\S+\s*)?/, "")).filter(Boolean).every((p) => READ_ONLY_COMMANDS.test(p));
}

export type ReadOnlyKind = "plan" | "review";

/** Why a tool call is refused in a read-only turn, or null when it may run. */
export function readOnlyBlock(rt: Runtime, sid: string, tool: string, args: any): string | null {
  const s = rt.db.getSession(sid);
  const kind: ReadOnlyKind | undefined = s?.meta?.plan_mode ? "plan" : s?.meta?.read_only_turn;
  if (!kind) return null;
  if (isReadOnlyCall(tool, args ?? {})) return null;
  return kind === "plan"
    ? `BLOCKED: plan mode is on, and ${tool}${args?.action ? ` action=${args.action}` : ""} can change things. Investigate with read-only tools only (read_file, search_files, code_search, git status/diff/log, read-only terminal commands such as ls, cat, grep), then answer with the plan under a "## Plan" heading. The user carries it out with /plan approve.`
    : `BLOCKED: this is a review, so files and state must not change (${tool}${args?.action ? ` action=${args.action}` : ""}). Read the code and report findings; do not fix them.`;
}

function isReadOnlyCall(tool: string, a: any): boolean {
  if (READ_ONLY_TOOLS.has(tool)) return true;
  const byAction = READ_ONLY_ACTIONS[tool];
  if (byAction) return byAction(a);
  if (tool === "terminal") return !a.background && readOnlyCommand(String(a.command ?? ""));
  if (tool === "use_tool") return isReadOnlyCall(String(a.name ?? a.tool ?? ""), a.arguments ?? a.args ?? {});
  return false;
}

export const PLAN_NOTE = "[Plan mode is ON. Investigate first with read-only tools (read files, search, git status/diff/log, read-only shell commands). Do not create, edit or delete anything and do not run builds, installs or tests that write files. When you understand the task, reply with a numbered plan under a \"## Plan\" heading: the files you will change, what changes in each, and how you will verify the result. The user approves it with /plan approve.]";

// ── reasoning effort ────────────────────────────────────────────

export const EFFORTS = ["off", "low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
export const effortOf = (rt: Runtime, sid: string): Effort | undefined => rt.db.getSession(sid)?.meta?.effort ?? ((rt.cfg.data.agent as any).effort || undefined);

// ── output styles ───────────────────────────────────────────────

export const OUTPUT_STYLES: Record<string, { description: string; prompt: string }> = {
  concise: { description: "Shortest useful answers", prompt: "Answer as briefly as possible: results first, no preamble, no recap. Use bullets only when they shorten the answer." },
  explanatory: { description: "Explains the choices made while working", prompt: "While working, briefly explain why you choose an approach and what the code you touch does (2-3 sentence \"Insight\" notes at decision points). Keep the final answer structured: what changed, why, how it was verified." },
  learning: { description: "Teaches: leaves small parts for the user to write", prompt: "Work as a pair-programming teacher. Explain concepts as you go. For small, instructive parts (a few lines of logic), do not write them yourself: leave a clearly marked TODO(human) in the code, explain what it should do, and ask the user to write it." },
  report: { description: "Structured report with headings", prompt: "Format final answers as a short report: ## Summary, ## Changes (file: what), ## Verification (commands and their results), ## Open points." },
};

/** Built-in styles plus `<home>/output-styles/<name>.md` files (first line `description: …` is optional). */
export function listOutputStyles(rt: Runtime): Record<string, { description: string; prompt: string; source: string }> {
  const out: Record<string, { description: string; prompt: string; source: string }> = {};
  for (const [k, v] of Object.entries(OUTPUT_STYLES)) out[k] = { ...v, source: "built-in" };
  const dir = join(rt.home, "output-styles");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
      const text = readFileSync(join(dir, f), "utf8").trim();
      const m = /^description:\s*(.+)\n/i.exec(text);
      out[f.slice(0, -3)] = { description: m ? m[1].trim() : text.split("\n")[0].slice(0, 80), prompt: m ? text.slice(m[0].length).trim() : text, source: join(dir, f) };
    }
  }
  return out;
}

export function outputStylePrompt(rt: Runtime, name: string | undefined): string | undefined {
  if (!name || name === "default") return undefined;
  return listOutputStyles(rt)[name]?.prompt ?? name;   // free text works like /personality
}

// ── `!cmd` output for the next message ──────────────────────────

export const shellKey = (sid: string) => `shell_context:${sid}`;
export interface ShellRun { command: string; exitCode: number | null; output: string; at: number }

/** Shell runs the user made since the last message, as a block the model sees; clears them. */
export function takeShellContext(rt: Runtime, sid: string): string {
  const runs = rt.db.getMeta<ShellRun[]>(shellKey(sid));
  if (!runs?.length) return "";
  rt.db.deleteMeta(shellKey(sid));
  return `[The user ran these commands in this chat's shell themselves:]\n${runs.map((r) => `$ ${r.command}   (exit ${r.exitCode ?? "?"})\n${r.output}`).join("\n\n")}\n\n`;
}

// ── status line ─────────────────────────────────────────────────

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));

function gitBranch(cwd: string): Promise<string> {
  return new Promise((res) => execFile("git", ["status", "--porcelain=v1", "-b", "--untracked-files=no"], { cwd, timeout: 1500 }, (err, out) => {
    if (err) return res("");
    const lines = String(out).split("\n");
    const b = /^## (?:No commits yet on )?([^.\s]+)/.exec(lines[0] ?? "")?.[1] ?? "";
    res(b ? `${b}${lines.slice(1).some(Boolean) ? "*" : ""}` : "");
  }));
}

/** What the status line shows: model, router tier, context use, git branch, folder and active modes. */
export async function statusInfo(rt: Runtime, sid: string) {
  const s = rt.db.getSession(sid);
  const p: any = rt.providerFor(sid);
  const msgs = rt.db.getMessages(sid);
  const used = Math.ceil(((s?.system_prompt?.length ?? 0) / 4)) + estimateMessages(msgs);
  const cwd = rt.sessionCwd(sid);
  const branch = await gitBranch(cwd);
  return {
    session: sid, model: p.model as string, tier: p.last?.tier as string | undefined, context_used: used, context_window: p.contextWindow as number,
    context_pct: p.contextWindow ? Math.round((used / p.contextWindow) * 100) : 0, cwd, branch,
    plan_mode: !!s?.meta?.plan_mode, effort: effortOf(rt, sid), output_style: s?.meta?.output_style as string | undefined,
    yolo: rt.approvals.yoloSessions.has(sid), worktree: s?.meta?.worktree?.branch as string | undefined, busy: rt.isBusy(sid),
  };
}

export function formatStatus(i: Awaited<ReturnType<typeof statusInfo>>): string {
  return [
    i.model + (i.tier ? `:${i.tier}` : ""),
    `ctx ${i.context_pct}% (${k(i.context_used)}/${k(i.context_window)})`,
    i.branch ? `⎇ ${i.branch}` : "",
    basename(i.cwd) || i.cwd,
    i.worktree ? `worktree ${i.worktree}` : "",
    i.plan_mode ? "PLAN MODE" : "",
    i.effort ? `effort ${i.effort}` : "",
    i.output_style ? `style ${i.output_style}` : "",
    i.yolo ? "YOLO" : "",
  ].filter(Boolean).join(" · ");
}

/** The status line text: `ui.statusline.command` (gets the info as JSON on stdin, first stdout line is shown) or the built-in one. */
export async function statusLine(rt: Runtime, sid: string): Promise<string | null> {
  const cfg = (rt.cfg.data as any).ui?.statusline ?? {};
  if (cfg.enabled === false) return null;
  const info = await statusInfo(rt, sid);
  if (!cfg.command) return formatStatus(info);
  const sh = rt.terminal.shell;
  return new Promise((res) => {
    const child = execFile(sh.exe, sh.args(cfg.command), { cwd: info.cwd, timeout: 2000 }, (err, out) => {
      const line = String(out ?? "").split("\n").find((l) => l.trim());
      res(err && !line ? `${formatStatus(info)} (statusline command failed)` : (line ?? "").slice(0, 300));
    });
    child.stdin?.end(JSON.stringify(info));
  });
}

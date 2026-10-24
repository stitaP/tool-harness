/**
 * Kanban board: a small Jira-style tracker. Cards have keys (PT-12), types (epic/task/bug), acceptance criteria,
 * a test command that gates "done", threaded comments, a status history and linked git commits. Cards are dispatched
 * to worker sessions in goal mode; interrupted cards (power cut, crash) are put back on the queue by recover().
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { Runtime } from "../runtime/runtime.js";
import { newId, shortId, errMsg } from "../util/misc.js";
import { log } from "../util/log.js";
import { type Tool, obj, str, enm, arr, int, bool } from "../tools/types.js";
import { importPlan } from "./plan.js";
import { expandHome } from "../safety/paths.js";
import { verifyCard, writeVerifyTest, checkBuilt, stubFiles } from "./verify.js";
import { Boards, type CardRef } from "./boards.js";
import { Projects } from "./projects.js";
import { enrichBoard, describeEnrich } from "./enrich.js";
import { startDesignJob, designJob, stopDesignJob, describeJob } from "./design.js";
import type { Step } from "../tools/webtest.js";
import { createWorktree, mergeWorktree, removeWorktree, worktreeChanges } from "../runtime/worktree.js";

export type CardStatus = "backlog" | "ready" | "running" | "review" | "blocked" | "done";
export type CardType = "epic" | "task" | "bug";
export interface CardComment { id?: string; at: number; by: string; text: string; reply_to?: string }
export interface CardCommit { hash: string; message: string; at: number }
export interface StatusChange { at: number; from: CardStatus | null; to: CardStatus; by: string; reason?: string }
export interface TestResult { at: number; cmd: string; code: number; output: string }
export interface Card {
  id: string; title: string; body: string; status: CardStatus; priority: number; depends_on: string[];
  review: boolean; comments: CardComment[]; session_id?: string; result?: string;
  created_at: number; updated_at: number; attempts: number;
  key?: string; type?: CardType; parent?: string; links?: string[]; acceptance?: string[];
  test_cmd?: string; test_result?: TestResult; spec?: string; cwd?: string; functional?: Step[];
  /** kanban.worktrees: the git worktree this card's worker uses until the card is merged */
  worktree?: { path: string; branch: string; root: string; base: string; cwd: string };
  board?: string; refs?: CardRef[]; summary?: string; test_cases?: string[];
  /** name of a working folder of the board's project (projects.ts) the ticket is worked in */
  folder?: string;
  kind?: "tests" | "story" | "gate"; section?: string; files?: string[]; exports?: Record<string, string[]>; order?: number;
  /** the ticket writes the tests its test_cmd runs (tickets made from a design), so they need not exist before it starts */
  writes_tests?: boolean;
  /** problems the automatic story check could not fix: a person should look before approving */
  review_flags?: string[];
  verification?: { at: number; ok: boolean; report: string; shots: number };
  branch?: string; checkpoint?: { head: string; stash?: string; at: number }; commits?: CardCommit[]; history?: StatusChange[];
}
export type NewCard = { title: string; body?: string; priority?: number; depends_on?: string[]; status?: CardStatus; review?: boolean;
  type?: CardType; parent?: string; links?: string[]; acceptance?: string[]; test_cmd?: string; spec?: string; cwd?: string; functional?: Step[]; key_prefix?: string;
  board?: string; folder?: string; summary?: string; test_cases?: string[]; kind?: Card["kind"]; section?: string; files?: string[]; exports?: Record<string, string[]>; order?: number; writes_tests?: boolean; review_flags?: string[];
  /** an explicit key; or "feature": number it as the next main feature (MF010), its children follow (US0101) */
  key?: string; numbering?: "feature" };

const HOOK_MARK = "# stitap-kanban-hook";
const HOOK = `#!/bin/sh
${HOOK_MARK}
# While a kanban card is active, every commit message must start with the card key.
f="$(git rev-parse --git-dir)/stitap-card"
[ -f "$f" ] || exit 0
key=$(cat "$f")
head -n 1 "$1" | grep -qE "^$key([^A-Za-z0-9]|$)" || { echo "stitaP: commit message must start with the active card key $key" >&2; exit 1; }
`;

function run(cmd: string, args: string[], cwd: string, timeoutMs = 20_000): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1" } }, (err: any, stdout, stderr) => {
      res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout ?? ""}${stderr ?? ""}`.trim() });
    });
  });
}
const tail = (s: string, n = 4000) => (s.length > n ? `…${s.slice(-n)}` : s);

export class KanbanBoard {
  private active = new Set<string>();
  /** named boards, the active board, saving/restoring, and links between tickets on any board */
  readonly boards: Boards;
  /** projects: named groups of boards with their working folders */
  readonly projects: Projects;
  constructor(private rt: Runtime) { this.boards = new Boards(rt, this); this.projects = new Projects(rt, this); }

  isActive(id: string): boolean { return this.active.has(id); }

  private get cfg() { return this.rt.cfg.data.kanban; }

  /** Tickets of one board (default: the active board), highest priority first. */
  list(status?: CardStatus, boardId?: string): Card[] {
    const id = boardId ?? this.boards.activeId();
    return this.rt.db.listRecords<Card>("kanban").filter((c) => c.board === id && (!status || c.status === status))
      .sort((a, b) => b.priority - a.priority || a.created_at - b.created_at);
  }
  /** Tickets of every board. */
  listAll(status?: CardStatus): Card[] {
    this.boards.activeId();
    return this.rt.db.listRecords<Card>("kanban").filter((c) => !status || c.status === status).sort((a, b) => b.priority - a.priority || a.created_at - b.created_at);
  }
  /** Look a card up by id or by key (PT-12, case-insensitive). */
  get(ref: string): Card | null {
    if (!ref) return null;
    const direct = this.rt.db.getRecord<Card>("kanban", ref);
    if (direct) return direct;
    const k = ref.toUpperCase();
    return this.rt.db.listRecords<Card>("kanban").find((c) => c.key?.toUpperCase() === k) ?? null;
  }
  private need(ref: string): Card { const c = this.get(ref); if (!c) throw new Error(`no card ${ref}`); return c; }
  private save(c: Card) { c.updated_at = Date.now(); this.rt.db.putRecord("kanban", c.id, c); this.rt.emitEvent("*", { type: "kanban", card: c }); }

  /** the kanban section of the config (read-only use outside this class) */
  get settings() { return this.cfg; }
  private get numbering() { return this.cfg.numbering; }   // defaults in config.ts: MF / US / BG, 3 feature digits, 1 story digit
  /** The next main-feature key: MF001, MF002 … numbered across every board. */
  featureKey(): string {
    const n = this.numbering, re = new RegExp(`^${n.feature_prefix}(\\d{${n.feature_digits}})$`);
    let max = 0;
    for (const c of this.rt.db.listRecords<Card>("kanban")) { const m = c.key?.match(re); if (m) max = Math.max(max, Number(m[1])); }
    return `${n.feature_prefix}${String(max + 1).padStart(n.feature_digits, "0")}`;
  }
  /** The feature number of a main-feature key (MF010 → "010"), or null when the key is not one. */
  featureNumber(key?: string): string | null {
    const n = this.numbering;
    return new RegExp(`^${n.feature_prefix}(\\d{${n.feature_digits}})$`).exec(key ?? "")?.[1] ?? null;
  }
  /** The next child key under a main feature: MF010 → US0101, US0102 … (bugs: BG0101 …). */
  childKey(featureKey: string, type: CardType = "task"): string {
    const n = this.numbering, num = this.featureNumber(featureKey);
    if (!num) throw new Error(`${featureKey} is not a main-feature key (like ${n.feature_prefix}${"1".padStart(n.feature_digits, "0")})`);
    const prefix = type === "bug" ? n.bug_prefix : n.story_prefix;
    const re = new RegExp(`^${prefix}${num}(\\d+)$`);
    let max = 0;
    for (const c of this.rt.db.listRecords<Card>("kanban")) { const m = c.key?.match(re); if (m) max = Math.max(max, Number(m[1])); }
    return `${prefix}${num}${String(max + 1).padStart(n.story_digits, "0")}`;
  }
  private nextKey(prefix: string): string {
    const re = new RegExp(`^${prefix}-(\\d+)$`);
    let max = 0;
    for (const c of this.rt.db.listRecords<Card>("kanban")) { const m = c.key?.match(re); if (m) max = Math.max(max, Number(m[1])); }
    return `${prefix}-${max + 1}`;
  }

  create(p: NewCard): Card {
    const prefix = (p.key_prefix ?? this.cfg.project_key ?? "PT").toUpperCase();
    const now = Date.now();
    const status = p.status ?? (p.type === "epic" ? "backlog" : "ready");
    const parent = p.parent ? this.get(p.parent)?.key ?? p.parent : undefined;
    if (p.key && this.get(p.key)) throw new Error(`ticket key ${p.key} is already used`);
    const folder = p.folder ? this.projects.checkFolder(p.board ?? this.boards.activeId(), p.folder) : undefined;
    const featureEpic = p.type === "epic" && (p.numbering === "feature" || (!p.key_prefix && this.numbering.style !== "prefix"));
    const key = p.key?.toUpperCase() ?? (featureEpic ? this.featureKey() : parent && this.featureNumber(parent) && p.type !== "epic" ? this.childKey(parent, p.type) : this.nextKey(prefix));
    const c: Card = { id: shortId("k_"), board: p.board ?? this.boards.activeId(), key, type: p.type ?? "task", title: p.title, body: p.body ?? "", status, priority: p.priority ?? 0,
      depends_on: (p.depends_on ?? []).map((d) => this.get(d)?.id ?? d), review: !!p.review, comments: [], created_at: now, updated_at: now, attempts: 0,
      ...(parent ? { parent } : {}), ...(p.links?.length ? { links: p.links } : {}), ...(p.acceptance?.length ? { acceptance: p.acceptance } : {}),
      ...(p.test_cmd ? { test_cmd: p.test_cmd } : {}), ...(p.spec ? { spec: p.spec } : {}), ...(p.cwd ? { cwd: p.cwd } : {}), ...(folder ? { folder } : {}), ...(p.functional?.length ? { functional: p.functional } : {}),
      ...(p.kind ? { kind: p.kind } : {}), ...(p.writes_tests ? { writes_tests: true } : {}), ...(p.review_flags?.length ? { review_flags: p.review_flags } : {}), ...(p.section ? { section: p.section } : {}), ...(p.summary ? { summary: p.summary } : {}), ...(p.test_cases?.length ? { test_cases: p.test_cases } : {}), ...(p.files?.length ? { files: p.files } : {}), ...(p.exports && Object.keys(p.exports).length ? { exports: p.exports } : {}), ...(p.order !== undefined ? { order: p.order } : {}),
      history: [{ at: now, from: null, to: status, by: "user", reason: "created" }], commits: [] };
    this.save(c);
    this.rollup(c.parent);
    this.boards.resolvePending(c);
    return c;
  }

  update(ref: string, patch: Partial<Card>, meta: { by?: string; reason?: string } = {}): Card {
    const c = this.need(ref);
    const n: Card = { ...c, ...patch };
    if (patch.status && patch.status !== c.status) n.history = [...(c.history ?? []), { at: Date.now(), from: c.status, to: patch.status, by: meta.by ?? "agent", ...(meta.reason ? { reason: meta.reason } : {}) }];
    this.save(n);
    this.rollup(n.parent);
    return n;
  }

  comment(ref: string, text: string, by = "agent", reply_to?: string): Card {
    const c = this.need(ref);
    if (reply_to && !c.comments.some((x) => x.id === reply_to)) throw new Error(`no comment ${reply_to} on ${c.key ?? c.id}`);
    c.comments.push({ id: shortId("c_"), at: Date.now(), by, text, ...(reply_to ? { reply_to } : {}) });
    this.save(c);
    return c;
  }

  /** Delete a card that has not been worked (used when a plan is re-imported in more detail). */
  remove(ref: string): boolean {
    const c = this.get(ref);
    return c ? this.removeCard(c.id) : false;
  }
  /** Delete a card and clean up what pointed at it: dependencies and links on any board. */
  removeCard(id: string): boolean {
    const c = this.rt.db.getRecord<Card>("kanban", id);
    if (!c) return false;
    this.rt.db.deleteRecord("kanban", c.id);
    for (const o of this.rt.db.listRecords<Card>("kanban")) {
      const dep = o.depends_on.includes(c.id), ref = (o.refs ?? []).some((r) => r.key === (c.key ?? "").toUpperCase()), lnk = (o.links ?? []).includes(c.key ?? "");
      if (!dep && !ref && !lnk) continue;
      o.depends_on = o.depends_on.filter((d) => d !== c.id); o.refs = (o.refs ?? []).filter((r) => r.key !== (c.key ?? "").toUpperCase());
      if (o.links) o.links = o.links.filter((l) => l !== c.key); this.rt.db.putRecord("kanban", o.id, o);
    }
    this.rt.emitEvent("*", { type: "kanban", card: { ...c, status: "removed" } });
    this.rollup(c.parent);
    return true;
  }

  /** An epic is running while any child runs/is ready, blocked if a child is, done when all children are done. */
  private rollup(parentKey?: string) {
    if (!parentKey) return;
    const epic = this.get(parentKey);
    if (!epic || epic.type !== "epic") return;
    const kids = this.rt.db.listRecords<Card>("kanban").filter((c) => c.parent === epic.key);
    if (!kids.length) return;
    const st: CardStatus = kids.every((k) => k.status === "done") ? "done" : kids.some((k) => k.status === "blocked") ? "blocked"
      : kids.some((k) => k.status === "running" || k.status === "review" || k.status === "done") ? "running" : kids.every((k) => k.status === "backlog") ? "backlog" : "ready";   // all drafts: the epic is a draft too
    if (st !== epic.status) { epic.history = [...(epic.history ?? []), { at: Date.now(), from: epic.status, to: st, by: "system", reason: "child cards changed" }]; epic.status = st; this.save(epic); }
  }

  // ── git ───────────────────────────────────────────────────────
  cwdOf(c: Card): string {
    if (c.worktree?.cwd && existsSync(c.worktree.cwd)) return c.worktree.cwd;
    const base = expandHome(c.cwd || this.projects.folderFor(c.board, c.folder) || this.boards.projectOf(c.board) || this.projects.primary(this.projects.ofBoard(c.board))?.path || this.cfg.cwd || this.rt.defaultCwd());
    return isAbsolute(base) ? base : resolve(base);
  }
  private async gitDir(cwd: string): Promise<string | null> {
    const r = await run("git", ["rev-parse", "--absolute-git-dir"], cwd);
    return r.code === 0 && r.out ? r.out.split("\n")[0] : null;
  }
  /** Record a commit on the card (idempotent on hash). */
  linkCommit(ref: string, commit: { hash: string; message?: string }): Card {
    const c = this.need(ref);
    const hash = commit.hash.trim();
    if (!/^[0-9a-f]{7,40}$/i.test(hash)) throw new Error(`not a commit hash: ${hash}`);
    const list = c.commits ?? [];
    if (!list.some((x) => x.hash.startsWith(hash) || hash.startsWith(x.hash))) list.push({ hash, message: commit.message ?? "", at: Date.now() });
    return this.update(c.id, { commits: list });
  }
  /** Find commits whose message starts with the card key and link them. Returns the number of new links. */
  async syncCommits(ref: string): Promise<number> {
    const c = this.need(ref);
    if (!c.key) return 0;
    const cwd = this.cwdOf(c);
    if (!(await this.gitDir(cwd))) return 0;
    const r = await run("git", ["log", "--all", "-i", `--grep=^${c.key}\\b`, "--format=%H%x09%s"], cwd);
    if (r.code !== 0) return 0;
    const known = new Set((c.commits ?? []).map((x) => x.hash));
    let added = 0;
    for (const line of r.out.split("\n").filter(Boolean)) {
      const [hash, ...msg] = line.split("\t");
      if (!known.has(hash)) { this.linkCommit(c.id, { hash, message: msg.join("\t") }); added++; }
    }
    return added;
  }
  async beginGit(c: Card): Promise<void> {
    const cwd = this.cwdOf(c);
    const gd = await this.gitDir(cwd);
    if (!gd) return;
    const head = (await run("git", ["rev-parse", "HEAD"], cwd)).out;
    const stash = (await run("git", ["stash", "create"], cwd)).out; // snapshot of uncommitted work; leaves the tree alone
    const branch = (await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd)).out;
    this.update(c.id, { branch, checkpoint: { head, ...(stash ? { stash } : {}), at: Date.now() } });
    if (this.cfg.enforce_commit_keys && c.key) {
      try {
        // --git-path: inside a worktree the hooks live in the main repository's hooks folder, not the worktree's git dir
        const hooksDir = resolve(cwd, (await run("git", ["rev-parse", "--git-path", "hooks"], cwd)).out.split("\n")[0] || join(gd, "hooks"));
        const hookPath = join(hooksDir, "commit-msg");
        const existing = existsSync(hookPath) ? readFileSync(hookPath, "utf8") : "";
        if (!existing || existing.includes(HOOK_MARK)) { mkdirSync(hooksDir, { recursive: true }); writeFileSync(hookPath, HOOK); chmodSync(hookPath, 0o755); writeFileSync(join(gd, "stitap-card"), c.key); }
      } catch (e) { log.warn(`kanban: could not install commit hook: ${errMsg(e)}`); }
    }
  }
  /** Null when the card's work is in git under its key; otherwise what is missing. Cards outside a git repo are not checked. */
  private async uncommitted(c: Card): Promise<string | null> {
    if (!this.cfg.enforce_commit_keys || !c.key || c.type === "epic") return null;
    const cwd = this.cwdOf(c);
    if (!(await this.gitDir(cwd))) return null;
    await this.syncCommits(c.id).catch(() => 0);
    const problems: string[] = [];
    if (!this.need(c.id).commits?.length) problems.push(`no commit message starts with ${c.key}. Commit the work as "${c.key}: …". If the files were already complete before this ticket, record that with: git commit --allow-empty -m "${c.key}: already done by <KEY>"`);
    if (c.files?.length) {
      const r = await run("git", ["status", "--porcelain", "--", ...c.files], cwd);
      const dirty = r.code === 0 ? r.out.split("\n").filter(Boolean).map((l) => l.replace(/^\s*\S+\s+/, "")) : [];
      if (dirty.length) problems.push(`not committed (new or modified): ${dirty.join(", ")}`);
    }
    return problems.length ? `Work not committed:\n- ${problems.join("\n- ")}` : null;
  }
  async endGit(c: Card): Promise<void> {
    const gd = await this.gitDir(this.cwdOf(c));
    if (gd) { try { rmSync(join(gd, "stitap-card"), { force: true }); } catch { /* ignore */ } }
    await this.syncCommits(c.id).catch(() => 0);
  }

  // ── tests ─────────────────────────────────────────────────────
  private missingTestFiles(c: Card): string[] {
    if (!c.test_cmd || c.kind === "tests" || c.writes_tests) return [];   // the card that WRITES the tests may not need them to exist yet
    const cwd = this.cwdOf(c);
    return [...c.test_cmd.matchAll(/(?:^|\s)((?:\.\/)?tests?\/[\w./-]+\.(?:m?js|ts))\b/g)].map((m) => m[1]).filter((p) => !existsSync(join(cwd, p)));
  }
  /** Run the card's test command. The result is stored on the card. */
  async runTests(ref: string): Promise<TestResult> {
    const c = this.need(ref);
    if (!c.test_cmd) throw new Error(`${c.key ?? c.id} has no test_cmd`);
    const r = await run("/bin/sh", ["-c", c.test_cmd], this.cwdOf(c), (this.cfg.test_timeout_s ?? 600) * 1000);
    const res: TestResult = { at: Date.now(), cmd: c.test_cmd, code: r.code, output: tail(r.out) };
    this.update(c.id, { test_result: res });
    return res;
  }
  /** Move a card to done only if its tests pass. */
  async complete(ref: string, by = "agent"): Promise<{ card: Card; passed: boolean; detail: string }> {
    let c = this.need(ref);
    const retry = () => (this.active.has(c.id) ? "running" : c.attempts >= (this.cfg.max_attempts ?? 5) ? "blocked" : "ready") as CardStatus;
    // the board order is the plan: a ticket is not done before the tickets it depends on
    const done = new Set(this.listAll("done").map((x) => x.id));
    const waiting = c.depends_on.filter((d) => !done.has(d)).map((d) => this.get(d)?.key ?? d);
    if (waiting.length) {
      this.comment(c.id, `Cannot be done yet: it depends on ${waiting.join(", ")}, which ${waiting.length === 1 ? "is" : "are"} not done.`, "system");
      return { card: c.status === "done" || c.status === "running" && !this.active.has(c.id) ? this.update(c.id, { status: "ready" }, { by: "system", reason: "dependencies not done" }) : c, passed: false, detail: `waiting on ${waiting.join(", ")}` };
    }
    // a worker whose session ended in an error did not finish, whatever is on disk
    if (by === "worker" && /^\s*Error\b/.test(c.result ?? "")) {
      this.comment(c.id, `The worker session ended with an error, so the work is not counted: ${(c.result ?? "").slice(0, 300)}`, "system");
      return { card: this.update(c.id, { status: retry() }, { by: "system", reason: "worker error" }), passed: false, detail: "worker session ended with an error" };
    }
    if (c.files?.length || (c.exports && Object.keys(c.exports).length)) {
      const bad = [...checkBuilt(this.cwdOf(c), c.files, c.exports), ...stubFiles(this.cwdOf(c), c.files)];
      if (bad.length) {
        this.comment(c.id, `Not built yet:\n- ${bad.join("\n- ")}`, "system");
        return { card: this.update(c.id, { status: retry() }, { by: "system", reason: "files or exports missing" }), passed: false, detail: `not built: ${bad.join("; ")}` };
      }
    }
    // the work must be in git under the ticket key: committed, nothing of it left untracked or modified
    const unsaved = await this.uncommitted(c);
    if (unsaved) {
      this.comment(c.id, unsaved, "system");
      return { card: this.update(c.id, { status: retry() }, { by: "system", reason: "work not committed" }), passed: false, detail: unsaved };
    }
    c = this.need(c.id);
    if (!c.test_cmd) return { card: this.update(c.id, { status: c.review ? "review" : "done" }, { by, reason: c.files?.length ? "files and exports present" : undefined }), passed: true, detail: c.files?.length ? "files and exports present" : "no test_cmd" };
    const missing = this.missingTestFiles(c);
    if (missing.length) {
      this.comment(c.id, `Cannot verify: test file(s) missing: ${missing.join(", ")}. Copy the reference tests into the project first.`, "system");
      return { card: this.update(c.id, { status: "blocked" }, { by: "system", reason: "test files missing" }), passed: false, detail: `missing ${missing.join(", ")}` };
    }
    const t = await this.runTests(c.id);
    if (t.code === 0) {
      if (this.cfg.verify !== false && this.wantsVerification(c)) {
        const v = await this.verify(c.id);
        if (!v.ok) {
          const bad = v.checks.filter((x) => !x.ok).map((x) => `✖ ${x.name}: ${x.detail}`).join("\n");
          this.comment(c.id, `Verification failed (evidence: ${v.evidenceDir}):\n${tail(bad, 2500)}`, "system");
          return { card: this.update(c.id, { status: this.active.has(c.id) ? "running" : c.attempts >= (this.cfg.max_attempts ?? 5) ? "blocked" : "ready" }, { by: "system", reason: "verification failed" }), passed: false, detail: "verification failed" };
        }
      }
      return { card: this.update(c.id, { status: c.review ? "review" : "done" }, { by, reason: this.cfg.verify !== false && this.wantsVerification(c) ? "tests and verification passed" : "tests passed" }), passed: true, detail: "tests passed" };
    }
    this.comment(c.id, `Tests failed (exit ${t.code}): \`${t.cmd}\`\n${tail(t.output, 1500)}`, "system");
    return { card: this.update(c.id, { status: this.active.has(c.id) ? "running" : c.attempts >= (this.cfg.max_attempts ?? 5) ? "blocked" : "ready" }, { by: "system", reason: "tests failed" }), passed: false, detail: `tests failed (exit ${t.code})` };
  }
  /** Browser verification runs at the phase gate (and for hand-made cards with a spec), not after every story of a phase. */
  private wantsVerification(c: Card): boolean { return c.kind === "gate" || (!c.kind && !!(c.spec || c.functional?.length)); }

  /** Full phase verification (built, unit, navigate, screenshots, functional, regression). Evidence is stored on the card. */
  async verify(ref: string) {
    const c = this.need(ref);
    const rep = await verifyCard(this, c.id);
    this.update(c.id, { verification: { at: Date.now(), ok: rep.ok, report: join(rep.evidenceDir, "report.md"), shots: rep.shots.length } }, { by: "system", reason: `verification ${rep.ok ? "passed" : "failed"}` });
    return rep;
  }
  /** Write tests/verify/<phase>.verify.test.mjs from the card's spec. */
  genTests(ref: string): string { return writeVerifyTest(this, ref); }

  /** Re-run tests for done cards; a failure reopens the card and files a linked bug. */
  async regression(ref?: string): Promise<string> {
    const cards = (ref ? [this.need(ref)] : this.list("done")).filter((c) => c.test_cmd && c.type !== "epic");
    const out: string[] = [];
    for (const c of cards) {
      if (c.status !== "done" && ref === undefined) continue;
      if (this.missingTestFiles(c).length) { out.push(`${c.key} skipped (test files missing)`); continue; }
      const t = await this.runTests(c.id);
      if (t.code === 0) { out.push(`${c.key} ok`); continue; }
      const dup = this.list().find((b) => b.type === "bug" && b.links?.includes(c.key!) && b.status !== "done");
      const bug = dup ?? this.create({ title: `Regression: ${c.title}`, type: "bug", parent: c.parent, links: [c.key!], priority: c.priority + 1, spec: c.spec, cwd: c.cwd, test_cmd: c.test_cmd,
        acceptance: [`\`${c.test_cmd}\` exits 0`], body: `Tests for ${c.key} now fail.\n\nCommand: ${c.test_cmd}\nExit code: ${t.code}\n\n${tail(t.output, 3000)}` });
      this.comment(c.id, `Regression: tests fail again (exit ${t.code}). Reopened; bug ${bug.key} filed.`, "system");
      this.update(c.id, { status: "ready", attempts: 0 }, { by: "system", reason: `regression, see ${bug.key}` });
      out.push(`${c.key} FAILED → reopened, bug ${bug.key}`);
    }
    return out.join("\n") || "No done cards with a test_cmd.";
  }

  // ── dispatch ──────────────────────────────────────────────────
  ready(): Card[] {
    const all = this.list();   // only the active board is worked
    const done = new Set(this.listAll("done").map((c) => c.id));   // ...but a dependency may be finished on any board
    return all.filter((c) => c.status === "ready" && c.type !== "epic" && !this.active.has(c.id) && c.depends_on.every((d) => done.has(d)));
  }

  /** Put cards that were left running by a crash or power cut back on the queue. */
  recover(): Card[] {
    const out: Card[] = [];
    for (const c of this.listAll("running")) {
      if (this.active.has(c.id)) continue;
      const exhausted = c.attempts >= (this.cfg.max_attempts ?? 3);
      this.comment(c.id, `Interrupted by a restart or crash (attempt ${c.attempts}). ${exhausted ? "Attempts exhausted; blocked." : "Re-queued; the next worker resumes from the commits and notes on this card."}`, "system");
      out.push(this.update(c.id, { status: exhausted ? "blocked" : "ready" }, { by: "system", reason: "interrupted" }));
    }
    return out;
  }

  /** "Stop" pressed by the user: no card is started until Resume/Dispatch. Survives a restart. */
  get paused(): boolean { return !!this.rt.db.getMeta("kanban_paused"); }
  setPaused(b: boolean) { this.rt.db.setMeta("kanban_paused", b); }
  private stopped = new Set<string>();
  /** Interrupt every running worker, put its card back on the queue (the attempt is not counted) and stop dispatching. */
  stopAll(): string[] {
    this.setPaused(true);
    const keys: string[] = [];
    for (const id of [...this.active]) {
      const c = this.get(id); if (!c) continue;
      this.stopped.add(id); keys.push(c.key ?? c.id);
      if (c.session_id) this.rt.interrupt(c.session_id, true);
    }
    return keys;
  }

  async tick(): Promise<number> {
    if (!this.cfg.enabled || this.paused) return 0;
    // finished cards that ran in a worktree are merged first, so the next cards start from their work
    for (const c of this.listAll("done").filter((x) => x.worktree)) await this.mergeCardWorktree(c.id).catch((e) => log.warn(`kanban worktree merge ${c.key}: ${errMsg(e)}`));
    const slots = Math.max(0, this.cfg.workers - this.active.size);
    const cards = this.ready().slice(0, slots);
    for (const c of cards) void this.work(c.id);
    return cards.length;
  }

  /** Each attempt must try something different, and from the second one on it must look things up on the web. */
  attemptPlan(n: number, max: number): string {
    const plans = [
      "Follow the specification line by line. Write the files, then run the definition-of-done command.",
      "Read the failure above (comments and previous result). Find the ROOT cause, do not patch the symptom. Use docs_lookup or web_search for any word or API you are unsure of, and read the result before you write code.",
      "Use a DIFFERENT approach from attempts 1 and 2. Work in the smallest steps: write ONE file, run the check, then the next. Search the web (web_search, then browser_navigate on an official page) for an example of exactly this task and follow its pattern.",
      "Search the web again, with different words than before (use the exact error text). Copy the structure of a working example from an official site (MDN, nodejs.org, w3.org, developer docs). Keep the code as plain as possible.",
      "LAST attempt. Throw away what does not work and rewrite the failing file from zero in the simplest possible way. If you still cannot finish, add a comment (kanban action=comment) that says exactly what is missing and why, so a person can step in.",
    ];
    const i = Math.min(Math.max(n, 1), plans.length) - 1;
    return `ATTEMPT ${n} of ${max}. ${plans[i]}${n > 1 ? "\nBefore coding, run at least one web lookup (docs_lookup or web_search) and note in your report which page you used." : ""}`;
  }

  /** A spec too long to read in one go (a whole design book): the worker searches it instead. */
  private specIsLarge(c: Card): boolean {
    try { return !!c.spec && statSync(join(this.cwdOf(c), c.spec)).size > 60_000; } catch { return false; }
  }
  private buildPrompt(c: Card): string {
    const deps = c.depends_on.map((d) => this.get(d)).filter(Boolean).map((d) => `- ${d!.key ?? d!.id} ${d!.title}: ${(d!.result ?? "").slice(0, 600)}`).join("\n");
    const parent = c.parent ? this.get(c.parent) : null;
    const thread = c.comments.map((x) => `- [${x.id ?? ""}]${x.reply_to ? ` (reply to ${x.reply_to})` : ""} ${x.by}: ${x.text}`).join("\n");
    const resumed = c.attempts > 1 || (c.commits?.length ?? 0) > 0;
    const parts = [
      `Kanban card ${c.key ?? c.id} (${c.type ?? "task"}): ${c.title}`,
      parent ? `Epic: ${parent.key} ${parent.title}` : "",
      c.body,
      c.spec ? (this.specIsLarge(c) ? `Specification file: ${c.spec}. It is long: do not read all of it. Search it (search_files or grep) for the names and headings this card mentions, read those parts, and follow its file names, names and choices exactly.` : `Specification file: ${c.spec} (read it fully before writing code; follow its file names, export names and structure exactly).`) : "",
      c.section ? `Your part of the spec: section "${c.section}". Do ONLY this section; other sections are separate cards.` : "",
      c.files?.length ? `Files this card must leave in place: ${c.files.join(", ")}${c.exports && Object.keys(c.exports).length ? `. Required exports: ${Object.entries(c.exports).map(([f, n]) => `${f} → ${n.join(", ")}`).join("; ")}` : ""}.` : "",
      c.acceptance?.length ? `Acceptance criteria:\n${c.acceptance.map((a) => `- ${a}`).join("\n")}` : "",
      c.test_cmd ? (c.writes_tests ? `Definition of done: \`${c.test_cmd}\` must exit 0. This card writes those tests itself: make them check the acceptance criteria and test cases above with real assertions (no placeholders), then make the code pass them. Never weaken a test to make it pass, and never edit tests that belong to other cards.` : `Definition of done: \`${c.test_cmd}\` must exit 0. Run it yourself and fix your code until it does. The tests are provided: never write, edit or delete files under tests/.`) : "",
      c.key ? `Git: commit your work as you go; every commit message must start with "${c.key}" (for example "${c.key}: add cart view"). The card is NOT done while its files are uncommitted or no commit carries ${c.key}. If the work was already complete before this card, say so in a commit: git commit --allow-empty -m "${c.key}: already done by <KEY>".` : "",
      c.spec ? `The specification is read-only for you. If it is wrong or unclear, comment on this card; never edit ${c.spec} or other docs/phase-*.md files.` : "",
      deps ? `Results of prerequisite cards:\n${deps}` : "",
      resumed ? `This is a resumed card (attempt ${c.attempts}). Do not start over: run "git log --oneline" and "git status", read the comments below and the previous result, and continue from where the work stopped.\nPrevious result:\n${c.result ?? "(none)"}${c.commits?.length ? `\nCommits so far:\n${c.commits.map((x) => `- ${x.hash.slice(0, 8)} ${x.message}`).join("\n")}` : ""}` : "",
      thread ? `Comments:\n${thread}` : "",
      this.attemptPlan(c.attempts, this.cfg.max_attempts ?? 5),
      "Complete this card. Finish with a short report of what you did and the evidence (test output).",
    ];
    return parts.filter(Boolean).join("\n\n");
  }

  async work(ref: string): Promise<Card> {
    let c = this.need(ref);
    if (c.type === "epic") return c;
    const missing = this.missingTestFiles(c);
    if (missing.length) {
      this.comment(c.id, `Not started: test file(s) missing: ${missing.join(", ")}. Copy the reference tests into the project first.`, "system");
      return this.update(c.id, { status: "blocked" }, { by: "system", reason: "test files missing" });
    }
    this.active.add(c.id);
    c = this.update(c.id, { status: "running", attempts: c.attempts + 1 }, { by: "worker" });
    this.comment(c.id, `Attempt ${c.attempts} of ${this.cfg.max_attempts ?? 5} started. ${this.attemptPlan(c.attempts, this.cfg.max_attempts ?? 5).replace(/^ATTEMPT \d+ of \d+\. /, "")}`, "system");
    try {
      if (this.cfg.worktrees && !c.worktree) await this.openCardWorktree(c);
      c = this.need(c.id);
      await this.beginGit(c);
      c = this.need(c.id);
      const r = await this.rt.runHeadless({ prompt: this.buildPrompt(c), source: "kanban", title: `kanban: ${c.key ?? ""} ${c.title}`.trim(), goal: `${c.title}\n${c.body}`, cwd: this.cwdOf(c), onSession: (sid) => { c = this.update(c.id, { session_id: sid }, { by: "worker" }); }, approvalMode: this.rt.cfg.data.cron.approval_mode, ...(this.cfg.worker_tier && this.cfg.worker_tier !== "auto" ? { tier: this.cfg.worker_tier } : {}), ...(c.kind && this.cfg.tier_by_kind?.[c.kind] ? { prefer: this.cfg.tier_by_kind[c.kind] } : {}) });
      c = this.update(c.id, { session_id: r.sessionId, result: r.final.slice(0, 8000) }, { by: "worker" });
      await this.endGit(c);
      if (this.stopped.delete(c.id)) {
        this.comment(c.id, `Stopped by the user during attempt ${c.attempts}. The attempt is not counted; Resume continues from the commits and notes on this card.`, "system");
        c = this.update(c.id, { status: "ready", attempts: Math.max(0, c.attempts - 1) }, { by: "system", reason: "stopped by user" });
        return c;
      }
      const judged = r.goal?.status === "done";
      if (c.test_cmd || c.files?.length || (c.exports && Object.keys(c.exports).length)) {
        // the tests and file checks, not the judge model, decide
        this.active.delete(c.id);   // the worker is finished: a failed check must queue the card again, not leave it "running"
        const v = await this.complete(c.id, "worker");
        if (!v.passed) this.comment(c.id, `Worker finished (judge: ${judged ? "done" : r.goal?.last_reason ?? "not done"}) but ${v.detail}.`, "worker");
        c = v.card;
      } else if (judged) {
        c = this.update(c.id, { status: c.review ? "review" : "done" }, { by: "worker", reason: "goal judged done" });
      } else {
        this.comment(c.id, `Worker stopped: ${r.goal?.last_reason ?? r.error ?? "not completed"}`, "worker");
        c = this.update(c.id, { status: "blocked" }, { by: "worker", reason: "goal not completed" });
      }
    } catch (e) {
      log.error(`kanban card ${c.id} failed: ${errMsg(e)}`);
      this.comment(c.id, `Worker error: ${errMsg(e)}`, "worker");
      c = this.update(c.id, { status: "blocked" }, { by: "worker", reason: "worker error" });
      await this.endGit(c).catch(() => undefined);
    } finally {
      this.active.delete(c.id);
    }
    if (c.status === "done" && c.worktree) { await this.mergeCardWorktree(c.id).catch((e) => log.warn(`kanban worktree merge: ${errMsg(e)}`)); c = this.need(c.id); }
    await this.rt.deliver("log", `Kanban ${c.key ?? c.id} "${c.title}" → ${c.status}`).catch(() => undefined);
    return c;
  }

  /**
   * kanban.worktrees: the card's worker gets its own git worktree on branch kanban/<KEY>, so several workers never edit
   * the same checkout. Skipped (the card runs in the main checkout) when the checkout has uncommitted changes: the
   * worktree would not contain them, e.g. reference tests copied in but not committed.
   */
  private async openCardWorktree(c: Card): Promise<void> {
    const base = this.cwdOf({ ...c, worktree: undefined });
    if (!(await this.gitDir(base))) return;
    const dirty = (await run("git", ["status", "--porcelain", "--untracked-files=normal"], base)).out.split("\n").filter((l) => l && !l.includes(".stitap-worktrees"));
    if (dirty.length) { this.comment(c.id, `Worktree skipped: the main checkout has ${dirty.length} uncommitted change(s) (${dirty.slice(0, 3).join(", ")}), which a worktree would not contain. Commit them to run cards in worktrees. This attempt runs in the main checkout.`, "system"); return; }
    try {
      const w = await createWorktree(base, c.key ?? c.id, "kanban/");
      this.update(c.id, { worktree: { path: w.path, branch: w.branch, root: w.root, base: w.base, cwd: w.cwd } }, { by: "system" });
      this.comment(c.id, `Working in worktree ${w.path} on branch ${w.branch} (from ${w.base}); it is merged into ${w.base} when the card is done.`, "system");
    } catch (e) { this.comment(c.id, `Worktree not created (${errMsg(e)}); running in the main checkout.`, "system"); }
  }

  /** Merge a done card's worktree branch into the branch it came from, then remove the worktree. Conflicts → review. */
  async mergeCardWorktree(ref: string): Promise<void> {
    const c = this.need(ref);
    const w = c.worktree;
    if (!w) return;
    const ch = await worktreeChanges(w);
    try {
      if (ch.dirty.length) throw new Error(`the worktree has uncommitted changes: ${ch.dirty.slice(0, 5).join(", ")}`);
      const cur = (await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], w.root)).out;
      if (cur !== w.base) throw new Error(`the main checkout is on ${cur}, not ${w.base}`);
      if (ch.ahead) await mergeWorktree(w, `${c.key ?? c.id}: merge ${w.branch}`);
      await removeWorktree(w, { deleteBranch: true, force: !ch.ahead });
      this.update(c.id, { worktree: undefined }, { by: "system" });
      this.comment(c.id, ch.ahead ? `Merged ${ch.ahead} commit(s) from ${w.branch} into ${w.base}; worktree removed.` : "Worktree removed (no commits to merge).", "system");
      await this.syncCommits(c.id).catch(() => 0);
    } catch (e) {
      this.comment(c.id, `Could not merge ${w.branch} into ${w.base}: ${errMsg(e)}. The worktree stays at ${w.path}; resolve it, then run /kanban merge ${c.key ?? c.id}`, "system");
      this.update(c.id, { status: "review" }, { by: "system", reason: "worktree merge failed" });
    }
  }

  // ── views ─────────────────────────────────────────────────────
  fmt(c: Card): string {
    return `${c.key ?? c.id} [${c.status}] ${c.type && c.type !== "task" ? `(${c.type}) ` : ""}p${c.priority} ${c.title}${c.depends_on.length ? ` (after ${c.depends_on.map((d) => this.get(d)?.key ?? d).join(",")})` : ""}`;
  }
  show(ref: string): string {
    const c = this.get(ref);
    if (!c) return `no card ${ref}`;
    const lines = [this.fmt(c), c.parent ? `Epic: ${c.parent}` : "", c.links?.length ? `Links: ${c.links.join(", ")}` : "", c.spec ? `Spec: ${c.spec}` : "", c.test_cmd ? `Test: ${c.test_cmd}` : "",
      c.branch ? `Branch: ${c.branch}` : "", c.attempts ? `Attempts: ${c.attempts}`: "", "", c.body,
      c.acceptance?.length ? `\nAcceptance:\n${c.acceptance.map((a) => `- ${a}`).join("\n")}` : "",
      c.verification ? `\nVerification: ${c.verification.ok ? "PASS" : "FAIL"} (${c.verification.shots} screenshot(s)) — ${c.verification.report}` : "",
      c.test_result ? `\nLast test run: exit ${c.test_result.code} at ${new Date(c.test_result.at).toISOString()}\n${tail(c.test_result.output, 800)}` : "",
      `\nCommits:\n${(c.commits ?? []).map((x) => `- ${x.hash.slice(0, 8)} ${x.message}`).join("\n") || "(none)"}`,
      `\nHistory:\n${(c.history ?? []).map((h) => `- ${new Date(h.at).toISOString()} ${h.from ?? "∅"} → ${h.to} by ${h.by}${h.reason ? ` (${h.reason})` : ""}`).join("\n") || "(none)"}`,
      `\nComments:\n${c.comments.map((x) => `- ${x.id ? `[${x.id}] ` : ""}${x.reply_to ? `↳ ${x.reply_to} ` : ""}${x.by}: ${x.text}`).join("\n") || "(none)"}`,
      `\nResult:\n${c.result ?? "(none)"}`];
    return lines.filter((l, i) => l !== "" || i > 0).join("\n");
  }
  /** One line per board: name, progress, active/archived. */
  describeBoards(): string {
    const l = this.boards.list({ archived: "all" });
    return l.map((b) => `${b.active ? "▶" : " "} ${b.name}${b.archived ? " (archived)" : ""}${b.draft ? " (draft)" : ""} — ${b.done}/${b.cards} tickets done${b.project ? ` — project ${b.project}` : ""}${b.description ? ` — ${b.description}` : ""}`).join("\n") || "No boards.";
  }
  board(): string {
    const order: CardStatus[] = ["running", "ready", "blocked", "review", "backlog", "done"];
    const all = this.list();
    const act = this.boards.active(), proj = act.project ? ` (project ${act.project})` : "";
    if (!all.length) return `Board "${act.name}"${proj} is empty.`;
    return `Board: ${act.name}${proj}\n` + order.map((s) => { const l = all.filter((c) => c.status === s); return l.length ? `## ${s} (${l.length})\n${l.map((c) => `  ${this.fmt(c)}`).join("\n")}` : ""; }).filter(Boolean).join("\n");
  }
  report(): string {
    const all = this.list();
    const cnt = (s: CardStatus) => all.filter((c) => c.status === s && c.type !== "epic").length;
    const lines = [`Cards: ${all.filter((c) => c.type !== "epic").length} · done ${cnt("done")} · running ${cnt("running")} · ready ${cnt("ready")} · blocked ${cnt("blocked")} · review ${cnt("review")}`];
    for (const c of all.filter((x) => x.type !== "epic" && ["done", "blocked", "running"].includes(x.status))) {
      const t = c.test_result ? (c.test_result.code === 0 ? "tests pass" : `tests FAIL(${c.test_result.code})`) : "no tests run";
      lines.push(`${c.key ?? c.id} [${c.status}] ${c.title} — ${t} — commits: ${(c.commits ?? []).map((x) => x.hash.slice(0, 7)).join(" ") || "none"}`);
    }
    return lines.join("\n");
  }
}

export const kanbanTool: Tool = {
  name: "kanban", toolset: "kanban", tier: "standard",
  description: "Project tracker (kanban tool call, not a shell command): plan, track and verify multi-task projects. Cards have keys (PT-12), types (epic/task/bug), acceptance criteria, a test_cmd that must pass before done, threaded comments, status history and linked git commits. Actions: create, list, show, update (status done runs the tests first), comment (reply_to for threads), dispatch, resume (re-queue interrupted cards), link_commit, sync (find commits by key), test (run just the card's test_cmd), verify (full check: files+exports built, unit tests, pages load, screenshots saved, functional steps, earlier cards and pages not broken; evidence in .stitap/evidence/KEY), gentests (write tests/verify/<phase>.verify.test.mjs from the spec), regression (re-test done cards, reopen failures and file bugs), board, report, enrich (look up the technical words in the tickets on official sites and add short REFERENCE NOTES with links), import (ONLY when the user literally asks to import: turn a plan folder of phase-NN.md specs into epics and tasks without research; the tickets land in backlog as a draft for review). WRITING A TICKET BY HAND: one focus per ticket; plain short sentences; in the body list WHAT TO BUILD, FILES, NAMES, STEPS, what each part must do, and TEST CASES (a normal case and an edge case for every function); put the files in acceptance so they can be checked. DESIGN TO BOARD — the default whenever the user asks to plan, create, build or start a kanban/Jira board FROM design documents, a design folder, an idea or a spec (even a folder of phase-NN.md files): call design, not import, and do not read the documents yourself first. design (path = a design document: file, folder or URL; project = folder the work happens in: a NEW folder unless the user names one; board = a NEW board name unless the user names one) reads the document, researches it on the web (pages, PDFs, follow-up searches), downloads and judges free GitHub repos that already do the same, and builds a DRAFT board (main features MF010, their stories US0101 …, each story checked and flagged when it needs a person) whose tickets wait in backlog; it runs in the background, follow it with design_status, stop it with design_stop. approve (board, optional keys) moves reviewed draft tickets to ready and makes the board active. Only approve when the user has asked you to run the stories. PROJECTS, FOLDERS AND BOARDS (create, show, update, delete for each): a PROJECT groups boards and named working folders (one ★ primary). projects lists them; project_new (project_name, folder_path = main folder, folder = its short name, default code); project_show; project_update (new_name, description); project_use switches to a project (opens its board; the workers serve the active board); project_archive / project_unarchive (with its boards); project_delete (confirm=true; boards kept unless delete_boards=true). folder_add (folder = short name like docs or api, folder_path, primary); folder_update (new_name, folder_path, primary); folder_remove (files on disk stay). A ticket runs in: its cwd, else its project folder (create/update with folder=docs), else its board's folder, else the project's primary folder. Boards: boards; board_show; board_new (name, description, project = folder, project_name); board_update (new_name, description, project = folder, project_name = move it into a project, \"\" takes it out); board_project; board_use; board_archive / board_unarchive; board_save / board_restore; board_clear removes every ticket of ONE board, board_delete removes the board too (both need confirm=true and save a snapshot that board_restore brings back). Tickets: create, list, show, update (also folder, cwd, parent), delete (confirm=true; an epic takes its tickets), move between boards. You CAN do all of these: when the user asks to create, change, clear, reset, start fresh, archive or delete a project, folder, board or ticket, do not refuse and do not touch git or files instead; name what you will act on, call the action (for confirm=true actions call once without it, tell the user what will go, and call again with confirm=true once they agree or if they already said so plainly). Files on disk are never deleted by these actions.",
  parameters: obj({
    action: enm(["create", "list", "show", "update", "comment", "dispatch", "resume", "link_commit", "sync", "test", "verify", "gentests", "regression", "board", "report", "import", "boards", "board_new", "board_project", "board_update", "board_show", "board_use", "board_rename", "board_archive", "board_unarchive", "board_clear", "board_delete", "board_save", "board_restore", "move", "link", "unlink", "enrich", "design", "design_status", "design_stop", "approve", "delete", "projects", "project_new", "project_show", "project_update", "project_use", "project_archive", "project_unarchive", "project_delete", "folder_add", "folder_update", "folder_remove"], "operation"),
    id: str("card id or key (PT-12)"),
    title: str("card title"),
    body: str("details / acceptance criteria"),
    status: enm(["backlog", "ready", "running", "review", "blocked", "done"], "status"),
    priority: int("higher runs first"),
    depends_on: arr(str("card id or key"), "cards that must be done first"),
    review: bool("require human review before done"),
    text: str("comment text"),
    reply_to: str("comment id to reply to"),
    type: enm(["epic", "task", "bug"], "card type"),
    parent: str("epic key"),
    acceptance: arr(str("criterion"), "acceptance criteria"),
    test_cmd: str("shell command that must exit 0 before the card can be done"),
    spec: str("path of the specification file for this card"),
    functional: arr({ type: "object", additionalProperties: true }, "browser steps (webtest step format) run during verify; use {{base}} in goto urls"),
    cwd: str("project directory the card is worked in"),
    hash: str("git commit hash"),
    message: str("commit message"),
    path: str("import: folder holding phase-NN.md files"),
    project: str("import/design: project folder the docs and tests are copied into and the cards run in; board_new/board_project: the board's project folder (\"\" in board_project removes it)"),
    tests: str("import: folder of reference tests to copy into <project>/tests"),
    key_prefix: str("import/create: key prefix, default from config"),
    board: str("import: name of the board to fill (created if missing, then made active); board_*: the board concerned (default: the active board)"),
    name: str("board_new / board_restore: the board's name"),
    new_name: str("board_rename: the new name"),
    to: str("move: destination board; link/unlink: the ticket to link to (any board, may not exist yet)"),
    link_type: str("link: relates to | blocks | is blocked by | duplicates | clones"),
    keys: arr(str("ticket key"), "move: tickets to move (an epic takes its tickets along)"),
    file: str("board_save / board_restore: a JSON file path (default: the harness home)"),
    confirm: bool("board_clear / board_delete / project_delete / delete: must be true. Boards are snapshotted first so it can be undone with board_restore"),
    project_name: str("project_*: the project (name or id; default: the active project); project_new: its name; board_new / board_update: the project the board belongs to (\"\" in board_update takes it out)"),
    description: str("project_new / project_update / board_new / board_update: description"),
    folder: str("folder_*: the working folder's short name (code, docs, api …); create/update: the project folder the ticket is worked in"),
    folder_path: str("project_new: the main folder; folder_add / folder_update: the folder on disk"),
    primary: bool("folder_add / folder_update: make it the project's main folder"),
    delete_boards: bool("project_delete: also delete the project's boards (snapshots first); default keeps them, unassigned"),
  }, ["action"]),
  async handler(a, ctx) {
    const K = ctx.rt.kanban;
    const by = "agent";
    const projRef = () => { const r = String(a.project_name ?? "").trim() || K.projects.active()?.id; if (!r) throw new Error("name the project (project_name); the active board is not in a project"); return r; };
    switch (a.action) {
      case "create": return `Created ${K.fmt(K.create({ title: String(a.title ?? "untitled"), body: a.body, priority: a.priority, depends_on: a.depends_on, status: a.status, review: a.review, type: a.type, parent: a.parent, acceptance: a.acceptance, test_cmd: a.test_cmd, spec: a.spec, cwd: a.cwd, functional: a.functional, key_prefix: a.key_prefix, folder: a.folder }))}`;
      case "list": { const l = K.list(a.status); return l.length ? l.map((c) => K.fmt(c)).join("\n") : "Board is empty."; }
      case "show": return K.show(a.id);
      case "update": {
        const patch: Partial<Card> = { ...(a.title ? { title: a.title } : {}), ...(a.body ? { body: a.body } : {}), ...(a.priority !== undefined ? { priority: a.priority } : {}), ...(a.depends_on ? { depends_on: a.depends_on.map((d: string) => K.get(d)?.id ?? d) } : {}),
          ...(a.acceptance ? { acceptance: a.acceptance } : {}), ...(a.test_cmd ? { test_cmd: a.test_cmd } : {}), ...(a.spec ? { spec: a.spec } : {}), ...(a.type ? { type: a.type } : {}), ...(a.functional ? { functional: a.functional } : {}),
          ...(a.folder !== undefined ? { folder: a.folder ? K.projects.checkFolder(K.get(a.id)?.board, a.folder) : undefined } : {}), ...(a.cwd !== undefined ? { cwd: a.cwd || undefined } : {}), ...(a.parent ? { parent: a.parent } : {}) };
        if (a.status === "done") { const v = await K.complete(a.id, by); return `${K.fmt(v.card)} — ${v.detail}`; }
        if (a.status) patch.status = a.status;
        return K.fmt(K.update(a.id, patch, { by }));
      }
      case "comment": return K.fmt(K.comment(a.id, String(a.text ?? ""), by, a.reply_to));
      case "dispatch": { K.setPaused(false); const n = await K.tick(); return `Dispatched ${n} card(s) to workers.`; }
      case "resume": { K.setPaused(false); const r = K.recover(); const n = await K.tick(); return `Re-queued ${r.length} interrupted card(s); dispatched ${n}.`; }
      case "link_commit": return K.fmt(K.linkCommit(a.id, { hash: String(a.hash ?? ""), message: a.message }));
      case "sync": return `Linked ${await K.syncCommits(a.id)} new commit(s).`;
      case "test": { const t = await K.runTests(a.id); return `exit ${t.code}\n${t.output}`; }
      case "verify": return (await K.verify(a.id)).markdown;
      case "gentests": return `Wrote ${K.genTests(a.id)}`;
      case "regression": return K.regression(a.id);
      case "board": return K.board();
      case "report": return K.report();
      case "import": {
        if (!a.path) return "import needs path (folder with phase-NN.md files)";
        return importPlan(K, { planDir: String(a.path), projectDir: a.project, testsDir: a.tests, keyPrefix: a.key_prefix, board: a.board });
      }
      case "design": {
        if (!a.path) return "design needs path (the design document: a file, a folder or an http(s) URL) and project (the folder the work happens in)";
        const project = String(a.project ?? ctx.cwd);
        const job = startDesignJob(ctx.rt, { source: String(a.path), project, board: a.board });
        return `Started design run ${job.id}: reading ${job.source}, researching it on the web and planning stories for ${project}. It takes a while; check it with kanban action=design_status. The board it makes is a DRAFT: nothing runs until the user reviews and approves it.`;
      }
      case "design_status": return describeJob(designJob(ctx.rt, a.id));
      case "design_stop": return stopDesignJob(a.id) ? "Stopping the design run." : "No design run is going.";
      case "approve": {
        const r = K.boards.approve(String(a.board ?? K.boards.active().name), { keys: a.keys });
        return r.approved.length ? `Approved ${r.approved.length} ticket(s) on "${r.board.name}" (${r.approved.slice(0, 12).join(", ")}${r.approved.length > 12 ? " …" : ""}); it is the active board now. Use kanban action=dispatch to start the workers.` : `Nothing to approve on "${r.board.name}" (no backlog tickets${a.keys?.length ? " with those keys" : ""}).`;
      }
      case "enrich": return describeEnrich(await enrichBoard(ctx.rt, { board: a.board, signal: ctx.signal, onProgress: ctx.progress }));
      case "boards": return K.describeBoards();
      case "delete": {
        const c = K.get(String(a.id ?? "")); if (!c) return `no ticket ${a.id}`;
        if (K.isActive(c.id)) return `${c.key} is being worked on right now; stop the workers first`;
        const kids = c.type === "epic" ? K.listAll().filter((x) => x.parent === c.key) : [];
        if (a.confirm !== true) return `This deletes ${c.key} "${c.title}"${kids.length ? ` and its ${kids.length} ticket(s)` : ""} for good (links and dependencies on it are removed). Call again with confirm=true.`;
        for (const k of kids) K.removeCard(k.id);
        K.removeCard(c.id); return `Deleted ${c.key}${kids.length ? ` and ${kids.length} ticket(s) under it` : ""}.`;
      }
      case "projects": return K.projects.describe();
      case "project_new": {
        const p = K.projects.create(String(a.project_name ?? a.name ?? ""), { description: a.description ?? a.body, folders: a.folder_path ? [{ name: a.folder || "code", path: a.folder_path }] : [], boards: a.board ? [a.board] : [] });
        return `Created project "${p.name}"${p.folders.length ? ` (folder ${p.folders[0].name} = ${p.folders[0].path})` : ""}. project_use opens its board (one is made if it has none); folder_add adds more folders.`;
      }
      case "project_show": { const p = a.project_name ? K.projects.need(String(a.project_name)) : K.projects.active(); return p ? K.projects.show(p.id) : "The active board is not in a project. projects lists them."; }
      case "project_update": { const p = K.projects.update(projRef(), { name: a.new_name, description: a.description }); return `Updated project "${p.name}".`; }
      case "project_use": { const r = K.projects.use(String(a.project_name ?? a.name ?? "")); return `Active project: "${r.project.name}", board "${r.board.name}". Its tickets run in ${K.projects.primary(r.project)?.path ?? "the board's folder"}.`; }
      case "project_archive": return `Archived project "${K.projects.archive(projRef()).name}" and its boards (hidden; workers ignore them). Active board now: "${K.boards.active().name}".`;
      case "project_unarchive": return `Unarchived project "${K.projects.unarchive(projRef()).name}" and the boards it had archived.`;
      case "project_delete": {
        const p = K.projects.need(projRef());
        if (a.confirm !== true) return `This deletes project "${p.name}"${a.delete_boards ? " AND its boards (each snapshotted first)" : "; its boards stay, without a project"}. Files on disk are not touched. Call again with confirm=true.`;
        const r = K.projects.delete(p.id, { deleteBoards: !!a.delete_boards });
        return `Deleted project "${p.name}". ${a.delete_boards ? `Deleted boards: ${r.boards.join(", ") || "none"}. Snapshots: ${r.snapshots.join(", ") || "none"}` : `Its boards (${r.boards.join(", ") || "none"}) are kept without a project.`}`;
      }
      case "folder_add": { const p = K.projects.addFolder(projRef(), { name: String(a.folder ?? ""), path: String(a.folder_path ?? a.path ?? ""), primary: !!a.primary, note: a.description }); return `"${p.name}" folders: ${p.folders.map((f) => `${f.primary ? "★" : ""}${f.name}=${f.path}`).join(", ")}`; }
      case "folder_update": { const p = K.projects.updateFolder(projRef(), String(a.folder ?? ""), { path: a.folder_path, new_name: a.new_name, primary: a.primary, note: a.description }); return `"${p.name}" folders: ${p.folders.map((f) => `${f.primary ? "★" : ""}${f.name}=${f.path}`).join(", ")}`; }
      case "folder_remove": { const p = K.projects.removeFolder(projRef(), String(a.folder ?? "")); return `Removed folder ${a.folder} from "${p.name}" (nothing on disk was deleted).`; }
      case "board_update": {
        const b = K.boards.update(String(a.board ?? K.boards.active().name), { name: a.new_name, description: a.description, project: a.project, project_id: a.project_name });
        return K.boards.show(b.id);
      }
      case "board_show": return K.boards.show(String(a.board ?? K.boards.active().name));
      case "board_new": { const b0 = K.boards.create(String(a.name ?? a.board ?? ""), a.description ?? a.body, a.project); const b = a.project_name ? K.projects.attach(b0.id, String(a.project_name)) : b0; K.boards.use(b.id); return `Created board "${b.name}"${b.project ? ` for project ${b.project}` : ""} and made it active. Import or create tickets now.`; }
      case "board_project": { if (a.project === undefined) return "board_project needs project (a folder, or \"\" to remove it)"; const b = K.boards.setProject(String(a.board ?? K.boards.active().name), String(a.project)); return b.project ? `"${b.name}" now works in ${b.project}${existsSync(b.project) ? "" : " (the folder does not exist yet)"}` : `"${b.name}" has no project folder now`; }
      case "board_use": return `Active board: "${K.boards.use(String(a.board ?? a.name ?? "")).name}"`;
      case "board_rename": return `Renamed to "${K.boards.rename(String(a.board ?? ""), String(a.new_name ?? "")).name}"`;
      case "board_archive": return `Archived "${K.boards.archive(String(a.board ?? K.boards.active().name)).name}" (hidden, workers ignore it; its tickets stay linkable). Active board now: "${K.boards.active().name}"`;
      case "board_unarchive": return `Unarchived "${K.boards.unarchive(String(a.board ?? "")).name}"`;
      case "board_save": return `Saved to ${K.boards.save(String(a.board ?? K.boards.active().name), a.file)}`;
      case "board_restore": return `Restored as board "${K.boards.restore(String(a.file ?? ""), a.name).name}" (not active yet: board_use to open it)`;
      case "board_clear": {
        if (a.confirm !== true) return `This removes every ticket of "${a.board ?? K.boards.active().name}". A snapshot is saved first. Call again with confirm=true to proceed.`;
        const r = K.boards.clear(String(a.board ?? K.boards.active().name)); return `Removed ${r.removed} ticket(s). Snapshot: ${r.snapshot} (board_restore file=… to undo).`;
      }
      case "board_delete": {
        if (a.confirm !== true) return `This deletes the board "${a.board}" and its tickets (snapshot first). Call again with confirm=true.`;
        const r = K.boards.delete(String(a.board ?? "")); return `Deleted the board; removed ${r.removed} ticket(s). Snapshot: ${r.snapshot}`;
      }
      case "move": return `Moved ${K.boards.move(a.keys ?? (a.id ? [a.id] : []), String(a.to ?? ""))} ticket(s) to "${K.boards.get(String(a.to))?.name}".`;
      case "link": { const r = K.boards.link(String(a.id ?? ""), String(a.link_type ?? "relates to"), String(a.to ?? "")); return `${K.get(a.id)?.key} ${r.type} ${r.key}${r.pending ? " (that ticket does not exist yet; the link activates when it is created)" : ""}`; }
      case "unlink": return `Removed ${K.boards.unlink(String(a.id ?? ""), String(a.to ?? ""), a.link_type)} link(s).`;
      default: return `unknown action ${a.action}`;
    }
  },
};

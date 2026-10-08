/**
 * Kanban board: a small Jira-style tracker. Cards have keys (PT-12), types (epic/task/bug), acceptance criteria,
 * a test command that gates "done", threaded comments, a status history and linked git commits. Cards are dispatched
 * to worker sessions in goal mode; interrupted cards (power cut, crash) are put back on the queue by recover().
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { shortId, errMsg } from "../util/misc.js";
import { log } from "../util/log.js";
import { obj, str, enm, arr, int, bool } from "../tools/types.js";
import { importPlan } from "./plan.js";
import { expandHome } from "../safety/paths.js";
import { verifyCard, writeVerifyTest, checkBuilt } from "./verify.js";
const HOOK_MARK = "# stitap-kanban-hook";
const HOOK = `#!/bin/sh
${HOOK_MARK}
# While a kanban card is active, every commit message must start with the card key.
f="$(git rev-parse --git-dir)/stitap-card"
[ -f "$f" ] || exit 0
key=$(cat "$f")
head -n 1 "$1" | grep -q "^$key" || { echo "stitaP: commit message must start with the active card key $key" >&2; exit 1; }
`;
function run(cmd, args, cwd, timeoutMs = 20_000) {
    return new Promise((res) => {
        execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1" } }, (err, stdout, stderr) => {
            res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout ?? ""}${stderr ?? ""}`.trim() });
        });
    });
}
const tail = (s, n = 4000) => (s.length > n ? `…${s.slice(-n)}` : s);
export class KanbanBoard {
    rt;
    active = new Set();
    constructor(rt) {
        this.rt = rt;
    }
    isActive(id) { return this.active.has(id); }
    get cfg() { return this.rt.cfg.data.kanban; }
    list(status) {
        return this.rt.db.listRecords("kanban").filter((c) => !status || c.status === status)
            .sort((a, b) => b.priority - a.priority || a.created_at - b.created_at);
    }
    /** Look a card up by id or by key (PT-12, case-insensitive). */
    get(ref) {
        if (!ref)
            return null;
        const direct = this.rt.db.getRecord("kanban", ref);
        if (direct)
            return direct;
        const k = ref.toUpperCase();
        return this.rt.db.listRecords("kanban").find((c) => c.key?.toUpperCase() === k) ?? null;
    }
    need(ref) { const c = this.get(ref); if (!c)
        throw new Error(`no card ${ref}`); return c; }
    save(c) { c.updated_at = Date.now(); this.rt.db.putRecord("kanban", c.id, c); this.rt.emitEvent("*", { type: "kanban", card: c }); }
    nextKey(prefix) {
        const re = new RegExp(`^${prefix}-(\\d+)$`);
        let max = 0;
        for (const c of this.rt.db.listRecords("kanban")) {
            const m = c.key?.match(re);
            if (m)
                max = Math.max(max, Number(m[1]));
        }
        return `${prefix}-${max + 1}`;
    }
    create(p) {
        const prefix = (p.key_prefix ?? this.cfg.project_key ?? "PT").toUpperCase();
        const now = Date.now();
        const status = p.status ?? (p.type === "epic" ? "backlog" : "ready");
        const parent = p.parent ? this.get(p.parent)?.key ?? p.parent : undefined;
        const c = { id: shortId("k_"), key: this.nextKey(prefix), type: p.type ?? "task", title: p.title, body: p.body ?? "", status, priority: p.priority ?? 0,
            depends_on: (p.depends_on ?? []).map((d) => this.get(d)?.id ?? d), review: !!p.review, comments: [], created_at: now, updated_at: now, attempts: 0,
            ...(parent ? { parent } : {}), ...(p.links?.length ? { links: p.links } : {}), ...(p.acceptance?.length ? { acceptance: p.acceptance } : {}),
            ...(p.test_cmd ? { test_cmd: p.test_cmd } : {}), ...(p.spec ? { spec: p.spec } : {}), ...(p.cwd ? { cwd: p.cwd } : {}), ...(p.functional?.length ? { functional: p.functional } : {}),
            ...(p.kind ? { kind: p.kind } : {}), ...(p.section ? { section: p.section } : {}), ...(p.files?.length ? { files: p.files } : {}), ...(p.exports && Object.keys(p.exports).length ? { exports: p.exports } : {}), ...(p.order !== undefined ? { order: p.order } : {}),
            history: [{ at: now, from: null, to: status, by: "user", reason: "created" }], commits: [] };
        this.save(c);
        this.rollup(c.parent);
        return c;
    }
    update(ref, patch, meta = {}) {
        const c = this.need(ref);
        const n = { ...c, ...patch };
        if (patch.status && patch.status !== c.status)
            n.history = [...(c.history ?? []), { at: Date.now(), from: c.status, to: patch.status, by: meta.by ?? "agent", ...(meta.reason ? { reason: meta.reason } : {}) }];
        this.save(n);
        this.rollup(n.parent);
        return n;
    }
    comment(ref, text, by = "agent", reply_to) {
        const c = this.need(ref);
        if (reply_to && !c.comments.some((x) => x.id === reply_to))
            throw new Error(`no comment ${reply_to} on ${c.key ?? c.id}`);
        c.comments.push({ id: shortId("c_"), at: Date.now(), by, text, ...(reply_to ? { reply_to } : {}) });
        this.save(c);
        return c;
    }
    /** Delete a card that has not been worked (used when a plan is re-imported in more detail). */
    remove(ref) {
        const c = this.get(ref);
        if (!c)
            return false;
        this.rt.db.deleteRecord("kanban", c.id);
        this.rt.emitEvent("*", { type: "kanban", card: { ...c, status: "removed" } });
        this.rollup(c.parent);
        return true;
    }
    /** An epic is running while any child runs/is ready, blocked if a child is, done when all children are done. */
    rollup(parentKey) {
        if (!parentKey)
            return;
        const epic = this.get(parentKey);
        if (!epic || epic.type !== "epic")
            return;
        const kids = this.rt.db.listRecords("kanban").filter((c) => c.parent === epic.key);
        if (!kids.length)
            return;
        const st = kids.every((k) => k.status === "done") ? "done" : kids.some((k) => k.status === "blocked") ? "blocked"
            : kids.some((k) => k.status === "running" || k.status === "review" || k.status === "done") ? "running" : "ready";
        if (st !== epic.status) {
            epic.history = [...(epic.history ?? []), { at: Date.now(), from: epic.status, to: st, by: "system", reason: "child cards changed" }];
            epic.status = st;
            this.save(epic);
        }
    }
    // ── git ───────────────────────────────────────────────────────
    cwdOf(c) {
        const base = expandHome(c.cwd || this.cfg.cwd || this.rt.defaultCwd());
        return isAbsolute(base) ? base : resolve(base);
    }
    async gitDir(cwd) {
        const r = await run("git", ["rev-parse", "--absolute-git-dir"], cwd);
        return r.code === 0 && r.out ? r.out.split("\n")[0] : null;
    }
    /** Record a commit on the card (idempotent on hash). */
    linkCommit(ref, commit) {
        const c = this.need(ref);
        const hash = commit.hash.trim();
        if (!/^[0-9a-f]{7,40}$/i.test(hash))
            throw new Error(`not a commit hash: ${hash}`);
        const list = c.commits ?? [];
        if (!list.some((x) => x.hash.startsWith(hash) || hash.startsWith(x.hash)))
            list.push({ hash, message: commit.message ?? "", at: Date.now() });
        return this.update(c.id, { commits: list });
    }
    /** Find commits whose message starts with the card key and link them. Returns the number of new links. */
    async syncCommits(ref) {
        const c = this.need(ref);
        if (!c.key)
            return 0;
        const cwd = this.cwdOf(c);
        if (!(await this.gitDir(cwd)))
            return 0;
        const r = await run("git", ["log", "--all", "-i", `--grep=^${c.key}\\b`, "--format=%H%x09%s"], cwd);
        if (r.code !== 0)
            return 0;
        const known = new Set((c.commits ?? []).map((x) => x.hash));
        let added = 0;
        for (const line of r.out.split("\n").filter(Boolean)) {
            const [hash, ...msg] = line.split("\t");
            if (!known.has(hash)) {
                this.linkCommit(c.id, { hash, message: msg.join("\t") });
                added++;
            }
        }
        return added;
    }
    async beginGit(c) {
        const cwd = this.cwdOf(c);
        const gd = await this.gitDir(cwd);
        if (!gd)
            return;
        const head = (await run("git", ["rev-parse", "HEAD"], cwd)).out;
        const stash = (await run("git", ["stash", "create"], cwd)).out; // snapshot of uncommitted work; leaves the tree alone
        const branch = (await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd)).out;
        this.update(c.id, { branch, checkpoint: { head, ...(stash ? { stash } : {}), at: Date.now() } });
        if (this.cfg.enforce_commit_keys && c.key) {
            try {
                const hookPath = join(gd, "hooks", "commit-msg");
                const existing = existsSync(hookPath) ? readFileSync(hookPath, "utf8") : "";
                if (!existing || existing.includes(HOOK_MARK)) {
                    mkdirSync(join(gd, "hooks"), { recursive: true });
                    writeFileSync(hookPath, HOOK);
                    chmodSync(hookPath, 0o755);
                    writeFileSync(join(gd, "stitap-card"), c.key);
                }
            }
            catch (e) {
                log.warn(`kanban: could not install commit hook: ${errMsg(e)}`);
            }
        }
    }
    async endGit(c) {
        const gd = await this.gitDir(this.cwdOf(c));
        if (gd) {
            try {
                rmSync(join(gd, "stitap-card"), { force: true });
            }
            catch { /* ignore */ }
        }
        await this.syncCommits(c.id).catch(() => 0);
    }
    // ── tests ─────────────────────────────────────────────────────
    missingTestFiles(c) {
        if (!c.test_cmd || c.kind === "tests")
            return []; // the card that WRITES the tests may not need them to exist yet
        const cwd = this.cwdOf(c);
        return [...c.test_cmd.matchAll(/(?:^|\s)((?:\.\/)?tests?\/[\w./-]+\.(?:m?js|ts))\b/g)].map((m) => m[1]).filter((p) => !existsSync(join(cwd, p)));
    }
    /** Run the card's test command. The result is stored on the card. */
    async runTests(ref) {
        const c = this.need(ref);
        if (!c.test_cmd)
            throw new Error(`${c.key ?? c.id} has no test_cmd`);
        const r = await run("/bin/sh", ["-c", c.test_cmd], this.cwdOf(c), (this.cfg.test_timeout_s ?? 600) * 1000);
        const res = { at: Date.now(), cmd: c.test_cmd, code: r.code, output: tail(r.out) };
        this.update(c.id, { test_result: res });
        return res;
    }
    /** Move a card to done only if its tests pass. */
    async complete(ref, by = "agent") {
        const c = this.need(ref);
        if (c.files?.length || (c.exports && Object.keys(c.exports).length)) {
            const bad = checkBuilt(this.cwdOf(c), c.files, c.exports);
            if (bad.length) {
                this.comment(c.id, `Not built yet:\n- ${bad.join("\n- ")}`, "system");
                return { card: this.update(c.id, { status: c.attempts >= (this.cfg.max_attempts ?? 3) ? "blocked" : "ready" }, { by: "system", reason: "files or exports missing" }), passed: false, detail: `not built: ${bad.join("; ")}` };
            }
        }
        if (!c.test_cmd)
            return { card: this.update(c.id, { status: c.review ? "review" : "done" }, { by, reason: c.files?.length ? "files and exports present" : undefined }), passed: true, detail: c.files?.length ? "files and exports present" : "no test_cmd" };
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
                    return { card: this.update(c.id, { status: c.attempts >= (this.cfg.max_attempts ?? 3) ? "blocked" : "ready" }, { by: "system", reason: "verification failed" }), passed: false, detail: "verification failed" };
                }
            }
            return { card: this.update(c.id, { status: c.review ? "review" : "done" }, { by, reason: this.cfg.verify !== false && this.wantsVerification(c) ? "tests and verification passed" : "tests passed" }), passed: true, detail: "tests passed" };
        }
        this.comment(c.id, `Tests failed (exit ${t.code}): \`${t.cmd}\`\n${tail(t.output, 1500)}`, "system");
        return { card: this.update(c.id, { status: c.attempts >= (this.cfg.max_attempts ?? 3) ? "blocked" : "ready" }, { by: "system", reason: "tests failed" }), passed: false, detail: `tests failed (exit ${t.code})` };
    }
    /** Browser verification runs at the phase gate (and for hand-made cards with a spec), not after every story of a phase. */
    wantsVerification(c) { return c.kind === "gate" || (!c.kind && !!(c.spec || c.functional?.length)); }
    /** Full phase verification (built, unit, navigate, screenshots, functional, regression). Evidence is stored on the card. */
    async verify(ref) {
        const c = this.need(ref);
        const rep = await verifyCard(this, c.id);
        this.update(c.id, { verification: { at: Date.now(), ok: rep.ok, report: join(rep.evidenceDir, "report.md"), shots: rep.shots.length } }, { by: "system", reason: `verification ${rep.ok ? "passed" : "failed"}` });
        return rep;
    }
    /** Write tests/verify/<phase>.verify.test.mjs from the card's spec. */
    genTests(ref) { return writeVerifyTest(this, ref); }
    /** Re-run tests for done cards; a failure reopens the card and files a linked bug. */
    async regression(ref) {
        const cards = (ref ? [this.need(ref)] : this.list("done")).filter((c) => c.test_cmd && c.type !== "epic");
        const out = [];
        for (const c of cards) {
            if (c.status !== "done" && ref === undefined)
                continue;
            if (this.missingTestFiles(c).length) {
                out.push(`${c.key} skipped (test files missing)`);
                continue;
            }
            const t = await this.runTests(c.id);
            if (t.code === 0) {
                out.push(`${c.key} ok`);
                continue;
            }
            const dup = this.list().find((b) => b.type === "bug" && b.links?.includes(c.key) && b.status !== "done");
            const bug = dup ?? this.create({ title: `Regression: ${c.title}`, type: "bug", parent: c.parent, links: [c.key], priority: c.priority + 1, spec: c.spec, cwd: c.cwd, test_cmd: c.test_cmd,
                acceptance: [`\`${c.test_cmd}\` exits 0`], body: `Tests for ${c.key} now fail.\n\nCommand: ${c.test_cmd}\nExit code: ${t.code}\n\n${tail(t.output, 3000)}` });
            this.comment(c.id, `Regression: tests fail again (exit ${t.code}). Reopened; bug ${bug.key} filed.`, "system");
            this.update(c.id, { status: "ready", attempts: 0 }, { by: "system", reason: `regression, see ${bug.key}` });
            out.push(`${c.key} FAILED → reopened, bug ${bug.key}`);
        }
        return out.join("\n") || "No done cards with a test_cmd.";
    }
    // ── dispatch ──────────────────────────────────────────────────
    ready() {
        const all = this.list();
        const done = new Set(all.filter((c) => c.status === "done").map((c) => c.id));
        return all.filter((c) => c.status === "ready" && c.type !== "epic" && !this.active.has(c.id) && c.depends_on.every((d) => done.has(d)));
    }
    /** Put cards that were left running by a crash or power cut back on the queue. */
    recover() {
        const out = [];
        for (const c of this.list("running")) {
            if (this.active.has(c.id))
                continue;
            const exhausted = c.attempts >= (this.cfg.max_attempts ?? 3);
            this.comment(c.id, `Interrupted by a restart or crash (attempt ${c.attempts}). ${exhausted ? "Attempts exhausted; blocked." : "Re-queued; the next worker resumes from the commits and notes on this card."}`, "system");
            out.push(this.update(c.id, { status: exhausted ? "blocked" : "ready" }, { by: "system", reason: "interrupted" }));
        }
        return out;
    }
    async tick() {
        if (!this.cfg.enabled)
            return 0;
        const slots = Math.max(0, this.cfg.workers - this.active.size);
        const cards = this.ready().slice(0, slots);
        for (const c of cards)
            void this.work(c.id);
        return cards.length;
    }
    buildPrompt(c) {
        const deps = c.depends_on.map((d) => this.get(d)).filter(Boolean).map((d) => `- ${d.key ?? d.id} ${d.title}: ${(d.result ?? "").slice(0, 600)}`).join("\n");
        const parent = c.parent ? this.get(c.parent) : null;
        const thread = c.comments.map((x) => `- [${x.id ?? ""}]${x.reply_to ? ` (reply to ${x.reply_to})` : ""} ${x.by}: ${x.text}`).join("\n");
        const resumed = c.attempts > 1 || (c.commits?.length ?? 0) > 0;
        const parts = [
            `Kanban card ${c.key ?? c.id} (${c.type ?? "task"}): ${c.title}`,
            parent ? `Epic: ${parent.key} ${parent.title}` : "",
            c.body,
            c.spec ? `Specification file: ${c.spec} (read it fully before writing code; follow its file names, export names and structure exactly).` : "",
            c.section ? `Your part of the spec: section "${c.section}". Do ONLY this section; other sections are separate cards.` : "",
            c.files?.length ? `Files this card must leave in place: ${c.files.join(", ")}${c.exports && Object.keys(c.exports).length ? `. Required exports: ${Object.entries(c.exports).map(([f, n]) => `${f} → ${n.join(", ")}`).join("; ")}` : ""}.` : "",
            c.acceptance?.length ? `Acceptance criteria:\n${c.acceptance.map((a) => `- ${a}`).join("\n")}` : "",
            c.test_cmd ? `Definition of done: \`${c.test_cmd}\` must exit 0. Run it yourself and fix your code until it does. The tests are provided: never write, edit or delete files under tests/.` : "",
            c.key ? `Git: commit your work as you go; every commit message must start with "${c.key}" (for example "${c.key}: add cart view").` : "",
            deps ? `Results of prerequisite cards:\n${deps}` : "",
            resumed ? `This is a resumed card (attempt ${c.attempts}). Do not start over: run "git log --oneline" and "git status", read the comments below and the previous result, and continue from where the work stopped.\nPrevious result:\n${c.result ?? "(none)"}${c.commits?.length ? `\nCommits so far:\n${c.commits.map((x) => `- ${x.hash.slice(0, 8)} ${x.message}`).join("\n")}` : ""}` : "",
            thread ? `Comments:\n${thread}` : "",
            "Complete this card. Finish with a short report of what you did and the evidence (test output).",
        ];
        return parts.filter(Boolean).join("\n\n");
    }
    async work(ref) {
        let c = this.need(ref);
        if (c.type === "epic")
            return c;
        const missing = this.missingTestFiles(c);
        if (missing.length) {
            this.comment(c.id, `Not started: test file(s) missing: ${missing.join(", ")}. Copy the reference tests into the project first.`, "system");
            return this.update(c.id, { status: "blocked" }, { by: "system", reason: "test files missing" });
        }
        this.active.add(c.id);
        c = this.update(c.id, { status: "running", attempts: c.attempts + 1 }, { by: "worker" });
        try {
            await this.beginGit(c);
            c = this.need(c.id);
            const r = await this.rt.runHeadless({ prompt: this.buildPrompt(c), source: "kanban", title: `kanban: ${c.key ?? ""} ${c.title}`.trim(), goal: `${c.title}\n${c.body}`, cwd: this.cwdOf(c), approvalMode: this.rt.cfg.data.cron.approval_mode, ...(this.cfg.worker_tier && this.cfg.worker_tier !== "auto" ? { tier: this.cfg.worker_tier } : {}) });
            c = this.update(c.id, { session_id: r.sessionId, result: r.final.slice(0, 8000) }, { by: "worker" });
            await this.endGit(c);
            const judged = r.goal?.status === "done";
            if (c.test_cmd || c.files?.length || (c.exports && Object.keys(c.exports).length)) {
                // the tests and file checks, not the judge model, decide
                const v = await this.complete(c.id, "worker");
                if (!v.passed)
                    this.comment(c.id, `Worker finished (judge: ${judged ? "done" : r.goal?.last_reason ?? "not done"}) but ${v.detail}.`, "worker");
                c = v.card;
            }
            else if (judged) {
                c = this.update(c.id, { status: c.review ? "review" : "done" }, { by: "worker", reason: "goal judged done" });
            }
            else {
                this.comment(c.id, `Worker stopped: ${r.goal?.last_reason ?? r.error ?? "not completed"}`, "worker");
                c = this.update(c.id, { status: "blocked" }, { by: "worker", reason: "goal not completed" });
            }
        }
        catch (e) {
            log.error(`kanban card ${c.id} failed: ${errMsg(e)}`);
            this.comment(c.id, `Worker error: ${errMsg(e)}`, "worker");
            c = this.update(c.id, { status: "blocked" }, { by: "worker", reason: "worker error" });
            await this.endGit(c).catch(() => undefined);
        }
        finally {
            this.active.delete(c.id);
        }
        await this.rt.deliver("log", `Kanban ${c.key ?? c.id} "${c.title}" → ${c.status}`).catch(() => undefined);
        return c;
    }
    // ── views ─────────────────────────────────────────────────────
    fmt(c) {
        return `${c.key ?? c.id} [${c.status}] ${c.type && c.type !== "task" ? `(${c.type}) ` : ""}p${c.priority} ${c.title}${c.depends_on.length ? ` (after ${c.depends_on.map((d) => this.get(d)?.key ?? d).join(",")})` : ""}`;
    }
    show(ref) {
        const c = this.get(ref);
        if (!c)
            return `no card ${ref}`;
        const lines = [this.fmt(c), c.parent ? `Epic: ${c.parent}` : "", c.links?.length ? `Links: ${c.links.join(", ")}` : "", c.spec ? `Spec: ${c.spec}` : "", c.test_cmd ? `Test: ${c.test_cmd}` : "",
            c.branch ? `Branch: ${c.branch}` : "", c.attempts ? `Attempts: ${c.attempts}` : "", "", c.body,
            c.acceptance?.length ? `\nAcceptance:\n${c.acceptance.map((a) => `- ${a}`).join("\n")}` : "",
            c.verification ? `\nVerification: ${c.verification.ok ? "PASS" : "FAIL"} (${c.verification.shots} screenshot(s)) — ${c.verification.report}` : "",
            c.test_result ? `\nLast test run: exit ${c.test_result.code} at ${new Date(c.test_result.at).toISOString()}\n${tail(c.test_result.output, 800)}` : "",
            `\nCommits:\n${(c.commits ?? []).map((x) => `- ${x.hash.slice(0, 8)} ${x.message}`).join("\n") || "(none)"}`,
            `\nHistory:\n${(c.history ?? []).map((h) => `- ${new Date(h.at).toISOString()} ${h.from ?? "∅"} → ${h.to} by ${h.by}${h.reason ? ` (${h.reason})` : ""}`).join("\n") || "(none)"}`,
            `\nComments:\n${c.comments.map((x) => `- ${x.id ? `[${x.id}] ` : ""}${x.reply_to ? `↳ ${x.reply_to} ` : ""}${x.by}: ${x.text}`).join("\n") || "(none)"}`,
            `\nResult:\n${c.result ?? "(none)"}`];
        return lines.filter((l, i) => l !== "" || i > 0).join("\n");
    }
    board() {
        const order = ["running", "ready", "blocked", "review", "backlog", "done"];
        const all = this.list();
        if (!all.length)
            return "Board is empty.";
        return order.map((s) => { const l = all.filter((c) => c.status === s); return l.length ? `## ${s} (${l.length})\n${l.map((c) => `  ${this.fmt(c)}`).join("\n")}` : ""; }).filter(Boolean).join("\n");
    }
    report() {
        const all = this.list();
        const cnt = (s) => all.filter((c) => c.status === s && c.type !== "epic").length;
        const lines = [`Cards: ${all.filter((c) => c.type !== "epic").length} · done ${cnt("done")} · running ${cnt("running")} · ready ${cnt("ready")} · blocked ${cnt("blocked")} · review ${cnt("review")}`];
        for (const c of all.filter((x) => x.type !== "epic" && ["done", "blocked", "running"].includes(x.status))) {
            const t = c.test_result ? (c.test_result.code === 0 ? "tests pass" : `tests FAIL(${c.test_result.code})`) : "no tests run";
            lines.push(`${c.key ?? c.id} [${c.status}] ${c.title} — ${t} — commits: ${(c.commits ?? []).map((x) => x.hash.slice(0, 7)).join(" ") || "none"}`);
        }
        return lines.join("\n");
    }
}
export const kanbanTool = {
    name: "kanban", toolset: "kanban", tier: "standard",
    description: "Project tracker (kanban tool call, not a shell command): plan, track and verify multi-task projects. Cards have keys (PT-12), types (epic/task/bug), acceptance criteria, a test_cmd that must pass before done, threaded comments, status history and linked git commits. Actions: create, list, show, update (status done runs the tests first), comment (reply_to for threads), dispatch, resume (re-queue interrupted cards), link_commit, sync (find commits by key), test (run just the card's test_cmd), verify (full check: files+exports built, unit tests, pages load, screenshots saved, functional steps, earlier cards and pages not broken; evidence in .stitap/evidence/KEY), gentests (write tests/verify/<phase>.verify.test.mjs from the spec), regression (re-test done cards, reopen failures and file bugs), board, report, import (turn a plan folder of phase-NN.md specs into epics and tasks).",
    parameters: obj({
        action: enm(["create", "list", "show", "update", "comment", "dispatch", "resume", "link_commit", "sync", "test", "verify", "gentests", "regression", "board", "report", "import"], "operation"),
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
        project: str("import: project folder the docs and tests are copied into and the cards run in"),
        tests: str("import: folder of reference tests to copy into <project>/tests"),
        key_prefix: str("import/create: key prefix, default from config"),
    }, ["action"]),
    async handler(a, ctx) {
        const K = ctx.rt.kanban;
        const by = "agent";
        switch (a.action) {
            case "create": return `Created ${K.fmt(K.create({ title: String(a.title ?? "untitled"), body: a.body, priority: a.priority, depends_on: a.depends_on, status: a.status, review: a.review, type: a.type, parent: a.parent, acceptance: a.acceptance, test_cmd: a.test_cmd, spec: a.spec, cwd: a.cwd, functional: a.functional, key_prefix: a.key_prefix }))}`;
            case "list": {
                const l = K.list(a.status);
                return l.length ? l.map((c) => K.fmt(c)).join("\n") : "Board is empty.";
            }
            case "show": return K.show(a.id);
            case "update": {
                const patch = { ...(a.title ? { title: a.title } : {}), ...(a.body ? { body: a.body } : {}), ...(a.priority !== undefined ? { priority: a.priority } : {}), ...(a.depends_on ? { depends_on: a.depends_on.map((d) => K.get(d)?.id ?? d) } : {}),
                    ...(a.acceptance ? { acceptance: a.acceptance } : {}), ...(a.test_cmd ? { test_cmd: a.test_cmd } : {}), ...(a.spec ? { spec: a.spec } : {}), ...(a.type ? { type: a.type } : {}), ...(a.functional ? { functional: a.functional } : {}) };
                if (a.status === "done") {
                    const v = await K.complete(a.id, by);
                    return `${K.fmt(v.card)} — ${v.detail}`;
                }
                if (a.status)
                    patch.status = a.status;
                return K.fmt(K.update(a.id, patch, { by }));
            }
            case "comment": return K.fmt(K.comment(a.id, String(a.text ?? ""), by, a.reply_to));
            case "dispatch": {
                const n = await K.tick();
                return `Dispatched ${n} card(s) to workers.`;
            }
            case "resume": {
                const r = K.recover();
                const n = await K.tick();
                return `Re-queued ${r.length} interrupted card(s); dispatched ${n}.`;
            }
            case "link_commit": return K.fmt(K.linkCommit(a.id, { hash: String(a.hash ?? ""), message: a.message }));
            case "sync": return `Linked ${await K.syncCommits(a.id)} new commit(s).`;
            case "test": {
                const t = await K.runTests(a.id);
                return `exit ${t.code}\n${t.output}`;
            }
            case "verify": return (await K.verify(a.id)).markdown;
            case "gentests": return `Wrote ${K.genTests(a.id)}`;
            case "regression": return K.regression(a.id);
            case "board": return K.board();
            case "report": return K.report();
            case "import": {
                if (!a.path)
                    return "import needs path (folder with phase-NN.md files)";
                return importPlan(K, { planDir: String(a.path), projectDir: a.project, testsDir: a.tests, keyPrefix: a.key_prefix });
            }
            default: return `unknown action ${a.action}`;
        }
    },
};

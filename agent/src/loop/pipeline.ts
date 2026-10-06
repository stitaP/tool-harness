/**
 * /pipeline — run a list of spec/requirement documents one after another, unattended and continuously.
 *
 * Each document runs as a standing goal in its own fresh chat (so one document's history never crowds the next),
 * in the origin chat's working folder. When a document names a test (`**Test:** \`node --test …\``) or a --check is
 * given, the pipeline runs it itself afterwards: pass = done; fail = retry with the failure output, then "stuck".
 * Stuck documents (goal paused, check still failing, looping, timed out) are skipped; they get one more try at the end.
 * The origin chat's plan is cumulative: one phase per document, filled with that document's own plan as it works.
 * One report is posted to the origin chat at the end. State lives in state_meta, so a restart resumes the run.
 */
import { exec } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { Runtime } from "../runtime/runtime.js";
import type { TodoItem } from "../tools/agent-tools.js";
import { goalKey, type GoalState } from "./autonomy.js";
import { errMsg } from "../util/misc.js";
import { log } from "../util/log.js";
import { type Tool, obj, str, int, arr, enm } from "../tools/types.js";
import { checkPages, formatPages, pageCheckAvailable, sitePages, type PageResult } from "../tools/pagecheck.js";

export interface PipelineItem {
  name: string; path: string; prompt: string; check?: string;
  status: "pending" | "running" | "done" | "stuck";
  /** checks of earlier documents in the same folder (lower number): they must keep passing (regression gate) */
  regress?: { name: string; check: string }[];
  attempts: number; sessionId?: string; startedAt?: number; finishedAt?: number; note?: string; checkOutput?: string;
}
export interface PipelineState {
  originSid: string; cwd: string; items: PipelineItem[];
  status: "active" | "paused" | "done" | "stopped";
  createdAt: number; maxTurns: number; timeoutMin: number; maxAttempts: number; retriedStuck: boolean; report?: string; reportFile?: string;
}

export const pipelineKey = (sid: string) => `pipeline:${sid}`;

/** "phase-*.md" style globs (`*` and `?` within the last path segment), resolved against `cwd`, sorted naturally. */
export function expandDocs(cwd: string, args: string[]): string[] {
  const out: string[] = [];
  for (const a of args) {
    const p = resolve(cwd, a.replace(/^~(?=\/|$)/, process.env.HOME ?? ""));
    if (!/[*?]/.test(basename(p))) { if (existsSync(p) && statSync(p).isFile()) out.push(p); continue; }
    const dir = dirname(p);
    if (!existsSync(dir)) continue;
    const re = new RegExp("^" + basename(p).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    for (const f of readdirSync(dir)) if (re.test(f) && statSync(join(dir, f)).isFile()) out.push(join(dir, f));
  }
  const coll = new Intl.Collator(undefined, { numeric: true });
  return [...new Set(out)].sort((x, y) => coll.compare(x, y));
}

/** First number in a file name ("phase-07.md" → 7), for --from / --to. */
const docNumber = (p: string) => { const m = /(\d+)/.exec(basename(p)); return m ? Number(m[1]) : NaN; };

export function filterRange(paths: string[], from?: number, to?: number): string[] {
  return paths.filter((p) => { const n = docNumber(p); return Number.isNaN(n) || ((from === undefined || n >= from) && (to === undefined || n <= to)); });
}

/** The doc's own test command, e.g. `**Test:** \`node --test tests/phase-07.test.js\`` → that command. */
export function docCheck(text: string): string | undefined {
  return /\*\*Test:\*\*\s*`([^`]+)`/i.exec(text)?.[1]?.trim();
}

/** The doc's ready-made agent prompt (a "## … prompt" section of `>` quote lines), if any. */
export function docPrompt(text: string): string | undefined {
  const m = /^#{2,3}\s+[^\n]*prompt[^\n]*\n([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/im.exec(text);
  const body = m?.[1].split("\n").filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, "")).join("\n").trim();
  return body || undefined;
}

/** Earlier documents' checks (same folder, lower number, with a **Test:** line): "Done when … `npm test` is green". */
export function regressionChecks(path: string): { name: string; check: string }[] {
  const n = docNumber(path);
  if (Number.isNaN(n)) return [];
  return expandDocs(dirname(path), ["*.md"])
    .filter((p) => p !== path && docNumber(p) < n)
    .map((p) => ({ name: basename(p).replace(/\.[^.]+$/, ""), check: docCheck(readFileSync(p, "utf8")) ?? "" }))
    .filter((r) => r.check);
}

export function buildItem(path: string, cwd: string, checkTpl?: string): PipelineItem {
  const text = readFileSync(path, "utf8");
  const rel = relative(cwd, path) || path;
  const name = basename(path).replace(/\.[^.]+$/, "");
  const check = checkTpl ? checkTpl.replace(/\{name\}/g, name).replace(/\{n\}/g, String(docNumber(path)).padStart(2, "0")) : docCheck(text);
  const own = docPrompt(text);
  const prompt = `Work on ONE spec document only: ${rel}\n\n` +
    (own ? `${own}\n\n(The spec document above is at ${rel}; if a referenced docs/ copy is missing, read ${rel}.)` : `Read ${rel} and implement exactly what it specifies — nothing from other specs.`) +
    (check ? `\n\nDone means \`${check}\` passes AND the earlier phases' tests still pass (change existing files with patch — never replace a whole existing file, and don't delete earlier phases' code). Run it with run_tests, fix your own code (never edit provided tests) until it passes. After changing pages, styles or page scripts, run page_check. If an earlier phase broke or a file lost content, file_history shows and restores its earlier versions.` : "") +
    `\n\nKeep a todo_list for this document. Report in at most two lines when finished.`;
  return { name, path, prompt, check, status: "pending", attempts: 0, regress: regressionChecks(path) };
}

const runShell = (cmd: string, cwd: string, timeoutMs = 10 * 60_000) => new Promise<{ ok: boolean; output: string }>((res) => {
  exec(cmd, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
    const output = `${stdout ?? ""}${stderr ?? ""}`;
    res({ ok: !err, output: output.length > 4000 ? "…" + output.slice(-4000) : output });
  });
});

/** An earlier phase's test that hangs (a server left listening) must not hold up every later phase. */
const REGRESS_TIMEOUT = 3 * 60_000;

export class PipelineRunner {
  private running = new Set<string>();
  constructor(private rt: Runtime) {}

  get(sid: string): PipelineState | null { return this.rt.db.getMeta<PipelineState>(pipelineKey(sid)); }

  /** Every pipeline, newest first. */
  list(): PipelineState[] {
    return this.rt.db.listMeta("pipeline:").map((m) => m.value as PipelineState).filter((x) => x?.items).sort((x, y) => y.createdAt - x.createdAt);
  }

  /** The pipeline a command in chat `sid` means: this chat's own while it runs, else the one running elsewhere
   * (a pipeline is easy to lose: its chat may be closed or cleared), else this chat's finished one. */
  find(sid: string): { state: PipelineState; elsewhere: boolean } | { ambiguous: PipelineState[] } | null {
    const own = this.get(sid);
    const live = (x: PipelineState | null) => !!x && (x.status === "active" || x.status === "paused");
    if (live(own)) return { state: own!, elsewhere: false };
    const others = this.list().filter((x) => live(x) && x.originSid !== sid);
    if (others.length === 1) return { state: others[0], elsewhere: true };
    if (others.length > 1) return { ambiguous: others };
    return own ? { state: own, elsewhere: false } : null;
  }

  describe(s: PipelineState): string {
    const title = this.rt.db.getSession(s.originSid)?.title || s.originSid;
    const done = s.items.filter((i) => i.status === "done").length, stuck = s.items.filter((i) => i.status === "stuck").length;
    const cur = s.items.find((i) => i.status === "running");
    return `Pipeline ${s.status} (chat "${title}", ${s.items[0]?.name ?? ""}…${s.items.at(-1)?.name ?? ""}): ${done}/${s.items.length} done${stuck ? `, ${stuck} stuck` : ""}${cur ? ` — working on ${cur.name} (attempt ${cur.attempts})` : ""}.`;
  }

  /** A one-line progress note kept in the origin chat, so the run stays visible after reloads. */
  private note(s: PipelineState, text: string): void {
    this.rt.db.addMessage(s.originSid, { role: "assistant", content: text, meta: { pipeline_status: true } });
    this.rt.emitEvent(s.originSid, { type: "status", text });
  }
  private save(s: PipelineState) { this.rt.db.setMeta(pipelineKey(s.originSid), s); this.rt.emitEvent(s.originSid, { type: "pipeline", state: { status: s.status, done: s.items.filter((i) => i.status === "done").length, total: s.items.length } }); }

  start(originSid: string, cwd: string, paths: string[], opts: { check?: string; maxTurns?: number; timeoutMin?: number; maxAttempts?: number } = {}): PipelineState {
    const cur = this.get(originSid);
    if (cur && (cur.status === "active" || cur.status === "paused")) throw new Error("a pipeline is already running in this chat — /pipeline status, /pipeline stop");
    const s: PipelineState = {
      originSid, cwd, items: paths.map((p) => buildItem(p, cwd, opts.check)), status: "active", createdAt: Date.now(),
      // the time limit governs: small models end a goal turn after a step or two, so a turn budget of 40 ran out in minutes
      maxTurns: opts.maxTurns ?? 500, timeoutMin: opts.timeoutMin ?? 90, maxAttempts: opts.maxAttempts ?? 2, retriedStuck: false,
    };
    this.save(s);
    this.syncPlan(s);
    const sess = this.rt.db.getSession(originSid);
    if (sess && !sess.title) this.rt.db.updateSession(originSid, { title: `Pipeline: ${s.items[0].name}${s.items.length > 1 ? ` → ${s.items.at(-1)!.name}` : ""}` });
    this.note(s, `Pipeline started: ${s.items.length} documents (${s.items.map((i) => i.name).join(", ")}).`);
    void this.tick();
    return s;
  }

  /** Called by the runtime's background ticker and after start/resume: drive every active pipeline. */
  async tick(): Promise<void> {
    for (const { key, value } of this.rt.db.listMeta("pipeline:")) {
      const s = value as PipelineState;
      if (s.status !== "active" || this.running.has(s.originSid)) continue;
      this.running.add(s.originSid);
      void this.run(key.slice("pipeline:".length)).catch((e) => log.warn(`pipeline: ${errMsg(e)}`)).finally(() => this.running.delete(s.originSid));
    }
  }

  setStatus(sid: string, status: PipelineState["status"]): PipelineState | null {
    const s = this.get(sid);
    if (!s) return null;
    s.status = status;
    if (status !== "active") { const cur = s.items.find((i) => i.status === "running"); if (cur?.sessionId && status === "stopped") this.rt.interrupt(cur.sessionId, true); }
    this.save(s);
    this.note(s, `Pipeline ${status === "active" ? "resumed" : status}.`);
    if (status === "active") void this.tick();
    return s;
  }

  /** Give up on the running document now and move to the next one. */
  skip(sid: string): string {
    const s = this.get(sid);
    const cur = s?.items.find((i) => i.status === "running");
    if (!s || !cur?.sessionId) return "Nothing is running.";
    cur.note = "skipped by the user";
    this.rt.db.setMeta(`pipeline_skip:${cur.sessionId}`, true);
    this.rt.interrupt(cur.sessionId, true);
    return `Skipping ${cur.name}…`;
  }

  private async run(originSid: string): Promise<void> {
    // a restart may have left a document "running": run it again
    let s = this.get(originSid);
    if (!s) return;
    for (const it of s.items) if (it.status === "running") it.status = "pending";
    this.save(s);
    for (;;) {
      s = this.get(originSid);
      if (!s || s.status !== "active") return;
      let item = s.items.find((i) => i.status === "pending");
      if (!item && !s.retriedStuck && s.items.some((i) => i.status === "stuck")) {
        s.retriedStuck = true;   // one more pass over stuck documents now that the others are done
        for (const i of s.items) if (i.status === "stuck") { i.status = "pending"; i.note = `${i.note ?? ""} (final retry)`.trim(); }
        this.save(s);
        continue;
      }
      if (!item) { this.finish(s); return; }
      await this.runItem(s, item);
    }
  }

  private async runItem(s: PipelineState, item: PipelineItem): Promise<void> {
    const rt = this.rt;
    // already passing (e.g. done in an earlier run)? then there is nothing to do
    if (item.check && item.attempts === 0) {
      const pre = await runShell(item.check, s.cwd);
      if (pre.ok) {
        item.status = "done"; item.note = "check already passing — skipped"; item.checkOutput = pre.output; item.finishedAt = Date.now();
        this.save(s); this.syncPlan(s);
        rt.emitEvent(s.originSid, { type: "status", text: `Pipeline: ${item.name} already passes its check — skipped` });
        return;
      }
    }
    // regression baseline: which earlier documents pass right now (only those must keep passing)
    const baseline: { name: string; check: string }[] = [];
    for (const r of item.regress ?? []) if ((await runShell(r.check, s.cwd, REGRESS_TIMEOUT)).ok) baseline.push(r);
    // page baseline: which of the site's pages render fine right now (a phase must not break them)
    const pagesBefore = await this.pageStates(s.cwd);
    item.status = "running"; item.attempts++; item.startedAt = Date.now();
    const child = rt.createSession({ source: "pipeline", title: `pipeline: ${item.name}`, cwd: s.cwd, parent_id: s.originSid });
    item.sessionId = child.id;
    this.save(s); this.syncPlan(s);
    rt.emitEvent(s.originSid, { type: "status", text: `Pipeline: started ${item.name} (attempt ${item.attempts})` });
    const goal: GoalState = { text: `Complete the spec ${item.path}${item.check ? ` so that \`${item.check}\` passes` : ""}`, status: "active", turns: 0, max_turns: s.maxTurns, created_at: Date.now() };
    rt.db.setMeta(goalKey(child.id), goal);
    const onTodo = (ev: any) => { if (ev.sessionId === child.id && ev.type === "todo") this.syncPlan(this.get(s.originSid) ?? s); };
    rt.on("event", onTodo);
    let prompt = item.prompt;
    if (item.attempts > 1 && item.checkOutput) prompt += `\n\nA previous attempt did not pass:\n${item.checkOutput.slice(-3000)}\nFix the failures.`;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; rt.interrupt(child.id, true); }, s.timeoutMin * 60_000);
    try {
      await rt.send(child.id, prompt, { source: "pipeline", approvalMode: rt.cfg.data.cron.approval_mode }).catch(() => undefined);
      await rt.waitIdle(child.id);   // goal continuations run in the same queue
    } finally { clearTimeout(timer); rt.off("event", onTodo); }

    const cur = this.get(s.originSid) ?? s;
    const it = cur.items.find((i) => i.path === item.path && i.sessionId === child.id) ?? item;
    const g = rt.db.getMeta<GoalState>(goalKey(child.id));
    const skipped = !!rt.db.getMeta(`pipeline_skip:${child.id}`);
    if (g && g.status === "active") { g.status = "paused"; g.last_reason = timedOut ? "pipeline time limit reached" : skipped ? "skipped" : g.last_reason; rt.db.setMeta(goalKey(child.id), g); }
    let ok: boolean;
    if (it.check) {
      const r = await runShell(it.check, cur.cwd);
      ok = r.ok; it.checkOutput = r.output;
      it.note = ok ? `check passed` : `check failed${timedOut ? " (timed out)" : skipped ? " (skipped)" : g?.status === "paused" ? ` (goal paused: ${g.last_reason?.slice(0, 120) ?? ""})` : ""}`;
      if (ok && baseline.length) {
        // regression gate: earlier documents that passed before this one started must still pass
        const broken: { name: string; output: string }[] = [];
        for (const b of baseline) { const rr = await runShell(b.check, cur.cwd, REGRESS_TIMEOUT); if (!rr.ok) broken.push({ name: b.name, output: rr.output }); }
        if (broken.length) {
          ok = false;
          it.note = `check passed but broke earlier documents: ${broken.map((x) => x.name).join(", ")}`;
          it.checkOutput = `Your changes broke documents that passed before (${broken.map((x) => x.name).join(", ")}). Fix them without breaking ${it.name}:\n` +
            broken.map((x) => `--- ${x.name} ---\n${x.output.slice(-1500)}`).join("\n");
        }
      }
      if (ok && pagesBefore) {
        // visual gate: pages that rendered before (or that this phase added) must render now
        const after = await this.pageStates(cur.cwd);
        const broke = (after?.list ?? []).filter((r) => !r.ok && (pagesBefore.get(r.page) ?? true));
        if (broke.length) {
          ok = false;
          it.note = `check passed but pages are broken: ${broke.map((r) => r.page).join(", ")}`.slice(0, 300);
          it.checkOutput = `Tests pass, but these pages are broken in a real browser (check them with page_check):\n${formatPages(broke)}`;
        }
      }
    } else {
      ok = g?.status === "done";
      it.note = ok ? "goal judged done" : timedOut ? "timed out" : skipped ? "skipped" : `goal ${g?.status ?? "unknown"}: ${g?.last_reason?.slice(0, 160) ?? ""}`;
    }
    it.finishedAt = Date.now();
    it.status = ok ? "done" : !skipped && !timedOut && it.attempts < cur.maxAttempts ? "pending" : "stuck";
    this.save(cur); this.syncPlan(cur);
    this.note(cur, `${it.name}: ${it.status === "pending" ? "retrying" : it.status} — ${it.note ?? ""}`.trim());
  }

  /** page → renders fine, for a static site in `cwd`; null when there are no pages or no browser to check with. */
  private async pageStates(cwd: string): Promise<Map<string, boolean> & { list?: PageResult[] } | null> {
    if (!pageCheckAvailable() || !sitePages(cwd).length) return null;
    try {
      const rs = await checkPages(cwd);
      return Object.assign(new Map(rs.map((r) => [r.page, r.ok])), { list: rs });
    } catch (e) { log.warn(`pipeline page check skipped: ${errMsg(e)}`); return null; }
  }

  /** The origin chat's plan: one phase per document, containing that document's own todo items (cumulative). */
  syncPlan(s: PipelineState): void {
    const todos: TodoItem[] = [];
    s.items.forEach((it, i) => {
      const phase = `${i + 1}. ${it.name}`;
      const child: TodoItem[] = it.sessionId ? this.rt.db.getMeta<TodoItem[]>(`todo:${it.sessionId}`) ?? [] : [];
      const docStatus: TodoItem["status"] = it.status === "done" ? "completed" : it.status === "running" ? "in_progress" : it.status === "stuck" ? "cancelled" : "pending";
      todos.push({ id: `${i + 1}`, content: it.status === "stuck" ? `${it.name} — stuck (${it.note ?? ""})` : `${it.name}${it.check ? ` — ${it.check}` : ""}`, status: docStatus, phase });
      child.forEach((c, k) => todos.push({ id: `${i + 1}.${k + 1}`, content: c.content, status: c.status, phase }));
    });
    this.rt.db.setMeta(`todo:${s.originSid}`, todos);
    this.rt.emitEvent(s.originSid, { type: "todo", todos });
  }

  report(s: PipelineState): string {
    const done = s.items.filter((i) => i.status === "done").length;
    const mins = (it: PipelineItem) => (it.startedAt && it.finishedAt ? `${Math.max(1, Math.round((it.finishedAt - it.startedAt) / 60000))} min` : "");
    const rows = s.items.map((it, i) => `| ${i + 1} | ${it.name} | ${it.status === "done" ? "✅ done" : it.status === "stuck" ? "⚠️ stuck" : it.status} | ${it.attempts} | ${mins(it)} | ${(it.note ?? "").replace(/\|/g, "\\|")} |`);
    return `**Pipeline finished: ${done}/${s.items.length} documents done.**\n\n| # | Document | Result | Attempts | Time | Notes |\n|---|---|---|---|---|---|\n${rows.join("\n")}` +
      (s.items.some((i) => i.status === "stuck") ? `\n\nStuck documents can be retried with \`/pipeline retry\`.` : "");
  }

  private finish(s: PipelineState): void {
    s.status = "done";
    s.report = this.report(s);
    try {
      const dir = join(this.rt.home, "files", "pipelines");
      mkdirSync(dir, { recursive: true });
      s.reportFile = join(dir, `pipeline-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
      writeFileSync(s.reportFile, s.report + "\n");
    } catch { /* report stays in the chat */ }
    this.save(s);
    this.rt.db.addMessage(s.originSid, { role: "assistant", content: s.report, meta: { pipeline_report: true } });
    this.rt.emitEvent(s.originSid, { type: "notification", text: s.report.split("\n")[0].replace(/\*/g, "") + (s.reportFile ? ` Report: ${s.reportFile}` : "") });
  }

  /** Put stuck documents back in the queue and continue. */
  retry(sid: string): PipelineState | null {
    const s = this.get(sid);
    if (!s) return null;
    for (const i of s.items) if (i.status === "stuck") { i.status = "pending"; i.attempts = 0; }
    s.status = "active"; s.retriedStuck = true;
    this.save(s); this.syncPlan(s);
    void this.tick();
    return s;
  }
}


/** Lets the agent itself start and manage a pipeline when the user asks in plain words ("run phases 6 to 20 one by one"). */
export const pipelineTool: Tool = {
  name: "pipeline_manage", toolset: "cron", tier: "standard",
  description: "Run many spec/requirement documents one after another, unattended and continuously (each as its own goal in a fresh chat; a stuck one is skipped and retried at the end; the user's plan shows all documents; one report at the end). " +
    "Use when the user wants several documents/phases/specs done in sequence. action=start with docs (paths or globs like 'Idea_plan/phase-*.md', relative to the working folder) and optional from/to numbers; action=status|list|pause|resume|skip|retry|stop|report (these find the running pipeline from any chat).",
  parameters: obj({
    action: enm(["start", "status", "list", "pause", "resume", "skip", "retry", "stop", "report"], "operation"),
    docs: arr(str("document path or glob"), "start: the documents, in order"),
    from: int("start: first document number to include (from the file name, e.g. 6 for phase-06.md)"),
    to: int("start: last document number to include"),
    check: str("start: verification command for every document ({name} = file name without extension); default: each doc's own **Test:** line"),
    max_turns: int("start: goal turns per document (default 500)"),
    timeout_min: int("start: time limit per document in minutes (default 90)"),
  }, ["action"]),
  async handler(a, ctx) {
    const P = ctx.rt.pipelines, sid = ctx.session.id;
    if (ctx.depth > 0 || ctx.session.source === "pipeline") return "error: a pipeline cannot be started from inside a pipeline or subagent";
    if (a.action === "start") {
      const paths = filterRange(expandDocs(ctx.cwd, a.docs ?? []), a.from, a.to);
      if (!paths.length) return `error: no documents matched ${JSON.stringify(a.docs ?? [])} in ${ctx.cwd}`;
      try {
        const s = P.start(sid, ctx.cwd, paths, { check: a.check, maxTurns: a.max_turns, timeoutMin: a.timeout_min });
        return `Pipeline started with ${s.items.length} documents: ${s.items.map((i) => i.name).join(", ")}. It runs in the background; the plan updates live and the report arrives in this chat at the end. Tell the user it has started — do not wait for it.`;
      } catch (e: any) { return `error: ${e.message}`; }
    }
    if (a.action === "list") return P.list().map((x) => P.describe(x)).join("\n") || "No pipelines.";
    const f = P.find(sid);
    if (!f) return "No pipeline.";
    if ("ambiguous" in f) return `Several pipelines are running — ask the user which one:\n${f.ambiguous.map((x) => P.describe(x)).join("\n")}`;
    const s = f.state, o = s.originSid;
    if (a.action === "pause") P.setStatus(o, "paused");
    else if (a.action === "resume") P.setStatus(o, "active");
    else if (a.action === "stop") P.setStatus(o, "stopped");
    else if (a.action === "skip") return P.skip(o);
    else if (a.action === "retry") P.retry(o);
    else if (a.action === "report") return s.report ?? P.report(s);
    const cur = P.get(o)!;
    return `${P.describe(cur)} ` + cur.items.map((i) => `${i.name}=${i.status}`).join(", ");
  },
};

/**
 * stitaP Enterprise Engine
 *
 * Professional long-running agent workflows for companies:
 *
 * 1. Guideline Packs   — the company loads its coding/testing/review rules
 *                        once; every swarm worker receives the relevant
 *                        subset in its system prompt (token-budgeted).
 * 2. Migration Projects— language→language ports and version upgrades,
 *                        planned as a dependency tree of user stories.
 * 3. Long-Running      — plan → commit tasks to git/GitHub → develop → test
 *    Runner              → document per story on kanban, then verify every
 *                        module's purpose/use-cases before closing. Designed
 *                        to run for days/weeks with checkpointed state.
 */

import type { KanbanManager, KanbanTask, TaskStatus } from "../agent/kanban";

// ─── 1. Guideline Packs ───────────────────────────────────────────────────────

export type GuidelineSection = "coding" | "testing" | "review" | "docs" | "security" | "delivery";

export interface GuidelinePack {
  id: string;
  orgName: string;
  /** Raw rules text per section — loaded from files, pastes, or wiki import */
  sections: Record<GuidelineSection, string>;
  /** Per-worker token cap for injected guidelines (SLM friendly) */
  maxTokensPerWorker: number;
  updatedAt: string;
}

export function createGuidelinePack(orgName: string, maxTokensPerWorker = 800): GuidelinePack {
  return {
    id: `gp-${Date.now().toString(36)}`,
    orgName,
    sections: { coding: "", testing: "", review: "", docs: "", security: "", delivery: "" },
    maxTokensPerWorker,
    updatedAt: new Date().toISOString(),
  };
}

/** Rough token estimate (~4 chars/token) without any tokenizer dependency. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build the guideline prompt for one worker role. Sections are selected by
 * role relevance and truncated to the pack's token budget — a tester never
 * burns context on coding style, and nothing exceeds the SLM budget.
 */
export function guidelinesForRole(
  pack: GuidelinePack,
  role: "planner" | "coder" | "tester" | "reviewer" | "documenter" | "verifier",
): string {
  const byRole: Record<string, GuidelineSection[]> = {
    planner: ["delivery", "review"],
    coder: ["coding", "security"],
    tester: ["testing", "security"],
    reviewer: ["review", "coding"],
    documenter: ["docs", "delivery"],
    verifier: ["review", "testing", "docs"],
  };
  const relevant = byRole[role] ?? ["coding"];
  let out = `# ${pack.orgName} Guidelines (${role})\n`;
  for (const section of relevant) {
    const text = pack.sections[section]?.trim();
    if (!text) continue;
    const block = `\n## ${section}\n${text}\n`;
    if (estimateTokens(out + block) > pack.maxTokensPerWorker) break;
    out += block;
  }
  return out;
}

// ─── 2. Migration Projects ────────────────────────────────────────────────────

export interface MigrationProject {
  id: string;
  name: string;
  kind: "language-port" | "version-upgrade";
  fromStack: string;
  toStack: string;
  /** User stories extracted from requirements/help-docs */
  stories: UserStory[];
  createdAt: string;
}

export interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number; // lower runs first
  /** Story ids that must finish before this one */
  dependsOn: string[];
  status: "backlog" | "in-progress" | "done" | "verified";
}

let _storyCounter = 0;

export function createMigrationProject(config: {
  name: string;
  kind: MigrationProject["kind"];
  fromStack: string;
  toStack: string;
}): MigrationProject {
  return { id: `mig-${Date.now().toString(36)}`, stories: [], createdAt: new Date().toISOString(), ...config };
}

export function addStory(
  project: MigrationProject,
  story: { title: string; description: string; acceptanceCriteria?: string[]; priority?: number; dependsOn?: string[] },
): UserStory {
  const s: UserStory = {
    id: `us-${(++_storyCounter).toString(36)}-${Date.now().toString(36).slice(-4)}`,
    title: story.title,
    description: story.description,
    acceptanceCriteria: story.acceptanceCriteria ?? [],
    priority: story.priority ?? 5,
    dependsOn: story.dependsOn ?? [],
    status: "backlog",
  };
  project.stories.push(s);
  return s;
}

/** Topologically-sorted execution order (priority breaks ties). */
export function storyExecutionOrder(project: MigrationProject): UserStory[] {
  const byId = new Map(project.stories.map((s) => [s.id, s]));
  const done = new Set<string>();
  const order: UserStory[] = [];
  let guard = project.stories.length + 1;

  while (order.length < project.stories.length && guard-- > 0) {
    for (const s of [...project.stories]
      .filter((x) => !done.has(x.id))
      .sort((a, b) => a.priority - b.priority)) {
      if (s.dependsOn.every((d) => done.has(d) || !byId.has(d))) {
        order.push(s);
        done.add(s.id);
      }
    }
  }
  return order;
}

// ─── 3. Verification Ledger ───────────────────────────────────────────────────

export interface UsecaseCheck {
  id: string;
  moduleId: string;
  purpose: string;
  usecases: string[];
  results: Array<{ usecase: string; pass: boolean; evidence: string }>;
  passedAt?: string;
}

export class VerificationLedger {
  private checks = new Map<string, UsecaseCheck>();

  declare(moduleId: string, purpose: string, usecases: string[]): UsecaseCheck {
    const check: UsecaseCheck = {
      id: `vc-${moduleId}-${this.checks.size}`,
      moduleId,
      purpose,
      usecases,
      results: [],
    };
    this.checks.set(moduleId, check);
    return check;
  }

  record(checkId: string, usecase: string, pass: boolean, evidence: string): void {
    for (const check of this.checks.values()) {
      if (check.id === checkId || check.moduleId === checkId) {
        check.results.push({ usecase, pass, evidence });
      }
    }
  }

  finalizeModule(moduleId: string): boolean {
    const check = this.checks.get(moduleId);
    if (!check) return false;
    const allDeclared = check.usecases.every((u) =>
      check.results.some((r) => r.usecase === u && r.pass),
    );
    if (allDeclared) check.passedAt = new Date().toISOString();
    return allDeclared;
  }

  summary(): { total: number; verified: number; failed: number } {
    let verified = 0;
    let failed = 0;
    for (const c of this.checks.values()) {
      if (c.passedAt) verified++;
      else if (c.results.some((r) => !r.pass)) failed++;
    }
    return { total: this.checks.size, verified, failed };
  }
}

// ─── 4. Long-Running Runner ───────────────────────────────────────────────────

/** Ports the swarm uses to touch external systems. Wire real clients at runtime. */
export interface RunnerPorts {
  /** Commit planned tasks / completed stories to the repo */
  gitCommit?(message: string, files: string[]): Promise<{ sha: string }> | { sha: string };
  /** Create a tracking ticket (GitHub issue or Jira) */
  createTicket?(title: string, body: string): Promise<{ key: string }> | { key: string };
  /** Append progress notes to the ticket */
  addTicketComment?(key: string, comment: string): Promise<void> | void;
}

/**
 * Optional agent-ops synchronization: when provided, the runner emits traces,
 * raises notifications on failures, and routes risky steps through the
 * approval gate. All engines come from src/lib/agent — no duplication.
 */
export interface RunnerOps {
  tracer?: import("../agent/tracing").RunTracer;
  notify?: import("../agent/notifications").NotificationDispatcher;
  approvals?: import("../agent/approvals").ApprovalGate;
  /** Risk level submitted to the approval gate before each story (default none) */
  storyRisk?: "low" | "medium" | "high" | "critical";
}

export type RunPhase = "planning" | "committed" | "executing" | "verifying" | "complete" | "paused";

export interface RunnerCheckpoint {
  projectId: string;
  phase: RunPhase;
  boardId?: string;
  currentStoryIndex: number;
  completedStories: string[];
  ledgerSummary: { total: number; verified: number; failed: number };
  savedAt: string;
}

export class LongRunningRunner {
  readonly project: MigrationProject;
  private pack: GuidelinePack;
  private ports: RunnerPorts;
  private ledger = new VerificationLedger();
  phase: RunPhase = "planning";
  private checkpoints: RunnerCheckpoint[] = [];

  constructor(project: MigrationProject, pack: GuidelinePack, ports: RunnerPorts = {}, ops: RunnerOps = {}) {
    this.project = project;
    this.pack = pack;
    this.ports = ports;
    this.ops = ops;
  }

  private ops: RunnerOps;
  private traceId?: string;

  /**
   * Phase 1: turn user stories into a dependency-ordered plan and commit it
   * to the repository so the work survives restarts and is reviewable.
   */
  async plan(board: KanbanManager, boardName: string): Promise<string> {
    this.phase = "planning";
    if (this.ops.tracer && !this.traceId) {
      const t = this.ops.tracer.start(`run:${this.project.name}`, { sessionId: this.project.id });
      this.traceId = t.id;
      const s = this.ops.tracer.span(t.id, "plan-phase");
      if (s) this.ops.tracer.endSpan(s, "ok", { tokensIn: 0, tokensOut: 0 });
    }
    const ordered = storyExecutionOrder(this.project);
    const boardId = board.createBoard(boardName, `${this.project.kind}: ${this.project.fromStack} → ${this.project.toStack}`).id;

    for (const story of ordered) {
      board.addTask(boardId, {
        title: story.title,
        description: `${story.description}\n\nAcceptance:\n${story.acceptanceCriteria.map((a) => `- ${a}`).join("\n")}`,
        priority: story.priority <= 2 ? "critical" : story.priority <= 5 ? "medium" : "low",
        tags: [this.project.kind],
      });
    }

    if (this.ports.gitCommit) {
      await this.ports.gitCommit(
        `plan(${this.project.name}): ${ordered.length} user stories committed`,
        ["PLAN.md"],
      );
    }
    if (this.ports.createTicket) {
      const epic = await this.ports.createTicket(
        `[${this.project.name}] ${ordered.length} stories`,
        `Migration ${this.project.fromStack} → ${this.project.toStack}`,
      );
      board.addComment(boardId, "", "system", `Epic ticket: ${epic.key}`);
    }

    this.phase = "committed";
    this.saveCheckpoint();
    if (this.ops.notify) this.ops.notify.notify("info", `Plan committed: ${this.project.name}`, `${ordered.length} stories on board`, new Date(), { dedupeKey: `plan:${this.project.id}` });
    return boardId;
  }

  /**
   * Phase 2: execute one story end-to-end (develop → test → document),
   * mirroring status to kanban and tickets, then verify its use-cases.
   * Returns false when everything is complete — call repeatedly for
   * week-long incremental runs.
   */
  async stepStory(
    board: KanbanManager,
    execute: (story: UserStory, guidelines: string) => Promise<{ codeOk: boolean; testsOk: boolean; docPath: string; evidence: Record<string, string> }>,
  ): Promise<boolean> {
    if (this.phase === "complete") return false;
    this.phase = "executing";

    const ordered = storyExecutionOrder(this.project);
    const next = ordered.find((s) => s.status !== "done" && s.status !== "verified");
    if (!next) {
      this.phase = this.ledger.summary().verified === this.ledger.summary().total ? "complete" : "verifying";
      this.saveCheckpoint();
      return false;
    }

    next.status = "in-progress";
    const task = this.findBoardTask(board, next.title);
    if (task) board.moveTask(task.boardId, task.taskId, "in-progress");

    // Approval gate: risky stories wait for a human instead of executing.
    if (this.ops.approvals && this.ops.storyRisk) {
      let req;
      try {
        req = this.ops.approvals.submit({
          title: next.title,
          toolId: "enterprise.project",
          actionSummary: `${this.project.kind} ${next.id}: ${next.description.slice(0, 120)}`,
          risk: this.ops.storyRisk,
          requestedBy: "long-running-runner",
          ...(this.traceId ? { runId: this.traceId } : {}),
        });
        this.ops.approvals.expireStale();
      } catch {
        // policy-blocked risk level — treat like a human rejection
        if (task) board.moveTask(task.boardId, task.taskId, "blocked");
        return true; // keep the run alive but skip this story
      }
      if (req.status === "pending") {
        if (task) board.moveTask(task.boardId, task.taskId, "review");
        return true;
      }
    }

    const span = this.ops.tracer ? this.ops.tracer.span(this.traceId ?? "", `story:${next.id}`) : undefined;

    // Worker receives only the guideline sections relevant to coding/testing.
    const guidelines =
      guidelinesForRole(this.pack, "coder") + "\n" + guidelinesForRole(this.pack, "tester");

    const outcome = await execute(next, guidelines);
    if (span && this.ops.tracer) {
      this.ops.tracer.endSpan(span, outcome.codeOk && outcome.testsOk ? "ok" : "error", { error: outcome.codeOk ? undefined : "code failed" });
    }

    // Document phase always runs, even after partial failures.
    if (outcome.docPath && this.ports.addTicketComment) {
      await this.ports.addTicketComment(next.id, `Docs published: ${outcome.docPath}`);
    }

    if (outcome.codeOk && outcome.testsOk) {
      next.status = "done";
      if (task) board.moveTask(task.boardId, task.taskId, "done");
      if (this.ports.gitCommit) {
        await this.ports.gitCommit(`feat(${next.id}): ${next.title}`, [outcome.docPath]);
      }
      // Use-case verification gate before the story counts as closed.
      this.phase = "verifying";
      const vc = this.ledger.declare(
        next.id,
        next.title,
        next.acceptanceCriteria.length > 0
          ? next.acceptanceCriteria
          : [`story delivered: ${next.title}`],
      );
      for (const [usecase, evidence] of Object.entries(outcome.evidence)) {
        this.ledger.record(vc.id, usecase, true, evidence);
      }
      // Stories without declared criteria still need recorded evidence to close.
      if (!vc.results.some((r) => r.pass)) {
        const generic = `story delivered: ${next.title}`;
        this.ledger.record(vc.id, generic, true, `docs published: ${outcome.docPath}`);
      }
      const ok = this.ledger.finalizeModule(next.id);
      next.status = ok ? "verified" : "done";
      if (task) board.moveTask(task.boardId, task.taskId, ok ? "done" : "review");
    } else {
      if (task) board.moveTask(task.boardId, task.taskId, "blocked");
      if (this.ports.addTicketComment) {
        await this.ports.addTicketComment(
          next.id,
          `Blocked: code=${outcome.codeOk ? "ok" : "failed"} tests=${outcome.testsOk ? "ok" : "failed"}`,
        );
      }
      if (this.ops.notify) {
        this.ops.notify.notify(
          "error",
          `Story blocked: ${next.title}`,
          `code=${outcome.codeOk ? "ok" : "failed"} tests=${outcome.testsOk ? "ok" : "failed"}`,
          new Date(),
          { dedupeKey: `blocked:${next.id}` },
        );
      }
      next.status = "in-progress"; // retried on a later run
    }

    this.phase = ordered.every((s) => s.status === "verified") ? "complete" : "executing";
    this.saveCheckpoint();
    return this.phase !== "complete";
  }

  /** Persisted state so a run can pause/resume across days or machine restarts. */
  checkpoint(): RunnerCheckpoint {
    return (
      this.checkpoints[this.checkpoints.length - 1] ?? {
        projectId: this.project.id,
        phase: this.phase,
        currentStoryIndex: 0,
        completedStories: this.project.stories.filter((s) => s.status === "verified").map((s) => s.id),
        ledgerSummary: this.ledger.summary(),
        savedAt: new Date().toISOString(),
      }
    );
  }

  ledgerRef(): VerificationLedger {
    return this.ledger;
  }

  private findBoardTask(board: KanbanManager, title: string): { boardId: string; taskId: string } | undefined {
    for (const b of board.listBoards()) {
      const snapshot = board.getSnapshot(b.id);
      const match = snapshot?.full.tasks.find((t: KanbanTask) => t.title === title);
      if (snapshot && match) return { boardId: b.id, taskId: match.id };
    }
    return undefined;
  }

  private saveCheckpoint(): void {
    this.checkpoints.push({
      projectId: this.project.id,
      phase: this.phase,
      currentStoryIndex: this.project.stories.filter((s) => s.status === "verified").length,
      completedStories: this.project.stories.filter((s) => s.status === "verified").map((s) => s.id),
      ledgerSummary: this.ledger.summary(),
      savedAt: new Date().toISOString(),
    });
  }
}

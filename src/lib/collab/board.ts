/**
 * stitaP Collab Board — Multi-User Feedback & Prioritization
 *
 * The problem this solves: git merges code but never tells you WHICH feature
 * was beneficial or whether the RIGHT code was accepted. This board is the
 * missing human layer between team and swarms:
 *
 * 1. Issues carry structured team feedback (Jira-style: type, severity,
 *    comments, votes) — agents consume them as work orders.
 * 2. Benefit scoring ranks features by weighted votes + severity + recency,
 *    so a swarm always works the highest-value item first.
 * 3. Merge verdicts gate code acceptance: a candidate must pass objective
 *    checks (tests, benchmarks, review approvals, no unresolved blockers)
 *    before it counts as "the right code accepted".
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type IssueType = "feature" | "bug" | "feedback" | "task" | "epic";
export type IssueStatus = "backlog" | "todo" | "in-progress" | "review" | "done";
export type Severity = "trivial" | "minor" | "major" | "critical";

export interface BoardComment {
  id: string;
  author: string;
  body: string;
  at: string;
  /** Feedback tags agents parse: "works-for-me", "broken", "ux", "perf", "scope" */
  tags: string[];
}

export interface BoardIssue {
  id: string;
  key: string; // PROJ-12 style human key
  projectId: string;
  type: IssueType;
  title: string;
  description: string;
  reporter: string;
  assignee?: string;
  status: IssueStatus;
  severity: Severity;
  votes: Set<string>; // voter user ids — one vote each
  comments: BoardComment[];
  createdAt: string;
  updatedAt: string;
  /** Linked merge-candidate ids (review verdicts) */
  mergeIds: string[];
}

export interface MergeCandidate {
  id: string;
  issueId: string;
  branch: string;
  author: string;
  commitSha: string;
  checks: {
    testsPass: boolean;
    benchmarkScore: number; // 0-100 from eval harness
    lintClean: boolean;
  };
  approvals: Set<string>;
  rejections: Array<{ by: string; reason: string }>;
  status: "pending" | "accepted" | "rejected";
}

export const MERGE_POLICY = {
  minApprovals: 2,
  minBenchmarkScore: 70,
  requireTests: true,
  requireLint: true,
} as const;

// ─── Benefit scoring ──────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<Severity, number> = { trivial: 1, minor: 3, major: 8, critical: 20 };

/**
 * Benefit score: votes dominate (each voter adds 10), severity adds urgency,
 * bugs outrank equal-vote features (broken software blocks value), and recent
 * activity gets a small boost so fresh feedback surfaces.
 */
export function benefitScore(issue: BoardIssue, now = new Date()): number {
  let score = issue.votes.size * 10 + SEVERITY_WEIGHT[issue.severity];
  if (issue.type === "bug") score += 5;
  if (issue.status === "in-progress") score += 4; // finish what you started
  const ageDays = Math.max(0, (now.getTime() - Date.parse(issue.updatedAt)) / 86_400_000);
  score += Math.max(0, 6 - ageDays); // freshness bonus decays over ~6 days
  return Math.round(score * 100) / 100;
}

/** Rank issues for swarm consumption: highest benefit first, done items last. */
export function prioritize(issues: BoardIssue[], now = new Date()): BoardIssue[] {
  return [...issues].sort((a, b) => {
    const doneDiff = Number(a.status === "done") - Number(b.status === "done");
    if (doneDiff !== 0) return doneDiff;
    return benefitScore(b, now) - benefitScore(a, now);
  });
}

// ─── Manager ──────────────────────────────────────────────────────────────────

let seq = 0;

export class CollabBoard {
  private issues = new Map<string, BoardIssue>();
  private merges = new Map<string, MergeCandidate>();
  private counters = new Map<string, number>(); // projectId -> seq

  createIssue(projectId: string, input: { type: IssueType; title: string; description: string; reporter: string; severity?: Severity }): BoardIssue {
    const n = (this.counters.get(projectId) ?? 0) + 1;
    this.counters.set(projectId, n);
    const nowIso = new Date().toISOString();
    const issue: BoardIssue = {
      id: `iss-${nowIso}-${++seq}`,
      key: `${projectId.toUpperCase()}-${n}`,
      projectId,
      type: input.type,
      title: input.title,
      description: input.description,
      reporter: input.reporter,
      status: "backlog",
      severity: input.severity ?? "minor",
      votes: new Set(),
      comments: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      mergeIds: [],
    };
    this.issues.set(issue.id, issue);
    return issue;
  }

  get(idOrKey: string): BoardIssue | undefined {
    return this.issues.get(idOrKey) ?? [...this.issues.values()].find((i) => i.key === idOrKey);
  }

  setStatus(idOrKey: string, status: IssueStatus): boolean {
    const i = this.get(idOrKey);
    if (!i) return false;
    i.status = status;
    i.updatedAt = new Date().toISOString();
    return true;
  }

  vote(idOrKey: string, userId: string): boolean {
    const i = this.get(idOrKey);
    if (!i || i.votes.has(userId)) return false;
    i.votes.add(userId);
    i.updatedAt = new Date().toISOString();
    return true;
  }

  comment(idOrKey: string, author: string, body: string, tags: string[] = []): BoardComment | null {
    const i = this.get(idOrKey);
    if (!i) return null;
    const c: BoardComment = { id: `cmt-${Date.now().toString(36)}-${++seq}`, author, body, at: new Date().toISOString(), tags };
    i.comments.push(c);
    i.updatedAt = c.at;
    return c;
  }

  /**
   * Work orders for a swarm worker: open issues ranked by benefit with all
   * team feedback attached — the agent's view of "what humans want next".
   */
  workOrders(limit = 10): Array<{ key: string; title: string; type: IssueType; severity: Severity; benefit: number; feedback: string[] }> {
    const open = [...this.issues.values()].filter((i) => i.status !== "done");
    return prioritize(open)
      .slice(0, limit)
      .map((i) => ({
        key: i.key,
        title: i.title,
        type: i.type,
        severity: i.severity,
        benefit: benefitScore(i),
        feedback: i.comments.map((c) => `${c.author}${c.tags.length ? ` [${c.tags.join(",")}]` : ""}: ${c.body}`),
      }));
  }

  // ── Merge acceptance ────────────────────────────────────────────────────────

  submitMerge(input: { issueId: string; branch: string; author: string; commitSha: string; testsPass: boolean; benchmarkScore: number; lintClean: boolean }): MergeCandidate {
    const m: MergeCandidate = {
      id: `mrg-${Date.now().toString(36)}-${++seq}`,
      issueId: input.issueId,
      branch: input.branch,
      author: input.author,
      commitSha: input.commitSha,
      checks: { testsPass: input.testsPass, benchmarkScore: input.benchmarkScore, lintClean: input.lintClean },
      approvals: new Set(),
      rejections: [],
      status: "pending",
    };
    this.merges.set(m.id, m);
    const issue = this.issues.get(input.issueId);
    if (issue && !issue.mergeIds.includes(m.id)) issue.mergeIds.push(m.id);
    return m;
  }

  approveMerge(mergeId: string, reviewer: string): void {
    const m = this.merges.get(mergeId);
    if (m && m.status === "pending") m.approvals.add(reviewer);
  }

  rejectMerge(mergeId: string, reviewer: string, reason: string): void {
    const m = this.merges.get(mergeId);
    if (m && m.status === "pending") m.rejections.push({ by: reviewer, reason });
  }

  /**
   * Evaluate whether the RIGHT code was accepted: objective checks are hard
   * gates, then the approval/rejection balance decides. Re-evaluates on every
   * call so late reviews flip the verdict.
   */
  evaluateMerge(mergeId: string): { status: MergeCandidate["status"]; reasons: string[] } | null {
    const m = this.merges.get(mergeId);
    if (!m) return null;
    const reasons: string[] = [];
    if (m.status !== "pending") return { status: m.status, reasons };
    if (MERGE_POLICY.requireTests && !m.checks.testsPass) reasons.push("tests failing");
    if (m.checks.benchmarkScore < MERGE_POLICY.minBenchmarkScore) reasons.push(`benchmark ${m.checks.benchmarkScore} < ${MERGE_POLICY.minBenchmarkScore}`);
    if (MERGE_POLICY.requireLint && !m.checks.lintClean) reasons.push("lint errors");
    if (reasons.length) {
      m.status = "rejected";
      m.rejections.push({ by: "ci-gate", reason: reasons.join("; ") });
      return { status: m.status, reasons };
    }
    if (m.rejections.length > 0) {
      m.status = "rejected";
      return { status: m.status, reasons: m.rejections.map((r) => `${r.by}: ${r.reason}`) };
    }
    if (m.approvals.size >= MERGE_POLICY.minApprovals) {
      m.status = "accepted";
      const issue = this.issues.get(m.issueId);
      if (issue && issue.status !== "done") this.setStatus(issue.id, "review");
      return { status: m.status, reasons: [`${m.approvals.size} approvals`] };
    }
    return { status: m.status, reasons: [`needs ${MERGE_POLICY.minApprovals - m.approvals.size} more approval(s)`] };
  }

  projectSummary(projectId: string): string {
    const issues = [...this.issues.values()].filter((i) => i.projectId === projectId);
    const lines = [`PROJECT ${projectId}: ${issues.length} issues`];
    for (const i of prioritize(issues).slice(0, 8)) {
      lines.push(`[${i.key}] ${i.status} ${i.type}/${i.severity} benefit=${benefitScore(i)} votes=${i.votes.size} — ${i.title}`);
    }
    return lines.join("\n");
  }

  listIssues(projectId?: string): BoardIssue[] {
    const all = [...this.issues.values()];
    return prioritize(projectId ? all.filter((i) => i.projectId === projectId) : all);
  }

  listMerges(): MergeCandidate[] {
    return [...this.merges.values()];
  }
}

let singleton: CollabBoard | undefined;
export function getCollabBoard(): CollabBoard {
  singleton ??= new CollabBoard();
  return singleton;
}

/**
 * stitaP Approvals — Human-in-the-Loop Gate
 *
 * Hermes-parity gap: autonomous swarms need a policy-driven choke point where
 * risky actions pause for a human instead of failing open or closed globally.
 *
 * - Risk levels with per-level policies (auto-approve, require-human, block)
 * - Requests carry full context (action, tool, reason) so the human can
 *   decide in seconds
 * - Expiry: unattended requests don't clog the queue forever — they resolve
 *   to the configured default after a timeout
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ApprovalDecision = "approved" | "rejected" | "expired" | "auto-approved";

export interface ApprovalRequest {
  id: string;
  runId?: string;
  title: string;
  toolId: string;
  actionSummary: string;
  risk: RiskLevel;
  requestedBy: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | ApprovalDecision;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
}

export interface ApprovalPolicy {
  low: "auto-approve" | "require-human" | "block";
  medium: "auto-approve" | "require-human" | "block";
  high: "auto-approve" | "require-human" | "block";
  critical: "auto-approve" | "require-human" | "block";
}

export const STRICT_POLICY: ApprovalPolicy = { low: "require-human", medium: "require-human", high: "require-human", critical: "block" };
export const BALANCED_POLICY: ApprovalPolicy = { low: "auto-approve", medium: "require-human", high: "require-human", critical: "block" };
export const AUTONOMOUS_POLICY: ApprovalPolicy = { low: "auto-approve", medium: "auto-approve", high: "require-human", critical: "require-human" };

// ─── Gate ─────────────────────────────────────────────────────────────────────

let seq = 0;

export class ApprovalGate {
  private requests = new Map<string, ApprovalRequest>();
  private policy: ApprovalPolicy;

  constructor(policy: ApprovalPolicy = BALANCED_POLICY) {
    this.policy = policy;
  }

  setPolicy(policy: ApprovalPolicy): void { this.policy = policy; }
  getPolicy(): ApprovalPolicy { return { ...this.policy }; }

  /**
   * Submit an action through the gate.
   * Returns immediately for auto-approve/block; require-human returns a
   * pending request the host surfaces in the UI/chat.
   */
  submit(input: { title: string; toolId: string; actionSummary: string; risk: RiskLevel; requestedBy: string; runId?: string }, opts?: { ttlMs?: number }): ApprovalRequest {
    const rule = this.policy[input.risk];
    const now = Date.now();
    if (rule === "block") throw new Error(`BLOCKED_BY_POLICY: ${input.risk}-risk actions are not permitted (${input.toolId})`);
    const req: ApprovalRequest = {
      id: `apr-${now.toString(36)}-${++seq}`,
      ...(input.runId ? { runId: input.runId } : {}),
      title: input.title,
      toolId: input.toolId,
      actionSummary: input.actionSummary,
      risk: input.risk,
      requestedBy: input.requestedBy,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + (opts?.ttlMs ?? 24 * 3600 * 1000)).toISOString(),
      status: rule === "auto-approve" ? "auto-approved" : "pending",
    };
    if (req.status !== "pending") req.decidedAt = new Date().toISOString();
    this.requests.set(req.id, req);
    return req;
  }

  /** Human decision on a pending request. */
  decide(id: string, decision: "approved" | "rejected", by: string, note?: string): boolean {
    const r = this.requests.get(id);
    if (!r || r.status !== "pending") return false;
    r.status = decision;
    r.decidedAt = new Date().toISOString();
    r.decidedBy = by;
    if (note) r.note = note;
    return true;
  }

  /**
   * Expire stale pending requests. Long-running agents call this each tick so
   * the queue reflects reality. Expired requests resolve to `expired` and the
   * caller should treat them as rejected by default.
   */
  expireStale(now = new Date()): number {
    let n = 0;
    const t = now.getTime();
    for (const r of this.requests.values()) {
      if (r.status === "pending" && Date.parse(r.expiresAt) <= t) {
        r.status = "expired";
        r.decidedAt = new Date(t).toISOString();
        n++;
      }
    }
    return n;
  }

  pending(): ApprovalRequest[] {
    return [...this.requests.values()]
      .filter((r) => r.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  history(limit = 50): ApprovalRequest[] {
    return [...this.requests.values()]
      .filter((r) => r.status !== "pending")
      .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
      .slice(0, limit);
  }

  compact(): string {
    const p = this.pending();
    return p.length
      ? p.map((r) => `[${r.id}] ${r.risk.toUpperCase()} ${r.title} via ${r.toolId} (expires ${r.expiresAt})`).join("\n")
      : "(no pending approvals)";
  }
}

let singleton: ApprovalGate | undefined;
export function getApprovalGate(policy?: ApprovalPolicy): ApprovalGate {
  singleton ??= new ApprovalGate(policy);
  return singleton;
}

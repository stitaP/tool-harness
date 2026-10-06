/**
 * Human-in-the-loop approvals. Any client (CLI, web, gateway) can answer a
 * pending request; unanswered requests time out to "deny".
 */
import { newId } from "../util/misc.js";
import { matchesAllow } from "./dangerous.js";
import type { ApprovalRequest } from "../tools/types.js";

export type Decision = "once" | "session" | "always" | "deny";

export interface Pending extends ApprovalRequest { id: string; createdAt: number; resolve: (d: Decision) => void }

export class ApprovalManager {
  pending = new Map<string, Pending>();
  private sessionAllow = new Map<string, Set<string>>(); // sessionId → approved commands / tools
  yoloSessions = new Set<string>();

  constructor(
    private getMode: () => string,
    private getAllowPatterns: () => string[],
    private persistAllow: (pattern: string) => void,
    private onRequest: (p: Omit<Pending, "resolve">) => void,
    private timeoutMs: () => number,
  ) {}

  /** Returns true when the action may proceed. */
  async check(req: ApprovalRequest, opts: { headlessMode?: string } = {}): Promise<boolean> {
    const mode = opts.headlessMode ?? (this.yoloSessions.has(req.sessionId) ? "yolo" : this.getMode());
    if (mode === "yolo") return true;
    if (matchesAllow(req.command, this.getAllowPatterns())) return true;
    const sess = this.sessionAllow.get(req.sessionId);
    if (sess?.has(req.command) || sess?.has(`tool:${req.tool}`)) return true;
    if (mode === "deny") return false;
    const id = newId("ap_");
    const d = await new Promise<Decision>((resolve) => {
      const p: Pending = { ...req, id, createdAt: Date.now(), resolve };
      this.pending.set(id, p);
      const { resolve: _r, ...pub } = p;
      this.onRequest(pub);
      setTimeout(() => { if (this.pending.has(id)) this.respond(id, "deny"); }, this.timeoutMs()).unref?.();
    });
    if (d === "session") { if (!this.sessionAllow.has(req.sessionId)) this.sessionAllow.set(req.sessionId, new Set()); this.sessionAllow.get(req.sessionId)!.add(req.command); }
    if (d === "always") this.persistAllow(req.command);
    return d !== "deny";
  }

  respond(id: string, d: Decision): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    this.pending.delete(id);
    p.resolve(d);
    return true;
  }

  /** Answer the oldest pending request for a session (used by /approve, /deny). */
  respondLatest(sessionId: string, d: Decision): boolean {
    const p = [...this.pending.values()].filter((x) => x.sessionId === sessionId).sort((a, b) => a.createdAt - b.createdAt)[0];
    return p ? this.respond(p.id, d) : false;
  }

  cancelSession(sessionId: string): void {
    for (const p of [...this.pending.values()]) if (p.sessionId === sessionId) this.respond(p.id, "deny");
  }

  list(sessionId?: string) {
    return [...this.pending.values()].filter((p) => !sessionId || p.sessionId === sessionId).map(({ resolve: _r, ...p }) => p);
  }
}

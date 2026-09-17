import { internalMutation } from "./_generated/server";
import {
  AUDIT_LOG_MAX_DAYS,
  DEFAULT_POLICY,
  RETENTION_MAX_DAYS,
} from "../lib/capture/policy";

/**
 * Retention job (Phase 7) — internal so it can be scheduled by the hourly
 * cron (`crons.ts`) and triggered from the admin UI (`policy.runRetentionNow`).
 *
 * Lives in its own module to keep `policy.ts` free of self-references through
 * the generated `internal` object (which break TS inference).
 *
 * Prunes library captures past the user's retention policy (default 365 days,
 * 0 = keep forever) and audit records past `max(retentionDays,
 * AUDIT_LOG_MAX_DAYS)`. Storage blobs for pruned captures are deleted with the
 * row.
 */
export const runRetention = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const policies = await ctx.db.query("policies").collect();
    const retentionByUser = new Map<string, number>();
    for (const p of policies) retentionByUser.set(p.userId, p.retentionDays);

    // Captures.
    const captures = await ctx.db.query("captures").collect();
    const deletedByUser = new Map<string, number>();
    let deletedCaptures = 0;
    for (const c of captures) {
      const days = retentionByUser.get(c.userId) ?? DEFAULT_POLICY.retentionDays;
      if (days <= 0) continue;
      const cutoff = now - days * 86_400_000;
      if (c._creationTime >= cutoff) continue;
      try {
        await ctx.storage.delete(c.storageId);
      } catch {
        // Row still gets pruned even if the blob is already gone.
      }
      await ctx.db.delete(c._id);
      deletedCaptures += 1;
      deletedByUser.set(c.userId, (deletedByUser.get(c.userId) ?? 0) + 1);
    }
    for (const [userId, n] of deletedByUser) {
      await ctx.db.insert("auditLogs", {
        userId,
        action: "retention.pruned",
        detail: `Deleted ${n} capture(s) past the retention policy.`,
      });
    }

    // Audit logs: keep at least AUDIT_LOG_MAX_DAYS (min 30d), bounded by retention.
    const dayValues = [...retentionByUser.values(), DEFAULT_POLICY.retentionDays].filter(
      (d) => d > 0,
    );
    const auditCap = Math.max(30, Math.min(AUDIT_LOG_MAX_DAYS, ...dayValues));
    const auditCutoff = now - auditCap * 86_400_000;
    const auditRows = await ctx.db.query("auditLogs").collect();
    let prunedAudit = 0;
    for (const a of auditRows) {
      if (a._creationTime < auditCutoff) {
        await ctx.db.delete(a._id);
        prunedAudit += 1;
      }
    }

    return {
      deletedCaptures,
      prunedAudit,
      auditCapDays: auditCap,
      retentionCapDays: Math.max(0, Math.min(RETENTION_MAX_DAYS, ...dayValues)),
    };
  },
});

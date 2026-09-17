import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getCurrentUser } from "./users";
import {
  AUDIT_LOG_MAX_DAYS,
  CAPTURE_MODES,
  DEFAULT_POLICY,
  RETENTION_MAX_DAYS,
  sanitizePolicyInput,
  sanitizeAllowedModes,
  summarizePolicy,
} from "../lib/capture/policy";
import type { CapturePolicy } from "../lib/capture/policy";

/**
 * Enterprise capture policy + audit trail (Phase 7).
 *
 * Policy rows are per-user. Editing requires the `admin` role; the first user
 * to edit policy bootstraps themselves as admin (single-org start, blueprint
 * §5.3). URL captures enforce the policy inside `captureUrl.ts` (offline
 * mode, allowlist/denylist) *after* the SSRF guard.
 */

export type PolicyRow = Doc<"policies">;

export function policyRowToModel(row: PolicyRow): CapturePolicy {
  return {
    allowlist: row.allowlist,
    denylist: row.denylist,
    allowRemoteCapture: row.allowRemoteCapture,
    retentionDays: row.retentionDays,
    allowedModes: sanitizeAllowedModes(row.allowedModes),
  };
}

/** The caller's effective policy — defaults when no row exists yet. */
export const getMyPolicy = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db
      .query("policies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!row) return { ...DEFAULT_POLICY, isDefault: true };
    return { ...policyRowToModel(row), isDefault: false };
  },
});

/** Internal read used by the captureUrl action (no auth round-trip). */
export const internalPolicyForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("policies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return row ? policyRowToModel(row) : null;
  },
});

/** Update the caller's policy. Admin-gated, with first-user bootstrap. */
export const updateMyPolicy = mutation({
  args: {
    allowlist: v.array(v.string()),
    denylist: v.array(v.string()),
    allowRemoteCapture: v.boolean(),
    retentionDays: v.number(),
    allowedModes: v.array(v.union(...CAPTURE_MODES.map((m) => v.literal(m)))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    let isAdmin = user.role === "admin";
    if (!isAdmin) {
      const all = await ctx.db.query("users").collect();
      const anyAdmin = all.some((u) => u.role === "admin");
      if (anyAdmin) {
        throw new Error("Only admins can change the capture policy");
      }
      // Bootstrap: the first user to touch policy becomes admin.
      await ctx.db.patch(user._id, { role: "admin" });
      isAdmin = true;
    }

    const policy = sanitizePolicyInput({
      allowlist: args.allowlist,
      denylist: args.denylist,
      allowRemoteCapture: args.allowRemoteCapture,
      retentionDays: args.retentionDays,
      allowedModes: args.allowedModes,
    });
    const existing = await ctx.db
      .query("policies")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...policy, userId: user._id });
    } else {
      await ctx.db.insert("policies", { ...policy, userId: user._id });
    }
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: "policy.updated",
      detail: summarizePolicy(policy),
    });
    return { ok: true, role: isAdmin ? ("admin" as const) : user.role };
  },
});

/** Whether the caller can administer policy (used by the Settings UI). */
export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;
    if (user.role === "admin") return true;
    const all = await ctx.db.query("users").collect();
    return !all.some((u) => u.role === "admin"); // bootstrap: no admin yet
  },
});

/** Recent audit entries for the caller (newest first). */
export const listMyAudit = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(limit ?? 100, 500));
    return rows.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      action: r.action,
      detail: r.detail,
    }));
  },
});

/** Client-side audit record (exports, redactions, report generation). */
export const recordAudit = mutation({
  args: { action: v.string(), detail: v.string() },
  handler: async (ctx, { action, detail }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    await ctx.db.insert("auditLogs", {
      userId,
      action: action.slice(0, 80),
      detail: detail.slice(0, 500),
    });
  },
});

/** Server-side audit record (captureUrl action, retention job). */
export const recordAuditInternal = internalMutation({
  args: { userId: v.string(), action: v.string(), detail: v.string() },
  handler: async (ctx, { userId, action, detail }) => {
    await ctx.db.insert("auditLogs", {
      userId,
      action: action.slice(0, 80),
      detail: detail.slice(0, 500),
    });
  },
});

/**
 * Public admin-gated trigger for the retention job (used by the Settings
 * page “Run retention now” button; the hourly schedule lives in `crons.ts`).
 */
export interface RetentionRunSummary {
  deletedCaptures: number;
  prunedAudit: number;
  auditCapDays: number;
  retentionCapDays: number;
}

export const runRetentionNow = mutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<RetentionRunSummary> => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthenticated");
    if (user.role !== "admin") throw new Error("Only admins can run retention");
    return await ctx.runMutation(internal.retention.runRetention, {});
  },
});

/**
 * stitaP Workflow CRUD
 *
 * Convex mutations and queries for multi-agent workflow runs,
 * step results, agent contributions, and execution events.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── Workflow Runs ──────────────────────────────────────────────────────────

/** Start a new workflow run */
export const startRun = mutation({
  args: {
    workflowId: v.string(),
    type: v.string(),
    name: v.string(),
    goal: v.string(),
    context: v.string(),
    configJson: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject ?? "anonymous";

    const runId = await ctx.db.insert("workflowRuns", {
      userId,
      workflowId: args.workflowId,
      type: args.type,
      name: args.name,
      goal: args.goal,
      context: args.context,
      status: "running",
      configJson: args.configJson,
      totalTokensUsed: 0,
      totalDurationMs: 0,
      stepsCompleted: 0,
      stepsFailed: 0,
      startedAt: Date.now(),
      createdAt: Date.now(),
    });

    return runId;
  },
});

/** Update workflow run status */
export const updateRunStatus = mutation({
  args: {
    runId: v.id("workflowRuns"),
    status: v.string(),
    totalTokensUsed: v.optional(v.number()),
    totalDurationMs: v.optional(v.number()),
    stepsCompleted: v.optional(v.number()),
    stepsFailed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { status: args.status };
    if (args.totalTokensUsed !== undefined) updates.totalTokensUsed = args.totalTokensUsed;
    if (args.totalDurationMs !== undefined) updates.totalDurationMs = args.totalDurationMs;
    if (args.stepsCompleted !== undefined) updates.stepsCompleted = args.stepsCompleted;
    if (args.stepsFailed !== undefined) updates.stepsFailed = args.stepsFailed;
    if (args.status === "completed" || args.status === "failed" || args.status === "aborted") {
      updates.completedAt = Date.now();
    }
    await ctx.db.patch(args.runId, updates);
  },
});

/** Get all runs for the current user */
export const getUserRuns = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject ?? "anonymous";

    return await ctx.db
      .query("workflowRuns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

/** Get a single run by ID */
export const getRun = query({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

// ─── Step Results ───────────────────────────────────────────────────────────

/** Record a step result */
export const recordStepResult = mutation({
  args: {
    runId: v.id("workflowRuns"),
    stepId: v.string(),
    stepName: v.string(),
    role: v.string(),
    status: v.string(),
    progress: v.number(),
    tokensUsed: v.number(),
    durationMs: v.number(),
    result: v.optional(v.string()),
    verificationPassed: v.optional(v.boolean()),
    issues: v.optional(v.array(v.string())),
    retryCount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject ?? "anonymous";

    await ctx.db.insert("workflowStepResults", {
      userId,
      runId: args.runId,
      stepId: args.stepId,
      stepName: args.stepName,
      role: args.role,
      status: args.status,
      progress: args.progress,
      tokensUsed: args.tokensUsed,
      durationMs: args.durationMs,
      result: args.result,
      verificationPassed: args.verificationPassed,
      issues: args.issues,
      retryCount: args.retryCount,
      startedAt: Date.now(),
      completedAt: args.status === "completed" || args.status === "failed" ? Date.now() : undefined,
    });
  },
});

/** Get step results for a run */
export const getRunSteps = query({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowStepResults")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
  },
});

// ─── Agent Contributions ───────────────────────────────────────────────────

/** Record an agent contribution */
export const recordContribution = mutation({
  args: {
    runId: v.id("workflowRuns"),
    stepId: v.string(),
    agentRole: v.string(),
    agentName: v.string(),
    content: v.string(),
    tokensUsed: v.number(),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject ?? "anonymous";

    await ctx.db.insert("workflowAgentContributions", {
      userId,
      runId: args.runId,
      stepId: args.stepId,
      agentRole: args.agentRole,
      agentName: args.agentName,
      content: args.content,
      tokensUsed: args.tokensUsed,
      durationMs: args.durationMs,
      timestamp: Date.now(),
    });
  },
});

/** Get contributions for a run */
export const getRunContributions = query({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowAgentContributions")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
  },
});

// ─── Events ─────────────────────────────────────────────────────────────────

/** Record an execution event */
export const recordEvent = mutation({
  args: {
    runId: v.id("workflowRuns"),
    eventType: v.string(),
    agentRole: v.optional(v.string()),
    stepId: v.optional(v.string()),
    message: v.string(),
    tokensUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject ?? "anonymous";

    await ctx.db.insert("workflowEvents", {
      userId,
      runId: args.runId,
      eventType: args.eventType,
      agentRole: args.agentRole,
      stepId: args.stepId,
      message: args.message,
      tokensUsed: args.tokensUsed,
      timestamp: Date.now(),
    });
  },
});

/** Get events for a run */
export const getRunEvents = query({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowEvents")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .order("asc")
      .collect();
  },
});

// ─── Stats ──────────────────────────────────────────────────────────────────

/** Get aggregate stats for the current user */
export const getUserStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject ?? "anonymous";

    const runs = await ctx.db
      .query("workflowRuns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const totalRuns = runs.length;
    const completedRuns = runs.filter((r) => r.status === "completed").length;
    const totalTokens = runs.reduce((sum, r) => sum + r.totalTokensUsed, 0);
    const totalTime = runs.reduce((sum, r) => sum + r.totalDurationMs, 0);

    // Breakdown by type
    const byType: Record<string, number> = {};
    for (const run of runs) {
      byType[run.type] = (byType[run.type] || 0) + 1;
    }

    return {
      totalRuns,
      completedRuns,
      failedRuns: runs.filter((r) => r.status === "failed").length,
      successRate: totalRuns > 0 ? completedRuns / totalRuns : 0,
      totalTokens,
      totalTime,
      byType,
    };
  },
});

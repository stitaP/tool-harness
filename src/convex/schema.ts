import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Enterprise capture policy (Phase 7): one row per user. Enforced
    // server-side in captureUrl.ts; edited from the Settings page.
    policies: defineTable({
      userId: v.string(),
      allowlist: v.array(v.string()),
      denylist: v.array(v.string()),
      allowRemoteCapture: v.boolean(),
      retentionDays: v.number(),
      allowedModes: v.array(v.string()),
    }).index("by_user", ["userId"]),

    // Security audit trail (Phase 7): captures created/deleted, policy
    // changes, exports, retention prunes. Pruned by the retention job.
    auditLogs: defineTable({
      userId: v.string(),
      action: v.string(),
      detail: v.string(),
    }).index("by_user", ["userId"]),

    // Saved SVG captures in the user's library.
    captures: defineTable({
      userId: v.string(),
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      url: v.optional(v.string()),
      source: v.optional(
        v.union(v.literal("demo"), v.literal("url"), v.literal("extension")),
      ), // how the capture was made; extension = current-tab browser extension
      captureMode: v.string(),
      width: v.number(),
      height: v.number(),
      thumbnail: v.string(), // data:image/webp;base64,...
      metadataJson: v.string(),
      storageId: v.id("_storage"), // published SVG document
      createdAt: v.number(),
      // On-device semantic search (NLP layer): L2-normalized embedding + the
      // embedder model id that produced it (MiniLM-L6-v2 or rule fallback).
      // Rows are ranked server-side through the `by_embedding` vector index
      // (searchByEmbedding action); the client-side cosine path over
      // getCaptureEmbeddings remains as a fallback for smaller deployments.
      embedding: v.optional(v.array(v.number())),
      embedModel: v.optional(v.string()),
      // OCR-at-capture text (blueprint §14) — flattened, searchable text that
      // feeds the semantic index without parsing metadataJson on every pass.
      ocrText: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .vectorIndex("by_embedding", {
        vectorField: "embedding",
        dimensions: 384,
        filterFields: ["userId"],
      }),

    // ── Teamwork: Multi-agent workflow runs ──
    workflowRuns: defineTable({
      userId: v.string(),
      workflowId: v.string(),
      type: v.string(), // iterative-coding | distributed-coding | long-proof | self-verification | document-review
      name: v.string(),
      goal: v.string(),
      context: v.string(),
      status: v.string(), // queued | running | paused | completed | failed | aborted
      configJson: v.string(), // full WorkflowConfig serialized
      totalTokensUsed: v.number(),
      totalDurationMs: v.number(),
      stepsCompleted: v.number(),
      stepsFailed: v.number(),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"])
      .index("by_type", ["type"]),

    // Individual step results within a workflow run
    workflowStepResults: defineTable({
      userId: v.string(),
      runId: v.id("workflowRuns"),
      stepId: v.string(),
      stepName: v.string(),
      role: v.string(),
      status: v.string(), // pending | running | completed | failed | skipped
      progress: v.number(), // 0-100
      tokensUsed: v.number(),
      durationMs: v.number(),
      result: v.optional(v.string()),
      verificationPassed: v.optional(v.boolean()),
      issues: v.optional(v.array(v.string())),
      retryCount: v.number(),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
    })
      .index("by_run", ["runId"])
      .index("by_user", ["userId"]),

    // Agent contributions (what each agent did at each step)
    workflowAgentContributions: defineTable({
      userId: v.string(),
      runId: v.id("workflowRuns"),
      stepId: v.string(),
      agentRole: v.string(),
      agentName: v.string(),
      content: v.string(),
      tokensUsed: v.number(),
      durationMs: v.number(),
      timestamp: v.number(),
    })
      .index("by_run", ["runId"])
      .index("by_user", ["userId"]),

    // Execution event log (for the event log panel)
    workflowEvents: defineTable({
      userId: v.string(),
      runId: v.id("workflowRuns"),
      eventType: v.string(), // step_start | step_complete | step_fail | agent_think | agent_output | verification | loop | system
      agentRole: v.optional(v.string()),
      stepId: v.optional(v.string()),
      message: v.string(),
      tokensUsed: v.optional(v.number()),
      timestamp: v.number(),
    })
      .index("by_run", ["runId"])
      .index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;

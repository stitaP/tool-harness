/**
 * stitaP Tool Store — Hermes-Parity Agent Ops Tools
 *
 * - scheduler.jobs    — create/list/due scheduled automations (interval + cron-lite)
 * - knowledge.search  — in-house RAG: ingest docs, retrieve budgeted context
 * - notify.send       — dispatch notifications through channels with dedupe
 * - trace.runs        — start/step/end run traces, waterfall postmortems
 * - approvals.gate    — human-in-the-loop risk gate: submit/decide/pending
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";
import {
  getScheduler,
  getKnowledgeBase,
  getNotifications,
  getTracer,
  getApprovalGate,
} from "../../agent";

// ─── scheduler.jobs ───────────────────────────────────────────────────────────

export const SCHEDULER_JOBS_MANIFEST: ToolManifest = {
  id: "scheduler.jobs",
  name: "Task Scheduler",
  description: "Create and inspect scheduled agent automations using intervals or cron expressions",
  longDescription:
    "Long-running agents need recurring work without a human poking the session. Supports interval seconds and a cron-lite subset (minute hour dom month dow with *, lists, ranges, steps). Jobs carry failure budgets; due jobs are returned for the host runner to execute and results recorded back.",
  category: "agent",
  subcategory: "automation",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["scheduler", "cron", "automation", "recurring", "long-running"],
  icon: "Clock",
  color: "#0ea5e9",
  parameters: [
    { name: "action", type: "enum", description: "add | list | due | remove | record", required: true, enum: ["add", "list", "due", "remove", "record"] },
    { name: "name", type: "string", description: "Job name (add)", required: false },
    { name: "kind", type: "enum", description: "interval | cron | once (add)", required: false, enum: ["interval", "cron", "once"] },
    { name: "spec", type: "string", description: "Interval seconds, cron expr, or ISO time (add)", required: false },
    { name: "toolId", type: "string", description: "Tool to run when the job fires (add)", required: false },
    { name: "jobId", type: "string", description: "Job id (remove/record)", required: false },
    { name: "ok", type: "boolean", description: "Outcome for record action", required: false },
    { name: "durationMs", type: "number", description: "Run duration for record", required: false },
  ],
  capabilities: [
    { name: "schedule-automations", description: "Recurring agent work", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

export async function schedulerJobs(input: ToolInput): Promise<ToolOutput> {
  const sched = getScheduler();
  switch (input.action) {
    case "add": {
      if (!input.name || !input.kind || !input.spec || !input.toolId)
        return { success: false, error: 'add requires "name", "kind", "spec", "toolId"' };
      const job = sched.add(input.name as string, input.kind as "interval", input.spec as string, {
        toolId: input.toolId as string,
        input: (input.jobInput as Record<string, unknown>) ?? {},
      });
      if ("error" in job) return { success: false, error: job.error };
      return { success: true, data: { id: job.id, nextRunAt: job.nextRunAt } };
    }
    case "list":
      return { success: true, data: sched.list().map((j) => ({ id: j.id, name: j.name, kind: j.kind, spec: j.spec, enabled: j.enabled, nextRunAt: j.nextRunAt, failures: `${j.failureCount}/${j.maxFailures}` })) };
    case "due": {
      const due = sched.dueJobs();
      return { success: true, data: due.map((j) => ({ id: j.id, toolId: j.action.toolId, input: j.action.input })) };
    }
    case "remove":
      return { success: sched.remove(input.jobId as string), data: null };
    case "record":
      return { success: sched.recordResult(input.jobId as string, Boolean(input.ok), Number(input.durationMs ?? 0), input.error as string | undefined), data: null };
    default:
      return { success: false, error: `Unknown action "${input.action}"` };
  }
}

// ─── knowledge.search ─────────────────────────────────────────────────────────

export const KNOWLEDGE_SEARCH_MANIFEST: ToolManifest = {
  id: "knowledge.search",
  name: "Knowledge Base (RAG)",
  description: "Ingest documents into a local vector store and retrieve budgeted context for prompts",
  longDescription:
    "Fully local RAG with deterministic hashed embeddings — no model download, works air-gapped. Documents are chunked with overlap and embedded once at write time; retrieval returns top-k hits or a stitched context block sized to an SLM token budget.",
  category: "agent",
  subcategory: "memory",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["rag", "vector", "search", "context", "offline"],
  icon: "BookOpen",
  color: "#8b5cf6",
  parameters: [
    { name: "action", type: "enum", description: "ingest | search | context | sources | stats", required: true, enum: ["ingest", "search", "context", "sources", "stats"] },
    { name: "name", type: "string", description: "Document name (ingest)", required: false },
    { name: "text", type: "string", description: "Document text (ingest)", required: false },
    { name: "query", type: "string", description: "Search query (search/context)", required: false },
    { name: "topK", type: "number", description: "Max hits (default 5)", required: false },
    { name: "tokenBudget", type: "number", description: "Context budget in tokens (default 600)", required: false },
  ],
  capabilities: [
    { name: "local-rag", description: "Offline retrieval-augmented context", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

export async function knowledgeSearch(input: ToolInput): Promise<ToolOutput> {
  const kb = getKnowledgeBase();
  switch (input.action) {
    case "ingest": {
      if (!input.text) return { success: false, error: 'ingest requires "text"' };
      const src = kb.addDocument((input.name as string) ?? "document", input.text as string);
      return { success: true, data: { sourceId: src.id, chunks: src.chunkCount } };
    }
    case "search": {
      if (!input.query) return { success: false, error: 'search requires "query"' };
      return { success: true, data: kb.search(input.query as string, { topK: Number(input.topK ?? 5) }) };
    }
    case "context": {
      if (!input.query) return { success: false, error: 'context requires "query"' };
      return { success: true, data: { context: kb.buildContext(input.query as string, Number(input.tokenBudget ?? 600)) } };
    }
    case "sources":
      return { success: true, data: kb.listSources() };
    case "stats":
      return { success: true, data: kb.stats() };
    default:
      return { success: false, error: `Unknown action "${input.action}"` };
  }
}

// ─── notify.send ──────────────────────────────────────────────────────────────

export const NOTIFY_SEND_MANIFEST: ToolManifest = {
  id: "notify.send",
  name: "Notifications",
  description: "Dispatch agent notifications through severity-filtered channels with quiet hours and dedupe",
  longDescription:
    "In-house dispatcher for long-running agents: add channels (in-app, webhook, log), send notifications filtered by severity rules, quiet hours and per-key dedupe windows so swarm failure storms collapse into one alert. Host provides the actual delivery function at flush time.",
  category: "agent",
  subcategory: "communication",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["notifications", "alerts", "webhook", "quiet-hours", "dedupe"],
  icon: "Bell",
  color: "#f59e0b",
  parameters: [
    { name: "action", type: "enum", description: "send | channel | list | compact", required: true, enum: ["send", "channel", "list", "compact"] },
    { name: "severity", type: "enum", description: "debug|info|warn|error|critical (send)", required: false, enum: ["debug", "info", "warn", "error", "critical"] },
    { name: "title", type: "string", description: "Notification title (send)", required: false },
    { name: "body", type: "string", description: "Notification body (send)", required: false },
    { name: "dedupeKey", type: "string", description: "Collapse repeats inside the dedupe window (send)", required: false },
    { name: "kind", type: "enum", description: "in-app | webhook | log (channel)", required: false, enum: ["in-app", "webhook", "log"] },
    { name: "target", type: "string", description: "Channel target URL/inbox/path (channel)", required: false },
    { name: "minSeverity", type: "enum", description: "Channel threshold (default info)", required: false, enum: ["debug", "info", "warn", "error", "critical"] },
  ],
  capabilities: [
    { name: "notify", description: "Alert humans from long runs", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

export async function notifySend(input: ToolInput): Promise<ToolOutput> {
  const n = getNotifications();
  switch (input.action) {
    case "send": {
      if (!input.title) return { success: false, error: 'send requires "title"' };
      const msg = n.notify(
        (input.severity as "info") ?? "info",
        input.title as string,
        (input.body as string) ?? "",
        new Date(),
        { dedupeKey: input.dedupeKey as string | undefined },
      );
      return msg
        ? { success: true, data: { id: msg.id, queued: true } }
        : { success: true, data: { queued: false, reason: "suppressed by severity/quiet-hours/dedupe" } };
    }
    case "channel": {
      if (!input.target) return { success: false, error: 'channel requires "target"' };
      const ch = n.addChannel((input.kind as "in-app") ?? "in-app", input.target as string, {
        minSeverity: (input.minSeverity as "info") ?? "info",
      });
      return { success: true, data: { channelId: ch.id } };
    }
    case "list":
      return { success: true, data: n.listChannels() };
    case "compact":
      return { success: true, data: { summary: n.compact(), pending: n.pending().length } };
    default:
      return { success: false, error: `Unknown action "${input.action}"` };
  }
}

// ─── trace.runs ───────────────────────────────────────────────────────────────

export const TRACE_RUNS_MANIFEST: ToolManifest = {
  id: "trace.runs",
  name: "Run Tracing",
  description: "Trace agent runs as span trees with token accounting and waterfall postmortems",
  longDescription:
    "Per-run observability: open spans around each step/tool call, close them with status and token counts, then render a waterfall you can attach to postmortems or Jira comments. Traces auto-close dangling spans and prune old runs.",
  category: "agent",
  subcategory: "observability",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["tracing", "observability", "spans", "tokens", "postmortem"],
  icon: "Activity",
  color: "#10b981",
  parameters: [
    { name: "action", type: "enum", description: "start | span | end-span | finish | list | waterfall", required: true, enum: ["start", "span", "end-span", "finish", "list", "waterfall"] },
    { name: "name", type: "string", description: "Run/span/span-name label", required: false },
    { name: "runId", type: "string", description: "Trace id", required: false },
    { name: "spanIndex", type: "number", description: "Span index within trace (end-span)", required: false },
    { name: "status", type: "enum", description: "ok | error | cancelled", required: false, enum: ["ok", "error", "cancelled"] },
    { name: "tokensIn", type: "number", description: "Prompt tokens consumed", required: false },
    { name: "tokensOut", type: "number", description: "Completion tokens produced", required: false },
    { name: "error", type: "string", description: "Error message (end-span)", required: false },
  ],
  capabilities: [
    { name: "trace", description: "Per-run observability", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

export async function traceRuns(input: ToolInput): Promise<ToolOutput> {
  const tracer = getTracer();
  switch (input.action) {
    case "start": {
      const t = tracer.start((input.name as string) ?? "run");
      return { success: true, data: { runId: t.id } };
    }
    case "span": {
      const s = tracer.span(input.runId as string, (input.name as string) ?? "step");
      return s ? { success: true, data: { spanId: s.id, index: Number(s.id.split("s").pop()) } } : { success: false, error: "trace not found" };
    }
    case "end-span": {
      const t = tracer.get(input.runId as string);
      const idx = Number(input.spanIndex ?? 1) - 1;
      const s = t?.spans[idx];
      if (!s) return { success: false, error: "span not found" };
      tracer.endSpan(s, (input.status as "ok") ?? "ok", {
        tokensIn: input.tokensIn as number | undefined,
        tokensOut: input.tokensOut as number | undefined,
        ...(input.error ? { error: input.error as string } : {}),
      });
      return { success: true, data: null };
    }
    case "finish":
      return { success: tracer.finish(input.runId as string, (input.status as "ok") ?? "ok"), data: null };
    case "list":
      return { success: true, data: tracer.list() };
    case "waterfall":
      return { success: true, data: { waterfall: tracer.renderWaterfall(input.runId as string) } };
    default:
      return { success: false, error: `Unknown action "${input.action}"` };
  }
}

// ─── approvals.gate ───────────────────────────────────────────────────────────

export const APPROVALS_GATE_MANIFEST: ToolManifest = {
  id: "approvals.gate",
  name: "Approval Gate",
  description: "Human-in-the-loop risk gate for autonomous agents: submit, decide, expire, configure policy",
  longDescription:
    "Policy-driven choke point where risky actions pause for a human. Per-risk rules (auto-approve / require-human / block) via balanced, strict or autonomous presets. Unattended requests expire on a TTL so queues never clog.",
  category: "agent",
  subcategory: "safety",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["approvals", "human-in-the-loop", "policy", "risk", "autonomy"],
  icon: "ShieldCheck",
  color: "#ef4444",
  parameters: [
    { name: "action", type: "enum", description: "submit | decide | pending | history | policy | expire", required: true, enum: ["submit", "decide", "pending", "history", "policy", "expire"] },
    { name: "title", type: "string", description: "What needs approval (submit)", required: false },
    { name: "toolId", type: "string", description: "Tool that would act (submit)", required: false },
    { name: "risk", type: "enum", description: "low | medium | high | critical (submit)", required: false, enum: ["low", "medium", "high", "critical"] },
    { name: "requestId", type: "string", description: "Request id (decide)", required: false },
    { name: "decision", type: "enum", description: "approved | rejected (decide)", required: false, enum: ["approved", "rejected"] },
    { name: "by", type: "string", description: "Who decided (default 'human')", required: false },
    { name: "preset", type: "enum", description: "balanced | strict | autonomous (policy)", required: false, enum: ["balanced", "strict", "autonomous"] },
  ],
  capabilities: [
    { name: "gate-actions", description: "Human approval workflow", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

export async function approvalsGate(input: ToolInput): Promise<ToolOutput> {
  const gate = getApprovalGate();
  try {
    switch (input.action) {
      case "submit": {
        if (!input.title || !input.toolId || !input.risk)
          return { success: false, error: 'submit requires "title", "toolId", "risk"' };
        const r = gate.submit({
          title: input.title as string,
          toolId: input.toolId as string,
          actionSummary: (input.actionSummary as string) ?? "",
          risk: input.risk as "medium",
          requestedBy: (input.requestedBy as string) ?? "agent",
          ...(input.runId ? { runId: input.runId as string } : {}),
        });
        return { success: true, data: { requestId: r.id, status: r.status } };
      }
      case "decide":
        return {
          success: gate.decide(input.requestId as string, (input.decision as "approved") ?? "approved", (input.by as string) ?? "human"),
          data: null,
        };
      case "pending":
        return { success: true, data: { queue: gate.compact() } };
      case "history":
        return { success: true, data: gate.history() };
      case "policy": {
        const { BALANCED_POLICY, STRICT_POLICY, AUTONOMOUS_POLICY } = await import("../../agent/approvals");
        if (input.preset === "strict") gate.setPolicy(STRICT_POLICY);
        else if (input.preset === "autonomous") gate.setPolicy(AUTONOMOUS_POLICY);
        else if (input.preset === "balanced") gate.setPolicy(BALANCED_POLICY);
        return { success: true, data: { policy: gate.getPolicy() } };
      }
      case "expire":
        return { success: true, data: { expired: gate.expireStale() } };
      default:
        return { success: false, error: `Unknown action "${input.action}"` };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const HERMES_OPS_TOOLS = [
  SCHEDULER_JOBS_MANIFEST,
  KNOWLEDGE_SEARCH_MANIFEST,
  NOTIFY_SEND_MANIFEST,
  TRACE_RUNS_MANIFEST,
  APPROVALS_GATE_MANIFEST,
] as const;

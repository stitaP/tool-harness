/**
 * stitaP Agent — Cloudflare OS Integration
 *
 * Integration layer for the Cloudflare OS fork (cloudflare/cloudflare-os).
 * This module provides hooks that make stitaP tools compatible with the
 * Cloudflare OS environment, enabling agents to run on edge infrastructure.
 *
 * Cloudflare OS provides:
 * - Web Worker-based isolation
 * - KV storage for state
 * - Durable Objects for persistent sessions
 * - R2 for file storage
 * - D1 (SQLite) for structured data
 * - Queues for async processing
 * - AI Gateway for LLM proxying
 *
 * Use cases for Cloudflare OS as an agent runtime:
 * 1. Edge-deployed agents with sub-100ms latency
 * 2. Multi-tenant agent isolation via Workers
 * 3. Persistent agent state via Durable Objects
 * 4. Distributed agent coordination via Queues
 * 5. Global file storage via R2
 * 6. Edge SQL via D1
 * 7. LLM caching and rate limiting via AI Gateway
 * 8. Scheduled agent execution via Cron Triggers
 * 9. Webhook-driven agent activation
 * 10. Real-time agent monitoring via Analytics Engine
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CloudflareOSConfig {
  /** Cloudflare account ID */
  accountId?: string;
  /** API token for Cloudflare API */
  apiToken?: string;
  /** Worker name for agent runtime */
  workerName?: string;
  /** KV namespace for state storage */
  kvNamespace?: string;
  /** Durable Object binding for sessions */
  durableObject?: string;
  /** R2 bucket for file storage */
  r2Bucket?: string;
  /** D1 database for structured data */
  d1Database?: string;
  /** Queue for async processing */
  queueName?: string;
  /** AI Gateway endpoint */
  aiGateway?: string;
}

type StorageBackend = "kv" | "durable_object" | "r2" | "d1" | "ai_gateway" | "none";

export interface CloudflareOSStatus {
  connected: boolean;
  workerHealthy: boolean;
  kvAvailable: boolean;
  durableObjectsAvailable: boolean;
  r2Available: boolean;
  d1Available: boolean;
  queueAvailable: boolean;
  aiGatewayAvailable: boolean;
  lastHealthCheck: string;
}

// ─── Compatibility Layer ────────────────────────────────────────────────────

/**
 * Map stitaP tool categories to Cloudflare OS compatible runtimes.
 */
export const TOOL_CLOUDFLARE_COMPAT: Record<string, {
  workerCompatible: boolean;
  storageBackend: StorageBackend;
  notes: string;
}> = {
  browser: { workerCompatible: false, storageBackend: "none", notes: "Browser automation requires a browser context — run on-device or via headless browser in a dedicated Worker" },
  analytics: { workerCompatible: true, storageBackend: "d1", notes: "SQL/XQL/MDX queries run natively in D1 (SQLite) at the edge" },
  capture: { workerCompatible: false, storageBackend: "r2", notes: "Screenshots stored in R2; capture requires browser context" },
  video: { workerCompatible: false, storageBackend: "r2", notes: "Video processing too heavy for Workers — use dedicated compute" },
  document: { workerCompatible: true, storageBackend: "kv", notes: "Document parsing works in Workers with KV for caching" },
  llm: { workerCompatible: true, storageBackend: "ai_gateway", notes: "LLM calls routed through AI Gateway for caching and rate limiting" },
  visual: { workerCompatible: false, storageBackend: "none", notes: "Image analysis requires GPU/WASM — not suitable for Workers" },
  testing: { workerCompatible: true, storageBackend: "d1", notes: "Test results stored in D1; browser testing needs dedicated runtime" },
  design: { workerCompatible: true, storageBackend: "kv", notes: "Design system rules stored in KV; analysis runs in Worker" },
  agent: { workerCompatible: true, storageBackend: "durable_object", notes: "Agent state persisted via Durable Objects" },
  inference: { workerCompatible: true, storageBackend: "ai_gateway", notes: "Model inference routed through AI Gateway" },
  integration: { workerCompatible: true, storageBackend: "kv", notes: "API keys and configs stored in encrypted KV" },
  sandbox: { workerCompatible: true, storageBackend: "none", notes: "Workers IS the sandbox — perfect isolation" },
  orchestration: { workerCompatible: true, storageBackend: "durable_object", notes: "Workflow state in Durable Objects; async steps via Queues" },
};

/**
 * Generate a wrangler.toml configuration for deploying stitaP agents on Cloudflare OS.
 */
export function generateWranglerConfig(config: CloudflareOSConfig): string {
  const lines: string[] = [];
  lines.push(`name = "${config.workerName ?? "stitap-agent"}"`);
  lines.push(`main = "src/index.ts"`);
  lines.push(`compatibility_date = "2024-01-15"`);
  lines.push("");

  // KV bindings
  if (config.kvNamespace) {
    lines.push("[[kv_namespaces]]");
    lines.push(`binding = "KV"`);
    lines.push(`id = "${config.kvNamespace}"`);
    lines.push("");
  }

  // Durable Objects
  if (config.durableObject) {
    lines.push("[[durable_objects.bindings]]");
    lines.push(`name = "AGENT_SESSION"`);
    lines.push(`class_name = "AgentSession"`);
    lines.push("");

    lines.push("[[migrations]]");
    lines.push(`tag = "v1"`);
    lines.push(`new_classes = ["AgentSession"]`);
    lines.push("");
  }

  // R2
  if (config.r2Bucket) {
    lines.push("[[r2_buckets]]");
    lines.push(`binding = "STORAGE"`);
    lines.push(`bucket_name = "${config.r2Bucket}"`);
    lines.push("");
  }

  // D1
  if (config.d1Database) {
    lines.push("[[d1_databases]]");
    lines.push(`binding = "DB"`);
    lines.push(`database_name = "stitap-analytics"`);
    lines.push(`database_id = "${config.d1Database}"`);
    lines.push("");
  }

  // Queues
  if (config.queueName) {
    lines.push("[[queues.producers]]");
    lines.push(`binding = "QUEUE"`);
    lines.push(`queue = "${config.queueName}"`);
    lines.push("");
  }

  // AI Gateway
  if (config.aiGateway) {
    lines.push("[ai]");
    lines.push(`binding = "AI"`);
    lines.push("");
  }

  // Cron triggers
  lines.push("[triggers]");
  lines.push(`crons = ["0 * * * *"]  # Run agent health check every hour`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate the D1 schema for storing agent data at the edge.
 */
export function generateD1Schema(): string {
  return `
-- stitaP Agent — D1 Schema for Cloudflare OS

-- Agent definitions
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  config TEXT NOT NULL,  -- JSON config
  status TEXT DEFAULT 'inactive',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent runs
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT DEFAULT 'pending',
  input TEXT,  -- JSON input
  output TEXT,  -- JSON output
  error TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  duration_ms INTEGER
);

-- Tool executions
CREATE TABLE IF NOT EXISTS tool_executions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id),
  tool_id TEXT NOT NULL,
  input TEXT,  -- JSON input
  output TEXT,  -- JSON output
  status TEXT DEFAULT 'pending',
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Analytics queries
CREATE TABLE IF NOT EXISTS analytics_queries (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES agent_runs(id),
  query_text TEXT NOT NULL,
  engine TEXT NOT NULL,  -- 'sql', 'xql', 'mdx'
  result TEXT,  -- JSON result
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent sessions (for stateful agents)
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  state TEXT NOT NULL,  -- JSON state
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);

-- File storage metadata (actual files in R2)
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES agent_runs(id),
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_tool_executions_run_id ON tool_executions(run_id);
CREATE INDEX IF NOT EXISTS idx_analytics_queries_run_id ON analytics_queries(run_id);
CREATE INDEX IF NOT EXISTS idx_files_run_id ON files(run_id);
`;
}

/**
 * Generate a Workers script for running stitaP agents on Cloudflare OS.
 */
export function generateWorkerScript(): string {
  return `
// stitaP Agent — Cloudflare Worker Runtime
// Deploy this as a Cloudflare Worker for edge-based agent execution

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", timestamp: new Date().toISOString() });
    }

    // Agent API routes
    if (url.pathname === "/api/agents" && request.method === "GET") {
      const agents = await env.DB.prepare("SELECT * FROM agents").all();
      return Response.json(agents);
    }

    if (url.pathname === "/api/agents" && request.method === "POST") {
      const body = await request.json();
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO agents (id, name, description, config) VALUES (?, ?, ?, ?)"
      ).bind(id, body.name, body.description, JSON.stringify(body.config)).run();
      return Response.json({ id }, { status: 201 });
    }

    if (url.pathname.startsWith("/api/runs/") && request.method === "GET") {
      const runId = url.pathname.split("/").pop();
      const run = await env.DB.prepare("SELECT * FROM agent_runs WHERE id = ?").bind(runId).first();
      if (!run) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json(run);
    }

    // Analytics query endpoint
    if (url.pathname === "/api/query" && request.method === "POST") {
      const { query, engine } = await request.json();
      const start = Date.now();

      // D1 supports standard SQL
      const result = await env.DB.prepare(query).all();
      const duration = Date.now() - start;

      // Log the query
      const logId = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO analytics_queries (id, query_text, engine, result, duration_ms) VALUES (?, ?, ?, ?, ?)"
      ).bind(logId, query, engine, JSON.stringify(result), duration).run();

      return Response.json({
        columns: result.results.length > 0 ? Object.keys(result.results[0]) : [],
        rows: result.results.map(r => Object.values(r)),
        meta: { engine: "d1-sqlite", duration, cells: result.results.length },
      });
    }

    // File storage (R2)
    if (url.pathname.startsWith("/api/files/") && request.method === "GET") {
      const key = url.pathname.replace("/api/files/", "");
      const object = await env.STORAGE.get(key);
      if (!object) return Response.json({ error: "Not found" }, { status: 404 });
      return new Response(object.body, {
        headers: { "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream" },
      });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },

  // Durable Object class for persistent agent sessions
  async scheduled(event, env, ctx) {
    // Cron trigger: clean up expired sessions
    await env.DB.prepare(
      "DELETE FROM agent_sessions WHERE expires_at < datetime('now')"
    ).run();
  },
};
`;
}

// ─── Agent Role Configuration ───────────────────────────────────────────────

/**
 * Pre-defined agent roles for Cloudflare OS deployment.
 * Each role is configured for optimal edge execution.
 */
export const AGENT_ROLES = {
  "data-analyst": {
    name: "Data Analyst",
    description: "Runs SQL/XQL queries against D1, exports results to reporting tools",
    compatibleTools: ["analytics.sql", "analytics.xql", "analytics.mdx", "analytics.export_powerbi", "analytics.export_excel", "analytics.export_sheets"],
    storageBackend: "d1" as const,
    notes: "All analytics run at the edge via D1. Export files stored in R2.",
  },
  "code-reviewer": {
    name: "Code Reviewer",
    description: "Reviews code, finds issues, generates suggestions using LLM",
    compatibleTools: ["llm.prompt", "llm.parse", "document.parse", "design.audit"],
    storageBackend: "kv" as const,
    notes: "LLM calls routed through AI Gateway for caching. Rules stored in KV.",
  },
  "web-scraper": {
    name: "Web Scraper",
    description: "Extracts data from websites, stores in D1 for analysis",
    compatibleTools: ["browser.navigate", "browser.extract", "analytics.sql", "analytics.csv_import"],
    storageBackend: "r2" as const,
    notes: "Raw HTML stored in R2. Extracted data queried via D1.",
  },
  "report-generator": {
    name: "Report Generator",
    description: "Generates reports from data, exports to PowerBI/Excel/Sheets/Tableau",
    compatibleTools: ["analytics.sql", "analytics.export_powerbi", "analytics.export_excel", "analytics.export_sheets", "analytics.export_tableau"],
    storageBackend: "r2" as const,
    notes: "Reports stored in R2. Metadata in D1.",
  },
  "test-runner": {
    name: "Test Runner",
    description: "Runs automated tests, stores results in D1",
    compatibleTools: ["testing.performance", "testing.accessibility", "testing.seo", "testing.security"],
    storageBackend: "d1" as const,
    notes: "Test results in D1. Screenshots in R2.",
  },
};

/**
 * Use cases for Cloudflare OS as an agent platform.
 */
export const CLOUDFLARE_OS_USE_CASES = [
  {
    title: "Edge Agent Deployment",
    description: "Deploy agents to 300+ Cloudflare edge locations for sub-100ms response times",
    architecture: "Worker + Durable Objects + KV",
    example: "Customer support agent that responds in <50ms from the nearest edge",
  },
  {
    title: "Multi-Tenant Agent Isolation",
    description: "Each customer gets their own Worker with isolated state",
    architecture: "Worker per tenant + D1 per tenant + R2 per tenant",
    example: "SaaS platform where each customer has their own AI agent",
  },
  {
    title: "Distributed Agent Coordination",
    description: "Multiple agents coordinate via Queues and Durable Objects",
    architecture: "Workers + Queues + Durable Objects",
    example: "Data pipeline where agents hand off tasks via message queues",
  },
  {
    title: "Real-Time Agent Monitoring",
    description: "Track agent activity in real-time via Analytics Engine",
    architecture: "Workers + Analytics Engine + R2 for logs",
    example: "Dashboard showing live agent activity across all edge locations",
  },
  {
    title: "Scheduled Agent Execution",
    description: "Run agents on cron schedules for monitoring and maintenance",
    architecture: "Cron Triggers + Workers + D1",
    example: "Hourly security scan agent that checks all endpoints",
  },
  {
    title: "Webhook-Driven Agent Activation",
    description: "Agents triggered by webhooks from external services",
    architecture: "Workers (HTTP handlers) + Queues + Durable Objects",
    example: "GitHub push triggers code review agent",
  },
  {
    title: "LLM Caching and Rate Limiting",
    description: "Cache LLM responses at the edge to reduce costs",
    architecture: "AI Gateway + Workers + KV",
    example: "Cache GPT-4 responses for similar queries across all users",
  },
  {
    title: "Global File Processing",
    description: "Process files uploaded to R2 from anywhere in the world",
    architecture: "R2 + Workers (event handlers) + D1",
    example: "User uploads CSV → Agent processes → Results stored in D1",
  },
  {
    title: "Edge Analytics",
    description: "Run SQL queries against D1 for instant analytics at the edge",
    architecture: "D1 + Workers + R2 for exports",
    example: "Real-time dashboard with queries served from the nearest edge",
  },
  {
    title: "Agent Marketplace",
    description: "Deploy community-built agents as Workers with isolated execution",
    architecture: "Workers + Durable Objects + Queues + R2",
    example: "Marketplace where developers publish agents, users install them",
  },
];

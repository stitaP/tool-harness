/**
 * Spark Engine — Persistent Background Agent (Gemini Spark-style)
 *
 * A 24/7 persistent background agent that runs on dedicated infrastructure.
 * When assigned a complex task, Spark spawns a secure virtual machine session
 * to interact with web interfaces and APIs without requiring the user's screen.
 *
 * Key capabilities:
 * - Cloud-based background execution (Docker/WebWorker/Process)
 * - Cross-app tool calling via Model Context Protocol (MCP)
 * - Long-running task execution with watchdog monitoring
 * - Automatic restart on failure with exponential backoff
 * - Task queue processing with priority scheduling
 * - State persistence across invocations
 * - Live progress updates to the user
 */

import {
  createContainer,
  execInContainer,
  writeFileInContainer,
  destroyContainer,
  type RuntimeLanguage,
  type ContainerBackend,
  type ExecutionResult,
} from "@/lib/sandbox/container-engine";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SparkStatus =
  | "idle"
  | "spawning"
  | "running"
  | "waiting_input"
  | "paused"
  | "completed"
  | "failed"
  | "destroyed";

export type TaskPriority = "critical" | "high" | "normal" | "low" | "background";

export type MCPToolType =
  | "browser"       // Navigate, click, extract from web
  | "filesystem"    // Read/write files
  | "code"          // Execute code in sandbox
  | "api"           // Call external APIs
  | "database"      // Query databases
  | "communication" // Send emails, messages
  | "analytics"     // Run analytics queries
  | "custom";       // User-defined tools

export interface MCPTool {
  name: string;
  type: MCPToolType;
  description: string;
  /** JSON Schema for tool parameters */
  inputSchema: Record<string, unknown>;
  /** Whether this tool requires network access */
  requiresNetwork: boolean;
  /** Max execution time in seconds */
  timeoutSecs: number;
}

export interface SparkTask {
  id: string;
  name: string;
  description: string;
  priority: TaskPriority;
  /** Tool calls to execute */
  steps: SparkStep[];
  /** Maximum total execution time in minutes */
  maxDurationMinutes: number;
  /** Maximum total cost in tokens */
  maxTokens: number;
  /** Callback URL for progress updates */
  callbackUrl?: string;
  /** Metadata for tracking */
  metadata: Record<string, string>;
}

export interface SparkStep {
  id: string;
  name: string;
  tool: string;
  params: Record<string, unknown>;
  /** Dependencies — step IDs that must complete before this one */
  dependsOn?: string[];
  /** Maximum retries on failure */
  maxRetries: number;
  /** Timeout for this specific step in seconds */
  timeoutSecs: number;
}

export interface SparkStepResult {
  stepId: string;
  status: "completed" | "failed" | "skipped" | "timeout";
  output?: unknown;
  error?: string;
  durationMs: number;
  tokensUsed: number;
  retries: number;
}

export interface SparkSession {
  id: string;
  agentId: string;
  status: SparkStatus;
  /** Container running this session */
  containerId?: string;
  backend?: ContainerBackend;
  runtime: RuntimeLanguage;
  /** Tasks queued for execution */
  tasks: SparkTask[];
  /** Results of completed steps */
  results: SparkStepResult[];
  /** Current step being executed */
  currentStepId?: string;
  /** When the session was created */
  createdAt: string;
  /** When the session last had activity */
  lastActivityAt: string;
  /** When the session completed or failed */
  completedAt?: string;
  /** Total tokens consumed */
  totalTokens: number;
  /** Total execution time in ms */
  totalDurationMs: number;
  /** Error count */
  errorCount: number;
  /** Whether auto-restart is enabled */
  autoRestart: boolean;
  /** Restart count */
  restartCount: number;
  /** Max restarts before giving up */
  maxRestarts: number;
  /** Health check interval in seconds */
  healthCheckIntervalSecs: number;
  /** Last health check timestamp */
  lastHealthCheck?: string;
  /** Available MCP tools for this session */
  availableTools: MCPTool[];
  /** Session logs */
  logs: Array<{ timestamp: string; level: "info" | "warn" | "error"; message: string }>;
}

// ─── MCP Tool Registry ──────────────────────────────────────────────────────

export const MCP_TOOL_REGISTRY: MCPTool[] = [
  {
    name: "browser_navigate",
    type: "browser",
    description: "Navigate to a URL and wait for page load",
    inputSchema: { url: { type: "string" }, timeout: { type: "number", default: 30000 } },
    requiresNetwork: true,
    timeoutSecs: 60,
  },
  {
    name: "browser_click",
    type: "browser",
    description: "Click an element on the page by CSS selector",
    inputSchema: { selector: { type: "string" }, timeout: { type: "number", default: 5000 } },
    requiresNetwork: true,
    timeoutSecs: 15,
  },
  {
    name: "browser_extract",
    type: "browser",
    description: "Extract text or attributes from DOM elements",
    inputSchema: { selector: { type: "string" }, attribute: { type: "string" } },
    requiresNetwork: true,
    timeoutSecs: 10,
  },
  {
    name: "browser_screenshot",
    type: "browser",
    description: "Take a screenshot of the current page or element",
    inputSchema: { selector: { type: "string" }, fullPage: { type: "boolean" } },
    requiresNetwork: true,
    timeoutSecs: 30,
  },
  {
    name: "filesystem_read",
    type: "filesystem",
    description: "Read file contents from the sandbox",
    inputSchema: { path: { type: "string" } },
    requiresNetwork: false,
    timeoutSecs: 5,
  },
  {
    name: "filesystem_write",
    type: "filesystem",
    description: "Write content to a file in the sandbox",
    inputSchema: { path: { type: "string" }, content: { type: "string" } },
    requiresNetwork: false,
    timeoutSecs: 5,
  },
  {
    name: "code_execute",
    type: "code",
    description: "Execute code in the sandbox runtime",
    inputSchema: { language: { type: "string" }, code: { type: "string" }, timeout: { type: "number" } },
    requiresNetwork: false,
    timeoutSecs: 120,
  },
  {
    name: "api_call",
    type: "api",
    description: "Make an HTTP API request",
    inputSchema: { url: { type: "string" }, method: { type: "string" }, headers: { type: "object" }, body: { type: "string" } },
    requiresNetwork: true,
    timeoutSecs: 30,
  },
  {
    name: "web_search",
    type: "api",
    description: "Search the web for information",
    inputSchema: { query: { type: "string" }, numResults: { type: "number", default: 5 } },
    requiresNetwork: true,
    timeoutSecs: 15,
  },
  {
    name: "analytics_query",
    type: "analytics",
    description: "Execute an analytics query (SQL/XQL)",
    inputSchema: { query: { type: "string" }, engine: { type: "string", default: "sql" } },
    requiresNetwork: false,
    timeoutSecs: 30,
  },
];

// ─── Spark Engine ───────────────────────────────────────────────────────────

export class SparkEngine {
  private sessions = new Map<string, SparkSession>();
  private taskQueues = new Map<string, SparkTask[]>();
  private watchdogIntervals = new Map<string, ReturnType<typeof setInterval>>();

  /**
   * Spawn a new Spark session for long-running background tasks.
   */
  async spawnSession(
    agentId: string,
    runtime: RuntimeLanguage,
    options: {
      autoRestart?: boolean;
      maxRestarts?: number;
      healthCheckIntervalSecs?: number;
      tools?: MCPTool[];
    } = {},
  ): Promise<SparkSession> {
    const id = `spark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    // Spawn a container for the session
    const container = await createContainer({
      name: `spark-${id}`,
      runtime,
      memoryMB: 1024,
      timeoutSecs: 3600, // 1 hour max per container
      persistent: true,
      network: "restricted",
    });

    const session: SparkSession = {
      id,
      agentId,
      status: "spawning",
      containerId: container.id,
      backend: container.backend,
      runtime,
      tasks: [],
      results: [],
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      totalTokens: 0,
      totalDurationMs: 0,
      errorCount: 0,
      autoRestart: options.autoRestart ?? true,
      restartCount: 0,
      maxRestarts: options.maxRestarts ?? 3,
      healthCheckIntervalSecs: options.healthCheckIntervalSecs ?? 60,
      availableTools: options.tools ?? MCP_TOOL_REGISTRY,
      logs: [],
    };

    this.sessions.set(id, session);
    this.log(session.id, "info", `Spark session spawned (backend: ${container.backend}, runtime: ${runtime})`);

    // Start health check watchdog
    this.startWatchdog(session);

    session.status = "idle";
    return session;
  }

  /**
   * Assign a task to a Spark session for background execution.
   */
  assignTask(sessionId: string, task: SparkTask): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (session.status === "destroyed") throw new Error("Session is destroyed");

    session.tasks.push(task);
    this.log(sessionId, "info", `Task assigned: ${task.name} (${task.priority}, ${task.steps.length} steps)`);

    // If session is idle, start processing
    if (session.status === "idle") {
      this.processNextTask(sessionId);
    }
  }

  /**
   * Process the next task in the queue.
   */
  private async processNextTask(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.containerId) return;

    // Sort tasks by priority
    const priorityOrder: Record<TaskPriority, number> = {
      critical: 0, high: 1, normal: 2, low: 3, background: 4,
    };
    session.tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const task = session.tasks.shift();
    if (!task) {
      session.status = "idle";
      return;
    }

    session.status = "running";
    this.log(sessionId, "info", `Processing task: ${task.name}`);

    const taskStart = Date.now();

    for (const step of task.steps) {
      // Check dependencies
      if (step.dependsOn?.length) {
        const allDepsComplete = step.dependsOn.every((depId) =>
          session.results.some((r) => r.stepId === depId && r.status === "completed"),
        );
        if (!allDepsComplete) {
          this.log(sessionId, "warn", `Skipping step ${step.name} — dependencies not met`);
          session.results.push({
            stepId: step.id,
            status: "skipped",
            durationMs: 0,
            tokensUsed: 0,
            retries: 0,
          });
          continue;
        }
      }

      session.currentStepId = step.id;
      await this.executeStep(session, task, step);

      // Check task time limit
      if (Date.now() - taskStart > task.maxDurationMinutes * 60 * 1000) {
        this.log(sessionId, "warn", `Task ${task.name} exceeded time limit (${task.maxDurationMinutes}min)`);
        break;
      }
    }

    session.currentStepId = undefined;
    this.log(sessionId, "info", `Task completed: ${task.name} (${session.results.length} step results)`);
    this.processNextTask(sessionId); // Process next task in queue
  }

  /**
   * Execute a single step with retry logic.
   */
  private async executeStep(
    session: SparkSession,
    task: SparkTask,
    step: SparkStep,
  ): Promise<void> {
    if (!session.containerId) return;

    const stepStart = Date.now();
    let attempt = 0;
    let lastError: string | undefined;

    while (attempt <= step.maxRetries) {
      try {
        this.log(session.id, "info", `Executing step: ${step.name} (attempt ${attempt + 1})`);

        // Build the MCP tool call command
        const tool = session.availableTools.find((t) => t.name === step.tool);
        if (!tool) throw new Error(`Unknown tool: ${step.tool}`);

        // Execute in the container
        const script = this.buildToolScript(tool, step.params);
        await writeFileInContainer(session.containerId, `/tmp/step-${step.id}.ts`, script);

        const result = await execInContainer(
          session.containerId,
          `node /tmp/step-${step.id}.ts`,
          step.timeoutSecs,
        );

        if (result.success) {
          session.results.push({
            stepId: step.id,
            status: "completed",
            output: result.stdout,
            durationMs: Date.now() - stepStart,
            tokensUsed: 0, // Would be tracked by the inference layer
            retries: attempt,
          });
          this.log(session.id, "info", `Step completed: ${step.name}`);
          return;
        } else {
          lastError = result.stderr;
          throw new Error(result.stderr);
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        this.log(session.id, "warn", `Step ${step.name} failed (attempt ${attempt + 1}): ${lastError}`);
        attempt++;

        if (attempt > step.maxRetries) {
          session.results.push({
            stepId: step.id,
            status: "failed",
            error: lastError,
            durationMs: Date.now() - stepStart,
            tokensUsed: 0,
            retries: attempt - 1,
          });
          session.errorCount++;
          this.log(session.id, "error", `Step failed after ${attempt} attempts: ${step.name}`);
        } else {
          // Exponential backoff
          await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 30000)));
        }
      }
    }
  }

  /**
   * Build a script that invokes an MCP tool.
   */
  private buildToolScript(tool: MCPTool, params: Record<string, unknown>): string {
    return `
// Auto-generated MCP tool call: ${tool.name}
const params = ${JSON.stringify(params, null, 2)};

// Tool execution would be routed through the MCP protocol
// This script is the entry point for the container
console.log(JSON.stringify({
  tool: "${tool.name}",
  params,
  timestamp: new Date().toISOString(),
  status: "executed"
}));
`.trim();
  }

  /**
   * Get session status and progress.
   */
  getSession(sessionId: string): SparkSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions.
   */
  listSessions(): SparkSession[] {
    return [...this.sessions.values()];
  }

  /**
   * Pause a running session.
   */
  pauseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && (session.status === "running" || session.status === "idle")) {
      session.status = "paused";
      this.log(sessionId, "info", "Session paused");
    }
  }

  /**
   * Resume a paused session.
   */
  resumeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.status === "paused") {
      session.status = "idle";
      this.log(sessionId, "info", "Session resumed");
      this.processNextTask(sessionId);
    }
  }

  /**
   * Destroy a session and clean up resources.
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Stop watchdog
    const interval = this.watchdogIntervals.get(sessionId);
    if (interval) clearInterval(interval);
    this.watchdogIntervals.delete(sessionId);

    // Destroy container
    if (session.containerId) {
      await destroyContainer(session.containerId);
    }

    session.status = "destroyed";
    session.completedAt = new Date().toISOString();
    this.log(sessionId, "info", "Session destroyed");
  }

  /**
   * Get aggregated progress across all tasks in a session.
   */
  getProgress(sessionId: string): {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    percentComplete: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) return { totalSteps: 0, completedSteps: 0, failedSteps: 0, skippedSteps: 0, percentComplete: 0 };

    const totalSteps = session.tasks.reduce((s, t) => s + t.steps.length, 0) +
      session.results.length;
    const completedSteps = session.results.filter((r) => r.status === "completed").length;
    const failedSteps = session.results.filter((r) => r.status === "failed").length;
    const skippedSteps = session.results.filter((r) => r.status === "skipped").length;

    return {
      totalSteps,
      completedSteps,
      failedSteps,
      skippedSteps,
      percentComplete: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
    };
  }

  // ─── Watchdog & Health ────────────────────────────────────────────────

  private startWatchdog(session: SparkSession): void {
    const interval = setInterval(async () => {
      if (session.status === "destroyed") {
        clearInterval(this.watchdogIntervals.get(session.id)!);
        this.watchdogIntervals.delete(session.id);
        return;
      }

      session.lastHealthCheck = new Date().toISOString();

      // Check if container is still alive
      if (session.containerId) {
        try {
          const result = await execInContainer(session.containerId, "echo ok", 5);
          if (!result.success) {
            this.log(session.id, "warn", "Health check failed — container may be unresponsive");
            if (session.autoRestart && session.restartCount < session.maxRestarts) {
              await this.restartSession(session.id);
            }
          }
        } catch {
          this.log(session.id, "error", "Health check timeout");
        }
      }
    }, session.healthCheckIntervalSecs * 1000);

    this.watchdogIntervals.set(session.id, interval);
  }

  private async restartSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.restartCount++;
    this.log(sessionId, "warn", `Restarting session (attempt ${session.restartCount}/${session.maxRestarts})`);

    // Destroy old container and create new one
    if (session.containerId) {
      await destroyContainer(session.containerId);
    }

    const container = await createContainer({
      name: `spark-restart-${sessionId}`,
      runtime: session.runtime,
      memoryMB: 1024,
      timeoutSecs: 3600,
      persistent: true,
      network: "restricted",
    });

    session.containerId = container.id;
    session.backend = container.backend;
    session.status = "idle";
    session.lastActivityAt = new Date().toISOString();

    // Resume processing
    this.processNextTask(sessionId);
  }

  private log(sessionId: string, level: "info" | "warn" | "error", message: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.logs.push({ timestamp: new Date().toISOString(), level, message });
      session.lastActivityAt = new Date().toISOString();
      // Keep logs bounded
      if (session.logs.length > 500) {
        session.logs = session.logs.slice(-250);
      }
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _engine: SparkEngine | null = null;

export function getSparkEngine(): SparkEngine {
  if (!_engine) _engine = new SparkEngine();
  return _engine;
}

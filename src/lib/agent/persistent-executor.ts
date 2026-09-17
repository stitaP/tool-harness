/**
 * stitaP Persistent Agent Executor
 *
 * Enables agents to run continuously as daemons with:
 * - Automatic restart on failure
 * - Health check monitoring
 * - Task queue processing
 * - State persistence across restarts
 * - Graceful shutdown
 * - Watchdog timeout
 *
 * An agent configured with persistent mode will:
 * 1. Start a container with the requested runtime
 * 2. Install dependencies once
 * 3. Run a main loop that processes tasks from a queue
 * 4. Restart automatically if it crashes
 * 5. Report health status to the monitoring system
 *
 * This is how agents solve problems continuously — they don't stop
 * after one answer. They stay alive, process incoming tasks, and
 * maintain state across invocations.
 */

import {
  createContainer,
  execInContainer,
  writeFileInContainer,
  destroyContainer,
  getContainer,
  listContainers,
  detectHostRuntime,
  type Container,
  type ExecutionResult,
  type RuntimeLanguage,
} from "../sandbox/container-engine";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentState = "idle" | "busy" | "error" | "stopped" | "starting";

export interface PersistentAgent {
  id: string;
  name: string;
  /** The language runtime this agent uses */
  runtime: RuntimeLanguage;
  /** Current state */
  state: AgentState;
  /** Container backing this agent */
  containerId: string | null;
  /** When the agent was created */
  createdAt: string;
  /** When the agent last processed a task */
  lastTaskAt: string | null;
  /** When the agent last reported healthy */
  lastHealthCheck: string;
  /** Total tasks processed */
  taskCount: number;
  /** Total errors */
  errorCount: number;
  /** Consecutive errors (resets on success) */
  consecutiveErrors: number;
  /** Restart count */
  restartCount: number;
  /** Health check results */
  health: HealthStatus;
  /** Task queue */
  queue: Task[];
  /** Completed tasks */
  completedTasks: CompletedTask[];
  /** Agent's persistent state (survives restarts) */
  stateStore: Record<string, unknown>;
  /** Configuration */
  config: AgentConfig;
}

export interface AgentConfig {
  /** Maximum restarts before giving up */
  maxRestarts: number;
  /** Health check interval in ms */
  healthCheckIntervalMs: number;
  /** Task timeout in seconds */
  taskTimeoutSecs: number;
  /** Memory limit for the container */
  memoryMB: number;
  /** Whether to auto-install dependencies */
  autoInstallDeps: boolean;
  /** Startup script */
  startupScript?: string;
  /** Dependencies to install */
  dependencies: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** Network policy */
  network: "none" | "restricted" | "full";
}

export interface Task {
  id: string;
  /** Task description (shown to agent) */
  description: string;
  /** Code to execute */
  code: string;
  /** Language override (default: agent's runtime) */
  language?: RuntimeLanguage;
  /** Priority (higher = processed first) */
  priority: number;
  /** When the task was submitted */
  submittedAt: string;
  /** Dependencies to install for this specific task */
  packages?: string[];
  /** Retry count */
  retryCount: number;
  /** Max retries */
  maxRetries: number;
}

export interface CompletedTask {
  task: Task;
  result: ExecutionResult;
  completedAt: string;
  duration: number;
}

export interface HealthStatus {
  healthy: boolean;
  /** Container running */
  containerRunning: boolean;
  /** Runtime accessible */
  runtimeAccessible: boolean;
  /** Memory usage */
  memoryUsageMB: number;
  /** Disk usage */
  diskUsageMB: number;
  /** Uptime in seconds */
  uptimeSecs: number;
  /** Last error message */
  lastError: string | null;
  /** Timestamp of this health check */
  checkedAt: string;
}

// ─── Agent Registry ─────────────────────────────────────────────────────────

const agents = new Map<string, PersistentAgent>();
const healthTimers = new Map<string, ReturnType<typeof setInterval>>();

const DEFAULT_CONFIG: AgentConfig = {
  maxRestarts: 5,
  healthCheckIntervalMs: 30_000,
  taskTimeoutSecs: 60,
  memoryMB: 512,
  autoInstallDeps: true,
  dependencies: [],
  env: {},
  network: "restricted",
};

// ─── Agent Lifecycle ────────────────────────────────────────────────────────

/** Create and start a persistent agent */
export async function createAgent(
  name: string,
  runtime: RuntimeLanguage,
  config: Partial<AgentConfig> = {},
): Promise<PersistentAgent> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Check if runtime exists on host first — avoid Docker if possible
  const hostStatus = await detectHostRuntime(runtime);

  // Create container — if host runtime exists, createContainer will use native mode
  const container = await createContainer({
    name: `agent-${name}`,
    runtime,
    memoryMB: fullConfig.memoryMB,
    timeoutSecs: fullConfig.taskTimeoutSecs,
    persistent: true,
    network: fullConfig.network,
    packages: fullConfig.dependencies,
    startupScript: fullConfig.startupScript,
  });
  // Mark as native if host runtime was found (avoids Docker overhead)
  if (hostStatus.installed) {
    container.backend = "native";
  }

  const agent: PersistentAgent = {
    id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    runtime,
    state: "idle",
    containerId: container.id,
    createdAt: new Date().toISOString(),
    lastTaskAt: null,
    lastHealthCheck: new Date().toISOString(),
    taskCount: 0,
    errorCount: 0,
    consecutiveErrors: 0,
    restartCount: 0,
    health: {
      healthy: true,
      containerRunning: true,
      runtimeAccessible: true,
      memoryUsageMB: 0,
      diskUsageMB: 0,
      uptimeSecs: 0,
      lastError: null,
      checkedAt: new Date().toISOString(),
    },
    queue: [],
    completedTasks: [],
    stateStore: {},
    config: fullConfig,
  };

  agents.set(agent.id, agent);

  // Start health checks
  const timer = setInterval(
    () => performHealthCheck(agent.id),
    fullConfig.healthCheckIntervalMs,
  );
  healthTimers.set(agent.id, timer);

  return agent;
}

/** Submit a task to an agent's queue */
export function submitTask(
  agentId: string,
  description: string,
  code: string,
  options: {
    language?: RuntimeLanguage;
    priority?: number;
    packages?: string[];
    maxRetries?: number;
  } = {},
): Task | null {
  const agent = agents.get(agentId);
  if (!agent || agent.state === "stopped") return null;

  const task: Task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description,
    code,
    language: options.language,
    priority: options.priority ?? 0,
    submittedAt: new Date().toISOString(),
    packages: options.packages,
    retryCount: 0,
    maxRetries: options.maxRetries ?? 2,
  };

  agent.queue.push(task);
  agent.queue.sort((a, b) => b.priority - a.priority);

  // Process queue if agent is idle
  if (agent.state === "idle") {
    processQueue(agentId);
  }

  return task;
}

/** Process the next task in the queue */
async function processQueue(agentId: string): Promise<void> {
  const agent = agents.get(agentId);
  if (!agent || agent.state !== "idle" || agent.queue.length === 0) return;

  const task = agent.queue.shift()!;
  agent.state = "busy";
  agent.lastTaskAt = new Date().toISOString();

  try {
    // Ensure container is running
    if (!agent.containerId) {
      throw new Error("No container attached to agent");
    }

    const container = getContainer(agent.containerId);
    if (!container || container.status !== "running") {
      // Restart the container
      await restartAgent(agentId);
      throw new Error("Container was restarted");
    }

    // Install task-specific packages
    if (task.packages && task.packages.length > 0) {
      const runtime = container.config.runtime;
      const pkgCmd = runtime === "python" ? "pip install" : runtime === "node" ? "npm install" : "apt-get install -y";
      for (const pkg of task.packages) {
        await execInContainer(agent.containerId, `${pkgCmd} ${pkg}`, 30);
      }
    }

    // Write and execute the code
    const lang = task.language ?? agent.runtime;
    const ext = lang === "python" ? ".py" : lang === "java" ? ".java" : lang === "node" ? ".js" : ".sh";
    const filename = `task-${task.id}${ext}`;

    await writeFileInContainer(agent.containerId, `/workspace/${filename}`, task.code);

    const runCmd =
      lang === "python" ? `python3 /workspace/${filename}` :
      lang === "node" ? `node /workspace/${filename}` :
      lang === "java" ? `javac /workspace/${filename} && java -cp /workspace ${filename.replace(".java", "")}` :
      lang === "rust" ? `rustc /workspace/${filename} -o /tmp/task && /tmp/task` :
      lang === "go" ? `go run /workspace/${filename}` :
      lang === "ruby" ? `ruby /workspace/${filename}` :
      `bash /workspace/${filename}`;

    const result = await execInContainer(agent.containerId, runCmd, agent.config.taskTimeoutSecs);

    const completed: CompletedTask = {
      task,
      result,
      completedAt: new Date().toISOString(),
      duration: result.duration,
    };

    agent.completedTasks.push(completed);
    agent.taskCount++;

    if (result.success) {
      agent.consecutiveErrors = 0;
    } else {
      agent.errorCount++;
      agent.consecutiveErrors++;

      // Retry on failure
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        agent.queue.unshift(task); // Re-add to front of queue
      }
    }
  } catch (err) {
    agent.errorCount++;
    agent.consecutiveErrors++;
    agent.health.lastError = err instanceof Error ? err.message : String(err);

    // Check if we need to restart
    if (agent.consecutiveErrors >= 3) {
      await restartAgent(agentId);
    }
  } finally {
    agent.state = "idle";

    // Process next task if queue has more
    if (agent.queue.length > 0) {
      // Yield to event loop then process next
      setTimeout(() => processQueue(agentId), 100);
    }
  }
}

/** Restart an agent (destroy and recreate container) */
async function restartAgent(agentId: string): Promise<void> {
  const agent = agents.get(agentId);
  if (!agent) return;

  if (agent.restartCount >= agent.config.maxRestarts) {
    agent.state = "error";
    agent.health.lastError = `Max restarts (${agent.config.maxRestarts}) exceeded`;
    return;
  }

  agent.state = "starting";
  agent.restartCount++;

  // Destroy old container
  if (agent.containerId) {
    await destroyContainer(agent.containerId);
  }

  // Create new container
  const container = await createContainer({
    name: `agent-${agent.name}-restart-${agent.restartCount}`,
    runtime: agent.runtime,
    memoryMB: agent.config.memoryMB,
    timeoutSecs: agent.config.taskTimeoutSecs,
    persistent: true,
    network: agent.config.network,
    packages: agent.config.dependencies,
    startupScript: agent.config.startupScript,
  });

  agent.containerId = container.id;
  agent.consecutiveErrors = 0;
  agent.state = "idle";
}

/** Perform a health check on an agent */
async function performHealthCheck(agentId: string): Promise<void> {
  const agent = agents.get(agentId);
  if (!agent || agent.state === "stopped") return;

  const container = agent.containerId !== null ? getContainer(agent.containerId) : null;

  agent.health = {
    healthy: container?.status === "running" && agent.state !== "error",
    containerRunning: container != null && container.status === "running",
    runtimeAccessible: false,
    memoryUsageMB: container?.resources.memoryMB ?? 0,
    diskUsageMB: container?.resources.diskMB ?? 0,
    uptimeSecs: container ? (Date.now() - new Date(container.createdAt).getTime()) / 1000 : 0,
    lastError: agent.health.lastError,
    checkedAt: new Date().toISOString(),
  };

  // Test runtime accessibility
  if (agent.containerId && container?.status === "running") {
    try {
      const result = await execInContainer(agent.containerId, "echo ok", 5);
      agent.health.runtimeAccessible = result.success && result.stdout.trim() === "ok";
    } catch {
      agent.health.runtimeAccessible = false;
    }
  }

  // Auto-restart if unhealthy
  if (!agent.health.healthy && agent.state === "idle") {
    await restartAgent(agentId);
  }
}

/** Stop an agent */
export async function stopAgent(agentId: string): Promise<void> {
  const agent = agents.get(agentId);
  if (!agent) return;

  agent.state = "stopped";
  const timer = healthTimers.get(agentId);
  if (timer) {
    clearInterval(timer);
    healthTimers.delete(agentId);
  }

  if (agent.containerId) {
    await destroyContainer(agent.containerId);
    agent.containerId = null;
  }
}

/** Get agent state */
export function getAgent(agentId: string): PersistentAgent | undefined {
  return agents.get(agentId);
}

/** List all agents */
export function listAgents(): PersistentAgent[] {
  return [...agents.values()];
}

/** Get task result by task ID */
export function getTaskResult(
  agentId: string,
  taskId: string,
): CompletedTask | undefined {
  const agent = agents.get(agentId);
  return agent?.completedTasks.find((c) => c.task.id === taskId);
}

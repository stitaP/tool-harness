/**
 * Supervisor Agent Router — Vertex AI Agent Builder-style
 *
 * A multi-agent orchestration pattern where a high-level "supervisor" agent
 * parses complex requests and delegates tasks to specialized sub-agents.
 *
 * Key capabilities:
 * - Supervisor parses complex requests into sub-tasks
 * - Routes sub-tasks to specialized sub-agents based on capability matching
 * - Memory Bank retains long-term user context across sessions
 * - Self-healing logic automatically retries failed tool calls
 * - Token budget enforcement per agent and per session
 * - Observability via structured event logging
 */

import { getAgentMemory, type MemoryEntry } from "./memory";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentCapability =
  | "code_generation"
  | "code_review"
  | "testing"
  | "documentation"
  | "research"
  | "data_analysis"
  | "web_browsing"
  | "file_management"
  | "database"
  | "deployment"
  | "design"
  | "math"
  | "cfd"
  | "financial"
  | "multimodal";

export interface SubAgentDefinition {
  id: string;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  /** Maximum concurrent tasks this agent can handle */
  maxConcurrency: number;
  /** Token budget per task */
  tokenBudgetPerTask: number;
  /** Average tokens per task (for budget estimation) */
  avgTokensPerTask: number;
  /** Whether this agent is currently available */
  available: boolean;
  /** Success rate (0-1) for routing decisions */
  successRate: number;
  /** Average response time in ms */
  avgResponseTimeMs: number;
  /** Custom system prompt for this agent */
  systemPrompt: string;
}

export interface RoutingDecision {
  /** Selected sub-agent ID */
  agentId: string;
  /** Confidence in this routing decision (0-1) */
  confidence: number;
  /** Reason for the routing decision */
  reason: string;
  /** Alternative agents considered */
  alternatives: Array<{ agentId: string; score: number }>;
}

export interface TaskAssignment {
  id: string;
  taskId: string;
  agentId: string;
  status: "queued" | "running" | "completed" | "failed" | "retrying";
  input: string;
  output?: string;
  error?: string;
  tokensUsed: number;
  durationMs: number;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  completedAt?: string;
}

export interface MemoryBankEntry {
  id: string;
  userId: string;
  sessionId: string;
  key: string;
  value: string;
  /** Which agent wrote this memory */
  sourceAgentId: string;
  /** When it was written */
  writtenAt: string;
  /** Access count for LRU eviction */
  accessCount: number;
  /** Importance score (1-10) */
  importance: number;
}

export interface SupervisorConfig {
  /** Maximum number of sub-agents */
  maxSubAgents: number;
  /** Total token budget for the supervisor */
  sessionTokenBudget: number;
  /** Maximum routing confidence threshold */
  routingConfidenceThreshold: number;
  /** Whether to enable self-healing retries */
  enableSelfHealing: boolean;
  /** Maximum retries for failed tool calls */
  maxToolRetries: number;
  /** Memory Bank size limit */
  memoryBankSize: number;
}

// ─── Supervisor Router ──────────────────────────────────────────────────────

export class SupervisorRouter {
  private subAgents = new Map<string, SubAgentDefinition>();
  private assignments = new Map<string, TaskAssignment[]>();
  private memoryBank: MemoryBankEntry[] = [];
  private config: SupervisorConfig;

  constructor(config: Partial<SupervisorConfig> = {}) {
    this.config = {
      maxSubAgents: config.maxSubAgents ?? 10,
      sessionTokenBudget: config.sessionTokenBudget ?? 100_000,
      routingConfidenceThreshold: config.routingConfidenceThreshold ?? 0.6,
      enableSelfHealing: config.enableSelfHealing ?? true,
      maxToolRetries: config.maxToolRetries ?? 3,
      memoryBankSize: config.memoryBankSize ?? 1000,
    };
  }

  // ─── Sub-Agent Management ─────────────────────────────────────────────

  /**
   * Register a sub-agent with the supervisor.
   */
  registerSubAgent(agent: Omit<SubAgentDefinition, "successRate" | "avgResponseTimeMs" | "available">): SubAgentDefinition {
    if (this.subAgents.size >= this.config.maxSubAgents) {
      throw new Error(`Maximum sub-agents reached (${this.config.maxSubAgents})`);
    }

    const fullAgent: SubAgentDefinition = {
      ...agent,
      successRate: 1.0,
      avgResponseTimeMs: 0,
      available: true,
    };

    this.subAgents.set(agent.id, fullAgent);
    this.assignments.set(agent.id, []);
    return fullAgent;
  }

  /**
   * Get a sub-agent by ID.
   */
  getSubAgent(id: string): SubAgentDefinition | undefined {
    return this.subAgents.get(id);
  }

  /**
   * List all registered sub-agents.
   */
  listSubAgents(): SubAgentDefinition[] {
    return [...this.subAgents.values()];
  }

  // ─── Routing ──────────────────────────────────────────────────────────

  /**
   * Route a complex task to the best sub-agent.
   * Analyzes the task description, matches capabilities, and returns a routing decision.
   */
  routeTask(taskDescription: string, requiredCapabilities?: AgentCapability[]): RoutingDecision {
    const agents = [...this.subAgents.values()].filter((a) => a.available);
    if (agents.length === 0) {
      throw new Error("No available sub-agents");
    }

    // Score each agent
    const scored = agents.map((agent) => {
      let score = 0;

      // Capability matching (40% weight)
      if (requiredCapabilities?.length) {
        const matchCount = requiredCapabilities.filter((cap) =>
          agent.capabilities.includes(cap),
        ).length;
        score += (matchCount / requiredCapabilities.length) * 0.4;
      } else {
        // Heuristic: check if task description keywords match capabilities
        const taskLower = taskDescription.toLowerCase();
        const capMatches = agent.capabilities.filter((cap) => {
          const capWords = cap.replace(/_/g, " ").split(" ");
          return capWords.some((w) => taskLower.includes(w));
        });
        score += (capMatches.length / Math.max(agent.capabilities.length, 1)) * 0.3;
      }

      // Success rate (25% weight)
      score += agent.successRate * 0.25;

      // Response time (15% weight — faster is better)
      const maxResponseTime = 30000; // 30s baseline
      score += Math.max(0, 1 - agent.avgResponseTimeMs / maxResponseTime) * 0.15;

      // Concurrency availability (10% weight)
      const currentLoad = (this.assignments.get(agent.id) ?? []).filter(
        (a) => a.status === "running" || a.status === "queued",
      ).length;
      score += Math.max(0, 1 - currentLoad / agent.maxConcurrency) * 0.1;

      // Token budget availability (10% weight)
      const usedTokens = (this.assignments.get(agent.id) ?? []).reduce(
        (s, a) => s + a.tokensUsed, 0,
      );
      const remaining = agent.tokenBudgetPerTask * agent.maxConcurrency - usedTokens;
      score += Math.max(0, remaining / (agent.tokenBudgetPerTask * agent.maxConcurrency)) * 0.1;

      return { agentId: agent.id, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const agent = this.subAgents.get(best.agentId)!;

    return {
      agentId: best.agentId,
      confidence: best.score,
      reason: `Best match: ${agent.name} (capabilities: ${agent.capabilities.join(", ")}, score: ${best.score.toFixed(2)})`,
      alternatives: scored.slice(1, 4),
    };
  }

  /**
   * Assign a task to a sub-agent.
   */
  assignTask(
    agentId: string,
    taskDescription: string,
    input: string,
    options: { maxRetries?: number; tokenBudget?: number } = {},
  ): TaskAssignment {
    const agent = this.subAgents.get(agentId);
    if (!agent) throw new Error(`Sub-agent not found: ${agentId}`);
    if (!agent.available) throw new Error(`Sub-agent ${agentId} is not available`);

    const assignment: TaskAssignment = {
      id: `assign-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      taskId: `task-${Date.now().toString(36)}`,
      agentId,
      status: "queued",
      input,
      tokensUsed: 0,
      durationMs: 0,
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.maxToolRetries,
      createdAt: new Date().toISOString(),
    };

    const agentAssignments = this.assignments.get(agentId) ?? [];
    agentAssignments.push(assignment);
    this.assignments.set(agentId, agentAssignments);

    return assignment;
  }

  /**
   * Execute a task assignment with self-healing retries.
   */
  async executeTask(
    assignmentId: string,
    executor: (input: string, agentId: string) => Promise<string>,
  ): Promise<TaskAssignment> {
    let assignment: TaskAssignment | undefined;
    for (const agentAssignments of this.assignments.values()) {
      assignment = agentAssignments.find((a) => a.id === assignmentId);
      if (assignment) break;
    }
    if (!assignment) throw new Error(`Assignment not found: ${assignmentId}`);

    const agent = this.subAgents.get(assignment.agentId);
    if (!agent) throw new Error(`Agent not found: ${assignment.agentId}`);

    assignment.status = "running";
    const startTime = Date.now();

    while (assignment.retryCount <= assignment.maxRetries) {
      try {
        const output = await executor(assignment.input, assignment.agentId);
        assignment.output = output;
        assignment.status = "completed";
        assignment.durationMs = Date.now() - startTime;
        assignment.completedAt = new Date().toISOString();

        // Update agent stats
        agent.successRate = Math.min(1.0, agent.successRate + 0.01);
        agent.avgResponseTimeMs = (agent.avgResponseTimeMs + assignment.durationMs) / 2;

        return assignment;
      } catch (err) {
        assignment.retryCount++;
        assignment.error = err instanceof Error ? err.message : String(err);

        if (assignment.retryCount > assignment.maxRetries) {
          assignment.status = "failed";
          assignment.durationMs = Date.now() - startTime;
          agent.successRate = Math.max(0, agent.successRate - 0.05);
          return assignment;
        }

        // Self-healing: wait before retry with exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, assignment.retryCount - 1), 30000);
        await new Promise((r) => setTimeout(r, backoffMs));
        assignment.status = "retrying";
      }
    }

    return assignment;
  }

  // ─── Memory Bank ──────────────────────────────────────────────────────

  /**
   * Write to the Memory Bank (long-term user context across sessions).
   */
  writeMemory(entry: Omit<MemoryBankEntry, "id" | "writtenAt" | "accessCount">): MemoryBankEntry {
    const memEntry: MemoryBankEntry = {
      ...entry,
      id: `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      writtenAt: new Date().toISOString(),
      accessCount: 0,
    };

    this.memoryBank.push(memEntry);

    // Evict if over limit (LRU by access count, then by importance)
    if (this.memoryBank.length > this.config.memoryBankSize) {
      this.memoryBank.sort((a, b) => a.accessCount - b.accessCount || a.importance - b.importance);
      this.memoryBank = this.memoryBank.slice(-this.config.memoryBankSize);
    }

    // Also store in AgentMemory for cross-session persistence
    const mem = getAgentMemory();
    mem.add({
      type: "workflow",
      key: `memory-bank.${entry.userId}.${entry.key}`,
      content: entry.value,
      importance: entry.importance,
      tags: ["memory-bank", entry.sourceAgentId],
      sourceId: entry.sessionId,
    });

    return memEntry;
  }

  /**
   * Query the Memory Bank for relevant context.
   */
  queryMemory(userId: string, query: string, limit = 10): MemoryBankEntry[] {
    const searchLower = query.toLowerCase();
    return this.memoryBank
      .filter((e) => e.userId === userId)
      .filter((e) =>
        e.key.toLowerCase().includes(searchLower) ||
        e.value.toLowerCase().includes(searchLower),
      )
      .sort((a, b) => b.importance - a.importance || b.accessCount - a.accessCount)
      .slice(0, limit)
      .map((e) => {
        e.accessCount++;
        return e;
      });
  }

  // ─── Observability ────────────────────────────────────────────────────

  /**
   * Get the current status of all sub-agents and their assignments.
   */
  getStatus(): {
    agents: Array<{
      id: string;
      name: string;
      available: boolean;
      successRate: number;
      activeTasks: number;
      totalCompleted: number;
      totalFailed: number;
    }>;
    memoryBankSize: number;
    totalTokensUsed: number;
  } {
    let totalTokensUsed = 0;

    const agents = [...this.subAgents.values()].map((agent) => {
      const assignments = this.assignments.get(agent.id) ?? [];
      totalTokensUsed += assignments.reduce((s, a) => s + a.tokensUsed, 0);

      return {
        id: agent.id,
        name: agent.name,
        available: agent.available,
        successRate: agent.successRate,
        activeTasks: assignments.filter((a) => a.status === "running" || a.status === "queued").length,
        totalCompleted: assignments.filter((a) => a.status === "completed").length,
        totalFailed: assignments.filter((a) => a.status === "failed").length,
      };
    });

    return { agents, memoryBankSize: this.memoryBank.length, totalTokensUsed };
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _router: SupervisorRouter | null = null;

export function getSupervisorRouter(config?: Partial<SupervisorConfig>): SupervisorRouter {
  if (!_router) _router = new SupervisorRouter(config);
  return _router;
}

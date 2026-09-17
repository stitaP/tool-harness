/**
 * Awesome Harness Engineering — CAR Framework & Governance
 *
 * Provides the Control-Agency-Runtime (CAR) harness:
 *   - Control Layer:    Policy enforcement, permission gates, approval workflows
 *   - Agency Layer:     Agent capabilities, tool permissions, autonomy levels
 *   - Runtime Layer:    Execution budgets, spend rails, sandboxed boundaries
 *
 * Also provides:
 *   - Evaluation Gates:  Verification that analysis completeness criteria are met
 *   - Spend Rails:       Token/cost limits per agent, per session, per task
 *   - AGENTS.md Generator: Produces governance specs for agent runtimes
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type AutonomyLevel = "supervised" | "semi-autonomous" | "autonomous";

export interface CARConfig {
  /** Unique identifier for this harness instance */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the harness purpose */
  description: string;

  // ─── Control Layer ───────────────────────────────────────────────────
  control: {
    /** Maximum number of approval gates before auto-reject */
    maxApprovalGates: number;
    /** Actions that require explicit human approval */
    requireApproval: string[];
    /** Actions that are always blocked */
    blockedActions: string[];
    /** Auto-approve actions below this risk threshold */
    autoApproveThreshold: number;
  };

  // ─── Agency Layer ───────────────────────────────────────────────────
  agency: {
    /** Default autonomy level for agents */
    defaultAutonomy: AutonomyLevel;
    /** Maximum number of concurrent agents */
    maxConcurrentAgents: number;
    /** Tools each agent can use (empty = all) */
    allowedTools: string[];
    /** Tools each agent CANNOT use */
    blockedTools: string[];
    /** Maximum agent lifespan in minutes */
    maxLifespanMinutes: number;
  };

  // ─── Runtime Layer ──────────────────────────────────────────────────
  runtime: {
    /** Maximum total tokens per session */
    sessionTokenBudget: number;
    /** Maximum tokens per individual action */
    actionTokenBudget: number;
    /** Maximum cost in USD per session */
    sessionCostCap: number;
    /** Maximum cost per individual action in USD */
    actionCostCap: number;
    /** Maximum execution time per action in seconds */
    actionTimeoutSeconds: number;
    /** Maximum total execution time per session in minutes */
    sessionTimeoutMinutes: number;
    /** Maximum memory per agent in MB */
    maxMemoryMB: number;
  };
}

export interface EvaluationGate {
  id: string;
  name: string;
  description: string;
  /** Conditions that must be met for the gate to pass */
  conditions: GateCondition[];
  /** What happens when the gate fails */
  onFail: "abort" | "retry" | "warn" | "skip";
  /** Maximum retries before aborting */
  maxRetries: number;
  /** Order in the gate pipeline */
  order: number;
}

export interface GateCondition {
  id: string;
  description: string;
  /** Type of check */
  type: "coverage" | "quality" | "resource" | "time" | "custom";
  /** Threshold value (meaning depends on type) */
  threshold: number;
  /** Current value (set during evaluation) */
  current?: number;
  /** Whether the condition is met */
  passed?: boolean;
}

export interface SpendRail {
  /** Resource type being limited */
  resource: "tokens" | "cost" | "time" | "memory";
  /** Limit per period */
  limit: number;
  /** Period: "action" | "session" | "hour" | "day" */
  period: string;
  /** Current usage in this period */
  currentUsage: number;
  /** Whether the limit has been hit */
  exceeded: boolean;
  /** Actions to take when limit is approaching (e.g., at 80%) */
  warningThreshold: number;
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  autonomyLevel: AutonomyLevel;
  /** Tools this agent is allowed to use */
  allowedTools: string[];
  /** Maximum tokens this agent can use */
  tokenBudget: number;
  /** Current token usage */
  tokensUsed: number;
  /** Actions taken */
  actionsCount: number;
  /** Current status */
  status: "idle" | "running" | "waiting_approval" | "blocked" | "completed";
}

export interface HarnessState {
  config: CARConfig;
  agents: AgentProfile[];
  spendRails: SpendRail[];
  evaluationGates: EvaluationGate[];
  /** Current session metrics */
  sessionMetrics: {
    totalTokensUsed: number;
    totalCostUsd: number;
    totalActions: number;
    totalDurationMs: number;
    startTime: string;
  };
  /** Gate evaluation results */
  gateResults: Array<{
    gateId: string;
    passed: boolean;
    evaluatedAt: string;
    details: string;
  }>;
}

// ─── CAR Framework Engine ──────────────────────────────────────────────────

export class CARFramework {
  private state: HarnessState;

  constructor(config: CARConfig) {
    this.state = {
      config,
      agents: [],
      spendRails: this.initSpendRails(config),
      evaluationGates: [],
      sessionMetrics: {
        totalTokensUsed: 0,
        totalCostUsd: 0,
        totalActions: 0,
        totalDurationMs: 0,
        startTime: new Date().toISOString(),
      },
      gateResults: [],
    };
  }

  // ─── Control Layer ──────────────────────────────────────────────────

  /**
   * Check if an action is allowed by the control policy.
   */
  checkActionAllowed(action: string): {
    allowed: boolean;
    reason: string;
    requiresApproval: boolean;
  } {
    const { control } = this.state.config;

    // Check blocked actions
    if (control.blockedActions.includes(action)) {
      return {
        allowed: false,
        reason: `Action "${action}" is blocked by policy.`,
        requiresApproval: false,
      };
    }

    // Check if approval is required
    const requiresApproval = control.requireApproval.includes(action);

    return {
      allowed: true,
      reason: requiresApproval ? "Requires human approval" : "Auto-approved",
      requiresApproval,
    };
  }

  /**
   * Check if an agent has permission to use a specific tool.
   */
  checkToolPermission(agentId: string, tool: string): boolean {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (!agent) return false;

    const { agency } = this.state.config;

    // Check blocked tools
    if (agency.blockedTools.includes(tool)) return false;

    // Check allowed tools (empty = all allowed)
    if (agency.allowedTools.length > 0) {
      return agency.allowedTools.includes(tool);
    }

    // Check agent-specific tools
    if (agent.allowedTools.length > 0) {
      return agent.allowedTools.includes(tool);
    }

    return true;
  }

  // ─── Agency Layer ───────────────────────────────────────────────────

  /**
   * Register a new agent in the harness.
   */
  registerAgent(
    name: string,
    role: string,
    options: {
      autonomyLevel?: AutonomyLevel;
      allowedTools?: string[];
      tokenBudget?: number;
    } = {},
  ): AgentProfile {
    const agent: AgentProfile = {
      id: `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      role,
      autonomyLevel: options.autonomyLevel ?? this.state.config.agency.defaultAutonomy,
      allowedTools: options.allowedTools ?? [],
      tokenBudget: options.tokenBudget ?? this.state.config.runtime.sessionTokenBudget,
      tokensUsed: 0,
      actionsCount: 0,
      status: "idle",
    };

    this.state.agents.push(agent);
    return agent;
  }

  /**
   * Update an agent's status and usage.
   */
  updateAgent(agentId: string, updates: Partial<Pick<AgentProfile, "status" | "tokensUsed" | "actionsCount">>): void {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (!agent) return;

    if (updates.status) agent.status = updates.status;
    if (updates.tokensUsed !== undefined) agent.tokensUsed = updates.tokensUsed;
    if (updates.actionsCount !== undefined) agent.actionsCount = updates.actionsCount;
  }

  /**
   * Check if the harness can spawn another agent.
   */
  canSpawnAgent(): boolean {
    const active = this.state.agents.filter(
      (a) => a.status === "running" || a.status === "waiting_approval",
    ).length;
    return active < this.state.config.agency.maxConcurrentAgents;
  }

  // ─── Runtime Layer ──────────────────────────────────────────────────

  /**
   * Check if a resource action is within spend rail limits.
   */
  checkSpendRail(resource: SpendRail["resource"], amount: number): {
    allowed: boolean;
    reason: string;
    currentUsage: number;
    limit: number;
  } {
    const rail = this.state.spendRails.find((r) => r.resource === resource);
    if (!rail) {
      return { allowed: true, reason: "No spend rail configured", currentUsage: 0, limit: Infinity };
    }

    if (rail.currentUsage + amount > rail.limit) {
      return {
        allowed: false,
        reason: `${resource} limit exceeded: ${rail.currentUsage}/${rail.limit}`,
        currentUsage: rail.currentUsage,
        limit: rail.limit,
      };
    }

    return {
      allowed: true,
      reason: `Within limits (${rail.currentUsage + amount}/${rail.limit})`,
      currentUsage: rail.currentUsage,
      limit: rail.limit,
    };
  }

  /**
   * Record resource usage against spend rails.
   */
  recordUsage(resource: SpendRail["resource"], amount: number): void {
    const rail = this.state.spendRails.find((r) => r.resource === resource);
    if (rail) {
      rail.currentUsage += amount;
      rail.exceeded = rail.currentUsage >= rail.limit;
    }

    // Update session metrics
    if (resource === "tokens") {
      this.state.sessionMetrics.totalTokensUsed += amount;
    }
    this.state.sessionMetrics.totalActions++;
  }

  /**
   * Get a summary of all spend rail statuses.
   */
  getSpendSummary(): Array<{
    resource: string;
    used: number;
    limit: number;
    percent: number;
    exceeded: boolean;
  }> {
    return this.state.spendRails.map((rail) => ({
      resource: rail.resource,
      used: rail.currentUsage,
      limit: rail.limit,
      percent: Math.round((rail.currentUsage / rail.limit) * 100),
      exceeded: rail.exceeded,
    }));
  }

  // ─── Evaluation Gates ───────────────────────────────────────────────

  /**
   * Register an evaluation gate.
   */
  addGate(gate: Omit<EvaluationGate, "id">): EvaluationGate {
    const fullGate: EvaluationGate = {
      id: `gate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      ...gate,
    };
    this.state.evaluationGates.push(fullGate);
    this.state.evaluationGates.sort((a, b) => a.order - b.order);
    return fullGate;
  }

  /**
   * Evaluate all gates and return results.
   */
  evaluateGates(context: Record<string, number>): Array<{
    gate: EvaluationGate;
    passed: boolean;
    details: string;
  }> {
    const results: Array<{ gate: EvaluationGate; passed: boolean; details: string }> = [];

    for (const gate of this.state.evaluationGates) {
      let allPassed = true;
      const details: string[] = [];

      for (const condition of gate.conditions) {
        const currentValue = context[condition.id] ?? 0;
        condition.current = currentValue;
        condition.passed = currentValue >= condition.threshold;

        if (!condition.passed) {
          allPassed = false;
          details.push(
            `${condition.description}: ${currentValue}/${condition.threshold}`,
          );
        }
      }

      results.push({
        gate,
        passed: allPassed,
        details: allPassed ? "All conditions met" : details.join("; "),
      });

      this.state.gateResults.push({
        gateId: gate.id,
        passed: allPassed,
        evaluatedAt: new Date().toISOString(),
        details: allPassed ? "PASSED" : `FAILED: ${details.join("; ")}`,
      });
    }

    return results;
  }

  // ─── AGENTS.md Generator ───────────────────────────────────────────

  /**
   * Generate an AGENTS.md governance file from the current CAR config.
   */
  generateAgentsMd(): string {
    const { config } = this.state;
    const lines: string[] = [];

    lines.push("# Agent Execution Guidelines");
    lines.push("");
    lines.push(`## Harness: ${config.name}`);
    lines.push(config.description);
    lines.push("");

    // Control Layer
    lines.push("## Control Layer (Permissions & Policies)");
    lines.push("");
    lines.push("### Blocked Actions");
    if (config.control.blockedActions.length > 0) {
      for (const action of config.control.blockedActions) {
        lines.push(`- ❌ ${action}`);
      }
    } else {
      lines.push("- None");
    }
    lines.push("");

    lines.push("### Requires Human Approval");
    if (config.control.requireApproval.length > 0) {
      for (const action of config.control.requireApproval) {
        lines.push(`- ⚠️ ${action}`);
      }
    } else {
      lines.push("- None");
    }
    lines.push("");

    // Agency Layer
    lines.push("## Agency Layer (Agent Capabilities)");
    lines.push("");
    lines.push(`- **Default Autonomy**: ${config.agency.defaultAutonomy}`);
    lines.push(`- **Max Concurrent Agents**: ${config.agency.maxConcurrentAgents}`);
    lines.push(`- **Max Agent Lifespan**: ${config.agency.maxLifespanMinutes} minutes`);
    lines.push("");

    if (config.agency.allowedTools.length > 0) {
      lines.push("### Allowed Tools");
      for (const tool of config.agency.allowedTools) {
        lines.push(`- ✅ ${tool}`);
      }
      lines.push("");
    }

    if (config.agency.blockedTools.length > 0) {
      lines.push("### Blocked Tools");
      for (const tool of config.agency.blockedTools) {
        lines.push(`- 🚫 ${tool}`);
      }
      lines.push("");
    }

    // Runtime Layer
    lines.push("## Runtime Layer (Budgets & Limits)");
    lines.push("");
    lines.push(`- **Session Token Budget**: ${config.runtime.sessionTokenBudget.toLocaleString()}`);
    lines.push(`- **Action Token Budget**: ${config.runtime.actionTokenBudget.toLocaleString()}`);
    lines.push(`- **Session Cost Cap**: $${config.runtime.sessionCostCap}`);
    lines.push(`- **Action Cost Cap**: $${config.runtime.actionCostCap}`);
    lines.push(`- **Action Timeout**: ${config.runtime.actionTimeoutSeconds}s`);
    lines.push(`- **Session Timeout**: ${config.runtime.sessionTimeoutMinutes}min`);
    lines.push(`- **Max Memory**: ${config.runtime.maxMemoryMB}MB`);
    lines.push("");

    // Evaluation Gates
    if (this.state.evaluationGates.length > 0) {
      lines.push("## Evaluation Gates");
      lines.push("");
      for (const gate of this.state.evaluationGates) {
        lines.push(`### ${gate.name}`);
        lines.push(gate.description);
        lines.push("");
        for (const condition of gate.conditions) {
          lines.push(`- [ ] ${condition.description} (threshold: ${condition.threshold})`);
        }
        lines.push(`- On fail: ${gate.onFail}`);
        lines.push("");
      }
    }

    // Core Directives
    lines.push("## Core Directives");
    lines.push("");
    lines.push("1. **Context Management**: All website assets MUST be stored in `viking://resources/`. Always read `.abstract` (L0) and `.overview` (L1) layers before loading raw `.json` or HTML (L2) files.");
    lines.push("2. **Browser Automation**: Use `BrowserUse` for DOM inspection. Take full-page snapshots on route navigation and map interactive element selectors.");
    lines.push("3. **Diagramming Standard**: All architectural flows must be rendered in standard Mermaid syntax via the `DiagramDesign` skill module.");
    lines.push("4. **Verification Gates**: An audit task is marked COMPLETE only when every route listed in `sitemap.xml` has a corresponding L1 overview and interaction sequence diagram.");
    lines.push("5. **Spend Awareness**: Always check spend rails before executing token-intensive operations. Stay within budget limits.");
    lines.push("6. **Sandbox First**: All code execution must happen in sandboxed containers. Never execute untrusted code outside a sandbox.");
    lines.push("");

    return lines.join("\n");
  }

  // ─── State Access ───────────────────────────────────────────────────

  getState(): HarnessState {
    return { ...this.state };
  }

  getAgents(): AgentProfile[] {
    return [...this.state.agents];
  }

  getSessionMetrics() {
    return { ...this.state.sessionMetrics };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private initSpendRails(config: CARConfig): SpendRail[] {
    return [
      {
        resource: "tokens",
        limit: config.runtime.sessionTokenBudget,
        period: "session",
        currentUsage: 0,
        exceeded: false,
        warningThreshold: 0.8,
      },
      {
        resource: "cost",
        limit: config.runtime.sessionCostCap,
        period: "session",
        currentUsage: 0,
        exceeded: false,
        warningThreshold: 0.8,
      },
      {
        resource: "time",
        limit: config.runtime.sessionTimeoutMinutes * 60,
        period: "session",
        currentUsage: 0,
        exceeded: false,
        warningThreshold: 0.9,
      },
      {
        resource: "memory",
        limit: config.runtime.maxMemoryMB,
        period: "action",
        currentUsage: 0,
        exceeded: false,
        warningThreshold: 0.85,
      },
    ];
  }
}

// ─── Default Configurations ────────────────────────────────────────────────

export const DEFAULT_WEBBUILDER_HARNESS: CARConfig = {
  id: "webbuilder-audit-harness",
  name: "WebBuilder Requirement Analysis Harness",
  description: "Governs autonomous agents performing requirement analysis, DOM crawling, and documentation of webbuilder-hosted projects.",
  control: {
    maxApprovalGates: 3,
    requireApproval: ["deploy", "publish", "delete_resource", "modify_production"],
    blockedActions: ["access_credentials", "modify_env", "bypass_sandbox"],
    autoApproveThreshold: 0.3,
  },
  agency: {
    defaultAutonomy: "semi-autonomous",
    maxConcurrentAgents: 4,
    allowedTools: [
      "browser_use",
      "viking_store",
      "agent_memory",
      "diagram_design",
      "webbuilder_audit",
      "knowledge_base",
    ],
    blockedTools: ["shell_exec", "file_system_write"],
    maxLifespanMinutes: 60,
  },
  runtime: {
    sessionTokenBudget: 100_000,
    actionTokenBudget: 10_000,
    sessionCostCap: 5.0,
    actionCostCap: 0.5,
    actionTimeoutSeconds: 120,
    sessionTimeoutMinutes: 30,
    maxMemoryMB: 512,
  },
};

// ─── Factory ───────────────────────────────────────────────────────────────

let _framework: CARFramework | null = null;

export function getCARFramework(config?: CARConfig): CARFramework {
  if (!_framework) {
    _framework = new CARFramework(config ?? DEFAULT_WEBBUILDER_HARNESS);
  }
  return _framework;
}

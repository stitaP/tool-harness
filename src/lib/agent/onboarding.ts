/**
 * stitaP Agent Onboarding System
 *
 * Implements BCG's agent onboarding concept:
 * "AI agents will be onboarded, just like human workers, to learn roles
 * and responsibilities, access relevant company data and business context,
 * integrate into workflows, and support the humans' responsibilities."
 *
 * Key components:
 * - Role learning (responsibilities, scope, authority)
 * - Data access provisioning (what data the agent can see)
 * - Workflow integration (how the agent fits into existing processes)
 * - Team introduction (who the agent works with)
 * - Performance baselines (expected metrics)
 * - Continuous learning (feedback loops, adaptation)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type OnboardingStatus = "pending" | "in-progress" | "completed" | "failed";
export type OnboardingPhase = "identity" | "data" | "tools" | "workflows" | "team" | "validation";

export interface OnboardingStep {
  id: string;
  phase: OnboardingPhase;
  name: string;
  description: string;
  status: OnboardingStatus;
  startedAt?: string;
  completedAt?: string;
  duration?: number; // ms
  result?: string;
  error?: string;
}

export interface OnboardingConfig {
  agentId: string;
  agentProfileId: string;
  workspaceId: string;
  assignedBy: string; // user ID
  startedAt: string;
  targetCompletionAt: string;
  steps: OnboardingStep[];
  currentPhase: OnboardingPhase;
  progress: number; // 0-100
}

export interface OnboardingResult {
  success: boolean;
  configId: string;
  agentId: string;
  completedAt: string;
  totalDuration: number; // ms
  stepsCompleted: number;
  stepsFailed: number;
  warnings: string[];
  recommendations: string[];
}

// ─── Onboarding Phases ──────────────────────────────────────────────────────

const ONBOARDING_STEPS: Omit<OnboardingStep, "id" | "status">[] = [
  // Phase 1: Identity
  {
    phase: "identity",
    name: "Load agent profile",
    description: "Load the agent's role, goals, and behavioral patterns",
  },
  {
    phase: "identity",
    name: "Configure communication style",
    description: "Set how the agent communicates (formal, casual, technical)",
  },
  {
    phase: "identity",
    name: "Set authority level",
    description: "Define what the agent can and cannot do autonomously",
  },

  // Phase 2: Data Access
  {
    phase: "data",
    name: "Provision data sources",
    description: "Connect the agent to required data repositories",
  },
  {
    phase: "data",
    name: "Set data access policies",
    description: "Define read/write permissions for each data source",
  },
  {
    phase: "data",
    name: "Load knowledge base",
    description: "Ingest relevant documents, guides, and reference material",
  },

  // Phase 3: Tools
  {
    phase: "tools",
    name: "Install required tools",
    description: "Set up the tools the agent needs for its role",
  },
  {
    phase: "tools",
    name: "Configure tool permissions",
    description: "Define which tools the agent can use and under what conditions",
  },
  {
    phase: "tools",
    name: "Test tool connectivity",
    description: "Verify all tools are accessible and functional",
  },

  // Phase 4: Workflows
  {
    phase: "workflows",
    name: "Learn workflow patterns",
    description: "Understand how the agent fits into existing processes",
  },
  {
    phase: "workflows",
    name: "Map trigger conditions",
    description: "Define when the agent should activate",
  },
  {
    phase: "workflows",
    name: "Set escalation paths",
    description: "Define when and how to escalate to humans or other agents",
  },

  // Phase 5: Team
  {
    phase: "team",
    name: "Identify collaborators",
    description: "Map other agents and humans the agent works with",
  },
  {
    phase: "team",
    name: "Set communication channels",
    description: "Configure how the agent communicates with team members",
  },
  {
    phase: "team",
    name: "Define handoff procedures",
    description: "Establish how work transfers between agents and humans",
  },

  // Phase 6: Validation
  {
    phase: "validation",
    name: "Run validation tests",
    description: "Execute test scenarios to verify correct behavior",
  },
  {
    phase: "validation",
    name: "Review with stakeholders",
    description: "Human review and approval of agent configuration",
  },
  {
    phase: "validation",
    name: "Set performance baselines",
    description: "Define expected metrics and success criteria",
  },
];

// ─── Onboarding Manager ─────────────────────────────────────────────────────

export class OnboardingManager {
  private onboardings = new Map<string, OnboardingConfig>();

  /** Start onboarding for a new agent */
  startOnboarding(
    agentId: string,
    agentProfileId: string,
    workspaceId: string,
    assignedBy: string,
    overrides?: Partial<OnboardingConfig>,
  ): OnboardingConfig {
    const id = `onb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const steps: OnboardingStep[] = ONBOARDING_STEPS.map((step, i) => ({
      ...step,
      id: `step_${i}`,
      status: "pending" as OnboardingStatus,
    }));

    const config: OnboardingConfig = {
      agentId,
      agentProfileId,
      workspaceId,
      assignedBy,
      startedAt: now,
      targetCompletionAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      steps,
      currentPhase: "identity",
      progress: 0,
      ...overrides,
    };

    this.onboardings.set(id, config);
    return config;
  }

  /** Complete a step */
  completeStep(
    configId: string,
    stepId: string,
    result?: string,
    error?: string,
  ): OnboardingConfig | null {
    const config = this.onboardings.get(configId);
    if (!config) return null;

    const step = config.steps.find((s) => s.id === stepId);
    if (!step) return null;

    step.status = error ? "failed" : "completed";
    step.completedAt = new Date().toISOString();
    step.result = result;
    step.error = error;
    step.duration = step.startedAt
      ? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
      : undefined;

    // Update progress
    const completed = config.steps.filter((s) => s.status === "completed").length;
    config.progress = Math.round((completed / config.steps.length) * 100);

    // Update current phase
    const phases: OnboardingPhase[] = ["identity", "data", "tools", "workflows", "team", "validation"];
    const currentPhaseIdx = phases.indexOf(config.currentPhase);
    const nextIncompleteStep = config.steps.find(
      (s) => s.status === "pending" || s.status === "in-progress",
    );
    if (nextIncompleteStep) {
      const nextPhaseIdx = phases.indexOf(nextIncompleteStep.phase);
      if (nextPhaseIdx > currentPhaseIdx) {
        config.currentPhase = nextPhaseIdx > currentPhaseIdx ? phases[nextPhaseIdx] : config.currentPhase;
      }
    }

    return config;
  }

  /** Start a step */
  startStep(configId: string, stepId: string): OnboardingConfig | null {
    const config = this.onboardings.get(configId);
    if (!config) return null;

    const step = config.steps.find((s) => s.id === stepId);
    if (!step || step.status !== "pending") return null;

    step.status = "in-progress";
    step.startedAt = new Date().toISOString();
    return config;
  }

  /** Get onboarding status */
  getStatus(configId: string): OnboardingConfig | null {
    return this.onboardings.get(configId) ?? null;
  }

  /** Get all onboardings */
  list(filter?: { agentId?: string; status?: OnboardingStatus }): OnboardingConfig[] {
    let configs = Array.from(this.onboardings.values());
    if (filter?.agentId) configs = configs.filter((c) => c.agentId === filter.agentId);
    if (filter?.status) {
      configs = configs.filter((c) =>
        c.steps.some((s) => s.status === filter.status),
      );
    }
    return configs;
  }

  /** Generate onboarding summary */
  getSummary(configId: string): OnboardingResult | null {
    const config = this.onboardings.get(configId);
    if (!config) return null;

    const completed = config.steps.filter((s) => s.status === "completed").length;
    const failed = config.steps.filter((s) => s.status === "failed").length;
    const warnings = config.steps
      .filter((s) => s.status === "failed")
      .map((s) => `Step "${s.name}" failed: ${s.error ?? "Unknown error"}`);

    const recommendations: string[] = [];
    if (failed > 0) {
      recommendations.push("Review failed steps and retry or skip with manual configuration");
    }
    if (config.progress < 50) {
      recommendations.push("Onboarding is less than 50% complete. Consider prioritizing critical phases.");
    }

    return {
      success: failed === 0 && completed === config.steps.length,
      configId,
      agentId: config.agentId,
      completedAt: new Date().toISOString(),
      totalDuration: config.steps.reduce((sum, s) => sum + (s.duration ?? 0), 0),
      stepsCompleted: completed,
      stepsFailed: failed,
      warnings,
      recommendations,
    };
  }

  /** Auto-complete onboarding (for demo/testing) */
  autoComplete(configId: string): OnboardingConfig | null {
    const config = this.onboardings.get(configId);
    if (!config) return null;

    for (const step of config.steps) {
      if (step.status === "pending") {
        step.status = "completed";
        step.completedAt = new Date().toISOString();
        step.result = "Auto-completed";
        step.duration = 100; // ms
      }
    }

    config.progress = 100;
    config.currentPhase = "validation";
    return config;
  }
}

// ─── Workflow Templates ─────────────────────────────────────────────────────

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  steps: string[];
  requiredRoles: string[];
  estimatedDuration: number; // minutes
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "customer-support",
    name: "Customer Support Flow",
    description: "Handle customer inquiries from ticket creation to resolution",
    triggers: ["new-ticket", "customer-email", "chat-message"],
    steps: [
      "Classify inquiry type",
      "Retrieve customer context",
      "Search knowledge base",
      "Generate response",
      "Review for quality",
      "Send to customer",
      "Follow up if needed",
    ],
    requiredRoles: ["support", "analyst"],
    estimatedDuration: 5,
  },
  {
    id: "code-review",
    name: "Code Review Flow",
    description: "Review pull requests for quality and security",
    triggers: ["pull-request", "merge-request"],
    steps: [
      "Analyze code changes",
      "Check for security issues",
      "Review test coverage",
      "Verify documentation",
      "Generate review comments",
      "Approve or request changes",
    ],
    requiredRoles: ["reviewer", "coder"],
    estimatedDuration: 10,
  },
  {
    id: "data-analysis",
    name: "Data Analysis Flow",
    description: "Analyze data and generate insights reports",
    triggers: ["data-request", "scheduled-analysis"],
    steps: [
      "Understand analysis request",
      "Identify relevant data sources",
      "Query and aggregate data",
      "Perform statistical analysis",
      "Generate visualizations",
      "Write insights report",
      "Share with stakeholders",
    ],
    requiredRoles: ["analyst"],
    estimatedDuration: 15,
  },
  {
    id: "content-creation",
    name: "Content Creation Flow",
    description: "Create marketing or technical content",
    triggers: ["content-request", "blog-topic"],
    steps: [
      "Research topic",
      "Create outline",
      "Write draft",
      "Review for brand voice",
      "Add visuals",
      "Optimize for SEO",
      "Publish or schedule",
    ],
    requiredRoles: ["writer", "reviewer"],
    estimatedDuration: 30,
  },
];

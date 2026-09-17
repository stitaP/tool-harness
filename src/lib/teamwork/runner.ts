/**
 * stitaP Workflow Runner
 *
 * Simulates multi-agent workflow execution in real-time.
 * Each step runs through its agent, produces output, and passes it to the next step.
 * Supports loops (self-verification), parallel execution, and verification gates.
 */

import {
  createWorkflowId,
  type WorkflowConfig,
  type WorkflowStep,
  type AgentRole,
  type AgentStatus,
  type StepStatus,
  type StepResult,
  type VerificationResult,
  type AgentContribution,
} from "./engine";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RunnerEvent {
  id: string;
  timestamp: number;
  type:
    | "step_start"
    | "step_complete"
    | "step_fail"
    | "agent_think"
    | "agent_output"
    | "verification"
    | "loop"
    | "system";
  agentRole?: AgentRole;
  stepId?: string;
  message: string;
  tokensUsed?: number;
}

export interface RunnerAgentState {
  role: AgentRole;
  name: string;
  status: AgentStatus;
  currentStep: string | null;
  tokensUsed: number;
  lastMessage: string;
  startedAt: number | null;
  completedAt: number | null;
}

export interface RunnerStepState {
  id: string;
  name: string;
  role: AgentRole;
  status: StepStatus;
  progress: number;
  tokensUsed: number;
  startedAt: number | null;
  completedAt: number | null;
  result?: string;
  verification?: VerificationResult;
  retryCount: number;
}

export interface RunnerState {
  runId: string;
  status: "idle" | "running" | "paused" | "completed" | "failed" | "aborted";
  agents: RunnerAgentState[];
  steps: RunnerStepState[];
  events: RunnerEvent[];
  totalTokensUsed: number;
  totalDurationMs: number;
  currentStepIndex: number;
  startedAt: number | null;
}

export type RunnerListener = (state: RunnerState) => void;

// ─── Simulated Agent Responses ──────────────────────────────────────────────

const AGENT_RESPONSES: Record<AgentRole, string[]> = {
  explorer: [
    "Analyzing the problem space... I've identified 3 potential approaches.",
    "After exploring the codebase, I recommend a modular architecture.",
    "The problem decomposes into 4 sub-problems. Here's the breakdown...",
    "I've found similar patterns in the existing code. We should follow them.",
  ],
  implementer: [
    "Writing the initial implementation with proper error handling...",
    "The code is modular and follows the established patterns.",
    "I've implemented the core logic. Adding tests now.",
    "Refactoring based on the critic's feedback. Cleaned up edge cases.",
  ],
  critic: [
    "Found a potential race condition in the async handler. Suggesting fix...",
    "Code quality is good. Minor suggestion: extract the validation logic.",
    "Security review passed. No injection vectors found.",
    "Performance concern: the O(n²) loop could be optimized to O(n log n).",
  ],
  verifier: [
    "Running test suite... 47/47 tests passing.",
    "Integration tests pass. Edge cases covered.",
    "Verification complete. All acceptance criteria met.",
    "One flaky test detected. Retrying... now passing.",
  ],
  solver: [
    "Building the proof step by step... Lemma 1 established.",
    "The formal proof follows from the axioms. Here's the derivation.",
    "Mathematical analysis complete. The bound is tight.",
    "Proof verified. All steps are logically sound.",
  ],
  synthesizer: [
    "Combining insights from all agents into a coherent summary...",
    "The synthesis reveals a consistent pattern across all analyses.",
    "Merged all findings. Key insight: the solution is elegant and correct.",
    "Final synthesis ready. All perspectives integrated.",
  ],
  reviewer: [
    "Deep domain review complete. The approach is sound.",
    "Literature comparison: this aligns with recent findings.",
    "Recommended improvements documented. Overall quality: high.",
    "Expert review passed with minor suggestions.",
  ],
  falsifier: [
    "Attempted to disprove with counterexample #1... hypothesis holds.",
    "Found an edge case that weakens the argument. Needs revision.",
    "After 5 counterexamples, the core hypothesis remains valid.",
    "The assumption about convergence needs strengthening.",
  ],
  planner: [
    "Task decomposition complete. 4 parallel workstreams identified.",
    "Resource allocation plan ready. Estimated time: 12 minutes.",
    "Dependencies mapped. Critical path identified.",
    "Execution plan approved. Ready to delegate.",
  ],
  coordinator: [
    "All agents synchronized. Proceeding to next phase.",
    "Conflict resolved between implementer and critic.",
    "Workflow on track. 60% complete.",
    "Handoff to verifier complete. Awaiting results.",
  ],
};

// ─── Runner Engine ──────────────────────────────────────────────────────────

export class WorkflowRunner {
  private state: RunnerState;
  private config: WorkflowConfig;
  private listeners: Set<RunnerListener> = new Set();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private aborted = false;
  private loopCount = 0;
  private maxLoops = 3;

  constructor(config: WorkflowConfig) {
    this.config = config;
    this.state = {
      runId: createWorkflowId(),
      status: "idle",
      agents: config.agents.map((a) => ({
        role: a.role,
        name: a.name,
        status: "idle" as AgentStatus,
        currentStep: null,
        tokensUsed: 0,
        lastMessage: "",
        startedAt: null,
        completedAt: null,
      })),
      steps: config.steps.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        status: "pending" as StepStatus,
        progress: 0,
        tokensUsed: 0,
        startedAt: null,
        completedAt: null,
        retryCount: 0,
      })),
      events: [],
      totalTokensUsed: 0,
      totalDurationMs: 0,
      currentStepIndex: 0,
      startedAt: null,
    };
  }

  subscribe(listener: RunnerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): RunnerState {
    return { ...this.state };
  }

  private emit() {
    const snapshot = { ...this.state };
    this.listeners.forEach((l) => l(snapshot));
  }

  private addEvent(
    type: RunnerEvent["type"],
    message: string,
    agentRole?: AgentRole,
    stepId?: string,
    tokensUsed?: number,
  ) {
    const event: RunnerEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      type,
      agentRole,
      stepId,
      message,
      tokensUsed,
    };
    this.state.events = [...this.state.events, event];
    if (tokensUsed) {
      this.state.totalTokensUsed += tokensUsed;
    }
  }

  private updateAgent(role: AgentRole, updates: Partial<RunnerAgentState>) {
    this.state.agents = this.state.agents.map((a) =>
      a.role === role ? { ...a, ...updates } : a,
    );
  }

  private updateStep(stepId: string, updates: Partial<RunnerStepState>) {
    this.state.steps = this.state.steps.map((s) =>
      s.id === stepId ? { ...s, ...updates } : s,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.aborted) {
          resolve();
          return;
        }
        if (this.paused) {
          this.timer = setTimeout(check, 100);
          return;
        }
        resolve();
      };
      this.timer = setTimeout(check, ms);
    });
  }

  private simulateTokens(baseTokens: number): number {
    // Add some variance to token counts
    const variance = Math.floor(baseTokens * 0.3);
    return baseTokens + Math.floor(Math.random() * variance * 2) - variance;
  }

  private simulateVerification(
    step: RunnerStepState,
  ): VerificationResult {
    // 85% chance of passing on first try, 95% after retry
    const passChance = step.retryCount > 0 ? 0.95 : 0.85;
    const passed = Math.random() < passChance;
    const issues = passed
      ? []
      : [
          "Minor issue detected in output format",
          "Suggestion: add error boundary handling",
        ];

    return {
      stepId: step.id,
      passed,
      confidence: passed ? 0.9 + Math.random() * 0.1 : 0.6 + Math.random() * 0.2,
      issues,
      suggestions: passed
        ? []
        : ["Consider adding retry logic", "Review edge case handling"],
    };
  }

  async start() {
    if (this.state.status === "running") return;

    this.state.status = "running";
    this.state.startedAt = Date.now();
    this.loopCount = 0;
    this.addEvent("system", "Workflow started", undefined, undefined, 0);
    this.emit();

    try {
      for (
        let i = 0;
        i < this.config.steps.length && !this.aborted;
        i++
      ) {
        this.state.currentStepIndex = i;
        const stepConfig = this.config.steps[i];
        const stepState = this.state.steps[i];

        // Check token budget
        if (this.state.totalTokensUsed >= this.config.maxTotalTokens) {
          this.addEvent(
            "system",
            `Token budget exceeded (${this.config.maxTotalTokens}). Stopping.`,
          );
          break;
        }

        // Check time budget
        const elapsed = Date.now() - (this.state.startedAt ?? Date.now());
        if (elapsed >= this.config.maxTimeMs) {
          this.addEvent(
            "system",
            `Time budget exceeded (${this.config.maxTimeMs}ms). Stopping.`,
          );
          break;
        }

        await this.runStep(stepConfig, stepState);

        // Handle loop for self-verification
        if (
          stepConfig.loopEnabled &&
          stepState.result &&
          !stepState.verification?.passed &&
          this.loopCount < this.maxLoops
        ) {
          this.loopCount++;
          this.addEvent(
            "loop",
            `Loop iteration ${this.loopCount}/${this.maxLoops} — revising...`,
            stepConfig.role,
            stepConfig.id,
            0,
          );
          // Re-run the same step
          i--; // Will be incremented by the for loop
          this.updateStep(stepConfig.id, {
            status: "pending",
            progress: 0,
          });
        }
      }

      if (!this.aborted) {
        const failed = this.state.steps.some((s) => s.status === "failed");
        this.state.status = failed ? "failed" : "completed";
        this.state.totalDurationMs = Date.now() - (this.state.startedAt ?? Date.now());
        this.addEvent(
          "system",
          failed
            ? "Workflow completed with failures"
            : "Workflow completed successfully",
        );
      }
    } catch (err) {
      this.state.status = "failed";
      this.addEvent(
        "system",
        `Workflow failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    this.emit();
  }

  private async runStep(
    stepConfig: WorkflowStep,
    stepState: RunnerStepState,
  ) {
    const agent = this.state.agents.find((a) => a.role === stepConfig.role);
    if (!agent) {
      this.updateStep(stepConfig.id, { status: "failed" });
      this.addEvent(
        "step_fail",
        `No agent configured for role: ${stepConfig.role}`,
        stepConfig.role,
        stepConfig.id,
      );
      return;
    }

    // Start step
    this.updateStep(stepConfig.id, {
      status: "running",
      startedAt: Date.now(),
      progress: 0,
    });
    this.updateAgent(stepConfig.role, {
      status: "thinking",
      currentStep: stepConfig.id,
      startedAt: Date.now(),
    });
    this.addEvent(
      "step_start",
      `Starting: ${stepConfig.name}`,
      stepConfig.role,
      stepConfig.id,
    );
    this.emit();

    // Simulate thinking phase
    await this.delay(300 + Math.random() * 500);
    if (this.aborted) return;

    const thinkTokens = this.simulateTokens(200);
    const thinkMsg = `Analyzing task: ${stepConfig.description}`;
    this.updateAgent(stepConfig.role, {
      status: "working",
      lastMessage: thinkMsg,
      tokensUsed: agent.tokensUsed + thinkTokens,
    });
    this.addEvent(
      "agent_think",
      thinkMsg,
      stepConfig.role,
      stepConfig.id,
      thinkTokens,
    );
    this.updateStep(stepConfig.id, { progress: 25, tokensUsed: stepState.tokensUsed + thinkTokens });
    this.emit();

    // Simulate working phase
    await this.delay(500 + Math.random() * 1000);
    if (this.aborted) return;

    const workTokens = this.simulateTokens(stepConfig.maxTokens * 0.7);
    const responses = AGENT_RESPONSES[stepConfig.role] ?? ["Working..."];
    const response = responses[Math.floor(Math.random() * responses.length)];

    this.updateAgent(stepConfig.role, {
      lastMessage: response,
      tokensUsed: agent.tokensUsed + workTokens + thinkTokens,
    });
    this.addEvent(
      "agent_output",
      response,
      stepConfig.role,
      stepConfig.id,
      workTokens,
    );
    this.updateStep(stepConfig.id, {
      progress: 60,
      tokensUsed: stepState.tokensUsed + workTokens + thinkTokens,
      result: response,
    });
    this.emit();

    // Simulate completion
    await this.delay(300 + Math.random() * 500);
    if (this.aborted) return;

    const completeTokens = this.simulateTokens(stepConfig.maxTokens * 0.3);
    this.updateAgent(stepConfig.role, {
      status: "completed",
      completedAt: Date.now(),
      tokensUsed: agent.tokensUsed + completeTokens,
    });
    this.updateStep(stepConfig.id, {
      progress: 80,
      tokensUsed: stepState.tokensUsed + completeTokens,
    });

    // Verification if required
    if (stepConfig.verificationRequired) {
      this.updateAgent(stepConfig.role, { status: "reviewing" });
      await this.delay(400 + Math.random() * 600);
      if (this.aborted) return;

      const verification = this.simulateVerification(stepState);
      this.updateStep(stepConfig.id, { verification });

      this.addEvent(
        "verification",
        verification.passed
          ? `Verification PASSED (confidence: ${(verification.confidence * 100).toFixed(0)}%)`
          : `Verification FAILED — issues: ${verification.issues.join(", ")}`,
        stepConfig.role,
        stepConfig.id,
        0,
      );

      if (!verification.passed && stepState.retryCount < stepConfig.retries) {
        this.updateStep(stepConfig.id, {
          retryCount: stepState.retryCount + 1,
        });
        this.addEvent(
          "loop",
          `Retrying step (${stepState.retryCount + 1}/${stepConfig.retries})...`,
          stepConfig.role,
          stepConfig.id,
        );
      }
    }

    // Complete step
    this.updateStep(stepConfig.id, {
      status: "completed",
      progress: 100,
      completedAt: Date.now(),
    });
    this.updateAgent(stepConfig.role, {
      status: "idle",
      currentStep: null,
    });
    this.addEvent(
      "step_complete",
      `Completed: ${stepConfig.name}`,
      stepConfig.role,
      stepConfig.id,
    );
    this.emit();
  }

  pause() {
    this.paused = true;
    this.state.status = "paused";
    this.addEvent("system", "Workflow paused");
    this.emit();
  }

  resume() {
    this.paused = false;
    this.state.status = "running";
    this.addEvent("system", "Workflow resumed");
    this.emit();
  }

  abort() {
    this.aborted = true;
    this.paused = false;
    this.state.status = "aborted";
    this.state.totalDurationMs = Date.now() - (this.state.startedAt ?? Date.now());
    this.addEvent("system", "Workflow aborted by user");
    this.emit();
    if (this.timer) clearTimeout(this.timer);
  }

  retryStep(stepId: string) {
    const step = this.state.steps.find((s) => s.id === stepId);
    if (step && step.status === "failed") {
      this.updateStep(stepId, {
        status: "pending",
        progress: 0,
        retryCount: step.retryCount + 1,
      });
      this.addEvent("loop", `Retrying step: ${step.name}`, step.role, stepId);
      this.emit();
    }
  }
}

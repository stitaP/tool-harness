/**
 * stitaP Teamwork Engine
 *
 * A multi-agent framework where agents propose, stress-test, and build
 * solutions autonomously over hours or days. Inspired by Google
 * Antigravity's Teamwork framework for frontier, long-horizon challenges.
 *
 * Key principles:
 * - Agents work in parallel where possible
 * - Each agent has a specialized role
 * - Solutions are stress-tested before acceptance
 * - User maintains full control over configurations
 * - Token budgets and time limits prevent runaway costs
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type WorkflowType =
  | "iterative-coding"
  | "distributed-coding"
  | "long-proof"
  | "self-verification"
  | "document-review";

export type AgentRole =
  | "explorer"
  | "implementer"
  | "critic"
  | "verifier"
  | "solver"
  | "synthesizer"
  | "reviewer"
  | "falsifier"
  | "planner"
  | "coordinator";

export type AgentStatus =
  | "idle"
  | "thinking"
  | "working"
  | "reviewing"
  | "waiting"
  | "completed"
  | "failed"
  | "paused";

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface WorkflowStep {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
  inputs: string[];
  outputs: string[];
  status: StepStatus;
  maxTokens: number;
  timeoutMs: number;
  retries: number;
  verificationRequired: boolean;
  loopEnabled?: boolean;
  loopCondition?: string;
  result?: StepResult;
}

export interface StepResult {
  content: string;
  confidence: number;
  tokensUsed: number;
  durationMs: number;
  verificationPassed?: boolean;
  issues?: string[];
}

export interface AgentConfig {
  role: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  tools: string[];
  allowedDomains?: string[];
  blockedDomains?: string[];
  principles: string[];
}

export interface WorkflowConfig {
  type: WorkflowType;
  name: string;
  description: string;
  goal: string;
  context: string;
  agents: AgentConfig[];
  steps: WorkflowStep[];
  maxTotalTokens: number;
  maxTimeMs: number;
  verificationStrictness: "none" | "basic" | "strict" | "paranoid";
  parallelExecution: boolean;
  memoryEnabled: boolean;
  memoryScope: "session" | "workflow" | "persistent";
  onProgress?: (update: ProgressUpdate) => void;
}

export interface ProgressUpdate {
  timestamp: number;
  stepId: string;
  agentRole: AgentRole;
  status: StepStatus;
  message: string;
  tokensUsed: number;
  totalTokensUsed: number;
  percentComplete: number;
}

export interface WorkflowResult {
  success: boolean;
  workflowId: string;
  outputs: Record<string, string>;
  summary: string;
  totalTokensUsed: number;
  totalDurationMs: number;
  stepsCompleted: number;
  stepsFailed: number;
  verificationResults: VerificationResult[];
  agentContributions: AgentContribution[];
}

export interface VerificationResult {
  stepId: string;
  passed: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
}

export interface AgentContribution {
  role: AgentRole;
  stepId: string;
  content: string;
  tokensUsed: number;
  durationMs: number;
}

// ─── Workflow Templates ─────────────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: Record<WorkflowType, {
  name: string;
  description: string;
  steps: Omit<WorkflowStep, "id" | "status" | "result">[];
  defaultAgents: AgentConfig[];
}> = {
  "iterative-coding": {
    name: "Iterative Coding",
    description: "Non-decomposable problems where implementation and refinement happen in sequence. Best for single-file features, algorithms, or complex logic.",
    steps: [
      {
        name: "Implement",
        role: "implementer",
        description: "Write the initial implementation based on requirements",
        inputs: ["goal", "context"],
        outputs: ["implementation"],
        maxTokens: 4000,
        timeoutMs: 120_000,
        retries: 2,
        verificationRequired: false,
      },
      {
        name: "Refine Round 1",
        role: "critic",
        description: "Review implementation for bugs, edge cases, and improvements",
        inputs: ["implementation"],
        outputs: ["refined_v1"],
        maxTokens: 2000,
        timeoutMs: 60_000,
        retries: 1,
        verificationRequired: false,
      },
      {
        name: "Refine Round 2",
        role: "implementer",
        description: "Apply refinements and optimize the code",
        inputs: ["refined_v1"],
        outputs: ["final_implementation"],
        maxTokens: 3000,
        timeoutMs: 90_000,
        retries: 1,
        verificationRequired: true,
      },
    ],
    defaultAgents: [
      {
        role: "implementer",
        name: "Primary Coder",
        description: "Writes and refines implementation code",
        systemPrompt: "You are an expert software engineer. Write clean, efficient, and well-documented code. Focus on correctness and maintainability.",
        maxTokens: 4000,
        temperature: 0.3,
        tools: ["code-execution", "file-system"],
        principles: ["Write production-quality code", "Handle edge cases", "Add meaningful comments"],
      },
      {
        role: "critic",
        name: "Code Reviewer",
        description: "Reviews code for bugs, improvements, and best practices",
        systemPrompt: "You are a senior code reviewer. Identify bugs, security issues, performance problems, and suggest improvements. Be thorough but constructive.",
        maxTokens: 2000,
        temperature: 0.2,
        tools: ["code-analysis"],
        principles: ["Find real bugs, not style issues", "Suggest specific fixes", "Prioritize security"],
      },
    ],
  },

  "distributed-coding": {
    name: "Distributed Coding",
    description: "Decomposable software engineering tasks where multiple agents work on different parts in parallel. Best for multi-file features, system design, or refactoring.",
    steps: [
      {
        name: "Explore",
        role: "explorer",
        description: "Analyze requirements and design the solution architecture",
        inputs: ["goal", "context"],
        outputs: ["architecture", "task_breakdown"],
        maxTokens: 3000,
        timeoutMs: 90_000,
        retries: 1,
        verificationRequired: false,
      },
      {
        name: "Implement",
        role: "implementer",
        description: "Build the components according to the architecture",
        inputs: ["architecture", "task_breakdown"],
        outputs: ["implementation"],
        maxTokens: 6000,
        timeoutMs: 180_000,
        retries: 2,
        verificationRequired: false,
      },
      {
        name: "Critic",
        role: "critic",
        description: "Review the complete implementation for issues",
        inputs: ["implementation"],
        outputs: ["review_feedback"],
        maxTokens: 3000,
        timeoutMs: 90_000,
        retries: 1,
        verificationRequired: false,
      },
      {
        name: "Verify",
        role: "verifier",
        description: "Run tests and validate the implementation works correctly",
        inputs: ["implementation", "review_feedback"],
        outputs: ["verified_implementation"],
        maxTokens: 2000,
        timeoutMs: 120_000,
        retries: 1,
        verificationRequired: true,
      },
    ],
    defaultAgents: [
      {
        role: "explorer",
        name: "System Architect",
        description: "Analyzes requirements and designs the solution",
        systemPrompt: "You are a senior software architect. Break down complex problems into manageable components. Design clear interfaces and data flows.",
        maxTokens: 3000,
        temperature: 0.3,
        tools: ["code-analysis", "documentation"],
        principles: ["Keep it simple", "Design for extensibility", "Document decisions"],
      },
      {
        role: "implementer",
        name: "Feature Developer",
        description: "Builds the components",
        systemPrompt: "You are a skilled developer. Write clean, modular code following the architecture. Each component should be self-contained and well-tested.",
        maxTokens: 6000,
        temperature: 0.3,
        tools: ["code-execution", "file-system", "testing"],
        principles: ["Follow the architecture", "Write tests", "Handle errors gracefully"],
      },
      {
        role: "critic",
        name: "Quality Analyst",
        description: "Reviews for quality and correctness",
        systemPrompt: "You are a quality assurance expert. Find bugs, security vulnerabilities, and design flaws. Suggest specific improvements.",
        maxTokens: 3000,
        temperature: 0.2,
        tools: ["code-analysis", "security-scanning"],
        principles: ["Focus on critical issues", "Provide actionable feedback", "Check for edge cases"],
      },
      {
        role: "verifier",
        name: "Test Runner",
        description: "Validates the implementation",
        systemPrompt: "You are a test automation expert. Run comprehensive tests, verify all requirements are met, and ensure the code works correctly.",
        maxTokens: 2000,
        temperature: 0.1,
        tools: ["code-execution", "testing"],
        principles: ["Test all paths", "Verify edge cases", "Check performance"],
      },
    ],
  },

  "long-proof": {
    name: "Long Proof",
    description: "Open math and science problems requiring exploration, falsification, and rigorous verification. Best for mathematical proofs, scientific hypotheses, or complex algorithms.",
    steps: [
      {
        name: "Explore",
        role: "explorer",
        description: "Explore the problem space and identify potential approaches",
        inputs: ["goal", "context"],
        outputs: ["approaches", "hypotheses"],
        maxTokens: 4000,
        timeoutMs: 120_000,
        retries: 2,
        verificationRequired: false,
      },
      {
        name: "Falsify",
        role: "falsifier",
        description: "Try to disprove each hypothesis with counterexamples",
        inputs: ["approaches", "hypotheses"],
        outputs: ["validated_hypotheses", "refuted"],
        maxTokens: 3000,
        timeoutMs: 90_000,
        retries: 1,
        verificationRequired: false,
      },
      {
        name: "Solve",
        role: "solver",
        description: "Build the formal proof or solution from validated hypotheses",
        inputs: ["validated_hypotheses"],
        outputs: ["solution"],
        maxTokens: 6000,
        timeoutMs: 180_000,
        retries: 2,
        verificationRequired: false,
      },
      {
        name: "Verify",
        role: "verifier",
        description: "Rigorously verify each step of the proof/solution",
        inputs: ["solution"],
        outputs: ["verified_solution"],
        maxTokens: 4000,
        timeoutMs: 120_000,
        retries: 1,
        verificationRequired: true,
      },
    ],
    defaultAgents: [
      {
        role: "explorer",
        name: "Research Explorer",
        description: "Explores problem space and generates hypotheses",
        systemPrompt: "You are a research scientist. Explore all possible approaches to the problem. Generate diverse hypotheses and identify the most promising directions.",
        maxTokens: 4000,
        temperature: 0.5,
        tools: ["web-search", "arxiv-search"],
        principles: ["Consider all angles", "Be creative", "Document reasoning"],
      },
      {
        role: "falsifier",
        name: "Devil's Advocate",
        description: "Attempts to disprove hypotheses",
        systemPrompt: "You are a rigorous skeptic. Try to find counterexamples, logical flaws, or hidden assumptions in each hypothesis. Be thorough.",
        maxTokens: 3000,
        temperature: 0.3,
        tools: ["code-execution", "mathematical-reasoning"],
        principles: ["Attack every assumption", "Find edge cases", "Be relentless"],
      },
      {
        role: "solver",
        name: "Proof Builder",
        description: "Constructs formal proofs and solutions",
        systemPrompt: "You are a mathematician. Build rigorous, step-by-step proofs. Every step must be justified. Use formal notation where appropriate.",
        maxTokens: 6000,
        temperature: 0.2,
        tools: ["mathematical-reasoning", "code-execution"],
        principles: ["Rigor over speed", "Justify every step", "Use formal notation"],
      },
      {
        role: "verifier",
        name: "Proof Checker",
        description: "Verifies the correctness of proofs",
        systemPrompt: "You are a proof checker. Verify each step of the proof is logically sound. Check for gaps, unstated assumptions, or circular reasoning.",
        maxTokens: 4000,
        temperature: 0.1,
        tools: ["mathematical-reasoning", "verification"],
        principles: ["Check every step", "Look for gaps", "Verify assumptions"],
      },
    ],
  },

  "self-verification": {
    name: "Self-Verification",
    description: "Deep reasoning with rigorous self-verification loops. Best for complex analysis, debugging, or any task requiring high confidence.",
    steps: [
      {
        name: "Generate",
        role: "implementer",
        description: "Generate an initial solution or analysis",
        inputs: ["goal", "context"],
        outputs: ["draft"],
        maxTokens: 4000,
        timeoutMs: 120_000,
        retries: 1,
        verificationRequired: false,
      },
      {
        name: "Verify",
        role: "verifier",
        description: "Verify the solution against requirements",
        inputs: ["draft"],
        outputs: ["verification_report"],
        maxTokens: 2000,
        timeoutMs: 60_000,
        retries: 1,
        verificationRequired: false,
      },
      {
        name: "Revise",
        role: "implementer",
        description: "Revise based on verification feedback",
        inputs: ["draft", "verification_report"],
        outputs: ["revised"],
        maxTokens: 3000,
        timeoutMs: 90_000,
        retries: 2,
        verificationRequired: true,
        loopEnabled: true,
        loopCondition: "verification_passed === false AND loop_count < 3",
      },
    ],
    defaultAgents: [
      {
        role: "implementer",
        name: "Deep Reasoner",
        description: "Generates and refines solutions",
        systemPrompt: "You are a deep thinker. Generate thorough, well-reasoned solutions. When revising, address all feedback directly.",
        maxTokens: 4000,
        temperature: 0.3,
        tools: ["code-execution", "analysis"],
        principles: ["Be thorough", "Address all feedback", "Don't skip steps"],
      },
      {
        role: "verifier",
        name: "Quality Gate",
        description: "Verifies correctness and completeness",
        systemPrompt: "You are a verification expert. Check if the solution fully addresses the requirements. Identify any gaps, errors, or missing cases.",
        maxTokens: 2000,
        temperature: 0.1,
        tools: ["verification", "testing"],
        principles: ["Be strict", "Check all requirements", "Identify edge cases"],
      },
    ],
  },

  "document-review": {
    name: "Document Review",
    description: "Paper and document analysis with segmentation, review, and synthesis. Best for research papers, technical docs, or large codebases.",
    steps: [
      {
        name: "Segment",
        role: "planner",
        description: "Break document into logical sections for parallel review",
        inputs: ["goal", "context"],
        outputs: ["segments", "review_plan"],
        maxTokens: 2000,
        timeoutMs: 60_000,
        retries: 1,
        verificationRequired: false,
      },
      {
        name: "Review",
        role: "reviewer",
        description: "Review each segment for key insights, issues, and recommendations",
        inputs: ["segments"],
        outputs: ["segment_reviews"],
        maxTokens: 5000,
        timeoutMs: 180_000,
        retries: 1,
        verificationRequired: false,
      },
      {
        name: "Synthesize",
        role: "synthesizer",
        description: "Combine segment reviews into a coherent analysis",
        inputs: ["segment_reviews"],
        outputs: ["synthesis"],
        maxTokens: 3000,
        timeoutMs: 90_000,
        retries: 1,
        verificationRequired: false,
      },
      {
        name: "Verify",
        role: "verifier",
        description: "Verify the synthesis accurately represents the document",
        inputs: ["synthesis", "context"],
        outputs: ["verified_analysis"],
        maxTokens: 2000,
        timeoutMs: 60_000,
        retries: 1,
        verificationRequired: true,
      },
    ],
    defaultAgents: [
      {
        role: "planner",
        name: "Document Planner",
        description: "Analyzes structure and plans review strategy",
        systemPrompt: "You are a document analyst. Identify the logical sections and plan an efficient review strategy. Focus on the most important parts first.",
        maxTokens: 2000,
        temperature: 0.3,
        tools: ["document-parsing"],
        principles: ["Identify key sections", "Plan efficiently", "Prioritize importance"],
      },
      {
        role: "reviewer",
        name: "Expert Reviewer",
        description: "Reviews document sections in depth",
        systemPrompt: "You are a domain expert reviewer. Analyze each section carefully. Extract key insights, identify issues, and note recommendations.",
        maxTokens: 5000,
        temperature: 0.3,
        tools: ["document-parsing", "web-search"],
        principles: ["Be thorough", "Extract key points", "Note issues"],
      },
      {
        role: "synthesizer",
        name: "Insight Synthesizer",
        description: "Combines reviews into coherent analysis",
        systemPrompt: "You are an analyst who synthesizes information. Combine multiple reviews into a clear, actionable summary. Highlight the most important findings.",
        maxTokens: 3000,
        temperature: 0.3,
        tools: ["summarization"],
        principles: ["Be concise", "Highlight key insights", "Be actionable"],
      },
      {
        role: "verifier",
        name: "Accuracy Checker",
        description: "Verifies synthesis accuracy",
        systemPrompt: "You are a fact-checker. Verify that the synthesis accurately represents the original document. Flag any misrepresentations or missing information.",
        maxTokens: 2000,
        temperature: 0.1,
        tools: ["verification"],
        principles: ["Check accuracy", "Flag misrepresentations", "Verify completeness"],
      },
    ],
  },
};

// ─── Role Definitions ───────────────────────────────────────────────────────

export const ROLE_DEFINITIONS: Record<AgentRole, {
  name: string;
  description: string;
  color: string;
  icon: string;
  strengths: string[];
  weaknesses: string[];
}> = {
  explorer: {
    name: "Explorer",
    description: "Explores problem spaces, generates hypotheses, and identifies approaches",
    color: "#F59E0B",
    icon: "🔍",
    strengths: ["Creative thinking", "Broad perspective", "Pattern recognition"],
    weaknesses: ["May miss details", "Can be too abstract"],
  },
  implementer: {
    name: "Implementer",
    description: "Builds solutions, writes code, creates implementations",
    color: "#3B82F6",
    icon: "⚙️",
    strengths: ["Technical depth", "Practical solutions", "Code quality"],
    weaknesses: ["May over-engineer", "Can miss big picture"],
  },
  critic: {
    name: "Critic",
    description: "Reviews work for bugs, improvements, and best practices",
    color: "#EF4444",
    icon: "🔎",
    strengths: ["Attention to detail", "Best practices", "Security awareness"],
    weaknesses: ["Can be too negative", "May slow progress"],
  },
  verifier: {
    name: "Verifier",
    description: "Validates solutions, runs tests, ensures correctness",
    color: "#10B981",
    icon: "✅",
    strengths: ["Thorough testing", "Edge case detection", "Quality assurance"],
    weaknesses: ["Can be too strict", "May block progress"],
  },
  solver: {
    name: "Solver",
    description: "Builds formal proofs, mathematical solutions, complex reasoning",
    color: "#8B5CF6",
    icon: "🧮",
    strengths: ["Mathematical rigor", "Formal reasoning", "Proof construction"],
    weaknesses: ["Can be slow", "May over-formalize"],
  },
  synthesizer: {
    name: "Synthesizer",
    description: "Combines multiple inputs into coherent outputs",
    color: "#EC4899",
    icon: "🔗",
    strengths: ["Integration", "Summarization", "Pattern synthesis"],
    weaknesses: ["May lose details", "Can be too brief"],
  },
  reviewer: {
    name: "Reviewer",
    description: "Deep domain expert review of specific content",
    color: "#F97316",
    icon: "📋",
    strengths: ["Domain expertise", "Deep analysis", "Quality feedback"],
    weaknesses: ["Can be too focused", "May miss context"],
  },
  falsifier: {
    name: "Falsifier",
    description: "Attempts to disprove hypotheses and find counterexamples",
    color: "#DC2626",
    icon: "⚔️",
    strengths: ["Critical thinking", "Counterexample generation", "Assumption testing"],
    weaknesses: ["Can be too aggressive", "May discourage exploration"],
  },
  planner: {
    name: "Planner",
    description: "Analyzes problems and creates execution plans",
    color: "#0EA5E9",
    icon: "📐",
    strengths: ["Strategic thinking", "Task decomposition", "Resource planning"],
    weaknesses: ["Can over-plan", "May miss details"],
  },
  coordinator: {
    name: "Coordinator",
    description: "Manages agent communication and workflow execution",
    color: "#6366F1",
    icon: "🎯",
    strengths: ["Orchestration", "Communication", "Conflict resolution"],
    weaknesses: ["Can become bottleneck", "May over-manage"],
  },
};

// ─── Engine ─────────────────────────────────────────────────────────────────

let workflowCounter = 0;

export function createWorkflowId(): string {
  return `wf_${Date.now()}_${++workflowCounter}`;
}

export function getDefaultConfig(type: WorkflowType): WorkflowConfig {
  const template = WORKFLOW_TEMPLATES[type];
  return {
    type,
    name: template.name,
    description: template.description,
    goal: "",
    context: "",
    agents: template.defaultAgents.map((a) => ({ ...a })),
    steps: template.steps.map((s, i) => ({
      ...s,
      id: `step_${i}`,
      status: "pending" as StepStatus,
    })),
    maxTotalTokens: 50_000,
    maxTimeMs: 600_000, // 10 minutes
    verificationStrictness: "basic",
    parallelExecution: type === "distributed-coding",
    memoryEnabled: true,
    memoryScope: "session",
  };
}

export function validateConfig(config: WorkflowConfig): string[] {
  const errors: string[] = [];

  if (!config.goal.trim()) {
    errors.push("Goal is required");
  }

  if (config.agents.length === 0) {
    errors.push("At least one agent is required");
  }

  if (config.steps.length === 0) {
    errors.push("At least one step is required");
  }

  if (config.maxTotalTokens < 1000) {
    errors.push("Maximum tokens must be at least 1000");
  }

  if (config.maxTimeMs < 30_000) {
    errors.push("Maximum time must be at least 30 seconds");
  }

  // Check that each step has a matching agent role
  for (const step of config.steps) {
    const hasAgent = config.agents.some((a) => a.role === step.role);
    if (!hasAgent) {
      errors.push(`Step "${step.name}" requires a ${step.role} agent, but none is configured`);
    }
  }

  return errors;
}

export function estimateTokenCost(config: WorkflowConfig): {
  totalSteps: number;
  estimatedTokens: number;
  estimatedCostUSD: number;
  estimatedTimeMs: number;
} {
  const totalTokens = config.steps.reduce((sum, s) => sum + s.maxTokens, 0);
  const totalTime = config.steps.reduce((sum, s) => sum + s.timeoutMs, 0);
  // Rough estimate: $0.01 per 1K tokens
  const cost = (totalTokens / 1000) * 0.01;

  return {
    totalSteps: config.steps.length,
    estimatedTokens: Math.min(totalTokens, config.maxTotalTokens),
    estimatedCostUSD: cost,
    estimatedTimeMs: Math.min(totalTime, config.maxTimeMs),
  };
}

export function getRecommendedWorkflow(goal: string): WorkflowType {
  const lower = goal.toLowerCase();

  if (lower.includes("proof") || lower.includes("theorem") || lower.includes("math")) {
    return "long-proof";
  }
  if (lower.includes("review") || lower.includes("paper") || lower.includes("document")) {
    return "document-review";
  }
  if (lower.includes("verify") || lower.includes("validate") || lower.includes("test")) {
    return "self-verification";
  }
  if (lower.includes("refactor") || lower.includes("system") || lower.includes("architecture")) {
    return "distributed-coding";
  }
  return "iterative-coding";
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

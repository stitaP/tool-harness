/**
 * stitaP Agent Studio — Configuration Engine
 *
 * Answers "where are agent roles defined, and how do I scope one?":
 *
 * 1. Role catalog     - the eight swarm roles with responsibilities
 *                       and a default scope each.
 * 2. Knowledge scope  - per-agent document list (PDFs, online material,
 *                       web links, notes) plus the internet-policy
 *                       checkbox: browse the web, or confine itself to
 *                       provided material only.
 * 3. Tool scope       - multiselect from the harness store's tool list,
 *                       with a basic principle recorded per tool.
 * 4. Solution templates - reusable accomplishment recipes, e.g. "capture
 *                       a screenshot after each milestone and attach it
 *                       to the assigned Jira ticket".
 * 5. Team workspace   - multiple users assign defined agents to tasks
 *                       and leave feedback; checkins land on the
 *                       INTERNAL git by default and reach GitHub/GitLab
 *                       or the ticketing platform only per preference.
 * 6. State colors     - green while working; distinct colors per state.
 *
 * Zero dependencies. Deterministic. Validation is strict: a confined
 * agent with web sources enabled is a configuration error, not a
 * silent behavior.
 */

// ─── Agent states and colors ───────────────────────────────────────────────────

export type AgentState =
  | "idle"
  | "planning"
  | "working"
  | "awaiting-approval"
  | "blocked"
  | "reviewing"
  | "done"
  | "error";

export interface AgentStateStyle {
  state: AgentState;
  label: string;
  /** Tailwind text color class for the status dot/icon */
  color: string;
  /** Hex for canvas/SVG contexts */
  hex: string;
  meaning: string;
}

export const AGENT_STATES: Record<AgentState, AgentStateStyle> = {
  idle:              { state: "idle",              label: "Idle",              color: "text-zinc-400",   hex: "#a1a1aa", meaning: "Configured but not assigned to active work." },
  planning:          { state: "planning",          label: "Planning",          color: "text-sky-400",    hex: "#38bdf8", meaning: "Decomposing the task into steps." },
  working:           { state: "working",           label: "Working",           color: "text-emerald-400", hex: "#34d399", meaning: "Actively executing: tools running, tokens flowing." },
  "awaiting-approval": { state: "awaiting-approval", label: "Awaiting approval", color: "text-amber-400", hex: "#fbbf24", meaning: "Paused at a risk gate; a human must decide." },
  blocked:           { state: "blocked",           label: "Blocked",           color: "text-rose-400",   hex: "#fb7185", meaning: "Cannot proceed: missing dependency, credential, or access." },
  reviewing:         { state: "reviewing",         label: "In review",         color: "text-violet-400", hex: "#a78bfa", meaning: "Work submitted; a reviewer agent or user is checking it." },
  done:              { state: "done",              label: "Done",              color: "text-teal-300",   hex: "#5eead4", meaning: "Finished with verification evidence attached." },
  error:             { state: "error",             label: "Error",             color: "text-red-400",    hex: "#f87171", meaning: "Failed; the trace waterfall shows where and why." },
};

// ─── Knowledge sources ─────────────────────────────────────────────────────────

export type KnowledgeKind = "pdf" | "url" | "note" | "web";

export interface KnowledgeSource {
  id: string;
  kind: KnowledgeKind;
  /** File name, URL, or note title */
  ref: string;
  enabled: boolean;
  /** For web kind: whether re-fetching is allowed at run time */
  refetchAllowed: boolean;
}

export type InternetPolicy = "confined" | "web-allowed";

export interface KnowledgeScope {
  policy: InternetPolicy;
  sources: KnowledgeSource[];
}

// ─── Roles ─────────────────────────────────────────────────────────────────────

export interface RoleDefinition {
  role: string;
  title: string;
  responsibilities: string[];
  /** Tools this role reaches for first when no explicit scope is set */
  defaultToolCategories: string[];
  defaultContextTokens: number;
}

export const ROLE_CATALOG: RoleDefinition[] = [
  {
    role: "planner",
    title: "Planner",
    responsibilities: [
      "Decompose the goal into an ordered, dependency-aware task list.",
      "Assign each task a role, acceptance criteria, and risk level.",
      "Re-plan when the blackboard reports a failed branch.",
    ],
    defaultToolCategories: ["knowledge", "scheduler", "terminal"],
    defaultContextTokens: 4096,
  },
  {
    role: "coder",
    title: "Coder",
    responsibilities: [
      "Implement one user story at a time against the repo conventions.",
      "Run the project's typecheck/tests before declaring a step done.",
      "Commit to the internal git with a descriptive message per story.",
    ],
    defaultToolCategories: ["terminal", "browser", "document"],
    defaultContextTokens: 6144,
  },
  {
    role: "tester",
    title: "Tester",
    responsibilities: [
      "Execute the acceptance criteria as repeatable checks, not vibes.",
      "Capture interaction evidence: verdicts, timings, network records.",
      "Fail a story with a reproduction recipe when any check fails.",
    ],
    defaultToolCategories: ["testing", "browser", "terminal"],
    defaultContextTokens: 4096,
  },
  {
    role: "reviewer",
    title: "Reviewer",
    responsibilities: [
      "Review diffs and outputs against the loaded guideline pack.",
      "Request changes with specific, actionable comments.",
      "Approve only when verification evidence is complete.",
    ],
    defaultToolCategories: ["knowledge", "browser", "document"],
    defaultContextTokens: 4096,
  },
  {
    role: "documenter",
    title: "Documenter",
    responsibilities: [
      "Write and update user-facing documentation for every change.",
      "Keep procedures in Microsoft Style: active voice, numbered steps.",
      "Regenerate affected manual chapters and site docs.",
    ],
    defaultToolCategories: ["document", "knowledge"],
    defaultContextTokens: 3072,
  },
  {
    role: "verifier",
    title: "Verifier",
    responsibilities: [
      "Own final acceptance: no story closes because an LLM said so.",
      "Cross-check the purpose and use cases, not just the tests.",
      "Attach the evidence pack to the ticket before closing.",
    ],
    defaultToolCategories: ["testing", "vision", "browser"],
    defaultContextTokens: 3072,
  },
  {
    role: "researcher",
    title: "Researcher",
    responsibilities: [
      "Gather external context within the agent's internet policy.",
      "Summarize sources with citations; never paste raw dumps.",
      "Flag confidence levels so downstream roles weight accordingly.",
    ],
    defaultToolCategories: ["knowledge", "browser"],
    defaultContextTokens: 3072,
  },
  {
    role: "coordinator",
    title: "Coordinator",
    responsibilities: [
      "Run the blackboard: dispatch, collect, and route results.",
      "Enforce budgets and escalation paths across the swarm.",
      "Escalate to humans when approvals or blocked states age out.",
    ],
    defaultToolCategories: ["scheduler", "knowledge", "terminal"],
    defaultContextTokens: 4096,
  },
];

// ─── Tool scope ────────────────────────────────────────────────────────────────

export interface ToolScopeEntry {
  toolId: string;
  enabled: boolean;
  /** The basic principle this agent follows when using the tool */
  principle: string;
}

// ─── Solution templates ────────────────────────────────────────────────────────

export interface SolutionTemplate {
  id: string;
  name: string;
  description: string;
  /** Ordered accomplishment → action steps */
  steps: Array<{ trigger: string; action: string; toolHint?: string }>;
  requiredToolCategories: string[];
  /** Where outputs land when the template completes */
  outputs: string[];
}

export const SOLUTION_TEMPLATES: SolutionTemplate[] = [
  {
    id: "capture-and-attach",
    name: "Capture & attach to ticket",
    description:
      "After each accomplishment, capture a screenshot of the result and attach it to the agent's assigned Jira ticket as evidence.",
    steps: [
      { trigger: "Story's acceptance criteria pass", action: "Capture the relevant screen region or full page", toolHint: "capture.region" },
      { trigger: "Capture succeeded", action: "Annotate with the story ID and check verdict", toolHint: "capture.annotate" },
      { trigger: "Annotation saved", action: "Attach the image to the assigned Jira ticket with a one-line summary", toolHint: "jira.comment" },
      { trigger: "All stories done", action: "Post the evidence pack and request verification", toolHint: "jira.transition" },
    ],
    requiredToolCategories: ["capture", "jira"],
    outputs: ["Annotated screenshots per milestone", "Jira ticket with evidence attachments", "Verification request"],
  },
  {
    id: "implement-verify-commit",
    name: "Implement → verify → commit",
    description: "The default coder loop: implement one story, run the checks, commit internally, move the ticket.",
    steps: [
      { trigger: "Story assigned", action: "Read acceptance criteria and relevant guideline-pack rules" },
      { trigger: "Implementation compiles", action: "Run the project's targeted tests" },
      { trigger: "Tests pass", action: "Commit to the INTERNAL git with a descriptive message" },
      { trigger: "Committed", action: "Move the kanban card to review; external sync only if enabled" },
    ],
    requiredToolCategories: ["terminal", "testing", "git"],
    outputs: ["Internal commit per story", "Kanban card in review", "Optional external push per preference"],
  },
  {
    id: "audit-and-report",
    name: "Audit & report",
    description: "Test a website flow end to end and produce the four-layer evidence pack for a verification gate.",
    steps: [
      { trigger: "Flow defined", action: "Interact-test each step; record verdicts and timings", toolHint: "test.interact" },
      { trigger: "Interaction pass done", action: "Capture the network record for every backend call", toolHint: "browser.network" },
      { trigger: "Network captured", action: "Extract application state to corroborate the UI verdict", toolHint: "browser.state" },
      { trigger: "Evidence complete", action: "Compile the report and attach it to the ticket" },
    ],
    requiredToolCategories: ["testing", "browser", "jira"],
    outputs: ["Interaction verdicts", "Network records", "State extracts", "Compiled evidence pack"],
  },
  {
    id: "docs-from-diff",
    name: "Docs from diff",
    description: "After merged work, update documentation and regenerate affected manual chapters.",
    steps: [
      { trigger: "Merge detected on internal git", action: "Diff against the last documented revision" },
      { trigger: "Diff analyzed", action: "Update the affected procedures in Microsoft Style" },
      { trigger: "Docs updated", action: "Regenerate the manual PDF and site docs pages" },
    ],
    requiredToolCategories: ["git", "document"],
    outputs: ["Updated docs pages", "Regenerated manual PDF"],
  },
];

// ─── Agent configuration ───────────────────────────────────────────────────────

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  /** Free-form scope statement appended to the system prompt */
  scope: string;
  knowledge: KnowledgeScope;
  tools: ToolScopeEntry[];
  templateId?: string;
  contextTokens: number;
  state: AgentState;
}

/** A confined agent must not carry enabled web sources — validation is strict. */
export function validateConfig(config: AgentConfig): string[] {
  const errors: string[] = [];
  if (!ROLE_CATALOG.some((r) => r.role === config.role)) {
    errors.push(`Unknown role "${config.role}".`);
  }
  if (config.knowledge.policy === "confined") {
    const webOn = config.knowledge.sources.filter((s) => s.kind === "web" && s.enabled);
    if (webOn.length > 0) {
      errors.push(
        `Policy is "confine to provided material" but ${webOn.length} web source(s) are enabled (${webOn.map((s) => s.ref).join(", ")}). Disable them or switch the policy.`,
      );
    }
  }
  if (config.tools.filter((t) => t.enabled).length === 0) {
    errors.push("At least one tool must be enabled, or the agent cannot act.");
  }
  if (config.contextTokens < 1024) {
    errors.push("Context budget below 1024 tokens cannot hold a system prompt.");
  }
  return errors;
}

/** Build the system-prompt fragment this configuration contributes. */
export function renderScopePrompt(config: AgentConfig): string[] {
  const role = ROLE_CATALOG.find((r) => r.role === config.role);
  const lines: string[] = [];
  lines.push(`Role: ${role?.title ?? config.role}.`);
  if (config.scope) lines.push(`Scope: ${config.scope}`);
  lines.push("Responsibilities:");
  for (const r of role?.responsibilities ?? []) lines.push(`- ${r}`);
  lines.push(
    config.knowledge.policy === "confined"
      ? "Knowledge policy: confine yourself to the provided material. Do not browse."
      : "Knowledge policy: you may browse the web when provided material is insufficient; cite sources.",
  );
  const docs = config.knowledge.sources.filter((s) => s.enabled);
  if (docs.length > 0) {
    lines.push(`Provided material (${docs.length}): ${docs.map((d) => d.ref).join("; ")}.`);
  }
  const tools = config.tools.filter((t) => t.enabled);
  lines.push(`Tools (${tools.length}): ${tools.map((t) => t.toolId).join(", ")}.`);
  for (const t of tools) {
    if (t.principle) lines.push(`- ${t.toolId}: ${t.principle}`);
  }
  return lines;
}

// ─── Team workspace: users, assignments, feedback ──────────────────────────────

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "lead" | "member" | "observer";
}

export interface WorkspaceTask {
  id: string;
  title: string;
  status: "todo" | "in-progress" | "review" | "done" | "blocked";
  assignedAgentId?: string;
  /** Jira-style ticket key when synced externally */
  ticketKey?: string;
  createdBy: string;
}

export interface FeedbackEntry {
  id: string;
  taskId: string;
  userId: string;
  at: number;
  comment: string;
  /** Structured verdict for the agent to act on */
  verdict: "approve" | "request-changes" | "comment";
}

export type ExternalGitPlatform = "none" | "github" | "gitlab";
export type TicketingPlatform = "none" | "jira" | "linear";

export interface SyncPreferences {
  /**
   * Checkins ALWAYS land on the internal git. External platforms receive
   * pushes only when enabled here — never as a side effect of an agent
   * checkin.
   */
  externalGit: ExternalGitPlatform;
  externalGitEnabled: boolean;
  ticketing: TicketingPlatform;
  /** Whether evidence attachments flow to tickets automatically */
  autoAttachEvidence: boolean;
  /** Push cadence for external sync when enabled */
  syncOn: "manual" | "milestone" | "daily";
}

export const DEFAULT_SYNC: SyncPreferences = {
  externalGit: "none",
  externalGitEnabled: false,
  ticketing: "none",
  autoAttachEvidence: false,
  syncOn: "milestone",
};

export interface TeamWorkspace {
  users: WorkspaceUser[];
  tasks: WorkspaceTask[];
  feedback: FeedbackEntry[];
  sync: SyncPreferences;
  agents: AgentConfig[];
}

export function createWorkspace(): TeamWorkspace {
  return {
    users: [
      { id: "u-owner", name: "Owner", email: "owner@local", role: "owner" },
    ],
    tasks: [],
    feedback: [],
    sync: { ...DEFAULT_SYNC },
    agents: [],
  };
}

/** Assign a defined agent to a task; the agent's state drives the board. */
export function assignAgent(ws: TeamWorkspace, taskId: string, agentId: string): TeamWorkspace {
  return {
    ...ws,
    tasks: ws.tasks.map((t) => (t.id === taskId ? { ...t, assignedAgentId: agentId, status: "in-progress" } : t)),
    agents: ws.agents.map((a) => (a.id === agentId ? { ...a, state: "working" } : a)),
  };
}

/** Record user feedback; request-changes sends the agent back to work. */
export function addFeedback(
  ws: TeamWorkspace,
  entry: Omit<FeedbackEntry, "id" | "at">,
): TeamWorkspace {
  const feedback = [...ws.feedback, { ...entry, id: `fb-${ws.feedback.length + 1}`, at: Date.now() }];
  let tasks = ws.tasks;
  let agents = ws.agents;
  if (entry.verdict === "approve") {
    tasks = ws.tasks.map((t) => (t.id === entry.taskId ? { ...t, status: "done" } : t));
    const task = ws.tasks.find((t) => t.id === entry.taskId);
    agents = ws.agents.map((a) => (a.id === task?.assignedAgentId ? { ...a, state: "done" } : a));
  } else if (entry.verdict === "request-changes") {
    const task = ws.tasks.find((t) => t.id === entry.taskId);
    tasks = ws.tasks.map((t) => (t.id === entry.taskId ? { ...t, status: "in-progress" } : t));
    agents = ws.agents.map((a) => (a.id === task?.assignedAgentId ? { ...a, state: "working" } : a));
  }
  return { ...ws, feedback, tasks, agents };
}

/**
 * Where does an agent checkin go? Always the internal git. External
 * destinations receive it ONLY when the user's preferences say so.
 */
export function checkinDestinations(sync: SyncPreferences): string[] {
  const dests = ["internal git (always)"];
  if (sync.externalGitEnabled && sync.externalGit !== "none") {
    dests.push(`${sync.externalGit} (on ${sync.syncOn})`);
  }
  if (sync.ticketing !== "none" && sync.autoAttachEvidence) {
    dests.push(`${sync.ticketing} evidence attachments`);
  }
  return dests;
}

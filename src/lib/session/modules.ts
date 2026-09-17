/**
 * stitaP Session Module System
 *
 * The notebook-style chat session is composed from a registry of modules.
 * Every module the harness ships can be checked on/off per session; enabled
 * modules contribute their tools, context overhead and token budget to the
 * running session. The computed budget feeds the inference router so token
 * generation throughput stays synchronized with what is actually loaded.
 *
 * Design rules:
 * - One module per purpose (no duplicate engines)
 * - Dependencies resolve automatically (enabling X enables what it needs)
 * - Disabling a module never breaks the session — tools just report
 *   "module disabled" and the planner routes around them
 * - Every module declares its context overhead so SLM sessions can stay tiny
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModuleCategory =
  | "capture"
  | "browser"
  | "testing"
  | "design"
  | "vision"
  | "video"
  | "audio"
  | "document"
  | "orchestration"
  | "agent"
  | "inference"
  | "sandbox"
  | "integrations"
  | "enterprise";

export interface SessionModule {
  id: string;
  name: string;
  description: string;
  category: ModuleCategory;
  /** Approximate context tokens injected into the system prompt when enabled */
  contextOverheadTokens: number;
  /** Tool ids contributed to the session */
  toolIds: string[];
  /** Modules that must also be enabled for this one to work */
  requires: string[];
  /** Safe default for a new session */
  defaultEnabled: boolean;
  /** Works fully offline (no API keys, no network) */
  offline: boolean;
}

export type SessionProfileId =
  | "slm-minimal"
  | "balanced"
  | "full-power"
  | "air-gapped";

export interface SessionModuleState {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  profile: SessionProfileId | "custom";
  enabled: Record<string, boolean>;
}

export interface SessionBudget {
  totalContextOverheadTokens: number;
  enabledCount: number;
  disabledCount: number;
  toolIds: string[];
  /** Recommended max context window for the chosen model given overheads */
  recommendedContextWindow: number;
  /** Workload hint for the inference router */
  workloadMode: "latency" | "throughput" | "balanced";
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const MODULE_REGISTRY: SessionModule[] = [
  // Capture & media
  { id: "capture.svg", name: "SVG Website Capture", description: "Portable-image / hybrid / native-vector capture engine with stitching", category: "capture", contextOverheadTokens: 250, toolIds: ["screen.capture"], requires: [], defaultEnabled: true, offline: true },
  { id: "video.editor", name: "Video Editor", description: "Timeline editing, overlays, captions, templates/stickers, export", category: "video", contextOverheadTokens: 300, toolIds: ["video.timeline", "video.export"], requires: [], defaultEnabled: false, offline: true },
  { id: "audio.speech", name: "Audio & Speech", description: "Speech synthesis, audio mixing, waveform visualization", category: "audio", contextOverheadTokens: 150, toolIds: ["audio.synth"], requires: [], defaultEnabled: false, offline: true },
  { id: "document.parse", name: "Document Parsing", description: "Step extraction, tutorial detection, FAQ parsing, script generation", category: "document", contextOverheadTokens: 200, toolIds: ["doc.parseSteps"], requires: [], defaultEnabled: true, offline: true },

  // Browser
  { id: "browser.core", name: "Browser Automation Core", description: "Navigate, click, type, scroll, drag, hover, wait, extract", category: "browser", contextOverheadTokens: 400, toolIds: ["browser.navigate", "browser.click", "browser.type", "browser.scroll", "browser.extract"], requires: [], defaultEnabled: true, offline: false },
  { id: "browser.inspect", name: "Deep Inspection", description: "DOM tree, network traffic, storage, framework state, websockets, extensions", category: "browser", contextOverheadTokens: 350, toolIds: ["browser.inspect", "browser.network", "browser.storage", "browser.state", "browser.websocket"], requires: ["browser.core"], defaultEnabled: false, offline: false },

  // Testing & design
  { id: "testing.suite", name: "Website Testing Suite", description: "Performance metrics, interaction timing, a11y, responsive, SEO, security headers, visual regression", category: "testing", contextOverheadTokens: 350, toolIds: ["browser.performance", "browser.interact-test", "browser.a11y-audit", "browser.responsive-test", "browser.seo-audit", "browser.visual-regression"], requires: ["browser.core"], defaultEnabled: true, offline: false },
  { id: "design.qa", name: "Design QA", description: "Audits against Vercel/Fluent/TasteSkill guidelines; palettes, typography, spacing, component QA", category: "design", contextOverheadTokens: 300, toolIds: ["browser.design-audit", "browser.component-qa", "browser.typography-check", "browser.spacing-check"], requires: ["browser.core"], defaultEnabled: false, offline: true },

  // Vision
  { id: "vision.vit", name: "On-device Vision (ViT)", description: "Screenshot/icon/layout understanding without external vision APIs", category: "vision", contextOverheadTokens: 250, toolIds: ["vision.analyze"], requires: [], defaultEnabled: true, offline: true },

  // Orchestration
  { id: "chains.core", name: "stitaP Chains", description: "Composable runnables, prompt templates, output parsers, ReAct agent executor", category: "orchestration", contextOverheadTokens: 200, toolIds: ["chains.run", "chains.agent"], requires: [], defaultEnabled: true, offline: true },
  { id: "graph.engine", name: "stitaP Graph", description: "StateGraph workflows: reducers, conditional routing, checkpoints, interrupts", category: "orchestration", contextOverheadTokens: 200, toolIds: ["graph.run"], requires: [], defaultEnabled: true, offline: true },

  // Agent systems
  { id: "agent.memory", name: "Agent Memory", description: "Persistent cross-session memory with importance scoring and decay", category: "agent", contextOverheadTokens: 100, toolIds: ["agent.memory"], requires: [], defaultEnabled: true, offline: true },
  { id: "agent.skills", name: "Skills & Self-Improvement", description: "Skill extraction from tasks, versioned registry, performance pattern detection", category: "agent", contextOverheadTokens: 120, toolIds: ["agent.skills", "agent.self-improve"], requires: ["agent.memory"], defaultEnabled: true, offline: true },
  { id: "agent.terminal", name: "Real Terminal", description: "Shell execution, built-in commands, background process management", category: "agent", contextOverheadTokens: 150, toolIds: ["agent.terminal"], requires: [], defaultEnabled: false, offline: true },
  { id: "agent.kanban", name: "Kanban Orchestrator", description: "Multi-agent task boards: dependencies, fan-out, heartbeats, workers", category: "agent", contextOverheadTokens: 180, toolIds: ["agent.kanban"], requires: [], defaultEnabled: true, offline: true },
  { id: "swarm.engine", name: "Swarm Engine", description: "Topology-based multi-agent swarms sized to your hardware", category: "agent", contextOverheadTokens: 220, toolIds: ["swarm.configure"], requires: ["agent.kanban", "inference.router"], defaultEnabled: false, offline: true },
  { id: "agent.scheduler", name: "Task Scheduler", description: "Interval + cron-lite scheduled automations with failure budgets", category: "agent", contextOverheadTokens: 90, toolIds: ["scheduler.jobs"], requires: [], defaultEnabled: false, offline: true },
  { id: "agent.knowledge", name: "Knowledge Base (RAG)", description: "Local vector store: hashed embeddings, chunked docs, budgeted context injection", category: "agent", contextOverheadTokens: 110, toolIds: ["knowledge.search"], requires: [], defaultEnabled: false, offline: true },
  { id: "agent.notifications", name: "Notifications", description: "Channel dispatcher with severity rules, quiet hours, dedupe, retries", category: "agent", contextOverheadTokens: 80, toolIds: ["notify.send"], requires: [], defaultEnabled: false, offline: true },
  { id: "agent.tracing", name: "Run Tracing", description: "Per-run span trees, token accounting, waterfall postmortems", category: "agent", contextOverheadTokens: 70, toolIds: ["trace.runs"], requires: [], defaultEnabled: true, offline: true },
  { id: "agent.approvals", name: "Approval Gate", description: "Human-in-the-loop risk policies: auto-approve / require-human / block", category: "agent", contextOverheadTokens: 90, toolIds: ["approvals.gate"], requires: [], defaultEnabled: false, offline: true },

  // Inference
  { id: "inference.router", name: "Inference Router", description: "Hardware-aware backend selection (OpenVINO/llama.cpp/NPU) with benchmarking", category: "inference", contextOverheadTokens: 80, toolIds: ["inference.router", "inference.probe"], requires: [], defaultEnabled: true, offline: true },
  { id: "inference.models", name: "Model Management", description: "Resumable GGUF downloads, quantization menu, legacy-server guidance", category: "inference", contextOverheadTokens: 100, toolIds: ["inference.download", "inference.quant", "inference.legacy"], requires: ["inference.router"], defaultEnabled: false, offline: false },

  // Sandbox
  { id: "sandbox.env", name: "Sandbox Environments", description: "Scenario isolation: worker execution, network policy, virtual FS, limits", category: "sandbox", contextOverheadTokens: 150, toolIds: ["sandbox.create", "sandbox.exec"], requires: [], defaultEnabled: false, offline: true },

  // Integrations
  { id: "int.git", name: "Git Providers", description: "GitHub/GitLab/Bitbucket/local/SVN via self-contained REST clients", category: "integrations", contextOverheadTokens: 120, toolIds: ["git.status"], requires: [], defaultEnabled: false, offline: false },
  { id: "int.jira", name: "Jira Client", description: "Issues, sprints, comments, transitions for ticket-driven work", category: "integrations", contextOverheadTokens: 100, toolIds: ["jira.search"], requires: [], defaultEnabled: false, offline: false },
  { id: "int.wiki", name: "Wiki Generator", description: "Auto-generated README/architecture/API/changelog documentation", category: "integrations", contextOverheadTokens: 100, toolIds: ["wiki.generate"], requires: [], defaultEnabled: false, offline: true },
  { id: "int.prompts", name: "Prompt Library", description: "Reusable prompt templates and slash commands", category: "integrations", contextOverheadTokens: 60, toolIds: ["prompts.list"], requires: [], defaultEnabled: true, offline: true },

  // Enterprise
  { id: "ent.guidelines", name: "Company Guidelines", description: "Load org coding/testing/review rules that every agent must follow", category: "enterprise", contextOverheadTokens: 0, toolIds: ["enterprise.guidelines"], requires: [], defaultEnabled: false, offline: true },
  { id: "ent.migration", name: "Migration Projects", description: "Language-to-language and version-upgrade pipelines with long-running kanban execution", category: "enterprise", contextOverheadTokens: 0, toolIds: ["enterprise.project"], requires: ["ent.guidelines", "agent.kanban"], defaultEnabled: false, offline: true },
];

const REGISTRY_BY_ID = new Map(MODULE_REGISTRY.map((m) => [m.id, m]));

export function getModule(id: string): SessionModule | undefined {
  return REGISTRY_BY_ID.get(id);
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export const SESSION_PRESETS: Record<
  Exclude<SessionProfileId, never>,
  { label: string; description: string; modules: (id: string) => boolean }
> = {
  "slm-minimal": {
    label: "SLM Minimal",
    description: "Sub-1K system prompt. For ≤3B models on laptops: memory + chains + vision only.",
    modules: (id) =>
      ["chains.core", "agent.memory", "agent.skills", "vision.vit", "int.prompts"].includes(id),
  },
  balanced: {
    label: "Balanced",
    description: "Default working set: capture, browser core, testing, orchestration, kanban.",
    modules: (id) => getModule(id)?.defaultEnabled ?? false,
  },
  "full-power": {
    label: "Full Power",
    description: "Everything including swarm, sandboxes, integrations — needs ≥16GB RAM.",
    modules: () => true,
  },
  "air-gapped": {
    label: "Air-Gapped",
    description: "Offline-only modules. Nothing that ever touches the network.",
    modules: (id) => getModule(id)?.offline ?? false,
  },
};

// ─── Dependency Resolution ────────────────────────────────────────────────────

/** Enable a module plus everything it (transitively) requires. */
export function resolveEnable(state: Record<string, boolean>, id: string): Record<string, boolean> {
  const next = { ...state, [id]: true };
  const mod = REGISTRY_BY_ID.get(id);
  if (!mod) return next;
  for (const dep of mod.requires) {
    if (!next[dep]) Object.assign(next, resolveEnable(next, dep));
  }
  return next;
}

/** Disable a module plus anything that depends on it (transitively). */
export function resolveDisable(state: Record<string, boolean>, id: string): Record<string, boolean> {
  const next = { ...state, [id]: false };
  for (const mod of MODULE_REGISTRY) {
    if (mod.requires.includes(id) && next[mod.id]) {
      Object.assign(next, resolveDisable(next, mod.id));
    }
  }
  return next;
}

// ─── Session Lifecycle ────────────────────────────────────────────────────────

let _sessionCounter = 0;

export function createSessionState(
  profile: SessionProfileId = "balanced",
  sessionId?: string,
): SessionModuleState {
  const preset = SESSION_PRESETS[profile];
  const enabled: Record<string, boolean> = {};
  for (const mod of MODULE_REGISTRY) enabled[mod.id] = preset.modules(mod.id);
  return {
    sessionId: sessionId ?? `session-${Date.now().toString(36)}-${(_sessionCounter++).toString(36)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile,
    enabled,
  };
}

export function setModuleEnabled(
  state: SessionModuleState,
  id: string,
  on: boolean,
): SessionModuleState {
  let enabled = state.enabled;
  if (on) enabled = resolveEnable(enabled, id);
  else enabled = resolveDisable(enabled, id);
  return {
    ...state,
    enabled,
    profile: "custom",
    updatedAt: new Date().toISOString(),
  };
}

export function applyPreset(state: SessionModuleState, profile: SessionProfileId): SessionModuleState {
  const preset = SESSION_PRESETS[profile];
  const enabled: Record<string, boolean> = {};
  for (const mod of MODULE_REGISTRY) enabled[mod.id] = preset.modules(mod.id);
  return { ...state, enabled, profile, updatedAt: new Date().toISOString() };
}

// ─── Budget Computation (router sync) ────────────────────────────────────────

/**
 * Compute the effective session budget. The inference router consumes
 * `workloadMode` + `recommendedContextWindow` to pick backend settings
 * (batch size, KV-cache policy, perf mode) without any hardcoding.
 */
export function computeBudget(
  state: SessionModuleState,
  options: { modelContextWindow?: number; targetTps?: number } = {},
): SessionBudget {
  const toolIds: string[] = [];
  let totalContextOverheadTokens = 0;
  let enabledCount = 0;

  for (const mod of MODULE_REGISTRY) {
    if (!state.enabled[mod.id]) continue;
    enabledCount++;
    totalContextOverheadTokens += mod.contextOverheadTokens;
    for (const t of mod.toolIds) if (!toolIds.includes(t)) toolIds.push(t);
  }

  const modelWindow = options.modelContextWindow ?? 8192;
  const headroomRatio = enabledCount > 12 ? 0.5 : 0.65;
  const recommendedContextWindow = Math.max(
    2048,
    Math.floor((modelWindow - totalContextOverheadTokens) * headroomRatio),
  );

  // Latency mode for small sessions (interactive chat), throughput when many
  // modules/tools are active or an explicit high TPS target was requested.
  let workloadMode: SessionBudget["workloadMode"] = "balanced";
  if (enabledCount <= 5 && totalContextOverheadTokens < 1200) workloadMode = "latency";
  else if (enabledCount >= 10 || (options.targetTps ?? 0) >= 30) workloadMode = "throughput";

  return {
    totalContextOverheadTokens,
    enabledCount,
    disabledCount: MODULE_REGISTRY.length - enabledCount,
    toolIds,
    recommendedContextWindow,
    workloadMode,
  };
}

// ─── Persistence (localStorage, SSR-safe) ─────────────────────────────────────

const STORAGE_KEY = "stitap.session.modules.v1";

export function persistSessionState(state: SessionModuleState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode) — session stays in-memory */
  }
}

export function loadPersistedSessionState(): SessionModuleState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionModuleState;
    // Reconcile with current registry: new modules adopt their defaults.
    for (const mod of MODULE_REGISTRY) {
      if (!(mod.id in parsed.enabled)) parsed.enabled[mod.id] = mod.defaultEnabled;
    }
    for (const id of Object.keys(parsed.enabled)) {
      if (!REGISTRY_BY_ID.has(id)) delete parsed.enabled[id];
    }
    return parsed;
  } catch {
    return null;
  }
}

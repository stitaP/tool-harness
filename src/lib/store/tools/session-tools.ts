/**
 * stitaP Tool Store — Session, Swarm & Enterprise Tools
 *
 * - session.modules      — inspect/enable/disable modules + budget sync
 * - swarm.configure      — size & build swarms from system specs
 * - enterprise.project   — guideline packs, migration projects, long-running runs
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";
import {
  MODULE_REGISTRY,
  createSessionState,
  setModuleEnabled,
  applyPreset,
  computeBudget,
} from "../../session";
import { createSwarm, estimateModelMemoryBytes } from "../../agent/swarm";
import {
  createGuidelinePack,
  createMigrationProject,
  addStory,
  guidelinesForRole,
  LongRunningRunner,
} from "../../workflow/enterprise";

// ─── session.modules ──────────────────────────────────────────────────────────

export const SESSION_MODULES_MANIFEST: ToolManifest = {
  id: "session.modules",
  name: "Session Modules",
  description: "List, enable or disable harness modules for the current chat session and get the synchronized token budget",
  longDescription:
    "The notebook configuration surface. Every module (capture, browser, testing, orchestration, agents, inference, sandboxes, integrations, enterprise) can be checked on/off per session. Enabling resolves dependencies automatically; disabling cascades to dependents. Returns the effective context overhead and recommended window so the inference router stays in sync.",
  category: "llm",
  subcategory: "session",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["session", "modules", "configuration", "budget", "notebook"],
  icon: "ToggleLeft",
  color: "#6366f1",
  parameters: [
    { name: "action", type: "enum", description: "list | enable | disable | preset | budget", required: true, enum: ["list", "enable", "disable", "preset", "budget"] },
    { name: "moduleId", type: "string", description: "Module id for enable/disable", required: false },
    { name: "preset", type: "enum", description: "slm-minimal | balanced | full-power | air-gapped", required: false, enum: ["slm-minimal", "balanced", "full-power", "air-gapped"] },
    { name: "modelContextWindow", type: "number", description: "Context window of the loaded model (default 8192)", required: false },
  ],
  capabilities: [
    { name: "configure-session", description: "Per-session module composition", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

export async function sessionModules(input: ToolInput): Promise<ToolOutput> {
  const action = input.action as string;
  let state = createSessionState("balanced");

  switch (action) {
    case "list": {
      return {
        success: true,
        data: MODULE_REGISTRY.map((m) => ({
          id: m.id,
          name: m.name,
          category: m.category,
          on: state.enabled[m.id],
          offline: m.offline,
          overhead: m.contextOverheadTokens,
          requires: m.requires,
        })),
      };
    }
    case "enable": {
      if (!input.moduleId) return { success: false, error: 'Missing "moduleId"' };
      state = setModuleEnabled(state, input.moduleId as string, true);
      break;
    }
    case "disable": {
      if (!input.moduleId) return { success: false, error: 'Missing "moduleId"' };
      state = setModuleEnabled(state, input.moduleId as string, false);
      break;
    }
    case "preset": {
      if (!input.preset) return { success: false, error: 'Missing "preset"' };
      state = applyPreset(state, input.preset as "balanced");
      break;
    }
    case "budget":
      break;
    default:
      return { success: false, error: `Unknown action "${action}"` };
  }

  const budget = computeBudget(state, { modelContextWindow: input.modelContextWindow as number });
  return { success: true, data: { profile: state.profile, ...budget } };
}

// ─── swarm.configure ──────────────────────────────────────────────────────────

export const SWARM_CONFIGURE_MANIFEST: ToolManifest = {
  id: "swarm.configure",
  name: "Swarm Configure",
  description: "Size and build a multi-agent swarm for this machine: topology, roles, memory slots, router workload sync",
  longDescription:
    "Spec-based sizing: worker count derives from physical cores and usable RAM with per-model GGUF memory estimates. Prefers one shared batched model instance over duplicated processes. Builds the worker peer-graph for hierarchical/mesh/ring/star/pipeline topologies and hands the workload mode to the inference router.",
  category: "llm",
  subcategory: "swarm",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["swarm", "multi-agent", "topology", "sizing", "gguf"],
  icon: "Users",
  color: "#8b5cf6",
  parameters: [
    { name: "name", type: "string", description: "Swarm name", required: true },
    { name: "topology", type: "enum", description: "hierarchical | mesh | ring | star | pipeline", required: false, enum: ["hierarchical", "mesh", "ring", "star", "pipeline"] },
    { name: "count", type: "number", description: "Desired workers (clamped to hardware limits)", required: false },
    { name: "modelName", type: "string", description: "GGUF filename", required: false },
    { name: "paramBillions", type: "number", description: "Model parameter count in billions", required: true },
    { name: "bitsPerWeight", type: "number", description: "Quantization bits (e.g. 4 for Q4_K_M)", required: true },
    { name: "physicalCores", type: "number", description: "Physical CPU cores", required: true },
    { name: "usableRamBytes", type: "number", description: "Usable RAM after OS overhead", required: true },
  ],
  capabilities: [
    { name: "configure-swarm", description: "Hardware-sized multi-agent swarms", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

export async function swarmConfigure(input: ToolInput): Promise<ToolOutput> {
  const paramBillions = Number(input.paramBillions);
  const bits = Number(input.bitsPerWeight ?? 4);
  const cores = Number(input.physicalCores);
  const ram = Number(input.usableRamBytes);
  if (!paramBillions || !cores || !ram) {
    return { success: false, error: "paramBillions, physicalCores and usableRamBytes are required" };
  }

  const modelName = (input.modelName as string) ?? `model-${paramBillions}b-q${bits}.gguf`;
  const { config, sizing } = createSwarm({
    name: (input.name as string) ?? "swarm",
    topology: (input.topology as "star") ?? "hierarchical",
    count: input.count as number,
    model: {
      name: modelName,
      parameterBillions: paramBillions,
      bitsPerWeight: bits,
      contextWindow: 8192,
    },
    specs: { physicalCores: cores, usableRamBytes: ram, backend: "auto" },
  });

  return {
    success: true,
    data: {
      swarm: config,
      sizing: { ...sizing, estimatedMemoryBytes: estimateModelMemoryBytes({ name: modelName, parameterBillions: paramBillions, bitsPerWeight: bits, contextWindow: 8192 }) },
    },
  };
}

// ─── enterprise.project ───────────────────────────────────────────────────────

export const ENTERPRISE_PROJECT_MANIFEST: ToolManifest = {
  id: "enterprise.project",
  name: "Enterprise Project",
  description: "Company guideline packs + migration projects with long-running kanban execution (plan → commit → develop/test/document → verify)",
  longDescription:
    "Load company coding/testing/review rules once; every worker gets a token-budgeted subset by role. Plan language ports or version upgrades as dependency-ordered user stories, commit the plan to git, execute story-by-story on kanban with GitHub/Jira mirroring, and gate each module behind purpose/use-case verification before closing. Checkpointed for week-long runs.",
  category: "llm",
  subcategory: "enterprise",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["enterprise", "guidelines", "migration", "long-running", "kanban", "jira"],
  icon: "Building2",
  color: "#06b6d4",
  parameters: [
    { name: "action", type: "enum", description: "guidelines | role-prompt | plan | step", required: true, enum: ["guidelines", "role-prompt", "plan", "step"] },
    { name: "orgName", type: "string", description: "Organization name for the guideline pack", required: false },
    { name: "role", type: "string", description: "Worker role for role-prompt action", required: false },
    { name: "sections", type: "object", description: "{coding,testing,review,docs,security,delivery} rule texts", required: false },
    { name: "stories", type: "array", description: "[{title,description,acceptanceCriteria,priority,dependsOn}]", required: false },
    { name: "fromStack", type: "string", description: "Source stack (e.g. python3.9-django)", required: false },
    { name: "toStack", type: "string", description: "Target stack (e.g. go1.22-chi)", required: false },
  ],
  capabilities: [
    { name: "enterprise-run", description: "Long-running governed agent projects", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

export async function enterpriseProject(input: ToolInput): Promise<ToolOutput> {
  const action = input.action as string;
  const org = (input.orgName as string) ?? "Acme";

  if (action === "guidelines") {
    const pack = createGuidelinePack(org);
    const sections = (input.sections as Record<string, string>) ?? {};
    for (const key of Object.keys(pack.sections) as Array<keyof typeof pack.sections>) {
      pack.sections[key] = sections[key] ?? "";
    }
    return { success: true, data: { packId: pack.id, sectionsLoaded: Object.keys(sections).length } };
  }

  // Remaining actions need stories + stacks; build a throwaway demo project
  // when none supplied so the surface is always exercisable.
  const project = createMigrationProject({
    name: (input.name as string) ?? "migration",
    kind: (input.fromStack && input.toStack ? "language-port" : "version-upgrade") as "language-port",
    fromStack: (input.fromStack as string) ?? "v1",
    toStack: (input.toStack as string) ?? "v2",
  });

  const stories = (input.stories as Array<{
    title: string;
    description?: string;
    acceptanceCriteria?: string[];
    priority?: number;
    dependsOn?: string[];
  }>) ?? [];
  if (stories.length === 0 && action !== "role-prompt") {
    return { success: false, error: 'Provide "stories" or use action "role-prompt"' };
  }
  for (const s of stories)
    addStory(project, {
      title: s.title,
      description: s.description ?? s.title,
      acceptanceCriteria: s.acceptanceCriteria,
      priority: s.priority,
      dependsOn: s.dependsOn,
    });

  if (action === "role-prompt") {
    const pack = createGuidelinePack(org, 600);
    return {
      success: true,
      data: { prompt: guidelinesForRole(pack, (input.role as "coder") ?? "coder") },
    };
  }

  const runner = new LongRunningRunner(project, createGuidelinePack(org));
  if (action === "plan") {
    return {
      success: true,
      data: {
        order: storyExecutionOrderSafe(runner),
        phase: runner.phase,
        note: "Plan is dependency-ordered; call step repeatedly for incremental execution.",
      },
    };
  }
  if (action === "step") {
    return { success: true, data: { checkpoint: runner.checkpoint() } };
  }
  return { success: false, error: `Unknown action "${action}"` };

  function storyExecutionOrderSafe(r: LongRunningRunner): unknown {
    return r.project.stories.map((s) => ({ id: s.id, title: s.title, priority: s.priority }));
  }
}

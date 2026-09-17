/**
 * stitaP Swarm Orchestrator
 *
 * Topology-based multi-agent execution sized to the host machine.
 *
 * Sizing rules (spec-based, never hardcoded):
 * - Worker count derives from physical CPU cores and available RAM
 * - Each GGUF worker reserves an estimated memory slot (params × bits/8 × 1.2)
 * - One shared model instance is preferred over per-worker copies when the
 *   model fits once in RAM (batched serving beats duplicated processes)
 * - The router workload mode is derived from the swarm profile so token
 *   generation stays synchronized across every member
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SwarmTopology = "hierarchical" | "mesh" | "ring" | "star" | "pipeline";

export type WorkerRole =
  | "planner"
  | "coder"
  | "tester"
  | "reviewer"
  | "documenter"
  | "verifier"
  | "researcher"
  | "coordinator";

export interface SystemSpecs {
  /** Physical (not logical) CPU cores */
  physicalCores: number;
  /** Usable RAM in bytes after OS overhead estimate */
  usableRamBytes: number;
  /** Optional discrete/integrated GPU VRAM in bytes */
  vramBytes?: number;
  /** Backend currently serving inference (from the router) */
  backend: string;
}

export interface ModelSlot {
  /** e.g. "qwen2.5-3b-instruct-q4_k_m.gguf" */
  name: string;
  parameterBillions: number;
  bitsPerWeight: number;
  contextWindow: number;
}

export interface SwarmWorker {
  id: string;
  role: WorkerRole;
  model: string;
  /** Estimated RAM this worker reserves (bytes) */
  memoryBytes: number;
  /** Roles this worker reports to / receives from per topology */
  peers: string[];
  /** Context budget assigned to this worker (tokens) */
  contextBudgetTokens: number;
}

export interface SwarmConfig {
  id: string;
  name: string;
  topology: SwarmTopology;
  workers: SwarmWorker[];
  /** Shared blackboard topic keys workers read/write */
  blackboardTopics: string[];
  maxConcurrentTasks: number;
  /** Router workload mode synchronized to all members */
  workloadMode: "latency" | "throughput" | "balanced";
  createdAt: string;
}

export interface BlackboardEntry {
  id: string;
  topic: string;
  author: string;
  content: string;
  timestamp: number;
}

export interface SwarmSizing {
  recommendedWorkers: number;
  maxWorkersByRam: number;
  maxWorkersByCores: number;
  sharedModelPreferred: boolean;
  estimatedMemoryPerWorkerBytes: number;
  rationale: string[];
}

const ROLE_DEFAULT_CONTEXT: Record<WorkerRole, number> = {
  planner: 4096,
  coordinator: 4096,
  coder: 6144,
  tester: 4096,
  reviewer: 4096,
  documenter: 3072,
  verifier: 3072,
  researcher: 3072,
};

/** Topology edge rules — who talks to whom. */
function buildPeers(topology: SwarmTopology, ids: string[]): Record<string, string[]> {
  const peers: Record<string, string[]> = {};
  const n = ids.length;
  switch (topology) {
    case "hierarchical": {
      // Worker 0 is the coordinator; everyone else reports to it.
      for (let i = 0; i < n; i++) peers[ids[i]] = i === 0 ? ids.slice(1) : [ids[0]];
      break;
    }
    case "mesh":
      for (let i = 0; i < n; i++) peers[ids[i]] = ids.filter((_, j) => j !== i);
      break;
    case "ring":
      for (let i = 0; i < n; i++) peers[ids[i]] = [ids[(i + 1) % n]];
      break;
    case "star": {
      // Hub-and-spoke with a dedicated middle node when possible.
      const hub = ids[Math.floor(n / 2)];
      for (const id of ids) peers[id] = id === hub ? ids.filter((x) => x !== hub) : [hub];
      break;
    }
    case "pipeline":
      for (let i = 0; i < n; i++) peers[ids[i]] = i + 1 < n ? [ids[i + 1]] : [];
      break;
  }
  return peers;
}

// ─── Sizing ───────────────────────────────────────────────────────────────────

export function estimateModelMemoryBytes(model: ModelSlot): number {
  // params × bits/8 × 1.2 overhead (KV cache + runtime), per spec §3.4 rule of thumb
  return Math.floor(model.parameterBillions * 1e9 * (model.bitsPerWeight / 8) * 1.2);
}

/**
 * Spec-based swarm sizing. Ignores nothing: if the machine cannot host a
 * second model instance, we say so and recommend a shared batched instance.
 */
export function sizeSwarm(
  specs: SystemSpecs,
  model: ModelSlot,
  desiredWorkers?: number,
): SwarmSizing {
  const perWorker = estimateModelMemoryBytes(model);
  // Reserve ~25% of usable RAM as OS/runtime headroom beyond one instance.
  const spareBytes = specs.usableRamBytes - perWorker - Math.floor(specs.usableRamBytes * 0.25);
  const maxWorkersByRam = spareBytes > 0 ? 1 + Math.floor(spareBytes / perWorker) : 1;
  // Inference is CPU-bound: never more workers than physical cores minus one
  // for the serving process itself.
  const maxWorkersByCores = Math.max(1, specs.physicalCores - 1);
  const hardMax = Math.min(maxWorkersByRam, maxWorkersByCores);
  const sharedModelPreferred = specs.usableRamBytes >= perWorker * 2;

  let recommended = Math.max(1, Math.min(desiredWorkers ?? hardMax, hardMax));
  if (!desiredWorkers) recommended = Math.max(1, Math.min(hardMax, 4));
  // A shared instance serves any number of logical workers, but concurrency
  // is still bounded by cores.
  if (sharedModelPreferred && !desiredWorkers) {
    recommended = Math.max(1, Math.min(recommended, maxWorkersByCores, 8));
  }

  const rationale: string[] = [
    `${specs.physicalCores} physical cores → max ${maxWorkersByCores} compute-bound workers`,
    `${formatBytes(specs.usableRamBytes)} usable RAM, ${formatBytes(perWorker)} per ${model.name} slot → max ${maxWorkersByRam} by memory`,
    sharedModelPreferred
      ? "Model fits twice+ → prefer ONE shared batched instance over duplicated processes"
      : "Model fits once → all logical workers must share a single instance",
    `Backend "${specs.backend}" receives workload mode from the chosen swarm profile`,
  ];

  return {
    recommendedWorkers: recommended,
    maxWorkersByRam,
    maxWorkersByCores,
    sharedModelPreferred,
    estimatedMemoryPerWorkerBytes: perWorker,
    rationale,
  };
}

// ─── Builder ──────────────────────────────────────────────────────────────────

const ROLE_LADDER: WorkerRole[] = [
  "planner",
  "coder",
  "tester",
  "reviewer",
  "documenter",
  "verifier",
];

export function createSwarm(config: {
  name: string;
  topology: SwarmTopology;
  roles?: WorkerRole[];
  count?: number;
  model: ModelSlot;
  specs: SystemSpecs;
}): { config: SwarmConfig; sizing: SwarmSizing } {
  const sizing = sizeSwarm(config.specs, config.model, config.count);

  const roles: WorkerRole[] =
    config.roles ?? ROLE_LADDER.slice(0, sizing.recommendedWorkers);
  while (roles.length < sizing.recommendedWorkers) {
    roles.push(roles.length % 2 === 0 ? "coder" : "tester");
  }
  const trimmed = roles.slice(0, sizing.recommendedWorkers);

  const now = new Date().toISOString();
  const workers: SwarmWorker[] = trimmed.map((role, i) => ({
    id: `${config.name}-w${i}-${role}`,
    role,
    model: config.model.name,
    memoryBytes:
      sizing.sharedModelPreferred && i > 0 ? 0 : sizing.estimatedMemoryPerWorkerBytes,
    peers: [],
    contextBudgetTokens: ROLE_DEFAULT_CONTEXT[role],
  }));

  const ids = workers.map((w) => w.id);
  const peerMap = buildPeers(config.topology, ids);
  for (const w of workers) w.peers = peerMap[w.id] ?? [];

  return {
    config: {
      id: `swarm-${Date.now().toString(36)}`,
      name: config.name,
      topology: config.topology,
      workers,
      blackboardTopics: ["plan", "tasks", "results", "issues", "decisions"],
      maxConcurrentTasks: sizing.recommendedWorkers,
      workloadMode:
        sizing.recommendedWorkers <= 2 ? "latency" : sizing.recommendedWorkers >= 5 ? "throughput" : "balanced",
      createdAt: now,
    },
    sizing,
  };
}

// ─── Shared Blackboard ────────────────────────────────────────────────────────

export class SwarmBlackboard {
  private entries: BlackboardEntry[] = [];
  private listeners = new Set<(e: BlackboardEntry) => void>();

  write(topic: string, author: string, content: string): BlackboardEntry {
    // Strictly increasing timestamps so since-filters never miss same-ms writes.
    const lastTs = this.entries.length ? this.entries[this.entries.length - 1].timestamp : 0;
    const entry: BlackboardEntry = {
      id: `bb-${Date.now().toString(36)}-${this.entries.length.toString(36)}`,
      topic,
      author,
      content,
      timestamp: Math.max(Date.now(), lastTs + 1),
    };
    this.entries.push(entry);
    for (const fn of this.listeners) fn(entry);
    return entry;
  }

  read(topic: string, sinceTs = 0): BlackboardEntry[] {
    return this.entries.filter((e) => e.topic === topic && e.timestamp > sinceTs);
  }

  subscribe(fn: (e: BlackboardEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Token-efficient digest for SLM workers: last N entries per topic. */
  digest(perTopicLimit = 3): string {
    const topics = new Set(this.entries.map((e) => e.topic));
    const lines: string[] = [];
    for (const topic of topics) {
      const recent = this.read(topic).slice(-perTopicLimit);
      lines.push(`${topic}: ${recent.map((e) => `[${e.author}] ${e.content}`).join(" | ")}`);
    }
    return lines.join("\n") || "(empty)";
  }

  size(): number {
    return this.entries.length;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + "GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(0) + "MB";
  return bytes + "B";
}

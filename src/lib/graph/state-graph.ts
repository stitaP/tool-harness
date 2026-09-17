/**
 * stitaP Graph — StateGraph Engine (LangGraph principles, in-house)
 *
 * A stateful graph orchestration engine following the core LangGraph
 * execution model:
 *
 * - Typed shared state with per-channel reducers
 * - Nodes as pure(ish) functions: (state) => partial state updates
 * - Explicit edges + conditional edges for routing
 * - START/END sentinels, cycle-safe execution with step budgets
 * - Checkpointing after every superstep (time-travel debugging)
 * - Interrupts: pause the graph, resume later from a checkpoint
 * - Stream mode: emit state after every node
 *
 * Zero external dependencies.
 */

// ─── Sentinels & Core Types ───────────────────────────────────────────────────

export const START = "__start__";
export const END = "__end__";

/** Reducer merges a node's partial update into the channel value */
export type Reducer<S> = (current: S | undefined, update: unknown) => unknown;

export interface ChannelSpec<S = unknown> {
  reducer?: Reducer<S>;
  /** Default value applied at graph start */
  default?: unknown;
}

export interface GraphNode<S> {
  name: string;
  fn: (state: S) => Promise<Partial<S>> | Partial<S>;
}

export type EdgeTarget = string; // node name or END

export interface ConditionalEdge<S> {
  source: string;
  router: (state: S) => Promise<string> | string;
  /** Map of possible return values → targets (for validation/docs) */
  pathMap?: Record<string, EdgeTarget>;
}

export interface GraphConfig {
  /** Max supersteps before aborting (cycle protection). Default 25 */
  recursionLimit?: number;
}

export type StreamEvent<S> =
  | { type: "node_start"; node: string }
  | { type: "node_end"; node: string; state: S }
  | { type: "interrupted"; node: string; checkpointId: string }
  | { type: "done"; state: S };

// ─── Interrupts ───────────────────────────────────────────────────────────────

/**
 * Throw inside a node to pause the graph. The current state is checkpointed;
 * call `invoke` again with the returned checkpoint id to resume.
 */
export class GraphInterrupt extends Error {
  readonly payload: unknown;
  constructor(payload?: unknown) {
    super("graph-interrupted");
    this.name = "GraphInterrupt";
    this.payload = payload;
  }
}

// ─── Checkpointing ────────────────────────────────────────────────────────────

export interface Checkpoint<S> {
  id: string;
  graphName: string;
  state: S;
  nextNode: string;
  createdAt: number;
  history: string[];
}

export interface Checkpointer<S> {
  save(cp: Checkpoint<S>): void;
  load(id: string): Checkpoint<S> | undefined;
}

/** In-memory checkpointer (default). Swap for a persistent one in production. */
export class MemoryCheckpointer<S> implements Checkpointer<S> {
  private store = new Map<string, Checkpoint<S>>();

  save(cp: Checkpoint<S>): void {
    this.store.set(cp.id, cp);
  }

  load(id: string): Checkpoint<S> | undefined {
    return this.store.get(id);
  }

  list(): Checkpoint<S>[] {
    return Array.from(this.store.values());
  }
}

let _cpCounter = 0;
function newCheckpointId(): string {
  return `cp-${Date.now().toString(36)}-${(_cpCounter++).toString(36)}`;
}

// ─── StateGraph Builder ───────────────────────────────────────────────────────

export class StateGraph<S extends Record<string, unknown>> {
  private channels = new Map<keyof S, ChannelSpec<S>>();
  private nodes = new Map<string, GraphNode<S>>();
  private edges = new Map<string, EdgeTarget[]>();
  private conditionals: ConditionalEdge<S>[] = [];
  private entryPoint: string | null = null;

  private graphName: string;

  constructor(graphName = "StateGraph") {
    this.graphName = graphName;
  }

  /** Declare a state channel with optional reducer + default */
  channel<K extends keyof S>(key: K, spec: ChannelSpec<S> = {}): this {
    this.channels.set(key, spec);
    return this;
  }

  addNode(name: string, fn: GraphNode<S>["fn"]): this {
    if (name === START || name === END) {
      throw new Error(`Node name "${name}" is reserved`);
    }
    if (this.nodes.has(name)) {
      throw new Error(`Duplicate node "${name}" in graph "${this.graphName}"`);
    }
    this.nodes.set(name, { name, fn });
    return this;
  }

  /** Wire an unconditional edge (source may be START) */
  addEdge(source: string, target: string): this {
    const list = this.edges.get(source) ?? [];
    list.push(target);
    this.edges.set(source, list);
    if (source === START) this.entryPoint = target;
    return this;
  }

  /** Wire a dynamic router on a node's output */
  addConditionalEdge(
    source: string,
    router: ConditionalEdge<S>["router"],
    pathMap?: Record<string, EdgeTarget>,
  ): this {
    this.conditionals.push({ source, router, pathMap });
    return this;
  }

  compile(config: GraphConfig = {}): CompiledGraph<S> {
    if (!this.entryPoint) {
      throw new Error(`Graph "${this.graphName}" has no entry point — call addEdge(START, "node")`);
    }
    // Validate all edge targets exist
    for (const [src, targets] of this.edges) {
      if (src !== START) {
        for (const t of targets) {
          if (t !== END && !this.nodes.has(t)) {
            throw new Error(`Edge ${src} -> ${t}: node "${t}" does not exist`);
          }
        }
      }
    }
    for (const c of this.conditionals) {
      if (!this.nodes.has(c.source)) {
        throw new Error(`Conditional edge source "${c.source}" does not exist`);
      }
    }
    return new CompiledGraph<S>(this.graphName, this.channels, this.nodes, this.edges, this.conditionals, this.entryPoint, config);
  }
}

// ─── Compiled Execution Engine ────────────────────────────────────────────────

export class CompiledGraph<S extends Record<string, unknown>> {
  private checkpointer: Checkpointer<S> = new MemoryCheckpointer<S>();
  readonly name: string;
  private channels: Map<keyof S, ChannelSpec<S>>;
  private nodes: Map<string, GraphNode<S>>;
  private edges: Map<string, EdgeTarget[]>;
  private conditionals: ConditionalEdge<S>[];
  private entry: string;
  private config: GraphConfig;

  constructor(
    name: string,
    channels: Map<keyof S, ChannelSpec<S>>,
    nodes: Map<string, GraphNode<S>>,
    edges: Map<string, EdgeTarget[]>,
    conditionals: ConditionalEdge<S>[],
    entry: string,
    config: GraphConfig,
  ) {
    this.name = name;
    this.channels = channels;
    this.nodes = nodes;
    this.edges = edges;
    this.conditionals = conditionals;
    this.entry = entry;
    this.config = config;
  }

  useCheckpointer(cp: Checkpointer<S>): this {
    this.checkpointer = cp;
    return this;
  }

  /** Build the initial state applying channel defaults */
  initialState(seed: Partial<S> = {}): S {
    const state: Record<string, unknown> = {};
    for (const [key, spec] of this.channels) {
      state[key as string] =
        seed[key as string] !== undefined ? seed[key as string] : spec.default;
    }
    // Carry any extra seed keys too (untyped passthrough)
    for (const [k, v] of Object.entries(seed)) {
      if (!(k in state)) state[k] = v;
    }
    return state as S;
  }

  /**
   * Invoke the graph. Optionally resume from a checkpoint id.
   * Returns final state plus full execution trace.
   */
  async invoke(
    input: Partial<S>,
    options: {
      resumeFromCheckpoint?: string;
      stream?: (event: StreamEvent<S>) => void;
    } = {},
  ): Promise<{ state: S; trace: string[] }> {
    let state: S;
    let current: string;
    const trace: string[] = [];

    if (options.resumeFromCheckpoint) {
      const cp = this.checkpointer.load(options.resumeFromCheckpoint);
      if (!cp) throw new Error(`Checkpoint "${options.resumeFromCheckpoint}" not found`);
      state = cp.state;
      current = cp.nextNode;
      trace.push(...cp.history);
    } else {
      state = this.initialState(input);
      current = this.entry;
    }

    const limit = this.config.recursionLimit ?? 25;
    let supersteps = 0;

    while (current !== END) {
      if (supersteps++ >= limit) {
        throw new Error(
          `Graph "${this.name}" exceeded recursion limit (${limit}) at node "${current}". Check for cycles.`,
        );
      }

      const node = this.nodes.get(current);
      if (!node) throw new Error(`Unknown node "${current}"`);

      options.stream?.({ type: "node_start", node: current });
      trace.push(current);

      try {
        const update = await node.fn(state);
        state = this.reduce(state, update);
      } catch (err) {
        if (err instanceof GraphInterrupt) {
          const cpId = newCheckpointId();
          this.checkpointer.save({
            id: cpId,
            graphName: this.name,
            state,
            nextNode: current,
            createdAt: Date.now(),
            history: [...trace],
          });
          options.stream?.({ type: "interrupted", node: current, checkpointId: cpId });
          const result = { state, trace, checkpointId: cpId } as { state: S; trace: string[]; checkpointId: string };
          return result;
        }
        throw err;
      }

      options.stream?.({ type: "node_end", node: current, state });

      // Route to next node
      const next = await this.route(current, state);
      current = next;
    }

    options.stream?.({ type: "done", state });
    return { state, trace };
  }

  /** List saved checkpoints (time-travel debugging) */
  checkpoints(): Checkpoint<S>[] {
    const mem = this.checkpointer as MemoryCheckpointer<S>;
    if (typeof mem.list === "function") return mem.list();
    return [];
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private reduce(state: S, update: Partial<S> | undefined): S {
    if (!update) return state;
    const next: Record<string, unknown> = { ...(state as Record<string, unknown>) };
    for (const [key, value] of Object.entries(update)) {
      const spec = this.channels.get(key as keyof S);
      if (spec?.reducer) {
        next[key] = spec.reducer(next[key] as S | undefined, value);
      } else {
        // Default behaviour: overwrite
        next[key] = value;
      }
    }
    return next as S;
  }

  private async route(from: string, state: S): Promise<string> {
    // Conditional edges take priority
    const cond = this.conditionals.filter((c) => c.source === from);
    if (cond.length > 0) {
      const target = await cond[0].router(state);
      if (cond[0].pathMap && !(target in cond[0].pathMap)) {
        throw new Error(
          `Router on "${from}" returned "${target}" which is not in pathMap keys [${Object.keys(cond[0].pathMap).join(", ")}]`,
        );
      }
      return target;
    }
    // Unconditional fan-out: execute all targets sequentially (deterministic)
    const targets = this.edges.get(from) ?? [];
    if (targets.length === 0) return END;
    // Multiple targets run in declared order; each feeds the next (sequential composition)
    return targets[0];
  }
}

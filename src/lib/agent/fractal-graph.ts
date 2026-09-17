/**
 * stitaP Fractal Graph Engine
 *
 * A hierarchical fractal graph visualization system based on:
 * - Cantor set fractals for self-similar node clustering
 * - Hilbert curve space-filling for optimal 2D layout
 * - Force-directed placement with fractal attraction/repulsion
 * - L-system branching for tree-like agent hierarchies
 * - Fractal dimension analysis for noise detection (Hurst exponent)
 *
 * The engine renders agent interactions, tool chains, and project
 * structures as fractal graphs where:
 * - Self-similar clusters reveal repeating patterns
 * - Branch depth encodes hierarchy level
 * - Node size encodes importance/activity
 * - Edge thickness encodes communication frequency
 * - Fractal dimension anomalies flag noise/outliers
 *
 * Uses Canvas 2D for rendering — no WebGL dependency.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FractalNode {
  id: string;
  label: string;
  type: "agent" | "tool" | "data" | "event" | "cluster" | "root";
  /** Importance 0-1 (node radius scales with this) */
  importance: number;
  /** Activity level 0-1 (glow/animation intensity) */
  activity: number;
  /** Hierarchy depth (0 = root) */
  depth: number;
  /** Parent node ID */
  parentId?: string;
  /** Child node IDs */
  children: string[];
  /** Connected node IDs (edges) */
  connections: string[];
  /** Position (set by layout engine) */
  x: number;
  y: number;
  /** Target position for animation */
  targetX: number;
  targetY: number;
  /** Velocity for force simulation */
  vx: number;
  vy: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Visual state */
  highlighted: boolean;
  selected: boolean;
  /** Fractal branch angle (for L-system rendering) */
  branchAngle: number;
  /** Fractal iteration level */
  fractalLevel: number;
}

export interface FractalEdge {
  id: string;
  source: string;
  target: string;
  type: "communication" | "dependency" | "data-flow" | "hierarchy" | "tool-call";
  /** Weight 0-1 (edge thickness) */
  weight: number;
  /** Frequency of interaction */
  frequency: number;
  /** Direction: source → target */
  directed: boolean;
  /** Color */
  color: string;
  /** Animated pulse position (0-1) */
  pulsePos: number;
}

export interface FractalGraph {
  nodes: Map<string, FractalNode>;
  edges: Map<string, FractalEdge>;
  /** Root node (top of hierarchy) */
  rootId?: string;
  /** Bounding box */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Fractal dimension (Hausdorff) — higher = more complex, <1.5 = noise */
  fractalDimension: number;
  /** Noise nodes (detected by fractal anomaly) */
  noiseNodes: Set<string>;
}

export interface GraphLayoutOptions {
  /** Layout algorithm */
  algorithm: "fractal-tree" | "force-directed" | "hilbert" | "radial" | "cantor";
  /** Canvas dimensions */
  width: number;
  height: number;
  /** Padding */
  padding: number;
  /** Animation speed (0 = static) */
  animationSpeed: number;
  /** Show labels */
  showLabels: boolean;
  /** Show edge labels */
  showEdgeLabels: boolean;
  /** Highlight noise */
  highlightNoise: boolean;
  /** Fractal iteration depth (higher = more detail) */
  fractalDepth: number;
  /** Color scheme */
  colorScheme: "agent" | "data" | "status" | "depth";
  /** Minimum node radius */
  minRadius: number;
  /** Maximum node radius */
  maxRadius: number;
}

export interface NoiseAnalysisResult {
  /** Nodes flagged as noise */
  noiseNodes: string[];
  /** Fractal dimension of the graph */
  fractalDimension: number;
  /** Hurst exponent (<0.5 = anti-persistent/noisy, >0.5 = persistent/smooth) */
  hurstExponent: number;
  /** Cluster coherence scores */
  clusterScores: Map<string, number>;
  /** Anomaly descriptions */
  anomalies: string[];
}

// ─── Color Schemes ──────────────────────────────────────────────────────────

const COLOR_SCHEMES = {
  agent: {
    agent: "#8b5cf6",
    tool: "#06b6d4",
    data: "#10b981",
    event: "#f59e0b",
    cluster: "#6366f1",
    root: "#ec4899",
  },
  data: {
    agent: "#3b82f6",
    tool: "#14b8a6",
    data: "#22c55e",
    event: "#eab308",
    cluster: "#a855f7",
    root: "#f43f5e",
  },
  status: {
    active: "#10b981",
    idle: "#6b7280",
    error: "#ef4444",
    processing: "#f59e0b",
    offline: "#374151",
  },
  depth: [
    "#ec4899", "#8b5cf6", "#6366f1", "#3b82f6",
    "#06b6d4", "#14b8a6", "#10b981", "#84cc16",
  ],
};

// ─── Graph Builder ──────────────────────────────────────────────────────────

export function createFractalGraph(): FractalGraph {
  return {
    nodes: new Map(),
    edges: new Map(),
    bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
    fractalDimension: 1.5,
    noiseNodes: new Set(),
  };
}

export function addNode(
  graph: FractalGraph,
  node: Omit<FractalNode, "x" | "y" | "targetX" | "targetY" | "vx" | "vy" | "highlighted" | "selected" | "branchAngle" | "fractalLevel" | "connections"> & { connections?: string[] },
): FractalNode {
  const full: FractalNode = {
    ...node,
    connections: node.connections ?? [],
    x: 0, y: 0, targetX: 0, targetY: 0,
    vx: 0, vy: 0,
    highlighted: false, selected: false,
    branchAngle: 0, fractalLevel: 0,
  };
  graph.nodes.set(full.id, full);
  if (!graph.rootId || full.depth === 0) graph.rootId = full.id;
  return full;
}

export function addEdge(
  graph: FractalGraph,
  edge: Omit<FractalEdge, "pulsePos">,
): FractalEdge {
  const full: FractalEdge = { ...edge, pulsePos: 0 };
  graph.edges.set(full.id, full);
  // Update node connections
  const source = graph.nodes.get(edge.source);
  const target = graph.nodes.get(edge.target);
  if (source && !source.connections.includes(edge.target)) source.connections.push(edge.target);
  if (target && !target.connections.includes(edge.source)) target.connections.push(edge.source);
  return full;
}

// ─── Fractal Layout Engine ─────────────────────────────────────────────────

/**
 * L-system fractal tree layout.
 * Each agent becomes a branch; tools become leaves.
 * Branch angle and length encode hierarchy and activity.
 */
export function layoutFractalTree(
  graph: FractalGraph,
  options: GraphLayoutOptions,
): void {
  const { width, height, padding } = options;
  const root = graph.nodes.get(graph.rootId ?? "");
  if (!root) return;

  // Reset positions
  for (const node of graph.nodes.values()) {
    node.x = width / 2;
    node.y = height - padding;
    node.targetX = width / 2;
    node.targetY = height - padding;
  }

  // L-system parameters
  const axiom = "F";
  const rules: Record<string, string> = {
    F: "FF+[+F-F-F]-[-F+F+F]",
  };

  // Generate L-system string (limited iterations)
  let current = axiom;
  const iterations = Math.min(options.fractalDepth, 4);
  for (let i = 0; i < iterations; i++) {
    let next = "";
    for (const ch of current) {
      next += rules[ch] ?? ch;
    }
    current = next;
  }

  // Interpret L-system
  let x = width / 2;
  let y = height - padding;
  let angle = -Math.PI / 2; // pointing up
  const stack: Array<{ x: number; y: number; angle: number; depth: number }> = [];
  const stepLength = (height - 2 * padding) / Math.pow(2, iterations + 1);
  const branchAngle = Math.PI / 6 + (options.fractalDepth * 0.02);
  let nodeIndex = 0;
  const sortedNodes = [...graph.nodes.values()].sort((a, b) => a.depth - b.depth);

  for (const ch of current) {
    if (ch === "F") {
      const nx = x + Math.cos(angle) * stepLength;
      const ny = y + Math.sin(angle) * stepLength;

      if (nodeIndex < sortedNodes.length) {
        const node = sortedNodes[nodeIndex];
        node.targetX = nx;
        node.targetY = ny;
        node.branchAngle = angle;
        node.fractalLevel = Math.floor(nodeIndex / Math.max(1, sortedNodes.length / 8));
        nodeIndex++;
      }

      x = nx;
      y = ny;
    } else if (ch === "+") {
      angle += branchAngle;
    } else if (ch === "-") {
      angle -= branchAngle;
    } else if (ch === "[") {
      stack.push({ x, y, angle, depth: stack.length });
    } else if (ch === "]") {
      const state = stack.pop();
      if (state) {
        x = state.x;
        y = state.y;
        angle = state.angle;
      }
    }
  }

  // Assign remaining nodes in a spiral around their parent
  for (let i = nodeIndex; i < sortedNodes.length; i++) {
    const node = sortedNodes[i];
    const parent = node.parentId ? graph.nodes.get(node.parentId) : root;
    if (parent) {
      const angle = (i / sortedNodes.length) * Math.PI * 2;
      const radius = 30 + node.depth * 20;
      node.targetX = parent.targetX + Math.cos(angle) * radius;
      node.targetY = parent.targetY + Math.sin(angle) * radius;
    }
  }
}

/**
 * Force-directed layout with fractal attraction.
 * Nodes at the same hierarchy level attract each other;
 * nodes at different levels repel based on fractal distance.
 */
export function layoutForceDirected(
  graph: FractalGraph,
  options: GraphLayoutOptions,
  iterations = 100,
): void {
  const { width, height, padding } = options;
  const nodes = [...graph.nodes.values()];
  const edges = [...graph.edges.values()];

  // Initialize positions (spread across canvas)
  for (let i = 0; i < nodes.length; i++) {
    const angle = (i / nodes.length) * Math.PI * 2;
    const radius = Math.min(width, height) / 3;
    nodes[i].targetX = width / 2 + Math.cos(angle) * radius * (0.5 + Math.random() * 0.5);
    nodes[i].targetY = height / 2 + Math.sin(angle) * radius * (0.5 + Math.random() * 0.5);
  }

  // Force simulation
  const repulsionStrength = 500;
  const attractionStrength = 0.01;
  const centerGravity = 0.005;
  const fractalAttraction = 0.02; // Same-depth nodes attract
  const damping = 0.9;

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations; // Cooling

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].targetX - nodes[i].targetX;
        const dy = nodes[j].targetY - nodes[i].targetY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (repulsionStrength * temp) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].targetX -= fx;
        nodes[i].targetY -= fy;
        nodes[j].targetX += fx;
        nodes[j].targetY += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const source = graph.nodes.get(edge.source);
      const target = graph.nodes.get(edge.target);
      if (!source || !target) continue;
      const dx = target.targetX - source.targetX;
      const dy = target.targetY - source.targetY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = attractionStrength * dist * temp;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.targetX += fx;
      source.targetY += fy;
      target.targetX -= fx;
      target.targetY -= fy;
    }

    // Fractal attraction: same-depth nodes cluster
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].depth === nodes[j].depth) {
          const dx = nodes[j].targetX - nodes[i].targetX;
          const dy = nodes[j].targetY - nodes[i].targetY;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = fractalAttraction * temp;
          nodes[i].targetX += (dx / dist) * force;
          nodes[i].targetY += (dy / dist) * force;
          nodes[j].targetX -= (dx / dist) * force;
          nodes[j].targetY -= (dy / dist) * force;
        }
      }
    }

    // Center gravity
    for (const node of nodes) {
      node.targetX += (width / 2 - node.targetX) * centerGravity;
      node.targetY += (height / 2 - node.targetY) * centerGravity;
      // Bounds
      node.targetX = Math.max(padding, Math.min(width - padding, node.targetX));
      node.targetY = Math.max(padding, Math.min(height - padding, node.targetY));
    }
  }

  // Set final positions
  for (const node of nodes) {
    node.x = node.targetX;
    node.y = node.targetY;
  }
}

/**
 * Hilbert curve layout — maps 1D data to 2D with spatial locality.
 * Great for large datasets where proximity = similarity.
 */
export function layoutHilbert(
  graph: FractalGraph,
  options: GraphLayoutOptions,
): void {
  const { width, height, padding } = options;
  const nodes = [...graph.nodes.values()].sort((a, b) => b.importance - a.importance);
  const n = nodes.length;
  const order = Math.ceil(Math.log2(Math.sqrt(n)));
  const size = Math.pow(2, order);
  const cellW = (width - 2 * padding) / size;
  const cellH = (height - 2 * padding) / size;

  for (let i = 0; i < n; i++) {
    const [hx, hy] = hilbertIndexToCoords(i, size);
    nodes[i].targetX = padding + hx * cellW + cellW / 2;
    nodes[i].targetY = padding + hy * cellH + cellH / 2;
    nodes[i].x = nodes[i].targetX;
    nodes[i].y = nodes[i].targetY;
  }
}

function hilbertIndexToCoords(index: number, size: number): [number, number] {
  let x = 0, y = 0;
  let s = size / 2;
  while (s > 0) {
    const rx = (index & 2) > 0 ? 1 : 0;
    const ry = (index & 1) ^ rx;
    if (ry === 0) {
      if (rx === 1) {
        x = size - 1 - x;
        y = size - 1 - y;
      }
      [x, y] = [y, x];
    }
    x += rx * s;
    y += ry * s;
    index >>= 2;
    s /= 2;
  }
  return [x, y];
}

/**
 * Radial layout — root at center, children in concentric rings.
 */
export function layoutRadial(
  graph: FractalGraph,
  options: GraphLayoutOptions,
): void {
  const { width, height, padding } = options;
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) / 2 - padding;

  // Group by depth
  const byDepth = new Map<number, FractalNode[]>();
  for (const node of graph.nodes.values()) {
    const arr = byDepth.get(node.depth) ?? [];
    arr.push(node);
    byDepth.set(node.depth, arr);
  }

  for (const [depth, nodes] of byDepth) {
    const ring = maxRadius * (depth + 1) / (byDepth.size + 1);
    for (let i = 0; i < nodes.length; i++) {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      nodes[i].targetX = cx + Math.cos(angle) * ring;
      nodes[i].targetY = cy + Math.sin(angle) * ring;
      nodes[i].x = nodes[i].targetX;
      nodes[i].y = nodes[i].targetY;
    }
  }
}

// ─── Noise Detection ────────────────────────────────────────────────────────

/**
 * Detect noise in the graph using fractal dimension analysis.
 *
 * A healthy hierarchical graph has fractal dimension ~1.5-2.0.
 * Noise appears as:
 * - Nodes with very low connectivity (isolated leaves)
 * - Nodes that break self-similarity (unexpected depth jumps)
 * - Edges that cross many hierarchy levels (long-range connections)
 * - Clusters with low internal coherence
 */
export function detectNoise(graph: FractalGraph): NoiseAnalysisResult {
  const nodes = [...graph.nodes.values()];
  const edges = [...graph.edges.values()];
  const noiseNodes: string[] = [];
  const anomalies: string[] = [];
  const clusterScores = new Map<string, number>();

  // 1. Compute fractal dimension via box-counting
  const fd = computeFractalDimension(nodes);

  // 2. Compute Hurst exponent from node degree sequence
  const hurst = computeHurstExponent(nodes, edges);

  // 3. Find isolated nodes (degree 1 or 0)
  for (const node of nodes) {
    const degree = node.connections.length;
    if (degree <= 1 && node.depth > 0) {
      noiseNodes.push(node.id);
      anomalies.push(`Isolated node "${node.label}" (degree ${degree})`);
    }
  }

  // 4. Find nodes with unexpected depth jumps
  for (const node of nodes) {
    if (node.parentId) {
      const parent = graph.nodes.get(node.parentId);
      if (parent && Math.abs(node.depth - parent.depth) > 2) {
        if (!noiseNodes.includes(node.id)) noiseNodes.push(node.id);
        anomalies.push(`Depth jump: "${node.label}" at depth ${node.depth} but parent at depth ${parent.depth}`);
      }
    }
  }

  // 5. Find long-range edges (cross many hierarchy levels)
  for (const edge of edges) {
    const source = graph.nodes.get(edge.source);
    const target = graph.nodes.get(edge.target);
    if (source && target && Math.abs(source.depth - target.depth) > 3) {
      if (!noiseNodes.includes(target.id)) noiseNodes.push(target.id);
      anomalies.push(`Long-range edge: "${source.label}" → "${target.label}" (depth gap ${Math.abs(source.depth - target.depth)})`);
    }
  }

  // 6. Compute cluster coherence
  const depthGroups = new Map<number, string[]>();
  for (const node of nodes) {
    const arr = depthGroups.get(node.depth) ?? [];
    arr.push(node.id);
    depthGroups.set(node.depth, arr);
  }
  for (const [depth, group] of depthGroups) {
    const internalEdges = edges.filter(e => {
      const s = graph.nodes.get(e.source);
      const t = graph.nodes.get(e.target);
      return s && t && s.depth === depth && t.depth === depth;
    }).length;
    const maxEdges = (group.length * (group.length - 1)) / 2;
    const coherence = maxEdges > 0 ? internalEdges / maxEdges : 0;
    clusterScores.set(`depth-${depth}`, coherence);
    if (coherence < 0.1 && group.length > 3) {
      anomalies.push(`Sparse cluster at depth ${depth}: ${group.length} nodes, coherence ${(coherence * 100).toFixed(1)}%`);
    }
  }

  // Update graph
  graph.fractalDimension = fd;
  graph.noiseNodes = new Set(noiseNodes);

  return {
    noiseNodes,
    fractalDimension: fd,
    hurstExponent: hurst,
    clusterScores,
    anomalies,
  };
}

function computeFractalDimension(nodes: FractalNode[]): number {
  if (nodes.length < 2) return 1.0;

  // Box-counting method
  const minX = Math.min(...nodes.map(n => n.x));
  const maxX = Math.max(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxY = Math.max(...nodes.map(n => n.y));
  const size = Math.max(maxX - minX, maxY - minY) || 1;

  const counts: Array<[number, number]> = [];
  for (let boxSize = size / 2; boxSize >= 2; boxSize /= 2) {
    const boxes = new Set<string>();
    for (const node of nodes) {
      const bx = Math.floor((node.x - minX) / boxSize);
      const by = Math.floor((node.y - minY) / boxSize);
      boxes.add(`${bx},${by}`);
    }
    counts.push([1 / boxSize, boxes.size]);
  }

  if (counts.length < 2) return 1.5;

  // Linear regression on log-log
  let sumLogX = 0, sumLogY = 0, sumLogXY = 0, sumLogX2 = 0;
  const n = counts.length;
  for (const [x, y] of counts) {
    const logX = Math.log(x);
    const logY = Math.log(y);
    sumLogX += logX;
    sumLogY += logY;
    sumLogXY += logX * logY;
    sumLogX2 += logX * logX;
  }

  const slope = (n * sumLogXY - sumLogX * sumLogY) / (n * sumLogX2 - sumLogX * sumLogX);
  return Math.max(1.0, Math.min(2.0, slope)); // Clamp to [1, 2]
}

function computeHurstExponent(nodes: FractalNode[], edges: FractalEdge[]): number {
  // Compute degree sequence
  const degrees = nodes.map(n => n.connections.length);
  if (degrees.length < 4) return 0.5;

  // R/S analysis (rescaled range)
  const n = degrees.length;
  const mean = degrees.reduce((a, b) => a + b, 0) / n;
  const deviations = degrees.map(d => d - mean);

  let maxRange = 0;
  let stdDev = 0;

  for (let size = 4; size <= n; size++) {
    let cumulative = 0;
    let minCum = 0;
    let maxCum = 0;
    let sumSq = 0;

    for (let i = 0; i < size; i++) {
      cumulative += deviations[i % n];
      minCum = Math.min(minCum, cumulative);
      maxCum = Math.max(maxCum, cumulative);
      sumSq += deviations[i % n] * deviations[i % n];
    }

    const range = maxCum - minCum;
    const std = Math.sqrt(sumSq / size) || 1;
    const rs = range / std;
    maxRange = Math.max(maxRange, rs);
  }

  // Hurst exponent approximation
  return Math.min(1.0, Math.max(0.0, 0.5 + (maxRange - 2) / 10));
}

// ─── Canvas Renderer ────────────────────────────────────────────────────────

export class FractalGraphRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private graph: FractalGraph;
  private options: GraphLayoutOptions;
  private animationFrame: number | null = null;
  private hoveredNode: string | null = null;
  private selectedNode: string | null = null;
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private onNodeClick?: (node: FractalNode) => void;
  private onNodeHover?: (node: FractalNode | null) => void;

  constructor(
    canvas: HTMLCanvasElement,
    graph: FractalGraph,
    options: GraphLayoutOptions,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.graph = graph;
    this.options = options;
    this.setupInteractions();
  }

  setCallbacks(
    onNodeClick?: (node: FractalNode) => void,
    onNodeHover?: (node: FractalNode | null) => void,
  ) {
    this.onNodeClick = onNodeClick;
    this.onNodeHover = onNodeHover;
  }

  private setupInteractions() {
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - this.panX) / this.zoom;
      const my = (e.clientY - rect.top - this.panY) / this.zoom;

      if (this.isDragging) {
        this.panX = e.clientX - rect.left - this.dragStart.x;
        this.panY = e.clientY - rect.top - this.dragStart.y;
        return;
      }

      // Find hovered node
      let found: string | null = null;
      for (const node of this.graph.nodes.values()) {
        const dx = mx - node.x;
        const dy = my - node.y;
        const r = this.getNodeRadius(node);
        if (dx * dx + dy * dy < r * r) {
          found = node.id;
          break;
        }
      }

      if (found !== this.hoveredNode) {
        this.hoveredNode = found;
        for (const node of this.graph.nodes.values()) {
          node.highlighted = node.id === found;
        }
        this.onNodeHover?.(found ? this.graph.nodes.get(found) ?? null : null);
      }
    });

    this.canvas.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.dragStart = { x: e.clientX - this.canvas.getBoundingClientRect().left - this.panX, y: e.clientY - this.canvas.getBoundingClientRect().top - this.panY };
    });

    this.canvas.addEventListener("mouseup", () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener("click", (e) => {
      if (this.hoveredNode) {
        const node = this.graph.nodes.get(this.hoveredNode);
        if (node) {
          this.selectedNode = this.selectedNode === node.id ? null : node.id;
          for (const n of this.graph.nodes.values()) {
            n.selected = n.id === this.selectedNode;
          }
          this.onNodeClick?.(node);
        }
      }
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.1, Math.min(5, this.zoom * delta));
    });
  }

  private getNodeRadius(node: FractalNode): number {
    const base = this.options.minRadius + node.importance * (this.options.maxRadius - this.options.minRadius);
    return base * (1 + node.depth * 0.1);
  }

  private getNodeColor(node: FractalNode): string {
    if (this.options.colorScheme === "agent" || this.options.colorScheme === "data") {
      return COLOR_SCHEMES[this.options.colorScheme][node.type] ?? "#6b7280";
    }
    if (this.options.colorScheme === "depth") {
      return COLOR_SCHEMES.depth[node.depth % COLOR_SCHEMES.depth.length];
    }
    // status
    if (node.activity > 0.7) return COLOR_SCHEMES.status.active;
    if (node.activity > 0.3) return COLOR_SCHEMES.status.processing;
    return COLOR_SCHEMES.status.idle;
  }

  render() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    // Background
    this.ctx.fillStyle = "#0a0e1a";
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);

    // Draw fractal grid lines (faint)
    this.drawFractalGrid();

    // Draw edges
    for (const edge of this.graph.edges.values()) {
      this.drawEdge(edge);
    }

    // Draw nodes
    for (const node of this.graph.nodes.values()) {
      this.drawNode(node);
    }

    // Draw noise indicators
    if (this.options.highlightNoise) {
      for (const noiseId of this.graph.noiseNodes) {
        const node = this.graph.nodes.get(noiseId);
        if (node) this.drawNoiseIndicator(node);
      }
    }

    this.ctx.restore();
  }

  private drawFractalGrid() {
    const { width, height } = this.canvas;
    this.ctx.strokeStyle = "rgba(100, 100, 255, 0.03)";
    this.ctx.lineWidth = 0.5;

    // Cantor set horizontal lines
    for (let y = 0; y < height; y += 60) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }

    // Cantor set vertical lines
    for (let x = 0; x < width; x += 60) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }
  }

  private drawEdge(edge: FractalEdge) {
    const source = this.graph.nodes.get(edge.source);
    const target = this.graph.nodes.get(edge.target);
    if (!source || !target) return;

    const isHighlighted = source.highlighted || target.highlighted || source.selected || target.selected;

    // Edge line
    this.ctx.beginPath();
    this.ctx.moveTo(source.x, source.y);
    this.ctx.lineTo(target.x, target.y);
    this.ctx.strokeStyle = isHighlighted
      ? edge.color + "cc"
      : edge.color + "30";
    this.ctx.lineWidth = isHighlighted ? edge.weight * 4 : edge.weight * 2;
    this.ctx.stroke();

    // Pulse animation
    if (isHighlighted && edge.frequency > 0) {
      const px = source.x + (target.x - source.x) * edge.pulsePos;
      const py = source.y + (target.y - source.y) * edge.pulsePos;
      this.ctx.beginPath();
      this.ctx.arc(px, py, 3, 0, Math.PI * 2);
      this.ctx.fillStyle = edge.color;
      this.ctx.fill();
    }

    // Directional arrow
    if (edge.directed) {
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const arrowSize = 8;

      this.ctx.save();
      this.ctx.translate(midX, midY);
      this.ctx.rotate(angle);
      this.ctx.beginPath();
      this.ctx.moveTo(arrowSize, 0);
      this.ctx.lineTo(-arrowSize / 2, -arrowSize / 2);
      this.ctx.lineTo(-arrowSize / 2, arrowSize / 2);
      this.ctx.closePath();
      this.ctx.fillStyle = isHighlighted ? edge.color + "aa" : edge.color + "40";
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  private drawNode(node: FractalNode) {
    const r = this.getNodeRadius(node);
    const color = this.getNodeColor(node);
    const isHovered = node.highlighted;
    const isSelected = node.selected;
    const isNoise = this.graph.noiseNodes.has(node.id);

    // Glow effect
    if (node.activity > 0.5 || isHovered) {
      const gradient = this.ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r * 3);
      gradient.addColorStop(0, color + "40");
      gradient.addColorStop(1, color + "00");
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, r * 3, 0, Math.PI * 2);
      this.ctx.fillStyle = gradient;
      this.ctx.fill();
    }

    // Fractal branch (if has parent)
    if (node.parentId) {
      const parent = this.graph.nodes.get(node.parentId);
      if (parent) {
        // Draw fractal branch with slight curve
        this.ctx.beginPath();
        this.ctx.moveTo(parent.x, parent.y);

        // Quadratic bezier for organic feel
        const midX = (parent.x + node.x) / 2;
        const midY = (parent.y + node.y) / 2;
        const cpX = midX + Math.sin(node.branchAngle) * 10;
        const cpY = midY + Math.cos(node.branchAngle) * 10;
        this.ctx.quadraticCurveTo(cpX, cpY, node.x, node.y);

        this.ctx.strokeStyle = color + "40";
        this.ctx.lineWidth = 1 + (1 - node.depth * 0.1);
        this.ctx.stroke();
      }
    }

    // Node body
    this.ctx.beginPath();
    this.ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

    if (node.type === "cluster") {
      // Dashed circle for clusters
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeStyle = color + "80";
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = color + "10";
    } else {
      this.ctx.fillStyle = color + (isSelected ? "ff" : "cc");
      this.ctx.strokeStyle = isSelected ? "#ffffff" : isHovered ? color : color + "60";
      this.ctx.lineWidth = isSelected ? 3 : isHovered ? 2 : 1;
    }

    this.ctx.fill();
    this.ctx.stroke();

    // Noise indicator
    if (isNoise && this.options.highlightNoise) {
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
      this.ctx.strokeStyle = "#ef444480";
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([3, 3]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Label
    if (this.options.showLabels && r > 5) {
      this.ctx.fillStyle = "#ffffffcc";
      this.ctx.font = `${Math.max(10, r * 0.6)}px system-ui`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "top";
      this.ctx.fillText(node.label, node.x, node.y + r + 4);
    }
  }

  private drawNoiseIndicator(node: FractalNode) {
    const r = this.getNodeRadius(node) + 8;
    this.ctx.beginPath();
    // Draw a small "noise" icon (warning triangle)
    this.ctx.moveTo(node.x, node.y - r);
    this.ctx.lineTo(node.x - 5, node.y - r + 8);
    this.ctx.lineTo(node.x + 5, node.y - r + 8);
    this.ctx.closePath();
    this.ctx.fillStyle = "#ef444460";
    this.ctx.fill();
  }

  startAnimation() {
    const animate = () => {
      // Update pulse positions
      for (const edge of this.graph.edges.values()) {
        if (edge.frequency > 0) {
          edge.pulsePos = (edge.pulsePos + 0.01 * edge.frequency) % 1;
        }
      }

      // Smooth node movement
      for (const node of this.graph.nodes.values()) {
        node.x += (node.targetX - node.x) * 0.05;
        node.y += (node.targetY - node.y) * 0.05;
      }

      this.render();
      this.animationFrame = requestAnimationFrame(animate);
    };
    animate();
  }

  stopAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  updateGraph(graph: FractalGraph) {
    this.graph = graph;
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  destroy() {
    this.stopAnimation();
  }
}

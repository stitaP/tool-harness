/**
 * Harness Playground — Interactive agent interaction visualization
 *
 * Shows:
 * 1. Real-time agent communication graph (fractal layout)
 * 2. Tool execution pipeline
 * 3. Project structure as fractal tree
 * 4. Noise detection in agent interactions
 * 5. Memory and knowledge flow visualization
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import {
  createFractalGraph,
  addNode,
  addEdge,
  layoutFractalTree,
  layoutForceDirected,
  layoutHilbert,
  layoutRadial,
  detectNoise,
  FractalGraphRenderer,
  type FractalGraph,
  type FractalNode,
  type GraphLayoutOptions,
  type NoiseAnalysisResult,
} from "@/lib/agent/fractal-graph";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PlaygroundState {
  graph: FractalGraph;
  layout: GraphLayoutOptions["algorithm"];
  noiseAnalysis: NoiseAnalysisResult | null;
  selectedNode: FractalNode | null;
  isAnimating: boolean;
  stats: {
    totalNodes: number;
    totalEdges: number;
    noiseCount: number;
    fractalDimension: number;
    hurstExponent: number;
  };
}

// ─── Sample Data Builder ────────────────────────────────────────────────────

function buildSampleGraph(): FractalGraph {
  const graph = createFractalGraph();

  // Root
  addNode(graph, { id: "root", label: "Orchestrator", type: "root", importance: 1, activity: 0.9, depth: 0, children: ["analyst", "coder", "tester", "reviewer"] });

  // Level 1: Agents
  addNode(graph, { id: "analyst", label: "Data Analyst", type: "agent", importance: 0.8, activity: 0.7, depth: 1, parentId: "root", children: ["sql-engine", "xql-engine", "mdx-engine"] });
  addNode(graph, { id: "coder", label: "Code Writer", type: "agent", importance: 0.85, activity: 0.6, depth: 1, parentId: "root", children: ["llm-prompt", "doc-parse"] });
  addNode(graph, { id: "tester", label: "Test Runner", type: "agent", importance: 0.7, activity: 0.5, depth: 1, parentId: "root", children: ["perf-test", "a11y-test"] });
  addNode(graph, { id: "reviewer", label: "Code Reviewer", type: "agent", importance: 0.75, activity: 0.4, depth: 1, parentId: "root", children: ["security-scan"] });

  // Level 2: Tools
  addNode(graph, { id: "sql-engine", label: "SQL Engine", type: "tool", importance: 0.6, activity: 0.8, depth: 2, parentId: "analyst", children: ["csv-import", "powerbi-export"] });
  addNode(graph, { id: "xql-engine", label: "XQL Engine", type: "tool", importance: 0.5, activity: 0.3, depth: 2, parentId: "analyst", children: [] });
  addNode(graph, { id: "mdx-engine", label: "MDX Engine", type: "tool", importance: 0.45, activity: 0.2, depth: 2, parentId: "analyst", children: [] });
  addNode(graph, { id: "llm-prompt", label: "LLM Prompt", type: "tool", importance: 0.7, activity: 0.9, depth: 2, parentId: "coder", children: [] });
  addNode(graph, { id: "doc-parse", label: "Doc Parser", type: "tool", importance: 0.4, activity: 0.3, depth: 2, parentId: "coder", children: [] });
  addNode(graph, { id: "perf-test", label: "Perf Test", type: "tool", importance: 0.5, activity: 0.4, depth: 2, parentId: "tester", children: [] });
  addNode(graph, { id: "a11y-test", label: "A11y Test", type: "tool", importance: 0.4, activity: 0.3, depth: 2, parentId: "tester", children: [] });
  addNode(graph, { id: "security-scan", label: "Security Scan", type: "tool", importance: 0.6, activity: 0.5, depth: 2, parentId: "reviewer", children: [] });

  // Level 3: Data
  addNode(graph, { id: "csv-import", label: "CSV Data", type: "data", importance: 0.3, activity: 0.6, depth: 3, parentId: "sql-engine", children: [] });
  addNode(graph, { id: "powerbi-export", label: "PowerBI Export", type: "data", importance: 0.35, activity: 0.4, depth: 3, parentId: "sql-engine", children: [] });

  // Noise nodes (isolated, unexpected)
  addNode(graph, { id: "noise-1", label: "Orphan Log", type: "event", importance: 0.1, activity: 0.1, depth: 4, parentId: "xql-engine", children: [] });
  addNode(graph, { id: "noise-2", label: "Stale Cache", type: "data", importance: 0.05, activity: 0.05, depth: 5, children: [] });

  // Edges (communication flow)
  addEdge(graph, { id: "e1", source: "root", target: "analyst", type: "communication", weight: 0.8, frequency: 3, directed: true, color: "#8b5cf6" });
  addEdge(graph, { id: "e2", source: "root", target: "coder", type: "communication", weight: 0.7, frequency: 2, directed: true, color: "#8b5cf6" });
  addEdge(graph, { id: "e3", source: "root", target: "tester", type: "communication", weight: 0.5, frequency: 1, directed: true, color: "#8b5cf6" });
  addEdge(graph, { id: "e4", source: "root", target: "reviewer", type: "communication", weight: 0.6, frequency: 1, directed: true, color: "#8b5cf6" });
  addEdge(graph, { id: "e5", source: "analyst", target: "sql-engine", type: "tool-call", weight: 0.9, frequency: 5, directed: true, color: "#06b6d4" });
  addEdge(graph, { id: "e6", source: "analyst", target: "xql-engine", type: "tool-call", weight: 0.3, frequency: 1, directed: true, color: "#06b6d4" });
  addEdge(graph, { id: "e7", source: "analyst", target: "mdx-engine", type: "tool-call", weight: 0.2, frequency: 1, directed: true, color: "#06b6d4" });
  addEdge(graph, { id: "e8", source: "coder", target: "llm-prompt", type: "tool-call", weight: 0.85, frequency: 4, directed: true, color: "#06b6d4" });
  addEdge(graph, { id: "e9", source: "sql-engine", target: "csv-import", type: "data-flow", weight: 0.7, frequency: 3, directed: true, color: "#10b981" });
  addEdge(graph, { id: "e10", source: "sql-engine", target: "powerbi-export", type: "data-flow", weight: 0.6, frequency: 2, directed: true, color: "#10b981" });
  addEdge(graph, { id: "e11", source: "analyst", target: "coder", type: "communication", weight: 0.4, frequency: 2, directed: true, color: "#f59e0b" });
  addEdge(graph, { id: "e12", source: "tester", target: "reviewer", type: "communication", weight: 0.3, frequency: 1, directed: true, color: "#f59e0b" });

  // Long-range edge (potential noise)
  addEdge(graph, { id: "e13", source: "csv-import", target: "security-scan", type: "dependency", weight: 0.2, frequency: 1, directed: false, color: "#ef4444" });

  return graph;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function HarnessPlayground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FractalGraphRenderer | null>(null);
  const [state, setState] = useState<PlaygroundState>({
    graph: buildSampleGraph(),
    layout: "fractal-tree",
    noiseAnalysis: null,
    selectedNode: null,
    isAnimating: true,
    stats: { totalNodes: 0, totalEdges: 0, noiseCount: 0, fractalDimension: 0, hurstExponent: 0 },
  });
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeView, setActiveView] = useState<"graph" | "pipeline" | "project" | "noise">("graph");

  // Initialize graph and run noise detection
  useEffect(() => {
    const graph = state.graph;
    const noise = detectNoise(graph);

    setState(prev => ({
      ...prev,
      graph,
      noiseAnalysis: noise,
      stats: {
        totalNodes: graph.nodes.size,
        totalEdges: graph.edges.size,
        noiseCount: noise.noiseNodes.length,
        fractalDimension: noise.fractalDimension,
        hurstExponent: noise.hurstExponent,
      },
    }));
  }, []);

  // Initialize canvas renderer
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    const options: GraphLayoutOptions = {
      algorithm: state.layout,
      width: canvas.width,
      height: canvas.height,
      padding: 60,
      animationSpeed: 1,
      showLabels: true,
      showEdgeLabels: false,
      highlightNoise: true,
      fractalDepth: 3,
      colorScheme: "agent",
      minRadius: 8,
      maxRadius: 30,
    };

    const renderer = new FractalGraphRenderer(canvas, state.graph, options);
    rendererRef.current = renderer;

    // Apply layout
    applyLayout(state.layout, state.graph, options);

    // Set callbacks
    renderer.setCallbacks(
      (node) => setState(prev => ({ ...prev, selectedNode: node })),
      () => {},
    );

    renderer.startAnimation();

    return () => {
      renderer.destroy();
    };
  }, [state.layout]);

  const applyLayout = useCallback((algorithm: string, graph: FractalGraph, options: GraphLayoutOptions) => {
    switch (algorithm) {
      case "fractal-tree": layoutFractalTree(graph, options); break;
      case "force-directed": layoutForceDirected(graph, options); break;
      case "hilbert": layoutHilbert(graph, options); break;
      case "radial": layoutRadial(graph, options); break;
    }
  }, []);

  const changeLayout = useCallback((algorithm: GraphLayoutOptions["algorithm"]) => {
    setState(prev => ({ ...prev, layout: algorithm }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteNav />
      <div className="mx-auto max-w-full px-4 py-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Harness Playground
              </span>
            </h1>
            <p className="text-sm text-gray-400">Interactive agent interaction visualization with fractal graph analysis</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Layout selector */}
            <div className="flex rounded-lg border border-gray-700 overflow-hidden">
              {(["fractal-tree", "force-directed", "radial", "hilbert"] as const).map(layout => (
                <button
                  key={layout}
                  onClick={() => changeLayout(layout)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    state.layout === layout
                      ? "bg-violet-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {layout.replace("-", " ")}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowSidebar(s => !s)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              {showSidebar ? "Hide" : "Show"} Panel
            </button>
          </div>
        </div>

        <div className="flex gap-4" style={{ height: "calc(100vh - 140px)" }}>
          {/* Main Canvas */}
          <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden relative">
            {/* View tabs */}
            <div className="absolute top-3 left-3 z-10 flex rounded-lg border border-gray-700 overflow-hidden">
              {(["graph", "pipeline", "project", "noise"] as const).map(view => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeView === view
                      ? "bg-violet-600 text-white"
                      : "bg-gray-800/80 text-gray-400 hover:text-white"
                  }`}
                >
                  {view === "graph" ? "Agent Graph" : view === "pipeline" ? "Pipeline" : view === "project" ? "Project Tree" : "Noise Analysis"}
                </button>
              ))}
            </div>

            {activeView === "graph" && (
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ cursor: "grab" }}
              />
            )}

            {activeView === "noise" && (
              <NoiseAnalysisView
                graph={state.graph}
                analysis={state.noiseAnalysis}
              />
            )}

            {activeView === "pipeline" && (
              <PipelineView graph={state.graph} />
            )}

            {activeView === "project" && (
              <ProjectTreeView graph={state.graph} />
            )}
          </div>

          {/* Sidebar */}
          {showSidebar && (
            <aside className="w-72 flex-shrink-0 space-y-3">
              {/* Stats */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Graph Statistics</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-800/50 p-2.5">
                    <div className="text-xl font-bold text-white">{state.stats.totalNodes}</div>
                    <div className="text-[10px] text-gray-500">Nodes</div>
                  </div>
                  <div className="rounded-lg bg-gray-800/50 p-2.5">
                    <div className="text-xl font-bold text-white">{state.stats.totalEdges}</div>
                    <div className="text-[10px] text-gray-500">Edges</div>
                  </div>
                  <div className="rounded-lg bg-gray-800/50 p-2.5">
                    <div className="text-xl font-bold text-cyan-400">{state.stats.fractalDimension.toFixed(2)}</div>
                    <div className="text-[10px] text-gray-500">Fractal Dim</div>
                  </div>
                  <div className="rounded-lg bg-gray-800/50 p-2.5">
                    <div className="text-xl font-bold text-amber-400">{state.stats.hurstExponent.toFixed(2)}</div>
                    <div className="text-[10px] text-gray-500">Hurst Exp</div>
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-gray-800/50 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Noise Nodes</span>
                    <span className={`text-sm font-bold ${state.stats.noiseCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {state.stats.noiseCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Selected Node Details */}
              {state.selectedNode && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Selected Node</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeColor(state.selectedNode.type) }} />
                      <span className="text-sm font-semibold text-white">{state.selectedNode.label}</span>
                    </div>
                    <div className="text-xs text-gray-500">Type: {state.selectedNode.type}</div>
                    <div className="text-xs text-gray-500">Depth: {state.selectedNode.depth}</div>
                    <div className="text-xs text-gray-500">Importance: {(state.selectedNode.importance * 100).toFixed(0)}%</div>
                    <div className="text-xs text-gray-500">Activity: {(state.selectedNode.activity * 100).toFixed(0)}%</div>
                    <div className="text-xs text-gray-500">Connections: {state.selectedNode.connections.length}</div>
                    {state.graph.noiseNodes.has(state.selectedNode.id) && (
                      <div className="mt-2 rounded bg-red-500/10 border border-red-500/20 px-2 py-1">
                        <span className="text-xs text-red-400">⚠ Flagged as noise</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Legend</h3>
                <div className="space-y-2">
                  {Object.entries({ agent: "#8b5cf6", tool: "#06b6d4", data: "#10b981", event: "#f59e0b", root: "#ec4899" }).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-xs text-gray-400 capitalize">{type}</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border border-dashed border-red-500" />
                      <span className="text-xs text-gray-400">Noise (anomaly)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Edge Types */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Edge Types</h3>
                <div className="space-y-2">
                  {[
                    { label: "Communication", color: "#8b5cf6" },
                    { label: "Tool Call", color: "#06b6d4" },
                    { label: "Data Flow", color: "#10b981" },
                    { label: "Dependency", color: "#ef4444" },
                    { label: "Hierarchy", color: "#6366f1" },
                  ].map(({ label, color }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-6 h-0.5 rounded" style={{ backgroundColor: color }} />
                      <span className="text-xs text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

// ─── Sub-Views ──────────────────────────────────────────────────────────────

function NoiseAnalysisView({ graph, analysis }: { graph: FractalGraph; analysis: NoiseAnalysisResult | null }) {
  if (!analysis) return <div className="flex items-center justify-center h-full text-gray-500">Analyzing...</div>;

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold text-white mb-4">Noise Analysis Report</h2>

      {/* Fractal Dimension Gauge */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-800/30 p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Fractal Dimension</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-3 rounded-full bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${analysis.fractalDimension * 50}%`,
                  backgroundColor: analysis.fractalDimension > 1.5 ? "#10b981" : analysis.fractalDimension > 1.0 ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-gray-500">
              <span>1.0 (Simple)</span>
              <span>1.5 (Balanced)</span>
              <span>2.0 (Complex)</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{analysis.fractalDimension.toFixed(3)}</div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {analysis.fractalDimension > 1.5
            ? "Healthy hierarchy — self-similar patterns detected across levels"
            : analysis.fractalDimension > 1.0
            ? "Moderate complexity — some structural irregularity"
            : "Flat structure — possible noise or missing hierarchy"}
        </p>
      </div>

      {/* Hurst Exponent */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-800/30 p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Hurst Exponent</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-3 rounded-full bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${analysis.hurstExponent * 100}%`,
                  backgroundColor: analysis.hurstExponent > 0.5 ? "#10b981" : "#ef4444",
                }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-gray-500">
              <span>0.0 (Anti-persistent)</span>
              <span>0.5 (Random)</span>
              <span>1.0 (Persistent)</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{analysis.hurstExponent.toFixed(3)}</div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {analysis.hurstExponent > 0.5
            ? "Persistent pattern — node connections follow predictable structure"
            : "Anti-persistent — irregular connections may indicate noise"}
        </p>
      </div>

      {/* Anomalies */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-800/30 p-5">
        <h3 className="text-sm font-semibold text-white mb-3">
          Anomalies ({analysis.anomalies.length})
        </h3>
        <div className="space-y-2">
          {analysis.anomalies.length === 0 ? (
            <p className="text-sm text-emerald-400">No anomalies detected — graph structure is healthy</p>
          ) : (
            analysis.anomalies.map((anomaly, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-gray-900/50 px-3 py-2">
                <span className="text-amber-400 text-sm mt-0.5">⚠</span>
                <span className="text-sm text-gray-300">{anomaly}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Cluster Scores */}
      <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Cluster Coherence</h3>
        <div className="space-y-2">
          {[...analysis.clusterScores.entries()].map(([cluster, score]) => (
            <div key={cluster} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-20">{cluster}</span>
              <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${score * 100}%`,
                    backgroundColor: score > 0.3 ? "#10b981" : score > 0.1 ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 w-12 text-right">{(score * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PipelineView({ graph }: { graph: FractalGraph }) {
  const edges = [...graph.edges.values()].sort((a, b) => b.frequency - a.frequency);

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold text-white mb-4">Tool Execution Pipeline</h2>
      <div className="space-y-3">
        {edges.filter(e => e.type === "tool-call" || e.type === "data-flow").map(edge => {
          const source = graph.nodes.get(edge.source);
          const target = graph.nodes.get(edge.target);
          if (!source || !target) return null;

          return (
            <div key={edge.id} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-800/30 p-4">
              <div className="flex items-center gap-2 min-w-[120px]">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeColor(source.type) }} />
                <span className="text-sm text-white">{source.label}</span>
              </div>
              <div className="flex-1 flex items-center">
                <div className="flex-1 h-0.5 rounded" style={{ backgroundColor: edge.color + "40" }} />
                <span className="mx-2 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: edge.color + "20", color: edge.color }}>
                  {edge.type}
                </span>
                <div className="flex-1 h-0.5 rounded" style={{ backgroundColor: edge.color + "40" }} />
              </div>
              <div className="flex items-center gap-2 min-w-[120px] justify-end">
                <span className="text-sm text-white">{target.label}</span>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeColor(target.type) }} />
              </div>
              <div className="text-right min-w-[60px]">
                <div className="text-xs text-gray-500">freq: {edge.frequency}</div>
                <div className="text-xs text-gray-500">w: {(edge.weight * 100).toFixed(0)}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectTreeView({ graph }: { graph: FractalGraph }) {
  const root = graph.nodes.get(graph.rootId ?? "");
  if (!root) return null;

  const renderNode = (node: FractalNode, depth: number = 0) => {
    const children = node.children.map(id => graph.nodes.get(id)).filter(Boolean) as FractalNode[];
    return (
      <div key={node.id} style={{ marginLeft: depth * 20 }}>
        <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-800/50 transition-colors">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getNodeColor(node.type) }} />
          <span className="text-sm text-white">{node.label}</span>
          <span className="text-[10px] text-gray-500 ml-auto">{node.type}</span>
          {graph.noiseNodes.has(node.id) && <span className="text-red-400 text-xs">⚠</span>}
        </div>
        {children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold text-white mb-4">Project Structure</h2>
      <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-3">
        {renderNode(root)}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getNodeColor(type: string): string {
  const colors: Record<string, string> = {
    agent: "#8b5cf6", tool: "#06b6d4", data: "#10b981", event: "#f59e0b", cluster: "#6366f1", root: "#ec4899",
  };
  return colors[type] ?? "#6b7280";
}

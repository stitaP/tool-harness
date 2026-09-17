/**
 * Agent Builder — Visual workflow composer for chaining tools and LLMs
 *
 * Users can create agents by connecting tools, LLM calls, conditions,
 * and loops into a visual workflow graph.
 */

import { useState, useMemo } from "react";
import { ALL_TOOLS, CATEGORIES, getStore } from "../lib/store";
import type {
  AgentDefinition,
  AgentNode,
  AgentNodeKind,
  AgentEdge,
} from "../lib/store/tool-types";

// ToolManifest is used only for the window hack below
type ToolManifest = { id: string; name: string; category: string };

// ─── Pre-built Agent Templates ────────────────────────────────────────────────

const AGENT_TEMPLATES: AgentDefinition[] = [
  {
    id: "template-auto-tutorial",
    name: "Auto Tutorial Generator",
    description: "Crawl a website, extract docs, and generate a video tutorial automatically",
    nodes: [
      { id: "n1", kind: "input", label: "Website URL", inputs: {}, position: { x: 50, y: 100 } },
      { id: "n2", kind: "tool", label: "Navigate to URL", toolId: "browser.navigate", inputs: { url: "n1" }, position: { x: 250, y: 100 } },
      { id: "n3", kind: "tool", label: "Extract Content", toolId: "browser.extract", inputs: { mode: "structured" }, position: { x: 450, y: 100 } },
      { id: "n4", kind: "tool", label: "Detect Tutorial", toolId: "doc.detectTutorial", inputs: { html: "n3" }, position: { x: 450, y: 200 } },
      { id: "n5", kind: "tool", label: "Extract Steps", toolId: "doc.extractSteps", inputs: { html: "n3" }, position: { x: 450, y: 300 } },
      { id: "n6", kind: "llm", label: "Generate Script", prompt: "Generate a tutorial script from these steps: {{n5}}", position: { x: 700, y: 200 }, inputs: { steps: "n5" } },
      { id: "n7", kind: "tool", label: "Synthesize Speech", toolId: "media.synthesizeSpeech", inputs: { text: "n6" }, position: { x: 900, y: 200 } },
      { id: "n8", kind: "tool", label: "Compose Audio", toolId: "media.composeAudio", inputs: { narration: "n7" }, position: { x: 900, y: 300 } },
      { id: "n9", kind: "tool", label: "Render Video", toolId: "media.renderVideo", inputs: { scenes: "n6", audio: "n8" }, position: { x: 1100, y: 200 } },
      { id: "n10", kind: "output", label: "Download Video", inputs: { video: "n9" }, position: { x: 1300, y: 200 } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n3", target: "n5" },
      { id: "e5", source: "n5", target: "n6" },
      { id: "e6", source: "n6", target: "n7" },
      { id: "e7", source: "n7", target: "n8" },
      { id: "e8", source: "n6", target: "n9" },
      { id: "e9", source: "n8", target: "n9" },
      { id: "e10", source: "n9", target: "n10" },
    ],
    variables: {},
    createdAt: "2026-08-20",
    updatedAt: "2026-08-20",
  },
  {
    id: "template-web-scraper",
    name: "Web Content Scraper",
    description: "Navigate, scroll, and extract structured content from any website",
    nodes: [
      { id: "n1", kind: "input", label: "Target URL", inputs: {}, position: { x: 50, y: 100 } },
      { id: "n2", kind: "tool", label: "Navigate", toolId: "browser.navigate", inputs: { url: "n1" }, position: { x: 250, y: 100 } },
      { id: "n3", kind: "tool", label: "Wait for Load", toolId: "browser.wait", inputs: { condition: "networkIdle" }, position: { x: 450, y: 100 } },
      { id: "n4", kind: "tool", label: "Scroll to Bottom", toolId: "browser.scroll", inputs: { mode: "toBottom" }, position: { x: 650, y: 100 } },
      { id: "n5", kind: "tool", label: "Extract All", toolId: "browser.extract", inputs: { mode: "structured" }, position: { x: 850, y: 100 } },
      { id: "n6", kind: "output", label: "Content Output", inputs: { data: "n5" }, position: { x: 1050, y: 100 } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
      { id: "e5", source: "n5", target: "n6" },
    ],
    variables: {},
    createdAt: "2026-08-20",
    updatedAt: "2026-08-20",
  },
  {
    id: "template-screenshot-series",
    name: "Screenshot Series",
    description: "Take screenshots of multiple pages or states for documentation",
    nodes: [
      { id: "n1", kind: "input", label: "URL List", inputs: {}, position: { x: 50, y: 100 } },
      { id: "n2", kind: "loop", label: "For Each URL", iterable: "n1", inputs: {}, position: { x: 250, y: 100 } },
      { id: "n3", kind: "tool", label: "Navigate", toolId: "browser.navigate", inputs: { url: "n2.current" }, position: { x: 450, y: 100 } },
      { id: "n4", kind: "tool", label: "Screenshot", toolId: "browser.screenshot", inputs: { mode: "fullPage", format: "png" }, position: { x: 650, y: 100 } },
      { id: "n5", kind: "output", label: "Save Images", inputs: { images: "n4" }, position: { x: 850, y: 100 } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
    variables: {},
    createdAt: "2026-08-20",
    updatedAt: "2026-08-20",
  },
];

// ─── Node colors by kind ──────────────────────────────────────────────────────

const NODE_COLORS: Record<AgentNodeKind, string> = {
  input: "#10b981",
  tool: "#3b82f6",
  llm: "#8b5cf6",
  condition: "#f59e0b",
  loop: "#f97316",
  parallel: "#06b6d4",
  merge: "#6b7280",
  output: "#ef4444",
};

// ─── Component ────────────────────────────────────────────────────────────────

/** The visual workflow builder — rendered as one tab of the Agent Platform page. */
export function WorkflowBuilder() {
  const [agents, setAgents] = useState<AgentDefinition[]>(AGENT_TEMPLATES);
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null);
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);

  const store = useMemo(() => getStore(), []);

  const handleAddNode = (kind: AgentNodeKind, toolId?: string) => {
    if (!selectedAgent) return;

    const newNode: AgentNode = {
      id: `n${Date.now()}`,
      kind,
      label: kind === "tool" ? (store.get(toolId || "")?.name || "Tool") : kind.charAt(0).toUpperCase() + kind.slice(1),
      toolId,
      inputs: {},
      position: { x: 100 + selectedAgent.nodes.length * 200, y: 100 },
    };

    setAgents((prev) =>
      prev.map((a) =>
        a.id === selectedAgent.id
          ? { ...a, nodes: [...a.nodes, newNode], updatedAt: new Date().toISOString() }
          : a,
      ),
    );
    setSelectedAgent((prev) =>
      prev ? { ...prev, nodes: [...prev.nodes, newNode] } : prev,
    );
    setIsAddingNode(false);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!selectedAgent) return;

    setAgents((prev) =>
      prev.map((a) =>
        a.id === selectedAgent.id
          ? {
              ...a,
              nodes: a.nodes.filter((n) => n.id !== nodeId),
              edges: a.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
            }
          : a,
      ),
    );
    setSelectedAgent((prev) =>
      prev
        ? {
            ...prev,
            nodes: prev.nodes.filter((n) => n.id !== nodeId),
            edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          }
        : prev,
    );
    setSelectedNode(null);
  };

  const handleConnect = (sourceId: string, targetId: string) => {
    if (!selectedAgent) return;
    if (sourceId === targetId) return;

    // Check for duplicates
    const exists = selectedAgent.edges.some(
      (e) => e.source === sourceId && e.target === targetId,
    );
    if (exists) return;

    const newEdge: AgentEdge = {
      id: `e${Date.now()}`,
      source: sourceId,
      target: targetId,
    };

    setAgents((prev) =>
      prev.map((a) =>
        a.id === selectedAgent.id
          ? { ...a, edges: [...a.edges, newEdge] }
          : a,
      ),
    );
    setSelectedAgent((prev) =>
      prev ? { ...prev, edges: [...prev.edges, newEdge] } : prev,
    );
  };

  const handleRun = async () => {
    if (!selectedAgent) return;
    setIsRunning(true);
    setRunResult(null);

    // Simulate execution (in production, this would use the AgentRuntime)
    setTimeout(() => {
      setRunResult({
        status: "completed",
        nodes: selectedAgent.nodes.map((n) => ({
          nodeId: n.id,
          label: n.label,
          status: "completed",
        })),
        message: "Agent execution simulated successfully. In production, this uses the AgentRuntime class.",
      });
      setIsRunning(false);
    }, 2000);
  };

  return (
    <div className="text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  Agent Builder
                </span>
              </h1>
              <p className="mt-1 text-gray-400">
                Chain tools and LLMs into automated workflows
              </p>
            </div>
            <a
              href="/store"
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              ← Tool Store
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex gap-6">
          {/* Left Panel: Agent List */}
          <aside className="w-72 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Your Agents
              </h3>
            </div>
            <div className="space-y-2">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgent(agent);
                    setSelectedNode(null);
                  }}
                  className={`w-full rounded-lg p-3 text-left transition-all ${
                    selectedAgent?.id === agent.id
                      ? "border border-violet-500/50 bg-violet-500/10"
                      : "border border-gray-800 bg-gray-900/50 hover:border-gray-700"
                  }`}
                >
                  <div className="font-medium text-sm text-white">{agent.name}</div>
                  <div className="mt-1 text-xs text-gray-400 line-clamp-1">{agent.description}</div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <span>{agent.nodes.length} nodes</span>
                    <span>•</span>
                    <span>{agent.edges.length} edges</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Templates */}
            <div className="mt-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Templates
              </h3>
              <div className="space-y-2">
                {AGENT_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => {
                      const newAgent = {
                        ...tmpl,
                        id: `agent-${Date.now()}`,
                        name: `${tmpl.name} (Copy)`,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      };
                      setAgents((prev) => [...prev, newAgent]);
                    }}
                    className="w-full rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-left hover:border-gray-700 transition-colors"
                  >
                    <div className="text-sm text-gray-300">{tmpl.name}</div>
                    <div className="text-xs text-gray-500 mt-1">Use template →</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Main: Canvas */}
          <main className="flex-1">
            {selectedAgent ? (
              <div className="rounded-xl border border-gray-800 bg-gray-900/50">
                {/* Agent header */}
                <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                  <div>
                    <h2 className="font-semibold text-white">{selectedAgent.name}</h2>
                    <p className="text-sm text-gray-400">{selectedAgent.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsAddingNode(true)}
                      className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                    >
                      + Add Node
                    </button>
                    <button
                      onClick={handleRun}
                      disabled={isRunning}
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                    >
                      {isRunning ? "Running..." : "▶ Run Agent"}
                    </button>
                  </div>
                </div>

                {/* Visual canvas */}
                <div className="relative overflow-auto p-6" style={{ minHeight: 500 }}>
                  <svg className="absolute inset-0 h-full w-full pointer-events-none">
                    {/* Draw edges */}
                    {selectedAgent.edges.map((edge) => {
                      const sourceNode = selectedAgent.nodes.find((n) => n.id === edge.source);
                      const targetNode = selectedAgent.nodes.find((n) => n.id === edge.target);
                      if (!sourceNode || !targetNode) return null;

                      const sx = sourceNode.position.x + 140;
                      const sy = sourceNode.position.y + 25;
                      const tx = targetNode.position.x;
                      const ty = targetNode.position.y + 25;

                      const mx = (sx + tx) / 2;

                      return (
                        <path
                          key={edge.id}
                          d={`M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`}
                          stroke="#4b5563"
                          strokeWidth={2}
                          fill="none"
                          markerEnd="url(#arrowhead)"
                        />
                      );
                    })}
                    <defs>
                      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#4b5563" />
                      </marker>
                    </defs>
                  </svg>

                  {/* Draw nodes */}
                  {selectedAgent.nodes.map((node) => (
                    <div
                      key={node.id}
                      className={`absolute cursor-pointer rounded-xl border-2 p-3 transition-all ${
                        selectedNode?.id === node.id
                          ? "ring-2 ring-violet-500 ring-offset-2 ring-offset-gray-900"
                          : ""
                      }`}
                      style={{
                        left: node.position.x,
                        top: node.position.y,
                        width: 160,
                        borderColor: NODE_COLORS[node.kind] + "60",
                        backgroundColor: NODE_COLORS[node.kind] + "10",
                      }}
                      onClick={() => setSelectedNode(node)}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: NODE_COLORS[node.kind] }}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          {node.kind}
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-medium text-white">{node.label}</div>
                      {node.toolId && (
                        <div className="mt-1 text-xs text-gray-500 font-mono truncate">{node.toolId}</div>
                      )}
                    </div>
                  ))}
                </div>

                {selectedNode !== null ? (
                  <div className="border-t border-gray-800 px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-white">
                        <span
                          className="inline-block h-2 w-2 rounded-full mr-2"
                          style={{ backgroundColor: NODE_COLORS[selectedNode.kind] || '#6b7280' }}
                        />
                        {selectedNode.label}
                      </h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeleteNode(selectedNode.id)}
                          className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setSelectedNode(null)}
                          className="text-gray-500 hover:text-white text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <label className="text-gray-500 text-xs">Type</label>
                        <div className="text-white capitalize">{selectedNode.kind}</div>
                      </div>
                      {selectedNode.toolId && (
                        <div>
                          <label className="text-gray-500 text-xs">Tool</label>
                          <div className="text-violet-400 font-mono text-xs">{selectedNode.toolId}</div>
                        </div>
                      )}
                      <div>
                        <label className="text-gray-500 text-xs">Connections</label>
                        <div className="text-white">
                          {selectedAgent.edges.filter(
                            (e) => e.source === selectedNode.id || e.target === selectedNode.id,
                          ).length}{" "}
                          edges
                        </div>
                      </div>
                    </div>

                    {/* Connect to another node */}
                    <div className="mt-3">
                      <label className="text-xs text-gray-500">Connect to:</label>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selectedAgent.nodes
                          .filter(
                            (n) =>
                              n.id !== selectedNode.id &&
                              !selectedAgent.edges.some(
                                (e) =>
                                  e.source === selectedNode.id && e.target === n.id,
                              ),
                          )
                          .map((n) => (
                            <button
                              key={n.id}
                              onClick={() => handleConnect(selectedNode.id, n.id)}
                              className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 transition-colors"
                            >
                              → {n.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Add Node Dialog */}
                {isAddingNode && (
                  <div className="border-t border-gray-800 px-4 py-3">
                    <h3 className="mb-3 text-sm font-semibold text-white">Add Node</h3>
                    <div className="flex flex-wrap gap-2">
                      {(["input", "tool", "llm", "condition", "loop", "output"] as AgentNodeKind[]).map(
                        (kind) => (
                          <button
                            key={kind}
                            onClick={() =>
                              kind === "tool" ? setIsAddingNode(true) : handleAddNode(kind)
                            }
                            className="rounded-lg border px-3 py-1.5 text-sm transition-colors"
                            style={{
                              borderColor: NODE_COLORS[kind] + "40",
                              color: NODE_COLORS[kind],
                            }}
                          >
                            + {kind.charAt(0).toUpperCase() + kind.slice(1)}
                          </button>
                        ),
                      )}
                    </div>

                    {/* Tool picker (if adding tool node) */}
                    {isAddingNode && (
                      <div className="mt-3">
                        <input
                          type="text"
                          placeholder="Search tools..."
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                          onChange={(e) => {
                            // Filter tools by search
                            const q = e.target.value.toLowerCase();
                            const tools = q
                              ? ALL_TOOLS.filter(
                                  (t) =>
                                    t.name.toLowerCase().includes(q) ||
                                    t.id.toLowerCase().includes(q),
                                )
                              : ALL_TOOLS.slice(0, 10);
                            // Store filtered tools for display below
                            (window as unknown as { _filteredTools: ToolManifest[] })._filteredTools = tools;
                          }}
                        />
                        <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                          {ALL_TOOLS.slice(0, 15).map((tool) => (
                            <button
                              key={tool.id}
                              onClick={() => handleAddNode("tool", tool.id)}
                              className="w-full rounded-lg bg-gray-800/50 px-3 py-2 text-left text-sm hover:bg-gray-700 transition-colors"
                            >
                              <span className="text-white">{tool.name}</span>
                              <span className="ml-2 text-gray-500 font-mono text-xs">{tool.id}</span>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setIsAddingNode(false)}
                          className="mt-2 text-xs text-gray-500 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Run result */}
                {runResult && (
                  <div className="border-t border-gray-800 px-4 py-3">
                    <h3 className="mb-2 text-sm font-semibold text-white">Run Result</h3>
                    <pre className="rounded-lg bg-gray-800 p-3 text-xs text-gray-300 overflow-x-auto">
                      {JSON.stringify(runResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              /* Empty state */
              <div className="flex h-96 items-center justify-center rounded-xl border border-dashed border-gray-700">
                <div className="text-center">
                  <div className="text-4xl mb-4">🤖</div>
                  <h3 className="text-lg font-semibold text-white">No Agent Selected</h3>
                  <p className="mt-2 text-sm text-gray-400">
                    Select an agent from the list or create a new one from a template.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

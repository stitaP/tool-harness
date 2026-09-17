/**
 * Agent Configuration — Define agents, their roles, tools, scope, and knowledge
 *
 * A comprehensive configuration interface where users:
 * 1. Define agent roles and responsibilities
 * 2. Select tools from the harness for each agent
 * 3. Upload documents (PDFs, web links) as knowledge scope
 * 4. Configure agent-to-agent communication
 * 5. Set parameters and guardrails
 */

import { useState, useMemo, useCallback } from "react";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ALL_TOOLS, CATEGORIES, getStore } from "@/lib/store";
import type { ToolManifest, ToolCategory } from "@/lib/store/tool-types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  role: string;
  color: string;
  icon: string;
  status: "active" | "idle" | "configuring";
  tools: string[];
  knowledge: KnowledgeDoc[];
  scope: {
    browseInternet: boolean;
    confinedToDocs: boolean;
    maxTokensPerQuery: number;
    maxConcurrentTasks: number;
    allowedDomains: string[];
    blockedDomains: string[];
  };
  principles: string[];
  template?: string;
}

interface KnowledgeDoc {
  id: string;
  name: string;
  type: "pdf" | "url" | "text" | "file";
  url?: string;
  content?: string;
  selected: boolean;
  addedAt: string;
}

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  role: string;
  suggestedTools: string[];
  suggestedDocs: string[];
  color: string;
}

// ─── Templates ──────────────────────────────────────────────────────────────

const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Analyzes data using SQL, exports to reporting platforms",
    role: "Analyze datasets, run queries, generate reports for PowerBI/Excel/Sheets/Tableau",
    suggestedTools: ["analytics.sql", "analytics.xql", "analytics.mdx", "analytics.csv_import", "analytics.export_powerbi", "analytics.export_excel"],
    suggestedDocs: ["data-dictionary", "reporting-guidelines"],
    color: "#06b6d4",
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    description: "Reviews code for quality, security, and best practices",
    role: "Review code changes, find bugs, suggest improvements, check security",
    suggestedTools: ["document.parse", "llm.prompt", "llm.parse", "design.audit"],
    suggestedDocs: ["coding-standards", "security-policy"],
    color: "#8b5cf6",
  },
  {
    id: "web-scraper",
    name: "Web Scraper",
    description: "Extracts data from websites and APIs",
    role: "Navigate websites, extract data, handle pagination, store results",
    suggestedTools: ["browser.navigate", "browser.extract", "browser.click", "browser.scroll", "analytics.csv_import"],
    suggestedDocs: ["target-sites", "extraction-rules"],
    color: "#10b981",
  },
  {
    id: "test-runner",
    name: "Test Runner",
    description: "Runs automated tests and generates reports",
    role: "Execute test suites, report failures, track coverage",
    suggestedTools: ["testing.performance", "testing.accessibility", "testing.seo", "testing.security"],
    suggestedDocs: ["test-plan", "acceptance-criteria"],
    color: "#f59e0b",
  },
  {
    id: "document-writer",
    name: "Document Writer",
    description: "Creates and maintains documentation",
    role: "Write technical docs, tutorials, API references, changelogs",
    suggestedTools: ["document.parse", "llm.prompt", "llm.parse"],
    suggestedDocs: ["style-guide", "api-spec"],
    color: "#ec4899",
  },
  {
    id: "security-auditor",
    name: "Security Auditor",
    description: "Audits code and infrastructure for security issues",
    role: "Scan for vulnerabilities, check dependencies, review auth flows",
    suggestedTools: ["testing.security", "browser.navigate", "llm.prompt"],
    suggestedDocs: ["security-policy", "compliance-requirements"],
    color: "#ef4444",
  },
];

const ROLE_OPTIONS = [
  "Planner", "Coder", "Tester", "Reviewer", "Documenter",
  "Researcher", "Coordinator", "Data Analyst", "Security Auditor",
  "DevOps", "Designer", "Writer",
];

const PRINCIPLE_PRESETS = [
  "Always verify results before reporting",
  "Prefer read-only operations unless explicitly asked to modify",
  "Log all tool invocations for audit trail",
  "Respect rate limits and API quotas",
  "Fail gracefully and report errors clearly",
  "Never expose credentials in output",
  "Use the most specific tool for each task",
  "Cache repeated queries to reduce cost",
  "Prefer local/offline tools when available",
  "Summarize large outputs before presenting",
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AgentConfig() {
  const [agents, setAgents] = useState<AgentConfig[]>([
    {
      id: "agent-1",
      name: "Primary Analyst",
      description: "Main data analysis agent",
      role: "Data Analyst",
      color: "#06b6d4",
      icon: "📊",
      status: "active",
      tools: ["analytics.sql", "analytics.csv_import", "analytics.export_powerbi"],
      knowledge: [],
      scope: { browseInternet: false, confinedToDocs: true, maxTokensPerQuery: 4096, maxConcurrentTasks: 3, allowedDomains: [], blockedDomains: [] },
      principles: ["Always verify results before reporting", "Use the most specific tool for each task"],
    },
  ]);

  const [selectedAgentId, setSelectedAgentId] = useState<string>("agent-1");
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [showKnowledgePanel, setShowKnowledgePanel] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [newDocUrl, setNewDocUrl] = useState("");
  const [newDocName, setNewDocName] = useState("");
    type ConfigTab = "tools" | "knowledge" | "scope" | "principles" | "template";
  const [activeConfigTab, setActiveConfigTab] = useState<ConfigTab>("tools");

  const selectedAgent = useMemo(() => agents.find(a => a.id === selectedAgentId), [agents, selectedAgentId]);

  const store = getStore();

  const addAgent = useCallback((template?: AgentTemplate) => {
    const id = `agent-${Date.now()}`;
    const newAgent: AgentConfig = {
      id,
      name: template?.name ?? `Agent ${agents.length + 1}`,
      description: template?.description ?? "New agent",
      role: template?.role ?? "Coder",
      color: template?.color ?? "#6366f1",
      icon: "🤖",
      status: "configuring",
      tools: template?.suggestedTools ?? [],
      knowledge: [],
      scope: { browseInternet: false, confinedToDocs: true, maxTokensPerQuery: 4096, maxConcurrentTasks: 3, allowedDomains: [], blockedDomains: [] },
      principles: [],
      template: template?.id,
    };
    setAgents(prev => [...prev, newAgent]);
    setSelectedAgentId(id);
    setShowTemplatePicker(false);
  }, [agents.length]);

  const updateAgent = useCallback((id: string, updates: Partial<AgentConfig>) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  }, []);

  const removeAgent = useCallback((id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id));
    if (selectedAgentId === id) {
      setSelectedAgentId(agents[0]?.id ?? "");
    }
  }, [selectedAgentId, agents]);

  const toggleTool = useCallback((agentId: string, toolId: string) => {
    setAgents(prev => prev.map(a => {
      if (a.id !== agentId) return a;
      const tools = a.tools.includes(toolId)
        ? a.tools.filter(t => t !== toolId)
        : [...a.tools, toolId];
      return { ...a, tools };
    }));
  }, []);

  const addKnowledgeDoc = useCallback((agentId: string, doc: Omit<KnowledgeDoc, "id" | "addedAt">) => {
    setAgents(prev => prev.map(a => {
      if (a.id !== agentId) return a;
      return {
        ...a,
        knowledge: [...a.knowledge, { ...doc, id: `doc-${Date.now()}`, addedAt: new Date().toISOString() }],
      };
    }));
  }, []);

  const removeKnowledgeDoc = useCallback((agentId: string, docId: string) => {
    setAgents(prev => prev.map(a => {
      if (a.id !== agentId) return a;
      return { ...a, knowledge: a.knowledge.filter(d => d.id !== docId) };
    }));
  }, []);

  const togglePrinciple = useCallback((agentId: string, principle: string) => {
    setAgents(prev => prev.map(a => {
      if (a.id !== agentId) return a;
      const principles = a.principles.includes(principle)
        ? a.principles.filter(p => p !== principle)
        : [...a.principles, principle];
      return { ...a, principles };
    }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteNav />
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                Agent Configuration
              </span>
            </h1>
            <p className="mt-1 text-gray-400">Define agents, assign tools, set scope, and configure knowledge</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowTemplatePicker(true)}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-violet-500 hover:text-white transition-colors"
            >
              + From Template
            </button>
            <button
              onClick={() => addAgent()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500 transition-colors"
            >
              + New Agent
            </button>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar: Agent List */}
          <aside className="w-64 flex-shrink-0 space-y-2">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`w-full text-left rounded-xl border p-3 transition-all ${
                  selectedAgentId === agent.id
                    ? "border-violet-500/50 bg-violet-500/5"
                    : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{agent.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white truncate">{agent.name}</h3>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        agent.status === "active" ? "bg-emerald-400" : agent.status === "configuring" ? "bg-amber-400" : "bg-gray-500"
                      }`} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">{agent.role}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <span>{agent.tools.length} tools</span>
                  <span>•</span>
                  <span>{agent.knowledge.length} docs</span>
                </div>
              </button>
            ))}
          </aside>

          {/* Main: Configuration Panel */}
          <main className="flex-1">
            {selectedAgent ? (
              <AgentDetail
                agent={selectedAgent}
                store={store}
                activeTab={activeConfigTab}
                onTabChange={setActiveConfigTab}
                onToggleTool={(toolId) => toggleTool(selectedAgent.id, toolId)}
                onAddDoc={(doc) => addKnowledgeDoc(selectedAgent.id, doc)}
                onRemoveDoc={(docId) => removeKnowledgeDoc(selectedAgent.id, docId)}
                onTogglePrinciple={(p) => togglePrinciple(selectedAgent.id, p)}
                onUpdate={(updates) => updateAgent(selectedAgent.id, updates)}
                onRemove={() => removeAgent(selectedAgent.id)}
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Select an agent to configure
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Template Picker Modal */}
      {showTemplatePicker && (
        <TemplatePicker
          templates={AGENT_TEMPLATES}
          onSelect={(t) => addAgent(t)}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}

      <SiteFooter />
    </div>
  );
}

// ─── Agent Detail Panel ─────────────────────────────────────────────────────

function AgentDetail({
  agent, store, activeTab, onTabChange, onToggleTool, onAddDoc, onRemoveDoc, onTogglePrinciple, onUpdate, onRemove,
}: {
  agent: AgentConfig;
  store: ReturnType<typeof getStore>;
  activeTab: "tools" | "knowledge" | "scope" | "principles" | "template";
  onTabChange: (tab: "tools" | "knowledge" | "scope" | "principles" | "template") => void;
  onToggleTool: (toolId: string) => void;
  onAddDoc: (doc: Omit<KnowledgeDoc, "id" | "addedAt">) => void;
  onRemoveDoc: (docId: string) => void;
  onTogglePrinciple: (principle: string) => void;
  onUpdate: (updates: Partial<AgentConfig>) => void;
  onRemove: () => void;
}) {
  const [newDocUrl, setNewDocUrl] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [toolFilter, setToolFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ToolCategory | "all">("all");

  const filteredTools = useMemo(() => {
    let tools = store.getAll();
    if (categoryFilter !== "all") tools = tools.filter(t => t.category === categoryFilter);
    if (toolFilter) {
      const q = toolFilter.toLowerCase();
      tools = tools.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q)));
    }
    return tools;
  }, [store, toolFilter, categoryFilter]);

  const toolCategories = useMemo(() => CATEGORIES.filter(c => c.toolCount > 0), []);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50">
      {/* Header */}
      <div className="border-b border-gray-800 px-5 py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{agent.icon}</span>
            <div>
              <input
                value={agent.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                className="bg-transparent text-lg font-bold text-white border-b border-transparent hover:border-gray-600 focus:border-violet-500 focus:outline-none"
              />
              <input
                value={agent.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                className="block bg-transparent text-sm text-gray-400 border-b border-transparent hover:border-gray-600 focus:border-violet-500 focus:outline-none w-full mt-1"
              />
            </div>
          </div>
          <button onClick={onRemove} className="text-sm text-gray-500 hover:text-red-400 transition-colors">Remove</button>
        </div>

        {/* Role */}
        <div className="mt-3 flex items-center gap-3">
          <label className="text-xs text-gray-500">Role:</label>
          <select
            value={agent.role}
            onChange={(e) => onUpdate({ role: e.target.value })}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none"
          >
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <label className="text-xs text-gray-500 ml-4">Color:</label>
          <input
            type="color"
            value={agent.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="h-6 w-6 rounded border-0 bg-transparent cursor-pointer"
          />
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-gray-800 -mb-px">
          {(["tools", "knowledge", "scope", "principles", "template"] as const).map((tab: "tools" | "knowledge" | "scope" | "principles" | "template") => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-violet-500 text-violet-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab === "tools" ? `Tools (${agent.tools.length})` : tab === "knowledge" ? `Knowledge (${agent.knowledge.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px] max-h-[700px] overflow-y-auto p-5">
        {activeTab === "tools" && (
          <div>
            {/* Tool filters */}
            <div className="mb-4 flex flex-wrap gap-2">
              <input
                type="text"
                value={toolFilter}
                onChange={(e) => setToolFilter(e.target.value)}
                placeholder="Search tools..."
                className="flex-1 min-w-[200px] rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as ToolCategory | "all")}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
              >
                <option value="all">All Categories</option>
                {toolCategories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.toolCount})</option>)}
              </select>
            </div>

            {/* Selected tools */}
            {agent.tools.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Selected Tools</h4>
                <div className="flex flex-wrap gap-2">
                  {agent.tools.map(toolId => {
                    const tool = store.get(toolId);
                    return tool ? (
                      <button
                        key={toolId}
                        onClick={() => onToggleTool(toolId)}
                        className="flex items-center gap-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 px-3 py-1.5 text-sm text-violet-300 hover:bg-violet-500/30 transition-colors"
                      >
                        <span>{tool.name}</span>
                        <span className="text-violet-400/60">✕</span>
                      </button>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            {/* Available tools grid */}
            <div className="grid grid-cols-2 gap-3">
              {filteredTools.slice(0, 30).map(tool => {
                const isSelected = agent.tools.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    onClick={() => onToggleTool(tool.id)}
                    className={`text-left rounded-lg border p-3 transition-all ${
                      isSelected
                        ? "border-violet-500/50 bg-violet-500/10"
                        : "border-gray-800 bg-gray-800/50 hover:border-gray-700"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h5 className="text-sm font-medium text-white">{tool.name}</h5>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{tool.description}</p>
                      </div>
                      {isSelected && <span className="text-violet-400 text-sm">✓</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-400">{tool.category}</span>
                      {tool.slmFriendly && <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-400">SLM</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "knowledge" && (
          <div>
            <div className="mb-4 flex gap-2">
              <input
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="Document name"
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
              />
              <input
                value={newDocUrl}
                onChange={(e) => setNewDocUrl(e.target.value)}
                placeholder="URL or paste content..."
                className="flex-[2] rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
              />
              <button
                onClick={() => {
                  if (newDocName && newDocUrl) {
                    onAddDoc({
                      name: newDocName,
                      type: newDocUrl.startsWith("http") ? "url" : "text",
                      url: newDocUrl.startsWith("http") ? newDocUrl : undefined,
                      content: newDocUrl.startsWith("http") ? undefined : newDocUrl,
                      selected: true,
                    });
                    setNewDocName("");
                    setNewDocUrl("");
                  }
                }}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500 transition-colors"
              >
                Add
              </button>
            </div>

            {/* Document list */}
            <div className="space-y-2">
              {agent.knowledge.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No documents added yet. Add PDFs, URLs, or text content as knowledge scope for this agent.
                </div>
              )}
              {agent.knowledge.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-800/50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={doc.selected}
                    onChange={() => {
                      // Toggle selection
                    }}
                    className="rounded border-gray-600 bg-gray-700 text-violet-500"
                  />
                  <span className="text-lg">
                    {doc.type === "pdf" ? "📄" : doc.type === "url" ? "🔗" : doc.type === "file" ? "📁" : "📝"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-sm font-medium text-white">{doc.name}</h5>
                    <p className="text-xs text-gray-500 truncate">{doc.url ?? doc.content?.substring(0, 80) ?? "No content"}</p>
                  </div>
                  <span className="text-xs text-gray-500">{doc.type.toUpperCase()}</span>
                  <button onClick={() => onRemoveDoc(doc.id)} className="text-gray-500 hover:text-red-400 text-sm">✕</button>
                </div>
              ))}
            </div>

            {/* Browse internet toggle */}
            <div className="mt-6 rounded-lg border border-gray-800 bg-gray-800/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-white">Internet Access</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Allow this agent to browse the internet for answers</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agent.scope.browseInternet}
                    onChange={(e) => onUpdate({ scope: { ...agent.scope, browseInternet: e.target.checked } })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-violet-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                </label>
              </div>
              {agent.scope.browseInternet && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 block mb-1">Confine to provided docs only</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agent.scope.confinedToDocs}
                      onChange={(e) => onUpdate({ scope: { ...agent.scope, confinedToDocs: e.target.checked } })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-violet-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "scope" && (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Resource Limits</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Max Tokens Per Query</label>
                  <input
                    type="number"
                    value={agent.scope.maxTokensPerQuery}
                    onChange={(e) => onUpdate({ scope: { ...agent.scope, maxTokensPerQuery: parseInt(e.target.value) || 4096 } })}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Max Concurrent Tasks</label>
                  <input
                    type="number"
                    value={agent.scope.maxConcurrentTasks}
                    onChange={(e) => onUpdate({ scope: { ...agent.scope, maxConcurrentTasks: parseInt(e.target.value) || 1 } })}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Domain Restrictions</h4>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Allowed Domains (one per line)</label>
                <textarea
                  value={agent.scope.allowedDomains.join("\n")}
                  onChange={(e) => onUpdate({ scope: { ...agent.scope, allowedDomains: e.target.value.split("\n").filter(Boolean) } })}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white font-mono focus:border-violet-500 focus:outline-none h-24"
                  placeholder="example.com&#10;api.example.com"
                />
              </div>
              <div className="mt-3">
                <label className="text-xs text-gray-500 block mb-1">Blocked Domains (one per line)</label>
                <textarea
                  value={agent.scope.blockedDomains.join("\n")}
                  onChange={(e) => onUpdate({ scope: { ...agent.scope, blockedDomains: e.target.value.split("\n").filter(Boolean) } })}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white font-mono focus:border-violet-500 focus:outline-none h-24"
                  placeholder="malware.com&#10;tracking.example.com"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "principles" && (
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Operating Principles</h4>
            <p className="text-xs text-gray-500 mb-4">Select principles that guide this agent's behavior</p>
            <div className="space-y-2">
              {PRINCIPLE_PRESETS.map(principle => {
                const isSelected = agent.principles.includes(principle);
                return (
                  <button
                    key={principle}
                    onClick={() => onTogglePrinciple(principle)}
                    className={`w-full text-left rounded-lg border p-3 transition-all ${
                      isSelected
                        ? "border-violet-500/50 bg-violet-500/10"
                        : "border-gray-800 bg-gray-800/50 hover:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${
                        isSelected ? "bg-violet-600 border-violet-600 text-white" : "border-gray-600 text-transparent"
                      }`}>✓</span>
                      <span className="text-sm text-gray-300">{principle}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "template" && (
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Agent Template</h4>
            <p className="text-xs text-gray-500 mb-4">Select a pre-configured template to quickly set up this agent</p>
            <div className="grid grid-cols-2 gap-3">
              {AGENT_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  onClick={() => onUpdate({
                    role: template.role,
                    tools: template.suggestedTools,
                    color: template.color,
                    template: template.id,
                  })}
                  className="text-left rounded-lg border border-gray-800 bg-gray-800/50 p-4 hover:border-gray-700 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: template.color }} />
                    <h5 className="text-sm font-medium text-white">{template.name}</h5>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.suggestedTools.slice(0, 3).map(t => (
                      <span key={t} className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-400">{t}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Template Picker Modal ──────────────────────────────────────────────────

function TemplatePicker({
  templates,
  onSelect,
  onClose,
}: {
  templates: AgentTemplate[];
  onSelect: (template: AgentTemplate) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-4 max-w-2xl w-full rounded-2xl border border-gray-800 bg-gray-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-white mb-4">Choose Agent Template</h2>
        <div className="grid grid-cols-2 gap-3">
          {templates.map(template => (
            <button
              key={template.id}
              onClick={() => onSelect(template)}
              className="text-left rounded-xl border border-gray-800 bg-gray-800/50 p-4 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: template.color }} />
                <h3 className="font-semibold text-white">{template.name}</h3>
              </div>
              <p className="text-sm text-gray-400">{template.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {template.suggestedTools.slice(0, 4).map(t => (
                  <span key={t} className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-400">{t.split(".").pop()}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-lg bg-gray-800 py-2 text-sm text-gray-400 hover:bg-gray-700 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

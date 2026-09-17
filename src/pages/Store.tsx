/**
 * Tool Store — Browse, install, and manage tools for automation and LLM orchestration
 */

import { useState, useMemo } from "react";
import { Link } from "react-router";
import { ALL_TOOLS, CATEGORIES, getStore } from "../lib/store";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import type { ToolCategory, ToolManifest, StoreFilter } from "../lib/store/tool-types";

export default function Store() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | "all">("all");
  const [sortBy, setSortBy] = useState<"popular" | "rating" | "recent" | "name">("popular");
  const [showSLMFriendly, setShowSLMFriendly] = useState(false);
  const [showOfflineOnly, setShowOfflineOnly] = useState(false);
  const [selectedTool, setSelectedTool] = useState<ToolManifest | null>(null);
  const [installedTools, setInstalledTools] = useState<Set<string>>(new Set());

  const filteredTools = useMemo(() => {
    const filter: StoreFilter = {
      search: search || undefined,
      category: selectedCategory === "all" ? undefined : selectedCategory,
      sortBy,
      slmFriendly: showSLMFriendly || undefined,
      offline: showOfflineOnly || undefined,
    };

    const store = getStore();
    return store.search(filter);
  }, [search, selectedCategory, sortBy, showSLMFriendly, showOfflineOnly]);

  const handleInstall = (toolId: string) => {
    const store = getStore();
    store.install(toolId);
    setInstalledTools(new Set(store.getInstalled().map((t) => t.manifest.id)));
  };

  const handleUninstall = (toolId: string) => {
    const store = getStore();
    store.uninstall(toolId);
    setInstalledTools(new Set(store.getInstalled().map((t) => t.manifest.id)));
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteNav />
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  Tool Store
                </span>
              </h1>
              <p className="mt-1 text-gray-400">
                {ALL_TOOLS.length} tools for automation, video creation, and LLM orchestration
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-400">
                {installedTools.size} installed
              </span>
              <a
                href="/agents"
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500 transition-colors"
              >
                Agent Builder →
              </a>
            </div>
          </div>

          {/* Search and filters */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools..."
              className="flex-1 min-w-[200px] rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-violet-500 focus:outline-none"
            >
              <option value="popular">Most Popular</option>
              <option value="rating">Highest Rated</option>
              <option value="recent">Recently Updated</option>
              <option value="name">Name (A-Z)</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={showSLMFriendly}
                onChange={(e) => setShowSLMFriendly(e.target.checked)}
                className="rounded border-gray-600 bg-gray-700 text-violet-500"
              />
              SLM Friendly
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={showOfflineOnly}
                onChange={(e) => setShowOfflineOnly(e.target.checked)}
                className="rounded border-gray-600 bg-gray-700 text-violet-500"
              />
              Offline Only
            </label>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex gap-8">
          {/* Sidebar: Categories */}
          <aside className="w-56 flex-shrink-0">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Categories
            </h3>
            <nav className="space-y-1">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedCategory === "all"
                    ? "bg-violet-600/20 text-violet-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                All Tools ({ALL_TOOLS.length})
              </button>
              {CATEGORIES.filter((c) => c.toolCount > 0).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selectedCategory === cat.id
                      ? "bg-violet-600/20 text-violet-400"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {cat.name} ({cat.toolCount})
                </button>
              ))}
            </nav>

            {/* Quick stats */}
            <div className="mt-8 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Store Stats
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Tools</span>
                  <span className="text-white">{ALL_TOOLS.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">SLM Friendly</span>
                  <span className="text-emerald-400">
                    {ALL_TOOLS.filter((t) => t.slmFriendly).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Offline Capable</span>
                  <span className="text-blue-400">
                    {ALL_TOOLS.filter((t) => t.capabilities.some((c) => c.offline)).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Categories</span>
                  <span className="text-white">{CATEGORIES.filter((c) => c.toolCount > 0).length}</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Main: Tool Grid */}
          <main className="flex-1">
            {filteredTools.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-gray-500">
                No tools found matching your criteria.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    installed={installedTools.has(tool.id)}
                    onSelect={() => setSelectedTool(tool)}
                    onInstall={() => handleInstall(tool.id)}
                    onUninstall={() => handleUninstall(tool.id)}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Tool Detail Modal */}
      {selectedTool && (
        <ToolDetailModal
          tool={selectedTool}
          installed={installedTools.has(selectedTool.id)}
          onClose={() => setSelectedTool(null)}
          onInstall={() => handleInstall(selectedTool.id)}
          onUninstall={() => handleUninstall(selectedTool.id)}
        />
      )}
    </div>
  );
}

function ToolCard({
  tool,
  installed,
  onSelect,
  onInstall,
  onUninstall,
}: {
  tool: ToolManifest;
  installed: boolean;
  onSelect: () => void;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  return (
    <div
      className={`group relative rounded-xl border p-4 transition-all cursor-pointer ${
        installed
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-800/50"
      }`}
      onClick={onSelect}
    >
      {/* Icon + badge */}
      <div className="flex items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: tool.color + "20" }}
        >
          <span className="text-lg" style={{ color: tool.color }}>
            ●
          </span>
        </div>
        {installed && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
            Installed
          </span>
        )}
      </div>

      {/* Name + description */}
      <h3 className="mt-3 font-semibold text-white group-hover:text-violet-400 transition-colors">
        {tool.name}
      </h3>
      <p className="mt-1 text-sm text-gray-400 line-clamp-2">{tool.description}</p>

      {/* Tags */}
      <div className="mt-3 flex flex-wrap gap-1">
        {tool.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500">
            {tag}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          <span>⭐ {tool.rating.toFixed(1)}</span>
          <span>📥 {(tool.installs / 1000).toFixed(1)}k</span>
        </div>
        <div className="flex items-center gap-2">
          {tool.slmFriendly && (
            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-violet-400">SLM</span>
          )}
          {tool.capabilities.some((c) => c.offline) && (
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-blue-400">Offline</span>
          )}
        </div>
      </div>

      {/* Install button */}
      <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {installed ? (
          <button
            onClick={onUninstall}
            className="w-full rounded-lg border border-gray-700 py-1.5 text-sm text-gray-400 hover:border-red-500 hover:text-red-400 transition-colors"
          >
            Uninstall
          </button>
        ) : (
          <button
            onClick={onInstall}
            className="w-full rounded-lg bg-violet-600 py-1.5 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
          >
            Install
          </button>
        )}
        {tool.id === "cfd.pipeflow.thermal" && (
          <Link
            to="/pipeflow"
            title="Try the interactive demo"
            className="rounded-lg border border-orange-500/50 bg-orange-500/10 px-2.5 py-1.5 text-sm text-orange-400 transition-colors hover:bg-orange-500/20"
          >
            Demo
          </Link>
        )}
        <Link
          to={`/docs/tools?tool=${tool.id}`}
          title="Full documentation"
          className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-sm text-gray-400 transition-colors hover:border-violet-500 hover:text-violet-300"
        >
          Docs
        </Link>
      </div>
    </div>
  );
}

function ToolDetailModal({
  tool,
  installed,
  onClose,
  onInstall,
  onUninstall,
}: {
  tool: ToolManifest;
  installed: boolean;
  onClose: () => void;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: tool.color + "20" }}
            >
              <span className="text-xl" style={{ color: tool.color }}>
                ●
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{tool.name}</h2>
              <p className="text-sm text-gray-400">
                v{tool.version} by {tool.author}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">
            ✕
          </button>
        </div>

        {/* Description */}
        <p className="mt-4 text-gray-300">{tool.longDescription || tool.description}</p>

        {/* Stats */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <span className="text-gray-400">⭐ {tool.rating.toFixed(1)} ({tool.ratingCount} ratings)</span>
          <span className="text-gray-400">📥 {(tool.installs / 1000).toFixed(1)}k installs</span>
          <span className="text-gray-400">📄 {tool.license}</span>
          <span className="text-gray-400">🔄 Updated {tool.updatedAt}</span>
        </div>

        {/* Capabilities */}
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Capabilities</h3>
          <div className="space-y-2">
            {tool.capabilities.map((cap) => (
              <div key={cap.name} className="flex items-center gap-2 rounded-lg bg-gray-800/50 px-3 py-2 text-sm">
                <span className="text-emerald-400">✓</span>
                <span className="text-white">{cap.description}</span>
                <div className="ml-auto flex gap-2">
                  {cap.offline && (
                    <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-400">Offline</span>
                  )}
                  {cap.requiresNetwork && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400">Network</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Parameters */}
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Parameters</h3>
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50 text-left">
                  <th className="px-3 py-2 text-gray-400">Name</th>
                  <th className="px-3 py-2 text-gray-400">Type</th>
                  <th className="px-3 py-2 text-gray-400">Required</th>
                  <th className="px-3 py-2 text-gray-400">Default</th>
                </tr>
              </thead>
              <tbody>
                {tool.parameters.map((param) => (
                  <tr key={param.name} className="border-t border-gray-800">
                    <td className="px-3 py-2 font-mono text-violet-400">{param.name}</td>
                    <td className="px-3 py-2 text-gray-400">{param.type}</td>
                    <td className="px-3 py-2">
                      {param.required ? (
                        <span className="text-red-400">required</span>
                      ) : (
                        <span className="text-gray-600">optional</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500 font-mono">
                      {param.default !== undefined ? JSON.stringify(param.default) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dependencies */}
        {tool.dependencies && tool.dependencies.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Dependencies</h3>
            <div className="flex flex-wrap gap-2">
              {tool.dependencies.map((dep) => (
                <span key={dep} className="rounded-lg bg-gray-800 px-2 py-1 text-sm text-gray-400">
                  {dep}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {tool.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-400">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Install button */}
        <div className="mt-6 flex gap-3">
          {installed ? (
            <>
              <button
                onClick={onUninstall}
                className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Uninstall
              </button>
              <button
                onClick={onClose}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onInstall}
                className="rounded-lg bg-violet-600 px-6 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
              >
                Install Tool
              </button>
              {tool.id === "cfd.pipeflow.thermal" && (
                <Link
                  to="/pipeflow"
                  onClick={onClose}
                  className="rounded-lg border border-orange-500/50 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-400 hover:bg-orange-500/20 transition-colors"
                >
                  Try Demo →
                </Link>
              )}
              <button
                onClick={onClose}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

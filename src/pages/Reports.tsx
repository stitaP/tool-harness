/**
 * Reports — Agent interaction logs, LLM data, tool interactions, and analytics
 *
 * Displays detailed reports of agent activities with markdown rendering,
 * visual testing results, and comprehensive interaction logs.
 */

import { useState, useMemo } from "react";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "success" | "debug";
  category: "agent" | "llm" | "tool" | "system" | "security" | "analytics";
  source: string;
  message: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

interface Report {
  id: string;
  title: string;
  type: "agent_run" | "tool_execution" | "llm_interaction" | "analytics_query" | "browser_session" | "system_health";
  status: "completed" | "running" | "failed" | "cancelled";
  startTime: string;
  endTime?: string;
  duration?: number;
  summary: string;
  logs: LogEntry[];
  metrics: Record<string, number | string>;
  markdown?: string;
}

// ─── Sample Data ────────────────────────────────────────────────────────────

const SAMPLE_REPORTS: Report[] = [
  {
    id: "rpt-001",
    title: "Agent Run: Data Analysis Pipeline",
    type: "agent_run",
    status: "completed",
    startTime: "2024-01-15T10:30:00Z",
    endTime: "2024-01-15T10:32:15Z",
    duration: 135,
    summary: "Completed full data analysis pipeline: imported 3 CSV files, ran SQL queries, exported to PowerBI format.",
    logs: [
      { id: "l1", timestamp: "10:30:00", level: "info", category: "agent", source: "orchestrator", message: "Starting agent run: Data Analysis Pipeline" },
      { id: "l2", timestamp: "10:30:02", level: "info", category: "tool", source: "analytics.csv_import", message: "Importing sales_data.csv (1,234 rows, 12 columns)" },
      { id: "l3", timestamp: "10:30:03", level: "success", category: "tool", source: "analytics.csv_import", message: "Import complete: sales_data table created" },
      { id: "l4", timestamp: "10:30:05", level: "info", category: "llm", source: "gpt-4-turbo", message: "LLM request: Generate SQL analysis query", details: "Token usage: 1,234 input, 567 output" },
      { id: "l5", timestamp: "10:30:08", level: "info", category: "tool", source: "analytics.sql", message: "Executing: SELECT region, SUM(revenue) as total FROM sales_data GROUP BY region ORDER BY total DESC" },
      { id: "l6", timestamp: "10:30:09", level: "success", category: "tool", source: "analytics.sql", message: "Query returned 8 rows in 12ms" },
      { id: "l7", timestamp: "10:30:12", level: "info", category: "tool", source: "analytics.export_powerbi", message: "Exporting to PowerBI format" },
      { id: "l8", timestamp: "10:30:13", level: "success", category: "tool", source: "analytics.export_powerbi", message: "Export complete: sales_data_powerbi.csv (2.3 KB)" },
    ],
    metrics: {
      "Total Steps": 6,
      "Successful": 6,
      "Failed": 0,
      "Duration (s)": "135",
      "LLM Tokens Used": "1,801",
      "Queries Executed": 2,
      "Files Exported": 1,
    },
  },
  {
    id: "rpt-002",
    title: "LLM Interaction: Code Review Agent",
    type: "llm_interaction",
    status: "completed",
    startTime: "2024-01-15T11:00:00Z",
    endTime: "2024-01-15T11:01:30Z",
    duration: 90,
    summary: "Code review agent analyzed 3 files, found 2 issues, generated fix suggestions.",
    logs: [
      { id: "l9", timestamp: "11:00:00", level: "info", category: "agent", source: "code-review", message: "Starting code review for 3 files" },
      { id: "l10", timestamp: "11:00:02", level: "info", category: "tool", source: "doc-tools.parse", message: "Parsing src/auth.ts (2,456 bytes)" },
      { id: "l11", timestamp: "11:00:05", level: "info", category: "llm", source: "claude-3-sonnet", message: "LLM request: Analyze code for security issues", details: "Token usage: 3,200 input, 1,100 output" },
      { id: "l12", timestamp: "11:00:12", level: "warning", category: "security", source: "analyzer", message: "Found potential SQL injection in auth.ts:42" },
      { id: "l13", timestamp: "11:00:15", level: "error", category: "security", source: "analyzer", message: "Hardcoded API key detected in config.ts:18" },
      { id: "l14", timestamp: "11:00:20", level: "info", category: "tool", source: "doc-tools.generate", message: "Generating fix suggestions" },
      { id: "l15", timestamp: "11:00:25", level: "success", category: "agent", source: "code-review", message: "Review complete: 2 issues found, 2 fixes generated" },
    ],
    metrics: {
      "Files Reviewed": 3,
      "Issues Found": 2,
      "Security Issues": 2,
      "LLM Tokens Used": "4,300",
      "Duration (s)": "90",
    },
  },
  {
    id: "rpt-003",
    title: "Browser Session: UI Testing",
    type: "browser_session",
    status: "failed",
    startTime: "2024-01-15T12:00:00Z",
    endTime: "2024-01-15T12:00:45Z",
    duration: 45,
    summary: "Browser automation session failed: page load timeout after 30s.",
    logs: [
      { id: "l16", timestamp: "12:00:00", level: "info", category: "agent", source: "browser-agent", message: "Starting browser session for UI testing" },
      { id: "l17", timestamp: "12:00:02", level: "info", category: "tool", source: "browser.navigate", message: "Navigating to https://example.com/login" },
      { id: "l18", timestamp: "12:00:32", level: "error", category: "system", source: "browser", message: "Page load timeout after 30 seconds" },
      { id: "l19", timestamp: "12:00:35", level: "info", category: "tool", source: "browser.screenshot", message: "Capturing error state screenshot" },
      { id: "l20", timestamp: "12:00:40", level: "error", category: "agent", source: "browser-agent", message: "Session failed: unable to load target page" },
    ],
    metrics: {
      "Pages Visited": 1,
      "Screenshots": 1,
      "Errors": 1,
      "Duration (s)": "45",
    },
  },
];

// ─── Markdown Renderer (lightweight) ────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-white mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-8 mb-4">$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-gray-300">$1</em>')
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-900 rounded-lg p-4 my-3 overflow-x-auto text-sm"><code class="text-emerald-400">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-800 px-1.5 py-0.5 rounded text-violet-400 text-sm">$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:underline" target="_blank">$1</a>')
    // Lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-gray-300">• $1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-gray-300">$1</li>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-violet-500 pl-4 my-2 text-gray-400 italic">$1</blockquote>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="border-gray-700 my-4" />')
    // Tables (simple)
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split("|").filter(c => c.trim());
      return "<tr>" + cells.map(c => `<td class="px-3 py-1 border border-gray-700 text-gray-300">${c.trim()}</td>`).join("") + "</tr>";
    })
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="text-gray-300 mb-2">')
    .replace(/\n/g, "<br />");
}

// ─── Components ─────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-400 bg-blue-500/10",
  warning: "text-amber-400 bg-amber-500/10",
  error: "text-red-400 bg-red-500/10",
  success: "text-emerald-400 bg-emerald-500/10",
  debug: "text-gray-400 bg-gray-500/10",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-400 bg-emerald-500/10",
  running: "text-blue-400 bg-blue-500/10",
  failed: "text-red-400 bg-red-500/10",
  cancelled: "text-gray-400 bg-gray-500/10",
};

const TYPE_ICONS: Record<string, string> = {
  agent_run: "🤖",
  llm_interaction: "🧠",
  tool_execution: "🔧",
  analytics_query: "📊",
  browser_session: "🌐",
  system_health: "⚙️",
};

function LogEntryRow({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex items-start gap-3 border-b border-gray-800/50 py-2 px-3 hover:bg-gray-800/30 transition-colors">
      <span className="text-xs text-gray-500 w-16 flex-shrink-0 pt-0.5 font-mono">{entry.timestamp}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${LEVEL_COLORS[entry.level]}`}>
        {entry.level.toUpperCase()}
      </span>
      <span className="text-xs text-gray-500 w-20 flex-shrink-0 pt-0.5">{entry.category}</span>
      <span className="text-xs text-gray-400 w-32 flex-shrink-0 pt-0.5 truncate">{entry.source}</span>
      <span className="text-sm text-gray-300 flex-1">{entry.message}</span>
    </div>
  );
}

function ReportCard({
  report,
  isSelected,
  onSelect,
}: {
  report: Report;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-4 transition-all ${
        isSelected
          ? "border-violet-500/50 bg-violet-500/5"
          : "border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-800/30"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{TYPE_ICONS[report.type]}</span>
          <div>
            <h3 className="text-sm font-semibold text-white">{report.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{report.summary.substring(0, 80)}...</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[report.status]}`}>
          {report.status}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
        <span>{report.logs.length} log entries</span>
        <span>•</span>
        <span>{report.duration ?? "—"}s</span>
        <span>•</span>
        <span>{new Date(report.startTime).toLocaleString()}</span>
      </div>
    </button>
  );
}

function ReportDetail({ report }: { report: Report }) {
  const [activeTab, setActiveTab] = useState<"logs" | "metrics" | "markdown" | "raw">("logs");

  const generatedMarkdown = useMemo(() => {
    return `# ${report.title}

## Summary
${report.summary}

## Status: ${report.status.toUpperCase()}
- **Started:** ${new Date(report.startTime).toLocaleString()}
- **Ended:** ${report.endTime ? new Date(report.endTime).toLocaleString() : "N/A"}
- **Duration:** ${report.duration ?? "N/A"} seconds

## Metrics
${Object.entries(report.metrics).map(([k, v]) => `- **${k}:** ${v}`).join("\n")}

## Activity Log
${report.logs.map(l => `- \`${l.timestamp}\` [${l.level.toUpperCase()}] \`${l.source}\`: ${l.message}`).join("\n")}

## Analysis
The ${report.type.replace(/_/g, " ")} completed with ${report.status} status.
Total log entries: ${report.logs.length}
Error entries: ${report.logs.filter(l => l.level === "error").length}
Warning entries: ${report.logs.filter(l => l.level === "warning").length}
`;
  }, [report]);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50">
      {/* Header */}
      <div className="border-b border-gray-800 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{report.title}</h2>
            <p className="text-sm text-gray-400 mt-1">{report.summary}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[report.status]}`}>
              {report.status}
            </span>
            {report.duration && (
              <span className="text-xs text-gray-500">{report.duration}s</span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-gray-800 -mb-px">
          {(["logs", "metrics", "markdown", "raw"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-violet-500 text-violet-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab === "logs" ? `Logs (${report.logs.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px] max-h-[600px] overflow-y-auto">
        {activeTab === "logs" && (
          <div className="divide-y divide-gray-800/50">
            {report.logs.map((entry) => (
              <LogEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        {activeTab === "metrics" && (
          <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(report.metrics).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-gray-800/50 p-4">
                <div className="text-2xl font-bold text-white">{String(value)}</div>
                <div className="text-sm text-gray-400 mt-1">{key}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "markdown" && (
          <div className="p-5">
            <div
              className="prose prose-invert max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(generatedMarkdown) }}
            />
          </div>
        )}

        {activeTab === "raw" && (
          <div className="p-5">
            <pre className="bg-gray-950 rounded-lg p-4 text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(report, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Reports() {
  const [selectedReport, setSelectedReport] = useState<Report | null>(SAMPLE_REPORTS[0]);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredReports = useMemo(() => {
    return SAMPLE_REPORTS.filter((r) => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (searchQuery && !r.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [filterType, filterStatus, searchQuery]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteNav />
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Reports & Logs
            </span>
          </h1>
          <p className="mt-1 text-gray-400">
            Agent interactions, LLM data, tool executions, and analytics queries
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reports..."
            className="flex-1 min-w-[200px] rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="agent_run">Agent Runs</option>
            <option value="llm_interaction">LLM Interactions</option>
            <option value="tool_execution">Tool Executions</option>
            <option value="browser_session">Browser Sessions</option>
            <option value="analytics_query">Analytics Queries</option>
            <option value="system_health">System Health</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Stats Bar */}
        <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
            <div className="text-2xl font-bold text-white">{SAMPLE_REPORTS.length}</div>
            <div className="text-xs text-gray-500">Total Reports</div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
            <div className="text-2xl font-bold text-emerald-400">
              {SAMPLE_REPORTS.filter((r) => r.status === "completed").length}
            </div>
            <div className="text-xs text-gray-500">Completed</div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
            <div className="text-2xl font-bold text-red-400">
              {SAMPLE_REPORTS.filter((r) => r.status === "failed").length}
            </div>
            <div className="text-xs text-gray-500">Failed</div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
            <div className="text-2xl font-bold text-blue-400">
              {SAMPLE_REPORTS.reduce((sum, r) => sum + r.logs.length, 0)}
            </div>
            <div className="text-xs text-gray-500">Log Entries</div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
            <div className="text-2xl font-bold text-violet-400">
              {SAMPLE_REPORTS.reduce((sum, r) => sum + (r.duration ?? 0), 0)}s
            </div>
            <div className="text-xs text-gray-500">Total Runtime</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex gap-6">
          {/* Sidebar: Report List */}
          <aside className="w-80 flex-shrink-0 space-y-2">
            {filteredReports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                isSelected={selectedReport?.id === report.id}
                onSelect={() => setSelectedReport(report)}
              />
            ))}
          </aside>

          {/* Main: Report Detail */}
          <main className="flex-1">
            {selectedReport ? (
              <ReportDetail report={selectedReport} />
            ) : (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Select a report to view details
              </div>
            )}
          </main>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

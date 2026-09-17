/**
 * stitaP Tool Store — Registry
 *
 * Central registry that aggregates all tools, provides search/filter,
 * and manages installation and execution.
 */

import type {
  ToolManifest,
  ToolCategory,
  ToolInput,
  ToolOutput,
  ToolExecutor,
  InstalledTool,
  StoreCategory,
  StoreFilter,
  HarnessDefinition,
  HarnessRun,
  HarnessStepResult,
  AgentDefinition,
} from "./tool-types";

import { BROWSER_TOOLS } from "./tools/browser-tools";
import { VISUAL_TOOLS } from "./tools/browser-visual-tools";
import { VIDEO_TOOLS } from "./tools/video-tools";
import { DOC_TOOLS } from "./tools/doc-tools";
import { MEDIA_TOOLS } from "./tools/media-tools";
import { LLM_TOOLS } from "./tools/llm-tools";
import { ANALYTICS_TOOLS } from "./tools/analytics-tools";
import { SERVER_TOOLS } from "./tools/server-tools";
import { HUGGINGFACE_TOOLS } from "./tools/huggingface-tools";
import { ML_TOOLS } from "./tools/ml-tools";
import { CFD_TOOLS } from "./tools/cfd-tools";
import { MATH_TOOLS } from "./tools/math-tools";
import { FRACTAL_TOOLS } from "./tools/fractal-tools";
import { GRAPH_TOOLS } from "./tools/graph-tools";
import { SYMBOLIC_TOOLS } from "./tools/symbolic-tools";
import { OFFICE_TOOLS } from "./tools/office-tools";
import { STANDARDS_TOOLS } from "./tools/standards-tools";
import { VIKING_TOOLS } from "./tools/viking-tools";
import { DIAGRAM_TOOLS } from "./tools/diagram-tools";
import { HARNESS_TOOLS } from "./tools/harness-tools";
import { INDIC_OCR_TOOLS } from "./tools/indic-ocr-tools";
import { DESIGN_ENGINE_TOOLS } from "./tools/design-engine-tools";
import { INDIC_TYPOGRAPHY_TOOLS } from "./tools/indic-typography-tools";
import { SOUTH_INDIAN_TOOLS } from "./tools/south-indian-tools";
import { TEST_TOOLS } from "./tools/browser-test-tools";
import { ENV_TOOLS } from "./tools/env-tools";
import { DESIGN_TOOLS } from "./tools/browser-design-tools";
import { SANDBOX_TOOLS } from "./tools/sandbox-tools";
import { AGENT_TOOLS } from "./tools/agent-tools";
import { INTEGRATION_TOOLS } from "./tools/integration-tools";
import { ECOMMERCE_TOOLS } from "./tools/ecommerce-tools";
import { MICROFINANCE_TOOLS } from "./tools/microfinance-tools";
import { FINANCIAL_TOOLS, CHITFUND_TOOLS, REALESTATE_TOOLS } from "./tools/business-tools";
import { CODEGEN_TOOLS } from "./tools/codegen-tools";
import { INFERENCE_TOOLS } from "./tools/inference-tools";
import {
  CHAINS_RUN_MANIFEST,
  CHAINS_AGENT_MANIFEST,
  GRAPH_RUN_MANIFEST,
  chainsRun,
  chainsAgent,
  graphRun,
} from "./tools/orchestration-tools";
import {
  SESSION_MODULES_MANIFEST,
  SWARM_CONFIGURE_MANIFEST,
  ENTERPRISE_PROJECT_MANIFEST,
  sessionModules,
  swarmConfigure,
  enterpriseProject,
} from "./tools/session-tools";
import {
  HERMES_OPS_TOOLS,
  schedulerJobs,
  knowledgeSearch,
  notifySend,
  traceRuns,
  approvalsGate,
} from "./tools/hermes-tools";

// ─── All Available Tools ──────────────────────────────────────────────────────

export const ALL_TOOLS: ToolManifest[] = [
  ...BROWSER_TOOLS,
  ...VISUAL_TOOLS,
  ...TEST_TOOLS,
  ...ENV_TOOLS,
  ...DESIGN_TOOLS,
  ...SANDBOX_TOOLS,
  ...AGENT_TOOLS,
  ...INTEGRATION_TOOLS,
  ...INFERENCE_TOOLS,
  CHAINS_RUN_MANIFEST,
  CHAINS_AGENT_MANIFEST,
  GRAPH_RUN_MANIFEST,
  SESSION_MODULES_MANIFEST,
  SWARM_CONFIGURE_MANIFEST,
  ENTERPRISE_PROJECT_MANIFEST,
  ...HERMES_OPS_TOOLS,
  ...VIDEO_TOOLS,
  ...DOC_TOOLS,
  ...MEDIA_TOOLS,
  ...LLM_TOOLS,
  ...ANALYTICS_TOOLS,
  ...SERVER_TOOLS,
  ...HUGGINGFACE_TOOLS,
  ...ML_TOOLS,
  ...CFD_TOOLS,
  ...MATH_TOOLS,
  ...FRACTAL_TOOLS,
  ...GRAPH_TOOLS,
  ...SYMBOLIC_TOOLS,
  ...OFFICE_TOOLS,
  ...STANDARDS_TOOLS,
  ...VIKING_TOOLS,
  ...DIAGRAM_TOOLS,
  ...HARNESS_TOOLS,
  ...INDIC_OCR_TOOLS,
  ...DESIGN_ENGINE_TOOLS,
  ...INDIC_TYPOGRAPHY_TOOLS,
  ...SOUTH_INDIAN_TOOLS,
  ...ECOMMERCE_TOOLS,
  ...MICROFINANCE_TOOLS,
  ...FINANCIAL_TOOLS,
  ...CHITFUND_TOOLS,
  ...REALESTATE_TOOLS,
  ...CODEGEN_TOOLS,
];

// ─── Category Definitions ─────────────────────────────────────────────────────

export const CATEGORIES: StoreCategory[] = [
  { id: "browser", name: "Browser Automation & Deep Inspection", description: "Navigate, interact, inspect DOM, capture network traffic, extract storage, read framework state, intercept websockets and console", icon: "Globe", toolCount: BROWSER_TOOLS.length + VISUAL_TOOLS.length + TEST_TOOLS.length },
  { id: "visual", name: "Visual Understanding", description: "Analyze screenshots, detect UI elements, icons, colors, layouts — feed structured data to LLMs without external vision APIs", icon: "Eye", toolCount: VISUAL_TOOLS.length },
  { id: "capture", name: "Screen Capture", description: "Screenshots and screen recording", icon: "Camera", toolCount: ALL_TOOLS.filter((t) => t.category === "capture").length },
  { id: "video", name: "Video Editing", description: "Record, annotate, overlay, caption, and export video", icon: "Film", toolCount: VIDEO_TOOLS.length },
  { id: "audio", name: "Audio & Speech", description: "Speech synthesis, audio mixing, and waveform visualization", icon: "Music", toolCount: MEDIA_TOOLS.filter((t) => t.category === "audio").length },
  { id: "document", name: "Document Parsing", description: "Extract steps, detect tutorials, parse FAQs, generate scripts", icon: "FileText", toolCount: DOC_TOOLS.length },
  { id: "llm", name: "LLM Integration", description: "Prompt building, response parsing, model routing, context management", icon: "Brain", toolCount: LLM_TOOLS.length },
  { id: "export", name: "Export & Rendering", description: "Render videos, thumbnails, and export in multiple formats", icon: "Download", toolCount: ALL_TOOLS.filter((t) => t.category === "export").length },
  { id: "analytics", name: "Analytics & Database", description: "In-house columnar database with SQL, XQL, and MDX query engines, CSV/JSON import-export, joins, aggregations, group-by, window functions, and exports to PowerBI, Excel, Google Sheets, Tableau — DuckDB-style, zero dependencies, runs in-browser", icon: "Database", toolCount: ANALYTICS_TOOLS.length },
  { id: "ml", name: "Machine Learning & Numerical Computing", description: "Pure TypeScript ML & math: regression, classification, clustering, PCA, forecasting, fault detection (Z-score, Mahalanobis, Isolation Forest, SPC charts), text classification (Naive Bayes, TF-IDF, BM25, sentiment), polynomial fitting, ODE/PDE solvers, symbolic differentiation, root finding — zero dependencies, runs in-browser", icon: "Brain", toolCount: ML_TOOLS.length },
  { id: "cfd", name: "Computational Fluid Dynamics", description: "Incompressible 2D Navier-Stokes solver (SIMPLE algorithm), structured mesh generation, pressure-velocity coupling, finite volume discretization, convergence monitoring, contour/vector/streamline visualization, lid-driven cavity, channel flow, and backward-facing step benchmarks — pure TypeScript, runs in-browser", icon: "Waves", toolCount: CFD_TOOLS.length },
  { id: "math", name: "Engineering Math Solver", description: "FEA (truss, beam, CST, Q4), stress analysis (von Mises, principal, Mohr), heat conduction, Poisson equation, wave equation, beam deflection, column buckling, linear algebra (LU, Cholesky, QR, eigenvalues), optimization (gradient descent, Newton, BFGS, LP simplex) — zero dependencies, runs in-browser", icon: "Calculator", toolCount: MATH_TOOLS.length },
  { id: "fractal", name: "Fractal Analysis", description: "Mandelbrot, Julia, Burning Ship, Newton, Tricorn, Sierpinski, Koch, Cantor, Dragon, Hilbert, IFS (Barnsley fern), L-systems, orbit trap, box-counting dimension, lacunarity, multifractal spectrum, Perlin noise, bifurcation, Lorenz attractor — all fractal algorithms", icon: "Flower2", toolCount: FRACTAL_TOOLS.length },
  { id: "chart", name: "Graphs & Visualization", description: "35+ chart types: line, bar, scatter, histogram, box, violin, contour, heatmap, vector field, streamlines, phase portrait, bifurcation, radar, treemap, waterfall, funnel, gauge, sparkline, Pareto, Q-Q, autocorrelation, spectrum — recharts-compatible output", icon: "BarChart3", toolCount: GRAPH_TOOLS.length },
  { id: "office", name: "Office Alternatives", description: "Document generation (Word), spreadsheets (Excel), presentations (PowerPoint), PDF content, email — all with Markdown import and HTML export", icon: "FileText", toolCount: OFFICE_TOOLS.length },
  { id: "standards", name: "ISO & QA Standards", description: "ISO 25010, ISO 9001, ISO 27001, OWASP Top 10, WCAG 2.2, QA, documentation standards — compliance audits, security scans, accessibility checks", icon: "ShieldCheck", toolCount: STANDARDS_TOOLS.length },
  { id: "viking", name: "OpenViking Context Store", description: "Hierarchical L0/L1/L2 tiered context storage for organizing webbuilder assets without overwhelming LLM context windows — viking:// virtual filesystem with budget-aware loading", icon: "Database", toolCount: VIKING_TOOLS.length },
  { id: "diagram", name: "Diagram Design & Architecture", description: "Generate Mermaid diagrams from crawled data — user journeys, component trees, data flows, system architecture, state machines, ER diagrams, and route navigation maps", icon: "GitBranch", toolCount: DIAGRAM_TOOLS.length },
  { id: "harness", name: "CAR Framework & Governance", description: "Control-Agency-Runtime harness with evaluation gates, spend rails, permission policies, agent registration, and AGENTS.md generation for governed agent execution", icon: "Shield", toolCount: HARNESS_TOOLS.length },
  { id: "ocr", name: "OCR & Text Recognition", description: "Optical character recognition: Tesseract LSTM (100+ languages), MGP-STR scene text, Indic multi-script (13 Indian languages + English), auto script detection, mixed-script profiles, Unicode normalization", icon: "ScanText", toolCount: INDIC_OCR_TOOLS.length },
  { id: "integrations", name: "External Integrations", description: "Database connectors (PostgreSQL, MySQL, SQLite, MongoDB), email (SMTP, SendGrid, Resend), SMS (Twilio), payments (Stripe), cloud storage (S3, GCS, Azure), maps & geocoding (OSM), real-time collaboration (WebSocket), mobile hardware (camera, GPS, clipboard), and OS integration (filesystem, tray, processes)", icon: "Link", toolCount: INTEGRATION_TOOLS.length },
  { id: "security", name: "Security", description: "Credential management and sanitization (coming soon)", icon: "ShieldCheck", toolCount: 0 },
  { id: "testing", name: "Website Testing & Analysis", description: "Performance metrics, interaction testing, accessibility audit, responsive design, security headers, SEO analysis, visual regression, API testing, form validation, test generation", icon: "FlaskConical", toolCount: TEST_TOOLS.length },
  { id: "design", name: "Design System & Agent Canvas", description: "Figma-style programmatic canvas for agents + Indic script typography engine (W3C ilreq compliant Telugu/Hindi/Bengali/Tamil/Kannada/etc design rules, newspaper layouts, font selection, line-height enforcement)", icon: "Palette", toolCount: DESIGN_TOOLS.length + DESIGN_ENGINE_TOOLS.length + INDIC_TYPOGRAPHY_TOOLS.length },
  { id: "agent", name: "Agent Orchestration", description: "In-house stitaP-chains, stitaP-graph engines, browser automation (Phase 2), Cloudflare OS edge deployment, and agent lifecycle management", icon: "Workflow", toolCount: 3 },
  { id: "inference", name: "Inference & Model Management", description: "Hardware-aware backend routing, model download, quantization, throughput optimization, legacy server support, and harness catalog", icon: "Cpu", toolCount: INFERENCE_TOOLS.length },
  { id: "ecommerce", name: "E-Commerce Operations", description: "Customer service (ticket triage, auto-reply, dispute resolution, return/refund processing), order management (status tracking, bulk operations, address validation), inventory management (stock levels, reorder alerts, batch updates, channel sync), product catalog (CRUD, variants, pricing, bundling, SEO), shipping & logistics (rate calculation, label generation, returns, tracking, carrier sync), reviews & ratings (sentiment analysis, response drafting, moderation, analytics), pricing intelligence (competitive monitoring, dynamic pricing, MAP compliance, elasticity)", icon: "ShoppingCart", toolCount: ECOMMERCE_TOOLS.length },
  { id: "finance-calc", name: "Financial Scenario Calculator", description: "Universal financial calculators: loan EMI with prepayment, SIP with step-up, FD/RD maturity, income tax (old vs new regime), goal-based planning, stamp duty (20 states), SWP, investment comparator — all pure computation, zero dependencies", icon: "Calculator", toolCount: FINANCIAL_TOOLS.length },
  { id: "chitfund", name: "Chit Fund Management", description: "Complete chit fund toolkit: group creation, bid/auction tracking, dividend calculation, collection management, member statements, foreman commission reports, regulatory compliance (Chit Funds Act 1982), default notices, dashboard — for companies managing 1-50 chit groups", icon: "Users", toolCount: CHITFUND_TOOLS.length },
  { id: "realestate", name: "Real Estate Company", description: "Real estate builder toolkit: project creation with cost estimation, sales pipeline, CRM follow-ups, cash flow reports, profitability analysis (ROI/IRR), compliance tracking (RERA/approvals), revenue forecasting, unit pricing engine, company dashboard — for builders doing 1-10 projects", icon: "Building2", toolCount: REALESTATE_TOOLS.length },
  { id: "microfinance", name: "Microfinance & Credit Business", description: "₹3-interest-per-10-months credit business toolkit: customer ledger with EMI schedules, payment tracking (PhonePe/UPI + Cash), WhatsApp message parsing & auto-receipts, collection route planning (pincode-based), defaulter detection with risk scoring, PhonePe reconciliation, DuckDB analytics (daily settlement, weekly summary, financier exposure, agent leaderboard, EMI collection rate)", icon: "IndianRupee", toolCount: MICROFINANCE_TOOLS.length },
  { id: "server", name: "Legacy Server Revival", description: "Detect pre-2008 server hardware, generate custom llama.cpp builds for old CPUs (SSE/SSE2/SSE3/SSSE3), and deploy RAG chatbot servers from e-waste", icon: "Server", toolCount: SERVER_TOOLS.length },
  { id: "codegen", name: "Code Generation & Language Reference", description: "SLM-powered code generation engine with reference library for Python 3.12+ (pandas, numpy, scipy, flask, fastapi), Java 21+ (streams, HTTP client, JDBC), C++20 (STL, filesystem, algorithms), C (POSIX, stdio, math), JavaScript/TypeScript (fetch, fs, crypto, async), Rust (std, reqwest, serde) — includes syntax validation, API lookup, starter file generation, and 6 cross-language patterns", icon: "Code", toolCount: CODEGEN_TOOLS.length },
];

// ─── Store Class ──────────────────────────────────────────────────────────────

export class ToolStore {
  private tools: Map<string, ToolManifest> = new Map();
  private installed: Map<string, InstalledTool> = new Map();
  private executors: Map<string, ToolExecutor> = new Map();

  constructor() {
    // Register all built-in tools
    for (const tool of ALL_TOOLS) {
      this.tools.set(tool.id, tool);
    }
  }

  /** Search and filter tools */
  search(filter: StoreFilter = {}): ToolManifest[] {
    let results = Array.from(this.tools.values());

    if (filter.category) {
      results = results.filter((t) => t.category === filter.category);
    }

    if (filter.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    if (filter.slmFriendly !== undefined) {
      results = results.filter((t) => t.slmFriendly === filter.slmFriendly);
    }

    if (filter.offline !== undefined) {
      results = results.filter((t) =>
        t.capabilities.some((c) => c.offline === filter.offline),
      );
    }

    // Sort
    switch (filter.sortBy) {
      case "popular":
        results.sort((a, b) => b.installs - a.installs);
        break;
      case "rating":
        results.sort((a, b) => b.rating - a.rating);
        break;
      case "recent":
        results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        break;
      case "name":
        results.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        // Default: by installs
        results.sort((a, b) => b.installs - a.installs);
    }

    return results;
  }

  /** Get a tool by ID */
  get(id: string): ToolManifest | undefined {
    return this.tools.get(id);
  }

  /** Get all tools in a category */
  getByCategory(category: ToolCategory): ToolManifest[] {
    return Array.from(this.tools.values()).filter((t) => t.category === category);
  }

  /** Get all tools */
  getAll(): ToolManifest[] {
    return Array.from(this.tools.values());
  }

  /** Install a tool */
  install(toolId: string): InstalledTool | undefined {
    const manifest = this.tools.get(toolId);
    if (!manifest) return undefined;

    const existing = this.installed.get(toolId);
    if (existing) return existing;

    // Check dependencies
    if (manifest.dependencies) {
      for (const depId of manifest.dependencies) {
        if (!this.installed.has(depId)) {
          this.install(depId);
        }
      }
    }

    const installed: InstalledTool = {
      manifest,
      installedAt: new Date().toISOString(),
      enabled: true,
    };

    this.installed.set(toolId, installed);
    return installed;
  }

  /** Uninstall a tool */
  uninstall(toolId: string): boolean {
    return this.installed.delete(toolId);
  }

  /** Check if a tool is installed */
  isInstalled(toolId: string): boolean {
    return this.installed.has(toolId);
  }

  /** Get all installed tools */
  getInstalled(): InstalledTool[] {
    return Array.from(this.installed.values());
  }

  /** Register an executor for a tool */
  registerExecutor(toolId: string, executor: ToolExecutor): void {
    this.executors.set(toolId, executor);
  }

  /** Execute a tool */
  async execute(toolId: string, input: ToolInput): Promise<ToolOutput> {
    const executor = this.executors.get(toolId);
    if (!executor) {
      return {
        success: false,
        error: `No executor registered for tool "${toolId}". Install the tool and register its executor.`,
      };
    }

    const manifest = this.tools.get(toolId);
    if (!manifest) {
      return {
        success: false,
        error: `Tool "${toolId}" not found in registry.`,
      };
    }

    // Validate required parameters
    for (const param of manifest.parameters) {
      if (param.required && !(param.name in input)) {
        return {
          success: false,
          error: `Missing required parameter "${param.name}" for tool "${toolId}".`,
        };
      }
    }

    const startTime = Date.now();

    try {
      const result = await executor(input);
      const duration = Date.now() - startTime;

      return {
        ...result,
        meta: {
          ...result.meta,
          duration,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        meta: { duration: Date.now() - startTime },
      };
    }
  }
}

// ─── Harness Runtime ──────────────────────────────────────────────────────────

export class HarnessRuntime {
  private store: ToolStore;

  constructor(store: ToolStore) {
    this.store = store;
  }

  /** Execute a harness definition step by step */
  async run(harness: HarnessDefinition): Promise<HarnessRun> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const run: HarnessRun = {
      id: runId,
      harnessId: harness.id,
      status: "running",
      startedAt: new Date().toISOString(),
      steps: [],
      output: undefined,
    };

    const variables: Record<string, unknown> = {};

    for (const step of harness.steps) {
      const stepResult: HarnessStepResult = {
        stepId: step.id,
        toolId: step.toolId,
        status: "running",
        input: step.input,
        startedAt: new Date().toISOString(),
      };

      // Check skip condition
      if (step.skipIf && variables[step.skipIf]) {
        stepResult.status = "skipped";
        stepResult.completedAt = new Date().toISOString();
        run.steps.push(stepResult);
        continue;
      }

      try {
        const result = await this.store.execute(step.toolId, step.input);
        stepResult.output = result;
        stepResult.status = result.success ? "completed" : "failed";

        if (!result.success) {
          stepResult.error = result.error;
          run.status = "failed";
          run.error = `Step "${step.id}" failed: ${result.error}`;
          run.steps.push(stepResult);
          break;
        }

        // Store output in variable
        if (step.outputVar) {
          variables[step.outputVar] = result.data;
        }
      } catch (err) {
        stepResult.status = "failed";
        stepResult.error = err instanceof Error ? err.message : String(err);
        run.status = "failed";
        run.error = `Step "${step.id}" error: ${stepResult.error}`;
        run.steps.push(stepResult);
        break;
      }

      stepResult.completedAt = new Date().toISOString();
      run.steps.push(stepResult);
    }

    if (run.status === "running") {
      run.status = "completed";
      run.output = variables;
    }

    run.completedAt = new Date().toISOString();
    return run;
  }
}

// ─── Agent Runtime ────────────────────────────────────────────────────────────

export class AgentRuntime {
  private store: ToolStore;

  constructor(store: ToolStore) {
    this.store = store;
  }

  /** Execute an agent definition (simplified: linear flow only for now) */
  async run(
    agent: AgentDefinition,
    variables: Record<string, unknown> = {},
  ): Promise<{
    status: "completed" | "failed";
    outputs: Record<string, unknown>;
    steps: Array<{ nodeId: string; label: string; status: string; output?: unknown; error?: string }>;
  }> {
    const steps: Array<{ nodeId: string; label: string; status: string; output?: unknown; error?: string }> = [];
    const context = { ...variables };

    // Simple topological execution
    for (const node of agent.nodes) {
      const step: { nodeId: string; label: string; status: string; output?: unknown; error?: string } = { nodeId: node.id, label: node.label, status: "running" };

      try {
        switch (node.kind) {
          case "tool": {
            if (!node.toolId) {
              step.status = "failed";
              step.error = "No toolId specified";
              steps.push(step);
              return { status: "failed", outputs: context, steps };
            }

            // Bind inputs from context
            const input: ToolInput = {};
            for (const [key, ref] of Object.entries(node.inputs)) {
              input[key] = context[ref] ?? ref;
            }

            const result = await this.store.execute(node.toolId, input);
            step.output = result.data;
            step.status = result.success ? "completed" : "failed";
            if (!result.success) step.error = result.error;
            context[node.id] = result.data;
            break;
          }

          case "llm": {
            // For LLM nodes, we store the prompt for the orchestrator to handle
            step.output = {
              prompt: node.prompt,
              provider: node.llmProvider || agent.defaultLlmProvider || "local",
              variables: context,
            };
            step.status = "completed";
            context[node.id] = step.output;
            break;
          }

          case "condition": {
            step.status = "completed";
            step.output = { condition: node.condition, evaluated: true };
            context[node.id] = true;
            break;
          }

          case "output": {
            step.output = context;
            step.status = "completed";
            break;
          }

          default:
            step.status = "completed";
            step.output = null;
        }
      } catch (err) {
        step.status = "failed";
        step.error = err instanceof Error ? err.message : String(err);
        steps.push(step);
        return { status: "failed", outputs: context, steps };
      }

      steps.push(step);
    }

    return { status: "completed", outputs: context, steps };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/**
 * Built-in executors that ship with the store itself. Registered once when
 * the singleton store is created so these tools are executable immediately.
 */
const BUILTIN_EXECUTORS: Record<string, ToolExecutor> = {
  "chains.run": chainsRun,
  "chains.agent": chainsAgent,
  "graph.run": graphRun,
  "session.modules": sessionModules,
  "swarm.configure": swarmConfigure,
  "enterprise.project": enterpriseProject,
  "scheduler.jobs": schedulerJobs,
  "knowledge.search": knowledgeSearch,
  "notify.send": notifySend,
  "trace.runs": traceRuns,
  "approvals.gate": approvalsGate,
};

function registerBuiltins(store: ToolStore): void {
  for (const [id, executor] of Object.entries(BUILTIN_EXECUTORS)) {
    store.registerExecutor(id, executor);
  }
}

let _store: ToolStore | null = null;

export function getStore(): ToolStore {
  if (!_store) {
    _store = new ToolStore();
    registerBuiltins(_store);
  }
  return _store;
}

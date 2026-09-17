/**
 * stitaP Tool Store — Type Definitions
 *
 * Every tool is a self-contained module with:
 * - A manifest (metadata, parameters, capabilities)
 * - An execute function (runs the tool's logic)
 * - Optional UI component (for visual configuration)
 */

// ─── Tool Categories ──────────────────────────────────────────────────────────

export type ToolCategory =
  | "browser"       // Browser automation (click, type, scroll, navigate)
  | "capture"       // Screenshot and screen recording helpers
  | "video"         // Video editing and rendering tools
  | "audio"         // Audio synthesis and processing
  | "document"      // Documentation parsing and extraction
  | "llm"           // LLM prompt builders and response parsers
  | "visual"        // On-device image understanding (element detection, layout, colors)
  | "testing"       // Website testing, performance, accessibility, security, SEO
  | "design"        // Design system audit, colour, typography, spacing, component QA, code generation
  | "data"          // Data transformation and serialization
  | "security"      // Credential management and sanitization
  | "export"        // File format conversion and export
  | "agent"        // Agent orchestration, browser automation (Phase 2), edge deployment
  | "inference"     // Inference routing, model management, catalog
  | "analytics"     // Analytics engines (SQL, XQL, MDX), DuckDB-style columnar DB
  | "reports"       // Agent logs, LLM interaction reports, visual testing reports
  | "cloudflare-os" // Cloudflare OS edge deployment integration
  | "server"        // Legacy server detection
  | "ml"            // Machine learning models, training, prediction, clustering, llama.cpp build optimization, RAG deployment
  | "cfd"           // Computational fluid dynamics: mesh, Navier-Stokes solver, post-processing, benchmarking
  | "math"           // Engineering math: FEA, stress analysis, heat transfer, linear algebra, optimization
  | "fractal"        // Fractal analysis: Mandelbrot, Julia, Koch, Sierpinski, IFS, L-systems, dimension estimation
  | "chart"          // Graphs & visualization: 35+ chart types, recharts-compatible output
  | "office"         // Office alternatives: document, spreadsheet, presentation, PDF, email
  | "standards"      // ISO/QA standards: compliance audits, security, accessibility
  | "viking"         // OpenViking context store: tiered L0/L1/L2 storage, WebBuilder audit
  | "diagram"        // DiagramDesign: Mermaid diagrams, user journeys, component trees, data flows
  | "harness"        // CAR framework: governance, evaluation gates, spend rails, AGENTS.md
  | "ocr"             // OCR: text recognition (Tesseract, STR, Indic scripts, scene text)
  | "integrations"   // External integrations: database, email, SMS, payments, storage, maps, collaboration, hardware, OS
  | "ecommerce"      // E-commerce operations: customer service, orders, inventory, products, shipping, reviews, fraud
  | "microfinance"   // Microfinance & credit: ledger, EMI, collection routes, defaulter detection, PhonePe reconciliation
  | "finance-calc"   // Financial calculators: loan, SIP, FD, RD, tax, stamp duty, SWP, goal planning
  | "chitfund"       // Chit fund management: groups, bids, dividends, collections, compliance
  | "realestate"     // Real estate: projects, cost estimation, sales pipeline, CRM, compliance
  | "codegen"        // Code generation: language references (Python/Java/C++/C/JS/Rust), syntax validation, starter files, patterns

// ─── Tool Manifest ────────────────────────────────────────────────────────────

export type DesignSystem = "vercel" | "fluent" | "tasteskill" | "all";

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "enum";
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
  min?: number;
  max?: number;
  pattern?: string;
}

export interface ToolCapability {
  name: string;
  description: string;
  /** Whether this capability requires browser access */
  requiresBrowser: boolean;
  /** Whether this capability requires network access */
  requiresNetwork: boolean;
  /** Whether this capability works offline */
  offline: boolean;
}

export interface ToolManifest {
  /** Unique tool ID (e.g., "browser.click") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description */
  description: string;
  /** Longer description with examples */
  longDescription?: string;
  /** Tool category */
  category: ToolCategory;
  /** Subcategory for finer grouping */
  subcategory?: string;
  /** Version (semver) */
  version: string;
  /** Author */
  author: string;
  /** License */
  license: string;
  /** Tags for search */
  tags: string[];
  /** Icon name (lucide icon) */
  icon: string;
  /** Color theme for the tool card */
  color: string;
  /** Input parameters */
  parameters: ToolParameter[];
  /** What this tool can do */
  capabilities: ToolCapability[];
  /** Tools this tool depends on */
  dependencies?: string[];
  /** Whether this tool is installed by default */
  isDefault?: boolean;
  /** Download/install count */
  installs: number;
  /** Average rating (0-5) */
  rating: number;
  /** Number of ratings */
  ratingCount: number;
  /** Last updated timestamp */
  updatedAt: string;
  /** SLM-friendly: can this tool be used by SLMs directly */
  slmFriendly: boolean;
  /** LLM providers this tool works with (empty = any) */
  llmProviders?: string[];
}

// ─── Tool Execution ───────────────────────────────────────────────────────────

export interface ToolInput {
  [paramName: string]: unknown;
}

export interface ToolOutput {
  success: boolean;
  data?: unknown;
  error?: string;
  /** Output metadata */
  meta?: {
    duration?: number;
    bytesUsed?: number;
    filesCreated?: string[];
  };
}

export type ToolExecutor = (input: ToolInput) => Promise<ToolOutput>;

// ─── Installed Tool State ─────────────────────────────────────────────────────

export interface InstalledTool {
  manifest: ToolManifest;
  installedAt: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

// ─── Agent / Harness Types ────────────────────────────────────────────────────

export type AgentNodeKind =
  | "tool"       // Execute a tool
  | "llm"        // Call an LLM
  | "condition"  // Conditional branching
  | "loop"       // Loop over items
  | "parallel"   // Run steps in parallel
  | "output"     // Final output step
  | "input"      // User input step
  | "merge";     // Merge parallel branches

export interface AgentNode {
  id: string;
  kind: AgentNodeKind;
  label: string;
  /** For tool nodes: the tool ID */
  toolId?: string;
  /** For LLM nodes: the prompt template */
  prompt?: string;
  /** For LLM nodes: which provider to use */
  llmProvider?: string;
  /** For condition nodes: the condition expression */
  condition?: string;
  /** For loop nodes: the iterable expression */
  iterable?: string;
  /** Input parameter bindings */
  inputs: Record<string, string>;
  /** Position in the visual editor */
  position: { x: number; y: number };
}

export interface AgentEdge {
  id: string;
  source: string;
  target: string;
  /** Optional condition for this edge */
  condition?: string;
  label?: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  nodes: AgentNode[];
  edges: AgentEdge[];
  /** Default LLM provider for LLM nodes */
  defaultLlmProvider?: string;
  /** Agent-level variables */
  variables: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Harness Types ────────────────────────────────────────────────────────────

export interface HarnessStep {
  id: string;
  toolId: string;
  input: ToolInput;
  /** Variable name to store the output */
  outputVar?: string;
  /** Condition to skip this step */
  skipIf?: string;
}

export interface HarnessDefinition {
  id: string;
  name: string;
  description: string;
  steps: HarnessStep[];
  /** LLM provider for any LLM-driven steps */
  llmProvider?: string;
  /** Environment variables / secrets needed */
  envVars: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HarnessRun {
  id: string;
  harnessId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt?: string;
  steps: HarnessStepResult[];
  output?: unknown;
  error?: string;
}

export interface HarnessStepResult {
  stepId: string;
  toolId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  input: ToolInput;
  output?: ToolOutput;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ─── Store Types ──────────────────────────────────────────────────────────────

export interface StoreCategory {
  id: ToolCategory;
  name: string;
  description: string;
  icon: string;
  toolCount: number;
}

export interface StoreFilter {
  category?: ToolCategory;
  search?: string;
  sortBy?: "popular" | "rating" | "recent" | "name";
  slmFriendly?: boolean;
  offline?: boolean;
}

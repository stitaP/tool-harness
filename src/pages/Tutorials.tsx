import { useState } from "react";
import { Link } from "react-router";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import {
  BookOpen,
  Cpu,
  Bot,
  Database,
  Globe,
  Terminal,
  Zap,
  Shield,
  BarChart3,
  Brain,
  FileText,
  Play,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Settings,
  Layers,
  GitBranch,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";

/* ── Helpers ────────────────────────────────────────────────────────────── */

function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-zinc-800">
      {lang && (
        <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-1.5 text-xs font-medium text-zinc-400">
          {lang}
        </div>
      )}
      <pre className="overflow-x-auto bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-300">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Callout({
  type = "info",
  children,
}: {
  type?: "info" | "warning" | "success" | "tip";
  children: ReactNode;
}) {
  const styles = {
    info: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    success: "border-green-500/30 bg-green-500/10 text-green-300",
    tip: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  };
  return (
    <div className={`my-4 rounded-lg border-l-4 px-4 py-3 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative pl-12 pb-8 last:pb-0">
      <div className="absolute left-0 top-0 flex size-8 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-300">
        {number}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <div className="mt-2 text-sm leading-relaxed text-zinc-400">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Tutorial Categories ────────────────────────────────────────────────── */

interface TutorialCategory {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  tutorials: TutorialItem[];
}

interface TutorialItem {
  id: string;
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  duration: string;
  body: ReactNode;
}

const CATEGORIES: TutorialCategory[] = [
  // ─── SLM Tutorials ───────────────────────────────────────────
  {
    id: "slm",
    icon: Cpu,
    title: "Small Language Models (SLMs)",
    description:
      "Download, configure, quantize, and run small language models locally on any hardware.",
    tutorials: [
      {
        id: "slm-quickstart",
        title: "SLM Quickstart: Your First Local Model",
        difficulty: "beginner",
        duration: "10 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Run a small language model entirely on your machine. No API keys, no cloud, no data
              leaves your computer.
            </p>
            <Step number={1} title="Evaluate your hardware">
              <p>
                Open <code className="rounded bg-zinc-800 px-1.5 text-xs text-violet-300">/notebook</code>{" "}
                and click the gear icon. Click <strong>Evaluate Hardware</strong>. The device prober
                reads your RAM, CPU cores, and available backends (OpenVINO, llama.cpp, Vulkan, Metal)
                without admin rights.
              </p>
            </Step>
            <Step number={2} title="Pick a model family">
              <p>
                The wizard suggests models based on your hardware. For a first model, choose{" "}
                <strong>Qwen2.5-3B</strong> (ungated, no account needed) or{" "}
                <strong>SmolLM2-1.7B</strong> for very low RAM machines.
              </p>
            </Step>
            <Step number={3} title="Select quantization level">
              <p>
                The build planner shows memory estimates. For most machines, select{" "}
                <strong>Q4_K_M</strong> (sweet spot). For 4 GB machines, use <strong>IQ2_XS</strong>{" "}
                or <strong>BitNet b1.58</strong>.
              </p>
            </Step>
            <Step number={4} title="Download and start chatting">
              <p>
                Click Download. The model downloads in resumable chunks. After verification, select{" "}
                <strong>Chat</strong> mode and start typing.
              </p>
              <Code lang="bash">{`# Expected output:
# Model loaded: Qwen2.5-3B-Q4_K_M (1.8 GB)
# Backend: llama.cpp CPU (8 threads)
# Context: 4096 tokens
# Ready.`}</Code>
            </Step>
            <Callout type="tip">
              The SLM Minimal session preset keeps system prompts under 1K tokens, leaving maximum
              room for your conversation on small context windows.
            </Callout>
          </>
        ),
      },
      {
        id: "slm-quantization",
        title: "Understanding Quantization: 1-bit to 8-bit",
        difficulty: "intermediate",
        duration: "15 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Quantization stores model weights with fewer decimal digits, shrinking memory usage at a
              quality cost. Here is what each level means and when to use it.
            </p>
            <Code lang="text">{`Level        Bits/Weight   7B Model Size   Quality     When to Use
─────────────────────────────────────────────────────────────────
FP16         16            ~14 GB          Best        Server-class hardware
Q8_0          8            ~7 GB           Excellent   Good laptops (16+ GB)
Q4_K_M      ~4.8          ~4.5 GB         Very Good   Default choice
Q4_K_S      ~4.5          ~4.2 GB         Good        Tight memory
IQ3_XS      ~3.3          ~3.3 GB         Acceptable 8 GB laptops
IQ2_XS      ~2.3          ~2.3 GB         Basic       4 GB machines
BitNet b1.58  1.58        ~2.0 GB         Experimental Lowest RAM`}</Code>
            <Callout type="warning">
              Never requantize an already-quantized file. Always start from original FP16 weights.
              The compounding loss at sub-4-bit produces garbage.
            </Callout>
            <h4 className="mt-4 text-sm font-semibold text-white">How to create a custom quant</h4>
            <Code lang="bash">{`# 1. Start from original weights (never from an existing quant)
# 2. Build importance matrix with calibration text
# 3. Quantize with the matrix
# The platform downloader handles all of this automatically.`}</Code>
            <h4 className="mt-4 text-sm font-semibold text-white">Memory formula</h4>
            <Code lang="text">{`Total RAM = weights + KV cache + working space

7B model, 8K context:
  FP16:  14 GB + ~1.5 GB + overhead ≈ 16 GB
  Q8:     7 GB + ~1.5 GB + overhead ≈  9 GB
  Q4:     4 GB + ~1.5 GB + overhead ≈  6 GB
  b1.58:  2 GB + ~1.5 GB + overhead ≈  4 GB`}</Code>
          </>
        ),
      },
      {
        id: "slm-huggingface",
        title: "Downloading GGUF Models from Hugging Face",
        difficulty: "beginner",
        duration: "5 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              The platform downloads models from Hugging Face with resumable chunked transfers and
              SHA256 integrity verification.
            </p>
            <Step number={1} title="Get a Hugging Face token (for gated models)">
              <p>
                Create an account at huggingface.co → Settings → Access Tokens → Create new token
                (read access). For ungated models like Qwen2.5, no token is needed.
              </p>
            </Step>
            <Step number={2} title="Accept the license (for gated models)">
              <p>
                Visit the model page (e.g., meta-llama/Llama-3.2-3B) and click "Accept license".
                Wait for approval (usually instant).
              </p>
            </Step>
            <Step number={3} title="Paste the token in the Notebook">
              <p>
                The download panel accepts your token. Downloads use HTTP Range requests with parallel
                connections for speed, and resume automatically if interrupted.
              </p>
            </Step>
            <Callout type="info">
              Downloads are chunked and resumable. If your connection drops, the download picks up
              where it left off — no data is wasted.
            </Callout>
          </>
        ),
      },
      {
        id: "slm-free-providers",
        title: "Using Free API Providers (Groq, Cerebras, OpenRouter)",
        difficulty: "intermediate",
        duration: "10 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              When local hardware is limited, free cloud API providers offer access to larger models.
              The failover system automatically shifts between providers when one goes down.
            </p>
            <Code lang="text">{`Provider          RPM     Daily Tokens   Models
──────────────────────────────────────────────────
Groq              30      ~1M/day        Llama 3.2, Mixtral
Cerebras          30      ~1M/day        Llama 3.1, Gemma 2
OpenRouter Free   20      varies         20+ models
Google AI Studio  15      1M context     Gemini 1.5 Flash
GitHub Models     15      varies         GPT-4o free
Mistral Free      1       1 req/sec      Mistral Small
NVIDIA NIM        5       varies         Llama 3.1, Phi-3
Cohere            10      1K/day         Command R+`}</Code>
            <Step number={1} title="Add provider keys">
              <p>
                Open the Notebook → Free Provider panel. Paste API keys from any combination of
                providers. Each key is independent.
              </p>
            </Step>
            <Step number={2} title="The failover pool activates">
              <p>
                When a provider fails (rate limit, downtime, auth error), the router automatically
                shifts to the next available provider. Circuit breakers track failures and probe
                providers periodically to detect recovery.
              </p>
            </Step>
            <Callout type="tip">
              You can use multiple keys from the same provider. The system tracks per-key quotas
              separately and rotates between them.
            </Callout>
          </>
        ),
      },
      {
        id: "slm-throughput",
        title: "Optimizing SLM Throughput",
        difficulty: "advanced",
        duration: "20 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Throughput is determined by which kernel runs the math, not just bit count. Here is how
              to maximize tokens per second on your hardware.
            </p>
            <h4 className="mt-4 text-sm font-semibold text-white">
              Why FP16 sometimes beats quantized
            </h4>
            <ul className="mt-2 space-y-2 text-sm text-zinc-400">
              <li>
                <strong>Dequantization overhead:</strong> Quantized weights must be unpacked to
                floating point before multiplication. Without optimized kernels, this overhead
                negates the size savings.
              </li>
              <li>
                <strong>Native FP16 paths:</strong> Modern accelerators execute 16-bit floating
                point directly in hardware via CUDA, Metal, or OpenVINO. An FP16 small model rides
                these optimized kernels.
              </li>
              <li>
                <strong>Compute-bound vs memory-bound:</strong> Prefilling a long prompt is
                compute-heavy (FP16 wins); decoding one token at a time is memory-bound (quantization
                wins).
              </li>
            </ul>
            <Code lang="bash">{`# The router benchmarks automatically:
# 1. Probe all available backends
# 2. Run a short test with your workload
# 3. Cache results keyed to your device fingerprint
# 4. Pick the measured fastest backend`}</Code>
            <h4 className="mt-4 text-sm font-semibold text-white">Session tuning</h4>
            <ul className="mt-2 space-y-1 text-sm text-zinc-400">
              <li>• Enable KV-cache quantization (8-bit or 4-bit) for long sessions on tight RAM</li>
              <li>• Use speculative decoding for structured output (tool calls are low-entropy)</li>
              <li>• Pin threads to physical cores, never logical threads</li>
              <li>• Keep context windows short on tight machines</li>
            </ul>
          </>
        ),
      },
    ],
  },

  // ─── LLM Tutorials ───────────────────────────────────────────
  {
    id: "llm",
    icon: Brain,
    title: "Large Language Models (LLMs)",
    description:
      "Work with large models via API providers, configure multi-key authentication, and build agentic workflows.",
    tutorials: [
      {
        id: "llm-api-setup",
        title: "Setting Up API Keys for Cloud LLMs",
        difficulty: "beginner",
        duration: "5 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Use cloud API providers to access larger models (70B+) that cannot run locally. The
              platform supports OpenAI, Anthropic, Google, Mistral, and 9+ free providers.
            </p>
            <Step number={1} title="Choose your provider">
              <p>
                Navigate to the Notebook configuration. Select <strong>API Key Mode</strong> instead
                of Local Model. Choose from OpenAI, Anthropic, Google AI Studio, Mistral, Cohere, or
                any OpenAI-compatible endpoint.
              </p>
            </Step>
            <Step number={2} title="Enter your API key">
              <p>
                Paste your API key. The key is stored locally and never sent to any server except the
                provider's API. For OpenRouter, one key gives access to 20+ models from different
                providers.
              </p>
            </Step>
            <Step number={3} title="Configure the fallback chain">
              <p>
                Add multiple providers for automatic failover. When the primary provider hits rate
                limits or goes down, the router shifts to the next provider seamlessly.
              </p>
            </Step>
            <Callout type="warning">
              Never commit API keys to git. The platform stores keys in local storage only.
            </Callout>
          </>
        ),
      },
      {
        id: "llm-multi-agent",
        title: "Multi-Agent with Shared API Keys",
        difficulty: "advanced",
        duration: "15 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Run multiple agents with a single API key or distribute keys across agents. The key
              management system analyzes throughput and concurrency.
            </p>
            <h4 className="mt-4 text-sm font-semibold text-white">Single key for multiple agents</h4>
            <Code lang="text">{`# The platform calculates:
min(provider_RPM, provider_TPM) ÷ per_agent_demand = max_agents

Example with Groq (30 RPM, ~1M tokens/day):
  3 agents × 10 requests/min each = 30 RPM (at limit)
  Recommended: 2 agents with margin`}</Code>
            <h4 className="mt-4 text-sm font-semibold text-white">Multiple keys for parallel agents</h4>
            <Code lang="text">{`# With 2 Groq keys:
  60 RPM total → 3-5 agents comfortably

# With 1 key each from Groq + Cerebras + OpenRouter:
  80 RPM total → 5-7 agents with provider diversity`}</Code>
            <Callout type="tip">
              The provider-keys module analyzes min(RPM, TPM, concurrency) across all your keys and
              ranks configurations by maximum agent count.
            </Callout>
          </>
        ),
      },
      {
        id: "llm-chains",
        title: "Building LLM Chains and Pipelines",
        difficulty: "intermediate",
        duration: "15 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Chain multiple LLM calls together for complex workflows. Each step receives the output
              of the previous step.
            </p>
            <Code lang="typescript">{`import { getStore } from "@/lib/store";

const store = getStore();

// Simple chain: summarize → translate → format
const result = await store.execute("chains.run", {
  template: "Summarize {topic} in 3 bullet points",
  variables: { topic: "quantization" },
});

// Multi-step pipeline
const pipeline = await store.execute("chains.run", {
  steps: [
    { name: "extract", prompt: "Extract key facts from: {text}" },
    { name: "summarize", prompt: "Summarize: {extract}" },
    { name: "translate", prompt: "Translate to Spanish: {summarize}" },
  ],
  inputs: { text: "Long document text..." },
});`}</Code>
          </>
        ),
      },
      {
        id: "llm-reasoning",
        title: "Reasoning with Different Model Sizes",
        difficulty: "intermediate",
        duration: "10 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Model size directly affects reasoning depth. Here is how to choose the right model for
              different task complexities.
            </p>
            <Code lang="text">{`Task Complexity    Model Size    Example Tasks
──────────────────────────────────────────────────────────
Simple             1-3B          Classification, extraction,
                                tool calling, formatting

Moderate           3-7B          Summarization, Q&A,
                                code completion, translation

Complex            7-14B         Multi-step reasoning,
                                code generation, analysis

Advanced           14-70B+       Research, complex planning,
                                creative writing, Nuance`}</Code>
            <Callout type="tip">
              For agent swarms, use the largest model you can fit for the planner role, and smaller
              models for worker roles that do simpler tasks.
            </Callout>
          </>
        ),
      },
    ],
  },

  // ─── Analytics Engine Tutorials ──────────────────────────────
  {
    id: "analytics",
    icon: BarChart3,
    title: "Analytics & Query Engines",
    description:
      "Run SQL, XQL, and MDX queries against your data. Export results to PowerBI, Excel, Sheets, and Tableau.",
    tutorials: [
      {
        id: "analytics-sql",
        title: "SQL Queries with Window Functions",
        difficulty: "beginner",
        duration: "10 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              The in-browser SQL engine supports SELECT, JOIN, GROUP BY, window functions, and
              aggregates — all client-side with zero dependencies.
            </p>
            <Code lang="sql">{`-- Basic aggregation
SELECT department, SUM(amount) as total, COUNT(*) as orders
FROM sales
WHERE date >= '2024-01-01'
GROUP BY department
ORDER BY total DESC;

-- Window function: rank employees by sales per department
SELECT
  name,
  department,
  sales,
  ROW_NUMBER() OVER (PARTITION BY department ORDER BY sales DESC) as rank,
  LAG(sales) OVER (ORDER BY date) as prev_sales
FROM employee_sales;`}</Code>
            <Code lang="typescript">{`import { getStore } from "@/lib/store";
const store = getStore();

const result = await store.execute("analytics.sql", {
  query: "SELECT dept, SUM(amount) FROM sales GROUP BY dept",
});

// result.data.rows = [{ dept: "Engineering", amount: 45000 }, ...]`}</Code>
          </>
        ),
      },
      {
        id: "analytics-xql",
        title: "XQL: Hybrid SQL + JSON + Graph Queries",
        difficulty: "intermediate",
        duration: "15 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              XQL extends SQL with JSON path expressions, graph traversal, time-series windowing, and
              variable bindings.
            </p>
            <Code lang="xql">{`-- JSON path extraction
SELECT user.name, user.address.city
FROM users
WHERE user.age > 25;

-- Graph traversal: find all dependencies
GRAPH project_graph (start)-[:DEPENDS_ON]->(end)
SELECT start.name, end.name, EDGE.weight
WHERE start.name = 'auth-module';

-- Time-series windowing
SELECT
  TUMBLE(event_time, '5m') as window,
  COUNT(*) as events
FROM event_stream
GROUP BY window;

-- Variable bindings with LET
LET total := (SELECT SUM(amount) FROM sales);
SELECT name, amount / total * 100 as percentage
FROM sales;`}</Code>
          </>
        ),
      },
      {
        id: "analytics-mdx",
        title: "MDX: OLAP Queries for Business Intelligence",
        difficulty: "intermediate",
        duration: "15 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              MDX queries work with multidimensional data cubes for OLAP analysis — compatible with
              PowerBI, Excel, and Tableau syntax.
            </p>
            <Code lang="mdx">{`-- Cross-join dimensions
CROSSJOIN(
  [Date].[Year].Members,
  [Product].[Category].Members
)

-- Top 10 products by revenue
TOPCOUNT(
  [Product].[Product].Members,
  10,
  [Measures].[Revenue]
)

-- Calculated member
WITH MEMBER [Measures].[Profit Margin] AS
  ([Measures].[Revenue] - [Measures].[Cost]) / [Measures].[Revenue]

-- Filtered, ordered result
ORDER(
  FILTER(
    [Product].[Product].Members,
    [Measures].[Revenue] > 1000
  ),
  [Measures].[Profit Margin],
  BDESC
)`}</Code>
          </>
        ),
      },
      {
        id: "analytics-export",
        title: "Exporting to PowerBI, Excel, Sheets, Tableau",
        difficulty: "beginner",
        duration: "5 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Export query results to any reporting platform. Each export produces a platform-specific
              file with metadata, formulas, or typed schemas.
            </p>
            <Code lang="typescript">{`import { getStore } from "@/lib/store";
const store = getStore();

// Run a query first
await store.execute("analytics.sql", {
  query: "SELECT dept, SUM(amount) as total FROM sales GROUP BY dept",
});

// Export to Power BI (CSV + auto-generated DAX measures)
const pbi = await store.execute("analytics.export_powerbi", {
  tableName: "result",
});
// → produces CSV with DAX templates for SUM, AVERAGE, etc.

// Export to Excel (XML Spreadsheet with styles)
const xlsx = await store.execute("analytics.export_excel", {
  tableName: "result",
  format: "xml", // or "csv"
});

// Export to Google Sheets (CSV + auto-generated formulas)
const sheets = await store.execute("analytics.export_sheets", {
  tableName: "result",
});

// Export to Tableau (TSV + .twb workbook manifest)
const twb = await store.execute("analytics.export_tableau", {
  tableName: "result",
});`}</Code>
            <Callout type="info">
              Each export includes a metadata header describing the schema, column types, and
              recommended chart types for the data.
            </Callout>
          </>
        ),
      },
      {
        id: "analytics-rust",
        title: "Rust WASM Analytical Engine",
        difficulty: "advanced",
        duration: "20 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              For high-performance queries, the Rust WASM engine provides SIMD-accelerated
              aggregation with graceful fallback to TypeScript.
            </p>
            <Code lang="typescript">{`import {
  initRustEngine,
  getEngineStatus,
  executeRustQuery,
} from "@/lib/analytics/rust-engine";

// Initialize (auto-detects WASM + SIMD support)
await initRustEngine({ maxMemory: 512 * 1024 * 1024 });

// Check what's available
const status = getEngineStatus();
console.log(status.wasmAvailable);   // true when WASM loaded
console.log(status.simdSupported);   // true when SIMD detected
console.log(status.backend);         // "rust-wasm" or "typescript-fallback"

// Execute query (auto-fallbacks if WASM unavailable)
const result = executeRustQuery(
  "SELECT department, AVG(salary) FROM employees GROUP BY department",
  tables,
);
console.log(result.meta.engine); // "rust-wasm" or "typescript-fallback"`}</Code>
          </>
        ),
      },
    ],
  },

  // ─── Agent Tutorials ─────────────────────────────────────────
  {
    id: "agents",
    icon: Bot,
    title: "Agent Platform",
    description:
      "Configure agents, build swarms, set up knowledge bases, and run governed multi-day projects.",
    tutorials: [
      {
        id: "agent-config",
        title: "Configuring Your First Agent",
        difficulty: "beginner",
        duration: "10 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Define agents with roles, tools, knowledge scope, and operating principles at{" "}
              <code className="rounded bg-zinc-800 px-1.5 text-xs text-violet-300">/agent-config</code>.
            </p>
            <Step number={1} title="Choose a template or start from scratch">
              <p>
                Six pre-configured templates: Data Analyst, Code Reviewer, Web Scraper, Test Runner,
                Document Writer, Security Auditor. Each comes with suggested tools and a role
                description.
              </p>
            </Step>
            <Step number={2} title="Assign tools">
              <p>
                Browse the full tool registry with category filtering. Toggle tools on/off for the
                agent. Selected tools appear as removable chips. The agent can only use tools you
                explicitly grant.
              </p>
            </Step>
            <Step number={3} title="Load knowledge documents">
              <p>
                Add PDFs, URLs, or text content as the agent's knowledge scope. Toggle "Confine to
                provided docs" to prevent the agent from browsing the internet.
              </p>
            </Step>
            <Step number={4} title="Set operating principles">
              <p>
                Choose from 10 preset principles: "Always verify results", "Prefer read-only
                operations", "Log all tool invocations", "Respect rate limits", etc.
              </p>
            </Step>
          </>
        ),
      },
      {
        id: "agent-swarm",
        title: "Building a Multi-Agent Swarm",
        difficulty: "intermediate",
        duration: "20 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              A swarm divides work among role-playing agents. The coordinator manages task
              distribution, and workers collaborate through a shared blackboard.
            </p>
            <Code lang="typescript">{`// The swarm sizer calculates optimal worker count
// based on your hardware:
const spec = {
  ramGB: 16,
  physicalCores: 8,
  modelParams: "3B",
  bitsPerWeight: 4.8,
};

// Result:
// "Recommended: 3 workers sharing one model instance"
// "Reason: 3 × 1.8 GB = 5.4 GB + 2 GB headroom = fits in 16 GB"`}</Code>
            <h4 className="mt-4 text-sm font-semibold text-white">Five swarm topologies</h4>
            <ul className="mt-2 space-y-1 text-sm text-zinc-400">
              <li>
                <strong>Hierarchical:</strong> Coordinator fans out tasks — best for planning-heavy
                projects
              </li>
              <li>
                <strong>Pipeline:</strong> Planner → Coder → Tester → Documenter — best for linear
                workflows
              </li>
              <li>
                <strong>Mesh:</strong> Peer review between all workers
              </li>
              <li>
                <strong>Ring:</strong> Round-robin critique
              </li>
              <li>
                <strong>Star:</strong> Hub consolidation for diverse tasks
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "agent-knowledge",
        title: "Knowledge Base: RAG for Your Documents",
        difficulty: "intermediate",
        duration: "10 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              The knowledge base provides local RAG (Retrieval-Augmented Generation) — chunk your
              documents, retrieve relevant passages, and inject them into the agent's context within
              token budgets.
            </p>
            <Code lang="typescript">{`// Ingest documents
await store.execute("agent.knowledge", {
  action: "ingest",
  documents: [
    { type: "pdf", path: "./docs/api-reference.pdf" },
    { type: "url", url: "https://example.com/help" },
    { type: "text", content: "Company policy text..." },
  ],
});

// Build context for a query
const context = await store.execute("agent.knowledge", {
  action: "buildContext",
  query: "What is the refund policy?",
  maxTokens: 500, // respects your budget
});
// → Returns the most relevant passages, scored by similarity`}</Code>
          </>
        ),
      },
      {
        id: "agent-memory",
        title: "Agent Memory: Cross-Session Learning",
        difficulty: "intermediate",
        duration: "10 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Agent memory persists decisions, preferences, and learned patterns across sessions.
              Memory entries are scored by importance, confidence decay, and freshness.
            </p>
            <Code lang="typescript">{`// Query past memories
const memories = await store.execute("agent.memory", {
  action: "query",
  type: "workflow",
  search: "data analysis pipeline",
  minImportance: 5,
});
// → Returns relevant past patterns ranked by
//   importance × confidence × freshness

// Memory types:
// - skill: learned procedures from completed tasks
// - workflow: recurring task sequences
// - fact: learned facts (e.g., "user prefers SQL over XQL")
// - user: user preferences and tool choices`}</Code>
          </>
        ),
      },
      {
        id: "agent-governed",
        title: "Running Governed Multi-Day Projects",
        difficulty: "advanced",
        duration: "30 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Governed projects execute planned work over days or weeks, with checkpoints, approval
              gates, git commits, and Jira ticket updates.
            </p>
            <Step number={1} title="Load guideline packs">
              <p>
                Prepare your company standards as sections (coding rules, testing requirements,
                security constraints). Each role receives only its relevant sections within token
                caps.
              </p>
            </Step>
            <Step number={2} title="Describe the project goal">
              <p>
                Enter the migration or feature goal. The planner decomposes it into dependency-ordered
                user stories with acceptance criteria.
              </p>
            </Step>
            <Step number={3} title="Approve the plan">
              <p>
                Review stories, edit criteria while cheap. Approval commits the plan to git and opens
                an epic Jira ticket.
              </p>
            </Step>
            <Step number={4} title="Let it run">
              <p>
                Stories move through develop → test → document → verify. Checkpoints persist after
                every phase. Verification gates demand evidence before closing.
              </p>
            </Step>
            <Callout type="warning">
              Stories only reach "verified" when every declared use-case has recorded passing
              evidence. This is the difference between agents that claim done and teams that prove
              it.
            </Callout>
          </>
        ),
      },
      {
        id: "agent-jira-git",
        title: "Jira and Git Integration for Agents",
        difficulty: "intermediate",
        duration: "15 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Agents can update Jira tickets, commit to git, and sync with GitHub/GitLab — all
              configurable per project.
            </p>
            <Code lang="typescript">{`// Configure git and Jira for agent runs
const runner = new LongRunningRunner(project, pack, {
  gitCommit: (msg, files) => github.commit(msg, files),
  createTicket: (title, body) => jira.create(title, body),
  updateTicket: (ticketId, comment) =>
    jira.addComment(ticketId, comment),
});

// Internal-first git sync (optional)
// Agents commit locally first, push to remote only
// when explicitly approved`}</Code>
            <Callout type="info">
              Every agent check-in need not be part of GitHub or GitLab. Internal and external git
              synchronization happens based on your preferences only.
            </Callout>
          </>
        ),
      },
      {
        id: "agent-auto-testing",
        title: "Automatic Testing with Help Documents",
        difficulty: "advanced",
        duration: "25 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Replace manual QA with agent-driven automatic testing that reads your help
              documents, knowledge base, and specifications to generate, execute, and verify
              test cases — no human intervention required.
            </p>
            <Callout type="success">
              The same documents that explain your product to users become the ground truth
              agents test against. One source of truth, zero manual test-case authoring.
            </Callout>
            <Step number={1} title="Load help documents into the knowledge base">
              <p>
                Upload your product documentation, API references, user guides, help center
                articles, and acceptance criteria as knowledge documents in the Agent
                Configuration page. The knowledge base indexes and chunks them with
                deterministic embeddings for retrieval.
              </p>
              <Code lang="typescript">{`// Ingest help docs as the agent's testing ground truth
await store.execute("agent.knowledge", {
  action: "ingest",
  documents: [
    { type: "url", url: "https://docs.example.com/api-ref" },
    { type: "pdf", path: "./help/user-guide.pdf" },
    { type: "text", content: "AC-1: Login flow must..." },
  ],
});`}</Code>
            </Step>
            <Step number={2} title="Configure a Test Runner agent">
              <p>
                At <code className="rounded bg-zinc-800 px-1.5 text-xs text-violet-300">/agent-config</code>,
                select the <strong>Test Runner</strong> template. Grant it the browser automation tools
                (navigate, click, type, screenshot, extract), the sandbox tools (execute code),
                and the knowledge.search tool. Set "Confine to provided docs" so it only tests
                against your documented behavior.
              </p>
            </Step>
            <Step number={3} title="Define the test scope with the knowledge selector">
              <p>
                Use the checkboxes in the Knowledge Management section to select which help
                documents define the test scope. Check the "Browse Internet" box to <em>uncheck</em> it —
                the agent should only test documented behavior, not discover new features
                at runtime.
              </p>
            </Step>
            <Step number={4} title="The agent generates and runs tests automatically">
              <p>
                When assigned a task, the agent:
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-400">
                <li>
                  <strong>Reads</strong> each help document section to extract expected behaviors
                </li>
                <li>
                  <strong>Generates</strong> browser automation steps from the documented flows
                </li>
                <li>
                  <strong>Executes</strong> each step in a sandboxed browser session with timeouts
                </li>
                <li>
                  <strong>Captures</strong> screenshots at each verification point
                </li>
                <li>
                  <strong>Compares</strong> actual vs. documented behavior using LLM evaluation
                </li>
                <li>
                  <strong>Reports</strong> pass/fail with evidence to the Reports page
                </li>
              </ul>
              <Code lang="typescript">{`// The agent reads the help doc and auto-generates:
// 1. "Navigate to /login" (from help doc Section 3.1)
// 2. "Type email into #email" (from help doc: 'Enter your email')
// 3. "Type password into #password"
// 4. "Click the Submit button" (from help doc: 'Click Submit to sign in')
// 5. "Assert dashboard loads" (from help doc: 'You will see the dashboard')
// 6. "Screenshot the result for evidence"

const result = await store.execute("browser.navigate", {
  sessionId,
  url: "https://app.example.com/login",
});`}</Code>
            </Step>
            <Step number={5} title="Review automated test reports">
              <p>
                All test runs appear on the Reports page with full traces. Each test
                includes the source document section, the generated steps, the browser
                interaction log, screenshots, and pass/fail verdict with reasoning.
              </p>
            </Step>
            <Callout type="tip">
              For the governed runner, add a verification gate that requires the Test Runner
              agent to complete before any story can close. This replaces manual QA sign-off
              with evidence-backed automated verification.
            </Callout>
            <h4 className="mt-6 text-sm font-semibold text-white">
              Document types the agent can test against
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-zinc-400">
              <li>• <strong>API references:</strong> Endpoint docs → generates HTTP request + response assertion tests</li>
              <li>• <strong>User guides:</strong> Step-by-step tutorials → generates browser navigation + interaction tests</li>
              <li>• <strong>Help center articles:</strong> FAQ answers → generates Q&A verification tests</li>
              <li>• <strong>Release notes:</strong> Feature announcements → generates smoke tests for new features</li>
              <li>• <strong>Acceptance criteria:</strong> User stories → generates end-to-end verification tests</li>
            </ul>
          </>
        ),
      },
      {
        id: "agent-sandbox-dev",
        title: "Using Sandboxes to Secure Code Development",
        difficulty: "advanced",
        duration: "20 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Sandboxes isolate untrusted code execution from your host system. Agents
              running code-generating tasks — refactoring, migrations, test execution,
              dependency updates — execute inside Web Worker sandboxes with strict resource
              limits and network policies.
            </p>
            <Callout type="warning">
              Never let an agent execute generated code directly on your machine. Sandboxes
              provide the isolation boundary between agent-generated code and your
              production environment.
            </Callout>
            <h4 className="mt-4 text-sm font-semibold text-white">
              Four isolation axes
            </h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                {
                  axis: "Execution",
                  desc: "Web Worker with no DOM, no " + "node:fs" + ", no child_process. Code runs in a sandboxed thread.",
                },
                {
                  axis: "Network",
                  desc: "Glob-based allow/block lists. Default: deny-all outbound. Agents must declare every external host.",
                },
                {
                  axis: "File System",
                  desc: "In-memory virtual FS. Agents see /sandbox/* only. No host path access unless explicitly mounted.",
                },
                {
                  axis: "Resources",
                  desc: "Wall-clock timeout, memory cap, CPU throttle. A 10-second timeout kills any infinite loop.",
                },
              ].map(({ axis, desc }) => (
                <div
                  key={axis}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
                >
                  <p className="text-xs font-semibold text-violet-300">{axis}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{desc}</p>
                </div>
              ))}
            </div>
            <Step number={1} title="Create a sandboxed code execution environment">
              <p>
                The sandbox system provides prebuilt scenarios or lets you create custom ones.
                Each scenario defines the isolation level, resource limits, and allowed tools.
              </p>
              <Code lang="typescript">{`import { getScenarioManager } from "@/lib/sandbox";

// Create from a prebuilt scenario
const sbx = await getScenarioManager().createFromScenario("unit-test-runner");

// Or create a custom sandbox for code development
const customSbx = await sbx.withNetworkPolicy({
  allow: ["registry.npmjs.org/*", "api.github.com/*"],
  block: ["*.internal.corp/*", "0.0.0.0/*"],
});

// Set resource limits
const limitedSbx = await customSbx.execute(code, {
  timeoutMs: 30_000,        // 30s wall clock
  maxMemoryMB: 512,         // 512 MB memory cap
});`}</Code>
            </Step>
            <Step number={2} title="Agent writes code inside the sandbox">
              <p>
                When an agent generates code (refactoring, migration scripts, test code),
                it executes in the sandbox first. The sandbox validates the code compiles,
                passes basic checks, and produces expected output before any host-side
                effects occur.
              </p>
              <Code lang="typescript">{`// Agent generates a migration script
const agentCode = """
  function migrateUsers(users) {
    return users.map(u => ({
      ...u,
      email: u.email.toLowerCase(),
      migratedAt: new Date().toISOString(),
    }));
  }
  module.exports = { migrateUsers };
""";

// Execute in sandbox — never on host
const result = await sandboxManager.execute(agentCode, {
  timeoutMs: 10_000,
  maxMemoryMB: 128,
});

// result.output = { success: true, returnValue: [...] }
// Only AFTER sandbox verification does the agent commit to git`}</Code>
            </Step>
            <Step number={3} title="Snapshot and restore for iterative development">
              <p>
                Sandboxes support snapshots — save the state at any point and restore it
                for iterative development. The agent can try a refactoring, snapshot, try
                another approach, and roll back if the second attempt fails.
              </p>
              <Code lang="typescript">{`// Save a clean state before experimenting
await sandboxManager.snapshot("pre-refactor");

// Agent attempts refactoring A
await sandboxManager.execute(refactorA, { timeoutMs: 10_000 });
if (!result.success) {
  // Roll back and try approach B
  await sandboxManager.restore("pre-refactor");
  await sandboxManager.execute(refactorB, { timeoutMs: 10_000 });
}`}</Code>
            </Step>
            <Step number={4} title="Network policy prevents data exfiltration">
              <p>
                Sandbox network policies ensure agent-generated code cannot phone home,
                exfiltrate data, or connect to unauthorized services. Every outbound
                connection is gated by the glob allow-list.</p>
              <Code lang="typescript">{`// Tight network policy for code execution
const secureSbx = await sbx.withNetworkPolicy({
  allow: [
    "registry.npmjs.org/*",   // package downloads
    "api.github.com/*",        // git operations
    "raw.githubusercontent.com/*" // config fetches
  ],
  block: [
    "*",  // deny everything else by default
  ],
});`}</Code>
            </Step>
            <Step number={5} title="Prebuilt sandbox scenarios for code development">
              <p>
                The sandbox system includes scenarios calibrated for different development
                tasks. Each scenario pre-configures isolation level, memory, timeout, and
                network policy.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { name: "unit-test-runner", desc: "Fast isolated test execution" },
                  { name: "e2e-test", desc: "Browser + server integration tests" },
                  { name: "security-audit", desc: "Code scanning with no outbound" },
                  { name: "untrusted-code", desc: "Maximum isolation, minimal perms" },
                  { name: "production-sim", desc: "Simulated prod environment" },
                  { name: "stress-test", desc: "High CPU/memory for load tests" },
                  { name: "regression", desc: "Full regression suite execution" },
                  { name: "benchmark", desc: "Performance measurement runs" },
                ].map(({ name, desc }) => (
                  <div
                    key={name}
                    className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2"
                  >
                    <p className="text-xs font-medium text-white">{name}</p>
                    <p className="text-[11px] text-zinc-500">{desc}</p>
                  </div>
                ))}
              </div>
            </Step>
            <Callout type="tip">
              Combine sandboxed code execution with the governed runner's verification gate:
              stories only close when generated code passes in the sandbox AND the
              verification gate confirms evidence. This two-layer approach prevents both
              "it works on my machine" and "the agent said it was done" failure modes.
            </Callout>
          </>
        ),
      },
    ],
  },

  // ─── Browser Automation Tutorials ────────────────────────────
  {
    id: "browser",
    icon: Globe,
    title: "Browser Automation",
    description:
      "Automate web interactions with 15+ browser actions, build scraping pipelines, and handle authentication flows.",
    tutorials: [
      {
        id: "browser-basics",
        title: "Browser Automation Basics",
        difficulty: "beginner",
        duration: "10 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              The browser automation engine runs in a sandboxed iframe and communicates via
              postMessage. It supports 15+ actions for web interaction.
            </p>
            <Code lang="typescript">{`import { getStore } from "@/lib/store";
const store = getStore();

// Create a browser session
const session = await store.execute("browser.create", {});

// Navigate to a page
await store.execute("browser.navigate", {
  sessionId: session.data.id,
  url: "https://example.com",
});

// Click an element
await store.execute("browser.click", {
  sessionId: session.data.id,
  selector: "button.submit",
});

// Extract text
const text = await store.execute("browser.extract", {
  sessionId: session.data.id,
  selector: ".content h1",
});

// Take a screenshot
const screenshot = await store.execute("browser.screenshot", {
  sessionId: session.data.id,
  format: "png",
});`}</Code>
            <h4 className="mt-4 text-sm font-semibold text-white">Available actions</h4>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-zinc-400 sm:grid-cols-3">
              {[
                "navigate",
                "click",
                "type",
                "hover",
                "select",
                "scroll",
                "screenshot",
                "extract",
                "execute",
                "evaluate",
                "wait",
                "cookie_set",
                "cookie_get",
                "auth",
                "pdf",
              ].map((a) => (
                <span key={a} className="rounded bg-zinc-800 px-2 py-1">
                  {a}
                </span>
              ))}
            </div>
          </>
        ),
      },
      {
        id: "browser-pipeline",
        title: "Building Scraping Pipelines",
        difficulty: "intermediate",
        duration: "15 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Chain browser actions into sequential pipelines with retries, abort/skip strategies,
              and failure handling.
            </p>
            <Code lang="typescript">{`import { executePipeline } from "@/lib/agent/browser-automation";

const result = await executePipeline(sessionId, {
  id: "scrape-products",
  name: "Scrape product catalog",
  steps: [
    {
      id: "nav",
      action: { type: "navigate", url: "https://shop.example.com" },
      description: "Load the product catalog",
    },
    {
      id: "wait",
      action: { type: "wait", selector: ".product-grid", timeout: 5000 },
      description: "Wait for products to load",
    },
    {
      id: "extract",
      action: { type: "extract", selector: ".product-card" },
      description: "Extract all product cards",
    },
    {
      id: "scroll",
      action: { type: "scroll", direction: "down", amount: 1000 },
      description: "Scroll to load more products",
    },
  ],
  onFailure: "retry", // "abort" | "skip" | "retry"
});`}</Code>
          </>
        ),
      },
    ],
  },

  // ─── Reporting & Monitoring Tutorials ────────────────────────
  {
    id: "reporting",
    icon: FileText,
    title: "Reports & Monitoring",
    description:
      "View agent interaction logs, monitor token usage, and analyze agent performance through the Reports dashboard.",
    tutorials: [
      {
        id: "reports-overview",
        title: "Understanding the Reports Dashboard",
        difficulty: "beginner",
        duration: "5 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              The Reports page at{" "}
              <code className="rounded bg-zinc-800 px-1.5 text-xs text-violet-300">/reports</code>{" "}
              shows all agent interactions with markdown-rendered views, metrics, and raw JSON.
            </p>
            <h4 className="mt-4 text-sm font-semibold text-white">Report types</h4>
            <ul className="mt-2 space-y-1 text-sm text-zinc-400">
              <li>
                <strong>Agent Run:</strong> Step-by-step execution log with tool calls, timing, and
                status
              </li>
              <li>
                <strong>LLM Interaction:</strong> Prompt/response pairs with token usage and model
                info
              </li>
              <li>
                <strong>Tool Execution:</strong> Input/output for each tool invocation with duration
              </li>
              <li>
                <strong>Browser Session:</strong> Navigation, clicks, screenshots, and errors
              </li>
              <li>
                <strong>Analytics Query:</strong> SQL/XQL/MDX queries with result sets and timing
              </li>
            </ul>
            <p className="mt-3 text-sm text-zinc-400">
              Filter by type, status, date range, or source agent. Toggle between markdown view,
              metrics dashboard, and raw JSON.
            </p>
          </>
        ),
      },
      {
        id: "reports-fractal",
        title: "Fractal Graph Visualization of Agent Interactions",
        difficulty: "advanced",
        duration: "20 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              The fractal graph engine at{" "}
              <code className="rounded bg-zinc-800 px-1.5 text-xs text-violet-300">/playground</code>{" "}
              visualizes agent interactions, tool chains, and project structures with noise detection
              using fractal geometry.
            </p>
            <h4 className="mt-4 text-sm font-semibold text-white">Layout algorithms</h4>
            <ul className="mt-2 space-y-1 text-sm text-zinc-400">
              <li>
                <strong>Fractal Tree (L-system):</strong> Agents become branches, tools become leaves.
                Branch angle encodes hierarchy level.
              </li>
              <li>
                <strong>Force-Directed:</strong> Nodes attract/repel based on fractal distance.
                Same-depth nodes cluster together.
              </li>
              <li>
                <strong>Hilbert Curve:</strong> Maps 1D data to 2D with spatial locality. Best for
                large datasets.
              </li>
              <li>
                <strong>Radial:</strong> Root at center, children in concentric rings by depth.
              </li>
            </ul>
            <h4 className="mt-4 text-sm font-semibold text-white">Noise detection</h4>
            <p className="mt-2 text-sm text-zinc-400">
              Three mathematical methods identify noise in agent interaction graphs: fractal dimension
              (box-counting), Hurst exponent (rescaled range analysis), and cluster coherence per
              depth level.
            </p>
          </>
        ),
      },
    ],
  },

  // ─── OS & Deployment Tutorials ──────────────────────────────
  {
    id: "deployment",
    icon: Layers,
    title: "Deployment & Edge Computing",
    description:
      "Deploy agents to Cloudflare Workers, configure edge infrastructure, and build with the Cloudflare OS integration.",
    tutorials: [
      {
        id: "cloudflare-deploy",
        title: "Deploying Agents to Cloudflare Edge",
        difficulty: "advanced",
        duration: "20 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Deploy agents as Cloudflare Workers with D1, KV, R2, Durable Objects, Queues, and AI
              Gateway for global low-latency execution.
            </p>
            <Code lang="typescript">{`import { generateWranglerConfig, generateD1Schema } from "@/lib/agent/cloudflare-os";

// Generate wrangler.toml for edge deployment
const config = generateWranglerConfig({
  workerName: "stitap-agent",
  kvNamespace: "kv-namespace-id",
  r2Bucket: "stitap-artifacts",
  d1Database: "d1-database-id",
  queueName: "agent-tasks",
});

// Generate D1 SQL schema
const schema = generateD1Schema();
// Creates: agents, agent_runs, tool_executions,
//          analytics_queries, agent_sessions, files`}</Code>
            <h4 className="mt-4 text-sm font-semibold text-white">Edge use cases</h4>
            <ul className="mt-2 space-y-1 text-sm text-zinc-400">
              <li>• Edge Agent Deployment: &lt;50ms response with Durable Objects</li>
              <li>• Multi-Tenant Isolation: Worker + D1 per tenant</li>
              <li>• Distributed Coordination: Workers + Queues + Durable Objects</li>
              <li>• Real-Time Monitoring: Workers + Analytics Engine + R2</li>
              <li>• Scheduled Execution: Cron Triggers + Workers + D1</li>
              <li>• LLM Caching: AI Gateway + Workers + KV</li>
            </ul>
          </>
        ),
      },
      {
        id: "rust-engine",
        title: "Building the Rust Analytical Engine",
        difficulty: "advanced",
        duration: "25 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              The Rust analytical engine compiles to WASM for high-performance queries with SIMD
              acceleration. It falls back to the TypeScript engine when WASM is unavailable.
            </p>
            <Code lang="bash">{`# Build the Rust engine to WASM
cd engines/rust-engine
wasm-pack build --target web --release

# The output goes to:
# src/lib/analytics/rust-engine.wasm

# Features:
# - SIMD-accelerated aggregation
# - Parallel execution on multiple threads
# - Arrow IPC format support
# - Parquet file reading
# - Graceful fallback to TypeScript`}</Code>
            <Callout type="tip">
              The Rust engine is optional. The TypeScript engine provides identical query semantics
              with slightly lower throughput. The platform auto-detects WASM support and falls back
              transparently.
            </Callout>
          </>
        ),
      },
    ],
  },

  // ─── Security & Sandboxing Tutorials ─────────────────────────
  {
    id: "security",
    icon: Shield,
    title: "Security & Sandboxing",
    description:
      "Isolate untrusted code, configure network policies, manage permissions, and audit agent actions.",
    tutorials: [
      {
        id: "sandbox-basics",
        title: "Running Untrusted Code in Sandboxes",
        difficulty: "intermediate",
        duration: "10 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Sandboxes combine four isolation axes: Web Worker execution, network policy, virtual
              file system, and resource limits.
            </p>
            <Code lang="typescript">{`import { getScenarioManager } from "@/lib/sandbox";

// Create from a prebuilt scenario
const sbx = await getScenarioManager().createFromScenario("security-audit");

// Execute untrusted code with limits
const result = await sbx.execute(untrustedSnippet, {
  timeoutMs: 10_000,       // wall-clock limit
  maxMemoryMB: 256,        // memory limit
});

// Snapshot and restore
await sbx.snapshot("before-experiment");
// ... make changes ...
await sbx.restore("before-experiment");

// Network policy: glob allow/block lists
const sbx2 = await sbx.withNetworkPolicy({
  allow: ["api.example.com/*"],
  block: ["*.internal.corp/*"],
});`}</Code>
            <h4 className="mt-4 text-sm font-semibold text-white">11 prebuilt scenarios</h4>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-zinc-400">
              {[
                "unit-test-runner",
                "e2e-test",
                "production-sim",
                "security-audit",
                "untrusted-code",
                "stress-test",
                "demo",
                "tutorial",
                "regression",
                "benchmark",
                "chaos",
              ].map((s) => (
                <li key={s} className="rounded bg-zinc-800 px-2 py-1">
                  {s}
                </li>
              ))}
            </ul>
          </>
        ),
      },
    ],
  },
  // ─── CFD / Engineering Tutorials ────────────────────────────
  {
    id: "cfd",
    icon: Waves,
    title: "Computational Fluid Dynamics & Engineering",
    description:
      "Run Navier-Stokes solvers, thermal analysis, and pipe flow simulations — all in-browser.",
    tutorials: [
      {
        id: "pipeflow-quickstart",
        title: "Pipe Flow Demo: Hot Sun Thermal Analysis",
        difficulty: "beginner",
        duration: "3 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              See how water temperature and velocity change inside a pipe sitting under
              a hot sun. Enter your parameters, and the solver returns full contour plots,
              centerline profiles, and radial distributions — no equations needed.
            </p>
            <Step number={1} title="Open the Pipe Flow demo">
              <p>
                Navigate to <code className="rounded bg-zinc-800 px-1.5 text-xs text-violet-300">/pipeflow</code>{" "}
                from the navigation menu, or click <strong>Try Demo</strong> on the
                Thermal Convection tool card in the Tools store.
              </p>
            </Step>
            <Step number={2} title="Set your conditions">
              <p>
                Adjust three inputs:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                <li>☀️ <strong>Ambient Temperature</strong> — how hot the sun is (default: 58 °C)</li>
                <li>💧 <strong>Flow Rate</strong> — water entering the pipe (default: 60 LPM)</li>
                <li>🔧 <strong>Pipe Diameter</strong> — inner diameter (default: 2 ft)</li>
              </ul>
            </Step>
            <Step number={3} title="View the results">
              <p>
                The solver runs instantly. You get:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                <li>• <strong>Velocity contour</strong> — jet-colourmap showing the parabolic profile developing along the pipe</li>
                <li>• <strong>Temperature contour</strong> — coolwarm colormap showing the water heating from the sun</li>
                <li>• <strong>Centreline temperature</strong> — how the average water temperature rises from inlet to outlet</li>
                <li>• <strong>Centreline velocity</strong> — axial velocity profile along the pipe</li>
                <li>• <strong>Radial profiles</strong> at inlet, mid-pipe, and outlet for both temperature and velocity</li>
                <li>• <strong>Key metrics</strong> — Reynolds number, Nusselt number, pressure drop, heat gain, etc.</li>
              </ul>
            </Step>
            <Callout type="tip">
              Behind the scenes the agent picks the right solver (coupled momentum + energy,
              axisymmetric mesh, SIMPLE algorithm), runs the iterations, and renders the
              contours — you only see the final answer.
            </Callout>
          </>
        ),
      },
      {
        id: "pipeflow-custom",
        title: "Customising Pipe Flow: Different Fluids & Conditions",
        difficulty: "intermediate",
        duration: "5 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              The demo uses water properties by default (ρ = 998 kg/m³, μ = 0.001 Pa·s,
              cp = 4182 J/kg·K, k = 0.6 W/m·K). You can explore different scenarios:
            </p>
            <Code lang="text">{`Preset          Ambient °C   Flow LPM   Diameter ft   Expected Re
─────────────────────────────────────────────────────────────
Hot Sun (def)      58           60          2           ~335 k
Cold Pipe            5           60          2           ~335 k
Industrial         200          200          1           ~3.5 M
Low Flow            58            5          2           ~28 k`}</Code>
            <Step number={1} title="Use the preset buttons">
              <p>
                Click <strong>Hot Sun</strong>, <strong>Cold Pipe</strong>,{' '}
                <strong>Industrial</strong>, or <strong>Low Flow</strong> to jump
                to common scenarios.
              </p>
            </Step>
            <Step number={2} title="Read the flow regime">
              <p>
                The metrics panel shows whether your flow is <strong>laminar</strong> (Re &lt; 2 300),{' '}
                <strong>transitional</strong>, or <strong>turbulent</strong> (Re &gt; 4 000).
                Turbulent flows develop faster mixing and higher heat transfer.
              </p>
            </Step>
            <Step number={3} title="Interpret the charts">
              <p>
                Look at the radial temperature profiles: at the <strong>outlet</strong> the water
                near the pipe wall is hotter than the centre — this is the thermal boundary layer
                that develops under external heating.
              </p>
            </Step>
            <Callout type="info">
              The solver validates the Navier-Stokes equations with a SIMPLE pressure-velocity
              coupling algorithm. Reynolds, Nusselt, and friction-factor calculations follow
              standard correlations (Dittus-Boelter for turbulent, Graetz for laminar).
            </Callout>
          </>
        ),
      },
      {
        id: "cfd-overview",
        title: "CFD Solver: Navier-Stokes in the Browser",
        difficulty: "advanced",
        duration: "20 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              The CFD engine runs a full 2D incompressible Navier-Stokes solver inside
              the browser. Here is what it covers and how the components fit together.
            </p>
            <h4 className="mt-4 text-sm font-semibold text-white">Solver architecture</h4>
            <Code lang="text">{`src/lib/cfd/
├── solver.ts        SIMPLE pressure-velocity coupling
├── mesh.ts          Structured quadrilateral mesh generation
├── thermal.ts       Energy equation with convective BCs
├── visualization.ts Canvas-based contour / vector / streamline
├── dispatcher.ts    Agent picks solver, mesh, and post-processing
└── benchmarks.ts    Lid-driven cavity, channel flow, back-step`}</Code>
            <h4 className="mt-4 text-sm font-semibold text-white">Available benchmarks</h4>
            <ul className="mt-2 space-y-1 text-sm text-zinc-400">
              <li>• <strong>Lid-driven cavity</strong> — Re = 100, 400, 1000 classical validation</li>
              <li>• <strong>Channel flow</strong> — Poiseuille parabolic profile verification</li>
              <li>• <strong>Backward-facing step</strong> — recirculation zone prediction</li>
              <li>• <strong>Pipe thermal</strong> — coupled momentum + energy (the demo above)</li>
            </ul>
            <h4 className="mt-4 text-sm font-semibold text-white">How the agent selects algorithms</h4>
            <p className="mt-2 text-sm text-zinc-400">
              The dispatcher inspects the problem type, Reynolds number, and boundary
              conditions, then selects the appropriate turbulence model, relaxation factors,
              mesh density, and post-processing outputs automatically.
            </p>
            <Callout type="success">
              Every solver result includes convergence history, residual plots, and a
              visual-comparison summary so you can verify accuracy without reading equations.
            </Callout>
          </>
        ),
      },
    ],
  },
  // ─── Data Visualisation Tutorials ───────────────────────────
  {
    id: "dataviz",
    icon: BarChart3,
    title: "Data Visualisation & Charts",
    description:
      "Every chart type: line, bar, scatter, heatmap, contour, polar, 3D surface, fractal, and more.",
    tutorials: [
      {
        id: "chart-types-overview",
        title: "Available Chart & Visualisation Types",
        difficulty: "beginner",
        duration: "5 min",
        body: (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              The platform supports every major chart and visualisation type for engineering,
              finance, science, and analytics.
            </p>
            <Code lang="text">{`Category            Types Available
───────────────────────────────────────────────────────────────
Basic Charts        Line, Bar, Area, Pie, Doughnut, Scatter
Statistical         Box-Plot, Violin, Histogram, Heatmap
Engineering         Contour, Vector Field, Streamline, Mesh
Scientific          Polar, Radar, Bubble, Error-Bar
3-D / Surface       Surface Plot, Wireframe, Isosurface
Fractal             Mandelbrot, Julia Set, Sierpinski, Koch
Financial           Candlestick, OHLC, Waterfall, Sankey
Custom Canvas       Arbitrary HTML5 Canvas rendering`}</Code>
            <Callout type="tip">
              The pipe flow demo at <code className="rounded bg-zinc-800 px-1.5 text-xs text-violet-300">/pipeflow</code>{' '}
              renders 6 canvas charts using the built-in visualization engine — no external
              charting library required.
            </Callout>
          </>
        ),
      },
    ],
  },
];

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function Tutorials() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
  const [activeTutorial, setActiveTutorial] = useState<string | null>(null);

  const category = CATEGORIES.find((c) => c.id === activeCategory)!;
  const tutorial = category.tutorials.find((t) => t.id === activeTutorial);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <SiteNav />

      {/* Hero */}
      <section className="border-b border-zinc-800 bg-gradient-to-b from-violet-500/5 to-transparent">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-violet-400">
            Tutorials
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            Every feature, step by step
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Practical tutorials covering SLMs, LLMs, analytics engines, agent configuration,
            browser automation, reporting, and edge deployment. Each tutorial includes code
            examples and real commands.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { label: "16 tutorials", color: "bg-violet-500/20 text-violet-300" },
              { label: "6 categories", color: "bg-emerald-500/20 text-emerald-300" },
              { label: "All skill levels", color: "bg-amber-500/20 text-amber-300" },
            ].map((b) => (
              <span
                key={b.label}
                className={`rounded-full px-3 py-1 text-xs font-medium ${b.color}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-8">
        {/* Category sidebar */}
        <aside className="sticky top-20 hidden h-fit w-56 shrink-0 lg:block">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Categories
          </p>
          <nav className="space-y-0.5">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setActiveTutorial(null);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    activeCategory === cat.id
                      ? "bg-violet-500/15 font-medium text-violet-300"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{cat.title}</span>
                </button>
              );
            })}
          </nav>
          <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs leading-relaxed text-zinc-500">
            Prefer guided learning? Try the{" "}
            <Link to="/docs/start" className="text-violet-400 hover:underline">
              beginner path
            </Link>{" "}
            or the{" "}
            <Link to="/guide" className="text-violet-400 hover:underline">
              engineering guide
            </Link>
            .
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 pb-24">
          {/* Category header */}
          <div className="mb-6">
            <div className="flex items-center gap-3">
              {(() => {
                const Icon = category.icon;
                return (
                  <div className="grid size-10 place-items-center rounded-lg bg-violet-500/15">
                    <Icon className="size-5 text-violet-400" />
                  </div>
                );
              })()}
              <div>
                <h2 className="text-xl font-bold text-white">{category.title}</h2>
                <p className="text-sm text-zinc-400">{category.description}</p>
              </div>
            </div>
          </div>

          {/* Tutorial list / detail */}
          {tutorial ? (
            <div>
              <button
                onClick={() => setActiveTutorial(null)}
                className="mb-4 flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
              >
                ← Back to {category.title}
              </button>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-white">{tutorial.title}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      tutorial.difficulty === "beginner"
                        ? "bg-green-500/20 text-green-300"
                        : tutorial.difficulty === "intermediate"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {tutorial.difficulty}
                  </span>
                  <span className="text-xs text-zinc-500">{tutorial.duration}</span>
                </div>
                <div className="mt-6">{tutorial.body}</div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {category.tutorials.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTutorial(t.id)}
                  className="group flex flex-col items-start rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 text-left transition-colors hover:border-violet-500/30 hover:bg-zinc-900/60"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        t.difficulty === "beginner"
                          ? "bg-green-500/20 text-green-300"
                          : t.difficulty === "intermediate"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-red-500/20 text-red-300"
                      }`}
                    >
                      {t.difficulty}
                    </span>
                    <span className="text-[11px] text-zinc-500">{t.duration}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-white group-hover:text-violet-300">
                    {t.title}
                  </h3>
                  <ChevronRight className="mt-auto size-4 text-zinc-600 group-hover:text-violet-400" />
                </button>
              ))}
            </div>
          )}

          {/* Quick links */}
          <div className="mt-12 rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
            <h3 className="text-sm font-semibold text-white">Related resources</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                {
                  label: "Beginner Path",
                  desc: "AI agents from absolute scratch",
                  href: "/docs/start",
                },
                {
                  label: "Engineering Guide",
                  desc: "Architecture deep-dives",
                  href: "/guide",
                },
                {
                  label: "Tool Reference",
                  desc: "All 106 tools documented",
                  href: "/docs/tools",
                },
              ].map((r) => (
                <Link
                  key={r.label}
                  to={r.href}
                  className="flex items-center gap-2 rounded-lg border border-zinc-800 p-3 text-sm transition-colors hover:border-zinc-600 hover:bg-zinc-800/50"
                >
                  <BookOpen className="size-4 shrink-0 text-zinc-500" />
                  <div>
                    <p className="font-medium text-white">{r.label}</p>
                    <p className="text-[11px] text-zinc-500">{r.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

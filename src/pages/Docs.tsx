import { useState } from "react";
import { Link } from "react-router";
import { SiteNav } from "@/components/site/SiteNav";
import { PdfManualButton } from "@/components/site/PdfManualButton";
import { ALL_TOOLS } from "../lib/store";
import type { ReactNode } from "react";

/**
 * Documentation — Docusaurus-style product documentation.
 *
 * Covers every in-house module with getting-started procedures,
 * code examples, and links between related docs pages.
 */

const NAV_SECTIONS = [
  { id: "getting-started", label: "Getting Started" },
  { id: "architecture", label: "Architecture" },
  { id: "agent-tool-dispatch", label: "Agent Tool Dispatch" },
  { id: "stitap-chains", label: "stitaP Chains" },
  { id: "stitap-graph", label: "stitaP Graph" },
  { id: "inference", label: "Inference Harness" },
  { id: "agent-systems", label: "Agent Systems" },
  { id: "analytics-engines", label: "Analytics Engines" },
  { id: "ml-engine", label: "Machine Learning" },
  { id: "cfd-solver", label: "CFD Solver" },
  { id: "symbolic-math", label: "Symbolic & Engineering Math" },
  { id: "fractal-analysis", label: "Fractal Analysis" },
  { id: "graphs-viz", label: "Graphs & Visualization" },
  { id: "office-alternatives", label: "Office Alternatives" },
  { id: "standards-qa", label: "Standards & QA" },
  { id: "agent-config", label: "Agent Configuration" },
  { id: "fractal-graphs", label: "Fractal Graphs" },
  { id: "reports", label: "Reports & Logs" },
  { id: "browser-automation", label: "Browser Automation" },
  { id: "cloudflare-os", label: "Cloudflare OS" },
  { id: "sandboxes", label: "Sandbox Environments" },
  { id: "integrations", label: "Integrations" },
  { id: "tool-store", label: "Tool Store Reference" },
] as const;

function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-gray-800">
      {lang && (
        <div className="border-b border-gray-800 bg-gray-900 px-4 py-1.5 text-xs font-medium text-gray-400">
          {lang}
        </div>
      )}
      <pre className="overflow-x-auto bg-gray-950 p-4 text-xs leading-relaxed text-gray-200">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-12 scroll-mt-20 border-b border-gray-800 pb-2 text-2xl font-bold text-white"
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 text-lg font-semibold text-gray-100">{children}</h3>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 leading-relaxed text-gray-300">{children}</p>;
}

function Table({ rows, head }: { head: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-semibold text-gray-200">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-800/60 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2 align-top text-gray-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 rounded-lg border-l-4 border-violet-500 bg-violet-500/10 px-4 py-3 text-sm text-gray-300">
      {children}
    </div>
  );
}

export default function Docs() {
  const [active, setActive] = useState<string>("getting-started");

  const scrollTo = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <SiteNav />

      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-8">
        {/* Sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-5rem)] w-60 flex-shrink-0 overflow-y-auto lg:block">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            On this page
          </p>
          <nav className="space-y-1">
            {NAV_SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`block w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                  active === s.id
                    ? "bg-violet-500/15 font-medium text-violet-300"
                    : "text-gray-400 hover:bg-gray-900 hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-xs text-gray-400">
            All modules are <span className="text-emerald-400">100% in-house</span>: zero npm
            dependencies at runtime, fully offline-capable.
          </div>
          <PdfManualButton variant="ghost" />
          <Link
            to="/docs/start"
            className="mt-3 block rounded px-3 py-1.5 text-sm text-emerald-400 transition-colors hover:text-emerald-300"
          >
            New to AI agents? Start here →
          </Link>
          <Link
            to="/docs/tools"
            className="mt-3 block rounded px-3 py-1.5 text-sm text-violet-400 transition-colors hover:text-violet-300"
          >
            Per-tool reference (all {ALL_TOOLS.length}) →
          </Link>
          <Link
            to="/tutorials"
            className="mt-3 block rounded px-3 py-1.5 text-sm text-emerald-400 transition-colors hover:text-emerald-300"
          >
            Step-by-step tutorials →
          </Link>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 pb-24">
          <div className="mb-8 flex flex-col items-start justify-between gap-3 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-transparent px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-white">The complete platform manual</p>
              <p className="mt-0.5 text-xs text-gray-400">
                Every feature, its background knowledge, and how it was built — as a
                single PDF generated locally by our in-house engine. Includes an
                11-chapter beginner path and glossary for readers new to AI agents.
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                Every feature, its background knowledge, and how it was built — as a
                single PDF generated locally by our in-house engine.
              </p>
            </div>
            <PdfManualButton />
          </div>
          <H2 id="getting-started">Getting Started</H2>
          <P>
            stitaP is a self-contained agent tool harness. Every engine — capture,
            orchestration, inference, testing, design QA — is written from scratch in
            this repository. There are no runtime package installs and no paid APIs;
            the app works fully offline once deployed on your own hardware.
          </P>
          <H3>Quickstart</H3>
          <P>Run the smoke suites to verify your environment, then open the product surfaces:</P>
          <Code lang="bash">{`bun install                 # one-time dev setup only (build tooling)
bun tsc -b --noEmit         # typecheck the whole project

# Targeted verification suites (all offline)
bun scripts/store-smoke.ts          # tool registry + executors
bun scripts/orchestration-smoke.ts  # stitap-chains + stitap-graph
bun scripts/inference-smoke.ts      # router / quant / download / legacy
bun scripts/agent-smoke.ts          # memory / skills / terminal / kanban
bun scripts/sandbox-smoke.ts        # sandbox isolation engine`}</Code>
          <Table
            head={["Surface", "Route", "What you can do there"]}
            rows={[
              ["Tool Store", <Link key="s" className="text-violet-400 hover:underline" to="/store">/store</Link>, "Browse, search and install all registered tools"],
              ["Agent Builder", <Link key="a" className="text-violet-400 hover:underline" to="/agents">/agents</Link>, "Compose nodes into visual agent workflows"],
              ["API Reference", <Link key="p" className="text-violet-400 hover:underline" to="/api">/api</Link>, "HTTP + programmatic API surface"],
              ["Downloads", <Link key="d" className="text-violet-400 hover:underline" to="/downloads">/downloads</Link>, "Per-OS installers for desktop/mobile shells"],
            ]}
          />

          <H2 id="architecture">Architecture</H2>
          <P>
            The harness is layered so that any layer can be replaced without touching
            the others:
          </P>
          <Code>{`Store Layer        catalog · permissions · sandboxed execution · install flow
─────────────────────────────────────────────────────────────
Orchestration      stitap-chains (runnables, ReAct) · stitap-graph (StateGraph)
─────────────────────────────────────────────────────────────
Inference Router   device probing · benchmark-based backend pick · quant menu
                   model acquisition (resumable downloads) · throughput tuning
─────────────────────────────────────────────────────────────
Tool Engines       browser automation · testing · design QA · vision (ViT)
                   video editor · audio · document parsing · export
─────────────────────────────────────────────────────────────
Isolation          sandbox environments (Web Worker VFS + network policy)`}</Code>
          <Note>
            Design rule: <strong>one module per purpose.</strong> Where a popular OSS
            library exists (LangChain, LangGraph, Playwright…), stitaP ships exactly one
            in-house equivalent built from first principles — never two competing ones.
          </Note>

          <H2 id="stitap-chains">stitaP Chains</H2>
          <P>
            In-house orchestration following LangChain's best patterns: composable
            runnables, prompt templates with few-shot support, robust output parsers,
            and a ReAct agent executor. Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-violet-300">src/lib/chains/</code>
          </P>
          <H3>Hello chain</H3>
          <Code lang="typescript">{`import {
  LLMChain, PromptTemplate, JsonOutputParser,
  registerModelHook, activeBackend,
} from "@/lib/chains";

// Optional: plug any local model in (GGUF runner, API client).
// Without a hook, a deterministic fallback keeps chains runnable offline.
registerModelHook(async (messages) => ({
  role: "assistant",
  content: await myLocalModel.generate(messages),
}));

const chain = new LLMChain({
  prompt: new PromptTemplate({
    template: 'Extract {{name}} from: {text}',
    system: "Respond with valid JSON only.",
  }),
  parser: new JsonOutputParser(),
});

const result = await chain.invoke({ text: "..." });
console.log(activeBackend()); // transparent degradation label`}</Code>
          <H3>Sequential pipelines &amp; agents</H3>
          <Code lang="typescript">{`import { SequentialChain, AgentExecutor } from "@/lib/chains";

const pipeline = new SequentialChain({
  steps: [
    { name: "summarize", outputs: ["summary"], run: async (v) => ... },
    { name: "translate", outputs: ["translated"], run: async (v) =>
        // reads every previous step's named output
        translate(v.summary as string) },
  ],
});
await pipeline.invoke({}, { timeoutMs: 30_000 }); // budgeted runs

const agent = new AgentExecutor({
  tools: [{ name: "echo", description: "...", parameters: "{input}",
            execute: async (a) => a.input }],
  maxIterations: 8, // bounded Reason→Act→Observe loop
});
const res = await agent.run("say ping through echo");
res.steps; // full Thought/Action/Observation trace for observability`}</Code>
          <Note>
            SLM-friendly by design: the ReAct protocol parser accepts non-JSON action
            inputs (common small-model behaviour), and the no-model fallback terminates
            deterministically instead of looping forever.
          </Note>

          <H2 id="stitap-graph">stitaP Graph</H2>
          <P>
            LangGraph-style stateful workflows: typed shared state with per-channel
            reducers, conditional routing, cycle protection, checkpointing, interrupts,
            and stream events. Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-violet-300">src/lib/graph/</code>
          </P>
          <Code lang="typescript">{`import { StateGraph, START, END } from "@/lib/graph";

interface DraftState extends Record<string, unknown> {
  topic: string; draft: string; reviewScore: number; revision: number;
}

const graph = new StateGraph<DraftState>("draft-review")
  .channel("topic").channel("draft").channel("reviewScore").channel("revision")
  .addNode("draft",  (s) => ({ draft: "Draft about " + s.topic, revision: 1 }))
  .addNode("review", (s) => ({ reviewScore: Math.max(0, 10 - s.revision * 3) }))
  .addNode("revise", (s) => ({ revision: s.revision + 1 }));

graph.addEdge(START, "draft").addEdge("draft", "review");
graph.addConditionalEdge("review", (s) =>
  s.reviewScore >= 7 || s.revision >= 3 ? END : "revise");
graph.addEdge("revise", "review");

const compiled = graph.compile({ recursionLimit: 25 });
const result = await compiled.invoke(
  { topic: "stitap", draft: "", reviewScore: 0, revision: 0 },
  { stream: (e) => console.log(e.type) }, // node_start / node_end / done
);`}</Code>
          <Table
            head={["Feature", "How it works"]}
            rows={[
              ["Reducers", "Pass reducer per channel to merge updates instead of overwriting"],
              ["Cycle protection", "recursionLimit aborts runaway loops after N supersteps"],
              ["Checkpointing", "MemoryCheckpointer saves state each superstep (time-travel)"],
              ["Interrupts", "Throw GraphInterrupt inside a node to pause + resume later"],
            ]}
          />

          <H2 id="inference">Inference Harness</H2>
          <P>
            Hardware-aware model serving with zero privilege requirements at runtime.
            Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-cyan-300">src/lib/inference/</code>
          </P>
          <Table
            head={["Module", "Responsibility"]}
            rows={[
              ["device-prober.ts", "Privilege-free capability probing: RAM, CPU cores, NUMA topology, instruction sets, and 10 backends (OpenVINO CPU/iGPU/NPU, llama.cpp variants, QNN, Core ML, APU). Missing hardware fails soft — never blocks."],
              ["backend-router.ts", "Never hardcodes priority: benchmarks every available backend, picks fastest per workload (throughput vs latency), caches keyed to device fingerprint"],
              ["model-download.ts", "Resumable chunked HTTP Range downloads with parallel connections + SHA256 integrity; Hugging Face Bearer auth for gated models; requantization decision tree (quantize originals → use as-is → fetch correct quant)"],
              ["quantizer.ts", "In-house block quantizer: Q8_0/Q4_K/Q3_K/Q2_K, importance-weighted IQ2/IQ3, b1.58 ternary; build planner (refuses requantization and dense→ternary); per-level verification"],
              ["failover.ts", "Free-provider pool (9 permanent tiers) with circuit breakers, half-open probes, key-level vs provider-level failure separation, local daily-quota tracking, and background shifting"],
              ["provider-keys.ts", "Single-key vs multi-key analysis: min(RPM, TPM, concurrency) ÷ per-agent demand, ranked across all major providers"],
              ["throughput.ts", "Backend tuning: KV-cache persistence, speculative decoding, flash attention, batch sizes, physical-core thread counts, NUMA pinning"],
              ["legacy-support.ts", "Old-server playbook: static/musl cross-compile advice, -march flags, container bridge, degradation estimates"],
              ["catalog.ts", "19 harness catalog entries (Dify, Mem0, CrewAI, Firecrawl equivalents...) mapped onto in-house engines"],
            ]}
          />
          <Note>
            Quantization menu over silent picks: the store shows memory footprint,
            expected tokens/sec and quality notes per level (Q4_K_M sweet spot), and
            re-offers the choice when hardware changes. Never requantize an
            already-quantized GGUF when originals are reachable. The Notebook at{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-cyan-300">/notebook</code>
            {" "}walks through the whole flow: evaluate hardware → download → build → chat or agents.
          </Note>

          <H2 id="agent-systems">Agent Systems</H2>
          <P>
            Persistent learning loop plus real execution primitives, all tuned for
            small language models. Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-emerald-300">src/lib/agent/</code>
          </P>
          <Table
            head={["System", "What it gives your agents"]}
            rows={[
              ["memory.ts", "Cross-session memory (user/project/workflow/fact/skill) with importance scoring, confidence decay, auto-pruning"],
              ["skills.ts", "Autonomous skill extraction from completed tasks; versioned registry; auto-refinement after 3+ uses"],
              ["self-improve.ts", "Performance tracking, pattern detection (frequent errors, slow tools, retry loops), improvement suggestions"],
              ["terminal.ts", "Shell execution: built-in commands, JS expressions, background process management (poll/wait/kill)"],
              ["kanban.ts", "Multi-agent boards: dependencies, fan-out, worker heartbeats, token-efficient SLM snapshots"],
              ["studio.ts", "Agent Studio: role catalog with fixed responsibilities, knowledge scope (PDFs/links + browse-or-confine policy, strictly validated), tool scope with per-tool principles, solution templates (capture-and-attach-to-ticket), team workspace with structured feedback, and internal-first git sync preferences"],
              ["scheduler.ts", "Scheduled automations: interval + cron-lite specs, failure budgets, due-job polling for long runs"],
              ["knowledge.ts", "Local RAG: deterministic hashed embeddings (no model download), chunked docs, budgeted context injection"],
              ["notifications.ts", "Channel dispatcher: severity rules, quiet hours, dedupe windows, retrying flush for swarm alerts"],
              ["tracing.ts", "Per-run span trees with token accounting; waterfall exports for postmortems and Jira comments"],
              ["approvals.ts", "Human-in-the-loop gate: per-risk policies (auto-approve / require-human / block) with TTL expiry"],
            ]}
          />

          <H2 id="analytics-engines">Analytics Engines</H2>
          <P>
            Three in-browser query engines with zero external dependencies — SQL, XQL, and MDX —
            plus export to PowerBI, Excel, Google Sheets, and Tableau. All execute entirely
            client-side against the in-house columnar storage engine.
          </P>
          <Table
            head={["Engine", "Language", "Key Features", "Source"]}
            rows={[
              ["SQL", "Structured Query Language", "SELECT, JOIN, GROUP BY, ORDER BY, window functions (ROW_NUMBER, RANK, LAG, LEAD), CASE, aggregates", "src/lib/analytics/sql.ts"],
              ["XQL", "eXtended Query Language", "Hybrid SQL + JSON path (@.field, $.data.nested) + graph traversal + time-series windowing + LET bindings + COALESCE", "src/lib/analytics/xql-engine.ts"],
              ["MDX", "Multidimensional Expressions", "OLAP: CROSSJOIN, FILTER, TOPCOUNT/BOTTOMCOUNT, HEAD/TAIL, calculated members, IIF/CASE, NON EMPTY — PowerBI/Excel/Tableau compatible", "src/lib/analytics/mdx-engine.ts"],
              ["Columnar DB", "DuckDB-style", "Typed columns (i32, f64, str, bool, date), null bitmaps, dictionary encoding, vectorized aggregation, hash joins", "src/lib/analytics/columnar.ts"],
            ]}
          />
          <H3>Export Tools</H3>
          <P>
            Export query results to any reporting platform. Each export produces a
            platform-specific file with metadata headers, auto-generated formulas,
            or typed schemas.
          </P>
          <Code lang="typescript">{`import { getStore } from "@/lib/store";
const store = getStore();

// Run a query
const result = await store.execute("analytics.sql", {
  query: "SELECT dept, SUM(amount) as total FROM sales GROUP BY dept",
});

// Export to Power BI (CSV + DAX templates)
const pbi = await store.execute("analytics.export_powerbi", {
  tableName: "result",
});

// Export to Tableau (TSV + .twb manifest)
const twb = await store.execute("analytics.export_tableau", {
  tableName: "result",
});`}</Code>
          <Table
            head={["Export", "Format", "What it produces"]}
            rows={[
              ["PowerBI", "CSV + DAX", "CSV with metadata header + auto-generated DAX measures for numeric columns"],
              ["Excel", "CSV or XML", "CSV with BOM + formatting hints, or native XML Spreadsheet (SSML) with styles"],
              ["Google Sheets", "CSV + Formulas", "CSV with schema metadata + auto-generated Sheets formulas (SUM, AVERAGE, etc.)"],
              ["Tableau", "TSV + TWB", "TSV with typed columns + Tableau workbook manifest for auto-import"],
            ]}
          />
          <H3>Rust Analytical Engine</H3>
          <P>
            A WASM bridge to the Rust analytical engine for high-performance queries.
            Falls back to the TypeScript engine when WASM is unavailable. Supports
            SIMD-accelerated aggregation, parallel execution, Arrow IPC, and Parquet.
          </P>
          <Code lang="typescript">{`import { initRustEngine, isRustEngineAvailable, executeRustQuery } from "@/lib/analytics/rust-engine";

// Initialize (detects WASM + SIMD support)
await initRustEngine({ maxMemory: 512 * 1024 * 1024 });

// Check status
const status = getEngineStatus();
console.log(status.wasmAvailable); // true when WASM loaded
console.log(status.simdSupported); // true when SIMD detected

// Execute query (auto-fallback to TypeScript)
const result = executeRustQuery("SELECT * FROM sales", tables);
console.log(result.meta.engine); // "rust-wasm" or "typescript-fallback"`}</Code>

          <H2 id="agent-tool-dispatch">Agent Tool Dispatch</H2>
          <P>
            Agents automatically select the right tool for the right problem through a dispatch system
            that matches user intent to the most appropriate engine. The dispatcher uses keyword
            matching, problem classification, and capability scoring to route requests.
          </P>
          <H3>How Tool Selection Works</H3>
          <Table
            head={["User Intent", "Dispatch Logic", "Tool Selected"]}
            rows={[
              ["Solve a PDE", "Keyword: PDE/heat/wave/Laplace → math.solve_pde"],
              ["Train a model", "Keyword: train/classify/fit → ml.train"],
              ["Analyze stress", "Keyword: stress/strain/vonMises → math.stress.analysis"],
              ["Solve flow", "Keyword: flow/CFD/Reynolds → cfd.auto-dispatch"],
              ["Create document", "Keyword: report/doc/presentation → office.doc"],
              ["Audit compliance", "Keyword: ISO/security/audit → standards.audit"],
              ["Plot data", "Keyword: chart/graph/plot → chart.generate"],
              ["Generate fractal", "Keyword: Mandelbrot/Julia/fractal → fractal.generate"],
              ["Differentiate", "Keyword: derivative/differentiate → math.symbolic.solve"],
              ["Classify text", "Keyword: classify/NLP/sentiment → text.classify"],
            ]}
          />
          <Code lang="typescript">{`// The agent dispatches automatically based on the task:
const agent = new AgentExecutor({ tools: [...ALL_TOOLS] });

// "Solve the heat equation on a 20x20 grid"
// → auto-selects math.solve_pde with heat-equation params

// "Train a random forest on this CSV data"
// → auto-selects ml.train with random_forest algorithm

// "Create a quarterly report"
// → auto-selects office.doc with quick-report formatter`}</Code>
          <Note>
            The dispatch system is extensible. New tools registered in the tool store
            are automatically available for agent selection. The agent uses the tool's
            name, description, and category to match user intent.
          </Note>

          <H2 id="ml-engine">Machine Learning Engine</H2>
          <P>
            Pure TypeScript ML engine with zero dependencies — runs entirely in the browser.
            No Python, no scikit-learn, no TensorFlow. Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-emerald-300">src/lib/ml/</code>
          </P>
          <H3>Algorithm Coverage</H3>
          <Table
            head={["Category", "Algorithms", "Use Case"]}
            rows={[
              ["Supervised Regression", "Linear (OLS + Ridge), Polynomial, Gradient Boosting", "Price prediction, trend analysis"],
              ["Supervised Classification", "Logistic (binary + multiclass), KNN, Random Forest", "Buy/sell signals, fault classification"],
              ["Unsupervised", "K-Means, PCA", "Clustering, dimensionality reduction"],
              ["Time Series", "Holt-Winters, Moving Average, ARIMA-like", "Seasonal forecasting, trend smoothing"],
              ["Fault Detection", "Z-Score, Mahalanobis, Isolation Forest, SPC, EWMA, CUSUM", "Anomaly detection, process control"],
              ["Text Classification", "TF-IDF, Naive Bayes, BM25, KNN Text, Keyword Rules", "Sentiment analysis, document classification"],
              ["Numerical Methods", "Polynomial fit, ODE (Euler/RK4), PDE (Heat/Wave/Laplace)", "Physics simulation, root finding"],
            ]}
          />
          <H3>Agent-Callable Tools (24 tools)</H3>
          <Table
            head={["Tool ID", "Purpose"]}
            rows={[
              ["ml.train", "Train any model on CSV/JSON data with configurable hyperparameters"],
              ["ml.predict", "Run inference on new data points"],
              ["ml.evaluate", "Compute MSE, RMSE, MAE, R², accuracy, precision, recall, F1"],
              ["ml.cluster", "K-Means clustering with auto-k selection"],
              ["ml.pca", "Principal Component Analysis for dimensionality reduction"],
              ["ml.forecast", "Time series forecasting with confidence intervals"],
              ["ml.feature_importance", "Explain which features drive model decisions"],
              ["ml.preprocess", "Normalize, standardize, encode categorical data"],
              ["fault.detect_anomalies", "Multi-algorithm anomaly detection"],
              ["fault.spc_chart", "Statistical process control charts (X̄, EWMA, CUSUM)"],
              ["fault.classify", "Rule-based fault classification with severity"],
              ["text.train_classifier", "Train Naive Bayes or KNN text classifier"],
              ["text.classify", "Predict label for new text using trained model"],
              ["text.sentiment", "Lexicon-based sentiment scoring"],
              ["text.keywords", "RAKE-inspired keyphrase extraction"],
              ["text.bm25", "Okapi BM25 document relevance ranking"],
              ["math.polynomial_fit", "Least-squares polynomial regression"],
              ["math.differentiate", "Symbolic polynomial differentiation"],
              ["math.integrate", "Numerical integration (Simpson's, trapezoidal)"],
              ["math.solve_ode", "ODE solver (Euler, Runge-Kutta 4th order)"],
              ["math.solve_pde", "PDE solver (heat, wave, Laplace equations)"],
              ["math.find_root", "Root finding (bisection, Newton-Raphson, secant)"],
            ]}
          />
          <Code lang="typescript">{`// Example: Agent trains a model and makes predictions
const store = getStore();

// 1. Preprocess data
const clean = await store.execute("ml.preprocess", {
  data: rawPrices,
  operations: ["standardize", "handle_missing"],
});

// 2. Train model
const model = await store.execute("ml.train", {
  algorithm: "random_forest",
  data: clean.data,
  targetColumn: "price_change",
  hyperparams: { numTrees: 100, maxDepth: 10 },
});

// 3. Evaluate
const metrics = await store.execute("ml.evaluate", {
  modelJson: model.data.modelJson,
  testData: clean.data.slice(-100),
});
// → { accuracy: 0.72, f1: 0.68, precision: 0.71, recall: 0.65 }

// 4. Predict
const prediction = await store.execute("ml.predict", {
  modelJson: model.data.modelJson,
  data: tomorrowFeatures,
});
// → [1] (UP signal)`}</Code>

          <H2 id="cfd-solver">CFD Solver (Navier-Stokes)</H2>
          <P>
            Full Navier-Stokes solver with SIMPLE pressure-velocity coupling, running entirely
            in the browser. Solves 2D incompressible flow problems that typically require ANSYS Fluent
            or OpenFOAM. Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-cyan-300">src/lib/cfd/</code>
          </P>
          <Table
            head={["Module", "What It Does"]}
            rows={[
              ["Mesh", "Structured 2D Cartesian grid with wall/inlet/outlet boundary conditions"],
              ["Linear Algebra", "Gauss-Seidel, SOR, Conjugate Gradient, BiCGSTAB, ILU preconditioner"],
              ["Discretization", "Finite volume: gradient, divergence, Laplacian, Rhie-Chow interpolation"],
              ["Solver", "SIMPLE algorithm: momentum → pressure correction → velocity correction"],
              ["Dispatcher", "Auto-selects solver type, grid, and parameters from problem description"],
              ["Visualization", "Velocity/pressure contours, streamlines, vector fields, convergence charts"],
            ]}
          />
          <H3>Benchmark Problems</H3>
          <Table
            head={["Problem", "Reynolds Number", "What It Validates"]}
            rows={[
              ["Lid-Driven Cavity", "100–10,000", "Standard CFD benchmark, recirculation patterns"],
              ["Channel Flow", "Any", "Poiseuille flow, parabolic velocity profile"],
              ["Backward-Facing Step", "100–800", "Separation, reattachment, shear layer"],
              ["Pipe Flow", "Any", "Axisymmetric development"],
              ["Cylinder Wake", "100–1,000", "Vortex shedding, drag/lift coefficients"],
            ]}
          />
          <Code lang="typescript">{`// Agent auto-dispatches CFD problem
const result = await store.execute("cfd.auto-dispatch", {
  description: "Solve backward-facing step at Re=800 with fine mesh",
});
// → Auto-selects: SIMPLEC, 80×32 grid, blended convection, BiCGSTAB
// → Converged in 412 iterations, 8.2s
// → Max velocity: 0.421, CFL: 0.31`}</Code>
          <Note>
            The CFD solver handles pressure-velocity coupling (the hardest part of
            incompressible CFD) with Rhie-Chow interpolation to prevent checkerboard
            pressure oscillations. An agent can autonomously solve any 2D incompressible
            flow problem.
          </Note>

          <H2 id="symbolic-math">Symbolic & Engineering Math</H2>
          <P>
            Comprehensive mathematical engines covering symbolic computation, sparse linear
            algebra, finite element analysis, continuum mechanics, and optimization — all
            pure TypeScript with zero runtime dependencies.
          </P>
          <H3>Symbolic Math Engine</H3>
          <Table
            head={["Capability", "What It Does"]}
            rows={[
              ["Parse & Evaluate", "Parse mathematical expressions, evaluate at points"],
              ["Differentiate", "First and second derivatives of any expression"],
              ["Integrate", "Indefinite and definite integrals"],
              ["Simplify", "Algebraic simplification and expansion"],
              ["Taylor Series", "N-th order Taylor expansion around a point"],
              ["Limits", "Evaluate limits at finite and infinite points"],
              ["Equation Solving", "Newton-Raphson for single and systems of equations"],
              ["Transforms", "Laplace and Fourier transforms"],
            ]}
          />
          <H3>Engineering Math Modules</H3>
          <Table
            head={["Module", "File", "Capabilities"]}
            rows={[
              ["Sparse Linear Algebra", "math/sparse.ts", "CSR sparse matrix, LU/Cholesky/QR, eigenvalues, CG, BiCGSTAB, matrix inverse, determinant"],
              ["Finite Element Analysis", "math/fea.ts", "Truss, beam, CST triangle, Q4 quad elements, mesh generation, assembly, solve"],
              ["Continuum Mechanics", "math/continuum.ts", "Stress/strain tensors, von Mises, principal stresses, heat conduction, wave equation, Poisson"],
              ["Optimization", "math/optimization.ts", "Gradient descent, Newton, BFGS, constrained (penalty), LP simplex, Levenberg-Marquardt"],
            ]}
          />
          <H3>Agent-Callable Tools</H3>
          <Table
            head={["Tool ID", "Purpose"]}
            rows={[
              ["math.symbolic.solve", "Differentiate, integrate, solve, Taylor series, limits"],
              ["math.symbolic.transform", "Laplace and Fourier transforms"],
              ["math.fea.solve", "Solve structural problems (truss, beam, plane stress/strain)"],
              ["math.stress.analysis", "Principal stresses, von Mises, Mohr's circle"],
              ["math.heat.transfer", "2D steady-state heat conduction solver"],
              ["math.linalg.solve", "Linear systems, eigenvalues, matrix operations"],
              ["math.optimize", "Gradient descent, Newton, BFGS, LP, constrained"],
              ["math.beam.analysis", "Beam deflection, moment/shear diagrams, column buckling"],
            ]}
          />
          <Code lang="typescript">{`// Example: Agent solves a structural engineering problem
const fea = await store.execute("math.fea.solve", {
  problemType: "plane-stress",
  width: 1, height: 1, nx: 20, ny: 20,
  E: 210e9, nu: 0.3, thickness: 0.01,
  loads: [{ nodeX: 1, nodeY: 1, fx: 0, fy: -100000 }],
  fixedEdges: ["left"],
});
// → maxDisplacement: 2.3e-4 m, maxVonMises: 45 MPa

// Agent checks if the design is safe
const stress = await store.execute("math.stress.analysis", {
  sx: 45e6, sy: -12e6, txy: 23e6,
});
// → principal: σ1=53 MPa, σ2=-20 MPa, vonMises=64 MPa (below yield 250 MPa ✓)`}</Code>

          <H2 id="fractal-analysis">Fractal Analysis</H2>
          <P>
            Comprehensive fractal geometry engine with 20+ fractal types, dimension estimation,
            chaos theory, and L-systems. Used for mesh quality analysis, noise detection in
            agent graphs, and scientific visualization. Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-pink-300">src/lib/math/fractals.ts</code>
          </P>
          <Table
            head={["Category", "Types", "Use Cases"]}
            rows={[
              ["Escape-Time", "Mandelbrot, Julia, Burning Ship, Newton, Tricorn, Orbit Trap", "Complex plane visualization, convergence analysis"],
              ["Geometric", "Sierpinski, Koch, Cantor, Dragon, Hilbert, Peano", "Self-similar pattern generation, space-filling curves"],
              ["L-Systems", "8 presets + custom rules", "Plant growth, procedural generation, fractal trees"],
              ["IFS", "Barnsley Fern, Sierpinski Gasket, Cantor Dust", "Affine transform fractals, natural pattern synthesis"],
              ["Dimension", "Box-counting, Minkowski, Lacunarity, Multifractal f(α)", "Mesh quality assessment, anomaly detection"],
              ["Chaos", "Logistic Map, Hénon, Lorenz, Cobweb", "Bifurcation analysis, phase space, attractors"],
              ["Noise", "Perlin, fBm, Ridged, Turbulence", "Procedural textures, terrain generation"],
            ]}
          />
          <H3>Agent-Callable Tools</H3>
          <Table
            head={["Tool ID", "Purpose"]}
            rows={[
              ["fractal.generate", "Generate any fractal type with custom parameters"],
              ["fractal.dimension", "Box-counting, Minkowski, lacunarity, multifractal spectrum"],
              ["fractal.lsystem", "L-system fractals with 8 presets or custom grammar rules"],
              ["fractal.ifs", "Iterated Function System fractals (Barnsley fern, etc.)"],
              ["fractal.chaos", "Bifurcation, Lorenz attractor, Hénon, cobweb diagrams"],
            ]}
          />
          <Code lang="typescript">{`// Agent analyzes fractal dimension of an FEA mesh
const dimension = await store.execute("fractal.dimension", {
  data: meshElementSizes,
  method: "all",
});
// → boxCounting: D=1.87 (mesh refinement pattern)
// → lacunarity: Λ=1.23 (moderate self-similarity)
// → multifractal: width=0.45 (single scaling regime)

// Generate a Mandelbrot set for visualization
const mandelbrot = await store.execute("fractal.generate", {
  type: "mandelbrot",
  width: 800, height: 600,
  centerX: -0.5, centerY: 0, zoom: 2,
  maxIterations: 256,
});`}</Code>

          <H2 id="graphs-viz">Graphs & Visualization</H2>
          <P>
            35+ chart types generating recharts-compatible data, covering scientific,
            statistical, and specialized visualizations. All output is ready for React
            rendering with recharts. Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-amber-300">src/lib/math/graphs.ts</code>
          </P>
          <Table
            head={["Category", "Chart Types"]}
            rows={[
              ["Basic", "Line, Bar, Scatter, Area"],
              ["Statistical", "Histogram, Box Plot, Violin, Density, Q-Q Plot, Autocorrelation, Pareto"],
              ["Scientific", "Contour, Heatmap, Vector Field, Streamlines, Phase Portrait, Bifurcation"],
              ["Specialized", "Radar, Treemap, Waterfall, Funnel, Gauge, Sparkline, Spectrum"],
              ["Fractal-Specific", "Dimension Plot, Multifractal Spectrum, Convergence History"],
            ]}
          />
          <H3>Agent-Callable Tools</H3>
          <Table
            head={["Tool ID", "Purpose"]}
            rows={[
              ["chart.generate", "Generate any of 35+ chart types with recharts-compatible data"],
              ["chart.stats", "Descriptive statistics with auto-generated histogram + box plot"],
              ["chart.fractal-viz", "Fractal-specific visualizations (dimension plot, spectrum, etc.)"],
            ]}
          />

          <H2 id="office-alternatives">Office Alternatives</H2>
          <P>
            In-house replacements for Microsoft Office applications — all generating
            downloadable HTML/PDF documents. No Word, Excel, PowerPoint, or Adobe required.
            Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-blue-300">src/lib/office/engine.ts</code>
          </P>
          <Table
            head={["Replaces", "Tool", "Capabilities"]}
            rows={[
              ["Microsoft Word", "office.doc", "Headings, paragraphs, tables, images, page breaks, Markdown→Document, styles"],
              ["Microsoft Excel", "office.sheet", "CSV/JSON import, pivot tables, auto-filter, freeze rows, Sheet→CSV export"],
              ["Microsoft PowerPoint", "office.slide", "Title/content/two-column layouts, Markdown→Presentation, themes, speaker notes"],
              ["Adobe Acrobat", "office.pdf", "Markdown→PDF content, structured pages, print-to-PDF export"],
              ["Microsoft Outlook", "office.email", "HTML/text emails, CC/BCC, priority, attachments, email→HTML"],
            ]}
          />
          <H3>Quick Formatters</H3>
          <Table
            head={["Formatter", "Creates"]}
            rows={[
              ["quickReport(title, sections)", "Professional report with headings and styled content"],
              ["quickMeetingNotes(title, attendees, agenda, actionItems)", "Meeting notes with agenda + action items table"],
              ["quickInvoice(number, from, to, items)", "Invoice with line items, tax, and total"],
            ]}
          />

          <H2 id="standards-qa">Standards & QA Compliance</H2>
          <P>
            Automated compliance auditing against ISO, OWASP, WCAG, and internal QA standards.
            Security scanning, accessibility checks, and documentation quality assessment —
            all running client-side. Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-rose-300">src/lib/standards/engine.ts</code>
          </P>
          <Table
            head={["Standard", "Version", "What It Checks"]}
            rows={[
              ["ISO 25010", "2023", "8 quality characteristics: functional suitability, performance, compatibility, usability, reliability, security, maintainability, portability"],
              ["ISO 9001", "2015", "Quality management: quality planning, resource management, product realization, measurement"],
              ["ISO 27001", "2022", "Information security: access control, cryptography, data protection, network security"],
              ["OWASP Top 10", "2021", "Web security: broken access control, injection, security misconfiguration"],
              ["WCAG 2.2", "2.2", "Accessibility: alt text, color contrast, keyboard navigation, semantic HTML"],
              ["QA Standards", "1.0", "Testing: test coverage, code review, performance benchmarks"],
              ["Documentation", "1.0", "README completeness, changelog format, API documentation"],
            ]}
          />
          <H3>Security Scanner</H3>
          <P>
            The security scanner detects hardcoded secrets, XSS vectors, deprecated crypto,
            missing tests, and other vulnerabilities by pattern-matching source code.
          </P>
          <Table
            head={["Severity", "What It Finds"]}
            rows={[
              ["🔴 Critical", "Hardcoded secrets, XSS vectors, deprecated crypto, missing tests"],
              ["🟡 Major", "Missing TypeScript strict mode, files >500 lines, missing lock file, no alt text"],
              ["⚪ Minor", "TODO without issue tracker, hardcoded localhost, missing Prettier config"],
            ]}
          />
          <H3>Agent-Callable Tools</H3>
          <Table
            head={["Tool ID", "Purpose"]}
            rows={[
              ["standards.audit", "Full compliance audit against any standard"],
              ["standards.security", "Security vulnerability scan of source code"],
              ["office.doc", "Create Word-compatible documents"],
              ["office.sheet", "Create spreadsheet-compatible data"],
              ["office.slide", "Create presentation decks"],
              ["office.pdf", "Create PDF documents"],
              ["office.email", "Create and format emails"],
            ]}
          />

          <H2 id="agent-config">Agent Configuration</H2>
          <P>
            Define agents with roles, tool assignments, knowledge scope, operating
            principles, and resource limits. Access at{" "}
            <Link to="/agent-config" className="text-violet-400 hover:underline">/agent-config</Link>.
          </P>
          <H3>Agent Definition</H3>
          <P>
            Each agent has a name, role (from 12 presets), color identity, and status.
            Agents can be created from scratch or from 6 pre-configured templates.
          </P>
          <Table
            head={["Template", "Role", "Suggested Tools"]}
            rows={[
              ["Data Analyst", "Analyze data, run queries, generate reports", "analytics.sql, analytics.xql, analytics.mdx, analytics.export_powerbi"],
              ["Code Reviewer", "Review code for quality and security", "document.parse, llm.prompt, design.audit"],
              ["Web Scraper", "Extract data from websites", "browser.navigate, browser.extract, analytics.csv_import"],
              ["Test Runner", "Run automated tests", "testing.performance, testing.accessibility, testing.seo"],
              ["Document Writer", "Create and maintain documentation", "document.parse, llm.prompt, llm.parse"],
              ["Security Auditor", "Audit for vulnerabilities", "testing.security, browser.navigate, llm.prompt"],
            ]}
          />
          <H3>Tool Selection</H3>
          <P>
            Browse the full tool registry with category filtering and search. Toggle tools
            on/off for each agent. Selected tools appear as removable chips.
          </P>
          <H3>Knowledge Management</H3>
          <P>
            Upload documents (PDFs, URLs, text content) as knowledge scope. Toggle internet
            access with "confine to provided docs" option to restrict browsing to uploaded
            material only.
          </P>
          <H3>Scope Configuration</H3>
          <Code lang="typescript">{`// Agent scope settings
scope: {
  browseInternet: false,        // Allow web browsing
  confinedToDocs: true,         // Only use provided documents
  maxTokensPerQuery: 4096,      // Token budget per query
  maxConcurrentTasks: 3,        // Parallel task limit
  allowedDomains: ["example.com"],  // Domain whitelist
  blockedDomains: [],           // Domain blacklist
}`}</Code>
          <H3>Operating Principles</H3>
          <P>
            Select from 10 preset principles that guide agent behavior:
            "Always verify results", "Prefer read-only operations",
            "Log all tool invocations", "Respect rate limits",
            "Fail gracefully", "Never expose credentials",
            "Use the most specific tool", "Cache repeated queries",
            "Prefer local/offline tools", "Summarize large outputs".
          </P>

          <H2 id="fractal-graphs">Fractal Graphs</H2>
          <P>
            A hierarchical fractal graph visualization system for rendering agent
            interactions, tool chains, and project structures. Uses mathematically
            rigorous methods from fractal geometry and graph theory for noise detection.
            Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-cyan-300">src/lib/agent/fractal-graph.ts</code>
          </P>
          <H3>Layout Algorithms</H3>
          <Table
            head={["Algorithm", "Method", "Best for"]}
            rows={[
              ["Fractal Tree", "L-system branching (F → FF+[+F-F-F]-[-F+F+F])", "Hierarchical agent structures, tree-like tool chains"],
              ["Force-Directed", "Repulsion + attraction + fractal depth clustering", "Complex networks with many cross-connections"],
              ["Hilbert Curve", "Space-filling curve mapping 1D → 2D", "Large datasets where proximity = similarity"],
              ["Radial", "Concentric rings by depth level", "Root-centric hierarchies, hub-and-spoke topologies"],
            ]}
          />
          <H3>Noise Detection</H3>
          <P>
            The engine detects noise using three mathematical methods:
          </P>
          <Code lang="typescript">{`import { detectNoise } from "@/lib/agent/fractal-graph";

const analysis = detectNoise(graph);

// Fractal dimension (box-counting method)
// Healthy hierarchy: 1.5–2.0 | Flat/noisy: <1.0 | Over-complex: >2.0
console.log(analysis.fractalDimension); // e.g., 1.67

// Hurst exponent (R/S analysis)
// >0.5: persistent (smooth patterns) | <0.5: anti-persistent (noisy)
console.log(analysis.hurstExponent); // e.g., 0.72

// Cluster coherence per depth level
for (const [cluster, score] of analysis.clusterScores) {
  console.log(cluster, score); // "depth-1" → 0.35 (35% internal connectivity)
}

// Anomalies detected
analysis.anomalies.forEach(a => console.log("⚠", a));`}</Code>
          <Table
            head={["Detection Method", "What it finds"]}
            rows={[
              ["Isolated nodes", "Nodes with degree ≤ 1 that break connectivity"],
              ["Depth jumps", "Nodes whose depth differs from parent by > 2"],
              ["Long-range edges", "Edges crossing > 3 hierarchy levels"],
              ["Sparse clusters", "Depth groups with < 10% internal coherence"]
            ]}
          />
          <H3>Canvas Renderer</H3>
          <P>
            Interactive Canvas 2D renderer with pan/zoom, node hover/click,
            glow effects, directional arrows, pulse animations, and noise indicators.
            Uses the fractal grid (Cantor set lines) as background.
          </P>

          <H2 id="reports">Reports & Logs</H2>
          <P>
            Markdown-rendered agent interaction logs with activity tracking, metrics
            dashboards, and raw JSON views. Access at{" "}
            <Link to="/reports" className="text-violet-400 hover:underline">/reports</Link>.
          </P>
          <H3>Report Types</H3>
          <Table
            head={["Type", "Content"]}
            rows={[
              ["Agent Run", "Step-by-step execution log with tool calls, timing, and status"],
              ["LLM Interaction", "Prompt/response pairs with token usage and model info"],
              ["Tool Execution", "Input/output for each tool invocation with duration"],
              ["Browser Session", "Navigation, clicks, screenshots, and errors"],
              ["Analytics Query", "SQL/XQL/MDX queries with result sets and timing"]
            ]}
          />
          <H3>Markdown Renderer</H3>
          <P>
            Each report includes a generated markdown view with headers, bold/italic,
            code blocks, inline code, links, lists, blockquotes, tables, and horizontal
            rules — styled with Tailwind typography.
          </P>

          <H2 id="browser-automation">Browser Automation (Phase 2)</H2>
          <P>
            Agent-driven web interaction engine with 15+ actions. Runs in a sandboxed
            iframe, communicates via postMessage. Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-emerald-300">src/lib/agent/browser-automation.ts</code>
          </P>
          <Table
            head={["Action", "Description"]}
            rows={[
              ["navigate", "Load a URL in the session"],
              ["click / type / hover / select", "DOM interaction primitives"],
              ["scroll", "Directional scroll (up/down/left/right)"],
              ["screenshot", "Capture page as PNG/JPEG/WebP"],
              ["extract", "Read text or attributes from DOM selectors"],
              ["execute / evaluate", "Run JavaScript in page context"],
              ["wait", "Wait for selector visibility/presence"],
              ["cookie_set / cookie_get", "Manage session cookies"],
              ["auth", "Handle authentication flows"],
              ["pdf", "Export page as PDF"],
            ]}
          />
          <H3>Automation Pipelines</H3>
          <Code lang="typescript">{`import { executePipeline } from "@/lib/agent/browser-automation";

const result = await executePipeline(sessionId, {
  id: "scrape-job",
  name: "Scrape product data",
  steps: [
    { id: "nav", action: { type: "navigate", url: "https://example.com" }, description: "Load page" },
    { id: "click", action: { type: "click", selector: ".product-card" }, description: "Click product" },
    { id: "extract", action: { type: "extract", selector: ".price" }, description: "Get price" },
  ],
  status: "pending",
  results: [],
});`}</Code>

          <H2 id="cloudflare-os">Cloudflare OS Integration</H2>
          <P>
            Integration layer for edge deployment on Cloudflare's infrastructure.
            Generates Wrangler configs, D1 schemas, Workers scripts, and agent roles.
            Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-pink-300">src/lib/agent/cloudflare-os.ts</code>
          </P>
          <H3>Infrastructure Bindings</H3>
          <Table
            head={["Binding", "Purpose"]}
            rows={[
              ["KV", "State storage for agent configs and tool settings"],
              ["Durable Objects", "Persistent agent sessions and conversation history"],
              ["R2", "File storage for screenshots, exports, and artifacts"],
              ["D1 (SQLite)", "Structured data for analytics queries and agent runs"],
              ["Queues", "Async processing for long-running agent tasks"],
              ["AI Gateway", "LLM caching, rate limiting, and cost control"],
            ]}
          />
          <H3>Agent Roles for Edge</H3>
          <Table
            head={["Role", "Tools", "Storage"]}
            rows={[
              ["Data Analyst", "analytics.sql/xql/mdx + exports", "D1"],
              ["Code Reviewer", "llm.prompt + document.parse + design.audit", "KV"],
              ["Web Scraper", "browser.navigate/extract + analytics", "R2"],
              ["Report Generator", "analytics + all exports", "R2"],
              ["Test Runner", "testing.* tools", "D1"],
            ]}
          />
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
// Creates: agents, agent_runs, tool_executions, analytics_queries,
//          agent_sessions, files tables with indexes`}</Code>
          <H3>Edge Deployment Use Cases</H3>
          <Table
            head={["Use Case", "Architecture", "Example"]}
            rows={[
              ["Edge Agent Deployment", "Worker + Durable Objects + KV", "Customer support agent with <50ms response"],
              ["Multi-Tenant Isolation", "Worker per tenant + D1 per tenant", "SaaS platform with isolated agents"],
              ["Distributed Coordination", "Workers + Queues + Durable Objects", "Data pipeline with message-based handoff"],
              ["Real-Time Monitoring", "Workers + Analytics Engine + R2", "Live dashboard across edge locations"],
              ["Scheduled Execution", "Cron Triggers + Workers + D1", "Hourly security scan agent"],
              ["LLM Caching", "AI Gateway + Workers + KV", "Cache GPT-4 responses at edge"],
            ]}
          />

          <H2 id="sandboxes">Sandbox Environments</H2>
          <P>
            Scenario isolation for running untrusted code and tests. Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-amber-300">src/lib/sandbox/</code>
          </P>
          <P>
            Each sandbox combines four isolation axes: Web Worker execution (separate
            globals), network policy (glob allow/block lists + traffic logging), a
            virtual file system with snapshot/restore, and resource limits (memory +
            wall-clock timeout). Eleven prebuilt scenarios ship out of the box — unit
            test runner, E2E, production-sim, security audit, untrusted code, stress
            test, demo, tutorial, and more.
          </P>
          <Code lang="typescript">{`import { getScenarioManager } from "@/lib/sandbox";

const sbx = await getScenarioManager().createFromScenario("security-audit");
const result = await sbx.execute(untrustedSnippet, { timeoutMs: 10_000 });
await sbx.snapshot("before-experiment");   // restore anytime
await sbx.destroy();`}</Code>

          <H2 id="integrations">Integrations</H2>
          <P>
            Self-contained clients written from scratch against public REST protocols
            (no SDK packages). Source:{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-pink-300">src/lib/integrations/</code>
          </P>
          <Table
            head={["Module", "Covers"]}
            rows={[
              ["git-provider.ts", "Unified Git interface: GitHub / GitLab / Bitbucket REST APIs via raw fetch with pagination + auth headers; SVN via adapter"],
              ["wiki-generator.ts", "Karpathy-style auto-docs: README, architecture, API reference, changelog, decision log — each page carries source files, last commit SHA and token estimate"],
              ["jira-client.ts", "Jira REST: JQL search, issues, comments, worklogs, sprints, epics; Cloud (API token) and Server auth"],
              ["prompts.ts", "Cursor-style reusable prompt library (12 templates), slash commands (12), integration presets (7)"],
            ]}
          />

          <H2 id="tool-store">Tool Store Reference</H2>
          <P>
            Every capability above is exposed as a manifest-driven store tool. Browse
            them live in the{" "}
            <Link to="/store" className="text-violet-400 hover:underline">Tool Store</Link>{" "}
            or read the raw HTTP surface in the{" "}
            <Link to="/api" className="text-violet-400 hover:underline">API reference</Link>.
          </P>
          <Table
            head={["Category", "Tools", "Highlights"]}
            rows={[
              ["Browser Automation & Deep Inspection", "44+", "DOM/network/storage/state/websocket/extension inspection beyond typical automation frameworks"],
              ["Website Testing & Analysis", "10", "Performance metrics, interaction timing, a11y, responsive, security headers, SEO, visual regression"],
              ["Design System & UI Quality", "7", "Audits against Vercel, Fluent 2 and TasteSkill guideline sets encoded in-house"],
              ["Agent Systems", "10", "memory · skills · self-improve · terminal · kanban · scheduler · knowledge · notifications · tracing · approvals"],
              ["Inference & Model Management", "6", "router · probe · quant menu · downloader · legacy advisor · catalog"],
              ["Visual Understanding (ViT)", "6", "On-device vision for screenshots/icons — no external vision APIs"],
              ["Video Editing", "8", "Timeline, overlays, captions, templates/stickers, export"],
              ["Document Parsing", "6", "Steps extraction, tutorial detection, FAQ parsing, script generation"],
              ["LLM Integration + Orchestration", "9", "Prompt building/parsing plus chains.run · chains.agent · graph.run"],
              ["Audio & Speech", "3", "Synthesis, mixing, waveform visualization"],
              ["Sandbox Environments", "8", "create/exec/list/destroy/scenarios/snapshot/files/network"],
              ["Integrations", "5", "wiki generator · git providers · jira · prompts · slash commands"],
              ["Export & Rendering", "2", "Multi-format export of captures and videos"],
            ]}
          />
          <H3>Calling a store tool programmatically</H3>
          <Code lang="typescript">{`import { getStore } from "@/lib/store";

const store = getStore();
const out = await store.execute("chains.run", {
  template: "Summarize {topic}",
  variables: { topic: "stitap" },
});
if (!out.success) throw new Error(out.error);
console.log(out.data); // includes which backend served it`}</Code>
          <Note>
            Executors for the three orchestration tools register automatically with the
            store singleton; other tools register their executors at install time from
            their owning engine module.
          </Note>

          <footer className="mt-16 border-t border-gray-800 pt-6 text-sm text-gray-500">
            stitaP in-house documentation · every engine built from first principles ·
            zero external runtime dependencies ·{" "}
            <Link to="/help" className="text-violet-400 hover:underline">Help center</Link>
          </footer>
        </main>
      </div>
    </div>
  );
}

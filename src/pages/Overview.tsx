import { useState } from "react";
import { Link } from "react-router";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CheckCircle2, ArrowRight, BookOpen } from "lucide-react";

/**
 * Platform Overview — every feature area with a proper overview and the
 * reasons behind its creation. This is the "why" page: the landing page
 * sells, the features page lists, this page explains.
 */

interface Area {
  id: string;
  group: string;
  title: string;
  overview: string;
  reasons: string[];
  capabilities: string[];
  link?: { to: string; label: string };
  manual: string;
}

const AREAS: Area[] = [
  {
    id: "in-house",
    group: "Foundation",
    title: "Zero external dependencies",
    overview:
      "Every engine in stitaP — browser control, image codecs, video editing, PDF writing, git, quantization — is written in-house. Nothing is fetched from npm at runtime and no third-party service is required for any feature to work.",
    reasons: [
      "Air-gapped deployments must work: servers with no internet cannot resolve an npm install or call a vendor API, so every dependency is a place the product can die.",
      "Supply-chain safety: a captured website is untrusted content; running it through unknown third-party code widens the attack surface.",
      "Licensing clarity: code written from documented formats and algorithms (PNG, PDF, GGUF, git) carries no copyleft obligations.",
    ],
    capabilities: ["106 in-house tools", "In-house PDF writer", "In-house git + SVN sync", "In-house codecs and quantizer"],
    link: { to: "/docs", label: "Architecture docs" },
    manual: "Chapters 2–3",
  },
  {
    id: "router",
    group: "Intelligence",
    title: "Hardware-aware inference router",
    overview:
      "At startup the router probes what the machine can actually use — Intel CPU/iGPU/NPU via OpenVINO, Apple ANE, Snapdragon QNN, or plain llama.cpp on CPU — without ever asking for admin rights, then benchmarks the candidates and keeps the fastest for your workload.",
    reasons: [
      "Hardcoded preference orders break: relative performance depends on the model, quant level, context length, and thermal state, so measurement beats assumptions.",
      "Privilege-free probing means a missing driver degrades gracefully to CPU instead of blocking the product.",
      "Benchmark results are cached per device fingerprint, so the cost is paid once, not per session.",
    ],
    capabilities: ["10 backend kinds probed", "Throughput vs latency modes", "Fail-soft on every check", "Cached per device"],
    link: { to: "/notebook", label: "Evaluate your hardware" },
    manual: "Chapter 4",
  },
  {
    id: "models",
    group: "Intelligence",
    title: "Model downloads with Hugging Face authentication",
    overview:
      "GGUF models arrive through a torrent-style downloader: chunked, parallel, resumable from the last verified byte, and integrity-checked against the published SHA256. Gated repositories accept a Hugging Face access token sent as a Bearer header.",
    reasons: [
      "Model files reach tens of gigabytes; a naive download that restarts from zero after any disconnect is unusable on real networks.",
      "Per-chunk hashing plus a final full-file check catches corruption that either check alone would miss.",
      "Gated models (Llama, Gemma) require authenticated, license-accepted access — the token is never persisted with download state.",
    ],
    capabilities: ["HTTP Range resumption", "Parallel chunks", "SHA256 verification", "Bearer auth for gated repos"],
    link: { to: "/notebook", label: "Download a model" },
    manual: "Chapter 5",
  },
  {
    id: "quantizer",
    group: "Intelligence",
    title: "In-house quantizer: 1-bit to 8-bit builds",
    overview:
      "The quantizer converts original FP16 weights into Q8_0, Q4_K_M, Q3_K, Q2_K, importance-weighted IQ2/IQ3, and BitNet-style b1.58 ternary builds using the GGUF block scheme — then verifies each build's error against a per-level tolerance before offering it.",
    reasons: [
      "Fitting a useful model on a 15-year-old server or a 4 GB laptop requires sub-4-bit builds; refusing to make them would exclude the hardware this platform targets.",
      "The manual's rules are encoded as refusals: never requantize an already-quantized file, never convert a dense model to ternary, never build IQ without calibration — because each of those silently destroys quality.",
      "Verification before trust: a 2-bit build that answers ten fixed questions wrongly is worse than no build, so the planner says so up front.",
    ],
    capabilities: ["Importance-matrix calibration", "Build planner with fit verdicts", "Per-level error verification", "BitNet b1.58 ternary"],
    link: { to: "/notebook", label: "Create builds" },
    manual: "Chapters 5–6, Part I ch. F6",
  },
  {
    id: "notebook",
    group: "Intelligence",
    title: "The Notebook",
    overview:
      "A NotebookLM-style chat with a Configure panel that walks from 'what can my machine run?' to a working session in five steps: evaluate hardware, pick a family, download, create and verify builds, then choose chat, an agents playground, or API keys.",
    reasons: [
      "The gap between 'I have a laptop' and 'I have a running agent' is where most local-AI products lose people — the wizard closes it without a terminal.",
      "Suggestions must be sized to the actual machine: the same wizard that probed your RAM picks the builds that fit it.",
      "One surface for the whole suite means configuration lives next to conversation, not in a separate settings app.",
    ],
    capabilities: ["Local hardware probe", "Build planning + download", "Chat / agents / API choice", "Session budgets wired"],
    link: { to: "/notebook", label: "Open the Notebook" },
    manual: "Chapter 6",
  },
  {
    id: "failover",
    group: "Intelligence",
    title: "Free-provider failover",
    overview:
      "Nine permanent free API tiers (Groq, Cerebras, OpenRouter, Google AI Studio, Mistral, GitHub Models, Cloudflare, NVIDIA NIM, Cohere) form one pool. When a vendor rate-limits, exhausts its day, or goes down, the router shifts to the next healthy provider in the background — the conversation just continues.",
    reasons: [
      "Free tiers cut off without warning; an agent swarm that dies because one vendor returned 429 is unusable for long runs.",
      "Chat APIs are stateless, so failover costs nothing: the conversation is resent to the next endpoint and the user is told after the fact, never prompted mid-task.",
      "Circuit breakers with escalating cooldowns and half-open probes stop retry storms from burning the remaining quota.",
    ],
    capabilities: ["Circuit breaker per provider", "Key-level vs provider-level failures", "Local daily-quota tracking", "Visible shift log"],
    link: { to: "/notebook", label: "Add free keys" },
    manual: "Chapter 6",
  },
  {
    id: "keys",
    group: "Intelligence",
    title: "API key analysis: one key or many?",
    overview:
      "Before scaling a swarm on paid APIs, the analyzer answers with numbers: a key's ceiling is the minimum of its requests-per-minute, tokens-per-minute, and concurrency limits, divided by per-agent demand — so you know whether one key serves your N agents or you need several, ranked across all major providers.",
    reasons: [
      "Rate-limit surprises surface at the worst time: mid-run, with agents half-finished. Computing the crossover before launching prevents it.",
      "Key rotation beats key proliferation: the analyzer recommends the smallest number of keys and how to assign them.",
      "The hybrid path — local GGUF for planner/reviewer roles, paid APIs for coder/tester — often halves cost at no quality loss.",
    ],
    capabilities: ["RPM/TPM/concurrency math", "All providers ranked", "Rotation guidance", "Hybrid local+API suggestion"],
    link: { to: "/notebook", label: "Analyze keys" },
    manual: "Chapter 6",
  },
  {
    id: "studio",
    group: "Agent platform",
    title: "Agent Studio: roles, knowledge scope, tool principles",
    overview:
      "The Studio is where agents are defined: one of eight roles with fixed responsibilities, a notebook-style document list (PDFs, links, notes) per agent, the browse-or-confine internet checkbox, tool scope drawn from the store with a basic principle per tool, and solution templates like capture-and-attach-to-ticket.",
    reasons: [
      "An agent without a declared scope is unauditable: rendering the exact system prompt from the configuration makes every grant reviewable before run time.",
      "The confined policy is enforced, not decorative: a confined agent with enabled web sources is refused at save, because 'it should stay on my material' must be a guarantee.",
      "Per-tool principles turn blanket permissions into rules a small model can actually follow.",
    ],
    capabilities: ["8 roles with responsibilities", "Docs multiselect + policy checkbox", "106-tool scope + principles", "Scope-prompt preview"],
    link: { to: "/studio", label: "Open the Studio" },
    manual: "Chapter 7",
  },
  {
    id: "templates",
    group: "Agent platform",
    title: "Solution templates",
    overview:
      "Reusable accomplishment recipes: WHEN a milestone passes, DO an action, USING a tool. The flagship template captures a screenshot after each story's acceptance criteria pass, annotates it, and attaches it to the agent's assigned Jira ticket as evidence.",
    reasons: [
      "Teams repeat the same proof rituals per story; encoding them once makes every agent produce identical, comparable evidence.",
      "Templates compose with tool scope: a template's steps only fire for tools the agent was granted, so templates can never escalate permissions.",
      "Evidence attached at the moment of accomplishment is worth more than a reconstructed report at the end.",
    ],
    capabilities: ["Capture & attach to ticket", "Implement → verify → commit", "Audit & report", "Docs from diff"],
    link: { to: "/studio", label: "Attach a template" },
    manual: "Chapter 7",
  },
  {
    id: "workspace",
    group: "Agent platform",
    title: "Team workspace and internal-first sync",
    overview:
      "Multiple users create tasks, assign defined agents, and give structured feedback — approve closes the work, request-changes sends the agent back with comments. Agent checkins always land on the internal git; GitHub, GitLab, and ticketing systems receive content only at your chosen cadence.",
    reasons: [
      "Supervision is the missing half of autonomy: agents that report state (green working, amber awaiting approval, rose blocked) can be supervised by humans who are not watching logs.",
      "An agent checkin must never be a side effect that reaches a public remote — internal-first sync makes external pushes an explicit, scheduled decision.",
      "Structured verdicts (approve / request-changes / comment) give small models an unambiguous signal, unlike freeform chat feedback.",
    ],
    capabilities: ["Multi-user task board", "Structured feedback verdicts", "Live state colors", "Internal-always, external opt-in"],
    link: { to: "/studio", label: "Open the workspace" },
    manual: "Chapter 7",
  },
  {
    id: "swarms",
    group: "Agent platform",
    title: "Swarm orchestrator",
    overview:
      "Sizing from physical cores and RAM with the GGUF memory formula, five topologies (hierarchical, mesh, ring, star, pipeline), a six-role ladder, and a strictly-ordered blackboard: workers exchange digests, never raw transcripts.",
    reasons: [
      "Swarm size must derive from the machine, not ambition — an oversized swarm thrashes memory and serves fewer tokens than a small one.",
      "Digests beat transcripts for small models: a strictly-ordered summary costs hundreds of tokens where a transcript costs tens of thousands.",
      "Loops give agents self-correction: plan → execute → critique → revise catches failures mid-run instead of propagating them.",
    ],
    capabilities: ["Spec-based sizing", "Five topologies", "Blackboard digests", "Checkpointed long runs"],
    link: { to: "/agents", label: "See topologies" },
    manual: "Chapter 11",
  },
  {
    id: "enterprise",
    group: "Agent platform",
    title: "Enterprise long-running runner",
    overview:
      "Company-scale projects: load guideline packs once, plan a migration as a dependency tree of user stories, commit the plan to git, open epic tickets, then develop, test, and document each story — with a use-case verification gate before anything closes.",
    reasons: [
      "Weeks-long runs need survivability: checkpointing at phase boundaries means a crash resumes instead of restarting.",
      "Company guidelines must reach every worker as token-budgeted prompt subsets, not as a wiki nobody reads.",
      "No story closes because an LLM said so: the verification gate requires evidence against the original use cases.",
    ],
    capabilities: ["Guideline packs", "Story-tree planning", "Kanban + Jira sync", "Verification gates"],
    link: { to: "/agents", label: "See the pipeline" },
    manual: "Chapter 12",
  },
  {
    id: "ops",
    group: "Agent platform",
    title: "Agent operations layer",
    overview:
      "The operational spine: scheduled jobs, a retrieval-augmented knowledge base, notifications with dedupe and quiet hours, run tracing with waterfall postmortems, a human approval gate, and persistent memory — all in-house, all SLM-friendly.",
    reasons: [
      "Long-running agents must reach humans without polling: severity rules and dedupe windows turn a failure storm into one alert.",
      "Tracing is how postmortems happen: span waterfalls show where a run spent time and tokens.",
      "Approval gates put humans exactly at the risky decisions and nowhere else.",
    ],
    capabilities: ["scheduler.jobs", "knowledge.search", "trace.runs", "approvals.gate"],
    link: { to: "/agents", label: "Browse ops modules" },
    manual: "Chapter 13",
  },
  {
    id: "store",
    group: "Agent platform",
    title: "Tool store: 106 agent-ready tools",
    overview:
      "A catalog of manifest-plus-executor pairs across fifteen categories — deep browser inspection, network capture, framework-state extraction, testing, vision, media — each with declared permissions, sandboxing, and SLM-friendly output shapes.",
    reasons: [
      "Agents are only as capable as their tools: inspection depth (shadow DOM, network, framework state) lets a small model see the API contract instead of guessing it.",
      "Permission declarations make sandboxing enforceable: a tool that never declared network access cannot make network calls.",
      "Token-shaped outputs: every tool returns the smallest structured result that answers the question, because output size is the real budget.",
    ],
    capabilities: ["Permission-declared", "Sandboxed execution", "Offline-capable majority", "Per-tool documentation"],
    link: { to: "/store", label: "Browse the store" },
    manual: "Chapters 9, 21+",
  },
  {
    id: "media",
    group: "Suite",
    title: "Capture, recorder, and video editor",
    overview:
      "Snagit-style SVG capture in three fidelity modes, a screen recorder with instant annotation, and a full browser-based video editor — all usable directly and all callable by agents as ordinary tools.",
    reasons: [
      "Media capabilities are one tool family among many: agents capture evidence, record procedures, and edit tutorials like they call any other tool.",
      "Portable-image SVG gives the highest fidelity with native annotation editability; hybrid and native-vector modes trade fidelity for editability, labeled honestly.",
      "The in-house codecs exist so air-gapped servers can still export video.",
    ],
    capabilities: ["Three SVG capture modes", "Region + full-page capture", "Multi-track editor", "Agent-callable"],
    link: { to: "/features", label: "Feature catalog" },
    manual: "Chapter 18",
  },
  {
    id: "security",
    group: "Suite",
    title: "Security and sandboxing",
    overview:
      "Captured content is untrusted: browser workers run sandboxed with memory, CPU, and time limits; URLs pass SSRF validation; SVG output is sanitized and script-free; encrypted SVG packages are readable only by this platform.",
    reasons: [
      "A malicious page can attempt local-network requests, spawn oversized canvases, or generate millions of DOM nodes — isolation is a requirement, not a feature.",
      "The sandbox levels (none, basic, full) are tested per OS so the guarantees hold where the product runs.",
      "Encrypted SVG protects the metadata that doubles as automation scripts for capture-once-regenerate workflows.",
    ],
    capabilities: ["SSRF validation", "Sandbox isolation levels", "SVG sanitization", "Encrypted SVG packages"],
    link: { to: "/features#security", label: "Security features" },
    manual: "Chapter 15",
  },
];

const GROUPS = [...new Set(AREAS.map((a) => a.group))];

export default function Overview() {
  const [active, setActive] = useState<string>(AREAS[0].id);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-200">
      <SiteNav />
      <div className="mx-auto max-w-7xl px-4 py-10">
        <header className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-400">Platform overview</p>
          <h1 className="mt-3 font-serif text-3xl tracking-tight text-white md:text-4xl">
            Every feature, what it is, and why it exists.
          </h1>
          <p className="mt-4 text-[14px] leading-7 text-gray-400">
            The landing page introduces, the feature catalog lists — this page explains. Each area below
            carries a proper overview, the concrete reasons that forced its design, and a link to the
            live surface. The downloadable manual expands every reason into a full chapter.
          </p>
        </header>

        {/* Section rail */}
        <nav className="sticky top-16 z-10 mt-8 flex gap-2 overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-2 backdrop-blur">
          {GROUPS.map((g) => (
            <div key={g} className="flex shrink-0 items-center gap-2">
              <span className="px-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">{g}</span>
              {AREAS.filter((a) => a.group === g).map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setActive(a.id); document.getElementById(a.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  className={`rounded-lg px-3 py-1.5 text-[12px] transition ${
                    active === a.id ? "bg-cyan-600 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {a.title.split(":")[0]}
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-white/10" />
            </div>
          ))}
        </nav>

        {/* Areas */}
        <div className="mt-8 space-y-6">
          {AREAS.map((a) => (
            <section key={a.id} id={a.id} className="scroll-mt-32 rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold text-white">{a.title}</h2>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">{a.group} · manual {a.manual}</span>
              </div>
              <p className="mt-3 max-w-3xl text-[13.5px] leading-7 text-zinc-300">{a.overview}</p>

              <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400">Why it exists</h3>
              <ul className="mt-2 max-w-3xl space-y-2">
                {a.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] leading-6 text-zinc-400">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cyan-500" />
                    {r}
                  </li>
                ))}
              </ul>

              <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">What you get</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {a.capabilities.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[11.5px] text-zinc-300">
                    <CheckCircle2 className="size-3 text-emerald-400" />{c}
                  </span>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {a.link && (
                  <Link to={a.link.to} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-cyan-500">
                    {a.link.label} <ArrowRight className="size-4" />
                  </Link>
                )}
                <Link to="/docs/pdf" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-[13px] text-zinc-300 transition hover:border-white/40 hover:text-white">
                  <BookOpen className="size-4" /> Read the chapter (PDF)
                </Link>
              </div>
            </section>
          ))}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

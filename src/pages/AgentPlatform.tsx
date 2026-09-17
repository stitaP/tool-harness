/**
 * Agent Platform — the front door to stitaP's full agentic stack.
 *
 * /agents used to be just the visual workflow builder, which undersold the
 * platform: 30 toggleable session modules, spec-sized swarms, a week-long
 * enterprise runner with git/jira sync and verification gates, agent-ops
 * (scheduler/RAG/tracing/approvals/notifications), two orchestration engines,
 * and a hardware-aware inference router. This page surfaces all of it with
 * live counts pulled from the real registries — nothing hardcoded.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight, Boxes, BrainCircuit, CalendarClock, CheckCircle2, Database,
  FileSearch, GitBranch, Bell, ShieldCheck, Workflow as WorkflowIcon,
  Users, Layers, Cpu, KanbanSquare, ScrollText, Activity, Network, Play,
} from "lucide-react";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { MODULE_REGISTRY, SESSION_PRESETS } from "@/lib/session";
import type { ModuleCategory } from "@/lib/session";
import { ALL_TOOLS, CATEGORIES } from "@/lib/store";
import { WorkflowBuilder } from "./Agents";

type Tab = "overview" | "builder" | "swarms" | "enterprise" | "ops";

const TABS: Array<{ id: Tab; label: string; icon: typeof Boxes }> = [
  { id: "overview", label: "Overview", icon: Boxes },
  { id: "builder", label: "Workflow Builder", icon: WorkflowIcon },
  { id: "swarms", label: "Swarms", icon: Users },
  { id: "enterprise", label: "Enterprise Runs", icon: GitBranch },
  { id: "ops", label: "Ops & Memory", icon: Activity },
];

const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  capture: "Capture", browser: "Browser", testing: "Testing", design: "Design QA",
  vision: "Vision", video: "Video", audio: "Audio", document: "Documents",
  orchestration: "Orchestration", agent: "Agent Systems", inference: "Inference",
  sandbox: "Sandbox", integrations: "Integrations", enterprise: "Enterprise",
};

const TOPOLOGIES = [
  { name: "Hierarchical", desc: "A supervisor delegates to role workers and consolidates results on the blackboard. Best default for plan-execute-verify work.", icon: Layers },
  { name: "Mesh", desc: "Peers coordinate directly through the shared blackboard. Best for exploratory tasks with no clear authority order.", icon: Network },
  { name: "Pipeline", desc: "Strict stage ordering: planner → coder → tester → reviewer → documenter. Best for linear delivery flows.", icon: ArrowRight },
  { name: "Star", desc: "One coordinator routes every message. Cheapest context overhead; single point of scheduling.", icon: Cpu },
  { name: "Ring", desc: "Work passes around the loop until a verifier accepts it. Natural fit for iterative refinement cycles.", icon: Activity },
];

const ROLES = [
  { role: "Planner", what: "Decomposes goals into dependency-ordered stories; writes them to kanban and commits the plan." },
  { role: "Coder", what: "Implements one story at a time against company guideline packs." },
  { role: "Tester", what: "Runs verification suites; attaches evidence before any story can close." },
  { role: "Reviewer", what: "Checks use-case coverage and guideline compliance; rejects stories back into the loop." },
  { role: "Documenter", what: "Publishes docs per module so the verification gate has artifacts to check." },
  { role: "Verifier", what: "Final acceptance gate: acceptance criteria vs delivered evidence." },
];

const OPS_MODULES = [
  { icon: CalendarClock, id: "scheduler.jobs", title: "Task Scheduler", desc: "Cron-lite + interval automations with failure budgets that disable flapping jobs automatically." },
  { icon: Database, id: "knowledge.search", title: "Knowledge Base (RAG)", desc: "Fully local vector store: dual-hash embeddings, overlap chunking, stemming, token-budgeted retrieval for SLMs. No model download needed." },
  { icon: Bell, id: "notify.send", title: "Notifications", desc: "Severity rules, quiet hours, dedupe windows that collapse swarm failure storms into one alert, retrying queue." },
  { icon: Activity, id: "trace.runs", title: "Run Tracing", desc: "Span trees per run with token accounting; waterfall postmortems linked straight into Jira comments." },
  { icon: ShieldCheck, id: "approvals.gate", title: "Approval Gate", desc: "Human-in-the-loop risk policies (balanced/strict/autonomous) with TTL expiry — queues never clog, runs never deadlock." },
  { icon: BrainCircuit, id: "agent.memory", title: "Persistent Memory", desc: "Cross-session memory layer so agents remember decisions, preferences, and project state between runs." },
  { icon: KanbanSquare, id: "agent.kanban", title: "Kanban Boards", desc: "Multi-agent task boards with per-story develop→test→document flow and blocked/review states." },
  { icon: FileSearch, id: "doc.parse", title: "Document Parsing", desc: "Ingest help files, wikis, and PDFs into structured steps that feed tutorials, RAG, and migration planning." },
];

export default function AgentPlatform() {
  const [tab, setTab] = useState<Tab>("overview");

  const stats = useMemo(() => {
    const agentModules = MODULE_REGISTRY.filter((m) => m.category === "agent").length;
    const offline = MODULE_REGISTRY.filter((m) => m.offline).length;
    return {
      modules: MODULE_REGISTRY.length,
      agentModules,
      offline,
      tools: ALL_TOOLS.length,
      slmFriendly: ALL_TOOLS.filter((t) => t.slmFriendly).length,
      presets: Object.keys(SESSION_PRESETS).length,
    };
  }, []);

  const byCategory = useMemo(() => {
    const map = new Map<ModuleCategory, number>();
    for (const m of MODULE_REGISTRY) map.set(m.category, (map.get(m.category) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-800/80">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35]" style={{ backgroundImage: "radial-gradient(circle at 20% 10%, rgba(99,102,241,.25), transparent 45%), radial-gradient(circle at 80% 30%, rgba(34,211,238,.18), transparent 40%)" }} />
        <div className="relative mx-auto max-w-7xl px-6 py-16">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-400">The full agentic platform</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
            Not a workflow tool.{" "}
            <span className="stitap-gradient bg-clip-text text-transparent">An agent operating system.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Compose chat sessions from {stats.modules} toggleable modules, size swarms to your hardware,
            run week-long enterprise migrations that commit plans to git and sync Jira tickets —
            all served by an inference router that benchmarks your machine and picks the fastest backend.
            Every engine is in-house and works air-gapped.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/modules" className="stitap-gradient inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90">
              Compose a Session <ArrowRight className="size-4" />
            </Link>
            <button onClick={() => setTab("swarms")} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500">
              <Users className="size-4" /> See Swarm Engine
            </button>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Session modules", String(stats.modules)],
              ["Agent-systems modules", String(stats.agentModules)],
              ["Store tools", String(stats.tools)],
              ["SLM-friendly tools", String(stats.slmFriendly)],
              ["Offline-capable modules", `${stats.offline}/${stats.modules}`],
              ["External dependencies", "0"],
            ].map(([label, value]) => (
              <div key={label} className="bg-zinc-950 px-4 py-3">
                <div className="text-xl font-bold text-white">{value}</div>
                <div className="text-[11px] text-zinc-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="sticky top-[57px] z-30 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${
                tab === id ? "border-violet-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-10 pb-24">
        {/* ─── Overview ─────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-14">
            <section>
              <h2 className="text-xl font-bold text-white">What lives in this harness</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <CapCard
                  to="/studio" icon={Users} accent="from-rose-500/20"
                  title="Agent Studio"
                  desc="Define agents: role responsibilities, knowledge docs (PDFs, links) with a browse-or-confine checkbox, tool scope with per-tool principles, solution templates like capture-and-attach-to-Jira, team assignments, feedback, and internal-first git sync."
                  cta="Open the studio"
                />
                <CapCard
                  to="/modules" icon={Boxes} accent="from-violet-500/20"
                  title="Session Modules Notebook"
                  desc={`${stats.modules} modules you check on/off per chat session. Enabling resolves dependencies; disabling cascades safely. ${stats.presets} presets including SLM Minimal (<1.2K prompt overhead) and Air-Gapped.`}
                  cta="Open the notebook"
                />
                <CapCard
                  onClick={() => setTab("swarms")} icon={Users} accent="from-cyan-500/20"
                  title="Swarm Orchestrator"
                  desc="Spec-based sizing from physical cores and RAM with the GGUF memory formula. Five topologies, six roles, strictly-ordered blackboard digests instead of raw transcripts."
                  cta="See topologies & sizing"
                />
                <CapCard
                  onClick={() => setTab("enterprise")} icon={GitBranch} accent="from-emerald-500/20"
                  title="Enterprise Long-Running Runner"
                  desc="Plans migrate projects as user-story trees, commits the plan to git/GitHub, opens epic tickets, then develops/tests/documents each story with a use-case verification gate before anything closes."
                  cta="See the pipeline"
                />
                <CapCard
                  onClick={() => setTab("ops")} icon={Activity} accent="from-amber-500/20"
                  title="Agent Ops Layer"
                  desc="Scheduler, RAG knowledge base, notifications, run tracing, approval gate, persistent memory, kanban boards — the operational spine Hermes-class agents need, all in-house."
                  cta="Browse ops modules"
                />
                <CapCard
                  to="/store" icon={ScrollText} accent="from-blue-500/20"
                  title="Tool Store — 100+ tools"
                  desc={`${ALL_TOOLS.length} manifest+executor pairs across ${Object.keys(CATEGORIES).length ?? "15"} categories: deep browser inspection, network capture, framework-state extraction, website testing, vision, media. Permission-declared, sandboxed.`}
                  cta="Browse the store"
                />
                <CapCard
                  to="/docs#inference" icon={Cpu} accent="from-fuchsia-500/20"
                  title="Hardware-Aware Inference Router"
                  desc="Probes OpenVINO/iGPU/NPU, llama.cpp CPU/Vulkan/Metal/CUDA, and mobile NPUs privilege-free; benchmarks each and picks the fastest measured winner for your workload."
                  cta="Read how routing works"
                />
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">Two orchestration engines — one purpose each</h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                Modeled on the best patterns of LangChain and LangGraph, written fresh in-house.
                Graph-and-loop methodology (conditional edges, critique cycles, checkpointing) is what
                keeps swarms coherent over long horizons.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <EngineCard
                  name="stitap-chains" file="src/lib/chains"
                  points={["Runnable pipe composition · few-shot PromptTemplates", "LLMChain → model → parser, SequentialChain variable passing", "ReAct AgentExecutor binding store tools into model-driven loops", "Deterministic fallback responder: chains run with no model installed"]}
                />
                <EngineCard
                  name="stitap-graph" file="src/lib/graph/state-graph.ts"
                  points={["Typed StateGraph: channels with reducers, conditional edges, cycles", "START/END sentinels + mid-flight checkpoint/resume", "Critique-retry loops are first-class edges, not hacks", "Same machinery powers swarm supervisor topologies"]}
                />
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">Module registry, live</h2>
              <p className="mt-2 text-sm text-zinc-400">Counts below come straight from <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-cyan-300">MODULE_REGISTRY</code> — same source the notebook page renders.</p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {byCategory.map(([cat, n]) => (
                  <Link key={cat} to="/modules" className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 transition-colors hover:border-zinc-600">
                    <div className="text-lg font-bold text-white">{n}</div>
                    <div className="text-[11px] text-zinc-500">{CATEGORY_LABELS[cat]}</div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ─── Swarms ───────────────────────────────────────────── */}
        {tab === "swarms" && (
          <div className="space-y-12">
            <section>
              <h2 className="text-xl font-bold text-white">Five topologies</h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                The orchestrator picks topology and worker count from your actual hardware — never a
                hardcoded preference. Workers share a strictly-ordered blackboard of token-efficient digests.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {TOPOLOGIES.map(({ name, desc, icon: Icon }) => (
                  <div key={name} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition-colors hover:border-zinc-700">
                    <Icon className="size-5 text-cyan-400" />
                    <h3 className="mt-3 font-semibold text-white">{name}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{desc}</p>
                  </div>
                ))}
                <div className="stitap-gradient rounded-xl p-5">
                  <h3 className="font-semibold text-white">Try it on your specs</h3>
                  <p className="mt-1.5 text-[13px] leading-snug text-indigo-100">
                    The Modules page has a live configurator: enter cores, RAM, model params and bits — see recommended workers and the sizing rationale.
                  </p>
                  <Link to="/modules#swarm" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25">
                    Open configurator <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">Role ladder</h2>
              <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                {ROLES.map((r, i) => (
                  <div key={r.role} className={`flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6 ${i % 2 ? "bg-zinc-900/40" : "bg-zinc-950"}`}>
                    <span className="w-24 shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-violet-300">{r.role}</span>
                    <span className="text-[13px] text-zinc-400">{r.what}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">Graphs + loops = stable swarms</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
                Linear chains drift. stitaP swarms run on stitap-graph state machines: bounded worker contexts,
                digest-based communication, explicit verification gates before hand-off, and checkpointed graph
                state so any crash resumes instead of restarting. The supervisor's critique loop re-dispatches
                failed branches without touching healthy ones — this is the graphs-and-loops methodology that
                makes groups of agents maintainable over days, not minutes.
              </p>
            </section>
          </div>
        )}

        {/* ─── Enterprise ───────────────────────────────────────── */}
        {tab === "enterprise" && (
          <div className="space-y-12">
            <section>
              <h2 className="text-xl font-bold text-white">Week-long autonomous migrations, gated at every step</h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                The LongRunningRunner checkpoints every phase, so reboots and crashes resume at phase granularity.
                Human approval gates can pause specific stories by risk level without deadlocking the queue.
              </p>
              <div className="mt-6 grid gap-3 lg:grid-cols-6">
                {[
                  { step: "01 Plan", desc: "Goal → dependency tree of user stories, ordered onto the kanban board." },
                  { step: "02 Commit", desc: "Plan committed to git/GitHub; epic ticket opened in Jira." },
                  { step: "03 Develop", desc: "Coder implements each story under company guideline packs." },
                  { step: "04 Test", desc: "Tester runs suites and attaches evidence to the story." },
                  { step: "05 Document", desc: "Documenter publishes per-module docs — required by the gate." },
                  { step: "06 Verify", desc: "Acceptance criteria checked against evidence before close; Jira commented with trace waterfall." },
                ].map((s, i) => (
                  <div key={s.step} className="relative rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                    <span className="font-mono text-[10px] font-bold tracking-widest text-cyan-400">{s.step}</span>
                    <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{s.desc}</p>
                    {i < 5 && <ArrowRight className="absolute -right-3 top-1/2 hidden size-4 -translate-y-1/2 text-zinc-600 lg:block" />}
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <ScrollText className="size-5 text-emerald-400" />
                <h3 className="mt-3 font-semibold text-white">Guideline packs</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
                  Load your coding/testing/review/docs/security standards once. Each role receives only its relevant sections, truncated to a token cap — guidelines shape behavior without blowing SLM context budgets.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <GitBranch className="size-5 text-violet-400" />
                <h3 className="mt-3 font-semibold text-white">Your git, your tickets</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
                  Protocol-level in-house clients for git plus adapters for external providers and SVN. Jira comments land at every phase boundary with trace links attached.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <ShieldCheck className="size-5 text-amber-400" />
                <h3 className="mt-3 font-semibold text-white">Use-case verification gate</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
                  No story closes because an LLM said it was done. Acceptance criteria must match delivered artifacts — tests green, docs published — or the story loops back.
                </p>
              </div>
            </section>

            <section>
              <CodeSample lines={[
                "new LongRunningRunner(project, pack, ports, {",
                "  tracer, notify, approvals,  // ops integration — all optional",
                "  storyRisk: 'medium',        // omit for ungated runs",
                "})",
                "// plan() -> commit -> epic ticket -> per-story dev/test/docs",
                "//         -> verification gate -> jira comment -> checkpoint",
              ]} caption="Enterprise runner API (src/lib/workflow/enterprise.ts)" />
            </section>
          </div>
        )}

        {/* ─── Ops & Memory ─────────────────────────────────────── */}
        {tab === "ops" && (
          <div className="space-y-10">
            <section>
              <h2 className="text-xl font-bold text-white">The operational spine</h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                Everything below is registered in the module notebook — enable what your session needs;
                disabled tools report cleanly and the planner routes around them.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {OPS_MODULES.map(({ icon: Icon, id, title, desc }) => (
                  <div key={id} className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition-colors hover:border-zinc-600">
                    <Icon className="size-5 text-violet-400" />
                    <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{desc}</p>
                    <code className="mt-3 block font-mono text-[10px] text-cyan-500/80">{id}</code>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">Why this matters for small models</h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-400">
                <p className="flex gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /> Digest-based blackboards keep multi-agent context inside SLM windows — hundreds of tokens, not transcripts.</p>
                <p className="flex gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /> RAG embeddings are deterministic dual-hash: zero model download, zero network, still precise enough that unrelated content scores near zero.</p>
                <p className="flex gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /> Every ops module declares its token overhead; the session budget shows exactly what enabling it costs on a 3B model with a 4K window.</p>
              </div>
            </section>
          </div>
        )}

        {/* ─── Builder tab ──────────────────────────────────────── */}
        {tab === "builder" && (
          <div>
            <p className="-mt-2 mb-6 max-w-3xl text-sm text-zinc-400">
              Prefer visual composition? Chain any of the store's tools, LLM calls, conditions, and loops
              into a runnable workflow graph — then hand the same workflow to a swarm or schedule it.
            </p>
            <WorkflowBuilder />
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

// ─── Small building blocks ──────────────────────────────────────────

function CapCard({
  icon: Icon, title, desc, cta, to, onClick, accent,
}: {
  icon: typeof Boxes;
  title: string;
  desc: string;
  cta: string;
  to?: string;
  onClick?: () => void;
  accent: string;
}) {
  const inner = (
    <>
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent} to-transparent`} />
      <Icon className="size-5 text-violet-400" />
      <h3 className="mt-3 font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{desc}</p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 group-hover:text-cyan-300">
        {cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </>
  );
  const cls =
    "group relative block rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-left transition-colors hover:border-zinc-600";
  return to ? (
    <Link to={to} className={cls}>{inner}</Link>
  ) : (
    <button onClick={onClick} className={`${cls} w-full`}>{inner}</button>
  );
}

function EngineCard({ name, file, points }: { name: string; file: string; points: string[] }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono font-bold text-white">{name}</h3>
        <code className="font-mono text-[10px] text-zinc-500">{file}</code>
      </div>
      <ul className="mt-3 space-y-2">
        {points.map((pt) => (
          <li key={pt} className="flex gap-2 text-[13px] leading-relaxed text-zinc-400">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-500" /> {pt}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CodeSample({ lines, caption }: { lines: string[]; caption: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs text-zinc-400">{caption}</div>
      <pre className="overflow-x-auto bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-200">
        <code>{lines.join("\n")}</code>
      </pre>
    </div>
  );
}

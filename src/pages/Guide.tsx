import { useState } from "react";
import { Link } from "react-router";
import { SiteNav } from "@/components/site/SiteNav";
import { PdfManualButton } from "@/components/site/PdfManualButton";
import type { ReactNode } from "react";

/**
 * The stitaP Textbook — an interactive guide to how every subsystem works,
 * why it exists, and how to get the best token throughput from GGUF models
 * on any hardware (personal laptop → 15-year-old server → NPU machines).
 */

interface Chapter {
  id: string;
  num: string;
  title: string;
  summary: string;
  body: ReactNode;
}

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

function Why({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 rounded-lg border-l-4 border-emerald-500 bg-emerald-500/10 px-4 py-3 text-sm text-gray-300">
      <span className="font-semibold text-emerald-400">Why it was built this way: </span>
      {children}
    </div>
  );
}

const CHAPTERS: Chapter[] = [
  {
    id: "intro",
    num: "01",
    title: "The Big Picture",
    summary: "One independent tool store; every module synchronized for throughput.",
    body: (
      <>
        <p className="mt-3 leading-relaxed text-gray-300">
          stitaP is a single harness with an independent tool store at its center.
          Nothing is imported from orchestration frameworks — chains, graphs, swarms,
          vision, testing and inference are all written in this repository. What makes
          it a <em>framework</em> rather than a library pile is synchronization: when
          you toggle modules in your notebook session or resize a swarm, the same
          budget object flows to the inference router, which re-tunes batch sizes,
          KV-cache policy and performance mode.
        </p>
        <Code lang="typescript">{`// src/lib/store/registry.ts — built-in executors register on the singleton
const BUILTIN_EXECUTORS = {
  "chains.run": chainsRun,
  "swarm.configure": swarmConfigure,
  "session.modules": sessionModules,
  ...
};
export function getStore(): ToolStore {
  if (!_store) { _store = new ToolStore(); registerBuiltins(_store); }
  return _store;
}`}</Code>
      </>
    ),
  },
  {
    id: "gguf",
    num: "02",
    title: "GGUFs on Any Hardware",
    summary: "Personal laptops, old servers, NPUs — best output from whatever you own.",
    body: (
      <>
        <p className="mt-3 leading-relaxed text-gray-300">
          The device prober never asks for admin rights. It checks what you can{" "}
          <em>use</em>, not what exists: group membership for <code>/dev/dri</code> on
          Linux, driver presence queries on Windows, vendor SDK reads on mobile.
          Anything unavailable fails soft and the router routes around it — worst case
          you run CPU inference via llama.cpp, which needs no privileges anywhere.
        </p>
        <Why>
          A missing driver should downgrade speed, never break a session. Privilege-free
          probing means the same binary runs identically on a locked-down corporate
          laptop and a home server.
        </Why>
        <h3 className="mt-6 font-semibold text-white">Memory math that drives everything</h3>
        <Code lang="typescript">{`// src/lib/agent/swarm.ts — the one formula used everywhere
function estimateModelMemoryBytes(model: ModelSlot): number {
  // params × bits/8 × 1.2 overhead (KV cache + runtime)
  return Math.floor(model.parameterBillions * 1e9 * (model.bitsPerWeight / 8) * 1.2);
}`}</Code>
        <p className="mt-3 leading-relaxed text-gray-300">
          A 3B model at Q4_K_M ≈ 3 × 0.5 × 1.2 ≈ 1.8 GB — comfortable on almost any
          laptop. A 70B at Q4 ≈ 42 GB — old dual-socket servers with lots of RAM can do
          it, but see chapter 4 for NUMA caveats. The quantization menu always shows
          this estimate next to expected tokens/sec so you trade consciously; Q4_K_M is
          the default sweet spot, step up to Q8 only if output quality visibly degrades.
        </p>
        <p className="mt-3 leading-relaxed text-gray-300">
          Prefer API keys over local GGUFs? Everything degrades gracefully: register a
          model hook and the router stops managing local backends while session budgets
          keep working unchanged.
        </p>
      </>
    ),
  },
  {
    id: "old-servers",
    num: "03",
    title: "15-Year-Old Servers",
    summary: "Static cross-compiles, instruction-set honesty, NUMA awareness.",
    body: (
      <>
        <p className="mt-3 leading-relaxed text-gray-300">
          Old hardware fails in three separate layers: kernel syscalls (rarely the
          blocker), userspace libraries (<code>glibc</code>/<code>libstdc++</code> — the real blocker),
          and GGUF format support inside llama.cpp itself. Only the middle layer needs
          fixing, and static linking fixes it without touching the OS.
        </p>
        <Code lang="bash">{`# Build on a modern machine, target the OLD server's CPU exactly:
cargo build --release \\
  -Z build-std=std,panic_abort \\
  -Z build-std-features=panic_immediate_abort \\
  --target x86_64-unknown-linux-musl   # carries its own libc
RUSTFLAGS="-C target-cpu=core2"         # honest ISA: no silent AVX2 fallback`}</Code>
        <Why>
          Compiling with generic x86_64 flags on a pre-AVX2 Xeon loads fine but runs
          quantized matmuls on scalar fallback paths — several times slower with no
          error message. Matching <code>-march</code>/<code>-target-cpu</code> to the actual silicon
          recovers the performance the specs promise. On multi-socket boxes, pin
          threads and memory to the same NUMA node or cross-socket traffic eats the
          headroom.
        </Why>
      </>
    ),
  },
  {
    id: "sessions",
    num: "04",
    title: "Notebook Session Modules",
    summary: "Check modules on/off per chat; the budget syncs everywhere.",
    body: (
      <>
        <p className="mt-3 leading-relaxed text-gray-300">
          Every module declares its context overhead in tokens. Enabling resolves
          dependencies automatically (Deep Inspection pulls Browser Core); disabling
          cascades to dependents so nothing half-loaded survives. Four presets cover
          the common cases — SLM Minimal keeps the injected system prompt under ~1K
          tokens for ≤3B models.
        </p>
        <Code lang="typescript">{`// src/lib/session/modules.ts — dependency-aware toggling
export function setModuleEnabled(state, id, on) {
  let enabled = state.enabled;
  if (on) enabled = resolveEnable(enabled, id);   // pull deps in
  else enabled = resolveDisable(enabled, id);     // push dependents out
  return { ...state, enabled, profile: "custom", ... };
}`}</Code>
        <Why>
          SLMs drown in big system prompts. Budget-per-module turns "what's loaded"
          into arithmetic the router can act on: few modules → latency mode, many →
          throughput mode, all automatic.
        </Why>
      </>
    ),
  },
  {
    id: "swarms",
    num: "05",
    title: "Swarms Sized to Your Machine",
    summary: "Workers clamped by physical cores and RAM; shared instances win.",
    body: (
      <>
        <Code lang="typescript">{`// src/lib/agent/swarm.ts — spec-based sizing
const spare = usableRamBytes - perWorker - usableRamBytes * 0.25;
maxByRam   = spare > 0 ? 1 + floor(spare / perWorker) : 1;
maxByCores = max(1, physicalCores - 1);       // serving proc needs one
recommended = min(desired, maxByRam, maxByCores);`}</Code>
        <p className="mt-3 leading-relaxed text-gray-300">
          Five topologies map work differently: hierarchical (coordinator fans out —
          best for planning-heavy projects), pipeline (planner→coder→tester→documenter —
          best for migration lines), mesh (peer review), ring (round-robin critique),
          star (hub consolidation). A shared blackboard carries topics like{" "}
          <code>plan</code>, <code>issues</code>, <code>decisions</code> between workers with a
          token-efficient digest for small models.
        </p>
        <Why>
          Two 3B workers on an 8-core machine are slower than one worker serving both
          roles batched. The sizer prefers a shared instance and says why in plain
          language — no silent decisions.
        </Why>
      </>
    ),
  },
  {
    id: "enterprise",
    num: "06",
    title: "Enterprise Long-Running Agents",
    summary: "Guidelines in, weeks-long governed execution out.",
    body: (
      <>
        <p className="mt-3 leading-relaxed text-gray-300">
          Companies load their rules once as a <strong>guideline pack</strong>. Each worker role
          receives only the sections relevant to it, truncated to a token cap — a coder
          gets coding+security, a tester gets testing+security, never the whole binder.
        </p>
        <Code lang="typescript">{`// src/lib/workflow/enterprise.ts — role-scoped, budgeted guidelines
guidelinesForRole(pack, "coder");
// → "# Acme Guidelines (coder)\\n## coding\\n…\\n## security\\n…"  (≤ maxTokensPerWorker)`}</Code>
        <p className="mt-3 leading-relaxed text-gray-300">
          A <strong>migration project</strong> (language port or version upgrade) becomes a
          dependency tree of user stories. The long-running runner then executes the
          loop you asked for: plan stories → commit the plan to git/GitHub → per story:
          develop → test → document on kanban → verify purpose &amp; use-cases before
          closing, mirroring status to Jira tickets along the way. Every phase writes a
          checkpoint, so a run survives restarts and continues across days.
        </p>
        <Code lang="typescript">{`const runner = new LongRunningRunner(project, pack, {
  gitCommit: (msg, files) => github.commit(msg, files),
  createTicket: (t, b) => jira.create(t, b),
});
await runner.plan(board, "py2go");            // phase: committed
while (await runner.stepStory(board, devFn));  // runs for days if needed
runner.checkpoint();                           // resumable state`}</Code>
        <Why>
          Verification is a gate, not a report: a story only reaches <code>verified</code>{" "}
          when every declared use-case has recorded passing evidence. That is the
          difference between agents that claim done and teams that prove it.
        </Why>
      </>
    ),
  },
  {
    id: "throughput",
    num: "07",
    title: "Throughput Synchronization",
    summary: "One budget object tunes every layer.",
    body: (
      <>
        <Code lang="typescript">{`computeBudget(state, { modelContextWindow })
// → { totalContextOverheadTokens, recommendedContextWindow,
//     workloadMode: latency | balanced | throughput }`}</Code>
        <p className="mt-3 leading-relaxed text-gray-300">
          The router maps workload mode to backend settings: latency trims batches and
          enables KV-cache persistence for snappy replies; throughput raises micro-batch
          sizes and uses speculative decoding for structured output (tool calls are
          low-entropy — drafts verify well, typically 1.5–2.5×). Thread counts follow
          physical cores, never logical ones.
        </p>
      </>
    ),
  },
];

export default function Guide() {
  const [active, setActive] = useState(CHAPTERS[0].id);

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <SiteNav />
      <div className="mx-auto max-w-7xl px-6 pt-6">
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-transparent px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-sm text-gray-300">
            Prefer offline reading? The <span className="font-semibold text-white">interactive textbook</span> is also available as a single PDF with every chapter and code reference.
          </p>
          <PdfManualButton />
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        {/* Chapter rail */}
        <aside className="sticky top-4 hidden h-fit w-64 flex-shrink-0 lg:block">
          <nav className="space-y-1">
            {CHAPTERS.map((c) => (
              <button
                key={c.id}
                onClick={() => jump(c.id)}
                className={`block w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  active === c.id ? "bg-violet-500/15 text-violet-200" : "text-gray-400 hover:bg-gray-900"
                }`}
              >
                <span className="mr-2 font-mono text-xs text-gray-600">{c.num}</span>
                <span className="text-sm">{c.title}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-16 pb-24">
          <div>
            <h2 className="text-3xl font-bold text-white">How every feature was built — and why</h2>
            <p className="mt-2 text-gray-400">
              Seven short chapters, each with the real code behind it. Written to be read
              end-to-end, then kept open as a reference.
            </p>
          </div>

          {CHAPTERS.map((c) => (
            <section key={c.id} id={c.id} className="scroll-mt-20 rounded-xl border border-gray-800 bg-gray-900/40 p-6">
              <p className="font-mono text-sm text-violet-400">Chapter {c.num}</p>
              <h3 className="mt-1 text-2xl font-bold text-white">{c.title}</h3>
              <p className="mt-1 text-sm italic text-gray-500">{c.summary}</p>
              <div className="mt-4">{c.body}</div>
            </section>
          ))}

          <footer className="border-t border-gray-800 pt-6 text-sm text-gray-500">
            Continue to the{" "}
            <Link to="/docs" className="text-violet-400 hover:underline">reference docs</Link>,{" "}
            <Link to="/tutorials" className="text-violet-400 hover:underline">tutorials</Link>, or configure your first session in{" "}
            <Link to="/modules" className="text-violet-400 hover:underline">Session Configuration</Link>.
          </footer>
        </main>
      </div>
    </div>
  );
}

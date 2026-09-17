import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, Camera, MonitorPlay, Film, Brain, Cpu, Shield, Lock,
  Boxes, GitBranch, Layers, Server, Laptop, Zap, TerminalSquare, CheckCircle2,
  Scissors, RefreshCw, Download, Bot,
} from "lucide-react";
import { Link } from "react-router";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

const STATS = [
  { value: "106", label: "in-house tools" },
  { value: "10", label: "agent systems" },
  { value: "19", label: "catalog entries" },
  { value: "0", label: "external dependencies" },
];

const PILLARS = [
  {
    icon: Camera,
    tag: "Capture",
    title: "Any webpage → editable SVG",
    body: "Real-browser rendering, full-page scroll stitching, frozen fixed elements. Portable-image, hybrid editable and native-vector output modes with on-device OCR.",
    href: "/features#capture",
  },
  {
    icon: MonitorPlay,
    tag: "Record",
    title: "Screen & region recording",
    body: "Full screen, region or window with system audio, mic, click highlights and webcam overlay — plus native OS capture backends in the desktop app.",
    href: "/recorder",
  },
  {
    icon: Film,
    tag: "Edit",
    title: "Browser video editor",
    body: "Multi-track timeline, transitions, color grades, stickers, text animations and a synthesized audio library. Export WebM, MP4, GIF — fully offline.",
    href: "/editor",
  },
  {
    icon: Brain,
    tag: "Automate",
    title: "SLM tutorial studio",
    body: "Point it at a website's help docs; a small language model plans, captures, narrates and renders a finished tutorial video — on your machine.",
    href: "/tools",
  },
];

const TERMINAL_LINES = [
  { prompt: true, text: "stitap session --profile balanced" },
  { out: true, text: "✓ 12 modules enabled · overhead 1.8K tokens · window 8K" },
  { prompt: true, text: "swarm plan --task 'migrate app v1 → v2'" },
  { out: true, text: "sizing: 6 workers (8 cores / 32GB / Q4_K_M 7B)" },
  { out: true, text: "topology: hierarchical · router: openvino-igpu @ 41 t/s" },
  { prompt: true, text: "run --kanban --jira --git" },
  { out: true, text: "[story 3/14] develop → test → docs ✓ verified" },
  { out: true, text: "[trace] 42 spans · 18.2K tokens · waterfall saved" },
  { ok: true, text: "epic OPS-142 updated · commit 9f3c1ab pushed" },
];

function HeroTerminal() {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setVisible((v) => (v >= TERMINAL_LINES.length ? 0 : v + 1)),
      900,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/90 shadow-2xl shadow-indigo-950/40">
      <div className="animated-border h-px w-full opacity-70" />
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-red-500/80" />
        <span className="size-2.5 rounded-full bg-yellow-500/80" />
        <span className="size-2.5 rounded-full bg-green-500/80" />
        <span className="ml-2 font-mono text-[11px] text-zinc-500">stitap — zsh</span>
      </div>
      <div className="h-[248px] space-y-2 p-4 font-mono text-[12px] leading-relaxed">
        {TERMINAL_LINES.slice(0, visible).map((line, i) => (
          <div key={i}>
            {line.prompt && (
              <span>
                <span className="text-cyan-400">➜</span> <span className="text-zinc-300">{line.text}</span>
              </span>
            )}
            {line.out && <span className="text-zinc-500">{line.text}</span>}
            {line.ok && <span className="text-emerald-400">{line.text}</span>}
          </div>
        ))}
        <span className="inline-block h-4 w-2 animate-pulse bg-cyan-400 align-middle" />
      </div>
    </div>
  );
}

const MODULES_DEMO = [
  { name: "Inference Router", on: true, note: "openvino-igpu" },
  { name: "Swarm Engine", on: true, note: "6 workers" },
  { name: "Knowledge Base", on: true, note: "local RAG" },
  { name: "Run Tracing", on: true, note: "spans + tokens" },
  { name: "Approval Gate", on: false, note: "" },
  { name: "Video Editor", on: false, note: "" },
];

const HARDWARE = [
  {
    icon: Laptop,
    title: "Personal laptop",
    body: "GGUF Q4_K_M on CPU/iGPU via llama.cpp or OpenVINO. Memory-mapped loads, speculative decoding for structured tool calls.",
  },
  {
    icon: Cpu,
    title: "Modern NPU silicon",
    body: "Intel NPU / Snapdragon Hexagon / Apple ANE probed privilege-free; INT4 group-wise quant for bandwidth-bound devices.",
  },
  {
    icon: Server,
    title: "15-year-old server",
    body: "Static musl cross-compiles, honest -march flags, NUMA-aware pinning. Old glibc is never touched — the binary brings its own runtime.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteNav />

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mesh-bg relative overflow-hidden border-b border-zinc-800">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[11px] font-medium text-zinc-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              Open source · offline-first · zero external dependencies
            </div>
            <h1 className="mt-6 font-serif text-4xl leading-[1.08] tracking-tight text-white md:text-6xl">
              The agent harness that runs
              <br />
              <span className="stitap-text-gradient">on hardware you own.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-zinc-400">
              stitaP is an agentic AI tool harness. Compose sessions from 30
              toggleable modules, run swarms sized to your machine, and govern
              week-long autonomous projects — served by an inference router that
              benchmarks your CPU, GPU, or NPU. 106 in-house tools included;
              capture and video are simply tools your agents can call.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/store"
                className="cta-glow group inline-flex items-center gap-2 rounded-lg stitap-gradient px-6 py-3 text-[14px] font-semibold text-white transition-transform hover:scale-[1.02]"
              >
                Launch the app
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/notebook"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-6 py-3 text-[14px] font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                <Bot className="size-4" />
                Open Notebook
              </Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-4 gap-4 border-t border-zinc-800 pt-6">
              {STATS.map((s) => (
                <div key={s.label}>
                  <div className="font-mono text-xl font-bold text-white">{s.value}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{s.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
            className="float-anim"
          >
            <HeroTerminal />
          </motion.div>
        </div>
      </section>

      {/* ─── Pillars ──────────────────────────────────────────────────────── */}
      <section className="geo-pattern border-b border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-400">Four products, one platform</p>
          <h2 className="mt-3 max-w-2xl font-serif text-3xl tracking-tight text-white md:text-4xl">
            Everything a creator needs — and everything an agent needs.
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {PILLARS.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.tag}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                >
                  <Link
                    to={p.href}
                    className="group block h-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:-translate-y-1 hover:border-indigo-500/50 hover:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid size-10 place-items-center rounded-lg border border-zinc-700 bg-zinc-800">
                        <Icon className="size-5 text-cyan-400" />
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">{p.tag}</span>
                    </div>
                    <h3 className="mt-4 text-[15px] font-semibold text-white">{p.title}</h3>
                    <p className="mt-2 text-[13px] leading-6 text-zinc-400">{p.body}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100">
                      Open <ArrowRight className="size-3.5" />
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Agent Harness ────────────────────────────────────────────────── */}
      <section id="harness" className="border-b border-zinc-800">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-400">The agent harness</p>
            <h2 className="mt-3 font-serif text-3xl tracking-tight text-white md:text-4xl">
              A notebook of modules. A swarm of workers. One token budget.
            </h2>
            <ul className="mt-8 space-y-4">
              {[
                { icon: Layers, title: "Notebook module composition", body: "Check modules on/off per chat session — dependencies resolve automatically and the live budget tunes context windows for models as small as 1B." },
                { icon: GitBranch, title: "Swarms sized to your silicon", body: "Hierarchical, mesh, ring or pipeline topologies sized from physical cores and RAM. Workers share a blackboard; long runs checkpoint for days." },
                { icon: Zap, title: "Benchmark-driven routing", body: "OpenVINO, llama.cpp, mobile NPUs — nothing is hardcoded. The router benchmarks what's actually available without elevation and picks the fastest." },
                { icon: Shield, title: "Human-in-the-loop where it matters", body: "Per-risk approval policies gate risky actions; tracing spans and notifications keep week-long runs observable." },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <li key={f.title} className="flex gap-4">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-zinc-800 bg-zinc-900">
                      <Icon className="size-4 text-cyan-400" />
                    </span>
                    <div>
                      <h3 className="text-[14px] font-semibold text-white">{f.title}</h3>
                      <p className="mt-1 text-[13px] leading-6 text-zinc-400">{f.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/modules" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200">
                Configure modules
                <ArrowRight className="size-4" />
              </Link>
              <Link to="/agents" className="rounded-lg border border-zinc-700 px-5 py-2.5 text-[13px] font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white">
                Explore the agent platform
              </Link>
            </div>
          </div>

          {/* Modules mockup */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">session.modules</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">balanced preset</span>
            </div>
            <div className="mt-4 space-y-2.5">
              {MODULES_DEMO.map((m) => (
                <div key={m.name} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-3.5 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-4 place-items-center rounded border ${m.on ? "border-emerald-500 bg-emerald-500/20" : "border-zinc-700"}`}>
                      {m.on && <CheckCircle2 className="size-3 text-emerald-400" />}
                    </span>
                    <span className="text-[13px] font-medium text-zinc-200">{m.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-600">{m.note || "off"}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-800 pt-4 text-center">
              {[["1.8K", "overhead"], ["8K", "window"], ["41 t/s", "router"]].map(([v, l]) => (
                <div key={l} className="rounded-lg bg-zinc-950/60 py-2">
                  <div className="font-mono text-[13px] font-bold text-white">{v}</div>
                  <div className="text-[10px] text-zinc-500">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Notebook suite ───────────────────────────────────────────────── */}
      <section id="notebook" className="border-b border-zinc-800">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
          {/* Notebook mockup */}
          <div className="order-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-2xl shadow-black/40 lg:order-1">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">notebook · configure</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">auto-failover on</span>
            </div>
            <div className="mt-4 space-y-2">
              {[
                ["1 · Hardware", "16 GB RAM · 8 threads · 3 backends", "done"],
                ["2 · Model", "Qwen2.5-3B → 4 builds planned", "done"],
                ["3 · Download", "Q4_K_M 2.1 GB · resumable · HF token", "done"],
                ["4 · Builds", "IQ2_XS verified · 3.1% rel. error", "done"],
                ["5 · Interface", "Agents playground → 4 workers", "live"],
              ].map(([step, detail, state]) => (
                <div key={step} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-3.5 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-4 place-items-center rounded-full border ${state === "live" ? "border-cyan-500 bg-cyan-500/20" : "border-emerald-500 bg-emerald-500/20"}`}>
                      <CheckCircle2 className="size-3 text-emerald-400" />
                    </span>
                    <span className="text-[13px] font-medium text-zinc-200">{step}</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500">{detail}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">free-provider pool</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[["Groq", "healthy", "text-emerald-400"], ["Cerebras", "serving", "text-cyan-400"], ["Mistral", "cooling", "text-amber-400"]].map(([n, s, c]) => (
                  <div key={n} className="rounded-lg bg-zinc-900 py-2">
                    <div className="text-[12px] font-semibold text-white">{n}</div>
                    <div className={`font-mono text-[10px] ${c}`}>{s}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 font-mono text-[10px] text-zinc-600">shift: groq rate-limited → cerebras · session uninterrupted</p>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-400">The Notebook</p>
            <h2 className="mt-3 font-serif text-3xl tracking-tight text-white md:text-4xl">
              From \"what can my machine run?\" to working agents in five steps.
            </h2>
            <ul className="mt-8 space-y-4">
              {[
                { icon: Cpu, title: "Evaluate the hardware", body: "One local probe: RAM, cores, and which inference backends run without admin rights. Every suggestion is sized to your actual machine." },
                { icon: Scissors, title: "Create small-bit builds", body: "The in-house quantizer plans how many builds to make — Q8 to Q4 to IQ2 to b1.58 — verifies each one, and refuses the conversions that would destroy a model." },
                { icon: Download, title: "Download like a torrent", body: "Chunked, parallel, resumable GGUF downloads with Hugging Face authentication for gated models. A disconnect never restarts from zero." },
                { icon: RefreshCw, title: "Never lose a vendor", body: "Nine permanent free tiers in one pool. When one rate-limits or goes down, the notebook shifts to the next in the background — the conversation just continues." },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <li key={f.title} className="flex gap-4">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-zinc-800 bg-zinc-900">
                      <Icon className="size-4 text-cyan-400" />
                    </span>
                    <div>
                      <h3 className="text-[14px] font-semibold text-white">{f.title}</h3>
                      <p className="mt-1 text-[13px] leading-6 text-zinc-400">{f.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/notebook" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200">
                Open the Notebook
                <ArrowRight className="size-4" />
              </Link>
              <Link to="/features#notebook" className="rounded-lg border border-zinc-700 px-5 py-2.5 text-[13px] font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white">
                Feature details
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Hardware spectrum ────────────────────────────────────────────── */}
      <section className="mesh-bg border-b border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-400">Runs where you are</p>
          <h2 className="mt-3 max-w-2xl font-serif text-3xl tracking-tight text-white md:text-4xl">
            From a pocket laptop to a forgotten server rack.
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {HARDWARE.map((h) => {
              const Icon = h.icon;
              return (
                <div key={h.title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                  <Icon className="size-6 text-cyan-400" />
                  <h3 className="mt-4 text-[15px] font-semibold text-white">{h.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-400">{h.body}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-[12px] text-zinc-500">
            <TerminalSquare className="size-4" />
            <span className="font-mono">
              params × bits ÷ 8 × 1.2 = memory footprint — the sizing math behind every recommendation
            </span>
          </div>
        </div>
      </section>

      {/* ─── Self-contained ───────────────────────────────────────────────── */}
      <section className="border-b border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-400">Truly independent</p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-white md:text-4xl">
                No npm. No cloud. No permission slips.
              </h2>
              <p className="mt-5 text-[14px] leading-7 text-zinc-400">
                The capture engine, HTTP server, PNG encoder, SVG serializer,
                vision model runner, video editor, orchestration graph, RAG store
                and every integration client are written from scratch. Deploy on
                an air-gapped network and nothing breaks.
              </p>
              <Link to="/docs" className="mt-6 inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-[13px] font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white">
                Read how it&apos;s built
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { icon: Cpu, title: "From-scratch engine", body: "Rust core: HTTP, WebSocket, CDP client, PNG codec, sandboxing." },
                { icon: Lock, title: "Encrypted packages", body: "AES-GCM capture bundles only stitaP can read. No vendor lock." },
                { icon: Boxes, title: "Own model stack", body: "Quant menus, resumable GGUF downloads, requant decision trees." },
                { icon: GitBranch, title: "Native integrations", body: "GitHub/GitLab/Jira REST clients hand-written against public protocols." },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                    <Icon className="size-5 text-cyan-400" />
                    <h3 className="mt-3 text-[14px] font-semibold text-white">{f.title}</h3>
                    <p className="mt-1.5 text-[12px] leading-5 text-zinc-500">{f.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────────────── */}
      <section className="stitap-gradient relative overflow-hidden">
        <div className="relative mx-auto max-w-7xl px-6 py-24 text-center">
          <h2 className="mx-auto max-w-3xl font-serif text-3xl tracking-tight text-white md:text-5xl">
            Your captures. Your agents. Your hardware.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[14px] leading-7 text-white/70">
            Sign in and start instantly — no API key, no setup, no telemetry.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/store"
              className="group inline-flex items-center gap-2 rounded-lg bg-white px-7 py-3 text-[14px] font-semibold text-indigo-950 transition-transform hover:scale-[1.03]"
            >
              Get started free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link to="/downloads" className="rounded-lg border border-white/30 px-7 py-3 text-[14px] font-medium text-white transition-colors hover:border-white/70">
              Download for desktop
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

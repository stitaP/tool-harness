import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Terminal,
  ArrowRight,
  ArrowDown,
  Package,
  Cpu,
  Bot,
  FileText,
  Puzzle,
  Settings,
  Play,
  Globe,
  Zap,
} from "lucide-react";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

/* ── Helpers ────────────────────────────────────────────────────────────── */

function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-zinc-200">
      {label && (
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-1.5 text-[11px] font-medium text-zinc-500">
          {label}
        </div>
      )}
      <div className="flex items-center justify-between bg-zinc-950 px-4 py-3">
        <code className="flex-1 font-mono text-[12.5px] leading-relaxed text-zinc-300">
          {code}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="ml-3 shrink-0 rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckCircle2 className="size-3.5 text-green-400" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  duration,
  children,
}: {
  number: number;
  title: string;
  duration?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative pl-16 pb-12 last:pb-0">
      {/* Connector line */}
      <div className="absolute left-[19px] top-10 bottom-0 w-px bg-zinc-200 last:hidden" />
      {/* Step circle */}
      <div className="absolute left-0 top-0 flex size-10 items-center justify-center rounded-full border-2 border-zinc-900 bg-white text-[14px] font-bold text-zinc-900">
        {number}
      </div>
      <div>
        <div className="flex items-baseline gap-3">
          <h3 className="text-[18px] font-semibold text-zinc-900">{title}</h3>
          {duration && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-500">
              {duration}
            </span>
          )}
        </div>
        <div className="mt-3 text-[14px] leading-7 text-zinc-600">{children}</div>
      </div>
    </div>
  );
}

function Callout({
  type = "info",
  children,
}: {
  type?: "info" | "warning" | "success" | "tip";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-blue-200 bg-blue-50 text-blue-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    success: "border-green-200 bg-green-50 text-green-800",
    tip: "border-violet-200 bg-violet-50 text-violet-800",
  };
  const labels = {
    info: "ℹ️  Note",
    warning: "⚠️  Important",
    success: "✅  Success",
    tip: "💡  Tip",
  };
  return (
    <div className={`my-4 rounded-lg border-l-4 px-4 py-3 text-[13px] leading-6 ${styles[type]}`}>
      <span className="font-semibold">{labels[type]}</span>
      <span className="ml-2">{children}</span>
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5 text-[13.5px] text-zinc-600">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-500" />
      <span>{children}</span>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

const CHAPTERS = [
  { id: "overview", label: "Overview" },
  { id: "prerequisites", label: "Prerequisites" },
  { id: "download", label: "Download" },
  { id: "unzip", label: "Unzip & Install" },
  { id: "verify", label: "Verify Build" },
  { id: "first-run", label: "First Run" },
  { id: "tool-store", label: "Tool Store" },
  { id: "notebook-setup", label: "Notebook Setup" },
  { id: "first-model", label: "First Model" },
  { id: "first-agent", label: "First Agent" },
  { id: "capture", label: "Screen Capture" },
  { id: "extension", label: "Browser Extension" },
  { id: "advanced", label: "Advanced Topics" },
  { id: "next-steps", label: "Next Steps" },
];

export default function Tutorial() {
  const [activeChapter, setActiveChapter] = useState("overview");
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveChapter(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    CHAPTERS.forEach((ch) => {
      const el = document.getElementById(ch.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <SiteNav />

      {/* Hero */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 pb-12 pt-16 md:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-medium text-zinc-500">
              <Play className="size-3.5" />
              Interactive Tutorial
            </p>
            <h1 className="mt-6 max-w-3xl font-serif text-[40px] leading-[1.1] tracking-tight text-zinc-900 md:text-[52px]">
              From download to running agent
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-zinc-500">
              A complete, hands-on walkthrough. Follow each step in order — you will go from
              a downloaded zip file to a working agentic AI harness with tools, models, and
              agents on your own machine.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-[12px] text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Terminal className="size-3.5" /> Command line required
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu className="size-3.5" /> Works on 4 GB RAM minimum
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="size-3.5" /> Fully offline after setup
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="size-3.5" /> ~20 minutes total
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-10">
        {/* Sidebar */}
        <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-56 shrink-0 overflow-y-auto lg:block">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            On this page
          </p>
          <nav className="space-y-0.5">
            {CHAPTERS.map((ch) => (
              <a
                key={ch.id}
                href={`#${ch.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(ch.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`block rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                  activeChapter === ch.id
                    ? "bg-zinc-900 font-medium text-white"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {ch.label}
              </a>
            ))}
          </nav>
          <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px] leading-5 text-zinc-500">
            <strong className="text-zinc-700">Prerequisites:</strong> A terminal, 4 GB RAM,
            and an internet connection for the initial download only.
          </div>
        </aside>

        {/* Main content */}
        <main ref={mainRef} className="min-w-0 flex-1 pb-24">
          {/* ── Overview ── */}
          <section id="overview" className="scroll-mt-20 pb-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              What you will build
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-600">
              By the end of this tutorial, you will have:
            </p>
            <div className="mt-3 space-y-1">
              <CheckItem>The stitaP capture engine running (Rust binary, fully offline)</CheckItem>
              <CheckItem>The web app running in your browser with all 106 tools</CheckItem>
              <CheckItem>An AI model downloaded and running locally on your hardware</CheckItem>
              <CheckItem>A chat interface where you can talk to the model</CheckItem>
              <CheckItem>An agents playground where multiple AI workers collaborate</CheckItem>
              <CheckItem>A browser extension installed for one-click screen capture</CheckItem>
              <CheckItem>The Agent Studio configured with defined roles and tool scope</CheckItem>
            </div>
            <Callout type="info">
              stitaP is 100% open source and has zero external runtime dependencies. Every engine — capture, inference, orchestration, testing — is written from scratch. After setup, everything runs on your machine without internet.
            </Callout>
          </section>

          <hr className="border-zinc-200" />

          {/* ── Prerequisites ── */}
          <section id="prerequisites" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 1 · Prerequisites
            </h2>
            <p className="mt-4 text-[14px] leading-7 text-zinc-600">
              You need two tools installed before starting. Both are free and take under a minute each.
            </p>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 p-5">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-8 place-items-center rounded-lg bg-orange-100">
                    <Terminal className="size-4 text-orange-600" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-zinc-900">Rust compiler</h3>
                </div>
                <p className="mt-3 text-[13px] leading-6 text-zinc-500">
                  Required to build the capture engine and desktop app. One-time install.
                </p>
                <CopyBlock
                  label="macOS / Linux"
                  code='curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh'
                />
                <CopyBlock label="Verify" code="rustc --version" />
                <p className="mt-2 text-[12px] text-zinc-400">
                  Windows: download rustup-init.exe from{" "}
                  <a href="https://rustup.rs" className="text-indigo-500 hover:underline" target="_blank" rel="noreferrer">
                    rustup.rs
                  </a>{" "}
                  and run it.
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 p-5">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-8 place-items-center rounded-lg bg-pink-100">
                    <Package className="size-4 text-pink-600" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-zinc-900">Bun runtime</h3>
                </div>
                <p className="mt-3 text-[13px] leading-6 text-zinc-500">
                  Required for the web app, build scripts, and test suites. One-time install.
                </p>
                <CopyBlock label="All platforms" code="curl -fsSL https://bun.sh/install | bash" />
                <CopyBlock label="Verify" code="bun --version" />
                <p className="mt-2 text-[12px] text-zinc-400">Must show version 1.0 or higher.</p>
              </div>
            </div>

            <Callout type="tip">
              Linux users also need:{" "}
              <code className="rounded bg-violet-100 px-1.5 py-0.5 text-[12px]">
                sudo apt install build-essential pkg-config libssl-dev libwebkit2gtk-4.1-dev libgtk-3-dev
              </code>
            </Callout>
          </section>

          <hr className="border-zinc-200" />

          {/* ── Download ── */}
          <section id="download" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 2 · Download the source code
            </h2>
            <p className="mt-4 text-[14px] leading-7 text-zinc-600">
              Download the complete stitaP source code as a zip file. This includes the Rust engine,
              Tauri desktop app, React web app, browser extension, all 106 tools, and documentation.
            </p>

            <div className="mt-6 rounded-xl border border-zinc-200 bg-[#fafaf9] p-6">
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="/releases/stitap-source-v0.6.0.zip"
                  download
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700"
                >
                  <Download className="size-4" />
                  Download stitap-source-v0.6.0.zip
                </a>
                <span className="text-[12px] text-zinc-400">~15 MB · MIT License</span>
              </div>
              <p className="mt-4 text-[13px] leading-6 text-zinc-500">
                Alternatively, use the pre-built installers if you do not want to build from source.
                See the{" "}
                <Link to="/downloads" className="text-indigo-500 hover:underline">
                  Downloads page
                </Link>{" "}
                for Windows .exe, macOS .dmg, and Linux AppImage.
              </p>
            </div>
          </section>

          <hr className="border-zinc-200" />

          {/* ── Unzip & Install ── */}
          <section id="unzip" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 3 · Unzip and install dependencies
            </h2>
            <p className="mt-4 text-[14px] leading-7 text-zinc-600">
              Open a terminal and navigate to where you saved the zip file.
            </p>

            <Step number={1} title="Unzip the archive" duration="30 seconds">
              <CopyBlock
                label="macOS / Linux"
                code="unzip stitap-source-v0.6.0.zip && cd stitap"
              />
              <p className="text-[13px] text-zinc-500">
                Windows: right-click the zip → Extract All → open the extracted folder in Terminal.
              </p>
            </Step>

            <Step number={2} title="Install build dependencies" duration="1 minute">
              <CopyBlock label="From the project root" code="bun install" />
              <p className="text-[13px] text-zinc-500">
                This installs only the build tooling (Vite, TypeScript, Tailwind). The actual
                engines are all in-house — zero npm runtime dependencies. You will see a{" "}
                <code className="rounded bg-zinc-100 px-1 text-[12px]">node_modules/</code> folder
                appear — this is expected and only used at build time.
              </p>
            </Step>
          </section>

          <hr className="border-zinc-200" />

          {/* ── Verify Build ── */}
          <section id="verify" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 4 · Verify everything compiles
            </h2>

            <Step number={3} title="Run the TypeScript type checker" duration="30 seconds">
              <CopyBlock label="From the project root" code="bun tsc -b --noEmit" />
              <Callout type="success">
                You should see zero errors. The command prints nothing on success — it just returns to
                the prompt. If you see errors, make sure Rust and Bun installed correctly and that{" "}
                <code>bun install</code> completed.
              </Callout>
            </Step>

            <Step number={4} title="Run a quick smoke test" duration="30 seconds">
              <CopyBlock label="Verify the tool registry works" code="bun scripts/store-smoke.ts" />
              <p className="text-[13px] text-zinc-500">
                You should see hundreds of checks passing (840+). This confirms the core engine is functional.
              </p>
            </Step>
          </section>

          <hr className="border-zinc-200" />

          {/* ── First Run ── */}
          <section id="first-run" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 5 · Start the web app
            </h2>

            <Step number={5} title="Launch the development server" duration="10 seconds">
              <CopyBlock label="Start the app" code="bun run dev" />
              <p className="text-[13px] text-zinc-500">
                After a moment, you will see output like:
              </p>
              <CopyBlock
                code="  VITE v7.x.x  ready in 300 ms\n\n  ➜  Local:   http://localhost:5173/"
              />
            </Step>

            <Step number={6} title="Open in your browser">
              <p className="text-[13.5px] text-zinc-600">
                Open{" "}
                <a
                  href="http://localhost:5173"
                  className="font-medium text-indigo-600 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  http://localhost:5173
                </a>{" "}
                in Chrome, Firefox, or Edge. You should see the stitaP homepage.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Link
                  to="/store"
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 transition-all hover:border-zinc-900"
                >
                  <div className="grid size-9 place-items-center rounded-lg bg-violet-100">
                    <Package className="size-4.5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-zinc-900">Tool Store →</p>
                    <p className="text-[11px] text-zinc-400">Browse all 106 in-house tools</p>
                  </div>
                </Link>
                <Link
                  to="/notebook"
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 transition-all hover:border-zinc-900"
                >
                  <div className="grid size-9 place-items-center rounded-lg bg-blue-100">
                    <Bot className="size-4.5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-zinc-900">Notebook →</p>
                    <p className="text-[11px] text-zinc-400">Chat, agents, model download</p>
                  </div>
                </Link>
              </div>
            </Step>
          </section>

          <hr className="border-zinc-200" />

          {/* ── Tool Store ── */}
          <section id="tool-store" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 6 · Explore the Tool Store
            </h2>

            <p className="text-[14px] leading-7 text-zinc-600">
              Navigate to <code className="rounded bg-zinc-100 px-1.5 text-[13px]">/store</code> in
              your browser. The store shows every tool organized by category:
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { cat: "Browser Automation", count: "44 tools", desc: "DOM, network, storage, state inspection" },
                { cat: "Website Testing", count: "10 tools", desc: "Performance, a11y, SEO, visual regression" },
                { cat: "Design System QA", count: "7 tools", desc: "Vercel, Fluent 2, TasteSkill guidelines" },
                { cat: "Agent Systems", count: "10 tools", desc: "Memory, skills, kanban, scheduler" },
                { cat: "Inference & Models", count: "6 tools", desc: "Router, prober, quantizer, downloader" },
                { cat: "Visual Understanding", count: "6 tools", desc: "On-device ViT for screenshots" },
                { cat: "Video Editing", count: "8 tools", desc: "Timeline, effects, transitions, export" },
                { cat: "Document Parsing", count: "6 tools", desc: "Steps, tutorials, FAQ extraction" },
                { cat: "LLM Orchestration", count: "9 tools", desc: "Chains, agents, graph workflows" },
                { cat: "Audio & Speech", count: "3 tools", desc: "Synthesis, mixing, waveforms" },
                { cat: "Sandbox Environments", count: "8 tools", desc: "Isolated code execution" },
                { cat: "Integrations", count: "5 tools", desc: "Git, Jira, wiki generation" },
              ].map((item) => (
                <div
                  key={item.cat}
                  className="rounded-lg border border-zinc-200 bg-white p-3.5"
                >
                  <p className="text-[13px] font-medium text-zinc-900">{item.cat}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{item.count}</p>
                  <p className="mt-1 text-[11.5px] leading-4 text-zinc-500">{item.desc}</p>
                </div>
              ))}
            </div>

            <Callout type="tip">
              Every tool runs on your machine. No data is sent to external servers unless you
              explicitly configure an API provider. Click any tool in the store to see its
              description, required capabilities, and which backends support it.
            </Callout>
          </section>

          <hr className="border-zinc-200" />

          {/* ── Notebook Setup ── */}
          <section id="notebook-setup" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 7 · Configure the Notebook
            </h2>

            <p className="text-[14px] leading-7 text-zinc-600">
              The Notebook is the command center for running AI models on your machine. Navigate to{" "}
              <code className="rounded bg-zinc-100 px-1.5 text-[13px]">/notebook</code> and click the
              gear icon (⚙️ Configure) to open the setup wizard.
            </p>

            <div className="mt-6 space-y-6">
              <Step number={7} title="Evaluate your hardware" duration="5 seconds">
                <p>
                  Click <strong>Evaluate hardware</strong>. The probe reads your RAM, CPU cores, and
                  which inference backends (OpenVINO, llama.cpp, Vulkan, Metal) are available — all
                  without admin rights and without sending data anywhere.
                </p>
                <p className="mt-2 text-[13px] text-zinc-500">
                  You will see results like: "16 GB RAM · 8 cores · 3 backends available · fits up to
                  7B Q4_K_M models". These numbers drive every suggestion in the next steps.
                </p>
              </Step>

              <Step number={8} title="Pick a model family" duration="1 minute">
                <p>
                  The wizard shows available model families with honest trade-offs:
                </p>
                <div className="mt-3 space-y-2">
                  {[
                    {
                      name: "Qwen2.5",
                      badge: "Recommended start",
                      desc: "No account needed. Ungated. Good general performance. Sizes: 0.5B to 72B.",
                    },
                    {
                      name: "Llama 3.2",
                      badge: "Gated (HF token)",
                      desc: "Strong reasoning. Needs a Hugging Face token and license acceptance.",
                    },
                    {
                      name: "Gemma 2",
                      badge: "Gated (HF token)",
                      desc: "Google's open model. Compact. Good for smaller machines.",
                    },
                    {
                      name: "BitNet b1.58",
                      badge: "Experimental 1-bit",
                      desc: "Runs on very low RAM. Ternary weights. Quality lower but throughput very high.",
                    },
                  ].map((f) => (
                    <div key={f.name} className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-zinc-300" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-zinc-900">{f.name}</span>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                            {f.badge}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12.5px] text-zinc-500">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Step>

              <Step number={9} title="Get a Hugging Face token (if needed)" duration="2 minutes">
                <p>
                  If you chose Llama or Gemma, you need a Hugging Face token:
                </p>
                <div className="mt-2 space-y-1 text-[13px] text-zinc-600">
                  <p>1. Create an account at{" "}
                    <a href="https://huggingface.co" className="text-indigo-500 hover:underline" target="_blank" rel="noreferrer">
                      huggingface.co
                    </a>
                  </p>
                  <p>2. Go to Settings → Access Tokens → Create new token (read access)</p>
                  <p>3. Visit the model page (e.g., meta-llama/Llama-3.2-3B) and click "Accept license"</p>
                  <p>4. Paste the token in the Notebook's download panel</p>
                </div>
                <Callout type="tip">
                  Qwen2.5 is ungated — no token needed. Pick this if you want the fastest path to a
                  working model.
                </Callout>
              </Step>
            </div>
          </section>

          <hr className="border-zinc-200" />

          {/* ── First Model ── */}
          <section id="first-model" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 8 · Download your first model
            </h2>

            <Step number={10} title="Let the build planner suggest quantization levels" duration="10 seconds">
              <p>
                After selecting a family, the build planner analyzes your free RAM and suggests which
                quantization levels to create. A typical suggestion for an 8 GB machine:
              </p>
              <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-4">
                <div className="space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="font-medium text-zinc-900">Q8_0</span>
                    <span className="text-zinc-500">~3.5 GB · Best quality</span>
                    <span className="text-green-600">Fits ✓</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-zinc-900">Q4_K_M</span>
                    <span className="text-zinc-500">~2.0 GB · Sweet spot</span>
                    <span className="text-green-600">Fits ✓</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-zinc-900">IQ3_K</span>
                    <span className="text-zinc-500">~1.5 GB · Compact</span>
                    <span className="text-green-600">Fits ✓</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-zinc-900">IQ2_XS</span>
                    <span className="text-zinc-500">~1.0 GB · Minimal</span>
                    <span className="text-green-600">Fits ✓</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[13px] text-zinc-500">
                The planner refuses to requantize already-quantized files and warns on sub-4-bit
                builds. Each suggestion includes expected quality impact.
              </p>
            </Step>

            <Step number={11} title="Start the download" duration="2–5 minutes">
              <p>
                Click <strong>Download</strong> next to the build you want. Downloads are chunked and
                resumable — if your connection drops, it picks up where it left off. You see
                progress per chunk with ETA.
              </p>
              <Callout type="info">
                For a 3B model, expect ~2 GB download for Q4_K_M. A 7B model is ~4 GB at Q4_K_M.
                Download time depends on your internet speed.
              </Callout>
            </Step>

            <Step number={12} title="Verify the build" duration="10 seconds">
              <p>
                After download, the wizard runs verification — measuring actual error per bit level
                to ensure the build is usable. You will see a result like: "Verified: 3.1% relative
                error at Q4_K_M — within tolerance".
              </p>
            </Step>
          </section>

          <hr className="border-zinc-200" />

          {/* ── First Agent ── */}
          <section id="first-agent" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 9 · Start chatting or running agents
            </h2>

            <Step number={13} title="Choose your interface">
              <p>
                The final wizard step asks: <strong>Chat</strong> or <strong>Agents</strong>?
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 bg-white p-4">
                  <p className="text-[14px] font-semibold text-zinc-900">💬 Chat</p>
                  <p className="mt-2 text-[12.5px] text-zinc-500">
                    Single conversation with the model. Type your message, get a response. Good for
                    questions, code generation, and exploration.
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white p-4">
                  <p className="text-[14px] font-semibold text-zinc-900">🤖 Agents</p>
                  <p className="mt-2 text-[12.5px] text-zinc-500">
                    Multiple AI workers collaborate on tasks. The wizard suggests how many agents your
                    machine supports based on RAM and cores. Good for complex projects.
                  </p>
                </div>
              </div>
            </Step>

            <Step number={14} title="If you chose Agents: see the sizing recommendation">
              <p>
                The agents playground calculates the maximum number of concurrent workers. Example
                for an 8 GB machine with 8 cores:
              </p>
              <CopyBlock code="Machine specs: 8 GB RAM, 8 cores\nSuggested: 3 agent workers\nReason: 3 × 2.0 GB (Q4_K_M) = 6.0 GB + 2.0 GB OS headroom" />
              <p className="mt-2 text-[13px] text-zinc-500">
                Each agent gets a role (planner, coder, tester, etc.) and shares the model. The swarm
                orchestrator coordinates their work.
              </p>
            </Step>

            <Step number={15} title="If you chose Chat: start talking">
              <p>
                Type a message in the chat box. The response comes from the model running locally on
                your machine — no data leaves your computer. You will see which backend served the
                response (e.g., "served by llama.cpp CPU").
              </p>
            </Step>
          </section>

          <hr className="border-zinc-200" />

          {/* ── Screen Capture ── */}
          <section id="capture" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 10 · Try screen capture
            </h2>

            <Step number={16} title="Build the capture engine" duration="2–5 minutes">
              <CopyBlock
                label="Build the Rust engine"
                code="cd engines && cargo build --release"
              />
              <p className="text-[13px] text-zinc-500">
                First build takes 2-5 minutes. Subsequent builds are fast. The binary is at{" "}
                <code className="rounded bg-zinc-100 px-1 text-[12px]">
                  engines/target/release/captured
                </code>
              </p>
            </Step>

            <Step number={17} title="Start the engine and test it" duration="10 seconds">
              <CopyBlock
                label="Terminal 1: start the engine"
                code="./engines/target/release/captured --port 8080 --api-keys my-secret-key"
              />
              <CopyBlock
                label="Terminal 2: verify it's running"
                code='curl http://localhost:8080/health\n# Expected output: {"status":"ok"}'
              />
            </Step>

            <Step number={18} title="Capture a URL">
              <CopyBlock
                label="Capture a web page"
                code='curl "http://localhost:8080/v1/capture?url=https://example.com&access_key=my-secret-key" -o screenshot.png'
              />
              <p className="text-[13px] text-zinc-500">
                Open <code className="rounded bg-zinc-100 px-1 text-[12px]">screenshot.png</code> to
                see the captured page. The engine renders the page in a headless browser, handles
                lazy loading, scrolls the full page, and produces a pixel-perfect capture.
              </p>
            </Step>
          </section>

          <hr className="border-zinc-200" />

          {/* ── Browser Extension ── */}
          <section id="extension" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Step 11 · Install the browser extension
            </h2>

            <Step number={19} title="Load the extension in Chrome/Edge" duration="1 minute">
              <div className="space-y-2 text-[13.5px] text-zinc-600">
                <p>1. Open <code className="rounded bg-zinc-100 px-1 text-[12px]">chrome://extensions</code> in your browser</p>
                <p>2. Enable <strong>Developer mode</strong> (toggle in the top right corner)</p>
                <p>3. Click <strong>Load unpacked</strong></p>
                <p>4. Select the <code className="rounded bg-zinc-100 px-1 text-[12px]">extension/</code> folder from the stitaP project root</p>
                <p>5. The stitaP icon (V) appears in your toolbar</p>
              </div>
            </Step>

            <Step number={20} title="Capture a page">
              <p>
                Navigate to any website. Click the stitaP icon or press{" "}
                <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono">
                  Alt+Shift+V
                </kbd>{" "}
                . Choose:
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-[13px]">
                  <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono">
                    Alt+Shift+V
                  </kbd>
                  <span className="text-zinc-500">— Quick capture (visible viewport)</span>
                </div>
                <div className="flex items-center gap-2 text-[13px]">
                  <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono">
                    Alt+Shift+F
                  </kbd>
                  <span className="text-zinc-500">— Full page (scrolls and captures everything)</span>
                </div>
                <div className="flex items-center gap-2 text-[13px]">
                  <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono">
                    Alt+Shift+R
                  </kbd>
                  <span className="text-zinc-500">— Region (drag to select any area)</span>
                </div>
              </div>
              <p className="mt-3 text-[13px] text-zinc-500">
                The capture opens in a new tab with the annotation editor — ready to add arrows,
                text, step markers, blur/redact, and export as SVG.
              </p>
            </Step>
          </section>

          <hr className="border-zinc-200" />

          {/* ── Advanced ── */}
          <section id="advanced" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Advanced topics
            </h2>

            <div className="mt-6 space-y-6">
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <h3 className="text-[15px] font-semibold text-zinc-900">Free provider failover</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  If you want to use cloud AI instead of (or alongside) local models, paste free API
                  keys from Groq, Cerebras, Google AI Studio, OpenRouter, Mistral, GitHub Models,
                  Cloudflare Workers AI, NVIDIA NIM, or Cohere in the Notebook's free-provider panel.
                  When one provider fails, the notebook shifts to the next automatically.
                </p>
                <div className="mt-3 text-[12.5px] text-zinc-500">
                  <p>• Groq: 30 req/min, 1,000/day — fastest free tier</p>
                  <p>• Cerebras: 30 req/min, ~1M tokens/day — high throughput</p>
                  <p>• OpenRouter free: 20+ models, one key, 20 req/min</p>
                  <p>• Google AI Studio: 15 req/min, 1M context (trains on prompts)</p>
                  <p>• GitHub Models: 15 req/min, GPT-4o free with GitHub account</p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <h3 className="text-[15px] font-semibold text-zinc-900">Agent Studio: define roles and scope</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  Navigate to{" "}
                  <code className="rounded bg-zinc-100 px-1 text-[12px]">/studio</code> to create
                  agents with specific roles (planner, coder, tester, reviewer, documenter, verifier,
                  researcher, coordinator), scope their knowledge with PDFs and links, grant them tools
                  from the store, and manage team workspaces with structured feedback.
                </p>
                <Link
                  to="/studio"
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600 hover:underline"
                >
                  Open Agent Studio <ArrowRight className="size-3.5" />
                </Link>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <h3 className="text-[15px] font-semibold text-zinc-900">Build the desktop app</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  The desktop app wraps everything into a native window with additional capabilities:
                  OS-level screen capture, sandbox isolation, and fully offline operation.
                </p>
                <CopyBlock
                  label="Build desktop app"
                  code="cd desktop/src-tauri && cargo build --release"
                />
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <h3 className="text-[15px] font-semibold text-zinc-900">Run all test suites</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  stitaP includes 22 smoke-test suites (2,900+ checks) covering every subsystem.
                  Run them all to verify your build is complete:
                </p>
                <CopyBlock
                  label="Run all suites"
                  code={`for f in scripts/*smoke*.ts; do
  echo "Running $(basename $f)..."
  bun "$f" || echo "FAILED: $f"
done`}
                />
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <h3 className="text-[15px] font-semibold text-zinc-900">Environment variables</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  Key settings you might need:
                </p>
                <div className="mt-2 space-y-1 font-mono text-[12px] text-zinc-600">
                  <p>CAPTURE_SERVICE_URL=http://localhost:8080</p>
                  <p>CAPTURE_API_KEYS=your-secret-key</p>
                  <p>CAPTURE_TIMEOUT=30000</p>
                  <p>CAPTURE_MAX_VIEWPORT=3840</p>
                </div>
              </div>
            </div>
          </section>

          <hr className="border-zinc-200" />

          {/* ── Next Steps ── */}
          <section id="next-steps" className="scroll-mt-20 py-10">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Where to go next
            </h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                {
                  icon: FileText,
                  title: "Read the documentation",
                  desc: "Concept-by-concept guide covering every feature from first principles",
                  href: "/docs",
                  label: "Open Docs",
                },
                {
                  icon: Play,
                  title: "All Tutorials",
                  desc: "Step-by-step tutorials for SLMs, LLMs, analytics, agents, and more",
                  href: "/tutorials",
                  label: "Browse tutorials",
                },
                {
                  icon: FileText,
                  title: "Download the manual PDF",
                  desc: "126-page complete reference — every feature, its background, and code examples",
                  href: "/docs/pdf",
                  label: "Download PDF",
                },
                {
                  icon: Settings,
                  title: "Platform Overview",
                  desc: "Why every feature was built — the engineering rationale behind each capability",
                  href: "/overview",
                  label: "Read overview",
                },
                {
                  icon: Bot,
                  title: "Agent Platform",
                  desc: "Session modules, swarm orchestrator, enterprise runner, agent-ops layer",
                  href: "/agents",
                  label: "Explore agents",
                },
                {
                  icon: Bot,
                  title: "Start Here (beginners)",
                  desc: "Learn about AI agents, LLMs, tokens, and quantization from absolute scratch",
                  href: "/docs/start",
                  label: "Beginner path",
                },
                {
                  icon: Puzzle,
                  title: "Tool Reference",
                  desc: "Detailed documentation for all 106 in-house tools with worked examples",
                  href: "/docs/tools",
                  label: "Browse tools",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.title}
                    to={item.href}
                    className="group rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-zinc-900"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid size-9 place-items-center rounded-lg bg-zinc-100">
                        <Icon className="size-4.5 text-zinc-600" />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-zinc-900">{item.title}</p>
                        <p className="text-[12px] text-zinc-400">{item.desc}</p>
                      </div>
                    </div>
                    <div className="mt-3 text-[12px] font-medium text-indigo-600 group-hover:underline">
                      {item.label} →
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center">
              <p className="text-[15px] font-semibold text-zinc-900">Congratulations!</p>
              <p className="mt-2 max-w-lg text-[13px] leading-6 text-zinc-500">
                You have a complete, self-contained agentic AI harness running on your machine —
                106 in-house tools, local model inference, agents, screen capture, video editing,
                and documentation. Everything runs offline. No external dependencies. No data leaves
                your network.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Link
                  to="/notebook"
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-700"
                >
                  Open Notebook <ArrowRight className="size-3.5" />
                </Link>
                <Link
                  to="/store"
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-5 py-2.5 text-[13px] font-medium text-zinc-700 transition-colors hover:border-zinc-900"
                >
                  Browse Tool Store <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

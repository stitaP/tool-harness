import { motion } from "framer-motion";
import {
  NotebookPen, RefreshCw,
  Code,
  Download,
  Monitor,
  Apple,
  Terminal,
  Globe,
  Puzzle,
  Smartphone,
  Shield,
  Cpu,
  Package,
  ExternalLink,
  Check,
  Copy,
  ChevronDown,
} from "lucide-react";
import { Link } from "react-router";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { useState } from "react";

const VERSION = "0.7.0";
// TODO: Replace with your actual GitHub repository (owner/repo)
const GITHUB_REPO = "OWNER/REPO";
const RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}`;
const ALL_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;

const PLATFORMS = [
  {
    os: "Windows",
    icon: Monitor,
    tag: "Recommended",
    tagTone: "dark" as const,
    builds: [
      {
        label: "Desktop App (.exe)",
        filename: `stitap-desktop-windows-x64-v${VERSION}.exe`,
        url: `${RELEASE_URL}/stitap-desktop-windows-x64-v${VERSION}.exe`,
        size: "~85 MB",
        arch: "x64",
        primary: true,
      },
      {
        label: "Capture Engine (portable .exe)",
        filename: `stitap-engine-windows-x64-v${VERSION}.zip`,
        url: `${RELEASE_URL}/stitap-engine-windows-x64-v${VERSION}.zip`,
        size: "~5 MB",
        arch: "x64",
      },
    ],
    requirements: "Windows 10 (1903+) or Windows 11, 4 GB RAM, 500 MB disk",
    notes: "Desktop app includes embedded capture engine, sandbox, and screen capture. Engine is a standalone binary for servers and CI.",
  },
  {
    os: "macOS",
    icon: Apple,
    tag: "Universal",
    tagTone: "green" as const,
    builds: [
      {
        label: "Desktop App (Apple Silicon + Intel)",
        filename: `stitap-desktop-macos-universal-v${VERSION}.dmg`,
        url: `${RELEASE_URL}/stitap-desktop-macos-universal-v${VERSION}.dmg`,
        size: "~78 MB",
        arch: "Universal (arm64 + x64)",
        primary: true,
      },
      {
        label: "Capture Engine (arm64)",
        filename: `stitap-engine-macos-arm64-v${VERSION}.tar.gz`,
        url: `${RELEASE_URL}/stitap-engine-macos-arm64-v${VERSION}.tar.gz`,
        size: "~5 MB",
        arch: "arm64 (Apple Silicon)",
      },
      {
        label: "Capture Engine (x64)",
        filename: `stitap-engine-macos-x64-v${VERSION}.tar.gz`,
        url: `${RELEASE_URL}/stitap-engine-macos-x64-v${VERSION}.tar.gz`,
        size: "~5 MB",
        arch: "x64 (Intel)",
      },
    ],
    requirements: "macOS 12 Monterey or later, 4 GB RAM, 500 MB disk",
    notes: "Universal binary runs natively on both Apple Silicon (M1/M2/M3/M4) and Intel Macs.",
  },
  {
    os: "Linux",
    icon: Terminal,
    tag: "Multiple formats",
    tagTone: "blue" as const,
    builds: [
      {
        label: "Desktop App (AppImage)",
        filename: `stitap-desktop-linux-x64-v${VERSION}.AppImage`,
        url: `${RELEASE_URL}/stitap-desktop-linux-x64-v${VERSION}.AppImage`,
        size: "~75 MB",
        arch: "x64",
        primary: true,
      },
      {
        label: "Capture Engine (x64)",
        filename: `stitap-engine-linux-x64-v${VERSION}.tar.gz`,
        url: `${RELEASE_URL}/stitap-engine-linux-x64-v${VERSION}.tar.gz`,
        size: "~5 MB",
        arch: "x64",
      },
      {
        label: "Capture Engine (arm64)",
        filename: `stitap-engine-linux-arm64-v${VERSION}.tar.gz`,
        url: `${RELEASE_URL}/stitap-engine-linux-arm64-v${VERSION}.tar.gz`,
        size: "~5 MB",
        arch: "arm64",
      },
    ],
    requirements: "Ubuntu 20.04+ / Fedora 36+ / Debian 11+, 4 GB RAM, X11 or Wayland",
    notes: "Screen capture requires X11 (XGetImage) or Wayland portal. AppImage works on any distro without installation.",
  },
];

const EXTENSION = {
  name: "stitaP Browser Extension",
  version: `v${VERSION}`,
  stores: [
    {
      name: "Download from GitHub",
      url: `${RELEASE_URL}/stitap-extension-v${VERSION}.zip`,
      badge: "All browsers",
    },
    {
      name: "View source",
      url: `https://github.com/${GITHUB_REPO}/tree/main/extension`,
      badge: "Open source",
    },
  ],
  features: [
    "Capture current tab (viewport, full-page, or region)",
    "Region selection with live dimensions overlay",
    "Direct upload to stitaP library",
    "Keyboard shortcut: Alt+Shift+V",
  ],
};

const BUILD_FROM_SOURCE = [
  {
    step: "1",
    title: "Prerequisites",
    commands: [
      "Rust 1.77.2+ (curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh)",
      "Bun 1.0+ (curl -fsSL https://bun.sh/install | bash)",
      "WebKit2GTK (Linux: sudo apt install libwebkit2gtk-4.1-dev)",
    ],
  },
  {
    step: "2",
    title: "Clone and build everything",
    commands: [
      `git clone https://github.com/${GITHUB_REPO}.git`,
      "cd stitap",
      "./scripts/build-releases.sh",
      "# All artifacts: dist/releases/vX.Y.Z/",
    ],
  },
  {
    step: "3",
    title: "Or build individually",
    commands: [
      "cd engines && cargo build --release",
      "# Binary: target/release/captured",
      "cd ../desktop && bun tauri build",
      "# Desktop: src-tauri/target/release/bundle/",
    ],
  },
  {
    step: "4",
    title: "Publish a release",
    commands: [
      "git tag v0.6.0 && git push origin v0.6.0",
      "# GitHub Actions builds + publishes automatically",
      "# Or: gh release create v0.6.0 dist/releases/v0.6.0/*",
    ],
  },
];

const MOBILE = {
  title: "Mobile (Android / iOS)",
  description:
    "stitaP's web app is fully responsive and works on mobile browsers. The URL capture endpoint works from any device — submit a URL from your phone and the server renders it.",
  note: "Native screen capture is not available on mobile (browser extension APIs don't exist on mobile Chrome/Safari). Use the URL capture mode or your device's built-in screenshot button.",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-2 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
      title="Copy to clipboard"
    >
      {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export default function Downloads() {
  const [expandedSource, setExpandedSource] = useState(false);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Nav */}
      <SiteNav />

      {/* Hero */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-16 md:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-medium text-zinc-500">
              <Download className="size-3.5" />
              Version {VERSION}
              <a href={ALL_RELEASES_URL} target="_blank" rel="noreferrer" className="ml-1 text-indigo-600 hover:underline">
                (all releases)
              </a>
            </div>
            <h1 className="mt-6 max-w-2xl font-serif text-[40px] leading-[1.1] tracking-tight text-zinc-900 md:text-[56px]">
              Download stitaP
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-zinc-500">
              The open-source agentic AI tool harness — desktop app, browser extension, and
              self-hosted engine. 106 in-house tools. Everything runs on your machine. No data leaves your network.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Platform downloads */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Desktop Applications
          </h2>
          <p className="mt-3 max-w-lg text-[14px] leading-6 text-zinc-500">
            The desktop app includes the embedded capture engine — capture any URL fully offline,
            with native screen capture and sandbox isolation. No external services required.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLATFORMS.map((platform) => {
              const Icon = platform.icon;
              return (
                <motion.div
                  key={platform.os}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="rounded-xl border border-zinc-200 bg-white p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-lg bg-zinc-100">
                        <Icon className="size-5 text-zinc-700" />
                      </div>
                      <div>
                        <h3 className="text-[15px] font-semibold text-zinc-900">{platform.os}</h3>
                        <span className="text-[11px] text-zinc-400">
                          {platform.builds[0].arch}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        platform.tagTone === "dark"
                          ? "bg-zinc-900 text-white"
                          : platform.tagTone === "green"
                            ? "bg-green-50 text-green-700"
                            : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {platform.tag}
                    </span>
                  </div>

                  <div className="mt-5 space-y-2">
                    {platform.builds.map((build) => (
                      <a
                        key={build.label}
                        href={build.url || ALL_RELEASES_URL}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all ${
                          build.primary
                            ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                        }`}
                      >
                        <div>
                          <p className={`text-[13px] font-medium ${build.primary ? "text-white" : "text-zinc-900"}`}>
                            {build.label}
                          </p>
                          <p className={`text-[11px] ${build.primary ? "text-zinc-400" : "text-zinc-400"}`}>
                            {build.filename} · {build.size}
                          </p>
                        </div>
                        <Download
                          className={`size-4 ${build.primary ? "text-zinc-400" : "text-zinc-300"}`}
                        />
                      </a>
                    ))}
                  </div>

                  <div className="mt-5 border-t border-zinc-100 pt-4">
                    <p className="text-[11px] leading-5 text-zinc-400">
                      <strong className="text-zinc-500">Requirements:</strong> {platform.requirements}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-400">{platform.notes}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Source Code Download */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Source Code
          </h2>
          <div className="mt-6 grid gap-8 md:grid-cols-[1fr_1.2fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-900">
                  <Code className="size-5 text-white" />
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold text-zinc-900">stitaP Source Code</h3>
                  <span className="text-[12px] text-zinc-400">MIT License · v{VERSION}</span>
                </div>
              </div>
              <p className="mt-4 text-[14px] leading-6 text-zinc-500">
                Download the complete stitaP source code — Rust engine, Tauri desktop app, React
                frontend, browser extension, 106 in-house tools, and all documentation. Build it
                yourself, modify it, or deploy it on your own infrastructure.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={`/releases/stitap-source-v${VERSION}.zip`}
                  download
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700"
                >
                  <Download className="size-4" />
                  Download .zip ({VERSION})
                </a>
                <a
                  href={`/releases/stitap-source-v${VERSION}.zip`}
                  download
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-5 py-3 text-[14px] font-medium text-zinc-700 transition-colors hover:border-zinc-400"
                >
                  <Package className="size-4" />
                  Source archive
                </a>
              </div>
              <div className="mt-4 text-[12px] text-zinc-400">
                <p>Includes: Rust engine · Tauri desktop · React web app · Browser extension · 106 tools</p>
                <p>Analytics engines (SQL, XQL, MDX) · Exports (PowerBI, Excel, Sheets, Tableau)</p>
                <p>Agent config · Fractal graph playground · Reports viewer · Browser automation · Cloudflare OS</p>
                <p className="mt-1">License: MIT · Zero external dependencies required to build</p>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <h4 className="text-[14px] font-semibold text-zinc-900">What's inside</h4>
              <div className="mt-4 space-y-3">
                {[
                  { dir: "engines/", desc: "Rust capture engine — HTTP, WebSocket, CDP, PNG, SVG, screen capture + Rust analytical engine (WASM)" },
                  { dir: "desktop/", desc: "Tauri v2 desktop app — Windows (.exe), macOS (.dmg), Linux (AppImage)" },
                  { dir: "src/lib/analytics/", desc: "SQL, XQL, MDX query engines + DuckDB-style columnar DB + PowerBI/Excel/Sheets/Tableau exports" },
                  { dir: "src/lib/agent/", desc: "Agent platform — skills, memory, knowledge, swarm, browser automation, fractal graphs, Cloudflare OS" },
                  { dir: "src/pages/", desc: "27 pages — AgentConfig, HarnessPlayground, Reports, Notebook, Store, VideoEditor, and more" },
                  { dir: "src/lib/store/", desc: "106 tools — browser, analytics, video, doc, LLM, inference, testing, design, sandbox, orchestration" },
                  { dir: "extension/", desc: "Browser extension — Chrome/Edge/Firefox capture" },
                  { dir: "scripts/", desc: "Build scripts, smoke tests, release automation" },
                  { dir: ".github/", desc: "CI/CD workflows — automated cross-platform builds + exe generation" },
                ].map((item) => (
                  <div key={item.dir} className="flex items-start gap-3">
                    <span className="mt-0.5 rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-600">
                      {item.dir}
                    </span>
                    <span className="text-[13px] text-zinc-500">{item.desc}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-zinc-100 pt-4">
                <h4 className="text-[13px] font-semibold text-zinc-900">Quick start from source</h4>
                <div className="mt-2 space-y-1">
                  <div className="rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                    unzip stitap-source-v{VERSION}.zip
                  </div>
                  <div className="rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                    cd stitap && bun install
                  </div>
                  <div className="rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                    bun tsc -b --noEmit  # verify types
                  </div>
                  <div className="rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                    ./scripts/build-releases.sh  # builds .exe, .dmg, AppImage
                  </div>
                  <div className="rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                    # Or build just the .exe:
                  </div>
                  <div className="rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                    cd desktop && bun tauri build
                  </div>
                  <div className="rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                    # Output: desktop/src-tauri/target/release/bundle/nsis/stitap_*.exe
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Analytics Engines */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Analytics Engines
          </h2>
          <p className="mt-3 max-w-lg text-[14px] leading-6 text-zinc-500">
            Three in-browser query engines with zero dependencies — SQL, XQL, and MDX — plus
            export to PowerBI, Excel, Google Sheets, and Tableau. All included in the source code.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                name: "SQL Engine",
                desc: "Full SQL with SELECT, JOIN, GROUP BY, ORDER BY, window functions, CASE, aggregates",
                file: "src/lib/analytics/sql.ts",
                tags: ["SQL", "DuckDB-style", "Window Functions"],
              },
              {
                name: "XQL Engine",
                desc: "Hybrid SQL + JSON path (@.field, $.data.nested) + graph traversal + time-series windowing",
                file: "src/lib/analytics/xql-engine.ts",
                tags: ["XQL", "JSON Path", "Hybrid"],
              },
              {
                name: "MDX Engine",
                desc: "OLAP queries — CROSSJOIN, FILTER, TOPCOUNT, calculated members, compatible with PowerBI/Excel",
                file: "src/lib/analytics/mdx-engine.ts",
                tags: ["MDX", "OLAP", "PowerBI"],
              },
            ].map((engine) => (
              <div key={engine.name} className="rounded-xl border border-zinc-200 bg-white p-6">
                <h3 className="text-[15px] font-semibold text-zinc-900">{engine.name}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">{engine.desc}</p>
                <div className="mt-3 rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                  {engine.file}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {engine.tags.map((tag) => (
                    <span key={tag} className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="text-[15px] font-semibold text-zinc-900">Export Tools</h3>
              <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                Export query results to any reporting platform — CSV with metadata headers,
                DAX measure templates, XML Spreadsheet, Google Sheets formulas, Tableau TSV + .twb manifests.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["PowerBI", "Excel", "Google Sheets", "Tableau", "CSV", "JSON"].map((f) => (
                  <span key={f} className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="text-[15px] font-semibold text-zinc-900">Rust Analytical Engine</h3>
              <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                High-performance WASM bridge for the Rust engine — SIMD-accelerated aggregation,
                parallel query execution, Arrow IPC, Parquet support. Falls back to TypeScript when WASM is unavailable.
              </p>
              <div className="mt-3 rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                src/lib/analytics/rust-engine.ts
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Agent Platform */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Agent Platform
          </h2>
          <p className="mt-3 max-w-lg text-[14px] leading-6 text-zinc-500">
            Full agent orchestration suite with configuration, playground visualization, fractal
            graphs, and Cloudflare OS edge deployment.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                name: "Agent Configuration",
                desc: "Define agents, assign tools, set scope, upload knowledge docs, configure principles",
                route: "/agent-config",
                file: "src/pages/AgentConfig.tsx",
              },
              {
                name: "Harness Playground",
                desc: "Interactive fractal graph visualization — agent interactions, tool pipelines, noise detection",
                route: "/playground",
                file: "src/pages/HarnessPlayground.tsx",
              },
              {
                name: "Reports & Logs",
                desc: "Markdown-rendered agent logs, LLM interactions, tool executions, analytics queries",
                route: "/reports",
                file: "src/pages/Reports.tsx",
              },
            ].map((item) => (
              <div key={item.name} className="rounded-xl border border-zinc-200 bg-white p-6">
                <h3 className="text-[15px] font-semibold text-zinc-900">{item.name}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">{item.desc}</p>
                <div className="mt-3 rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                  {item.file}
                </div>
                <a
                  href={item.route}
                  className="mt-3 inline-flex items-center gap-1 text-[12px] text-indigo-600 hover:underline"
                >
                  Try it live →
                </a>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="text-[15px] font-semibold text-zinc-900">Fractal Graph Engine</h3>
              <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                L-system branching, force-directed layout, Hilbert curve, radial layout. Noise detection
                via fractal dimension (box-counting), Hurst exponent (R/S analysis), and cluster coherence.
              </p>
              <div className="mt-3 rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                src/lib/agent/fractal-graph.ts
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="text-[15px] font-semibold text-zinc-900">Cloudflare OS Integration</h3>
              <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                Wrangler.toml generator, D1 schema, Workers script template, 5 agent roles,
                10 edge deployment use cases. Deploy agents to 300+ edge locations.
              </p>
              <div className="mt-3 rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                src/lib/agent/cloudflare-os.ts
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Build as .exe */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Build as Desktop App (.exe)
          </h2>
          <p className="mt-3 max-w-lg text-[14px] leading-6 text-zinc-500">
            stitaP uses Tauri v2 to compile the React web app into a native desktop executable.
            The .exe includes the full web app, all tools, analytics engines, agent platform, and
            fractal graph playground — everything runs locally with no server required.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="text-[15px] font-semibold text-zinc-900">Windows (.exe)</h3>
              <div className="mt-3 space-y-1">
                {[
                  "# Prerequisites",
                  "rustup target add x86_64-pc-windows-msvc",
                  "# Install Tauri CLI",
                  "cargo install tauri-cli",
                  "# Build the .exe",
                  "cd desktop && bun tauri build",
                  "# Output: src-tauri/target/release/bundle/nsis/stitap_0.7.0_x64-setup.exe",
                  "",
                  "# Or use the build script (builds all platforms):",
                  "./scripts/build-releases.sh",
                ].map((cmd) => (
                  <div key={cmd} className="flex items-center justify-between rounded-lg bg-zinc-950 px-3 py-2">
                    <code className="font-mono text-[12px] text-zinc-300">{cmd || '\u00A0'}</code>
                    {cmd && !cmd.startsWith('#') && <CopyButton text={cmd} />}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="text-[15px] font-semibold text-zinc-900">What's Inside the .exe</h3>
              <ul className="mt-3 space-y-2">
                {[
                  "Full React web app (27 pages, all routes)",
                  "106 tools in the Tool Store",
                  "SQL + XQL + MDX analytics engines",
                  "PowerBI / Excel / Sheets / Tableau exports",
                  "Agent Configuration + Harness Playground",
                  "Fractal graph visualization (Canvas 2D)",
                  "Reports & Logs viewer",
                  "Notebook (chat + agent config)",
                  "Video Editor + Screen Recorder",
                  "Browser automation (Phase 2)",
                  "Inference router + model management",
                  "Sandbox + terminal + knowledge base",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[13px] text-zinc-600">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-zinc-900" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[11px] leading-5 text-zinc-400">
                The .exe is a self-contained binary (~85 MB). No Node.js, no Python, no external
                dependencies required. Double-click to run — the full stitaP experience on your desktop.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Browser Extension */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Browser Extension
          </h2>
          <div className="mt-6 grid gap-8 md:grid-cols-[1fr_1.2fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-900">
                  <Puzzle className="size-5 text-white" />
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold text-zinc-900">{EXTENSION.name}</h3>
                  <span className="text-[12px] text-zinc-400">{EXTENSION.version}</span>
                </div>
              </div>
              <p className="mt-4 text-[14px] leading-6 text-zinc-500">
                Capture any web page directly from your browser. Click the stitaP icon, choose your
                capture mode, and the result opens in a new tab — ready to annotate, export, or save
                to your library.
              </p>
              <ul className="mt-4 space-y-2">
                {EXTENSION.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-zinc-600">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-zinc-900" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                {EXTENSION.stores.map((store) => (
                  <a
                    key={store.name}
                    href={store.url}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-[13px] font-medium text-zinc-700 transition-all hover:border-zinc-900 hover:text-zinc-900"
                  >
                    {store.name}
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
                      {store.badge}
                    </span>
                    <ExternalLink className="size-3 text-zinc-300" />
                  </a>
                ))}
              </div>
            </div>

            {/* Extension release zip */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h4 className="text-[14px] font-semibold text-zinc-900">Direct Download</h4>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                  Developer mode
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-zinc-500">
                Download the extension as a zip file and load it as an unpacked extension in
                Chrome/Edge developer mode. Includes all capture modes: viewport, full-page, and
                region selection.
              </p>
              <a
                href={`${RELEASE_URL}/stitap-extension-v${VERSION}.zip`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-700"
              >
                <Package className="size-4" />
                stitap-extension-v{VERSION}.zip
              </a>
              <p className="mt-3 text-[11px] text-zinc-400">
                SHA-256: <span className="font-mono">a3f8c2…(verify after download)</span>
              </p>

              <div className="mt-6 border-t border-zinc-100 pt-5">
                <h4 className="text-[13px] font-semibold text-zinc-900">Quick install (Developer mode)</h4>
                <ol className="mt-2 space-y-1.5 text-[12px] leading-5 text-zinc-500">
                  <li>1. Open <span className="font-mono text-zinc-700">chrome://extensions</span></li>
                  <li>2. Enable <strong>Developer mode</strong> (top right toggle)</li>
                  <li>3. Click <strong>Load unpacked</strong></li>
                  <li>4. Select the unzipped <span className="font-mono text-zinc-700">extension/</span> folder</li>
                  <li>5. Click the stitaP icon in the toolbar to capture</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile + Web */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Mobile & Web
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-100">
                  <Globe className="size-5 text-zinc-700" />
                </div>
                <h3 className="text-[15px] font-semibold text-zinc-900">Web App</h3>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-zinc-500">
                The full stitaP studio runs in any modern browser. Capture by URL (requires a
                self-hosted engine), use the built-in demo page, or upload screenshots from your
                device. All editing, annotation, and export features work on web.
              </p>
              <Link
                to="/auth?returnTo=%2Fdashboard"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-700 transition-all hover:border-zinc-900"
              >
                Open web app
                <ExternalLink className="size-3 text-zinc-300" />
              </Link>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-100">
                  <Smartphone className="size-5 text-zinc-700" />
                </div>
                <h3 className="text-[15px] font-semibold text-zinc-900">{MOBILE.title}</h3>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-zinc-500">{MOBILE.description}</p>
              <p className="mt-2 rounded-lg bg-amber-50 p-3 text-[12px] leading-5 text-amber-800">
                {MOBILE.note}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Self-hosted engine */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Self-Hosted Engine
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-[17px] font-semibold text-zinc-900">
                Run the capture engine on your server
              </h3>
              <p className="mt-3 text-[14px] leading-6 text-zinc-500">
                The stitaP capture engine is a single Rust binary — zero external dependencies, zero
                npm packages. Deploy it on any Linux server, Docker container, or edge function to
                capture URLs from your web app or API.
              </p>
              <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">
                  Quick start
                </p>
                <div className="mt-3 space-y-1">
                  {[
                    "docker pull stitap.capture:latest",
                    "docker run -p 8080:8080 -e CAPTURE_API_KEYS=your-key stitap.capture:latest",
                    "# → http://localhost:8080/health",
                    "# → GET /v1/capture?url=https://example.com&access_key=your-key",
                  ].map((cmd) => (
                    <div
                      key={cmd}
                      className="flex items-center justify-between rounded-lg bg-zinc-950 px-3 py-2"
                    >
                      <code className="font-mono text-[12px] text-zinc-300">{cmd}</code>
                      {!cmd.startsWith("#") && <CopyButton text={cmd} />}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="#"
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-[13px] font-medium text-zinc-700 transition-all hover:border-zinc-900"
                >
                  <Terminal className="size-4" />
                  Docker image
                </a>
                <a
                  href="#"
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-[13px] font-medium text-zinc-700 transition-all hover:border-zinc-900"
                >
                  <Package className="size-4" />
                  Linux binary
                </a>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <Shield className="size-4 text-zinc-700" />
                  <h4 className="text-[13px] font-semibold text-zinc-900">Sandbox Isolation</h4>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-zinc-500">
                  Every capture runs in an OS-level sandbox. Linux: rlimits + seccomp-bpf. macOS:
                  App Sandbox. Windows: Job Objects. Resource limits on CPU, memory, files, and
                  processes.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <Cpu className="size-4 text-zinc-700" />
                  <h4 className="text-[13px] font-semibold text-zinc-900">Zero Dependencies</h4>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-zinc-500">
                  The engine is written from scratch in Rust — its own HTTP server, WebSocket client,
                  Chrome DevTools Protocol, PNG encoder, SVG serializer, JSON parser, base64, and
                  SHA-1. No npm, no pip, no external binaries.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <Monitor className="size-4 text-zinc-700" />
                  <h4 className="text-[13px] font-semibold text-zinc-900">Native Screen Capture</h4>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-zinc-500">
                  Capture any screen region from the engine's HTTP API. Windows: GDI BitBlt. macOS:
                  CoreGraphics CGWindowList. Linux: Xlib XGetImage. Full OS compositor output, not
                  just browser content.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Screen Recorder */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Screen Recorder
          </h2>
          <p className="mt-3 max-w-lg text-[14px] leading-6 text-zinc-500">
            Record your screen with audio, webcam overlay, and instant editing. Available as a
            browser extension (Chrome, Firefox, Edge) or as a built-in feature of the desktop app.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-blue-50">
                  <Globe className="size-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-zinc-900">Browser Extension</h3>
                  <p className="text-[12px] text-zinc-400">Chrome · Firefox · Edge</p>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-zinc-500">
                Record any browser tab, visible area, or custom region. Captures system audio and
                microphone. Exports to WebM or MP4. Includes built-in annotation tools — draw,
                highlight, blur, and add text directly on the recording.
              </p>
              <ul className="mt-3 space-y-1.5 text-[12px] leading-5 text-zinc-500">
                <li>• Tab, window, or region recording</li>
                <li>• System audio + microphone capture</li>
                <li>• Webcam overlay with position control</li>
                <li>• Real-time drawing, arrows, and blur</li>
                <li>• Instant screenshots during recording</li>
                <li>• Export as WebM, MP4, or animated GIF</li>
              </ul>
              <a
                href="#"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-700 transition-all hover:border-zinc-900"
              >
                <Download className="size-4" />
                Install Extension
              </a>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-emerald-50">
                  <Monitor className="size-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-zinc-900">Desktop App</h3>
                  <p className="text-[12px] text-zinc-400">Windows · macOS · Linux</p>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-zinc-500">
                Record any application window or full screen — not just browser content. Includes all
                browser extension features plus native OS screen capture, multi-monitor support, and
                hardware-accelerated encoding.
              </p>
              <ul className="mt-3 space-y-1.5 text-[12px] leading-5 text-zinc-500">
                <li>• Full screen or any window recording</li>
                <li>• Multi-monitor support</li>
                <li>• Hardware-accelerated H.264/VP9</li>
                <li>• Schedule recordings in advance</li>
                <li>• System audio without loopback drivers</li>
                <li>• Keyboard shortcuts for start/stop/pause</li>
              </ul>
              <Link
                to="/downloads"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-700 transition-all hover:border-zinc-900"
              >
                <Monitor className="size-4" />
                See Desktop Downloads
              </Link>
            </div>
          </div>
          <div className="mt-8 rounded-xl border border-zinc-200 bg-[#fafaf9] p-5">
            <h4 className="text-[13px] font-semibold text-zinc-900">Screen Recorder → Video Editor Pipeline</h4>
            <p className="mt-2 text-[12px] leading-5 text-zinc-500">
              Every recording is automatically available in the <Link to="/editor" className="underline decoration-dotted hover:text-zinc-900">Video Editor</Link> for
              trimming, splitting, adding effects, transitions, text overlays, and stickers. Export as
              WebM with quality presets from low (1 Mbps) to ultra (20 Mbps).
            </p>
          </div>
        </div>
      </section>

      {/* Notebook suite */}
      <section id="notebook" className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Notebook Suite
          </h2>
          <p className="mt-3 max-w-lg text-[14px] leading-6 text-zinc-500">
            The agent onboarding suite: hardware evaluation, torrent-style model downloads with Hugging
            Face authentication, an in-house quantizer for 1–4 bit builds, swarm sizing, and automatic
            failover across nine free API providers. Included in every desktop download; also usable in
            the <Link to="/notebook" className="underline decoration-dotted hover:text-zinc-900">browser notebook</Link>.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-indigo-50">
                  <NotebookPen className="size-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-zinc-900">stitaP Notebook</h3>
                  <p className="text-[12px] text-zinc-400">Chat + agents · all platforms</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 text-[12px] leading-5 text-zinc-500">
                <li>• Five-step wizard: hardware → model → download → builds → interface</li>
                <li>• Chat and agents playground in one window</li>
                <li>• Swarm sizing from your specs, with shown arithmetic</li>
                <li>• Session budgets and callable store tools</li>
              </ul>
              <Link
                to="/notebook"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-700 transition-all hover:border-zinc-900"
              >
                <NotebookPen className="size-4" />
                Open Notebook
              </Link>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-amber-50">
                  <RefreshCw className="size-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-zinc-900">Model Engine + Failover Router</h3>
                  <p className="text-[12px] text-zinc-400">Quantizer · downloader · provider pool</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 text-[12px] leading-5 text-zinc-500">
                <li>• In-house quantizer: Q8 → Q4 → IQ2/IQ3 → b1.58, with verification</li>
                <li>• Chunked, resumable downloads; SHA256-checked; HF token auth</li>
                <li>• 9 free providers, circuit breakers, background shifting</li>
                <li>• API-key analyzer: one key or many, with the math shown</li>
              </ul>
              <Link
                to="/features#notebook"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-700 transition-all hover:border-zinc-900"
              >
                <Download className="size-4" />
                Feature details
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Build from source */}
      <section id="build" className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Build from Source
          </h2>
          <p className="mt-3 max-w-lg text-[14px] leading-6 text-zinc-500">
            stitaP is fully open source. Build the engine, desktop app, and web app from source — no
            proprietary dependencies, no license keys.
          </p>

          <button
            onClick={() => setExpandedSource(!expandedSource)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-[13px] font-medium text-zinc-700 transition-all hover:border-zinc-900"
          >
            <Terminal className="size-4" />
            {expandedSource ? "Hide" : "Show"} build instructions
            <ChevronDown
              className={`size-3.5 transition-transform ${expandedSource ? "rotate-180" : ""}`}
            />
          </button>

          {expandedSource && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-6 overflow-hidden"
            >
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {BUILD_FROM_SOURCE.map((s) => (
                  <div key={s.step} className="rounded-xl border border-zinc-200 bg-white p-5">
                    <span className="font-serif text-[24px] text-zinc-300">{s.step}</span>
                    <h4 className="mt-2 text-[14px] font-semibold text-zinc-900">{s.title}</h4>
                    <div className="mt-3 space-y-1">
                      {s.commands.map((cmd) => (
                        <div
                          key={cmd}
                          className="rounded bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300"
                        >
                          {cmd}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-xl border border-zinc-200 bg-[#fafaf9] p-5">
                <h4 className="text-[13px] font-semibold text-zinc-900">Platform-specific notes</h4>
                <ul className="mt-2 space-y-1.5 text-[12px] leading-5 text-zinc-500">
                  <li>
                    • <strong>Linux:</strong> Requires{" "}
                    <span className="font-mono text-zinc-700">libwebkit2gtk-4.1-dev</span>,{" "}
                    <span className="font-mono text-zinc-700">libx11-dev</span>, and{" "}
                    <span className="font-mono text-zinc-700">pkg-config</span> for the Tauri shell
                    and screen capture.
                  </li>
                  <li>
                    • <strong>macOS:</strong> Requires Xcode Command Line Tools for CoreGraphics
                    screen capture and App Sandbox.
                  </li>
                  <li>
                    • <strong>Windows:</strong> Requires Visual Studio Build Tools for GDI screen
                    capture and Job Objects.
                  </li>
                  <li>
                    • <strong>Docker:</strong>{" "}
                    <span className="font-mono text-zinc-700">
                      docker build -t stitap .
                    </span>{" "}
                    from the <span className="font-mono text-zinc-700">engines/</span> directory.
                  </li>
                </ul>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-zinc-950 text-white">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="mx-auto max-w-2xl font-serif text-3xl tracking-tight md:text-4xl">
            Ready to capture?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-7 text-zinc-400">
            Start with the web app — no install needed. Or download the desktop app for offline
            capture and native screen recording.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/store"
              className="group inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
            >
              Open the tool store
            </Link>
            <a
              href={`https://github.com/${GITHUB_REPO}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-white/20 px-6 py-3 text-[14px] font-medium text-zinc-300 transition-colors hover:border-white/60"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}

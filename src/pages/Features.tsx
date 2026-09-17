import { motion } from "framer-motion";
import {
  Scan, Shield, Brain, Lock, Cpu, Download, Globe, Terminal, Monitor, Puzzle,
  Smartphone, Play, Mic, Type, Palette, Film, Volume2, Layers, Zap, Eye, FileText,
  ArrowRight, Check, CircleDot, MousePointer2, Crop, Highlighter, MessageSquare,
  Eraser, Maximize2, Move, Box, Camera, MonitorPlay, Circle, Timer, Square,
  FileVideo, HelpCircle, BookOpen, Search, Pause, Settings,
  Scissors, RefreshCw, Users, KeyRound, NotebookPen, Wrench, GitBranch,
} from "lucide-react";
import { Link } from "react-router";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

// ─── Product 1: Image Capture ─────────────────────────────────────────────
const CAPTURE_MODES = [
  {
    name: "Portable Image SVG",
    status: "Production",
    description: "Renders the page in a real browser, captures as PNG/WebP, embeds inside an SVG <image> element, adds annotations as native SVG, inserts metadata, strips scripts. Universal compatibility.",
    capabilities: ["Full browser rendering (Canvas, WebGL, shadows, gradients)", "Tiled output for pages over 4,000px", "Script stripping and external reference removal", "Metadata embedding (title, URL, timestamp, dimensions)", "HTML <img> validation"],
  },
  {
    name: "Hybrid Editable SVG",
    status: "Built",
    description: "Converts supported DOM elements into native SVG objects and rasterizes unsupported regions. Headings become <text>, buttons become <rect> + <text>, borders become strokes.",
    capabilities: ["DOM-to-SVG element mapping", "Gradient and shadow conversion to native SVG", "Measured line-box text wrapping", "Semantic <g> layer boundaries and clipping", "Computed matrix() transform support"],
  },
  {
    name: "Native Vector",
    status: "Experimental",
    description: "Attempts to reconstruct nearly everything as vector objects. Browser text layout and CSS filters are hard to reproduce — explicitly labeled as not pixel-perfect.",
    capabilities: ["Full vector reconstruction attempt", "Text as SVG <text> elements", "CSS filter approximation", "Experimental quality — use with caution"],
  },
];

const ANNOTATION_TOOLS = [
  { icon: MousePointer2, name: "Select & Move", desc: "Click, drag, resize any annotation element" },
  { icon: ArrowRight, name: "Arrows", desc: "Directional arrows with customizable heads" },
  { icon: Box, name: "Rectangles", desc: "Highlight regions with outline or filled rectangles" },
  { icon: Type, name: "Text", desc: "Add text labels with font, size, and color control" },
  { icon: MessageSquare, name: "Callouts", desc: "Speech bubbles and callout boxes for step markers" },
  { icon: Highlighter, name: "Highlight", desc: "Semi-transparent highlight overlays" },
  { icon: Eraser, name: "Redaction", desc: "Opaque black masks for sensitive data" },
  { icon: CircleDot, name: "Step Markers", desc: "Numbered sequential step indicators" },
  { icon: Maximize2, name: "Magnifier", desc: "Zoom into specific regions for detail" },
  { icon: Crop, name: "Crop", desc: "Trim captured images to focus areas" },
  { icon: Move, name: "Blur", desc: "Gaussian blur for privacy and focus" },
];

// ─── Product 2: Screen Recorder ───────────────────────────────────────────
const RECORD_MODES = [
  { icon: Monitor, title: "Full Screen", desc: "Capture everything on any connected display." },
  { icon: Maximize2, title: "Region Select", desc: "Drag to select any region with live dimensions." },
  { icon: Globe, title: "Browser Tab", desc: "Record a specific tab with tab audio." },
  { icon: MonitorPlay, title: "App Window", desc: "Record a single application window." },
];

const RECORDER_FEATURES = [
  { icon: Pause, title: "Pause & Resume", desc: "Pause and resume recording. Paused sections are trimmed." },
  { icon: MousePointer2, title: "Click Highlights", desc: "Visual click indicators with customizable colors." },
  { icon: Mic, title: "System Audio", desc: "Capture system audio, browser audio, or microphone." },
  { icon: Circle, title: "Webcam Overlay", desc: "Picture-in-picture webcam positioned anywhere." },
  { icon: Timer, title: "Countdown", desc: "3-2-1 countdown before recording starts." },
  { icon: Zap, title: "Hotkeys", desc: "Keyboard shortcuts for all recording controls." },
  { icon: FileVideo, title: "Output Formats", desc: "WebM, MP4, GIF, and APNG export options." },
  { icon: Settings, title: "Frame Rate", desc: "15, 24, 30, or 60 FPS selection." },
];

// ─── Product 3: Video Editor ──────────────────────────────────────────────
const VIDEO_FEATURES = [
  { icon: Play, title: "Full Video Editor", description: "Complete browser-based editor with multi-track timeline, clip editing, transitions, effects, text overlays, and audio mixing — all from scratch.", link: "/editor" },
  { icon: Film, title: "22 Video Templates", description: "Pre-built templates for intros, outros, lower thirds, title cards, captions, and social media formats (Instagram, TikTok, YouTube, Twitter)." },
  { icon: Palette, title: "33 Color Grading Presets", description: "Cinematic, vintage, artistic, natural, dramatic, and monochrome grading. Each preset generates an effects stack." },
  { icon: Type, title: "15 Animated Text Presets", description: "Typewriter, fade-in, bounce, glitch, glow, neon, and more. 15 font families and 8 color palettes." },
  { icon: Zap, title: "48 Sticker Library", description: "Emoji, shapes, arrows, callouts, decorative elements, and icons — all SVG-based, scalable, tintable." },
  { icon: Volume2, title: "21 Audio Assets", description: "BGM (5 styles), SFX (8 types), ambient (4 environments), transitions (4 styles) — all synthesized from scratch." },
];

// ─── Product 4: SLM Tools ─────────────────────────────────────────────────
const SLM_FEATURES = [
  {
    icon: Brain,
    title: "Video Tutorial Pipeline",
    description: "Provide a website URL + credentials + help section, and an SLM generates an entire video tutorial: script, narration, annotations, music, and export.",
    capabilities: ["Website crawling with login automation", "Documentation parsing (tutorials, FAQs, guides)", "LLM prompt pipeline (works with any SLM or API)", "Automated screenshot capture at each step", "Formant-based TTS speech synthesis", "Multi-track audio composition"],
  },
  {
    icon: Mic,
    title: "Audio Tutorial Pipeline",
    description: "Generate audio-only tutorials with narration, background music, sound effects, and transitions. Export as WAV files.",
    capabilities: ["5 BGM styles (corporate, upbeat, calm, dramatic, minimal)", "7 SFX types (click, whoosh, success, error, pop, typing, notification)", "4 voice presets (narrator, female, male, child)", "Multi-scene composition with fade in/out", "Direct WAV export — no external encoding"],
  },
];

// ─── Shared ───────────────────────────────────────────────────────────────
const NLP_FEATURES = [
  { icon: Eye, title: "OCR Text Recognition", description: "On-device optical character recognition via WASM. No cloud API needed.", details: ["Tesseract.js WASM runtime", "Multi-language support", "Bounding box detection", "Confidence scoring"] },
  { icon: Lock, title: "Sensitive Data Detection", description: "Automatically identifies PII, credentials, API keys, emails, phone numbers.", details: ["Regex + ML hybrid detection", "Credit card patterns (Luhn)", "Email, phone, SSN detection", "API key and token patterns"] },
  { icon: FileText, title: "Alt-Text Generation", description: "Suggests descriptive alt-text for captured images based on OCR and layout analysis.", details: ["Layout-aware descriptions", "Element hierarchy analysis", "WCAG compliance suggestions", "Batch generation"] },
  { icon: Layers, title: "Step-Guide Generation", description: "Creates numbered step-by-step guides from a sequence of captures.", details: ["Sequential capture analysis", "Action inference (click, type, scroll)", "Timing estimation", "Export as HTML or PDF"] },
];

const NOTEBOOK_FEATURES = [
  {
    icon: "Cpu",
    title: "Hardware evaluation",
    description: "One local probe of RAM, cores, and elevation-free inference backends.",
    capabilities: ["Total + available RAM", "Backend availability", "Nothing leaves the machine", "Feeds every suggestion"],
  },
  {
    icon: "Scissors",
    title: "Build planner + quantizer",
    description: "Decides how many small-bit builds to create, then makes them.",
    capabilities: ["Q8 → Q4 → IQ2/IQ3 → b1.58", "Importance-matrix calibration", "Requantization refused", "Per-level error verification"],
  },
  {
    icon: "Download",
    title: "Torrent-style downloads",
    description: "Chunked, parallel, resumable GGUF fetching with HF authentication.",
    capabilities: ["HTTP Range resumption", "SHA256 verification", "Bearer token for gated models", "Token never persisted"],
  },
  {
    icon: "RefreshCw",
    title: "Free-provider failover",
    description: "Nine permanent free tiers with background vendor shifting.",
    capabilities: ["Circuit breaker per provider", "Half-open recovery probes", "Local daily-quota tracking", "Shift log, zero interruptions"],
  },
  {
    icon: "Users",
    title: "Agents playground sizing",
    description: "Answers \"how many agents are possible\" with shown arithmetic.",
    capabilities: ["Core-bound compute limit", "RAM-bound model slots", "Shared-instance preference", "Role ladder assignment"],
  },
  {
    icon: "KeyRound",
    title: "API key analysis",
    description: "Whether one key runs your swarm, per provider, with numbers.",
    capabilities: ["RPM / TPM / concurrency math", "All major providers ranked", "Key rotation guidance", "Hybrid local+API suggestion"],
  },
];

const SECURITY_FEATURES = [
  { icon: Shield, title: "Sandbox Isolation", description: "Every capture runs in an OS-level sandbox. Linux: rlimits + seccomp-bpf. macOS: App Sandbox. Windows: Job Objects.", details: ["Resource limits (CPU, memory, files, processes)", "Network isolation for untrusted pages", "Per-request browser context", "Configurable: none, basic, full"] },
  { icon: Lock, title: "SSRF Protection", description: "Scheme allowlists, private network blocks, loopback rejection, and credential URL rejection.", details: ["IP address validation at the edge", "Redirect re-validation", "Domain allowlist/denylist policies", "Rate limiting per identity"] },
  { icon: Eye, title: "Visual Comparison", description: "Post-capture pixel-by-pixel comparison to verify integrity.", details: ["Post-capture validation", "Pixel diff detection", "Integrity hash generation", "Tamper detection for stored SVGs"] },
];

function ProductSection({
  id, icon: Icon, tag, label, title, children,
}: {
  id: string; icon: React.ElementType; tag: string; label: string; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-b border-zinc-200">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-zinc-100">
            <Icon className="size-5 text-zinc-700" />
          </div>
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">{label}</p>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">{tag}</span>
          </div>
        </div>
        <h2 className="mt-6 max-w-2xl font-serif text-3xl tracking-tight text-zinc-900 md:text-4xl">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export default function Features() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Nav */}
      <SiteNav />

      {/* Hero */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-16 md:pt-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <p className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-medium text-zinc-500">
              <span className="size-1.5 rounded-full bg-zinc-900" />
              Complete feature catalog
            </p>
            <h1 className="mt-7 max-w-3xl font-serif text-[44px] leading-[1.05] tracking-tight text-zinc-900 md:text-[64px]">
              Four products. Every feature.
            </h1>
            <p className="mt-6 max-w-xl text-[16px] leading-8 text-zinc-500">
              Image capture, screen recording, video editing, and SLM-powered tutorial generation —
              every feature built from scratch with zero external runtime dependencies.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {[
                { href: "#capture", label: "Image Capture" },
                { href: "#recorder", label: "Screen Recorder" },
                { href: "#editor", label: "Video Editor" },
                { href: "#slm", label: "SLM Tools" },
                { href: "#notebook", label: "Notebook" },
                { href: "#studio", label: "Agent Studio" },
              ].map((p) => (
                <a key={p.href} href={p.href} className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-600 transition-all hover:border-zinc-900 hover:text-zinc-900">
                  {p.label}
                </a>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Product 1: Image Capture ──────────────────────────────────── */}
      <ProductSection id="capture" icon={Camera} tag="Product 1" label="Image Capture" title="Turn any webpage into an editable SVG.">
        <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
          The core capture engine renders pages in a real browser, captures the result as raster inside SVG, and adds annotations as native vector elements.
        </p>

        {/* Capture modes */}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {CAPTURE_MODES.map((mode) => (
            <div key={mode.name} className="rounded-xl border border-zinc-200 bg-white p-6">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${mode.status === "Production" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"}`}>
                {mode.status}
              </span>
              <h3 className="mt-4 text-[17px] font-semibold tracking-tight text-zinc-900">{mode.name}</h3>
              <p className="mt-2 text-[13px] leading-6 text-zinc-500">{mode.description}</p>
              <ul className="mt-4 space-y-1.5">
                {mode.capabilities.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[12px] text-zinc-600">
                    <Check className="mt-0.5 size-3 shrink-0 text-zinc-900" />{c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Annotation tools */}
        <h3 className="mt-16 text-[20px] font-semibold text-zinc-900">11 Annotation Tools</h3>
        <p className="mt-2 max-w-xl text-[14px] leading-7 text-zinc-500">
          Every annotation is a native SVG element. Edit, reorder, hide — then re-export without recapturing.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {ANNOTATION_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <div key={tool.name} className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-zinc-100">
                  <Icon className="size-4 text-zinc-700" />
                </div>
                <div>
                  <h4 className="text-[13px] font-semibold text-zinc-900">{tool.name}</h4>
                  <p className="mt-0.5 text-[11.5px] leading-4 text-zinc-500">{tool.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* NLP & OCR — part of capture */}
        <h3 className="mt-16 text-[20px] font-semibold text-zinc-900">On-Device NLP & OCR</h3>
        <p className="mt-2 max-w-xl text-[14px] leading-7 text-zinc-500">
          Text recognition, sensitive data detection, alt-text generation, and step-guide creation — all running locally via WASM.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {NLP_FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div key={feat.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-100"><Icon className="size-5 text-zinc-700" /></div>
                <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{feat.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">{feat.description}</p>
                <ul className="mt-3 space-y-1">
                  {feat.details.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-[12px] text-zinc-600">
                      <Check className="mt-0.5 size-3 shrink-0 text-zinc-900" />{d}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <Link to="/" className="mt-8 inline-flex items-center gap-2 text-[14px] font-medium text-zinc-900">
          Back to all products <ArrowRight className="size-4" />
        </Link>
      </ProductSection>

      {/* ─── Product 2: Screen Recorder ────────────────────────────────── */}
      <ProductSection id="recorder" icon={MonitorPlay} tag="Product 2" label="Screen Recorder" title="Record any screen. Edit instantly.">
        <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
          Capture your entire screen, a region, or a single application window — with system audio, microphone, click highlights, and webcam overlay.
        </p>

        {/* Record modes */}
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {RECORD_MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <div key={mode.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-100"><Icon className="size-5 text-zinc-700" /></div>
                <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{mode.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">{mode.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Recorder features */}
        <h3 className="mt-16 text-[20px] font-semibold text-zinc-900">Recording Features</h3>
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {RECORDER_FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div key={feat.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-100"><Icon className="size-5 text-zinc-700" /></div>
                <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{feat.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">{feat.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Platform support */}
        <h3 className="mt-16 text-[20px] font-semibold text-zinc-900">Platform Support</h3>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            { name: "Windows", desc: "DXGI Desktop Duplication API. System audio via WASAPI.", tag: "Full" },
            { name: "macOS", desc: "CoreGraphics ScreenCaptureKit. System audio via Core Audio.", tag: "Full" },
            { name: "Linux", desc: "X11 (XGetImage) and Wayland (PipeWire). PulseAudio.", tag: "Full" },
            { name: "Browser", desc: "Tab capture with tab audio. No system-level access needed.", tag: "Extension" },
          ].map((p) => (
            <div key={p.name} className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <h4 className="text-[14px] font-semibold text-zinc-900">{p.name}</h4>
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">{p.tag}</span>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-zinc-500">{p.desc}</p>
            </div>
          ))}
        </div>

        <Link to="/recorder" className="mt-8 inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white hover:bg-zinc-700">
          Explore Screen Recorder <ArrowRight className="size-4" />
        </Link>
      </ProductSection>

      {/* ─── Product 3: Video Editor ───────────────────────────────────── */}
      <ProductSection id="editor" icon={Film} tag="Product 3" label="Video Editor" title="Full browser-based video editing.">
        <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
          Complete video editor built from scratch — WebCodecs for decoding, Canvas 2D for compositing,
          Web Audio API for audio processing, MediaRecorder for export. Zero external dependencies.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {VIDEO_FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div key={feat.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-100"><Icon className="size-5 text-zinc-700" /></div>
                <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{feat.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">{feat.description}</p>
                {feat.link && (
                  <Link to={feat.link} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-900 underline underline-offset-2">
                    Open editor <ArrowRight className="size-3" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
        <Link to="/editor" className="mt-8 inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white hover:bg-zinc-700">
          Open Video Editor <ArrowRight className="size-4" />
        </Link>
      </ProductSection>

      {/* ─── Product 4: SLM Tools ──────────────────────────────────────── */}
      <ProductSection id="slm" icon={Brain} tag="Product 4" label="SLM Tools" title="AI-powered tutorial generation for small language models.">
        <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
          Built specifically for SLMs. Give it a website URL, credentials, and help section — it generates
          a complete video tutorial with narration, music, and annotations. All on-device.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {SLM_FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div key={feat.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-100"><Icon className="size-5 text-zinc-700" /></div>
                <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{feat.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">{feat.description}</p>
                <ul className="mt-3 space-y-1">
                  {feat.capabilities.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-[12px] text-zinc-600">
                      <Check className="mt-0.5 size-3 shrink-0 text-zinc-900" />{c}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Pipeline output preview */}
        <div className="mt-10 rounded-xl border border-zinc-200 bg-[#fafaf9] p-6">
          <h3 className="text-[15px] font-semibold text-zinc-900">Pipeline Output</h3>
          <div className="mt-4 space-y-2">
            {["Crawl → 5 login commands, 2 pages extracted", "Parse → 23+13 structured content blocks", "Script → 11 scenes, 65.9s estimated", "Capture → 9 steps, 39 CDP commands", "TTS → 2.9M samples, 564× speed", "BGM → 75s corporate track, 210ms", "Mix → Narration + BGM + SFX → 3.9 MB WAV", "HTML → Standalone presentation, 8 KB"].map((line) => (
              <div key={line} className="rounded bg-zinc-950 px-3 py-2 font-mono text-[11px] text-zinc-400">
                <span className="text-green-400">✓</span> {line}
              </div>
            ))}
          </div>
        </div>

        <Link to="/tools" className="mt-8 inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white hover:bg-zinc-700">
          Explore SLM Tools <ArrowRight className="size-4" />
        </Link>
      </ProductSection>

      {/* ─── Notebook (agent platform onboarding) ───────────────────── */}
      <ProductSection id="notebook" icon={NotebookPen} tag="Agent Platform" label="stitaP Notebook" title="From hardware scan to running agents, in one interface.">
        <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
          The Notebook is the onboarding surface of the whole suite: a chat interface whose Configure
          panel evaluates your machine, downloads models torrent-style, creates and verifies small-bit
          builds, sizes an agent swarm, and keeps a pool of free API providers on automatic failover.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {NOTEBOOK_FEATURES.map((feat) => {
            const Icon = ({ Cpu, Scissors, Download, RefreshCw, Users, KeyRound } as Record<string, React.ElementType>)[feat.icon];
            return (
              <div key={feat.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-100"><Icon className="size-5 text-zinc-700" /></div>
                <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{feat.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">{feat.description}</p>
                <ul className="mt-3 space-y-1">
                  {feat.capabilities.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-[12px] text-zinc-600">
                      <Check className="mt-0.5 size-3 shrink-0 text-zinc-900" />{c}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Five-step flow preview */}
        <div className="mt-10 rounded-xl border border-zinc-200 bg-[#fafaf9] p-6">
          <h3 className="text-[15px] font-semibold text-zinc-900">The five-step flow</h3>
          <div className="mt-4 space-y-2">
            {["1 · Evaluate hardware — local probe of RAM, cores, backends", "2 · Pick a model family — Qwen / Llama / Gemma / BitNet, honest gating notes", "3 · Download — chunked + resumable, Hugging Face token for gated repos", "4 · Create builds — planner refuses bad conversions, verifier checks error levels", "5 · Choose interface — chat, agents playground (sized), or API keys (analyzed)", "↳ Free-provider pool — 9 tiers, circuit breakers, background failover"].map((line) => (
              <div key={line} className="rounded bg-zinc-950 px-3 py-2 font-mono text-[11px] text-zinc-400">
                <span className="text-green-400">✓</span> {line}
              </div>
            ))}
          </div>
        </div>

        <Link to="/notebook" className="mt-8 inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white hover:bg-zinc-700">
          Open the Notebook <ArrowRight className="size-4" />
        </Link>
      </ProductSection>

      {/* ─── Agent Studio (definition + supervision) ─────────────── */}
      <ProductSection id="studio" icon={NotebookPen} tag="Agent Platform" label="Agent Studio" title="Define agents. Scope what they know and touch. Supervise the run.">
        <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
          Where agent roles are defined: eight roles with fixed responsibilities, a notebook-style document
          list per agent with a browse-or-confine internet checkbox, tool scope drawn from the store with a
          basic principle per tool, solution templates, and a multi-user workspace with internal-first git sync.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {[
            {
              icon: Users,
              title: "Role catalog",
              description: "Eight swarm roles, each with fixed responsibilities and a default scope.",
              capabilities: ["Planner → verifier ladder", "Fixed responsibilities per role", "Default context budgets", "Scope statement per agent"],
            },
            {
              icon: FileText,
              title: "Knowledge scope",
              description: "A notebook-style document list per agent, plus the internet policy.",
              capabilities: ["PDFs, links, notes, online material", "Multiselect per agent", "Browse-or-confine checkbox", "Confined + web source = refused"],
            },
            {
              icon: Wrench,
              title: "Tool scope + principles",
              description: "Grant tools explicitly from the store, with a rule per tool.",
              capabilities: ["All 106 tools selectable", "Per-tool basic principle", "Principles render into the prompt", "Fully auditable scope"],
            },
            {
              icon: RefreshCw,
              title: "Solution templates",
              description: "Accomplishment recipes: when a milestone passes, act.",
              capabilities: ["Capture & attach to Jira ticket", "Implement → verify → commit", "Audit & report evidence pack", "Docs from diff"],
            },
            {
              icon: Users,
              title: "Team workspace",
              description: "Many users, many agents, structured feedback.",
              capabilities: ["Task assignment to defined agents", "Approve / request-changes / comment", "Live state dots: green working", "Amber approval gates, rose blocked"],
            },
            {
              icon: GitBranch,
              title: "Internal-first sync",
              description: "Checkins land on the internal git; externals are opt-in.",
              capabilities: ["GitHub / GitLab at your cadence", "Jira / Linear ticketing", "Evidence attachments opt-in", "Destinations always visible"],
            },
          ].map((feat) => {
            const Icon = feat.icon;
            return (
              <div key={feat.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-100"><Icon className="size-5 text-zinc-700" /></div>
                <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{feat.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">{feat.description}</p>
                <ul className="mt-3 space-y-1">
                  {feat.capabilities.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-[12px] text-zinc-600">
                      <Check className="mt-0.5 size-3 shrink-0 text-zinc-900" />{c}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <Link to="/studio" className="mt-8 inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white hover:bg-zinc-700">
          Open Agent Studio <ArrowRight className="size-4" />
        </Link>
      </ProductSection>

      {/* ─── Security (shared across all products) ─────────────────────── */}
      <ProductSection id="security" icon={Shield} tag="All Products" label="Security & Infrastructure" title="Security built into every product.">
        <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
          Every capture, recording, and export runs through the same security infrastructure — sandbox isolation, SSRF protection, and visual validation.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {SECURITY_FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div key={feat.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="grid size-10 place-items-center rounded-lg bg-zinc-100"><Icon className="size-5 text-zinc-700" /></div>
                <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{feat.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">{feat.description}</p>
                <ul className="mt-3 space-y-1">
                  {feat.details.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-[12px] text-zinc-600">
                      <Check className="mt-0.5 size-3 shrink-0 text-zinc-900" />{d}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </ProductSection>

      {/* CTA */}
      <section className="bg-zinc-950 text-white">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h2 className="mx-auto max-w-3xl font-serif text-3xl tracking-tight md:text-5xl">
            Four products. One platform. Zero dependencies.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[14px] leading-7 text-zinc-400">
            Sign in and start using any product instantly — no API key, no setup.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth?returnTo=%2Fdashboard" className="group inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-[14px] font-medium text-zinc-900 hover:bg-zinc-200">
              Get started free <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link to="/downloads" className="rounded-md border border-white/20 px-6 py-3 text-[14px] font-medium text-zinc-300 hover:border-white/60">
              Download apps
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}

import { motion } from "framer-motion";
import {
  Circle,
  Monitor,
  MonitorPlay,
  ArrowRight,
  Check,
  Link,
  Download,
  Timer,
  Zap,
  Globe,
  Puzzle,
  Terminal,
  Mic,
  Pause,
  Play,
  Square,
  Maximize2,
  Settings,
  MousePointer2,
} from "lucide-react";
import { Link as RouterLink } from "react-router";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

const RECORD_MODES = [
  {
    icon: Monitor,
    title: "Full Screen",
    description: "Capture everything on any connected display. Perfect for tutorials, presentations, and bug reports.",
  },
  {
    icon: Maximize2,
    title: "Region Select",
    description: "Drag to select any region. Live dimensions overlay shows exact pixel size as you select.",
  },
  {
    icon: Globe,
    title: "Browser Tab",
    description: "Record a specific browser tab or window. Audio from the tab is captured automatically.",
  },
  {
    icon: MonitorPlay,
    title: "Application Window",
    description: "Record a single application window. Other apps stay private — only the target window is captured.",
  },
];

const FEATURES = [
  {
    title: "Pause & Resume",
    body: "Pause the recording at any time and resume where you left off. Paused sections are automatically trimmed from the output.",
    icon: Pause,
  },
  {
    title: "Click Highlights",
    body: "Visual click indicators with customizable colors and animation. Perfect for tutorials showing where to click.",
    icon: MousePointer2,
  },
  {
    title: "System Audio",
    body: "Capture system audio, browser audio, or microphone input. Mix multiple audio sources with volume control.",
    icon: Mic,
  },
  {
    title: "Webcam Overlay",
    body: "Picture-in-picture webcam feed positioned anywhere on screen. Resizable, movable, with border and shadow.",
    icon: Circle,
  },
  {
    title: "Countdown Timer",
    body: "3-2-1 countdown before recording starts. Gives you time to prepare and navigate to the right screen.",
    icon: Timer,
  },
  {
    title: "Hotkeys",
    body: "Keyboard shortcuts for start, stop, pause, resume, and region select. No need to switch away from what you're recording.",
    icon: Zap,
  },
  {
    title: "Output Formats",
    body: "WebM (default, smallest), MP4 (widest compatibility), GIF (for docs and chat), APNG (animated PNG).",
    icon: Settings,
  },
  {
    title: "Frame Rate Control",
    body: "Choose from 15, 24, 30, or 60 FPS. Lower for tutorials, higher for fast-moving content like gaming.",
    icon: Timer,
  },
];

const PLATFORMS = [
  {
    icon: Monitor,
    name: "Windows",
    description: "Desktop capture via DXGI Desktop Duplication API. Application and region capture. System audio via WASAPI.",
    tag: "Full Support",
    tagColor: "green",
  },
  {
    icon: Monitor,
    name: "macOS",
    description: "Screen capture via CoreGraphics ScreenCaptureKit. Window and region capture. System audio via Core Audio.",
    tag: "Full Support",
    tagColor: "green",
  },
  {
    icon: Terminal,
    name: "Linux",
    description: "X11 (XGetImage) and Wayland (PipeWire portal). Application and region capture. Audio via PulseAudio.",
    tag: "Full Support",
    tagColor: "green",
  },
  {
    icon: Puzzle,
    name: "Browser Extension",
    description: "Tab capture with tab audio. Region selection overlay. No system-level access needed.",
    tag: "Chrome / Edge",
    tagColor: "blue",
  },
];

const WORKFLOW = [
  { step: "01", title: "Choose Source", body: "Select full screen, region, window, or browser tab. Configure audio sources and frame rate." },
  { step: "02", title: "Countdown", body: "3-2-1 countdown overlay. Navigate to your starting screen during the countdown." },
  { step: "03", title: "Record", body: "Live recording with pause/resume, click highlights, and webcam overlay. Hotkeys for all controls." },
  { step: "04", title: "Review & Export", body: "Preview the recording in the built-in player. Trim start/end, then export as WebM, MP4, GIF, or APNG." },
];



export default function Recorder() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Nav */}
      <SiteNav />

      {/* Hero */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-20 md:pt-28">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-medium text-zinc-500">
              <Circle className="size-3 fill-red-500 text-red-500" />
              Screen Recorder
            </div>
            <h1 className="mt-7 max-w-3xl font-serif text-[44px] leading-[1.05] tracking-tight text-zinc-900 md:text-[68px]">
              Record any screen. Edit instantly.
            </h1>
            <p className="mt-6 max-w-xl text-[16px] leading-8 text-zinc-500">
              Capture your entire screen, a region, or a single application window — with system audio,
              microphone, click highlights, and webcam overlay. Export as WebM, MP4, GIF, or APNG.
              All processing happens on-device.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <RouterLink
                to="/auth?returnTo=%2Fdashboard"
                className="group inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white hover:bg-zinc-700"
              >
                Start recording
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </RouterLink>
              <RouterLink
                to="/features#recorder"
                className="rounded-md border border-zinc-300 px-5 py-3 text-[14px] font-medium text-zinc-700 hover:border-zinc-900"
              >
                See all features
              </RouterLink>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {["Windows", "macOS", "Linux", "Chrome Extension"].map((p) => (
                <span key={p} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-500">
                  {p}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Hero mock */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-16"
          >
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.18)]">
              <svg viewBox="0 0 1200 680" className="block w-full" role="img" aria-label="Screen recorder interface mockup">
                <rect width="1200" height="680" fill="#18181b" />
                {/* Title bar */}
                <rect width="1200" height="36" fill="#27272a" />
                <circle cx="18" cy="18" r="6" fill="#ef4444" />
                <circle cx="38" cy="18" r="6" fill="#eab308" />
                <circle cx="58" cy="18" r="6" fill="#22c55e" />
                <rect x="500" y="10" width="200" height="16" rx="4" fill="#3f3f46" />
                <text x="600" y="22" textAnchor="middle" fontSize="10" fill="#a1a1aa" fontFamily="sans-serif">stitap-recorder</text>
                {/* Recording indicator */}
                <circle cx="1130" cy="18" r="6" fill="#ef4444">
                  <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
                </circle>
                <text x="1110" y="22" textAnchor="end" fontSize="10" fill="#ef4444" fontFamily="monospace">00:03:42</text>
                {/* Screen content area */}
                <rect x="20" y="50" width="1160" height="520" rx="8" fill="#ffffff" />
                {/* Fake browser content */}
                <rect x="20" y="50" width="1160" height="32" rx="8" fill="#f4f4f5" />
                <rect x="20" y="74" width="1160" height="8" fill="#f4f4f5" />
                <rect x="40" y="58" width="80" height="16" rx="4" fill="#e4e4e7" />
                <rect x="130" y="58" width="500" height="16" rx="4" fill="#ffffff" stroke="#d4d4d8" />
                <rect x="700" y="58" width="100" height="16" rx="4" fill="#22c55e" />
                {/* Page content */}
                <rect x="60" y="100" width="300" height="20" rx="4" fill="#18181b" />
                <rect x="60" y="130" width="250" height="10" rx="4" fill="#a1a1aa" />
                <rect x="60" y="150" width="270" height="10" rx="4" fill="#a1a1aa" />
                <rect x="60" y="180" width="180" height="30" rx="6" fill="#18181b" />
                {/* Cards */}
                <rect x="60" y="230" width="350" height="120" rx="8" fill="#fafafa" stroke="#e4e4e7" />
                <rect x="430" y="230" width="350" height="120" rx="8" fill="#fafafa" stroke="#e4e4e7" />
                <rect x="800" y="230" width="350" height="120" rx="8" fill="#fafafa" stroke="#e4e4e7" />
                <rect x="80" y="250" width="60" height="14" rx="4" fill="#e4e4e7" />
                <rect x="80" y="276" width="250" height="10" rx="4" fill="#18181b" />
                <rect x="80" y="296" width="280" height="8" rx="4" fill="#d4d4d8" />
                <rect x="80" y="312" width="200" height="8" rx="4" fill="#d4d4d8" />
                <rect x="450" y="250" width="60" height="14" rx="4" fill="#e4e4e7" />
                <rect x="450" y="276" width="260" height="10" rx="4" fill="#18181b" />
                <rect x="450" y="296" width="230" height="8" rx="4" fill="#d4d4d8" />
                <rect x="450" y="312" width="270" height="8" rx="4" fill="#d4d4d8" />
                <rect x="820" y="250" width="60" height="14" rx="4" fill="#e4e4e7" />
                <rect x="820" y="276" width="240" height="10" rx="4" fill="#18181b" />
                <rect x="820" y="296" width="280" height="8" rx="4" fill="#d4d4d8" />
                <rect x="820" y="312" width="210" height="8" rx="4" fill="#d4d4d8" />
                {/* Region selection overlay */}
                <rect x="60" y="230" width="350" height="120" rx="8" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 4" />
                {/* Selection handles */}
                <circle cx="60" cy="230" r="5" fill="#3b82f6" />
                <circle cx="410" cy="230" r="5" fill="#3b82f6" />
                <circle cx="60" cy="350" r="5" fill="#3b82f6" />
                <circle cx="410" cy="350" r="5" fill="#3b82f6" />
                {/* Dimensions overlay */}
                <rect x="180" y="220" width="100" height="20" rx="4" fill="#3b82f6" />
                <text x="230" y="234" textAnchor="middle" fontSize="10" fill="white" fontFamily="monospace">350 × 120</text>
                {/* Webcam overlay */}
                <rect x="960" y="400" width="180" height="120" rx="10" fill="#27272a" stroke="#3f3f46" strokeWidth="2" />
                <circle cx="1050" cy="440" r="25" fill="#3f3f46" />
                <circle cx="1050" cy="435" r="12" fill="#52525b" />
                <rect x="1020" y="455" width="60" height="20" rx="10" fill="#52525b" />
                <text x="1050" y="485" textAnchor="middle" fontSize="9" fill="#a1a1aa" fontFamily="sans-serif">Camera</text>
                {/* Bottom toolbar */}
                <rect x="20" y="586" width="1160" height="84" rx="8" fill="#27272a" />
                {/* Transport controls */}
                <circle cx="600" cy="628" r="22" fill="#ef4444">
                  <animate attributeName="r" values="22;24;22" dur="1s" repeatCount="indefinite" />
                </circle>
                <rect x="596" y="620" width="8" height="16" rx="2" fill="white" />
                <circle cx="540" cy="628" r="16" fill="#3f3f46" />
                <rect x="534" y="622" width="5" height="12" rx="1" fill="#a1a1aa" transform="skewX(-10)" />
                <circle cx="660" cy="628" r="16" fill="#3f3f46" />
                <rect x="550" y="642" width="100" height="4" rx="2" fill="#3f3f46" />
                <rect x="550" y="642" width="45" height="4" rx="2" fill="#ef4444" />
                {/* Side controls */}
                <rect x="120" y="618" width="80" height="22" rx="4" fill="#3f3f46" />
                <text x="160" y="633" textAnchor="middle" fontSize="10" fill="#a1a1aa" fontFamily="sans-serif">🎤 Mic</text>
                <rect x="210" y="618" width="100" height="22" rx="4" fill="#3f3f46" />
                <text x="260" y="633" textAnchor="middle" fontSize="10" fill="#a1a1aa" fontFamily="sans-serif">🔊 System</text>
                <rect x="900" y="618" width="100" height="22" rx="4" fill="#3f3f46" />
                <text x="950" y="633" textAnchor="middle" fontSize="10" fill="#a1a1aa" fontFamily="sans-serif">1080p 30fps</text>
                <rect x="1020" y="618" width="60" height="22" rx="4" fill="#3f3f46" />
                <text x="1050" y="633" textAnchor="middle" fontSize="10" fill="#a1a1aa" fontFamily="sans-serif">WebM</text>
              </svg>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {["1080p", "30 FPS", "System audio", "Region select", "WebM export"].map((chip) => (
                <span key={chip} className="rounded-full border border-zinc-200 bg-white px-3 py-1 font-mono text-[11px] text-zinc-500">
                  {chip}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Record modes */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Capture modes
          </p>
          <h2 className="mt-4 max-w-xl font-serif text-3xl tracking-tight text-zinc-900 md:text-4xl">
            Record what matters.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {RECORD_MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <div key={mode.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                  <div className="grid size-10 place-items-center rounded-lg bg-zinc-100">
                    <Icon className="size-5 text-zinc-700" />
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{mode.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-500">{mode.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Features
          </p>
          <h2 className="mt-4 max-w-xl font-serif text-3xl tracking-tight text-zinc-900 md:text-4xl">
            Everything you need to record.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title} className="rounded-xl border border-zinc-200 bg-white p-6">
                  <div className="grid size-10 place-items-center rounded-lg bg-zinc-100">
                    <Icon className="size-5 text-zinc-700" />
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{feat.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-500">{feat.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            How it works
          </p>
          <h2 className="mt-4 font-serif text-3xl tracking-tight text-zinc-900 md:text-4xl">
            Four steps to a perfect recording.
          </h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 md:grid-cols-4">
            {WORKFLOW.map((w) => (
              <div key={w.step} className="bg-white p-7">
                <span className="font-serif text-[26px] text-zinc-300">{w.step}</span>
                <h3 className="mt-3 text-[15px] font-semibold text-zinc-900">{w.title}</h3>
                <p className="mt-2 text-[12.5px] leading-6 text-zinc-500">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform support */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Platform support
          </p>
          <h2 className="mt-4 max-w-xl font-serif text-3xl tracking-tight text-zinc-900 md:text-4xl">
            Record from any platform.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PLATFORMS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.name} className="rounded-xl border border-zinc-200 bg-white p-6">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-lg bg-zinc-100">
                      <Icon className="size-5 text-zinc-700" />
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      p.tagColor === "green" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
                    }`}>
                      {p.tag}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold text-zinc-900">{p.name}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-500">{p.description}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-8">
            <RouterLink to="/downloads" className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-5 py-3 text-[14px] font-medium text-zinc-700 hover:border-zinc-900">
              Download for your platform
              <ArrowRight className="size-4" />
            </RouterLink>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-zinc-950 text-white">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h2 className="mx-auto max-w-2xl font-serif text-3xl tracking-tight md:text-5xl">
            Ready to record your screen?
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[14px] leading-7 text-zinc-400">
            Start recording with the web app — or download the desktop app for full-screen capture
            with system audio and webcam overlay.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <RouterLink to="/auth?returnTo=%2Fdashboard" className="group inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-[14px] font-medium text-zinc-900 hover:bg-zinc-200">
              Start recording
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </RouterLink>
            <RouterLink to="/downloads" className="rounded-md border border-white/20 px-6 py-3 text-[14px] font-medium text-zinc-300 hover:border-white/60">
              Download desktop app
            </RouterLink>
          </div>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}



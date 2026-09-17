import { useState } from "react";
import { motion } from "framer-motion";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import {
  Brain,
  Mic,
  Play,
  ArrowRight,
  Check,
  FileText,
  Volume2,
  Film,
  Type,
  Palette,
  Download,
  Globe,
  Key,
  HelpCircle,
  Terminal,
  Zap,
  Music,
  ArrowDown,
} from "lucide-react";
import { Link } from "react-router";

const PIPELINE_STEPS = [
  {
    step: "1",
    title: "Provide Website Access",
    description: "Enter the website URL, login credentials, and help section location.",
    inputs: ["Website URL", "Login URL", "Username/email", "Password", "CSS selectors"],
    icon: Globe,
  },
  {
    step: "2",
    title: "Crawl Help Section",
    description: "The crawler logs in, navigates to the help section, and extracts all pages with their content structure.",
    inputs: ["Help section URL", "Content selectors", "Ignore selectors", "Max pages limit"],
    icon: ArrowDown,
  },
  {
    step: "3",
    title: "Parse Documentation",
    description: "Converts raw HTML into structured tutorial steps. Detects tutorials, FAQs, reference docs, and guides. Infers actions (click, type, scroll) from content.",
    inputs: ["Crawled pages", "Content blocks", "Step headings", "Action patterns"],
    icon: FileText,
  },
  {
    step: "4",
    title: "Generate Script (SLM)",
    description: "The SLM reads parsed documentation and generates a tutorial script with scenes, narration text, visual cues, timing, and annotations.",
    inputs: ["Parsed tutorial", "Prompt templates", "Voice style", "Audience level"],
    icon: Brain,
  },
  {
    step: "5",
    title: "Capture Screenshots",
    description: "Automatically navigates through the website, capturing a screenshot at each step. Uses CDP commands for click, type, scroll, and hover.",
    inputs: ["Capture plan", "CDP commands", "Browser context", "Screenshot targets"],
    icon: Play,
  },
  {
    step: "6",
    title: "Synthesize Speech",
    description: "Formant-based text-to-speech generates narration audio from the script. No cloud API needed — runs entirely on-device.",
    inputs: ["Narration text", "Voice preset", "Speed control", "Audio buffer"],
    icon: Mic,
  },
  {
    step: "7",
    title: "Compose Audio",
    description: "Layers narration with background music, sound effects, and transitions. Volume mixing, fade in/out, and per-track control.",
    inputs: ["Narration audio", "BGM track", "SFX clips", "Fade curves"],
    icon: Volume2,
  },
  {
    step: "8",
    title: "Render Video",
    description: "Canvas compositing renders each scene: screenshots, text overlays, step markers, badges, and transitions. Exported as WebM.",
    inputs: ["Screenshot sequence", "Text overlays", "Transition types", "Frame timing"],
    icon: Film,
  },
  {
    step: "9",
    title: "Export Results",
    description: "Three output formats: WebM video with audio, standalone HTML presentation with keyboard navigation, and re-editable JSON script.",
    inputs: ["Composited video", "HTML template", "Script JSON", "Capture manifest"],
    icon: Download,
  },
];

const BGM_STYLES = [
  { name: "Corporate", description: "Professional, clean, trustworthy", tempo: "120 BPM", mood: "Neutral-positive" },
  { name: "Upbeat", description: "Energetic, motivating, fast-paced", tempo: "128 BPM", mood: "Positive" },
  { name: "Calm", description: "Relaxed, ambient, non-distracting", tempo: "90 BPM", mood: "Peaceful" },
  { name: "Dramatic", description: "Building intensity, cinematic", tempo: "100 BPM", mood: "Epic" },
  { name: "Minimal", description: "Sparse, barely noticeable background", tempo: "110 BPM", mood: "Subtle" },
];

const SFX_TYPES = [
  { name: "Click", use: "Button presses, menu selections" },
  { name: "Whoosh", use: "Page transitions, sliding panels" },
  { name: "Success", use: "Completed actions, form submissions" },
  { name: "Error", use: "Failed actions, validation errors" },
  { name: "Pop", use: "Notifications, tooltips appearing" },
  { name: "Typing", use: "Text input, search fields" },
  { name: "Notification", use: "Alerts, messages, badges" },
];

const VOICE_PRESETS = [
  { name: "Narrator", description: "Neutral, professional, clear diction", speed: "1.0x" },
  { name: "Female", description: "Higher pitch, warm tone", speed: "1.0x" },
  { name: "Male", description: "Lower pitch, authoritative", speed: "1.0x" },
  { name: "Child", description: "Young, enthusiastic, energetic", speed: "1.1x" },
];

const TEXT_PRESETS_COUNT = 15;
const COLOR_GRADES_COUNT = 33;
const STICKER_COUNT = 48;

export default function Tools() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "audio" | "video" | "assets">("pipeline");

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Nav */}
      <SiteNav />

      {/* Hero */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-16 md:pt-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <p className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-medium text-zinc-500">
              <Brain className="size-3.5" />
              Built for Small Language Models
            </p>
            <h1 className="mt-7 max-w-3xl font-serif text-[44px] leading-[1.05] tracking-tight text-zinc-900 md:text-[60px]">
              Tutorial generation tools for SLMs.
            </h1>
            <p className="mt-6 max-w-xl text-[16px] leading-8 text-zinc-500">
              Give an SLM a website URL, credentials, and help section — it generates
              a complete video tutorial with narration, background music, screenshots,
              and annotations. All on-device, zero cloud dependencies.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/editor" className="group inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700">
                Open video editor
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href="#pipeline" className="rounded-md border border-zinc-300 px-5 py-3 text-[14px] font-medium text-zinc-700 transition-colors hover:border-zinc-900">
                See the pipeline
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Tabs */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex gap-1 overflow-x-auto py-1">
            {([
              ["pipeline", "Tutorial Pipeline", Brain],
              ["video", "Video Editor Assets", Film],
              ["audio", "Audio Library", Volume2],
              ["assets", "Stickers & Presets", Zap],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors ${
                  activeTab === key
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Pipeline Tab */}
      {activeTab === "pipeline" && (
        <section id="pipeline" className="border-b border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="max-w-2xl">
              <h2 className="font-serif text-3xl tracking-tight text-zinc-900">
                9-step tutorial generation pipeline
              </h2>
              <p className="mt-4 text-[14px] leading-7 text-zinc-500">
                Each step produces structured output that feeds the next. The SLM's role is in step 4
                (script generation) — everything else is deterministic processing.
              </p>
            </div>

            <div className="mt-12 space-y-4">
              {PIPELINE_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div
                    key={step.step}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="grid gap-6 rounded-xl border border-zinc-200 bg-white p-6 md:grid-cols-[4rem_1fr_1fr]"
                  >
                    <div className="flex flex-col items-center">
                      <span className="grid size-10 place-items-center rounded-full border-2 border-zinc-900 font-serif text-[18px] font-bold text-zinc-900">
                        {step.step}
                      </span>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <div className="mt-2 h-4 w-px bg-zinc-200" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <Icon className="size-4 text-zinc-500" />
                        <h3 className="text-[15px] font-semibold text-zinc-900">{step.title}</h3>
                      </div>
                      <p className="mt-2 text-[13px] leading-6 text-zinc-500">{step.description}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">
                        Inputs
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {step.inputs.map((input) => (
                          <span key={input} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600">
                            {input}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Code example */}
            <div className="mt-12 rounded-xl border border-zinc-200 bg-zinc-950 p-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">
                Usage
              </p>
              <pre className="mt-3 overflow-x-auto font-mono text-[12px] leading-6 text-zinc-300">
{`import { runPipeline } from './src/lib/slm';

const result = runPipeline(
  [{ url: "https://example.com/help", html: "...", order: 0 }],
  {
    url: "https://example.com",
    credentials: {
      loginUrl: "https://example.com/login",
      username: "your@email.com",
      password: "your-password",
      usernameSelector: "#email",
      passwordSelector: "#password",
      submitSelector: "button[type=submit]",
      successSelector: ".user-avatar",
    },
    helpSection: {
      url: "https://example.com/help",
      maxPages: 20,
    },
    tutorial: {
      title: "How to Use ExampleApp",
      audienceLevel: "beginner",
    },
    output: "all", // script + HTML + video
  }
);

// result.script      → TutorialScript (11 scenes)
// result.html        → Standalone HTML presentation
// result.capturePlan → 9 browser actions
// result.parsedDocs  → Structured tutorial`}
              </pre>
            </div>
          </div>
        </section>
      )}

      {/* Video Assets Tab */}
      {activeTab === "video" && (
        <section className="border-b border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="font-serif text-3xl tracking-tight text-zinc-900">
              Video editor built-in assets
            </h2>
            <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
              All assets are generated programmatically — no external files, no cloud APIs.
              Every sticker, template, and effect is TypeScript code that renders to Canvas.
            </p>

            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Templates */}
              <div className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="flex items-center gap-2">
                  <Film className="size-4 text-zinc-500" />
                  <h3 className="text-[15px] font-semibold text-zinc-900">Video Templates</h3>
                  <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    22 templates
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  Pre-built compositions for common video formats.
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    { cat: "Intros", count: 5, items: "Cinematic, Modern Minimal, Gradient Splash, Typewriter, Countdown" },
                    { cat: "Outros", count: 3, items: "Thanks, Next Video, Credits Roll" },
                    { cat: "Lower Thirds", count: 3, items: "Modern, News Style, Minimal Bar" },
                    { cat: "Title Cards", count: 3, items: "Split, Bold Statement, Question" },
                    { cat: "Captions", count: 3, items: "Subtitle, Karaoke, Callout" },
                    { cat: "Social", count: 4, items: "Instagram, TikTok, Twitter/X, YouTube" },
                  ].map((g) => (
                    <div key={g.cat} className="rounded-lg bg-zinc-50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-zinc-700">{g.cat}</span>
                        <span className="text-[11px] text-zinc-400">{g.count}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{g.items}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Color Grades */}
              <div className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="flex items-center gap-2">
                  <Palette className="size-4 text-zinc-500" />
                  <h3 className="text-[15px] font-semibold text-zinc-900">Color Grades</h3>
                  <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    {COLOR_GRADES_COUNT} presets
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  Color grading presets that generate effects stacks.
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    { cat: "Cinematic", count: 6, items: "Hollywood, Teal & Orange, Blockbuster, Indie, Sci-Fi, Action" },
                    { cat: "Vintage", count: 6, items: "70s, Polaroid, Kodachrome, VHS, Faded, Noir" },
                    { cat: "Artistic", count: 5, items: "Pastel, Pop Art, Psychedelic, Watercolor, Comic" },
                    { cat: "Natural", count: 5, items: "Golden Hour, Blue Hour, Overcast, Forest, Autumn" },
                    { cat: "Dramatic", count: 4, items: "High Contrast, Bleach, Dark, Cross Process" },
                    { cat: "Monochrome", count: 6, items: "B&W, High Key, Low Key, Sepia, Duotone Blue/Red" },
                  ].map((g) => (
                    <div key={g.cat} className="rounded-lg bg-zinc-50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-zinc-700">{g.cat}</span>
                        <span className="text-[11px] text-zinc-400">{g.count}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{g.items}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Text Presets */}
              <div className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="flex items-center gap-2">
                  <Type className="size-4 text-zinc-500" />
                  <h3 className="text-[15px] font-semibold text-zinc-900">Text Animations</h3>
                  <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    {TEXT_PRESETS_COUNT} presets
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                  Animated text styles for titles and captions.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {[
                    "Typewriter", "Fade In Up", "Fade In Down", "Scale Pop", "Bounce",
                    "Glitch", "Glow Pulse", "Slide Left", "Slide Right", "Rotate In",
                    "Blur In", "Stagger Words", "Handwritten", "Neon Flicker", "None",
                  ].map((p) => (
                    <span key={p} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600">
                      {p}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-[12px] text-zinc-500">+ 15 font families, 8 color palettes</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Audio Tab */}
      {activeTab === "audio" && (
        <section className="border-b border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="font-serif text-3xl tracking-tight text-zinc-900">
              Audio library — all synthesized from scratch
            </h2>
            <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
              Every sound is generated programmatically via the Web Audio API. No sample files,
              no external downloads. Background music, sound effects, and ambient sounds — all TypeScript.
            </p>

            <div className="mt-10 grid gap-8 md:grid-cols-2">
              {/* BGM */}
              <div>
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
                  <Music className="size-4 text-zinc-500" />
                  Background Music
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">5 styles</span>
                </h3>
                <div className="mt-4 space-y-3">
                  {BGM_STYLES.map((bgm) => (
                    <div key={bgm.name} className="rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[13px] font-semibold text-zinc-900">{bgm.name}</h4>
                        <div className="flex gap-2">
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{bgm.tempo}</span>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{bgm.mood}</span>
                        </div>
                      </div>
                      <p className="mt-1 text-[12px] text-zinc-500">{bgm.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* SFX */}
              <div>
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
                  <Volume2 className="size-4 text-zinc-500" />
                  Sound Effects
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">7 types</span>
                </h3>
                <div className="mt-4 space-y-3">
                  {SFX_TYPES.map((sfx) => (
                    <div key={sfx.name} className="rounded-xl border border-zinc-200 bg-white p-4">
                      <h4 className="text-[13px] font-semibold text-zinc-900">{sfx.name}</h4>
                      <p className="mt-1 text-[12px] text-zinc-500">{sfx.use}</p>
                    </div>
                  ))}
                </div>

                <h3 className="mt-8 flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
                  <Mic className="size-4 text-zinc-500" />
                  Voice Presets
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">4 presets</span>
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {VOICE_PRESETS.map((voice) => (
                    <div key={voice.name} className="rounded-xl border border-zinc-200 bg-white p-4">
                      <h4 className="text-[13px] font-semibold text-zinc-900">{voice.name}</h4>
                      <p className="mt-1 text-[12px] text-zinc-500">{voice.description}</p>
                      <span className="mt-2 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        {voice.speed}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Assets Tab */}
      {activeTab === "assets" && (
        <section className="border-b border-zinc-200">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="font-serif text-3xl tracking-tight text-zinc-900">
              Stickers, shapes, and decorative elements
            </h2>
            <p className="mt-4 max-w-xl text-[14px] leading-7 text-zinc-500">
              All {STICKER_COUNT} stickers are SVG-based, scalable, tintable, and searchable.
              Use them in the video editor's annotation and overlay systems.
            </p>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {[
                { cat: "Emoji", count: 10, items: ["Star", "Heart", "Fire", "Lightning", "Check", "Cross", "Warning", "Info", "Sparkle", "Thumbs Up"] },
                { cat: "Shapes", count: 10, items: ["Circle", "Filled Circle", "Rectangle", "Filled Rectangle", "Diamond", "Triangle", "Hexagon", "Star", "Cross", "Pentagon"] },
                { cat: "Arrows", count: 8, items: ["Right", "Left", "Up", "Down", "Curved", "Dashed", "Double", "Pointer"] },
                { cat: "Callouts", count: 5, items: ["Speech Bubble", "Thought Bubble", "Rect Callout", "Tooltip", "Banner"] },
                { cat: "Icons", count: 8, items: ["Play", "Pause", "Volume", "Camera", "Scissors", "Crop", "Layers", "Magic Wand"] },
                { cat: "Decorative", count: 7, items: ["Confetti", "Sparkles", "Wavy Line", "Circle Frame", "Gradient Bar", "Brackets", "Dots"] },
              ].map((cat) => (
                <div key={cat.cat} className="rounded-xl border border-zinc-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-zinc-900">{cat.cat}</h3>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                      {cat.count}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {cat.items.map((item) => (
                      <li key={item} className="text-[11px] text-zinc-500">{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-xl border border-zinc-200 bg-[#fafaf9] p-6">
              <h3 className="text-[15px] font-semibold text-zinc-900">Asset totals</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                {[
                  ["Stickers", String(STICKER_COUNT), "SVG elements"],
                  ["Templates", "22", "Video compositions"],
                  ["Text Animations", String(TEXT_PRESETS_COUNT), "Animated styles"],
                  ["Color Grades", String(COLOR_GRADES_COUNT), "Grading presets"],
                  ["Audio Assets", "21", "Music + SFX + Ambient"],
                  ["Font Families", "15", "Serif, Sans, Mono, Display"],
                  ["Color Palettes", "8", "Classic, Neon, Pastel, etc."],
                  ["Transitions", "10", "Cross-fade, Wipe, Slide"],
                ].map(([label, count, desc]) => (
                  <div key={label} className="rounded-lg bg-white p-4">
                    <p className="font-serif text-[28px] text-zinc-900">{count}</p>
                    <p className="text-[13px] font-medium text-zinc-700">{label}</p>
                    <p className="text-[11px] text-zinc-400">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="bg-zinc-950 text-white">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="mx-auto max-w-2xl font-serif text-3xl tracking-tight md:text-4xl">
            Ready to generate tutorials with your SLM?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-7 text-zinc-400">
            Open the video editor, import your captures, and use the built-in
            templates and audio library — or run the SLM pipeline from the command line.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/editor" className="group inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-200">
              Open video editor
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link to="/features" className="rounded-md border border-white/20 px-6 py-3 text-[14px] font-medium text-zinc-300 transition-colors hover:border-white/60">
              View all features
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}

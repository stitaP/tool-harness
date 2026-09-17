import { useState } from "react";
import { motion } from "framer-motion";
import { SiteNav } from "@/components/site/SiteNav";
import { PdfManualButton } from "@/components/site/PdfManualButton";
import { SiteFooter } from "@/components/site/SiteFooter";
import {
  Search,
  ChevronRight,
  ArrowRight,
  Monitor,
  Puzzle,
  Globe,
  Terminal,
  Play,
  Brain,
  Shield,
  Download,
  BookOpen,
  Zap,
  FileText,
  Camera,
  Scissors,
  Type,
  Palette,
  HelpCircle,
  MonitorPlay,
  Package,
  Settings,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router";

interface HelpArticle {
  id: string;
  category: string;
  icon: React.ElementType;
  title: string;
  description: string;
  sections: { heading: string; content: string }[];
}

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "after-download",
    category: "Getting Started",
    icon: Package,
    title: "After Downloading: Complete Setup Guide",
    description: "Everything you need to do after downloading the source code or installers — step by step.",
    sections: [
      {
        heading: "What did you download?",
        content:
          "stitaP ships three types of artifacts. Pick the section that matches what you downloaded:\n\n" +
          "A) Source code zip (stitap-source-vX.Y.Z.zip) — the full project to build yourself\n" +
          "B) Pre-built installers (.exe / .dmg / .AppImage) — ready to run, no build needed\n" +
          "C) Browser extension zip — load into Chrome/Edge/Firefox\n\n" +
          "If you downloaded the source zip, continue to 'Option A' below. If you downloaded an installer, skip to 'Option B'. If you downloaded the extension zip, skip to 'Option C'.",
      },
      {
        heading: "Option A — Build from Source Code",
        content:
          "STEP 1: Install prerequisites\n\n" +
          "You need two tools before anything else:\n\n" +
          "Rust compiler (required for the capture engine and desktop app):\n" +
          "  • Windows: Download rustup-init.exe from https://rustup.rs and run it\n" +
          "  • macOS: Open Terminal and run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh\n" +
          "  • Linux: Same command as macOS. On Ubuntu/Debian also run: sudo apt install build-essential pkg-config libssl-dev\n\n" +
          "Bun (required for the web app, build scripts, and tests):\n" +
          "  • All platforms: Open Terminal and run: curl -fsSL https://bun.sh/install | bash\n" +
          "  • Verify: bun --version (should show 1.0 or higher)\n\n" +
          "Linux only — additional system libraries:\n" +
          "  sudo apt install libwebkit2gtk-4.1-dev libx11-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev\n" +
          "  (These are needed for the Tauri desktop app on Linux.)",
      },
      {
        heading: "STEP 2: Unzip and install dependencies",
        content:
          "Unzip the downloaded archive:\n" +
          "  • Windows: Right-click the zip → Extract All → Choose a folder\n" +
          "  • macOS: Double-click the zip, or run: unzip stitap-source-v0.6.0.zip\n" +
          "  • Linux: unzip stitap-source-v0.6.0.zip\n\n" +
          "Open a Terminal in the extracted folder and run:\n" +
          "  cd stitap\n" +
          "  bun install\n\n" +
          "This installs only the build tooling (Vite, TypeScript, Tailwind). The actual engines are all in-house — zero npm runtime dependencies.",
      },
      {
        heading: "STEP 3: Verify everything compiles",
        content:
          "Run the TypeScript type checker to make sure nothing is broken:\n" +
          "  bun tsc -b --noEmit\n\n" +
          "You should see zero errors. If you see errors, make sure you installed Rust and Bun correctly and that 'bun install' completed without errors.",
      },
      {
        heading: "STEP 4: Start the web app (fastest way to see stitaP)",
        content:
          "Run the development server:\n" +
          "  bun run dev\n\n" +
          "Open your browser to http://localhost:5173. You should see the stitaP homepage.\n\n" +
          "Click 'Launch the app' to enter the Tool Store with all 106 in-house tools.\n" +
          "Click 'Open Notebook' to access the chat interface with hardware evaluation, model download, and agents playground.\n\n" +
          "No API keys or model downloads are needed to explore the UI.",
      },
      {
        heading: "STEP 5: Run the test suites to verify your build",
        content:
          "stitaP includes 22 smoke-test suites that verify every subsystem. Run them all:\n\n" +
          "  # Core engines (these are the big ones)\n" +
          "  bun scripts/store-smoke.ts           # Tool registry: ~840 checks\n" +
          "  bun scripts/inference-smoke.ts        # Inference router: ~250 checks\n" +
          "  bun scripts/hermes-smoke.ts           # Orchestration engine: ~95 checks\n\n" +
          "  # Agent platform\n" +
          "  bun scripts/agent-smoke.ts            # Memory, skills, kanban: ~110 checks\n" +
          "  bun scripts/session-swarm-smoke.ts    # Session modules + swarm sizing: ~74 checks\n" +
          "  bun scripts/studio-smoke.ts           # Agent Studio: ~28 checks\n\n" +
          "  # Capture & sandbox\n" +
          "  bun scripts/capture-smoke.ts          # Hybrid SVG capture: ~425 checks\n" +
          "  bun scripts/sandbox-smoke.ts          # Sandbox isolation: ~116 checks\n" +
          "  bun scripts/nlp-smoke.ts              # NLP/OCR engine: ~108 checks\n" +
          "  bun scripts/vision-smoke.ts           # Vision model: ~14 checks\n\n" +
          "  # Inference sub-systems\n" +
          "  bun scripts/quantizer-smoke.ts        # Quantizer + API keys: ~27 checks\n" +
          "  bun scripts/failover-smoke.ts         # Free-provider failover: ~24 checks\n\n" +
          "  # Website & docs\n" +
          "  bun scripts/website-smoke.ts          # All pages & nav: ~106 checks\n" +
          "  bun scripts/pdf-smoke.ts              # PDF manual generator: ~34 checks\n\n" +
          "All suites should pass. If any fail, the error message tells you exactly which check failed and why.",
      },
      {
        heading: "STEP 6: Build the capture engine (Rust binary)",
        content:
          "The capture engine is a standalone Rust binary. Build it:\n\n" +
          "  cd engines\n" +
          "  cargo build --release\n\n" +
          "This takes 2-5 minutes on first build. The binary is at:\n" +
          "  engines/target/release/captured\n\n" +
          "Test it:\n" +
          "  ./target/release/captured --port 8080 --api-keys test-key\n" +
          "  curl http://localhost:8080/health\n\n" +
          'You should see: {"status":"ok"}\n\n' +
          "The engine handles: HTTP capture, WebSocket, Chrome DevTools Protocol, PNG/SVG export, full-page scrolling, and native screen capture — all from scratch in Rust.",
      },
      {
        heading: "STEP 7: Build the desktop app (optional)",
        content:
          "The desktop app wraps the web app and capture engine into a native window using Tauri v2:\n\n" +
          "  cd desktop/src-tauri\n" +
          "  cargo build --release\n\n" +
          "The desktop app adds:\n" +
          "  • Native screen capture (Windows: GDI BitBlt, macOS: CGWindowList, Linux: XGetImage)\n" +
          "  • Sandbox isolation (OS-level resource limits)\n" +
          "  • Offline operation (no browser needed)\n\n" +
          "Output location: desktop/src-tauri/target/release/bundle/",
      },
      {
        heading: "STEP 8: Build the browser extension (optional)",
        content:
          "Package the extension as a zip for Chrome/Edge/Firefox:\n\n" +
          "  bun scripts/package-extension.ts\n\n" +
          "Load it in your browser:\n" +
          "  1. Open chrome://extensions (or edge://extensions)\n" +
          "  2. Enable 'Developer mode' (top right)\n" +
          "  3. Click 'Load unpacked'\n" +
          "  4. Select the extension/ folder from the project root\n" +
          "  5. Click the stitaP icon in the toolbar\n\n" +
          "Keyboard shortcuts: Alt+Shift+V (quick capture), Alt+Shift+F (full page), Alt+Shift+R (region)",
      },
      {
        heading: "STEP 9: Build everything at once (alternative)",
        content:
          "Instead of building each component individually, use the all-in-one build script:\n\n" +
          "  ./scripts/build-releases.sh\n\n" +
          "This builds the Rust engine, desktop app, browser extension, and source zip. All artifacts land in dist/releases/vX.Y.Z/.\n\n" +
          "To specify a version number:\n" +
          "  RELEASE_VERSION=0.6.0 ./scripts/build-releases.sh",
      },
      {
        heading: "Option B — Install Pre-built Binaries",
        content:
          "If you downloaded an installer instead of the source code:\n\n" +
          "Windows:\n" +
          "  • .exe: Double-click to install. The capture engine starts automatically.\n" +
          "  • Portable .exe: Run directly — no installation needed.\n\n" +
          "macOS:\n" +
          "  • .dmg: Open the disk image, drag stitaP to Applications, then launch.\n" +
          "  • First launch: macOS may say 'unidentified developer'. Go to System Settings → Privacy & Security → Open Anyway.\n\n" +
          "Linux:\n" +
          "  • AppImage: chmod +x stitap-desktop-linux.AppImage && ./stitap-desktop-linux.AppImage\n" +
          "  • .deb (Ubuntu/Debian): sudo dpkg -i stitap.deb && sudo apt-get install -f\n" +
          "  • .rpm (Fedora/RHEL): sudo rpm -i stitap.rpm\n\n" +
          "After installation, launch stitaP from your applications menu. The capture engine starts automatically in the background.",
      },
      {
        heading: "Option C — Install the Browser Extension",
        content:
          "If you downloaded the extension zip:\n\n" +
          "  1. Unzip the file\n" +
          "  2. Open your browser (Chrome, Edge, or Firefox)\n" +
          "  3. Navigate to the extensions page:\n" +
          "     • Chrome: chrome://extensions\n" +
          "     • Edge: edge://extensions\n" +
          "     • Firefox: about:debugging#/runtime/this-firefox\n" +
          "  4. Enable Developer mode (Chrome/Edge) or click 'Load Temporary Add-on' (Firefox)\n" +
          "  5. Click 'Load unpacked' and select the unzipped extension/ folder\n" +
          "  6. The stitaP icon appears in your toolbar\n\n" +
          "To capture a page:\n" +
          "  • Navigate to any website\n" +
          "  • Click the stitaP icon or press Alt+Shift+V\n" +
          "  • Choose: Current Tab, Full Page, or Region\n" +
          "  • The capture opens in a new tab for annotation and export",
      },
      {
        heading: "First run: try the Notebook",
        content:
          "The Notebook is where you evaluate your hardware, download AI models, and start chatting or running agents:\n\n" +
          "  1. Open http://localhost:5173/notebook (or click 'Open Notebook' from the homepage)\n" +
          "  2. Click the gear icon (Configure) to open the setup wizard\n" +
          "  3. Step 1 — Evaluate hardware: Click the button. The probe reads your RAM, CPU cores, and available backends. Nothing leaves your machine.\n" +
          "  4. Step 2 — Pick a model family: Qwen2.5 (no account needed), Llama 3.2 or Gemma 2 (need Hugging Face token), or BitNet b1.58.\n" +
          "  5. Step 3 — Download: The build planner suggests quantization levels (Q8, Q4_K_M, Q3, Q2) based on your free RAM. Downloads are chunked and resumable.\n" +
          "  6. Step 4 — Verify: Each build is tested for error before use.\n" +
          "  7. Step 5 — Choose interface: Chat (single conversation) or Agents (multiple workers sized to your hardware).\n\n" +
          "Free providers: You can paste free API keys from Groq, Cerebras, Google AI Studio, and 6 other providers. When one provider fails, the notebook shifts to the next automatically.",
      },
      {
        heading: "First run: try the Tool Store",
        content:
          "The Tool Store shows all 106 in-house tools organized by category:\n\n" +
          "  1. Open http://localhost:5173/store\n" +
          "  2. Browse categories: Browser Automation (44 tools), Testing (10), Design QA (7), Agent Systems (10), Inference (6), Vision (6), Video (8), and more\n" +
          "  3. Click any tool to see its description, required capabilities, and which backends support it\n" +
          "  4. Enable/disable tools for your session using the notebook configuration\n\n" +
          "Every tool runs on your machine. No data is sent to external servers unless you explicitly configure an API provider.",
      },
      {
        heading: "First run: try the Agent Studio",
        content:
          "The Agent Studio is where you define agents, assign roles, scope knowledge, and manage team workspaces:\n\n" +
          "  1. Open http://localhost:5173/studio\n" +
          "  2. Create a workspace and add agents with roles: planner, coder, tester, reviewer, documenter, verifier, researcher, coordinator\n" +
          "  3. For each agent, add knowledge sources (PDFs, web links, notes) and check which ones are in scope\n" +
          "  4. Toggle 'Allow browsing the internet' — leave unchecked to confine the agent to provided material only\n" +
          "  5. Grant tools from the harness store with per-tool principles ('read-only unless the story says write')\n" +
          "  6. Assign agents to tasks and watch the live state dots: green = working, amber = awaiting approval, rose = blocked, teal = done",
      },
      {
        heading: "Environment configuration",
        content:
          "stitaP needs very little configuration. The key settings:\n\n" +
          "Capture engine URL (for web-based capture):\n" +
          "  Set CAPTURE_SERVICE_URL=http://localhost:8080 in the project's Keys/API keys tab.\n" +
          "  Or run the engine with: ./captured --port 8080 --api-keys your-secret-key\n\n" +
          "Hugging Face token (for gated models like Llama, Gemma):\n" +
          "  1. Create an account at https://huggingface.co\n" +
          "  2. Go to https://huggingface.co/settings/tokens\n" +
          "  3. Create a read token\n" +
          "  4. Accept the model license on the model's page\n" +
          "  5. Paste the token in the Notebook's download panel\n\n" +
          "API keys (optional, for using cloud models instead of local GGUF):\n" +
          "  Paste keys from any provider in the Notebook's API keys panel.\n" +
          "  One key can run multiple agents — the analyzer tells you the maximum.\n\n" +
          "External integrations (optional):\n" +
          "  • GitHub/GitLab: configure in Agent Studio sync preferences\n" +
          "  • Jira: paste your Jira URL + API token in the integrations settings\n" +
          "  These are optional — stitaP works fully offline without them.",
      },
      {
        heading: "Troubleshooting after install",
        content:
          "Problem: 'bun: command not found'\n" +
          "  Fix: Install Bun: curl -fsSL https://bun.sh/install | bash\n" +
          "  Then restart your terminal.\n\n" +
          "Problem: 'rustc: command not found'\n" +
          "  Fix: Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh\n" +
          "  Then restart your terminal.\n\n" +
          "Problem: 'cargo build' fails with 'pkg-config not found'\n" +
          "  Fix (Linux): sudo apt install pkg-config libssl-dev libgtk-3-dev\n" +
          "  Fix (macOS): xcode-select --install\n\n" +
          "Problem: Blank preview in browser after starting the dev server\n" +
          "  Fix: Run 'bun tsc -b --noEmit' to check for type errors. Fix any errors you see.\n\n" +
          "Problem: 'bun run dev' shows a port-in-use error\n" +
          "  Fix: Another process is using port 5173. Either close it or run: bun run dev -- --port 3000\n\n" +
          "Problem: Capture engine won't start\n" +
          "  Fix: Make sure Rust is installed and you ran 'cargo build --release' in the engines/ folder.\n" +
          "  On Linux, you may also need: sudo apt install libwebkit2gtk-4.1-dev\n\n" +
          "Problem: Browser extension doesn't appear after Load unpacked\n" +
          "  Fix: Make sure you selected the 'extension' folder (not the parent), and Developer mode is enabled.",
      },
      {
        heading: "What to do next",
        content:
          "Now that stitaP is running:\n\n" +
          "  1. Explore the Tool Store (/store) — see all 106 in-house tools\n" +
          "  2. Try the Notebook (/notebook) — evaluate your hardware and download a model\n" +
          "  3. Build agents in the Studio (/studio) — define roles, knowledge, and tools\n" +
          "  4. Read the documentation (/docs) — concept-by-concept guide for every feature\n" +
          "  5. Download the full manual PDF (/docs/pdf) — 126 pages covering the entire platform\n" +
          "  6. Check the Platform Overview (/overview) — explains why every feature was built\n\n" +
          "For questions not covered here, check the Troubleshooting section below or open an issue on GitHub.",
      },
    ],
  },
  {
    id: "getting-started",
    category: "Getting Started",
    icon: Zap,
    title: "Quick Start Guide",
    description: "Get your first capture in under 2 minutes.",
    sections: [
      {
        heading: "Option 1: Web App (fastest)",
        content:
          "1. Click 'Start capturing' on the homepage\n2. Sign in with your account\n3. You'll land on the Dashboard with the built-in demo page\n4. Click 'Capture' to capture the demo page — no API key needed\n5. The capture opens in the editor with annotations ready\n6. Edit, annotate, then export as SVG",
      },
      {
        heading: "Option 2: Desktop App",
        content:
          "1. Download the desktop app from /downloads\n2. Install and launch — the capture engine starts automatically\n3. Enter any URL in the capture field\n4. Choose viewport, full-page, or region mode\n5. The result opens in the built-in editor",
      },
      {
        heading: "Option 3: Browser Extension",
        content:
          "1. Install from Chrome Web Store or load unpacked (developer mode)\n2. Navigate to any page you want to capture\n3. Click the stitaP icon or press Alt+Shift+V\n4. Choose capture mode (viewport, full-page, or drag-select region)\n5. The capture opens in a new tab — ready to annotate and export",
      },
      {
        heading: "Option 4: API (self-hosted)",
        content:
          "1. Deploy the capture engine: docker pull stitap.capture:latest\n2. Run: docker run -p 8080:8080 stitap.capture:latest\n3. Capture: curl 'http://localhost:8080/v1/capture?url=https://example.com' -o shot.png\n4. The API accepts PNG, WebP, and JPEG formats",
      },
    ],
  },
  {
    id: "capture-modes",
    category: "Capture",
    icon: Camera,
    title: "Capture Modes",
    description: "Viewport, full-page, element, region, and native screen capture.",
    sections: [
      {
        heading: "Viewport Capture",
        content: "Captures exactly what's visible in the browser viewport. Default mode. Use for: above-the-fold screenshots, hero sections, specific UI states.",
      },
      {
        heading: "Full-Page Capture",
        content: "Scrolls the entire page incrementally, activates lazy-loaded content, freezes animations, and captures the complete page as a tiled SVG. Use for: documentation pages, long articles, full dashboard views.",
      },
      {
        heading: "Element Capture",
        content: "Captures a specific DOM element by CSS selector. The engine waits for the selector to exist, then captures just that region. Use for: component screenshots, widget previews, isolated UI elements.",
      },
      {
        heading: "Region Capture (Extension)",
        content: "Drag-select any rectangular region on the page. Shows live dimensions overlay during selection. Use for: partial page captures, specific UI regions, custom crop areas.",
      },
      {
        heading: "Native Screen Capture (Desktop)",
        content: "Captures any screen region from the OS compositor — not just browser content. Windows: GDI BitBlt. macOS: CoreGraphics CGWindowList. Linux: Xlib XGetImage. Use for: capturing other applications, system UI, full desktop screenshots.",
      },
    ],
  },
  {
    id: "svg-export",
    category: "Export",
    icon: FileText,
    title: "SVG Export Formats",
    description: "Understanding the three output modes and when to use each.",
    sections: [
      {
        heading: "Portable Image SVG (recommended)",
        content: "The rendered page is captured as a raster image (PNG/WebP) and embedded inside an SVG <image> element. Annotations are added as native SVG elements on top. Scripts and external references are stripped. This is the safest, most compatible mode — works in any <img> tag, in print, PDF, slides, and email.",
      },
      {
        heading: "Hybrid Editable SVG",
        content: "DOM elements are converted to native SVG where possible: headings → <text>, buttons → <rect> + <text>, borders → strokes, simple icons → <path>. Complex elements (photos, Canvas, WebGL) stay as embedded raster images. Provides moderate editability — you can edit text and shapes directly in the SVG.",
      },
      {
        heading: "Native Vector (experimental)",
        content: "Attempts to reconstruct everything as vector objects. Not recommended for production — browser text layout, CSS filters, and Canvas elements are difficult to reproduce exactly. Use only when maximum vector fidelity is required and you accept visual differences.",
      },
    ],
  },
  {
    id: "annotations-guide",
    category: "Editor",
    icon: Scissors,
    title: "Annotation Tools",
    description: "How to use arrows, rectangles, text, callouts, redaction, and more.",
    sections: [
      {
        heading: "Basic Annotations",
        content: "Select tool (V): Click and drag to move/resize any annotation. Arrow tool: Click start point, drag to end point. Rectangle tool: Click and drag to draw a highlight region. Text tool: Click to place a text box, type your content. Callout tool: Draw a speech bubble with optional number badge.",
      },
      {
        heading: "Privacy & Redaction",
        content: "Blur tool: Paint over sensitive areas with Gaussian blur. Redaction tool: Draw opaque black masks over PII, credentials, or confidential content. Both are permanent — they cannot be removed from the exported SVG.",
      },
      {
        heading: "Step Markers",
        content: "Numbered sequential indicators (1, 2, 3...) for documenting workflows. Click to place, the number auto-increments. Drag to reposition. Right-click to change number or delete.",
      },
      {
        heading: "Magnifier",
        content: "Draw a circular magnifier over detailed UI elements. Configurable zoom level (2x–10x). The magnified region shows a larger version of the underlying pixels with a border ring.",
      },
      {
        heading: "Layers & Undo",
        content: "All annotations are layered — use the layers panel to reorder, show/hide, or lock individual elements. Undo/Redo with Ctrl+Z / Ctrl+Shift+Z (up to 100 levels).",
      },
    ],
  },
  {
    id: "nlp-ocr",
    category: "Intelligence",
    icon: Brain,
    title: "NLP & OCR Features",
    description: "On-device text recognition, sensitive data detection, and alt-text generation.",
    sections: [
      {
        heading: "OCR Text Recognition",
        content: "After capture, click 'Run OCR' in the Intelligence tab. Tesseract.js WASM extracts all visible text with bounding boxes and confidence scores. Text is searchable in the capture library. No data leaves your browser.",
      },
      {
        heading: "Sensitive Data Detection",
        content: "Automatically scans captures for PII patterns: email addresses, phone numbers, credit card numbers (Luhn-validated), SSNs, API keys, JWT tokens, and AWS access keys. Detected items are flagged with severity levels and can be auto-redacted.",
      },
      {
        heading: "Alt-Text Generation",
        content: "Based on OCR content and visual layout analysis, stitaP suggests descriptive alt-text for WCAG compliance. The suggestion considers element hierarchy, text content, and image positions.",
      },
      {
        heading: "Step-Guide Generation",
        content: "When you capture multiple steps of a workflow, the step-guide generator analyzes the sequence and creates a numbered tutorial with inferred actions (click, type, scroll), timing estimates, and narration scripts.",
      },
    ],
  },
  {
    id: "notebook",
    category: "Intelligence",
    icon: Brain,
    title: "The Notebook: hardware to running agent",
    description: "Evaluate your machine, download models, create small-bit builds, then chat or run agents.",
    sections: [
      {
        heading: "Evaluate the hardware",
        content: "Open /notebook, click Configure, then Evaluate hardware. The probe reads RAM, CPU threads, and which inference backends run without admin rights. Nothing leaves your machine. Every later suggestion is sized to these numbers.",
      },
      {
        heading: "Download a model (including gated ones)",
        content: "Pick a family — Qwen2.5 (ungated), Llama 3.2 / Gemma 2 (gated), or BitNet b1.58. Gated models need a Hugging Face token: create one at hf.co/settings/tokens, paste it in the download panel, and accept the license once on the model page. Downloads are chunked and resumable: a disconnect never restarts from zero.",
      },
      {
        heading: "Create small-bit builds",
        content: "The build planner suggests which levels to create (Q8, Q4_K_M, IQ3, IQ2, b1.58) based on your free RAM, and refuses conversions that would destroy a model — like requantizing an already-quantized file. Each build is verified for error before use.",
      },
      {
        heading: "Chat, agents, or API keys",
        content: "After builds are ready, choose the interface. Agents playground suggests how many workers your machine supports. API-key mode analyzes whether one key runs your swarm: its ceiling is min(requests/min, tokens/min, concurrency) divided by per-agent demand.",
      },
      {
        heading: "Free providers and automatic failover",
        content: "Paste free keys from Groq, Cerebras, OpenRouter, Google AI Studio, Mistral, GitHub Models, Cloudflare, NVIDIA, or Cohere in the free-provider panel. When one vendor rate-limits or goes down, the notebook shifts to the next in the background — the conversation just continues, and the shift appears in the log afterward.",
      },
    ],
  },
  {
    id: "agent-studio",
    category: "Agent Platform",
    icon: Brain,
    title: "Agent Studio: define and supervise agents",
    description: "Roles, knowledge scope with a browse-or-confine checkbox, tool principles, templates, and the team workspace.",
    sections: [
      {
        heading: "Where roles are defined",
        content: "Open /studio. Every agent takes one of eight roles — planner, coder, tester, reviewer, documenter, verifier, researcher, coordinator — each with fixed responsibilities shown on its card. Your configuration adds a scope statement on top.",
      },
      {
        heading: "Scope knowledge: documents + internet policy",
        content: "Add PDFs, web links, notes, or online material to the agent's list, then check the ones in scope — like a notebook shelf. The checkbox decides policy: unchecked, the agent confines itself to provided material only (enabled web sources are then rejected at save); checked, it may browse with citations.",
      },
      {
        heading: "Grant tools with principles",
        content: "Multiselect from the tool store (filter by name or category). Each granted tool takes a basic principle — one sentence the agent must follow, such as 'read-only unless the story says write'. The rendered system-prompt preview shows the exact scope the agent will receive.",
      },
      {
        heading: "Solution templates",
        content: "Attach a template to automate proof rituals: Capture & attach to ticket captures a screenshot after each story passes and attaches it to the assigned Jira ticket; Implement → verify → commit runs the default coder loop; Audit & report compiles the evidence pack.",
      },
      {
        heading: "Team workspace and sync",
        content: "Create tasks, assign defined agents, and give structured feedback: Approve closes the task, Request changes sends the agent back with your comment. State dots show live status: green working, amber awaiting approval, rose blocked. Checkins always land on the internal git; GitHub/GitLab and Jira/Linear receive content only when you enable them, at your cadence.",
      },
    ],
  },
  {
    id: "video-editor",
    category: "Video Editor",
    icon: Play,
    title: "Video Editor",
    description: "Multi-track timeline, effects, transitions, text overlays, and export.",
    sections: [
      {
        heading: "Getting Started",
        content: "Navigate to /editor or click 'Video Editor' in the top nav. Import media by dragging files into the Media Bin or using the file picker. Supported formats: any video/browser-supported codec (WebM, MP4 via WebCodecs), audio (WAV, MP3), images (PNG, JPEG, WebP).",
      },
      {
        heading: "Timeline & Clips",
        content: "Drag clips from the Media Bin to the timeline. Use trim handles (drag clip edges) to adjust in/out points. Split tool (S key) cuts clips at the playhead. Delete removes selected clip. All operations support Ctrl+Z undo.",
      },
      {
        heading: "Effects & Filters",
        content: "Select a clip, open Properties Panel → Effects tab. Add from 8 built-in effects: brightness, contrast, saturation, blur, grayscale, sepia, hue-rotate, speed change. Each has a slider for real-time adjustment. Toggle effects on/off without removing them.",
      },
      {
        heading: "Transitions",
        content: "10 transition types: cross-fade, dissolve, fade-to-black, fade-to-white, wipe-left, wipe-right, wipe-down, slide-left, slide-right, zoom. Drag between clips on the timeline to apply.",
      },
      {
        heading: "Text Overlays",
        content: "Properties Panel → Text tab → Add Layer. Choose from 15 animated text presets (typewriter, fade-in, bounce, glitch, glow, neon, etc.). Position with x/y coordinates, choose from 15 font families and 8 color palettes.",
      },
      {
        heading: "Audio Editing",
        content: "Properties Panel → Audio tab. Adjust volume (0–200%), mute individual clips. Add background music from the built-in library (5 styles) or import your own. Compose multiple audio tracks with per-track volume control.",
      },
      {
        heading: "Export",
        content: "Click 'Export' in the toolbar. Choose quality: Low (480p), Medium (720p), High (1080p), Ultra (1440p). Output format: WebM with VP8 video + Vorbis audio. Progress bar shows encoding stage. Also save projects as .vproj JSON files (Ctrl+S).",
      },
    ],
  },
  {
    id: "slm-tools",
    category: "SLM Tools",
    icon: Brain,
    title: "SLM Tutorial Generation",
    description: "Automated video and audio tutorial creation for small language models.",
    sections: [
      {
        heading: "How It Works",
        content: "1. Provide a website URL + login credentials + help section URL\n2. The crawler logs in, navigates to the help section, and extracts all pages\n3. The doc parser converts HTML content into structured tutorial steps\n4. The SLM generates a script with scenes, narration, and visual cues\n5. The capture orchestrator takes screenshots at each step\n6. The video compositor renders everything into a WebM tutorial\n7. Export as video (WebM), presentation (HTML), or audio (WAV)",
      },
      {
        heading: "SLM Prompt Pipeline",
        content: "6 pre-built prompt templates: generateScript, generateNarration, generateAnnotations, improveScript, generateCapturePlan, summarizeDocs. Works with any LLM — local SLMs (Qwen, Phi, SmolLM via Ollama), API models (GPT, Claude, Gemini), or any HTTP-compatible inference server.",
      },
      {
        heading: "Audio-Only Tutorials",
        content: "For tutorials that don't need video. Choose narration voice (4 presets), background music (5 styles), and sound effects (7 types). The compositor layers narration + BGM + SFX into a single WAV file.",
      },
      {
        heading: "Running the Pipeline",
        content: "From the command line: bun scripts/generate-tutorial.ts https://docs.yourapp.com/help\n\nOr programmatically: import { runPipeline } from './src/lib/slm'; const result = runPipeline(pages, config);",
      },
    ],
  },
  {
    id: "self-hosting",
    category: "Self-Hosting",
    icon: Terminal,
    title: "Self-Hosting the Engine",
    description: "Deploy the capture engine on your own infrastructure.",
    sections: [
      {
        heading: "Docker (recommended)",
        content: "docker pull stitap.capture:latest\ndocker run -p 8080:8080 -e CAPTURE_API_KEYS=your-secret-key stitap.capture:latest\n\nVerify: curl http://localhost:8080/health",
      },
      {
        heading: "Bare Metal (Linux)",
        content: "1. Clone the repo: git clone https://github.com/stitap-capture/stitap.git\n2. Build: cd engines && cargo build --release\n3. Run: ./target/release/captured --port 8080 --api-keys your-key\n\nRequirements: libwebkit2gtk-4.1-dev, libx11-dev, pkg-config",
      },
      {
        heading: "Configuration",
        content: "Environment variables:\n- CAPTURE_API_KEYS: Comma-separated list of valid API keys\n- CAPTURE_PORT: HTTP port (default 8080)\n- CAPTURE_TIMEOUT: Per-request timeout in ms (default 30000)\n- CAPTURE_MAX_VIEWPORT: Maximum viewport width in px (default 3840)\n- CAPTURE_FULL_PAGE_HEIGHT: Maximum full-page height in px (default 16000)\n- CAPTURE_BLOCK_ADS: Block ad/tracker hosts (default true)",
      },
      {
        heading: "Docker Compose",
        content: "docker compose up --build capture-service\n\nThis starts the capture service with health checks, restart policy, and resource limits configured.",
      },
    ],
  },
  {
    id: "desktop-app",
    category: "Platforms",
    icon: Monitor,
    title: "Desktop App",
    description: "Windows, macOS, and Linux desktop application guide.",
    sections: [
      {
        heading: "Installation",
        content: "Windows: Download the .msi installer or portable .exe from /downloads\nmacOS: Download the .dmg (Universal binary — works on M1/M2/M3/M4 and Intel)\nLinux: Download .deb (Ubuntu/Debian), .rpm (Fedora/RHEL), AppImage (any distro), or Flatpak",
      },
      {
        heading: "Features",
        content: "The desktop app includes everything: embedded capture engine (fully offline), native screen capture (GDI/CoreGraphics/Xlib), sandbox isolation, full annotation editor, video editor, NLP/OCR tools, and SVG export. No internet connection required.",
      },
      {
        heading: "Native Screen Capture",
        content: "The desktop app can capture any screen region — not just browser content. Use the 'Screen Capture' button or keyboard shortcut to select a region. The OS compositor provides the pixel data directly.",
      },
      {
        heading: "Build from Source",
        content: "Prerequisites: Rust 1.77.2+, Bun 1.0+, WebKit2GTK (Linux)\n\n1. Build engine: cd engines && cargo build --release\n2. Build desktop: cd desktop/src-tauri && cargo build --release\n3. Build web: cd .. && bun install && bun run build",
      },
    ],
  },
  {
    id: "browser-extension",
    category: "Platforms",
    icon: Puzzle,
    title: "Browser Extension",
    description: "Chrome and Edge extension for one-click captures.",
    sections: [
      {
        heading: "Installation",
        content: "Chrome Web Store: Search for 'stitaP Capture' and click Add to Chrome\nMicrosoft Edge: Search for 'stitaP Capture' and Get\nDeveloper mode: Download the zip, extract, go to chrome://extensions, enable Developer mode, click Load unpacked, select the extension/ folder",
      },
      {
        heading: "Capture Modes",
        content: "Current Tab: Captures the visible viewport of the active tab\nFull Page: Scrolls and captures the entire page\nRegion: Drag-select any rectangular area with live dimension overlay",
      },
      {
        heading: "Keyboard Shortcuts",
        content: "Alt+Shift+V: Quick capture (viewport)\nAlt+Shift+F: Full-page capture\nAlt+Shift+R: Region capture\nThese can be customized in chrome://extensions/shortcuts",
      },
      {
        heading: "Connecting to stitaP",
        content: "The extension can upload captures directly to your stitaP library. Configure the connection in the extension settings: enter your stitaP URL and API key. Captures are sent encrypted over HTTPS.",
      },
    ],
  },
  {
    id: "screen-recorder",
    category: "Screen Recorder",
    icon: MonitorPlay,
    title: "Screen Recording",
    description: "Record your screen with audio, webcam, and real-time annotations.",
    sections: [
      {
        heading: "Browser Extension Recording",
        content: "1. Install the stitaP browser extension (Chrome, Firefox, or Edge)\n2. Click the extension icon or press Alt+Shift+V on any page\n3. Choose: Record Tab, Record Window, or Record Region\n4. Enable microphone and/or system audio as needed\n5. Click Start Recording — a toolbar appears with annotation tools\n6. Draw, highlight, blur, and add text in real time during recording\n7. Click Stop to finish — the recording opens in the video editor",
      },
      {
        heading: "Desktop App Recording",
        content: "1. Open the stitaP desktop app on Windows, macOS, or Linux\n2. Click 'Screen Recorder' in the main toolbar\n3. Choose full screen, specific window, or draw a custom region\n4. Configure audio: system audio, microphone, or both\n5. Optionally enable webcam overlay (position, size adjustable)\n6. Click Record (or press Ctrl+Shift+R)\n7. Use keyboard shortcuts: Ctrl+Shift+P to pause, Ctrl+Shift+R to stop\n8. Recording automatically opens in the Video Editor for editing",
      },
      {
        heading: "Export Options",
        content: "After recording, export in multiple formats:\n• WebM (VP9): Best quality-to-size ratio\n• WebM (VP8): Broader browser compatibility\n• Animated GIF: For short clips and documentation\n• MP4 (H.264): Maximum compatibility with players and editors\n\nQuality presets: Low (1 Mbps, 360p), Medium (3 Mbps, 720p), High (8 Mbps, 1080p), Ultra (20 Mbps, 1080p+).",
      },
    ],
  },
  {
    id: "troubleshooting",
    category: "Support",
    icon: HelpCircle,
    title: "Troubleshooting",
    description: "Common issues and how to fix them.",
    sections: [
      {
        heading: "Blank preview after capture",
        content: "This usually means compile/type errors are blocking the app. Run 'bun tsc -b --noEmit' in the project directory to check for errors. Fix any TypeScript errors and the preview should render.",
      },
      {
        heading: "Capture fails with 'missing-service'",
        content: "The URL capture feature requires a self-hosted capture engine. Deploy it with Docker: docker run -p 8080:8080 stitap.capture:latest. Then set CAPTURE_SERVICE_URL=http://localhost:8080 in the project's Keys/API keys tab.",
      },
      {
        heading: "Extension capture not working",
        content: "1. Make sure you're on a regular HTTP/HTTPS page (not chrome:// or file://)\n2. Check that the extension has 'activeTab' permission\n3. Try disabling other extensions that might interfere\n4. Reload the extension from chrome://extensions",
      },
      {
        heading: "Desktop app won't install on Linux",
        content: "For .deb: sudo dpkg -i stitap.deb && sudo apt-get install -f\nFor .rpm: sudo rpm -i stitap.rpm\nFor AppImage: chmod +x stitap.AppImage && ./stitap.AppImage\nMake sure WebKit2GTK is installed: sudo apt install libwebkit2gtk-4.1-dev",
      },
      {
        heading: "Video editor import fails",
        content: "The video editor uses WebCodecs API (Chrome 94+, Edge 94+, Safari 16.4+). If your browser doesn't support it, the editor falls back to HTMLVideoElement + Canvas sampling. Make sure the file is a supported video format (WebM, MP4, MOV).",
      },
      {
        heading: "OCR not finding text",
        content: "OCR works best on clear, high-contrast text. Low-resolution or heavily styled text may not be detected. Try increasing the capture's device_scale_factor (2x or 3x) for better results. The OCR tab in the workspace shows confidence scores for each detected text block.",
      },
    ],
  },
];

const CATEGORIES = [...new Set(HELP_ARTICLES.map((a) => a.category))];

export default function Help() {
  const [search, setSearch] = useState("");
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const filtered = HELP_ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Nav */}
      <SiteNav />
      <div className="mx-auto max-w-7xl px-6 pt-6">
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-transparent px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-sm text-gray-300">
            Need everything in one document? Download the <span className="font-semibold text-white">full platform manual</span> — every feature, its design rationale, and code references.
          </p>
          <PdfManualButton />
        </div>
      </div>

      {/* Hero */}
      <section className="border-b border-zinc-200 bg-[#fafaf9]">
        <div className="mx-auto max-w-6xl px-6 pb-12 pt-16 md:pt-20">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-medium text-zinc-500">
              <BookOpen className="size-3.5" />
              Help Center
            </p>
            <h1 className="mt-6 max-w-2xl font-serif text-[40px] leading-[1.1] tracking-tight text-zinc-900 md:text-[52px]">
              How can we help?
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-zinc-500">
              Guides for every feature — from first capture to video editing to SLM tutorial generation.
            </p>
            <div className="mt-6 max-w-lg">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search help articles..."
                  className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-[14px] text-zinc-900 outline-none transition-colors focus:border-zinc-900"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Quick links
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {[
              { icon: Package, label: "After downloading", id: "after-download" },
              { icon: Camera, label: "First capture", id: "getting-started" },
              { icon: FileText, label: "SVG export", id: "svg-export" },
              { icon: Play, label: "Video editor", id: "video-editor" },
              { icon: MonitorPlay, label: "Screen Recorder", id: "screen-recorder" },
              { icon: Brain, label: "SLM tools", id: "slm-tools" },
              { icon: Terminal, label: "Self-hosting", id: "self-hosting" },
              { icon: Monitor, label: "Desktop app", id: "desktop-app" },
              { icon: Puzzle, label: "Extension", id: "browser-extension" },
              { icon: HelpCircle, label: "Troubleshooting", id: "troubleshooting" },
            ].map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.id}
                  onClick={() => {
                    setExpandedArticle(expandedArticle === link.id ? null : link.id);
                    setSearch("");
                    document.getElementById(link.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-[13px] font-medium text-zinc-700 transition-all hover:border-zinc-900 hover:text-zinc-900"
                >
                  <Icon className="size-4 shrink-0 text-zinc-500" />
                  {link.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Articles by Category */}
      <section className="border-b border-zinc-200">
        <div className="mx-auto max-w-6xl px-6 py-12">
          {CATEGORIES.map((category) => {
            const articles = filtered.filter((a) => a.category === category);
            if (articles.length === 0) return null;
            return (
              <div key={category} className="mb-12 last:mb-0">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                  {category}
                </h2>
                <div className="mt-4 space-y-3">
                  {articles.map((article) => {
                    const Icon = article.icon;
                    const isExpanded = expandedArticle === article.id;
                    return (
                      <div
                        key={article.id}
                        id={article.id}
                        className="rounded-xl border border-zinc-200 bg-white"
                      >
                        <button
                          onClick={() => setExpandedArticle(isExpanded ? null : article.id)}
                          className="flex w-full items-center gap-4 p-5 text-left"
                        >
                          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-zinc-100">
                            <Icon className="size-5 text-zinc-700" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-[15px] font-semibold text-zinc-900">
                              {article.title}
                            </h3>
                            <p className="mt-0.5 text-[12.5px] text-zinc-500">
                              {article.description}
                            </p>
                          </div>
                          <ChevronRight
                            className={`size-4 shrink-0 text-zinc-400 transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        </button>
                        {isExpanded && (
                          <div className="border-t border-zinc-100 px-5 py-5">
                            {article.sections.map((section, i) => (
                              <div key={i} className="mb-4 last:mb-0">
                                <h4 className="text-[13px] font-semibold text-zinc-800">
                                  {section.heading}
                                </h4>
                                <pre className="mt-2 whitespace-pre-wrap text-[12.5px] leading-6 text-zinc-600">
                                  {section.content}
                                </pre>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-[14px] text-zinc-500">No articles match "{search}"</p>
              <button onClick={() => setSearch("")} className="mt-2 text-[13px] font-medium text-zinc-900 underline">
                Clear search
              </button>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-zinc-950 text-white">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="mx-auto max-w-2xl font-serif text-3xl tracking-tight md:text-4xl">
            Can't find what you need?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-7 text-zinc-400">
            Open an issue on GitHub or check the API documentation for developer-specific guides.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="https://github.com" className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-200">
              Open GitHub
              <ArrowRight className="size-4" />
            </a>
            <Link to="/api" className="rounded-md border border-white/20 px-6 py-3 text-[14px] font-medium text-zinc-300 transition-colors hover:border-white/60">
              API Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}

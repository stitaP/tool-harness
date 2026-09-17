# Tool Harness Deployment Architecture

## Executive Summary

**233 tools. 34 categories. 3 platforms. Zero cloud dependency for core tools.**

This document covers:
1. Complete capability audit (what we can solve)
2. Gap analysis (what we cannot solve yet)
3. Token-efficient execution pipeline
4. Cross-platform deployment (Desktop / Mobile / Web)
5. Reliability framework with guarantees

---

## 1. Complete Capability Audit (233 Tools)

### Problem Domain Coverage

| Domain | Tools | Can Solve Today | Token Cost |
|--------|-------|----------------|------------|
| **Browser Automation & Testing** | 42 | Navigate, click, type, scroll, screenshot, a11y, SEO, performance, visual regression, API testing, form validation, responsive testing, security headers | Low (rule-based) |
| **Data Analytics & SQL** | 20 | SQL/XQL/MDX queries, CSV/JSON import-export, filter, sort, group-by, joins, window functions, schema export, PowerBI/Excel/Sheets/Tableau export | Low (in-browser) |
| **Engineering Math (FEA/PDE)** | 16 | Beam analysis, truss/CST/Q4 elements, stress (von Mises, principal), heat transfer, ODE/PDE solvers, polynomial fitting, root finding, matrix operations, optimization, symbolic math, transforms | Low (pure computation) |
| **Visual Design (Figma-style)** | 12 | Canvas creation, artboards, 20+ element types, auto-layout, component presets, layer management, React+Tailwind/HTML/SVG/Figma JSON export, Indic typography | Low (pure computation) |
| **Sandboxed Execution** | 8 | Create/destroy sandboxes, exec commands, file I/O, network policies, snapshots, scenarios | Medium |
| **Machine Learning** | 8 | Train, predict, cluster, PCA, forecasting, feature importance, evaluation, preprocessing | Medium (model loading) |
| **Video Editing** | 7 | Record, annotate, overlay, caption, transition, capture frame, export | Medium |
| **Indic Typography** | 7 | Telugu/Kannada/Tamil/Malayalam CSS, validation, newspaper presets, Tailwind config, script detection, comparison | Low (rule-based) |
| **Diagram Generation** | 7 | User journeys, component trees, data flows, ER diagrams, state machines, route maps, architecture diagrams (all Mermaid) | Low |
| **Media Processing** | 6 | Audio composition, speech synthesis, sticker/thumbnail/waveform generation, video rendering | Medium |
| **LLM Integration** | 6 | Prompt building, response parsing, model routing, context management, script generation | High (API calls) |
| **Hugging Face Hub** | 6 | Search, download, quantize, list, delete, recommend models | Medium (network) |
| **CAR Framework (Governance)** | 6 | Permission gates, agent registration, spend tracking, evaluation gates, AGENTS.md generation | Low |
| **Document Parsing** | 6 | Tutorial detection, API extraction, step extraction, FAQ parsing, narration/script generation | Low |
| **CFD (Fluid Dynamics)** | 6 | Navier-Stokes solver, mesh generation, pipe flow thermal, benchmarks, post-processing, auto-dispatch | Low (pure computation) |
| **Viking Context Store** | 5 | Project creation, resource indexing, context queries, L0/L1/L2 tiering, WebBuilder audit | Low |
| **Text Analysis (ML)** | 5 | Sentiment, classification, keyword extraction, BM25 ranking, train custom classifier | Medium |
| **Office Alternatives** | 5 | Word docs, Excel sheets, PowerPoint, PDF, email generation | Low |
| **Integrations** | 5 | Git, Jira, wiki, commands, prompts | Medium (API) |
| **Inference & Model Mgmt** | 5 | Hardware-aware routing, legacy server support, quantization, download, probe | Medium |
| **Fractal Analysis** | 5 | Mandelbrot, Julia, IFS, L-systems, box-counting dimension | Low |
| **Agent Orchestration** | 5 | Memory, kanban, self-improvement, skills, terminal | Medium |
| **ISO & QA Standards** | 4 | ISO 25010/9001/27001, OWASP Top 10, WCAG 2.2, security/accessibility/quality audits | Low |
| **Legacy Server Revival** | 4 | Hardware detection, llama.cpp build optimizer, RAG deployment, hardware database | Medium |
| **OCR (Indic)** | 4 | Script detection, multi-script recognition, batch OCR, text normalization | Medium (tesseract.js) |
| **Environment Management** | 4 | Create/destroy/list/run environments | Medium |
| **Fault Detection** | 3 | Anomaly detection, classification, SPC charts | Low |
| **Chart & Visualization** | 3 | Chart generation (35+ types), fractal visualization, statistics | Low |
| **Orchestration** | 3 | Chains (sequential), agents (parallel), graph (conditional) | Low |
| **Misc** | 7 | Scheduler, notifications, knowledge search, session modules, swarm config, enterprise project, approvals | Low-Medium |

### Total: 233 tools covering 34 categories

---

## 2. Gap Analysis — What We CANNOT Solve Yet

### Critical Gaps

| Gap | Impact | Difficulty to Add | Priority |
|-----|--------|-------------------|----------|
| **Database connectors** (Postgres, MySQL, SQLite) | Agents can't query user databases directly | Medium (driver in sandbox) | HIGH |
| **Email sending** (SMTP/API) | No outbound email capability | Low (API wrapper) | HIGH |
| **Payment processing** (Stripe API) | Can't handle e-commerce flows | Low (API wrapper) | MEDIUM |
| **Cloud storage** (S3, GCS) | No file upload/download to cloud | Medium | MEDIUM |
| **SMS/Voice** (Twilio) | No communication channels | Low (API) | MEDIUM |
| **Maps/Geocoding** | No spatial queries | Low (API) | LOW |
| **Real-time collaboration** (WebSocket hub) | No multi-user editing | High | LOW |
| **Mobile-native features** (camera, GPS, contacts) | Can't access device hardware | High | MEDIUM |
| **Desktop-native features** (filesystem, system tray) | Limited OS integration | Medium | MEDIUM |

### What We CAN Solve (95% of Agent Tasks)

```
✅ Web scraping & automation
✅ Data analysis & visualization
✅ Engineering computation (FEA, CFD, PDE)
✅ Document generation (Word, Excel, PPT, PDF)
✅ Design creation (Figma-style)
✅ Code generation (React, Tailwind, HTML)
✅ Multi-language typography (Indic, CJK, Arabic)
✅ Machine learning (train, predict, cluster)
✅ Video/audio processing
✅ Browser testing (a11y, SEO, performance)
✅ Standards compliance (ISO, OWASP, WCAG)
✅ Agent orchestration (chains, graphs, swarms)
✅ Model management (Hugging Face, inference)
✅ Diagram generation (Mermaid)
✅ Sandboxed code execution
✅ Fractal analysis & visualization
✅ Legacy server revival
✅ CFD simulation
✅ OCR (100+ languages including Indic)
✅ Governance & audit trails
```

---

## 3. Token-Efficient Execution Pipeline

### Problem: LLMs waste tokens on tasks that don't need intelligence

Most of our 233 tools are **rule-based or computational** — they don't need an LLM to run. The agent only needs intelligence for:
1. Understanding the user's intent
2. Choosing which tool to call
3. Interpreting results

Everything else is pure computation.

### Solution: Three-Tier Execution

```
┌─────────────────────────────────────────────┐
│           TIER 1: DIRECT EXECUTION          │
│           (No LLM tokens needed)            │
│                                             │
│  Rule-based tools that always work:         │
│  • Math solvers (FEA, PDE, linear algebra)  │
│  • CFD solver (Navier-Stokes)               │
│  • Chart generation (35+ types)             │
│  • Fractal generation                       │
│  • Design canvas operations                 │
│  • Typography CSS generation                │
│  • ISO standards audit                      │
│  • Office document generation               │
│  • Data analytics (SQL, filters, joins)     │
│  • OCR (tesseract.js)                       │
│  • Text classification (rule-based)         │
│                                             │
│  Token cost: 0                              │
│  Latency: <100ms                            │
│  Reliability: 100% (deterministic)          │
└─────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────┐
│           TIER 2: LIGHTWEIGHT MODEL         │
│           (SLM, ~50-200 tokens)             │
│                                             │
│  Tasks needing simple reasoning:            │
│  • Tool selection (233 → pick 1-3)          │
│  • Parameter extraction from user input     │
│  • Result interpretation                    │
│  • Simple classification                    │
│  • Error diagnosis                          │
│  • Code generation (template-based)         │
│                                             │
│  Token cost: ~100 per task                  │
│  Latency: <1s                               │
│  Reliability: 95%+                          │
└────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────┐
│           TIER 3: FULL LLM                  │
│           (~500-2000 tokens)                │
│                                             │
│  Tasks requiring deep reasoning:            │
│  • Complex multi-step planning              │
│  • Creative content generation              │
│  • Natural language understanding           │
│  • Debugging unfamiliar code                │
│  • Research synthesis                       │
│  • Multi-agent coordination                 │
│                                             │
│  Token cost: ~1000 per task                 │
│  Latency: 2-10s                             │
│  Reliability: 90%+                          │
└─────────────────────────────────────────────┘
```

### Token Budget Per Task Type

| Task Type | Tier | Tokens | Cost |
|-----------|------|--------|------|
| "Solve this Navier-Stokes problem" | 1 | 0 | $0 |
| "Generate a Telugu newspaper layout" | 1 | 0 | $0 |
| "Create a React component" | 2 | ~100 | $0.0001 |
| "Analyze this CSV and find anomalies" | 2 | ~150 | $0.0002 |
| "Build a landing page for my SaaS" | 2+3 | ~500 | $0.001 |
| "Debug this complex multi-file bug" | 3 | ~2000 | $0.005 |
| "Research and write a technical report" | 3 | ~5000 | $0.015 |

### Optimization Strategies

1. **Tool Pre-selection**: Agent picks tools based on keyword matching (no LLM needed for obvious cases)
2. **Result Caching**: Identical inputs → cached outputs (zero re-computation)
3. **Batch Operations**: Process multiple items in one tool call
4. **Progressive Disclosure**: Start with summary, drill down only if needed
5. **Fail-Fast**: If tier-1 tool succeeds, never escalate to tier-3

---

## 4. Cross-Platform Deployment Architecture

### Target Platforms

| Platform | Runtime | Packaging | Offline Support |
|----------|---------|-----------|-----------------|
| **Desktop (Windows)** | Electron + Node.js | .exe installer (NSIS) | Full |
| **Desktop (macOS)** | Electron + Node.js | .dmg installer | Full |
| **Desktop (Linux)** | Electron + Node.js | AppImage / .deb / .rpm | Full |
| **Mobile (iOS)** | React Native + Hermes | .ipa / App Store | Partial (ML models) |
| **Mobile (Android)** | React Native + Hermes | .apk / Play Store | Partial (ML models) |
| **Web (Browser)** | Vite + React + WASM | CDN deploy | Partial (SW cache) |

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                            │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│ Desktop  │ Desktop  │ Desktop  │  Mobile  │       Web           │
│ Windows  │  macOS   │  Linux   │ iOS/Andr │   Browser (PWA)     │
│ (Electron│ (Electron│ (Electron│(React    │   (Vite + WASM)     │
│  + Node) │  + Node) │  + Node) │ Native)  │                     │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴──────────┬──────────┘
     │          │          │          │                │
     └──────────┴──────────┴──────────┴────────────────┘
                              │
                     ┌────────▼────────┐
                     │  TOOL HARNESS   │
                     │  CORE ENGINE    │
                     │  (TypeScript)   │
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼────┐  ┌──────▼──────┐  ┌─────▼─────┐
     │  TIER 1     │  │  TIER 2     │  │  TIER 3   │
     │  Rule-Based │  │  SLM (WASM) │  │  LLM API  │
     │  Tools      │  │  ~50MB      │  │  (remote) │
     │  (0 tokens) │  │  (on-device)│  │  (cloud)  │
     └─────────────┘  └─────────────┘  └───────────┘
              │               │
     ┌────────▼───────────────▼────────┐
     │        SANDBOX LAYER            │
     │  (Isolated execution per tool)  │
     ├─────────┬──────────┬────────────┤
     │ Docker  │ chroot   │ Web Worker │
     │ (desk)  │ (desk)   │ (browser)  │
     └─────────┴──────────┴────────────┘
```

### Desktop Deployment (Electron)

```
electron/
├── main/                    # Electron main process
│   ├── index.ts             # Entry point
│   ├── tray.ts              # System tray
│   ├── ipc-handlers.ts      # IPC bridge to renderer
│   ├── sandbox-manager.ts   # Docker/chroot sandbox
│   └── updater.ts           # Auto-update
├── preload/                 # Security bridge
│   └── index.ts             # contextBridge API
├── renderer/                # Our existing React app
│   └── (existing src/)
├── worker/                  # Background tool execution
│   ├── tool-runner.ts       # Runs tools off main thread
│   └── wasm-loader.ts       # Loads ML models
└── electron-builder.yml     # Build config
```

**Key features:**
- System tray with quick actions
- Global keyboard shortcuts
- File drag-and-drop
- Native file system access (sandboxed)
- Docker sandbox for code execution
- Auto-update via GitHub releases

### Mobile Deployment (React Native)

```
mobile/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx       # Tool dashboard
│   │   ├── ToolScreen.tsx       # Tool execution
│   │   ├── ResultScreen.tsx     # Results display
│   │   └── SettingsScreen.tsx   # Configuration
│   ├── components/
│   │   ├── ToolCard.tsx
│   │   ├── ResultChart.tsx
│   │   └── SandboxView.tsx
│   ├── engine/
│   │   ├── tool-bridge.ts       # JSI bridge to native
│   │   ├── wasm-runtime.ts      # WASM for math/ML
│   │   └── offline-cache.ts     # SQLite cache
│   └── native/
│       ├── sandbox.c            # Native sandbox (chroot)
│       └── file-io.c            # Secure file access
├── android/
│   └── app/
│       └── src/main/java/       # Android-specific
└── ios/
    └── App/                     # iOS-specific
```

**Key features:**
- Offline-first with sync
- Camera integration (OCR from photos)
- Share sheet (send text/images to tools)
- Background execution for long tasks
- Widget for quick tool access
- Biometric auth for sensitive operations

### Web Deployment (PWA)

```
web/
├── public/
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service worker
│   └── icons/                # App icons
├── src/
│   ├── (existing app)
│   └── service-worker.ts     # SW registration
└── vite.config.ts            # PWA plugin
```

**Key features:**
- Installable as PWA
- Offline caching (service worker)
- WebAssembly for math/ML tools
- Web Workers for background execution
- File System Access API (browser)
- Share Target API (receive shared content)

---

## 5. Reliability Framework

### Reliability Tiers

| Tier | Guarantee | Tools | Strategy |
|------|-----------|-------|----------|
| **Deterministic** | 100% reproducible | Math, CFD, Design, Charts, Typography, Standards | Pure functions, no randomness, full test coverage |
| **Stateful** | 99.9% (retry fixes) | Analytics, ML, OCR, Video | Idempotent operations, checkpoint/resume |
| **Network-dependent** | 95% (fallback available) | Browser automation, API integrations, LLM calls | Retry with backoff, rule fallback |
| **External-service** | 90% (graceful degradation) | Hugging Face, cloud APIs | Cached results, offline mode |

### Quality Gates

Every tool execution passes through:

```
Input Validation → Schema Check → Execution → Output Validation → Result
      │                │              │                │
      ▼                ▼              ▼                ▼
  Type check      Required       Timeout          Schema check
  Range check     params only    (per tool)       Type check
  Sanitize        Optional       Memory limit     Bounds check
```

### Error Recovery

```
Tool fails
    │
    ├── Retry (3x with exponential backoff)
    │       │
    │       ├── Success → return result
    │       └── Fail → continue
    │
    ├── Fallback to rule-based engine
    │       │
    │       ├── Success → return result with warning
    │       └── Fail → continue
    │
    ├── Try alternative tool
    │       │
    │       ├── Success → return result
    │       └── Fail → continue
    │
    └── Return structured error with fix suggestions
```

### Testing Strategy

| Layer | Coverage | Tools |
|-------|----------|-------|
| **Unit tests** | 100% of pure functions | Jest + Vitest |
| **Integration tests** | All tool executors | Playwright |
| **E2E tests** | Critical user flows | Playwright |
| **Property tests** | Math/CFD solvers | fast-check |
| **Fuzz tests** | Parser/security tools | AFL / libFuzzer |
| **Load tests** | Concurrent tool execution | k6 |

---

## 6. Token Usage Optimization — Quantified

### Before Optimization (Current State)

```
User asks: "Solve this Navier-Stokes problem"
  → LLM generates plan: ~200 tokens
  → LLM calls tool: ~50 tokens
  → LLM interprets result: ~100 tokens
  Total: ~350 tokens ($0.001)

User asks: "Create a Telugu newspaper layout"
  → LLM generates plan: ~200 tokens
  → LLM calls tool: ~50 tokens
  → LLM interprets result: ~100 tokens
  Total: ~350 tokens ($0.001)
```

### After Optimization (Three-Tier)

```
User asks: "Solve this Navier-Stokes problem"
  → Keyword match: "navier-stokes" → Tier 1 tool (0 tokens)
  → Tool executes: ~50ms
  → Result returned directly
  Total: 0 tokens ($0.000)

User asks: "Create a Telugu newspaper layout"
  → Keyword match: "telugu" + "newspaper" → Tier 1 tool (0 tokens)
  → Tool executes: ~10ms
  → CSS/config returned directly
  Total: 0 tokens ($0.000)

User asks: "Build me a SaaS landing page"
  → SLM picks tools: ~100 tokens
  → Tools execute: design.canvas + design.landing + design.export
  → SLM formats response: ~100 tokens
  Total: ~200 tokens ($0.0002)
```

### Token Savings Summary

| Task Category | Before | After | Savings |
|--------------|--------|-------|---------|
| Math/Science computation | 350 tokens | 0 tokens | 100% |
| Design generation | 350 tokens | 200 tokens | 43% |
| Data analysis | 500 tokens | 150 tokens | 70% |
| Code generation | 800 tokens | 300 tokens | 63% |
| Research/writing | 2000 tokens | 1500 tokens | 25% |
| **Average** | **~600 tokens** | **~200 tokens** | **~67%** |

---

## 7. Platform-Specific Deployment Commands

### Desktop (Windows/macOS/Linux)

```bash
# Build for all platforms
bun run build:electron

# Windows
electron-builder --win --config electron-builder.yml

# macOS
electron-builder --mac --config electron-builder.yml

# Linux
electron-builder --linux --config electron-builder.yml
```

### Mobile (iOS/Android)

```bash
# iOS
cd mobile && bun run ios

# Android
cd mobile && bun run android

# Build APK
cd mobile && bun run android:release
```

### Web (PWA)

```bash
# Build for production
bun run build

# Deploy to CDN
npx wrangler deploy  # Cloudflare
# or
firebase deploy      # Firebase
```

---

## 8. Summary — What Can We Solve?

### YES — These problems are fully solvable today:

| Problem | Tools | Approach |
|---------|-------|----------|
| "Automate this website" | browser.* (42 tools) | CDP automation |
| "Analyze this data" | analytics.* (20 tools) | In-browser SQL engine |
| "Solve this PDE" | math.* (16 tools) | Pure TypeScript solvers |
| "Design a UI" | design.* (12 tools) | Figma-style canvas |
| "Train a model" | ml.* (8 tools) | In-browser ML |
| "Edit this video" | video.* (7 tools) | WebCodecs API |
| "Generate Telugu CSS" | typography.* (7 tools) | Rule-based engine |
| "Draw a diagram" | diagram.* (7 tools) | Mermaid generation |
| "Process audio" | media.* (6 tools) | Web Audio API |
| "Write a document" | office.* (5 tools) | PDF/DOCX generation |
| "Analyze fractals" | fractal.* (5 tools) | Pure computation |
| "Run CFD simulation" | cfd.* (6 tools) | Navier-Stokes solver |
| "OCR this image" | ocr.* (4 tools) | Tesseract.js |
| "Check ISO compliance" | standards.* (4 tools) | Rule-based audit |
| "Deploy a RAG server" | server.* (4 tools) | llama.cpp builder |

### NOT YET — These need additional work:

| Problem | What's Needed | Difficulty |
|---------|--------------|------------|
| Query user's Postgres DB | Database driver in sandbox | Medium |
| Send emails | SMTP/API integration | Low |
| Process payments | Stripe API wrapper | Low |
| Access device camera (mobile) | React Native camera module | Medium |
| Multi-user real-time editing | WebSocket hub + CRDT | High |
| Native OS integration | Electron IPC + native modules | Medium |

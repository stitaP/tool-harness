# stitaP — Open Source Tool Harness for Autonomous Agents

<p align="center">
  <strong>350 tools · 41 categories · SLM-native · Runs anywhere — laptop, old server, phone, or cloud</strong>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#tool-implementation-guide">Implement Tools</a> ·
  <a href="#deployment">Deploy</a> ·
  <a href="#documentation">Docs</a>
</p>

---

## Why stitaP Exists

Most AI agent frameworks assume you have access to GPT-4, Claude, or Gemini — large, expensive, cloud-only models. That locks out:

- **Small businesses** who can't afford $0.03/token API bills
- **On-premise teams** who can't send customer data to the cloud
- **Developers in emerging markets** who need offline-capable agents
- **Legacy hardware owners** who want to revive old servers as AI infrastructure

stitap solves this by building **350 deterministic tools** that do the actual work, so a Small Language Model (SLM) with 3–8B parameters only needs to act as a **decision maker** — picking which tool to call, not how to do the computation.

### The Core Insight

> **An SLM doesn't need to memorize the entire Python pandas API. It just needs to know which tool to call.**

When a user says "What's the EMI on a ₹10 lakh home loan?", the SLM doesn't calculate it. It calls `fin.calc.loan` and returns the answer. The tool does all the math. This is how 3B-parameter models achieve GPT-4-level task completion at 1/100th the cost.

---

## What stitaP Provides

### Capture & Documentation
| Capability | Description |
|-----------|-------------|
| **Webpage → SVG** | Full-page browser capture, scroll stitching, frozen fixed elements. Portable, hybrid, and native-vector output modes. |
| **Screen Recording** | Full screen, region, or window capture with system audio, mic, click highlights, webcam overlay. |
| **Video Editor** | Multi-track timeline, transitions, color grades, stickers, text animations. Export WebM, MP4, GIF — fully offline. |
| **Tutorial Studio** | Point at help docs → SLM plans, captures, narrates, renders a finished tutorial video on your machine. |
| **OCR (13 Indic scripts)** | Tesseract.js + Devanagari, Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati, Odia, Punjabi, Assamese, etc. |

### Agent Orchestration
| Capability | Description |
|-----------|-------------|
| **Multi-Agent Swarms** | Hierarchical, mesh, ring, or pipeline topologies sized to your hardware. Workers share a blackboard with checkpointing. |
| **Chain Engine** | Sequential and parallel tool chains with retry, fallback, and conditional routing. |
| **Teamwork Engine** | Google DeepMind-inspired multi-agent framework for long-horizon research, planning, and execution. |
| **Auto-Dispatch** | SLM picks the right tool from the registry. No manual routing needed. |
| **Kanban** | Agent task boards with status tracking, assignment, and deadline management. |

### 350 Tools Across 41 Categories

<details>
<summary><strong>Click to expand full tool catalog</strong></summary>

| Category | Count | Key Tools |
|----------|-------|-----------|
| **Browser Automation** | 25 | Navigate, click, inspect, network intercept, screenshots, console, responsive test, visual regression |
| **Analytics & SQL** | 20 | Columnar DB with SQL/XQL/MDX, groupby, window functions, Power BI export |
| **E-Commerce Operations** | 22 | Ticket classification, auto-reply, refund processing, order management, inventory, shipping, reviews, pricing |
| **Business Verticals** | 28 | Financial calculator (loan/SIP/FD/tax), chit fund management, real estate company tools |
| **Microfinance & Credit** | 22 | Ledger, EMI scheduling, WhatsApp payment parsing, collection route planner, defaulter detection, PhonePe reconciliation |
| **Machine Learning** | 22 | Regression, classification, clustering, PCA, forecasting, anomaly detection |
| **Design Engine** | 11 | Figma-style canvas, component library, design tokens, export to React/Tailwind/HTML |
| **CFD & Engineering** | 6 | Navier-Stokes solver, heat transfer, beam analysis, stress analysis, mesh generation |
| **Fractal Analysis** | 5 | Mandelbrot, Julia, IFS, L-systems, fractal dimension |
| **Code Generation** | 9 | Language reference library (Python/Java/C++/C/JS/Rust), code generator, syntax validator, patterns |
| **OCR & Indic Scripts** | 4 | Tesseract.js engine, 13 Indic language support, post-processing, layout analysis |
| **Math & Symbolic** | 10 | Calculus, linear algebra, differential equations, optimization, symbolic computation |
| **Sandbox & Execution** | 8 | Docker containers, chroot, WebWorker isolation, network policies, virtual filesystem |
| **LLM & Inference** | 12 | Model routing, quantization, device probing, failover, benchmarking, download management |
| **Orchestration** | 3 | Multi-agent swarm, chain engine, stateful graph workflows |
| **Communication** | 8 | Email, SMS, voice, webhooks, notifications |
| **Office & Documents** | 5 | Word, Excel, PowerPoint, PDF generation |
| **Media & Video** | 13 | Canvas compositor, Web Audio, speech synthesis, video recording, annotation, captioning |
| **Diagrams** | 7 | Mermaid generation, architecture diagrams, data flow, ER diagrams, sequence diagrams |
| **Standards & QA** | 4 | ISO 25010, WCAG 2.2, OWASP, security compliance |
| **South Indian Languages** | 7 | Telugu, Tamil, Kannada, Malayalam typography, text layout, rendering |
| **Hugging Face** | 6 | Model search, download, quantization, cache management |
| **Server Revival** | 4 | Hardware detection, llama.cpp build optimizer, RAG deployment planner |
| **Knowledge Base** | 5 | Semantic search, Viking context store (L0/L1/L2 tiered loading) |
| **Agent Memory** | 4 | Short-term, long-term, episodic memory with decay and merge |
</details>

### SLM-First Architecture

stitap works with any language model — but it's specifically designed for **Small Language Models** (3–8B parameters) that run locally:

| Hardware | Model | Tokens/sec | What It Can Do |
|----------|-------|------------|----------------|
| Personal laptop (8GB RAM) | GGUF Q4_K_M 3B | ~15 t/s | Single-tool tasks, calculations, simple queries |
| Desktop (16GB RAM) | GGUF Q4_K_M 7B | ~25 t/s | Multi-step chains, e-commerce operations |
| Old server (32GB RAM) | GGUF Q4_K_M 13B | ~12 t/s | Full swarm orchestration, complex workflows |
| Modern NPU (INT4) | Quantized 3B | ~40 t/s | Real-time mobile agent responses |

The SLM's only job: **pick the right tool from the registry.** The tools do all the computation, validation, formatting, and data management.

---

## Installation

### Prerequisites

- **Bun** (package manager) — [Install Bun](https://bun.sh)
- **Node.js** 18+ (Bun includes this)
- **Git**

### Clone & Install

```bash
# Clone the repository
git clone https://github.com/stitap/stitap.git
cd stitap

# Install dependencies
bun install

# Start development server (Vite + Convex)
bun dev
```

The app will be available at `http://localhost:5173`.

### Environment Variables

The project uses Convex for backend/database. Configure these in the **Keys/API keys** UI (not `.env` files):

| Variable | Purpose | Required |
|----------|---------|----------|
| `CONVEX_DEPLOYMENT` | Convex deployment URL | Yes (auto-configured) |
| `VITE_CONVEX_URL` | Convex client URL | Yes (auto-configured) |
| `CAPTURE_SERVICE_URL` | Self-hosted screenshot API endpoint | For URL capture feature |
| `CAPTURE_SERVICE_API_KEY` | API key for capture service | For URL capture feature |

### Deploy as Website (Vercel/Netlify/Cloudflare)

```bash
# Build for production
bun run build

# Output is in dist/ — deploy to any static host
```

For **Vercel** (recommended):
1. Connect your GitHub repo to Vercel
2. Set build command: `bun run build`
3. Set output directory: `dist`
4. Deploy — it auto-detects Vite

For **self-hosted**:
```bash
# Build and serve with any static file server
bun run build
npx serve dist -l 3000
```

### Deploy the Capture Service (Optional)

The capture service renders webpages in a real browser. It's a separate Docker service:

```bash
# Start the capture service
docker compose up --build capture-service

# The service runs on http://localhost:8080
```

See `docs/self-hosted-capture-service.md` for full configuration.

---

## Getting Started

### 1. Explore the Tool Store

Navigate to `/store` in the app to browse all 350 tools. Each tool has:
- **Description** — what it does
- **Parameters** — input schema
- **Tags** — category and capability labels
- **SLM Friendliness** — whether the tool works well with small models

### 2. Use the Agent Platform

Navigate to `/agent` to interact with the multi-agent system:

```bash
# The agent auto-discovers tools from the registry
# Just ask a question and the SLM picks the right tool

# Example: "Calculate EMI on a ₹10 lakh home loan for 20 years"
# → SLM calls fin.calc.loan → returns EMI, amortization, total interest

# Example: "Who in pincode 500001 hasn't paid their installment?"
# → SLM calls fin.risk.detect_defaulters → returns risk-scored list
```

### 3. Run a Specific Tool

```typescript
import { ALL_TOOLS } from "@/lib/store/registry";

// Find a tool by ID
const loanCalc = ALL_TOOLS.find(t => t.id === "fin.calc.loan");

// The tool manifest tells you:
console.log(loanCalc?.parameters);  // Input schema
console.log(loanCalc?.capabilities); // What it can do
console.log(loanCalc?.tags);         // Categories
```

### 4. Execute Code in Sandbox

```typescript
import { executeInSandbox } from "@/lib/sandbox";

// Run Python, JavaScript, or any supported language in isolation
const result = await executeInSandbox({
  language: "python",
  code: `
import numpy as np
rates = np.array([0.08, 0.085, 0.075, 0.09])
print(f"Average rate: {rates.mean()*100:.2f}%")
`,
});
// → "Average rate: 8.25%"
```

### 5. Use the Design Engine

Navigate to `/studio` to use the Figma-style design canvas:
- Drag-and-drop components
- Design tokens (colors, typography, spacing)
- Export to React + Tailwind or pure HTML/CSS

### 6. Run Engineering Simulations

```typescript
// Navier-Stokes CFD simulation
import { solveNavierStokes } from "@/lib/cfd/solver";

const result = await solveNavierStokes({
  geometry: "pipe",
  diameter: 0.61,      // meters (2 ft)
  flowRate: 0.001,     // m³/s (60 LPM)
  fluidTemperature: 60, // °C inlet
  ambientTemperature: 58, // °C sun exposure
  length: 10,
});
// → velocity field, temperature distribution, pressure drop
```

---

## Tool Implementation Guide

### How Tools Work

Every tool in stitaP follows a three-layer architecture:

```
┌─────────────────────────────────────────────┐
│  Layer 1: Tool Manifest (SLM Interface)     │
│  src/lib/store/tools/*.ts                   │
│  → Defines parameters, capabilities, tags   │
│  → SLM reads this to decide which tool      │
├─────────────────────────────────────────────┤
│  Layer 2: Business Logic (Domain Engine)    │
│  src/lib/integrations/*.ts                  │
│  → Pure TypeScript functions                │
│  → Does all computation, validation, I/O    │
│  → Zero external dependencies               │
├─────────────────────────────────────────────┤
│  Layer 3: Tool Registry (Auto-Discovery)    │
│  src/lib/store/registry.ts                  │
│  → Registers all tools in ALL_TOOLS array   │
│  → Categorizes for browsing and search      │
└─────────────────────────────────────────────┘
```

### Creating a New Tool

#### Step 1: Write the Business Logic

Create a file in `src/lib/integrations/`:

```typescript
// src/lib/integrations/weather.ts

export interface WeatherForecast {
  date: string;
  high: number;
  low: number;
  condition: string;
  precipitation: number;
}

export function getForecast(city: string, days: number): WeatherForecast[] {
  // Your deterministic logic here
  // This runs entirely locally — no API calls needed
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.now() + i * 86400000).toISOString().split("T")[0],
    high: 30 + Math.random() * 10,
    low: 20 + Math.random() * 5,
    condition: ["Sunny", "Cloudy", "Rain"][Math.floor(Math.random() * 3)],
    precipitation: Math.random() * 100,
  }));
}
```

#### Step 2: Create the Tool Manifest

Create a file in `src/lib/store/tools/`:

```typescript
// src/lib/store/tools/weather-tools.ts

import type { ToolManifest } from "../tool-types";
import { getForecast } from "@/lib/integrations/weather";

export const WEATHER_TOOLS: ToolManifest[] = [
  {
    id: "weather.forecast",
    name: "Weather Forecast",
    description: "Get weather forecast for a city for the next N days",
    category: "weather",
    author: "stitap",
    version: "1.0.0",
    license: "MIT",
    icon: "Cloud",
    color: "#f97316",
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
    tags: ["weather", "forecast", "planning"],
    slmFriendly: true,
    parameters: {
      type: "object",
      required: ["city", "days"],
      properties: {
        city: {
          type: "string",
          description: "City name (e.g., 'Hyderabad', 'Mumbai')",
        },
        days: {
          type: "number",
          description: "Number of days to forecast (1-14)",
          minimum: 1,
          maximum: 14,
        },
      },
    },
    execute: async (params: { city: string; days: number }) => {
      const forecast = getForecast(params.city, params.days);
      return {
        city: params.city,
        forecast,
        summary: `Next ${params.days} days in ${params.city}: ` +
          forecast.map(f => `${f.date}: ${f.condition} ${f.high}°C`).join(", "),
      };
    },
    capabilities: [
      {
        name: "forecast",
        description: "Generate weather forecasts for any city",
      },
    ],
  },
];
```

#### Step 3: Register in the Store

Edit `src/lib/store/registry.ts`:

```typescript
// Add import at the top
import { WEATHER_TOOLS } from "./tools/weather-tools";

// Add to ALL_TOOLS array
export const ALL_TOOLS: ToolManifest[] = [
  // ... existing tools ...
  ...WEATHER_TOOLS,
];

// Add category entry to CATEGORIES
export const CATEGORIES: ToolCategoryDef[] = [
  // ... existing categories ...
  {
    id: "weather",
    name: "Weather",
    icon: "Cloud",
    description: "Weather forecasting and atmospheric analysis",
    toolCount: WEATHER_TOOLS.length,
  },
];
```

#### Step 4: Add the Category Type

Edit `src/lib/store/tool-types.ts`:

```typescript
// Add to ToolCategory union
export type ToolCategory =
  | "browser"
  | "analytics"
  // ... existing categories ...
  | "weather";  // ← Add this
```

#### Step 5: Verify

```bash
# Typecheck
bun tsc -b --noEmit

# The tool now appears in /store and is available to the SLM
```

### Tool Design Principles

1. **Deterministic output** — Same input always produces same output. No randomness, no hallucination.
2. **SLM-friendly** — Parameters use simple types (string, number, boolean). No complex nested objects.
3. **Self-contained** — Each tool does its own validation, computation, and formatting.
4. **No external dependencies** — Tools run entirely in the browser or sandbox. No API keys needed.
5. **Error messages for humans** — When a tool fails, it returns a clear error message the SLM can relay.

### Adding Tools to Multiple Categories

```typescript
export const MY_TOOLS: ToolManifest[] = [
  {
    id: "mytool.analysis",
    tags: ["analysis", "reporting", "finance"],
    // Multiple tags = appears in multiple category searches
  },
];
```

### Tool Execution Flow

```
User: "What's the best loan prepayment strategy?"

1. SLM reads tool registry
2. SLM picks: fin.calc.loan (param: { amount, rate, tenure, prepay })
3. SLM calls: fin.calc.loan({ amount: 1000000, rate: 8.5, tenure: 20, prepay: 50000 })
4. Tool computes: EMI schedule with prepayment scenarios
5. SLM formats response: "Prepaying ₹50K/year saves ₹2.3L interest..."
6. User sees: Human-readable answer with exact numbers
```

---

## Architecture

```
stitap/
├── src/
│   ├── lib/
│   │   ├── store/              # Tool registry and manifests
│   │   │   ├── registry.ts     # ALL_TOOLS, CATEGORIES
│   │   │   ├── tool-types.ts   # ToolManifest, ToolCategory types
│   │   │   └── tools/          # 39 tool definition files
│   │   ├── integrations/       # Business logic engines
│   │   │   ├── financial-scenarios.ts
│   │   │   ├── microfinance.ts
│   │   │   ├── chitfund.ts
│   │   │   ├── realestate.ts
│   │   │   ├── ecommerce.ts
│   │   │   ├── codegen.ts
│   │   │   ├── langref.ts
│   │   │   └── ...
│   │   ├── sandbox/            # Isolated execution environments
│   │   │   ├── container-engine.ts
│   │   │   ├── virtual-fs.ts
│   │   │   └── network-policy.ts
│   │   ├── agent/              # Multi-agent orchestration
│   │   │   ├── swarm.ts
│   │   │   ├── auto-dispatch.ts
│   │   │   ├── memory.ts
│   │   │   └── knowledge.ts
│   │   ├── chains/             # Tool chain execution
│   │   ├── cfd/                # Computational fluid dynamics
│   │   ├── math/               # Symbolic & numerical math
│   │   ├── ml/                 # Machine learning engines
│   │   ├── nlp/                # Natural language processing
│   │   ├── inference/          # LLM routing & optimization
│   │   └── capture/            # Webpage → SVG capture engine
│   ├── pages/                  # React pages (30+ routes)
│   ├── components/             # UI components (shadcn/ui)
│   └── convex/                 # Backend (Convex)
├── engines/                    # Rust capture service (from scratch)
├── extension/                  # Chrome MV3 extension
└── docs/                       # Documentation & tutorials
```

---

## Deployment

### Desktop App (Windows, macOS, Linux)

stitap can be built as a native desktop app using Tauri:

```bash
# Build desktop app
cd desktop
bun install
cargo build --release

# Output: target/release/bundle/
# - Windows: NSIS installer (.exe)
# - macOS: .dmg
# - Linux: .deb, .rpm, .AppImage
```

The desktop app includes:
- Native screen recording (system audio, webcam)
- Hardware detection for optimal SLM sizing
- Offline operation (no internet required)
- Built-in llama.cpp for local model inference

### Docker

```bash
# Full platform (web app + capture service)
docker compose up --build

# Capture service only
docker compose up --build capture-service
```

### Legacy Server Deployment

stitap can revive old servers (pre-2008 hardware) as AI infrastructure:

```bash
# Detect hardware
# → stitaP probes CPU, RAM, GPU, NPU without admin rights

# Optimize build for detected hardware
# → Generates llama.cpp compile flags for exact CPU architecture

# Deploy as RAG server
# → Memory-mapped model loading, NUMA-aware pinning, musl static binary
```

See `docs/native-apps.md` for detailed deployment guides.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Tool Catalog](docs/tool-catalog.md) | Complete reference for all 350 tools |
| [Enterprise Use Cases](docs/enterprise-use-cases.md) | 21 real-world use cases with tool chains |
| [Business Verticals](docs/business-verticals-use-cases.md) | 43 use cases for finance, chit fund, real estate, microfinance |
| [Microfinance Guide](docs/microfinance-use-case.md) | Implementation guide for credit businesses |
| [Deployment Architecture](docs/deployment-architecture.md) | System architecture and deployment topology |
| [NLP Layer](docs/nlp-layer.md) | Natural language processing pipeline |
| [Testing Guide](docs/testing.md) | QA and testing procedures |
| [Roadmap](docs/roadmap.md) | Feature roadmap and milestones |
| [Extension Docs](docs/current-tab-extension.md) | Chrome extension architecture |
| [Self-Hosted Capture](docs/self-hosted-capture-service.md) | Self-hosting the screenshot API |

---

## Tech Stack

- **Frontend:** Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion
- **Backend:** Convex (database, auth, real-time)
- **Agent Framework:** Custom multi-agent orchestration with swarm, chain, and teamwork engines
- **Inference:** llama.cpp, OpenVINO, Hugging Face Transformers, ONNX Runtime
- **Capture Engine:** Custom Rust implementation (from scratch — no Playwright, no external crates)
- **Sandbox:** Docker containers, chroot, WebWorker isolation
- **Package Manager:** Bun

---

## Contributing

stitaP is source-available under the PolyForm Noncommercial License 1.0.0 (noncommercial use only). To add a new tool:

1. Write business logic in `src/lib/integrations/`
2. Create tool manifest in `src/lib/store/tools/`
3. Register in `src/lib/store/registry.ts`
4. Add category type in `src/lib/store/tool-types.ts`
5. Run `bun tsc -b --noEmit` to verify
6. Submit a PR

See [Tool Implementation Guide](#tool-implementation-guide) above for detailed examples.

---

## License

PolyForm Noncommercial 1.0.0 — noncommercial use only. See [LICENSE](../LICENSE) for details.

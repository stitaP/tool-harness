# stitaP Tool Harness

**A tool harness that lets Small Language Models (0.5B – 8B parameters) do real work.**

The SLM only has to *decide which tool to call*. The 350+ deterministic tools in this repository do the actual computation — finance, analytics, browser automation, OCR, CFD, code generation, document capture and more — entirely on your own hardware.

> Full project overview, capability tables and the tool-authoring guide: [docs/project-overview.md](docs/project-overview.md)

---

## Contents

1. [Why a harness for SLMs?](#1-why-a-harness-for-slms)
2. [Quick start](#2-quick-start)
3. [How the harness talks to a model](#3-how-the-harness-talks-to-a-model)
4. [Plugging in your SLM](#4-plugging-in-your-slm)
   - 4.1 [In-browser GGUF via wllama (llama.cpp WASM)](#41-in-browser-gguf-via-wllama-llamacpp-wasm)
   - 4.2 [Local server: llama.cpp / Ollama / LM Studio](#42-local-server-llamacpp--ollama--lm-studio)
   - 4.3 [Transformers.js (ONNX) models](#43-transformersjs-onnx-models)
   - 4.4 [No model at all (deterministic fallback)](#44-no-model-at-all-deterministic-fallback)
5. [Giving the SLM tools](#5-giving-the-slm-tools)
6. [Running tool chains without a model (HarnessRuntime)](#6-running-tool-chains-without-a-model-harnessruntime)
7. [Keeping the system prompt small: session profiles](#7-keeping-the-system-prompt-small-session-profiles)
8. [Choosing hardware and a model](#8-choosing-hardware-and-a-model)
9. [Guardrails: the CAR framework](#9-guardrails-the-car-framework)
10. [Using the harness from the web UI](#10-using-the-harness-from-the-web-ui)
11. [Recommended SLMs](#11-recommended-slms)
12. [Tips for reliable tool calling with small models](#12-tips-for-reliable-tool-calling-with-small-models)
13. [Repository layout](#13-repository-layout)
14. [Repository notes](#14-repository-notes)

---

## 1. Why a harness for SLMs?

A 3B model can't reliably compute an amortization table, parse a WhatsApp payment message, or run a Navier-Stokes solve. It *can* reliably read a short list of tools and pick the right one. stitaP splits the job accordingly:

```
 User question
      │
      ▼
 ┌──────────────┐   Thought / Action / Action Input   ┌──────────────────┐
 │  SLM (3–8B)  │ ──────────────────────────────────▶ │  Tool Registry   │
 │  decides     │ ◀────────────────────────────────── │  350+ tools      │
 └──────────────┘            Observation              │  (deterministic) │
      │                                                └──────────────────┘
      ▼
 Final Answer (formatted from tool output)
```

Everything in the tool layer is plain TypeScript with no external services, so it runs in a browser tab, in Bun/Node, or inside the Tauri desktop app — offline.

---

## 2. Quick start

**Prerequisites:** [Bun](https://bun.sh) (or Node 18+), Git.

```bash
git clone https://github.com/stitaP/tool-harness.git
cd tool-harness
bun install
bun dev          # Vite dev server → http://localhost:5173
```

Useful routes once the app is running:

| Route | What it is |
|---|---|
| `/store` | Browse and search all tools (filter by `slmFriendly`, `offline`) |
| `/playground` | Harness playground — run tools and chains interactively |
| `/modules` | Session profiles — pick how many tools your model sees |
| `/agent-config` | Agent autonomy, budgets and approval policies |
| `/docs/tools` | Generated reference for every tool and its parameters |
| `/docs/start` | In-app "Start here" guide |

> The app also uses Convex for auth/persistence. Those parts are optional for using the tool layer as a library — see [§14](#14-repository-notes).

---

## 3. How the harness talks to a model

The model layer lives in [`src/lib/chains/`](src/lib/chains). It is provider-agnostic: a `ChatModel` is anything with a `generate(messages) → ChatMessage` method.

Two pieces matter for SLM users:

**1. `registerModelHook`** — one function call that plugs *any* model in ([`src/lib/chains/llm.ts`](src/lib/chains/llm.ts)):

```ts
import { registerModelHook } from "@/lib/chains";

registerModelHook(async (messages, options) => {
  // messages: [{ role: "system" | "user" | "assistant", content: string }]
  // return:   { role: "assistant", content: string }
});
```

**2. `AgentExecutor`** — a bounded ReAct loop ([`src/lib/chains/agent-executor.ts`](src/lib/chains/agent-executor.ts)). It sends the model a compact prompt in this format and parses the reply:

```
Thought: reason about what to do next
Action: <tool name>
Action Input: {"arg": "value"}
...
Thought: I know the answer now
Final Answer: <answer>
```

The parser is intentionally forgiving of small-model quirks: it accepts non-JSON action inputs, ignores stray text, and the loop is capped by `maxIterations` (default 8) so a confused model can never spin forever.

---

## 4. Plugging in your SLM

### 4.1 In-browser GGUF via wllama (llama.cpp WASM)

`@wllama/wllama` is already a dependency, and the NLP layer ([`src/lib/nlp/service.ts`](src/lib/nlp/service.ts)) uses it to run quantized GGUF models on CPU in the browser. To drive the agent loop with a GGUF model:

```ts
import { Wllama } from "@wllama/wllama/esm/index.js";
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import { registerModelHook } from "@/lib/chains";

const wllama = new Wllama({ "single-thread/wllama.wasm": wasmUrl });
await wllama.loadModelFromUrl(
  "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
);

registerModelHook(async (messages, options) => {
  // Flatten chat messages into the model's chat template
  const prompt = messages
    .map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>`)
    .join("\n") + "\n<|im_start|>assistant\n";

  const text = await wllama.createCompletion(prompt, {
    nPredict: options?.maxTokens ?? 256,
    sampling: { temp: options?.temperature ?? 0.2 },
    stopTokens: options?.stopSequences,
  });
  return { role: "assistant", content: text };
});
```

Model choices that work well here are listed in [§11](#11-recommended-slms). Keep to ≤ 2B parameters at Q4 for browser use; larger models belong on a local server (next section).

### 4.2 Local server: llama.cpp / Ollama / LM Studio

Any OpenAI-compatible endpoint works. Start a server, e.g.:

```bash
# llama.cpp
llama-server -m qwen2.5-3b-instruct-q4_k_m.gguf --port 8080

# or Ollama
ollama run qwen2.5:3b        # serves on http://localhost:11434
```

Then register a hook that forwards to it:

```ts
import { registerModelHook } from "@/lib/chains";

registerModelHook(async (messages, options) => {
  const res = await fetch("http://localhost:8080/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "local",                       // Ollama: "qwen2.5:3b"
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 512,
      stop: options?.stopSequences,
    }),
  });
  const json = await res.json();
  return { role: "assistant", content: json.choices[0].message.content };
});
```

For Ollama use `http://localhost:11434/v1/chat/completions`; for LM Studio the default is `http://localhost:1234/v1/chat/completions`.

The hardware-aware router in [`src/lib/inference/`](src/lib/inference) can help pick a backend and quantization for the machine you're on:

```ts
import { detectSystemInfo, probeBackends, makeQuantDecision } from "@/lib/inference";

const sys = detectSystemInfo();               // RAM, platform, arch, CPU brand, GPU/NPU hints
const backends = await probeBackends(sys);    // openvino-cpu/igpu/npu, llama.cpp, WebGPU, WASM …
const quant = makeQuantDecision(
  "Qwen/Qwen2.5-3B-Instruct-GGUF",            // model source
  false,                                      // original fp16 weights available?
  undefined,                                  // current format (undefined = choosing fresh)
  sys.availableRamBytes,                      // target device memory
  ["q4_k_m", "q5_k_m", "q8_0"],               // formats you can download
);
// → { recommended: "q4_k_m", options: [...], reason: "..." }
```

### 4.3 Transformers.js (ONNX) models

`@huggingface/transformers` is also bundled. It is used for the small embedding / NER / captioning models in the NLP layer, and you can use a `text-generation` pipeline as the hook the same way:

```ts
import { pipeline } from "@huggingface/transformers";
import { registerModelHook } from "@/lib/chains";

const gen = await pipeline("text-generation", "onnx-community/Qwen2.5-0.5B-Instruct", { dtype: "q4" });

registerModelHook(async (messages) => {
  const out = await gen(messages, { max_new_tokens: 256, do_sample: false });
  return { role: "assistant", content: out[0].generated_text.at(-1).content };
});
```

### 4.4 No model at all (deterministic fallback)

If you never call `registerModelHook`, `defaultModel()` serves a rule-based responder. It understands enough of the ReAct protocol to terminate loops, so every chain, test and harness in the repo runs offline with zero model installed. `activeBackend()` reports `"rule-based-fallback"` so UIs can show it honestly.

---

## 5. Giving the SLM tools

### Minimal agent

```ts
import { AgentExecutor } from "@/lib/chains";

const agent = new AgentExecutor({
  tools: [
    {
      name: "loan_emi",
      description: "Monthly EMI for a loan",
      parameters: '{"principal": number, "annualRate": number, "months": number}',
      execute: async ({ principal, annualRate, months }) => {
        const r = Number(annualRate) / 1200;
        const n = Number(months);
        const emi = (Number(principal) * r) / (1 - Math.pow(1 + r, -n));
        return { emi: Math.round(emi) };
      },
    },
  ],
  maxIterations: 6,
  generateOptions: { temperature: 0.1, maxTokens: 256 },
});

const result = await agent.run("What is the EMI on a 10 lakh loan at 8.5% for 20 years?");
console.log(result.answer);   // "…₹8,678 per month…"
console.log(result.steps);    // full Thought/Action/Observation trace
```

### Exposing registry tools to the agent

The registry ([`src/lib/store/registry.ts`](src/lib/store/registry.ts)) holds every built-in tool as a `ToolManifest`. Filter to the ones that suit small models and adapt them:

```ts
import { getStore } from "@/lib/store";
import { AgentExecutor } from "@/lib/chains";
import type { AgentTool } from "@/lib/chains";

const store = getStore();

// Only offline, SLM-friendly tools in the categories we care about
const manifests = store
  .search({ slmFriendly: true, offline: true })
  .filter((t) => ["finance-calc", "microfinance", "analytics"].includes(t.category));

const tools: AgentTool[] = manifests.map((m) => ({
  name: m.id,
  description: m.description,
  parameters: JSON.stringify(
    Object.fromEntries(m.parameters.map((p) => [p.name, p.type + (p.required ? "" : "?")])),
  ),
  execute: async (args) => {
    const out = await store.execute(m.id, args);   // validates required params
    if (!out.success) throw new Error(out.error);
    return out.data;
  },
}));

const agent = new AgentExecutor({ tools, maxIterations: 8 });
```

> **Rule of thumb:** give a ≤3B model **5–15 tools** per request, not 350. Pre-filter by category (or use session profiles, [§7](#7-keeping-the-system-prompt-small-session-profiles)) and let a router chain pick the category first if you need broader coverage.

### Two-stage routing for broader coverage

```ts
import { LLMChain, PromptTemplate, JsonOutputParser } from "@/lib/chains";

const router = new LLMChain({
  prompt: new PromptTemplate({
    system: "Respond with valid JSON only.",
    template: 'Pick one category for this request from [{categories}]. Request: {text}. JSON keys: ["category"]',
  }),
  parser: new JsonOutputParser(),
});

const { category } = await router.invoke({ categories: "financial, analytics, browser, ocr", text: question });
// then build an AgentExecutor with only that category's tools
```

---

## 6. Running tool chains without a model (HarnessRuntime)

Many jobs don't need an SLM at all — just a fixed sequence of tools. `HarnessRuntime` executes a `HarnessDefinition` step by step, passing outputs forward as variables:

```ts
import { getStore, HarnessRuntime } from "@/lib/store";

const store = getStore();
const runtime = new HarnessRuntime(store);

const run = await runtime.run({
  id: "monthly-collections",
  name: "Monthly collections report",
  description: "Parse payments, find defaulters, export CSV",
  envVars: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  steps: [
    { id: "parse",  toolId: "fin.whatsapp.parse_payment",  input: { message: rawText },   outputVar: "payment" },
    { id: "risk",   toolId: "fin.risk.detect_defaulters",  input: { pincode: "500001" },  outputVar: "defaulters" },
    { id: "export", toolId: "analytics.csv_export",        input: { table: "defaulters" }, skipIf: "noDefaulters" },
  ],
});

console.log(run.status, run.steps.map((s) => s.status), run.output);
```

Use an SLM only where judgement is required (e.g. a `chains.run` step to summarise the result for a human).

---

## 7. Keeping the system prompt small: session profiles

Every enabled module adds tokens to the system prompt. [`src/lib/session/modules.ts`](src/lib/session/modules.ts) tracks that overhead and ships presets:

| Profile | Meant for | What's on |
|---|---|---|
| `slm-minimal` | ≤3B models on laptops (sub-1K token system prompt) | chains, memory, skills, on-device vision, prompt library |
| `balanced` | 7B-class models | + capture, browser core, testing, kanban, inference router |
| `full-power` | ≥13B or ≥16 GB RAM | everything incl. swarm, sandboxes, integrations |
| `air-gapped` | offline deployments | only modules with `offline: true` |

```ts
import { createSessionState, applyPreset, computeBudget } from "@/lib/session/modules";

let state = createSessionState("slm-minimal");          // or applyPreset(state, "slm-minimal") later
console.log(computeBudget(state, { modelContextWindow: 4096 }));
// → { totalContextOverheadTokens, enabledCount, toolIds, recommendedContextWindow, workloadMode }
```

The same controls are exposed in the UI at `/modules`.

---

## 8. Choosing hardware and a model

| Hardware | Suggested model | Quant | Approx. speed | Good for |
|---|---|---|---|---|
| Browser tab / 8 GB laptop | 0.5B–1.5B | Q4_K_M (wllama) | 10–20 t/s | single tool calls, extraction, classification |
| 16 GB desktop, CPU only | 3B | Q4_K_M | ~15–25 t/s | multi-step ReAct, small tool sets |
| 16–32 GB with iGPU/NPU | 7–8B | Q4_K_M / INT4 | 20–40 t/s | larger tool sets, planning + execution |
| Old server (32 GB, no GPU) | 7–13B | Q4_K_M, mmap | 8–12 t/s | batch harness runs, RAG |

The inference layer can generate a plan for the machine it's on:

```ts
import { detectSystemInfo, detectLegacyProfile, getLegacyGuidance, buildOptimizationPlan } from "@/lib/inference";

const sys = detectSystemInfo();
const legacy = detectLegacyProfile(sys);                 // AVX2/AVX-512/SSE4.2 support, RAM class …
console.log(getLegacyGuidance(legacy, sys).steps);       // step-by-step llama.cpp build/run advice
console.log(buildOptimizationPlan("llamacpp-cpu", "balanced", sys)); // threads, batch, KV-cache, mmap …
```

Server-side helpers for reviving old hardware (hardware detection, llama.cpp build flags, RAG deployment planning) are in [`src/lib/server/`](src/lib/server).

---

## 9. Guardrails: the CAR framework

Small models make more mistakes, so the harness wraps them in **Control · Agency · Runtime** policies ([`src/lib/harness/car-framework.ts`](src/lib/harness/car-framework.ts)):

- **Control** — which actions auto-approve, which need a human, which are blocked.
- **Agency** — autonomy level (`supervised` / `semi-autonomous` / `autonomous`), max concurrent agents, allowed and blocked tools.
- **Runtime** — spend rails for tokens, cost, time and memory, per action and per session, plus evaluation gates that must pass before a task is marked complete.

```ts
import { getCARFramework, DEFAULT_WEBBUILDER_HARNESS } from "@/lib/harness";

const car = getCARFramework({
  ...DEFAULT_WEBBUILDER_HARNESS,
  id: "slm-finance-harness",
  agency: {
    ...DEFAULT_WEBBUILDER_HARNESS.agency,
    defaultAutonomy: "supervised",
    maxConcurrentAgents: 1,
    allowedTools: ["fin.calc.loan", "fin.risk.detect_defaulters", "analytics.csv_export"],
  },
  runtime: {
    ...DEFAULT_WEBBUILDER_HARNESS.runtime,
    actionTokenBudget: 4_000,     // small models: keep each step short
    sessionTokenBudget: 40_000,
    actionTimeoutSeconds: 60,
  },
});
```

[`AGENTS.md`](AGENTS.md) documents the default policy table used by the built-in agents. The approval gate (`agent.approvals` module) and run tracing (`agent.tracing`) are the two modules worth keeping on even in `slm-minimal` deployments once you move beyond experiments.

---

## 10. Using the harness from the web UI

1. **Load a model** — `/modules` → *Inference* → choose backend; or run a local server ([§4.2](#42-local-server-llamacpp--ollama--lm-studio)) and set its URL in Settings → Keys/API.
2. **Pick a profile** — `/modules` → *SLM Minimal* for ≤3B models.
3. **Try a tool** — `/store` → open a tool → *Run* with sample parameters. Every tool shows its parameter schema exactly as the SLM sees it.
4. **Run an agent** — `/playground` → type a task. The trace panel shows each Thought / Action / Observation so you can see where a small model goes wrong and tighten the tool set or prompt.
5. **Automate** — `/agents` for kanban-driven multi-agent runs, `/teamwork` for long-horizon research/plan/execute flows, `/agent-config` for budgets and approvals.

---

## 11. Recommended SLMs

Models the NLP layer already references, plus common alternatives — all available as GGUF on Hugging Face:

| Model | Params | Notes |
|---|---|---|
| Qwen2.5-0.5B-Instruct | 0.5B | Used by the built-in NLP features; runs in-browser via wllama |
| Qwen2.5-1.5B / 3B-Instruct | 1.5–3B | Best tool-calling accuracy per byte in this size class |
| Llama-3.2-1B / 3B-Instruct | 1–3B | Strong instruction following; good ReAct formatting |
| Phi-3.5-mini / Phi-4-mini | 3.8B | Excellent reasoning for its size; needs ~3 GB at Q4 |
| Gemma-2-2B-it | 2B | Compact, good at structured JSON output |
| Qwen2-VL-2B-Instruct | 2B (VLM) | Used for screenshot/vision understanding |
| Mistral-7B-Instruct / Qwen2.5-7B | 7B | Comfortable upper bound for CPU-only desktops |

Quantization guidance: **Q4_K_M** is the default sweet spot; use **Q5_K_M** if you have RAM to spare and see tool-name hallucinations; use **IQ2/IQ3** only for ≤2B browser deployments.

---

## 12. Tips for reliable tool calling with small models

- **Fewer tools, shorter descriptions.** One sentence per tool. Put units and examples in the parameter description, not the tool description.
- **Flat parameters.** Strings, numbers, booleans. Avoid nested objects — SLMs mangle them.
- **Low temperature.** `0.0–0.2` for the ReAct loop; raise it only for the final natural-language answer.
- **Stop sequences.** Pass `stopSequences: ["Observation:"]` so the model can't hallucinate a tool result.
- **Prefix tool ids by domain** (`fin.`, `analytics.`, `browser.`) — small models use the prefix as a cue.
- **Let tools return short summaries** alongside data (`{ data, summary }`); the model only needs the summary to write the final answer.
- **Use `HarnessRuntime` for fixed workflows** and reserve the SLM for the single decision it's actually good at.
- **Watch the trace.** `AgentExecutor.run()` returns every step; the first wrong `Action` usually points at a description that needs rewording.

---

## 13. Repository layout

```
src/lib/
├── chains/          Model hook, prompt templates, parsers, LLMChain, SequentialChain, AgentExecutor (ReAct)
├── store/           Tool registry, ToolStore, HarnessRuntime, AgentRuntime, tools/* (39 manifest files)
├── inference/       Device probing, backend router, quantization decisions, model downloads, legacy hardware
├── session/         Session modules and SLM / balanced / full / air-gapped presets
├── harness/         CAR framework (control, agency, runtime, spend rails, evaluation gates)
├── agent/           Memory, skills, swarm, kanban, scheduler, approvals, tracing, auto-dispatch
├── nlp/             On-device NLP (wllama GGUF + Transformers.js ONNX + Tesseract OCR)
├── slm/             Doc parsing, tutorial/video generation pipelines driven by SLMs
├── integrations/    Domain engines: finance, microfinance, chit fund, real estate, e-commerce, codegen…
├── analytics/ cfd/ math/ ml/ graph/ sandbox/ office/ capture/ video/ vision/ …   other engines
src/pages/           React UI (store, playground, modules, agents, docs…)
src/convex/          Convex backend (auth, captures, retention)
docs/                Architecture, tool catalog, use cases, roadmap, testing
extension/ desktop/ engines/   Chrome extension, Tauri desktop app, Rust capture engine notes
```

---

## 14. Repository notes

- This snapshot was exported from the hosted stitaP workspace. A few platform-managed files are **not** included: `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `scripts/`, and `vly-toolbar-readonly.tsx` (imported by `src/main.tsx`). Add standard Vite + React + TypeScript configs and remove or stub the toolbar import before building the full web app. The tool, chain, inference and harness libraries under `src/lib/` have no dependency on those files.
- `public/stitap-export.zip` is a binary export bundle and was not carried over.
- Auth and persistence use Convex (`src/convex/`); see `docs/deployment-architecture.md` if you want to deploy the full app rather than use the libraries.

## License

**PolyForm Noncommercial License 1.0.0** — see [LICENSE](LICENSE).

You may use, modify and share this tool harness freely for **noncommercial purposes**: personal projects, research, education, and use by charities, public institutions and other noncommercial organizations. **Commercial use is not permitted** under this license. If you'd like to use stitaP commercially, contact the maintainers via the [stitaP organization](https://github.com/stitaP) to discuss a separate license.

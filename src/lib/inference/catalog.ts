/**
 * stitaP Harness Store — Catalog Entries
 *
 * Complete catalog of tools from the spec (§6). Each entry declares
 * its permissions, supported backends, model format, and integration notes.
 *
 * None of these tools duplicate the inference routing (§4) or model
 * acquisition (§3) logic — they all sit above, calling into whatever
 * model is already running through the backend the router selected.
 */

import type { CatalogEntry, CatalogCategory, ToolPermission } from "./types";

// ─── Helper ───────────────────────────────────────────────────────────────────

function entry(
  id: string,
  name: string,
  description: string,
  longDescription: string,
  category: CatalogCategory,
  opts: Partial<CatalogEntry> = {},
): CatalogEntry {
  return {
    id,
    name,
    description,
    longDescription,
    version: "1.0.0",
    author: "stitaP Catalog",
    license: "MIT",
    catalogCategory: category,
    role: description,
    permissions: [{ level: "network", description: "Needs network to fetch models/data" }],
    supportedBackends: ["llamacpp-cpu", "openvino-cpu", "openvino-igpu"],
    tags: [],
    isLLMBased: false,
    integrationNotes: "",
    selfContained: true,
    url: "",
    ...opts,
  };
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const CATALOG_ENTRIES: CatalogEntry[] = [
  // ── §6.1 Dify ──────────────────────────────────────────────────────────────
  entry(
    "dify",
    "Dify",
    "Open-source LLM application development platform — visual workflow builder, RAG pipeline, agent capabilities, model management",
    "Dify combines AI workflow building, a RAG pipeline, agent capabilities, model management, and observability features. Teams can go from prototype to production with broad support for proprietary and open-source LLMs. In the harness catalog, Dify fits as a visual workflow/orchestration layer — installed when users want multi-step agent workflows through a UI rather than code.",
    "orchestration",
    {
      url: "https://github.com/langgenius/dify",
      tags: ["workflow", "rag", "agent", "visual-builder", "multi-model"],
      isLLMBased: true,
      integrationNotes: "Sits on top of the selected inference backend (§4) for all model calls. Provides visual workflow UI for building RAG pipelines without code.",
      permissions: [
        { level: "network", description: "Model API calls, web search for RAG" },
        { level: "write-fs", description: "Vector DB storage, document uploads" },
      ],
    },
  ),

  // ── §6.2 Mem0 ──────────────────────────────────────────────────────────────
  entry(
    "mem0",
    "Mem0",
    "Universal memory layer for AI agents — persistent cross-session memory, preference tracking, personalized interactions",
    "Mem0 offers both a hosted platform API and self-hosted open-source SDKs, integrating with CrewAI, LangGraph, and other frameworks. It fills the gap of persistent cross-session memory for agent tools — distinct from model-level KV-cache persistence (which is about a single session's compute efficiency, not durable long-term memory across sessions).",
    "memory",
    {
      url: "https://github.com/mem0ai/mem0",
      tags: ["memory", "persistence", "personalization", "cross-session"],
      isLLMBased: true,
      integrationNotes: "Complements the built-in agent memory system. Provides vector-backed semantic search over memories, while our system provides the extraction and lifecycle management.",
      permissions: [
        { level: "network", description: "Embedding API calls for semantic search" },
        { level: "write-fs", description: "Local vector store persistence" },
      ],
    },
  ),

  // ── §6.3 browser-use ───────────────────────────────────────────────────────
  entry(
    "browser-use",
    "browser-use",
    "Framework making websites accessible for AI agents — click, fill forms, navigate, extract data from web pages",
    "A CLI skill or Python library that gives AI agents the ability to interact with websites: clicking, form filling, navigation, data extraction. This is a web-interaction tool — none of the inference backends give a model this capability on their own.",
    "browser-automation",
    {
      url: "https://github.com/browser-use/browser-use",
      tags: ["browser", "automation", "web-interaction", "forms", "navigation"],
      isLLMBased: true,
      integrationNotes: "Complements our built-in browser tools (which use CDP directly). browser-use adds a Python-native agent loop with built-in retry and self-healing.",
      permissions: [
        { level: "network", description: "HTTP requests to target websites" },
        { level: "none", description: "No filesystem access needed" },
      ],
    },
  ),

  // ── §6.4 Ruflo (Claude Flow) ───────────────────────────────────────────────
  entry(
    "ruflo",
    "Ruflo",
    "Meta-harness for deploying multi-agent swarms — coordinates autonomous workflows with adaptive memory, self-learning, RAG",
    "Ruflo is the closest existing tool to the harness store's orchestration layer concept. It's a meta-harness with built-in swarm coordination, adaptive memory, self-learning intelligence, and native support for coding agents. Including it effectively offers a harness-within-a-harness for users who want pre-built multi-agent coordination rather than building their own.",
    "swarm",
    {
      url: "https://github.com/ruflolabs/ruflo",
      tags: ["swarm", "multi-agent", "orchestration", "self-learning", "rag"],
      isLLMBased: true,
      integrationNotes: "Can consume any backend from §4 as its model provider. Its native coding agent support makes it the highest-level orchestration option in the catalog.",
      permissions: [
        { level: "network", description: "Model API calls, inter-agent communication" },
        { level: "write-fs", description: "Memory persistence, artifact storage" },
      ],
    },
  ),

  // ── §6.5 CrewAI ────────────────────────────────────────────────────────────
  entry(
    "crewai",
    "CrewAI",
    "Open-source framework for role-playing autonomous AI agents — assign roles, goals, backstories; crews execute sequentially or hierarchically",
    "A lighter-weight alternative to Ruflo: less infrastructure, more oriented toward defining a small number of specialized agents with clear roles for bounded workflows. Integrates with Mem0 for memory and supports any LLM backend.",
    "orchestration",
    {
      url: "https://github.com/joaomdmoura/crewAI",
      tags: ["agents", "roles", "crew", "orchestration", "hierarchical"],
      isLLMBased: true,
      integrationNotes: "Uses any OpenAI-compatible API, which our inference router can serve. Lighter than Ruflo when you only need 2-5 specialized agents.",
      permissions: [
        { level: "network", description: "Model API calls via OpenAI-compatible interface" },
        { level: "none", description: "No filesystem access needed by default" },
      ],
    },
  ),

  // ── §6.6 MetaGPT ───────────────────────────────────────────────────────────
  entry(
    "metagpt",
    "MetaGPT",
    "Multi-agent framework assigning software-company roles (PM, architect, engineer, QA) — turns one-line requirements into working code",
    "Narrower than CrewAI — purpose-built around a software-engineering pipeline metaphor. Agents produce structured outputs (PRDs, design docs, code) through role-specific prompts and validation.",
    "coding",
    {
      url: "https://github.com/geekan/MetaGPT",
      tags: ["software-engineering", "multi-agent", "code-generation", "prd", "architecture"],
      isLLMBased: true,
      integrationNotes: "Consumes any LLM backend. Best used when the goal is to turn a single requirement into a complete software artifact with multiple quality gates.",
      permissions: [
        { level: "network", description: "Model API calls" },
        { level: "write-fs", description: "Generated code and documentation output" },
      ],
    },
  ),

  // ── §6.7 aider ─────────────────────────────────────────────────────────────
  entry(
    "aider",
    "aider",
    "Terminal-based AI pair-programming — edits code directly in a local git repo, applies LLM changes as commits",
    "Single-agent, human-in-the-loop coding tool. Unlike orchestration frameworks, it's interactive: you describe what you want, aider proposes changes, you review, it commits. Fits the catalog as an interactive coding assistant distinct from autonomous multi-agent tools.",
    "coding",
    {
      url: "https://github.com/paul-gauthier/aider",
      tags: ["coding", "pair-programming", "git", "interactive", "terminal"],
      isLLMBased: true,
      integrationNotes: "Can use any OpenAI-compatible API as its model backend. Its git-native approach means changes are tracked and reversible.",
      permissions: [
        { level: "network", description: "Model API calls" },
        { level: "write-fs", description: "Edits source files and creates git commits" },
      ],
    },
  ),

  // ── §6.8 AutoGen ───────────────────────────────────────────────────────────
  entry(
    "autogen",
    "AutoGen",
    "Microsoft's open-source framework for multi-agent conversations — fully autonomous or human-in-the-loop patterns",
    "Agents communicate with each other in structured chats to solve tasks. Conversation-centric agent model differs from CrewAI's role/task model and Ruflo's swarm model. Integrates with Mem0 for memory and personalization.",
    "orchestration",
    {
      url: "https://github.com/microsoft/autogen",
      tags: ["microsoft", "conversational-agents", "multi-agent", "human-in-loop"],
      isLLMBased: true,
      integrationNotes: "Consumes any OpenAI-compatible API. Its conversation-centric model is particularly good when agent collaboration requires debate/consensus rather than sequential handoff.",
      permissions: [
        { level: "network", description: "Model API calls" },
        { level: "none", description: "No filesystem access by default" },
      ],
    },
  ),

  // ── §6.9 Stagehand ─────────────────────────────────────────────────────────
  entry(
    "stagehand",
    "Stagehand",
    "AI web browsing framework — act, extract, observe APIs on Playwright; caches repeatable actions for zero-token reruns",
    "Compatible with Playwright, offering AI-driven act/extract/observe APIs layered on top of the base Page class. Key throughput feature: cached Stagehand actions consume zero inference tokens on repeat runs, only re-invoking AI when the target site changes.",
    "browser-automation",
    {
      url: "https://github.com/nicholasgriffintn/stagehand",
      tags: ["browser", "playwright", "caching", "self-healing", "web-automation"],
      isLLMBased: true,
      integrationNotes: "Directly relevant to throughput (§4): Stagehand's action caching is a concrete instance of the principle that the biggest throughput wins come from not calling the model at all for repeated inputs.",
      permissions: [
        { level: "network", description: "HTTP requests via Playwright browser" },
        { level: "write-fs", description: "Action cache storage" },
      ],
    },
  ),

  // ── §6.10 Firecrawl ────────────────────────────────────────────────────────
  entry(
    "firecrawl",
    "Firecrawl",
    "Web context API — scrape, extract, convert pages to clean Markdown; 5–10x token reduction vs raw HTML",
    "Handles JavaScript-heavy pages, proxies, and rate limits automatically. A raw HTML page runs 10,000–50,000 tokens while Firecrawl's cleaned markdown is typically 1,000–5,000 tokens — a 5–10x reduction. This is a direct throughput lever: reducing the token cost of getting web content into an agent's context.",
    "web-scraping",
    {
      url: "https://github.com/mendableai/firecrawl",
      tags: ["scraping", "web-content", "markdown", "token-reduction", "proxy"],
      isLLMBased: false,
      integrationNotes: "Reduces input tokens for any downstream model call. Compounds with every other optimization in the system rather than competing with them.",
      permissions: [
        { level: "network", description: "HTTP requests to target websites, proxy usage" },
        { level: "none", description: "Returns cleaned content, no persistent storage" },
      ],
    },
  ),

  // ── §6.11 LobeChat ─────────────────────────────────────────────────────────
  entry(
    "lobechat",
    "LobeChat",
    "Open-source, self-hostable AI chat framework — multi-model support, plugin/tool extensions, knowledge base integration",
    "A customizable front-end for interacting with various LLMs. Distinct from every other tool in this section, which operate at orchestration, memory, or data-ingestion layers — LobeChat operates at the interface layer.",
    "chat-interface",
    {
      url: "https://github.com/lobehub/lobe-chat",
      tags: ["chat", "interface", "self-hostable", "multi-model", "plugins"],
      isLLMBased: true,
      integrationNotes: "Can be configured to use our inference router as its model backend, providing a polished chat UI for any tool's outputs.",
      permissions: [
        { level: "network", description: "Model API calls" },
        { level: "write-fs", description: "Conversation storage, plugin cache" },
      ],
    },
  ),

  // ── §6.13 anime.js ─────────────────────────────────────────────────────────
  entry(
    "animejs",
    "anime.js",
    "Fast, flexible JavaScript animation library — CSS, SVG, DOM attributes, Scroll Observer, Stagger, SVG motion-path, Draggable, Timeline",
    "Lightweight, dependency-free animation library for agents generating or editing web UI. Provides motion capabilities without importing a heavier framework-specific library.",
    "animation",
    {
      url: "https://github.com/juliangarnier/anime",
      tags: ["animation", "css", "svg", "scroll", "timeline", "lightweight"],
      isLLMBased: false,
      integrationNotes: "Relevant for coding agents producing landing pages, dashboards, or apps that need motion. Zero runtime dependencies.",
      permissions: [{ level: "none", description: "Pure client-side JS library" }],
    },
  ),

  // ── §6.14 Motion ───────────────────────────────────────────────────────────
  entry(
    "motion",
    "Motion",
    "React/Vue animation library — Web Animations API + ScrollTimeline, spring physics, gesture tracking, AI Kit for agent consumption",
    "Hybrid engine runs animations via Web Animations API and ScrollTimeline for high frame-rate performance, falling back to JS for spring physics and gesture tracking. Ships an 'AI Kit' that feeds docs, examples, and design tokens directly to coding agents.",
    "animation",
    {
      url: "https://github.com/motiondivision/motion",
      tags: ["animation", "react", "vue", "spring", "scroll", "ai-kit"],
      isLLMBased: false,
      integrationNotes: "Built with agent consumption in mind via its AI Kit — a natural harness-store entry for agents building React/Vue interfaces.",
      permissions: [{ level: "none", description: "Client-side library" }],
    },
  ),

  // ── §6.15 Additional entries ────────────────────────────────────────────────

  // LangChain / LangGraph
  entry(
    "langchain",
    "LangChain / LangGraph",
    "Low-level orchestration primitives for chaining LLM calls, tools, and state machines — the foundation other frameworks build on",
    "The most widely adopted orchestration primitives. Ruflo, CrewAI, and AutoGen all assume something like LangChain underneath. Users building custom orchestration rather than adopting a pre-built framework reach for this layer directly.",
    "orchestration",
    {
      url: "https://github.com/langchain-ai/langchain",
      tags: ["orchestration", "chains", "state-machine", "primitives", "foundational"],
      isLLMBased: true,
      integrationNotes: "Foundation layer for custom orchestration. Other catalog entries (Ruflo, CrewAI) may use LangChain primitives internally.",
      permissions: [
        { level: "network", description: "Model API calls, tool API calls" },
        { level: "write-fs", description: "Cache and state persistence" },
      ],
    },
  ),

  // Ollama
  entry(
    "ollama",
    "Ollama",
    "Local model-serving with pull/run interface and REST API — wraps llama.cpp with convenience layer for model management",
    "Friendly on-ramp to local GGUF inference. Provides model acquisition and serving convenience without directly managing llama.cpp's build/quantization details. Sits between our inference router and the user for simpler setup.",
    "serving",
    {
      url: "https://github.com/ollama/ollama",
      tags: ["serving", "local", "gguf", "rest-api", "model-management"],
      isLLMBased: false,
      integrationNotes: "Alternative to directly managing llama.cpp. Our inference router can detect Ollama's local server and route to it as a backend.",
      permissions: [
        { level: "network", description: "REST API on localhost, optional model pulls" },
        { level: "write-fs", description: "Model file storage" },
      ],
    },
  ),

  // vLLM
  entry(
    "vllm",
    "vLLM",
    "High-throughput inference server — continuous batching, paged attention, serves multiple concurrent agent sessions",
    "The natural choice when tools need to serve multiple simultaneous agent sessions from one backend server. Optimized for throughput via continuous batching and paged attention, unlike single-user local inference.",
    "serving",
    {
      url: "https://github.com/vllm-project/vllm",
      tags: ["serving", "throughput", "batching", "paged-attention", "multi-user"],
      isLLMBased: false,
      integrationNotes: "Best for server deployment where multiple agents share one GPU. Our inference router detects vLLM servers and routes multi-session workloads to them.",
      permissions: [
        { level: "network", description: "REST API, model serving" },
        { level: "write-fs", description: "Model storage, KV-cache swap space" },
      ],
    },
  ),

  // Langfuse
  entry(
    "langfuse",
    "Langfuse",
    "Open-source LLM observability and tracing — step-by-step tracking of multi-tool agent runs",
    "Purpose-built for step-by-step tracing of what an agent actually did across a multi-tool run. Fills the observability gap in the catalog — backend/quality transparency doesn't cover multi-step debugging.",
    "observability",
    {
      url: "https://github.com/langfuse/langfuse",
      tags: ["observability", "tracing", "debugging", "logging", "monitoring"],
      isLLMBased: false,
      integrationNotes: "Can instrument any catalog tool's execution to provide full trace visibility. Complements our self-improvement system with objective performance data.",
      permissions: [
        { level: "network", description: "Sends traces to Langfuse server" },
        { level: "write-fs", description: "Local trace buffer" },
      ],
    },
  ),

  // n8n
  entry(
    "n8n",
    "n8n",
    "General workflow automation with native AI/LLM nodes — webhooks, scheduled jobs, arbitrary API integrations",
    "Complements Dify by covering broader non-LLM automation. While Dify focuses on LLM workflows, n8n handles webhooks, scheduled jobs, and arbitrary API integrations that a Dify-style tool doesn't cover.",
    "workflow",
    {
      url: "https://github.com/n8n-io/n8n",
      tags: ["workflow", "automation", "webhooks", "scheduled", "api-integration"],
      isLLMBased: true,
      integrationNotes: "Covers the non-LLM automation gap. Can trigger catalog tools via webhook and consume our inference router for its AI nodes.",
      permissions: [
        { level: "network", description: "Webhooks, API calls, scheduled triggers" },
        { level: "write-fs", description: "Workflow storage, execution logs" },
      ],
    },
  ),

  // ── Stagehand cache note ───────────────────────────────────────────────────
  entry(
    "stagehand-cache",
    "Stagehand Action Cache",
    "Caches repeatable browser automations — first run uses AI inference, subsequent runs replay deterministic actions with zero token cost",
    "A dedicated entry for Stagehand's most valuable feature in this harness: action caching. First run generates the automation via AI, subsequent runs replay the cached actions without inference, only re-invoking AI when the target site changes.",
    "browser-automation",
    {
      url: "https://github.com/nicholasgriffintn/stagehand",
      tags: ["caching", "zero-token", "deterministic", "replay"],
      isLLMBased: false,
      integrationNotes: "The most concrete throughput win in the catalog: cached actions consume zero tokens on repeat runs.",
      permissions: [
        { level: "write-fs", description: "Action cache storage" },
        { level: "network", description: "HTTP replay of cached requests" },
      ],
    },
  ),
];

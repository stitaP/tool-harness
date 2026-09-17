/**
 * stitaP Tool Store — Server & Legacy Hardware Tools
 */

import type { ToolManifest } from "../tool-types";

const CAP = (name: string, description: string) => ({
  name,
  description,
  requiresBrowser: false,
  requiresNetwork: false,
  offline: true,
});

export const SERVER_TOOLS: ToolManifest[] = [
  {
    id: "server.hardware-detect",
    name: "Hardware Detection",
    description:
      "Detect CPU features (ISA, cores, cache), memory (size, type, speed), and storage on the current machine or a remote server via SSH probe. Generates a complete hardware profile for build optimization.",
    category: "server",
    tags: ["hardware", "cpuid", "memory", "detection"],
    slmFriendly: true,
    version: "0.1.0",
    author: "stitaP",
    license: "MIT",
    icon: "Cpu",
    color: "#10b981",
    parameters: [
      { name: "action", type: "enum", description: "detect-local, generate-probe, parse-probe", required: true, enum: ["detect-local", "generate-probe", "parse-probe"] },
      { name: "probeOutput", type: "string", description: "SSH probe output text (for parse-probe action).", required: false },
    ],
    capabilities: [
      CAP("Detect CPU ISA features", "Reads /proc/cpuinfo for SSE/SSE2/SSE3/AVX flags"),
      CAP("Detect memory configuration", "Reads /proc/meminfo and dmidecode"),
      CAP("Generate SSH probe script", "Outputs a bash script for remote servers"),
      CAP("Parse remote probe output", "Parses SSH probe into HardwareProfile"),
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "server.legacy-hardware-db",
    name: "Legacy Server Database",
    description:
      "Query the database of pre-2008 enterprise servers (Dell PowerEdge, HP ProLiant, IBM xSeries, Sun Fire, Supermicro). ~3 million estimated in the field.",
    category: "server",
    tags: ["legacy", "hardware", "database", "servers"],
    slmFriendly: true,
    version: "0.1.0",
    author: "stitaP",
    license: "MIT",
    icon: "Server",
    color: "#8b5cf6",
    parameters: [
      { name: "action", type: "enum", description: "list-all, query, best-rag, report", required: true, enum: ["list-all", "query", "best-rag", "report"] },
      { name: "maxYear", type: "number", description: "Filter: maximum release year.", required: false },
      { name: "minRAMGB", type: "number", description: "Filter: minimum max RAM in GB.", required: false },
      { name: "manufacturer", type: "string", description: "Filter: Dell, HP, IBM, Sun, Supermicro.", required: false },
    ],
    capabilities: [
      CAP("Query legacy servers", "Filter 20+ pre-2008 server models"),
      CAP("Rank RAG viability", "Score servers 1-10 for RAG deployment"),
      CAP("CPU feature mapping", "Map servers to ISA features and build targets"),
      CAP("Model recommendations", "Suggest GGUF model and quantization per server"),
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "server.build-optimizer",
    name: "llama.cpp Build Optimizer",
    description:
      "Generates exact cmake flags, compile options, quantization, and runtime config to build llama.cpp for pre-AVX hardware. Solves SIGILL crashes on SSE-only machines.",
    category: "server",
    tags: ["llama.cpp", "build", "optimization", "compile", "legacy", "sigill"],
    slmFriendly: false,
    version: "0.1.0",
    author: "stitaP",
    license: "MIT",
    icon: "Wrench",
    color: "#f59e0b",
    parameters: [
      { name: "action", type: "enum", description: "build-plan, build-config, model-recommendations", required: true, enum: ["build-plan", "build-config", "model-recommendations"] },
      { name: "serverModel", type: "string", description: "Legacy server model name (e.g., 'ProLiant DL380 G5').", required: false },
    ],
    capabilities: [
      CAP("Generate SSE/SSE2/SSE3/SSSE3 cmake flags", "Exact -march, -DGGML_AVX=OFF flags"),
      CAP("Optimize thread count for NUMA", "Dual-socket FSB bottleneck awareness"),
      CAP("Select quantization by RAM", "Q4_0 for 4GB, Q4_K_S for 8GB, Q4_K_M for 16GB+"),
      CAP("Estimate tokens/second", "Predicts TPS for 0.3B, 0.5B, 1.5B models"),
      CAP("Generate run commands", "Full llama-server invocation with all flags"),
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "server.rag-deploy",
    name: "RAG Server Deployment Kit",
    description:
      "Complete deployment plan: OS selection, llama.cpp build, vector DB, document ingestion, nginx, systemd services, and monitoring for pre-2008 servers.",
    category: "server",
    tags: ["rag", "deployment", "chatbot", "legacy", "server"],
    slmFriendly: false,
    version: "0.1.0",
    author: "stitaP",
    license: "MIT",
    icon: "Rocket",
    color: "#06b6d4",
    parameters: [
      { name: "action", type: "enum", description: "full-plan, deployment-script, performance-estimate, summary", required: true, enum: ["full-plan", "deployment-script", "performance-estimate", "summary"] },
      { name: "serverModel", type: "string", description: "Legacy server model name to deploy on.", required: false },
    ],
    capabilities: [
      CAP("Generate OS recommendation", "Debian/Alpine/Ubuntu based on RAM"),
      CAP("Generate vector DB config", "sqlite-vss for 4GB, ChromaDB for 8GB+"),
      CAP("Generate deployment script", "Bash with systemd, nginx, swap setup"),
      CAP("Estimate performance", "Cold start, query latency, max users"),
      CAP("Generate RAG API server", "FastAPI bridging llama.cpp + ChromaDB"),
    ],
    installs: 0,
    rating: 0,
    ratingCount: 0,
    updatedAt: new Date().toISOString(),
  },
];

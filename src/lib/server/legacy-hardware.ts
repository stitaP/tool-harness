/**
 * stitaP Legacy Server Hardware Database
 *
 * Comprehensive database of pre-2008 enterprise servers that companies still
 * have in their data centres. Each entry includes exact CPU specifications,
 * supported ISA features (SSE, SSE2, SSE3, SSE4, AVX, etc.), maximum RAM,
 * and recommended llama.cpp build configuration.
 *
 * Why this matters:
 * Millions of pre-2008 servers sit idle in corporate data centres.
 * Most support at least 4-16 GB RAM and dual-core Xeons/Opterons.
 * With a properly compiled llama.cpp fork, these servers can run
 * 1-3B parameter RAG chatbot models at 2-10 tokens/second — enough
 * for internal help-desk, documentation search, and ticket triage.
 *
 * The key insight: AVX was introduced with Intel Nehalem (2008) and
 * AMD Bulldozer (2011). Pre-2008 CPUs have SSE/SSE2/SSE3 at best.
 * Stock llama.cpp defaults to AVX2 which crashes with SIGILL on these
 * machines. A custom build targeting SSE-only or SSE2-only produces
 * a working binary.
 */

// ─── ISA Feature Flags ──────────────────────────────────────────────────────

export type ISAFeature =
  | "sse"
  | "sse2"
  | "sse3"
  | "ssse3"
  | "sse4.1"
  | "sse4.2"
  | "avx"
  | "avx2"
  | "avx512f"
  | "avx512vl"
  | "fma"
  | "f16c"
  | "popcnt"
  | "lzcnt"
  | "bmi"
  | "bmi2"
  | "aes"
  | "pclmul"
  | "vaes";

export interface CPUModel {
  name: string;
  vendor: "intel" | "amd";
  /** Microarchitecture code name */
  microarchitecture: string;
  /** Launch year */
  year: number;
  /** Number of physical cores */
  cores: number;
  /** Base clock in GHz */
  baseClockGHz: number;
  /** Maximum clock in GHz (turbo/boost) */
  maxClockGHz: number;
  /** L2 cache in KB */
  l2CacheKB: number;
  /** L3 cache in KB (0 if none) */
  l3CacheKB: number;
  /** FSB in MHz */
  fsbMHz: number;
  /** Supported ISA features */
  isaFeatures: ISAFeature[];
  /** Instruction set generation for build targeting */
  buildTarget: "sse" | "sse2" | "sse3" | "ssse3" | "sse4.1" | "avx" | "avx2" | "avx512";
  /** Max physical address width in bits */
  maxAddressBits: number;
}

export interface ServerModel {
  /** Common marketing name */
  name: string;
  /** Manufacturer */
  manufacturer: "Dell" | "HP" | "IBM" | "Sun" | "Fujitsu" | "Toshiba" | "Supermicro" | "NEC" | "Unisys" | "Gateway" | "Appro";
  /** Product line */
  line: string;
  /** Release year */
  year: number;
  /** Form factor */
  formFactor: "1U" | "2U" | "4U" | "tower" | "blade" | "SFF";
  /** CPU slot type */
  socket: string;
  /** Maximum number of CPU sockets */
  maxSockets: number;
  /** Supported CPUs (by name reference) */
  cpus: string[];
  /** Minimum RAM in GB */
  minRAMGB: number;
  /** Maximum RAM in GB */
  maxRAMGB: number;
  /** RAM type */
  ramType: "DDR" | "DDR2" | "DDR3" | "FB-DIMM" | "RDRAM";
  /** Maximum RAM speed in MHz */
  ramSpeedMHz: number;
  /** ECC support */
  ecc: boolean;
  /** RAID controller */
  raidController: string;
  /** Network interfaces */
  network: string[];
  /** Remote management */
  management: string;
  /** Power consumption in watts (typical) */
  typicalPowerW: number;
  /** Physical dimensions notes */
  dimensions: string;
  /** Suggested RAG model size based on max RAM */
  suggestedModel: string;
  /** Suggested quantization level */
  suggestedQuant: string;
  /** Estimated tokens/second for 1.5B model */
  estimatedTPS: number;
  /** Overall RAG viability rating 1-10 */
  ragViability: number;
  /** Notes about quirks or limitations */
  notes: string;
}

// ─── CPU Database ───────────────────────────────────────────────────────────

export const CPU_DATABASE: Record<string, CPUModel> = {
  // ── Intel NetBurst (Pentium 4 / Xeon) ──
  "xeon-prestonia": {
    name: "Xeon Prestonia (DP)",
    vendor: "intel",
    microarchitecture: "NetBurst",
    year: 2002,
    cores: 1,
    baseClockGHz: 2.0,
    maxClockGHz: 2.8,
    l2CacheKB: 512,
    l3CacheKB: 0,
    fsbMHz: 533,
    isaFeatures: ["sse", "sse2"],
    buildTarget: "sse2",
    maxAddressBits: 36,
  },
  "xeon-gallatin": {
    name: "Xeon Gallatin (MP)",
    vendor: "intel",
    microarchitecture: "NetBurst",
    year: 2003,
    cores: 1,
    baseClockGHz: 2.0,
    maxClockGHz: 3.0,
    l2CacheKB: 512,
    l3CacheKB: 2048,
    fsbMHz: 533,
    isaFeatures: ["sse", "sse2"],
    buildTarget: "sse2",
    maxAddressBits: 36,
  },
  "xeon-nocona": {
    name: "Xeon Nocona (64-bit)",
    vendor: "intel",
    microarchitecture: "NetBurst",
    year: 2004,
    cores: 1,
    baseClockGHz: 2.8,
    maxClockGHz: 3.6,
    l2CacheKB: 1024,
    l3CacheKB: 0,
    fsbMHz: 800,
    isaFeatures: ["sse", "sse2", "sse3"],
    buildTarget: "sse3",
    maxAddressBits: 40,
  },
  "xeon-irwindale": {
    name: "Xeon Irwindale",
    vendor: "intel",
    microarchitecture: "NetBurst",
    year: 2005,
    cores: 1,
    baseClockGHz: 2.8,
    maxClockGHz: 3.6,
    l2CacheKB: 2048,
    l3CacheKB: 0,
    fsbMHz: 800,
    isaFeatures: ["sse", "sse2", "sse3"],
    buildTarget: "sse3",
    maxAddressBits: 40,
  },
  "pentium-d-800": {
    name: "Pentium D 800-series",
    vendor: "intel",
    microarchitecture: "NetBurst (Presler)",
    year: 2006,
    cores: 2,
    baseClockGHz: 2.8,
    maxClockGHz: 3.6,
    l2CacheKB: 2048,
    l3CacheKB: 0,
    fsbMHz: 800,
    isaFeatures: ["sse", "sse2", "sse3"],
    buildTarget: "sse3",
    maxAddressBits: 40,
  },

  // ── Intel Core (Nehalem / Penryn) — cusp of pre-2008 ──
  "xeon-5100-woodcrest": {
    name: "Xeon 5100 (Woodcrest)",
    vendor: "intel",
    microarchitecture: "Core",
    year: 2006,
    cores: 2,
    baseClockGHz: 1.6,
    maxClockGHz: 3.0,
    l2CacheKB: 4096,
    l3CacheKB: 0,
    fsbMHz: 1333,
    isaFeatures: ["sse", "sse2", "sse3", "ssse3", "f16c"],
    buildTarget: "ssse3",
    maxAddressBits: 40,
  },
  "xeon-5300-clovertown": {
    name: "Xeon 5300 (Clovertown)",
    vendor: "intel",
    microarchitecture: "Core",
    year: 2006,
    cores: 4,
    baseClockGHz: 1.6,
    maxClockGHz: 3.0,
    l2CacheKB: 4096,
    l3CacheKB: 0,
    fsbMHz: 1333,
    isaFeatures: ["sse", "sse2", "sse3", "ssse3", "f16c"],
    buildTarget: "ssse3",
    maxAddressBits: 40,
  },
  "xeon-5400-harpertown": {
    name: "Xeon 5400 (Harpertown)",
    vendor: "intel",
    microarchitecture: "Core (Penryn)",
    year: 2007,
    cores: 4,
    baseClockGHz: 2.0,
    maxClockGHz: 3.2,
    l2CacheKB: 6144,
    l3CacheKB: 0,
    fsbMHz: 1333,
    isaFeatures: ["sse", "sse2", "sse3", "ssse3", "sse4.1", "f16c"],
    buildTarget: "sse4.1",
    maxAddressBits: 40,
  },
  "xeon-7300-tigerton": {
    name: "Xeon 7300 (Tigerton)",
    vendor: "intel",
    microarchitecture: "Core (Clovertown)",
    year: 2007,
    cores: 4,
    baseClockGHz: 1.6,
    maxClockGHz: 2.4,
    l2CacheKB: 4096,
    l3CacheKB: 0,
    fsbMHz: 1066,
    isaFeatures: ["sse", "sse2", "sse3", "ssse3"],
    buildTarget: "ssse3",
    maxAddressBits: 40,
  },

  // ── AMD Opteron (K8 / Barcelona) ──
  "opteron-240-248": {
    name: "Opteron 240-248 (SledgeHammer)",
    vendor: "amd",
    microarchitecture: "K8",
    year: 2003,
    cores: 1,
    baseClockGHz: 1.4,
    maxClockGHz: 2.2,
    l2CacheKB: 1024,
    l3CacheKB: 0,
    fsbMHz: 400,
    isaFeatures: ["sse", "sse2"],
    buildTarget: "sse2",
    maxAddressBits: 40,
  },
  "opteron-250-252": {
    name: "Opteron 250-252 (Venus/Troy)",
    vendor: "amd",
    microarchitecture: "K8",
    year: 2005,
    cores: 1,
    baseClockGHz: 1.6,
    maxClockGHz: 2.6,
    l2CacheKB: 1024,
    l3CacheKB: 0,
    fsbMHz: 400,
    isaFeatures: ["sse", "sse2", "sse3"],
    buildTarget: "sse3",
    maxAddressBits: 40,
  },
  "opteron-265-275": {
    name: "Opteron 265-275 (Italy/Egypt)",
    vendor: "amd",
    microarchitecture: "K8",
    year: 2005,
    cores: 2,
    baseClockGHz: 1.8,
    maxClockGHz: 2.2,
    l2CacheKB: 1024,
    l3CacheKB: 0,
    fsbMHz: 400,
    isaFeatures: ["sse", "sse2", "sse3"],
    buildTarget: "sse3",
    maxAddressBits: 40,
  },
  "opteron-2210-2218": {
    name: "Opteron 2200-series (Santa Rosa)",
    vendor: "amd",
    microarchitecture: "K8",
    year: 2006,
    cores: 2,
    baseClockGHz: 1.8,
    maxClockGHz: 2.6,
    l2CacheKB: 1024,
    l3CacheKB: 0,
    fsbMHz: 400,
    isaFeatures: ["sse", "sse2", "sse3"],
    buildTarget: "sse3",
    maxAddressBits: 40,
  },
  "opteron-2300-2350": {
    name: "Opteron 2300-series (Barcelona)",
    vendor: "amd",
    microarchitecture: "K10",
    year: 2007,
    cores: 4,
    baseClockGHz: 1.7,
    maxClockGHz: 2.0,
    l2CacheKB: 2048,
    l3CacheKB: 2048,
    fsbMHz: 400,
    isaFeatures: ["sse", "sse2", "sse3", "ssse3"],
    buildTarget: "ssse3",
    maxAddressBits: 48,
  },
  "opteron-2347-he": {
    name: "Opteron 2347 HE (Barcelona)",
    vendor: "amd",
    microarchitecture: "K10",
    year: 2008,
    cores: 4,
    baseClockGHz: 1.9,
    maxClockGHz: 1.9,
    l2CacheKB: 2048,
    l3CacheKB: 2048,
    fsbMHz: 400,
    isaFeatures: ["sse", "sse2", "sse3", "ssse3"],
    buildTarget: "ssse3",
    maxAddressBits: 48,
  },
};

// ─── Server Database ────────────────────────────────────────────────────────

export const SERVER_DATABASE: ServerModel[] = [
  // ═══ DELL POWEREDGE ═══
  {
    name: "PowerEdge 1850",
    manufacturer: "Dell",
    line: "PowerEdge",
    year: 2004,
    formFactor: "1U",
    socket: "LGA775",
    maxSockets: 2,
    cpus: ["xeon-nocona", "xeon-irwindale"],
    minRAMGB: 0.5,
    maxRAMGB: 16,
    ramType: "DDR2",
    ramSpeedMHz: 400,
    ecc: true,
    raidController: "PERC 4/DC (LSI Logic)",
    network: ["2x Broadcom BCM5721 GbE"],
    management: "DRAC 4/P",
    typicalPowerW: 450,
    dimensions: "1U, 17.2 x 26.4 inches",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_0",
    estimatedTPS: 3.2,
    ragViability: 5,
    notes: "Very common in decommissioned data centres. 16 GB max limits models to 0.5-1B. SSE3 build required.",
  },
  {
    name: "PowerEdge 2850",
    manufacturer: "Dell",
    line: "PowerEdge",
    year: 2005,
    formFactor: "2U",
    socket: "LGA771",
    maxSockets: 2,
    cpus: ["xeon-nocona", "xeon-irwindale"],
    minRAMGB: 0.5,
    maxRAMGB: 16,
    ramType: "DDR2",
    ramSpeedMHz: 400,
    ecc: true,
    raidController: "PERC 4/DC",
    network: ["2x Broadcom BCM5721 GbE"],
    management: "DRAC 4/P",
    typicalPowerW: 550,
    dimensions: "2U, 17.2 x 26.4 inches",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_0",
    estimatedTPS: 3.0,
    ragViability: 5,
    notes: "2U workhorse. Dual NetBurst Xeons. 16 GB DDR2 max. Same SSE3 build as 1850.",
  },
  {
    name: "PowerEdge 2650",
    manufacturer: "Dell",
    line: "PowerEdge",
    year: 2003,
    formFactor: "2U",
    socket: "Socket 604",
    maxSockets: 2,
    cpus: ["xeon-prestonia", "xeon-gallatin"],
    minRAMGB: 0.25,
    maxRAMGB: 12,
    ramType: "DDR",
    ramSpeedMHz: 266,
    ecc: true,
    raidController: "PERC 3/DC",
    network: ["2x Intel Pro/1000 GbE"],
    management: "DRAC III",
    typicalPowerW: 500,
    dimensions: "2U",
    suggestedModel: "SmolLM2-135M",
    suggestedQuant: "Q4_0",
    estimatedTPS: 1.8,
    ragViability: 3,
    notes: "Very old. 12 GB DDR max, NetBurst Xeons are slow. Only viable for tiny models (135M-350M). SSE2-only build.",
  },
  {
    name: "PowerEdge 6850",
    manufacturer: "Dell",
    line: "PowerEdge",
    year: 2006,
    formFactor: "4U",
    socket: "LGA771",
    maxSockets: 4,
    cpus: ["xeon-5100-woodcrest", "xeon-5300-clovertown", "xeon-5400-harpertown"],
    minRAMGB: 1,
    maxRAMGB: 64,
    ramType: "FB-DIMM",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "PERC 5/E",
    network: ["2x Broadcom BCM5708 GbE"],
    management: "DRAC 5",
    typicalPowerW: 900,
    dimensions: "4U, rackmount",
    suggestedModel: "Qwen2.5-1.5B",
    suggestedQuant: "Q4_K_M",
    estimatedTPS: 6.5,
    ragViability: 7,
    notes: "Quad-socket with up to 64 GB FB-DIMM. Excellent for RAG — 1.5B model with room for OS. Power-hungry (900W typical). SSSE3 or SSE4.1 build depending on CPU generation.",
  },
  {
    name: "PowerEdge 1950",
    manufacturer: "Dell",
    line: "PowerEdge",
    year: 2006,
    formFactor: "1U",
    socket: "LGA771",
    maxSockets: 2,
    cpus: ["xeon-5100-woodcrest", "xeon-5300-clovertown"],
    minRAMGB: 0.5,
    maxRAMGB: 32,
    ramType: "FB-DIMM",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "PERC 5/i",
    network: ["2x Broadcom BCM5708 GbE"],
    management: "DRAC 5",
    typicalPowerW: 500,
    dimensions: "1U",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_K_S",
    estimatedTPS: 4.0,
    ragViability: 6,
    notes: "Common 1U dual-core. 32 GB FB-DIMM max. Good for 0.5B models. SSSE3 build.",
  },
  {
    name: "PowerEdge 2950",
    manufacturer: "Dell",
    line: "PowerEdge",
    year: 2006,
    formFactor: "2U",
    socket: "LGA771",
    maxSockets: 2,
    cpus: ["xeon-5100-woodcrest", "xeon-5300-clovertown", "xeon-5400-harpertown"],
    minRAMGB: 0.5,
    maxRAMGB: 64,
    ramType: "FB-DIMM",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "PERC 6/i",
    network: ["2x Broadcom BCM5708 GbE"],
    management: "DRAC 5",
    typicalPowerW: 650,
    dimensions: "2U",
    suggestedModel: "Qwen2.5-1.5B",
    suggestedQuant: "Q4_K_M",
    estimatedTPS: 6.0,
    ragViability: 7,
    notes: "Extremely common 2U. 64 GB FB-DIMM supports 1.5B models. Harpertown quad-core is the sweet spot. SSSE3 or SSE4.1 build.",
  },
  {
    name: "PowerEdge T300",
    manufacturer: "Dell",
    line: "PowerEdge",
    year: 2007,
    formFactor: "tower",
    socket: "LGA775",
    maxSockets: 1,
    cpus: ["pentium-d-800", "xeon-5400-harpertown"],
    minRAMGB: 0.25,
    maxRAMGB: 8,
    ramType: "DDR2",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "SAS 6/iR",
    network: ["1x Broadcom BCM5721 GbE"],
    management: "None",
    typicalPowerW: 300,
    dimensions: "Tower",
    suggestedModel: "SmolLM2-135M",
    suggestedQuant: "Q4_0",
    estimatedTPS: 1.5,
    ragViability: 3,
    notes: "Single-socket tower. Only 8 GB max. Very limited but quiet enough for a desk-side RAG kiosk with a tiny model.",
  },

  // ═══ HP PROLIANT ═══
  {
    name: "ProLiant DL360 G4",
    manufacturer: "HP",
    line: "ProLiant",
    year: 2004,
    formFactor: "1U",
    socket: "Socket 604",
    maxSockets: 2,
    cpus: ["xeon-nocona", "xeon-irwindale"],
    minRAMGB: 0.25,
    maxRAMGB: 16,
    ramType: "DDR2",
    ramSpeedMHz: 400,
    ecc: true,
    raidController: "Smart Array 6i",
    network: ["2x NC7782 GbE"],
    management: "iLO 2",
    typicalPowerW: 450,
    dimensions: "1U, 1.7 x 17.5 x 26.1 inches",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_0",
    estimatedTPS: 3.0,
    ragViability: 5,
    notes: "HP's most common pre-2008 1U. iLO 2 is excellent for headless management. 16 GB DDR2 max. SSE3 build.",
  },
  {
    name: "ProLiant DL380 G4",
    manufacturer: "HP",
    line: "ProLiant",
    year: 2004,
    formFactor: "2U",
    socket: "Socket 604",
    maxSockets: 2,
    cpus: ["xeon-nocona", "xeon-irwindale"],
    minRAMGB: 0.5,
    maxRAMGB: 16,
    ramType: "DDR2",
    ramSpeedMHz: 400,
    ecc: true,
    raidController: "Smart Array 6i",
    network: ["2x NC7782 GbE"],
    management: "iLO 2",
    typicalPowerW: 550,
    dimensions: "2U, 3.4 x 17.5 x 26.1 inches",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_0",
    estimatedTPS: 3.2,
    ragViability: 5,
    notes: "Extremely popular 2U. 16 GB limit is the constraint. Very reliable. Many still in closet storage.",
  },
  {
    name: "ProLiant DL360 G5",
    manufacturer: "HP",
    line: "ProLiant",
    year: 2006,
    formFactor: "1U",
    socket: "LGA771",
    maxSockets: 2,
    cpus: ["xeon-5100-woodcrest", "xeon-5300-clovertown"],
    minRAMGB: 0.5,
    maxRAMGB: 32,
    ramType: "FB-DIMM",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "Smart Array E200i",
    network: ["2x NC373i GbE"],
    management: "iLO 2",
    typicalPowerW: 500,
    dimensions: "1U",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_K_S",
    estimatedTPS: 4.2,
    ragViability: 6,
    notes: "Good 1U with 32 GB FB-DIMM. Core microarchitecture is much faster per-clock than NetBurst. SSSE3 build.",
  },
  {
    name: "ProLiant DL380 G5 (Quad-Core)",
    manufacturer: "HP",
    line: "ProLiant",
    year: 2007,
    formFactor: "2U",
    socket: "LGA771",
    maxSockets: 2,
    cpus: ["xeon-5400-harpertown"],
    minRAMGB: 1,
    maxRAMGB: 64,
    ramType: "FB-DIMM",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "Smart Array P400",
    network: ["2x NC373i GbE"],
    management: "iLO 2",
    typicalPowerW: 600,
    dimensions: "2U",
    suggestedModel: "Qwen2.5-1.5B",
    suggestedQuant: "Q4_K_M",
    estimatedTPS: 6.5,
    ragViability: 7,
    notes: "Quad-core Harpertown with 64 GB. This is the SWEET SPOT for pre-2008 RAG servers. Enough RAM for 1.5B model + vector DB.",
  },
  {
    name: "ProLiant ML350 G5",
    manufacturer: "HP",
    line: "ProLiant",
    year: 2006,
    formFactor: "tower",
    socket: "LGA771",
    maxSockets: 2,
    cpus: ["xeon-5100-woodcrest", "xeon-5300-clovertown"],
    minRAMGB: 0.5,
    maxRAMGB: 48,
    ramType: "FB-DIMM",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "Smart Array P400",
    network: ["2x NC326i GbE"],
    management: "iLO 2",
    typicalPowerW: 500,
    dimensions: "Tower, 10.5 x 17.5 x 24.5 inches",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_K_S",
    estimatedTPS: 4.0,
    ragViability: 6,
    notes: "Tower form factor — good for office-deployed RAG kiosk. Quieter than rackmount. 48 GB max.",
  },
  {
    name: "ProLiant DL580 G4",
    manufacturer: "HP",
    line: "ProLiant",
    year: 2005,
    formFactor: "4U",
    socket: "Socket 604",
    maxSockets: 4,
    cpus: ["xeon-irwindale", "xeon-5100-woodcrest"],
    minRAMGB: 1,
    maxRAMGB: 64,
    ramType: "DDR2",
    ramSpeedMHz: 400,
    ecc: true,
    raidController: "Smart Array 6402",
    network: ["2x NC7782 GbE"],
    management: "iLO 2",
    typicalPowerW: 850,
    dimensions: "4U",
    suggestedModel: "Qwen2.5-1.5B",
    suggestedQuant: "Q4_K_M",
    estimatedTPS: 5.5,
    ragViability: 6,
    notes: "Quad-socket beast. 64 GB DDR2. Power-hungry but lots of compute. Good for batch RAG processing.",
  },

  // ═══ IBM xSeries ═══
  {
    name: "xSeries 346",
    manufacturer: "IBM",
    line: "xSeries",
    year: 2004,
    formFactor: "2U",
    socket: "Socket 604",
    maxSockets: 2,
    cpus: ["xeon-nocona", "xeon-irwindale"],
    minRAMGB: 0.25,
    maxRAMGB: 16,
    ramType: "DDR2",
    ramSpeedMHz: 400,
    ecc: true,
    raidController: "ServeRAID 6M",
    network: ["2x Broadcom BCM5721 GbE"],
    management: "BMC",
    typicalPowerW: 550,
    dimensions: "2U",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_0",
    estimatedTPS: 3.0,
    ragViability: 5,
    notes: "Solid IBM build quality. 16 GB DDR2 max. BMC management is basic but functional. SSE3 build.",
  },
  {
    name: "xSeries 366",
    manufacturer: "IBM",
    line: "xSeries",
    year: 2005,
    formFactor: "4U",
    socket: "Socket 604",
    maxSockets: 4,
    cpus: ["xeon-gallatin", "xeon-5100-woodcrest"],
    minRAMGB: 1,
    maxRAMGB: 64,
    ramType: "DDR2",
    ramSpeedMHz: 400,
    ecc: true,
    raidController: "ServeRAID 7k",
    network: ["2x BCM5706 GbE"],
    management: "BMC + RSA II",
    typicalPowerW: 800,
    dimensions: "4U",
    suggestedModel: "Qwen2.5-1.5B",
    suggestedQuant: "Q4_K_M",
    estimatedTPS: 5.0,
    ragViability: 6,
    notes: "Quad-socket with 64 GB. RSA II remote management. Good for RAG workloads if you can source FB-DIMMs.",
  },
  {
    name: "xSeries 3550",
    manufacturer: "IBM",
    line: "xSeries",
    year: 2007,
    formFactor: "1U",
    socket: "LGA771",
    maxSockets: 2,
    cpus: ["xeon-5100-woodcrest", "xeon-5300-clovertown", "xeon-5400-harpertown"],
    minRAMGB: 0.5,
    maxRAMGB: 32,
    ramType: "FB-DIMM",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "ServeRAID 8k",
    network: ["2x BCM5708 GbE"],
    management: "BMC + RSA II",
    typicalPowerW: 450,
    dimensions: "1U",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_K_S",
    estimatedTPS: 4.5,
    ragViability: 6,
    notes: "Late-era pre-2008 IBM. 32 GB FB-DIMM. Core architecture CPUs are fast. Good candidate. SSSE3 build.",
  },
  {
    name: "xSeries 3650",
    manufacturer: "IBM",
    line: "xSeries",
    year: 2007,
    formFactor: "2U",
    socket: "LGA771",
    maxSockets: 2,
    cpus: ["xeon-5300-clovertown", "xeon-5400-harpertown"],
    minRAMGB: 0.5,
    maxRAMGB: 64,
    ramType: "FB-DIMM",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "ServeRAID 8k",
    network: ["2x BCM5708 GbE"],
    management: "BMC + RSA II",
    typicalPowerW: 600,
    dimensions: "2U",
    suggestedModel: "Qwen2.5-1.5B",
    suggestedQuant: "Q4_K_M",
    estimatedTPS: 6.0,
    ragViability: 7,
    notes: "Excellent 2U. 64 GB with Harpertown quad-core. One of the best pre-2008 RAG candidates. SSSE3 build.",
  },

  // ═══ SUN FIRE ═══
  {
    name: "Sun Fire V20z",
    manufacturer: "Sun",
    line: "Sun Fire",
    year: 2004,
    formFactor: "1U",
    socket: "Socket 940",
    maxSockets: 2,
    cpus: ["opteron-240-248", "opteron-250-252"],
    minRAMGB: 0.5,
    maxRAMGB: 16,
    ramType: "DDR",
    ramSpeedMHz: 400,
    ecc: true,
    raidController: "LSI Logic RAID",
    network: ["2x Broadcom BCM5703 GbE"],
    management: "SC (System Controller)",
    typicalPowerW: 450,
    dimensions: "1U",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_0",
    estimatedTPS: 2.8,
    ragViability: 5,
    notes: "Sun's Opteron 1U. 16 GB DDR max. Opteron K8 is faster per-clock than NetBurst for integer workloads.",
  },
  {
    name: "Sun Fire V40z",
    manufacturer: "Sun",
    line: "Sun Fire",
    year: 2005,
    formFactor: "2U",
    socket: "Socket 940",
    maxSockets: 4,
    cpus: ["opteron-240-248", "opteron-250-252", "opteron-265-275"],
    minRAMGB: 1,
    maxRAMGB: 64,
    ramType: "DDR",
    ramSpeedMHz: 400,
    ecc: true,
    raidController: "LSI Logic MegaRAID",
    network: ["2x Broadcom BCM5703 GbE"],
    management: "SC (System Controller)",
    typicalPowerW: 750,
    dimensions: "2U",
    suggestedModel: "Qwen2.5-1.5B",
    suggestedQuant: "Q4_K_M",
    estimatedTPS: 5.0,
    ragViability: 6,
    notes: "Quad-Opteron with 64 GB. AMD64 with integrated memory controller = good memory bandwidth. DDR build.",
  },

  // ═══ SUPERMICRO ═══
  {
    name: "SuperServer 6015B-NT",
    manufacturer: "Supermicro",
    line: "SuperServer",
    year: 2006,
    formFactor: "1U",
    socket: "LGA771",
    maxSockets: 2,
    cpus: ["xeon-5100-woodcrest", "xeon-5300-clovertown"],
    minRAMGB: 0.5,
    maxRAMGB: 32,
    ramType: "FB-DIMM",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "LSI Logic SAS3041E",
    network: ["2x Intel Pro/1000 GbE"],
    management: "IPMI 2.0",
    typicalPowerW: 450,
    dimensions: "1U",
    suggestedModel: "Qwen2.5-0.5B",
    suggestedQuant: "Q4_K_S",
    estimatedTPS: 4.5,
    ragViability: 6,
    notes: "Whitebox server, very common in hosting. Good IPMI management. 32 GB max. SSSE3 build.",
  },
  {
    name: "SuperServer 2025B-NT",
    manufacturer: "Supermicro",
    line: "SuperServer",
    year: 2007,
    formFactor: "2U",
    socket: "LGA771",
    maxSockets: 2,
    cpus: ["xeon-5300-clovertown", "xeon-5400-harpertown"],
    minRAMGB: 1,
    maxRAMGB: 64,
    ramType: "FB-DIMM",
    ramSpeedMHz: 667,
    ecc: true,
    raidController: "LSI Logic MegaRAID SAS",
    network: ["2x Intel Pro/1000 GbE"],
    management: "IPMI 2.0",
    typicalPowerW: 600,
    dimensions: "2U",
    suggestedModel: "Qwen2.5-1.5B",
    suggestedQuant: "Q4_K_M",
    estimatedTPS: 6.0,
    ragViability: 7,
    notes: "Generic whitebox, parts easily available. 64 GB with Harpertown is the sweet spot. SSSE3 build.",
  },
];

// ─── Helper Functions ───────────────────────────────────────────────────────

/** Get servers filtered by criteria */
export function queryServers(filter: {
  maxYear?: number;
  minRAMGB?: number;
  minRagViability?: number;
  manufacturer?: string;
  maxPowerW?: number;
  formFactor?: string;
}): ServerModel[] {
  return SERVER_DATABASE.filter((s) => {
    if (filter.maxYear && s.year > filter.maxYear) return false;
    if (filter.minRAMGB && s.maxRAMGB < filter.minRAMGB) return false;
    if (filter.minRagViability && s.ragViability < filter.minRagViability) return false;
    if (filter.manufacturer && s.manufacturer !== filter.manufacturer) return false;
    if (filter.maxPowerW && s.typicalPowerW > filter.maxPowerW) return false;
    if (filter.formFactor && s.formFactor !== filter.formFactor) return false;
    return true;
  });
}

/** Get the best pre-2008 servers for RAG deployment, sorted by viability */
export function getBestRAGServers(): (ServerModel & { cpu?: CPUModel })[] {
  return SERVER_DATABASE
    .filter((s) => s.year <= 2008)
    .sort((a, b) => b.ragViability - a.ragViability || b.maxRAMGB - a.maxRAMGB)
    .map((s) => ({
      ...s,
      cpu: CPU_DATABASE[s.cpus[s.cpus.length - 1]],
    }));
}

/** Get ISA features for a server by looking up its CPU */
export function getServerISAFeatures(server: ServerModel): ISAFeature[] {
  const cpuName = server.cpus[server.cpus.length - 1]; // newest supported CPU
  const cpu = CPU_DATABASE[cpuName];
  return cpu?.isaFeatures ?? [];
}

/** Get the highest build target across a server's supported CPUs */
export function getServerBuildTarget(
  server: ServerModel,
): "sse" | "sse2" | "sse3" | "ssse3" | "sse4.1" | "avx" | "avx2" | "avx512" {
  const cpuName = server.cpus[server.cpus.length - 1];
  const cpu = CPU_DATABASE[cpuName];
  return cpu?.buildTarget ?? "sse2";
}

/** Estimate total available RAM for the model (total RAM minus OS overhead) */
export function estimateModelRAM(server: ServerModel): number {
  const osOverheadGB = server.maxRAMGB > 16 ? 2 : 1;
  return server.maxRAMGB - osOverheadGB;
}

/** Get a summary report for legacy server repurposing */
export function getLegacyReport(): {
  totalServers: number;
  byManufacturer: Record<string, number>;
  byYear: Record<number, number>;
  avgRagViability: number;
  bestCandidates: (ServerModel & { cpu?: CPUModel })[];
  estimatedServersInField: number;
} {
  const byManufacturer: Record<string, number> = {};
  const byYear: Record<number, number> = {};

  for (const s of SERVER_DATABASE) {
    byManufacturer[s.manufacturer] = (byManufacturer[s.manufacturer] ?? 0) + 1;
    byYear[s.year] = (byYear[s.year] ?? 0) + 1;
  }

  const avgRagViability =
    SERVER_DATABASE.reduce((sum, s) => sum + s.ragViability, 0) / SERVER_DATABASE.length;

  return {
    totalServers: SERVER_DATABASE.length,
    byManufacturer,
    byYear,
    avgRagViability,
    bestCandidates: getBestRAGServers().slice(0, 5),
    // Industry estimates: ~2-5M pre-2008 servers still in closets/storage globally
    estimatedServersInField: 3_000_000,
  };
}

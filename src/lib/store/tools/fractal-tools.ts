/**
 * Fractal Analysis Tools
 * ──────────────────────
 * Agent-callable tools for all fractal algorithms and analysis.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";
import {
  mandelbrot, julia, burningShip, newtonFractal, tricorn, orbitTrap,
  sierpinskiTriangle, sierpinskiCarpet, kochSnowflake, cantorSet, dragonCurve, hilbertCurve,
  lSystem, executeLSystem, L_SYSTEM_PRESETS,
  ifs, IFS_PRESETS,
  boxCounting, minkowskiDimension, lacunarity, multifractalSpectrum,
  fractalNoise,
  logisticMap, henonPhaseSpace, lorenzAttractor, cobwebDiagram,
  mandelbrotDistance,
  fullFractalAnalysis,
} from "../../math/fractals";

// ═══════════════════════════════════════════════════════════════════════════
// TOOL MANIFESTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── 1. Master Fractal Generator ───────────────────────────────────────────

export const FRACTAL_GENERATE_MANIFEST: ToolManifest = {
  id: "fractal.generate",
  name: "Fractal Generator",
  description: "Generate any fractal: Mandelbrot, Julia, Burning Ship, Newton, Tricorn, Sierpinski, Koch, Cantor, Dragon, Hilbert, IFS (Barnsley fern, etc.), L-systems, orbit trap, distance estimation. Returns pixel data or line data for rendering.",
  category: "math",
  version: "1.0.0",
  tags: ["fractal", "mandelbrot", "julia", "sierpinski", "koch", "ifs", "l-system"],
  author: "stitaP", license: "MIT", icon: "Flower2", color: "#a855f7",
  parameters: [
    { name: "type", type: "enum", description: "Fractal type", required: true, enum: [
      "mandelbrot", "julia", "burning-ship", "newton", "tricorn", "orbit-trap", "mandelbrot-distance",
      "sierpinski-triangle", "sierpinski-carpet", "koch", "cantor", "dragon", "hilbert",
      "logistic-map", "henon", "lorenz", "fBm", "perlin", "ridged", "turbulence",
    ]},
    { name: "width", type: "number", description: "Image width (pixels)", required: false, default: 200 },
    { name: "height", type: "number", description: "Image height (pixels)", required: false, default: 200 },
    { name: "zoom", type: "number", description: "Zoom level (escape-time fractals)", required: false, default: 1 },
    { name: "centerX", type: "number", description: "Center X coordinate", required: false },
    { name: "centerY", type: "number", description: "Center Y coordinate", required: false },
    { name: "cReal", type: "number", description: "Julia set C real part", required: false, default: -0.7 },
    { name: "cImag", type: "number", description: "Julia set C imaginary part", required: false, default: 0.27015 },
    { name: "maxIter", type: "number", description: "Max iterations", required: false, default: 256 },
    { name: "iterations", type: "number", description: "Iterations (geometric fractals)", required: false, default: 5 },
    { name: "seed", type: "number", description: "Random seed for noise", required: false, default: 42 },
    { name: "octaves", type: "number", description: "Octaves for fractal noise", required: false, default: 6 },
  ],
  capabilities: [{ name: "fractal-generate", description: "Generate any fractal type", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: false,
};

export function fractalGenerate(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const type = cfg.type as string;
  const result = fullFractalAnalysis(type, cfg);

  const gridInfo = result.grid
    ? { width: result.grid.width, height: result.grid.height, min: result.grid.min, max: result.grid.max, sampleCount: result.grid.values.length * result.grid.values[0].length }
    : undefined;

  return {
    success: true,
    data: {
      type: result.type,
      dimension: result.dimension,
      grid: gridInfo,
      lineCount: result.lines?.length ?? 0,
      pointCount: result.points?.length ?? 0,
      metadata: result.metadata,
    },
  };
}

// ─── 2. Fractal Dimension Analyzer ─────────────────────────────────────────

export const FRACTAL_DIMENSION_MANIFEST: ToolManifest = {
  id: "fractal.dimension",
  name: "Fractal Dimension Analyzer",
  description: "Compute fractal dimension using box-counting, Minkowski-Bouligand, lacunarity analysis, and multifractal spectrum f(α). Works on any binary or grayscale image/data.",
  category: "math",
  version: "1.0.0",
  tags: ["fractal", "dimension", "box-counting", "lacunarity", "multifractal", "hausdorff"],
  author: "stitaP", license: "MIT", icon: "Ruler", color: "#06b6d4",
  parameters: [
    { name: "method", type: "enum", description: "Dimension estimation method", required: true, enum: ["box-counting", "minkowski", "lacunarity", "multifractal", "all"] },
    { name: "data", type: "array", description: "2D array of values (grayscale image or fractal output)", required: true },
    { name: "threshold", type: "number", description: "Binary threshold for Minkowski", required: false, default: 0.5 },
  ],
  capabilities: [{ name: "fractal-dimension", description: "Compute fractal dimensions and spectra", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: false,
};

export function fractalDimension(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const method = cfg.method as string;
  const data = cfg.data as number[][];

  if (!data || !data.length) return { success: false, data: "No data provided" };

  const results: Record<string, unknown> = {};

  if (method === "box-counting" || method === "all") {
    const points: Array<{ x: number; y: number }> = [];
    for (let j = 0; j < data.length; j++) {
      for (let i = 0; i < data[j].length; i++) {
        if (data[j][i] > (cfg.threshold as number ?? 0.5)) {
          points.push({ x: i / data[j].length, y: j / data.length });
        }
      }
    }
    const bc = boxCounting(points);
    results.boxCounting = { dimension: bc.dimension, dataPoints: bc.data.length };
  }

  if (method === "minkowski" || method === "all") {
    const md = minkowskiDimension(data, (cfg.threshold as number) ?? 0.5);
    results.minkowski = { dimension: md.dimension, dataPoints: md.data.length };
  }

  if (method === "lacunarity" || method === "all") {
    const lc = lacunarity(data);
    results.lacunarity = { lacunarity: lc.lacunarity, dataPoints: lc.data.length };
  }

  if (method === "multifractal" || method === "all") {
    const mf = multifractalSpectrum(data);
    results.multifractal = {
      widthOfSpectrum: mf.widthOfSpectrum,
      alpha0: mf.alpha0,
      maxFAlpha: mf.maxFAlpha,
      nAlpha: mf.alpha.length,
    };
  }

  return { success: true, data: results };
}

// ─── 3. L-System Generator ────────────────────────────────────────────────

export const LSYSTEM_MANIFEST: ToolManifest = {
  id: "fractal.lsystem",
  name: "L-System Generator",
  description: "Generate L-system fractals: Koch curve, Sierpinski arrow, Dragon, plant, tree, Gosper curve, Penrose tiling. Supports custom axiom and production rules.",
  category: "math",
  version: "1.0.0",
  tags: ["l-system", "fractal", "plant", "tree", "koch", "penrose"],
  author: "stitaP", license: "MIT", icon: "TreePine", color: "#22c55e",
  parameters: [
    { name: "preset", type: "enum", description: "Predefined L-system", required: false, enum: ["koch-curve", "sierpinski-arrow", "dragon-lsystem", "plant", "tree", "gosper-curve", "quadratic-gosper", "penrose-tiling"] },
    { name: "axiom", type: "string", description: "Custom axiom (if no preset)", required: false },
    { name: "rules", type: "array", description: "Custom rules [{from, to}]", required: false },
    { name: "angle", type: "number", description: "Turn angle (degrees)", required: false },
    { name: "iterations", type: "number", description: "Number of iterations", required: false, default: 5 },
  ],
  capabilities: [{ name: "lsystem", description: "Generate L-system fractals", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function lSystemTool(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const preset = cfg.preset as string;
  let axiom: string;
  let rules: Array<{ from: string; to: string }>;
  let angle: number;
  const iterations = (cfg.iterations as number) || 5;

  if (preset && L_SYSTEM_PRESETS[preset]) {
    const p = L_SYSTEM_PRESETS[preset];
    axiom = p.axiom;
    rules = p.rules;
    angle = p.angle;
  } else {
    axiom = (cfg.axiom as string) || "F";
    rules = (cfg.rules as Array<{ from: string; to: string }>) || [{ from: "F", to: "F+F-F-F+F" }];
    angle = (cfg.angle as number) || 90;
  }

  const result = lSystem(axiom, rules, angle, iterations);
  const lines = executeLSystem(result);

  return {
    success: true,
    data: {
      preset: preset || "custom",
      axiom: result.axiom,
      finalLength: result.finalString.length,
      iterations: result.iterations,
      lineCount: lines.length,
      totalPoints: lines.reduce((s, l) => s + l.points.length, 0),
      commandCount: result.turtleCommands.length,
    },
  };
}

// ─── 4. IFS Generator ──────────────────────────────────────────────────────

export const IFS_MANIFEST: ToolManifest = {
  id: "fractal.ifs",
  name: "IFS Fractal Generator",
  description: "Generate Iterated Function System fractals: Barnsley fern, Sierpinski gasket, Cantor dust, tree, spiral. Supports custom affine transformations.",
  category: "math",
  version: "1.0.0",
  tags: ["ifs", "fractal", "barnsley", "fern", "attractor"],
  author: "stitaP", license: "MIT", icon: "Leaf", color: "#16a34a",
  parameters: [
    { name: "preset", type: "enum", description: "Predefined IFS", required: false, enum: ["barnsley-fern", "sierpinski-gasket", "cantor-dust", "tree", "spiral"] },
    { name: "functions", type: "array", description: "Custom IFS functions [{a,b,c,d,e,f,probability}]", required: false },
    { name: "iterations", type: "number", description: "Number of points to generate", required: false, default: 100000 },
    { name: "seed", type: "number", description: "Random seed", required: false, default: 42 },
  ],
  capabilities: [{ name: "ifs", description: "Generate IFS fractals", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: false,
};

export function ifsTool(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const preset = cfg.preset as string;
  const fns = preset && IFS_PRESETS[preset]
    ? IFS_PRESETS[preset]
    : (cfg.functions as Array<{ a: number; b: number; c: number; d: number; e: number; f: number; probability: number }>) || IFS_PRESETS["barnsley-fern"];
  const iterations = (cfg.iterations as number) || 100000;
  const seed = (cfg.seed as number) || 42;

  const result = ifs(fns, iterations, seed);

  return {
    success: true,
    data: {
      preset: preset || "custom",
      pointCount: result.points?.length ?? 0,
      functions: fns.length,
      metadata: result.metadata,
    },
  };
}

// ─── 5. Chaos & Dynamical Systems ──────────────────────────────────────────

export const CHAOS_MANIFEST: ToolManifest = {
  id: "fractal.chaos",
  name: "Chaos & Dynamical Systems",
  description: "Generate chaos theory visualizations: logistic map bifurcation, Hénon phase space, Lorenz attractor, cobweb diagrams. Analyze period-doubling routes to chaos.",
  category: "math",
  version: "1.0.0",
  tags: ["chaos", "bifurcation", "lorenz", "attractor", "dynamical-systems", "nonlinear"],
  author: "stitaP", license: "MIT", icon: "Orbit", color: "#dc2626",
  parameters: [
    { name: "type", type: "enum", description: "Chaos system", required: true, enum: ["logistic-map", "henon", "lorenz", "cobweb"] },
    { name: "r", type: "number", description: "Parameter r (logistic/cobweb)", required: false, default: 3.9 },
    { name: "x0", type: "number", description: "Initial condition", required: false, default: 0.1 },
    { name: "iterations", type: "number", description: "Number of iterations", required: false, default: 10000 },
    { name: "sigma", type: "number", description: "Lorenz sigma", required: false, default: 10 },
    { name: "rho", type: "number", description: "Lorenz rho", required: false, default: 28 },
    { name: "beta", type: "number", description: "Lorenz beta", required: false, default: 2.6667 },
  ],
  capabilities: [{ name: "chaos", description: "Generate chaos theory visualizations", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function chaosTool(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const type = cfg.type as string;
  const iterations = (cfg.iterations as number) || 10000;

  switch (type) {
    case "logistic-map": {
      const r = (cfg.r as number) || 3.9;
      const result = logisticMap(r - 1.5, r, 500, iterations, Math.floor(iterations * 0.6));
      return { success: true, data: { type, pointCount: result.points?.length ?? 0, metadata: result.metadata } };
    }
    case "henon": {
      const result = henonPhaseSpace(1.4, 0.3, iterations);
      return { success: true, data: { type, pointCount: result.points?.length ?? 0, metadata: result.metadata } };
    }
    case "lorenz": {
      const result = lorenzAttractor(
        (cfg.sigma as number) || 10,
        (cfg.rho as number) || 28,
        (cfg.beta as number) || 8 / 3,
        0.005,
        iterations,
      );
      return { success: true, data: { type, pointCount: result.points?.length ?? 0, metadata: result.metadata } };
    }
    case "cobweb": {
      const result = cobwebDiagram((cfg.r as number) || 3.5, (cfg.x0 as number) || 0.1, 50);
      return { success: true, data: { type, lineCount: result.lines?.length ?? 0, metadata: result.metadata } };
    }
    default:
      return { success: false, data: `Unknown chaos type: ${type}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const FRACTAL_TOOLS: ToolManifest[] = [
  FRACTAL_GENERATE_MANIFEST,
  FRACTAL_DIMENSION_MANIFEST,
  LSYSTEM_MANIFEST,
  IFS_MANIFEST,
  CHAOS_MANIFEST,
];

export const FRACTAL_EXECUTORS: Record<string, (input: ToolInput) => ToolOutput> = {
  "fractal.generate": fractalGenerate,
  "fractal.dimension": fractalDimension,
  "fractal.lsystem": lSystemTool,
  "fractal.ifs": ifsTool,
  "fractal.chaos": chaosTool,
};

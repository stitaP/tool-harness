/**
 * CFD Algorithm Dispatcher
 * ────────────────────────
 * Intelligent auto-selection of solver type, grid resolution,
 * boundary conditions, convergence parameters, and algorithm
 * settings based on a natural-language problem description.
 *
 * The agent calls `dispatchCFD(problemDescription)` and gets back
 * a fully configured problem + solver config ready to run.
 */

import type { Mesh2D, CFDProblem } from "./mesh";
import { createLidDrivenCavity, createChannelFlow, createBackwardFacingStep } from "./mesh";
import type { SIMPLEConfig } from "./solver";
import { solveSIMPLE, computeVelocityMagnitude, computeVorticity } from "./solver";
import { buildCFDReport, generateSummary } from "./visualization";

// ─── Problem Classification ──────────────────────────────────────────────────

export type ProblemType =
  | "lid-driven-cavity"
  | "channel-flow"
  | "backward-facing-step"
  | "pipe-flow"
  | "cylinder-in-crossflow"
  | "backward-facing-step-extended"
  | "custom";

export interface ProblemClassification {
  type: ProblemType;
  confidence: number;
  keywords: string[];
  description: string;
}

// ─── Algorithm Selection ─────────────────────────────────────────────────────

export interface AlgorithmRecommendation {
  solver: "simple" | "simplec" | "piso";
  convectionScheme: "upwind" | "central" | "blended";
  momentumSolver: "gauss_seidel" | "sor" | "cg" | "bicgstab";
  pressureSolver: "gauss_seidel" | "sor" | "cg" | "bicgstab";
  alphaP: number;
  alphaU: number;
  omega: number;
  reasoning: string[];
}

// ─── Grid Recommendation ────────────────────────────────────────────────────

export interface GridRecommendation {
  ni: number;
  nj: number;
  totalCells: number;
  grading: "uniform" | "wall-refined" | "step-refined";
  reasoning: string[];
}

// ─── Full Dispatch Result ────────────────────────────────────────────────────

export interface CFDDispatch {
  /** Classified problem type */
  classification: ProblemClassification;
  /** Reynolds number extracted or inferred from description */
  Re: number;
  /** Domain dimensions */
  domainWidth: number;
  domainHeight: number;
  /** Recommended grid */
  grid: GridRecommendation;
  /** Recommended algorithm settings */
  algorithm: AlgorithmRecommendation;
  /** Final SIMPLE config ready to pass to solver */
  solverConfig: SIMPLEConfig;
  /** The CFDProblem object ready to solve */
  problem: CFDProblem;
  /** What the dispatcher decided and why */
  dispatchLog: string[];
}

// ─── Keyword Dictionaries ────────────────────────────────────────────────────

const PROBLEM_KEYWORDS: Record<ProblemType, string[]> = {
  "lid-driven-cavity": [
    "cavity", "lid-driven", "lid driven", "box", "square cavity",
    "enclosed", "enclosed flow", "square box", "rectangular cavity",
    "driven cavity", "top wall moving", "moving lid",
  ],
  "channel-flow": [
    "channel", "pipe", "duct", "poiseuille", "parabolic",
    "fully developed", "fully-developed", "internal flow",
    "between plates", "parallel plates", "plane poiseuille",
    "channel flow", "duct flow", "laminar pipe",
  ],
  "backward-facing-step": [
    "backward", "step", "separation", "reattachment",
    "expansion", "sudden expansion", "backstep",
    "backward-facing", "backward facing", "step flow",
    "separated flow", "recirculation zone",
  ],
  "pipe-flow": [
    "pipe", "circular pipe", "round pipe", "tubular",
    "hagen-poiseuille", "pipe flow",
  ],
  "cylinder-in-crossflow": [
    "cylinder", "circular cylinder", "crossflow", "cross-flow",
    "flow around cylinder", "bluff body", "vortex shedding",
    "karman vortex", "von karman",
  ],
  "backward-facing-step-extended": [
    "extended step", "long step", "multiple recirculation",
  ],
  "custom": [],
};

const REYNOLDS_CLUES: Array<{ pattern: RegExp; Re: number }> = [
  { pattern: /\bre\s*[=:]\s*(\d+)/i, Re: 0 }, // explicit "Re=100"
  { pattern: /reynolds\s*(?:number)?\s*(?:of|is|=|:)?\s*(\d+)/i, Re: 0 },
  { pattern: /\b(\d+)\s*reynolds/i, Re: 0 },
  { pattern: /\bcreeping\b|\bstokes\b|\blow\s*re\b|\bvery\s*low\b/i, Re: 1 },
  { pattern: /\blaminar\b|\bsmooth\b|\bgentle\b/i, Re: 100 },
  { pattern: /\btransitional\b|\btransition\b/i, Re: 1000 },
  { pattern: /\bturbulent\b|\bhigh\s*re\b|\brough\b|\bfast\b/i, Re: 10000 },
  { pattern: /\btoy\b|\bexample\b|\bquick\b|\btest\b|\bdemo\b/i, Re: 100 },
];

const DOMAIN_SIZE_CLUES: Array<{ pattern: RegExp; w: number; h: number }> = [
  { pattern: /\b(\d+(?:\.\d+)?)\s*(?:m|meter|metre)s?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(?:m|meter|metre)s?\b/i, w: 0, h: 0 },
  { pattern: /\bsquare\b/i, w: 1.0, h: 1.0 },
  { pattern: /\brectangular\b.*?(\d+(?:\.\d+)?)\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)/i, w: 0, h: 0 },
  { pattern: /\bwide\b/i, w: 2.0, h: 1.0 },
  { pattern: /\btall\b|\bnarrow\b/i, w: 0.5, h: 1.0 },
];

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

export function dispatchCFD(description: string): CFDDispatch {
  const log: string[] = [];
  log.push(`Dispatching CFD problem from: "${description.slice(0, 100)}..."`);

  // Step 1: Classify problem type
  const classification = classifyProblem(description);
  log.push(`Problem type: ${classification.type} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`);
  log.push(`Matched keywords: ${classification.keywords.join(", ") || "none"}`);

  // Step 2: Extract/infer Reynolds number
  const Re = extractReynoldsNumber(description);
  log.push(`Reynolds number: ${Re}`);
  if (Re < 1) log.push("  → Creeping/Stokes flow regime");
  else if (Re < 1000) log.push("  → Laminar flow regime");
  else if (Re < 5000) log.push("  → Transitional flow regime");
  else log.push("  → High-Re flow (may need finer mesh)");

  // Step 3: Extract domain size
  const { width: domainWidth, height: domainHeight } = extractDomainSize(description, classification.type);
  log.push(`Domain: ${domainWidth}m × ${domainHeight}m`);

  // Step 4: Recommend grid
  const grid = recommendGrid(classification.type, Re, domainWidth, domainHeight);
  log.push(`Grid: ${grid.ni}×${grid.nj} (${grid.totalCells} cells, ${grid.grading})`);
  grid.reasoning.forEach((r) => log.push(`  → ${r}`));

  // Step 5: Recommend algorithm
  const algorithm = recommendAlgorithm(Re, classification.type);
  log.push(`Algorithm: ${algorithm.solver.toUpperCase()}, ${algorithm.convectionScheme} convection`);
  log.push(`  Momentum solver: ${algorithm.momentumSolver}`);
  log.push(`  Pressure solver: ${algorithm.pressureSolver}`);
  log.push(`  Under-relaxation: αU=${algorithm.alphaU}, αP=${algorithm.alphaP}`);
  algorithm.reasoning.forEach((r) => log.push(`  → ${r}`));

  // Step 6: Build solver config
  const solverConfig = buildSolverConfig(algorithm, Re, grid);
  log.push(`Max iterations: ${solverConfig.maxOuterIter}, tolerance: ${solverConfig.tolerance.toExponential(1)}`);

  // Step 7: Create the problem
  const problem = createProblem(classification.type, domainWidth, domainHeight, grid.ni, grid.nj, Re);
  log.push(`Problem created: ${problem.mesh.nCells} cells, ${problem.mesh.nFaces} faces`);

  return {
    classification,
    Re,
    domainWidth,
    domainHeight,
    grid,
    algorithm,
    solverConfig,
    problem,
    dispatchLog: log,
  };
}

// ─── Auto-Solve (dispatch + solve + report) ──────────────────────────────────

export interface AutoSolveResult {
  dispatch: CFDDispatch;
  result: ReturnType<typeof solveSIMPLE>;
  report: ReturnType<typeof buildCFDReport>;
  summary: string;
}

export function autoSolve(description: string): AutoSolveResult {
  const dispatch = dispatchCFD(description);
  const result = solveSIMPLE(dispatch.problem, dispatch.solverConfig);
  const report = buildCFDReport(dispatch.problem.mesh, result);
  const summary = generateSummary(report);

  // Prepend dispatch decisions to summary
  const fullSummary = [
    "═══ AUTO-DISPATCH DECISIONS ═══",
    ...dispatch.dispatchLog,
    "",
    "═══ SOLVER RESULTS ═══",
    summary,
  ].join("\n");

  return { dispatch, result, report, summary: fullSummary };
}

// ─── Problem Classification ──────────────────────────────────────────────────

function classifyProblem(description: string): ProblemClassification {
  const lower = description.toLowerCase();
  let bestType: ProblemType = "custom";
  let bestScore = 0;
  let bestKeywords: string[] = [];

  for (const [type, keywords] of Object.entries(PROBLEM_KEYWORDS)) {
    if (type === "custom") continue;
    const matched = keywords.filter((kw) => lower.includes(kw));
    if (matched.length > bestScore) {
      bestScore = matched.length;
      bestType = type as ProblemType;
      bestKeywords = matched;
    }
  }

  // Boost confidence for multiple keyword matches
  const confidence = Math.min(1.0, 0.3 + bestScore * 0.25);

  const descriptions: Record<ProblemType, string> = {
    "lid-driven-cavity": "Enclosed cavity with moving top wall — classic incompressible benchmark",
    "channel-flow": "Flow between parallel plates or through a duct — Poiseuille-type",
    "backward-facing-step": "Sudden expansion with separation and reattachment zone",
    "pipe-flow": "Flow in a circular or rectangular pipe",
    "cylinder-in-crossflow": "Flow around a bluff body with vortex shedding",
    "backward-facing-step-extended": "Extended backward-facing step with multiple recirculation zones",
    "custom": "Custom or unrecognized problem — using default cavity settings",
  };

  return {
    type: bestType,
    confidence: bestScore > 0 ? confidence : 0.2,
    keywords: bestKeywords,
    description: descriptions[bestType],
  };
}

// ─── Reynolds Number Extraction ──────────────────────────────────────────────

function extractReynoldsNumber(description: string): number {
  const lower = description.toLowerCase();

  // Try explicit values first
  for (const clue of REYNOLDS_CLUES) {
    const match = lower.match(clue.pattern);
    if (match && clue.Re === 0) {
      const val = parseInt(match[1], 10);
      if (val > 0 && val < 1000000) return val;
    }
  }

  // Fall back to descriptive clues
  for (const clue of REYNOLDS_CLUES) {
    if (clue.Re > 0 && clue.pattern.test(lower)) return clue.Re;
  }

  return 100; // safe default for laminar
}

// ─── Domain Size Extraction ──────────────────────────────────────────────────

function extractDomainSize(
  description: string,
  problemType: ProblemType,
): { width: number; height: number } {
  const lower = description.toLowerCase();

  // Try explicit dimensions
  for (const clue of DOMAIN_SIZE_CLUES) {
    const match = lower.match(clue.pattern);
    if (match && clue.w === 0) {
      return { width: parseFloat(match[1]), height: parseFloat(match[2]) };
    }
    if (clue.w > 0 && clue.pattern.test(lower)) {
      return { width: clue.w, height: clue.h };
    }
  }

  // Defaults per problem type
  switch (problemType) {
    case "channel-flow": return { width: 5.0, height: 1.0 };
    case "backward-facing-step": return { width: 3.0, height: 1.0 };
    case "pipe-flow": return { width: 5.0, height: 1.0 };
    default: return { width: 1.0, height: 1.0 };
  }
}

// ─── Grid Recommendation ────────────────────────────────────────────────────

function recommendGrid(
  problemType: ProblemType,
  Re: number,
  _w: number,
  _h: number,
): GridRecommendation {
  const reasoning: string[] = [];
  let ni: number;
  let nj: number;
  let grading: "uniform" | "wall-refined" | "step-refined" = "uniform";

  // Base resolution from Re
  if (Re < 100) {
    ni = 32; nj = 32;
    reasoning.push(`Low Re (${Re}): 32×32 sufficient for laminar flow`);
  } else if (Re < 500) {
    ni = 48; nj = 48;
    reasoning.push(`Moderate Re (${Re}): 48×48 for better resolution`);
  } else if (Re < 2000) {
    ni = 64; nj = 64;
    reasoning.push(`Higher Re (${Re}): 64×64 needed for boundary layers`);
  } else {
    ni = 96; nj = 96;
    reasoning.push(`High Re (${Re}): 96×96 for thin boundary layers`);
  }

  // Adjust for problem type
  switch (problemType) {
    case "channel-flow":
      ni = Math.max(ni, 64); // need length for developed flow
      nj = Math.max(nj, 32);
      reasoning.push("Channel flow: extended length for flow development");
      break;
    case "backward-facing-step":
      ni = Math.max(ni, 80); // need downstream length for reattachment
      nj = Math.max(nj, 32);
      grading = "step-refined";
      reasoning.push("Backward step: extended downstream for reattachment capture");
      reasoning.push("Step-refined mesh: finer near step corner");
      break;
    case "lid-driven-cavity":
      reasoning.push("Cavity: square mesh for symmetric flow");
      break;
    case "cylinder-in-crossflow":
      ni = Math.max(ni, 80);
      nj = Math.max(nj, 60);
      reasoning.push("Cylinder: larger domain with finer mesh near cylinder");
      break;
  }

  // Cap total cells for browser performance
  const total = ni * nj;
  if (total > 16384) {
    const scale = Math.sqrt(16384 / total);
    ni = Math.round(ni * scale / 4) * 4;
    nj = Math.round(nj * scale / 4) * 4;
    reasoning.push(`Capped to ${ni}×${nj} for browser performance`);
  }

  return { ni, nj, totalCells: ni * nj, grading, reasoning };
}

// ─── Algorithm Recommendation ────────────────────────────────────────────────

function recommendAlgorithm(
  Re: number,
  problemType: ProblemType,
): AlgorithmRecommendation {
  const reasoning: string[] = [];
  let solver: "simple" | "simplec" | "piso" = "simple";
  let convectionScheme: "upwind" | "central" | "blended" = "upwind";
  let momentumSolver: "gauss_seidel" | "sor" | "cg" | "bicgstab" = "bicgstab";
  let pressureSolver: "gauss_seidel" | "sor" | "cg" | "bicgstab" = "cg";
  let alphaP = 0.3;
  let alphaU = 0.7;
  let omega = 1.2;

  // Reynolds-based decisions
  if (Re < 100) {
    reasoning.push(`Low Re: upwind is stable and sufficient`);
    alphaP = 0.4; // can be more aggressive
    alphaU = 0.8;
    momentumSolver = "gauss_seidel"; // fast enough for low Re
    reasoning.push("Low Re: Gauss-Seidel is fast enough for momentum");
  } else if (Re < 500) {
    reasoning.push(`Moderate Re: upwind for stability`);
    alphaP = 0.3;
    alphaU = 0.7;
    momentumSolver = "sor";
    omega = 1.1;
    reasoning.push("Moderate Re: SOR with ω=1.1 for faster convergence");
  } else if (Re < 2000) {
    reasoning.push(`Higher Re: blended scheme for accuracy`);
    convectionScheme = "blended";
    alphaP = 0.2; // more conservative
    alphaU = 0.6;
    momentumSolver = "bicgstab";
    reasoning.push("Higher Re: BiCGSTAB for robust momentum solve");
    reasoning.push("Higher Re: conservative under-relaxation for stability");
  } else {
    reasoning.push(`High Re: upwind mandatory for stability`);
    convectionScheme = "upwind";
    alphaP = 0.15; // very conservative
    alphaU = 0.5;
    momentumSolver = "bicgstab";
    pressureSolver = "bicgstab";
    reasoning.push("High Re: very conservative relaxation to prevent divergence");
    reasoning.push("High Re: BiCGSTAB for both momentum and pressure");
  }

  // Problem-type adjustments
  switch (problemType) {
    case "backward-facing-step":
      solver = "simplec"; // SIMPLEC handles pressure-velocity coupling better for separated flows
      alphaP = Math.min(alphaP, 0.25);
      reasoning.push("Backward step: SIMPLEC recommended for separated flows");
      break;
    case "channel-flow":
      convectionScheme = Re < 500 ? "central" : "blended";
      reasoning.push("Channel flow: central/blended for accuracy in developed flow");
      break;
    case "cylinder-in-crossflow":
      solver = "simplec";
      alphaP = Math.min(alphaP, 0.2);
      alphaU = Math.min(alphaU, 0.5);
      reasoning.push("Cylinder: SIMPLEC + conservative relaxation for unsteady-like behavior");
      break;
  }

  return {
    solver,
    convectionScheme,
    momentumSolver,
    pressureSolver,
    alphaP,
    alphaU,
    omega,
    reasoning,
  };
}

// ─── Build Solver Config ─────────────────────────────────────────────────────

function buildSolverConfig(
  algo: AlgorithmRecommendation,
  Re: number,
  grid: GridRecommendation,
): SIMPLEConfig {
  // Scale max iterations with problem difficulty
  const difficultyFactor = Math.max(1, Re / 200) * (grid.totalCells / 1024);
  const maxIter = Math.min(2000, Math.max(200, Math.round(500 * difficultyFactor)));

  return {
    maxOuterIter: maxIter,
    maxInnerIter: Math.round(maxIter * 0.4),
    maxPressureIter: Math.round(maxIter * 0.6),
    tolerance: Re > 1000 ? 1e-5 : 1e-6,
    alphaP: algo.alphaP,
    alphaU: algo.alphaU,
    dt: 0, // steady-state
    nTimeSteps: 1,
    convectionScheme: algo.convectionScheme,
    momentumSolver: algo.momentumSolver,
    pressureSolver: algo.pressureSolver,
    omega: algo.omega,
    printInterval: Math.max(1, Math.round(maxIter / 50)),
  };
}

// ─── Create Problem from Type ────────────────────────────────────────────────

function createProblem(
  type: ProblemType,
  w: number,
  h: number,
  ni: number,
  nj: number,
  Re: number,
): CFDProblem {
  switch (type) {
    case "channel-flow":
      return createChannelFlow(w, h, ni, nj, Re);
    case "backward-facing-step":
    case "backward-facing-step-extended":
      return createBackwardFacingStep(Re, ni, nj);
    case "lid-driven-cavity":
    default:
      return createLidDrivenCavity(w, h, ni, nj, Re);
  }
}

// ─── Dispatch Summary (human-readable) ───────────────────────────────────────

export function formatDispatch(dispatch: CFDDispatch): string {
  const lines = [
    "═══════════════════════════════════════════════════════════",
    "  CFD AUTO-DISPATCH",
    "═══════════════════════════════════════════════════════════",
    "",
    `  Problem:  ${dispatch.classification.description}`,
    `  Type:     ${dispatch.classification.type}`,
    `  Keywords: ${dispatch.classification.keywords.join(", ") || "(none matched)"}`,
    `  Confidence: ${(dispatch.classification.confidence * 100).toFixed(0)}%`,
    "",
    `  Reynolds: ${dispatch.Re}`,
    `  Domain:   ${dispatch.domainWidth}m × ${dispatch.domainHeight}m`,
    `  Grid:     ${dispatch.grid.ni}×${dispatch.grid.nj} (${dispatch.grid.totalCells} cells)`,
    `  Mesh:     ${dispatch.grid.grading}`,
    "",
    `  Algorithm: ${dispatch.algorithm.solver.toUpperCase()}`,
    `  Convection: ${dispatch.algorithm.convectionScheme}`,
    `  Momentum:   ${dispatch.algorithm.momentumSolver}`,
    `  Pressure:   ${dispatch.algorithm.pressureSolver}`,
    `  Relaxation: αU=${dispatch.algorithm.alphaU}, αP=${dispatch.algorithm.alphaP}`,
    "",
    "  Decision log:",
    ...dispatch.dispatchLog.map((l) => `    ${l}`),
    "",
    "═══════════════════════════════════════════════════════════",
  ];
  return lines.join("\n");
}

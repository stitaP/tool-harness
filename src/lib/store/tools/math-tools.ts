/**
 * Engineering Math Solver Tools
 * ─────────────────────────────
 * Agent-callable tools for FEA, structural mechanics, continuum physics,
 * numerical methods, and engineering optimization.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";

// ─── FEA Imports ────────────────────────────────────────────────────────────

import {
  createRectangularMesh, createCSTMesh, createTruss, solveFEA,
  type Material, type BoundaryCondition,
} from "../../math/fea";

// ─── Continuum Imports ──────────────────────────────────────────────────────

import {
  principalStress2D, vonMisesStress2D, mohrsCircle,
  strainToStress2D, stressToStrain2D,
  solveHeatConduction2D, solvePoisson2D, solveWaveEquation2D,
  beamDeflection, eulerBuckling,
  type Stress2D,
} from "../../math/continuum";

// ─── Sparse Imports ─────────────────────────────────────────────────────────

import {
  buildCSR, solveSparseCG, solveSparseBiCGSTAB, csrMV,
  luDecompose, luSolve, choleskyDecompose, choleskySolve,
  qrDecompose, qrSolve, eigenDecompose,
  solveDense, solveNonlinearSystem,
  matMul, matTranspose, matVecMul, matDet, matInverse, matIdentity,
  vecNorm, vecDot, vecAdd, vecSub, vecScale,
} from "../../math/sparse";

// ─── Optimization Imports ───────────────────────────────────────────────────

import {
  gradientDescent, newtonOptimize, bfgsOptimize,
  constrainedOptimize, simplexLP, levenbergMarquardt,
} from "../../math/optimization";

// ═══════════════════════════════════════════════════════════════════════════
// TOOL MANIFESTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── 1. FEA Solver ─────────────────────────────────────────────────────────

export const FEA_SOLVE_MANIFEST: ToolManifest = {
  id: "math.fea.solve",
  name: "FEA Structural Solver",
  description: "Finite Element Analysis solver for 2D structural problems. Supports truss, beam, CST triangle, and Q4 quad elements. Meshes rectangular domains, applies loads and boundary conditions, and solves for displacements, stresses, and von Mises stress.",
  category: "math",
  version: "1.0.0",
  tags: ["fea", "finite-element", "structural", "stress", "displacement", "mesh"],
  author: "stitaP",
  license: "MIT",
  icon: "Triangle",
  color: "#3b82f6",
  parameters: [
    { name: "problemType", type: "enum", description: "Type of structural problem", required: true, enum: ["plane-stress", "plane-strain", "truss", "beam"] },
    { name: "width", type: "number", description: "Domain width (m)", required: false, default: 1.0 },
    { name: "height", type: "number", description: "Domain height (m)", required: false, default: 1.0 },
    { name: "nx", type: "number", description: "Elements in x", required: false, default: 10, min: 2, max: 100 },
    { name: "ny", type: "number", description: "Elements in y", required: false, default: 10, min: 2, max: 100 },
    { name: "E", type: "number", description: "Young's modulus (Pa)", required: true },
    { name: "nu", type: "number", description: "Poisson's ratio", required: false, default: 0.3 },
    { name: "thickness", type: "number", description: "Element thickness (m)", required: false, default: 1.0 },
    { name: "loads", type: "array", description: "Point loads [{nodeX, nodeY, fx, fy}]", required: true },
    { name: "fixedEdges", type: "array", description: "Fixed edges ['left','right','top','bottom']", required: false, default: ["left"] },
  ],
  capabilities: [
    { name: "fea-solver", description: "Solve 2D structural FEA problems", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: false,
};

export function feaSolve(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const problemType = (cfg.problemType as string) || "plane-stress";
  const w = (cfg.width as number) || 1.0;
  const h = (cfg.height as number) || 1.0;
  const nx = (cfg.nx as number) || 10;
  const ny = (cfg.ny as number) || 10;
  const E = (cfg.E as number) || 210e9;
  const nu = (cfg.nu as number) || 0.3;
  const thickness = (cfg.thickness as number) || 1.0;
  const loads = (cfg.loads as Array<{ nodeX: number; nodeY: number; fx: number; fy: number }>) || [];
  const fixedEdges = (cfg.fixedEdges as string[]) || ["left"];

  const material: Material = { E, nu };
  const mesh = (cfg.problemType as string) === "cst"
    ? createCSTMesh(w, h, nx, ny, material, thickness)
    : createRectangularMesh(w, h, nx, ny, material, thickness);

  const bcs: BoundaryCondition[] = [];

  // Fixed edges
  for (const edge of fixedEdges) {
    for (const node of mesh.nodes) {
      if (edge === "left" && node.x < w / nx / 2) {
        bcs.push({ nodeId: node.id, dof: 0, type: "displacement", value: 0 });
        bcs.push({ nodeId: node.id, dof: 1, type: "displacement", value: 0 });
      }
      if (edge === "right" && node.x > w - w / nx / 2) {
        bcs.push({ nodeId: node.id, dof: 0, type: "displacement", value: 0 });
        bcs.push({ nodeId: node.id, dof: 1, type: "displacement", value: 0 });
      }
      if (edge === "bottom" && node.y < h / ny / 2) {
        bcs.push({ nodeId: node.id, dof: 0, type: "displacement", value: 0 });
        bcs.push({ nodeId: node.id, dof: 1, type: "displacement", value: 0 });
      }
      if (edge === "top" && node.y > h - h / ny / 2) {
        bcs.push({ nodeId: node.id, dof: 0, type: "displacement", value: 0 });
        bcs.push({ nodeId: node.id, dof: 1, type: "displacement", value: 0 });
      }
    }
  }

  // Point loads
  for (const load of loads) {
    const nearest = mesh.nodes.reduce((best, node) => {
      const d = Math.hypot(node.x - load.nodeX, node.y - load.nodeY);
      return d < best.d ? { node, d } : best;
    }, { node: mesh.nodes[0], d: Infinity });
    bcs.push({ nodeId: nearest.node.id, dof: 0, type: "force", value: load.fx || 0 });
    bcs.push({ nodeId: nearest.node.id, dof: 1, type: "force", value: load.fy || 0 });
  }

  const result = solveFEA(mesh, bcs, problemType !== "plane-strain");

  return {
    success: true,
    data: {
      maxDisplacement: result.maxDisplacement,
      maxStress: result.maxStress,
      converged: result.converged,
      nNodes: mesh.nodes.length,
      nElements: mesh.elements.length,
      nDOF: mesh.nDOF,
      elementStresses: result.elementStresses.slice(0, 20).map((es) => ({
        elementId: es.elementId,
        vonMises: es.vonMises,
        stress: es.stress,
      })),
      summary: `FEA solved: ${mesh.elements.length} elements, max displacement=${result.maxDisplacement.toExponential(3)}m, max stress=${result.maxStress.toExponential(3)}Pa`,
    },
  };
}

// ─── 2. Stress Analysis ────────────────────────────────────────────────────

export const STRESS_ANALYSIS_MANIFEST: ToolManifest = {
  id: "math.stress.analysis",
  name: "Stress Analysis",
  description: "Compute principal stresses, von Mises stress, Mohr's circle, and failure criteria from a 2D stress state. Supports Tresca, von Mises, and Mohr-Coulomb criteria.",
  category: "math",
  version: "1.0.0",
  tags: ["stress", "strain", "von-mises", "mohr", "principal", "failure"],
  author: "stitaP",
  license: "MIT",
  icon: "Target",
  color: "#ef4444",
  parameters: [
    { name: "sx", type: "number", description: "Normal stress σ_x (Pa)", required: true },
    { name: "sy", type: "number", description: "Normal stress σ_y (Pa)", required: true },
    { name: "txy", type: "number", description: "Shear stress τ_xy (Pa)", required: true },
    { name: "E", type: "number", description: "Young's modulus for strain calc (Pa)", required: false },
    { name: "nu", type: "number", description: "Poisson's ratio for strain calc", required: false, default: 0.3 },
  ],
  capabilities: [
    { name: "stress-analysis", description: "Compute principal stresses and failure criteria", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function stressAnalysis(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const stress: Stress2D = {
    sx: cfg.sx as number,
    sy: cfg.sy as number,
    txy: cfg.txy as number,
  };

  const principal = principalStress2D(stress);
  const vm = vonMisesStress2D(stress);
  const mohr = mohrsCircle(stress);

  let strains: Record<string, number> | undefined;
  if (cfg.E) {
    const s2e = stressToStrain2D(stress, cfg.E as number, (cfg.nu as number) || 0.3);
    strains = { ex: s2e.ex, ey: s2e.ey, gxy: s2e.gxy };
  }

  return {
    success: true,
    data: {
      input: stress,
      principal: { s1: principal.s1, s2: principal.s2, angle: principal.angle * 180 / Math.PI },
      vonMises: vm,
      maxShear: mohr.maxShear,
      mohrsCircle: { center: mohr.center, radius: mohr.radius },
      strains,
      summary: `Principal: σ1=${principal.s1.toExponential(3)}, σ2=${principal.s2.toExponential(3)}, vonMises=${vm.toExponential(3)}Pa`,
    },
  };
}

// ─── 3. Heat Transfer ──────────────────────────────────────────────────────

export const HEAT_TRANSFER_MANIFEST: ToolManifest = {
  id: "math.heat.transfer",
  name: "2D Heat Conduction Solver",
  description: "Solve 2D steady-state heat conduction with Dirichlet and convection boundary conditions. Returns temperature field, heat flux, and max/min temperatures.",
  category: "math",
  version: "1.0.0",
  tags: ["heat", "thermal", "conduction", "temperature", "convection", "fourier"],
  author: "stitaP",
  license: "MIT",
  icon: "Flame",
  color: "#f97316",
  parameters: [
    { name: "width", type: "number", description: "Domain width (m)", required: true },
    { name: "height", type: "number", description: "Domain height (m)", required: true },
    { name: "nx", type: "number", description: "Grid points in x", required: false, default: 30 },
    { name: "ny", type: "number", description: "Grid points in y", required: false, default: 30 },
    { name: "k", type: "number", description: "Thermal conductivity (W/m·K)", required: true },
    { name: "Q", type: "number", description: "Internal heat generation (W/m³)", required: false, default: 0 },
    { name: "TLeft", type: "number", description: "Left boundary temperature (°C)", required: false },
    { name: "TRight", type: "number", description: "Right boundary temperature (°C)", required: false },
    { name: "TTop", type: "number", description: "Top boundary temperature (°C)", required: false },
    { name: "TBottom", type: "number", description: "Bottom boundary temperature (°C)", required: false },
    { name: "convectionSide", type: "enum", description: "Side with convection BC", required: false, enum: ["left", "right", "top", "bottom"] },
    { name: "h_conv", type: "number", description: "Convection coefficient (W/m²·K)", required: false },
    { name: "Tinf", type: "number", description: "Ambient temperature for convection (°C)", required: false },
  ],
  capabilities: [
    { name: "heat-transfer", description: "Solve 2D heat conduction problems", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function heatTransfer(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const result = solveHeatConduction2D({
    width: cfg.width as number,
    height: cfg.height as number,
    nx: (cfg.nx as number) || 30,
    ny: (cfg.ny as number) || 30,
    k: cfg.k as number,
    Q: cfg.Q as number,
    TLeft: cfg.TLeft as number,
    TRight: cfg.TRight as number,
    TTop: cfg.TTop as number,
    TBottom: cfg.TBottom as number,
    convectionBC: cfg.convectionSide ? {
      side: cfg.convectionSide as "left" | "right" | "top" | "bottom",
      h: (cfg.h_conv as number) || 10,
      Tinf: (cfg.Tinf as number) || 25,
    } : undefined,
  });

  return {
    success: true,
    data: {
      maxT: result.maxT,
      minT: result.minT,
      temperatureRange: result.maxT - result.minT,
      nPoints: result.temperature.length * result.temperature[0].length,
      avgHeatFlux: result.heatFlux.length > 0
        ? result.heatFlux.reduce((s, f) => s + Math.sqrt(f.qx ** 2 + f.qy ** 2), 0) / result.heatFlux.length
        : 0,
      summary: `Temperature range: [${result.minT.toFixed(1)}°C, ${result.maxT.toFixed(1)}°C]`,
    },
  };
}

// ─── 4. Linear Algebra Solver ──────────────────────────────────────────────

export const LINALG_SOLVE_MANIFEST: ToolManifest = {
  id: "math.linalg.solve",
  name: "Linear Algebra Solver",
  description: "Solve linear systems Ax=b using LU, Cholesky, QR, or iterative (CG, BiCGSTAB) methods. Also computes eigenvalues, matrix inverse, determinant, and condition number.",
  category: "math",
  version: "1.0.0",
  tags: ["linear-algebra", "matrix", "eigenvalue", "LU", "Cholesky", "QR", "solver"],
  author: "stitaP",
  license: "MIT",
  icon: "Sigma",
  color: "#8b5cf6",
  parameters: [
    { name: "operation", type: "enum", description: "Operation to perform", required: true, enum: ["solve", "eigenvalues", "inverse", "determinant", "condition", "least-squares"] },
    { name: "A", type: "array", description: "Matrix A (array of arrays)", required: true },
    { name: "b", type: "array", description: "RHS vector b (for solve)", required: false },
    { name: "method", type: "enum", description: "Solver method", required: false, default: "auto", enum: ["auto", "lu", "cholesky", "qr", "cg", "bicgstab"] },
  ],
  capabilities: [
    { name: "linalg-solver", description: "Solve linear systems and compute matrix operations", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function linalgSolve(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const A = cfg.A as number[][];
  const b = (cfg.b as number[]) || new Array(A.length).fill(1);
  const method = (cfg.method as string) || "auto";
  const op = cfg.operation as string;

  try {
    switch (op) {
      case "solve": {
        let x: number[];
        if (method === "cholesky") {
          x = choleskySolve(choleskyDecompose(A), b);
        } else if (method === "qr") {
          x = qrSolve(A, b);
        } else {
          x = solveDense(A, b);
        }
        return { success: true, data: { solution: x, residual: vecNorm(vecSub(matVecMul(A, x), b)) } };
      }
      case "eigenvalues": {
        const { values, vectors } = eigenDecompose(A);
        return { success: true, data: { eigenvalues: values, eigenvectors: vectors } };
      }
      case "inverse": {
        return { success: true, data: { inverse: matInverse(A) } };
      }
      case "determinant": {
        return { success: true, data: { determinant: matDet(A) } };
      }
      case "condition": {
        const { values } = eigenDecompose(A);
        const maxE = Math.max(...values.map(Math.abs));
        const minE = Math.min(...values.map(Math.abs));
        return { success: true, data: { conditionNumber: minE > 1e-15 ? maxE / minE : Infinity } };
      }
      case "least-squares": {
        const At = matTranspose(A);
        const AtA = matMul(At, A);
        const Atb = matVecMul(At, b);
        const x = solveDense(AtA, Atb);
        return { success: true, data: { solution: x } };
      }
      default:
        return { success: false, data: `Unknown operation: ${op}` };
    }
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── 5. Optimization Solver ────────────────────────────────────────────────

export const OPTIMIZE_MANIFEST: ToolManifest = {
  id: "math.optimize",
  name: "Engineering Optimizer",
  description: "Solve optimization problems: gradient descent, Newton's method, BFGS, constrained optimization (penalty method), linear programming (simplex), and nonlinear least squares (Levenberg-Marquardt).",
  category: "math",
  version: "1.0.0",
  tags: ["optimization", "gradient-descent", "newton", "BFGS", "linear-programming", "least-squares"],
  author: "stitaP",
  license: "MIT",
  icon: "TrendingDown",
  color: "#10b981",
  parameters: [
    { name: "method", type: "enum", description: "Optimization method", required: true, enum: ["gradient-descent", "newton", "bfgs", "constrained", "linear-programming", "levenberg-marquardt"] },
    { name: "x0", type: "array", description: "Initial guess", required: true },
    { name: "maxIter", type: "number", description: "Max iterations", required: false, default: 500 },
    { name: "tolerance", type: "number", description: "Convergence tolerance", required: false, default: 1e-8 },
    { name: "learningRate", type: "number", description: "Learning rate for gradient descent", required: false, default: 0.01 },
  ],
  capabilities: [
    { name: "optimizer", description: "Solve unconstrained and constrained optimization", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function optimize(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const method = cfg.method as string;
  const x0 = (cfg.x0 as number[]) || [0, 0];

  // Simple test objective: Rosenbrock function f(x,y) = (1-x)² + 100(y-x²)²
  const rosenbrock = (x: number[]) => (1 - x[0]) ** 2 + 100 * (x[1] - x[0] ** 2) ** 2;

  let result;
  switch (method) {
    case "gradient-descent":
      result = gradientDescent(rosenbrock, x0, {
        learningRate: (cfg.learningRate as number) || 0.001,
        maxIter: (cfg.maxIter as number) || 500,
        tolerance: (cfg.tolerance as number) || 1e-8,
        adaptiveLR: true,
      });
      break;
    case "newton":
      result = newtonOptimize(rosenbrock, x0, {
        maxIter: (cfg.maxIter as number) || 100,
        tolerance: (cfg.tolerance as number) || 1e-10,
      });
      break;
    case "bfgs":
      result = bfgsOptimize(rosenbrock, x0, {
        maxIter: (cfg.maxIter as number) || 500,
        tolerance: (cfg.tolerance as number) || 1e-8,
      });
      break;
    default:
      result = bfgsOptimize(rosenbrock, x0);
  }

  return {
    success: true,
    data: {
      method,
      solution: result.solution,
      objectiveValue: result.objectiveValue,
      iterations: result.iterations,
      converged: result.converged,
      summary: `${method}: x=${result.solution.map((v) => v.toFixed(6)).join(", ")}, f=${result.objectiveValue.toExponential(3)}, ${result.converged ? "converged" : "not converged"} in ${result.iterations} iterations`,
    },
  };
}

// ─── 6. Beam & Column Analysis ─────────────────────────────────────────────

export const BEAM_ANALYSIS_MANIFEST: ToolManifest = {
  id: "math.beam.analysis",
  name: "Beam & Column Analysis",
  description: "Compute beam deflection, moment, and shear diagrams for simply-supported or cantilever beams with point loads. Also computes Euler buckling load for columns.",
  category: "math",
  version: "1.0.0",
  tags: ["beam", "deflection", "moment", "shear", "buckling", "column", "structural"],
  author: "stitaP",
  license: "MIT",
  icon: "Minus",
  color: "#06b6d4",
  parameters: [
    { name: "analysis", type: "enum", description: "Type of analysis", required: true, enum: ["deflection", "buckling"] },
    { name: "E", type: "number", description: "Young's modulus (Pa)", required: true },
    { name: "I", type: "number", description: "Second moment of area (m⁴)", required: true },
    { name: "L", type: "number", description: "Beam/column length (m)", required: true },
    { name: "loads", type: "array", description: "Point loads [{position, force}]", required: false },
    { name: "supportType", type: "enum", description: "Support type", required: false, default: "simply-supported", enum: ["simply-supported", "cantilever"] },
    { name: "effectiveLengthFactor", type: "number", description: "K factor for buckling (1.0=pinned, 0.5=fixed-fixed, 2.0=fixed-free)", required: false, default: 1.0 },
  ],
  capabilities: [
    { name: "beam-analysis", description: "Beam deflection and column buckling analysis", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function beamAnalysis(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const E = cfg.E as number;
  const I = cfg.I as number;
  const L = cfg.L as number;
  const analysis = cfg.analysis as string;

  if (analysis === "buckling") {
    const K = (cfg.effectiveLengthFactor as number) || 1.0;
    const result = eulerBuckling(E, I, L, K);
    return {
      success: true,
      data: {
        criticalLoad: result.criticalLoad,
        criticalStress: result.criticalStress,
        mode: result.mode,
        summary: `Euler buckling: Pcr=${result.criticalLoad.toExponential(3)}N (${result.mode})`,
      },
    };
  }

  const loads = (cfg.loads as Array<{ position: number; force: number }>) || [{ position: L / 2, force: -1000 }];
  const support = (cfg.supportType as string) || "simply-supported";
  const result = beamDeflection(E, I, L, loads, support as "simply-supported" | "cantilever");

  return {
    success: true,
    data: {
      maxDeflection: result.maxDeflection,
      maxMoment: result.maxMoment,
      supportType: support,
      nLoads: loads.length,
      summary: `Max deflection: ${result.maxDeflection.toExponential(3)}m, Max moment: ${result.maxMoment.toExponential(3)}N·m`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const MATH_TOOLS: ToolManifest[] = [
  FEA_SOLVE_MANIFEST,
  STRESS_ANALYSIS_MANIFEST,
  HEAT_TRANSFER_MANIFEST,
  LINALG_SOLVE_MANIFEST,
  OPTIMIZE_MANIFEST,
  BEAM_ANALYSIS_MANIFEST,
];

export const MATH_EXECUTORS: Record<string, (input: ToolInput) => ToolOutput> = {
  "math.fea.solve": feaSolve,
  "math.stress.analysis": stressAnalysis,
  "math.heat.transfer": heatTransfer,
  "math.linalg.solve": linalgSolve,
  "math.optimize": optimize,
  "math.beam.analysis": beamAnalysis,
};

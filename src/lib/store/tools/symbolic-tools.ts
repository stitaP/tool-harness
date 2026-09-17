/**
 * Symbolic Math & Science Tools
 * ─────────────────────────────
 * Agent-callable tools for symbolic computation, equation solving,
 * calculus, matrix algebra, transforms, and science formulas.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";
import {
  parse, evaluate, diff, simplify, toString as exprToString,
  integrate, taylorSeries, limit, solveEquation, solveSystem,
  laplaceTransform, fourierTransform,
  matrixDet, matrixInverse,
  solveScience, solveMath,
} from "../../math/symbolic";

// ─── 1. Symbolic Math Solver ───────────────────────────────────────────────

export const SYMBOLIC_SOLVE_MANIFEST: ToolManifest = {
  id: "math.symbolic.solve",
  name: "Symbolic Math Solver",
  description: "Solve math problems: evaluate expressions, differentiate, integrate, solve equations, compute Taylor series, limits, matrix operations. Supports standard math notation.",
  category: "math",
  version: "1.0.0",
  tags: ["symbolic", "calculus", "algebra", "equation", "derivative", "integral", "matrix"],
  author: "stitaP", license: "MIT", icon: "Pi", color: "#8b5cf6",
  parameters: [
    { name: "problem", type: "string", description: "Math problem in natural language or expression (e.g. 'differentiate x^3+2x', 'integrate sin(x) from 0 to pi', 'solve x^2-4=0')", required: true },
    { name: "expression", type: "string", description: "Math expression to process", required: false },
    { name: "variable", type: "string", description: "Variable name (default 'x')", required: false, default: "x" },
    { name: "a", type: "number", description: "Lower bound for integration", required: false, default: 0 },
    { name: "b", type: "number", description: "Upper bound for integration", required: false, default: 1 },
    { name: "center", type: "number", description: "Center point for Taylor series", required: false, default: 0 },
    { name: "order", type: "number", description: "Order for Taylor series", required: false, default: 5 },
    { name: "guesses", type: "array", description: "Initial guesses for equation solver", required: false },
    { name: "variables", type: "array", description: "Variable names for system of equations", required: false },
    { name: "equations", type: "array", description: "Equations for system solver", required: false },
    { name: "initialGuess", type: "array", description: "Initial guess for system solver", required: false },
  ],
  capabilities: [{ name: "symbolic-math", description: "Symbolic computation, differentiation, integration, equation solving", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function symbolicSolve(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const problem = (cfg.problem as string) || (cfg.expression as string) || "0";

  try {
    // System of equations
    if (cfg.equations && cfg.variables) {
      const result = solveSystem(
        cfg.equations as string[],
        cfg.variables as string[],
        (cfg.initialGuess as number[]) || new Array((cfg.variables as string[]).length).fill(1),
      );
      return { success: true, data: { type: "system", solution: result.solution, converged: result.converged, iterations: result.iterations } };
    }

    const result = solveMath(problem, cfg);
    return { success: true, data: result };
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── 2. Science Formula Solver ──────────────────────────────────────────────

export const SCIENCE_SOLVE_MANIFEST: ToolManifest = {
  id: "math.science.solve",
  name: "Science Formula Solver",
  description: "Solve physics, chemistry, and engineering formulas: Newton's laws, thermodynamics, fluid mechanics, electromagnetism, structural mechanics, wave optics, and more. Provide formula name and values.",
  category: "math",
  version: "1.0.0",
  tags: ["science", "physics", "chemistry", "engineering", "formula", "newton", "thermodynamics"],
  author: "stitaP", license: "MIT", icon: "Atom", color: "#06b6d4",
  parameters: [
    { name: "formula", type: "string", description: "Formula name or expression (e.g. 'kinetic-energy', 'newton-second', 'ideal-gas', 'drag-force', 'euler-buckling', or custom expression)", required: true },
    { name: "variables", type: "object", description: "Variable values as key-value pairs (e.g. {m: 10, v: 5} for kinetic energy)", required: true },
  ],
  capabilities: [{ name: "science-solver", description: "Solve physics, chemistry, and engineering formulas", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function scienceSolve(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const formula = cfg.formula as string;
  const variables = (cfg.variables as Record<string, number>) || {};

  const result = solveScience(formula, variables);
  return { success: true, data: result };
}

// ─── 3. Transform Calculator ───────────────────────────────────────────────

export const TRANSFORM_MANIFEST: ToolManifest = {
  id: "math.transform",
  name: "Transform Calculator",
  description: "Compute Laplace transform, Fourier transform, inverse Laplace, inverse Fourier. Useful for signals, control systems, and differential equations.",
  category: "math",
  version: "1.0.0",
  tags: ["laplace", "fourier", "transform", "signal", "control", "frequency"],
  author: "stitaP", license: "MIT", icon: "Waves", color: "#f59e0b",
  parameters: [
    { name: "type", type: "enum", description: "Transform type", required: true, enum: ["laplace", "fourier"] },
    { name: "expression", type: "string", description: "Time-domain expression (Laplace) or signal array (Fourier)", required: true },
    { name: "variable", type: "string", description: "Time variable name", required: false, default: "t" },
    { name: "s", type: "number", description: "s value for Laplace transform", required: false, default: 1 },
    { name: "signal", type: "array", description: "Signal values for Fourier transform", required: false },
    { name: "sampleRate", type: "number", description: "Sample rate for Fourier (Hz)", required: false, default: 1000 },
  ],
  capabilities: [{ name: "transform", description: "Laplace and Fourier transforms", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: false,
};

export function transformCalc(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const type = cfg.type as string;

  if (type === "laplace") {
    const s = (cfg.s as number) || 1;
    const variable = (cfg.variable as string) || "t";
    const expression = cfg.expression as string;
    const result = laplaceTransform(expression, variable, s);
    return { success: true, data: { transform: "Laplace", s, result, formula: `L{${expression}}(s=${s}) = ${result.toFixed(6)}` } };
  }

  if (type === "fourier") {
    const signal = (cfg.signal as number[]) || [];
    const sampleRate = (cfg.sampleRate as number) || 1000;
    if (signal.length === 0) return { success: false, data: "No signal provided" };
    const result = fourierTransform(signal, sampleRate);
    return {
      success: true,
      data: {
        transform: "Fourier",
        nFrequencies: result.frequencies.length,
        frequencies: result.frequencies.slice(0, 50),
        magnitudes: result.magnitude.slice(0, 50),
        phases: result.phase.slice(0, 50),
        peakFrequency: result.frequencies[result.magnitude.indexOf(Math.max(...result.magnitude))],
      },
    };
  }

  return { success: false, data: `Unknown transform type: ${type}` };
}

// ─── 4. Matrix Calculator ──────────────────────────────────────────────────

export const MATRIX_CALC_MANIFEST: ToolManifest = {
  id: "math.matrix",
  name: "Matrix Calculator",
  description: "Compute matrix determinant, inverse, eigenvalues, trace, rank. Supports arbitrary NxN matrices.",
  category: "math",
  version: "1.0.0",
  tags: ["matrix", "determinant", "inverse", "eigenvalue", "linear-algebra"],
  author: "stitaP", license: "MIT", icon: "Grid3X3", color: "#10b981",
  parameters: [
    { name: "operation", type: "enum", description: "Matrix operation", required: true, enum: ["determinant", "inverse", "trace", "transpose"] },
    { name: "matrix", type: "array", description: "Matrix as array of arrays", required: true },
  ],
  capabilities: [{ name: "matrix-calc", description: "Matrix operations (det, inverse, trace, transpose)", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function matrixCalc(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const A = cfg.matrix as number[][];
  const op = cfg.operation as string;

  if (!A || !A.length) return { success: false, data: "No matrix provided" };

  try {
    switch (op) {
      case "determinant":
        return { success: true, data: { determinant: matrixDet(A), size: `${A.length}×${A[0].length}` } };
      case "inverse":
        return { success: true, data: { inverse: matrixInverse(A), size: `${A.length}×${A[0].length}` } };
      case "trace": {
        const trace = A.reduce((s, row, i) => s + (row[i] || 0), 0);
        return { success: true, data: { trace, size: `${A.length}×${A[0].length}` } };
      }
      case "transpose": {
        const n = A.length, m = A[0].length;
        const T = Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => A[i][j]));
        return { success: true, data: { transpose: T, size: `${m}×${n}` } };
      }
      default:
        return { success: false, data: `Unknown operation: ${op}` };
    }
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const SYMBOLIC_TOOLS: ToolManifest[] = [
  SYMBOLIC_SOLVE_MANIFEST,
  SCIENCE_SOLVE_MANIFEST,
  TRANSFORM_MANIFEST,
  MATRIX_CALC_MANIFEST,
];

export const SYMBOLIC_EXECUTORS: Record<string, (input: ToolInput) => ToolOutput> = {
  "math.symbolic.solve": symbolicSolve,
  "math.science.solve": scienceSolve,
  "math.transform": transformCalc,
  "math.matrix": matrixCalc,
};

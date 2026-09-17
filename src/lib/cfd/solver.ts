/**
 * Navier-Stokes Solver (SIMPLE Algorithm)
 * ───────────────────────────────────────
 * Incompressible 2D Navier-Stokes solver using the SIMPLE
 * (Semi-Implicit Method for Pressure-Linked Equations) algorithm.
 *
 * Solves:
 *   ∂u/∂t + ∇·(uu) = -∇p/ρ + ν∇²u   (x-momentum)
 *   ∂v/∂t + ∇·(uv) = -∇p/ρ + ν∇²v   (y-momentum)
 *   ∇·u = 0                            (continuity)
 *
 * Algorithm (per time step):
 *   1. Solve momentum equations with guessed pressure → u*, v*
 *   2. Solve pressure correction equation → p'
 *   3. Correct pressure: p = p* + α_p * p'
 *   4. Correct velocities: u = u* + d*(∇p')
 *
 * Zero dependencies beyond cfd/mesh.ts, cfd/linalg.ts, cfd/discretization.ts.
 */

import type { Mesh2D } from "./mesh";
import { createLidDrivenCavity, createChannelFlow, createBackwardFacingStep, type CFDProblem } from "./mesh";
import {
  interpolateToFaces, applyBC, zerosField, computeDivergence,
  buildLaplacianMatrix, buildPressurePoissonMatrix, buildVelocityCorrectionCoeffs,
  rhieChowInterpolation,
  type ScalarField,
} from "./discretization";
import {
  buildSparseMatrix, solveGaussSeidel, solveSOR, solveConjugateGradient,
  solveBiCGSTAB, solvePCG, ilu0,
  spMV, type SparseMatrix,
} from "./linalg";

// ─── Solver Configuration ───────────────────────────────────────────────────

export interface SIMPLEConfig {
  /** Maximum outer iterations per time step */
  maxOuterIter: number;
  /** Maximum inner iterations for momentum equations */
  maxInnerIter: number;
  /** Maximum iterations for pressure Poisson */
  maxPressureIter: number;
  /** Convergence tolerance (residual norm) */
  tolerance: number;
  /** Pressure under-relaxation (0-1, typical 0.3) */
  alphaP: number;
  /** Velocity under-relaxation (0-1, typical 0.7) */
  alphaU: number;
  /** Time step size (for unsteady, 0 = steady) */
  dt: number;
  /** Number of time steps (for unsteady) */
  nTimeSteps: number;
  /** Convection scheme */
  convectionScheme: "upwind" | "central" | "blended";
  /** Linear solver for momentum */
  momentumSolver: "gauss_seidel" | "sor" | "cg" | "bicgstab";
  /** Linear solver for pressure */
  pressureSolver: "gauss_seidel" | "sor" | "cg" | "bicgstab";
  /** SOR relaxation factor */
  omega: number;
  /** Print interval for convergence */
  printInterval: number;
}

export const DEFAULT_CONFIG: SIMPLEConfig = {
  maxOuterIter: 500,
  maxInnerIter: 100,
  maxPressureIter: 200,
  tolerance: 1e-6,
  alphaP: 0.3,
  alphaU: 0.7,
  dt: 0,
  nTimeSteps: 1,
  convectionScheme: "upwind",
  momentumSolver: "bicgstab",
  pressureSolver: "cg",
  omega: 1.2,
  printInterval: 10,
};

// ─── Solver State ───────────────────────────────────────────────────────────

export interface SolverState {
  u: number[];
  v: number[];
  p: number[];
  uStar: number[];
  vStar: number[];
  pPrime: number[];
}

// ─── Convergence Log Entry ──────────────────────────────────────────────────

export interface ConvergenceEntry {
  iteration: number;
  uResidual: number;
  vResidual: number;
  pResidual: number;
  continuityResidual: number;
  maxDivU: number;
  massImbalance: number;
}

// ─── Solver Result ──────────────────────────────────────────────────────────

export interface SIMPLEResult {
  /** Final u-velocity field */
  u: number[];
  /** Final v-velocity field */
  v: number[];
  /** Final pressure field */
  p: number[];
  /** Convergence history */
  history: ConvergenceEntry[];
  /** Did the solver converge? */
  converged: boolean;
  /** Number of outer iterations taken */
  iterations: number;
  /** Wall clock time (ms) */
  wallTimeMs: number;
  /** Final max divergence */
  maxContinuityResidual: number;
  /** CFL number (max) */
  maxCFL: number;
  /** Reynolds number */
  Re: number;
}

// ─── SIMPLE Algorithm ───────────────────────────────────────────────────────

export function solveSIMPLE(
  problem: CFDProblem,
  config: Partial<SIMPLEConfig> = {},
): SIMPLEResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { mesh, rho, nu } = problem;
  const nCells = mesh.nCells;

  // Initialize fields
  const state: SolverState = {
    u: [...problem.u0],
    v: [...problem.v0],
    p: [...problem.p0],
    uStar: new Array(nCells).fill(0),
    vStar: new Array(nCells).fill(0),
    pPrime: new Array(nCells).fill(0),
  };

  const history: ConvergenceEntry[] = [];
  const startTime = Date.now();
  let converged = false;

  // Pre-compute diffusion coefficient
  const gamma = rho * nu;

  // Build Laplacian matrix for diffusion
  const laplacianU = buildLaplacianMatrix(mesh, gamma);
  const laplacianV = buildLaplacianMatrix(mesh, gamma);

  // Build pressure Poisson matrix
  const pressureMatrix = buildPressurePoissonMatrix(mesh);

  // Velocity correction coefficients
  const dCoeffs = buildVelocityCorrectionCoeffs(mesh, rho, cfg.dt > 0 ? cfg.dt : 1);

  const isSteady = cfg.dt === 0 || cfg.dt <= 0;
  const nTimeSteps = isSteady ? 1 : cfg.nTimeSteps;

  let finalMaxCFL = 0;

  for (let timeStep = 0; timeStep < nTimeSteps; timeStep++) {
    for (let outer = 1; outer <= cfg.maxOuterIter; outer++) {
      const totalIter = timeStep * cfg.maxOuterIter + outer;

      // ─── Step 1: Solve Momentum Equations ──────────────────────────────
      // Build convection-diffusion matrix and RHS for u-momentum
      const { uFace, vFace } = rhieChowInterpolation(
        mesh, state.u, state.v, state.p, dCoeffs,
      );

      // u-momentum: build matrix
      const uTriplets = buildMomentumEquation(mesh, uFace, vFace, state.u, rho, gamma, cfg);
      const uMatrix = buildSparseMatrix(nCells, uTriplets.uMatrix);
      const uRHS = uTriplets.rhs;

      // v-momentum
      const vTriplets = buildMomentumEquation_V(mesh, uFace, vFace, state.v, rho, gamma, cfg);
      const vMatrix = buildSparseMatrix(nCells, vTriplets.vMatrix);
      const vRHS = vTriplets.rhs;

      // Solve momentum systems
      const uSol = solveLinearSystem(uMatrix, uRHS, cfg.momentumSolver, cfg);
      const vSol = solveLinearSystem(vMatrix, vRHS, cfg.momentumSolver, cfg);

      // Under-relax: u* = alphaU * u_new + (1-alphaU) * u_old
      for (let i = 0; i < nCells; i++) {
        state.uStar[i] = cfg.alphaU * uSol[i] + (1 - cfg.alphaU) * state.u[i];
        state.vStar[i] = cfg.alphaU * vSol[i] + (1 - cfg.alphaU) * state.v[i];
      }

      // ─── Step 2: Pressure Correction ──────────────────────────────────
      // Compute divergence of u*
      const starFaces = rhieChowInterpolation(
        mesh, state.uStar, state.vStar, state.p, dCoeffs,
      );
      const divUStar = computeDivergence(mesh, starFaces.uFace, starFaces.vFace);

      // Build pressure correction RHS: b_p = (ρ/Δt) * div(u*)
      const bP = divUStar.map((d) => rho * d);

      // Solve pressure correction
      const pCorrSol = solveLinearSystem(pressureMatrix, bP, cfg.pressureSolver, cfg);

      // Under-relax pressure correction
      for (let i = 0; i < nCells; i++) {
        state.pPrime[i] = pCorrSol[i];
      }

      // ─── Step 3: Correct Pressure ─────────────────────────────────────
      for (let i = 0; i < nCells; i++) {
        state.p[i] += cfg.alphaP * state.pPrime[i];
      }

      // ─── Step 4: Correct Velocities ───────────────────────────────────
      for (let f = 0; f < mesh.nFaces; f++) {
        const face = mesh.faces[f];
        if (face.leftCell < 0 || face.rightCell < 0) continue;

        const cL = mesh.cells[face.leftCell];
        const cR = mesh.cells[face.rightCell];
        const dist = Math.sqrt(
          (cR.centroid[0] - cL.centroid[0]) ** 2 + (cR.centroid[1] - cL.centroid[1]) ** 2,
        );
        const dpdn = (state.pPrime[face.rightCell] - state.pPrime[face.leftCell]) / dist;
        const corr = dCoeffs[f] * dpdn;

        state.u[face.leftCell] += corr * face.normal[0];
        state.v[face.leftCell] += corr * face.normal[1];
      }

      // Apply BCs
      applyBC(mesh, { cellValues: state.u, faceValues: starFaces.uFace }, "u");
      applyBC(mesh, { cellValues: state.v, faceValues: starFaces.vFace }, "v");

      // ─── Convergence Check ─────────────────────────────────────────────
      const finalUFace = rhieChowInterpolation(
        mesh, state.u, state.v, state.p, dCoeffs,
      );
      const finalDivU = computeDivergence(mesh, finalUFace.uFace, finalUFace.vFace);
      const maxDiv = Math.max(...finalDivU.map(Math.abs));
      const massImb = finalDivU.reduce((sum, d) => sum + Math.abs(d), 0);

      // Compute residuals
      const uResid = computeResidual(uMatrix, uSol, uRHS);
      const vResid = computeResidual(vMatrix, vSol, vRHS);

      if (outer % cfg.printInterval === 0 || outer === 1) {
        history.push({
          iteration: totalIter,
          uResidual: uResid,
          vResidual: vResid,
          pResidual: massImb,
          continuityResidual: maxDiv,
          maxDivU: maxDiv,
          massImbalance: massImb,
        });
      }

      // Check convergence
      if (maxDiv < cfg.tolerance) {
        converged = true;
        break;
      }
    }

    if (converged && isSteady) break;
  }

  // Compute final CFL
  finalMaxCFL = computeCFL(mesh, state.u, state.v, cfg.dt > 0 ? cfg.dt : 1);

  return {
    u: state.u,
    v: state.v,
    p: state.p,
    history,
    converged,
    iterations: history.length > 0 ? history[history.length - 1].iteration : 0,
    wallTimeMs: Date.now() - startTime,
    maxContinuityResidual: history.length > 0 ? history[history.length - 1].continuityResidual : 0,
    maxCFL: finalMaxCFL,
    Re: problem.Re,
  };
}

// ─── Momentum Equation Builder (u-component) ────────────────────────────────

function buildMomentumEquation(
  mesh: Mesh2D,
  uFace: number[],
  vFace: number[],
  uCell: number[],
  rho: number,
  gamma: number,
  cfg: SIMPLEConfig,
): { uMatrix: Array<{ i: number; j: number; val: number }>; rhs: number[] } {
  const nCells = mesh.nCells;
  const triplets: Array<{ i: number; j: number; val: number }> = [];
  const rhs = new Array(nCells).fill(0);

  for (let f = 0; f < mesh.nFaces; f++) {
    const face = mesh.faces[f];

    if (face.leftCell >= 0 && face.rightCell >= 0) {
      // Internal face
      const cL = mesh.cells[face.leftCell];
      const cR = mesh.cells[face.rightCell];
      const dx = cR.centroid[0] - cL.centroid[0];
      const dy = cR.centroid[1] - cL.centroid[1];
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Convection flux
      const massFlux = rho * (uFace[f] * face.normal[0] + vFace[f] * face.normal[1]) * face.area;

      // Diffusion coefficient
      const diffCoeff = (gamma * face.area) / dist;

      if (massFlux >= 0) {
        triplets.push({ i: face.leftCell, j: face.leftCell, val: massFlux + diffCoeff });
        triplets.push({ i: face.leftCell, j: face.rightCell, val: -diffCoeff });
      } else {
        triplets.push({ i: face.rightCell, j: face.rightCell, val: -massFlux + diffCoeff });
        triplets.push({ i: face.rightCell, j: face.leftCell, val: -diffCoeff });
      }
    } else {
      // Boundary face
      const cell = face.leftCell >= 0 ? face.leftCell : face.rightCell;
      if (cell >= 0) {
        const bcIdx = face.bcIndex;
        if (bcIdx >= 0) {
          const bc = mesh.boundaryConditions[bcIdx];
          if (bc.type === "wall" || bc.type === "inlet") {
            // Dirichlet BC: add to RHS
            const prescribed = bc.u ?? 0;
            const c = mesh.cells[cell].centroid;
            const dist = Math.sqrt(
              (face.centroid[0] - c[0]) ** 2 + (face.centroid[1] - c[1]) ** 2,
            );
            const diffCoeff = (gamma * face.area) / dist;
            triplets.push({ i: cell, j: cell, val: diffCoeff });
            rhs[cell] += diffCoeff * prescribed;
          } else if (bc.type === "outlet") {
            // Zero gradient: no contribution to matrix or RHS
          }
        }
      }
    }
  }

  // Add diagonal dominance (row sum = 0 for pure convection-diag)
  for (let i = 0; i < nCells; i++) {
    let rowSum = 0;
    for (const t of triplets) {
      if (t.i === i && t.j !== i) rowSum += t.val;
    }
    // Ensure diagonally dominant
    const diagIdx = triplets.findIndex((t) => t.i === i && t.j === i);
    if (diagIdx >= 0) {
      if (triplets[diagIdx].val < rowSum) {
        triplets[diagIdx].val = rowSum + 1e-10;
      }
    } else {
      triplets.push({ i, j: i, val: rowSum + 1e-10 });
    }
  }

  return { uMatrix: triplets, rhs };
}

// ─── Momentum Equation Builder (v-component) ────────────────────────────────

function buildMomentumEquation_V(
  mesh: Mesh2D,
  uFace: number[],
  vFace: number[],
  vCell: number[],
  rho: number,
  gamma: number,
  cfg: SIMPLEConfig,
): { vMatrix: Array<{ i: number; j: number; val: number }>; rhs: number[] } {
  const nCells = mesh.nCells;
  const triplets: Array<{ i: number; j: number; val: number }> = [];
  const rhs = new Array(nCells).fill(0);

  for (let f = 0; f < mesh.nFaces; f++) {
    const face = mesh.faces[f];

    if (face.leftCell >= 0 && face.rightCell >= 0) {
      const cL = mesh.cells[face.leftCell];
      const cR = mesh.cells[face.rightCell];
      const dist = Math.sqrt(
        (cR.centroid[0] - cL.centroid[0]) ** 2 + (cR.centroid[1] - cL.centroid[1]) ** 2,
      );

      const massFlux = rho * (uFace[f] * face.normal[0] + vFace[f] * face.normal[1]) * face.area;
      const diffCoeff = (gamma * face.area) / dist;

      if (massFlux >= 0) {
        triplets.push({ i: face.leftCell, j: face.leftCell, val: massFlux + diffCoeff });
        triplets.push({ i: face.leftCell, j: face.rightCell, val: -diffCoeff });
      } else {
        triplets.push({ i: face.rightCell, j: face.rightCell, val: -massFlux + diffCoeff });
        triplets.push({ i: face.rightCell, j: face.leftCell, val: -diffCoeff });
      }
    } else {
      const cell = face.leftCell >= 0 ? face.leftCell : face.rightCell;
      if (cell >= 0) {
        const bcIdx = face.bcIndex;
        if (bcIdx >= 0) {
          const bc = mesh.boundaryConditions[bcIdx];
          if (bc.type === "wall" || bc.type === "inlet") {
            const prescribed = bc.v ?? 0;
            const c = mesh.cells[cell].centroid;
            const dist = Math.sqrt(
              (face.centroid[0] - c[0]) ** 2 + (face.centroid[1] - c[1]) ** 2,
            );
            const diffCoeff = (gamma * face.area) / dist;
            triplets.push({ i: cell, j: cell, val: diffCoeff });
            rhs[cell] += diffCoeff * prescribed;
          }
        }
      }
    }
  }

  // Diagonal dominance
  for (let i = 0; i < nCells; i++) {
    let rowSum = 0;
    for (const t of triplets) {
      if (t.i === i && t.j !== i) rowSum += t.val;
    }
    const diagIdx = triplets.findIndex((t) => t.i === i && t.j === i);
    if (diagIdx >= 0) {
      if (triplets[diagIdx].val < rowSum) triplets[diagIdx].val = rowSum + 1e-10;
    } else {
      triplets.push({ i, j: i, val: rowSum + 1e-10 });
    }
  }

  return { vMatrix: triplets, rhs };
}

// ─── Linear System Solver Dispatch ──────────────────────────────────────────

function solveLinearSystem(
  A: SparseMatrix,
  b: number[],
  method: string,
  cfg: SIMPLEConfig,
): number[] {
  const maxIter = method.includes("cg") || method.includes("bicgstab") ? cfg.maxPressureIter : cfg.maxInnerIter;

  switch (method) {
    case "gauss_seidel":
      return solveGaussSeidel(A, b, undefined, maxIter, cfg.tolerance).solution;
    case "sor":
      return solveSOR(A, b, cfg.omega, undefined, maxIter, cfg.tolerance).solution;
    case "cg":
      return solveConjugateGradient(A, b, undefined, maxIter, cfg.tolerance).solution;
    case "bicgstab":
      return solveBiCGSTAB(A, b, undefined, maxIter, cfg.tolerance).solution;
    default:
      return solveBiCGSTAB(A, b, undefined, maxIter, cfg.tolerance).solution;
  }
}

// ─── Residual Computation ───────────────────────────────────────────────────

function computeResidual(A: SparseMatrix, x: number[], b: number[]): number {
  const Ax = spMV(A, x);
  let maxResid = 0;
  for (let i = 0; i < b.length; i++) {
    const r = Math.abs(b[i] - Ax[i]);
    if (r > maxResid) maxResid = r;
  }
  return maxResid;
}

// ─── CFL Number ─────────────────────────────────────────────────────────────

function computeCFL(
  mesh: Mesh2D,
  u: number[],
  v: number[],
  dt: number,
): number {
  let maxCFL = 0;
  for (let i = 0; i < mesh.nCells; i++) {
    const dx = Math.min(mesh.dx[i % mesh.ni], mesh.dy[Math.floor(i / mesh.ni)]);
    const speed = Math.sqrt(u[i] ** 2 + v[i] ** 2);
    const cfl = (speed * dt) / dx;
    if (cfl > maxCFL) maxCFL = cfl;
  }
  return maxCFL;
}

// ─── Benchmark Problem Runners ──────────────────────────────────────────────

/** Solve lid-driven cavity at given Reynolds number */
export function solveLidDrivenCavity(
  Re = 100,
  ni = 32,
  nj = 32,
  config: Partial<SIMPLEConfig> = {},
): SIMPLEResult {
  const problem = createLidDrivenCavity(1.0, 1.0, ni, nj, Re);
  return solveSIMPLE(problem, config);
}

/** Solve channel flow at given Reynolds number */
export function solveChannel(
  Re = 100,
  ni = 64,
  nj = 32,
  config: Partial<SIMPLEConfig> = {},
): SIMPLEResult {
  const problem = createChannelFlow(5.0, 1.0, ni, nj, Re);
  return solveSIMPLE(problem, config);
}

/** Solve backward-facing step at given Reynolds number */
export function solveBackwardStep(
  Re = 800,
  ni = 80,
  nj = 32,
  config: Partial<SIMPLEConfig> = {},
): SIMPLEResult {
  const problem = createBackwardFacingStep(Re, ni, nj);
  return solveSIMPLE(problem, config);
}

// ─── Post-Processing Utilities ──────────────────────────────────────────────

/** Compute velocity magnitude at each cell */
export function computeVelocityMagnitude(u: number[], v: number[]): number[] {
  return u.map((ui, i) => Math.sqrt(ui ** 2 + v[i] ** 2));
}

/** Compute vorticity (∂v/∂x - ∂u/∂y) on cell centers */
export function computeVorticity(mesh: Mesh2D, u: number[], v: number[]): number[] {
  const omega = new Array(mesh.nCells).fill(0);

  for (let j = 1; j < mesh.nj - 1; j++) {
    for (let i = 1; i < mesh.ni - 1; i++) {
      const idx = mesh.cellIndex(i, j);
      const dvdx = (v[mesh.cellIndex(i + 1, j)] - v[mesh.cellIndex(i - 1, j)]) /
        (mesh.xNodes[i + 1] - mesh.xNodes[i - 1]);
      const dudy = (u[mesh.cellIndex(i, j + 1)] - u[mesh.cellIndex(i, j - 1)]) /
        (mesh.yNodes[j + 1] - mesh.yNodes[j - 1]);
      omega[idx] = dvdx - dudy;
    }
  }

  return omega;
}

/** Extract centerline data (for validation against benchmark data) */
export function extractCenterline(
  mesh: Mesh2D,
  field: number[],
  direction: "horizontal" | "vertical",
  position: number,
): Array<{ coord: number; value: number }> {
  const result: Array<{ coord: number; value: number }> = [];

  if (direction === "horizontal") {
    // Find j index closest to position
    let bestJ = 0;
    let bestDist = Infinity;
    for (let j = 0; j < mesh.nj; j++) {
      const y = mesh.cells[mesh.cellIndex(0, j)].centroid[1];
      if (Math.abs(y - position) < bestDist) {
        bestDist = Math.abs(y - position);
        bestJ = j;
      }
    }
    for (let i = 0; i < mesh.ni; i++) {
      const idx = mesh.cellIndex(i, bestJ);
      result.push({ coord: mesh.cells[idx].centroid[0], value: field[idx] });
    }
  } else {
    let bestI = 0;
    let bestDist = Infinity;
    for (let i = 0; i < mesh.ni; i++) {
      const x = mesh.cells[mesh.cellIndex(i, 0)].centroid[0];
      if (Math.abs(x - position) < bestDist) {
        bestDist = Math.abs(x - position);
        bestI = i;
      }
    }
    for (let j = 0; j < mesh.nj; j++) {
      const idx = mesh.cellIndex(bestI, j);
      result.push({ coord: mesh.cells[idx].centroid[1], value: field[idx] });
    }
  }

  return result;
}

/** Compute drag and lift coefficients on a surface (for validation) */
export function computeDragLift(
  mesh: Mesh2D,
  u: number[],
  v: number[],
  p: number[],
  rho: number,
  mu: number,
  Uinf: number,
  Lref: number,
  wallFaceIndices: number[],
): { Cd: number; Cl: number; pressureForce: number; frictionForce: number } {
  let Fx_pressure = 0;
  let Fy_pressure = 0;
  let Fx_friction = 0;
  let Fy_friction = 0;

  for (const f of wallFaceIndices) {
    const face = mesh.faces[f];
    const cell = face.leftCell >= 0 ? face.leftCell : face.rightCell;
    if (cell < 0) continue;

    // Pressure force: F_p = -p * n * A
    Fx_pressure -= p[cell] * face.normal[0] * face.area;
    Fy_pressure -= p[cell] * face.normal[1] * face.area;

    // Friction force (simplified): τ = μ * du/dn
    // For no-slip wall, du/dn ≈ (u_cell - 0) / (d/2)
    const c = mesh.cells[cell].centroid;
    const d = Math.sqrt(
      (face.centroid[0] - c[0]) ** 2 + (face.centroid[1] - c[1]) ** 2,
    );
    const du_dn = u[cell] / Math.max(d, 1e-10);
    const dv_dn = v[cell] / Math.max(d, 1e-10);
    const tau_w = mu * Math.sqrt(du_dn ** 2 + dv_dn ** 2);

    // Tangent direction (perpendicular to normal)
    const tx = -face.normal[1];
    const ty = face.normal[0];
    Fx_friction += tau_w * tx * face.area;
    Fy_friction += tau_w * ty * face.area;
  }

  const pressureForce = Math.sqrt(Fx_pressure ** 2 + Fy_pressure ** 2);
  const frictionForce = Math.sqrt(Fx_friction ** 2 + Fy_friction ** 2);
  const dynamicPressure = 0.5 * rho * Uinf ** 2;

  return {
    Cd: (Fx_pressure + Fx_friction) / (dynamicPressure * Lref),
    Cl: (Fy_pressure + Fy_friction) / (dynamicPressure * Lref),
    pressureForce,
    frictionForce,
  };
}

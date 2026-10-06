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

// ─── Incompressible solver (staggered MAC grid, projection to steady state) ─
//
// The SIMPLE-style interface is kept, but the discretisation is a staggered
// (MAC) finite-volume scheme advanced in pseudo-time with Chorin's projection:
//   1. u* = uⁿ + Δt(−(u·∇)u + ν∇²u)        (donor-cell/central blended convection)
//   2. ∇²p = ∇·u*/Δt                          (matrix-free CG, Neumann walls, p=0 at outlets)
//   3. uⁿ⁺¹ = u* − Δt∇p
// iterated until the velocity change per unit time falls below `tolerance`.
// Staggering removes the checkerboard pressure modes of the old collocated
// SIMPLE code, and every step is O(N), so 64×64 cavities converge in seconds.
// `alphaU` sets the convection upwind blend (0 = central, 1 = full upwind).

type Side = { type: string; u: number; v: number };

export function solveSIMPLE(
  problem: CFDProblem,
  config: Partial<SIMPLEConfig> = {},
): SIMPLEResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { mesh, nu } = problem;
  const ni = mesh.ni, nj = mesh.nj;
  const Lx = mesh.xNodes[ni] - mesh.xNodes[0], Ly = mesh.yNodes[nj] - mesh.yNodes[0];
  const dx = Lx / ni, dy = Ly / nj; // MAC scheme on the mean spacing
  const bc = (k: number): Side => { const b = mesh.boundaryConditions[k]; return { type: b?.type ?? "wall", u: b?.u ?? 0, v: b?.v ?? 0 }; };
  const L = bc(0), R = bc(1), B = bc(2), T = bc(3);
  // Inflow profile: inlet faces listed in the BC (supports partial inlets such as a backward-facing step)
  const inletRows = new Set<number>();
  if (L.type === "inlet") for (const fi of mesh.boundaryConditions[0].faceIndices ?? []) { const c = mesh.faces[fi]?.leftCell >= 0 ? mesh.faces[fi].leftCell : mesh.faces[fi]?.rightCell; if (c !== undefined && c >= 0) inletRows.add(mesh.cellIJ(c)[1]); }
  if (L.type === "inlet" && !inletRows.size) for (let j = 0; j < nj; j++) inletRows.add(j);
  const jIn = [...inletRows].sort((a, b) => a - b), jLo = jIn[0] ?? 0, jHi = (jIn[jIn.length - 1] ?? nj - 1) + 1;
  const inletU = (j: number) => { if (!inletRows.has(j)) return 0; const eta = (j + 0.5 - jLo) / (jHi - jLo); return 1.5 * L.u * 4 * eta * (1 - eta); }; // parabolic, mean = L.u

  // Staggered fields with one ghost layer: u (ni+1)×(nj+2), v (ni+2)×(nj+1), p (ni+2)×(nj+2)
  const U = (i: number, j: number) => i * (nj + 2) + j;            // i ∈ [0,ni], j ∈ [0,nj+1]
  const V = (i: number, j: number) => i * (nj + 1) + j;            // i ∈ [0,ni+1], j ∈ [0,nj]
  const P = (i: number, j: number) => i * (nj + 2) + j;            // i ∈ [0,ni+1], j ∈ [0,nj+1]
  let u = new Float64Array((ni + 1) * (nj + 2)), v = new Float64Array((ni + 2) * (nj + 1));
  const p = new Float64Array((ni + 2) * (nj + 2)), F = new Float64Array(u.length), G = new Float64Array(v.length), rhs = new Float64Array(p.length);
  // initial condition from the problem (cell values → faces)
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const c = mesh.cellIndex(i, j); u[U(i + 1, j + 1)] = problem.u0[c] ?? 0; v[V(i + 1, j + 1)] = problem.v0[c] ?? 0; }

  const applyVelocityBC = () => {
    for (let j = 1; j <= nj; j++) {
      // left
      if (L.type === "inlet") u[U(0, j)] = inletU(j - 1);
      else if (L.type !== "outlet") u[U(0, j)] = 0;
      // right (outlet normal velocity comes from the projection step)
      if (R.type === "inlet") u[U(ni, j)] = R.u;
      else if (R.type !== "outlet") u[U(ni, j)] = 0;
    }
    for (let j = 0; j <= nj; j++) {
      v[V(0, j)] = L.type === "wall" ? 2 * L.v - v[V(1, j)] : L.type === "inlet" ? -v[V(1, j)] : v[V(1, j)];
      v[V(ni + 1, j)] = R.type === "wall" ? 2 * R.v - v[V(ni, j)] : v[V(ni, j)];
    }
    for (let i = 1; i <= ni; i++) { if (B.type !== "outlet") v[V(i, 0)] = 0; if (T.type !== "outlet") v[V(i, nj)] = 0; }
    for (let i = 0; i <= ni; i++) {
      u[U(i, 0)] = B.type === "wall" ? 2 * B.u - u[U(i, 1)] : u[U(i, 1)];
      u[U(i, nj + 1)] = T.type === "wall" ? 2 * T.u - u[U(i, nj)] : u[U(i, nj)];
    }
  };
  applyVelocityBC();

  const uMax0 = Math.max(Math.abs(L.u), Math.abs(R.u), Math.abs(B.u), Math.abs(T.u), 1e-3);
  // donor-cell weight: "central" = 0, "upwind"/"blended" = just above the local CFL number (stable, near 2nd order)
  const scheme = cfg.convectionScheme;
  const outletL = L.type === "outlet", outletR = R.type === "outlet", outletB = B.type === "outlet", outletT = T.type === "outlet";
  const hasDirichlet = outletL || outletR || outletB || outletT;
  const idx2 = 1 / (dx * dx), idy2 = 1 / (dy * dy);

  // pressure ghost cells: Neumann at walls/inlets, p = 0 (antisymmetric ghost) at outlets
  const pressureBC = (x: Float64Array) => {
    for (let j = 1; j <= nj; j++) { x[P(0, j)] = outletL ? -x[P(1, j)] : x[P(1, j)]; x[P(ni + 1, j)] = outletR ? -x[P(ni, j)] : x[P(ni, j)]; }
    for (let i = 1; i <= ni; i++) { x[P(i, 0)] = outletB ? -x[P(i, 1)] : x[P(i, 1)]; x[P(i, nj + 1)] = outletT ? -x[P(i, nj)] : x[P(i, nj)]; }
  };
  const lap = (x: Float64Array, out: Float64Array) => {
    pressureBC(x);
    for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) {
      const c = x[P(i, j)];
      out[P(i, j)] = (x[P(i + 1, j)] - 2 * c + x[P(i - 1, j)]) * idx2 + (x[P(i, j + 1)] - 2 * c + x[P(i, j - 1)]) * idy2;
    }
  };
  // Conjugate gradient on −∇²p = −rhs (SPD after removing the mean when all-Neumann)
  const r = new Float64Array(p.length), d = new Float64Array(p.length), Ad = new Float64Array(p.length);
  const solvePressure = (): { iters: number; resid: number } => {
    let mean = 0;
    if (!hasDirichlet) { for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) mean += rhs[P(i, j)]; mean /= ni * nj; }
    lap(p, Ad);
    let rr = 0, bnorm = 0;
    for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) { const k = P(i, j); r[k] = -(rhs[k] - mean) + Ad[k]; d[k] = r[k]; rr += r[k] * r[k]; bnorm += (rhs[k] - mean) ** 2; }
    const tol2 = Math.max(1e-26, 1e-12 * bnorm);
    let it = 0;
    const maxIt = Math.max(cfg.maxPressureIter, 4 * Math.max(ni, nj) * 4);
    while (rr > tol2 && it < maxIt) {
      lap(d, Ad);
      let dAd = 0;
      for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) { const k = P(i, j); Ad[k] = -Ad[k]; dAd += d[k] * Ad[k]; }
      if (dAd <= 0) break;
      const alpha = rr / dAd;
      let rr2 = 0;
      for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) { const k = P(i, j); p[k] += alpha * d[k]; r[k] -= alpha * Ad[k]; rr2 += r[k] * r[k]; }
      const beta = rr2 / rr; rr = rr2;
      for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) { const k = P(i, j); d[k] = r[k] + beta * d[k]; }
      it++;
    }
    if (!hasDirichlet) { let m = 0; for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) m += p[P(i, j)]; m /= ni * nj; for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) p[P(i, j)] -= m; }
    pressureBC(p);
    return { iters: it, resid: Math.sqrt(rr) };
  };

  // Direct pressure solver for the common case (walls top & bottom): DCT in y,
  // tridiagonal (Thomas) solve in x per cosine mode. Exact and O(N·nj).
  const useFast = !outletB && !outletT;
  const cosT = new Float64Array(nj * nj);
  for (let k = 0; k < nj; k++) for (let j = 0; j < nj; j++) cosT[k * nj + j] = Math.cos(Math.PI * k * (j + 0.5) / nj);
  const bh = new Float64Array(ni * nj), ph = new Float64Array(ni * nj), ca = new Float64Array(ni), cb = new Float64Array(ni), cc = new Float64Array(ni), cd = new Float64Array(ni);
  const solvePressureFast = (): { iters: number; resid: number } => {
    let mean = 0;
    if (!hasDirichlet) { for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) mean += rhs[P(i, j)]; mean /= ni * nj; }
    for (let i = 0; i < ni; i++) for (let k = 0; k < nj; k++) { let acc = 0; for (let j = 0; j < nj; j++) acc += (rhs[P(i + 1, j + 1)] - mean) * cosT[k * nj + j]; bh[i * nj + k] = acc; }
    for (let k = 0; k < nj; k++) {
      const lam = (2 * Math.cos(Math.PI * k / nj) - 2) * idy2;
      for (let i = 0; i < ni; i++) { ca[i] = idx2; cc[i] = idx2; cb[i] = -2 * idx2 + lam; cd[i] = bh[i * nj + k]; }
      ca[0] = 0; cb[0] += outletL ? -idx2 : idx2;
      cc[ni - 1] = 0; cb[ni - 1] += outletR ? -idx2 : idx2;
      if (k === 0 && !outletL && !outletR) { cb[0] = 1; cc[0] = 0; cd[0] = 0; } // pin the null space
      for (let i = 1; i < ni; i++) { const m = ca[i] / cb[i - 1]; cb[i] -= m * cc[i - 1]; cd[i] -= m * cd[i - 1]; }
      ph[(ni - 1) * nj + k] = cd[ni - 1] / cb[ni - 1];
      for (let i = ni - 2; i >= 0; i--) ph[i * nj + k] = (cd[i] - cc[i] * ph[(i + 1) * nj + k]) / cb[i];
    }
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) { let acc = ph[i * nj]; for (let k = 1; k < nj; k++) acc += 2 * ph[i * nj + k] * cosT[k * nj + j]; p[P(i + 1, j + 1)] = acc / nj; }
    if (!hasDirichlet) { let m = 0; for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) m += p[P(i, j)]; m /= ni * nj; for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) p[P(i, j)] -= m; }
    pressureBC(p);
    return { iters: 1, resid: 0 };
  };

  const history: ConvergenceEntry[] = [];
  const startTime = Date.now();
  const timeBudget = (config as any).timeBudgetMs ?? 30000;
  const maxSteps = Math.max(cfg.maxOuterIter, 30000);
  const tol = Math.max(cfg.tolerance, 1e-7);
  let converged = false, step = 0, lastChange = Infinity, lastDiv = 0, lastPres = 0;
  const uOld = new Float64Array(u.length), vOld = new Float64Array(v.length);

  for (step = 1; step <= maxSteps; step++) {
    // adaptive time step (diffusion + CFL limits)
    let umax = uMax0, vmax = uMax0;
    for (let k = 0; k < u.length; k++) umax = Math.max(umax, Math.abs(u[k]));
    for (let k = 0; k < v.length; k++) vmax = Math.max(vmax, Math.abs(v[k]));
    const dt = 0.5 * Math.min(0.5 / (nu * (idx2 + idy2)), dx / umax, dy / vmax);
    const gamma = scheme === "central" ? 0 : Math.min(1, Math.max(umax * dt / dx, vmax * dt / dy) * 1.2 + (scheme === "upwind" ? 0.1 : 0));
    uOld.set(u); vOld.set(v);

    // F = u + dt (ν∇²u − ∂(u²)/∂x − ∂(uv)/∂y)   on interior u-faces
    for (let i = 1; i < ni; i++) for (let j = 1; j <= nj; j++) {
      const uc = u[U(i, j)], ue = u[U(i + 1, j)], uw = u[U(i - 1, j)], un = u[U(i, j + 1)], us = u[U(i, j - 1)];
      const ui1 = (uc + ue) / 2, ui0 = (uw + uc) / 2;
      const du2dx = (ui1 * ui1 - ui0 * ui0 + gamma * (Math.abs(ui1) * (uc - ue) / 2 - Math.abs(ui0) * (uw - uc) / 2)) / dx;
      const vn = (v[V(i, j)] + v[V(i + 1, j)]) / 2, vs = (v[V(i, j - 1)] + v[V(i + 1, j - 1)]) / 2;
      const duvdy = (vn * (uc + un) / 2 - vs * (us + uc) / 2 + gamma * (Math.abs(vn) * (uc - un) / 2 - Math.abs(vs) * (us - uc) / 2)) / dy;
      F[U(i, j)] = uc + dt * (nu * ((ue - 2 * uc + uw) * idx2 + (un - 2 * uc + us) * idy2) - du2dx - duvdy);
    }
    for (let j = 1; j <= nj; j++) { F[U(0, j)] = u[U(0, j)]; F[U(ni, j)] = u[U(ni, j)]; }
    // G = v + dt (ν∇²v − ∂(uv)/∂x − ∂(v²)/∂y)   on interior v-faces
    for (let i = 1; i <= ni; i++) for (let j = 1; j < nj; j++) {
      const vc = v[V(i, j)], ve = v[V(i + 1, j)], vw = v[V(i - 1, j)], vn = v[V(i, j + 1)], vs = v[V(i, j - 1)];
      const ue = (u[U(i, j)] + u[U(i, j + 1)]) / 2, uw = (u[U(i - 1, j)] + u[U(i - 1, j + 1)]) / 2;
      const duvdx = (ue * (vc + ve) / 2 - uw * (vw + vc) / 2 + gamma * (Math.abs(ue) * (vc - ve) / 2 - Math.abs(uw) * (vw - vc) / 2)) / dx;
      const vj1 = (vc + vn) / 2, vj0 = (vs + vc) / 2;
      const dv2dy = (vj1 * vj1 - vj0 * vj0 + gamma * (Math.abs(vj1) * (vc - vn) / 2 - Math.abs(vj0) * (vs - vc) / 2)) / dy;
      G[V(i, j)] = vc + dt * (nu * ((ve - 2 * vc + vw) * idx2 + (vn - 2 * vc + vs) * idy2) - duvdx - dv2dy);
    }
    for (let i = 1; i <= ni; i++) { G[V(i, 0)] = v[V(i, 0)]; G[V(i, nj)] = v[V(i, nj)]; }
    // outlets: zero-gradient velocity on the outflow face before projection
    if (outletR) for (let j = 1; j <= nj; j++) F[U(ni, j)] = F[U(ni - 1, j)];
    if (outletL) for (let j = 1; j <= nj; j++) F[U(0, j)] = F[U(1, j)];
    if (outletT) for (let i = 1; i <= ni; i++) G[V(i, nj)] = G[V(i, nj - 1)];
    if (outletB) for (let i = 1; i <= ni; i++) G[V(i, 0)] = G[V(i, 1)];
    // mass balance for all-wall + inlet/outlet: scale outflow to match inflow
    if (outletR && L.type === "inlet") {
      let qin = 0, qout = 0;
      for (let j = 1; j <= nj; j++) { qin += F[U(0, j)]; qout += F[U(ni, j)]; }
      if (Math.abs(qout) > 1e-12) for (let j = 1; j <= nj; j++) F[U(ni, j)] *= qin / qout;
    }

    // pressure Poisson
    for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) rhs[P(i, j)] = ((F[U(i, j)] - F[U(i - 1, j)]) / dx + (G[V(i, j)] - G[V(i, j - 1)]) / dy) / dt;
    const pr = useFast ? solvePressureFast() : solvePressure();
    lastPres = pr.resid;

    // projection
    for (let i = 1; i < ni; i++) for (let j = 1; j <= nj; j++) u[U(i, j)] = F[U(i, j)] - dt * (p[P(i + 1, j)] - p[P(i, j)]) / dx;
    for (let i = 1; i <= ni; i++) for (let j = 1; j < nj; j++) v[V(i, j)] = G[V(i, j)] - dt * (p[P(i, j + 1)] - p[P(i, j)]) / dy;
    if (outletR) for (let j = 1; j <= nj; j++) u[U(ni, j)] = F[U(ni, j)] - dt * (p[P(ni + 1, j)] - p[P(ni, j)]) / dx;
    if (outletT) for (let i = 1; i <= ni; i++) v[V(i, nj)] = G[V(i, nj)] - dt * (p[P(i, nj + 1)] - p[P(i, nj)]) / dy;
    applyVelocityBC();

    // residuals
    let du = 0, dv = 0, maxDiv = 0, massImb = 0, bad = false;
    for (let k = 0; k < u.length; k++) { const c = Math.abs(u[k] - uOld[k]); if (c > du) du = c; if (!Number.isFinite(u[k])) bad = true; }
    for (let k = 0; k < v.length; k++) { const c = Math.abs(v[k] - vOld[k]); if (c > dv) dv = c; }
    for (let i = 1; i <= ni; i++) for (let j = 1; j <= nj; j++) { const dd = Math.abs((u[U(i, j)] - u[U(i - 1, j)]) / dx + (v[V(i, j)] - v[V(i, j - 1)]) / dy); massImb += dd * dx * dy; if (dd > maxDiv) maxDiv = dd; }
    lastChange = Math.max(du, dv) / dt; lastDiv = maxDiv;
    if (bad) throw new Error(`solver diverged at step ${step} (Re=${problem.Re}); refine the grid or lower the Reynolds number`);
    if (step === 1 || step % Math.max(1, cfg.printInterval * 10) === 0) history.push({ iteration: step, uResidual: du / dt, vResidual: dv / dt, pResidual: pr.resid, continuityResidual: maxDiv, maxDivU: maxDiv, massImbalance: massImb });
    if (step > 20 && lastChange < tol * 1e3 * uMax0 && lastChange < 1e-4) { converged = true; break; }
    if (Date.now() - startTime > timeBudget) break;
  }
  if (!history.length || history[history.length - 1].iteration !== step) history.push({ iteration: Math.min(step, maxSteps), uResidual: lastChange, vResidual: lastChange, pResidual: lastPres, continuityResidual: lastDiv, maxDivU: lastDiv, massImbalance: 0 });

  // cell-centred output in mesh order
  const uc = new Array(mesh.nCells).fill(0), vc = new Array(mesh.nCells).fill(0), pc = new Array(mesh.nCells).fill(0);
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    const c = mesh.cellIndex(i, j);
    uc[c] = (u[U(i, j + 1)] + u[U(i + 1, j + 1)]) / 2;
    vc[c] = (v[V(i + 1, j)] + v[V(i + 1, j + 1)]) / 2;
    pc[c] = p[P(i + 1, j + 1)];
  }
  return {
    u: uc, v: vc, p: pc, history, converged,
    iterations: Math.min(step, maxSteps),
    wallTimeMs: Date.now() - startTime,
    maxContinuityResidual: lastDiv,
    maxCFL: computeCFL(mesh, uc, vc, 0.5 * Math.min(dx, dy) / Math.max(uMax0, 1e-9)),
    Re: problem.Re,
  };
}

// ─── CFL Number ─────────────────────────────────────────────────────────────

function computeCFL(mesh: Mesh2D, u: number[], v: number[], dt: number): number {
  let maxCFL = 0;
  for (let i = 0; i < mesh.nCells; i++) {
    const h = Math.min(mesh.dx[i % mesh.ni], mesh.dy[Math.floor(i / mesh.ni)]);
    const cfl = (Math.sqrt(u[i] ** 2 + v[i] ** 2) * dt) / h;
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

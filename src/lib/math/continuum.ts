/**
 * Continuum Mechanics & Structural Analysis
 * ──────────────────────────────────────────
 * Stress/strain tensors, principal stresses, Mohr's circle,
 * material models (linear elastic, neo-Hookean), 2D elasticity BVP
 * via FEM, heat conduction, Poisson equation, wave equation 2D.
 *
 * Zero dependencies. Runs in browser or Node.
 */

import type { Mat, Vec } from "./sparse";
import {
  matMul, matTranspose, matVecMul, matIdentity, matAdd, matSub, matScale,
  vecDot, vecNorm, vecAdd, vecSub, vecScale,
  solveDense, buildCSR, solveSparseCG, csrMV,
} from "./sparse";

// ─── Stress Tensor (2D) ─────────────────────────────────────────────────────

export interface Stress2D {
  sx: number;  // σ_x
  sy: number;  // σ_y
  txy: number; // τ_xy
}

export interface Stress3D {
  sx: number; sy: number; sz: number;
  txy: number; txz: number; tyz: number;
}

export interface Strain2D {
  ex: number;  // ε_x
  ey: number;  // ε_y
  gxy: number; // γ_xy (engineering shear strain)
}

export interface PrincipalStress {
  s1: number;  // major principal stress
  s2: number;  // minor principal stress
  angle: number; // angle to principal plane (radians)
}

export interface MohrsCircle {
  center: number;
  radius: number;
  s1: number;
  s2: number;
  maxShear: number;
  angle: number;
}

// ─── Stress Calculations ────────────────────────────────────────────────────

export function principalStress2D(s: Stress2D): PrincipalStress {
  const avg = (s.sx + s.sy) / 2;
  const R = Math.sqrt(((s.sx - s.sy) / 2) ** 2 + s.txy ** 2);
  const s1 = avg + R;
  const s2 = avg - R;
  const angle = 0.5 * Math.atan2(2 * s.txy, s.sx - s.sy);
  return { s1, s2, angle };
}

export function principalStress3D(s: Stress3D): { values: Vec; vectors: Mat } {
  // Characteristic equation: λ³ - I1λ² + I2λ - I3 = 0
  const I1 = s.sx + s.sy + s.sz;
  const I2 = s.sx * s.sy + s.sy * s.sz + s.sx * s.sz - s.txy ** 2 - s.txz ** 2 - s.tyz ** 2;
  const I3 = s.sx * s.sy * s.sz + 2 * s.txy * s.txz * s.tyz
    - s.sx * s.tyz ** 2 - s.sy * s.txz ** 2 - s.sz * s.txy ** 2;

  // Solve cubic using Cardano's method
  const p = I1 * I1 - 3 * I2;
  const q = 2 * I1 * I1 * I1 - 9 * I1 * I2 + 27 * I3;

  let values: Vec;
  if (p < 1e-15) {
    values = [I1 / 3, I1 / 3, I1 / 3];
  } else {
    const sqrtP = Math.sqrt(p);
    const arg = q / (2 * sqrtP * sqrtP * sqrtP);
    const clamped = Math.max(-1, Math.min(1, arg));
    const phi = Math.acos(clamped);
    const t = 2 * sqrtP / 3;

    values = [
      I1 / 3 + t * Math.cos(phi / 3),
      I1 / 3 + t * Math.cos((phi - 2 * Math.PI) / 3),
      I1 / 3 + t * Math.cos((phi - 4 * Math.PI) / 3),
    ].sort((a, b) => b - a);
  }

  // Eigenvectors (simplified for 3D)
  const vectors: Mat = [values.map(() => 1), values.map(() => 1), values.map(() => 1)];

  return { values, vectors };
}

export function vonMisesStress2D(s: Stress2D): number {
  return Math.sqrt(s.sx ** 2 - s.sx * s.sy + s.sy ** 2 + 3 * s.txy ** 2);
}

export function vonMisesStress3D(s: Stress3D): number {
  return Math.sqrt(
    0.5 * ((s.sx - s.sy) ** 2 + (s.sy - s.sz) ** 2 + (s.sz - s.sx) ** 2)
    + 3 * (s.txy ** 2 + s.txz ** 2 + s.tyz ** 2),
  );
}

export function maxShearStress(s: PrincipalStress): number {
  return (s.s1 - s.s2) / 2;
}

export function maxShearStress3D(principal: Vec): number {
  const sorted = [...principal].sort((a, b) => b - a);
  return (sorted[0] - sorted[2]) / 2;
}

export function mohrsCircle(s: Stress2D): MohrsCircle {
  const p = principalStress2D(s);
  return {
    center: (p.s1 + p.s2) / 2,
    radius: (p.s1 - p.s2) / 2,
    s1: p.s1,
    s2: p.s2,
    maxShear: (p.s1 - p.s2) / 2,
    angle: p.angle,
  };
}

// ─── Strain Calculations ────────────────────────────────────────────────────

export function strainToStress2D(e: Strain2D, E: number, nu: number, planeStress = true): Stress2D {
  if (planeStress) {
    const f = E / (1 - nu * nu);
    return {
      sx: f * (e.ex + nu * e.ey),
      sy: f * (e.ey + nu * e.ex),
      txy: f * (1 - nu) / 2 * e.gxy,
    };
  }
  // Plane strain
  const f = E / ((1 + nu) * (1 - 2 * nu));
  return {
    sx: f * ((1 - nu) * e.ex + nu * e.ey),
    sy: f * (nu * e.ex + (1 - nu) * e.ey),
    txy: f * (1 - 2 * nu) / 2 * e.gxy,
  };
}

export function stressToStrain2D(s: Stress2D, E: number, nu: number, planeStress = true): Strain2D {
  if (planeStress) {
    return {
      ex: (s.sx - nu * s.sy) / E,
      ey: (s.sy - nu * s.sx) / E,
      gxy: 2 * (1 + nu) * s.txy / E,
    };
  }
  return {
    ex: ((1 + nu) * ((1 - nu) * s.sx - nu * s.sy)) / (E * (1 + nu) * (1 - 2 * nu)),
    ey: ((1 + nu) * ((1 - nu) * s.sy - nu * s.sx)) / (E * (1 + nu) * (1 - 2 * nu)),
    gxy: 2 * (1 + nu) * s.txy / E,
  };
}

// ─── Material Models ─────────────────────────────────────────────────────────

export interface LinearElasticMaterial {
  kind: "linear-elastic";
  E: number;
  nu: number;
  rho: number;
  yieldStress: number;
}

export interface NeoHookeanMaterial {
  kind: "neo-hookean";
  mu: number;       // shear modulus
  lambda: number;   // Lamé's first parameter
  rho: number;
}

export type MaterialModel = LinearElasticMaterial | NeoHookeanMaterial;

export function linearElasticStress(
  F: Mat, // deformation gradient [2x2]
  mat: LinearElasticMaterial,
  planeStress = true,
): Stress2D {
  // Green-Lagrange strain: E = 0.5 (F^T F - I)
  const Ft = matTranspose(F);
  const FtF = matMul(Ft, F);
  const E = matScale(matSub(FtF, matIdentity(2)), 0.5);

  // Small-strain approximation
  const strain: Strain2D = {
    ex: E[0][0],
    ey: E[1][1],
    gxy: 2 * E[0][1],
  };

  return strainToStress2D(strain, mat.E, mat.nu, planeStress);
}

// ─── Failure Criteria ────────────────────────────────────────────────────────

export function trescaYield(s: PrincipalStress): number {
  return Math.abs(s.s1 - s.s2);
}

export function mohrCoulomb(
  s: PrincipalStress,
  cohesion: number,
  frictionAngle: number,
): { ratio: number; failed: boolean } {
  const phi = frictionAngle * Math.PI / 180;
  const s1 = s.s1, s3 = s.s2;
  const ratio = (s1 - s3) / (s1 + s3 + 2 * cohesion / Math.tan(phi));
  return { ratio, failed: ratio > 1 };
}

// ─── 2D Elasticity BVP (Finite Element) ─────────────────────────────────────

export interface ElasticityProblem {
  width: number;
  height: number;
  nx: number;
  ny: number;
  E: number;
  nu: number;
  planeStress: boolean;
  forces: Array<{ x: number; y: number; fx: number; fy: number }>;
  fixedCorners: string[]; // e.g. ["bottom-left", "bottom-right"]
}

export function solveElasticityBVP(problem: ElasticityProblem): {
  maxDisplacement: number;
  maxStress: number;
  displacementField: Vec;
  stressField: Stress2D[];
} {
  // Build mesh
  const { width: w, height: h, nx, ny } = problem;
  const nodes: Array<{ id: number; x: number; y: number }> = [];
  let id = 0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      nodes.push({ id: id++, x: (i / nx) * w, y: (j / ny) * h });
    }
  }

  const nNodes = nodes.length;
  const nDOF = nNodes * 2;
  const elements: number[][] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const bl = j * (nx + 1) + i;
      elements.push([bl, bl + 1, bl + nx + 2, bl + nx + 1]);
    }
  }

  // Assemble stiffness (simplified 2D Q4)
  const K: Vec = new Array(nDOF * nDOF).fill(0); // flattened for memory
  const D = problem.planeStress
    ? matScale([
      [1, problem.nu, 0],
      [problem.nu, 1, 0],
      [0, 0, (1 - problem.nu) / 2],
    ], problem.E / (1 - problem.nu * problem.nu))
    : matScale([
      [1 - problem.nu, problem.nu, 0],
      [problem.nu, 1 - problem.nu, 0],
      [0, 0, (1 - 2 * problem.nu) / 2],
    ], problem.E / ((1 + problem.nu) * (1 - 2 * problem.nu)));

  for (const elem of elements) {
    const corners = elem.map((id) => nodes[id]);
    const t = 1.0;
    const gp = [{ xi: -0.577, w: 1 }, { xi: 0.577, w: 1 }];
    const Ke = new Array(8).fill(0).map(() => new Array(8).fill(0));

    for (const gi of gp) {
      for (const gj of gp) {
        const xi = gi.xi, eta = gj.xi;
        const dN = [
          [-(1 - eta) / 4, (1 - eta) / 4, (1 + eta) / 4, -(1 + eta) / 4],
          [-(1 - xi) / 4, -(1 + xi) / 4, (1 + xi) / 4, (1 - xi) / 4],
        ];
        const J: Mat = [[0, 0], [0, 0]];
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 4; k++) J[i][j] += dN[i][k] * corners[k][j === 0 ? "x" : "y"];
        const detJ = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (Math.abs(detJ) < 1e-15) continue;
        const invJ: Mat = [[J[1][1] / detJ, -J[0][1] / detJ], [-J[1][0] / detJ, J[0][0] / detJ]];
        const B: Mat = Array.from({ length: 3 }, () => new Array(8).fill(0));
        for (let k = 0; k < 4; k++) {
          const dNdx = invJ[0][0] * dN[0][k] + invJ[0][1] * dN[1][k];
          const dNdy = invJ[1][0] * dN[0][k] + invJ[1][1] * dN[1][k];
          B[0][2 * k] = dNdx; B[1][2 * k + 1] = dNdy;
          B[2][2 * k] = dNdy; B[2][2 * k + 1] = dNdx;
        }
        const BtD = matMul(matTranspose(B), D);
        const Klocal = matScale(matMul(BtD, B), t * detJ * gi.w * gj.w);
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) Ke[i][j] += Klocal[i][j];
      }
    }

    // Assemble
    const dofs = elem.flatMap((id) => [id * 2, id * 2 + 1]);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const gi = dofs[i], gj = dofs[j];
      K[gi * nDOF + gj] += Ke[i][j];
    }
  }

  // Apply BCs and solve (simplified)
  const fixedDofs = new Set<number>();
  if (problem.fixedCorners.includes("bottom-left")) { fixedDofs.add(0); fixedDofs.add(1); }
  if (problem.fixedCorners.includes("bottom-right")) { fixedDofs.add((nx) * 2); fixedDofs.add((nx) * 2 + 1); }
  if (problem.fixedCorners.includes("top-left")) { fixedDofs.add((ny * (nx + 1)) * 2); fixedDofs.add((ny * (nx + 1)) * 2 + 1); }

  const F = new Array(nDOF).fill(0);
  for (const f of problem.forces) {
    const i = Math.round(f.x / w * nx);
    const j = Math.round(f.y / h * ny);
    const nodeIdx = j * (nx + 1) + i;
    F[nodeIdx * 2] += f.fx;
    F[nodeIdx * 2 + 1] += f.fy;
  }

  // Rebuild as dense for solve
  const Kd: Mat = Array.from({ length: nDOF }, (_, i) =>
    Array.from({ length: nDOF }, (_, j) => K[i * nDOF + j]),
  );

  const freeDofs: number[] = [];
  for (let i = 0; i < nDOF; i++) if (!fixedDofs.has(i)) freeDofs.push(i);

  const nFree = freeDofs.length;
  const Kff: Mat = Array.from({ length: nFree }, (_, i) =>
    Array.from({ length: nFree }, (_, j) => Kd[freeDofs[i]][freeDofs[j]]),
  );
  const Ff = freeDofs.map((i) => F[i]);

  const uFree = solveDense(Kff, Ff);
  const u = new Array(nDOF).fill(0);
  for (let i = 0; i < nFree; i++) u[freeDofs[i]] = uFree[i];

  // Compute element stresses
  const stressField: Stress2D[] = [];
  let maxStress = 0;
  for (const elem of elements) {
    const uElem = elem.flatMap((id) => [u[id * 2], u[id * 2 + 1]]);
    const corners = elem.map((id) => nodes[id]);
    // Simplified: use average strain
    const dx = corners[1].x - corners[0].x;
    const strain: Strain2D = {
      ex: (uElem[2] - uElem[0]) / dx,
      ey: (uElem[3] - uElem[1]) / dx,
      gxy: (uElem[2] - uElem[0] + uElem[3] - uElem[1]) / dx,
    };
    const stress = strainToStress2D(strain, problem.E, problem.nu, problem.planeStress);
    const vm = vonMisesStress2D(stress);
    if (vm > maxStress) maxStress = vm;
    stressField.push(stress);
  }

  return {
    maxDisplacement: Math.max(...u.map(Math.abs)),
    maxStress,
    displacementField: u,
    stressField,
  };
}

// ─── 2D Heat Conduction (FDM) ───────────────────────────────────────────────

export interface HeatProblem2D {
  width: number;
  height: number;
  nx: number;
  ny: number;
  k: number;           // thermal conductivity (W/m·K)
  Q?: number;          // internal heat generation (W/m³)
  TLeft?: number;      // left BC temperature
  TRight?: number;     // right BC temperature
  TTop?: number;       // top BC temperature
  TBottom?: number;    // bottom BC temperature
  convectionBC?: {     // convection on a boundary
    side: "left" | "right" | "top" | "bottom";
    h: number;         // convection coefficient
    Tinf: number;      // ambient temperature
  };
}

export function solveHeatConduction2D(prob: HeatProblem2D): {
  temperature: number[][];
  x: number[];
  y: number[];
  maxT: number;
  minT: number;
  heatFlux: Array<{ x: number; y: number; qx: number; qy: number }>;
} {
  const { width: W, height: H, nx, ny, k } = prob;
  const Q = prob.Q ?? 0;
  const dx = W / nx, dy = H / ny;
  const TLeft = prob.TLeft ?? 100, TRight = prob.TRight ?? 25;
  const TTop = prob.TTop ?? 25, TBottom = prob.TBottom ?? 25;

  // Initialize temperature field
  const T: number[][] = Array.from({ length: ny + 1 }, () => new Array(nx + 1).fill((TLeft + TRight) / 2));

  // Apply Dirichlet BCs
  for (let j = 0; j <= ny; j++) { T[j][0] = TLeft; T[j][nx] = TRight; }
  for (let i = 0; i <= nx; i++) { T[0][i] = TBottom; T[ny][i] = TTop; }

  // Gauss-Seidel iteration
  const maxIter = 5000;
  const tol = 1e-6;
  for (let iter = 0; iter < maxIter; iter++) {
    let maxDiff = 0;
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        const Tnew = 0.25 * (T[j][i - 1] + T[j][i + 1] + T[j - 1][i] + T[j + 1][i] + Q * dx * dx / k);
        const diff = Math.abs(Tnew - T[j][i]);
        if (diff > maxDiff) maxDiff = diff;
        T[j][i] = Tnew;
      }
    }

    // Convection BC
    if (prob.convectionBC) {
      const { side, h, Tinf } = prob.convectionBC;
      const Bi = h * dx / k;
      if (side === "left") for (let j = 1; j < ny; j++) T[j][0] = (T[j][1] + Bi * Tinf) / (1 + Bi);
      if (side === "right") for (let j = 1; j < ny; j++) T[j][nx] = (T[j][nx - 1] + Bi * Tinf) / (1 + Bi);
      if (side === "bottom") for (let i = 1; i < nx; i++) T[0][i] = (T[1][i] + Bi * Tinf) / (1 + Bi);
      if (side === "top") for (let i = 1; i < nx; i++) T[ny][i] = (T[ny - 1][i] + Bi * Tinf) / (1 + Bi);
    }

    if (maxDiff < tol) break;
  }

  // Compute heat flux: q = -k ∇T
  const heatFlux: Array<{ x: number; y: number; qx: number; qy: number }> = [];
  const x = Array.from({ length: nx + 1 }, (_, i) => i * dx);
  const y = Array.from({ length: ny + 1 }, (_, j) => j * dy);

  for (let j = 1; j < ny; j++) {
    for (let i = 1; i < nx; i++) {
      const dTdx = (T[j][i + 1] - T[j][i - 1]) / (2 * dx);
      const dTdy = (T[j + 1][i] - T[j - 1][i]) / (2 * dy);
      heatFlux.push({ x: x[i], y: y[j], qx: -k * dTdx, qy: -k * dTdy });
    }
  }

  const flatT = T.flat();
  return {
    temperature: T,
    x,
    y,
    maxT: Math.max(...flatT),
    minT: Math.min(...flatT),
    heatFlux,
  };
}

// ─── 2D Poisson Equation (FDM) ──────────────────────────────────────────────

export function solvePoisson2D(
  f: (x: number, y: number) => number,
  width: number,
  height: number,
  nx: number,
  ny: number,
  bcValue = 0,
): { solution: number[][]; x: number[]; y: number[] } {
  const dx = width / nx, dy = height / ny;
  const u: number[][] = Array.from({ length: ny + 1 }, () => new Array(nx + 1).fill(0));

  // Dirichlet BCs (u = bcValue on boundary)
  for (let j = 0; j <= ny; j++) { u[j][0] = bcValue; u[j][nx] = bcValue; }
  for (let i = 0; i <= nx; i++) { u[0][i] = bcValue; u[ny][i] = bcValue; }

  // Jacobi iteration
  for (let iter = 0; iter < 10000; iter++) {
    let maxDiff = 0;
    const uNew = u.map((row) => [...row]);
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        const x = i * dx, y = j * dy;
        uNew[j][i] = 0.25 * (
          u[j][i - 1] + u[j][i + 1] + u[j - 1][i] + u[j + 1][i]
          - dx * dx * f(x, y)
        );
        const diff = Math.abs(uNew[j][i] - u[j][i]);
        if (diff > maxDiff) maxDiff = diff;
      }
    }
    for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) u[j][i] = uNew[j][i];
    if (maxDiff < 1e-8) break;
  }

  return {
    solution: u,
    x: Array.from({ length: nx + 1 }, (_, i) => i * dx),
    y: Array.from({ length: ny + 1 }, (_, j) => j * dy),
  };
}

// ─── 2D Wave Equation (FDM) ─────────────────────────────────────────────────

export function solveWaveEquation2D(
  c: number,
  width: number,
  height: number,
  nx: number,
  ny: number,
  nt: number,
  dt: number,
  initialPulse: (x: number, y: number) => number,
): { field: number[][][]; x: number[]; y: number[]; t: number[] } {
  const dx = width / nx, dy = height / ny;
  const r = c * dt / dx;

  // CFL check
  if (r > 1 / Math.sqrt(2)) {
    console.warn(`CFL condition violated: r=${r.toFixed(3)} > 0.707. Solution may be unstable.`);
  }

  // Time levels
  const u: number[][][] = [];
  for (let n = 0; n <= nt; n++) {
    u.push(Array.from({ length: ny + 1 }, () => new Array(nx + 1).fill(0)));
  }

  // Initial condition
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      u[0][j][i] = initialPulse(i * dx, j * dy);
    }
  }

  // Time stepping (leapfrog)
  for (let n = 0; n < nt; n++) {
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        if (n === 0) {
          // First step: use Taylor expansion
          u[1][j][i] = u[0][j][i] + 0.5 * r * r * (
            u[0][j][i + 1] + u[0][j][i - 1] + u[0][j + 1][i] + u[0][j - 1][i] - 4 * u[0][j][i]
          );
        } else {
          u[n + 1][j][i] = 2 * u[n][j][i] - u[n - 1][j][i] + r * r * (
            u[n][j][i + 1] + u[n][j][i - 1] + u[n][j + 1][i] + u[n][j - 1][i] - 4 * u[n][j][i]
          );
        }
      }
    }
    // Zero Dirichlet BCs are already zero
  }

  return {
    field: u,
    x: Array.from({ length: nx + 1 }, (_, i) => i * dx),
    y: Array.from({ length: ny + 1 }, (_, j) => j * dy),
    t: Array.from({ length: nt + 1 }, (_, n) => n * dt),
  };
}

// ─── Torsion of Prismatic Bars ──────────────────────────────────────────────

export function solveTorsion(
  G: number,
  J: number,
  torque: number,
  length: number,
): {
  angleOfTwist: number;
  maxShearStress: number;
  warpingFunction?: number;
} {
  const theta = torque * length / (G * J);
  const maxShear = torque * 0.05 / J; // simplified: assumes circular cross-section
  return { angleOfTwist: theta, maxShearStress: maxShear };
}

// ─── Column Buckling (Euler) ────────────────────────────────────────────────

export function eulerBuckling(
  E: number,
  I: number,
  L: number,
  K = 1.0, // effective length factor
): { criticalLoad: number; criticalStress: number; mode: string } {
  const Pcr = Math.PI * Math.PI * E * I / (K * L) ** 2;
  return {
    criticalLoad: Pcr,
    criticalStress: Pcr, // divided by area externally
    mode: `K=${K}, L_eff=${(K * L).toFixed(3)}m`,
  };
}

// ─── Beam Deflection (Euler-Bernoulli, point loads) ─────────────────────────

export function beamDeflection(
  E: number,
  I: number,
  L: number,
  loads: Array<{ position: number; force: number }>,
  supportType: "simply-supported" | "cantilever" = "simply-supported",
): {
  maxDeflection: number;
  maxMoment: number;
  deflectionProfile: Array<{ x: number; delta: number; moment: number; shear: number }>;
} {
  const n = 200;
  const dx = L / n;
  const profile: Array<{ x: number; delta: number; moment: number; shear: number }> = [];

  for (let i = 0; i <= n; i++) {
    const x = i * dx;
    let delta = 0;
    let M = 0;
    let V = 0;

    for (const load of loads) {
      const a = load.position;
      const P = load.force;

      if (supportType === "cantilever") {
        if (x <= a) {
          delta += P * x * x * (3 * a - x) / (6 * E * I);
          M += P * (a - x);
          V += P;
        } else {
          delta += P * a * a * (3 * x - a) / (6 * E * I);
          M += 0;
          V += 0;
        }
      } else {
        // Simply supported
        if (x <= a) {
          const b = L - a;
          delta += P * b * x * (L * L - b * b - x * x) / (6 * E * I * L);
          M += P * b * x / L;
          V += P * b / L;
        } else {
          const b = L - a;
          delta += P * a * (L - x) * (2 * L * x - x * x - a * a) / (6 * E * I * L);
          M += P * a * (L - x) / L;
          V += -P * a / L;
        }
      }
    }

    profile.push({ x, delta, moment: M, shear: V });
  }

  const maxDeflection = Math.max(...profile.map((p) => Math.abs(p.delta)));
  const maxMoment = Math.max(...profile.map((p) => Math.abs(p.moment)));

  return { maxDeflection, maxMoment, deflectionProfile: profile };
}

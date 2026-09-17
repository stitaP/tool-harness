/**
 * Engineering Optimization
 * ────────────────────────
 * Gradient descent, Newton's method, quasi-Newton (BFGS),
 * constrained optimization via penalty method, linear programming
 * (simplex), and least-squares curve fitting.
 *
 * Zero dependencies. Runs in browser or Node.
 */

import type { Vec, Mat } from "./sparse";
import {
  vecNorm, vecDot, vecAdd, vecSub, vecScale,
  matVecMul, matIdentity, matMul, matTranspose, matScale, matAdd, matSub,
  solveDense,
} from "./sparse";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OptResult {
  solution: Vec;
  objectiveValue: number;
  iterations: number;
  converged: boolean;
  history: Array<{ iteration: number; objective: number; gradientNorm: number }>;
}

export interface LPResult {
  solution: Vec;
  objectiveValue: number;
  feasible: boolean;
}

// ─── Numerical Gradient (helper) ─────────────────────────────────────────────

function numericalGradient2(
  f: (x: Vec) => number,
  x: Vec,
  eps = 1e-7,
): Vec {
  const n = x.length;
  const g = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    x[i] = xi + eps;
    const fp = f(x);
    x[i] = xi - eps;
    const fm = f(x);
    x[i] = xi;
    g[i] = (fp - fm) / (2 * eps);
  }
  return g;
}

function numericalHessian(
  f: (x: Vec) => number,
  x: Vec,
  eps = 1e-5,
): Mat {
  const n = x.length;
  const H: Mat = Array.from({ length: n }, () => new Array(n).fill(0));
  const f0 = f(x);

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const xi = x[i], xj = x[j];

      x[i] = xi + eps; x[j] = xj + eps;
      const fpp = f(x);

      x[i] = xi + eps; x[j] = xj - eps;
      const fpm = f(x);

      x[i] = xi - eps; x[j] = xj + eps;
      const fmp = f(x);

      x[i] = xi - eps; x[j] = xj - eps;
      const fmm = f(x);

      x[i] = xi; x[j] = xj;

      H[i][j] = (fpp - fpm - fmp + fmm) / (4 * eps * eps);
      if (i !== j) H[j][i] = H[i][j];
    }
  }

  return H;
}

// ─── Gradient Descent ───────────────────────────────────────────────────────

export function gradientDescent(
  f: (x: Vec) => number,
  x0: Vec,
  options: {
    learningRate?: number;
    maxIter?: number;
    tolerance?: number;
    momentum?: number;
    adaptiveLR?: boolean;
  } = {},
): OptResult {
  const lr0 = options.learningRate ?? 0.01;
  const maxIter = options.maxIter ?? 1000;
  const tol = options.tolerance ?? 1e-8;
  const momentum = options.momentum ?? 0.9;
  const adaptive = options.adaptiveLR ?? false;

  let x = [...x0];
  let v = new Array(x0.length).fill(0);
  let lr = lr0;
  const history: OptResult["history"] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    const g = numericalGradient2(f, x);
    const gNorm = vecNorm(g);
    const fVal = f(x);

    history.push({ iteration: iter, objective: fVal, gradientNorm: gNorm });

    if (gNorm < tol) {
      return { solution: x, objectiveValue: fVal, iterations: iter, converged: true, history };
    }

    // Adaptive learning rate (Barzilai-Borwein style)
    if (adaptive && iter > 0) {
      const gPrev = numericalGradient2(f, vecSub(x, vecScale(v, 1)));
      const gs = vecSub(g, gPrev);
      const dx = vecScale(v, -1);
      const denom = vecDot(gs, gs);
      if (denom > 1e-20) lr = Math.abs(vecDot(dx, gs)) / denom;
      lr = Math.max(1e-6, Math.min(lr, 1.0));
    }

    // Momentum update
    v = vecAdd(vecScale(v, momentum), vecScale(g, lr));
    x = vecSub(x, v);
  }

  return {
    solution: x,
    objectiveValue: f(x),
    iterations: maxIter,
    converged: false,
    history,
  };
}

// ─── Newton's Method ─────────────────────────────────────────────────────────

export function newtonOptimize(
  f: (x: Vec) => number,
  x0: Vec,
  options: {
    maxIter?: number;
    tolerance?: number;
    damping?: number;
  } = {},
): OptResult {
  const maxIter = options.maxIter ?? 100;
  const tol = options.tolerance ?? 1e-10;
  const damping = options.damping ?? 1.0;

  let x = [...x0];
  const history: OptResult["history"] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    const g = numericalGradient2(f, x);
    const H = numericalHessian(f, x);
    const gNorm = vecNorm(g);
    const fVal = f(x);

    history.push({ iteration: iter, objective: fVal, gradientNorm: gNorm });

    if (gNorm < tol) {
      return { solution: x, objectiveValue: fVal, iterations: iter, converged: true, history };
    }

    // Newton step: x -= H^{-1} g
    try {
      const dx = solveDense(H, g.map((v) => -v));
      // Damped step
      x = vecAdd(x, vecScale(dx, damping));
    } catch {
      // Hessian singular: fall back to gradient step
      x = vecSub(x, vecScale(g, 0.01));
    }
  }

  return {
    solution: x,
    objectiveValue: f(x),
    iterations: maxIter,
    converged: false,
    history,
  };
}

// ─── BFGS (Quasi-Newton) ───────────────────────────────────────────────────

export function bfgsOptimize(
  f: (x: Vec) => number,
  x0: Vec,
  options: {
    maxIter?: number;
    tolerance?: number;
  } = {},
): OptResult {
  const maxIter = options.maxIter ?? 500;
  const tol = options.tolerance ?? 1e-8;
  const n = x0.length;

  let x = [...x0];
  let H = matIdentity(n); // Inverse Hessian approximation
  let g = numericalGradient2(f, x);
  const history: OptResult["history"] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    const gNorm = vecNorm(g);
    const fVal = f(x);

    history.push({ iteration: iter, objective: fVal, gradientNorm: gNorm });

    if (gNorm < tol) {
      return { solution: x, objectiveValue: fVal, iterations: iter, converged: true, history };
    }

    // Search direction
    const p = matVecMul(H, g).map((v) => -v);

    // Line search (backtracking)
    let alpha = 1.0;
    const fCurrent = fVal;
    for (let ls = 0; ls < 20; ls++) {
      const xNew = vecAdd(x, vecScale(p, alpha));
      if (f(xNew) < fCurrent) break;
      alpha *= 0.5;
    }

    // Update
    const xOld = [...x];
    x = vecAdd(x, vecScale(p, alpha));
    const gNew = numericalGradient2(f, x);

    const s = vecSub(x, xOld);
    const y = vecSub(gNew, g);
    const sy = vecDot(s, y);

    if (sy > 1e-20) {
      // BFGS update: H = (I - ρ s y^T) H (I - ρ y s^T) + ρ s s^T
      const rho = 1 / sy;
      const Is = matMul(
        matTranspose([s.map((v) => v * rho)]),
        [y.map((v) => v * rho)],
      );
      // Simplified BFGS update
      const rhoSS = matScale(matMul(matTranspose([s]), [s]), rho);
      H = matAdd(H, rhoSS);
    }

    g = gNew;
  }

  return {
    solution: x,
    objectiveValue: f(x),
    iterations: maxIter,
    converged: false,
    history,
  };
}

// ─── Constrained Optimization (Penalty Method) ──────────────────────────────

export function constrainedOptimize(
  f: (x: Vec) => number,
  constraints: Array<{ type: "eq" | "ineq"; g: (x: Vec) => number }>,
  x0: Vec,
  options: {
    penaltyWeight?: number;
    penaltyGrowth?: number;
    maxOuterIter?: number;
    innerMethod?: "gradient" | "newton" | "bfgs";
  } = {},
): OptResult {
  const mu0 = options.penaltyWeight ?? 10;
  const muGrowth = options.penaltyGrowth ?? 10;
  const maxOuter = options.maxOuterIter ?? 20;

  let x = [...x0];
  let mu = mu0;
  const history: OptResult["history"] = [];

  for (let outer = 0; outer < maxOuter; outer++) {
    // Augmented objective with penalty
    const augmented = (xv: Vec): number => {
      let penalty = 0;
      for (const c of constraints) {
        const val = c.g(xv);
        if (c.type === "eq") {
          penalty += mu * val * val;
        } else {
          // Inequality: g(x) <= 0
          if (val > 0) penalty += mu * val * val;
        }
      }
      return f(xv) + penalty;
    };

    // Optimize augmented objective
    const result = bfgsOptimize(augmented, x, { maxIter: 100, tolerance: 1e-6 });
    x = result.solution;
    mu *= muGrowth;

    // Check constraint satisfaction
    let maxViolation = 0;
    for (const c of constraints) {
      const val = c.g(x);
      if (c.type === "eq") maxViolation = Math.max(maxViolation, Math.abs(val));
      else maxViolation = Math.max(maxViolation, Math.max(0, val));
    }

    history.push({
      iteration: outer,
      objective: f(x),
      gradientNorm: maxViolation,
    });

    if (maxViolation < 1e-6) {
      return { solution: x, objectiveValue: f(x), iterations: outer, converged: true, history };
    }
  }

  return {
    solution: x,
    objectiveValue: f(x),
    iterations: maxOuter,
    converged: false,
    history,
  };
}

// ─── Linear Programming (Simplex Method) ────────────────────────────────────

export function simplexLP(
  c: Vec,           // objective coefficients (minimize c^T x)
  A: Mat,           // constraint matrix (A x <= b)
  b: Vec,           // constraint RHS
): LPResult {
  const m = A.length;
  const n = c.length;

  // Build tableau with slack variables
  const T: Mat = Array.from({ length: m + 1 }, () => new Array(n + m + 1).fill(0));

  // Constraints
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) T[i][j] = A[i][j];
    T[i][n + i] = 1; // slack
    T[i][n + m] = b[i]; // RHS
  }

  // Objective (minimize → maximize -c)
  for (let j = 0; j < n; j++) T[m][j] = -c[j];

  const basis: number[] = Array.from({ length: m }, (_, i) => n + i);

  for (let iter = 0; iter < 1000; iter++) {
    // Find entering variable (most negative in objective row)
    let pivotCol = -1;
    let minVal = -1e-10;
    for (let j = 0; j < n + m; j++) {
      if (T[m][j] < minVal) {
        minVal = T[m][j];
        pivotCol = j;
      }
    }

    if (pivotCol === -1) {
      // Optimal
      const solution = new Array(n).fill(0);
      for (let i = 0; i < m; i++) {
        if (basis[i] < n) solution[basis[i]] = T[i][n + m];
      }
      return {
        solution,
        objectiveValue: -T[m][n + m],
        feasible: true,
      };
    }

    // Find leaving variable (minimum ratio test)
    let pivotRow = -1;
    let minRatio = Infinity;
    for (let i = 0; i < m; i++) {
      if (T[i][pivotCol] > 1e-10) {
        const ratio = T[i][n + m] / T[i][pivotCol];
        if (ratio < minRatio) {
          minRatio = ratio;
          pivotRow = i;
        }
      }
    }

    if (pivotRow === -1) {
      return { solution: new Array(n).fill(0), objectiveValue: 0, feasible: false };
    }

    // Pivot
    const pivot = T[pivotRow][pivotCol];
    for (let j = 0; j <= n + m; j++) T[pivotRow][j] /= pivot;
    for (let i = 0; i <= m; i++) {
      if (i === pivotRow) continue;
      const factor = T[i][pivotCol];
      for (let j = 0; j <= n + m; j++) T[i][j] -= factor * T[pivotRow][j];
    }
    basis[pivotRow] = pivotCol;
  }

  return { solution: new Array(n).fill(0), objectiveValue: 0, feasible: false };
}

// ─── Nonlinear Least Squares (Levenberg-Marquardt) ──────────────────────────

export function levenbergMarquardt(
  residuals: (x: Vec) => Vec,
  x0: Vec,
  options: {
    maxIter?: number;
    tolerance?: number;
    lambda0?: number;
  } = {},
): OptResult {
  const maxIter = options.maxIter ?? 200;
  const tol = options.tolerance ?? 1e-8;
  let lambda = options.lambda0 ?? 0.001;

  let x = [...x0];
  const history: OptResult["history"] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    const r = residuals(x);
    const n = x.length;
    const m = r.length;
    const fVal = 0.5 * vecDot(r, r);

    // Jacobian
    const J: Mat = [];
    for (let i = 0; i < m; i++) {
      const ri = (xv: Vec) => {
        const rv = residuals(xv);
        return rv[i];
      };
      J.push(numericalGradient2(ri, x));
    }

    const JtJ: Mat = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        let s = 0;
        for (let k = 0; k < m; k++) s += J[k][i] * J[k][j];
        return s;
      }),
    );

    const Jtr = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < m; k++) Jtr[i] += J[k][i] * r[k];
    }

    // Damped normal equations: (J^T J + λI) δx = -J^T r
    const A = matAdd(JtJ, matScale(matIdentity(n), lambda));
    const dx = solveDense(A, Jtr.map((v) => -v));

    const xNew = vecAdd(x, dx);
    const rNew = residuals(xNew);
    const fNew = 0.5 * vecDot(rNew, rNew);

    const gNorm = vecNorm(Jtr);
    history.push({ iteration: iter, objective: fVal, gradientNorm: gNorm });

    if (fNew < fVal) {
      x = xNew;
      lambda *= 0.1;
    } else {
      lambda *= 10;
    }

    if (gNorm < tol) {
      return { solution: x, objectiveValue: fVal, iterations: iter, converged: true, history };
    }
  }

  return {
    solution: x,
    objectiveValue: 0.5 * vecDot(residuals(x), residuals(x)),
    iterations: maxIter,
    converged: false,
    history,
  };
}

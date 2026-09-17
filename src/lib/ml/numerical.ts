/**
 * Numerical Mathematics Module
 * ─────────────────────────────
 * Pure-TypeScript numerical methods for polynomial fitting,
 * symbolic differentiation, ODE / PDE solvers, and root finding.
 *
 * Algorithms included:
 *   1. Polynomial regression (least-squares)
 *   2. Polynomial evaluation and derivative
 *   3. Symbolic differentiation (finite-difference approximation)
 *   4. Numerical integration (Simpson's rule, Trapezoidal)
 *   5. ODE solvers (Euler, RK4, Runge-Kutta-Fehlberg)
 *   6. PDE solvers (Finite-difference for 1D heat, wave, Laplace)
 *   7. Root finding (Bisection, Newton-Raphson, Secant)
 *   8. Matrix operations (eigenvalues for 2×2, SVD decomposition)
 *   9. Polynomial interpolation (Lagrange)
 *  10. Numerical gradient and Jacobian
 *
 * Zero dependencies.  Runs in browser or Node.
 */

import type { Vector, Matrix } from "./engine";
import {
  dot,
  matmul,
  transpose,
  mean,
  variance,
  stdDev,
  scaleVec,
  subVec,
  addVec,
} from "./engine";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PolynomialCoefficients {
  /** Coefficients from lowest degree (a₀) to highest (aₙ) */
  coefficients: number[];
  /** Degree of the polynomial */
  degree: number;
  /** R² goodness-of-fit */
  r2: number;
}

export interface ODESolution {
  t: Vector;
  y: Vector[];
  method: string;
}

export interface PDEResult {
  /** Final state of the grid */
  grid: Matrix;
  /** Number of time steps taken */
  timeSteps: number;
  /** Spatial grid points */
  x: Vector;
  /** Time points */
  t: Vector;
}

export interface RootResult {
  root: number;
  iterations: number;
  converged: boolean;
}

export interface GradientResult {
  gradient: Vector;
  hessian?: Matrix;
}

// ─── 1. Polynomial Regression ──────────────────────────────────────────────

/**
 * Fit a polynomial of given degree to (x, y) data using least-squares.
 * Uses the normal equation: (X^T X)^{-1} X^T y
 */
export function polyFit(
  x: Vector,
  y: Vector,
  degree: number,
): PolynomialCoefficients {
  const n = x.length;
  const m = degree + 1;

  // Build Vandermonde matrix
  const X: Matrix = x.map((xi) => {
    const row: number[] = [];
    for (let j = 0; j < m; j++) row.push(Math.pow(xi, j));
    return row;
  });

  // X^T X
  const Xt = transpose(X);
  const XtX = matmul(Xt, X);

  // X^T y
  const Xty: Vector = Xt.map((row) => dot(row, y));

  // Solve via Gaussian elimination with partial pivoting
  const coeffs = solveLinearSystem(XtX, Xty);

  // Compute R²
  const yPred = x.map((xi) => polyEval(coeffs, xi));
  const ssRes = y.reduce((sum, yi, i) => sum + (yi - yPred[i]) ** 2, 0);
  const yMean = mean(y);
  const ssTot = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { coefficients: coeffs, degree, r2 };
}

/** Evaluate polynomial at x: p(x) = c₀ + c₁x + c₂x² + ... */
export function polyEval(coeffs: Vector, x: number): number {
  // Horner's method
  let result = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = result * x + coeffs[i];
  }
  return result;
}

/** Symbolic derivative of polynomial: p'(x) = c₁ + 2c₂x + 3c₃x² + ... */
export function polyDerivative(coeffs: Vector): Vector {
  if (coeffs.length <= 1) return [0];
  return coeffs.slice(1).map((c, i) => c * (i + 1));
}

/** Symbolic second derivative */
export function polySecondDerivative(coeffs: Vector): Vector {
  return polyDerivative(polyDerivative(coeffs));
}

// ─── 2. Gaussian Elimination ───────────────────────────────────────────────

function solveLinearSystem(A: Matrix, b: Vector): Vector {
  const n = A.length;
  // Augmented matrix
  const aug: Matrix = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= aug[i][j] * x[j];
    }
    x[i] = Math.abs(aug[i][i]) < 1e-12 ? 0 : sum / aug[i][i];
  }
  return x;
}

// ─── 3. Numerical Gradient ─────────────────────────────────────────────────

/**
 * Compute gradient of f: R^n → R using central finite differences.
 */
export function numericalGradient(
  f: (x: Vector) => number,
  x: Vector,
  h = 1e-5,
): Vector {
  return x.map((xi, i) => {
    const xp = [...x];
    const xm = [...x];
    xp[i] += h;
    xm[i] -= h;
    return (f(xp) - f(xm)) / (2 * h);
  });
}

/**
 * Compute Jacobian of F: R^n → R^m using central finite differences.
 */
export function numericalJacobian(
  F: (x: Vector) => Vector,
  x: Vector,
  h = 1e-5,
): Matrix {
  const m = F(x).length;
  return Array.from({ length: m }, (_, i) => {
    const fi = (xi: Vector) => {
      const result = F(xi);
      return result[i];
    };
    return numericalGradient(fi, x, h);
  });
}

// ─── 4. Numerical Integration ──────────────────────────────────────────────

/** Trapezoidal rule: ∫f(x)dx from a to b with n steps */
export function trapezoidal(
  f: (x: number) => number,
  a: number,
  b: number,
  n = 1000,
): number {
  const h = (b - a) / n;
  let sum = (f(a) + f(b)) / 2;
  for (let i = 1; i < n; i++) {
    sum += f(a + i * h);
  }
  return sum * h;
}

/** Simpson's 1/3 rule: ∫f(x)dx from a to b with n steps (n must be even) */
export function simpson(
  f: (x: number) => number,
  a: number,
  b: number,
  n = 1000,
): number {
  const N = n % 2 === 0 ? n : n + 1; // ensure even
  const h = (b - a) / N;
  let sum = f(a) + f(b);
  for (let i = 1; i < N; i++) {
    const x = a + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * f(x);
  }
  return (h / 3) * sum;
}

// ─── 5. ODE Solvers ────────────────────────────────────────────────────────

/**
 * dy/dt = f(t, y), y(t₀) = y₀
 */

/** Forward Euler method */
export function solveODE_Euler(
  f: (t: number, y: number) => number,
  t0: number,
  y0: number,
  tEnd: number,
  dt = 0.01,
): ODESolution {
  const t: Vector = [t0];
  const y: Vector = [y0];
  let tCurr = t0;
  let yCurr = y0;

  while (tCurr < tEnd - 1e-10) {
    const k1 = f(tCurr, yCurr);
    yCurr += dt * k1;
    tCurr += dt;
    t.push(tCurr);
    y.push(yCurr);
  }

  return { t, y: [y], method: "euler" };
}

/** 4th-order Runge-Kutta method */
export function solveODE_RK4(
  f: (t: number, y: number) => number,
  t0: number,
  y0: number,
  tEnd: number,
  dt = 0.01,
): ODESolution {
  const t: Vector = [t0];
  const y: Vector = [y0];
  let tCurr = t0;
  let yCurr = y0;

  while (tCurr < tEnd - 1e-10) {
    const k1 = f(tCurr, yCurr);
    const k2 = f(tCurr + dt / 2, yCurr + (dt / 2) * k1);
    const k3 = f(tCurr + dt / 2, yCurr + (dt / 2) * k2);
    const k4 = f(tCurr + dt, yCurr + dt * k3);
    yCurr += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    tCurr += dt;
    t.push(tCurr);
    y.push(yCurr);
  }

  return { t, y: [y], method: "rk4" };
}

export interface SystemODESolution {
  t: Vector;
  /** y[i] is the state vector at time t[i] */
  y: Vector[];
  method: string;
}

/** System of ODEs: dy/dt = F(t, y), y ∈ R^n */
export function solveODE_System_RK4(
  F: (t: number, y: Vector) => Vector,
  t0: number,
  y0: Vector,
  tEnd: number,
  dt = 0.01,
): SystemODESolution {
  const tVec: Vector = [t0];
  const yVec: Vector[] = [[...y0]];
  let tCurr = t0;
  let yCurr = [...y0];

  while (tCurr < tEnd - 1e-10) {
    const k1 = F(tCurr, yCurr);
    const k2 = F(tCurr + dt / 2, yCurr.map((yi, i) => yi + (dt / 2) * k1[i]));
    const k3 = F(tCurr + dt / 2, yCurr.map((yi, i) => yi + (dt / 2) * k2[i]));
    const k4 = F(tCurr + dt, yCurr.map((yi, i) => yi + dt * k3[i]));
    yCurr = yCurr.map((yi, i) => yi + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    tCurr += dt;
    tVec.push(tCurr);
    yVec.push([...yCurr]);
  }

  return { t: tVec, y: yVec, method: "rk4_system" };
}

// ─── 6. PDE Solvers ────────────────────────────────────────────────────────

/**
 * 1D Heat Equation: ∂u/∂t = α * ∂²u/∂x²
 * Uses explicit finite-difference scheme (forward Euler in time, central in space)
 */
export function solveHeatEquation1D(
  alpha: number,     // thermal diffusivity
  L: number,         // domain length [0, L]
  T: number,         // final time
  nx: number,        // spatial grid points
  nt: number,        // time steps
  u0: (x: number) => number,  // initial condition
  leftBC: (t: number) => number = () => 0,
  rightBC: (t: number) => number = () => 0,
): PDEResult {
  const dx = L / (nx - 1);
  const dt = T / nt;
  const r = alpha * dt / (dx * dx); // stability requires r ≤ 0.5

  if (r > 0.5) {
    console.warn(`Heat equation: r=${r.toFixed(3)} > 0.5. Solution may be unstable.`);
  }

  // Initialize grid
  const x: Vector = Array.from({ length: nx }, (_, i) => i * dx);
  let u: number[] = x.map(u0);
  u[0] = leftBC(0);
  u[nx - 1] = rightBC(0);

  const tVec: Vector = [0];
  const history: Matrix = [u.slice()];

  for (let n = 1; n <= nt; n++) {
    const tCurr = n * dt;
    const uNew = [...u];
    for (let i = 1; i < nx - 1; i++) {
      uNew[i] = u[i] + r * (u[i + 1] - 2 * u[i] + u[i - 1]);
    }
    uNew[0] = leftBC(tCurr);
    uNew[nx - 1] = rightBC(tCurr);
    u = uNew;
    tVec.push(tCurr);
    history.push(u.slice());
  }

  return { grid: history, timeSteps: nt, x, t: tVec };
}

/**
 * 1D Wave Equation: ∂²u/∂t² = c² * ∂²u/∂x²
 * Uses central-difference scheme
 */
export function solveWaveEquation1D(
  c: number,          // wave speed
  L: number,          // domain length
  T: number,          // final time
  nx: number,         // spatial points
  nt: number,         // time steps
  u0: (x: number) => number = () => 0,
  v0: (x: number) => number = () => 0, // initial velocity
  leftBC: (t: number) => number = () => 0,
  rightBC: (t: number) => number = () => 0,
): PDEResult {
  const dx = L / (nx - 1);
  const dt = T / nt;
  const r = c * dt / dx;

  if (r > 1) {
    console.warn(`Wave equation: CFL number=${r.toFixed(3)} > 1. Solution may be unstable.`);
  }

  const x: Vector = Array.from({ length: nx }, (_, i) => i * dx);
  let uPrev: number[] = x.map(u0);
  let uCurr: number[] = x.map((xi) => u0(xi) + dt * v0(xi));
  uPrev[0] = leftBC(0);
  uPrev[nx - 1] = rightBC(0);

  const tVec: Vector = [0, dt];
  const history: Matrix = [uPrev.slice(), uCurr.slice()];

  for (let n = 2; n <= nt; n++) {
    const tCurr = n * dt;
    const uNext = new Array(nx).fill(0);
    for (let i = 1; i < nx - 1; i++) {
      uNext[i] = 2 * uCurr[i] - uPrev[i] + r * r * (uCurr[i + 1] - 2 * uCurr[i] + uCurr[i - 1]);
    }
    uNext[0] = leftBC(tCurr);
    uNext[nx - 1] = rightBC(tCurr);
    uPrev = uCurr;
    uCurr = uNext;
    tVec.push(tCurr);
    history.push(uCurr.slice());
  }

  return { grid: history, timeSteps: nt, x, t: tVec };
}

/**
 * 2D Laplace Equation: ∂²u/∂x² + ∂²u/∂y² = 0
 * Uses Jacobi iterative method with fixed boundary conditions
 */
export function solveLaplaceEquation2D(
  nx: number,
  ny: number,
  tolerance = 1e-4,
  maxIterations = 10000,
  boundary: {
    top: (x: number) => number;
    bottom: (x: number) => number;
    left: (y: number) => number;
    right: (y: number) => number;
  } = {
    top: () => 0,
    bottom: () => 0,
    left: () => 0,
    right: () => 0,
  },
): { grid: Matrix; iterations: number; converged: boolean } {
  // Initialize grid
  let grid: Matrix = Array.from({ length: ny }, () => new Array(nx).fill(0));

  // Apply boundary conditions
  for (let i = 0; i < nx; i++) {
    grid[0][i] = boundary.top(i / (nx - 1));
    grid[ny - 1][i] = boundary.bottom(i / (nx - 1));
  }
  for (let j = 0; j < ny; j++) {
    grid[j][0] = boundary.left(j / (ny - 1));
    grid[j][nx - 1] = boundary.right(j / (ny - 1));
  }

  let converged = false;
  let iterations = 0;

  for (iterations = 0; iterations < maxIterations; iterations++) {
    const newGrid: Matrix = grid.map((row) => [...row]);
    let maxDiff = 0;

    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const newVal = 0.25 * (grid[j][i + 1] + grid[j][i - 1] + grid[j + 1][i] + grid[j - 1][i]);
        maxDiff = Math.max(maxDiff, Math.abs(newVal - grid[j][i]));
        newGrid[j][i] = newVal;
      }
    }

    grid = newGrid;
    if (maxDiff < tolerance) {
      converged = true;
      break;
    }
  }

  return { grid, iterations, converged };
}

// ─── 7. Root Finding ───────────────────────────────────────────────────────

/** Bisection method */
export function bisection(
  f: (x: number) => number,
  a: number,
  b: number,
  tolerance = 1e-8,
  maxIterations = 1000,
): RootResult {
  if (f(a) * f(b) > 0) {
    return { root: (a + b) / 2, iterations: 0, converged: false };
  }

  for (let i = 0; i < maxIterations; i++) {
    const mid = (a + b) / 2;
    if (Math.abs(f(mid)) < tolerance || (b - a) / 2 < tolerance) {
      return { root: mid, iterations: i + 1, converged: true };
    }
    if (f(mid) * f(a) < 0) b = mid;
    else a = mid;
  }
  return { root: (a + b) / 2, iterations: maxIterations, converged: false };
}

/** Newton-Raphson method */
export function newtonRaphson(
  f: (x: number) => number,
  df: (x: number) => number,
  x0: number,
  tolerance = 1e-8,
  maxIterations = 1000,
): RootResult {
  let x = x0;
  for (let i = 0; i < maxIterations; i++) {
    const fx = f(x);
    if (Math.abs(fx) < tolerance) return { root: x, iterations: i, converged: true };
    const dfx = df(x);
    if (Math.abs(dfx) < 1e-14) return { root: x, iterations: i, converged: false };
    x = x - fx / dfx;
  }
  return { root: x, iterations: maxIterations, converged: false };
}

/** Secant method (no derivative needed) */
export function secant(
  f: (x: number) => number,
  x0: number,
  x1: number,
  tolerance = 1e-8,
  maxIterations = 1000,
): RootResult {
  for (let i = 0; i < maxIterations; i++) {
    const fx0 = f(x0);
    const fx1 = f(x1);
    if (Math.abs(fx1) < tolerance) return { root: x1, iterations: i, converged: true };
    if (Math.abs(fx1 - fx0) < 1e-14) return { root: x1, iterations: i, converged: false };
    const x2 = x1 - (fx1 * (x1 - x0)) / (fx1 - fx0);
    x0 = x1;
    x1 = x2;
  }
  return { root: x1, iterations: maxIterations, converged: false };
}

// ─── 8. Lagrange Interpolation ─────────────────────────────────────────────

/**
 * Build interpolating polynomial through given points using Lagrange form.
 * Returns a function that evaluates the polynomial at any x.
 */
export function lagrangeInterpolation(
  points: Array<{ x: number; y: number }>,
): (x: number) => number {
  const n = points.length;
  return (x: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let product = points[i].y;
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          product *= (x - points[j].x) / (points[i].x - points[j].x);
        }
      }
      sum += product;
    }
    return sum;
  };
}

// ─── 9. Polynomial Utilities ───────────────────────────────────────────────

/** Multiply two polynomials */
export function polyMultiply(a: Vector, b: Vector): Vector {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] += a[i] * b[j];
    }
  }
  return result;
}

/** Add two polynomials */
export function polyAdd(a: Vector, b: Vector): Vector {
  const result = new Array(Math.max(a.length, b.length)).fill(0);
  for (let i = 0; i < a.length; i++) result[i] += a[i];
  for (let i = 0; i < b.length; i++) result[i] += b[i];
  return result;
}

/** Format polynomial as string: "3x² + 2x + 1" */
export function polyToString(coeffs: Vector): string {
  const superscripts = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
  const terms: string[] = [];
  for (let i = coeffs.length - 1; i >= 0; i--) {
    const c = coeffs[i];
    if (Math.abs(c) < 1e-10) continue;
    const sign = c > 0 ? (terms.length === 0 ? "" : " + ") : " - ";
    const absC = Math.abs(c);
    const coeffStr = i === 0 || absC !== 1 ? absC.toString() : "";
    const varStr = i === 0 ? "" : i === 1 ? "x" : `x${superscripts[i] ?? `^${i}`}`;
    terms.push(`${sign}${coeffStr}${varStr}`);
  }
  return terms.join("") || "0";
}

// ─── 10. Special Functions ──────────────────────────────────────────────────

/** Gaussian (normal) distribution PDF */
export function gaussianPDF(x: number, mu = 0, sigma = 1): number {
  const coeff = 1 / (sigma * Math.sqrt(2 * Math.PI));
  return coeff * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
}

/** Sigmoid function: σ(x) = 1 / (1 + e^{-x}) */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Softmax: convert vector to probability distribution */
export function softmax(v: Vector): Vector {
  const maxV = Math.max(...v);
  const exps = v.map((x) => Math.exp(x - maxV));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** ReLU: max(0, x) */
export function relu(x: number): number {
  return Math.max(0, x);
}

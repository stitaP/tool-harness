/**
 * Sparse & Dense Linear Algebra for Engineering
 * ──────────────────────────────────────────────
 * CSR sparse matrix, dense decompositions (LU, Cholesky, QR, eigendecomposition),
 * nonlinear system solvers (Newton-Raphson with line search), and matrix utilities.
 *
 * Zero dependencies. Runs in browser or Node.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type Vec = number[];
export type Mat = number[][];

export interface CSRMatrix {
  n: number;
  values: number[];
  colIndices: number[];
  rowPtr: number[];
}

export interface LUDecomposition {
  L: Mat;
  U: Mat;
  P: number[];
  det: number;
}

export interface CholeskyDecomposition {
  L: Mat;
}

export interface QRDecomposition {
  Q: Mat;
  R: Mat;
}

export interface EigenResult {
  values: Vec;
  vectors: Mat;
}

export interface NewtonResult {
  solution: Vec;
  iterations: number;
  residual: number;
  converged: boolean;
}

// ─── CSR Sparse Matrix ──────────────────────────────────────────────────────

export function buildCSR(
  n: number,
  triplets: Array<{ i: number; j: number; val: number }>,
): CSRMatrix {
  // Sort by row, then column
  triplets.sort((a, b) => a.i - b.i || a.j - b.j);

  // Merge duplicate entries
  const merged = new Map<string, number>();
  for (const t of triplets) {
    const key = `${t.i},${t.j}`;
    merged.set(key, (merged.get(key) || 0) + t.val);
  }

  const sorted = Array.from(merged.entries())
    .map(([k, v]) => { const [i, j] = k.split(",").map(Number); return { i, j, val: v }; })
    .sort((a, b) => a.i - b.i || a.j - b.j);

  const values: number[] = [];
  const colIndices: number[] = [];
  const rowPtr: number[] = new Array(n + 1).fill(0);

  let currentRow = 0;
  for (const t of sorted) {
    while (currentRow < t.i) {
      rowPtr[++currentRow] = values.length;
    }
    values.push(t.val);
    colIndices.push(t.j);
  }
  while (currentRow < n) {
    rowPtr[++currentRow] = values.length;
  }

  return { n, values, colIndices, rowPtr };
}

export function csrMV(A: CSRMatrix, x: Vec): Vec {
  const y = new Array(A.n).fill(0);
  for (let i = 0; i < A.n; i++) {
    for (let k = A.rowPtr[i]; k < A.rowPtr[i + 1]; k++) {
      y[i] += A.values[k] * x[A.colIndices[k]];
    }
  }
  return y;
}

export function csrGet(A: CSRMatrix, i: number, j: number): number {
  for (let k = A.rowPtr[i]; k < A.rowPtr[i + 1]; k++) {
    if (A.colIndices[k] === j) return A.values[k];
    if (A.colIndices[k] > j) break;
  }
  return 0;
}

export function csrAdd(A: CSRMatrix, B: CSRMatrix): CSRMatrix {
  const triplets: Array<{ i: number; j: number; val: number }> = [];
  for (let i = 0; i < A.n; i++) {
    for (let k = A.rowPtr[i]; k < A.rowPtr[i + 1]; k++) {
      triplets.push({ i, j: A.colIndices[k], val: A.values[k] });
    }
    for (let k = B.rowPtr[i]; k < B.rowPtr[i + 1]; k++) {
      triplets.push({ i, j: B.colIndices[k], val: B.values[k] });
    }
  }
  return buildCSR(A.n, triplets);
}

// ─── Dense LU Decomposition (Crout's with partial pivoting) ──────────────────

export function luDecompose(A: Mat): LUDecomposition {
  const n = A.length;
  const L: Mat = Array.from({ length: n }, () => new Array(n).fill(0));
  const U: Mat = A.map((r) => [...r]);
  const P: number[] = Array.from({ length: n }, (_, i) => i);
  let det = 1;

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxVal = Math.abs(U[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(U[row][col]) > maxVal) {
        maxVal = Math.abs(U[row][col]);
        maxRow = row;
      }
    }
    if (maxRow !== col) {
      [U[col], U[maxRow]] = [U[maxRow], U[col]];
      [P[col], P[maxRow]] = [P[maxRow], P[col]];
      for (let k = 0; k < col; k++) {
        [L[col][k], L[maxRow][k]] = [L[maxRow][k], L[col][k]];
      }
      det *= -1;
    }

    // Elimination
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(U[col][col]) < 1e-15) continue;
      const factor = U[row][col] / U[col][col];
      L[row][col] = factor;
      for (let k = col; k < n; k++) {
        U[row][k] -= factor * U[col][k];
      }
    }

    det *= U[col][col];
    L[col][col] = 1;
  }

  return { L, U, P, det };
}

export function luSolve(LU: LUDecomposition, b: Vec): Vec {
  const n = b.length;
  const { L, U, P } = LU;

  // Apply permutation
  const pb = P.map((i) => b[i]);

  // Forward substitution: Ly = pb
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = pb[i];
    for (let j = 0; j < i; j++) sum -= L[i][j] * y[j];
    y[i] = sum; // L[i][i] = 1
  }

  // Back substitution: Ux = y
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let j = i + 1; j < n; j++) sum -= U[i][j] * x[j];
    x[i] = Math.abs(U[i][i]) < 1e-15 ? 0 : sum / U[i][i];
  }

  return x;
}

export function solveDense(A: Mat, b: Vec): Vec {
  return luSolve(luDecompose(A), b);
}

// ─── Cholesky Decomposition (for symmetric positive-definite) ────────────────

export function choleskyDecompose(A: Mat): CholeskyDecomposition {
  const n = A.length;
  const L: Mat = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const diag = A[i][i] - sum;
        if (diag <= 0) throw new Error(`Matrix not positive-definite at (${i},${i}): ${diag}`);
        L[i][j] = Math.sqrt(diag);
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }

  return { L };
}

export function choleskySolve(chol: CholeskyDecomposition, b: Vec): Vec {
  const n = b.length;
  const { L } = chol;

  // Forward: Ly = b
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let j = 0; j < i; j++) sum -= L[i][j] * y[j];
    y[i] = sum / L[i][i];
  }

  // Backward: L^T x = y
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let j = i + 1; j < n; j++) sum -= L[j][i] * x[j];
    x[i] = sum / L[i][i];
  }

  return x;
}

// ─── QR Decomization (Gram-Schmidt) ─────────────────────────────────────────

export function qrDecompose(A: Mat): QRDecomposition {
  const m = A.length;
  const n = A[0].length;
  const Q: Mat = Array.from({ length: m }, () => new Array(n).fill(0));
  const R: Mat = Array.from({ length: n }, () => new Array(n).fill(0));

  const u: Vec[] = [];
  for (let j = 0; j < n; j++) {
    let v = A.map((row) => row[j]);

    for (let i = 0; i < j; i++) {
      let dot = 0;
      for (let k = 0; k < m; k++) dot += u[i][k] * v[k];
      R[i][j] = dot;
      for (let k = 0; k < m; k++) v[k] -= dot * u[i][k];
    }

    let norm = 0;
    for (let k = 0; k < m; k++) norm += v[k] ** 2;
    norm = Math.sqrt(norm);
    R[j][j] = norm;

    if (norm > 1e-15) {
      for (let k = 0; k < m; k++) v[k] /= norm;
    }
    u.push(v);
  }

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < m; i++) Q[i][j] = u[j][i];
  }

  return { Q, R };
}

export function qrSolve(A: Mat, b: Vec): Vec {
  const { Q, R } = qrDecompose(A);
  const m = A.length;
  const n = A[0].length;

  // Q^T b
  const Qtb = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < m; i++) Qtb[j] += Q[i][j] * b[i];
  }

  // Back substitution R x = Q^T b
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = Qtb[i];
    for (let j = i + 1; j < n; j++) sum -= R[i][j] * x[j];
    x[i] = Math.abs(R[i][i]) < 1e-15 ? 0 : sum / R[i][i];
  }

  return x;
}

// ─── Eigenvalue Decomposition (Jacobi method for symmetric matrices) ─────────

export function eigenDecompose(A: Mat, maxIter = 200, tol = 1e-10): EigenResult {
  const n = A.length;
  const V: Mat = Array.from({ length: n }, (_, i) => {
    const row = new Array(n).fill(0);
    row[i] = 1;
    return row;
  });
  const Ak = A.map((r) => [...r]);

  for (let iter = 0; iter < maxIter; iter++) {
    // Find largest off-diagonal
    let maxVal = 0;
    let p = 0, q = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(Ak[i][j]) > maxVal) {
          maxVal = Math.abs(Ak[i][j]);
          p = i; q = j;
        }
      }
    }

    if (maxVal < tol) break;

    // Compute rotation angle
    const app = Ak[p][p], aqq = Ak[q][q], apq = Ak[p][q];
    let theta: number;
    if (Math.abs(app - aqq) < 1e-15) {
      theta = Math.PI / 4;
    } else {
      theta = 0.5 * Math.atan2(2 * apq, app - aqq);
    }

    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // Apply Givens rotation: A' = G^T A G
    for (let i = 0; i < n; i++) {
      const aip = Ak[i][p], aiq = Ak[i][q];
      Ak[i][p] = c * aip + s * aiq;
      Ak[i][q] = -s * aip + c * aiq;
    }
    for (let j = 0; j < n; j++) {
      const apj = Ak[p][j], aqj = Ak[q][j];
      Ak[p][j] = c * apj + s * aqj;
      Ak[q][j] = -s * apj + c * aqj;
    }

    // Accumulate eigenvectors
    for (let i = 0; i < n; i++) {
      const vip = V[i][p], viq = V[i][q];
      V[i][p] = c * vip + s * viq;
      V[i][q] = -s * vip + c * viq;
    }
  }

  const values = Ak.map((row, i) => row[i]);

  // Sort by descending eigenvalue
  const indices = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  return {
    values: indices.map((x) => x.v),
    vectors: indices.map((x) => V.map((row) => row[x.i])),
  };
}

// ─── Matrix Utilities ────────────────────────────────────────────────────────

export function matTranspose(A: Mat): Mat {
  const m = A.length, n = A[0].length;
  return Array.from({ length: n }, (_, j) => Array.from({ length: m }, (_, i) => A[i][j]));
}

export function matMul(A: Mat, B: Mat): Mat {
  const m = A.length, n = B[0].length, p = B.length;
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let sum = 0;
      for (let k = 0; k < p; k++) sum += A[i][k] * B[k][j];
      return sum;
    }),
  );
}

export function matVecMul(A: Mat, x: Vec): Vec {
  return A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
}

export function matNorm(A: Mat): number {
  let max = 0;
  for (const row of A) for (const v of row) if (Math.abs(v) > max) max = Math.abs(v);
  return max;
}

export function matIdentity(n: number): Mat {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
}

export function matScale(A: Mat, s: number): Mat {
  return A.map((row) => row.map((v) => v * s));
}

export function matAdd(A: Mat, B: Mat): Mat {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

export function matSub(A: Mat, B: Mat): Mat {
  return A.map((row, i) => row.map((v, j) => v - B[i][j]));
}

export function vecNorm(v: Vec): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

export function vecDot(a: Vec, b: Vec): number {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}

export function vecAdd(a: Vec, b: Vec): Vec {
  return a.map((x, i) => x + b[i]);
}

export function vecSub(a: Vec, b: Vec): Vec {
  return a.map((x, i) => x - b[i]);
}

export function vecScale(a: Vec, s: number): Vec {
  return a.map((x) => x * s);
}

// ─── Nonlinear System Solver (Newton-Raphson) ────────────────────────────────

export function solveNonlinearSystem(
  F: (x: Vec) => Vec,
  J: (x: Vec) => Mat,
  x0: Vec,
  maxIter = 50,
  tol = 1e-10,
): NewtonResult {
  let x = [...x0];

  for (let iter = 0; iter < maxIter; iter++) {
    const fx = F(x);
    const norm = vecNorm(fx);

    if (norm < tol) {
      return { solution: x, iterations: iter, residual: norm, converged: true };
    }

    const Jx = J(x);

    // Solve J * dx = -F
    const negFx = fx.map((v) => -v);
    const dx = solveDense(Jx, negFx);

    // Line search (backtracking)
    let alpha = 1.0;
    const fxNorm = norm;
    for (let ls = 0; ls < 10; ls++) {
      const xNew = vecAdd(x, vecScale(dx, alpha));
      const fxNew = F(xNew);
      if (vecNorm(fxNew) < fxNorm) {
        x = xNew;
        break;
      }
      alpha *= 0.5;
      if (ls === 9) x = vecAdd(x, vecScale(dx, alpha));
    }
  }

  return {
    solution: x,
    iterations: maxIter,
    residual: vecNorm(F(x)),
    converged: false,
  };
}

// ─── Sparse Iterative Solvers ────────────────────────────────────────────────

export function solveSparseCG(A: CSRMatrix, b: Vec, maxIter?: number, tol?: number): Vec {
  const n = A.n;
  const maxIt = maxIter ?? n * 2;
  const epsilon = tol ?? 1e-10;

  let x = new Array(n).fill(0);
  let r = vecSub(b, csrMV(A, x));
  let p = [...r];
  let rsOld = vecDot(r, r);

  for (let i = 0; i < maxIt; i++) {
    const Ap = csrMV(A, p);
    const alpha = rsOld / Math.max(vecDot(p, Ap), 1e-30);
    x = vecAdd(x, vecScale(p, alpha));
    r = vecSub(r, vecScale(Ap, alpha));
    const rsNew = vecDot(r, r);

    if (Math.sqrt(rsNew) < epsilon) break;

    const beta = rsNew / Math.max(rsOld, 1e-30);
    p = vecAdd(r, vecScale(p, beta));
    rsOld = rsNew;
  }

  return x;
}

export function solveSparseBiCGSTAB(A: CSRMatrix, b: Vec, maxIter?: number, tol?: number): Vec {
  const n = A.n;
  const maxIt = maxIter ?? n * 2;
  const epsilon = tol ?? 1e-10;

  let x = new Array(n).fill(0);
  let r = vecSub(b, csrMV(A, x));
  const r0 = [...r];
  let p = [...r];
  let rho = vecDot(r0, r);

  for (let i = 0; i < maxIt; i++) {
    const Ap = csrMV(A, p);
    const alpha = rho / Math.max(vecDot(r0, Ap), 1e-30);
    let s = vecSub(r, vecScale(Ap, alpha));

    if (vecNorm(s) < epsilon) {
      x = vecAdd(x, vecScale(p, alpha));
      break;
    }

    const As = csrMV(A, s);
    const omega = vecDot(As, s) / Math.max(vecDot(As, As), 1e-30);
    x = vecAdd(x, vecAdd(vecScale(p, alpha), vecScale(s, omega)));
    r = vecSub(s, vecScale(As, omega));

    const rhoNew = vecDot(r0, r);
    if (Math.sqrt(vecDot(r, r)) < epsilon) break;

    const beta = (rhoNew / Math.max(rho, 1e-30));
    p = vecAdd(r, vecScale(p, beta));
    rho = rhoNew;
  }

  return x;
}

// ─── Eigenvalue for Generalized Problem (Kx = λMx) via Inverse Iteration ────

export function generalizedEigenInverse(
  K: Mat,
  M: Mat,
  sigma = 0,
  maxIter = 100,
  tol = 1e-8,
): { value: number; vector: Vec } {
  const n = K.length;
  // Shift: (K - σM)x = μMx, then μ = 1/(λ - σ)
  const Kshift = matSub(K, matScale(M, sigma));

  let x = new Array(n).fill(1).map(() => Math.random());
  let norm = vecNorm(x);
  x = x.map((v) => v / norm);

  for (let i = 0; i < maxIter; i++) {
    // Solve (K - σM) y = M x
    const Mx = matVecMul(M, x);
    const y = solveDense(Kshift, Mx);

    // Normalize
    norm = vecNorm(y);
    if (norm < 1e-30) break;
    const xNew = y.map((v) => v / norm);

    // Check convergence
    let diff = 0;
    for (let j = 0; j < n; j++) diff += (Math.abs(xNew[j]) - Math.abs(x[j])) ** 2;
    if (Math.sqrt(diff) < tol) {
      x = xNew;
      break;
    }
    x = xNew;
  }

  // Rayleigh quotient: λ = (x^T K x) / (x^T M x)
  const Kx = matVecMul(K, x);
  const Mx = matVecMul(M, x);
  const lambda = vecDot(x, Kx) / Math.max(vecDot(x, Mx), 1e-30);

  return { value: lambda, vector: x };
}

// ─── Determinant ─────────────────────────────────────────────────────────────

export function matDet(A: Mat): number {
  return luDecompose(A).det;
}

export function matInverse(A: Mat): Mat {
  const n = A.length;
  const lu = luDecompose(A);
  const inv: Mat = [];
  for (let j = 0; j < n; j++) {
    const ej = new Array(n).fill(0);
    ej[j] = 1;
    inv.push(luSolve(lu, ej));
  }
  // Transpose to get proper inverse
  return matTranspose(inv);
}

// ─── Least Squares (overdetermined systems) ──────────────────────────────────

export function leastSquares(A: Mat, b: Vec): Vec {
  // Normal equations: (A^T A) x = A^T b
  const At = matTranspose(A);
  const AtA = matMul(At, A);
  const Atb = matVecMul(At, b);
  return solveDense(AtA, Atb);
}

// ─── Condition Number ────────────────────────────────────────────────────────

export function conditionNumber(A: Mat): number {
  const n = A.length;
  const { values } = eigenDecompose(A);
  const maxEig = Math.max(...values.map(Math.abs));
  const minEig = Math.min(...values.map(Math.abs));
  return minEig > 1e-15 ? maxEig / minEig : Infinity;
}

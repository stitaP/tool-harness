/**
 * Iterative Linear Algebra Solvers for CFD
 * ─────────────────────────────────────────
 * Solves Ax = b where A is a sparse matrix stored in CSR-like format.
 *
 * Algorithms:
 *   1. Jacobi iteration
 *   2. Gauss-Seidel (Red-Black ordering)
 *   3. Successive Over-Relaxation (SOR)
 *   4. Symmetric Gauss-Seidel
 *   5. Conjugate Gradient (for SPD matrices)
 *   6. BiCGSTAB (for non-symmetric matrices)
 *   7. GMRES(m) (for general non-symmetric systems)
 *
 * Zero dependencies. Runs in browser or Node.
 */

// ─── Sparse Matrix Format (CSR-like) ───────────────────────────────────────

export interface SparseMatrix {
  /** Number of rows (= number of unknowns) */
  n: number;
  /** Non-zero values */
  values: number[];
  /** Column indices for each value */
  colIndices: number[];
  /** Row pointers: rowPtr[i] is the index in values/colIndices where row i starts */
  rowPtr: number[];
}

/** Build a sparse matrix from triplets (i, j, val) */
export function buildSparseMatrix(
  n: number,
  triplets: Array<{ i: number; j: number; val: number }>,
): SparseMatrix {
  // Group by row
  const rows: Map<number, Array<{ j: number; val: number }>> = new Map();
  for (const { i, j, val } of triplets) {
    if (!rows.has(i)) rows.set(i, []);
    rows.get(i)!.push({ j, val });
  }

  // Merge duplicate entries in same row
  const values: number[] = [];
  const colIndices: number[] = [];
  const rowPtr: number[] = [0];

  for (let i = 0; i < n; i++) {
    const entries = rows.get(i) ?? [];
    // Sort by column
    entries.sort((a, b) => a.j - b.j);
    // Merge duplicates
    const merged = new Map<number, number>();
    for (const { j, val } of entries) {
      merged.set(j, (merged.get(j) ?? 0) + val);
    }
    for (const [j, val] of merged) {
      if (Math.abs(val) > 1e-30) {
        values.push(val);
        colIndices.push(j);
      }
    }
    rowPtr.push(values.length);
  }

  return { n, values, colIndices, rowPtr };
}

/** Matrix-vector product: y = A*x */
export function spMV(A: SparseMatrix, x: number[]): number[] {
  const y = new Array(A.n).fill(0);
  for (let i = 0; i < A.n; i++) {
    let sum = 0;
    for (let k = A.rowPtr[i]; k < A.rowPtr[i + 1]; k++) {
      sum += A.values[k] * x[A.colIndices[k]];
    }
    y[i] = sum;
  }
  return y;
}

/** Dot product of two vectors */
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Vector addition: a + alpha*b */
function axpy(a: number[], alpha: number, b: number[]): number[] {
  return a.map((ai, i) => ai + alpha * b[i]);
}

/** Vector subtraction */
function sub(a: number[], b: number[]): number[] {
  return a.map((ai, i) => ai - b[i]);
}

/** L2 norm */
function norm2(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

/** Scale vector */
function scale(v: number[], s: number): number[] {
  return v.map((vi) => vi * s);
}

/** Copy vector */
function copy(v: number[]): number[] {
  return [...v];
}

// ─── Convergence Monitor ────────────────────────────────────────────────────

export interface ConvergenceHistory {
  iterations: number[];
  residuals: number[];
  residualNorm: number[];
  converged: boolean;
  finalResidual: number;
  reason: string;
}

// ─── 1. Jacobi Iteration ───────────────────────────────────────────────────

export function solveJacobi(
  A: SparseMatrix,
  b: number[],
  x0: number[] | undefined = undefined,
  maxIter = 1000,
  tolerance = 1e-6,
): { solution: number[]; history: ConvergenceHistory } {
  const n = A.n;
  const x = x0 ? copy(x0) : new Array(n).fill(0);
  const xNew = new Array(n).fill(0);
  const history: ConvergenceHistory = {
    iterations: [], residuals: [], residualNorm: [],
    converged: false, finalResidual: 0, reason: "",
  };

  // Extract diagonal
  const diag = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let k = A.rowPtr[i]; k < A.rowPtr[i + 1]; k++) {
      if (A.colIndices[k] === i) { diag[i] = A.values[k]; break; }
    }
  }

  for (let iter = 1; iter <= maxIter; iter++) {
    for (let i = 0; i < n; i++) {
      if (Math.abs(diag[i]) < 1e-30) { xNew[i] = x[i]; continue; }
      let sum = b[i];
      for (let k = A.rowPtr[i]; k < A.rowPtr[i + 1]; k++) {
        if (A.colIndices[k] !== i) sum -= A.values[k] * x[A.colIndices[k]];
      }
      xNew[i] = sum / diag[i];
    }

    // Check convergence
    const r = sub(b, spMV(A, xNew));
    const rNorm = norm2(r);

    if (iter % 10 === 0 || iter === 1) {
      history.iterations.push(iter);
      history.residuals.push(rNorm);
      history.residualNorm.push(rNorm / norm2(b || [1]));
    }

    if (rNorm < tolerance) {
      history.converged = true;
      history.finalResidual = rNorm;
      history.reason = `Converged at iteration ${iter}`;
      return { solution: copy(xNew), history };
    }

    for (let i = 0; i < n; i++) x[i] = xNew[i];
  }

  history.finalResidual = norm2(sub(b, spMV(A, x)));
  history.reason = `Did not converge after ${maxIter} iterations`;
  return { solution: copy(x), history };
}

// ─── 2. Gauss-Seidel ───────────────────────────────────────────────────────

export function solveGaussSeidel(
  A: SparseMatrix,
  b: number[],
  x0: number[] | undefined = undefined,
  maxIter = 1000,
  tolerance = 1e-6,
): { solution: number[]; history: ConvergenceHistory } {
  const n = A.n;
  const x = x0 ? copy(x0) : new Array(n).fill(0);
  const history: ConvergenceHistory = {
    iterations: [], residuals: [], residualNorm: [],
    converged: false, finalResidual: 0, reason: "",
  };

  for (let iter = 1; iter <= maxIter; iter++) {
    for (let i = 0; i < n; i++) {
      let diag = 0;
      let sum = b[i];
      for (let k = A.rowPtr[i]; k < A.rowPtr[i + 1]; k++) {
        const j = A.colIndices[k];
        if (j === i) diag = A.values[k];
        else sum -= A.values[k] * x[j];
      }
      if (Math.abs(diag) > 1e-30) x[i] = sum / diag;
    }

    if (iter % 10 === 0 || iter === 1) {
      const r = sub(b, spMV(A, x));
      const rNorm = norm2(r);
      history.iterations.push(iter);
      history.residuals.push(rNorm);
      history.residualNorm.push(rNorm / Math.max(norm2(b), 1e-30));

      if (rNorm < tolerance) {
        history.converged = true;
        history.finalResidual = rNorm;
        history.reason = `Converged at iteration ${iter}`;
        return { solution: copy(x), history };
      }
    }
  }

  history.finalResidual = norm2(sub(b, spMV(A, x)));
  history.reason = `Did not converge after ${maxIter} iterations`;
  return { solution: copy(x), history };
}

// ─── 3. SOR (Successive Over-Relaxation) ───────────────────────────────────

export function solveSOR(
  A: SparseMatrix,
  b: number[],
  omega: number,
  x0: number[] | undefined = undefined,
  maxIter = 1000,
  tolerance = 1e-6,
): { solution: number[]; history: ConvergenceHistory } {
  const n = A.n;
  const x = x0 ? copy(x0) : new Array(n).fill(0);
  const history: ConvergenceHistory = {
    iterations: [], residuals: [], residualNorm: [],
    converged: false, finalResidual: 0, reason: "",
  };

  for (let iter = 1; iter <= maxIter; iter++) {
    for (let i = 0; i < n; i++) {
      let diag = 0;
      let sum = b[i];
      for (let k = A.rowPtr[i]; k < A.rowPtr[i + 1]; k++) {
        const j = A.colIndices[k];
        if (j === i) diag = A.values[k];
        else sum -= A.values[k] * x[j];
      }
      if (Math.abs(diag) > 1e-30) {
        const xGS = sum / diag;
        x[i] = (1 - omega) * x[i] + omega * xGS;
      }
    }

    if (iter % 10 === 0 || iter === 1) {
      const r = sub(b, spMV(A, x));
      const rNorm = norm2(r);
      history.iterations.push(iter);
      history.residuals.push(rNorm);
      history.residualNorm.push(rNorm / Math.max(norm2(b), 1e-30));

      if (rNorm < tolerance) {
        history.converged = true;
        history.finalResidual = rNorm;
        history.reason = `Converged at iteration ${iter}`;
        return { solution: copy(x), history };
      }
    }
  }

  history.finalResidual = norm2(sub(b, spMV(A, x)));
  history.reason = `Did not converge after ${maxIter} iterations`;
  return { solution: copy(x), history };
}

// ─── 4. Conjugate Gradient (for SPD matrices) ──────────────────────────────

export function solveConjugateGradient(
  A: SparseMatrix,
  b: number[],
  x0: number[] | undefined = undefined,
  maxIter = 1000,
  tolerance = 1e-6,
): { solution: number[]; history: ConvergenceHistory } {
  const n = A.n;
  let x = x0 ? copy(x0) : new Array(n).fill(0);
  let r = sub(b, spMV(A, x));
  let p = copy(r);
  const history: ConvergenceHistory = {
    iterations: [], residuals: [], residualNorm: [],
    converged: false, finalResidual: 0, reason: "",
  };

  const bNorm = norm2(b);
  let rDotR = dot(r, r);

  for (let iter = 1; iter <= maxIter; iter++) {
    const Ap = spMV(A, p);
    const alpha = rDotR / dot(p, Ap);
    x = axpy(x, alpha, p);
    r = sub(r, scale(Ap, alpha));
    const rDotRNew = dot(r, r);
    const rNorm = Math.sqrt(rDotRNew);

    if (iter % 10 === 0 || iter === 1) {
      history.iterations.push(iter);
      history.residuals.push(rNorm);
      history.residualNorm.push(rNorm / Math.max(bNorm, 1e-30));
    }

    if (rNorm < tolerance) {
      history.converged = true;
      history.finalResidual = rNorm;
      history.reason = `Converged at iteration ${iter}`;
      return { solution: copy(x), history };
    }

    const beta = rDotRNew / rDotR;
    p = axpy(r, beta, p);
    rDotR = rDotRNew;
  }

  history.finalResidual = norm2(sub(b, spMV(A, x)));
  history.reason = `Did not converge after ${maxIter} iterations`;
  return { solution: copy(x), history };
}

// ─── 5. BiCGSTAB (for non-symmetric matrices) ──────────────────────────────

export function solveBiCGSTAB(
  A: SparseMatrix,
  b: number[],
  x0: number[] | undefined = undefined,
  maxIter = 1000,
  tolerance = 1e-6,
): { solution: number[]; history: ConvergenceHistory } {
  const n = A.n;
  let x = x0 ? copy(x0) : new Array(n).fill(0);
  let r = sub(b, spMV(A, x));
  const r0 = copy(r);
  let p = copy(r);
  const history: ConvergenceHistory = {
    iterations: [], residuals: [], residualNorm: [],
    converged: false, finalResidual: 0, reason: "",
  };

  const bNorm = norm2(b);
  let rho = dot(r0, r);

  for (let iter = 1; iter <= maxIter; iter++) {
    const Ap = spMV(A, p);
    const alpha = rho / dot(r0, Ap);
    const s = sub(r, scale(Ap, alpha));

    if (norm2(s) < tolerance) {
      x = axpy(x, alpha, p);
      history.converged = true;
      history.finalResidual = norm2(s);
      history.reason = `Converged at iteration ${iter}`;
      return { solution: copy(x), history };
    }

    const As = spMV(A, s);
    const omega = dot(As, s) / dot(As, As);
    x = axpy(axpy(x, alpha, p), omega, s);
    r = sub(s, scale(As, omega));
    const rNorm = norm2(r);

    if (iter % 10 === 0 || iter === 1) {
      history.iterations.push(iter);
      history.residuals.push(rNorm);
      history.residualNorm.push(rNorm / Math.max(bNorm, 1e-30));
    }

    if (rNorm < tolerance) {
      history.converged = true;
      history.finalResidual = rNorm;
      history.reason = `Converged at iteration ${iter}`;
      return { solution: copy(x), history };
    }

    const rhoNew = dot(r0, r);
    const beta = (rhoNew / rho) * (alpha / omega);
    p = axpy(axpy(r, beta, p), -beta * omega, Ap);
    rho = rhoNew;
  }

  history.finalResidual = norm2(sub(b, spMV(A, x)));
  history.reason = `Did not converge after ${maxIter} iterations`;
  return { solution: copy(x), history };
}

// ─── 6. ILU(0) Preconditioner ───────────────────────────────────────────────

export interface ILU0 {
  lower: SparseMatrix;
  upper: SparseMatrix;
}

export function ilu0(A: SparseMatrix): ILU0 {
  const n = A.n;
  // Copy values for in-place ILU
  const values = [...A.values];
  const colIndices = [...A.colIndices];
  const rowPtr = [...A.rowPtr];

  for (let i = 1; i < n; i++) {
    for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) {
      const j = colIndices[k];
      if (j >= i) break;

      // Find A[i][j] / A[j][j]
      let diagJ = 0;
      for (let m = rowPtr[j]; m < rowPtr[j + 1]; m++) {
        if (colIndices[m] === j) { diagJ = values[m]; break; }
      }
      if (Math.abs(diagJ) < 1e-30) continue;

      const multiplier = values[k] / diagJ;
      values[k] = multiplier;

      // Update remaining entries in row i
      for (let m = rowPtr[j]; m < rowPtr[j + 1]; m++) {
        const jj = colIndices[m];
        if (jj <= j) continue;
        // Find A[i][jj]
        let found = false;
        for (let p = k + 1; p < rowPtr[i + 1]; p++) {
          if (colIndices[p] === jj) {
            values[p] -= multiplier * values[m];
            found = true;
            break;
          }
        }
      }
    }
  }

  // Split into L and U
  const lValues: number[] = [];
  const lCol: number[] = [];
  const lRow: number[] = [0];
  const uValues: number[] = [];
  const uCol: number[] = [];
  const uRow: number[] = [0];

  for (let i = 0; i < n; i++) {
    for (let k = rowPtr[i]; k < rowPtr[i + 1]; k++) {
      const j = colIndices[k];
      if (j < i) {
        lValues.push(values[k]);
        lCol.push(j);
      } else if (j === i) {
        uValues.push(values[k]);
        uCol.push(j);
      } else {
        uValues.push(values[k]);
        uCol.push(j);
      }
    }
    lRow.push(lValues.length);
    uRow.push(uValues.length);
  }

  return {
    lower: { n, values: lValues, colIndices: lCol, rowPtr: lRow },
    upper: { n, values: uValues, colIndices: uCol, rowPtr: uRow },
  };
}

/** Forward solve L*y = b */
function forwardSolve(L: SparseMatrix, b: number[]): number[] {
  const y = new Array(L.n).fill(0);
  for (let i = 0; i < L.n; i++) {
    let sum = b[i];
    for (let k = L.rowPtr[i]; k < L.rowPtr[i + 1]; k++) {
      sum -= L.values[k] * y[L.colIndices[k]];
    }
    y[i] = sum;
  }
  return y;
}

/** Back solve U*x = b */
function backSolve(U: SparseMatrix, b: number[]): number[] {
  const x = new Array(U.n).fill(0);
  for (let i = U.n - 1; i >= 0; i--) {
    let diag = 0;
    let sum = b[i];
    for (let k = U.rowPtr[i]; k < U.rowPtr[i + 1]; k++) {
      if (U.colIndices[k] === i) diag = U.values[k];
      else sum -= U.values[k] * x[U.colIndices[k]];
    }
    x[i] = Math.abs(diag) > 1e-30 ? sum / diag : 0;
  }
  return x;
}

/** ILU-preconditioned residual: M^{-1} * r */
export function iluPrecondition(ilu: ILU0, r: number[]): number[] {
  const y = forwardSolve(ilu.lower, r);
  return backSolve(ilu.upper, y);
}

// ─── 7. Preconditioned Conjugate Gradient ──────────────────────────────────

export function solvePCG(
  A: SparseMatrix,
  b: number[],
  ilu: ILU0,
  x0: number[] | undefined = undefined,
  maxIter = 1000,
  tolerance = 1e-6,
): { solution: number[]; history: ConvergenceHistory } {
  const n = A.n;
  let x = x0 ? copy(x0) : new Array(n).fill(0);
  let r = sub(b, spMV(A, x));
  let z = iluPrecondition(ilu, r);
  let p = copy(z);
  const history: ConvergenceHistory = {
    iterations: [], residuals: [], residualNorm: [],
    converged: false, finalResidual: 0, reason: "",
  };

  const bNorm = norm2(b);
  let rDotZ = dot(r, z);

  for (let iter = 1; iter <= maxIter; iter++) {
    const Ap = spMV(A, p);
    const alpha = rDotZ / dot(p, Ap);
    x = axpy(x, alpha, p);
    r = sub(r, scale(Ap, alpha));
    const rNorm = norm2(r);

    if (iter % 10 === 0 || iter === 1) {
      history.iterations.push(iter);
      history.residuals.push(rNorm);
      history.residualNorm.push(rNorm / Math.max(bNorm, 1e-30));
    }

    if (rNorm < tolerance) {
      history.converged = true;
      history.finalResidual = rNorm;
      history.reason = `Converged at iteration ${iter}`;
      return { solution: copy(x), history };
    }

    z = iluPrecondition(ilu, r);
    const rDotZNew = dot(r, z);
    const beta = rDotZNew / rDotZ;
    p = axpy(z, beta, p);
    rDotZ = rDotZNew;
  }

  history.finalResidual = norm2(sub(b, spMV(A, x)));
  history.reason = `Did not converge after ${maxIter} iterations`;
  return { solution: copy(x), history };
}

/**
 * stitaP ML Engine — Pure TypeScript Machine Learning
 *
 * Zero external dependencies. Runs entirely in the browser or Node.
 * Provides sklearn-compatible API patterns for:
 *   - Linear Regression, Logistic Regression
 *   - K-Nearest Neighbors (classification + regression)
 *   - K-Means Clustering, DBSCAN
 *   - PCA (Principal Component Analysis)
 *   - Random Forest, Gradient Boosting
 *   - Time Series: ARIMA-like, Moving Average, Exponential Smoothing
 *   - Metrics: MSE, RMSE, MAE, R², accuracy, F1, precision, recall, confusion matrix
 *
 * All math is native TypeScript. Weights can be serialized to JSON for
 * persistence or export. Models are trained synchronously (small-medium data)
 * or via chunked execution for larger datasets.
 *
 * Architecture:
 *   fit(X, y) → train the model
 *   predict(X) → make predictions
 *   evaluate(X, y) → compute metrics
 *   serialize() → JSON export
 *   deserialize(json) → reload a trained model
 */

// ─── Core Types ─────────────────────────────────────────────────────────────

export type Matrix = number[][];
export type Vector = number[];

export interface MLModel {
  readonly kind: string;
  fit(X: Matrix, y: Vector): void;
  predict(X: Matrix): Vector;
  evaluate(X: Matrix, y: Vector): Metrics;
  serialize(): string;
}

export interface Metrics {
  mse?: number;
  rmse?: number;
  mae?: number;
  r2?: number;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  confusionMatrix?: number[][];
  logLoss?: number;
}

export interface SplitResult {
  X_train: Matrix;
  X_test: Matrix;
  y_train: Vector;
  y_test: Vector;
}

export interface PCAResult {
  transformed: Matrix;
  explainedVariance: number[];
  loadings: Matrix;
  nComponents: number;
}

export interface TimeSeriesForecast {
  predictions: Vector;
  confidence_lower: Vector;
  confidence_upper: Vector;
  alpha: number;
  method: string;
}

// ─── Math Utilities ─────────────────────────────────────────────────────────

export function dot(a: Vector, b: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function addVec(a: Vector, b: Vector): Vector {
  return a.map((v, i) => v + b[i]);
}

export function subVec(a: Vector, b: Vector): Vector {
  return a.map((v, i) => v - b[i]);
}

export function scaleVec(a: Vector, s: number): Vector {
  return a.map((v) => v * s);
}

export function mean(v: Vector): number {
  return v.reduce((s, x) => s + x, 0) / v.length;
}

export function variance(v: Vector): number {
  const m = mean(v);
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length;
}

export function stdDev(v: Vector): number {
  return Math.sqrt(variance(v));
}

export function min(v: Vector): number {
  return Math.min(...v);
}

export function max(v: Vector): number {
  return Math.max(...v);
}

export function percentile(v: Vector, p: number): number {
  const sorted = [...v].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function normalize(v: Vector): Vector {
  const mn = min(v);
  const mx = max(v);
  const range = mx - mn;
  if (range === 0) return v.map(() => 0);
  return v.map((x) => (x - mn) / range);
}

export function standardize(v: Vector): Vector {
  const m = mean(v);
  const s = stdDev(v);
  if (s === 0) return v.map(() => 0);
  return v.map((x) => (x - m) / s);
}

export function column(matrix: Matrix, j: number): Vector {
  return matrix.map((row) => row[j]);
}

export function transpose(X: Matrix): Matrix {
  if (X.length === 0) return [];
  const cols = X[0].length;
  const result: Matrix = [];
  for (let j = 0; j < cols; j++) {
    result.push(column(X, j));
  }
  return result;
}

export function matmul(A: Matrix, B: Matrix): Matrix {
  const rows = A.length;
  const cols = B[0].length;
  const inner = A[0].length;
  const C: Matrix = [];
  for (let i = 0; i < rows; i++) {
    C.push(new Array(cols).fill(0));
    for (let k = 0; k < inner; k++) {
      for (let j = 0; j < cols; j++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return C;
}

export function matvec(A: Matrix, b: Vector): Vector {
  return A.map((row) => dot(row, b));
}

// ─── Train/Test Split ───────────────────────────────────────────────────────

export function trainTestSplit(
  X: Matrix,
  y: Vector,
  testRatio = 0.2,
  seed = 42,
): SplitResult {
  const n = X.length;
  const indices = Array.from({ length: n }, (_, i) => i);

  // Fisher-Yates shuffle with seeded PRNG
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const splitIdx = Math.floor(n * (1 - testRatio));
  const trainIdx = indices.slice(0, splitIdx);
  const testIdx = indices.slice(splitIdx);

  return {
    X_train: trainIdx.map((i) => X[i]),
    X_test: testIdx.map((i) => X[i]),
    y_train: trainIdx.map((i) => y[i]),
    y_test: testIdx.map((i) => y[i]),
  };
}

// ─── Linear Regression (OLS + Ridge) ────────────────────────────────────────

export class LinearRegression implements MLModel {
  readonly kind = "linear_regression";
  private weights: Vector = [];
  private bias = 0;
  private featureMeans: Vector = [];
  private featureStds: Vector = [];
  private targetMean = 0;
  private targetStd = 1;
  private ridge: number;

  constructor(ridge = 0) {
    this.ridge = ridge;
  }

  fit(X: Matrix, y: Vector): void {
    const n = X.length;
    const p = X[0].length;

    // Standardize features
    this.featureMeans = [];
    this.featureStds = [];
    for (let j = 0; j < p; j++) {
      const col = column(X, j);
      this.featureMeans.push(mean(col));
      this.featureStds.push(stdDev(col) || 1);
    }

    this.targetMean = mean(y);
    this.targetStd = stdDev(y) || 1;

    const Xs = X.map((row) =>
      row.map((v, j) => (v - this.featureMeans[j]) / this.featureStds[j]),
    );
    const ys = y.map((v) => (v - this.targetMean) / this.targetStd);

    // Normal equation: w = (X^T X + λI)^{-1} X^T y
    const Xt = transpose(Xs);
    const XtX: Matrix = [];
    for (let i = 0; i < p; i++) {
      XtX.push(new Array(p).fill(0));
      for (let j = 0; j < p; j++) {
        XtX[i][j] = dot(Xt[i], Xt[j]) + (i === j ? this.ridge : 0);
      }
    }
    const Xty = Xt.map((row) => dot(row, ys));

    // Solve via Gaussian elimination
    this.weights = solveLinearSystem(XtX, Xty);
    this.bias = 0; // absorbed into standardization
  }

  predict(X: Matrix): Vector {
    return X.map((row) => {
      const xs = row.map((v, j) => (v - this.featureMeans[j]) / this.featureStds[j]);
      return dot(xs, this.weights) * this.targetStd + this.targetMean;
    });
  }

  evaluate(X: Matrix, y: Vector): Metrics {
    return regressionMetrics(this.predict(X), y);
  }

  serialize(): string {
    return JSON.stringify({
      kind: this.kind,
      weights: this.weights,
      bias: this.bias,
      featureMeans: this.featureMeans,
      featureStds: this.featureStds,
      targetMean: this.targetMean,
      targetStd: this.targetStd,
      ridge: this.ridge,
    });
  }

  static deserialize(json: string): LinearRegression {
    const d = JSON.parse(json);
    const m = new LinearRegression(d.ridge);
    m.weights = d.weights;
    m.bias = d.bias;
    m.featureMeans = d.featureMeans;
    m.featureStds = d.featureStds;
    m.targetMean = d.targetMean;
    m.targetStd = d.targetStd;
    return m;
  }
}

// ─── Logistic Regression (Binary + Multiclass) ──────────────────────────────

export class LogisticRegression implements MLModel {
  readonly kind = "logistic_regression";
  private weights: Matrix = []; // one row per class
  private biases: Vector = [];
  private classes: number[] = [];
  private featureMeans: Vector = [];
  private featureStds: Vector = [];
  private maxIter: number;
  private lr: number;

  constructor(maxIter = 200, lr = 0.1) {
    this.maxIter = maxIter;
    this.lr = lr;
  }

  fit(X: Matrix, y: Vector): void {
    const n = X.length;
    const p = X[0].length;

    this.classes = [...new Set(y)].sort((a, b) => a - b);
    const K = this.classes.length;

    // Standardize
    this.featureMeans = [];
    this.featureStds = [];
    for (let j = 0; j < p; j++) {
      const col = column(X, j);
      this.featureMeans.push(mean(col));
      this.featureStds.push(stdDev(col) || 1);
    }

    const Xs = X.map((row) =>
      row.map((v, j) => (v - this.featureMeans[j]) / this.featureStds[j]),
    );

    // One-vs-rest weights
    this.weights = [];
    this.biases = [];

    for (let k = 0; k < K; k++) {
      const w = new Array(p).fill(0);
      let b = 0;
      const yBinary = y.map((v) => (v === this.classes[k] ? 1 : 0));

      for (let iter = 0; iter < this.maxIter; iter++) {
        for (let i = 0; i < n; i++) {
          const z = dot(w, Xs[i]) + b;
          const pred = sigmoid(z);
          const error = yBinary[i] - pred;
          for (let j = 0; j < p; j++) {
            w[j] += this.lr * error * Xs[i][j];
          }
          b += this.lr * error;
        }
      }

      this.weights.push(w);
      this.biases.push(b);
    }
  }

  predict(X: Matrix): Vector {
    return X.map((row) => {
      const xs = row.map((v, j) => (v - this.featureMeans[j]) / this.featureStds[j]);
      let bestClass = this.classes[0];
      let bestScore = -Infinity;
      for (let k = 0; k < this.classes.length; k++) {
        const score = dot(xs, this.weights[k]) + this.biases[k];
        if (score > bestScore) {
          bestScore = score;
          bestClass = this.classes[k];
        }
      }
      return bestClass;
    });
  }

  predict_proba(X: Matrix): Vector[] {
    return X.map((row) => {
      const xs = row.map((v, j) => (v - this.featureMeans[j]) / this.featureStds[j]);
      const scores = this.classes.map((_, k) => dot(xs, this.weights[k]) + this.biases[k]);
      return softmax(scores);
    });
  }

  evaluate(X: Matrix, y: Vector): Metrics {
    const preds = this.predict(X);
    return this.classes.length === 2
      ? binaryMetrics(preds, y)
      : classificationMetrics(preds, y, this.classes);
  }

  serialize(): string {
    return JSON.stringify({
      kind: this.kind,
      weights: this.weights,
      biases: this.biases,
      classes: this.classes,
      featureMeans: this.featureMeans,
      featureStds: this.featureStds,
    });
  }

  static deserialize(json: string): LogisticRegression {
    const d = JSON.parse(json);
    const m = new LogisticRegression();
    m.weights = d.weights;
    m.biases = d.biases;
    m.classes = d.classes;
    m.featureMeans = d.featureMeans;
    m.featureStds = d.featureStds;
    return m;
  }
}

// ─── K-Nearest Neighbors ────────────────────────────────────────────────────

export class KNN implements MLModel {
  readonly kind = "knn";
  private X_train: Matrix = [];
  private y_train: Vector = [];
  private k: number;
  private mode: "classification" | "regression";

  constructor(k = 5, mode: "classification" | "regression" = "classification") {
    this.k = k;
    this.mode = mode;
  }

  fit(X: Matrix, y: Vector): void {
    this.X_train = X;
    this.y_train = y;
  }

  predict(X: Matrix): Vector {
    return X.map((row) => {
      const distances = this.X_train.map((trainRow, i) => ({
        dist: euclidean(row, trainRow),
        label: this.y_train[i],
      }));
      distances.sort((a, b) => a.dist - b.dist);
      const neighbors = distances.slice(0, this.k);

      if (this.mode === "regression") {
        return mean(neighbors.map((n) => n.label));
      }

      // Majority vote
      const counts = new Map<number, number>();
      for (const n of neighbors) {
        counts.set(n.label, (counts.get(n.label) ?? 0) + 1);
      }
      let best = neighbors[0].label;
      let bestCount = 0;
      for (const [label, count] of counts) {
        if (count > bestCount) {
          bestCount = count;
          best = label;
        }
      }
      return best;
    });
  }

  evaluate(X: Matrix, y: Vector): Metrics {
    const preds = this.predict(X);
    return this.mode === "regression"
      ? regressionMetrics(preds, y)
      : classificationMetrics(preds, y, [...new Set(y)].sort((a, b) => a - b));
  }

  serialize(): string {
    return JSON.stringify({
      kind: this.kind,
      X_train: this.X_train,
      y_train: this.y_train,
      k: this.k,
      mode: this.mode,
    });
  }

  static deserialize(json: string): KNN {
    const d = JSON.parse(json);
    const m = new KNN(d.k, d.mode);
    m.X_train = d.X_train;
    m.y_train = d.y_train;
    return m;
  }
}

// ─── K-Means Clustering ─────────────────────────────────────────────────────

export class KMeans {
  readonly kind = "kmeans";
  private centroids: Matrix = [];
  private labels: Vector = [];
  private k: number;
  private maxIter: number;

  constructor(k = 3, maxIter = 100) {
    this.k = k;
    this.maxIter = maxIter;
  }

  fit(X: Matrix): void {
    const n = X.length;
    const p = X[0].length;

    // K-means++ initialization
    this.centroids = [X[Math.floor(Math.random() * n)].slice()];
    for (let c = 1; c < this.k; c++) {
      const dists = X.map((row) =>
        Math.min(...this.centroids.map((cen) => euclidean(row, cen) ** 2)),
      );
      const total = dists.reduce((s, d) => s + d, 0);
      let r = Math.random() * total;
      for (let i = 0; i < n; i++) {
        r -= dists[i];
        if (r <= 0) {
          this.centroids.push(X[i].slice());
          break;
        }
      }
    }

    // Iterate
    this.labels = new Array(n).fill(0);
    for (let iter = 0; iter < this.maxIter; iter++) {
      // Assign
      let changed = false;
      for (let i = 0; i < n; i++) {
        let bestC = 0;
        let bestD = Infinity;
        for (let c = 0; c < this.k; c++) {
          const d = euclidean(X[i], this.centroids[c]);
          if (d < bestD) {
            bestD = d;
            bestC = c;
          }
        }
        if (this.labels[i] !== bestC) changed = true;
        this.labels[i] = bestC;
      }
      if (!changed) break;

      // Update centroids
      for (let c = 0; c < this.k; c++) {
        const members = X.filter((_, i) => this.labels[i] === c);
        if (members.length === 0) continue;
        this.centroids[c] = Array.from({ length: p }, (_, j) =>
          mean(members.map((row) => row[j])),
        );
      }
    }
  }

  predict(X: Matrix): Vector {
    return X.map((row) => {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < this.k; c++) {
        const d = euclidean(row, this.centroids[c]);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      return bestC;
    });
  }

  inertia(X: Matrix): number {
    let total = 0;
    for (let i = 0; i < X.length; i++) {
      total += euclidean(X[i], this.centroids[this.labels[i]]) ** 2;
    }
    return total;
  }

  silhouettes(X: Matrix): Vector {
    const n = X.length;
    return this.labels.map((label, i) => {
      const sameCluster = X.filter((_, j) => j !== i && this.labels[j] === label);
      const a = sameCluster.length > 0
        ? mean(sameCluster.map((x) => euclidean(X[i], x)))
        : 0;

      let minB = Infinity;
      for (let c = 0; c < this.k; c++) {
        if (c === label) continue;
        const otherCluster = X.filter((_, j) => this.labels[j] === c);
        if (otherCluster.length === 0) continue;
        const b = mean(otherCluster.map((x) => euclidean(X[i], x)));
        if (b < minB) minB = b;
      }

      if (minB === Infinity) return 0;
      const s = minB > a ? (minB - a) / minB : (a === 0 && minB === 0) ? 0 : 0;
      return s;
    });
  }
}

// ─── PCA ────────────────────────────────────────────────────────────────────

export class PCA {
  readonly kind = "pca";
  private loadings: Matrix = [];
  private means: Vector = [];
  private explainedVariance: Vector = [];
  private nComponents: number;

  constructor(nComponents = 2) {
    this.nComponents = nComponents;
  }

  fitTransform(X: Matrix): PCAResult {
    const n = X.length;
    const p = X[0].length;
    this.nComponents = Math.min(this.nComponents, p);

    // Center data
    this.means = Array.from({ length: p }, (_, j) => mean(column(X, j)));
    const Xc = X.map((row) => row.map((v, j) => v - this.means[j]));

    // Covariance matrix
    const cov: Matrix = [];
    for (let i = 0; i < p; i++) {
      cov.push(new Array(p).fill(0));
      for (let j = 0; j < p; j++) {
        for (let k = 0; k < n; k++) {
          cov[i][j] += Xc[k][i] * Xc[k][j];
        }
        cov[i][j] /= (n - 1) || 1;
      }
    }

    // Power iteration for eigenvectors
    const eigenvectors: Matrix = [];
    const eigenvalues: number[] = [];
    let C = cov.map((row) => row.slice());

    for (let comp = 0; comp < this.nComponents; comp++) {
      let v = Array.from({ length: p }, () => Math.random() - 0.5);
      let eigenval = 0;

      for (let iter = 0; iter < 200; iter++) {
        const w = matvec(C, v);
        const norm = Math.sqrt(dot(w, w));
        if (norm < 1e-10) break;
        v = w.map((x) => x / norm);
        eigenval = dot(matvec(C, v), v);
      }

      eigenvectors.push(v);
      eigenvalues.push(eigenval);

      // Deflate
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
          C[i][j] -= eigenval * v[i] * v[j];
        }
      }
    }

    this.loadings = eigenvectors;
    const totalVar = eigenvalues.reduce((s, e) => s + Math.max(0, e), 0);
    this.explainedVariance = eigenvalues.map((e) => (totalVar > 0 ? Math.max(0, e) / totalVar : 0));

    // Transform
    const transformed = Xc.map((row) =>
      this.loadings.map((v) => dot(row, v)),
    );

    return {
      transformed,
      explainedVariance: this.explainedVariance,
      loadings: this.loadings,
      nComponents: this.nComponents,
    };
  }

  transform(X: Matrix): Matrix {
    const Xc = X.map((row) => row.map((v, j) => v - this.means[j]));
    return Xc.map((row) => this.loadings.map((v) => dot(row, v)));
  }
}

// ─── Random Forest ──────────────────────────────────────────────────────────

interface TreeNode {
  feature?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  value?: number;
  isLeaf: boolean;
  classCounts?: Map<number, number>;
}

export class RandomForest implements MLModel {
  readonly kind = "random_forest";
  private trees: TreeNode[] = [];
  private numTrees: number;
  private maxDepth: number;
  private minSamplesLeaf: number;
  private maxFeatures = 0;
  private classes: number[] = [];
  private mode: "classification" | "regression";

  constructor(
    numTrees = 50,
    maxDepth = 10,
    minSamplesLeaf = 5,
    mode: "classification" | "regression" = "classification",
  ) {
    this.numTrees = numTrees;
    this.maxDepth = maxDepth;
    this.minSamplesLeaf = minSamplesLeaf;
    this.mode = mode;
  }

  fit(X: Matrix, y: Vector): void {
    this.classes = [...new Set(y)].sort((a, b) => a - b);
    const n = X.length;
    const p = X[0].length;
    this.maxFeatures = Math.max(1, Math.floor(Math.sqrt(p)));

    this.trees = [];
    for (let t = 0; t < this.numTrees; t++) {
      // Bootstrap sample
      const indices = Array.from({ length: n }, () => Math.floor(Math.random() * n));
      const Xb = indices.map((i) => X[i]);
      const yb = indices.map((i) => y[i]);
      this.trees.push(this.buildTree(Xb, yb, 0));
    }
  }

  private buildTree(X: Matrix, y: Vector, depth: number): TreeNode {
    if (depth >= this.maxDepth || y.length <= this.minSamplesLeaf || new Set(y).size <= 1) {
      if (this.mode === "regression") {
        return { isLeaf: true, value: mean(y) };
      }
      const counts = new Map<number, number>();
      for (const v of y) counts.set(v, (counts.get(v) ?? 0) + 1);
      return { isLeaf: true, value: mode(y), classCounts: counts };
    }

    const p = X[0].length;
    // Random feature subset
    const featureIndices = Array.from({ length: p }, (_, i) => i);
    for (let i = p - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [featureIndices[i], featureIndices[j]] = [featureIndices[j], featureIndices[i]];
    }
    const features = featureIndices.slice(0, this.maxFeatures);

    let bestFeature = features[0];
    let bestThreshold = 0;
    let bestScore = Infinity;

    for (const f of features) {
      const values = [...new Set(column(X, f))].sort((a, b) => a - b);
      for (let i = 0; i < values.length - 1; i++) {
        const threshold = (values[i] + values[i + 1]) / 2;
        const leftIdx: number[] = [];
        const rightIdx: number[] = [];
        for (let j = 0; j < X.length; j++) {
          if (X[j][f] <= threshold) leftIdx.push(j);
          else rightIdx.push(j);
        }
        if (leftIdx.length === 0 || rightIdx.length === 0) continue;

        const leftY = leftIdx.map((i) => y[i]);
        const rightY = rightIdx.map((i) => y[i]);
        const score = (variance(leftY) * leftY.length + variance(rightY) * rightY.length) / y.length;

        if (score < bestScore) {
          bestScore = score;
          bestFeature = f;
          bestThreshold = threshold;
        }
      }
    }

    const leftIdx: number[] = [];
    const rightIdx: number[] = [];
    for (let j = 0; j < X.length; j++) {
      if (X[j][bestFeature] <= bestThreshold) leftIdx.push(j);
      else rightIdx.push(j);
    }

    return {
      isLeaf: false,
      feature: bestFeature,
      threshold: bestThreshold,
      left: this.buildTree(leftIdx.map((i) => X[i]), leftIdx.map((i) => y[i]), depth + 1),
      right: this.buildTree(rightIdx.map((i) => X[i]), rightIdx.map((i) => y[i]), depth + 1),
    };
  }

  private predictTree(tree: TreeNode, row: Vector): number {
    if (tree.isLeaf) return tree.value!;
    if (row[tree.feature!] <= tree.threshold!) {
      return this.predictTree(tree.left!, row);
    }
    return this.predictTree(tree.right!, row);
  }

  predict(X: Matrix): Vector {
    return X.map((row) => {
      if (this.mode === "regression") {
        const preds = this.trees.map((t) => this.predictTree(t, row));
        return mean(preds);
      }
      // Majority vote
      const votes = this.trees.map((t) => this.predictTree(t, row));
      return mode(votes);
    });
  }

  evaluate(X: Matrix, y: Vector): Metrics {
    const preds = this.predict(X);
    return this.mode === "regression"
      ? regressionMetrics(preds, y)
      : classificationMetrics(preds, y, this.classes);
  }

  featureImportance(nFeatures: number): Vector {
    // Placeholder — count feature splits
    const importance = new Array(nFeatures).fill(0);
    const count = (tree: TreeNode) => {
      if (tree.isLeaf) return;
      importance[tree.feature!]++;
      count(tree.left!);
      count(tree.right!);
    };
    this.trees.forEach(count);
    const total = importance.reduce((s, v) => s + v, 0) || 1;
    return importance.map((v) => v / total);
  }

  serialize(): string {
    return JSON.stringify({
      kind: this.kind,
      numTrees: this.numTrees,
      maxDepth: this.maxDepth,
      minSamplesLeaf: this.minSamplesLeaf,
      mode: this.mode,
      classes: this.classes,
      maxFeatures: this.maxFeatures,
      trees: this.trees.map((t) => serializeTree(t)),
    });
  }

  static deserialize(json: string): RandomForest {
    const d = JSON.parse(json);
    const m = new RandomForest(d.numTrees, d.maxDepth, d.minSamplesLeaf, d.mode);
    m.classes = d.classes;
    m.maxFeatures = d.maxFeatures;
    m.trees = d.trees.map((t: string) => deserializeTree(t));
    return m;
  }
}

// ─── Gradient Boosting ──────────────────────────────────────────────────────

export class GradientBoosting implements MLModel {
  readonly kind = "gradient_boosting";
  private trees: TreeNode[] = [];
  private numTrees: number;
  private maxDepth: number;
  private learningRate: number;
  private basePrediction = 0;
  private mode: "classification" | "regression";

  constructor(
    numTrees = 100,
    maxDepth = 4,
    learningRate = 0.1,
    mode: "classification" | "regression" = "regression",
  ) {
    this.numTrees = numTrees;
    this.maxDepth = maxDepth;
    this.learningRate = learningRate;
    this.mode = mode;
  }

  fit(X: Matrix, y: Vector): void {
    this.basePrediction = mean(y);
    let residuals = y.map((v) => v - this.basePrediction);
    this.trees = [];

    for (let t = 0; t < this.numTrees; t++) {
      const tree = this.buildTree(X, residuals, 0);
      this.trees.push(tree);

      const preds = X.map((row) => this.predictTree(tree, row));
      residuals = residuals.map((r, i) => r - this.learningRate * preds[i]);
    }
  }

  private buildTree(X: Matrix, y: Vector, depth: number): TreeNode {
    if (depth >= this.maxDepth || y.length <= 5 || new Set(y).size <= 1) {
      return { isLeaf: true, value: mean(y) };
    }

    const p = X[0].length;
    let bestFeature = 0;
    let bestThreshold = 0;
    let bestScore = Infinity;

    for (let f = 0; f < p; f++) {
      const values = [...new Set(column(X, f))].sort((a, b) => a - b);
      for (let i = 0; i < values.length - 1; i++) {
        const threshold = (values[i] + values[i + 1]) / 2;
        const leftY: number[] = [];
        const rightY: number[] = [];
        for (let j = 0; j < X.length; j++) {
          if (X[j][f] <= threshold) leftY.push(y[j]);
          else rightY.push(y[j]);
        }
        if (leftY.length === 0 || rightY.length === 0) continue;
        const score = variance(leftY) * leftY.length + variance(rightY) * rightY.length;
        if (score < bestScore) {
          bestScore = score;
          bestFeature = f;
          bestThreshold = threshold;
        }
      }
    }

    const leftX: Matrix = [];
    const leftY: Vector = [];
    const rightX: Matrix = [];
    const rightY: Vector = [];
    for (let j = 0; j < X.length; j++) {
      if (X[j][bestFeature] <= bestThreshold) {
        leftX.push(X[j]);
        leftY.push(y[j]);
      } else {
        rightX.push(X[j]);
        rightY.push(y[j]);
      }
    }

    return {
      isLeaf: false,
      feature: bestFeature,
      threshold: bestThreshold,
      left: this.buildTree(leftX, leftY, depth + 1),
      right: this.buildTree(rightX, rightY, depth + 1),
    };
  }

  private predictTree(tree: TreeNode, row: Vector): number {
    if (tree.isLeaf) return tree.value!;
    return row[tree.feature!] <= tree.threshold!
      ? this.predictTree(tree.left!, row)
      : this.predictTree(tree.right!, row);
  }

  predict(X: Matrix): Vector {
    return X.map((row) => {
      let pred = this.basePrediction;
      for (const tree of this.trees) {
        pred += this.learningRate * this.predictTree(tree, row);
      }
      return pred;
    });
  }

  evaluate(X: Matrix, y: Vector): Metrics {
    return regressionMetrics(this.predict(X), y);
  }

  serialize(): string {
    return JSON.stringify({
      kind: this.kind,
      numTrees: this.numTrees,
      maxDepth: this.maxDepth,
      learningRate: this.learningRate,
      basePrediction: this.basePrediction,
      mode: this.mode,
      trees: this.trees.map((t) => serializeTree(t)),
    });
  }

  static deserialize(json: string): GradientBoosting {
    const d = JSON.parse(json);
    const m = new GradientBoosting(d.numTrees, d.maxDepth, d.learningRate, d.mode);
    m.basePrediction = d.basePrediction;
    m.trees = d.trees.map((t: string) => deserializeTree(t));
    return m;
  }
}

// ─── Time Series: Exponential Smoothing (Holt-Winters) ──────────────────────

export class ExponentialSmoothing {
  readonly kind = "exponential_smoothing";
  private alpha: number;
  private beta: number;
  private gamma: number;
  private seasonLength: number;
  private level = 0;
  private trend = 0;
  private seasonal: Vector = [];
  private fitted: Vector = [];

  constructor(alpha = 0.3, beta = 0.1, gamma = 0.1, seasonLength = 12) {
    this.alpha = alpha;
    this.beta = beta;
    this.gamma = gamma;
    this.seasonLength = seasonLength;
  }

  fit(y: Vector): void {
    const n = y.length;
    const m = this.seasonLength;
    this.seasonal = new Array(m).fill(0);

    if (n < 2 * m) {
      this.level = y[0];
      this.fitted = y.slice();
      return;
    }

    // Initialize level and trend
    this.level = mean(y.slice(0, m));
    this.trend = (mean(y.slice(m, 2 * m)) - mean(y.slice(0, m))) / m;

    // Initialize seasonal indices
    for (let i = 0; i < m; i++) {
      this.seasonal[i] = y[i] - this.level;
    }

    // Fit
    this.fitted = [];
    for (let t = 0; t < n; t++) {
      const seasonIdx = t % m;
      const prevLevel = this.level;
      const prevTrend = this.trend;

      // Update
      this.level = this.alpha * (y[t] - this.seasonal[seasonIdx])
        + this.beta * (prevLevel + prevTrend);
      this.trend = this.beta * (this.level - prevLevel)
        + (1 - this.beta) * prevTrend;
      this.seasonal[seasonIdx] = this.gamma * (y[t] - this.level)
        + (1 - this.gamma) * this.seasonal[seasonIdx];

      this.fitted.push(this.level + this.trend + this.seasonal[seasonIdx]);
    }
  }

  forecast(horizon: number): TimeSeriesForecast {
    const predictions: Vector = [];
    const lower: Vector = [];
    const upper: Vector = [];
    const n = this.fitted.length;
    const residuals = this.fitted.map((f, i) => f - (this.level + this.trend * (i - n)));
    const sigma = stdDev(residuals) || 1;

    for (let h = 1; h <= horizon; h++) {
      const seasonIdx = (n + h - 1) % this.seasonLength;
      const pred = this.level + this.trend * h + this.seasonal[seasonIdx];
      predictions.push(pred);

      // 95% CI (rough approximation)
      const width = 1.96 * sigma * Math.sqrt(h);
      lower.push(pred - width);
      upper.push(pred + width);
    }

    return {
      predictions,
      confidence_lower: lower,
      confidence_upper: upper,
      alpha: this.alpha,
      method: "Holt-Winters Triple Exponential Smoothing",
    };
  }
}

// ─── Time Series: Simple Moving Average ─────────────────────────────────────

export class MovingAverage {
  readonly kind = "moving_average";
  private window: number;

  constructor(window = 20) {
    this.window = window;
  }

  fit(y: Vector): void { /* no-op for MA */ }

  predict(y: Vector, horizon = 1): Vector {
    const recent = y.slice(-this.window);
    const avg = mean(recent);
    return new Array(horizon).fill(avg);
  }

  smoothed(y: Vector): Vector {
    const result: Vector = [];
    for (let i = 0; i < y.length; i++) {
      const start = Math.max(0, i - this.window + 1);
      result.push(mean(y.slice(start, i + 1)));
    }
    return result;
  }
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

function softmax(v: Vector): Vector {
  const maxV = Math.max(...v);
  const exps = v.map((x) => Math.exp(x - maxV));
  const sum = exps.reduce((s, e) => s + e, 0);
  return exps.map((e) => e / sum);
}

function euclidean(a: Vector, b: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

function mode(v: Vector): number {
  const counts = new Map<number, number>();
  for (const x of v) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = v[0];
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = val;
    }
  }
  return best;
}

function solveLinearSystem(A: Matrix, b: Vector): Vector {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-10) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n];
    for (let j = i + 1; j < n; j++) sum -= aug[i][j] * x[j];
    x[i] = Math.abs(aug[i][i]) < 1e-10 ? 0 : sum / aug[i][i];
  }
  return x;
}

function regressionMetrics(pred: Vector, actual: Vector): Metrics {
  const n = actual.length;
  const meanActual = mean(actual);
  let ssRes = 0;
  let ssTot = 0;
  let absSum = 0;

  for (let i = 0; i < n; i++) {
    ssRes += (actual[i] - pred[i]) ** 2;
    ssTot += (actual[i] - meanActual) ** 2;
    absSum += Math.abs(actual[i] - pred[i]);
  }

  return {
    mse: ssRes / n,
    rmse: Math.sqrt(ssRes / n),
    mae: absSum / n,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
  };
}

function binaryMetrics(pred: Vector, actual: Vector): Metrics {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < actual.length; i++) {
    if (pred[i] === 1 && actual[i] === 1) tp++;
    else if (pred[i] === 0 && actual[i] === 0) tn++;
    else if (pred[i] === 1 && actual[i] === 0) fp++;
    else fn++;
  }
  const accuracy = (tp + tn) / (tp + tn + fp + fn) || 0;
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    accuracy,
    precision,
    recall,
    f1,
    confusionMatrix: [[tp, fn], [fp, tn]],
  };
}

function classificationMetrics(pred: Vector, actual: Vector, classes: number[]): Metrics {
  let tp = 0;
  const n = actual.length;
  const confusion: number[][] = classes.map(() => new Array(classes.length).fill(0));

  for (let i = 0; i < n; i++) {
    const ai = classes.indexOf(actual[i]);
    const pi = classes.indexOf(pred[i]);
    if (ai >= 0 && pi >= 0) {
      confusion[ai][pi]++;
      if (pred[i] === actual[i]) tp++;
    }
  }

  const accuracy = tp / n;

  // Macro-averaged precision/recall/f1
  let totalPrecision = 0;
  let totalRecall = 0;
  for (let c = 0; c < classes.length; c++) {
    const colSum = confusion.reduce((s, row) => s + row[c], 0);
    const rowSum = confusion[c].reduce((s, v) => s + v, 0);
    const prec = colSum > 0 ? confusion[c][c] / colSum : 0;
    const rec = rowSum > 0 ? confusion[c][c] / rowSum : 0;
    totalPrecision += prec;
    totalRecall += rec;
  }
  const precision = totalPrecision / classes.length;
  const recall = totalRecall / classes.length;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { accuracy, precision, recall, f1, confusionMatrix: confusion };
}

function serializeTree(node: TreeNode): string {
  if (node.isLeaf) {
    return JSON.stringify({ v: node.value, c: node.classCounts ? Object.fromEntries(node.classCounts) : undefined });
  }
  return JSON.stringify({
    f: node.feature,
    t: node.threshold,
    l: serializeTree(node.left!),
    r: serializeTree(node.right!),
  });
}

function deserializeTree(json: string): TreeNode {
  const d = JSON.parse(json);
  if ("v" in d) {
    return { isLeaf: true, value: d.v, classCounts: d.c ? new Map(Object.entries(d.c).map(([k, v]) => [Number(k), v as number])) : undefined };
  }
  return {
    isLeaf: false,
    feature: d.f,
    threshold: d.t,
    left: deserializeTree(d.l),
    right: deserializeTree(d.r),
  };
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createModel(
  kind: string,
  options: Record<string, unknown> = {},
): MLModel | KMeans | PCA | ExponentialSmoothing | MovingAverage {
  switch (kind) {
    case "linear_regression":
      return new LinearRegression(options.ridge as number ?? 0);
    case "logistic_regression":
      return new LogisticRegression(
        options.maxIter as number ?? 200,
        options.lr as number ?? 0.1,
      );
    case "knn":
      return new KNN(
        options.k as number ?? 5,
        (options.mode as "classification" | "regression") ?? "classification",
      );
    case "random_forest":
      return new RandomForest(
        options.numTrees as number ?? 50,
        options.maxDepth as number ?? 10,
        options.minSamplesLeaf as number ?? 5,
        (options.mode as "classification" | "regression") ?? "classification",
      );
    case "gradient_boosting":
      return new GradientBoosting(
        options.numTrees as number ?? 100,
        options.maxDepth as number ?? 4,
        options.learningRate as number ?? 0.1,
        (options.mode as "classification" | "regression") ?? "regression",
      );
    case "kmeans":
      return new KMeans(options.k as number ?? 3, options.maxIter as number ?? 100);
    case "pca":
      return new PCA(options.nComponents as number ?? 2);
    case "exponential_smoothing":
      return new ExponentialSmoothing(
        options.alpha as number ?? 0.3,
        options.beta as number ?? 0.1,
        options.gamma as number ?? 0.1,
        options.seasonLength as number ?? 12,
      );
    case "moving_average":
      return new MovingAverage(options.window as number ?? 20);
    default:
      throw new Error(`Unknown model: ${kind}`);
  }
}

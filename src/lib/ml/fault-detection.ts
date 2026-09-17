/**
 * Fault Detection Module
 * ──────────────────────
 * Pure-TypeScript anomaly / fault-detection algorithms.
 *
 * Algorithms included:
 *   1. Z-Score anomaly detector
 *   2. Modified Z-Score (MAD-based, robust to outliers)
 *   3. Mahalanobis distance
 *   4. Isolation Forest
 *   5. Statistical Process Control (SPC) — X̄ chart, R chart
 *   6. EWMA (Exponentially Weighted Moving Average) control chart
 *   7. CUSUM (Cumulative Sum) control chart
 *   8. Sliding-window change-point detection
 *   9. Multivariate threshold detector
 *  10. Rule-based fault classifier (if-THEN diagnostic rules)
 *
 * Zero dependencies.  Runs in browser or Node.
 */

import type { Vector, Matrix } from "./engine";
import {
  mean,
  stdDev,
  variance,
  dot,
  addVec,
  scaleVec,
  subVec,
} from "./engine";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AnomalyResult {
  index: number;
  score: number;
  isAnomaly: boolean;
  method: string;
}

export interface ControlChartResult {
  centerLine: number;
  upperControlLimit: number;
  lowerControlLimit: number;
  signals: Array<{ index: number; value: number; type: "above_ucl" | "below_lcl" | "trend" | "none" }>;
}

export interface IsolationTree {
  feature?: number;
  threshold?: number;
  left?: IsolationTree;
  right?: IsolationTree;
  size: number;
  depth: number;
}

export interface FaultEvent {
  timestamp: number;
  faultType: string;
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  details: Record<string, unknown>;
}

export interface DiagnosticRule {
  name: string;
  condition: (event: FaultEvent, history: FaultEvent[]) => boolean;
  diagnosis: string;
  severity: "low" | "medium" | "high" | "critical";
  recommendation: string;
}

// ─── 1. Z-Score Anomaly Detector ────────────────────────────────────────────

export function zScoreDetector(
  data: Vector,
  threshold = 3.0,
): AnomalyResult[] {
  const mu = mean(data);
  const sigma = stdDev(data);
  if (sigma === 0) return data.map((_, i) => ({ index: i, score: 0, isAnomaly: false, method: "z-score" }));

  return data.map((x, i) => {
    const score = Math.abs((x - mu) / sigma);
    return { index: i, score, isAnomaly: score > threshold, method: "z-score" };
  });
}

// ─── 2. Modified Z-Score (MAD-based, robust) ───────────────────────────────

export function madDetector(data: Vector, threshold = 3.5): AnomalyResult[] {
  const mu = mean(data);
  const deviations = data.map((x) => Math.abs(x - mu));
  const mad = mean(deviations.sort((a, b) => a - b));
  // Consistent scale factor: MAD ≈ 0.6745 * σ for normal data
  const sigma = mad / 0.6745;
  if (sigma === 0) return data.map((_, i) => ({ index: i, score: 0, isAnomaly: false, method: "mad" }));

  return data.map((x, i) => {
    const score = Math.abs((x - mu) / sigma);
    return { index: i, score, isAnomaly: score > threshold, method: "mad" };
  });
}

// ─── 3. Mahalanobis Distance ────────────────────────────────────────────────

function covarianceMatrix(X: Matrix): Matrix {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const means: Vector = Array.from({ length: p }, (_, j) => mean(column(X, j)));
  const centered = X.map((row) => row.map((v, j) => v - means[j]));
  const cov: Matrix = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += centered[k][i] * centered[k][j];
      cov[i][j] = s / (n - 1);
    }
  }
  return cov;
}

function column(X: Matrix, j: number): Vector {
  return X.map((row) => row[j]);
}

function invertMatrix(M: Matrix): Matrix {
  const n = M.length;
  const aug = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) throw new Error("Singular covariance matrix");
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

export function mahalanobisDistance(
  X: Matrix,
  threshold = 3.0,
): AnomalyResult[] {
  const p = X[0]?.length ?? 0;
  const cov = covarianceMatrix(X);
  const covInv = invertMatrix(cov);
  const means: Vector = Array.from({ length: p }, (_, j) => mean(column(X, j)));

  return X.map((row, i) => {
    const centered = row.map((v, j) => v - means[j]);
    const dist = Math.sqrt(dot(centered, matvec(covInv, centered)));
    return { index: i, score: dist, isAnomaly: dist > threshold, method: "mahalanobis" };
  });
}

function matvec(A: Matrix, b: Vector): Vector {
  return A.map((row) => dot(row, b));
}

// ─── 4. Isolation Forest ────────────────────────────────────────────────────

function buildIsolationTree(
  X: Matrix,
  maxDepth: number,
  currentDepth: number,
): IsolationTree {
  const n = X.length;
  if (n <= 1 || currentDepth >= maxDepth) return { size: n, depth: currentDepth };

  const p = X[0]?.length ?? 0;
  const feature = Math.floor(Math.random() * p);
  const values = X.map((row) => row[feature]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) return { size: n, depth: currentDepth };

  const threshold = lo + Math.random() * (hi - lo);
  const left = X.filter((row) => row[feature] < threshold);
  const right = X.filter((row) => row[feature] >= threshold);

  return {
    feature,
    threshold,
    left: buildIsolationTree(left, maxDepth, currentDepth + 1),
    right: buildIsolationTree(right, maxDepth, currentDepth + 1),
    size: n,
    depth: currentDepth,
  };
}

function pathLength(tree: IsolationTree, point: Vector, depth = 0): number {
  if (!tree.feature || tree.threshold === undefined) {
    // Add average path length of unsuccessful search in BST (c(n))
    const n = tree.size;
    const c = n > 1 ? 2.0 * (Math.log(n - 1) + 0.5772156649) - (2.0 * (n - 1)) / n : 0;
    return depth + c;
  }
  if (point[tree.feature] < tree.threshold) {
    return tree.left ? pathLength(tree.left, point, depth + 1) : depth + 1;
  }
  return tree.right ? pathLength(tree.right, point, depth + 1) : depth + 1;
}

// c(n) for normalization
function c(n: number): number {
  if (n <= 1) return 0;
  return 2.0 * (Math.log(n - 1) + 0.5772156649) - (2.0 * (n - 1)) / n;
}

export function isolationForest(
  X: Matrix,
  numTrees = 100,
  sampleSize = 256,
  contaminationRate = 0.1,
): AnomalyResult[] {
  const n = X.length;
  const maxDepth = Math.ceil(Math.log2(sampleSize));
  const trees: IsolationTree[] = [];

  for (let t = 0; t < numTrees; t++) {
    // Bootstrap sample
    const sample: Matrix = [];
    for (let i = 0; i < sampleSize; i++) {
      sample.push(X[Math.floor(Math.random() * n)]);
    }
    trees.push(buildIsolationTree(sample, maxDepth, 0));
  }

  const scores = X.map((point, i) => {
    const avgPath = trees.reduce((sum, tree) => sum + pathLength(tree, point), 0) / numTrees;
    // Anomaly score: higher = more anomalous
    const score = Math.pow(2, -avgPath / c(sampleSize));
    return { index: i, score };
  });

  // Sort by score descending, top `contaminationRate` are anomalies
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const cutoff = Math.ceil(n * contaminationRate);
  const anomalyIndices = new Set(sorted.slice(0, cutoff).map((s) => s.index));

  return scores.map((s) => ({
    index: s.index,
    score: s.score,
    isAnomaly: anomalyIndices.has(s.index),
    method: "isolation_forest",
  }));
}

// ─── 5. Statistical Process Control (SPC) — X̄ Chart ────────────────────────

export function spcXBarChart(
  subgroupMeans: Vector,
  subgroupRanges: Vector,
  confidence = 3.0,
): ControlChartResult {
  const xBarBar = mean(subgroupMeans);
  const rBar = mean(subgroupRanges);
  // A2 factor for subgroup size (approximated for n=5 → A2=0.577)
  const A2 = 0.577;
  const D3 = 0;
  const D4 = 2.114;

  const ucl = xBarBar + A2 * rBar;
  const lcl = xBarBar - A2 * rBar;
  const uclR = D4 * rBar;
  const lclR = D3 * rBar;

  const signals = subgroupMeans.map((x, i) => {
    if (x > ucl) return { index: i, value: x, type: "above_ucl" as const };
    if (x < lcl) return { index: i, value: x, type: "below_lcl" as const };
    // 7-point trend detection
    if (i >= 6) {
      const last7 = subgroupMeans.slice(i - 6, i + 1);
      const diffs = last7.slice(1).map((v, j) => v - last7[j]);
      if (diffs.every((d) => d > 0) || diffs.every((d) => d < 0)) {
        return { index: i, value: x, type: "trend" as const };
      }
    }
    return { index: i, value: x, type: "none" as const };
  });

  return {
    centerLine: xBarBar,
    upperControlLimit: ucl,
    lowerControlLimit: lcl,
    signals,
  };
}

// ─── 6. EWMA Control Chart ──────────────────────────────────────────────────

export function ewmaChart(
  data: Vector,
  lambda = 0.2,
  L = 3.0,
): ControlChartResult & { ewmaValues: Vector } {
  const mu = mean(data);
  const sigma = stdDev(data);
  const ewmaValues: Vector = [data[0] * lambda + mu * (1 - lambda)];

  for (let i = 1; i < data.length; i++) {
    ewmaValues.push(data[i] * lambda + ewmaValues[i - 1] * (1 - lambda));
  }

  const ewmaStd = sigma * Math.sqrt((lambda / (2 - lambda)));

  const signals = ewmaValues.map((v, i) => {
    const ucl = mu + L * ewmaStd * Math.sqrt(1 - Math.pow(1 - lambda, 2 * (i + 1)));
    const lcl = mu - L * ewmaStd * Math.sqrt(1 - Math.pow(1 - lambda, 2 * (i + 1)));
    if (v > ucl) return { index: i, value: v, type: "above_ucl" as const };
    if (v < lcl) return { index: i, value: v, type: "below_lcl" as const };
    return { index: i, value: v, type: "none" as const };
  });

  return {
    centerLine: mu,
    upperControlLimit: mu + L * ewmaStd * Math.sqrt(1 - Math.pow(1 - lambda, 2 * data.length)),
    lowerControlLimit: mu - L * ewmaStd * Math.sqrt(1 - Math.pow(1 - lambda, 2 * data.length)),
    signals,
    ewmaValues,
  };
}

// ─── 7. CUSUM (Cumulative Sum) Control Chart ────────────────────────────────

export function cusumChart(
  data: Vector,
  target: number,
  slack = 0.5,
  threshold = 5.0,
): ControlChartResult & { positiveCUSUM: Vector; negativeCUSUM: Vector } {
  const positiveCUSUM: Vector = [0];
  const negativeCUSUM: Vector = [0];

  const signals = data.map((x, i) => {
    if (i === 0) return { index: 0, value: x, type: "none" as const };

    const z = (x - target) / (stdDev(data) || 1);
    positiveCUSUM.push(Math.max(0, positiveCUSUM[i - 1] + z - slack));
    negativeCUSUM.push(Math.max(0, negativeCUSUM[i - 1] - z - slack));

    if (positiveCUSUM[i] > threshold) return { index: i, value: x, type: "above_ucl" as const };
    if (negativeCUSUM[i] > threshold) return { index: i, value: x, type: "below_lcl" as const };
    return { index: i, value: x, type: "none" as const };
  });

  return {
    centerLine: target,
    upperControlLimit: target + threshold * (stdDev(data) || 1),
    lowerControlLimit: target - threshold * (stdDev(data) || 1),
    signals,
    positiveCUSUM,
    negativeCUSUM,
  };
}

// ─── 8. Sliding-Window Change-Point Detection ──────────────────────────────

export function changePointDetector(
  data: Vector,
  windowSize = 20,
  significanceThreshold = 2.5,
): AnomalyResult[] {
  const results: AnomalyResult[] = [];

  for (let i = windowSize; i < data.length; i++) {
    const before = data.slice(i - windowSize, i);
    const after = data.slice(i, i + windowSize);

    if (after.length < 2) {
      results.push({ index: i, score: 0, isAnomaly: false, method: "change_point" });
      continue;
    }

    const muBefore = mean(before);
    const muAfter = mean(after);
    const pooledStd = Math.sqrt(
      ((before.length - 1) * variance(before) + (after.length - 1) * variance(after)) /
        (before.length + after.length - 2),
    );

    if (pooledStd === 0) {
      results.push({ index: i, score: 0, isAnomaly: false, method: "change_point" });
      continue;
    }

    const t = (muAfter - muBefore) / (pooledStd * Math.sqrt(1 / before.length + 1 / after.length));
    const score = Math.abs(t);
    results.push({ index: i, score, isAnomaly: score > significanceThreshold, method: "change_point" });
  }

  return results;
}

// ─── 9. Multivariate Threshold Detector ────────────────────────────────────

export function multivariateThresholdDetector(
  X: Matrix,
  thresholds: Vector,
  columnNames: string[] = [],
): Array<{ index: number; violations: string[]; isAnomaly: boolean }> {
  return X.map((row, i) => {
    const violations: string[] = [];
    row.forEach((val, j) => {
      if (thresholds[j] !== undefined && Math.abs(val) > thresholds[j]) {
        violations.push(columnNames[j] ?? `col_${j}`);
      }
    });
    return { index: i, violations, isAnomaly: violations.length > 0 };
  });
}

// ─── 10. Rule-Based Fault Classifier ───────────────────────────────────────

export function classifyFaults(
  events: FaultEvent[],
  rules: DiagnosticRule[],
): Array<FaultEvent & { diagnosis: string; recommendation: string; matchedRule: string }> {
  return events.map((event) => {
    for (const rule of rules) {
      if (rule.condition(event, events)) {
        return {
          ...event,
          severity: rule.severity,
          diagnosis: rule.diagnosis,
          recommendation: rule.recommendation,
          matchedRule: rule.name,
        };
      }
    }
    return { ...event, diagnosis: "No matching rule", recommendation: "Manual review required", matchedRule: "none" };
  });
}

// ─── Default Diagnostic Rules ──────────────────────────────────────────────

export const DEFAULT_FAULT_RULES: DiagnosticRule[] = [
  {
    name: "high_temperature",
    condition: (e) => e.faultType === "temperature" && (e.details.value as number) > 85,
    diagnosis: "Component overheating detected",
    severity: "high",
    recommendation: "Reduce load, check cooling system, inspect thermal paste",
  },
  {
    name: "vibration_spike",
    condition: (e) => e.faultType === "vibration" && (e.details.value as number) > 10,
    diagnosis: "Mechanical vibration exceeding threshold",
    severity: "critical",
    recommendation: "Immediate shutdown recommended. Inspect bearings and shaft alignment",
  },
  {
    name: "repeated_complaints",
    condition: (e, history) => {
      const recent = history.filter(
        (h) => h.source === e.source && h.timestamp > Date.now() - 86400000,
      );
      return recent.length > 5;
    },
    diagnosis: "Recurring fault from same source",
    severity: "high",
    recommendation: "Root cause analysis needed. Schedule preventive maintenance",
  },
  {
    name: "network_latency",
    condition: (e) => e.faultType === "network" && (e.details.latencyMs as number) > 500,
    diagnosis: "Network latency exceeding SLA",
    severity: "medium",
    recommendation: "Check bandwidth utilization, inspect routing tables, consider failover",
  },
  {
    name: "disk_space_critical",
    condition: (e) => e.faultType === "storage" && (e.details.usagePercent as number) > 95,
    diagnosis: "Disk space critically low",
    severity: "critical",
    recommendation: "Free disk space immediately. Archive old logs and data",
  },
];

// ─── Summary Helper ────────────────────────────────────────────────────────

export interface FaultDetectionSummary {
  totalDataPoints: number;
  anomaliesDetected: number;
  anomalyRate: number;
  methods: string[];
  worstSegments: Array<{ start: number; end: number; avgScore: number }>;
}

export function summarizeFaults(results: AnomalyResult[]): FaultDetectionSummary {
  const anomalies = results.filter((r) => r.isAnomaly);
  const methods = [...new Set(results.map((r) => r.method))];

  // Find worst consecutive segments of length 5
  const windowSize = 5;
  const segments: Array<{ start: number; end: number; avgScore: number }> = [];
  for (let i = 0; i <= results.length - windowSize; i++) {
    const window = results.slice(i, i + windowSize);
    const avgScore = mean(window.map((r) => r.score));
    segments.push({ start: i, end: i + windowSize - 1, avgScore });
  }
  segments.sort((a, b) => b.avgScore - a.avgScore);

  return {
    totalDataPoints: results.length,
    anomaliesDetected: anomalies.length,
    anomalyRate: anomalies.length / results.length,
    methods,
    worstSegments: segments.slice(0, 3),
  };
}

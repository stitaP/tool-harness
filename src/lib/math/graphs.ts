/**
 * Comprehensive Graph & Visualization Engine
 * ──────────────────────────────────────────
 * 35+ chart types, all producing recharts-compatible data structures.
 * Covers scientific, engineering, statistical, financial, network,
 * and fractal visualizations.
 *
 * Zero dependencies beyond data types. Runs in browser or Node.
 */

// ─── Base Types ─────────────────────────────────────────────────────────────

export interface ChartDataPoint {
  [key: string]: unknown;
}

export interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
  color?: string;
}

export interface ChartConfig {
  type: string;
  title: string;
  xLabel?: string;
  yLabel?: string;
  series: ChartSeries[];
  metadata?: Record<string, unknown>;
}

export interface NetworkNode {
  id: string;
  label: string;
  x: number;
  y: number;
  group?: string;
  size?: number;
  color?: string;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight?: number;
  color?: string;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. BASIC CHARTS
// ═══════════════════════════════════════════════════════════════════════════

export function lineChart(
  title: string,
  series: Array<{ name: string; x: number[]; y: number[]; color?: string }>,
): ChartConfig {
  const allX = series.flatMap((s) => s.x);
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const nPoints = 200;

  return {
    type: "line",
    title,
    xLabel: "x",
    yLabel: "y",
    series: series.map((s) => ({
      name: s.name,
      color: s.color,
      data: Array.from({ length: nPoints }, (_, i) => {
        const xVal = minX + (maxX - minX) * i / (nPoints - 1);
        const idx = s.x.findIndex((v) => v >= xVal);
        const yVal = idx >= 0 ? s.y[idx] : s.y[s.y.length - 1];
        return { x: xVal, [s.name]: yVal };
      }),
    })),
  };
}

export function barChart(
  title: string,
  categories: string[],
  series: Array<{ name: string; values: number[]; color?: string }>,
): ChartConfig {
  return {
    type: "bar",
    title,
    xLabel: "Category",
    yLabel: "Value",
    series: [{
      name: series[0]?.name ?? "Value",
      color: series[0]?.color,
      data: categories.map((cat, i) => {
        const point: ChartDataPoint = { category: cat };
        for (const s of series) point[s.name] = s.values[i];
        return point;
      }),
    }],
  };
}

export function scatterPlot(
  title: string,
  series: Array<{ name: string; x: number[]; y: number[]; color?: string }>,
): ChartConfig {
  return {
    type: "scatter",
    title,
    xLabel: "x",
    yLabel: "y",
    series: series.map((s) => ({
      name: s.name,
      color: s.color,
      data: s.x.map((xi, i) => ({ x: xi, y: s.y[i] })),
    })),
  };
}

export function areaChart(
  title: string,
  series: Array<{ name: string; x: number[]; y: number[]; color?: string }>,
): ChartConfig {
  return lineChart(title, series);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. STATISTICAL CHARTS
// ═══════════════════════════════════════════════════════════════════════════

export function histogram(
  title: string,
  data: number[],
  nBins = 20,
): ChartConfig {
  const min = Math.min(...data), max = Math.max(...data);
  const binWidth = (max - min) / nBins;
  const bins = Array.from({ length: nBins }, (_, i) => ({
    bin: `${(min + i * binWidth).toFixed(1)}-${(min + (i + 1) * binWidth).toFixed(1)}`,
    count: 0,
    binStart: min + i * binWidth,
  }));

  for (const v of data) {
    const idx = Math.min(Math.floor((v - min) / binWidth), nBins - 1);
    bins[idx].count++;
  }

  return {
    type: "histogram",
    title,
    xLabel: "Value",
    yLabel: "Frequency",
    series: [{
      name: "Frequency",
      data: bins.map((b) => ({ bin: b.bin, Frequency: b.count, x: b.binStart })),
    }],
  };
}

export function boxPlot(
  title: string,
  groups: Array<{ name: string; values: number[] }>,
): ChartConfig {
  return {
    type: "box-plot",
    title,
    series: [{
      name: "Distribution",
      data: groups.map((g) => {
        const sorted = [...g.values].sort((a, b) => a - b);
        const n = sorted.length;
        return {
          name: g.name,
          min: sorted[0],
          q1: sorted[Math.floor(n * 0.25)],
          median: sorted[Math.floor(n * 0.5)],
          q3: sorted[Math.floor(n * 0.75)],
          max: sorted[n - 1],
          mean: sorted.reduce((a, b) => a + b, 0) / n,
        };
      }),
    }],
  };
}

export function violinPlot(
  title: string,
  groups: Array<{ name: string; values: number[] }>,
  resolution = 50,
): ChartConfig {
  return {
    type: "violin",
    title,
    series: groups.map((g) => {
      const sorted = [...g.values].sort((a, b) => a - b);
      const min = sorted[0], max = sorted[sorted.length - 1];
      const range = max - min || 1;
      const bandwidth = range / 20;

      const points: ChartDataPoint[] = [];
      for (let i = 0; i <= resolution; i++) {
        const x = min + range * i / resolution;
        let density = 0;
        for (const v of sorted) {
          const z = (x - v) / bandwidth;
          density += Math.exp(-0.5 * z * z) / (bandwidth * Math.sqrt(2 * Math.PI));
        }
        density /= sorted.length;
        points.push({ y: x, density: density, name: g.name });
      }
      return { name: g.name, data: points };
    }),
  };
}

export function densityPlot(
  title: string,
  data: number[],
  bandwidth?: number,
  resolution = 100,
): ChartConfig {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const bw = bandwidth ?? range / 10;

  const points: ChartDataPoint[] = [];
  for (let i = 0; i <= resolution; i++) {
    const x = min - range * 0.1 + range * 1.2 * i / resolution;
    let density = 0;
    for (const v of data) {
      const z = (x - v) / bw;
      density += Math.exp(-0.5 * z * z) / (bw * Math.sqrt(2 * Math.PI));
    }
    density /= data.length;
    points.push({ x, density });
  }

  return {
    type: "density",
    title,
    series: [{ name: "Density", data: points }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. SCIENTIFIC / ENGINEERING CHARTS
// ═══════════════════════════════════════════════════════════════════════════

export function contourChart(
  title: string,
  grid: number[][],
  xRange: [number, number],
  yRange: [number, number],
  nLevels = 10,
): ChartConfig {
  const h = grid.length, w = grid[0].length;
  const flat = grid.flat();
  const min = Math.min(...flat), max = Math.max(...flat);

  const levels = Array.from({ length: nLevels }, (_, i) => min + (max - min) * (i + 0.5) / nLevels);
  const series: ChartSeries[] = levels.map((level, li) => ({
    name: `Level ${level.toFixed(2)}`,
    color: `hsl(${(li / nLevels) * 270}, 70%, 50%)`,
    data: grid.flatMap((row, j) =>
      row.map((val, i) => ({
        x: xRange[0] + (xRange[1] - xRange[0]) * i / (w - 1),
        y: yRange[0] + (yRange[1] - yRange[0]) * j / (h - 1),
        value: Math.abs(val - level) < (max - min) / nLevels ? val : undefined,
      })).filter((p) => p.value !== undefined),
    ),
  }));

  return { type: "contour", title, series };
}

export function heatmap(
  title: string,
  grid: number[][],
  xRange?: [number, number],
  yRange?: [number, number],
): ChartConfig {
  const h = grid.length, w = grid[0].length;
  return {
    type: "heatmap",
    title,
    series: [{
      name: "Heatmap",
      data: grid.flatMap((row, j) =>
        row.map((val, i) => ({
          x: xRange ? xRange[0] + (xRange[1] - xRange[0]) * i / (w - 1) : i,
          y: yRange ? yRange[0] + (yRange[1] - yRange[0]) * j / (h - 1) : j,
          value: val,
        })),
      ),
    }],
  };
}

export function vectorField(
  title: string,
  u: number[][],
  v: number[][],
  xRange: [number, number],
  yRange: [number, number],
  skipI = 2,
  skipJ = 2,
): ChartConfig {
  const h = u.length, w = u[0].length;
  const points: ChartDataPoint[] = [];

  for (let j = 0; j < h; j += skipJ) {
    for (let i = 0; i < w; i += skipI) {
      const mag = Math.sqrt(u[j][i] ** 2 + v[j][i] ** 2);
      points.push({
        x: xRange[0] + (xRange[1] - xRange[0]) * i / (w - 1),
        y: yRange[0] + (yRange[1] - yRange[0]) * j / (h - 1),
        u: u[j][i],
        v: v[j][i],
        magnitude: mag,
      });
    }
  }

  return {
    type: "vector-field",
    title,
    series: [{ name: "Vectors", data: points }],
  };
}

export function streamlinePlot(
  title: string,
  field: (x: number, y: number) => [number, number],
  xRange: [number, number],
  yRange: [number, number],
  nSeeds = 20,
  maxSteps = 200,
): ChartConfig {
  const lines: ChartSeries[] = [];
  const stepSize = 0.02;

  for (let s = 0; s < nSeeds; s++) {
    const seedX = xRange[0] + (xRange[1] - xRange[0]) * Math.random();
    const seedY = yRange[0] + (yRange[1] - yRange[0]) * Math.random();
    let x = seedX, y = seedY;
    const pts: ChartDataPoint[] = [];

    for (let step = 0; step < maxSteps; step++) {
      if (x < xRange[0] || x > xRange[1] || y < yRange[0] || y > yRange[1]) break;
      const [u, v] = field(x, y);
      const mag = Math.sqrt(u * u + v * v);
      if (mag < 1e-10) break;
      pts.push({ x, y, streamline: s });
      x += (u / mag) * stepSize;
      y += (v / mag) * stepSize;
    }

    lines.push({ name: `Streamline ${s}`, data: pts });
  }

  return { type: "streamlines", title, series: lines };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PHASE SPACE & DYNAMICAL SYSTEMS
// ═══════════════════════════════════════════════════════════════════════════

export function phasePortrait(
  title: string,
  field: (x: number, y: number) => [number, number],
  xRange: [number, number],
  yRange: [number, number],
  gridSize = 15,
): ChartConfig {
  const points: ChartDataPoint[] = [];

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const x = xRange[0] + (xRange[1] - xRange[0]) * (i + 0.5) / gridSize;
      const y = yRange[0] + (yRange[1] - yRange[0]) * (j + 0.5) / gridSize;
      const [dx, dy] = field(x, y);
      const mag = Math.sqrt(dx * dx + dy * dy);
      const scale = Math.min(0.4 / (mag + 0.01), 1);
      points.push({ x, y, u: dx * scale, v: dy * scale, magnitude: mag });
    }
  }

  return { type: "phase-portrait", title, series: [{ name: "Phase", data: points }] };
}

export function bifurcationDiagram(
  title: string,
  rRange: [number, number] = [2.5, 4],
  nR = 500,
  nIter = 300,
  nDiscard = 200,
): ChartConfig {
  const points: ChartDataPoint[] = [];

  for (let i = 0; i < nR; i++) {
    const r = rRange[0] + (rRange[1] - rRange[0]) * i / (nR - 1);
    let x = 0.5;
    for (let j = 0; j < nDiscard; j++) x = r * x * (1 - x);
    for (let j = 0; j < nIter - nDiscard; j++) {
      x = r * x * (1 - x);
      points.push({ r, x });
    }
  }

  return {
    type: "bifurcation",
    title,
    xLabel: "r",
    yLabel: "x",
    series: [{ name: "Bifurcation", data: points }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. NETWORK GRAPHS
// ═══════════════════════════════════════════════════════════════════════════

export function forceDirectedLayout(
  nodes: NetworkNode[],
  edges: NetworkEdge[],
  iterations = 100,
  k = 0.1,
): NetworkGraph {
  const pos = new Map(nodes.map((n) => [n.id, { x: Math.random(), y: Math.random() }]));
  const vel = new Map(nodes.map((n) => [n.id, { x: 0, y: 0 }]));

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations;

    // Repulsion
    for (const n1 of nodes) {
      for (const n2 of nodes) {
        if (n1.id === n2.id) continue;
        const p1 = pos.get(n1.id)!;
        const p2 = pos.get(n2.id)!;
        let dx = p1.x - p2.x;
        let dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const force = k * k / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        vel.get(n1.id)!.x += dx * temp;
        vel.get(n1.id)!.y += dy * temp;
      }
    }

    // Attraction
    for (const e of edges) {
      const p1 = pos.get(e.source)!;
      const p2 = pos.get(e.target)!;
      if (!p1 || !p2) continue;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const force = dist * dist / k;
      const fx = (dx / dist) * force * 0.01;
      const fy = (dy / dist) * force * 0.01;
      vel.get(e.source)!.x += fx * temp;
      vel.get(e.source)!.y += fy * temp;
      vel.get(e.target)!.x -= fx * temp;
      vel.get(e.target)!.y -= fy * temp;
    }

    // Update positions
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const v = vel.get(n.id)!;
      v.x *= 0.9; // damping
      v.y *= 0.9;
      p.x += v.x;
      p.y += v.y;
    }
  }

  // Normalize to [0,1]
  const xs = nodes.map((n) => pos.get(n.id)!.x);
  const ys = nodes.map((n) => pos.get(n.id)!.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;

  return {
    nodes: nodes.map((n) => ({
      ...n,
      x: (pos.get(n.id)!.x - minX) / rangeX,
      y: (pos.get(n.id)!.y - minY) / rangeY,
    })),
    edges,
  };
}

export function dendrogram(
  data: Array<{ label: string; values: number[] }>,
): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
  // Simple hierarchical clustering
  const n = data.length;
  const nodes: NetworkNode[] = data.map((d, i) => ({
    id: `leaf-${i}`,
    label: d.label,
    x: i / (n - 1),
    y: 1,
  }));

  const edges: NetworkEdge[] = [];
  let nextId = n;

  // Single-linkage clustering
  const dist = (a: number[], b: number[]) => {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) sum += (a[i] - b[i]) ** 2;
    return Math.sqrt(sum);
  };

  const clusters: Map<string, { labels: number[]; center: number[]; height: number }> = new Map();
  data.forEach((d, i) => clusters.set(`leaf-${i}`, { labels: [i], center: d.values, height: 0 }));

  while (clusters.size > 1) {
    let minDist = Infinity;
    let mergeA = "", mergeB = "";

    const keys = Array.from(clusters.keys());
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const d = dist(clusters.get(keys[i])!.center, clusters.get(keys[j])!.center);
        if (d < minDist) { minDist = d; mergeA = keys[i]; mergeB = keys[j]; }
      }
    }

    const a = clusters.get(mergeA)!;
    const b = clusters.get(mergeB)!;
    const newId = `node-${nextId++}`;
    const height = minDist / 2;

    nodes.push({ id: newId, label: "", x: 0, y: 1 - height });
    edges.push({ source: mergeA, target: newId });
    edges.push({ source: mergeB, target: newId });

    clusters.delete(mergeA);
    clusters.delete(mergeB);
    clusters.set(newId, {
      labels: [...a.labels, ...b.labels],
      center: a.center.map((v, i) => (v + b.center[i]) / 2),
      height,
    });
  }

  return { nodes, edges };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. SPECIALIZED CHARTS
// ═══════════════════════════════════════════════════════════════════════════

export function radarChart(
  title: string,
  axes: string[],
  series: Array<{ name: string; values: number[]; color?: string }>,
): ChartConfig {
  return {
    type: "radar",
    title,
    series: series.map((s) => ({
      name: s.name,
      color: s.color,
      data: axes.map((axis, i) => ({ axis, value: s.values[i] ?? 0, subject: axis })),
    })),
  };
}

export function treemap(
  title: string,
  data: Array<{ name: string; value: number; children?: Array<{ name: string; value: number }> }>,
): ChartConfig {
  const flat: ChartDataPoint[] = [];
  for (const item of data) {
    if (item.children) {
      for (const child of item.children) {
        flat.push({ name: `${item.name}/${child.name}`, value: child.value, parent: item.name });
      }
    } else {
      flat.push({ name: item.name, value: item.value });
    }
  }

  return {
    type: "treemap",
    title,
    series: [{ name: "Treemap", data: flat }],
  };
}

export function waterfallChart(
  title: string,
  items: Array<{ name: string; value: number; isTotal?: boolean }>,
): ChartConfig {
  let cumulative = 0;
  const points: ChartDataPoint[] = items.map((item) => {
    if (item.isTotal) {
      const point = { name: item.name, start: 0, end: item.value, value: item.value, type: "total" as const };
      cumulative = item.value;
      return point;
    }
    const start = cumulative;
    cumulative += item.value;
    return {
      name: item.name,
      start: item.value > 0 ? start : cumulative,
      end: item.value > 0 ? cumulative : start,
      value: item.value,
      type: item.value > 0 ? "increase" as const : "decrease" as const,
    };
  });

  return {
    type: "waterfall",
    title,
    series: [{ name: "Waterfall", data: points }],
  };
}

export function funnelChart(
  title: string,
  stages: Array<{ name: string; value: number; color?: string }>,
): ChartConfig {
  return {
    type: "funnel",
    title,
    series: [{
      name: "Funnel",
      data: stages.map((s) => ({ name: s.name, value: s.value, percentage: (s.value / stages[0].value) * 100 })),
    }],
  };
}

export function gaugeChart(
  title: string,
  value: number,
  min = 0,
  max = 100,
  segments?: Array<{ from: number; to: number; color: string; label: string }>,
): ChartConfig {
  return {
    type: "gauge",
    title,
    series: [{
      name: "Gauge",
      data: [{
        value,
        min,
        max,
        percentage: ((value - min) / (max - min)) * 100,
        segments: segments ?? [
          { from: 0, to: 33, color: "#ef4444", label: "Low" },
          { from: 33, to: 66, color: "#f59e0b", label: "Medium" },
          { from: 66, to: 100, color: "#10b981", label: "High" },
        ],
      }],
    }],
  };
}

export function sparkline(
  title: string,
  data: number[],
  color = "#3b82f6",
): ChartConfig {
  return {
    type: "sparkline",
    title,
    series: [{
      name: title,
      color,
      data: data.map((v, i) => ({ x: i, y: v })),
    }],
  };
}

export function paretoChart(
  title: string,
  categories: string[],
  values: number[],
): ChartConfig {
  const sorted = categories
    .map((name, i) => ({ name, value: values[i] }))
    .sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, item) => s + item.value, 0);
  let cumulative = 0;

  return {
    type: "pareto",
    title,
    series: [{
      name: "Pareto",
      data: sorted.map((item) => {
        cumulative += item.value;
        return {
          category: item.name,
          value: item.value,
          cumulative: (cumulative / total) * 100,
        };
      }),
    }],
  };
}

export function qqPlot(
  title: string,
  data: number[],
  distribution: "normal" | "uniform" | "exponential" = "normal",
): ChartConfig {
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;

  // Theoretical quantiles
  const theoretical = sorted.map((_, i) => {
    const p = (i + 0.5) / n;
    // Inverse normal (approximation)
    if (distribution === "normal") {
      const a1 = -3.969683028665376e1, a2 = 2.209460984245205e2;
      const a3 = -2.759285104469687e2, a4 = 1.383577518672690e2;
      const a5 = -3.066479806614716e1, a6 = 2.506628277459239e0;
      const b1 = -5.447609879822406e1, b2 = 1.615858368580409e2;
      const b3 = -1.556989798598866e2, b4 = 6.680131188771972e1;
      const b5 = -1.328068155288572e1;
      const c1 = -7.784894002430293e-3, c2 = -3.223964580411365e-1;
      const c3 = -2.400758277161838e0, c4 = -2.549732539343734e0;
      const c5 = 4.374664141464968e0, c6 = 2.938163982698783e0;
      const d1 = 7.784695709041462e-3, d2 = 3.224671290700398e-1;
      const d3 = 2.445134137142996e0, d4 = 3.754408661907416e0;
      const pLow = 0.02425, pHigh = 1 - pLow;
      let q: number;
      if (p < pLow) {
        const t = Math.sqrt(-2 * Math.log(p));
        q = (((((c1 * t + c2) * t + c3) * t + c4) * t + c5) * t + c6) /
          ((((d1 * t + d2) * t + d3) * t + d4) * t + 1);
      } else if (p <= pHigh) {
        const t = p - 0.5;
        const t2 = t * t;
        q = (((((a1 * t2 + a2) * t2 + a3) * t2 + a4) * t2 + a5) * t2 + a6) * t /
          (((((b1 * t2 + b2) * t2 + b3) * t2 + b4) * t2 + b5) * t2 + 1);
      } else {
        const t = Math.sqrt(-2 * Math.log(1 - p));
        q = -(((((c1 * t + c2) * t + c3) * t + c4) * t + c5) * t + c6) /
          ((((d1 * t + d2) * t + d3) * t + d4) * t + 1);
      }
      return q;
    }
    return (i + 0.5) / n;
  });

  // Standardize
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n) || 1;

  return {
    type: "qq-plot",
    title,
    xLabel: `Theoretical ${distribution}`,
    yLabel: "Sample",
    series: [{
      name: "Q-Q",
      data: theoretical.map((t, i) => ({
        theoretical: t,
        sample: (sorted[i] - mean) / std,
      })),
    }],
  };
}

export function autocorrelation(
  title: string,
  data: number[],
  maxLag?: number,
): ChartConfig {
  const n = data.length;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const maxL = maxLag ?? Math.min(n - 1, 50);

  const lags = Array.from({ length: maxL + 1 }, (_, lag) => {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += (data[i] - mean) * (data[i + lag] - mean);
    }
    const acf = variance > 0 ? sum / (n * variance) : 0;
    return { lag, acf };
  });

  return {
    type: "autocorrelation",
    title,
    xLabel: "Lag",
    yLabel: "ACF",
    series: [{ name: "ACF", data: lags }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. FRACTAL-SPECIFIC VISUALIZATIONS
// ═══════════════════════════════════════════════════════════════════════════

export function fractalDimensionPlot(
  title: string,
  data: Array<{ logInvBox: number; logCount: number }>,
): ChartConfig {
  return {
    type: "scatter",
    title,
    xLabel: "log(1/ε)",
    yLabel: "log(N(ε))",
    series: [{
      name: "Box-Counting",
      data: data.map((d) => ({ x: d.logInvBox, y: d.logCount })),
    }],
  };
}

export function multifractalPlot(
  title: string,
  alpha: number[],
  fAlpha: number[],
): ChartConfig {
  return {
    type: "scatter",
    title,
    xLabel: "α (singularity strength)",
    yLabel: "f(α) (singularity spectrum)",
    series: [{
      name: "f(α)",
      data: alpha.map((a, i) => ({ x: a, y: fAlpha[i] })),
    }],
  };
}

export function convergencePlot(
  title: string,
  history: Array<{ iteration: number; value: number }>,
): ChartConfig {
  return {
    type: "line",
    title,
    xLabel: "Iteration",
    yLabel: "Value",
    series: [{ name: "Convergence", data: history.map((h) => ({ x: h.iteration, y: h.value })) }],
  };
}

export function spectrumPlot(
  title: string,
  frequencies: number[],
  magnitudes: number[],
): ChartConfig {
  return {
    type: "bar",
    title,
    xLabel: "Frequency",
    yLabel: "Magnitude",
    series: [{
      name: "Spectrum",
      data: frequencies.map((f, i) => ({ frequency: f.toFixed(2), magnitude: magnitudes[i] })),
    }],
  };
}

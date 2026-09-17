/**
 * Graph & Visualization Tools
 * ───────────────────────────
 * Agent-callable tools for 35+ chart types and data visualization.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";
import {
  lineChart, barChart, scatterPlot, areaChart,
  histogram, boxPlot, violinPlot, densityPlot,
  contourChart, heatmap, vectorField, streamlinePlot,
  phasePortrait, bifurcationDiagram,
  radarChart, treemap, waterfallChart, funnelChart,
  gaugeChart, sparkline, paretoChart, qqPlot, autocorrelation,
  fractalDimensionPlot, multifractalPlot, convergencePlot, spectrumPlot,
} from "../../math/graphs";

// ═══════════════════════════════════════════════════════════════════════════
// TOOL MANIFESTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── 1. Master Chart Generator ─────────────────────────────────────────────

export const CHART_GENERATE_MANIFEST: ToolManifest = {
  id: "chart.generate",
  name: "Chart Generator",
  description: "Generate recharts-compatible chart data for 35+ chart types: line, bar, scatter, area, histogram, box plot, violin, density, contour, heatmap, vector field, streamlines, phase portrait, bifurcation, radar, treemap, waterfall, funnel, gauge, sparkline, Pareto, Q-Q, autocorrelation, spectrum, fractal dimension, multifractal, convergence.",
  category: "math",
  version: "1.0.0",
  tags: ["chart", "visualization", "graph", "recharts", "dashboard", "analysis"],
  author: "stitaP", license: "MIT", icon: "BarChart3", color: "#3b82f6",
  parameters: [
    { name: "type", type: "enum", description: "Chart type", required: true, enum: [
      "line", "bar", "scatter", "area", "histogram", "box-plot", "violin", "density",
      "contour", "heatmap", "vector-field", "streamlines", "phase-portrait", "bifurcation",
      "radar", "treemap", "waterfall", "funnel", "gauge", "sparkline", "pareto",
      "qq-plot", "autocorrelation", "fractal-dimension", "multifractal", "convergence", "spectrum",
    ]},
    { name: "title", type: "string", description: "Chart title", required: false, default: "Chart" },
    { name: "xLabel", type: "string", description: "X-axis label", required: false },
    { name: "yLabel", type: "string", description: "Y-axis label", required: false },
    { name: "data", type: "object", description: "Chart-specific data (see docs)", required: true },
  ],
  capabilities: [{ name: "chart-generation", description: "Generate recharts-compatible chart data", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function chartGenerate(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const type = cfg.type as string;
  const title = (cfg.title as string) || "Chart";
  const data = (cfg.data as Record<string, unknown>) || {};

  try {
    let result;

    switch (type) {
      case "line":
        result = lineChart(title, (data.series as Array<{ name: string; x: number[]; y: number[] }>) || []);
        break;
      case "bar":
        result = barChart(title, (data.categories as string[]) || [], (data.series as Array<{ name: string; values: number[] }>) || []);
        break;
      case "scatter":
        result = scatterPlot(title, (data.series as Array<{ name: string; x: number[]; y: number[] }>) || []);
        break;
      case "area":
        result = areaChart(title, (data.series as Array<{ name: string; x: number[]; y: number[] }>) || []);
        break;
      case "histogram":
        result = histogram(title, (data.values as number[]) || [], (data.nBins as number) || 20);
        break;
      case "box-plot":
        result = boxPlot(title, (data.groups as Array<{ name: string; values: number[] }>) || []);
        break;
      case "violin":
        result = violinPlot(title, (data.groups as Array<{ name: string; values: number[] }>) || []);
        break;
      case "density":
        result = densityPlot(title, (data.values as number[]) || []);
        break;
      case "contour":
        result = contourChart(title, (data.grid as number[][]) || [[0]], (data.xRange as [number, number]) || [0, 1], (data.yRange as [number, number]) || [0, 1]);
        break;
      case "heatmap":
        result = heatmap(title, (data.grid as number[][]) || [[0]], data.xRange as [number, number], data.yRange as [number, number]);
        break;
      case "vector-field":
        result = vectorField(title, (data.u as number[][]) || [[0]], (data.v as number[][]) || [[0]], (data.xRange as [number, number]) || [0, 1], (data.yRange as [number, number]) || [0, 1]);
        break;
      case "radar":
        result = radarChart(title, (data.axes as string[]) || [], (data.series as Array<{ name: string; values: number[] }>) || []);
        break;
      case "waterfall":
        result = waterfallChart(title, (data.items as Array<{ name: string; value: number }>) || []);
        break;
      case "funnel":
        result = funnelChart(title, (data.stages as Array<{ name: string; value: number }>) || []);
        break;
      case "gauge":
        result = gaugeChart(title, (data.value as number) || 50, (data.min as number) || 0, (data.max as number) || 100);
        break;
      case "sparkline":
        result = sparkline(title, (data.values as number[]) || []);
        break;
      case "pareto":
        result = paretoChart(title, (data.categories as string[]) || [], (data.values as number[]) || []);
        break;
      case "qq-plot":
        result = qqPlot(title, (data.values as number[]) || []);
        break;
      case "autocorrelation":
        result = autocorrelation(title, (data.values as number[]) || []);
        break;
      case "convergence":
        result = convergencePlot(title, (data.history as Array<{ iteration: number; value: number }>) || []);
        break;
      case "spectrum":
        result = spectrumPlot(title, (data.frequencies as number[]) || [], (data.magnitudes as number[]) || []);
        break;
      case "bifurcation":
        result = bifurcationDiagram(title);
        break;
      default:
        return { success: false, data: `Unknown chart type: ${type}` };
    }

    return {
      success: true,
      data: {
        chartType: result?.type ?? type,
        title: result?.title ?? title,
        seriesCount: result?.series?.length ?? 0,
        totalDataPoints: result?.series?.reduce((s: number, sr: { data: unknown[] }) => s + sr.data.length, 0) ?? 0,
        chart: result,
      },
    };
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── 2. Quick Stats Chart ──────────────────────────────────────────────────

export const QUICK_STATS_MANIFEST: ToolManifest = {
  id: "chart.stats",
  name: "Quick Statistics",
  description: "Compute and visualize descriptive statistics: mean, median, std, percentiles, skewness, kurtosis, IQR, with histogram and box plot.",
  category: "math",
  version: "1.0.0",
  tags: ["statistics", "histogram", "box-plot", "descriptive", "analysis"],
  author: "stitaP", license: "MIT", icon: "TrendingUp", color: "#8b5cf6",
  parameters: [
    { name: "values", type: "array", description: "Numeric data array", required: true },
    { name: "name", type: "string", description: "Dataset name", required: false, default: "Data" },
  ],
  capabilities: [{ name: "quick-stats", description: "Descriptive statistics with visualization", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function quickStats(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const values = (cfg.values as number[]) || [];
  const name = (cfg.name as string) || "Data";

  if (values.length === 0) return { success: false, data: "No values provided" };

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  const skewness = sorted.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n;
  const kurtosis = sorted.reduce((s, v) => s + ((v - mean) / std) ** 4, 0) / n - 3;

  const hist = histogram(`${name} Distribution`, values, 20);
  const bp = boxPlot(`${name} Box Plot`, [{ name, values }]);

  return {
    success: true,
    data: {
      name,
      count: n,
      mean, median, std, variance,
      min: sorted[0], max: sorted[n - 1],
      q1, q3, iqr,
      skewness, kurtosis,
      histogram: hist,
      boxPlot: bp,
    },
  };
}

// ─── 3. Fractal Visualization Pack ────────────────────────────────────────

export const FRACTAL_VIZ_MANIFEST: ToolManifest = {
  id: "chart.fractal-viz",
  name: "Fractal Visualization",
  description: "Generate recharts-compatible visualizations for fractal analysis: dimension plot, multifractal spectrum, convergence history, escape-time heatmaps.",
  category: "math",
  version: "1.0.0",
  tags: ["fractal", "visualization", "dimension", "spectrum", "heatmap"],
  author: "stitaP", license: "MIT", icon: "Flower2", color: "#a855f7",
  parameters: [
    { name: "type", type: "enum", description: "Visualization type", required: true, enum: ["dimension-plot", "multifractal", "convergence", "escape-heatmap"] },
    { name: "data", type: "object", description: "Visualization-specific data", required: true },
  ],
  capabilities: [{ name: "fractal-viz", description: "Visualize fractal analysis results", requiresBrowser: false, requiresNetwork: false, offline: true }],
  installs: 0, rating: 0, ratingCount: 0, updatedAt: "2026-08-29", slmFriendly: true,
};

export function fractalViz(input: ToolInput): ToolOutput {
  const cfg = input as Record<string, unknown>;
  const type = cfg.type as string;
  const data = (cfg.data as Record<string, unknown>) || {};

  try {
    switch (type) {
      case "dimension-plot": {
        const result = fractalDimensionPlot(
          "Fractal Dimension",
          (data.points as Array<{ logInvBox: number; logCount: number }>) || [],
        );
        return { success: true, data: result };
      }
      case "multifractal": {
        const result = multifractalPlot(
          "Multifractal Spectrum f(α)",
          (data.alpha as number[]) || [],
          (data.fAlpha as number[]) || [],
        );
        return { success: true, data: result };
      }
      case "convergence": {
        const result = convergencePlot(
          "Convergence History",
          (data.history as Array<{ iteration: number; value: number }>) || [],
        );
        return { success: true, data: result };
      }
      case "escape-heatmap": {
        const grid = (data.grid as number[][]) || [[]];
        const result = heatmap("Escape Time", grid);
        return { success: true, data: result };
      }
      default:
        return { success: false, data: `Unknown type: ${type}` };
    }
  } catch (e) {
    return { success: false, data: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const GRAPH_TOOLS: ToolManifest[] = [
  CHART_GENERATE_MANIFEST,
  QUICK_STATS_MANIFEST,
  FRACTAL_VIZ_MANIFEST,
];

export const GRAPH_EXECUTORS: Record<string, (input: ToolInput) => ToolOutput> = {
  "chart.generate": chartGenerate,
  "chart.stats": quickStats,
  "chart.fractal-viz": fractalViz,
};

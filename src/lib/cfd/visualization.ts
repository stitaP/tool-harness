/**
 * CFD Visualization & Convergence Monitoring
 * ──────────────────────────────────────────
 * Generates chart-ready data structures, contour maps,
 * streamlines, vector fields, and convergence reports
 * from solver results. Pure data — no DOM rendering.
 */

import type { Mesh2D } from "./mesh";
import type { SIMPLEResult, ConvergenceEntry } from "./solver";
import { computeVelocityMagnitude, computeVorticity } from "./solver";

// ─── Chart Data Types ────────────────────────────────────────────────────────

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ConvergenceChartData {
  iterations: number[];
  uResidual: number[];
  vResidual: number[];
  pResidual: number[];
  continuityResidual: number[];
  logScale: boolean;
}

export interface ContourData {
  field: string;
  grid: {
    ni: number;
    nj: number;
    xNodes: number[];
    yNodes: number[];
  };
  values: number[][]; // values[j][i] — row-major for rendering
  min: number;
  max: number;
  colormap: string;
}

export interface VectorFieldData {
  origins: ChartPoint[];
  directions: ChartPoint[];
  magnitudes: number[];
  scale: number;
}

export interface StreamlineData {
  lines: ChartPoint[][];
  seedPoints: ChartPoint[];
}

export interface CFDReport {
  problem: {
    Re: number;
    ni: number;
    nj: number;
    meshSize: string;
  };
  convergence: {
    converged: boolean;
    iterations: number;
    wallTimeMs: number;
    finalResidual: number;
  };
  flow: {
    maxVelocity: number;
    minPressure: number;
    maxPressure: number;
    maxVorticity: number;
    avgVelocity: number;
    reynoldsNumber: number;
  };
  charts: {
    convergence: ConvergenceChartData;
    velocityContour: ContourData;
    pressureContour: ContourData;
    vorticityContour: ContourData;
    velocityVectors: VectorFieldData;
    streamlines: StreamlineData;
    centerlineHorizontal: ChartPoint[];
    centerlineVertical: ChartPoint[];
  };
  validation: {
    dragCoefficient?: number;
    liftCoefficient?: number;
    nusseltNumber?: number;
  };
}

// ─── Convergence Chart ───────────────────────────────────────────────────────

export function buildConvergenceChart(
  history: ConvergenceEntry[],
  logScale = true,
): ConvergenceChartData {
  return {
    iterations: history.map((h) => h.iteration),
    uResidual: history.map((h) => (logScale ? Math.max(h.uResidual, 1e-15) : h.uResidual)),
    vResidual: history.map((h) => (logScale ? Math.max(h.vResidual, 1e-15) : h.vResidual)),
    pResidual: history.map((h) => (logScale ? Math.max(h.pResidual, 1e-15) : h.pResidual)),
    continuityResidual: history.map((h) =>
      logScale ? Math.max(h.continuityResidual, 1e-15) : h.continuityResidual,
    ),
    logScale,
  };
}

// ─── Contour Extraction ──────────────────────────────────────────────────────

function reshapeFieldToGrid(
  field: number[],
  mesh: Mesh2D,
): number[][] {
  const { ni, nj } = mesh;
  const grid: number[][] = [];
  for (let j = 0; j < nj; j++) {
    const row: number[] = [];
    for (let i = 0; i < ni; i++) {
      row.push(field[mesh.cellIndex(i, j)]);
    }
    grid.push(row);
  }
  return grid;
}

function fieldMinMax(field: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of field) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

export function buildVelocityContour(
  mesh: Mesh2D,
  u: number[],
  v: number[],
): ContourData {
  const velMag = computeVelocityMagnitude(u, v);
  const { min, max } = fieldMinMax(velMag);
  return {
    field: "velocity_magnitude",
    grid: {
      ni: mesh.ni,
      nj: mesh.nj,
      xNodes: [...mesh.xNodes],
      yNodes: [...mesh.yNodes],
    },
    values: reshapeFieldToGrid(velMag, mesh),
    min,
    max,
    colormap: "jet",
  };
}

export function buildPressureContour(
  mesh: Mesh2D,
  p: number[],
): ContourData {
  const { min, max } = fieldMinMax(p);
  return {
    field: "pressure",
    grid: {
      ni: mesh.ni,
      nj: mesh.nj,
      xNodes: [...mesh.xNodes],
      yNodes: [...mesh.yNodes],
    },
    values: reshapeFieldToGrid(p, mesh),
    min,
    max,
    colormap: "coolwarm",
  };
}

export function buildVorticityContour(
  mesh: Mesh2D,
  u: number[],
  v: number[],
): ContourData {
  const omega = computeVorticity(mesh, u, v);
  const { min, max } = fieldMinMax(omega);
  return {
    field: "vorticity",
    grid: {
      ni: mesh.ni,
      nj: mesh.nj,
      xNodes: [...mesh.xNodes],
      yNodes: [...mesh.yNodes],
    },
    values: reshapeFieldToGrid(omega, mesh),
    min,
    max,
    colormap: "seismic",
  };
}

// ─── Vector Field ────────────────────────────────────────────────────────────

export function buildVectorField(
  mesh: Mesh2D,
  u: number[],
  v: number[],
  skipI = 2,
  skipJ = 2,
): VectorFieldData {
  const origins: ChartPoint[] = [];
  const directions: ChartPoint[] = [];
  const magnitudes: number[] = [];
  let maxMag = 0;

  for (let j = skipJ; j < mesh.nj - skipJ; j += skipJ) {
    for (let i = skipI; i < mesh.ni - skipI; i += skipI) {
      const idx = mesh.cellIndex(i, j);
      const c = mesh.cells[idx];
      const ui = u[idx];
      const vi = v[idx];
      const mag = Math.sqrt(ui ** 2 + vi ** 2);
      if (mag > maxMag) maxMag = mag;
      origins.push({ x: c.centroid[0], y: c.centroid[1] });
      directions.push({ x: ui, y: vi });
      magnitudes.push(mag);
    }
  }

  // Normalize arrows
  const scale = maxMag > 0 ? 1.0 / maxMag : 0;
  return {
    origins,
    directions: directions.map((d) => ({ x: d.x * scale, y: d.y * scale })),
    magnitudes,
    scale,
  };
}

// ─── Streamlines (simple Euler integration) ─────────────────────────────────

export function buildStreamlines(
  mesh: Mesh2D,
  u: number[],
  v: number[],
  nSeeds = 20,
  maxSteps = 500,
  stepSize = 0.01,
): StreamlineData {
  const seedPoints: ChartPoint[] = [];
  const lines: ChartPoint[][] = [];

  // Seed along left boundary and bottom
  for (let k = 0; k < nSeeds; k++) {
    const frac = (k + 0.5) / nSeeds;
    if (k < nSeeds / 2) {
      // Left boundary seeds
      seedPoints.push({
        x: mesh.xNodes[1] * 0.5,
        y: mesh.yNodes[0] + frac * (mesh.yNodes[mesh.nj - 1] - mesh.yNodes[0]),
      });
    } else {
      // Bottom boundary seeds
      seedPoints.push({
        x: mesh.xNodes[0] + frac * (mesh.xNodes[mesh.ni - 1] - mesh.xNodes[0]),
        y: mesh.yNodes[1] * 0.5,
      });
    }
  }

  for (const seed of seedPoints) {
    const line: ChartPoint[] = [{ ...seed }];
    let x = seed.x;
    let y = seed.y;

    for (let step = 0; step < maxSteps; step++) {
      // Interpolate velocity at (x, y)
      const { u: ui, v: vi } = interpolateVelocity(mesh, u, v, x, y);
      const mag = Math.sqrt(ui ** 2 + vi ** 2);
      if (mag < 1e-10) break;

      // Check bounds
      if (
        x < mesh.xNodes[0] || x > mesh.xNodes[mesh.ni - 1] ||
        y < mesh.yNodes[0] || y > mesh.yNodes[mesh.nj - 1]
      ) break;

      // Euler step
      x += (ui / mag) * stepSize;
      y += (vi / mag) * stepSize;
      line.push({ x, y });
    }

    if (line.length > 2) {
      lines.push(line);
    }
  }

  return { lines, seedPoints };
}

function interpolateVelocity(
  mesh: Mesh2D,
  u: number[],
  v: number[],
  x: number,
  y: number,
): { u: number; v: number } {
  // Bilinear interpolation
  const { ni, nj, xNodes, yNodes, cellIndex } = mesh;

  // Find i such that xNodes[i] <= x < xNodes[i+1]
  let i = 0;
  for (let k = 0; k < ni - 1; k++) {
    if (x >= xNodes[k] && x < xNodes[k + 1]) { i = k; break; }
    if (k === ni - 2) i = ni - 2;
  }

  let j = 0;
  for (let k = 0; k < nj - 1; k++) {
    if (y >= yNodes[k] && y < yNodes[k + 1]) { j = k; break; }
    if (k === nj - 2) j = nj - 2;
  }

  // Bilinear interpolation weights
  const x0 = xNodes[i], x1 = xNodes[i + 1];
  const y0 = yNodes[j], y1 = yNodes[j + 1];
  const tx = (x1 - x0) > 0 ? (x - x0) / (x1 - x0) : 0;
  const ty = (y1 - y0) > 0 ? (y - y0) / (y1 - y0) : 0;

  const i00 = cellIndex(i, j);
  const i10 = cellIndex(Math.min(i + 1, ni - 1), j);
  const i01 = cellIndex(i, Math.min(j + 1, nj - 1));
  const i11 = cellIndex(Math.min(i + 1, ni - 1), Math.min(j + 1, nj - 1));

  const uVal = (1 - tx) * (1 - ty) * u[i00] + tx * (1 - ty) * u[i10] +
    (1 - tx) * ty * u[i01] + tx * ty * u[i11];
  const vVal = (1 - tx) * (1 - ty) * v[i00] + tx * (1 - ty) * v[i10] +
    (1 - tx) * ty * v[i01] + tx * ty * v[i11];

  return { u: uVal, v: vVal };
}

// ─── Centerline Data ─────────────────────────────────────────────────────────

export function buildCenterlineHorizontal(
  mesh: Mesh2D,
  field: number[],
  yPosition: number,
): ChartPoint[] {
  // Find closest j to yPosition
  let bestJ = 0;
  let bestDist = Infinity;
  for (let j = 0; j < mesh.nj; j++) {
    const y = mesh.cells[mesh.cellIndex(0, j)].centroid[1];
    if (Math.abs(y - yPosition) < bestDist) {
      bestDist = Math.abs(y - yPosition);
      bestJ = j;
    }
  }
  const points: ChartPoint[] = [];
  for (let i = 0; i < mesh.ni; i++) {
    const idx = mesh.cellIndex(i, bestJ);
    points.push({ x: mesh.cells[idx].centroid[0], y: field[idx] });
  }
  return points;
}

export function buildCenterlineVertical(
  mesh: Mesh2D,
  field: number[],
  xPosition: number,
): ChartPoint[] {
  let bestI = 0;
  let bestDist = Infinity;
  for (let i = 0; i < mesh.ni; i++) {
    const x = mesh.cells[mesh.cellIndex(i, 0)].centroid[0];
    if (Math.abs(x - xPosition) < bestDist) {
      bestDist = Math.abs(x - xPosition);
      bestI = i;
    }
  }
  const points: ChartPoint[] = [];
  for (let j = 0; j < mesh.nj; j++) {
    const idx = mesh.cellIndex(bestI, j);
    points.push({ x: mesh.cells[idx].centroid[1], y: field[idx] });
  }
  return points;
}

// ─── Full CFD Report ─────────────────────────────────────────────────────────

export function buildCFDReport(
  mesh: Mesh2D,
  result: SIMPLEResult,
): CFDReport {
  const velMag = computeVelocityMagnitude(result.u, result.v);
  const vorticity = computeVorticity(mesh, result.u, result.v);
  const { min: minP, max: maxP } = fieldMinMax(result.p);
  const { max: maxVel } = fieldMinMax(velMag);
  let sumVel = 0;
  for (const v of velMag) sumVel += v;
  const avgVel = sumVel / velMag.length;
  const { max: maxVort } = fieldMinMax(vorticity);

  return {
    problem: {
      Re: result.Re,
      ni: mesh.ni,
      nj: mesh.nj,
      meshSize: `${mesh.ni}×${mesh.nj} (${mesh.nCells} cells, ${mesh.nFaces} faces)`,
    },
    convergence: {
      converged: result.converged,
      iterations: result.iterations,
      wallTimeMs: result.wallTimeMs,
      finalResidual: result.maxContinuityResidual,
    },
    flow: {
      maxVelocity: maxVel,
      minPressure: minP,
      maxPressure: maxP,
      maxVorticity: maxVort,
      avgVelocity: avgVel,
      reynoldsNumber: result.Re,
    },
    charts: {
      convergence: buildConvergenceChart(result.history),
      velocityContour: buildVelocityContour(mesh, result.u, result.v),
      pressureContour: buildPressureContour(mesh, result.p),
      vorticityContour: buildVorticityContour(mesh, result.u, result.v),
      velocityVectors: buildVectorField(mesh, result.u, result.v),
      streamlines: buildStreamlines(mesh, result.u, result.v),
      centerlineHorizontal: buildCenterlineHorizontal(mesh, result.u, 0.5),
      centerlineVertical: buildCenterlineVertical(mesh, result.v, 0.5),
    },
    validation: {},
  };
}

// ─── Summary Text ────────────────────────────────────────────────────────────

export function generateSummary(report: CFDReport): string {
  const { problem: prob, convergence: conv, flow } = report;
  const lines = [
    `CFD Simulation Report`,
    `═══════════════════════════════════════`,
    ``,
    `Problem:  Re = ${prob.Re}, Mesh = ${prob.meshSize}`,
    `Status:   ${conv.converged ? "✅ CONVERGED" : "⚠️ NOT CONVERGED"}`,
    `Steps:    ${conv.iterations} outer iterations`,
    `Time:     ${(conv.wallTimeMs / 1000).toFixed(2)}s`,
    `Residual: ${conv.finalResidual.toExponential(3)}`,
    ``,
    `Flow Field:`,
    `  Max velocity:     ${flow.maxVelocity.toFixed(6)}`,
    `  Avg velocity:     ${flow.avgVelocity.toFixed(6)}`,
    `  Pressure range:   [${flow.minPressure.toFixed(4)}, ${flow.maxPressure.toFixed(4)}]`,
    `  Max vorticity:    ${flow.maxVorticity.toFixed(4)}`,
  ];

  if (report.validation.dragCoefficient !== undefined) {
    lines.push(
      ``,
      `Validation:`,
      `  Cd = ${report.validation.dragCoefficient.toFixed(4)}`,
      `  Cl = ${report.validation.liftCoefficient?.toFixed(4) ?? "N/A"}`,
    );
  }

  return lines.join("\n");
}

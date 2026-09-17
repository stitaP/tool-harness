/**
 * CFD Tool Manifests
 * ──────────────────
 * Agent-callable tools for computational fluid dynamics:
 * mesh generation, Navier-Stokes solving, post-processing,
 * visualization, and benchmark problems.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";
import {
  createLidDrivenCavity,
  createChannelFlow,
  createBackwardFacingStep,
} from "../../cfd/mesh";
import type { Mesh2D } from "../../cfd/mesh";
import { solveSIMPLE, solveLidDrivenCavity, solveChannel, solveBackwardStep, computeVelocityMagnitude } from "../../cfd/solver";
import {
  buildCFDReport,
  generateSummary,
} from "../../cfd/visualization";
import {
  dispatchCFD,
  autoSolve,
  formatDispatch,
  type CFDDispatch,
} from "../../cfd/dispatcher";

// ─── Tool: Create Mesh ───────────────────────────────────────────────────────

export const MESH_CREATE_MANIFEST: ToolManifest = {
  id: "cfd.mesh.create",
  name: "Create CFD Mesh",
  description: "Generate a structured 2D Cartesian mesh for CFD simulations with configurable domain size, grid resolution, and boundary conditions.",
  category: "cfd",
  version: "1.0.0",
  tags: ["cfd", "mesh", "grid", "finite-volume", "simulation"],
  author: "stitaP",
  license: "MIT",
  icon: "Grid3X3",
  color: "#0ea5e9",
  parameters: [
    { name: "problem", type: "enum", description: "Pre-built problem or custom mesh", required: false, default: "lid-driven-cavity", enum: ["lid-driven-cavity", "channel-flow", "backward-step"] },
    { name: "domainWidth", type: "number", description: "Domain width in meters", required: false, default: 1.0 },
    { name: "domainHeight", type: "number", description: "Domain height in meters", required: false, default: 1.0 },
    { name: "ni", type: "number", description: "Number of cells in x-direction", required: false, default: 32, min: 4, max: 256 },
    { name: "nj", type: "number", description: "Number of cells in y-direction", required: false, default: 32, min: 4, max: 256 },
    { name: "reynoldsNumber", type: "number", description: "Reynolds number", required: false, default: 100, min: 1, max: 100000 },
  ],
  capabilities: [
    { name: "mesh-generation", description: "Generate structured 2D meshes for CFD", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-29",
  slmFriendly: false,
};

export function meshCreate(input: ToolInput): ToolOutput {
  const problem = (input.problem as string) || "lid-driven-cavity";
  const ni = (input.ni as number) || 32;
  const nj = (input.nj as number) || 32;
  const Re = (input.reynoldsNumber as number) || 100;
  const dw = (input.domainWidth as number) || 1.0;
  const dh = (input.domainHeight as number) || 1.0;

  let p: { mesh: Mesh2D; Re: number };
  if (problem === "channel-flow") {
    p = createChannelFlow(dw, dh, ni, nj, Re);
  } else if (problem === "backward-step") {
    p = createBackwardFacingStep(Re, ni, nj);
  } else {
    p = createLidDrivenCavity(dw, dh, ni, nj, Re);
  }

  return {
    success: true,
    data: { nCells: p.mesh.nCells, nFaces: p.mesh.nFaces, meshSize: `${ni}×${nj}`, Re: p.Re },
  };
}

// ─── Tool: Solve Navier-Stokes ───────────────────────────────────────────────

export const SOLVE_NS_MANIFEST: ToolManifest = {
  id: "cfd.solve.navier-stokes",
  name: "Solve Navier-Stokes",
  description: "Run an incompressible 2D Navier-Stokes simulation using the SIMPLE (Semi-Implicit Method for Pressure-Linked Equations) algorithm. Returns velocity fields, pressure field, convergence history, and diagnostics.",
  category: "cfd",
  version: "1.0.0",
  tags: ["cfd", "navier-stokes", "simple", "pressure-velocity", "solver"],
  author: "stitaP",
  license: "MIT",
  icon: "Waves",
  color: "#6366f1",
  parameters: [
    { name: "problem", type: "enum", description: "Benchmark problem to solve", required: false, default: "lid-driven-cavity", enum: ["lid-driven-cavity", "channel-flow", "backward-step"] },
    { name: "reynoldsNumber", type: "number", description: "Reynolds number", required: false, default: 100, min: 1, max: 100000 },
    { name: "ni", type: "number", description: "Grid cells in x", required: false, default: 32, min: 4, max: 128 },
    { name: "nj", type: "number", description: "Grid cells in y", required: false, default: 32, min: 4, max: 128 },
    { name: "maxIterations", type: "number", description: "Max outer iterations", required: false, default: 500, min: 10, max: 5000 },
    { name: "tolerance", type: "number", description: "Convergence tolerance", required: false, default: 1e-6 },
    { name: "alphaP", type: "number", description: "Pressure under-relaxation (0-1)", required: false, default: 0.3, min: 0.01, max: 1.0 },
    { name: "alphaU", type: "number", description: "Velocity under-relaxation (0-1)", required: false, default: 0.7, min: 0.01, max: 1.0 },
    { name: "convectionScheme", type: "enum", description: "Convection discretization scheme", required: false, default: "upwind", enum: ["upwind", "central", "blended"] },
  ],
  capabilities: [
    { name: "navier-stokes-solver", description: "Incompressible 2D Navier-Stokes with SIMPLE algorithm", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-29",
  slmFriendly: false,
};

export function solveNS(input: ToolInput): ToolOutput {
  const problemType = (input.problem as string) || "lid-driven-cavity";
  const Re = (input.reynoldsNumber as number) || 100;
  const ni = (input.ni as number) || 32;
  const nj = (input.nj as number) || 32;

  const solverConfig = {
    maxOuterIter: (input.maxIterations as number) || 500,
    tolerance: (input.tolerance as number) || 1e-6,
    alphaP: (input.alphaP as number) || 0.3,
    alphaU: (input.alphaU as number) || 0.7,
    convectionScheme: (input.convectionScheme as "upwind" | "central" | "blended") || "upwind",
  };

  let result;
  if (problemType === "channel-flow") {
    result = solveChannel(Re, ni, nj, solverConfig);
  } else if (problemType === "backward-step") {
    result = solveBackwardStep(Re, ni, nj, solverConfig);
  } else {
    result = solveLidDrivenCavity(Re, ni, nj, solverConfig);
  }

  const velMag = computeVelocityMagnitude(result.u, result.v);
  const maxVel = Math.max(...velMag);

  // Re-create mesh for report (solver doesn't return mesh)
  const problem = createLidDrivenCavity(1, 1, ni, nj, Re);
  const report = buildCFDReport(problem.mesh, result);

  return {
    success: true,
    data: {
      converged: result.converged,
      iterations: result.iterations,
      wallTimeMs: result.wallTimeMs,
      maxVelocity: maxVel,
      maxPressure: Math.max(...result.p),
      reynoldsNumber: result.Re,
      finalResidual: result.maxContinuityResidual,
      maxCFL: result.maxCFL,
      summary: generateSummary(report),
    },
  };
}

// ─── Tool: Post-Process ──────────────────────────────────────────────────────

export const POSTPROCESS_MANIFEST: ToolManifest = {
  id: "cfd.postprocess",
  name: "CFD Post-Processing",
  description: "Generate convergence charts, contour data, velocity vector fields, streamlines, and centerline profiles from solver results.",
  category: "cfd",
  version: "1.0.0",
  tags: ["cfd", "visualization", "contour", "streamlines", "postprocess"],
  author: "stitaP",
  license: "MIT",
  icon: "BarChart3",
  color: "#f59e0b",
  parameters: [
    { name: "problem", type: "enum", description: "Problem to post-process", required: false, default: "lid-driven-cavity", enum: ["lid-driven-cavity", "channel-flow", "backward-step"] },
    { name: "reynoldsNumber", type: "number", description: "Reynolds number", required: false, default: 100 },
    { name: "ni", type: "number", description: "Grid cells in x", required: false, default: 32 },
    { name: "nj", type: "number", description: "Grid cells in y", required: false, default: 32 },
    { name: "outputs", type: "array", description: "Which outputs to generate", required: false, default: ["convergence", "velocity-contour", "report"] },
  ],
  capabilities: [
    { name: "cfd-postprocess", description: "Post-processing and visualization of CFD results", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-29",
  slmFriendly: false,
};

export function postprocess(input: ToolInput): ToolOutput {
  const problemType = (input.problem as string) || "lid-driven-cavity";
  const Re = (input.reynoldsNumber as number) || 100;
  const ni = (input.ni as number) || 32;
  const nj = (input.nj as number) || 32;
  const outputs = (input.outputs as string[]) || ["convergence", "velocity-contour", "report"];

  const problem = createLidDrivenCavity(1, 1, ni, nj, Re);
  const result = solveSIMPLE(problem);
  const report = buildCFDReport(problem.mesh, result);

  const out: Record<string, unknown> = {};
  if (outputs.includes("convergence")) out.convergence = report.charts.convergence;
  if (outputs.includes("velocity-contour")) out.velocityContour = report.charts.velocityContour;
  if (outputs.includes("pressure-contour")) out.pressureContour = report.charts.pressureContour;
  if (outputs.includes("vorticity-contour")) out.vorticityContour = report.charts.vorticityContour;
  if (outputs.includes("vectors")) out.velocityVectors = report.charts.velocityVectors;
  if (outputs.includes("streamlines")) out.streamlines = report.charts.streamlines;
  if (outputs.includes("centerline")) {
    out.centerlineH = report.charts.centerlineHorizontal;
    out.centerlineV = report.charts.centerlineVertical;
  }
  if (outputs.includes("report")) out.report = generateSummary(report);

  return { success: true, data: out };
}

// ─── Tool: Benchmark Comparison ──────────────────────────────────────────────

export const BENCHMARK_MANIFEST: ToolManifest = {
  id: "cfd.benchmark",
  name: "CFD Benchmark",
  description: "Run standard CFD benchmarks (lid-driven cavity, channel flow, backward-facing step) at specified Reynolds numbers and grid resolutions. Returns convergence metrics for comparison against published data.",
  category: "cfd",
  version: "1.0.0",
  tags: ["cfd", "benchmark", "validation", "lid-driven-cavity", "reynolds"],
  author: "stitaP",
  license: "MIT",
  icon: "TestTube2",
  color: "#10b981",
  parameters: [
    { name: "benchmarks", type: "array", description: "List of benchmarks to run [{name, re, grid}]", required: true },
  ],
  capabilities: [
    { name: "cfd-benchmark", description: "Run standard CFD benchmark problems", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-29",
  slmFriendly: false,
};

export function benchmark(input: ToolInput): ToolOutput {
  const benchList = (input.benchmarks as Array<{ name: string; re: number; grid: string }>) || [];

  const results: Array<Record<string, unknown>> = [];

  for (const b of benchList) {
    const [niStr, njStr] = (b.grid || "32x32").split("x");
    const ni = parseInt(niStr, 10) || 32;
    const nj = parseInt(njStr, 10) || 32;
    const Re = b.re || 100;

    const solverConfig = { maxOuterIter: 500, tolerance: 1e-6, alphaP: 0.3, alphaU: 0.7 };

    let result;
    if (b.name === "channel-flow") {
      result = solveChannel(Re, ni, nj, solverConfig);
    } else if (b.name === "backward-step") {
      result = solveBackwardStep(Re, ni, nj, solverConfig);
    } else {
      result = solveLidDrivenCavity(Re, ni, nj, solverConfig);
    }

    const velMag = computeVelocityMagnitude(result.u, result.v);

    results.push({
      name: b.name,
      Re,
      grid: `${ni}×${nj}`,
      converged: result.converged,
      iterations: result.iterations,
      wallTimeMs: result.wallTimeMs,
      finalResidual: result.maxContinuityResidual,
      maxVelocity: Math.max(...velMag),
      maxCFL: result.maxCFL,
    });
  }

  const lines = ["CFD Benchmark Results", "═══════════════════════════════", ""];
  for (const r of results) {
    lines.push(
      `${r.name} (Re=${r.Re}, grid=${r.grid})`,
      `  Converged: ${r.converged ? "✅" : "❌"}`,
      `  Iterations: ${r.iterations}`,
      `  Time: ${(r.wallTimeMs as number / 1000).toFixed(2)}s`,
      `  Residual: ${(r.finalResidual as number).toExponential(3)}`,
      `  Max velocity: ${(r.maxVelocity as number).toFixed(6)}`,
      "",
    );
  }

  return { success: true, data: { results, summary: lines.join("\n") } };
}

// ─── Tool: Auto-Dispatch (Agent Decides Algorithm) ─────────────────────────

export const AUTO_DISPATCH_MANIFEST: ToolManifest = {
  id: "cfd.auto-dispatch",
  name: "CFD Auto-Dispatch",
  description: "Intelligent auto-selection of solver type, grid resolution, boundary conditions, and convergence parameters from a natural language problem description. The agent describes the problem in plain English and this tool decides everything.",
  category: "cfd",
  version: "1.0.0",
  tags: ["cfd", "auto", "dispatch", "intelligent", "solver-selection", "natural-language"],
  author: "stitaP",
  license: "MIT",
  icon: "Sparkles",
  color: "#8b5cf6",
  parameters: [
    { name: "description", type: "string", description: "Natural language description of the CFD problem (e.g. 'Solve lid-driven cavity at Re=1000', 'Channel flow between parallel plates at Re=200', 'Backward-facing step with sudden expansion')", required: true },
    { name: "maxGridCells", type: "number", description: "Maximum total grid cells allowed (browser performance limit, default 16384)", required: false, default: 16384, min: 100, max: 65536 },
    { name: "solve", type: "boolean", description: "Whether to also run the solver and return results (default true)", required: false, default: true },
  ],
  capabilities: [
    { name: "cfd-auto-dispatch", description: "Intelligent algorithm selection and auto-solving from natural language", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-29",
  slmFriendly: true,
};

export function autoDispatchTool(input: ToolInput): ToolOutput {
  const description = (input.description as string) || "Solve lid-driven cavity at Re=100";
  const shouldSolve = input.solve !== false;

  if (shouldSolve) {
    const { dispatch, result, report, summary } = autoSolve(description);
    return {
      success: true,
      data: {
        dispatchDecisions: formatDispatch(dispatch),
        converged: result.converged,
        iterations: result.iterations,
        wallTimeMs: result.wallTimeMs,
        maxVelocity: Math.max(...computeVelocityMagnitude(result.u, result.v)),
        maxPressure: Math.max(...result.p),
        maxCFL: result.maxCFL,
        reynoldsNumber: result.Re,
        finalResidual: result.maxContinuityResidual,
        report: generateSummary(report),
        fullSummary: summary,
      },
    };
  }

  // Dispatch-only (no solve)
  const dispatch = dispatchCFD(description);
  return {
    success: true,
    data: {
      dispatchDecisions: formatDispatch(dispatch),
      classification: dispatch.classification,
      Re: dispatch.Re,
      grid: dispatch.grid,
      algorithm: dispatch.algorithm,
      solverConfig: dispatch.solverConfig,
    },
  };
}

// ─── Export All ───────────────────────────────────────────────────────────────

// ─── Tool: Pipe Flow Thermal Solver ──────────────────────────────────────────

import {
  solvePipeFlow,
  extractCenterlineTemp,
  extractRadialProfile,
  generateContourData,
  type PipeFlowConfig,
} from "../../cfd/thermal";

export const PIPEFLOW_THERMAL_MANIFEST: ToolManifest = {
  id: "cfd.pipeflow.thermal",
  name: "Pipe Flow Thermal Solver",
  description: "Solve pipe flow with coupled momentum and energy equations. Handles convective heat transfer from external sources (sun, ambient). Returns velocity profile, temperature distribution, Nusselt number, and pressure drop.",
  category: "cfd",
  version: "1.0.0",
  tags: ["cfd", "pipe-flow", "thermal", "heat-transfer", "convection"],
  author: "stitaP",
  license: "MIT",
  icon: "Thermometer",
  color: "#ef4444",
  parameters: [
    { name: "diameter", type: "number", description: "Pipe diameter in meters (default 0.6096 = 2ft)", required: false, default: 0.6096, min: 0.01, max: 10 },
    { name: "length", type: "number", description: "Pipe length in meters", required: false, default: 10.0, min: 0.1, max: 1000 },
    { name: "flowRateLPM", type: "number", description: "Volumetric flow rate in liters per minute", required: false, default: 60, min: 0.1, max: 10000 },
    { name: "sunTempC", type: "number", description: "External temperature (e.g. sun ambient) in °C", required: false, default: 58, min: -50, max: 200 },
    { name: "inletTempC", type: "number", description: "Water inlet temperature in °C", required: false, default: 25, min: 0, max: 100 },
    { name: "hSun", type: "number", description: "Convective heat transfer coefficient W/m²K (natural convection ~10-25, forced ~50-500)", required: false, default: 25, min: 1, max: 1000 },
    { name: "wallThickness", type: "number", description: "Pipe wall thickness in meters", required: false, default: 0.006, min: 0.001, max: 0.1 },
    { name: "wallConductivity", type: "number", description: "Pipe wall thermal conductivity W/mK (steel=50, copper=400, PVC=0.2)", required: false, default: 50, min: 0.1, max: 500 },
    { name: "ni", type: "number", description: "Axial grid cells", required: false, default: 80, min: 10, max: 200 },
    { name: "nj", type: "number", description: "Radial grid cells", required: false, default: 32, min: 4, max: 100 },
    { name: "outputs", type: "array", description: "Which outputs to generate", required: false, default: ["velocity-profile", "temperature-contour", "centerline", "report"] },
  ],
  capabilities: [
    { name: "pipe-thermal-solver", description: "Coupled momentum + energy solver for pipe flow with heat transfer", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: "2026-08-29",
  slmFriendly: true,
};

export function pipeflowThermal(input: ToolInput): ToolOutput {
  const config: Partial<PipeFlowConfig> = {
    diameter: (input.diameter as number) || 0.6096,
    length: (input.length as number) || 10.0,
    flowRateLPM: (input.flowRateLPM as number) || 60,
    sunTempC: (input.sunTempC as number) || 58,
    inletTempC: (input.inletTempC as number) || 25,
    hSun: (input.hSun as number) || 25,
    wallThickness: (input.wallThickness as number) || 0.006,
    wallConductivity: (input.wallConductivity as number) || 50,
    ni: (input.ni as number) || 80,
    nj: (input.nj as number) || 32,
  };
  const outputs = (input.outputs as string[]) || ["velocity-profile", "temperature-contour", "centerline", "report"];

  const result = solvePipeFlow(config);
  const out: Record<string, unknown> = {};

  if (outputs.includes("velocity-profile")) {
    out.velocityProfile = generateContourData(result, "velocity", 40);
  }
  if (outputs.includes("temperature-contour")) {
    out.temperatureContour = generateContourData(result, "temperature", 40);
  }
  if (outputs.includes("centerline")) {
    out.centerline = extractCenterlineTemp(result);
  }
  if (outputs.includes("radial-inlet")) {
    out.radialInlet = extractRadialProfile(result, 0.0);
  }
  if (outputs.includes("radial-mid")) {
    out.radialMid = extractRadialProfile(result, 0.5);
  }
  if (outputs.includes("radial-outlet")) {
    out.radialOutlet = extractRadialProfile(result, 1.0);
  }
  if (outputs.includes("report")) {
    const p = result.params;
    out.report = [
      `═══ PIPE FLOW THERMAL ANALYSIS ═══`,
      ``,
      `── Problem ──`,
      `  Diameter:          ${config.diameter} m (${((config.diameter || 0.6096) * 3.28084).toFixed(2)} ft)`,
      `  Length:            ${config.length} m`,
      `  Flow rate:         ${config.flowRateLPM} LPM`,
      `  Sun temperature:   ${config.sunTempC}°C`,
      `  Water inlet temp:  ${config.inletTempC}°C`,
      `  Heat transfer h:   ${config.hSun} W/m²K`,
      ``,
      `── Results ──`,
      `  Reynolds number:   ${p.reynoldsNumber.toFixed(1)} (${p.reynoldsNumber < 2300 ? "laminar" : p.reynoldsNumber < 4000 ? "transitional" : "turbulent"})`,
      `  Mean velocity:     ${p.meanVelocity.toFixed(4)} m/s`,
      `  Outlet bulk temp:  ${p.bulkTempOutlet.toFixed(2)}°C`,
      `  Temperature rise:  ${(p.bulkTempOutlet - p.bulkTempInlet).toFixed(2)}°C`,
      `  Max temperature:   ${p.maxTemp.toFixed(2)}°C (at wall)`,
      `  Heat flux (avg):   ${p.heatFlux.toFixed(1)} W/m²`,
      `  Total heat gain:   ${p.totalHeatGain.toFixed(1)} W`,
      `  Nusselt number:    ${p.nusseltNumber.toFixed(2)}`,
      `  Friction factor:   ${p.frictionFactor.toFixed(6)}`,
      `  Pressure drop:     ${p.pressureDrop.toFixed(2)} Pa`,
    ].join("\n");
  }

  return { success: true, data: out };
}

export const CFD_TOOLS: ToolManifest[] = [
  MESH_CREATE_MANIFEST,
  SOLVE_NS_MANIFEST,
  POSTPROCESS_MANIFEST,
  BENCHMARK_MANIFEST,
  AUTO_DISPATCH_MANIFEST,
  PIPEFLOW_THERMAL_MANIFEST,
];

export const CFD_EXECUTORS: Record<string, (input: ToolInput) => ToolOutput> = {
  "cfd.mesh.create": meshCreate,
  "cfd.solve.navier-stokes": solveNS,
  "cfd.postprocess": postprocess,
  "cfd.benchmark": benchmark,
  "cfd.auto-dispatch": autoDispatchTool,
  "cfd.pipeflow.thermal": pipeflowThermal,
};

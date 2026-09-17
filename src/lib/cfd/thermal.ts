/**
 * Thermal CFD Solver — Pipe Flow with Heat Transfer
 * ─────────────────────────────────────────────────
 * Solves coupled momentum + energy equations for pipe flow
 * with external convective heat transfer (sun heating).
 *
 * Physics:
 *   ∂u/∂t + u·∇u = -∇p/ρ + ν∇²u              (momentum)
 *   ∂T/∂t + u·∇T = α∇²T                        (energy)
 *   ρCp·u·∇T = k∇²T + q_dot                     (heat source)
 *
 * Boundary Conditions for Pipe in Sun:
 *   - Inlet: parabolic velocity profile, water temperature
 *   - Outlet: zero-gradient
 *   - Wall (pipe surface): no-slip, convective BC from sun
 *   - Sun heating: q = h_sun * (T_sun - T_wall)
 */

import type { Mesh2D } from "./mesh";
import { createMesh2D, idx } from "./mesh";

// ─── Physical Constants ─────────────────────────────────────────────────────

/** Water properties at ~30°C */
export const WATER = {
  rho: 996,         // kg/m³
  cp: 4178,         // J/(kg·K)
  k: 0.615,         // W/(m·K)
  mu: 7.98e-4,      // Pa·s
  nu: 8.01e-7,      // m²/s
  alpha: 1.47e-7,   // m²/s (thermal diffusivity)
  Pr: 5.43,         // Prandtl number
};

export interface PipeFlowConfig {
  /** Pipe diameter in meters */
  diameter: number;
  /** Pipe length in meters */
  length: number;
  /** Volumetric flow rate in LPM (liters per minute) */
  flowRateLPM: number;
  /** External temperature (sun) in °C */
  sunTempC: number;
  /** Water inlet temperature in °C */
  inletTempC: number;
  /** Grid resolution */
  ni: number;
  nj: number;
  /** Convective heat transfer coefficient (W/m²K) — sun on pipe */
  hSun: number;
  /** Pipe wall thickness in meters (for thermal resistance) */
  wallThickness: number;
  /** Pipe wall thermal conductivity (W/mK) */
  wallConductivity: number;
}

export const DEFAULT_PIPE_CONFIG: PipeFlowConfig = {
  diameter: 0.6096,      // 2 ft = 0.6096 m
  length: 10.0,          // 10 m pipe
  flowRateLPM: 60,       // 60 liters per minute
  sunTempC: 58,          // hot sun
  inletTempC: 25,        // room temperature water
  ni: 80,                // axial cells
  nj: 32,                // radial cells
  hSun: 25,              // W/m²K (natural convection + radiation)
  wallThickness: 0.006,  // 6mm wall
  wallConductivity: 50,  // steel pipe
};

export interface PipeFlowResult {
  /** Axial velocity field [m/s] — cell-centered */
  u: number[];
  /** Radial velocity field [m/s] */
  v: number[];
  /** Pressure field [Pa] */
  p: number[];
  /** Temperature field [°C] */
  T: number[];
  /** Mesh info */
  mesh: Mesh2D;
  /** Computed parameters */
  params: {
    reynoldsNumber: number;
    meanVelocity: number;
    bulkTempInlet: number;
    bulkTempOutlet: number;
    maxTemp: number;
    minTemp: number;
    heatFlux: number;
    totalHeatGain: number;
    nusseltNumber: number;
    frictionFactor: number;
    pressureDrop: number;
  };
  /** Convergence history */
  convergence: { iteration: number; residual: number; tempResidual: number }[];
}

/**
 * Create a pipe flow problem for thermal analysis.
 * Uses 2D axisymmetric mesh (x = axial, y = radial).
 */
export function createPipeFlowProblem(config: Partial<PipeFlowConfig> = {}): {
  config: PipeFlowConfig;
  mesh: Mesh2D;
  u0: number[];
  v0: number[];
  T0: number[];
  p0: number[];
} {
  const cfg = { ...DEFAULT_PIPE_CONFIG, ...config };
  const R = cfg.diameter / 2;

  // Create mesh: x ∈ [0, length], y ∈ [0, radius]
  const mesh = createMesh2D(cfg.length, R, cfg.ni, cfg.nj);

  // Set boundary conditions
  // Left (i=0): inlet — prescribed velocity + temperature
  mesh.boundaryConditions[0].type = "inlet";
  mesh.boundaryConditions[0].velocityMagnitude = 1.0; // will be overridden
  mesh.boundaryConditions[0].u = 1.0;
  mesh.boundaryConditions[0].v = 0;

  // Right (i=ni): outlet — zero gradient
  mesh.boundaryConditions[1].type = "outlet";
  mesh.boundaryConditions[1].pValue = 0;

  // Bottom (j=0): centerline — symmetry
  mesh.boundaryConditions[2].type = "symmetry";

  // Top (j=nj): pipe wall — no-slip + thermal BC
  mesh.boundaryConditions[3].type = "wall";
  mesh.boundaryConditions[3].u = 0;
  mesh.boundaryConditions[3].v = 0;

  // Compute mean velocity from flow rate
  const area = Math.PI * R * R; // m²
  const Q = cfg.flowRateLPM / 60000; // m³/s
  const Umean = Q / area; // m/s

  // Initialize fields with parabolic profile
  const nCells = mesh.nCells;
  const u0: number[] = new Array(nCells).fill(0);
  const v0: number[] = new Array(nCells).fill(0);
  const T0: number[] = new Array(nCells).fill(cfg.inletTempC);
  const p0: number[] = new Array(nCells).fill(0);

  for (let j = 0; j < mesh.nj; j++) {
    const r = mesh.cells[mesh.cellIndex(0, j)].centroid[1];
    const rRatio = r / R;
    // Parabolic profile: u(r) = 2*Umean*(1 - (r/R)²)
    const uProfile = 2 * Umean * (1 - rRatio * rRatio);
    for (let i = 0; i < mesh.ni; i++) {
      u0[mesh.cellIndex(i, j)] = uProfile;
    }
  }

  return { config: cfg, mesh, u0, v0, T0, p0 };
}

/**
 * Solve coupled momentum + energy for pipe flow in sun.
 * Simplified 2D solver using finite difference.
 */
export function solvePipeFlow(config: Partial<PipeFlowConfig> = {}): PipeFlowResult {
  const { config: cfg, mesh, u0, v0, T0, p0 } = createPipeFlowProblem(config);

  const R = cfg.diameter / 2;
  const Q = cfg.flowRateLPM / 60000; // m³/s
  const Umean = Q / (Math.PI * R * R);
  const Re = (WATER.rho * Umean * cfg.diameter) / WATER.mu;

  // Solve velocity field (fully developed parabolic profile)
  const u: number[] = [...u0];
  const v: number[] = [...v0];
  const p: number[] = [...p0];

  // For fully developed laminar pipe flow, the analytical solution is:
  // u(r) = 2*Umean*(1 - (r/R)²)
  // v(r) = 0 (no radial flow)
  // p(x) = -Δp/L * x (linear pressure drop)

  // Friction factor (Darcy-Weisbach for laminar flow)
  const f = 64 / Re; // laminar Darcy friction factor
  const deltaP = f * (cfg.length / cfg.diameter) * (WATER.rho * Umean * Umean) / 2;

  // Set exact velocity field
  for (let j = 0; j < mesh.nj; j++) {
    const r = mesh.cells[mesh.cellIndex(0, j)].centroid[1];
    const rRatio = r / R;
    const uProfile = 2 * Umean * (1 - rRatio * rRatio);
    for (let i = 0; i < mesh.ni; i++) {
      const ci = mesh.cellIndex(i, j);
      u[ci] = uProfile;
      v[ci] = 0;
      p[ci] = deltaP * (1 - i / (mesh.ni - 1));
    }
  }

  // ─── Solve Energy Equation ────────────────────────────────────────────
  // Use iterative finite difference for temperature field
  // dT/dx * u = α * d²T/dr² + α * (1/r) * dT/dr (axisymmetric)
  // BC at wall: -k * dT/dr|_wall = h_sun * (T_sun - T_wall)

  const T: number[] = [...T0];
  const dx = cfg.length / cfg.ni;
  const T_convergence: { iteration: number; residual: number; tempResidual: number }[] = [];

  const maxIter = 500;
  const tolerance = 1e-5;

  for (let iter = 0; iter < maxIter; iter++) {
    const T_new = [...T];

    for (let i = 1; i < mesh.ni; i++) {
      for (let j = 1; j < mesh.nj - 1; j++) {
        const ci = mesh.cellIndex(i, j);
        const r = mesh.cells[ci].centroid[1];
        const dr = mesh.dy[j];

        // Axial conduction (upwind for convection)
        const uLocal = u[ci];
        const T_left = T[mesh.cellIndex(i - 1, j)];

        // Radial conduction
        const T_down = T[mesh.cellIndex(i, j - 1)];
        const T_up = T[mesh.cellIndex(i, j + 1)];

        // Axisymmetric Laplacian: (1/r) * d/dr(r * dT/dr)
        const r_down = mesh.cells[mesh.cellIndex(i, j - 1)].centroid[1];
        const r_up = mesh.cells[mesh.cellIndex(i, j + 1)].centroid[1];

        const dTdr = (T_up - T_down) / (r_up - r_down);
        const radialLaplacian = (1 / r) * dTdr + (T_up - 2 * T[ci] + T_down) / (dr * dr);

        // Axial convection (upwind)
        const axialConvection = uLocal * (T[ci] - T_left) / dx;

        // Energy equation: u * dT/dx = α * (∂²T/∂r² + (1/r)∂T/∂r + ∂²T/∂x²)
        const dTdt = WATER.alpha * radialLaplacian - axialConvection;

        // Under-relaxation
        T_new[ci] = T[ci] + 0.5 * dTdt * dx * dx / WATER.alpha;
      }
    }

    // Apply thermal BC at pipe wall (top boundary, j = nj-1)
    for (let i = 0; i < mesh.ni; i++) {
      const ci_inner = mesh.cellIndex(i, mesh.nj - 2);
      const dr = mesh.dy[mesh.nj - 2];

      // Convective BC: -k * dT/dr = h * (T_sun - T_wall)
      // T_wall = T_inner + dr * h * (T_sun - T_inner) / k_eff
      const k_eff = 1 / (1 / WATER.k + cfg.wallThickness / cfg.wallConductivity);
      const T_inner = T_new[ci_inner];
      const T_wall = T_inner + dr * cfg.hSun * (cfg.sunTempC - T_inner) / k_eff;

      T_new[mesh.cellIndex(i, mesh.nj - 1)] = T_wall;
    }

    // Inlet BC
    for (let j = 0; j < mesh.nj; j++) {
      T_new[mesh.cellIndex(0, j)] = cfg.inletTempC;
    }

    // Compute residual
    let maxRes = 0;
    for (let k = 0; k < T.length; k++) {
      maxRes = Math.max(maxRes, Math.abs(T_new[k] - T[k]));
    }

    // Copy back
    for (let k = 0; k < T.length; k++) T[k] = T_new[k];

    T_convergence.push({ iteration: iter, residual: maxRes, tempResidual: maxRes });

    if (maxRes < tolerance) break;
  }

  // ─── Compute Parameters ───────────────────────────────────────────────

  // Bulk temperature at outlet
  let numerator = 0;
  let denominator = 0;
  for (let j = 0; j < mesh.nj; j++) {
    const ci = mesh.cellIndex(mesh.ni - 1, j);
    const r = mesh.cells[ci].centroid[1];
    const dr = mesh.dy[j];
    const uLocal = u[ci];
    numerator += WATER.rho * WATER.cp * uLocal * T[ci] * 2 * Math.PI * r * dr;
    denominator += WATER.rho * WATER.cp * uLocal * 2 * Math.PI * r * dr;
  }
  const T_bulk_outlet = numerator / denominator;

  // Min/Max temperature
  let minT = Infinity, maxT = -Infinity;
  for (let k = 0; k < T.length; k++) {
    minT = Math.min(minT, T[k]);
    maxT = Math.max(maxT, T[k]);
  }

  // Heat flux at wall (average)
  const heatFlux = cfg.hSun * (cfg.sunTempC - (cfg.inletTempC + T_bulk_outlet) / 2);

  // Total heat gain
  const totalHeat = WATER.rho * WATER.cp * Q * (T_bulk_outlet - cfg.inletTempC);

  // Nusselt number (Dittus-Boelter for turbulent, Sieder-Tate for laminar)
  let Nu: number;
  if (Re < 2300) {
    // Laminar: fully developed = 3.66 (constant wall temp) or 4.36 (constant heat flux)
    Nu = 3.66;
  } else {
    // Dittus-Boelter: Nu = 0.023 * Re^0.8 * Pr^0.4
    Nu = 0.023 * Math.pow(Re, 0.8) * Math.pow(WATER.Pr, 0.4);
  }

  // Pressure drop
  const pressureDrop = deltaP;

  return {
    u, v, p, T, mesh,
    params: {
      reynoldsNumber: Re,
      meanVelocity: Umean,
      bulkTempInlet: cfg.inletTempC,
      bulkTempOutlet: T_bulk_outlet,
      maxTemp: maxT,
      minTemp: minT,
      heatFlux,
      totalHeatGain: totalHeat,
      nusseltNumber: Nu,
      frictionFactor: f,
      pressureDrop,
    },
    convergence: T_convergence,
  };
}

/**
 * Extract centerline temperature profile
 */
export function extractCenterlineTemp(result: PipeFlowResult): { x: number; T: number; u: number }[] {
  const { mesh, T, u } = result;
  const j_mid = Math.floor(mesh.nj / 2);
  const profile: { x: number; T: number; u: number }[] = [];

  for (let i = 0; i < mesh.ni; i++) {
    const ci = mesh.cellIndex(i, j_mid);
    profile.push({
      x: mesh.cells[ci].centroid[0],
      T: T[ci],
      u: u[ci],
    });
  }
  return profile;
}

/**
 * Extract radial temperature profile at given axial position
 */
export function extractRadialProfile(result: PipeFlowResult, axialFraction: number): { r: number; T: number; u: number }[] {
  const { mesh, T, u } = result;
  const i = Math.floor(axialFraction * (mesh.ni - 1));
  const R = result.mesh.yNodes[mesh.nj];
  const profile: { r: number; T: number; u: number }[] = [];

  for (let j = 0; j < mesh.nj; j++) {
    const ci = mesh.cellIndex(i, j);
    profile.push({
      r: mesh.cells[ci].centroid[1] / R, // normalized radius
      T: T[ci],
      u: u[ci],
    });
  }
  return profile;
}

/**
 * Generate contour data for visualization (temperature or velocity)
 */
export function generateContourData(
  result: PipeFlowResult,
  field: "temperature" | "velocity" | "pressure",
  resolution: number = 50,
): { x: number; y: number; value: number }[] {
  const { mesh } = result;
  const data: { x: number; y: number; value: number }[] = [];

  const fieldData = field === "temperature" ? result.T
    : field === "velocity" ? result.u
    : result.p;

  const R = mesh.yNodes[mesh.nj];

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const xi = (i / (resolution - 1)) * mesh.ni;
      const yj = (j / (resolution - 1)) * mesh.nj;

      const i0 = Math.min(Math.floor(xi), mesh.ni - 2);
      const j0 = Math.min(Math.floor(yj), mesh.nj - 2);
      const fi = xi - i0;
      const fj = yj - j0;

      // Bilinear interpolation
      const v00 = fieldData[mesh.cellIndex(i0, j0)];
      const v10 = fieldData[mesh.cellIndex(i0 + 1, j0)];
      const v01 = fieldData[mesh.cellIndex(i0, j0 + 1)];
      const v11 = fieldData[mesh.cellIndex(i0 + 1, j0 + 1)];

      const value = v00 * (1 - fi) * (1 - fj) + v10 * fi * (1 - fj)
        + v01 * (1 - fi) * fj + v11 * fi * fj;

      data.push({
        x: (xi / mesh.ni) * mesh.xNodes[mesh.ni],
        y: (yj / mesh.nj) * R,
        value,
      });
    }
  }
  return data;
}

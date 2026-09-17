/**
 * Finite Volume Discretization
 * ───────────────────────────
 * Discrete differential operators on a structured 2D mesh
 * for incompressible Navier-Stokes equations.
 *
 * Operators:
 *   - Gradient (face-interpolated)
 *   - Divergence
 *   - Laplacian (diffusion)
 *   - Convection (upwind, central, blended)
 *   - Pressure gradient
 *   - Rhie-Chow interpolation (for collocated grids)
 *
 * Builds sparse linear systems ready for iterative solvers.
 *
 * Zero dependencies (beyond cfd/mesh.ts and cfd/linalg.ts).
 */

import type { Mesh2D, Face } from "./mesh";
import { buildSparseMatrix, type SparseMatrix } from "./linalg";

// ─── Field Storage ──────────────────────────────────────────────────────────

export interface ScalarField {
  /** Values at cell centers */
  cellValues: number[];
  /** Values at face centers (face interpolation) */
  faceValues: number[];
}

export interface VectorField {
  u: ScalarField;
  v: ScalarField;
}

// ─── 1. Face Interpolation ──────────────────────────────────────────────────

/**
 * Interpolate cell-centered values to face centers.
 * Uses linear interpolation: φ_face = g·φ_left + (1-g)·φ_right
 * where g = d_right / (d_left + d_right)
 */
export function interpolateToFaces(
  mesh: Mesh2D,
  cellValues: number[],
): number[] {
  const faceValues = new Array(mesh.nFaces).fill(0);

  for (let f = 0; f < mesh.nFaces; f++) {
    const face = mesh.faces[f];
    if (face.leftCell < 0) {
      // Boundary face: use right cell value (will be corrected by BCs)
      faceValues[f] = cellValues[face.rightCell];
    } else if (face.rightCell < 0) {
      // Boundary face: use left cell value
      faceValues[f] = cellValues[face.leftCell];
    } else {
      // Internal face: linear interpolation
      const cL = mesh.cells[face.leftCell].centroid;
      const cR = mesh.cells[face.rightCell].centroid;
      const dLeft = Math.sqrt(
        (face.centroid[0] - cL[0]) ** 2 + (face.centroid[1] - cL[1]) ** 2,
      );
      const dRight = Math.sqrt(
        (cR[0] - face.centroid[0]) ** 2 + (cR[1] - face.centroid[1]) ** 2,
      );
      const total = dLeft + dRight;
      const g = total > 0 ? dRight / total : 0.5;
      faceValues[f] = g * cellValues[face.leftCell] + (1 - g) * cellValues[face.rightCell];
    }
  }

  return faceValues;
}

// ─── 2. Apply Boundary Conditions to Face Values ────────────────────────────

export function applyBC(
  mesh: Mesh2D,
  field: ScalarField,
  varName: "u" | "v" | "p",
): void {
  for (const bc of mesh.boundaryConditions) {
    let value = 0;
    if (varName === "u") value = bc.u ?? 0;
    else if (varName === "v") value = bc.v ?? 0;
    else if (varName === "p") value = bc.p ?? bc.pValue ?? 0;

    for (const f of bc.faceIndices) {
      const face = mesh.faces[f];
      if (bc.type === "wall" || bc.type === "inlet") {
        // Dirichlet: face value = prescribed
        field.faceValues[f] = value;
      } else if (bc.type === "outlet") {
        // Neumann: zero gradient (face value = nearest cell)
        const cell = face.leftCell >= 0 ? face.leftCell : face.rightCell;
        if (cell >= 0) field.faceValues[f] = field.cellValues[cell];
      }
    }
  }
}

/** Build a ScalarField with zeros */
export function zerosField(mesh: Mesh2D): ScalarField {
  return {
    cellValues: new Array(mesh.nCells).fill(0),
    faceValues: new Array(mesh.nFaces).fill(0),
  };
}

// ─── 3. Divergence Operator (∇·) ───────────────────────────────────────────

/**
 * Compute divergence of a velocity field.
 * (div u)_P = Σ_f (u_f · n_f) * A_f / V_P
 */
export function computeDivergence(
  mesh: Mesh2D,
  uFace: number[],
  vFace: number[],
): number[] {
  const div = new Array(mesh.nCells).fill(0);

  for (let f = 0; f < mesh.nFaces; f++) {
    const face = mesh.faces[f];
    const flux = uFace[f] * face.normal[0] + vFace[f] * face.normal[1];
    const contribution = flux * face.area;

    if (face.leftCell >= 0) div[face.leftCell] += contribution;
    if (face.rightCell >= 0) div[face.rightCell] -= contribution;
  }

  // Divide by cell volume
  for (let i = 0; i < mesh.nCells; i++) {
    div[i] /= mesh.cells[i].volume;
  }

  return div;
}

// ─── 4. Laplacian of Scalar (Diffusion) ────────────────────────────────────

/**
 * Build the Laplacian matrix: (Γ/δ) * A_f for diffusion term.
 * ∇·(Γ∇φ) discretized using central differences.
 *
 * Returns sparse matrix A such that A*φ = b gives the discrete Laplacian.
 */
export function buildLaplacianMatrix(
  mesh: Mesh2D,
  gamma: number, // diffusion coefficient
): SparseMatrix {
  const triplets: Array<{ i: number; j: number; val: number }> = [];

  for (let f = 0; f < mesh.nFaces; f++) {
    const face = mesh.faces[f];
    if (face.leftCell < 0 || face.rightCell < 0) continue; // skip boundary faces for now

    const cL = mesh.cells[face.leftCell].centroid;
    const cR = mesh.cells[face.rightCell].centroid;
    const d = Math.sqrt((cR[0] - cL[0]) ** 2 + (cR[1] - cL[1]) ** 2);
    const coeff = (gamma * face.area) / d;

    // LHS contributions
    triplets.push({ i: face.leftCell, j: face.leftCell, val: coeff });
    triplets.push({ i: face.leftCell, j: face.rightCell, val: -coeff });
    triplets.push({ i: face.rightCell, j: face.rightCell, val: coeff });
    triplets.push({ i: face.rightCell, j: face.leftCell, val: -coeff });
  }

  return buildSparseMatrix(mesh.nCells, triplets);
}

// ─── 5. Pressure Poisson Equation ──────────────────────────────────────────

/**
 * Build the pressure Poisson equation matrix for SIMPLE algorithm.
 * ∇²p = (ρ/Δt) * (∇·u*)
 *
 * Neumann BC on walls/outlet, Dirichlet on one outlet cell for reference.
 */
export function buildPressurePoissonMatrix(
  mesh: Mesh2D,
): SparseMatrix {
  const triplets: Array<{ i: number; j: number; val: number }> = [];

  for (let f = 0; f < mesh.nFaces; f++) {
    const face = mesh.faces[f];

    if (face.leftCell >= 0 && face.rightCell >= 0) {
      // Internal face
      const cL = mesh.cells[face.leftCell].centroid;
      const cR = mesh.cells[face.rightCell].centroid;
      const d = Math.sqrt((cR[0] - cL[0]) ** 2 + (cR[1] - cL[1]) ** 2);
      const coeff = face.area / d;

      triplets.push({ i: face.leftCell, j: face.leftCell, val: coeff });
      triplets.push({ i: face.leftCell, j: face.rightCell, val: -coeff });
      triplets.push({ i: face.rightCell, j: face.rightCell, val: coeff });
      triplets.push({ i: face.rightCell, j: face.leftCell, val: -coeff });
    } else {
      // Boundary face: Neumann BC (∂p/∂n = 0)
      const cell = face.leftCell >= 0 ? face.leftCell : face.rightCell;
      if (cell >= 0) {
        // For outlet BC with prescribed pressure, add Dirichlet
        const bcIdx = face.bcIndex;
        if (bcIdx >= 0 && mesh.boundaryConditions[bcIdx].type === "outlet") {
          // This cell has fixed pressure (reference pressure node)
          triplets.push({ i: cell, j: cell, val: 1e6 }); // large value to enforce
        }
      }
    }
  }

  return buildSparseMatrix(mesh.nCells, triplets);
}

// ─── 6. Velocity Correction Equation ───────────────────────────────────────

/**
 * Build the velocity correction coefficients from pressure correction.
 * u' = u* - (Δt/ρ) * (∇p')
 *
 * Returns d_f coefficients for face velocity correction.
 */
export function buildVelocityCorrectionCoeffs(
  mesh: Mesh2D,
  rho: number,
  dt: number,
): number[] {
  const d = new Array(mesh.nFaces).fill(0);

  for (let f = 0; f < mesh.nFaces; f++) {
    const face = mesh.faces[f];
    if (face.leftCell < 0 || face.rightCell < 0) continue;

    const cL = mesh.cells[face.leftCell].centroid;
    const cR = mesh.cells[face.rightCell].centroid;
    const dist = Math.sqrt((cR[0] - cL[0]) ** 2 + (cR[1] - cL[1]) ** 2);

    d[f] = face.area * dt / (rho * dist);
  }

  return d;
}

// ─── 7. Convection Schemes ──────────────────────────────────────────────────

/** Upwind interpolation coefficient (Bett & Spalding) */
function upwindCoeff(
  flux: number,
  phiL: number,
  phiR: number,
): number {
  return flux >= 0 ? phiL : phiR;
}

/** Central interpolation */
function centralCoeff(phiL: number, phiR: number): number {
  return 0.5 * (phiL + phiR);
}

/** Blended interpolation (0 = pure upwind, 1 = pure central) */
function blendedCoeff(
  blend: number,
  flux: number,
  phiL: number,
  phiR: number,
): number {
  const u = upwindCoeff(flux, phiL, phiR);
  const c = centralCoeff(phiL, phiR);
  return (1 - blend) * u + blend * c;
}

/**
 * Build the convection matrix using the specified scheme.
 * Discretizes: ∇·(ρuφ)
 */
export function buildConvectionMatrix(
  mesh: Mesh2D,
  uFace: number[],
  vFace: number[],
  rho: number,
  scheme: "upwind" | "central" | "blended" = "upwind",
  blendFactor = 0.1,
): SparseMatrix {
  const triplets: Array<{ i: number; j: number; val: number }> = [];

  for (let f = 0; f < mesh.nFaces; f++) {
    const face = mesh.faces[f];
    if (face.leftCell < 0 || face.rightCell < 0) continue;

    const flux = rho * (uFace[f] * face.normal[0] + vFace[f] * face.normal[1]) * face.area;

    // Assemble into matrix: flux > 0 means flow left→right
    if (flux >= 0) {
      triplets.push({ i: face.leftCell, j: face.leftCell, val: flux });
      if (scheme === "central" || scheme === "blended") {
        triplets.push({ i: face.leftCell, j: face.rightCell, val: 0 });
      }
    } else {
      triplets.push({ i: face.rightCell, j: face.rightCell, val: -flux });
    }
  }

  return buildSparseMatrix(mesh.nCells, triplets);
}

// ─── 8. Rhie-Chow Interpolation ────────────────────────────────────────────

/**
 * Rhie-Chow interpolation for collocated grids.
 * Prevents checkerboard pressure oscillations by adding a pressure-based
 * correction to face velocities.
 *
 * u_f = u̅_f - d_f * (∂p/∂n)_f
 */
export function rhieChowInterpolation(
  mesh: Mesh2D,
  uCell: number[],
  vCell: number[],
  pCell: number[],
  dCoeffs: number[],
): { uFace: number[]; vFace: number[] } {
  const uFace = interpolateToFaces(mesh, uCell);
  const vFace = interpolateToFaces(mesh, vCell);

  for (let f = 0; f < mesh.nFaces; f++) {
    const face = mesh.faces[f];
    if (face.leftCell < 0 || face.rightCell < 0) continue;

    // Pressure gradient at face
    const dpdn = (pCell[face.rightCell] - pCell[face.leftCell]) /
      Math.sqrt(
        (mesh.cells[face.rightCell].centroid[0] - mesh.cells[face.leftCell].centroid[0]) ** 2 +
        (mesh.cells[face.rightCell].centroid[1] - mesh.cells[face.leftCell].centroid[1]) ** 2,
      );

    // Rhie-Chow correction
    uFace[f] -= dCoeffs[f] * dpdn * face.normal[0];
    vFace[f] -= dCoeffs[f] * dpdn * face.normal[1];
  }

  return { uFace, vFace };
}

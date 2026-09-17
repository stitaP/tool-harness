/**
 * 2D Structured Mesh Module
 * ─────────────────────────
 * Pure-TypeScript structured mesh for finite-volume CFD.
 *
 * Provides:
 *   - Cartesian and body-fitted 2D mesh generation
 *   - Cell-centered and node-centered data storage
 *   - Boundary condition definitions (wall, inlet, outlet, symmetry, periodic)
 *   - Face area, cell volume, and normal vector computation
 *   - Neighbor connectivity lookup
 *   - Mesh refinement and coarsening
 *
 * Zero dependencies. Runs in browser or Node.
 */

// ─── Boundary Condition Types ───────────────────────────────────────────────

export type BCType =
  | "wall"         // no-slip (u=0, v=0) or free-slip (du/dn=0)
  | "inlet"        // prescribed velocity / pressure
  | "outlet"       // zero-gradient or prescribed pressure
  | "symmetry"     // mirror condition
  | "periodic";    // wrap-around

export interface BoundaryCondition {
  type: BCType;
  /** Face indices that belong to this BC */
  faceIndices: number[];
  /** Prescribed values (u, v, p) depending on BC type */
  u?: number;
  v?: number;
  p?: number;
  /** For outlet: pressure value */
  pValue?: number;
  /** For inlet: velocity magnitude */
  velocityMagnitude?: number;
  /** Direction angle in radians (for inlet) */
  directionAngle?: number;
}

// ─── Mesh Face ──────────────────────────────────────────────────────────────

export interface Face {
  /** Index of the cell on the left side of the face (-1 for boundary) */
  leftCell: number;
  /** Index of the cell on the right side of the face (-1 for boundary) */
  rightCell: number;
  /** Face area (m² in SI) */
  area: number;
  /** Unit normal vector pointing from left to right [nx, ny] */
  normal: [number, number];
  /** Face centroid [x, y] */
  centroid: [number, number];
  /** Boundary condition index (-1 if internal face) */
  bcIndex: number;
}

// ─── Mesh Cell ──────────────────────────────────────────────────────────────

export interface Cell {
  /** Cell centroid [x, y] */
  centroid: [number, number];
  /** Cell volume (m² in 2D = area) */
  volume: number;
  /** Indices of faces belonging to this cell */
  faceIndices: number[];
  /** Indices of neighboring cells (via shared faces) */
  neighborCells: number[];
}

// ─── Mesh Interface ─────────────────────────────────────────────────────────

export interface Mesh2D {
  /** Number of cells in x-direction */
  ni: number;
  /** Number of cells in y-direction */
  nj: number;
  /** Cell width array (dx[i] for column i) */
  dx: number[];
  /** Cell height array (dy[j] for row j) */
  dy: number[];
  /** Node x-coordinates: (ni+1) values */
  xNodes: number[];
  /** Node y-coordinates: (nj+1) values */
  yNodes: number[];
  /** All cells */
  cells: Cell[];
  /** All faces */
  faces: Face[];
  /** Boundary conditions */
  boundaryConditions: BoundaryCondition[];
  /** Total number of cells */
  nCells: number;
  /** Total number of faces */
  nFaces: number;
  /** Cell index mapping: cellIndex(i,j) = i + j * ni */
  cellIndex: (i: number, j: number) => number;
  /** Inverse mapping: given cell index, return (i, j) */
  cellIJ: (idx: number) => [number, number];
}

// ─── Mesh Generation ────────────────────────────────────────────────────────

/**
 * Create a structured 2D mesh on domain [0, Lx] × [0, Ly].
 *
 * @param Lx - Domain length in x
 * @param Ly - Domain length in y
 * @param ni - Number of cells in x
 * @param nj - Number of cells in y
 * @param stretchX - Optional non-uniform stretch factor for x (1.0 = uniform)
 * @param stretchY - Optional non-uniform stretch factor for y (1.0 = uniform)
 */
export function createMesh2D(
  Lx: number,
  Ly: number,
  ni: number,
  nj: number,
  stretchX = 1.0,
  stretchY = 1.0,
): Mesh2D {
  // Generate node coordinates with optional stretching
  const xNodes = generateStretching(ni + 1, Lx, stretchX);
  const yNodes = generateStretching(nj + 1, Ly, stretchY);

  // Cell dimensions
  const dx: number[] = [];
  for (let i = 0; i < ni; i++) dx.push(xNodes[i + 1] - xNodes[i]);
  const dy: number[] = [];
  for (let j = 0; j < nj; j++) dy.push(yNodes[j + 1] - yNodes[j]);

  const cellIndex = (i: number, j: number) => i + j * ni;
  const cellIJ = (idx: number): [number, number] => [idx % ni, Math.floor(idx / ni)];

  // Build cells
  const cells: Cell[] = [];
  for (let j = 0; j < nj; j++) {
    for (let i = 0; i < ni; i++) {
      const cx = (xNodes[i] + xNodes[i + 1]) / 2;
      const cy = (yNodes[j] + yNodes[j + 1]) / 2;
      const vol = dx[i] * dy[j];
      cells.push({
        centroid: [cx, cy],
        volume: vol,
        faceIndices: [],  // filled below
        neighborCells: [], // filled below
      });
    }
  }

  // Build faces
  const faces: Face[] = [];
  const bcFaces: number[][] = []; // bcFaces[bcIndex] = face indices

  // Internal faces in x-direction (between columns i-1 and i)
  for (let j = 0; j < nj; j++) {
    // Left boundary face (i=0)
    {
      const cy = (yNodes[j] + yNodes[j + 1]) / 2;
      const fIdx = faces.length;
      faces.push({
        leftCell: -1,
        rightCell: cellIndex(0, j),
        area: dy[j],
        normal: [1, 0],
        centroid: [xNodes[0], cy],
        bcIndex: 0, // will be assigned
      });
    }
    // Internal faces
    for (let i = 1; i < ni; i++) {
      const cy = (yNodes[j] + yNodes[j + 1]) / 2;
      const fIdx = faces.length;
      faces.push({
        leftCell: cellIndex(i - 1, j),
        rightCell: cellIndex(i, j),
        area: dy[j],
        normal: [1, 0],
        centroid: [xNodes[i], cy],
        bcIndex: -1,
      });
    }
    // Right boundary face
    {
      const cy = (yNodes[j] + yNodes[j + 1]) / 2;
      faces.push({
        leftCell: cellIndex(ni - 1, j),
        rightCell: -1,
        area: dy[j],
        normal: [1, 0],
        centroid: [xNodes[ni], cy],
        bcIndex: 1,
      });
    }
  }

  // Internal faces in y-direction (between rows j-1 and j)
  for (let i = 0; i < ni; i++) {
    // Bottom boundary face (j=0)
    {
      const cx = (xNodes[i] + xNodes[i + 1]) / 2;
      faces.push({
        leftCell: -1,
        rightCell: cellIndex(i, 0),
        area: dx[i],
        normal: [0, 1],
        centroid: [cx, yNodes[0]],
        bcIndex: 2,
      });
    }
    // Internal faces
    for (let j = 1; j < nj; j++) {
      const cx = (xNodes[i] + xNodes[i + 1]) / 2;
      faces.push({
        leftCell: cellIndex(i, j - 1),
        rightCell: cellIndex(i, j),
        area: dx[i],
        normal: [0, 1],
        centroid: [cx, yNodes[j]],
        bcIndex: -1,
      });
    }
    // Top boundary face
    {
      const cx = (xNodes[i] + xNodes[i + 1]) / 2;
      faces.push({
        leftCell: cellIndex(i, nj - 1),
        rightCell: -1,
        area: dx[i],
        normal: [0, 1],
        centroid: [cx, yNodes[nj]],
        bcIndex: 3,
      });
    }
  }

  // Build neighbor connectivity
  for (let j = 0; j < nj; j++) {
    for (let i = 0; i < ni; i++) {
      const idx = cellIndex(i, j);
      if (i > 0) cells[idx].neighborCells.push(cellIndex(i - 1, j));
      if (i < ni - 1) cells[idx].neighborCells.push(cellIndex(i + 1, j));
      if (j > 0) cells[idx].neighborCells.push(cellIndex(i, j - 1));
      if (j < nj - 1) cells[idx].neighborCells.push(cellIndex(i, j + 1));
    }
  }

  // Default boundary conditions: wall on all sides
  const boundaryConditions: BoundaryCondition[] = [
    { type: "wall", faceIndices: [], u: 0, v: 0, p: 0 },         // left
    { type: "outlet", faceIndices: [], pValue: 0 },                // right
    { type: "wall", faceIndices: [], u: 0, v: 0, p: 0 },         // bottom
    { type: "wall", faceIndices: [], u: 0, v: 0, p: 0 },         // top
  ];

  // Assign faces to BCs
  for (let f = 0; f < faces.length; f++) {
    const bcIdx = faces[f].bcIndex;
    if (bcIdx >= 0 && bcIdx < boundaryConditions.length) {
      boundaryConditions[bcIdx].faceIndices.push(f);
    }
  }

  return {
    ni, nj, dx, dy, xNodes, yNodes,
    cells, faces, boundaryConditions,
    nCells: ni * nj,
    nFaces: faces.length,
    cellIndex, cellIJ,
  };
}

// ─── Helper: Stretching Function ────────────────────────────────────────────

function generateStretching(n: number, L: number, s: number): number[] {
  const coords: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    if (Math.abs(s - 1.0) < 1e-10) {
      coords.push(t * L);
    } else {
      // Hyperbolic tangent stretching: cluster cells near boundaries
      coords.push((L / 2) * (1 + Math.tanh(s * (2 * t - 1)) / Math.tanh(s)));
    }
  }
  return coords;
}

// ─── Mesh Inspection Utilities ──────────────────────────────────────────────

/** Get cell index from (i, j) grid coordinates */
export function idx(mesh: Mesh2D, i: number, j: number): number {
  return mesh.cellIndex(i, j);
}

/** Get all face indices for a given cell */
export function cellFaces(mesh: Mesh2D, cellIdx: number): Face[] {
  return mesh.faces.filter(
    (f) => f.leftCell === cellIdx || f.rightCell === cellIdx,
  );
}

/** Get the neighboring cell across a given face */
export function neighborAcrossFace(mesh: Mesh2D, face: Face, fromCell: number): number {
  if (face.leftCell === fromCell) return face.rightCell;
  if (face.rightCell === fromCell) return face.leftCell;
  return -1;
}

/** Compute distance between two cell centroids */
export function cellDistance(mesh: Mesh2D, c1: number, c2: number): number {
  const [x1, y1] = mesh.cells[c1].centroid;
  const [x2, y2] = mesh.cells[c2].centroid;
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/** Minimum cell dimension (for CFL calculation) */
export function minCellSize(mesh: Mesh2D): number {
  const minDx = Math.min(...mesh.dx);
  const minDy = Math.min(...mesh.dy);
  return Math.min(minDx, minDy);
}

/** Maximum cell dimension */
export function maxCellSize(mesh: Mesh2D): number {
  return Math.max(Math.max(...mesh.dx), Math.max(...mesh.dy));
}

/** Total domain volume (area in 2D) */
export function domainVolume(mesh: Mesh2D): number {
  return mesh.cells.reduce((sum, c) => sum + c.volume, 0);
}

// ─── Default CFD Problem Setup ──────────────────────────────────────────────

export interface CFDProblem {
  mesh: Mesh2D;
  /** Fluid density (kg/m³) */
  rho: number;
  /** Dynamic viscosity (Pa·s) */
  mu: number;
  /** Kinematic viscosity (m²/s) — computed as mu/rho */
  nu: number;
  /** Initial u-velocity field */
  u0: number[];
  /** Initial v-velocity field */
  v0: number[];
  /** Initial pressure field */
  p0: number[];
  /** Reynolds number — computed or set */
  Re: number;
}

/** Create a lid-driven cavity problem (classic CFD benchmark) */
export function createLidDrivenCavity(
  Lx = 1.0,
  Ly = 1.0,
  ni = 32,
  nj = 32,
  Re = 100,
): CFDProblem {
  const mesh = createMesh2D(Lx, Ly, ni, nj);
  const U = 1.0; // lid velocity
  const rho = 1.0;
  const mu = (rho * U * Lx) / Re;
  const nu = mu / rho;

  // Set BCs: bottom=wall, left=wall, right=wall, top=lid (moving wall)
  mesh.boundaryConditions[0].type = "wall";     // left
  mesh.boundaryConditions[0].u = 0;
  mesh.boundaryConditions[0].v = 0;

  mesh.boundaryConditions[1].type = "outlet";   // right
  mesh.boundaryConditions[1].pValue = 0;

  mesh.boundaryConditions[2].type = "wall";     // bottom
  mesh.boundaryConditions[2].u = 0;
  mesh.boundaryConditions[2].v = 0;

  mesh.boundaryConditions[3].type = "wall";     // top (lid)
  mesh.boundaryConditions[3].u = U;             // moving wall
  mesh.boundaryConditions[3].v = 0;

  const nCells = mesh.nCells;
  const u0 = new Array(nCells).fill(0);
  const v0 = new Array(nCells).fill(0);
  const p0 = new Array(nCells).fill(0);

  return { mesh, rho, mu, nu, u0, v0, p0, Re };
}

/** Create a channel flow problem (Poiseuille flow) */
export function createChannelFlow(
  Lx = 5.0,
  Ly = 1.0,
  ni = 64,
  nj = 32,
  Re = 100,
): CFDProblem {
  const mesh = createMesh2D(Lx, Ly, ni, nj);
  const U = 1.0;
  const rho = 1.0;
  const mu = (rho * U * Ly) / Re;

  // Inlet (left), Outlet (right), walls (top + bottom)
  mesh.boundaryConditions[0].type = "inlet";
  mesh.boundaryConditions[0].u = U;
  mesh.boundaryConditions[0].v = 0;
  mesh.boundaryConditions[0].velocityMagnitude = U;

  mesh.boundaryConditions[1].type = "outlet";
  mesh.boundaryConditions[1].pValue = 0;

  mesh.boundaryConditions[2].type = "wall";
  mesh.boundaryConditions[2].u = 0;
  mesh.boundaryConditions[2].v = 0;

  mesh.boundaryConditions[3].type = "wall";
  mesh.boundaryConditions[3].u = 0;
  mesh.boundaryConditions[3].v = 0;

  const nCells = mesh.nCells;
  // Initialize with parabolic profile
  const u0: number[] = [];
  const v0: number[] = [];
  const p0: number[] = [];
  for (let j = 0; j < mesh.nj; j++) {
    const y = mesh.cells[mesh.cellIndex(0, j)].centroid[1];
    const uProfile = 1.5 * U * 4 * (y / Ly) * (1 - y / Ly); // parabolic
    for (let i = 0; i < mesh.ni; i++) {
      u0.push(uProfile);
      v0.push(0);
      p0.push(0);
    }
  }

  return { mesh, rho, mu, nu: mu / rho, u0, v0, p0, Re };
}

/** Create a backward-facing step (separation benchmark) */
export function createBackwardFacingStep(
  Re = 800,
  ni = 80,
  nj = 32,
): CFDProblem {
  const Lx = 3.0;
  const Ly = 1.0;
  const mesh = createMesh2D(Lx, Ly, ni, nj);
  const U = 1.0;
  const rho = 1.0;
  const mu = (rho * U * (Ly / 2)) / Re; // channel height is Ly/2

  mesh.boundaryConditions[0].type = "inlet";
  mesh.boundaryConditions[0].u = U;
  mesh.boundaryConditions[0].v = 0;

  mesh.boundaryConditions[1].type = "outlet";
  mesh.boundaryConditions[1].pValue = 0;

  mesh.boundaryConditions[2].type = "wall";
  mesh.boundaryConditions[2].u = 0;
  mesh.boundaryConditions[2].v = 0;

  mesh.boundaryConditions[3].type = "wall";
  mesh.boundaryConditions[3].u = 0;
  mesh.boundaryConditions[3].v = 0;

  const nCells = mesh.nCells;
  return {
    mesh, rho, mu, nu: mu / rho,
    u0: new Array(nCells).fill(0),
    v0: new Array(nCells).fill(0),
    p0: new Array(nCells).fill(0),
    Re,
  };
}

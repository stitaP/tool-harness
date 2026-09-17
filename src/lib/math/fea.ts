/**
 * Finite Element Analysis Engine
 * ──────────────────────────────
 * 1D truss & Euler-Bernoulli beam elements, 2D CST (constant strain triangle)
 * and Q4 (bilinear quad) plane-stress/plane-strain elements.
 *
 * Full pipeline: element stiffness → assembly → BCs → solve → post-process.
 * Zero dependencies. Runs in browser or Node.
 */

import type { Mat, Vec } from "./sparse";
import {
  matMul, matTranspose, matVecMul, matIdentity, matAdd, matScale,
  vecDot, vecNorm, vecAdd, vecSub, vecScale,
  solveDense, choleskyDecompose, choleskySolve,
} from "./sparse";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Material {
  E: number;       // Young's modulus (Pa)
  nu: number;      // Poisson's ratio
  rho?: number;    // density (kg/m³)
  G?: number;      // shear modulus (auto-computed if not provided)
  yieldStress?: number;
}

export function shearModulus(m: Material): number {
  return m.G ?? m.E / (2 * (1 + m.nu));
}

export interface Node {
  id: number;
  x: number;
  y: number;
  z?: number;
  dofPerNode: number; // 2 for truss/CST, 3 for beam (w, θ), 6 for 3D
}

export type ElementType = "truss" | "beam" | "cst" | "q4";

export interface Element {
  id: number;
  type: ElementType;
  nodeIds: number[];
  material: Material;
  thickness?: number;     // for 2D elements (plane stress/strain)
  area?: number;          // for truss/beam cross-section
  I?: number;             // second moment of area (beam)
}

export type BCType = "displacement" | "force" | "moment";

export interface BoundaryCondition {
  nodeId: number;
  dof: number;        // 0-based DOF index
  type: BCType;
  value: number;
}

export interface FEAMesh {
  nodes: Node[];
  elements: Element[];
  nDOF: number;
}

export interface FEAResult {
  displacements: Vec;
  reactions: Vec;
  elementStresses: Array<{
    elementId: number;
    stress: Vec;
    strain: Vec;
    vonMises?: number;
  }>;
  elementForces: Array<{
    elementId: number;
    force: Vec;
  }>;
  maxDisplacement: number;
  maxStress: number;
  converged: boolean;
}

// ─── 2D Plane Stress/Strain Constitutive Matrix ─────────────────────────────

export function planeStressMatrix(m: Material): Mat {
  const f = m.E / (1 - m.nu * m.nu);
  return [
    [f, f * m.nu, 0],
    [f * m.nu, f, 0],
    [0, 0, f * (1 - m.nu) / 2],
  ];
}

export function planeStrainMatrix(m: Material): Mat {
  const f = m.E / ((1 + m.nu) * (1 - 2 * m.nu));
  return [
    [f * (1 - m.nu), f * m.nu, 0],
    [f * m.nu, f * (1 - m.nu), 0],
    [0, 0, f * (1 - 2 * m.nu) / 2],
  ];
}

// ─── Truss Element (2D) ─────────────────────────────────────────────────────

export function trussElementStiffness(
  nodes: Node[],
  elem: Element,
): { Ke: Mat; T: Mat } {
  const [n1, n2] = elem.nodeIds;
  const node1 = nodes.find((n) => n.id === n1)!;
  const node2 = nodes.find((n) => n.id === n2)!;

  const dx = node2.x - node1.x;
  const dy = node2.y - node1.y;
  const L = Math.sqrt(dx * dx + dy * dy);
  const A = elem.area ?? 1.0;
  const E = elem.material.E;

  const c = dx / L;
  const s = dy / L;

  const k = (E * A) / L;

  // Local stiffness in global coordinates
  const Ke: Mat = [
    [c * c, c * s, -c * c, -c * s],
    [c * s, s * s, -c * s, -s * s],
    [-c * c, -c * s, c * c, c * s],
    [-c * s, -s * s, c * s, s * s],
  ].map((row) => row.map((v) => v * k));

  // Transformation matrix
  const T: Mat = [
    [c, s, 0, 0],
    [0, 0, c, s],
  ];

  return { Ke, T };
}

// ─── Euler-Bernoulli Beam Element (2D) ──────────────────────────────────────

export function beamElementStiffness(
  nodes: Node[],
  elem: Element,
): Mat {
  const [n1, n2] = elem.nodeIds;
  const node1 = nodes.find((n) => n.id === n1)!;
  const node2 = nodes.find((n) => n.id === n2)!;

  const dx = node2.x - node1.x;
  const dy = node2.y - node1.y;
  const L = Math.sqrt(dx * dx + dy * dy);
  const E = elem.material.E;
  const A = elem.area ?? 1.0;
  const I = elem.I ?? (A * A / (4 * Math.PI));

  const EA_L = E * A / L;
  const EI = E * I;
  const EI_L3 = EI / (L * L * L);
  const EI_L = EI / L;
  const EI_L2 = EI / (L * L);

  // Local stiffness (2-node, 3 DOF each: u, v, θ)
  const kl: Mat = [
    [ EA_L,       0,          0,      -EA_L,       0,          0      ],
    [ 0,          12*EI_L3,   6*EI_L2, 0,        -12*EI_L3,   6*EI_L2 ],
    [ 0,          6*EI_L2,    4*EI_L,  0,         -6*EI_L2,    2*EI_L  ],
    [-EA_L,       0,          0,       EA_L,       0,          0      ],
    [ 0,         -12*EI_L3,  -6*EI_L2, 0,         12*EI_L3,  -6*EI_L2 ],
    [ 0,          6*EI_L2,    2*EI_L,  0,         -6*EI_L2,    4*EI_L  ],
  ];

  // Rotation to global coordinates
  const c = dx / L, s = dy / L;
  const R: Mat = [
    [c, s, 0, 0, 0, 0],
    [-s, c, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, c, s, 0],
    [0, 0, 0, -s, c, 0],
    [0, 0, 0, 0, 0, 1],
  ];

  const Rt = matTranspose(R);
  return matMul(matMul(Rt, kl), R);
}

// ─── CST Triangle Element (2D plane stress/strain) ──────────────────────────

export function cstElementStiffness(
  nodes: Node[],
  elem: Element,
  planeStress = true,
): Mat {
  const [n1, n2, n3] = elem.nodeIds;
  const p1 = nodes.find((n) => n.id === n1)!;
  const p2 = nodes.find((n) => n.id === n2)!;
  const p3 = nodes.find((n) => n.id === n3)!;

  // Area
  const A2 = (p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y);
  const A = Math.abs(A2) / 2;
  if (A < 1e-15) throw new Error(`Degenerate triangle element ${elem.id}`);

  // B-matrix (strain-displacement)
  const b1 = p2.y - p3.y, b2 = p3.y - p1.y, b3 = p1.y - p2.y;
  const c1 = p3.x - p2.x, c2 = p1.x - p3.x, c3 = p2.x - p1.x;

  const t = elem.thickness ?? 1.0;
  const D = planeStress ? planeStressMatrix(elem.material) : planeStrainMatrix(elem.material);

  // B = (1/2A) * [b1 0  b2 0  b3 0;  0 c1 0  c2 0  c3;  c1 b1 c2 b2 c3 b3]
  const B: Mat = [
    [b1, 0, b2, 0, b3, 0],
    [0, c1, 0, c2, 0, c3],
    [c1, b1, c2, b2, c3, b3],
  ].map((row) => row.map((v) => v / (2 * A)));

  // Ke = t * A * B^T D B
  const BtD = matMul(matTranspose(B), D);
  const Ke = matScale(matMul(BtD, B), t * A);

  return Ke;
}

// ─── Q4 Bilinear Quad Element (2D plane stress/strain) ──────────────────────

export function q4ElementStiffness(
  nodes: Node[],
  elem: Element,
  planeStress = true,
  nGP = 2, // Gauss points per direction
): Mat {
  const [n1, n2, n3, n4] = elem.nodeIds;
  const corners = [n1, n2, n3, n4].map((id) => nodes.find((n) => n.id === id)!);
  const t = elem.thickness ?? 1.0;
  const D = planeStress ? planeStressMatrix(elem.material) : planeStrainMatrix(elem.material);

  // Gauss points and weights (1D)
  const gp1 = nGP === 1 ? [{ xi: 0, w: 2 }] :
    [{ xi: -1 / Math.sqrt(3), w: 1 }, { xi: 1 / Math.sqrt(3), w: 1 }];

  const Ke: Mat = Array.from({ length: 8 }, () => new Array(8).fill(0));

  for (const gpI of gp1) {
    for (const gpJ of gp1) {
      const xi = gpI.xi, eta = gpJ.xi;

      // Shape function derivatives
      const dN = [
        [-(1 - eta) / 4, (1 - eta) / 4, (1 + eta) / 4, -(1 + eta) / 4],
        [-(1 - xi) / 4, -(1 + xi) / 4, (1 + xi) / 4, (1 - xi) / 4],
      ];

      // Jacobian
      const J: Mat = [[0, 0], [0, 0]];
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          for (let k = 0; k < 4; k++) {
            J[i][j] += dN[i][k] * corners[k][j === 0 ? "x" : "y"];
          }
        }
      }

      const detJ = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      if (Math.abs(detJ) < 1e-15) continue;

      // B-matrix (6×8)
      const invJ: Mat = [
        [J[1][1] / detJ, -J[0][1] / detJ],
        [-J[1][0] / detJ, J[0][0] / detJ],
      ];

      const B: Mat = Array.from({ length: 3 }, () => new Array(8).fill(0));
      for (let k = 0; k < 4; k++) {
        const dNdx = invJ[0][0] * dN[0][k] + invJ[0][1] * dN[1][k];
        const dNdy = invJ[1][0] * dN[0][k] + invJ[1][1] * dN[1][k];
        B[0][2 * k] = dNdx;
        B[1][2 * k + 1] = dNdy;
        B[2][2 * k] = dNdy;
        B[2][2 * k + 1] = dNdx;
      }

      // Ke += t * detJ * B^T D B * wI * wJ
      const BtD = matMul(matTranspose(B), D);
      const Klocal = matScale(matMul(BtD, B), t * detJ * gpI.w * gpJ.w);

      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          Ke[i][j] += Klocal[i][j];
        }
      }
    }
  }

  return Ke;
}

// ─── Global Assembly ─────────────────────────────────────────────────────────

export function assembleGlobal(
  mesh: FEAMesh,
  planeStress = true,
): Mat {
  const n = mesh.nDOF;
  const K: Mat = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const elem of mesh.elements) {
    let Ke: Mat;
    let dofs: number[];

    switch (elem.type) {
      case "truss": {
        const { Ke: ke } = trussElementStiffness(mesh.nodes, elem);
        Ke = ke;
        dofs = elem.nodeIds.flatMap((id) => {
          const node = mesh.nodes.find((n) => n.id === id)!;
          const base = id * 2;
          return [base, base + 1];
        });
        break;
      }
      case "beam": {
        Ke = beamElementStiffness(mesh.nodes, elem);
        dofs = elem.nodeIds.flatMap((id) => {
          const base = id * 3;
          return [base, base + 1, base + 2];
        });
        break;
      }
      case "cst": {
        Ke = cstElementStiffness(mesh.nodes, elem, planeStress);
        dofs = elem.nodeIds.flatMap((id) => {
          const base = id * 2;
          return [base, base + 1];
        });
        break;
      }
      case "q4": {
        Ke = q4ElementStiffness(mesh.nodes, elem, planeStress);
        dofs = elem.nodeIds.flatMap((id) => {
          const base = id * 2;
          return [base, base + 1];
        });
        break;
      }
    }

    // Assemble into global
    for (let i = 0; i < Ke.length; i++) {
      for (let j = 0; j < Ke.length; j++) {
        if (dofs[i] < n && dofs[j] < n) {
          K[dofs[i]][dofs[j]] += Ke[i][j];
        }
      }
    }
  }

  return K;
}

// ─── Apply Boundary Conditions and Solve ─────────────────────────────────────

export function solveFEA(
  mesh: FEAMesh,
  bcs: BoundaryCondition[],
  planeStress = true,
): FEAResult {
  const n = mesh.nDOF;
  const K = assembleGlobal(mesh, planeStress);

  // Build force vector
  const F = new Array(n).fill(0);
  for (const bc of bcs) {
    if (bc.type === "force" || bc.type === "moment") {
      const dof = bc.nodeId * mesh.nodes[0].dofPerNode + bc.dof;
      if (dof < n) F[dof] = bc.value;
    }
  }

  // Partition DOFs
  const prescribedDofs = new Set<number>();
  const prescribedValues = new Map<number, number>();
  for (const bc of bcs) {
    if (bc.type === "displacement") {
      const dof = bc.nodeId * mesh.nodes[0].dofPerNode + bc.dof;
      if (dof < n) {
        prescribedDofs.add(dof);
        prescribedValues.set(dof, bc.value);
      }
    }
  }

  const freeDOFs: number[] = [];
  const fixedDOFs: number[] = [];
  for (let i = 0; i < n; i++) {
    if (prescribedDofs.has(i)) fixedDOFs.push(i);
    else freeDOFs.push(i);
  }

  // Extract free-free submatrix
  const nFree = freeDOFs.length;
  const Kff: Mat = Array.from({ length: nFree }, (_, i) =>
    Array.from({ length: nFree }, (_, j) => K[freeDOFs[i]][freeDOFs[j]]),
  );
  const Ff = freeDOFs.map((i) => F[i]);

  // Subtract prescribed DOF contributions from force vector
  for (let i = 0; i < nFree; i++) {
    for (const fixed of fixedDOFs) {
      Ff[i] -= K[freeDOFs[i]][fixed] * (prescribedValues.get(fixed) ?? 0);
    }
  }

  // Solve
  let uFree: Vec;
  try {
    const chol = choleskyDecompose(Kff);
    uFree = choleskySolve(chol, Ff);
  } catch {
    // Fall back to dense LU if not SPD
    uFree = solveDense(Kff, Ff);
  }

  // Full displacement vector
  const u = new Array(n).fill(0);
  for (let i = 0; i < nFree; i++) u[freeDOFs[i]] = uFree[i];
  for (const [dof, val] of prescribedValues) u[dof] = val;

  // Compute reactions
  const Ku = matVecMul(K, u);
  const reactions = new Array(n).fill(0);
  for (const fixed of fixedDOFs) {
    reactions[fixed] = Ku[fixed] - F[fixed];
  }

  // Post-process: element stresses
  const elementStresses: FEAResult["elementStresses"] = [];
  const elementForces: FEAResult["elementForces"] = [];
  let maxStress = 0;

  for (const elem of mesh.elements) {
    if (elem.type === "cst" || elem.type === "q4") {
      const uElem = elem.nodeIds.flatMap((id) => [u[id * 2], u[id * 2 + 1]]);
      const D = planeStress ? planeStressMatrix(elem.material) : planeStrainMatrix(elem.material);

      let B: Mat;
      if (elem.type === "cst") {
        const [n1, n2, n3] = elem.nodeIds;
        const p1 = mesh.nodes.find((n) => n.id === n1)!;
        const p2 = mesh.nodes.find((n) => n.id === n2)!;
        const p3 = mesh.nodes.find((n) => n.id === n3)!;
        const A2 = (p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y);
        const A = Math.abs(A2) / 2;
        const b1 = p2.y - p3.y, b2 = p3.y - p1.y, b3 = p1.y - p2.y;
        const c1 = p3.x - p2.x, c2 = p1.x - p3.x, c3 = p2.x - p1.x;
        B = [
          [b1, 0, b2, 0, b3, 0],
          [0, c1, 0, c2, 0, c3],
          [c1, b1, c2, b2, c3, b3],
        ].map((row) => row.map((v) => v / (2 * A)));
      } else {
        // Q4: evaluate B at center (xi=0, eta=0)
        const [n1, n2, n3, n4] = elem.nodeIds;
        const corners = [n1, n2, n3, n4].map((id) => mesh.nodes.find((n) => n.id === id)!);
        const dN = [[-0.25, 0.25, 0.25, -0.25], [-0.25, -0.25, 0.25, 0.25]];
        const J: Mat = [[0, 0], [0, 0]];
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 4; k++) J[i][j] += dN[i][k] * corners[k][j === 0 ? "x" : "y"];
        const detJ = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        const invJ: Mat = [[J[1][1] / detJ, -J[0][1] / detJ], [-J[1][0] / detJ, J[0][0] / detJ]];
        B = Array.from({ length: 3 }, () => new Array(8).fill(0));
        for (let k = 0; k < 4; k++) {
          const dNdx = invJ[0][0] * dN[0][k] + invJ[0][1] * dN[1][k];
          const dNdy = invJ[1][0] * dN[0][k] + invJ[1][1] * dN[1][k];
          B[0][2 * k] = dNdx; B[1][2 * k + 1] = dNdy;
          B[2][2 * k] = dNdy; B[2][2 * k + 1] = dNdx;
        }
      }

      const strain = matVecMul(B, uElem);
      const stress = matVecMul(D, strain);
      const vm = vonMises2D(stress[0], stress[1], stress[2]);
      if (vm > maxStress) maxStress = vm;

      elementStresses.push({
        elementId: elem.id,
        stress,
        strain,
        vonMises: vm,
      });
    } else if (elem.type === "truss") {
      const [n1, n2] = elem.nodeIds;
      const node1 = mesh.nodes.find((n) => n.id === n1)!;
      const node2 = mesh.nodes.find((n) => n.id === n2)!;
      const dx = node2.x - node1.x, dy = node2.y - node1.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      const c = dx / L, s = dy / L;
      const du = u[n2 * 2] - u[n1 * 2];
      const dv = u[n2 * 2 + 1] - u[n1 * 2 + 1];
      const axialStrain = (c * du + s * dv) / L;
      const axialStress = elem.material.E * axialStrain;
      const A = elem.area ?? 1.0;
      const force = axialStress * A;

      if (Math.abs(axialStress) > maxStress) maxStress = Math.abs(axialStress);
      elementStresses.push({ elementId: elem.id, stress: [axialStress, 0, 0], strain: [axialStrain, 0, 0] });
      elementForces.push({ elementId: elem.id, force: [force, 0, 0] });
    }
  }

  const maxDisp = Math.max(...u.map(Math.abs));

  return {
    displacements: u,
    reactions,
    elementStresses,
    elementForces,
    maxDisplacement: maxDisp,
    maxStress,
    converged: true,
  };
}

// ─── von Mises Stress (2D plane stress) ─────────────────────────────────────

export function vonMises2D(sx: number, sy: number, txy: number): number {
  return Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * txy * txy);
}

// ─── Mesh Generators ─────────────────────────────────────────────────────────

export function createRectangularMesh(
  width: number,
  height: number,
  nx: number,
  ny: number,
  material: Material,
  thickness = 1.0,
): FEAMesh {
  const nodes: Node[] = [];
  const elements: Element[] = [];
  const dofPerNode = 2;

  // Nodes
  let nodeId = 0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      nodes.push({
        id: nodeId++,
        x: (i / nx) * width,
        y: (j / ny) * height,
        dofPerNode,
      });
    }
  }

  // Q4 elements
  let elemId = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n1 = j * (nx + 1) + i;
      const n2 = n1 + 1;
      const n3 = n2 + (nx + 1);
      const n4 = n1 + (nx + 1);
      elements.push({
        id: elemId++,
        type: "q4",
        nodeIds: [n1, n2, n3, n4],
        material,
        thickness,
      });
    }
  }

  return { nodes, elements, nDOF: nodes.length * dofPerNode };
}

export function createCSTMesh(
  width: number,
  height: number,
  nx: number,
  ny: number,
  material: Material,
  thickness = 1.0,
): FEAMesh {
  const nodes: Node[] = [];
  const elements: Element[] = [];
  const dofPerNode = 2;

  let nodeId = 0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      nodes.push({
        id: nodeId++,
        x: (i / nx) * width,
        y: (j / ny) * height,
        dofPerNode,
      });
    }
  }

  let elemId = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const bl = j * (nx + 1) + i;
      const br = bl + 1;
      const tl = bl + (nx + 1);
      const tr = tl + 1;

      // Two triangles per quad
      elements.push({ id: elemId++, type: "cst", nodeIds: [bl, br, tr], material, thickness });
      elements.push({ id: elemId++, type: "cst", nodeIds: [bl, tr, tl], material, thickness });
    }
  }

  return { nodes, elements, nDOF: nodes.length * dofPerNode };
}

export function createTruss(
  joints: Array<{ x: number; y: number }>,
  members: Array<[number, number]>,
  material: Material,
  area: number,
): FEAMesh {
  const nodes: Node[] = joints.map((j, i) => ({ id: i, x: j.x, y: j.y, dofPerNode: 2 }));
  const elements: Element[] = members.map(([a, b], i) => ({
    id: i, type: "truss" as ElementType, nodeIds: [a, b], material, area,
  }));

  return { nodes, elements, nDOF: nodes.length * 2 };
}

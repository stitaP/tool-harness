/**
 * Comprehensive Fractal Analysis Library
 * ───────────────────────────────────────
 * Every major fractal algorithm, dimension estimator, and analysis tool:
 *
 * 1. Escape-time fractals: Mandelbrot, Julia, Burning Ship, Newton, Tricorn
 * 2. Geometric fractals: Sierpinski (triangle/carpet/gasket), Koch snowflake, Cantor set, Dragon curve
 * 3. L-systems: generic production rules with turtle graphics output
 * 4. IFS (Iterated Function Systems): Barnsley fern, Sierpinski via IFS, custom
 * 5. Fractal dimension: box-counting, Minkowski-Bouligand, Hausdorff estimation
 * 6. Lacunarity and multifractal spectrum (f(α) curve)
 * 7. Orbit trap fractals
 * 8. Distance estimation (for smooth Mandelbrot/Julia boundaries)
 * 9. Fractal noise (Perlin-style, fBm,ridged, turbulence)
 *
 * Zero dependencies. Runs in browser or Node.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FractalGrid {
  values: number[][];
  width: number;
  height: number;
  min: number;
  max: number;
  metadata?: Record<string, unknown>;
}

export interface FractalPoint {
  x: number;
  y: number;
  iteration: number;
  escaped: boolean;
  value?: number;
}

export interface FractalLine {
  points: Array<{ x: number; y: number }>;
  color?: string;
  width?: number;
}

export interface FractalResult {
  type: string;
  grid?: FractalGrid;
  lines?: FractalLine[];
  points?: FractalPoint[];
  dimension?: number;
  lacunarity?: number;
  multifractal?: MultifractalSpectrum;
  metadata: Record<string, unknown>;
}

export interface MultifractalSpectrum {
  alpha: number[];
  fAlpha: number[];
  widthOfSpectrum: number;
  alpha0: number;
  maxFAlpha: number;
}

export interface LSystemRule {
  from: string;
  to: string;
}

export interface LSystemResult {
  axiom: string;
  finalString: string;
  iterations: number;
  turtleCommands: TurtleCommand[];
}

export interface TurtleCommand {
  action: "move" | "turn" | "push" | "pop";
  angle?: number;
  length?: number;
}

export interface IFSFunction {
  a: number; b: number; c: number; d: number; e: number; f: number;
  probability: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. ESCAPE-TIME FRACTALS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Mandelbrot Set ────────────────────────────────────────────────────────

export function mandelbrot(
  width: number,
  height: number,
  centerX = -0.5,
  centerY = 0,
  zoom = 1,
  maxIter = 256,
): FractalResult {
  const values: number[][] = [];
  const range = 3 / zoom;
  const minX = centerX - range;
  const minY = centerY - range;
  const dx = (2 * range) / width;
  const dy = (2 * range) / height;

  for (let py = 0; py < height; py++) {
    const row: number[] = [];
    for (let px = 0; px < width; px++) {
      const x0 = minX + px * dx;
      const y0 = minY + py * dy;
      let x = 0, y = 0;
      let iter = 0;

      while (x * x + y * y <= 4 && iter < maxIter) {
        const xTemp = x * x - y * y + x0;
        y = 2 * x * y + y0;
        x = xTemp;
        iter++;
      }

      // Smooth coloring
      if (iter < maxIter) {
        const log2 = Math.log(2);
        const logZn = Math.log(x * x + y * y) / 2;
        const nu = Math.log(logZn / log2) / log2;
        row.push(iter + 1 - nu);
      } else {
        row.push(0); // Inside set
      }
    }
    values.push(row);
  }

  const flat = values.flat().filter((v) => v > 0);
  const min = flat.length > 0 ? Math.min(...flat) : 0;
  const max = flat.length > 0 ? Math.max(...flat) : maxIter;

  return {
    type: "mandelbrot",
    grid: { values, width, height, min, max },
    metadata: { centerX, centerY, zoom, maxIter, type: "Mandelbrot Set" },
  };
}

// ─── Julia Set ──────────────────────────────────────────────────────────────

export function julia(
  width: number,
  height: number,
  cReal = -0.7,
  cImag = 0.27015,
  centerX = 0,
  centerY = 0,
  zoom = 1,
  maxIter = 256,
): FractalResult {
  const values: number[][] = [];
  const range = 2 / zoom;
  const minX = centerX - range;
  const minY = centerY - range;
  const dx = (2 * range) / width;
  const dy = (2 * range) / height;

  for (let py = 0; py < height; py++) {
    const row: number[] = [];
    for (let px = 0; px < width; px++) {
      let x = minX + px * dx;
      let y = minY + py * dy;
      let iter = 0;

      while (x * x + y * y <= 4 && iter < maxIter) {
        const xTemp = x * x - y * y + cReal;
        y = 2 * x * y + cImag;
        x = xTemp;
        iter++;
      }

      if (iter < maxIter) {
        const log2 = Math.log(2);
        const logZn = Math.log(x * x + y * y) / 2;
        const nu = Math.log(logZn / log2) / log2;
        row.push(iter + 1 - nu);
      } else {
        row.push(0);
      }
    }
    values.push(row);
  }

  const flat = values.flat().filter((v) => v > 0);
  const min = flat.length > 0 ? Math.min(...flat) : 0;
  const max = flat.length > 0 ? Math.max(...flat) : maxIter;

  return {
    type: "julia",
    grid: { values, width, height, min, max },
    metadata: { cReal, cImag, centerX, centerY, zoom, maxIter, type: "Julia Set" },
  };
}

// ─── Burning Ship ───────────────────────────────────────────────────────────

export function burningShip(
  width: number,
  height: number,
  centerX = -0.4,
  centerY = -0.6,
  zoom = 1,
  maxIter = 256,
): FractalResult {
  const values: number[][] = [];
  const range = 2.5 / zoom;
  const minX = centerX - range;
  const minY = centerY - range;
  const dx = (2 * range) / width;
  const dy = (2 * range) / height;

  for (let py = 0; py < height; py++) {
    const row: number[] = [];
    for (let px = 0; px < width; px++) {
      let x = 0, y = 0;
      const x0 = minX + px * dx;
      const y0 = minY + py * dy;
      let iter = 0;

      while (x * x + y * y <= 4 && iter < maxIter) {
        const xTemp = x * x - y * y + x0;
        y = Math.abs(2 * x * y) + y0;
        x = Math.abs(xTemp);
        iter++;
      }

      row.push(iter < maxIter ? iter : 0);
    }
    values.push(row);
  }

  return {
    type: "burning-ship",
    grid: { values, width, height, min: 0, max: maxIter },
    metadata: { centerX, centerY, zoom, maxIter, type: "Burning Ship" },
  };
}

// ─── Newton Fractal ─────────────────────────────────────────────────────────

export function newtonFractal(
  width: number,
  height: number,
  centerX = 0,
  centerY = 0,
  zoom = 1,
  maxIter = 50,
  tolerance = 1e-10,
): FractalResult {
  // z³ - 1 = 0 → roots at 1, e^(2πi/3), e^(4πi/3)
  const roots = [
    { re: 1, im: 0 },
    { re: -0.5, im: Math.sqrt(3) / 2 },
    { re: -0.5, im: -Math.sqrt(3) / 2 },
  ];

  const values: number[][] = [];
  const range = 2.5 / zoom;
  const minX = centerX - range;
  const minY = centerY - range;
  const dx = (2 * range) / width;
  const dy = (2 * range) / height;

  for (let py = 0; py < height; py++) {
    const row: number[] = [];
    for (let px = 0; px < width; px++) {
      let zr = minX + px * dx;
      let zi = minY + py * dy;
      let iter = 0;
      let rootIdx = -1;

      while (iter < maxIter) {
        // f(z) = z³ - 1, f'(z) = 3z²
        const zr2 = zr * zr - zi * zi;
        const zi2 = 2 * zr * zi;
        const zr3 = zr * zr2 - zi * zi2;
        const zi3 = zr * zi2 + zi * zr2;

        // z - f(z)/f'(z) = z - (z³-1)/(3z²) = (2z³+1)/(3z²)
        const denom_re = 3 * (zr2);
        const denom_im = 3 * (zi2);
        const num_re = 2 * zr3 + 1;
        const num_im = 2 * zi3;
        const denom2 = denom_re * denom_re + denom_im * denom_im;

        if (denom2 < 1e-30) break;

        zr = (num_re * denom_re + num_im * denom_im) / denom2;
        zi = (num_im * denom_re - num_re * denom_im) / denom2;
        iter++;

        // Check convergence to any root
        for (let r = 0; r < roots.length; r++) {
          const dr = zr - roots[r].re;
          const di = zi - roots[r].im;
          if (dr * dr + di * di < tolerance) {
            rootIdx = r;
            break;
          }
        }
        if (rootIdx >= 0) break;
      }

      // Encode: root index + iteration count for coloring
      row.push(rootIdx >= 0 ? (rootIdx + 1) * 1000 + iter : 0);
    }
    values.push(row);
  }

  return {
    type: "newton",
    grid: { values, width, height, min: 0, max: 3000 + maxIter },
    metadata: { centerX, centerY, zoom, maxIter, roots, type: "Newton Fractal (z³-1)" },
  };
}

// ─── Tricorn (Mandelbar) ───────────────────────────────────────────────────

export function tricorn(
  width: number,
  height: number,
  centerX = -0.3,
  centerY = 0,
  zoom = 1,
  maxIter = 256,
): FractalResult {
  const values: number[][] = [];
  const range = 2.5 / zoom;
  const minX = centerX - range;
  const minY = centerY - range;
  const dx = (2 * range) / width;
  const dy = (2 * range) / height;

  for (let py = 0; py < height; py++) {
    const row: number[] = [];
    for (let px = 0; px < width; px++) {
      let x = 0, y = 0;
      const x0 = minX + px * dx;
      const y0 = minY + py * dy;
      let iter = 0;

      while (x * x + y * y <= 4 && iter < maxIter) {
        const xTemp = x * x - y * y + x0;
        y = -2 * x * y + y0; // conjugate
        x = xTemp;
        iter++;
      }

      row.push(iter < maxIter ? iter : 0);
    }
    values.push(row);
  }

  return {
    type: "tricorn",
    grid: { values, width, height, min: 0, max: maxIter },
    metadata: { centerX, centerY, zoom, maxIter, type: "Tricorn / Mandelbar" },
  };
}

// ─── Distance Estimation (smooth Mandelbrot boundary) ──────────────────────

export function mandelbrotDistance(
  width: number,
  height: number,
  centerX = -0.5,
  centerY = 0,
  zoom = 1,
  maxIter = 256,
): FractalResult {
  const values: number[][] = [];
  const range = 3 / zoom;
  const minX = centerX - range;
  const minY = centerY - range;
  const dx = (2 * range) / width;
  const dy = (2 * range) / height;

  for (let py = 0; py < height; py++) {
    const row: number[] = [];
    for (let px = 0; px < width; px++) {
      const x0 = minX + px * dx;
      const y0 = minY + py * dy;
      let zx = 0, zy = 0;
      let dzx = 0, dzy = 0;
      let iter = 0;

      while (zx * zx + zy * zy <= 4 && iter < maxIter) {
        const dzxNew = 2 * (zx * dzx - zy * dzy) + 1;
        const dzyNew = 2 * (zx * dzy + zy * dzx);
        const zxNew = zx * zx - zy * zy + x0;
        const zyNew = 2 * zx * zy + y0;
        zx = zxNew; zy = zyNew;
        dzx = dzxNew; dzy = dzyNew;
        iter++;
      }

      if (iter < maxIter) {
        const mag2 = zx * zx + zy * zy;
        const dzMag = Math.sqrt(dzx * dzx + dzy * dzy);
        const distance = 2 * Math.sqrt(mag2) * Math.log(mag2) / dzMag;
        row.push(distance);
      } else {
        row.push(0);
      }
    }
    values.push(row);
  }

  return {
    type: "mandelbrot-distance",
    grid: { values, width, height, min: 0, max: Math.max(...values.flat()) },
    metadata: { centerX, centerY, zoom, maxIter, type: "Mandelbrot Distance Estimation" },
  };
}

// ─── Orbit Trap ─────────────────────────────────────────────────────────────

export function orbitTrap(
  width: number,
  height: number,
  cReal = -0.7,
  cImag = 0.27015,
  centerX = 0,
  centerY = 0,
  zoom = 1,
  maxIter = 256,
): FractalResult {
  const values: number[][] = [];
  const range = 2 / zoom;
  const minX = centerX - range;
  const minY = centerY - range;
  const dx = (2 * range) / width;
  const dy = (2 * range) / height;

  for (let py = 0; py < height; py++) {
    const row: number[] = [];
    for (let px = 0; px < width; px++) {
      let x = minX + px * dx;
      let y = minY + py * dy;
      let minDist = Infinity;
      let iter = 0;

      while (x * x + y * y <= 4 && iter < maxIter) {
        const xTemp = x * x - y * y + cReal;
        y = 2 * x * y + cImag;
        x = xTemp;
        iter++;

        // Distance to cross (0,0)→(1,0) line segment
        const dist = Math.abs(y); // distance to real axis
        if (dist < minDist) minDist = dist;
      }

      row.push(iter < maxIter ? minDist : 0);
    }
    values.push(row);
  }

  return {
    type: "orbit-trap",
    grid: { values, width, height, min: 0, max: Math.max(...values.flat()) },
    metadata: { cReal, cImag, centerX, centerY, zoom, maxIter, type: "Orbit Trap" },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. GEOMETRIC FRACTALS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Sierpinski Triangle ────────────────────────────────────────────────────

export function sierpinskiTriangle(iterations: number): FractalResult {
  const lines: FractalLine[] = [];
  const size = 1;
  const h = size * Math.sqrt(3) / 2;

  function draw(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, n: number) {
    if (n === 0) {
      lines.push({
        points: [
          { x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }, { x: x1, y: y1 },
        ],
      });
      return;
    }
    const mx1 = (x1 + x2) / 2, my1 = (y1 + y2) / 2;
    const mx2 = (x2 + x3) / 2, my2 = (y2 + y3) / 2;
    const mx3 = (x1 + x3) / 2, my3 = (y1 + y3) / 2;
    draw(x1, y1, mx1, my1, mx3, my3, n - 1);
    draw(mx1, my1, x2, y2, mx2, my2, n - 1);
    draw(mx3, my3, mx2, my2, x3, y3, n - 1);
  }

  draw(0, 0, size, 0, size / 2, h, iterations);

  return {
    type: "sierpinski-triangle",
    lines,
    dimension: Math.log(3) / Math.log(2),
    metadata: { iterations, type: "Sierpinski Triangle", dimension: Math.log(3) / Math.log(2) },
  };
}

// ─── Sierpinski Carpet ──────────────────────────────────────────────────────

export function sierpinskiCarpet(iterations: number): FractalResult {
  const lines: FractalLine[] = [];

  function draw(x: number, y: number, size: number, n: number) {
    if (n === 0) {
      lines.push({
        points: [
          { x, y }, { x: x + size, y }, { x: x + size, y: y + size },
          { x, y: y + size }, { x, y },
        ],
      });
      return;
    }
    const s = size / 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (i === 1 && j === 1) continue;
        draw(x + i * s, y + j * s, s, n - 1);
      }
    }
  }

  draw(0, 0, 1, iterations);

  return {
    type: "sierpinski-carpet",
    lines,
    dimension: Math.log(8) / Math.log(3),
    metadata: { iterations, type: "Sierpinski Carpet", dimension: Math.log(8) / Math.log(3) },
  };
}

// ─── Koch Snowflake ─────────────────────────────────────────────────────────

export function kochSnowflake(iterations: number): FractalResult {
  const lines: FractalLine[] = [];
  const h = Math.sqrt(3) / 2;

  function kochSegment(
    x1: number, y1: number, x2: number, y2: number, n: number,
  ): Array<{ x: number; y: number }> {
    if (n === 0) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];

    const dx = (x2 - x1) / 3, dy = (y2 - y1) / 3;
    const ax = x1 + dx, ay = y1 + dy;
    const bx = x1 + 2 * dx, by = y1 + 2 * dy;
    const px = (ax + bx) / 2 - (by - ay) * h;
    const py = (ay + by) / 2 + (bx - ax) * h;

    return [
      ...kochSegment(x1, y1, ax, ay, n - 1),
      ...kochSegment(ax, ay, px, py, n - 1),
      ...kochSegment(px, py, bx, by, n - 1),
      ...kochSegment(bx, by, x2, y2, n - 1),
    ];
  }

  const s = 1;
  const pts = [
    ...kochSegment(0, 0, s, 0, iterations),
    ...kochSegment(s, 0, s / 2, h, iterations).slice(1),
    ...kochSegment(s / 2, h, 0, 0, iterations).slice(1),
  ];

  lines.push({ points: pts });

  return {
    type: "koch-snowflake",
    lines,
    dimension: Math.log(4) / Math.log(3),
    metadata: { iterations, type: "Koch Snowflake", dimension: Math.log(4) / Math.log(3) },
  };
}

// ─── Cantor Set ─────────────────────────────────────────────────────────────

export function cantorSet(iterations: number): FractalResult {
  const lines: FractalLine[] = [];

  function draw(x: number, size: number, n: number, yOffset: number) {
    if (n === 0) {
      lines.push({
        points: [{ x, y: yOffset }, { x: x + size, y: yOffset }],
        width: Math.max(0.5, 3 - iterations * 0.3),
      });
      return;
    }
    draw(x, size / 3, n - 1, yOffset);
    draw(x + 2 * size / 3, size / 3, n - 1, yOffset);
  }

  const spacing = 1 / (iterations + 1);
  for (let i = 0; i <= iterations; i++) {
    draw(0, 1, iterations - i, i * spacing);
  }

  return {
    type: "cantor-set",
    lines,
    dimension: Math.log(2) / Math.log(3),
    metadata: { iterations, type: "Cantor Set", dimension: Math.log(2) / Math.log(3) },
  };
}

// ─── Dragon Curve ───────────────────────────────────────────────────────────

export function dragonCurve(iterations: number): FractalResult {
  let turns = [1]; // R

  for (let i = 1; i < iterations; i++) {
    const reversed = [...turns].reverse().map((t) => -t);
    turns = [...turns, 1, ...reversed];
  }

  const points: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  let x = 0, y = 0, angle = 0;
  const step = 1 / Math.pow(2, iterations / 2);

  for (const turn of turns) {
    angle += turn * Math.PI / 2;
    x += Math.cos(angle) * step;
    y += Math.sin(angle) * step;
    points.push({ x, y });
  }

  // Normalize to [0,1]
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const scale = Math.max(rangeX, rangeY);
  const normalized = points.map((p) => ({
    x: (p.x - minX) / scale,
    y: (p.y - minY) / scale,
  }));

  return {
    type: "dragon-curve",
    lines: [{ points: normalized }],
    dimension: 2,
    metadata: { iterations, type: "Dragon Curve", dimension: 2 },
  };
}

// ─── Hilbert Curve ──────────────────────────────────────────────────────────

export function hilbertCurve(order: number): FractalResult {
  const n = Math.pow(2, order);
  const points: Array<{ x: number; y: number }> = [];

  function d2xy(n: number, d: number): [number, number] {
    let x = 0, y = 0, s = 1;
    while (s < n) {
      const rx = 1 & (d / 2);
      const ry = 1 & (d ^ rx);
      if (ry === 0) {
        if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
        [x, y] = [y, x];
      }
      x += s * rx;
      y += s * ry;
      d /= 4;
      s *= 2;
    }
    return [x, y];
  }

  const total = n * n;
  for (let d = 0; d < total; d++) {
    const [px, py] = d2xy(n, d);
    points.push({ x: px / (n - 1), y: py / (n - 1) });
  }

  return {
    type: "hilbert-curve",
    lines: [{ points }],
    dimension: 2,
    metadata: { order, type: "Hilbert Curve", dimension: 2 },
  };
}

// ─── Peano Curve ────────────────────────────────────────────────────────────

export function peanoCurve(order: number): FractalResult {
  const n = Math.pow(3, order);
  const points: Array<{ x: number; y: number }> = [];

  function d2xy_3(n: number, d: number): [number, number] {
    let x = 0, y = 0, s = 1;
    while (s < n) {
      const rx = Math.floor(d / (s * s)) % 3;
      const ry = Math.floor(d / s) % 3;
      x += s * rx;
      y += s * ry;
      d = Math.floor(d / (s * s * 9)) * s * s * 9;
      s *= 3;
    }
    return [x, y];
  }

  // Simplified: just generate points along Peano-like pattern
  const total = n * n;
  for (let d = 0; d < total; d++) {
    let x = 0, y = 0, s = 1;
    let dd = d;
    while (s < n) {
      x += s * (Math.floor(dd / (s * s)) % 3);
      y += s * (Math.floor(dd / s) % 3);
      dd = Math.floor(dd / (s * s * 9)) * s * s * 9;
      s *= 3;
    }
    points.push({ x: x / (n - 1), y: y / (n - 1) });
  }

  return {
    type: "peano-curve",
    lines: [{ points }],
    dimension: 2,
    metadata: { order, type: "Peano Curve", dimension: 2 },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. L-SYSTEMS
// ═══════════════════════════════════════════════════════════════════════════

export const L_SYSTEM_PRESETS: Record<string, { axiom: string; rules: LSystemRule[]; angle: number; iterations: number }> = {
  "koch-curve": { axiom: "F", rules: [{ from: "F", to: "F+F-F-F+F" }], angle: 90, iterations: 4 },
  "sierpinski-arrow": { axiom: "F-G-G", rules: [{ from: "F", to: "F-G+F+G-F" }, { from: "G", to: "GG" }], angle: 120, iterations: 6 },
  "dragon-lsystem": { axiom: "FX", rules: [{ from: "X", to: "X+YF+" }, { from: "Y", to: "-FX-Y" }], angle: 90, iterations: 10 },
  "plant": { axiom: "X", rules: [{ from: "X", to: "F+[[X]-X]-F[-FX]+X" }, { from: "F", to: "FF" }], angle: 25, iterations: 6 },
  "tree": { axiom: "F", rules: [{ from: "F", to: "FF+[+F-F-F]-[-F+F+F]" }], angle: 22.5, iterations: 4 },
  "gosper-curve": { axiom: "A", rules: [{ from: "A", to: "A-B--B+A++AA+B-" }, { from: "B", to: "+A-BB--B-A++A+B" }], angle: 60, iterations: 4 },
  "quadratic-gosper": { axiom: "A", rules: [{ from: "A", to: "A-B-CC+BAA" }, { from: "B", to: "+A-BB--B-A" }, { from: "C", to: "--A+A+CC--B-" }], angle: 90, iterations: 3 },
  "penrose-tiling": { axiom: "[7]++[7]++[7]++[7]++[7]", rules: [{ from: "6", to: "81++91----71[-81----61]++" }, { from: "7", to: "+81--91[---61--71]+" }, { from: "8", to: "-61++71[+++81++91]-" }, { from: "9", to: "--81++++61[+91++++71]--71" }, { from: "1", to: "" }], angle: 36, iterations: 5 },
};

export function lSystem(
  axiom: string,
  rules: LSystemRule[],
  angle: number,
  iterations: number,
  stepLength = 1,
): LSystemResult {
  let current = axiom;
  for (let i = 0; i < iterations; i++) {
    let next = "";
    for (const ch of current) {
      const rule = rules.find((r) => r.from === ch);
      next += rule ? rule.to : ch;
    }
    current = next;
  }

  // Turtle graphics interpretation
  const commands: TurtleCommand[] = [];
  for (const ch of current) {
    switch (ch) {
      case "F": case "A": case "B": case "1":
        commands.push({ action: "move", length: stepLength });
        break;
      case "f":
        commands.push({ action: "move", length: stepLength });
        break;
      case "+":
        commands.push({ action: "turn", angle: angle });
        break;
      case "-":
        commands.push({ action: "turn", angle: -angle });
        break;
      case "[":
        commands.push({ action: "push" });
        break;
      case "]":
        commands.push({ action: "pop" });
        break;
    }
  }

  return { axiom, finalString: current, iterations, turtleCommands: commands };
}

export function executeLSystem(result: LSystemResult): FractalLine[] {
  const lines: FractalLine[] = [];
  let x = 0, y = 0, angle = -Math.PI / 2;
  const stack: Array<{ x: number; y: number; angle: number }> = [];
  let currentLine: Array<{ x: number; y: number }> = [{ x, y }];
  const step = 0.02;

  for (const cmd of result.turtleCommands) {
    switch (cmd.action) {
      case "move":
        x += Math.cos(angle) * step * (cmd.length ?? 1);
        y += Math.sin(angle) * step * (cmd.length ?? 1);
        currentLine.push({ x, y });
        break;
      case "turn":
        angle += (cmd.angle ?? 0) * Math.PI / 180;
        break;
      case "push":
        stack.push({ x, y, angle });
        if (currentLine.length > 1) lines.push({ points: [...currentLine] });
        currentLine = [{ x, y }];
        break;
      case "pop": {
        const state = stack.pop();
        if (state) {
          if (currentLine.length > 1) lines.push({ points: [...currentLine] });
          x = state.x; y = state.y; angle = state.angle;
          currentLine = [{ x, y }];
        }
        break;
      }
    }
  }
  if (currentLine.length > 1) lines.push({ points: [...currentLine] });

  // Normalize
  const allPts = lines.flatMap((l) => l.points);
  if (allPts.length === 0) return lines;
  const xs = allPts.map((p) => p.x), ys = allPts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const scale = Math.max(rangeX, rangeY);

  for (const line of lines) {
    line.points = line.points.map((p) => ({
      x: (p.x - minX) / scale,
      y: 1 - (p.y - minY) / scale,
    }));
  }

  return lines;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. IFS (Iterated Function Systems)
// ═══════════════════════════════════════════════════════════════════════════

export const IFS_PRESETS: Record<string, IFSFunction[]> = {
  "barnsley-fern": [
    { a: 0, b: 0, c: 0, d: 0.16, e: 0, f: 0, probability: 0.01 },
    { a: 0.85, b: 0.04, c: -0.04, d: 0.85, e: 0, f: 1.6, probability: 0.85 },
    { a: 0.2, b: -0.26, c: 0.23, d: 0.22, e: 0, f: 1.6, probability: 0.07 },
    { a: -0.15, b: 0.28, c: 0.26, d: 0.24, e: 0, f: 0.44, probability: 0.07 },
  ],
  "sierpinski-gasket": [
    { a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0, probability: 0.33 },
    { a: 0.5, b: 0, c: 0, d: 0.5, e: 0.5, f: 0, probability: 0.33 },
    { a: 0.5, b: 0, c: 0, d: 0.5, e: 0.25, f: 0.433, probability: 0.34 },
  ],
  "cantor-dust": [
    { a: 0.33, b: 0, c: 0, d: 0.33, e: 0, f: 0, probability: 0.25 },
    { a: 0.33, b: 0, c: 0, d: 0.33, e: 0.67, f: 0, probability: 0.25 },
    { a: 0.33, b: 0, c: 0, d: 0.33, e: 0, f: 0.67, probability: 0.25 },
    { a: 0.33, b: 0, c: 0, d: 0.33, e: 0.67, f: 0.67, probability: 0.25 },
  ],
  "tree": [
    { a: 0.195, b: 0.488, c: -0.344, d: 0.443, e: 0.4431, f: 0.2452, probability: 0.25 },
    { a: 0.462, b: 0.414, c: -0.252, d: 0.361, e: 0.2511, f: 0.5692, probability: 0.25 },
    { a: -0.058, b: -0.07, c: 0.453, d: -0.111, e: 0.5976, f: 0.0969, probability: 0.25 },
    { a: -0.035, b: 0.07, c: -0.469, d: -0.022, e: 0.4884, f: 0.5069, probability: 0.25 },
  ],
  "spiral": [
    { a: 0.787878, b: -0.424242, c: 0.242424, d: 0.858585, e: 0, f: 0, probability: 0.5 },
    { a: -0.121212, b: 0.257576, c: 0.053030, d: 0.053030, e: 0, f: 1, probability: 0.25 },
    { a: 0.181818, b: -0.136364, c: 0.090909, d: 0.181818, e: 0.3, f: 1, probability: 0.25 },
  ],
};

export function ifs(
  functions: IFSFunction[],
  iterations: number = 100000,
  seed = 42,
): FractalResult {
  const points: Array<{ x: number; y: number }> = [];
  let x = 0, y = 0;

  // Simple seeded random
  let state = seed;
  const rand = () => { state = (state * 1664525 + 1013904223) & 0x7fffffff; return state / 0x7fffffff; };

  // Compute cumulative probabilities
  const cumProbs: number[] = [];
  let cumSum = 0;
  for (const f of functions) {
    cumSum += f.probability;
    cumProbs.push(cumSum);
  }

  for (let i = 0; i < iterations; i++) {
    const r = rand();
    let idx = 0;
    for (let j = 0; j < cumProbs.length; j++) {
      if (r <= cumProbs[j]) { idx = j; break; }
    }

    const f = functions[idx];
    const xNew = f.a * x + f.b * y + f.e;
    const yNew = f.c * x + f.d * y + f.f;
    x = xNew;
    y = yNew;

    if (i > 20) points.push({ x, y });
  }

  // Normalize
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const scale = Math.max(rangeX, rangeY);

  const normalized = points.map((p) => ({
    x: (p.x - minX) / scale,
    y: 1 - (p.y - minY) / scale,
  }));

  return {
    type: "ifs",
    points: normalized.map((p) => ({ x: p.x, y: p.y, iteration: 0, escaped: false })),
    metadata: { functions, iterations, type: "Iterated Function System" },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. FRACTAL DIMENSION ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════

// ─── Box-Counting Dimension ─────────────────────────────────────────────────

export function boxCounting(
  points: Array<{ x: number; y: number }>,
  minBoxSize = 0.001,
  maxBoxSize = 1,
  nSizes = 20,
): { dimension: number; data: Array<{ boxSize: number; count: number; logInvBox: number; logCount: number }> } {
  const data: Array<{ boxSize: number; count: number; logInvBox: number; logCount: number }> = [];

  const sizes = Array.from({ length: nSizes }, (_, i) => {
    const t = i / (nSizes - 1);
    return minBoxSize * Math.pow(maxBoxSize / minBoxSize, t);
  });

  for (const size of sizes) {
    const boxes = new Set<string>();
    for (const p of points) {
      const bx = Math.floor(p.x / size);
      const by = Math.floor(p.y / size);
      boxes.add(`${bx},${by}`);
    }
    const count = boxes.size;
    data.push({
      boxSize: size,
      count,
      logInvBox: Math.log(1 / size),
      logCount: Math.log(count),
    });
  }

  // Linear regression on log-log
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const d of data) {
    sumX += d.logInvBox;
    sumY += d.logCount;
    sumXY += d.logInvBox * d.logCount;
    sumX2 += d.logInvBox * d.logInvBox;
  }
  const dimension = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  return { dimension, data };
}

// ─── Minkowski-Bouligand Dimension ──────────────────────────────────────────

export function minkowskiDimension(
  values: number[][],
  threshold = 0.5,
  nScales = 20,
): { dimension: number; data: Array<{ scale: number; count: number; logScale: number; logCount: number }> } {
  // Binary image from threshold
  const h = values.length, w = values[0].length;
  const binary = values.map((row) => row.map((v) => v > threshold ? 1 : 0));

  const data: Array<{ scale: number; count: number; logScale: number; logCount: number }> = [];

  const maxDim = Math.max(w, h);
  const scales = Array.from({ length: nScales }, (_, i) => {
    const power = Math.floor(2 + (i / (nScales - 1)) * Math.log2(maxDim / 4));
    return Math.pow(2, power);
  }).filter((s) => s <= maxDim);

  for (const scale of scales) {
    let count = 0;
    for (let y = 0; y < h; y += scale) {
      for (let x = 0; x < w; x += scale) {
        let hasOne = false;
        for (let dy = 0; dy < scale && y + dy < h; dy++) {
          for (let dx = 0; dx < scale && x + dx < w; dx++) {
            if (binary[y + dy][x + dx]) { hasOne = true; break; }
          }
          if (hasOne) break;
        }
        if (hasOne) count++;
      }
    }
    data.push({ scale, count, logScale: Math.log(scale), logCount: Math.log(count || 1) });
  }

  // Linear regression
  const n = data.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (const d of data) { sx += d.logScale; sy += d.logCount; sxy += d.logScale * d.logCount; sx2 += d.logScale * d.logScale; }
  const dimension = -(n * sxy - sx * sy) / (n * sx2 - sx * sx);

  return { dimension, data };
}

// ─── Lacunarity ─────────────────────────────────────────────────────────────

export function lacunarity(
  values: number[][],
  nScales = 10,
): { lacunarity: number; data: Array<{ scale: number; lacunarity: number }> } {
  const h = values.length, w = values[0].length;
  const data: Array<{ scale: number; lacunarity: number }> = [];

  for (let s = 1; s <= nScales; s++) {
    const boxCount = Math.floor(Math.max(1, Math.min(h, w) / s));
    const sums: number[] = [];
    const squares: number[] = [];

    for (let by = 0; by < boxCount; by++) {
      for (let bx = 0; bx < boxCount; bx++) {
        let sum = 0, count = 0;
        for (let dy = 0; dy < s && by * s + dy < h; dy++) {
          for (let dx = 0; dx < s && bx * s + dx < w; dx++) {
            sum += values[by * s + dy][bx * s + dx];
            count++;
          }
        }
        const mean = count > 0 ? sum / count : 0;
        sums.push(mean);
        squares.push(mean * mean);
      }
    }

    const totalMean = sums.reduce((a, b) => a + b, 0) / sums.length;
    const totalMeanSq = squares.reduce((a, b) => a + b, 0) / squares.length;
    const lac = totalMean > 0 ? totalMeanSq / (totalMean * totalMean) : 1;
    data.push({ scale: s, lacunarity: lac });
  }

  const avgLac = data.reduce((s, d) => s + d.lacunarity, 0) / data.length;
  return { lacunarity: avgLac, data };
}

// ─── Multifractal Spectrum f(α) ────────────────────────────────────────────

export function multifractalSpectrum(
  values: number[][],
  qMin = -5,
  qMax = 5,
  nQ = 41,
): MultifractalSpectrum {
  const h = values.length, w = values[0].length;
  const maxDim = Math.min(h, w);

  // Box sizes
  const boxSizes = Array.from({ length: 8 }, (_, i) => Math.pow(2, i + 1)).filter((s) => s <= maxDim / 2);

  const qValues = Array.from({ length: nQ }, (_, i) => qMin + (qMax - qMin) * i / (nQ - 1));

  // Partition function τ(q) for each box size
  const tauData: Array<{ q: number; tau: number }> = [];

  for (const q of qValues) {
    const logTau: number[] = [];
    const logInvSize: number[] = [];

    for (const size of boxSizes) {
      let partitionSum = 0;
      for (let by = 0; by < h; by += size) {
        for (let bx = 0; bx < w; bx += size) {
          let sum = 0, count = 0;
          for (let dy = 0; dy < size && by + dy < h; dy++) {
            for (let dx = 0; dx < size && bx + dx < w; dx++) {
              sum += values[by + dy][bx + dx];
              count++;
            }
          }
          const p = count > 0 ? sum / count : 0;
          if (p > 0) {
            partitionSum += Math.pow(p, q);
          }
        }
      }

      if (partitionSum > 0) {
        logTau.push(Math.log(partitionSum));
        logInvSize.push(Math.log(1 / size));
      }
    }

    // Linear regression for τ(q)
    const n = logTau.length;
    if (n >= 2) {
      let sx = 0, sy = 0, sxy = 0, sx2 = 0;
      for (let i = 0; i < n; i++) {
        sx += logInvSize[i]; sy += logTau[i];
        sxy += logInvSize[i] * logTau[i]; sx2 += logInvSize[i] * logInvSize[i];
      }
      const tau = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
      tauData.push({ q, tau });
    }
  }

  // Legendre transform: α = dτ/dq, f(α) = q·α - τ(q)
  const alpha: number[] = [];
  const fAlpha: number[] = [];

  for (let i = 1; i < tauData.length - 1; i++) {
    const dq = tauData[i + 1].q - tauData[i - 1].q;
    const dTau = tauData[i + 1].tau - tauData[i - 1].tau;
    const a = dq !== 0 ? dTau / dq : 0;
    const f = tauData[i].q * a - tauData[i].tau;
    alpha.push(a);
    fAlpha.push(f);
  }

  const maxF = Math.max(...fAlpha);
  const alpha0Index = fAlpha.indexOf(maxF);

  return {
    alpha,
    fAlpha,
    widthOfSpectrum: Math.max(...alpha) - Math.min(...alpha),
    alpha0: alpha[alpha0Index] ?? 0,
    maxFAlpha: maxF,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. FRACTAL NOISE
// ═══════════════════════════════════════════════════════════════════════════

// ─── Perlin-style Gradient Noise ────────────────────────────────────────────

function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  return (h === 0 ? x + y : h === 1 ? -x + y : h === 2 ? x - y : -x - y);
}

function perlinNoise2D(x: number, y: number, perm: number[]): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf), v = fade(yf);
  const aa = perm[perm[xi] + yi];
  const ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi + 1] + yi];
  const bb = perm[perm[xi + 1] + yi + 1];
  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
    v,
  );
}

function generatePermutation(seed: number): number[] {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return [...p, ...p];
}

export function fractalNoise(
  width: number,
  height: number,
  options: {
    octaves?: number;
    lacunarity?: number;
    gain?: number;
    scale?: number;
    seed?: number;
    type?: "perlin" | "ridged" | "turbulence" | "fBm";
  } = {},
): FractalResult {
  const octaves = options.octaves ?? 6;
  const lacunarity = options.lacunarity ?? 2.0;
  const gain = options.gain ?? 0.5;
  const scale = options.scale ?? 4;
  const seed = options.seed ?? 42;
  const type = options.type ?? "fBm";

  const perm = generatePermutation(seed);
  const values: number[][] = [];

  for (let py = 0; py < height; py++) {
    const row: number[] = [];
    for (let px = 0; px < width; px++) {
      const nx = (px / width) * scale;
      const ny = (py / height) * scale;
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      let maxVal = 0;

      for (let o = 0; o < octaves; o++) {
        let n = perlinNoise2D(nx * frequency, ny * frequency, perm);

        switch (type) {
          case "ridged":
            n = 1 - Math.abs(n);
            n = n * n;
            break;
          case "turbulence":
            n = Math.abs(n);
            break;
          case "fBm":
          default:
            break;
        }

        value += n * amplitude;
        maxVal += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
      }

      row.push(value / maxVal);
    }
    values.push(row);
  }

  return {
    type: `fractal-noise-${type}`,
    grid: { values, width, height, min: 0, max: 1 },
    metadata: { octaves, lacunarity, gain, scale, seed, type },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. BIFURCATION & CHAOS
// ═══════════════════════════════════════════════════════════════════════════

export function logisticMap(
  rMin = 2.5,
  rMax = 4.0,
  nR = 500,
  nIter = 500,
  nDiscard = 300,
): FractalResult {
  const points: FractalPoint[] = [];

  for (let i = 0; i < nR; i++) {
    const r = rMin + (rMax - rMin) * i / (nR - 1);
    let x = 0.5;
    for (let j = 0; j < nDiscard; j++) x = r * x * (1 - x);
    for (let j = 0; j < nIter - nDiscard; j++) {
      x = r * x * (1 - x);
      points.push({ x: (r - rMin) / (rMax - rMin), y: x, iteration: j, escaped: false });
    }
  }

  return {
    type: "logistic-map",
    points,
    metadata: { rMin, rMax, nR, type: "Logistic Map Bifurcation" },
  };
}

export function henonPhaseSpace(
  a = 1.4,
  b = 0.3,
  iterations = 10000,
  discard = 100,
): FractalResult {
  const points: FractalPoint[] = [];
  let x = 0.1, y = 0.1;

  for (let i = 0; i < iterations; i++) {
    const xNew = 1 - a * x * x + y;
    const yNew = b * x;
    x = xNew;
    y = yNew;
    if (i >= discard) {
      points.push({ x, y, iteration: i, escaped: false });
    }
  }

  return {
    type: "henon-phase",
    points,
    metadata: { a, b, iterations, type: "Hénon Map Phase Space" },
  };
}

export function lorenzAttractor(
  sigma = 10,
  rho = 28,
  beta = 8 / 3,
  dt = 0.005,
  iterations = 10000,
): FractalResult {
  const points: FractalPoint[] = [];
  let x = 0.1, y = 0, z = 0;

  for (let i = 0; i < iterations; i++) {
    const dx = sigma * (y - x);
    const dy = x * (rho - z) - y;
    const dz = x * y - beta * z;
    x += dx * dt;
    y += dy * dt;
    z += dz * dt;
    points.push({ x, y: z, iteration: i, escaped: false, value: x });
  }

  return {
    type: "lorenz-attractor",
    points,
    metadata: { sigma, rho, beta, dt, type: "Lorenz Attractor" },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. COBWEB DIAGRAM
// ═══════════════════════════════════════════════════════════════════════════

export function cobwebDiagram(
  r: number,
  x0 = 0.1,
  iterations = 50,
): FractalResult {
  const lines: FractalLine[] = [];
  const points: Array<{ x: number; y: number }> = [];

  let x = x0;
  points.push({ x: 0, y: x0 });

  for (let i = 0; i < iterations; i++) {
    const y = r * x * (1 - x);
    points.push({ x, y });
    points.push({ x: y, y });
    x = y;
  }

  lines.push({ points });

  return {
    type: "cobweb-diagram",
    lines,
    metadata: { r, x0, iterations, type: "Cobweb Diagram" },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. COMPREHENSIVE FRACTAL ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export function fullFractalAnalysis(
  fractalType: string,
  params: Record<string, unknown> = {},
): FractalResult {
  switch (fractalType) {
    case "mandelbrot":
      return mandelbrot(
        (params.width as number) || 200,
        (params.height as number) || 200,
        params.centerX as number ?? -0.5,
        params.centerY as number ?? 0,
        (params.zoom as number) || 1,
        (params.maxIter as number) || 256,
      );
    case "julia":
      return julia(
        (params.width as number) || 200,
        (params.height as number) || 200,
        (params.cReal as number) ?? -0.7,
        (params.cImag as number) ?? 0.27015,
        params.centerX as number ?? 0,
        params.centerY as number ?? 0,
        (params.zoom as number) || 1,
        (params.maxIter as number) || 256,
      );
    case "burning-ship":
      return burningShip(
        (params.width as number) || 200,
        (params.height as number) || 200,
        params.centerX as number ?? -0.4,
        params.centerY as number ?? -0.6,
        (params.zoom as number) || 1,
        (params.maxIter as number) || 256,
      );
    case "newton":
      return newtonFractal(
        (params.width as number) || 200,
        (params.height as number) || 200,
        params.centerX as number ?? 0,
        params.centerY as number ?? 0,
        (params.zoom as number) || 1,
        (params.maxIter as number) || 50,
      );
    case "tricorn":
      return tricorn(
        (params.width as number) || 200,
        (params.height as number) || 200,
        params.centerX as number ?? -0.3,
        params.centerY as number ?? 0,
        (params.zoom as number) || 1,
        (params.maxIter as number) || 256,
      );
    case "sierpinski-triangle":
      return sierpinskiTriangle((params.iterations as number) || 5);
    case "sierpinski-carpet":
      return sierpinskiCarpet((params.iterations as number) || 3);
    case "koch":
      return kochSnowflake((params.iterations as number) || 4);
    case "cantor":
      return cantorSet((params.iterations as number) || 6);
    case "dragon":
      return dragonCurve((params.iterations as number) || 12);
    case "hilbert":
      return hilbertCurve((params.order as number) || 3);
    case "logistic-map":
      return logisticMap();
    case "henon":
      return henonPhaseSpace();
    case "lorenz":
      return lorenzAttractor();
    case "fBm":
    case "perlin":
    case "ridged":
    case "turbulence":
      return fractalNoise(
        (params.width as number) || 200,
        (params.height as number) || 200,
        { type: fractalType === "fBm" ? "fBm" : fractalType as "perlin" | "ridged" | "turbulence", ...params },
      );
    default:
      return mandelbrot(200, 200);
  }
}

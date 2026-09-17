/**
 * Parametric SVG Generator — Haikei-style
 *
 * Generates custom SVG backgrounds, geometric patterns, dividers,
 * and decorative elements using mathematical algorithms.
 *
 * All generators produce lightweight, resolution-independent vector assets.
 * Controlled via interactive parameters for real-time customization.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type PatternType =
  | "waves"
  | "peaks"
  | "blob"
  | "low-poly"
  | "circles"
  | "dots"
  | "grid"
  | "hexagons"
  | "triangles"
  | "diagonal"
  | "zigzag"
  | "moire";

export interface PatternConfig {
  width: number;
  height: number;
  /** Primary color (hex) */
  color1: string;
  /** Secondary color (hex) */
  color2: string;
  /** Background color */
  bgColor: string;
  /** Opacity (0-1) */
  opacity: number;
  /** Pattern-specific parameters */
  params: Record<string, number>;
}

export interface SVGResult {
  svg: string;
  width: number;
  height: number;
  patternType: PatternType;
  /** Approximate file size in bytes */
  sizeBytes: number;
}

// ─── Generators ─────────────────────────────────────────────────────────────

export class ParametricSVGGenerator {
  /**
   * Generate a waves pattern (sine wave layers).
   */
  generateWaves(config: Partial<PatternConfig> = {}): SVGResult {
    const c = this.mergeConfig(config);
    const layers = c.params.layers ?? 3;
    const amplitude = c.params.amplitude ?? 30;
    const frequency = c.params.frequency ?? 0.005;
    const phase = c.params.phase ?? 0;

    const paths: string[] = [];
    for (let l = 0; l < layers; l++) {
      const yOffset = c.height * 0.3 + l * (c.height * 0.15);
      const amp = amplitude * (1 - l * 0.2);
      const freq = frequency * (1 + l * 0.3);
      const ph = phase + l * 0.5;

      let d = `M 0 ${c.height}`;
      for (let x = 0; x <= c.width; x += 4) {
        const y = yOffset + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.3 + ph * 1.7) * (amp * 0.3);
        d += ` L ${x} ${y.toFixed(1)}`;
      }
      d += ` L ${c.width} ${c.height} Z`;

      const opacity = 0.3 + l * 0.2;
      const color = l % 2 === 0 ? c.color1 : c.color2;
      paths.push(`<path d="${d}" fill="${color}" opacity="${opacity}"/>`);
    }

    const svg = this.wrapSVG(c, paths.join("\n    "));
    return { svg, width: c.width, height: c.height, patternType: "waves", sizeBytes: svg.length };
  }

  /**
   * Generate a peaks/mountain pattern.
   */
  generatePeaks(config: Partial<PatternConfig> = {}): SVGResult {
    const c = this.mergeConfig(config);
    const layers = c.params.layers ?? 4;
    const roughness = c.params.roughness ?? 0.6;

    const paths: string[] = [];
    for (let l = 0; l < layers; l++) {
      const baseY = c.height * (0.4 + l * 0.12);
      let d = `M 0 ${c.height}`;

      for (let x = 0; x <= c.width; x += c.width / 40) {
        const noise = this.pseudoNoise(x * 0.01 + l * 10) * roughness * 60;
        const peak = Math.sin(x * 0.008 + l * 2) * 40 + Math.sin(x * 0.003) * 20;
        const y = baseY - peak - noise;
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      d += ` L ${c.width} ${c.height} Z`;

      const opacity = 0.3 + l * 0.15;
      const color = l % 2 === 0 ? c.color1 : c.color2;
      paths.push(`<path d="${d}" fill="${color}" opacity="${opacity}"/>`);
    }

    const svg = this.wrapSVG(c, paths.join("\n    "));
    return { svg, width: c.width, height: c.height, patternType: "peaks", sizeBytes: svg.length };
  }

  /**
   * Generate a blob/organic shape.
   */
  generateBlob(config: Partial<PatternConfig> = {}): SVGResult {
    const c = this.mergeConfig(config);
    const points = c.params.points ?? 8;
    const irregularity = c.params.irregularity ?? 0.5;
    const spikiness = c.params.spikiness ?? 0.3;

    const cx = c.width / 2;
    const cy = c.height / 2;
    const baseRadius = Math.min(c.width, c.height) * 0.35;

    const angleStep = (Math.PI * 2) / points;
    const pathPoints: Array<[number, number]> = [];

    for (let i = 0; i < points; i++) {
      const angle = i * angleStep;
      const radiusVar = baseRadius * (1 + (this.pseudoNoise(i * 7.3) - 0.5) * irregularity);
      const spike = baseRadius * spikiness * this.pseudoNoise(i * 3.7);
      const r = radiusVar + spike;

      pathPoints.push([
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r,
      ]);
    }

    // Smooth curve through points using cubic bezier
    let d = `M ${pathPoints[0][0].toFixed(1)} ${pathPoints[0][1].toFixed(1)}`;
    for (let i = 0; i < pathPoints.length; i++) {
      const curr = pathPoints[i];
      const next = pathPoints[(i + 1) % pathPoints.length];
      const prev = pathPoints[(i - 1 + pathPoints.length) % pathPoints.length];

      const cp1x = curr[0] + (next[0] - prev[0]) * 0.25;
      const cp1y = curr[1] + (next[1] - prev[1]) * 0.25;
      const cp2x = next[0] - (pathPoints[(i + 2) % pathPoints.length][0] - curr[0]) * 0.25;
      const cp2y = next[1] - (pathPoints[(i + 2) % pathPoints.length][1] - curr[1]) * 0.25;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${next[0].toFixed(1)} ${next[1].toFixed(1)}`;
    }
    d += " Z";

    const svg = this.wrapSVG(c, `<path d="${d}" fill="${c.color1}" opacity="${c.opacity}"/>`);
    return { svg, width: c.width, height: c.height, patternType: "blob", sizeBytes: svg.length };
  }

  /**
   * Generate a low-poly triangulated mesh.
   */
  generateLowPoly(config: Partial<PatternConfig> = {}): SVGResult {
    const c = this.mergeConfig(config);
    const cols = c.params.cols ?? 10;
    const rows = c.params.rows ?? 8;
    const jitter = c.params.jitter ?? 0.4;

    const cellW = c.width / cols;
    const cellH = c.height / rows;

    // Generate grid points with jitter
    const grid: Array<Array<[number, number]>> = [];
    for (let r = 0; r <= rows; r++) {
      const row: Array<[number, number]> = [];
      for (let col = 0; col <= cols; col++) {
        const jx = (col > 0 && col < cols) ? (this.pseudoNoise(r * 100 + col) - 0.5) * cellW * jitter : 0;
        const jy = (r > 0 && r < rows) ? (this.pseudoNoise(r * 100 + col + 50) - 0.5) * cellH * jitter : 0;
        row.push([col * cellW + jx, r * cellH + jy]);
      }
      grid.push(row);
    }

    // Generate triangles
    const triangles: string[] = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const tl = grid[r][col];
        const tr = grid[r][col + 1];
        const bl = grid[r + 1][col];
        const br = grid[r + 1][col + 1];

        // Two triangles per cell
        const colorIdx = this.pseudoNoise(r * cols + col);
        const h1 = 200 + Math.floor(colorIdx * 40);
        const h2 = 210 + Math.floor((1 - colorIdx) * 30);
        const s = 15 + Math.floor(colorIdx * 20);
        const l1 = 70 + Math.floor(colorIdx * 15);
        const l2 = 75 + Math.floor((1 - colorIdx) * 10);

        triangles.push(
          `<polygon points="${tl[0].toFixed(1)},${tl[1].toFixed(1)} ${tr[0].toFixed(1)},${tr[1].toFixed(1)} ${bl[0].toFixed(1)},${bl[1].toFixed(1)}" fill="hsl(${h1},${s}%,${l1}%)" opacity="0.9"/>`,
          `<polygon points="${tr[0].toFixed(1)},${tr[1].toFixed(1)} ${br[0].toFixed(1)},${br[1].toFixed(1)} ${bl[0].toFixed(1)},${bl[1].toFixed(1)}" fill="hsl(${h2},${s}%,${l2}%)" opacity="0.85"/>`,
        );
      }
    }

    const svg = this.wrapSVG(c, triangles.join("\n    "));
    return { svg, width: c.width, height: c.height, patternType: "low-poly", sizeBytes: svg.length };
  }

  /**
   * Generate a dots/circles pattern.
   */
  generateDots(config: Partial<PatternConfig> = {}): SVGResult {
    const c = this.mergeConfig(config);
    const spacing = c.params.spacing ?? 30;
    const radius = c.params.radius ?? 4;
    const stagger = c.params.stagger ?? true;

    const circles: string[] = [];
    let row = 0;
    for (let y = spacing / 2; y < c.height; y += spacing) {
      const offsetX = stagger && row % 2 === 1 ? spacing / 2 : 0;
      for (let x = spacing / 2 + offsetX; x < c.width; x += spacing) {
        const r = radius * (0.7 + this.pseudoNoise(x * 0.1 + y * 0.1) * 0.6);
        circles.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c.color1}" opacity="${c.opacity}"/>`);
      }
      row++;
    }

    const svg = this.wrapSVG(c, circles.join("\n    "));
    return { svg, width: c.width, height: c.height, patternType: "dots", sizeBytes: svg.length };
  }

  /**
   * Generate a hexagonal grid pattern.
   */
  generateHexagons(config: Partial<PatternConfig> = {}): SVGResult {
    const c = this.mergeConfig(config);
    const size = c.params.size ?? 25;

    const hexes: string[] = [];
    const h = size * Math.sqrt(3);
    let row = 0;
    for (let y = 0; y < c.height + h; y += h) {
      const offsetX = row % 2 === 1 ? size * 1.5 : 0;
      for (let x = 0; x < c.width + size * 3; x += size * 3) {
        const cx = x + offsetX;
        const cy = y;
        const points = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          points.push(`${(cx + size * Math.cos(angle)).toFixed(1)},${(cy + size * Math.sin(angle)).toFixed(1)}`);
        }
        const opacity = 0.1 + this.pseudoNoise(cx * 0.01 + cy * 0.01) * 0.4;
        hexes.push(`<polygon points="${points.join(" ")}" fill="${c.color1}" opacity="${opacity.toFixed(2)}" stroke="${c.color2}" stroke-width="0.5"/>`);
      }
      row++;
    }

    const svg = this.wrapSVG(c, hexes.join("\n    "));
    return { svg, width: c.width, height: c.height, patternType: "hexagons", sizeBytes: svg.length };
  }

  /**
   * Generate a zigzag divider.
   */
  generateZigzag(config: Partial<PatternConfig> = {}): SVGResult {
    const c = this.mergeConfig(config);
    const segments = c.params.segments ?? 12;
    const amplitude = c.params.amplitude ?? 20;

    const segWidth = c.width / segments;
    let d = `M 0 ${c.height / 2}`;
    for (let i = 0; i <= segments; i++) {
      const x = i * segWidth;
      const y = c.height / 2 + (i % 2 === 0 ? -amplitude : amplitude);
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }

    const svg = this.wrapSVG(c, `<path d="${d}" fill="none" stroke="${c.color1}" stroke-width="3" opacity="${c.opacity}"/>`);
    return { svg, width: c.width, height: c.height, patternType: "zigzag", sizeBytes: svg.length };
  }

  /**
   * Generate based on pattern type.
   */
  generate(type: PatternType, config: Partial<PatternConfig> = {}): SVGResult {
    switch (type) {
      case "waves": return this.generateWaves(config);
      case "peaks": return this.generatePeaks(config);
      case "blob": return this.generateBlob(config);
      case "low-poly": return this.generateLowPoly(config);
      case "dots": return this.generateDots(config);
      case "hexagons": return this.generateHexagons(config);
      case "zigzag": return this.generateZigzag(config);
      default: return this.generateWaves(config);
    }
  }

  /**
   * Get all available pattern types.
   */
  getPatternTypes(): Array<{ type: PatternType; name: string; description: string }> {
    return [
      { type: "waves", name: "Waves", description: "Layered sine wave patterns" },
      { type: "peaks", name: "Peaks", description: "Mountain/landscape silhouettes" },
      { type: "blob", name: "Blob", description: "Organic blob shapes" },
      { type: "low-poly", name: "Low Poly", description: "Triangulated mesh patterns" },
      { type: "dots", name: "Dots", description: "Dot grid patterns" },
      { type: "hexagons", name: "Hexagons", description: "Hexagonal grid patterns" },
      { type: "zigzag", name: "Zigzag", description: "Zigzag divider lines" },
      { type: "circles", name: "Circles", description: "Concentric circle patterns" },
      { type: "grid", name: "Grid", description: "Simple grid patterns" },
      { type: "diagonal", name: "Diagonal", description: "Diagonal stripe patterns" },
      { type: "triangles", name: "Triangles", description: "Triangle tessellation" },
      { type: "moire", name: "Moire", description: "Moiré interference patterns" },
    ];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private mergeConfig(partial: Partial<PatternConfig>): PatternConfig {
    return {
      width: partial.width ?? 800,
      height: partial.height ?? 400,
      color1: partial.color1 ?? "#6366f1",
      color2: partial.color2 ?? "#8b5cf6",
      bgColor: partial.bgColor ?? "#0f172a",
      opacity: partial.opacity ?? 0.6,
      params: partial.params ?? {},
    };
  }

  private wrapSVG(config: PatternConfig, content: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${config.width} ${config.height}" width="${config.width}" height="${config.height}">
    <rect width="100%" height="100%" fill="${config.bgColor}"/>
    ${content}
  </svg>`;
  }

  /** Deterministic pseudo-noise for reproducible patterns */
  private pseudoNoise(seed: number): number {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _generator: ParametricSVGGenerator | null = null;

export function getParametricSVG(): ParametricSVGGenerator {
  if (!_generator) _generator = new ParametricSVGGenerator();
  return _generator;
}

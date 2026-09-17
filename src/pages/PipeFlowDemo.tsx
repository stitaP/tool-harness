/**
 * Pipe Flow Thermal Demo
 * ──────────────────────
 * "Just show me the results."
 *
 * User enters 3 parameters:
 *   • Ambient temperature (°C)
 *   • Flow rate (LPM)
 *   • Pipe diameter (ft)
 *
 * The agent picks the right solver, mesh, and algorithm behind the scenes.
 * The user sees only the final velocity contour, temperature contour,
 * centerline profiles, and key metrics.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import {
  solvePipeFlow,
  extractCenterlineTemp,
  extractRadialProfile,
  generateContourData,
  type PipeFlowResult,
} from "@/lib/cfd/thermal";

// ─── Colormaps ──────────────────────────────────────────────────────────────

function jetColor(t: number): string {
  // t ∈ [0, 1] → blue → cyan → green → yellow → red
  const r = Math.min(255, Math.max(0, Math.round(255 * Math.min(4 * t - 1.5, -4 * t + 4.5))));
  const g = Math.min(255, Math.max(0, Math.round(255 * Math.min(4 * t - 0.5, -4 * t + 3.5))));
  const b = Math.min(255, Math.max(0, Math.round(255 * Math.min(4 * t + 0.5, -4 * t + 2.5))));
  return `rgb(${r},${g},${b})`;
}

function coolwarmColor(t: number): string {
  // t ∈ [0, 1] → dark blue → white → dark red
  const r = Math.round(t < 0.5 ? 59 + t * 2 * 196 : 255);
  const g = Math.round(t < 0.5 ? 76 + t * 2 * 179 : 76 + (1 - t) * 2 * 179);
  const b = Math.round(t < 0.5 ? 192 : 192 - (t - 0.5) * 2 * 133);
  return `rgb(${r},${g},${b})`;
}

// ─── Canvas Contour Renderer ────────────────────────────────────────────────

function drawContour(
  canvas: HTMLCanvasElement,
  data: { x: number; y: number; value: number }[],
  min: number,
  max: number,
  colorFn: (t: number) => string,
  label: string,
  unit: string,
  xLabel: string,
  yLabel: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const margin = { top: 30, right: 14, bottom: 40, left: 60 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;

  ctx.clearRect(0, 0, W, H);

  // Find bounds
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const d of data) {
    if (d.x < xMin) xMin = d.x;
    if (d.x > xMax) xMax = d.x;
    if (d.y < yMin) yMin = d.y;
    if (d.y > yMax) yMax = d.y;
  }

  // Build a lookup grid
  const res = 80;
  const grid: number[][] = Array.from({ length: res }, () => new Array(res).fill(0));

  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const tx = i / (res - 1);
      const ty = j / (res - 1);
      const targetX = xMin + tx * (xMax - xMin);
      const targetY = yMin + ty * (yMax - yMin);

      // Find nearest data point (data is in row-major from generateContourData)
      let bestDist = Infinity;
      let bestVal = 0;
      for (const d of data) {
        const dx = d.x - targetX;
        const dy = d.y - targetY;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestVal = d.value;
        }
      }
      grid[j][i] = bestVal;
    }
  }

  // Draw pixels
  const cellW = pw / res;
  const cellH = ph / res;
  const range = max - min || 1;

  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const t = Math.max(0, Math.min(1, (grid[res - 1 - j][i] - min) / range));
      ctx.fillStyle = colorFn(t);
      ctx.fillRect(
        margin.left + i * cellW,
        margin.top + j * cellH,
        Math.ceil(cellW) + 1,
        Math.ceil(cellH) + 1,
      );
    }
  }

  // Axes
  ctx.strokeStyle = "#4b5563";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + ph);
  ctx.lineTo(margin.left + pw, margin.top + ph);
  ctx.stroke();

  // X ticks
  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  for (let k = 0; k <= 4; k++) {
    const val = xMin + (k / 4) * (xMax - xMin);
    const px = margin.left + (k / 4) * pw;
    ctx.fillText(val.toFixed(1), px, margin.top + ph + 14);
    ctx.beginPath();
    ctx.moveTo(px, margin.top + ph);
    ctx.lineTo(px, margin.top + ph + 4);
    ctx.strokeStyle = "#4b5563";
    ctx.stroke();
  }
  ctx.fillText(xLabel, margin.left + pw / 2, H - 4);

  // Y ticks
  ctx.textAlign = "right";
  for (let k = 0; k <= 4; k++) {
    const val = yMin + (k / 4) * (yMax - yMin);
    const py = margin.top + ph - (k / 4) * ph;
    ctx.fillText(val.toFixed(3), margin.left - 4, py + 3);
  }
  ctx.save();
  ctx.translate(12, margin.top + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  // Title
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, margin.left + pw / 2, 18);

  // Colorbar
  const cbX = W - 12;
  const cbH = ph;
  const cbW = 8;
  for (let k = 0; k < cbH; k++) {
    const t = 1 - k / cbH;
    ctx.fillStyle = colorFn(t);
    ctx.fillRect(cbX, margin.top + k, cbW, 2);
  }
  ctx.fillStyle = "#9ca3af";
  ctx.font = "9px monospace";
  ctx.textAlign = "left";
  ctx.fillText(max.toFixed(1), cbX + cbW + 2, margin.top + 8);
  ctx.fillText(min.toFixed(1), cbX + cbW + 2, margin.top + cbH);
  ctx.fillStyle = "#6b7280";
  ctx.font = "9px sans-serif";
  ctx.fillText(unit, cbX + cbW + 2, margin.top + cbH / 2 + 3);
}

// ─── Line Chart Renderer ────────────────────────────────────────────────────

function drawLineChart(
  canvas: HTMLCanvasElement,
  series: Array<{ data: { x: number; y: number }[]; color: string; label: string }>,
  xLabel: string,
  yLabel: string,
  title: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const margin = { top: 30, right: 14, bottom: 40, left: 60 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;

  ctx.clearRect(0, 0, W, H);

  // Find bounds
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const s of series) {
    for (const d of s.data) {
      if (d.x < xMin) xMin = d.x;
      if (d.x > xMax) xMax = d.x;
      if (d.y < yMin) yMin = d.y;
      if (d.y > yMax) yMax = d.y;
    }
  }
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  yMin -= yRange * 0.05;
  yMax += yRange * 0.05;
  const yR = yMax - yMin;

  // Grid lines
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 0.5;
  for (let k = 0; k <= 5; k++) {
    const py = margin.top + (k / 5) * ph;
    ctx.beginPath();
    ctx.moveTo(margin.left, py);
    ctx.lineTo(margin.left + pw, py);
    ctx.stroke();
  }

  // Draw series
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    for (const d of s.data) {
      const px = margin.left + ((d.x - xMin) / xRange) * pw;
      const py = margin.top + ph - ((d.y - yMin) / yR) * ph;
      if (first) { ctx.moveTo(px, py); first = false; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = "#4b5563";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + ph);
  ctx.lineTo(margin.left + pw, margin.top + ph);
  ctx.stroke();

  // X ticks
  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  for (let k = 0; k <= 4; k++) {
    const val = xMin + (k / 4) * xRange;
    const px = margin.left + (k / 4) * pw;
    ctx.fillText(val.toFixed(1), px, margin.top + ph + 14);
  }
  ctx.fillText(xLabel, margin.left + pw / 2, H - 4);

  // Y ticks
  ctx.textAlign = "right";
  for (let k = 0; k <= 4; k++) {
    const val = yMin + (k / 4) * yR;
    const py = margin.top + ph - (k / 4) * ph;
    ctx.fillText(val.toFixed(2), margin.left - 4, py + 3);
  }
  ctx.save();
  ctx.translate(12, margin.top + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  // Title
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, margin.left + pw / 2, 18);

  // Legend
  let lx = margin.left + 8;
  ctx.font = "10px sans-serif";
  for (const s of series) {
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, margin.top + 4, 14, 3);
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "left";
    ctx.fillText(s.label, lx + 18, margin.top + 10);
    lx += ctx.measureText(s.label).width + 32;
  }
}

// ─── Metric Card ────────────────────────────────────────────────────────────

function Metric({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold" style={{ color: color || "#fff" }}>{value}</span>
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function PipeFlowDemo() {
  const [ambientTemp, setAmbientTemp] = useState(58);
  const [flowRate, setFlowRate] = useState(60);
  const [diameterFt, setDiameterFt] = useState(2);
  const [result, setResult] = useState<PipeFlowResult | null>(null);

  // Contour canvases
  const velCanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const centerTempCanvasRef = useRef<HTMLCanvasElement>(null);
  const centerVelCanvasRef = useRef<HTMLCanvasElement>(null);
  const radialTempCanvasRef = useRef<HTMLCanvasElement>(null);
  const radialVelCanvasRef = useRef<HTMLCanvasElement>(null);

  const [canvasSize, setCanvasSize] = useState({ w: 520, h: 280 });

  // Responsive canvas sizing
  useEffect(() => {
    function handleResize() {
      const w = Math.min(560, Math.max(320, window.innerWidth * 0.42));
      setCanvasSize({ w, h: Math.round(w * 0.52) });
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Run the solver
  const runSolver = useCallback(() => {
    const diameterM = diameterFt * 0.3048;
    const r = solvePipeFlow({
      diameter: diameterM,
      length: diameterM * 16, // ~16 diameters long
      flowRateLPM: flowRate,
      sunTempC: ambientTemp,
      inletTempC: 25,
      ni: 60,
      nj: 24,
    });
    setResult(r);
  }, [ambientTemp, flowRate, diameterFt]);

  // Auto-run on mount and parameter change
  useEffect(() => {
    runSolver();
  }, [runSolver]);

  // Draw contours when result changes
  useEffect(() => {
    if (!result) return;

    const velData = generateContourData(result, "velocity", 40);
    const tempData = generateContourData(result, "temperature", 40);

    const velMin = Math.min(...velData.map((d) => d.value));
    const velMax = Math.max(...velData.map((d) => d.value));
    const tempMin = Math.min(...tempData.map((d) => d.value));
    const tempMax = Math.max(...tempData.map((d) => d.value));

    if (velCanvasRef.current) {
      drawContour(
        velCanvasRef.current, velData, velMin, velMax, jetColor,
        "Velocity Contour", "m/s", "Axial (m)", "Radial (m)",
      );
    }
    if (tempCanvasRef.current) {
      drawContour(
        tempCanvasRef.current, tempData, tempMin, tempMax, coolwarmColor,
        "Temperature Contour", "°C", "Axial (m)", "Radial (m)",
      );
    }

    // Centerline profiles
    const centerline = extractCenterlineTemp(result);
    if (centerTempCanvasRef.current) {
      drawLineChart(
        centerTempCanvasRef.current,
        [{ data: centerline.map((c) => ({ x: c.x, y: c.T })), color: "#ef4444", label: "Temperature" }],
        "Axial Position (m)", "Temperature (°C)", "Centerline Temperature",
      );
    }
    if (centerVelCanvasRef.current) {
      drawLineChart(
        centerVelCanvasRef.current,
        [{ data: centerline.map((c) => ({ x: c.x, y: c.u })), color: "#3b82f6", label: "Velocity" }],
        "Axial Position (m)", "Velocity (m/s)", "Centerline Velocity",
      );
    }

    // Radial profiles
    const radialInlet = extractRadialProfile(result, 0.0);
    const radialMid = extractRadialProfile(result, 0.5);
    const radialOutlet = extractRadialProfile(result, 1.0);
    if (radialTempCanvasRef.current) {
      drawLineChart(
        radialTempCanvasRef.current,
        [
          { data: radialInlet.map((r) => ({ x: r.r, y: r.T })), color: "#3b82f6", label: "Inlet" },
          { data: radialMid.map((r) => ({ x: r.r, y: r.T })), color: "#f59e0b", label: "Mid-pipe" },
          { data: radialOutlet.map((r) => ({ x: r.r, y: r.T })), color: "#ef4444", label: "Outlet" },
        ],
        "r/R (normalized)", "Temperature (°C)", "Radial Temperature Profile",
      );
    }
    if (radialVelCanvasRef.current) {
      drawLineChart(
        radialVelCanvasRef.current,
        [
          { data: radialInlet.map((r) => ({ x: r.r, y: r.u })), color: "#3b82f6", label: "Inlet" },
          { data: radialMid.map((r) => ({ x: r.r, y: r.u })), color: "#f59e0b", label: "Mid-pipe" },
          { data: radialOutlet.map((r) => ({ x: r.r, y: r.u })), color: "#ef4444", label: "Outlet" },
        ],
        "r/R (normalized)", "Velocity (m/s)", "Radial Velocity Profile",
      );
    }
  }, [result, canvasSize]);

  const params = result?.params;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteNav />
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">
            <span className="bg-gradient-to-r from-orange-400 via-red-400 to-pink-400 bg-clip-text text-transparent">
              Pipe Flow Thermal Analysis
            </span>
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Enter your parameters. The agent picks the right solver and shows you the answer.
          </p>
        </div>

        {/* Input Panel */}
        <div className="mx-auto mb-8 max-w-3xl rounded-2xl border border-gray-800 bg-gray-900/80 p-6 backdrop-blur">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {/* Ambient Temperature */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                ☀️ Ambient Temperature
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={-20}
                  max={120}
                  step={1}
                  value={ambientTemp}
                  onChange={(e) => setAmbientTemp(Number(e.target.value))}
                  className="flex-1 accent-orange-500"
                />
                <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1">
                  <input
                    type="number"
                    value={ambientTemp}
                    onChange={(e) => setAmbientTemp(Number(e.target.value))}
                    className="w-12 bg-transparent text-center text-sm font-bold text-white outline-none"
                  />
                  <span className="text-xs text-gray-500">°C</span>
                </div>
              </div>
            </div>

            {/* Flow Rate */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                💧 Flow Rate
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={500}
                  step={1}
                  value={flowRate}
                  onChange={(e) => setFlowRate(Number(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
                <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1">
                  <input
                    type="number"
                    value={flowRate}
                    onChange={(e) => setFlowRate(Number(e.target.value))}
                    className="w-12 bg-transparent text-center text-sm font-bold text-white outline-none"
                  />
                  <span className="text-xs text-gray-500">LPM</span>
                </div>
              </div>
            </div>

            {/* Pipe Diameter */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                🔧 Pipe Diameter
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.5}
                  max={6}
                  step={0.1}
                  value={diameterFt}
                  onChange={(e) => setDiameterFt(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1">
                  <input
                    type="number"
                    value={diameterFt}
                    step={0.1}
                    onChange={(e) => setDiameterFt(Number(e.target.value))}
                    className="w-12 bg-transparent text-center text-sm font-bold text-white outline-none"
                  />
                  <span className="text-xs text-gray-500">ft</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick presets */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-[10px] text-gray-600 self-center mr-1">PRESETS:</span>
            {[
              { label: "Hot Sun (58°C, 60LPM, 2ft)", a: 58, f: 60, d: 2 },
              { label: "Cold Pipe (-5°C, 100LPM, 4in)", a: -5, f: 100, d: 0.333 },
              { label: "Industrial (80°C, 300LPM, 6in)", a: 80, f: 300, d: 0.5 },
              { label: "Low Flow (30°C, 5LPM, 1ft)", a: 30, f: 5, d: 1 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => { setAmbientTemp(p.a); setFlowRate(p.f); setDiameterFt(p.d); }}
                className="rounded-full border border-gray-700 bg-gray-800/60 px-3 py-1 text-[10px] text-gray-400 hover:border-gray-500 hover:text-white transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {result && (
          <>
            {/* Key Metrics */}
            <div className="mx-auto mb-8 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <Metric label="Reynolds Number" value={params!.reynoldsNumber.toFixed(0)} color="#8b5cf6" />
              <Metric
                label="Flow Regime"
                value={params!.reynoldsNumber < 2300 ? "Laminar" : params!.reynoldsNumber < 4000 ? "Transitional" : "Turbulent"}
                color={params!.reynoldsNumber < 2300 ? "#10b981" : params!.reynoldsNumber < 4000 ? "#f59e0b" : "#ef4444"}
              />
              <Metric label="Mean Velocity" value={params!.meanVelocity.toFixed(4)} unit="m/s" color="#3b82f6" />
              <Metric label="Outlet Temp" value={params!.bulkTempOutlet.toFixed(2)} unit="°C" color="#f59e0b" />
              <Metric label="Temp Rise" value={(params!.bulkTempOutlet - params!.bulkTempInlet).toFixed(2)} unit="°C" color="#ef4444" />
              <Metric label="Pressure Drop" value={params!.pressureDrop.toFixed(1)} unit="Pa" color="#06b6d4" />
              <Metric label="Nusselt Number" value={params!.nusseltNumber.toFixed(2)} color="#a855f7" />
              <Metric label="Friction Factor" value={params!.frictionFactor.toFixed(6)} color="#64748b" />
              <Metric label="Total Heat Gain" value={params!.totalHeatGain.toFixed(1)} unit="W" color="#f97316" />
              <Metric label="Max Temperature" value={params!.maxTemp.toFixed(2)} unit="°C" color="#dc2626" />
              <Metric label="Heat Flux (avg)" value={params!.heatFlux.toFixed(1)} unit="W/m²" color="#fb923c" />
              <Metric label="Pipe Length" value={((diameterFt * 0.3048 * 16)).toFixed(2)} unit="m" color="#6b7280" />
            </div>

            {/* Contour Plots */}
            <div className="mx-auto mb-8 max-w-6xl">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <canvas
                    ref={velCanvasRef}
                    width={canvasSize.w}
                    height={canvasSize.h}
                    className="w-full"
                  />
                </div>
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <canvas
                    ref={tempCanvasRef}
                    width={canvasSize.w}
                    height={canvasSize.h}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Line Charts */}
            <div className="mx-auto mb-8 max-w-6xl">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <canvas
                    ref={centerTempCanvasRef}
                    width={canvasSize.w}
                    height={canvasSize.h}
                    className="w-full"
                  />
                </div>
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <canvas
                    ref={centerVelCanvasRef}
                    width={canvasSize.w}
                    height={canvasSize.h}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Radial Profiles */}
            <div className="mx-auto mb-8 max-w-6xl">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <canvas
                    ref={radialTempCanvasRef}
                    width={canvasSize.w}
                    height={canvasSize.h}
                    className="w-full"
                  />
                </div>
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <canvas
                    ref={radialVelCanvasRef}
                    width={canvasSize.w}
                    height={canvasSize.h}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="mx-auto max-w-3xl rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Result Summary</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Inlet water temp</span>
                  <span className="text-white font-mono">{params!.bulkTempInlet.toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Outlet bulk temp</span>
                  <span className="text-orange-400 font-mono">{params!.bulkTempOutlet.toFixed(2)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Temperature rise</span>
                  <span className="text-red-400 font-mono">+{(params!.bulkTempOutlet - params!.bulkTempInlet).toFixed(2)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Max wall temp</span>
                  <span className="text-red-300 font-mono">{params!.maxTemp.toFixed(2)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Reynolds number</span>
                  <span className="text-violet-400 font-mono">{params!.reynoldsNumber.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Flow regime</span>
                  <span className="text-emerald-400 font-mono">
                    {params!.reynoldsNumber < 2300 ? "Laminar" : params!.reynoldsNumber < 4000 ? "Transitional" : "Turbulent"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total heat absorbed</span>
                  <span className="text-amber-400 font-mono">{params!.totalHeatGain.toFixed(1)} W</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Pressure drop</span>
                  <span className="text-cyan-400 font-mono">{params!.pressureDrop.toFixed(2)} Pa</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

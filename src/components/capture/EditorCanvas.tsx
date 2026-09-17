import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Ban,
  Crop,
  Eye,
  Highlighter,
  Layers2,
  ListOrdered,
  MessageSquarePlus,
  MousePointer2,
  Redo2,
  ScanSearch,
  Square,
  SquareDashed,
  Type,
  Undo2,
  Ungroup,
  Waves,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  Annotation,
  AnnotationKind,
  Point,
  SVG_NS,
} from "@/lib/capture/types";
import { annotationToXml } from "@/lib/capture/svg";
import { groupsOf } from "@/lib/capture/edit";
import { cn } from "@/lib/utils";

export type ToolKind = "select" | AnnotationKind | "crop" | "redact";

export interface ToolProps {
  color: string;
  strokeWidth: number;
  fontSize: number;
  highlightOpacity: number;
  maskOpacity: number;
  blurRadius: number;
  magnifierZoom: number;
}

export const DEFAULT_TOOL_PROPS: ToolProps = {
  color: "#111111",
  strokeWidth: 3,
  fontSize: 16,
  highlightOpacity: 0.35,
  maskOpacity: 0.92,
  blurRadius: 6,
  magnifierZoom: 2.5,
};

export const COLOR_SWATCHES = ["#111111", "#525252", "#dc2626", "#2563eb"];
const WIDTHS = [2, 3, 5, 7];
const SIZES = [12, 14, 16, 20, 24];
const BLUR_RADII = [3, 6, 10, 16, 24];
const MAG_ZOOMS = [2, 2.5, 3, 4];

interface EditorCanvasProps {
  svg: string;
  annotations: Annotation[];
  tool: ToolKind;
  onToolChange: (tool: ToolKind) => void;
  toolProps: ToolProps;
  onToolPropsChange: (patch: Partial<ToolProps>) => void;
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  onCommitAnnotation: (ann: Annotation) => void;
  onCommitCrop: (rect: { x: number; y: number; width: number; height: number }) => void;
  onCommitRedact: (rect: { x: number; y: number; width: number; height: number }) => void;
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  onBatchUpdate: (updates: Array<{ id: string; patch: Partial<Annotation> }>) => void;
  onDeleteSelected: (ids: string[]) => void;
  onGroup: (ids: string[]) => void;
  onFlatten: (groupId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  stepCounter: number;
}

const TOOLS: { kind: ToolKind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { kind: "select", label: "Select", icon: MousePointer2 },
  { kind: "arrow", label: "Arrow", icon: ArrowUpRight },
  { kind: "rect", label: "Rectangle", icon: Square },
  { kind: "text", label: "Text", icon: Type },
  { kind: "callout", label: "Callout", icon: MessageSquarePlus },
  { kind: "step", label: "Step marker", icon: ListOrdered },
  { kind: "highlight", label: "Highlight", icon: Highlighter },
  { kind: "mask", label: "Mask", icon: SquareDashed },
  { kind: "blur", label: "Blur", icon: Waves },
  { kind: "magnifier", label: "Magnifier", icon: ScanSearch },
  { kind: "crop", label: "Crop", icon: Crop },
  { kind: "redact", label: "Redact", icon: Ban },
];

function translateAnnotation(a: Annotation, d: Point): Annotation {
  switch (a.kind) {
    case "arrow":
      return {
        ...a,
        start: { x: a.start.x + d.x, y: a.start.y + d.y },
        end: { x: a.end.x + d.x, y: a.end.y + d.y },
      };
    case "rect":
    case "highlight":
    case "mask":
    case "blur":
      return { ...a, x: a.x + d.x, y: a.y + d.y };
    case "text":
      return { ...a, x: a.x + d.x, y: a.y + d.y };
    case "callout":
      return {
        ...a,
        anchor: { x: a.anchor.x + d.x, y: a.anchor.y + d.y },
        end: { x: a.end.x + d.x, y: a.end.y + d.y },
      };
    case "step":
      return { ...a, x: a.x + d.x, y: a.y + d.y };
    case "magnifier":
      return { ...a, x: a.x + d.x, y: a.y + d.y };
  }
}

export function EditorCanvas(props: EditorCanvasProps) {
  const {
    svg,
    annotations,
    tool,
    onToolChange,
    toolProps,
    onToolPropsChange,
    selectedIds,
    onSelectIds,
    onCommitAnnotation,
    onCommitCrop,
    onCommitRedact,
    onUpdateAnnotation,
    onBatchUpdate,
    onDeleteSelected,
    onGroup,
    onFlatten,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    stepCounter,
  } = props;

  const viewportRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgElRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(0.5);
  const [draft, setDraft] = useState<
    { kind: AnnotationKind | "crop" | "redact"; start: Point; current: Point } | null
  >(null);
  const moveRef = useRef<{ ids: string[]; start: Point; originals: Annotation[] } | null>(null);
  const [textEdit, setTextEdit] = useState<{ id: string; x: number; y: number; value: string } | null>(null);
  const [svgDims, setSvgDims] = useState<{ width: number; height: number } | null>(null);

  const inlineSvg = useMemo(() => svg.replace(/^<\?xml[^>]*\?>\s*/, ""), [svg]);

  // Re-bind the live SVG element whenever the serialized document changes.
  useEffect(() => {
    const el = wrapRef.current?.querySelector("svg") as SVGSVGElement | null;
    svgElRef.current = el;
    if (el) {
      setSvgDims({
        width: Number.parseFloat(el.getAttribute("width") ?? "0"),
        height: Number.parseFloat(el.getAttribute("height") ?? "0"),
      });
    }
  }, [svg]);

  // Auto-fit when a new document is loaded.
  useEffect(() => {
    if (!svgDims || !viewportRef.current) return;
    const avail = viewportRef.current.clientWidth - 72;
    const z = Math.min(1, Math.max(0.1, avail / Math.max(1, svgDims.width)));
    setZoom(Math.round(z * 100) / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgDims?.width]);

  const toSvgPoint = (e: { clientX: number; clientY: number }): Point => {
    const svgEl = svgElRef.current;
    if (!svgEl) return { x: 0, y: 0 };
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  /* ---------- preview helpers ---------- */

  const ensureMarker = (color: string) => {
    const svgEl = svgElRef.current;
    if (!svgEl) return;
    const id = `arrowhead-${color.replace(/^#/, "")}`;
    if (svgEl.querySelector(`#${id}`)) return;
    const marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", id);
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto-start-reverse");
    marker.setAttribute("markerUnits", "strokeWidth");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M0,0 L0,6 L9,3 z");
    path.setAttribute("fill", color);
    marker.appendChild(path);
    let defs = svgEl.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(SVG_NS, "defs");
      svgEl.insertBefore(defs, svgEl.firstChild);
    }
    defs.appendChild(marker);
  };

  const renderPreview = (d: { kind: AnnotationKind | "crop" | "redact"; start: Point; current: Point }) => {
    const svgEl = svgElRef.current;
    if (!svgEl) return;
    let preview = svgEl.querySelector("#stitap-preview") as SVGGElement | null;
    if (!preview) {
      preview = document.createElementNS(SVG_NS, "g");
      preview.setAttribute("id", "stitap-preview");
      preview.setAttribute("pointer-events", "none");
      svgEl.appendChild(preview);
    }
    const x = Math.min(d.start.x, d.current.x);
    const y = Math.min(d.start.y, d.current.y);
    const w = Math.abs(d.current.x - d.start.x);
    const h = Math.abs(d.current.y - d.start.y);
    const id = "preview";
    const custom = (() => {
      switch (d.kind) {
        case "blur":
          return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#18181b" opacity="0.05" stroke="#525252" stroke-width="1" stroke-dasharray="4 3"/>`;
        case "crop":
          return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(37,99,235,0.06)" stroke="#2563eb" stroke-width="1.25" stroke-dasharray="5 4"/>`;
        case "redact":
          return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#18181b" opacity="0.6"/><text x="${x + 6}" y="${y + 14}" font-family="Inter, system-ui, sans-serif" font-size="11" letter-spacing="1.5" fill="#ffffff" opacity="0.9">REDACT</text>`;
        case "magnifier": {
          const r = Math.max(8, Math.hypot(d.current.x - d.start.x, d.current.y - d.start.y));
          const z = toolProps.magnifierZoom;
          const tx = d.start.x * (1 - z);
          const ty = d.start.y * (1 - z);
          return `<clipPath id="mag-preview-clip"><circle cx="${d.start.x}" cy="${d.start.y}" r="${r}"/></clipPath>
<g clip-path="url(#mag-preview-clip)"><use href="#base-capture" transform="translate(${tx} ${ty}) scale(${z})"/></g>
<circle cx="${d.start.x}" cy="${d.start.y}" r="${r}" fill="none" stroke="${toolProps.color}" stroke-width="2"/>
<line x1="${d.start.x - r}" y1="${d.start.y}" x2="${d.start.x + r}" y2="${d.start.y}" stroke="${toolProps.color}" stroke-width="1" opacity="0.4"/>
<line x1="${d.start.x}" y1="${d.start.y - r}" x2="${d.start.x}" y2="${d.start.y + r}" stroke="${toolProps.color}" stroke-width="1" opacity="0.4"/>
<text x="${d.start.x + r - 4}" y="${d.start.y + r - 6}" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="600" fill="${toolProps.color}">${z}×</text>`;
        }
        default:
          return null;
      }
    })();
    if (custom) {
      preview.innerHTML = custom;
      return;
    }
    let ann: Annotation;
    switch (d.kind) {
      case "arrow":
        ensureMarker(toolProps.color);
        ann = { id, kind: "arrow", visible: true, start: d.start, end: d.current, stroke: toolProps.color, strokeWidth: toolProps.strokeWidth };
        break;
      case "rect":
        ann = { id, kind: "rect", visible: true, x, y, width: w, height: h, rx: 4, stroke: toolProps.color, strokeWidth: toolProps.strokeWidth, fill: "transparent" };
        break;
      case "callout":
        ann = { id, kind: "callout", visible: true, anchor: d.start, end: d.current, text: " ", stroke: toolProps.color, fontSize: toolProps.fontSize, fill: toolProps.color };
        break;
      case "highlight":
        ann = { id, kind: "highlight", visible: true, x, y, width: w, height: h, fill: toolProps.color, opacity: toolProps.highlightOpacity };
        break;
      case "mask":
        ann = { id, kind: "mask", visible: true, x, y, width: w, height: h, fill: "#111111", opacity: toolProps.maskOpacity, label: true };
        break;
      default:
        return;
    }
    preview.innerHTML = annotationToXml(ann);
  };

  const clearPreview = () => {
    svgElRef.current?.querySelector("#stitap-preview")?.remove();
  };

  /* ---------- pointer interaction ---------- */

  const onPointerDown = (e: React.PointerEvent) => {
    const svgEl = svgElRef.current;
    if (!svgEl) return;
    if (textEdit) return;
    const pt = toSvgPoint(e);
    const target = (e.target as Element).closest?.("[data-annotation]") as Element | null;

    if (tool === "select") {
      if (target) {
        const id = target.getAttribute("data-id");
        const original = id ? annotations.find((a) => a.id === id) : undefined;
        if (id && original) {
          const after = e.shiftKey
            ? selectedIds.includes(id)
              ? selectedIds.filter((s) => s !== id)
              : [...selectedIds, id]
            : [id];
          onSelectIds(after);
          const originals = after
            .map((i) => annotations.find((a) => a.id === i))
            .filter((a): a is Annotation => !!a);
          if (originals.length > 0) {
            moveRef.current = { ids: after, start: pt, originals };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
        }
        return;
      }
      onSelectIds([]);
      return;
    }

    if (tool === "text") {
      const id = `ann-${Date.now().toString(36)}`;
      onCommitAnnotation({ id, kind: "text", visible: true, x: pt.x, y: pt.y, text: "", fontSize: toolProps.fontSize, fill: toolProps.color, fontWeight: 500, align: "start" });
      setTextEdit({ id, x: pt.x, y: pt.y, value: "" });
      return;
    }

    if (tool === "step") {
      onCommitAnnotation({ id: `ann-${Date.now().toString(36)}`, kind: "step", visible: true, x: pt.x, y: pt.y, number: stepCounter, fill: "#111111" });
      return;
    }

    const kind = tool as AnnotationKind | "crop" | "redact";
    setDraft({ kind, start: pt, current: pt });
    renderPreview({ kind, start: pt, current: pt });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (textEdit) return;
    if (draft) {
      const pt = toSvgPoint(e);
      const next = { ...draft, current: pt };
      setDraft(next);
      renderPreview(next);
      return;
    }
    const move = moveRef.current;
    if (move) {
      const pt = toSvgPoint(e);
      const dx = pt.x - move.start.x;
      const dy = pt.y - move.start.y;
      for (const id of move.ids) {
        const group = svgElRef.current?.querySelector(`[data-id="${id}"]`);
        if (group) {
          group.setAttribute("transform", `translate(${dx.toFixed(2)}, ${dy.toFixed(2)})`);
        }
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const move = moveRef.current;
    if (move) {
      const pt = toSvgPoint(e);
      const dx = pt.x - move.start.x;
      const dy = pt.y - move.start.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        onBatchUpdate(
          move.originals.map((original) => ({
            id: original.id,
            patch: translateAnnotation(original, { x: dx, y: dy }),
          })),
        );
      }
      moveRef.current = null;
      return;
    }
    if (draft) {
      const pt = toSvgPoint(e);
      const final = { ...draft, current: pt };
      setDraft(null);
      clearPreview();
      const x = Math.min(final.start.x, final.current.x);
      const y = Math.min(final.start.y, final.current.y);
      const w = Math.abs(final.current.x - final.start.x);
      const h = Math.abs(final.current.y - final.start.y);
      if (w < 2 && h < 2) return;
      const id = `ann-${Date.now().toString(36)}`;
      switch (final.kind) {
        case "arrow":
          onCommitAnnotation({ id, kind: "arrow", visible: true, start: final.start, end: final.current, stroke: toolProps.color, strokeWidth: toolProps.strokeWidth });
          break;
        case "rect":
          onCommitAnnotation({ id, kind: "rect", visible: true, x, y, width: w, height: h, rx: 4, stroke: toolProps.color, strokeWidth: toolProps.strokeWidth, fill: "transparent" });
          break;
        case "callout": {
          onCommitAnnotation({ id, kind: "callout", visible: true, anchor: final.start, end: final.current, text: "", stroke: toolProps.color, fontSize: toolProps.fontSize, fill: toolProps.color });
          setTextEdit({ id, x: final.current.x + 8, y: final.current.y, value: "" });
          break;
        }
        case "highlight":
          onCommitAnnotation({ id, kind: "highlight", visible: true, x, y, width: w, height: h, fill: toolProps.color, opacity: toolProps.highlightOpacity });
          break;
        case "mask":
          onCommitAnnotation({ id, kind: "mask", visible: true, x, y, width: w, height: h, fill: "#111111", opacity: toolProps.maskOpacity, label: true });
          break;
        case "blur":
          onCommitAnnotation({ id, kind: "blur", visible: true, x, y, width: w, height: h, radius: toolProps.blurRadius });
          break;
        case "magnifier":
          onCommitAnnotation({
            id,
            kind: "magnifier",
            visible: true,
            x: final.start.x,
            y: final.start.y,
            radius: Math.max(8, Math.hypot(final.current.x - final.start.x, final.current.y - final.start.y)),
            zoom: toolProps.magnifierZoom,
            stroke: toolProps.color,
          });
          break;
        case "crop":
          onCommitCrop({ x, y, width: w, height: h });
          break;
        case "redact":
          onCommitRedact({ x, y, width: w, height: h });
          break;
      }
    }
  };

  const commitText = () => {
    if (!textEdit) return;
    const value = textEdit.value.trim();
    if (value) {
      onUpdateAnnotation(textEdit.id, { text: value });
    } else {
      onDeleteSelected([textEdit.id]);
    }
    setTextEdit(null);
  };

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        e.preventDefault();
        onDeleteSelected(selectedIds);
      }
      if (e.key === "Escape") {
        onSelectIds([]);
        setTextEdit(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, onDeleteSelected, onSelectIds, onUndo, onRedo]);

  /* ---------- selection ring ---------- */

  useEffect(() => {
    const svgEl = svgElRef.current;
    if (!svgEl) return;
    svgEl.querySelectorAll("[data-annotation]").forEach((g) => {
      g.setAttribute(
        "data-selected",
        selectedIds.includes(g.getAttribute("data-id") ?? "") ? "true" : "false",
      );
    });
    svgEl.querySelectorAll("[id^=stitap-selection']").forEach((r) => r.remove());
    for (const id of selectedIds) {
      const g = svgEl.querySelector(`[data-id="${id}"]`);
      if (!g) continue;
      const b = (g as SVGGElement).getBBox();
      const ring = document.createElementNS(SVG_NS, "rect");
      ring.setAttribute("id", `stitap-selection-${id}`);
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", "#18181b");
      ring.setAttribute("stroke-dasharray", "4 3");
      ring.setAttribute("stroke-width", "1.25");
      ring.setAttribute("pointer-events", "none");
      ring.setAttribute("x", String(b.x - 5));
      ring.setAttribute("y", String(b.y - 5));
      ring.setAttribute("width", String(b.width + 10));
      ring.setAttribute("height", String(b.height + 10));
      svgEl.appendChild(ring);
    }
  }, [selectedIds, svg]);

  const setZoomBy = (delta: number) =>
    setZoom((z) => Math.min(3, Math.max(0.1, Math.round((z + delta) * 100) / 100)));

  const toolLabel = TOOLS.find((t) => t.kind === tool)?.label ?? "Select";
  const selectedGroups = groupsOf(annotations, selectedIds);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-white px-3 py-2">
        <div className="flex items-center gap-0.5">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const active = tool === t.kind;
            return (
              <button
                key={t.kind}
                title={t.label}
                onClick={() => {
                  onSelectIds([]);
                  onToolChange(t.kind);
                }}
                className={cn(
                  "grid size-8 place-items-center rounded-md transition-colors",
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
        <div className="mx-2 h-5 w-px bg-zinc-200" />
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          className="grid size-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30"
        >
          <Undo2 className="size-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (⇧⌘Z)"
          className="grid size-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30"
        >
          <Redo2 className="size-4" />
        </button>
        <div className="mx-2 h-5 w-px bg-zinc-200" />
        {selectedGroups.length === 1 && (
          <button
            onClick={() => onFlatten(selectedGroups[0])}
            title="Flatten layer group"
            className="grid size-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Ungroup className="size-4" />
          </button>
        )}
        {selectedIds.length >= 2 && (
          <button
            onClick={() => onGroup(selectedIds)}
            title={`Group ${selectedIds.length} layers`}
            className="grid size-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Layers2 className="size-4" />
          </button>
        )}
        <div className="mx-2 h-5 w-px bg-zinc-200" />
        {(tool === "arrow" || tool === "rect") && (
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              Stroke
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  title={c}
                  onClick={() => onToolPropsChange({ color: c })}
                  className={cn(
                    "size-4 rounded-full border border-black/10 transition-transform hover:scale-110",
                    toolProps.color === c && "ring-2 ring-zinc-900 ring-offset-1",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
            <span className="flex items-center gap-1.5">
              Width
              {WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => onToolPropsChange({ strokeWidth: w })}
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono transition-colors",
                    toolProps.strokeWidth === w
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-400",
                  )}
                >
                  {w}
                </button>
              ))}
            </span>
          </div>
        )}
        {tool === "blur" && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span>Blur</span>
            {BLUR_RADII.map((r) => (
              <button
                key={r}
                onClick={() => onToolPropsChange({ blurRadius: r })}
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono transition-colors",
                  toolProps.blurRadius === r
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-400",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        {(tool === "text" || tool === "callout") && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span>Size</span>
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => onToolPropsChange({ fontSize: s })}
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono transition-colors",
                  toolProps.fontSize === s
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-400",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {tool === "magnifier" && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span>Zoom</span>
            {MAG_ZOOMS.map((z) => (
              <button
                key={z}
                onClick={() => onToolPropsChange({ magnifierZoom: z })}
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono transition-colors",
                  toolProps.magnifierZoom === z
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-400",
                )}
              >
                {z}×
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setZoomBy(-0.1)}
            title="Zoom out"
            className="grid size-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="w-12 text-center font-mono text-[11px] text-zinc-500">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoomBy(0.1)}
            title="Zoom in"
            className="grid size-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={viewportRef} className="relative flex-1 overflow-auto bg-zinc-100/70">
        <div className="flex min-h-full min-w-full items-start justify-center p-8">
          <div
            ref={wrapRef}
            className="relative ring-1 ring-zinc-200"
            style={{
              width: svgDims?.width,
              height: svgDims?.height,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div
              data-stitap-editor
              className="bg-white shadow-sm"
              dangerouslySetInnerHTML={{ __html: inlineSvg }}
              style={{ cursor: tool === "select" ? "default" : "crosshair" }}
            />
            {textEdit && (
              <input
                autoFocus
                value={textEdit.value}
                onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitText();
                  if (e.key === "Escape") {
                    onDeleteSelected([textEdit.id]);
                    setTextEdit(null);
                  }
                }}
                onBlur={commitText}
                placeholder="Type annotation text…"
                className="absolute z-10 min-w-40 rounded-md border border-zinc-900 bg-white px-2 py-1 text-[13px] shadow-md outline-none"
                style={{ left: textEdit.x, top: textEdit.y - 6 }}
              />
            )}
          </div>
        </div>
        <style>{`[data-stitap-editor] > svg { display: block; } [data-stitap-editor] [data-annotation] { cursor: move; }`}</style>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-zinc-200 bg-white px-4 py-1.5 text-[11px] text-zinc-400">
        <span>{svgDims ? `${svgDims.width} × ${svgDims.height} px · CSS pixels` : ""}</span>
        <span className="flex items-center gap-3">
          {tool !== "select" && (
            <span className="flex items-center gap-1 text-zinc-500">
              <Eye className="size-3" />
              {tool === "mask"
                ? "Mask covers content visually — not secure redaction"
                : tool === "redact"
                  ? "Redact — destroys source pixels and covered text/metadata"
                  : tool === "crop"
                    ? "Crop — trims the capture to this rectangle"
                    : tool === "magnifier"
                      ? "Magnifier — drag outward from the focal point to size the lens"
                      : `${toolLabel} — drag on the canvas`}
            </span>
          )}
          {annotations.length > 0 && (
            <span>
              {annotations.length} annotation{annotations.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

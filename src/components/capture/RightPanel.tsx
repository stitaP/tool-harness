import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileArchive,
  FileDown,
  FileJson,
  FolderOpen,
  RefreshCw,
  FileText,
  Highlighter,
  Image,
  Layers,
  Layers2,
  ListChecks,
  ListOrdered,
  Lock,
  MessageSquarePlus,
  PenLine,
  Save,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Square,
  SquareDashed,
  Trash2,
  Type,
  Unlock,
  Waves,
  XCircle,
} from "lucide-react";
import type {
  Annotation,
  AnnotationKind,
  CaptureDocument,
  CaptureMetadataModel,
  HybridReport,
  ValidationReport,
} from "@/lib/capture/types";
import type { VisualCompareReport } from "@/lib/capture/visualCompare";
import { SLICE_MAX_HEIGHT } from "@/lib/capture/edit";
import { COLOR_SWATCHES } from "./EditorCanvas";
import { IntelligenceTab } from "./IntelligenceTab";
import { cn } from "@/lib/utils";

export type RightTab = "annotate" | "layers" | "metadata" | "export" | "intelligence";

const KIND_META: Record<AnnotationKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  arrow: { label: "Arrow", icon: ArrowUpRight },
  rect: { label: "Rectangle", icon: Square },
  text: { label: "Text", icon: Type },
  callout: { label: "Callout", icon: MessageSquarePlus },
  step: { label: "Step marker", icon: ListOrdered },
  highlight: { label: "Highlight", icon: Highlighter },
  mask: { label: "Mask", icon: SquareDashed },
  blur: { label: "Blur", icon: Waves },
  magnifier: { label: "Magnifier", icon: ScanSearch },
};

interface RightPanelProps {
  tab: RightTab;
  onTabChange: (tab: RightTab) => void;
  document: CaptureDocument | null;
  svg: string | null;
  metadataModel: CaptureMetadataModel | null;
  onMetadataChange: (patch: Partial<CaptureMetadataModel>) => void;
  annotations: Annotation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  onDeleteAnnotation: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onMoveAnnotation: (id: string, dir: -1 | 1) => void;
  onDuplicateAnnotation: (id: string) => void;
  report: ValidationReport | null;
  onRunValidation: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportThumb: () => void;
  onExportSidecar: () => void;
  onExportReplay: () => void;
  onExportSecretReplay: () => void;
  onUnlockSecretReplay: () => void;
  onExportHybrid: () => void;
  onExportHybridReport: () => void;
  hybridReport: HybridReport | null;
  onExportPortableReport: () => void;
  onExportFidelityReport: () => void;
  fidelityReport: VisualCompareReport | null;
  fidelityBusy: boolean;
  onExportProject: () => void;
  onImportProject: () => void;
  onExportSlices: () => void;
  onSaveToLibrary: () => void;
  isSaving: boolean;
  saved: boolean;
}

function SwatchRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          title={c}
          onClick={() => onChange(c)}
          className={cn(
            "size-5 rounded-full border border-black/10 transition-transform hover:scale-110",
            value === c && "ring-2 ring-zinc-900 ring-offset-1",
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-zinc-100 px-5 py-4 first:border-t-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
        {title}
      </p>
      <div className="mt-2.5 space-y-2.5">{children}</div>
    </div>
  );
}

const smallInput =
  "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[12.5px] text-zinc-900 outline-none transition-colors focus:border-zinc-900";
const smallBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900";

function AnnotateTab({
  annotations,
  selectedId,
  onSelect,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onToggleVisible,
}: RightPanelProps) {
  const selected = annotations.find((a) => a.id === selectedId) ?? null;
  if (!selected) {
    return (
      <div className="px-5 py-6">
        <p className="text-[12.5px] leading-6 text-zinc-500">
          Select an annotation on the canvas to edit its properties — color,
          size, opacity, text.
        </p>
        <div className="mt-5 space-y-2">
          {(
            [
              ["arrow", "Arrow — drag from source to target"],
              ["rect", "Rectangle — drag a box"],
              ["text", "Text — click, then type"],
              ["callout", "Callout — drag, then label"],
              ["step", "Step — click to number"],
              ["highlight", "Highlight — drag a region"],
              ["mask", "Mask — visual cover (not redaction)"],
              ["blur", "Blur — softens the content beneath"],
              ["magnifier", "Magnifier — drag outward from the focal point"],
            ] as const
          ).map(([kind, hint]) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            return (
              <div key={kind} className="flex items-center gap-2.5 text-[12px] text-zinc-500">
                <Icon className="size-3.5 shrink-0 text-zinc-400" />
                <span className="w-20 shrink-0 font-medium text-zinc-700">{meta.label}</span>
                <span className="truncate">{hint}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const patch = (p: Partial<Annotation>) => onUpdateAnnotation(selected.id, p);
  const Icon = KIND_META[selected.kind].icon;

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2.5 border-b border-zinc-100 px-5 py-4">
        <Icon className="size-4 text-zinc-700" />
        <span className="text-[13px] font-medium text-zinc-900">
          {KIND_META[selected.kind].label}
        </span>
        <button
          onClick={() => onToggleVisible(selected.id)}
          title={selected.visible ? "Hide" : "Show"}
          className="ml-auto grid size-7 place-items-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          {selected.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
        <button
          onClick={() => {
            onDeleteAnnotation(selected.id);
            onSelect(null);
          }}
          title="Delete"
          className="grid size-7 place-items-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {(selected.kind === "arrow" || selected.kind === "rect") && (
        <Section title="Stroke">
          <SwatchRow
            value={selected.stroke}
            onChange={(color) => patch({ stroke: color })}
          />
          <div className="flex items-center gap-1.5">
            {[2, 3, 5, 7].map((w) => (
              <button
                key={w}
                onClick={() => patch({ strokeWidth: w })}
                className={cn(
                  "rounded border px-2 py-1 font-mono text-[11px] transition-colors",
                  selected.strokeWidth === w
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-400",
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </Section>
      )}

      {selected.kind === "text" && (
        <Section title="Content">
          <textarea
            value={selected.text}
            onChange={(e) => patch({ text: e.target.value })}
            rows={3}
            className={smallInput}
          />
          <div className="flex items-center gap-3">
            <SwatchRow value={selected.fill} onChange={(color) => patch({ fill: color })} />
            <div className="flex items-center gap-1.5">
              {[12, 14, 16, 20, 24].map((s) => (
                <button
                  key={s}
                  onClick={() => patch({ fontSize: s })}
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors",
                    selected.fontSize === s
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-400",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {selected.kind === "callout" && (
        <Section title="Content">
          <textarea
            value={selected.text}
            onChange={(e) => patch({ text: e.target.value })}
            rows={3}
            className={smallInput}
          />
          <div className="flex items-center gap-3">
            <SwatchRow value={selected.stroke} onChange={(color) => patch({ stroke: color, fill: color })} />
            <div className="flex items-center gap-1.5">
              {[12, 14, 16, 20].map((s) => (
                <button
                  key={s}
                  onClick={() => patch({ fontSize: s })}
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors",
                    selected.fontSize === s
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-400",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {selected.kind === "step" && (
        <Section title="Marker">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={selected.number}
              onChange={(e) => patch({ number: Number(e.target.value) || 1 })}
              className={cn(smallInput, "w-20")}
            />
            <SwatchRow value={selected.fill} onChange={(color) => patch({ fill: color })} />
          </div>
        </Section>
      )}

      {selected.kind === "blur" && (
        <Section title="Blur">
          <div className="flex items-center gap-1.5">
            {[3, 6, 10, 16, 24].map((r) => (
              <button
                key={r}
                onClick={() => patch({ radius: r })}
                className={cn(
                  "rounded border px-2 py-1 font-mono text-[11px] transition-colors",
                  selected.radius === r
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-400",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-4 text-zinc-400">
            Rendered as a real Gaussian blur over the base capture — content
            beneath stays legible as a shape.
          </p>
        </Section>
      )}

      {selected.kind === "magnifier" && (
        <Section title="Lens">
          <SwatchRow value={selected.stroke} onChange={(color) => patch({ stroke: color })} />
          <div className="flex items-center gap-1.5">
            {[2, 2.5, 3, 4].map((z) => (
              <button
                key={z}
                onClick={() => patch({ zoom: z })}
                className={cn(
                  "rounded border px-2 py-1 font-mono text-[11px] transition-colors",
                  selected.zoom === z
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-400",
                )}
              >
                {z}×
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-4 text-zinc-400">
            A circular loupe that re-draws the base capture at {selected.zoom}×
            inside the lens — useful for calling out fine detail.
          </p>
        </Section>
      )}

      {(selected.kind === "highlight" || selected.kind === "mask") && (
        <Section title="Appearance">
          {selected.kind === "highlight" && (
            <SwatchRow value={selected.fill} onChange={(color) => patch({ fill: color })} />
          )}
          <div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Opacity</span>
              <span className="font-mono">{Math.round(selected.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={selected.opacity}
              onChange={(e) => patch({ opacity: Number(e.target.value) })}
              className="mt-1 w-full accent-zinc-900"
            />
          </div>
          {selected.kind === "mask" && (
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-600">
              <input
                type="checkbox"
                checked={selected.label}
                onChange={(e) => patch({ label: e.target.checked })}
                className="size-3.5 accent-zinc-900"
              />
              Show “MASK” label
            </label>
          )}
        </Section>
      )}

      <Section title="Layer">
        <p className="text-[11.5px] leading-5 text-zinc-400">
          {selected.kind === "mask"
            ? "Mask is a visual cover only. Secure redaction (which removes source pixels, text and metadata) ships in a later release."
            : "Annotations render above the base capture, in list order."}
        </p>
      </Section>
    </div>
  );
}

function LayersTab({
  document,
  annotations,
  selectedId,
  onSelect,
  onToggleVisible,
  onDeleteAnnotation,
  onMoveAnnotation,
  onDuplicateAnnotation,
}: RightPanelProps) {
  return (
    <div className="pb-4">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "flex w-full items-center gap-2.5 border-b border-zinc-100 px-5 py-3.5 text-left transition-colors",
          selectedId === null ? "bg-zinc-50" : "hover:bg-zinc-50/60",
        )}
      >
        <span className="grid size-6 place-items-center rounded border border-zinc-200 bg-white">
          <Image className="size-3 text-zinc-500" />
        </span>
        <span className="flex-1">
          <span className="block text-[12.5px] font-medium text-zinc-900">Base capture</span>
          <span className="block text-[11px] text-zinc-400">
            {document?.canvas.width} × {document?.canvas.height}px ·{" "}
            {document?.baseLayers.length} tile{document?.baseLayers.length === 1 ? "" : "s"}
          </span>
        </span>
      </button>
      {annotations.map((a) => {
        const meta = KIND_META[a.kind];
        const Icon = meta.icon;
        return (
          <div
            key={a.id}
            onClick={() => onSelect(selectedId === a.id ? null : a.id)}
            className={cn(
              "group flex w-full cursor-pointer items-center gap-2.5 px-5 py-2.5 text-left transition-colors",
              selectedId === a.id ? "bg-zinc-50" : "hover:bg-zinc-50/60",
              !a.visible && "opacity-40",
            )}
          >
            <Icon className="size-3.5 text-zinc-400" />
            <span className="flex-1 truncate text-[12.5px] text-zinc-700">
              {a.kind === "step"
                ? `Step ${a.number}`
                : a.kind === "text" || a.kind === "callout"
                  ? a.text || `Empty ${meta.label.toLowerCase()}`
                  : meta.label}
            </span>
            {a.group && (
              <span title="In a layer group">
                <Layers2 className="size-3 shrink-0 text-zinc-400" />
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveAnnotation(a.id, -1);
              }}
              className="text-zinc-300 opacity-0 transition-all hover:text-zinc-900 group-hover:opacity-100"
              title="Move up"
            >
              <ArrowUp className="size-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveAnnotation(a.id, 1);
              }}
              className="text-zinc-300 opacity-0 transition-all hover:text-zinc-900 group-hover:opacity-100"
              title="Move down"
            >
              <ArrowDown className="size-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateAnnotation(a.id);
              }}
              className="text-zinc-300 opacity-0 transition-all hover:text-zinc-900 group-hover:opacity-100"
              title="Duplicate"
            >
              <Copy className="size-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisible(a.id);
              }}
              className="text-zinc-300 opacity-0 transition-all hover:text-zinc-900 group-hover:opacity-100"
              title={a.visible ? "Hide" : "Show"}
            >
              {a.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteAnnotation(a.id);
                if (selectedId === a.id) onSelect(null);
              }}
              className="text-zinc-300 opacity-0 transition-all hover:text-red-600 group-hover:opacity-100"
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        );
      })}
      {annotations.length === 0 && (
        <p className="px-5 py-5 text-[12px] leading-5 text-zinc-400">
          No annotations yet. Pick a tool in the toolbar and draw on the canvas.
        </p>
      )}
    </div>
  );
}

function MetadataTab({
  document,
  metadataModel,
  onMetadataChange,
  saved,
}: RightPanelProps) {
  if (!metadataModel) return null;
  return (
    <div className="pb-6">
      <Section title="Title & description">
        <input
          value={metadataModel.title}
          onChange={(e) => onMetadataChange({ title: e.target.value })}
          placeholder="Capture title"
          className={smallInput}
        />
        <textarea
          value={metadataModel.description}
          onChange={(e) => onMetadataChange({ description: e.target.value })}
          rows={4}
          placeholder="Accessible description shown to readers of the SVG."
          className={smallInput}
        />
        <input
          value={metadataModel.tags.join(", ")}
          onChange={(e) =>
            onMetadataChange({
              tags: e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          placeholder="tags, comma, separated"
          className={smallInput}
        />
      </Section>

      <Section title="Embedding">
        {(
          [
            ["includeMetadata", "Embed structured capture metadata"],
            ["includeSourceUrl", "Include source URL"],
            ["includeTimestamp", "Include capture timestamp"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-zinc-700"
          >
            <input
              type="checkbox"
              checked={metadataModel[key]}
              onChange={(e) => onMetadataChange({ [key]: e.target.checked })}
              className="size-3.5 accent-zinc-900"
            />
            {label}
          </label>
        ))}
      </Section>

      <Section title="Capture facts">
        {document && (
          <dl className="space-y-1.5 font-mono text-[11px] leading-5 text-zinc-500">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">document</dt>
              <dd className="truncate">{document.documentId}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">mode</dt>
              <dd>{document.source.mode}</dd>
            </div>
            {document.source.target && (
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-zinc-400">target</dt>
                <dd className="truncate">{document.source.target}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">viewport</dt>
              <dd>
                {document.source.viewport.width}×{document.source.viewport.height}@{document.source.viewport.deviceScaleFactor}x
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">captured</dt>
              <dd>{new Date(document.source.capturedAt).toLocaleString()}</dd>
            </div>
            {document.source.url && (
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-zinc-400">source</dt>
                <dd className="truncate">{document.source.url}</dd>
              </div>
            )}
          </dl>
        )}
      </Section>

      <Section title="Privacy">
        <p className="text-[11.5px] leading-5 text-zinc-400">
          {saved
            ? "Saved to your library. Published metadata never contains credentials or private values."
            : "Captured metadata stays in this session until you save to the library."}
        </p>
      </Section>
    </div>
  );
}

function ExportTab({
  svg,
  report,
  onRunValidation,
  onExportSvg,
  onExportPng,
  onExportPdf,
  onExportThumb,
  onExportSidecar,
  onExportReplay,
  onExportSecretReplay,
  onUnlockSecretReplay,
  onExportHybrid,
  onExportHybridReport,
  hybridReport,
  onExportPortableReport,
  onExportFidelityReport,
  fidelityReport,
  fidelityBusy,
  onExportProject,
  onImportProject,
  onExportSlices,
  onSaveToLibrary,
  isSaving,
  saved,
}: RightPanelProps) {
  return (
    <div className="pb-6">
      <Section title="Library">
        <button
          onClick={onSaveToLibrary}
          disabled={!svg || isSaving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40"
        >
          <Save className="size-3.5" />
          {isSaving ? "Saving…" : saved ? "Saved to library" : "Save to library"}
        </button>
      </Section>

      <Section title="Downloads">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onExportSvg} disabled={!svg} className={smallBtn}>
            <FileText className="size-3.5" /> SVG
          </button>
          <button onClick={onExportPng} disabled={!svg} className={smallBtn}>
            <Image className="size-3.5" /> PNG
          </button>
          <button onClick={onExportPdf} disabled={!svg} className={smallBtn}>
            <FileDown className="size-3.5" /> PDF
          </button>
          <button onClick={onExportThumb} disabled={!svg} className={smallBtn}>
            <Image className="size-3.5" /> Thumbnail
          </button>
          <button onClick={onExportSidecar} disabled={!svg} className={smallBtn}>
            <FileJson className="size-3.5" /> Metadata
          </button>
          <button onClick={onExportReplay} disabled={!svg} className={smallBtn}>
            <RefreshCw className="size-3.5" /> Replay script
          </button>
          <button onClick={onExportSecretReplay} disabled={!svg} className={smallBtn}>
            <Lock className="size-3.5" /> Encrypted SVG
          </button>
          <button onClick={onUnlockSecretReplay} className={smallBtn}>
            <Unlock className="size-3.5" /> Unlock replay
          </button>
          <button onClick={onExportHybrid} disabled={!hybridReport} className={smallBtn}>
            <Layers className="size-3.5" /> Hybrid SVG
          </button>
          <button onClick={onExportHybridReport} disabled={!hybridReport} className={smallBtn}>
            <ListChecks className="size-3.5" /> Hybrid report
          </button>
          <button onClick={onExportPortableReport} disabled={!svg} className={smallBtn}>
            <FileText className="size-3.5" /> Portable report
          </button>
          <button onClick={onExportFidelityReport} disabled={!svg || fidelityBusy} className={smallBtn}>
            <ShieldCheck className="size-3.5" />
            {fidelityBusy ? "Comparing…" : "Fidelity report"}
          </button>
          <button onClick={onExportProject} className={smallBtn}>
            <FileJson className="size-3.5" /> Project (.vcap)
          </button>
          <button onClick={onImportProject} className={smallBtn}>
            <FolderOpen className="size-3.5" /> Open .vcap
          </button>
          <button onClick={onExportSlices} className={smallBtn}>
            <FileArchive className="size-3.5" /> Slices (zip)
          </button>
        </div>
        <p className="text-[11px] leading-4 text-zinc-400">
          <FileJson className="mr-0.5 inline size-3" />
          A <code>.vcap</code> project file keeps the capture re-editable — base
          layers, annotations, metadata and undo history — separate from the
          published SVG. Slices (zip) splits captures taller than{" "}
          {SLICE_MAX_HEIGHT.toLocaleString()}px into renderable SVGs.
        </p>
        <p className="text-[11px] leading-4 text-zinc-400">
          The SVG is sanitized before download. PNG is rasterized from the live
          SVG at export size. The replay script re-captures this page against
          any future version — capture once, refresh per release.
        </p>
        {fidelityReport && (
          <div className="rounded-md border border-zinc-100 bg-zinc-50/60 p-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
              Fidelity vs source
            </p>
            <p className="mt-1 font-mono text-[10.5px] leading-4 text-zinc-600">
              Overall {fidelityReport.overall.toFixed(1)}/100 ·{" "}
              {fidelityReport.tiles.length} tile
              {fidelityReport.tiles.length === 1 ? "" : "s"} ·{" "}
              {fidelityReport.width}×{fidelityReport.height}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className={cn(
                    "h-full rounded-full",
                    fidelityReport.overall >= 90
                      ? "bg-emerald-500"
                      : fidelityReport.overall >= 70
                        ? "bg-amber-500"
                        : "bg-red-500",
                  )}
                  style={{ width: `${Math.max(2, fidelityReport.overall)}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-zinc-400">
                {fidelityReport.overall >= 90
                  ? "match"
                  : fidelityReport.overall >= 70
                    ? "close"
                    : "differs"}
              </span>
            </div>
            {fidelityReport.warnings.length > 0 && (
              <p className="mt-1.5 text-[10.5px] leading-4 text-amber-600">
                {fidelityReport.warnings.join(" · ")}
              </p>
            )}
          </div>
        )}
        {hybridReport && (
          <div className="rounded-md border border-zinc-100 bg-zinc-50/60 p-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
              Hybrid conversion
            </p>
            <p className="mt-1 font-mono text-[10.5px] leading-4 text-zinc-600">
              {hybridReport.counts.vectorRects} vector ·{" "}
              {hybridReport.counts.vectorTexts} text ·{" "}
              {hybridReport.counts.embeddedImages} image ·{" "}
              {hybridReport.counts.rasterFallbacks} raster fallback ·{" "}
              {hybridReport.counts.semanticGroups} landmark
              {hybridReport.counts.semanticGroups === 1 ? "" : "s"}
            </p>
            <p className="text-[10.5px] leading-4 text-zinc-400">
              The demo page's DOM becomes native vector elements; unsupported
              regions (canvas, filters, gradients, external images) are
              embedded as raster crops. Editable in any vector tool.
            </p>
            {hybridReport.truncated && (
              <p className="text-[10.5px] leading-4 text-amber-600">
                Snapshot was truncated — some regions may be missing.
              </p>
            )}
          </div>
        )}
        <p className="text-[11px] leading-4 text-zinc-400">
          <Lock className="mr-0.5 inline size-3" />
          Encrypted SVG keeps the picture visible but locks the replay recipe
          (URL, viewport, mode, selector) inside <code>&lt;metadata&gt;</code> with
          AES-256-GCM + your passphrase. Unlock replay reads any such file back
          and regenerates the script. Turn off “Include source URL” in Metadata
          if the URL itself must also stay private.
        </p>
      </Section>

      <Section title="Validation">
        {report ? (
          <div className="space-y-1">
            {report.checks.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-[12px]">
                {c.passed ? (
                  <Check className="size-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="size-3.5 shrink-0 text-red-600" />
                )}
                <span className={cn("flex-1", c.passed ? "text-zinc-600" : "text-red-700")}>
                  {c.label}
                </span>
                {c.detail && (
                  <span className="truncate font-mono text-[10.5px] text-zinc-400">{c.detail}</span>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2 text-[12px]">
              <ShieldCheck className="size-3.5 text-zinc-500" />
              <span className={cn("font-medium", report.ok ? "text-emerald-700" : "text-amber-700")}>
                {report.ok ? "Passes the Safe Image profile" : "Needs attention"}
              </span>
            </div>
            {report.rendered && (
              <p className="font-mono text-[10.5px] text-zinc-400">
                <img
                  className="mt-2 max-h-28 w-full rounded border border-zinc-200 object-contain"
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg ?? "")}`}
                  alt="Rendered SVG preview"
                />
                Rendered {report.rendered.width} × {report.rendered.height} via &lt;img&gt;
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11.5px] leading-5 text-zinc-400">
            Not run yet. Validation parses the XML, checks the Safe Image
            allowlist, and renders the file through a plain &lt;img&gt; element.
          </p>
        )}
        <button
          onClick={onRunValidation}
          disabled={!svg}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-900 disabled:opacity-40"
        >
          <ShieldCheck className="size-3.5" />
          {report ? "Re-run validation" : "Run validation"}
        </button>
      </Section>
    </div>
  );
}

const TABS: { id: RightTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "annotate", label: "Annotate", icon: PenLine },
  { id: "layers", label: "Layers", icon: Layers },
  { id: "metadata", label: "Metadata", icon: FileText },
  { id: "intelligence", label: "Intelligence", icon: Sparkles },
  { id: "export", label: "Export", icon: Save },
];

export function RightPanel(props: RightPanelProps) {
  const { tab, onTabChange } = props;
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-zinc-200 bg-white">
      <div className="grid grid-cols-5 border-b border-zinc-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors",
                tab === t.id
                  ? "text-zinc-900"
                  : "text-zinc-400 hover:text-zinc-700",
              )}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "annotate" && <AnnotateTab {...props} />}
        {tab === "layers" && <LayersTab {...props} />}
        {tab === "metadata" && <MetadataTab {...props} />}
        {tab === "intelligence" && (
          <IntelligenceTab
            document={props.document}
            svg={props.svg}
            metadataModel={props.metadataModel}
            annotations={props.annotations}
            onMetadataChange={props.onMetadataChange}
          />
        )}
        {tab === "export" && <ExportTab {...props} />}
      </div>
    </div>
  );
}

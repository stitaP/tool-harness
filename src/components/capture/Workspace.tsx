import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LogoDropdown } from "@/components/LogoDropdown";
import { CaptureStage } from "./CaptureStage";
import { CaptureRequestPanel } from "./CaptureRequestPanel";
import { JobProgressPanel } from "./JobProgressPanel";
import { EditorCanvas, DEFAULT_TOOL_PROPS, ToolKind, ToolProps } from "./EditorCanvas";
import { RightPanel, RightTab } from "./RightPanel";
import { LibraryRail, SavedCapture } from "./LibraryRail";
import { useExtensionUploadBridge } from "./use-extension-upload-bridge";
import { CaptureJob, rasterDocumentFromDataUrl } from "@/lib/capture/engine";
import {
  DesktopEngine,
  captureViaDesktopEngine,
  getDesktopEngine,
  isDesktopShell,
  getSandboxStatus,
  type SandboxStatusInfo,
} from "@/lib/capture/desktop";
import { ScreenCaptureOverlay } from "./ScreenCaptureOverlay";
import { ocrTextOf, runOcrAtCapture } from "@/lib/capture/ocr";
import { buildPortableSvg, parseSvgString, annotationsFromSvg, documentFromSvg, sanitizeSvg } from "@/lib/capture/svg";
import { validateSvg, svgToBitmap, svgToDataUrl } from "@/lib/capture/validate";
import { defaultMetadataFor, buildSidecarJson } from "@/lib/capture/metadata";
import {
  annotationsCoveredBy,
  applyPixelRedaction,
  cropDocument,
  flattenAnnotations,
  groupAnnotations,
  shiftAnnotation,
  sliceDocumentForExport,
  SLICE_MAX_HEIGHT,
} from "@/lib/capture/edit";
import { buildProjectFile, parseProjectFile } from "@/lib/capture/project";
import { buildZip } from "@/lib/capture/zip";
import { buildPdf } from "@/lib/capture/pdf";
import { downloadBlob, downloadDataUrl, downloadText, sanitizeFilename } from "@/lib/capture/download";
import {
  buildCaptureRecipe,
  buildReplayScript,
  recipeToJson,
} from "@/lib/capture/replay";
import {
  decryptSecret,
  embedSecret,
  encryptSecret,
  extractSecret,
} from "@/lib/capture/crypto";
import {
  buildHybridSvg,
  summarizeSnapshot,
} from "@/lib/capture/hybrid";
import { buildPortableReport } from "@/lib/capture/report";
import {
  compareRenderedFidelity,
  type VisualCompareReport,
} from "@/lib/capture/visualCompare";
import { EXT_EVENT_CAPTURE_SAVED, parseExtensionMessage } from "@/lib/capture/extension";
import type {
  Annotation,
  CaptureDocument,
  CaptureJobState,
  CaptureMetadataModel,
  CaptureRequest,
  DomSnapshot,
  ValidationReport,
} from "@/lib/capture/types";

export function Workspace() {
  const navigate = useNavigate();
  // Current-tab extension: receive stitched captures and save them to the
  // library using this page's signed-in Convex session (Phase D).
  useExtensionUploadBridge();

  const [request, setRequest] = useState<CaptureRequest | null>(null);
  const [job, setJob] = useState<CaptureJob | null>(null);
  const [jobState, setJobState] = useState<CaptureJobState | null>(null);
  const [document, setDocument] = useState<CaptureDocument | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [hybridSnapshot, setHybridSnapshot] = useState<DomSnapshot | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [metadataModel, setMetadataModel] = useState<CaptureMetadataModel | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [fidelityReport, setFidelityReport] = useState<VisualCompareReport | null>(null);
  const [fidelityBusy, setFidelityBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
  const [tool, setTool] = useState<ToolKind>("select");
  const [toolProps, setToolProps] = useState<ToolProps>(DEFAULT_TOOL_PROPS);
  const [rightTab, setRightTab] = useState<RightTab>("annotate");
  const [history, setHistory] = useState<{ past: Annotation[][]; future: Annotation[][] }>({
    past: [],
    future: [],
  });
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeCaptureId, setActiveCaptureId] = useState<string | null>(null);

  const stageRefsRef = useRef<{ container?: HTMLElement; content?: HTMLElement }>({});
  const documentRef = useRef<CaptureDocument | null>(null);
  const metadataRef = useRef<CaptureMetadataModel | null>(null);
  const requestRef = useRef<CaptureRequest | null>(null);
  useEffect(() => {
    documentRef.current = document;
    metadataRef.current = metadataModel;
  }, [document, metadataModel]);

  const captures = useQuery(api.captures.list);
  const saveCapture = useMutation(api.captures.saveCapture);
  const getUploadUrl = useMutation(api.captures.getUploadUrl);
  const deleteCapture = useMutation(api.captures.remove);
  const recordAudit = useMutation(api.policy.recordAudit);
  const captureUrlAction = useAction(api.captureUrl.captureUrl);

  // Desktop shell (Tauri): when the embedded capture engine is reachable,
  // URL captures run locally on this machine instead of the remote service.
  const [desktopEngine, setDesktopEngine] = useState<DesktopEngine | null>(null);
  const [showScreenCapture, setShowScreenCapture] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [sandboxInfo, setSandboxInfo] = useState<SandboxStatusInfo | null>(null);
  useEffect(() => {
    let mounted = true;
    void getDesktopEngine().then((engine) => {
      if (mounted) {
        setDesktopEngine(engine);
        setIsDesktop(!!engine || isDesktopShell());
      }
    });
    void getSandboxStatus().then((status) => {
      if (mounted && status) setSandboxInfo(status);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Listen for captures saved by the current-tab extension and surface them
  // (the library rail updates reactively via the captures query).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = parseExtensionMessage(e.data);
      if (msg && msg.type === EXT_EVENT_CAPTURE_SAVED) {
        const { title, width, height } = msg.payload;
        toast.success(
          title
            ? `“${title}” captured from your current tab — added to your library.`
            : "Capture from your current tab added to your library.",
          width && height ? { description: `${width}×${height} px` } : undefined,
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const stepCounter = useMemo(
    () => annotations.filter((a) => a.kind === "step").length + 1,
    [annotations],
  );

  const showEditor = !!svg && !!document;
  const inProgress = !!jobState && !showEditor;

  const hybridReport = useMemo(
    () => (hybridSnapshot ? summarizeSnapshot(hybridSnapshot) : null),
    [hybridSnapshot],
  );

  const regenerate = useCallback((anns: Annotation[], model: CaptureMetadataModel) => {
    const doc = documentRef.current;
    if (!doc) return;
    setSvg(buildPortableSvg(doc, { model, annotations: anns, outputMode: "portable" }));
  }, []);

  /* ---------------- annotation operations ---------------- */

  const pushHistory = () => {
    setHistory((h) => ({ past: [...h.past.slice(-49), annotations], future: [] }));
  };

  const handleCommitAnnotation = (ann: Annotation) => {
    const next = [...annotations, ann];
    pushHistory();
    setAnnotations(next);
    if (metadataRef.current) regenerate(next, metadataRef.current);
  };

  const handleUpdateAnnotation = (id: string, patch: Partial<Annotation>) => {
    const next = annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a));
    pushHistory();
    setAnnotations(next);
    if (metadataRef.current) regenerate(next, metadataRef.current);
  };

  /** Apply several annotation updates as a single undoable step (multi-move). */
  const handleBatchUpdate = (updates: Array<{ id: string; patch: Partial<Annotation> }>) => {
    if (updates.length === 0) return;
    const byId = new Map(updates.map((u) => [u.id, u.patch]));
    const next = annotations.map((a) =>
      byId.has(a.id) ? ({ ...a, ...byId.get(a.id) } as Annotation) : a,
    );
    pushHistory();
    setAnnotations(next);
    if (metadataRef.current) regenerate(next, metadataRef.current);
  };

  const handleDeleteAnnotation = (id: string) => {
    const next = annotations.filter((a) => a.id !== id);
    pushHistory();
    setAnnotations(next);
    if (metadataRef.current) regenerate(next, metadataRef.current);
    setSelectedIds((ids) => ids.filter((s) => s !== id));
  };

  const handleDeleteSelected = (ids: string[]) => {
    const wanted = new Set(ids);
    const next = annotations.filter((a) => !wanted.has(a.id));
    pushHistory();
    setAnnotations(next);
    if (metadataRef.current) regenerate(next, metadataRef.current);
    setSelectedIds([]);
  };

  const handleGroup = (ids: string[]) => {
    const next = groupAnnotations(annotations, ids);
    if (next === annotations) return;
    pushHistory();
    setAnnotations(next);
    if (metadataRef.current) regenerate(next, metadataRef.current);
    setSelectedIds([]);
    toast.success(`Grouped ${ids.length} layers`);
  };

  const handleFlatten = (groupId: string) => {
    const next = flattenAnnotations(annotations, groupId);
    pushHistory();
    setAnnotations(next);
    if (metadataRef.current) regenerate(next, metadataRef.current);
    setSelectedIds([]);
    toast.success("Layer group flattened");
  };

  const handleToggleVisible = (id: string) => {
    const next = annotations.map((a) =>
      a.id === id ? ({ ...a, visible: !a.visible } as Annotation) : a,
    );
    pushHistory();
    setAnnotations(next);
    if (metadataRef.current) regenerate(next, metadataRef.current);
  };

  const handleMoveAnnotation = (id: string, dir: -1 | 1) => {
    const index = annotations.findIndex((a) => a.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= annotations.length) return;
    const next = [...annotations];
    [next[index], next[target]] = [next[target], next[index]];
    pushHistory();
    setAnnotations(next);
    if (metadataRef.current) regenerate(next, metadataRef.current);
  };

  const handleDuplicateAnnotation = (id: string) => {
    const source = annotations.find((a) => a.id === id);
    if (!source) return;
    const copy = { ...source, id: `ann-${Date.now().toString(36)}` } as Annotation;
    const index = annotations.findIndex((a) => a.id === id);
    const next = [...annotations];
    next.splice(index + 1, 0, copy);
    pushHistory();
    setAnnotations(next);
    if (metadataRef.current) regenerate(next, metadataRef.current);
  };

  /* ---------------- crop / redact (destructive base edits) ---------------- */

  const handleCommitCrop = async (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    const doc = documentRef.current;
    if (!doc) return;
    setTool("select");
    if (rect.width < 8 || rect.height < 8) return;
    const cropped = await cropDocument(doc, rect);
    const shifted = annotations.map((a) => shiftAnnotation(a, -rect.x, -rect.y));
    const kept = annotationsCoveredBy(shifted, {
      x: 0,
      y: 0,
      width: cropped.canvas.width,
      height: cropped.canvas.height,
    });
    const dropped = shifted.length - kept.length;
    setHistory({ past: [], future: [] }); // destructive — not undoable
    setAnnotations(kept);
    setSelectedIds([]);
    setDocument(cropped);
    documentRef.current = cropped;
    if (metadataRef.current) regenerate(kept, metadataRef.current);
    setReport(null);
    toast.success(
      `Cropped to ${cropped.canvas.width} × ${cropped.canvas.height}px` +
        (dropped > 0 ? ` — ${dropped} annotation(s) fell outside and were removed` : ""),
    );
  };

  const handleCommitRedact = async (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    const doc = documentRef.current;
    if (!doc) return;
    setTool("select");
    if (rect.width < 4 || rect.height < 4) return;
    const ok = window.confirm(
      "Secure redaction is destructive: the pixels under this rectangle will be permanently removed from the raster, and annotations fully inside it will be deleted. This cannot be undone. Continue?",
    );
    if (!ok) return;
    const { document: redacted, changes, region } = await applyPixelRedaction(doc, rect);
    const covered = annotationsCoveredBy(annotations, rect);
    const kept = annotations.filter((a) => !covered.some((c) => c.id === a.id));
    setHistory({ past: [], future: [] }); // destructive — not undoable
    setAnnotations(kept);
    setSelectedIds([]);
    setDocument(redacted);
    documentRef.current = redacted;
    if (metadataRef.current) regenerate(kept, metadataRef.current);
    setReport(null);
    const unchanged = changes.filter((c) => !c.changed).length;
    // Audit the redaction (Phase 7).
    void recordAudit({
      action: "capture.redacted",
      detail: `Redacted ${rect.width}×${rect.height}px region at (${Math.round(rect.x)}, ${Math.round(rect.y)}) in "${(redacted.source.title || "Untitled").slice(0, 120)}" — ${changes.length} tile(s) rewritten.`,
    });
    toast.success(
      region.verified
        ? `Redaction applied and verified — ${changes.length} tile(s) rewritten, ${covered.length} annotation(s) removed`
        : `Redaction applied, but ${unchanged} tile(s) were already uniform and could not be verified as changed`,
    );
  };

  const applyAnnotations = (anns: Annotation[]) => {
    setAnnotations(anns);
    if (metadataRef.current) regenerate(anns, metadataRef.current);
    setSelectedIds([]);
  };

  const undo = () => {
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    setHistory({
      past: history.past.slice(0, -1),
      future: [annotations, ...history.future].slice(0, 49),
    });
    applyAnnotations(prev);
  };

  const redo = () => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    setHistory({
      past: [...history.past, annotations].slice(-50),
      future: history.future.slice(1),
    });
    applyAnnotations(next);
  };

  const handleMetadataChange = (patch: Partial<CaptureMetadataModel>) => {
    const current = metadataRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    setMetadataModel(next);
    regenerate(annotations, next);
  };

  /* ---------------- capture lifecycle ---------------- */

  const startCapture = (r: CaptureRequest) => {
    requestRef.current = r;
    job?.cancel();
    setRequest(r);
    setDocument(null);
    setSvg(null);
    setHybridSnapshot(null);
    setAnnotations([]);
    setMetadataModel(null);
    setReport(null);
    setTool("select");
    setHistory({ past: [], future: [] });
    setSaved(false);
    setActiveCaptureId(null);
    setSelectedIds([]);
    setJobState(null);
    const j = new CaptureJob(() => setJobState({ ...j.state }));
    setJob(j);
    void j
      .run(r, {
        stageRefs: () => stageRefsRef.current,
        captureUrlAction,
        localCaptureUrl: desktopEngine
          ? (args) => captureViaDesktopEngine(desktopEngine, args)
          : undefined,
        ocrAtCapture: runOcrAtCapture,
      })
      .then((res) => {
        if (requestRef.current !== r) return; // superseded by a newer request
        if (res) {
          setDocument(res.document);
          setSvg(res.svg);
          setHybridSnapshot(res.hybrid?.snapshot ?? null);
          setReport(res.report);
          setAnnotations([]);
          setMetadataModel(defaultMetadataFor(res.document));
        }
        setJob(null);
      });
  };

  const newCapture = () => {
    requestRef.current = null;
    job?.cancel();
    setRequest(null);
    setJob(null);
    setJobState(null);
    setDocument(null);
    setSvg(null);
    setHybridSnapshot(null);
    setAnnotations([]);
    setMetadataModel(null);
    setReport(null);
    setHistory({ past: [], future: [] });
    setSaved(false);
    setActiveCaptureId(null);
    setSelectedIds([]);
    setTool("select");
  };

  /** Handle a completed native screen capture — load it into the editor. */
  const handleScreenCapture = useCallback(
    ({ document: doc, svg: svgStr }: { document: CaptureDocument; svg: string }) => {
      requestRef.current = null;
      setRequest(null);
      setJob(null);
      setJobState(null);
      setDocument(doc);
      documentRef.current = doc;
      setSvg(svgStr);
      setHybridSnapshot(null);
      setAnnotations([]);
      setMetadataModel(defaultMetadataFor(doc));
      setReport(null);
      setHistory({ past: [], future: [] });
      setSaved(false);
      setActiveCaptureId(null);
      setSelectedIds([]);
      setTool("select");
      setShowScreenCapture(false);
      toast.success(`Screen captured — ${doc.canvas.width}×${doc.canvas.height}px`);
    },
    [],
  );

  /* ---------------- save / open / delete ---------------- */

  const handleSave = async () => {
    if (!document || !svg || !metadataModel) return;
    setIsSaving(true);
    try {
      const uploadUrl = await getUploadUrl();
      const blob = new Blob([svg], { type: "image/svg+xml" });
      let res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "image/svg+xml" },
        body: blob,
      });
      if (!res.ok) {
        // Some storage backends restrict MIME types — retry as octet-stream.
        res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
        });
      }
      if (!res.ok) throw new Error("Upload to storage failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const thumb = (await svgToDataUrl(svg, "image/webp", 0.82, 480)) ?? "";
      const sidecar = buildSidecarJson({
        doc: document,
        model: metadataModel,
        outputMode: "portable",
      });
      await saveCapture({
        storageId,
        title: metadataModel.title || "Untitled capture",
        description: metadataModel.description,
        tags: metadataModel.tags,
        url: document.source.url,
        captureMode: document.source.mode,
        width: document.canvas.width,
        height: document.canvas.height,
        thumbnail: thumb,
        metadataJson: JSON.stringify(sidecar),
        ocrText: ocrTextOf(document.ocr),
      });
      setSaved(true);
      toast.success("Capture saved to your library");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not save the capture");
    } finally {
      setIsSaving(false);
    }
  };

  const openCapture = async (c: SavedCapture) => {
    if (!c.svgUrl) {
      toast.error("The stored SVG for this capture is unavailable.");
      return;
    }
    try {
      const text = await (await fetch(c.svgUrl)).text();
      if (!text.trimStart().startsWith("<svg")) {
        // Current-tab extension captures are stored as PNGs — rebuild a
        // portable SVG document from the raster (Phase D: PNG → editor).
        try {
          const blob = await (await fetch(c.svgUrl)).blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Could not read the captured image"));
            reader.readAsDataURL(blob);
          });
          let dpr = 1;
          try {
            const sidecar = JSON.parse(c.metadataJson) as { deviceScaleFactor?: unknown };
            if (typeof sidecar.deviceScaleFactor === "number") dpr = sidecar.deviceScaleFactor;
          } catch {
            /* no sidecar — assume 1× */
          }
          const          doc = await rasterDocumentFromDataUrl(dataUrl, {
            url: c.url,
            title: c.title,
            capturedAt: new Date(c.createdAt).toISOString(),
            mode: c.captureMode as CaptureDocument["source"]["mode"],
            deviceScaleFactor: dpr,
          });
          const generated = sanitizeSvg(
            buildPortableSvg(doc, { model: defaultMetadataFor(doc), annotations: [], outputMode: "portable" }),
          ).svg;
          const anns = annotationsFromSvg(parseSvgString(generated));
          requestRef.current = null;
          setRequest(null);
          setJob(null);
          setJobState(null);
          setDocument(doc);
          setSvg(generated);
          setAnnotations(anns);
          setMetadataModel(defaultMetadataFor(doc));
          setReport(null);
          setHistory({ past: [], future: [] });
          setSaved(true);
          setActiveCaptureId(c._id);
          setSelectedIds([]);
          setTool("select");
          setRightTab("annotate");
          toast.success("Capture opened from library");
          return;
        } catch {
          toast.info(
            "This capture from the current-tab extension couldn't be opened as an image yet — it stays safe in your library.",
          );
          return;
        }
      }
      const parsed = parseSvgString(text);
      const doc = documentFromSvg(parsed, {
        url: c.url,
        captureMode: c.captureMode,
        capturedAt: new Date(c.createdAt).toISOString(),
        title: c.title,
      });
      const anns = annotationsFromSvg(parsed);
      let meta: CaptureMetadataModel;
      try {
        const sidecar = JSON.parse(c.metadataJson) as {
          title?: unknown;
          description?: unknown;
          tags?: unknown;
        };
        meta = {
          title: String(sidecar.title ?? c.title ?? "Untitled capture"),
          description: String(sidecar.description ?? ""),
          tags: Array.isArray(sidecar.tags) ? sidecar.tags.map(String) : [],
          includeMetadata: true,
          includeSourceUrl: !!doc.source.url,
          includeTimestamp: true,
        };
      } catch {
        meta = defaultMetadataFor(doc);
      }
      requestRef.current = null;
      setRequest(null);
      setJob(null);
      setJobState(null);
      setDocument(doc);
      setSvg(text);
      setAnnotations(anns);
      setMetadataModel(meta);
      setReport(null);
      setHistory({ past: [], future: [] });
      setSaved(true);
      setActiveCaptureId(c._id);
      setSelectedIds([]);
      setTool("select");
      setRightTab("annotate");
      toast.success("Capture opened from library");
    } catch (e) {
      console.error(e);
      toast.error("Could not open that capture.");
    }
  };

  const handleDelete = (c: SavedCapture) => {
    const ok = window.confirm(`Delete “${c.title || "Untitled capture"}”? The stored SVG will be removed permanently.`);
    if (!ok) return;
    void deleteCapture({ id: c._id });
    if (activeCaptureId === c._id) newCapture();
  };

  /* ---------------- export ---------------- */

  const baseName = () =>
    sanitizeFilename(metadataModel?.title ?? "stitap-capture");

  const exportSvg = () => {
    if (!svg) return;
    try {
      const clean = sanitizeSvg(svg);
      downloadText(clean.svg, `${baseName()}.svg`, "image/svg+xml");
      if (clean.warnings.length > 0) {
        toast.warning(`Sanitizer notes: ${clean.warnings.join("; ")}`);
      } else {
        toast.success("Sanitized SVG downloaded");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sanitization failed");
    }
  };

  const exportPng = async () => {
    if (!svg) return;
    const dataUrl = await svgToDataUrl(svg, "image/png", 0.95, 20_000, 16_384);
    if (!dataUrl) {
      toast.error("Could not rasterize the SVG (page may exceed canvas limits).");
      return;
    }
    downloadDataUrl(dataUrl, `${baseName()}.png`);
    toast.success("PNG exported");
  };

  const exportThumb = async () => {
    if (!svg) return;
    const dataUrl = await svgToDataUrl(svg, "image/webp", 0.85, 720);
    if (!dataUrl) {
      toast.error("Could not generate the thumbnail.");
      return;
    }
    downloadDataUrl(dataUrl, `${baseName()}.thumbnail.webp`);
  };

  const exportPdf = async () => {
    if (!svg) return;
    const bitmap = await svgToBitmap(svg, { maxWidth: 2048, maxHeight: 16_384 });
    if (!bitmap) {
      toast.error("Could not rasterize the SVG for PDF export.");
      return;
    }
    const jpeg = bitmap.canvas.toDataURL("image/jpeg", 0.92);
    const base64 = jpeg.split(",")[1] ?? "";
    const scale = 72 / 96; // web CSS px → PDF points
    downloadBlob(
      buildPdf({
        width: bitmap.width * scale,
        height: bitmap.height * scale,
        jpegBase64: base64,
        title: metadataModel?.title,
      }),
      `${baseName()}.pdf`,
      "application/pdf",
    );
    toast.success("PDF exported");
  };

  const exportSidecar = () => {
    if (!document || !metadataModel) return;
    const sidecar = buildSidecarJson({
      doc: document,
      model: metadataModel,
      outputMode: "portable",
    });
    downloadText(JSON.stringify(sidecar, null, 2), `${baseName()}.metadata.json`);
  };

  const exportReplay = () => {
    if (!document) return;
    const recipe = buildCaptureRecipe(document);
    downloadText(buildReplayScript(recipe), `${baseName()}.replay.spec.ts`);
    toast.success("Replay script exported — run it on the next version");
  };

  const exportSecretReplay = async () => {
    if (!document || !svg) return;
    const pass = window.prompt("Set a passphrase for the encrypted replay recipe");
    if (!pass) return;
    const again = window.prompt("Confirm the passphrase");
    if (pass !== again) {
      toast.error("Passphrases do not match");
      return;
    }
    if (pass.length < 8) {
      toast.error("Use at least 8 characters");
      return;
    }
    const recipe = buildCaptureRecipe(document);
    const envelope = await encryptSecret(recipeToJson(recipe), pass);
    downloadText(embedSecret(svg, envelope), `${baseName()}.secret.svg`, "image/svg+xml");
    toast.success("Encrypted replay SVG exported — recipe locked inside <metadata>");
  };

  const unlockSecretReplay = async () => {
    const input = window.document.createElement("input");
    input.type = "file";
    input.accept = "image/svg+xml,.svg";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const envelope = extractSecret(text);
      if (!envelope) {
        toast.error("This SVG carries no encrypted replay recipe");
        return;
      }
      const pass = window.prompt("Passphrase for this capture");
      if (!pass) return;
      const json = await decryptSecret(envelope, pass);
      if (!json) {
        toast.error("Wrong passphrase or corrupted payload");
        return;
      }
      const recipe = JSON.parse(json) as ReturnType<typeof buildCaptureRecipe>;
      downloadText(
        buildReplayScript(recipe),
        `${file.name.replace(/\.svg$/i, "")}.replay.spec.ts`,
      );
      toast.success("Recipe unlocked — replay script downloaded");
    };
    input.click();
  };

  const runValidation = async () => {
    if (!svg || !document) return;
    setReport(await validateSvg(svg, document.canvas.width, document.canvas.height));
  };

  const exportHybrid = async () => {
    if (!hybridSnapshot || !document || !metadataModel) return;
    const raw = buildHybridSvg(hybridSnapshot, {
      doc: document,
      model: metadataModel,
      annotations,
    });
    const sanitized = sanitizeSvg(raw);
    const report = await validateSvg(
      sanitized.svg,
      document.canvas.width,
      document.canvas.height,
    );
    downloadText(sanitized.svg, `${baseName()}.hybrid.svg`, "image/svg+xml");
    toast.success(
      report.ok
        ? "Hybrid SVG exported — vector content validated"
        : "Hybrid SVG exported — validation has warnings",
    );
  };

  const exportHybridReport = () => {
    if (!hybridReport) return;
    downloadText(
      JSON.stringify(hybridReport, null, 2),
      `${baseName()}.hybrid-report.json`,
    );
    toast.success("Hybrid export report downloaded");
  };

  /* ---------------- Phase 7: portable report + fidelity report ---------------- */

  const exportPortableReport = async () => {
    if (!document || !svg || !metadataModel) return;
    try {
      const clean = sanitizeSvg(svg);
      const portable = await buildPortableReport(document, clean.svg, annotations, {
        sanitized: clean.warnings.length === 0,
        policy: "",
      });
      downloadText(
        JSON.stringify(portable, null, 2),
        `${baseName()}.portable-report.json`,
      );
      await recordAudit({
        action: "export.portable-report",
        detail: `Portable report for "${(portable.title || "Untitled").slice(0, 120)}" (${portable.canvas.width}×${portable.canvas.height}, ${portable.annotations.total} annotations, redaction ${portable.redaction.applied ? "applied" : "none"}).`,
      });
      toast.success("Portable export report downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the portable report");
    }
  };

  const runFidelityReport = async () => {
    if (!document || !svg) return;
    const source = document.baseLayers[0]?.dataUrl;
    if (!source) {
      toast.error("This capture has no base raster to compare against.");
      return;
    }
    setFidelityBusy(true);
    try {
      const rendered = await svgToDataUrl(svg, "image/png", 0.95, 20_000, 16_384);
      if (!rendered) {
        toast.error("Could not rasterize the SVG for comparison.");
        return;
      }
      const cmp = await compareRenderedFidelity(source, rendered, { maxEdge: 1600 });
      setFidelityReport(cmp);
      await recordAudit({
        action: "export.fidelity-report",
        detail: `Fidelity report for "${(document.source.title || "Untitled").slice(0, 120)}" — overall ${cmp.overall.toFixed(1)}/100${cmp.warnings.length > 0 ? ` (${cmp.warnings.join("; ")})` : ""}.`,
      });
      downloadText(
        JSON.stringify(cmp, null, 2),
        `${baseName()}.fidelity-report.json`,
      );
      toast.success(
        cmp.overall >= 90
          ? `Fidelity ${cmp.overall.toFixed(1)}/100 — SVG matches the source capture`
          : `Fidelity ${cmp.overall.toFixed(1)}/100 — review the report for differences`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fidelity comparison failed");
    } finally {
      setFidelityBusy(false);
    }
  };

  /* ---------------- editable project file (.vcap) ---------------- */

  const exportProject = () => {
    if (!document || !metadataModel) return;
    const json = buildProjectFile({
      document,
      metadata: metadataModel,
      annotations,
      history,
    });
    downloadText(json, `${baseName()}.vcap`, "application/json");
    toast.success(
      "Project file exported — reopen it anytime to keep editing (undo history included)",
    );
  };

  const importProject = () => {
    const input = window.document.createElement("input");
    input.type = "file";
    input.accept = ".vcap,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const project = parseProjectFile(await file.text());
        setDocument(project.document);
        documentRef.current = project.document;
        setAnnotations(project.annotations);
        setMetadataModel(project.metadata);
        metadataRef.current = project.metadata;
        setHistory(project.history);
        setSelectedIds([]);
        setTool("select");
        setReport(null);
        setSaved(false);
        setActiveCaptureId(null);
        requestRef.current = null;
        setRequest(null);
        setJob(null);
        setJobState(null);
        setHybridSnapshot(null);
        setSvg(
          buildPortableSvg(project.document, {
            model: project.metadata,
            annotations: project.annotations,
            outputMode: "portable",
          }),
        );
        toast.success(`Project “${project.metadata.title || "Untitled"}” opened`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not open the project file");
      }
    };
    input.click();
  };

  /* ---------------- sliced SVG exports (extreme heights) ---------------- */

  const exportSlices = () => {
    if (!document || !metadataModel) return;
    const slices = sliceDocumentForExport(document, annotations);
    if (slices.length === 1) {
      toast.info(
        `This capture is ${document.canvas.height.toLocaleString()}px tall — slices kick in above ${SLICE_MAX_HEIGHT.toLocaleString()}px.`,
      );
      return;
    }
    const pad = String(slices.length).length;
    const files = slices.map((s, i) => {
      const raw = buildPortableSvg(s.document, {
        model: metadataModel,
        annotations: s.annotations,
        outputMode: "portable",
      });
      // Clip at the slice seam so a tile straddling the boundary renders
      // only its in-slice portion.
      const clipped = raw.replace(/<svg /, '<svg style="overflow:hidden" ');
      const clean = sanitizeSvg(clipped);
      const name = `${baseName()}-slice-${String(i + 1).padStart(pad, "0")}-of-${slices.length}.svg`;
      return { name, data: new TextEncoder().encode(clean.svg) };
    });
    downloadBlob(buildZip(files), `${baseName()}-slices.zip`, "application/zip");
    toast.success(
      `Exported ${slices.length} SVG slices (${SLICE_MAX_HEIGHT.toLocaleString()}px each) as a ZIP`,
    );
  };

  /* ---------------- render ---------------- */

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={newCapture}
            className="flex items-center gap-2 text-[13px] font-semibold tracking-tight"
          >
            <span className="stitap-gradient grid size-6 place-items-center rounded text-[10px] font-bold text-white">
              S
            </span>
            stitaP
          </button>
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
            Capture Studio
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showEditor && (
            <button
              onClick={() => void handleSave()}
              disabled={isSaving || saved}
              className="rounded-md border border-zinc-900 px-3.5 py-1.5 text-[12px] font-medium text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white disabled:opacity-40"
            >
              {isSaving ? "Saving…" : saved ? "Saved ✓" : "Save"}
            </button>
          )}
          {isDesktop && (
            <button
              onClick={() => setShowScreenCapture(true)}
              className="rounded-md border border-zinc-200 px-3.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900"
            >
              Capture Screen
            </button>
          )}
          {isDesktop && sandboxInfo && (
            <span
              className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
              title={`Sandbox: ${sandboxInfo.isolationLevel} isolation — ${sandboxInfo.label}`}
            >
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              {sandboxInfo.isolationLevel === "full"
                ? "Sandboxed"
                : sandboxInfo.isolationLevel === "basic"
                  ? "Isolated"
                  : "Open"}
            </span>
          )}
          <button
            onClick={newCapture}
            className="rounded-md bg-zinc-900 px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-zinc-700"
          >
            New capture
          </button>
          <button
            onClick={() => void navigate("/settings")}
            className="rounded-md border border-zinc-200 px-3.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-900"
          >
            Settings
          </button>
          <LogoDropdown />
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 md:block">
          <LibraryRail
            captures={(captures ?? []) as SavedCapture[]}
            isLoading={captures === undefined}
            activeId={activeCaptureId}
            onOpen={(c) => void openCapture(c)}
            onDelete={handleDelete}
            onNew={newCapture}
          />
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* Hidden demo capture stage */}
          {request?.source.type === "demo" && job && (
            <CaptureStage
              request={request}
              onRefs={(refs) => {
                stageRefsRef.current = refs;
              }}
            />
          )}

          {inProgress && jobState ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <JobProgressPanel
                job={jobState}
                onCancel={() => job?.cancel()}
                onNew={newCapture}
              />
            </div>
          ) : showEditor && svg && document && metadataModel ? (
            <div className="flex min-h-0 flex-1">
              <div className="min-w-0 flex-1">
                <EditorCanvas
                  svg={svg}
                  annotations={annotations}
                  tool={tool}
                  onToolChange={setTool}
                  toolProps={toolProps}
                  onToolPropsChange={(patch) => setToolProps((p) => ({ ...p, ...patch }))}
                  selectedIds={selectedIds}
                  onSelectIds={setSelectedIds}
                  onCommitAnnotation={handleCommitAnnotation}
                  onCommitCrop={(rect) => void handleCommitCrop(rect)}
                  onCommitRedact={(rect) => void handleCommitRedact(rect)}
                  onUpdateAnnotation={handleUpdateAnnotation}
                  onBatchUpdate={handleBatchUpdate}
                  onDeleteSelected={handleDeleteSelected}
                  onGroup={handleGroup}
                  onFlatten={handleFlatten}
                  onUndo={undo}
                  onRedo={redo}
                  canUndo={history.past.length > 0}
                  canRedo={history.future.length > 0}
                  stepCounter={stepCounter}
                />
              </div>
              <aside className="hidden w-80 shrink-0 lg:block">
                <RightPanel
                  tab={rightTab}
                  onTabChange={setRightTab}
                  document={document}
                  svg={svg}
                  metadataModel={metadataModel}
                  onMetadataChange={handleMetadataChange}
                  annotations={annotations}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedIds(id ? [id] : [])}
                  onUpdateAnnotation={handleUpdateAnnotation}
                  onDeleteAnnotation={handleDeleteAnnotation}
                  onToggleVisible={handleToggleVisible}
                  onMoveAnnotation={handleMoveAnnotation}
                  onDuplicateAnnotation={handleDuplicateAnnotation}
                  report={report}
                  onRunValidation={() => void runValidation()}
                  onExportSvg={exportSvg}
                  onExportPng={() => void exportPng()}
                  onExportPdf={() => void exportPdf()}
                  onExportThumb={() => void exportThumb()}
                  onExportSidecar={exportSidecar}
                  onExportReplay={exportReplay}
                  onExportSecretReplay={() => void exportSecretReplay()}
                  onUnlockSecretReplay={() => void unlockSecretReplay()}
                  onExportHybrid={() => void exportHybrid()}
                  onExportHybridReport={exportHybridReport}
                  hybridReport={hybridReport}
                  onExportPortableReport={() => void exportPortableReport()}
                  onExportFidelityReport={() => void runFidelityReport()}
                  fidelityReport={fidelityReport}
                  fidelityBusy={fidelityBusy}
                  onExportProject={exportProject}
                  onImportProject={importProject}
                  onExportSlices={() => void exportSlices()}
                  onSaveToLibrary={() => void handleSave()}
                  isSaving={isSaving}
                  saved={saved}
                />
              </aside>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CaptureRequestPanel onStart={startCapture} onCancel={newCapture} />
            </div>
          )}
        </main>
      </div>

      {/* Native screen capture overlay (desktop shell only) */}
      <ScreenCaptureOverlay
        active={showScreenCapture}
        onCancel={() => setShowScreenCapture(false)}
        onCapture={handleScreenCapture}
        request={request}
      />
    </div>
  );
}

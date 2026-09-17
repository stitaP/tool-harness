/**
 * Intelligence tab — the on-device NLP features (blueprint Phase 5):
 *
 *   · Extract text    — OCR of the captured raster (tesseract.js on-device)
 *   · Suggest alt text — image captioning (distilvit) with heuristic fallback
 *   · Scan sensitive  — regex + on-device NER fusion (distilbert-NER)
 *   · Step guide      — deterministic template, optional SmolLM2 polish
 *
 * Every feature works without a model download (rule fallback) and without an
 * API key; model weights stream from the HF CDN on first use and are cached
 * by the browser. All inference happens in this browser — nothing leaves it.
 */
import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileText,
  Image,
  ListOrdered,
  Loader2,
  ScanEye,
  ScanText,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type {
  Annotation,
  CaptureDocument,
  CaptureMetadataModel,
} from "@/lib/capture/types";
import { svgToBitmap } from "@/lib/capture/validate";
import { downloadText } from "@/lib/capture/download";
import { annotationBounds } from "@/lib/capture/edit";
import { nlp } from "@/lib/nlp/service";
import type {
  AltTextSuggestion,
  MistakeReview,
  OcrBlock,
  OcrStrategy,
  SensitiveMatch,
  StepGuide,
  VisionFeedback,
} from "@/lib/nlp/types";
import {
  heuristicAltText,
  mergeOcrBlocks,
  ocrBlocksToText,
  offsetOcrBlocks,
  stepGuideMarkdown,
} from "@/lib/nlp/rule";
import { cn } from "@/lib/utils";

interface Props {
  document: CaptureDocument | null;
  svg: string | null;
  metadataModel: CaptureMetadataModel | null;
  annotations: Annotation[];
  onMetadataChange: (patch: Partial<CaptureMetadataModel>) => void;
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

const smallBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-40 disabled:hover:border-zinc-200 disabled:hover:text-zinc-700";

const STATE_DOT: Record<string, string> = {
  unloaded: "bg-zinc-300",
  loading: "bg-amber-500",
  ready: "bg-emerald-600",
  error: "bg-red-600",
  unsupported: "bg-zinc-300",
};

const KIND_BADGE: Record<string, string> = {
  "api-key": "API key",
  token: "Token",
  password: "Password",
  session: "Session",
  "private-key": "Private key",
  email: "Email",
  phone: "Phone",
  "credit-card": "Card",
  ssn: "SSN",
  person: "Person",
};

export function IntelligenceTab({
  document,
  svg,
  metadataModel,
  annotations,
  onMetadataChange,
}: Props) {
  const [ocrBlocks, setOcrBlocks] = useState<OcrBlock[]>([]);
  const [ocrStrategy, setOcrStrategy] = useState<OcrStrategy>("tesseract");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [alt, setAlt] = useState<AltTextSuggestion | null>(null);
  const [altBusy, setAltBusy] = useState(false);
  const [sensitive, setSensitive] = useState<SensitiveMatch[] | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [guide, setGuide] = useState<StepGuide | null>(null);
  const [guideBusy, setGuideBusy] = useState(false);
  const [review, setReview] = useState<MistakeReview | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [vision, setVision] = useState<VisionFeedback | null>(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [useModelVisual, setUseModelVisual] = useState(false);
  const [copied, setCopied] = useState(false);

  const stepAnns = useMemo(
    () =>
      annotations
        .filter((a) => a.kind === "step")
        .sort((a, b) => a.number - b.number),
    [annotations],
  );

  // Text captured at capture time (blueprint §14) — persisted on the document,
  // so the tab is instant when the capture ran with `intelligence.ocrAtCapture`.
  const persistedBlocks = useMemo<OcrBlock[]>(
    () =>
      document?.ocr && document.ocr.status === "ok"
        ? document.ocr.layers.map((l) => ({
            text: l.text,
            confidence: l.confidence,
            bounds: l.bounds,
            source: l.source,
          }))
        : [],
    [document],
  );
  const hasPersistedOcr = persistedBlocks.length > 0;

  // A manual run replaces the persisted capture-time text; otherwise we show it.
  const shownBlocks = ocrBlocks.length > 0 ? ocrBlocks : persistedBlocks;

  const ocrText = useMemo(
    () => document?.ocr?.text || ocrBlocksToText(ocrBlocks),
    [document, ocrBlocks],
  );

  /* ---------------- OCR ---------------- */

  async function runOcr() {
    if (!document || ocrBusy) return;
    setOcrBusy(true);
    setOcrBlocks([]);
    try {
      const lists: OcrBlock[][] = [];
      const tiles = document.baseLayers.slice(0, 8); // bound runtime for tall pages
      for (const tile of tiles) {
        const blocks = await nlp.ocrImage(tile.dataUrl, { strategy: ocrStrategy });
        lists.push(offsetOcrBlocks(blocks, tile.x, tile.y));
      }
      setOcrBlocks(mergeOcrBlocks(lists));
    } finally {
      setOcrBusy(false);
    }
  }

  /* ---------------- Alt text ---------------- */

  async function suggestAlt() {
    if (!svg || altBusy) return;
    setAltBusy(true);
    try {
      const bitmap = await svgToBitmap(svg, { maxWidth: 768, maxHeight: 768 });
      if (!bitmap) return;
      const jpeg = bitmap.canvas.toDataURL("image/jpeg", 0.88);
      const model = await nlp.captionImage(jpeg);
      setAlt(
        model ??
          heuristicAltText({
            title: metadataModel?.title,
            ocrText,
          }),
      );
    } finally {
      setAltBusy(false);
    }
  }

  /* ---------------- Sensitive-data scan ---------------- */

  async function scanSensitive() {
    if (scanBusy) return;
    setScanBusy(true);
    try {
      const texts: string[] = [];
      if (metadataModel?.title) texts.push(metadataModel.title);
      if (metadataModel?.description) texts.push(metadataModel.description);
      if (metadataModel?.tags.length) texts.push(metadataModel.tags.join(", "));
      if (document?.source.url) texts.push(document.source.url);
      for (const a of annotations) {
        if (a.kind === "text" || a.kind === "callout") texts.push(a.text);
      }
      if (ocrText) texts.push(ocrText);
      const matches = await nlp.detectSensitive(texts.join("\n"));
      setSensitive(matches);
    } finally {
      setScanBusy(false);
    }
  }

  /* ---------------- Step guide ---------------- */

  async function generateGuide(polish: boolean) {
    if (guideBusy || stepAnns.length === 0) return;
    setGuideBusy(true);
    try {
      const steps = stepAnns.map((s) => ({
        number: s.number,
        text: textNear(ocrBlocks, s),
      }));
      const g = await nlp.generateStepGuide({
        title: metadataModel?.title ?? "Capture",
        steps,
        polish,
      });
      setGuide(g);
    } finally {
      setGuideBusy(false);
    }
  }

  async function copyGuide() {
    if (!guide) return;
    await navigator.clipboard.writeText(stepGuideMarkdown(guide));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  /* ---------------- Visual review ---------------- */

  async function reviewVisual(useModel: boolean) {
    if (!document || !svg || visionBusy) return;
    setVisionBusy(true);
    setUseModelVisual(useModel);
    try {
      const bitmap = await svgToBitmap(svg, { maxWidth: 1024, maxHeight: 1024 });
      if (!bitmap) return;
      const jpeg = bitmap.canvas.toDataURL("image/jpeg", 0.85);
      const fb = await nlp.visualFeedback(
        jpeg,
        {
          width: document.canvas.width,
          height: document.canvas.height,
          tileCount: document.baseLayers.length,
          redacted: document.redacted,
          url: document.source.url,
          warnings: document.warnings,
        },
        { useModel },
      );
      setVision(fb);
    } finally {
      setVisionBusy(false);
    }
  }

  /* ---------------- Mistake review ---------------- */

  async function reviewGuide() {
    if (!guide || reviewBusy) return;
    setReviewBusy(true);
    try {
      const r = await nlp.reviewMistakes(stepGuideMarkdown(guide), {
        useModel: true,
      });
      setReview(r);
    } finally {
      setReviewBusy(false);
    }
  }

  const modelStatuses = nlp.statusAll();

  return (
    <div className="pb-6">
      <Section title="On-device models">
        <p className="text-[11.5px] leading-5 text-zinc-400">
          All inference runs in this browser. Compact models are under 200M
          params; the text model is Qwen2.5-0.5B at 2-bit (~415MB) for better
          error explanations and guides. Weights stream from the Hugging Face
          CDN on first use; every feature falls back to a rule engine when
          offline or on limited hardware.
        </p>
        <ul className="space-y-1.5">
          {modelStatuses.map((s) => (
            <li key={s.feature} className="flex items-center gap-2 text-[11.5px] text-zinc-600">
              <span className={cn("size-1.5 shrink-0 rounded-full", STATE_DOT[s.state])} />
              <span className="w-16 shrink-0 capitalize text-zinc-700">{s.feature}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-400">
                {s.model.split("/").pop() ?? s.model}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-zinc-400">{s.sizeMb} MB</span>
              {s.state === "loading" && (
                <Loader2 className="size-3 shrink-0 animate-spin text-amber-600" />
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Extract text">
        <button onClick={() => void runOcr()} disabled={!document || ocrBusy} className={smallBtn}>
          {ocrBusy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ScanText className="size-3.5" />
          )}
          {ocrBusy ? "Recognizing…" : hasPersistedOcr ? "Re-run OCR on raster" : "Extract text from capture"}
        </button>
        <div
          className="flex items-center gap-0.5 self-start rounded-lg border border-zinc-200 bg-white p-0.5"
          title="Fast: tesseract.js (~15MB). Accurate: two-stage STR (mgp-str ~91MB) — better on dark themes and unusual fonts; downloads on first use."
        >
          {(["tesseract", "str"] as const).map((strat) => (
            <button
              key={strat}
              type="button"
              onClick={() => setOcrStrategy(strat)}
              disabled={ocrBusy}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                ocrStrategy === strat
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800",
              )}
            >
              {strat === "tesseract" ? "Fast" : "Accurate"}
            </button>
          ))}
        </div>
        {hasPersistedOcr && !ocrBusy && (
          <p className="text-[11px] leading-4 text-zinc-400">
            {document?.ocr?.engine === "hybrid-dom"
              ? "Text was extracted from the live DOM at capture time — no model needed."
              : "Text was recognized on-device at capture time."}
            {document?.ocr?.truncated ? " (capped for very tall pages)" : ""}
          </p>
        )}
        {shownBlocks.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] leading-4 text-zinc-400">
              {shownBlocks.length} line{shownBlocks.length === 1 ? "" : "s"} of text.
            </p>
            <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 p-2.5">
              {shownBlocks.slice(0, 24).map((b, i) => (
                <li key={i} className="flex items-baseline gap-2 text-[11.5px] leading-4 text-zinc-700">
                  <span className="shrink-0 font-mono text-[9.5px] text-zinc-400">
                    {Math.round(b.confidence * 100)}%
                  </span>
                  <span className="min-w-0">{b.text}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => void navigator.clipboard.writeText(ocrText)}
              className={smallBtn}
            >
              <Copy className="size-3.5" /> Copy text
            </button>
          </div>
        )}
      </Section>

      <Section title="Suggested alt text">
        <button onClick={() => void suggestAlt()} disabled={!svg || altBusy} className={smallBtn}>
          {altBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Image className="size-3.5" />}
          {altBusy ? "Describing…" : "Suggest alt text"}
        </button>
        {alt && (
          <div className="space-y-2">
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 text-[12px] leading-5 text-zinc-700">
              “{alt.text}”
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onMetadataChange({ description: alt.text })}
                className={smallBtn}
              >
                <Check className="size-3.5" /> Use as description
              </button>
              <span className="font-mono text-[10px] text-zinc-400">
                {alt.source} · {(alt.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </Section>

      <Section title="Visual review">
        <p className="text-[11.5px] leading-5 text-zinc-400">
          {nlp.capability().modelId
            ? "A small on-device VLM (Qwen2-VL-2B @ 2-bit, ~900MB) can look at this capture and flag layout problems. On limited devices a structural review runs instead."
            : "Structural review of this capture (dimensions, tiles, redactions) — a VLM isn't available on this device."}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => void reviewVisual(false)} disabled={!svg || visionBusy} className={smallBtn}>
            {visionBusy && !useModelVisual ? <Loader2 className="size-3.5 animate-spin" /> : <ScanEye className="size-3.5" />}
            {visionBusy && !useModelVisual ? "Reviewing…" : "Review structure"}
          </button>
          <button
            onClick={() => void reviewVisual(true)}
            disabled={!svg || visionBusy || !nlp.capability().modelId}
            title="Look at the capture with the on-device vision model"
            className={smallBtn}
          >
            {visionBusy && useModelVisual ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {visionBusy && useModelVisual ? "Looking…" : "Visual review"}
          </button>
        </div>
        {vision && (
          <div className="space-y-2">
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 text-[12px] leading-5 text-zinc-800">
              {vision.summary}
              <span className="ml-2 font-mono text-[10px] text-zinc-400">
                {vision.source}
              </span>
            </p>
            {vision.issues.length > 0 && (
              <ul className="space-y-1">
                {vision.issues.slice(0, 5).map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11.5px] leading-4 text-red-700">
                    <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            )}
            {vision.strengths.length > 0 && (
              <ul className="space-y-1">
                {vision.strengths.slice(0, 3).map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11.5px] leading-4 text-emerald-700">
                    <Check className="mt-0.5 size-3 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
            {vision.suggestion && (
              <p className="text-[11px] leading-4 text-zinc-400">{vision.suggestion}</p>
            )}
          </div>
        )}
      </Section>

      <Section title="Sensitive data">
        <button onClick={() => void scanSensitive()} disabled={scanBusy} className={smallBtn}>
          {scanBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldAlert className="size-3.5" />}
          {scanBusy ? "Scanning…" : "Scan metadata & text"}
        </button>
        {sensitive && (
          <div className="space-y-2">
            {sensitive.length === 0 ? (
              <p className="text-[11.5px] leading-5 text-zinc-400">
                No sensitive data found by the on-device scanner (regex + NER).
              </p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {sensitive.slice(0, 20).map((m) => (
                  <li key={m.id} className="flex items-baseline gap-2 text-[11.5px] text-zinc-600">
                    <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-wide text-amber-800">
                      {KIND_BADGE[m.kind] ?? m.kind}
                    </span>
                    <span className="min-w-0 truncate">{m.hint}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] leading-4 text-zinc-400">
              Heuristic scan — always review before publishing. Use the Mask or
              secure redaction tools to cover findings.
            </p>
          </div>
        )}
      </Section>

      <Section title="Step guide">
        <p className="text-[11.5px] leading-5 text-zinc-400">
          {stepAnns.length === 0
            ? "Add step markers on the canvas, then generate a numbered guide for documentation."
            : `${stepAnns.length} step marker${stepAnns.length === 1 ? "" : "s"} on the canvas.`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void generateGuide(false)}
            disabled={stepAnns.length === 0 || guideBusy}
            className={smallBtn}
          >
            <ListOrdered className="size-3.5" /> Generate
          </button>
          <button
            onClick={() => void generateGuide(true)}
            disabled={stepAnns.length === 0 || guideBusy}
            className={smallBtn}
            title="Polish with Qwen2.5-0.5B @ 2-bit (on-device, ~415MB)"
          >
            {guideBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Polish with AI
          </button>
        </div>
        {guide && (
          <div className="space-y-2">
            <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-2.5 font-mono text-[11px] leading-5 text-zinc-700">
              {stepGuideMarkdown(guide)}
            </pre>
            <div className="flex items-center gap-2">
              <button onClick={() => void copyGuide()} className={smallBtn}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() =>
                  downloadText(
                    stepGuideMarkdown(guide),
                    `step-guide-${Date.now()}.md`,
                    "text/markdown",
                  )
                }
                className={smallBtn}
              >
                <Download className="size-3.5" /> .md
              </button>
              <span className="font-mono text-[10px] text-zinc-400">{guide.source}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => void reviewGuide()} disabled={reviewBusy} className={smallBtn}>
                {reviewBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {reviewBusy ? "Reviewing…" : "Check for mistakes"}
              </button>
              {review && review.issues.length > 0 && (
                <span className="font-mono text-[10px] text-zinc-400">
                  {review.issues.length} issue{review.issues.length === 1 ? "" : "s"} · {review.engine}
                </span>
              )}
            </div>
            {review && (
              <div className="space-y-2">
                {review.issues.length === 0 ? (
                  <p className="text-[11.5px] leading-5 text-zinc-400">
                    No mistakes found — the guide looks clean.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {review.issues.slice(0, 8).map((issue, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11.5px] leading-4 text-zinc-700"
                      >
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-wide",
                            issue.severity === "error"
                              ? "bg-red-50 text-red-700"
                              : issue.severity === "warning"
                                ? "bg-amber-50 text-amber-800"
                                : "bg-zinc-100 text-zinc-500",
                          )}
                        >
                          {issue.kind}
                        </span>
                        <span className="min-w-0">
                          {issue.message}
                          {issue.fix && (
                            <span className="text-zinc-500"> {issue.fix}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="About">
        <p className="text-[11px] leading-4 text-zinc-400">
          <FileText className="mr-1 inline size-3" />
          Contracts are documented in <span className="font-mono">docs/nlp-layer.md</span> —
          same JSON shapes whether a model or the rule engine produced them.
        </p>
      </Section>
    </div>
  );
}

/** Best OCR text near a step marker (document coordinates). */
function textNear(blocks: OcrBlock[], step: Annotation): string {
  const b = annotationBounds(step);
  const near = blocks
    .filter((blk) => {
      if (!blk.bounds) return false;
      const overlapX =
        blk.bounds.x < b.x + b.width + 8 && blk.bounds.x + blk.bounds.width > b.x - 8;
      const overlapY =
        blk.bounds.y < b.y + b.height + 8 && blk.bounds.y + blk.bounds.height > b.y - 8;
      return overlapX && overlapY;
    })
    .map((blk) => blk.text);
  return near.join(" · ").slice(0, 200);
}

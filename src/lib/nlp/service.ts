/**
 * On-device NLP service (browser).
 *
 * A single facade over the intelligence features. Models load lazily on
 * first use (Transformers.js fetches quantized ONNX weights from the Hugging
 * Face CDN; tesseract.js fetches traineddata; the instruct model loads via
 * wllama — llama.cpp compiled to WASM), are cached in memory, and every
 * feature falls back to a pure rule backend (`./rule`) if its model cannot
 * load — so the app never hard-depends on a network fetch or an API key.
 *
 * Error explanation is deliberately rule-first: the catalogue in `./rule`
 * answers every known engine error instantly and offline, and the on-device
 * instruct model (Qwen2.5-0.5B @ 2-bit ≈ 415MB, gated by `./capability`) is
 * only consulted when the caller explicitly asks for a model pass and the
 * device can run it.
 *
 * Dynamic imports keep Transformers.js, tesseract.js and wllama out of the
 * main bundle. The typed contracts live in `./types`; agents and UI consume
 * those shapes only.
 */
import {
  NLP_EMBED_MODEL_ID,
  NLP_EMBED_RULE_ID,
  NLP_STR_MODEL_ID,
  NLP_VISION_GGUF,
  NLP_VISION_MMPROJ,
  NLP_VISION_MODEL_ID,
  AltTextSuggestion,
  DeviceCapability,
  EmbedResult,
  ErrorContext,
  ErrorExplanation,
  IndicLangCode,
  IndicOcrOptions,
  IndicOcrResult,
  MistakeReview,
  NlpFeature,
  NlpModelState,
  NlpModelStatus,
  OcrBlock,
  OcrStrategy,
  SensitiveMatch,
  StepGuide,
  VisionFeedback,
} from "./types";
import {
  INDIC_LANGUAGES,
  INDIC_PROFILES,
  buildLanguageString,
  detectScript,
  indicLanguageByCode,
  normalizeIndicText,
  detectMixedScript,
} from "./indic-ocr";
import { specFor, ModelSpec } from "./registry";
import {
  ruleEmbedTexts,
  ruleExplainError,
  rulePiiScan,
  ruleReviewMistakes,
  ruleStepGuide,
  ruleVisualFeedback,
  StepInput,
  nerToSensitive,
  mergeSensitive,
  NerEntity,
} from "./rule";
import {
  capabilityFor,
  estimateProfile,
  explainModelUrl,
  visionCapability,
} from "./capability";
import { detectTextSegments } from "./str-layout";

import type { PipelineType, ProgressInfo } from "@huggingface/transformers";

type Transformers = typeof import("@huggingface/transformers");
type Tesseract = typeof import("tesseract.js");
// Import the esm subpath so TypeScript resolves its .d.ts (skipped by
// skipLibCheck) instead of the package's root index.ts source, whose syntax
// conflicts with this project's erasableSyntaxOnly.
type WllamaModule = typeof import("@wllama/wllama/esm/index.js");
type WllamaInstance = InstanceType<WllamaModule["Wllama"]>;

/**
 * Cached two-stage STR recognizer (MGP-STR) — shares the "ocr" state.
 *
 * The processor is typed structurally: `AutoProcessor`/`from_pretrained`
 * return the base `Processor` class statically, but the runtime instance is
 * the callable `MgpstrProcessor` (with the fused char/bpe/wp `batch_decode`).
 */
type StrRecognizer = {
  model: InstanceType<Transformers["MgpstrForSceneTextRecognition"]>;
  processor: {
    (images: unknown): Promise<unknown>;
    batch_decode(logits: unknown[]): {
      generated_text: string[];
      scores: number[];
      char_preds: string[];
      bpe_preds: string[];
      wp_preds: string[];
    };
  };
};

// Vite resolves this to the bundled wllama.wasm asset URL at build time.
import wllamaWasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";

interface FeatureState {
  status: NlpModelState;
  detail?: string;
  promise: Promise<unknown> | null;
}

class NlpService {
  private states: Partial<Record<NlpFeature, FeatureState>> = {};
  private embedder: {
    model: string;
    fn: (texts: string[]) => Promise<number[][]>;
  } | null = null;
  private wllama: {
    instance: WllamaInstance;
    /** Model id currently loaded — text and vision are different GGUFs. */
    modelId: string;
  } | null = null;
  /** Cached two-stage STR recognizer (MGP-STR) — shares the "ocr" state. */
  private strModel: StrRecognizer | null = null;

  /* ---------------- status ---------------- */

  status(feature: NlpFeature): NlpModelStatus {
    const spec = specFor(feature);
    const s = this.states[feature];
    return {
      feature,
      model: spec?.model ?? "unknown",
      sizeMb: spec?.sizeMb ?? 0,
      state: s?.status ?? "unloaded",
      detail: s?.detail,
    };
  }

  statusAll(): NlpModelStatus[] {
    return (["search", "pii", "ocr", "alttext", "steps", "explain"] as NlpFeature[]).map((f) =>
      this.status(f),
    );
  }

  /* ---------------- device capability ---------------- */

  /** Capability for the current browser (pure logic lives in ./capability). */
  capability(): DeviceCapability {
    return capabilityFor(estimateProfile());
  }

  /* ---------------- model plumbing ---------------- */

  private state(feature: NlpFeature): FeatureState {
    return (this.states[feature] ??= { status: "unloaded", promise: null });
  }

  private async loadTransformers(): Promise<Transformers | null> {
    try {
      return await import("@huggingface/transformers");
    } catch (e) {
      console.warn("Transformers.js could not be loaded:", e);
      return null;
    }
  }

  private async loadTesseract(): Promise<Tesseract | null> {
    try {
      return await import("tesseract.js");
    } catch (e) {
      console.warn("tesseract.js could not be loaded:", e);
      return null;
    }
  }

  private async loadWllamaModule(): Promise<WllamaModule | null> {
    try {
      return await import("@wllama/wllama/esm/index.js");
    } catch (e) {
      console.warn("wllama could not be loaded:", e);
      return null;
    }
  }

  /** Load (or return the cached) Transformers.js pipeline for a feature. */
  private async pipelineFor(feature: NlpFeature): Promise<unknown | null> {
    const spec = specFor(feature);
    if (!spec || spec.runtime !== "transformers") return null;
    const s = this.state(feature);
    if (s.promise) return s.promise;
    s.status = "loading";
    s.promise = (async () => {
      const T = await this.loadTransformers();
      if (!T) {
        s.status = "unsupported";
        return null;
      }
      try {
        const p = await T.pipeline(spec.task as PipelineType, spec.model, {
          dtype: spec.dtype,
          progress_callback: (pct: ProgressInfo) => {
            const progress = "progress" in pct ? (pct.progress ?? 0) : 0;
            s.detail = `downloading ${Math.round(progress)}%`;
          },
        });
        s.status = "ready";
        s.detail = undefined;
        return p;
      } catch (e) {
        s.status = "error";
        s.detail = e instanceof Error ? e.message : String(e);
        return null;
      }
    })();
    return s.promise;
  }

  /**
   * Load a wllama (llama.cpp WASM) session for a specific model. The text
   * model (Qwen2.5-0.5B) and the vision model (Qwen2-VL-2B + mmproj) are
   * different GGUFs, so the session tracks which model is loaded and swaps
   * when needed. Only called when the capability gate passed.
   */
  private async wllamaFor(feature: NlpFeature): Promise<WllamaInstance | null> {
    const spec = specFor(feature);
    if (!spec || spec.runtime !== "wllama") return null;
    const s = this.state(feature);
    if (s.promise) return (await s.promise) as WllamaInstance | null;
    s.status = "loading";
    s.promise = (async () => {
      try {
        // If a different model is resident, unload it first (memory is tight
        // on legacy hardware; never hold two GGUFs at once).
        if (this.wllama && this.wllama.modelId !== spec.model) {
          await this.wllama.instance.exit().catch(() => undefined);
          this.wllama = null;
        }
        const W = await this.loadWllamaModule();
        if (!W) {
          s.status = "unsupported";
          return null;
        }
        const instance = new W.Wllama(
          { default: wllamaWasmUrl },
          { suppressNativeLog: true, allowOffline: true },
        );
        if (feature === "vision") {
          await instance.loadModelFromHF(
            {
              repo: spec.model,
              file: NLP_VISION_GGUF,
              mmprojFile: NLP_VISION_MMPROJ,
            },
            {
              n_ctx: 2048,
              n_threads: 2,
              progressCallback: ({ loaded, total }) => {
                s.detail = `downloading ${total ? Math.round((loaded / total) * 100) : 0}%`;
              },
            },
          );
        } else {
          await instance.loadModelFromUrl(explainModelUrl(), {
            n_ctx: 2048,
            n_threads: 2,
            progressCallback: ({ loaded, total }) => {
              s.detail = `downloading ${total ? Math.round((loaded / total) * 100) : 0}%`;
            },
          });
        }
        s.status = "ready";
        s.detail = undefined;
        this.wllama = { instance, modelId: spec.model };
        return instance;
      } catch (e) {
        s.status = "error";
        s.detail = e instanceof Error ? e.message : String(e);
        this.wllama = null;
        return null;
      }
    })();
    return (await s.promise) as WllamaInstance | null;
  }

  /** Ask the vision model about an image; returns structured feedback. */
  private async visionJson(
    imageData: ArrayBuffer,
    question: string,
    fallback: VisionFeedback,
  ): Promise<VisionFeedback> {
    try {
      const w = await this.wllamaFor("vision");
      if (!w) return fallback;
      const res = await w.createChatCompletion({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "You are reviewing a captured web screenshot for a documentation tool. " +
                  "Answer with strict JSON only: " +
                  '{"summary": string, "issues": string[], "strengths": string[], "suggestion"?: string}. ' +
                  `Question: ${question}`,
              },
              { type: "image", data: imageData },
            ],
          },
        ],
        max_tokens: 420,
        temperature: 0.2,
        top_k: 40,
        top_p: 0.9,
      });
      const text = res.choices[0]?.message?.content ?? "";
      const parsed = parseStrictJson(text) as
        | {
            summary?: string;
            issues?: unknown[];
            strengths?: unknown[];
            suggestion?: string;
          }
        | null;
      if (!parsed || typeof parsed.summary !== "string") return fallback;
      const str = (arr: unknown[] | undefined) =>
        (arr ?? [])
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .slice(0, 6);
      return {
        summary: parsed.summary,
        issues: str(parsed.issues),
        strengths: str(parsed.strengths),
        suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : fallback.suggestion,
        source: "model",
        model: NLP_VISION_MODEL_ID,
      };
    } catch {
      return fallback;
    }
  }

  /** Run a strict-JSON instruction through the on-device model (if loaded). */
  private async modelJson<T>(
    feature: NlpFeature,
    system: string,
    user: string,
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    try {
      const w = await this.wllamaFor(feature);
      if (!w) return { ok: false };
      const res = await w.createChatCompletion({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 420,
        temperature: 0.2,
        top_k: 40,
        top_p: 0.9,
      });
      const text = res.choices[0]?.message?.content ?? "";
      const parsed = parseStrictJson(text) as T | null;
      if (parsed === null) return { ok: false };
      return { ok: true, value: parsed };
    } catch {
      return { ok: false };
    }
  }

  /* ---------------- search embeddings ---------------- */

  /**
   * Embed a batch of texts. Resolves the best available embedder (MiniLM on
   * first use; rule fallback if the model can't load) and returns which model
   * produced the vectors — store that id alongside them.
   */
  async embed(texts: string[]): Promise<EmbedResult> {
    const clean = texts.map((t) => t.slice(0, 2000));
    if (!this.embedder) {
      try {
        const p = (await this.pipelineFor("search")) as
          | { (texts: string[], opts: object): Promise<{ tolist(): number[][] }> }
          | null;
        if (p) {
          const run = async (ts: string[]) => {
            const out = await p(ts, { pooling: "mean", normalize: true });
            return out.tolist();
          };
          this.embedder = { model: NLP_EMBED_MODEL_ID, fn: run };
        }
      } catch {
        /* fall through to rules */
      }
      if (!this.embedder) {
        this.embedder = {
          model: NLP_EMBED_RULE_ID,
          fn: async (ts) => ruleEmbedTexts(ts),
        };
      }
    }
    const vectors = await this.embedder.fn(clean);
    return { vectors, model: this.embedder.model };
  }

  /** The embedder id that would be used for new vectors (no embedding side effects). */
  async embedModel(): Promise<string> {
    return (await this.embed([""])).model;
  }

  /* ---------------- sensitive-data detection ---------------- */

  /** Fuse regex + on-device NER (when the model is available). */
  async detectSensitive(text: string): Promise<SensitiveMatch[]> {
    const rule = rulePiiScan(text);
    const ner: SensitiveMatch[] = [];
    try {
      const p = (await this.pipelineFor("pii")) as
        | { (text: string, opts: object): Promise<NerEntity[]> }
        | null;
      if (p) {
        const raw = await p(text, { aggregation_strategy: "simple" });
        ner.push(...nerToSensitive((raw ?? []).filter((t) => t.score >= 0.8)));
      }
    } catch {
      /* rules only */
    }
    return mergeSensitive(rule, ner);
  }

  /* ---------------- OCR ---------------- */

  /**
   * Run OCR on an image data URL; returns line-level blocks.
   *
   * `strategy: "str"` opts into the two-stage scene-text pipeline (line-box
   * detection + `onnx-community/mgp-str-base`); it beats tesseract on
   * dark themes and non-standard fonts, at the cost of a ~91MB download.
   * Falls back to tesseract if the STR model cannot load.
   *
   * `strategy: "indic"` opts into multi-script Indian language OCR via
   * tesseract.js with language-specific traineddata files. Supports auto
   * script detection, predefined language profiles, and multi-language
   * combined OCR for mixed-script documents.
   */
  async ocrImage(
    dataUrl: string,
    opts?: {
      onProgress?: (progress: number) => void;
      strategy?: OcrStrategy;
      indicOptions?: IndicOcrOptions;
    },
  ): Promise<OcrBlock[]> {
    if (opts?.strategy === "str") return this.ocrImageStr(dataUrl, opts);
    if (opts?.strategy === "indic") return this.ocrImageIndic(dataUrl, opts);
    return this.ocrImageTesseract(dataUrl, opts);
  }

  /**
   * Run Indic multi-script OCR. Supports auto language detection, predefined
   * profiles (e.g., "hindi-english"), and explicit language selection.
   * Uses tesseract.js with Indic traineddata files.
   */
  async ocrImageIndic(
    dataUrl: string,
    opts?: {
      onProgress?: (progress: number) => void;
      indicOptions?: IndicOcrOptions;
    },
  ): Promise<OcrBlock[]> {
    const indicOpts = opts?.indicOptions;
    const s = this.state("ocr");
    if (s.status !== "ready") s.status = "loading";

    const T = await this.loadTesseract();
    if (!T) {
      s.status = "unsupported";
      return [];
    }

    try {
      // Determine language string
      let langString = "eng";
      let detectionMode: "auto" | "explicit" | "profile" = "explicit";
      let detectedScript = "Latin";
      const warnings: string[] = [];

      if (indicOpts?.profile && INDIC_PROFILES[indicOpts.profile]) {
        // Pre-defined profile
        const profile = INDIC_PROFILES[indicOpts.profile];
        langString = buildLanguageString(profile.languages, indicOpts.maxLanguages ?? 3);
        detectionMode = "profile";
      } else if (indicOpts?.language && indicOpts.language !== "auto") {
        // Explicit language selection
        const codes = [indicOpts.language, ...(indicOpts.additionalLanguages ?? [])];
        langString = buildLanguageString(codes, indicOpts.maxLanguages ?? 3);
        const lang = indicLanguageByCode(indicOpts.language);
        detectedScript = lang?.script ?? "Unknown";
      } else {
        // Auto-detection: run a quick tesseract pass with eng to get text,
        // then detect script from the recognized text
        detectionMode = "auto";
        const worker = await T.createWorker("eng", 1, {
          logger: (m: { status?: string; progress?: number }) => {
            if (m?.status === "recognizing text" && typeof m.progress === "number") {
              s.detail = `detecting script ${Math.round(m.progress * 100)}%`;
              opts?.onProgress?.(m.progress * 0.3); // 30% for detection
            }
          },
        });
        try {
          const { data } = await worker.recognize(dataUrl);
          const sampleText = data.text ?? "";
          const detectedCode = detectScript(sampleText);
          const lang = indicLanguageByCode(detectedCode);
          detectedScript = lang?.script ?? "Unknown";
          langString = detectedCode === "eng" ? "eng" : `${detectedCode}+eng`;
          warnings.push(`Auto-detected: ${lang?.name ?? detectedCode} (${detectedScript})`);
        } finally {
          await worker.terminate().catch(() => undefined);
        }
      }

      // Run full OCR with the determined language(s)
      const worker = await T.createWorker(langString, 1, {
        logger: (m: { status?: string; progress?: number }) => {
          if (m?.status === "recognizing text" && typeof m.progress === "number") {
            s.detail = `recognizing ${detectedScript} ${Math.round(m.progress * 100)}%`;
            opts?.onProgress?.(detectionMode === "auto"
              ? 0.3 + m.progress * 0.7 // remaining 70% after detection
              : m.progress);
          }
        },
      });

      try {
        const { data } = await worker.recognize(dataUrl);
        const lines = ((data as { lines?: { text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }[] }).lines ?? [])
          .map((l) => {
            let text = (l.text ?? "").trim();
            // Normalize Indic text (NFC, fix common OCR artifacts)
            const lang = indicLanguageByCode(langString.split("+")[0]);
            if (lang && lang.scriptFamily !== "latin") {
              text = normalizeIndicText(text, lang.scriptFamily);
            }
            return {
              text,
              confidence: l.confidence ?? 0,
              bounds: l.bbox
                ? {
                    x: l.bbox.x0,
                    y: l.bbox.y0,
                    width: Math.max(1, l.bbox.x1 - l.bbox.x0),
                    height: Math.max(1, l.bbox.y1 - l.bbox.y0),
                  }
                : null,
              source: "ocr" as const,
            };
          })
          .filter((l) => l.text.length > 0);

        s.status = "ready";
        s.detail = undefined;
        return lines;
      } finally {
        await worker.terminate().catch(() => undefined);
      }
    } catch (e) {
      s.status = "error";
      s.detail = e instanceof Error ? e.message : String(e);
      return [];
    }
  }

  /** Load (or return the cached) MGP-STR recognizer for the "str" strategy. */
  private async loadStrModel(): Promise<StrRecognizer | null> {
    const s = this.state("ocr");
    if (this.strModel) return this.strModel;
    if (s.promise) return (await s.promise) as StrRecognizer | null;
    s.status = "loading";
    s.promise = (async () => {
      try {
        const T = await this.loadTransformers();
        if (!T) {
          s.status = "unsupported";
          return null;
        }
        const model = await T.MgpstrForSceneTextRecognition.from_pretrained(NLP_STR_MODEL_ID, {
          dtype: "q4",
          progress_callback: (pct: ProgressInfo) => {
            const progress = "progress" in pct ? (pct.progress ?? 0) : 0;
            s.detail = `downloading STR model ${Math.round(progress)}%`;
          },
        });
        const processor = (await T.MgpstrProcessor.from_pretrained(NLP_STR_MODEL_ID)) as unknown as StrRecognizer["processor"];
        s.status = "ready";
        s.detail = undefined;
        this.strModel = { model, processor };
        return this.strModel;
      } catch (e) {
        s.status = "error";
        s.detail = e instanceof Error ? e.message : String(e);
        return null;
      }
    })();
    return s.promise as Promise<StrRecognizer | null>;
  }

  /** Two-stage STR OCR (stage 1 detection + stage 2 MGP-STR recognition). */
  private async ocrImageStr(
    dataUrl: string,
    opts?: { onProgress?: (progress: number) => void },
  ): Promise<OcrBlock[]> {
    const fallback = () => this.ocrImageTesseract(dataUrl, opts);
    const s = this.state("ocr");
    if (s.status !== "ready") s.status = "loading";
    const str = await this.loadStrModel();
    if (!str) return fallback();
    try {
      const T = await this.loadTransformers();
      if (!T) return fallback();
      const image = await T.RawImage.read(dataUrl);
      const segments = detectTextSegments(image.data, image.width, image.height);
      if (segments.length === 0) {
        s.status = "ready";
        s.detail = "no text detected";
        return [];
      }
      // Crop each detected line and feed the recognizer in small batches.
      const src = image.toCanvas();
      const crops: InstanceType<Transformers["RawImage"]>[] = [];
      for (const seg of segments) {
        const c = document.createElement("canvas");
        c.width = seg.width;
        c.height = seg.height;
        const ctx = c.getContext("2d");
        if (!ctx) continue;
        ctx.drawImage(src, seg.x, seg.y, seg.width, seg.height, 0, 0, seg.width, seg.height);
        crops.push(await T.RawImage.fromCanvas(c));
      }
      const blocks: OcrBlock[] = [];
      const BATCH = 8;
      for (let i = 0; i < crops.length; i += BATCH) {
        const batch = crops.slice(i, i + BATCH);
        const inputs = await str.processor(batch);
        const outputs = await str.model(inputs);
        const decoded = str.processor.batch_decode(outputs.logits);
        for (let j = 0; j < batch.length; j++) {
          const seg = segments[i + j];
          const text = (decoded.generated_text[j] ?? "").trim();
          if (!text) continue;
          blocks.push({
            text,
            confidence: decoded.scores[j] ?? 0.5,
            bounds: { x: seg.x, y: seg.y, width: seg.width, height: seg.height },
            source: "ocr" as const,
          });
        }
        opts?.onProgress?.(Math.min(1, (i + batch.length) / crops.length));
      }
      s.status = "ready";
      s.detail = undefined;
      return blocks;
    } catch (e) {
      s.status = "error";
      s.detail = e instanceof Error ? e.message : String(e);
      return fallback();
    }
  }

  /** Run tesseract.js on an image data URL; returns line-level blocks. */
  private async ocrImageTesseract(
    dataUrl: string,
    opts?: { onProgress?: (progress: number) => void },
  ): Promise<OcrBlock[]> {
    const s = this.state("ocr");
    if (s.status !== "ready") s.status = "loading";
    const T = await this.loadTesseract();
    if (!T) {
      s.status = "unsupported";
      return [];
    }
    try {
      const worker = await T.createWorker("eng", 1, {
        logger: (m: { status?: string; progress?: number }) => {
          if (m?.status === "recognizing text" && typeof m.progress === "number") {
            s.detail = `recognizing ${Math.round(m.progress * 100)}%`;
            opts?.onProgress?.(m.progress);
          }
        },
      });
      try {
        const { data } = await worker.recognize(dataUrl);
        const lines = ((data as { lines?: { text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }[] }).lines ?? [])
          .map((l) => ({
            text: (l.text ?? "").trim(),
            confidence: l.confidence ?? 0,
            bounds: l.bbox
              ? {
                  x: l.bbox.x0,
                  y: l.bbox.y0,
                  width: Math.max(1, l.bbox.x1 - l.bbox.x0),
                  height: Math.max(1, l.bbox.y1 - l.bbox.y0),
                }
              : null,
            source: "ocr" as const,
          }))
          .filter((l) => l.text.length > 0);
        s.status = "ready";
        s.detail = undefined;
        return lines;
      } finally {
        await worker.terminate().catch(() => undefined);
      }
    } catch (e) {
      s.status = "error";
      s.detail = e instanceof Error ? e.message : String(e);
      return [];
    }
  }

  /* ---------------- alt text ---------------- */

  /** Caption an image data URL with distilvit; heuristic fallback. */
  async captionImage(dataUrl: string): Promise<AltTextSuggestion | null> {
    const fallback = (): AltTextSuggestion | null => null;
    try {
      const p = (await this.pipelineFor("alttext")) as
        | { (image: unknown, opts: object): Promise<{ generated_text?: string }[]> }
        | null;
      if (!p) return fallback();
      const T = await this.loadTransformers();
      if (!T) return fallback();
      const image = await T.RawImage.read(dataUrl);
      const out = await p(image, { max_new_tokens: 40 });
      const text = (out?.[0]?.generated_text ?? "").trim();
      if (!text) return fallback();
      return { text, confidence: 0.85, source: "model" };
    } catch {
      return fallback();
    }
  }

  /* ---------------- step guides ---------------- */

  /**
   * Build a step guide. Defaults to the deterministic template; when
   * `polish` is true, tries the on-device instruct model (wllama) and only
   * adopts its output if it parses back to the same number of steps.
   */
  async generateStepGuide(opts: { title: string; steps: StepInput[]; polish?: boolean }): Promise<StepGuide> {
    const base = ruleStepGuide(opts.title, opts.steps);
    if (!opts.polish || base.steps.length === 0) return base;
    const res = await this.modelJson<{ steps?: string[] }>(
      "steps",
      "You rewrite UI documentation steps. Keep the exact same order and number of steps. " +
        "Reply with strict JSON only: {\"steps\": [\"…\"]}.",
      `Title: ${base.title}\nSteps:\n` + base.steps.map((s) => `${s.number}. ${s.text}`).join("\n"),
    );
    if (!res.ok || !Array.isArray(res.value.steps)) return base;
    const steps = res.value.steps.filter((t) => typeof t === "string" && t.trim());
    if (steps.length !== base.steps.length) return base; // model output unreliable
    return {
      title: base.title,
      steps: steps.map((t, i) => ({ number: i + 1, text: t.trim() })),
      source: "model",
    };
  }

  /* ---------------- error explanation ---------------- */

  /**
   * Explain a capture error. Default is the instant rule catalogue; pass
   * `{ useModel: true }` to also try the on-device instruct model (only
   * runs when the capability gate passes, and only for unknown codes — known
   * codes are answered from the catalogue either way).
   */
  async explainError(
    ctx: ErrorContext,
    opts?: { useModel?: boolean },
  ): Promise<ErrorExplanation> {
    const rule = ruleExplainError(ctx);

    const isKnown = EXPLAIN_KNOWN_CODES.has(ctx.code ?? "");
    if (!opts?.useModel || isKnown) return rule;

    const cap = this.capability();
    if (!cap.modelId) return { ...rule, engine: "rule-fallback" };

    const res = await this.modelJson<{
      summary?: string;
      cause?: string;
      steps?: string[];
      tip?: string;
    }>(
      "explain",
      "You explain software errors clearly and briefly. Reply with strict JSON only: " +
        '{"summary": string, "cause": string, "steps": string[], "tip"?: string}. ' +
        "Keep steps concrete and actionable; no preamble.",
      JSON.stringify({ code: ctx.code, message: ctx.message, phase: ctx.phase, detail: ctx.detail }),
    );

    if (
      !res.ok ||
      typeof res.value.summary !== "string" ||
      typeof res.value.cause !== "string" ||
      !Array.isArray(res.value.steps) ||
      res.value.steps.length === 0
    ) {
      return { ...rule, engine: "rule-fallback" };
    }

    return {
      code: ctx.code,
      summary: res.value.summary,
      cause: res.value.cause,
      steps: res.value.steps.filter((s) => typeof s === "string" && s.trim()).slice(0, 6),
      tip: typeof res.value.tip === "string" ? res.value.tip : rule.tip,
      engine: "model",
      model: cap.modelId,
    };
  }

  /* ---------------- vision feedback ---------------- */

  /**
   * Look at a captured image and return structured feedback. Rule fallback
   * answers instantly from capture metadata (works everywhere); pass
   * `{ useModel: true }` to also run the on-device VLM when the capability
   * gate passes.
   */
  async visualFeedback(
    imageDataUrl: string,
    context?: {
      width?: number;
      height?: number;
      tileCount?: number;
      redacted?: boolean;
      url?: string;
      warnings?: string[];
    },
    opts?: { useModel?: boolean },
  ): Promise<VisionFeedback> {
    const fallback = ruleVisualFeedback(context ?? {});
    if (!opts?.useModel) return fallback;
    const vcap = visionCapability(estimateProfile());
    if (!vcap.modelId) return fallback;
    try {
      const bytes = await dataUrlToArrayBuffer(imageDataUrl);
      if (!bytes) return fallback;
      return await this.visionJson(
        bytes,
        "Check this web capture for layout problems: overlaps, cut-offs, blank areas, " +
          "broken text, missing sections. Note anything that looks great too.",
        fallback,
      );
    } catch {
      return fallback;
    }
  }

  /* ---------------- mistake review ---------------- */

  /**
   * Review generated text for small mistakes. Rule checks always run (instant,
   * offline); pass `{ useModel: true }` to also ask the on-device model for
   * anything the rules missed — the rule findings are always kept.
   */
  async reviewMistakes(
    text: string,
    opts?: { useModel?: boolean },
  ): Promise<MistakeReview> {
    const ruleIssues = ruleReviewMistakes(text);
    if (!opts?.useModel || ruleIssues.length > 4) {
      return { issues: ruleIssues, engine: "rule" };
    }
    const cap = this.capability();
    if (!cap.modelId) return { issues: ruleIssues, engine: "rule" };

    const res = await this.modelJson<{ mistakes?: string[] }>(
      "explain",
      "You proofread short documentation text. Reply with strict JSON only: " +
        '{"mistakes": ["…"]} — list only real mistakes with their fixes; empty array if none.',
      text.slice(0, 1500),
    );

    const issues = ruleIssues.slice();
    if (res.ok && Array.isArray(res.value.mistakes)) {
      for (const m of res.value.mistakes) {
        if (typeof m !== "string" || !m.trim()) continue;
        if (issues.some((i) => i.message === m)) continue;
        issues.push({ severity: "warning", kind: "consistency", message: m.slice(0, 200) });
      }
    }
    return {
      issues,
      engine: issues.length > ruleIssues.length ? "model" : "rule",
      model: issues.length > ruleIssues.length ? cap.modelId : undefined,
    };
  }
}

const EXPLAIN_KNOWN_CODES = new Set([
  "missing-service",
  "url-blocked",
  "network",
  "unauthorized",
  "no-selector",
  "element-not-found",
  "element-hidden",
  "bad-region",
  "too-tall",
  "raster",
  "cancelled",
  "timed-out",
  "blocked-by-policy",
  "",
  undefined,
]);

/** Convert a data: URL to an ArrayBuffer (for VLM image content blocks). */
export async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(dataUrl);
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/** Extract the first JSON object from model output (handles fenced/loose text). */
export function parseStrictJson(text: string): unknown | null {
  const cleaned = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(cleaned);
  const candidate = fenced ? fenced[1] : cleaned;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Browser singleton — import and call; agents included. */
export const nlp = new NlpService();

/** Visibility-tested DOM text extraction (blueprint §16) — browser only. */
export function extractVisibleText(
  root: HTMLElement = document.body,
  maxChars = 6000,
): string {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const r = parent.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const t = node.textContent?.replace(/\s+/g, " ").trim();
    if (t && t.length > 1) out.push(t);
    if (out.join(" ").length > maxChars) break;
  }
  return out.join(" ").slice(0, maxChars);
}

/** Model spec reference for UI tooltips. */
export function spec(feature: NlpFeature): ModelSpec | undefined {
  return specFor(feature);
}

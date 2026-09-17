# stitaP — On-device NLP layer

The intelligence layer for stitaP: **semantic library search, smart
sensitive-data detection, OCR + suggested alt text, step-guide generation,
and error explanation / mistake review**. Compact models are **under 200M
parameters**; the text model is a **quantized instruct model (Qwen2.5-0.5B @
2-bit ≈ 415MB)**. Everything runs **in the browser** — Transformers.js (ONNX
Runtime Web), tesseract.js, and wllama (llama.cpp compiled to WASM) — with no
inference server and no API key. Capture content never leaves the machine.

This document is the **agent contract**: the JSON shapes, the service API,
and the fallback guarantees. The same shapes are produced whether a neural
model or the pure rule engine ran, so agents and UI consume one stable
interface regardless of the implementation.

## Modules

```
src/lib/nlp/
  types.ts       JSON contracts (OcrBlock, SensitiveMatch, StepGuide,
                 ErrorExplanation, MistakeReview, DeviceCapability, …)
  registry.ts    model registry (params + quantized sizes + runtime)
  capability.ts  pure device-capability gating (rule-only vs on-device model)
  rule.ts        pure rule fallbacks (PII regex, n-gram embeddings,
                 error catalogue, mistake checks, templates)
  service.ts     `nlp` singleton — lazy model loading + fallback wiring
scripts/nlp-smoke.ts   pure-logic smoke tests (69 cases)
```

## The model registry

| Feature | Model | Params | Quantized size | Runtime |
|---|---|---|---|---|
| search | `onnx-community/all-MiniLM-L6-v2-ONNX` | 22.7M | ~23 MB | Transformers.js |
| pii | `onnx-community/distilbert-NER-ONNX` | 66.6M | ~26 MB | Transformers.js |
| alttext | `onnx-community/distilvit-ONNX` | ~85–100M | ~90 MB | Transformers.js |
| steps / explain | `Qwen/Qwen2.5-0.5B-Instruct-GGUF` (`q2_k`) | 494M @ 2-bit | ~415 MB | wllama (llama.cpp WASM) |
| **vision** | `bartowski/Qwen2-VL-2B-Instruct-GGUF` (`IQ2_M`) + mmproj | 2B VLM @ 2-bit | ~900 MB | wllama (multimodal) |
| ocr | tesseract.js + eng traineddata (classical LSTM) | — | ~15 MB | tesseract.js |
| ocr (accurate, optional) | `onnx-community/mgp-str-base` (q4 ONNX) | 61M | ~91 MB | Transformers.js |
| ocr (indic) | tesseract.js + Indic traineddata (13 Indian languages + English) | — | ~2–3 MB/lang | tesseract.js |

Weights stream from the Hugging Face CDN on first use and are cached by the
browser (CacheStorage / wllama's own cache). Each feature **degrades
gracefully**: if a model cannot load (offline, blocked CDN, WASM unavailable,
or the device is too old), the rule fallback serves the same contract.

### Why a separate vision model (and not a 1.58-bit VLM)?

Qwen2.5-0.5B is **text-only** — it cannot see images. For visual feedback on
captures we need a VLM (vision-language model). The measured reality (HF
file sizes, verified):

- **True 1.58-bit VLMs do not exist yet** — the "1.58-bit" GGUFs on HF
  (Falcon3, BitNet) are text-only and 1.2–2.2 GB anyway.
- The smallest real browser-runnable VLM is **Qwen2-VL-2B at IQ2_M ≈ 601 MB
  (+ ~300 MB mmproj)** — loaded through wllama, which natively accepts image
  content blocks (`{ type: "image", data: ArrayBuffer }`).
- Vision is therefore a **second, heavier model** gated separately
  (`visionCapability` in `capability.ts`): standard/modern devices can run
  it; legacy devices get a deterministic structural review
  (`ruleVisualFeedback`) instead — same `VisionFeedback` contract.

### Why Qwen2.5-0.5B @ 2-bit instead of a 1.58-bit text model?

The user-facing directive was "1-bit quantized versions of big models that
run on 15-year-old laptops with <2GB RAM." The measured reality (HF file
sizes, verified):

| "1.58-bit" model on HF | Actual GGUF size | Fits 2GB laptop? |
|---|---|---|
| `tiiuae/Falcon3-1B-Instruct-1.58bit-GGUF` | **1.36 GB** | no |
| `microsoft/bitnet-b1.58-2B-4T-gguf` | **1.19 GB** | no |
| `tiiuae/Falcon3-3B-Instruct-1.58bit-GGUF` | **2.22 GB** | no |
| `Qwen/Qwen2.5-0.5B-Instruct-GGUF` `q2_k` | **415 MB** | **yes** |

Native 1.58-bit GGUFs are not actually small — the `i2_s` quant format packs
~2 bits but the published files keep FP16 embeddings and overhead, so the
smallest 1.58-bit instruct models land at 1.2–2.2 GB, which would swap on a
2GB machine. The smallest real instruct GGUF that fits is **Qwen2.5-0.5B at
Q2_K (2-bit, 415MB)** — a 0.5B model trained on ~3T tokens, so its
explanations beat a 135M model while staying inside the memory budget.

Runtime constraint: **Transformers.js cannot load GGUF** (ONNX only) and
**web-llm requires WebGPU** (absent on 2011 hardware). The only browser
runtime that executes quantized GGUFs on CPU is **wllama** — llama.cpp
compiled to WASM, single-threaded when the page can't set
`Cross-Origin-Embedder-Policy` headers. Speed on a 2011 dual-core with WASM
SIMD is ~1–3 tokens/s, so the model is used only for **one-shot, user-initiated**
explanations (max 420 tokens), never interactive chat.

## Device capability gating (`capability.ts`, pure)

```ts
nlp.capability() // → DeviceCapability for the current browser
```

| Tier | Heuristic | On-device model? |
|---|---|---|
| legacy | <2GB RAM, or unknown RAM + ≤2 cores | **No** — instant rule catalogue only |
| standard | 2–4GB RAM | Yes — 415MB model, slow (~1–3 tok/s on old CPUs) |
| modern | ≥4GB RAM, or WebGPU | Yes |

`canFitModel(profile, sizeMb)` uses `usable = RAM_MB − 700 (browser/OS) − 256
(slack)`; the 415MB model + ~180MB runtime must fit. The rule catalogue is
the **guaranteed path on every device** — the model only deepens free-form
answers for unknown error codes.

## Service API (`nlp` singleton)

```ts
nlp.status(feature)                       // NlpModelStatus — unloaded|loading|ready|error|unsupported
nlp.statusAll()                           // NlpModelStatus[]
nlp.capability()                          // DeviceCapability — { tier, modelBudgetMb, modelId?, reason }
nlp.embed(texts: string[])                // Promise<EmbedResult>   { vectors, model }
nlp.embedModel()                          // Promise<string> — which embedder would be used
nlp.detectSensitive(text: string)         // Promise<SensitiveMatch[]>
nlp.ocrImage(dataUrl, { onProgress, strategy, indicOptions }) // Promise<OcrBlock[]> — strategy: "tesseract" | "str" | "indic"
nlp.ocrImageIndic(dataUrl, { onProgress, indicOptions }) // Promise<OcrBlock[]> — Indic multi-script OCR
nlp.captionImage(dataUrl)                 // Promise<AltTextSuggestion | null>
nlp.generateStepGuide({ title, steps, polish? }) // Promise<StepGuide>
nlp.explainError(ctx, { useModel? })      // Promise<ErrorExplanation>
nlp.reviewMistakes(text, { useModel? })   // Promise<MistakeReview>
nlp.visualFeedback(dataUrl, ctx?, { useModel? }) // Promise<VisionFeedback>
```

## Contracts (the JSON shapes agents consume)

### Error explanation

```jsonc
// nlp.explainError({ code: "url-blocked", message: "…", phase: "failed" }) →
{
  "code": "url-blocked",
  "summary": "The URL was blocked by the security policy.",
  "cause": "stitaP blocks unsafe destinations before opening them…",
  "steps": [
    "Check the URL uses http:// or https:// (not file:, data:, or javascript:).",
    "Confirm the hostname is a public domain…"
  ],
  "tip": "Redirects are re-validated too…",
  "engine": "rule"          // or "model" (Qwen2.5-0.5B @ 2-bit) or "rule-fallback"
}
```

- `engine: "rule"` → instant offline catalogue (every engine error code:
  `missing-service · url-blocked · network · unauthorized · no-selector ·
  element-not-found · element-hidden · bad-region · too-tall · raster ·
  cancelled · timed-out · blocked-by-policy`).
- `engine: "model"` → on-device instruct model, **only** when the caller
  passes `{ useModel: true }` **and** the code is unknown **and**
  `nlp.capability().modelId` exists. Output is strict-JSON-guarded
  (`parseStrictJson`) and validated before adoption.
- `engine: "rule-fallback"` → the model was attempted but failed/timed out;
  the catalogue's generic answer is returned. Never empty.

### Mistake review

```jsonc
// nlp.reviewMistakes("1. Open the app\n2. Open the app") →
{
  "issues": [
    { "severity": "warning", "kind": "duplicate",
      "message": "Duplicate step: “Open the app”.", "fix": "Remove one of the repeated steps.",
      "line": 2 }
  ],
  "engine": "rule"          // or "model" when the model added findings
}
```

Kinds: `duplicate · empty · numbering · length · typo · markdown ·
consistency`. Rule checks are instant: common typos, duplicate steps,
numbering gaps, empty numbered items, over-long lines, skipped heading
levels, trailing whitespace. The model pass (optional) appends free-form
findings only when it parses back as strict JSON.

### Embeddings (semantic search)

```jsonc
// nlp.embed(["billing invoice export"]) →
{
  "vectors": [[0.012, -0.031, /* … 384 floats, L2-normalized */]],
  "model": "minilm-l6-v2"        // or "rule-ngram-v1" (fallback)
}
```

- Both embedders are 384-dim and L2-normalized, so vectors are comparable.
- The returned `model` id **must be stored beside the vector** (Convex
  `captures.embedModel`) — search only compares captures with the same id.
- Index text: `title + description + tags + url + capture-time OCR text`
  (`ocrText`), sliced to 2000 chars — so searchable text is captured once at
  capture time and never re-OCR'd.
- Ranking: server-side Convex native vector index (`captures.by_embedding`,
  384-dim, `userId` filter — `searchByEmbedding` action) with a client-side
  `getCaptureEmbeddings` + `cosineSimilarity` fallback when the index isn't
  deployed. Text search also matches `ocrText`.

### Sensitive-data detection

```jsonc
// nlp.detectSensitive("Contact alice@example.com or 123-45-6789") →
[
  { "id": "email-0", "kind": "email", "label": "Email",
    "hint": "Contact alice@example.com or 123-45-6789", "start": 8, "end": 25, "source": "regex" },
  { "id": "ssn-1", "kind": "ssn", "label": "SSN",
    "hint": "…or 123-45-6789", "start": 29, "end": 39, "source": "regex" }
]
```

Kinds: `api-key · token · password · session · private-key · email · phone ·
credit-card · ssn · person`. `source` is `regex` or `ner` (distilbert-NER,
threshold 0.8). Credit cards pass a Luhn check; phone runs are validated to
10–12 digits to avoid timestamps.

### OCR

```jsonc
// nlp.ocrImage(dataUrl) →
[
  { "text": "Account settings", "confidence": 0.96,
    "bounds": { "x": 120, "y": 40, "width": 300, "height": 24 }, "source": "ocr" }
]
```

Tile-aware: call per base layer and offset with
`offsetOcrBlocks(blocks, tile.x, tile.y)`, then `mergeOcrBlocks(lists)`.
Flatten with `ocrBlocksToText(blocks)`.

Capture-time (blueprint §14 `ocrLayers`): the engine runs OCR inside its
processing stage when the request has `intelligence.ocrAtCapture` (default
on) and persists the result on `CaptureDocument.ocr` — no second pass in the
Intelligence tab. Demo captures use the live-DOM hybrid snapshot
(`ocrStateFromDomSnapshot`, engine `hybrid-dom`, instant — no model);
raster-only captures use `runOcrAtCapture` → tesseract per tile
(`ocrStateFromBlocks`). State is capped (1500 layers / 20k chars,
`OCR_AT_CAPTURE_MAX_*`), survives the SVG round-trip via `vc:ocr*` metadata
and the JSON sidecar, and is restored by `documentFromSvg`. Flattened text
(`ocrTextOf`) is sent to the backend on save (`captures.saveCapture.ocrText`)
and feeds semantic + text search and the sensitive-data scan.

Two-stage STR (optional accuracy upgrade): `nlp.ocrImage(dataUrl, { strategy:
"str" })` swaps tesseract for a scene-text pipeline that beats it on
non-standard fonts and dark themes. Stage 1 (`detectTextSegments` in
`src/lib/nlp/str-layout.ts`) is pure and model-free — per-channel edge-energy
projection finds text-line bands (polarity-agnostic, so light-on-dark works),
rejects solid blocks that only have border ink, and chunks lines wider than
~20× line height into recognizer-sized crops. Stage 2 feeds each crop to
`onnx-community/mgp-str-base` (MGP-STR, multi-granularity char/BPE/wordpiece
fusion, 32×128 input) through Transformers.js in batches of 8, decoding with
`MgpstrProcessor.batch_decode`. If the ~91MB model can't load, the call falls
back to tesseract automatically. The Intelligence tab exposes this as a
“Fast / Accurate” toggle next to “Extract text”.

### Indic OCR (multi-script Indian language OCR)

```jsonc
// nlp.ocrImage(dataUrl, { strategy: "indic", indicOptions: { language: "hin" } }) →
[
  { "text": "नमस्ते दुनिया", "confidence": 0.92,
    "bounds": { "x": 50, "y": 30, "width": 200, "height": 28 }, "source": "ocr" }
]
```

**Supported languages (13 + English):**

| Language | Code | Script | Family |
|----------|------|--------|--------|
| Hindi | `hin` | Devanagari | Devanagari |
| Marathi | `mar` | Devanagari | Devanagari |
| Sanskrit | `san` | Devanagari | Devanagari |
| Nepali | `nep` | Devanagari | Devanagari |
| Bengali | `ben` | Bengali | Bengali |
| Assamese | `asm` | Eastern Nagari | Bengali |
| Tamil | `tam` | Tamil | Tamil |
| Telugu | `tel` | Telugu | Telugu |
| Kannada | `kan` | Kannada | Kannada |
| Malayalam | `mal` | Malayalam | Malayalam |
| Gujarati | `guj` | Gujarati | Gujarati |
| Punjabi | `pan` | Gurmukhi | Gurmukhi |
| Odia | `ori` | Odia | Odia |
| English | `eng` | Latin | Latin |

**Pre-defined profiles for mixed-script documents:**

| Profile | Languages | Use case |
|---------|-----------|----------|
| `hindi-english` | hin + eng | Common bilingual documents, government forms |
| `bengali-english` | ben + eng | Bengali newspapers, academic documents |
| `tamil-english` | tam + eng | Tamil Nadu government documents |
| `telugu-english` | tel + eng | AP/Telangana documents |
| `hindi-marathi` | hin + mar | Maharashtra government documents |
| `all-south-indian` | tam + tel + kan + mal | Multi-script South Indian |
| `devanagari-all` | hin + mar + nep + san | Any Devanagari-script language |
| `indian-all` | all 13 + eng | Maximum coverage |

**How it works:**

1. **Auto detection** (`language: "auto"`): runs a quick tesseract pass with
   `eng`, analyzes Unicode codepoints to detect the dominant script family,
   then runs full OCR with the detected language + English.
2. **Explicit selection** (`language: "hin"`): loads the Hindi traineddata
   from the jsdelivr CDN (lazy, cached after first fetch).
3. **Profile mode** (`profile: "hindi-english"`): combines `hin+eng` for
   tesseract's multi-language mode.
4. **Post-processing**: Unicode NFC normalization, fixes orphaned viramas
   and nuktas in Devanagari, collapses whitespace.

**Files:**
- `src/lib/nlp/indic-ocr.ts` — language config, script detection, profiles,
  text normalization, mixed-script detection
- `src/lib/nlp/service.ts` — `ocrImageIndic()` method
- `src/lib/store/tools/indic-ocr-tools.ts` — 4 Store tool manifests

**Store tools:**
- `ocr.indic.detect` — detect dominant Indian script from image
- `ocr.indic.recognize` — full multi-script OCR
- `ocr.indic.batch` — batch OCR for multiple images
- `ocr.indic.postprocess` — Unicode normalization & artifact cleanup

### Visual feedback (capture review)

```jsonc
// nlp.visualFeedback(jpegDataUrl, { width, height, tileCount, redacted, url }, { useModel: true }) →
{
  "summary": "1 potential issue detected.",
  "issues": ["Aspect ratio is extreme (40:1) — verify the page didn't scroll infinitely."],
  "strengths": ["Canvas is 1440×4000px with 4 tiles.", "Source URL recorded for replay and provenance."],
  "suggestion": "Review the issues listed above; re-capture if the base layer is affected.",
  "source": "rule"      // or "model" (Qwen2-VL-2B via wllama)
}
```

- `source: "rule"` → deterministic structural review (`ruleVisualFeedback`)
  from capture metadata — instant, works on any device, no model download.
- `source: "model"` → the on-device VLM (Qwen2-VL-2B @ IQ2_M ≈ 900MB with
  mmproj) looks at the actual pixels; gated by `visionCapability` and
  strict-JSON-validated before adoption.

### Capture replay (capture once, refresh per release)

`src/lib/capture/replay.ts` turns a `CaptureDocument` into a reproducible
capture recipe + a Playwright script:

```ts
buildCaptureRecipe(document)   // → CaptureRecipe (url, viewport, mode, selector, region, …)
buildReplayScript(recipe, url?) // → valid .spec.ts re-driving the same page
recipeFromRequest(request)     // → recipe from a pre-capture request
recipeToJson(recipe)           // → compact sidecar JSON
```

The generated script navigates to the source URL, sets the original viewport,
waits for readiness, runs the lazy-load scroll pass, and screenshots
viewport / full-page / region / element exactly as the capture was made — so
re-running it against a **new version** produces a fresh base layer while the
stored annotations and metadata stay valid. Deterministic (same document →
same script), so it is fully smoke-tested in Node.

### Alt text

```jsonc
// nlp.captionImage(jpegDataUrl) →
{ "text": "a table with pricing information", "confidence": 0.85, "source": "model" }
// heuristic fallback (heuristicAltText): source: "heuristic", confidence 0.4–0.9
```

### Step guide

```jsonc
// nlp.generateStepGuide({ title: "Export a report", steps: [{number:1,text:"Open Settings"}, …] }) →
{ "title": "Export a report",
  "steps": [ { "number": 1, "text": "Open Settings" }, { "number": 2, "text": "…" } ],
  "source": "template" }            // or "model" (adopted only if it parses back 1:1)
```

Render with `stepGuideMarkdown(guide)`.

## Persistence (Convex)

- `captures.embedding` (`v.optional(v.array(v.number()))`, 384 floats) +
  `captures.embedModel` (`v.optional(v.string())`) — set via the
  `setCaptureEmbedding` mutation (auth + ownership guarded; rejects
  non-384 or non-finite vectors).
- `getCaptureEmbeddings` query returns `[{ captureId, embedModel, embedding }]`
  for the signed-in user — the client ranks by cosine
  (`cosineSimilarity` in `rule.ts`), so search is fully on-device.
- `list` deliberately omits `embedding` (large); `embedModel` stays so the
  client can run the ensure-index pass.

## Privacy

Inference is **100% on-device**: pixels, DOM text, and metadata used by these
features never leave the browser. The only network traffic is the lazy model
weight download from the Hugging Face CDN. URL captures still go through the
self-hosted capture-service action as before; this layer never sees them.

## Fallback matrix

| Feature | Model backend | Rule fallback |
|---|---|---|
| search | MiniLM-L6-v2 (q8) | `ruleEmbed` — deterministic n-gram hashing, 384-dim |
| pii | distilbert-NER | `rulePiiScan` — regex + Luhn + digit-count guards |
| ocr | tesseract.js | `str` strategy falls back to tesseract when MGP-STR can't load; `indic` strategy uses tesseract.js with Indic traineddata; DOM text extraction is the scriptable-page alternative |
| alttext | distilvit | `heuristicAltText` — hints → OCR first line → title |
| steps | Qwen2.5-0.5B (q2_k, wllama) | `ruleStepGuide` — deterministic numbered template |
| explain | Qwen2.5-0.5B (q2_k, wllama, capability-gated) | `ruleExplainError` — instant error catalogue |
| vision | Qwen2-VL-2B (IQ2_M + mmproj, wllama, gated) | `ruleVisualFeedback` — structural review (dimensions, tiles, redactions) |

## Testing

`bun run scripts/nlp-smoke.ts` — 97 cases over PII scan, embeddings
(determinism/dimension/normalization/similarity), NER aggregation + merge,
OCR offsets, step guides, alt text, the registry, the error catalogue (every
engine code), mistake checks, device-capability tiers, vision feedback, and
capture-replay recipe/script generation. Model-backed paths are browser-only
and verified structurally (types + fallback wiring).

## Extending

1. Add a `ModelSpec` to `registry.ts` (note params, size, runtime).
2. Add the contract type to `types.ts`.
3. Add the rule fallback to `rule.ts` (pure, smoke-tested).
4. Wire the model path + fallback in `service.ts`.
5. Add smoke cases to `scripts/nlp-smoke.ts`.

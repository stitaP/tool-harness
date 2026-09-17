/**
 * Pure rule-based NLP backends.
 *
 * Every on-device feature has a rule fallback so the app works with **zero
 * model downloads and zero API keys**. These functions are pure and
 * smoke-testable in Node — the model-backed paths in `service.ts` only add
 * precision on top of these contracts.
 */
import {
  NLP_EMBED_DIMENSIONS,
  SensitiveKind,
  SensitiveMatch,
  StepGuide,
  AltTextSuggestion,
  OcrBlock,
  ErrorContext,
  ErrorExplanation,
  MistakeIssue,
  MistakeReview,
  VisionFeedback,
} from "./types";

/* ------------------------------------------------------------------ */
/* Sensitive-data scanning (regex fallback)                            */
/* ------------------------------------------------------------------ */

export const SENSITIVE_LABELS: Record<SensitiveKind, string> = {
  "api-key": "API key",
  token: "Token",
  password: "Password",
  session: "Session",
  "private-key": "Private key",
  email: "Email",
  phone: "Phone",
  "credit-card": "Credit card",
  ssn: "SSN",
  person: "Person name",
};

interface Pattern {
  kind: SensitiveKind;
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  { kind: "api-key", re: /(?:api[_-]?key|apikey|access[_-]?key|secret[_-]?key)\s*[=:]\s*["']?[\w-]{8,}/i },
  { kind: "token", re: /\b(?:bearer\s+)?eyJ[\w-]*\.[\w-]*\.[\w-]+\b/i }, // JWT
  { kind: "token", re: /(?:token|auth[_-]?token)\s*[=:]\s*["']?[\w-]{8,}/i },
  { kind: "password", re: /(?:password|passwd|pwd)\s*[=:]\s*["']?[^\s"']+/i },
  { kind: "session", re: /(?:session[_-]?id|sso|signature)\s*[=:]\s*["']?[\w-]{8,}/i },
  { kind: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----|\.pem\b/i },
  { kind: "email", re: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/i },
  { kind: "phone", re: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { kind: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { kind: "credit-card", re: /\b\d{13,19}\b/ },
];

/** Luhn checksum — filters digit runs that can't be card numbers. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function contextAround(input: string, index: number, radius = 42): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(input.length, index + radius);
  return input.slice(start, end).replace(/\s+/g, " ").trim();
}

/** Scan text for credential / PII patterns (deterministic, no model). */
export function rulePiiScan(input: string): SensitiveMatch[] {
  const out: SensitiveMatch[] = [];
  const seen = new Set<string>();
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const key = `${p.kind}:${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Credit cards must pass the Luhn check; phone runs must look like a
      // real number (10–12 digits — rejects timestamps and bare SSNs).
      if (p.kind === "credit-card" && !luhnValid(m[0].replace(/\D/g, ""))) continue;
      if (p.kind === "phone") {
        const digits = m[0].replace(/\D/g, "");
        if (digits.length < 10 || digits.length > 12) continue;
      }
      out.push({
        id: `${p.kind}-${out.length}`,
        kind: p.kind,
        label: SENSITIVE_LABELS[p.kind],
        hint: contextAround(input, start),
        start,
        end,
        source: "regex",
      });
      // avoid re-scanning the same span for other patterns
      re.lastIndex = end;
    }
  }
  return out.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

/* ------------------------------------------------------------------ */
/* NER → SensitiveMatch aggregation (model output post-processing)     */
/* ------------------------------------------------------------------ */

/** Shape of a token-classification result with `aggregation_strategy: "simple"`. */
export interface NerEntity {
  entity_group?: string; // "PER" | "LOC" | "ORG" | "MISC" (simple strategy)
  entity?: string; // "B-PER" style (no aggregation)
  score: number;
  word: string;
  start?: number;
  end?: number;
}

const NER_KIND: Record<string, SensitiveKind> = { PER: "person" };

/** Map NER entities to our sensitive kinds (person only — LOC/ORG are not sensitive). */
export function nerToSensitive(entities: NerEntity[]): SensitiveMatch[] {
  const out: SensitiveMatch[] = [];
  for (const e of entities) {
    const group = (e.entity_group ?? e.entity ?? "").replace(/^[BI]-/, "");
    const kind = NER_KIND[group];
    if (!kind) continue;
    const text = e.word.replace(/##/g, "").trim();
    if (!text || text.length < 2) continue;
    out.push({
      id: `ner-${out.length}`,
      kind,
      label: SENSITIVE_LABELS[kind],
      hint: text.slice(0, 82),
      start: e.start,
      end: e.end,
      source: "ner",
    });
  }
  return out;
}

/** Merge rule + NER findings, dropping NER duplicates of identical spans. */
export function mergeSensitive(rule: SensitiveMatch[], ner: SensitiveMatch[]): SensitiveMatch[] {
  const bySpan = new Set(rule.filter((m) => m.start !== undefined).map((m) => `${m.start}-${m.end}`));
  const merged = [
    ...rule,
    ...ner.filter((m) => m.start === undefined || !bySpan.has(`${m.start}-${m.end}`)),
  ];
  return merged.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

/* ------------------------------------------------------------------ */
/* Embeddings (rule fallback — deterministic n-gram feature hashing)   */
/* ------------------------------------------------------------------ */

/**
 * Deterministic 384-dim bag-of-n-grams embedding with L2 normalization.
 * Same input → same vector (across runs and machines); overlapping vocabulary
 * → similar vectors. Matches the MiniLM output dimension so a capture indexed
 * with either embedder can be searched by the same one.
 */
export function ruleEmbed(text: string): number[] {
  const dim = NLP_EMBED_DIMENSIONS;
  const vec = new Array<number>(dim).fill(0);
  const tokens: string[] = [];
  const words = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  for (const w of words) {
    tokens.push(w);
    if (w.length > 3) tokens.push(w.slice(0, 4));
    for (let i = 0; i + 2 < w.length + 1 && i < 4; i++) tokens.push(w.slice(i, i + 3));
  }
  for (const t of tokens) {
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    const idx = (h >>> 0) % dim;
    vec[idx] += (h >>> 7) & 1 ? 1 : -1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) vec[i] /= norm;
  return vec;
}

export function ruleEmbedTexts(texts: string[]): number[][] {
  return texts.map(ruleEmbed);
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/* ------------------------------------------------------------------ */
/* Step guides (template fallback)                                     */
/* ------------------------------------------------------------------ */

export interface StepInput {
  number: number;
  text?: string;
}

/** Deterministic step guide from numbered steps (no model). */
export function ruleStepGuide(title: string, steps: StepInput[]): StepGuide {
  return {
    title: title.trim() || "Capture steps",
    steps: steps
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((s, i) => ({
        number: i + 1,
        text: (s.text ?? "").trim() || `Step ${s.number}`,
      })),
    source: "template",
  };
}

export function stepGuideMarkdown(guide: StepGuide): string {
  return [`# ${guide.title}`, "", ...guide.steps.map((s) => `${s.number}. ${s.text}`)].join("\n");
}

/* ------------------------------------------------------------------ */
/* Alt text (heuristic fallback)                                       */
/* ------------------------------------------------------------------ */

export function heuristicAltText(opts: {
  title?: string;
  ocrText?: string;
  hints?: string[];
}): AltTextSuggestion {
  const hint = (opts.hints ?? []).map((h) => h.trim()).find(Boolean);
  const firstLine = (opts.ocrText ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 8);
  const text =
    (hint ? hint.slice(0, 160) : "") ||
    (firstLine ? firstLine.slice(0, 160) : "") ||
    (opts.title ?? "").trim().slice(0, 160) ||
    "A captured screen";
  return {
    text,
    confidence: hint ? 0.9 : firstLine ? 0.6 : 0.4,
    source: "heuristic",
  };
}

/* ------------------------------------------------------------------ */
/* OCR post-processing (pure)                                          */
/* ------------------------------------------------------------------ */

/** Offset OCR blocks by a tile origin, then drop empties/low-confidence. */
export function offsetOcrBlocks(
  blocks: OcrBlock[],
  dx: number,
  dy: number,
  minConfidence = 0.4,
): OcrBlock[] {
  return blocks
    .filter((b) => b.text.trim().length > 0 && b.confidence >= minConfidence)
    .map((b) => ({
      ...b,
      text: b.text.trim(),
      bounds: b.bounds
        ? { x: b.bounds.x + dx, y: b.bounds.y + dy, width: b.bounds.width, height: b.bounds.height }
        : null,
    }));
}

/** Merge OCR blocks from multiple tiles (already offset) into one list. */
export function mergeOcrBlocks(lists: OcrBlock[][]): OcrBlock[] {
  return lists.flat().sort((a, b) => {
    const ay = a.bounds?.y ?? 0;
    const by = b.bounds?.y ?? 0;
    return ay - by || (a.bounds?.x ?? 0) - (b.bounds?.x ?? 0);
  });
}

/** Flatten OCR blocks into plain text (lines). */
export function ocrBlocksToText(blocks: OcrBlock[]): string {
  return blocks.map((b) => b.text).join("\n");
}

/* ------------------------------------------------------------------ */
/* Error explanation (instant offline catalogue)                       */
/* ------------------------------------------------------------------ */

interface RuleEntry {
  code: string;
  summary: string;
  cause: string;
  steps: string[];
  tip?: string;
}

/**
 * Catalogue of every error code the capture engine can emit, with clear,
 * actionable explanations. This is the *instant* path — zero download, zero
 * latency, works on a 15-year-old laptop with no network. The on-device
 * model only deepens free-form answers for unknown codes.
 */
export const EXPLAIN_CATALOGUE: RuleEntry[] = [
  {
    code: "missing-service",
    summary: "URL capture needs the self-hosted capture service, which isn't configured.",
    cause: "Remote page captures are rendered by the capture-service container (the from-scratch Rust engine in `engines/` — our own HTTP/WebSocket/CDP client driving Chromium, no Playwright). Its URL was not found in the environment.",
    steps: [
      "Open the project's Keys / API keys tab.",
      "Start the service: docker compose up --build capture-service (or deploy it — see the /api page).",
      "Paste CAPTURE_SERVICE_URL (and CAPTURE_SERVICE_API_KEY from the service's CAPTURE_API_KEYS) into the Keys tab.",
      "Retry the capture — no app restart is needed.",
    ],
    tip: "Demo captures (the in-app page) don't need this service — only remote URLs do.",
  },
  {
    code: "url-blocked",
    summary: "The URL was blocked by the security policy.",
    cause: "stitaP blocks unsafe destinations before opening them — private/local networks, metadata endpoints, and non-http(s) schemes are rejected to prevent SSRF and data exfiltration.",
    steps: [
      "Check the URL uses http:// or https:// (not file:, data:, or javascript:).",
      "Confirm the hostname is a public domain — loopback, 192.168.x, 10.x, and cloud metadata hosts are blocked.",
      "Remove any credentials embedded in the URL (user:pass@host).",
      "Retry with the corrected URL.",
    ],
    tip: "Redirects are re-validated too — a public URL that redirects to an internal host is still blocked.",
  },
  {
    code: "network",
    summary: "The capture service call failed.",
    cause: "The render request could not be completed — this usually means the remote service was unreachable or returned an error.",
    steps: [
      "Check your internet connection.",
      "Confirm the URL is publicly reachable from your network.",
      "Retry the capture — transient service errors clear quickly.",
      "If it persists, verify CAPTURE_SERVICE_URL is reachable and CAPTURE_SERVICE_API_KEY matches the service's CAPTURE_API_KEYS.",
    ],
  },
  {
    code: "unauthorized",
    summary: "You must be signed in to capture.",
    cause: "The capture service requires an authenticated session, and no valid session was found.",
    steps: ["Sign in to the app.", "Retry the capture."],
  },
  {
    code: "no-selector",
    summary: "Element capture needs a CSS selector.",
    cause: "You picked the Element mode but didn't provide a selector, so there's nothing to locate.",
    steps: [
      "Open the capture panel and switch to Element mode.",
      "Enter a CSS selector, e.g. section#pricing or table.",
      "Retry.",
    ],
    tip: "Or switch to Viewport / Full page / Region if you don't need a specific element.",
  },
  {
    code: "element-not-found",
    summary: "No element matches that selector.",
    cause: "The CSS selector didn't match anything in the page's current DOM.",
    steps: [
      "Inspect the page (DevTools → Elements) and copy an exact selector.",
      "Make sure the element exists before capture — some content loads lazily.",
      "Try a broader selector, e.g. section instead of #pricing-table.",
      "Retry with the corrected selector.",
    ],
  },
  {
    code: "element-hidden",
    summary: "The element exists but isn't visible.",
    cause: "The matched element has zero size or is hidden (display:none / collapsed), so it can't be captured.",
    steps: [
      "Scroll the element into view before capturing.",
      "Expand collapsed sections (accordions, tabs) first.",
      "If the element is only visible on hover, keep the pointer over it.",
      "Or switch to Region mode and draw the area manually.",
    ],
  },
  {
    code: "bad-region",
    summary: "Region capture needs x, y, width and height.",
    cause: "You picked Region mode but the rectangle was missing or invalid.",
    steps: [
      "Open the capture panel and switch to Region mode.",
      "Enter X, Y, Width and Height (CSS pixels).",
      "Retry.",
    ],
  },
  {
    code: "too-tall",
    summary: "The capture region is taller than the raster limit.",
    cause: "In-browser rasterization caps the rendered height; the requested region exceeded it.",
    steps: [
      "Use a smaller region or a lower device-scale factor.",
      "Capture the page in Full page mode instead — it tiles automatically.",
      "Or capture in Viewport mode and stitch manually.",
    ],
  },
  {
    code: "raster",
    summary: "Raster capture of the page failed.",
    cause: "The page couldn't be rendered into a bitmap — often a layout, canvas, or memory issue in the preview.",
    steps: [
      "Retry once — transient layout states usually clear.",
      "Switch to Viewport mode if a full-page render failed.",
      "Hide heavy elements (embeds, canvases) if it keeps failing.",
    ],
  },
  {
    code: "cancelled",
    summary: "The capture was cancelled.",
    cause: "The job was stopped before it completed — by you, or by the tab losing focus.",
    steps: [
      "Start a new capture and let it run to completion.",
      "If it keeps cancelling by itself, check the job timeout and your device sleep settings.",
    ],
  },
  {
    code: "timed-out",
    summary: "The page never became stable enough to capture.",
    cause: "The readiness wait exceeded its timeout — the page kept shifting layout or never finished loading.",
    steps: [
      "Retry — the page may be faster the second time.",
      "Use the selector readiness strategy if the app renders a known stable marker.",
      "Capture in Viewport mode if only the top of the page matters.",
    ],
  },
  {
    code: "blocked-by-policy",
    summary: "The capture was blocked by policy.",
    cause: "An organizational or app policy rejected this capture before it started.",
    steps: ["Review the policy message shown with this error.", "Choose an allowed source or mode."],
  },
  {
    code: "unknown",
    summary: "Something unexpected went wrong.",
    cause: "The capture engine hit an error that doesn't map to a known failure mode.",
    steps: [
      "Retry the capture once.",
      "Note the exact error message.",
      "Try a simpler mode (Viewport) to isolate the problem.",
    ],
    tip: "If it repeats, share the job id and error message with the maintainers.",
  },
];

/** Look up a known error code; falls back to the generic entry. */
export function ruleExplainError(ctx: ErrorContext): ErrorExplanation {
  const entry =
    EXPLAIN_CATALOGUE.find((e) => e.code === (ctx.code ?? "")) ??
    EXPLAIN_CATALOGUE.find((e) => e.code === (ctx.phase ?? "")) ??
    EXPLAIN_CATALOGUE[EXPLAIN_CATALOGUE.length - 1];
  return {
    code: entry.code === "unknown" ? ctx.code : entry.code,
    summary: entry.summary,
    cause: ctx.message ? `${entry.cause} Message: ${ctx.message}` : entry.cause,
    steps: entry.steps.slice(),
    tip: entry.tip,
    engine: "rule",
  };
}

/* ------------------------------------------------------------------ */
/* Small-mistake review (pure checks)                                  */
/* ------------------------------------------------------------------ */

const COMMON_TYPOS: Record<string, string> = {
  teh: "the",
  recieve: "receive",
  seperate: "separate",
  occured: "occurred",
  definately: "definitely",
  becuase: "because",
  adress: "address",
  calender: "calendar",
  untill: "until",
  wierd: "weird",
};

/**
 * Deterministic review of generated text for small mistakes: duplicates,
 * empty items, numbering gaps, over-long lines, common typos, markdown
 * pitfalls. No model, no download — instant on any machine.
 */
export function ruleReviewMistakes(text: string): MistakeIssue[] {
  const issues: MistakeIssue[] = [];
  const lines = text.split("\n");

  const add = (issue: MistakeIssue) => {
    if (!issues.some((i) => i.message === issue.message && i.line === issue.line)) {
      issues.push(issue);
    }
  };

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trimEnd();
    if (!line.trim()) return;

    // trailing whitespace
    if (raw !== line) {
      add({
        severity: "info",
        kind: "markdown",
        message: "Line has trailing whitespace.",
        fix: "Remove the spaces at the end of the line.",
        line: lineNo,
      });
    }

    // over-long lines (readability)
    if (line.length > 140) {
      add({
        severity: "warning",
        kind: "length",
        message: `Line is ${line.length} characters — long for documentation.`,
        fix: "Split it into shorter sentences.",
        line: lineNo,
      });
    }

    // common typos (word-boundary aware)
    const words = line.toLowerCase().split(/[^a-z']+/);
    for (const w of words) {
      const fix = COMMON_TYPOS[w];
      if (fix) {
        add({
          severity: "error",
          kind: "typo",
          message: `Possible typo: “${w}”.`,
          fix: `Use “${fix}” instead.`,
          line: lineNo,
        });
      }
    }

    // markdown: numbered list must use sequential numbers
    const num = /^(\d+)[.)]/.exec(line);
    if (num && i > 0 && /^\d+[.)]/.test(lines[i - 1])) {
      const prev = Number(/^(\d+)[.)]/.exec(lines[i - 1])?.[1]);
      if (prev !== undefined && Number(num[1]) !== prev + 1) {
        add({
          severity: "warning",
          kind: "numbering",
          message: `Step numbers jump from ${prev} to ${num[1]}.`,
          fix: "Renumber the list sequentially.",
          line: lineNo,
        });
      }
    }

    // markdown: heading levels shouldn't skip
    const heading = /^(#{1,6}) /.exec(line);
    if (heading && i > 0) {
      const prevHeading = /^(#{1,6}) /.exec(lines[i - 1]);
      if (prevHeading && Number(heading[1].length) > Number(prevHeading[1].length) + 1) {
        add({
          severity: "info",
          kind: "markdown",
          message: `Heading skips a level (h${prevHeading[1].length} → h${heading[1].length}).`,
          fix: "Use h" + (Number(prevHeading[1].length) + 1) + " instead.",
          line: lineNo,
        });
      }
    }
  });

  // duplicates (consecutive identical content, ignoring step numbers)
  const stripStep = (s: string) => s.trim().replace(/^\d+[.)]\s*/, "");
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1].trim();
    const b = lines[i].trim();
    if (a && b && !a.startsWith("#") && stripStep(a) === stripStep(b)) {
      add({
        severity: "warning",
        kind: "duplicate",
        message: `Duplicate step: “${stripStep(a).slice(0, 60)}”.`,
        fix: "Remove one of the repeated steps.",
        line: i + 1,
      });
    }
  }

  // empty numbered items
  lines.forEach((raw, i) => {
    if (/^\d+[.)]\s*$/.test(raw.trim())) {
      add({
        severity: "error",
        kind: "empty",
        message: "Numbered step has no text.",
        fix: "Add a description to the step.",
        line: i + 1,
      });
    }
  });

  return issues;
}

/** Run the rule review; model polish (when available) wraps this in service.ts. */
export function ruleReview(text: string): MistakeReview {
  return { issues: ruleReviewMistakes(text), engine: "rule" };
}

/* ------------------------------------------------------------------ */
/* Vision feedback (deterministic structural review)                   */
/* ------------------------------------------------------------------ */

/**
 * Deterministic "visual" feedback from capture metadata — no model needed.
 * Checks the things a VLM would flag from pure structure: empty captures,
 * missing source, redactions, tile count, extreme aspect ratios. This is the
 * fallback for legacy devices and the sanity baseline everywhere.
 */
export function ruleVisualFeedback(input: {
  width?: number;
  height?: number;
  tileCount?: number;
  redacted?: boolean;
  url?: string;
  warnings?: string[];
}): VisionFeedback {
  const issues: string[] = [];
  const strengths: string[] = [];
  const w = input.width ?? 0;
  const h = input.height ?? 0;
  const tiles = input.tileCount ?? 0;

  if (w <= 0 || h <= 0) {
    issues.push("The capture has no measurable dimensions — it may be blank.");
  } else if (w > 0 && h / w > 12) {
    issues.push(`Aspect ratio is extreme (${Math.round(h / w)}:1) — verify the page didn't scroll infinitely.`);
  } else if (w > 0 && h > 0) {
    strengths.push(`Canvas is ${w}×${h}px with ${tiles || 1} tile${tiles === 1 ? "" : "s"}.`);
  }

  if (tiles === 0) {
    issues.push("No raster tiles are present — the base layer may be missing.");
  } else if (tiles > 1) {
    strengths.push(`${tiles} tiles stitched — check the seams between tiles.`);
  }

  if (input.redacted) {
    strengths.push("Secure redaction has been applied to sensitive regions.");
  }

  if (!input.url) {
    issues.push("No source URL recorded — provenance metadata is missing.");
  } else {
    strengths.push("Source URL recorded for replay and provenance.");
  }

  for (const wmsg of input.warnings ?? []) {
    issues.push(wmsg);
  }

  return {
    summary:
      issues.length === 0
        ? "The capture looks structurally sound."
        : `${issues.length} potential issue${issues.length === 1 ? "" : "s"} detected.`,
    issues: issues.slice(0, 6),
    strengths: strengths.slice(0, 4),
    suggestion:
      issues.length === 0
        ? "Open the image in the editor to add annotations."
        : "Review the issues listed above; re-capture if the base layer is affected.",
    source: "rule",
  };
}

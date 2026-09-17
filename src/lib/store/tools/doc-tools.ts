/**
 * Document Parser Tools — Extract steps, detect tutorials, parse FAQs, generate scripts
 *
 * These tools help LLMs and SLMs parse documentation into structured
 * tutorial data for video generation.
 */

import type { ToolManifest, ToolInput, ToolOutput } from "../tool-types";

// ─── Tool Manifests ───────────────────────────────────────────────────────────

export const EXTRACT_STEPS_MANIFEST: ToolManifest = {
  id: "doc.extractSteps",
  name: "Extract Steps",
  description: "Extract step-by-step instructions from documentation",
  longDescription:
    "Analyzes HTML documentation and extracts ordered step-by-step instructions. Detects numbered lists, heading hierarchies, code blocks, and procedural language patterns.",
  category: "document",
  subcategory: "extraction",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["extract", "steps", "instructions", "tutorial", "parse"],
  icon: "ListOrdered",
  color: "#3b82f6",
  parameters: [
    {
      name: "html",
      type: "string",
      description: "HTML content to parse",
      required: true,
    },
    {
      name: "maxSteps",
      type: "number",
      description: "Maximum number of steps to extract",
      required: false,
      default: 50,
    },
    {
      name: "includeCodeBlocks",
      type: "boolean",
      description: "Include code blocks as part of steps",
      required: false,
      default: true,
    },
    {
      name: "includeImages",
      type: "boolean",
      description: "Include image references in steps",
      required: false,
      default: true,
    },
  ],
  capabilities: [
    {
      name: "extractSteps",
      description: "Parse HTML into structured steps",
      requiresBrowser: false,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 4500,
  rating: 4.5,
  ratingCount: 98,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const DETECT_TUTORIAL_MANIFEST: ToolManifest = {
  id: "doc.detectTutorial",
  name: "Detect Tutorial",
  description: "Detect if a page is a tutorial and extract its structure",
  longDescription:
    "Analyzes page content to determine if it's a tutorial, reference, FAQ, or guide. Extracts the document structure including sections, steps, prerequisites, and estimated completion time.",
  category: "document",
  subcategory: "analysis",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["detect", "tutorial", "classify", "analyze", "structure"],
  icon: "Scan",
  color: "#8b5cf6",
  parameters: [
    {
      name: "html",
      type: "string",
      description: "HTML content to analyze",
      required: true,
    },
    {
      name: "url",
      type: "string",
      description: "Page URL for context",
      required: false,
    },
    {
      name: "title",
      type: "string",
      description: "Page title for context",
      required: false,
    },
  ],
  capabilities: [
    {
      name: "detectTutorial",
      description: "Classify document type and extract structure",
      requiresBrowser: false,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 3800,
  rating: 4.4,
  ratingCount: 76,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const PARSE_FAQ_MANIFEST: ToolManifest = {
  id: "doc.parseFAQ",
  name: "Parse FAQ",
  description: "Extract question-answer pairs from FAQ pages",
  longDescription:
    "Parses FAQ-style documentation and extracts question-answer pairs. Detects common FAQ patterns like accordion elements, heading+paragraph pairs, and definition lists.",
  category: "document",
  subcategory: "extraction",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["faq", "questions", "answers", "parse", "extract"],
  icon: "HelpCircle",
  color: "#06b6d4",
  parameters: [
    {
      name: "html",
      type: "string",
      description: "HTML content to parse",
      required: true,
    },
    {
      name: "maxPairs",
      type: "number",
      description: "Maximum Q&A pairs to extract",
      required: false,
      default: 100,
    },
    {
      name: "includeMetadata",
      type: "boolean",
      description: "Include category tags and difficulty level",
      required: false,
      default: true,
    },
  ],
  capabilities: [
    {
      name: "parseFAQ",
      description: "Extract Q&A pairs from FAQ pages",
      requiresBrowser: false,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 2900,
  rating: 4.3,
  ratingCount: 54,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const GENERATE_SCRIPT_MANIFEST: ToolManifest = {
  id: "doc.generateScript",
  name: "Generate Tutorial Script",
  description: "Generate a video tutorial script from parsed documentation",
  longDescription:
    "Takes parsed documentation (steps, FAQ, or tutorial structure) and generates a complete video tutorial script with scenes, narration text, visual cues, and timing. Uses rule-based generation that works without any LLM API.",
  category: "document",
  subcategory: "generation",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["script", "generate", "tutorial", "narration", "scenes"],
  icon: "FileCode",
  color: "#f59e0b",
  parameters: [
    {
      name: "steps",
      type: "array",
      description: "Parsed steps from extractSteps",
      required: true,
    },
    {
      name: "title",
      type: "string",
      description: "Tutorial title",
      required: false,
      default: "Tutorial",
    },
    {
      name: "audienceLevel",
      type: "enum",
      description: "Target audience level",
      required: false,
      default: "beginner",
      enum: ["beginner", "intermediate", "advanced"],
    },
    {
      name: "narrationStyle",
      type: "enum",
      description: "Narration voice style",
      required: false,
      default: "concise",
      enum: ["concise", "detailed", "casual", "formal"],
    },
    {
      name: "includeIntros",
      type: "boolean",
      description: "Include intro and outro scenes",
      required: false,
      default: true,
    },
    {
      name: "estimatedDuration",
      type: "number",
      description: "Target duration in seconds (0 = auto)",
      required: false,
      default: 0,
    },
  ],
  capabilities: [
    {
      name: "generateScript",
      description: "Generate video scripts from documentation",
      requiresBrowser: false,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 5200,
  rating: 4.6,
  ratingCount: 112,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const EXTRACT_API_MANIFEST: ToolManifest = {
  id: "doc.extractAPI",
  name: "Extract API Reference",
  description: "Extract API documentation into structured schemas",
  longDescription:
    "Parses API reference documentation and extracts endpoint definitions, parameters, response schemas, and code examples. Works with OpenAPI-style, Markdown-based, and custom API docs.",
  category: "document",
  subcategory: "extraction",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["api", "reference", "extract", "schema", "endpoints"],
  icon: "Code2",
  color: "#10b981",
  parameters: [
    {
      name: "html",
      type: "string",
      description: "API documentation HTML content",
      required: true,
    },
    {
      name: "format",
      type: "enum",
      description: "Documentation format",
      required: false,
      default: "auto",
      enum: ["auto", "openapi", "markdown", "custom"],
    },
    {
      name: "includeExamples",
      type: "boolean",
      description: "Include code examples in output",
      required: false,
      default: true,
    },
  ],
  capabilities: [
    {
      name: "extractAPI",
      description: "Parse API documentation into schemas",
      requiresBrowser: false,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 3200,
  rating: 4.4,
  ratingCount: 67,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const GENERATE_NARRATION_MANIFEST: ToolManifest = {
  id: "doc.generateNarration",
  name: "Generate Narration",
  description: "Generate natural narration text for tutorial steps",
  longDescription:
    "Takes step descriptions and generates fluent narration text suitable for TTS. Adds transitions, context, and explanations based on the audience level and narration style.",
  category: "document",
  subcategory: "generation",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["narration", "generate", "tts", "voice", "text"],
  icon: "Mic",
  color: "#ec4899",
  parameters: [
    {
      name: "step",
      type: "string",
      description: "Step description text",
      required: true,
    },
    {
      name: "context",
      type: "string",
      description: "Previous step context",
      required: false,
    },
    {
      name: "style",
      type: "enum",
      description: "Narration style",
      required: false,
      default: "concise",
      enum: ["concise", "detailed", "casual", "formal"],
    },
    {
      name: "audienceLevel",
      type: "enum",
      description: "Target audience",
      required: false,
      default: "beginner",
      enum: ["beginner", "intermediate", "advanced"],
    },
  ],
  capabilities: [
    {
      name: "generateNarration",
      description: "Generate narration text for TTS",
      requiresBrowser: false,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 4100,
  rating: 4.5,
  ratingCount: 89,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

// ─── All Doc Tool Manifests ───────────────────────────────────────────────────

export const DOC_TOOLS: ToolManifest[] = [
  EXTRACT_STEPS_MANIFEST,
  DETECT_TUTORIAL_MANIFEST,
  PARSE_FAQ_MANIFEST,
  GENERATE_SCRIPT_MANIFEST,
  EXTRACT_API_MANIFEST,
  GENERATE_NARRATION_MANIFEST,
];

// ─── Extraction Functions ─────────────────────────────────────────────────────

/** Simple HTML tag stripper */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Extract numbered or bulleted steps from HTML */
export function extractStepsFromHTML(
  html: string,
  maxSteps: number = 50,
): Array<{
  number: number;
  title: string;
  content: string;
  codeBlocks: string[];
  images: string[];
}> {
  const steps: Array<{
    number: number;
    title: string;
    content: string;
    codeBlocks: string[];
    images: string[];
  }> = [];

  // Match <li> elements with step-like content
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  let stepNum = 0;

  while ((match = liRegex.exec(html)) !== null && stepNum < maxSteps) {
    const inner = match[1];
    const text = stripTags(inner).trim();

    // Skip very short items (likely not steps)
    if (text.length < 10) continue;

    stepNum++;

    // Extract code blocks within this step
    const codeBlocks: string[] = [];
    const codeRegex = /<code[^>]*>([\s\S]*?)<\/code>/gi;
    let codeMatch: RegExpExecArray | null;
    while ((codeMatch = codeRegex.exec(inner)) !== null) {
      codeBlocks.push(stripTags(codeMatch[1]).trim());
    }

    // Extract images
    const images: string[] = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imgRegex.exec(inner)) !== null) {
      images.push(imgMatch[1]);
    }

    steps.push({
      number: stepNum,
      title: text.slice(0, 100),
      content: text,
      codeBlocks,
      images,
    });
  }

  // Also check <h3> + <p> patterns for tutorial-style docs
  if (steps.length === 0) {
    const h3Regex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
    while ((match = h3Regex.exec(html)) !== null && stepNum < maxSteps) {
      const title = stripTags(match[1]).trim();
      if (!title || title.length < 5) continue;

      stepNum++;
      steps.push({
        number: stepNum,
        title,
        content: title,
        codeBlocks: [],
        images: [],
      });
    }
  }

  return steps;
}

/** Detect document type from HTML content */
export function detectDocumentType(
  html: string,
  url?: string,
  title?: string,
): {
  type: "tutorial" | "reference" | "faq" | "guide" | "api" | "unknown";
  confidence: number;
  sections: string[];
  estimatedTime: number;
  difficulty: "beginner" | "intermediate" | "advanced";
} {
  const text = stripTags(html).toLowerCase();
  const titleText = (title || "").toLowerCase();
  const urlText = (url || "").toLowerCase();

  // Score each type
  const scores = {
    tutorial: 0,
    reference: 0,
    faq: 0,
    guide: 0,
    api: 0,
  };

  // Tutorial indicators
  if (/\b(step|step-by-step|tutorial|how to|getting started|walkthrough)\b/.test(text)) scores.tutorial += 3;
  if (/\b(step \d|step\s*[:.]|1\.\s|first|then|next|finally|after)\b/.test(text)) scores.tutorial += 2;
  if (/\b(prerequisites?|before you begin|you'll need)\b/.test(text)) scores.tutorial += 1;
  if (/tutorial|step|howto|guide|walkthrough/.test(urlText)) scores.tutorial += 2;

  // FAQ indicators
  if (/\b(faq|frequently asked|common questions)\b/.test(text)) scores.faq += 3;
  if (/\b(how do i|what is|can i|does it|why does)\b/.test(text)) scores.faq += 2;
  if (/\?$/.test(text)) scores.faq += 1;

  // Reference indicators
  if (/\b(reference|api reference|documentation|parameters?|returns?|type)\b/.test(text)) scores.reference += 3;
  if (/\b(string|number|boolean|interface|class)\b/.test(text)) scores.reference += 1;

  // Guide indicators
  if (/\b(best practices?|recommendations?|tips?|guidelines?|overview)\b/.test(text)) scores.guide += 2;

  // API indicators
  if (/\b(endpoint|request|response|method|GET|POST|PUT|DELETE)\b/.test(text)) scores.api += 3;
  if (/<(get|post|put|delete)>|\/api\//.test(text)) scores.api += 2;

  // Determine winner
  let bestType: keyof typeof scores = "tutorial";
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type as keyof typeof scores;
    }
  }

  const maxPossible = 6;
  const confidence = Math.min(1, bestScore / maxPossible);

  // Extract sections
  const sections: string[] = [];
  const sectionRegex = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi;
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(html)) !== null) {
    const section = stripTags(match[1]).trim();
    if (section) sections.push(section);
  }

  // Estimate time based on content length
  const wordCount = text.split(/\s+/).length;
  const estimatedTime = Math.ceil((wordCount / 150) * 60); // 150 wpm reading speed

  // Determine difficulty
  let difficulty: "beginner" | "intermediate" | "advanced" = "beginner";
  if (/\b(advanced|complex|architecture|performance|optimization)\b/.test(text)) {
    difficulty = "advanced";
  } else if (/\b(intermediate|configuration|setup|integration)\b/.test(text)) {
    difficulty = "intermediate";
  }

  return {
    type: bestType,
    confidence,
    sections,
    estimatedTime,
    difficulty,
  };
}

/** Parse FAQ HTML into Q&A pairs */
export function parseFAQFromHTML(
  html: string,
  maxPairs: number = 100,
): Array<{
  question: string;
  answer: string;
  category?: string;
}> {
  const pairs: Array<{ question: string; answer: string; category?: string }> = [];

  // Pattern 1: <details>/<summary> (common FAQ pattern)
  const detailsRegex = /<details[^>]*>[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  let match: RegExpExecArray | null;
  while ((match = detailsRegex.exec(html)) !== null && pairs.length < maxPairs) {
    const question = stripTags(match[1]).trim();
    const answer = stripTags(match[2]).trim();
    if (question && answer) {
      pairs.push({ question, answer });
    }
  }

  // Pattern 2: h3/h4 followed by p (if no details found)
  if (pairs.length === 0) {
    const hRegex = /<h[34][^>]*>([\s\S]*?)<\/h[34]>/gi;
    while ((match = hRegex.exec(html)) !== null && pairs.length < maxPairs) {
      const question = stripTags(match[1]).trim();
      if (!question || question.length < 5) continue;

      // Look for next <p> as answer
      const afterH = html.slice(match.index + match[0].length);
      const pMatch = /^[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(afterH);
      if (pMatch) {
        const answer = stripTags(pMatch[1]).trim();
        if (answer) {
          pairs.push({ question, answer });
        }
      }
    }
  }

  return pairs;
}

/** Generate narration text for a step */
export function generateNarration(
  step: string,
  context?: string,
  style: string = "concise",
  audienceLevel: string = "beginner",
): string {
  const transitions = [
    "Next, ",
    "Then, ",
    "Now, ",
    "After that, ",
    "Moving on, ",
    "Finally, ",
    "Also, ",
    "Additionally, ",
  ];

  const introPhrases: Record<string, string[]> = {
    beginner: [
      "Let's start by ",
      "First, let's ",
      "To begin, ",
    ],
    intermediate: [
      "Now we'll ",
      "The next step is to ",
    ],
    advanced: [
      "Proceed to ",
      "Next, ",
    ],
  };

  let narration = "";

  // Add transition if there's context
  if (context) {
    const transIdx = Math.abs(hashCode(step)) % transitions.length;
    narration += transitions[transIdx];
  } else {
    const phrases = introPhrases[audienceLevel] || introPhrases.beginner;
    const phraseIdx = Math.abs(hashCode(step)) % phrases.length;
    narration += phrases[phraseIdx];
  }

  // Clean up the step text
  let cleanStep = step
    .replace(/^(step\s*\d+[:.]\s*)/i, "")
    .replace(/\b(click|press|select|type|enter|navigate)\b/i, (m) => m.toLowerCase())
    .trim();

  if (style === "detailed") {
    narration += cleanStep + ". Make sure to follow each sub-step carefully.";
  } else if (style === "casual") {
    narration += cleanStep + ". Easy enough!";
  } else if (style === "formal") {
    narration += cleanStep + ". Please proceed with caution.";
  } else {
    narration += cleanStep + ".";
  }

  return narration;
}

/** Simple hash for deterministic randomness */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

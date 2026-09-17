/* ─── stitaP — LLM Pipeline for Tutorial Generation ─── */

/**
 * Provides prompt templates and processing pipeline for SLMs/LLMs
 * to generate video tutorials from parsed documentation.
 *
 * Works with any LLM (local SLM, API, or rule-based fallback).
 */

import type { ParsedTutorial, TutorialSection, TutorialStep } from "./doc-parser";
import { tutorialToText } from "./doc-parser";
import type { TutorialScript, Scene } from "./video-tutorial";
import { buildTutorialScript } from "./video-tutorial";

/* ═══════════════════════════════════════════════════════════
   SECTION 1: Prompt Templates
   ═══════════════════════════════════════════════════════════ */

export interface PromptTemplate {
  id: string;
  name: string;
  system: string;
  user: (input: string, context?: Record<string, string>) => string;
  /** Expected output format */
  outputFormat: "json" | "text" | "markdown";
  /** Max tokens (for API calls) */
  maxTokens?: number;
}

export const PROMPTS: Record<string, PromptTemplate> = {
  /** Generate a video tutorial script from documentation text */
  generateScript: {
    id: "generate-script",
    name: "Generate Tutorial Script",
    system: `You are a video tutorial script writer. Given documentation text, generate a JSON TutorialScript.

Rules:
- Each scene should be 3-8 seconds of narration
- Use clear, direct language ("Click the button" not "The user clicks")
- Start with a title scene, then step-by-step, end with summary
- Number all steps sequentially
- Include visual annotations (arrows, highlights, badges)
- Transitions: "cut" between similar steps, "fade" between sections
- Keep sentences under 20 words for TTS clarity
- Mark emphasis words with **word** for important terms

Output JSON format:
{
  "title": "...",
  "scenes": [
    {
      "type": "title|step|end",
      "narration": "...",
      "annotations": [...],
      "duration": 4,
      "transition": "fade|cut"
    }
  ]
}`,
    user: (input: string, ctx) => `Documentation:\n${input}\n\nTarget audience: ${ctx?.audience || "intermediate"}\nStyle: ${ctx?.style || "concise"}\n\nGenerate the tutorial script as JSON.`,
    outputFormat: "json",
    maxTokens: 4000,
  },

  /** Generate narration text for a visual scene */
  generateNarration: {
    id: "generate-narration",
    name: "Generate Narration",
    system: `You are a voiceover script writer for software tutorials.
Write clear, concise narration for each visual scene.
Style: speak directly to the viewer, one sentence per action.
Keep sentences under 15 words.`,
    user: (input: string) => `Scene description: ${input}\n\nWrite the narration text.`,
    outputFormat: "text",
    maxTokens: 200,
  },

  /** Generate annotations from scene description */
  generateAnnotations: {
    id: "generate-annotations",
    name: "Generate Annotations",
    system: `You are a UI annotation assistant. Given a screenshot description, output JSON annotations.

Types: arrow, rectangle, circle, text, number-badge, highlight
Each annotation needs: type, x, y (percentage 0-100 of viewport), and optional width/height.

Output a JSON array of annotations.`,
    user: (input: string, ctx) => `Scene: ${input}\nViewport: ${ctx?.width || 1920}x${ctx?.height || 1080}\n\nGenerate annotations as JSON array.`,
    outputFormat: "json",
    maxTokens: 500,
  },

  /** Improve existing tutorial script */
  improveScript: {
    id: "improve-script",
    name: "Improve Script",
    system: `You are a video tutorial editor. Review a tutorial script and improve it.
Check for:
- Clear, concise narration (no jargon)
- Proper step ordering
- Visual clarity (annotations highlight the right elements)
- Appropriate pacing (not too fast/slow)
- Engaging tone

Output the improved script as JSON.`,
    user: (input: string) => `Current script:\n${input}\n\nImprove and output the full script as JSON.`,
    outputFormat: "json",
    maxTokens: 4000,
  },

  /** Generate step-by-step capture instructions */
  generateCapturePlan: {
    id: "generate-capture-plan",
    name: "Generate Capture Plan",
    system: `You are a browser automation planner. Given a tutorial description, output a capture plan.

Each capture plan item has:
- selector: CSS selector to interact with
- action: click/type/navigate/scroll/wait
- text: input text (for type actions)
- captureSelector: CSS selector of element to screenshot
- description: what to capture

Output JSON array of capture steps.`,
    user: (input: string) => `Tutorial steps:\n${input}\n\nGenerate the capture plan as JSON.`,
    outputFormat: "json",
    maxTokens: 2000,
  },

  /** Summarize multiple documentation pages */
  summarizeDocs: {
    id: "summarize-docs",
    name: "Summarize Documentation",
    system: `You are a technical writer. Summarize multiple documentation pages into a concise tutorial outline.
Group related steps, remove redundant information, and order logically.
Output as a structured outline with sections and bullet points.`,
    user: (input: string) => `Documentation pages:\n${input}\n\nGenerate a concise tutorial outline.`,
    outputFormat: "text",
    maxTokens: 2000,
  },
};

/* ═══════════════════════════════════════════════════════════
   SECTION 2: Rule-Based Fallback (no LLM needed)
   ═══════════════════════════════════════════════════════════ */

/** Generate tutorial directly from parsed documentation (no LLM) */
export function generateFromParsedDocs(tutorial: ParsedTutorial): TutorialScript {
  const allSteps = tutorial.sections.flatMap(s =>
    s.steps.map(step => ({
      narration: step.narration,
      captureSelector: step.captureSelector,
      annotations: step.annotations.map(a => ({
        type: a.type as any,
        x: a.x || 50,
        y: a.y || 50,
        width: a.width,
        height: a.height,
        text: a.text,
        number: a.number,
        color: a.color,
      })),
      duration: step.duration,
    }))
  );

  return buildTutorialScript(
    tutorial.title,
    allSteps,
    {
      description: tutorial.description,
      targetAudience: tutorial.audienceLevel,
      language: "en",
    },
  );
}

/** Parse LLM JSON output into TutorialScript (handles common LLM quirks) */
export function parseLLMOutput(raw: string): Partial<TutorialScript> | null {
  // Try to extract JSON from the response (may be wrapped in markdown code fences)
  let jsonStr = raw.trim();

  // Remove markdown code fences
  if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
  else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
  jsonStr = jsonStr.trim();

  // Try parsing
  try {
    const parsed = JSON.parse(jsonStr);
    return parsed as Partial<TutorialScript>;
  } catch {
    // Try to find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as Partial<TutorialScript>;
      } catch {}
    }

    // Try to find JSON array
    const arrMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const scenes = JSON.parse(arrMatch[0]);
        return { scenes } as Partial<TutorialScript>;
      } catch {}
    }

    return null;
  }
}

/** Merge LLM output with rule-based fallback */
export function mergeWithFallback(
  llmOutput: Partial<TutorialScript> | null,
  fallback: TutorialScript,
): TutorialScript {
  if (!llmOutput) return fallback;

  return {
    ...fallback,
    ...llmOutput,
    title: llmOutput.title || fallback.title,
    description: llmOutput.description || fallback.description,
    scenes: (llmOutput.scenes as Scene[]) || fallback.scenes,
    metadata: {
      ...fallback.metadata,
      generator: llmOutput.scenes ? "slm-vector-v1" : fallback.metadata.generator,
    },
  };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: Full Pipeline
   ═══════════════════════════════════════════════════════════ */

export interface PipelineConfig {
  /** Website URL */
  url: string;
  /** Credentials */
  credentials?: {
    loginUrl?: string;
    username: string;
    password: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    successSelector?: string;
  };
  /** Help section config */
  helpSection: {
    url: string;
    contentSelector?: string;
    navSelectors?: string[];
    ignoreSelectors?: string[];
    maxPages?: number;
  };
  /** Tutorial preferences */
  tutorial?: {
    title?: string;
    voiceStyle?: "concise" | "detailed" | "conversational";
    audienceLevel?: "beginner" | "intermediate" | "advanced";
    maxDuration?: number;
  };
  /** LLM settings */
  llm?: {
    /** If true, use LLM for script generation. If false, use rule-based. */
    enabled: boolean;
    /** API endpoint (for external LLM) */
    endpoint?: string;
    /** API key */
    apiKey?: string;
    /** Model name */
    model?: string;
  };
  /** Output format */
  output?: "script" | "html" | "video" | "all";
}

export interface PipelineResult {
  /** The generated tutorial script */
  script: TutorialScript;
  /** Parsed documentation */
  parsedDocs: ParsedTutorial;
  /** Generated HTML presentation (if requested) */
  html?: string;
  /** Capture plan for automated screenshots */
  capturePlan: Array<{
    step: number;
    action: string;
    selector?: string;
    url?: string;
    description: string;
  }>;
  /** LLM prompt that was used */
  prompt?: string;
  /** Generation metadata */
  metadata: {
    pagesCrawled: number;
    stepsGenerated: number;
    estimatedDuration: number;
    usedLLM: boolean;
    generationTimeMs: number;
  };
}

/** Run the full pipeline */
export function runPipeline(
  pages: Array<{ url: string; html: string; order: number }>,
  config: PipelineConfig,
): PipelineResult {
  const startTime = performance.now();

  // Import and run synchronously (these are pure functions)
  const { processCrawledPages } = require("./website-crawler");
  const { parseDocumentation } = require("./doc-parser");

  // 1. Process crawled pages
  const extractedPages = processCrawledPages(pages, {
    baseUrl: config.url,
    helpSection: {
      url: config.helpSection.url,
      contentSelector: config.helpSection.contentSelector,
      navSelectors: config.helpSection.navSelectors,
      ignoreSelectors: config.helpSection.ignoreSelectors,
      maxPages: config.helpSection.maxPages || 50,
    },
  });

  // 2. Parse into tutorial structure
  const parsedDocs = parseDocumentation(extractedPages, {
    tutorialTitle: config.tutorial?.title,
    voiceStyle: config.tutorial?.voiceStyle,
    audienceLevel: config.tutorial?.audienceLevel,
  });

  // 3. Generate script
  let script: TutorialScript;
  let usedLLM = false;
  let prompt: string | undefined;

  if (config.llm?.enabled && config.llm.endpoint) {
    // Build the prompt for the LLM
    const docText = tutorialToText(parsedDocs);
    prompt = PROMPTS.generateScript.user(docText, {
      audience: parsedDocs.audienceLevel,
      style: parsedDocs.voiceStyle,
    });
    // LLM call would happen here (returning rule-based fallback for now)
    script = generateFromParsedDocs(parsedDocs);
    usedLLM = false; // LLM call is async, handled by the caller
  } else {
    // Rule-based generation (no LLM needed)
    script = generateFromParsedDocs(parsedDocs);
  }

  // 4. Generate capture plan
  const capturePlan = parsedDocs.sections.flatMap((s: TutorialSection) =>
    s.steps.map((step: TutorialStep) => ({
      step: step.stepNumber,
      action: step.action.type,
      selector: step.action.selector || step.captureSelector,
      url: step.action.url,
      description: step.narration,
    }))
  );

  // 5. Generate HTML if requested
  let html: string | undefined;
  if (config.output === "html" || config.output === "all") {
    const { exportAsHTML } = require("./video-tutorial");
    html = exportAsHTML(script);
  }

  const generationTimeMs = performance.now() - startTime;

  return {
    script,
    parsedDocs,
    html,
    capturePlan,
    prompt,
    metadata: {
      pagesCrawled: pages.length,
      stepsGenerated: script.scenes.length,
      estimatedDuration: script.estimatedDuration,
      usedLLM,
      generationTimeMs,
    },
  };
}

/* ─── stitaP — Documentation Parser for Tutorial Generation ─── */

/**
 * Takes crawled website content and converts it into structured
 * tutorial steps ready for video generation.
 */

import type { ExtractedPage, ContentBlock } from "./website-crawler";
import { blocksToText } from "./website-crawler";

/* ═══════════════════════════════════════════════════════════
   SECTION 1: Parsed Tutorial
   ═══════════════════════════════════════════════════════════ */

export interface ParsedTutorial {
  id: string;
  title: string;
  description: string;
  /** Grouped by logical sections */
  sections: TutorialSection[];
  /** Source URLs used */
  sourceUrls: string[];
  /** Estimated total duration in seconds */
  estimatedDuration: number;
  /** Suggested voiceover style */
  voiceStyle: "concise" | "detailed" | "conversational";
  /** Target audience level */
  audienceLevel: "beginner" | "intermediate" | "advanced";
}

export interface TutorialSection {
  title: string;
  steps: TutorialStep[];
  /** Section order */
  order: number;
}

export interface TutorialStep {
  /** Step number within section */
  stepNumber: number;
  /** Step title */
  title: string;
  /** Narration text (what to say) */
  narration: string;
  /** Visual action to perform */
  action: StepAction;
  /** UI element to capture after action */
  captureSelector?: string;
  /** Expected screenshot description (for SLM) */
  screenshotDescription?: string;
  /** Annotations to highlight */
  annotations: StepAnnotation[];
  /** Source page URL */
  sourceUrl: string;
  /** Estimated duration */
  duration: number;
}

export type StepActionType =
  | "navigate"
  | "click"
  | "type"
  | "scroll"
  | "hover"
  | "wait"
  | "screenshot"
  | "observe"
  | "describe";

export interface StepAction {
  type: StepActionType;
  /** Target element */
  selector?: string;
  /** Text to type */
  text?: string;
  /** URL to navigate to */
  url?: string;
  /** Scroll direction */
  scrollDirection?: "down" | "up";
  /** Wait time in ms */
  waitMs?: number;
}

export interface StepAnnotation {
  type: "arrow" | "rectangle" | "circle" | "text" | "number-badge" | "highlight";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  number?: number;
  color?: string;
  /** Description for LLM to generate precise coordinates */
  description?: string;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: Content Analysis
   ═══════════════════════════════════════════════════════════ */

/** Detect if content is a step-by-step guide */
export function isStepGuide(blocks: ContentBlock[]): boolean {
  const steps = blocks.filter(b => b.type === "step");
  const lists = blocks.filter(b => b.type === "list");
  const hasNumbers = blocks.some(b => b.text.match(/^\d+\.\s/m));
  return steps.length >= 2 || lists.length >= 3 || hasNumbers;
}

/** Detect the documentation type */
export function detectDocType(blocks: ContentBlock[]): "tutorial" | "reference" | "faq" | "guide" | "changelog" {
  const text = blocksToText(blocks).toLowerCase();

  if (text.includes("how to") || text.includes("step by step") || text.includes("getting started")) return "tutorial";
  if (text.includes("faq") || text.includes("frequently asked")) return "faq";
  if (text.includes("api") || text.includes("parameter") || text.includes("returns")) return "reference";
  if (text.includes("what's new") || text.includes("changelog") || text.includes("released")) return "changelog";
  return "guide";
}

/** Estimate reading/speaking duration */
export function estimateNarrationDuration(text: string): number {
  const words = text.split(/\s+/).length;
  const wordsPerMinute = 150;
  return Math.max(2, Math.min(12, (words / wordsPerMinute) * 60));
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: Step Extraction
   ═══════════════════════════════════════════════════════════ */

/** Extract tutorial steps from a single page's content blocks */
export function extractStepsFromPage(page: ExtractedPage): TutorialStep[] {
  const steps: TutorialStep[] = [];
  let stepNum = 0;
  let currentAction: StepAction = { type: "observe" };
  let currentText = "";

  for (const block of page.structured) {
    switch (block.type) {
      case "step":
        // Save previous step
        if (currentText) {
          steps.push(createStep(stepNum, currentText, currentAction, page));
        }
        stepNum = block.stepNumber || stepNum + 1;
        currentText = block.text;
        currentAction = inferAction(block.text);
        break;

      case "code":
        // Code blocks often indicate a command or API call
        currentAction = { type: "describe", text: block.text };
        break;

      case "list":
        // Lists can be multi-step instructions
        if (block.items && block.items.length > 0) {
          for (const item of block.items) {
            if (currentText) {
              steps.push(createStep(stepNum, currentText, currentAction, page));
              stepNum++;
            }
            currentText = item;
            currentAction = inferAction(item);
          }
        }
        break;

      case "paragraph":
        if (block.text.length > 30) {
          currentText += " " + block.text;
        }
        break;

      case "heading":
        if (block.level && block.level <= 2 && block.text.length > 3) {
          // Major section heading — could be a section divider
          if (currentText) {
            steps.push(createStep(stepNum, currentText, currentAction, page));
            stepNum++;
            currentText = `[Section: ${block.text}]`;
            currentAction = { type: "observe" };
          }
        }
        break;

      case "note":
      case "warning":
        steps.push({
          stepNumber: ++stepNum,
          title: block.type === "warning" ? "Warning" : "Note",
          narration: block.text,
          action: { type: "describe", text: block.text },
          annotations: [{ type: "text", text: block.text, color: block.type === "warning" ? "#ef4444" : "#3b82f6" }],
          sourceUrl: page.url,
          duration: estimateNarrationDuration(block.text),
        });
        break;
    }
  }

  // Save last step
  if (currentText) {
    steps.push(createStep(stepNum, currentText, currentAction, page));
  }

  return steps;
}

/** Create a TutorialStep from extracted data */
function createStep(
  num: number,
  text: string,
  action: StepAction,
  page: ExtractedPage,
): TutorialStep {
  const narration = text.length > 200 ? text.slice(0, 197) + "..." : text;
  return {
    stepNumber: num,
    title: text.slice(0, 60).replace(/[.!?]+$/, ""),
    narration,
    action,
    captureSelector: action.selector,
    screenshotDescription: text,
    annotations: [
      { type: "number-badge", number: num, color: "#6366f1" },
    ],
    sourceUrl: page.url,
    duration: estimateNarrationDuration(narration),
  };
}

/** Infer action type from text description */
function inferAction(text: string): StepAction {
  const lower = text.toLowerCase();

  if (lower.match(/click|press|select|tap|choose/)) {
    const selectorMatch = text.match(/`([^`]+)`/);
    return { type: "click", selector: selectorMatch?.[1] };
  }

  if (lower.match(/type|enter|input|fill|write/)) {
    const textMatch = text.match(/["']([^"']+)["']/);
    return { type: "type", text: textMatch?.[1] || "" };
  }

  if (lower.match(/scroll|swipe|navigate/)) {
    return { type: "scroll", scrollDirection: lower.includes("up") ? "up" : "down" };
  }

  if (lower.match(/hover|mouseover/)) {
    return { type: "hover" };
  }

  if (lower.match(/wait|loading/)) {
    return { type: "wait", waitMs: 2000 };
  }

  if (lower.match(/open|go to|navigate|visit/)) {
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    return { type: "navigate", url: urlMatch?.[1] };
  }

  return { type: "observe" };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: Full Parse Pipeline
   ═══════════════════════════════════════════════════════════ */

/** Parse crawled pages into a complete ParsedTutorial */
export function parseDocumentation(
  pages: ExtractedPage[],
  options?: {
    tutorialTitle?: string;
    voiceStyle?: "concise" | "detailed" | "conversational";
    audienceLevel?: "beginner" | "intermediate" | "advanced";
  },
): ParsedTutorial {
  const sections: TutorialSection[] = [];
  let stepCounter = 0;

  for (const page of pages) {
    if (page.structured.length === 0) continue;

    const steps = extractStepsFromPage(page);
    if (steps.length === 0) continue;

    // Renumber steps globally
    for (const step of steps) {
      step.stepNumber = ++stepCounter;
    }

    sections.push({
      title: page.title,
      steps,
      order: page.order,
    });
  }

  // Determine title
  const title = options?.tutorialTitle || pages[0]?.title || "Tutorial";

  // Determine audience level from content complexity
  const allText = pages.map(p => p.text).join(" ");
  const techTerms = (allText.match(/\b(api|sdk|cli|npm|terminal|command|function|variable|debug|deploy|config)\b/gi) || []).length;
  const audienceLevel = options?.audienceLevel || (techTerms > 20 ? "advanced" : techTerms > 5 ? "intermediate" : "beginner");

  // Estimate duration
  const totalDuration = sections.reduce((sum, s) =>
    sum + s.steps.reduce((ss, step) => ss + step.duration, 0), 0
  );

  return {
    id: `parsed-${Date.now().toString(36)}`,
    title,
    description: `Auto-generated tutorial from ${pages.length} documentation page(s)`,
    sections,
    sourceUrls: pages.map(p => p.url),
    estimatedDuration: totalDuration,
    voiceStyle: options?.voiceStyle || "concise",
    audienceLevel,
  };
}

/** Convert ParsedTutorial to plain text summary (for LLM input) */
export function tutorialToText(tutorial: ParsedTutorial): string {
  const lines: string[] = [
    `# ${tutorial.title}`,
    tutorial.description,
    `Audience: ${tutorial.audienceLevel}`,
    `Estimated duration: ${Math.round(tutorial.estimatedDuration)}s`,
    "",
  ];

  for (const section of tutorial.sections) {
    lines.push(`## ${section.title}`);
    for (const step of section.steps) {
      lines.push(`**Step ${step.stepNumber}: ${step.title}**`);
      lines.push(`${step.narration}`);
      lines.push(`Action: ${step.action.type}${step.action.selector ? ` on \`${step.action.selector}\`` : ""}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** Convert ParsedTutorial to a TutorialScript (for video rendering) */
export function tutorialToScript(tutorial: ParsedTutorial): import("./video-tutorial").TutorialScript {
  const { buildTutorialScript } = require("./video-tutorial");
  const allSteps = tutorial.sections.flatMap(s => s.steps);
  return buildTutorialScript(
    tutorial.title,
    allSteps.map(s => ({
      narration: s.narration,
      captureSelector: s.captureSelector,
      annotations: s.annotations.map(a => ({
        type: a.type as any,
        x: a.x || 0,
        y: a.y || 0,
        width: a.width,
        height: a.height,
        text: a.text,
        number: a.number,
        color: a.color,
      })),
      duration: s.duration,
    })),
    {
      description: tutorial.description,
      targetAudience: tutorial.audienceLevel,
      language: "en",
    },
  );
}

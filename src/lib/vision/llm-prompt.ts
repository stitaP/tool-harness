/**
 * LLM Prompt Generator — converts ViT-backed SceneDescription into prompts
 * that any LLM (SLM or large) can consume to understand what an image depicts.
 *
 * Zero heuristic rules — all input comes from the vision model inference.
 */

import type { SceneDescription } from "./scene-parser";

// ─── Prompt goals ────────────────────────────────────────────────────────────

export type PromptGoal =
  | "describe"    // Describe what the image shows
  | "recreate"    // Generate code to recreate the layout
  | "tutorial"    // Generate step-by-step tutorial
  | "annotate"    // Generate alt-text / annotation
  | "compare";    // Compare two scenes

interface PromptOptions {
  goal: PromptGoal;
  /** Max tokens hint (SLMs are limited). */
  maxTokens?: number;
  /** Include raw element data for precision. */
  includeRaw?: boolean;
  /** Target language for code generation. */
  codeLang?: string;
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

export function buildScenePrompt(
  scene: SceneDescription,
  options: PromptOptions,
): string {
  switch (options.goal) {
    case "describe":
      return buildDescribePrompt(scene, options);
    case "recreate":
      return buildRecreatePrompt(scene, options);
    case "tutorial":
      return buildTutorialPrompt(scene, options);
    case "annotate":
      return buildAnnotatePrompt(scene, options);
    case "compare":
      return buildComparePrompt(scene, options);
  }
}

function buildDescribePrompt(scene: SceneDescription, opts: PromptOptions): string {
  const parts: string[] = [];

  parts.push("Describe this user interface screenshot in detail.");
  parts.push("");

  // Narrative from model
  parts.push(scene.narrative);

  // Structured data
  if (opts.includeRaw && scene.elements.length > 0) {
    parts.push("");
    parts.push("Detected elements:");
    for (const el of scene.elements.slice(0, 15)) {
      parts.push(`- ${el.label} (${Math.round(el.confidence * 100)}%)${el.description ? `: ${el.description}` : ""}`);
    }
  }

  // Layout
  if (scene.layoutZones.length > 0) {
    parts.push("");
    parts.push(`Layout zones: ${scene.layoutZones.map((z) => z.zone).join(", ")}`);
  }

  // Colors
  if (scene.dominantColors.length > 0) {
    parts.push("");
    parts.push(`Color palette: ${scene.dominantColors.join(", ")}`);
  }

  return parts.join("\n");
}

function buildRecreatePrompt(scene: SceneDescription, opts: PromptOptions): string {
  const lang = opts.codeLang || "html";
  const parts: string[] = [];

  parts.push(`Generate ${lang} code that recreates this UI layout.`);
  parts.push("");

  parts.push(scene.narrative);
  parts.push("");

  parts.push("Elements to include:");
  for (const el of scene.elements) {
    parts.push(`- ${el.label}${el.description ? `: ${el.description}` : ""}`);
  }

  if (scene.layoutZones.length > 0) {
    parts.push("");
    parts.push(`Layout structure: ${scene.layoutZones.map((z) => z.zone).join(" → ")}`);
  }

  if (scene.dominantColors.length > 0) {
    parts.push("");
    parts.push(`Use these colors: ${scene.dominantColors.join(", ")}`);
  }

  return parts.join("\n");
}

function buildTutorialPrompt(scene: SceneDescription, opts: PromptOptions): string {
  const parts: string[] = [];

  parts.push("Generate a step-by-step tutorial explaining how to use this interface.");
  parts.push("");

  parts.push(scene.narrative);
  parts.push("");

  if (scene.elements.length > 0) {
    parts.push("Interactive elements (guide the user through these):");
    let step = 1;
    for (const el of scene.elements) {
      if (["button", "input_text", "input_search", "link", "select_dropdown", "checkbox", "radio", "toggle_switch", "tab_bar"].includes(el.label)) {
        parts.push(`Step ${step}: Interact with the ${el.label}${el.description ? ` (${el.description})` : ""}`);
        step++;
      }
    }
    if (step === 1) {
      parts.push("This appears to be a display-only interface with no interactive elements.");
    }
  }

  return parts.join("\n");
}

function buildAnnotatePrompt(scene: SceneDescription, opts: PromptOptions): string {
  const parts: string[] = [];

  parts.push("Generate accessible alt-text and annotations for this screenshot.");
  parts.push("");

  parts.push(scene.narrative);
  parts.push("");

  parts.push("Element annotations:");
  for (const el of scene.elements) {
    parts.push(`- ${el.label}: ${el.description || `A ${el.label} element`}`);
  }

  return parts.join("\n");
}

function buildComparePrompt(scene: SceneDescription, opts: PromptOptions): string {
  const parts: string[] = [];

  parts.push("Compare this interface with a reference. Note differences in:");
  parts.push("1. Layout structure");
  parts.push("2. Element types and positions");
  parts.push("3. Color palette");
  parts.push("4. Visual hierarchy");
  parts.push("");

  parts.push(scene.narrative);
  parts.push("");

  parts.push("This scene contains:");
  for (const el of scene.elements.slice(0, 10)) {
    parts.push(`- ${el.label} (${Math.round(el.confidence * 100)}%)`);
  }

  return parts.join("\n");
}

// ─── Minimal prompt (for constrained SLMs) ───────────────────────────────────

/**
 * Generate a minimal text-only prompt that a small language model (<1B params)
 * can understand without visual input.
 */
export function buildMinimalPrompt(scene: SceneDescription): string {
  const parts: string[] = [];

  // Ultra-compact format for SLMs
  parts.push(`Scene: ${scene.sceneType}`);

  if (scene.elements.length > 0) {
    const counts = new Map<string, number>();
    for (const e of scene.elements.slice(0, 10)) {
      counts.set(e.label, (counts.get(e.label) || 0) + 1);
    }
    const items = [...counts.entries()].map(([l, c]) => `${l}${c > 1 ? `(x${c})` : ""}`);
    parts.push(`Elements: ${items.join(", ")}`);
  }

  if (scene.layoutZones.length > 0) {
    parts.push(`Layout: ${scene.layoutZones.map((z) => z.zone).join("/")}`);
  }

  if (scene.dominantColors.length > 0) {
    parts.push(`Colors: ${scene.dominantColors.slice(0, 3).join(",")}`);
  }

  return parts.join("\n");
}

// ─── JSON-LD structured output ───────────────────────────────────────────────

/**
 * Generate a JSON-LD structured description for programmatic consumption.
 */
export function buildStructuredOutput(scene: SceneDescription): Record<string, unknown> {
  return {
    "@context": "https://stitap.dev/schema/v1",
    "@type": "SceneDescription",
    scene: {
      type: scene.sceneType,
      confidence: Math.round(scene.sceneConfidence * 100) + "%",
    },
    elements: scene.elements.map((e) => ({
      type: e.label,
      confidence: Math.round(e.confidence * 100) + "%",
      ...(e.description ? { description: e.description } : {}),
      ...(e.bbox ? { bbox: e.bbox } : {}),
    })),
    layout: scene.layoutZones.map((z) => ({
      zone: z.zone,
      confidence: Math.round(z.confidence * 100) + "%",
      elements: z.elements,
    })),
    colors: scene.dominantColors,
    spatialRelations: scene.relations.slice(0, 10).map((r) => ({
      subject: r.subject,
      relation: r.relation,
      object: r.object,
    })),
    narrative: scene.narrative,
  };
}

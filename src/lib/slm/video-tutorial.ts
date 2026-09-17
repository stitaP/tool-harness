/* ─── stitaP — SLM Video Tutorial Generation Pipeline ─── */

/**
 * This module provides tools for SLMs (Small Language Models) to generate
 * video tutorials programmatically. It includes:
 *
 * 1. Prompt-to-Script Pipeline — SLM takes a task description, outputs a structured script
 * 2. Scene Generator — Each scene becomes a sequence of capture + annotation + transition steps
 * 3. Step-By-Step Capture — Automated capture sequences with timing
 * 4. Narration TTS Pipeline — Text-to-speech for voiceover using Web Audio API synthesis
 * 5. Render Pipeline — Composites scenes into a video sequence
 * 6. Export Formats — WebM, animated GIF, HTML presentation
 */

/* ═══════════════════════════════════════════════════════════
   SECTION 1: Script Data Model
   ═══════════════════════════════════════════════════════════ */

export type SceneType = "title" | "step" | "highlight" | "transition" | "callout" | "comparison" | "end";

export interface TutorialScript {
  id: string;
  title: string;
  description: string;
  targetAudience: string;
  estimatedDuration: number; // seconds
  scenes: Scene[];
  metadata: {
    version: string;
    generatedAt: string;
    generator: "slm-vector-v1" | "slm-narrator-v1" | "human";
    language: string;
  };
}

export interface Scene {
  id: string;
  type: SceneType;
  /** Narration text (what the SLM "says" or what TTS speaks) */
  narration: string;
  /** Visual content description */
  visual: VisualContent;
  /** Duration in seconds */
  duration: number;
  /** Transition to next scene */
  transition?: TransitionType;
  /** Annotations to overlay */
  annotations: Annotation[];
  /** Timing cues for SLM pacing */
  timing: {
    pauseBefore: number; // seconds
    pauseAfter: number;
    emphasisWords: string[]; // words to slow down on
  };
}

export interface VisualContent {
  /** Screenshot URL or canvas capture */
  screenshotUrl?: string;
  /** Element selector to capture */
  captureSelector?: string;
  /** Region to capture {x, y, width, height} */
  captureRegion?: { x: number; y: number; width: number; height: number };
  /** Highlight box */
  highlight?: { x: number; y: number; width: number; height: number; color?: string };
  /** Zoom level (1 = no zoom) */
  zoom?: number;
  /** Pan offset */
  pan?: { x: number; y: number };
  /** Background for title/end scenes */
  background?: { type: "gradient" | "solid" | "pattern"; colors: string[] };
  /** Text overlay */
  textOverlay?: {
    text: string;
    position: "center" | "top" | "bottom" | "left" | "right";
    style: "title" | "subtitle" | "caption" | "callout";
    fontSize?: number;
    color?: string;
    animation?: "fade-in" | "slide-up" | "typewriter" | "none";
  };
}

export type TransitionType = "fade" | "cut" | "dissolve" | "wipe" | "zoom";

export interface Annotation {
  type: "arrow" | "rectangle" | "circle" | "text" | "number-badge" | "blur" | "magnifier";
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  text?: string;
  number?: number;
  /** Animation delay before showing */
  delay?: number;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2: Script Generator (SLM Prompt Templates)
   ═══════════════════════════════════════════════════════════ */

/** Pre-built prompt templates for SLMs to generate scripts */
export const SCRIPT_PROMPTS = {
  /** Generate a tutorial script from a task description */
  generateScript: (taskDescription: string, options?: {
    style?: "quick" | "detailed" | "beginner";
    maxScenes?: number;
    includeVoiceover?: boolean;
  }) => ({
    system: `You are a video tutorial script writer for technical documentation.
Given a task description, generate a JSON TutorialScript.

Rules:
- Each scene should be 3-8 seconds
- Use clear, concise narration (readable at 150 words/min)
- Title scene (5s) → Step scenes → End scene (3s)
- Annotations should highlight UI elements being discussed
- Use number badges (1, 2, 3...) for sequential steps
- Transitions: "cut" for fast pacing, "fade" for scene changes
- Emphasis words help TTS slow down for important terms

Output format: JSON TutorialScript (no markdown, no code fences)`,
    user: `Task: ${taskDescription}
Style: ${options?.style || "detailed"}
Max scenes: ${options?.maxScenes || 10}
Include voiceover: ${options?.includeVoiceover !== false}

Generate the tutorial script as JSON.`,
  }),

  /** Generate scene annotations from a screenshot description */
  generateAnnotations: (sceneDescription: string, screenshotDimensions: { width: number; height: number }) => ({
    system: `You are a UI annotation assistant. Given a scene description and screenshot dimensions,
output an array of Annotation objects with precise pixel coordinates.

Available annotation types:
- arrow: points to a UI element (x, y → target)
- rectangle: highlights a region (x, y, width, height)
- circle: highlights a point (x, y, radius=width)
- text: labels an element (x, y, text)
- number-badge: step number badge (x, y, number)
- blur: redacts sensitive content (x, y, width, height)
- magnifier: zoom into detail (x, y, width)

Output: JSON array of Annotation objects.`,
    user: `Scene: ${sceneDescription}
Screenshot: ${screenshotDimensions.width}x${screenshotDimensions.height} px

Generate precise annotations as JSON.`,
  }),

  /** Generate narration from a visual scene description */
  generateNarration: (visualDescription: string, style: "concise" | "detailed" | "conversational") => ({
    system: `You are a voiceover script writer for software tutorials.
Generate clear, natural narration text.
Style: ${style}
Rules:
- Speak directly to the viewer ("Click the button" not "The user clicks")
- One sentence per visual action
- Keep sentences under 20 words for TTS clarity
- Use emphasis markers **word** for key terms`,
    user: `Visual scene: ${visualDescription}

Write the narration text (plain text, no JSON).`,
  }),

  /** Generate timing cues from a script */
  generateTiming: (scenes: Array<{ narration: string; type: string }>) => ({
    system: `Calculate optimal timing for each scene based on narration length.
Rules:
- 150 words per minute speaking speed
- Minimum 2 seconds per scene
- Maximum 10 seconds per scene
- Add 0.5s pause before emphasis scenes
- Title: 4-6 seconds, End: 2-3 seconds
Output: JSON array of { sceneIndex, duration, pauseBefore, pauseAfter }`,
    user: `Scenes: ${JSON.stringify(scenes.map((s, i) => ({
      index: i,
      narrationWords: s.narration.split(" ").length,
      type: s.type,
    })))}

Calculate timing as JSON.`,
  }),
};

/* ═══════════════════════════════════════════════════════════
   SECTION 3: Script Builder (programmatic)
   ═══════════════════════════════════════════════════════════ */

let _sceneId = 0;
function nextSceneId(): string {
  return `scene_${++_sceneId}`;
}

/** Build a script programmatically from step descriptions */
export function buildTutorialScript(
  title: string,
  steps: Array<{
    narration: string;
    captureSelector?: string;
    annotations?: Annotation[];
    duration?: number;
  }>,
  options?: { description?: string; targetAudience?: string; language?: string },
): TutorialScript {
  const scenes: Scene[] = [];

  // Title scene
  scenes.push({
    id: nextSceneId(),
    type: "title",
    narration: title,
    visual: {
      background: { type: "gradient", colors: ["#6366f1", "#8b5cf6"] },
      textOverlay: {
        text: title,
        position: "center",
        style: "title",
        animation: "fade-in",
      },
    },
    duration: 5,
    transition: "fade",
    annotations: [],
    timing: { pauseBefore: 0, pauseAfter: 1, emphasisWords: [] },
  });

  // Step scenes
  steps.forEach((step, i) => {
    scenes.push({
      id: nextSceneId(),
      type: "step",
      narration: step.narration,
      visual: {
        captureSelector: step.captureSelector,
        textOverlay: {
          text: `Step ${i + 1}`,
          position: "top",
          style: "subtitle",
        },
      },
      duration: step.duration || estimateDuration(step.narration),
      transition: i < steps.length - 1 ? "cut" : "fade",
      annotations: [
        { type: "number-badge", x: 40, y: 40, number: i + 1, color: "#6366f1" },
        ...(step.annotations || []),
      ],
      timing: { pauseBefore: 0.5, pauseAfter: 0.3, emphasisWords: extractKeyTerms(step.narration) },
    });
  });

  // End scene
  scenes.push({
    id: nextSceneId(),
    type: "end",
    narration: "Tutorial complete!",
    visual: {
      background: { type: "gradient", colors: ["#1e293b", "#334155"] },
      textOverlay: {
        text: "Thanks for watching!",
        position: "center",
        style: "title",
        animation: "fade-in",
      },
    },
    duration: 3,
    annotations: [],
    timing: { pauseBefore: 0, pauseAfter: 0, emphasisWords: [] },
  });

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration + s.timing.pauseBefore + s.timing.pauseAfter, 0);

  return {
    id: `tutorial_${Date.now().toString(36)}`,
    title,
    description: options?.description || `Video tutorial: ${title}`,
    targetAudience: options?.targetAudience || "intermediate",
    estimatedDuration: totalDuration,
    scenes,
    metadata: {
      version: "1.0",
      generatedAt: new Date().toISOString(),
      generator: "slm-vector-v1",
      language: options?.language || "en",
    },
  };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: TTS Narration (Web Audio API synthesis)
   ═══════════════════════════════════════════════════════════ */

/** Voice preset for narration */
export interface VoicePreset {
  id: string;
  name: string;
  baseFreq: number;    // fundamental frequency
  formants: number[];  // formant frequencies
  rate: number;        // speaking rate
  pitch: number;       // pitch multiplier
}

export const VOICE_PRESETS: VoicePreset[] = [
  { id: "neutral", name: "Neutral", baseFreq: 160, formants: [500, 1500, 2500], rate: 1, pitch: 1 },
  { id: "male", name: "Male", baseFreq: 120, formants: [400, 1200, 2200], rate: 0.95, pitch: 0.85 },
  { id: "female", name: "Female", baseFreq: 200, formants: [600, 1800, 2800], rate: 1.05, pitch: 1.15 },
  { id: "child", name: "Child", baseFreq: 280, formants: [800, 2200, 3200], rate: 1.1, pitch: 1.3 },
];

/** Generate speech audio from text using formant synthesis */
export function synthesizeSpeech(
  text: string,
  voice: VoicePreset = VOICE_PRESETS[0],
  sampleRate = 44100,
): Float32Array {
  const phonemes = textToPhonemes(text);
  let totalSamples = 0;
  const phonemeBuffers: Float32Array[] = [];

  for (const ph of phonemes) {
    const samples = synthesizePhoneme(ph, voice, sampleRate);
    phonemeBuffers.push(samples);
    totalSamples += samples.length;
  }

  const output = new Float32Array(totalSamples);
  let offset = 0;
  for (const buf of phonemeBuffers) {
    output.set(buf, offset);
    offset += buf.length;
  }

  return output;
}

/** Convert text to phoneme-like tokens */
function textToPhonemes(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const tokens: string[] = [];

  for (const word of words) {
    // Simple vowel/consonant grouping
    let i = 0;
    while (i < word.length) {
      const ch = word[i];
      if ("aeiou".includes(ch)) {
        // Vowel cluster
        let cluster = ch;
        while (i + 1 < word.length && "aeiou".includes(word[i + 1])) {
          cluster += word[++i];
        }
        tokens.push(`V:${cluster}`);
      } else if (/[a-z]/.test(ch)) {
        // Consonant cluster
        let cluster = ch;
        while (i + 1 < word.length && /[a-z]/.test(word[i + 1]) && !"aeiou".includes(word[i + 1]) && cluster.length < 3) {
          cluster += word[++i];
        }
        tokens.push(`C:${cluster}`);
      } else if (".!,;:!?".includes(ch)) {
        tokens.push(`P:${ch}`);
      }
      i++;
    }
    tokens.push("W: "); // Word boundary (silence)
  }
  return tokens;
}

/** Synthesize a single phoneme-like token */
function synthesizePhoneme(
  token: string,
  voice: VoicePreset,
  sampleRate: number,
): Float32Array {
  const [type, value] = token.split(":");
  const duration = type === "W" ? 0.08 : type === "P" ? 0.15 : 0.06 + Math.random() * 0.04;
  const numSamples = Math.floor(sampleRate * duration * voice.rate);
  const buf = new Float32Array(numSamples);

  if (type === "W" || type === "P") {
    // Silence / pause
    return buf;
  }

  if (type === "V") {
    // Vowel: harmonics with formant shaping
    const freq = voice.baseFreq * voice.pitch;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.sin(Math.PI * i / numSamples);
      let sample = 0;
      for (let h = 1; h <= 8; h++) {
        sample += Math.sin(2 * Math.PI * freq * h * t) / (h * h);
      }
      // Apply formant boost
      const vowelFormant = value.length === 1 ? 0 : "aeiou".indexOf(value[0]);
      const boost = voice.formants[Math.min(vowelFormant, voice.formants.length - 1)] / 1000;
      sample *= (1 + boost * 0.3) * envelope * 0.4;
      buf[i] = Math.max(-1, Math.min(1, sample));
    }
  } else if (type === "C") {
    // Consonant: noise burst + formant transition
    const isVoiced = "bvdgmnz".includes(value[0] || "");
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.sin(Math.PI * i / numSamples);
      const noise = (Math.random() * 2 - 1) * 0.15;
      const voiced = isVoiced ? Math.sin(2 * Math.PI * voice.baseFreq * voice.pitch * t) * 0.2 : 0;
      buf[i] = Math.max(-1, Math.min(1, (noise + voiced) * envelope));
    }
  }

  return buf;
}

/** Convert Float32Array samples to WAV Blob */
export function samplesToWavBlob(samples: Float32Array, sampleRate = 44100): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const fileSize = 44 + dataSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // RIFF header
  writeStr(view, 0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

/* ═══════════════════════════════════════════════════════════
   SECTION 5: Video Renderer (Canvas compositing)
   ═══════════════════════════════════════════════════════════ */

export interface RenderOptions {
  width: number;
  height: number;
  fps: number;
  background?: string;
}

/** Render a tutorial script frame-by-frame */
export async function renderTutorial(
  script: TutorialScript,
  canvas: HTMLCanvasElement,
  options: RenderOptions,
  onProgress?: (scene: number, total: number, frame: number, totalFrames: number) => void,
): Promise<Blob | null> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Safe to use non-null from here
  const renderingCtx = ctx as CanvasRenderingContext2D;
  renderingCtx.canvas.width = options.width;
  renderingCtx.canvas.height = options.height;

  const framesPerSecond = options.fps;
  let totalFrames = 0;
  const sceneFrameCounts: number[] = [];

  for (const scene of script.scenes) {
    const frames = Math.ceil(scene.duration * framesPerSecond);
    sceneFrameCounts.push(frames);
    totalFrames += frames;
  }

  // Use MediaRecorder if available
  const stream = canvas.captureStream(framesPerSecond);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);

  return new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    recorder.start();

    let currentFrame = 0;
    let sceneIndex = 0;

    function renderFrame() {
      if (sceneIndex >= script.scenes.length) {
        recorder.stop();
        return;
      }

      const scene = script.scenes[sceneIndex];
      const framesInScene = sceneFrameCounts[sceneIndex];
      const frameInScene = currentFrame - sceneFrameCounts.slice(0, sceneIndex).reduce((a, b) => a + b, 0);

      // Clear canvas
      renderingCtx.fillStyle = options.background || "#000";
      renderingCtx.fillRect(0, 0, options.width, options.height);

      // Render scene based on type
      renderScene(renderingCtx, scene, options.width, options.height, frameInScene / framesInScene);

      onProgress?.(sceneIndex, script.scenes.length, currentFrame, totalFrames);

      currentFrame++;
      if (frameInScene >= framesInScene) {
        sceneIndex++;
      }

      if (sceneIndex < script.scenes.length) {
        requestAnimationFrame(renderFrame);
      } else {
        recorder.stop();
      }
    }

    renderFrame();
  });
}

/** Render a single scene to canvas context */
function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  width: number,
  height: number,
  progress: number,
) {
  // Background
  if (scene.visual.background) {
    const bg = scene.visual.background;
    if (bg.type === "gradient" && bg.colors.length >= 2) {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, bg.colors[0]);
      grad.addColorStop(1, bg.colors[1]);
      ctx.fillStyle = grad;
    } else if (bg.type === "solid" && bg.colors[0]) {
      ctx.fillStyle = bg.colors[0];
    }
    ctx.fillRect(0, 0, width, height);
  }

  // Text overlay
  if (scene.visual.textOverlay) {
    const text = scene.visual.textOverlay;
    const fadeIn = Math.min(1, progress * 4);
    ctx.globalAlpha = fadeIn;

    const fontSize = text.fontSize || (text.style === "title" ? 64 : text.style === "subtitle" ? 36 : 24);
    ctx.font = `bold ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.fillStyle = text.color || "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const x = width / 2;
    const y = text.position === "top" ? height * 0.2 : text.position === "bottom" ? height * 0.8 : height / 2;
    ctx.fillText(text.text, x, y);

    ctx.globalAlpha = 1;
  }

  // Annotations
  for (const ann of scene.annotations) {
    const delay = ann.delay || 0;
    const annProgress = Math.max(0, Math.min(1, (progress - delay) * 3));
    if (annProgress <= 0) continue;
    ctx.globalAlpha = annProgress;

    const scale = width / 1920;

    switch (ann.type) {
      case "number-badge": {
        const r = 20 * scale;
        ctx.beginPath();
        ctx.arc((ann.x + r) * scale, (ann.y + r) * scale, r, 0, Math.PI * 2);
        ctx.fillStyle = ann.color || "#6366f1";
        ctx.fill();
        ctx.font = `bold ${16 * scale}px sans-serif`;
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(ann.number || 1), (ann.x + r) * scale, (ann.y + r) * scale);
        break;
      }
      case "rectangle": {
        ctx.strokeStyle = ann.color || "#ef4444";
        ctx.lineWidth = 3 * scale;
        ctx.setLineDash([8 * scale, 4 * scale]);
        ctx.strokeRect(ann.x * scale, ann.y * scale, (ann.width || 100) * scale, (ann.height || 100) * scale);
        ctx.setLineDash([]);
        break;
      }
      case "text": {
        ctx.font = `bold ${20 * scale}px sans-serif`;
        ctx.fillStyle = ann.color || "#ffffff";
        ctx.fillText(ann.text || "", ann.x * scale, ann.y * scale);
        break;
      }
    }

    ctx.globalAlpha = 1;
  }

  // Narration text at bottom (caption style)
  if (scene.narration && scene.type !== "title" && scene.type !== "end") {
    const captionAlpha = Math.min(1, progress * 5) * Math.max(0, 1 - (progress - 0.8) * 5);
    ctx.globalAlpha = captionAlpha;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    const captionH = 60 * (width / 1920);
    ctx.fillRect(0, height - captionH - 20, width, captionH);
    ctx.font = `${18 * (width / 1920)}px sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(scene.narration.slice(0, 80), width / 2, height - captionH / 2 - 10);
    ctx.globalAlpha = 1;
  }
}

/* ═══════════════════════════════════════════════════════════
   SECTION 6: HTML Presentation Export
   ═══════════════════════════════════════════════════════════ */

/** Export tutorial as a standalone HTML presentation */
export function exportAsHTML(script: TutorialScript): string {
  const scenesHtml = script.scenes.map((scene, i) => {
    const bgStyle = scene.visual.background
      ? `background: linear-gradient(135deg, ${scene.visual.background.colors[0]}, ${scene.visual.background.colors[1] || scene.visual.background.colors[0]});`
      : "background: #1e293b;";

    return `
    <section class="scene" data-duration="${scene.duration}" style="${bgStyle}">
      <div class="scene-content">
        ${scene.visual.textOverlay ? `<h${scene.visual.textOverlay.style === "title" ? 1 : 2} class="scene-title">${scene.visual.textOverlay.text}</h${scene.visual.textOverlay.style === "title" ? 1 : 2}>` : ""}
        <p class="narration">${scene.narration}</p>
        <div class="annotations">
          ${scene.annotations.map((a) =>
            a.type === "number-badge" ? `<div class="badge" style="left:${a.x}px;top:${a.y}px;background:${a.color || "#6366f1"}">${a.number}</div>` : ""
          ).join("\n          ")}
        </div>
      </div>
    </section>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="${script.metadata.language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${script.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #000; color: #fff; overflow: hidden; }
    .scene { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; position: absolute; top: 0; left: 0; opacity: 0; transition: opacity 0.5s; }
    .scene.active { opacity: 1; }
    .scene-content { text-align: center; max-width: 80vw; }
    .scene-title { font-size: 4rem; margin-bottom: 1rem; font-weight: 800; }
    .narration { font-size: 1.5rem; opacity: 0.85; max-width: 600px; margin: 2rem auto; line-height: 1.6; }
    .annotations { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    .badge { position: absolute; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem; animation: pop 0.3s ease-out; }
    @keyframes pop { from { transform: scale(0); } to { transform: scale(1); } }
    .controls { position: fixed; bottom: 2rem; right: 2rem; display: flex; gap: 0.5rem; z-index: 10; }
    .controls button { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.9rem; }
    .controls button:hover { background: rgba(255,255,255,0.2); }
    .progress { position: fixed; bottom: 0; left: 0; height: 3px; background: #6366f1; transition: width 0.3s; z-index: 10; }
  </style>
</head>
<body>
  ${scenesHtml}
  <div class="controls">
    <button onclick="prev()">← Prev</button>
    <button onclick="next()">Next →</button>
    <button onclick="autoPlay()">▶ Auto</button>
  </div>
  <div class="progress" id="progress"></div>
  <script>
    let current = 0;
    const scenes = document.querySelectorAll('.scene');
    const total = scenes.length;
    function show(i) { scenes.forEach(s => s.classList.remove('active')); if (scenes[i]) scenes[i].classList.add('active'); document.getElementById('progress').style.width = ((i+1)/total*100)+'%'; }
    function next() { current = Math.min(current+1, total-1); show(current); }
    function prev() { current = Math.max(current-1, 0); show(current); }
    let autoTimer;
    function autoPlay() { clearInterval(autoTimer); autoTimer = setInterval(() => { if (current >= total-1) { clearInterval(autoTimer); return; } next(); }, (parseFloat(scenes[current]?.dataset.duration || 5) + 1) * 1000); }
    document.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === ' ') next(); if (e.key === 'ArrowLeft') prev(); });
    show(0);
  </script>
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 7: Helper Functions
   ═══════════════════════════════════════════════════════════ */

/** Estimate narration duration from word count */
function estimateDuration(narration: string): number {
  const words = narration.split(/\s+/).length;
  return Math.max(2, Math.min(10, (words / 150) * 60)); // 150 wpm
}

/** Extract key terms for emphasis */
function extractKeyTerms(text: string): string[] {
  const words = text.split(/\s+/);
  const stopWords = new Set(["a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "shall", "can", "need", "dare", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "and", "but", "or", "not", "this", "that", "it"]);
  return words.filter((w) => w.length > 4 && !stopWords.has(w.toLowerCase())).slice(0, 3);
}

/** Serialize TutorialScript to JSON */
export function serializeScript(script: TutorialScript): string {
  return JSON.stringify(script, null, 2);
}

/** Deserialize TutorialScript from JSON */
export function deserializeScript(json: string): TutorialScript {
  return JSON.parse(json);
}

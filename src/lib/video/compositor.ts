/* ─── stitaP Video Editor — Frame Compositor (Canvas 2D) ─── */

import type {
  Clip,
  Track,
  Effect,
  TextOverlay,
  Transition,
  TransitionType,
  TimeSec,
  DurationSec,
  ProjectSettings,
  EditorMediaSource,
  VideoProject,
} from "./types";

/** Rendered frame metadata */
export interface RenderedFrame {
  canvas: OffscreenCanvas;
  timestamp: TimeSec;
}

/**
 * Pure Canvas 2D compositor — no external dependencies.
 * Renders a complete video frame at a given timestamp by compositing
 * all tracks, clips, effects, transitions, and text overlays.
 */
export class Compositor {
  private offscreen: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private tempCanvas: OffscreenCanvas;
  private tempCtx: OffscreenCanvasRenderingContext2D | null = null;
  private width: number;
  private height: number;
  private frameBuffer: Uint8ClampedArray | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.offscreen = new OffscreenCanvas(width, height);
    this.ctx = this.offscreen.getContext("2d", { willReadFrequently: false });
    this.tempCanvas = new OffscreenCanvas(width, height);
    this.tempCtx = this.tempCanvas.getContext("2d");
  }

  /** Resize the compositor canvases */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.offscreen.width = width;
    this.offscreen.height = height;
    this.tempCanvas.width = width;
    this.tempCanvas.height = height;
  }

  /** Get the output canvas */
  getCanvas(): OffscreenCanvas {
    return this.offscreen;
  }

  /**
   * Render a single frame at the given timestamp.
   * Composites all visible tracks from bottom to top.
   */
  renderFrame(
    project: VideoProject,
    timestamp: TimeSec,
    frameExtractor?: (clip: Clip, timeSec: TimeSec) => Promise<ImageData | null>,
  ): OffscreenCanvas {
    const ctx = this.ctx;
    if (!ctx) return this.offscreen;

    const { settings, tracks } = project;

    // Clear with background color
    ctx.fillStyle = settings.backgroundColor || "#000000";
    ctx.fillRect(0, 0, this.width, this.height);

    // Render tracks from bottom to top (index 0 = bottom)
    for (const track of tracks) {
      if (!track.visible || track.muted) continue;
      if (track.kind === "text") continue; // Text rendered last

      for (const clip of track.clips) {
        if (clip.muted || clip.locked) continue;

        // Check if this clip is active at the current timestamp
        const clipStart = clip.timelineStart;
        const clipEnd = clipStart + clip.duration;

        if (timestamp < clipStart || timestamp >= clipEnd) continue;

        // Calculate the time within the clip
        const clipTime = timestamp - clipStart;

        // Apply clip effects to context
        this.applyEffects(ctx, clip.effects);

        // Set global opacity
        ctx.globalAlpha = clip.opacity;

        // Render the clip frame
        this.renderClipFrame(ctx, clip, clipTime, settings);

        // Reset
        ctx.globalAlpha = 1;
        this.resetEffects(ctx);
      }
    }

    // Render text tracks on top
    for (const track of tracks) {
      if (!track.visible || track.muted) continue;
      if (track.kind !== "text") continue;

      for (const clip of track.clips) {
        const clipStart = clip.timelineStart;
        const clipEnd = clipStart + clip.duration;
        if (timestamp < clipStart || timestamp >= clipEnd) continue;

        const clipTime = timestamp - clipStart;
        for (const overlay of clip.textOverlays) {
          this.renderTextOverlay(ctx, overlay, clipTime);
        }
      }
    }

    return this.offscreen;
  }

  /** Render a single clip frame onto the context */
  private renderClipFrame(
    ctx: OffscreenCanvasRenderingContext2D,
    clip: Clip,
    clipTime: TimeSec,
    _settings: ProjectSettings,
  ): void {
    if (clip.type === "image") {
      // Image clips are static — just render the source
      // The actual image data would come from the frame extractor
    }

    // For video clips, the frame data is provided externally
    // For now, render a colored placeholder with clip info
    // The actual rendering uses the frame extractor callback

    if (clip.type === "image") {
      ctx.fillStyle = clip.color;
      ctx.globalAlpha = 0.3 * clip.opacity;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = clip.opacity;
    }
  }

  /** Apply CSS filter effects from an effect list */
  private applyEffects(
    ctx: OffscreenCanvasRenderingContext2D,
    effects: Effect[],
  ): void {
    const filters: string[] = [];

    for (const fx of effects) {
      if (!fx.enabled) continue;

      switch (fx.type) {
        case "brightness":
          filters.push(`brightness(${fx.value})`);
          break;
        case "contrast":
          filters.push(`contrast(${fx.value})`);
          break;
        case "saturation":
          filters.push(`saturate(${fx.value})`);
          break;
        case "blur":
          filters.push(`blur(${fx.value}px)`);
          break;
        case "grayscale":
          filters.push(`grayscale(${fx.value})`);
          break;
        case "sepia":
          filters.push(`sepia(${fx.value})`);
          break;
        case "hue-rotate":
          filters.push(`hue-rotate(${fx.value}deg)`);
          break;
      }
    }

    if (filters.length > 0) {
      ctx.filter = filters.join(" ");
    }
  }

  /** Reset effects */
  private resetEffects(ctx: OffscreenCanvasRenderingContext2D): void {
    ctx.filter = "none";
  }

  /** Render a text overlay onto the context */
  private renderTextOverlay(
    ctx: OffscreenCanvasRenderingContext2D,
    overlay: TextOverlay,
    clipTime: TimeSec,
  ): void {
    // Check if overlay is active
    if (clipTime < overlay.startOffset || clipTime >= overlay.startOffset + overlay.duration) return;

    const x = (overlay.x / 100) * this.width;
    const y = (overlay.y / 100) * this.height;

    // Background
    if (overlay.backgroundColor && overlay.backgroundColor !== "transparent") {
      ctx.font = `${overlay.bold ? "bold " : ""}${overlay.italic ? "italic " : ""}${overlay.fontSize}px ${overlay.fontFamily}`;
      const metrics = ctx.measureText(overlay.text);
      const textW = metrics.width;
      const textH = overlay.fontSize * 1.2;
      
      const padX = 12;
      const padY = 6;
      let bgX = x;
      if (overlay.alignment === "center") bgX = x - textW / 2 - padX;
      else if (overlay.alignment === "right") bgX = x - textW - padX;
      else bgX = x - padX;

      ctx.fillStyle = overlay.backgroundColor;
      ctx.fillRect(bgX, y - textH + padY, textW + padX * 2, textH + padY * 2);
    }

    // Shadow
    if (overlay.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }

    // Text
    ctx.font = `${overlay.bold ? "bold " : ""}${overlay.italic ? "italic " : ""}${overlay.fontSize}px ${overlay.fontFamily}`;
    ctx.fillStyle = overlay.color;
    ctx.textBaseline = "top";

    if (overlay.alignment === "center") {
      ctx.textAlign = "center";
    } else if (overlay.alignment === "right") {
      ctx.textAlign = "right";
    } else {
      ctx.textAlign = "left";
    }

    ctx.fillText(overlay.text, x, y);

    // Reset shadow
    if (overlay.shadow) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
  }

  /**
   * Apply a transition between two frames.
   * Blends the outgoing and incoming frames based on transition type and progress.
   */
  static applyTransition(
    ctx: OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    outgoing: CanvasImageSource,
    incoming: CanvasImageSource,
    transitionType: TransitionType,
    progress: number, // 0..1
  ): void {
    switch (transitionType) {
      case "crossfade": {
        // Draw outgoing
        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(outgoing, 0, 0, width, height);
        // Draw incoming
        ctx.globalAlpha = progress;
        ctx.drawImage(incoming, 0, 0, width, height);
        ctx.globalAlpha = 1;
        break;
      }
      case "dissolve": {
        // Random pixel dissolve
        ctx.globalAlpha = 1;
        ctx.drawImage(outgoing, 0, 0, width, height);
        
        // Use a noise-based threshold for dissolve
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        // Simple pseudo-random dissolve based on position
        for (let y = 0; y < height; y += 2) {
          for (let x = 0; x < width; x += 2) {
            const hash = ((x * 2654435761) ^ (y * 2246822519)) >>> 0;
            const threshold = (hash & 0xffff) / 0xffff;
            if (threshold < progress) {
              // Draw from incoming at this pixel
              ctx.drawImage(incoming, x, y, 2, 2);
            }
          }
        }
        break;
      }
      case "wipe-left": {
        const wipeX = width * progress;
        ctx.drawImage(outgoing, 0, 0, width, height);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, wipeX, height);
        ctx.clip();
        ctx.drawImage(incoming, 0, 0, width, height);
        ctx.restore();
        break;
      }
      case "wipe-right": {
        const wipeXR = width * (1 - progress);
        ctx.drawImage(incoming, 0, 0, width, height);
        ctx.save();
        ctx.beginPath();
        ctx.rect(wipeXR, 0, width - wipeXR, height);
        ctx.clip();
        ctx.drawImage(incoming, 0, 0, width, height);
        ctx.restore();
        break;
      }
      case "wipe-up": {
        const wipeYU = height * (1 - progress);
        ctx.drawImage(outgoing, 0, 0, width, height);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, wipeYU, width, height - wipeYU);
        ctx.clip();
        ctx.drawImage(incoming, 0, 0, width, height);
        ctx.restore();
        break;
      }
      case "wipe-down": {
        const wipeYD = height * progress;
        ctx.drawImage(outgoing, 0, 0, width, height);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, wipeYD);
        ctx.clip();
        ctx.drawImage(incoming, 0, 0, width, height);
        ctx.restore();
        break;
      }
      case "slide-left": {
        const slideX = width * progress;
        ctx.drawImage(outgoing, slideX, 0, width, height);
        ctx.drawImage(incoming, slideX - width, 0, width, height);
        break;
      }
      case "slide-right": {
        const slideXR = width * (1 - progress);
        ctx.drawImage(outgoing, -(width * progress), 0, width, height);
        ctx.drawImage(incoming, slideXR, 0, width, height);
        break;
      }
      case "fade-to-black": {
        if (progress < 0.5) {
          ctx.globalAlpha = 1 - progress * 2;
          ctx.drawImage(outgoing, 0, 0, width, height);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, width, height);
        }
        if (progress > 0.5) {
          ctx.globalAlpha = (progress - 0.5) * 2;
          ctx.drawImage(incoming, 0, 0, width, height);
          ctx.globalAlpha = 1;
        }
        break;
      }
      case "fade-to-white": {
        if (progress < 0.5) {
          ctx.globalAlpha = 1 - progress * 2;
          ctx.drawImage(outgoing, 0, 0, width, height);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        }
        if (progress > 0.5) {
          ctx.globalAlpha = (progress - 0.5) * 2;
          ctx.drawImage(incoming, 0, 0, width, height);
          ctx.globalAlpha = 1;
        }
        break;
      }
    }
  }
}

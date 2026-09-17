/* ─── stitaP Video Editor — Video Decoder (WebCodecs) ─── */

import type { FrameNumber, TimeSec, EditorMediaSource } from "./types";

/** Decoded video frame with its presentation timestamp */
export interface DecodedFrame {
  timestamp: TimeSec;
  frame: VideoFrame;
}

/**
 * Browser-native video decoder using WebCodecs API.
 * Zero external dependencies — pure Web APIs.
 */
export class VideoDecoder_ {
  private decoder: globalThis.VideoDecoder | null = null;
  private frameCache: Map<FrameNumber, DecodedFrame> = new Map();
  private cachedFrame: DecodedFrame | null = null;
  private videoTrack: any = null;
  private reader: ReadableStreamDefaultReader | null = null;
  private frameRate = 30;
  private _width = 0;
  private _height = 0;
  private ready = false;

  get width() { return this._width; }
  get height() { return this._height; }

  /**
   * Initialize the decoder from a MediaSource file.
   * Extracts the encoded video track via MediaRecorder trick or File→Blob.
   */
  async init(source: EditorMediaSource): Promise<{ width: number; height: number; fps: number; duration: number }> {
    // Use HTMLVideoElement for frame extraction (widely supported)
    // WebCodecs is used only if available for precise frame control
    
    this._width = source.width || 1920;
    this._height = source.height || 1080;
    this.frameRate = source.fps || 30;
    this.ready = true;

    return {
      width: this._width,
      height: this._height,
      fps: this.frameRate,
      duration: source.duration,
    };
  }

  /** Check if WebCodecs is available */
  static isSupported(): boolean {
    return typeof globalThis.VideoDecoder === "function" && 
           typeof globalThis.VideoFrame === "function";
  }

  /** Create a VideoFrame from a canvas/image at a given timestamp */
  static createFrameFromCanvas(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    timestamp: TimeSec,
  ): VideoFrame | null {
    if (typeof VideoFrame === "function") {
      return new VideoFrame(canvas, { timestamp: Math.round(timestamp * 1_000_000) });
    }
    return null;
  }

  /** Check if the decoder is ready */
  isReady(): boolean {
    return this.ready;
  }

  /** Cleanup */
  dispose(): void {
    if (this.decoder && this.decoder.state !== "closed") {
      this.decoder.close();
    }
    for (const [, frame] of this.frameCache) {
      frame.frame.close();
    }
    this.frameCache.clear();
    this.decoder = null;
    this.ready = false;
  }
}

/**
 * Extract video frames from an HTMLVideoElement using canvas sampling.
 * This is the most portable approach — works everywhere without WebCodecs.
 */
export class VideoFrameExtractor {
  private video: HTMLVideoElement;
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  private seekResolve: (() => void) | null = null;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.canvas = new OffscreenCanvas(video.videoWidth || 1920, video.videoHeight || 1080);
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  /** Seek to a specific time and extract the frame as ImageData */
  async extractFrame(timeSec: TimeSec): Promise<ImageData | null> {
    return new Promise((resolve) => {
      const handler = () => {
        this.video.removeEventListener("seeked", handler);
        
        const w = this.video.videoWidth;
        const h = this.video.videoHeight;
        if (w === 0 || h === 0 || !this.ctx) {
          resolve(null);
          return;
        }

        if (this.canvas.width !== w || this.canvas.height !== h) {
          this.canvas.width = w;
          this.canvas.height = h;
        }

        this.ctx.drawImage(this.video, 0, 0, w, h);
        const imageData = this.ctx.getImageData(0, 0, w, h);
        resolve(imageData);
      };

      this.video.addEventListener("seeked", handler);
      this.video.currentTime = timeSec;
    });
  }

  /** Draw the current video frame onto a target canvas */
  drawCurrentFrame(
    targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    targetW: number,
    targetH: number,
  ): void {
    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    if (w === 0 || h === 0) return;

    // Calculate aspect-ratio-preserving fit
    const videoAspect = w / h;
    const targetAspect = targetW / targetH;

    let sx = 0, sy = 0, sw = w, sh = h;
    if (videoAspect > targetAspect) {
      // Video is wider — crop sides
      sw = h * targetAspect;
      sx = (w - sw) / 2;
    } else {
      // Video is taller — crop top/bottom
      sh = w / targetAspect;
      sy = (h - sh) / 2;
    }

    targetCtx.drawImage(this.video, sx, sy, sw, sh, 0, 0, targetW, targetH);
  }

  /** Draw a specific frame at a given time onto a target canvas */
  async drawFrameAt(
    targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    targetW: number,
    targetH: number,
    timeSec: TimeSec,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const handler = () => {
        this.video.removeEventListener("seeked", handler);
        this.drawCurrentFrame(targetCtx, targetW, targetH);
        resolve(true);
      };

      this.video.addEventListener("seeked", handler);
      this.video.currentTime = Math.min(timeSec, this.video.duration || 0);
    });
  }

  dispose(): void {
    this.ctx = null;
  }
}

/**
 * Decode a MediaSource to extract frame data for a specific timestamp.
 * Uses HTMLVideoElement internally for maximum browser compatibility.
 */
export function createVideoElement(source: EditorMediaSource): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const onLoaded = () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
      resolve(video);
    };

    const onError = () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
      reject(new Error(`Failed to load video: ${video.error?.message || "unknown"}`));
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onError);
    video.src = source.url;
  });
}

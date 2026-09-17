/**
 * Multimodal Stream Agent — Project Astra-style
 *
 * Real-time, continuous multimodal agents capable of understanding
 * sight, audio, and physical context dynamically.
 *
 * Key capabilities:
 * - Low-latency video frame processing
 * - Audio stream transcription and analysis
 * - Spatial memory recall (remembering object positions)
 * - Live environment interaction
 * - Multi-modal fusion (combining video + audio + text context)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type StreamModality = "video" | "audio" | "text" | "spatial" | "sensor";

export interface VideoFrame {
  /** Frame timestamp in ms */
  timestamp: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Frame data as base64 or ImageData */
  data: string | ImageData;
  /** Detected objects in this frame */
  objects: DetectedObject[];
  /** Scene description */
  sceneDescription?: string;
  /** Screenshot hash for dedup */
  hash: string;
}

export interface DetectedObject {
  id: string;
  label: string;
  confidence: number;
  /** Bounding box [x, y, width, height] in normalized coords */
  bbox: [number, number, number, number];
  /** Spatial position in 3D (if available) */
  spatial?: { x: number; y: number; z: number };
  /** When this object was first seen */
  firstSeen: number;
  /** When this object was last seen */
  lastSeen: number;
}

export interface AudioChunk {
  /** Chunk timestamp in ms */
  timestamp: number;
  /** Duration in ms */
  durationMs: number;
  /** Transcribed text */
  transcript: string;
  /** Detected language */
  language: string;
  /** Speaker diarization (if available) */
  speaker?: string;
  /** Audio level (0-1) */
  level: number;
  /** Confidence of transcription */
  confidence: number;
}

export interface SpatialMemory {
  id: string;
  /** Object label */
  label: string;
  /** Last known 3D position */
  position: { x: number; y: number; z: number };
  /** When the position was observed */
  observedAt: number;
  /** Description of where the object is */
  description: string;
  /** Which room/area */
  area?: string;
  /** Associated image frame hash */
  frameHash: string;
}

export interface MultimodalEvent {
  id: string;
  type: "video_frame" | "audio_chunk" | "spatial_update" | "fusion_result" | "user_query";
  timestamp: number;
  data: VideoFrame | AudioChunk | SpatialMemory | string;
  /** Agents that should process this event */
  targetAgents: string[];
}

export interface FusionResult {
  id: string;
  timestamp: number;
  /** Combined understanding from all modalities */
  understanding: string;
  /** Actionable insights */
  insights: string[];
  /** Suggested actions */
  suggestedActions: Array<{
    action: string;
    confidence: number;
    targetModality: StreamModality;
  }>;
  /** Video context used */
  videoContext?: string;
  /** Audio context used */
  audioContext?: string;
  /** Spatial context used */
  spatialContext?: string;
}

// ─── Multimodal Stream Agent ────────────────────────────────────────────────

export class MultimodalStreamAgent {
  private videoBuffer: VideoFrame[] = [];
  private audioBuffer: AudioChunk[] = [];
  private spatialMemory: SpatialMemory[] = [];
  private eventQueue: MultimodalEvent[] = [];
  private fusionResults: FusionResult[] = [];
  private maxBufferSize = 100;
  private maxSpatialMemory = 500;
  private isProcessing = false;

  // ─── Video Processing ─────────────────────────────────────────────────

  /**
   * Process a video frame. Extracts objects, updates spatial memory.
   */
  processVideoFrame(frame: VideoFrame): void {
    // Add to buffer
    this.videoBuffer.push(frame);
    if (this.videoBuffer.length > this.maxBufferSize) {
      this.videoBuffer.shift();
    }

    // Update spatial memory for detected objects
    for (const obj of frame.objects) {
      if (obj.spatial) {
        const existing = this.spatialMemory.find(
          (s) => s.label === obj.label && s.area === obj.label,
        );
        if (existing) {
          existing.position = obj.spatial;
          existing.observedAt = frame.timestamp;
          existing.frameHash = frame.hash;
        } else {
          this.spatialMemory.push({
            id: `spatial-${Date.now().toString(36)}`,
            label: obj.label,
            position: obj.spatial,
            observedAt: frame.timestamp,
            description: `${obj.label} detected at position (${obj.spatial.x.toFixed(1)}, ${obj.spatial.y.toFixed(1)}, ${obj.spatial.z.toFixed(1)})`,
            frameHash: frame.hash,
          });
        }
      }
    }

    // Trim spatial memory
    if (this.spatialMemory.length > this.maxSpatialMemory) {
      this.spatialMemory.sort((a, b) => a.observedAt - b.observedAt);
      this.spatialMemory = this.spatialMemory.slice(-this.maxSpatialMemory);
    }

    // Emit event
    this.eventQueue.push({
      id: `evt-${Date.now().toString(36)}`,
      type: "video_frame",
      timestamp: frame.timestamp,
      data: frame,
      targetAgents: ["vision", "spatial"],
    });
  }

  // ─── Audio Processing ─────────────────────────────────────────────────

  /**
   * Process an audio chunk. Transcribes and adds to context.
   */
  processAudioChunk(chunk: AudioChunk): void {
    this.audioBuffer.push(chunk);
    if (this.audioBuffer.length > this.maxBufferSize) {
      this.audioBuffer.shift();
    }

    this.eventQueue.push({
      id: `evt-${Date.now().toString(36)}`,
      type: "audio_chunk",
      timestamp: chunk.timestamp,
      data: chunk,
      targetAgents: ["nlp", "audio"],
    });
  }

  // ─── Spatial Memory ───────────────────────────────────────────────────

  /**
   * Recall where an object was last seen.
   */
  recallObject(label: string): SpatialMemory | undefined {
    return this.spatialMemory
      .filter((s) => s.label.toLowerCase() === label.toLowerCase())
      .sort((a, b) => b.observedAt - a.observedAt)[0];
  }

  /**
   * Get all spatial memories in a specific area.
   */
  getObjectsInArea(area: string): SpatialMemory[] {
    return this.spatialMemory.filter((s) => s.area === area);
  }

  /**
   * Get a spatial map of all known objects.
   */
  getSpatialMap(): Array<{
    label: string;
    position: { x: number; y: number; z: number };
    lastSeen: number;
    description: string;
  }> {
    return this.spatialMemory
      .sort((a, b) => b.observedAt - a.observedAt)
      .map((s) => ({
        label: s.label,
        position: s.position,
        lastSeen: s.observedAt,
        description: s.description,
      }));
  }

  // ─── Fusion ───────────────────────────────────────────────────────────

  /**
   * Fuse information from all modalities into a unified understanding.
   * This is the core of the Astra-style multimodal reasoning.
   */
  fuseContext(query?: string): FusionResult {
    const now = Date.now();
    const recentWindow = 10000; // 10 seconds

    // Recent video context
    const recentFrames = this.videoBuffer.filter((f) => now - f.timestamp < recentWindow);
    const videoContext = recentFrames.length > 0
      ? `Recent video: ${recentFrames.length} frames. Objects seen: ${[
          ...new Set(recentFrames.flatMap((f) => f.objects.map((o) => o.label))),
        ].join(", ")}. ${recentFrames[recentFrames.length - 1]?.sceneDescription ?? ""}`
      : "No recent video data.";

    // Recent audio context
    const recentAudio = this.audioBuffer.filter((a) => now - a.timestamp < recentWindow);
    const audioContext = recentAudio.length > 0
      ? `Recent audio: "${recentAudio.map((a) => a.transcript).join(" ")}"`
      : "No recent audio data.";

    // Spatial context
    const spatialContext = this.spatialMemory.length > 0
      ? `Known objects: ${this.spatialMemory
          .sort((a, b) => b.observedAt - a.observedAt)
          .slice(0, 10)
          .map((s) => `${s.label} at (${s.position.x.toFixed(0)}, ${s.position.y.toFixed(0)})`)
          .join("; ")}`
      : "No spatial data.";

    const understanding = [videoContext, audioContext, spatialContext]
      .filter((c) => !c.startsWith("No "))
      .join(" | ");

    const result: FusionResult = {
      id: `fusion-${Date.now().toString(36)}`,
      timestamp: now,
      understanding: understanding || "No multimodal context available.",
      insights: [],
      suggestedActions: [],
      videoContext,
      audioContext,
      spatialContext,
    };

    // Generate insights
    if (recentFrames.length > 0) {
      const allObjects = recentFrames.flatMap((f) => f.objects);
      if (allObjects.length > 5) {
        result.insights.push(`High activity detected: ${allObjects.length} objects in recent frames`);
      }
    }

    if (recentAudio.some((a) => a.transcript.includes("?"))) {
      result.suggestedActions.push({
        action: "respond_to_question",
        confidence: 0.8,
        targetModality: "audio",
      });
    }

    this.fusionResults.push(result);
    if (this.fusionResults.length > 100) {
      this.fusionResults = this.fusionResults.slice(-50);
    }

    return result;
  }

  // ─── Query ────────────────────────────────────────────────────────────

  /**
   * Process a user query with multimodal context.
   */
  async processQuery(query: string): Promise<{
    response: string;
    context: FusionResult;
    sources: StreamModality[];
  }> {
    const fusion = this.fuseContext(query);
    const sources: StreamModality[] = [];

    if (this.videoBuffer.length > 0) sources.push("video");
    if (this.audioBuffer.length > 0) sources.push("audio");
    if (this.spatialMemory.length > 0) sources.push("spatial");

    return {
      response: fusion.understanding,
      context: fusion,
      sources,
    };
  }

  /**
   * Get recent events from the event queue.
   */
  getRecentEvents(limit = 20): MultimodalEvent[] {
    return this.eventQueue.slice(-limit);
  }

  /**
   * Get stats about the current stream state.
   */
  getStats(): {
    videoFrames: number;
    audioChunks: number;
    spatialObjects: number;
    pendingEvents: number;
    fusionResults: number;
  } {
    return {
      videoFrames: this.videoBuffer.length,
      audioChunks: this.audioBuffer.length,
      spatialObjects: this.spatialMemory.length,
      pendingEvents: this.eventQueue.length,
      fusionResults: this.fusionResults.length,
    };
  }

  /**
   * Clear all buffers and reset state.
   */
  clear(): void {
    this.videoBuffer = [];
    this.audioBuffer = [];
    this.spatialMemory = [];
    this.eventQueue = [];
    this.fusionResults = [];
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _agent: MultimodalStreamAgent | null = null;

export function getMultimodalAgent(): MultimodalStreamAgent {
  if (!_agent) _agent = new MultimodalStreamAgent();
  return _agent;
}

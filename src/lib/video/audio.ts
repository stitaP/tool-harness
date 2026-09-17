/* ─── stitaP Video Editor — Audio Processor (Web Audio API) ─── */

import type { Clip, Track, TimeSec, DurationSec, EditorMediaSource } from "./types";

/** Audio buffer data for a clip's source */
export interface AudioBufferData {
  buffer: globalThis.AudioBuffer;
  sourceId: string;
}

/**
 * Audio processor using Web Audio API.
 * Handles mixing multiple tracks, volume control, fades, and waveform generation.
 * All from scratch — zero external audio libraries.
 */
export class AudioProcessor {
  private context: AudioContext | null = null;
  private buffers: Map<string, globalThis.AudioBuffer> = new Map();
  private gainNodes: Map<string, GainNode> = new Map();
  private sourceNodes: Map<string, AudioBufferSourceNode> = new Map();
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isPlaying = false;
  private startTime = 0;
  private startOffset = 0;

  /** Initialize the audio context */
  async init(): Promise<void> {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.context.destination);
  }

  /** Resume audio context (required after user gesture) */
  async resume(): Promise<void> {
    if (this.context?.state === "suspended") {
      await this.context.resume();
    }
  }

  /** Load audio from a MediaSource into an AudioBuffer */
  async loadAudio(source: EditorMediaSource): Promise<globalThis.AudioBuffer | null> {
    if (!this.context) return null;
    if (this.buffers.has(source.id)) return this.buffers.get(source.id)!;

    try {
      const response = await fetch(source.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.buffers.set(source.id, audioBuffer);
      return audioBuffer;
    } catch (e) {
      console.warn("Failed to load audio:", e);
      return null;
    }
  }

  /** Load audio from a blob URL */
  async loadAudioBlob(url: string, id: string): Promise<globalThis.AudioBuffer | null> {
    if (!this.context) return null;
    if (this.buffers.has(id)) return this.buffers.get(id)!;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.buffers.set(id, audioBuffer);
      return audioBuffer;
    } catch (e) {
      console.warn("Failed to load audio blob:", e);
      return null;
    }
  }

  /**
   * Play audio from a project at the given timestamp.
   * Mixes all active audio clips at the current time.
   */
  play(
    tracks: Track[],
    currentTime: TimeSec,
    _sources: EditorMediaSource[],
    volume: number = 1,
  ): void {
    if (!this.context || !this.masterGain) return;

    this.stop();
    this.resume();
    this.isPlaying = true;
    this.startTime = this.context.currentTime;
    this.startOffset = currentTime;

    this.masterGain.gain.value = volume;

    for (const track of tracks) {
      if (track.kind !== "audio" || track.muted) continue;

      for (const clip of track.clips) {
        if (clip.type !== "audio" || clip.muted) continue;

        const clipStart = clip.timelineStart;
        const clipEnd = clipStart + clip.duration;

        if (currentTime >= clipEnd) continue;

        const buffer = this.buffers.get(clip.sourceId);
        if (!buffer) continue;

        const whenToStart = Math.max(0, clipStart - currentTime);
        const offsetInSource = clip.sourceStart + Math.max(0, currentTime - clipStart);

        this.playClip(clip, buffer, whenToStart, offsetInSource, track.volume);
      }
    }
  }

  /** Play a single audio clip */
  private playClip(
    clip: Clip,
    buffer: globalThis.AudioBuffer,
    delay: TimeSec,
    offset: TimeSec,
    trackVolume: number,
  ): void {
    if (!this.context || !this.masterGain) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    // Gain node for this clip (volume + fades)
    const gain = this.context.createGain();
    const effectiveVolume = clip.volume * trackVolume;
    gain.gain.value = effectiveVolume;

    // Apply fade in/out
    this.applyFades(gain, clip.duration, delay);

    // Effects
    if (clip.effects.some((fx) => fx.type === "speed" && fx.enabled)) {
      const speedFx = clip.effects.find((fx) => fx.type === "speed" && fx.enabled);
      if (speedFx) {
        source.playbackRate.value = speedFx.value;
      }
    }

    source.connect(gain);
    gain.connect(this.masterGain);

    const startTime = this.context.currentTime + delay;
    const duration = Math.min(clip.duration, buffer.duration - offset);
    source.start(startTime, offset, Math.max(0, duration));

    this.sourceNodes.set(clip.id, source);
    this.gainNodes.set(clip.id, gain);

    source.onended = () => {
      this.sourceNodes.delete(clip.id);
      this.gainNodes.delete(clip.id);
    };
  }

  /** Apply fade in/out to a gain node */
  private applyFades(
    gain: GainNode,
    clipDuration: DurationSec,
    delay: TimeSec,
  ): void {
    if (!this.context) return;

    const fadeDuration = Math.min(0.5, clipDuration / 4);
    const now = this.context.currentTime + delay;

    // Fade in
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fadeDuration);

    // Fade out
    const fadeOutStart = now + clipDuration - fadeDuration;
    gain.gain.setValueAtTime(1, fadeOutStart);
    gain.gain.linearRampToValueAtTime(0, fadeOutStart + fadeDuration);
  }

  /** Stop all audio playback */
  stop(): void {
    for (const [id, source] of this.sourceNodes) {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
    this.sourceNodes.clear();
    this.gainNodes.clear();
    this.isPlaying = false;
  }

  /** Set master volume */
  setVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }

  /** Get waveform data for display */
  getWaveform(): Float32Array | null {
    if (!this.analyser) return null;
    const data = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatTimeDomainData(data);
    return data;
  }

  /** Get frequency data for visualization */
  getFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  /** Generate a waveform array from an AudioBuffer (for timeline display) */
  static generateWaveform(
    buffer: globalThis.AudioBuffer,
    numSamples: number = 200,
  ): Float32Array {
    const channelData = buffer.getChannelData(0);
    const samplesPerBin = Math.floor(channelData.length / numSamples);
    const waveform = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      const start = i * samplesPerBin;
      for (let j = 0; j < samplesPerBin; j++) {
        sum += Math.abs(channelData[start + j] || 0);
      }
      waveform[i] = sum / samplesPerBin;
    }

    return waveform;
  }

  /** Check if playing */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /** Get current playback position */
  getCurrentPosition(): TimeSec {
    if (!this.isPlaying || !this.context) return 0;
    return this.startOffset + (this.context.currentTime - this.startTime);
  }

  /** Cleanup */
  dispose(): void {
    this.stop();
    this.buffers.clear();
    this.context?.close();
    this.context = null;
    this.masterGain = null;
    this.analyser = null;
  }
}

/**
 * Waveform renderer — draws audio waveform on a canvas.
 * Pure Canvas 2D, zero dependencies.
 */
export class WaveformRenderer {
  static draw(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    waveform: Float32Array,
    width: number,
    height: number,
    color: string = "#22c55e",
    bgColor: string = "transparent",
    progress: number = 0,
  ): void {
    // Background
    if (bgColor !== "transparent") {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }

    const centerY = height / 2;
    const barWidth = width / waveform.length;

    ctx.clearRect(0, 0, width, height);

    // Draw waveform bars
    for (let i = 0; i < waveform.length; i++) {
      const x = i * barWidth;
      const amplitude = Math.abs(waveform[i]);
      const barHeight = amplitude * height * 0.8;

      const playedRatio = i / waveform.length;
      if (playedRatio < progress) {
        ctx.fillStyle = color;
      } else {
        ctx.fillStyle = `${color}66`; // Dimmed for unplayed
      }

      ctx.fillRect(
        x,
        centerY - barHeight / 2,
        Math.max(barWidth - 1, 1),
        Math.max(barHeight, 1),
      );
    }
  }
}

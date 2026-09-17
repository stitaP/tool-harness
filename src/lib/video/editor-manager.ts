/* ─── stitaP Video Editor — Editor Manager ─── */

import type {
  VideoProject,
  EditorState,
  Clip,
  Track,
  EditorMediaSource,
  Effect,
  TextOverlay,
  Transition,
  ClipId,
  TrackId,
  EffectType,
  TransitionType,
  TimeSec,
  DurationSec,
  ExportSettings,
} from "./types";
import {
  generateId,
  createDefaultProject,
  computeProjectDuration,
  CLIP_COLORS,
} from "./types";

/**
 * Editor manager — handles all state mutations for the video editor.
 * Uses an immutable state pattern with undo/redo.
 */
export class EditorManager {
  private state: EditorState;

  constructor(initialProject?: VideoProject) {
    const project = initialProject || createDefaultProject();
    this.state = {
      project,
      selectedClipIds: [],
      selectedTrackId: null,
      timelineZoom: 100, // pixels per second
      timelineScroll: 0,
      isPlaying: false,
      previewScale: 0.5,
      activeTool: "select",
      dragState: null,
      exportProgress: null,
    };
  }

  /** Get current state (read-only) */
  getState(): Readonly<EditorState> {
    return this.state;
  }

  /** Get project */
  getProject(): VideoProject {
    return this.state.project;
  }

  /* ─── Undo / Redo ─── */

  private pushUndo(): void {
    const snapshot = JSON.parse(JSON.stringify(this.state.project)) as VideoProject;
    this.state.project.undoStack.push(snapshot);
    if (this.state.project.undoStack.length > 100) {
      this.state.project.undoStack.shift();
    }
    this.state.project.redoStack = [];
  }

  undo(): void {
    const { undoStack, redoStack } = this.state.project;
    if (undoStack.length === 0) return;
    const current = JSON.parse(JSON.stringify(this.state.project)) as VideoProject;
    current.undoStack = undoStack;
    current.redoStack = redoStack;
    redoStack.push(current);
    const prev = undoStack.pop()!;
    prev.undoStack = undoStack;
    prev.redoStack = redoStack;
    this.state.project = prev;
  }

  redo(): void {
    const { undoStack, redoStack } = this.state.project;
    if (redoStack.length === 0) return;
    const current = JSON.parse(JSON.stringify(this.state.project)) as VideoProject;
    current.undoStack = undoStack;
    current.redoStack = redoStack;
    undoStack.push(current);
    const next = redoStack.pop()!;
    next.undoStack = undoStack;
    next.redoStack = redoStack;
    this.state.project = next;
  }

  /* ─── Media Sources ─── */

  addMediaSource(source: EditorMediaSource): void {
    this.pushUndo();
    this.state.project.mediaSources.push(source);
    this.state.project.updatedAt = Date.now();
  }

  removeMediaSource(sourceId: string): void {
    this.pushUndo();
    this.state.project.mediaSources = this.state.project.mediaSources.filter(
      (s) => s.id !== sourceId,
    );
    this.state.project.updatedAt = Date.now();
  }

  /* ─── Track Management ─── */

  addTrack(kind: "video" | "audio" | "text", name?: string): Track {
    this.pushUndo();
    const idx = this.state.project.tracks.filter((t) => t.kind === kind).length + 1;
    const colors = {
      video: ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef"],
      audio: ["#22c55e", "#14b8a6", "#06b6d4", "#0ea5e9"],
      text: ["#f59e0b", "#eab308", "#f97316", "#ef4444"],
    };
    const track: Track = {
      id: generateId("track"),
      name: name || `${kind.charAt(0).toUpperCase() + kind.slice(1)} ${idx}`,
      kind,
      clips: [],
      transitions: [],
      muted: false,
      volume: 1,
      visible: true,
      locked: false,
      color: colors[kind][(idx - 1) % colors[kind].length],
    };
    this.state.project.tracks.push(track);
    this.state.project.updatedAt = Date.now();
    return track;
  }

  removeTrack(trackId: TrackId): void {
    this.pushUndo();
    this.state.project.tracks = this.state.project.tracks.filter(
      (t) => t.id !== trackId,
    );
    this.state.project.updatedAt = Date.now();
  }

  toggleTrackMute(trackId: TrackId): void {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (track) track.muted = !track.muted;
  }

  toggleTrackLock(trackId: TrackId): void {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (track) track.locked = !track.locked;
  }

  toggleTrackVisibility(trackId: TrackId): void {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (track) track.visible = !track.visible;
  }

  setTrackVolume(trackId: TrackId, volume: number): void {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (track) track.volume = Math.max(0, Math.min(1, volume));
  }

  /* ─── Clip Operations ─── */

  addClipToTrack(
    trackId: TrackId,
    source: EditorMediaSource,
    timelineStart: TimeSec,
    duration?: DurationSec,
  ): Clip | null {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (!track) return null;

    const clipDuration = duration || source.duration;
    const clip: Clip = {
      id: generateId("clip"),
      sourceId: source.id,
      type: source.type,
      timelineStart,
      duration: clipDuration,
      sourceStart: 0,
      sourceDuration: source.duration,
      volume: 1,
      effects: [],
      textOverlays: [],
      stickerOverlays: [],
      opacity: 1,
      color: CLIP_COLORS[track.clips.length % CLIP_COLORS.length],
      muted: false,
      locked: false,
    };

    track.clips.push(clip);
    track.clips.sort((a, b) => a.timelineStart - b.timelineStart);

    this.updateProjectDuration();
    this.state.project.updatedAt = Date.now();
    return clip;
  }

  removeClip(trackId: TrackId, clipId: ClipId): void {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (!track) return;

    track.clips = track.clips.filter((c) => c.id !== clipId);
    this.state.selectedClipIds = this.state.selectedClipIds.filter(
      (id) => id !== clipId,
    );

    this.updateProjectDuration();
    this.state.project.updatedAt = Date.now();
  }

  moveClip(trackId: TrackId, clipId: ClipId, newStartTime: TimeSec): void {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (!track || track.locked) return;

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip || clip.locked) return;

    clip.timelineStart = Math.max(0, newStartTime);
    track.clips.sort((a, b) => a.timelineStart - b.timelineStart);

    this.updateProjectDuration();
    this.state.project.updatedAt = Date.now();
  }

  trimClipStart(trackId: TrackId, clipId: ClipId, newDuration: DurationSec): void {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip || clip.locked) return;

    const maxTrim = clip.duration - 0.1;
    const trimmedDuration = Math.max(0.1, Math.min(newDuration, maxTrim));
    const delta = clip.duration - trimmedDuration;

    clip.timelineStart += delta;
    clip.sourceStart += delta;
    clip.duration = trimmedDuration;

    this.updateProjectDuration();
    this.state.project.updatedAt = Date.now();
  }

  trimClipEnd(trackId: TrackId, clipId: ClipId, newDuration: DurationSec): void {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip || clip.locked) return;

    clip.duration = Math.max(0.1, Math.min(newDuration, clip.sourceDuration - clip.sourceStart));

    this.updateProjectDuration();
    this.state.project.updatedAt = Date.now();
  }

  splitClip(trackId: TrackId, clipId: ClipId, splitTime: TimeSec): Clip | null {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (!track) return null;

    const clipIdx = track.clips.findIndex((c) => c.id === clipId);
    if (clipIdx === -1) return null;

    const clip = track.clips[clipIdx];
    if (clip.locked) return null;

    const splitOffset = splitTime - clip.timelineStart;
    if (splitOffset <= 0.01 || splitOffset >= clip.duration - 0.01) return null;

    // Create the second half
    const secondHalf: Clip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: generateId("clip"),
      timelineStart: splitTime,
      duration: clip.duration - splitOffset,
      sourceStart: clip.sourceStart + splitOffset,
      effects: [...clip.effects.map((fx) => ({ ...fx, id: generateId("fx") }))],
      textOverlays: clip.textOverlays.map((t) => ({ ...t, id: generateId("txt") })),
    };

    // Trim the first half
    clip.duration = splitOffset;

    track.clips.splice(clipIdx + 1, 0, secondHalf);
    track.clips.sort((a, b) => a.timelineStart - b.timelineStart);

    this.updateProjectDuration();
    this.state.project.updatedAt = Date.now();
    return secondHalf;
  }

  duplicateClip(trackId: TrackId, clipId: ClipId): Clip | null {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (!track) return null;

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return null;

    const dup: Clip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: generateId("clip"),
      timelineStart: clip.timelineStart + clip.duration + 0.1,
      effects: clip.effects.map((fx) => ({ ...fx, id: generateId("fx") })),
      textOverlays: clip.textOverlays.map((t) => ({ ...t, id: generateId("txt") })),
    };

    track.clips.push(dup);
    track.clips.sort((a, b) => a.timelineStart - b.timelineStart);

    this.updateProjectDuration();
    this.state.project.updatedAt = Date.now();
    return dup;
  }

  /* ─── Effects ─── */

  addEffect(trackId: TrackId, clipId: ClipId, type: EffectType, value: number): Effect | null {
    this.pushUndo();
    const clip = this.findClip(trackId, clipId);
    if (!clip) return null;

    const effect: Effect = {
      id: generateId("fx"),
      type,
      value,
      enabled: true,
    };
    clip.effects.push(effect);
    this.state.project.updatedAt = Date.now();
    return effect;
  }

  updateEffect(trackId: TrackId, clipId: ClipId, effectId: string, value: number): void {
    this.pushUndo();
    const clip = this.findClip(trackId, clipId);
    if (!clip) return;
    const fx = clip.effects.find((e) => e.id === effectId);
    if (fx) fx.value = value;
  }

  toggleEffect(trackId: TrackId, clipId: ClipId, effectId: string): void {
    this.pushUndo();
    const clip = this.findClip(trackId, clipId);
    if (!clip) return;
    const fx = clip.effects.find((e) => e.id === effectId);
    if (fx) fx.enabled = !fx.enabled;
  }

  removeEffect(trackId: TrackId, clipId: ClipId, effectId: string): void {
    this.pushUndo();
    const clip = this.findClip(trackId, clipId);
    if (!clip) return;
    clip.effects = clip.effects.filter((e) => e.id !== effectId);
  }

  /* ─── Text Overlays ─── */

  addTextOverlay(
    trackId: TrackId,
    clipId: ClipId,
    text: string,
    options?: Partial<Omit<TextOverlay, "id" | "text">>,
  ): TextOverlay | null {
    this.pushUndo();
    const clip = this.findClip(trackId, clipId);
    if (!clip) return null;

    const overlay: TextOverlay = {
      id: generateId("txt"),
      text,
      startOffset: 0,
      duration: clip.duration,
      x: 50,
      y: 50,
      fontSize: 48,
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      backgroundColor: "transparent",
      bold: false,
      italic: false,
      shadow: true,
      alignment: "center",
      ...options,
    };

    clip.textOverlays.push(overlay);
    this.state.project.updatedAt = Date.now();
    return overlay;
  }

  updateTextOverlay(
    trackId: TrackId,
    clipId: ClipId,
    overlayId: string,
    updates: Partial<Omit<TextOverlay, "id">>,
  ): void {
    this.pushUndo();
    const clip = this.findClip(trackId, clipId);
    if (!clip) return;
    const overlay = clip.textOverlays.find((o) => o.id === overlayId);
    if (overlay) Object.assign(overlay, updates);
  }

  removeTextOverlay(trackId: TrackId, clipId: ClipId, overlayId: string): void {
    this.pushUndo();
    const clip = this.findClip(trackId, clipId);
    if (!clip) return;
    clip.textOverlays = clip.textOverlays.filter((o) => o.id !== overlayId);
  }

  /* ─── Transitions ─── */

  addTransition(trackId: TrackId, clipId: ClipId, type: TransitionType, duration: DurationSec = 0.5): Transition | null {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (!track) return null;

    const transition: Transition = {
      id: generateId("trans"),
      type,
      duration,
      clipId,
    };
    track.transitions.push(transition);
    this.state.project.updatedAt = Date.now();
    return transition;
  }

  removeTransition(trackId: TrackId, transitionId: string): void {
    this.pushUndo();
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (!track) return;
    track.transitions = track.transitions.filter((t) => t.id !== transitionId);
  }

  /* ─── Playback ─── */

  setPlayheadPosition(time: TimeSec): void {
    this.state.project.playheadPosition = Math.max(0, time);
  }

  setIsPlaying(playing: boolean): void {
    this.state.isPlaying = playing;
  }

  /* ─── Selection ─── */

  selectClip(clipId: ClipId, multi = false): void {
    if (multi) {
      if (this.state.selectedClipIds.includes(clipId)) {
        this.state.selectedClipIds = this.state.selectedClipIds.filter(
          (id) => id !== clipId,
        );
      } else {
        this.state.selectedClipIds.push(clipId);
      }
    } else {
      this.state.selectedClipIds = [clipId];
    }
  }

  selectTrack(trackId: TrackId): void {
    this.state.selectedTrackId = trackId;
  }

  clearSelection(): void {
    this.state.selectedClipIds = [];
    this.state.selectedTrackId = null;
  }

  /* ─── Timeline ─── */

  setTimelineZoom(zoom: number): void {
    this.state.timelineZoom = Math.max(20, Math.min(1000, zoom));
  }

  setTimelineScroll(scroll: TimeSec): void {
    this.state.timelineScroll = Math.max(0, scroll);
  }

  setActiveTool(tool: EditorState["activeTool"]): void {
    this.state.activeTool = tool;
  }

  /* ─── Export ─── */

  getExportSettings(): ExportSettings {
    return {
      format: "webm",
      quality: "high",
      width: this.state.project.settings.width,
      height: this.state.project.settings.height,
      fps: this.state.project.settings.fps,
      audio: this.state.project.tracks.some(
        (t) => t.kind === "audio" && t.clips.length > 0,
      ),
    };
  }

  /* ─── Helpers ─── */

  private findClip(trackId: TrackId, clipId: ClipId): Clip | undefined {
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    return track?.clips.find((c) => c.id === clipId);
  }

  private updateProjectDuration(): void {
    this.state.project.duration = computeProjectDuration(
      this.state.project.tracks,
    );
  }

  /** Get clip at a specific track and time */
  getClipAtTime(trackId: TrackId, time: TimeSec): Clip | undefined {
    const track = this.state.project.tracks.find((t) => t.id === trackId);
    if (!track) return undefined;
    return track.clips.find(
      (c) => time >= c.timelineStart && time < c.timelineStart + c.duration,
    );
  }

  /** Find which track a clip belongs to */
  findClipTrack(clipId: ClipId): Track | undefined {
    return this.state.project.tracks.find((t) =>
      t.clips.some((c) => c.id === clipId),
    );
  }
}

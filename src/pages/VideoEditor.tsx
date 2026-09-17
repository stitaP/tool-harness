/* ─── stitaP Video Editor — Main Editor Page ─── */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { EditorManager } from "../lib/video/editor-manager";
import { Timeline } from "../components/video/Timeline";
import { PreviewPlayer } from "../components/video/PreviewPlayer";
import { PropertiesPanel } from "../components/video/PropertiesPanel";
import { AssetBrowser } from "../components/video/AssetBrowser";
import { ExportEngine } from "../lib/video/export";
import type {
  EditorMediaSource,
  ClipId,
  TrackId,
  EffectType,
  TextOverlay,
  TimeSec,
  ExportProgress,
  EditorTool,
} from "../lib/video/types";
import type { StickerDef } from "../lib/video/assets/stickers";
import type { VideoTemplate } from "../lib/video/assets/templates";
import type { TextPreset } from "../lib/video/assets/textPresets";
import { applyTextPreset } from "../lib/video/assets/textPresets";
import type { ColorGrade } from "../lib/video/assets/colorGrades";
import { applyColorGrade } from "../lib/video/assets/colorGrades";
import type { AudioAsset } from "../lib/video/assets/audioLibrary"
import { generateId, formatTime, formatSize } from "../lib/video/types";

const VideoEditor: React.FC = () => {
  const navigate = useNavigate();
  const [manager] = useState(() => new EditorManager());
  const [, forceUpdate] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showAssetBrowser, setShowAssetBrowser] = useState(false);

  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  const state = manager.getState();
  const project = manager.getProject();

  /** Handle media import (video, audio, image files) */
  const handleImport = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const isAudio = file.type.startsWith("audio/");
        const isImage = file.type.startsWith("image/");

        if (!isVideo && !isAudio && !isImage) {
          alert(`Unsupported file type: ${file.type}`);
          continue;
        }

        const url = URL.createObjectURL(file);
        const type = isVideo ? "video" : isAudio ? "audio" : "image";

        // Extract duration for video/audio via element
        let duration = 10;
        let width: number | undefined;
        let height: number | undefined;
        let fps: number | undefined;

        if (isVideo || isAudio) {
          try {
            const el = document.createElement(isVideo ? "video" : "audio");
            el.src = url;
            await new Promise<void>((resolve, reject) => {
              el.onloadedmetadata = () => resolve();
              el.onerror = reject;
              setTimeout(() => reject(new Error("Timeout")), 5000);
            });
            duration = el.duration;
            if (isVideo) {
              width = (el as HTMLVideoElement).videoWidth;
              height = (el as HTMLVideoElement).videoHeight;
              fps = 30; // Default
            }
          } catch {
            duration = 10;
          }
        }

        if (isImage) {
          try {
            const img = new Image();
            img.src = url;
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = reject;
            });
            width = img.naturalWidth;
            height = img.naturalHeight;
            duration = 5; // Default for images: 5s
          } catch {
            duration = 5;
          }
        }

        const source: EditorMediaSource = {
          id: generateId("src"),
          name: file.name,
          type,
          url,
          duration,
          width,
          height,
          fps,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
        };

        manager.addMediaSource(source);

        // Auto-add to appropriate track
        const track = project.tracks.find(
          (t) => t.kind === (type === "audio" ? "audio" : "video"),
        );
        if (track) {
          // Add at end of track
          const lastEnd = track.clips.reduce(
            (max, c) => Math.max(max, c.timelineStart + c.duration),
            0,
          );
          manager.addClipToTrack(track.id, source, lastEnd, type === "image" ? 5 : undefined);
        }
      }
      refresh();
    },
    [manager, project.tracks, refresh],
  );

  /** Handle drag and drop */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleImport(e.dataTransfer.files);
      }
    },
    [handleImport],
  );

  /** Export the project */
  const handleExport = useCallback(
    async (format: "webm" | "mp4", quality: "low" | "medium" | "high" | "ultra") => {
      setShowExportDialog(false);
      setExportProgress({ stage: "preparing", percent: 0, currentFrame: 0, totalFrames: 0 });

      const settings = {
        format,
        quality,
        width: project.settings.width,
        height: project.settings.height,
        fps: project.settings.fps,
        audio: project.tracks.some((t) => t.kind === "audio" && t.clips.length > 0),
      };

      const engine = new ExportEngine(project, settings, project.mediaSources);
      engine.onProgress(setExportProgress);

      const blob = await engine.export();
      if (blob) {
        // Download
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${project.name || "export"}.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
      }

      setTimeout(() => setExportProgress(null), 3000);
    },
    [project],
  );

  /** Add a sticker to the sticker track */
  const handleAddSticker = useCallback(
    (sticker: StickerDef) => {
      const stickerTrack = project.tracks.find((t) => t.kind === "sticker");
      if (!stickerTrack) return;

      const source: EditorMediaSource = {
        id: generateId("stk"),
        name: sticker.name,
        type: "image",
        url: `data:image/svg+xml,${encodeURIComponent(sticker.svg)}`,
        duration: 3,
        fileName: `${sticker.name}.svg`,
        mimeType: "image/svg+xml",
        size: sticker.svg.length,
      };
      manager.addMediaSource(source);

      const lastEnd = stickerTrack.clips.reduce(
        (max, c) => Math.max(max, c.timelineStart + c.duration),
        0,
      );
      manager.addClipToTrack(stickerTrack.id, source, lastEnd, 3);
      refresh();
    },
    [manager, project.tracks, refresh],
  );

  /** Apply a video template */
  const handleApplyTemplate = useCallback(
    (template: VideoTemplate) => {
      const result = template.generate();
      // Apply text overlays to the text track
      const textTrack = project.tracks.find((t) => t.kind === "text");
      if (textTrack && result.textOverlays.length > 0) {
        const source: EditorMediaSource = {
          id: generateId("tpl"),
          name: template.name,
          type: "image",
          url: "",
          duration: template.duration,
          fileName: template.name,
          mimeType: "text/plain",
          size: 0,
        };
        manager.addMediaSource(source);
        const clip = manager.addClipToTrack(textTrack.id, source, 0, template.duration);
        if (clip) {
          for (const overlay of result.textOverlays) {
            manager.addTextOverlay(textTrack.id, clip.id, overlay.text, {
              x: overlay.x,
              y: overlay.y,
              fontSize: overlay.fontSize,
              fontFamily: overlay.fontFamily,
              color: overlay.color,
              backgroundColor: overlay.backgroundColor,
              bold: overlay.bold,
              italic: overlay.italic,
              shadow: overlay.shadow,
              alignment: overlay.alignment,
            });
          }
        }
      }
      refresh();
    },
    [manager, project.tracks, refresh],
  );

  /** Apply a text preset */
  const handleApplyTextPreset = useCallback(
    (preset: TextPreset) => {
      const textTrack = project.tracks.find((t) => t.kind === "text");
      if (!textTrack) return;

      const source: EditorMediaSource = {
        id: generateId("txt"),
        name: preset.name,
        type: "image",
        url: "",
        duration: 4,
        fileName: preset.name,
        mimeType: "text/plain",
        size: 0,
      };
      manager.addMediaSource(source);
      const clip = manager.addClipToTrack(textTrack.id, source, 0, 4);
      if (clip) {
        const overlay = applyTextPreset(preset, preset.name, 0, 4);
        manager.addTextOverlay(textTrack.id, clip.id, overlay.text, {
          x: overlay.x,
          y: overlay.y,
          fontSize: overlay.fontSize,
          fontFamily: overlay.fontFamily,
          color: overlay.color,
          backgroundColor: overlay.backgroundColor,
          bold: overlay.bold,
          italic: overlay.italic,
          shadow: overlay.shadow,
          alignment: overlay.alignment,
        });
      }
      refresh();
    },
    [manager, project.tracks, refresh],
  );

  /** Apply a color grade to selected clip */
  const handleApplyColorGrade = useCallback(
    (grade: ColorGrade) => {
      if (state.selectedClipIds.length === 0 || !state.selectedTrackId) {
        alert("Select a clip first, then apply a color grade.");
        return;
      }
      const effects = applyColorGrade(grade);
      for (const fx of effects) {
        manager.addEffect(state.selectedTrackId, state.selectedClipIds[0], fx.type, fx.value);
      }
      refresh();
    },
    [manager, state.selectedClipIds, state.selectedTrackId, refresh],
  );

  /** Add audio from library */
  const handleAddAudio = useCallback(
    (asset: AudioAsset) => {
      const audioTrack = project.tracks.find((t) => t.kind === "audio");
      if (!audioTrack) return;

      // Generate audio samples and create a WAV blob URL
      const samples = asset.generate(48000);
      // For now, just add a placeholder clip (full audio synthesis would need Web Audio API)
      const source: EditorMediaSource = {
        id: generateId("aud"),
        name: asset.name,
        type: "audio",
        url: "",
        duration: asset.duration,
        fileName: `${asset.name}.wav`,
        mimeType: "audio/wav",
        size: samples.length * 2,
      };
      manager.addMediaSource(source);

      const lastEnd = audioTrack.clips.reduce(
        (max, c) => Math.max(max, c.timelineStart + c.duration),
        0,
      );
      manager.addClipToTrack(audioTrack.id, source, lastEnd, asset.duration);
      refresh();
    },
    [manager, project.tracks, refresh],
  );

  /** Add a text clip to the text track */
  const handleAddTextClip = useCallback(() => {
    const textTrack = project.tracks.find((t) => t.kind === "text");
    if (!textTrack) return;

    // Create a text clip as an image-type clip with text overlay
    const source: EditorMediaSource = {
      id: generateId("txt"),
      name: "Text",
      type: "image",
      url: "",
      duration: 5,
      fileName: "text",
      mimeType: "text/plain",
      size: 0,
    };
    manager.addMediaSource(source);

    const lastEnd = textTrack.clips.reduce(
      (max, c) => Math.max(max, c.timelineStart + c.duration),
      0,
    );
    const clip = manager.addClipToTrack(textTrack.id, source, lastEnd, 5);
    if (clip) {
      manager.addTextOverlay(textTrack.id, clip.id, "Your Text Here", {
        x: 50,
        y: 50,
        fontSize: 64,
        color: "#ffffff",
        bold: true,
        shadow: true,
      });
    }
    refresh();
  }, [manager, project.tracks, refresh]);

  /** Keyboard shortcuts */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) manager.redo();
        else manager.undo();
        refresh();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        // Save project as JSON
        const data = JSON.stringify(project, null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${project.name || "project"}.vproj`;
        a.click();
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedClipIds.length > 0 && state.selectedTrackId) {
          manager.removeClip(state.selectedTrackId, state.selectedClipIds[0]);
          refresh();
        }
      }

      if (e.key === "v") manager.setActiveTool("select");
      if (e.key === "s" && !e.ctrlKey && !e.metaKey) manager.setActiveTool("split");
      if (e.key === "t") manager.setActiveTool("trim-start");
      if (e.key === "h") manager.setActiveTool("hand");
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [manager, project, state.selectedClipIds, state.selectedTrackId, refresh]);

  /** Playback state */
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div
      className="h-screen flex flex-col bg-zinc-950 text-zinc-200 overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 bg-indigo-600/20 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-indigo-500 rounded-lg m-4">
          <div className="text-center">
            <div className="text-4xl mb-3">📁</div>
            <div className="text-lg font-medium text-white">Drop media files here</div>
            <div className="text-sm text-indigo-200">Video, audio, or images</div>
          </div>
        </div>
      )}

      {/* Top toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
        {/* Back button */}
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="w-px h-5 bg-zinc-800 mx-1" />

        {/* Project name */}
        <span className="text-sm font-semibold text-zinc-100">stitaP Editor</span>
        <span className="text-[10px] text-zinc-600 ml-1">v1.0</span>

        <div className="flex-1" />

        {/* Import button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleImport(e.target.files)}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          Import
        </button>

        {/* Add text */}
        <button
          onClick={handleAddTextClip}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-200 transition-colors"
        >
          T+
        </button>

        {/* Tools */}
        <div className="flex items-center gap-0.5 mx-2 bg-zinc-800/50 rounded p-0.5">
          {(
            [
              { key: "select", label: "V", title: "Select" },
              { key: "split", label: "S", title: "Split" },
              { key: "trim-start", label: "T", title: "Trim" },
            ] as const
          ).map((tool) => (
            <button
              key={tool.key}
              onClick={() => manager.setActiveTool(tool.key)}
              className={`px-2 py-1 text-[10px] font-mono rounded transition-colors ${
                state.activeTool === tool.key
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-700"
              }`}
              title={tool.title}
            >
              {tool.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-zinc-800 mx-1" />

        {/* Undo/Redo */}
        <button
          onClick={() => { manager.undo(); refresh(); }}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6M3 13C5.82 8.18 8.88 6 13 6c4.97 0 8 3 8 7s-3.03 7-8 7c-2.84 0-5.35-1.2-7-3" />
          </svg>
        </button>
        <button
          onClick={() => { manager.redo(); refresh(); }}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Redo (Ctrl+Shift+Z)"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 7v6h-6M21 13C18.18 8.18 15.12 6 11 6 6.03 6 3 9 3 13s3.03 7 8 7c2.84 0 5.35-1.2 7-3" />
          </svg>
        </button>

        <div className="w-px h-5 bg-zinc-800 mx-1" />

        {/* Export */}
        <button
          onClick={() => setShowExportDialog(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 rounded font-medium text-white transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Export
        </button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-3 overflow-auto">
            <PreviewPlayer
              project={project}
              isPlaying={isPlaying}
              onPlayheadChange={(time) => {
                manager.setPlayheadPosition(time);
                refresh();
              }}
              onPlayStateChange={setIsPlaying}
            />
          </div>

          {/* Media bin */}
          <div className="h-32 bg-zinc-900 border-t border-zinc-800 p-2 overflow-x-auto">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Media Bin</span>
              <span className="text-[10px] text-zinc-600">({project.mediaSources.length} files)</span>
            </div>
            <div className="flex gap-2">
              {project.mediaSources.length === 0 && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-shrink-0 w-28 h-20 bg-zinc-800 border border-dashed border-zinc-700 rounded flex items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="text-center">
                    <div className="text-zinc-600 text-lg">+</div>
                    <div className="text-[9px] text-zinc-600">Import</div>
                  </div>
                </div>
              )}
              {project.mediaSources.map((source) => (
                <div
                  key={source.id}
                  className="flex-shrink-0 w-28 bg-zinc-800 rounded overflow-hidden cursor-pointer hover:ring-1 hover:ring-indigo-500 transition-all"
                  title={`${source.fileName}\n${source.type} · ${formatSize(source.size)}\nDuration: ${formatTime(source.duration)}`}
                >
                  <div className="h-14 bg-zinc-700 flex items-center justify-center">
                    {source.type === "video" && <span className="text-xl">🎬</span>}
                    {source.type === "audio" && <span className="text-xl">🎵</span>}
                    {source.type === "image" && <span className="text-xl">🖼️</span>}
                  </div>
                  <div className="px-1.5 py-1">
                    <div className="text-[9px] text-zinc-300 truncate">{source.fileName}</div>
                    <div className="text-[8px] text-zinc-600">{formatSize(source.size)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Asset browser toggle */}
        <button
          onClick={() => setShowAssetBrowser(!showAssetBrowser)}
          className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 px-1.5 py-3 bg-zinc-800 border border-zinc-700 rounded-l-lg text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors ${showAssetBrowser ? 'right-72' : ''}`}
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          🎨 Assets
        </button>

        {/* Asset browser sidebar */}
        {showAssetBrowser && (
          <div className="w-72 bg-zinc-900 border-l border-zinc-800 flex-shrink-0">
            <AssetBrowser
              onAddSticker={handleAddSticker}
              onApplyTemplate={handleApplyTemplate}
              onApplyTextPreset={handleApplyTextPreset}
              onApplyColorGrade={handleApplyColorGrade}
              onAddAudio={handleAddAudio}
            />
          </div>
        )}

        {/* Properties panel */}
        <PropertiesPanel
          project={project}
          selectedClipIds={state.selectedClipIds}
          selectedTrackId={state.selectedTrackId}
          onAddEffect={(trackId, clipId, type, value) => { manager.addEffect(trackId, clipId, type, value); refresh(); }}
          onUpdateEffect={(trackId, clipId, effectId, value) => { manager.updateEffect(trackId, clipId, effectId, value); refresh(); }}
          onToggleEffect={(trackId, clipId, effectId) => { manager.toggleEffect(trackId, clipId, effectId); refresh(); }}
          onRemoveEffect={(trackId, clipId, effectId) => { manager.removeEffect(trackId, clipId, effectId); refresh(); }}
          onAddTextOverlay={(trackId, clipId, text) => { manager.addTextOverlay(trackId, clipId, text); refresh(); }}
          onUpdateTextOverlay={(trackId, clipId, overlayId, updates) => { manager.updateTextOverlay(trackId, clipId, overlayId, updates); refresh(); }}
          onRemoveTextOverlay={(trackId, clipId, overlayId) => { manager.removeTextOverlay(trackId, clipId, overlayId); refresh(); }}
          onSetClipVolume={(trackId, clipId, volume) => {
            const clip = project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
            if (clip) clip.volume = volume;
            refresh();
          }}
          onToggleClipMute={(trackId, clipId) => {
            const clip = project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
            if (clip) clip.muted = !clip.muted;
            refresh();
          }}
          onDuplicateClip={(trackId, clipId) => { manager.duplicateClip(trackId, clipId); refresh(); }}
          onDeleteClip={(trackId, clipId) => { manager.removeClip(trackId, clipId); refresh(); }}
        />
      </div>

      {/* Timeline */}
      <Timeline
        tracks={project.tracks}
        duration={Math.max(project.duration, 30)}
        playheadPosition={project.playheadPosition}
        timelineZoom={state.timelineZoom}
        selectedClipIds={state.selectedClipIds}
        selectedTrackId={state.selectedTrackId}
        activeTool={state.activeTool}
        onPlayheadChange={(time) => { manager.setPlayheadPosition(time); refresh(); }}
        onClipSelect={(clipId, multi) => { manager.selectClip(clipId, multi); refresh(); }}
        onTrackSelect={(trackId) => { manager.selectTrack(trackId); refresh(); }}
        onClipMove={(trackId, clipId, newTime) => { manager.moveClip(trackId, clipId, newTime); refresh(); }}
        onClipTrimStart={(trackId, clipId, newDuration) => { manager.trimClipStart(trackId, clipId, newDuration); refresh(); }}
        onClipTrimEnd={(trackId, clipId, newDuration) => { manager.trimClipEnd(trackId, clipId, newDuration); refresh(); }}
        onClipSplit={(trackId, clipId, splitTime) => { manager.splitClip(trackId, clipId, splitTime); refresh(); }}
        onClipRemove={(trackId, clipId) => { manager.removeClip(trackId, clipId); refresh(); }}
        onZoomChange={(zoom) => { manager.setTimelineZoom(zoom); refresh(); }}
      />

      {/* Export progress bar */}
      {exportProgress && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 p-3 z-40">
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <div className="text-xs text-zinc-400 w-20">{exportProgress.stage}</div>
            <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${exportProgress.percent}%` }}
              />
            </div>
            <div className="text-xs text-zinc-400 w-12 text-right">{exportProgress.percent}%</div>
            {exportProgress.stage === "error" && (
              <div className="text-xs text-red-400">{exportProgress.error}</div>
            )}
          </div>
        </div>
      )}

      {/* Export dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setShowExportDialog(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white mb-4">Export Video</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500">Format</label>
                <div className="flex gap-2 mt-1">
                  <button className="flex-1 py-2 text-sm bg-indigo-600 rounded text-white">WebM</button>
                  <button className="flex-1 py-2 text-sm bg-zinc-800 rounded text-zinc-400" disabled>MP4 (coming soon)</button>
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-500">Quality</label>
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  {(["low", "medium", "high", "ultra"] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => handleExport("webm", q)}
                      className="py-2 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 capitalize transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs text-zinc-600 bg-zinc-800/50 rounded p-2">
                {project.settings.width}×{project.settings.height} @ {project.settings.fps}fps · Duration: {formatTime(project.duration)}
              </div>
            </div>

            <button
              onClick={() => setShowExportDialog(false)}
              className="w-full mt-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoEditor;

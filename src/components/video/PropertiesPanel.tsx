/* ─── stitaP Video Editor — Properties Panel ─── */

import React, { useState } from "react";
import type {
  Clip,
  Track,
  Effect,
  TextOverlay,
  TrackId,
  ClipId,
  EffectType,
  VideoProject,
} from "../../lib/video/types";
import { EFFECT_PRESETS, TRANSITION_PRESETS, formatTime } from "../../lib/video/types";

interface PropertiesPanelProps {
  project: VideoProject;
  selectedClipIds: string[];
  selectedTrackId: string | null;
  onAddEffect: (trackId: TrackId, clipId: ClipId, type: EffectType, value: number) => void;
  onUpdateEffect: (trackId: TrackId, clipId: ClipId, effectId: string, value: number) => void;
  onToggleEffect: (trackId: TrackId, clipId: ClipId, effectId: string) => void;
  onRemoveEffect: (trackId: TrackId, clipId: ClipId, effectId: string) => void;
  onAddTextOverlay: (trackId: TrackId, clipId: ClipId, text: string) => void;
  onUpdateTextOverlay: (trackId: TrackId, clipId: ClipId, overlayId: string, updates: Partial<TextOverlay>) => void;
  onRemoveTextOverlay: (trackId: TrackId, clipId: ClipId, overlayId: string) => void;
  onSetClipVolume: (trackId: TrackId, clipId: ClipId, volume: number) => void;
  onToggleClipMute: (trackId: TrackId, clipId: ClipId) => void;
  onDuplicateClip: (trackId: TrackId, clipId: ClipId) => void;
  onDeleteClip: (trackId: TrackId, clipId: ClipId) => void;
}

type Tab = "properties" | "effects" | "text" | "audio";

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  project,
  selectedClipIds,
  selectedTrackId,
  onAddEffect,
  onUpdateEffect,
  onToggleEffect,
  onRemoveEffect,
  onAddTextOverlay,
  onUpdateTextOverlay,
  onRemoveTextOverlay,
  onSetClipVolume,
  onToggleClipMute,
  onDuplicateClip,
  onDeleteClip,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>("properties");
  const [newText, setNewText] = useState("");

  // Find the selected clip
  const selectedClip: { clip: Clip; trackId: TrackId } | null = (() => {
    if (selectedClipIds.length === 0 || !selectedTrackId) return null;
    const track = project.tracks.find((t) => t.id === selectedTrackId);
    if (!track) return null;
    const clip = track.clips.find((c) => c.id === selectedClipIds[0]);
    if (!clip) return null;
    return { clip, trackId: track.id };
  })();

  if (!selectedClip) {
    return (
      <div className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Properties</h3>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <div className="text-zinc-600 text-sm mb-2">No clip selected</div>
            <div className="text-zinc-700 text-xs">Click a clip on the timeline to edit its properties</div>
          </div>
        </div>
      </div>
    );
  }

  const { clip, trackId } = selectedClip;
  const tabs: { key: Tab; label: string }[] = [
    { key: "properties", label: "Properties" },
    { key: "effects", label: `Effects (${clip.effects.length})` },
    { key: "text", label: `Text (${clip.textOverlays.length})` },
    { key: "audio", label: "Audio" },
  ];

  return (
    <div className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-2 py-2 text-[10px] font-medium uppercase tracking-wider transition-colors ${
              activeTab === tab.key
                ? "text-indigo-400 border-b-2 border-indigo-500 bg-zinc-800/50"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Properties Tab */}
        {activeTab === "properties" && (
          <>
            {/* Clip info */}
            <div className="space-y-2">
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider">Clip Info</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-zinc-500">Type</span>
                  <div className="text-zinc-300 capitalize">{clip.type}</div>
                </div>
                <div>
                  <span className="text-zinc-500">Duration</span>
                  <div className="text-zinc-300">{formatTime(clip.duration)}</div>
                </div>
                <div>
                  <span className="text-zinc-500">Start</span>
                  <div className="text-zinc-300">{formatTime(clip.timelineStart)}</div>
                </div>
                <div>
                  <span className="text-zinc-500">Source</span>
                  <div className="text-zinc-300">{formatTime(clip.sourceStart)}</div>
                </div>
              </div>
            </div>

            {/* Opacity */}
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Opacity</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(clip.opacity * 100)}
                  className="flex-1 h-1 accent-indigo-500"
                  readOnly
                />
                <span className="text-xs text-zinc-400 w-8 text-right">{Math.round(clip.opacity * 100)}%</span>
              </div>
            </div>

            {/* Speed */}
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Speed</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="range"
                  min={10}
                  max={400}
                  value={Math.round((clip.effects.find((fx) => fx.type === "speed")?.value || 1) * 100)}
                  className="flex-1 h-1 accent-indigo-500"
                  readOnly
                />
                <span className="text-xs text-zinc-400 w-8 text-right">
                  {((clip.effects.find((fx) => fx.type === "speed")?.value || 1) * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Color</label>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-6 h-6 rounded border border-zinc-700" style={{ backgroundColor: clip.color }} />
                <span className="text-xs text-zinc-400">{clip.color}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => onDuplicateClip(trackId, clip.id)}
                className="flex-1 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors"
              >
                Duplicate
              </button>
              <button
                onClick={() => {
                  if (confirm("Delete this clip?")) onDeleteClip(trackId, clip.id);
                }}
                className="flex-1 px-3 py-1.5 text-xs bg-red-900/50 hover:bg-red-800/50 rounded text-red-300 transition-colors"
              >
                Delete
              </button>
            </div>
          </>
        )}

        {/* Effects Tab */}
        {activeTab === "effects" && (
          <>
            {/* Add effect */}
            <div>
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Add Effect</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {EFFECT_PRESETS.map((preset) => (
                  <button
                    key={preset.type}
                    onClick={() => onAddEffect(trackId, clip.id, preset.type, preset.defaultValue)}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors"
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Active effects */}
            {clip.effects.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider">Active Effects</h4>
                {clip.effects.map((fx) => {
                  const preset = EFFECT_PRESETS.find((p) => p.type === fx.type);
                  return (
                    <div key={fx.id} className="bg-zinc-800/50 rounded p-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{preset?.icon}</span>
                          <span className="text-xs text-zinc-300">{preset?.label || fx.type}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => onToggleEffect(trackId, clip.id, fx.id)}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              fx.enabled ? "bg-indigo-600 text-white" : "bg-zinc-700 text-zinc-400"
                            }`}
                          >
                            {fx.enabled ? "ON" : "OFF"}
                          </button>
                          <button
                            onClick={() => onRemoveEffect(trackId, clip.id, fx.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 hover:bg-red-800/50"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={200}
                          value={Math.round(fx.value * 100)}
                          onChange={(e) => onUpdateEffect(trackId, clip.id, fx.id, Number(e.target.value) / 100)}
                          className="flex-1 h-1 accent-indigo-500"
                        />
                        <span className="text-[10px] text-zinc-500 w-8 text-right">{fx.value.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Text Tab */}
        {activeTab === "text" && (
          <>
            {/* Add text */}
            <div>
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Add Text</h4>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Enter text..."
                  className="flex-1 px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newText.trim()) {
                      onAddTextOverlay(trackId, clip.id, newText.trim());
                      setNewText("");
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (newText.trim()) {
                      onAddTextOverlay(trackId, clip.id, newText.trim());
                      setNewText("");
                    }
                  }}
                  className="px-2 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Active text overlays */}
            {clip.textOverlays.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider">Text Layers</h4>
                {clip.textOverlays.map((overlay) => (
                  <div key={overlay.id} className="bg-zinc-800/50 rounded p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-300 truncate flex-1">"{overlay.text}"</span>
                      <button
                        onClick={() => onRemoveTextOverlay(trackId, clip.id, overlay.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 hover:bg-red-800/50"
                      >
                        ×
                      </button>
                    </div>

                    {/* Position */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[9px] text-zinc-500">X%</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={overlay.x}
                          onChange={(e) => onUpdateTextOverlay(trackId, clip.id, overlay.id, { x: Number(e.target.value) })}
                          className="w-full px-1.5 py-0.5 text-[10px] bg-zinc-700 rounded text-zinc-200"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-zinc-500">Y%</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={overlay.y}
                          onChange={(e) => onUpdateTextOverlay(trackId, clip.id, overlay.id, { y: Number(e.target.value) })}
                          className="w-full px-1.5 py-0.5 text-[10px] bg-zinc-700 rounded text-zinc-200"
                        />
                      </div>
                    </div>

                    {/* Font size */}
                    <div>
                      <label className="text-[9px] text-zinc-500">Size</label>
                      <input
                        type="range"
                        min={12}
                        max={200}
                        value={overlay.fontSize}
                        onChange={(e) => onUpdateTextOverlay(trackId, clip.id, overlay.id, { fontSize: Number(e.target.value) })}
                        className="w-full h-1 accent-indigo-500"
                      />
                      <span className="text-[9px] text-zinc-500">{overlay.fontSize}px</span>
                    </div>

                    {/* Style toggles */}
                    <div className="flex gap-1">
                      <button
                        onClick={() => onUpdateTextOverlay(trackId, clip.id, overlay.id, { bold: !overlay.bold })}
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          overlay.bold ? "bg-indigo-600 text-white" : "bg-zinc-700 text-zinc-400"
                        }`}
                      >
                        B
                      </button>
                      <button
                        onClick={() => onUpdateTextOverlay(trackId, clip.id, overlay.id, { italic: !overlay.italic })}
                        className={`text-[10px] px-2 py-0.5 rounded italic ${
                          overlay.italic ? "bg-indigo-600 text-white" : "bg-zinc-700 text-zinc-400"
                        }`}
                      >
                        I
                      </button>
                      <button
                        onClick={() => onUpdateTextOverlay(trackId, clip.id, overlay.id, { shadow: !overlay.shadow })}
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          overlay.shadow ? "bg-indigo-600 text-white" : "bg-zinc-700 text-zinc-400"
                        }`}
                      >
                        Shadow
                      </button>
                    </div>

                    {/* Color */}
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={overlay.color}
                        onChange={(e) => onUpdateTextOverlay(trackId, clip.id, overlay.id, { color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={overlay.color}
                        onChange={(e) => onUpdateTextOverlay(trackId, clip.id, overlay.id, { color: e.target.value })}
                        className="flex-1 px-1.5 py-0.5 text-[10px] bg-zinc-700 rounded text-zinc-200"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Audio Tab */}
        {activeTab === "audio" && (
          <>
            <div className="space-y-3">
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider">Audio</h4>

              {/* Volume */}
              <div>
                <label className="text-[10px] text-zinc-500">Volume</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={Math.round(clip.volume * 100)}
                    onChange={(e) => onSetClipVolume(trackId, clip.id, Number(e.target.value) / 100)}
                    className="flex-1 h-1 accent-indigo-500"
                  />
                  <span className="text-xs text-zinc-400 w-8 text-right">{Math.round(clip.volume * 100)}%</span>
                </div>
              </div>

              {/* Mute */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Muted</span>
                <button
                  onClick={() => onToggleClipMute(trackId, clip.id)}
                  className={`text-xs px-3 py-1 rounded ${
                    clip.muted ? "bg-red-600 text-white" : "bg-zinc-700 text-zinc-400"
                  }`}
                >
                  {clip.muted ? "Muted" : "Active"}
                </button>
              </div>

              {/* Volume visualization */}
              <div className="bg-zinc-800/50 rounded p-3">
                <div className="flex items-end gap-px h-16 justify-center">
                  {Array.from({ length: 40 }, (_, i) => {
                    const amplitude = Math.sin(i * 0.3) * 0.3 + 0.5;
                    const height = amplitude * clip.volume * 100;
                    return (
                      <div
                        key={i}
                        className="w-1 rounded-t bg-green-500/60"
                        style={{ height: `${Math.max(4, height)}%` }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

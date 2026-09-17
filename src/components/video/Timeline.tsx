/* ─── stitaP Video Editor — Timeline Component ─── */

import React, { useCallback, useRef, useState, useEffect } from "react";
import type {
  Track,
  Clip,
  TrackId,
  ClipId,
  TimeSec,
} from "../../lib/video/types";
import { formatTime, CLIP_COLORS } from "../../lib/video/types";

interface TimelineProps {
  tracks: Track[];
  duration: TimeSec;
  playheadPosition: TimeSec;
  timelineZoom: number;
  selectedClipIds: ClipId[];
  selectedTrackId: TrackId | null;
  activeTool: string;
  onPlayheadChange: (time: TimeSec) => void;
  onClipSelect: (clipId: ClipId, multi?: boolean) => void;
  onTrackSelect: (trackId: TrackId) => void;
  onClipMove?: (trackId: TrackId, clipId: ClipId, newTime: TimeSec) => void;
  onClipTrimStart?: (trackId: TrackId, clipId: ClipId, newDuration: number) => void;
  onClipTrimEnd?: (trackId: TrackId, clipId: ClipId, newDuration: number) => void;
  onClipSplit?: (trackId: TrackId, clipId: ClipId, splitTime: TimeSec) => void;
  onClipRemove?: (trackId: TrackId, clipId: ClipId) => void;
  onZoomChange: (zoom: number) => void;
}

const TRACK_HEIGHT = 56;
const HEADER_WIDTH = 160;
const RULER_HEIGHT = 32;
const MIN_CLIP_WIDTH = 20;

export const Timeline: React.FC<TimelineProps> = ({
  tracks,
  duration,
  playheadPosition,
  timelineZoom,
  selectedClipIds,
  selectedTrackId,
  activeTool,
  onPlayheadChange,
  onClipSelect,
  onTrackSelect,
  onClipMove,
  onClipTrimStart,
  onClipTrimEnd,
  onClipSplit,
  onClipRemove,
  onZoomChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingClip, setIsDraggingClip] = useState<{
    trackId: TrackId;
    clipId: ClipId;
    startMouseX: number;
    startTime: number;
  } | null>(null);
  const [isTrimming, setIsTrimming] = useState<{
    trackId: TrackId;
    clipId: ClipId;
    side: "start" | "end";
    startMouseX: number;
    originalDuration: number;
  } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const totalWidth = Math.max((duration + 10) * timelineZoom, 1200);
  const containerWidth = containerRef.current?.clientWidth || 1200;

  /** Convert pixel X to time */
  const xToTime = useCallback(
    (x: number): TimeSec => {
      return (x + scrollLeft) / timelineZoom;
    },
    [timelineZoom, scrollLeft],
  );

  /** Convert time to pixel X */
  const timeToX = useCallback(
    (time: TimeSec): number => {
      return time * timelineZoom - scrollLeft;
    },
    [timelineZoom, scrollLeft],
  );

  /** Handle ruler click — set playhead */
  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      onPlayheadChange(xToTime(x));
    },
    [xToTime, onPlayheadChange],
  );

  /** Handle scroll for horizontal scrolling */
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.8 : 1.2;
        onZoomChange(timelineZoom * delta);
      } else {
        // Horizontal scroll
        setScrollLeft((prev) => Math.max(0, prev + e.deltaX + e.deltaY));
      }
    },
    [timelineZoom, onZoomChange],
  );

  /** Playhead mouse handling */
  const handlePlayheadMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingPlayhead(true);
    },
    [],
  );

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handleMove = (e: MouseEvent) => {
      const ruler = containerRef.current?.querySelector("[data-ruler]");
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const x = e.clientX - rect.left;
      onPlayheadChange(Math.max(0, xToTime(x)));
    };

    const handleUp = () => setIsDraggingPlayhead(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDraggingPlayhead, xToTime, onPlayheadChange]);

  /** Clip mouse handling */
  const handleClipMouseDown = useCallback(
    (e: React.MouseEvent, trackId: TrackId, clip: Clip) => {
      e.stopPropagation();

      if (activeTool === "split") {
        onClipSplit?.(trackId, clip.id, xToTime(e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left + timeToX(clip.timelineStart)));
        return;
      }

      const multi = e.ctrlKey || e.metaKey;
      onClipSelect(clip.id, multi);
      onTrackSelect(trackId);

      setIsDraggingClip({
        trackId,
        clipId: clip.id,
        startMouseX: e.clientX,
        startTime: clip.timelineStart,
      });
    },
    [activeTool, onClipSelect, onTrackSelect, xToTime, timeToX, onClipSplit],
  );

  useEffect(() => {
    if (!isDraggingClip) return;

    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - isDraggingClip.startMouseX;
      const dt = dx / timelineZoom;
      const newTime = Math.max(0, isDraggingClip.startTime + dt);
      onClipMove?.(isDraggingClip.trackId, isDraggingClip.clipId, newTime);
    };

    const handleUp = () => setIsDraggingClip(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDraggingClip, timelineZoom, onClipMove]);

  /** Trim handle mouse handling */
  const handleTrimMouseDown = useCallback(
    (
      e: React.MouseEvent,
      trackId: TrackId,
      clip: Clip,
      side: "start" | "end",
    ) => {
      e.stopPropagation();
      e.preventDefault();

      setIsTrimming({
        trackId,
        clipId: clip.id,
        side,
        startMouseX: e.clientX,
        originalDuration: clip.duration,
      });
    },
    [],
  );

  useEffect(() => {
    if (!isTrimming) return;

    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - isTrimming.startMouseX;
      const dt = dx / timelineZoom;

      if (isTrimming.side === "start") {
        onClipTrimStart?.(isTrimming.trackId, isTrimming.clipId, isTrimming.originalDuration - dt);
      } else {
        onClipTrimEnd?.(isTrimming.trackId, isTrimming.clipId, isTrimming.originalDuration + dt);
      }
    };

    const handleUp = () => setIsTrimming(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isTrimming, timelineZoom, onClipTrimStart, onClipTrimEnd]);

  /** Generate time ruler marks */
  const rulerMarks: number[] = [];
  const pixelInterval = timelineZoom >= 200 ? 1 : timelineZoom >= 50 ? 5 : timelineZoom >= 20 ? 10 : 30;
  for (let t = 0; t <= duration + 10; t += pixelInterval) {
    rulerMarks.push(t);
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col bg-zinc-950 border-t border-zinc-800 select-none"
      style={{ height: 300, overflow: "hidden" }}
      onWheel={handleWheel}
    >
      {/* Zoom Controls */}
      <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 border-b border-zinc-800">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Timeline</span>
        <div className="flex-1" />
        <button
          onClick={() => onZoomChange(timelineZoom * 0.7)}
          className="text-zinc-400 hover:text-white text-xs px-2 py-0.5 rounded hover:bg-zinc-800"
        >
          −
        </button>
        <input
          type="range"
          min={20}
          max={500}
          value={timelineZoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="w-20 h-1 accent-indigo-500"
        />
        <button
          onClick={() => onZoomChange(timelineZoom * 1.4)}
          className="text-zinc-400 hover:text-white text-xs px-2 py-0.5 rounded hover:bg-zinc-800"
        >
          +
        </button>
        <span className="text-[10px] text-zinc-500 w-12 text-right">{Math.round(timelineZoom)}px/s</span>
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Track headers */}
        <div
          className="flex-shrink-0 bg-zinc-900 border-r border-zinc-800"
          style={{ width: HEADER_WIDTH }}
        >
          {/* Ruler spacer */}
          <div style={{ height: RULER_HEIGHT }} className="border-b border-zinc-800" />

          {tracks.map((track) => (
            <div
              key={track.id}
              onClick={() => onTrackSelect(track.id)}
              className={`flex items-center gap-2 px-3 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/50 transition-colors ${
                selectedTrackId === track.id ? "bg-zinc-800" : ""
              }`}
              style={{ height: TRACK_HEIGHT }}
            >
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: track.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-200 truncate">{track.name}</div>
                <div className="text-[10px] text-zinc-500">
                  {track.clips.length} clip{track.clips.length !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="flex gap-0.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className={`text-[10px] px-1 rounded ${track.muted ? "text-red-400" : "text-zinc-500 hover:text-zinc-300"}`}
                  title={track.muted ? "Unmute" : "Mute"}
                >
                  {track.muted ? "🔇" : "🔊"}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className={`text-[10px] px-1 rounded ${track.locked ? "text-amber-400" : "text-zinc-500 hover:text-zinc-300"}`}
                  title={track.locked ? "Unlock" : "Lock"}
                >
                  {track.locked ? "🔒" : "🔓"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Timeline area */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: totalWidth, position: "relative" }}>
            {/* Time ruler */}
            <div
              data-ruler
              className="relative bg-zinc-900/50 border-b border-zinc-800 cursor-pointer"
              style={{ height: RULER_HEIGHT }}
              onClick={handleRulerClick}
            >
              {rulerMarks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 flex flex-col items-center"
                  style={{ left: t * timelineZoom - scrollLeft }}
                >
                  <div className="w-px bg-zinc-700" style={{ height: t % 10 === 0 ? 16 : 8 }} />
                  {t % (pixelInterval >= 10 ? pixelInterval : pixelInterval >= 5 ? 10 : 30) === 0 && (
                    <span className="text-[9px] text-zinc-500 mt-0.5 whitespace-nowrap">
                      {formatTime(t).replace(/\.00$/, "")}
                    </span>
                  )}
                </div>
              ))}

              {/* Playhead marker on ruler */}
              <div
                className="absolute top-0 z-20 cursor-col-resize"
                style={{ left: playheadPosition * timelineZoom - scrollLeft }}
                onMouseDown={handlePlayheadMouseDown}
              >
                <div className="w-3 h-4 bg-indigo-500 rounded-b-sm mx-auto relative">
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-px bg-indigo-400" style={{ height: 200 }} />
                </div>
              </div>
            </div>

            {/* Tracks */}
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`relative border-b border-zinc-800/50 ${
                  selectedTrackId === track.id ? "bg-zinc-800/20" : ""
                }`}
                style={{ height: TRACK_HEIGHT }}
              >
                {/* Grid lines */}
                {rulerMarks.filter((t) => t % 10 === 0).map((t) => (
                  <div
                    key={t}
                    className="absolute top-0 bottom-0 w-px bg-zinc-800/30"
                    style={{ left: t * timelineZoom - scrollLeft }}
                  />
                ))}

                {/* Clips */}
                {track.clips.map((clip) => {
                  const clipX = clip.timelineStart * timelineZoom;
                  const clipW = Math.max(clip.duration * timelineZoom, MIN_CLIP_WIDTH);
                  const isSelected = selectedClipIds.includes(clip.id);

                  return (
                    <div
                      key={clip.id}
                      className={`absolute top-1 bottom-1 rounded-md cursor-pointer overflow-hidden transition-shadow ${
                        isSelected
                          ? "ring-2 ring-white/50 shadow-lg shadow-indigo-500/20"
                          : "hover:brightness-110"
                      } ${clip.locked ? "opacity-60" : ""}`}
                      style={{
                        left: clipX - scrollLeft,
                        width: clipW,
                        backgroundColor: clip.color,
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, track.id, clip)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (confirm(`Delete clip?`)) {
                          onClipRemove?.(track.id, clip.id);
                        }
                      }}
                    >
                      {/* Clip content */}
                      <div className="h-full flex items-center px-2 pointer-events-none">
                        <span className="text-[10px] font-medium text-white/90 truncate drop-shadow">
                          {clip.type === "audio" ? "♪ " : ""}{clip.sourceId.slice(0, 12)}
                        </span>
                        {clip.effects.length > 0 && (
                          <span className="text-[8px] ml-1 bg-black/30 px-1 rounded">FX</span>
                        )}
                        {clip.muted && (
                          <span className="text-[8px] ml-1 bg-red-500/50 px-1 rounded">M</span>
                        )}
                      </div>

                      {/* Waveform hint for audio clips */}
                      {clip.type === "audio" && (
                        <div className="absolute inset-0 flex items-center opacity-30 pointer-events-none">
                          {Array.from({ length: Math.floor(clipW / 4) }, (_, i) => (
                            <div
                              key={i}
                              className="w-[2px] bg-white/60 mx-px flex-shrink-0"
                              style={{
                                height: `${20 + Math.sin(i * 0.5) * 15 + Math.random() * 10}%`,
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Trim handles */}
                      {!clip.locked && (
                        <>
                          <div
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/20 transition-colors"
                            onMouseDown={(e) => handleTrimMouseDown(e, track.id, clip, "start")}
                          />
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/20 transition-colors"
                            onMouseDown={(e) => handleTrimMouseDown(e, track.id, clip, "end")}
                          />
                        </>
                      )}

                      {/* Muted indicator */}
                      {clip.muted && (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                          <span className="text-white/50 text-xs">🔇</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Transitions */}
                {track.transitions.map((trans) => {
                  const clip = track.clips.find((c) => c.id === trans.clipId);
                  if (!clip) return null;
                  const transX = (clip.timelineStart + clip.duration - trans.duration) * timelineZoom;
                  const transW = trans.duration * timelineZoom;
                  return (
                    <div
                      key={trans.id}
                      className="absolute top-2 bottom-2 bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent border border-yellow-500/20 rounded pointer-events-none"
                      style={{ left: transX - scrollLeft, width: transW }}
                    >
                      <span className="text-[8px] text-yellow-400/70 px-1">
                        {trans.type}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Playhead line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-indigo-400 z-10 pointer-events-none"
              style={{
                left: playheadPosition * timelineZoom - scrollLeft,
                height: tracks.length * TRACK_HEIGHT + RULER_HEIGHT,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

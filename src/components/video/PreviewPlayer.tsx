/* ─── stitaP Video Editor — Preview Player ─── */

import React, { useRef, useEffect, useCallback, useState } from "react";
import type { TimeSec, VideoProject } from "../../lib/video/types";
import { formatTime } from "../../lib/video/types";

interface PreviewPlayerProps {
  project: VideoProject;
  isPlaying: boolean;
  onPlayheadChange: (time: TimeSec) => void;
  onPlayStateChange: (playing: boolean) => void;
  /** Called each frame to render the preview */
  onRenderFrame?: (canvas: HTMLCanvasElement, time: TimeSec) => void;
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  project,
  isPlaying,
  onPlayheadChange,
  onPlayStateChange,
  onRenderFrame,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { playheadPosition, duration, settings } = project;

  /** Render a single frame */
  const renderFrame = useCallback(
    (time: TimeSec) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear
      ctx.fillStyle = settings.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw each track
      for (const track of project.tracks) {
        if (!track.visible || track.muted) continue;
        if (track.kind === "text") continue;

        for (const clip of track.clips) {
          if (clip.muted) continue;
          if (time < clip.timelineStart || time >= clip.timelineStart + clip.duration) continue;

          ctx.globalAlpha = clip.opacity;

          // Apply CSS filters for effects
          const filters: string[] = [];
          for (const fx of clip.effects) {
            if (!fx.enabled) continue;
            switch (fx.type) {
              case "brightness": filters.push(`brightness(${fx.value})`); break;
              case "contrast": filters.push(`contrast(${fx.value})`); break;
              case "saturation": filters.push(`saturate(${fx.value})`); break;
              case "blur": filters.push(`blur(${fx.value}px)`); break;
              case "grayscale": filters.push(`grayscale(${fx.value})`); break;
              case "sepia": filters.push(`sepia(${fx.value})`); break;
              case "hue-rotate": filters.push(`hue-rotate(${fx.value}deg)`); break;
            }
          }
          if (filters.length > 0) ctx.filter = filters.join(" ");

          // Draw clip
          ctx.fillStyle = clip.color;
          ctx.globalAlpha *= 0.4;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.filter = "none";
          ctx.globalAlpha = clip.opacity;

          // Draw text overlays
          for (const overlay of clip.textOverlays) {
            const clipTime = time - clip.timelineStart;
            if (clipTime >= overlay.startOffset && clipTime < overlay.startOffset + overlay.duration) {
              const x = (overlay.x / 100) * canvas.width;
              const y = (overlay.y / 100) * canvas.height;

              if (overlay.shadow) {
                ctx.shadowColor = "rgba(0,0,0,0.7)";
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
              }

              ctx.font = `${overlay.bold ? "bold " : ""}${overlay.italic ? "italic " : ""}${overlay.fontSize}px ${overlay.fontFamily}`;
              ctx.fillStyle = overlay.color;
              ctx.textBaseline = "top";
              ctx.textAlign = overlay.alignment === "center" ? "center" : overlay.alignment === "right" ? "right" : "left";
              ctx.fillText(overlay.text, x, y);

              if (overlay.shadow) {
                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;
              }
            }
          }

          ctx.globalAlpha = 1;
        }
      }

      // Render text track clips
      for (const track of project.tracks) {
        if (!track.visible || track.muted || track.kind !== "text") continue;
        for (const clip of track.clips) {
          if (time < clip.timelineStart || time >= clip.timelineStart + clip.duration) continue;
          for (const overlay of clip.textOverlays) {
            const clipTime = time - clip.timelineStart;
            if (clipTime >= overlay.startOffset && clipTime < overlay.startOffset + overlay.duration) {
              const x = (overlay.x / 100) * canvas.width;
              const y = (overlay.y / 100) * canvas.height;

              if (overlay.shadow) {
                ctx.shadowColor = "rgba(0,0,0,0.7)";
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
              }

              ctx.font = `${overlay.bold ? "bold " : ""}${overlay.italic ? "italic " : ""}${overlay.fontSize}px ${overlay.fontFamily}`;
              ctx.fillStyle = overlay.color;
              ctx.textBaseline = "top";
              ctx.textAlign = overlay.alignment === "center" ? "center" : overlay.alignment === "right" ? "right" : "left";
              ctx.fillText(overlay.text, x, y);

              if (overlay.shadow) {
                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;
              }
            }
          }
        }
      }

      // "No media" placeholder
      if (project.tracks.every((t) => t.clips.length === 0)) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Import media to start editing", canvas.width / 2, canvas.height / 2 - 12);
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText("Drag files here or use the Import button", canvas.width / 2, canvas.height / 2 + 12);
      }

      onRenderFrame?.(canvas, time);
    },
    [project, settings, onRenderFrame],
  );

  /** Animation loop for playback */
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(animationRef.current);
      lastTimeRef.current = 0;
      return;
    }

    const fps = settings.fps;
    const frameInterval = 1000 / fps;
    let lastFrame = performance.now();

    const tick = (now: number) => {
      const elapsed = now - lastFrame;
      if (elapsed >= frameInterval) {
        lastFrame = now;
        const newPos = playheadPosition + elapsed / 1000;

        if (newPos >= duration && duration > 0) {
          onPlayheadChange(0);
          onPlayStateChange(false);
          return;
        }

        onPlayheadChange(newPos);
        renderFrame(newPos);
      }
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, playheadPosition, duration, settings.fps, renderFrame, onPlayheadChange, onPlayStateChange]);

  /** Render current frame when not playing */
  useEffect(() => {
    if (!isPlaying) {
      renderFrame(playheadPosition);
    }
  }, [playheadPosition, isPlaying, renderFrame]);

  /** Keyboard shortcuts */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          onPlayStateChange(!isPlaying);
          break;
        case "ArrowLeft":
          e.preventDefault();
          onPlayheadChange(Math.max(0, playheadPosition - (e.shiftKey ? 1 : 1 / settings.fps)));
          break;
        case "ArrowRight":
          e.preventDefault();
          onPlayheadChange(Math.min(duration, playheadPosition + (e.shiftKey ? 1 : 1 / settings.fps)));
          break;
        case "Home":
          e.preventDefault();
          onPlayheadChange(0);
          break;
        case "End":
          e.preventDefault();
          onPlayheadChange(duration);
          break;
        case "KeyF":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isPlaying, playheadPosition, duration, settings.fps, onPlayheadChange, onPlayStateChange]);

  /** Fullscreen */
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /** Frame stepping */
  const stepFrame = useCallback(
    (direction: -1 | 1) => {
      const frameTime = 1 / settings.fps;
      const newPos = playheadPosition + direction * frameTime;
      onPlayheadChange(Math.max(0, Math.min(duration, newPos)));
    },
    [playheadPosition, settings.fps, duration, onPlayheadChange],
  );

  /** Skip */
  const skip = useCallback(
    (seconds: number) => {
      onPlayheadChange(Math.max(0, Math.min(duration, playheadPosition + seconds)));
    },
    [playheadPosition, duration, onPlayheadChange],
  );

  /** Handle canvas scrub (click/drag on canvas = seek) */
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPlaying) {
        onPlayStateChange(false);
      }
    },
    [isPlaying, onPlayStateChange],
  );

  return (
    <div ref={containerRef} className="flex flex-col bg-zinc-950 rounded-lg overflow-hidden">
      {/* Canvas preview */}
      <div
        className="relative bg-black flex items-center justify-center"
        style={{ aspectRatio: `${settings.width}/${settings.height}` }}
        onClick={handleCanvasClick}
      >
        <canvas
          ref={canvasRef}
          width={settings.width}
          height={settings.height}
          className="max-w-full max-h-full"
          style={{ imageRendering: "auto" }}
        />

        {/* Overlay play button when paused */}
        {!isPlaying && (
          <button
            onClick={() => onPlayStateChange(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity"
          >
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-8 h-8 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900">
        {/* Time display */}
        <span className="text-xs font-mono text-zinc-400 w-24 text-right">
          {formatTime(playheadPosition)}
        </span>
        <span className="text-[10px] text-zinc-600">/</span>
        <span className="text-xs font-mono text-zinc-600 w-24">
          {formatTime(duration || 0)}
        </span>

        <div className="flex-1" />

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPlayheadChange(0)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Go to start"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 20L9 12l10-8v16zM5 19V5" />
            </svg>
          </button>

          <button
            onClick={() => stepFrame(-1)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Previous frame"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <button
            onClick={() => skip(-5)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Rewind 5s"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6" />
            </svg>
          </button>

          <button
            onClick={() => onPlayStateChange(!isPlaying)}
            className="p-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white transition-colors mx-1"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => skip(5)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Forward 5s"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6" />
            </svg>
          </button>

          <button
            onClick={() => stepFrame(1)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Next frame"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6v12z" />
            </svg>
          </button>

          <button
            onClick={() => onPlayheadChange(duration)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Go to end"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 4l10 8-10 8V4zM19 5v14" />
            </svg>
          </button>
        </div>

        <div className="flex-1" />

        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Fullscreen"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      </div>
    </div>
  );
};

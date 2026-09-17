/**
 * Native screen capture overlay — Snagit-style.
 *
 * When running in the Tauri desktop shell, this component:
 *  1. Makes the window fullscreen
 *  2. Shows a translucent scrim over the entire screen
 *  3. Lets the user drag a rectangle to select a region
 *  4. Calls the native engine's `capture_screen_region` IPC command
 *  5. Feeds the resulting PNG into the editor as a CaptureDocument
 *
 * The user's actual desktop is visible behind the scrim because the Tauri
 * window is fullscreen and transparent (the overlay is purely visual). The
 * real capture happens in the OS compositor, not from the webview, so the
 * scrim never appears in the result.
 *
 * Keyboard: Esc cancels.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureScreenRegionNative,
  getScreenBounds,
  type ScreenBounds,
} from "@/lib/capture/desktop";
import { rasterDocumentFromDataUrl } from "@/lib/capture/engine";
import { defaultMetadataFor } from "@/lib/capture/metadata";
import { buildPortableSvg } from "@/lib/capture/svg";
import type { CaptureDocument, CaptureRequest } from "@/lib/capture/types";

export interface ScreenCaptureOverlayProps {
  active: boolean;
  onCancel: () => void;
  onCapture: (args: {
    document: CaptureDocument;
    svg: string;
  }) => void;
  request?: CaptureRequest | null;
}

interface DragRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function normalizeRect(d: DragRect) {
  const x = Math.min(d.startX, d.endX);
  const y = Math.min(d.startY, d.endY);
  const width = Math.abs(d.endX - d.startX);
  const height = Math.abs(d.endY - d.startY);
  return { x, y, width, height };
}

export function ScreenCaptureOverlay({
  active,
  onCancel,
  onCapture,
  request,
}: ScreenCaptureOverlayProps) {
  const [dragging, setDragging] = useState(false);
  const [rect, setRect] = useState<DragRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenBounds, setScreenBounds] = useState<ScreenBounds | null>(null);
  const [windowBounds, setWindowBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // On activate, get screen + window bounds and enter fullscreen
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    (async () => {
      const sb = await getScreenBounds();
      if (!cancelled) setScreenBounds(sb);

      // Try to enter fullscreen via Tauri
      try {
        const win = window.__TAURI__?.core;
        if (win) {
          // Remember window position, then go fullscreen
          const monitor = await win.invoke<{ size: { width: number; height: number }; position: { x: number; y: number } } | null>("get_current_monitor");
          if (monitor && !cancelled) {
            setWindowBounds({
              x: monitor.position.x,
              y: monitor.position.y,
              w: monitor.size.width,
              h: monitor.size.height,
            });
          }
          await win.invoke("set_fullscreen", { fullscreen: true });
        }
      } catch {
        /* fullscreen not available — continue with window as-is */
      }

      // Give the browser a frame to repaint fullscreen before showing overlay
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    })();

    return () => {
      if (!cancelled) {
        // Leave fullscreen on cleanup
        try {
          window.__TAURI__?.core?.invoke("set_fullscreen", { fullscreen: false });
        } catch { /* best effort */ }
      }
      cancelled = true;
    };
  }, [active]);

  // Esc to cancel
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onCancel]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (busy) return;
      setError(null);
      setDragging(true);
      setRect({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY });
    },
    [busy],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !rect) return;
      setRect((prev) => (prev ? { ...prev, endX: e.clientX, endY: e.clientY } : prev));
    },
    [dragging, rect],
  );

  const handleMouseUp = useCallback(async () => {
    if (!dragging || !rect) return;
    setDragging(false);

    const normalized = normalizeRect(rect);
    // Ignore tiny drags (< 8px in either direction — likely a click)
    if (normalized.width < 8 || normalized.height < 8) {
      setRect(null);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // The overlay is fullscreen, so clientX/Y map directly to screen coordinates
      // (in a Tauri fullscreen window, (0,0) is top-left of the screen).
      const result = await captureScreenRegionNative(
        normalized.x,
        normalized.y,
        normalized.width,
        normalized.height,
      );

      if (!result.ok || !result.base64) {
        setError(result.error || "Capture failed — the native engine could not capture the screen.");
        setBusy(false);
        return;
      }

      // Convert base64 PNG → data URL → CaptureDocument
      const dataUrl = `data:image/png;base64,${result.base64}`;
      const doc = await rasterDocumentFromDataUrl(dataUrl, {
        url: request?.source.url,
        title: `Screen capture ${normalized.width}×${normalized.height}`,
        capturedAt: new Date().toISOString(),
        mode: (request?.mode as CaptureDocument["source"]["mode"]) || "viewport",
        deviceScaleFactor: window.devicePixelRatio || 1,
      });

      const model = defaultMetadataFor(doc);
      const svg = buildPortableSvg(doc, {
        model,
        annotations: [],
        outputMode: "portable",
      });

      // Leave fullscreen before handing off
      try {
        await window.__TAURI__?.core?.invoke("set_fullscreen", { fullscreen: false });
      } catch { /* best effort */ }

      onCapture({ document: doc, svg });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screen capture failed");
    } finally {
      setBusy(false);
    }
  }, [dragging, rect, request, onCapture]);

  if (!active) return null;

  const selected = rect ? normalizeRect(rect) : null;
  const selArea = selected ? selected.width * selected.height : 0;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] select-none"
      style={{ cursor: busy ? "wait" : "crosshair" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Translucent scrim — visible to the user, invisible to the OS compositor */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Selection rectangle */}
      {selected && selArea > 0 && (
        <>
          {/* Clear the scrim inside the selection */}
          <div
            className="absolute bg-transparent"
            style={{
              left: selected.x,
              top: selected.y,
              width: selected.width,
              height: selected.height,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.30)",
            }}
          />
          {/* Selection border */}
          <div
            className="absolute border-2 border-white/80"
            style={{
              left: selected.x,
              top: selected.y,
              width: selected.width,
              height: selected.height,
            }}
          />
          {/* Dimension label */}
          <div
            className="absolute -translate-x-1/2 px-2.5 py-1 text-[12px] font-medium text-white"
            style={{
              left: selected.x + selected.width / 2,
              top: selected.y + selected.height + 8,
              background: "rgba(0,0,0,0.7)",
              borderRadius: 6,
            }}
          >
            {selected.width} × {selected.height}
          </div>
        </>
      )}

      {/* Instructions chip */}
      {!busy && !dragging && (
        <div className="absolute left-1/2 top-8 -translate-x-1/2">
          <div
            className="px-4 py-2 text-[13px] font-medium text-white"
            style={{ background: "rgba(0,0,0,0.75)", borderRadius: 8 }}
          >
            {error
              ? error
              : "Drag to select a region — Esc to cancel"}
          </div>
        </div>
      )}

      {busy && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className="flex items-center gap-3 px-5 py-3 text-[13px] font-medium text-white"
            style={{ background: "rgba(0,0,0,0.8)", borderRadius: 10 }}
          >
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Capturing…
          </div>
        </div>
      )}

      {/* Top-right cancel button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        className="absolute right-6 top-6 rounded-lg px-3 py-1.5 text-[12px] font-medium text-white/80 transition-colors hover:text-white"
        style={{ background: "rgba(0,0,0,0.5)" }}
      >
        Cancel (Esc)
      </button>
    </div>
  );
}

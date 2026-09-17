import { useEffect, useRef, useState } from "react";
import { DemoSite } from "@/pages/Demo";
import type { CaptureRequest } from "@/lib/capture/types";

/**
 * The isolated "browser viewport" for demo captures: the demo documentation
 * page rendered inside a fixed-size scroll container, positioned off-screen.
 * The capture engine scrolls it incrementally (lazy loading) and rasterizes
 * its content directly.
 */

export function CaptureStage({
  request,
  onRefs,
}: {
  request: CaptureRequest;
  onRefs: (refs: { container?: HTMLElement; content?: HTMLElement }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const { width, height } = request.viewport;

  useEffect(() => {
    setRoot(containerRef.current);
    const timer = window.setTimeout(() => {
      const container = containerRef.current;
      onRefs({
        container: container ?? undefined,
        content: (container?.querySelector("[data-stitap-capture-root]") as HTMLElement | null) ?? undefined,
      });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [onRefs]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute -left-[12000px] top-0"
      style={{ width, height, overflow: "auto" }}
    >
      <DemoSite scrollRoot={root} />
    </div>
  );
}

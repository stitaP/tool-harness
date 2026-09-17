/* ─── stitaP — Custom Resizable Panels (replaces react-resizable-panels) ─── */

import React, { useRef, useState, useCallback, useEffect, createContext, useContext } from "react";

interface PanelGroupContext {
  direction: "horizontal" | "vertical";
  panels: Map<string, { id: string; size: number; minSize: number; maxSize: number }>;
  registerPanel: (id: string, config: { size: number; minSize: number; maxSize: number }) => void;
  setPanelSize: (id: string, size: number) => void;
}

const Ctx = createContext<PanelGroupContext | null>(null);

export const PanelGroup: React.FC<{
  children: React.ReactNode;
  direction?: "horizontal" | "vertical";
  className?: string;
  style?: React.CSSProperties;
  autoSaveId?: string;
}> = ({ children, direction = "horizontal", className, style, autoSaveId }) => {
  const [panels, setPanels] = useState<Map<string, { id: string; size: number; minSize: number; maxSize: number }>>(new Map());

  const registerPanel = useCallback((id: string, config: { size: number; minSize: number; maxSize: number }) => {
    setPanels((prev) => {
      const next = new Map(prev);
      next.set(id, { id, ...config });
      return next;
    });
  }, []);

  const setPanelSize = useCallback((id: string, size: number) => {
    setPanels((prev) => {
      const next = new Map(prev);
      const panel = next.get(id);
      if (panel) {
        next.set(id, { ...panel, size: Math.max(panel.minSize, Math.min(panel.maxSize, size)) });
      }
      return next;
    });
  }, []);

  const totalSize = Array.from(panels.values()).reduce((sum, p) => sum + p.size, 0) || 100;

  return React.createElement(
    Ctx.Provider,
    { value: { direction, panels, registerPanel, setPanelSize } },
    React.createElement(
      "div",
      {
        className,
        style: {
          display: "flex",
          flexDirection: direction === "horizontal" ? "row" : "column",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          ...style,
        },
        "data-panel-group": "",
      },
      React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<{ totalSize?: number }>, { totalSize });
      }),
    ),
  );
};

export const Panel: React.FC<{
  children: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  totalSize?: number;
}> = ({ children, defaultSize = 50, minSize = 10, maxSize = 90, id: propId, className, style, totalSize }) => {
  const ctx = useContext(Ctx);
  const idRef = useRef(propId || `panel-${Math.random().toString(36).slice(2, 8)}`);
  const id = idRef.current;

  useEffect(() => {
    ctx?.registerPanel(id, { size: defaultSize, minSize, maxSize });
  }, []);

  const size = ctx?.panels.get(id)?.size ?? defaultSize;
  const pct = totalSize ? (size / totalSize) * 100 : size;

  const isHorizontal = ctx?.direction === "horizontal";

  return React.createElement(
    "div",
    {
      className,
      style: {
        [isHorizontal ? "width" : "height"]: `${pct}%`,
        overflow: "auto",
        flexShrink: 0,
        ...style,
      },
      "data-panel": "",
    },
    children,
  );
};

export const PanelResizeHandle: React.FC<{
  className?: string;
  style?: React.CSSProperties;
}> = ({ className, style }) => {
  const ctx = useContext(Ctx);
  const isHorizontal = ctx?.direction === "horizontal";
  const [isDragging, setIsDragging] = useState(false);

  return React.createElement("div", {
    className,
    style: {
      flexShrink: 0,
      [isHorizontal ? "width" : "height"]: "4px",
      background: isDragging ? "#6366f1" : "#3f3f46",
      cursor: isHorizontal ? "col-resize" : "row-resize",
      transition: isDragging ? "none" : "background 0.15s",
      ...style,
    },
    onMouseDown: () => setIsDragging(true),
    onMouseUp: () => setIsDragging(false),
    "data-panel-resize-handle": "",
  });
};

export default { PanelGroup, Panel, PanelResizeHandle };

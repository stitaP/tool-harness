/* ─── stitaP — Custom Toast System (replaces sonner) ─── */

import React from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

type Listener = (toasts: ToastData[]) => void;

let _toasts: ToastData[] = [];
let _listeners: Listener[] = [];
let _idCounter = 0;

function notify() {
  for (const fn of _listeners) fn([..._toasts]);
}

function add(type: ToastType, title: string, description?: string, duration = 4000): string {
  const id = `toast-${++_idCounter}`;
  const toast: ToastData = { id, type, title, description, duration };
  _toasts = [..._toasts, toast];
  notify();
  if (duration > 0) {
    setTimeout(() => remove(id), duration);
  }
  return id;
}

function remove(id: string) {
  _toasts = _toasts.filter((t) => t.id !== id);
  notify();
}

function dismissAll() {
  _toasts = [];
  notify();
}

/** Subscribe to toast changes (for React rendering) */
export function useToasts(): ToastData[] {
  const [toasts, setToasts] = React.useState<ToastData[]>(() => [..._toasts]);
  React.useEffect(() => {
    _listeners.push(setToasts);
    return () => {
      _listeners = _listeners.filter((fn) => fn !== setToasts);
    };
  }, []);
  return toasts;
}

/** Toast API — drop-in replacement for sonner's toast */
export const toast = {
  success: (title: string, opts?: { description?: string; duration?: number }) =>
    add("success", title, opts?.description, opts?.duration),
  error: (title: string, opts?: { description?: string; duration?: number }) =>
    add("error", title, opts?.description, opts?.duration),
  warning: (title: string, opts?: { description?: string; duration?: number }) =>
    add("warning", title, opts?.description, opts?.duration),
  info: (title: string, opts?: { description?: string; duration?: number }) =>
    add("info", title, opts?.description, opts?.duration),
  remove,
  dismissAll,
};

/** React ToastContainer component — renders toast notifications */
export const ToastContainer: React.FC = () => {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return React.createElement(
    "div",
    { className: "fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm" },
    ...toasts.map((t) =>
      React.createElement(
        "div",
        {
          key: t.id,
          className: `rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 ${
            t.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : t.type === "error"
              ? "bg-red-50 border-red-200 text-red-800"
              : t.type === "warning"
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-blue-50 border-blue-200 text-blue-800"
          }`,
        },
        React.createElement(
          "div",
          { className: "flex items-start gap-2" },
          React.createElement(
            "span",
            { className: "text-sm shrink-0 mt-0.5" },
            t.type === "success" ? "✓" : t.type === "error" ? "✕" : t.type === "warning" ? "⚠" : "ℹ"
          ),
          React.createElement(
            "div",
            { className: "flex-1 min-w-0" },
            React.createElement("div", { className: "text-sm font-medium" }, t.title),
            t.description && React.createElement("div", { className: "text-xs opacity-75 mt-0.5" }, t.description)
          ),
          React.createElement(
            "button",
            {
              onClick: () => remove(t.id),
              className: "text-xs opacity-50 hover:opacity-100 shrink-0",
            },
            "✕"
          )
        )
      )
    )
  );
};

export default toast;

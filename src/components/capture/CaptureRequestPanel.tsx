import { useEffect, useState } from "react";
import { CaptureRequest, normalizeRequest } from "@/lib/capture/types";
import { validateCaptureUrl } from "@/lib/capture/urlSecurity";
import {
  EXT_EVENT_STATUS,
  extensionPing,
  parseExtensionMessage,
} from "@/lib/capture/extension";
import { cn } from "@/lib/utils";

interface PanelState {
  sourceType: "demo" | "url" | "extension";
  url: string;
  mode: "viewport" | "full-page" | "region" | "element";
  selector: string;
  regionX: number;
  regionY: number;
  regionW: number;
  regionH: number;
  width: number;
  height: number;
  scale: number;
  stepRatio: number;
  scrollDelay: number;
  maxHeight: number;
  maxPasses: number;
  extraDelay: number;
  readinessStrategy: "dom-content-loaded" | "load" | "network-idle" | "selector" | "manual";
  readinessSelector: string;
  timeoutSec: number;
  rasterFormat: "png" | "webp";
  includeMetadata: boolean;
  includeSourceUrl: boolean;
  includeTimestamp: boolean;
  ocrAtCapture: boolean;
}

interface ExtensionStatus {
  installed: boolean;
  version?: string;
}

/* ---------------- capture presets (localStorage) ---------------- */

const PRESETS_KEY = "stitap.capture.presets.v1";
type Presets = Record<string, PanelState>;

function readPresets(): Presets {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Presets) : {};
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writePresets(presets: Presets) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* storage full or blocked — presets just won't persist */
  }
}

const DEFAULT_STATE: PanelState = {
  sourceType: "demo",
  url: "",
  mode: "full-page",
  selector: "section#pricing",
  regionX: 0,
  regionY: 0,
  regionW: 640,
  regionH: 480,
  width: 1440,
  height: 900,
  scale: 1,
  stepRatio: 0.8,
  scrollDelay: 180,
  maxHeight: 100_000,
  maxPasses: 40,
  extraDelay: 200,
  readinessStrategy: "load",
  readinessSelector: "",
  timeoutSec: 30,
  rasterFormat: "webp",
  includeMetadata: true,
  includeSourceUrl: true,
  includeTimestamp: true,
  ocrAtCapture: true,
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] leading-4 text-zinc-400">{hint}</p>}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[13px] text-zinc-900 outline-none transition-colors focus:border-zinc-900";

export function CaptureRequestPanel({
  onStart,
  onCancel,
}: {
  onStart: (request: CaptureRequest) => void;
  onCancel: () => void;
}) {
  const [s, setS] = useState<PanelState>(DEFAULT_STATE);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [extStatus, setExtStatus] = useState<ExtensionStatus | null>(null);
  const [presets, setPresets] = useState<Presets>(readPresets);
  const [presetName, setPresetName] = useState("");

  // Mobile browsers can't run the capture extension (Chrome for Android and
  // iOS Safari have no extension support) — surface what actually works
  // instead of dead-ending on chrome://extensions instructions.
  const isMobile =
    typeof window !== "undefined" &&
    (window.matchMedia("(pointer: coarse)").matches ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

  const savePreset = () => {
    const name = (presetName || `Preset ${Object.keys(presets).length + 1}`).trim();
    const next = { ...presets, [name]: s };
    setPresets(next);
    writePresets(next);
    setPresetName("");
  };

  const deletePreset = (name: string) => {
    const next = { ...presets };
    delete next[name];
    setPresets(next);
    writePresets(next);
  };

  const set = <K extends keyof PanelState>(key: K, value: PanelState[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  // Detect the current-tab extension (if installed it answers the ping by
  // broadcasting a STITAP_EXT_STATUS message on the window channel).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = parseExtensionMessage(e.data);
      if (msg && msg.type === EXT_EVENT_STATUS) {
        setExtStatus({ installed: true, version: msg.payload.version });
      }
    };
    window.addEventListener("message", onMessage);
    window.postMessage(extensionPing(), "*");
    const t = window.setTimeout(() => {
      setExtStatus((prev) => (prev === null ? { installed: false } : prev));
    }, 1200);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(t);
    };
  }, []);

  const start = () => {
    // The extension captures in the user's browser — no engine request here.
    if (s.sourceType === "extension") return;
    setStartError(null);
    if (s.sourceType === "url") {
      const check = validateCaptureUrl(s.url);
      if (!check.ok) {
        setUrlError(check.reason);
        return;
      }
    }
    if (s.mode === "element" && s.sourceType === "url") {
      setStartError(
        "Element capture works with the built-in demo page — a URL capture can't select elements inside a remote page. Use Viewport, Full page, or Region for URLs.",
      );
      return;
    }
    if (s.mode === "element" && !s.selector.trim()) {
      setStartError("Enter a CSS selector for the element to capture.");
      return;
    }
    if (s.mode === "region" && (s.regionW < 1 || s.regionH < 1)) {
      setStartError("Region width and height must be at least 1px.");
      return;
    }
    const request = normalizeRequest({
      source: {
        type: s.sourceType,
        url: s.sourceType === "url" ? s.url : undefined,
        selector: s.mode === "element" ? s.selector : undefined,
      },
      mode: s.mode,
      region:
        s.mode === "region"
          ? { x: s.regionX, y: s.regionY, width: s.regionW, height: s.regionH }
          : undefined,
      viewport: { width: s.width, height: s.height, deviceScaleFactor: s.scale },
      readiness: {
        strategy: s.readinessStrategy,
        additionalDelayMs: s.extraDelay,
        timeoutMs: s.timeoutSec * 1000,
        selector: s.readinessStrategy === "selector" ? s.readinessSelector : undefined,
      },
      scrolling: {
        stepRatio: s.stepRatio,
        delayMs: s.scrollDelay,
        maximumHeight: s.maxHeight,
        maximumPasses: s.maxPasses,
      },
      output: {
        mode: "portable",
        rasterFormat: s.rasterFormat,
        quality: 0.92,
        includeMetadata: s.includeMetadata,
      },
      privacy: {
        includeSourceUrl: s.includeSourceUrl,
        includeTimestamp: s.includeTimestamp,
        detectSensitiveData: false,
        removeFormValues: true,
      },
      intelligence: {
        ocrAtCapture: s.ocrAtCapture,
      },
    });
    onStart(request);
  };

  return (
    <div className="mx-auto w-full max-w-xl px-8 py-12">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
        New capture
      </p>
      <h2 className="mt-2 text-2xl font-medium tracking-tight text-zinc-900">
        What would you like to capture?
      </h2>

      {/* Presets */}
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-3.5">
        <Field
          label="Presets"
          hint="Saved in this browser only — a preset replaces every setting below."
        >
          <div className="flex gap-2">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setS({ ...DEFAULT_STATE, ...presets[e.target.value] });
              }}
              className={cn(inputCls, "min-w-0 flex-1")}
            >
              <option value="">Load a preset…</option>
              {Object.keys(presets).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePreset()}
              placeholder="Name…"
              className={cn(inputCls, "w-36")}
            />
            <button
              onClick={savePreset}
              className="shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900"
            >
              Save
            </button>
            {presetName.trim() && presets[presetName.trim()] && (
              <button
                onClick={() => deletePreset(presetName.trim())}
                className="shrink-0 rounded-md border border-red-100 bg-white px-3 py-1.5 text-[12px] font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
        </Field>
      </div>

      {/* Source */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <button
          onClick={() => set("sourceType", "demo")}
          className={cn(
            "group rounded-xl border p-4 text-left transition-all",
            s.sourceType === "demo"
              ? "border-zinc-900 bg-zinc-50"
              : "border-zinc-200 bg-white hover:border-zinc-400",
          )}
        >
          <span
            className={cn(
              "text-[12px] font-semibold",
              s.sourceType === "demo" ? "text-zinc-900" : "text-zinc-600",
            )}
          >
            Built-in demo
          </span>
          <span className="mt-1 block text-[12px] leading-5 text-zinc-500">
            The stitaP docs site — captures instantly in your browser, no key
            required.
          </span>
        </button>
        <button
          onClick={() => set("sourceType", "url")}
          className={cn(
            "group rounded-xl border p-4 text-left transition-all",
            s.sourceType === "url"
              ? "border-zinc-900 bg-zinc-50"
              : "border-zinc-200 bg-white hover:border-zinc-400",
          )}
        >
          <span
            className={cn(
              "text-[12px] font-semibold",
              s.sourceType === "url" ? "text-zinc-900" : "text-zinc-600",
            )}
          >
            Any URL
          </span>
          <span className="mt-1 block text-[12px] leading-5 text-zinc-500">
            Rendered by your own self-hosted capture service. Public sites
            only.
          </span>
        </button>
        <button
          onClick={() => set("sourceType", "extension")}
          className={cn(
            "group rounded-xl border p-4 text-left transition-all",
            s.sourceType === "extension"
              ? "border-zinc-900 bg-zinc-50"
              : "border-zinc-200 bg-white hover:border-zinc-400",
          )}
        >
          <span
            className={cn(
              "text-[12px] font-semibold",
              s.sourceType === "extension" ? "text-zinc-900" : "text-zinc-600",
            )}
          >
            Current tab
          </span>
          <span className="mt-1 block text-[12px] leading-5 text-zinc-500">
            Captures the page you're already viewing — auth'd, VPN-gated, or
            local. Nothing leaves your browser but pixels.
          </span>
        </button>
      </div>

      {s.sourceType === "url" && (
        <div className="mt-4">
          <Field label="Page URL">
            <input
              value={s.url}
              onChange={(e) => {
                set("url", e.target.value);
                setUrlError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && start()}
              placeholder="https://example.com/docs"
              className={inputCls}
            />
          </Field>
          {urlError && (
            <p className="mt-1.5 text-[12px] text-red-600">
              Blocked: {urlError}
            </p>
          )}
          <p className="mt-1.5 text-[11px] leading-4 text-zinc-400">
            URL captures render through the self-hosted capture service — the
            open-source ScreenshotOne replacement in this repo. Set
            CAPTURE_SERVICE_URL (and CAPTURE_SERVICE_API_KEY) in the project's
            Keys tab; see the /api page for the docker one-liner.
          </p>
        </div>
      )}

      {/* Current-tab extension status */}
      {s.sourceType === "extension" && (
        <div className="mt-7 space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            {extStatus === null ? (
              <p className="font-mono text-[12px] text-zinc-400">
                Checking for the stitaP extension…
              </p>
            ) : extStatus.installed ? (
              <>
                <div className="flex items-center gap-2.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  <span className="text-[13px] font-medium text-zinc-900">
                    Extension connected
                  </span>
                  {extStatus.version && (
                    <span className="font-mono text-[11px] text-zinc-400">
                      v{extStatus.version}
                    </span>
                  )}
                </div>
                <p className="mt-2.5 text-[12.5px] leading-5 text-zinc-500">
                  Open the page you want to capture, click the stitaP icon in
                  your toolbar, then choose <b>Viewport</b>, <b>Full page</b>,{" "}
                  or <b>Region</b>. The image is stitched in your browser and
                  saved straight to your library.
                </p>
              </>
            ) : isMobile ? (
              <>
                <p className="text-[13px] font-medium text-zinc-900">
                  Not available on mobile browsers
                </p>
                <p className="mt-2 text-[12.5px] leading-5 text-zinc-500">
                  The current-tab capture is a browser extension, and mobile
                  browsers (Chrome for Android, iOS Safari) can't run
                  extensions — so a website can't grab the screen of a phone.
                </p>
                <ul className="mt-4 space-y-1.5 text-[12.5px] leading-5 text-zinc-600">
                  <li>
                    <span className="mr-2 font-mono text-zinc-400">→</span>
                    Capture a page by URL (Any URL) — it renders on your
                    self-hosted capture service, so it works from any device.
                  </li>
                  <li>
                    <span className="mr-2 font-mono text-zinc-400">→</span>
                    Capture the built-in demo page (Demo page).
                  </li>
                  <li>
                    <span className="mr-2 font-mono text-zinc-400">→</span>
                    For what's actually on your screen, use your phone's own
                    screenshot button.
                  </li>
                </ul>
              </>
            ) : (
              <>
                <p className="text-[13px] font-medium text-zinc-900">
                  Extension not detected
                </p>
                <p className="mt-2 text-[12.5px] leading-5 text-zinc-500">
                  The current-tab extension captures the page you're already
                  viewing — including authenticated, VPN-gated, or
                  local-network pages that no URL service can reach.
                  Credentials never leave your browser.
                </p>
                <ol className="mt-4 space-y-1.5 text-[12.5px] leading-5 text-zinc-600">
                  <li>
                    <span className="mr-2 font-mono text-zinc-400">1.</span>
                    Open chrome://extensions → Developer mode → Load unpacked →
                    select the extension/ folder.
                  </li>
                  <li>
                    <span className="mr-2 font-mono text-zinc-400">2.</span>
                    Click the stitaP icon on the page you want to capture —
                    viewport capture is live now.
                  </li>
                  <li>
                    <span className="mr-2 font-mono text-zinc-400">3.</span>
                    Return here — after you click the icon on this tab, the
                    card shows “Connected”.
                  </li>
                </ol>
                <p className="mt-4 border-t border-zinc-100 pt-3 font-mono text-[10.5px] leading-4 text-zinc-400">
                  Sends only: pixels · page URL · title · viewport. Never
                  cookies, form values, or DOM text.
                </p>
              </>
            )}
          </div>
          <p className="text-[12px] leading-5 text-zinc-500">
            Captured pages land in your library automatically — open them from
            the left rail and annotate them like any other capture.
          </p>
        </div>
      )}

      {s.sourceType !== "extension" && s.mode === "element" && (
        <div className="mt-4">
          <Field
            label="CSS selector"
            hint="Targets an element inside the built-in demo page. Try section#pricing, #reference, table, or pre code."
          >
            <input
              value={s.selector}
              onChange={(e) => {
                set("selector", e.target.value);
                setStartError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && start()}
              placeholder="section#pricing"
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {s.sourceType !== "extension" && s.mode === "region" && (
        <div className="mt-4">
          <div className="grid grid-cols-4 gap-3">
            <Field label="X">
              <input
                type="number"
                value={s.regionX}
                onChange={(e) => set("regionX", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Y">
              <input
                type="number"
                value={s.regionY}
                onChange={(e) => set("regionY", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Width">
              <input
                type="number"
                min={1}
                value={s.regionW}
                onChange={(e) => set("regionW", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Height">
              <input
                type="number"
                min={1}
                value={s.regionH}
                onChange={(e) => set("regionH", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-zinc-400">
            Page coordinates in CSS pixels, from the top-left of the page.
          </p>
        </div>
      )}

      {s.sourceType !== "extension" && (
        <>
          {/* Mode */}
          <div className="mt-7">
            <Field label="Capture mode">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["viewport", "Viewport", "The visible window only"],
                    ["full-page", "Full page", "The entire scrollable page"],
                    ["element", "Element", "One element, by CSS selector"],
                    ["region", "Region", "A rectangle in page coordinates"],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    onClick={() => set("mode", value)}
                    className={cn(
                      "rounded-lg border px-3.5 py-2.5 text-left transition-colors",
                      s.mode === value
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400",
                    )}
                  >
                    <span className="block text-[13px] font-medium">{label}</span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px]",
                        s.mode === value ? "text-zinc-300" : "text-zinc-400",
                      )}
                    >
                      {hint}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Viewport */}
          <div className="mt-7 grid grid-cols-3 gap-3">
            <Field label="Width">
              <input
                type="number"
                value={s.width}
                onChange={(e) => set("width", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Height">
              <input
                type="number"
                value={s.height}
                onChange={(e) => set("height", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Scale">
              <select
                value={s.scale}
                onChange={(e) => set("scale", Number(e.target.value))}
                className={inputCls}
              >
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={3}>3×</option>
              </select>
            </Field>
          </div>

          {/* Advanced */}
          <button
            onClick={() => setAdvanced((v) => !v)}
            className="mt-7 text-[12px] font-medium text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-900 hover:underline"
          >
            {advanced ? "Hide" : "Show"} advanced settings
          </button>

          {advanced && (
            <div className="mt-5 space-y-6 rounded-xl border border-zinc-200 bg-zinc-50/60 p-5">
              <div>
                <p className="text-[12px] font-semibold text-zinc-800">Scrolling</p>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Field label="Step ratio" hint="Fraction of the viewport scrolled per pass">
                    <input
                      type="range"
                      min={0.4}
                      max={0.85}
                      step={0.05}
                      value={s.stepRatio}
                      onChange={(e) => set("stepRatio", Number(e.target.value))}
                      className="w-full accent-zinc-900"
                    />
                    <span className="mt-1 block font-mono text-[11px] text-zinc-500">
                      {Math.round(s.stepRatio * 100)}%
                    </span>
                  </Field>
                  <Field label="Delay / pass (ms)">
                    <input
                      type="number"
                      value={s.scrollDelay}
                      onChange={(e) => set("scrollDelay", Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Max height (px)">
                    <input
                      type="number"
                      value={s.maxHeight}
                      onChange={(e) => set("maxHeight", Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Max passes">
                    <input
                      type="number"
                      value={s.maxPasses}
                      onChange={(e) => set("maxPasses", Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>

              <div className="border-t border-zinc-200 pt-5">
                <p className="text-[12px] font-semibold text-zinc-800">Readiness</p>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Field label="Strategy" hint="How to know the page is ready before capturing">
                    <select
                      value={s.readinessStrategy}
                      onChange={(e) =>
                        set("readinessStrategy", e.target.value as PanelState["readinessStrategy"])
                      }
                      className={inputCls}
                    >
                      <option value="load">Load — layout stable</option>
                      <option value="dom-content-loaded">DOM content loaded</option>
                      <option value="network-idle">Network idle</option>
                      <option value="selector">Wait for selector</option>
                      <option value="manual">Manual</option>
                    </select>
                  </Field>
                  <Field label="Timeout (s)" hint="How long to wait before proceeding anyway">
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={s.timeoutSec}
                      onChange={(e) => set("timeoutSec", Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                </div>
                {s.readinessStrategy === "selector" && (
                  <div className="mt-4">
                    <Field label="CSS selector" hint="Waits for this element to exist in the page (e.g. main, .content-loaded)">
                      <input
                        value={s.readinessSelector}
                        onChange={(e) => set("readinessSelector", e.target.value)}
                        placeholder="main .content-loaded"
                        className={inputCls}
                      />
                    </Field>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Field label="Extra delay (ms)" hint="Applied after the page reports ready">
                    <input
                      type="number"
                      value={s.extraDelay}
                      onChange={(e) => set("extraDelay", Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Raster format">
                    <select
                      value={s.rasterFormat}
                      onChange={(e) => set("rasterFormat", e.target.value as "png" | "webp")}
                      className={inputCls}
                    >
                      <option value="webp">WebP (smaller)</option>
                      <option value="png">PNG (lossless)</option>
                    </select>
                  </Field>
                </div>
              </div>

              <div className="border-t border-zinc-200 pt-5">
                <p className="text-[12px] font-semibold text-zinc-800">Privacy & metadata</p>
                <div className="mt-3 space-y-2.5">
                  {(
                    [
                      ["includeMetadata", "Embed structured capture metadata"],
                      ["includeSourceUrl", "Include source URL in metadata"],
                      ["includeTimestamp", "Include capture timestamp"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-zinc-700">
                      <input
                        type="checkbox"
                        checked={s[key]}
                        onChange={(e) => set(key, e.target.checked)}
                        className="size-3.5 accent-zinc-900"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="border-t border-zinc-200 pt-5">
                <p className="text-[12px] font-semibold text-zinc-800">Intelligence</p>
                <div className="mt-3 space-y-2.5">
                  <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-zinc-700">
                    <input
                      type="checkbox"
                      checked={s.ocrAtCapture}
                      onChange={(e) => set("ocrAtCapture", e.target.checked)}
                      className="size-3.5 accent-zinc-900"
                    />
                    Extract text at capture time
                  </label>
                  <p className="pl-6 text-[11.5px] leading-5 text-zinc-500">
                    Recognizes text on-device while capturing, so it survives in the saved document —
                    powering suggested alt text, library search, and the sensitive-data scan.
                  </p>
                </div>
              </div>
            </div>
          )}

          {startError && (
            <p className="mt-6 text-[12px] leading-5 text-red-600">{startError}</p>
          )}

          <div className="mt-9 flex items-center gap-3">
            <button
              onClick={start}
              className="rounded-md bg-zinc-900 px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Start capture
            </button>
            <button
              onClick={onCancel}
              className="rounded-md px-4 py-2.5 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-900"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

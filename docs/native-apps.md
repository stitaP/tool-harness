# Native apps — architecture & build guide

stitaP ships as a web app, a browser extension, and native desktop apps — all
from one codebase. This document maps the platform matrix, what is shared
versus platform-specific, and the honest limits of each target.

## One codebase, four shells

```
                    ┌────────────────────────────────────────────┐
                    │  Shared: React UI + Convex backend         │
                    │  (editor, library, OCR, NLP, hybrid SVG,   │
                    │   redaction, metadata, export)             │
                    └──────────────┬─────────────────────────────┘
                                   │
        ┌──────────────┬───────────┴───────────┬───────────────┐
        │              │                       │               │
   Web app         Extension              Desktop (Tauri)     Android (Tauri)
   (browser)    (Chrome/Edge)          Windows · macOS · Linux  (mobile)
        │              │                       │               │
   ┌────┴────┐   ┌─────┴─────┐   ┌─────────────┴──────────┐  ┌──┴──────────┐
   │ Rust    │   │ current-  │   │ Embedded Rust engine   │  │ remote      │
   │ engine  │   │ tab:      │   │ (stitap crate, in-     │  │ engine via  │
   │ (server)│   │ viewport, │   │ process, 127.0.0.1)    │  │ HTTPS +     │
   │         │   │ full-page,│   │ + same web UI          │  │ demo +      │
   │         │   │ region    │   │                        │  │ MediaProj.  │
   └─────────┘   └───────────┘   └────────────────────────┘  └─────────────┘
```

### The shared core (everything that already exists, reused as-is)

| Piece | Where | Reused by |
|---|---|---|
| Capture engine (own HTTP, WS, CDP, PNG/WebP/JPEG, SVG) | `engines/` (Rust, zero external crates) | Web (server), Desktop (embedded), Android (remote) |
| React UI — editor, library, OCR/NLP, hybrid SVG, export | `src/` | Web, Desktop, Android |
| Convex backend (captures, auth, embeddings, policy) | `src/convex/` | All |
| Current-tab extension (viewport/full-page/region) | `extension/` | Desktop browsers only |

## Feature matrix

| Feature | Web | Extension | Desktop app | Android app |
|---|---|---|---|---|
| Built-in demo capture (all modes) | ✅ | — | ✅ | ✅ |
| URL capture (remote engine) | ✅ | — | ✅ (fallback) | ✅ |
| URL capture (local/offline engine) | — | — | ✅ embedded | — |
| Current-tab viewport/full-page/region | — | ✅ | —¹ | — |
| OS screen / region capture | — | — | ✅ native | 🚧 MediaProjection |
| Editor, redaction, annotations | ✅ | — | ✅ | ✅ |
| OCR-at-capture, NLP, vector search | ✅ | — | ✅ | ✅ |
| Library upload / sync | ✅ | ✅ (relay) | ✅ | ✅ |

¹ Desktop browsers: use the extension. A future native screen-capture module
(per-OS: BitBlt / CGWindowList / XGetImage) would replace it inside the app —
see roadmap.

## Desktop (Windows · macOS · Linux) — `desktop/`

Tauri v2 shell. The **engine is compiled into the app** (`stitap` crate path
dependency) and serves on `127.0.0.1` on a background thread
(`engines/src/desktop.rs` — `LocalEngine`, stoppable via a polled non-blocking
listener). The webview discovers it through the Tauri IPC bridge and routes URL
captures to it (`src/lib/capture/desktop.ts`), so URL capture works **offline**
— no CAPTURE_SERVICE_URL, no API key, nothing leaves the machine.

Commands exposed to the webview: `engine_url`, `engine_running`, `stop_engine`, `capture_screen`, `capture_screen_region`, `screen_bounds`.

### Native OS screen capture

The desktop app includes Snagit-style screen capture: click **Capture Screen**
in the header → fullscreen overlay → drag a region → the native engine captures
the screen pixels directly from the OS compositor (Windows BitBlt, macOS
CGWindowList, Linux XGetImage — all raw FFI, zero external crates). The
overlay scrim never appears in the result because the capture happens at the
compositor level, not from the webview. The cropped PNG is loaded directly
into the editor as a full CaptureDocument, ready for annotation and export.

Engine endpoints (also available via the embedded HTTP server for CLI use):
- `GET /v1/screen/capture` — full primary screen → PNG
- `GET /v1/screen/region?x=&y=&width=&height=` — rectangular region → PNG
- `GET /v1/screen/bounds` — primary display bounds as JSON

### Build (run on each target OS)

```bash
bun install && bun run build
cd desktop/src-tauri
cargo tauri build        # → .msi/.exe (Win), .dmg/.app (macOS), .deb/AppImage (Linux)
```

Requirements: Rust ≥ 1.77.2 (Tauri MSRV), Bun, plus per-OS system packages
(see `desktop/README.md`). Icons: `desktop/src-tauri/icons/icon.png` →
`bunx tauri icon` regenerates the platform set.

## Android — Tauri mobile

The same web UI runs in the Android WebView. URL capture goes to your
self-hosted engine over HTTPS (the phone has no local Chromium to drive);
demo capture, editor, OCR/NLP, and library work in-app.

```bash
cd desktop/src-tauri
bunx tauri android init   # scaffolds gen/android (needs Android Studio/SDK)
bunx tauri android build
```

### Android native screen capture (roadmap)

`getDisplayMedia` is desktop-only, and Chrome for Android can't run the
extension — so "grab what's on this phone's screen" needs the OS
**MediaProjection** API: a small Kotlin module (Tauri plugin) that requests the
user's screen-capture permission, records the surface, and hands frames to the
app for region cropping. Design fits the existing `RasterTile` pipeline.

## Honest limits

- **Native builds need their platform SDKs** — this repo's dev environment has
  neither Windows/macOS toolchains nor Android SDK, so the desktop/mobile
  shells are verified by code review + the engine's in-repo tests; first real
  build happens on a machine with the SDK.
- **Mobile browsers can't capture screens** (no extensions, no
  `getDisplayMedia`) — see the capture panel's mobile notice.
- **Native OS screen capture is now implemented** in `engines/src/screen.rs`
  (Windows BitBlt / macOS CGWindowList / Linux XGetImage) and wired into the
  Tauri shell via IPC commands. The "Capture Screen" button in the desktop
  header triggers a fullscreen overlay → drag → capture → editor pipeline.
  On Linux, `libx11-dev` is required at build time; on macOS, no extra system
  libraries are needed; on Windows, the GDI32 and user32 system libraries are
  always present.

## Verification status

- Engine: `cargo test` — 30 unit + 3 e2e (incl. `desktop::tests`:
  local-engine health + stop + route rejection).
- Frontend: `bun tsc -b --noEmit` clean; capture-smoke 425/425.
- Tauri shell: compiles clean on Rust 1.97 (installed rustup); `cargo check`
  passes with no errors. Native screen capture endpoints verified by the
  engine's lib tests.

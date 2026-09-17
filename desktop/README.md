# stitaP Desktop — desktop app (Windows · macOS · Linux)

One native binary per platform. The web UI is the same React app; the capture
engine (`engines/`) is compiled **into** the app — no sidecar, no external
capture libraries. URL captures run on the embedded engine at
`http://127.0.0.1:17865` (or an ephemeral port), so they work fully offline.

See `docs/native-apps.md` for the full platform matrix and per-OS build steps.

## Prerequisites (on the machine that builds)

- **Rust ≥ 1.77.2** (the Tauri crate's MSRV — the engine itself builds on 1.75)
- **Bun** (builds the web frontend)
- Per-OS system packages — see below

## Build

```bash
# 1. build the web frontend (uses the repo's package.json)
bun install
bun run build            # emits dist/

# 2. build the native app
cd desktop/src-tauri
cargo build --release    # or: bunx tauri build
```

`bunx tauri build` produces:

| OS      | Output |
|---------|--------|
| Windows | `target/release/bundle/msi/stitap-*.msi` + NSIS `.exe` |
| macOS   | `target/release/bundle/dmg/stitap-*.dmg` + `.app` |
| Linux   | `target/release/bundle/deb/…deb` + AppImage |

## Dev mode

```bash
cd desktop/src-tauri
bunx tauri dev   # starts vite (bun run dev) and opens the native window
```

The window loads the same app on `localhost:5173`; the embedded engine is
reported to the webview via `window.__TAURI__` → `engine_url` and the app
routes URL captures to it automatically.

## Per-OS system packages

- **Windows**: no extra packages (WebView2 ships with Windows 10/11).
- **macOS**: Xcode command line tools (`xcode-select --install`).
- **Linux**: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev` (Debian/Ubuntu) plus `build-essential pkg-config`.

## Icons

`src-tauri/icons/icon.png` is the base icon (from `extension/icons/128.png`).
Run `bunx tauri icon path/to/icon.png` on the build machine to regenerate the
full platform set (`.ico`, `.icns`, …) before bundling.

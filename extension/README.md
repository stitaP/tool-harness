# Vectra Capture — browser extension (Manifest V3)

Snagit-style capture of the page you're **already viewing** — the only path
that can capture authenticated, VPN-gated, or local-network pages (no URL
service can reach those). Pixels only: cookies, form values, and DOM text
never leave the browser.

Full plan and architecture: `../docs/current-tab-extension.md`.

## What works now (Phases B–D)

- **Viewport capture** — captures the visible page as a PNG
  (`chrome.tabs.captureVisibleTab`, compositor-level, so cross-origin images /
  canvas / WebGL render correctly), previews it in the popup, and lets you
  download it.
- **Full-page capture** — scrolls the whole page (lazy content loads first,
  capped at 100,000 CSS px / 40 passes), pauses animations and videos, hides
  fixed/sticky elements so headers don't repeat in every tile (captured once
  at the top, footers once at the bottom), **stitches the tiles in an offscreen
  document** (off the popup thread, same exact-slice output), and restores the
  page exactly as you left it — even if the capture fails.
- **Save to library** — the popup hands the stitched PNG to an open Vectra
  workspace tab, which performs the signed-in Convex upload
  (`createExtensionUpload` → `saveExtensionCapture`) and reports the outcome;
  the capture then appears in your library and opens in the editor like any
  other. No credentials ever leave the app — the extension never holds a
  Convex session. Not signed in? The popup offers **Open Vectra to sign in**.
- **Workspace integration** — the content script runs on the Vectra app
  origins (manifest `content_scripts`), so the "Current tab" card flips to
  **Connected** automatically, and library rows from the extension open as
  editable captures (PNG → portable SVG).

## Packaging (Phase E — done)

- `bun run gen:extension-icons` — regenerates `icons/` (16/32/48/128) plus
  the Chrome Web Store assets in `store/` (`icon-440.png` listing icon,
  `marquee-1280x800.png` promotional tile).
- `bun run package:extension` — validates `manifest.json` (version `N.N.N`,
  every referenced file exists) and zips the extension into
  `releases/vectra-capture-v<version>.zip`, ready to upload.

See `../docs/web-store-listing.md` for the full store listing copy,
permission justifications, privacy-policy text, and the signed-update flow
(store-published versions update automatically; `update_url` self-hosting is
an enterprise-only, deprecated path — don't add it).

## Load it (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the **V** icon from the puzzle-piece menu.

The only `host_permissions` are the Vectra workspace origins themselves (the
upload channel — see `APP_ORIGIN_PATTERNS` in `src/shared.js`), so there is
no "reads all sites" warning at install: the extension can only touch the
tab you click it on (`activeTab`) plus the Vectra app tab it hands captures to.

## Test it

1. Open any page (e.g. the Vectra demo at `/demo`).
2. Click the Vectra icon → the popup shows the tab, mode, and a consent note.
3. **Viewport**: click **Capture** → preview + dimensions → **Download PNG**.
4. **Full page**: switch to **Full page** mode → **Capture** → watch the
   progress bar (lazy-load pass, then per-tile) → preview of the stitched
   page + dimensions → **Download PNG**.
   - Try a page with a sticky header (e.g. a docs site) and confirm the
     header appears once, at the top.
   - Try a long page with lazy-loaded images and confirm the full height is
     captured.
   - Confirm your scroll position is exactly where you left it afterwards.
5. Open the Vectra workspace (a signed-in page), click the icon once — the
   "Current tab" source card shows **Extension connected**.

Known limits: very tall pages are exported up to the browser bitmap cap
(16,000 device px / 40 MP) with a warning — the capture is saved at that
height; if the page changes height during the capture pass the tail may be
cut off; if the popup closes mid-capture the job is cancelled and the page
restored; uploading requires the Vectra workspace to be open and signed in
in the same browser (otherwise the popup guides you).

Restricted pages (`chrome://`, Chrome Web Store, PDF viewer) are disabled in
the popup.

## Layout

```
extension/
  manifest.json      MV3 — activeTab, scripting, storage, offscreen + app origins
  src/
    shared.js        limits, tile math, app-origin patterns, upload caps
    background.js    viewport capture, full-page orchestration, offscreen stitch,
                     upload relay
    content.js       freeze, fixed-element handling, lazy scroll, restore,
                     page⇄worker relay
    offscreen.html/js  tile stitching worker
    popup.html/css/js  mode picker, progress, stitch, preview, download, save
  icons/             16/32/48/128 (regenerate: bun run gen:extension-icons)
  store/             Web Store listing assets (icon-440.png, marquee-1280x800.png)
  releases/          packaged zips (bun run package:extension)
```

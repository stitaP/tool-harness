# Current-Tab Capture Extension — Plan

Snagit-style capture of the page you are already viewing, for pages that a URL
capture service cannot reach (SSO/VPN-gated, local-network dev servers, or
authenticated SPAs like `http://as21p.ch3.dev.i.com:8081/plasmastudio/#/tabs/models`).

## Phase A — backend + workspace (done)

- Schema: `captures.source` column, optional `"demo" | "url" | "extension"`
  (unset for legacy rows).
- `createExtensionUpload` mutation — auth-gated; returns
  `{ uploadUrl, sessionId, expiresAt }` (TTL `EXT_UPLOAD_TTL_MS` = 5 min;
  `sessionId` is informational, the upload URL itself is single-use).
- `saveExtensionCapture` mutation — auth-gated; validates geometry/mode via the
  shared pure guard `validateExtensionPayload` (see `src/lib/capture/extension.ts`,
  also exercised by the smoke test), then inserts a `source: "extension"` row
  with defaulted description/tags/thumbnail.
- Workspace: “Current tab” source card that pings for the extension and shows
  Connected / install steps; a capture-saved toast; and a graceful message when
  a library row points at a PNG (editor opening arrives with Phase D).
- Wire protocol constants live in `src/lib/capture/extension.ts` — the
  extension mirrors these shapes in plain JS.

## Message protocol (workspace ↔ extension)

Channel: `window.postMessage(msg, "*")`. Foreign messages are ignored via the
`source` field.

Workspace → extension:

```js
{ source: "stitap-workspace", type: "STITAP_EXT_PING" } // sent when the panel mounts
```

Extension → workspace:

```js
// Passive broadcast on every page load (or in response to the ping)
{ source: "stitap-extension", type: "STITAP_EXT_STATUS",
  payload: { installed: true, version: "0.1.0" } }

// After a successful upload → workspace toasts + library row appears reactively
{ source: "stitap-extension", type: "STITAP_EXT_CAPTURE_SAVED",
  payload: { title, width, height } }
```

The core principle from the capture-engine blueprint (Step 2, §5.1): the user
captures a tab they are already authenticated in, and **no credentials ever
leave the browser** — only rendered pixels and approved metadata.

---

## 1. Why this is needed

| Capture source | Reaches auth'd pages? | Reaches local-network pages? |
|---|---|---|
| Built-in demo page | n/a | n/a |
| Any URL (self-hosted capture service) | ❌ No (no login session, can't reach your VPN) | ❌ No |
| **Current tab (extension)** | ✅ Yes — you're already logged in | ✅ Yes — it's your browser |

The extension is the only path that can capture the plasmaster studio example.

## 2. Architecture

```
Your browser (the authenticated page)
  └─ stitaP Capture extension (Manifest V3)
       ├─ Popup                  — click to start, choose mode, show progress
       ├─ Content script         — discovery, freeze, lazy scroll, restore
       ├─ Background worker      — orchestrates tiles, talks to stitaP
       └─ Offscreen document     — stitches tiles into one PNG
              │  HTTPS + short-lived, single-use upload token
              ▼
stitaP backend (Convex)
  ├─ createExtensionUpload      — auth check → storage upload URL + session
  ├─ saveExtensionCapture       — store PNG + metadata → library record
  └─ Workspace                  — open from library → annotate → export SVG
```

Key difference from the blueprint: the blueprint assumes a local desktop app as
the "capture controller". Here the controller is the extension itself, and the
stitaP backend is only the *storage + editing* endpoint — it never sees the
page's cookies, storage, or auth state.

## 3. Permissions (no scary install warnings)

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "scripting", "storage", "offscreen"],
  "host_permissions": []
}
```

- `activeTab` grants access **only when the user clicks the action** — no
  "reads all sites" warning at install time.
- No `host_permissions`, so the extension cannot silently read arbitrary tabs.

## 4. Capture protocol (mirrors the engine's job lifecycle)

1. **Click** the toolbar icon → popup queries `chrome.tabs.query` for the active
   tab: URL (fragment preserved — SPA routes like `#/tabs/models` matter), title,
   viewport dimensions.
2. **Configure** — popup offers mode (Viewport / Full page), width/height/scale
   (defaults from the workspace's request panel), and a one-line consent note
   ("Pixels and page URL only — no credentials, no form data").
3. **Inject** the content script into the active tab via `chrome.scripting`
   (granted by `activeTab`).
4. **Discover + freeze** (content script, runs in page context):
   - record scroll positions and page geometry (reuse `PageGeometrySnapshot` style checks),
   - inject the capture-only freeze stylesheet
     (`animation-play-state: paused; caret-color: transparent; transition-property: none`),
   - detect fixed/sticky elements for the capture-once-hide-later strategy.
5. **Scroll + capture tiles**: content script scrolls incrementally
   (stepRatio ≈ 0.8 of viewport, lazy-load delay per pass, maxPasses 40,
   maxHeight 100,000 CSS px — the engine's own constants). Background takes
   `chrome.tabs.captureVisibleTab` per tile.
   - `captureVisibleTab` is a **compositor-level** capture, so cross-origin
     images, canvas, WebGL and gradients render correctly — no canvas-taint
     problem, which is exactly what auth'd pages need.
6. **Stitch**: tiles → offscreen document → one PNG. For pages over the
   single-bitmap limit, keep tiles and produce **tiled SVG output** (multiple
   `<image>` elements in one coordinate system), matching the engine's
   `MAX_TILE_HEIGHT` behavior.
7. **Restore** (always, even on failure): restore scroll positions, remove the
   freeze stylesheet, re-show fixed elements.
8. **Upload**: call `createExtensionUpload` (user must be signed in to stitaP in
   the same browser) → PUT the PNG to the returned upload URL → call
   `saveExtensionCapture` with metadata → the workspace library shows the new
   capture and the user can annotate/export it like any other.
9. **Cleanup**: upload token is single-use and short-lived; no tiles or buffers
   persist beyond the job.

## 5. Privacy contract — what NEVER leaves the tab

Only: rendered pixels, page URL, tab title, viewport dims, capturedAt, mode.

Never: cookies, localStorage, sessionStorage, form values, DOM text (v1),
request headers, auth tokens, browser history. `removeFormValues` is implied —
pixels only, no DOM extraction at all in v1.

## 6. Backend additions (Convex — this repo, shipped in Phase A)

- `createExtensionUpload` mutation: `getAuthUserId` → reject unauthenticated →
  `ctx.storage.generateUploadUrl()` → return `{ uploadUrl, sessionId, expiresAt }`.
  (upload URL TTL 5 min; the PNG size cap `EXT_MAX_UPLOAD_BYTES` = 15 MB is
  enforced client-side by the extension before upload).
- `saveExtensionCapture` mutation: args `{ storageId, title, url, width, height,
  deviceScaleFactor, mode, capturedAt, thumbnail?, description?, tags? }` →
  geometry/mode guards via `validateExtensionPayload` (width ≤ 200 000,
  height ≤ 500 000, scale 1–3, mode viewport|full-page, title ≤ 300 chars) →
  insert into `captures` with `source: "extension"`.
- Schema: `captures.source` column added (optional, unset for existing rows).

## 7. Files (Phase B shipped; Phase C/D extend)

```
extension/
  manifest.json           MV3 — activeTab, scripting, storage, offscreen
                          + app-origin host_permissions/content_scripts (v0.3.0)
  src/popup.html|css|js   mode picker, consent, stitch, preview, download, save-to-library
  src/content.js          status broadcast, freeze/scroll/restore + page⇄worker relay
  src/background.js       viewport capture, full-page orchestration, offscreen stitch,
                          upload relay (finds the app tab, resolves the popup's request)
  src/offscreen.html|js   tile stitching worker (Phase D)
  src/shared.js           limits + tile math + app-origin patterns + upload caps
  icons/                  16/32/48/128 (regenerate: bun run scripts/gen-extension-icons.ts)
```

Load via `chrome://extensions` → Developer mode → Load unpacked. Web Store
packaging is Phase E — done in-repo: `bun run package:extension` builds a
validated zip into `extension/releases/`, store icons/marquee live in
`extension/store/`, and `docs/web-store-listing.md` has the listing copy,
privacy text, and signed-update flow. Uploading to the dev console and
capturing real screenshots are the remaining human steps.

## 8. Edge cases & failure handling

- **Infinite scroll** → pass/height/duration limits, stop, tell the user
  ("captured the first N px — captured content only").
- **Virtualized lists** → tile + stitch each visible section (same strategy as
  the engine), raster output with a warning.
- **Fixed/sticky headers** → capture once in first tile, `visibility: hidden`
  (not `display:none` — avoids layout shift) during middle tiles, restore after.
- **Tab navigates/closes mid-capture** → cancel, cleanup partial state, surface
  "capture interrupted" in the popup.
- **Not signed in to stitaP** → popup offers "Open stitaP to sign in", keeps the
  user's place.
- **Upload failure** → two retries, then a clear error; tiles are discarded.
- **Very tall pages** → tiled SVG output rather than one giant bitmap.

## 11. Phase C — full-page capture (shipped)

New files: `extension/src/shared.js` (constants + `planFullPageTiles`, mirrors
`src/lib/capture/extension.ts` — the smoke test cross-checks the pure math),
and message handlers inside `content.js` / orchestration inside `background.js`.

### Internal message flow (popup ⇄ background ⇄ content)

```
popup ──connect({name:"stitap-fullpage"})──▶ background
popup ◀──{type:"STITAP_EXT_PROGRESS", phase, current, total}── background
background ──tabs.sendMessage──▶ content
  STITAP_EXT_PREPARE       freeze + discover fixed/sticky → {viewport, dpr, docHeight, fixedCount}
  STITAP_EXT_SCROLL_STEP   scroll down stepRatio×viewport, settle → {y, docHeight, atBottom}
  STITAP_EXT_SCROLL_TOP    back to the top
  STITAP_EXT_CAPTURE_TILE  scrollTo(y) + per-tile fixed visibility + settle
  STITAP_EXT_RESTORE       remove stylesheet, restore videos + scroll (guaranteed, in finally)
background ──captureVisibleTab──▶ tile PNGs
background ──{type:"STITAP_EXT_DONE", tiles, meta}──▶ popup (or STITAP_EXT_ERROR)
```

### Fixed/sticky strategy (blueprint §11)

- Discovery at PREPARE (scroll 0): `position: fixed` elements are classified
  by viewport anchoring (`top` → visible only in tile 0, `bottom` → visible
  only in the last tile); `position: sticky` elements are hidden whenever they
  are stuck to a viewport edge (`rect.top <= 0 || rect.bottom >= innerHeight`).
- Hiding uses `visibility: hidden !important` (never `display`) so layout does
  not shift. All classes are removed on RESTORE.
- Caveats: fixed sidebars behave as top-anchored (captured once at the top),
  and fixed elements inside iframes are invisible to the content script.

### Limits & failure handling

- Lazy loop stops at: 2 stable bottom passes, `MAX_PASSES` (40), or
  `MAX_CAPTURE_HEIGHT` (100,000 CSS px — the engine's §26 default).
- `planFullPageTiles` pins the final tile to `docHeight − viewportHeight` so
  the page tail is always captured; tiles are contiguous (may overlap by
  < viewport at the tail — frozen page + hidden fixed elements make the
  overlap rows identical, so in-order stitching is seamless).
- Popup stitch enforces canvas limits (`STITCH_MAX_DEVICE_HEIGHT` 16 000 px,
  `STITCH_MAX_PIXELS` 40 MP) with a visible warning; full-height tiled export
  is Phase D.
- The open runtime port keeps the service worker alive; closing the popup
  mid-job aborts the loop and the `finally`-block RESTORE still runs.

## 9. Phased build plan

| Phase | Scope |
|---|---|
| **A — Backend + workspace** (this repo) | ✅ Done — `createExtensionUpload`, `saveExtensionCapture`, schema `source` field, "Current tab" source card with install + status UI, capture-saved toast, PNG-open guard |
| **B — MV3 scaffold** (extension/) | ✅ Done — manifest, popup (Minimalism-styled), content script, background worker; **viewport capture** live (preview + PNG download in popup), workspace card flips to Connected via injected status broadcast. Icons generated by `scripts/gen-extension-icons.ts` |
| **C — Full page** | ✅ Done — freeze stylesheet (animations/transitions/carets/video), incremental lazy scroll (stepRatio 0.8, maxPasses 40, maxHeight 100k), fixed/sticky capture-once-hide-later (headers in tile 0, footers in the last tile), guaranteed scroll/video/stylesheet restore (even on failure), popup progress + exact-slice stitch + PNG download. Full-page job runs over a named runtime port (keeps the SW alive). See §11 below. |
| **D — Stitch + upload** | ✅ Done — offscreen-document stitching (popup thread no longer does the heavy canvas work), upload via the workspace upload bridge (`createExtensionUpload` / `saveExtensionCapture` called by the *signed-in workspace page*, never the extension), retries + timeouts, popup progress, sign-in CTA, and PNG captures now open in the editor. See §12 below. |
| **E — Distribution** | ✅ Done (packaging) — `bun run package:extension` (manifest validation + deterministic zip → `extension/releases/`), store asset set (440×440 icon + 1280×800 marquee → `extension/store/`), manifest v0.4.0 polish (`version_name`, `minimum_chrome_version` 116), full listing copy + permissions + privacy policy + signed-update flow in `docs/web-store-listing.md`. Remaining human steps: dev-console upload, real screenshots, review/publish. |

## 12. Phase D — offscreen stitching + library upload (shipped)

New files: `extension/src/offscreen.html|js` (stitch worker) and the upload
bridge `src/components/capture/use-extension-upload-bridge.ts` (app side).

### Stitching off the popup thread

1. Full-page capture finishes → the popup sends `STITAP_EXT_STITCH_REQUEST`
   `{tiles, meta}` to the background.
2. The background creates the offscreen document (`chrome.offscreen`, reason
   `BLOBS`) and forwards `STITAP_OFFSCREEN_STITCH`.
3. The offscreen worker draws the exact-slice tiles in order onto a capped
   canvas (same `STITCH_MAX_DEVICE_HEIGHT` / `STITCH_MAX_PIXELS` limits) and
   replies with a PNG data URL.
4. The popup previews/downloads that PNG; the in-popup stitch remains as a
   fallback if the offscreen path is unavailable.

### Upload — the workspace is the uploader, not the extension

The extension never holds a Convex session, so no credentials cross the
boundary. Instead:

1. Popup → background `STITAP_EXT_UPLOAD_REQUEST` `{dataUrl, meta}`.
2. Background finds an open stitaP app tab (`APP_ORIGIN_PATTERNS` in
   `shared.js`, mirrored by `host_permissions` + `content_scripts` in the
   manifest) and relays the capture to the page via the content script
   (`STITAP_EXT_PAGE_POST`).
3. The workspace app (`useExtensionUploadBridge`) accepts it
   (`parseExtensionMessage` — source-tagged, so foreign pages can't inject
   uploads), then calls `createExtensionUpload` → PUT (two retries) →
   `saveExtensionCapture` with a generated thumbnail, using its own signed-in
   Convex client.
4. The workspace posts `STITAP_EXT_UPLOAD_RESULT` `{requestId, ok, error?}`;
   the content script relays it to the background, which resolves the popup's
   promise. A 35 s timeout guards against a missing/hung app tab.

Failure handling: `not-signed-in` → popup shows **Open stitaP to sign in**
(opens the last-seen app origin recorded by the content script in
`chrome.storage.local`); `timeout` / `workspace-unavailable` → guidance to
open the app tab and retry; a 15 MB PNG cap is enforced in the popup before
anything is sent.

### Extension PNGs open in the editor

`Workspace.openCapture` detects a non-SVG stored file (PNG), fetches it,
rebuilds a tiled `CaptureDocument` via `rasterDocumentFromDataUrl`
(`engine.ts` — CSS px ÷ deviceScaleFactor, sliced to `MAX_TILE_HEIGHT`),
and regenerates a portable SVG so the capture can be annotated, cropped,
redacted, validated and exported like any other.

## 10. Testing

- Manual: capture the stitaP demo page (public sanity check), then an auth-gated
  page (e.g. the plasmaster studio) in the same session.
- Verify the uploaded metadata contains no cookies/headers/form values.
- Verify scroll position and animations are restored after capture.
- Verify the extension PNG flows through the same portable-SVG pipeline as the
  other sources (validate via `<img>` render, then annotate + export).
- Add smoke-test cases for `createExtensionUpload` / `saveExtensionCapture`
  guards once they exist.

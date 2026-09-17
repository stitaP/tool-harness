# Self-hosting the capture service (the ScreenshotOne replacement)

stitaP's URL-capture mode renders pages through **our own open-source capture
service** — the from-scratch Rust engine in `engines/` (binary: `captured`).
It launches headless Chromium over our own Chrome DevTools Protocol client and
returns image bytes over a small REST API. **No Playwright, no Hono, no sharp,
no paid API** — the only external piece anywhere in the pipeline is the
Chromium binary (a platform component, like the OS).

```
GET/POST /v1/capture?url=…&format=png&full_page=true&…
        │
        ▼
  ┌──────────────────────────────────────────┐
  │ captured  (Rust, std-only — engines/)    │  ← our own HTTP server
  │   ├─ SSRF guard, API-key auth,           │     WebSocket client
  │   │    rate limiting, option clamping    │     JSON parser/stringifier
  │   └─ our own CDP client → Chromium       │     SHA-1, base64, PNG decode
  └──────────────────────────────────────────┘
        │
        ▼
  PNG bytes (Content-Type: image/png)
```

## Quick start

```bash
# from the repository root — compiles the engine and runs it on :8080
docker compose up --build capture-service

curl "http://localhost:8080/v1/capture?url=https://example.com" \
  -H "Authorization: Bearer change-me" -o shot.png
```

Without Docker, run the binary directly (needs a Chromium on the machine):

```bash
cd engines
cargo build --release
CAPTURE_API_KEYS=change-me ./target/release/captured   # http://localhost:8080
```

## The API

### `GET /v1/capture` · `POST /v1/capture`

POST accepts a JSON body with the same parameter names. Errors are JSON:
`{ "message": "…" }`.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `url` | string | — | Required. Public http(s) only; SSRF rules block private/loopback/credential URLs. |
| `format` | `png` | `png` | **PNG is the only format implemented so far** — `webp`/`jpeg` return a clear 400 (from-scratch WebP/JPEG encoders are on the roadmap, see `docs/independence-review.md`). |
| `full_page` | bool | `false` | Whole scrollable page. Taller than the configured cap → 413. |
| `viewport_width` / `viewport_height` | int | `1440` / `900` | Viewport CSS px (clamped). |
| `device_scale_factor` | int | `1` | 1–3 (clamped). |
| `block_ads` | bool | `true` | Aborts requests to known ad/tracker hosts inside Chromium. |
| `omit_background` | bool | `false` | Transparent where the page has none. |
| `wait_until` | `load` \\| `domcontentloaded` \\| `networkidle` | `load` | Readiness. |
| `selector` | string | — | Wait for this selector before capturing (max 500 chars). |
| `delay` | int | `100` | Settle time (ms) after readiness. |
| `timeout` | int | `30000` | Capture budget (ms, clamped). |

Success responses carry `X-Capture-Width`, `X-Capture-Height` and
`X-Capture-Duration-Ms` headers.

### `GET /health`

`{ "status": "ok", "version": "…", "openMode": false }`

## Environment variables (service)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Bind address. |
| `CAPTURE_API_KEYS` | *(open mode)* | Comma-separated accepted keys. Unset ⇒ open mode (warning logged). |
| `CAPTURE_RATE_LIMIT` | `60` | Requests/minute per identity; `0` disables. In-memory — one instance per host. |
| `CAPTURE_MAX_VIEWPORT_WIDTH` | `3840` | Clamped, never an error. |
| `CAPTURE_MAX_VIEWPORT_HEIGHT` | `2160` | Clamped, never an error. |
| `CAPTURE_MAX_DEVICE_SCALE_FACTOR` | `3` | Clamped, never an error. |
| `CAPTURE_MAX_FULLPAGE_HEIGHT` | `30000` | Taller full-page captures are rejected (413). |
| `CAPTURE_MAX_TIMEOUT_MS` | `120000` | Upper bound for `timeout`. |
| `CAPTURE_ALLOW_PRIVATE_HOSTS` | `false` | Opt-in: allow capturing private/local-network URLs (e.g. internal dashboards). Off by default — the SSRF guard blocks private hosts unless you set this. |
| `CAPTURE_BROWSER_PATH` | *(auto-detect)* | Explicit Chromium binary; the Docker image sets `/usr/bin/chromium`. |

## Wiring it into the web app

1. Run the service somewhere reachable from your Convex deployment (localhost
   works for local dev; a private-network host works for a hosted deployment).
2. In the project's **Keys / API keys** tab set:
   - `CAPTURE_SERVICE_URL` — e.g. `http://capture-service:8080` or `http://192.168.1.20:8080`
   - `CAPTURE_SERVICE_API_KEY` — any key from `CAPTURE_API_KEYS` (omit if open mode)
3. URL captures in the app now render through your service. The demo-page
   capture path never touches it.

The Convex action (`src/convex/captureUrl.ts`) still enforces its own SSRF
rules and re-validates every redirect hop before forwarding, so the service is
defense-in-depth, not the only defense.

## Security model

- **SSRF guard at the edge** (`engines/src/core/ssrf.rs` + the same rules in
  the app): scheme allowlist, private/loopback/link-local/CGNAT/ULA blocks,
  credential rejection.
- **One browser per request**: a fresh headless Chromium launch per capture,
  always torn down (process killed, user-data dir removed) even on failure.
  No cookies or state cross requests.
- **Hard budgets**: per-request timeout, viewport/scale/full-page caps that
  clamp rather than trust input, plus an optional rate limit.
- **The page never touches your host network** beyond its own requests through
  Chromium; nothing on the host is exposed to page scripts.
- **Static output**: the response is an image file — no scripts or markup
  reach your clients.

Deploy behind a reverse proxy (Caddy/nginx) for TLS and set `CAPTURE_API_KEYS`
before exposing anything beyond a trusted network. `CAPTURE_RATE_LIMIT` is
in-memory; for a multi-instance deployment put a Redis-backed limiter in front.

## Production notes

- The Docker image (`engines/Dockerfile`) compiles the engine in a Rust stage
  and ships slim Debian + Chromium — no Node, no npm. It runs as a non-root
  user; Chromium is launched with `--no-sandbox` + `--disable-dev-shm-usage`,
  and compose sets `shm_size: 1gb` (Chromium's default 64 MB `/dev/shm` is too
  small for real pages).
- Very tall full-page captures are rejected above `CAPTURE_MAX_FULLPAGE_HEIGHT`
  rather than silently truncated — raise the cap only if your Chromium can
  handle the memory, or switch those requests to viewport/region mode.
- The service speaks plain HTTP by design; TLS belongs at the proxy.

## Migrating from ScreenshotOne

The API is parameter-compatible for the parameters stitaP uses (`url`,
`format`, `full_page`, `viewport_width`, `viewport_height`,
`device_scale_factor`, `block_ads`, `cache`, `timeout`). Swap the base URL from
`https://api.screenshotone.com/take` to `{your-service}/v1/capture` and use
your own key in place of the ScreenshotOne access key. The `cache` parameter is
accepted and ignored (this service always captures fresh).

## Development & testing

```bash
cd engines
cargo test                       # pure-logic unit tests (no browser needed)
cargo test --test e2e_capture    # full pipeline against real Chromium:
                                 # our HTTP server → our CDP client → PNG check
```

The browser-gated e2e test skips automatically when no Chromium binary is
present, so CI stays hermetic. See `engines/README.md` for the module map.

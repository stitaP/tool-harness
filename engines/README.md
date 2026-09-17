# Vectra engines — the from-scratch capture pipeline

Everything the capture product does that used to be a third-party library or a
paid API now lives here, written against the **Rust standard library only** —
zero external crates, zero npm packages, no Playwright, no Hono, no sharp.

```
engines/
├── src/
│   ├── http.rs       HTTP/1.1 server + client (std::net, threaded)
│   ├── ws.rs         RFC 6455 WebSocket client (handshake, framing, masking)
│   ├── cdp.rs        Chrome DevTools Protocol client — our own "Playwright":
│   │                 launch headless Chromium, navigate, readiness, selector
│   │                 waits, lazy-scroll walk, motion freeze, screenshot
│   ├── json.rs       JSON parser + stringifier
│   ├── png.rs        PNG encoder (filters, LZ77, fixed-Huffman DEFLATE, CRC-32)
│   ├── svg.rs        SVG serializer helpers
│   ├── server.rs     `captured` REST API: /v1/capture (GET+POST), /health,
│   │                 API-key auth, rate limiting, option clamping, SSRF guard
│   ├── cli.rs        `capture-cli` — one-shot screenshot to a PNG file
│   └── core/         base64, SHA-1, SSRF rules, time
├── tests/
│   └── e2e_capture.rs  browser-gated end-to-end test (skip when no Chromium)
├── scripts/
│   └── debug-launch.ts one-shot browser-launch diagnostic (dev only)
├── Dockerfile        multi-stage: rust build → slim Debian + Chromium
└── Cargo.toml
```

The only external piece anywhere in the pipeline is the **Chromium binary** —
a platform component, like the OS. Every byte of the protocol is ours.

## Build

```bash
cd engines
cargo build --release     # binaries: target/release/captured, capture-cli
```

## Run the server

```bash
# needs a Chromium binary on PATH or at $CAPTURE_BROWSER_PATH
CAPTURE_API_KEYS=change-me cargo run --bin captured
curl "http://localhost:8080/v1/capture?url=https://example.com" \
  -H "Authorization: Bearer change-me" -o shot.png
```

Environment (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Bind address |
| `CAPTURE_API_KEYS` | *(open mode)* | Comma-separated accepted keys |
| `CAPTURE_RATE_LIMIT` | `60` | Requests/minute per identity; `0` disables |
| `CAPTURE_MAX_VIEWPORT_WIDTH` / `_HEIGHT` | `3840` / `2160` | Clamped, never an error |
| `CAPTURE_MAX_DEVICE_SCALE_FACTOR` | `3` | Clamped, never an error |
| `CAPTURE_MAX_FULLPAGE_HEIGHT` | `30000` | Taller full-page captures → 413 |
| `CAPTURE_MAX_TIMEOUT_MS` | `120000` | Upper bound for `timeout` |
| `CAPTURE_ALLOW_PRIVATE_HOSTS` | `false` | Opt-in: allow capturing private/local-network URLs (internal dashboards). SSRF guard stays strict by default |
| `CAPTURE_BROWSER_PATH` | *(auto-detect)* | Explicit Chromium binary |

## One-shot capture (no server)

```bash
cargo run --bin capture-cli -- --url https://example.com \
  --viewport-width 1280 --viewport-height 800 -o /tmp/shot.png
```

## Test

```bash
cargo test                          # pure-logic unit tests (no browser needed)
cargo test --test e2e_capture       # full pipeline against real Chromium
```

`e2e_capture` serves a page with our own HTTP server, drives headless Chromium
through our own CDP client, and validates the PNG output. It skips
automatically when no Chromium binary is found (CI), so `cargo test` stays
hermetic; set `CAPTURE_BROWSER_PATH` to force it.

## Deploy

```bash
# from the repository root
docker compose up --build capture-service
```

The image (`engines/Dockerfile`) compiles the engine in a Rust stage and ships
a slim Debian with Chromium — no Node, no npm, no Playwright, no sharp.

## API compatibility

`GET/POST /v1/capture` is parameter-compatible with the old
ScreenshotOne-style endpoint for the parameters Vectra uses (`url`, `format`,
`full_page`, `viewport_width`, `viewport_height`, `device_scale_factor`,
`block_ads`, `wait_until`, `selector`, `delay`, `timeout`). **PNG is the only
format implemented so far** — `webp`/`jpeg` return a clear 400 with a roadmap
note (see `docs/independence-review.md`). Success responses carry
`X-Capture-Width`, `X-Capture-Height` and `X-Capture-Duration-Ms`.

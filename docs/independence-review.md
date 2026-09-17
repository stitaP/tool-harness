# Independence review — removing external dependencies

This document reviews **every** external dependency in the project (npm packages,
paid services, and hosted backends) and decides, for each one, whether it can be
replaced with a from-scratch implementation — and what that actually costs.

**The goal:** a capture tool whose *product logic* — browser automation, image
encoding, HTTP serving, SVG packaging — is owned by us, written from scratch,
with no third-party libraries and no paid services in the critical path.

---

## 1. The inventory

### 1.1 Paid / hosted services

| Service | Used for | Verdict |
|---|---|---|
| ScreenshotOne | URL capture API | ✅ **Removed** (replaced with the from-scratch Rust engine in `engines/`). The interim TS service (`capture-service/`, Hono + Playwright + sharp) is deleted. |
| Convex cloud | App database, auth, realtime, function runtime | 🔒 **Platform-mandated.** The app *is* a Convex app; the Freebuff platform runs it. Removing it means writing a database + auth + realtime backend and abandoning the platform. Not removable. |
| `auth.freebuff.app` | Email OTP delivery | 🔒 Platform infra (the platform's own auth provider). Replaceable later with a self-hosted SMTP sender (needs a mail server). |

### 1.2 Capture pipeline (the product's engine) — `capture-service/`

| Package | Role | Replacement | Status |
|---|---|---|---|
| `playwright` | Browser automation | **`stitap-cdp`** — our own Chrome DevTools Protocol client written from scratch in Rust (WebSocket client, JSON, SHA-1, all ours) | ✅ **Verified end-to-end** — `capture-cli` and the `e2e_capture` test drive real headless Chromium through the full pipeline and produce a valid PNG |
| `hono`, `@hono/node-server` | HTTP server | **`stitap-http`** — HTTP/1.1 server from scratch on `std::net` | ✅ **Verified** (serves `/v1/capture` + `/health`; unit-tested) |
| `sharp` | Image encode/transcode | **`stitap-png`** — PNG decode/encode from scratch (base64 → PNG via our own decoder; encoder: filters + LZ77 deflate + fixed Huffman) | ✅ **Verified** (screenshot bytes decode to a valid PNG) |
| — | WebP / JPEG encode | From-scratch WebP (VP8L) / JPEG (baseline) encoders | ⏳ Roadmap (large, bounded projects) — `format=webp|jpeg` returns a clear 400 meanwhile |

### 1.3 App runtime — platform-mandated (cannot be removed on this platform)

`react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`,
`@tailwindcss/vite`, `tw-animate-css`, `typescript`, `eslint`/`prettier`,
`@vly-ai/integrations`, `convex`, `@convex-dev/auth`, `react-router`,
`@types/*`.

These are the platform's own stack. Replacing React means writing a UI
framework; replacing Vite means writing a bundler; replacing Convex means
writing a hosted database. Each is a multi-year project, and removing them
would break the platform integration this app runs on. They are **infra, not
product logic** — the same class of dependency as the OS and the CPU.

### 1.4 UI component layer — replaceable only by writing a UI framework

`@radix-ui/*` (22 packages), `class-variance-authority`, `clsx`,
`tailwind-merge`, `lucide-react`, `framer-motion`, `sonner`, `cmdk`, `vaul`,
`embla-carousel-react`, `react-resizable-panels`, `next-themes`, `input-otp`,
`react-day-picker`, `react-intersection-observer`, `react-hook-form`,
`@hookform/resolvers`, `date-fns`, `recharts`.

These are ~5,000 lines of hand-rolled alternatives per major package. Low
value: they carry no business logic and no paid cost. Keep, but the app does
not depend on them for its capture capability.

### 1.5 Product engines in the app — the meaningful targets

| Package | Role | Replacement | Status |
|---|---|---|---|
| `axios` | HTTP client | global `fetch` (built-in) | ✅ Removed from product code; still imported by `src/convex/auth/emailOtp.ts` (platform-mandated auth file, not ours to edit) |
| `@oslojs/crypto` | Random token generation | `node:crypto` / Web Crypto (built-in) | ✅ Removed from product code; still imported by the platform auth file above |
| `html-to-image`, `@zumer/snapdom` | In-browser DOM → image rasterization | **`stitap-dom`** — own serializer (clone DOM → SVG `foreignObject` → `<img>`) | ⏳ Roadmap (feasible, ~1–2k lines) |
| `tesseract.js` | OCR | From-scratch OCR engine (Rust) | ⏳ Roadmap (research-grade; bounded for a limited glyph set, multi-month) |
| `@huggingface/transformers`, `@wllama/wllama` | On-device LLM inference | From-scratch transformer inference runtime in Rust | ⏳ Roadmap (bounded but multi-month; the model *weights* remain external data) |
| `@oslojs/crypto` (again) | — | — | see above |
| `zod`, `@jridgewell/trace-mapping` | validation / stack maps | not imported in app code (transitive) | — |

---

## 2. The honest feasibility line

Two dependencies can never be "written from scratch" by a product team in a
bounded amount of time:

1. **A browser engine.** Blink (Chrome's engine) is ~10M+ lines of code, a
   decade of work by thousands of engineers. No library or service changes
   that. **But:** *Playwright is not a browser engine* — it is a **client**
   that drives a browser over a wire protocol. That client is exactly what we
   are reimplementing. The browser binary remains a system-level component
   (same class as the OS kernel), controlled through **our own** CDP client.
2. **Neural network weights.** The OCR/LLM *runtimes* can be written from
   scratch (roadmap), but the learned weights are data, like fonts — they
   cannot be authored from scratch in a product's lifetime.

Everything else in this review is a bounded engineering project, and the
capture pipeline — the product's core — is now **fully ours**.

## 3. What "independent" means after this turn

```
┌────────────────────────────────────────────────────────────┐
│ engines/  (Rust, std-only — zero crates, zero npm)          │
│                                                            │
│  stitap-http  HTTP/1.1 server + client      (from scratch) │
│  stitap-ws    RFC 6455 WebSocket client     (from scratch) │
│  stitap-cdp   Chrome DevTools Protocol client (from scratch)│
│  stitap-json  JSON parser + stringifier     (from scratch) │
│  stitap-png   PNG decode/encode (filters, LZ77, fixed      │
│               Huffman deflate)                              │
│  stitap-svg   SVG serializer                               │
│  stitap-core  base64, SHA-1, URL/SSRF, timestamps          │
│  captured     REST API: /v1/capture, /health               │
└────────────────────────────────────────────────────────────┘
        │  raw CDP over our own WebSocket
        ▼
   system Chromium (a platform binary, like the OS)
```

The only remaining external piece is the Chromium **binary** (installed by the
OS or the container), driven entirely by our own protocol code. No `playwright`,
no `sharp`, no `hono`, no paid API — the interim TS `capture-service/` is
deleted and `docker compose up --build capture-service` now builds `engines/`.

**Verified end-to-end** (`engines/tests/e2e_capture.rs`, browser-gated): our
HTTP server serves a local page → our CDP client launches headless Chromium →
the PNG output is validated (signature + IHDR dimensions + non-empty IDAT).
This also regression-protects the two launch quirks found on the way:
chrome-headless-shell parses `--user-data-dir` as a switch unless the value is
given with `=` (the value then lands as a second positional URL and the browser
exits with "Multiple targets are not supported"), and it refuses to start with
an inherited stdin pipe — both fixed in `cdp.rs`.

## 4. Roadmap

| Phase | Work | Effort |
|---|---|---|
| **1 (done + verified)** | Rust engine: HTTP, WS, CDP, JSON, PNG, SVG, server — **verified end-to-end** against real Chromium; packaged as the Docker capture service (`engines/Dockerfile`), TS `capture-service/` deleted | this turn |
| 2 | WebP encoder from scratch (VP8L) — drop `sharp` completely | ~3–6 weeks |
| 3 | JPEG baseline encoder from scratch | ~3–4 weeks |
| 4 | `stitap-dom`: replace `html-to-image`/`snapdom` for the in-app demo capture | ~1–2 weeks |
| 5 | Transformer inference runtime in Rust (replaces `transformers.js`/`wllama`); weights stay external data | ~2–4 months |
| 6 | OCR engine in Rust for a constrained glyph set, then general | research-scale |
| 7 | Self-hosted mail relay to replace `auth.freebuff.app` OTP | 1 week + infra |
| 8 | Optional: React-free UI (own framework or compile-to-DOM) | years — not recommended |

## 5. Keep-forever (infra, not product)

OS, CPU, Rust std, Bun/Node runtimes, the Vite/React/Convex platform stack, and
Chromium the binary. These are the "assembler + kernel" of the stack; replacing
them is re-inventing computing, not building a product.

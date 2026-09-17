/**
 * Pure device-capability estimation — decides whether the ~415MB on-device
 * instruct model (Qwen2.5-0.5B @ 2-bit) can run on this machine.
 *
 * This module is deliberately pure: `tierFor` and `capabilityFor` take a
 * `DeviceProfile` object and return a deterministic answer, so the logic is
 * smoke-testable in Node. `estimateProfile` is the thin browser-only
 * adapter that reads `navigator`.
 *
 * Rationale (from measurements of real quantized GGUFs):
 *
 *   · True 1.58-bit models on HF are NOT small — Falcon3-1B-1.58bit is
 *     1.36GB, BitNet b1.58-2B-4T is 1.19GB, Falcon3-3B is 2.2GB. None fit a
 *     browser tab on a 2GB machine.
 *   · The smallest real instruct GGUF that fits is Qwen2.5-0.5B-Instruct at
 *     Q2_K (2-bit) ≈ 415MB — a 0.5B model trained on ~3T tokens, so its
 *     error explanations beat a 135M model while staying inside the memory
 *     budget of an old laptop with a browser already running.
 *   · A 2GB machine with a browser open has roughly 600–900MB of usable
 *     headroom; 415MB of weights + WASM heap + KV cache lands near the
 *     limit, so we require ≥2GB *and* skip the model entirely on legacy
 *     hardware, falling back to the instant rule catalogue instead.
 */
import type { DeviceCapability, DeviceProfile, DeviceTier } from "./types";
import {
  NLP_EXPLAIN_GGUF_FILE,
  NLP_EXPLAIN_MODEL_ID,
  NLP_EXPLAIN_MODEL_MB,
  NLP_VISION_MODEL_ID,
  NLP_VISION_MODEL_MB,
} from "./types";

/** Memory (MB) of the model weights themselves. */
export const EXPLAIN_MODEL_MB = NLP_EXPLAIN_MODEL_MB;

/** WASM heap + KV cache + runtime overhead on top of raw weights. */
export const EXPLAIN_RUNTIME_OVERHEAD_MB = 180;

/** Full capability decision for the vision VLM (a heavier second model). */
export function visionCapability(profile: DeviceProfile): DeviceCapability {
  if (!profile.hasWasmSimd) {
    return {
      tier: tierFor(profile),
      modelBudgetMb: 0,
      reason: "WASM SIMD is unavailable — the VLM cannot run; using the structural review instead.",
    };
  }
  if (!canFitModel(profile, NLP_VISION_MODEL_MB)) {
    return {
      tier: tierFor(profile),
      modelBudgetMb: 0,
      reason: `${profile.deviceMemoryGb ?? "?"}GB RAM — a 900MB vision model would thrash; using the structural review instead.`,
    };
  }
  const tier = tierFor(profile);
  return {
    tier,
    modelBudgetMb: NLP_VISION_MODEL_MB,
    modelId: NLP_VISION_MODEL_ID,
    reason: `${profile.deviceMemoryGb ?? "?"}GB RAM — can run Qwen2-VL-2B @ IQ2_M for visual capture feedback.`,
  };
}

/** Convenience: vision capability for the current browser. */
export function currentVisionCapability(): DeviceCapability {
  return visionCapability(estimateProfile());
}

/**
 * Classify a device into a tier.
 *
 *   legacy   → <2GB RAM or unknown+few cores → rule-only answers
 *   standard → 2–4GB → can run the 415MB model (slow, ~1–3 tok/s on old CPUs)
 *   modern   → ≥4GB or WebGPU → full experience
 */
export function tierFor(profile: DeviceProfile): DeviceTier {
  const mem = profile.deviceMemoryGb;
  const cores = profile.cores;
  const known = (v: number | null): v is number => typeof v === "number" && v > 0;

  if (profile.hasWebGpu) return "modern";
  if (known(mem) && mem >= 4) return "modern";
  if (known(cores) && cores >= 6 && mem === null) return "standard";
  if (known(mem) && mem < 2) return "legacy";
  if (known(cores) && cores <= 2 && mem === null) return "legacy";
  return "standard"; // conservative middle ground
}

/**
 * Whether a device can realistically load a model of `sizeMb` given the
 * memory budget heuristic: usable = RAM in MB minus a browser baseline,
 * with slack so a low-RAM machine isn't pushed into swap thrash.
 */
export function canFitModel(profile: DeviceProfile, sizeMb: number): boolean {
  const mem = profile.deviceMemoryGb;
  if (!mem || mem < 1) return sizeMb <= 200; // unknown memory: only tiny models
  const usableMb = mem * 1024 - 700; // browser + OS baseline
  return sizeMb + EXPLAIN_RUNTIME_OVERHEAD_MB + 256 <= usableMb;
}

/** Full capability decision for a device profile. */
export function capabilityFor(profile: DeviceProfile): DeviceCapability {
  const tier = tierFor(profile);
  const mem = profile.deviceMemoryGb;
  const memLabel = mem ? `${mem}GB RAM` : "unknown RAM";

  if (tier === "legacy" || !canFitModel(profile, EXPLAIN_MODEL_MB)) {
    return {
      tier,
      modelBudgetMb: 0,
      reason: `${memLabel} — not enough headroom for a 415MB on-device model; using the instant rule catalogue instead.`,
    };
  }

  return {
    tier,
    modelBudgetMb: EXPLAIN_MODEL_MB,
    modelId: NLP_EXPLAIN_MODEL_ID,
    reason: `${memLabel} — can run Qwen2.5-0.5B @ 2-bit (~415MB) for detailed error explanations.`,
  };
}

/* ------------------------------------------------------------------ */
/* Browser adapter (only runs in the browser; Node smoke tests stub it) */
/* ------------------------------------------------------------------ */

/** True when the browser reports WASM SIMD support. */
export function detectWasmSimd(): boolean {
  if (typeof WebAssembly === "undefined") return false;
  try {
    // SIMD support probe — feature-detected at runtime, not by sniffing UA.
    return WebAssembly.validate(
      new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60,
        0x00, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00,
        0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b, 0x0b,
      ]),
    );
  } catch {
    return false;
  }
}

/** Read the device profile from the browser. Safe to call on any page. */
export function estimateProfile(): DeviceProfile {
  const nav = globalThis.navigator as
    | (Navigator & {
        deviceMemory?: number;
        gpu?: unknown;
      })
    | undefined;
  const hasWebGpu = Boolean(nav?.gpu);
  return {
    deviceMemoryGb: typeof nav?.deviceMemory === "number" ? nav.deviceMemory : null,
    cores: typeof nav?.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    hasWebGpu,
    hasWasmSimd: detectWasmSimd(),
  };
}

/** Convenience: capability for the current browser. */
export function currentCapability(): DeviceCapability {
  return capabilityFor(estimateProfile());
}

/** GGUF download URL for the explain model (HF resolve). */
export function explainModelUrl(): string {
  return `https://huggingface.co/${NLP_EXPLAIN_MODEL_ID}/resolve/main/${NLP_EXPLAIN_GGUF_FILE}`;
}

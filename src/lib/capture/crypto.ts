/**
 * Secret replay envelopes (encrypted SVG metadata).
 *
 * The visible SVG stays plaintext so it renders anywhere as a picture. The
 * automation payload — the capture recipe JSON that generates the Playwright
 * replay script (URL, viewport, mode, selector, readiness) — is encrypted with
 * AES-256-GCM under a key derived from a user passphrase via PBKDF2-SHA256,
 * then base64-embedded in a `data-secret` attribute on the invisible
 * `<metadata>` element. Browsers render the image and ignore the attribute;
 * nobody can read the recipe without the passphrase.
 *
 * Why this shape:
 * - `metadata` is already on the sanitizer allowlist, and `data-*` attributes
 *   pass the Safe Image profile, so an embedded secret survives sanitization.
 * - The embed/extract helpers are pure string operations (no DOMParser), so
 *   they work identically in the browser and in Bun smoke tests.
 * - The app never stores the key: the passphrase exists only for the seconds
 *   it is typed, so no on-disk key can be exfiltrated. The pixels themselves
 *   obviously remain visible — encryption protects the recipe, not the image.
 */

export const SECRET_ATTR = "data-secret";
export const SECRET_NS = "https://stitap.local/secret-envelope/v1";

export interface SecretEnvelope {
  v: 1;
  kdf: "pbkdf2-sha256";
  iter: number;
  salt: string; // base64, 16 bytes
  iv: string; // base64, 12 bytes
  ct: string; // base64 ciphertext incl. GCM tag
}

const DEFAULT_ITERATIONS = 210_000; // OWASP-adjacent PBKDF2-SHA256 cost
const MIN_ITERATIONS = 1_000; // clamp hostile files (DoS guard)
const MAX_ITERATIONS = 5_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

/* ----------------------------- base64 ----------------------------- */

function b64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function unb64(value: string): Uint8Array<ArrayBuffer> {
  const bin = atob(value);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* --------------------------- key derivation ------------------------ */

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* ----------------------------- envelope ---------------------------- */

/** Encrypt a string into a versioned SecretEnvelope JSON document. */
export async function encryptSecret(
  plaintext: string,
  passphrase: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, iterations);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const envelope: SecretEnvelope = {
    v: 1,
    kdf: "pbkdf2-sha256",
    iter: iterations,
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(ct),
  };
  return JSON.stringify(envelope);
}

/**
 * Decrypt an envelope. Returns the plaintext, or `null` for a wrong
 * passphrase, tampered ciphertext, unsupported envelope version, or a
 * malformed payload — the caller must never distinguish those cases.
 */
export async function decryptSecret(
  envelopeJson: string,
  passphrase: string,
): Promise<string | null> {
  try {
    const envelope = JSON.parse(envelopeJson) as SecretEnvelope;
    if (envelope.v !== 1 || envelope.kdf !== "pbkdf2-sha256") return null;
    const iter = Math.min(
      Math.max(Math.floor(envelope.iter) || DEFAULT_ITERATIONS, MIN_ITERATIONS),
      MAX_ITERATIONS,
    );
    const salt = unb64(envelope.salt);
    const iv = unb64(envelope.iv);
    const ct = unb64(envelope.ct);
    const key = await deriveKey(passphrase, salt, iter);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/* --------------------------- SVG embedding ------------------------- */

/**
 * Embed an envelope JSON string into the SVG's `<metadata>` element as a
 * `data-secret` attribute (base64 — XML-safe, invisible, sanitizer-safe).
 * If the SVG has no `<metadata>`, one is inserted before `</svg>`.
 */
export function embedSecret(svg: string, envelopeJson: string): string {
  const value = b64(new TextEncoder().encode(envelopeJson));
  if (svg.includes(`${SECRET_ATTR}=`)) return svg; // already carries a secret
  const meta = /<metadata([^>]*)>/.exec(svg);
  if (meta) {
    const insertAt = meta.index + "<metadata".length;
    return svg.slice(0, insertAt) + ` ${SECRET_ATTR}="${value}"` + svg.slice(insertAt);
  }
  return svg.replace(
    "</svg>",
    `<metadata ${SECRET_ATTR}="${value}"></metadata>\n</svg>`,
  );
}

/** Pull the envelope JSON out of an SVG, or `null` when absent/corrupt. */
export function extractSecret(svg: string): string | null {
  const match = new RegExp(`${SECRET_ATTR}="([^"]+)"`).exec(svg);
  if (!match) return null;
  try {
    return new TextDecoder().decode(unb64(match[1]));
  } catch {
    return null;
  }
}

/**
 * Commerce & Storage Tools — Stripe Payments, Cloud Storage
 *
 * Payment processing: Stripe Checkout, Payment Intents, Subscriptions
 * Cloud storage: S3-compatible (AWS S3, Cloudflare R2, MinIO)
 */

// ─── Stripe Payments ──────────────────────────────────────────────────────────

export interface StripeConfig {
  secretKey: string;
  /** Webhook signing secret (for verifying callbacks). */
  webhookSecret?: string;
  /** API version. */
  apiVersion?: string;
}

export interface StripeProduct {
  id: string;
  name: string;
  description?: string;
  price: number; // in cents
  currency: string;
  interval?: "month" | "year";
  images?: string[];
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

export interface PaymentIntent {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: string;
}

export interface StripeResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Create a Stripe Checkout session. */
export async function createCheckoutSession(
  config: StripeConfig,
  opts: {
    items: Array<{ priceId?: string; productId?: string; quantity?: number }>;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  },
): Promise<StripeResult<CheckoutSession>> {
  try {
    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": config.apiVersion ?? "2024-12-18",
      },
      body: new URLSearchParams({
        mode: "payment",
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        ...(opts.customerEmail ? { "customer_email": opts.customerEmail } : {}),
        line_items: JSON.stringify(
          opts.items.map((item) => ({
            price: item.priceId,
            product: item.productId,
            quantity: item.quantity ?? 1,
          })),
        ),
        ...(opts.metadata ? { metadata: JSON.stringify(opts.metadata) } : {}),
      }),
    });
    const data = await resp.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!data.id || !data.url) {
      return { success: false, error: data.error?.message ?? "Failed to create checkout session" };
    }
    return { success: true, data: { sessionId: data.id, url: data.url } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Create a Stripe Payment Intent. */
export async function createPaymentIntent(
  config: StripeConfig,
  opts: {
    amount: number; // cents
    currency: string;
    customerId?: string;
    metadata?: Record<string, string>;
  },
): Promise<StripeResult<PaymentIntent>> {
  try {
    const resp = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(opts.amount),
        currency: opts.currency,
        automatic_payment_methods: JSON.stringify({ enabled: true }),
        ...(opts.customerId ? { customer: opts.customerId } : {}),
        ...(opts.metadata ? { metadata: JSON.stringify(opts.metadata) } : {}),
      }),
    });
    const data = await resp.json() as {
      id?: string; client_secret?: string; amount?: number;
      currency?: string; status?: string; error?: { message?: string };
    };
    if (!data.id) return { success: false, error: data.error?.message ?? "Failed" };
    return {
      success: true,
      data: {
        paymentIntentId: data.id,
        clientSecret: data.client_secret ?? "",
        amount: data.amount ?? opts.amount,
        currency: data.currency ?? opts.currency,
        status: data.status ?? "unknown",
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Create a Stripe subscription. */
export async function createSubscription(
  config: StripeConfig,
  opts: {
    customerId: string;
    priceId: string;
    trialDays?: number;
    metadata?: Record<string, string>;
  },
): Promise<StripeResult<{ subscriptionId: string; status: string }>> {
  try {
    const resp = await fetch("https://api.stripe.com/v1/subscriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: opts.customerId,
        items: JSON.stringify([{ price: opts.priceId }]),
        ...(opts.trialDays ? { trial_period_days: String(opts.trialDays) } : {}),
        ...(opts.metadata ? { metadata: JSON.stringify(opts.metadata) } : {}),
      }),
    });
    const data = await resp.json() as { id?: string; status?: string; error?: { message?: string } };
    if (!data.id) return { success: false, error: data.error?.message ?? "Failed" };
    return { success: true, data: { subscriptionId: data.id, status: data.status ?? "unknown" } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Cloud Storage (S3-Compatible) ────────────────────────────────────────────

export interface S3Config {
  endpoint: string; // e.g., "https://s3.amazonaws.com" or "https://<account>.r2.cloudflarestorage.com"
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region?: string;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: string;
  contentType?: string;
  url?: string;
}

/** List objects in a bucket. */
export async function listObjects(
  config: S3Config,
  prefix?: string,
  maxKeys?: number,
): Promise<StripeResult<StorageObject[]>> {
  try {
    const params = new URLSearchParams({
      ...(prefix ? { prefix } : {}),
      ...(maxKeys ? { "max-keys": String(maxKeys) } : {}),
    });
    const resp = await fetch(`${config.endpoint}/${config.bucket}?${params}`, {
      headers: await signS3Request(config, "GET", `/${config.bucket}`),
    });
    const xml = await resp.text();
    const objects = parseS3ListResponse(xml);
    return { success: true, data: objects };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Upload an object to S3. */
export async function putObject(
  config: S3Config,
  key: string,
  body: ArrayBuffer | string,
  contentType?: string,
): Promise<StripeResult<{ url: string }>> {
  try {
    const resp = await fetch(`${config.endpoint}/${config.bucket}/${key}`, {
      method: "PUT",
      headers: {
        ...(await signS3Request(config, "PUT", `/${config.bucket}/${key}`)),
        ...(contentType ? { "Content-Type": contentType } : {}),
      },
      body,
    });
    if (!resp.ok) return { success: false, error: `Upload failed: ${resp.status}` };
    const url = `${config.endpoint}/${config.bucket}/${key}`;
    return { success: true, data: { url } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Get a signed URL for temporary access. */
export async function getSignedUrl(
  config: S3Config,
  key: string,
  expiresIn = 3600,
): Promise<StripeResult<string>> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const expiry = timestamp + expiresIn;
    const policy = JSON.stringify({ expiration: new Date(expiry * 1000).toISOString(), conditions: [
      { bucket: config.bucket }, ["eq", "$key", key],
    ]});
    const signature = await hmacSHA256(config.secretAccessKey, policy);
    const url = `${config.endpoint}/${config.bucket}/${key}?AWSAccessKeyId=${encodeURIComponent(config.accessKeyId)}&Expires=${expiry}&Signature=${encodeURIComponent(signature)}`;
    return { success: true, data: url };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── S3 Helpers ───────────────────────────────────────────────────────────────

async function signS3Request(
  config: S3Config,
  method: string,
  path: string,
): Promise<Record<string, string>> {
  // Simplified AWS Sig V4 — in production, use @aws-sdk
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 14);
  return {
    "Authorization": `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${date}/${config.region ?? "us-east-1"}/s3/aws4_request, SignedHeaders=host, Signature=dummy`,
    "Date": date,
  };
}

function parseS3ListResponse(xml: string): StorageObject[] {
  const objects: StorageObject[] = [];
  const keyMatches = xml.matchAll(/<Key>(.*?)<\/Key>/g);
  const sizeMatches = xml.matchAll(/<Size>(.*?)<\/Size>/g);
  const dates = xml.matchAll(/<LastModified>(.*?)<\/LastModified>/g);
  const keys = [...keyMatches].map((m) => m[1]);
  const sizes = [...sizeMatches].map((m) => Number(m[1]));
  const mods = [...dates].map((m) => m[1]);
  for (let i = 0; i < keys.length; i++) {
    objects.push({ key: keys[i], size: sizes[i] ?? 0, lastModified: mods[i] ?? "" });
  }
  return objects;
}

async function hmacSHA256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

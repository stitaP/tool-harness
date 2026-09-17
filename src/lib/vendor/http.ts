/* ─── stitaP — Custom HTTP Client (replaces axios) ─── */

/** Request configuration */
export interface VRequestConfig {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  signal?: AbortSignal;
  /** Response type */
  responseType?: "json" | "text" | "blob" | "arrayBuffer";
}

/** Response wrapper */
export interface VResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: VRequestConfig;
}

/** Custom error with status info */
export class VError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "VError";
    this.status = status;
    this.data = data;
  }
}

/** Build query string from params */
function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

/** Core request function */
async function request<T = unknown>(
  url: string,
  config: VRequestConfig = {},
): Promise<VResponse<T>> {
  const { method = "GET", headers = {}, body, params, timeout, signal, responseType = "json" } = config;

  const controller = new AbortController();
  const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null;

  // Combine signals
  let finalSignal = controller.signal;
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const fullUrl = url + buildQuery(params);

    const fetchOptions: RequestInit = {
      method,
      headers: { ...headers },
      signal: finalSignal,
    };

    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      if (body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer) {
        fetchOptions.body = body as BodyInit;
      } else if (typeof body === "string") {
        fetchOptions.body = body;
        if (!headers["Content-Type"]) {
          (fetchOptions.headers as Record<string, string>)["Content-Type"] = "text/plain";
        }
      } else {
        fetchOptions.body = JSON.stringify(body);
        if (!headers["Content-Type"]) {
          (fetchOptions.headers as Record<string, string>)["Content-Type"] = "application/json";
        }
      }
    }

    const res = await fetch(fullUrl, fetchOptions);

    let data: T;
    switch (responseType) {
      case "text":
        data = (await res.text()) as T;
        break;
      case "blob":
        data = (await res.blob()) as T;
        break;
      case "arrayBuffer":
        data = (await res.arrayBuffer()) as T;
        break;
      case "json":
      default:
        data = (await res.json()) as T;
        break;
    }

    if (!res.ok) {
      throw new VError(
        `Request failed: ${res.status} ${res.statusText}`,
        res.status,
        data,
      );
    }

    return { data, status: res.status, statusText: res.statusText, headers: res.headers, config };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** HTTP client — drop-in replacement for axios */
export const http = {
  request,
  get: <T = unknown>(url: string, config?: Omit<VRequestConfig, "method" | "body">) =>
    request<T>(url, { ...config, method: "GET" }),
  post: <T = unknown>(url: string, body?: unknown, config?: Omit<VRequestConfig, "method">) =>
    request<T>(url, { ...config, method: "POST", body }),
  put: <T = unknown>(url: string, body?: unknown, config?: Omit<VRequestConfig, "method">) =>
    request<T>(url, { ...config, method: "PUT", body }),
  patch: <T = unknown>(url: string, body?: unknown, config?: Omit<VRequestConfig, "method">) =>
    request<T>(url, { ...config, method: "PATCH", body }),
  delete: <T = unknown>(url: string, config?: Omit<VRequestConfig, "method" | "body">) =>
    request<T>(url, { ...config, method: "DELETE" }),
  head: <T = unknown>(url: string, config?: Omit<VRequestConfig, "method" | "body">) =>
    request<T>(url, { ...config, method: "HEAD" }),
};

export default http;

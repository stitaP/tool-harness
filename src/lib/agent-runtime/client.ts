/**
 * Browser client for the local stitaP agent daemon (`harness serve`).
 * The daemon owns execution (real shell, files, schedules); this app is a client.
 */
export interface AgentEvent { sessionId: string; type: string; ts: number; [k: string]: any }
export interface SessionSummary { id: string; title: string; source: string; updated_at: number; busy: boolean }
export interface StoredMessage { id: number; role: "user" | "assistant" | "tool" | "system"; content: string | null; tool_calls?: { id: string; name: string; arguments: string }[]; tool_call_id?: string; name?: string; meta?: { source?: string; compression_summary?: boolean } }
export interface SessionDetail {
  session: { id: string; title: string; source: string; cwd: string };
  busy: boolean; cwd: string; model: string; messages: StoredMessage[];
  todos: { id: string; content: string; status: string }[];
  goal: { text: string; status: string; turns: number; max_turns: number; last_reason?: string } | null;
  approvals: { id: string; command: string; reason: string }[];
  clarify: { id: string; question: string; choices?: string[] }[];
}

const LS_URL = "stitap.agent.url";
const LS_TOKEN = "stitap.agent.token";

export function getDaemonUrl(): string {
  try { return localStorage.getItem(LS_URL) || "http://127.0.0.1:7420"; } catch { return "http://127.0.0.1:7420"; }
}

export class AgentClient {
  constructor(public baseUrl = getDaemonUrl(), private token = (() => { try { return localStorage.getItem(LS_TOKEN) ?? ""; } catch { return ""; } })()) {}

  /** Obtain the local token (daemon allows this for origins in server.cors_origins). */
  async connect(): Promise<void> {
    if (!this.token) {
      const r = await fetch(`${this.baseUrl}/api/pair`);
      if (!r.ok) throw new Error(`daemon refused pairing (${r.status}); add this origin to server.cors_origins`);
      this.token = (await r.json()).token;
      try { localStorage.setItem(LS_TOKEN, this.token); localStorage.setItem(LS_URL, this.baseUrl); } catch { /* private mode */ }
    }
    await this.req("/api/info");
  }

  private async req<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const r = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", "x-stitap-token": this.token, ...(init.headers ?? {}) } });
    if (r.status === 401) { try { localStorage.removeItem(LS_TOKEN); } catch { /* ignore */ } this.token = ""; throw new Error("token rejected — reconnect"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 202) throw new Error(j.error ?? r.statusText);
    return j as T;
  }

  info() { return this.req("/api/info"); }
  sessions() { return this.req<SessionSummary[]>("/api/sessions?limit=80"); }
  session(id: string) { return this.req<SessionDetail>(`/api/sessions/${id}`); }
  createSession() { return this.req<{ id: string }>("/api/sessions", { method: "POST", body: JSON.stringify({}) }); }
  send(id: string, text: string, images: string[] = []) { return this.req<any>(`/api/sessions/${id}/messages`, { method: "POST", body: JSON.stringify({ text, images }) }); }
  interrupt(id: string) { return this.req(`/api/sessions/${id}/interrupt`, { method: "POST", body: JSON.stringify({ clear: true }) }); }
  approve(id: string, decision: "once" | "session" | "always" | "deny") { return this.req(`/api/approvals/${id}`, { method: "POST", body: JSON.stringify({ decision }) }); }
  answer(id: string, answer: string) { return this.req(`/api/clarify/${id}`, { method: "POST", body: JSON.stringify({ answer }) }); }

  events(sessionId: string, onEvent: (e: AgentEvent) => void): () => void {
    const es = new EventSource(`${this.baseUrl}/api/events?session=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(this.token)}`);
    es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* ignore */ } };
    return () => es.close();
  }
}

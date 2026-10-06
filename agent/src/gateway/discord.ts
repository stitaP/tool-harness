/** Discord adapter: Gateway WebSocket (Node's built-in WebSocket) + REST. */
import type { Adapter, Inbound } from "./manager.js";
import { log } from "../util/log.js";

const API = "https://discord.com/api/v10";
const INTENTS = (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15); // GUILDS, GUILD_MESSAGES, DIRECT_MESSAGES, MESSAGE_CONTENT

export class DiscordAdapter implements Adapter {
  readonly platform = "discord";
  readonly maxLen = 1900;
  private ws: any = null;
  private hb: NodeJS.Timeout | null = null;
  private seq: number | null = null;
  private botId = "";
  private stopped = false;
  constructor(private token: string, private channels: string[]) {}

  private async rest(method: string, path: string, body?: any): Promise<any> {
    const res = await fetch(API + path, { method, headers: { authorization: `Bot ${this.token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429) { const j: any = await res.json(); await new Promise((r) => setTimeout(r, (j.retry_after ?? 1) * 1000)); return this.rest(method, path, body); }
    if (!res.ok) throw new Error(`discord ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json();
  }

  async start(onMessage: (m: Inbound) => void): Promise<void> {
    if (typeof (globalThis as any).WebSocket !== "function") throw new Error("Discord needs Node 22+ (built-in WebSocket)");
    const g = await this.rest("GET", "/gateway/bot");
    this.connect(g.url, onMessage);
  }

  private connect(url: string, onMessage: (m: Inbound) => void) {
    const WS = (globalThis as any).WebSocket;
    const ws = new WS(`${url}/?v=10&encoding=json`);
    this.ws = ws;
    ws.onmessage = (e: any) => {
      const p = JSON.parse(String(e.data));
      if (p.s) this.seq = p.s;
      if (p.op === 10) {
        this.hb = setInterval(() => ws.send(JSON.stringify({ op: 1, d: this.seq })), p.d.heartbeat_interval);
        ws.send(JSON.stringify({ op: 2, d: { token: this.token, intents: INTENTS, properties: { os: process.platform, browser: "stitap", device: "stitap" } } }));
      } else if (p.op === 7 || p.op === 9) ws.close();
      else if (p.op === 0 && p.t === "READY") { this.botId = p.d.user.id; log.info(`discord connected as ${p.d.user.username}`); }
      else if (p.op === 0 && p.t === "MESSAGE_CREATE") {
        const m = p.d;
        if (m.author?.bot) return;
        const isDM = !m.guild_id;
        const mentioned = (m.mentions ?? []).some((u: any) => u.id === this.botId);
        if (!isDM && !mentioned && !this.channels.includes(m.channel_id)) return;
        const text = String(m.content ?? "").replace(new RegExp(`<@!?${this.botId}>`, "g"), "").trim();
        if (!text) return;
        onMessage({ platform: "discord", chatId: m.channel_id, userId: m.author.id, userName: m.author.username, text, isDM });
      }
    };
    ws.onclose = () => {
      if (this.hb) clearInterval(this.hb);
      if (!this.stopped) { log.warn("discord gateway closed; reconnecting in 5s"); setTimeout(() => this.connect(url, onMessage), 5000); }
    };
    ws.onerror = (e: any) => log.warn(`discord ws error: ${e?.message ?? e}`);
  }

  async send(chatId: string, text: string) { await this.rest("POST", `/channels/${chatId}/messages`, { content: text, allowed_mentions: { parse: [] } }); }
  async typing(chatId: string) { await this.rest("POST", `/channels/${chatId}/typing`); }
  async stop() { this.stopped = true; if (this.hb) clearInterval(this.hb); try { this.ws?.close(); } catch { /* ignore */ } }
}

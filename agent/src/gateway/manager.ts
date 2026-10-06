/**
 * Messaging gateway: one process serving Telegram, Discord, Slack and inbound
 * webhooks. Each chat maps to a persistent agent session. Unknown users must
 * be paired (owner approves a code) unless listed in allowed_users.
 */
import type { IncomingMessage } from "node:http";
import type { Runtime, GatewayLike } from "../runtime/runtime.js";
import { looksLikeCommand, runCommand } from "../runtime/commands.js";
import { redactKnown } from "../util/redact.js";
import { errMsg, newId } from "../util/misc.js";
import { log } from "../util/log.js";
import type { ServerHandle } from "../server/http.js";
import { TelegramAdapter } from "./telegram.js";
import { DiscordAdapter } from "./discord.js";
import { SlackAdapter } from "./slack.js";

export interface Inbound { platform: string; chatId: string; userId: string; userName: string; text: string; images?: string[]; threadId?: string; isDM: boolean }
export interface Adapter {
  readonly platform: string;
  start(onMessage: (m: Inbound) => void): Promise<void>;
  send(chatId: string, text: string): Promise<void>;
  typing?(chatId: string): Promise<void>;
  stop(): Promise<void>;
  maxLen: number;
}

export function chunkText(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest.trim()) out.push(rest);
  return out;
}

export class GatewayManager implements GatewayLike {
  adapters = new Map<string, Adapter>();
  private typingTimers = new Map<string, NodeJS.Timeout>();
  private watched = new Set<string>();

  constructor(private rt: Runtime) {
    rt.gateway = this;
    rt.on("event", (ev) => this.onEvent(ev));
  }

  platforms(): string[] { return [...this.adapters.keys()]; }

  async start(server?: ServerHandle): Promise<string[]> {
    const g = this.rt.cfg.data.gateway;
    const started: string[] = [];
    const tryStart = async (a: Adapter) => {
      try { await a.start((m) => void this.inbound(m).catch((e) => log.error(`gateway inbound: ${errMsg(e)}`))); this.adapters.set(a.platform, a); started.push(a.platform); }
      catch (e) { log.error(`${a.platform} adapter failed to start: ${errMsg(e)}`); started.push(`${a.platform} (FAILED: ${errMsg(e)})`); }
    };
    const sec = (n?: string) => this.rt.cfg.secret(n);
    if (g.telegram.enabled) { const t = sec(g.telegram.token_env); if (t) await tryStart(new TelegramAdapter(t)); else started.push(`telegram (missing ${g.telegram.token_env})`); }
    if (g.discord.enabled) { const t = sec(g.discord.token_env); if (t) await tryStart(new DiscordAdapter(t, (g.discord as any).channels ?? [])); else started.push(`discord (missing ${g.discord.token_env})`); }
    if (g.slack.enabled) { const b = sec(g.slack.bot_token_env), a = sec(g.slack.app_token_env); if (b && a) await tryStart(new SlackAdapter(b, a)); else started.push("slack (missing SLACK_BOT_TOKEN/SLACK_APP_TOKEN)"); }
    if (server) for (const [name, w] of Object.entries(g.webhooks ?? {})) {
      server.webhooks.set(name, (payload, req) => this.webhook(name, w as any, payload, req));
      started.push(`webhook:${name}`);
    }
    return started;
  }

  async stop(): Promise<void> { for (const a of this.adapters.values()) await a.stop().catch(() => undefined); }

  async send(platform: string, target: string, text: string): Promise<void> {
    const a = this.adapters.get(platform);
    if (!a) throw new Error(`platform ${platform} not running`);
    const clean = redactKnown(text, this.rt.cfg.allSecretValues());
    for (const part of chunkText(clean, a.maxLen)) await a.send(target, part);
  }

  private allowed(m: Inbound): boolean {
    const list: string[] = ((this.rt.cfg.data.gateway as any)[m.platform]?.allowed_users ?? []).map(String);
    if (list.includes(m.userId) || list.includes(m.userName) || list.includes("*")) return true;
    return !!this.rt.db.getRecord("paired_user", `${m.platform}:${m.userId}`);
  }

  private sessionFor(m: Inbound): string {
    const key = `gw:${m.platform}:${m.chatId}${m.threadId ? `:${m.threadId}` : ""}`;
    let sid = this.rt.db.getMeta<string>(key);
    if (!sid || !this.rt.db.getSession(sid)) {
      sid = this.rt.createSession({ source: m.platform, title: `${m.platform}: ${m.userName}`, meta: { platform_target: `${m.platform}:${m.chatId}`, gw_key: key } }).id;
      this.rt.db.setMeta(key, sid);
    }
    this.watched.add(sid);
    return sid;
  }

  private async inbound(m: Inbound): Promise<void> {
    void this.rt.hooks.emit("on_message", { platform: m.platform, userId: m.userId, text: m.text });
    if (!this.allowed(m)) {
      if (!m.isDM) return; // stay silent in group chats
      const existing = this.rt.db.listRecords<any>("pairing").find((p) => p.platform === m.platform && p.userId === m.userId);
      const code = existing?.code ?? newId().slice(-6).toUpperCase();
      if (!existing) this.rt.db.putRecord("pairing", code, { code, platform: m.platform, userId: m.userId, userName: m.userName, chatId: m.chatId, at: Date.now() });
      await this.send(m.platform, m.chatId, `👋 I don't know you yet. Ask the owner to approve you with:\n  harness pairing approve ${code}`);
      return;
    }
    const sid = this.sessionFor(m);
    const text = m.text.trim();
    const pend = this.rt.pendingClarify(sid)[0];
    if (pend && !looksLikeCommand(text, this.rt)) {
      const n = Number(text);
      this.rt.respondClarify(pend.id, pend.choices && n >= 1 && n <= pend.choices.length ? pend.choices[n - 1] : text);
      return;
    }
    if (looksLikeCommand(text, this.rt) || /^\/(start|whoami|sethome)\b/.test(text)) {
      if (/^\/(start|whoami)\b/.test(text)) { await this.send(m.platform, m.chatId, `You are ${m.userName} (${m.userId}) on ${m.platform}. Session ${sid}. Send any task, or /help.`); return; }
      if (/^\/sethome\b/.test(text)) { this.rt.db.setMeta(`gw_home:${m.platform}`, m.chatId); await this.send(m.platform, m.chatId, "This chat is now the home channel for cron/kanban deliveries."); return; }
      const r = await runCommand(text, { rt: this.rt, sid, source: m.platform });
      if (r?.switchTo) { const s = this.rt.db.getSession(sid)!; this.rt.db.setMeta(s.meta.gw_key, r.switchTo); const ns = this.rt.db.getSession(r.switchTo)!; this.rt.db.updateSession(r.switchTo, { meta: { ...ns.meta, platform_target: s.meta.platform_target, gw_key: s.meta.gw_key } }); this.watched.add(r.switchTo); }
      if (r?.text) await this.send(m.platform, m.chatId, r.text);
      if (r?.send) void this.rt.send(r.switchTo ?? sid, r.send, { source: m.platform });
      return;
    }
    if (this.rt.isBusy(sid)) await this.send(m.platform, m.chatId, "⏳ Queued — I'll get to it after the current task. Send /stop to cancel, or /steer <text> to redirect.");
    void this.rt.send(sid, text, { source: m.platform, images: m.images });
  }

  private target(sid: string): { platform: string; chat: string } | null {
    if (!this.watched.has(sid)) {
      const s = this.rt.db.getSession(sid);
      if (!s?.meta?.platform_target) return null;
      this.watched.add(sid);
    }
    const t = this.rt.db.getSession(sid)?.meta?.platform_target as string | undefined;
    if (!t) return null;
    const [platform, ...rest] = t.split(":");
    return this.adapters.has(platform) ? { platform, chat: rest.join(":") } : null;
  }

  private onEvent(ev: any): void {
    if (!ev.sessionId || ev.sessionId === "*") return;
    const t = this.target(ev.sessionId);
    if (!t) return;
    const a = this.adapters.get(t.platform)!;
    const key = `${t.platform}:${t.chat}`;
    switch (ev.type) {
      case "busy":
        if (ev.busy && a.typing) {
          void a.typing(t.chat).catch(() => undefined);
          this.typingTimers.set(key, setInterval(() => void a.typing!(t.chat).catch(() => undefined), 5000));
        } else { clearInterval(this.typingTimers.get(key)); this.typingTimers.delete(key); }
        break;
      case "turn_end":
        if (!ev.silent && ev.final) void this.send(t.platform, t.chat, ev.final).catch((e) => log.warn(`gateway send: ${errMsg(e)}`));
        break;
      case "approval_request":
        void this.send(t.platform, t.chat, `⚠️ Approval needed (${ev.reason}):\n${ev.command}\n\nReply /approve, /approve session, /approve always, or /deny`);
        break;
      case "clarify_request":
        void this.send(t.platform, t.chat, `❓ ${ev.question}${ev.choices?.length ? "\n" + ev.choices.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n") : ""}`);
        break;
      case "notification":
        void this.send(t.platform, t.chat, `🔔 ${ev.text}`);
        break;
    }
  }

  private async webhook(name: string, w: { secret_env?: string; prompt?: string; deliver?: string; tools?: string[] }, payload: any, req: IncomingMessage): Promise<any> {
    const secret = w.secret_env ? this.rt.cfg.secret(w.secret_env) : undefined;
    if (secret && req.headers["x-webhook-secret"] !== secret) return { error: "bad secret" };
    const data = JSON.stringify(payload, null, 2).slice(0, 20000);
    const prompt = (w.prompt ?? "An inbound webhook arrived. Summarize what happened and whether action is needed.") + `\n\n<untrusted_webhook_payload name="${name}">\n${data}\n</untrusted_webhook_payload>`;
    const r = await this.rt.runHeadless({ prompt, source: "webhook", title: `webhook: ${name}`, approvalMode: "deny", tools: w.tools ?? ["web_search", "web_extract", "vision_analyze"] });
    if (w.deliver) await this.rt.deliver(w.deliver, r.final).catch((e) => log.warn(`webhook deliver: ${errMsg(e)}`));
    return { ok: true, session: r.sessionId, reply: r.final };
  }
}

export function approvePairing(rt: Runtime, code: string): string {
  const p = rt.db.getRecord<any>("pairing", code.toUpperCase());
  if (!p) return `No pending pairing with code ${code}.`;
  rt.db.putRecord("paired_user", `${p.platform}:${p.userId}`, { ...p, approved_at: Date.now() });
  rt.db.deleteRecord("pairing", p.code);
  return `Approved ${p.userName} (${p.userId}) on ${p.platform}.`;
}

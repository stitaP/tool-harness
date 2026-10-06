/** Telegram Bot API adapter (long polling; no public URL needed). */
import type { Adapter, Inbound } from "./manager.js";
import { log } from "../util/log.js";
import { sleep } from "../util/misc.js";

export class TelegramAdapter implements Adapter {
  readonly platform = "telegram";
  readonly maxLen = 4000;
  private running = false;
  private offset = 0;
  private ctrl = new AbortController();
  constructor(private token: string) {}

  private async api(method: string, body: any = {}, signal?: AbortSignal): Promise<any> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
    const j: any = await res.json();
    if (!j.ok) throw new Error(`telegram ${method}: ${j.description ?? res.status}`);
    return j.result;
  }

  async start(onMessage: (m: Inbound) => void): Promise<void> {
    const me = await this.api("getMe");
    log.info(`telegram connected as @${me.username}`);
    await this.api("setMyCommands", { commands: [
      { command: "new", description: "Start a new conversation" }, { command: "stop", description: "Stop the current task" },
      { command: "goal", description: "Set a standing goal" }, { command: "status", description: "Session status" }, { command: "help", description: "All commands" },
    ] }).catch(() => undefined);
    this.running = true;
    void (async () => {
      while (this.running) {
        try {
          const updates = await this.api("getUpdates", { offset: this.offset, timeout: 30, allowed_updates: ["message"] }, AbortSignal.any([this.ctrl.signal, AbortSignal.timeout(40000)]));
          for (const u of updates) {
            this.offset = u.update_id + 1;
            const msg = u.message;
            if (!msg || msg.from?.is_bot) continue;
            const images: string[] = [];
            if (msg.photo?.length) {
              try {
                const f = await this.api("getFile", { file_id: msg.photo[msg.photo.length - 1].file_id });
                const r = await fetch(`https://api.telegram.org/file/bot${this.token}/${f.file_path}`);
                images.push(`data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`);
              } catch (e: any) { log.warn(`telegram photo download failed: ${e.message}`); }
            }
            const text = msg.text ?? msg.caption ?? (images.length ? "What's in this image?" : msg.voice ? "(voice message received — transcription is not configured)" : "");
            if (!text) continue;
            onMessage({ platform: "telegram", chatId: String(msg.chat.id), userId: String(msg.from.id), userName: msg.from.username ?? msg.from.first_name ?? "user", text: text.replace(/^\/(\w+)@\w+/, "/$1"), images, isDM: msg.chat.type === "private", threadId: msg.message_thread_id ? String(msg.message_thread_id) : undefined });
          }
        } catch (e: any) {
          if (!this.running) break;
          log.warn(`telegram poll error: ${e.message}`);
          await sleep(5000).catch(() => undefined);
        }
      }
    })();
  }

  async send(chatId: string, text: string): Promise<void> {
    try { await this.api("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }); }
    catch { await this.api("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true }); } // markdown parse errors → plain
  }
  async typing(chatId: string) { await this.api("sendChatAction", { chat_id: chatId, action: "typing" }); }
  async stop() { this.running = false; this.ctrl.abort(); }
}

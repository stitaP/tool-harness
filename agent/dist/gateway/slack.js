import { log } from "../util/log.js";
export class SlackAdapter {
    botToken;
    appToken;
    platform = "slack";
    maxLen = 3500;
    ws = null;
    stopped = false;
    botUser = "";
    constructor(botToken, appToken) {
        this.botToken = botToken;
        this.appToken = appToken;
    }
    async api(method, token, body = {}) {
        const res = await fetch(`https://slack.com/api/${method}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
        const j = await res.json();
        if (!j.ok)
            throw new Error(`slack ${method}: ${j.error}`);
        return j;
    }
    async start(onMessage) {
        if (typeof globalThis.WebSocket !== "function")
            throw new Error("Slack Socket Mode needs Node 22+ (built-in WebSocket)");
        const auth = await this.api("auth.test", this.botToken);
        this.botUser = auth.user_id;
        await this.connect(onMessage);
    }
    async connect(onMessage) {
        const { url } = await this.api("apps.connections.open", this.appToken);
        const ws = new globalThis.WebSocket(url);
        this.ws = ws;
        ws.onmessage = (e) => {
            const env = JSON.parse(String(e.data));
            if (env.envelope_id)
                ws.send(JSON.stringify({ envelope_id: env.envelope_id }));
            if (env.type === "hello")
                log.info("slack socket mode connected");
            if (env.type === "disconnect") {
                ws.close();
                return;
            }
            const ev = env.payload?.event;
            if (env.type !== "events_api" || !ev)
                return;
            if (ev.bot_id || ev.subtype || ev.user === this.botUser)
                return;
            const isDM = ev.channel_type === "im";
            if (ev.type === "message" && !isDM)
                return; // in channels only respond to mentions
            if (ev.type !== "message" && ev.type !== "app_mention")
                return;
            const text = String(ev.text ?? "").replace(new RegExp(`<@${this.botUser}>`, "g"), "").trim();
            if (text)
                onMessage({ platform: "slack", chatId: ev.channel, userId: ev.user, userName: ev.user, text, isDM });
        };
        ws.onclose = () => { if (!this.stopped)
            setTimeout(() => void this.connect(onMessage).catch((err) => log.error(`slack reconnect: ${err.message}`)), 3000); };
    }
    async send(chatId, text) { await this.api("chat.postMessage", this.botToken, { channel: chatId, text, unfurl_links: false }); }
    async stop() { this.stopped = true; try {
        this.ws?.close();
    }
    catch { /* ignore */ } }
}

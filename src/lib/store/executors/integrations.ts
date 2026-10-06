/**
 * Executors for integration tools: databases, email/SMS/voice, payments,
 * object storage, maps, real-time collaboration, device hardware and OS access.
 *
 * Provider credentials come from `secret()` (agent: ~/.stitap/.env). Node-only
 * capabilities (SQLite files, psql/mysql CLIs, SMTP, local storage, OS access)
 * are reached through `process.getBuiltinModule`, so this file still bundles
 * for the browser, where the Web APIs in lib/integrations/hardware are used.
 */
import {
  createSession, joinSession, getSessionUsers, transformOperation, applyOperations, createChannel, getSessionChannels,
  type OTOperation,
} from "@/lib/integrations/collaboration";
import { createGeofence, checkGeofence, deleteGeofence, listGeofences, haversineDistance, type GeoPoint } from "@/lib/integrations/maps";
import * as hw from "@/lib/integrations/hardware";
import { execs, json, num, str, bool, list, persisted, dataDir, secret, needSecret, nodeModule, isNode, isBrowser, uid, r2, type ExecMap } from "./util";

const b64 = (s: string) => (typeof btoa === "function" ? btoa(s) : (globalThis as any).Buffer.from(s).toString("base64"));
const UA = "stitaP-harness/0.1 (+https://github.com/stitaP/tool-harness)";

async function fetchJson(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...init, headers: { "user-agent": UA, accept: "application/json", ...(init.headers as any) } });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* text */ }
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}: ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);
  return body;
}

function execFile(cmd: string, args: string[], opts: { input?: string; timeout?: number; cwd?: string; env?: Record<string, string> } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const cp = nodeModule("node:child_process");
  if (!cp) throw new Error("this action needs the desktop/agent runtime (Node.js)");
  return new Promise((resolve) => {
    const child = cp.spawn(cmd, args, { cwd: opts.cwd, env: { ...(process as any).env, ...opts.env }, windowsHide: true });
    let stdout = "", stderr = "";
    const t = setTimeout(() => child.kill("SIGKILL"), opts.timeout ?? 60000);
    child.stdout.on("data", (d: any) => (stdout += d));
    child.stderr.on("data", (d: any) => (stderr += d));
    child.on("error", (e: Error) => { clearTimeout(t); resolve({ code: 127, stdout, stderr: stderr + e.message }); });
    child.on("close", (code: number) => { clearTimeout(t); resolve({ code: code ?? 1, stdout, stderr }); });
    if (opts.input !== undefined) child.stdin.end(opts.input); else child.stdin.end();
  });
}

function which(cmd: string): boolean {
  const cp = nodeModule("node:child_process");
  if (!cp) return false;
  try { cp.execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" }); return true; } catch { return false; }
}

const platform = (): string => (isNode() ? (process as any).platform : "browser");

// ─── databases ───────────────────────────────────────────────────────────────

interface DbConn { id: string; provider: string; host?: string; port?: number; database: string; username?: string; ssl?: boolean; url?: string; createdAt: string }
const dbConns = persisted<{ conns: DbConn[] }>("database-connections", () => ({ conns: [] }));
const dbPasswords = new Map<string, string>(); // never written to disk

const CSV_ROW = /(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g;
function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length);
  const split = (l: string) => { const out: string[] = []; l.replace(CSV_ROW, (_m, q, p) => { out.push(q !== undefined ? q.replace(/""/g, '"') : p); return ""; }); return out; };
  const columns = lines.length ? split(lines[0]) : [];
  return { columns, rows: lines.slice(1).map((l) => { const v = split(l); return Object.fromEntries(columns.map((c, k) => [c, v[k]])); }) };
}

function sqliteFile(database: string): string {
  const path = nodeModule("node:path");
  if (!path) throw new Error("SQLite needs the agent runtime (Node.js)");
  if (database === ":memory:" || path.isAbsolute(database)) return database;
  return path.join(dataDir() ?? ".", "databases", database.endsWith(".db") || database.endsWith(".sqlite") ? database : `${database}.db`);
}

async function runSql(conn: DbConn, sql: string, params: unknown[] = []): Promise<{ columns: string[]; rows: Record<string, unknown>[]; changes?: number }> {
  const p = conn.provider.toLowerCase();
  if (p === "sqlite") {
    const sqlite = nodeModule("node:sqlite");
    if (!sqlite) throw new Error("SQLite needs Node.js 22.13+ (node:sqlite)");
    const file = sqliteFile(conn.database);
    if (file !== ":memory:") nodeModule("node:fs").mkdirSync(nodeModule("node:path").dirname(file), { recursive: true });
    const db = new sqlite.DatabaseSync(file);
    try {
      const statements = sql.split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/).map((s) => s.trim()).filter(Boolean);
      let last: { columns: string[]; rows: Record<string, unknown>[]; changes?: number } = { columns: [], rows: [] };
      for (const s of statements) {
        const stmt = db.prepare(s);
        if (/^\s*(select|pragma|with|explain)\b/i.test(s) || /\breturning\b/i.test(s)) {
          const rows = stmt.all(...(params as any[]));
          last = { columns: rows[0] ? Object.keys(rows[0]) : [], rows: rows.map((r: any) => ({ ...r })) };
        } else {
          const r = stmt.run(...(params as any[]));
          last = { columns: [], rows: [], changes: Number(r.changes) };
        }
      }
      return last;
    } finally { db.close(); }
  }
  const pass = dbPasswords.get(conn.id) ?? secret(`DB_PASSWORD_${conn.id.toUpperCase().replace(/\W/g, "_")}`, "PGPASSWORD", "MYSQL_PWD") ?? "";
  if (p === "postgres" || p === "postgresql") {
    if (conn.host?.includes("neon.tech")) {
      const cs = `postgresql://${encodeURIComponent(conn.username ?? "")}:${encodeURIComponent(pass)}@${conn.host}/${conn.database}?sslmode=require`;
      const r = await fetchJson(`https://${conn.host}/sql`, { method: "POST", headers: { "content-type": "application/json", "Neon-Connection-String": cs }, body: JSON.stringify({ query: sql, params }) });
      return { columns: (r.fields ?? []).map((f: any) => f.name), rows: r.rows ?? [], changes: r.rowCount };
    }
    if (!which("psql")) throw new Error("PostgreSQL needs the `psql` client on PATH (or a Neon serverless host)");
    if (params.length) throw new Error("prepared parameters are not supported through psql; inline literal values");
    const r = await execFile("psql", ["-X", "-v", "ON_ERROR_STOP=1", "--csv", "-h", conn.host ?? "localhost", "-p", String(conn.port ?? 5432), "-U", conn.username ?? "postgres", "-d", conn.database, "-c", sql], { env: { PGPASSWORD: pass, PGSSLMODE: conn.ssl ? "require" : "prefer" }, timeout: 120000 });
    if (r.code !== 0) throw new Error(r.stderr.trim() || `psql exited ${r.code}`);
    return parseCsv(r.stdout);
  }
  if (p === "mysql" || p === "mariadb") {
    const bin = which("mysql") ? "mysql" : which("mariadb") ? "mariadb" : null;
    if (!bin) throw new Error("MySQL needs the `mysql` (or `mariadb`) client on PATH");
    const r = await execFile(bin, ["-h", conn.host ?? "localhost", "-P", String(conn.port ?? 3306), "-u", conn.username ?? "root", "--batch", "--raw", conn.database, "-e", sql], { env: { MYSQL_PWD: pass }, timeout: 120000 });
    if (r.code !== 0) throw new Error(r.stderr.trim() || `mysql exited ${r.code}`);
    const lines = r.stdout.replace(/\r/g, "").split("\n").filter(Boolean);
    const columns = lines[0]?.split("\t") ?? [];
    return { columns, rows: lines.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, k) => [columns[k], v === "NULL" ? null : v]))) };
  }
  if (p === "duckdb") {
    if (!which("duckdb")) throw new Error("DuckDB needs the `duckdb` CLI on PATH");
    const r = await execFile("duckdb", ["-csv", conn.database === ":memory:" ? "" : sqliteFile(conn.database).replace(/\.db$/, ".duckdb"), "-c", sql].filter(Boolean), { timeout: 120000 });
    if (r.code !== 0) throw new Error(r.stderr.trim());
    return parseCsv(r.stdout);
  }
  if (p === "mongodb" || p === "mongo") {
    if (!which("mongosh")) throw new Error("MongoDB needs `mongosh` on PATH");
    const uri = conn.url ?? `mongodb://${conn.username ? `${encodeURIComponent(conn.username)}:${encodeURIComponent(pass)}@` : ""}${conn.host ?? "localhost"}:${conn.port ?? 27017}/${conn.database}`;
    const r = await execFile("mongosh", [uri, "--quiet", "--eval", `JSON.stringify(${sql})`], { timeout: 120000 });
    if (r.code !== 0) throw new Error(r.stderr.trim());
    let v: any = r.stdout.trim();
    try { v = JSON.parse(v); } catch { /* raw */ }
    const rows = Array.isArray(v) ? v : [{ result: v }];
    return { columns: rows[0] ? Object.keys(rows[0]) : [], rows };
  }
  throw new Error(`unsupported database provider "${conn.provider}" (sqlite, postgres, mysql, duckdb, mongodb)`);
}

function getConn(i: Record<string, unknown>): DbConn {
  if (i.connectionId) {
    const c = dbConns.get().conns.find((x) => x.id === str(i.connectionId));
    if (!c) throw new Error(`connection ${str(i.connectionId)} not found — use database.connect first`);
    return c;
  }
  const provider = str(i.provider, "sqlite");
  return { id: "adhoc", provider, database: str(i.database, provider === "sqlite" ? "default" : ""), host: i.host ? str(i.host) : undefined, createdAt: "" };
}

function migrationSql(op: any, provider: string): string {
  const q = (n: string) => (provider === "mysql" ? `\`${n}\`` : `"${n}"`);
  const col = (c: any) => typeof c === "string" ? c : `${q(c.name)} ${c.type ?? "TEXT"}${c.primaryKey ? " PRIMARY KEY" : ""}${c.notNull || c.nullable === false ? " NOT NULL" : ""}${c.unique ? " UNIQUE" : ""}${c.default !== undefined ? ` DEFAULT ${typeof c.default === "string" ? `'${c.default.replace(/'/g, "''")}'` : c.default}` : ""}`;
  switch (op.type ?? op.op) {
    case "createTable": return `CREATE TABLE IF NOT EXISTS ${q(op.table)} (${(op.columns ?? []).map(col).join(", ")})`;
    case "dropTable": return `DROP TABLE IF EXISTS ${q(op.table)}`;
    case "addColumn": return `ALTER TABLE ${q(op.table)} ADD COLUMN ${col(op.column ?? op)}`;
    case "dropColumn": return `ALTER TABLE ${q(op.table)} DROP COLUMN ${q(op.column?.name ?? op.column ?? op.name)}`;
    case "renameColumn": return `ALTER TABLE ${q(op.table)} RENAME COLUMN ${q(op.from)} TO ${q(op.to)}`;
    case "renameTable": return `ALTER TABLE ${q(op.table)} RENAME TO ${q(op.to)}`;
    case "createIndex": return `CREATE ${op.unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${q(op.name ?? `idx_${op.table}_${list(op.columns).join("_")}`)} ON ${q(op.table)} (${list(op.columns).map(q).join(", ")})`;
    case "dropIndex": return `DROP INDEX IF EXISTS ${q(op.name)}`;
    case "raw": case "sql": return str(op.sql);
    default: throw new Error(`unknown migration op ${JSON.stringify(op).slice(0, 80)} (createTable, dropTable, addColumn, dropColumn, renameColumn, renameTable, createIndex, dropIndex, raw)`);
  }
}

// ─── email (Resend / SendGrid / Mailgun / SMTP) ──────────────────────────────

async function smtpSend(o: { to: string[]; from: string; subject: string; text?: string; html?: string }): Promise<string> {
  const net = nodeModule("node:net"), tls = nodeModule("node:tls");
  if (!net || !tls) throw new Error("SMTP needs the agent runtime (Node.js)");
  const host = needSecret("SMTP", "SMTP_HOST"), port = Number(secret("SMTP_PORT") ?? 587);
  const user = secret("SMTP_USER"), pass = secret("SMTP_PASSWORD", "SMTP_PASS");
  let sock: any = port === 465 ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  let buf = "";
  const waiters: ((l: string) => void)[] = [];
  const onData = (d: any) => {
    buf += d.toString();
    let idx: number;
    while ((idx = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
      if (/^\d{3} /.test(line)) waiters.shift()?.(line);
    }
  };
  sock.on("data", onData);
  const read = () => new Promise<string>((res, rej) => { waiters.push(res); setTimeout(() => rej(new Error("SMTP timeout")), 30000); });
  const cmd = async (c: string, expect: RegExp) => { sock.write(c + "\r\n"); const r = await read(); if (!expect.test(r)) throw new Error(`SMTP ${c.split(" ")[0]} failed: ${r}`); return r; };
  await read();
  await cmd(`EHLO stitap.local`, /^250/);
  if (port !== 465) {
    await cmd("STARTTLS", /^220/);
    sock.removeListener("data", onData);
    sock = tls.connect({ socket: sock, servername: host });
    sock.on("data", onData);
    await new Promise((r) => sock.once("secureConnect", r));
    await cmd(`EHLO stitap.local`, /^250/);
  }
  if (user && pass) { await cmd("AUTH LOGIN", /^334/); await cmd(b64(user), /^334/); await cmd(b64(pass), /^235/); }
  const addr = (s: string) => (/<([^>]+)>/.exec(s)?.[1] ?? s).trim();
  await cmd(`MAIL FROM:<${addr(o.from)}>`, /^250/);
  for (const t of o.to) await cmd(`RCPT TO:<${addr(t)}>`, /^25[01]/);
  await cmd("DATA", /^354/);
  const boundary = `b_${Date.now()}`;
  const body = [
    `From: ${o.from}`, `To: ${o.to.join(", ")}`, `Subject: ${o.subject}`, `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0",
    ...(o.html ? [`Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/plain; charset=utf-8", "", o.text ?? o.html.replace(/<[^>]+>/g, ""), `--${boundary}`, "Content-Type: text/html; charset=utf-8", "", o.html, `--${boundary}--`] : ["Content-Type: text/plain; charset=utf-8", "", o.text ?? ""]),
  ].join("\r\n").replace(/\r\n\./g, "\r\n..");
  const r = await cmd(`${body}\r\n.`, /^250/);
  sock.write("QUIT\r\n"); sock.end();
  return r;
}

async function sendEmailVia(provider: string, m: { to: string[]; from: string; subject: string; text?: string; html?: string }) {
  switch (provider) {
    case "resend": {
      const r = await fetchJson("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${needSecret("Resend", "RESEND_API_KEY")}`, "content-type": "application/json" }, body: JSON.stringify({ from: m.from, to: m.to, subject: m.subject, text: m.text, html: m.html }) });
      return { provider, messageId: r.id };
    }
    case "sendgrid": {
      await fetchJson("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { authorization: `Bearer ${needSecret("SendGrid", "SENDGRID_API_KEY")}`, "content-type": "application/json" }, body: JSON.stringify({ personalizations: [{ to: m.to.map((email) => ({ email })) }], from: { email: m.from }, subject: m.subject, content: [...(m.text ? [{ type: "text/plain", value: m.text }] : []), ...(m.html ? [{ type: "text/html", value: m.html }] : [])] }) }).catch((e) => { if (/202/.test(e.message)) return {}; throw e; });
      return { provider, accepted: true };
    }
    case "mailgun": {
      const domain = needSecret("Mailgun domain", "MAILGUN_DOMAIN");
      const form = new URLSearchParams({ from: m.from, subject: m.subject });
      m.to.forEach((t) => form.append("to", t));
      if (m.text) form.append("text", m.text);
      if (m.html) form.append("html", m.html);
      const region = secret("MAILGUN_REGION") === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net";
      const r = await fetchJson(`https://${region}/v3/${domain}/messages`, { method: "POST", headers: { authorization: `Basic ${b64(`api:${needSecret("Mailgun", "MAILGUN_API_KEY")}`)}` }, body: form });
      return { provider, messageId: r.id };
    }
    case "postmark": {
      const r = await fetchJson("https://api.postmarkapp.com/email", { method: "POST", headers: { "X-Postmark-Server-Token": needSecret("Postmark", "POSTMARK_SERVER_TOKEN"), "content-type": "application/json" }, body: JSON.stringify({ From: m.from, To: m.to.join(","), Subject: m.subject, TextBody: m.text, HtmlBody: m.html, MessageStream: secret("POSTMARK_STREAM") ?? "outbound" }) });
      return { provider, messageId: r.MessageID };
    }
    case "ses": {
      const r = await awsQuery("email", { Action: "SendEmail", Source: m.from, "Message.Subject.Data": m.subject, ...(m.text ? { "Message.Body.Text.Data": m.text } : {}), ...(m.html ? { "Message.Body.Html.Data": m.html } : {}), ...Object.fromEntries(m.to.map((t, k) => [`Destination.ToAddresses.member.${k + 1}`, t])) });
      return { provider, messageId: /<MessageId>(.*?)<\/MessageId>/.exec(r)?.[1] };
    }
    case "smtp": return { provider, response: await smtpSend(m) };
    default: throw new Error(`unknown email provider "${provider}" (resend, sendgrid, mailgun, postmark, ses, smtp)`);
  }
}

// ─── SMS / voice ─────────────────────────────────────────────────────────────

async function twilio(path: string, form: Record<string, string>) {
  const sid = needSecret("Twilio", "TWILIO_ACCOUNT_SID"), token = needSecret("Twilio", "TWILIO_AUTH_TOKEN");
  return fetchJson(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${path}`, { method: "POST", headers: { authorization: `Basic ${b64(`${sid}:${token}`)}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
}
const e164 = (p: string) => { const d = p.replace(/[^\d+]/g, ""); return d.startsWith("+") ? d : d.length === 10 ? `+91${d}` : `+${d}`; };

// ─── text-to-speech on this machine ──────────────────────────────────────────

async function speakLocal(text: string, opts: { lang?: string; rate?: number; voice?: string } = {}) {
  if (isBrowser()) { await hw.speak(text, { lang: opts.lang, rate: opts.rate } as any); return { spoken: true, engine: "web-speech" }; }
  const os = platform();
  if (os === "darwin") { const r = await execFile("say", [...(opts.voice ? ["-v", opts.voice] : []), ...(opts.rate ? ["-r", String(Math.round(175 * opts.rate))] : []), text]); if (r.code) throw new Error(r.stderr); return { spoken: true, engine: "macOS say" }; }
  if (os === "win32") {
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${opts.rate ? `$s.Rate = ${Math.max(-10, Math.min(10, Math.round((opts.rate - 1) * 5)))};` : ""} $s.Speak([Console]::In.ReadToEnd())`;
    const r = await execFile("powershell", ["-NoProfile", "-Command", ps], { input: text });
    if (r.code) throw new Error(r.stderr); return { spoken: true, engine: "Windows SAPI" };
  }
  for (const [bin, args] of [["spd-say", ["-w", text]], ["espeak-ng", [text]], ["espeak", [text]], ["festival", ["--tts"]]] as [string, string[]][]) {
    if (which(bin)) { const r = await execFile(bin, args, bin === "festival" ? { input: text } : {}); if (!r.code) return { spoken: true, engine: bin }; }
  }
  throw new Error("no text-to-speech engine found (install espeak-ng or speech-dispatcher)");
}

/** Cloud text-to-speech → an MP3 file under the data dir (played locally when possible). */
async function cloudTts(provider: string, text: string, i: Record<string, unknown>) {
  let audio: ArrayBuffer;
  if (provider === "elevenlabs") {
    const voice = str(i.voice, secret("ELEVENLABS_VOICE_ID") ?? "21m00Tcm4TlvDq8Ny2RM");
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, { method: "POST", headers: { "xi-api-key": needSecret("ElevenLabs", "ELEVENLABS_API_KEY"), "content-type": "application/json", accept: "audio/mpeg" }, body: JSON.stringify({ text, model_id: secret("ELEVENLABS_MODEL") ?? "eleven_multilingual_v2" }) });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    audio = await res.arrayBuffer();
  } else {
    const region = needSecret("Azure Speech region", "AZURE_SPEECH_REGION");
    const lang = str(i.language, "en-IN"), voice = str(i.voice, lang.startsWith("hi") ? "hi-IN-SwaraNeural" : "en-IN-NeerjaNeural");
    const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</voice></speak>`;
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": needSecret("Azure Speech", "AZURE_SPEECH_KEY"), "content-type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "user-agent": UA }, body: ssml });
    if (!res.ok) throw new Error(`Azure TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    audio = await res.arrayBuffer();
  }
  const fs = nodeModule("node:fs"), path = nodeModule("node:path");
  if (!fs) { const B = (globalThis as any).Buffer; return { bytes: audio.byteLength, audioBase64: B ? B.from(audio).toString("base64") : undefined }; }
  const file = path.join(dataDir() ?? ".", "audio", `tts-${Date.now()}.mp3`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, new Uint8Array(audio));
  let played: string | undefined;
  if (i.play !== false) {
    const os = platform();
    const players: [string, string[]][] = os === "darwin" ? [["afplay", [file]]] : os === "win32" ? [] : [["ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", file]], ["mpg123", ["-q", file]]];
    for (const [bin, args] of players) if (which(bin)) { const r = await execFile(bin, args, { timeout: 120000 }); if (!r.code) { played = bin; break; } }
  }
  return { file, bytes: audio.byteLength, played: played ?? false };
}

// ─── payments (Stripe, Razorpay, Paddle, Lemon Squeezy) ─────────────────────────────────────────────

async function stripe(path: string, method = "GET", form?: Record<string, string>) {
  return fetchJson(`https://api.stripe.com/v1/${path}`, { method, headers: { authorization: `Bearer ${needSecret("Stripe", "STRIPE_SECRET_KEY")}`, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) }, body: form ? new URLSearchParams(form) : undefined });
}
async function razorpay(path: string, method = "GET", body?: unknown) {
  const id = needSecret("Razorpay", "RAZORPAY_KEY_ID"), sec = needSecret("Razorpay", "RAZORPAY_KEY_SECRET");
  return fetchJson(`https://api.razorpay.com/v1/${path}`, { method, headers: { authorization: `Basic ${b64(`${id}:${sec}`)}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}

async function paddle(path: string, method = "GET", body?: unknown) {
  const base = secret("PADDLE_ENV") === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const r = await fetchJson(`${base}/${path}`, { method, headers: { authorization: `Bearer ${needSecret("Paddle", "PADDLE_API_KEY")}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return r.data ?? r;
}
async function lemon(path: string, method = "GET", body?: unknown) {
  const r = await fetchJson(`https://api.lemonsqueezy.com/v1/${path}`, { method, headers: { authorization: `Bearer ${needSecret("Lemon Squeezy", "LEMONSQUEEZY_API_KEY")}`, accept: "application/vnd.api+json", "content-type": "application/vnd.api+json" }, body: body ? JSON.stringify(body) : undefined });
  return r.data ?? r;
}

// ─── object storage: local folder or any S3-compatible service (SigV4) ───────

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest("SHA-256", buf as any);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmac(key: Uint8Array | string, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", (typeof key === "string" ? new TextEncoder().encode(key) : key) as any, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const encKey = (k: string) => k.split("/").map(encodeURIComponent).join("/");

function s3Config(provider: string) {
  const region = secret("S3_REGION", "AWS_REGION", "AWS_DEFAULT_REGION") ?? (provider === "r2" ? "auto" : "us-east-1");
  const accessKey = needSecret(`${provider} storage`, "S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretKey = needSecret(`${provider} storage`, "S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  const endpoint = secret("S3_ENDPOINT") ?? (provider === "gcs" ? "https://storage.googleapis.com" : provider === "r2" ? `https://${needSecret("R2", "R2_ACCOUNT_ID")}.r2.cloudflarestorage.com` : `https://s3.${region}.amazonaws.com`);
  return { region, accessKey, secretKey, endpoint: endpoint.replace(/\/+$/, "") };
}

async function s3Sign(method: string, provider: string, bucket: string, key: string, query: Record<string, string>, body: Uint8Array | string, presignSeconds?: number) {
  const c = s3Config(provider);
  const url = new URL(`${c.endpoint}/${bucket}${key ? `/${encKey(key)}` : ""}`);
  const now = new Date(), amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""), day = amzDate.slice(0, 8);
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const payloadHash = presignSeconds ? "UNSIGNED-PAYLOAD" : await sha256Hex(body);
  const q: Record<string, string> = { ...query };
  if (presignSeconds) Object.assign(q, { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${c.accessKey}/${scope}`, "X-Amz-Date": amzDate, "X-Amz-Expires": String(presignSeconds), "X-Amz-SignedHeaders": "host" });
  const canonQuery = Object.keys(q).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`).join("&");
  const headers: Record<string, string> = presignSeconds ? { host: url.host } : { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonical = [method, url.pathname, canonQuery, Object.keys(headers).sort().map((h) => `${h}:${headers[h]}\n`).join(""), signedHeaders, payloadHash].join("\n");
  const sts = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n");
  let k = await hmac(`AWS4${c.secretKey}`, day);
  for (const p of [c.region, "s3", "aws4_request"]) k = await hmac(k, p);
  const sig = hex(await hmac(k, sts));
  if (presignSeconds) return { url: `${url.origin}${url.pathname}?${canonQuery}&X-Amz-Signature=${sig}` };
  return { url: `${url.origin}${url.pathname}${canonQuery ? `?${canonQuery}` : ""}`, headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}` } };
}

/** AWS query-protocol call (SNS, SES) signed with SigV4. Returns the XML body. */
async function awsQuery(service: string, params: Record<string, string>): Promise<string> {
  const region = secret("AWS_REGION", "AWS_DEFAULT_REGION", "S3_REGION") ?? "us-east-1";
  const accessKey = needSecret(`AWS ${service}`, "AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID"), secretKey = needSecret(`AWS ${service}`, "AWS_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY");
  const host = `${service}.${region}.amazonaws.com`;
  const body = new URLSearchParams({ Version: service === "sns" ? "2010-03-31" : "2010-12-01", ...params }).toString().replace(/\+/g, "%20");
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""), day = amzDate.slice(0, 8), scope = `${day}/${region}/${service === "email" ? "ses" : service}/aws4_request`;
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", host, "x-amz-date": amzDate };
  const signed = Object.keys(headers).sort().join(";");
  const canonical = ["POST", "/", "", Object.keys(headers).sort().map((h) => `${h}:${headers[h]}\n`).join(""), signed, await sha256Hex(body)].join("\n");
  let k = await hmac(`AWS4${secretKey}`, day);
  for (const p of [region, service === "email" ? "ses" : service, "aws4_request"]) k = await hmac(k, p);
  const sig = hex(await hmac(k, ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n")));
  const res = await fetch(`https://${host}/`, { method: "POST", headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed}, Signature=${sig}` }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`AWS ${service} ${res.status}: ${/<Message>(.*?)<\/Message>/.exec(text)?.[1] ?? text.slice(0, 300)}`);
  return text;
}

/** Azure Blob Storage with a SAS token (AZURE_STORAGE_ACCOUNT + AZURE_STORAGE_SAS). */
function azureUrl(container: string, key: string, query: Record<string, string> = {}): string {
  const account = needSecret("Azure storage", "AZURE_STORAGE_ACCOUNT");
  const sas = needSecret("Azure storage SAS token", "AZURE_STORAGE_SAS").replace(/^\?/, "");
  const qs = new URLSearchParams(query).toString();
  return `https://${account}.blob.core.windows.net/${container}${key ? `/${encKey(key)}` : ""}?${qs ? `${qs}&` : ""}${sas}`;
}

function localStoragePath(bucket: string, key = ""): string {
  const path = nodeModule("node:path");
  if (!path) throw new Error("local storage provider needs the agent runtime");
  const root = path.join(secret("STITAP_STORAGE_DIR") ?? path.join(dataDir() ?? ".", "storage"), bucket.replace(/[^\w.-]/g, "_"));
  const full = path.resolve(root, key);
  if (!full.startsWith(path.resolve(root))) throw new Error("key escapes the bucket");
  return full;
}

const isBase64 = (s: string) => /^data:[^;]+;base64,/.test(s) || (s.length % 4 === 0 && s.length > 40 && /^[A-Za-z0-9+/=\s]+$/.test(s));
function contentBytes(content: string): Uint8Array {
  const B = (globalThis as any).Buffer;
  const raw = content.replace(/^data:[^;]+;base64,/, "");
  if (B) return isBase64(content) ? new Uint8Array(B.from(raw, "base64")) : new TextEncoder().encode(content);
  return isBase64(content) ? Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)) : new TextEncoder().encode(content);
}

// ─── maps ────────────────────────────────────────────────────────────────────

const OSRM = () => secret("OSRM_URL") ?? "https://router.project-osrm.org";
const NOMINATIM = () => secret("NOMINATIM_URL") ?? "https://nominatim.openstreetmap.org";
const PROFILE: Record<string, string> = { car: "driving", driving: "driving", bike: "cycling", cycling: "cycling", foot: "walking", walking: "walking" };

function destination(c: GeoPoint, bearingDeg: number, meters: number): GeoPoint {
  const R = 6371000, br = (bearingDeg * Math.PI) / 180, lat1 = (c.lat * Math.PI) / 180, lng1 = (c.lng * Math.PI) / 180, d = meters / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: r2((lat2 * 180) / Math.PI, 6), lng: r2((lng2 * 180) / Math.PI, 6) };
}

// ─── OS helpers (Node) ───────────────────────────────────────────────────────

function osFsPath(p: unknown): string {
  const path = nodeModule("node:path"), os = nodeModule("node:os");
  if (!path) throw new Error("file access needs the agent runtime (Node.js)");
  let s = str(p);
  if (s === "~" || s.startsWith("~/")) s = path.join(os.homedir(), s.slice(1));
  const full = path.resolve(s);
  for (const b of [".ssh", ".aws", ".gnupg"]) if (full.startsWith(path.join(os.homedir(), b))) throw new Error(`access to ~/${b} is blocked`);
  return full;
}

async function clipboardNode(action: string, text?: string): Promise<unknown> {
  const os = platform();
  const tries: [string, string[]][] = action === "write"
    ? (os === "darwin" ? [["pbcopy", []]] : os === "win32" ? [["powershell", ["-NoProfile", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"]]] : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]])
    : (os === "darwin" ? [["pbpaste", []]] : os === "win32" ? [["powershell", ["-NoProfile", "-Command", "Get-Clipboard -Raw"]]] : [["wl-paste", ["--no-newline"]], ["xclip", ["-selection", "clipboard", "-o"]], ["xsel", ["--clipboard", "--output"]]]);
  for (const [bin, args] of tries) {
    if (os !== "win32" && !which(bin)) continue;
    const r = await execFile(bin, args, action === "write" ? { input: text ?? "" } : {});
    if (r.code === 0) return action === "write" ? { written: (text ?? "").length } : { text: r.stdout };
  }
  throw new Error("no clipboard utility available (install wl-clipboard, xclip or xsel)");
}

// ─── executors ───────────────────────────────────────────────────────────────

export const INTEGRATION_EXECUTORS: ExecMap = execs({
  // databases
  "database.connect": async (i) => {
    const provider = str(i.provider).toLowerCase();
    const conn: DbConn = { id: uid("DB").toLowerCase(), provider, host: i.host ? str(i.host) : undefined, port: i.port ? num(i.port) : undefined, database: str(i.database), username: i.username ? str(i.username) : undefined, ssl: bool(i.ssl), url: i.url ? str(i.url) : undefined, createdAt: new Date().toISOString() };
    if (i.password) dbPasswords.set(conn.id, str(i.password));
    const probe = provider === "mongodb" || provider === "mongo" ? "db.stats()" : "SELECT 1 AS ok";
    await runSql(conn, probe);
    dbConns.get().conns.push(conn);
    dbConns.save();
    return { connectionId: conn.id, provider, database: conn.database, verified: true, note: i.password ? "password kept in memory for this process only; set a DB_PASSWORD_<ID> secret to persist" : undefined };
  },
  "database.query": async (i) => {
    const conn = getConn(i);
    const params = i.params ? json<unknown[]>(i.params) : [];
    const r = await runSql(conn, str(i.query), params);
    return { columns: r.columns, rowCount: r.rows.length, rows: r.rows.slice(0, 500), truncated: r.rows.length > 500, changes: r.changes };
  },
  "database.schema": async (i) => {
    const conn = getConn(i);
    const p = conn.provider.toLowerCase();
    const t = i.table ? str(i.table).replace(/'/g, "''") : "";
    if (p === "sqlite") {
      const tables = (await runSql(conn, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ${t ? `AND name='${t}'` : ""} ORDER BY name`)).rows.map((r) => String(r.name));
      const out = [];
      for (const name of tables) {
        const cols = (await runSql(conn, `PRAGMA table_info('${name.replace(/'/g, "''")}')`)).rows;
        const idx = bool(i.includeIndexes) ? (await runSql(conn, `PRAGMA index_list('${name.replace(/'/g, "''")}')`)).rows : undefined;
        out.push({ table: name, columns: cols.map((c: any) => ({ name: c.name, type: c.type, nullable: !c.notnull, primaryKey: !!c.pk, default: c.dflt_value })), indexes: idx });
      }
      return { tables: out };
    }
    if (p === "mongodb" || p === "mongo") return (await runSql(conn, t ? `db.getCollection('${t}').findOne()` : "db.getCollectionNames()")).rows;
    const q = `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema ${p.startsWith("postgres") ? "= 'public'" : "= DATABASE()"} ${t ? `AND table_name = '${t}'` : ""} ORDER BY table_name, ordinal_position`;
    const rows = (await runSql(conn, q)).rows as any[];
    const by: Record<string, any[]> = {};
    for (const r of rows) (by[r.table_name ?? r.TABLE_NAME] ??= []).push({ name: r.column_name ?? r.COLUMN_NAME, type: r.data_type ?? r.DATA_TYPE, nullable: String(r.is_nullable ?? r.IS_NULLABLE) === "YES", default: r.column_default ?? r.COLUMN_DEFAULT });
    return { tables: Object.entries(by).map(([table, columns]) => ({ table, columns })) };
  },
  "database.migrate": async (i) => {
    const conn = getConn(i);
    const ops = json<any[]>(i.operations);
    const sqls = ops.map((o) => migrationSql(o, conn.provider.toLowerCase()));
    if (bool(i.dryRun)) return { dryRun: true, statements: sqls };
    const p = conn.provider.toLowerCase();
    const wrapped = p === "sqlite" || p.startsWith("postgres") ? `BEGIN; ${sqls.join("; ")}; COMMIT` : sqls.join("; ");
    await runSql(conn, wrapped);
    return { applied: sqls.length, statements: sqls };
  },

  // email / sms / voice
  "email.send": async (i) => {
    const to = list(i.to);
    if (!to.length) throw new Error("no recipients");
    const r = await sendEmailVia(str(i.provider, secret("SMTP_HOST") ? "smtp" : "resend").toLowerCase(), { to, from: str(i.from, secret("EMAIL_FROM") ?? ""), subject: str(i.subject), text: i.text ? str(i.text) : undefined, html: i.html ? str(i.html) : undefined });
    return { sent: true, to, ...r };
  },
  "email.template": (i) => {
    const vars = json<Record<string, unknown>>(i.variables, {});
    const missing: string[] = [];
    const out = str(i.template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
      const v = k.split(".").reduce<any>((o, p) => (o == null ? undefined : o[p]), vars);
      if (v === undefined) { missing.push(k); return ""; }
      return String(v);
    });
    const fmt = str(i.format, "text");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = fmt === "html" ? (/<\w/.test(out) ? out : `<div style="font-family:sans-serif;line-height:1.5">${esc(out).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`) : undefined;
    return { format: fmt, content: html ?? out, missingVariables: [...new Set(missing)] };
  },
  "sms.send": async (i) => {
    const provider = str(i.provider, "twilio").toLowerCase();
    const to = e164(str(i.to));
    if (provider === "twilio") { const r = await twilio("Messages.json", { To: to, From: str(i.from, needSecret("Twilio sender", "TWILIO_FROM")), Body: str(i.body) }); return { sent: true, provider, sid: r.sid, status: r.status }; }
    if (provider === "vonage") {
      const r = await fetchJson("https://rest.nexmo.com/sms/json", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ api_key: needSecret("Vonage", "VONAGE_API_KEY"), api_secret: needSecret("Vonage", "VONAGE_API_SECRET"), to: to.replace("+", ""), from: str(i.from, secret("VONAGE_FROM") ?? "stitaP"), text: str(i.body) }) });
      const m = r.messages?.[0];
      if (m?.status !== "0") throw new Error(`Vonage: ${m?.["error-text"] ?? "send failed"}`);
      return { sent: true, provider, messageId: m["message-id"] };
    }
    if (provider === "msg91") {
      const r = await fetchJson("https://control.msg91.com/api/v5/flow/", { method: "POST", headers: { authkey: needSecret("MSG91", "MSG91_AUTH_KEY"), "content-type": "application/json" }, body: JSON.stringify({ template_id: needSecret("MSG91 template", "MSG91_TEMPLATE_ID"), short_url: "0", recipients: [{ mobiles: to.replace("+", ""), message: str(i.body) }] }) });
      return { sent: true, provider, response: r };
    }
    if (provider === "sns") {
      const xml = await awsQuery("sns", { Action: "Publish", PhoneNumber: to, Message: str(i.body), ...(i.from ? { "MessageAttributes.entry.1.Name": "AWS.SNS.SMS.SenderID", "MessageAttributes.entry.1.Value.DataType": "String", "MessageAttributes.entry.1.Value.StringValue": str(i.from) } : {}) });
      return { sent: true, provider, messageId: /<MessageId>(.*?)<\/MessageId>/.exec(xml)?.[1] };
    }
    throw new Error(`unknown SMS provider "${provider}" (twilio, vonage, msg91, sns)`);
  },
  "voice.call": async (i) => {
    const provider = str(i.provider, i.to ? "twilio" : "local").toLowerCase();
    if (provider === "elevenlabs" || provider === "azure-tts" || provider === "azure") return { provider, ...(await cloudTts(provider, str(i.text), i)) };
    if (provider === "local" || provider === "system" || !i.to) return { provider: "local", ...(await speakLocal(str(i.text), { voice: i.voice ? str(i.voice) : undefined, lang: i.language ? str(i.language) : undefined })) };
    const sayEsc = str(i.text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const twiml = `<Response><Say${i.voice ? ` voice="${str(i.voice)}"` : ""}${i.language ? ` language="${str(i.language)}"` : ""}>${sayEsc}</Say></Response>`;
    const r = await twilio("Calls.json", { To: e164(str(i.to)), From: needSecret("Twilio caller ID", "TWILIO_FROM"), Twiml: twiml });
    return { provider: "twilio", callSid: r.sid, status: r.status };
  },

  // payments
  "payment.create_checkout": async (i) => {
    const provider = str(i.provider, "stripe").toLowerCase();
    const amount = Math.round(num(i.amount)), currency = str(i.currency, "inr").toLowerCase();
    if (provider === "razorpay") {
      const r = await razorpay("payment_links", "POST", { amount, currency: currency.toUpperCase(), description: str(i.productName), reminder_enable: true });
      return { provider, sessionId: r.id, url: r.short_url, status: r.status };
    }
    if (provider === "paddle") {
      const interval = str(i.mode) === "subscription" ? { billing_cycle: { interval: str(i.interval, "month"), frequency: 1 } } : {};
      const t = await paddle("transactions", "POST", { items: [{ quantity: 1, price: { description: str(i.productName), unit_price: { amount: String(amount), currency_code: currency.toUpperCase() }, product: { name: str(i.productName), tax_category: "standard" }, ...interval } }], collection_mode: "automatic" });
      return { provider, sessionId: t.id, url: t.checkout?.url, status: t.status, note: t.checkout?.url ? undefined : "set a default payment link in Paddle > Checkout settings to get a hosted checkout URL" };
    }
    if (provider === "lemon-squeezy" || provider === "lemonsqueezy") {
      const c = await lemon("checkouts", "POST", { data: { type: "checkouts", attributes: { custom_price: amount, product_options: { name: str(i.productName), redirect_url: i.successUrl ? str(i.successUrl) : undefined } }, relationships: { store: { data: { type: "stores", id: needSecret("Lemon Squeezy store", "LEMONSQUEEZY_STORE_ID") } }, variant: { data: { type: "variants", id: str(i.variantId, needSecret("Lemon Squeezy variant", "LEMONSQUEEZY_VARIANT_ID")) } } } } });
      return { provider, sessionId: c.id, url: c.attributes?.url, expiresAt: c.attributes?.expires_at };
    }
    const mode = str(i.mode, "payment");
    const form: Record<string, string> = {
      mode, "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(amount), "line_items[0][price_data][product_data][name]": str(i.productName),
      success_url: str(i.successUrl, "https://example.com/success?session_id={CHECKOUT_SESSION_ID}"), cancel_url: str(i.cancelUrl, "https://example.com/cancel"),
    };
    if (mode === "subscription") form["line_items[0][price_data][recurring][interval]"] = str(i.interval, "month");
    const r = await stripe("checkout/sessions", "POST", form);
    return { provider: "stripe", sessionId: r.id, url: r.url, status: r.status };
  },
  "payment.verify": async (i) => {
    const provider = str(i.provider, "stripe").toLowerCase();
    if (provider === "razorpay") { const r = await razorpay(`payment_links/${str(i.sessionId)}`); return { provider, status: r.status, paid: r.status === "paid", amountPaid: r.amount_paid, payments: r.payments }; }
    if (provider === "paddle") { const t = await paddle(`transactions/${encodeURIComponent(str(i.sessionId))}`); return { provider, status: t.status, paid: t.status === "completed" || t.status === "paid", amountTotal: t.details?.totals?.grand_total, currency: t.currency_code }; }
    if (provider === "lemon-squeezy" || provider === "lemonsqueezy") {
      const id = str(i.sessionId);
      if (/^\d+$/.test(id)) { const o = await lemon(`orders/${id}`); return { provider, status: o.attributes?.status, paid: o.attributes?.status === "paid", amountTotal: o.attributes?.total, currency: o.attributes?.currency, customerEmail: o.attributes?.user_email }; }
      const c = await lemon(`checkouts/${encodeURIComponent(id)}`);
      return { provider, status: "open", paid: false, url: c.attributes?.url, note: "Lemon Squeezy checkouts don't carry payment state; pass the numeric order id (from the order_created webhook) to confirm payment" };
    }
    const r = await stripe(`checkout/sessions/${encodeURIComponent(str(i.sessionId))}`);
    return { provider: "stripe", status: r.status, paymentStatus: r.payment_status, paid: r.payment_status === "paid", amountTotal: r.amount_total, currency: r.currency, customerEmail: r.customer_details?.email };
  },
  "payment.invoice": (i) => {
    const items = json<any[]>(i.items).map((it) => ({ name: str(it.name ?? it.description), quantity: num(it.quantity ?? it.qty, 1), unitPrice: num(it.unitPrice ?? it.price ?? it.rate) }));
    const currency = str(i.currency, "INR").toUpperCase();
    const taxRate = num(i.tax, 0) > 1 ? num(i.tax) / 100 : num(i.tax, 0);
    const lines = items.map((it) => ({ ...it, amount: r2(it.quantity * it.unitPrice) }));
    const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0)), tax = r2(subtotal * taxRate), total = r2(subtotal + tax);
    const fmt = (n: number) => new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(n);
    const number = str(i.invoiceNumber, `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`);
    const text = [`INVOICE ${number}`, `Date: ${new Date().toISOString().slice(0, 10)}`, "", ...lines.map((l) => `${l.name} × ${l.quantity} @ ${fmt(l.unitPrice)} = ${fmt(l.amount)}`), "", `Subtotal: ${fmt(subtotal)}`, `Tax (${r2(taxRate * 100)}%): ${fmt(tax)}`, `Total: ${fmt(total)}`, ...(i.notes ? ["", str(i.notes)] : [])].join("\n");
    const html = `<!doctype html><meta charset="utf-8"><title>${number}</title><body style="font-family:sans-serif;max-width:720px;margin:40px auto"><h1>Invoice ${number}</h1><p>Date: ${new Date().toISOString().slice(0, 10)}</p><table style="width:100%;border-collapse:collapse" border="1" cellpadding="6"><tr><th align="left">Item</th><th>Qty</th><th align="right">Unit</th><th align="right">Amount</th></tr>${lines.map((l) => `<tr><td>${l.name}</td><td align="center">${l.quantity}</td><td align="right">${fmt(l.unitPrice)}</td><td align="right">${fmt(l.amount)}</td></tr>`).join("")}<tr><td colspan="3" align="right">Subtotal</td><td align="right">${fmt(subtotal)}</td></tr><tr><td colspan="3" align="right">Tax (${r2(taxRate * 100)}%)</td><td align="right">${fmt(tax)}</td></tr><tr><td colspan="3" align="right"><b>Total</b></td><td align="right"><b>${fmt(total)}</b></td></tr></table>${i.notes ? `<p>${str(i.notes)}</p>` : ""}</body>`;
    return { invoiceNumber: number, currency, lines, subtotal, taxRate, tax, total, text, html };
  },
  "payment.subscription": async (i) => {
    const action = str(i.action, "list").toLowerCase();
    const sp = str(i.provider, "stripe").toLowerCase();
    if (sp === "paddle") {
      const id = encodeURIComponent(str(i.subscriptionId ?? i.priceId));
      if (action === "cancel") { const r = await paddle(`subscriptions/${id}/cancel`, "POST", { effective_from: "next_billing_period" }); return { subscriptionId: r.id, status: r.status, scheduledChange: r.scheduled_change }; }
      if (action === "get" || action === "retrieve") return await paddle(`subscriptions/${id}`);
      if (action === "update") { const r = await paddle(`subscriptions/${id}`, "PATCH", { items: [{ price_id: str(i.priceId), quantity: num(i.quantity, 1) }], proration_billing_mode: "prorated_immediately" }); return { subscriptionId: r.id, status: r.status }; }
      if (action === "create") throw new Error("Paddle subscriptions start from a checkout: use payment.create_checkout with mode=subscription");
      const r = await paddle(`subscriptions?per_page=20${i.customerId ? `&customer_id=${encodeURIComponent(str(i.customerId))}` : ""}`);
      return { subscriptions: (Array.isArray(r) ? r : []).map((x: any) => ({ id: x.id, status: x.status, customer: x.customer_id, nextBilledAt: x.next_billed_at })) };
    }
    if (sp !== "stripe") throw new Error("subscriptions are supported for provider=stripe or paddle");
    if (action === "update") { const id = encodeURIComponent(str(i.subscriptionId)); const cur = await stripe(`subscriptions/${id}`); const r = await stripe(`subscriptions/${id}`, "POST", { "items[0][id]": cur.items?.data?.[0]?.id, "items[0][price]": str(i.priceId) }); return { subscriptionId: r.id, status: r.status }; }
    if (action === "create") { const r = await stripe("subscriptions", "POST", { customer: str(i.customerId), "items[0][price]": str(i.priceId) }); return { subscriptionId: r.id, status: r.status }; }
    if (action === "cancel") { const r = await stripe(`subscriptions/${encodeURIComponent(str(i.subscriptionId ?? i.priceId))}`, "DELETE"); return { subscriptionId: r.id, status: r.status }; }
    if (action === "get" || action === "retrieve") { const r = await stripe(`subscriptions/${encodeURIComponent(str(i.subscriptionId ?? i.priceId))}`); return r; }
    const r = await stripe(`subscriptions?limit=20${i.customerId ? `&customer=${encodeURIComponent(str(i.customerId))}` : ""}`);
    return { subscriptions: (r.data ?? []).map((s: any) => ({ id: s.id, status: s.status, customer: s.customer, currentPeriodEnd: s.current_period_end })) };
  },

  // storage
  "storage.upload": async (i) => {
    const provider = str(i.provider, "local").toLowerCase(), bucket = str(i.bucket), key = str(i.key);
    const bytes = contentBytes(str(i.content));
    if (provider === "local") {
      const fs = nodeModule("node:fs"), path = nodeModule("node:path");
      const p = localStoragePath(bucket, key);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, bytes);
      return { provider, bucket, key, bytes: bytes.length, path: p };
    }
    if (provider === "azure") {
      const res = await fetch(azureUrl(bucket, key), { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob", "content-type": str(i.contentType, "application/octet-stream") }, body: bytes as any });
      if (!res.ok) throw new Error(`Azure upload failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return { provider, bucket, key, bytes: bytes.length, etag: res.headers.get("etag") };
    }
    const s = await s3Sign("PUT", provider, bucket, key, {}, bytes);
    const res = await fetch(s.url, { method: "PUT", headers: { ...(s as any).headers, "content-type": str(i.contentType, "application/octet-stream") }, body: bytes as any });
    if (!res.ok) throw new Error(`upload failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { provider, bucket, key, bytes: bytes.length, etag: res.headers.get("etag") };
  },
  "storage.download": async (i) => {
    const provider = str(i.provider, "local").toLowerCase(), bucket = str(i.bucket), key = str(i.key);
    let buf: Uint8Array, type = "application/octet-stream";
    if (provider === "local") buf = new Uint8Array(nodeModule("node:fs").readFileSync(localStoragePath(bucket, key)));
    else if (provider === "azure") {
      const res = await fetch(azureUrl(bucket, key));
      if (!res.ok) throw new Error(`Azure download failed ${res.status}`);
      buf = new Uint8Array(await res.arrayBuffer()); type = res.headers.get("content-type") ?? type;
    } else {
      const s = await s3Sign("GET", provider, bucket, key, {}, "");
      const res = await fetch(s.url, { headers: (s as any).headers });
      if (!res.ok) throw new Error(`download failed ${res.status}`);
      buf = new Uint8Array(await res.arrayBuffer()); type = res.headers.get("content-type") ?? type;
    }
    const textual = /^(text\/|application\/(json|xml|csv|javascript))/.test(type) || /\.(txt|md|csv|json|xml|html?|js|ts|py|ya?ml)$/i.test(key) || !buf.slice(0, 2000).includes(0);
    const B = (globalThis as any).Buffer;
    return { bucket, key, bytes: buf.length, contentType: type, ...(textual ? { text: new TextDecoder().decode(buf).slice(0, 200000) } : { base64: B ? B.from(buf).toString("base64") : btoa(String.fromCharCode(...buf)) }) };
  },
  "storage.list": async (i) => {
    const provider = str(i.provider, "local").toLowerCase(), bucket = str(i.bucket), prefix = str(i.prefix), max = num(i.maxKeys, 100);
    if (provider === "local") {
      const fs = nodeModule("node:fs"), path = nodeModule("node:path");
      const root = localStoragePath(bucket);
      const out: { key: string; size: number; modified: string }[] = [];
      const walk = (d: string) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { const k = path.relative(root, p).split(path.sep).join("/"); if (k.startsWith(prefix)) { const st = fs.statSync(p); out.push({ key: k, size: st.size, modified: st.mtime.toISOString() }); } } if (out.length >= max) return; } };
      walk(root);
      return { provider, bucket, objects: out.slice(0, max) };
    }
    if (provider === "azure") {
      const res = await fetch(azureUrl(bucket, "", { restype: "container", comp: "list", maxresults: String(max), ...(prefix ? { prefix } : {}) }));
      const xml = await res.text();
      if (!res.ok) throw new Error(`Azure list failed ${res.status}: ${xml.slice(0, 300)}`);
      return { provider, bucket, objects: [...xml.matchAll(/<Blob>([\s\S]*?)<\/Blob>/g)].map((m) => ({ key: /<Name>(.*?)<\/Name>/.exec(m[1])?.[1], size: Number(/<Content-Length>(\d+)<\/Content-Length>/.exec(m[1])?.[1] ?? 0), modified: /<Last-Modified>(.*?)<\/Last-Modified>/.exec(m[1])?.[1] })) };
    }
    const s = await s3Sign("GET", provider, bucket, "", { "list-type": "2", "max-keys": String(max), ...(prefix ? { prefix } : {}) }, "");
    const res = await fetch(s.url, { headers: (s as any).headers });
    const xml = await res.text();
    if (!res.ok) throw new Error(`list failed ${res.status}: ${xml.slice(0, 300)}`);
    const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => ({ key: /<Key>(.*?)<\/Key>/.exec(m[1])?.[1], size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0), modified: /<LastModified>(.*?)<\/LastModified>/.exec(m[1])?.[1] }));
    return { provider, bucket, objects };
  },
  "storage.share": async (i) => {
    const provider = str(i.provider, "local").toLowerCase(), minutes = num(i.expiresInMinutes, 60);
    if (provider === "local") return { provider, url: `file://${localStoragePath(str(i.bucket), str(i.key))}`, note: "local files have no shareable URL; upload to an S3-compatible provider for a public link" };
    if (provider === "azure") return { provider, url: azureUrl(str(i.bucket), str(i.key)), note: "URL carries the configured SAS token; its expiry is the token's expiry" };
    const s = await s3Sign("GET", provider, str(i.bucket), str(i.key), {}, "", Math.min(minutes * 60, 604800));
    return { provider, url: s.url, expiresAt: new Date(Date.now() + minutes * 60000).toISOString() };
  },

  // maps
  "maps.geocode": async (i) => {
    const q = new URLSearchParams({ q: str(i.address), format: "jsonv2", addressdetails: "1", limit: String(num(i.limit, 5)) });
    if (i.countryCode) q.set("countrycodes", str(i.countryCode).toLowerCase());
    const r = await fetchJson(`${NOMINATIM()}/search?${q}`);
    return { results: r.map((x: any) => ({ lat: Number(x.lat), lng: Number(x.lon), displayName: x.display_name, type: x.type, address: x.address })) };
  },
  "maps.reverse-geocode": async (i) => {
    const r = await fetchJson(`${NOMINATIM()}/reverse?format=jsonv2&lat=${num(i.lat)}&lon=${num(i.lng)}&addressdetails=1`);
    return { displayName: r.display_name, address: r.address, lat: num(i.lat), lng: num(i.lng) };
  },
  "maps.route": async (i) => {
    const pts = json<any[]>(i.waypoints).map((p) => ({ lat: num(p.lat ?? p[0]), lng: num(p.lng ?? p.lon ?? p[1]) }));
    if (pts.length < 2) throw new Error("need at least 2 waypoints");
    const prof = PROFILE[str(i.profile, "car")] ?? "driving";
    const r = await fetchJson(`${OSRM()}/route/v1/${prof}/${pts.map((p) => `${p.lng},${p.lat}`).join(";")}?overview=simplified&geometries=geojson&steps=${bool(i.steps, true)}`);
    const route = r.routes?.[0];
    if (!route) throw new Error(`no route: ${r.code}`);
    return {
      distanceKm: r2(route.distance / 1000, 2), durationMin: r2(route.duration / 60, 1),
      legs: route.legs.map((l: any) => ({ distanceKm: r2(l.distance / 1000, 2), durationMin: r2(l.duration / 60, 1), steps: bool(i.steps, true) ? l.steps.map((s: any) => ({ instruction: `${s.maneuver.type}${s.maneuver.modifier ? ` ${s.maneuver.modifier}` : ""}${s.name ? ` onto ${s.name}` : ""}`, distanceM: Math.round(s.distance) })).slice(0, 60) : undefined })),
      geometry: route.geometry.coordinates.map(([lng, lat]: number[]) => ({ lat, lng })).slice(0, 500),
    };
  },
  "maps.isochrone": async (i) => {
    const center = { lat: num(i.lat), lng: num(i.lng) };
    const ranges = json<unknown[]>(i.ranges).map((x) => num(x)).sort((a, b) => a - b);
    const prof = PROFILE[str(i.profile, "car")] ?? "driving";
    const speed = { driving: 600, cycling: 250, walking: 80 }[prof] ?? 600; // metres per minute (rough upper bound)
    const bearings = Array.from({ length: 12 }, (_, k) => k * 30);
    const maxR = ranges[ranges.length - 1] * speed;
    const fracs = [0.15, 0.3, 0.5, 0.7, 0.85, 1.0, 1.2];
    const samples = bearings.flatMap((b) => fracs.map((f) => ({ b, d: maxR * f, p: destination(center, b, maxR * f) })));
    try {
      const coords = [center, ...samples.map((s) => s.p)].map((p) => `${p.lng},${p.lat}`).join(";");
      const r = await fetchJson(`${OSRM()}/table/v1/${prof}/${coords}?sources=0&annotations=duration`);
      const dur: (number | null)[] = r.durations[0].slice(1);
      return {
        center, profile: prof, method: "osrm-sampled",
        polygons: ranges.map((min) => ({
          rangeMinutes: min,
          polygon: bearings.map((b) => {
            const reach = samples.map((s, k) => ({ ...s, t: dur[k] })).filter((s) => s.b === b && s.t !== null && (s.t as number) <= min * 60);
            const best = reach.sort((a, z) => z.d - a.d)[0];
            return best ? best.p : destination(center, b, Math.min(200, maxR * 0.05));
          }),
        })),
      };
    } catch (e: any) {
      return { center, profile: prof, method: "approximate-circle", warning: `routing service unavailable (${e.message}); polygons are speed-based circles`, polygons: ranges.map((min) => ({ rangeMinutes: min, polygon: bearings.map((b) => destination(center, b, min * speed * 0.6)) })) };
    }
  },
  "maps.geofence": (i) => {
    const action = str(i.action, "list").toLowerCase();
    if (action === "create") {
      const f = json<any>(i.fence);
      const fence = createGeofence({ id: f.id ?? uid("FENCE"), name: str(f.name, "fence"), type: f.polygon ? "polygon" : "circle", center: f.center ?? (f.lat !== undefined ? { lat: num(f.lat), lng: num(f.lng) } : undefined), radius: f.radius ? num(f.radius) : undefined, polygon: f.polygon });
      return { created: fence };
    }
    if (action === "check") {
      const p = json<any>(i.point);
      const point = { lat: num(p.lat), lng: num(p.lng ?? p.lon) };
      const inside = checkGeofence(point);
      return { point, inside: inside.map((f) => f.name), fences: listGeofences().map((f) => ({ id: f.id, name: f.name, inside: inside.includes(f), distanceM: f.center ? Math.round(haversineDistance(point, f.center)) : undefined })) };
    }
    if (action === "delete") return { deleted: deleteGeofence(str(json<any>(i.fence, {}).id ?? i.id)) };
    return { fences: listGeofences() };
  },

  // collaboration
  "collab.session.create": (i) => createSession(str(i.name), str(i.ownerId), { maxUsers: i.maxUsers ? num(i.maxUsers) : undefined }),
  "collab.session.join": (i) => {
    const s = joinSession(str(i.sessionId), str(i.userId), str(i.name));
    if (!s) throw new Error("session not found or full");
    return { session: s, users: getSessionUsers(str(i.sessionId)), channels: getSessionChannels(str(i.sessionId)) };
  },
  "collab.ot.transform": (i) => {
    const ops = json<any[]>(i.operations).map((o, k) => ({ type: o.type ?? "insert", position: num(o.position, 0), content: o.content, length: o.length !== undefined ? num(o.length) : undefined, timestamp: num(o.timestamp, k), userId: str(o.userId, `u${k}`), version: num(o.version, k) })) as OTOperation[];
    const strategy = str(i.strategy, "ot");
    const ordered = [...ops].sort((a, b) => a.timestamp - b.timestamp);
    if (strategy === "last-write-wins") { const last = ordered[ordered.length - 1]; return { strategy, document: applyOperations(str(i.document), last ? [last] : []), applied: last ? 1 : 0 }; }
    // transform each op against all earlier concurrent ops, then apply in order
    const transformed: OTOperation[] = [];
    for (const op of ordered) { let t = op; for (const prev of transformed) t = transformOperation(t, prev); transformed.push(t); }
    return { strategy: "ot", document: applyOperations(str(i.document), transformed), operations: transformed };
  },
  "collab.channel.create": (i) => createChannel(str(i.sessionId), str(i.name), (str(i.type, "public") as any)),

  // hardware
  "hardware.clipboard": async (i) => {
    const action = str(i.action, "read").toLowerCase();
    if (isBrowser()) return action === "write" ? (await hw.clipboardWriteText(str(i.text)), { written: str(i.text).length }) : { text: await hw.clipboardReadText() };
    return clipboardNode(action, str(i.text));
  },
  "hardware.speech": async (i) => speakLocal(str(i.text), { lang: i.lang ? str(i.lang) : undefined, rate: i.rate ? num(i.rate) : undefined }),
  "hardware.gps": async (i) => {
    if (isBrowser()) return new Promise((res, rej) => hw.getCurrentLocation ? (hw.getCurrentLocation as any)((p: any) => res(p), (e: any) => rej(e), { enableHighAccuracy: bool(i.highAccuracy), timeout: num(i.timeout, 10000) }) : rej(new Error("geolocation unavailable")));
    const os = platform();
    if (os === "darwin" && which("CoreLocationCLI")) { const r = await execFile("CoreLocationCLI", ["-format", "%latitude,%longitude,%h_accuracy"]); const [lat, lng, acc] = r.stdout.trim().split(","); if (lat) return { lat: Number(lat), lng: Number(lng), accuracyM: Number(acc), source: "CoreLocation" }; }
    // Desktop/servers rarely have GPS: approximate from the public IP, clearly labelled
    const r = await fetchJson("https://ipapi.co/json/");
    return { lat: r.latitude, lng: r.longitude, city: r.city, region: r.region, country: r.country_name, accuracyM: 25000, source: "ip-geolocation (approximate; no GPS hardware on this machine)" };
  },
  "hardware.camera": async (i) => {
    const w = num(i.width, 1280), h = num(i.height, 720);
    if (isBrowser()) return hw.capturePhoto({ facingMode: (str(i.facingMode, "user") as any), width: w, height: h, quality: num(i.quality, 0.85) } as any);
    if (!which("ffmpeg")) throw new Error("camera capture on desktop needs ffmpeg on PATH");
    const os = platform(), path = nodeModule("node:path"), osm = nodeModule("node:os"), fs = nodeModule("node:fs");
    const out = path.join(osm.tmpdir(), `stitap-cam-${Date.now()}.jpg`);
    const input = os === "darwin" ? ["-f", "avfoundation", "-framerate", "30", "-i", secret("CAMERA_DEVICE") ?? "0"] : os === "win32" ? ["-f", "dshow", "-i", `video=${needSecret("camera device name", "CAMERA_DEVICE")}`] : ["-f", "v4l2", "-i", secret("CAMERA_DEVICE") ?? "/dev/video0"];
    const r = await execFile("ffmpeg", ["-y", "-loglevel", "error", ...input, "-frames:v", "1", "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease`, "-q:v", String(Math.round(2 + (1 - num(i.quality, 0.85)) * 29)), out], { timeout: 20000 });
    if (r.code || !fs.existsSync(out)) throw new Error(`camera capture failed: ${r.stderr.trim().slice(0, 300) || "no frame"}`);
    const data = fs.readFileSync(out);
    return { path: out, bytes: data.length, dataUrl: `data:image/jpeg;base64,${data.toString("base64")}` };
  },
  "hardware.motion": async (i) => {
    if (isBrowser()) return new Promise((res) => { const samples: any[] = []; const stop = (hw.watchMotion as any)((m: any) => samples.push(m)); setTimeout(() => { stop?.(); res({ samples: samples.length, data: samples.slice(-50) }); }, num(i.duration, 2000)); });
    const os = platform();
    if (os === "linux") {
      const fs = nodeModule("node:fs");
      const dev = fs.existsSync("/sys/bus/iio/devices") ? fs.readdirSync("/sys/bus/iio/devices").find((d: string) => fs.existsSync(`/sys/bus/iio/devices/${d}/in_accel_x_raw`)) : null;
      if (dev) { const rd = (ax: string) => Number(fs.readFileSync(`/sys/bus/iio/devices/${dev}/in_accel_${ax}_raw`, "utf8")); return { source: "iio accelerometer", x: rd("x"), y: rd("y"), z: rd("z") }; }
    }
    throw new Error("no motion sensor is available on this machine (accelerometers are exposed only on phones/tablets or Linux IIO devices)");
  },

  // OS
  "os.system-info": () => {
    if (!isNode()) return { platform: "browser", userAgent: (globalThis as any).navigator?.userAgent, cores: (globalThis as any).navigator?.hardwareConcurrency, memoryGB: (globalThis as any).navigator?.deviceMemory };
    const os = nodeModule("node:os");
    return { platform: os.platform(), release: os.release(), arch: os.arch(), hostname: os.hostname(), cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, memoryGB: r2(os.totalmem() / 2 ** 30), freeMemoryGB: r2(os.freemem() / 2 ** 30), uptimeHours: r2(os.uptime() / 3600), user: os.userInfo().username, node: (process as any).versions.node, loadAvg: os.loadavg() };
  },
  "os.file.read": (i) => {
    const fs = nodeModule("node:fs"); const p = osFsPath(i.path);
    const st = fs.statSync(p);
    if (st.size > 10 * 2 ** 20) throw new Error(`file is ${(st.size / 2 ** 20).toFixed(1)} MB — too large`);
    const buf = fs.readFileSync(p);
    return { path: p, size: st.size, content: buf.includes(0) ? `(binary, ${st.size} bytes)` : buf.toString("utf8") };
  },
  "os.file.write": (i) => {
    const fs = nodeModule("node:fs"), path = nodeModule("node:path"); const p = osFsPath(i.path);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, str(i.content));
    return { path: p, bytes: str(i.content).length };
  },
  "os.file.list": (i) => {
    const fs = nodeModule("node:fs"), path = nodeModule("node:path"); const root = osFsPath(i.path);
    const out: { path: string; type: string; size?: number }[] = [];
    const walk = (d: string, depth: number) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (out.length >= 2000) return;
        const p = path.join(d, e.name);
        out.push({ path: path.relative(root, p) || e.name, type: e.isDirectory() ? "dir" : "file", size: e.isFile() ? fs.statSync(p).size : undefined });
        if (e.isDirectory() && bool(i.recursive) && depth < 8 && !["node_modules", ".git"].includes(e.name)) walk(p, depth + 1);
      }
    };
    walk(root, 0);
    return { root, entries: out, truncated: out.length >= 2000 };
  },
  "os.file.watch": async (i) => {
    const fs = nodeModule("node:fs"); const p = osFsPath(i.path);
    const ms = Math.min(num(i.duration, 5000), 120000);
    const events: { type: string; file: string; at: string }[] = [];
    const w = fs.watch(p, { recursive: bool(i.recursive) && platform() !== "linux" ? true : false }, (type: string, file: string) => events.push({ type, file: String(file), at: new Date().toISOString() }));
    await new Promise((r) => setTimeout(r, ms));
    w.close();
    return { path: p, watchedMs: ms, events };
  },
  "os.process.list": async () => {
    if (platform() === "win32") {
      const r = await execFile("tasklist", ["/FO", "CSV", "/NH"]);
      return { processes: r.stdout.trim().split(/\r?\n/).slice(0, 300).map((l) => { const c = l.split('","').map((x) => x.replace(/"/g, "")); return { name: c[0], pid: Number(c[1]), memory: c[4] }; }) };
    }
    const r = await execFile("ps", ["-axo", "pid,pcpu,pmem,comm"]);
    return { processes: r.stdout.trim().split("\n").slice(1).map((l) => { const [pid, cpu, mem, ...cmd] = l.trim().split(/\s+/); return { pid: Number(pid), cpu: Number(cpu), mem: Number(mem), command: cmd.join(" ") }; }).sort((a, b) => b.cpu - a.cpu).slice(0, 300) };
  },
  "os.execute": async (i) => {
    const os = platform();
    const shell = os === "win32" ? ["powershell", ["-NoProfile", "-NonInteractive", "-Command", str(i.command)]] as const : [nodeModule("node:fs")?.existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh", ["-c", str(i.command)]] as const;
    const r = await execFile(shell[0], [...shell[1]], { cwd: i.cwd ? osFsPath(i.cwd) : undefined, timeout: num(i.timeout, 60000) });
    return { exitCode: r.code, stdout: r.stdout.slice(-50000), stderr: r.stderr.slice(-20000) };
  },
  "os.notify": async (i) => {
    const title = str(i.title), body = str(i.body);
    if (isBrowser()) { await hw.sendNotification({ title, body }); return { shown: true, via: "web-notifications" }; }
    const os = platform();
    if (os === "darwin") { const r = await execFile("osascript", ["-e", `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`]); if (!r.code) return { shown: true, via: "osascript" }; }
    else if (os === "win32") {
      const ps = `[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]; $t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $x = $t.GetElementsByTagName('text'); $x.Item(0).AppendChild($t.CreateTextNode(${JSON.stringify(title)})) > $null; $x.Item(1).AppendChild($t.CreateTextNode(${JSON.stringify(body)})) > $null; [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('stitaP').Show([Windows.UI.Notifications.ToastNotification]::new($t))`;
      const r = await execFile("powershell", ["-NoProfile", "-Command", ps]); if (!r.code) return { shown: true, via: "windows-toast" };
    } else if (which("notify-send")) { const r = await execFile("notify-send", [title, body]); if (!r.code) return { shown: true, via: "notify-send" }; }
    throw new Error("no desktop notification service available (headless machine?)");
  },
  "os.tray": async (i) => {
    if (isBrowser() && (globalThis as any).__TAURI__) return { created: true, via: "tauri" };
    // No tray API outside a desktop shell: surface the same information as a notification
    const shown = await INTEGRATION_EXECUTORS["os.notify"]({ title: str(i.title), body: list(i.menu).join(" · ") });
    return { created: false, fallback: "notification", notification: shown, note: "system tray icons need the desktop app (Tauri); a notification was shown instead" };
  },
  "os.power": async (i) => {
    const action = str(i.action).replace(/[-_\s]/g, "").toLowerCase(), os = platform();
    if (isBrowser()) {
      const nav = navigator as any;
      if (action === "getsource" || action === "status") { const b = await nav.getBattery?.(); return b ? { source: b.charging ? "ac" : "battery", level: Math.round(b.level * 100), charging: b.charging } : { source: "unknown" }; }
      if (action === "preventsleep") { (globalThis as any).__stitapWake = await nav.wakeLock?.request("screen"); return { preventing: !!(globalThis as any).__stitapWake, via: "screen wake lock" }; }
      if (action === "allowsleep") { await (globalThis as any).__stitapWake?.release?.(); return { preventing: false }; }
    }
    if (action === "getsource" || action === "status" || action === "battery") {
      if (os === "darwin") { const r = await execFile("pmset", ["-g", "batt"]); const pct = /(\d+)%/.exec(r.stdout)?.[1]; return { source: /AC Power/.test(r.stdout) ? "ac" : /Battery Power/.test(r.stdout) ? "battery" : "unknown", level: pct ? Number(pct) : undefined, charging: /charging;/.test(r.stdout) && !/discharging/.test(r.stdout), raw: r.stdout.trim() }; }
      if (os === "win32") { const r = await execFile("powershell", ["-NoProfile", "-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SystemInformation]::PowerStatus | Select-Object PowerLineStatus,BatteryLifePercent,BatteryChargeStatus | ConvertTo-Json"]); const j = json<any>(r.stdout || "{}", {}); return { source: j.PowerLineStatus === 1 || j.PowerLineStatus === "Online" ? "ac" : j.PowerLineStatus === 0 || j.PowerLineStatus === "Offline" ? "battery" : "unknown", level: j.BatteryLifePercent != null ? Math.round(j.BatteryLifePercent * 100) : undefined, raw: j }; }
      const fs = nodeModule("node:fs"), base = "/sys/class/power_supply";
      const supplies = fs.existsSync(base) ? fs.readdirSync(base) : [];
      const read = (d: string, f: string) => { try { return fs.readFileSync(`${base}/${d}/${f}`, "utf8").trim(); } catch { return undefined; } };
      const ac = supplies.find((d: string) => read(d, "type") === "Mains"), bat = supplies.find((d: string) => read(d, "type") === "Battery");
      if (!ac && !bat) return { source: "ac", level: undefined, note: "no battery detected (desktop or server)" };
      return { source: ac && read(ac, "online") === "1" ? "ac" : bat ? "battery" : "unknown", level: bat ? Number(read(bat, "capacity")) : undefined, charging: bat ? read(bat, "status") === "Charging" : undefined };
    }
    if (action === "preventsleep") {
      const st = globalThis as any;
      if (st.__stitapCaffeinate && !st.__stitapCaffeinate.killed) return { preventing: true, pid: st.__stitapCaffeinate.pid, note: "already active" };
      const cp = nodeModule("node:child_process");
      if (!cp) throw new Error("needs the agent runtime");
      const minutes = num(i.minutes ?? i.durationMinutes, 0);
      const spec: [string, string[]] | null = os === "darwin" ? ["caffeinate", ["-dimsu", ...(minutes ? ["-t", String(minutes * 60)] : [])]]
        : os === "win32" ? ["powershell", ["-NoProfile", "-Command", `$s='[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'; $t=Add-Type -MemberDefinition $s -Name P -Namespace W -PassThru; $t::SetThreadExecutionState(0x80000003) | Out-Null; Start-Sleep -Seconds ${minutes ? minutes * 60 : 31536000}`]]
        : which("systemd-inhibit") ? ["systemd-inhibit", ["--what=sleep:idle", "--who=stitaP", "--why=agent task running", "sleep", minutes ? String(minutes * 60) : "infinity"]] : null;
      if (!spec) throw new Error("no sleep inhibitor available (needs caffeinate, systemd-inhibit or PowerShell)");
      const child = cp.spawn(spec[0], spec[1], { stdio: "ignore", windowsHide: true });
      child.unref();
      st.__stitapCaffeinate = child;
      return { preventing: true, via: spec[0], pid: child.pid, until: minutes ? new Date(Date.now() + minutes * 60000).toISOString() : "allowSleep or agent exit" };
    }
    if (action === "allowsleep") {
      const c = (globalThis as any).__stitapCaffeinate;
      if (c && !c.killed) { c.kill(); (globalThis as any).__stitapCaffeinate = undefined; return { preventing: false, stopped: c.pid }; }
      return { preventing: false, note: "sleep was not being prevented by this agent" };
    }
    const cmds: Record<string, Record<string, [string, string[]]>> = {
      darwin: { sleep: ["pmset", ["sleepnow"]], lock: ["pmset", ["displaysleepnow"]] },
      win32: { sleep: ["rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]], lock: ["rundll32.exe", ["user32.dll,LockWorkStation"]] },
      linux: { sleep: ["systemctl", ["suspend"]], lock: ["loginctl", ["lock-session"]] },
    };
    const c = cmds[os]?.[action];
    if (!c) throw new Error(`unsupported power action "${str(i.action)}" (getSource, preventSleep, allowSleep, sleep, lock)`);
    const r = await execFile(c[0], c[1]);
    if (r.code) throw new Error(r.stderr.trim() || `${c[0]} exited ${r.code}`);
    return { action, platform: os, done: true };
  },
});

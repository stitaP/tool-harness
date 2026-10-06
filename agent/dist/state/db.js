/**
 * Persistent state: sessions, messages (+ full-text search), key/value meta,
 * usage, and generic records (cron jobs, kanban cards, pairing codes).
 *
 * Primary backend: node:sqlite (Node 22.13+, built in, FTS5 included).
 * Fallback backend: a JSON file — for Node 18/20 hosts — same API, slower search.
 * The SQLite schema is shared with the pure-Python lite core (python/stitap/lite).
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { newId } from "../util/misc.js";
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'cli',
  parent_id TEXT, cwd TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', system_prompt TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
  tool_calls TEXT, tool_call_id TEXT, name TEXT, archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content='messages', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, coalesce(new.content, ''));
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, coalesce(old.content, ''));
END;
CREATE TABLE IF NOT EXISTS state_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER,
  kind TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(kind, id));
`;
function rowToSession(r) {
    return { ...r, meta: r.meta ? JSON.parse(r.meta) : {} };
}
function rowToMsg(r) {
    return {
        id: r.id, role: r.role, content: r.content,
        tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
        tool_call_id: r.tool_call_id ?? undefined, name: r.name ?? undefined,
        created_at: r.created_at, meta: r.meta ? JSON.parse(r.meta) : undefined,
    };
}
/** Build an FTS5 query from free text: words AND-ed, each a prefix match. */
export function ftsQuery(q) {
    const words = q.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
    return words.slice(0, 12).map((w) => `"${w}"*`).join(" ");
}
class SqliteDB {
    backend = "sqlite";
    db;
    constructor(path, DatabaseSync) {
        this.db = new DatabaseSync(path);
        this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=OFF;");
        this.db.exec(SCHEMA);
        if (!this.all(`PRAGMA table_info(usage)`).some((c) => c.name === "cached_tokens"))
            this.db.exec(`ALTER TABLE usage ADD COLUMN cached_tokens INTEGER`);
        this.setMetaIfMissing("schema_version", 1);
    }
    setMetaIfMissing(k, v) { if (this.getMeta(k) === null)
        this.setMeta(k, v); }
    run(sql, ...p) { return this.db.prepare(sql).run(...p); }
    all(sql, ...p) { return this.db.prepare(sql).all(...p); }
    one(sql, ...p) { return this.db.prepare(sql).get(...p); }
    createSession(p) {
        const now = Date.now();
        const s = {
            id: p.id ?? newId("s_"), title: p.title ?? "", source: p.source, parent_id: p.parent_id ?? null,
            cwd: p.cwd ?? process.cwd(), model: p.model ?? "", system_prompt: p.system_prompt ?? null,
            created_at: now, updated_at: now, meta: p.meta ?? {},
        };
        this.run(`INSERT INTO sessions (id,title,source,parent_id,cwd,model,system_prompt,created_at,updated_at,meta) VALUES (?,?,?,?,?,?,?,?,?,?)`, s.id, s.title, s.source, s.parent_id, s.cwd, s.model, s.system_prompt, s.created_at, s.updated_at, JSON.stringify(s.meta));
        return s;
    }
    getSession(id) { const r = this.one(`SELECT * FROM sessions WHERE id=?`, id); return r ? rowToSession(r) : null; }
    listSessions(o = {}) {
        const where = [], p = [];
        where.push(o.archived ? "json_extract(meta,'$.archived')=1" : "coalesce(json_extract(meta,'$.archived'),0)=0");
        if (o.source) {
            where.push("source=?");
            p.push(o.source);
        }
        if (!o.includeChildren)
            where.push("source != 'subagent'");
        const sql = `SELECT * FROM sessions ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC LIMIT ?`;
        return this.all(sql, ...p, o.limit ?? 50).map(rowToSession);
    }
    updateSession(id, patch) {
        const cur = this.getSession(id);
        if (!cur)
            return;
        const n = { ...cur, ...patch, updated_at: Date.now() };
        this.run(`UPDATE sessions SET title=?,source=?,parent_id=?,cwd=?,model=?,system_prompt=?,updated_at=?,meta=? WHERE id=?`, n.title, n.source, n.parent_id, n.cwd, n.model, n.system_prompt, n.updated_at, JSON.stringify(n.meta ?? {}), id);
    }
    sessionTree(id) {
        return this.all(`WITH RECURSIVE t(id) AS (SELECT ? UNION SELECT s.id FROM sessions s JOIN t ON s.parent_id=t.id) SELECT id FROM t`, id).map((r) => r.id);
    }
    deleteSession(id) {
        this.run(`DELETE FROM messages WHERE session_id=?`, id);
        this.run(`DELETE FROM sessions WHERE id=?`, id);
    }
    addMessage(sessionId, m) {
        const r = this.run(`INSERT INTO messages (session_id,role,content,tool_calls,tool_call_id,name,created_at,meta) VALUES (?,?,?,?,?,?,?,?)`, sessionId, m.role, m.content ?? null, m.tool_calls?.length ? JSON.stringify(m.tool_calls) : null, m.tool_call_id ?? null, m.name ?? null, m.created_at ?? Date.now(), m.meta ? JSON.stringify(m.meta) : null);
        this.run(`UPDATE sessions SET updated_at=? WHERE id=?`, Date.now(), sessionId);
        return Number(r.lastInsertRowid);
    }
    getMessages(sessionId, o = {}) {
        return this.all(`SELECT * FROM messages WHERE session_id=? ${o.includeArchived ? "" : "AND archived=0"} ORDER BY id`, sessionId).map(rowToMsg);
    }
    archiveMessages(ids) {
        for (const id of ids)
            this.run(`UPDATE messages SET archived=1 WHERE id=?`, id);
    }
    search(query, limit = 10) {
        const q = ftsQuery(query);
        if (!q)
            return [];
        return this.all(`SELECT m.session_id, m.id AS message_id, m.role, snippet(messages_fts, 0, '«', '»', '…', 24) AS snippet,
              m.created_at, s.title FROM messages_fts f JOIN messages m ON m.id=f.rowid
              LEFT JOIN sessions s ON s.id=m.session_id
       WHERE messages_fts MATCH ? AND m.role IN ('user','assistant') ORDER BY rank LIMIT ?`, q, limit);
    }
    getMeta(key) {
        const r = this.one(`SELECT value FROM state_meta WHERE key=?`, key);
        return r ? JSON.parse(r.value) : null;
    }
    setMeta(key, value) {
        this.run(`INSERT INTO state_meta (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`, key, JSON.stringify(value), Date.now());
    }
    deleteMeta(key) { this.run(`DELETE FROM state_meta WHERE key=?`, key); }
    listMeta(prefix) {
        return this.all(`SELECT key, value FROM state_meta WHERE key LIKE ? ORDER BY key`, prefix.replace(/[%_]/g, "\\$&") + "%")
            .map((r) => ({ key: r.key, value: JSON.parse(r.value) }));
    }
    addUsage(u) {
        this.run(`INSERT INTO usage (session_id,model,input_tokens,output_tokens,cached_tokens,kind,created_at) VALUES (?,?,?,?,?,?,?)`, u.session_id, u.model, u.input_tokens, u.output_tokens, u.cached_tokens ?? null, u.kind, Date.now());
    }
    usageSince(since, sessionId) {
        return sessionId
            ? this.all(`SELECT * FROM usage WHERE created_at>=? AND session_id=?`, since, sessionId)
            : this.all(`SELECT * FROM usage WHERE created_at>=?`, since);
    }
    putRecord(kind, id, data) {
        this.run(`INSERT INTO records (kind,id,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`, kind, id, JSON.stringify(data), Date.now());
    }
    getRecord(kind, id) {
        const r = this.one(`SELECT data FROM records WHERE kind=? AND id=?`, kind, id);
        return r ? JSON.parse(r.data) : null;
    }
    listRecords(kind) { return this.all(`SELECT data FROM records WHERE kind=? ORDER BY updated_at`, kind).map((r) => JSON.parse(r.data)); }
    deleteRecord(kind, id) { this.run(`DELETE FROM records WHERE kind=? AND id=?`, kind, id); }
    close() { try {
        this.db.close();
    }
    catch { /* ignore */ } }
}
/** JSON-file fallback for hosts without node:sqlite. */
class JsonDB {
    path;
    backend = "json";
    d;
    timer = null;
    constructor(path) {
        this.path = path;
        this.d = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { sessions: [], messages: [], meta: {}, usage: [], records: {}, seq: 0 };
        process.on("exit", () => this.flush());
    }
    save() { if (!this.timer)
        this.timer = setTimeout(() => this.flush(), 150); }
    flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        writeFileSync(this.path + ".tmp", JSON.stringify(this.d));
        renameSync(this.path + ".tmp", this.path);
    }
    createSession(p) {
        const now = Date.now();
        const s = { id: p.id ?? newId("s_"), title: p.title ?? "", source: p.source, parent_id: p.parent_id ?? null, cwd: p.cwd ?? process.cwd(), model: p.model ?? "", system_prompt: p.system_prompt ?? null, created_at: now, updated_at: now, meta: p.meta ?? {} };
        this.d.sessions.push(s);
        this.save();
        return { ...s };
    }
    getSession(id) { const s = this.d.sessions.find((x) => x.id === id); return s ? { ...s } : null; }
    sessionTree(id) {
        const out = [id];
        for (let i = 0; i < out.length; i++)
            for (const s of this.d.sessions)
                if (s.parent_id === out[i] && !out.includes(s.id))
                    out.push(s.id);
        return out;
    }
    listSessions(o = {}) {
        return this.d.sessions.filter((s) => !!s.meta?.archived === !!o.archived && (!o.source || s.source === o.source) && (o.includeChildren || s.source !== "subagent"))
            .sort((a, b) => b.updated_at - a.updated_at).slice(0, o.limit ?? 50).map((s) => ({ ...s }));
    }
    updateSession(id, patch) {
        const i = this.d.sessions.findIndex((x) => x.id === id);
        if (i >= 0) {
            this.d.sessions[i] = { ...this.d.sessions[i], ...patch, updated_at: Date.now() };
            this.save();
        }
    }
    deleteSession(id) {
        this.d.sessions = this.d.sessions.filter((s) => s.id !== id);
        this.d.messages = this.d.messages.filter((m) => m.session_id !== id);
        this.save();
    }
    addMessage(sessionId, m) {
        const id = ++this.d.seq;
        this.d.messages.push({ ...m, id, session_id: sessionId, created_at: m.created_at ?? Date.now(), archived: 0 });
        const s = this.d.sessions.find((x) => x.id === sessionId);
        if (s)
            s.updated_at = Date.now();
        this.save();
        return id;
    }
    getMessages(sessionId, o = {}) {
        return this.d.messages.filter((m) => m.session_id === sessionId && (o.includeArchived || !m.archived))
            .map(({ session_id: _s, archived: _a, ...m }) => ({ ...m }));
    }
    archiveMessages(ids) { const set = new Set(ids); for (const m of this.d.messages)
        if (set.has(m.id))
            m.archived = 1; this.save(); }
    search(query, limit = 10) {
        const words = query.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
        if (!words.length)
            return [];
        const hits = [];
        for (const m of this.d.messages) {
            if (m.role !== "user" && m.role !== "assistant")
                continue;
            const c = (m.content ?? "").toLowerCase();
            if (!words.every((w) => c.includes(w)))
                continue;
            const i = c.indexOf(words[0]);
            const s = this.d.sessions.find((x) => x.id === m.session_id);
            hits.push({ session_id: m.session_id, message_id: m.id, role: m.role, snippet: (m.content ?? "").slice(Math.max(0, i - 80), i + 160), created_at: m.created_at, title: s?.title ?? "", score: m.created_at });
        }
        return hits.sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _s, ...h }) => h);
    }
    getMeta(key) { return key in this.d.meta ? structuredClone(this.d.meta[key]) : null; }
    setMeta(key, value) { this.d.meta[key] = structuredClone(value); this.save(); }
    deleteMeta(key) { delete this.d.meta[key]; this.save(); }
    listMeta(prefix) { return Object.keys(this.d.meta).filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key, value: structuredClone(this.d.meta[key]) })); }
    addUsage(u) { this.d.usage.push({ ...u, created_at: Date.now() }); this.save(); }
    usageSince(since, sessionId) { return this.d.usage.filter((u) => u.created_at >= since && (!sessionId || u.session_id === sessionId)); }
    putRecord(kind, id, data) { (this.d.records[kind] ??= {})[id] = structuredClone(data); this.save(); }
    getRecord(kind, id) { const r = this.d.records[kind]?.[id]; return r ? structuredClone(r) : null; }
    listRecords(kind) { return Object.values(this.d.records[kind] ?? {}).map((r) => structuredClone(r)); }
    deleteRecord(kind, id) { if (this.d.records[kind])
        delete this.d.records[kind][id]; this.save(); }
    close() { this.flush(); }
}
export function openState(home, opts = {}) {
    if (!opts.forceJson) {
        try {
            const req = createRequire(import.meta.url);
            const { DatabaseSync } = req("node:sqlite");
            return new SqliteDB(join(home, "state.db"), DatabaseSync);
        }
        catch { /* fall back */ }
    }
    return new JsonDB(join(home, "state.json"));
}

"""SQLite state — the SAME schema as the Node core (agent/src/state/db.ts), so both share ~/.stitap/state.db."""
import json
import os
import re
import secrets
import sqlite3
import threading
import time

SCHEMA = """
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
CREATE TABLE IF NOT EXISTS state_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER,
  kind TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(kind, id));
"""

FTS = """
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content='messages', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, coalesce(new.content, ''));
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, coalesce(old.content, ''));
END;
"""


def now_ms():
    return int(time.time() * 1000)


def new_id(prefix=""):
    return prefix + format(now_ms(), "x") + secrets.token_hex(5)


class State:
    def __init__(self, home):
        self.lock = threading.RLock()
        self.db = sqlite3.connect(os.path.join(home, "state.db"), check_same_thread=False, timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)
        try:
            self.db.executescript(FTS)
            self.fts = True
        except sqlite3.OperationalError:
            self.fts = False
        self.db.commit()

    def _x(self, sql, *p):
        with self.lock:
            cur = self.db.execute(sql, p)
            self.db.commit()
            return cur

    def _all(self, sql, *p):
        with self.lock:
            return [dict(r) for r in self.db.execute(sql, p).fetchall()]

    # sessions
    def create_session(self, source, title="", cwd=None, parent_id=None, meta=None):
        t = now_ms()
        s = {"id": new_id("s_"), "title": title, "source": source, "parent_id": parent_id, "cwd": cwd or os.getcwd(),
             "model": "", "system_prompt": None, "created_at": t, "updated_at": t, "meta": meta or {}}
        self._x("INSERT INTO sessions (id,title,source,parent_id,cwd,model,system_prompt,created_at,updated_at,meta) VALUES (?,?,?,?,?,?,?,?,?,?)",
                s["id"], title, source, parent_id, s["cwd"], "", None, t, t, json.dumps(s["meta"]))
        return s

    def get_session(self, sid):
        r = self._all("SELECT * FROM sessions WHERE id=?", sid)
        if not r:
            return None
        r[0]["meta"] = json.loads(r[0]["meta"] or "{}")
        return r[0]

    def list_sessions(self, limit=50):
        out = self._all("SELECT * FROM sessions WHERE source != 'subagent' ORDER BY updated_at DESC LIMIT ?", limit)
        for r in out:
            r["meta"] = json.loads(r["meta"] or "{}")
        return out

    def update_session(self, sid, **patch):
        s = self.get_session(sid)
        if not s:
            return
        s.update(patch)
        self._x("UPDATE sessions SET title=?,cwd=?,model=?,system_prompt=?,updated_at=?,meta=? WHERE id=?",
                s["title"], s["cwd"], s["model"], s["system_prompt"], now_ms(), json.dumps(s["meta"]), sid)

    def delete_session(self, sid):
        self._x("DELETE FROM messages WHERE session_id=?", sid)
        self._x("DELETE FROM sessions WHERE id=?", sid)

    # messages
    def add_message(self, sid, role, content, tool_calls=None, tool_call_id=None, name=None, meta=None):
        cur = self._x("INSERT INTO messages (session_id,role,content,tool_calls,tool_call_id,name,created_at,meta) VALUES (?,?,?,?,?,?,?,?)",
                      sid, role, content, json.dumps(tool_calls) if tool_calls else None, tool_call_id, name, now_ms(),
                      json.dumps(meta) if meta else None)
        self._x("UPDATE sessions SET updated_at=? WHERE id=?", now_ms(), sid)
        return cur.lastrowid

    def messages(self, sid, include_archived=False):
        rows = self._all("SELECT * FROM messages WHERE session_id=? %s ORDER BY id" % ("" if include_archived else "AND archived=0"), sid)
        out = []
        for r in rows:
            m = {"id": r["id"], "role": r["role"], "content": r["content"]}
            if r["tool_calls"]:
                m["tool_calls"] = json.loads(r["tool_calls"])
            if r["tool_call_id"]:
                m["tool_call_id"] = r["tool_call_id"]
            if r["name"]:
                m["name"] = r["name"]
            if r["meta"]:
                m["meta"] = json.loads(r["meta"])
            out.append(m)
        return out

    def archive(self, ids):
        for i in ids:
            self._x("UPDATE messages SET archived=1 WHERE id=?", i)

    def search(self, query, limit=10):
        words = re.findall(r"\w+", query.lower())[:12]
        if not words:
            return []
        if self.fts:
            q = " ".join('"%s"*' % w for w in words)
            return self._all("""SELECT m.session_id, m.id AS message_id, m.role, snippet(messages_fts, 0, '«', '»', '…', 24) AS snippet,
                m.created_at, s.title FROM messages_fts f JOIN messages m ON m.id=f.rowid LEFT JOIN sessions s ON s.id=m.session_id
                WHERE messages_fts MATCH ? AND m.role IN ('user','assistant') ORDER BY rank LIMIT ?""", q, limit)
        cond = " AND ".join("lower(m.content) LIKE ?" for _ in words)
        return self._all("SELECT m.session_id, m.id AS message_id, m.role, substr(m.content,1,240) AS snippet, m.created_at, s.title FROM messages m LEFT JOIN sessions s ON s.id=m.session_id WHERE m.role IN ('user','assistant') AND " + cond + " ORDER BY m.id DESC LIMIT ?", *["%" + w + "%" for w in words], limit)

    # meta
    def get_meta(self, key):
        r = self._all("SELECT value FROM state_meta WHERE key=?", key)
        return json.loads(r[0]["value"]) if r else None

    def set_meta(self, key, value):
        self._x("INSERT INTO state_meta (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                key, json.dumps(value), now_ms())

    def del_meta(self, key):
        self._x("DELETE FROM state_meta WHERE key=?", key)

    def add_usage(self, sid, model, inp, out, kind="main"):
        self._x("INSERT INTO usage (session_id,model,input_tokens,output_tokens,kind,created_at) VALUES (?,?,?,?,?,?)", sid, model, inp, out, kind, now_ms())

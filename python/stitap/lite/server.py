"""HTTP server for the lite core — same API subset as the Node daemon, so the same web chat UI works."""
import json
import os
import queue
import secrets
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .agent import Agent, HERE


def _ui_path():
    for c in [os.environ.get("STITAP_RESOURCES") and os.path.join(os.environ["STITAP_RESOURCES"], "ui", "index.html"),
              os.path.join(HERE, "..", "_bundle", "ui", "index.html"),
              os.path.join(HERE, "..", "..", "..", "agent", "ui", "index.html")]:
        if c and os.path.isfile(c):
            return c
    return None


def _token(home):
    p = os.path.join(home, "server.token")
    if os.path.exists(p):
        return open(p).read().strip()
    t = secrets.token_urlsafe(24)
    with open(p, "w") as f:
        f.write(t)
    try:
        os.chmod(p, 0o600)
    except OSError:
        pass
    return t


COMMANDS = [{"name": n, "usage": "/" + n, "help": h, "group": "lite"} for n, h in [
    ("new", "Start a fresh conversation"), ("goal", "Keep working until the goal is done"), ("stop", "Interrupt"),
    ("yolo", "Auto-approve dangerous commands in this session"), ("memory", "Show memory"), ("skills", "List skills"), ("help", "Commands")]]


def serve(agent: Agent, host="127.0.0.1", port=7420):
    token = _token(agent.home)
    subs = []  # (session_id, Queue)
    pending = {}  # approval id -> (event, holder)

    def on_event(ev):
        for sid, q in list(subs):
            if not sid or ev.get("sessionId") in (sid, "*"):
                q.put(ev)
    agent.listeners.append(on_event)

    def approver(sid, command, reason):
        aid = secrets.token_hex(6)
        ev, holder = threading.Event(), {"d": "deny"}
        pending[aid] = (ev, holder)
        agent.emit(sid, {"type": "approval_request", "id": aid, "command": command, "reason": reason, "tool": "terminal"})
        ev.wait(300)
        pending.pop(aid, None)
        return holder["d"]
    agent.approver = approver

    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def _json(self, code, data):
            b = json.dumps(data).encode()
            self.send_response(code)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def _body(self):
            n = int(self.headers.get("content-length") or 0)
            return json.loads(self.rfile.read(n) or b"{}") if n else {}

        def _authed(self, qs):
            t = self.headers.get("x-stitap-token") or (self.headers.get("authorization") or "").replace("Bearer ", "") or (qs.get("token") or [""])[0]
            return secrets.compare_digest(t, token)

        def _host_ok(self):
            h = (self.headers.get("host") or "").rsplit(":", 1)[0].strip("[]")
            return host not in ("127.0.0.1", "localhost") or h in ("127.0.0.1", "localhost", "::1")

        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(u.query)
            if not self._host_ok():
                return self._json(403, {"error": "forbidden host"})
            if u.path in ("/", "/index.html", "/chat"):
                p = _ui_path()
                if not p:
                    return self._json(404, {"error": "ui not found"})
                with open(p, encoding="utf-8") as fh:
                    b = fh.read().replace("__STITAP_TOKEN__", token).encode()
                self.send_response(200)
                self.send_header("content-type", "text/html; charset=utf-8")
                self.send_header("content-length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
                return
            if u.path == "/api/health":
                return self._json(200, {"ok": True, "engine": "lite"})
            if not self._authed(qs):
                return self._json(401, {"error": "missing or invalid token"})
            if u.path == "/api/info":
                m = agent.cfg.data["model"]
                return self._json(200, {"version": "lite-0.1.0", "model": m["name"], "provider": m["provider"], "base_url": m.get("base_url"), "profile": agent.cfg.data["agent"]["tool_profile"],
                                        "approvals": agent.cfg.data["approvals"]["mode"], "terminal": "local (lite)", "capabilities": ["python"], "commands": COMMANDS,
                                        "skills": [{"name": s["name"], "description": s["description"]} for s in agent.skills()], "store": {"total": 0, "executable": 0}, "policy": None})
            if u.path == "/api/sessions":
                return self._json(200, [{"id": s["id"], "title": s["title"], "source": s["source"], "updated_at": s["updated_at"], "busy": s["id"] in agent.busy} for s in agent.state.list_sessions(80)])
            if u.path.startswith("/api/sessions/"):
                sid = u.path.split("/")[3]
                s = agent.state.get_session(sid)
                if not s:
                    return self._json(404, {"error": "no such session"})
                s.pop("system_prompt", None)
                return self._json(200, {"session": s, "busy": sid in agent.busy, "cwd": s["cwd"], "model": agent.provider.model, "messages": agent.state.messages(sid),
                                        "todos": agent.state.get_meta("todo:" + sid) or [], "goal": agent.state.get_meta("goal:" + sid), "approvals": [], "clarify": []})
            if u.path == "/api/events":
                sid = (qs.get("session") or [""])[0]
                q = queue.Queue()
                subs.append((sid, q))
                self.send_response(200)
                self.send_header("content-type", "text/event-stream")
                self.send_header("cache-control", "no-store")
                self.end_headers()
                try:
                    self.wfile.write(b"event: hello\ndata: {}\n\n")
                    self.wfile.flush()
                    while True:
                        try:
                            ev = q.get(timeout=15)
                            self.wfile.write(("data: %s\n\n" % json.dumps(ev)).encode())
                        except queue.Empty:
                            self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass
                finally:
                    subs.remove((sid, q))
                return
            return self._json(404, {"error": "not found"})

        def do_POST(self):
            u = urllib.parse.urlparse(self.path)
            if not self._host_ok() or not self._authed(urllib.parse.parse_qs(u.query)):
                return self._json(401, {"error": "missing or invalid token"})
            b = self._body()
            parts = u.path.strip("/").split("/")
            if u.path == "/api/sessions":
                return self._json(200, {"id": agent.new_session("web", b.get("title", ""))})
            if len(parts) == 4 and parts[:2] == ["api", "sessions"] and parts[3] == "messages":
                sid, text = parts[2], (b.get("text") or "").strip()
                if text.startswith("/"):
                    return self._json(200, dict(command=True, **command(agent, sid, text)))
                queued = sid in agent.busy
                threading.Thread(target=agent.send, args=(sid, text, "web"), daemon=True).start()
                return self._json(202, {"queued": queued})
            if len(parts) == 4 and parts[3] == "interrupt":
                agent.interrupt()
                return self._json(200, {"interrupted": True})
            if len(parts) == 3 and parts[:2] == ["api", "approvals"]:
                p = pending.get(parts[2])
                if p:
                    p[1]["d"] = b.get("decision", "deny")
                    p[0].set()
                return self._json(200, {"ok": bool(p)})
            return self._json(404, {"error": "not found"})

    srv = ThreadingHTTPServer((host, port), H)
    srv.daemon_threads = True
    return srv, "http://%s:%d" % (host, srv.server_address[1]), token


def command(agent, sid, line):
    name, _, arg = line[1:].partition(" ")
    arg = arg.strip()
    if name in ("new", "reset"):
        return {"text": "New session", "switchTo": agent.new_session("web", arg)}
    if name == "goal":
        if not arg or arg == "status":
            g = agent.state.get_meta("goal:" + sid)
            return {"text": "Goal [%s] %s/%s: %s" % (g["status"], g["turns"], g["max_turns"], g["text"]) if g else "No goal."}
        if arg == "clear":
            agent.state.del_meta("goal:" + sid)
            return {"text": "Goal cleared."}
        agent.set_goal(sid, arg)
        threading.Thread(target=agent.send, args=(sid, "New goal: %s\nWork autonomously until it is fully done and verified." % arg, "goal"), daemon=True).start()
        return {"text": "Goal set. Working…"}
    if name == "stop":
        agent.interrupt()
        return {"text": "Stopping…"}
    if name == "yolo":
        (agent.yolo.discard if arg == "off" else agent.yolo.add)(sid)
        return {"text": "YOLO %s" % ("off" if arg == "off" else "on")}
    if name == "memory":
        return {"text": agent.memory_op("view", "user") + "\n" + agent.memory_op("view", "memory")}
    if name == "skills":
        return {"text": "\n".join("/%s — %s" % (s["name"], s["description"][:100]) for s in agent.skills())}
    for s in agent.skills():
        if s["name"] == name:
            threading.Thread(target=agent.send, args=(sid, "Use the %s skill (load it with skill_view first).\n\n%s" % (name, arg or "Run it."), "web"), daemon=True).start()
            return {"text": "Running with skill %s…" % name}
    return {"text": "Lite engine commands: " + ", ".join("/" + c["name"] for c in COMMANDS)}

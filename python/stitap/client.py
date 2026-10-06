"""Python SDK for a running stitaP agent daemon (``harness serve`` / ``python -m stitap serve``).

    from stitap import Harness
    h = Harness()                                  # reads ~/.stitap/server.token
    sid = h.create_session()
    print(h.run(sid, "Summarize the README in this folder"))
    for ev in h.events(sid): ...                   # live event stream
"""
import json
import os
import time
import urllib.request


def _home():
    if os.environ.get("STITAP_HOME"):
        return os.environ["STITAP_HOME"]
    return os.path.join(os.environ.get("STITAP_ROOT") or os.path.join(os.path.expanduser("~"), ".stitap"))


class Harness:
    def __init__(self, url="http://127.0.0.1:7420", token=None, timeout=600):
        self.url = url.rstrip("/")
        self.timeout = timeout
        if token is None:
            p = os.path.join(_home(), "server.token")
            token = open(p).read().strip() if os.path.exists(p) else ""
        self.token = token

    def _req(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method,
                                     headers={"content-type": "application/json", "x-stitap-token": self.token})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else {}

    def info(self):
        return self._req("GET", "/api/info")

    def sessions(self):
        return self._req("GET", "/api/sessions")

    def create_session(self, title=""):
        return self._req("POST", "/api/sessions", {"title": title})["id"]

    def session(self, sid):
        return self._req("GET", "/api/sessions/" + sid)

    def send(self, sid, text):
        """Queue a message (or slash command). Returns immediately."""
        return self._req("POST", "/api/sessions/%s/messages" % sid, {"text": text})

    def run(self, sid, text, poll=0.5):
        """Send a task and block until the agent is idle; returns the last assistant message."""
        before = len(self.session(sid)["messages"])
        self.send(sid, text)
        time.sleep(poll)
        while True:
            d = self.session(sid)
            if not d["busy"] and len(d["messages"]) > before:
                for m in reversed(d["messages"]):
                    if m["role"] == "assistant" and not m.get("tool_calls"):
                        return m["content"]
                return ""
            time.sleep(poll)

    def interrupt(self, sid):
        return self._req("POST", "/api/sessions/%s/interrupt" % sid, {"clear": True})

    def approve(self, approval_id, decision="once"):
        return self._req("POST", "/api/approvals/" + approval_id, {"decision": decision})

    def events(self, sid):
        """Generator of live events (dicts) for a session."""
        req = urllib.request.Request("%s/api/events?session=%s&token=%s" % (self.url, sid, self.token))
        with urllib.request.urlopen(req, timeout=None) as r:
            for line in r:
                line = line.decode().strip()
                if line.startswith("data: "):
                    yield json.loads(line[6:])

    def chat(self, text):
        """OpenAI-compatible one-shot call through /v1/chat/completions."""
        body = {"model": "stitap-agent", "messages": [{"role": "user", "content": text}]}
        return self._req("POST", "/v1/chat/completions", body)["choices"][0]["message"]["content"]

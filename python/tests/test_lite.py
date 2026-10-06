"""Lite core tests (stdlib unittest + a scripted OpenAI-compatible mock). Run: python -m unittest discover -s tests"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class Mock:
    """Scripted OpenAI-compatible server: pops queued replies; judge prompts get `judge` replies."""
    def __init__(self, tools_unsupported=False):
        self.queue, self.judge, self.requests = [], [], []
        mock = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["content-length"])))
                mock.requests.append(body)
                if tools_unsupported and body.get("tools"):
                    self.send_response(400); self.end_headers()
                    self.wfile.write(b'{"error":{"message":"model does not support tools"}}'); return
                sys_ = body["messages"][0]["content"] if body["messages"] else ""
                if "completion judge" in sys_:
                    r = mock.judge.pop(0) if mock.judge else {"content": '{"done": true, "reason": "ok"}'}
                else:
                    r = mock.queue.pop(0) if mock.queue else {"content": "OK"}
                calls = [{"id": "c%d" % i, "type": "function", "function": {"name": c["name"], "arguments": json.dumps(c["arguments"])}} for i, c in enumerate(r.get("tool_calls", []))]
                if body.get("stream"):
                    self.send_response(200); self.send_header("content-type", "text/event-stream"); self.end_headers()
                    if r.get("content"):
                        self.wfile.write(("data: %s\n\n" % json.dumps({"choices": [{"delta": {"content": r["content"]}}]})).encode())
                    for i, c in enumerate(calls):
                        self.wfile.write(("data: %s\n\n" % json.dumps({"choices": [{"delta": {"tool_calls": [dict(c, index=i)]}}]})).encode())
                    self.wfile.write(b"data: [DONE]\n\n")
                else:
                    out = json.dumps({"choices": [{"message": {"role": "assistant", "content": r.get("content", ""), "tool_calls": calls or None}}], "usage": {"prompt_tokens": 1, "completion_tokens": 1}}).encode()
                    self.send_response(200); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(out))); self.end_headers(); self.wfile.write(out)
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = "http://127.0.0.1:%d/v1" % self.srv.server_address[1]

    def close(self):
        self.srv.shutdown()


def make(mock, extra=""):
    home, work = tempfile.mkdtemp(), tempfile.mkdtemp()
    with open(os.path.join(home, "config.yaml"), "w") as f:
        f.write("model:\n  provider: openai\n  base_url: %s\n  name: mock\n%s" % (mock.url, extra))
    from stitap.lite import Agent
    return Agent(home=home, cwd=work), home, work


class LiteTests(unittest.TestCase):
    def setUp(self):
        self.mock = Mock()

    def tearDown(self):
        self.mock.close()

    def test_multistep_real_tools(self):
        a, home, work = make(self.mock)
        self.mock.queue += [
            {"tool_calls": [{"name": "write_file", "arguments": {"path": "x.py", "content": "print(6*7)"}}]},
            {"tool_calls": [{"name": "terminal", "arguments": {"command": "%s x.py" % sys.executable}}]},
            {"content": "It printed 42."},
        ]
        sid = a.new_session()
        self.assertEqual(a.send(sid, "go"), "It printed 42.")
        tools = [m for m in a.state.messages(sid) if m["role"] == "tool"]
        self.assertIn("exit code: 0\n42", tools[1]["content"])

    def test_dangerous_blocked_headless(self):
        a, home, work = make(self.mock)
        open(os.path.join(work, "v.txt"), "w").close()
        self.mock.queue += [{"tool_calls": [{"name": "terminal", "arguments": {"command": "rm -rf v.txt"}}]}, {"content": "tried"}]
        sid = a.new_session()
        a.send(sid, "delete")
        self.assertTrue(os.path.exists(os.path.join(work, "v.txt")))

    def test_goal_loop(self):
        a, *_ = make(self.mock)
        self.mock.queue += [{"content": "step 1"}, {"content": "all done, tests pass"}]
        self.mock.judge += [{"content": '{"done": false, "reason": "not yet"}'}, {"content": '{"done": true, "reason": "verified"}'}]
        sid = a.new_session()
        a.set_goal(sid, "finish")
        self.assertEqual(a.send(sid, "start"), "all done, tests pass")
        self.assertEqual(a.state.get_meta("goal:" + sid)["status"], "done")

    def test_memory_and_prompt(self):
        a, *_ = make(self.mock)
        self.mock.queue += [{"tool_calls": [{"name": "memory", "arguments": {"action": "add", "target": "user", "content": "Likes tea"}}]}, {"content": "noted"}]
        a.send(a.new_session(), "remember")
        self.assertIn("Likes tea", a.system_prompt(a.new_session()))

    def test_server_ui_and_api(self):
        a, home, work = make(self.mock)
        from stitap.lite.server import serve
        srv, url, token = serve(a, "127.0.0.1", 0)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            html = urllib.request.urlopen(url + "/").read().decode()
            self.assertIn(token, html)
            H = {"content-type": "application/json", "x-stitap-token": token}
            req = lambda m, p, b=None: json.loads(urllib.request.urlopen(urllib.request.Request(url + p, data=json.dumps(b).encode() if b is not None else None, headers=H, method=m)).read() or b"{}")  # noqa: E731
            sid = req("POST", "/api/sessions", {})["id"]
            self.mock.queue += [{"content": "hello from lite"}]
            req("POST", "/api/sessions/%s/messages" % sid, {"text": "hi"})
            for _ in range(50):
                d = req("GET", "/api/sessions/" + sid)
                if not d["busy"] and any(m["content"] == "hello from lite" for m in d["messages"]):
                    break
                time.sleep(0.1)
            self.assertEqual(d["messages"][-1]["content"], "hello from lite")
            with self.assertRaises(urllib.error.HTTPError):
                urllib.request.urlopen(url + "/api/sessions")
        finally:
            srv.shutdown()

    def test_react_fallback(self):
        self.mock.close()
        self.mock = Mock(tools_unsupported=True)
        a, home, work = make(self.mock)
        self.mock.queue += [{"content": 'Thought: look\nAction: list_dir\nAction Input: {"path": "."}'}, {"content": "Final Answer: empty folder"}]
        self.assertEqual(a.send(a.new_session(), "what's here"), "empty folder")

    def test_yaml_parity(self):
        from stitap.lite.yamlmini import load
        v = load('model:\n  name: "qwen2.5:7b"\n  ctx: 32768\nlist:\n  - a\n  - "b: c"\nservers:\n  - name: x\n    port: 1\ninline: [1, two]\n')
        self.assertEqual(v, {"model": {"name": "qwen2.5:7b", "ctx": 32768}, "list": ["a", "b: c"], "servers": [{"name": "x", "port": 1}], "inline": [1, "two"]})

    def test_launcher_engine_choice(self):
        env = dict(os.environ, STITAP_ENGINE="lite", PYTHONPATH=os.path.join(os.path.dirname(__file__), ".."))
        out = subprocess.run([sys.executable, "-m", "stitap", "engine"], env=env, capture_output=True, text=True).stdout.strip()
        self.assertEqual(out, "lite")


if __name__ == "__main__":
    unittest.main()

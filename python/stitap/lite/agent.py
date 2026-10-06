"""The lite agent loop: same behaviour contract as the Node core, stdlib only.

    from stitap.lite import Agent
    a = Agent(cwd=".")
    sid = a.new_session()
    print(a.send(sid, "List the files here and summarize the project"))
"""
import json
import os
import platform
import re
import shutil
import threading
import time

from . import providers, tools as T
from .config import Config, home_dir
from .state import State, now_ms

HERE = os.path.dirname(os.path.abspath(__file__))
SOUL = "You are stitaP (lite), an autonomous AI agent on the user's computer. You get real work done with tools: run commands, read and edit files, search the web, and keep going until the task is finished and verified."
RULES_FULL = """## How you work
- Act, don't just describe. Use tools; never invent tool results.
- For multi-step tasks keep a todo_list plan.
- Keep going until the task is complete; ask the user only for decisions only they can make.
- Verify before claiming success (run it, check output).
- If a tool fails, read the error and try a different approach.
- Save durable facts with the memory tool; load matching skills with skill_view.
- Final answer: lead with the result, mention files changed and how you verified."""
RULES_SLM = """## Rules
- Use tools to do the work. Never make up results.
- One step at a time. Keep a todo_list for multi-step tasks.
- Check your work before saying it is done. Give a short final answer."""
CONTEXT_FILES = [".stitap.md", "AGENTS.md", "CLAUDE.md", ".cursorrules"]


def _bundled_skill_dirs():
    cands = [os.environ.get("STITAP_RESOURCES") and os.path.join(os.environ["STITAP_RESOURCES"], "skills"),
             os.path.join(HERE, "..", "_bundle", "skills"),
             os.path.join(HERE, "..", "..", "..", "agent", "skills")]
    return [os.path.abspath(c) for c in cands if c and os.path.isdir(c)]


def _frontmatter(path):
    try:
        with open(path, encoding="utf-8") as f:
            t = f.read()
    except OSError:
        return {}
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---", t)
    if not m:
        return {}
    from .yamlmini import load
    try:
        return load(m.group(1)) or {}
    except Exception:
        return {}


class Ctx:
    def __init__(self, agent, sid):
        self.agent, self.sid = agent, sid

    @property
    def cwd(self):
        s = self.agent.state.get_session(self.sid)
        return s["cwd"] if s and os.path.isdir(s["cwd"]) else os.getcwd()

    def set_cwd(self, p):
        self.agent.state.update_session(self.sid, cwd=p)

    def approve(self, command, reason):
        return self.agent.approve(self.sid, command, reason)


class Agent:
    def __init__(self, home=None, profile=None, cwd=None, provider=None, approver=None):
        self.home = home or home_dir(profile)
        self.cfg = Config(self.home)
        self.state = State(self.home)
        self.cwd = os.path.abspath(cwd or os.getcwd())
        self.provider = provider or providers.build(self.cfg)
        self.aux = provider or (providers.build(self.cfg, self.cfg.data.get("aux") or {}) if self.cfg.data.get("aux") else self.provider)
        self.listeners = []
        self.approver = approver          # fn(sid, command, reason) -> "once"|"session"|"always"|"deny"
        self.yolo = set()
        self.session_allow = {}
        self.interrupted = False
        self.current_proc = None
        self.background = {}
        self.busy = set()
        self.lock = threading.RLock()

    # ── events ──
    def emit(self, sid, ev):
        ev = dict(ev, sessionId=sid, ts=now_ms())
        for fn in list(self.listeners):
            try:
                fn(ev)
            except Exception:
                pass

    # ── sessions ──
    def new_session(self, source="cli", title=""):
        return self.state.create_session(source, title, self.cwd)["id"]

    def skills(self):
        out, seen = [], set()
        for root in [os.path.join(self.home, "skills")] + _bundled_skill_dirs():
            for d, dirs, files in os.walk(root):
                dirs[:] = [x for x in dirs if not x.startswith(".")]
                if "SKILL.md" in files:
                    meta = _frontmatter(os.path.join(d, "SKILL.md"))
                    name = str(meta.get("name") or os.path.basename(d))
                    if name not in seen:
                        seen.add(name)
                        out.append({"name": name, "description": str(meta.get("description") or ""), "path": os.path.join(d, "SKILL.md")})
        return sorted(out, key=lambda s: s["name"])

    def memory_entries(self, target):
        p = os.path.join(self.home, "memories", "USER.md" if target == "user" else "MEMORY.md")
        if not os.path.exists(p):
            return []
        with open(p, encoding="utf-8") as f:
            return [l[2:].strip() for l in f.read().splitlines() if l.startswith("- ")]

    def memory_op(self, action, target, content="", old=""):
        es = self.memory_entries(target)
        limit = self.cfg.data["memory"]["user_chars" if target == "user" else "memory_chars"]
        if action == "add":
            c = " ".join(content.split())
            if not c:
                return "error: empty content"
            if any(e.lower() == c.lower() for e in es):
                return "already remembered"
            if sum(len(e) + 3 for e in es) + len(c) + 3 > limit:
                return "error: %s is full; consolidate with replace/remove first" % target
            es.append(c)
        elif action in ("replace", "remove"):
            idx = [i for i, e in enumerate(es) if old.strip() and old.strip() in e]
            if not idx:
                return "error: no entry contains %r" % old
            if action == "remove":
                es = [e for i, e in enumerate(es) if i not in idx]
            else:
                es[idx[0]] = " ".join(content.split())
        else:
            return "\n".join("- " + e for e in es) or "(empty)"
        p = os.path.join(self.home, "memories", "USER.md" if target == "user" else "MEMORY.md")
        with open(p, "w", encoding="utf-8") as f:
            f.write("# %s\n\n%s\n" % ("User profile" if target == "user" else "Agent memory", "\n".join("- " + e for e in es)))
        return "%s ok (%d/%d chars)" % (action, sum(len(e) + 3 for e in es), limit)

    def backup(self, path):
        if not os.path.isfile(path):
            return
        d = os.path.join(self.home, "checkpoints", "files", str(now_ms()))
        os.makedirs(d, exist_ok=True)
        shutil.copy2(path, os.path.join(d, os.path.basename(path)))
        with open(os.path.join(d, os.path.basename(path) + ".path"), "w") as f:
            f.write(path)

    def approve(self, sid, command, reason):
        mode = self.cfg.data["approvals"]["mode"]
        if mode == "yolo" or sid in self.yolo or command in self.session_allow.get(sid, set()):
            return True
        if any(command.startswith(p[:-1]) if p.endswith("*") else command == p for p in self.cfg.data["approvals"].get("allow_patterns") or []):
            return True
        if mode == "deny" or not self.approver:
            return False
        d = self.approver(sid, command, reason)
        if d == "session":
            self.session_allow.setdefault(sid, set()).add(command)
        if d == "always":
            try:
                self.cfg.set("approvals.allow_patterns", list(self.cfg.data["approvals"].get("allow_patterns") or []) + [command])
            except ValueError:
                pass
        return d in ("once", "session", "always")

    def tool_list(self):
        return T.active_tools(self.cfg.data["agent"]["tool_profile"], set(self.cfg.data["tools"]["disabled"]) | set((self.cfg.policy or {}).get("disable_tools") or []))

    def system_prompt(self, sid):
        s = self.state.get_session(sid)
        if s.get("system_prompt"):
            return s["system_prompt"]
        slm = self.cfg.data["agent"]["tool_profile"] == "slm"
        parts = [open(os.path.join(self.home, "SOUL.md"), encoding="utf-8").read().strip() if os.path.exists(os.path.join(self.home, "SOUL.md")) else SOUL,
                 RULES_SLM if slm else RULES_FULL,
                 "## Environment\n- OS: %s %s\n- Shell: %s\n- Working directory: %s\n- Date: %s\n- Engine: stitaP lite (Python %s)" % (
                     platform.system(), platform.release(), "PowerShell" if os.name == "nt" else os.environ.get("SHELL", "/bin/sh"), s["cwd"], time.strftime("%Y-%m-%d"), platform.python_version())]
        u, m = self.memory_entries("user"), self.memory_entries("memory")
        if u:
            parts.append("## About the user (USER.md)\n" + "\n".join("- " + e for e in u))
        if m:
            parts.append("## Your memory (MEMORY.md)\n" + "\n".join("- " + e for e in m))
        sk = self.skills()
        if sk:
            parts.append("## Skills (load with skill_view)\n" + "\n".join("- %s: %s" % (x["name"], x["description"][:150]) for x in sk))
        d = s["cwd"]
        for _ in range(4):
            for f in CONTEXT_FILES:
                p = os.path.join(d, f)
                if os.path.isfile(p):
                    with open(p, encoding="utf-8", errors="replace") as fh:
                        parts.append("## Project context: %s\n%s" % (p, fh.read()[:12000]))
            if os.path.isdir(os.path.join(d, ".git")) or os.path.dirname(d) == d:
                break
            d = os.path.dirname(d)
        prompt = "\n\n".join(parts)
        self.state.update_session(sid, system_prompt=prompt)
        return prompt

    def interrupt(self):
        self.interrupted = True
        if self.current_proc:
            T._kill(self.current_proc)

    def _compress(self, sid):
        msgs = self.state.messages(sid)
        keep = self.cfg.data["compression"]["keep_last"]
        start = len(msgs) - keep
        while start > 0 and msgs[start]["role"] == "tool":
            start -= 1
        if start <= 1:
            return
        middle, tail = msgs[:start], msgs[start:]
        text = "\n".join("[%s] %s" % (m["role"], (m.get("content") or "")[:1500]) for m in middle)[-60000:]
        try:
            summary = self.aux.chat([{"role": "system", "content": "Summarize this agent conversation for seamless continuation: goals, decisions, files changed, current state, next steps. Dense, <500 words."},
                                     {"role": "user", "content": text}], stream=False, max_tokens=1000)["content"]
        except Exception as e:
            summary = "Earlier requests: " + " | ".join((m.get("content") or "")[:300] for m in middle if m["role"] == "user") + " (summary failed: %s)" % e
        self.state.archive([m["id"] for m in msgs])
        self.state.add_message(sid, "user", "[Context summary — earlier conversation was compressed]\n\n" + summary, meta={"compression_summary": True})
        if tail[0]["role"] == "user":
            self.state.add_message(sid, "assistant", "Understood — continuing from the summary above.")
        for m in tail:
            self.state.add_message(sid, m["role"], m.get("content"), m.get("tool_calls"), m.get("tool_call_id"), m.get("name"))
        self.emit(sid, {"type": "compressed", "text": "context compressed"})

    def run_turn(self, sid, text, source="user", max_iterations=None):
        """One user turn: loop model ↔ tools until a final answer. Returns dict(final, tool_calls, iterations)."""
        self.interrupted = False
        ctx = Ctx(self, sid)
        sysmsg = self.system_prompt(sid)
        self.state.add_message(sid, "user", text, meta={"source": source})
        self.emit(sid, {"type": "user_message", "text": text, "source": source, "internal": source not in ("user", "cli", "web")})
        tl = self.tool_list()
        schemas = [fn.spec for fn in tl]
        by_name = {fn.spec["name"]: fn for fn in tl}
        limit = max_iterations or self.cfg.data["agent"]["max_iterations"]
        max_out = self.cfg.data["agent"]["max_tool_output_chars"]
        it = calls = 0
        final = ""
        while it < limit:
            if self.interrupted:
                final = "(interrupted)"
                break
            msgs = self.state.messages(sid)
            est = sum(len(m.get("content") or "") + len(json.dumps(m.get("tool_calls") or "")) for m in msgs) // 4 + len(sysmsg) // 4
            if self.cfg.data["compression"]["enabled"] and est > self.provider.context_window * self.cfg.data["compression"]["threshold"]:
                self._compress(sid)
                msgs = self.state.messages(sid)
            it += 1
            try:
                r = self.provider.chat([{"role": "system", "content": sysmsg}] + msgs, tools=schemas,
                                       on_token=lambda t: self.emit(sid, {"type": "token", "text": t}), should_stop=lambda: self.interrupted)
            except KeyboardInterrupt:
                final = "(interrupted)"
                break
            except providers.ProviderError as e:
                if e.kind == "context_length":
                    self._compress(sid)
                    continue
                final = "Error: %s" % e
                break
            self.state.add_usage(sid, r.get("model", ""), r["usage"]["input"], r["usage"]["output"])
            if not r["tool_calls"]:
                final = r["content"].strip() or "(empty response)"
                break
            self.state.add_message(sid, "assistant", r["content"] or None, r["tool_calls"])
            self.emit(sid, {"type": "assistant_step", "text": r["content"]})
            for c in r["tool_calls"]:
                fn = by_name.get(c["name"]) or next((by_name[n] for n in by_name if n.replace("_", "").lower() == c["name"].replace("_", "").lower()), None)
                try:
                    args = json.loads(c["arguments"] or "{}") if isinstance(c["arguments"], str) else c["arguments"]
                    if not isinstance(args, dict):
                        args = {}
                except ValueError:
                    args = {}
                self.emit(sid, {"type": "tool_start", "id": c["id"], "name": c["name"], "args": args})
                t0 = time.time()
                if not fn:
                    out = "error: unknown tool %s. Available: %s" % (c["name"], ", ".join(by_name))
                elif self.interrupted:
                    out = "[skipped: interrupted]"
                else:
                    try:
                        out = fn(args, ctx)
                    except Exception as e:
                        out = "error: %s" % e
                if len(out) > max_out:
                    sp = os.path.join(self.home, "spill", "%s-%s.txt" % (sid, re.sub(r"\W", "", c["id"])))
                    with open(sp, "w", encoding="utf-8") as f:
                        f.write(out)
                    out = out[: int(max_out * 0.6)] + "\n…[truncated; full output in %s]…\n" % sp + out[-int(max_out * 0.4):]
                self.emit(sid, {"type": "tool_end", "id": c["id"], "name": c["name"], "ok": not out.startswith(("error", "BLOCKED")), "result": out[:4000], "ms": int((time.time() - t0) * 1000)})
                self.state.add_message(sid, "tool", out, tool_call_id=c["id"], name=c["name"])
                calls += 1
        else:
            final = "(stopped: iteration budget reached)"
        self.state.add_message(sid, "assistant", final)
        s = self.state.get_session(sid)
        if s and not s["title"]:
            self.state.update_session(sid, title=" ".join(text.split())[:60])
        return {"final": final, "tool_calls": calls, "iterations": it, "interrupted": self.interrupted}

    def _judge(self, sid, goal, reply):
        try:
            r = self.aux.chat([{"role": "system", "content": 'You are a strict completion judge. Reply ONLY JSON: {"done": bool, "reason": "..."}. Require evidence.'},
                               {"role": "user", "content": "Goal: %s\n\nAgent's latest reply:\n%s" % (goal, reply[:5000])}], stream=False, max_tokens=200, json_mode=True)
            m = re.search(r"\{[\s\S]*\}", r["content"])
            j = json.loads(m.group(0)) if m else {}
            return bool(j.get("done")), str(j.get("reason", ""))
        except Exception as e:
            return False, "judge unavailable (%s)" % e

    def send(self, sid, text, source="user"):
        """Run a turn, then keep going while a /goal is active (judge-verified)."""
        with self.lock:
            self.busy.add(sid)
            self.emit(sid, {"type": "busy", "busy": True})
            try:
                r = self.run_turn(sid, text, source)
                self.emit(sid, {"type": "turn_end", "final": r["final"], "iterations": r["iterations"], "toolCalls": r["tool_calls"], "interrupted": r["interrupted"]})
                while True:
                    g = self.state.get_meta("goal:" + sid)
                    if not g or g.get("status") != "active" or r["interrupted"]:
                        break
                    done, reason = self._judge(sid, g["text"], r["final"])
                    g["turns"] += 1
                    g["last_reason"] = reason
                    if done:
                        g["status"] = "done"
                    elif g["turns"] >= g["max_turns"]:
                        g["status"] = "paused"
                    self.state.set_meta("goal:" + sid, g)
                    self.emit(sid, {"type": "goal", "state": g})
                    if g["status"] != "active":
                        break
                    r = self.run_turn(sid, "[Goal continuation %d/%d] Keep working toward: %s\nJudge: %s\nDo the next steps now; say clearly when done, with evidence." % (g["turns"], g["max_turns"], g["text"], reason), "goal")
                    self.emit(sid, {"type": "turn_end", "final": r["final"], "iterations": r["iterations"], "toolCalls": r["tool_calls"], "interrupted": r["interrupted"]})
                return r["final"]
            finally:
                self.busy.discard(sid)
                self.emit(sid, {"type": "busy", "busy": False})

    def set_goal(self, sid, text):
        self.state.set_meta("goal:" + sid, {"text": text, "status": "active", "turns": 0, "max_turns": self.cfg.data["goals"]["max_turns"], "created_at": now_ms()})

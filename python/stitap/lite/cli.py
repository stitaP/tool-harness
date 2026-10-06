"""Command line for the lite engine (used automatically when neither a bundled binary nor Node is available)."""
import json
import sys
import webbrowser

from .agent import Agent
from .config import Config, home_dir
from . import yamlmini

HELP = """stitap (lite engine — pure Python, no dependencies)

  stitap                      interactive chat
  stitap -q "task" [--json]   one-shot task
  stitap serve | ui [--port N]  web chat at http://127.0.0.1:7420
  stitap config get|set <key> [value]
  stitap doctor | engine | version
  flags: -p/--profile NAME  --cwd DIR  --yolo

Chat commands: /new /goal <text> /yolo /memory /skills /quit
For the full engine (cron, MCP, gateway, browser, 350+ store tools), install Node 20+ or use a wheel with the bundled binary."""


def _flags(argv):
    f, rest, i = {}, [], 0
    while i < len(argv):
        a = argv[i]
        if a in ("-p", "--profile", "--cwd", "--port", "-q", "--query", "--host"):
            f[a.lstrip("-")[0] if a in ("-p", "-q") else a.lstrip("-")] = argv[i + 1]
            i += 2
            continue
        if a in ("--json", "--yolo", "--no-open"):
            f[a.lstrip("-")] = True
        elif a in ("-h", "--help"):
            f["help"] = True
        elif a == "--version":
            rest.insert(0, "version")
        else:
            rest.append(a)
        i += 1
    return f, rest


def _cli_approver(sid, command, reason):
    try:
        a = input("\n⚠  Approval needed (%s):\n   %s\n   [y] once [s] session [a] always [n] deny: " % (reason, command)).strip().lower()
    except EOFError:
        return "deny"
    return {"y": "once", "s": "session", "a": "always"}.get(a[:1], "deny")


def main(argv):
    f, rest = _flags(argv)
    if f.get("help") or rest[:1] == ["help"]:
        print(HELP)
        return 0
    profile = f.get("p") or f.get("profile")
    cmd = rest[0] if rest else None
    if cmd == "version":
        print("lite-0.1.0")
        return 0
    if cmd == "config":
        cfg = Config(home_dir(profile))
        if len(rest) >= 3 and rest[1] == "get":
            print(yamlmini.dump(cfg.get(rest[2])))
        elif len(rest) >= 4 and rest[1] == "set":
            cfg.set(rest[2], yamlmini.scalar(" ".join(rest[3:])))
            print("%s = %s" % (rest[2], json.dumps(cfg.get(rest[2]))))
        else:
            print(yamlmini.dump(cfg.data))
        return 0
    agent = Agent(profile=profile, cwd=f.get("cwd"))
    if f.get("yolo"):
        agent.cfg.data["approvals"]["mode"] = "yolo"
    if cmd == "doctor":
        try:
            r = agent.provider.chat([{"role": "user", "content": "Reply with exactly: pong"}], stream=False, max_tokens=10)
            print("✔ model responds: %r" % r["content"][:40])
            return 0
        except Exception as e:
            print("✗ model call failed: %s" % e)
            return 1
    if cmd in ("serve", "ui"):
        from .server import serve
        srv, url, _ = serve(agent, f.get("host") or agent.cfg.data["server"]["host"], int(f.get("port") or agent.cfg.data["server"]["port"]))
        print("● stitaP lite serving %s/  (Ctrl+C to stop)" % url)
        if cmd == "ui" and not f.get("no-open"):
            webbrowser.open(url + "/")
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
        return 0
    query = f.get("q") or f.get("query") or (" ".join(rest) if rest else None)
    if query:
        agent.approver = None if not sys.stdin.isatty() else _cli_approver
        sid = agent.new_session("cli")
        if not f.get("json"):
            agent.listeners.append(lambda ev: ev["type"] == "tool_start" and print("⚙ %s %s" % (ev["name"], json.dumps(ev["args"])[:150]), file=sys.stderr))
        final = agent.send(sid, query)
        print(json.dumps({"session": sid, "final": final}) if f.get("json") else final)
        return 0
    return repl(agent)


def repl(agent):
    agent.approver = _cli_approver
    sid = agent.new_session("cli")
    streaming = {"on": False, "any": False}

    def on(ev):
        t = ev["type"]
        if t == "token":
            streaming["any"] = True
            if not streaming["on"]:
                sys.stdout.write("● ")
                streaming["on"] = True
            sys.stdout.write(ev["text"])
            sys.stdout.flush()
        elif t in ("tool_start", "turn_end", "assistant_step") and streaming["on"]:
            sys.stdout.write("\n")
            streaming["on"] = False
        if t == "tool_start":
            print("⚙ %s %s" % (ev["name"], json.dumps(ev["args"])[:150]))
        elif t == "tool_end" and not ev["ok"]:
            print("  ✗ " + ev["result"].split("\n")[0][:200])
        elif t == "goal":
            print("  · goal [%s] %s" % (ev["state"]["status"], ev["state"].get("last_reason", "")))
    agent.listeners.append(on)
    print("stitaP lite — type a task, /help, Ctrl+C to interrupt, /quit to exit")
    while True:
        try:
            line = input("› ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not line:
            continue
        if line in ("/quit", "/exit"):
            return 0
        if line == "/help":
            print(HELP)
            continue
        if line.startswith("/"):
            from .server import command
            r = command(agent, sid, line) if not line.startswith("/goal ") else None
            if line.startswith("/goal ") and len(line) > 6:
                agent.set_goal(sid, line[6:])
                line = "New goal: %s\nWork autonomously until it is fully done and verified." % line[6:]
            elif r:
                print(r.get("text", ""))
                if r.get("switchTo"):
                    sid = r["switchTo"]
                continue
        try:
            streaming["any"] = False
            final = agent.send(sid, line)
            if not streaming["any"] and final:
                print("● " + final)
        except KeyboardInterrupt:
            agent.interrupt()
            print("\n⏹ interrupted")

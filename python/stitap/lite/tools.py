"""Core tools for the lite agent (stdlib only). Same names/schemas as the Node core."""
import fnmatch
import html
import ipaddress
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import urllib.parse
import urllib.request

IS_WIN = os.name == "nt"
SKIP = {"node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__", ".next", "target", ".cache"}
MARK = "__STITAP_CWD__"

DANGER = [
    (r"\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+", "recursive/forced delete"),
    (r"\b(sudo|doas|runas)\b", "privilege escalation"),
    (r"\b(mkfs|fdisk|diskpart|format\s+[a-z]:)", "disk formatting"),
    (r"(curl|wget|iwr|Invoke-WebRequest)[^|;&]*\|\s*(sudo\s+)?(sh|bash|python3?|iex)\b", "pipe remote script into an interpreter"),
    (r"\bgit\s+push\b[^;&|]*(--force|-f\b)", "force push"),
    (r"\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)", "destructive git operation"),
    (r"\b(shutdown|reboot|Stop-Computer|Restart-Computer)\b", "power operation"),
    (r"Remove-Item\b[^;|]*-Recurse", "recursive delete (PowerShell)"),
    (r"\b(rd|rmdir)\s+/s\b", "recursive delete (cmd)"),
    (r"\b(DROP\s+(TABLE|DATABASE)|TRUNCATE\s+TABLE)\b", "destructive SQL"),
    (r"\b(npm|pnpm|yarn)\s+publish\b|\btwine\s+upload\b", "publishing a package"),
]


def danger_reason(cmd):
    for pat, why in DANGER:
        if re.search(pat, cmd, re.I):
            return why
    return None


def T(name, desc, props, required, toolset, tier="standard"):
    def deco(fn):
        fn.spec = {"name": name, "description": desc, "parameters": {"type": "object", "properties": props, "required": required}}
        fn.toolset, fn.tier = toolset, tier
        REGISTRY[name] = fn
        return fn
    return deco


REGISTRY = {}
S = lambda d: {"type": "string", "description": d}  # noqa: E731
I = lambda d: {"type": "integer", "description": d}  # noqa: E731
B = lambda d: {"type": "boolean", "description": d}  # noqa: E731


def _resolve(ctx, p):
    p = os.path.expanduser(str(p).strip())
    full = os.path.abspath(p if os.path.isabs(p) else os.path.join(ctx.cwd, p))
    for b in ctx.agent.cfg.data["security"]["blocked_paths"]:
        bp = os.path.abspath(os.path.expanduser(b))
        if full == bp or full.startswith(bp + os.sep):
            raise PermissionError("access to %s is blocked by security.blocked_paths" % b)
    return full


def _shell():
    if IS_WIN:
        exe = shutil.which("pwsh") or "powershell"
        return "powershell", [exe, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]
    sh = os.environ.get("SHELL") if os.environ.get("SHELL", "").endswith(("bash", "zsh")) else ("/bin/bash" if os.path.exists("/bin/bash") else "/bin/sh")
    return "posix", [sh, "-c"]


@T("terminal", "Run a shell command (non-interactive). The working directory persists between calls (use cd). Set background=true for servers.",
   {"command": S("command"), "timeout": I("seconds"), "background": B("run in background")}, ["command"], "terminal", "slm")
def terminal(a, ctx):
    cmd = str(a.get("command", "")).strip()
    why = danger_reason(cmd)
    if why and not ctx.approve(cmd, why):
        return "BLOCKED: this command was not approved (%s). Choose a safer approach or ask the user." % why
    kind, argv = _shell()
    env = dict(os.environ, CI="1", GIT_PAGER="cat", PAGER="cat", PYTHONUNBUFFERED="1", NO_COLOR="1", TERM="dumb")
    if a.get("background"):
        p = subprocess.Popen(argv + [cmd], cwd=ctx.cwd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=not IS_WIN)
        ctx.agent.background[p.pid] = (cmd, p)
        return "Started background process pid %d." % p.pid
    if kind == "powershell":
        wrapped = "& { %s\n}; $__ec = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }; Write-Output \"`n%s$((Get-Location).Path)\"; exit $__ec" % (cmd, MARK)
    else:
        wrapped = "%s\n__st_ec=$?; printf '\\n%s%%s\\n' \"$(pwd)\"; exit $__st_ec" % (cmd, MARK)
    timeout = min(int(a.get("timeout") or ctx.agent.cfg.data["terminal"]["timeout"]), 3600)
    p = subprocess.Popen(argv + [wrapped], cwd=ctx.cwd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=not IS_WIN)
    ctx.agent.current_proc = p
    try:
        out, _ = p.communicate(timeout=timeout)
        status = "exit code: %s" % p.returncode
    except subprocess.TimeoutExpired:
        _kill(p)
        out, _ = p.communicate()
        status = "[timed out after %ss — consider background=true]" % timeout
    finally:
        ctx.agent.current_proc = None
    text = out.decode("utf-8", "replace") if out else ""
    if ctx.agent.interrupted:
        status = "[interrupted by user]"
    i = text.rfind(MARK)
    if i >= 0:
        new = text[i + len(MARK):].strip().splitlines()[0] if text[i + len(MARK):].strip() else ""
        text = text[:i].rstrip("\n")
        if new and os.path.isdir(new) and new != ctx.cwd:
            ctx.set_cwd(new)
            text += "\n[cwd is now %s]" % new
    return "%s\n%s" % (status, text.strip() or "(no output)")


def _kill(p):
    try:
        if IS_WIN:
            subprocess.call(["taskkill", "/T", "/F", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            os.killpg(p.pid, signal.SIGKILL)
    except Exception:
        try:
            p.kill()
        except Exception:
            pass


@T("read_file", "Read a text file with line numbers (offset/limit to page).", {"path": S("file path"), "offset": I("1-based start line"), "limit": I("max lines")}, ["path"], "files", "slm")
def read_file(a, ctx):
    p = _resolve(ctx, a["path"])
    if not os.path.isfile(p):
        return "error: file not found: %s" % p
    with open(p, "rb") as f:
        data = f.read(20_000_000)
    if b"\0" in data[:8000]:
        return "%s is a binary file; not shown." % p
    lines = data.decode("utf-8", "replace").split("\n")
    off = max(1, int(a.get("offset") or 1))
    lim = max(1, min(int(a.get("limit") or 400), 2000))
    part = lines[off - 1:off - 1 + lim]
    w = len(str(off + len(part)))
    body = "\n".join("%s| %s" % (str(off + i).rjust(w), l[:2000]) for i, l in enumerate(part))
    more = "\n… %d more lines (use offset=%d)" % (len(lines) - (off - 1 + len(part)), off + len(part)) if off - 1 + len(part) < len(lines) else ""
    return "%s (%d lines)\n%s%s" % (os.path.relpath(p, ctx.cwd), len(lines), body, more)


@T("write_file", "Create or overwrite a file (parent directories are created).", {"path": S("file path"), "content": S("full content")}, ["path", "content"], "files", "slm")
def write_file(a, ctx):
    p = _resolve(ctx, a["path"])
    ctx.agent.backup(p)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    existed = os.path.exists(p)
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(str(a.get("content", "")))
    return "%s %s (%d lines)" % ("Overwrote" if existed else "Created", os.path.relpath(p, ctx.cwd), str(a.get("content", "")).count("\n") + 1)


def apply_edit(text, old, new, replace_all=False):
    if not old:
        raise ValueError("old_string is empty")
    n = text.count(old)
    if n == 1 or (n > 1 and replace_all):
        return text.replace(old, new), False
    if n > 1:
        raise ValueError("old_string matches %d places; add context or set replace_all" % n)
    norm = lambda s: re.sub(r"\s+", " ", s).strip()  # noqa: E731
    lines = text.split("\n")
    want = [norm(l) for l in old.strip("\n").split("\n")]
    hits = [i for i in range(len(lines) - len(want) + 1) if all(norm(lines[i + j]) == want[j] for j in range(len(want)))]
    if not hits:
        raise ValueError("old_string not found (even ignoring whitespace); re-read the file")
    if len(hits) > 1 and not replace_all:
        raise ValueError("old_string matches %d places; add context" % len(hits))
    indent = re.match(r"\s*", lines[hits[0]]).group(0)
    nl = new.split("\n")
    if nl and not nl[0].startswith((" ", "\t")) and indent:
        nl = [indent + l if (k == 0 or l.strip()) else l for k, l in enumerate(nl)]
    for h in reversed(hits):
        lines[h:h + len(want)] = nl
    return "\n".join(lines), True


@T("patch", "Edit a file by replacing old_string with new_string (must be unique; whitespace differences tolerated).",
   {"path": S("file"), "old_string": S("text to replace"), "new_string": S("replacement"), "replace_all": B("all occurrences")}, ["path", "old_string", "new_string"], "files", "slm")
def patch(a, ctx):
    p = _resolve(ctx, a["path"])
    if not os.path.isfile(p):
        return "error: file not found: %s" % p
    with open(p, encoding="utf-8") as f:
        text = f.read()
    try:
        new, fuzzy = apply_edit(text, a.get("old_string", ""), a.get("new_string", ""), bool(a.get("replace_all")))
    except ValueError as e:
        return "error: %s. No changes written." % e
    ctx.agent.backup(p)
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(new)
    return "Patched %s%s" % (os.path.relpath(p, ctx.cwd), " (whitespace-tolerant match)" if fuzzy else "")


@T("search_files", "Search file contents by regex (mode=content) or find files by glob (mode=files).",
   {"pattern": S("regex or glob"), "path": S("dir"), "glob": S("file filter"), "mode": {"type": "string", "enum": ["content", "files"]}, "max_results": I("limit")}, ["pattern"], "files", "slm")
def search_files(a, ctx):
    root = _resolve(ctx, a.get("path") or ".")
    mx = min(int(a.get("max_results") or 100), 1000)
    out = []
    if a.get("mode") == "files":
        pat = a["pattern"] if any(c in a["pattern"] for c in "*?") else "*%s*" % a["pattern"]
        for d, dirs, files in os.walk(root):
            dirs[:] = [x for x in dirs if x not in SKIP]
            out += [os.path.relpath(os.path.join(d, f), ctx.cwd) for f in files if fnmatch.fnmatch(f, pat)]
            if len(out) >= mx:
                break
        return "\n".join(out[:mx]) or "no matching files"
    rg = shutil.which("rg")
    if rg:
        cmd = [rg, "--no-heading", "-n", "--color", "never", "--max-columns", "300"] + (["--glob", a["glob"]] if a.get("glob") else []) + ["-e", a["pattern"], root]
        r = subprocess.run(cmd, capture_output=True, text=True)
        lines = r.stdout.splitlines()
        return "\n".join(lines[:mx]) or "no matches"
    rx = re.compile(a["pattern"])
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP]
        for f in files:
            if a.get("glob") and not fnmatch.fnmatch(f, a["glob"]):
                continue
            fp = os.path.join(d, f)
            try:
                with open(fp, encoding="utf-8") as fh:
                    for i, line in enumerate(fh, 1):
                        if rx.search(line):
                            out.append("%s:%d:%s" % (os.path.relpath(fp, ctx.cwd), i, line.rstrip()[:300]))
                            if len(out) >= mx:
                                return "\n".join(out)
            except (UnicodeDecodeError, OSError):
                continue
    return "\n".join(out) or "no matches"


@T("list_dir", "List a directory tree (depth 1-3).", {"path": S("dir"), "depth": I("depth")}, [], "files")
def list_dir(a, ctx):
    root = _resolve(ctx, a.get("path") or ".")
    depth = max(1, min(int(a.get("depth") or 2), 3))
    out = [root]

    def rec(d, lvl, pre):
        try:
            entries = sorted(os.scandir(d), key=lambda e: (not e.is_dir(), e.name))
        except OSError:
            return
        for e in entries[:300]:
            if e.is_dir():
                out.append("%s%s/%s" % (pre, e.name, " (skipped)" if e.name in SKIP else ""))
                if e.name not in SKIP and lvl < depth:
                    rec(e.path, lvl + 1, pre + "  ")
            else:
                out.append("%s%s" % (pre, e.name))
    rec(root, 1, "  ")
    return "\n".join(out)


def _egress_ok(url, allow_private):
    u = urllib.parse.urlparse(url)
    if u.scheme not in ("http", "https"):
        raise ValueError("only http(s) URLs are allowed")
    if allow_private:
        return
    try:
        for info in socket.getaddrinfo(u.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                raise ValueError("requests to private network addresses are blocked (web.allow_private)")
    except socket.gaierror:
        pass


def _fetch(url, allow_private, data=None, headers=None):
    _egress_ok(url, allow_private)
    req = urllib.request.Request(url, data=data, headers={"user-agent": "Mozilla/5.0 (compatible; stitaP-lite/0.1)", **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace"), r.headers.get("content-type", "")


def html_to_text(s):
    s = re.sub(r"(?is)<(script|style|noscript|svg|head)[^>]*>.*?</\1>", "", s)
    s = re.sub(r"(?is)<h([1-6])[^>]*>(.*?)</h\1>", lambda m: "\n\n%s %s\n\n" % ("#" * int(m.group(1)), re.sub("<[^>]+>", "", m.group(2)).strip()), s)
    s = re.sub(r"(?i)<li[^>]*>", "\n- ", s)
    s = re.sub(r"(?i)</(p|div|section|tr|ul|ol|table)>|<br\s*/?>", "\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(" ".join(l.split()) for l in s.split("\n"))).strip()


@T("web_search", "Search the web; returns titles, URLs and snippets.", {"query": S("query"), "max_results": I("count")}, ["query"], "web", "slm")
def web_search(a, ctx):
    n = min(int(a.get("max_results") or 6), 15)
    w = ctx.agent.cfg.data["web"]
    if w.get("search_provider") == "searxng" and w.get("searxng_url"):
        body, _ = _fetch(w["searxng_url"].rstrip("/") + "/search?format=json&q=" + urllib.parse.quote(a["query"]), True)
        res = [(r.get("title"), r.get("url"), r.get("content", "")) for r in json.loads(body).get("results", [])[:n]]
    else:
        body, _ = _fetch("https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(a["query"]), w.get("allow_private"))
        res = []
        for m in re.finditer(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>(?:.*?class="result__snippet"[^>]*>(.*?)</a>)?', body, re.S):
            url = html.unescape(m.group(1))
            q = re.search(r"uddg=([^&]+)", url)
            if q:
                url = urllib.parse.unquote(q.group(1))
            res.append((html.unescape(re.sub("<[^>]+>", "", m.group(2))), url, html.unescape(re.sub("<[^>]+>", "", m.group(3) or ""))))
            if len(res) >= n:
                break
    return "\n".join("%d. %s\n   %s\n   %s" % (i + 1, t, u, s) for i, (t, u, s) in enumerate(res)) or "no results"


@T("web_extract", "Fetch a web page and return readable text.", {"url": S("URL"), "max_chars": I("limit")}, ["url"], "web", "slm")
def web_extract(a, ctx):
    body, ct = _fetch(a["url"], ctx.agent.cfg.data["web"].get("allow_private"))
    mx = min(int(a.get("max_chars") or 15000), 60000)
    text = html_to_text(body) if "html" in ct or body.lstrip().startswith("<") else body
    return "%s\n\n%s" % (a["url"], text[:mx] + ("\n…[truncated]" if len(text) > mx else ""))


@T("todo_list", "Maintain your task plan. action=write replaces the list; action=read shows it.",
   {"action": {"type": "string", "enum": ["write", "read"]}, "todos": {"type": "array", "items": {"type": "object", "properties": {"content": S("task"), "status": {"type": "string", "enum": ["pending", "in_progress", "completed", "cancelled"]}}}}}, ["action"], "planning", "slm")
def todo_list(a, ctx):
    key = "todo:" + ctx.sid
    if a.get("action") == "write":
        todos = [{"id": str(i + 1), "content": t.get("content", ""), "status": t.get("status", "pending")} for i, t in enumerate(a.get("todos") or [])]
        ctx.agent.state.set_meta(key, todos)
        ctx.agent.emit(ctx.sid, {"type": "todo", "todos": todos})
    todos = ctx.agent.state.get_meta(key) or []
    icon = {"pending": "[ ]", "in_progress": "[~]", "completed": "[x]", "cancelled": "[-]"}
    return "\n".join("%s %s" % (icon.get(t["status"], "[ ]"), t["content"]) for t in todos) or "Todo list is empty."


@T("memory", "Persistent memory across sessions. target=user for user facts, target=memory for your notes. Actions: add, replace, remove, view.",
   {"action": {"type": "string", "enum": ["add", "replace", "remove", "view"]}, "target": {"type": "string", "enum": ["memory", "user"]}, "content": S("text"), "old_text": S("entry to replace/remove")}, ["action"], "memory", "slm")
def memory(a, ctx):
    return ctx.agent.memory_op(a.get("action"), "user" if a.get("target") == "user" else "memory", a.get("content", ""), a.get("old_text", ""))


@T("skills_list", "List available skills.", {"query": S("filter")}, [], "skills")
def skills_list(a, ctx):
    q = (a.get("query") or "").lower()
    return "\n".join("%s: %s" % (s["name"], s["description"]) for s in ctx.agent.skills() if q in (s["name"] + s["description"]).lower()) or "no skills"


@T("skill_view", "Load a skill's full instructions before a task it covers.", {"name": S("skill name")}, ["name"], "skills", "slm")
def skill_view(a, ctx):
    for s in ctx.agent.skills():
        if s["name"] == a["name"]:
            with open(s["path"], encoding="utf-8") as f:
                return f.read()
    return "no skill named %s" % a["name"]


@T("skill_manage", "Save a reusable procedure as a skill after a complex task.", {"action": {"type": "string", "enum": ["create"]}, "name": S("lowercase-dash-name"), "description": S("what + when"), "content": S("markdown body")}, ["action", "name", "description", "content"], "skills")
def skill_manage(a, ctx):
    name = re.sub(r"[^a-z0-9-]+", "-", a["name"].lower()).strip("-")[:64]
    d = os.path.join(ctx.agent.home, "skills", "learned", name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "SKILL.md"), "w", encoding="utf-8") as f:
        f.write("---\nname: %s\ndescription: %s\nversion: 1.0.0\n---\n\n%s\n" % (name, json.dumps(a["description"]), a["content"].strip()))
    return "Created skill %s" % name


@T("session_search", "Search past conversations by keywords.", {"query": S("keywords"), "limit": I("max hits")}, ["query"], "memory")
def session_search(a, ctx):
    hits = ctx.agent.state.search(a["query"], min(int(a.get("limit") or 8), 30))
    return "\n".join("session %s \"%s\" (%s): %s" % (h["session_id"], h.get("title") or "", h["role"], (h["snippet"] or "").replace("\n", " ")) for h in hits) or "no matches"


@T("execute_code", "Run a Python script and return its output.", {"code": S("python source"), "timeout": I("seconds")}, ["code"], "code")
def execute_code(a, ctx):
    r = subprocess.run([sys.executable, "-c", a["code"]], cwd=ctx.cwd, capture_output=True, text=True, timeout=min(int(a.get("timeout") or 300), 1800))
    return "exit code: %d\n%s" % (r.returncode, (r.stdout + r.stderr).strip()[:30000] or "(no output)")


TIERS = {"slm": 0, "standard": 1, "full": 2}


def active_tools(profile, disabled):
    rank = TIERS.get(profile, 1)
    return [fn for n, fn in sorted(REGISTRY.items()) if TIERS.get(fn.tier, 1) <= rank and n not in disabled]

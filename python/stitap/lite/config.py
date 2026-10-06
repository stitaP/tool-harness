"""Config compatible with the Node core: ~/.stitap/config.yaml + .env + admin policy."""
import copy
import os
import platform

from . import yamlmini

DEFAULTS = {
    "model": {"provider": "openai", "base_url": "http://localhost:11434/v1", "name": "qwen2.5:7b-instruct",
              "api_key_env": "OPENAI_API_KEY", "tool_mode": "auto", "context_window": 32768,
              "max_output_tokens": 4096, "temperature": 0.3},
    "aux": {},
    "agent": {"max_iterations": 60, "tool_profile": "standard", "max_tool_output_chars": 12000, "memory_nudge_every": 8, "personality": ""},
    "compression": {"enabled": True, "threshold": 0.6, "keep_last": 8},
    "goals": {"max_turns": 20},
    "terminal": {"timeout": 120},
    "approvals": {"mode": "ask", "allow_patterns": []},
    "memory": {"memory_chars": 2200, "user_chars": 1375},
    "web": {"search_provider": "duckduckgo", "searxng_url": "", "allow_private": False},
    "server": {"host": "127.0.0.1", "port": 7420},
    "tools": {"disabled": []},
    "security": {"blocked_paths": ["~/.ssh", "~/.aws", "~/.gnupg"]},
}


def home_dir(profile=None):
    if os.environ.get("STITAP_HOME") and not profile:
        return os.environ["STITAP_HOME"]
    root = os.environ.get("STITAP_ROOT") or os.path.join(os.path.expanduser("~"), ".stitap")
    return root if not profile or profile == "default" else os.path.join(root, "profiles", profile)


def policy_path():
    if os.environ.get("STITAP_POLICY_FILE"):
        return os.environ["STITAP_POLICY_FILE"]
    s = platform.system()
    if s == "Windows":
        return os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "stitap", "policy.yaml")
    if s == "Darwin":
        return "/Library/Application Support/stitap/policy.yaml"
    return "/etc/stitap/policy.yaml"


def _merge(base, over):
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def _set_path(d, path, value):
    keys = path.split(".")
    for k in keys[:-1]:
        d = d.setdefault(k, {})
    d[keys[-1]] = value


def parse_env(text):
    out = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.replace("export ", "").strip()
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        out[k] = v
    return out


class Config:
    def __init__(self, home):
        self.home = home
        for d in ("", "logs", "memories", "skills", "spill"):
            os.makedirs(os.path.join(home, d), exist_ok=True)
        self.path = os.path.join(home, "config.yaml")
        self.reload()

    def reload(self):
        user = {}
        if os.path.exists(self.path):
            with open(self.path, encoding="utf-8") as f:
                user = yamlmini.load(f.read()) or {}
        self.data = _merge(DEFAULTS, user)
        envp = os.path.join(self.home, ".env")
        self.env = parse_env(open(envp, encoding="utf-8").read()) if os.path.exists(envp) else {}
        self.policy = None
        pp = policy_path()
        if os.path.exists(pp):
            try:
                self.policy = yamlmini.load(open(pp, encoding="utf-8").read())
                for k, v in (self.policy.get("enforce") or {}).items():
                    _set_path(self.data, k, v)
            except Exception:
                self.policy = None

    def secret(self, name):
        if not name:
            return None
        return os.environ.get(name) or self.env.get(name)

    def get(self, path):
        d = self.data
        for k in path.split("."):
            if not isinstance(d, dict):
                return None
            d = d.get(k)
        return d

    def set(self, path, value):
        if self.policy and path in (self.policy.get("enforce") or {}):
            raise ValueError("%s is enforced by the administrator policy" % path)
        user = yamlmini.load(open(self.path, encoding="utf-8").read()) if os.path.exists(self.path) else {}
        _set_path(user, path, value)
        with open(self.path, "w", encoding="utf-8") as f:
            f.write(yamlmini.dump(user) + "\n")
        self.reload()

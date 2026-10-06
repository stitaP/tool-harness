"""Pick the best available engine and run it with the user's arguments.

Order:
  1. STITAP_ENGINE=lite|node|binary (explicit choice)
  2. a bundled single-executable binary (stitap/_bin/stitap[.exe]) — no Node needed
  3. Node.js >= 20.3 on PATH + the bundled single-file engine (stitap/_bundle/stitap.cjs)
  4. the pure-Python lite core (stitap.lite) — stdlib only
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE_DIR = os.path.join(HERE, "_bundle")
BIN_DIR = os.path.join(HERE, "_bin")


def _binary():
    name = "stitap.exe" if os.name == "nt" else "stitap"
    p = os.path.join(BIN_DIR, name)
    return p if os.path.isfile(p) else None


def _node():
    node = shutil.which("node")
    if not node:
        return None
    try:
        out = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=10).stdout.strip().lstrip("v")
        major, minor = (int(x) for x in out.split(".")[:2])
        if major > 20 or (major == 20 and minor >= 3):
            return node
    except Exception:
        return None
    return None


def _bundle():
    p = os.path.join(BUNDLE_DIR, "stitap.cjs")
    if os.path.isfile(p):
        return p
    # source checkout: python/ next to agent/
    repo = os.path.abspath(os.path.join(HERE, "..", "..", "agent", "bin", "harness.mjs"))
    return repo if os.path.isfile(repo) and os.path.isdir(os.path.join(os.path.dirname(repo), "..", "dist")) else None


def engine_choice():
    forced = os.environ.get("STITAP_ENGINE", "").lower()
    b, n, j = _binary(), _node(), _bundle()
    if forced == "lite":
        return ("lite", None)
    if forced == "binary" and b:
        return ("binary", [b])
    if forced == "node" and n and j:
        return ("node", [n, j])
    if b:
        return ("binary", [b])
    if n and j:
        return ("node", [n, j])
    return ("lite", None)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    kind, cmd = engine_choice()
    if argv[:1] == ["engine"]:
        print(kind)
        return 0
    if kind == "lite":
        from .lite.cli import main as lite_main
        return lite_main(argv)
    env = dict(os.environ)
    if os.path.isdir(os.path.join(BUNDLE_DIR, "ui")):
        env.setdefault("STITAP_RESOURCES", BUNDLE_DIR)
    try:
        return subprocess.call(cmd + argv, env=env)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())

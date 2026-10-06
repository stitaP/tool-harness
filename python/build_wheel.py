"""Build the stitap-harness wheel.

  python build_wheel.py                 # pure wheel: bundled JS engine (uses system Node 20+) + lite core
  python build_wheel.py --with-binary   # platform wheel: also embeds the Node single executable (no Node needed)

Run `npm run build:bundle` (and `npm run build:sea` for --with-binary) in ../agent first.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
AGENT = os.path.join(HERE, "..", "agent")
PKG = os.path.join(HERE, "stitap")


def main():
    with_bin = "--with-binary" in sys.argv
    for d in ("_bundle", "_bin", "build", "stitap_harness.egg-info"):
        shutil.rmtree(os.path.join(PKG if d.startswith("_") else HERE, d), ignore_errors=True)
    bundle = os.path.join(AGENT, "dist-bundle")
    if not os.path.isfile(os.path.join(bundle, "stitap.cjs")):
        sys.exit("missing ../agent/dist-bundle/stitap.cjs — run `npm run build:bundle` in agent/")
    shutil.copytree(bundle, os.path.join(PKG, "_bundle"))
    if with_bin:
        name = "stitap.exe" if os.name == "nt" else "stitap"
        src = os.path.join(AGENT, "dist-sea", name)
        if not os.path.isfile(src):
            sys.exit("missing ../agent/dist-sea/%s — run `npm run build:sea` in agent/" % name)
        os.makedirs(os.path.join(PKG, "_bin"))
        shutil.copy2(src, os.path.join(PKG, "_bin", name))
    subprocess.check_call([sys.executable, "-m", "pip", "wheel", HERE, "-w", os.path.join(HERE, "dist"), "--no-deps"])
    for d in ("_bundle", "_bin"):
        shutil.rmtree(os.path.join(PKG, d), ignore_errors=True)
    if with_bin:
        retag(os.path.join(HERE, "dist"))
    print("wheel(s) in", os.path.join(HERE, "dist"))


def retag(dist):
    """The binary doesn't depend on the Python ABI: cpXY-cpXY-plat → py3-none-plat."""
    import re
    import zipfile
    for f in os.listdir(dist):
        m = re.match(r"(stitap_harness-[^-]+)-(cp\d+)-(cp\d+\w*)-(.+)\.whl$", f)
        if not m:
            continue
        plat = m.group(4)
        if plat.startswith("linux_"):
            plat = "manylinux2014_" + plat[len("linux_"):]
        new = "%s-py3-none-%s.whl" % (m.group(1), plat)
        src, dst = os.path.join(dist, f), os.path.join(dist, new)
        with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
            records, wheel_data = {}, b""
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename.endswith(".dist-info/WHEEL"):
                    data = re.sub(rb"Tag: .*", ("Tag: py3-none-%s" % plat).encode(), data)
                    data = data.replace(b"Root-Is-Purelib: false", b"Root-Is-Purelib: true")
                    wheel_data = data
                if item.filename.endswith(".dist-info/RECORD"):
                    records[item] = data
                    continue
                zout.writestr(item, data)
            for item, data in records.items():
                import base64, hashlib
                lines = []
                for line in data.decode().splitlines():
                    name = line.split(",")[0]
                    if name.endswith(".dist-info/WHEEL"):
                        w = wheel_data
                        line = "%s,sha256=%s,%d" % (name, base64.urlsafe_b64encode(hashlib.sha256(w).digest()).rstrip(b"=").decode(), len(w))
                    lines.append(line)
                zout.writestr(item, "\n".join(lines) + "\n")
        os.remove(src)
        print("retagged", new)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Rewrite a MoE GGUF so all non-expert tensors come first and the *_exps tensors after them.

Why: llama.cpp maps ONE contiguous file range per backend buffer (first..last tensor of that buffer).
With `--cpu-moe`, the Metal buffer holds attention/shared/embedding weights, which in the original
file are interleaved with the experts of all layers — so Metal maps (and wires) almost the whole
23 GB file and fails with kIOGPUCommandBufferCallbackErrorOutOfMemory on a 16 GB Mac. After this
reorder the Metal range is just the ~1.6 GB of non-expert weights. Weights and metadata are copied
byte-for-byte; only the order of tensors in the file changes.

  python gguf_reorder.py IN.gguf OUT.gguf            (streams tensor by tensor; needs free disk = model size)
  python gguf_reorder.py --verify IN.gguf OUT.gguf   (compares every tensor's bytes)
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
import time

import numpy as np

EXPS = re.compile(r"\.ffn_[a-z_]+_exps\.")


def order(names: list[str], reverse_test: bool = False) -> list[int]:
    idx = list(range(len(names)))
    if reverse_test:                     # only for testing on dense models: any order llama.cpp must accept
        return idx[::-1]
    return [i for i in idx if not EXPS.search(names[i])] + [i for i in idx if EXPS.search(names[i])]


def reorder(src: str, dst: str, reverse_test: bool = False) -> None:
    import gguf
    r = gguf.GGUFReader(src, "r")
    arch = r.fields["general.architecture"]
    arch = bytes(arch.parts[arch.data[0]]).decode()
    w = gguf.GGUFWriter(dst, arch=arch, endianess=r.endianess)
    for field in r.fields.values():
        if field.name == gguf.Keys.General.ARCHITECTURE or field.name.startswith("GGUF."):
            continue
        vt = field.types[0]
        sub = field.types[-1] if vt == gguf.GGUFValueType.ARRAY else None
        val = field.contents()
        if field.name == "general.alignment":
            w.data_alignment = int(val)
        w.add_key_value(field.name, val, vt, sub_type=sub)
    names = [t.name for t in r.tensors]
    ix = order(names, reverse_test)
    total = sum(int(r.tensors[i].n_bytes) for i in ix)
    for i in ix:
        t = r.tensors[i]
        w.add_tensor_info(t.name, t.data.shape, t.data.dtype, t.data.nbytes, t.tensor_type)
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_ti_data_to_file()
    done, t0, last = 0, time.time(), 0.0
    for i in ix:
        t = r.tensors[i]
        w.write_tensor_data(t.data, tensor_endianess=r.endianess)
        done += int(t.n_bytes)
        if time.time() - last > 5:
            last = time.time()
            print(f"  {done/2**30:6.2f} / {total/2**30:.2f} GB  ({done/max(1e-9, last-t0)/2**20:.0f} MB/s)", flush=True)
    w.close()
    non = sum(int(t.n_bytes) for t in r.tensors if not EXPS.search(t.name))
    print(f"done in {time.time()-t0:.0f} s: {len(ix)} tensors; non-expert block = {non/2**30:.2f} GB at the start")


def digest(a: np.ndarray) -> str:
    return hashlib.blake2b(memoryview(np.ascontiguousarray(a)).cast("B"), digest_size=16).hexdigest()


def verify(src: str, dst: str) -> bool:
    import gguf
    a, b = gguf.GGUFReader(src, "r"), gguf.GGUFReader(dst, "r")
    tb = {t.name: t for t in b.tensors}
    ok = len(a.tensors) == len(b.tensors)
    for t in a.tensors:
        u = tb.get(t.name)
        if u is None or u.tensor_type != t.tensor_type or list(u.shape) != list(t.shape) or digest(t.data) != digest(u.data):
            print("MISMATCH", t.name); ok = False
    fa = {f.name: f.contents() for f in a.fields.values() if not f.name.startswith("GGUF.")}
    fb = {f.name: f.contents() for f in b.fields.values() if not f.name.startswith("GGUF.")}
    if fa != fb:
        print("metadata differs:", sorted(set(fa) ^ set(fb)) or [k for k in fa if fa[k] != fb.get(k)][:5]); ok = False
    print("verify:", "OK — identical tensors and metadata" if ok else "FAILED")
    return ok


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--reverse-test", action="store_true", help=argparse.SUPPRESS)
    a = ap.parse_args()
    if a.verify:
        sys.exit(0 if verify(a.src, a.dst) else 1)
    reorder(a.src, a.dst, a.reverse_test)

#!/usr/bin/env python3
"""ggufcache — expert cache + prefetcher for llama.cpp MoE GGUF models that are larger than RAM.

Runs NEXT TO an unmodified llama-server that loads the GGUF with mmap and `--cpu-moe`
(expert weights stay in the memory-mapped file; attention/shared weights go to Metal).
Both processes map the same file, so they share the same page cache: whatever this daemon
keeps in RAM is RAM llama-server does not have to fault in from the SSD.

What it does
  cache     Learns which (layer, expert) slices are used and pins the hottest ones in RAM with
            mlock, within a memory budget (LFU with decay, re-planned every 30 s, hysteresis).
  prefetch  Polls page residency (mincore). When llama-server starts faulting in an expert
            (a few 16 KB pages appear), the daemon reads that expert's WHOLE gate/up/down slices
            in large parallel reads, instead of llama's page-by-page faults.
  profile   Scores are saved (profile JSON) and the hot set is read in at start-up, so the next
            session starts warm.

Commands
  python ggufcache.py inspect  MODEL.gguf
  python ggufcache.py run      MODEL.gguf [--budget-gb 4] [--profile p.json]   (daemon, Ctrl-C to stop)
  python ggufcache.py bench    [--url http://127.0.0.1:8081] [--tokens 200]
  python ggufcache.py status   [--state ggufcache-state.json]

MODEL may be the first shard of a split GGUF (…-00001-of-0000N.gguf); the other shards are found.
"""
from __future__ import annotations

import argparse
import ctypes
import ctypes.util
import glob
import json
import os
import re
import signal
import sys
import threading
import time
import urllib.request
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

PROT_READ, MAP_SHARED = 1, 1
PAGE = os.sysconf("SC_PAGE_SIZE")
EXPS_RE = re.compile(r"^blk\.(\d+)\.ffn_([a-z_]+?)_exps\.weight$")
GiB = 1024 ** 3

_libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
_libc.mmap.restype = ctypes.c_void_p
_libc.mmap.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_long]
_libc.munmap.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
for _f in ("mlock", "munlock"):
    getattr(_libc, _f).argtypes = [ctypes.c_void_p, ctypes.c_size_t]
_libc.mincore.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p]


# ---------------------------------------------------------------- model layout
@dataclass
class Piece:            # one expert's bytes inside one *_exps tensor
    shard: int
    off: int            # absolute file offset
    size: int
    p0: int = 0         # first page index (inclusive)
    p1: int = 0         # last page index (exclusive)


@dataclass
class Unit:             # one (layer, expert): its gate/up/down pieces
    layer: int
    expert: int
    pieces: list[Piece] = field(default_factory=list)

    @property
    def size(self) -> int:
        return sum(p.size for p in self.pieces)

    @property
    def key(self) -> str:
        return f"{self.layer}:{self.expert}"


def shard_paths(model: str) -> list[Path]:
    p = Path(model).expanduser()
    m = re.match(r"(.*)-(\d{5})-of-(\d{5})\.gguf$", p.name)
    if not m:
        return [p]
    return sorted(Path(x) for x in glob.glob(str(p.parent / f"{m.group(1)}-*-of-{m.group(3)}.gguf")))


def read_layout(model: str):
    """Return (shards, units, other_bytes, info) from the GGUF headers (no tensor data is read)."""
    from gguf import GGUFReader

    shards = shard_paths(model)
    units: dict[tuple[int, int], Unit] = {}
    other = 0
    info = {"arch": "?", "shards": [str(s) for s in shards], "types": set()}
    for si, path in enumerate(shards):
        try:
            r = GGUFReader(str(path), "r")
        except (ValueError, IndexError) as e:
            raise SystemExit(f"{path.name} is incomplete or unreadable ({e}) — is the download finished?")
        f = r.fields.get("general.architecture")
        if f is not None:
            info["arch"] = bytes(f.parts[f.data[0]]).decode()
        size = path.stat().st_size
        for t in r.tensors:
            end = int(t.data_offset) + int(t.n_bytes)
            if end > size:
                raise SystemExit(f"{path.name} is incomplete ({size/GiB:.1f} GB on disk, header needs {end/GiB:.1f} GB) — "
                                 "is the download finished?")
            m = EXPS_RE.match(t.name)
            if not m:
                other += int(t.n_bytes)
                continue
            layer = int(m.group(1))
            n_exp = int(t.shape[-1])            # ne[2] = n_expert (outermost: each expert is contiguous)
            per = int(t.n_bytes) // n_exp
            info["types"].add(t.tensor_type.name)
            for e in range(n_exp):
                u = units.setdefault((layer, e), Unit(layer, e))
                u.pieces.append(Piece(si, int(t.data_offset) + e * per, per))
        del r
    info["types"] = sorted(info["types"])
    ordered = [units[k] for k in sorted(units)]
    return shards, ordered, other, info


# ---------------------------------------------------------------- mapped file
class Mapped:
    def __init__(self, path: Path):
        self.path = path
        self.fd = os.open(path, os.O_RDONLY)
        self.size = os.fstat(self.fd).st_size
        addr = _libc.mmap(None, self.size, PROT_READ, MAP_SHARED, self.fd, 0)
        if addr in (None, ctypes.c_void_p(-1).value):
            raise OSError(ctypes.get_errno(), f"mmap failed for {path}")
        self.addr = addr
        self.pages = (self.size + PAGE - 1) // PAGE
        self.vec = (ctypes.c_ubyte * self.pages)()

    def residency(self) -> np.ndarray:
        if _libc.mincore(self.addr, self.size, self.vec) != 0:
            raise OSError(ctypes.get_errno(), "mincore failed")
        return (np.frombuffer(self.vec, dtype=np.uint8) & 1).astype(np.int32)

    def lock(self, off: int, size: int, on: bool) -> int:
        a = off // PAGE * PAGE
        n = (off + size + PAGE - 1) // PAGE * PAGE - a
        fn = _libc.mlock if on else _libc.munlock
        return 0 if fn(self.addr + a, n) == 0 else ctypes.get_errno()

    def read(self, off: int, size: int, chunk: int = 4 << 20) -> int:
        done = 0
        while done < size:
            n = min(chunk, size - done)
            got = len(os.pread(self.fd, n, off + done))
            if got <= 0:
                break
            done += got
        return done

    def close(self):
        _libc.munmap(self.addr, self.size)
        os.close(self.fd)


# ---------------------------------------------------------------- the cache
class ExpertCache:
    def __init__(self, model: str, budget_gb: float, profile: str | None, decay: float = 0.98,
                 io_threads: int = 6, lock: bool = True, log=print):
        self.shards, self.units, self.other_bytes, self.info = read_layout(model)
        if not self.units:
            raise SystemExit("no *_exps expert tensors found — is this a MoE GGUF?")
        self.maps = [Mapped(p) for p in self.shards]
        for u in self.units:
            for pc in u.pieces:
                pc.p0, pc.p1 = pc.off // PAGE, (pc.off + pc.size + PAGE - 1) // PAGE
        self.n = len(self.units)
        self.index = {u.key: i for i, u in enumerate(self.units)}
        self.sizes = np.array([u.size for u in self.units], dtype=np.int64)
        self.budget = int(budget_gb * GiB)
        self.decay = decay
        self.lock_enabled = lock
        self.log = log
        self.scores = np.zeros(self.n, dtype=np.float64)
        self.pinned = np.zeros(self.n, dtype=bool)
        self.prev_frac = np.zeros(self.n, dtype=np.float64)
        self.profile_path = profile
        if profile and Path(profile).exists():
            data = json.loads(Path(profile).read_text())
            for k, v in data.get("scores", {}).items():
                if k in self.index:
                    self.scores[self.index[k]] = float(v)
            self.log(f"profile: loaded {len(data.get('scores', {}))} expert scores from {profile}")
        # stats
        self.misses = 0
        self.prefetched_bytes = 0
        self.lock_errors = 0
        self.samples = 0
        self.t0 = time.time()
        self.events = deque(maxlen=600)      # (time, misses in sample)
        # prefetch queue
        self.q: deque[int] = deque()
        self.queued = np.zeros(self.n, dtype=bool)
        self.cv = threading.Condition()
        self.stop = threading.Event()
        self.workers = [threading.Thread(target=self._worker, daemon=True) for _ in range(io_threads)]
        for w in self.workers:
            w.start()

    # -- residency ---------------------------------------------------------
    def fractions(self) -> np.ndarray:
        cums = []
        for m in self.maps:
            r = m.residency()
            c = np.zeros(len(r) + 1, dtype=np.int64)
            np.cumsum(r, out=c[1:])
            cums.append(c)
        frac = np.empty(self.n)
        for i, u in enumerate(self.units):
            res = tot = 0
            for pc in u.pieces:
                c = cums[pc.shard]
                res += c[pc.p1] - c[pc.p0]
                tot += pc.p1 - pc.p0
            frac[i] = res / tot
        return frac

    def sample(self) -> int:
        """One polling step: detect experts llama-server just started faulting in; queue them."""
        frac = self.fractions()
        grew = (frac > self.prev_frac + 1e-9) & ~self.pinned
        started = grew & (frac < 0.999)               # partially in → being faulted in right now
        new_in = grew & (self.prev_frac < 0.05)       # was (nearly) absent → a cache miss
        idx = np.nonzero(new_in)[0]
        self.scores[idx] += 1.0
        for i in np.nonzero(started)[0]:
            self.enqueue(int(i))
        self.prev_frac = frac
        self.misses += len(idx)
        self.samples += 1
        self.events.append((time.time(), len(idx)))
        return len(idx)

    # -- prefetch ------------------------------------------------------------
    def enqueue(self, i: int, front: bool = True):
        with self.cv:
            if self.queued[i]:
                return
            self.queued[i] = True
            (self.q.appendleft if front else self.q.append)(i)
            self.cv.notify()

    def _worker(self):
        while not self.stop.is_set():
            with self.cv:
                while not self.q and not self.stop.is_set():
                    self.cv.wait(0.5)
                if self.stop.is_set():
                    return
                i = self.q.popleft()
            u = self.units[i]
            for pc in u.pieces:
                self.prefetched_bytes += self.maps[pc.shard].read(pc.off, pc.size)
            with self.cv:
                self.queued[i] = False

    def drain(self, timeout: float = 600):
        t = time.time()
        while time.time() - t < timeout:
            with self.cv:
                if not self.q and not self.queued.any():
                    return True
            time.sleep(0.05)
        return False

    # -- pinning -------------------------------------------------------------
    def plan(self) -> np.ndarray:
        """Hottest units that fit the budget (hysteresis: pinned units get a 10% bonus)."""
        eff = self.scores * np.where(self.pinned, 1.10, 1.0)
        order = np.argsort(-eff, kind="stable")
        keep = np.zeros(self.n, dtype=bool)
        used = 0
        for i in order:
            if eff[i] <= 0:
                break
            if used + self.sizes[i] > self.budget:
                continue
            keep[i] = True
            used += self.sizes[i]
        return keep

    def apply(self, keep: np.ndarray, warm: bool = True):
        add = np.nonzero(keep & ~self.pinned)[0]
        drop = np.nonzero(self.pinned & ~keep)[0]
        for i in drop:
            for pc in self.units[i].pieces:
                self.maps[pc.shard].lock(pc.off, pc.size, False)
        if warm:
            for i in add:
                self.enqueue(int(i), front=False)
            self.drain()
        for i in add:
            ok = True
            if self.lock_enabled:
                for pc in self.units[i].pieces:
                    err = self.maps[pc.shard].lock(pc.off, pc.size, True)
                    if err:
                        ok = False
                        self.lock_errors += 1
                        if self.lock_errors == 1:
                            self.log(f"mlock failed ({os.strerror(err)}): continuing with read-ahead only "
                                     "(raise the limit with `ulimit -l unlimited`)")
                        self.lock_enabled = False
                        break
            self.pinned[i] = ok or not self.lock_enabled
        self.pinned[drop] = False
        return len(add), len(drop)

    def replan(self):
        self.scores *= self.decay
        return self.apply(self.plan())

    # -- persistence / reporting --------------------------------------------
    def save_profile(self):
        if not self.profile_path:
            return
        nz = np.nonzero(self.scores > 1e-3)[0]
        data = {"model": self.info["shards"][0], "arch": self.info["arch"], "saved": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "scores": {self.units[i].key: round(float(self.scores[i]), 3) for i in nz}}
        tmp = Path(self.profile_path + ".tmp")
        tmp.write_text(json.dumps(data))
        tmp.replace(self.profile_path)

    def state(self) -> dict:
        now = time.time()
        recent = [m for t, m in self.events if now - t <= 60]
        frac = self.prev_frac
        return {
            "time": time.strftime("%H:%M:%S"),
            "uptime_s": round(now - self.t0),
            "experts": self.n,
            "expert_gb": round(float(self.sizes.sum()) / GiB, 2),
            "pinned_experts": int(self.pinned.sum()),
            "pinned_gb": round(float(self.sizes[self.pinned].sum()) / GiB, 2),
            "budget_gb": round(self.budget / GiB, 2),
            "resident_gb": round(float((frac * self.sizes).sum()) / GiB, 2),
            "misses_total": int(self.misses),
            "misses_last_min": int(sum(recent)),
            "prefetched_gb": round(self.prefetched_bytes / GiB, 2),
            "mlock": self.lock_enabled,
        }

    def close(self):
        self.stop.set()
        with self.cv:
            self.cv.notify_all()
        for m in self.maps:
            m.close()


# ---------------------------------------------------------------- commands
def cmd_inspect(a):
    shards, units, other, info = read_layout(a.model)
    exp = sum(u.size for u in units)
    layers = len({u.layer for u in units})
    per_layer = len(units) // max(layers, 1)
    print(f"model:      {', '.join(Path(s).name for s in info['shards'])}")
    print(f"arch:       {info['arch']}   expert tensor types: {', '.join(info['types'])}")
    print(f"experts:    {layers} layers x {per_layer} experts = {len(units)} slices, "
          f"{units[0].size/1024**2:.2f} MB each")
    print(f"expert weights: {exp/GiB:.2f} GB (stay in the mmapped file, CPU side with --cpu-moe)")
    print(f"other weights:  {other/GiB:.2f} GB (attention, shared experts, embeddings → Metal)")
    for b in (2, 3, 4, 5, 6):
        k = min(len(units), int(b * GiB // units[0].size))
        print(f"  pin budget {b} GB → {k} slices ({100*k/len(units):.0f}% of experts)")


def cmd_run(a):
    stop = threading.Event()
    log = lambda *x: print(time.strftime("%H:%M:%S"), *x, flush=True)
    c = ExpertCache(a.model, a.budget_gb, a.profile, decay=a.decay, io_threads=a.io_threads, lock=not a.no_lock, log=log)
    s = c.state()
    log(f"{c.info['arch']}: {s['experts']} expert slices, {s['expert_gb']} GB; budget {s['budget_gb']} GB; "
        f"page {PAGE//1024} KB; poll {a.poll*1000:.0f} ms")
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    if c.scores.any():
        t = time.time()
        added, _ = c.apply(c.plan())
        log(f"warm start: read + pinned {added} hot experts ({c.state()['pinned_gb']} GB) in {time.time()-t:.1f} s")
    c.prev_frac = c.fractions()
    Path(a.state).write_text(json.dumps({**c.state(), "ready": True}))
    log("ready — start llama-server now (or it is already running)")
    last_plan = last_save = last_state = time.time()
    while not stop.is_set():
        t = time.time()
        c.sample()
        if t - last_plan >= a.replan:
            added, dropped = c.replan()
            if added or dropped:
                log(f"re-plan: +{added} -{dropped} pinned → {c.state()['pinned_gb']} GB")
            last_plan = t
        if t - last_state >= 5:
            Path(a.state).write_text(json.dumps({**c.state(), "ready": True}))
            last_state = t
        if t - last_save >= 60:
            c.save_profile()
            last_save = t
        stop.wait(max(0.0, a.poll - (time.time() - t)))
    c.save_profile()
    st = c.state()
    log(f"stopped. misses {st['misses_total']}, prefetched {st['prefetched_gb']} GB, profile → {a.profile}")
    c.close()


CODING_PROMPTS = [
    "Write a Python function that parses a CSV file and returns a list of dicts, with type hints and error handling.",
    "In JavaScript, write a debounce(fn, ms) helper and show how to use it on a search input.",
    "Write a bash script that finds the 10 largest files under a directory and prints their sizes in MB.",
    "Write a TypeScript interface for an e-commerce order with line items, and a function computing the total with GST.",
    "Explain and optimise: SELECT * FROM orders o WHERE o.customer_id IN (SELECT id FROM customers WHERE city='Pune');",
]


def cmd_bench(a):
    rows = []
    for i, p in enumerate(CODING_PROMPTS[: a.prompts]):
        body = json.dumps({"prompt": f"<|im_start|>user\n{p}<|im_end|>\n<|im_start|>assistant\n",
                           "n_predict": a.tokens, "temperature": 0.2, "cache_prompt": False}).encode()
        req = urllib.request.Request(a.url.rstrip("/") + "/completion", data=body, headers={"Content-Type": "application/json"})
        t = time.time()
        with urllib.request.urlopen(req, timeout=3600) as r:
            out = json.loads(r.read())
        tm = out.get("timings", {})
        rows.append(tm)
        print(f"[{i+1}] prompt {tm.get('prompt_n')} tok @ {tm.get('prompt_per_second', 0):.1f} tok/s · "
              f"gen {tm.get('predicted_n')} tok @ {tm.get('predicted_per_second', 0):.2f} tok/s · {time.time()-t:.0f} s")
    if rows:
        gen = [r.get("predicted_per_second", 0) for r in rows]
        print(f"decode: mean {np.mean(gen):.2f} tok/s, best {max(gen):.2f} tok/s (later prompts benefit from the learned cache)")
        with open(Path(__file__).with_name("results.jsonl"), "a") as f:
            f.write(json.dumps({"kind": "gguf-bench", "time": time.strftime("%Y-%m-%dT%H:%M:%S"), "url": a.url,
                                "decode_mean": round(float(np.mean(gen)), 2), "decode_each": [round(g, 2) for g in gen]}) + "\n")


def cmd_status(a):
    p = Path(a.state)
    if not p.exists():
        raise SystemExit(f"{p} not found — is `ggufcache.py run` running?")
    for k, v in json.loads(p.read_text()).items():
        print(f"{k:>16}: {v}")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="ggufcache", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("inspect"); p.add_argument("model"); p.set_defaults(fn=cmd_inspect)
    p = sub.add_parser("run"); p.add_argument("model"); p.set_defaults(fn=cmd_run)
    p.add_argument("--budget-gb", type=float, default=4.0, help="RAM to pin hot experts in (default 4)")
    p.add_argument("--profile", default="gguf-profile.json")
    p.add_argument("--state", default="ggufcache-state.json")
    p.add_argument("--poll", type=float, default=0.05, help="residency poll interval, seconds")
    p.add_argument("--replan", type=float, default=30.0, help="seconds between pin re-plans")
    p.add_argument("--decay", type=float, default=0.98, help="score decay per re-plan")
    p.add_argument("--io-threads", type=int, default=6)
    p.add_argument("--no-lock", action="store_true", help="prefetch only; never mlock")
    p = sub.add_parser("bench"); p.set_defaults(fn=cmd_bench)
    p.add_argument("--url", default="http://127.0.0.1:8081"); p.add_argument("--tokens", type=int, default=200)
    p.add_argument("--prompts", type=int, default=len(CODING_PROMPTS))
    p = sub.add_parser("status"); p.add_argument("--state", default="ggufcache-state.json"); p.set_defaults(fn=cmd_status)
    a = ap.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""P0 — measure the machine before building SSD expert streaming.

Answers the questions the MoE-streaming plan rests on:
  1. How fast can this SSD deliver expert-sized blocks (~1.4 MB), cold, at each queue depth?
  2. What decode speed does that allow at a given expert-cache hit rate?
  3. How fast is unified memory (the compute ceiling), if MLX is installed?
  4. How much RAM can the GPU use (iogpu.wired_limit_mb) and how much disk is free?
  5. Optional baselines: llama.cpp (llama-bench) and mlx-moe on a real model.

Standard library only. Nothing is installed or downloaded, nothing needs sudo, and
the only write is a temporary test file that is deleted at the end (--keep to reuse it).

    python3 bench/moe-stream/p0_bench.py                    # ~2-4 minutes
    python3 bench/moe-stream/p0_bench.py --size-gb 8        # bigger test file
    python3 bench/moe-stream/p0_bench.py --gguf ~/Documents/GGUF/model.gguf
    python3 bench/moe-stream/p0_bench.py --mlx-moe mlx-community/Qwen3-Coder-Next-4bit

Results: bench/moe-stream/results/p0-<timestamp>.json and .md
"""
from __future__ import annotations

import argparse, json, os, platform, random, shutil, statistics, subprocess, sys, tempfile, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Qwen3-Coder-Next geometry (Qwen/Qwen3-Coder-Next model card)
LAYERS, EXPERTS, TOP_K, HIDDEN, EXPERT_FF = 48, 512, 10, 2048, 512
EXPERT_PARAMS = 3 * HIDDEN * EXPERT_FF               # gate, up, down ≈ 3.15M
NON_EXPERT_ACTIVE_PARAMS = 1.5e9                     # attention/DeltaNet, shared expert, router, lm_head
PAGE = 16384                                         # Apple Silicon page size; alignment for reads
IS_MAC = sys.platform == "darwin"
F_NOCACHE = 48                                       # macOS fcntl: bypass the unified buffer cache


def expert_bytes(bits: float) -> int:
    return int(EXPERT_PARAMS * bits / 8)


def sh(cmd: list[str], timeout: int = 30) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout.strip()
    except Exception:
        return ""


def gb(n: float) -> float:
    return round(n / 1e9, 2)


# ── 1. system ─────────────────────────────────────────────────────────────────
def system_info(test_dir: Path) -> dict:
    info = {"platform": platform.platform(), "python": sys.version.split()[0]}
    if IS_MAC:
        info.update(
            model=sh(["sysctl", "-n", "hw.model"]),
            chip=sh(["sysctl", "-n", "machdep.cpu.brand_string"]),
            ram_gb=gb(int(sh(["sysctl", "-n", "hw.memsize"]) or 0)),
            cpu_cores=sh(["sysctl", "-n", "hw.ncpu"]),
            gpu_wired_limit_mb=sh(["sysctl", "-n", "iogpu.wired_limit_mb"]) or "unknown",
            memory_pressure=(sh(["memory_pressure", "-Q"]).splitlines() or [""])[-1],
            ssd=sh(["bash", "-c", "system_profiler SPNVMeDataType 2>/dev/null | grep -E 'Model:|Capacity:' | head -2"], 60),
        )
    else:
        mem = Path("/proc/meminfo").read_text().split("\n")[0] if Path("/proc/meminfo").exists() else ""
        info.update(ram=mem, cpu_cores=os.cpu_count())
    du = shutil.disk_usage(test_dir)
    info["disk_free_gb"] = gb(du.free)
    return info


# ── 2. SSD ────────────────────────────────────────────────────────────────────
def open_uncached(path: Path, flags: int) -> int:
    fd = os.open(path, flags)
    if IS_MAC:
        import fcntl
        fcntl.fcntl(fd, F_NOCACHE, 1)
    return fd


def drop_cache(fd: int, size: int) -> None:
    if not IS_MAC and hasattr(os, "posix_fadvise"):
        os.posix_fadvise(fd, 0, size, os.POSIX_FADV_DONTNEED)


def make_test_file(path: Path, size: int) -> float:
    chunk = os.urandom(64 << 20)  # incompressible; reused, offsets differ so no dedup benefit
    fd = open_uncached(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC)
    t0 = time.perf_counter()
    written = 0
    try:
        while written < size:
            n = os.write(fd, chunk[: min(len(chunk), size - written)])
            written += n
        os.fsync(fd)
    finally:
        os.close(fd)
    return written / (time.perf_counter() - t0)


def seq_read(path: Path, size: int) -> float:
    fd = open_uncached(path, os.O_RDONLY)
    drop_cache(fd, size)
    t0, done = time.perf_counter(), 0
    try:
        while done < size:
            b = os.pread(fd, 8 << 20, done)
            if not b:
                break
            done += len(b)
    finally:
        os.close(fd)
    return done / (time.perf_counter() - t0)


COLD_BYTES = 0  # random reads stay in the first part of the file, written longest ago and evicted from cache


def random_reads(fd: int, size: int, block: int, n: int, threads: int) -> dict:
    span = ((COLD_BYTES or size) - block) // PAGE
    offsets = [random.randrange(span) * PAGE for _ in range(n)]
    lat: list[float] = []

    def one(off: int) -> int:
        t = time.perf_counter()
        got = len(os.pread(fd, block, off))
        lat.append(time.perf_counter() - t)
        return got

    t0 = time.perf_counter()
    with ThreadPoolExecutor(threads) as ex:
        total = sum(ex.map(one, offsets))
    dt = time.perf_counter() - t0
    lat.sort()
    return {"threads": threads, "GBps": round(total / dt / 1e9, 2),
            "p50_ms": round(lat[len(lat) // 2] * 1e3, 2), "p99_ms": round(lat[int(len(lat) * 0.99) - 1] * 1e3, 2)}


def ssd_bench(path: Path, size: int, block: int, reads: int) -> dict:
    fd = open_uncached(path, os.O_RDONLY)
    try:
        rows = []
        for qd in (1, 2, 4, 8, 16, 32):
            drop_cache(fd, size)
            rows.append(random_reads(fd, size, block, max(reads, qd * 8), qd))
            print(f"    QD{qd:<3} {rows[-1]['GBps']:>6.2f} GB/s   p50 {rows[-1]['p50_ms']} ms   p99 {rows[-1]['p99_ms']} ms")
        return {"block_bytes": block, "by_queue_depth": rows, "best": max(rows, key=lambda r: r["GBps"])}
    finally:
        os.close(fd)


def token_sim(path: Path, size: int, block: int, threads: int, tokens: int, hit_rates: list[float]) -> list[dict]:
    """Decode-step IO only: each token reads its cache misses for all 48 layers.
    Layers are sequential (layer N+1's experts depend on layer N), so each layer's
    misses are one parallel batch; this is the no-prefetch case (plan step 4 hides it)."""
    fd = open_uncached(path, os.O_RDONLY)
    out = []
    try:
        span = ((COLD_BYTES or size) - block) // PAGE
        with ThreadPoolExecutor(threads) as ex:
            for hit in hit_rates:
                misses_per_layer = TOP_K * (1 - hit)
                drop_cache(fd, size)
                t0 = time.perf_counter()
                carry = 0.0
                for _ in range(tokens):
                    for _ in range(LAYERS):
                        carry += misses_per_layer
                        k = int(carry)
                        carry -= k
                        if k:
                            list(ex.map(lambda o: os.pread(fd, block, o), [random.randrange(span) * PAGE for _ in range(k)]))
                per_tok = (time.perf_counter() - t0) / tokens
                out.append({"hit_rate": hit, "misses_per_token": round(misses_per_layer * LAYERS),
                            "io_ms_per_token": round(per_tok * 1e3, 1),
                            "io_bound_tok_s_layer_serial": round(1 / per_tok, 1) if per_tok else None})
                print(f"    hit {hit:>4.0%}  {out[-1]['misses_per_token']:>3} misses/token  {out[-1]['io_ms_per_token']:>7} ms  ->  {out[-1]['io_bound_tok_s_layer_serial']} tok/s")
    finally:
        os.close(fd)
    return out


# ── 3. memory bandwidth via MLX ───────────────────────────────────────────────
MLX_PROBE = r"""
import json, time, mlx.core as mx
n = 256 * 1024 * 1024            # 512 MB of float16
a = mx.ones((n,), dtype=mx.float16); mx.eval(a)
best = 0
for _ in range(8):
    t = time.perf_counter(); b = a * 1.0001; mx.eval(b); dt = time.perf_counter() - t
    best = max(best, 2 * a.nbytes / dt)
print(json.dumps({"mlx": mx.__version__ if hasattr(mx, "__version__") else "?", "GBps": round(best / 1e9, 1)}))
"""


def mlx_bandwidth() -> dict | None:
    for py in (sys.executable, "/opt/homebrew/bin/python3", "python3"):
        out = sh([py, "-c", MLX_PROBE], 120)
        if out.startswith("{"):
            r = json.loads(out); r["python"] = py
            return r
    return None


# ── 5. optional baselines ─────────────────────────────────────────────────────
def llama_bench(gguf: str) -> dict:
    exe = shutil.which("llama-bench")
    if not exe:
        return {"skipped": "llama-bench not on PATH (brew install llama.cpp)"}
    raw = sh([exe, "-m", os.path.expanduser(gguf), "-p", "128", "-n", "64", "-r", "2", "-o", "json"], 1800)
    try:
        return {"results": [{k: r.get(k) for k in ("model_type", "model_size", "n_prompt", "n_gen", "avg_ts")} for r in json.loads(raw)]}
    except Exception:
        return {"error": raw[-500:] or "llama-bench produced no output (model may not fit)"}


MLX_MOE_PROBE = r"""
import json, sys, time
from mlx_moe import generate
m = sys.argv[1]
generate(m, "def add(a, b):", max_tokens=8)               # warm-up: skeleton load + cache fill
t = time.perf_counter(); out = generate(m, "Write a Python function that parses a CSV file and returns rows as dicts.", max_tokens=128)
print(json.dumps({"seconds": round(time.perf_counter() - t, 2), "approx_tok_s_incl_prefill": round(128 / (time.perf_counter() - t), 2), "sample": str(out)[:160]}))
"""


def mlx_moe(model: str) -> dict:
    for py in (sys.executable, "/opt/homebrew/bin/python3", "python3"):
        if sh([py, "-c", "import mlx_moe; print('ok')"]) == "ok":
            out = sh([py, "-c", MLX_MOE_PROBE, model], 3600)
            return json.loads(out) if out.startswith("{") else {"error": out[-500:] or "no output"}
    return {"skipped": "mlx-moe not installed (git clone https://github.com/mu-hashmi/mlx-moe && pip install .)"}


# ── report ────────────────────────────────────────────────────────────────────
def needed_hit_rate(target_tok_s: float, gbps: float, block: int) -> float:
    allowed = (gbps * 1e9 / target_tok_s) / block          # misses per token the SSD can serve
    return max(0.0, 1 - allowed / (TOP_K * LAYERS))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=None, help="where to put the test file (must be on the SSD you will stream from)")
    ap.add_argument("--size-gb", type=float, default=0,
                    help="test file size; default 2x RAM (capped by free disk) so macOS cannot keep it in RAM cache")
    ap.add_argument("--bits", type=float, default=3.5, help="effective bits per expert weight incl. scales (3-bit quant ≈ 3.5)")
    ap.add_argument("--reads", type=int, default=400, help="random reads per queue depth")
    ap.add_argument("--tokens", type=int, default=20, help="simulated decode tokens per hit rate")
    ap.add_argument("--gguf", help="run llama-bench on this GGUF")
    ap.add_argument("--mlx-moe", help="run mlx-moe on this model id/path (must already be downloaded)")
    ap.add_argument("--keep", action="store_true", help="keep the test file")
    a = ap.parse_args()

    here = Path(__file__).resolve().parent
    test_dir = Path(a.dir).expanduser() if a.dir else Path(tempfile.gettempdir())
    test_dir.mkdir(parents=True, exist_ok=True)
    block = expert_bytes(a.bits)
    test_file = test_dir / "p0-ssd-testfile.bin"

    print("P0 · machine measurements for MoE SSD streaming\n")
    sysinfo = system_info(test_dir)
    for k, v in sysinfo.items():
        print(f"  {k:<20} {v}")
    ram_gb = sysinfo.get("ram_gb") or 8
    if not a.size_gb:
        # A file larger than RAM is the only reliable way to measure the SSD without sudo: F_NOCACHE does
        # not evict pages that are already cached (the first P0 run reported 18 GB/s from RAM, not SSD).
        a.size_gb = round(max(8.0, min(2 * ram_gb, sysinfo["disk_free_gb"] - 12)), 1)
        print(f"  test file size      {a.size_gb} GB (2x RAM, capped by free disk)")
    size = int(a.size_gb * 1e9) // PAGE * PAGE
    global COLD_BYTES
    COLD_BYTES = max(size // 4, size - int(ram_gb * 1.2e9)) // PAGE * PAGE
    if sysinfo["disk_free_gb"] < a.size_gb + 2:
        sys.exit(f"\nNot enough free disk for a {a.size_gb} GB test file.")

    print(f"\n[1/4] writing {a.size_gb} GB test file → {test_file}")
    write_bps = make_test_file(test_file, size) if not (a.keep and test_file.exists() and test_file.stat().st_size >= size) else None
    try:
        print(f"[2/4] SSD reads, uncached ({block / 1e6:.2f} MB blocks = one {a.bits}-bit expert)")
        seq = seq_read(test_file, size)
        print(f"    sequential {seq / 1e9:.2f} GB/s")
        if IS_MAC and subprocess.run(["sudo", "-n", "purge"], capture_output=True).returncode == 0:
            print("    purged the file cache (sudo purge)")
        ssd = ssd_bench(test_file, size, block, a.reads)
        if ssd["best"]["GBps"] > 9:
            print("    WARNING: > 9 GB/s is faster than any Mac internal SSD; reads are coming from RAM cache.\n"
                  "             Re-run with a larger --size-gb, or run `sudo purge` first.")
            ssd["suspect_cached"] = True
        best_qd = ssd["best"]["threads"]
        print(f"[3/4] decode IO simulation (QD{best_qd}, {a.tokens} tokens each)")
        sim = token_sim(test_file, size, block, best_qd, a.tokens, [0.0, 0.5, 0.77, 0.85, 0.89, 0.95])
    finally:
        if not a.keep:
            test_file.unlink(missing_ok=True)

    print("[4/4] memory bandwidth and baselines")
    mem = mlx_bandwidth()
    print(f"    MLX memory bandwidth: {mem['GBps']} GB/s" if mem else "    MLX not found — skipped (pip install mlx)")
    baselines = {}
    if a.gguf:
        print("    llama-bench …"); baselines["llama_cpp"] = llama_bench(a.gguf)
    if a.mlx_moe:
        print("    mlx-moe …"); baselines["mlx_moe"] = mlx_moe(a.mlx_moe)

    gbps = ssd["best"]["GBps"]
    active_bytes = TOP_K * LAYERS * block + NON_EXPERT_ACTIVE_PARAMS * 5 / 8
    compute_ceiling = round(mem["GBps"] * 1e9 * 0.6 / active_bytes, 1) if mem else None
    targets = {f"{t}_tok_s": round(needed_hit_rate(t, gbps, block), 3) for t in (16, 20, 30, 40)}
    expert_total = gb(EXPERTS * LAYERS * block)

    result = {"timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"), "system": sysinfo,
              "assumptions": {"model": "Qwen3-Coder-Next 80B-A3B", "layers": LAYERS, "experts": EXPERTS, "top_k": TOP_K,
                              "expert_bits": a.bits, "expert_mb": round(block / 1e6, 2), "all_experts_gb": expert_total},
              "ssd": {"write_GBps": round(write_bps / 1e9, 2) if write_bps else None, "sequential_GBps": round(seq / 1e9, 2), **ssd},
              "decode_io_sim": sim, "memory_bandwidth": mem, "compute_ceiling_tok_s": compute_ceiling,
              "hit_rate_needed_with_full_prefetch": targets, "baselines": baselines}

    out_dir = here / "results"; out_dir.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    (out_dir / f"p0-{stamp}.json").write_text(json.dumps(result, indent=2))
    md = [f"# P0 results — {result['timestamp']}", "",
          f"- Machine: {sysinfo.get('model', '')} {sysinfo.get('chip', '')}, RAM {sysinfo.get('ram_gb', sysinfo.get('ram'))} GB, "
          f"GPU wired limit {sysinfo.get('gpu_wired_limit_mb', '?')} MB (0 = macOS default), disk free {sysinfo['disk_free_gb']} GB",
          f"- SSD: sequential {round(seq / 1e9, 2)} GB/s · best random {gbps} GB/s at QD{best_qd} for {block / 1e6:.2f} MB blocks",
          f"- Memory bandwidth (MLX): {mem['GBps'] if mem else 'n/a'} GB/s → compute ceiling ≈ {compute_ceiling or 'n/a'} tok/s",
          f"- All experts at {a.bits} bits ≈ {expert_total} GB", "",
          "## Expert-cache hit rate needed (IO fully overlapped with compute)", "",
          "| Target | Hit rate needed |", "|---|---|", *[f"| {k.replace('_tok_s', '')} tok/s | {v:.0%} |" for k, v in targets.items()], "",
          "## Decode IO without prefetch (layers read one after another)", "",
          "| Hit rate | Misses/token | IO ms/token | tok/s (IO only) |", "|---|---|---|---|",
          *[f"| {r['hit_rate']:.0%} | {r['misses_per_token']} | {r['io_ms_per_token']} | {r['io_bound_tok_s_layer_serial']} |" for r in sim], "",
          "## SSD by queue depth", "", "| QD | GB/s | p50 ms | p99 ms |", "|---|---|---|---|",
          *[f"| {r['threads']} | {r['GBps']} | {r['p50_ms']} | {r['p99_ms']} |" for r in ssd["by_queue_depth"]]]
    if baselines:
        md += ["", "## Baselines", "", "```json", json.dumps(baselines, indent=2), "```"]
    (out_dir / f"p0-{stamp}.md").write_text("\n".join(md) + "\n")

    print("\nHit rate needed (IO overlapped):", ", ".join(f"{k.replace('_tok_s', '')} tok/s → {v:.0%}" for k, v in targets.items()))
    if compute_ceiling:
        print(f"Compute ceiling ≈ {compute_ceiling} tok/s")
    print(f"\nSaved {out_dir / f'p0-{stamp}.md'}")
    if IS_MAC and sysinfo.get("gpu_wired_limit_mb") in ("0", "unknown"):
        print("Note: GPU memory limit is the macOS default. For P1 it can be raised until reboot with\n"
              "      sudo sysctl iogpu.wired_limit_mb=12288   (16 GB Mac; leaves ~4 GB for macOS)")


if __name__ == "__main__":
    main()

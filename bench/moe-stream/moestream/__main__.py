"""moestream command line.

  python -m moestream bench  --model mlx-community/Qwen3-Coder-Next-4bit [--capacity auto] [--extra 6]
  python -m moestream sweep  --model ... --extras 0,3,6,10       # quality/speed trade-off
  python -m moestream profile --model ... --prompts prompts.txt --out coding-profile.json
  python -m moestream chat   --model ... "Write a function that ..."

Results are printed and appended to results.jsonl next to this package.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import mlx.core as mx

from .engine import EngineConfig
from .load import generate, load_streaming, resolve
from .store import ExpertStore

HERE = Path(__file__).resolve().parent
CODING_PROMPTS = [
    "Write a Python function that parses a CSV file and returns a list of dicts, with type hints and error handling.",
    "In JavaScript, write a debounce(fn, ms) helper and show how to use it on a search input.",
    "Explain what this SQL does and optimise it: SELECT * FROM orders o WHERE o.customer_id IN (SELECT id FROM customers WHERE city='Pune');",
    "Write a bash script that finds the 10 largest files under a directory and prints their sizes in MB.",
    "Refactor this into a class with tests: def area(r): return 3.14*r*r\ndef perim(r): return 2*3.14*r",
    "Write a TypeScript interface for an e-commerce order with line items, and a function computing the total with GST.",
]


def auto_capacity(model_dir: Path, reserve_gb: float, budget_gb: float | None) -> int:
    store = ExpertStore(model_dir)
    per_layer = store.expert_bytes(store.layers[0])
    layers = len(store.layers)
    total_experts = store.num_experts
    store.close()
    if budget_gb is None:
        try:
            info = mx.metal.device_info() if hasattr(mx, "metal") else mx.device_info()
            budget_gb = info.get("max_recommended_working_set_size", 0) / 1e9
        except Exception:
            budget_gb = 10.0
    resident_est = 2.2     # non-expert weights of Qwen3-Coder-Next 4-bit + activations (GB)
    room = max(0.5, budget_gb - resident_est - reserve_gb)
    cap = int(room * 1e9 / (per_layer * layers))
    print(f"  GPU budget {budget_gb:.1f} GB · reserve {reserve_gb} GB · expert {per_layer/1e6:.2f} MB × {layers} layers "
          f"→ capacity {cap}/{total_experts} experts per layer ({cap/total_experts:.0%})")
    return max(8, min(cap, total_experts))


def make_cfg(a, model_dir) -> EngineConfig:
    cap = auto_capacity(model_dir, a.reserve_gb, a.budget_gb) if a.capacity == "auto" else int(a.capacity)
    return EngineConfig(capacity=cap, extra=a.extra, swaps_per_layer=a.swaps, exact_prefill=not a.fast_prefill,
                        io_threads=a.io_threads, profile=a.profile)


def record(row: dict):
    with open(HERE.parent / "results.jsonl", "a") as f:
        f.write(json.dumps(row) + "\n")


def run_prompts(model, tok, eng, prompts, max_tokens, warm=1):
    rows = []
    for i, p in enumerate(prompts):
        r = generate(model, tok, eng, p, max_tokens=max_tokens)
        r.pop("text", None) if i < warm else None
        rows.append(r)
        print(f"  [{i+1}/{len(prompts)}] prefill {r['prompt_tokens']} tok in {r['prefill_s']}s · decode {r['decode_tok_s']} tok/s · "
              f"hit {r['hit_rate'] or 0:.0%} · coverage {r['coverage'] or 0:.1%} · swaps {r['swaps']}")
    return rows


def cmd_bench(a):
    model_dir = resolve(a.model)
    cfg = make_cfg(a, model_dir)
    t = time.perf_counter()
    model, tok, eng = load_streaming(str(model_dir), cfg)
    print(f"  loaded in {time.perf_counter()-t:.1f}s · active memory {mx.get_active_memory()/1e9:.2f} GB")
    prompts = CODING_PROMPTS[: a.prompts]
    run_prompts(model, tok, eng, prompts[:1], 16)          # warm-up: fills the cache for coding
    eng.reset_stats()
    rows = run_prompts(model, tok, eng, prompts, a.tokens)
    dec = [r["decode_tok_s"] for r in rows if r["decode_tok_s"]]
    s = eng.summary()
    out = {"cmd": "bench", "model": a.model, "time": time.strftime("%FT%T"), **s,
           "decode_tok_s_mean": round(sum(dec) / len(dec), 2) if dec else None,
           "peak_memory_gb": round(mx.get_peak_memory() / 1e9, 2)}
    print(json.dumps(out, indent=2))
    record(out)
    if a.save_profile:
        eng.save_profile(a.save_profile)
        print(f"  profile saved to {a.save_profile}")


def cmd_sweep(a):
    for extra in [int(x) for x in a.extras.split(",")]:
        a.extra = extra
        print(f"\n== extra={extra}")
        cmd_bench(a)


def cmd_profile(a):
    model_dir = resolve(a.model)
    cfg = make_cfg(a, model_dir)
    model, tok, eng = load_streaming(str(model_dir), cfg)
    prompts = Path(a.prompts_file).read_text().split("\n\n") if a.prompts_file else CODING_PROMPTS
    run_prompts(model, tok, eng, prompts, a.tokens)
    eng.save_profile(a.out)
    print(f"profile with the hottest experts per layer saved to {a.out}")


def cmd_chat(a):
    model_dir = resolve(a.model)
    model, tok, eng = load_streaming(str(model_dir), make_cfg(a, model_dir))
    r = generate(model, tok, eng, a.prompt, max_tokens=a.tokens, on_token=lambda s: print(s, end="", flush=True))
    r.pop("text")
    print("\n" + json.dumps(r))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="moestream", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("bench", "sweep", "profile", "chat"):
        p = sub.add_parser(name)
        p.add_argument("--model", default="mlx-community/Qwen3-Coder-Next-4bit")
        p.add_argument("--capacity", default="auto", help="experts cached per layer, or 'auto' (fits GPU memory)")
        p.add_argument("--budget-gb", type=float, default=None, help="GPU memory budget (default: macOS recommended working set)")
        p.add_argument("--reserve-gb", type=float, default=1.5, help="kept free for KV cache and activations")
        p.add_argument("--extra", type=int, default=6, help="router candidates searched for a cached substitute (0 = drop misses)")
        p.add_argument("--swaps", type=int, default=4, help="experts swapped in per layer per token")
        p.add_argument("--io-threads", type=int, default=4)
        p.add_argument("--fast-prefill", action="store_true", help="prompt uses cached experts only (no SSD wait)")
        p.add_argument("--profile", default=None, help="JSON profile of experts to pin/preload")
        p.add_argument("--tokens", type=int, default=200)
        if name in ("bench", "sweep"):
            p.add_argument("--prompts", type=int, default=len(CODING_PROMPTS))
            p.add_argument("--save-profile", default=None)
        if name == "sweep":
            p.add_argument("--extras", default="0,3,6,10")
        if name == "profile":
            p.add_argument("--prompts-file", default=None, help="prompts separated by blank lines")
            p.add_argument("--out", default="coding-profile.json")
        if name == "chat":
            p.add_argument("prompt")
    a = ap.parse_args(argv)
    {"bench": cmd_bench, "sweep": cmd_sweep, "profile": cmd_profile, "chat": cmd_chat}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())

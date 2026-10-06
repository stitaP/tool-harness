# moestream — SSD-streamed MoE experts for MLX (plan P1–P3)

Runs MoE models that are larger than RAM (Qwen3-Coder-Next 80B-A3B on a 16 GB Mac) by keeping only
a cache of experts per layer in GPU memory and reading the rest from the SSD.

| Part (PLAN.md §3) | Status |
|---|---|
| 2. Streaming loader — experts read straight from the MLX safetensors (no repack), parallel `pread`, no OS page cache | done |
| 3. LFU-with-decay cache, pinned hot set, coding profile record/preload | done |
| 4. Prefetch — next swaps are read in a background thread while the next token computes | done (between-token; intra-token look-ahead not yet) |
| 5. Cache-aware routing — a missing expert is replaced by the best *cached* candidate; coverage is measured | done |
| 7. Exact prefill — prompt tokens use the true routing (missing experts streamed per layer) | done |
| 1. Mixed-precision repack (2-bit cold experts) · 6. speculative decoding · OpenAI server | next |

Correctness (tests/, tiny Qwen3-Next): with every expert cached the logits equal stock mlx-lm; exact
prefill equals stock mlx-lm with a 4-expert cache; swaps converge to the exact result; slot updates are
in place (no buffer copies).

## Setup (once)

```bash
cd ~/Documents/GitHub/tool-harness/bench/moe-stream
python3 -m venv .venv && source .venv/bin/activate
pip install -U mlx mlx-lm huggingface_hub pytest
python -m pytest tests -q                    # 7 tests, a few seconds
```

## Benchmark (close other GPU apps first; ~45 GB download the first time)

```bash
sudo sysctl iogpu.wired_limit_mb=12288      # until reboot; lets the GPU use 12 GB
python -m moestream bench --model mlx-community/Qwen3-Coder-Next-4bit --save-profile coding-profile.json
python -m moestream sweep --model mlx-community/Qwen3-Coder-Next-4bit --profile coding-profile.json --extras 0,3,6,10
python -m moestream chat  --model mlx-community/Qwen3-Coder-Next-4bit --profile coding-profile.json "Write a CSV parser in Python"
```

Every run prints decode tok/s, hit rate, substituted/dropped share, **coverage** (share of the router's
top-k weight that actually ran — 100% = exact model) and SSD GB read, and appends a row to `results.jsonl`.

## GGUF route: `ggufcache.py` + llama.cpp (for the unsloth UD-IQ2_XXS download)

llama.cpp has no hook that reports which experts a token uses, so the cache runs as a separate process next to an
unmodified `llama-server`. Both memory-map the same GGUF, so they share the page cache.

- **Cache:** learns which (layer, expert) slices are used and keeps the hottest ones pinned in RAM (`mlock`) within a budget. Scores are LFU with decay, re-planned every 30 s.
- **Prefetch:** polls page residency (`mincore`, every 50 ms). When llama-server starts faulting in an expert, the whole expert (its gate, up and down weights) is read in one large parallel read instead of page by page.
- **Profile:** the learned scores are saved, so the next start reads and pins the hot set before the first token.

```bash
bash run-gguf-2bit.sh            # cache + llama-server (--cpu-moe, --no-warmup), OpenAI API on :8081
bash run-gguf-2bit.sh bench      # 2nd Terminal; run twice (the 2nd run uses the learned cache)
bash run-gguf-2bit.sh status
```
Tests: `python -m pytest tests -q` (12 tests, including 5 for ggufcache on a synthetic MoE GGUF).
Not done yet: per-token next-layer expert prediction. It needs a small llama.cpp patch that exports the router's top-k.

### Speed settings for the 80B on a 16 GB Mac (measured 4 Oct 2026, M4 Mac mini)

The full Qwen3-Coder-Next is larger than RAM even at its smallest quantization (UD-TQ1_0 is 18.9 GB; this machine has
17.2 GB), so experts always stream from the SSD and speed is bounded by it. Fewer experts per token means less to read:

```bash
EXPERTS=8 bash run-gguf-2bit.sh      # experts per token (model default 10)
LLAMA_EXTRA="--n-cpu-moe 40" bash run-gguf-2bit.sh   # pass extra llama-server flags
```

| `EXPERTS` | decode, mean | best | quality check (`is_prime` with docstring, temperature 0) |
|---|---|---|---|
| 10 (default) | 1.69 tok/s | 2.02 | correct |
| 8 | 2.21 tok/s | 2.27 | identical output to 10 |
| 6 | 2.89 tok/s | 3.09 | not yet checked |

A larger pinned cache does not help: `PIN_GB=8` measured 0.72 tok/s vs 1.44 at `PIN_GB=4` (it starves macOS's own page
cache). Threads 4 vs 6 made no difference. For tens of tokens per second the model has to fit in RAM — e.g. an
expert-pruned build such as Qwen3-Coder-Next-REAP-40B-A3B (i1-IQ2_XXS, 10.9 GB) run like the 30B with
`agent/scripts/start-local.mjs`.


# MoE SSD streaming — Qwen3-Coder-Next (80B-A3B) at 16–40 tok/s on a 16 GB Mac mini

Goal: run Qwen3-Coder-Next locally on a 16 GB Apple Silicon Mac mini with MLX, keeping only
what is needed in RAM and streaming the rest of the experts from the internal SSD, at a sustained
16+ tok/s decode with bursts toward 40 tok/s, and serve it to ToolHarness over an
OpenAI-compatible API.

Status: **P0 script ready** (`bench/moe-stream/p0_bench.py`). All speed figures below are
estimates until P0 results replace them.

## 1. The model

From the [model card](https://huggingface.co/Qwen/Qwen3-Coder-Next):

| | |
|---|---|
| Parameters | 80B total, ~3B active per token |
| Layers | 48: 12 × (3 × Gated DeltaNet → MoE, 1 × Gated Attention → MoE) |
| Hidden size | 2048 |
| Experts | 512 per layer, 10 routed + 1 shared per token, expert FFN dim 512 |
| One expert | 3 × 2048 × 512 ≈ 3.15M params |
| All routed experts | ≈ 77B params |
| Non-expert weights | ≈ 2.7B params (attention/DeltaNet, embeddings, lm_head, router, shared experts) |
| Context | 256K; only 12 of 48 layers keep a KV cache (2 KV heads), so state is small |

## 2. The budget

At ~3-bit experts (≈3.5 effective bits with scales):

| Item | Size |
|---|---|
| One expert | ≈ 1.38 MB |
| Routed experts read per token (10 × 48 = 480) | ≈ 0.66 GB |
| All experts on SSD | ≈ 34 GB |
| Resident non-expert weights (5–6 bit) | ≈ 1.7 GB |
| GPU memory with `iogpu.wired_limit_mb=12288` | ≈ 12 GB |
| → expert cache | ≈ 10 GB ≈ 30% of all experts |

SSD reads per token decide the speed. Allowed misses per token = SSD bandwidth ÷ tok/s ÷ expert size.
At ~3 GB/s (to be measured):

| Target | SSD budget/token | Misses allowed (of 480) | Cache hit rate needed |
|---|---|---|---|
| 16 tok/s | 190 MB | ~136 | ~72% |
| 20 tok/s | 150 MB | ~108 | ~77% |
| 40 tok/s | 75 MB | ~54 | ~89% |

Compute ceiling: ~1.6 GB of weights are touched per token. At M4 memory bandwidth (~120 GB/s)
and ~60% efficiency, that allows ~45–50 tok/s, so 40 is close to the hardware limit.

**The design therefore comes down to two things: raise the expert-cache hit rate, and hide the misses that remain behind compute.**

## 3. The seven parts of the solution

1. **Mixed-precision quantization.**
   - Attention, DeltaNet, shared expert and router at 5–6 bit.
   - Routed experts at ~3 bit.
   - Cold experts (rarely selected) at 2 bit.
   - This shrinks both the bytes per miss and the total, so the cache covers a larger share.
2. **Streaming file layout and loader.**
   - One file per layer, each expert one contiguous, 16 KB-aligned block (gate/up/down plus scales together).
   - Read with multithreaded `pread` (`F_NOCACHE`) or `MTLIOCommandQueue` directly into Metal buffers, at the queue depth P0 finds best.
   - No swap and no write-back: weights are read-only, so evicting them costs nothing, and SSD wear only comes from writes.
3. **Coding-aware cache, built on the tokenizer idea.**
   - Profile expert selections over real ToolHarness coding and tool-calling traces.
   - Pin the hot set; manage the rest with LFU plus decay per layer.
   - A task classifier on the incoming prompt (Python, TS, SQL, shell, tool-call JSON, prose) preloads that task's expert profile before decoding starts.
4. **Router look-ahead prefetch.**
   - While layer N computes, apply layer N+1's router to layer N's hidden state, predict its experts, and issue the reads.
   - This overlaps IO with compute, so a token costs max(IO, compute) rather than their sum.
5. **Cache-aware routing.**
   - If a cached expert's router score is within a small margin of a missing one, use the cached expert.
   - Cap SSD misses at 1–2 per layer per token.
   - This is the biggest speed lever, but it changes outputs, so it is quality-gated (see §5).
6. **Speculative decoding.**
   - Prompt-lookup drafting, which works well for code edits that copy context, plus optionally a small Qwen3 draft model (shared tokenizer).
   - The model verifies k drafted tokens in one pass, so each expert loaded from SSD serves several tokens.
7. **Cheap prefill for agent loops.**
   - Any long input touches nearly every expert, costing ~34 GB of reads ≈ 10 s at 3 GB/s.
   - Persist the DeltaNet and attention state for the system prompt and conversation prefix.
   - Prefill only new tokens, streaming layer by layer.
   - Have ToolHarness compact tool outputs before they reach the model.

## 4. Expected speed

| Configuration | tok/s (estimate) |
|---|---|
| mlx-moe today, 4-bit, 16 GB | 3–8 |
| + 3-bit experts, raised wired limit, coding-aware cache, parallel loader | 10–15 |
| + router look-ahead prefetch | 15–22 |
| + cache-aware routing | 25–35 |
| + speculative decoding (code edits) | 30–45 |

Turns that ingest large new inputs still pause for a few seconds of prefill (part 7 limits how often).

## 5. Phases and gates

| Phase | Work | Gate |
|---|---|---|
| **P0 — measure** | `p0_bench.py`: SSD read speed at expert block size by queue depth, decode-IO simulation by hit rate, MLX memory bandwidth, wired limit, free disk; optional llama-bench and mlx-moe baselines | Real numbers replace the assumptions in §2 and §4 |
| **P1 — repack + loader** | Mixed-precision repack of the MLX weights into the layer/expert layout; parallel loader; LRU cache; OpenAI-compatible server | ≥ 10 tok/s decode, output identical to the reference quant |
| **P2 — coding-aware cache** | Expert-trace logging, hot-set pinning, LFU+decay, task-classifier preload | ≥ 75% hit rate on ToolHarness coding traces |
| **P3 — prefetch + cache-aware routing** | Look-ahead router prefetch, miss cap with score margin | ≥ 16 tok/s; coding eval within 1–2 points of the unmodified quant |
| **P4 — speculative decoding + prefix state** | Prompt-lookup/draft verification, persisted DeltaNet/attention state, tool-output compaction | Sustained 16–25 tok/s, bursts ≥ 30 on code edits; agent-turn latency measured in ToolHarness |

**Quality eval (used in P1–P4):**

- A fixed set of coding tasks (HumanEval-style plus a ToolHarness tool-calling suite), run against the plain quant as the reference.
- Every change that alters routing or precision must stay within the gate.

## 6. Risks

- **Quality loss** from 3-bit and 2-bit experts and from cache-aware routing. Mitigation: the eval gate on every phase, and a per-request knob to turn substitution off.
- **macOS memory headroom.** A 12 GB wired limit leaves ~4 GB for the OS, so heavy apps (browsers, IDEs) must be closed while serving.
- **SSD speed varies by Mac mini storage size.** P0 measures it.
- **Disk space:** ~35–46 GB for the model files plus the original download.
- **Router look-ahead accuracy** for this hybrid architecture is unproven. P3 measures it, and plain on-demand loading is the fallback.

## 7. Prior art to reuse or compare

- [mlx-moe](https://github.com/mu-hashmi/mlx-moe) supports Qwen3-Coder-Next and reports 8–23 tok/s with 19 GB used on a 32 GB Mac; the P0 baseline uses it.
- [maxtoken](https://github.com/notagentdev/maxtoken), [serve-mlx](https://github.com/IDAH-BITBOX/serve-mlx) and [mlx-flash](https://github.com/matt-k-wong/mlx-flash) are other MLX SSD-streaming servers.
- llama.cpp GGUF with mmap is the simplest baseline; Unsloth `UD-IQ3_XXS` is the smallest recommended quant ([guide](https://unsloth.ai/docs/models/qwen3-coder-next)).

## 8. Running P0

```bash
cd ~/Documents/GitHub/tool-harness
python3 bench/moe-stream/p0_bench.py                      # 2–4 min, needs ~6 GB free disk
# optional baselines, if already installed and downloaded:
python3 bench/moe-stream/p0_bench.py --gguf /path/to/Qwen3-Coder-Next-UD-IQ3_XXS.gguf
python3 bench/moe-stream/p0_bench.py --mlx-moe mlx-community/Qwen3-Coder-Next-4bit
```

- Close heavy apps first.
- Results are written to `bench/moe-stream/results/p0-<timestamp>.md` and `.json`.
- The script installs and downloads nothing, needs no sudo, and deletes its temporary 4 GB test file.

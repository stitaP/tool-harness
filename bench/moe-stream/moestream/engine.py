"""SSD-streamed MoE experts for MLX models (Qwen3-Next / Qwen3-Coder-Next and other SwitchGLU MoEs).

Only a fixed number of experts per layer ("slots") live in GPU memory. Decode never waits on
the SSD:

* **Cache-aware routing.** The router's top-k experts that are cached run as usual. An expert
  that is not cached is replaced by the best-scoring *cached* expert among the router's next
  `extra` candidates (weight = that expert's own gate value). Only if none is cached is the
  slot dropped. `extra=0` reproduces drop-on-miss.
* **Swaps between tokens.** After each token the engine knows which routed experts were
  missing; an LFU-with-decay policy picks which cached experts to replace, a background thread
  reads the new experts from the SSD while the next token computes, and the GPU slot buffers
  are updated in place at the following token boundary (in place because nothing else holds
  them at that point — no full-buffer copies).
* **Pinning.** Experts listed in a profile (e.g. recorded from coding sessions) are loaded
  first and never evicted.
* **Exact prefill (optional).** For prompts, each MoE layer can load its missing experts into a
  temporary buffer so the prompt is processed with the exact routing.

Every token records how much of the router's true top-k weight was actually executed
(`coverage`), so the quality cost of a given cache size is measured, not guessed.
"""
from __future__ import annotations

import json
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import numpy as np

from mlx_lm.models.switch_layers import _gather_sort, _scatter_unsort

from .store import PROJS, ExpertStore


_MX_DTYPES = {"U32": mx.uint32, "F16": mx.float16, "BF16": mx.bfloat16, "F32": mx.float32, "U8": mx.uint8, "I32": mx.int32}


def _to_mx(arr: np.ndarray, dtype: str) -> mx.array:
    a = mx.array(arr)
    return a.view(mx.bfloat16) if dtype == "BF16" else a


@dataclass
class LayerStats:
    requested: int = 0     # routed (token, k) pairs
    hits: int = 0
    substituted: int = 0
    dropped: int = 0
    coverage_sum: float = 0.0
    coverage_n: int = 0


@dataclass
class EngineConfig:
    capacity: int = 128            # experts kept per layer
    extra: int = 6                 # extra router candidates searched for a cached substitute
    swaps_per_layer: int = 4       # max experts swapped in per layer per token
    decay: float = 0.97            # LFU decay per token
    exact_prefill: bool = True     # load missing experts for prompt tokens (exact routing)
    io_threads: int = 4
    profile: str | None = None     # JSON {layer: [expert ids]} to pin / preload


class StreamingSwitchGLU(nn.Module):
    """Holds `capacity` expert slots for one MoE layer and runs them with gather_qmm."""

    def __init__(self, engine: "MoEStreamEngine", layer: int, quant: dict, activation):
        super().__init__()
        self._engine = engine
        self._layer = layer
        self._quant = quant
        self._act = activation
        self.slots: dict[tuple[str, str], mx.array] = {}
        self.slot_expert = np.full(engine.cfg.capacity, -1, dtype=np.int64)    # slot -> expert
        self.expert_slot = np.full(engine.num_experts, -1, dtype=np.int64)     # expert -> slot
        self.score = np.zeros(engine.num_experts, dtype=np.float64)            # LFU-with-decay
        self.pinned: set[int] = set()
        self.lookup = mx.zeros((engine.num_experts,), dtype=mx.int32)           # expert -> slot (0 if uncached)
        self.cached = mx.zeros((engine.num_experts,), dtype=mx.bool_)
        self.freeze()

    # ── slot buffers ──────────────────────────────────────────────────────────
    def allocate(self, sample: dict[tuple[str, str], np.ndarray], dtypes: dict[tuple[str, str], str]):
        cap = self._engine.cfg.capacity
        for key, arr in sample.items():
            self.slots[key] = mx.zeros((cap, *arr.shape[1:]), dtype=_MX_DTYPES[dtypes[key]])
        mx.eval(list(self.slots.values()))

    def install(self, experts: list[int], slots: list[int], data: dict[tuple[str, str], np.ndarray], dtypes):
        """Write experts into slots in place (call only at a sync point)."""
        idx = mx.array(np.asarray(slots, dtype=np.int32))
        for key, arr in data.items():
            buf = self.slots[key]
            buf[idx] = _to_mx(arr, dtypes[key])
            self.slots[key] = buf
        for e, s in zip(experts, slots):
            old = self.slot_expert[s]
            if old >= 0:
                self.expert_slot[old] = -1
            self.slot_expert[s] = e
            self.expert_slot[e] = s
        lk = np.where(self.expert_slot >= 0, self.expert_slot, 0).astype(np.int32)
        self.lookup = mx.array(lk)
        self.cached = mx.array(self.expert_slot >= 0)
        mx.eval(list(self.slots.values()) + [self.lookup, self.cached])

    # ── compute ───────────────────────────────────────────────────────────────
    def _proj(self, x, bufs, proj, idx, sorted_indices):
        q = self._quant
        return mx.gather_qmm(
            x, bufs[(proj, "weight")], bufs[(proj, "scales")], bufs.get((proj, "biases")),
            rhs_indices=idx, transpose=True, group_size=q["group_size"], bits=q["bits"],
            mode=q.get("mode", "affine"), sorted_indices=sorted_indices,
        )

    def run(self, x, slot_idx, bufs=None):
        """Same computation as mlx_lm SwitchGLU, over slot buffers instead of all experts."""
        bufs = bufs or self.slots
        x = mx.expand_dims(x, (-2, -3))
        do_sort = slot_idx.size >= 64
        idx, inv = slot_idx, None
        if do_sort:
            x, idx, inv = _gather_sort(x, slot_idx)
        up = self._proj(x, bufs, "up_proj", idx, do_sort)
        gate = self._proj(x, bufs, "gate_proj", idx, do_sort)
        out = self._proj(self._act(up, gate), bufs, "down_proj", idx, do_sort)
        if do_sort:
            out = _scatter_unsort(out, inv, slot_idx.shape)
        return out.squeeze(-2)


class StreamingMoEBlock(nn.Module):
    """Replaces a Qwen3-Next sparse MoE block: router + shared expert stay resident."""

    def __init__(self, engine: "MoEStreamEngine", layer: int, block: nn.Module, switch: StreamingSwitchGLU):
        super().__init__()
        self._engine = engine
        self._layer = layer
        self.gate = block.gate
        self.shared_expert = block.shared_expert
        self.shared_expert_gate = block.shared_expert_gate
        self.top_k = block.top_k
        self.norm_topk_prob = block.norm_topk_prob
        self.switch = switch

    def __call__(self, x: mx.array) -> mx.array:
        eng = self._engine
        gates = mx.softmax(self.gate(x), axis=-1, precise=True)
        k = self.top_k
        tokens = x.shape[0] * x.shape[1]
        if tokens > 1 and eng.cfg.exact_prefill:
            y = self._exact(x, gates, k)
        else:
            y = self._cached(x, gates, k)
        shared = mx.sigmoid(self.shared_expert_gate(x)) * self.shared_expert(x)
        return y + shared

    def _combine(self, out, scores):
        return (out * scores[..., None]).sum(axis=-2)

    def _cached(self, x, gates, k):
        sw = self.switch
        extra = self._engine.cfg.extra
        n = min(k + extra, gates.shape[-1])
        cand = mx.argpartition(-gates, kth=n - 1, axis=-1)[..., :n]
        cand_scores = mx.take_along_axis(gates, cand, axis=-1)
        order = mx.argsort(-cand_scores, axis=-1)                      # candidates by score
        cand = mx.take_along_axis(cand, order, axis=-1)
        cand_scores = mx.take_along_axis(cand_scores, order, axis=-1)
        true_top = cand[..., :k]
        cached = sw.cached[cand]
        # pick the k best cached candidates; uncached ones sort last and get weight 0
        rank = mx.where(cached, cand_scores, cand_scores - 2.0)
        pick = mx.argsort(-rank, axis=-1)[..., :k]
        sel = mx.take_along_axis(cand, pick, axis=-1)
        sel_ok = mx.take_along_axis(cached, pick, axis=-1)
        raw = mx.where(sel_ok, mx.take_along_axis(cand_scores, pick, axis=-1), 0.0)
        # norm_topk_prob models renormalise over the experts that actually run
        scores = raw / mx.maximum(raw.sum(-1, keepdims=True), 1e-9) if self.norm_topk_prob else raw
        y = self._combine(sw.run(x, sw.lookup[sel]), scores.astype(x.dtype))
        self._engine._record(self._layer, true_top, sel, sel_ok, cand_scores[..., :k], raw)
        return y

    def _exact(self, x, gates, k):
        """Prompt path: exact top-k; experts not in the cache are loaded into a temp buffer."""
        sw = self.switch
        inds = mx.argpartition(-gates, kth=k - 1, axis=-1)[..., :k]
        scores = mx.take_along_axis(gates, inds, axis=-1)
        if self.norm_topk_prob:
            scores = scores / scores.sum(axis=-1, keepdims=True)
        mx.eval(inds)
        ids = np.unique(np.asarray(inds))
        missing = [int(e) for e in ids if sw.expert_slot[e] < 0]
        hit = sw.cached[inds]
        y = self._combine(sw.run(x, sw.lookup[inds]), mx.where(hit, scores, 0.0).astype(x.dtype))
        if missing:
            data = self._engine.store.read(self._layer, missing)
            tmp = {key: _to_mx(arr, self._engine.dtypes[(self._layer,) + key]) for key, arr in data.items()}
            remap = np.zeros(self._engine.num_experts, dtype=np.int32)
            remap[missing] = np.arange(len(missing), dtype=np.int32)
            y = y + self._combine(sw.run(x, mx.array(remap)[inds], tmp), mx.where(hit, 0.0, scores).astype(x.dtype))
        self._engine._record(self._layer, inds, inds, mx.ones(inds.shape, dtype=mx.bool_), scores, scores, prefill=True)
        return y


class MoEStreamEngine:
    def __init__(self, model: nn.Module, model_dir: str | Path, cfg: EngineConfig | None = None):
        self.cfg = cfg or EngineConfig()
        self.model = model
        self.store = ExpertStore(model_dir, threads=self.cfg.io_threads)
        self.num_experts = self.store.num_experts
        self.dtypes = {(l, p, q): r.dtype for (l, p, q), r in self.store.refs.items()}
        self.stats: dict[int, LayerStats] = defaultdict(LayerStats)
        self.blocks: dict[int, StreamingMoEBlock] = {}
        self._pending: list = []          # per-token routing records (mx arrays)
        self._io: threading.Thread | None = None
        self._ready: dict[int, tuple[list[int], list[int], dict]] = {}
        self.tokens = 0
        self.swaps = 0
        self.io_seconds = 0.0

    # ── setup ─────────────────────────────────────────────────────────────────
    def attach(self) -> "MoEStreamEngine":
        quant_cfg = getattr(self.model, "_moestream_quant", None)
        layers = self.model.layers
        for li, layer in enumerate(layers):
            block = getattr(layer, "mlp", None)
            if block is None or not hasattr(block, "switch_mlp"):
                continue
            sm = block.switch_mlp
            q = quant_cfg or {"group_size": sm.up_proj.group_size, "bits": sm.up_proj.bits, "mode": getattr(sm.up_proj, "mode", "affine")}
            switch = StreamingSwitchGLU(self, li, q, sm.activation)
            sample = self.store.read(li, [0])
            switch.allocate(sample, {k: self.dtypes[(li,) + k] for k in sample})
            new = StreamingMoEBlock(self, li, block, switch)
            layer.mlp = new           # drops the references to the stacked (lazy, never loaded) expert tensors
            self.blocks[li] = new
        self._preload()
        return self

    def _preload(self):
        prof = {}
        if self.cfg.profile and Path(self.cfg.profile).exists():
            prof = {int(k): v for k, v in json.loads(Path(self.cfg.profile).read_text()).items()}
        for li, b in self.blocks.items():
            sw = b.switch
            want = [int(e) for e in prof.get(li, [])][: self.cfg.capacity]
            sw.pinned = set(want[: self.cfg.capacity // 2])     # pin at most half the cache
            fill = want + [e for e in range(self.num_experts) if e not in set(want)]
            fill = fill[: self.cfg.capacity]
            data = self.store.read(li, fill)
            sw.install(fill, list(range(len(fill))), data, {k: self.dtypes[(li,) + k] for k in data})
            sw.score[fill] = 1.0

    # ── per-token bookkeeping ─────────────────────────────────────────────────
    def _record(self, layer, true_top, sel, sel_ok, true_scores, used_scores, prefill=False):
        self._pending.append((layer, true_top, sel, sel_ok, true_scores, used_scores, prefill))

    def after_token(self):
        """Call after each generated token has been evaluated (a sync point)."""
        self._apply_ready()
        recs, self._pending = self._pending, []
        if not recs:
            return
        mx.eval([r[i] for r in recs for i in (1, 2, 3, 4, 5)])
        wanted: dict[int, np.ndarray] = {}
        for layer, true_top, sel, sel_ok, ts, us, prefill in recs:
            st = self.stats[layer]
            tt = np.asarray(true_top).reshape(-1)
            sw = self.blocks[layer].switch
            sw.score *= self.cfg.decay
            np.add.at(sw.score, tt, 1.0)
            if prefill:
                wanted[layer] = np.union1d(wanted.get(layer, np.array([], dtype=np.int64)), tt)
                continue
            hits = sw.expert_slot[tt] >= 0
            ok = np.asarray(sel_ok).reshape(-1)
            st.requested += tt.size
            st.hits += int(hits.sum())
            st.dropped += int((~ok).sum())
            st.substituted += int(ok.sum()) - int(hits.sum())
            cov = float(np.asarray(us).sum()) / max(float(np.asarray(ts).sum()), 1e-9)
            st.coverage_sum += min(cov, 1.0)
            st.coverage_n += 1
            miss = tt[~hits]
            if miss.size:
                wanted[layer] = np.union1d(wanted.get(layer, np.array([], dtype=np.int64)), miss)
        self.tokens += 1
        self._plan_swaps(wanted)

    def _plan_swaps(self, wanted: dict[int, np.ndarray]):
        plan = {}
        for layer, cand in wanted.items():
            sw = self.blocks[layer].switch
            cand = [int(e) for e in cand if sw.expert_slot[e] < 0]
            cand.sort(key=lambda e: -sw.score[e])
            cand = cand[: self.cfg.swaps_per_layer]
            if not cand:
                continue
            victims = [s for s in np.argsort(sw.score[np.maximum(sw.slot_expert, 0)]) if sw.slot_expert[s] not in sw.pinned]
            pairs = [(e, int(s)) for e, s in zip(cand, victims) if sw.score[e] >= sw.score[sw.slot_expert[s]]]
            if pairs:
                plan[layer] = pairs
        if plan:
            if self._io and self._io.is_alive():
                self._io.join()
            self._io = threading.Thread(target=self._fetch, args=(plan,), daemon=True)
            self._io.start()

    def _fetch(self, plan):
        t = time.perf_counter()
        for layer, pairs in plan.items():
            experts = [e for e, _ in pairs]
            self._ready[layer] = (experts, [s for _, s in pairs], self.store.read(layer, experts))
        self.io_seconds += time.perf_counter() - t

    def _apply_ready(self, wait: bool = False):
        if wait and self._io:
            self._io.join()
        if self._io and self._io.is_alive():
            return
        ready, self._ready = self._ready, {}
        for layer, (experts, slots, data) in ready.items():
            sw = self.blocks[layer].switch
            sw.install(experts, slots, data, {k: self.dtypes[(layer,) + k] for k in data})
            self.swaps += len(experts)

    def flush(self):
        """Wait for in-flight reads and install them (e.g. before a benchmark)."""
        self._apply_ready(wait=True)

    # ── reporting ─────────────────────────────────────────────────────────────
    def reset_stats(self):
        self.stats.clear(); self.tokens = 0; self.swaps = 0; self.io_seconds = 0.0; self.store.bytes_read = 0

    def summary(self) -> dict:
        req = sum(s.requested for s in self.stats.values())
        hits = sum(s.hits for s in self.stats.values())
        sub = sum(s.substituted for s in self.stats.values())
        drop = sum(s.dropped for s in self.stats.values())
        cov = [s.coverage_sum / s.coverage_n for s in self.stats.values() if s.coverage_n]
        return {
            "steps": self.tokens, "capacity": self.cfg.capacity, "extra": self.cfg.extra,
            "hit_rate": hits / req if req else None,
            "substituted": sub / req if req else None,
            "dropped": drop / req if req else None,
            "coverage": float(np.mean(cov)) if cov else None,
            "swaps": self.swaps, "ssd_gb": self.store.bytes_read / 1e9, "io_seconds": round(self.io_seconds, 2),
        }

    def save_profile(self, path: str | Path, top: int | None = None):
        """Write the hottest experts per layer (LFU score) — reusable as a pin/preload profile."""
        top = top or self.cfg.capacity
        prof = {li: [int(e) for e in np.argsort(-b.switch.score)[:top]] for li, b in self.blocks.items()}
        Path(path).write_text(json.dumps(prof))

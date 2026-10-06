"""Correctness tests on a tiny quantized Qwen3-Next model (runs on CPU or Apple GPU).

    python -m pytest tests -q
"""
import json
import tempfile
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import numpy as np
import pytest
from mlx.utils import tree_flatten
from mlx_lm.models.cache import make_prompt_cache
from mlx_lm.models.qwen3_next import Model, ModelArgs
from mlx_lm.utils import load_model

from moestream import EngineConfig, ExpertStore, MoEStreamEngine

E, K = 16, 4
CONFIG = dict(
    model_type="qwen3_next", hidden_size=64, num_hidden_layers=4, intermediate_size=64,
    num_attention_heads=4, linear_num_value_heads=4, linear_num_key_heads=2, linear_key_head_dim=16,
    linear_value_head_dim=16, linear_conv_kernel_dim=4, num_experts=E, num_experts_per_tok=K,
    decoder_sparse_step=1, shared_expert_intermediate_size=32, mlp_only_layers=[], moe_intermediate_size=32,
    rms_norm_eps=1e-6, vocab_size=128, num_key_value_heads=2, rope_theta=10000.0, partial_rotary_factor=0.25,
    max_position_embeddings=512, head_dim=16, norm_topk_prob=True, full_attention_interval=4,
)


@pytest.fixture(scope="module")
def model_dir():
    mx.random.seed(0)
    d = Path(tempfile.mkdtemp(prefix="moestream-"))
    m = Model(ModelArgs.from_dict(CONFIG))
    # spread router logits so routing is decisive and varied
    for layer in m.layers:
        layer.mlp.gate.weight = mx.random.normal(layer.mlp.gate.weight.shape) * 2.0
    nn.quantize(m, group_size=32, bits=4, class_predicate=lambda p, mod: hasattr(mod, "to_quantized") and not p.endswith("mlp.gate") and not p.endswith("shared_expert_gate"))
    weights = dict(tree_flatten(m.parameters()))
    half = {k: v for i, (k, v) in enumerate(sorted(weights.items())) if i % 2 == 0}
    rest = {k: v for k, v in weights.items() if k not in half}
    mx.save_safetensors(str(d / "model-00001-of-00002.safetensors"), half)
    mx.save_safetensors(str(d / "model-00002-of-00002.safetensors"), rest)
    cfg = dict(CONFIG, quantization={"group_size": 32, "bits": 4})
    (d / "config.json").write_text(json.dumps(cfg))
    return d


def ref_logits(model_dir, ids):
    m, _ = load_model(model_dir)
    return m(ids, cache=make_prompt_cache(m))


def stream_model(model_dir, **kw):
    m, _ = load_model(model_dir, lazy=True)
    eng = MoEStreamEngine(m, model_dir, EngineConfig(**kw)).attach()
    mx.eval(m.parameters())
    return m, eng


IDS = mx.array([[5, 17, 3, 99, 42, 7, 64, 12]])


def test_store_reads_exact_expert_bytes(model_dir):
    store = ExpertStore(model_dir)
    assert store.num_experts == E and store.layers == [0, 1, 2, 3]
    full = {}
    for f in model_dir.glob("*.safetensors"):
        full.update(mx.load(str(f)))
    got = store.read(2, [3, 11])
    w = np.asarray(full["model.layers.2.mlp.switch_mlp.up_proj.weight"])
    assert np.array_equal(got[("up_proj", "weight")], w[[3, 11]])
    s = np.asarray(full["model.layers.2.mlp.switch_mlp.down_proj.scales"].astype(mx.float32))
    got_s = np.asarray(mx.array(got[("down_proj", "scales")]).view(mx.bfloat16).astype(mx.float32)) \
        if store.refs[(2, "down_proj", "scales")].dtype == "BF16" else got[("down_proj", "scales")].astype(np.float32)
    assert np.allclose(got_s, s[[3, 11]])


def test_full_cache_matches_reference(model_dir):
    ref = ref_logits(model_dir, IDS)
    m, eng = stream_model(model_dir, capacity=E, exact_prefill=False)
    out = m(IDS, cache=make_prompt_cache(m))
    assert mx.allclose(out, ref, atol=1e-4).item()
    eng.after_token()
    s = eng.summary()
    assert s["coverage"] is None or s["coverage"] > 0.999


def test_exact_prefill_with_small_cache_matches_reference(model_dir):
    ref = ref_logits(model_dir, IDS)
    m, eng = stream_model(model_dir, capacity=4, exact_prefill=True)
    out = m(IDS, cache=make_prompt_cache(m))
    assert mx.allclose(out, ref, atol=1e-4).item()


def test_decode_substitutes_and_swaps(model_dir):
    m, eng = stream_model(model_dir, capacity=6, extra=4, swaps_per_layer=4)
    cache = make_prompt_cache(m)
    logits = m(IDS, cache=cache)[:, -1]
    mx.eval(logits); eng.after_token()
    for _ in range(12):
        tok = mx.argmax(logits, axis=-1).reshape(1, 1)
        logits = m(tok, cache=cache)[:, -1]
        mx.eval(logits)
        eng.after_token()
    eng.flush()
    s = eng.summary()
    assert s["steps"] == 13 and s["swaps"] > 0
    assert 0 < s["coverage"] <= 1.0
    assert abs(s["hit_rate"] + s["substituted"] + s["dropped"] - 1.0) < 1e-9
    # the cache is never larger than its capacity and the maps stay consistent
    for b in eng.blocks.values():
        sw = b.switch
        live = sw.slot_expert[sw.slot_expert >= 0]
        assert len(live) == len(set(live.tolist())) <= 6
        assert all(sw.expert_slot[e] == s_ for s_, e in enumerate(sw.slot_expert) if e >= 0)


def test_swapped_in_experts_compute_correctly(model_dir):
    """After swaps, a cache that holds every routed expert must reproduce the reference exactly."""
    m, eng = stream_model(model_dir, capacity=E - 2, extra=0, swaps_per_layer=E, decay=1.0)
    ids = IDS[:, :1]
    ref = ref_logits(model_dir, ids)
    # fixing a miss in layer L changes layer L+1's input (and routing), so repeat until the cache settles
    for _ in range(6):
        eng.reset_stats()
        out = m(ids, cache=make_prompt_cache(m))
        mx.eval(out); eng.after_token(); eng.flush()
        if eng.summary()["dropped"] == 0:
            break
    assert eng.summary()["dropped"] == 0
    assert mx.allclose(out, ref, atol=1e-4).item()


def test_profile_pins_and_preloads(model_dir, tmp_path):
    prof = tmp_path / "p.json"
    prof.write_text(json.dumps({str(l): [15, 14, 13] for l in range(4)}))
    m, eng = stream_model(model_dir, capacity=4, profile=str(prof))
    for b in eng.blocks.values():
        assert {15, 14, 13} <= set(b.switch.slot_expert.tolist())
        assert b.switch.pinned == {15, 14}      # at most half the cache is pinned
    eng.save_profile(tmp_path / "out.json")
    assert set(json.loads((tmp_path / "out.json").read_text())) == {"0", "1", "2", "3"}


def test_generate_loop_and_auto_capacity(model_dir):
    from moestream.load import generate
    from moestream.__main__ import auto_capacity

    class Tok:
        eos_token_id = 0
        chat_template = None
        def encode(self, s): return [5, 17, 3, 99]
        def decode(self, ids): return " ".join(map(str, ids))

    m, eng = stream_model(model_dir, capacity=6, extra=3)
    r = generate(m, Tok(), eng, "hi", max_tokens=8, chat=False)
    assert r["prompt_tokens"] == 4 and r["tokens"] <= 8 and r["decode_tok_s"] and 0 < r["coverage"] <= 1
    cap = auto_capacity(model_dir, reserve_gb=0.0, budget_gb=2.3)
    assert 8 <= cap <= E

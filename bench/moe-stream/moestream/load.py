"""Load an MLX MoE model with streamed experts, and a simple generation loop that drives the engine."""
from __future__ import annotations

import time
from pathlib import Path

import mlx.core as mx
from mlx_lm.models.cache import make_prompt_cache
from mlx_lm.utils import load_model, load_tokenizer

from .engine import EngineConfig, MoEStreamEngine


def resolve(model: str) -> Path:
    p = Path(model).expanduser()
    if p.exists():
        return p
    from huggingface_hub import snapshot_download
    return Path(snapshot_download(model, allow_patterns=["*.json", "*.safetensors", "*.py", "*.jinja", "tokenizer*", "*.txt", "*.model"]))


def load_streaming(model: str, cfg: EngineConfig | None = None):
    """Model with only non-expert weights resident (~2 GB for Qwen3-Coder-Next) + streaming engine."""
    path = resolve(model)
    m, config = load_model(path, lazy=True)       # nothing is read from disk yet
    engine = MoEStreamEngine(m, path, cfg).attach()  # swaps in streaming MoE blocks, preloads the cache
    mx.eval(m.parameters())                       # loads the remaining (non-expert) weights only
    tok = load_tokenizer(path)
    return m, tok, engine


def generate(model, tokenizer, engine: MoEStreamEngine, prompt: str, max_tokens: int = 256,
             temp: float = 0.0, chat: bool = True, on_token=None) -> dict:
    if chat and getattr(tokenizer, "chat_template", None):
        prompt = tokenizer.apply_chat_template([{"role": "user", "content": prompt}], add_generation_prompt=True, tokenize=False)
    ids = mx.array(tokenizer.encode(prompt))[None]
    cache = make_prompt_cache(model)
    t0 = time.perf_counter()
    logits = model(ids, cache=cache)[:, -1, :]
    mx.eval(logits)
    engine.after_token()
    t_prefill = time.perf_counter() - t0
    out = []
    t1 = time.perf_counter()
    eos = set(getattr(tokenizer, "eos_token_ids", None) or [tokenizer.eos_token_id])
    for _ in range(max_tokens):
        tok = mx.argmax(logits, axis=-1) if temp == 0 else mx.random.categorical(logits / temp)
        t = int(tok.item())
        if t in eos:
            break
        out.append(t)
        if on_token:
            on_token(tokenizer.decode([t]))
        logits = model(tok.reshape(1, 1), cache=cache)[:, -1, :]
        mx.eval(logits)
        engine.after_token()
    dt = time.perf_counter() - t1
    return {
        "text": tokenizer.decode(out), "prompt_tokens": int(ids.shape[1]), "tokens": len(out),
        "prefill_s": round(t_prefill, 2), "decode_tok_s": round(len(out) / dt, 2) if dt > 0 else None,
        **engine.summary(),
    }

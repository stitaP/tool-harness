"""ggufcache on a synthetic MoE GGUF (layout, miss detection, whole-expert prefetch, pinning, profile)."""
import json, os, sys
from pathlib import Path
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ggufcache as gc

L, E, ROWS, COLS = 4, 8, 64, 512          # each expert piece = 64*512*4 B = 128 KB


def make_model(path: Path):
    import gguf
    w = gguf.GGUFWriter(str(path), "qwen3next")
    w.add_block_count(L)
    w.add_tensor("token_embd.weight", np.zeros((16, COLS), np.float32))
    for l in range(L):
        w.add_tensor(f"blk.{l}.attn_norm.weight", np.ones(COLS, np.float32))
        for kind, base in (("gate", 1), ("up", 2), ("down", 3)):
            a = np.zeros((E, ROWS, COLS), np.float32)
            for e in range(E):
                a[e] = base * 1000 + l * 100 + e          # marks (kind, layer, expert)
            w.add_tensor(f"blk.{l}.ffn_{kind}_exps.weight", a)
        w.add_tensor(f"blk.{l}.ffn_gate_inp.weight", np.zeros((E, COLS), np.float32))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()


def evict(path: Path):
    fd = os.open(path, os.O_RDONLY)
    os.fsync(fd) if False else None
    os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
    os.close(fd)


def touch_page(path: Path, off: int):
    fd = os.open(path, os.O_RDONLY)
    os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_RANDOM)      # no read-ahead: behave like a single page fault
    os.pread(fd, 1, off)
    os.close(fd)


@pytest.fixture()
def model(tmp_path):
    p = tmp_path / "moe.gguf"
    make_model(p)
    os.sync()
    return p


def test_layout(model):
    shards, units, other, info = gc.read_layout(str(model))
    assert info["arch"] == "qwen3next" and len(units) == L * E
    assert all(len(u.pieces) == 3 and u.size == 3 * ROWS * COLS * 4 for u in units)
    data = np.memmap(model, dtype=np.uint8, mode="r")
    for u in units:
        for kind_base, pc in zip((1, 2, 3), u.pieces):
            v = np.frombuffer(data[pc.off: pc.off + 4].tobytes(), np.float32)[0]
            assert v == kind_base * 1000 + u.layer * 100 + u.expert
            last = np.frombuffer(data[pc.off + pc.size - 4: pc.off + pc.size].tobytes(), np.float32)[0]
            assert last == v
    assert other == 16 * COLS * 4 + L * (COLS * 4 + E * COLS * 4)


def test_miss_prefetch_pin_profile(model, tmp_path):
    prof = tmp_path / "p.json"
    c = gc.ExpertCache(str(model), budget_gb=(3 * ROWS * COLS * 4 * 1.5) / gc.GiB, profile=str(prof), io_threads=2, log=lambda *a: None)
    evict(model)
    c.prev_frac = c.fractions()
    if c.prev_frac.max() > 0.05:
        pytest.skip("page cache could not be dropped in this environment")
    i = c.index["1:3"]
    touch_page(model, c.units[i].pieces[0].off + 8192)        # llama starts reading expert 3 of layer 1 (gate)
    assert c.sample() == 1 and c.misses == 1
    assert c.drain(10)
    frac = c.fractions()
    assert frac[i] == 1.0, "whole expert (gate+up+down) prefetched"
    others = np.delete(frac, i)
    assert others.max() < 0.5, "other experts not read"
    assert c.prefetched_bytes >= c.units[i].size
    # the miss scored the expert; a re-plan pins it (budget fits one expert)
    added, dropped = c.replan()
    assert added == 1 and c.pinned[i] and c.pinned.sum() == 1
    st = c.state()
    assert st["pinned_experts"] == 1 and st["misses_total"] == 1
    c.save_profile()
    data = json.loads(prof.read_text())
    assert "1:3" in data["scores"]
    c.close()
    # a new session starts warm from the profile
    c2 = gc.ExpertCache(str(model), budget_gb=1.0, profile=str(prof), io_threads=2, log=lambda *a: None)
    assert c2.scores[c2.index["1:3"]] > 0
    added, _ = c2.apply(c2.plan())
    assert added == 1 and c2.fractions()[c2.index["1:3"]] == 1.0
    c2.close()


def test_pinned_experts_are_not_rescored(model):
    c = gc.ExpertCache(str(model), budget_gb=1.0, profile=None, io_threads=1, lock=False, log=lambda *a: None)
    c.pinned[:] = True
    c.prev_frac = np.zeros(c.n)
    assert c.sample() == 0
    c.close()


def test_split_shards(tmp_path):
    for i in (1, 2, 3):
        (tmp_path / f"M-UD-IQ2_XXS-0000{i}-of-00003.gguf").write_bytes(b"x")
    got = gc.shard_paths(str(tmp_path / "M-UD-IQ2_XXS-00001-of-00003.gguf"))
    assert [p.name for p in got] == [f"M-UD-IQ2_XXS-0000{i}-of-00003.gguf" for i in (1, 2, 3)]


def test_incomplete_download_is_reported(model, tmp_path):
    cut = tmp_path / "cut.gguf"
    cut.write_bytes(model.read_bytes()[: model.stat().st_size // 2])
    with pytest.raises(SystemExit, match="incomplete"):
        gc.read_layout(str(cut))

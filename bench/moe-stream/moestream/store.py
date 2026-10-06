"""Expert weights read straight from an MLX model's safetensors files.

MLX MoE checkpoints store each projection's experts stacked in one tensor, e.g.
``model.layers.7.mlp.switch_mlp.up_proj.weight`` with shape ``[E, out, in_packed]``.
Row-major layout makes expert ``e`` one contiguous byte range, so loading an expert is a
handful of ``pread`` calls (weight, scales, biases × gate/up/down) — no repacking, no
second copy on disk, and nothing goes through MLX's lazy loader (which would materialize
the whole stacked tensor). Reads bypass the OS file cache (macOS ``F_NOCACHE``): the expert
cache lives in GPU memory, so a page-cache copy would only steal RAM from it.
"""
from __future__ import annotations

import json
import os
import struct
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np

PROJS = ("gate_proj", "up_proj", "down_proj")
PARTS = ("weight", "scales", "biases")
_DTYPES = {"U32": np.uint32, "F16": np.float16, "BF16": np.uint16, "F32": np.float32, "U8": np.uint8, "I32": np.int32}
F_NOCACHE = 48


@dataclass
class TensorRef:
    file: str
    offset: int          # absolute byte offset of the tensor data in the file
    shape: tuple
    dtype: str           # safetensors dtype string
    per_expert: int      # bytes per expert slice

    def np_dtype(self):
        return _DTYPES[self.dtype]


def _read_header(path: str) -> tuple[dict, int]:
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        header = json.loads(f.read(n))
    return header, 8 + n


class ExpertStore:
    """Index of every routed-expert tensor in a model directory and a parallel reader."""

    def __init__(self, model_dir: str | Path, threads: int = 4, nocache: bool = True):
        self.dir = Path(model_dir)
        self.refs: dict[tuple[int, str, str], TensorRef] = {}
        self.num_experts = 0
        for f in sorted(self.dir.glob("*.safetensors")):
            header, base = _read_header(str(f))
            for key, meta in header.items():
                if key == "__metadata__" or ".switch_mlp." not in key:
                    continue
                # model.layers.{L}.mlp.switch_mlp.{proj}.{part}
                parts = key.split(".")
                layer = int(parts[parts.index("layers") + 1])
                proj, part = parts[-2], parts[-1]
                start, end = meta["data_offsets"]
                shape = tuple(meta["shape"])
                self.num_experts = max(self.num_experts, shape[0])
                self.refs[(layer, proj, part)] = TensorRef(str(f), base + start, shape, meta["dtype"], (end - start) // shape[0])
        if not self.refs:
            raise ValueError(f"no stacked switch_mlp expert tensors found in {self.dir}")
        self.layers = sorted({k[0] for k in self.refs})
        self.parts = sorted({k[2] for k in self.refs}, key=PARTS.index)
        self._fds: dict[str, int] = {}
        self._nocache = nocache
        self.pool = ThreadPoolExecutor(max_workers=max(1, threads))
        self.bytes_read = 0

    def expert_bytes(self, layer: int) -> int:
        return sum(self.refs[(layer, p, q)].per_expert for p in PROJS for q in self.parts)

    def _fd(self, path: str) -> int:
        fd = self._fds.get(path)
        if fd is None:
            fd = os.open(path, os.O_RDONLY)
            if self._nocache and sys.platform == "darwin":
                import fcntl
                fcntl.fcntl(fd, F_NOCACHE, 1)
            self._fds[path] = fd
        return fd

    def _read_one(self, ref: TensorRef, expert: int) -> np.ndarray:
        buf = os.pread(self._fd(ref.file), ref.per_expert, ref.offset + expert * ref.per_expert)
        if len(buf) != ref.per_expert:
            raise IOError(f"short read from {ref.file}")
        self.bytes_read += len(buf)
        return np.frombuffer(buf, dtype=ref.np_dtype()).reshape(ref.shape[1:])

    def read(self, layer: int, experts: list[int]) -> dict[tuple[str, str], np.ndarray]:
        """Load `experts` of one layer → {(proj, part): array [len(experts), ...]} (parallel reads)."""
        jobs = [(p, q, e) for p in PROJS for q in self.parts for e in experts]
        arrays = list(self.pool.map(lambda j: self._read_one(self.refs[(layer, j[0], j[1])], j[2]), jobs))
        out: dict[tuple[str, str], np.ndarray] = {}
        i = 0
        for p in PROJS:
            for q in self.parts:
                out[(p, q)] = np.stack(arrays[i:i + len(experts)])
                i += len(experts)
        return out

    def close(self):
        for fd in self._fds.values():
            os.close(fd)
        self._fds.clear()
        self.pool.shutdown(wait=False)

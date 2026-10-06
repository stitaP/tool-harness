#!/bin/bash
# Runs every step for Qwen3-Coder-Next 2-bit with the moestream prefetch/cache engine.
# Usage:  bash ~/Documents/GitHub/tool-harness/bench/moe-stream/run-2bit.sh
# Re-running is safe: finished steps are skipped and downloads resume.
set -uo pipefail
cd "$(dirname "$0")"
REPO=${REPO:-Open4bits/Qwen3-Coder-Next-mlx-2Bit}
M=${MODEL_DIR:-$HOME/Documents/models/qcn-2bit}
PROFILE=coding-profile-2bit.json
mkdir -p results
LOG=results/run-2bit-$(date +%Y%m%d-%H%M%S).log
exec > >(tee -a "$LOG") 2>&1
say() { printf '\n=== %s  %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { say "STOPPED: $*"; exit 1; }

say "1/7 Python environment"
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv || die "python3 -m venv failed"; fi
source .venv/bin/activate
python -c "import mlx, mlx_lm, huggingface_hub, pytest" 2>/dev/null || pip install -U mlx mlx-lm huggingface_hub pytest || die "pip install failed"
python -m pytest tests -q || die "engine tests failed"

HFDL() { if command -v hf >/dev/null; then hf download "$@"; else huggingface-cli download "$@"; fi; }

say "2/7 Check that $REPO is really 2-bit MLX"
HFDL "$REPO" config.json --local-dir "$M" >/dev/null || die "cannot download config.json from $REPO"
BITS=$(python - "$M/config.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
q = c.get("quantization") or c.get("quantization_config") or {}
print(q.get("bits", "none"), c.get("model_type", "?"))
PY
)
echo "quantization bits / model_type: $BITS"
case "$BITS" in 2\ *) ;; *) die "$REPO is not a 2-bit MLX model ($BITS). Tell Claude; the fallback is mlx-community/Qwen3-Coder-Next-4bit." ;; esac

say "3/7 Download the model (about 25 GB; resumes if interrupted)"
FREE=$(df -g "$HOME/Documents" | awk 'NR==2{print $4}')
echo "free on disk: ${FREE} GB"
[ "${FREE:-0}" -ge 30 ] || die "need about 30 GB free"
HFDL "$REPO" --local-dir "$M" || die "download failed (run the script again to resume)"
du -sh "$M"

say "4/7 Free memory for the GPU"
if pgrep -x llama-server >/dev/null; then
  echo "llama-server (PrakritTattva run) is using about 4-5 GB of RAM/GPU."
  read -r -p "Stop it for this benchmark? [y/N] " a
  if [ "${a:-n}" = y ]; then pkill -x llama-server; sleep 3; echo "stopped (restart the phase run later)"; else echo "keeping it; results will be slower"; fi
fi
echo "Raising the GPU memory limit to 12 GB until reboot (macOS asks for your password):"
sudo sysctl iogpu.wired_limit_mb=12288 || echo "skipped; the engine uses the default limit"
memory_pressure | tail -1 || true

say "5/7 Benchmark + record the coding profile"
[ -f "$PROFILE" ] || python -m moestream bench --model "$M" --save-profile "$PROFILE" || die "bench failed"

say "6/7 Speed / quality sweep"
python -m moestream sweep --model "$M" --profile "$PROFILE" --extras 0,3,6,10 || die "sweep failed"

say "7/7 Chat test"
python -m moestream chat --model "$M" --profile "$PROFILE" --extra 6 --swaps 4 "Write a CSV parser in Python" || die "chat failed"

say "DONE. Log: $(pwd)/$LOG   Results: $(pwd)/results.jsonl"

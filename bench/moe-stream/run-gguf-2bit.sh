#!/bin/bash
# Qwen3-Coder-Next (80B-A3B) UD-IQ2_XXS GGUF on a 16 GB Mac:
#   llama-server (attention on Metal, experts memory-mapped from the SSD via --cpu-moe)
#   + ggufcache (keeps the hottest experts pinned in RAM, prefetches whole experts on a miss, learns a profile).
#
#   bash run-gguf-2bit.sh            start cache + server (Ctrl-C stops both)
#   bash run-gguf-2bit.sh bench      in a 2nd Terminal: measure tok/s (run it twice: the 2nd run uses the learned cache)
#   bash run-gguf-2bit.sh status     cache statistics
#
# Settings (environment): MODEL=… PIN_GB=4 CTX=16384 THREADS=6 PORT=8081 EXPERTS=10 LLAMA_EXTRA="…"
set -uo pipefail
cd "$(dirname "$0")"
HERE=$(pwd)
PORT=${PORT:-8081}
VENV=$HERE/.venv-gguf
PY=$VENV/bin/python
STATE=$HERE/results/ggufcache-state.json
PROFILE=$HERE/results/qwen3-coder-next-iq2xxs-profile.json
mkdir -p results

setup() {
  if [ ! -x "$PY" ]; then python3 -m venv "$VENV" || { echo "python3 -m venv failed"; exit 1; }; fi
  "$PY" -c "import gguf, numpy" 2>/dev/null || "$VENV/bin/pip" install -q -U gguf numpy || { echo "pip install failed"; exit 1; }
}

case "${1:-start}" in
  bench)  setup; exec "$PY" ggufcache.py bench --url "http://127.0.0.1:$PORT" "${@:2}" ;;
  status) setup; exec "$PY" ggufcache.py status --state "$STATE" ;;
  start)  ;;
  *) echo "usage: bash $0 [start|bench|status]"; exit 1 ;;
esac

if [ -z "${MODEL:-}" ]; then
  for d in "$HOME/Documents/AgenticAI/GGUF" "$HOME/Documents/models/qcn-gguf" "$HOME/Documents/models"; do
    f=$(ls "$d"/*Coder-Next*UD-IQ2_XXS*.gguf 2>/dev/null | grep -v -- '-0000[2-9]-of-' | head -1)
    [ -n "$f" ] && { MODEL=$f; break; }
  done
fi
[ -n "${MODEL:-}" ] && [ -f "$MODEL" ] || { echo "Model not found. Set MODEL=/path/to/Qwen3-Coder-Next-UD-IQ2_XXS.gguf"; exit 1; }
LOG=results/gguf-run-$(date +%Y%m%d-%H%M%S).log
exec > >(tee -a "$LOG") 2>&1
say() { printf '\n=== %s  %s\n' "$(date +%H:%M:%S)" "$*"; }

say "1/5 Python tools"
setup

say "2/5 Model layout ($MODEL)"
"$PY" ggufcache.py inspect "$MODEL" || exit 1
OTHER_GB=$("$PY" -c "import ggufcache as g; print(round(g.read_layout('$MODEL')[2]/2**30,2))")

say "3/5 Memory plan"
command -v llama-server >/dev/null || { echo "llama-server not found: brew install llama.cpp"; exit 1; }
pgrep -x llama-server >/dev/null && { echo "another llama-server is running — stop it first"; exit 1; }
TOTAL_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
if [ -z "${PIN_GB:-}" ]; then
  # RAM - ~4.5 GB macOS/apps - ~4 GB Claude desktop VM - Metal weights - 1.5 GB KV/compute, kept between 1 and 8 GB
  PIN_GB=$(python3 -c "print(max(1.0, min(8.0, round($TOTAL_GB - 4.5 - 4 - $OTHER_GB - 1.5, 1))))")
fi
echo "RAM ${TOTAL_GB} GB · Metal weights ${OTHER_GB} GB · pinned expert cache ${PIN_GB} GB (override: PIN_GB=…)"
ulimit -l unlimited 2>/dev/null || echo "note: could not raise the mlock limit (ulimit -l = $(ulimit -l)); the cache falls back to prefetch-only if needed"
memory_pressure 2>/dev/null | tail -1

say "4/5 llama-server on http://127.0.0.1:$PORT (OpenAI API at /v1, model name qwen3-coder-next)"
HELP=$(llama-server --help 2>&1)
EXTRA=()
grep -q -- '--load-mode' <<<"$HELP" && EXTRA+=(--load-mode mmap)
grep -q -- '--cache-ram' <<<"$HELP" && EXTRA+=(--cache-ram 0)
grep -q -- '--no-warmup' <<<"$HELP" && EXTRA+=(--no-warmup)   # warm-up would touch ALL experts (22 GB)
# EXPERTS=N: experts used per token (model default 10). Fewer = less read from the SSD per token = faster, some quality loss
[ -n "${EXPERTS:-}" ] && EXTRA+=(--override-kv "qwen3next.expert_used_count=int:${EXPERTS}")
# LLAMA_EXTRA="…": more llama-server flags (e.g. "--n-cpu-moe 40" to keep some layers' experts on the GPU)
[ -n "${LLAMA_EXTRA:-}" ] && read -r -a _ex <<<"$LLAMA_EXTRA" && EXTRA+=("${_ex[@]}")
# one slot: parallel requests would compete for the same SSD-streamed experts (and each slot costs KV/state);
# --metrics exposes token counters at /metrics
CPUMOE=(--cpu-moe); [[ " ${LLAMA_EXTRA:-} " == *" --n-cpu-moe "* ]] && CPUMOE=()   # --n-cpu-moe replaces --cpu-moe
llama-server -m "$MODEL" ${CPUMOE[@]+"${CPUMOE[@]}"} -ngl 99 -c "${CTX:-16384}" -np 1 -fa on -t "${THREADS:-6}" --jinja --metrics \
  --host 127.0.0.1 --port "$PORT" --alias qwen3-coder-next ${EXTRA[@]+"${EXTRA[@]}"} &
LLAMA_PID=$!
trap 'say "stopping"; kill $LLAMA_PID 2>/dev/null' EXIT INT TERM
for i in $(seq 1 600); do
  curl -s "http://127.0.0.1:$PORT/health" | grep -q '"ok"' && break
  kill -0 $LLAMA_PID 2>/dev/null || { echo "llama-server exited — if it says 'unknown model architecture: qwen3next', run: brew upgrade llama.cpp"; exit 1; }
  sleep 1
done
say "5/5 Expert cache daemon (starts after the model is loaded, so load-time reads are not learned as usage)"
rm -f "$STATE"
"$PY" ggufcache.py run "$MODEL" --budget-gb "$PIN_GB" --profile "$PROFILE" --state "$STATE" &
CACHE_PID=$!
trap 'say "stopping"; kill $LLAMA_PID 2>/dev/null; kill -INT $CACHE_PID 2>/dev/null; wait $CACHE_PID 2>/dev/null' EXIT INT TERM
for i in $(seq 1 900); do [ -f "$STATE" ] && break; kill -0 $CACHE_PID 2>/dev/null || { echo "cache daemon exited"; exit 1; }; sleep 1; done

echo
echo "READY. In another Terminal:  bash $HERE/run-gguf-2bit.sh bench     (then again — the 2nd run uses the learned cache)"
echo "Cache stats:                 bash $HERE/run-gguf-2bit.sh status"
echo "Ctrl-C here stops the server and saves the expert profile to $PROFILE"
wait $LLAMA_PID

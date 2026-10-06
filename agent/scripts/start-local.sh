#!/bin/bash
# Start stitaP agent locally (macOS / Linux). Same as: node agent/scripts/start-local.mjs <model.gguf>
# See agent/scripts/start-local.mjs for the settings (CTX, KV, FIT_MARGIN_MB, PROFILE, PORT, UI_PORT, STITAP_ROOT …).
exec node "$(dirname "$0")/start-local.mjs" "$@"

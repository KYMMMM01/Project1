#!/usr/bin/env bash
# First-use hitches of a battle, measured on real waves through the Aside runner (the dev server must be up, nothing may be saved meanwhile).
#   tools/battle_frames.sh <chapter> "<target waves>" ["<waves played to their end>"] [budget seconds]
#   e.g. tools/battle_frames.sh 2 "5, 8" "8" 85     (one run is at most 120 s: about four target waves)
# Output lines: RUN (frames, median, p95, p99), FIRSTKIND <enemy> w<wave> <six frame times>, WAVE <n> ... worst [[frame, ms], ...].
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp)"
{ echo "const CH = ${1:?chapter}; const TARGETS = [${2:?waves}]; const FULL = [${3:-}]; const BUDGET = ${4:-85};"; cat "$HERE/battle_frames.js"; } > "$TMP"
"$HERE/battle_motion.sh" "frames_ch$1" "$TMP"
rm -f "$TMP"

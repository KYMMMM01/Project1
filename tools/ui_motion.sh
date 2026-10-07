#!/usr/bin/env bash
# Run a motion-capture moment script through the Aside runner and tile what it shot.
#   tools/ui_motion.sh <key> <moment.js | "inline js">
# Prepends tools/ui_motion_capture.js (scene, adv, steps, frames, down, up, tile ...) to the moment. Frames
# land in <scratchpad>/shots/<key>; every `tile(...)` line the moment prints becomes strip_<name>.png via
# tools/ui_motion_tile.py. Always end the moment with `await done();`.
set -u
KEY="${1:?key}"; BODY="${2:?moment script or inline js}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRATCH="${SCRATCH:-C:/Users/dbals/AppData/Local/Temp/claude/C--MyProject-Project1/bab6e25d-5797-4d29-9afe-b47772556f90/scratchpad}"
OUT="$SCRATCH/shots/$KEY"
TMP="$(mktemp)"; LOG="$(mktemp)"
mkdir -p "$OUT"; find "$OUT" -maxdepth 1 -name '*_t[0-9]*.png' -delete
{ cat "$HERE/ui_motion_capture.js"; if [ -f "$BODY" ]; then cat "$BODY"; else printf '%s\n' "$BODY"; fi; } > "$TMP"
SHOT_DIR="$OUT" "$HERE/aside_run.sh" "$TMP" > "$LOG" 2>&1
grep -v '^shot ->\|^SHOT \|^TILE \|SESSION_DIR\|^\S*\[ok' "$LOG" | cut -c1-600
grep '^TILE ' "$LOG" | while read -r _ name region cols cw; do
  python "$HERE/ui_motion_tile.py" "$OUT" "$name" --region "$region" --cols "$cols" --cw "$cw" | sed 's|.*scratchpad[\/]||'
done
rm -f "$TMP" "$LOG"

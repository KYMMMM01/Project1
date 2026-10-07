#!/usr/bin/env bash
# Zoomed captures of any rectangle of the design space (the owner plays on a high-resolution screen; 1x stills hide faults of a few pixels).
#   tools/kit_zoom.sh <key> <script.js | "inline js">
# Prepends tools/ui_motion_capture.js (scene, richHome, adv, tap, texts ...) and tools/kit_zoom.js (zoom, zoomAll, probe, boxesOf).
# Each `zoom(name, rect, k)` writes <scratchpad>/shots/<key>/z_<name>.png already cut down to the rectangle; open it with the Read tool.
# End the script with `await done();`. Runs go through the Aside runner, so they are serialised with everyone else's.
set -u
KEY="${1:?key}"; BODY="${2:?script or inline js}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRATCH="${SCRATCH:-C:/Users/dbals/AppData/Local/Temp/claude/C--MyProject-Project1/bab6e25d-5797-4d29-9afe-b47772556f90/scratchpad}"
OUT="$SCRATCH/shots/$KEY"
TMP="$(mktemp)"; LOG="$(mktemp)"
mkdir -p "$OUT"
{ cat "$HERE/ui_motion_capture.js" "$HERE/kit_zoom.js"; if [ -f "$BODY" ]; then cat "$BODY"; else printf '%s\n' "$BODY"; fi; } > "$TMP"
SHOT_DIR="$OUT" "$HERE/aside_run.sh" "$TMP" > "$LOG" 2>&1
grep -v '^shot ->\|^SHOT \|^ZOOM \|SESSION_DIR\|^\S*\[ok' "$LOG" | cut -c1-900
grep '^ZOOM ' "$LOG" | while read -r _ name cw ch pw ph _; do
  python - "$OUT/$name.png" "$cw" "$ch" "$pw" "$ph" <<'PY'
import sys
from PIL import Image
p, cw, ch, pw, ph = sys.argv[1], *map(float, sys.argv[2:6])
im = Image.open(p)
# crop_shots may have resized the canvas capture: work in canvas fractions.
fx, fy = im.width / pw, im.height / ph
im.crop((0, 0, min(im.width, round(cw * fx)), min(im.height, round(ch * fy)))).save(p)
print('zoom ->', p.replace('\\', '/').split('scratchpad/')[-1], Image.open(p).size)
PY
done
rm -f "$TMP" "$LOG"

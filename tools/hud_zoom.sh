#!/usr/bin/env bash
# Run one script through the Aside runner with the battle helpers and the zoom helpers prepended.
#   tools/hud_zoom.sh <key> <script.js>      zoomed stills land in $ZOOM_OUT/<key>/ (default: ./.shots/zoom)
# The script ends with `await done();` like every runner script. See tools/hud_zoom.js for hzShot / hzTall / hzTexts.
set -u
KEY="${1:?key}"
SRC="${2:?script}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${ZOOM_OUT:-./.shots/zoom}/$KEY"
TMP="$(mktemp)"
cat "$HERE/battle_motion.js" "$HERE/hud_zoom.js" "$SRC" > "$TMP"
SHOT_DIR="$OUT" "$HERE/aside_run.sh" "$TMP"
rm -f "$TMP"

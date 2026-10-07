#!/usr/bin/env bash
# Run one moment script through the Aside runner with the battle motion-capture helpers prepended.
#   tools/battle_motion.sh <key> <moment.js>      strips land in $MOTION_OUT/<key>/ (default: ./.shots/motion)
set -u
KEY="${1:?key}"
SRC="${2:?moment script}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${MOTION_OUT:-./.shots/motion}/$KEY"
TMP="$(mktemp)"
cat "$HERE/battle_motion.js" "$SRC" > "$TMP"
SHOT_DIR="$OUT" "$HERE/aside_run.sh" "$TMP"
rm -f "$TMP"

#!/usr/bin/env bash
# App icon concepts v1 (2026-11-11): four concepts in parallel through Codex image_gen, results copied here as <key>.png.
# The prompt goes before -i: -i takes every following argument as an image path.
CODEX=$(ls -d /c/Users/User/AppData/Local/OpenAI/Codex/bin/*/codex.exe | head -1)
HERE=/c/MyProject/Project1/art/appicon_v1
REF=C:/MyProject/Project1/art/ref/unit_style.png
COMMON="Mobile game app icon, square 1024x1024, full-bleed: the background fills the whole square edge to edge, no rounded corners, no frame, no border, absolutely no text or letters. Keep the main subject centred and inside the central 66 percent circle (Android adaptive icon safe zone) so nothing important is cropped by a circle mask. Bold, simple silhouette that still reads at 48 pixels. Style must match the attached reference: cute chibi cat sticker art, thick dark-brown outline, white sticker rim around the character, flat warm colours with soft cel shading, big glossy eyes. The game: house cats defend the home while their owner is out (a cosy merge tower defense), paper-craft feeling. Familiar round cat breeds with bold stripes, no spotted coats."
declare -A P
P[a_shield]="$COMMON Concept: a round orange tabby kitten face peeking over a small wooden shield that carries a paw-print emblem, determined but happy, red bandana. Background: warm coral with a soft cream circle behind the subject."
P[b_team]="$COMMON Concept: three cat faces squeezed together as a team: an orange tabby in the middle (largest, in front), a ragdoll with blue earmuffs on the left and a cream scottish fold on the right, all cheerful. Background: soft teal with faint paper texture."
P[c_house]="$COMMON Concept: a chunky cute house-shaped badge (simple roof and chimney) with an orange tabby kitten face filling the round window, guarding the home, tiny paw prints on the roof. Background: mustard yellow with a subtle sunburst."
P[d_face]="$COMMON Concept: big close-up of the reference orange tabby kitten's head and raised paw holding its little wooden sword beside its face, confident grin, red bandana visible at the bottom. Background: coral with a soft radial sunburst."
for k in "${!P[@]}"; do
  ( out=$("$CODEX" exec -s read-only --skip-git-repo-check -C "C:/MyProject/Project1/art/appicon_v1" "Use the imagegen skill with the built-in image_gen tool to generate exactly ONE image. ${P[$k]} Reply with only the absolute path of the saved PNG." -i "$REF" </dev/null 2>"$HERE/$k.log" | tail -1 | tr -d '\r')
    if [ -f "$out" ]; then cp "$out" "$HERE/$k.png"; echo "$k ok $out"; else echo "$k FAILED: $out"; fi ) &
done
wait

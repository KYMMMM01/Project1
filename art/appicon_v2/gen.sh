#!/usr/bin/env bash
# App icon concepts v2 (2026-11-11): v1's four concepts redrawn from the game's own characters (owner: "얼굴이 기존 캐릭터랑 다르잖아").
# References are the in-game unit pictures; the prompt goes before -i (-i takes every following argument as an image path).
CODEX=$(ls -d /c/Users/User/AppData/Local/OpenAI/Codex/bin/*/codex.exe | head -1)
HERE=/c/MyProject/Project1/art/appicon_v2
U=C:/MyProject/Project1/art/units_v2
COMMON="Mobile game app icon, square 1024x1024, full-bleed: the background fills the whole square edge to edge, no rounded corners, no frame, no border, absolutely no text or letters. Every part of the characters (ears, paws, props) must stay inside the central circle of 60 percent of the width, with clear background around it, because launchers crop the icon to a circle. Bold, simple silhouette that still reads at 48 pixels. CHARACTER FIDELITY IS THE TOP PRIORITY: draw exactly the cat characters in the attached reference pictures, in exactly their art style: the same face design (small solid black oval eyes with one tiny white highlight dot, thin short angled eyebrows, small pink nose, open mouth with one small fang), the same coat colours and stripes, the same outfits and accessories, the same dark-brown outline, white sticker rim and flat colours with light shading. Do NOT give them big glossy anime eyes, coloured irises or eyelashes (only the ragdoll keeps its blue eyes exactly as in its picture)."
BOXER="The orange tabby boxer cat from the first reference: red boxing gloves, red neckerchief, bandage plaster on its cheek, bandaged tail tip."
declare -A P
declare -A R
P[a_shield]="$COMMON Concept: $BOXER It peeks over a small wooden shield with a paw-print emblem, both red gloves resting on the shield's top edge, determined happy face. Background: warm coral with a soft cream circle behind the subject."
R[a_shield]="$U/unit_w_paw.png"
P[b_team]="$COMMON Concept: three cats squeezed together as a team, heads and shoulders only: in the middle and in front $BOXER On the left the ragdoll with blue earmuffs and blue scarf from the second reference, on the right the cream scottish fold with the golden bell collar from the third reference, all cheerful. Keep the three heads small enough that all ears stay inside the central circle. Background: soft teal with faint paper texture."
R[b_team]="$U/unit_w_paw.png $U/unit_m_snow.png $U/unit_t_bell.png"
P[c_house]="$COMMON Concept: a chunky cute house-shaped badge (simple red roof and chimney) with the face of $BOXER looking out of the round window, one red glove on the window sill, guarding the home. The whole house, roof and chimney included, stays inside the central circle. Background: mustard yellow with a subtle sunburst."
R[c_house]="$U/unit_w_paw.png"
P[d_face]="$COMMON Concept: close-up of the head and one raised red glove of $BOXER, confident grin, red neckerchief at the bottom. Ears and glove fully inside the central circle, not touching the edges. Background: coral with a soft radial sunburst."
R[d_face]="$U/unit_w_paw.png"
for k in "${!P[@]}"; do
  ( out=$("$CODEX" exec -s read-only --skip-git-repo-check -C "C:/MyProject/Project1/art/appicon_v2" "Use the imagegen skill with the built-in image_gen tool to generate exactly ONE image. ${P[$k]} Reply with only the absolute path of the saved PNG." -i ${R[$k]} </dev/null 2>"$HERE/$k.log" | tail -1 | tr -d '\r')
    if [ -f "$out" ]; then cp "$out" "$HERE/$k.png"; echo "$k ok"; else echo "$k FAILED: $out"; fi ) &
done
wait

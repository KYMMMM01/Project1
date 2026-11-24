#!/usr/bin/env bash
# One codex imagegen call per sample, all in parallel; each writes <name>.path with the saved PNG path.
S=/c/Users/User/AppData/Local/Temp/claude/55d696287dfcd730/93d4c35c-65a0-4342-b945-5f260ec45ef4/scratchpad/cos
CODEX=$(ls -d /c/Users/User/AppData/Local/OpenAI/Codex/bin/*/codex.exe | head -1)
STYLE="Match the attached reference pictures exactly in rendering style: matte flat colours with soft cel shading, thin dark-brown outlines, a white sticker border around the whole object, warm cream and kraft-paper palette like the attached game screen. No glossy highlights, no text, no letters, no numbers, no watermark, no cat characters. Genuinely transparent background (real alpha channel), nothing else in the image."
FRAME="Draw a game UI AVATAR FRAME: a circular ring that goes around a round profile picture, seen flat from the front, centred in a square image. The inside of the ring must be a perfect empty circle that is fully transparent, with an inner diameter of 77% of the image width. The ring band is about 8% of the image width. Decorations may sit on the band but must never cover the inner circle, and everything stays inside the image with a small margin."
PLATE="Draw a game UI NAME PLATE for a player nickname: one wide horizontal plate, aspect ratio 6 to 1 (width to height), centred in a landscape image and spanning almost the full image width, seen flat from the front. The centre of the plate (85% of its width, 60% of its height) must be a plain light calm surface with at most a faint paper texture, so dark brown text written there later reads clearly. Decorations only at the left and right ends and as a thin border."
run() { # name, kind prompt, theme
  # -i takes several values, so the prompt goes in on stdin
  ( cd "$S" && printf '%s' "Use the imagegen skill with the built-in image_gen tool to generate exactly ONE image. $2 Theme: $3 $STYLE Reply with only the absolute path of the saved PNG." \
    | "$CODEX" exec -s read-only --skip-git-repo-check -C "$S" -i v2_t_chef.png -i v2_m_snow.png -i ui_home.png \
    > "$S/$1.log" 2>&1; tail -1 "$S/$1.log" > "$S/$1.path" ) &
}
run frame_wood "$FRAME" "a warm light-oak wooden ring with visible wood grain, a few tiny carved paw prints and two small brass nails. Simple and friendly, the basic gold-coin shop tier."
run frame_sakura "$FRAME" "a pale pink wreath of cherry blossoms and small petals over a soft pink band, a cluster of blossoms at the top and at the bottom. Prettier than a basic frame, the gem shop tier."
run frame_rank_1 "$FRAME" "a polished gold ring with a small golden crown sitting on the top of the band, a red ribbon tied at the bottom, a few tiny sparkle stars. The most precious frame, the weekly ranking number-one reward."
run plate_paw "$PLATE" "cream paper plate with a stitched dashed border in brown and a few small brown paw prints at each end. The basic gold-coin shop tier."
run plate_night "$PLATE" "a navy starry night-sky border with a small crescent moon at the left end and little stars at the right end, around a light lavender-cream centre panel. The gem shop tier."
run plate_rank_1 "$PLATE" "a gold plate with green laurel leaves at both ends and a small golden crown at the left end, around a light cream-gold centre panel. The weekly ranking number-one reward."
wait
echo done

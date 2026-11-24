#!/usr/bin/env bash
# The remaining frames and plates of docs/명세_프로필꾸미기.md 8.2 and 8.3, 7 codex imagegen calls at a time.
S=C:/Users/User/AppData/Local/Temp/claude/55d696287dfcd730/93d4c35c-65a0-4342-b945-5f260ec45ef4/scratchpad/cos/r2
CODEX=$(ls -d /c/Users/User/AppData/Local/OpenAI/Codex/bin/*/codex.exe | head -1)
STYLE="Same rendering style and finish as the attached pictures (they are approved pieces of the same set): matte flat colours with soft cel shading, thin dark-brown outlines, a white sticker border around the whole object, warm cosy cat-game palette. No glossy highlights, no text, no letters, no numbers, no watermark, no full cat characters. Genuinely transparent background (real alpha channel), nothing else in the image."
FRAME="Draw a game UI AVATAR FRAME of the same set as the attached frames: a circular ring around a round profile picture, seen flat from the front, centred in a square image. The inside of the ring is a perfect empty circle, fully transparent, with an inner diameter of 77% of the image width; the ring band is about 8% of the image width. Decorations sit on the band and stay inside the outer edge of the ring, never sticking out more than 3% of the image width beyond it and never covering the inner circle. Keep the bottom quarter of the ring plain, because a level label covers it; put the main decorations on the upper left, the upper right and the sides."
PLATE="Draw a game UI NAME PLATE of the same set as the attached plates: one wide horizontal plate, aspect ratio 6 to 1 (width to height), centred in a landscape image and spanning almost the full image width, seen flat from the front. The centre of the plate (85% of its width, 60% of its height) is a plain light calm surface with at most a faint texture, so dark brown text written there later reads clearly. Decorations only at the left and right ends and on the border, sticking out above or below the plate by at most 15% of its height."
run() { # name, kind prompt, theme, refs...
  local name=$1 kind=$2 theme=$3; shift 3
  local refs=(); for r in "$@"; do refs+=(-i "$r"); done
  printf '%s' "Use the imagegen skill with the built-in image_gen tool to generate exactly ONE image. $kind Theme: $theme $STYLE Reply with only the absolute path of the saved PNG." \
    | "$CODEX" exec -s read-only --skip-git-repo-check -C "$S" "${refs[@]}" > "$S/$name.log" 2>&1
  tail -1 "$S/$name.log" | tr -d '\r' > "$S/$name.path"
}
F=(v2_t_chef.png frame_wood.png frame_rank_1.png)
P=(v2_t_chef.png plate_paw.png plate_rank_1.png)
jobs_list=(
"frame_leaf|F|a fresh wreath of small green leaves and two tiny acorns wound around a light wooden band. Gold-coin shop tier."
"frame_ribbon|F|a soft pastel pink and mint satin ribbon wrapped around the band in a spiral, a small neat bow on the upper right. Gold-coin shop tier."
"frame_yarn|F|a chunky knitted yarn band in warm cream and coral with visible knit stitches, a small yarn ball with a loose strand resting on the upper left. Gold-coin shop tier."
"frame_star|F|a deep navy band dotted with little golden five-point stars and tiny twinkles, one bigger star on the upper right. Prettier than the gold tier, the gem shop tier."
"frame_chapter|F|a cosy little house theme: a warm brick-and-wood band with a tiny red roof and chimney puffing a little smoke on the upper left and a small lit window on the upper right. An achievement reward for finishing the fifth chapter."
"frame_butler|F|a fussy butler theme: a black and white tuxedo-patterned band with a tiny black bow tie on the upper left and a small silver serving tray with a cloche on the upper right. An achievement reward for pleasing picky butlers."
"frame_dungeon|F|a band made of overlapping shiny gold coins with paw prints stamped on them, a small heap of coins on the upper right. An achievement reward for clearing the gold dungeon."
"frame_endless|F|an endless night theme: a dark indigo band with a crescent moon on the upper left, small stars and a softly glowing swirl that loops around the band. An achievement reward for surviving long in endless mode."
"frame_awaken|F|an awakening magic theme: a violet and teal band etched with softly glowing runes, small magic sparkles and a glowing gem on the upper right. An achievement reward for many awakenings."
"frame_honor_butler|F|the butler of butlers, a rare honour: an ornate band of polished silver and gold filigree with a small jewelled bow-tie emblem on the upper left and a tiny gold key on the upper right. Clearly more precious than the achievement frames."
"frame_honor_endless|F|the butler with no end, a rare honour: a midnight-blue band framed by an ornate gold rim, a small comet with a sparkling tail curving around the upper part and tiny constellations. Clearly more precious than the achievement frames."
"frame_rank_3|F|a polished gold band, a gold ribbon rosette with two short tails on the upper right and a few small sparkles. The weekly ranking 2nd to 3rd place reward, a little less grand than the crown frame."
"frame_rank_10|F|a polished silver band, a silver ribbon rosette with two short tails on the upper right and a couple of small sparkles. The weekly ranking 4th to 10th place reward."
"frame_rank_100|F|a band of sturdy kraft cardboard with a hand-cut paper medal sticker on the upper right, held by a strip of tape. The weekly ranking 11th to 100th place reward, humble and cute."
"plate_dots|P|cream plate with a border of soft coral polka dots and a thin brown outline. Gold-coin shop tier."
"plate_stripe|P|cream plate with a border of mint and cream candy stripes. Gold-coin shop tier."
"plate_fish|P|light blue-grey plate edge with a small cartoon fish at each end (a fish skeleton on the right), little bubbles. Gold-coin shop tier."
"plate_garden|P|cream plate with clusters of small pink, yellow and white flowers and leaves at both ends, a light green border. Prettier than the gold tier, the gem shop tier."
"plate_wins|P|cream plate with a red and gold border, a small gold trophy at the left end and a little victory pennant at the right end. An achievement reward for many wins."
"plate_merge|P|cream plate with a teal border, at each end two small rounded tiles snapping together with a little burst of sparkles. An achievement reward for many merges."
"plate_daily|P|cream plate like a tear-off calendar page with a perforated top edge, a small sun at the left end and a little check mark stamp at the right end. An achievement reward for daily challenges."
"plate_units|P|cream plate with a soft orange border, tiny cat ears and paws peeking over the top edge at both ends. An achievement reward for collecting many cats."
"plate_account|P|a sturdy brown leather plate with stitched edges and a small bronze medal with a ribbon at the left end. An achievement reward for a high account level, the veteran."
"plate_honor_relics|P|the toy museum, a rare honour: an ornate gold museum frame plate with a ball of yarn, a toy mouse and a feather wand displayed at the ends. Clearly more precious than the achievement plates."
"plate_honor_wins|P|the undefeated butler, a rare honour: a deep red plate with an ornate gold rim, a gold trophy at the left end and gold laurels at both ends. Clearly more precious than the achievement plates."
"plate_rank_10|P|the same layout as the gold number-one plate but in polished silver: a silver rim, a small silver star at the left end and silver laurels at both ends, light cream centre. The weekly ranking top-10 reward."
)
n=0
for j in "${jobs_list[@]}"; do
  IFS='|' read -r name kind theme <<< "$j"
  if [ -s "$S/$name.path" ] && grep -q '\.png$' "$S/$name.path"; then continue; fi
  if [ "$kind" = F ]; then run "$name" "$FRAME" "$theme" "${F[@]}" & else run "$name" "$PLATE" "$theme" "${P[@]}" & fi
  n=$((n + 1)); if [ $((n % 7)) -eq 0 ]; then wait; fi
done
wait
echo done

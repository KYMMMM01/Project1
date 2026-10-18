#!/usr/bin/env python
"""Skill art candidates, SECOND ROUND (2026-10-18): the ninja's shadow clone (single + stacked pair), the samurai's cut and the cosmo
cat's meteor, redrawn after the owner's comments on round one (art/skills_v1/_sheet.png). The capsules (B) and the cloud (B) are done.

    python art/skills_v1/build_jobs_r2.py   -> art/skills_v1/jobs_r2.json
    python tools/gen_image.py --batch art/skills_v1/jobs_r2.json --out-dir art/skills_v1 --parallel 3 --only clone2_a,...   (singles first)
    ... then --only pair2_a,pair2_b,pair2_c  (the pairs attach the finished single clone as their second reference)

The owner's words (round one):
  1  "분신이 아니라 유령 같아보임 연기 꼬리 말고 다리 달아줘 색감도 그림자 느낌으로 해줘 너무 진하지는 않고 분신들의 외관이 보일 정도로"; pair: B (shoulder to shoulder)
  2  "C로 잘 보이게 강조를 더 해줘"
  3  "B인데 얼굴은 빼주고 충격 섬광이나 충격 고리를 더 진하게 그리고 충격 고리는 무슨 레이스 장식같아 보이니까 좀더 후폭풍 처럼 보이도록 해주고"
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_jobs import BG, END, GRID_NOTE, STYLE, job  # noqa: E402  (round one's shared building blocks)

# ---------------------------------------------------------------------------------------------------------------- 1. shadow clone
CLONE_REF = ["art/units_v2/unit_r_ninja.png", "art/units_v2/unit_w_paw.png"]
CLONE_NOTE = (
    "Image 1 is the approved NINJA CAT of our game. The new subject is a SHADOW CLONE of exactly this cat: the same head shape and ears, the same "
    "headband with its metal plate and its two trailing tails, the same scarf, short cape, bandage-wrapped arms and legs, belt with its knot, the sword "
    "hilt behind its shoulder, the same proportions and the same cute face style. Image 2 is another approved cat of the same game and a RENDERING reference "
    "only: match its line weight, matte colouring and white sticker border. Do not draw cat 2."
)
CLONE_LOOK = (
    "It must read as a COPY OF THE NINJA, not as a ghost: a solid, opaque, standing cat with a normal body, two arms and TWO LEGS WITH TWO FEET planted on the "
    "ground exactly like the ninja in image 1 (the bandage-wrapped legs and the paws are clearly drawn); NO smoke tail, NO wispy hem, NO floating, NO see-through "
    "parts, NO transparency. The ONLY difference from the original is the colouring: it is painted as a SHADOW COPY, one soft muted wash over the whole figure, "
    "{tone} Everything of the ninja still shows through clearly: the face, the headband with its plate, the scarf, the cape, the belt and the outline. "
    "The eyes stay the same warm amber-yellow as the original ninja's (slightly muted) with its pale slanted brows and its small fang smile; they are the only warm "
    "colour apart from the leaf. One small clean muted-green LEAF sits on the top of its head between the ears, slightly tilted. "
    "The clone is clearly LIGHTER than a silhouette: never black, no black fur. "
)
TONES = {
    "a": (
        "a LIGHT COOL GREY-BLUE shadow: the fur is a soft mid-light blue-grey (about #7C90A6) with one deeper tone (about #5F7389) for shading, the headband, scarf, cape, "
        "wraps and belt a lighter dusty grey-blue (about #A3B5C7, one tone darker for folds), the headband plate pale grey-white (about #D7E0E9), the outline a medium-dark "
        "navy-grey ink (about #34455C) instead of black or brown."
    ),
    "b": (
        "a LILAC-INDIGO shadow: the fur is a soft dusty indigo-violet (about #6F6CA3) with one deeper tone (about #565388) for shading, the headband, scarf, cape, wraps and "
        "belt a lighter lilac (about #A09DCB, one tone darker for folds), the headband plate pale lavender-white (about #DAD8EE), the outline a deep indigo ink "
        "(about #35316B) instead of black or brown."
    ),
    "c": (
        "a SLATE shadow, the deepest of the three but still see-through-to-the-details: the fur is a mid slate grey (about #5E6A7B) with one deeper tone (about #485364) for "
        "shading, the headband, scarf, cape, wraps and belt a lighter slate blue-grey (about #8794A4, one tone darker for folds), the headband plate pale grey (about #C9D1DA), "
        "the outline a dark slate ink (about #252D3B) instead of black or brown."
    ),
}
POSES = {
    "a": (
        "Pose A (standing ready): facing the viewer in the ninja's own stance, feet planted a little apart, one fist raised in front of its chest and the other at its side, "
        "the head straight, a confident small fang smile. No props."
    ),
    "b": (
        "Pose B (mid-throw): its body turned a little, one arm swung forward and out holding ONE flat four-point throwing star (shuriken) in the same shadow tone with a pale "
        "grey-white centre disc, the other arm pulled back, feet planted wide apart, a determined little smile. No other props."
    ),
    "c": (
        "Pose C (a little wobbly): a slightly clumsy copy: the body leaning a few degrees to one side, the head tilted the other way, one arm raised a little crooked and the "
        "other held out for balance, BOTH feet on the ground (one flat, the other tipped on its toes), a lopsided cheeky smile. No props."
    ),
}
CLONE_COMP = "full body, standing on its two feet, facing the viewer in the same three-quarter front view as image 1, centred, generous padding, no ground shadow"
CLONES = {
    f"clone2_{k}": (
        "a SHADOW CLONE of the ninja cat from image 1. " + POSES[k] + " " + CLONE_LOOK.format(tone=TONES[k])
    )
    for k in "abc"
}

PAIR_NOTE = (
    "Image 1 is the approved NINJA CAT of our game (the shape and outfit to copy). Image 2 is the approved SHADOW CLONE of that ninja: copy its look EXACTLY for the "
    "front clone (same tone, same outline colour, same outfit, same leaf, same legs and feet); only the pose and the arrangement change as described below."
)
PAIR_COMMON = (
    "TWO shadow clones of the ninja cat in ONE picture, standing SHOULDER TO SHOULDER with the two bodies overlapping a little, both leaning slightly toward each other "
    "with their heads tilted together, both facing the viewer. The FRONT clone (on the LEFT) is whole, drawn like the clone of image 2. The BACK clone (on the RIGHT) is "
    "about 90 percent of the front one's size and stands a little further back (its feet a little higher in the picture), partly hidden behind the front one's shoulder; "
    "it is the SAME look in a clearly PALER, lighter version of the same hue (about half the strength of the wash, still solid and opaque, never see-through), but its whole "
    "head with BOTH ears, its leaf, both eyes, and its legs and feet stay clearly visible. Each clone wears its own muted-green leaf on its head between its ears. "
    "Both are solid standing cats with two legs and two feet on the ground: NO smoke tails, NO wispy hems, NO floating. The pair must read as TWO cats even when shrunk to "
    "a 54 by 48 pixel thumbnail: two clearly separate head silhouettes with ears, two pairs of feet, bold simple shapes, minimal detail inside the bodies. "
    "Colouring of the front clone: {tone} The back clone uses the same hues, paler. The eyes of both stay the warm amber-yellow of the original ninja; never black, no black fur, "
    "no props, no sword drawn out, no shuriken. "
)
PAIRS = {f"pair2_{k}": PAIR_COMMON.format(tone=TONES[k]) for k in "abc"}

# ---------------------------------------------------------------------------------------------------------------- 2. cut
CUT_REF = ["art/skills_v1/cut_c.png", "art/raw/fx_burst_slash.png"]
CUT_NOTE = (
    "Image 1 is the first-round design the owner CHOSE: keep its idea (LEFT a thin jagged crack line, RIGHT the same cut ripped open into a narrow jagged gash with two cream "
    "paper lips, an ink-dark gap and a small curled flap at each end) but draw it MUCH bolder and clearer as described below: the first version was too thin and too quiet. "
    "Image 2 is an approved effect sticker of our game: use its thick, confident ink line weight and flat cream colouring as the minimum. Do NOT draw a cat or a sword."
)
CUT_COMMON = (
    "TWO separate effect stickers side by side in a strict grid of 2 columns by 1 row, one centred in each cell, each drawn perfectly HORIZONTAL (left to right) so a game can "
    "rotate it. They are stuck on top of enemy characters of ANY colour (pale, cream, green, orange and also very dark purple or navy) to show a sword cut, so they must read "
    "clearly on both light and dark: a playful PAPER CUT, like a slit torn in a sticker, never bloody. Common rules: a VERY THICK dark brown-black ink outline (about three times "
    "as thick as in image 1, a bold sticker line), paper-cream (about #FFF3D6) lips with a deeper warm tan shadow tone (about #E7C58C) along their inner edges for contrast, and "
    "a deep ink-black-brown gap (about #20120C) with HARD contrast against the cream lips. LEFT cell = the cut LINE when the enemy has just been marked: a short jagged crack, "
    "about 7 times longer than thick, still bold (it must be a clear dark-outlined shape when shrunk to 56 pixels), with the ink gap showing as a thin dark core inside it. "
    "RIGHT cell = the same cut OPENED into a gash: a ripped slit about 3 times longer than high, tapering to a sharp point at both ends, only four or five BIG irregular jagged "
    "notches per lip (no regular teeth, not a mouth, not a zipper), a small torn flap curled back at each end. "
)
CUT_SPARK_NOTE = (
    "Exception to the no-sparkle rule for this job only: the bright accent described below is wanted, drawn as FLAT hard-edged star shapes with a clean ink outline and flat fills "
    "(white and pale yellow), no glow, no blur, no glitter. "
)
CUTS = {
    "cut2_a": CUT_COMMON + (
        "Emphasis A (bold and tidy): in BOTH cells, ONE small white-hot SPARK sits where the cut STARTS (at the left end): a flat four-point star with a white centre and pale-yellow "
        "points, about the height of the gash, with a thick ink outline, overlapping the left end of the cut a little. Nothing else around it."
    ),
    "cut2_b": CUT_COMMON + (
        "Emphasis B (spark burst): in BOTH cells a bigger white-hot BURST sits at the left START of the cut: a flat eight-point starburst (white centre, yellow points, thick ink outline) "
        "about 1.3 times the height of the gash, and three short bright cream-yellow dashes (thick, with ink outlines) radiating from it along the line of the cut, like the "
        "first sparks of a slash. In the RIGHT cell the dark gap is extra wide, about a third of the gash's height."
    ),
    "cut2_c": CUT_COMMON + (
        "Emphasis C (full impact): in BOTH cells a long sharp white SLASH-FLASH, a very thin pointed four-point glint shape (white with a pale-yellow edge and a thick ink outline) "
        "stretched along the WHOLE length of the cut and crossing its middle, plus a small white-hot starburst at the left START of the cut; in the RIGHT cell the gap is "
        "extra wide and pure black-brown, and three or four small flat cream paper scraps with ink outlines fly off the lips."
    ),
}

# ---------------------------------------------------------------------------------------------------------------- 3. meteor
MET_REF = ["art/skills_v1/meteor_b.png", "art/raw/fx_shot_fire.png"]
MET_NOTE = (
    "Image 1 is the first-round design the owner CHOSE for the meteor (LEFT piece): keep that round warm-brown rock and its orange and yellow flame tail trailing LEFT, but REMOVE THE "
    "FACE COMPLETELY: no eyes, no mouth, no cheeks, no face of any kind, just a plain cratered rock. Do NOT copy the pale cream flash (middle) or the scalloped lace-like ring (right) "
    "of image 1: redraw both from scratch as described below. Image 2 is the approved fireball sprite of our game, a RENDERING reference only for line weight and flat flame shapes."
)
MET_COMMON = (
    "THREE separate effect pieces in a strict grid of 3 columns by 1 row, one centred in each cell, each filling its cell. The set is a falling METEOR and its landing. "
    "Exceptions to the muted-colour and no-sparkle rules for this job: the flash and the ring use saturated warm colours and flat hard-edged shapes with a THICK dark "
    "brown-black outline (clearly thicker and darker than in image 1).\n"
    "LEFT = the burning meteor in flight, drawn horizontal: the same round warm-brown rock (about #B5754B with one deeper shadow tone about #8A5434) with three or four LARGE shallow "
    "craters, NO FACE, the head on the RIGHT and a short flat bright orange (about #F58A2B) and yellow (about #FFC93A) flame tail of three or four tongues trailing to the LEFT.\n"
    "MIDDLE = the landing FLASH seen from above: {flash}\n"
    "RIGHT = the impact RING drawn as a BLAST WAVE (the shockwave of the landing, seen from straight above, the middle of it EMPTY and see-through): {ring} It must NOT look like "
    "a lace doily, a wreath, a flower, a decorative frame or a cookie: no regular scalloped edge, no even concentric bands, no repeated pattern."
)
METS = {
    "meteor2_a": MET_COMMON.format(
        flash=(
            "a bold round-cornered explosion burst of 9 big flame-shaped pointed rays of UNEVEN lengths: the outer layer saturated orange (about #F58A2B), a middle layer bright yellow "
            "(about #FFC93A) and a clear, solid, BRIGHT CORE disc of near-white pale yellow (about #FFF6C8) in the centre that contrasts strongly with the orange; two or three small flat "
            "yellow stars around it. Strong, not pale."
        ),
        ring=(
            "a thick expanding ring of billowing DUST: a band of big uneven rounded dust puffs of different sizes, biggest and puffiest on the OUTER front edge and thinner on the inside "
            "so the band is THICKER AT THE FRONT; warm pale grey-cream dust (about #EADFCB) with a warm grey-brown shadow tone (about #B8A58E), thick dark outline round every puff, and about "
            "a dozen short sharp dark radial speed streaks running outward across the band so it looks like it is racing outward."
        ),
    ),
    "meteor2_b": MET_COMMON.format(
        flash=(
            "a bold burst with 10 sharp jagged pointed rays of UNEVEN lengths like a cartoon explosion: outer layer deep red-orange (about #E8552B), a middle layer bright orange (about #FF9A2E) "
            "and a clear solid BRIGHT CORE disc of white-hot pale yellow (about #FFF3B0) in the centre with a thick ink ring round it; a few small flat yellow star shapes around it. "
            "Strong, saturated, not pale."
        ),
        ring=(
            "a thick air-blast ring with a JAGGED outer edge: the outer rim made of about 14 sharp irregular shock spikes of UNEVEN lengths and sizes pointing outward, the band THICK at the "
            "front (outer) edge and thin and smooth on the inside, filled with sandy orange (about #F3C27A) fading to pale cream (about #FFF1D0) toward the empty middle, thick dark outline, and "
            "about a dozen short dark radial speed streaks running outward through the band."
        ),
    ),
    "meteor2_c": MET_COMMON.format(
        flash=(
            "a bold yellow-orange burst of 8 broad pointed rays of uneven lengths (outer layer saturated orange about #F58A2B, middle layer golden yellow about #FFC93A), a clear solid "
            "BRIGHT CORE disc of white-hot pale cream (about #FFFBE0) in the centre, and four small flat stars of orange and yellow around it. Strong, saturated, not pale."
        ),
        ring=(
            "a DOUBLE dust wave: one thick LEADING ring of big uneven rounded dust puffs (thickest on the outer front edge, warm pale grey-cream about #EADFCB with a warm grey-brown shadow tone about "
            "#B8A58E, thick dark outline) and, a little inside it and not touching, a thinner, broken second ring of three or four curved dust arcs trailing behind it; about ten short "
            "dark radial speed streaks run outward through the leading band and three small brown pebbles fly outside the ring."
        ),
    ),
}


def main() -> None:
    jobs: list[dict] = []
    ink_note = "The outline of this clone is the dark tinted ink named below, never dark brown."
    for k, v in CLONES.items():
        jobs.append(job(k, CLONE_REF, CLONE_NOTE, "mobile game skill-effect sprite shown small (about 55 px tall)", v, CLONE_COMP, ink_note))
    for k, v in CLONES.items():
        letter = k[-1]
        pk = f"pair2_{letter}"
        jobs.append(
            job(pk, ["art/units_v2/unit_r_ninja.png", f"art/skills_v1/clone2_{letter}.png"], PAIR_NOTE,
                "mobile game skill-effect sprite shown tiny (54 by 48 px)", PAIRS[pk],
                "the two clones together fill the picture, centred, generous padding, no ground shadow", ink_note)
        )
    for k, v in CUTS.items():
        jobs.append(job(k, CUT_REF, CUT_NOTE, "mobile game skill-effect sticker sheet, each piece shown about 70 px long", v, GRID_NOTE, CUT_SPARK_NOTE))
    for k, v in METS.items():
        jobs.append(job(k, MET_REF, MET_NOTE, "mobile game skill-effect sprite sheet, the meteor shown about 120 px", v, GRID_NOTE))
    (HERE / "jobs_r2.json").write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} jobs -> {HERE / 'jobs_r2.json'}")


if __name__ == "__main__":
    main()

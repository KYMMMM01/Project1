#!/usr/bin/env python
"""Gold dungeon enemies: the gold coin (ordinary enemy) and the treasure chest (boss), three candidates each.

    python art/dungeon_v1/build_jobs.py   -> art/dungeon_v1/jobs.json  (for tools/gen_image.py --batch --out-dir art/dungeon_v1)

Each job attaches one approved v2 enemy (rendering and proportions) and one approved v2 cat (rendering).
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "art" / "dungeon_v1"

REF_NOTE = (
    "Image 1 is an approved enemy character from our game and image 2 an approved cat from the same game. Both are RENDERING "
    "references only: match their line weight, matte colouring, sticker border, face style and proportions, but draw the new "
    "character described below (do not draw a cucumber or a cat, do not copy their props)."
)

STYLE = (
    "Style: 2D cartoon sticker illustration with a thick dark-brown outline and a clean white sticker border. "
    "MATTE finish: flat colours with at most one soft shadow tone per shape, NO glossy highlights, NO specular shine, "
    "NO strong gradients, NO rim light, NO sparkle or glitter effects, NO glow; slightly muted, natural colours "
    "(warm mustard gold, never neon or over-saturated). Simple large shapes that read at thumbnail size.\n"
    "Face: small solid black dot eyes (no iris, no highlights), short thick EYEBROWS that clearly show a cheeky or grumpy "
    "expression, and a simple cartoon mouth.\n"
    "Anatomy: limbs attach where they naturally would; nothing fused, duplicated or floating unless described.\n"
    "Composition: full body, facing left like image 1, centred, generous padding, no ground shadow.\n"
    "Background: genuinely transparent background (alpha) outside the white sticker border.\n"
    "Constraints: single character, no text, no letters, no numbers, no currency symbols, no watermark, nothing cropped."
)

COINS = {
    "enemy_coin_a": "a living gold coin: a thick round gold coin standing on its edge and running on stubby legs, a cat paw print embossed on its face, a cheeky grin, tiny arms pumping",
    "enemy_coin_b": "a living gold coin: a chubby round gold coin seen from the front with a cat paw print embossed above a smug little face, short legs and tiny arms on its hips, a notched rim",
    "enemy_coin_c": "a living gold coin: a round gold coin rolling along with a mischievous face in its middle, a ring of small notches on the rim, stubby legs kicking, one small flat motion line behind it",
}

CHESTS = {
    "boss_treasure_a": "a giant living treasure chest: a big wooden treasure chest with mustard-gold metal bands and a paw-print lock, its lid open like a grinning mouth with a row of flat teeth, a heap of gold coins showing inside, stubby clawed feet, greedy smug look",
    "boss_treasure_b": "a giant living treasure chest: a fat round-lidded wooden chest with gold corner plates, the half-open lid is its brow and two dot eyes peek from the dark inside above a pile of gold coins, short sturdy legs, small arms hugging the coins, proud grumpy look",
    "boss_treasure_c": "a giant living treasure chest: a heavy wooden chest with gold bands, a small golden crown sitting on its closed domed lid, a big keyhole for a nose, a wide toothy grin where the lid meets the box, coins spilling from one corner, stubby legs, imposing but funny",
}


def job(name: str, subject: str, boss: bool) -> dict:
    asset = ("mobile game BOSS sprite shown large (about 260 px), a little more detail is welcome" if boss
             else "mobile game enemy sprite shown small (about 70 px)")
    return {
        "name": name,
        "ref": ["art/enemies_v2/enemy_cucumber.png", "art/units_v2/unit_w_paw.png"],
        "ref_note": REF_NOTE,
        "prompt": f"Use case: stylized-concept\nAsset type: {asset}\nSubject: {subject}. A funny target the cats chase for treasure, never scary or gross.\n{STYLE}",
    }


def main() -> None:
    jobs = [job(k, v, False) for k, v in COINS.items()] + [job(k, v, True) for k, v in CHESTS.items()]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "jobs.json").write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} jobs -> {OUT / 'jobs.json'}")


if __name__ == "__main__":
    main()

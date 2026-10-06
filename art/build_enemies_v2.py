#!/usr/bin/env python
"""Enemy and boss redraw in the v2 rendering (matte, dot eyes + eyebrows), designs unchanged.

    python art/build_enemies_v2.py   -> art/enemies_v2/jobs.json  (for tools/gen_image.py --batch --out-dir art/enemies_v2)

Each job attaches the current sprite (identity) and one approved v2 cat (rendering).
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "enemies_v2"
RENDER_REF = "art/units_v2/unit_w_paw.png"

REF_NOTE = (
    "Image 1 is the CURRENT design of this enemy character from our game. Keep who it is: the same object, "
    "the same silhouette idea, main colours, attitude, facing and pose family. Redraw it from scratch in the "
    "rendering of image 2, an approved character from the same game (image 2 is a RENDERING reference only: "
    "do not draw a cat and do not copy its props). Do NOT copy image 1's big glossy eyes, shiny highlights, "
    "glow or sparkles."
)

ENEMIES = {
    "enemy_cucumber": "a mischievous living cucumber: chubby green cucumber with stubby legs and arms, a few bumps on its skin, a sneaky toothy grin",
    "enemy_dust": "a living dust bunny: a round grey fluffy ball of dust and lint with tiny stick legs and a few stray hairs sticking out, annoyed look",
    "enemy_drop": "a living water droplet: a blue teardrop of water with little running legs, a cheeky wide grin, one small flat splash behind it",
    "enemy_roomba": "a robot vacuum cleaner: a flat round disc-shaped robot vacuum with a metal bumper, two flat red light eyes on top, small wheels and two tiny side brushes like arms, sturdy armoured look",
    "enemy_tangerine": "a living tangerine: a round orange citrus fruit with a green leaf on top, smug look, short legs, crossed little arms, a faint flat ring of citrus mist around it",
    "enemy_balloon": "a living red party balloon: a round red balloon with a goofy puffed-cheek face, a knotted bottom and a curly string trailing like a tail, tiny feet",
    "enemy_clock": "a living alarm clock: a round twin-bell alarm clock ringing hard with a few motion lines, a startled-angry face on the dial, short metal legs, a small hammer between the bells",
    "enemy_pill": "a living medicine bottle: a small white pill bottle with a green cap and a blank green label, smug sneaky face, little arms holding one capsule, short legs",
    "enemy_cone": "a living pet cone collar: a milky white plastic cone-of-shame walking upside-down on stubby legs, grumpy eyes peeking from inside the cone",
    "enemy_dryer": "a living hair dryer: a chunky pink hair dryer with an angry puffed-cheek face on its body, blowing a flat swirl of hot air from its nozzle, a power cord whipping behind like a tail, stubby legs",
    "enemy_spray": "a living spray bottle: a blue plastic trigger spray bottle with an evil grin, spraying a small flat puff of water mist from its nozzle, stubby legs",
    "enemy_firecracker": "a living firecracker: a red cylindrical firecracker with a lit fuse and a small flat spark on top, crazy excited look, zig-zag grin, tiny legs",
}

BOSSES = {
    "boss_cucumber": "a giant king cucumber: a huge fat cucumber wearing a small golden crown and a tattered green cape, furious, big jagged grin, clenched fists, imposing stance",
    "boss_vacuum": "a giant upright vacuum cleaner: a big red-and-grey upright vacuum with a dark visor showing two flat angry eye shapes, a flexible hose arm ending in a wide sucking nozzle, a little dust swirling into it, heavy wheels, menacing but funny",
    "boss_blender": "a giant kitchen blender: a chunky blender with an angry face on its base, a glass jar full of swirling orange smoothie with spinning blades, a rattling lid, a power-cord tail whipping, wild look",
    "boss_bath": "a giant bathtub: a white clawfoot bathtub overflowing with foamy bubbles, a shower-head neck rising like a snake with a grumpy face, a rubber duck floating on top, water sloshing over the rim, stubby clawed feet",
    "boss_cloud": "a giant thundercloud: a big dark grey-violet storm cloud with a furious face, flat yellow lightning bolts shooting from underneath, small rain streaks",
    "boss_needle": "a giant toy syringe: a big mischievous cartoon syringe character wearing a round doctor's head mirror, half-filled with flat green liquid, cartoon gloved hands, a smug know-it-all smile",
}

STYLE = (
    "Style: 2D cartoon sticker illustration with a thick dark-brown outline and a clean white sticker border. "
    "MATTE finish: flat colours with at most one soft shadow tone per shape, NO glossy highlights, NO specular shine, "
    "NO strong gradients, NO rim light, NO sparkle or glitter effects, NO glow; slightly muted, natural colours "
    "(never neon or over-saturated). Simple large shapes that read at thumbnail size.\n"
    "Face: small solid dot eyes (black, or a flat red or yellow where the design uses lights; no iris, no highlights), "
    "short thick EYEBROWS that clearly show a grumpy, sneaky or furious expression, and a simple cartoon mouth.\n"
    "Anatomy: limbs attach where they naturally would; nothing fused, duplicated or floating unless described.\n"
    "Composition: full body, same facing as image 1, centred, generous padding, no ground shadow.\n"
    "Background: genuinely transparent background (alpha) outside the white sticker border.\n"
    "Constraints: single character, no text, no letters, no numbers, no watermark, nothing cropped."
)


def job(name: str, subject: str, boss: bool) -> dict:
    asset = ("mobile game BOSS sprite shown large (about 260 px), a little more detail is welcome" if boss
             else "mobile game enemy sprite shown small (about 70 px)")
    return {
        "name": name,
        "ref": [f"art/raw/{name}.png", RENDER_REF],
        "ref_note": REF_NOTE,
        "prompt": f"Use case: stylized-concept\nAsset type: {asset}\nSubject: {subject}. A funny household nuisance that cats hate, never scary or gross.\n{STYLE}",
    }


def main() -> None:
    jobs = [job(k, v, False) for k, v in ENEMIES.items()] + [job(k, v, True) for k, v in BOSSES.items()]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "jobs.json").write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} jobs -> {OUT / 'jobs.json'}")


if __name__ == "__main__":
    main()

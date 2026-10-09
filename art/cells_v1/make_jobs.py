"""Writes jobs.json for tools/gen_image.py (the five chapters' special board cells and their badge icons):

    python art/cells_v1/make_jobs.py
    python tools/gen_image.py --batch art/cells_v1/jobs.json --out-dir art/cells_v1 --parallel 3

Then `python art/cells_v1/build_cells.py` copies the pictures to art/raw (cell_<id>.png, icon_cell_<id>.png) and `python tools/process_art.py`
writes the game files. Every picture is drawn in the rendering style of a cat of the game (the attached reference).
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REF = ["art/units_v2/unit_w_paw.png"]
NOTE = ("The attached image is a RENDERING REFERENCE only: copy its thick dark outline, its flat cel-shaded colouring and its simplicity, "
        "but do NOT draw a cat and draw only the subject described below. ")
STYLE = ("Style: flat 2D cartoon drawing in exactly the rendering style of the attached reference: a THICK dark chocolate-brown outline "
         "(about 3 to 4 percent of the object's size) around every shape, flat matte colour fills with at most ONE soft darker shadow tone per shape "
         "(cel shading), simple bold rounded shapes, warm slightly muted colours. Absolutely NO gradients, NO glow, NO light bloom, NO lens flare, "
         "NO painterly or realistic rendering, NO texture, NO photographic highlights. It must look like a children's cartoon sticker drawing.")
BG = ("Background: genuinely transparent background (alpha) everywhere outside the object. No checkerboard pattern, no frame, "
      "no grid lines, no ground, no cast shadow.")
END = "Constraints: no text, no letters, no numbers, no watermark, nothing cropped, no cat, no animal."

TILE = ("Composition: a TOP-DOWN view (looking straight down at the floor) of ONE rounded-rectangle floor tile with softly rounded corners, a little wider than tall "
        "(about 8 to 7), perfectly centred and filling about 94 percent of the image, its edge drawn with the thick dark outline. "
        "No white sticker border. The picture on the tile is {motif}")
ICON = ("Composition: ONE small icon, perfectly centred, filling about 80 percent of the image, with a thin cream-white sticker border around the whole shape "
        "(exactly like the attached reference has) outside the thick dark outline. {motif}")


def tile(name, subject, motif):
    prompt = (f"Use case: stylized-concept\nAsset type: mobile game board-cell floor tile (top-down)\nSubject: {subject}\n{STYLE}\n"
              f"{TILE.format(motif=motif)}\n{BG}\n{END}")
    return {"name": name, "prompt": prompt, "ref": REF, "ref_note": NOTE}


def icon(name, subject):
    prompt = (f"Use case: stylized-concept\nAsset type: mobile game small badge icon\nSubject: {subject}\n{STYLE}\n"
              f"{ICON.format(motif='Seen from the front, a little from above.')}\n{BG}\n{END}")
    return {"name": name, "prompt": prompt, "ref": REF, "ref_note": NOTE}


jobs = [
    tile("cell_sun", "a patch of warm sunlight lying on a living-room floor",
         "a pale butter-yellow patch of light on a lighter warm cream floor, split by the dark golden shadow of a window frame into four panes "
         "(a thick darker-gold cross in the middle), with a few small flat cream four-point sparkle stars scattered on the panes and a row of short "
         "flat golden dashes along each edge like rays coming in. Cheerful, bright, clearly the lightest and warmest tile of a room.",),
    tile("cell_bowl", "a woven kitchen mat with a cat's food bowl on it",
         "a warm red-and-cream gingham (checked) kitchen placemat with a plain cream border band, and in the middle a round blue-and-white ceramic cat "
         "food bowl seen from above, heaped with small brown kibble pebbles, with one small flat fish-shaped biscuit lying beside the bowl.",),
    tile("cell_bubble", "a fluffy bath mat with soap bubbles and steam",
         "a thick fluffy aqua-blue bath mat with a scalloped tufted edge (a ring of rounded loops), a lighter aqua inner panel, five round flat "
         "soap bubbles floating on it (pale blue-white discs with a thick outline and one white curved shine mark each, different sizes) and two "
         "small flat white curly steam wisps rising from the top corners.",),
    tile("cell_stump", "a mossy tree stump in a garden",
         "a rounded patch of flat leaf-green grass with a few lighter blade ticks, and in the middle a big round tree-stump top seen from above: "
         "warm tan wood with three concentric darker growth rings and a ring of brown bark around it, two tiny flat red-capped mushrooms with "
         "cream dots and a small clover leaf at the edge of the grass.",),
    tile("cell_treat", "a soft veterinary clinic blanket with cat treats on it",
         "a soft pale-teal quilted blanket with a diamond stitch pattern and a cream trim band, and in the middle a small heap of three "
         "golden-brown fish-shaped cat biscuit treats (each with an eye dot and a tail), with one small pink heart floating above the heap.",),
    icon("icon_cell_sun", "a round warm-yellow sun with eight short triangular golden rays, a lighter yellow patch on its face and one darker orange shadow tone; no face."),
    icon("icon_cell_bowl", "a blue-and-white ceramic cat food bowl heaped with small brown kibble pebbles, with a tiny fish-bone shape in cream on its side."),
    icon("icon_cell_bubble", "a cluster of three overlapping round soap bubbles in pale aqua blue with cream-white shine arcs, different sizes, thick outlines."),
    icon("icon_cell_stump", "a short round tree stump with a tan wood top showing three growth rings, a brown bark side with two vertical grooves, and one tiny green sprout with two leaves on top."),
    icon("icon_cell_treat", "one golden-brown fish-shaped cat biscuit treat with an eye dot, a tail fin and three small darker dots on its body, with a tiny pink heart beside it."),
]
(HERE / "jobs.json").write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
print(len(jobs), "jobs")

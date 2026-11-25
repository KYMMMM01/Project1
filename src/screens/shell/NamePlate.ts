import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { COSMETIC_DEFAULTS } from '@/meta/data/catalog';
import { Color, cacheStatic, drawDashedInset, drawPaper, fitLabel, paperSeed, uiLabel, type PaperOpts } from '@/ui';
import { PLATE_ART_H, PLATE_ART_W, PLATE_H, PLATE_TEXT_W, PLATE_W } from './layoutMath';

/**
 * The name plate: the nickname centred on a kraft paper strip by default, else on the plate's picture (an empty name leaves only
 * the plate). Origin = centre.
 */
export class NamePlate extends Container {
  private readonly sheet = new Graphics();
  /** A drawn plate (tools/make_cosmetics.py): its body covers the strip, its ends may pass it. */
  private readonly art = new Sprite();
  private readonly nameT: Text = uiLabel('', { size: 28 });

  constructor() {
    super();
    const opts: PaperOpts = { w: PLATE_W, h: PLATE_H, radius: 16, fill: Color.kraft, edge: Color.kraftDark, grain: false, shadow: 4, seed: paperSeed() };
    drawPaper(this.sheet, -PLATE_W / 2, -PLATE_H / 2, opts);
    drawDashedInset(this.sheet, -PLATE_W / 2, -PLATE_H / 2, opts, 7, { color: Color.kraftDark, width: 2, alpha: 0.55 });
    cacheStatic(this.sheet);
    this.art.anchor.set(0.5);
    this.art.visible = false;
    this.addChild(this.sheet, this.art, this.nameT);
  }

  /** The glyphs stay at 24 px or more: a name too long for the text box is cut with an ellipsis, never squeezed. */
  setName(name: string): void {
    this.nameT.text = name;
    fitLabel(this.nameT, PLATE_TEXT_W, 28);
  }

  /** The default (or an id with no picture) is the kraft strip. */
  setPlate(id: string): void {
    const drawn = id !== COSMETIC_DEFAULTS.plate && hasTex(id);
    this.sheet.visible = !drawn;
    this.art.visible = drawn;
    if (!drawn) return;
    this.art.texture = tex(id);
    this.art.width = PLATE_ART_W;
    this.art.height = PLATE_ART_H;
  }
}

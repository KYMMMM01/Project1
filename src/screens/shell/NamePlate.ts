import { Container, Graphics, type Text } from 'pixi.js';
import { Color, cacheStatic, drawDashedInset, drawPaper, fitLabel, paperSeed, uiLabel, type PaperOpts } from '@/ui';
import { PLATE_H, PLATE_TEXT_W, PLATE_W } from './layoutMath';

/** The name plate: a kraft paper strip with the nickname centred on it (an empty name leaves only the strip). Origin = centre. */
export class NamePlate extends Container {
  private readonly nameT: Text = uiLabel('', { size: 28 });

  constructor() {
    super();
    const sheet: PaperOpts = { w: PLATE_W, h: PLATE_H, radius: 16, fill: Color.kraft, edge: Color.kraftDark, grain: false, shadow: 4, seed: paperSeed() };
    const g = new Graphics();
    drawPaper(g, -PLATE_W / 2, -PLATE_H / 2, sheet);
    drawDashedInset(g, -PLATE_W / 2, -PLATE_H / 2, sheet, 7, { color: Color.kraftDark, width: 2, alpha: 0.55 });
    cacheStatic(g);
    this.addChild(g, this.nameT);
  }

  /** The glyphs stay at 24 px or more: a name too long for the text box is cut with an ellipsis, never squeezed. */
  setName(name: string): void {
    this.nameT.text = name;
    fitLabel(this.nameT, PLATE_TEXT_W, 28);
  }
}

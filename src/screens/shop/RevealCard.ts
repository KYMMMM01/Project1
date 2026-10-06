import { Container, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Color, drawIcon, numberText, paperSeed, paperShape, Rarity, rarityName, Tag, uiLabel } from '@/ui';
import { unitPortrait, wildArt } from './art';
import { buildPlate } from './photoPlate';
import { NAME_GAP, NAME_LINE, NAME_SIZE, PLATE, rarityRank, type RevealStack } from './revealPlan';

/** The mat is this tall; the cream strip under it carries the count pill. */
const MAT_H = 112;

/**
 * One stack of cards in the chest reveal: a kraft back (dashed edge, paw print) that flips into a paper photo frame
 * with the count on a pill at its foot and a "Wild" / "Bonus" tag when it is one, and the cat's name under the frame.
 * The frame is drawn at its natural size and scaled by the layout; the name is counter-scaled so it is always
 * `NAME_SIZE` on screen, wraps inside its cell and is never cut. Origin = centre of the frame.
 */
export class RevealCard extends Container {
  readonly back = new Container();
  readonly face = new Container();
  readonly count: ReturnType<typeof numberText>;
  private readonly name: Text;

  constructor(readonly stack: RevealStack) {
    super();
    const { w, h } = PLATE;
    const rim = Rarity[stack.rarity];
    const seed = paperSeed();
    this.back.addChild(
      paperShape({ w, h, radius: 22, fill: Color.kraft, edge: rim.dark, edgeWidth: 4, edgeAlpha: 0.9, shadow: 6, grain: false, seed }),
      drawIcon('paw', w * 0.42, Color.kraftDark),
    );

    const plate = buildPlate({ w, h, matH: MAT_H, rarity: stack.rarity, tier: rarityRank(stack.rarity), seed });
    const win = plate.win;
    const unit = stack.unit;
    const art = unit ? unitPortrait(unit, stack.rarity, Math.min(win.w, win.h) - 4) : wildArt(stack.rarity, 100);
    art.position.set(win.x + win.w / 2, win.y + win.h / 2 + 2);
    this.face.addChild(plate.base, art, plate.over);

    const tagText = stack.bonus ? t('reveal.bonus') : unit ? '' : t('reveal.wild');
    if (tagText) {
      const tag = new Tag({ text: tagText, style: stack.bonus ? 'success' : 'info', shape: 'pill', fontSize: 24, tilt: -0.08 });
      tag.position.set(w / 2 - tag.uiBox.w / 2 - 2, -h / 2 + 20);
      this.face.addChild(tag);
    }

    // The count hangs at the foot of the frame, clear of the picture's top corners where the tag and tape sit.
    this.count = numberText(30, Color.ink, 'x0');
    const pill = paperShape({ w: 88, h: 38, kind: 'pill', fill: Color.paperLight, edge: Color.kraftDark, shadow: 3, grain: false, seed: seed + 5 });
    pill.position.set(0, h / 2 - 19);
    this.count.position.copyFrom(pill.position);
    this.face.addChild(pill, this.count);

    // The name sits on the wooden floor, so it is light text with a brown stroke.
    const label = unit ? t(`unit.${unit}.name`) : `${rarityName(stack.rarity)} ${t('reveal.wild')}`;
    this.name = uiLabel(label, { size: NAME_SIZE, onArt: true, align: 'center', lineHeight: NAME_LINE, anchorY: 0, wrap: PLATE.w });
    this.face.addChild(this.name);
    this.face.visible = false;
    this.addChild(this.back, this.face);
  }

  /** Lines the name takes when its cell is `cellW` wide. */
  nameLines(cellW: number): number {
    this.name.style.wordWrapWidth = cellW - 4;
    return Math.max(1, Math.round(this.name.height / this.name.scale.y / NAME_LINE));
  }

  /** Apply the layout's plate scale and cell width: the frame scales, the name keeps its size and wraps in the cell. */
  layout(scale: number, cellW: number): void {
    this.name.scale.set(1 / scale);
    this.name.style.wordWrapWidth = cellW - 4;
    this.name.position.set(0, PLATE.h / 2 + NAME_GAP / scale);
  }

  showFace(): void {
    this.back.visible = false;
    this.face.visible = true;
  }
}

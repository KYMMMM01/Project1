import { Container, Graphics, type Text } from 'pixi.js';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { CHEST_RARITIES, type ChestRarity } from '@/meta/types';
import { cacheStatic, Color, currencyIcon, fitLabel, paperShape, Rarity, rarityName, uiLabel } from '@/ui';

const H = 104;
const LEFT = 150;
const CHIP_W = 36;
const CHIP_GAP = 8;

/**
 * The wild cards in hand, one count per rarity: a cream strip with a rarity-coloured mat chip for each, so the
 * counts read the same way the photo frames do. Origin = top-left.
 */
export class WildStrip extends Container {
  readonly stripH = H;
  private readonly counts: { rarity: ChestRarity; text: Text; chip: Graphics; cx: number }[] = [];
  private readonly cellW: number;

  constructor(w: number) {
    super();
    const sheet = paperShape({ w, h: H, fill: Color.paper, radius: 24, grain: false });
    sheet.position.set(w / 2, H / 2);
    const card = currencyIcon('wild', 48);
    card.position.set(76, 34);
    const title = uiLabel(t('cats.wild.title'), { size: 24 });
    fitLabel(title, 130, 24);
    title.position.set(76, 76);
    this.addChild(sheet, card, title);

    this.cellW = (w - LEFT - 14) / CHEST_RARITIES.length;
    CHEST_RARITIES.forEach((rarity, i) => {
      const cx = LEFT + this.cellW * (i + 0.5);
      const rar = Rarity[rarity];
      const name = uiLabel(rarityName(rarity), { size: 24 });
      fitLabel(name, this.cellW - 10, 24);
      name.position.set(cx, 30);
      const chip = new Graphics();
      chip.roundRect(-18, -16, 36, 32, 9).fill(rar.color).stroke({ width: 2, color: rar.dark, alpha: 0.8, alignment: 0 });
      cacheStatic(chip);
      chip.position.set(cx, 72);
      const count = uiLabel('', { size: 30 });
      count.position.set(cx, 72);
      this.addChild(name, chip, count);
      this.counts.push({ rarity, text: count, chip, cx });
    });
  }

  set(wild: Readonly<Record<ChestRarity, number>>): void {
    for (const c of this.counts) {
      c.text.text = '×' + fmt(wild[c.rarity]);
      fitLabel(c.text, this.cellW - CHIP_W - CHIP_GAP - 12, 30);
      // The swatch and its count are one centred group, so a long count pushes the swatch left instead of running into it.
      const group = CHIP_W + CHIP_GAP + c.text.width;
      c.chip.x = c.cx - group / 2 + CHIP_W / 2;
      c.text.x = c.chip.x + CHIP_W / 2 + CHIP_GAP + c.text.width / 2;
    }
  }
}

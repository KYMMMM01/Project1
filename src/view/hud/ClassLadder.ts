/**
 * A class as its fixed five-rank line: the five cats as small photos in a row, joined by arrows
 * labelled "합성" (merge two identical cats) and "각성" (awaken a king). Ranks the player has on the
 * board are lit and carry their count; missing ranks are empty paper slots. An arrow turns into the
 * class colour when its step can be taken right now. Origin = top-left of the row.
 */
import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { unitRarity, type ClassId } from '@/game';
import { Color, drawPaper, fitLabel, paperSeed, rarityName, uiLabel, RARITY_ORDER } from '@/ui';
import { CLASS_ACCENT, unitPhoto } from './kit';
import { ladderOf, MERGE_NEED } from './planMath';

export const PHOTO = 68;
/** Photos, arrow labels and rank names: the height of the whole row. */
export const LADDER_H = PHOTO + 42;

export class ClassLadder extends Container {
  private readonly layer = new Container();
  private readonly seed = paperSeed();
  private key = '';

  constructor(
    private readonly classId: ClassId,
    private readonly w: number,
  ) {
    super();
    this.addChild(this.layer);
  }

  /** Cats per rank on the board, index 0 = kitten ... 4 = guardian. */
  set(counts: readonly number[]): void {
    const key = counts.join(',');
    if (key === this.key) return;
    this.key = key;
    for (const c of this.layer.removeChildren()) c.destroy({ children: true });
    const ids = ladderOf(this.classId);
    const accent = CLASS_ACCENT[this.classId];
    const gap = (this.w - PHOTO * ids.length) / (ids.length - 1);
    const cx = (i: number): number => PHOTO / 2 + i * (PHOTO + gap);
    const cy = PHOTO / 2;

    ids.forEach((id, i) => {
      const n = counts[i] ?? 0;
      const slot = new Container();
      slot.position.set(cx(i), cy);
      slot.addChild(unitPhoto({ size: PHOTO, rarity: unitRarity(id), unit: n > 0 ? id : null, seed: this.seed + i }));
      const name = uiLabel(rarityName(RARITY_ORDER[i] ?? 'common'), { size: 24, color: n > 0 ? Color.ink : Color.inkSoft });
      fitLabel(name, PHOTO + gap - 6, 24, 0.7);
      name.position.set(0, PHOTO / 2 + 22);
      slot.addChild(name);
      this.layer.addChild(slot);
      if (n > 0) this.layer.addChild(this.badge(n, cx(i) + PHOTO / 2 - 20, 6, accent));
    });

    for (let i = 0; i < ids.length - 1; i++) {
      const awaken = i === ids.length - 2;
      const ready = awaken ? (counts[i] ?? 0) > 0 : (counts[i] ?? 0) >= MERGE_NEED;
      const x = (cx(i) + cx(i + 1)) / 2;
      const arrow = new Graphics();
      arrow
        .poly([-9, -11, 11, 0, -9, 11])
        .fill(ready ? accent : Color.kraft)
        .stroke({ width: 2.5, color: ready ? Color.ink : Color.kraftDark, join: 'round' });
      arrow.position.set(x, cy - 4);
      const label = uiLabel(t(awaken ? 'hud.ladder.awaken' : 'hud.ladder.merge'), { size: 24, color: ready ? Color.ink : Color.inkSoft });
      fitLabel(label, gap + 8, 24, 0.7);
      label.position.set(x, cy + 24);
      this.layer.addChild(arrow, label);
    }
  }

  /** "x2" on a small paper pill overlapping a photo's corner; a pair (two or more) is mustard: it can merge. */
  private badge(n: number, x: number, y: number, accent: number): Container {
    const c = new Container();
    const label = uiLabel(`×${n}`, { size: 24, color: Color.inkDeep });
    const w = Math.max(44, label.width + 20);
    const g = new Graphics();
    drawPaper(g, -w / 2, -16, { w, h: 32, kind: 'pill', fill: n >= MERGE_NEED ? Color.mustard : Color.paperLight, edge: n >= MERGE_NEED ? Color.mustardDark : accent, shadow: 3, grain: false, seed: this.seed + 9 });
    c.addChild(g, label);
    c.position.set(x, y);
    return c;
  }
}

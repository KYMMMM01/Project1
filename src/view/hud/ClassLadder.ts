/**
 * A class as its fixed five-rank line: the five cats as paper photos in a row that grows toward the
 * awakened cat, joined by arrows labelled "합성" (merge two identical cats) and "각성" (awaken a king).
 * Ranks the player has on the board are lit and carry their count; missing ranks are empty paper
 * slots. An arrow turns into the class colour when its step can be taken right now. The photos stand
 * on one baseline with their rank names under them; each step label sits above the arrow it names,
 * clear of the neighbouring photos' tops. Origin = top-left of the row.
 */
import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { unitRarity, type ClassId } from '@/game';
import { Color, drawPaper, fitLabel, paperSeed, rarityName, uiLabel, RARITY_ORDER } from '@/ui';
import { CLASS_ACCENT, unitPhoto } from './kit';
import { ladderOf, MERGE_NEED } from './planMath';

/** Photo side per rank, kitten to guardian: the line widens toward the cat the player is working for. */
export const PHOTOS: readonly number[] = [88, 94, 100, 106, 112];
const BIGGEST = 112;
/** Room above the tallest photo for the step labels. */
const HEAD_H = 36;
const NAME_H = 40;
/** The whole row: step labels, photos on their baseline, rank names. */
export const LADDER_H = HEAD_H + BIGGEST + NAME_H;

const BASELINE = HEAD_H + BIGGEST;

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
    const size = (i: number): number => PHOTOS[i] ?? BIGGEST;
    const gap = (this.w - PHOTOS.reduce((a, b) => a + b, 0)) / (ids.length - 1);
    const left = (i: number): number => PHOTOS.slice(0, i).reduce((a, b) => a + b, 0) + i * gap;
    const cx = (i: number): number => left(i) + size(i) / 2;
    const top = (i: number): number => BASELINE - size(i);

    ids.forEach((id, i) => {
      const n = counts[i] ?? 0;
      const slot = new Container();
      slot.position.set(cx(i), BASELINE - size(i) / 2);
      slot.addChild(unitPhoto({ size: size(i), rarity: unitRarity(id), unit: n > 0 ? id : null, seed: this.seed + i }));
      this.layer.addChild(slot);
      const name = uiLabel(rarityName(RARITY_ORDER[i] ?? 'common'), { size: 24, color: n > 0 ? Color.ink : Color.inkSoft });
      fitLabel(name, size(i) + gap + 14, 24, 0.7);
      name.position.set(cx(i), BASELINE + 22);
      this.layer.addChild(name);
      if (n > 0) this.layer.addChild(this.badge(n, left(i) + size(i) - 22, top(i) + 12, accent));
    });

    for (let i = 0; i < ids.length - 1; i++) {
      const awaken = i === ids.length - 2;
      const ready = awaken ? (counts[i] ?? 0) > 0 : (counts[i] ?? 0) >= MERGE_NEED;
      const x = (left(i) + size(i) + left(i + 1)) / 2;
      // The step label rides just above the taller neighbour, the arrow tucks under it in the gap.
      const labelY = top(i + 1) - 16;
      const arrow = new Graphics();
      arrow
        .poly([-7, -10, 9, 0, -7, 10])
        .fill(ready ? accent : Color.kraft)
        .stroke({ width: 2.5, color: ready ? Color.ink : Color.kraftDark, join: 'round' });
      arrow.position.set(x, labelY + 32);
      const label = uiLabel(t(awaken ? 'hud.ladder.awaken' : 'hud.ladder.merge'), { size: 24, color: ready ? Color.ink : Color.inkSoft });
      fitLabel(label, size(i) + gap, 24, 0.7);
      label.position.set(x, labelY);
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

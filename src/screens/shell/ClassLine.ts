/**
 * One class as its fixed five-rank line: the five cats as small photos in a row, joined by arrows
 * labelled "merge" (two identical cats become the next rank) and one "awaken" (a king becomes the
 * guardian). A reference card for planning a build, so every rank is lit. Origin = top-left of the row.
 */
import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { UNIT_GRID, unitRarity, type ClassId } from '@/game';
import { Color, RARITY_ORDER, fitLabel, paperSeed, rarityName, uiLabel } from '@/ui';
import { CLASS_ACCENT, unitPhoto } from '@/view/hud/kit';
import './strings';

const PHOTO = 68;
export const CLASS_LINE_H = PHOTO + 42;

export class ClassLine extends Container {
  constructor(classId: ClassId, width: number) {
    super();
    const ids = UNIT_GRID[classId];
    const accent = CLASS_ACCENT[classId];
    const seed = paperSeed();
    const gap = (width - PHOTO * ids.length) / (ids.length - 1);
    const cx = (i: number): number => PHOTO / 2 + i * (PHOTO + gap);
    const cy = PHOTO / 2;

    ids.forEach((id, i) => {
      const photo = unitPhoto({ size: PHOTO, rarity: unitRarity(id), unit: id, seed: seed + i });
      photo.position.set(cx(i), cy);
      const name = uiLabel(rarityName(RARITY_ORDER[i] ?? 'common'), { size: 24 });
      fitLabel(name, PHOTO + gap - 6, 24, 0.7);
      name.position.set(cx(i), PHOTO + 20);
      this.addChild(photo, name);
    });

    for (let i = 0; i < ids.length - 1; i++) {
      const x = (cx(i) + cx(i + 1)) / 2;
      const arrow = new Graphics();
      arrow.poly([-9, -11, 11, 0, -9, 11]).fill(accent).stroke({ width: 2.5, color: Color.ink, join: 'round' });
      arrow.position.set(x, cy - 4);
      const label = uiLabel(t(i === ids.length - 2 ? 'shell.pre.lines.awaken' : 'shell.pre.lines.merge'), { size: 24 });
      fitLabel(label, gap + 8, 24, 0.7);
      label.position.set(x, cy + 24);
      this.addChild(arrow, label);
    }
  }
}

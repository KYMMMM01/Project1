/**
 * One class as its fixed five-rank line: the five cats as small photos in a row, joined by arrows.
 * The arrows between ranks are plain (the panel's hint says two identical cats merge into the next
 * rank); the last one is the awakening and carries its caption, with a gap of its own wide enough for
 * the longest word. A reference card for planning a build, so every rank is lit. Origin = top-left of the row.
 */
import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { UNIT_GRID, unitRarity, type ClassId } from '@/game';
import { Color, RARITY_ORDER, fitLabel, paperSeed, rarityName, uiLabel } from '@/ui';
import { CLASS_ACCENT, unitPhoto } from '@/view/hud/kit';
import { classLineSlots } from './layoutMath';
import { smoothPhoto } from './thumb';
import './strings';

const PHOTO = 68;
/** Room one arrow needs: 20 px of arrow and a breath on each side. */
const ARROW_GAP = 40;
const NAME_GAP = 6;
export const CLASS_LINE_H = PHOTO + 42;

export class ClassLine extends Container {
  constructor(classId: ClassId, width: number) {
    super();
    const ids = UNIT_GRID[classId];
    const accent = CLASS_ACCENT[classId];
    const seed = paperSeed();
    const slots = classLineSlots(width, ids.length, PHOTO, ARROW_GAP);
    const cy = PHOTO / 2;

    ids.forEach((id, i) => {
      const cx = slots.centres[i] as number;
      const photo = unitPhoto({ size: PHOTO, rarity: unitRarity(id), unit: id, seed: seed + i });
      smoothPhoto(photo, `unit_${id}`);
      photo.position.set(cx, cy);
      const name = uiLabel(rarityName(RARITY_ORDER[i] ?? 'common'), { size: 24 });
      // A name may spread into the gaps beside its photo, up to the next name, and never past the row.
      const left = i > 0 ? cx - (slots.centres[i - 1] as number) : Infinity;
      const right = i < ids.length - 1 ? (slots.centres[i + 1] as number) - cx : Infinity;
      fitLabel(name, Math.min(left, right, width) - NAME_GAP, 24);
      name.position.set(Math.min(width - name.width / 2, Math.max(name.width / 2, cx)), PHOTO + 20);
      this.addChild(photo, name);
    });

    for (let i = 0; i < ids.length - 1; i++) {
      const x = slots.arrows[i] as number;
      const arrow = new Graphics();
      arrow.poly([-9, -11, 11, 0, -9, 11]).fill(accent).stroke({ width: 2.5, color: Color.ink, join: 'round' });
      const awakens = i === ids.length - 2;
      arrow.position.set(x, awakens ? cy - 8 : cy);
      this.addChild(arrow);
      if (!awakens) continue;
      const label = uiLabel(t('shell.pre.lines.awaken'), { size: 24 });
      fitLabel(label, slots.lastGap - 8, 24);
      label.position.set(x, cy + 20);
      this.addChild(label);
    }
  }
}

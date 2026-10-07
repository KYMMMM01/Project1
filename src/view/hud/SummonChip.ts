import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { TAU, damp } from '@/core/math';
import { Pool } from '@/core/pool';
import { Ease } from '@/core/tween';
import { unitDef, unitRarity, unitRarityIndex, type UnitId } from '@/game';
import { Color, drawPaper, motion, paperSeed, Rarity, rarityName, uiLabel } from '@/ui';
import { unitPortrait } from './kit';
import { CHIP_H, CHIP_MAX, CHIP_SECONDS, CHIP_SQUEEZE, CHIP_WAIT, chipAlpha, chipFits, chipLifeLeft, chipRays, chipRise, chipScale, chipWidth } from './chipMath';

const POP = 0.22;

/** One chip: a paper plate with the new cat's portrait, its name and its rank in the rank's own colour. Pooled; rebuilt in place. */
class Chip {
  readonly root = new Container();
  readonly rays = new Graphics();
  readonly plate = new Graphics();
  readonly face = new Container();
  readonly name: Text;
  readonly rank: Text;
  left = 0;
  age = 0;
  slot = 0;
  y = 0;
  scale = 1;

  constructor() {
    this.name = uiLabel('', { size: 30, anchorX: 0, align: 'left' });
    this.rank = uiLabel('', { size: 24, anchorX: 0, align: 'left' });
    this.root.addChild(this.rays, this.plate, this.face, this.name, this.rank);
    this.root.eventMode = 'none';
    this.root.visible = false;
  }

  /** Dress the chip for `id`; the rays behind a high rank are only drawn when `rays` (they reach far above the plate). Its origin is the middle of the plate. */
  dress(id: UnitId, rays: boolean): void {
    const tier = unitRarityIndex(id);
    const style = Rarity[unitRarity(id)];
    this.name.text = t(unitDef(id).nameKey);
    this.rank.text = rarityName(unitRarity(id));
    this.rank.style.fill = style.dark;
    const w = chipWidth(Math.max(this.name.width, this.rank.width));
    this.plate.clear();
    drawPaper(this.plate, -w / 2, -CHIP_H / 2, { w, h: CHIP_H, radius: 26, fill: Color.paperLight, edge: style.color, edgeWidth: 4, edgeAlpha: 1, seed: paperSeed(), shadow: 5, grain: false });
    for (const old of this.face.removeChildren()) old.destroy({ children: true });
    const photo = unitPortrait(id, CHIP_H - 14);
    photo.position.set(-w / 2 + 16 + 40, 0);
    this.face.addChild(photo);
    this.name.position.set(-w / 2 + 16 + 80 + 14, -17);
    this.rank.position.set(-w / 2 + 16 + 80 + 14, 20);
    const rings = rays ? chipRays(tier) : 0;
    this.rays.clear();
    if (rings > 0) {
      // Flat paper rays behind the plate, longer above it than below (the summon button is there): one ring for an epic, a second and longer one for the two ranks above.
      for (let ring = 0; ring < rings; ring++) {
        const n = 12;
        const reach = w * 0.5 + 40 + ring * 36;
        for (let i = 0; i < n; i++) {
          const a = ((i + ring * 0.5) / n) * TAU;
          const half = 0.15;
          this.rays.poly([Math.cos(a - half) * 30, Math.sin(a - half) * 30, Math.cos(a) * reach, Math.sin(a) * reach * (Math.sin(a) > 0 ? 0.5 : 0.85), Math.cos(a + half) * 30, Math.sin(a + half) * 30]);
        }
        this.rays.fill({ color: ring === 0 ? style.color : style.light, alpha: ring === 0 ? 0.62 : 0.5 });
      }
    }
    this.scale = chipScale(tier);
  }
}

/**
 * The result chip above the summon button: the portrait, name and rank of the cat that has just arrived, for about a
 * second and a half. Rapid summons stack (the newest nearest the button, at most three, an older one leaves sooner to make
 * room); a higher rank is a visibly bigger chip with rays behind it. Under reduced motion the chip simply shows and goes.
 */
export class SummonChips {
  readonly root = new Container();
  private readonly pool = new Pool<Chip>(() => new Chip());
  /** Newest first. */
  private readonly live: Chip[] = [];
  /** Results that found no room under a lesson's note and wait for it to leave (newest last). */
  private readonly waiting: Array<{ id: UnitId; age: number }> = [];
  /** Where the first slot's centre line lies in scene space, set by the layout. */
  originY = 0;
  /**
   * Scene-space bottom edge of whatever lies over the chips' column (a lesson's note, a first-encounter card), or null. Chips only lie on
   * free paper: they wait for room under it, and leave when it comes down over them (see chipMath.ts).
   */
  ceiling: () => number | null = () => null;

  constructor() {
    this.root.eventMode = 'none';
  }

  show(id: UnitId): void {
    const ceiling = this.ceiling();
    if (!chipFits(this.originY, 0, chipScale(unitRarityIndex(id)), ceiling)) {
      // No room under the note: the result waits for it to go (the newest three at most).
      this.waiting.push({ id, age: 0 });
      if (this.waiting.length > CHIP_MAX) this.waiting.shift();
      return;
    }
    this.add(id, ceiling);
  }

  private add(id: UnitId, ceiling: number | null): void {
    const chip = this.pool.get();
    chip.dress(id, ceiling === null);
    chip.left = CHIP_SECONDS;
    chip.age = 0;
    chip.slot = 0;
    chip.y = 0;
    chip.root.visible = true;
    chip.root.alpha = 1;
    this.root.addChild(chip.root);
    // Every older chip makes room: it leaves sooner, and the third one back is gone at once.
    for (const old of this.live) old.left = chipLifeLeft(old.left, 1);
    this.live.unshift(chip);
    while (this.live.length > CHIP_MAX) this.drop(this.live.pop() as Chip);
    this.live.forEach((c, i) => (c.slot = i));
    this.place(chip);
  }

  private place(c: Chip): void {
    const grow = motion.reduced ? 1 : Ease.backOut(Math.min(1, c.age / POP));
    c.root.position.set(0, c.y);
    c.root.scale.set(c.scale * (0.55 + 0.45 * grow));
    c.rays.rotation = motion.reduced ? 0 : c.age * 0.5;
    c.rays.alpha = motion.reduced ? 1 : Math.min(1, c.age / 0.12);
  }

  update(dt: number): void {
    const ceiling = this.ceiling();
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const w = this.waiting[i] as { id: UnitId; age: number };
      w.age += dt;
      if (chipFits(this.originY, 0, chipScale(unitRarityIndex(w.id)), ceiling)) {
        this.waiting.splice(i, 1);
        this.add(w.id, ceiling);
      } else if (w.age > CHIP_WAIT) {
        this.waiting.splice(i, 1);
      }
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i] as Chip;
      c.age += dt;
      c.left -= dt;
      // A note that has come down over a chip sends it away quickly (it never lies under one).
      if (!chipFits(this.originY, c.slot, c.scale, ceiling)) c.left = Math.min(c.left, CHIP_SQUEEZE);
      if (c.left <= 0) {
        this.live.splice(i, 1);
        this.drop(c);
        continue;
      }
      const to = chipRise(c.slot);
      c.y = motion.reduced ? to : damp(c.y, to, 0.06, dt);
      c.root.alpha = motion.reduced ? 1 : chipAlpha(c.left);
      this.place(c);
    }
  }

  private drop(c: Chip): void {
    c.root.visible = false;
    c.root.parent?.removeChild(c.root);
    this.pool.release(c);
  }

  destroy(): void {
    for (const c of this.live) c.root.destroy({ children: true });
    this.live.length = 0;
    this.waiting.length = 0;
    this.pool.drain((c) => c.root.destroy({ children: true }));
    this.root.destroy({ children: true });
  }
}

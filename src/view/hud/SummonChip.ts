import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { TAU, damp } from '@/core/math';
import { Pool } from '@/core/pool';
import { Ease } from '@/core/tween';
import { unitDef, unitRarity, unitRarityIndex, type UnitId } from '@/game';
import { Color, drawPaper, motion, paperSeed, Rarity, rarityName, uiLabel } from '@/ui';
import { unitPortrait } from './kit';
import { CHIP_H, CHIP_MAX, CHIP_SECONDS, chipAlpha, chipLifeLeft, chipRays, chipRise, chipScale, chipWidth } from './chipMath';

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

  /** Dress the chip for `id`. Its origin is the middle of the plate. */
  dress(id: UnitId): void {
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
    const rings = chipRays(tier);
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

  constructor() {
    this.root.eventMode = 'none';
  }

  show(id: UnitId): void {
    const chip = this.pool.get();
    chip.dress(id);
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
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i] as Chip;
      c.age += dt;
      c.left -= dt;
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
    this.pool.drain((c) => c.root.destroy({ children: true }));
    this.root.destroy({ children: true });
  }
}

/**
 * The four class chips: class glyph, five rarity pips (which rarities are on the board) and the
 * synergy tier. In the first run the row stays hidden until the first merge.
 */
import { Container } from 'pixi.js';
import { CLASS_IDS, type ClassId } from '@/game';
import { ClassChip, motion, popIn, TweenBag } from '@/ui';
import type { HudEnv } from './env';
import { CLASS_ACCENT, CLASS_ICON } from './kit';

const FIRST_X = 96;
const STEP = 176;

export class ClassRow {
  readonly root = new Container();
  private readonly chips: ClassChip[] = [];
  private readonly bag = new TweenBag();
  private dirty = true;
  private unlocked: boolean;

  constructor(
    private readonly env: HudEnv,
    open: (id: ClassId) => void,
  ) {
    const b = env.battle;
    this.unlocked = env.ctx.run.runsPlayed >= 1 || b.getStats().merges > 0;
    CLASS_IDS.forEach((id, i) => {
      const chip = new ClassChip({
        icon: CLASS_ICON[id],
        owned: b.classOwned(id),
        tier: b.synergyTier(id),
        accent: CLASS_ACCENT[id],
        onTap: () => open(id),
      });
      chip.position.set(FIRST_X + i * STEP, 0);
      this.root.addChild(chip);
      this.chips.push(chip);
    });
    this.root.visible = this.unlocked;

    const mark = (): void => {
      this.dirty = true;
    };
    for (const type of ['summon', 'merge', 'molt', 'awaken', 'sell', 'synergy', 'relicGain'] as const) env.on(b.events, type, mark);
    env.on(b.events, 'merge', () => this.unlock());
    env.on(b.events, 'synergy', ({ tier, previous }) => {
      if (tier > previous && tier >= 1) env.hints.request('synergy', this.root);
    });
  }

  /** First merge of the first run: the chips pop in one after another. */
  private unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.root.visible = true;
    this.refresh(false);
    this.chips.forEach((chip, i) => {
      if (!motion.reduced) popIn(this.bag, chip, { from: 0.3, duration: 0.3, delay: i * 0.06, overshoot: 2.5 });
    });
    this.env.hints.request('chips', this.root);
  }

  private refresh(animate: boolean): void {
    const b = this.env.battle;
    CLASS_IDS.forEach((id, i) => {
      const chip = this.chips[i] as ClassChip;
      chip.setOwned(b.classOwned(id), animate);
      chip.setTier(b.synergyTier(id), animate);
    });
  }

  invalidate(): void {
    this.dirty = true;
    if (!this.unlocked && this.env.battle.getStats().merges > 0) this.unlock();
  }

  layout(y: number): void {
    this.root.position.set(0, y);
  }

  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    if (this.unlocked) this.refresh(true);
  }

  destroy(): void {
    this.bag.killAll();
    this.root.destroy({ children: true });
  }
}

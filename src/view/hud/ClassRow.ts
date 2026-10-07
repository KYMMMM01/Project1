/**
 * The four class chips: class glyph, five rarity pips (which ranks are on the board) and the synergy
 * tier, each cream card taped down with its class's washi tape. In the first run the row stays hidden
 * until the first merge.
 */
import { Container } from 'pixi.js';
import { CLASS_IDS, type ClassId } from '@/game';
import { ClassChip, CLASS_CHIP_H, CLASS_CHIP_W, motion, popIn, tapeStrip, TweenBag } from '@/ui';
import type { HudEnv } from './env';
import { CLASS_ACCENT, CLASS_ICON, CLASS_TAPE } from './kit';

const FIRST_X = 96;
const STEP = 176;

export class ClassRow {
  readonly root = new Container();
  private readonly chips: ClassChip[] = [];
  private readonly holders: Container[] = [];
  private readonly bag = new TweenBag();
  private dirty = true;
  private unlocked: boolean;

  constructor(
    private readonly env: HudEnv,
    open: (id: ClassId) => void,
  ) {
    const b = env.battle;
    this.unlocked = env.reveal.chips;
    CLASS_IDS.forEach((id, i) => {
      const chip = new ClassChip({
        icon: CLASS_ICON[id],
        owned: b.classOwned(id),
        tier: b.synergyTier(id),
        accent: CLASS_ACCENT[id],
        onTap: () => {
          env.hints.used('classes');
          env.hints.used('class_sheet');
          open(id);
        },
      });
      const tape = tapeStrip({ name: CLASS_TAPE[id], w: 56, h: 22, angle: i % 2 === 0 ? -20 : 16, pattern: i % 2 === 0 ? 'dots' : 'gingham' });
      tape.position.set(-CLASS_CHIP_W / 2 + 26, -CLASS_CHIP_H / 2 + 2);
      const holder = new Container();
      holder.position.set(FIRST_X + i * STEP, 0);
      holder.addChild(chip, tape);
      this.root.addChild(holder);
      this.chips.push(chip);
      this.holders.push(holder);
    });
    this.root.visible = this.unlocked;

    const mark = (): void => {
      this.dirty = true;
    };
    for (const type of ['summon', 'merge', 'molt', 'awaken', 'sell', 'synergy', 'relicGain'] as const) env.on(b.events, type, mark);
    env.on(env.revealed, 'reveal', ({ key, fresh }) => {
      if (key === 'chips') this.unlock(fresh);
    });
    env.on(b.events, 'synergy', ({ tier, previous }) => {
      if (tier > previous && tier >= 1) env.hints.request('synergy', this.root);
    });
  }

  /** The tutorial brings the chips in: they pop in one after another. */
  private unlock(fresh: boolean): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.root.visible = true;
    this.refresh(false);
    this.holders.forEach((holder, i) => {
      if (fresh && !motion.reduced) popIn(this.bag, holder, { from: 0.3, duration: 0.3, delay: i * 0.06, overshoot: 2.5 });
    });
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

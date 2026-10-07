/**
 * Fish (large) and purr counters with count-up and pop, the soft-pity chip (only from 9 of 12 dry
 * summons) and the odds chip. Gains that fly in from the field are shown when the icons would land.
 */
import { Container, Graphics, Point, type Text } from 'pixi.js';
import { Ease } from '@/core/tween';
import { t } from '@/core/i18n';
import { Button, Color, CurrencyPill, drawPaper, motion, paperSeed, popIn, TweenBag, uiLabel } from '@/ui';
import { landings } from '@/view/landings';
import type { HudEnv } from './env';
import { tapArea } from './kit';
import { pityVisible } from './policy';

/** A flight that never lands (cancelled by a pause menu, a cap) must not leave the number short for ever. */
const FALLBACK = 3;

interface Gain {
  left: number;
}

/** Keeps the shown amount equal to the real one minus gains still in the air; each icon that lands pays its share in. */
class Counter {
  private total: number;
  private pending = 0;
  private readonly gains: Gain[] = [];

  constructor(
    readonly pill: CurrencyPill,
    private readonly bag: TweenBag,
    start: number,
  ) {
    this.total = start;
  }

  /** Forget gains in flight and show the real amount. */
  reset(total: number): void {
    this.total = total;
    this.pending = 0;
    this.gains.length = 0;
    this.pill.setAmount(total, false);
  }

  apply(total: number, delta: number, delayed: boolean): void {
    this.total = total;
    if (delta > 0 && delayed) {
      const gain: Gain = { left: delta };
      this.gains.push(gain);
      this.pending += delta;
      this.bag.call(FALLBACK, () => this.settle(gain, gain.left));
    } else {
      this.pill.setAmount(total - this.pending, true);
    }
  }

  /** An icon touched the pill: its share of the oldest gains in the air shows now. */
  landed(amount: number): void {
    let rest = amount;
    for (const gain of this.gains) {
      if (rest <= 0) break;
      const take = Math.min(gain.left, rest);
      this.settle(gain, take);
      rest -= take;
    }
  }

  private settle(gain: Gain, take: number): void {
    if (take <= 0) return;
    gain.left -= take;
    if (gain.left <= 0) this.gains.splice(this.gains.indexOf(gain), 1);
    this.pending = Math.max(0, this.pending - take);
    this.pill.setAmount(this.total - this.pending, true);
  }
}

/** Right edge of the pity chip: 8 px clear of the odds button. */
const PITY_RIGHT = 592;

export class CurrencyRow {
  readonly root = new Container();
  readonly fish: CurrencyPill;
  readonly purr: CurrencyPill;
  private readonly fishCounter: Counter;
  private readonly purrCounter: Counter;
  private readonly bag = new TweenBag();
  private readonly pity = new Container();
  private readonly pityText: Text;
  private readonly pityCaption: Text;
  private readonly pityBg = new Graphics();
  private readonly pitySeed = paperSeed();
  private readonly odds: Button;
  private pityShown = false;
  private readonly tmp = new Point();

  constructor(
    private readonly env: HudEnv,
    openOdds: () => void,
  ) {
    const b = env.battle;
    const r = env.reveal;
    this.fish = new CurrencyPill({ icon: 'fish', amount: b.fish, width: 224, tickSfx: false });
    this.purr = new CurrencyPill({ icon: 'purr', amount: b.purr, width: 156, tickSfx: false });
    this.fishCounter = new Counter(this.fish, this.bag, b.fish);
    this.purrCounter = new Counter(this.purr, this.bag, b.purr);
    this.fish.position.set(r.purr ? 152 : 360, 0);
    this.purr.position.set(380, 0);
    this.purr.visible = r.purr;

    // Two lines on the mustard paper: what it counts, then how far along it is.
    this.pityCaption = uiLabel(t('hud.pity'), { size: 24, color: Color.inkDeep });
    this.pityText = uiLabel('', { size: 28, color: Color.inkDeep });
    this.pity.addChild(this.pityBg, this.pityCaption, this.pityText);
    // The chip grows leftwards from its right edge so a long "10/12" never runs into the odds button.
    this.pity.position.set(PITY_RIGHT, 0);
    this.pity.visible = false;
    this.drawPity();
    this.pity.on('pointerup', openOdds);

    this.odds = new Button({ label: '%', style: 'info', width: 84, height: 84, fontSize: 40, radius: 'pill' });
    this.odds.position.set(646, 0);
    this.odds.onTap(openOdds);
    this.odds.visible = r.odds;

    this.root.addChild(this.fish, this.purr, this.pity, this.odds);

    env.on(b.events, 'fish', ({ total, delta, reason }) => this.fishCounter.apply(total, delta, reason !== 'start'));
    env.on(b.events, 'purr', ({ total, delta, reason }) => {
      this.purrCounter.apply(total, delta, reason !== 'start');
      if (delta > 0 && r.purr) env.hints.request('purr', this.purr);
    });
    env.on(landings, 'landed', ({ kind, amount }) => (kind === 'fish' ? this.fishCounter : this.purrCounter).landed(amount));
    env.on(b.events, 'pity', () => this.refreshPity());
    env.on(b.events, 'summon', () => this.refreshPity());
    env.on(env.ctx.events, 'refused', ({ fail }) => {
      if (fail === 'not_enough_fish') this.fish.shakeInsufficient();
      else if (fail === 'not_enough_purr' && r.purr) this.purr.shakeInsufficient();
    });
    this.refreshPity();
  }

  private refreshPity(): void {
    if (!this.env.reveal.odds) return;
    const p = this.env.battle.pity();
    const show = pityVisible(p);
    this.pityText.text = p.epicBonus > 0 ? `+${Math.round(p.epicBonus * 100)}%` : `${p.epicDry}/${p.epicDryLimit}`;
    this.drawPity();
    if (show !== this.pityShown) {
      this.pityShown = show;
      this.pity.visible = show;
      if (show && !motion.reduced) popIn(this.bag, this.pity, { from: 0.3, duration: 0.3, overshoot: 3 });
    }
    if (show) this.pulse(p.epicBonus > 0);
  }

  private drawPity(): void {
    const w = Math.max(104, 44 + Math.max(this.pityText.width, this.pityCaption.width));
    this.pityBg.clear();
    drawPaper(this.pityBg, -w, -32, { w, h: 64, kind: 'pill', fill: Color.mustard, edge: Color.mustardDark, shadow: 4, grain: false, seed: this.pitySeed });
    this.pityCaption.position.set(-w / 2, -14);
    this.pityText.position.set(-w / 2, 14);
    tapArea(this.pity, -w, -44, w, 88);
  }

  /** While the bonus is growing the chip sways like a scrap of paper in a draught. */
  private pulse(on: boolean): void {
    if (!on || motion.reduced) {
      this.bag.killKeyed(this.pity);
      this.pity.rotation = 0;
      return;
    }
    this.bag.runKeyed(this.pity, {
      duration: 0.5,
      ease: Ease.sineInOut,
      yoyo: true,
      repeat: -1,
      onUpdate: (k) => (this.pity.rotation = -0.03 + 0.06 * k),
    });
  }

  invalidate(): void {
    this.fishCounter.reset(this.env.battle.fish);
    this.purrCounter.reset(this.env.battle.purr);
    this.refreshPity();
  }

  layout(y: number): void {
    this.root.position.set(0, y);
  }

  /** Scene-space centre of the currency icons (fly-to targets). */
  iconCentre(which: 'fish' | 'purr'): { x: number; y: number } {
    const pill = which === 'fish' ? this.fish : this.purr;
    return this.env.toHud(pill.getIconGlobalPosition(this.tmp));
  }

  destroy(): void {
    this.bag.killAll();
    this.root.destroy({ children: true });
  }
}

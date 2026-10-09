/**
 * Fish (large) and purr counters with count-up and pop, the soft-pity chip (only from 9 of 12 dry
 * summons) and the odds chip. Gains that fly in from the field are shown when the icons would land.
 */
import { Container, Graphics, Point, type Text } from 'pixi.js';
import { Ease } from '@/core/tween';
import { t } from '@/core/i18n';
import { Button, Color, CurrencyPill, drawPaper, fitLabel, motion, paperSeed, popIn, TweenBag, uiLabel } from '@/ui';
import { info } from '@/view/info';
import { flies, landings } from '@/view/landings';
import type { HudEnv } from './env';
import type { RevealKey } from './policy';
import { tapArea } from './kit';
import { pityVisible } from './policy';
import { CURRENCY_ROW, FISH_X, PURR_X, incomeShown } from './incomeMath';

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

/**
 * The round "%" button. The kit's button fits its label to the width its rounded paper leaves, which is 28 px on an 84 px disc and makes the
 * mark read as a speck; the mark is set on the face here, at 40 px, and presses with it.
 */
class OddsButton extends Button {
  constructor() {
    super({ style: 'info', width: 84, height: 84, radius: 'pill' });
    this.face.addChild(uiLabel('%', { size: 40 }));
  }
}

/** Right edge of the pity chip: 8 px clear of the odds button. */
const PITY_RIGHT = 592;
/** Where the fish counter stands while it is alone (beside the purr counter it stands at `FISH_X`). */
const FISH_ALONE_X = 360;
const TAG_H = 48;
const TAG_TIP = 'income';

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
  readonly odds: Button;
  /** The fish a second that come in by themselves, as a small paper tag beside the fish pill ("+0.5/s"); a tap says what it is. */
  private readonly income = new Container();
  private readonly incomeText: Text;
  private incomeKey = '';
  private pityShown = false;
  private readonly tmp = new Point();

  constructor(
    private readonly env: HudEnv,
    openOdds: () => void,
  ) {
    const b = env.battle;
    const r = env.reveal;
    this.fish = new CurrencyPill({ icon: 'fish', amount: b.fish, width: CURRENCY_ROW.fishW, tickSfx: false });
    this.purr = new CurrencyPill({ icon: 'purr', amount: b.purr, width: CURRENCY_ROW.purrW, tickSfx: false });
    this.fishCounter = new Counter(this.fish, this.bag, b.fish);
    this.purrCounter = new Counter(this.purr, this.bag, b.purr);
    this.fish.position.set(r.purr ? FISH_X : FISH_ALONE_X, 0);
    this.purr.position.set(PURR_X, 0);
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

    this.odds = new OddsButton();
    this.odds.position.set(646, 0);
    this.odds.onTap(openOdds);
    this.odds.visible = r.odds;

    this.incomeText = uiLabel('', { size: 24, color: Color.inkDeep });
    this.income.addChild(this.incomeText);
    this.income.on('pointerup', () => this.explainIncome());
    this.income.visible = false;

    this.root.addChild(this.fish, this.income, this.purr, this.pity, this.odds);

    env.on(b.events, 'fish', ({ total, delta, reason }) => this.fishCounter.apply(total, delta, flies(reason)));
    env.on(b.events, 'purr', ({ total, delta, reason }) => {
      this.purrCounter.apply(total, delta, reason !== 'start');
      if (delta > 0 && r.purr) env.hints.request('purr', this.purr);
    });
    env.on(landings, 'landed', ({ kind, amount }) => (kind === 'fish' ? this.fishCounter : this.purrCounter).landed(amount));
    env.on(env.revealed, 'reveal', ({ key, fresh }) => this.onReveal(key, fresh));
    env.on(b.events, 'pity', () => this.refreshPity());
    env.on(b.events, 'summon', () => this.refreshPity());
    env.on(env.ctx.events, 'refused', ({ fail }) => {
      if (fail === 'not_enough_fish') this.fish.shakeInsufficient();
      else if (fail === 'not_enough_purr' && r.purr) this.purr.shakeInsufficient();
    });
    this.refreshPity();
  }

  /** Called every frame: the tag follows the fish pill and says the income right now (it changes when a cat steps on or off a treat cell, or a hazard stops one). */
  update(): void {
    const rate = this.env.battle.incomePerSecond();
    const text = rate > 0 ? t('hud.income', { n: incomeShown(rate) }) : '';
    if (text !== this.incomeKey) {
      this.incomeKey = text;
      this.drawIncome(text);
    }
    this.income.position.set(this.fish.x + CURRENCY_ROW.fishW / 2 + CURRENCY_ROW.gap, 0);
  }

  private drawIncome(text: string): void {
    this.income.visible = text !== '';
    if (!this.income.visible) return;
    const w = CURRENCY_ROW.tagW;
    this.incomeText.text = text;
    fitLabel(this.incomeText, w - 20, 24);
    this.incomeText.position.set(w / 2, 0);
    this.income.children.filter((c) => c !== this.incomeText).forEach((c) => c.destroy());
    const back = new Graphics();
    drawPaper(back, 0, -TAG_H / 2, { w, h: TAG_H, kind: 'pill', fill: Color.paperLight, edge: Color.leafDark, edgeWidth: 3, edgeAlpha: 1, shadow: 3, grain: false, seed: this.pitySeed });
    this.income.addChildAt(back, 0);
    // The touch target is the full row height even though the tag is 48 px tall.
    tapArea(this.income, -4, -44, w + 8, 88);
  }

  private explainIncome(): void {
    info.tap(TAG_TIP, this.income, { text: t('hud.income.tip', { n: incomeShown(this.env.battle.incomePerSecond()) }) });
  }

  /** The purr counter arrives beside the fish (which slides over to make room); the odds button pops in. */
  private onReveal(key: RevealKey, fresh: boolean): void {
    if (key === 'purr') {
      this.purr.visible = true;
      if (fresh && !motion.reduced) {
        popIn(this.bag, this.purr, { from: 0.3, duration: 0.32, overshoot: 2.8 });
        const x0 = this.fish.x;
        this.bag.runKeyed(this.fish, { duration: 0.28, ease: Ease.cubicOut, onUpdate: (k) => (this.fish.x = x0 + (FISH_X - x0) * k), onComplete: () => (this.fish.x = FISH_X) });
      } else {
        this.fish.x = FISH_X;
      }
    } else if (key === 'odds') {
      this.odds.visible = true;
      this.refreshPity();
      if (fresh && !motion.reduced) popIn(this.bag, this.odds, { from: 0.3, duration: 0.32, overshoot: 2.8 });
    }
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

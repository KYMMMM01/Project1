/**
 * Fish (large) and purr counters with count-up and pop, the soft-pity chip (only from 9 of 12 dry
 * summons) and the odds chip. Gains that fly in from the field are shown when the icons would land.
 */
import { Container, Graphics, Point, type Text } from 'pixi.js';
import { Ease } from '@/core/tween';
import type { CurrencyReason } from '@/game';
import { Button, Color, CurrencyPill, drawIcon, motion, popIn, TweenBag, uiLabel, vGradient } from '@/ui';
import type { HudEnv } from './env';
import { tapArea } from './kit';
import { pityVisible } from './policy';

/** Seconds the fly-to-HUD icons take: the number catches up when they land. */
const FLIGHT = 0.5;
const FLY_REASONS: ReadonlySet<CurrencyReason> = new Set<CurrencyReason>(['kill', 'boss', 'wave', 'act', 'call']);

/** Keeps the shown amount equal to the real one minus gains still in the air. */
class Counter {
  private total: number;
  private pending = 0;

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
    this.pill.setAmount(total, false);
  }

  apply(total: number, delta: number, delayed: boolean): void {
    this.total = total;
    if (delta > 0 && delayed) {
      this.pending += delta;
      this.bag.call(FLIGHT, () => {
        this.pending = Math.max(0, this.pending - delta);
        this.pill.setAmount(this.total - this.pending, true);
      });
    } else {
      this.pill.setAmount(total - this.pending, true);
    }
  }
}

export class CurrencyRow {
  readonly root = new Container();
  readonly fish: CurrencyPill;
  readonly purr: CurrencyPill;
  private readonly fishCounter: Counter;
  private readonly purrCounter: Counter;
  private readonly bag = new TweenBag();
  private readonly pity = new Container();
  private readonly pityText: Text;
  private readonly pityBg = new Graphics();
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
    this.purr = new CurrencyPill({ icon: 'purr', amount: b.purr, width: 170, tickSfx: false });
    this.fishCounter = new Counter(this.fish, this.bag, b.fish);
    this.purrCounter = new Counter(this.purr, this.bag, b.purr);
    this.fish.position.set(r.purr ? 152 : 360, 0);
    this.purr.position.set(384, 0);
    this.purr.visible = r.purr;

    this.pityBg.roundRect(-46, -34, 92, 68, 34).fill(vGradient(0x6a4fc0, 0x3e2b82)).stroke({ width: 5, color: Color.outline, alignment: 1 });
    const star = drawIcon('star', 30);
    star.position.set(-22, 0);
    this.pityText = uiLabel('', { size: 26, anchorX: 0, align: 'left', strokeWidth: 4, shadow: false });
    this.pityText.position.set(-2, 1);
    this.pity.addChild(this.pityBg, star, this.pityText);
    this.pity.position.set(540, 0);
    this.pity.visible = false;
    tapArea(this.pity, -46, -44, 92, 88);
    this.pity.on('pointerup', openOdds);

    this.odds = new Button({ label: '%', style: 'info', width: 92, height: 76, fontSize: 40, radius: 'pill' });
    this.odds.position.set(646, 0);
    this.odds.onTap(openOdds);
    this.odds.visible = r.odds;

    this.root.addChild(this.fish, this.purr, this.pity, this.odds);

    env.on(b.events, 'fish', ({ total, delta, reason }) => this.fishCounter.apply(total, delta, FLY_REASONS.has(reason)));
    env.on(b.events, 'purr', ({ total, delta, reason }) => {
      this.purrCounter.apply(total, delta, FLY_REASONS.has(reason));
      if (delta > 0 && r.purr) env.hints.request('purr', this.purr);
    });
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
    if (show !== this.pityShown) {
      this.pityShown = show;
      this.pity.visible = show;
      if (show && !motion.reduced) popIn(this.bag, this.pity, { from: 0.3, duration: 0.3, overshoot: 3 });
    }
    if (show) this.pulse(p.epicBonus > 0);
  }

  private pulse(on: boolean): void {
    if (!on || motion.reduced) {
      this.bag.killKeyed(this.pityBg);
      this.pityBg.alpha = 1;
      return;
    }
    this.bag.runKeyed(this.pityBg, {
      duration: 0.5,
      ease: Ease.sineInOut,
      yoyo: true,
      repeat: -1,
      onUpdate: (k) => (this.pityBg.alpha = 0.7 + 0.3 * k),
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

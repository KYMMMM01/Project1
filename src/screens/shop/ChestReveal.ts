import { Container, Graphics, Rectangle } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { Ease, uiTweens } from '@/core/tween';
import { lerp } from '@/core/math';
import { Fx } from '@/fx';
import { profile } from '@/meta';
import type { ChestRarity, ChestResult } from '@/meta/types';
import {
  backOut, Button, CardFrame, Color, countUpDuration, countUpValue, drawGlow, drawIcon, formatCount, motion, numberText, Rarity,
  Tag, TweenBag, uiLabel, vGradient, fitLabel,
} from '@/ui';
import { chestArt, unitPortrait, wildArt } from './art';
import { bestRarity, gridLayout, rarityRank, revealSchedule, stacksOf, totalCards, type GridLayout, type RevealSchedule, type RevealStack } from './revealPlan';

interface StackView {
  stack: RevealStack;
  holder: Container;
  back: Graphics;
  face: Container;
  count: ReturnType<typeof numberText>;
  shown: boolean;
}

const CHEST_SIZE = 330;

/** Gold of the glow ring and the strength of each rarity's flourish (shake, haptic, sound). */
const FLOURISH: Record<ChestRarity, { shake: number; haptic: 'light' | 'medium' | 'heavy' | 'jackpot'; sfx: 'summon_common' | 'summon_rare' | 'summon_epic' | 'summon_legendary' }> = {
  common: { shake: 0, haptic: 'light', sfx: 'summon_common' },
  rare: { shake: 0.1, haptic: 'light', sfx: 'summon_rare' },
  epic: { shake: 0.25, haptic: 'medium', sfx: 'summon_epic' },
  legendary: { shake: 0.55, haptic: 'jackpot', sfx: 'summon_legendary' },
};

/**
 * Full-screen chest opening. The result is already decided and stored by the meta layer; this only
 * replays it: the chest drops and rattles (glow colour = best rarity inside, from the first frame),
 * bursts, and one stack of cards at a time flies out in an arc and flips. Skippable from the first
 * frame; the summary grid is the final layout of the same cards.
 */
class ChestReveal {
  private readonly bag = new TweenBag();
  private readonly root = new Container();
  private readonly raysLayer = new Container();
  private readonly gridLayer = new Container();
  private readonly chestLayer = new Container();
  private readonly fxHost = new Container();
  private readonly ui = new Container();
  private readonly fx: Fx;
  private readonly offUpdate: () => void;
  private readonly stacks: RevealStack[];
  private readonly best: ChestRarity;
  private readonly schedule: RevealSchedule;
  private readonly views: StackView[] = [];
  private readonly skip: Button;
  private readonly done: Button;
  private readonly summary = new Container();
  private readonly onKey: (e: KeyboardEvent) => void;
  private chest: Container;
  private glow: Graphics;
  private grid: GridLayout;
  private area = { x: 24, y: 150, w: 672, h: 800 };
  private flipped = 0;
  private finished = false;
  private leaving = false;
  private resolve!: () => void;
  readonly closed: Promise<void>;

  constructor(private readonly result: ChestResult) {
    this.stacks = stacksOf(result);
    this.best = bestRarity(this.stacks);
    this.schedule = revealSchedule(this.stacks);
    this.closed = new Promise<void>((r) => {
      this.resolve = r;
    });

    this.computeArea();
    this.grid = gridLayout(this.stacks.length, this.area.w, this.area.h);

    const W = game.w;
    const H = game.h;
    const backdrop = new Graphics();
    backdrop.rect(0, 0, W, H).fill(vGradient(0x2a1d52, Color.bgDeep));
    backdrop.eventMode = 'static';
    backdrop.hitArea = new Rectangle(0, 0, W, H);
    backdrop.on('pointertap', () => {
      if (!this.finished) this.skipToEnd();
    });

    const title = uiLabel(t('meta.chest.' + result.kind), { size: 52, strokeWidth: 8 });
    fitLabel(title, W - 340, 52);
    title.position.set(W / 2, game.safeTop + 74);

    this.glow = new Graphics();
    const rs = Rarity[this.best];
    drawGlow(this.glow, 0, 0, CHEST_SIZE * 0.95, rs.glow, 0.9);
    this.glow.blendMode = 'add';
    this.chest = chestArt(result.kind, CHEST_SIZE);

    this.skip = new Button({ label: t('reveal.skip'), icon: 'fast_forward', style: 'neutral', width: 220, height: 96, fontSize: 28 });
    this.skip.position.set(W - 24 - 110, game.safeTop + 74);
    this.skip.onTap(() => this.skipToEnd());
    this.done = new Button({ label: t('reveal.done'), style: 'primary', width: 380, height: 112, fontSize: 46 });
    this.done.visible = false;
    this.done.onTap(() => this.leave());

    this.chestLayer.addChild(this.glow, this.chest);
    this.ui.addChild(title, this.summary, this.skip, this.done);
    this.root.addChild(backdrop, this.raysLayer, this.gridLayer, this.chestLayer, this.fxHost, this.ui);
    game.popupLayer.addChild(this.root);

    this.fx = new Fx(this.fxHost, uiTweens);
    this.offUpdate = game.onUpdate((dt) => this.fx.update(dt));
    this.buildCards();
    this.layoutFixed();

    this.onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (this.finished) this.leave();
      else this.skipToEnd();
    };
    window.addEventListener('keydown', this.onKey);
    this.start();
  }

  private computeArea(): void {
    const top = game.safeTop + 150;
    const bottom = game.h - game.safeBottom - 260;
    this.area = { x: 24, y: top, w: game.w - 48, h: Math.max(400, bottom - top) };
  }

  private layoutFixed(): void {
    const W = game.w;
    const H = game.h;
    this.done.position.set(W / 2, H - game.safeBottom - 100);
    this.summary.position.set(W / 2, H - game.safeBottom - 215);
  }

  private chestHome(): { x: number; y: number } {
    return { x: this.area.x + this.area.w / 2, y: this.area.y + this.area.h / 2 };
  }

  private buildCards(): void {
    const g = this.grid;
    for (const stack of this.stacks) {
      const holder = new Container();
      holder.visible = false;
      const back = new Graphics();
      const hw = g.cardW / g.scale;
      const hh = g.cardH / g.scale;
      const rim = Rarity[stack.rarity];
      back.roundRect(-hw / 2, -hh / 2, hw, hh, 26).fill(vGradient(Color.panelLight, Color.panelDark)).stroke({ width: 7, color: rim.color, alignment: 1 });
      back.roundRect(-hw / 2 + 14, -hh / 2 + 14, hw - 28, hh - 28, 18).stroke({ width: 3, color: rim.light, alpha: 0.5 });
      const paw = drawIcon('paw', hw * 0.4, rim.light);
      back.addChild(paw);

      const unit = stack.unit;
      const face = new Container();
      const frame = new CardFrame({
        rarity: stack.rarity,
        size: g.size,
        portrait: unit ? unitPortrait(unit, stack.rarity, 220) : wildArt(stack.rarity, 140),
        name: unit ? t(`unit.${unit}.name`) : `${t('rarity.' + stack.rarity)} ${t('reveal.wild')}`,
      });
      face.addChild(frame);
      const tagText = stack.bonus ? t('reveal.bonus') : unit ? '' : t('reveal.wild');
      if (tagText) {
        const tag = new Tag({ text: tagText, style: stack.bonus ? 'success' : 'info', shape: 'pill', fontSize: 24, tilt: -0.08 });
        tag.position.set(-hw / 2 + tag.uiBox.w / 2 + 6, -hh / 2 + 10);
        face.addChild(tag);
      }
      const count = numberText(40, Color.white, 'x0');
      const pill = new Graphics();
      pill.roundRect(-52, -28, 104, 56, 28).fill(vGradient(Color.panelLight, Color.panelDark)).stroke({ width: 5, color: Color.outline, alignment: 1 });
      const badge = new Container();
      badge.addChild(pill, count);
      badge.position.set(hw / 2 - 38, hh / 2 - 120);
      face.addChild(badge);
      face.visible = false;

      holder.addChild(back, face);
      holder.scale.set(g.scale);
      this.gridLayer.addChild(holder);
      this.views.push({ stack, holder, back, face, count, shown: false });
    }
  }

  private slotOf(i: number): { x: number; y: number } {
    const s = this.grid.slots[i] as { x: number; y: number };
    return { x: this.area.x + s.x, y: this.area.y + s.y };
  }

  private start(): void {
    const rs = Rarity[this.best];
    const W = game.w;
    const home = this.chestHome();
    this.chestLayer.position.set(home.x, home.y);
    this.skip.alpha = 1;
    const sch = this.schedule;
    const rattleTime = sch.rattle - 0.28;
    this.glow.alpha = 0.15;
    audio.play('whoosh', { volume: 0.7 });

    if (motion.reduced) {
      this.chest.position.set(0, 0);
    } else {
      this.chest.y = -home.y - 200;
      this.bag.run({
        duration: 0.28,
        ease: Ease.quadIn,
        onUpdate: (k) => {
          this.chest.y = (-home.y - 200) * (1 - k);
        },
        onComplete: () => {
          this.chest.y = 0;
          game.shake(0.18);
          this.fx.dustPuff(home.x, home.y + CHEST_SIZE * 0.4);
          haptic('medium');
        },
      });
    }

    // Rattle: frequency and strength climb until the burst; the glow keeps one colour and only brightens.
    this.bag.call(0.28, () => {
      audio.play('chest_shake');
      this.bag.run({
        duration: rattleTime,
        ease: Ease.linear,
        onUpdate: (k) => {
          const hz = lerp(12, 24, k);
          const amp = lerp(1.5, 7, k * k);
          const ph = (k * rattleTime) * hz * Math.PI * 2;
          if (!motion.reduced) {
            this.chest.x = Math.sin(ph) * amp;
            this.chest.rotation = Math.sin(ph * 0.5) * 0.04 * (0.4 + k);
            this.chest.scale.set(1 + 0.06 * k * Math.abs(Math.sin(ph * 0.25)));
          }
          this.glow.alpha = 0.15 + 0.85 * k;
          this.glow.scale.set(0.8 + 0.5 * k);
        },
      });
      const ticks = Math.floor(rattleTime / 0.14);
      for (let i = 0; i < ticks; i++) this.bag.call(i * 0.14, () => haptic('tap'));
    });

    if (this.best === 'legendary') {
      // The guide's silent beat before the biggest moment.
      this.bag.call(sch.rattle - 0.3, () => audio.duck(1, 0.3));
    }
    this.bag.call(sch.rattle, () => this.burst(rs.glow, W));
    this.views.forEach((_, i) => this.bag.call(sch.flightAt[i] as number, () => this.launch(i)));
    this.bag.call(sch.total, () => this.finish());
  }

  private burst(color: number, W: number): void {
    const home = this.chestHome();
    audio.play('chest_open');
    haptic(this.best === 'common' ? 'medium' : 'heavy');
    game.shake(this.best === 'legendary' ? 0.5 : this.best === 'epic' ? 0.3 : 0.2);
    this.fx.mergeBurst(home.x, home.y, color, this.best === 'common' ? 1 : 1.4);
    if (rarityRank(this.best) >= 1 && !motion.reduced) {
      this.fx.rays(home.x, home.y, { color, radius: W * 0.9, speed: 0.5, alpha: 0.5, count: 12, duration: Math.max(1.2, this.schedule.total - this.schedule.rattle), parent: this.raysLayer });
    }
    this.bag.run({
      duration: 0.18,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.chestLayer.scale.set(1 + 0.5 * k);
        this.chestLayer.alpha = 1 - k;
      },
      onComplete: () => {
        this.chestLayer.visible = false;
      },
    });
  }

  private launch(i: number): void {
    const v = this.views[i];
    if (!v || v.shown) return;
    const from = this.chestHome();
    v.holder.visible = true;
    v.holder.alpha = 1;
    const side = i % 2 === 0 ? -1 : 1;
    const peak = Math.min(from.y, this.slotOf(i).y) - 140 - (i % 3) * 30;
    const mx = (from.x + this.slotOf(i).x) / 2 + side * 40;
    const baseScale = this.grid.scale;
    this.bag.run({
      duration: this.schedule.flight,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        const slot = this.slotOf(i);
        const u = 1 - k;
        // Quadratic arc through a raised midpoint.
        v.holder.x = u * u * from.x + 2 * u * k * mx + k * k * slot.x;
        v.holder.y = u * u * from.y + 2 * u * k * peak + k * k * slot.y;
        v.holder.scale.set(baseScale * (0.35 + 0.65 * backOut(1.7)(k)));
        v.holder.rotation = side * 0.5 * u;
      },
      onComplete: () => {
        const slot = this.slotOf(i);
        v.holder.position.set(slot.x, slot.y);
        v.holder.scale.set(baseScale);
        v.holder.rotation = 0;
        this.flip(i);
      },
    });
    audio.playStep('whoosh', Math.min(i, 8), { volume: 0.35 });
  }

  private flip(i: number): void {
    const v = this.views[i];
    if (!v || v.shown) return;
    v.shown = true;
    const st = v.stack;
    const base = this.grid.scale;
    const fl = FLOURISH[st.rarity];
    const slot = this.slotOf(i);
    const isBest = i === this.views.length - 1;
    audio.playStep('card_flip', Math.min(this.flipped, 10));
    this.flipped++;
    this.bag.run({
      duration: 0.09,
      ease: Ease.quadIn,
      onUpdate: (k) => v.holder.scale.x = base * (1 - k),
      onComplete: () => {
        v.back.visible = false;
        v.face.visible = true;
        this.bag.run({
          duration: 0.2,
          ease: backOut(2.2),
          onUpdate: (k) => v.holder.scale.x = base * k,
          onComplete: () => v.holder.scale.x = base,
        });
        this.flourish(i, slot.x, slot.y, isBest);
      },
    });
    const total = st.count;
    const dur = Math.max(0.3, countUpDuration(total));
    this.bag.run({
      duration: dur,
      delay: 0.1,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        v.count.text = 'x' + formatCount(countUpValue(0, total, k));
      },
      onComplete: () => {
        v.count.text = 'x' + formatCount(total);
      },
    });
    haptic(fl.haptic === 'jackpot' && !isBest ? 'heavy' : fl.haptic);
  }

  /** Bigger moments for higher rarities; the last (best) stack gets the longest pause. */
  private flourish(i: number, x: number, y: number, isBest: boolean): void {
    const v = this.views[i] as StackView;
    const r = v.stack.rarity;
    const rs = Rarity[r];
    const fl = FLOURISH[r];
    if (r === 'common') {
      this.fx.dustPuff(x, y + 40);
      return;
    }
    audio.play(fl.sfx, { volume: isBest ? 1 : 0.7 });
    if (fl.shake > 0 && (isBest || r !== 'legendary')) game.shake(isBest ? fl.shake : fl.shake * 0.5);
    this.fx.mergeBurst(x, y, rs.glow, r === 'rare' ? 0.9 : r === 'epic' ? 1.3 : 1.7);
    if (isBest && rarityRank(r) >= 2 && !motion.reduced) {
      this.fx.rays(x, y, { color: rs.glow, radius: 520, speed: 0.9, alpha: 0.8, count: 12, duration: this.schedule.hold + 0.8, parent: this.raysLayer });
    }
    if (isBest && r === 'legendary') {
      audio.stinger('jackpot');
      this.fx.confettiRain({ count: 70, x, y: Math.max(40, y - 360) });
    }
    if (isBest && !motion.reduced) {
      const base = this.grid.scale;
      this.bag.run({
        duration: this.schedule.hold + 0.25,
        ease: Ease.sineInOut,
        onUpdate: (k) => {
          const s = 1 + 0.16 * Math.sin(Math.min(1, k * 1.6) * Math.PI / 2) * (1 - 0.35 * k);
          v.holder.scale.set(base * s);
          v.holder.zIndex = 5;
        },
        onComplete: () => v.holder.scale.set(base),
      });
      this.gridLayer.sortableChildren = true;
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    profile.ackReveal(this.result.id);
    this.skip.visible = false;
    const wild = this.stacks.filter((s) => !s.unit).reduce((a, s) => a + s.count, 0);
    const lines = [t('reveal.total', { n: totalCards(this.stacks) })];
    if (wild > 0) lines[0] += '  ·  ' + t('reveal.wildTotal', { n: wild });
    if (this.result.overflowGold > 0) lines.push(t('reveal.overflow', { n: this.result.overflowGold }));
    lines.forEach((text, k) => {
      const l = uiLabel(text, { size: k === 0 ? 34 : 26, color: k === 0 ? Color.white : Color.textDim, strokeWidth: 5, shadow: false, wrap: game.w - 80, lineHeight: 34 });
      l.position.set(0, k * 46);
      this.summary.addChild(l);
    });
    this.summary.alpha = 0;
    this.done.visible = true;
    this.done.scale.set(0.01);
    this.bag.run({
      duration: motion.reduced ? 0.01 : 0.25,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.summary.alpha = k;
      },
    });
    this.bag.run({
      duration: motion.reduced ? 0.01 : 0.3,
      ease: backOut(2.4),
      onUpdate: (k) => this.done.scale.set(k),
      onComplete: () => {
        this.done.scale.set(1);
        if (!motion.reduced) this.done.startPulse();
      },
    });
  }

  /** Jump to the finished state at once: every card shown and counted, then the summary. */
  private skipToEnd(): void {
    if (this.finished) return;
    this.bag.killAll();
    audio.play('ui_click');
    this.chestLayer.visible = false;
    this.fx.clear();
    this.views.forEach((v, i) => {
      const slot = this.slotOf(i);
      v.shown = true;
      v.holder.visible = true;
      v.holder.alpha = 1;
      v.holder.position.set(slot.x, slot.y);
      v.holder.scale.set(this.grid.scale);
      v.holder.rotation = 0;
      v.back.visible = false;
      v.face.visible = true;
      v.count.text = 'x' + formatCount(v.stack.count);
    });
    this.finish();
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.done.setEnabled(false);
    audio.play('ui_confirm');
    const target = { x: game.w * 0.3, y: game.h + 160 };
    this.bag.run({
      duration: motion.reduced ? 0.01 : 0.38,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        this.ui.alpha = 1 - k;
        this.views.forEach((v, i) => {
          const slot = this.slotOf(i);
          const d = Math.min(1, k * 1.3 - i * 0.015);
          const e = Math.max(0, d);
          v.holder.x = lerp(slot.x, target.x, e);
          v.holder.y = lerp(slot.y, target.y, e * e);
          v.holder.scale.set(this.grid.scale * (1 - 0.7 * e));
          v.holder.alpha = 1 - e;
        });
        this.root.alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      },
      onComplete: () => this.destroy(),
    });
  }

  private destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.offUpdate();
    this.bag.killAll();
    this.fx.destroy();
    this.root.destroy({ children: true });
    this.resolve();
  }
}

/** Play the opening of an already decided chest and resolve when the player leaves the screen. */
export function playChestReveal(result: ChestResult): Promise<void> {
  return new ChestReveal(result).closed;
}

/** Narrow an unknown service argument to a stored chest result. */
export function isChestResult(v: unknown): v is ChestResult {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<ChestResult>;
  const kinds: readonly string[] = ['wooden', 'silver', 'gold'];
  return typeof r.id === 'number' && typeof r.kind === 'string' && kinds.includes(r.kind) && Array.isArray(r.cards)
    && typeof r.pity === 'object' && r.pity !== null;
}

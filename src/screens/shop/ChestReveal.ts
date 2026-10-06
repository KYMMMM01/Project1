import { Container, Graphics, Rectangle } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { Ease, uiTweens } from '@/core/tween';
import { lerp, TAU } from '@/core/math';
import { Fx, type EmitDef } from '@/fx';
import { profile } from '@/meta';
import type { ChestRarity, ChestResult } from '@/meta/types';
import {
  backOut, Button, CardFrame, Color, countUpDuration, countUpValue, drawFloor, drawIcon, formatCount, motion, numberText, paperSeed, paperShape,
  PaperLabel, Rarity, rarityName, Tag, tapeStrip, TweenBag, type TapeName,
} from '@/ui';
import { chestArt, unitPortrait, wildArt } from './art';
import { bestRarity, flourishOf, gridLayout, rarityRank, revealSchedule, ribbonDots, stacksOf, totalCards, type GridLayout, type RevealSchedule, type RevealStack } from './revealPlan';
import { stampIn, stampMark } from './paperBits';

interface StackView {
  stack: RevealStack;
  holder: Container;
  back: Container;
  face: Container;
  count: ReturnType<typeof numberText>;
  shown: boolean;
  tape?: Container;
  stamp?: Container;
}

const CHEST_SIZE = 330;

/** Strength of each rarity's flourish (shake, haptic, sound). */
const FLOURISH: Record<ChestRarity, { shake: number; haptic: 'light' | 'medium' | 'heavy' | 'jackpot'; sfx: 'summon_common' | 'summon_rare' | 'summon_epic' | 'summon_legendary' }> = {
  common: { shake: 0, haptic: 'light', sfx: 'summon_common' },
  rare: { shake: 0.1, haptic: 'light', sfx: 'summon_rare' },
  epic: { shake: 0.25, haptic: 'medium', sfx: 'summon_epic' },
  legendary: { shake: 0.55, haptic: 'jackpot', sfx: 'summon_legendary' },
};

/** A pop of paper bits: confetti thrown up and out, falling back down. Colours come from the rarity's own papers. */
const PAPER_POP: EmitDef = {
  tex: 'confetti', prio: 2, count: 14, life: [0.7, 1.2], speed: [170, 420], dir: -Math.PI / 2, spread: 1.5, drag: 1.5, gravity: 520,
  size: [14, 24], spin: [-8, 8], flip: [7, 15], rot: [0, TAU], colors: [Color.white], fadeIn: 0, fadeOut: 0.25,
};

/** The tape a rare card gets slapped on: a different print per tier so it never relies on colour alone. */
const SLAP_TAPE: Record<ChestRarity, { name: TapeName; pattern: 'dots' | 'gingham' | 'stripes' }> = {
  common: { name: 'green', pattern: 'dots' },
  rare: { name: 'sky', pattern: 'dots' },
  epic: { name: 'pink', pattern: 'stripes' },
  legendary: { name: 'yellow', pattern: 'gingham' },
};

/**
 * The best-rarity tell on the closed chest: a paper ribbon across the lid in the rarity's mat colour, carrying one
 * to four dots (the tier), so the colour is never the only cue. It is on the chest from the first frame and never changes.
 */
function chestRibbon(best: ChestRarity): Container {
  const rar = Rarity[best];
  const dotCount = ribbonDots(best);
  const w = CHEST_SIZE * 0.86;
  const h = 50;
  const c = new Container();
  c.addChild(paperShape({ w, h, radius: 8, fill: rar.color, edge: rar.dark, torn: ['left', 'right'], shadow: 4, grain: false, seed: paperSeed() }));
  const dots = new Graphics();
  for (let i = 0; i < dotCount; i++) dots.circle((i - (dotCount - 1) / 2) * 26, 0, 7).fill(Color.paperLight);
  c.addChild(dots);
  c.rotation = -0.07;
  return c;
}

/**
 * Full-screen chest opening. The result is already decided and stored by the meta layer; this only replays it:
 * the chest sticker drops onto the floor and rattles (a ribbon in the best rarity's colour is on it from the first
 * frame), pops open in paper confetti, and one stack of cards at a time flies out in an arc and flips into a photo
 * frame, with a bigger flourish for each rarity (dust, a tape slap, a stamp, a sunburst). Skippable from the first
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
  private readonly chest = new Container();
  private readonly shadow = new Graphics();
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
    const floor = new Graphics();
    drawFloor(floor, W, H);
    floor.eventMode = 'static';
    floor.hitArea = new Rectangle(0, 0, W, H);
    floor.on('pointertap', () => {
      if (!this.finished) this.skipToEnd();
    });

    // The title shares the header row with the skip button: it is centred in the space left of it.
    const titleSpan = W - 24 - 220 - 16 - 24;
    const title = new PaperLabel({ text: t('meta.chest.' + result.kind), size: 48, paper: Color.paperLight, padX: 44, maxWidth: titleSpan });
    title.position.set(24 + titleSpan / 2, game.safeTop + 74);

    this.shadow.ellipse(0, CHEST_SIZE * 0.4, CHEST_SIZE * 0.44, 28).fill({ color: Color.shadow, alpha: 0.24 });
    const art = chestArt(result.kind, CHEST_SIZE);
    const ribbon = chestRibbon(this.best);
    ribbon.position.set(0, CHEST_SIZE * 0.1);
    this.chest.addChild(art, ribbon);

    this.skip = new Button({ label: t('reveal.skip'), icon: 'fast_forward', style: 'kraft', width: 220, height: 96, fontSize: 28 });
    this.skip.position.set(W - 24 - 110, game.safeTop + 74);
    this.skip.onTap(() => this.skipToEnd());
    this.done = new Button({ label: t('reveal.done'), style: 'primary', width: 380, height: 112, fontSize: 46, tape: 'pink' });
    this.done.visible = false;
    this.done.onTap(() => this.leave());

    this.chestLayer.addChild(this.shadow, this.chest);
    this.ui.addChild(title, this.summary, this.skip, this.done);
    this.root.addChild(floor, this.raysLayer, this.gridLayer, this.chestLayer, this.fxHost, this.ui);
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
      const hw = g.cardW / g.scale;
      const hh = g.cardH / g.scale;
      const rim = Rarity[stack.rarity];
      // The back of a card: kraft paper with a dashed line and a paw print, edged in the rarity colour.
      const back = new Container();
      const seed = paperSeed();
      const sheet = paperShape({ w: hw, h: hh, radius: 26, fill: Color.kraft, edge: rim.dark, edgeWidth: 4, edgeAlpha: 0.9, shadow: 6, grain: false, seed });
      back.addChild(sheet, drawIcon('paw', hw * 0.42, Color.kraftDark));

      const unit = stack.unit;
      const face = new Container();
      const frame = new CardFrame({
        rarity: stack.rarity,
        size: g.size,
        portrait: unit ? unitPortrait(unit, stack.rarity, 220) : wildArt(stack.rarity, 140),
        name: unit ? t(`unit.${unit}.name`) : `${rarityName(stack.rarity)} ${t('reveal.wild')}`,
      });
      face.addChild(frame);
      const tagText = stack.bonus ? t('reveal.bonus') : unit ? '' : t('reveal.wild');
      if (tagText) {
        const tag = new Tag({ text: tagText, style: stack.bonus ? 'success' : 'info', shape: 'pill', fontSize: 24, tilt: -0.08 });
        tag.position.set(hw / 2 - tag.uiBox.w / 2 - 6, -hh / 2 + 10);
        face.addChild(tag);
      }
      const small = g.size === 'small';
      const count = numberText(small ? 30 : 40, Color.ink, 'x0');
      const badge = new Container();
      badge.addChild(paperShape({ w: small ? 80 : 112, h: small ? 42 : 56, kind: 'pill', fill: Color.paperLight, edge: Color.kraftDark, shadow: 3, grain: false, seed: seed + 5 }), count);
      badge.position.set(hw / 2 - (small ? 26 : 38), hh / 2 - (small ? 82 : 120));
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
    const home = this.chestHome();
    this.chestLayer.position.set(home.x, home.y);
    const sch = this.schedule;
    const rattleTime = sch.rattle - 0.28;
    audio.play('whoosh', { volume: 0.7 });

    if (motion.reduced) {
      this.chest.position.set(0, 0);
    } else {
      const from = -home.y - 200;
      this.chest.y = from;
      this.shadow.scale.set(0.4);
      this.shadow.alpha = 0.5;
      this.bag.run({
        duration: 0.28,
        ease: Ease.quadIn,
        onUpdate: (k) => {
          this.chest.y = from * (1 - k);
          this.shadow.scale.set(0.4 + 0.6 * k);
          this.shadow.alpha = 0.5 + 0.5 * k;
        },
        onComplete: () => {
          this.chest.y = 0;
          game.shake(0.18);
          this.fx.dustPuff(home.x, home.y + CHEST_SIZE * 0.4);
          haptic('medium');
        },
      });
    }

    // Rattle: frequency and strength climb until the burst; the ribbon on the lid keeps its colour throughout.
    this.bag.call(0.28, () => {
      audio.play('chest_shake');
      this.bag.run({
        duration: rattleTime,
        ease: Ease.linear,
        onUpdate: (k) => {
          const hz = lerp(12, 24, k);
          const amp = lerp(1.5, 7, k * k);
          const ph = k * rattleTime * hz * Math.PI * 2;
          if (!motion.reduced) {
            this.chest.x = Math.sin(ph) * amp;
            this.chest.rotation = Math.sin(ph * 0.5) * 0.04 * (0.4 + k);
            this.chest.scale.set(1 + 0.06 * k * Math.abs(Math.sin(ph * 0.25)));
          }
        },
      });
      const ticks = Math.floor(rattleTime / 0.14);
      for (let i = 0; i < ticks; i++) this.bag.call(i * 0.14, () => haptic('tap'));
    });

    if (this.best === 'legendary') {
      // The guide's silent beat before the biggest moment.
      this.bag.call(sch.rattle - 0.3, () => audio.duck(1, 0.3));
    }
    this.bag.call(sch.rattle, () => this.burst());
    this.views.forEach((_, i) => this.bag.call(sch.flightAt[i] as number, () => this.launch(i)));
    this.bag.call(sch.total, () => this.finish());
  }

  /** The lid pops: the sticker swells and fades while paper confetti and a flat burst fly out. */
  private burst(): void {
    const home = this.chestHome();
    const rs = Rarity[this.best];
    audio.play('chest_open');
    haptic(this.best === 'common' ? 'medium' : 'heavy');
    game.shake(this.best === 'legendary' ? 0.5 : this.best === 'epic' ? 0.3 : 0.2);
    this.popPaper(home.x, home.y, this.best, this.best === 'common' ? 1.6 : 2.4);
    this.fx.confettiRain({ count: this.best === 'common' ? 26 : 46, x: home.x, y: home.y - 150, width: CHEST_SIZE });
    if (rarityRank(this.best) >= 1 && !motion.reduced) {
      this.fx.rays(home.x, home.y, { color: rs.color, radius: game.w * 0.9, speed: 0.5, alpha: 0.35, count: 12, duration: Math.max(1.2, this.schedule.total - this.schedule.rattle), parent: this.raysLayer });
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

  /** Paper bits in the rarity's colours thrown from (x, y). */
  private popPaper(x: number, y: number, rarity: ChestRarity, size: number): void {
    const rs = Rarity[rarity];
    this.fx.ps.burst({ ...PAPER_POP, palette: [rs.color, rs.dark, rs.light, Color.paperLight, Color.mustard] }, x, y, { scale: Math.min(1.4, size), count: size });
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

  /** A strip of tape slapped across the card's top corner. */
  private slapTape(v: StackView, animate = true): void {
    if (v.tape) return;
    const hw = this.grid.cardW / this.grid.scale;
    const hh = this.grid.cardH / this.grid.scale;
    const spec = SLAP_TAPE[v.stack.rarity];
    const tape = tapeStrip({ name: spec.name, pattern: spec.pattern, w: hw * 0.5, h: 34, angle: -28 });
    tape.position.set(-hw / 2 + hw * 0.16, -hh / 2 + 12);
    v.face.addChild(tape);
    v.tape = tape;
    if (animate && !motion.reduced) {
      tape.scale.set(1.9);
      tape.alpha = 0;
      this.bag.run({
        duration: 0.26,
        ease: backOut(2.4),
        onUpdate: (k) => {
          tape.scale.set(1.9 - 0.9 * k);
          tape.alpha = Math.min(1, k * 4);
        },
        onComplete: () => tape.scale.set(1),
      });
    }
  }

  /** The rarity's name stamped on the card; it fades after a moment so the portrait is clear again. */
  private stampCard(v: StackView, hold: number): void {
    const hw = this.grid.cardW / this.grid.scale;
    const rs = Rarity[v.stack.rarity];
    const stamp = stampMark(rarityName(v.stack.rarity), { size: 40, color: rs.dark, maxWidth: hw * 0.92, tilt: -0.2 });
    stamp.position.set(0, 14);
    v.face.addChild(stamp);
    v.stamp = stamp;
    stampIn(this.bag, stamp, 0, () => game.shake(0.1));
    this.bag.run({
      duration: 0.4,
      delay: hold,
      ease: Ease.linear,
      onUpdate: (k) => {
        stamp.alpha = 0.94 * (1 - k);
      },
      onComplete: () => {
        stamp.destroy({ children: true });
        v.stamp = undefined;
      },
    });
  }

  /** Bigger moments for higher rarities; the last (best) stack gets the longest pause. */
  private flourish(i: number, x: number, y: number, isBest: boolean): void {
    const v = this.views[i] as StackView;
    const r = v.stack.rarity;
    const rs = Rarity[r];
    const fl = FLOURISH[r];
    const plan = flourishOf(r, isBest);
    if (plan.dust) {
      this.fx.dustPuff(x, y + 40);
      return;
    }
    audio.play(fl.sfx, { volume: isBest ? 1 : 0.7 });
    if (fl.shake > 0 && (isBest || r !== 'legendary')) game.shake(isBest ? fl.shake : fl.shake * 0.5);
    this.popPaper(x, y, r, r === 'rare' ? 0.8 : r === 'epic' ? 1.2 : 1.7);
    if (plan.tape) this.slapTape(v);
    if (plan.stamp) this.stampCard(v, isBest ? this.schedule.hold + 0.5 : 0.7);
    if (plan.sun && !motion.reduced) {
      this.fx.rays(x, y, { color: rs.color, radius: 520, speed: 0.9, alpha: 0.4, count: 12, duration: this.schedule.hold + 0.8, parent: this.raysLayer });
    }
    if (plan.confetti) {
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
      const l = new PaperLabel({ text, size: k === 0 ? 34 : 26, paper: Color.paperLight, torn: 'ends', maxWidth: game.w - 60 });
      l.position.set(0, k * 62);
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
      // A skipped card keeps the tape its rarity earns but not the stamp: the summary stays readable.
      v.stamp?.destroy({ children: true });
      v.stamp = undefined;
      if (v.tape) {
        v.tape.scale.set(1);
        v.tape.alpha = 1;
      } else if (flourishOf(v.stack.rarity, false).tape) this.slapTape(v, false);
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

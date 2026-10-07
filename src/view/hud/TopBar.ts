/**
 * Top area: pause, enemy gauge, speed; second row with the phase label and countdown, the next-wave
 * preview cards and the owned toys. Everything except the countdown and the overflow timer is driven
 * by simulation events.
 */
import { Container, Rectangle, type FederatedPointerEvent, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease, type Tween } from '@/core/tween';
import { enemyDef, relicDef, type EnemyId, type RelicId } from '@/game';
import { motionSeconds } from '@/fx';
import { TOY_FLIGHT } from '@/view/timing';
import {
  Color,
  drawIcon,
  IconButton,
  motion,
  PaperLabel,
  paperSeed,
  paperShape,
  popIn,
  ProgressBar,
  punch,
  TweenBag,
  tooltip,
  uiLabel,
  type BarColor,
} from '@/ui';
import { profile } from '@/meta';
import type { BattleLayout } from '../context';
import type { HudEnv } from './env';
import { GAUGE_H, GaugeStrip } from './GaugeStrip';
import { enemyPortrait, relicIcon } from './kit';
import { gaugeLevel, nextSpeed, overflowLeft, speedSteps, traitOrder } from './policy';
import { gaugeWidth, slotCentre, slotWidth, topRects, type Rect, type TopRects } from './layoutMath';

const SLOT_MAX = 56;
const PREVIEW_MAX = 4;
const PREVIEW_SLOT = 64;
/** Seconds the cards of the wave that has begun take to leave before the next wave's are dealt. */
const PREVIEW_LEAVE = 0.12;
const TOY_MAX = 6;
/** Seconds the picked toy's icon takes to fly from the choice screen to the row. */

/** Touch targets are at least 88 wide, so a strip is one target and the tap picks the icon nearest to the finger. */
const STRIP_H = 96;

const CARD_W = 60;
const CARD_H = 66;

interface Slot {
  box: Container;
  /** A running pop-in: it must be stopped before the box is destroyed. */
  pop?: Tween;
}

export class TopBar {
  readonly root = new Container();
  readonly pauseBtn: IconButton;
  readonly speedBtn: IconButton;
  readonly gauge: GaugeStrip;
  readonly waveLabel: PaperLabel;

  private readonly bag = new TweenBag();
  private readonly timer: ProgressBar;
  private readonly warn: Container;
  private readonly row2Right = new Container();
  readonly previewLayer = new Container();
  readonly toyLayer = new Container();
  private readonly more: Text;
  private slots: Slot[] = [];
  private toySlots: Slot[] = [];
  private previewIds: EnemyId[] = [];
  private toyIds: RelicId[] = [];
  private rects: TopRects;
  private steps: readonly number[] = [1, 2];
  private gaugeDirty = true;
  private waveDirty = true;
  private previewDirty = true;
  /** What the cards show now (null before the first build): a change deals new cards in, the same list does not. */
  private previewKey: string | null = null;
  private overflowing = false;
  private lastTimer = -1;
  private lastTimerText = '';
  private timerColor: BarColor = 'blue';
  private lastLevel = -1;
  /** One cut-edge seed per preview card, so a rebuilt row keeps the shape of each card. */
  private readonly cardSeeds = Array.from({ length: PREVIEW_MAX }, () => paperSeed());

  constructor(private readonly env: HudEnv) {
    const l = env.layout();
    this.rects = topRects(l);
    const b = env.battle;

    this.pauseBtn = new IconButton({ icon: 'pause', style: 'neutral', size: 76, fireOnDown: true, sfx: 'ui_click' });
    this.speedBtn = new IconButton({ icon: 'speed_1', style: 'info', size: 76, fireOnDown: true });
    this.gauge = new GaugeStrip();
    this.warn = drawIcon('warning', 34);
    this.warn.visible = false;
    this.waveLabel = new PaperLabel({ text: t('hud.prep'), size: 24, paper: Color.paper, padX: 16, padY: 7, maxWidth: this.rects.wave.w + 8 });
    this.timer = new ProgressBar({ width: this.rects.timer.w, height: this.rects.timer.h, color: 'blue', value: 1, labelSize: 24 });
    this.more = uiLabel('', { size: 24, onArt: true });
    this.more.visible = false;

    this.previewLayer.eventMode = 'static';
    this.toyLayer.eventMode = 'static';
    this.previewLayer.on('pointerdown', (e: FederatedPointerEvent) => this.tapPreview(e));
    this.toyLayer.on('pointerdown', (e: FederatedPointerEvent) => this.tapToy(e));
    this.row2Right.addChild(this.previewLayer, this.toyLayer, this.more);
    this.root.addChild(this.pauseBtn, this.speedBtn, this.gauge, this.warn, this.waveLabel, this.timer, this.row2Right);
    this.steps = speedSteps(this.canTriple(), env.sandbox);
    this.pauseBtn.visible = true;
    this.speedBtn.visible = env.reveal.speed;

    this.speedBtn.onTap(() => this.cycleSpeed());
    this.syncSpeed(env.ctx.speed, false);

    env.on(env.ctx.events, 'speed', ({ speed }) => this.syncSpeed(speed, true));
    // The tutorial's skip button takes the row's right end while it is there: the enemy strip is cut shorter to leave it room.
    env.on(env.skipChanged, 'change', () => this.fitGauge());
    // A control the tutorial brings in: the speed button pops in, the next-wave cards are dealt.
    env.on(env.revealed, 'reveal', ({ key, fresh }) => {
      if (key === 'speed') {
        this.speedBtn.visible = true;
        if (fresh && !motion.reduced) popIn(this.bag, this.speedBtn, { from: 0.3, duration: 0.32, overshoot: 2.8 });
      } else if (key === 'preview') {
        this.previewDirty = true;
      }
    });
    const e = b.events;
    env.on(e, 'enemySpawn', () => (this.gaugeDirty = true));
    env.on(e, 'enemyDie', () => (this.gaugeDirty = true));
    env.on(e, 'rescued', () => (this.gaugeDirty = true));
    env.on(e, 'revive', () => (this.gaugeDirty = true));
    env.on(e, 'danger', () => (this.gaugeDirty = true));
    env.on(e, 'overflow', () => (this.gaugeDirty = true));
    env.on(e, 'waveStart', () => {
      this.waveDirty = true;
      this.previewDirty = true;
      this.punchWave();
    });
    env.on(e, 'actClear', () => (this.waveDirty = true));
    env.on(e, 'relicGain', () => this.addToy());

    this.refreshToys(false);
    this.layout(l);
  }

  private canTriple(): boolean {
    if (this.env.sandbox) return true;
    return profile.data.owned.butler;
  }

  // ───────────────────────── speed ─────────────────────────

  private cycleSpeed(): void {
    this.env.ctx.setSpeed(nextSpeed(this.env.ctx.speed, this.steps));
  }

  private syncSpeed(speed: number, animate: boolean): void {
    this.speedBtn.setIcon(speed >= 3 ? 'speed_3' : speed >= 2 ? 'speed_2' : 'speed_1');
    this.speedBtn.setStyle(speed >= 2 ? 'primary' : 'info');
    if (animate) punch(this.bag, this.speedBtn, 0.22, 0.2);
  }

  // ───────────────────────── gauge ─────────────────────────

  private refreshGauge(): void {
    const b = this.env.battle;
    const count = b.enemyCount;
    const cap = b.enemyCap;
    const level = gaugeLevel(count, cap);
    this.gauge.setLevel(level);
    this.gauge.setValue(cap > 0 ? count / cap : 0, this.lastLevel >= 0);
    if (!this.overflowing) this.gauge.setLabel(t('hud.gauge', { n: count, cap }));
    if (level !== this.lastLevel) {
      this.lastLevel = level;
      this.warn.visible = level >= 1;
      if (level >= 1 && !motion.reduced) this.pulseWarn(level === 2);
    }
  }

  private pulseWarn(fast: boolean): void {
    this.bag.runKeyed(this.warn, {
      duration: fast ? 0.32 : 0.55,
      ease: Ease.sineInOut,
      yoyo: true,
      repeat: fast ? 29 : 15,
      onUpdate: (k) => this.warn.scale.set(1 + 0.22 * k),
      onComplete: () => this.warn.scale.set(1),
    });
  }

  private updateOverflow(): void {
    const b = this.env.battle;
    const left = overflowLeft(b.overflowTime, b.overflowLimit);
    const over = b.overflowTime > 0;
    if (over) {
      this.gauge.setLabel(t('hud.overflow', { s: left.toFixed(1) }));
      if (!this.overflowing) {
        this.overflowing = true;
        this.gauge.setLevel(2);
        this.warn.visible = true;
        if (!motion.reduced) {
          this.bag.runKeyed(this.gauge, {
            duration: 0.22,
            ease: Ease.sineInOut,
            yoyo: true,
            repeat: -1,
            onUpdate: (k) => this.gauge.scale.set(1 + 0.035 * k),
          });
        }
      }
    } else if (this.overflowing) {
      this.overflowing = false;
      this.bag.killKeyed(this.gauge);
      this.gauge.scale.set(1);
      this.gaugeDirty = true;
    }
  }

  // ───────────────────────── phase label and countdown ─────────────────────────

  private refreshWave(): void {
    const b = this.env.battle;
    let text: string;
    if (b.wave <= 0) text = t('hud.prep');
    else if (b.totalWaves > 0) text = t('hud.wave', { act: b.act, wave: b.wave, total: b.totalWaves });
    else text = t('hud.waveOpen', { act: b.act, wave: b.wave });
    this.waveLabel.setText(text);
    this.placeWave();
  }

  /** The label hangs from the left edge of the second row whatever its width. */
  private placeWave(): void {
    const r = this.rects;
    this.waveLabel.position.set(r.wave.x + this.waveLabel.uiBox.w / 2, r.row2Y - 22);
  }

  private punchWave(): void {
    punch(this.bag, this.waveLabel, 0.12, 0.22);
  }

  private updateTimer(): void {
    const b = this.env.battle;
    let frac: number;
    let text: string;
    let color: BarColor;
    if (b.wave <= 0) {
      const total = b.init.mode === 'tutorial' ? 1 : 3;
      frac = b.init.mode === 'tutorial' ? 1 : Math.max(0, b.prepTime / total);
      text = b.init.mode === 'tutorial' ? t('hud.ready') : t('hud.secs', { s: Math.ceil(b.prepTime) });
      color = 'blue';
    } else {
      const total = Math.max(0.001, b.waveDuration);
      const left = Math.max(0, total - b.waveTime);
      frac = left / total;
      text = t('hud.secs', { s: Math.ceil(left) });
      color = b.waveKind !== 'normal' ? (left < 10 ? 'red' : 'gold') : 'blue';
    }
    if (color !== this.timerColor) {
      this.timerColor = color;
      this.timer.setColor(color);
    }
    if (Math.abs(frac - this.lastTimer) > 0.004) {
      this.lastTimer = frac;
      this.timer.setValue(frac, false);
    }
    if (text !== this.lastTimerText) {
      this.lastTimerText = text;
      this.timer.setLabel(text);
    }
  }

  // ───────────────────────── preview ─────────────────────────

  private refreshPreview(): void {
    const entries = this.env.battle.previewWave();
    const key = this.env.reveal.preview ? entries.map((en) => `${en.enemy}:${en.count}`).join(',') : '';
    // The same cards again (a rebuild after a resize or a speed change) are swapped without ceremony.
    const changed = key !== this.previewKey && this.previewKey !== null && !motion.reduced;
    this.previewKey = key;
    for (const s of this.slots) {
      // A card still waiting to pop in must not be popped once it is gone (a resize rebuilds the row while the cards are being dealt).
      s.pop?.kill();
      if (changed) this.sendOff(s.box);
      else s.box.destroy({ children: true });
    }
    this.slots = [];
    this.previewIds = [];
    this.more.visible = false;
    if (!this.env.reveal.preview) return;
    const shown = entries.slice(0, PREVIEW_MAX);
    const r = this.rects.preview;
    const slot = slotWidth(shown.length, r.w, PREVIEW_SLOT);
    this.previewIds = shown.map((en) => en.enemy);
    shown.forEach((en, i) => {
      const box = new Container();
      box.position.set(slotCentre(i, slot, r.x), this.rects.row2Y + 6);
      // Cards lie slightly crooked, like scraps dropped on the floor.
      box.rotation = (i % 2 === 0 ? -1 : 1) * 0.035;
      const def = enemyDef(en.enemy);
      const boss = def.traits.includes('boss') || def.traits.includes('elite');
      const card = paperShape({ w: CARD_W, h: CARD_H, radius: 12, fill: boss ? Color.berry : Color.paper, seed: this.cardSeeds[i], grain: false });
      const pic = enemyPortrait(en.enemy, 46);
      pic.position.set(-3, -9);
      const count = uiLabel(`×${en.count}`, { size: 24, color: boss ? Color.inkDeep : Color.ink });
      count.position.set(8, 22);
      box.addChild(card, pic, count);
      if (boss) {
        const mark = drawIcon('skull', 26);
        mark.position.set(-17, -23);
        box.addChild(mark);
      }
      this.previewLayer.addChild(box);
      // The next wave's cards are dealt in after the old ones have left: a small pop, one after the other.
      const pop = changed ? popIn(this.bag, box, { from: 0.35, duration: 0.24, delay: PREVIEW_LEAVE + i * 0.05, overshoot: 2.4 }) : undefined;
      this.slots.push({ box, pop });
    });
    if (entries.length > shown.length) {
      this.more.text = `+${entries.length - shown.length}`;
      this.more.visible = true;
    }
    this.layoutMore();
  }

  /** An old card slips down and fades before it goes (it takes no taps meanwhile). */
  private sendOff(box: Container): void {
    const y0 = box.y;
    box.eventMode = 'none';
    this.bag.run({
      duration: PREVIEW_LEAVE,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        if (box.destroyed) return;
        box.alpha = 1 - k;
        box.y = y0 + 8 * k;
      },
      onComplete: () => {
        if (!box.destroyed) box.destroy({ children: true });
      },
    });
  }

  /** Index of the icon under the finger in a strip of `n` equal slots starting at `r.x`. */
  private slotUnder(e: FederatedPointerEvent, layer: Container, r: Rect, n: number): number {
    if (n <= 0) return -1;
    const slot = Math.min(r.w / n, layer === this.previewLayer ? PREVIEW_SLOT : SLOT_MAX);
    return Math.min(n - 1, Math.max(0, Math.floor((layer.toLocal(e.global).x - r.x) / slot)));
  }

  private tapPreview(e: FederatedPointerEvent): void {
    const i = this.slotUnder(e, this.previewLayer, this.rects.preview, this.previewIds.length);
    const id = this.previewIds[i];
    const box = this.slots[i]?.box;
    if (!id || !box) return;
    this.env.hints.used('preview');
    this.showEnemy(box, id);
  }

  private tapToy(e: FederatedPointerEvent): void {
    const i = this.slotUnder(e, this.toyLayer, this.rects.toys, this.toyIds.length);
    const id = this.toyIds[i];
    const box = this.toySlots[i]?.box;
    if (!id || !box) return;
    this.env.hints.used('toys');
    const def = relicDef(id);
    tooltip.show(box, { title: t(def.nameKey), text: def.descText() }, 6);
  }

  private showEnemy(target: Container, id: EnemyId): void {
    const def = enemyDef(id);
    const lines = [t(def.descKey)];
    for (const tr of traitOrder(def.traits)) lines.push(`${t(`trait.${tr}.name`)}: ${t(`trait.${tr}.desc`)}`);
    tooltip.show(target, { title: t(def.nameKey), text: lines.join('\n') }, 6);
  }

  // ───────────────────────── toys ─────────────────────────

  private refreshToys(animateLast: boolean): void {
    for (const s of this.toySlots) {
      s.pop?.kill();
      s.box.destroy({ children: true });
    }
    this.toySlots = [];
    const relics = this.env.battle.relics;
    const shown = relics.slice(0, TOY_MAX);
    this.toyIds = shown.slice();
    const r = this.rects.toys;
    const slot = slotWidth(Math.max(shown.length, 1), r.w, SLOT_MAX);
    shown.forEach((id, i) => {
      const def = relicDef(id);
      const box = new Container();
      box.position.set(slotCentre(i, slot, r.x), this.rects.row2Y + 4);
      box.addChild(relicIcon(id, 46, def.rarity));
      this.toyLayer.addChild(box);
      const slotEntry: Slot = { box };
      this.toySlots.push(slotEntry);
      if (animateLast && i === shown.length - 1) slotEntry.pop = popIn(this.bag, box, { from: 0.2, duration: 0.3, overshoot: 3 });
    });
    this.more.visible = this.more.visible || relics.length > shown.length;
    this.layoutMore();
  }

  /** The toy appears when the card's icon (flown from the choice screen) would land. */
  private addToy(): void {
    this.bag.call(motionSeconds(TOY_FLIGHT), () => {
      this.refreshToys(true);
      this.env.hints.request('toys', this.toyLayer);
    });
  }

  /** Where the next toy lands: the first free slot of the row. */
  toyAnchor(): { x: number; y: number } {
    const r = this.rects.toys;
    const n = Math.min(this.env.battle.relics.length, TOY_MAX);
    const slot = slotWidth(Math.max(n, 1), r.w, SLOT_MAX);
    const x = this.toySlots.length > 0 ? slotCentre(Math.max(0, n - 1), slot, r.x) : r.x + slot / 2;
    return { x, y: this.rects.row2Y + 4 };
  }

  private layoutMore(): void {
    const r = this.rects.toys;
    this.more.position.set(r.x + r.w - 10, this.rects.row2Y + 30);
  }

  // ───────────────────────── layout / frame ─────────────────────────

  layout(l: BattleLayout): void {
    this.rects = topRects(l);
    const r = this.rects;
    this.pauseBtn.position.set(r.pause.x, r.pause.y);
    this.speedBtn.position.set(r.speed.x, r.speed.y);
    this.fitGauge();
    this.previewLayer.hitArea = new Rectangle(r.preview.x, r.row2Y - STRIP_H / 2 - 4, r.preview.w, STRIP_H);
    this.toyLayer.hitArea = new Rectangle(r.toys.x, r.row2Y - STRIP_H / 2 - 4, r.toys.w, STRIP_H);
    this.timer.position.set(r.timer.x + r.timer.w / 2, r.timer.y + r.timer.h / 2);
    this.refreshPreview();
    this.refreshToys(false);
    this.refreshWave();
  }

  /** The enemy strip cut to what the skip button leaves of the row (its left end stays put), with the warning icon near its right end. */
  private fitGauge(): void {
    const r = this.rects;
    const w = gaugeWidth(r, this.env.skip);
    this.gauge.setWidth(w);
    this.gauge.position.set(r.gauge.x + w / 2, r.gauge.y + GAUGE_H / 2);
    this.warn.position.set(r.gauge.x + w - 62, r.gauge.y + r.gauge.h / 2);
  }

  update(): void {
    if (this.waveDirty) {
      this.waveDirty = false;
      this.refreshWave();
    }
    if (this.previewDirty) {
      this.previewDirty = false;
      this.refreshPreview();
    }
    this.updateOverflow();
    if (this.gaugeDirty && !this.overflowing) {
      this.gaugeDirty = false;
      this.refreshGauge();
    } else if (this.gaugeDirty) {
      this.gaugeDirty = false;
      this.lastLevel = -1;
    }
    this.updateTimer();
  }

  /** Re-read everything from the simulation (after the clock jumped, e.g. a debug fast-forward). */
  invalidate(): void {
    this.gaugeDirty = true;
    this.waveDirty = true;
    this.previewDirty = true;
    this.lastLevel = -1;
    this.refreshToys(false);
  }

  /** A boss or elite strip takes over the right half of the second row (preview cards and toys). */
  setBossMode(on: boolean): void {
    const layer = this.row2Right;
    this.bag.killKeyed(layer);
    const from = layer.alpha;
    const to = on ? 0 : 1;
    if (!on) layer.visible = true;
    if (motion.reduced) {
      layer.alpha = to;
      layer.visible = !on;
      return;
    }
    this.bag.runKeyed(layer, {
      duration: 0.18,
      onUpdate: (k) => (layer.alpha = from + (to - from) * k),
      onComplete: () => (layer.visible = !on),
    });
  }

  anchorOf(name: 'enemyGauge' | 'wave' | 'relics'): { x: number; y: number } {
    const r = this.rects;
    if (name === 'enemyGauge') return { x: this.gauge.x, y: this.gauge.y };
    if (name === 'wave') return { x: r.wave.x + r.wave.w / 2, y: r.row2Y };
    return this.toyAnchor();
  }

  destroy(): void {
    this.bag.killAll();
    this.root.destroy({ children: true });
  }
}

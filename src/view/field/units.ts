import type { Container } from 'pixi.js';
import { audio } from '@/audio';
import { Pool } from '@/core/pool';
import { Ease } from '@/core/tween';
import { Color, motion } from '@/ui';
import { hitFlash, shakeObject, squash } from '@/fx';
import type { BattleEvents, SummonSource, UnitState } from '@/game/api';
import { CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import { unitRarity, unitRarityIndex } from '@/game';
import type { FieldEnv } from './env';
import { Arrivals } from './arrivals';
import { NEW_TAG_SECONDS, tossFor } from '../toss';
import { MERGE_SECONDS, MOLT_SECONDS, QUICK_REVEAL_WINDOW, REVEAL_DELAY, REVEAL_MS, REVEAL_OVERSHOOT, SLIDE_SECONDS } from '@/view/timing';
import { hopArc } from './motion';
import { liftsAboveHud } from './policy';
import { UnitView, type ExitMode } from './unitView';

/** A recycled view rests this long before reuse, so a juice tween that is still finishing cannot touch its next owner. */
const COOLDOWN = 0.45;

/** How long the field keeps an awakened unit's old view and hides the new one, waiting for the director's cut-in to take over. */
const AWAKEN_OLD_HOLD = 0.9;
const AWAKEN_NEW_HOLD = 2.4;

/**
 * Every cat on screen. Views follow the simulation board each frame (a unit that appears gets a
 * pop, one that vanishes without an event fades); the simulation's events add the flourishes: the
 * attack lunge, merge flight and pop, molt spin, awakening hand-off, slide, swap and sell.
 *
 * A lifted cat, one being sold and one still springing back from below the field live on `lift`, a
 * field-space container above the HUD (the overlay layer): the sell strip is HUD paper, and a sticker
 * that goes under it would leave only its price tag visible.
 */
export class UnitViews {
  private readonly byUid = new Map<number, UnitView>();
  private readonly live: UnitView[] = [];
  private readonly pool: Pool<UnitView>;
  private readonly offs: Array<() => void> = [];
  private frame = 0;
  /** When the last legendary-or-better cat appeared: a second one soon after gets the short reveal, like its effect. */
  private lastBig = -99;
  /** Summons whose cat has no view yet: where the sticker is tossed from (scene space) and why the cat came. */
  private readonly arriving = new Map<number, { source: SummonSource; x: number; y: number }>();
  private readonly arrivals: Arrivals;

  constructor(
    private readonly env: FieldEnv,
    private readonly layer: Container,
    private readonly lift: Container,
  ) {
    this.layer.sortableChildren = true;
    this.pool = new Pool<UnitView>(() => new UnitView(env.art));
    this.arrivals = new Arrivals(env, env.ctx.layers.overlay, env.ctx.layers.fxFront);
    const ev = env.battle.events;
    this.offs.push(
      ev.on('summon', (e) => this.onSummon(e)),
      ev.on('attack', (e) => this.onAttack(e)),
      ev.on('move', (e) => this.onMove(e)),
      ev.on('swap', (e) => this.onSwap(e)),
      ev.on('merge', (e) => this.onMerge(e)),
      ev.on('molt', (e) => this.onMolt(e)),
      ev.on('awaken', (e) => this.onAwaken(e)),
      ev.on('sell', (e) => this.onSell(e)),
    );
  }

  get(uid: number): UnitView | null {
    return this.byUid.get(uid) ?? null;
  }

  atCell(cell: number): UnitView | null {
    const u = this.env.battle.units[cell];
    return u ? (this.byUid.get(u.uid) ?? null) : null;
  }

  /** Follow the board: create, step and retire views. Call once per frame after the simulation has stepped. */
  update(dt: number, selected: number | null): void {
    const { battle } = this.env;
    const time = this.env.time;
    this.frame++;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const u = battle.units[cell];
      if (!u) continue;
      let v = this.byUid.get(u.uid);
      if (!v) v = this.create(u, 'pop');
      v.mark = this.frame;
      v.step(dt, time, u, cell === selected);
      this.seat(v);
      this.syncSwirl(v, u);
      if (v.awaiting) this.checkReveal(v);
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const v = this.live[i] as UnitView;
      if (v.mark === this.frame) continue;
      if (v.exit === 'none' && !v.holdUntil) {
        // Gone from the board with no event to explain it (a revive, a debug removal): fade quietly.
        this.startExit(v, 'fade', 0.18);
      } else if (v.holdUntil && (time > v.holdUntil || !v.root.visible || v.root.alpha <= 0.01)) {
        v.holdUntil = 0;
        if (v.root.visible && v.root.alpha > 0.01) this.startExit(v, 'fade', 0.15);
        else this.release(v);
        continue;
      }
      v.step(dt, time, null, false);
      this.seat(v);
    }
  }

  /** Put the view on the layer it belongs to this frame: the HUD-level lift while it is held, sold or below the field. */
  private seat(v: UnitView): void {
    const up = liftsAboveHud(v.dragging, v.exit === 'sell', v.y);
    const to = up ? this.lift : this.layer;
    if (v.root.parent !== to) to.addChild(v.root);
  }

  private create(u: UnitState, mode: 'pop' | 'hidden'): UnitView {
    const v = this.pool.get();
    v.assign(u, this.env.art);
    v.mark = this.frame;
    v.awaiting = false;
    v.holdUntil = 0;
    this.layer.addChild(v.root);
    this.byUid.set(u.uid, v);
    this.live.push(v);
    if (mode === 'pop') {
      const tier = unitRarityIndex(u.id);
      const quick = tier >= 3 && this.env.time - this.lastBig < QUICK_REVEAL_WINDOW;
      if (tier >= 3) this.lastBig = this.env.time;
      const delay = quick ? (REVEAL_DELAY[2] ?? 0) : (REVEAL_DELAY[tier] ?? 0);
      const arrival = this.arriving.get(u.uid);
      if (arrival) this.arrive(v, u, arrival.source, arrival.x, arrival.y, delay);
      v.appear(this.env.ctx.ui, REVEAL_OVERSHOOT[tier] ?? 1.7, REVEAL_MS[tier] ?? 260, (arrival ? tossFor(arrival.source, motion.reduced) : 0) + delay);
    } else v.root.visible = false;
    this.arriving.delete(u.uid);
    return v;
  }

  /** A summon happened: remember where its sticker is tossed from, for the frame the view is made. */
  private onSummon(e: BattleEvents['summon']): void {
    const { ctx } = this.env;
    // A pick of three lands from where the sheet was; every other toss leaves the summon button.
    const from = e.source === 'choice' ? { x: ctx.layout.w / 2, y: ctx.layout.h * 0.46 } : ctx.anchor('summon');
    this.arriving.set(e.unit.uid, { source: e.source, x: from.x, y: from.y });
  }

  /**
   * The cat that has just been summoned gets found in three ways: a sticker flies in and lands on its cell, the cell flashes a
   * dashed ring on the landing frame, and a "NEW" tag stays on the cat for a couple of seconds. The cat's own pop waits for the landing.
   */
  private arrive(v: UnitView, u: UnitState, source: SummonSource, x: number, y: number, delay: number): void {
    const lead = tossFor(source, motion.reduced);
    const rarity = unitRarity(u.id);
    if (lead > 0) this.arrivals.toss(x, y, u.cell, rarity, () => this.arrivals.ring(u.cell, rarity));
    else this.arrivals.ring(u.cell, rarity);
    const from = this.env.time + lead + delay;
    v.markNew(from, from + NEW_TAG_SECONDS);
  }

  private syncSwirl(v: UnitView, u: UnitState): void {
    if (u.weakened > 0) {
      if (!v.swirl?.alive) v.swirl = this.env.ctx.fx.weakenSwirl(v.x, v.y, { follow: v.overhead });
    } else if (v.swirl) {
      v.swirl.stop();
      v.swirl = null;
    }
  }

  private startExit(v: UnitView, mode: ExitMode, seconds: number): void {
    v.exit = mode;
    v.exitK = 0;
    v.dragging = false;
    v.moveTween?.kill();
    v.swirl?.stop();
    v.swirl = null;
    const token = v.token;
    this.env.ctx.ui.run({
      duration: seconds,
      ease: mode === 'fly' ? Ease.cubicIn : Ease.quadIn,
      onUpdate: (k) => {
        if (v.token === token) v.exitK = k;
      },
      onComplete: () => {
        if (v.token === token) this.release(v);
      },
    });
  }

  private release(v: UnitView): void {
    this.byUid.delete(v.uid);
    const i = this.live.indexOf(v);
    if (i >= 0) {
      this.live[i] = this.live[this.live.length - 1] as UnitView;
      this.live.pop();
    }
    v.retire();
    v.root.parent?.removeChild(v.root);
    this.env.ctx.ui.call(COOLDOWN, () => this.pool.release(v));
  }

  private reveal(v: UnitView, overshoot: number, ms: number, flash: boolean): void {
    v.awaiting = false;
    v.appear(this.env.ctx.ui, overshoot, ms);
    if (flash) hitFlash(this.env.ctx.ui, v.sprite, { ms: 60, peak: 0.85 });
  }

  /** An awakened unit is revealed by the director; if nobody did it in time the field does. */
  private checkReveal(v: UnitView): void {
    if (v.root.visible) {
      v.awaiting = false;
      return;
    }
    if (this.env.time > v.revealAt) this.reveal(v, 2.0, 320, true);
  }

  // ── events ──

  private onAttack(e: BattleEvents['attack']): void {
    const v = this.byUid.get(e.unit.uid);
    if (!v) return;
    v.attack(this.env.ctx.tweens, e.tx - cellCenterX(e.unit.cell), e.ty - cellCenterY(e.unit.cell));
  }

  /** Slide a view from where it is shown now to its (new) cell: a short hop that lands with a squash. */
  private slide(v: UnitView, cell: number, hop: number): void {
    v.cell = cell;
    v.dragging = false;
    v.offX = v.x - v.homeX(cell);
    v.offY = v.y - v.homeY(cell);
    v.moveTween?.kill();
    const ox = v.offX;
    const oy = v.offY;
    const token = v.token;
    const tweens = this.env.ctx.ui;
    v.moveTween = tweens.run({
      duration: SLIDE_SECONDS,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        if (v.token !== token) return;
        v.offX = ox * (1 - k);
        v.offY = oy * (1 - k) + hopArc(k, hop);
      },
      onComplete: () => {
        if (v.token !== token) return;
        v.offX = v.offY = 0;
        squash(tweens, v.body, 1.1, 0.9, 200);
      },
    });
  }

  private onMove(e: BattleEvents['move']): void {
    const v = this.byUid.get(e.unit.uid);
    if (v) this.slide(v, e.to, 10);
  }

  private onSwap(e: BattleEvents['swap']): void {
    const a = this.byUid.get(e.a.uid);
    const b = this.byUid.get(e.b.uid);
    if (a) this.slide(a, e.a.cell, 14);
    if (b) this.slide(b, e.b.cell, 22);
  }

  private onMerge(e: BattleEvents['merge']): void {
    const { ctx } = this.env;
    const flying = this.byUid.get(e.consumed[0].uid);
    const target = this.byUid.get(e.consumed[1].uid);
    const result = this.create(e.result, 'hidden');
    const token = result.token;
    if (flying) {
      flying.exitFromX = flying.x;
      flying.exitFromY = flying.y;
      flying.exitToX = result.homeX(e.cell);
      flying.exitToY = result.homeY(e.cell);
      this.startExit(flying, 'fly', MERGE_SECONDS);
    }
    if (target) this.startExit(target, 'hold', MERGE_SECONDS);
    ctx.ui.call(MERGE_SECONDS, () => {
      if (result.token === token) this.reveal(result, 2.1, 260, true);
    });
  }

  private onMolt(e: BattleEvents['molt']): void {
    const old = this.byUid.get(e.from.uid);
    const result = this.create(e.result, 'hidden');
    const token = result.token;
    if (old) this.startExit(old, 'spin', MOLT_SECONDS);
    this.env.ctx.ui.call(MOLT_SECONDS, () => {
      if (result.token === token) this.reveal(result, 2.0, 300, false);
    });
  }

  private onAwaken(e: BattleEvents['awaken']): void {
    const old = this.byUid.get(e.from.uid);
    if (old) old.holdUntil = this.env.time + AWAKEN_OLD_HOLD;
    const result = this.create(e.result, 'hidden');
    result.awaiting = true;
    result.revealAt = this.env.time + AWAKEN_NEW_HOLD;
  }

  private onSell(e: BattleEvents['sell']): void {
    const v = this.byUid.get(e.unit.uid);
    if (v) this.startExit(v, 'sell', 0.22);
  }

  // ── interaction ──

  /** The simulation refused something aimed at this cell: a short head-shake and a red flash. */
  refuse(cell: number): void {
    const v = this.atCell(cell);
    if (!v) return;
    const tweens = this.env.ctx.ui;
    shakeObject(tweens, v.body, 6, 180);
    hitFlash(tweens, v.sprite, { ms: 120, color: Color.berry, peak: 0.55 });
    audio.play('ui_error', { volume: 0.5 });
  }

  beginDrag(v: UnitView, px: number, py: number): void {
    v.moveTween?.kill();
    v.dragging = true;
    v.dragX = px;
    v.dragY = py;
    v.x = v.root.x;
    v.y = v.root.y;
  }

  /** Put a dragged view back: it springs home and shakes its head when the drop was refused. */
  cancelDrag(v: UnitView, refused: boolean): void {
    if (!v.dragging) return;
    v.dragging = false;
    v.offX = v.x - v.homeX(v.cell);
    v.offY = v.y - v.homeY(v.cell);
    const ox = v.offX;
    const oy = v.offY;
    const token = v.token;
    const tweens = this.env.ctx.ui;
    v.moveTween?.kill();
    v.moveTween = tweens.run({
      duration: 0.2,
      ease: Ease.backOut,
      onUpdate: (k) => {
        if (v.token !== token) return;
        v.offX = ox * (1 - k);
        v.offY = oy * (1 - k);
      },
      onComplete: () => {
        if (v.token === token) v.offX = v.offY = 0;
      },
    });
    if (refused) shakeObject(tweens, v.body, 6, 180);
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.arriving.clear();
    this.arrivals.destroy();
    for (const v of this.live) {
      v.swirl?.stop();
      v.root.destroy({ children: true });
    }
    this.live.length = 0;
    this.byUid.clear();
    this.pool.drain((v) => v.root.destroy({ children: true }));
  }
}

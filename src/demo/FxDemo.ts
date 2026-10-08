import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { tex } from '@/core/assets';
import { Emitter } from '@/core/events';
import { Scene } from '@/core/scene';
import { game } from '@/core/game';
import { Ease, Tweener } from '@/core/tween';
import { debugExpose } from '@/core/debug';
import { Button, artLabel, drawFloor, drawPaper, label, PaperLabel, paperSeed } from '@/ui';
import { Color, Rarity, RARITY_ORDER, TapeColors } from '@/ui/theme';
import {
  FX_TIER_ORDER,
  Fx,
  awakeningCutIn,
  createHitStop,
  flyIconCount,
  flyTo,
  floatBob,
  fxSettings,
  fxShake,
  fxTexture,
  hitFlash,
  kickObject,
  popIn,
  popOut,
  pulseLoop,
  punchScale,
  rattleObject,
  screenFx,
  setFxSettings,
  shakeObject,
  squash,
  wobbleRotation,
  type AreaHandle,
  type FxHandle,
  type FxRect,
  type LoopHandle,
  type NumbersMode,
  type NumStyle,
} from '@/fx';
import { UNIT_IDS, type BattleEvents, type EnemyState, type ProjectileState, type UnitId } from '@/game/api';
import { unitSpec } from '@/game';
import type { FieldEnv } from '@/view/field/env';
import { fieldArt } from '@/view/field/art';
import { Projectiles } from '@/view/field/projectiles';
import { ShieldRing } from '@/view/field/shieldRing';
import { WeaponMarks } from '@/view/field/weaponMarks';

const COLS = 3;
const GAP = 12;
const CELL_H = 188;
const TOP = 120;
const BOTTOM = 332;
const SIDE = 24;
/** Distance of the page-navigation row from the bottom edge; the two toolbar rows sit below it. */
const NAV_FROM_BOTTOM = 264;
const TOOLBAR_FROM_BOTTOM = [160, 60] as const;

interface Entry {
  name: string;
  run: (c: CellView) => void;
}

interface CellView {
  entry: Entry;
  view: Container;
  panel: Graphics;
  cx: number;
  cy: number;
  w: number;
  h: number;
  avatar: Sprite | null;
  boss: Sprite | null;
  handle: FxHandle | LoopHandle | null;
  counter: number;
}

/** A gallery shot flies at this share of the real speed, so the eye can follow it across a cell. */
const SHOT_PACE = 0.4;

/**
 * What a gallery cell needs to play a battle effect alone: a stand-in for the simulation that holds the shots and the events, and the
 * field's own shot and weapon-mark layers drawing them, exactly as in a fight.
 */
class BattleRig {
  readonly layer = new Container();
  private readonly events = new Emitter<BattleEvents>();
  private readonly list: ProjectileState[] = [];
  private readonly flying: Array<{ state: ProjectileState; x0: number; y0: number; x1: number; y1: number; seconds: number; age: number }> = [];
  private readonly env: FieldEnv;
  private readonly shots: Projectiles;
  private readonly marks: WeaponMarks;
  private readonly target = new Sprite(tex('enemy_cucumber'));
  private targetUntil = 0;
  private time = 0;
  private uid = 1;

  constructor(fx: Fx) {
    this.env = {
      battle: { events: this.events, projectiles: this.list },
      art: fieldArt(),
      ctx: { enemyView: () => null, speed: 1, fx },
      time: 0,
    } as unknown as FieldEnv;
    this.shots = new Projectiles(this.env, this.layer);
    this.marks = new WeaponMarks(this.env, this.layer);
    this.target.anchor.set(0.5);
    this.target.visible = false;
    this.layer.addChild(this.target);
  }

  /** Throw `unitId`'s shot from one point to another: it flies as the simulation moves it and lands with its mark and a hit. */
  throwShot(unitId: UnitId, x0: number, y0: number, x1: number, y1: number): void {
    const state: ProjectileState = { uid: this.uid++, unitId, x: x0, y: y0, angle: Math.atan2(y1 - y0, x1 - x0), targetUid: 1 };
    const speed = unitSpec(unitId).projectileSpeed * SHOT_PACE;
    this.flying.push({ state, x0, y0, x1, y1, seconds: Math.hypot(x1 - x0, y1 - y0) / speed, age: 0 });
    this.list.push(state);
    const seconds = Math.hypot(x1 - x0, y1 - y0) / speed;
    this.target.position.set(x1, y1 + 4);
    this.target.scale.set(56 / Math.max(1, this.target.texture.width));
    this.target.visible = true;
    this.targetUntil = this.time + seconds + 1.2;
  }

  /** Throw what a zone-making cat throws (a shard, a dark star, a flask); returns the seconds it flies, when its area should open. */
  cast(unitId: UnitId, x0: number, y0: number, x1: number, y1: number): number {
    return this.shots.cast(unitId, -this.uid++, x0, y0, x1, y1);
  }

  update(dt: number): void {
    this.time += dt;
    this.env.time = this.time;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i] as (typeof this.flying)[number];
      f.age += dt;
      const k = Math.min(1, f.age / f.seconds);
      f.state.x = f.x0 + (f.x1 - f.x0) * k;
      f.state.y = f.y0 + (f.y1 - f.y0) * k;
      if (k < 1) continue;
      this.flying.splice(i, 1);
      this.list.splice(this.list.indexOf(f.state), 1);
      const enemy = { uid: 1, id: 'cucumber', x: f.x1, y: f.y1, angle: 0, hp: 50, maxHp: 100, shield: 0, maxShield: 0 } as unknown as EnemyState;
      this.events.emit('projectileEnd', { projectile: f.state, x: f.x1, y: f.y1, hit: true });
      this.events.emit('hit', { enemy, amount: 10, crit: false, type: 'physical', unitId: f.state.unitId, dot: null, absorbed: 0, killed: false });
    }
    this.shots.update();
    this.marks.update(dt);
    if (this.target.visible && this.time > this.targetUntil) this.target.visible = false;
  }

  destroy(): void {
    this.shots.destroy();
    this.marks.destroy();
    this.layer.destroy({ children: true });
  }
}

/** A cone in its shield ring in a gallery cell: an enemy's shield, with the hits, the nearly-gone dashes and the break that play on it. */
class RingRig {
  readonly root = new Container();
  private readonly cone = new Sprite(tex('enemy_cone'));
  private readonly ring = new ShieldRing(fieldArt().shieldRing);
  private share = 1;

  constructor(
    readonly x: number,
    readonly y: number,
  ) {
    this.cone.anchor.set(0.5);
    this.cone.scale.set(64 / Math.max(1, this.cone.texture.width));
    this.root.position.set(x, y);
    this.root.addChild(this.cone, this.ring.sprite);
  }

  raise(): void {
    this.share = 1;
    this.cone.visible = true;
    this.ring.raise(64);
  }

  hit(share: number): void {
    this.share = share;
    this.ring.hit(share < 0.4);
  }

  breakIt(fx: Fx): void {
    this.ring.drop();
    fx.shieldBreak(this.x, this.y);
  }

  update(dt: number): void {
    this.ring.update(dt, this.share);
  }

  destroy(): void {
    this.ring.destroy();
    this.root.destroy({ children: true });
  }
}

/** A tiny procedural cat face used as a stand-in unit for the juice and aura cells. */
function avatarTexture(): Texture {
  const g = new Graphics();
  g.poly([-50, -28, -40, -74, -10, -44]).fill(Color.mustardDark);
  g.poly([50, -28, 40, -74, 10, -44]).fill(Color.mustardDark);
  g.poly([-42, -40, -38, -62, -22, -46]).fill(TapeColors.pink.base);
  g.poly([42, -40, 38, -62, 22, -46]).fill(TapeColors.pink.base);
  g.circle(0, 0, 56).fill(Color.mustard).stroke({ width: 5, color: Color.ink });
  g.ellipse(-20, -4, 7, 10).fill(Color.inkDeep);
  g.ellipse(20, -4, 7, 10).fill(Color.inkDeep);
  g.circle(-18, -8, 2.5).fill(Color.white);
  g.circle(22, -8, 2.5).fill(Color.white);
  g.poly([-7, 10, 7, 10, 0, 18]).fill(Color.berry);
  const t = game.app.renderer.generateTexture({ target: g, resolution: 2 });
  g.destroy();
  return t;
}

const NUM_CYCLE: readonly NumStyle[] = ['damage', 'crit', 'dot', 'heal', 'gold', 'hurt', 'big'];

export default class FxDemo extends Scene {
  private readonly bg = new Graphics();
  private readonly pagesLayer = new Container();
  private readonly hud = new Container();
  private readonly fx: Fx;
  private readonly rig: BattleRig;
  private readonly rings = new Map<CellView, RingRig>();
  private readonly spinTw = new Tweener();
  private readonly hitStop: ReturnType<typeof createHitStop>;
  private readonly cells: CellView[] = [];
  private readonly entries: Entry[];
  private readonly pageContainers: Container[] = [];
  private readonly title = new PaperLabel({ text: 'FX GALLERY', size: 36, paper: 'primary' });
  private readonly pageLabel = artLabel('1/1', { size: 28 });
  private readonly settingsLabel = label('', { size: 24, color: Color.inkSoft });
  private readonly chip = new Container();
  private readonly chipCount = label('0', { size: 30, color: Color.inkDeep });
  private readonly spinner = new Sprite(fxTexture('star'));
  private avatarTex: Texture | null = null;
  private page = 0;
  private perPage = 15;
  private coins = 0;
  private numCursor = 0;
  private dangerStep = 0;
  private freezeStep = 0;
  private letterboxOn = false;
  private manual = false;
  private moltStep = 0;

  constructor() {
    super();
    // The gallery shows full-strength effects on a fixed tier; the Gov button hands the tier to the governor.
    setFxSettings({ reducedMotion: false, autoTier: false, tier: 'high', quality: 1 });
    this.fx = new Fx(this, this.tweens);
    this.rig = new BattleRig(this.fx);
    // Default options on purpose: the gallery shows the real caps and cooldown.
    this.hitStop = createHitStop([this.spinTw]);
    this.entries = this.makeEntries();
    this.addChild(this.bg, this.pagesLayer, this.hud);
    // The battle's own shots and marks, and the effects, render above the gallery chrome.
    this.addChild(this.rig.layer, this.fx.root);
    this.buildHud();
    this.layoutAll();
    debugExpose('fx', {
      names: this.entries.map((e) => e.name),
      play: (name: string) => this.playByName(name),
      playAt: (name: string, x: number, y: number) => this.playByName(name, x, y),
      where: (name: string) => {
        const c = this.find(name);
        return c ? { x: c.cx, y: c.cy } : null;
      },
      playAll: () => this.playAll(),
      stats: () => this.stats(),
      page: (n: number) => this.showPage(n),
      settings: (patch: Record<string, unknown>) => setFxSettings(patch),
      tier: (t: string) => setFxSettings({ tier: FX_TIER_ORDER.find((x) => x === t) ?? 'mid' }),
      clear: () => this.fx.clear(),
      chrome: (on: boolean) => {
        this.pagesLayer.visible = on;
        this.hud.visible = on;
      },
      manual: (on: boolean) => this.setManual(on),
      advance: (sec: number) => this.advance(sec),
      fx: this.fx,
      cutin: awakeningCutIn,
      portrait: () => this.avatarOf(this.cells[0] as CellView).texture,
      screen: screenFx,
      freeze: this.hitStop.freeze,
    });
  }

  override update(dt: number): void {
    if (this.manual) return;
    this.stepAll(dt);
  }

  private stepAll(dt: number): void {
    this.fx.update(dt);
    this.rig.update(dt);
    for (const d of this.rings.values()) d.update(dt);
    this.spinTw.update(dt);
    this.spinner.rotation += 3 * dt * this.spinTw.timeScale;
  }

  /** Deterministic stepping for screenshots: stop the clock, then advance it by hand. */
  private setManual(on: boolean): void {
    this.manual = on;
    this.tweens.timeScale = on ? 0 : 1;
  }

  private advance(seconds: number): void {
    const step = 1 / 60;
    this.tweens.timeScale = 1;
    for (let t = 0; t < seconds - 1e-6; t += step) {
      this.tweens.update(step);
      this.stepAll(step);
    }
    this.tweens.timeScale = this.manual ? 0 : 1;
  }

  override resize(): void {
    this.layoutAll();
  }

  override exit(): void {
    this.hitStop.dispose();
    for (const d of this.rings.values()) d.destroy();
    this.rings.clear();
    this.rig.destroy();
    this.fx.destroy();
    screenFx.clear();
  }

  /* ---- layout ------------------------------------------------------------------------------- */

  private buildHud(): void {
    this.title.position.set(game.w / 2, 40);
    this.pageLabel.position.set(game.w / 2, game.h - NAV_FROM_BOTTOM);
    this.settingsLabel.position.set(game.w / 2, 78);

    const prev = this.button('<', 260, game.h - NAV_FROM_BOTTOM, () => this.showPage(this.page - 1));
    const next = this.button('>', game.w - 260, game.h - NAV_FROM_BOTTOM, () => this.showPage(this.page + 1));
    prev.label = 'prev';
    next.label = 'next';

    const mk = (text: string, col: number, row: 0 | 1, fn: () => void): Container => {
      const b = this.button(text, game.w / 2 + (col - 1) * 240, game.h - TOOLBAR_FROM_BOTTOM[row], fn, 220, 88, 28);
      b.label = `toolbar${row}`;
      return b;
    };
    const qual = mk('Tier', 0, 0, () => {
      const next = FX_TIER_ORDER[(FX_TIER_ORDER.indexOf(fxSettings.tier) + 1) % FX_TIER_ORDER.length] ?? 'mid';
      setFxSettings({ tier: next, autoTier: false });
      this.refreshSettingsLabel();
    });
    const fl = mk('Flashes', 1, 0, () => {
      setFxSettings({ flashes: !fxSettings.flashes });
      this.refreshSettingsLabel();
    });
    const rm = mk('Reduced', 2, 0, () => {
      setFxSettings({ reducedMotion: !fxSettings.reducedMotion });
      this.refreshSettingsLabel();
    });
    const nm = mk('Numbers', 0, 1, () => {
      const order: readonly NumbersMode[] = ['full', 'brief', 'off'];
      setFxSettings({ numbers: order[(order.indexOf(fxSettings.numbers) + 1) % order.length] ?? 'full' });
      this.refreshSettingsLabel();
    });
    const gv = mk('Auto', 1, 1, () => {
      setFxSettings({ autoTier: !fxSettings.autoTier });
      this.refreshSettingsLabel();
    });
    const clr = mk('Clear', 2, 1, () => this.fx.clear());
    this.hud.addChild(this.title, this.pageLabel, this.settingsLabel, prev, next, qual, fl, rm, nm, gv, clr);

    // HUD chip: target for the fly-to demo.
    const chipBg = new Graphics();
    drawPaper(chipBg, -90, -30, { w: 180, h: 60, kind: 'pill', fill: Color.paperLight, seed: paperSeed(), grain: false });
    const coin = new Sprite(fxTexture('coin'));
    coin.anchor.set(0.5);
    coin.tint = Color.gold;
    coin.scale.set(1.2);
    coin.position.set(-56, 0);
    this.chipCount.anchor.set(1, 0.5);
    this.chipCount.position.set(70, 0);
    this.chip.addChild(chipBg, coin, this.chipCount);
    this.chip.position.set(game.w - 130, 40);
    this.hud.addChild(this.chip);

    this.spinner.anchor.set(0.5);
    this.spinner.tint = Color.mustard;
    this.spinner.scale.set(0.9);
    this.spinner.position.set(60, 40);
    this.hud.addChild(this.spinner);
    this.refreshSettingsLabel();
  }

  private button(text: string, x: number, y: number, onTap: () => void, w = 104, h = 88, size = 34): Container {
    const b = new Button({ label: text, style: 'neutral', width: w, height: h, fontSize: size, sfx: false, haptic: false });
    b.onTap(onTap);
    b.position.set(x, y);
    return b;
  }

  private refreshSettingsLabel(): void {
    this.settingsLabel.text =
      `tier ${fxSettings.tier}${fxSettings.autoTier ? ' (auto)' : ''}  flash ${fxSettings.flashes ? 'on' : 'off'}  reduced ${fxSettings.reducedMotion ? 'on' : 'off'}  nums ${fxSettings.numbers}`;
  }

  private layoutAll(): void {
    const w = game.w;
    const h = game.h;
    this.bg.clear();
    drawFloor(this.bg, w, h);
    drawPaper(this.bg, -14, -14, { w: w + 28, h: 122, radius: 0, fill: Color.kraft, torn: 'bottom', shadow: 6, seed: 3 });

    const cellW = (w - SIDE * 2 - GAP * (COLS - 1)) / COLS;
    const rows = Math.max(1, Math.floor((h - TOP - BOTTOM + GAP) / (CELL_H + GAP)));
    this.perPage = rows * COLS;

    for (const pc of this.pageContainers) pc.destroy({ children: true });
    this.pageContainers.length = 0;
    this.cells.length = 0;
    const pages = Math.ceil(this.entries.length / this.perPage);
    for (let p = 0; p < pages; p++) {
      const pc = new Container();
      this.pageContainers.push(pc);
      this.pagesLayer.addChild(pc);
    }
    this.entries.forEach((entry, i) => {
      const page = Math.floor(i / this.perPage);
      const k = i % this.perPage;
      const col = k % COLS;
      const row = Math.floor(k / COLS);
      const x = SIDE + col * (cellW + GAP);
      const y = TOP + row * (CELL_H + GAP);
      const view = new Container();
      view.position.set(x, y);
      // A dark warm well keeps the flat effects readable on every cell; the name hangs on a paper label.
      const panel = new Graphics().roundRect(0, 0, cellW, CELL_H, 22).fill({ color: Color.inkDeep, alpha: 0.55 }).stroke({ width: 3, color: Color.kraftDark, alpha: 0.8 });
      const name = new PaperLabel({ text: entry.name, size: 24, paper: Color.paperLight, maxWidth: cellW - 16, seed: i + 1 });
      name.position.set(cellW / 2, CELL_H - 26);
      view.addChild(panel, name);
      view.eventMode = 'static';
      view.hitArea = { contains: (px: number, py: number) => px >= 0 && py >= 0 && px <= cellW && py <= CELL_H };
      const cell: CellView = { entry, view, panel, cx: x + cellW / 2, cy: y + CELL_H / 2 - 12, w: cellW, h: CELL_H, avatar: null, boss: null, handle: null, counter: 0 };
      view.on('pointerdown', () => this.runCell(cell));
      (this.pageContainers[page] as Container).addChild(view);
      this.cells.push(cell);
    });
    for (const c of this.hud.children) if (c.label === 'prev' || c.label === 'next') c.y = h - NAV_FROM_BOTTOM;
    this.pageLabel.position.set(w / 2, h - NAV_FROM_BOTTOM);
    for (const c of this.hud.children) {
      const row = c.label === 'toolbar0' ? 0 : c.label === 'toolbar1' ? 1 : null;
      if (row !== null) c.y = h - TOOLBAR_FROM_BOTTOM[row];
    }
    this.showPage(Math.min(this.page, pages - 1));
  }

  private showPage(n: number): void {
    const pages = this.pageContainers.length;
    this.page = ((n % pages) + pages) % pages;
    this.pageContainers.forEach((pc, i) => {
      pc.visible = i === this.page;
    });
    this.pageLabel.text = `${this.page + 1} / ${pages}`;
  }

  /* ---- running ------------------------------------------------------------------------------ */

  private runCell(c: CellView): void {
    c.entry.run(c);
  }

  private find(name: string): CellView | undefined {
    return this.cells.find((c) => c.entry.name === name);
  }

  private playByName(name: string, x?: number, y?: number): boolean {
    const cell = this.find(name);
    if (!cell) return false;
    const idx = this.cells.indexOf(cell);
    this.showPage(Math.floor(idx / this.perPage));
    if (x === undefined || y === undefined) {
      cell.entry.run(cell);
    } else {
      const ox = cell.cx;
      const oy = cell.cy;
      cell.cx = x;
      cell.cy = y;
      cell.entry.run(cell);
      cell.cx = ox;
      cell.cy = oy;
    }
    return true;
  }

  private playAll(): void {
    for (const c of this.cells) {
      // Looping effects are toggles: only start them, never stop on a stress run.
      if (c.handle) continue;
      c.entry.run(c);
    }
  }

  private stats(): Record<string, unknown> {
    return {
      ...this.fx.stats(),
      numbersStats: this.fx.numbers.stats(),
      quality: fxSettings.quality,
      tier: fxSettings.tier,
      coins: this.coins,
    };
  }

  private avatarOf(c: CellView): Sprite {
    if (c.avatar) return c.avatar;
    this.avatarTex ??= avatarTexture();
    const s = new Sprite(this.avatarTex);
    s.anchor.set(0.5);
    s.scale.set(0.8);
    s.position.set(c.w / 2, c.h / 2 - 12);
    c.view.addChild(s);
    c.avatar = s;
    return s;
  }

  /** A larger, violet stand-in for a boss. */
  private bossOf(c: CellView): Sprite {
    if (c.boss) return c.boss;
    this.avatarTex ??= avatarTexture();
    const s = new Sprite(this.avatarTex);
    s.anchor.set(0.5);
    s.scale.set(1.15);
    s.tint = Rarity.epic.glow;
    s.position.set(c.w / 2, c.h / 2 - 12);
    s.visible = false;
    c.view.addChild(s);
    c.boss = s;
    return s;
  }

  /** Toggle a looping effect on a cell: start it, or stop it when a handle already exists. */
  private toggle(c: CellView, start: () => FxHandle | LoopHandle): void {
    if (c.handle?.alive) {
      c.handle.stop();
      c.handle = null;
    } else {
      c.handle = start();
    }
  }

  private makeEntries(): Entry[] {
    const fx = this.fx;
    const tw = this.tweens;
    const e = (name: string, run: (c: CellView) => void): Entry => ({ name, run });
    const list: Entry[] = [
      e('hitSpark', (c) => fx.hitSpark(c.cx, c.cy)),
      e('hitSparkAimed', (c) => fx.hitSpark(c.cx, c.cy, { angle: -0.6, color: Color.gem })),
      e('critBurst', (c) => fx.critBurst(c.cx, c.cy)),
      e('slashArc', (c) => fx.slashArc(c.cx, c.cy)),
      e('shockwave', (c) => fx.shockwave(c.cx, c.cy, { color: Rarity.rare.glow })),
      e('explosion', (c) => fx.explosion(c.cx, c.cy)),
      e('deathPuff', (c) => fx.deathPuff(c.cx, c.cy, { color: Color.leaf })),
      e('coinBurst', (c) => fx.coinBurst(c.cx, c.cy + 20)),
      e('mergeBurst', (c) => {
        const col = Rarity[RARITY_ORDER[(c.counter++ % 4) + 1] as keyof typeof Rarity].color;
        fx.mergeBurst(c.cx, c.cy, col);
      }),
      e('lightning', (c) => fx.lightning(c.cx - 70, c.cy - 70, c.cx + 60, c.cy + 50)),
      e('iceShatter', (c) => fx.iceShatter(c.cx, c.cy)),
      e('poisonCloud', (c) => this.toggle(c, () => fx.poisonCloud(c.cx, c.cy + 10, { duration: 4 }))),
      e('healPlus', (c) => fx.healPlus(c.cx, c.cy + 10)),
      e('dustPuff', (c) => fx.dustPuff(c.cx, c.cy + 40)),
      e('levelUp', (c) => fx.levelUp(c.cx, c.cy)),
      e('chargeUp', (c) => fx.chargeUp(c.cx, c.cy, { duration: 0.7 })),
      ...[0, 1, 2, 3, 4].map((tier) =>
        e(`summon${tier}`, (c) => {
          const av = this.avatarOf(c);
          av.visible = false;
          const t = fx.summonReveal(c.cx, c.cy, tier, {
            onImpact: () => {
              av.visible = true;
              popIn(tw, av, { ms: 280, overshoot: 2.4 });
            },
          });
          tw.call(t.duration + 0.6, () => {
            av.visible = false;
          });
        }),
      ),
      ...[3, 4].map((tier) =>
        e(`summon${tier} quick`, (c) => {
          const av = this.avatarOf(c);
          av.visible = false;
          const t = fx.summonReveal(c.cx, c.cy, tier, {
            quick: true,
            onImpact: () => {
              av.visible = true;
              popIn(tw, av, { ms: 240, overshoot: 2.4 });
            },
          });
          tw.call(t.duration + 0.4, () => {
            av.visible = false;
          });
        }),
      ),
      e('bossWarning', () => fx.bossWarning()),
      e('bossLanding', (c) => {
        const boss = this.bossOf(c);
        const rest = c.h / 2 - 12;
        boss.visible = true;
        boss.alpha = 1;
        boss.y = rest - 190;
        tw.to(boss, { y: rest }, { duration: 0.32, ease: Ease.quadIn, onComplete: () => fx.bossLanding(c.cx, c.cy + 50) });
      }),
      e('bossDeath', (c) => {
        const boss = this.bossOf(c);
        boss.visible = true;
        boss.alpha = 1;
        boss.y = c.h / 2 - 12;
        fx.bossDeath(c.cx, c.cy, { target: boss, radius: 60, onFinal: () => (boss.visible = false) });
      }),
      e('waveClear', () => fx.waveClear()),
      e('waveClear slow', () => fx.waveClear({ slowMo: true })),
      e('confettiRain', () => fx.confettiRain()),
      e('buffAura', (c) => {
        const av = this.avatarOf(c);
        this.toggle(c, () => fx.buffAura(av, { color: Color.success, radius: 50, offsetY: 20 }));
      }),
      e('rays', (c) => this.toggle(c, () => fx.rays(c.cx, c.cy, { color: Rarity.legendary.light, radius: 200, alpha: 0.7 }))),
      e('sparkleTrail', (c) => this.orbit(c, (o) => fx.sparkleTrail(o, { color: Color.mustard }))),
      e('smokeTrail', (c) => this.orbit(c, (o) => fx.smokeTrail(o))),
      e('ambientTwinkle', (c) =>
        this.toggle(c, () => fx.ambientTwinkle(c.cx, c.cy, c.w - 30, c.h - 70, { rate: 9 })),
      ),
      e('sunbeamCell', (c) => this.toggle(c, () => fx.sunbeamCell(this.cellRect(c)))),
      e('laserDot', (c) => this.laserDemo(c)),
      e('hazardWarn wet', (c) => fx.hazardWarn(this.cellRect(c), 'wet')),
      e('hazardWarn zap', (c) => fx.hazardWarn(this.cellRect(c), 'zap')),
      e('wetPuddle', (c) => this.toggle(c, () => fx.wetPuddle(this.cellRect(c)))),
      e('zapCell', (c) => this.toggle(c, () => fx.zapCell(this.cellRect(c)))),
      e('weakenSwirl', (c) => {
        const av = this.avatarOf(c);
        this.toggle(c, () => fx.weakenSwirl(c.cx, c.cy, { follow: av, scale: 0.9 }));
      }),
      e('blizzardZone', (c) => this.toggle(c, () => fx.blizzardZone(c.cx, c.cy, 78))),
      e('potionCloud', (c) => this.toggle(c, () => fx.potionCloud(c.cx, c.cy, 78))),
      e('blackHole', (c) => this.toggle(c, () => fx.blackHole(c.cx, c.cy, 80))),
      e('slashLine', (c) => fx.slashLine(c.cx - 95, c.cy + 50, c.cx + 95, c.cy - 55)),
      e('shieldBreak', (c) => fx.shieldBreak(c.cx, c.cy)),
      e('moltPuff', (c) => {
        const colors = [Color.mustard, Color.paperLight, Rarity.rare.glow, Rarity.epic.glow];
        const av = this.avatarOf(c);
        const t = fx.moltPuff(c.cx, c.cy, { color: colors[this.moltStep++ % colors.length] });
        tw.call(t.impact, () => squash(tw, av, 1.2, 0.85, 240));
      }),
      e('purrHearts', (c) => fx.purrHearts(c.cx, c.cy - 10)),
      e('coinRain', () => fx.coinRain()),
      e('meteor', (c) => fx.meteor(c.cx, c.cy + 30, { scale: 0.8 })),
      e('shootingStar', (c) => fx.shootingStar(c.cx, c.cy + 30, { scale: 0.8 })),
      e('awakening', (c) => void fx.awakening(this.avatarOf(c).texture, '수호신 방울냥', { tag: 'MYTHIC' })),
      e('awakening short', (c) => void fx.awakening(this.avatarOf(c).texture, 'Guardian Bell', { short: true, tag: 'MYTHIC' })),
      e('numbers', (c) => {
        const style = NUM_CYCLE[this.numCursor++ % NUM_CYCLE.length] as NumStyle;
        const v = style === 'big' ? 48210 : style === 'crit' ? 2140 : style === 'dot' ? 12 : 386;
        fx.number(c.cx, c.cy, v, style);
        if (style === 'damage') {
          for (let i = 1; i < 4; i++) tw.call(i * 0.08, () => fx.number(c.cx, c.cy - 10 * i, 90 + i * 40, 'damage'));
        }
      }),
      e('flyTo', (c) => {
        flyTo({
          from: { x: c.cx, y: c.cy },
          to: this.chip,
          count: flyIconCount(10),
          texture: fxTexture('coin'),
          size: 40,
          tint: Color.gold,
          onArrive: (i) => {
            this.coins += 10;
            this.chipCount.text = String(this.coins);
            punchScale(this.tweens, this.chip, 0.22, 140);
            if (i % 3 === 0) fx.dustPuff(this.chip.x - 56, this.chip.y, { color: Color.mustard, scale: 0.5 });
          },
        });
      }),
      e('punchScale', (c) => punchScale(tw, this.avatarOf(c), 0.28, 150)),
      e('squash', (c) => {
        const a = this.avatarOf(c);
        squash(tw, a, 1.25, 0.75, 300);
      }),
      e('popOut/popIn', (c) => {
        const a = this.avatarOf(c);
        if (a.visible && a.alpha > 0.5) popOut(tw, a, { onDone: () => popIn(tw, a, { ms: 300 }) });
        else popIn(tw, a, { ms: 300 });
      }),
      e('wobbleRotation', (c) => wobbleRotation(tw, this.avatarOf(c), 12)),
      e('rattle', (c) => rattleObject(tw, this.avatarOf(c), { ms: 600, amplitude: 5, degrees: 4 })),
      e('kick', (c) => {
        const a = this.avatarOf(c);
        kickObject(tw, a, -16, 6, 140);
        hitFlash(tw, a, { ms: 66 });
      }),
      e('shakeObject', (c) => shakeObject(tw, this.avatarOf(c), 9, 240)),
      e('floatBob', (c) => this.toggle(c, () => floatBob(tw, this.avatarOf(c), 8, 1.5))),
      e('pulseLoop', (c) => this.toggle(c, () => pulseLoop(tw, this.avatarOf(c), 0.07, 1.0))),
      e('hitFlash', (c) => {
        const a = this.avatarOf(c);
        hitFlash(tw, a);
        squash(tw, a, 0.9, 1.1, 180);
        fx.hitSpark(c.cx, c.cy);
      }),
      e('screenFlash', (c) => {
        screenFx.flash(c.counter++ % 2 === 0 ? Color.white : Color.mustard, 0.4, 140);
      }),
      e('dangerVignette', () => {
        this.dangerStep = (this.dangerStep + 1) % 4;
        screenFx.setDanger(this.dangerStep / 3);
      }),
      e('vignettePulse', () => screenFx.vignettePulse(Color.berry, 0.3, 500, 2)),
      e('letterbox', () => {
        this.letterboxOn = !this.letterboxOn;
        screenFx.letterbox(this.letterboxOn, { height: 150 });
      }),
      e('timeFreeze', () => {
        this.freezeStep++;
        const f = this.hitStop.freeze;
        if (this.freezeStep % 2 === 1) f.freeze(0.2, 0);
        else f.freezeThenSlow(0.12, 0.4, 0.3);
      }),
      e('screenShake', () => fxShake(0.6)),
      ...this.battleEntries(),
    ];
    return list;
  }

  /** The cell's central 150 x 150 area as a board-cell rectangle. */
  /** Every battle effect alone: each cat's shot flying and landing, the three throws and the areas they open, the lightning chain, the foes' rings and cells, the shield. */
  private battleEntries(): Entry[] {
    const fx = this.fx;
    const tw = this.tweens;
    const e = (name: string, run: (c: CellView) => void): Entry => ({ name, run });
    const shooters = UNIT_IDS.filter((id) => unitSpec(id).projectileSpeed > 0);
    const areaOf = (id: UnitId, c: CellView): AreaHandle => {
      const x = c.cx + 40;
      return id === 'm_frost' ? fx.blizzardZone(x, c.cy, 70) : id === 'm_cosmo' ? fx.blackHole(x, c.cy, 70) : fx.potionCloud(x, c.cy, 70);
    };
    return [
      ...shooters.map((id) => e(`shot ${id}`, (c) => this.rig.throwShot(id, c.cx - 90, c.cy + 40, c.cx + 80, c.cy - 20))),
      ...(['m_frost', 'm_cosmo', 't_alch'] as const).map((id) =>
        e(`cast ${id}`, (c) => {
          const flight = this.rig.cast(id, c.cx - 90, c.cy + 40, c.cx + 40, c.cy);
          const life = id === 'm_cosmo' ? 3 : 3.6;
          tw.call(flight, () => {
            const h = areaOf(id, c);
            tw.run({ duration: life, onUpdate: (k) => h.setLeft(life * (1 - k), life), onComplete: () => h.stop() });
          });
        }),
      ),
      e('chain m_storm', (c) => {
        const pts: ReadonlyArray<readonly [number, number]> = [[c.cx - 90, c.cy - 50], [c.cx - 25, c.cy + 20], [c.cx + 35, c.cy - 40], [c.cx + 90, c.cy + 30]];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1] as readonly [number, number];
          const b = pts[i] as readonly [number, number];
          fx.arc(a[0], a[1], b[0], b[1], { delay: (i - 1) * 0.05 });
        }
      }),
      e('foe ring haste', (c) => this.toggle(c, () => fx.enemyRing('haste', c.cx, c.cy, 80))),
      e('foe ring heal', (c) => this.toggle(c, () => fx.enemyRing('heal', c.cx, c.cy, 80))),
      ...(['wet', 'zap'] as const).map((kind) =>
        e(`foe cell ${kind}`, (c) => {
          const rect = { x: c.cx - 55, y: c.cy - 62, w: 110, h: 124 };
          const h = kind === 'wet' ? fx.wetPuddle(rect) : fx.zapCell(rect);
          tw.run({ duration: 3.4, onUpdate: (k) => h.setLeft(3.4 * (1 - k), 3.4), onComplete: () => h.stop() });
        }),
      ),
      e('shield idle', (c) => this.ringOf(c).raise()),
      e('shield hit', (c) => {
        const d = this.ringOf(c);
        d.raise();
        for (let i = 0; i < 3; i++) tw.call(0.5 + i * 0.5, () => d.hit(1));
      }),
      e('shield nearly gone', (c) => {
        const d = this.ringOf(c);
        d.raise();
        tw.call(0.5, () => d.hit(0.5));
        tw.call(1.4, () => d.hit(0.2));
      }),
      e('shield break', (c) => {
        const d = this.ringOf(c);
        d.raise();
        tw.call(0.5, () => d.hit(0.55));
        tw.call(1.1, () => d.hit(0.25));
        tw.call(1.7, () => d.breakIt(fx));
      }),
    ];
  }

  /** The cone in its shield ring of this cell, made the first time. */
  private ringOf(c: CellView): RingRig {
    let d = this.rings.get(c);
    if (!d) {
      d = new RingRig(c.cx, c.cy + 6);
      this.rig.layer.addChild(d.root);
      this.rings.set(c, d);
    }
    return d;
  }

  private cellRect(c: CellView): FxRect {
    return { x: c.cx - 75, y: c.cy - 75, w: 150, h: 150 };
  }

  /** Show the laser dot following a point that wanders around the cell, then end it. */
  private laserDemo(c: CellView): void {
    const { cx, cy, w, h } = c;
    const dot = this.fx.laserDot(cx, cy);
    this.tweens.run({
      duration: 3,
      ease: Ease.linear,
      onUpdate: (k) => dot.moveTo(cx + Math.sin(k * 9) * w * 0.3, cy + Math.sin(k * 6 + 1) * h * 0.2),
      onComplete: () => dot.stop(),
    });
  }

  /** Orbit a marker around the cell for a few seconds with a trail attached. */
  private orbit(c: CellView, trail: (o: Sprite) => FxHandle): void {
    const o = new Sprite(fxTexture('dot'));
    o.anchor.set(0.5);
    o.tint = Color.white;
    o.scale.set(0.5);
    this.addChild(o);
    const h = trail(o);
    const rx = c.w * 0.32;
    const ry = c.h * 0.22;
    this.tweens.run({
      duration: 2.6,
      ease: Ease.linear,
      onUpdate: (k) => {
        const a = k * Math.PI * 4;
        o.position.set(c.cx + Math.sin(a) * rx, c.cy + Math.sin(a * 2) * ry);
      },
      onComplete: () => {
        h.stop();
        o.destroy();
      },
    });
  }
}

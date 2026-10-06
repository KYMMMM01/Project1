import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { Scene } from '@/core/scene';
import { game } from '@/core/game';
import { Ease, Tweener } from '@/core/tween';
import { debugExpose } from '@/core/debug';
import { label } from '@/ui/text';
import { Color, Rarity, RARITY_ORDER } from '@/ui/theme';
import {
  Fx,
  createHitStop,
  flyIconCount,
  flyTo,
  floatBob,
  fxSettings,
  fxShake,
  fxTexture,
  hitFlash,
  popIn,
  popOut,
  pulseLoop,
  punchScale,
  screenFx,
  setFxSettings,
  shakeObject,
  squash,
  wobbleRotation,
  type FxHandle,
  type LoopHandle,
  type NumStyle,
} from '@/fx';

const COLS = 3;
const GAP = 12;
const CELL_H = 188;
const TOP = 112;
const BOTTOM = 150;
const SIDE = 24;

interface Entry {
  name: string;
  hint: string;
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
  handle: FxHandle | LoopHandle | null;
  counter: number;
}

/** A tiny procedural cat face used as a stand-in unit for the juice and aura cells. */
function avatarTexture(): Texture {
  const g = new Graphics();
  g.poly([-50, -28, -40, -74, -10, -44]).fill(0xe88f45);
  g.poly([50, -28, 40, -74, 10, -44]).fill(0xe88f45);
  g.poly([-42, -40, -38, -62, -22, -46]).fill(0xffa8b8);
  g.poly([42, -40, 38, -62, 22, -46]).fill(0xffa8b8);
  g.circle(0, 0, 56).fill(0xffb35c).stroke({ width: 5, color: 0x5a2d12 });
  g.ellipse(-20, -4, 7, 10).fill(0x2a1746);
  g.ellipse(20, -4, 7, 10).fill(0x2a1746);
  g.circle(-18, -8, 2.5).fill(0xffffff);
  g.circle(22, -8, 2.5).fill(0xffffff);
  g.poly([-7, 10, 7, 10, 0, 18]).fill(0xff7a8a);
  g.roundRect(-30, 26, 60, 3, 1).fill({ color: 0x5a2d12, alpha: 0.0 });
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
  private readonly spinTw = new Tweener();
  private readonly hitStop: ReturnType<typeof createHitStop>;
  private readonly cells: CellView[] = [];
  private readonly entries: Entry[];
  private readonly pageContainers: Container[] = [];
  private readonly title = label('FX GALLERY', { size: 40, color: Color.primary });
  private readonly pageLabel = label('1/1', { size: 26 });
  private readonly settingsLabel = label('', { size: 20, color: Color.textDim });
  private readonly chip = new Container();
  private readonly chipCount = label('0', { size: 30, color: Color.gold });
  private readonly spinner = new Sprite(fxTexture('star'));
  private avatarTex: Texture | null = null;
  private page = 0;
  private perPage = 15;
  private coins = 0;
  private numCursor = 0;
  private dangerStep = 0;
  private freezeStep = 0;
  private letterboxOn = false;

  constructor() {
    super();
    this.fx = new Fx(this, this.tweens);
    this.hitStop = createHitStop([this.spinTw], { cooldown: 0 });
    this.entries = this.makeEntries();
    this.addChild(this.bg, this.pagesLayer, this.hud);
    // Effects render above the gallery chrome.
    this.addChild(this.fx.root);
    this.buildHud();
    this.layoutAll();
    debugExpose('fx', {
      names: this.entries.map((e) => e.name),
      play: (name: string) => this.playByName(name),
      playAt: (name: string, x: number, y: number) => this.playByName(name, x, y),
      playAll: () => this.playAll(),
      stats: () => this.stats(),
      page: (n: number) => this.showPage(n),
      settings: (patch: Record<string, unknown>) => setFxSettings(patch),
      clear: () => this.fx.clear(),
      fx: this.fx,
    });
  }

  override update(dt: number): void {
    this.fx.update(dt);
    this.spinTw.update(dt);
    this.spinner.rotation += 3 * dt * this.spinTw.timeScale;
  }

  override resize(): void {
    this.layoutAll();
  }

  override exit(): void {
    this.hitStop.dispose();
    this.fx.destroy();
    screenFx.clear();
  }

  /* ---- layout ------------------------------------------------------------------------------- */

  private buildHud(): void {
    this.title.position.set(game.w / 2, 40);
    this.pageLabel.position.set(game.w / 2, game.h - 112);
    this.settingsLabel.position.set(game.w / 2, game.h - 30);

    const prev = this.button('<', 70, 0);
    const next = this.button('>', game.w - 70, 0);
    prev.on('pointerdown', () => this.showPage(this.page - 1));
    next.on('pointerdown', () => this.showPage(this.page + 1));
    prev.name = 'prev';
    next.name = 'next';

    const mk = (text: string, x: number, fn: () => void): Container => {
      const b = this.button(text, x, 0, 126, 54, 22);
      b.on('pointerdown', fn);
      return b;
    };
    const qual = mk('Quality', 170, () => {
      const q = fxSettings.quality;
      setFxSettings({ quality: q > 0.9 ? 0.5 : q > 0.4 ? 0.25 : 1 });
      this.refreshSettingsLabel();
    });
    const fl = mk('Flashes', 306, () => {
      setFxSettings({ flashes: !fxSettings.flashes });
      this.refreshSettingsLabel();
    });
    const rm = mk('Reduced', 442, () => {
      setFxSettings({ reducedMotion: !fxSettings.reducedMotion });
      this.refreshSettingsLabel();
    });
    const clr = mk('Clear', 578, () => this.fx.clear());
    this.hud.addChild(this.title, this.pageLabel, this.settingsLabel, prev, next, qual, fl, rm, clr);

    // HUD chip: target for the fly-to demo.
    const chipBg = new Graphics().roundRect(-90, -30, 180, 60, 30).fill(Color.panel).stroke({ width: 4, color: Color.outline });
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
    this.spinner.tint = 0xffd23f;
    this.spinner.scale.set(0.9);
    this.hud.addChild(this.spinner);
    this.refreshSettingsLabel();
  }

  private button(text: string, x: number, y: number, w = 92, h = 64, size = 34): Container {
    const c = new Container();
    const g = new Graphics().roundRect(-w / 2, -h / 2, w, h, 18).fill(Color.panelLight).stroke({ width: 4, color: Color.outline });
    const t = label(text, { size });
    c.addChild(g, t);
    c.position.set(x, y);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    return c;
  }

  private refreshSettingsLabel(): void {
    this.settingsLabel.text = `quality ${fxSettings.quality}  flashes ${fxSettings.flashes ? 'on' : 'off'}  reduced ${fxSettings.reducedMotion ? 'on' : 'off'}`;
  }

  private layoutAll(): void {
    const w = game.w;
    const h = game.h;
    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill(0x0e0a1d);
    this.bg.rect(0, 0, w, 90).fill({ color: 0x1b1233, alpha: 0.9 });

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
      const panel = new Graphics().roundRect(0, 0, cellW, CELL_H, 22).fill(0x1d1538).stroke({ width: 3, color: 0x3a2c66 });
      const name = label(entry.name, { size: 22, color: Color.textDim, stroke: Color.outline });
      name.position.set(cellW / 2, CELL_H - 20);
      view.addChild(panel, name);
      view.eventMode = 'static';
      view.hitArea = { contains: (px: number, py: number) => px >= 0 && py >= 0 && px <= cellW && py <= CELL_H };
      const cell: CellView = { entry, view, panel, cx: x + cellW / 2, cy: y + CELL_H / 2 - 12, w: cellW, h: CELL_H, avatar: null, handle: null, counter: 0 };
      view.on('pointerdown', () => this.runCell(cell));
      (this.pageContainers[page] as Container).addChild(view);
      this.cells.push(cell);
    });
    this.hud.children.forEach((c) => {
      if (c.name === 'prev' || c.name === 'next') c.y = h / 2;
    });
    this.pageLabel.position.set(w / 2, h - 112);
    this.settingsLabel.position.set(w / 2, h - 30);
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
    const e = (name: string, hint: string, run: (c: CellView) => void): Entry => ({ name, hint, run });
    const list: Entry[] = [
      e('hitSpark', '', (c) => fx.hitSpark(c.cx, c.cy)),
      e('hitSparkAimed', '', (c) => fx.hitSpark(c.cx, c.cy, { angle: -0.6, color: 0x9fe8ff })),
      e('critBurst', '', (c) => fx.critBurst(c.cx, c.cy)),
      e('slashArc', '', (c) => fx.slashArc(c.cx, c.cy)),
      e('shockwave', '', (c) => fx.shockwave(c.cx, c.cy, { color: 0x9fd0ff })),
      e('explosion', '', (c) => fx.explosion(c.cx, c.cy)),
      e('deathPuff', '', (c) => fx.deathPuff(c.cx, c.cy, { color: 0x9ad06a })),
      e('coinBurst', '', (c) => fx.coinBurst(c.cx, c.cy + 20)),
      e('mergeBurst', '', (c) => {
        const col = Rarity[RARITY_ORDER[(c.counter++ % 4) + 1] as keyof typeof Rarity].color;
        fx.mergeBurst(c.cx, c.cy, col);
      }),
      e('lightning', '', (c) => fx.lightning(c.cx - 70, c.cy - 70, c.cx + 60, c.cy + 50)),
      e('iceShatter', '', (c) => fx.iceShatter(c.cx, c.cy)),
      e('poisonCloud', '', (c) => this.toggle(c, () => fx.poisonCloud(c.cx, c.cy + 10, { duration: 4 }))),
      e('healPlus', '', (c) => fx.healPlus(c.cx, c.cy + 10)),
      e('dustPuff', '', (c) => fx.dustPuff(c.cx, c.cy + 40)),
      e('levelUp', '', (c) => fx.levelUp(c.cx, c.cy)),
      e('chargeUp', '', (c) => fx.chargeUp(c.cx, c.cy, { duration: 0.7 })),
      ...[0, 1, 2, 3, 4].map((tier) =>
        e(`summon${tier}`, '', (c) => {
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
      e('confettiRain', '', () => fx.confettiRain()),
      e('buffAura', '', (c) => {
        const av = this.avatarOf(c);
        this.toggle(c, () => fx.buffAura(av, { color: Color.success, radius: 50, offsetY: 20 }));
      }),
      e('rays', '', (c) => this.toggle(c, () => fx.rays(c.cx, c.cy, { color: 0xffe9a0, radius: 200, alpha: 0.7 }))),
      e('sparkleTrail', '', (c) => this.orbit(c, (o) => fx.sparkleTrail(o, { color: 0xfff0a8 }))),
      e('smokeTrail', '', (c) => this.orbit(c, (o) => fx.smokeTrail(o))),
      e('ambientTwinkle', '', (c) =>
        this.toggle(c, () => fx.ambientTwinkle(c.cx, c.cy, c.w - 30, c.h - 70, { rate: 9 })),
      ),
      e('numbers', '', (c) => {
        const style = NUM_CYCLE[this.numCursor++ % NUM_CYCLE.length] as NumStyle;
        const v = style === 'big' ? 48210 : style === 'crit' ? 2140 : style === 'dot' ? 12 : 386;
        fx.number(c.cx, c.cy, v, style);
        if (style === 'damage') {
          for (let i = 1; i < 4; i++) tw.call(i * 0.08, () => fx.number(c.cx, c.cy - 10 * i, 90 + i * 40, 'damage'));
        }
      }),
      e('flyTo', '', (c) => {
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
            if (i % 3 === 0) fx.dustPuff(this.chip.x - 56, this.chip.y, { color: 0xffe27a, scale: 0.5 });
          },
        });
      }),
      e('punchScale', '', (c) => punchScale(tw, this.avatarOf(c), 0.28, 150)),
      e('squash', '', (c) => {
        const a = this.avatarOf(c);
        squash(tw, a, 1.25, 0.75, 300);
      }),
      e('popOut/popIn', '', (c) => {
        const a = this.avatarOf(c);
        if (a.visible && a.alpha > 0.5) popOut(tw, a, { onDone: () => popIn(tw, a, { ms: 300 }) });
        else popIn(tw, a, { ms: 300 });
      }),
      e('wobbleRotation', '', (c) => wobbleRotation(tw, this.avatarOf(c), 12)),
      e('shakeObject', '', (c) => shakeObject(tw, this.avatarOf(c), 9, 240)),
      e('floatBob', '', (c) => this.toggle(c, () => floatBob(tw, this.avatarOf(c), 8, 1.5))),
      e('pulseLoop', '', (c) => this.toggle(c, () => pulseLoop(tw, this.avatarOf(c), 0.07, 1.0))),
      e('hitFlash', '', (c) => {
        const a = this.avatarOf(c);
        hitFlash(tw, a);
        squash(tw, a, 0.9, 1.1, 180);
        fx.hitSpark(c.cx, c.cy);
      }),
      e('screenFlash', '', (c) => {
        screenFx.flash(c.counter++ % 2 === 0 ? 0xffffff : 0xffd45e, 0.4, 140);
      }),
      e('dangerVignette', '', () => {
        this.dangerStep = (this.dangerStep + 1) % 4;
        screenFx.setDanger(this.dangerStep / 3);
      }),
      e('vignettePulse', '', () => screenFx.vignettePulse(0xff2a2a, 0.3, 500, 2)),
      e('letterbox', '', () => {
        this.letterboxOn = !this.letterboxOn;
        screenFx.letterbox(this.letterboxOn, { height: 150 });
      }),
      e('timeFreeze', '', () => {
        this.freezeStep++;
        if (this.freezeStep % 2 === 1) this.hitStop.freeze.freeze(0.2, 0);
        else this.hitStop.freeze.freeze(0.4, 0.3);
      }),
      e('screenShake', '', () => fxShake(0.6)),
    ];
    return list;
  }

  /** Orbit a marker around the cell for a few seconds with a trail attached. */
  private orbit(c: CellView, trail: (o: Sprite) => FxHandle): void {
    const o = new Sprite(fxTexture('dot'));
    o.anchor.set(0.5);
    o.tint = 0xffffff;
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

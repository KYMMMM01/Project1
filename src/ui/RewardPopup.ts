import { Container, Graphics, Sprite, type DestroyOptions, type Texture } from 'pixi.js';
import { audio, type SfxId } from '@/audio';
import { haptic } from '@/core/haptics';
import { mixColor, TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import { Button } from './Button';
import { countUpDuration, countUpValue, formatCount } from './countUp';
import { drawIcon, type IconName } from './icons';
import { motion, popIn, TweenBag } from './motion';
import { numberText } from './numbers';
import { Panel } from './Panel';
import { Popup, popups } from './Popup';
import { drawPaper, paperSeed } from './paper';
import { cacheStatic } from './shapes';
import { fitLabel, uiLabel } from './text';
import { Color, Rarity, type RarityId } from './theme';

/** One line of a reward list: show either a vector icon or a texture. */
export interface RewardDesc {
  icon?: IconName;
  texture?: Texture;
  amount: number;
  /** Item name under the amount ("Gold", "Mystic Cat"). */
  label?: string;
  rarity?: RarityId;
}

export type RewardChoice = 'claim' | 'double';

/** Where a reward tile sits on screen when the player chooses: the origin for a fly-to-HUD effect. */
export interface RewardTilePoint {
  reward: RewardDesc;
  /** Pixi global (screen) coordinates of the tile centre; convert with game.overlayLayer.toLocal(). */
  x: number;
  y: number;
}

export interface RewardPopupOpts {
  title: string;
  rewards: readonly RewardDesc[];
  claimLabel: string;
  /** Second, ad-style button ("Claim x2"). Omit for a single Claim button. */
  doubleLabel?: string;
  /** Smaller line under the title. */
  subtitle?: string;
  /**
   * Called once, on the frame the popup is dismissed (a button, Escape or Back), while the tiles are
   * still on screen: start the fly-to-HUD from their positions here.
   */
  onChoose?: (choice: RewardChoice, tiles: readonly RewardTilePoint[]) => void;
}

const TILE = 148;
const GAP = 22;
const PANEL_W = 640;

/** The sunburst's paper: warm cream over the dim, kept faint so the sheet stays the brightest thing. */
const RAY_COLOR = mixColor(Color.paperLight, Color.mustard, 0.35);
const RAY_ALPHA = 0.2;

interface Tile {
  view: Container;
  desc: RewardDesc;
  reveal: () => void;
}

function sfxFor(r: RewardDesc): SfxId {
  if (r.icon === 'coin') return 'coin';
  if (r.icon === 'gem') return 'gem';
  return 'star';
}

/**
 * Celebratory reward list. Tiles pop in one by one (a rising chime per tile) while the amounts count
 * up; the buttons arrive after the last tile. Backdrop taps never dismiss it — the player must pick.
 */
export class RewardPopup extends Popup<RewardChoice> {
  private readonly bag = new TweenBag();
  private readonly rays = new Graphics();
  private tiles: Tile[] = [];
  private chooseFn: RewardPopupOpts['onChoose'];
  private chosen = false;

  constructor(opts: RewardPopupOpts) {
    super({ dismissResult: 'claim', backdropClose: false, priority: 1, dim: 1.1 });
    this.chooseFn = opts.onChoose;
    const n = opts.rewards.length;
    const cols = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const tileH = TILE + 76;
    const gridH = rows * tileH + (rows - 1) * 6;
    const head = opts.subtitle ? 128 : 100;
    const h = head + gridH + 36 + 112 + 50;
    const panel = new Panel({ width: PANEL_W, height: h, title: opts.title, ribbon: 'primary', torn: 'bottom', tape: 'pink' });

    // A slowly turning paper sunburst behind the panel makes the screen feel like an event.
    this.drawRays(Math.max(PANEL_W, h) * 0.62);
    this.rays.position.set(0, -h / 2 + 120);
    this.body.addChild(this.rays, panel);
    this.setContentSize(PANEL_W + 48, h + 90);

    if (opts.subtitle) {
      const sub = uiLabel(opts.subtitle, { size: 28, color: Color.inkSoft });
      fitLabel(sub, PANEL_W - 80, 28);
      sub.position.set(PANEL_W / 2, 92);
      panel.content.addChild(sub);
    }

    const tiles: Tile[] = [];
    opts.rewards.forEach((r, i) => {
      const inRow = Math.min(cols, n - Math.floor(i / cols) * cols);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PANEL_W / 2 + (col - (inRow - 1) / 2) * (TILE + GAP);
      const y = head + row * (tileH + 6) + TILE / 2;
      const tile = this.makeTile(r, i);
      tile.view.position.set(x, y);
      panel.content.addChild(tile.view);
      tiles.push(tile);
    });

    const by = h - 50 - 56;
    const claim = new Button({
      label: opts.claimLabel,
      style: opts.doubleLabel ? 'neutral' : 'primary',
      width: opts.doubleLabel ? 252 : 320,
      height: 112,
      fontSize: 42,
    });
    claim.onTap(() => this.close('claim'));
    panel.content.addChild(claim);
    const buttons: Button[] = [claim];
    if (opts.doubleLabel) {
      const dbl = new Button({ label: opts.doubleLabel, style: 'success', width: 300, height: 112, fontSize: 40, icon: 'ad' });
      dbl.onTap(() => this.close('double'));
      claim.position.set(PANEL_W / 2 - 166, by);
      dbl.position.set(PANEL_W / 2 + 150, by);
      panel.content.addChild(dbl);
      buttons.push(dbl);
    } else {
      claim.position.set(PANEL_W / 2, by);
    }
    this.tiles = tiles;
    this.sequence(tiles, buttons);
  }

  /** Every way out of the popup funnels through here so onChoose fires exactly once. */
  override close(result?: RewardChoice): void {
    const choice = result ?? this.dismissResult;
    if (!this.chosen) {
      this.chosen = true;
      const fn = this.chooseFn;
      this.chooseFn = undefined;
      if (fn) {
        const points = this.tiles.map((t) => {
          const g = t.view.getGlobalPosition();
          return { reward: t.desc, x: g.x, y: g.y };
        });
        fn(choice, points);
      }
    }
    super.close(choice);
  }

  /** A flat paper sunburst, drawn once and turned slowly: no gradient, no glow, no additive blend. */
  private drawRays(r: number): void {
    const g = this.rays;
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * TAU;
      const a1 = a0 + (TAU / rays) * 0.42;
      g.poly([0, 0, Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r]).fill({ color: RAY_COLOR, alpha: RAY_ALPHA });
    }
    cacheStatic(g);
    if (motion.reduced) return;
    this.bag.run({
      duration: 32,
      ease: Ease.linear,
      repeat: -1,
      onUpdate: (k) => {
        g.rotation = k * TAU;
      },
    });
  }

  private makeTile(r: RewardDesc, index: number): Tile {
    const tile = new Container();
    const rar = Rarity[r.rarity ?? 'common'];
    const plate = new Graphics();
    // A photo frame: cream border round a mat in the rarity's colour.
    const seed = paperSeed();
    drawPaper(plate, -TILE / 2, -TILE / 2, { w: TILE, h: TILE, radius: 26, fill: Color.paperLight, edge: Color.kraftDark, shadow: 5, grain: false, seed });
    drawPaper(plate, -TILE / 2 + 11, -TILE / 2 + 11, { w: TILE - 22, h: TILE - 22, radius: 18, fill: rar.light, edge: rar.dark, shadow: false, grain: false, seed: seed + 1 });
    tile.addChild(plate);

    if (r.texture) {
      const sp = new Sprite(r.texture);
      sp.anchor.set(0.5);
      const k = Math.min(104 / sp.width, 104 / sp.height);
      sp.scale.set(k);
      sp.y = -4;
      tile.addChild(sp);
    } else if (r.icon) {
      const ic = drawIcon(r.icon, 96);
      ic.y = -4;
      tile.addChild(ic);
    }

    const pill = new Graphics();
    drawPaper(pill, -54, TILE / 2 - 30, { w: 108, h: 44, kind: 'pill', fill: Color.teal, edge: Color.tealDark, shadow: 3, grain: false, seed: seed + 2 });
    tile.addChild(pill);
    const amount = numberText(34, Color.inkDeep, 'x0');
    amount.position.set(0, TILE / 2 - 8);
    tile.addChild(amount);
    if (r.label) {
      const name = uiLabel(r.label, { size: 24, color: Color.ink });
      fitLabel(name, TILE + GAP - 4, 24);
      name.position.set(0, TILE / 2 + 44);
      tile.addChild(name);
    }

    tile.visible = false;
    const reveal = (): void => {
      tile.visible = true;
      popIn(this.bag, tile, { from: 0.2, duration: 0.34, overshoot: 2.6 });
      audio.playStep(sfxFor(r), index);
      haptic('light');
      const total = r.amount;
      this.bag.run({
        duration: Math.max(0.35, countUpDuration(total) * 1.15),
        ease: Ease.cubicOut,
        onUpdate: (k) => {
          amount.text = 'x' + formatCount(countUpValue(0, total, k));
        },
        onComplete: () => {
          amount.text = 'x' + formatCount(total);
        },
      });
    };
    return { view: tile, desc: r, reveal };
  }

  private sequence(tiles: Tile[], buttons: Button[]): void {
    for (const b of buttons) b.visible = false;
    const start = 0.22;
    const step = motion.reduced ? 0 : 0.16;
    tiles.forEach((t, i) => {
      this.bag.call(start + i * step, t.reveal);
    });
    const at = start + tiles.length * step + 0.12;
    this.bag.call(at, () => {
      buttons.forEach((b, i) => {
        b.visible = true;
        popIn(this.bag, b, { from: 0.6, duration: 0.3, delay: i * 0.08, overshoot: 2.4 });
      });
      const main = buttons[buttons.length - 1];
      if (main && buttons.length > 1) {
        main.startPulse();
        this.bag.call(0.5, () => main.shine());
      }
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.tiles = [];
    this.chooseFn = undefined;
    super.destroy(options);
  }
}

/** Show the reward popup. Resolves with the button the player chose. */
export function showRewards(opts: RewardPopupOpts): Promise<RewardChoice> {
  return popups.open(new RewardPopup(opts));
}


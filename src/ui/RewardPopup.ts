import { Container, FillGradient, Graphics, Sprite, type DestroyOptions, type Texture } from 'pixi.js';
import { audio, type SfxId } from '@/audio';
import { haptic } from '@/core/haptics';
import { TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import { Button } from './Button';
import { countUpDuration, countUpValue, formatCount } from './countUp';
import { drawIcon, type IconName } from './icons';
import { motion, popIn, TweenBag } from './motion';
import { numberText } from './numbers';
import { Panel } from './Panel';
import { Popup, popups } from './Popup';
import { drawGlow, drawPill, glossGradient, vGradient } from './shapes';
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

export interface RewardPopupOpts {
  title: string;
  rewards: readonly RewardDesc[];
  claimLabel: string;
  /** Second, ad-style button ("Claim x2"). Omit for a single Claim button. */
  doubleLabel?: string;
  /** Smaller line under the title. */
  subtitle?: string;
}

const TILE = 148;
const GAP = 22;
const PANEL_W = 640;

interface Tile {
  view: Container;
  reveal: () => void;
}

function sfxFor(r: RewardDesc): SfxId {
  if (r.icon === 'coin') return 'coin';
  if (r.icon === 'gem') return 'gem';
  return 'reward_claim';
}

/**
 * Celebratory reward list. Tiles pop in one by one (a rising chime per tile) while the amounts count
 * up; the buttons arrive after the last tile. Backdrop taps never dismiss it — the player must pick.
 */
export class RewardPopup extends Popup<RewardChoice> {
  private readonly bag = new TweenBag();
  private readonly rays = new Graphics();
  private rayFill: FillGradient | null = null;

  constructor(opts: RewardPopupOpts) {
    super({ dismissResult: 'claim', backdropClose: false, priority: 1, dim: 1.1 });
    const n = opts.rewards.length;
    const cols = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const tileH = TILE + 76;
    const gridH = rows * tileH + (rows - 1) * 6;
    const head = opts.subtitle ? 128 : 100;
    const h = head + gridH + 36 + 112 + 50;
    const panel = new Panel({ width: PANEL_W, height: h, title: opts.title, ribbon: 'primary' });

    // Slowly turning sunburst behind the panel makes the screen feel like an event.
    this.drawRays(Math.max(PANEL_W, h) * 0.62);
    this.rays.position.set(0, -h / 2 + 120);
    this.body.addChild(this.rays, panel);

    if (opts.subtitle) {
      const sub = uiLabel(opts.subtitle, { size: 28, color: 0xcabfee, stroke: Color.outline, strokeWidth: 5, shadow: false });
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
    this.sequence(tiles, buttons);
  }

  private drawRays(r: number): void {
    const g = this.rays;
    const rays = 12;
    // Global-space radial gradient so every wedge fades out with distance from the centre.
    this.rayFill = new FillGradient({
      type: 'radial',
      center: { x: 0, y: 0 },
      innerRadius: 0,
      outerCenter: { x: 0, y: 0 },
      outerRadius: r,
      colorStops: [
        { offset: 0, color: 'rgba(255,226,122,0.85)' },
        { offset: 0.55, color: 'rgba(255,200,90,0.35)' },
        { offset: 1, color: 'rgba(255,190,80,0)' },
      ],
      textureSpace: 'global',
    });
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * TAU;
      const a1 = a0 + (TAU / rays) * 0.42;
      g.poly([0, 0, Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r]).fill(this.rayFill);
    }
    drawGlow(g, 0, 0, r * 0.5, 0xffd45e, 0.5);
    g.blendMode = 'add';
    g.alpha = 0.55;
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
    plate.roundRect(-TILE / 2, -TILE / 2 + 5, TILE, TILE, 28).fill({ color: 0x07030f, alpha: 0.35 });
    plate
      .roundRect(-TILE / 2, -TILE / 2, TILE, TILE, 28)
      .fill(vGradient(rar.light, rar.color))
      .stroke({ width: 5, color: Color.outline, alignment: 1 });
    plate.roundRect(-TILE / 2 + 9, -TILE / 2 + 9, TILE - 18, TILE - 18, 20).fill(vGradient(0x2b1d52, 0x1b1036));
    drawGlow(plate, 0, -4, TILE * 0.46, rar.glow, 0.55);
    plate.roundRect(-TILE / 2 + 12, -TILE / 2 + 11, TILE - 24, 34, 16).fill(glossGradient(0.16, 0));
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
    drawPill(pill, -52, TILE / 2 - 30, 104, 44, { top: 0x4a3a80, bottom: 0x2a1d52, gloss: 0.2, shadow: false });
    tile.addChild(pill);
    const amount = numberText(34, 0xffffff, 'x0');
    amount.position.set(0, TILE / 2 - 8);
    tile.addChild(amount);
    if (r.label) {
      const name = uiLabel(r.label, { size: 24, color: 0xe5defa, stroke: Color.outline, strokeWidth: 4, shadow: false });
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
    return { view: tile, reveal };
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
    super.destroy(options);
    // The gradient owns a GPU texture and is not shared, so it is released with the popup.
    this.rayFill?.destroy();
    this.rayFill = null;
  }
}

/** Show the reward popup. Resolves with the button the player chose. */
export function showRewards(opts: RewardPopupOpts): Promise<RewardChoice> {
  return popups.open(new RewardPopup(opts));
}


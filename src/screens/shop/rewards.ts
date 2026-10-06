import { Container, type DestroyOptions } from 'pixi.js';
import { audio, type SfxId } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { mixColor, TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import { flyIconCount, flyTo } from '@/fx';
import type { BundlePart } from '@/meta/bundle';
import { RARITY_OF } from '@/meta/units';
import {
  Button, Color, countUpDuration, countUpValue, fitLabel, formatCount, motion, numberText, Panel, paperSeed, paperShape, Popup,
  popIn, popups, Rarity, TweenBag, uiLabel,
} from '@/ui';
import { currencyArt, partArt } from './art';
import { getShell } from './context';
import { paperSun } from './paperBits';
import { partAmount, partLabel } from './shopLogic';

const PANEL_W = 640;
const SLOT_W = 188;
const TILE_H = 248;
const ART = 112;
/** Amounts below this show at once: a chest or a cat card counting up from "x0" reads as nothing received. */
const ROLL_FROM = 10;

interface Tile {
  view: Container;
  part: BundlePart;
  amount: number;
  reveal: () => void;
}

function sfxFor(p: BundlePart): SfxId {
  if (p.kind === 'gold') return 'coin';
  if (p.kind === 'gems') return 'gem';
  return 'star';
}

/**
 * "You received": a cream sheet taped to the table with a flat paper sunburst turning behind it. Each reward is a
 * sticker that pops onto the sheet (cats and wild cards as small photo frames) with its amount counting up on a
 * paper strip; one Claim button follows the last sticker, and the currencies fly to the top bar when it is pressed.
 */
class RewardSheet extends Popup<void> {
  private readonly bag = new TweenBag();
  private readonly tiles: Tile[] = [];
  private claimed = false;

  constructor(
    parts: readonly BundlePart[],
    title: string,
    private readonly onClaim: (points: readonly { part: BundlePart; x: number; y: number }[]) => void,
  ) {
    super({ dismissResult: undefined, backdropClose: false, priority: 1, dim: 1.1 });
    const n = parts.length;
    const cols = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const head = 96;
    const h = head + rows * TILE_H + 36 + 112 + 40;
    const panel = new Panel({ width: PANEL_W, height: h, title, ribbon: 'primary', torn: 'bottom', tape: 'pink' });

    const sun = paperSun(Math.max(PANEL_W, h) * 0.62, 14, mixColor(Color.paperLight, Color.mustard, 0.35), 0.2);
    sun.position.set(0, -h / 2 + 150);
    this.body.addChild(sun, panel);
    this.setContentSize(PANEL_W + 48, h + 90);
    if (!motion.reduced) {
      // One whole turn of a fourteen-fold shape per 120 s: the burst turns slowly and the loop has no seam.
      this.bag.run({ duration: 120, repeat: -1, ease: Ease.linear, onUpdate: (k) => (sun.rotation = k * TAU) });
    }

    parts.forEach((part, i) => {
      const inRow = Math.min(cols, n - Math.floor(i / cols) * cols);
      const tile = this.makeTile(part, i);
      tile.view.position.set(PANEL_W / 2 + ((i % cols) - (inRow - 1) / 2) * SLOT_W, head + Math.floor(i / cols) * TILE_H + 78);
      panel.content.addChild(tile.view);
      this.tiles.push(tile);
    });

    const claim = new Button({ label: t('rewards.claim'), style: 'primary', width: 320, height: 112, fontSize: 42 });
    claim.position.set(PANEL_W / 2, h - 40 - 56);
    claim.onTap(() => this.close());
    claim.visible = false;
    panel.content.addChild(claim);

    const step = motion.reduced ? 0 : 0.16;
    this.tiles.forEach((tile, i) => this.bag.call(0.22 + i * step, tile.reveal));
    this.bag.call(0.34 + this.tiles.length * step, () => {
      claim.visible = true;
      popIn(this.bag, claim, { from: 0.6, duration: 0.3, overshoot: 2.4 });
    });
  }

  /** A sticker on a round paper disc, or for a cat a small photo frame, with its amount on a teal strip. */
  private makeTile(part: BundlePart, index: number): Tile {
    const view = new Container();
    const seed = paperSeed();
    const photo = part.kind === 'card' || part.kind === 'wild';
    const rar = photo ? Rarity[part.kind === 'card' ? RARITY_OF[part.unit] : part.rarity] : null;
    if (rar) {
      view.addChild(paperShape({ w: 140, h: 140, radius: 24, fill: Color.paperLight, edge: Color.kraftDark, shadow: 5, grain: false, seed }));
      view.addChild(paperShape({ w: 120, h: 120, radius: 16, fill: rar.light, edge: rar.dark, shadow: false, grain: false, seed: seed + 1 }));
    } else {
      view.addChild(paperShape({ w: 148, h: 148, kind: 'circle', fill: Color.paperLight, edge: Color.kraftDark, shadow: 5, grain: false, seed }));
    }
    const art = part.kind === 'gold' || part.kind === 'gems' || part.kind === 'tickets' ? currencyArt(part.kind, ART) : partArt(part, photo ? 112 : ART);
    art.y = -4;
    view.addChild(art);

    const strip = paperShape({ w: 128, h: 46, kind: 'pill', fill: Color.teal, edge: Color.tealDark, shadow: 3, grain: false, seed: seed + 2 });
    strip.position.set(0, 98);
    const total = partAmount(part);
    const rolls = total >= ROLL_FROM;
    const amount = numberText(36, Color.inkDeep, 'x' + (rolls ? '0' : formatCount(total)));
    amount.position.set(0, 100);
    const label = uiLabel(partLabel(part), { size: 24 });
    fitLabel(label, SLOT_W - 12, 24);
    label.position.set(0, 148);
    view.addChild(strip, amount, label);
    view.visible = false;

    const reveal = (): void => {
      view.visible = true;
      popIn(this.bag, view, { from: 0.2, duration: 0.34, overshoot: 2.6 });
      audio.playStep(sfxFor(part), index);
      haptic('light');
      if (!rolls) return;
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
    return { view, part, amount: total, reveal };
  }

  /** Every way out (the button, Escape, Back) funnels through here, so the claim flight starts exactly once. */
  override close(result?: void): void {
    if (!this.claimed) {
      this.claimed = true;
      this.onClaim(
        this.tiles.map((tile) => {
          const p = tile.view.getGlobalPosition();
          return { part: tile.part, x: p.x, y: p.y };
        }),
      );
    }
    super.close(result);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.tiles.length = 0;
    super.destroy(options);
  }
}

/**
 * The "you received" popup for a bundle. When the player claims, every currency tile sends a few icons
 * flying to the matching spot in the top bar, and the bar is refreshed when the last one lands.
 */
export async function showRewardsPopup(parts: readonly BundlePart[], title?: string): Promise<void> {
  if (parts.length === 0) return;
  const shell = getShell();
  await popups.open(
    new RewardSheet(parts, title ?? t('rewards.title'), (points) => {
      if (!shell) return;
      let pending = 0;
      const landed = (): void => {
        pending--;
        if (pending <= 0) shell.refresh();
      };
      for (const point of points) {
        const p = point.part;
        if (p.kind !== 'gold' && p.kind !== 'gems' && p.kind !== 'tickets') continue;
        const kind = p.kind;
        const from = game.overlayLayer.toLocal({ x: point.x, y: point.y });
        pending++;
        flyTo({
          from: { x: from.x, y: from.y },
          to: shell.currencyAnchor(kind),
          count: flyIconCount(p.n, 8),
          make: (): Container => currencyArt(kind, 48),
          onDone: landed,
        });
      }
      if (pending === 0) shell.refresh();
    }),
  );
}

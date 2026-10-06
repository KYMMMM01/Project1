import { Container, Graphics, Rectangle, type DestroyOptions, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { mixColor } from '@/core/math';
import type { UnitId } from '@/game/api';
import { unitClass, unitRarity, unitRarityIndex } from '@/game/data/roster';
import {
  backOut, bindPress, cacheStatic, Color, drawDashedRect, drawIcon, drawPaper, drawPaperFace, fitLabel, motion, paperSeed, paperShape,
  ProgressBar, Rarity, RARITY_GOLD, tapeStrip, TweenBag, uiLabel, type PressBinding,
} from '@/ui';
import { unitPortrait } from '../shop/art';
import { classIcon } from '../shop/keys';
import { FRAME_H, NAME_H, type CardProgress } from './collection';

export type FrameMode = keyof typeof FRAME_H;

export interface FrameState {
  level: number;
  /** Null for a guardian: it has no cards of its own. */
  progress: CardProgress | null;
  ready: boolean;
}

/**
 * One cat as a compact paper photo frame: cream border, a mat in the rarity colour (rarity also adds an
 * ornament: dashed line, corner mounts, tape, star), the sticker in the window, the level pill, the card bar
 * and an "upgrade ready" sticker; the name sits under the plate on the page. Origin = centre of the plate.
 * Built once; `setState` and `setMarked` update it in place.
 */
export class LineFrame extends Container {
  readonly unit: UnitId;
  readonly plateW: number;
  readonly plateH: number;
  private readonly bag = new TweenBag();
  private readonly body = new Container();
  private readonly marker = new Container();
  private readonly levelPill = new Container();
  private readonly readySticker = new Container();
  private readonly bar: ProgressBar | null;
  private readonly press: PressBinding;
  private readonly mode: FrameMode;
  private levelText: Text | null = null;
  private tapFn: ((unit: UnitId) => void) | null = null;
  private ready = false;
  private stated = false;

  constructor(unit: UnitId, mode: FrameMode, plateW: number, cellW: number) {
    super();
    this.unit = unit;
    this.mode = mode;
    this.plateW = plateW;
    this.plateH = FRAME_H[mode];
    const w = plateW;
    const h = this.plateH;
    const rarity = unitRarity(unit);
    const rar = Rarity[rarity];
    const tier = unitRarityIndex(unit);
    const seed = paperSeed();

    const g = new Graphics();
    const matH = mode === 'card' ? 104 : h - 12;
    const win = { x: -w / 2 + 11, y: -h / 2 + 11, w: w - 22, h: matH - 10 };
    drawPaper(g, -w / 2, -h / 2, { w, h, radius: 18, fill: Color.paperLight, edge: Color.kraftDark, shadow: 5, grain: false, seed });
    drawPaperFace(g, -w / 2 + 6, -h / 2 + 6, { w: w - 12, h: matH, radius: 13, fill: rar.color, edge: rar.dark, grain: false, seed: seed + 1, wobble: 0.7 });
    drawPaperFace(g, win.x, win.y, { ...win, radius: 9, fill: mixColor(rar.light, Color.paper, 0.62), edge: rar.dark, grain: false, seed: seed + 2, wobble: 0.6 });
    // Rarity piles up ornaments, so a tier can be told without colour.
    if (tier >= 1) drawDashedRect(g, -w / 2 + 3.5, -h / 2 + 3.5, w - 7, h - 7, { radius: 15, color: tier === 4 ? RARITY_GOLD : rar.dark, width: 2, dash: 8, gap: 6, alpha: 0.8, seed: seed + 3 });
    if (tier >= 2) {
      const c = 13;
      const mount = tier === 4 ? RARITY_GOLD : rar.dark;
      for (const sx of [-1, 1] as const) {
        for (const [cy, sy] of [[-h / 2 + 6, -1], [-h / 2 + 6 + matH, 1]] as const) {
          const cx = sx * (w / 2 - 6);
          g.poly([cx, cy, cx - sx * c, cy, cx, cy - sy * c]).fill(mount);
        }
      }
    }
    cacheStatic(g);
    this.body.addChild(g);

    const portrait = unitPortrait(unit, rarity, win.h - 2);
    portrait.position.set(win.x + win.w / 2, win.y + win.h / 2 + 2);
    this.body.addChild(portrait);
    if (tier >= 3) {
      const tape = tapeStrip({ name: tier === 3 ? 'yellow' : 'pink', w: w * 0.42, h: w * 0.13, angle: -3, pattern: tier === 3 ? 'dots' : 'gingham', seed });
      tape.position.set(0, -h / 2 + 2);
      this.body.addChild(tape);
    }
    if (tier >= 4) {
      const star = drawIcon('star', w * 0.26, RARITY_GOLD);
      star.position.set(-w / 2 + w * 0.1, -h / 2 + w * 0.08);
      star.rotation = -0.2;
      this.body.addChild(star);
    }

    // A guardian has no cards of its own: its strip is the class mark on a paper pill instead of a bar.
    const guardian = tier === 4;
    this.bar = mode === 'card' && !guardian ? new ProgressBar({ width: w - 24, height: 26, color: 'blue', value: 0, label: '' }) : null;
    if (this.bar) {
      this.bar.position.set(0, h / 2 - 22);
      this.bar.visible = false;
      this.body.addChild(this.bar);
    } else if (mode === 'card') {
      const pill = paperShape({ w: w - 24, h: 26, kind: 'pill', fill: Color.paperDim, edge: Color.kraftDark, shadow: false, grain: false, seed: seed + 9 });
      pill.position.set(0, h / 2 - 22);
      const mark = drawIcon(classIcon(unitClass(unit)), 24);
      mark.position.set(0, h / 2 - 22);
      this.body.addChild(pill, mark);
    }
    this.levelPill.position.set(-w / 2 + 14, -h / 2 + 14);
    this.levelPill.visible = false;
    this.body.addChild(this.levelPill);

    const ready = paperShape({ w: 44, h: 44, kind: 'circle', fill: Color.leaf, edge: Color.leafDark, grain: false, seed: seed + 6 });
    this.readySticker.addChild(ready, drawIcon('arrow_up', 28, Color.inkDeep));
    this.readySticker.position.set(w / 2 - 6, -h / 2 + 6);
    this.readySticker.visible = false;
    this.body.addChild(this.readySticker);

    const name = uiLabel(t(`unit.${unit}.name`), { size: 24 });
    fitLabel(name, cellW - 12, 24);
    name.position.set(0, h / 2 + 24);

    this.marker.visible = false;
    const ring = new Graphics();
    drawDashedRect(ring, -w / 2 - 8, -h / 2 - 8, w + 16, h + 16, { radius: 24, color: Color.teal, width: 3.5, seed: seed + 7 });
    cacheStatic(ring);
    const tape = tapeStrip({ name: 'sky', w: 64, h: 24, angle: 4, pattern: 'dots', seed: seed + 8 });
    tape.position.set(0, -h / 2 - 6);
    this.marker.addChild(ring, tape);

    this.addChild(this.body, this.marker, name);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-cellW / 2, -h / 2 - 12, cellW, h + NAME_H + 12);
    this.press = bindPress(this, {
      down: () => {
        this.bag.killOf(this.body.scale);
        this.body.scale.set(0.95);
      },
      up: (fire) => {
        if (motion.reduced) this.body.scale.set(1);
        else this.bag.to(this.body.scale, { x: 1, y: 1 }, { duration: 0.16, ease: backOut(1.6) });
        if (fire) {
          audio.play('ui_click');
          this.tapFn?.(this.unit);
        }
      },
    });
  }

  onTap(fn: ((unit: UnitId) => void) | null): this {
    this.tapFn = fn;
    return this;
  }

  /** The cat the unit screen is about: a dashed teal ring and a piece of tape. */
  setMarked(on: boolean): void {
    this.marker.visible = on;
  }

  setState(s: FrameState): void {
    this.setLevel(s.level);
    if (this.bar) {
      const p = s.progress;
      this.bar.visible = true;
      if (p) {
        this.bar.setColor(p.maxed ? 'gold' : p.have >= p.needed ? 'green' : 'blue');
        this.bar.setLabel(p.maxed ? t('cats.max') : `${p.have}/${p.needed}`);
        this.bar.setValue(p.needed > 0 ? p.have / p.needed : 1, false);
      }
    }
    if (this.stated && s.ready === this.ready) return;
    const was = this.ready;
    this.ready = s.ready;
    this.stated = true;
    this.readySticker.visible = s.ready && this.mode === 'card';
    if (this.readySticker.visible && !was && !motion.reduced) {
      this.readySticker.scale.set(0);
      this.bag.to(this.readySticker.scale, { x: 1, y: 1 }, { duration: 0.3, ease: backOut(2.8) });
    } else {
      this.readySticker.scale.set(1);
    }
  }

  private setLevel(level: number): void {
    const text = t('cats.lv', { n: level });
    if (this.levelText?.text === text) return;
    for (const c of this.levelPill.removeChildren()) c.destroy({ children: true });
    const label = uiLabel(text, { size: 22 });
    const lw = Math.ceil(label.width) + 20;
    const pill = paperShape({ w: lw, h: 32, kind: 'pill', fill: Color.paperLight, edge: Rarity[unitRarity(this.unit)].dark, shadow: 3, grain: false, seed: 11 });
    this.levelPill.addChild(pill, label);
    this.levelPill.x = -this.plateW / 2 + 8 + lw / 2;
    this.levelPill.visible = this.mode === 'card';
    this.levelText = label;
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.press.dispose();
    this.tapFn = null;
    super.destroy(options);
  }
}

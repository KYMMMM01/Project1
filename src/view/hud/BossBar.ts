/**
 * Boss / elite strip: a wide torn paper strip with the boss sticker over its left end, the name, the
 * time left, a health bar with a ghost trail and an estimated kill time computed from the damage dealt
 * over the last five seconds. It takes over the preview and toy area of the top area's second row (the walkway
 * runs right under the top area, so nothing may hang below it) and marks the estimate on the
 * countdown bar, which is the time limit during such waves.
 */
import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { enemyDef, type EnemyId, type EnemyState } from '@/game';
import {
  Color,
  drawIcon,
  drawPaper,
  fitLabel,
  motion,
  paperSeed,
  paperShape,
  ProgressBar,
  TweenBag,
  uiLabel,
  type IconName,
} from '@/ui';
import type { HudEnv } from './env';
import { enemyPortrait } from './kit';
import { DamageWindow, killTone, type KillTone } from './killEstimate';
import { topRects, type Rect } from './layoutMath';
import type { TopBar } from './TopBar';

/** Estimates beyond this many seconds read "99s or more" instead of a number nobody can use. */
const EST_FAR = 99;
const STICKER = 78;
/** Text starts right of the sticker; the torn right end keeps its own margin. */
const TEXT_X = 54;
const RIGHT_PAD = 28;
const ROW_Y = 25;
const HP_Y = 55;

/** The paper each kill-time verdict sits on, with a glyph so the colour is never the only cue. */
const TONE_PAPER: Record<KillTone, number> = { green: Color.leaf, amber: Color.mustard, red: Color.coral };
const TONE_ICON: Record<KillTone, IconName> = { green: 'check', amber: 'clock', red: 'warning' };

export class BossBar {
  readonly root = new Container();
  private readonly bag = new TweenBag();
  private readonly back = new Container();
  private readonly nameT: Text;
  private readonly estT: Text;
  private readonly timeT: Text;
  private readonly clock = drawIcon('clock', 24);
  private readonly mark = new Graphics();
  private readonly hp: ProgressBar;
  private readonly seed = paperSeed();
  private nameFull = '';
  private sticker: Container | null = null;
  private estBadge: Container | null = null;
  private estTone: KillTone | null = null;
  private readonly window = new DamageWindow();
  private boss: EnemyState | null = null;
  /** The boss just died: the strip lingers for the death staging and must not restart for it. */
  private finishing = false;
  private shown = false;
  private hpDirty = false;
  private lastMarker = -2;
  private lastEst = '';
  private lastLeft = -1;
  private rect: Rect;
  private timer: Rect;

  constructor(
    private readonly env: HudEnv,
    private readonly top: TopBar,
  ) {
    const r = topRects(env.layout());
    this.rect = r.boss;
    this.timer = r.timer;
    this.root.visible = false;
    this.hp = new ProgressBar({ width: this.rect.w - TEXT_X - RIGHT_PAD, height: 24, color: 'red', ghost: true, value: 1 });
    this.nameT = uiLabel('', { size: 26, anchorX: 0, align: 'left' });
    this.estT = uiLabel('', { size: 24, anchorX: 1, align: 'right' });
    this.timeT = uiLabel('', { size: 24, anchorX: 1, align: 'right' });
    this.root.addChild(this.back, this.hp, this.nameT, this.timeT, this.clock, this.estT, this.mark);

    const b = env.battle;
    env.on(b.events, 'hit', ({ enemy, amount }) => {
      if (enemy !== this.boss) return;
      this.window.record(b.time, amount);
      this.hpDirty = true;
    });
    env.on(b.events, 'heal', ({ enemy }) => {
      if (enemy === this.boss) this.hpDirty = true;
    });
    env.on(b.events, 'enemyDie', ({ enemy }) => {
      if (enemy === this.boss) this.finish();
    });
    env.on(b.events, 'defeat', () => this.hide(false));
    env.on(b.events, 'waveEnd', () => {
      if (this.shown && !this.boss) this.hide(true);
    });
    this.place();
    // Restored runs and late construction: a boss may already be on the field.
    if (b.boss) this.begin(b.boss, false);
  }

  private begin(enemy: EnemyState, animate = true): void {
    this.boss = enemy;
    this.finishing = false;
    const def = enemyDef(enemy.id);
    this.nameFull = t(def.nameKey);
    this.sticker?.destroy({ children: true });
    this.sticker = enemyPortrait(enemy.id, STICKER);
    this.root.addChild(this.sticker);
    this.window.reset(this.env.battle.time);
    this.lastMarker = -2;
    this.lastEst = '';
    this.lastLeft = -1;
    this.estTone = null;
    this.bag.killKeyed(this.root);
    this.shown = true;
    this.top.setBossMode(true);
    this.root.visible = true;
    this.root.alpha = 1;
    this.place();
    if (!animate || motion.reduced) {
      this.hp.setValue(this.hpFraction(), false);
      return;
    }
    this.hp.setValue(0, false);
    this.root.alpha = 0;
    this.bag.runKeyed(this.root, {
      duration: 0.3,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.root.alpha = k;
        this.root.y = this.rect.y + 14 * (1 - k);
      },
      onComplete: () => {
        this.root.y = this.rect.y;
        this.hp.setValue(this.hpFraction(), true);
      },
    });
  }

  /**
   * The strip dressed for the elite or boss the coming wave brings, handed back hidden: the warm-up draws it once ahead of time, so the
   * frame the big one arrives in does not pay for the strip's first draw (the torn paper, the bar, the name, the sticker). Null while a strip is up.
   */
  dress(id: EnemyId): Container | null {
    if (this.shown || this.finishing) return null;
    this.nameFull = t(enemyDef(id).nameKey);
    this.sticker?.destroy({ children: true });
    this.sticker = enemyPortrait(id, STICKER);
    this.root.addChild(this.sticker);
    this.timeT.text = t('hud.secs', { s: Math.ceil(this.env.battle.waveDuration) });
    this.estT.text = t('hud.est.wait');
    this.place();
    return this.root;
  }

  private hpFraction(): number {
    const e = this.boss;
    if (!e) return 0;
    const total = e.maxHp + e.maxShield;
    return total > 0 ? Math.max(0, (e.hp + e.shield) / total) : 0;
  }

  private finish(): void {
    this.hp.setValue(0, true);
    this.boss = null;
    this.finishing = true;
    this.mark.clear();
    // The director stages the death; the strip lingers for it and then leaves.
    this.bag.call(1.4, () => this.hide(true));
  }

  private hide(animate: boolean): void {
    if (!this.shown) return;
    this.shown = false;
    this.boss = null;
    this.finishing = false;
    this.mark.clear();
    this.top.setBossMode(false);
    this.bag.killKeyed(this.root);
    if (!animate || motion.reduced) {
      this.root.visible = false;
      return;
    }
    this.bag.runKeyed(this.root, {
      duration: 0.25,
      ease: Ease.cubicIn,
      onUpdate: (k) => (this.root.alpha = 1 - k),
      onComplete: () => {
        this.root.visible = false;
        this.root.alpha = 1;
      },
    });
  }

  /** Position the strip and lay out its parts for the current rectangles. */
  private place(): void {
    const { w, h } = this.rect;
    this.root.position.set(this.rect.x, this.rect.y);
    for (const c of this.back.removeChildren()) c.destroy({ children: true });
    this.back.addChild(paperShape({ w, h, radius: 10, fill: Color.paper, torn: ['right'], seed: this.seed, grain: false }));
    this.back.position.set(w / 2, h / 2);
    this.hp.position.set(TEXT_X + (w - TEXT_X - RIGHT_PAD) / 2, HP_Y);
    this.sticker?.position.set(6, h / 2 - 2);
    this.nameT.position.set(TEXT_X, ROW_Y);
    this.mark.position.set(this.timer.x + this.timer.w / 2 - this.rect.x, this.timer.y + this.timer.h / 2 - this.rect.y);
    this.layoutRow();
  }

  /** The top row, right to left: kill estimate with its verdict, the time left with a clock, and the name in what remains. */
  private layoutRow(): void {
    const right = this.rect.w - RIGHT_PAD;
    this.estT.position.set(right, ROW_Y);
    const badgeX = right - this.estT.width - 22;
    this.estBadge?.position.set(badgeX, ROW_Y);
    this.timeT.position.set(badgeX - 30, ROW_Y);
    this.clock.position.set(badgeX - 30 - this.timeT.width - 18, ROW_Y);
    this.nameT.text = this.nameFull;
    fitLabel(this.nameT, this.clock.x - 14 - TEXT_X, 26, 0.7);
  }

  /** Marker on the countdown bar: the bar will have shrunk to here when the boss dies at today's rate. */
  private drawMark(frac: number, tone: KillTone | null): void {
    const g = this.mark.clear();
    if (frac < 0) return;
    const { w, h } = this.timer;
    const x = -w / 2 + 5 + frac * (w - 10);
    const color = tone ? TONE_PAPER[tone] : Color.paper;
    g.rect(x - 1.5, -h / 2 + 2, 3, h - 4).fill({ color: Color.ink, alpha: 0.75 });
    g.poly([x - 9, h / 2 + 11, x + 9, h / 2 + 11, x, h / 2 - 1]).fill(color).stroke({ width: 3, color: Color.ink, join: 'round' });
  }

  private setEst(text: string, tone: KillTone | null): void {
    let moved = false;
    if (text !== this.lastEst) {
      this.lastEst = text;
      this.estT.text = text;
      moved = true;
    }
    if (tone !== this.estTone) {
      moved = true;
      this.estTone = tone;
      this.estBadge?.destroy({ children: true });
      this.estBadge = null;
      if (tone) {
        const badge = new Container();
        const g = new Graphics();
        drawPaper(g, -17, -17, { w: 34, h: 34, kind: 'circle', fill: TONE_PAPER[tone], shadow: 3, grain: false, seed: this.seed + 5 });
        badge.addChild(g, drawIcon(TONE_ICON[tone], 24));
        this.root.addChild(badge);
        this.estBadge = badge;
      }
    }
    if (moved) this.layoutRow();
  }

  layout(): void {
    const r = topRects(this.env.layout());
    this.rect = r.boss;
    this.timer = r.timer;
    this.place();
    this.lastMarker = -2;
  }

  update(): void {
    const b = this.env.battle;
    // The simulation assigns `boss` right after the spawn event, so the strip looks for it on the frame clock.
    if (b.boss && b.boss !== this.boss && !this.finishing) this.begin(b.boss);
    if (!this.shown) return;
    if (this.hpDirty) {
      this.hpDirty = false;
      this.hp.setValue(this.hpFraction(), true);
    }
    if (!this.boss) return;
    const limit = Math.max(0.001, b.waveDuration);
    const left = Math.max(0, limit - Math.min(limit, b.waveTime));
    const seconds = Math.ceil(left);
    if (seconds !== this.lastLeft) {
      this.lastLeft = seconds;
      this.timeT.text = t('hud.secs', { s: seconds });
      this.layoutRow();
    }
    const est = this.window.estimate(b.time, this.boss.hp + this.boss.shield);
    const known = est >= 0;
    const tone = known ? killTone(est, left) : null;
    // The timer shows time left: the kill lands where the bar will stand after `est` more seconds.
    const frac = known && Number.isFinite(est) ? Math.max(0, (left - est) / limit) : -1;
    if (Math.abs(frac - this.lastMarker) > 0.002 || tone !== this.estTone) {
      this.lastMarker = frac;
      this.drawMark(frac, tone);
    }
    const text = !known ? t('hud.est.wait') : !Number.isFinite(est) ? t('hud.est.none') : est > EST_FAR ? t('hud.est.far') : t('hud.est', { s: Math.ceil(est) });
    this.setEst(text, tone);
  }

  destroy(): void {
    this.bag.killAll();
    this.root.destroy({ children: true });
  }
}

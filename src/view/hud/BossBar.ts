/**
 * Boss / elite strip: name and health with a ghost trail, plus an estimated kill time computed from
 * the damage dealt over the last five seconds. It takes over the preview and toy area of the top
 * area's second row (the walkway runs right under the top area, so nothing may hang below it) and
 * marks the estimate on the wave timer, which is the time limit during such waves.
 */
import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { enemyDef, type EnemyState } from '@/game';
import { Color, drawIcon, fitLabel, motion, ProgressBar, TweenBag, uiLabel, type IconName } from '@/ui';
import type { HudEnv } from './env';
import { DamageWindow, killTone, type KillTone } from './killEstimate';
import { topRects, type Rect } from './layoutMath';
import type { TopBar } from './TopBar';

/** Estimates beyond this many seconds read "99s or more" instead of a number nobody can use. */
const EST_FAR = 99;
const PAD = 14;
const ROW_Y = 21;

const TONE_COLOR: Record<KillTone, number> = { green: Color.success, amber: Color.primary, red: Color.danger };
const TONE_ICON: Record<KillTone, IconName> = { green: 'check', amber: 'clock', red: 'warning' };

export class BossBar {
  readonly root = new Container();
  private readonly bag = new TweenBag();
  private readonly back = new Graphics();
  private readonly nameT: Text;
  private readonly tagT: Text;
  private readonly estT: Text;
  private readonly mark = new Graphics();
  private readonly hp: ProgressBar;
  private icon: Container | null = null;
  private estIcon: Container | null = null;
  private estTone: KillTone | null = null;
  private readonly window = new DamageWindow();
  private boss: EnemyState | null = null;
  /** The boss just died: the strip lingers for the death staging and must not restart for it. */
  private finishing = false;
  private shown = false;
  private hpDirty = false;
  private lastMarker = -2;
  private lastEst = '';
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
    this.hp = new ProgressBar({ width: this.rect.w - PAD * 2, height: 26, color: 'red', ghost: true, value: 1 });
    this.nameT = uiLabel('', { size: 26, anchorX: 0, align: 'left', strokeWidth: 4, shadow: false });
    this.tagT = uiLabel('', { size: 22, anchorX: 1, align: 'right', color: Color.gold, strokeWidth: 4, shadow: false });
    this.estT = uiLabel('', { size: 24, anchorX: 1, align: 'right', strokeWidth: 4, shadow: false });
    this.root.addChild(this.back, this.hp, this.nameT, this.tagT, this.estT, this.mark);

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
    const isBoss = def.traits.includes('boss');
    this.nameT.text = t(def.nameKey);
    this.tagT.text = t(isBoss ? 'trait.boss.name' : 'trait.elite.name');
    this.icon?.destroy();
    this.icon = drawIcon(isBoss ? 'skull' : 'warning', 30);
    this.root.addChild(this.icon);
    this.window.reset(this.env.battle.time);
    this.lastMarker = -2;
    this.lastEst = '';
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
    this.back.clear().roundRect(0, 0, w, h, 22).fill({ color: Color.bgDeep, alpha: 0.9 }).stroke({ width: 4, color: Color.outline });
    this.back.roundRect(4, 4, w - 8, h - 8, 18).stroke({ width: 2, color: Color.neutral, alpha: 0.35 });
    this.hp.position.set(w / 2, h - 22);
    this.icon?.position.set(PAD + 12, ROW_Y);
    this.nameT.position.set(PAD + 32, ROW_Y);
    this.tagT.position.set(w - PAD - 4, ROW_Y);
    this.estT.position.set(w - PAD - 4 - this.tagT.width - 22, ROW_Y);
    this.mark.position.set(this.timer.x + this.timer.w / 2 - this.rect.x, this.timer.y + this.timer.h / 2 - this.rect.y);
    fitLabel(this.nameT, w - PAD * 2 - 32 - this.tagT.width - 170, 26, 0.7);
    this.estIcon?.position.set(this.estT.x - this.estT.width - 18, ROW_Y);
  }

  /** Marker on the wave timer: the bar will have shrunk to here when the boss dies at today's rate. */
  private drawMark(frac: number, tone: KillTone | null): void {
    const g = this.mark.clear();
    if (frac < 0) return;
    const { w, h } = this.timer;
    const x = -w / 2 + 5 + frac * (w - 10);
    const color = tone ? TONE_COLOR[tone] : Color.white;
    g.poly([x - 9, h / 2 + 11, x + 9, h / 2 + 11, x, h / 2 - 1]).fill(color).stroke({ width: 3, color: Color.outline, join: 'round' });
    g.rect(x - 1.5, -h / 2 + 2, 3, h - 4).fill({ color: Color.white, alpha: 0.9 });
  }

  private setEst(text: string, tone: KillTone | null): void {
    if (text !== this.lastEst) {
      this.lastEst = text;
      this.estT.text = text;
    }
    if (tone !== this.estTone) {
      this.estTone = tone;
      this.estIcon?.destroy();
      this.estIcon = null;
      this.estT.style.fill = tone ? TONE_COLOR[tone] : Color.textDim;
      if (tone) {
        this.estIcon = drawIcon(TONE_ICON[tone], 26);
        this.root.addChild(this.estIcon);
      }
    }
    this.estIcon?.position.set(this.estT.x - this.estT.width - 18, ROW_Y);
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

/**
 * Boss / elite bar: name and health with a ghost trail, the time-limit bar and an estimated kill time
 * from the damage dealt over the last five seconds. It slides in just under the top area when the
 * wave's boss or elite appears and leaves shortly after it dies.
 */
import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { enemyDef, type EnemyState } from '@/game';
import { Color, drawIcon, fitLabel, motion, ProgressBar, TweenBag, uiLabel, vGradient, type IconName } from '@/ui';
import type { BattleLayout } from '../context';
import type { HudEnv } from './env';
import { DamageWindow, killTone, markerPos, type KillTone } from './killEstimate';
import { bossBarY, HUD_W } from './layoutMath';

const W = 568;
const H = 84;
const BAR_W = 536;
const TIME_W = 372;

const TONE_COLOR: Record<KillTone, number> = { green: 0x4cd964, amber: 0xffb629, red: 0xff4d5e };
const TONE_ICON: Record<KillTone, IconName> = { green: 'check', amber: 'clock', red: 'warning' };

export class BossBar {
  readonly root = new Container();
  private readonly bag = new TweenBag();
  private readonly hp: ProgressBar;
  private readonly nameT: Text;
  private readonly tagT: Text;
  private readonly timeG = new Graphics();
  private readonly timeLabel: Text;
  private readonly estT: Text;
  private estIcon: Container | null = null;
  private estTone: KillTone | null = null;
  private readonly window = new DamageWindow();
  private boss: EnemyState | null = null;
  /** The boss just died: the bar lingers for the death staging and must not restart for it. */
  private finishing = false;
  private shown = false;
  private hpDirty = false;
  private lastFill = -1;
  private lastMarker = -1;
  private lastSecs = -1;
  private lastEst = '';
  private y = 0;

  constructor(private readonly env: HudEnv) {
    this.root.visible = false;
    const back = new Graphics();
    back.roundRect(-W / 2, 0, W, H, 26).fill({ color: Color.bgDeep, alpha: 0.88 }).stroke({ width: 4, color: Color.outline });
    back.roundRect(-W / 2 + 4, 4, W - 8, H - 8, 22).stroke({ width: 2, color: 0x8f7bd8, alpha: 0.35 });
    this.hp = new ProgressBar({ width: BAR_W, height: 36, color: 'red', ghost: true, value: 1 });
    this.hp.position.set(0, 26);
    this.nameT = uiLabel('', { size: 24, anchorX: 0, align: 'left', strokeWidth: 4, shadow: false });
    this.tagT = uiLabel('', { size: 22, anchorX: 1, align: 'right', color: 0xffd54a, strokeWidth: 4, shadow: false });
    this.timeLabel = uiLabel('', { size: 20, strokeWidth: 3, shadow: false });
    this.estT = uiLabel('', { size: 24, anchorX: 1, align: 'right', strokeWidth: 4, shadow: false });
    this.timeG.position.set(0, 0);
    this.root.addChild(back, this.hp, this.nameT, this.tagT, this.timeG, this.timeLabel, this.estT);

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
    // Restored runs and late construction: a boss may already be on the field.
    if (b.boss) this.begin(b.boss, false);
  }

  private begin(enemy: EnemyState, animate = true): void {
    this.boss = enemy;
    this.finishing = false;
    const def = enemyDef(enemy.id);
    this.nameT.text = t(def.nameKey);
    this.tagT.text = t(def.traits.includes('boss') ? 'trait.boss.name' : 'trait.elite.name');
    this.window.reset(this.env.battle.time);
    this.lastFill = this.lastMarker = this.lastSecs = -1;
    this.lastEst = '';
    this.estTone = null;
    this.layoutTexts();
    this.hp.setValue(0, false);
    this.root.visible = true;
    this.shown = true;
    this.root.alpha = 1;
    if (!animate || motion.reduced) {
      this.root.y = this.y;
      this.hp.setValue(this.hpFraction(), false);
      return;
    }
    const y1 = this.y;
    this.root.y = y1 - H - 20;
    this.bag.runKeyed(this.root, {
      duration: 0.4,
      ease: Ease.cubicOut,
      onUpdate: (k) => (this.root.y = y1 - (H + 20) * (1 - k)),
      onComplete: () => this.hp.setValue(this.hpFraction(), true),
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
    // The director stages the death; the bar lingers for it and then slides away.
    this.bag.call(1.4, () => this.hide(true));
  }

  private hide(animate: boolean): void {
    if (!this.shown) return;
    this.shown = false;
    this.boss = null;
    this.finishing = false;
    if (!animate || motion.reduced) {
      this.root.visible = false;
      return;
    }
    const y0 = this.root.y;
    this.bag.runKeyed(this.root, {
      duration: 0.25,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        this.root.y = y0 - (H + 20) * k;
        this.root.alpha = 1 - k;
      },
      onComplete: () => {
        this.root.visible = false;
        this.root.alpha = 1;
      },
    });
  }

  private layoutTexts(): void {
    this.nameT.position.set(-BAR_W / 2 + 18, 27);
    fitLabel(this.nameT, 300, 24, 0.8);
    this.tagT.position.set(BAR_W / 2 - 18, 27);
    this.timeLabel.position.set(-W / 2 + 22 + TIME_W / 2, 69);
    this.estT.position.set(BAR_W / 2, 70);
  }

  private drawTime(fill: number, marker: number, tone: KillTone | null): void {
    const g = this.timeG;
    g.clear();
    const x0 = -W / 2 + 22;
    const y = 60;
    const h = 18;
    g.roundRect(x0, y, TIME_W, h, h / 2).fill(vGradient(0x1b1036, 0x2d1f5c)).stroke({ width: 3, color: Color.outline });
    const fw = Math.max(0, Math.min(1, fill)) * (TIME_W - 6);
    if (fw > 0) {
      const color = tone ? TONE_COLOR[tone] : 0x4da6ff;
      g.roundRect(x0 + 3, y + 3, Math.max(fw, h - 6), h - 6, (h - 6) / 2).fill(color);
    }
    if (marker >= 0) {
      const mx = x0 + 3 + marker * (TIME_W - 6);
      const c = tone ? TONE_COLOR[tone] : 0xffffff;
      g.poly([mx - 9, y - 9, mx + 9, y - 9, mx, y + 3]).fill(c).stroke({ width: 3, color: Color.outline, join: 'round' });
      g.rect(mx - 1.5, y, 3, h).fill({ color: 0xffffff, alpha: 0.9 });
    }
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
    if (this.estIcon) this.estIcon.position.set(this.estT.x - this.estT.width - 20, this.estT.y);
  }

  layout(l: BattleLayout): void {
    this.y = bossBarY(l, H);
    this.root.x = HUD_W / 2;
    if (this.shown) this.root.y = this.y;
    this.layoutTexts();
  }

  update(): void {
    const b = this.env.battle;
    // The simulation assigns `boss` right after the spawn event, so the bar looks for it on the frame clock.
    if (b.boss && b.boss !== this.boss && !this.finishing) this.begin(b.boss);
    if (!this.shown) return;
    if (this.hpDirty) {
      this.hpDirty = false;
      this.hp.setValue(this.hpFraction(), true);
    }
    if (!this.boss) return;
    const limit = Math.max(0.001, b.waveDuration);
    const elapsed = Math.min(limit, b.waveTime);
    const left = Math.max(0, limit - elapsed);
    const remainingHp = this.boss.hp + this.boss.shield;
    const est = this.window.estimate(b.time, remainingHp);
    const known = est >= 0;
    const tone = known ? killTone(est, left) : null;
    const fill = elapsed / limit;
    const marker = known ? markerPos(est, elapsed, limit) : -1;
    if (Math.abs(fill - this.lastFill) > 0.002 || Math.abs(marker - this.lastMarker) > 0.002 || tone !== this.estTone) {
      this.lastFill = fill;
      this.lastMarker = marker;
      this.drawTime(fill, marker, tone);
    }
    const secs = Math.ceil(left);
    if (secs !== this.lastSecs) {
      this.lastSecs = secs;
      this.timeLabel.text = t('hud.secs', { s: secs });
    }
    const text = !known ? t('hud.est.wait') : Number.isFinite(est) ? t('hud.est', { s: Math.ceil(est) }) : t('hud.est.none');
    this.setEst(text, tone);
  }

  destroy(): void {
    this.bag.killAll();
    this.root.destroy({ children: true });
  }
}

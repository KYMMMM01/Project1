/**
 * Boss / elite strip: a wide torn paper strip with the boss sticker over its left end, the name, the
 * time left, a health bar with a ghost trail and an estimated kill time computed from the damage dealt
 * over the last five seconds. It takes over the preview and toy area of the top area's second row (the walkway
 * runs right under the top area, so nothing may hang below it) and marks the estimate on the
 * countdown bar, which is the time limit during such waves.
 */
import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { enemyDef, type EnemyId, type EnemyState } from '@/game';
import { BitePending, biteHoldsOf, biteText, shownHealth, type BiteHolds } from '../biteHold';
import { info } from '../info';
import { BiteMarks } from './BiteMarks';
import { defenceLine, enemyInfo } from './enemyInfo';
import {
  artLabel,
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
import { FishChip } from '../fishArt';
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
/** The defence line sits on the health bar's left end, which is the last part of the bar to drain. */
const DEF_INSET = 12;

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
  private readonly defT: Text;
  private readonly clock = drawIcon('clock', 24);
  private readonly mark = new Graphics();
  private readonly hp: ProgressBar;
  private readonly seed = paperSeed();
  private nameFull = '';
  private sticker: Container | null = null;
  private estBadge: Container | null = null;
  private estTone: KillTone | null = null;
  private readonly window = new DamageWindow();
  /** The gunner's bites: the health the scene holds back until its cork lands, the bites not yet shown, and what they leave on the strip. */
  private readonly holds: BiteHolds;
  private readonly pending = new BitePending();
  /** Made when the first bite is shown: a battle without skills never paints the poster's pictures or adds a child to the strip. */
  private marks: BiteMarks | null = null;
  private lastHeld = 0;
  /**
   * The alchemist's fish (docs/design_skills_v2.md 3.11): a chip on the portrait's lower corner that is pink with a ring that shrinks while the boss is a fish, and
   * a crossed-out fish bone with a ring that counts the lock down while it cannot be turned again. Made when the first fish is announced.
   */
  private fishChip: FishChip | null = null;
  private fishUntil = 0;
  private fishSeconds = 1;
  private lockUntil = 0;
  private lockSeconds = 1;
  private boss: EnemyState | null = null;
  /** The boss just died: the strip lingers for the death staging and must not restart for it. */
  private finishing = false;
  private shown = false;
  private hpDirty = false;
  private lastMarker = -2;
  private lastEst = '';
  /** There is no estimate yet ("Est. ?"): the strip shows none, and the name gets its room (on a narrow screen it was cut: "King Cucum..."). */
  private estWaiting = true;
  /** The estimate's words in full, and shortened ("56s" for "Est. 56s"; null when there is no short form): the short one is used when the name would be cut. */
  private estFull = '';
  private estShort: string | null = null;
  private lastLeft = -1;
  private lastBroken = false;
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
    // A tap on the strip opens the same card as a tap on the wave preview: what the boss is, and the link to its codex page.
    this.root.eventMode = 'static';
    this.root.on('pointerdown', () => this.tapStrip());
    this.hp = new ProgressBar({ width: this.rect.w - TEXT_X - RIGHT_PAD, height: 24, color: 'red', ghost: true, value: 1 });
    this.nameT = uiLabel('', { size: 26, anchorX: 0, align: 'left' });
    this.estT = uiLabel('', { size: 24, anchorX: 1, align: 'right' });
    this.timeT = uiLabel('', { size: 24, anchorX: 1, align: 'right' });
    this.defT = artLabel('', { size: 24, anchorX: 0, align: 'left' });
    this.root.addChild(this.back, this.hp, this.defT, this.nameT, this.timeT, this.clock, this.estT, this.mark);

    const b = env.battle;
    this.holds = biteHoldsOf(b);
    env.on(b.events, 'hit', ({ enemy, amount }) => {
      if (enemy !== this.boss) return;
      this.window.record(b.time, amount);
      this.hpDirty = true;
    });
    env.on(b.events, 'heal', ({ enemy }) => {
      if (enemy === this.boss) this.hpDirty = true;
    });
    // The gunner's bite is no `hit` (it must not count as firepower in the estimate), so it tells the bar its own way. Only a battle with
    // skills has bites to listen for.
    if (b.spOn) {
      env.on(b.events, 'bite', ({ enemy, share, taken, pool }) => {
        if (enemy !== this.boss) return;
        // The bite that brings what the target has given up to the whole pool is the one that closes the case.
        this.pending.add(share, taken, pool, taken >= pool - 1e-9);
        // A bite the scene holds the bar for drops when the cork lands (the held health changes then); one nobody holds drops now.
        if (this.holds.heldOf(enemy.uid, b.time) === 0) this.hpDirty = true;
      });
    }
    // Only a battle with skills has fish to announce.
    if (b.spOn) {
      env.on(b.events, 'status', ({ enemy, kind, duration }) => {
        if (kind === 'fish' && enemy === this.boss) this.fishBegins(duration);
      });
      env.on(b.events, 'fishEnd', ({ enemy, lock }) => {
        if (enemy === this.boss) this.fishEnds(lock);
      });
    }
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
    this.setDefence(enemy.id);
    this.sticker?.destroy({ children: true });
    this.sticker = enemyPortrait(enemy.id, STICKER);
    this.root.addChild(this.sticker);
    if (this.marks) this.root.addChild(this.marks.root);
    this.window.reset(this.env.battle.time);
    this.lastMarker = -2;
    this.lastEst = '';
    this.lastLeft = -1;
    this.estTone = null;
    this.forgetBites();
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
    this.setDefence(id);
    this.sticker?.destroy({ children: true });
    this.sticker = enemyPortrait(id, STICKER);
    this.root.addChild(this.sticker);
    if (this.marks) this.root.addChild(this.marks.root);
    this.timeT.text = t('hud.secs', { s: Math.ceil(this.env.battle.waveDuration) });
    this.estFull = t('hud.est.wait');
    this.estShort = null;
    this.estWaiting = true;
    this.place();
    return this.root;
  }

  /** Armour and ward as numbers on the bar, so it is plain at a glance which kind of damage this one shrugs off. */
  private setDefence(id: EnemyId): void {
    const def = enemyDef(id);
    // An elite with neither has nothing to say here: an all-zero line would only cover the bar.
    this.defT.visible = def.armor > 0 || def.ward > 0;
    this.defT.text = defenceLine(id);
    this.lastBroken = false;
    this.defT.tint = 0xffffff;
  }

  private tapStrip(): void {
    const boss = this.boss;
    if (!boss || this.finishing) return;
    info.tap(`enemy:${boss.id}`, this.back, enemyInfo(boss.id, (foe) => this.env.openCodex(foe)), { prefer: 'below' });
  }

  /** The health the bar shows: the boss's plus whatever the gunner's scene holds back until its cork lands (nothing when no bite is in the air). */
  private shownHealth(): number {
    const e = this.boss;
    if (!e) return 0;
    return shownHealth(e.hp, e.shield, this.holds.heldOf(e.uid, this.env.battle.time), e.maxHp, e.maxShield);
  }

  private hpFraction(): number {
    const e = this.boss;
    if (!e) return 0;
    const total = e.maxHp + e.maxShield;
    return total > 0 ? Math.max(0, this.shownHealth() / total) : 0;
  }

  private makeMarks(): BiteMarks {
    const marks = new BiteMarks();
    this.root.addChild(marks.root);
    marks.layout(6, this.rect.h - 8, this.rect.h / 2 - 8);
    return marks;
  }

  /** A new boss, or none: no bite was taken from it, and none is waiting to be shown. */
  private forgetBites(): void {
    this.pending.reset();
    this.marks?.reset();
    this.lastHeld = 0;
    this.forgetFish();
  }

  /** The boss is a fish for `duration` seconds: the pink chip pops on the portrait's corner. */
  private fishBegins(duration: number): void {
    if (!this.shown) return;
    const now = this.env.battle.time;
    this.fishUntil = now + duration;
    this.fishSeconds = Math.max(0.001, duration);
    this.lockUntil = 0;
    const chip = (this.fishChip ??= new FishChip());
    if (!chip.root.parent) this.root.addChild(chip.root);
    this.placeFish();
    chip.set('fish', 1);
    chip.root.visible = true;
    chip.root.alpha = 1;
    if (motion.reduced) {
      chip.root.scale.set(1);
      return;
    }
    chip.root.scale.set(0.2);
    this.bag.runKeyed(chip.root, { duration: 0.22, ease: Ease.backOut, onUpdate: (k) => chip.root.scale.set(0.2 + 0.8 * k), onComplete: () => chip.root.scale.set(1) });
  }

  /** It wore off: the chip becomes the crossed-out fish bone and counts the lock down. */
  private fishEnds(lock: number): void {
    if (!this.fishChip || !this.shown) return;
    const now = this.env.battle.time;
    this.fishUntil = 0;
    this.lockSeconds = Math.max(0.001, lock);
    this.lockUntil = lock > 0 ? now + lock : 0;
    if (this.lockUntil === 0) this.forgetFish();
    else this.fishChip.set('lock', 1);
  }

  private forgetFish(): void {
    this.fishUntil = 0;
    this.lockUntil = 0;
    if (this.fishChip) {
      this.bag.killKeyed(this.fishChip.root);
      this.fishChip.root.visible = false;
    }
  }

  /** The chip sits on the portrait's lower-right corner: clear of the padlock on its upper one, of the eggs under it and of the name and the bar. */
  private placeFish(): void {
    this.fishChip?.root.position.set(34, this.rect.h / 2 + 26);
  }

  /** The chip's ring follows the battle clock: it stands still under a popup and runs 2x and 3x with the game. */
  private updateFish(now: number): void {
    const chip = this.fishChip;
    if (!chip || !chip.root.visible) return;
    if (this.fishUntil > 0 && now < this.fishUntil) {
      chip.set('fish', (this.fishUntil - now) / this.fishSeconds);
    } else if (this.lockUntil > 0 && now < this.lockUntil) {
      chip.set('lock', (this.lockUntil - now) / this.lockSeconds);
    } else {
      this.forgetFish();
    }
  }

  /** The cork landed (or nothing held the bar): the bites the bar was told of fall out of it now. */
  private showBites(): void {
    const p = this.pending;
    // The label sits on the bar just past the new end of the fill, over the part that drained (never further right than the bar's end, and clear of
    // the estimate above it), and rises a little.
    const barW = this.rect.w - TEXT_X - RIGHT_PAD;
    const edge = TEXT_X + 4 + (barW - 8) * this.hpFraction();
    // ...and never over the defence line that sits on the bar's left end (a long line: the bar of a boss with armour and a ward).
    const half = biteText(p.share).length * 9.5;
    const clear = this.defT.visible ? this.defT.x + this.defT.width + 8 + half : 0;
    this.marks ??= this.makeMarks();
    this.marks.show(p.share, p.taken, p.pool, p.closed, Math.min(TEXT_X + barW - 30, Math.max(edge + 30, clear)), HP_Y + 2);
    p.reset();
    this.layoutRow();
  }

  private finish(): void {
    this.hp.setValue(0, true);
    this.boss = null;
    this.finishing = true;
    this.mark.clear();
    // A fish that dies as a fish takes its chip with it: the ring would stand frozen beside the dead boss's name for the whole linger.
    this.forgetFish();
    // The director stages the death; the strip lingers for it and then leaves.
    this.bag.call(1.4, () => this.hide(true));
  }

  private hide(animate: boolean): void {
    if (!this.shown) return;
    this.shown = false;
    this.boss = null;
    this.finishing = false;
    this.mark.clear();
    this.forgetBites();
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
    this.root.hitArea = new Rectangle(0, 0, w, h);
    this.hp.position.set(TEXT_X + (w - TEXT_X - RIGHT_PAD) / 2, HP_Y);
    this.sticker?.position.set(6, h / 2 - 2);
    this.marks?.layout(6, h - 8, h / 2 - 8);
    this.placeFish();
    this.nameT.position.set(TEXT_X, ROW_Y);
    this.defT.position.set(TEXT_X + DEF_INSET, HP_Y);
    this.mark.position.set(this.timer.x + this.timer.w / 2 - this.rect.x, this.timer.y + this.timer.h / 2 - this.rect.y);
    this.layoutRow();
  }

  /** The top row, right to left: kill estimate with its verdict, the time left with a clock, and the name in what remains (the estimate drops its "Est." before the name is cut). */
  private layoutRow(): void {
    if (this.placeRow(this.estFull) && this.estShort !== null && !this.estWaiting) this.placeRow(this.estShort);
  }

  /** Lays the top row with `est` as the estimate's words; true when the name had to be cut to fit. */
  private placeRow(est: string): boolean {
    const right = this.rect.w - RIGHT_PAD;
    this.estT.text = est;
    this.estT.visible = !this.estWaiting;
    this.estT.position.set(right, ROW_Y);
    // Without an estimate the time stands where the estimate would end.
    const badgeX = this.estWaiting ? right + 30 : right - this.estT.width - 22;
    this.estBadge?.position.set(badgeX, ROW_Y);
    this.timeT.position.set(badgeX - 30, ROW_Y);
    this.clock.position.set(badgeX - 30 - this.timeT.width - 18, ROW_Y);
    this.nameT.text = this.nameFull;
    fitLabel(this.nameT, this.clock.x - 14 - TEXT_X, 26, 0.7);
    return this.nameT.text !== this.nameFull;
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

  private setEst(text: string, short: string | null, tone: KillTone | null, waiting: boolean): void {
    let moved = false;
    if (waiting !== this.estWaiting) {
      this.estWaiting = waiting;
      moved = true;
    }
    if (text !== this.lastEst) {
      this.lastEst = text;
      this.estFull = text;
      this.estShort = short;
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
    // The gunner's scene lets go of the bar when its cork lands: the bite falls out of it then, with its label.
    const held = this.boss ? this.holds.heldOf(this.boss.uid, b.time) : 0;
    if (held !== this.lastHeld) {
      this.lastHeld = held;
      this.hpDirty = true;
    }
    if (this.hpDirty) {
      this.hpDirty = false;
      this.hp.setValue(this.hpFraction(), true);
    }
    if (!this.boss) return;
    this.updateFish(b.time);
    if (held === 0 && this.pending.count > 0) this.showBites();
    // An armour break cuts both numbers for as long as it lasts: the line turns mustard meanwhile.
    if (this.boss.armorBroken !== this.lastBroken) {
      this.lastBroken = this.boss.armorBroken;
      this.defT.tint = this.lastBroken ? Color.mustard : 0xffffff;
    }
    const limit = Math.max(0.001, b.waveDuration);
    const left = Math.max(0, limit - Math.min(limit, b.waveTime));
    const seconds = Math.ceil(left);
    if (seconds !== this.lastLeft) {
      this.lastLeft = seconds;
      this.timeT.text = t('hud.secs', { s: seconds });
      this.layoutRow();
    }
    // The bite is no `hit`, so the firepower this reads is untouched; the health it divides by falls with the bar, when the cork lands.
    const est = this.window.estimate(b.time, this.shownHealth());
    const known = est >= 0;
    const tone = known ? killTone(est, left) : null;
    // The timer shows time left: the kill lands where the bar will stand after `est` more seconds.
    const frac = known && Number.isFinite(est) ? Math.max(0, (left - est) / limit) : -1;
    if (Math.abs(frac - this.lastMarker) > 0.002 || tone !== this.estTone) {
      this.lastMarker = frac;
      this.drawMark(frac, tone);
    }
    const text = !known ? t('hud.est.wait') : !Number.isFinite(est) ? t('hud.est.none') : est > EST_FAR ? t('hud.est.far') : t('hud.est', { s: Math.ceil(est) });
    const short = !known || !Number.isFinite(est) ? null : est > EST_FAR ? t('hud.est.farShort') : t('hud.est.short', { s: Math.ceil(est) });
    this.setEst(text, short, tone, !known);
  }

  destroy(): void {
    this.bag.killAll();
    this.marks?.destroy();
    this.fishChip?.destroy();
    this.root.destroy({ children: true });
  }
}

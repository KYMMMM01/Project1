/**
 * The big chapter card at the top of the battle tab, a page of a scrapbook: the chapter as a taped
 * photo with its boss as a sticker, previous / next buttons and page dots, the calendar button, and
 * the butler-level tags with the rule the picked level adds written in a speech bubble below them.
 */
import { Container, Graphics, Rectangle, type DestroyOptions, type FederatedPointerEvent } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { MAX_STAKE, stakeText } from '@/game';
import { profile } from '@/meta';
import {
  Button,
  Color,
  IconButton,
  PaperLabel,
  Tag,
  TweenBag,
  backOut,
  cacheStatic,
  drawDashedRect,
  drawIcon,
  drawPaper,
  drawSpeechBubble,
  motion,
  paperSeed,
  toast,
  uiLabel,
} from '@/ui';
import { ChapterPhoto, bossSticker, chapterInfo } from './ChapterPhoto';
import { CHAPTER_COUNT, STAKE_COUNT, bestStake, chapterUnlocked, clampSelection, stakePlayable, stakeTagState, type Selection } from './model';
import './strings';

const W = 672;
const PAD = 26;
const FRAME_W = W - PAD * 2;
const FRAME_Y = 30;
const FRAME_H = 316;
const DOTS_Y = FRAME_Y + FRAME_H + 34;
const CHIP_Y = FRAME_Y + FRAME_H + 62;
const CHIP_H = 92;
const BUBBLE_Y = CHIP_Y + CHIP_H + 22;
const BUBBLE_H = 118;
export const CHAPTER_CARD_H = BUBBLE_Y + BUBBLE_H + 28;
const SWIPE_MIN = 90;
const BOSS_BOX = 176;

export interface ChapterCardHandlers {
  onChange(selection: Selection): void;
  onCalendar(): void;
}

/** What one chapter shows: the print, its labels and the boss; a locked chapter gets a kraft veil with a lock (the speech bubble below says why, once). */
function buildArt(chapter: number, unlocked: boolean, best: number): Container {
  const art = new Container();
  const photo = new ChapterPhoto({ w: FRAME_W, h: FRAME_H, chapter, tape: 'sky', tilt: -0.012 });
  photo.position.set(PAD, FRAME_Y);
  art.addChild(photo);

  if (!unlocked) {
    const veil = new Graphics().rect(PAD + 10, FRAME_Y + 10, FRAME_W - 20, FRAME_H - 20).fill({ color: Color.kraft, alpha: 0.84 });
    const lock = drawIcon('lock', 104);
    lock.position.set(W / 2, FRAME_Y + FRAME_H / 2);
    art.addChild(veil, lock);
  }

  const boss = bossSticker(chapter, BOSS_BOX, BOSS_BOX, !unlocked);
  boss.position.set(W - PAD - BOSS_BOX / 2 - 12, FRAME_Y + FRAME_H + 22);
  art.addChild(boss);

  const kicker = new PaperLabel({ text: t('battle.chapter', { n: chapter }), size: 26, paper: 'info', padX: 22, padY: 8 });
  kicker.position.set(PAD + 14 - kicker.uiBox.x, FRAME_Y + 34);
  art.addChild(kicker);

  if (unlocked) {
    const tag = new Tag({
      text: best >= 0 ? t('battle.best', { n: best }) : t('battle.best.none'),
      style: best >= 0 ? 'success' : 'neutral',
      shape: 'pill',
      fontSize: 24,
    });
    tag.position.set(PAD + 16 + tag.uiBox.w / 2, FRAME_Y + 84);
    art.addChild(tag);
  }

  const name = new PaperLabel({ text: t(chapterInfo(chapter).nameKey), size: 44, paper: 'mustard', maxWidth: 360, padX: 30 });
  name.position.set(PAD + 12 - name.uiBox.x, FRAME_Y + FRAME_H - 40);
  art.addChild(name);
  return art;
}

/** A round green "cleared" stamp that sits on a tag's corner. */
function buildStamp(): Container {
  const stamp = new Container();
  const g = new Graphics();
  drawPaper(g, -19, -19, { w: 38, h: 38, kind: 'circle', fill: Color.leaf, edge: Color.leafDark, shadow: 3, grain: false, seed: paperSeed() });
  stamp.addChild(g, drawIcon('check', 24));
  stamp.rotation = 0.2;
  return stamp;
}

export class ChapterCard extends Container {
  private readonly bag = new TweenBag();
  private readonly seed = paperSeed();
  private readonly swipe = new Container();
  private readonly dots = new Graphics();
  private readonly bubble = new Graphics();
  /** Where the bubble's tail is drawn now (card space); -1 until the first draw. */
  private tipX = -1;
  private readonly prev = new IconButton({ icon: 'back', style: 'neutral', size: 80 });
  private readonly next = new IconButton({ icon: 'back', style: 'neutral', size: 80 });
  private readonly calendar = new IconButton({ icon: 'calendar', style: 'info', size: 80 });
  private readonly chips: Button[] = [];
  private readonly stamps: Container[] = [];
  private readonly chipW = (W - PAD * 2 - 10 * MAX_STAKE) / STAKE_COUNT;
  private readonly ruleText = uiLabel('', { size: 26, anchorX: 0, align: 'left', wrap: W - 56 - 56 });
  private art: Container | null = null;
  private artKey = '';
  private sel: Selection = { chapter: 1, stake: 0 };
  private swipeFrom: { x: number; y: number } | null = null;

  constructor(private readonly handlers: ChapterCardHandlers) {
    super();
    const sheet = new Graphics();
    drawPaper(sheet, 0, 0, { w: W, h: CHAPTER_CARD_H, radius: 34, fill: Color.paper, seed: this.seed });
    drawDashedRect(sheet, 12, 12, W - 24, CHAPTER_CARD_H - 24, { radius: 26, seed: this.seed });
    cacheStatic(sheet);
    this.addChild(sheet);

    this.swipe.eventMode = 'static';
    this.swipe.hitArea = new Rectangle(PAD, FRAME_Y, FRAME_W, FRAME_H);
    this.swipe.on('pointerdown', this.onDown);
    this.swipe.on('pointerup', this.onUp);
    this.swipe.on('pointerupoutside', this.onUp);
    this.addChild(this.swipe);

    this.prev.position.set(PAD + 56, FRAME_Y + 168);
    this.next.position.set(W - PAD - 56, FRAME_Y + 168);
    this.next.scale.x = -1;
    this.prev.onTap(() => this.step(-1));
    this.next.onTap(() => this.step(1));
    this.calendar.position.set(W - PAD - 56, FRAME_Y + 58);
    this.calendar.onTap(() => handlers.onCalendar());
    this.addChild(this.prev, this.next, this.calendar);

    const caption = new PaperLabel({ text: t('battle.stake.row'), size: 24, paper: 'kraft', padX: 22, padY: 7 });
    caption.position.set(PAD + 8 - caption.uiBox.x, DOTS_Y);
    this.addChild(this.dots, caption);

    for (let s = 0; s < STAKE_COUNT; s++) {
      const chip = new Button({ label: String(s), width: this.chipW, height: CHIP_H, fontSize: 44, radius: 20, style: 'neutral', sfx: 'ui_click' });
      chip.position.set(PAD + this.chipW / 2 + s * (this.chipW + 10), CHIP_Y + CHIP_H / 2);
      chip.onTap(() => this.pick(s));
      chip.onDisabledTap(() => toast(t('battle.stake.locked'), 'info'));
      const stamp = buildStamp();
      stamp.position.set(this.chipW / 2 - 12, -CHIP_H / 2 + 10);
      stamp.visible = false;
      chip.addChild(stamp);
      this.chips.push(chip);
      this.stamps.push(stamp);
    }
    this.ruleText.position.set(28 + 28, BUBBLE_Y + BUBBLE_H / 2 + 2);
    this.addChild(this.bubble, this.ruleText, ...this.chips);
  }

  get calendarButton(): IconButton {
    return this.calendar;
  }

  get selection(): Selection {
    return this.sel;
  }

  /** Point the card at a selection (clamped to what the player may start) and redraw. */
  setSelection(next: Selection, animate: boolean): void {
    const clamped = clampSelection(profile.data.cleared, next);
    const dir = clamped.chapter === this.sel.chapter ? 0 : clamped.chapter > this.sel.chapter ? 1 : -1;
    this.sel = clamped;
    this.showArt(dir, animate);
    this.refreshChips();
    this.refreshRule(animate && dir === 0);
    this.drawDots();
  }

  /** Re-read what is cleared (after a run, a sweep): tags, stamps and the best-level tag. */
  sync(): void {
    this.sel = clampSelection(profile.data.cleared, this.sel);
    this.showArt(0, false);
    this.refreshChips();
    this.refreshRule(false);
    this.drawDots();
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }

  private step(delta: number): void {
    const chapter = this.sel.chapter + delta;
    if (chapter < 1 || chapter > CHAPTER_COUNT) {
      audio.play('ui_error');
      return;
    }
    audio.play('ui_tab');
    haptic('light');
    this.setSelection({ chapter, stake: 0 }, true);
    this.handlers.onChange(this.sel);
  }

  private pick(stake: number): void {
    if (stake === this.sel.stake) return;
    this.sel = { ...this.sel, stake };
    this.refreshChips();
    this.refreshRule(true);
    this.handlers.onChange(this.sel);
  }

  private readonly onDown = (e: FederatedPointerEvent): void => {
    this.swipeFrom = { x: e.globalX, y: e.globalY };
  };

  private readonly onUp = (e: FederatedPointerEvent): void => {
    const from = this.swipeFrom;
    this.swipeFrom = null;
    if (!from) return;
    const dx = e.globalX - from.x;
    const dy = e.globalY - from.y;
    // Pointer coordinates are screen pixels; the threshold is in design pixels.
    if (Math.abs(dx) > SWIPE_MIN * game.scale && Math.abs(dx) > Math.abs(dy) * 1.6) this.step(dx < 0 ? 1 : -1);
  };

  /** Build the page for the current chapter unless it is already showing; a chapter change slides the old page out. */
  private showArt(dir: number, animate: boolean): void {
    const cleared = profile.data.cleared;
    const { chapter } = this.sel;
    const unlocked = chapterUnlocked(cleared, chapter);
    const best = bestStake(cleared, chapter);
    const key = `${chapter}|${unlocked ? 1 : 0}|${best}`;
    this.prev.visible = chapter > 1;
    this.next.visible = chapter < CHAPTER_COUNT;
    if (key === this.artKey && this.art) return;
    this.artKey = key;
    const fresh = buildArt(chapter, unlocked, best);
    const old = this.art;
    this.art = fresh;
    this.swipe.addChild(fresh);
    if (!old) return;
    if (!animate || motion.reduced || dir === 0) {
      old.destroy({ children: true });
      return;
    }
    fresh.alpha = 0;
    fresh.x = dir * 70;
    this.bag.to(fresh, { alpha: 1, x: 0 }, { duration: 0.26, ease: Ease.cubicOut });
    this.bag.to(old, { alpha: 0, x: -dir * 70 }, { duration: 0.2, ease: Ease.cubicIn, onComplete: () => old.destroy({ children: true }) });
  }

  private refreshChips(): void {
    const cleared = profile.data.cleared;
    const { chapter, stake } = this.sel;
    for (let s = 0; s < this.chips.length; s++) {
      const chip = this.chips[s] as Button;
      const state = stakeTagState(cleared, chapter, s, stake);
      chip.setEnabled(state !== 'locked');
      chip.setStyle(state === 'selected' ? 'primary' : state === 'open' ? 'mustard' : 'neutral');
      (this.stamps[s] as Container).visible = s < (cleared[chapter - 1] ?? 0) && stakePlayable(cleared, chapter, s);
    }
  }

  /** The bubble under the tags: the rule the picked level adds, with its tail pointing at that tag. */
  private refreshRule(animate: boolean): void {
    const { chapter, stake } = this.sel;
    const open = chapterUnlocked(profile.data.cleared, chapter);
    const text = !open ? t('battle.chapter.locked') : stake === 0 ? t('battle.stake.base') : stakeText(stake);
    const changed = this.ruleText.text !== text;
    this.ruleText.text = text;
    const tipX = PAD + this.chipW / 2 + stake * (this.chipW + 10);
    const from = this.tipX;
    this.bag.killKeyed(this.bubble);
    if (!animate || motion.reduced || from < 0 || from === tipX) {
      this.drawBubble(tipX);
      return;
    }
    // The tail glides to the tag that was picked and the new rule slides in beside it.
    const spring = backOut(1.8);
    this.bag.runKeyed(this.bubble, {
      duration: 0.22,
      ease: Ease.linear,
      onUpdate: (k) => this.drawBubble(from + (tipX - from) * spring(k)),
      onComplete: () => this.drawBubble(tipX),
    });
    if (!changed) return;
    const text0 = this.ruleText;
    const y0 = BUBBLE_Y + BUBBLE_H / 2 + 2;
    this.bag.runKeyed(text0, {
      duration: 0.2,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        text0.alpha = k;
        text0.y = y0 + 10 * (1 - k);
      },
      onComplete: () => {
        text0.alpha = 1;
        text0.y = y0;
      },
    });
  }

  private drawBubble(tipX: number): void {
    this.tipX = tipX;
    const g = this.bubble;
    g.clear();
    drawSpeechBubble(g, 28, BUBBLE_Y, W - 56, BUBBLE_H, { radius: 26, seed: this.seed, tail: { side: 'top', x: tipX - 28, len: 18, half: 15 } });
  }

  private drawDots(): void {
    const g = this.dots;
    g.clear();
    const cleared = profile.data.cleared;
    const gap = 34;
    const x0 = W / 2 - ((CHAPTER_COUNT - 1) * gap) / 2;
    for (let c = 1; c <= CHAPTER_COUNT; c++) {
      const x = x0 + (c - 1) * gap;
      if (c === this.sel.chapter) {
        g.circle(x, DOTS_Y + 3, 11).fill({ color: Color.shadow, alpha: 0.22 });
        g.circle(x, DOTS_Y, 11).fill(Color.coral);
      } else {
        g.circle(x, DOTS_Y, 7).fill({ color: chapterUnlocked(cleared, c) ? Color.kraftDark : Color.kraft, alpha: chapterUnlocked(cleared, c) ? 1 : 0.8 });
      }
    }
  }
}

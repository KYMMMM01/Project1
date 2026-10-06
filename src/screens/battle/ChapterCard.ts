/**
 * The big chapter card at the top of the battle tab: the chapter's background and boss, previous /
 * next navigation (buttons and swipe), the calendar button, and the butler-level selector with the
 * rule each level adds.
 */
import { Container, Graphics, Sprite, type DestroyOptions, type FederatedPointerEvent } from 'pixi.js';
import { audio } from '@/audio';
import { hasTex, tex } from '@/core/assets';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { CHAPTERS, MAX_STAKE, stakeText, type EnemyId } from '@/game';
import { profile } from '@/meta';
import {
  Button,
  Color,
  IconButton,
  Panel,
  Tag,
  TweenBag,
  drawIcon,
  fitLabel,
  gradient,
  motion,
  rgba,
  toast,
  uiLabel,
} from '@/ui';
import { CHAPTER_COUNT, STAKE_COUNT, bestStake, chapterUnlocked, clampSelection, stakePlayable, type Selection } from './model';
import './strings';

const W = 672;
const ART_INSET = 12;
const ART_W = W - ART_INSET * 2;
const ART_H = 368;
const CHIP_Y = ART_INSET + ART_H + 20;
const CHIP_H = 92;
const RULE_Y = CHIP_Y + CHIP_H + 14;
export const CHAPTER_CARD_H = RULE_Y + 76 + 12;
const SWIPE_MIN = 90;

export interface ChapterCardHandlers {
  onChange(selection: Selection): void;
  onCalendar(): void;
}

function bossOf(chapter: number): EnemyId | null {
  return CHAPTERS[chapter - 1]?.boss ?? null;
}

/** One chapter's artwork at the card's art size. */
function buildArt(chapter: number, unlocked: boolean, best: number): Container {
  const info = CHAPTERS[chapter - 1] ?? CHAPTERS[0];
  const art = new Container();
  const base = new Graphics().rect(0, 0, ART_W, ART_H).fill(Color.panelDark);
  art.addChild(base);
  if (info && hasTex(info.background)) {
    const bg = new Sprite(tex(info.background));
    bg.anchor.set(0.5);
    bg.scale.set(Math.max(ART_W / bg.texture.width, ART_H / bg.texture.height));
    bg.position.set(ART_W / 2, ART_H * 0.52);
    art.addChild(bg);
  }
  const left = new Graphics()
    .rect(0, 0, ART_W, ART_H)
    .fill(gradient([[0, rgba(Color.black, 0.72)], [0.55, rgba(Color.black, 0.18)], [1, rgba(Color.black, 0)]], true));
  const floor = new Graphics()
    .rect(0, ART_H - 110, ART_W, 110)
    .fill(gradient([[0, rgba(Color.black, 0)], [1, rgba(Color.black, 0.6)]]));
  art.addChild(left, floor);

  const bossId = bossOf(chapter);
  if (bossId && hasTex(bossId)) {
    const boss = new Sprite(tex(bossId));
    boss.anchor.set(0.5, 1);
    boss.scale.set(Math.min(310 / boss.texture.height, 330 / boss.texture.width));
    boss.position.set(ART_W - 170, ART_H - 22);
    if (!unlocked) boss.tint = Color.black;
    art.addChild(boss);
  } else {
    const skull = drawIcon('skull', 150);
    skull.position.set(ART_W - 170, ART_H / 2 + 10);
    art.addChild(skull);
  }

  const kicker = uiLabel(t('battle.chapter', { n: chapter }), { size: 30, anchorX: 0, color: Color.textDim });
  kicker.position.set(28, 96);
  const name = uiLabel(t(info?.nameKey ?? 'chapter.1.name'), { size: 76, strokeWidth: 10, anchorX: 0 });
  name.position.set(28, 160);
  fitLabel(name, ART_W * 0.5, 76);
  art.addChild(kicker, name);

  if (unlocked) {
    const tag = new Tag({
      text: best >= 0 ? t('battle.best', { n: best }) : t('battle.best.none'),
      style: best >= 0 ? 'success' : 'neutral',
      shape: 'pill',
      fontSize: 26,
    });
    tag.position.set(28 + tag.uiBox.w / 2, 238);
    art.addChild(tag);
  } else {
    const veil = new Graphics().rect(0, 0, ART_W, ART_H).fill({ color: Color.bgDeep, alpha: 0.55 });
    const lock = drawIcon('lock', 96);
    lock.position.set(ART_W / 2, ART_H / 2 - 12);
    const hint = uiLabel(t('battle.chapter.locked'), { size: 28, wrap: ART_W - 220, color: Color.white });
    hint.position.set(ART_W / 2, ART_H / 2 + 70);
    art.addChild(veil, lock, hint);
  }
  return art;
}

export class ChapterCard extends Container {
  private readonly bag = new TweenBag();
  private readonly panel = new Panel({ width: W, height: CHAPTER_CARD_H, variant: 'default', blockInput: false });
  private readonly clip = new Container();
  private readonly clipMask = new Graphics();
  private readonly dots = new Graphics();
  private readonly prev = new IconButton({ icon: 'back', style: 'neutral', size: 76 });
  private readonly next = new IconButton({ icon: 'back', style: 'neutral', size: 76 });
  private readonly calendar = new IconButton({ icon: 'calendar', style: 'info', size: 80 });
  private readonly chips: Button[] = [];
  private readonly checks: Container[] = [];
  private readonly ruleHead = uiLabel('', { size: 24, anchorX: 0, anchorY: 0, color: Color.primary, stroke: false, shadow: false });
  private readonly ruleText = uiLabel('', { size: 26, anchorX: 0, anchorY: 0, stroke: false, shadow: false, align: 'left', wrap: W - 56 });
  private art: Container | null = null;
  private sel: Selection = { chapter: 1, stake: 0 };
  private swipeFrom: { x: number; y: number } | null = null;

  constructor(private readonly handlers: ChapterCardHandlers) {
    super();
    this.panel.position.set(W / 2, CHAPTER_CARD_H / 2);
    this.addChild(this.panel);
    const body = this.panel.content;

    this.clipMask.roundRect(ART_INSET, ART_INSET, ART_W, ART_H, 30).fill(Color.white);
    this.clip.position.set(ART_INSET, ART_INSET);
    this.clip.mask = this.clipMask;
    body.addChild(this.clip, this.clipMask, this.dots);
    this.clip.eventMode = 'static';
    this.clip.on('pointerdown', this.onDown);
    this.clip.on('pointerup', this.onUp);
    this.clip.on('pointerupoutside', this.onUp);

    this.prev.position.set(ART_INSET + 12 + 44, ART_INSET + ART_H / 2 + 20);
    this.next.position.set(ART_INSET + ART_W - 12 - 44, ART_INSET + ART_H / 2 + 20);
    this.next.rotation = Math.PI;
    this.prev.onTap(() => this.step(-1));
    this.next.onTap(() => this.step(1));
    this.calendar.position.set(ART_INSET + ART_W - 24 - 40, ART_INSET + 24 + 44);
    this.calendar.onTap(() => handlers.onCalendar());
    body.addChild(this.prev, this.next, this.calendar);

    const chipW = (W - 40 - 10 * MAX_STAKE) / STAKE_COUNT;
    for (let s = 0; s < STAKE_COUNT; s++) {
      const chip = new Button({ label: String(s), width: chipW, height: CHIP_H, fontSize: 44, style: 'neutral', sfx: 'ui_click' });
      chip.position.set(20 + chipW / 2 + s * (chipW + 10), CHIP_Y + CHIP_H / 2);
      chip.onTap(() => this.pick(s));
      chip.onDisabledTap(() => {
        toast(t('battle.stake.locked'), 'info');
        audio.play('ui_error');
      });
      const check = drawIcon('check', 30);
      check.position.set(chipW / 2 - 20, -CHIP_H / 2 + 22);
      check.visible = false;
      chip.addChild(check);
      this.chips.push(chip);
      this.checks.push(check);
      body.addChild(chip);
    }
    this.ruleHead.position.set(28, RULE_Y);
    this.ruleText.position.set(28, RULE_Y + 28);
    body.addChild(this.ruleHead, this.ruleText);
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
    const chapterChanged = clamped.chapter !== this.sel.chapter || !this.art;
    this.sel = clamped;
    if (chapterChanged) this.showArt(dir, animate);
    this.refreshChips();
    this.refreshRule();
    this.drawDots();
  }

  /** Re-read what is cleared (after a run, a sweep): chips, tags and the art's best-level tag. */
  sync(): void {
    const keep = clampSelection(profile.data.cleared, this.sel);
    this.sel = keep;
    this.showArt(0, false);
    this.refreshChips();
    this.refreshRule();
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
    this.refreshRule();
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

  private showArt(dir: number, animate: boolean): void {
    const cleared = profile.data.cleared;
    const fresh = buildArt(this.sel.chapter, chapterUnlocked(cleared, this.sel.chapter), bestStake(cleared, this.sel.chapter));
    const old = this.art;
    this.art = fresh;
    this.clip.addChild(fresh);
    this.prev.visible = this.sel.chapter > 1;
    this.next.visible = this.sel.chapter < CHAPTER_COUNT;
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
      const playable = stakePlayable(cleared, chapter, s);
      const done = s < (cleared[chapter - 1] ?? 0);
      chip.setEnabled(playable);
      chip.setStyle(s === stake ? 'primary' : done ? 'success' : 'info');
      (this.checks[s] as Container).visible = done && playable;
    }
  }

  private refreshRule(): void {
    const { stake } = this.sel;
    this.ruleHead.text = t('battle.stake', { n: stake });
    this.ruleText.text = stake === 0 ? t('battle.stake.base') : stakeText(stake);
  }

  private drawDots(): void {
    const g = this.dots;
    g.clear();
    const cleared = profile.data.cleared;
    const gap = 30;
    const x0 = ART_INSET + ART_W / 2 - ((CHAPTER_COUNT - 1) * gap) / 2;
    const y = ART_INSET + ART_H - 26;
    for (let c = 1; c <= CHAPTER_COUNT; c++) {
      const current = c === this.sel.chapter;
      const color = current ? Color.primary : chapterUnlocked(cleared, c) ? Color.white : Color.neutral;
      g.circle(x0 + (c - 1) * gap, y, current ? 9 : 6).fill({ color, alpha: current ? 1 : 0.7 }).stroke({ width: 2, color: Color.outline });
    }
  }
}

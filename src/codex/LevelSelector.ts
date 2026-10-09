/**
 * The small selector at the top of the monster section and of every monster page: which chapter and which butler level the health
 * and time limits are for. Two labelled rows of paper tabs (each tab at least a touch target wide), a caption that says what the
 * choice does to the numbers. Origin = top-left.
 */
import { Container, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { CHAPTER_COUNT } from '@/game/data/balance';
import { MAX_STAKE } from '@/game/data/roster';
import { Color, SegmentTabs, uiLabel } from '@/ui';
import { basisText } from './foeText';
import type { Level } from './foes';
import { PAD, sheet } from './parts';
import './strings';

const TABS_H = 88;
const LABEL_H = 34;
const ROW_GAP = 14;
const CAPTION_GAP = 14;

export class LevelSelector extends Container {
  readonly size: { w: number; h: number };
  private readonly caption: Text;
  private readonly rules: Text;
  private changeFn: ((level: Level) => void) | null = null;

  constructor(
    w: number,
    private level: Level,
  ) {
    super();
    const inner = w - PAD * 2;
    this.caption = uiLabel('', { size: 26, anchorX: 0, anchorY: 0, wrap: inner, align: 'left' });
    this.rules = uiLabel('', { size: 24, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: inner, align: 'left', lineHeight: 30 });
    // Room for the longest caption any butler level brings, so changing the level never moves what lies below.
    this.caption.text = basisText(level).head;
    this.rules.text = basisText({ chapter: level.chapter, stake: MAX_STAKE }).rules;
    const textH = this.caption.height + 4 + this.rules.height;
    this.refreshCaption();
    const rowH = LABEL_H + TABS_H;
    const h = PAD + rowH * 2 + ROW_GAP + CAPTION_GAP + textH + PAD;
    this.size = { w, h };
    this.addChild(sheet(w, h));

    const rows: Array<{ label: string; ids: string[]; selected: string; pick: (id: string) => void }> = [
      {
        label: t('codex.chapter'), ids: Array.from({ length: CHAPTER_COUNT }, (_, i) => String(i + 1)), selected: String(level.chapter),
        pick: (id) => this.set({ chapter: Number(id), stake: this.level.stake }),
      },
      {
        label: t('codex.stake'), ids: Array.from({ length: MAX_STAKE + 1 }, (_, i) => String(i)), selected: String(level.stake),
        pick: (id) => this.set({ chapter: this.level.chapter, stake: Number(id) }),
      },
    ];
    rows.forEach((row, i) => {
      const top = PAD + i * (rowH + ROW_GAP);
      const label = uiLabel(row.label, { size: 28, color: Color.inkSoft, anchorX: 0, anchorY: 0 });
      label.position.set(PAD, top);
      const tabs = new SegmentTabs({ width: inner, height: TABS_H, selected: row.selected, tabs: row.ids.map((id) => ({ id, label: id })) });
      tabs.position.set(PAD + inner / 2, top + LABEL_H + TABS_H / 2);
      tabs.onSelect(row.pick);
      this.addChild(label, tabs);
    });
    const ty = PAD + rowH * 2 + ROW_GAP + CAPTION_GAP;
    this.caption.position.set(PAD, ty);
    this.rules.position.set(PAD, ty + this.caption.height + 4);
    this.addChild(this.caption, this.rules);
  }

  onChange(fn: (level: Level) => void): this {
    this.changeFn = fn;
    return this;
  }

  private set(level: Level): void {
    if (level.chapter === this.level.chapter && level.stake === this.level.stake) return;
    this.level = level;
    this.refreshCaption();
    this.changeFn?.(level);
  }

  private refreshCaption(): void {
    const text = basisText(this.level);
    this.caption.text = text.head;
    this.rules.text = text.rules;
  }
}

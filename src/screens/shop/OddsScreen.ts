import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import { CHEST_KINDS, type ChestKind } from '@/meta/types';
import { Color, drawIcon, OddsTable, ProgressBar, ScreenScaffold, SegmentTabs, uiLabel, vGradient, type OddsRow } from '@/ui';
import { chestArt } from './art';

/**
 * The legal disclosure of a chest: every number comes from `profile.oddsOf`, i.e. from the same table the
 * draw code rolls from. The pity counter and its target are read live.
 */
class OddsScreen {
  private readonly scaffold: ScreenScaffold;
  private readonly body = new Container();
  private readonly tabs: SegmentTabs;
  private readonly offProfile: () => void;
  private kind: ChestKind;
  private closing = false;

  constructor(kind: ChestKind) {
    this.kind = kind;
    this.scaffold = new ScreenScaffold({ title: t('odds.title'), onBack: () => this.close() });
    game.popupLayer.addChild(this.scaffold);
    const w = this.scaffold.contentWidth;
    this.tabs = new SegmentTabs({
      tabs: CHEST_KINDS.map((k) => ({ id: k, label: t('meta.chest.' + k) })),
      width: w,
      height: 88,
      selected: kind,
    });
    this.tabs.position.set(w / 2, 44);
    this.tabs.onSelect((id) => {
      this.kind = id as ChestKind;
      audio.play('ui_tab');
      this.render();
    });
    this.body.position.set(0, 110);
    this.scaffold.content.addChild(this.tabs, this.body);
    this.render();
    this.offProfile = profile.subscribe(() => {
      if (!this.closing) this.render();
    });
    void this.scaffold.show(true);
  }

  private render(): void {
    for (const c of this.body.removeChildren()) c.destroy({ children: true });
    const w = this.scaffold.contentWidth;
    const view = profile.oddsOf(this.kind);
    let y = 8;

    const art = chestArt(this.kind, 150);
    art.position.set(86, y + 78);
    const head = uiLabel(view.title, { size: 46, strokeWidth: 7, anchorX: 0 });
    head.position.set(184, y + 52);
    const cards = uiLabel(t('odds.cards', { n: view.cards }), { size: 32, color: Color.textDim, strokeWidth: 5, shadow: false, anchorX: 0 });
    cards.position.set(184, y + 108);
    this.body.addChild(art, head, cards);
    y += 170;

    const rowsTitle = uiLabel(t('odds.rows'), { size: 30, color: Color.primary, strokeWidth: 5, anchorX: 0 });
    rowsTitle.position.set(8, y);
    this.body.addChild(rowsTitle);
    y += 30;
    const rows: OddsRow[] = view.rows.map((r) => ({ value: r.p, rarity: r.rarity }));
    const table = new OddsTable({ width: w, rows, footnote: view.wildText });
    table.position.set(0, y);
    this.body.addChild(table);
    y += table.tableHeight + 26;

    if (view.guaranteeTexts.length > 0) {
      y = this.textBlock(t('odds.guarantee'), view.guaranteeTexts, y, w);
    }

    if (view.pity) {
      const p = view.pity;
      const title = uiLabel(t('odds.pity'), { size: 30, color: Color.primary, strokeWidth: 5, anchorX: 0 });
      title.position.set(8, y);
      this.body.addChild(title);
      y += 24;
      const text = uiLabel(p.text, { size: 28, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - 16, lineHeight: 38 });
      text.position.set(8, y + 14);
      this.body.addChild(text);
      y += 14 + text.height + 18;
      const bar = new ProgressBar({ width: w - 16, height: 50, color: p.next ? 'green' : 'gold', label: t('odds.counter', { n: p.counter, every: p.every }) });
      bar.position.set(w / 2, y + 25);
      bar.setValue(p.counter / p.every, false);
      this.body.addChild(bar);
      y += 66;
      if (p.next) {
        const next = uiLabel(t('odds.next'), { size: 28, color: Color.success, strokeWidth: 5, shadow: false, anchorX: 0, anchorY: 0, wrap: w - 16, lineHeight: 36 });
        next.position.set(8, y);
        this.body.addChild(next);
        y += next.height + 12;
      }
      y += 12;
    }

    const panel = new Graphics();
    const fair = uiLabel(`${t('odds.fair')}\n${t('odds.where')}`, { size: 26, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - 76, lineHeight: 34 });
    const ph = fair.height + 40;
    panel.roundRect(0, y, w, ph, 22).fill(vGradient(Color.panelDark, Color.bgDeep)).stroke({ width: 3, color: Color.outline, alignment: 1 });
    const info = drawIcon('info', 36);
    info.position.set(34, y + ph / 2);
    fair.position.set(62, y + 20);
    this.body.addChild(panel, info, fair);
    y += ph + 22;

    const ver = uiLabel(t('meta.odds.version', { v: view.version }), { size: 26, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0 });
    ver.position.set(8, y + 12);
    this.body.addChild(ver);
    this.scaffold.refresh();
  }

  private textBlock(title: string, lines: readonly string[], y: number, w: number): number {
    const head = uiLabel(title, { size: 30, color: Color.primary, strokeWidth: 5, anchorX: 0 });
    head.position.set(8, y);
    this.body.addChild(head);
    let cy = y + 24;
    for (const line of lines) {
      const l = uiLabel(line, { size: 28, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - 16, lineHeight: 38 });
      l.position.set(8, cy + 14);
      this.body.addChild(l);
      cy += 14 + l.height + 6;
    }
    return cy + 24;
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    this.offProfile();
    void this.scaffold.hide(true).then(() => {
      this.scaffold.destroy({ children: true });
      if (active === this) active = null;
    });
  }

  switchTo(kind: ChestKind): void {
    this.kind = kind;
    this.tabs.select(kind, false);
    this.render();
  }
}

let active: OddsScreen | null = null;

export function isChestKind(v: string): v is ChestKind {
  return (CHEST_KINDS as readonly string[]).includes(v);
}

/** Open the odds screen of a chest kind; an unknown kind opens the silver chest. */
export function openOddsScreen(kind: string): void {
  const k: ChestKind = isChestKind(kind) ? kind : 'silver';
  if (active) {
    active.switchTo(k);
    return;
  }
  active = new OddsScreen(k);
}

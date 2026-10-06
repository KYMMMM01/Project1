import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import { CHEST_KINDS, type ChestKind } from '@/meta/types';
import { cacheStatic, Color, drawDashedLine, drawIcon, OddsTable, paperSeed, paperShape, ProgressBar, ScreenScaffold, SegmentTabs, tapeStrip, uiLabel, type OddsRow } from '@/ui';
import { chestArt } from './art';

/** Left margin of the notebook page: the red margin line and the text column after it. */
const MARGIN = 84;
/** The table's own row height: the ruled lines of the page are cut to the same pitch. */
const RULE = 58;

/** The ruled page the disclosure is written on: pale blue lines, a red margin line, three punched holes and a piece of tape. */
function notebook(w: number, h: number, ruleFrom: number): Container {
  const c = new Container();
  const sheet = paperShape({ w, h, radius: 26, fill: Color.paperLight, seed: paperSeed() });
  sheet.position.set(w / 2, h / 2);
  const g = new Graphics();
  for (let y = ruleFrom; y < h - 16; y += RULE) g.rect(20, y, w - 40, 2).fill({ color: Color.teal, alpha: 0.3 });
  g.rect(MARGIN - 18, 18, 3, h - 36).fill({ color: Color.coral, alpha: 0.55 });
  for (const y of [h * 0.18, h * 0.5, h * 0.82]) {
    g.circle(34, y, 11).fill({ color: Color.shadow, alpha: 0.18 });
    g.circle(34, y + 1.5, 9).fill(Color.woodDark);
  }
  cacheStatic(g);
  const tape = tapeStrip({ name: 'sky', w: 110, h: 32, angle: 3, pattern: 'dots' });
  tape.position.set(w - 90, 6);
  c.addChild(sheet, g, tape);
  return c;
}

/**
 * The legal disclosure of a chest: every number comes from `profile.oddsOf`, i.e. from the same table the
 * draw code rolls from, set on a ruled page. The pity counter and its target are read live.
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
    this.body.position.set(0, 124);
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
    const colW = w - MARGIN - 28;
    const view = profile.oddsOf(this.kind);
    const inner = new Container();
    let y = 24;

    const art = chestArt(this.kind, 130);
    art.position.set(MARGIN + 56, y + 62);
    const head = uiLabel(view.title, { size: 46, anchorX: 0 });
    head.position.set(MARGIN + 140, y + 38);
    const cards = uiLabel(t('odds.cards', { n: view.cards }), { size: 32, color: Color.inkSoft, anchorX: 0 });
    cards.position.set(MARGIN + 140, y + 92);
    inner.addChild(art, head, cards);
    y += 156;

    y = this.heading(inner, t('odds.rows'), y);
    const tableY = y;
    const rows: OddsRow[] = view.rows.map((r) => ({ value: r.p, rarity: r.rarity }));
    const table = new OddsTable({ width: colW, rows, footnote: view.wildText, framed: false });
    table.position.set(MARGIN, y);
    inner.addChild(table);
    y += table.tableHeight + 14;

    if (view.guaranteeTexts.length > 0) {
      y = this.heading(inner, t('odds.guarantee'), y);
      for (const line of view.guaranteeTexts) y = this.paragraph(inner, line, y, colW);
      y += 10;
    }

    if (view.pity) {
      const p = view.pity;
      y = this.heading(inner, t('odds.pity'), y);
      y = this.paragraph(inner, p.text, y, colW);
      const bar = new ProgressBar({ width: colW, height: 50, color: p.next ? 'green' : 'gold', label: t('odds.counter', { n: p.counter, every: p.every }) });
      bar.position.set(MARGIN + colW / 2, y + 33);
      bar.setValue(p.counter / p.every, false);
      inner.addChild(bar);
      y += 74;
      if (p.next) {
        const next = uiLabel(t('odds.next'), { size: 28, color: Color.leafDark, anchorX: 0, anchorY: 0, wrap: colW, lineHeight: 36, align: 'left' });
        next.position.set(MARGIN, y);
        inner.addChild(next);
        y += next.height + 12;
      }
      y += 8;
    }

    const fair = uiLabel(`${t('odds.fair')}\n${t('odds.where')}`, { size: 26, anchorX: 0, anchorY: 0, wrap: colW - 56, lineHeight: 34, align: 'left' });
    const fh = fair.height + 36;
    const note = paperShape({ w: colW, h: fh, radius: 18, fill: Color.paperDim, edge: Color.kraftDark, edgeAlpha: 0.5, shadow: 3, grain: false, seed: paperSeed() });
    note.position.set(MARGIN + colW / 2, y + fh / 2);
    const info = drawIcon('info', 36);
    info.position.set(MARGIN + 30, y + fh / 2);
    fair.position.set(MARGIN + 56, y + 18);
    inner.addChild(note, info, fair);
    y += fh + 20;

    const ver = uiLabel(t('meta.odds.version', { v: view.version }), { size: 26, color: Color.inkSoft, anchorX: 0 });
    ver.position.set(MARGIN, y + 14);
    inner.addChild(ver);
    y += 48;

    // The ruling lines up with the table's rows, so every number sits between two lines.
    const ruleFrom = (tableY + 22) % RULE;
    this.body.addChild(notebook(w, y, ruleFrom < 24 ? ruleFrom + RULE : ruleFrom), inner);
    this.scaffold.refresh();
  }

  /** A small heading above a block, underlined with a dashed teal line. Returns the y below it. */
  private heading(inner: Container, text: string, y: number): number {
    const h = uiLabel(text, { size: 30, anchorX: 0 });
    h.position.set(MARGIN, y + 16);
    const rule = new Graphics();
    drawDashedLine(rule, MARGIN, y + 40, MARGIN + Math.max(120, h.width), y + 40, { width: 3 });
    inner.addChild(h, rule);
    return y + 52;
  }

  private paragraph(inner: Container, text: string, y: number, w: number): number {
    const l = uiLabel(text, { size: 28, anchorX: 0, anchorY: 0, wrap: w, lineHeight: 38, align: 'left' });
    l.position.set(MARGIN, y + 6);
    inner.addChild(l);
    return y + 6 + l.height + 8;
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

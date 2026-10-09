/**
 * The monster section: a list row for every enemy and the page that opens from it. Built from the words and numbers of foeText.ts,
 * which reads them from the data, so nothing here knows a number. A list row shows the sticker, the name, one line of numbers and
 * a "new" or "not met yet" mark; a page shows traits, stats, where it comes, and for elites and bosses everything about the fight.
 */
import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { mixColor } from '@/core/math';
import type { EnemyId } from '@/game/api';
import { illustration } from '@/guide/Illustration';
import type { CodexKey, GuideProgress } from '@/guide/progress';
import { bindPress, Color, fitLabel, PaperLabel, paperSeed, paperShape, tapeStrip, uiLabel } from '@/ui';
import { bullets, paragraph, PAD, section, sheet, table, type Built } from './parts';
import { foeItem, foePage, type FoeItem, type FoePage } from './foeText';
import { FOE_IDS, foeRank, type FoeRank, type Level } from './foes';
import './strings';

const ROW_H = 184;
const TILE = 128;
const ROW_GAP = 14;

const RANK_PAPER: Record<Exclude<FoeRank, 'normal'>, number> = { elite: Color.mustard, boss: Color.berry };
const RANK_TRAIT: Record<Exclude<FoeRank, 'normal'>, string> = { elite: 'trait.elite.name', boss: 'trait.boss.name' };

const FOE_GROUPS: ReadonlyArray<{ id: FoeRank; ids: readonly EnemyId[] }> = (['normal', 'elite', 'boss'] as const).map((id) => ({
  id,
  ids: FOE_IDS.filter((foe) => foeRank(foe) === id),
}));

export const foeKey = (id: EnemyId): CodexKey => `foe:${id}`;

/** How many of the enemies the player has met (for the list's caption). */
export function metCount(progress: GuideProgress): { met: number; total: number } {
  return { met: FOE_IDS.filter((id) => progress.isMet(foeKey(id))).length, total: FOE_IDS.length };
}

// ───────────────────────────── list ─────────────────────────────

function row(item: FoeItem, w: number, progress: GuideProgress, open: (id: EnemyId) => void): Container {
  const view = new Container();
  const card = paperShape({ w, h: ROW_H, radius: 28, fill: Color.paperLight, seed: paperSeed(), grain: false });
  card.position.set(w / 2, ROW_H / 2);
  const met = progress.isMet(foeKey(item.id));
  const fresh = progress.isFresh(foeKey(item.id));
  const pic = illustration({ k: 'foe', id: item.id }, TILE);
  pic.position.set(18 + TILE / 2, ROW_H / 2);
  pic.alpha = met ? 1 : 0.55;
  view.addChild(card, pic);

  const x0 = TILE + 42;
  const room = w - x0 - PAD;
  let nameRoom = room - (fresh ? 132 : 0);
  let tag: PaperLabel | null = null;
  if (item.rank !== 'normal') {
    tag = new PaperLabel({ text: t(RANK_TRAIT[item.rank]), size: 24, paper: RANK_PAPER[item.rank], padX: 14, padY: 4, seed: 5 });
    nameRoom -= tag.width + 12;
  }
  const name = uiLabel(item.name, { size: 32, anchorX: 0 });
  fitLabel(name, nameRoom, 32);
  name.position.set(x0, 40);
  view.addChild(name);
  if (tag) {
    tag.position.set(x0 + name.width + 12 + tag.width / 2, 40);
    view.addChild(tag);
  }
  const line = uiLabel(item.line, { size: 24, color: Color.inkSoft, wrap: room, align: 'left', anchorX: 0, anchorY: 0, lineHeight: 30 });
  line.position.set(x0, 70);
  view.addChild(line);
  if (!met) {
    const unmet = new PaperLabel({ text: t('codex.unmet'), size: 24, paper: 'kraft', padX: 16, padY: 4, seed: 9 });
    unmet.position.set(x0 + unmet.width / 2, ROW_H - 30);
    view.addChild(unmet);
  }
  if (fresh) {
    const sticker = new PaperLabel({ text: t('codex.new'), size: 24, paper: Color.berry, padX: 14, padY: 4, seed: 7 });
    sticker.position.set(w - 24 - sticker.width / 2 - 8, 34);
    sticker.rotation = 0.1;
    view.addChild(sticker);
  }
  view.eventMode = 'static';
  view.cursor = 'pointer';
  bindPress(view, {
    down: () => view.scale.set(0.985),
    up: (released) => {
      view.scale.set(1);
      if (released) open(item.id);
    },
  });
  view.pivot.set(w / 2, ROW_H / 2);
  return view;
}

/** The list of every enemy in three groups. `y` is where it starts; returns the height used. */
export function buildFoeList(content: Container, w: number, y: number, level: Level, progress: GuideProgress, open: (id: EnemyId) => void): number {
  let at = y;
  for (const group of FOE_GROUPS) {
    const head = new PaperLabel({ text: t(`codex.group.${group.id}`), size: 30, paper: group.id === 'boss' ? Color.berry : group.id === 'elite' ? Color.mustard : Color.teal, padX: 26, padY: 8, seed: 13 });
    head.position.set(head.width / 2 + 8, at + head.height / 2);
    content.addChild(head);
    at += head.height + 20;
    for (const id of group.ids) {
      const r = row(foeItem(id, level), w, progress, open);
      r.position.set(w / 2, at + ROW_H / 2);
      content.addChild(r);
      at += ROW_H + ROW_GAP;
    }
    at += 12;
  }
  return at - y;
}

// ───────────────────────────── page ─────────────────────────────

const HERO_PIC = 208;

/** The picture on the floor, and under it one cream sheet with the name, what kind it is, whether it has been met, and its flavour line. */
function hero(page: FoePage, w: number, met: boolean): Built {
  const view = new Container();
  const pic = illustration({ k: 'foe', id: page.id }, HERO_PIC);
  pic.position.set(w / 2, HERO_PIC / 2 + 16);
  pic.alpha = met ? 1 : 0.6;
  const tape = tapeStrip({ name: 'sky', pattern: 'dots', w: 96, h: 32, angle: -8 });
  tape.position.set(w / 2, 14);
  const top = HERO_PIC + 40;
  const inner = new Container();
  inner.position.set(PAD, top + PAD);
  const width = w - PAD * 2;
  const name = uiLabel(page.name, { size: 42, wrap: width, align: 'center', anchorY: 0, lineHeight: 52 });
  name.position.set(width / 2, 0);
  inner.addChild(name);
  let y = name.height + 14;
  const tags: PaperLabel[] = [];
  if (page.rank !== 'normal') tags.push(new PaperLabel({ text: t(RANK_TRAIT[page.rank]), size: 26, paper: RANK_PAPER[page.rank], padX: 22, padY: 6, seed: 5 }));
  if (!met) tags.push(new PaperLabel({ text: t('codex.unmet'), size: 24, paper: 'kraft', padX: 18, padY: 6, seed: 9 }));
  if (tags.length > 0) {
    const gap = 16;
    const row = tags.reduce((sum, tag) => sum + tag.width, 0) + gap * (tags.length - 1);
    let x = (width - row) / 2;
    for (const tag of tags) {
      tag.position.set(x + tag.width / 2, y + tag.height / 2);
      inner.addChild(tag);
      x += tag.width + gap;
    }
    y += Math.max(...tags.map((tag) => tag.height)) + 18;
  }
  const flavour = uiLabel(page.flavour, { size: 28, wrap: width - 48, align: 'center', anchorY: 0, lineHeight: 38 });
  const strip = paperShape({ w: width, h: flavour.height + 36, radius: 22, fill: mixColor(Color.mustard, Color.paperLight, 0.72), seed: paperSeed(), grain: false });
  strip.position.set(width / 2, y + (flavour.height + 36) / 2);
  flavour.position.set(width / 2, y + 18);
  inner.addChild(strip, flavour);
  y += flavour.height + 36;
  const h = top + PAD + y + PAD;
  const base = sheet(w, h - top);
  base.position.set(0, top);
  view.addChild(pic, tape, base, inner);
  return { view, h };
}

function traitsSection(page: FoePage, w: number): Built | null {
  if (page.traits.length === 0) return null;
  return section(w, t('codex.page.traits'), (inner, width) => {
    const chips = page.traits.map((tr, i) => new PaperLabel({
      text: tr.name, size: 26, paper: tr.id === 'boss' ? Color.berry : tr.id === 'elite' ? Color.mustard : Color.teal, padX: 16, padY: 6, maxWidth: 150, seed: 21 + i,
    }));
    // One column for the chips, as wide as the widest, so the explanations start on one line.
    const column = Math.max(...chips.map((c) => c.width));
    let y = 0;
    page.traits.forEach((tr, i) => {
      const chip = chips[i] as PaperLabel;
      const text = uiLabel(tr.text, { size: 26, anchorX: 0, anchorY: 0, wrap: width - column - 20, align: 'left', lineHeight: 36 });
      const h = Math.max(text.height, chip.height);
      chip.position.set(chip.width / 2, y + h / 2);
      text.position.set(column + 20, y + (h - text.height) / 2);
      inner.addChild(chip, text);
      y += h + 16;
    });
    return y - 16;
  });
}

function wavesSection(special: NonNullable<FoePage['special']>, w: number): Built {
  return section(w, t('codex.page.waves'), (inner, width) => {
    let y = 0;
    if (special.imaginedNote) y += paragraph(inner, width, special.imaginedNote, y, 24, Color.inkSoft) + 14;
    special.waves.forEach((block, i) => {
      const head = uiLabel(block.head, { size: 30, color: Color.coralDark, anchorX: 0, anchorY: 0 });
      head.position.set(0, y);
      inner.addChild(head);
      y += head.height + 6;
      for (const line of block.lines) y += paragraph(inner, width, line, y, 26) + 6;
      if (i < special.waves.length - 1) y += 14;
    });
    y += 14;
    y += paragraph(inner, width, special.toyNote, y, 24, Color.inkSoft);
    return y;
  });
}

/** The monster page. `met` says whether the player has met it (a dimmed picture and a mark when not). */
export function buildFoePage(content: Container, w: number, y: number, id: EnemyId, level: Level, met: boolean): number {
  const page = foePage(id, level);
  let at = y;
  const place = (b: Built | null, gap = 44): void => {
    if (!b) return;
    b.view.position.set(0, at);
    content.addChild(b.view);
    at += b.h + gap;
  };
  place(hero(page, w, met), 36);
  place(traitsSection(page, w));
  place(section(w, t('codex.page.stats'), (inner, width) => table(inner, width, page.stats)));
  if (page.special) place(wavesSection(page.special, w));
  place(section(w, t('codex.page.appears'), (inner, width) => table(inner, width, page.appears)));
  const special = page.special;
  if (special) {
    place(section(w, t('codex.page.control'), (inner, width) => table(inner, width, special.control)));
    place(section(w, t('codex.page.rule'), (inner, width) => paragraph(inner, width, special.rule)));
  }
  if (page.abilities.length > 0) {
    place(section(w, t('codex.page.ability'), (inner, width) => {
      let h = 0;
      page.abilities.forEach((a, i) => {
        const name = uiLabel(a.name, { size: 30, color: Color.coralDark, anchorX: 0, anchorY: 0 });
        name.position.set(0, h);
        inner.addChild(name);
        h += name.height + 6;
        h += paragraph(inner, width, a.text, h) + (i < page.abilities.length - 1 ? 22 : 0);
      });
      return h;
    }));
  }
  if (special) place(section(w, t('codex.page.tips'), (inner, width) => bullets(inner, width, special.tips)));
  return at - y;
}

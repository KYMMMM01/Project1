/**
 * The codex: a full-screen paper notebook with three sections (monsters, toys, board cells). The monster section opens a page per
 * enemy, with a selector for the chapter and butler level the numbers are for; the toy section filters by rarity; the cell section
 * is one scroll of cards. It opens from the settings sheet, the home screen, the pause menu and the links of the battle's enemy
 * bubble and boss strip (straight onto that enemy's page).
 */
import { Container, Graphics } from 'pixi.js';
import { game } from '@/core/game';
import { i18nEvents, t } from '@/core/i18n';
import type { EnemyId } from '@/game/api';
import { guideProgress, type GuideProgress } from '@/guide/progress';
import { Button, Color, fadeTo, motion, PaperLabel, ScreenScaffold, SegmentTabs, TweenBag, uiLabel } from '@/ui';
import { Ease } from '@/core/tween';
import { buildCellList } from './CellViews';
import { buildFoeList, buildFoePage, foeKey, metCount } from './FoeViews';
import { DEFAULT_LEVEL, FOE_IDS, clampLevel, type Level } from './foes';
import { LevelSelector } from './LevelSelector';
import { buildToyList, toyFilterLabel, toyKey, toysMet } from './ToyViews';
import { TOY_FILTERS, toysFor, type ToyFilter } from './toys';
import './strings';

export const CODEX_SECTIONS = ['foes', 'toys', 'cells'] as const;
export type CodexSection = (typeof CODEX_SECTIONS)[number];

export interface CodexOpts {
  /** Open straight on this enemy's page. */
  foe?: EnemyId;
  /** The chapter and butler level the numbers are for; the battle passes its own, otherwise the last choice stays. */
  level?: Level;
  section?: CodexSection;
  progress?: GuideProgress;
  /** Runs after the codex has gone (a pause menu reopens itself here). */
  onClose?: () => void;
}

const BAR_H = 112;
const TAB_H = 84;
const NAV_H = 88;
const HEAD_GAP = 24;

let current: { close: () => void; section: () => CodexSection; page: () => EnemyId | null } | null = null;
/** The last level the player chose: the next opening starts from it. */
let lastLevel: Level = DEFAULT_LEVEL;

/** Close the codex at once (the scene under it is going away). */
export function closeCodex(): void {
  current?.close();
}

/** What is open, for the QA hooks: the section and the monster page, or null when no codex is up. */
export function codexState(): { section: CodexSection; page: EnemyId | null } | null {
  return current ? { section: current.section(), page: current.page() } : null;
}

export function openCodex(opts: CodexOpts = {}): ScreenScaffold | null {
  if (current) return null;
  const progress = opts.progress ?? guideProgress;
  if (!progress.ready) void progress.load().then(() => render());
  const scaffold = new ScreenScaffold({ title: t('codex.title'), onBack: () => back(), scroll: true, actionBarHeight: BAR_H });
  game.popupLayer.addChild(scaffold);
  const bag = new TweenBag();
  let closed = false;
  let section: CodexSection = opts.foe ? 'foes' : (opts.section ?? 'foes');
  let page: EnemyId | null = opts.foe ?? null;
  let level = clampLevel(opts.level ?? lastLevel);
  let filter: ToyFilter = 'all';
  /** What lies under the selector or filter: rebuilt when the level or the filter changes. */
  let body: Container | null = null;
  let bodyTop = 0;

  const fadeIn = (): void => {
    if (motion.reduced) return;
    scaffold.content.alpha = 0;
    fadeTo(bag, scaffold.content, 1, { duration: 0.14, ease: Ease.cubicOut });
  };

  const clear = (): void => {
    body = null;
    for (const c of scaffold.content.removeChildren()) c.destroy({ children: true });
    for (const c of scaffold.actionBar.removeChildren()) c.destroy({ children: true });
  };

  /** Everything the toy list showed is looked at once the player leaves it: its "new" marks go. */
  const leaveSection = (): void => {
    if (section === 'toys' && !page) for (const id of toysFor('all')) progress.markLooked(toyKey(id));
  };

  const freshIn = (id: CodexSection): boolean =>
    id === 'foes' ? FOE_IDS.some((foe) => progress.isFresh(foeKey(foe))) : id === 'toys' ? toysFor('all').some((toy) => progress.isFresh(toyKey(toy))) : false;

  const replaceBody = (build: (into: Container) => void): void => {
    body?.destroy({ children: true });
    const next = new Container();
    next.position.set(0, bodyTop);
    scaffold.content.addChild(next);
    body = next;
    build(next);
    scaffold.refresh();
  };

  const select = (selector: LevelSelector, rebuild: () => void): void => {
    selector.onChange((next) => {
      level = next;
      lastLevel = next;
      rebuild();
    });
  };

  // ───────────────────────── section bar ─────────────────────────

  const buildBar = (): void => {
    const w = scaffold.contentWidth;
    const tabs = new SegmentTabs({
      width: w, height: TAB_H, selected: section,
      tabs: CODEX_SECTIONS.map((id) => ({ id, label: t(`codex.section.${id}`) })),
    });
    tabs.onSelect((id) => {
      leaveSection();
      section = id as CodexSection;
      showList();
    });
    scaffold.actionBar.addChild(tabs);
    const cell = (w - 12) / CODEX_SECTIONS.length;
    CODEX_SECTIONS.forEach((id, i) => {
      if (id === section || !freshIn(id)) return;
      const dot = new Graphics().circle(0, 0, 10).fill(Color.berry).circle(0, 0, 10).stroke({ color: Color.paperLight, width: 3 });
      dot.position.set(-w / 2 + 6 + cell * (i + 1) - 18, -TAB_H / 2 + 10);
      scaffold.actionBar.addChild(dot);
    });
  };

  /** The section's heading and its count; returns where the body below may start. */
  const heading = (): number => {
    const w = scaffold.contentWidth;
    const head = new PaperLabel({ text: t(`codex.sectionLong.${section}`), size: 32, paper: Color.teal, padX: 28, padY: 8, seed: 11 });
    head.position.set(head.width / 2 + 8, 36);
    scaffold.content.addChild(head);
    if (section !== 'cells') {
      const count = section === 'foes' ? metCount(progress) : toysMet(progress);
      const caption = uiLabel(t('codex.count', { found: count.met, total: count.total }), { size: 24, color: Color.inkSoft, anchorX: 1 });
      caption.position.set(w - 8, 36);
      scaffold.content.addChild(caption);
    }
    return 36 + 28 + HEAD_GAP;
  };

  // ───────────────────────── list ─────────────────────────

  function showList(): void {
    page = null;
    clear();
    scaffold.setTitle(t('codex.title'));
    const w = scaffold.contentWidth;
    const y = heading();
    if (section === 'foes') {
      const selector = new LevelSelector(w, level);
      selector.position.set(0, y);
      scaffold.content.addChild(selector);
      bodyTop = y + selector.size.h + 28;
      select(selector, () => replaceBody((into) => buildFoeList(into, w, 0, level, progress, showPage)));
      replaceBody((into) => buildFoeList(into, w, 0, level, progress, showPage));
    } else if (section === 'toys') {
      const tabs = new SegmentTabs({
        width: w, height: NAV_H, selected: filter,
        tabs: TOY_FILTERS.map((id) => ({ id, label: toyFilterLabel(id) })),
      });
      tabs.position.set(w / 2, y + NAV_H / 2);
      tabs.onSelect((id) => {
        filter = id as ToyFilter;
        replaceBody((into) => buildToyList(into, w, 0, filter, progress));
      });
      scaffold.content.addChild(tabs);
      bodyTop = y + NAV_H + 28;
      replaceBody((into) => buildToyList(into, w, 0, filter, progress));
    } else {
      bodyTop = y;
      replaceBody((into) => buildCellList(into, w, 0));
    }
    buildBar();
    scaffold.refresh();
    scaffold.scroller?.scrollTo(0, false);
    fadeIn();
  }

  // ───────────────────────── a monster's page ─────────────────────────

  function showPage(id: EnemyId): void {
    page = id;
    section = 'foes';
    progress.markLooked(foeKey(id));
    clear();
    scaffold.setTitle(t('codex.title'));
    const w = scaffold.contentWidth;
    const selector = new LevelSelector(w, level);
    selector.position.set(0, 8);
    scaffold.content.addChild(selector);
    bodyTop = selector.size.h + 36;
    const fill = (into: Container): void => {
      buildFoePage(into, w, 0, id, level, progress.isMet(foeKey(id)));
    };
    select(selector, () => replaceBody(fill));
    replaceBody(fill);
    buildPageBar(id);
    scaffold.refresh();
    scaffold.scroller?.scrollTo(0, false);
    fadeIn();
  }

  function buildPageBar(id: EnemyId): void {
    const at = FOE_IDS.indexOf(id);
    const w = scaffold.contentWidth;
    const bw = (w - 24) / 3;
    const place = (b: Button, i: number): void => {
      b.position.set(-w / 2 + bw / 2 + i * (bw + 12), 0);
      scaffold.actionBar.addChild(b);
    };
    const prev = new Button({ label: t('codex.prev'), style: 'neutral', width: bw, height: 88, fontSize: 28 });
    const list = new Button({ label: t('codex.list'), style: 'primary', width: bw, height: 88, fontSize: 28 });
    const next = new Button({ label: t('codex.next'), style: 'neutral', width: bw, height: 88, fontSize: 28 });
    prev.onTap(() => showPage(FOE_IDS[(at + FOE_IDS.length - 1) % FOE_IDS.length] as EnemyId));
    next.onTap(() => showPage(FOE_IDS[(at + 1) % FOE_IDS.length] as EnemyId));
    list.onTap(() => showList());
    place(prev, 0);
    place(list, 1);
    place(next, 2);
  }

  function render(): void {
    if (closed) return;
    if (page) showPage(page);
    else showList();
  }

  // ───────────────────────── frame ─────────────────────────

  function back(): void {
    if (page) showList();
    else close();
  }

  function close(): void {
    if (closed) return;
    closed = true;
    leaveSection();
    current = null;
    off();
    bag.killAll();
    void scaffold.hide(true).then(() => {
      scaffold.destroy({ children: true });
      opts.onClose?.();
    });
  }

  // Rebuilt after the handler that changed the language has returned.
  const off = i18nEvents.on('change', () => queueMicrotask(render));

  current = {
    section: () => section,
    page: () => page,
    close: () => {
      if (closed) return;
      closed = true;
      leaveSection();
      current = null;
      off();
      bag.killAll();
      scaffold.destroy({ children: true });
    },
  };
  render();
  void scaffold.show(true);
  return scaffold;
}

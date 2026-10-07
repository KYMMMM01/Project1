/**
 * The guidebook: a full-screen paper notebook. A list of topics per section (picture, title, one line, a "new" sticker on
 * the ones nobody has read), and a page per topic with its full text and a "try it" pointer back to the control or tab.
 * It opens from the settings sheet, the pause menu and the "more" link of every lesson card.
 */
import { Container, Graphics } from 'pixi.js';
import { game } from '@/core/game';
import { i18nEvents, t } from '@/core/i18n';
import { mixColor } from '@/core/math';
import {
  bindPress, Button, Color, fitLabel, motion, PaperLabel, paperSeed, paperShape, ScreenScaffold, SegmentTabs, tapeStrip, TweenBag, uiLabel,
} from '@/ui';
import { Ease } from '@/core/tween';
import { illustration } from './Illustration';
import { guideProgress, type GuideProgress } from './progress';
import './strings';
import { topicFull, topicTeach, topicTitle } from './text';
import { SECTIONS, topicDef, topicsOf, type SectionId, type TopicId, type TryControl, type TryTab } from './topics';

/** What the caller can do for the "try it" button: a battle points at a control, the home screen goes to a tab. */
export interface GuideHost {
  tryControl?(control: TryControl, topic: TopicId): void;
  goTab?(tab: TryTab): void;
}

export interface GuideOpts {
  /** Open straight on this topic's page. */
  topic?: TopicId;
  progress?: GuideProgress;
  host?: GuideHost;
  /** Runs after the guidebook has gone (a pause menu reopens itself here). */
  onClose?: () => void;
}

const ROW_H = 156;
const ROW_GAP = 14;
const TILE = 128;
const BAR_H = 112;
const TAB_H = 84;

let current: { close: () => void } | null = null;

/** Close the guidebook at once (the scene under it is going away). */
export function closeGuide(): void {
  current?.close();
}

export function openGuide(opts: GuideOpts = {}): ScreenScaffold | null {
  if (current) return null;
  const progress = opts.progress ?? guideProgress;
  // The "new" stickers read what has been taught: a first look before the save has been read rebuilds when it arrives.
  if (!progress.ready) void progress.load().then(() => (page ? showPage(page) : showList()));
  const host = opts.host ?? {};
  const scaffold = new ScreenScaffold({ title: t('guide.title'), onBack: () => back(), scroll: true, actionBarHeight: BAR_H });
  game.popupLayer.addChild(scaffold);
  const bag = new TweenBag();
  let closed = false;
  let section: SectionId = opts.topic ? topicDef(opts.topic).section : 'start';
  let page: TopicId | null = opts.topic ?? null;

  const fadeIn = (): void => {
    if (motion.reduced) return;
    scaffold.content.alpha = 0;
    bag.runKeyed(scaffold.content, { duration: 0.14, ease: Ease.cubicOut, onUpdate: (k) => (scaffold.content.alpha = k), onComplete: () => (scaffold.content.alpha = 1) });
  };

  const clear = (): void => {
    for (const c of scaffold.content.removeChildren()) c.destroy({ children: true });
    for (const c of scaffold.actionBar.removeChildren()) c.destroy({ children: true });
  };

  // ───────────────────────── list ─────────────────────────

  const row = (id: TopicId, w: number): Container => {
    const def = topicDef(id);
    const view = new Container();
    const card = paperShape({ w, h: ROW_H, radius: 28, fill: Color.paperLight, seed: paperSeed(), grain: false });
    card.position.set(w / 2, ROW_H / 2);
    const pic = illustration(def.art, TILE);
    pic.position.set(18 + TILE / 2, ROW_H / 2);
    const title = uiLabel(topicTitle(id), { size: 32, anchorX: 0, anchorY: 0.5 });
    fitLabel(title, w - TILE - 56 - 96, 32);
    title.position.set(TILE + 42, 40);
    const teach = uiLabel(topicTeach(id), { size: 24, color: Color.inkSoft, wrap: w - TILE - 64, align: 'left', anchorX: 0, anchorY: 0, lineHeight: 30 });
    teach.position.set(TILE + 42, 68);
    view.addChild(card, pic, title, teach);
    if (!progress.isSeen(id)) {
      const sticker = new PaperLabel({ text: t('guide.new'), size: 24, paper: Color.berry, padX: 14, padY: 4, seed: 7 });
      sticker.position.set(w - 62, 30);
      sticker.rotation = 0.14;
      view.addChild(sticker);
    }
    view.eventMode = 'static';
    view.cursor = 'pointer';
    bindPress(view, {
      down: () => view.scale.set(0.985),
      up: (released) => {
        view.scale.set(1);
        if (released) showPage(id);
      },
    });
    // The scale pivot is the card's centre, not its top-left corner.
    view.pivot.set(w / 2, ROW_H / 2);
    return view;
  };

  const buildBar = (): void => {
    const w = scaffold.contentWidth;
    const tabs = new SegmentTabs({
      width: w,
      height: TAB_H,
      selected: section,
      tabs: SECTIONS.map((id) => ({ id, label: t(`guide.section.${id}`) })),
    });
    tabs.onSelect((id) => {
      section = id as SectionId;
      showList();
    });
    scaffold.actionBar.addChild(tabs);
    // A dot on the tab that still has pages nobody has read.
    const cell = (w - 12) / SECTIONS.length;
    SECTIONS.forEach((id, i) => {
      if (id === section || !topicsOf(id).some((d) => !progress.isSeen(d.id))) return;
      const dot = new Graphics().circle(0, 0, 10).fill(Color.berry).circle(0, 0, 10).stroke({ color: Color.paperLight, width: 3 });
      dot.position.set(-w / 2 + 6 + cell * (i + 1) - 18, -TAB_H / 2 + 10);
      scaffold.actionBar.addChild(dot);
    });
  };

  function showList(): void {
    page = null;
    clear();
    scaffold.setTitle(t('guide.title'));
    const w = scaffold.contentWidth;
    const heading = new PaperLabel({ text: t(`guide.sectionLong.${section}`), size: 32, paper: Color.teal, padX: 28, padY: 8, seed: 11 });
    heading.position.set(heading.width / 2 + 8, 36);
    const left = progress.unread().length;
    const caption = uiLabel(left > 0 ? t('guide.unread', { n: left }) : t('guide.allRead'), { size: 24, color: Color.inkSoft, anchorX: 1 });
    caption.position.set(w - 8, 36);
    scaffold.content.addChild(heading, caption);
    let y = 84;
    for (const def of topicsOf(section)) {
      const r = row(def.id, w);
      r.position.set(w / 2, y + ROW_H / 2);
      scaffold.content.addChild(r);
      y += ROW_H + ROW_GAP;
    }
    buildBar();
    scaffold.refresh();
    scaffold.scroller?.scrollTo(0, false);
    fadeIn();
  }

  // ───────────────────────── page ─────────────────────────

  function showPage(id: TopicId): void {
    page = id;
    section = topicDef(id).section;
    progress.markRead(id);
    clear();
    scaffold.setTitle(t('guide.title'));
    const def = topicDef(id);
    const w = scaffold.contentWidth;
    const pic = illustration(def.art, 208);
    pic.position.set(w / 2, 124);
    const tape = tapeStrip({ name: 'sky', pattern: 'dots', w: 96, h: 32, angle: -8 });
    tape.position.set(w / 2, 22);
    scaffold.content.addChild(pic, tape);
    let y = 252;
    const title = uiLabel(topicTitle(id), { size: 42, wrap: w - 24, align: 'center', anchorY: 0, lineHeight: 52 });
    title.position.set(w / 2, y);
    scaffold.content.addChild(title);
    y += title.height + 20;
    const short = uiLabel(topicTeach(id), { size: 28, wrap: w - 72, align: 'center', anchorY: 0, lineHeight: 38 });
    const strip = paperShape({ w, h: short.height + 40, radius: 24, fill: mixColor(Color.mustard, Color.paperLight, 0.72), seed: paperSeed(), grain: false });
    strip.position.set(w / 2, y + (short.height + 40) / 2);
    short.position.set(w / 2, y + 20);
    scaffold.content.addChild(strip, short);
    y += short.height + 40 + 26;
    for (const paragraph of topicFull(id)) {
      const text = uiLabel(paragraph, { size: 28, wrap: w - 16, align: 'left', anchorX: 0, anchorY: 0, lineHeight: 42 });
      text.position.set(8, y);
      scaffold.content.addChild(text);
      y += text.height + 18;
    }
    buildPageBar(id);
    scaffold.refresh();
    scaffold.scroller?.scrollTo(0, false);
    fadeIn();
  }

  function buildPageBar(id: TopicId): void {
    const def = topicDef(id);
    const same = topicsOf(def.section);
    const at = same.findIndex((d) => d.id === id);
    const bar = scaffold.actionBar;
    const w = scaffold.contentWidth;
    const control = host.tryControl && def.try?.control ? def.try.control : null;
    const tab = !control && host.goTab && def.try?.tab ? def.try.tab : null;
    const hasTry = control !== null || tab !== null;
    const bw = hasTry ? (w - 24) / 3 : (w - 16) / 2;
    const place = (b: Button, i: number, n: number): void => {
      b.position.set(-w / 2 + bw / 2 + i * (bw + (n === 3 ? 12 : 16)), 0);
      bar.addChild(b);
    };
    const prev = new Button({ label: t('guide.prev'), style: 'neutral', width: bw, height: 88, fontSize: 28 });
    const next = new Button({ label: t('guide.next'), style: 'neutral', width: bw, height: 88, fontSize: 28 });
    prev.onTap(() => {
      const to = same[at - 1];
      if (to) showPage(to.id);
      else showList();
    });
    next.onTap(() => {
      const to = same[at + 1];
      if (to) showPage(to.id);
      else showList();
    });
    const n = hasTry ? 3 : 2;
    place(prev, 0, n);
    if (hasTry) {
      const go = new Button({ label: t(control ? 'guide.try.battle' : 'guide.try.home'), style: 'primary', width: bw, height: 88, fontSize: 28, tape: 'pink' });
      go.onTap(() => {
        close(() => {
          if (control) host.tryControl?.(control, id);
          else if (tab) host.goTab?.(tab);
        });
      });
      place(go, 1, n);
    }
    place(next, n - 1, n);
    // The ends of a section's pages lead back to the list instead of nowhere.
    if (at === 0) prev.setLabel(t('guide.list'));
    if (at === same.length - 1) next.setLabel(t('guide.list'));
  }

  // ───────────────────────── frame ─────────────────────────

  function back(): void {
    if (page) showList();
    else close();
  }

  function close(after?: () => void): void {
    if (closed) return;
    closed = true;
    current = null;
    off();
    bag.killAll();
    void scaffold.hide(true).then(() => {
      scaffold.destroy({ children: true });
      after?.();
      opts.onClose?.();
    });
  }

  // Rebuilt after the handler that changed the language has returned.
  const off = i18nEvents.on('change', () =>
    queueMicrotask(() => {
      if (closed) return;
      if (page) showPage(page);
      else showList();
    }),
  );

  current = {
    close: () => {
      if (closed) return;
      closed = true;
      current = null;
      off();
      bag.killAll();
      scaffold.destroy({ children: true });
    },
  };
  if (page) showPage(page);
  else showList();
  void scaffold.show(true);
  return scaffold;
}

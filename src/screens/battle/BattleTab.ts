import { Container } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { featureHint, profile, type FeatureId } from '@/meta';
import { Button, ScrollView, TweenBag, toast } from '@/ui';
import { services, type ContentArea, type Shell, type TabScreen } from '../contract';
import { startBob, stopBob } from '../shell/bob';
import { ChapterCard, CHAPTER_CARD_H } from './ChapterCard';
import { ChestCard } from './ChestCard';
import { DailyCard } from './DailyCard';
import { EndlessCard } from './EndlessCard';
import type { HomeCard } from './HomeCard';
import { PatrolCard } from './PatrolCard';
import { PromoCard } from './PromoCard';
import { SweepCard } from './SweepCard';
import { TreatsCard } from './TreatsCard';
import { badgeCount, cardsVisible, chapterUnlocked, clampSelection, frontier, selectionAfterRun, type Selection } from './model';
import { loadPromo, promoActive } from './promo';
import './strings';

const MARGIN = 24;
const GAP = 20;
const CARD_W = 672;
const HALF_W = CARD_W / 2 - 10;
const START_H = 136;
const UPDATE_EVERY = 0.25;

/** What the tab last pointed at, kept across home-scene rebuilds so coming back from a battle lands where the player was. */
let remembered: Selection | null = null;
let seenRun = -2;

interface Entry {
  card: HomeCard;
  /** Feature that opens the card; null = open from the first run on. */
  feature: FeatureId | null;
  /** Shares a row with the next entry. */
  half?: boolean;
}

/** Everything that waits to be collected, for the tab-bar badge. */
function waitingCount(): number {
  const d = profile.data;
  const unlocked = (f: FeatureId): boolean => profile.featureUnlocked(f);
  const claimable = (tiers: readonly { reached: boolean; claimed: boolean }[]): number => tiers.filter((x) => x.reached && !x.claimed).length;
  const calendar = profile.calendarView();
  if (!cardsVisible(d.stats.runs)) return 0;
  return badgeCount({
    patrol: unlocked('patrol') && profile.patrolView().collectable,
    chest: profile.freeChestView().ready,
    calendar: calendar.canClaim || calendar.comebackReady,
    cup: unlocked('cup') ? claimable(profile.cupView().tiers) : 0,
    endless: unlocked('endless') ? claimable(profile.endlessView().tiers) : 0,
  });
}

/**
 * The home tab: the chapter card with its butler-level selector, the big start button, and below it
 * the cards for everything the player can collect or play today (patrol, free chest, sweep, treats,
 * the daily challenge, endless mode, the first-purchase pack).
 */
export class BattleTab implements TabScreen {
  readonly view = new Container();
  private readonly scroll = new ScrollView({ width: 720, height: 800, indicator: true });
  private readonly chapter: ChapterCard;
  private readonly start: Button;
  /** The start button sits in `bobber` (which moves) inside `startSlot` (which the layout places). */
  private readonly startSlot = new Container();
  private readonly bobber = new Container();
  private readonly bag = new TweenBag();
  private readonly entries: Entry[] = [];
  private readonly sweep: SweepCard;
  private promo: PromoCard | null = null;
  private area: ContentArea = { x: 0, y: 0, w: 720, h: 800 };
  private dirty = true;
  private clock = 0;
  private signature = '';
  private readonly off: () => void;

  constructor(private readonly shell: Shell) {
    this.view.addChild(this.scroll);
    const content = this.scroll.content;

    this.chapter = new ChapterCard({
      onChange: (sel) => this.onSelect(sel),
      onCalendar: () => services.openCalendar(),
    });
    this.start = new Button({ label: t('battle.start'), icon: 'play', style: 'primary', width: 600, height: START_H, fontSize: 64, tape: 'pink' });
    this.start.onTap(() => this.go());
    this.start.onDisabledTap(() => {
      toast(t('battle.chapter.locked'), 'info');
      audio.play('ui_error');
    });
    this.bobber.addChild(this.start);
    this.startSlot.addChild(this.bobber);
    content.addChild(this.chapter, this.startSlot);

    this.sweep = new SweepCard(HALF_W, shell);
    this.entries.push(
      { card: new PatrolCard(CARD_W, shell), feature: 'patrol' },
      { card: new ChestCard(HALF_W, shell), feature: null, half: true },
      { card: this.sweep, feature: 'sweep', half: true },
      { card: new TreatsCard(CARD_W, shell), feature: 'treat' },
      { card: new DailyCard(CARD_W, shell), feature: 'daily' },
      { card: new EndlessCard(CARD_W, shell), feature: 'endless' },
    );
    for (const e of this.entries) content.addChild(e.card);

    if (seenRun === -2) seenRun = profile.data.lastRun?.id ?? -1;
    this.applySelection(remembered ?? frontier(profile.data.cleared), false);
    this.off = profile.subscribe(() => {
      this.dirty = true;
    });
    void loadPromo().then(() => {
      this.dirty = true;
    });
  }

  show(): void {
    const last = profile.data.lastRun;
    if (last && last.id !== seenRun) {
      seenRun = last.id;
      this.applySelection(selectionAfterRun(profile.data.cleared, last, this.chapter.selection), true);
    }
    this.syncAll();
    startBob(this.bag, this.bobber);
  }

  hide(): void {
    stopBob(this.bag, this.bobber);
  }

  resize(area: ContentArea): void {
    this.area = area;
    this.view.position.set(area.x, area.y);
    this.scroll.setViewSize(area.w, area.h);
    this.signature = '';
    this.layout();
  }

  update(dt: number): void {
    for (const e of this.entries) if (!e.card.locked) e.card.tick(dt);
    this.promo?.tick(dt);
    this.clock += dt;
    if (this.dirty || this.clock >= UPDATE_EVERY) {
      this.clock = 0;
      if (this.dirty) this.syncAll();
      else this.syncCalendar();
    }
  }

  badge(): number {
    return waitingCount();
  }

  destroy(): void {
    this.off();
    this.bag.killAll();
    this.view.destroy({ children: true });
  }

  /** Point the cards at a selection (after a run, or from the chapter card's own controls). */
  private applySelection(sel: Selection, animate: boolean): void {
    const clamped = clampSelection(profile.data.cleared, sel);
    remembered = clamped;
    this.chapter.setSelection(clamped, animate);
    this.sweep.setTarget(clamped);
    this.syncStart();
  }

  private onSelect(sel: Selection): void {
    remembered = sel;
    this.sweep.setTarget(sel);
    this.syncStart();
  }

  private syncStart(): void {
    const { chapter } = this.chapter.selection;
    this.start.setEnabled(chapterUnlocked(profile.data.cleared, chapter));
  }

  private go(): void {
    const { chapter, stake } = this.chapter.selection;
    void this.shell.startRun({ mode: 'chapter', chapter, stake });
  }

  private syncCalendar(): void {
    const cal = profile.calendarView();
    this.chapter.calendarButton.setBadge(cal.canClaim || cal.comebackReady);
  }

  /** Re-read the profile into every widget; the layout is redone only when a card appeared or went away. */
  private syncAll(): void {
    this.dirty = false;
    this.chapter.sync();
    this.syncStart();
    this.syncCalendar();
    const showCards = cardsVisible(profile.data.stats.runs);
    for (const e of this.entries) {
      e.card.visible = showCards;
      e.card.setLocked(e.feature && !profile.featureUnlocked(e.feature) ? featureHint(e.feature) : null);
      if (showCards) e.card.sync();
    }
    const wantPromo = showCards && promoActive();
    if (wantPromo && !this.promo) {
      this.promo = new PromoCard(CARD_W, this.shell);
      this.scroll.content.addChild(this.promo);
    } else if (!wantPromo && this.promo) {
      this.promo.destroy({ children: true });
      this.promo = null;
    }
    this.promo?.sync();
    this.layout();
  }

  private layout(): void {
    const showCards = cardsVisible(profile.data.stats.runs);
    const signature = `${showCards ? 1 : 0}${this.promo ? 1 : 0}`;
    if (signature === this.signature) return;
    this.signature = signature;
    const x = (this.area.w - CARD_W) / 2;
    let y = MARGIN - 8;
    this.chapter.position.set(x, y);
    y += CHAPTER_CARD_H + GAP;
    this.startSlot.position.set(this.area.w / 2, y + START_H / 2);
    y += START_H + GAP + 8;
    if (showCards) {
      if (this.promo) {
        this.promo.position.set(x, y);
        y += this.promo.cardH + GAP;
      }
      for (let i = 0; i < this.entries.length; i++) {
        const e = this.entries[i] as Entry;
        const next = e.half ? (this.entries[i + 1] as Entry) : null;
        if (next) {
          const h = Math.max(e.card.cardH, next.card.cardH);
          e.card.position.set(x, y);
          next.card.position.set(x + CARD_W - next.card.cardW, y);
          y += h + GAP;
          i++;
        } else {
          e.card.position.set(x, y);
          y += e.card.cardH + GAP;
        }
      }
    }
    this.scroll.setContentSize(this.area.w, y + MARGIN);
    this.scroll.refresh();
  }
}

/** The missions tab: daily and weekly sub-tabs over one scrolling body. */
import { Container } from 'pixi.js';
import { audio } from '@/audio';
import { i18nEvents, t } from '@/core/i18n';
import { errorKey, profile } from '@/meta';
import { featureHint } from '@/meta/features';
import type { Bundle, Result } from '@/meta/types';
import { Badge } from '@/ui/Badge';
import { ScrollView } from '@/ui/ScrollView';
import { SegmentTabs } from '@/ui/TabBar';
import { toast } from '@/ui/Toast';
import type { ContentArea, Shell, TabScreen } from '../contract';
import { services } from '../contract';
import { payout } from '../system/kit/claimFx';
import { partsOf } from '../system/kit/parts';
import { lockedNote } from '../system/kit/sheets';
import { DailySection } from './DailySection';
import { missionBadges } from './model';
import type { MissionActions, Section } from './sections';
import { WeeklySection } from './WeeklySection';
import './strings';

type Sub = 'daily' | 'weekly';

const SIDE = 24;
const SEG_W = 600;
const SEG_H = 76;
const HEAD_H = 112;
const REFRESH_EVERY = 20;

export class MissionsTab implements TabScreen {
  readonly view = new Container();
  private area: ContentArea;
  private sub: Sub = 'daily';
  private seg: SegmentTabs | null = null;
  private readonly dots: Badge[] = [];
  private scroller: ScrollView | null = null;
  private lock: Container | null = null;
  private readonly sections: Partial<Record<Sub, Section>> = {};
  private signature = '';
  private shown = false;
  private claiming = false;
  private sinceRefresh = 0;
  private offChange: (() => void) | null = null;
  private offLang: (() => void) | null = null;

  private readonly actions: MissionActions = {
    claimMission: (scope, index, from) => this.settle(() => profile.claimMission(scope, index), from),
    claimDailyChest: (from) => this.settle(() => profile.claimDailyChest(), from),
    claimWeeklyChest: (from) => this.settle(() => profile.claimWeeklyChest(), from),
    claimCup: (tier, from) => this.settle(() => profile.claimCup(tier), from),
    claimEndless: (tier, from) => this.settle(() => profile.claimEndless(tier), from),
    openOdds: (kind) => services.openOdds(kind),
    goBattle: () => this.shell.goTab('battle'),
    goDaily: () => this.select('daily'),
  };

  constructor(private readonly shell: Shell) {
    this.area = { ...shell.area };
  }

  /** What the content depends on besides the profile's numbers: unlock states and the language. */
  private currentSignature(): string {
    const u = (f: 'missions' | 'cup' | 'endless'): string => (profile.featureUnlocked(f) ? '1' : '0');
    return `${u('missions')}${u('cup')}${u('endless')}${t('rt.mis.tab.daily')}`;
  }

  private ensureBuilt(): void {
    const sig = this.currentSignature();
    if (sig === this.signature) return;
    this.signature = sig;
    this.teardown();
    if (!profile.featureUnlocked('missions')) {
      this.lock = lockedNote(this.area.w - SIDE * 2, featureHint('missions'));
      this.view.addChild(this.lock);
      this.layout();
      return;
    }
    const seg = new SegmentTabs({
      tabs: [
        { id: 'daily', label: t('rt.mis.tab.daily') },
        { id: 'weekly', label: t('rt.mis.tab.weekly') },
      ],
      width: SEG_W,
      height: SEG_H,
      selected: this.sub,
    });
    seg.onSelect((id) => this.select(id === 'weekly' ? 'weekly' : 'daily'));
    this.seg = seg;
    const cellW = (SEG_W - 12) / 2;
    for (let i = 0; i < 2; i++) {
      const dot = new Badge({ size: 26 });
      dot.position.set(-SEG_W / 2 + 6 + cellW * (i + 0.5) + cellW / 2 - 30, -SEG_H / 2 + 12);
      seg.addChild(dot);
      this.dots.push(dot);
    }
    this.scroller = new ScrollView({ width: this.area.w, height: Math.max(0, this.area.h - HEAD_H), padding: SIDE, paddingBottom: SIDE + 16 });
    this.view.addChild(this.scroller, seg);
    this.mount();
    this.layout();
  }

  private teardown(): void {
    for (const key of Object.keys(this.sections) as Sub[]) {
      this.sections[key]?.destroy();
      delete this.sections[key];
    }
    this.dots.length = 0;
    this.seg = null;
    this.scroller = null;
    this.lock = null;
    for (const c of this.view.removeChildren()) c.destroy({ children: true });
  }

  private section(sub: Sub): Section {
    let s = this.sections[sub];
    if (!s) {
      const w = this.area.w - SIDE * 2;
      s = sub === 'daily' ? new DailySection(w, this.actions) : new WeeklySection(w, this.actions);
      this.sections[sub] = s;
    }
    return s;
  }

  /** Put the active section into the scroll body. */
  private mount(): void {
    const sc = this.scroller;
    if (!sc) return;
    sc.content.removeChildren();
    const s = this.section(this.sub);
    sc.content.addChild(s.view);
    s.sync(false);
    sc.refresh();
  }

  private select(sub: Sub): void {
    if (sub === this.sub && this.scroller?.content.children.length) return;
    this.sub = sub;
    this.seg?.select(sub);
    this.mount();
    this.scroller?.scrollToTop(false);
  }

  private layout(): void {
    const { x, y, w, h } = this.area;
    this.view.position.set(x, y);
    this.seg?.position.set(w / 2, 20 + SEG_H / 2);
    if (this.scroller) {
      this.scroller.position.set(0, HEAD_H);
      this.scroller.setViewSize(w, Math.max(0, h - HEAD_H));
    }
    this.lock?.position.set(SIDE, 40);
  }

  private syncAll(animate: boolean): void {
    this.sections[this.sub]?.sync(animate);
    const b = missionBadges(profile);
    this.dots[0]?.set(b.daily);
    this.dots[1]?.set(b.weekly);
    this.scroller?.refresh();
  }

  /**
   * Run a claim command and apply its outcome: feedback on success, a toast and a resync on refusal.
   * The profile announces the change from inside the command, so the guard goes up before it runs; otherwise
   * the row would be brought to its claimed state silently first and the check, pen line and stamp never play.
   */
  private settle(run: () => Result<Bundle>, from: Container): void {
    this.claiming = true;
    try {
      const r = run();
      if (!r.ok) {
        audio.play('ui_error');
        toast(t(errorKey(r.error)), 'warning');
        this.syncAll(false);
        return;
      }
      this.shell.refresh();
      this.syncAll(true);
      void payout(this.shell, partsOf(r.value), from, t('rt.common.reward'));
    } finally {
      this.claiming = false;
    }
  }

  private readonly onChange = (): void => {
    if (this.claiming || !this.shown) return;
    if (this.currentSignature() !== this.signature) {
      this.ensureBuilt();
      return;
    }
    this.syncAll(false);
  };

  private readonly onLang = (): void => {
    if (this.shown) this.ensureBuilt();
  };

  show(): void {
    this.shown = true;
    profile.refresh();
    this.ensureBuilt();
    this.syncAll(false);
    this.offChange ??= profile.subscribe(this.onChange);
    this.offLang ??= i18nEvents.on('change', this.onLang);
  }

  hide(): void {
    this.shown = false;
    this.offChange?.();
    this.offChange = null;
    this.offLang?.();
    this.offLang = null;
  }

  resize(area: ContentArea): void {
    const widthChanged = area.w !== this.area.w;
    this.area = { ...area };
    if (widthChanged) this.signature = '';
    if (this.shown && widthChanged) this.ensureBuilt();
    this.layout();
  }

  update(dt: number): void {
    if (!this.shown) return;
    this.sections[this.sub]?.second(profile.now());
    this.sinceRefresh += dt;
    if (this.sinceRefresh >= REFRESH_EVERY) {
      this.sinceRefresh = 0;
      profile.refresh();
    }
  }

  badge(): number | boolean {
    return missionBadges(profile).total;
  }

  destroy(): void {
    this.hide();
    this.teardown();
    this.view.destroy({ children: true });
  }
}

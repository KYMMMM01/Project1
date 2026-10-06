import { Container } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { CLASS_IDS, type ClassId } from '@/game/api';
import { profile } from '@/meta';
import type { UnitView } from '@/meta/economy';
import { ScrollView, SegmentTabs } from '@/ui';
import type { ContentArea, TabScreen } from '../contract';
import { ClassSheet } from './ClassSheet';
import { CLASS_GROUPS, cardProgress, isUpgradeReady, upgradeReadyCount, visibleGroups, type ClassFilter } from './collection';
import { openUnitScreen } from './UnitScreen';
import { WildStrip } from './WildStrip';

const SIDE = 12;
const NAV_H = 100;
/** Room above a sheet for the label that hangs over its top edge. */
const LABEL_OVER = 40;
const GAP = 22;

/**
 * The cats tab: a class filter on top, then the wild cards in hand and one page per class showing its fixed line
 * of five cats (merge, merge, merge, awaken). A tap on any photo opens the unit screen.
 */
class CatsTab implements TabScreen {
  readonly view = new Container();
  private readonly scroll: ScrollView;
  private readonly wild: WildStrip;
  private readonly sheets = new Map<ClassId, ClassSheet>();
  private nav: SegmentTabs | null = null;
  private area: ContentArea = { x: 0, y: 0, w: 720, h: 1000 };
  private filter: ClassFilter = 'all';
  private ready = 0;
  private visible = false;
  private dirty = true;
  private builtW = 0;
  private offProfile: (() => void) | null = null;

  constructor() {
    this.scroll = new ScrollView({ width: 720, height: 900, padding: 0, paddingBottom: 24 });
    this.wild = new WildStrip(720 - SIDE * 2);
    this.scroll.content.addChild(this.wild);
    this.view.addChild(this.scroll);
    for (const g of CLASS_GROUPS) {
      const sheet = new ClassSheet(g.classId, 720 - SIDE * 2, (unit) => openUnitScreen(unit));
      this.sheets.set(g.classId, sheet);
      this.scroll.content.addChild(sheet);
    }
    this.builtW = 720;
    this.ready = upgradeReadyCount(profile.units());
    this.offProfile = profile.subscribe(() => {
      this.ready = upgradeReadyCount(profile.units());
      this.dirty = true;
      if (this.visible) this.refreshViews();
    });
  }

  private buildNav(): void {
    this.nav?.destroy();
    const nav = new SegmentTabs({
      tabs: [{ id: 'all', label: t('cats.filter.all') }, ...CLASS_IDS.map((id) => ({ id, label: t(`class.${id}.name`) }))],
      width: this.area.w - SIDE * 2,
      height: 88,
      selected: this.filter,
    });
    nav.onSelect((id) => {
      this.filter = id as ClassFilter;
      audio.play('ui_tab');
      this.layout();
      this.scroll.scrollToTop(false);
    });
    nav.position.set(this.area.x + this.area.w / 2, this.area.y + 8 + 44);
    this.view.addChild(nav);
    this.nav = nav;
  }

  private layout(): void {
    let y = LABEL_OVER - 6;
    this.wild.position.set(SIDE, y);
    y += this.wild.stripH + GAP;
    const shown = new Set<ClassId>(visibleGroups(this.filter).map((g) => g.classId));
    for (const g of CLASS_GROUPS) {
      const sheet = this.sheets.get(g.classId) as ClassSheet;
      sheet.visible = shown.has(g.classId);
      if (!sheet.visible) continue;
      y += LABEL_OVER;
      sheet.position.set(SIDE, y);
      y += sheet.sheetH + GAP;
    }
    this.scroll.refresh();
  }

  private refreshViews(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const byId = new Map<string, UnitView>(profile.units().map((v) => [v.id, v]));
    for (const g of CLASS_GROUPS) {
      const row = (this.sheets.get(g.classId) as ClassSheet).row;
      for (const id of g.base) {
        const v = byId.get(id) as UnitView;
        row.frames.get(id)?.setState({ level: v.level, progress: cardProgress(v), ready: isUpgradeReady(v) });
      }
      const king = byId.get(g.base[3]) as UnitView;
      row.frames.get(g.guardian)?.setState({ level: king.level, progress: null, ready: false });
    }
    this.wild.set(profile.data.wild);
  }

  show(): void {
    this.visible = true;
    this.dirty = true;
    this.refreshViews();
  }

  hide(): void {
    this.visible = false;
  }

  resize(area: ContentArea): void {
    this.area = area;
    this.scroll.position.set(area.x, area.y + NAV_H);
    this.scroll.setViewSize(area.w, area.h - NAV_H);
    if (!this.nav || area.w !== this.builtW) this.buildNav();
    this.builtW = area.w;
    this.nav?.position.set(area.x + area.w / 2, area.y + 8 + 44);
    this.layout();
    this.dirty = true;
    if (this.visible) this.refreshViews();
  }

  update(): void {}

  badge(): number {
    return this.ready;
  }

  destroy(): void {
    this.offProfile?.();
    this.offProfile = null;
    this.view.destroy({ children: true });
  }
}

export function createCatsTabView(): TabScreen {
  return new CatsTab();
}

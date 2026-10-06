import { Container, Graphics, Rectangle, type DestroyOptions, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { CLASS_IDS, type ClassId } from '@/game/api';
import { profile } from '@/meta';
import type { UnitView } from '@/meta/economy';
import { CHEST_RARITIES, type ChestRarity } from '@/meta/types';
import {
  bindPress, Color, drawIcon, drawPill, fitLabel, Rarity, ScrollView, uiLabel, vGradient, type IconName, type PressBinding,
} from '@/ui';
import { classIcon } from '../shop/keys';
import type { ContentArea, TabScreen } from '../contract';
import { CatCard, CARD_CREST, CARD_H, CARD_W } from './CatCard';
import { CLASS_GROUPS, cardProgress, isUpgradeReady, upgradeReadyCount, visibleGroups, type ClassFilter } from './collection';
import { openUnitScreen } from './UnitScreen';

const SIDE = 20;
const COL_GAP = 20;
const CHIP_H = 88;
const HEADER_H = 134;
const WILD_H = 62;

/** A filter chip: icon over a short label. The pressed state shows on the pointerdown frame. */
class FilterChip extends Container {
  private readonly bg = new Graphics();
  private readonly press: PressBinding;
  private selected = false;
  private pressed = false;
  private w: number;

  constructor(readonly id: ClassFilter, icon: IconName, text: string, w: number, onPick: (id: ClassFilter) => void) {
    super();
    this.w = w;
    const ic = drawIcon(icon, 40);
    ic.position.set(0, -17);
    const lb = uiLabel(text, { size: 24, strokeWidth: 4, shadow: false });
    fitLabel(lb, w - 8, 24);
    lb.position.set(0, 25);
    this.addChild(this.bg, ic, lb);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.press = bindPress(this, {
      down: () => {
        this.pressed = true;
        this.draw();
      },
      up: (fire) => {
        this.pressed = false;
        this.draw();
        if (fire) {
          audio.play('ui_tab');
          onPick(id);
        }
      },
    });
    this.setWidth(w);
  }

  setWidth(w: number): void {
    this.w = w;
    this.hitArea = new Rectangle(-w / 2, -CHIP_H / 2, w, CHIP_H);
    this.draw();
  }

  setSelected(v: boolean): void {
    this.selected = v;
    this.draw();
  }

  private draw(): void {
    const w = this.w;
    const g = this.bg;
    const dy = this.pressed ? 4 : 0;
    g.clear();
    g.roundRect(-w / 2, -CHIP_H / 2 + dy, w, CHIP_H, 22)
      .fill(vGradient(this.selected ? Color.primary : Color.panelLight, this.selected ? Color.primaryDark : Color.panel))
      .stroke({ width: 4, color: Color.outline, alignment: 1 });
    g.roundRect(-w / 2 + 6, -CHIP_H / 2 + 6 + dy, w - 12, CHIP_H * 0.34, 14).fill({ color: Color.white, alpha: this.selected ? 0.3 : 0.1 });
  }

  override destroy(options?: DestroyOptions): void {
    this.press.dispose();
    super.destroy(options);
  }
}

interface WildPill {
  rarity: ChestRarity;
  text: Text;
  box: Graphics;
}

class CatsTab implements TabScreen {
  readonly view = new Container();
  private readonly scroll: ScrollView;
  private readonly chips: FilterChip[] = [];
  private readonly cards = new Map<string, CatCard>();
  private readonly headers = new Map<ClassId, Container>();
  private readonly arrows = new Map<ClassId, Container>();
  private readonly backdrop = new Graphics();
  private readonly wildRow = new Container();
  private readonly wildPills: WildPill[] = [];
  private area: ContentArea = { x: 0, y: 0, w: 720, h: 1000 };
  private filter: ClassFilter = 'all';
  private ready = 0;
  private visible = false;
  private dirty = true;
  private offProfile: (() => void) | null = null;

  constructor() {
    this.scroll = new ScrollView({ width: 720, height: 1000, padding: 0, paddingBottom: 24 });
    this.view.addChild(this.backdrop, this.scroll);
    this.build();
    this.ready = upgradeReadyCount(profile.units());
    this.offProfile = profile.subscribe(() => {
      this.ready = upgradeReadyCount(profile.units());
      this.dirty = true;
      if (this.visible) this.refreshViews();
    });
  }

  private build(): void {
    const c = this.scroll.content;
    const filters: { id: ClassFilter; icon: IconName; text: string }[] = [
      { id: 'all', icon: 'paw', text: t('cats.filter.all') },
      ...CLASS_IDS.map((id) => ({ id: id as ClassFilter, icon: classIcon(id), text: t(`class.${id}.name`) })),
    ];
    for (const f of filters) {
      const chip = new FilterChip(f.id, f.icon, f.text, 128, (id) => this.setFilter(id));
      this.chips.push(chip);
      c.addChild(chip);
    }
    this.chips[0]?.setSelected(true);

    c.addChild(this.wildRow);
    for (const rarity of CHEST_RARITIES) {
      const box = new Graphics();
      const text = uiLabel('', { size: 24, strokeWidth: 4, shadow: false });
      this.wildRow.addChild(box, text);
      this.wildPills.push({ rarity, text, box });
    }

    for (const g of CLASS_GROUPS) {
      const head = new Container();
      const ic = drawIcon(classIcon(g.classId), 64);
      ic.position.set(40, 40);
      const name = uiLabel(t(`class.${g.classId}.name`), { size: 40, strokeWidth: 6, anchorX: 0 });
      name.position.set(92, 30);
      const role = uiLabel(t(`class.${g.classId}.role`), {
        size: 24, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: 580, lineHeight: 30,
      });
      role.position.set(92, 62);
      head.addChild(ic, name, role);
      this.headers.set(g.classId, head);
      c.addChild(head);

      const arrow = new Container();
      const ar = drawIcon('arrow_up', 56, Rarity.mythic.light);
      ar.rotation = Math.PI / 2;
      const lab = uiLabel(t('cats.awakens'), { size: 24, color: Rarity.mythic.light, strokeWidth: 4, shadow: false });
      lab.position.set(0, 46);
      arrow.addChild(ar, lab);
      this.arrows.set(g.classId, arrow);
      c.addChild(arrow);

      for (const id of [...g.base, g.guardian]) {
        const card = new CatCard(id, 0.95, id === g.guardian).onTap((u) => openUnitScreen(u));
        this.cards.set(id, card);
        c.addChild(card);
      }
    }
  }

  private setFilter(f: ClassFilter): void {
    this.filter = f;
    this.chips.forEach((chip) => chip.setSelected(chip.id === f));
    this.layout();
    this.scroll.scrollToTop(false);
  }

  private layout(): void {
    const w = this.area.w;
    const chipW = (w - SIDE * 2 - 4 * 10) / 5;
    this.chips.forEach((chip, i) => {
      chip.setWidth(chipW);
      chip.position.set(SIDE + chipW / 2 + i * (chipW + 10), 14 + CHIP_H / 2);
    });
    let y = 14 + CHIP_H + 16;
    this.layoutWild(y, w);
    y += WILD_H + 14;

    const scale = Math.min(1, (w - SIDE * 2 - COL_GAP * 2) / (CARD_W * 3));
    const cw = CARD_W * scale;
    const ch = CARD_H * scale;
    const rowPitch = ch + CARD_CREST + 26;
    const x0 = (w - (cw * 3 + COL_GAP * 2)) / 2 + cw / 2;
    const cols = [x0, x0 + cw + COL_GAP, x0 + (cw + COL_GAP) * 2] as const;
    const shown = new Set<ClassId>(visibleGroups(this.filter).map((g) => g.classId));

    for (const g of CLASS_GROUPS) {
      const head = this.headers.get(g.classId) as Container;
      const arrow = this.arrows.get(g.classId) as Container;
      const on = shown.has(g.classId);
      head.visible = on;
      arrow.visible = on;
      const units = [...g.base, g.guardian];
      for (const id of units) (this.cards.get(id) as CatCard).visible = on;
      if (!on) continue;
      head.position.set(SIDE, y);
      y += HEADER_H;
      const r1 = y + CARD_CREST + ch / 2;
      const r2 = r1 + rowPitch;
      units.forEach((id, i) => {
        const card = this.cards.get(id) as CatCard;
        card.scale.set(scale);
        const col = i < 3 ? i : i === 3 ? 0 : 2;
        card.position.set(cols[col], i < 3 ? r1 : r2);
      });
      arrow.position.set(cols[1], r2 - 12);
      y = r2 + ch / 2 + 40;
    }
    this.scroll.refresh();
  }

  private layoutWild(y: number, w: number): void {
    this.wildRow.position.set(0, y);
    const n = this.wildPills.length;
    const pw = (w - SIDE * 2 - (n - 1) * 8) / n;
    this.wildPills.forEach((p, i) => {
      const x = SIDE + i * (pw + 8);
      p.box.clear();
      drawPill(p.box, x, 0, pw, WILD_H, { top: Color.panelLight, bottom: Color.panelDark, gloss: 0.15, shadow: false });
      p.box.roundRect(x + 10, 17, 10, 28, 5).fill(Rarity[p.rarity].color);
      p.text.position.set(x + 28 + (pw - 34) / 2, WILD_H / 2);
    });
  }

  private refreshViews(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const byId = new Map<string, UnitView>(profile.units().map((v) => [v.id, v]));
    for (const g of CLASS_GROUPS) {
      for (const id of g.base) {
        const v = byId.get(id) as UnitView;
        (this.cards.get(id) as CatCard).setState({ level: v.level, progress: cardProgress(v), ready: isUpgradeReady(v) });
      }
      const legend = byId.get(g.base[3]) as UnitView;
      (this.cards.get(g.guardian) as CatCard).setState({ level: legend.level, progress: null, ready: false });
    }
    const wild = profile.data.wild;
    const pw = (this.area.w - SIDE * 2 - (this.wildPills.length - 1) * 8) / this.wildPills.length - 34;
    for (const p of this.wildPills) {
      p.text.text = `${t('rarity.' + p.rarity)} ${fmt(wild[p.rarity])}`;
      fitLabel(p.text, pw, 24);
    }
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
    this.backdrop.clear().rect(area.x, area.y, area.w, area.h).fill({ color: Color.bgDeep, alpha: 0.82 });
    this.scroll.position.set(area.x, area.y);
    this.scroll.setViewSize(area.w, area.h);
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

/**
 * The profile screen (docs/명세_프로필꾸미기.md 3): the home's profile circle and name plate, large and pinned on top, and under them the
 * things to pick from, three tabs of a grid (icons, rings, plates). A thing the player does not have yet shows dimmed with a padlock; tapping
 * it still shows it on the preview and says how to get it. "Apply" wears what was picked (what the player does not own is left out).
 */
import { Container, Graphics, Rectangle } from 'pixi.js';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { accountProgress, BASE_UNITS, featureHint, profile, type CosmeticRow } from '@/meta';
import { achievementDef, achievementText } from '@/meta/achievements';
import { account } from '@/platform';
import { Button, Color, ScreenScaffold, ScrollView, SegmentTabs, Toggle, bindPress, drawIcon, drawPaper, fitLabel, paperSeed, toast, uiLabel } from '@/ui';
import { services } from '../contract';
import { FRAME_BOX_W, PLATE_ART_H, PLATE_ART_W } from '../shell/layoutMath';
import { Avatar, LevelBadge } from '../shell/LevelBadge';
import { NamePlate } from '../shell/NamePlate';
import { changeNameFlow } from './nameDialog';
import { onNameChange, shownName } from './profileName';
import './strings';

type Slot = 'icon' | 'frame' | 'plate';
const SLOTS: readonly Slot[] = ['icon', 'frame', 'plate'];

const PAD = 24;
/** The badge and plate on top, and room under a three-line "how to get it" (English can wrap that far) for the "see in shop" button. */
const PREVIEW_H = 372;
const SHOP_BTN_H = 64;
/** The preview badge is the home's, scaled up; the text column starts to its right. */
const BADGE_SCALE = 1.7;
const TEXT_X = 216;
const SEG_H = 80;
const TOGGLE_H = 84;
const GAP = 12;
const BAR_H = 112;
/** Grid: the scroll view keeps a little room around the cells so a picked cell's outline is not cut. */
const EDGE = 6;
const CELL_GAP = 16;
const COLS: Record<Slot, number> = { icon: 4, frame: 4, plate: 2 };
const CELL_H: Record<Slot, number> = { icon: 156, frame: 156, plate: 92 };

let current: ScreenScaffold | null = null;
let closeNow: (() => void) | null = null;

/** Close the screen at once (the home scene is going away). */
export function closeProfile(): void {
  closeNow?.();
}

export function openProfile(): void {
  if (current) return;
  const scaffold = new ScreenScaffold({ title: t('prof.title'), onBack: () => close(), scroll: false, actionBarHeight: BAR_H });
  current = scaffold;
  game.popupLayer.addChild(scaffold);
  let closed = false;
  let tab: Slot = 'icon';
  let ownedOnly = false;
  /** What the preview wears: starts as what the profile wears. */
  const pick: Record<Slot, string> = { ...profile.look };
  const preview = new Container();
  const gridHost = new Container();
  /** Where the grid starts (below the tabs and the toggle) and the height left for it, set by build(). */
  let gridY = 0;
  let gridH = 0;
  let cellMarks: Array<{ id: string; mark: Graphics }> = [];
  let apply: Button | null = null;

  const rowsOf = (): CosmeticRow[] => profile.cosmetics().filter((r) => r.kind === tab);
  const applicable = (): Slot[] => SLOTS.filter((k) => pick[k] !== profile.look[k] && profile.owns(pick[k]));

  const achvName = (key: string): string => {
    const def = achievementDef(key);
    return def ? achievementText(def).name : key;
  };
  const howTo = (row: CosmeticRow): string => {
    const s = row.source;
    let line: string;
    if (s.type === 'default') line = t('prof.how.default');
    else if (s.type === 'unit') line = (BASE_UNITS as readonly string[]).includes(s.unit) ? t('prof.how.cat') : t(row.owned ? 'prof.how.guardian.got' : 'prof.how.guardian');
    else if (row.owned && (s.type === 'gold' || s.type === 'gems' || s.type === 'achievement')) line = t('prof.how.bought');
    else if (s.type === 'gold' || s.type === 'gems') line = t('prof.how.shop');
    else if (s.type === 'achievement') line = t(row.forSale ? 'prof.how.achv.open' : 'prof.how.achv', { name: achvName(s.key) });
    else if (s.type === 'honor') line = t('prof.how.honor', { name: achvName(s.key) });
    else if (s.type === 'rank') line = t('prof.how.rank.' + s.tier);
    else line = t('prof.how.other');
    const shopItem = s.type === 'gold' || s.type === 'gems' || s.type === 'achievement';
    // The shop's own lock goes on a line of its own.
    if (shopItem && !row.owned && !profile.featureUnlocked('cosmetics')) line += `\n${t('prof.shopLocked', { hint: featureHint('cosmetics') })}`;
    return line;
  };

  /** The big card on top: the badge and the plate as the home draws them, the picked thing's name and how to get it. */
  const drawPreview = (): void => {
    for (const c of preview.removeChildren()) c.destroy({ children: true });
    const w = scaffold.contentWidth;
    const badge = new LevelBadge();
    badge.setIcon(pick.icon);
    badge.setFrame(pick.frame);
    badge.setLevel(accountProgress(profile.data.accountXp).level);
    badge.scale.set(BADGE_SCALE);
    badge.position.set((TEXT_X - GAP) / 2, PREVIEW_H / 2 - 10);
    const room = w - TEXT_X;
    const plate = new NamePlate();
    plate.setName(shownName());
    plate.setPlate(pick.plate);
    // Sized by the drawn plate's whole picture, so a plate's ends stay inside the column.
    const k = room / PLATE_ART_W;
    plate.scale.set(k);
    const plateH = PLATE_ART_H * k;
    plate.position.set(TEXT_X + room / 2, plateH / 2);
    preview.addChild(badge, plate);
    const row = profile.cosmetics().find((r) => r.id === pick[tab]);
    if (!row) return;
    const name = uiLabel(t('meta.cos.' + row.id), { size: 32, anchorX: 0, align: 'left' });
    fitLabel(name, room, 32);
    name.position.set(TEXT_X, 6 + plateH + 40);
    const how = uiLabel(howTo(row), { size: 26, color: Color.inkSoft, wrap: room, anchorX: 0, anchorY: 0, align: 'left' });
    how.position.set(TEXT_X, name.y + 24);
    preview.addChild(name, how);
    // Not owned and on sale now: the shop's cosmetics block sells it.
    if (!row.owned && row.forSale && profile.featureUnlocked('cosmetics')) {
      const toShop = new Button({ label: t('prof.toShop'), style: 'info', width: Math.min(room, 260), height: SHOP_BTN_H, fontSize: 28 });
      toShop.position.set(TEXT_X + Math.min(room, 260) / 2, how.y + how.height + 10 + SHOP_BTN_H / 2);
      toShop.onTap(() => {
        close();
        services.openShop('cosmetics');
      });
      preview.addChild(toShop);
    }
  };

  const syncApply = (): void => {
    apply?.setEnabled(applicable().length > 0);
  };

  const select = (id: string): void => {
    pick[tab] = id;
    for (const m of cellMarks) m.mark.visible = m.id === id;
    drawPreview();
    syncApply();
  };

  const cell = (row: CosmeticRow, w: number, h: number): Container => {
    const c = new Container();
    const face = new Graphics();
    drawPaper(face, 0, 0, { w, h, radius: 20, fill: row.owned ? Color.paperLight : Color.track, edge: Color.kraftDark, edgeWidth: 3, edgeAlpha: 0.8, grain: false, shadow: 3, seed: paperSeed() });
    let art: Container;
    if (tab === 'plate') {
      const plate = new NamePlate();
      plate.setPlate(row.id);
      plate.scale.set((w - 16) / PLATE_ART_W);
      art = plate;
    } else {
      const avatar = new Avatar();
      avatar.setIcon(tab === 'frame' ? pick.icon : row.id);
      // A frame cell shows the frame's whole picture; an icon cell, the cat in the paper ring.
      if (tab === 'frame') avatar.setFrame(row.id);
      avatar.scale.set((h - 20) / FRAME_BOX_W);
      art = avatar;
    }
    art.position.set(w / 2, h / 2);
    art.alpha = row.owned ? 1 : 0.4;
    const mark = new Graphics();
    mark.roundRect(-2, -2, w + 4, h + 4, 22).stroke({ width: 6, color: Color.teal });
    mark.visible = row.id === pick[tab];
    c.addChild(face, art, mark);
    if (!row.owned) {
      const lock = drawIcon('lock', 44, Color.ink);
      lock.position.set(w / 2, h / 2);
      c.addChild(lock);
    }
    if (row.equipped) {
      const on = new Graphics();
      on.circle(w - 22, 22, 16).fill(Color.teal);
      const check = drawIcon('check', 20, Color.white);
      check.position.set(w - 22, 22);
      c.addChild(on, check);
    }
    c.hitArea = new Rectangle(0, 0, w, h);
    c.eventMode = 'static';
    bindPress(c, {
      down: () => (c.alpha = 0.85),
      up: (fire) => {
        c.alpha = 1;
        if (fire) select(row.id);
      },
    });
    cellMarks.push({ id: row.id, mark });
    return c;
  };

  /** Equipped first, then owned, then what the shop sells now, then locked; the catalogue's order inside each. */
  const sorted = (rows: CosmeticRow[]): CosmeticRow[] => {
    const rank = (r: CosmeticRow): number => (r.equipped ? 0 : r.owned ? 1 : r.forSale ? 2 : 3);
    return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
  };

  const buildGrid = (): void => {
    for (const c of gridHost.removeChildren()) c.destroy({ children: true });
    cellMarks = [];
    const w = scaffold.contentWidth;
    const cols = COLS[tab];
    const cw = (w - EDGE * 2 - CELL_GAP * (cols - 1)) / cols;
    const ch = CELL_H[tab];
    const rows = sorted(rowsOf().filter((r) => r.owned || !ownedOnly));
    const view = new ScrollView({ width: w, height: gridH, padding: EDGE });
    rows.forEach((row, i) => {
      const c = cell(row, cw, ch);
      c.position.set((i % cols) * (cw + CELL_GAP), Math.floor(i / cols) * (ch + CELL_GAP));
      view.content.addChild(c);
    });
    gridHost.position.set(0, gridY);
    gridHost.addChild(view);
    syncApply();
  };

  const build = (): void => {
    if (closed) return;
    // The preview and the grid host live as long as the screen; everything else is rebuilt.
    for (const c of scaffold.content.removeChildren()) if (c !== preview && c !== gridHost) c.destroy({ children: true });
    const w = scaffold.contentWidth;
    drawPreview();
    let y = PREVIEW_H + GAP;
    const seg = new SegmentTabs({
      width: w,
      height: SEG_H,
      selected: tab,
      tabs: SLOTS.map((id) => ({ id, label: t('prof.tab.' + id) })),
    });
    seg.position.set(w / 2, y + SEG_H / 2);
    seg.onSelect((id) => {
      tab = id as Slot;
      drawPreview();
      buildGrid();
    });
    y += SEG_H + GAP;
    const own = uiLabel(t('prof.ownedOnly'), { size: 28, anchorX: 0, align: 'left' });
    own.position.set(8, y + TOGGLE_H / 2);
    const toggle = new Toggle({
      value: ownedOnly,
      onChange: (v) => {
        ownedOnly = v;
        buildGrid();
      },
    });
    toggle.position.set(w - 58 - 8, y + TOGGLE_H / 2);
    y += TOGGLE_H + GAP;
    gridY = y;
    gridH = Math.max(160, scaffold.bodyRect.h - PAD * 2 - y);
    scaffold.content.addChild(preview, seg, own, toggle, gridHost);
    buildGrid();
  };

  /** The bar: "change nickname" (signed in only) and "apply". */
  const buildBar = (): void => {
    if (closed) return;
    for (const c of scaffold.actionBar.removeChildren()) c.destroy({ children: true });
    const full = scaffold.contentWidth;
    const signedIn = account.state().status === 'on';
    const bw = signedIn ? (full - 20) / 2 : full;
    apply = new Button({ label: t('prof.apply'), style: 'success', width: bw, height: 88, fontSize: 36, disabledMark: 'none' });
    apply.position.set(signedIn ? (bw + 20) / 2 : 0, 0);
    apply.onTap(() => {
      const slots = applicable();
      for (const k of slots) profile.equip(pick[k]);
      if (slots.length > 0) toast(t('prof.applied'), 'success');
      buildGrid();
    });
    scaffold.actionBar.addChild(apply);
    if (signedIn) {
      const rename = new Button({ label: t('prof.rename'), style: 'neutral', width: bw, height: 88, fontSize: 32 });
      rename.position.set(-(bw + 20) / 2, 0);
      rename.onTap(() => void changeNameFlow());
      scaffold.actionBar.addChild(rename);
    }
    syncApply();
  };

  const offs = [
    onNameChange(() => drawPreview()),
    account.onChange(() => queueMicrotask(() => buildBar())),
    game.events.on('resize', () => build()),
  ];

  const close = (): void => {
    if (closed) return;
    closed = true;
    for (const off of offs) off();
    current = null;
    closeNow = null;
    void scaffold.hide(true).then(() => scaffold.destroy({ children: true }));
  };
  closeNow = close;

  build();
  buildBar();
  void scaffold.show(true);
}

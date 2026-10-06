import { Container, Graphics, Point } from 'pixi.js';
import { DESIGN_W, game } from '@/core/game';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { profile, accountProgress } from '@/meta';
import { Color, CurrencyPill, IconButton, ProgressBar, drawShadow, refreshCache, vGradient } from '@/ui';
import type { CurrencyKind } from '../contract';
import { TOP_PAD_TOP, TOP_PILL_H, TOP_ROW_GAP, TOP_ROW_H, pillWidth } from './layoutMath';
import { LevelBadge } from './LevelBadge';

const SIDE = 24;
const GAP = 24;
const BADGE_SLOT = 96;
const SETTINGS_SLOT = 88;
const KINDS: readonly CurrencyKind[] = ['gold', 'gems', 'tickets'];
const ICON = { gold: 'coin', gems: 'gem', tickets: 'ticket' } as const;
/** The design width never changes, so the XP bar is built once at the width the row leaves free. */
const XP_BAR_W = DESIGN_W - SIDE * 2 - BADGE_SLOT - SETTINGS_SLOT - 32;

export interface TopBarHandlers {
  onPlus(kind: CurrencyKind): void;
  onSettings(): void;
}

/**
 * Top of the home screen: account level badge with its XP ring and bar, the settings button, and the
 * three currency pills with their "+" buttons. Origin = top-left of the screen; the bar reaches up
 * under the notch.
 */
export class HomeTopBar extends Container {
  readonly pills: Record<CurrencyKind, CurrencyPill>;
  private readonly bg = new Graphics();
  private readonly badge = new LevelBadge();
  private readonly xpBar = new ProgressBar({ width: XP_BAR_W, height: 40, color: 'cyan', label: '' });
  private readonly settingsBtn = new IconButton({ icon: 'settings', style: 'neutral', size: 80 });

  constructor(handlers: TopBarHandlers) {
    super();
    this.settingsBtn.onTap(() => handlers.onSettings());
    this.pills = {
      gold: new CurrencyPill({ icon: ICON.gold, amount: 0, plus: true, onPlus: () => handlers.onPlus('gold') }),
      gems: new CurrencyPill({ icon: ICON.gems, amount: 0, plus: true, onPlus: () => handlers.onPlus('gems') }),
      tickets: new CurrencyPill({ icon: ICON.tickets, amount: 0, plus: true, onPlus: () => handlers.onPlus('tickets') }),
    };
    this.addChild(this.bg, this.badge, this.xpBar, this.settingsBtn);
    for (const k of KINDS) this.addChild(this.pills[k]);
    this.sync(false);
  }

  /** Re-fit to the screen width and the current safe-area inset. Returns the bar height. */
  layout(w: number): number {
    const top = game.safeTop + TOP_PAD_TOP;
    const rowA = top + TOP_ROW_H / 2;
    const rowB = top + TOP_ROW_H + TOP_ROW_GAP + TOP_PILL_H / 2;
    const height = rowB + TOP_PILL_H / 2 + 12;
    this.drawBg(w, height);

    this.badge.position.set(SIDE + BADGE_SLOT / 2, rowA);
    this.xpBar.position.set(SIDE + BADGE_SLOT + 8 + XP_BAR_W / 2, rowA + 2);
    this.settingsBtn.position.set(w - SIDE - SETTINGS_SLOT / 2, rowA);

    const pw = pillWidth(w, SIDE, GAP, KINDS.length);
    const total = pw * KINDS.length + GAP * (KINDS.length - 1);
    const x0 = (w - total) / 2;
    KINDS.forEach((k, i) => {
      this.pills[k].setWidth(pw);
      this.pills[k].position.set(x0 + pw / 2 + i * (pw + GAP), rowB);
    });
    return height;
  }

  /** Read the profile: currencies roll to the new amounts, the level badge and XP bar follow. */
  sync(animate = true): void {
    const d = profile.data;
    this.pills.gold.setAmount(d.gold, animate);
    this.pills.gems.setAmount(d.gems, animate);
    this.pills.tickets.setAmount(d.tickets, animate);
    const p = accountProgress(d.accountXp);
    this.badge.set(p.level, p.into, p.need, animate);
    this.xpBar.setValue(p.need > 0 ? p.into / p.need : 0, animate);
    this.xpBar.setLabel(t('shell.xp', { a: fmt(p.into), b: fmt(p.need) }));
  }

  /** Centre of a currency icon in this bar's parent space (scene space). */
  iconPosition(kind: CurrencyKind): { x: number; y: number } {
    const global = this.pills[kind].getIconGlobalPosition(new Point());
    const local = (this.parent ?? this).toLocal(global);
    return { x: local.x, y: local.y };
  }

  private drawBg(w: number, h: number): void {
    const g = this.bg;
    g.clear();
    drawShadow(g, 0, 0, w, h, 0, { alpha: 0.35, spread: 14, offsetY: 6 });
    g.rect(0, 0, w, h).fill(vGradient(Color.panelLight, Color.panelDark));
    g.rect(0, h - 5, w, 5).fill(Color.outline);
    g.rect(0, h - 8, w, 3).fill({ color: Color.white, alpha: 0.12 });
    refreshCache(g);
  }
}

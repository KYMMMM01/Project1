import { Container, Point } from 'pixi.js';
import { DESIGN_W, game } from '@/core/game';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { profile, accountProgress } from '@/meta';
import { CurrencyPill, IconButton, ProgressBar } from '@/ui';
import type { CurrencyKind } from '../contract';
import { TOP_PAD_TOP, TOP_PILL_H, TOP_ROW_GAP, TOP_ROW_H, pillWidth } from './layoutMath';
import { BADGE_R, LevelBadge } from './LevelBadge';

const SIDE = 24;
const GAP = 24;
const BADGE_SLOT = BADGE_R * 2 + 12;
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
 * Top of the home screen, pieces of paper lying on the floor: the account level sticker with its XP
 * ring and painted bar, the round settings button, and the three currency pills (teal torn strips)
 * with their "+" buttons. Origin = top-left of the screen; the pieces sit below the notch.
 */
export class HomeTopBar extends Container {
  readonly pills: Record<CurrencyKind, CurrencyPill>;
  private readonly badge = new LevelBadge();
  private readonly xpBar = new ProgressBar({ width: XP_BAR_W, height: 40, color: 'blue', label: '' });
  private readonly settingsBtn = new IconButton({ icon: 'settings', style: 'neutral', size: 80 });

  constructor(handlers: TopBarHandlers) {
    super();
    this.settingsBtn.onTap(() => handlers.onSettings());
    this.pills = {
      gold: new CurrencyPill({ icon: ICON.gold, amount: 0, plus: true, onPlus: () => handlers.onPlus('gold') }),
      gems: new CurrencyPill({ icon: ICON.gems, amount: 0, plus: true, onPlus: () => handlers.onPlus('gems') }),
      tickets: new CurrencyPill({ icon: ICON.tickets, amount: 0, plus: true, onPlus: () => handlers.onPlus('tickets') }),
    };
    this.addChild(this.xpBar, this.badge, this.settingsBtn);
    for (const k of KINDS) this.addChild(this.pills[k]);
    this.sync(false);
  }

  /** Re-fit to the screen width and the current safe-area inset. */
  layout(w: number): void {
    const top = game.safeTop + TOP_PAD_TOP;
    const rowA = top + TOP_ROW_H / 2;
    const rowB = top + TOP_ROW_H + TOP_ROW_GAP + TOP_PILL_H / 2;

    this.badge.position.set(SIDE + BADGE_R, rowA);
    this.xpBar.position.set(SIDE + BADGE_SLOT + XP_BAR_W / 2, rowA + 2);
    this.settingsBtn.position.set(w - SIDE - SETTINGS_SLOT / 2, rowA);

    const pw = pillWidth(w, SIDE, GAP, KINDS.length);
    const total = pw * KINDS.length + GAP * (KINDS.length - 1);
    const x0 = (w - total) / 2;
    KINDS.forEach((k, i) => {
      this.pills[k].setWidth(pw);
      this.pills[k].position.set(x0 + pw / 2 + i * (pw + GAP), rowB);
    });
  }

  /** Read the profile: currencies roll to the new amounts, the level sticker and XP bar follow. */
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
}

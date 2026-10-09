import { Container, Point, type DestroyOptions } from 'pixi.js';
import { DESIGN_W, game } from '@/core/game';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { guideProgress } from '@/guide';
import { profile, accountProgress } from '@/meta';
import { Badge, CurrencyPill, IconButton, ProgressBar, TweenBag, motion } from '@/ui';
import type { CurrencyKind } from '../contract';
import { TOP_PAD_TOP, TOP_PILL_H, TOP_ROW_GAP, TOP_ROW_H, pillRow } from './layoutMath';
import { BADGE_R, LevelBadge } from './LevelBadge';

const SIDE = 24;
/** The kit's coin sticker sticks out this far past its pill's left end; the gap after a pill must clear the next sticker. */
const PILL_OVERHANG = 21;
const PILL_GAP = 33;
const BADGE_SLOT = BADGE_R * 2 + 12;
const SETTINGS_SLOT = 88;
/** The codex button sits in its own slot of the same width, left of the settings button. */
const CODEX_SLOT = 88;
const KINDS: readonly CurrencyKind[] = ['gold', 'gems', 'tickets'];
/** How long a pill keeps its old amount when a flight was announced and nothing lands. */
const PENDING_MAX = 2.5;
const ICON = { gold: 'coin', gems: 'gem', tickets: 'ticket' } as const;
/** The design width never changes, so the XP bar is built once at the width the row leaves free. */
const XP_BAR_W = DESIGN_W - SIDE * 2 - BADGE_SLOT - SETTINGS_SLOT - CODEX_SLOT - 32;

export interface TopBarHandlers {
  onPlus(kind: CurrencyKind): void;
  onSettings(): void;
  onCodex(): void;
}

/**
 * Top of the home screen, pieces of paper lying on the floor: the account level sticker with its XP
 * ring and painted bar, the round codex and settings buttons (the codex's carries a badge while
 * something newly met has not been looked at), and the three currency pills (teal torn strips)
 * with their "+" buttons. Origin = top-left of the screen; the pieces sit below the notch.
 */
export class HomeTopBar extends Container {
  readonly pills: Record<CurrencyKind, CurrencyPill>;
  private readonly badge = new LevelBadge();
  private readonly xpBar = new ProgressBar({ width: XP_BAR_W, height: 40, color: 'blue', label: '' });
  private readonly settingsBtn = new IconButton({ icon: 'settings', style: 'neutral', size: 80 });
  private readonly codexBtn = new IconButton({ icon: 'book', style: 'neutral', size: 80 });
  private readonly codexBadge = new Badge({ size: 26 });
  private readonly offProgress: () => void;
  /** Currency already in the profile that is still on its way to the pill (a flight in the air). */
  private readonly deferred: Record<CurrencyKind, number> = { gold: 0, gems: 0, tickets: 0 };
  private readonly bag = new TweenBag();
  private level = -1;
  /** A level-up is running toward this bar fraction; the same state arriving again must not restart it. */
  private rising: number | null = null;

  constructor(handlers: TopBarHandlers) {
    super();
    this.settingsBtn.onTap(() => handlers.onSettings());
    this.codexBtn.onTap(() => handlers.onCodex());
    this.offProgress = guideProgress.events.on('change', () => this.syncCodexBadge(true));
    void guideProgress.load();
    this.pills = {
      gold: new CurrencyPill({ icon: ICON.gold, amount: 0, plus: true, onPlus: () => handlers.onPlus('gold') }),
      gems: new CurrencyPill({ icon: ICON.gems, amount: 0, plus: true, onPlus: () => handlers.onPlus('gems') }),
      tickets: new CurrencyPill({ icon: ICON.tickets, amount: 0, plus: true, onPlus: () => handlers.onPlus('tickets') }),
    };
    this.addChild(this.xpBar, this.badge, this.codexBtn, this.codexBadge, this.settingsBtn);
    for (const k of KINDS) this.addChild(this.pills[k]);
    this.sync(false);
    this.syncCodexBadge(false);
  }

  /** Re-fit to the screen width and the current safe-area inset. */
  layout(w: number): void {
    const top = game.safeTop + TOP_PAD_TOP;
    const rowA = top + TOP_ROW_H / 2;
    const rowB = top + TOP_ROW_H + TOP_ROW_GAP + TOP_PILL_H / 2;

    this.badge.position.set(SIDE + BADGE_R, rowA);
    this.xpBar.position.set(SIDE + BADGE_SLOT + XP_BAR_W / 2, rowA + 2);
    this.settingsBtn.position.set(w - SIDE - SETTINGS_SLOT / 2, rowA);
    this.codexBtn.position.set(w - SIDE - SETTINGS_SLOT - CODEX_SLOT / 2, rowA);
    // Up and left of the corner, so even a counted badge ("9+") stays clear of the settings button beside it.
    this.codexBadge.position.set(this.codexBtn.x + 14, rowA - 34);

    const { pw, x0 } = pillRow(w, SIDE, PILL_GAP, PILL_OVERHANG, KINDS.length);
    KINDS.forEach((k, i) => {
      this.pills[k].setWidth(pw);
      this.pills[k].position.set(x0 + pw / 2 + i * (pw + PILL_GAP), rowB);
    });
  }

  /** Read the profile: currencies roll to the new amounts, the level sticker and XP bar follow. */
  sync(animate = true): void {
    const d = profile.data;
    for (const k of KINDS) this.pills[k].setAmount(Math.max(0, d[k] - this.deferred[k]), animate);
    const p = accountProgress(d.accountXp);
    this.badge.set(p.level, p.into, p.need, animate);
    const fraction = p.need > 0 ? p.into / p.need : 0;
    const label = t('shell.xp', { a: fmt(p.into), b: fmt(p.need) });
    if (this.rising === fraction && p.level === this.level) return;
    const leveled = this.level >= 0 && p.level > this.level;
    this.level = p.level;
    this.rising = null;
    this.bag.killKeyed(this.xpBar);
    if (leveled && animate && !motion.reduced) {
      // Like the badge ring: fill to the brim, then the next level's bar starts again from empty.
      const wait = Math.min(0.55, 0.22 + (1 - this.xpBar.value) * 0.5);
      this.rising = fraction;
      this.xpBar.setValue(1);
      this.bag.runKeyed(this.xpBar, {
        duration: wait,
        onComplete: () => {
          this.xpBar.setValue(0, false);
          this.xpBar.setLabel(label);
          this.xpBar.setValue(fraction);
          this.rising = null;
        },
      });
      return;
    }
    this.xpBar.setValue(fraction, animate);
    this.xpBar.setLabel(label);
  }

  /** The codex button's badge counts what has been met and not looked at yet. */
  private syncCodexBadge(animate: boolean): void {
    this.codexBadge.set(guideProgress.freshCount(), animate);
  }

  override destroy(options?: DestroyOptions): void {
    this.offProgress();
    this.bag.killAll();
    super.destroy(options);
  }

  /** A flight of `amount` is on its way: the pill goes back to what it showed before, and counts up when the first icon lands. */
  pending(kind: CurrencyKind, amount: number, seconds = PENDING_MAX): void {
    if (motion.reduced || amount <= 0) return;
    this.deferred[kind] += amount;
    this.pills[kind].setAmount(Math.max(0, profile.data[kind] - this.deferred[kind]), false);
    this.bag.call(seconds, () => this.release(kind));
  }

  /** A flying icon reached `kind`'s pill: the icon bumps; the first of a flight also starts the number rolling to the new amount. */
  landed(kind: CurrencyKind): void {
    this.pills[kind].punchIcon();
    this.release(kind);
  }

  private release(kind: CurrencyKind): void {
    if (this.deferred[kind] === 0) return;
    this.deferred[kind] = 0;
    this.sync(true);
  }

  /** Centre of a currency icon in this bar's parent space (scene space). */
  iconPosition(kind: CurrencyKind): { x: number; y: number } {
    const global = this.pills[kind].getIconGlobalPosition(new Point());
    const local = (this.parent ?? this).toLocal(global);
    return { x: local.x, y: local.y };
  }
}

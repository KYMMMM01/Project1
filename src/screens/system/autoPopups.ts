/**
 * The popups the game opens by itself: welcome back, the gem pass's daily gems, an account level-up
 * and newly unlocked features. They are decided from the profile (not from events), so one that
 * happened during a battle is simply waiting when the home screen is shown again. One at a time,
 * never over another popup or a full screen, and never while a scene is changing.
 */
import type { Container } from 'pixi.js';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { scenes } from '@/core/scene';
import { uiTweens } from '@/core/tween';
import { accountProgress, errorKey, profile } from '@/meta';
import type { BundlePart } from '@/meta/bundle';
import { ACCOUNT_LEVEL_GEMS } from '@/meta/data/economy';
import type { FeatureId } from '@/meta/data/schedule';
import { drawIcon, type IconName } from '@/ui/icons';
import { popups } from '@/ui/Popup';
import { toast } from '@/ui/Toast';
import type { Shell } from '../contract';
import { payout } from './kit/claimFx';
import { NoticePopup, type NoticeRow } from './kit/noticePopup';
import { partIcon } from './kit/rewardChip';
import { daysUntil } from './kit/time';
import { mayShowPopup, nextPopup, primaryJump, reconcileSeen, UNLOCK_ROWS, type DuePopup } from './popupPolicy';
import { loadRoutinePrefs, patchRoutinePrefs, prefsLoaded, routinePrefs } from './prefs';
import './strings';

const CHECK_EVERY = 0.4;
/** The beat of bare home between one note and the next (the clock is checked every CHECK_EVERY, so the wait counts up to that). */
const GAP_AFTER = 0.5;

const FEATURE_ICON: Readonly<Record<FeatureId, IconName>> = {
  speed2x: 'speed_2',
  speed3x: 'speed_3',
  cats: 'paw',
  patrol: 'clock',
  missions: 'mission',
  shop: 'shop',
  treat: 'gift',
  piggy: 'coin',
  cosmetics: 'wardrobe',
  pass: 'crown',
  daily: 'calendar',
  sweep: 'sweep',
  cup: 'trophy',
  endless: 'skull',
  dungeon: 'coin',
};

/** Offers already made in this app session: a dismissed one is not repeated until the next launch. */
const offered = new Set<'comeback' | 'gemPass'>();

export class AutoPopups {
  private dirty = true;
  private busy = false;
  private alive = true;
  private clock = 0;
  private reconciled = false;
  private readonly offChange: () => void;
  private readonly offFrame: () => void;

  constructor(private readonly shell: Shell) {
    this.offChange = profile.subscribe(() => {
      this.dirty = true;
    });
    this.offFrame = game.onUpdate((dt) => this.tick(dt));
    void loadRoutinePrefs();
  }

  dispose(): void {
    this.alive = false;
    this.offChange();
    this.offFrame();
  }

  private tick(dt: number): void {
    this.clock += dt;
    if (this.clock < CHECK_EVERY || !this.dirty || !prefsLoaded()) return;
    this.clock = 0;
    const gate = { shellAlive: this.alive && this.homeOnScreen(), transitioning: scenes.transitioning, modalOpen: game.popupLayer.children.length > 0, busy: this.busy };
    if (!mayShowPopup(gate)) return;
    this.reconcile();
    const due = nextPopup(this.facts());
    if (!due) {
      this.dirty = false;
      return;
    }
    void this.present(due);
  }

  /** The shell hands out the global UI clock while no home scene is attached (a battle, the boot screen). */
  private homeOnScreen(): boolean {
    return this.shell.ui !== uiTweens;
  }

  /** A restored or reset profile can know fewer unlocks than the record says: trim the record once per install. */
  private reconcile(): void {
    if (this.reconciled) return;
    this.reconciled = true;
    const p = routinePrefs();
    const r = reconcileSeen(profile.data.unlocked, p.seenUnlocked, accountProgress(profile.data.accountXp).level, p.seenLevel);
    if (r.seenLevel !== p.seenLevel || r.seenUnlocked.length !== p.seenUnlocked.length) patchRoutinePrefs(r);
  }

  private facts(): Parameters<typeof nextPopup>[0] {
    const p = routinePrefs();
    return {
      comebackReady: profile.calendarView().comebackReady,
      gemPassReady: profile.gemPassView().canClaim,
      level: accountProgress(profile.data.accountXp).level,
      seenLevel: p.seenLevel,
      unlocked: profile.data.unlocked,
      seenUnlocked: p.seenUnlocked,
      offered,
    };
  }

  private async present(due: DuePopup): Promise<void> {
    this.busy = true;
    try {
      switch (due.kind) {
        case 'comeback':
          await this.comeback();
          break;
        case 'gemPass':
          await this.gemPass();
          break;
        case 'levelUp':
          await this.levelUp(due.from, due.to);
          break;
        case 'unlock':
          await this.unlock(due.features);
          break;
      }
    } finally {
      this.busy = false;
      this.dirty = true;
      this.clock = CHECK_EVERY - GAP_AFTER;
    }
  }

  private origin(): { x: number; y: number } {
    return { x: game.w / 2, y: game.h / 2 - 80 };
  }

  private async comeback(): Promise<void> {
    offered.add('comeback');
    const parts: BundlePart[] = [{ kind: 'chest', chest: 'silver', n: 1 }];
    const choice = await popups.open(
      new NoticePopup<'claim' | 'later'>({
        title: t('rt.sys.comeback.title'),
        hero: partIcon(parts[0] as BundlePart, 124),
        lines: [t('rt.sys.comeback.body'), t('rt.sys.comeback.patrol')],
        parts,
        buttons: [{ label: t('rt.common.claim'), style: 'primary', result: 'claim', pulse: true }],
        dismissResult: 'later',
      }),
    );
    if (choice !== 'claim' || !this.alive) return;
    const r = profile.claimComeback();
    if (!r.ok) {
      toast(t(errorKey(r.error)), 'warning');
      return;
    }
    this.shell.refresh();
    await payout(this.shell, parts, this.origin(), t('rt.sys.comeback.title'));
  }

  private async gemPass(): Promise<void> {
    offered.add('gemPass');
    const v = profile.gemPassView();
    const parts: BundlePart[] = [{ kind: 'gems', n: v.daily }];
    const left = daysUntil(v.until, profile.now());
    const choice = await popups.open(
      new NoticePopup<'claim' | 'later'>({
        title: t('rt.sys.gempass.title'),
        hero: partIcon(parts[0] as BundlePart, 124),
        lines: left > 0 ? [t('rt.sys.gempass.body'), t('rt.sys.gempass.days', { n: left })] : [t('rt.sys.gempass.body')],
        parts,
        buttons: [{ label: t('rt.common.claim'), style: 'primary', result: 'claim', pulse: true }],
        dismissResult: 'later',
      }),
    );
    if (choice !== 'claim' || !this.alive) return;
    const r = profile.claimGemPass();
    if (!r.ok) {
      toast(t(errorKey(r.error)), 'warning');
      return;
    }
    this.shell.refresh();
    // The flight is only a flourish: the next popup does not wait for it.
    void payout(this.shell, parts, this.origin(), t('rt.sys.gempass.title'));
  }

  /** The gems were paid when the level was reached: this celebrates them and flies them to the top bar. */
  private async levelUp(from: number, to: number): Promise<void> {
    patchRoutinePrefs({ seenLevel: to });
    const parts: BundlePart[] = [{ kind: 'gems', n: (to - from) * ACCOUNT_LEVEL_GEMS }];
    const hero: Container = drawIcon('star', 124);
    await popups.open(
      new NoticePopup<boolean>({
        title: t('rt.sys.level.title', { n: to }),
        hero,
        lines: [t('rt.sys.level.body')],
        parts,
        buttons: [{ label: t('rt.common.ok'), style: 'primary', result: true, pulse: true }],
        dismissResult: true,
      }),
    );
    if (!this.alive) return;
    void payout(this.shell, parts, this.origin(), t('rt.sys.level.title', { n: to }));
  }

  private async unlock(features: readonly FeatureId[]): Promise<void> {
    const p = routinePrefs();
    patchRoutinePrefs({ seenUnlocked: [...new Set([...p.seenUnlocked, ...features])] });
    const rows: NoticeRow[] = features.slice(0, UNLOCK_ROWS).map((f) => ({
      icon: FEATURE_ICON[f],
      title: t('meta.feature.' + f),
      text: t('rt.sys.feat.' + f),
    }));
    const more = features.length - rows.length;
    const jump = primaryJump(features);
    const choice = await popups.open(
      new NoticePopup<'go' | 'later'>({
        title: t('rt.sys.unlock.title'),
        hero: drawIcon('gift', 118),
        rows,
        footnote: more > 0 ? [t('rt.sys.unlock.more', { n: more })] : [],
        buttons: jump
          ? [
              { label: t('rt.sys.unlock.go'), style: 'primary', result: 'go', pulse: true },
              { label: t('rt.common.later'), style: 'neutral', result: 'later' },
            ]
          : [{ label: t('rt.common.ok'), style: 'primary', result: 'later' }],
        dismissResult: 'later',
      }),
    );
    if (choice === 'go' && jump && this.alive) this.shell.goTab(jump.tab);
  }
}

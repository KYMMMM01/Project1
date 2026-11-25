/**
 * Pays the weekly ranking rewards (docs/명세_프로필꾸미기.md 5.3): asks the server which settled weeks the player placed in, pays the
 * ones this device has not paid yet and shows one reward popup per week. Called from the home and when the ranking screen opens, each
 * with `stillHere`: the answer can take seconds, and a popup must not land on a battle the player went into meanwhile (the weeks stay
 * unpaid for the next visit).
 */
import { t } from '@/core/i18n';
import { bundleParts, profile } from '@/meta';
import { account, ranking, seoulWeek } from '@/platform';
import { services } from '../contract';
import './strings';

const WEEK_MS = 7 * 86_400_000;
let busy = false;
/** A call that came while one was running (another account signed in, the ranking opened): run once more when it ends. */
let again: (() => boolean) | null = null;

export async function claimRankGrants(stillHere: () => boolean): Promise<void> {
  const before = account.state();
  if (before.status !== 'on') return;
  if (busy) {
    again = stillHere;
    return;
  }
  busy = true;
  try {
    const weeks = await ranking.claimGrants();
    // The account may have changed while the server answered: those weeks belong to the one that asked.
    const now = account.state();
    if (!weeks || now.status !== 'on' || now.uid !== before.uid || !stillHere()) return;
    const lastWeek = `week-${seoulWeek(Date.now() - WEEK_MS)}`;
    for (const paid of profile.claimRankGrants(before.uid, weeks)) {
      const key = paid.week === lastWeek ? 'rt.sys.rank.reward.last' : 'rt.sys.rank.reward';
      await services.showRewards(bundleParts(paid.bundle), t(key, { n: paid.rank }));
    }
  } finally {
    busy = false;
    const next = again;
    again = null;
    if (next?.()) void claimRankGrants(next);
  }
}

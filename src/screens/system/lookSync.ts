/**
 * Keeps the server's copy of what the player wears (the icon, frame, name plate and account level other players see on the boards,
 * docs/명세_프로필꾸미기.md 5.2) equal to the device's. The server only takes one upload per 30 seconds, so a change that cannot go up now
 * stays pending and the newest value goes up later: after the cooldown, on the next change, or when the app comes back to the front.
 */
import { LOOK_COOLDOWN_MS, LOOK_MAX_LEVEL, sameLook, type LookWire } from '../../../functions/src/looks';
import { accountProgress, profile } from '@/meta';
import { account, platform, ranking } from '@/platform';

/** What the player wears and their level, as the server stores it. */
export function lookOf(wear: { icon: string; frame: string; plate: string }, xp: number): LookWire {
  return { i: wear.icon, f: wear.frame, p: wear.plate, lv: Math.min(LOOK_MAX_LEVEL, Math.max(1, accountProgress(xp).level)) };
}

/** Start following the profile, the sign-in and the app lifecycle (once per app); returns the function that stops it. */
export function startLookSync(): () => void {
  /** The look the server is known to hold for `knownUid`; null when it holds none. */
  let known: LookWire | null = null;
  let knownUid = '';
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /**
   * The look a read or an upload last failed for (offline, or the function not deployed yet). Profile changes fire often (every coin), so
   * they do not retry it; the app coming back to the front, a sign-in or a different look does.
   */
  let stalled: LookWire | null = null;

  const sync = async (): Promise<void> => {
    if (busy || timer) return;
    if (stalled && sameLook(stalled, lookOf(profile.look, profile.data.accountXp))) return;
    stalled = null;
    busy = true;
    try {
      // One upload at a time; the loop sends the newest look when it changed while one was on its way.
      for (let s = account.state(); s.status === 'on'; s = account.state()) {
        if (knownUid !== s.uid) {
          const me = await ranking.me();
          if (!me) {
            stalled = lookOf(profile.look, profile.data.accountXp);
            return;
          }
          known = me.look;
          knownUid = s.uid;
          continue;
        }
        const want = lookOf(profile.look, profile.data.accountXp);
        if (sameLook(want, known)) return;
        const r = await ranking.setLook({ icon: want.i, frame: want.f, plate: want.p, level: want.lv });
        if (r === 'too-soon') {
          timer = setTimeout(() => {
            timer = undefined;
            void sync();
          }, LOOK_COOLDOWN_MS + 2_000);
        }
        if (r === 'failed') stalled = want;
        if (r !== 'ok') return;
        if (knownUid === s.uid) known = want;
      }
    } finally {
      busy = false;
    }
  };

  const offs = [
    profile.subscribe(() => void sync()),
    platform.lifecycle.onResume(() => {
      stalled = null;
      void sync();
    }),
    account.onChange((s) => {
      stalled = null;
      if (s.status !== 'on') {
        known = null;
        knownUid = '';
        clearTimeout(timer);
        timer = undefined;
      }
      void sync();
    }),
  ];
  void sync();
  return () => {
    for (const off of offs) off();
    clearTimeout(timer);
  };
}

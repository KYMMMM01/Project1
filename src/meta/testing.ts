/**
 * Test kit: a profile on an in-memory store with a movable clock, a scripted ad service and a
 * recording analytics sink. Used by tests/meta*.test.ts and handy for UI harnesses; nothing in the
 * game imports it, so it never reaches a production bundle.
 */
import { setStorageBackend } from '@/core/save';
import { createMemoryBackend } from '@/platform/storage';
import type { AnalyticsEvent, AnalyticsParams } from '@/platform/analytics';
import type { RewardedOutcome } from '@/platform/adService';
import type { RunResult } from '@/platform/types';
import type { AdsPort } from './core';
import { createProfile, type Profile } from './profile';
import { createProfileStore } from './profileData';
import type { ClockSource } from './time';

/** A clock the test moves: `advance` moves both clocks like real time, `setWall` only the wall clock (tampering). */
export class FakeClock implements ClockSource {
  private mono_ = 0;

  constructor(private wall_: number) {}

  wall(): number {
    return this.wall_;
  }

  mono(): number {
    return this.mono_;
  }

  advance(ms: number): void {
    this.wall_ += ms;
    this.mono_ += ms;
  }

  setWall(ms: number): void {
    this.wall_ = ms;
  }
}

export class ScriptedAds implements AdsPort {
  outcome: RewardedOutcome = 'rewarded';
  readonly shown: string[] = [];
  readonly runs: string[] = [];

  showRewarded(placement: string): Promise<RewardedOutcome> {
    this.shown.push(placement);
    return Promise.resolve(this.outcome);
  }

  beginRun(): void {
    this.runs.push('begin');
  }

  endRun(result: RunResult): void {
    this.runs.push(result);
  }
}

export interface Recorded {
  event: AnalyticsEvent;
  params: AnalyticsParams;
}

export interface TestRig {
  profile: Profile;
  clock: FakeClock;
  ads: ScriptedAds;
  analytics: Recorded[];
}

/** Local noon of a calendar date, so the tests do not depend on the machine's time zone. */
export function at(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

/** A loaded profile. Pass `keepStorage: true` to keep the previous rig's storage (a "restart"). */
export async function createTestProfile(
  opts: { start?: number; keepStorage?: boolean; seed?: () => number; testGrants?: boolean } = {},
): Promise<TestRig> {
  if (!opts.keepStorage) setStorageBackend(createMemoryBackend());
  const clock = new FakeClock(opts.start ?? at(2026, 10, 6, 9));
  const ads = new ScriptedAds();
  const analytics: Recorded[] = [];
  let n = 0;
  const seed = opts.seed ?? ((): number => (++n * 2654435761) >>> 0);
  const profile = createProfile({
    store: createProfileStore(() => clock.wall(), seed),
    clock,
    seed,
    ads,
    analytics: { track: (event, params) => analytics.push({ event, params: params ?? {} }) },
    testGrants: opts.testGrants,
  });
  await profile.load();
  return { profile, clock, ads, analytics };
}

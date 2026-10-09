/** What the missions tab hands its sections, and what a section offers back. */
import type { Container } from 'pixi.js';
import type { MissionScope } from '@/meta/routines';

export interface MissionActions {
  claimMission(scope: MissionScope, index: number, from: Container): void;
  claimDailyChest(from: Container): void;
  claimWeeklyChest(from: Container): void;
  claimCup(tier: number, from: Container): void;
  claimEndless(tier: number, from: Container): void;
  /** Every finished mission of a list in one go, with one combined reward. */
  claimAllMissions(scope: MissionScope, from: Container): void;
  /** Every reached tier of the weekly cup / of the endless mode in one go. */
  claimAllCup(from: Container): void;
  claimAllEndless(from: Container): void;
  openOdds(kind: string): void;
  /** Jump to the home tab (the daily challenge, endless mode and the run button live there). */
  goBattle(): void;
  /** Switch to the daily sub-tab (the weekly "claim the daily chest" mission points there). */
  goDaily(): void;
}

export interface Section {
  /** Top-left origin; add it to the scroll content. */
  readonly view: Container;
  /** Height of the laid-out section. */
  readonly height: number;
  /** Bring every widget to the profile's state; `animate` plays bars and stamps. */
  sync(animate: boolean): void;
  /** Called about once a second with the trusted clock reading (ms). */
  second(now: number): void;
  destroy(): void;
}

/**
 * The stage rule for the cats' skills (docs/qa/directive_2026-10-13_skills_build.md, decision 13): at most ONE cast effect per
 * `STAGE_GAP` seconds of REAL time. A cast that arrives inside the gap loses its effect (its sound, its dust, its streaks) and shows only
 * the ring flash, which the field draws for every cast whatever the stage says. Real time, not battle time, because what the rule protects is
 * the screen and the ears: at 3x speed the casts come three times as often and the picture must not.
 *
 * Exempt, always shown: the first cast of a skill in a run (with its name bubble and, rank 5, its cut-in) and EVERY cast of a rank 5 skill
 * (the owner, 2026-10-18: "수호신 스킬은 항상 그려": a guardian's cast is the board's big moment and must never pass without a picture). An
 * exempt cast takes the slot like any shown cast, so an ordinary cast right after it is the one that loses. A lost cast takes nothing.
 */
export const STAGE_GAP = 0.25;

export class StageRule {
  private last = -Infinity;
  /** Casts shown and casts that lost (stats for the QA hooks). */
  shown = 0;
  lost = 0;

  constructor(private readonly gap = STAGE_GAP) {}

  /** `now` in real seconds; `exempt` true for the first cast of a skill in the run and for every rank 5 cast. Returns whether it is shown. */
  admit(now: number, exempt: boolean): boolean {
    if (!exempt && now - this.last < this.gap - 1e-9) {
      this.lost++;
      return false;
    }
    this.last = now;
    this.shown++;
    return true;
  }

  reset(): void {
    this.last = -Infinity;
    this.shown = 0;
    this.lost = 0;
  }
}

/** A name bubble that is up: where it stands, how wide it is, how far it was lifted, and how far into its life it is (0 new, 1 gone). */
export interface BubbleSpot {
  x: number;
  w: number;
  lift: number;
  k: number;
}

/** A bubble that has begun to fade no longer needs the room. */
const BUBBLE_FADING = 0.7;
/** The gap between two stacked bubbles, in design px. */
const BUBBLE_GAP = 6;

/**
 * How far a new name bubble (`w` wide, `h` high, its tip at `x`) is lifted so that it does not sit on one that is still up: two skills cast for
 * the first time in the same moment by cats side by side would otherwise pile their labels on top of one another and hide the names. A bubble
 * that it would overlap puts it one label higher than that one.
 */
export function bubbleLift(up: readonly BubbleSpot[], x: number, w: number, h: number): number {
  let lift = 0;
  for (const o of up) {
    if (o.k >= BUBBLE_FADING || Math.abs(o.x - x) >= (o.w + w) / 2) continue;
    lift = Math.max(lift, o.lift + h + BUBBLE_GAP);
  }
  return lift;
}

/** How many rank 5 cut-ins may wait behind the one that is playing (a banner is 0.8 s, so the last of three starts about 2 s late). */
export const CUTIN_QUEUE = 3;

/**
 * What the first cast of a skill shows besides its scene: a rank 5 skill shows its cut-in (the banner says the name, so no bubble repeats it),
 * any other skill the name bubble. `waiting` is how many cut-ins are already queued behind the one on the screen: a banner that would have to
 * wait behind a full queue is dropped and the bubble stands in for it. Whether the banner starts now or waits its turn is the intro's business
 * (`intro.ts`: an awakening's banner is never cut short). Both are exempt from the stage rule.
 */
export function introFor(rank: number | undefined, waiting: number): { bubble: boolean; cutIn: boolean } {
  const cutIn = rank === 5 && waiting < CUTIN_QUEUE;
  return { bubble: !cutIn, cutIn };
}

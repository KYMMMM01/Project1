/**
 * The first run's three forced steps: summon three times, merge the two identical kittens, pick one
 * of three. Everything else in the tutorial is a one-time speech bubble, not a step.
 */
export type TutorialStep = 'summon' | 'merge' | 'pick' | 'free';

export const TUTORIAL_SUMMONS = 3;

export class TutorialFlow {
  step: TutorialStep = 'summon';
  summons = 0;

  /** A button summon landed. Returns true when the step changed. */
  onSummon(): boolean {
    if (this.step !== 'summon') return false;
    this.summons++;
    if (this.summons < TUTORIAL_SUMMONS) return false;
    this.step = 'merge';
    return true;
  }

  /** Two kittens merged: the merge step is done and play continues freely until the offer. */
  onMerge(): boolean {
    if (this.step !== 'merge') return false;
    this.step = 'free';
    return true;
  }

  /** The scripted pick-of-three opened. */
  onOffer(): boolean {
    if (this.step === 'pick') return false;
    this.step = 'pick';
    return true;
  }

  /** The player chose a kitten. */
  onPicked(): boolean {
    if (this.step !== 'pick') return false;
    this.step = 'free';
    return true;
  }

  /** The game is held still while one of the forced steps waits for the player. */
  get holding(): boolean {
    return this.step !== 'free';
  }
}

/** The two cells holding the same unit, preferring the pair that sits closest together; null when there is none. */
export function findMergePair(board: ReadonlyArray<string | null>): [number, number] | null {
  let best: [number, number] | null = null;
  let bestGap = Infinity;
  for (let a = 0; a < board.length; a++) {
    const ua = board[a];
    if (!ua) continue;
    for (let b = a + 1; b < board.length; b++) {
      if (board[b] !== ua) continue;
      const gap = Math.abs((a % 5) - (b % 5)) + Math.abs(Math.floor(a / 5) - Math.floor(b / 5));
      if (gap < bestGap) {
        bestGap = gap;
        best = [a, b];
      }
    }
  }
  return best;
}

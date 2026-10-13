/**
 * How long a picture of a cast lives. Every picture is timed by the BATTLE's clock (the simulation's: it stands still under a popup and a
 * hit-stop and runs with the game speed), so a slide, its afterimage and its dust all stay in step with what the enemies really do. At 3x
 * that clock is three times as fast, and a 0.4 s picture would be gone in 0.13 s: so a picture also has a floor in REAL time, and it lasts
 * until both its battle seconds and its real seconds are over. At 1x the battle seconds are the longer, at 3x the floor is; under a popup
 * the battle age stands still and so does the picture.
 */
export function spanK(battleAge: number, realAge: number, battleLife: number, realFloor: number): number {
  const k = Math.min(battleAge / battleLife, realAge / realFloor);
  return k < 0 ? 0 : k > 1 ? 1 : k;
}

/** The two ages of a thing that lives for a span: advance both by the frame's battle and real seconds. */
export class Age {
  battle = 0;
  real = 0;
  tick(battleDt: number, realDt: number): void {
    this.battle += battleDt;
    this.real += realDt;
  }
  reset(): void {
    this.battle = 0;
    this.real = 0;
  }
  k(battleLife: number, realFloor: number): number {
    return spanK(this.battle, this.real, battleLife, realFloor);
  }
}

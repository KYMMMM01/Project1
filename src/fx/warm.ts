/**
 * First-use work, done ahead of time. The first time something is drawn (an enemy kind, a boss, an effect sheet, a ground
 * area baked from its outline, the particle shader) its frame pays for the texture upload, the shader link or the bake in one
 * go: 10 to 45 ms on a phone, a visible hitch in the middle of a fight. The queue here runs that work in the calm frames
 * before it is needed, a few pieces a frame and never on a frame that is already long, so the warm-up itself costs no hitch.
 * Urgent pieces (the coming wave) go before the ones that merely have to be ready some time (the next wave, the chests).
 */
import { Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { game } from '@/core/game';

/** What one frame may spend on warm-up (ms of measured time); a single piece may overshoot it, so pieces are kept small. */
export const WARM_BUDGET_MS = 2.5;
/** A frame whose real time was longer than this (seconds) gets no warm-up: the player is already feeling it. */
export const WARM_SLOW_DT = 0.045;

/** Priorities: the pipeline first, then what the coming wave needs, then the wave after it, then what a battle may need some time. */
export const WARM_PRIO = { pipe: 0, coming: 1, next: 2, later: 3 } as const;

/** Warm-up allowance of a frame of `dt` seconds: none on a slow frame. */
export function warmBudget(dt: number): number {
  return dt > WARM_SLOW_DT ? 0 : WARM_BUDGET_MS;
}

interface Job {
  key: string;
  prio: number;
  /** A guess in ms: a piece that would not fit what is left of the frame's allowance waits for the next frame. */
  cost: number;
  order: number;
  run: () => void;
}

export class WarmQueue {
  private readonly jobs: Job[] = [];
  private readonly byKey = new Map<string, Job>();
  private readonly done = new Set<string>();
  private order = 0;
  /** Replaceable clock (tests). */
  now: () => number = () => performance.now();

  /** Pieces still waiting. */
  get pending(): number {
    return this.jobs.length;
  }

  /** How many pieces have run since the queue was made (or reset). */
  get finished(): number {
    return this.done.size;
  }

  /** The key of the piece that runs next, or null (what the debug hook and the tests read to see the order). */
  get next(): string | null {
    return this.jobs.length > 0 ? (this.jobs[0] as Job).key : null;
  }

  has(key: string): boolean {
    return this.done.has(key) || this.byKey.has(key);
  }

  /**
   * Ask for a piece of work once: it is ignored when it has run or waits already, except that a more urgent ask moves a waiting piece up.
   * @returns true when the piece was newly queued
   */
  request(key: string, prio: number, cost: number, run: () => void): boolean {
    if (this.done.has(key)) return false;
    const waiting = this.byKey.get(key);
    if (waiting) {
      if (prio < waiting.prio) {
        waiting.prio = prio;
        this.jobs.splice(this.jobs.indexOf(waiting), 1);
        this.insert(waiting);
      }
      return false;
    }
    const job: Job = { key, prio, cost, order: this.order++, run };
    this.byKey.set(key, job);
    this.insert(job);
    return true;
  }

  private insert(job: Job): void {
    let at = this.jobs.length;
    while (at > 0 && (this.jobs[at - 1] as Job).prio > job.prio) at--;
    this.jobs.splice(at, 0, job);
  }

  /** Run what fits in this frame's allowance, most urgent first. Returns how many pieces ran. */
  update(dt: number): number {
    const budget = warmBudget(dt);
    if (budget <= 0 || this.jobs.length === 0) return 0;
    let spent = 0;
    let ran = 0;
    while (this.jobs.length > 0) {
      const job = this.jobs[0] as Job;
      // The first piece of a frame always runs; the next ones only when they are expected to fit.
      if (ran > 0 && spent + job.cost > budget) break;
      this.jobs.shift();
      this.byKey.delete(job.key);
      const t0 = this.now();
      try {
        job.run();
      } catch (err) {
        console.warn(`[warm] "${job.key}" failed`, err);
      }
      this.done.add(job.key);
      spent += this.now() - t0;
      ran++;
      if (spent >= budget) break;
    }
    return ran;
  }

  /** Forget what is waiting (the scene is going away); what has run stays done. */
  clear(): void {
    this.jobs.length = 0;
    this.byKey.clear();
  }

  /** Forget everything (tests). */
  reset(): void {
    this.clear();
    this.done.clear();
    this.order = 0;
  }
}

/** The one queue every battle part asks. */
export const warm = new WarmQueue();

/**
 * Put a texture on the graphics card now, and keep it there: pixi's collector would drop an image nobody drew for a minute and the next
 * draw would upload it again, in the middle of a fight.
 */
export function uploadTexture(texture: Texture): void {
  if (texture === Texture.EMPTY) return;
  const source = texture.source;
  source.autoGarbageCollect = false;
  const system = game.app.renderer.texture as { initSource?: (s: typeof source) => void };
  system.initSource?.(source);
}

/** Ask for the image `key` to be uploaded (an unknown key is ignored). */
export function warmImage(key: string, prio: number): void {
  if (hasTex(key)) warm.request(`img:${key}`, prio, 0.6, () => uploadTexture(tex(key)));
}

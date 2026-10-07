import { SaveStore } from '@/core/save';

interface Saved {
  /** How many times the explanation card has opened from a press of the laser button. */
  opened: number;
  /** The guided first use (press, place the dot, see the marks) has been done or skipped. */
  guided: boolean;
}

/** The first presses of the laser button open the explanation; after this many the button just aims (the info mark still opens it). */
export const CARD_PRESSES = 2;

/**
 * What the player has already been taught about the laser, remembered across runs. A sandbox run keeps it for the session only
 * and, unless the debug route asks for the guide, counts as guided so automated runs are not interrupted.
 */
export class LaserTeach {
  private readonly store: SaveStore<Saved> | null;
  private readonly mem: Saved;
  private loaded: boolean;

  constructor(persist: boolean, guide = persist) {
    this.mem = { opened: 0, guided: !guide };
    this.store = persist ? new SaveStore<Saved>({ key: 'meowguard.laser', version: 1, defaults: () => ({ opened: 0, guided: false }) }) : null;
    this.loaded = this.store === null;
    void this.store?.load().then(() => {
      this.loaded = true;
    });
  }

  private get data(): Saved {
    return this.store?.data ?? this.mem;
  }

  /** The saved state has been read (nothing is decided before it is). */
  get ready(): boolean {
    return this.loaded;
  }

  get opened(): number {
    return this.data.opened;
  }

  get guided(): boolean {
    return this.data.guided;
  }

  /** True while the next press of the button should open the card. */
  get cardDue(): boolean {
    return this.data.opened < CARD_PRESSES;
  }

  noteOpened(): void {
    this.data.opened++;
    this.store?.save();
  }

  noteGuided(): void {
    this.data.guided = true;
    this.store?.save();
  }

  destroy(): void {
    void this.store?.flush();
  }
}

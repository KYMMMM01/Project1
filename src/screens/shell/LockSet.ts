/** Anything that can be switched on and off like a kit button. */
export interface Lockable {
  setEnabled(on: boolean): void;
}

/**
 * Buttons that go quiet together while one request is in flight. Each one comes back to its own
 * availability (an ad offer that is not ready stays off), never to a blanket "enabled".
 */
export class LockSet {
  private readonly items: Array<{ button: Lockable; available: () => boolean }> = [];

  add(button: Lockable, available: () => boolean = () => true): void {
    this.items.push({ button, available });
  }

  setBusy(busy: boolean): void {
    for (const item of this.items) item.button.setEnabled(!busy && item.available());
  }
}

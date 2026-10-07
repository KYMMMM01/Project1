import type { Container } from 'pixi.js';
import { game } from '@/core/game';

/**
 * Tracks the one control that is currently held down. A ScrollView calls cancelActivePress() the
 * moment a touch turns into a drag, so a button under the finger releases without firing its tap.
 */
export interface Pressable {
  cancelPress(): void;
}

let active: Pressable | null = null;

export function setActivePress(p: Pressable | null): void {
  active = p;
}

export function clearActivePress(p: Pressable): void {
  if (active === p) active = null;
}

let refusedAt = -1;

/** A control just said "no" with its own cue; an explanation opened by the same tap (a toast) stays quiet. */
export function noteRefusal(): void {
  refusedAt = game.time;
}

export function justRefused(): boolean {
  return game.time - refusedAt < 0.12;
}

export function cancelActivePress(): void {
  const a = active;
  active = null;
  a?.cancelPress();
}

/** Containers that scroll set this flag so child buttons defer their click sound until the tap is real. */
export interface ScrollHost {
  readonly isScrollHost: true;
}

export function inScrollHost(obj: Container): boolean {
  let p: Container | null = obj.parent;
  while (p) {
    if ((p as Partial<ScrollHost>).isScrollHost) return true;
    p = p.parent;
  }
  return false;
}

export interface PressHandlers {
  /** The pointer went down on the target: change the visuals on this very frame. */
  down(): void;
  /** The press ended. `fire` is true for a real tap (released inside), false for a cancel. */
  up(fire: boolean): void;
}

export interface PressBinding {
  /** Abort a press in progress without firing. */
  cancel(): void;
  /** Remove every listener; call from the owner's destroy(). */
  dispose(): void;
}

/**
 * Pointer plumbing shared by small pressable widgets: down/up/cancel with scroll-view cancellation
 * (via the active-press registry) and leave/cancel handling. Buttons have richer rules and keep their own.
 */
export function bindPress(target: Container, h: PressHandlers): PressBinding {
  let pressed = false;
  const self: Pressable = {
    cancelPress: () => {
      if (!pressed) return;
      pressed = false;
      clearActivePress(self);
      h.up(false);
    },
  };
  const onDown = (): void => {
    if (pressed) return;
    pressed = true;
    setActivePress(self);
    h.down();
  };
  const onUp = (): void => {
    if (!pressed) return;
    pressed = false;
    clearActivePress(self);
    h.up(true);
  };
  const cancel = (): void => self.cancelPress();
  target.on('pointerdown', onDown);
  target.on('pointerup', onUp);
  target.on('pointerupoutside', cancel);
  target.on('pointerleave', cancel);
  target.on('pointercancel', cancel);
  return {
    cancel,
    dispose: () => {
      target.off('pointerdown', onDown);
      target.off('pointerup', onUp);
      target.off('pointerupoutside', cancel);
      target.off('pointerleave', cancel);
      target.off('pointercancel', cancel);
      pressed = false;
      clearActivePress(self);
    },
  };
}

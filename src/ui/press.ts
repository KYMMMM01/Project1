import type { Container } from 'pixi.js';

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

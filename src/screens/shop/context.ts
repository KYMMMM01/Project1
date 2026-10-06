import type { Shell } from '../contract';

/** The home shell the tabs were created for; screens opened from services use it to switch tabs and find the top bar. */
let current: Shell | null = null;

export function setShell(shell: Shell): void {
  current = shell;
}

export function getShell(): Shell | null {
  return current;
}

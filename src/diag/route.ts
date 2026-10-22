/**
 * The diagnostics page's address: `?scene=diag` on the game's own page. The owner opens it on a tester's phone to see what the page can tell about the device and
 * about the last time the game ended by itself. No debug flag, and the game is never started (the save is not touched).
 */
export function isDiagRoute(search: string): boolean {
  return new URLSearchParams(search).get('scene') === 'diag';
}

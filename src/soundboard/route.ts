/**
 * The sound board's address: `?scene=sounds` on the game's own page (https://kymmmm01.github.io/Project1/?scene=sounds). No debug flag, because
 * the owner opens it on his phone from the public test build. A release build can leave it out with `VITE_SOUNDBOARD=off npm run build`
 * (and delete `dist/soundboard/`, the candidate files).
 */
export function isSoundBoardRoute(search: string): boolean {
  return new URLSearchParams(search).get('scene') === 'sounds';
}

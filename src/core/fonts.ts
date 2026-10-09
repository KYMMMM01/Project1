/**
 * The game's two web fonts (the @font-face rules of index.html) and the one promise that says they are loaded. Canvas text is
 * measured and drawn the moment a Text is made, and a face that is still on its way is replaced by a system font for those glyphs
 * for good (Pixi keeps the texture), so nothing may draw before this settles: the boot waits for it, and so does every route
 * that builds a scene without the boot scene.
 */

/** The faces of index.html and a character each is asked to render (a face is fetched whole, so one character loads all of it). */
export const GAME_FACES: readonly { family: string; sample: string }[] = [
  { family: 'GameLatin', sample: 'Aa0' },
  { family: 'GameKR', sample: '가' },
];

/** What the game needs of `document.fonts`. */
export interface FontSetLike {
  load(font: string, text?: string): Promise<readonly unknown[]>;
}

/** `ready`: every face loaded. `failed`: one did not (network, a missing file, a rule that is not in the page); the text then shows in the system font. */
export type FontsOutcome = 'ready' | 'failed';

let pending: Promise<FontsOutcome> | null = null;
let outcome: FontsOutcome | null = null;

/** Load every face. One attempt per page: later calls get the same promise. */
export function loadGameFonts(set: FontSetLike = document.fonts): Promise<FontsOutcome> {
  pending ??= settle(set).then((o) => {
    outcome = o;
    return o;
  });
  return pending;
}

/** True once every face has loaded (false while loading and after a failure). */
export function fontsReady(): boolean {
  return outcome === 'ready';
}

async function settle(set: FontSetLike): Promise<FontsOutcome> {
  try {
    const loaded = await Promise.all(GAME_FACES.map((f) => set.load(`32px ${f.family}`, f.sample)));
    // `load` resolves with an empty list for a family the page never declared: that is a missing rule, not a loaded font.
    const bad = GAME_FACES.filter((_, i) => (loaded[i] ?? []).length === 0);
    if (bad.length === 0) return 'ready';
    console.warn(`[fonts] no @font-face rule for ${bad.map((f) => f.family).join(', ')}; text falls back to the system font`);
  } catch (err) {
    console.warn('[fonts] a game font failed to load; text falls back to the system font', err);
  }
  return 'failed';
}

/** Test hook: forget the one attempt. */
export function resetGameFonts(): void {
  pending = null;
  outcome = null;
}

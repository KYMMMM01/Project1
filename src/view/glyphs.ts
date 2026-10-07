/**
 * Glyphs that no font of the game carries are drawn from whatever system font the browser finds for them, and finding it costs 10 ms and more
 * the first time (the toy "Scratcher" says "갑옷·결계 −20%": a middle dot and a minus sign, and its card took 11 ms to draw first, 35 ms on a phone).
 * The queue draws every such character once, in one line, into a target nobody sees, so the first real text with one of them finds the font chosen.
 */
import { renderOnce } from '@/fx';
import { allStrings } from '@/core/i18n';
import { label } from '@/ui';

/** True for a character the game's own fonts are certain to carry: digits, Latin letters, a space, a Korean syllable. */
function plain(code: number): boolean {
  return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || code === 0x20 || (code >= 0xac00 && code <= 0xd7a3);
}

/** The distinct other characters of these strings (punctuation, signs, symbols), in code order. */
export function symbolsOf(strings: readonly string[]): string {
  const seen = new Set<number>();
  for (const s of strings) {
    for (const ch of s) {
      const code = ch.codePointAt(0) as number;
      // Placeholders and line breaks are not drawn.
      if (!plain(code) && code > 0x20 && code !== 0x7b && code !== 0x7d) seen.add(code);
    }
  }
  return String.fromCodePoint(...[...seen].sort((a, b) => a - b));
}

/** Draw every symbol of the game's strings once. */
export function warmGlyphs(): void {
  const text = label(symbolsOf(allStrings()), { size: 28 });
  renderOnce(text);
  text.destroy();
}

import { describe, expect, it } from 'vitest';
import { symbolsOf } from '@/view/glyphs';

describe('the symbols a game string uses', () => {
  it('keeps what no plain font is sure to carry, once each, in code order', () => {
    expect(symbolsOf(['갑옷·결계 −20%', 'Armor · ward −{a}%'])).toBe('%·−');
  });

  it('leaves out digits, Latin letters, spaces and Korean syllables', () => {
    expect(symbolsOf(['Abc xyz 0123 가나다 힣'])).toBe('');
    expect(symbolsOf([])).toBe('');
  });

  it('leaves out the braces of a placeholder, but keeps the rest of the punctuation', () => {
    expect(symbolsOf(['{n}번째 (x)!'])).toBe('!()');
  });

  it('keeps symbols outside the basic plane whole', () => {
    expect(symbolsOf(['fish 🐟 ★'])).toBe('★🐟');
  });

  it('sorts across strings and ignores line breaks and tabs', () => {
    expect(symbolsOf(['b?\n', '~a\t', '!'])).toBe('!?~');
  });
});

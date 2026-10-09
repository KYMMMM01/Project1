import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang } from '@/core/i18n';
import { SPECIAL_CELL_IDS } from '@/game/api';
import { SPECIAL_CELLS, cellShown, specialCellName } from '@/game';
import { CELL_LOOKS } from '@/fx';
import { cellExtra, cellNoteContent } from '@/view/field/cellMath';

beforeAll(() => {
  vi.stubGlobal('document', { documentElement: { lang: '' } });
});
afterAll(() => {
  setLang('ko');
  vi.unstubAllGlobals();
});

describe('the note on a tapped special cell', () => {
  for (const lang of ['ko', 'en'] as const) {
    it(`names the cell and quotes the number the cats really get, with no toy (${lang})`, () => {
      setLang(lang);
      for (const id of SPECIAL_CELL_IDS) {
        const note = cellNoteContent(id, []);
        expect(note.title).toBe(specialCellName(id));
        expect(note.text).toContain(String(cellShown(SPECIAL_CELLS[id])));
        expect(note.text).not.toMatch(/\{\w+\}|undefined|NaN/);
      }
    });

    it(`adds what the prime spot toy gives to every kind of cell (${lang})`, () => {
      setLang(lang);
      expect(cellExtra(['sunny_spot'])).toBeCloseTo(0.1, 6);
      for (const id of SPECIAL_CELL_IDS) {
        const spec = SPECIAL_CELLS[id];
        const note = cellNoteContent(id, ['sunny_spot']);
        expect(note.text).toContain(String(cellShown(spec, spec.value + 0.1)));
        expect(note.text).not.toContain(`${cellShown(spec)}${spec.stat === 'fish' ? '' : '%'} `);
      }
    });
  }

  it('is 20 for the sunbeam, 30 with the toy, and 0.15 fish a second for the treat, 0.25 with the toy', () => {
    setLang('ko');
    expect(cellNoteContent('sun', []).text).toContain('20');
    expect(cellNoteContent('sun', ['sunny_spot']).text).toContain('30');
    expect(cellNoteContent('treat', []).text).toContain('0.15');
    expect(cellNoteContent('treat', ['sunny_spot']).text).toContain('0.25');
    expect(cellExtra(['batteries', 'sunny_spot'])).toBeCloseTo(0.1, 6);
  });
});

describe('the look of each special cell', () => {
  it('has a tile, a badge and a glow of its own for each kind', () => {
    const tiles = new Set<string>();
    const badges = new Set<string>();
    const glows = new Set<number>();
    for (const id of SPECIAL_CELL_IDS) {
      const look = CELL_LOOKS[id];
      expect(look.tile).toBe(`cell_${id}`);
      expect(look.badge).toBe(`icon_cell_${id}`);
      tiles.add(look.tile);
      badges.add(look.badge);
      glows.add(look.glow);
    }
    expect(tiles.size).toBe(SPECIAL_CELL_IDS.length);
    expect(badges.size).toBe(SPECIAL_CELL_IDS.length);
    expect(glows.size).toBe(SPECIAL_CELL_IDS.length);
  });
});

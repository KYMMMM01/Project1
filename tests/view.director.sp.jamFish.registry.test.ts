import { describe, expect, it } from 'vitest';
import { makeFish } from '@/view/director/sp/fish';
import { makeJam } from '@/view/director/sp/jam';
import { SCENES } from '@/view/director/sp/scenes';

describe('the registry of scenes', () => {
  it('has the bard\'s jam and the alchemist\'s fish', () => {
    expect(SCENES.jam).toBe(makeJam);
    expect(SCENES.fish).toBe(makeFish);
  });
});

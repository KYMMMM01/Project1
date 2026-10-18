import { describe, expect, it } from 'vitest';
import { makeCloud } from '@/view/director/sp/cloud';
import { makeKnock } from '@/view/director/sp/knock';
import { SCENES } from '@/view/director/sp/scenes';

describe('the registry of scenes', () => {
  it('has the storm cat\'s cloud and the frost queen\'s knock', () => {
    expect(SCENES.cloud).toBe(makeCloud);
    expect(SCENES.knock).toBe(makeKnock);
  });
});

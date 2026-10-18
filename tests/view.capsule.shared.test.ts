import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SP_CAPSULE_KINDS, SP_ROWS } from '@/game';
import '@/game/data/stringsGame';
import { setLang, t } from '@/core/i18n';
import { CAPSULE_COLOR, RAINBOW, capsuleArt, capsuleLook, resetCapsuleArt } from '@/view/capsuleArt';
import { GHOST_SKY } from '@/view/field/ghosts';
import { clearRingHolds, holdRing, releaseRing, ringHeld, ringHolds } from '@/view/field/ringHold';
import { LINE_HAS_B, LINE_IDS } from '@/view/director/sp/capsuleMath';
import { SCENES } from '@/view/director/sp/scenes';
import { makeCapsule } from '@/view/director/sp/capsule';
import { CAPSULE_TOY_WAIT } from '@/view/staging';
import { LAND_RING_SECONDS, SKILL_DROP_SECONDS, TOSS_SECONDS, tossFor } from '@/view/toss';

/** Hue in degrees of a 0xRRGGBB colour. */
function hue(c: number): number {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const apart = (a: number, b: number): number => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};

describe('the ring hold', () => {
  beforeEach(() => clearRingHolds());

  it('shows the held value instead of the gauge until it is let go, and costs nothing when nothing is held', () => {
    expect(ringHeld(1)).toBeUndefined();
    holdRing(1, 0);
    expect(ringHeld(1)).toBe(0);
    expect(ringHeld(2)).toBeUndefined();
    holdRing(1, 0.5);
    expect(ringHeld(1)).toBe(0.5);
    expect(ringHolds()).toBe(1);
    releaseRing(1);
    expect(ringHeld(1)).toBeUndefined();
    holdRing(3, 0.2);
    clearRingHolds();
    expect(ringHolds()).toBe(0);
  });
});

describe('the partner falls from the sky', () => {
  it('has a lead of its own (the field drops a sticker straight down), none under reduced motion, and the other sources are as they were', () => {
    expect(tossFor('skill', false)).toBe(SKILL_DROP_SECONDS);
    expect(tossFor('skill', true)).toBe(0);
    expect(SKILL_DROP_SECONDS).toBeGreaterThan(0.2);
    expect(SKILL_DROP_SECONDS).toBeLessThan(0.45);
    expect(SKILL_DROP_SECONDS).toBeLessThan(LAND_RING_SECONDS);
    expect(tossFor('button', false)).toBe(TOSS_SECONDS);
    expect(tossFor('relic', false)).toBe(0);
    expect(tossFor('twin', false)).toBe(0);
  });

  it('the toy capsule\'s lid has the time of the screen that follows it', () => {
    expect(CAPSULE_TOY_WAIT).toBeGreaterThan(0.2);
    expect(CAPSULE_TOY_WAIT).toBeLessThan(0.8);
  });
});

describe('the words of the capsule', () => {
  // `setLang` writes the page's language attribute.
  beforeEach(() => vi.stubGlobal('document', { documentElement: {} }));
  afterEach(() => {
    setLang('ko');
    vi.unstubAllGlobals();
  });

  it('has every line of the wording table in both languages, with a second line exactly where the table says', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const id of LINE_IDS) {
        expect(t(`sp.capsule.${id}.a`), `${lang} ${id}.a`).not.toBe(`sp.capsule.${id}.a`);
        const b = t(`sp.capsule.${id}.b`);
        if (LINE_HAS_B[id]) expect(b, `${lang} ${id}.b`).not.toBe(`sp.capsule.${id}.b`);
        else expect(b, `${lang} ${id}.b`).toBe(`sp.capsule.${id}.b`);
      }
    }
  });

  it('writes the purr as a number to fill in (the data row owns it), and names ranks only by the game\'s own words', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const key of ['purr.a', 'partnerEmpty.b', 'toyEmpty.b', 'guardianEmpty.b']) {
        const raw = t(`sp.capsule.${key}`);
        expect(raw).toContain('{n}');
        expect(t(`sp.capsule.${key}`, { n: 7 })).toContain('7');
      }
      for (const id of LINE_IDS) {
        for (const part of ['a', 'b']) {
          const s = t(`sp.capsule.${id}.${part}`);
          // Decision 28: never the old grade names in anything a player reads.
          expect(s).not.toMatch(/일반|희귀|영웅|전설|신화|common|rare|epic|legendary|mythic/i);
        }
      }
    }
    setLang('en');
    expect(t('sp.capsule.guardian.b')).toBe('A King becomes a Guardian');
    setLang('ko');
    expect(t('sp.capsule.guardian.b')).toBe('대왕이 수호신이 돼요');
    expect(t('sp.capsule.toy.a') + ' ' + t('sp.capsule.toy.b')).toBe('장난감이 우르르! 하나만 골라요');
  });

  it('keeps each line inside the label without shrinking its type (a Hangul syllable is as wide as the type is high, a Latin letter about half): the cry is 24 px, the line under it 19', () => {
    // Widths in ems: a Hangul syllable 1, a letter or a digit 0.55, a space or a mark 0.32.
    const ems = (s: string): number => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? 1 : /[A-Za-z0-9]/.test(c) ? 0.55 : 0.32), 0);
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const id of LINE_IDS) {
        for (const [part, size] of [['a', 24], ['b', 19]] as const) {
          const s = t(`sp.capsule.${id}.${part}`, { n: 10 });
          if (s === `sp.capsule.${id}.${part}`) continue;
          // The label is at most 380 wide with 26 px of paper at each end (328 for the type); it shrinks the type to fit, so a line a few per cent over is fine, one that needs a third less is not.
          expect(ems(s) * size, `${lang} ${id}.${part}: ${s}`).toBeLessThanOrEqual(352);
        }
      }
    }
  });
});

describe('the capsules\' looks', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    resetCapsuleArt();
  });
  afterEach(() => {
    resetCapsuleArt();
    vi.unstubAllGlobals();
  });

  it('is in the registry', () => {
    expect(SCENES.capsule).toBe(makeCapsule);
  });

  it('reads colour and mark from the data row: pink, pink, mint, pink, gold, rainbow, and a mark each so that no kind rests on hue alone', () => {
    expect(SP_CAPSULE_KINDS.map((k) => capsuleLook(k).color)).toEqual(['pink', 'pink', 'mint', 'pink', 'gold', 'rainbow']);
    expect(SP_CAPSULE_KINDS.map((k) => capsuleLook(k).mark)).toEqual(['none', 'heart', 'paws', 'smallCapsule', 'star', 'bands']);
    expect(new Set(SP_CAPSULE_KINDS.map((k) => capsuleLook(k).mark)).size).toBe(6);
    expect(SP_ROWS.capsule.marks.partner.color).toBe('mint');
  });

  it('paints a lid for each kind, one shared base, and the glyphs, once', () => {
    const a = capsuleArt();
    expect(new Set(SP_CAPSULE_KINDS.map((k) => a.lids[k])).size).toBe(6);
    expect(a.base).toBeDefined();
    expect(capsuleArt()).toBe(a);
  });

  it('the partner\'s mint stays apart from the clones\' sky blue, the toy\'s gold and the pinks, and is a hue of its own', () => {
    const mint = CAPSULE_COLOR.mint;
    expect(apart(mint, GHOST_SKY)).toBeGreaterThan(70);
    expect(apart(mint, CAPSULE_COLOR.gold)).toBeGreaterThan(40);
    expect(apart(mint, CAPSULE_COLOR.pink)).toBeGreaterThan(90);
    // A green: more green than red or blue.
    expect((mint >> 8) & 255).toBeGreaterThan((mint >> 16) & 255);
    expect((mint >> 8) & 255).toBeGreaterThan(mint & 255);
    // The pink and the gold are not each other either.
    expect(apart(CAPSULE_COLOR.pink, CAPSULE_COLOR.gold)).toBeGreaterThan(40);
    // The rainbow has four bands of colour, all different, none purple.
    expect(new Set(RAINBOW).size).toBe(4);
    for (const c of RAINBOW) {
      const h = hue(c);
      expect(h < 255 || h > 320).toBe(true);
    }
  });
});

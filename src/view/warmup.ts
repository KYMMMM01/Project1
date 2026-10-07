/**
 * The battle's first-use work, asked of the warm-up queue (src/fx/warm.ts) at the moments it can be done for free. At the start of
 * a battle: the particle shader and effect sheet, the cats' and toys' pictures, the chests and the paw. Whenever the wave counter or
 * the phase moves (the three-second preparation, the pick of three, the toy screen): what the coming wave and the one after it
 * will draw (`battle.previewWave` says which kinds), most urgent first. Everything it uploads stays on the card for the battle.
 */
import { hasTex, imageKeys } from '@/core/assets';
import { AREA_BAKE_STEPS, DISC_KINDS, bakeAreaStep, fxVignette, numberFontTextures, uploadTexture, warm, warmImage, warmParticles, WARM_PRIO, type DiscKind } from '@/fx';
import type { BattleApi } from '@/game';
import { waveNeeds, type WaveNeeds } from './field/warmPlan';

/**
 * Picture families a battle may show that are not tied to the next two waves: every kind of enemy and boss (an elite or a modifier may bring
 * one early), the cats (pick of three, merges, portraits), the toys, the chests and the paw.
 */
const LATER_PREFIXES: readonly string[] = ['enemy_', 'boss_', 'unit_', 'relic_', 'icon_chest', 'icon_hand', 'icon_card', 'icon_capsule', 'icon_clover'];

/** The coming wave and the one after it. */
const AHEAD: readonly [number, number] = [1, 2];

/** Ask for the baking of every piece of a ground area (one piece a frame, see areas.ts). */
export function warmArea(kind: DiscKind, prio: number): void {
  for (let step = 0; step < AREA_BAKE_STEPS; step++) warm.request(`area:${kind}:${step}`, prio, 3, () => bakeAreaStep(kind, step));
}

/** Everything one wave's list needs, asked at `prio`. */
export function warmWave(needs: WaveNeeds, prio: number): void {
  for (const key of needs.images) warmImage(key, prio);
  for (const kind of needs.areas) warmArea(kind, prio);
}

export class BattleWarmup {
  private key = '';

  constructor(private readonly battle: BattleApi) {
    // The particle shader and its sheet first: the biggest single piece, and nothing is moving yet.
    warm.request('pipe:particles', WARM_PRIO.pipe, 30, warmParticles);
    // The frame-wide vignette of the big summon reveals, the boss warning and the danger edge.
    warm.request('fx:vignette', WARM_PRIO.pipe, 1, () => uploadTexture(fxVignette()));
    // The glyph sheets of every face of the floating numbers (drawn when the scene was built): each is a 10 ms upload that the first hit would pay.
    numberFontTextures().forEach((texture, i) => warm.request(`fx:numbers:${i}`, WARM_PRIO.pipe, 10, () => uploadTexture(texture)));
    for (const kind of DISC_KINDS) warmArea(kind, WARM_PRIO.later);
    for (const key of imageKeys()) {
      if (LATER_PREFIXES.some((p) => key.startsWith(p))) warmImage(key, WARM_PRIO.later);
    }
  }

  /** Called every frame; does work only when the wave counter or the phase has moved. */
  update(): void {
    const b = this.battle;
    const key = `${b.wave}|${b.phase}`;
    if (key === this.key) return;
    this.key = key;
    if (b.phase === 'won' || b.phase === 'lost') return;
    AHEAD.forEach((ahead, i) => {
      const needs = waveNeeds(b.previewWave(b.wave + ahead), hasTex);
      warmWave(needs, i === 0 ? WARM_PRIO.coming : WARM_PRIO.next);
    });
  }

  destroy(): void {
    warm.clear();
  }
}

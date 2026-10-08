/**
 * The battle's first-use work, asked of the warm-up queue (src/fx/warm.ts) at the moments it can be done for free. At the start of
 * a battle: the particle shader and effect sheet, the cats' and toys' pictures, the chests and the paw, and the sounds every fight plays
 * (menus, the summon ladder, merges, plain hits) with those of the cats on the board. Whenever the wave counter or the phase moves (the
 * three-second preparation, the pick of three, the toy screen): what the coming wave and the one after it will draw and play (`battle.previewWave`
 * says which kinds, most urgent first; an elite's or a boss's warning, cry and collapse). Whenever a cat appears: its release and impact sounds
 * and those of the cat it would merge into. Everything it uploads stays on the card and everything it bakes stays in the sound bank (within its
 * budget, see src/audio/bank.ts) for the battle.
 */
import { audio, type PrimeTarget, type SfxId, type StingerId } from '@/audio';
import { hasTex, imageKeys } from '@/core/assets';
import { AREA_PICTURES, DISC_KINDS, PAINT_IDS, fxVignette, paintKey, numberFontTextures, uploadTexture, warm, warmImage, warmParticles, WARM_PRIO, type DiscKind } from '@/fx';
import { mergeResultOf, type BattleApi, type UnitId } from '@/game';
import { waveNeeds, type WaveNeeds } from './field/warmPlan';
import { warmGlyphs } from './glyphs';
import { LATER_SOUNDS, LATER_STINGERS, START_SOUNDS, unitSounds, waveSounds } from './soundPlan';

/**
 * Picture families a battle may show that are not tied to the next two waves: every kind of enemy and boss (an elite or a modifier may bring
 * one early), the cats (pick of three, merges, portraits), the toys, the chests and the paw.
 */
const LATER_PREFIXES: readonly string[] = ['enemy_', 'boss_', 'unit_', 'relic_', 'icon_chest', 'icon_hand', 'icon_card', 'icon_capsule', 'icon_clover'];

/** The coming wave and the one after it. */
const AHEAD: readonly [number, number] = [1, 2];

/** What one baking step of a sound costs the frame that runs it (ms): building the offline graph, 2 to 14 for the ones the fight plays. */
const SOUND_COST_MS = 4;

/** Ask for the drawn pictures of a ground area to be put on the card (one a frame, see areas.ts). */
export function warmArea(kind: DiscKind, prio: number): void {
  for (const id of AREA_PICTURES[kind]) warmImage(paintKey(id), prio);
}

/** Ask for a sound to be baked, one variant a piece (nothing is asked for a sound that is baked or on its way). */
export function warmSound(target: PrimeTarget, prio: number): void {
  const name = 'sfx' in target ? `sfx:${target.sfx}` : `stinger:${target.stinger}`;
  const left = audio.primeLeft(target);
  for (let i = 0; i < left; i++) warm.request(`snd:${name}:${i}`, prio, SOUND_COST_MS, () => void audio.primeStep(target));
}

function warmSfx(id: SfxId, prio: number): void {
  warmSound({ sfx: id }, prio);
}

function warmStinger(id: StingerId, prio: number): void {
  warmSound({ stinger: id }, prio);
}

/** Everything one wave's list needs, asked at `prio`. */
export function warmWave(needs: WaveNeeds, prio: number): void {
  for (const key of needs.images) warmImage(key, prio);
  for (const kind of needs.areas) warmArea(kind, prio);
}

export class BattleWarmup {
  private key = '';
  private started = false;
  /** The cat last seen in each cell, so a cat that appears (a summon, a merge, a molt, a pick, a restored run) is noticed once. */
  private readonly seen: Array<UnitId | null> = [];
  private readonly offs: Array<() => void> = [];

  constructor(private readonly battle: BattleApi) {
    // The particle shader and its sheet first: the biggest single piece, and nothing is moving yet.
    warm.request('pipe:particles', WARM_PRIO.pipe, 30, warmParticles);
    // The frame-wide vignette of the big summon reveals, the boss warning and the danger edge.
    warm.request('fx:vignette', WARM_PRIO.pipe, 1, () => uploadTexture(fxVignette()));
    // The symbols no game font carries (a middle dot, a minus sign), drawn once so the first text with one of them does not pay for finding a font.
    warm.request('pipe:glyphs', WARM_PRIO.pipe, 15, warmGlyphs);
    // The glyph sheets of every face of the floating numbers (drawn when the scene was built): each is a 10 ms upload that the first hit would pay.
    numberFontTextures().forEach((texture, i) => warm.request(`fx:numbers:${i}`, WARM_PRIO.pipe, 10, () => uploadTexture(texture)));
    for (const kind of DISC_KINDS) warmArea(kind, WARM_PRIO.later);
    // Every other drawn battle picture: the shots, bursts, bolts, shards and the shield badge, before the first fight needs them.
    for (const id of PAINT_IDS) warmImage(paintKey(id), WARM_PRIO.later);
    for (const key of imageKeys()) {
      if (LATER_PREFIXES.some((p) => key.startsWith(p))) warmImage(key, WARM_PRIO.later);
    }
    // The field is about to be lost: the defeat fanfare is ready before the countdown ends.
    this.offs.push(
      battle.events.on('danger', (e) => {
        if (e.level >= 1) warmStinger('defeat', WARM_PRIO.coming);
      }),
      battle.events.on('overflow', () => warmStinger('defeat', WARM_PRIO.coming)),
    );
  }

  /** Called every frame; does work only when a cat has appeared or the wave counter or the phase has moved. */
  update(): void {
    const b = this.battle;
    const key = `${b.wave}|${b.phase}`;
    if (key === this.key) {
      this.scanBoard();
      return;
    }
    this.key = key;
    if (b.phase === 'won' || b.phase === 'lost') return;
    // Pictures first (cheap, and the wave walks in on them), then the sounds in the order they are first needed. A bake costs 4 ms or more, so
    // the queue lets one go per frame at most, and its allowance is spent on average (src/fx/warm.ts).
    const lists = AHEAD.map((ahead, i) => ({ ahead, entries: b.previewWave(b.wave + ahead), prio: i === 0 ? WARM_PRIO.coming : WARM_PRIO.next }));
    for (const { entries, prio } of lists) warmWave(waveNeeds(entries, hasTex), prio);
    if (!this.started) {
      this.started = true;
      for (const id of START_SOUNDS) warmSfx(id, WARM_PRIO.coming);
      for (const id of LATER_SOUNDS) warmSfx(id, WARM_PRIO.later);
      for (const id of LATER_STINGERS) warmStinger(id, WARM_PRIO.later);
    }
    if (b.phase === 'choice' && b.pending?.kind === 'summon') for (const id of b.pending.options) this.warmUnit(id, WARM_PRIO.coming);
    this.scanBoard();
    for (const { ahead, entries, prio } of lists) {
      // An elite's or a boss's warning, cry and collapse are among a wave's sounds.
      for (const id of waveSounds(entries)) warmSfx(id, prio);
      // The wave that ends the run ends it with the fanfare.
      if (b.init.mode !== 'endless' && b.wave + ahead >= b.totalWaves) warmStinger('victory', prio);
    }
  }

  /** Notice the cats that have appeared since the last frame (a summon, a merge, a molt, a pick, a restored run) and ask for their sounds. */
  private scanBoard(): void {
    const units = this.battle.units;
    for (let cell = 0; cell < units.length; cell++) {
      const id = units[cell]?.id ?? null;
      if (id === (this.seen[cell] ?? null)) continue;
      this.seen[cell] = id;
      if (id) this.warmUnit(id, WARM_PRIO.coming);
    }
  }

  /** A cat's release and impact sounds now, and those of the cat two of its kind merge into a little later (the next thing the board is likely to need). */
  private warmUnit(id: UnitId, prio: number): void {
    for (const sfx of unitSounds(id)) warmSfx(sfx, prio);
    const next = mergeResultOf(id);
    if (next) for (const sfx of unitSounds(next)) warmSfx(sfx, WARM_PRIO.next);
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    warm.clear();
  }
}

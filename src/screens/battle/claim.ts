/** Feedback every claim on the home tab gives: icons fly to the top bar, a sound, a haptic. */
import { Container } from 'pixi.js';
import { audio } from '@/audio';
import { hasTex, tex } from '@/core/assets';
import { haptic } from '@/core/haptics';
import { flyIconCount, flyTo, type FlyEnd } from '@/fx';
import type { BundlePart } from '@/meta';
import { drawIcon } from '@/ui';
import type { CurrencyKind, Shell } from '../contract';

const FLY_SIZE = 56;

const KINDS: readonly CurrencyKind[] = ['gold', 'gems', 'tickets'];

function isCurrency(p: BundlePart): p is Extract<BundlePart, { kind: CurrencyKind }> {
  return KINDS.some((k) => k === p.kind);
}

/** How many icons a reward of `n` is worth: a handful for small amounts, more for big ones. */
export function iconCountFor(n: number): number {
  return flyIconCount(Math.round(Math.log10(Math.max(1, n) + 1) * 3.5));
}

function flightArt(kind: CurrencyKind): { texture: ReturnType<typeof tex> } | { make: () => Container } {
  if (kind === 'gold' && hasTex('icon_gold')) return { texture: tex('icon_gold') };
  if (kind === 'gems' && hasTex('icon_gem')) return { texture: tex('icon_gem') };
  const name = kind === 'gold' ? 'coin' : kind === 'gems' ? 'gem' : 'ticket';
  return { make: () => drawIcon(name, FLY_SIZE) };
}

/**
 * Fly the currency parts of a reward from `origin` to the top bar and play the claim sound and haptic.
 * Returns the parts that are not currency (chests, cards): the caller shows those in the rewards popup.
 */
export function playClaim(origin: FlyEnd, parts: readonly BundlePart[], shell: Shell): BundlePart[] {
  const rest: BundlePart[] = [];
  let sound: 'coin_many' | 'gem' | 'reward_claim' = 'reward_claim';
  for (const part of parts) {
    if (!isCurrency(part)) {
      rest.push(part);
      continue;
    }
    if (part.kind === 'gold') sound = 'coin_many';
    else if (part.kind === 'gems' && sound !== 'coin_many') sound = 'gem';
    const kind = part.kind;
    flyTo({
      from: origin,
      to: shell.currencyAnchor(kind),
      count: iconCountFor(part.n),
      size: FLY_SIZE,
      ...flightArt(kind),
      onArrive: (i) => audio.playStep(kind === 'gold' ? 'coin' : 'gem', Math.min(i, 6), { volume: 0.5 }),
      onDone: () => shell.refresh(),
    });
  }
  audio.play(sound);
  haptic('success');
  return rest;
}

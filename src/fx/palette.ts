import { mixColor } from '@/core/math';
import type { ClassId } from '@/game/api';
import { Color, Rarity, TapeColors } from '@/ui/theme';

/**
 * The colours of every effect. Effects are cut paper, not light, so each one is a kit token or a mix of
 * two: nothing in the battle's staging has a hue the paper world does not have, and the lightest tone is
 * the cream of the paper rather than white.
 */
export const Hue = {
  cream: Color.paperLight,
  /** Hit sparks and sparkles: mustard paper, lightened. */
  spark: mixColor(Color.mustard, Color.paperLight, 0.3),
  sun: mixColor(Color.mustard, Color.paperLight, 0.5),
  gold: Color.mustard,
  fire: Color.coral,
  ember: mixColor(Color.coral, Color.mustard, 0.5),
  flame: Color.coralDark,
  fur: mixColor(Color.mustard, Color.coral, 0.5),
  heal: Color.leaf,
  heart: mixColor(Color.berry, Color.paperLight, 0.2),
  water: Rarity.rare.color,
  ice: TapeColors.sky.base,
  iceLight: TapeColors.sky.mark,
  zap: Color.mustard,
  /** The classic red of a laser dot and of an alarm. */
  alarm: mixColor(Color.coralDark, Color.berryDark, 0.4),
  /** Warm dust and smoke: kraft paper going to brown. */
  dust: mixColor(Color.kraft, Color.paperLight, 0.3),
  smoke: mixColor(Color.kraft, Color.ink, 0.45),
  smokeDark: mixColor(Color.kraftDark, Color.ink, 0.6),
  shadow: Color.shadow,
} as const;

/** Paper confetti: the kit's craft papers and tapes. */
export const CONFETTI: readonly number[] = [Color.coral, Color.mustard, Color.teal, Color.leaf, Color.berry, TapeColors.sky.base, Color.paperLight];

/** The four class lines wear the kit's craft papers: red warriors, green rangers, blue mages, yellow tricksters. */
export const CLASS_HUE: Readonly<Record<ClassId, number>> = {
  warrior: Color.coral,
  ranger: Color.leaf,
  mage: Rarity.rare.color,
  trickster: Color.mustard,
};

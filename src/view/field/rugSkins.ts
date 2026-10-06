import { mixColor } from '@/core/math';
import { Color, type TapeName } from '@/ui';

/**
 * Board mats as data. Every skin is a craft mat: a sheet of coloured paper with a flat pattern, a dashed
 * "cut here" line and a strip of washi tape. Ids match the meta cosmetics (`profile.equipped.rug`).
 */

export type RugPattern = 'plain' | 'stripes' | 'gingham' | 'dots' | 'paws' | 'waves' | 'stars' | 'diamond';
export type TapePrint = 'dots' | 'gingham' | 'stripes' | 'plain';

export interface RugSkin {
  id: string;
  pattern: RugPattern;
  /** The sheet. Light enough that a cat's white sticker border stays a visible edge. */
  paper: number;
  /** The flat pattern's ink; the pattern never gets louder than a cat. */
  mark: number;
  /** The dashed line just inside the cut. */
  dash: number;
  tape: TapeName;
  tapePrint: TapePrint;
}

export const DEFAULT_RUG = 'rug_default';

/** A craft sheet: cream paper pulled a little towards a token colour. */
function sheet(tint: number, amount: number): number {
  return mixColor(Color.paper, tint, amount);
}

export const RUG_SKINS: readonly RugSkin[] = [
  { id: 'rug_default', pattern: 'plain', paper: Color.paper, mark: Color.kraft, dash: Color.teal, tape: 'sky', tapePrint: 'dots' },
  { id: 'rug_ch1', pattern: 'stripes', paper: sheet(Color.leaf, 0.3), mark: Color.leaf, dash: Color.leafDark, tape: 'green', tapePrint: 'stripes' },
  { id: 'rug_ch2', pattern: 'gingham', paper: sheet(Color.coral, 0.2), mark: Color.coral, dash: Color.coralDark, tape: 'pink', tapePrint: 'gingham' },
  { id: 'rug_ch3', pattern: 'waves', paper: sheet(Color.teal, 0.3), mark: Color.teal, dash: Color.tealDark, tape: 'sky', tapePrint: 'plain' },
  { id: 'rug_ch4', pattern: 'dots', paper: sheet(Color.mustard, 0.3), mark: Color.mustard, dash: Color.leafDark, tape: 'yellow', tapePrint: 'dots' },
  { id: 'rug_ch5', pattern: 'diamond', paper: sheet(Color.berry, 0.2), mark: Color.berry, dash: Color.berryDark, tape: 'pink', tapePrint: 'stripes' },
  { id: 'rug_gem1', pattern: 'dots', paper: sheet(Color.coral, 0.34), mark: Color.berry, dash: Color.berryDark, tape: 'yellow', tapePrint: 'gingham' },
  { id: 'rug_gem2', pattern: 'stripes', paper: sheet(Color.teal, 0.2), mark: Color.teal, dash: Color.tealDark, tape: 'sky', tapePrint: 'stripes' },
  { id: 'rug_gem3', pattern: 'stars', paper: Color.kraft, mark: Color.paperLight, dash: Color.paperLight, tape: 'yellow', tapePrint: 'plain' },
  { id: 'rug_baby', pattern: 'paws', paper: sheet(Color.coral, 0.16), mark: Color.coral, dash: Color.coral, tape: 'pink', tapePrint: 'dots' },
  { id: 'rug_butler', pattern: 'diamond', paper: sheet(Color.ink, 0.12), mark: Color.inkSoft, dash: Color.mustardDark, tape: 'yellow', tapePrint: 'plain' },
  { id: 'rug_calendar', pattern: 'stripes', paper: sheet(Color.leaf, 0.22), mark: Color.berry, dash: Color.leafDark, tape: 'green', tapePrint: 'gingham' },
  { id: 'rug_season', pattern: 'stars', paper: sheet(Color.mustard, 0.34), mark: Color.coral, dash: Color.coralDark, tape: 'pink', tapePrint: 'stripes' },
];

const byId = new Map(RUG_SKINS.map((s) => [s.id, s] as const));

/** The skin for an equipped cosmetic id; unknown ids (a skin from a newer build) fall back to the default mat. */
export function rugSkin(id: string): RugSkin {
  return byId.get(id) ?? (byId.get(DEFAULT_RUG) as RugSkin);
}

/** The paper of the twenty cell squares: the sheet a shade darker, so cells read as pieces laid on it. */
export function cellPaper(skin: RugSkin): number {
  return mixColor(skin.paper, Color.shadow, 0.1);
}

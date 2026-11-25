/**
 * What another player (or the player) looks like on the ranking: the big cat icon in its frame with the level band, the name plate with
 * the name on it, and the record and place on the board the card was opened from (docs/명세_프로필꾸미기.md 6). A look the board row
 * did not carry (a row folded before looks existed) is drawn as the defaults, without a level band.
 */
import { t } from '@/core/i18n';
import { Color, Panel, Popup, popups, uiLabel } from '@/ui';
import { LOOK_DEFAULTS, type LookWire } from '../../../functions/src/looks';
import { LevelBadge } from '../shell/LevelBadge';
import { NamePlate } from '../shell/NamePlate';
import './strings';

export interface CardInfo {
  name: string;
  /** Place on the board. */
  rank: number;
  /** Best wave on the board. */
  score: number;
  look: LookWire | null;
}

const W = 560;
const BADGE_SCALE = 1.8;
const BADGE_Y = 188;
const PLATE_SCALE = 1.3;
const PLATE_Y = 340;
const H = 480;

class ProfileCard extends Popup {
  constructor(info: CardInfo, board: string) {
    super({ dismissResult: undefined });
    const panel = new Panel({ width: W, height: H, title: board, torn: 'bottom', tape: 'sky' });

    const badge = new LevelBadge();
    badge.setIcon(info.look?.i ?? LOOK_DEFAULTS.i);
    badge.setFrame(info.look?.f ?? LOOK_DEFAULTS.f);
    if (info.look) badge.setLevel(info.look.lv);
    badge.scale.set(BADGE_SCALE);
    badge.position.set(W / 2, BADGE_Y);

    const plate = new NamePlate();
    plate.setPlate(info.look?.p ?? LOOK_DEFAULTS.p);
    plate.setName(info.name);
    plate.scale.set(PLATE_SCALE);
    plate.position.set(W / 2, PLATE_Y);

    const place = uiLabel(t('rt.sys.rank.place', { n: info.rank }), { size: 34, color: Color.teal });
    place.position.set(W / 2, PLATE_Y + 70);
    const waves = uiLabel(t('rt.sys.rank.waves', { n: info.score }), { size: 30 });
    waves.position.set(W / 2, PLATE_Y + 112);

    panel.content.addChild(badge, plate, place, waves);
    this.body.addChild(panel);
    this.setContentSize(W + 80, H + 90);
  }
}

/** Show a player's card; resolves when it is closed (backdrop, Back or Escape). `board` is the title: the board the place is on. */
export function openProfileCard(info: CardInfo, board: string): Promise<void> {
  return popups.open(new ProfileCard(info, board));
}

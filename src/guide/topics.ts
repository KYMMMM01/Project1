/**
 * The one list of things the game explains. A topic is its id, the section of the guidebook it lives in, its
 * picture, and what "try it" points back to. The words live in strings.ts (`guide.<id>.title|teach|full`) and
 * every number in them comes from facts.ts, so the tutorial bubble, the first-encounter card and the guidebook
 * can never disagree with the game.
 */
import type { EnemyId, RelicId, UnitId } from '@/game';
import type { IconName } from '@/ui';

export const SECTIONS = ['start', 'team', 'field', 'foes', 'home'] as const;
export type SectionId = (typeof SECTIONS)[number];

/** What a topic's small picture is made of: the game's own stickers and kit pieces. */
export type Art =
  | { k: 'icon'; name: IconName }
  | { k: 'cats'; ids: readonly UnitId[]; arrows?: boolean }
  | { k: 'foe'; id: EnemyId }
  | { k: 'toy'; id: RelicId }
  | { k: 'cell'; cell: 'sun' | 'wet' | 'zap'; cat?: UnitId }
  | { k: 'chest'; chest: 'wood' | 'silver' | 'gold' };

/** A control of the battle screen "try it" can point at. */
export type TryControl = 'summon' | 'grade' | 'laser' | 'call' | 'speed' | 'chips' | 'odds' | 'gauge' | 'purr' | 'toys' | 'preview';
/** A home tab "try it" can go to; 'settings' stays on the settings sheet the guidebook was opened from. */
export type TryTab = 'shop' | 'cats' | 'battle' | 'missions' | 'pass' | 'settings';
/** The control or card "try it" points at once the tab is open, named `<tab>.<thing>`; each tab (or the settings sheet) answers for its own. */
export type HomePoint =
  | 'cats.cards'
  | 'cats.wild'
  | 'shop.chests'
  | 'shop.free'
  | 'battle.stakes'
  | 'battle.calendar'
  | 'battle.patrol'
  | 'battle.sweep'
  | 'battle.daily'
  | 'battle.cup'
  | 'battle.endless'
  | 'missions.list'
  | 'missions.chest'
  | 'pass.head'
  | 'settings.backup';

export interface TryTarget {
  /** Shown when the guidebook was opened from a battle. */
  control?: TryControl;
  /** Shown when it was opened from the home screen. */
  tab?: TryTab;
  /** What the home screen then points at (a hand and a spotlight); without it the tab simply opens. */
  point?: HomePoint;
}

export interface TopicDef {
  id: TopicId;
  section: SectionId;
  art: Art;
  try?: TryTarget;
}

const T = <const I extends string>(id: I, section: SectionId, art: Art, tryIt?: TryTarget): { id: I; section: SectionId; art: Art; try?: TryTarget } =>
  tryIt ? { id, section, art, try: tryIt } : { id, section, art };

const ico = (name: IconName): Art => ({ k: 'icon', name });
const cats = (...ids: UnitId[]): Art => ({ k: 'cats', ids, arrows: ids.length > 1 });
const foe = (id: EnemyId): Art => ({ k: 'foe', id });

export const TOPIC_LIST = [
  // ── start ──
  T('summon', 'start', ico('fish'), { control: 'summon' }),
  T('summon_grade', 'start', ico('arrow_up'), { control: 'grade' }),
  T('pity', 'start', ico('lucky_clover'), { control: 'odds' }),
  T('merge', 'start', cats('w_paw', 'w_paw', 'w_sword')),
  T('class_lines', 'start', cats('w_paw', 'w_sword', 'w_viking', 'w_samurai')),
  T('acts', 'start', ico('swords'), { control: 'preview' }),
  T('lose_gauge', 'start', ico('skull'), { control: 'gauge' }),
  T('lose_boss', 'start', ico('clock')),
  T('continue', 'start', ico('play')),
  // ── team ──
  T('classes', 'team', cats('w_sword', 'r_archer', 'm_fire', 't_chef'), { control: 'chips' }),
  T('synergy', 'team', cats('w_paw', 'w_sword', 'w_viking'), { control: 'chips' }),
  T('class_sheet', 'team', ico('class_mage'), { control: 'chips' }),
  T('class_upgrade', 'team', ico('arrow_up'), { control: 'chips' }),
  T('pick3', 'team', cats('r_archer', 'w_viking', 'm_storm')),
  T('purr', 'team', ico('purr'), { control: 'purr' }),
  T('molt', 'team', ico('molt')),
  T('awaken', 'team', cats('w_samurai', 'w_tiger')),
  T('sell', 'team', ico('sell')),
  T('move_swap', 'team', cats('w_paw', 'r_sling')),
  // ── field ──
  T('sun', 'field', { k: 'cell', cell: 'sun', cat: 'w_paw' }),
  T('hazards', 'field', { k: 'cell', cell: 'wet', cat: 'r_sling' }),
  T('laser', 'field', ico('target'), { control: 'laser' }),
  T('call_wave', 'field', ico('wave_call'), { control: 'call' }),
  T('speed', 'field', ico('speed_2'), { control: 'speed' }),
  T('preview', 'field', foe('cucumber'), { control: 'preview' }),
  T('toys', 'field', { k: 'toy', id: 'yarn_ball' }, { control: 'toys' }),
  T('toy_reroll', 'field', ico('reroll')),
  T('stakes', 'field', ico('crown'), { tab: 'battle', point: 'battle.stakes' }),
  // ── foes ──
  T('elite', 'foes', foe('boss_cucumber')),
  T('boss', 'foes', foe('boss_vacuum')),
  T('boss_vacuum', 'foes', foe('boss_vacuum')),
  T('boss_blender', 'foes', foe('boss_blender')),
  T('boss_bath', 'foes', foe('boss_bath')),
  T('boss_cloud', 'foes', foe('boss_cloud')),
  T('boss_needle', 'foes', foe('boss_needle')),
  T('trait_armored', 'foes', foe('roomba')),
  T('trait_warded', 'foes', foe('tangerine')),
  T('trait_fast', 'foes', foe('drop')),
  T('trait_swarm', 'foes', foe('dust')),
  T('trait_split', 'foes', foe('balloon')),
  T('trait_haste_aura', 'foes', foe('clock')),
  T('trait_heal_aura', 'foes', foe('pill')),
  T('trait_shield', 'foes', foe('cone')),
  T('trait_weaken', 'foes', foe('dryer')),
  // ── home ──
  T('cards', 'home', cats('w_sword', 'r_archer', 'm_fire'), { tab: 'cats', point: 'cats.cards' }),
  T('wild_cards', 'home', ico('cards'), { tab: 'cats', point: 'cats.wild' }),
  T('chests', 'home', { k: 'chest', chest: 'silver' }, { tab: 'shop', point: 'shop.chests' }),
  T('free_chest', 'home', { k: 'chest', chest: 'wood' }, { tab: 'shop', point: 'shop.free' }),
  T('missions', 'home', ico('mission'), { tab: 'missions', point: 'missions.list' }),
  T('daily_chest', 'home', { k: 'chest', chest: 'gold' }, { tab: 'missions', point: 'missions.chest' }),
  T('calendar', 'home', ico('calendar'), { tab: 'battle', point: 'battle.calendar' }),
  T('pass', 'home', ico('trophy'), { tab: 'pass', point: 'pass.head' }),
  T('patrol', 'home', ico('paw'), { tab: 'battle', point: 'battle.patrol' }),
  T('sweep', 'home', ico('sweep'), { tab: 'battle', point: 'battle.sweep' }),
  T('daily_challenge', 'home', ico('star'), { tab: 'battle', point: 'battle.daily' }),
  T('weekly_cup', 'home', ico('trophy'), { tab: 'battle', point: 'battle.cup' }),
  T('endless', 'home', ico('crown'), { tab: 'battle', point: 'battle.endless' }),
  T('backup_code', 'home', ico('code'), { tab: 'settings', point: 'settings.backup' }),
] as const;

export type TopicId = (typeof TOPIC_LIST)[number]['id'];

export const TOPICS: readonly TopicDef[] = TOPIC_LIST;
export const TOPIC_IDS: readonly TopicId[] = TOPIC_LIST.map((t) => t.id);

const BY_ID = new Map<string, TopicDef>(TOPICS.map((t) => [t.id, t]));

export function topicDef(id: TopicId): TopicDef {
  return BY_ID.get(id) as TopicDef;
}

export function isTopicId(id: string): id is TopicId {
  return BY_ID.has(id);
}

export function topicsOf(section: SectionId): TopicDef[] {
  return TOPICS.filter((t) => t.section === section);
}

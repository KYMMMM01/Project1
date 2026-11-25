/**
 * The achievements: 30 one-time goals in 15 groups (a group is a ladder of steps, a single goal is a group of one).
 * Data only; docs/업적_목록_초안.md has the reasoning. Reached is never stored: `achievements.ts` measures the profile.
 * Text: `meta.ach.<key>.name` and `.desc` (registered in strings.ts); `{n}` in a description is the step's `target`.
 */
import { CHAPTER_COUNT } from './economy';
import { DUNGEON_TIERS } from './dungeon';

/** What a step measures on the profile (see `MEASURES` in achievements.ts). */
export type AchievementMetric =
  | 'chapters' | 'butlerBest' | 'butlerFull' | 'wins' | 'merges' | 'endless' | 'daily' | 'dungeon' | 'unitsRaised' | 'unitsMax'
  | 'trainingMax' | 'relics' | 'mythic' | 'awaken' | 'calendar' | 'account';

interface Text {
  ko: string;
  en: string;
}

export interface AchievementDef {
  key: string;
  group: string;
  /** 1-based position in its group; the steps of a group are listed in order. */
  step: number;
  metric: AchievementMetric;
  /** The measured value that reaches it. */
  target: number;
  /** Paid once when the player claims it. */
  gems: number;
  /** Play Games points (docs and tests only: the game never reads it). */
  points: number;
  name: Text;
  desc: Text;
}

/** A cat counts as "raised" from this level (the units group). */
export const UNITS_RAISED_LEVEL = 5;

export const ACHIEVEMENTS = [
  { key: 'chapter_1', group: 'chapter', step: 1, metric: 'chapters', target: 1, gems: 10, points: 10,
    name: { ko: '첫 승리', en: 'First Win' }, desc: { ko: '거실을 처음으로 지켜 냈어요.', en: 'You defended the living room for the first time.' } },
  { key: 'chapter_3', group: 'chapter', step: 2, metric: 'chapters', target: 3, gems: 25, points: 20,
    name: { ko: '집 안 순찰대', en: 'House Patrol' }, desc: { ko: '{n}곳을 지켜 냈어요.', en: 'You defended {n} places.' } },
  { key: 'chapter_5', group: 'chapter', step: 3, metric: 'chapters', target: CHAPTER_COUNT, gems: 50, points: 30,
    name: { ko: '집사의 집', en: "The Butler's House" }, desc: { ko: '{n}곳을 모두 지켜 냈어요.', en: 'You defended all {n} places.' } },

  { key: 'butler_3', group: 'butler', step: 1, metric: 'butlerBest', target: 3, gems: 30, points: 20,
    name: { ko: '깐깐한 집사', en: 'Strict Butler' }, desc: { ko: '집사 난이도 {n}단계를 이겨 냈어요.', en: 'You cleared butler level {n}.' } },
  { key: 'butler_5', group: 'butler', step: 2, metric: 'butlerBest', target: 5, gems: 60, points: 40,
    name: { ko: '까다로운 집사', en: 'Picky Butler' }, desc: { ko: '집사 난이도 {n}단계를 이겨 냈어요.', en: 'You cleared butler level {n}.' } },
  { key: 'butler_all', group: 'butler', step: 3, metric: 'butlerFull', target: CHAPTER_COUNT, gems: 120, points: 80,
    name: { ko: '집사의 집사', en: "Butler's Butler" }, desc: { ko: '모든 챕터에서 가장 어려운 집사 난이도를 이겨 냈어요.', en: 'Top butler level beaten in every chapter.' } },

  { key: 'wins_10', group: 'wins', step: 1, metric: 'wins', target: 10, gems: 15, points: 10,
    name: { ko: '승리의 순간', en: 'Taste of Victory' }, desc: { ko: '판을 {n}번 이겼어요.', en: 'You won {n} battles.' } },
  { key: 'wins_50', group: 'wins', step: 2, metric: 'wins', target: 50, gems: 40, points: 30,
    name: { ko: '단골 수비대', en: 'Regular Defender' }, desc: { ko: '판을 {n}번 이겼어요.', en: 'You won {n} battles.' } },
  { key: 'wins_150', group: 'wins', step: 3, metric: 'wins', target: 150, gems: 80, points: 50,
    name: { ko: '불패의 집사', en: 'Unbeaten Butler' }, desc: { ko: '판을 {n}번 이겼어요.', en: 'You won {n} battles.' } },

  { key: 'merges_500', group: 'merges', step: 1, metric: 'merges', target: 500, gems: 10, points: 10,
    name: { ko: '합치기 입문', en: 'Merge Rookie' }, desc: { ko: '고양이를 {n}번 합쳤어요.', en: 'You merged cats {n} times.' } },
  { key: 'merges_3000', group: 'merges', step: 2, metric: 'merges', target: 3000, gems: 30, points: 25,
    name: { ko: '합치기 달인', en: 'Merge Master' }, desc: { ko: '고양이를 {n}번 합쳤어요.', en: 'You merged cats {n} times.' } },
  { key: 'merges_10000', group: 'merges', step: 3, metric: 'merges', target: 10000, gems: 70, points: 40,
    name: { ko: '합치기 전설', en: 'Merge Legend' }, desc: { ko: '고양이를 {n}번 합쳤어요.', en: 'You merged cats {n} times.' } },

  { key: 'endless_30', group: 'endless', step: 1, metric: 'endless', target: 30, gems: 20, points: 15,
    name: { ko: '끝없는 길', en: 'Endless Road' }, desc: { ko: '무한 모드에서 {n}웨이브를 넘겼어요.', en: 'You passed wave {n} in Endless Mode.' } },
  { key: 'endless_50', group: 'endless', step: 2, metric: 'endless', target: 50, gems: 40, points: 35,
    name: { ko: '끝없는 밤', en: 'Endless Night' }, desc: { ko: '무한 모드에서 {n}웨이브를 넘겼어요.', en: 'You passed wave {n} in Endless Mode.' } },
  { key: 'endless_80', group: 'endless', step: 3, metric: 'endless', target: 80, gems: 60, points: 60,
    name: { ko: '끝이 없는 집사', en: 'Butler Without End' }, desc: { ko: '무한 모드에서 {n}웨이브를 넘겼어요.', en: 'You passed wave {n} in Endless Mode.' } },

  { key: 'daily_1', group: 'daily', step: 1, metric: 'daily', target: 1, gems: 10, points: 5,
    name: { ko: '오늘의 첫 도전', en: 'First Daily' }, desc: { ko: '일일 도전을 처음 이겼어요.', en: 'You won your first daily challenge.' } },
  { key: 'daily_10', group: 'daily', step: 2, metric: 'daily', target: 10, gems: 25, points: 20,
    name: { ko: '일일 단골', en: 'Daily Regular' }, desc: { ko: '일일 도전을 {n}일 이겼어요.', en: 'You won the daily challenge on {n} days.' } },
  { key: 'daily_30', group: 'daily', step: 3, metric: 'daily', target: 30, gems: 50, points: 35,
    name: { ko: '한 달 개근', en: 'Perfect Month' }, desc: { ko: '일일 도전을 {n}일 이겼어요.', en: 'You won the daily challenge on {n} days.' } },

  { key: 'dungeon_1', group: 'dungeon', step: 1, metric: 'dungeon', target: 1, gems: 10, points: 10,
    name: { ko: '금화 수집가', en: 'Coin Hunter' }, desc: { ko: '골드 던전에서 보물상자를 처음 열었어요.', en: 'Your first coin chest in the Gold Dungeon.' } },
  { key: 'dungeon_5', group: 'dungeon', step: 2, metric: 'dungeon', target: DUNGEON_TIERS, gems: 40, points: 30,
    name: { ko: '금화 대부호', en: 'Coin Tycoon' }, desc: { ko: '골드 던전 {n}단계 모두에서 보물상자를 열었어요.', en: 'You opened the coin chest on all {n} Gold Dungeon tiers.' } },

  { key: 'units_4', group: 'units', step: 1, metric: 'unitsRaised', target: 4, gems: 15, points: 15,
    name: { ko: '무럭무럭 크는 고양이', en: 'Growing Cats' }, desc: { ko: '고양이 {n}마리를 5레벨로 키웠어요.', en: 'You raised {n} cats to level 5.' } },
  { key: 'units_16', group: 'units', step: 2, metric: 'unitsRaised', target: 16, gems: 60, points: 45,
    name: { ko: '전원 5레벨', en: 'Everyone at Level 5' }, desc: { ko: '고양이 {n}마리를 모두 5레벨로 키웠어요.', en: 'You raised all {n} cats to level 5.' } },
  { key: 'unit_max', group: 'unit_max', step: 1, metric: 'unitsMax', target: 1, gems: 60, points: 40,
    name: { ko: '첫 최고 레벨', en: 'First Max Level' }, desc: { ko: '고양이 한 마리를 10레벨까지 키웠어요.', en: 'You raised a cat to level 10.' } },
  { key: 'training_10', group: 'training_10', step: 1, metric: 'trainingMax', target: 1, gems: 30, points: 20,
    name: { ko: '훈련소 졸업생', en: 'Training Graduate' }, desc: { ko: '훈련소 항목 하나를 10단계까지 올렸어요.', en: 'You trained one skill to level 10.' } },
  { key: 'relics_20', group: 'relics', step: 1, metric: 'relics', target: 20, gems: 15, points: 15,
    name: { ko: '장난감 수집가', en: 'Toy Collector' }, desc: { ko: '서로 다른 장난감 {n}종을 모았어요.', en: 'You collected {n} different toys.' } },
  { key: 'relics_25', group: 'relics', step: 2, metric: 'relics', target: 25, gems: 50, points: 45,
    name: { ko: '장난감 박물관', en: 'Toy Museum' }, desc: { ko: '서로 다른 장난감 {n}종을 모았어요.', en: 'You collected {n} different toys.' } },

  { key: 'mythic_1', group: 'mythic_1', step: 1, metric: 'mythic', target: 1, gems: 10, points: 10,
    name: { ko: '수호신 강림', en: 'Guardian Descends' }, desc: { ko: '판 안에서 수호신 등급을 처음 만들었어요.', en: 'You made a Guardian cat in a run for the first time.' } },
  { key: 'awaken_50', group: 'awaken_50', step: 1, metric: 'awaken', target: 50, gems: 30, points: 25,
    name: { ko: '각성 마스터', en: 'Awakening Master' }, desc: { ko: '판 안에서 각성을 {n}번 해냈어요.', en: 'You awakened cats {n} times in runs.' } },
  { key: 'calendar_28', group: 'calendar_28', step: 1, metric: 'calendar', target: 28, gems: 20, points: 15,
    name: { ko: '한 달 출석', en: 'A Month of Visits' }, desc: { ko: '출석 달력을 {n}칸 채웠어요.', en: 'You filled {n} boxes of the attendance calendar.' } },
  { key: 'account_20', group: 'account_20', step: 1, metric: 'account', target: 20, gems: 30, points: 20,
    name: { ko: '베테랑 집사', en: 'Veteran Butler' }, desc: { ko: '계정 레벨 {n}에 닿았어요.', en: 'You reached account level {n}.' } },
] as const satisfies readonly AchievementDef[];

export type AchievementKey = (typeof ACHIEVEMENTS)[number]['key'];
export type AchievementGroup = (typeof ACHIEVEMENTS)[number]['group'];

/**
 * The sound board's content, as plain data (no DOM, no audio): which sounds there are, where they are heard, what to call them, and how a row
 * plays. A row is one thing to tap. Almost every row is exactly one SFX id; a few are a pair (a cat's release then its landing) or a skill's
 * whole sequence of the sounds its scene plays today. Every id in `SFX_IDS` has a row of its own (a test holds that), so a new id cannot be
 * added to the game without the owner being able to hear it here.
 *
 * Text is Korean on purpose: the page is the owner's tool. `ko` is what the sound is called, `when` says in plain words when the game plays it.
 */
import type { SfxId, StingerId, MusicId } from '@/audio/api';
import { attackSfx, critSfx, foeDieSfx, foeHitSfx, impactSfx } from '@/audio/combat';
import type { UnitId } from '@/game/api';

/** One sound of a row, to be started `at` seconds after the tap. Exactly one of `sfx`, `stinger`, `file` says which. */
export interface Cue {
  /** One of the game's own sounds (played through the game's audio engine, exactly like the game does). */
  sfx?: SfxId;
  stinger?: StingerId;
  /** A candidate sample of the CC0 packs, as `pack/name` (the manifest's key, no extension). */
  file?: string;
  at?: number;
  volume?: number;
  /** Playback-rate / frequency multiplier. */
  pitch?: number;
  /** Climb this many steps of the pentatonic ladder (`playStep`), as a combo does. */
  step?: number;
}

export type SectionId = 'ui' | 'board' | 'warrior' | 'ranger' | 'mage' | 'trickster' | 'battle' | 'foes' | 'bosses' | 'skills' | 'skillsingle' | 'flow' | 'rewards';

/**
 * How close together the director lets two sounds of one kind start, in real seconds: the `SoundRule` gaps of `createRules()` in
 * `src/view/director/stage.ts` (a test reads them from there). The busiest a 3x board gets is one sound per gap, so "x5 at 3x" plays five
 * in a row at exactly that spacing.
 */
export type Gap = 'ui' | 'shoot' | 'hit' | 'heavyHit' | 'crit' | 'die' | 'eliteDie' | 'coinTick' | 'status' | 'strike' | 'zone' | 'weaken' | 'summon' | 'merge' | 'big' | 'heal' | 'skill' | 'skillTick';

export const GAP_SECONDS: Record<Gap, number> = {
  shoot: 0.1,
  hit: 0.06,
  heavyHit: 0.14,
  crit: 0.15,
  die: 0.05,
  eliteDie: 0.2,
  coinTick: 0.04,
  status: 0.12,
  heal: 0.6,
  strike: 0.12,
  zone: 0.15,
  weaken: 0.5,
  summon: 0.05,
  merge: 0.06,
  ui: 0.08,
  big: 0.25,
  // The skills' own rules: the signature of a cast is never thinned (0), what goes on while a skill runs is six starts in any 0.12 s.
  skill: 0,
  skillTick: 0.025,
};

export interface Row {
  /** Unique: the SFX id for a single-sound row, `pair:<cat>` for a cat's two halves, `skill:<name>` for a skill. */
  key: string;
  section: SectionId;
  ko: string;
  when: string;
  /** Set on a row that is exactly one SFX id (the coverage test counts these). */
  id?: SfxId;
  gap: Gap;
  /** The sounds the game plays today, in time order. */
  now: Cue[];
  /** A run of these (kills, coins, combos) climbs the ladder: "x5" plays steps 0 to 4. */
  ladder?: boolean;
}

export interface Section {
  id: SectionId;
  ko: string;
  hint: string;
  rows: Row[];
}

// ───────────────────────────── helpers ─────────────────────────────

function one(id: SfxId, section: SectionId, ko: string, when: string, gap: Gap, extra: { volume?: number; pitch?: number; ladder?: boolean } = {}): Row {
  const cue: Cue = { sfx: id };
  if (extra.volume !== undefined) cue.volume = extra.volume;
  if (extra.pitch !== undefined) cue.pitch = extra.pitch;
  const row: Row = { key: id, section, ko, when, id, gap, now: [cue] };
  if (extra.ladder) row.ladder = true;
  return row;
}

/** A combat cue exactly as the director plays it (`attackSfx` and friends carry the level and pitch). */
function cueOf(c: { id: SfxId; volume: number; pitch: number }, at = 0): Cue {
  return { sfx: c.id, volume: c.volume, pitch: c.pitch, at };
}

// ───────────────────────────── the cats ─────────────────────────────

interface CatLine {
  unit: UnitId;
  name: string;
  atk: string;
  imp: string;
}

/** Seconds from a weapon leaving a cat to it landing, as the other sound demo (`?demo=audio`) plays a pair. */
const FLIGHT = 0.12;

const CAT_LINES: Record<'warrior' | 'ranger' | 'mage' | 'trickster', CatLine[]> = {
  warrior: [
    { unit: 'w_paw', name: '솜방망이', atk: '냥펀치가 나갈 때. 가볍게 휙 하는 잽.', imp: '글러브가 쿠션에 닿는 퍽 소리. 가죽이 짝 하고 맞는 소리를 더했어요.' },
    { unit: 'w_sword', name: '검사냥', atk: '나무칼을 휘두를 때. 속이 빈 휙 소리와 딱.', imp: '나무와 나무가 부딪치는 딱 소리. 진짜 나무 소리를 밑에 깔았어요. 쓴 파일: impactWood_light_002.' },
    { unit: 'w_viking', name: '바이킹냥', atk: '도끼를 크게 휘두를 때. 느리고 넓은 휙.', imp: '도끼날이 나무에 퍽 박히는 소리. 진짜 도끼 소리에 묵직한 쿵을 더했어요. 쓴 파일: chop.' },
    { unit: 'w_samurai', name: '사무라이냥', atk: '칼이 지나갈 때. 가늘고 빠른 싱.', imp: '깨끗하게 베는 짧은 싹. 칼날이 짧게 울려요(긴 "챙"은 스킬 몫이에요). 쓴 파일: impactMetal_medium_004.' },
    { unit: 'w_tiger', name: '호랑이 장군', atk: '긴 창을 휘두를 때. 게임에서 제일 넓은 휘이익.', imp: '긴 창이 퍽 때리는 소리. 나무 창대와 묵직한 쿵. 쓴 파일: impactWood_medium_000.' },
  ],
  ranger: [
    { unit: 'r_sling', name: '새총냥', atk: '고무줄이 튕기고 돌이 쉭 날아가요.', imp: '작은 돌이 상자에 딱. 맞는 끝이 또렷해졌어요.' },
    { unit: 'r_archer', name: '궁수냥', atk: '활시위가 팅 하고 화살이 휘익.', imp: '화살이 나무판에 퍽 꽂혀 파르르 떨어요. 쓴 파일: impactWood_light_000.' },
    { unit: 'r_ninja', name: '닌자냥', atk: '수리검이 쌩 날아가는 소리.', imp: '쇠 수리검이 양철에 땡 맞고 한 번 더 튕겨요. 쓴 파일: impactMetal_medium_000.' },
    { unit: 'r_gunner', name: '총잡이냥', atk: '코르크 총이 뻥. 짧고 둔한 팝.', imp: '코르크가 양철판에 탁. 쓴 파일: impactTin_medium_003.' },
    { unit: 'r_star', name: '별빛 사수', atk: '달빛 활. 맑은 종소리 같은 시위.', imp: '별이 반짝 올라가는 짧은 핑 한 번. 화살이 적 여럿을 뚫어도 앞의 셋만 들려요.' },
  ],
  mage: [
    { unit: 'm_snow', name: '눈덩이냥', atk: '눈뭉치를 놓는 부드러운 휘.', imp: '눈이 퍽 터지고 사각 부서져요.' },
    { unit: 'm_fire', name: '불꽃냥', atk: '성냥 긋는 소리와 불꽃이 확.', imp: '불이 붙는 퍽. 불씨가 탁탁.' },
    { unit: 'm_storm', name: '번개냥', atk: '지지직. 종이 찢는 듯한 번개.', imp: '번개가 쾅 내리치고 찌릿 사라져요.' },
    { unit: 'm_frost', name: '얼음 여왕', atk: '얼음 결정이 짤랑 하고 올라가요.', imp: '얼음이 와장창 부서져요.' },
    { unit: 'm_cosmo', name: '우주냥', atk: '우웅 하고 빨려 드는 소리(쿵을 거꾸로 튼 것).', imp: '블랙홀이 쿵 하고 떨어져요.' },
  ],
  trickster: [
    { unit: 't_bell', name: '방울냥', atk: '딸랑 한 번.', imp: '작은 방울이 띵.' },
    { unit: 't_chef', name: '요리사냥', atk: '프라이팬을 휙 던져요.', imp: '프라이팬이 땡그랑. 쓴 파일: metalPot2.' },
    { unit: 't_bard', name: '악사냥', atk: '류트 줄을 쓸어 내리는 네 음.', imp: '류트 한 음이 띵.' },
    { unit: 't_alch', name: '연금술사냥', atk: '유리병이 짤랑, 거품, 코르크가 뽁.', imp: '병이 터지며 부글부글 튀어요.' },
    { unit: 't_lucky', name: '복고양이', atk: '엄지로 동전을 핑 튕겨요.', imp: '동전이 짤랑 네 번.' },
  ],
};

const CLASS_TITLE: Record<'warrior' | 'ranger' | 'mage' | 'trickster', { ko: string; hint: string }> = {
  warrior: { ko: '전사 고양이', hint: '나감은 공격이 고양이를 떠날 때, 맞음은 적에게 닿을 때예요. 한 번에 듣는 줄이 맨 위에 있어요.' },
  ranger: { ko: '사수 고양이', hint: '나감은 공격이 고양이를 떠날 때, 맞음은 적에게 닿을 때예요.' },
  mage: { ko: '마법사 고양이', hint: '나감은 공격이 고양이를 떠날 때, 맞음은 적에게 닿을 때예요.' },
  trickster: { ko: '재주 고양이', hint: '나감은 공격이 고양이를 떠날 때, 맞음은 적에게 닿을 때예요.' },
};

function catRows(cls: 'warrior' | 'ranger' | 'mage' | 'trickster'): Row[] {
  const rows: Row[] = [];
  for (const c of CAT_LINES[cls]) {
    const atk = attackSfx(c.unit);
    const imp = impactSfx(c.unit);
    // What the game plays for one shot at a cucumber: the weapon leaves, then lands together with the cucumber's answer.
    const answer = foeHitSfx('cucumber');
    rows.push({
      key: `pair:${c.unit}`,
      section: cls,
      ko: `${c.name} · 한 번 쏠 때`,
      when: '나감, 0.12초 뒤 맞음과 오이가 맞는 소리. 전투에서 한 발이 들리는 그대로예요.',
      gap: 'hit',
      now: [cueOf(atk), cueOf(imp, FLIGHT), cueOf(answer, FLIGHT)],
    });
    rows.push({ key: atk.id, section: cls, ko: `${c.name} · 나감`, when: c.atk, id: atk.id, gap: 'shoot', now: [cueOf(atk)] });
    rows.push({ key: imp.id, section: cls, ko: `${c.name} · 맞음`, when: c.imp, id: imp.id, gap: 'hit', now: [cueOf(imp)] });
  }
  return rows;
}

// ───────────────────────────── skills ─────────────────────────────

/**
 * What each skill's scene played BEFORE the skills got sounds of their own (they borrowed a heavy hit, a whoosh, a shield break), in order, as read
 * from `src/view/director/sp/*.ts` then; the times are the scene's, rounded. This is the "지금" of the before / after: the new sequence, which the game
 * plays now, is under the same key in `next.ts` ("새것"), and every sound of it is also a row of its own in the section "스킬 소리 낱개".
 */
function skillRow(name: string, ko: string, when: string, now: Cue[]): Row {
  return { key: `skill:${name}`, section: 'skills', ko, when, gap: 'big', now };
}

/** One of the skills' own sounds, by itself: `big` spaces the "x5" like two casts (a quarter second), `skillTick` like the small sounds of a run. */
function sk(id: SfxId, ko: string, when: string, gap: 'big' | 'skillTick', extra: { volume?: number; pitch?: number; ladder?: boolean } = {}): Row {
  return one(id, 'skillsingle', ko, when, gap, extra);
}

const SKILL_SINGLES: Row[] = [
  sk('sp_cutin', '스킬 컷인 팡파르', '수호신 스킬을 처음 쓸 때 이름 배너와 함께. 어웨이큰(1.2초)보다 짧은 반 초짜리 팡파르예요.', 'big', { volume: 0.9 }),
  sk('sp_shield_slam', '바이킹냥 · 방패 쾅', '방패를 내리칠 때. 쇠테 두른 나무가 길에 쿵 떨어져요. 쓴 파일: impactWood_heavy_000, impactMetal_heavy_001.', 'big'),
  sk('sp_dust_wedge', '바이킹냥 · 먼지 쐐기', '방패가 닿고 먼지가 길을 따라 퍼질 때. 아주 부드러워요.', 'skillTick', { volume: 0.8 }),
  sk('sp_dash', '사무라이냥 · 잔상 질주', '하얀 잔상이 길을 가를 때. 점점 높아지는 슝. 쓴 파일: knifeSlice.', 'big', { volume: 0.9 }),
  sk('sp_sheath', '사무라이냥 · 칼집 딸깍', '칼이 칼집에 들어가는 딸깍. 바로 뒤에 "챙"이 이어져요. 쓴 파일: metalLatch.', 'big', { volume: 0.9 }),
  sk('sp_cut_clash', '사무라이냥 · 챙!', '모든 선이 한꺼번에 벌어질 때. 칼날 둘이 부딪치는 소리예요. 누를 때마다 케니 파일이 바뀌어요(세 가지). 쓴 파일: impactMetal_light_000, 001, 004 (그리고 003이 000 밑에).', 'big', { volume: 1.2 }),
  sk('sp_tiger_roar', '호랑이 장군 · 포효', '호랑이가 뛰어오를 때. 합성으로 만든 만화 같은 포효예요(진짜 호랑이 소리는 아니에요).', 'big'),
  sk('sp_tiger_land', '호랑이 장군 · 착지', '호랑이가 1.5배로 커져서 길에 내려앉을 때.', 'big', { volume: 0.9 }),
  sk('sp_stomp', '호랑이 장군 · 발굽 쿵', '달리면서 적마다 쿵. 초당 여러 번 나요.', 'skillTick', { volume: 0.85 }),
  sk('sp_tiger_roar_end', '호랑이 장군 · 끝 포효', '달리기를 마치고 멈춰 서서 한 번 더 으르렁.', 'big', { volume: 0.9 }),
  sk('sp_smoke_pop', '닌자냥 · 연기 퐁', '"펑!" 하고 분신이 나올 때. 둥근 퐁에 연기와 방울 소리.', 'big'),
  sk('sp_clone_hop', '닌자냥 · 분신 폴짝', '분신이 칸에 내려설 때. 가볍고 옅게.', 'skillTick', { volume: 0.7 }),
  sk('sp_clone_throw', '닌자냥 · 분신 수리검', '분신이 수리검을 따라 던질 때. 공기뿐인 흐릿한 휙.', 'skillTick', { volume: 0.8 }),
  sk('sp_clone_vanish', '닌자냥 · 분신 사라짐', '분신이 네 번째를 던지고 퐁 사라질 때.', 'skillTick', { volume: 0.9 }),
  sk('sp_poster_slap', '총잡이냥 · 전단 탁', '수배 전단이 보스에게 탁 붙을 때. 쓴 파일: bookClose.', 'big'),
  sk('sp_cork_pop', '총잡이냥 · 코르크 퐁', '코르크 총알이 나갈 때. 병마개 뽑는 퐁.', 'big', { volume: 0.9 }),
  sk('sp_poster_hole', '총잡이냥 · 전단 구멍', '코르크가 전단 한가운데를 뚫을 때. 양철판이 탱 하고 종이가 찢어져요. 쓴 파일: impactTin_medium_003.', 'big'),
  sk('sp_seal_stamp', '총잡이냥 · 사건 종결 도장', '전단이 닫히며 도장이 쿵 찍힐 때.', 'big', { volume: 0.9 }),
  sk('sp_night_hush', '별빛 사수 · 밤이 내림', '밤이 내려앉을 때. 부드러운 숨소리에 별 하나가 반짝.', 'skillTick', { volume: 0.9 }),
  sk('sp_arrow_whoosh', '별빛 사수 · 화살 휙', '은빛 화살이 길을 달릴 때. 게임에서는 화살 위치를 따라 왼쪽과 오른쪽으로 옮겨 다녀요.', 'skillTick', { volume: 0.85 }),
  sk('sp_star_ping', '별빛 사수 · 별 띵', '별이 적에게 터질 때마다. 짧은 방울 소리가 음계를 따라 올라가요.', 'skillTick', { volume: 0.8, ladder: true }),
  sk('sp_cloud_pop', '번개냥 · 먹구름 퐁', '심통 난 구름이 모자에서 튀어나올 때.', 'big', { volume: 0.95 }),
  sk('sp_thunder_tick', '번개냥 · 작은 천둥', '번개가 떨어질 때마다(여덟 번). 번개마다 조금씩 높아져요.', 'skillTick', { volume: 0.9, ladder: true }),
  sk('sp_cloud_hop', '번개냥 · 구름 폴짝', '숙주가 쓰러져 구름이 다음 적에게 뛸 때.', 'skillTick', { volume: 0.8 }),
  sk('sp_cloud_sigh', '번개냥 · 구름 한숨', '구름이 다 되어 후 하고 사라질 때. 빗방울 몇 개.', 'big', { volume: 0.9 }),
  sk('sp_glass_tap', '얼음 여왕 · 유리잔 톡', '여왕이 앞발로 유리잔을 톡 칠 때. 쓴 파일: impactGlass_light_001.', 'big', { volume: 0.9 }),
  sk('sp_glass_shatter', '얼음 여왕 · 와장창', '유리잔이 길에서 깨질 때. 케니 유리 소리에 합성 반짝임을 얹었어요. 쓴 파일: impactGlass_heavy_003, impactGlass_medium_004.', 'big'),
  sk('sp_shard_hit', '얼음 여왕 · 파편 박힘', '깨진 파편이 적에게 박힐 때마다. 다섯 가지가 돌아가며 나요. 쓴 파일: impactGlass_light_000 ~ 004.', 'skillTick'),
  sk('sp_meteor_warn', '우주냥 · 운석 경고', '하늘이 어두워지고 붉은 원이 자랄 때. 낮은 웅웅이 점점 올라가요.', 'skillTick', { volume: 0.85 }),
  sk('sp_meteor_whistle', '우주냥 · 운석 휘파람', '불타는 운석이 떨어져 올 때. 높은 휘이익이 아래로 떨어져요.', 'big', { volume: 0.8 }),
  sk('sp_meteor_boom', '우주냥 · 운석 쿵', '운석이 땅에 닿을 때. 가장 큰 소리예요. 쓴 파일: impactMetal_heavy_000.', 'big'),
  sk('sp_meteor_ring', '우주냥 · 바깥 고리', '0.25초 뒤 바깥 고리가 번질 때. 낮고 부드러운 후웅.', 'big', { volume: 0.8 }),
  sk('sp_strum', '악사냥 · 류트 쓸기', '류트를 위에서 아래로 쓸어내릴 때. 네 줄 G 화음.', 'big', { volume: 0.95 }),
  sk('sp_note', '악사냥 · 금빛 음표', '음표가 다른 고양이에게 닿을 때마다. 음계를 따라 올라가요.', 'skillTick', { volume: 0.8, ladder: true }),
  sk('sp_flask_toss', '연금술사냥 · 플라스크 던지기', '플라스크들이 앞발을 떠날 때. 유리 부딪침과 휙.', 'big', { volume: 0.9 }),
  sk('sp_flask_pop', '연금술사냥 · 큰 플라스크 퐁', '큰 플라스크가 보스에 깨질 때. 유리 팍 하고 분홍 연기 퐁. 쓴 파일: impactGlass_light_002.', 'big'),
  sk('sp_fish_boing', '연금술사냥 · 생선 뽀잉', '보스가 생선으로 변해 튀어나올 때.', 'big', { volume: 0.9 }),
  sk('sp_flask_mini', '연금술사냥 · 작은 플라스크', '작은 플라스크가 약한 적을 바꿀 때마다. 네 개가 차례로.', 'skillTick', { volume: 0.9, ladder: true }),
  sk('sp_fish_back', '연금술사냥 · 생선이 돌아옴', '생선이 보스로 돌아오며 부르르 털 때.', 'big', { volume: 0.9 }),
  sk('sp_capsule_fall', '복고양이 · 캡슐 떨어짐', '캡슐이 하늘에서 떨어질 때. 점점 낮아지는 휘파람.', 'skillTick', { volume: 0.85 }),
  sk('sp_capsule_bounce', '복고양이 · 캡슐 통통', '캡슐이 보드에서 두 번 튈 때. 플라스틱 톡. 세 가지가 돌아가며 나요. 쓴 파일: impactGeneric_light_000, 002, 004.', 'skillTick', { volume: 0.9 }),
  sk('sp_capsule_rattle', '복고양이 · 캡슐 달그락', '열리기 전에 캡슐 안에서 상품이 달그락거릴 때. 쓴 파일: handleCoins2.', 'skillTick', { volume: 0.8 }),
  sk('sp_capsule_pop', '복고양이 · 캡슐 딸깍 퐁', '캡슐이 딸깍 하고 뚜껑이 퐁 열릴 때. 쓴 파일: metalLatch.', 'big', { volume: 0.9 }),
  sk('sp_prize_fish', '복고양이 · 상품: 생선', '생선 캡슐이 나올 때. 뽀잉과 방울.', 'big', { volume: 0.9 }),
  sk('sp_prize_partner', '복고양이 · 상품: 짝꿍', '짝꿍 캡슐이 나올 때. 종 두 개가 차례로 울려요.', 'big', { volume: 0.9 }),
  sk('sp_prize_more', '복고양이 · 상품: 한 번 더', '한 번 더 캡슐이 나올 때. 비-뽕 하고 작은 캡슐이 굴러요.', 'big', { volume: 0.9 }),
  sk('sp_prize_toy', '복고양이 · 상품: 장난감 상자', '장난감 상자 캡슐이 나올 때. 뚜껑이 퐁, 네 음이 올라가고 반짝이가 뿌려져요.', 'big'),
  sk('sp_prize_guardian', '복고양이 · 상품: 수호신', '수호신 캡슐이 나올 때. 따뜻한 화음이 부풀고 별이 떨어져요.', 'big', { volume: 1.05 }),
];

const SKILL_ROWS: Row[] = [
  skillRow('shove', '바이킹냥 · 방패 밀치기', '방패를 쾅 내리치면 줄 선 적들이 뒤로 밀려요. 옛 소리는 묵직한 타격과 휙 소리였고, 새것은 방패가 쾅 떨어지는 소리예요.', [
    { sfx: 'hit_heavy', volume: 0.8, pitch: 0.8, at: 0 },
    { sfx: 'whoosh', volume: 0.35, pitch: 0.8, at: 0.06 },
  ]),
  skillRow('cut', '사무라이냥 · 이미 베었다냥', '칼이 지나가고 1.2초 뒤 칼집이 딸깍 하면 모든 선이 한꺼번에 벌어져요.', [
    { sfx: 'atk_w_samurai', volume: 0.7, pitch: 1.05, at: 0 },
    { sfx: 'imp_w_samurai', volume: 0.75, pitch: 1.2, at: 1.2 },
  ]),
  skillRow('charge', '호랑이 장군 · 진짜 호랑이 납신다!', '커진 호랑이가 길을 거슬러 달리며 적을 쓸어요. 옛 소리는 창 소리와 쿵쿵 발소리였고, 새것은 포효로 시작해요(첫 시전의 컷인 팡파르 포함).', [
    { sfx: 'awaken', volume: 0.55, at: 0 },
    { sfx: 'atk_w_tiger', volume: 0.7, pitch: 0.9, at: 0 },
    { sfx: 'imp_w_tiger', volume: 0.9, pitch: 0.95, at: 0.3 },
    { sfx: 'imp_w_tiger', volume: 0.5, pitch: 1.15, at: 0.55 },
    { sfx: 'imp_w_tiger', volume: 0.5, pitch: 1.15, at: 0.8 },
    { sfx: 'imp_w_tiger', volume: 0.5, pitch: 1.15, at: 1.05 },
  ]),
  skillRow('clones', '닌자냥 · 깜짝 분신술', '펑 하고 분신 둘이 나와 수리검을 네 번 따라 던지고 퐁 사라져요.', [
    { sfx: 'molt', volume: 0.4, pitch: 1.3, at: 0 },
    { sfx: 'atk_r_ninja', volume: 0.3, pitch: 1.3, at: 0.7 },
    { sfx: 'atk_r_ninja', volume: 0.3, pitch: 1.3, at: 1.5 },
    { sfx: 'atk_r_ninja', volume: 0.3, pitch: 1.3, at: 2.3 },
    { sfx: 'atk_r_ninja', volume: 0.3, pitch: 1.3, at: 3.1 },
    { sfx: 'whoosh', volume: 0.22, pitch: 2.1, at: 3.3 },
  ]),
  skillRow('wanted', '총잡이냥 · 현상수배! 한 방!', '보스에게 수배 전단이 탁 붙고 코르크 총알이 퐁 뚫어요.', [
    { sfx: 'whoosh', volume: 0.4, pitch: 1.4, at: 0 },
    { sfx: 'atk_r_gunner', volume: 0.8, pitch: 1.05, at: 0.3 },
    { sfx: 'imp_r_gunner', volume: 0.9, pitch: 0.95, at: 0.55 },
    { sfx: 'hit_heavy', volume: 0.55, pitch: 0.7, at: 0.58 },
  ]),
  skillRow('lap', '별빛 사수 · 별빛 한 바퀴', '은빛 화살이 길을 한 바퀴 돌며 적마다 별이 번쩍 터져요. 별마다 음이 올라가요(첫 시전의 컷인 팡파르 포함).', [
    { sfx: 'awaken', volume: 0.55, at: 0 },
    { sfx: 'atk_r_star', volume: 0.8, at: 0 },
    { sfx: 'imp_r_star', volume: 0.45, step: 0, at: 0.2 },
    { sfx: 'imp_r_star', volume: 0.45, step: 1, at: 0.38 },
    { sfx: 'imp_r_star', volume: 0.45, step: 2, at: 0.56 },
    { sfx: 'imp_r_star', volume: 0.45, step: 3, at: 0.74 },
    { sfx: 'imp_r_star', volume: 0.45, step: 4, at: 0.92 },
  ]),
  skillRow('cloud', '번개냥 · 졸졸 먹구름', '심통 난 구름이 튀어나와 선두 적을 따라다니며 번개를 떨어뜨려요.', [
    { sfx: 'shoot_magic', volume: 0.42, pitch: 1.7, at: 0 },
    { sfx: 'zap', volume: 0.36, pitch: 0.95, at: 0.45 },
    { sfx: 'zap', volume: 0.36, pitch: 1.0, at: 0.85 },
    { sfx: 'zap', volume: 0.36, pitch: 1.05, at: 1.25 },
    { sfx: 'whoosh', volume: 0.3, pitch: 1.8, at: 1.5 },
    { sfx: 'zap', volume: 0.36, pitch: 1.1, at: 1.9 },
    { sfx: 'zap', volume: 0.36, pitch: 1.15, at: 2.3 },
    { sfx: 'whoosh', volume: 0.3, pitch: 0.75, at: 3.2 },
  ]),
  skillRow('knock', '얼음 여왕 · 톡, 와장창!', '유리잔을 톡 떨어뜨리면 깨진 조각이 얼어붙은 적에게 날아가 박혀요.', [
    { sfx: 'place', volume: 0.45, pitch: 1.7, at: 0 },
    { sfx: 'shield_break', volume: 0.7, pitch: 0.9, at: 0.7 },
    { sfx: 'shield_break', volume: 0.34, pitch: 1.35, at: 0.85 },
    { sfx: 'imp_m_frost', volume: 0.42, pitch: 1.3, at: 0.95 },
    { sfx: 'imp_m_frost', volume: 0.42, pitch: 1.3, at: 1.07 },
  ]),
  skillRow('meteor', '우주냥 · 운석 쿵!', '붉은 원이 자라난 뒤 불타는 운석이 쾅 떨어져요. 떨어지기 전에 휘파람 같은 소리가 나요(첫 시전의 컷인 팡파르 포함).', [
    { sfx: 'awaken', volume: 0.55, at: 0 },
    { sfx: 'atk_m_cosmo', volume: 0.7, pitch: 0.95, at: 0 },
    { sfx: 'whoosh', volume: 0.34, pitch: 0.55, at: 0.25 },
    { sfx: 'explosion', volume: 0.85, pitch: 0.9, at: 1.0 },
    { sfx: 'imp_m_cosmo', volume: 0.55, pitch: 0.9, at: 1.25 },
  ]),
  skillRow('jam', '악사냥 · 다 같이 합주!', '류트를 쓸면 금빛 음표 넷이 날아가 다른 고양이들에게 닿아요. 닿을 때마다 띵.', [
    { sfx: 'atk_t_bard', volume: 0.9, pitch: 0.78, at: 0 },
    { sfx: 'atk_t_bard', volume: 0.42, pitch: 1.56, at: 0.05 },
    { sfx: 'imp_t_bard', volume: 0.5, step: 0, at: 0.5 },
    { sfx: 'imp_t_bard', volume: 0.5, step: 1, at: 0.62 },
    { sfx: 'imp_t_bard', volume: 0.5, step: 2, at: 0.74 },
    { sfx: 'imp_t_bard', volume: 0.5, step: 3, at: 0.86 },
  ]),
  skillRow('fish', '연금술사냥 · 생선으로 변해라!', '큰 플라스크가 보스에 깨지면 퐁 하고 생선으로 변하고, 작은 플라스크 넷이 약한 적들을 바꿔요.', [
    { sfx: 'atk_t_alch', volume: 0.7, pitch: 0.8, at: 0 },
    { sfx: 'whoosh', volume: 0.3, pitch: 1.3, at: 0 },
    { sfx: 'foe_glass_hit', volume: 0.7, pitch: 0.8, at: 0.7 },
    { sfx: 'molt', volume: 0.7, pitch: 0.72, at: 0.7 },
    { sfx: 'foe_glass_hit', volume: 0.34, pitch: 1.25, at: 0.95 },
    { sfx: 'molt', volume: 0.32, pitch: 1.4, at: 0.95 },
    { sfx: 'foe_glass_hit', volume: 0.34, pitch: 1.25, at: 1.1 },
    { sfx: 'molt', volume: 0.32, pitch: 1.4, at: 1.1 },
  ]),
  skillRow('capsule', '복고양이 · 복 뽑기 한 판!', '캡슐이 휘파람 소리와 함께 떨어져 통통 튀다가 딸깍 열려요. 여기서는 생선 캡슐이에요(첫 시전의 컷인 팡파르 포함).', [
    { sfx: 'awaken', volume: 0.55, at: 0 },
    { sfx: 'whoosh', volume: 0.3, pitch: 1.9, at: 0 },
    { sfx: 'place', volume: 0.42, pitch: 1, at: 0.47 },
    { sfx: 'place', volume: 0.3, pitch: 1.18, at: 0.7 },
    { sfx: 'chest_open', volume: 0.5, pitch: 1.15, at: 1.5 },
  ]),
];

// ───────────────────────────── the sections ─────────────────────────────

function build(): Section[] {
  const ui = (id: SfxId, ko: string, when: string, gap: Gap = 'ui', extra: { volume?: number; pitch?: number; ladder?: boolean } = {}): Row => one(id, 'ui', ko, when, gap, extra);
  const bd = (id: SfxId, ko: string, when: string, gap: Gap = 'ui', extra: { volume?: number; pitch?: number; ladder?: boolean } = {}): Row => one(id, 'board', ko, when, gap, extra);
  const bt = (id: SfxId, ko: string, when: string, gap: Gap, extra: { volume?: number; pitch?: number; ladder?: boolean } = {}): Row => one(id, 'battle', ko, when, gap, extra);
  const fl = (id: SfxId, ko: string, when: string, gap: Gap, extra: { volume?: number; pitch?: number; ladder?: boolean } = {}): Row => one(id, 'flow', ko, when, gap, extra);
  const rw = (id: SfxId, ko: string, when: string, gap: Gap = 'ui', extra: { volume?: number; pitch?: number; ladder?: boolean } = {}): Row => one(id, 'rewards', ko, when, gap, extra);
  // The levels the director plays an enemy's answer at (`combat.ts`), read from there so they cannot drift.
  const hitVolume = foeHitSfx('cucumber').volume;
  const dieVolume = foeDieSfx('cucumber').volume;
  const foe = (id: SfxId, ko: string, when: string, gap: Gap): Row => one(id, 'foes', ko, when, gap, { volume: id.endsWith('_die') ? dieVolume : hitVolume });
  const boss = (id: SfxId, ko: string, when: string, gap: Gap, extra: { volume?: number; pitch?: number } = {}): Row => one(id, 'bosses', ko, when, gap, extra);

  const sections: Section[] = [
    {
      id: 'ui',
      ko: '인터페이스',
      hint: '버튼, 창, 탭에서 나는 소리',
      rows: [
        ui('ui_click', '버튼 누름', '버튼을 누를 때마다 나는 짧은 종이 소리.'),
        ui('ui_back', '뒤로 · 닫기', '뒤로 가기와 닫기 버튼, 고양이 선택을 풀 때.'),
        ui('ui_tab', '탭 넘기기', '아래 탭을 바꿀 때, 챕터를 고를 때, 두 고양이 자리를 바꿀 때. 책장 넘기는 소리.'),
        ui('ui_toggle', '스위치', '설정 스위치와 슬라이더를 움직일 때. 나무를 톡 두드려요.'),
        ui('ui_popup_open', '창 열림', '팝업 창이 뜰 때. 설명 말풍선이 뜰 때는 작게.'),
        ui('ui_popup_close', '창 닫힘', '팝업 창이 닫힐 때.'),
        ui('ui_error', '안 돼요', '할 수 없는 일을 눌렀을 때. 부드러운 나무 노크 두 번.'),
        ui('ui_confirm', '확인', '설정을 고르거나 상점, 백업이 끝났을 때. 딸랑 두 음.'),
      ],
    },
    {
      id: 'board',
      ko: '소환 · 보드',
      hint: '고양이를 뽑고, 옮기고, 합치고, 파는 소리',
      rows: [
        bd('summon_common', '소환: 꼬마', '꼬마 등급을 뽑을 때. 빠르게 연타하면 등급과 상관없이 이 소리만 나요.', 'summon'),
        bd('summon_rare', '소환: 동네', '동네 등급을 뽑을 때. 통 소리에 딸랑이 둘.', 'summon'),
        bd('summon_epic', '소환: 골목대장', '골목대장 등급을 뽑을 때. 마림바 화음과 종이 꽃가루.', 'summon'),
        bd('summon_legendary', '소환: 대왕', '대왕 등급을 뽑을 때. 묵직한 울림에 마림바가 계단처럼 올라가요.', 'summon'),
        bd('summon_mythic', '소환: 수호신', '수호신 등급을 뽑을 때. 제일 길고 화려해요.', 'summon'),
        bd('merge', '합치기', '같은 고양이 둘을 합칠 때(꼬마, 동네). 연달아 합치면 음이 올라가요.', 'merge', { ladder: true }),
        bd('merge_big', '큰 합치기', '골목대장 이상으로 합칠 때. 도장 쾅 하고 마림바 화음.', 'merge'),
        bd('awaken', '각성', '대왕이 수호신으로 각성할 때. 짧고 당당한 팡파르. 음악이 잠깐 작아져요.', 'big'),
        bd('molt', '털갈이', '털갈이로 다른 줄의 고양이가 될 때. 포근한 구름 소리와 딸랑 두 음.', 'big'),
        bd('sell', '팔기', '고양이를 팔 때. 영수증을 쭉 찢고 동전 두 개.', 'ui', { volume: 0.8 }),
        bd('upgrade', '강화', '소환 레벨을 올리거나 직업 시너지 단계가 오를 때. 우쿨렐레를 쓸고 마림바.', 'merge', { ladder: true }),
        bd('place', '내려놓기', '고양이를 다른 칸에 내려놓을 때. 스치고 톡.', 'ui', { volume: 0.5 }),
        bd('pickup', '집어 들기', '고양이를 집어 들거나 누를 때. 스티커 떼는 소리.', 'ui', { volume: 0.5 }),
      ],
    },
    { id: 'warrior', ko: CLASS_TITLE.warrior.ko, hint: CLASS_TITLE.warrior.hint, rows: catRows('warrior') },
    { id: 'ranger', ko: CLASS_TITLE.ranger.ko, hint: CLASS_TITLE.ranger.hint, rows: catRows('ranger') },
    { id: 'mage', ko: CLASS_TITLE.mage.ko, hint: CLASS_TITLE.mage.hint, rows: catRows('mage') },
    { id: 'trickster', ko: CLASS_TITLE.trickster.ko, hint: CLASS_TITLE.trickster.hint, rows: catRows('trickster') },
    {
      id: 'battle',
      ko: '전투 공통',
      hint: '고양이와 상관없이 전투에서 나는 소리',
      rows: [
        {
          key: 'combo:crit',
          section: 'battle',
          ko: '치명타 한 방 (검사냥)',
          when: '치명타가 터질 때 들리는 그대로: 나무칼 맞는 소리 위에 맑은 딱이 얹혀요.',
          gap: 'crit',
          now: [cueOf(impactSfx('w_sword')), cueOf(critSfx('w_sword'))],
        },
        bt('hit_light', '가벼운 타격', '무기가 따로 없는 평범한 타격(유물 효과 등). 짧은 퍽.', 'hit', { volume: 0.6 }),
        bt('hit_heavy', '묵직한 타격', '한 방이 크거나 보스, 정예를 맞힐 때 깔리는 쿵. 폰 스피커에도 들리게 중간 소리를 더했어요.', 'heavyHit', { volume: 0.8 }),
        bt('crit', '치명타', '치명타 때 무기 소리 위에 얹는 맑은 딱. 더 크고 높아요.', 'crit', { volume: 0.65 }),
        bt('explosion', '폭발', '보스가 쓰러질 때 연달아 터지는 소리의 큰 쪽.', 'big', { volume: 0.8, pitch: 0.7 }),
        bt('zap', '지글', '화상에 걸린 적, 번개 장판, 우주냥의 구역 효과. 셀로판 지직.', 'status', { volume: 0.6 }),
        bt('freeze', '얼어붙음', '적이 얼어붙을 때. 낮게 떨어지는 맑은 세 음.', 'status', { volume: 0.7 }),
        bt('stun', '기절', '적이 기절할 때. 나무 통 하고 어지러운 세 음.', 'status', { volume: 0.6 }),
        bt('buff', '힘내라', '보스가 부하에게 주사를 놓아 힘을 줄 때.', 'status', { volume: 0.6, pitch: 0.9 }),
        bt('heal', '회복', '치료사 적이 주변 적을 고쳐 줄 때. 따뜻하게 올라가요.', 'heal', { volume: 0.3 }),
        bt('weaken', '약해짐', '보스나 드라이기가 고양이를 약하게 만들 때. 김빠지는 우.', 'weaken', { volume: 0.6 }),
        bt('shield_break', '방어막 깨짐', '적의 방패가 깨질 때. 종이 찢고 톡톡톡.', 'big', { volume: 0.7 }),
        bt('splash', '물 첨벙', '물 장판과 연금술사의 구역, 목욕 대마왕의 물폭탄.', 'status', { volume: 0.7 }),
        bt('laser_on', '레이저 켜짐', '레이저 포인터를 켜거나 보스에 점이 딱 맞을 때.', 'ui', { volume: 0.7 }),
        bt('laser_off', '레이저 꺼짐', '레이저 포인터가 끝날 때.', 'ui', { volume: 0.6 }),
        bt('shoot_poison', '독 보글', '독에 걸린 적에게서 나는 보글보글.', 'status', { volume: 0.9, pitch: 0.9 }),
        bt('shoot_claw', '할퀴는 소리(출혈)', '출혈에 걸린 적에게서 나는 소리. 발톱이 스치고 퍽.', 'status', { volume: 0.8, pitch: 0.8 }),
        bt('shoot_magic', '옛 소리: 마법 뿅', '지금 게임에서는 쓰지 않아요. 번개냥의 먹구름이 튀어나올 때 쓰던 소리예요(지금은 "번개냥 · 먹구름 퐁").', 'shoot', { volume: 0.42, pitch: 1.7 }),
        bt('shoot_arrow', '옛 소리: 화살', '지금 게임에서는 쓰지 않아요(고양이마다 따로 소리가 생기기 전의 소리).', 'shoot'),
        bt('shoot_cannon', '옛 소리: 대포', '지금 게임에서는 쓰지 않아요.', 'shoot'),
        bt('shoot_ice', '옛 소리: 얼음', '지금 게임에서는 쓰지 않아요.', 'shoot'),
        bt('shoot_lightning', '옛 소리: 번개', '지금 게임에서는 쓰지 않아요.', 'shoot'),
        bt('enemy_die', '옛 소리: 적 쓰러짐', '지금 게임에서는 쓰지 않아요. 적마다 따로 소리가 있어요(아래 적 칸).', 'die', { ladder: true }),
      ],
    },
    {
      id: 'foes',
      ko: '적 · 쓰러짐',
      hint: '적이 무엇으로 되어 있는지에 따라 맞을 때와 쓰러질 때 소리가 달라요',
      rows: [
        foe('foe_juicy_hit', '과즙 · 맞음', '오이, 귤이 맞을 때. 물컹 찍.', 'hit'),
        foe('foe_juicy_die', '과즙 · 쓰러짐', '오이, 귤이 쓰러질 때. 딱 갈라지고 쭈욱 터져요.', 'die'),
        foe('foe_fluff_hit', '먼지 · 맞음', '먼지 뭉치가 맞을 때. 폭신한 푸.', 'hit'),
        foe('foe_fluff_die', '먼지 · 쓰러짐', '먼지 뭉치가 쓰러질 때. 먼지가 가라앉아요.', 'die'),
        foe('foe_water_hit', '물 · 맞음', '물방울이 맞을 때. 퐁.', 'hit'),
        foe('foe_water_die', '물 · 쓰러짐', '물방울이 쓰러질 때. 첨벙, 방울이 올라와요.', 'die'),
        foe('foe_rubber_hit', '고무 · 맞음', '풍선이 맞을 때. 보잉 하고 찍.', 'hit'),
        foe('foe_rubber_die', '고무 · 쓰러짐', '풍선이 터질 때. 빵 하고 조각이 펄럭여요.', 'die'),
        foe('foe_plastic_hit', '플라스틱 · 맞음', '넥카라, 약병, 분무기, 드라이기가 맞을 때. 속 빈 톡.', 'hit'),
        foe('foe_plastic_die', '플라스틱 · 쓰러짐', '플라스틱 적이 쓰러질 때. 톡톡톡톡 튀어 가요.', 'die'),
        foe('foe_tin_hit', '양철 · 맞음', '알람시계, 금화가 맞을 때. 가는 쇠 소리와 용수철.', 'hit'),
        foe('foe_tin_die', '양철 · 쓰러짐', '알람시계가 쓰러질 때. 용수철이 튀고 톱니가 굴러요.', 'die'),
        foe('foe_motor_hit', '모터 · 맞음', '로봇청소기가 맞을 때. 둔한 퉁과 모터 헛돎.', 'hit'),
        foe('foe_motor_die', '모터 · 쓰러짐', '로봇청소기가 쓰러질 때. 전원이 꺼지며 소리가 내려가요.', 'die'),
        foe('foe_paper_hit', '종이 · 맞음', '폭죽이 맞을 때. 종이 통을 톡.', 'hit'),
        foe('foe_paper_die', '종이 · 쓰러짐', '폭죽이 터질 때. 탁 터지고 색종이가 날려요.', 'die'),
        foe('foe_glass_hit', '유리 · 맞음', '윙윙이, 따끔 선생이 맞을 때. 맑은 땡.', 'hit'),
        foe('foe_cloud_hit', '구름 · 맞음', '우르릉이 맞을 때. 낮은 퉁 하고 우르르 굴러가요.', 'hit'),
      ],
    },
    {
      id: 'bosses',
      ko: '보스',
      hint: '경고, 포효, 그리고 보스마다 따로 있는 마지막 소리',
      rows: [
        boss('boss_warning', '보스 경고', '보스 웨이브가 오기 전. 낮은 북이 점점 빨라져요(정예는 작게). 울리는 동안 음악이 살짝 내려가요.', 'big', { volume: 0.9 }),
        boss('boss_roar', '보스 포효', '보스가 나타날 때, 쓰러지는 장면의 바탕. 낮고 긴 울림. 울리는 동안 전투 소리와 음악이 살짝 내려가요.', 'big', { volume: 0.8 }),
        boss('boss_die', '보스 쓰러짐 쿵', '보스 마지막 장면의 마지막 쿵.', 'big'),
        boss('foe_boss_cucumber', '대왕 오이 · 마지막', '쩍 갈라지고 즙이 쭉, 방울이 잦아들고 퐁.', 'eliteDie'),
        boss('foe_boss_vacuum', '흡입왕 · 마지막', '전원이 꺼지며 세 번 떨다가 낮은 북.', 'eliteDie'),
        boss('foe_boss_blender', '윙윙이 · 마지막', '윙 소리가 느려지며 유리통이 쨍 깨져요.', 'eliteDie'),
        boss('foe_boss_bath', '목욕 대마왕 · 마지막', '부풀다 터지고 긴 철썩, 큰 퐁.', 'eliteDie'),
        boss('foe_boss_cloud', '우르릉 · 마지막', '천둥이 갈라지고 우르르 굴러가며 비가 내려요.', 'eliteDie'),
        boss('foe_boss_needle', '따끔 선생 · 마지막', '유리가 금 가고 반짝반짝 떨어지다 주사기가 뽁.', 'eliteDie'),
      ],
    },
    {
      id: 'skills',
      ko: '스킬',
      hint: '열두 스킬을 장면 순서대로. "지금"은 스킬에 소리가 따로 없어서 다른 소리를 빌려 쓰던 옛 소리, "새것"은 이제 게임이 내는 스킬 전용 소리예요',
      rows: SKILL_ROWS,
    },
    {
      id: 'skillsingle',
      ko: '스킬 소리 낱개',
      hint: '새 스킬 소리를 하나씩. 큰 소리(시전 순간)와 작은 소리(스킬이 도는 동안)가 있어요. 별 · 번개 · 음표처럼 연달아 나는 소리는 "×5"로 쌓이는 느낌을 들어 보세요',
      rows: SKILL_SINGLES,
    },
    {
      id: 'flow',
      ko: '웨이브 · 알림',
      hint: '웨이브가 시작되고 끝나고, 위험을 알릴 때',
      rows: [
        fl('wave_start', '웨이브 시작', '새 웨이브가 시작될 때. 마림바 두 음.', 'big', { volume: 0.65 }),
        fl('call_wave', '웨이브 부르기', '다음 웨이브를 미리 부를 때. 타-타아.', 'big'),
        fl('wave_clear', '웨이브 끝', '웨이브나 보스를 이겼을 때. 마림바 화음이 올라가요.', 'big'),
        fl('danger_alarm', '위험 알림', '적이 길을 거의 채웠을 때, 꽉 찼을 때. 낮은 나무 노크.', 'big', { volume: 0.7 }),
        fl('countdown_tick', '카운트다운', '길이 가득 찬 뒤 1초마다 똑. 갈수록 음이 올라가요.', 'big', { volume: 0.85 }),
        fl('hazard_warn', '장판 경고', '보스가 번개나 물 장판을 깔기 전에. 맑은 나무 노크 두 번.', 'big', { volume: 0.7 }),
        fl('whoosh', '휙', '다음 웨이브 부르기, 보스의 빨아들임, 구역 공격, 상자 열기. 종이가 스치는 소리.', 'zone', { ladder: true }),
        fl('sunbeam', '햇살 칸 켜짐', '햇살 칸이 새 자리에 밝아질 때. 따뜻하게 부풀어요.', 'big', { volume: 0.5 }),
      ],
    },
    {
      id: 'rewards',
      ko: '보상 · 뽑기',
      hint: '동전, 상자, 카드, 장난감을 고를 때',
      rows: [
        rw('coin', '동전', '동전이 올라가고 날아올 때. 연달아 나면 음이 올라가요.', 'coinTick', { ladder: true }),
        rw('coin_many', '동전 비', '복고양이의 동전 비, 결과 화면, 보상을 받을 때.', 'ui'),
        rw('gem', '보석', '보석이 올라가고 날아올 때. 작은 방울 소리.', 'coinTick', { ladder: true }),
        rw('purr', '골골', '골골 재화가 날아와 닿을 때. 가르랑.', 'ui', { volume: 0.5 }),
        rw('reward_claim', '받기', '"받기" 버튼. 도장 쾅 하고 딸랑 한 번.', 'ui'),
        rw('level_up', '레벨 업', '레벨이 오르거나 간식 막대로 등급이 뛸 때. 마림바가 올라가요.', 'ui', { volume: 0.55 }),
        rw('star', '별 스티커', '보상 스티커가 톡 붙을 때, 별 모양 효과. 연달아 나면 음이 올라가요.', 'ui', { ladder: true }),
        rw('purchase', '구매', '상점에서 샀을 때. 영수증 도장과 방울.', 'ui'),
        rw('relic_pick', '장난감 고르기', '장난감(유물)을 고를 때.', 'ui'),
        rw('chest_shake', '상자 흔들림', '상자를 열기 전에 덜컹덜컹.', 'ui'),
        rw('chest_open', '상자 열림', '상자가 열릴 때. 뚜껑 삐걱, 펑, 마림바.', 'ui'),
        rw('card_flip', '카드 뒤집기', '결과 카드를 뒤집을 때. 연달아 뒤집으면 음이 올라가요.', 'ui', { ladder: true }),
        rw('reel_tick', '숫자 올라감', '숫자가 올라갈 때 똑똑. 음이 올라가요.', 'ui', { ladder: true }),
        rw('reel_stop', '숫자 멈춤', '숫자가 멈출 때 퉁.', 'ui'),
        rw('jackpot', '잭팟(효과음)', '지금은 쓰지 않아요. 큰 상자는 아래 음악 칸의 잭팟 팡파르를 써요.', 'ui'),
        rw('gamble_fail', '아쉬움', '캡슐이 꽝일 때 쓰는 짧은 두 음.', 'ui', { volume: 0.4 }),
      ],
    },
  ];
  return sections;
}

export const SECTIONS: readonly Section[] = build();

/** Every row, in the order the page shows them. */
export const ROWS: readonly Row[] = SECTIONS.flatMap((s) => s.rows);

export const ROW_BY_KEY: ReadonlyMap<string, Row> = new Map(ROWS.map((r) => [r.key, r]));

// ───────────────────────────── music ─────────────────────────────

export interface MusicRow {
  id: Exclude<MusicId, 'none'>;
  ko: string;
  when: string;
  /** Tracks that grow with the fight (they have layers the intensity switch brings in). */
  layered: boolean;
}

export const MUSIC_ROWS: readonly MusicRow[] = [
  { id: 'home', ko: '홈 1', when: '홈 화면. 마림바와 우쿨렐레. 홈 2와 번갈아 나와요.', layered: false },
  { id: 'home2', ko: '홈 2', when: '홈 화면의 두 번째 곡. 칼림바와 브러시.', layered: false },
  { id: 'battle', ko: '1장 거실', when: '1장 거실 전투. 마림바가 이끄는 경쾌한 곡.', layered: true },
  { id: 'kitchen', ko: '2장 주방', when: '2장 주방 전투. 냄비 뚜껑 박자.', layered: true },
  { id: 'bath', ko: '3장 욕실', when: '3장 욕실 전투. 물방울과 거품 소리.', layered: true },
  { id: 'garden', ko: '4장 마당', when: '4장 마당 전투. 피리와 새소리.', layered: true },
  { id: 'clinic', ko: '5장 동물병원', when: '5장 동물병원 전투. 오르골과 시계.', layered: true },
  { id: 'elite', ko: '정예 웨이브', when: '정예가 나오는 웨이브. 심장 뛰는 소리.', layered: true },
  { id: 'boss', ko: '보스전', when: '보스가 나오는 웨이브. 한 마디 도입 뒤에 이어져요.', layered: false },
  { id: 'gold', ko: '골드 던전', when: '골드 던전 전투. 동전 소리가 섞여요.', layered: true },
  { id: 'win', ko: '결과: 승리', when: '이겼을 때 결과 화면 아래에 깔려요.', layered: false },
  { id: 'lose', ko: '결과: 패배', when: '졌을 때 결과 화면 아래에 깔려요. 느리고 포근해요.', layered: false },
];

export interface StingerRow {
  id: StingerId;
  ko: string;
  when: string;
}

export const STINGER_ROWS: readonly StingerRow[] = [
  { id: 'victory', ko: '승리', when: '전투에서 이겼을 때. 따뜻한 작은 멜로디.' },
  { id: 'defeat', ko: '패배', when: '전투에서 졌을 때. 부드럽게 내려가는 세 음. 음악이 먹먹해져요.' },
  { id: 'boss_intro', ko: '보스 등장', when: '지금 게임은 쓰지 않아요(보스 경고가 대신해요).' },
  { id: 'mythic', ko: '수호신 후광', when: '각성한 고양이가 수호신이 되는 순간 뒤따라 깔려요.' },
  { id: 'level_up', ko: '레벨 업', when: '고양이 특기가 풀리거나 구조할 때.' },
  { id: 'jackpot', ko: '잭팟', when: '전설 상자가 열릴 때. 색종이 대포.' },
];

// ───────────────────────────── candidates (CC0 packs) ─────────────────────────────

/** What a group of files is, in Korean, by the name without its number. Unknown groups show their file name. */
export const GROUP_KO: Readonly<Record<string, string>> = {
  footstep_carpet: '발소리 · 카펫',
  footstep_concrete: '발소리 · 콘크리트',
  footstep_grass: '발소리 · 풀',
  footstep_snow: '발소리 · 눈',
  footstep_wood: '발소리 · 나무 바닥',
  impactBell_heavy: '종 · 무거운 타격',
  impactGeneric_light: '일반 · 가벼운 타격',
  impactGlass_heavy: '유리 · 무거운 타격',
  impactGlass_light: '유리 · 가벼운 타격',
  impactGlass_medium: '유리 · 보통 타격',
  impactMetal_heavy: '금속 · 무거운 타격 (챙)',
  impactMetal_light: '금속 · 가벼운 타격 (챙)',
  impactMetal_medium: '금속 · 보통 타격 (챙)',
  impactMining: '곡괭이질',
  impactPlank_medium: '판자 · 보통 타격',
  impactPlate_heavy: '금속판 · 무거운 타격 (챙)',
  impactPlate_light: '금속판 · 가벼운 타격 (챙)',
  impactPlate_medium: '금속판 · 보통 타격 (챙)',
  impactPunch_heavy: '주먹 · 무거운',
  impactPunch_medium: '주먹 · 보통',
  impactSoft_heavy: '푹신한 · 무거운 타격',
  impactSoft_medium: '푹신한 · 보통 타격',
  impactTin_medium: '양철 · 보통 타격',
  impactWood_heavy: '나무 · 무거운 타격',
  impactWood_light: '나무 · 가벼운 타격',
  impactWood_medium: '나무 · 보통 타격',
  beltHandle: '허리띠 · 가죽 만지기',
  bookClose: '책 덮기',
  bookFlip: '책장 넘기기',
  bookOpen: '책 펼치기',
  bookPlace: '책 내려놓기',
  chop: '장작 패기',
  cloth: '천 스치는 소리',
  clothBelt: '천 허리띠',
  creak: '삐걱',
  doorClose: '문 닫기',
  doorOpen: '문 열기',
  drawKnife: '칼 뽑기',
  dropLeather: '가죽 떨어뜨리기',
  footstep: '발소리',
  handleCoins: '동전 만지기',
  handleSmallLeather: '작은 가죽 주머니',
  knifeSlice: '칼로 베기',
  metalClick: '금속 딸깍',
  metalLatch: '금속 걸쇠',
  metalPot: '금속 냄비',
  click: '클릭',
  tick: '틱',
  select: '선택',
  switch: '스위치',
  toggle: '토글',
};

export const PACK_KO: Readonly<Record<string, { ko: string; blurb: string }>> = {
  'impact-sounds': { ko: '임팩트 소리', blurb: '때리고 부딪치는 소리 130개: 금속, 나무, 유리, 주먹, 푹신한 것, 발소리. "챙" 하는 소리는 금속과 금속판에서 찾아보세요.' },
  'rpg-audio': { ko: 'RPG 소리', blurb: '칼, 문, 책, 천, 동전, 냄비 같은 옛날 모험 소리 51개.' },
  'interface-sounds': { ko: '인터페이스 클릭', blurb: '클릭, 틱, 선택, 스위치, 토글 27개(이 팩의 나머지는 후보에서 뺐어요).' },
};

/** The group of a candidate: its name without the number at the end (`impactMetal_heavy_002` and `bookFlip2` give `impactMetal_heavy`, `bookFlip`). */
export function groupOf(name: string): string {
  return name.replace(/_?\d+$/, '');
}

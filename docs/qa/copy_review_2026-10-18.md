# 문구 전체 검토 결과 (2026-10-18)

사용자 말씀(2026-10-18): "아 그리고 설명 문구나 이런거 말이 어색한 부분이 많아 고양이 스킬 설명에도 스킬 게이지를 동그라미라고하는것도 이상함 이런거 한번 전체적으로 검토해보고 수정해"

기준은 `docs/qa/copy_style_2026-10-18.md`(용어표와 문체 규칙). 검토자 셋(전투 · 홈 · 설명서와 도감)이 낸 제안 266건을 하나씩 따져서 적용했다. 숫자와 `{자리표}`는 그대로이고, 줄 길이 제한이 있는 곳은 길이를 확인했다.

## 한눈에 보기

| 영역 | 제안 | 그대로 적용 | 고쳐서 적용 | 반려 |
|---|---|---|---|---|
| 전투(스킬 · 적 · 장난감 · HUD · 자막) | 57 | 56 | 1 | 0 |
| 홈(상점 · 고양이 · 설정 · 알림 · 미션 · 패스) | 66 | 61 | 4 | 1 |
| 설명서와 도감 | 143 | 138 | 4 | 1 |
| 합계 | 266 | 255 | 9 | 2 |

제안에 없었지만 같은 용어라서 함께 고친 것이 27건 더 있다(아래 "제안 밖에서 함께 고친 것"). 바뀐 줄은 한국어 164줄, 영어 104줄이다(한 줄에 두 군데를 고친 것은 한 줄로 센다).

## 어떤 종류를 고쳤나

1. **스킬 게이지 이름**: 동그라미 · 고리 → 스킬 게이지(합주 스킬 문구, 복 뽑기 캡슐 문구와 캡슐 팝업). 영어도 ring → skill gauge. 사용자가 짚은 바로 그 부분이다.
2. **합성 → 합치기**: 플레이어 글에서는 합치기/합쳐요만 쓴다(결과 화면 · 고양이 탭 · 사다리 · 설명서 · 장난감 설명). "합성 줄"은 "합치기 순서"로.
3. **"을(를)", "이(가)", "은(는)", "(으)로"를 글에 적어 둔 줄**: 모두 풀어 썼다(고양이 탭 문장, 상자 사기 확인, 잠금 해제 문구, 보스 소개 5줄, 도감 칸/능력 문구 등). 숫자 뒤에 "을"이 그대로 적혀 "+2을"처럼 틀리게 나오던 것도 하나 고쳤다(수호신 캡슐 팝업).
4. **번역투 · 뜻이 안 통하는 말**: "방어와 결계를 50% 무너뜨려요(4초)" → "4초 동안 …", "가장 오래 달린 적" → "가장 멀리 간 적", "번개가 서로 … 안의 적을 따라" → "… 안의 다음 적으로", "한 번의 발도로" → "칼을 한 번 뽑아", "닿는 고양이는" → "사거리가 닿는 고양이는", "좋아요" → "잘 통해요".
5. **내부 용어와 옛 등급말**: 상한 → 한도/최대치, 재사용(시간) → 충전/간격, 일반 → 보통/작은, 유닛 → 고양이, 발판 → 칸, "블록"이라는 말 빼기. 영어는 cell → tile, rarity/rare/common → rank/precious/regular.
6. **같은 것에 다른 이름**: 판매/팔기, 오늘의 상점/일일 상점, 오늘의 상자/일일 미션 상자, 정예/대장, 방울냥/방울 고양이, 소용돌이/회오리, 특기/능력(보스), 러그/매트, 충전/재사용.
7. **버튼 · 라벨이 헷갈리던 것**: "사기"(사기죄로도 읽힘) → "구매하기", "쓰기/쓰는 중" → "사용하기/사용 중", "코드 보내기" → "코드 내보내기", "한번에 열기" → "모두 열기".
8. **뜻이 반대로 읽히거나 틀린 것**: "코드는 나만 알고 있어요"(영어는 남에게 보이지 말라는 뜻) → "다른 사람에게 보여 주지 마세요", 폭죽 설명("달아나게 해요" → 실제로는 잠깐 빨라짐), "연 금 상자 3/10" → "금 상자 3/10개 열었어요".
9. **영어만의 문제**: "Only 1 more waves"(복수 오류) · "1 tickets" · "1 days left" 같은 단수 오류, 대문자 규칙(Daily Challenge · Endless Mode · Gold Dungeon · Guardian), "rarer cats" 같은 옛 등급말, "Where it comes" 같은 비문.

## 고쳐서 적용한 제안 (9건)

- `hud.class.special`(영어): 제안은 "special"이었는데 한국어 "특수 능력"과 설명서에 맞춰 "special ability"로. ("Ability"는 고양이 특기 줄의 이름이라서 따로 둔다.)
- `meta.toast.levelUp`: 제안 "{unit} {level}레벨이 됐어요!" → "{unit} {level}레벨 달성!"(알림에서는 이쪽이 자연스럽다).
- `rt.pass.notYet`: 제안 "도달하지 못했어요" → "아직 이 단계까지 오지 못했어요."(더 쉬운 말).
- `battle.cup.claim` · `battle.endless.claim`(영어): 제안은 둘 다 "Claim prize"였는데 둘이 같아지므로 "Claim cup prize" / "Claim weekly prize"로(버튼 글자는 자동으로 줄어든다).
- `guide.continue.full`: 제안 "이어하기를 할 수 있어요" → "이어서 할 수 있어요."
- `guide.move_swap.full`(영어): 제안 "Sunbeam tiles" → "special tiles"(햇살 칸은 챕터 1의 칸일 뿐이다).
- `codex.target.note.imagined`(한국어): 제안 "만약 나온다면 이 정도예요" → "이 적이 나온다면 이 정도예요."(무엇이 나오는지 밝힘).
- `codex.cell.zap.text`(영어): "A tile lightning struck." → "A tile that lightning struck."

## 받아들이지 않은 제안 (2건)

- `battle.promo.tag`(영어) "First purchase only": 카드 머리에서 태그 자리가 170px뿐이라 "First purchase"도 거의 찬다. 더 길면 카드 이름과 겹치므로 그대로 둠.
- `guide.sweep.full` "한 번 클리어한 챕터는" → "한 번 깬 챕터는": 둘 다 자연스럽고 화면은 "클리어"를 쓴다(소탕 카드 "클리어한 단계만 소탕해요"). 한쪽으로 통일할 이유가 없어 그대로 둠.

## 제안 밖에서 함께 고친 것 (27건)

같은 용어가 다른 곳에도 있어서 검토자 제안과 한 쌍으로 고쳤다.

- `view.sell` "팔기" → "판매": 필드의 가격 태그만 "팔기"였고 버튼 · 판매 띠는 "판매"였다(글자 수는 같다). 설명서도 "판매 버튼"으로 맞춤.
- `hud.set.numbers.hint`: 설정 쪽 `rt.sys.numbers.hint`와 같은 문장이라 "일반 피해" → "작은 피해"로 같이 고침.
- `modifier.rush.desc` "일반 웨이브" → "보통 웨이브"(일반은 쓰지 않는 옛 등급말과 같은 글자).
- `synergy.warrior.special`(영어): "(3 s)" → "for 3 s"(한국어와 같은 고침).
- `meta.calendar.comeback`(영어) · `meta.daily.title`(영어): 한국어/이름 규칙에 맞춤.
- 설명서 한국어: 천장 쪽 "다시 처음부터 세요"(소환 확률 창과 같은 말투) → "횟수는 처음으로 돌아가요", 레이저 쪽 "표시된 적 / 닿는 고양이"(레이저 카드와 같은 두 고침), 출석 달력 "꾸미기 매트" → "러그", 골드 던전 "넘긴 웨이브와 잡은 금화의 수만큼" → "웨이브를 넘기고 금화를 잡을 때마다"(출발 준비 화면과 같은 문장).
- 설명서 영어: Daily Challenge · Gold Dungeon · Endless Mode · Meow Code(이름은 화면처럼 대문자), 직업 특수 능력 두 곳 "special ability".
- 적 특징 페이지 제목 아홉 개: "신속 적", "열풍 적", "치료 적"처럼 어색해서 "특징: {이름}"으로(보스 페이지가 "보스: {이름}"인 것과 맞춤).

## 글만으로는 못 고치는 것 (다음에 볼 것)

- 도감의 `반경 {radius}`가 픽셀 숫자 그대로 나온다("반경 120 안의 적이", 폭죽은 "반경 150"). 알람시계 · 약병 · 폭죽 도감 페이지. `src/codex/foes.ts` 292~298줄에서 `tilesText(radius)`로 넘겨야 하고, `tests/codex.text.test.ts`의 "prints every number of an ability" 기대값도 칸 값으로 바꿔야 한다. 글 파일이 아니라서 건드리지 않았다.
- `src/meta/data/catalog.ts`의 영어 패키지 이름 "Kitten Pack"은 등급말(Kitten)과 겹친다("Baby Cat Pack"이 안전). 글 파일이 아니라서 그대로 둠.
- `hud.cont.fix.over` / `hud.cont.fix.boss`에 4초 · 35% · 20초가 글에 직접 적혀 있어서, `balance.ts`의 `REVIVE_*` 값을 고치면 글이 낡는다(숫자를 `{자리표}`로 바꾸는 코드 수정이 필요).
- 영어에서 같은 "길"을 walkway(HUD 레이저), road(스킬), lane(도감), path(설명서)로 섞어 쓴다. 한국어는 "길" 하나. 영어를 road로 맞추는 편이 좋다(영어 우선순위가 낮아서 미룸).
- 적 이름 `꼬마 풍선`은 등급말 "꼬마"를 "작은"의 뜻으로 쓴 이름이다(게임 데이터라서 그대로).

## 실제 화면을 읽고 더 고친 것 (2026-10-19, 9건)

처음 해 보는 한국 플레이어처럼 360 x 800과 450 x 900에서 처음 튜토리얼 · 홈 · 상점 · 고양이 · 스킬 카드 · 미션 · 패스 · 선택 시트의 i 말풍선 · 설명서 스킬 쪽 · 장난감 고르기 · 도감 · 설정 · 일시정지를 읽었다. "동그라미" · "쿨타임"은 어디에도 남아 있지 않았고, 아래만 더 고쳤다(글이 잘리는 곳은 없었다).

- `shop.tickets.buy`: "1장 사기" → "1장 구매" ("사기"가 사기(詐欺)로도 읽혀서, 다른 버튼과 같게).
- `class.trickster.role`: "가운데에 세우세요" → "가운데에 두세요".
- `rt.sys.feat.shop`: "상자와 오늘의 상점을 만나요" → "상자를 열고 오늘의 상점을 둘러봐요".
- `battle.dungeon.chest`: "그중 보물상자 {n}" → "그중 보물상자 {n}골드" (단위가 빠져 있었다. 옆 줄 "최대 3,000골드"와 맞춤).
- `rt.mis.weekly.count`: "{n}/{max}개 받음" → "{n}/{max}개 받았어요" (다른 줄 말투와 같게).
- `sp.knock.desc`: "피해는 느린 적 3배, 언 적 5배, 대신 얼음은 사라져요" → "느린 적은 3배, 언 적은 5배 피해를 받고 얼음은 사라져요".
- `guide.sell.title`: "팔기" → "판매" (버튼 · 판매 띠와 같은 이름).
- `guide.trait_warded.teach`: "전사와 사수가 좋아요" → "전사와 사수가 잘 통해요" (마주 보는 "마법이 잘 통해요"와 같게).
- `guide.stakes.full`: "제어에 버티는 정도" → "둔화와 기절을 버티는 정도" ("제어"는 게임 속 말이 아니다).
- 테스트 둘을 새 글에 맞춰 고쳤다: `sim.spTexts`(knock 숫자 확인 문구), `screens.shell.dungeon`(보물상자 줄).
- 이 문서의 "글만으로는 못 고치는 것"에 더해, 같은 패키지 이름 불일치가 하나 더 있다: `catalog.ts`의 "성장 패키지"는 "아기 고양이 팩" · "스타터 팩"과 달리 "팩"이 아니다(`성장 팩`으로 맞추는 편이 좋다). 글 파일이 아니라서 그대로 둠.

## 확인한 것

- 타입 검사 오류 0. `npm run font` 완료(한글 769자, 새로 쓰인 글자 포함). 글자 수 제한 테스트(스킬 문구 · 캡슐 팝업 · 직업 설명 · 튜토리얼 말풍선) 통과.
- 전체 테스트 231파일 5,476개 통과. 전체를 한 번에 돌릴 때는 CPU가 바빠서 시간 제한 10개(`meta.chests` · `meta.profile` · `sim.bots` ×2 · `sim.perf` ×2 · `sim.spKnock` · `sim.spSkills` · `sim.spWanted` · `ui.stack`)가 시간 초과/성능 숫자로 떨어졌고, 각 파일을 따로 돌리면 모두 통과한다.
- 글을 고정해 두던 테스트 여섯 개를 새 글에 맞게 고쳤다(느슨하게 만들지 않음): `sim.spTexts`(스킬 게이지 용어 허용, 동그라미 · 고리 · ring 금지로 뒤집음), `codex.resist`(마법 저항), `endless`(Endless Mode), `meta.rules`(동네 만능 카드), `screens.collection`(고양이 탭 문장), `screens.shop.confirm`(구매하기).

# 바뀐 한국어 문구, 화면별 (전 → 후)

긴 설명서 페이지는 바뀐 문단만 적었다.

### 고양이 스킬 설명

- `sp.charge.desc`
  - 전: 칸을 박차고 나가, 적이 가장 많이 몰린 길을 {dist} 거슬러 달려요. 지나는 적마다 한 번씩 밟고, 방어와 결계도 뚫어요.
  - 후: 자리를 박차고 나가, 적이 가장 많이 몰린 길을 {dist} 거슬러 달려요. 지나는 적마다 한 번씩 밟고, 방어와 결계도 뚫어요.
- `sp.jam.desc`
  - 전: 금빛 음표 {notes}개가 날아가요. 음표마다 동그라미가 가장 덜 찬 고양이를 골라 그 동그라미를 {fill}% 채워요. 남는 음표는 스킬 없는 고양이가 바로 한 번 공격해요.
  - 후: 금빛 음표 {notes}개가 날아가요. 음표마다 스킬 게이지가 가장 덜 찬 고양이를 골라 그 게이지를 {fill}% 채워요. 남는 음표는 스킬 없는 고양이가 바로 한 번 공격해요.
- `sp.capsule.desc`
  - 전: 딸깍! 캡슐 속은 소환 {fish}번 값의 생선, 골골 +{purr}, 짝꿍 고양이, 한 번 더, 장난감 고르기, 공짜 {guardian} 각성 중 하나예요. 복고양이가 여럿이어도 동그라미는 같이 써요.
  - 후: 딸깍! 캡슐 속은 소환 {fish}번 값의 생선, 골골 +{purr}, 짝꿍 고양이, 한 번 더, 장난감 고르기, 공짜 {guardian} 각성 중 하나예요. 복고양이가 여럿이어도 스킬 게이지는 같이 써요.
- `sp.capsule.fish.b`
  - 전: 소환 한 번 값, 고리도 반쯤
  - 후: 소환 한 번 값, 스킬 게이지도 반쯤 차요
- `sp.capsule.partnerFull.b`
  - 전: 한 계단 올라갔어요!
  - 후: 내 고양이가 한 등급 올랐어요!
- `sp.capsule.guardian.a`
  - 전: 무지개 빛!
  - 후: 무지갯빛!
- `sp.capsule.guardianEmpty.b`
  - 전: 골골 +{n}을 두고 갔어요
  - 후: 골골 +{n}만 두고 갔어요

### 고양이 특기 줄

- `unit.w_paw.skill`
  - 전: 가장 오래 달린 적부터 쉬지 않고 쳐요.
  - 후: 가장 멀리 간 적부터 쉬지 않고 쳐요.
- `unit.w_viking.skill`
  - 전: 노린 적과 주변 {c} 안의 적 최대 {d}마리를 내리치고 방어와 결계를 {a}% 무너뜨려요({b}초). 보스·정예가 사거리 안에 있으면 먼저 노려요.
  - 후: 노린 적과 주변 {c} 안의 적 최대 {d}마리를 내리치고, {b}초 동안 방어와 결계를 {a}% 무너뜨려요. 보스·정예가 사거리 안에 있으면 먼저 노려요.
- `unit.r_star.skill`
  - 전: 노린 적과 그 뒤로 일직선에 선 적 {a}마리를 꿰뚫어요. 쓰러진 적은 주변 {b} 안으로 터져요(피해의 {c}%).
  - 후: 노린 적과 그 뒤로 일직선에 선 적 {a}마리를 꿰뚫어요. 쓰러진 적은 터져서 주변 {b} 안의 적에게 피해의 {c}%를 줘요.
- `unit.m_storm.skill`
  - 전: 번개가 서로 {c} 안의 적을 따라 최대 {a}마리까지 건너뛰어요. 튈 때마다 직전 피해의 {b}%만 줘요. 맞은 적은 {d}초 동안 감전돼 멈춰요.
  - 후: 번개가 {c} 안의 다음 적으로 최대 {a}마리까지 건너뛰어요. 튈 때마다 직전 피해의 {b}%만 줘요. 맞은 적은 {d}초 동안 감전돼 멈춰요.

### 시너지

- `synergy.warrior.special`
  - 전: {a}초마다 전사들이 함성을 질러요. 사거리 안의 적이 {b}초 기절하고 방어와 결계가 {c}% 무너져요({d}초).
  - 후: {a}초마다 전사들이 함성을 질러요. 사거리 안의 적이 {b}초 기절하고, {d}초 동안 방어와 결계가 {c}% 무너져요.

### 일일 도전 규칙

- `modifier.rush.desc`
  - 전: 일반 웨이브가 {a}초로 짧아져요.
  - 후: 보통 웨이브가 {a}초로 짧아져요.

### 훈련장

- `training.laser_cd.effect`
  - 전: 재사용 −{a}초
  - 후: 충전 −{a}초

### 직업 · 고양이 소개

- `class.ranger.role`
  - 전: 멀리서 한 마리씩 정확하게. 치명타가 특기예요.
  - 후: 멀리서 한 마리씩 정확하게. 치명타를 잘 터뜨려요.
- `unit.w_samurai.desc`
  - 전: 한 번의 발도로 줄지어 선 적을 한꺼번에 베어요.
  - 후: 칼을 한 번 뽑아 줄지어 선 적을 한꺼번에 베어요.

### 적 소개

- `enemy.firecracker.desc`
  - 전: 터지면서 주변 적을 놀라 달아나게 해요.
  - 후: 터지면 놀란 주변 적이 잠깐 빨라져요.
- `enemy.boss_cloud.desc`
  - 전: 바닥에 번개를 내리꽂는 먹구름. 번쩍이는 칸에서 피하세요.
  - 후: 바닥에 번개를 내리꽂는 먹구름. 번쩍이는 칸은 피하세요.

### 적 특징

- `trait.armored.desc`
  - 전: 물리 피해를 덜 받아요. 마법이나 방어 깎기·방어 무시가 좋아요.
  - 후: 물리 피해를 덜 받아요. 마법과 방어 깎기·방어 무시가 잘 통해요.
- `trait.warded.desc`
  - 전: 마법 피해를 덜 받아요. 전사와 사수, 방어 깎기·방어 무시가 좋아요.
  - 후: 마법 피해를 덜 받아요. 전사·사수와 방어 깎기·방어 무시가 잘 통해요.
- `trait.swarm.desc`
  - 전: 많이 몰려와요. 넓게 때리는 공격이 좋아요.
  - 후: 많이 몰려와요. 넓게 때리는 공격이 잘 통해요.
- `trait.shield.desc`
  - 전: 보호막이 피해를 대신 받아요. 한 방이 센 공격이 좋아요.
  - 후: 보호막이 피해를 대신 받아요. 한 방이 센 공격이 잘 통해요.
- `trait.weaken.desc`
  - 전: 가장 센 고양이의 공격을 느리게 해요. 힘을 여럿에게 나누세요.
  - 후: 가장 센 고양이의 공격을 느리게 해요. 한 마리에게 몰아주지 마세요.

### 장난감 설명

- `relic.scratcher.desc`
  - 전: 모든 적의 갑옷·결계 −{a}%
  - 후: 모든 적의 방어·결계 −{a}%
- `relic.snack_stick.desc`
  - 전: 합성할 때 {a}% 확률로 두 등급 올라가요
  - 후: 합칠 때 {a}% 확률로 두 등급 올라가요
- `relic.sardine_crate.desc`
  - 전: 바로 생선 +{a}, 소환 비용 상한 −{b}
  - 후: 바로 생선 +{a}, 소환 비용 최대치 −{b}

### 전투 · 적 말풍선

- `hud.boss.def`
  - 전: 방어 {armor}% · 저항 {ward}%
  - 후: 방어 {armor}% · 마법 저항 {ward}%

### 전투 · 직업 시트

- `hud.ladder.merge`
  - 전: 합성
  - 후: 합치기

### 전투 · 소환 확률 창

- `hud.odds.rule`
  - 전: 골목대장 이상이 {limit}번 안 나오면 {next}번째부터 소환마다 확률이 쌓여요. 나오면 처음부터 다시 세요. 위 표는 다음 소환에 실제로 쓰는 확률이에요.
  - 후: 골목대장 이상이 {limit}번 안 나오면 {next}번째부터 소환마다 확률이 쌓여요. 나오면 횟수는 0으로 돌아가요. 위 표는 다음 소환에 실제로 쓰는 확률이에요.
- `hud.odds.tutorial`
  - 전: 처음 세 번의 소환은 튜토리얼 대본이에요. 그 뒤부터는 위 표대로 나와요.
  - 후: 처음 세 번의 소환은 튜토리얼용으로 정해져 있어요. 그 뒤부터는 위 표대로 나와요.

### 전투 · 재주 배지

- `hud.buff.ward`
  - 전: 젖음·낙뢰를 {n}% 피해요
  - 후: 젖음·낙뢰를 {n}% 확률로 피해요

### 전투 · 일시정지 설정

- `hud.set.numbers.hint`
  - 전: 간략은 치명타·처치·큰 피해만, 전체는 일반 피해까지 보여요.
  - 후: 간략은 치명타·처치·큰 피해만, 전체는 작은 피해까지 모두 보여요.

### 전투 · 이어하기 창

- `hud.cont.fix.over`
  - 전: 계속하면 적이 크게 줄고 4초를 더 줘요.
  - 후: 계속하면 적이 크게 줄고, 4초 동안은 안전해요.

### 전투 · 결과 화면

- `hud.res.merges`
  - 전: 합성
  - 후: 합치기

### 전투 · 레이저 카드

- `hud.laserCard.row2`
  - 전: 점 근처의 표시된 적은 받는 피해가 +{pct}% 늘어요.
  - 후: 점 근처에서 표시가 붙은 적은 받는 피해가 {pct}% 늘어요.
- `hud.laserCard.row4`
  - 전: 정예나 보스 가까이에 찍으면 점이 그 적에게 붙어서 따라가요. 닿는 고양이는 그 적부터 공격해요.
  - 후: 정예나 보스 가까이에 찍으면 점이 그 적에게 붙어서 따라가요. 사거리가 닿는 고양이는 그 적부터 공격해요.

### 전투 · 안 되는 동작 알림

- `hud.fail.choice_pending`
  - 전: 먼저 고르는 중이에요.
  - 후: 먼저 하나를 골라야 해요.

### 전투 자막(배너)

- `director.eliteDefeated`
  - 전: 대장 격파!
  - 후: 정예 격파!
- `director.hazard.wet`
  - 전: 젖은 칸은 공격할 수 없어요
  - 후: 젖은 칸의 고양이는 공격할 수 없어요
- `director.hazard.zap`
  - 전: 번개 맞은 칸은 쉬어요
  - 후: 번개 맞은 칸의 고양이는 잠시 쉬어요

### 전투 필드(판매 태그)

- `view.sell`
  - 전: 팔기
  - 후: 판매

### 홈 · 출동 탭

- `battle.chest.openAll`
  - 전: 한번에 열기 ({n})
  - 후: 모두 열기 ({n})
- `battle.dungeon.reward`
  - 전: 최대 {n} 골드
  - 후: 최대 {n}골드

### 홈 · 고양이 탭

- `cats.merge`
  - 전: 합성
  - 후: 합치기
- `cats.line.merge`
  - 전: {a} 둘을 합치면 {b}이(가) 돼요.
  - 후: {a} 둘을 합치면 {b} 한 마리가 돼요.
- `cats.line.awaken`
  - 전: {a}은(는) 각성하면 {b}이(가) 돼요.
  - 후: {a} 한 마리가 각성하면 {b} 한 마리가 돼요.
- `cats.line.guardian`
  - 전: {a}을(를) 각성하면 {b}이(가) 돼요.
  - 후: {a} 한 마리가 각성하면 {b} 한 마리가 돼요.
- `cats.unit.line`
  - 전: 합성 줄
  - 후: 합치기 순서

### 홈 · 상점

- `shop.chest.openAll`
  - 전: 한번에 열기 ({n})
  - 후: 모두 열기 ({n})
- `shop.chest.pity`
  - 전: 연 금 상자 {n}/{every}
  - 후: 금 상자 {n}/{every}개 열었어요
- `shop.chest.pityTarget`
  - 전: 대상: {unit}
  - 후: 보너스 대상: {unit}
- `shop.chest.confirmTitle`
  - 전: {chest}을(를) 살까요?
  - 후: {chest}를 살까요?
- `shop.chest.confirmBuy`
  - 전: 사기
  - 후: 구매하기
- `shop.butler.owned`
  - 전: 쓰는 중이에요
  - 후: 이용 중이에요
- `shop.butler.note`
  - 전: 전투 안의 이득은 없어요.
  - 후: 전투에 유리한 효과는 없어요.
- `shop.gempass.claimed`
  - 전: 오늘 것은 받았어요
  - 후: 오늘 보석은 받았어요
- `shop.cos.equip`
  - 전: 쓰기
  - 후: 사용하기
- `shop.cos.equipped`
  - 전: 쓰는 중
  - 후: 사용 중
- `shop.cos.chapter`
  - 전: 챕터 {n}을(를) 깨면 열려요
  - 후: 챕터 {n} 클리어하면 열려요
- `shop.tickets.sub`
  - 전: 깬 단계를 싸우지 않고 보상만 받아요.
  - 후: 클리어한 챕터는 싸우지 않고 보상만 받아요.
- `shop.need.gems`
  - 전: 보석이 {n}개 더 필요해요. 보석을 보러 갈까요?
  - 후: 보석이 {n}개 더 필요해요. 보석 패키지를 보러 갈까요?
- `reveal.overflow`
  - 전: 더 못 쓰는 카드는 골드 {n}(으)로 바꿨어요.
  - 후: 남는 카드는 골드로 바꿨어요. (+{n})
- `odds.where`
  - 전: 유닛은 뽑기로 팔지 않아요. 상자는 성장 속도만 바꿔요.
  - 후: 고양이는 뽑기로 팔지 않아요. 상자는 성장 속도만 바꿔요.

### 홈 · 패스 탭

- `rt.pass.notYet`
  - 전: 아직 이 단계에 닿지 않았어요.
  - 후: 아직 이 단계까지 오지 못했어요.
- `rt.pass.celebrate.body`
  - 전: {n}단계까지의 프리미엄 보상을 한꺼번에 받을 수 있어요.
  - 후: {n}단계까지 쌓인 프리미엄 보상을 한꺼번에 받을 수 있어요.

### 출동 준비 · 이어서 하기

- `shell.pre.gold.rules.pay`
  - 전: 넘긴 웨이브와 잡은 금화의 수만큼 골드를 받아요. 뒤로 갈수록 더 많이 줘요.
  - 후: 웨이브를 넘기고 금화를 잡을 때마다 골드를 받아요. 뒤로 갈수록 더 많이 줘요.
- `shell.pre.lines`
  - 전: 합성 줄
  - 후: 합치기 순서
- `shell.pre.lines.hint`
  - 전: 같은 고양이 둘을 합치면 같은 줄의 다음 등급이 돼요.
  - 후: 같은 고양이 둘을 합치면 같은 직업의 다음 등급이 돼요.
- `shell.pre.ad.none`
  - 전: 광고 없음
  - 후: 지금은 광고 없음
- `shell.cont.giveup.body`
  - 전: 여기까지의 보상만 받고 판을 끝내요.
  - 후: 지금까지 얻은 보상만 받고 판을 끝내요.

### 설정 · 달력 · 팝업

- `rt.sys.numbers.hint`
  - 전: 간략은 치명타·처치·큰 피해만, 전체는 일반 피해까지 보여요.
  - 후: 간략은 치명타·처치·큰 피해만, 전체는 작은 피해까지 모두 보여요.
- `rt.sys.reset.msg2`
  - 전: 지운 기록은 되돌릴 수 없어요. 냥이 코드를 보내 두었는지 확인해 주세요.
  - 후: 지운 기록은 되돌릴 수 없어요. 냥이 코드를 복사해 두었는지 확인해 주세요.
- `rt.sys.code.export`
  - 전: 코드 보내기
  - 후: 코드 내보내기
- `rt.sys.code.exportHelp`
  - 전: 이 코드를 복사해 두세요. 다른 기기에서 "코드 불러오기"에 붙여 넣으면 진행 상황이 옮겨져요. 코드는 나만 알고 있어요.
  - 후: 이 코드를 복사해 두세요. 다른 기기에서 "코드 불러오기"에 붙여 넣으면 진행 상황이 옮겨져요. 코드는 다른 사람에게 보여 주지 마세요.
- `rt.sys.cal.note`
  - 전: 빠져도 괜찮아요. 접속한 날마다 한 칸씩 나아가요.
  - 후: 하루 건너뛰어도 괜찮아요. 접속한 날마다 한 칸씩 나아가요.
- `rt.sys.unlock.more`
  - 전: 그리고 {n}가지 더
  - 후: {n}가지가 더 열렸어요.
- `rt.sys.feat.shop`
  - 전: 상자와 일일 상점을 만나요.
  - 후: 상자와 오늘의 상점을 만나요.
- `rt.sys.feat.sweep`
  - 전: 소탕권으로 클리어한 판을 바로 끝내요.
  - 후: 소탕권으로 클리어한 챕터를 바로 끝내요.

### 저장 알림

- `ui.storage.volatile`
  - 전: 이 기기에 저장할 수 없어요. 게임을 닫으면 진행이 사라져요.
  - 후: 이 기기에 저장할 수 없어요. 게임을 닫으면 진행 상황이 사라져요.

### 상자 보상 · 확률 문구

- `meta.reward.wild`
  - 전: 만능 카드({rarity}) {n}장
  - 후: {rarity} 만능 카드 {n}장
- `meta.odds.wild`
  - 전: 카드의 {pct}는 같은 등급 아무 고양이에게나 쓰는 만능 카드예요.
  - 후: 카드 중 {pct}는 같은 등급이면 어느 고양이에게나 쓸 수 있는 만능 카드예요.
- `meta.odds.pity`
  - 전: 금 상자 {every}개째마다 가장 레벨이 낮은 {rarity}(지금: {unit}) 카드 {n}장이 더 들어요. ({counter}/{every})
  - 후: 금 상자를 {every}개 열 때마다 {rarity} 중 레벨이 가장 낮은 고양이(지금은 {unit})의 카드가 {n}장 더 들어요. ({counter}/{every})

### 알림(토스트)

- `meta.err.not_cleared`
  - 전: 먼저 클리어한 단계만 소탕할 수 있어요.
  - 후: 이 집사 단계로 먼저 클리어한 챕터만 소탕할 수 있어요.
- `meta.toast.levelUp`
  - 전: {unit}이(가) {level}레벨이 됐어요!
  - 후: {unit} {level}레벨 달성!

### 기능 잠금 · 이름

- `meta.unlock.chapter`
  - 전: {chapter}을(를) 클리어하면 열려요.
  - 후: {chapter} 챕터를 클리어하면 열려요.

### 미션 이름

- `meta.mission.d_wins`
  - 전: 승리 {n}번 하기
  - 후: {n}번 승리하기
- `meta.mission.w_chests`
  - 전: 일일 미션 상자 {n}번 받기
  - 후: 오늘의 상자 {n}번 받기

### 출석 · 꾸미기 이름

- `meta.calendar.comeback`
  - 전: 돌아온 걸 환영해요! 은 상자와 긴 순찰을 준비했어요.
  - 후: 돌아온 걸 환영해요! 은 상자와 넉넉한 순찰 보상을 준비했어요.

### 패키지 설명(지금 화면에는 안 나옴)

- `butler_pass`
  - 전: 3배속, 광고 없는 보상 2배·상자 건너뛰기·순찰 2배, 순찰 12시간, 소탕권 매일 +3. 판 안의 이득은 없어요.
  - 후: 3배속, 광고 없이 보상 2배, 상자 바로 열기, 순찰 2배, 순찰 보상 최대 12시간, 소탕권 매일 +3. 전투에 유리한 효과는 없어요.

### 설명서와 튜토리얼

- `guide.tut.sheet`
  - 전: 내 등급과 시너지 단계가 여기 있어요. 다 봤으면 닫아요.
  - 후: 가진 등급과 시너지 단계가 여기 있어요. 다 봤으면 닫아요.
- `guide.summon_grade.full`
  - 전: 소환 등급을 올리면 같은 값으로 더 귀한 고양이가 나올 확률이 커져요. 등급은 {top}단계까지 있고, 올리는 값은 차례로 생선 {costs}마리예요.
    처음 등급의 확률은 {odds1}. 가장 높은 등급은 {oddsTop}이에요.
    동그란 % 버튼을 누르면 다음 소환의 진짜 확률을 볼 수 있어요.
  - 후: 소환 등급을 올리면 같은 값으로 더 귀한 고양이가 나올 확률이 커져요. 등급은 {top}단계까지 있고, 올리는 값은 차례로 생선 {costs}마리예요.
    처음 등급 확률: {odds1}
    가장 높은 등급 확률: {oddsTop}
    동그란 % 버튼을 누르면 다음 소환의 진짜 확률을 볼 수 있어요.
- `guide.pity.full`
  - 전: 골목대장 이상이 {limit}번 연속으로 안 나오면, 그다음 소환부터 한 번마다 골목대장 이상이 나올 확률이 {step}%씩 올라요. 최대 {max}%까지예요.
  - 후: 골목대장 이상이 {limit}번 연속으로 안 나오면, 그다음부터는 소환할 때마다 골목대장 이상이 나올 확률이 {step}%씩 올라요. 최대 {max}%까지예요.
  - 전: 좋은 고양이가 나오면 다시 처음부터 세요. 보너스가 쌓이는 동안은 노란 칩이 나타나 얼마나 모였는지 보여 줘요.
  - 후: 좋은 고양이가 나오면 횟수는 처음으로 돌아가요. 보너스가 쌓이는 동안은 노란 칩이 나타나 얼마나 모였는지 보여 줘요.
- `guide.merge.full`
  - 전: 같은 고양이 두 마리를 끌어서 겹치면 한 마리가 돼요. 결과는 같은 직업의 다음 등급이에요. 예를 들어 {a} 둘이 합쳐지면 {b}이(가) 돼요.
  - 후: 같은 고양이 두 마리를 끌어서 겹치면 한 마리가 돼요. 같은 직업의 다음 등급이 나와요. 예를 들어 {a} 둘을 합치면 {b} 한 마리가 돼요.
- `guide.class_lines.title`
  - 전: 직업 줄(합성 계보)
  - 후: 직업 줄(합치는 순서)
- `guide.class_lines.teach`
  - 전: 직업마다 합성 순서가 정해져 있어요.
  - 후: 직업마다 합치는 순서가 정해져 있어요.
- `guide.class_lines.full`
  - 전: 합치면 언제나 같은 직업의 다음 칸으로 가요.
  - 후: 합치면 언제나 같은 직업 줄의 다음 고양이가 나와요.
- `guide.lose_gauge.title`
  - 전: 지는 때 ① 적이 너무 많을 때
  - 후: 지는 경우 ① 적이 너무 많을 때
- `guide.lose_gauge.full`
  - 전: 위쪽 막대는 지금 길 위에 있는 적의 수예요. {cap}마리를 넘으면 "넘쳤어요!" 카운트가 시작돼요.
  - 후: 위쪽 막대는 지금 길 위에 있는 적의 수예요. {cap}마리를 넘으면 "넘쳤어요!" 카운트다운이 시작돼요.
  - 전: 그 카운트가 {grace}초 끝날 때까지 적을 한도 아래로 줄이지 못하면 져요. 줄이면 바로 멈춰요.
  - 후: {grace}초 안에 적을 한도 아래로 줄이지 못하면 져요. 줄이면 카운트다운이 바로 멈춰요.
- `guide.lose_boss.title`
  - 전: 지는 때 ② 보스 제한 시간
  - 후: 지는 경우 ② 보스 제한 시간
- `guide.lose_boss.full`
  - 전: 보스 막대의 "예상" 표시가 이길 수 있을지 알려 줘요. 모자라면 레이저와 시너지를 모아요.
  - 후: 보스 막대의 "예상" 표시가 이길 수 있을지 알려 줘요. 모자라면 레이저를 쓰고 시너지를 모아요.
- `guide.continue.full`
  - 전: 웨이브를 {minWave}개 넘긴 뒤에 지면 한 번 이어하기를 권해요. 광고를 보거나 보석 {gems}개를 내요.
  - 후: 웨이브를 {minWave}개 넘긴 뒤에 지면 한 번 이어서 할 수 있어요. 광고를 보거나 보석 {gems}개를 내요.
- `guide.synergy.full`
  - 전: 직업 피해 보너스는 그 직업 고양이만 받고, 방어 무시·치명타·상태 이상 지속처럼 곁들여 붙는 효과는 모든 고양이가 받아요.
  - 후: 직업 피해 보너스는 그 직업 고양이만 받고, 방어 무시·치명타·상태 이상 지속처럼 함께 붙는 효과는 모든 고양이가 받아요.
  - 전: (위 줄은 각각 첫째, 둘째, 셋째 단계의 보너스예요.)
  - 후: (각 줄은 앞에서부터 첫째, 둘째, 셋째 단계의 보너스예요.)
- `guide.class_sheet.teach`
  - 전: 직업 칩을 누르면 그 직업의 모든 것이 보여요.
  - 후: 직업 칩을 누르면 그 직업을 자세히 볼 수 있어요.
- `guide.class_sheet.full`
  - 전: 직업 칩을 누르면 그 직업의 합성 줄이 펼쳐져요. 가진 등급은 사진으로 밝게, 없는 등급은 점선 칸으로 보여요. 칩의 작은 점은 시너지에 세는 등급이라서 {kitten}의 점은 켜지지 않아요.
  - 후: 직업 칩을 누르면 그 직업의 줄이 펼쳐져요. 가진 등급은 사진으로 밝게, 없는 등급은 점선 칸으로 보여요. 칩의 작은 점은 시너지에 세는 등급이라서 {kitten}의 점은 켜지지 않아요.
  - 전: 화살표는 합성이나 각성이 가능할 때 직업 색으로 변해요.
  - 후: 화살표는 합치거나 각성할 수 있을 때 직업 색으로 바뀌어요.
- `guide.class_upgrade.full`
  - 전: 단계는 {max}번까지 올릴 수 있고 값은 차례로 생선 {costs}마리예요. 그 직업을 많이 모았을 때 쓰면 이득이에요.
  - 후: {max}단계까지 올릴 수 있고, 값은 차례로 생선 {costs}마리예요. 그 직업을 많이 모았을 때 쓰면 이득이에요.
- `guide.purr.full`
  - 전: 털갈이는 등급마다 달라요({molt}). 각성은 {awaken}개가 들어요.
  - 후: 털갈이는 등급마다 드는 골골이 달라요({molt}). 각성은 {awaken}개가 들어요.
- `guide.sell.full`
  - 전: 고양이를 눌러 팔기 버튼을 누르거나, 아래 팔기 띠로 끌어다 놓으면 생선을 돌려받아요.
  - 후: 고양이를 눌러 판매 버튼을 누르거나, 아래 판매 띠로 끌어다 놓으면 생선을 돌려받아요.
- `guide.sp_skill.full`
  - 전: {rank} 이상 고양이는 저마다 스킬이 하나씩 있어요. 고양이 옆에 차오르는 것이 스킬 게이지예요. 고양이가 서 있는 동안 조금씩 차다가, 가득 차면 스킬을 써요.
  - 후: {rank} 이상 고양이는 저마다 스킬이 하나씩 있어요. 고양이 옆에서 차오르는 게 스킬 게이지예요. 고양이가 서 있는 동안 조금씩 차다가, 가득 차면 스킬을 써요.
  - 전: 스킬은 누르지 않아도 저절로 나가요. 게이지가 가득 찼는데 쓸 곳이 없으면 그대로 기다렸다가, 쓸 적이 나타나면 바로 써요. 쓰고 나면 게이지는 다시 비어요.
  - 후: 스킬은 누르지 않아도 저절로 나가요. 게이지가 가득 찼는데 노릴 적이 없으면 그대로 기다렸다가, 적이 나타나면 바로 써요. 쓰고 나면 게이지는 다시 비어요.
- `guide.hazards.title`
  - 전: 칸 위험
  - 후: 위험한 칸
- `guide.hazards.full`
  - 전: 방울 고양이와 그 둘레 한 칸 안의 고양이는 물과 번개를 가끔 피해요.
  - 후: 방울냥과 그 둘레 한 칸 안의 고양이는 물과 번개를 가끔 피해요.
- `guide.laser.full`
  - 전: 점을 정예나 보스 가까이에 찍으면 점이 그 적에게 철컥 붙어서, 걸어가도 따라가요. 빨간 고리가 그 적을 감싸고, 닿는 고양이는 그 적부터 공격해요. 점을 다른 곳으로 옮기면 풀려요.
  - 후: 점을 정예나 보스 가까이에 찍으면 점이 그 적에게 철컥 붙어서, 걸어가도 따라가요. 빨간 고리가 그 적을 감싸고, 사거리가 닿는 고양이는 그 적부터 공격해요. 점을 다른 곳으로 옮기면 풀려요.
  - 전: 점 근처의 표시된 적은 받는 피해가 {vuln}% 늘어요. 쓰고 나면 {cd}초 뒤에 다시 쓸 수 있어요.
  - 후: 점 근처에서 표시가 붙은 적은 받는 피해가 {vuln}% 늘어요. 쓰고 나면 {cd}초 뒤에 다시 쓸 수 있어요.
- `guide.call_wave.full`
  - 전: 남은 시간에 비례해 초당 생선 {rate}마리씩, 최대 {max}마리를 보너스로 받아요. 적이 아직 많이 남았다면 누르지 않는 게 안전해요.
  - 후: 건너뛴 시간만큼 초당 생선 {rate}마리씩, 최대 {max}마리를 보너스로 받아요. 적이 아직 많이 남았다면 누르지 않는 게 안전해요.
- `guide.toy_reroll.full`
  - 전: 장난감 화면의 다시 뽑기 버튼을 누르면 다른 장난감으로 바뀌어요. 한 판에 공짜는 {free}번이에요.
  - 후: 장난감 화면의 다시 뽑기 버튼을 누르면 다른 장난감으로 바뀌어요. 한 판에 {free}번은 무료예요.
  - 전: 공짜를 썼다면 광고를 보거나 보석 {gems}개를 내고 한 번 더 뽑을 수 있어요.
  - 후: 무료 횟수를 다 썼다면 광고를 보거나 보석 {gems}개를 내고 한 번 더 뽑을 수 있어요.
- `guide.stakes.full`
  - 전: 첫째: {s1} {c1}
  - 후: 첫 단계: {s1} {c1}
  - 전: 둘째: {s2} {c2}
  - 후: 둘째 단계: {s2} {c2}
  - 전: 셋째: {s3} {c3}
  - 후: 셋째 단계: {s3} {c3}
  - 전: 넷째: {s4} {c4}
  - 후: 넷째 단계: {s4} {c4}
  - 전: 다섯째: {s5} {c5}
  - 후: 다섯째 단계: {s5} {c5}
- `guide.elite.full`
  - 전: {first}번째 웨이브에 첫 정예가 오고, 그다음부터는 {gap}웨이브마다 와요. 호위하는 작은 적과 함께 와요.
  - 후: {first}번째 웨이브에 첫 정예가 나타나고, 그다음부터는 {gap}웨이브마다 나타나요. 호위하는 작은 적도 함께 와요.
  - 전: 대왕 오이는 체력이 반 아래로 내려가면 화가 나서 최대 {rage}%까지 빨라져요.
  - 후: 대왕 오이는 체력이 절반 아래로 내려가면 화가 나서 최대 {rage}%까지 빨라져요.
- `guide.boss.full`
  - 전: {first}번째 웨이브에 첫 보스가 오고, 그다음부터는 {gap}웨이브마다 와요. 챕터마다 보스의 특기가 달라요.
  - 후: {first}번째 웨이브에 첫 보스가 나타나고, 그다음부터는 {gap}웨이브마다 나타나요. 챕터마다 보스의 능력이 달라요.
  - 전: 보스가 나타나면 이름과 특기가 배너로 나와요. 보스 막대에는 남은 시간과 예상이 보여요.
  - 후: 보스가 나타나면 이름과 능력이 배너로 나와요. 보스 막대에는 남은 시간과 예상이 보여요.
- `guide.boss_vacuum.teach`
  - 전: {name}은(는) 숨을 들이마셔 고양이들을 약하게 해요.
  - 후: 숨을 들이마셔 고양이들을 약하게 하는 {name}!
- `guide.boss_blender.teach`
  - 전: {name}은(는) 모든 적을 한꺼번에 빠르게 해요.
  - 후: 모든 적을 한꺼번에 빠르게 하는 {name}!
- `guide.boss_blender.full`
  - 전: {every}초마다 {dur}초 동안 회오리를 일으켜 길 위의 모든 적이 {speed}% 빨라져요.
  - 후: {every}초마다 {dur}초 동안 소용돌이를 일으켜 길 위의 모든 적이 {speed}% 빨라져요.
- `guide.boss_bath.teach`
  - 전: {name}은(는) 칸을 물에 잠기게 해요.
  - 후: 칸을 물에 잠기게 하는 {name}!
- `guide.boss_cloud.teach`
  - 전: {name}은(는) 번개로 칸을 막아요.
  - 후: 번개로 칸을 막는 {name}!
- `guide.boss_needle.teach`
  - 전: {name}은(는) 적을 단단하게 하고 스스로 회복해요.
  - 후: 적을 단단하게 하고 스스로 회복하는 {name}!
- `guide.trait_armored.title`
  - 전: {name} 적
  - 후: 특징: {name}
- `guide.trait_warded.title`
  - 전: {name} 적
  - 후: 특징: {name}
- `guide.trait_fast.title`
  - 전: {name} 적
  - 후: 특징: {name}
- `guide.trait_swarm.title`
  - 전: {name} 적
  - 후: 특징: {name}
- `guide.trait_split.title`
  - 전: {name} 적
  - 후: 특징: {name}
- `guide.trait_haste_aura.title`
  - 전: {name} 적
  - 후: 특징: {name}
- `guide.trait_heal_aura.title`
  - 전: {name} 적
  - 후: 특징: {name}
- `guide.trait_shield.title`
  - 전: {name} 적
  - 후: 특징: {name}
- `guide.trait_weaken.title`
  - 전: {name} 적
  - 후: 특징: {name}
- `guide.trait_weaken.full`
  - 전: {every}초마다 가장 센 고양이의 공격을 {dur}초 동안 절반으로 느리게 해요.
  - 후: {every}초마다 가장 센 고양이의 공격 속도를 {dur}초 동안 절반으로 줄여요.
- `guide.chests.full`
  - 전: 나무 상자는 카드 {woodCards}장, 은 상자는 {silverCards}장, 금 상자는 {goldCards}장이 나와요.
    카드 한 장마다 나무: {wood}
    은: {silver}
    금: {gold}
    은 상자에는 골목대장 이상이 최소 {silverGuarantee}장, 금 상자에는 대왕이 최소 {goldGuarantee}장 들어 있어요.
    금 상자를 {every}번째 열 때마다 가장 레벨이 낮은 대왕 카드가 {bonus}장 더 들어요(천장). 상자 화면의 % 버튼으로 언제든 확인해요. 은 상자는 보석 {silverGems}개, 금 상자는 {goldGems}개예요.
  - 후: 나무 상자는 카드 {woodCards}장, 은 상자는 {silverCards}장, 금 상자는 {goldCards}장이 나와요.
    카드 한 장마다 이 확률로 나와요.
    나무 상자: {wood}
    은 상자: {silver}
    금 상자: {gold}
    은 상자에는 골목대장 이상이 최소 {silverGuarantee}장, 금 상자에는 대왕이 최소 {goldGuarantee}장 들어 있어요.
    금 상자를 {every}번째 열 때마다 가장 레벨이 낮은 대왕 카드가 {bonus}장 더 들어요(천장). 상자 화면의 % 버튼으로 언제든 확인해요. 보석으로 열려면 은 상자는 {silverGems}개, 금 상자는 {goldGems}개가 들어요.
- `guide.calendar.full`
  - 전: {gold}일째에는 금 상자가, 마지막 날에는 꾸미기 매트가 기다려요. 홈 화면의 달력에서 받아요.
  - 후: {gold}일째에는 금 상자가, 마지막 날에는 러그가 기다려요. 홈 화면의 달력에서 받아요.
- `guide.pass.full`
  - 전: 시즌은 {days}일이고 보상 단계는 {tiers}개예요. 경험치 {xp}을(를) 모으면 한 단계가 올라가요. 판을 마칠 때마다 경험치가 쌓여요.
  - 후: 시즌은 {days}일이고 보상 단계는 {tiers}개예요. 경험치가 {xp} 쌓일 때마다 한 단계가 올라가요. 판을 마칠 때마다 경험치가 쌓여요.
- `guide.gold_dungeon.full`
  - 전: 넘긴 웨이브와 잡은 금화의 수만큼 골드를 받고, 보물상자를 쓰러뜨리면 큼직한 골드를 더 받아요. 하루 입장은 {free}번이에요.
  - 후: 웨이브를 넘기고 금화를 잡을 때마다 골드를 받고, 보물상자를 쓰러뜨리면 큼직한 골드를 더 받아요. 하루 입장은 {free}번이에요.

### 도감

- `codex.section.cells`
  - 전: 발판
  - 후: 칸
- `codex.sectionLong.cells`
  - 전: 발판 도감
  - 후: 칸 도감
- `codex.settings.hint`
  - 전: 몬스터 · 장난감 · 발판 정보를 봐요
  - 후: 몬스터 · 장난감 · 칸 정보를 봐요
- `codex.group.normal`
  - 전: 일반 적
  - 후: 보통 적
- `codex.page.rule`
  - 전: 피해 상한
  - 후: 피해 한도
- `codex.stat.hpMult.v`
  - 전: 오이의 ×{n}배
  - 후: 오이의 {n}배
- `codex.appear.split`
  - 전: {parent}이(가) 터질 때 나와요
  - 후: {parent}에서 나뉘어 나와요
- `codex.target.hp`
  - 전: 체력 {hp} (오이의 ×{times}배)
  - 후: 체력 {hp} (오이의 {times}배)
- `codex.target.cap`
  - 전: 초당 최대 {dps} 피해 · 최소 {min}초
  - 후: 초당 최대 {dps} 피해 · 최소 {min}초는 걸려요
- `codex.target.note.imagined`
  - 전: 이 챕터에서는 다른 상대가 나와요. 나온다면 이만큼이에요.
  - 후: 이 챕터에는 다른 적이 나와요. 이 적이 나온다면 이 정도예요.
- `codex.rule.text`
  - 전: 웨이브 {wave}처럼 제한 시간이 {limit}초면, 아무리 센 판이어도 제한 시간의 {frac}%인 {min}초는 걸려요. 몰아치기를 막으려고 초당 들어가는 피해는 최대 체력의 {per}%까지만이고, 모아 둔 힘도 {burst}초치까지만 한 번에 들어가요. 넘치는 피해는 사라져요.
  - 후: 웨이브 {wave}처럼 제한 시간이 {limit}초면, 아무리 센 고양이들이 모여도 제한 시간의 {frac}%인 {min}초는 걸려요. 한 번에 몰아치지 못하도록 초당 들어가는 피해는 최대 체력의 {per}%까지만이고, 모아 둔 힘도 한 번에 {burst}초 분량까지만 들어가요. 넘치는 피해는 사라져요.
- `codex.ability.rage.text`
  - 전: 체력이 {hp}% 아래로 내려가면 화가 나서 능력의 재사용 시간이 {pct}% 줄어요.
  - 후: 체력이 {hp}% 아래로 내려가면 화가 나서 능력을 쓰는 간격이 {pct}% 짧아져요.
- `codex.ability.lightning.text`
  - 전: {every}초마다 {side}×{side}칸 블록에 번개를 내려요. 번개는 {dur}초 동안 이어지고, 그 칸의 고양이는 공격하지 못해요.
  - 후: {every}초마다 {side}×{side}칸에 번개를 내려요. 번개는 {dur}초 동안 이어지고, 그 칸의 고양이는 공격하지 못해요.
- `codex.ability.weaken.text`
  - 전: {every}초마다 가장 센 고양이의 공격을 {dur}초 동안 절반으로 늦춰요.
  - 후: {every}초마다 가장 센 고양이의 공격 속도를 {dur}초 동안 절반으로 줄여요.
- `codex.tip.armor`
  - 전: 방어력 {armor}%라서 물리 피해가 {armor}% 줄어요. 마법 피해 직업({magic})의 공격과, 방어를 깎는 고양이({breakers})가 잘 통해요. 방어 깎기와 방어 무시는 마법 저항도 같이 줄여요.
  - 후: 방어력 {armor}%라서 물리 피해가 {armor}% 줄어요. 마법 피해 직업({magic})의 공격과, 방어를 깎는 고양이({breakers})의 공격이 잘 통해요. 방어 깎기와 방어 무시는 마법 저항도 같이 줄여요.
- `codex.tip.time`
  - 전: 제한 시간 {limit}초인데 최소 {min}초는 걸려요. 레이저를 {dur}초 동안 두면 가장 먼저 노리고 피해도 {vuln}% 늘어요.
  - 후: 제한 시간 {limit}초인데 최소 {min}초는 걸려요. 레이저를 찍으면 {dur}초 동안 고양이들이 이 적부터 노리고, 받는 피해도 {vuln}% 늘어요.
- `codex.tip.lightning`
  - 전: 번개가 {side}×{side}칸에 {dur}초 동안 떨어져요. 번쩍이는 칸의 고양이를 비켜 주어요.
  - 후: 번개가 {side}×{side}칸에 {dur}초 동안 떨어져요. 번쩍이는 칸의 고양이는 다른 칸으로 옮겨요.
- `codex.tip.wet_pulse`
  - 전: {every}초마다 {cells}칸이 젖어요. 반짝이는 칸의 고양이를 비켜 주어요.
  - 후: {every}초마다 {cells}칸이 젖어요. 반짝이는 칸의 고양이는 다른 칸으로 옮겨요.
- `codex.cell.plain.text`
  - 전: 아무 효과도 없는 칸이에요. 판은 가로 {cols}칸, 세로 {rows}칸이라 모두 {cells}칸이고, 한 칸에 고양이 한 마리가 서요. 끌어서 옮기고, 같은 고양이끼리 만나면 합쳐져요.
  - 후: 아무 효과도 없는 칸이에요. 판은 가로 {cols}칸, 세로 {rows}칸이라 모두 {cells}칸이고, 한 칸에 고양이 한 마리가 서요. 고양이는 끌어서 옮기고, 같은 고양이끼리 겹치면 합쳐요.
- `codex.cell.special.text`
  - 전: {chapter}의 특수 칸이에요. {effect} 판에 {cells}칸이 있고, 처음에는 가운데 십자 모양이에요. 스테이지가 끝날 때마다 새 자리로 옮겨요. {toy}이(가) 있으면 칸이 {toyCells}칸 늘고 효과가 이렇게 커져요. {boosted}
  - 후: {chapter}의 특수 칸이에요. {effect} 판에 {cells}칸이 있고, 처음에는 가운데 십자 모양이에요. 스테이지가 끝날 때마다 새 자리로 옮겨요. {toy} 장난감이 있으면 칸이 {toyCells}칸 늘고 효과가 이렇게 커져요. {boosted}
- `codex.cell.wet.text`
  - 전: 물이 튄 칸이에요. 그 칸의 고양이는 물이 마를 때까지 공격하지 못해요. 칸은 닿기 {warn}초 전에 반짝여요. {spray}은(는) {sprayEvery}초마다 {sprayCells}칸을 {sprayDur}초 동안, {bath}은(는) {soakEvery}초마다 {soakCells}칸을 {soakDur}초 동안 적셔요. 고양이를 옮기면 {recover}초 뒤에 다시 공격해요. {bell}과 둘레의 고양이는 {dodge}% 확률로 피해요.
  - 후: 물이 튄 칸이에요. 그 칸의 고양이는 물이 마를 때까지 공격하지 못해요. 물이 닿기 {warn}초 전에 칸이 반짝여요. {spray}: {sprayEvery}초마다 {sprayCells}칸을 {sprayDur}초 동안 적셔요. {bath}: {soakEvery}초마다 {soakCells}칸을 {soakDur}초 동안 적셔요. 고양이를 옮기면 {recover}초 뒤에 다시 공격해요. {bell}과 둘레의 고양이는 {dodge}% 확률로 피해요.
- `codex.cell.zap.text`
  - 전: 번개가 떨어진 칸이에요. 젖은 칸처럼 그 칸의 고양이는 공격하지 못해요. {cloud}은(는) {every}초마다 {side}×{side}칸 블록에 번개를 내려 {dur}초 동안 이어져요. 칸은 {warn}초 먼저 반짝여요. 고양이를 옮기면 {recover}초 뒤에 다시 공격해요. {bell}과 둘레의 고양이는 {dodge}% 확률로 피해요.
  - 후: 번개가 떨어진 칸이에요. 젖은 칸처럼 그 칸의 고양이는 공격하지 못해요. {cloud}: {every}초마다 {side}×{side}칸에 번개를 내려요. 번개는 {dur}초 동안 이어져요. 칸은 {warn}초 먼저 반짝여요. 고양이를 옮기면 {recover}초 뒤에 다시 공격해요. {bell}과 둘레의 고양이는 {dodge}% 확률로 피해요.
- `codex.cell.tower.text`
  - 전: 맨 윗줄 {cells}칸이에요. {toy}이(가) 있으면 여기 선 고양이의 사거리가 {range}%, 피해가 {damage}% 늘어요.
  - 후: 맨 윗줄 {cells}칸이에요. {toy} 장난감이 있으면 여기 선 고양이의 사거리가 {range}%, 피해가 {damage}% 늘어요.
- `codex.cell.perch.name`
  - 전: 바깥 테두리 칸
  - 후: 바깥 줄 칸
- `codex.cell.perch.text`
  - 전: 판 바깥을 한 바퀴 두르는 {cells}칸이에요. 길에 닿는 칸이에요. {toy}이(가) 있으면 여기 선 고양이의 공격이 {speed}% 빨라져요.
  - 후: 판 바깥을 한 바퀴 두르는 {cells}칸이에요. 길과 맞닿아 있어요. {toy} 장난감이 있으면 여기 선 고양이의 공격이 {speed}% 빨라져요.
- `codex.cell.cushion.text`
  - 전: 위, 아래, 양옆 {sides}칸 중 하나에 같은 직업의 고양이가 서 있는 칸이에요. {toy}이(가) 있으면 그 고양이의 피해가 {damage}% 늘어요. 직업이 다르면 늘지 않아요.
  - 후: 위, 아래, 양옆 {sides}칸 중 하나에 같은 직업의 고양이가 서 있는 칸이에요. {toy} 장난감이 있으면 그 고양이의 피해가 {damage}% 늘어요. 직업이 다르면 늘지 않아요.
- `codex.cell.bard.text`
  - 전: {cat} 둘레 {cells}칸(대각선까지)에 선 고양이는 피해가 {damage}% 늘어요. 레벨 {level}부터 더 커져서 최대 {max}%예요. 악사냥이 여럿이면 가장 센 하나만 적용돼요.
  - 후: {cat} 둘레 {cells}칸(대각선까지)에 선 고양이는 피해가 {damage}% 늘어요. 레벨 {level}부터 효과가 커져서 최대 {max}%예요. 악사냥이 여럿이면 가장 센 하나만 적용돼요.
- `codex.cell.lane.text`
  - 전: 적은 판 왼쪽 위의 입구로 나와 시계 방향으로 판을 빙글빙글 돌아요. {cucumber}이(가) 한 바퀴 도는 데 {lap}초쯤 걸려요. 판 가장자리 {ring}칸이 길에 닿아서 사거리가 짧은 고양이도 거기서 싸워요. 마법 고양이의 장판(눈보라, 블랙홀, 물약 구름)은 노린 적이 선 길 위에 깔려요. 길 위의 적이 {cap}마리를 넘고 {grace}초가 지나면 져요. 집사 단계가 오르면 {low}마리부터예요.
  - 후: 적은 판 왼쪽 위의 입구로 나와 시계 방향으로 판을 빙글빙글 돌아요. {cucumber} 기준으로 한 바퀴 도는 데 {lap}초쯤 걸려요. 판 가장자리 {ring}칸이 길에 닿아서 사거리가 짧은 고양이도 거기서 싸워요. 마법 고양이의 장판(눈보라, 블랙홀, 물약 구름)은 노린 적이 선 길 위에 깔려요. 길 위의 적이 {cap}마리를 넘고 {grace}초가 지나면 져요. 집사 단계가 오르면 {low}마리부터예요.

## 영어 문구 (104줄, 한국어와 같은 용어로 맞춘 것)

- `unit.w_paw.skill`
  - 전: Jabs the longest-running enemy without ever stopping.
  - 후: Jabs the enemy farthest along the road without ever stopping.
- `unit.t_bell.skill`
  - 전: It and the {n} cats around it dodge wet and zap cells with a {b}% chance ({c}% from level 7), and the {n} cats around it attack {a}% faster.
  - 후: It and the {n} cats around it have a {b}% chance ({c}% from level 7) to dodge wet and zapped tiles, and the {n} cats around it attack {a}% faster.
- `sp.jam.desc`
  - 전: Sends out {notes} golden notes. Each one fills {fill}% of the emptiest skill ring left; a spare note makes a cat without a skill attack once, right away.
  - 후: Sends out {notes} golden notes. Each one fills {fill}% of the emptiest skill gauge; a spare note makes a cat without a skill attack once, right away.
- `sp.capsule.desc`
  - 전: A capsule pops open: fish ({fish}x a summon's price), +{purr} purr, a buddy cat, one more capsule, a toy to pick, or a free {guardian} awakening. Several lucky cats share one ring.
  - 후: A capsule pops open: fish ({fish}x a summon's price), +{purr} purr, a buddy cat, one more capsule, a toy to pick, or a free {guardian} awakening. Several lucky cats share one skill gauge.
- `sp.capsule.fish.b`
  - 전: A summon's worth, ring at half
  - 후: A summon's worth, skill gauge at half
- `sp.capsule.partnerFull.b`
  - 전: so it moved up a step!
  - 후: so a cat moved up a rank!
- `sp.capsule.guardianEmpty.a`
  - 전: The guardian's still sleepy.
  - 후: The Guardian's still sleepy.
- `synergy.warrior.special`
  - 전: Every {a} s the warriors roar: enemies in their range are stunned for {b} s and lose {c}% armour and ward ({d} s).
  - 후: Every {a} s the warriors roar: enemies in their range are stunned for {b} s and lose {c}% armour and ward for {d} s.
- `training.laser_cd.effect`
  - 전: Cooldown -{a} s
  - 후: Recharge -{a} s
- `enemy.firecracker.desc`
  - 전: Its bang makes nearby enemies bolt.
  - 후: Its bang spooks nearby enemies into a brief sprint.
- `relic.snack_stick.desc`
  - 전: {a}% chance for a merge to jump two rarities
  - 후: {a}% chance for a merge to jump two ranks
- `hud.class.special`
  - 전: {n}-kind ability · {name}
  - 후: {n}-kind special ability · {name}
- `hud.buff.ward`
  - 전: Dodges wet and zap {n}%
  - 후: Dodges wet and zap tiles {n}% of the time
- `hud.cont.fix.over`
  - 전: Continue to clear most enemies and get 4 more seconds.
  - 후: Continue to clear most enemies and get 4 seconds of safety.
- `hud.res.close`
  - 전: Only {n} more waves to clear it!
  - 후: So close! Waves left: {n}
- `hud.res.best`
  - 전: Best rarity
  - 후: Best rank
- `hud.fail.empty_cell`
  - 전: That cell is empty.
  - 후: That tile is empty.
- `hud.fail.molt.not_available`
  - 전: A guardian cannot molt.
  - 후: A Guardian cannot molt.
- `director.hazard.wet`
  - 전: Wet cells cannot attack
  - 후: Cats on wet tiles cannot attack
- `director.hazard.zap`
  - 전: Zapped cells rest
  - 후: Cats on zapped tiles rest
- `meta.odds.wild`
  - 전: {pct} of the cards are wild cards that work on any cat of the same rarity.
  - 후: {pct} of the cards are wild cards that work on any cat of the same rank.
- `meta.err.run_active`
  - 전: There is a run that has not finished.
  - 후: You have an unfinished run.
- `meta.feature.cosmetics`
  - 전: Cosmetics
  - 후: Style
- `meta.feature.daily`
  - 전: Daily challenge
  - 후: Daily Challenge
- `meta.feature.endless`
  - 전: Endless mode
  - 후: Endless Mode
- `meta.feature.dungeon`
  - 전: Gold dungeon
  - 후: Gold Dungeon
- `meta.mission.w_chests`
  - 전: Claim the daily mission chest {n} times
  - 후: Claim the daily chest {n} times
- `meta.calendar.comeback`
  - 전: Welcome back! A silver chest and a long patrol are waiting.
  - 후: Welcome back! A silver chest and extra patrol rewards are waiting.
- `meta.daily.title`
  - 전: Daily challenge
  - 후: Daily Challenge
- `meta.cos.rug_baby`
  - 전: Kitten rug
  - 후: Baby cat rug
- `butler_pass`
  - 전: 3x speed, ad-free double reward, chest skip and double patrol, 12 h patrol, +3 sweep tickets a day. Nothing that helps inside a run.
  - 후: 3x speed, ad-free double rewards, instant chests, double patrol, patrol rewards up to 12 h, +3 sweep tickets a day. No advantage inside a run.
- `battle.treat.title`
  - 전: Today's treats
  - 후: Today's Treat
- `battle.cup.claim`
  - 전: Cup prize
  - 후: Claim cup prize
- `battle.endless.claim`
  - 전: Weekly prize
  - 후: Claim weekly prize
- `battle.sweep.tickets`
  - 전: {n} tickets
  - 후: Tickets: {n}
- `rt.mis.endless.title`
  - 전: Endless mode
  - 후: Endless Mode
- `shop.chest.pityTarget`
  - 전: Target: {unit}
  - 후: Bonus for: {unit}
- `rt.sys.gempass.days`
  - 전: {n} days left.
  - 후: Days left: {n}.
- `rt.sys.feat.shop`
  - 전: Chests and the daily shop.
  - 후: Chests and today's shop.
- `guide.skip.body`
  - 전: The lessons stop and the run goes on as an easy one. Read anything you missed in the guidebook in Settings.
  - 후: The lessons stop and you carry on with an easy run. Anything you missed is in the guidebook under Settings.
- `guide.summon.full`
  - 전: Fish come from defeating enemies and clearing waves, and while a wave runs {rate} more arrive every second by themselves. When the board is full you cannot summon, so merge or sell.
  - 후: Fish come from defeating enemies and clearing waves, and while a wave is on, {rate} fish also arrive every second on their own. When the board is full you cannot summon, so merge or sell.
- `guide.summon_grade.full`
  - 전: Raising the summon grade makes rarer cats more likely for the same price. There are {top} grades and each step costs fish: {costs}.
    The first grade rolls {odds1}. The top grade rolls {oddsTop}.
    Tap the round % button to see the real odds of your next summon.
  - 후: Raising the summon grade makes better cats more likely for the same price. There are {top} grades and each step costs fish: {costs}.
    First grade odds: {odds1}
    Top grade odds: {oddsTop}
    Tap the round % button to see the real odds of your next summon.
- `guide.merge.full`
  - 전: Drag one cat onto an identical one and they become a single cat of the next rank in the same class. For example two {a} become {b}.
  - 후: Drag one cat onto an identical one and they become a single cat of the next rank in the same class. For example: {a} + {a} = {b}.
- `guide.class_lines.full`
  - 전: The last step, the Guardian, is never merged: awaken a King. To change lines, use molting.
  - 후: The last step, the Guardian, cannot be merged: awaken a King instead. To change lines, use molting.
- `guide.synergy.full`
  - 전: The damage bonus goes to the cats of that class only; side effects such as armour ignore, crit and status duration go to every cat.
  - 후: The damage bonus goes to the cats of that class only; extra bonuses such as armour ignore, crit and status duration go to every cat.
  - 전: At {c} kinds every class also gets an ability.
  - 후: At {c} kinds every class also gets a special ability.
- `guide.class_sheet.full`
  - 전: Below it you see how many kinds are missing for the next synergy step, the bonus of each step (from {a} kinds up to {c}) and the ability that turns on at {c} kinds.
  - 후: Below it you see how many kinds are missing for the next synergy step, the bonus of each step (from {a} kinds up to {c}) and the special ability that turns on at {c} kinds.
- `guide.purr.teach`
  - 전: Purr is the rare material for molting and awakening.
  - 후: Purr is the precious material for molting and awakening.
- `guide.molt.full`
  - 전: Purr cost grows with the rank of the cat ({prices}). It works {limit} times per run, and a guardian cannot molt. Use it when a pair is one cat short, or a synergy is one kind short.
  - 후: Purr cost grows with the rank of the cat ({prices}). It works {limit} times per run, and a Guardian cannot molt. Use it when a pair is one cat short, or a synergy is one kind short.
- `guide.move_swap.teach`
  - 전: Drag a cat to an empty cell, or onto another to swap.
  - 후: Drag a cat to an empty tile, or onto another to swap.
- `guide.move_swap.full`
  - 전: Drag a cat onto an empty cell to move it. Drop it on a different cat to swap places, or on an identical one to merge.
  - 후: Drag a cat onto an empty tile to move it. Drop it on a different cat to swap places, or on an identical one to merge.
  - 전: You can also tap a cat to pick it and then tap the cell. Moving your best cats to sunny cells and the outer ring pays off.
  - 후: You can also tap a cat to pick it and then tap the tile. Moving your best cats to special tiles and the outer ring pays off.
- `guide.hazards.title`
  - 전: Cell hazards
  - 후: Tile hazards
- `guide.hazards.teach`
  - 전: Cats on a soaked or zapped cell cannot attack.
  - 후: Cats on a soaked or zapped tile cannot attack.
- `guide.hazards.full`
  - 전: Some enemies and bosses soak cells with water or strike them with lightning. A cat there cannot attack until it ends.
  - 후: Some enemies and bosses soak tiles with water or strike them with lightning. A cat there cannot attack until the effect ends.
  - 전: Water lasts {wet} seconds, lightning {zap}. The cell flashes {warn} seconds before, so move your cat to another cell in time.
  - 후: Water lasts {wet} seconds, lightning {zap}. The tile flashes {warn} seconds before, so move your cat to another tile in time.
- `guide.stakes.full`
  - 전: First: {s1} {c1}
  - 후: First level: {s1} {c1}
  - 전: Second: {s2} {c2}
  - 후: Second level: {s2} {c2}
  - 전: Third: {s3} {c3}
  - 후: Third level: {s3} {c3}
  - 전: Fourth: {s4} {c4}
  - 후: Fourth level: {s4} {c4}
  - 전: Fifth: {s5} {c5}
  - 후: Fifth level: {s5} {c5}
- `guide.boss_bath.teach`
  - 전: {name} floods your cells.
  - 후: {name} floods your tiles.
- `guide.boss_bath.full`
  - 전: Every {every} seconds it sends out {count} water drops, and every {soak} seconds it soaks {cells} cells for {dur} seconds. Cats on a soaked cell cannot attack.
  - 후: Every {every} seconds it sends out {count} water drops, and every {soak} seconds it soaks {cells} tiles for {dur} seconds. Cats on a soaked tile cannot attack.
  - 전: A flashing cell is about to be soaked. Move important cats out in time.
  - 후: A flashing tile is about to be soaked. Move important cats out in time.
- `guide.boss_cloud.teach`
  - 전: {name} blocks cells with lightning.
  - 후: {name} blocks tiles with lightning.
- `guide.boss_cloud.full`
  - 전: Every {every} seconds it strikes a block of four cells. Cats on them cannot attack for {dur} seconds.
  - 후: Every {every} seconds it strikes a block of four tiles. Cats on them cannot attack for {dur} seconds.
- `guide.cards.full`
  - 전: Levelling costs cards and gold. The first level needs {first} cards, the last {last}, and rarer cats need fewer.
  - 후: Levelling costs cards and gold. The first level needs {first} cards, the last {last}, and higher-rank cats need fewer.
- `guide.chests.full`
  - 전: A wooden chest holds {woodCards} cards, a silver one {silverCards} and a gold one {goldCards}.
    Odds per card, wooden: {wood}
    Silver: {silver}
    Gold: {gold}
    A silver chest always holds at least {silverGuarantee} Alley Boss or better, a gold one at least {goldGuarantee} Kings.
    Once in every {every} gold chests, a chest adds {bonus} extra cards of your lowest-level King (pity). Tap the % button on a chest to check any time. A silver chest costs {silverGems} gems, a gold one {goldGems}.
  - 후: A wooden chest holds {woodCards} cards, a silver one {silverCards} and a gold one {goldCards}.
    Odds per card:
    Wooden chest: {wood}
    Silver chest: {silver}
    Gold chest: {gold}
    A silver chest always holds at least {silverGuarantee} Alley Boss or better, a gold one at least {goldGuarantee} Kings.
    Once in every {every} gold chests, a chest adds {bonus} extra cards of your lowest-level King (pity). Tap the % button on a chest to check any time. A silver chest costs {silverGems} gems, a gold one {goldGems}.
- `guide.daily_challenge.title`
  - 전: Daily challenge
  - 후: Daily Challenge
- `guide.gold_dungeon.title`
  - 전: Gold dungeon
  - 후: Gold Dungeon
- `guide.endless.title`
  - 전: Endless mode
  - 후: Endless Mode
- `guide.endless.full`
  - 전: Reaching wave {w1}, {w2} and {w3} pays rewards.
  - 후: Reaching waves {w1}, {w2} and {w3} pays rewards.
- `guide.backup_code.title`
  - 전: Meow code (backup)
  - 후: Meow Code (backup)
- `guide.backup_code.full`
  - 전: In Settings, make a Meow code and your whole progress becomes one line of text. Write it down, then load it on another device to carry on.
  - 후: In Settings, make a Meow Code and your whole progress becomes one line of text. Write it down, then load it on another device to carry on.
- `codex.section.cells`
  - 전: Cells
  - 후: Tiles
- `codex.sectionLong.cells`
  - 전: Board cells
  - 후: Board tiles
- `codex.settings.hint`
  - 전: Monsters, toys and board cells
  - 후: Monsters, toys and board tiles
- `codex.group.normal`
  - 전: Common foes
  - 후: Regular foes
- `codex.page.appears`
  - 전: Where it comes
  - 후: Where it appears
- `codex.page.waves`
  - 전: Each time it comes
  - 후: Each appearance
- `codex.page.rule`
  - 전: Damage allowance
  - 후: Damage limit
- `codex.stat.hpMult.v`
  - 전: {n} times a cucumber
  - 후: {n}x a cucumber
- `codex.appear.none`
  - 전: Never walks a wave by itself
  - 후: Never appears in a wave on its own
- `codex.target.imagined`
  - 전: Wave {wave} (if it came)
  - 후: Wave {wave} (if it appeared)
- `codex.target.hp`
  - 전: Health {hp} ({times} times a cucumber)
  - 후: Health {hp} ({times}x a cucumber)
- `codex.target.cap`
  - 전: At most {dps} damage a second · at least {min}s
  - 후: At most {dps} damage a second · takes at least {min}s
- `codex.target.note.imagined`
  - 전: Another foe comes here in this chapter. This is what it would have.
  - 후: A different enemy appears here in this chapter. These are the numbers this one would have.
- `codex.control.stun.none`
  - 전: Do not work
  - 후: No effect
- `codex.control.pull.v`
  - 전: Only {n}% of it
  - 후: Only {n}% strength
- `codex.rule.text`
  - 전: With a time limit of {limit}s, like wave {wave}, even the strongest board needs {min}s, which is {frac}% of the limit. To stop burst damage, at most {per}% of its health can go in per second, and saved-up strength can only be spent {burst}s at a time. Damage over that is lost.
  - 후: With a time limit of {limit}s, like wave {wave}, even the strongest team needs {min}s, which is {frac}% of the limit. To stop burst damage, at most {per}% of its health can go in per second, and saved-up power can only hit for {burst}s worth at once. Damage over that is lost.
- `codex.ability.rage.text`
  - 전: Below {hp}% health it gets angry and its ability cooldowns are {pct}% shorter.
  - 후: Below {hp}% health it gets angry and the wait between its abilities is {pct}% shorter.
- `codex.ability.splash.text`
  - 전: Every {every}s it spills out {count} of the {spawn}. Every {soakEvery}s it soaks {cells} of the cells your cats stand on for {dur}s.
  - 후: Every {every}s it spills out {count} {spawn}s. Every {soakEvery}s it soaks {cells} of the tiles your cats stand on for {dur}s.
- `codex.ability.lightning.text`
  - 전: Every {every}s lightning strikes a block of {side}×{side} cells and lasts {dur}s. Cats there cannot attack.
  - 후: Every {every}s lightning strikes a block of {side}×{side} tiles and lasts {dur}s. Cats there cannot attack.
- `codex.ability.split.text`
  - 전: When it falls it splits into {count} of the {into}.
  - 후: When it falls it splits into {count} {into}s.
- `codex.ability.wet_pulse.text`
  - 전: Every {every}s it soaks {cells} of the cells your cats stand on for {dur}s. Cats on a wet cell cannot attack.
  - 후: Every {every}s it soaks {cells} of the tiles your cats stand on for {dur}s. Cats on a wet tile cannot attack.
- `codex.tip.splash`
  - 전: {count} droplets come at a time, so wide attacks help. Move cats off the cells about to get wet ({cells} cells, {dur}s).
  - 후: {count} droplets come at a time, so wide attacks help. Move cats off the tiles about to get wet ({cells} tiles, {dur}s).
- `codex.tip.lightning`
  - 전: Lightning hits {side}×{side} cells for {dur}s. Move cats off the flashing cells.
  - 후: Lightning hits {side}×{side} tiles for {dur}s. Move cats off the flashing tiles.
- `codex.tip.wet_pulse`
  - 전: Every {every}s some cells get soaked ({cells} at a time). Move cats off the flashing cells.
  - 후: Every {every}s some tiles get soaked ({cells} at a time). Move cats off the flashing tiles.
- `codex.tip.death_burst`
  - 전: When it falls, nearby enemies get {pct}% faster. Finish it when no other enemy is close.
  - 후: When it falls, nearby enemies move {pct}% faster. Finish it when no other enemy is close.
- `codex.cellgroup.danger`
  - 전: Dangerous cells
  - 후: Dangerous tiles
- `codex.cell.plain.name`
  - 전: Plain cell
  - 후: Plain tile
- `codex.cell.plain.text`
  - 전: A cell with no effect. The board is {cols} cells wide and {rows} deep, {cells} cells in all, and one cat stands on each. Drag cats around; two of the same cat merge.
  - 후: A tile with no effect. The board is {cols} tiles wide and {rows} deep, {cells} tiles in all, and one cat stands on each. Drag cats around; two of the same cat merge.
- `codex.cell.wet.name`
  - 전: Wet cell
  - 후: Wet tile
- `codex.cell.wet.text`
  - 전: A cell that got splashed. A cat there cannot attack until it dries. The cell flashes {warn}s before. The {spray} soaks {sprayCells} of the cells your cats stand on every {sprayEvery}s for {sprayDur}s, and the {bath} soaks {soakCells} every {soakEvery}s for {soakDur}s. A cat that is moved attacks again after {recover}s. The {bell} and the cats around it dodge it {dodge}% of the time.
  - 후: A tile that got splashed. A cat there cannot attack until it dries. The tile flashes {warn}s before the water lands. {spray}: soaks {sprayCells} of the tiles your cats stand on every {sprayEvery}s for {sprayDur}s. {bath}: soaks {soakCells} every {soakEvery}s for {soakDur}s. A cat that is moved attacks again after {recover}s. The {bell} and the cats around it dodge it {dodge}% of the time.
- `codex.cell.zap.name`
  - 전: Zap cell
  - 후: Zap tile
- `codex.cell.zap.text`
  - 전: A cell lightning struck. Like a wet cell, a cat there cannot attack. The {cloud} strikes a block of {side}×{side} cells every {every}s and it lasts {dur}s. The cells flash {warn}s before. A cat that is moved attacks again after {recover}s. The {bell} and the cats around it dodge it {dodge}% of the time.
  - 후: A tile that lightning struck. Like a wet tile, a cat there cannot attack. {cloud}: strikes a block of {side}×{side} tiles every {every}s, and each strike lasts {dur}s. The tiles flash {warn}s before. A cat that is moved attacks again after {recover}s. The {bell} and the cats around it dodge it {dodge}% of the time.
- `codex.cell.tower.text`
  - 전: The {cells} cells of the top row. With the {toy}, a cat standing here gets {range}% more range and {damage}% more damage.
  - 후: The {cells} tiles of the top row. With the {toy}, a cat standing here gets {range}% more range and {damage}% more damage.
- `codex.cell.perch.text`
  - 전: The {cells} cells that run round the edge of the board, next to the lane. With the {toy}, a cat standing here attacks {speed}% faster.
  - 후: The {cells} tiles that run round the edge of the board, next to the lane. With the {toy}, a cat standing here attacks {speed}% faster.
- `codex.cell.cushion.text`
  - 전: A cell with a cat of the same class standing on one of its {sides} sides. With the {toy}, that cat deals {damage}% more damage. A different class gets nothing.
  - 후: A tile with a cat of the same class standing on one of its {sides} sides. With the {toy}, that cat deals {damage}% more damage. A different class gets nothing.
- `codex.cell.bard.text`
  - 전: Cats on the {cells} cells around a {cat}, diagonals too, deal {damage}% more damage. It grows from level {level} up to {max}%. Of several bards only the strongest counts.
  - 후: Cats on the {cells} tiles around a {cat}, diagonals too, deal {damage}% more damage. It grows from level {level} up to {max}%. Of several bards only the strongest counts.
- `codex.cell.bell.text`
  - 전: Cats on the {cells} cells around a {cat} attack {speed}% faster. The bell cat and the cats around it dodge wet and zap cells {dodge}% of the time, rising to {dodgeMax}% from level {level}.
  - 후: Cats on the {cells} tiles around a {cat} attack {speed}% faster. The bell cat and the cats around it dodge wet and zap tiles {dodge}% of the time, rising to {dodgeMax}% from level {level}.
- `codex.cell.lane.text`
  - 전: Enemies come out of the entrance at the top left and walk clockwise round the board, lap after lap. A {cucumber} needs about {lap}s for a lap. The {ring} cells on the edge of the board touch the lane, so short-range cats fight from there. A mage cat's zone (blizzard, black hole, potion cloud) lands on the lane where the enemy it aimed at stands. You lose when more than {cap} enemies are on the lane for {grace}s; with a higher butler level it is {low}.
  - 후: Enemies come out of the entrance at the top left and walk clockwise round the board, lap after lap. A {cucumber} needs about {lap}s for a lap. The {ring} tiles on the edge of the board touch the lane, so short-range cats fight from there. A mage cat's zone (blizzard, black hole, potion cloud) lands on the lane where the enemy it aimed at stands. You lose when more than {cap} enemies are on the lane for {grace}s; with a higher butler level it is {low}.

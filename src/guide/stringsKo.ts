/**
 * The guide's words in Korean (primary, friendly 해요체). No digit is typed here: every number is a {placeholder}
 * that facts.ts fills from the game's data. A "title" is a few words, a "teach" is one or two short sentences for
 * the tutorial bubble, a "full" is the guidebook page (a line break starts a new paragraph or list line).
 */
export const KO: Record<string, string> = {
  // ── pieces of the screens ──
  'guide.title': '설명서',
  'guide.section.start': '기본',
  'guide.section.team': '고양이',
  'guide.section.field': '전장',
  'guide.section.foes': '적',
  'guide.section.home': '집',
  'guide.sectionLong.start': '시작하기',
  'guide.sectionLong.team': '고양이 꾸리기',
  'guide.sectionLong.field': '전장 규칙',
  'guide.sectionLong.foes': '적들',
  'guide.sectionLong.home': '집에서',
  'guide.new': '새 글',
  'guide.count': '{n}/{total}',
  'guide.unread': '안 읽은 글 {n}개',
  'guide.allRead': '다 읽었어요!',
  'guide.try.battle': '해 볼래요',
  'guide.try.home': '가 볼래요',
  'guide.next': '다음 글',
  'guide.prev': '이전 글',
  'guide.close': '닫기',
  'guide.list': '목록',
  'guide.settings.title': '설명서',
  'guide.settings.hint': '게임 규칙을 언제든 읽어요',
  'guide.replay.row': '튜토리얼 다시 하기',
  'guide.replay.title': '튜토리얼을 다시 할까요?',
  'guide.replay.body': '배운 내용 표시를 지우고 처음부터 다시 알려 줄게요. 설명서에서 읽은 표시는 그대로예요.',
  'guide.replay.yes': '다시 하기',
  'guide.replay.no': '취소',
  'guide.replay.busy': '진행 중인 판이 있어요. 먼저 마무리해요.',
  'guide.pause': '설명서',
  'guide.card.got': '알겠어요',
  'guide.card.more': '설명서에서 더 보기',
  'guide.ok': '알겠어요',
  'guide.skip': '건너뛰기',
  'guide.skip.title': '튜토리얼을 건너뛸까요?',
  'guide.skip.body': '설명은 멈추고 쉬운 판으로 계속해요. 모르는 건 설정의 설명서에서 읽어요.',
  'guide.skip.yes': '건너뛰기',
  'guide.skip.no': '계속할래요',
  'guide.skip.note': '설명서는 설정에 있어요. 일시정지에서도 열려요.',
  'guide.skip.start': '소환 버튼을 눌러 시작해요!',
  'guide.end.title': '튜토리얼 끝!',
  'guide.end.body': '모르는 게 생기면 설정의 설명서를 펼쳐요.',
  'guide.end.open': '설명서 열기',
  'guide.end.go': '결과 보기',
  'guide.tut.count': '({n}/{total})',
  'guide.tut.sheet': '내 등급과 시너지 단계가 여기 있어요. 다 봤으면 닫아요.',
  'guide.tut.pickRec': '테이프가 붙은 카드가 추천이에요.',
  'guide.cheer.0': '좋아요!',
  'guide.cheer.1': '잘했어요!',
  'guide.cheer.2': '최고예요!',
  'guide.cheer.3': '멋져요!',

  // ── 시작하기 ──
  'guide.summon.title': '생선과 소환',
  'guide.summon.teach': '생선으로 고양이를 불러요! 눌러 봐요.',
  'guide.summon.full':
    '소환 버튼을 누르면 생선을 내고 무작위 고양이가 와요. 한 판은 생선 {start}마리로 시작해요.\n첫 소환은 생선 {first}마리, 한 번 부를 때마다 {step}마리씩 비싸지고 {cap}마리에서 멈춰요. 소환 버튼을 꾹 누르고 있으면 계속 불러요.\n생선은 적을 쓰러뜨리거나 웨이브를 넘기면 늘어요. 싸우는 동안에는 가만히 있어도 초당 {rate}마리씩 들어와요. 칸이 가득 차면 더 부를 수 없으니 합치거나 팔아요.',

  'guide.summon_grade.title': '소환 등급과 확률',
  'guide.summon_grade.teach': '눌러서 등급을 올려요. 좋은 고양이가 더 잘 나와요.',
  'guide.summon_grade.full':
    '소환 등급을 올리면 같은 값으로 더 귀한 고양이가 나올 확률이 커져요. 등급은 {top}단계까지 있고, 올리는 값은 차례로 생선 {costs}마리예요.\n처음 등급의 확률은 {odds1}. 가장 높은 등급은 {oddsTop}이에요.\n동그란 % 버튼을 누르면 다음 소환의 진짜 확률을 볼 수 있어요.',

  'guide.pity.title': '천장(보너스 확률)',
  'guide.pity.teach': '운이 안 따르면 확률이 슬쩍 올라가요.',
  'guide.pity.full':
    '골목대장 이상이 {limit}번 연속으로 안 나오면, 그다음 소환부터 한 번마다 골목대장 이상이 나올 확률이 {step}%씩 올라요. 최대 {max}%까지예요.\n좋은 고양이가 나오면 다시 처음부터 세요. 보너스가 쌓이는 동안은 노란 칩이 나타나 얼마나 모였는지 보여 줘요.',

  'guide.merge.title': '합치기',
  'guide.merge.teach': '같은 고양이를 끌어 겹쳐요. 다음 등급이 돼요.',
  'guide.merge.full':
    '같은 고양이 두 마리를 끌어서 겹치면 한 마리가 돼요. 결과는 같은 직업의 다음 등급이에요. 예를 들어 {a} 둘이 합쳐지면 {b}이(가) 돼요.\n꼬마 → 동네 → 골목대장 → 대왕 순서로 합쳐요. 대왕은 합치지 않고 각성해요.\n끌고 있는 동안 합칠 수 있는 짝에는 표시가 나고, 결과가 어떤 고양이인지 미리 보여 줘요.',

  'guide.class_lines.title': '직업 줄(합성 계보)',
  'guide.class_lines.teach': '직업마다 합성 순서가 정해져 있어요.',
  'guide.class_lines.full':
    '합치면 언제나 같은 직업의 다음 칸으로 가요.\n전사: {warrior}\n사수: {ranger}\n마법: {mage}\n재주: {trickster}\n맨 끝 수호신은 합쳐서는 못 얻고, 대왕을 각성시켜야 해요. 줄을 바꾸고 싶으면 털갈이를 써요.',

  'guide.acts.title': '막과 웨이브',
  'guide.acts.teach': '웨이브 {actLen}개가 한 막이에요. 막이 끝나면 보상이 있어요.',
  'guide.acts.full':
    '적은 웨이브마다 새로 나와요. 웨이브 {actLen}개가 한 막이고, 한 챕터는 {acts}막 {waves}웨이브예요.\n막이 끝나면 생선과 골골을 받고 장난감을 하나 골라요. 특수 칸도 새 자리로 옮겨 가요.\n위쪽 카드는 다음 웨이브에 나올 적이에요. 눌러서 능력을 알아봐요.',

  'guide.lose_gauge.title': '지는 때 ① 적이 너무 많을 때',
  'guide.lose_gauge.teach': '이 막대가 차면 져요. 적을 줄여요!',
  'guide.lose_gauge.full':
    '위쪽 막대는 지금 길 위에 있는 적의 수예요. {cap}마리를 넘으면 "넘쳤어요!" 카운트가 시작돼요.\n그 카운트가 {grace}초 끝날 때까지 적을 한도 아래로 줄이지 못하면 져요. 줄이면 바로 멈춰요.\n막대는 {caution}마리부터 노랗게, {alarm}마리부터 붉게 바뀌어요. 붉어지면 약한 적을 쓸어내거나 레이저를 써요.',

  'guide.lose_boss.title': '지는 때 ② 보스 제한 시간',
  'guide.lose_boss.teach': '정예와 보스는 시간 안에 쓰러뜨려야 해요.',
  'guide.lose_boss.full':
    '정예와 보스 웨이브에는 제한 시간이 있어요. 위쪽 막대가 그 시간이에요.\n정예는 차례로 {elite}초, 보스는 {boss}초예요. 시간이 다 되면 적이 얼마나 남았든 져요.\n보스 막대의 "예상" 표시가 이길 수 있을지 알려 줘요. 모자라면 레이저와 시너지를 모아요.',

  'guide.continue.title': '이어하기',
  'guide.continue.teach': '졌어도 한 번은 이어서 할 수 있어요.',
  'guide.continue.full':
    '웨이브를 {minWave}개 넘긴 뒤에 지면 한 번 이어하기를 권해요. 광고를 보거나 보석 {gems}개를 내요.\n적이 많아서 졌다면 적이 한도의 {cap}%로 줄고 잠깐 안전해요. 보스 때문에 졌다면 보스 체력이 {hp}% 줄고 시간이 {time}초 늘어요.\n한 판에 한 번뿐이고, 일일 도전에서는 쓸 수 없어요.',

  // ── 고양이 꾸리기 ──
  'guide.classes.title': '직업의 종류',
  'guide.classes.teach': '직업 칩을 눌러 봐요. 직업마다 역할이 달라요.',
  'guide.classes.full':
    '{warrior}: {warriorRole}\n{ranger}: {rangerRole}\n{mage}: {mageRole}\n{trickster}: {tricksterRole}\n아래 직업 칩에는 가진 등급과 시너지 단계가 보여요.',

  'guide.synergy.title': '시너지',
  'guide.synergy.teach': '같은 직업의 다른 고양이가 모일수록 강해져요. {kitten}는 세지 않아요.',
  'guide.synergy.full':
    '같은 직업의 서로 다른 고양이가 {a}종, {b}종, {c}종 모이면 시너지가 단계별로 켜져요. {kitten}는 종류에 세지 않고, 같은 고양이 여러 마리는 한 종이에요. 그래서 {c}종은 {guardian}까지 있어야 켜져요.\n직업 피해 보너스는 그 직업 고양이만 받고, 방어 무시·치명타·상태 이상 지속처럼 곁들여 붙는 효과는 모든 고양이가 받아요.\n전사: {warrior}\n사수: {ranger}\n마법: {mage}\n재주: {trickster}\n(위 줄은 각각 첫째, 둘째, 셋째 단계의 보너스예요.)\n{c}종이 되면 직업마다 특수 능력이 하나 더 켜져요.\n{warriorAbility}\n{rangerAbility}\n{mageAbility}\n{tricksterAbility}',

  'guide.class_sheet.title': '직업 표',
  'guide.class_sheet.teach': '직업 칩을 누르면 그 직업의 모든 것이 보여요.',
  'guide.class_sheet.full':
    '직업 칩을 누르면 그 직업의 합성 줄이 펼쳐져요. 가진 등급은 사진으로 밝게, 없는 등급은 점선 칸으로 보여요. 칩의 작은 점은 시너지에 세는 등급이라서 {kitten}의 점은 켜지지 않아요.\n화살표는 합성이나 각성이 가능할 때 직업 색으로 변해요.\n그 아래에는 다음 시너지까지 몇 종이 모자란지, 단계별 보너스({a}종부터 {c}종까지)와 {c}종에서 켜지는 특수 능력이 나와요.',

  'guide.class_upgrade.title': '직업 강화',
  'guide.class_upgrade.teach': '직업 칩을 눌러 강화해요. 직업 전체가 세져요.',
  'guide.class_upgrade.full':
    '직업 표의 강화 버튼으로 그 직업 고양이 모두의 피해를 키워요. 한 단계마다 {bonus}% 세져요.\n단계는 {max}번까지 올릴 수 있고 값은 차례로 생선 {costs}마리예요. 그 직업을 많이 모았을 때 쓰면 이득이에요.',

  'guide.pick3.title': '셋 중 고르기',
  'guide.pick3.teach': '소환 {every}번마다 세 마리 중 하나를 골라요.',
  'guide.pick3.full':
    '소환을 {every}번 할 때마다 고양이 {options}마리가 보이고 그중 하나를 골라요. 꼬마는 나오지 않아요.\n카드 아래에 합치면 어떤 고양이가 되는지 적혀 있어요. 가진 직업의 새 종류를 고르면 시너지에 가까워져요.\n아래 발바닥 표시는 다음 선택까지 몇 번 남았는지 보여 줘요.',

  'guide.purr.title': '골골',
  'guide.purr.teach': '골골은 털갈이와 각성에 쓰는 귀한 재료예요.',
  'guide.purr.full':
    '골골은 고양이가 기분 좋을 때 내는 소리를 모은 재료예요. 털갈이와 각성에 써요.\n정예를 쓰러뜨리면 {elite}개, 보스를 쓰러뜨리면 {boss}개, 막을 넘길 때마다 {act}개를 받아요. 팔면 골목대장부터 골골이 조금 돌아와요.\n털갈이는 등급마다 달라요({molt}). 각성은 {awaken}개가 들어요.',

  'guide.molt.title': '털갈이',
  'guide.molt.teach': '고양이를 눌러 털갈이로 다른 직업이 돼요.',
  'guide.molt.full':
    '고양이를 눌러 고른 뒤 털갈이 버튼을 누르고 직업을 골라요. 등급은 그대로, 직업만 바뀌어요.\n골골은 고양이의 등급이 높을수록 더 들어요({prices}). 한 판에 {limit}번까지고, 수호신은 털갈이를 할 수 없어요. 짝이 하나 모자랄 때, 시너지에 한 종이 모자랄 때 쓰면 좋아요.',

  'guide.awaken.title': '각성과 수호신',
  'guide.awaken.teach': '대왕이 골골을 모으면 수호신이 돼요.',
  'guide.awaken.full':
    '대왕은 더 합칠 수 없어요. 대신 직업 시너지가 {tier}단계({kinds}종) 이상일 때 골골 {cost}개를 내면 같은 직업의 수호신으로 각성해요.\n수호신은 가장 강한 고양이예요. 대왕을 누르면 조건이 두 줄로 나오고, 채운 조건에는 체크가 붙어요.',

  'guide.sell.title': '팔기',
  'guide.sell.teach': '고양이를 눌러 팔면 칸과 생선을 얻어요.',
  'guide.sell.full':
    '고양이를 눌러 팔기 버튼을 누르거나, 아래 팔기 띠로 끌어다 놓으면 생선을 돌려받아요.\n꼬마 {f1} · 동네 {f2} · 골목대장 {f3} · 대왕 {f4} · 수호신 {f5}마리예요. 골목대장부터는 골골도 차례로 {purr}개 돌려줘요.\n칸이 가득 찼을 때 약한 고양이를 팔면 새 고양이를 들일 수 있어요.',

  'guide.move_swap.title': '옮기기와 바꾸기',
  'guide.move_swap.teach': '끌어서 빈 칸으로 옮기고, 다른 고양이와 자리를 바꿔요.',
  'guide.move_swap.full':
    '고양이를 끌어서 빈 칸에 놓으면 옮겨요. 다른 고양이 위에 놓으면 자리를 바꾸고, 같은 고양이 위에 놓으면 합쳐요.\n고양이를 눌러서 고른 뒤 빈 칸이나 짝을 눌러도 돼요. 햇살 칸이나 바깥 줄처럼 좋은 자리로 옮겨 주면 이득이에요.',

  // ── 전장 규칙 ──
  'guide.sun.title': '특수 칸',
  'guide.sun.teach': '{cell}에 고양이를 끌어 놓아요. 효과를 받아요!',
  'guide.sun.full':
    '챕터마다 다른 특수 칸이 {cells}칸 있어요. 거기 선 고양이는 그 칸의 효과를 받아요.\n{kinds}\n특수 칸은 막이 끝날 때마다 새 자리로 옮겨 가요. 센 고양이를 옮겨 주면 이득이에요. 빈 특수 칸을 누르면 설명이 나오고, 칸에 선 고양이에게는 그 칸의 마크가 붙어요.',

  'guide.hazards.title': '칸 위험',
  'guide.hazards.teach': '물이 튀거나 번개가 치는 칸에서는 공격하지 못해요.',
  'guide.hazards.full':
    '일부 적과 보스는 칸에 물웅덩이나 번개를 일으켜요. 그 칸의 고양이는 효과가 끝날 때까지 공격하지 못해요.\n물은 {wet}초, 번개는 {zap}초 이어져요. 위험한 칸은 {warn}초 먼저 반짝여서 알려 줘요. 그동안 고양이를 다른 칸으로 옮겨요.\n방울 고양이와 그 둘레 한 칸 안의 고양이는 물과 번개를 가끔 피해요.',

  'guide.laser.title': '레이저 포인터',
  'guide.laser.teach': '점을 찍으면 근처 적부터 공격해요. 보스·정예에는 점이 붙어요.',
  'guide.laser.full':
    '레이저 버튼을 누르고 길 위를 눌러 빨간 점을 찍어요. {dur}초 동안 고양이들이 점에서 가장 가까운 적부터 공격해요. 점 안에 정예나 보스가 있으면 그 적을 가장 먼저 노려요.\n점을 정예나 보스 가까이에 찍으면 점이 그 적에게 철컥 붙어서, 걸어가도 따라가요. 빨간 고리가 그 적을 감싸고, 닿는 고양이는 그 적부터 공격해요. 점을 다른 곳으로 옮기면 풀려요.\n점 근처의 표시된 적은 받는 피해가 {vuln}% 늘어요. 쓰고 나면 {cd}초 뒤에 다시 쓸 수 있어요.\n보스나 위험한 적을 먼저 잡을 때 써요. 버튼 옆 i 표시로 자세한 설명 카드를 다시 볼 수 있어요.',

  'guide.call_wave.title': '다음 웨이브 부르기',
  'guide.call_wave.teach': '미리 불러서 생선 보너스를 받아요. 눌러 봐요!',
  'guide.call_wave.full':
    '웨이브의 적이 모두 나온 뒤에는 초록색 버튼이 나타나요. 누르면 남은 시간을 건너뛰고 바로 다음 웨이브가 와요.\n남은 시간에 비례해 초당 생선 {rate}마리씩, 최대 {max}마리를 보너스로 받아요. 적이 아직 많이 남았다면 누르지 않는 게 안전해요.',

  'guide.speed.title': '배속',
  'guide.speed.teach': '누를 때마다 게임이 빨라져요. 눌러 봐요!',
  'guide.speed.full':
    '오른쪽 위 버튼으로 속도를 바꿔요. 누를 때마다 기본 속도와 {fast}배속을 오가요. {faster}배속은 집사 패스가 있을 때 열려요.\n어려운 웨이브에서는 기본 속도로 돌려서 침착하게 해요.',

  'guide.preview.title': '다음 웨이브 미리보기',
  'guide.preview.teach': '위쪽 카드는 다음에 올 적이에요. 눌러서 알아봐요.',
  'guide.preview.full':
    '위쪽 줄의 작은 카드는 다음 웨이브에 나올 적이에요. 카드 아래 ×숫자는 마릿수이고, 붉은 카드는 정예나 보스예요.\n카드를 누르면 그 적의 능력이 나와요. 미리 보고 어떤 직업이 필요한지 정해요.',

  'guide.toys.title': '장난감',
  'guide.toys.teach': '장난감을 하나 골라요. 판 내내 도와줘요.',
  'guide.toys.full':
    '막이 끝날 때마다 장난감 {options}개가 나타나고 하나를 골라요. 고른 장난감은 위쪽 줄에 모여 이번 판 내내 도와줘요.\n장난감도 고양이처럼 등급이 있어요. 이른 막에는 {early}, 중간 막에는 {mid}, 뒷막에는 {late} 비율로 나와요.\n다음 막의 적에게 맞는 장난감이 하나쯤은 끼어 있어요. 위쪽 줄의 장난감을 누르면 효과를 다시 볼 수 있어요.',

  'guide.toy_reroll.title': '장난감 다시 뽑기',
  'guide.toy_reroll.teach': '마음에 안 들면 장난감을 다시 뽑을 수 있어요.',
  'guide.toy_reroll.full':
    '장난감 화면의 다시 뽑기 버튼을 누르면 다른 장난감으로 바뀌어요. 한 판에 공짜는 {free}번이에요.\n공짜를 썼다면 광고를 보거나 보석 {gems}개를 내고 한 번 더 뽑을 수 있어요.',

  'guide.stakes.title': '집사 단계',
  'guide.stakes.teach': '챕터를 깨면 더 어려운 단계가 열려요.',
  'guide.stakes.full':
    '챕터를 깨면 다음 집사 단계가 열려요. 단계가 오를수록 규칙이 하나씩 쌓이고(맨 위는 {max}단계), 보상이 단계마다 {reward}%씩 늘어요.\n첫째: {s1}\n둘째: {s2}\n셋째: {s3}\n넷째: {s4}\n다섯째: {s5}\n높은 단계는 낮은 단계의 규칙도 모두 포함해요.',

  // ── 적 ──
  'guide.elite.title': '정예',
  'guide.elite.teach': '정예는 센 적이에요. 시간 안에 쓰러뜨려요!',
  'guide.elite.full':
    '{first}번째 웨이브에 첫 정예가 오고, 그다음부터는 {gap}웨이브마다 와요. 호위하는 작은 적과 함께 와요.\n제한 시간 안에 쓰러뜨려야 해요(첫 정예는 {time}초). 쓰러뜨리면 생선 {fish}마리와 골골 {purr}개를 줘요.\n대왕 오이는 체력이 반 아래로 내려가면 화가 나서 최대 {rage}%까지 빨라져요.',

  'guide.boss.title': '보스',
  'guide.boss.teach': '보스예요! 시간 안에 쓰러뜨려요.',
  'guide.boss.full':
    '{first}번째 웨이브에 첫 보스가 오고, 그다음부터는 {gap}웨이브마다 와요. 챕터마다 보스의 특기가 달라요.\n제한 시간은 {time}초부터예요. 쓰러뜨리면 생선 {fish}마리와 골골 {purr}개를 줘요.\n보스가 나타나면 이름과 특기가 배너로 나와요. 보스 막대에는 남은 시간과 예상이 보여요.',

  'guide.boss_vacuum.title': '보스: {name}',
  'guide.boss_vacuum.teach': '{name}은(는) 숨을 들이마셔 고양이들을 약하게 해요.',
  'guide.boss_vacuum.full':
    '{every}초마다 {dur}초 동안 숨을 들이마셔요. 그동안 고양이들의 공격이 느려지고, 보스는 받는 피해가 {taken}% 줄어요.\n들이마시는 동안은 무리해서 때리지 말고 힘을 아껴 두었다가 끝난 뒤에 몰아쳐요.',

  'guide.boss_blender.title': '보스: {name}',
  'guide.boss_blender.teach': '{name}은(는) 모든 적을 한꺼번에 빠르게 해요.',
  'guide.boss_blender.full':
    '{every}초마다 {dur}초 동안 회오리를 일으켜 길 위의 모든 적이 {speed}% 빨라져요.\n그 시간에는 적이 한꺼번에 밀려와요. 느리게 하는 마법과 넓게 때리는 공격으로 버텨요.',

  'guide.boss_bath.title': '보스: {name}',
  'guide.boss_bath.teach': '{name}은(는) 칸을 물에 잠기게 해요.',
  'guide.boss_bath.full':
    '{every}초마다 물방울 {count}마리를 내보내고, {soak}초마다 {cells}칸을 {dur}초 동안 물에 잠기게 해요. 잠긴 칸의 고양이는 공격하지 못해요.\n반짝이는 칸은 곧 잠긴다는 신호예요. 중요한 고양이를 미리 옮겨요.',

  'guide.boss_cloud.title': '보스: {name}',
  'guide.boss_cloud.teach': '{name}은(는) 번개로 칸을 막아요.',
  'guide.boss_cloud.full':
    '{every}초마다 네 칸 묶음에 번개를 쳐요. 맞은 칸의 고양이는 {dur}초 동안 공격하지 못해요.\n번개 자리는 먼저 반짝여요. 그 칸에서 센 고양이를 비켜 세워요.',

  'guide.boss_needle.title': '보스: {name}',
  'guide.boss_needle.teach': '{name}은(는) 적을 단단하게 하고 스스로 회복해요.',
  'guide.boss_needle.full':
    '{every}초마다 {dur}초 동안 적들이 느려지는 효과를 무시하고, 보스는 초당 체력이 {heal}%씩 회복돼요.\n그 시간에는 느리게 하는 공격이 소용없어요. 센 한 방이나 레이저로 몰아쳐요.',

  'guide.trait_armored.title': '{name} 적',
  'guide.trait_armored.teach': '물리 피해를 덜 받아요. 마법이 잘 통해요.',
  'guide.trait_armored.full':
    '단단한 껍데기라 물리 피해를 {armor}% 덜 받아요. 느리고 체력이 많아요.\n마법 고양이가 좋아요. 방어 깎기와 방어 무시(전사 시너지)도 잘 통해요.',

  'guide.trait_warded.title': '{name} 적',
  'guide.trait_warded.teach': '마법 피해를 덜 받아요. 전사와 사수가 좋아요.',
  'guide.trait_warded.full':
    '결계로 감싸여 마법 피해를 {ward}% 덜 받아요.\n이런 적에게는 전사와 사수의 물리 공격이 잘 들어요. 방어 깎기와 방어 무시는 마법 저항도 함께 줄여요.',

  'guide.trait_fast.title': '{name} 적',
  'guide.trait_fast.teach': '다른 적보다 훨씬 빨리 달려요.',
  'guide.trait_fast.full':
    '이동 속도가 {speed}이고 보통 적은 {normal}이에요. 체력은 적지만 금방 끝까지 가요.\n느리게 하는 공격과 멀리 닿는 고양이가 좋아요. 일부 적은 느려지는 효과를 조금 버티는데, 그 수치는 도감에서 볼 수 있어요.',

  'guide.trait_swarm.title': '{name} 적',
  'guide.trait_swarm.teach': '약하지만 떼로 몰려와요.',
  'guide.trait_swarm.full':
    '체력이 보통의 {hp}%뿐인 작은 적이 한꺼번에 몰려와요. 적의 수 막대를 빨리 채우니 조심해요.\n한 번에 여럿을 맞히는 넓은 공격이 좋아요.',

  'guide.trait_split.title': '{name} 적',
  'guide.trait_split.teach': '쓰러지면 작은 적으로 나뉘어요.',
  'guide.trait_split.full':
    '쓰러지면 작은 적 {count}마리로 나뉘어요. 작은 적도 마저 잡아야 해요.\n나뉜 뒤에는 수가 늘어나니 넓게 맞히는 공격이 좋아요.',

  'guide.trait_haste_aura.title': '{name} 적',
  'guide.trait_haste_aura.teach': '주변 적을 빠르게 해요. 먼저 쓰러뜨려요.',
  'guide.trait_haste_aura.full':
    '가까이 있는 적의 이동 속도를 {haste}% 올려요. 이 적이 무리 속에 있으면 모두가 빨라져요.\n레이저로 먼저 표시해서 쓰러뜨려요.',

  'guide.trait_heal_aura.title': '{name} 적',
  'guide.trait_heal_aura.teach': '주변 적을 치료해요. 먼저 쓰러뜨려요.',
  'guide.trait_heal_aura.full':
    '가까이 있는 적의 체력을 초당 {heal}%씩 채워 줘요. 느려지는 것도 막아요.\n이 적부터 쓰러뜨리지 않으면 다른 적이 좀처럼 줄지 않아요.',

  'guide.trait_shield.title': '{name} 적',
  'guide.trait_shield.teach': '보호막이 피해를 대신 받아요.',
  'guide.trait_shield.full':
    '최대 체력의 {shield}%만큼 보호막이 있어서 먼저 이 막이 피해를 받아요. 막이 깨져야 몸에 피해가 들어가요.\n한 방이 센 공격이 좋아요.',

  'guide.trait_weaken.title': '{name} 적',
  'guide.trait_weaken.teach': '가장 센 고양이의 공격을 느리게 해요.',
  'guide.trait_weaken.full':
    '{every}초마다 가장 센 고양이의 공격을 {dur}초 동안 절반으로 느리게 해요.\n센 고양이 하나에만 기대지 말고 힘을 여럿에게 나눠요.',

  // ── 집에서 ──
  'guide.cards.title': '고양이 카드와 레벨',
  'guide.cards.teach': '카드를 모으면 고양이가 강해져요.',
  'guide.cards.full':
    '고양이 카드를 모으면 레벨이 올라요. 레벨이 하나 오를 때마다 그 고양이의 피해가 {dmg}% 늘고, 최고 {max}레벨까지 키울 수 있어요.\n레벨을 올리는 데는 카드와 골드가 들어요. 첫 레벨업은 카드 {first}장, 마지막은 {last}장이 기본이고, 귀한 고양이일수록 적게 들어요.\n고양이 탭에서 키우고 싶은 고양이를 눌러요.',

  'guide.wild_cards.title': '만능 카드',
  'guide.wild_cards.teach': '어느 고양이에게나 쓸 수 있는 카드예요.',
  'guide.wild_cards.full':
    '만능 카드는 같은 등급의 어느 고양이에게나 쓸 수 있는 카드예요. 상자에서 나오는 카드의 {share}%가 만능이에요.\n갖고 싶은 고양이의 레벨을 올릴 때 모자란 카드를 이걸로 채워요.',

  'guide.chests.title': '상자와 확률',
  'guide.chests.teach': '상자에서 고양이 카드가 나와요. 확률은 다 공개해요.',
  'guide.chests.full':
    '나무 상자는 카드 {woodCards}장, 은 상자는 {silverCards}장, 금 상자는 {goldCards}장이 나와요.\n카드 한 장마다 나무: {wood}\n은: {silver}\n금: {gold}\n은 상자에는 골목대장 이상이 최소 {silverGuarantee}장, 금 상자에는 대왕이 최소 {goldGuarantee}장 들어 있어요.\n금 상자를 {every}번째 열 때마다 가장 레벨이 낮은 대왕 카드가 {bonus}장 더 들어요(천장). 상자 화면의 % 버튼으로 언제든 확인해요. 은 상자는 보석 {silverGems}개, 금 상자는 {goldGems}개예요.',

  'guide.free_chest.title': '무료 상자',
  'guide.free_chest.teach': '시간이 지나면 무료 상자가 쌓여요.',
  'guide.free_chest.full':
    '{hours}시간마다 무료 나무 상자가 쌓여요. 상점에서 받아 가요.\n기다리기 싫으면 광고를 보거나 보석 {skip}개로 바로 열 수 있어요.',

  'guide.missions.title': '미션',
  'guide.missions.teach': '미션을 채우면 골드와 점수를 받아요.',
  'guide.missions.full':
    '하루 미션이 {daily}개, 주간 미션이 {weekly}개 있어요. 판을 하고, 합치고, 보스를 잡으면 저절로 채워져요. 예를 들어 하루에 {runs}판을 하면 보상이 있어요.\n하루 미션을 채우면 점수가 쌓이고, 점수가 차면 오늘의 상자를 열어요.',

  'guide.daily_chest.title': '오늘의 상자',
  'guide.daily_chest.teach': '미션 점수를 모으면 오늘의 상자가 열려요.',
  'guide.daily_chest.full':
    '하루 미션마다 점수가 있고, {points}점을 모으면 은 상자와 보석 {gems}개를 받아요.\n하루가 지나면 점수는 처음부터 다시 쌓여요.',

  'guide.calendar.title': '출석 달력',
  'guide.calendar.teach': '매일 들어오면 달력에서 선물을 받아요.',
  'guide.calendar.full':
    '{days}일짜리 달력이에요. 들어오는 날마다 한 칸씩 선물을 받아요.\n{gold}일째에는 금 상자가, 마지막 날에는 꾸미기 매트가 기다려요. 홈 화면의 달력에서 받아요.',

  'guide.pass.title': '시즌 패스',
  'guide.pass.teach': '경험치를 모으면 단계마다 보상이 나와요.',
  'guide.pass.full':
    '시즌은 {days}일이고 보상 단계는 {tiers}개예요. 경험치 {xp}을(를) 모으면 한 단계가 올라가요. 판을 마칠 때마다 경험치가 쌓여요.\n무료 줄은 누구나 받고, 프리미엄 줄은 보석과 상자를 더 줘요. 첫 판을 마치면 열려요.',

  'guide.patrol.title': '순찰',
  'guide.patrol.teach': '고양이들이 순찰하며 골드를 모아 와요.',
  'guide.patrol.full':
    '앱을 닫아도 고양이들이 순찰하며 한 시간에 골드 {gold}씩 모아 와요. 최대 {cap}시간까지 쌓이고, 패스가 있으면 {capPass}시간까지예요.\n{min}분 넘게 쌓였을 때부터 받을 수 있어요. 광고를 보면 두 배로 받아요.',

  'guide.sweep.title': '소탕',
  'guide.sweep.teach': '깬 챕터는 소탕권으로 바로 보상을 받아요.',
  'guide.sweep.full':
    '한 번 클리어한 챕터는 소탕권을 써서 판을 하지 않고도 보상을 받아요. 보상은 직접 이겼을 때의 {pay}%예요.\n소탕권은 하루 {tickets}장씩 쌓이고 {stock}장까지 모아 둘 수 있어요.',

  'guide.daily_challenge.title': '일일 도전',
  'guide.daily_challenge.teach': '매일 바뀌는 규칙으로 한 판 도전해요.',
  'guide.daily_challenge.full':
    '하루에 한 번, 모두에게 같은 판이 열려요. {waves}웨이브 동안 버티는 짧은 도전이에요.\n모든 고양이가 {level}레벨로 시작하고, 규칙이 {rules}가지 중에서 섞여 나와요. 챕터를 하나 깨면 열려요.\n처음 깨면 은 상자를 {chest}개 받아요.',

  'guide.weekly_cup.title': '주간 컵',
  'guide.weekly_cup.teach': '한 주의 일일 도전 점수를 모아 상을 받아요.',
  'guide.weekly_cup.full':
    '한 주 동안 일일 도전에서 거둔 웨이브 수를 더해요. 날마다 끝까지 가면 최고 {best}점이에요.\n{t1}점, {t2}점, {t3}점에 닿을 때마다 더 좋은 상자를 받아요.',

  'guide.gold_dungeon.title': '골드 던전',
  'guide.gold_dungeon.teach': '하루 두 번, 짧은 판으로 골드를 모아요.',
  'guide.gold_dungeon.full':
    '{waves}웨이브를 버티는 짧은 판이에요. 보스는 없고, 넘긴 웨이브와 처치한 적의 수만큼 골드를 받아요.\n끝까지 막으면 골드가 {win}배가 되고, 그날의 첫 클리어에는 골드가 더 붙어요. 하루에 {free}번은 공짜이고, 한 번 더는 광고나 보석 {gems}개로 들어가요.\n단계는 깬 챕터만큼 열리고, 높을수록 골드를 더 줘요.',

  'guide.endless.title': '끝없는 모드',
  'guide.endless.teach': '끝이 없는 웨이브를 얼마나 버티는지 겨뤄요.',
  'guide.endless.full':
    '{chapter}챕터를 깨면 열려요. 웨이브가 끝없이 이어지고 적은 웨이브마다 {growth}%씩 단단해져요.\n{w1}, {w2}, {w3}웨이브에 닿으면 보상을 받아요.',

  'guide.backup_code.title': '냥이 코드(백업)',
  'guide.backup_code.teach': '코드 한 줄로 진행 상황을 옮길 수 있어요.',
  'guide.backup_code.full':
    '설정에서 냥이 코드를 만들면 지금까지의 진행 상황이 글자 한 줄이 돼요. 메모해 두었다가 다른 기기에서 불러오면 이어서 할 수 있어요.\n코드는 서버에 저장되지 않아요. 기기를 바꾸기 전에 꼭 새로 만들어 두고, 남에게 보여 주지 마세요.',
};

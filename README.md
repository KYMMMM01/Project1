# 집사 없는 날: 냥이 수비대 (Meow Guard)

집사가 집을 비운 사이, 고양이들이 오이·로봇청소기·목욕 같은 "고양이가 싫어하는 것들"로부터 집을 지키는 세로형 싱글플레이 합성 디펜스입니다. 고양이를 소환하고, 같은 고양이 둘을 끌어다 합쳐 같은 직업의 다음 등급으로 키웁니다.

- 플레이(테스트 빌드): https://kymmmm01.github.io/Project1/
- 기술: TypeScript 7 · PixiJS 8 · Vite 8 · Vitest 5. 사운드는 WebAudio로 실시간 합성하고(오디오 파일 없음), UI는 전부 코드로 그립니다.
- 화면: 세로 720 × 1280~1600 기준. 모바일 웹과 웹 포털, 앱 인 토스, Capacitor 포장을 염두에 두었습니다.

## 게임 한눈에

- 보드 5 × 4, 한 칸에 한 마리. 적은 보드 둘레를 돌고, 필드의 적 수가 한도를 넘거나 보스를 제한 시간 안에 못 잡으면 집니다.
- 직업 4종(전사·사수·마법·재주) × 등급 5단계 = 고양이 20종, 종마다 다른 품종. 합성 결과는 항상 같은 직업의 다음 등급이라 빌드를 계획할 수 있습니다. 최고 등급(수호신)은 각성으로만 얻습니다.
- 시너지는 한 직업의 "서로 다른 고양이 종류 수"(2 / 3 / 4종)로 올라갑니다.
- 한 판은 24웨이브(6막), 막마다 장난감(유물) 3택, 햇살 칸·위험 칸·레이저 포인터 같은 판 위의 변수.
- 판 밖: 유닛 카드 레벨, 상자(확률·천장 공개), 미션, 28일 출석, 시즌 패스, 순찰, 소탕, 일일 도전과 주간 컵, 집사 난이도 0~5단계.
- 수익화: 보상형 광고(항상 보석 대체 경로 제공)와 인앱 결제 11종. 유닛 뽑기는 없습니다.

기획 의도와 수치는 `docs/기획서_GDD.md`, 전투 규칙의 원본은 `docs/명세_전투규칙.md`, 메타 규칙은 `docs/명세_메타.md`에 있습니다.

## 실행

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 타입 검사 후 dist/ 생성
npm test           # 단위 테스트
npm run sim        # 밸런스 봇 리포트(승률·웨이브 곡선)
```

개발 서버(또는 주소에 `?debug=1`을 붙인 빌드)에서는 디버그 경로를 쓸 수 있습니다.

| 주소 | 용도 |
|---|---|
| `?scene=home&tab=shop\|cats\|battle\|missions\|pass` | 튜토리얼 없이 홈의 해당 탭으로 |
| `?scene=battle&chapter=1&stake=0&seed=7&sandbox=1&runs=5` | 전투 바로 열기(`mode=tutorial\|daily\|endless`) |
| `?demo=ui\|fx\|audio` | UI 키트·이펙트·사운드 갤러리 |
| `?fresh=1` | 새 프로필로 시작 |
| `&lang=ko\|en` | 언어 지정 |

## 채널별 빌드

`VITE_PLATFORM`으로 광고·결제·저장 어댑터를 고릅니다. 값이 없으면 `dev`(모의 광고·모의 결제)입니다.

```bash
VITE_PLATFORM=crazygames npm run build   # itch | crazygames | poki | gd | yt | toss | capacitor
```

출시용 빌드에는 개인정보 처리방침 등 운영 주소를 환경 변수로 넣습니다(없으면 설정 화면에 해당 줄이 나오지 않습니다).

```bash
VITE_PRIVACY_URL=https://... VITE_TERMS_URL=https://... VITE_SUPPORT_URL=https://... npm run build
```

테스트 빌드를 GitHub Pages(`gh-pages` 브랜치)에 올리려면:

```bash
bash tools/deploy_pages.sh
```

## 구조

| 경로 | 내용 |
|---|---|
| `src/core` | 앱 셸(화면 맞춤·일시정지), 트윈, 씬 전환, 저장, 다국어, 에셋 로더 |
| `src/game` | 전투 계약(`api.ts`)과 결정적 시뮬레이션, 데이터 표, 밸런스 봇 |
| `src/meta` | 프로필·경제·상자·미션·패스·상점 등 판 밖 규칙 |
| `src/platform` | 광고·결제·수명주기·저장·분석 추상화와 채널 어댑터 |
| `src/audio` | WebAudio 합성 효과음·음악 |
| `src/fx` | 파티클·피해 숫자·컷인 |
| `src/ui` | 종이 스크랩북 스타일 UI 키트 |
| `src/view`, `src/scenes` | 전투 화면(전장·연출·HUD) |
| `src/screens`, `src/app` | 홈과 탭 화면, 부팅·화면 흐름 |
| `docs/handoff` | 모듈별 인계서(소비자 API, 검증 내용) |
| `docs/진행상황.md` | 현재 상태와 남은 일 |

## 아트 파이프라인

그림은 이미지 생성 모델로 만들고 사람이 검수했습니다. 유닛 명단과 프롬프트는 코드로 관리합니다.

```bash
python art/build_units_v2.py            # 유닛 20종 프롬프트 → art/units_v2/jobs.json (--table: 명단 표)
python tools/gen_image.py --batch art/units_v2/jobs.json --out-dir art/units_v2 --parallel 3
python tools/lineage_sheet.py           # 직업 줄 검토 시트
python tools/process_art.py             # art/raw/*.png → src/assets/img/*.webp
```

화풍 규칙: 굵은 진갈색 외곽선과 흰 스티커 테두리, 무광 평면 채색, 점 눈과 눈썹. 직업마다 옷 색(전사 빨강·사수 초록·마법 파랑·재주 노랑)과 물려받는 소품(빨간 스카프·초록 깃털·별 장식·금방울)이 있고, 등급 사다리(장난감 장비 → 실전 장비 → 짧은 망토 → 금테 긴 망토 → 후광)는 전 직업 공통입니다.

## 출시 전에 저장소 밖에서 할 일

- 각 채널의 실제 광고·결제 SDK 키 연결과 실기기 검증(현재 어댑터는 문서 기준 구현이며 실 SDK로 검증하지 않았습니다).
- 개인정보 처리방침·이용약관 게시, 확률 공시 문구의 법률 검토, 상표 조사.
- 휴대폰 실기 테스트(터치·성능·사운드), 스토어·포털 등록 자료.

## 사용한 것

- [PixiJS](https://pixijs.com/) (MIT)
- 글꼴: Jua, Lilita One (SIL Open Font License) — 게임에 쓰는 글자만 추려 `public/fonts`에 담습니다(`npm run font`).

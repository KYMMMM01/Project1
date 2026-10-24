# 개인 PC에서 이어서 작업하기

2026-10-24 기준. 코드·문서·그림·소리 원본은 모두 GitHub 저장소에 있다(`https://github.com/KYMMMM01/Project1`, 브랜치 `main`). 저장소에 없는 것(Claude Code 메모, 사용자 소유 BGM)은 따로 묶은 인계 파일에 있다(아래 "저장소에 없는 것").

## 1. 준비물

| 이름 | 용도 | 비고 |
|---|---|---|
| Git | 받기·올리기 | GitHub 로그인(Git Credential Manager 또는 `gh auth login`)이 있어야 배포·push가 된다 |
| Node.js 24 | 개발 서버·빌드·테스트 | 이 PC는 v24.16.0 / npm 11.13.0. 20 이상이면 대체로 된다 |
| Python 3.12 + Pillow | 그림 처리(`tools/process_art.py`, 비교 시트) | `pip install pillow` |
| Codex CLI (선택) | 그림 생성(`tools/gen_image.py`가 `codex exec`로 이미지를 만든다) | 그림을 새로 뽑을 때만 |
| Microsoft Edge (선택) | 헤드리스 화면 확인(`tools/edge`), 패치 영상 | Windows에 기본으로 있다 |
| Claude Code (선택) | 지금까지처럼 AI와 이어서 작업 | 아래 5번 |

## 2. 받고 설치하기

같은 경로(`C:\MyProject\Project1`)로 받는 것을 권한다. Claude Code의 메모 폴더 이름이 프로젝트 경로로 정해지기 때문이다(5번).

```bash
git clone https://github.com/KYMMMM01/Project1.git C:/MyProject/Project1
```

```bash
cd C:/MyProject/Project1 && npm ci
```

## 3. 실행·확인

| 하는 일 | 명령 | 메모 |
|---|---|---|
| 개발 서버 | `npm run dev` | http://localhost:5173 (글꼴 부분집합을 먼저 만든다) |
| 타입 검사 | `npx tsc --noEmit -p .` | |
| 전체 테스트 | `npx vitest run` | 약 236파일 / 5,500개. CPU가 바쁘면 `sim.perf` 등이 시간 초과로 실패할 수 있다: 그 파일만 다시 돌리면 통과 |
| 글꼴 다시 만들기 | `npm run font` | 한국어 문구를 바꾸면 반드시 실행(한글 글꼴은 쓰는 글자만 담는 부분집합이다) |
| 밸런스 봇 보고서 | `npm run sim` | `SIM_ONLY=chapters` 등 환경 변수로 한 부분만. `SIM_SP=0/1`로 스킬 끔/켬 |
| 빌드 | `npm run build` | `dist/` |

자주 쓰는 주소(개발 서버 뒤에 붙인다)

- `?debug=1&scene=battle&chapter=1&seed=7` 전투 바로 열기(`window.__dbg` 도구 사용 가능)
- `?scene=sounds` 소리판(모든 효과음·음악·CC0 후보 듣기)
- `?scene=diag` 진단 페이지(기기·브라우저·마지막으로 꺼진 곳)
- `?sp=0` 스킬 끄고 하기, `?lean=1` 가벼운 모드 강제
- `?fresh=1` 새 프로필로 시작(튜토리얼부터)

## 4. 배포(테스트 빌드)

```bash
bash tools/deploy_pages.sh
```

```bash
git push origin main
```

`deploy_pages.sh`가 빌드해서 `gh-pages` 브랜치에 올린다. 공개 주소는 https://kymmmm01.github.io/Project1/ 이고, GitHub Pages 반영에 몇 분 걸릴 수 있다(대기열이 길면 10분 이상).

## 5. Claude Code로 이어서 하기

1. Claude Code를 설치하고 저장소 폴더에서 연다.
2. 인계 파일의 `claude_memory` 폴더 내용을 `C:\Users\<사용자 이름>\.claude\projects\C--MyProject-Project1\memory\`에 복사한다. 저장소를 다른 경로로 받았다면 폴더 이름은 그 경로의 `:`를 빼고 `\`를 `-`로 바꾼 것이다(예: `D:\Work\Project1` → `D--Work-Project1`).
   - 이 메모에는 작업 규칙이 들어 있다. 테스트는 음소거로, 서브 에이전트는 Sonnet, 동시 에이전트 4명 이하, 사용량 한도에 닿으면 멈추기, 그림은 비교 시트 뒤 컨펌, 귀여움 우선 같은 것들이다.
3. 첫 지시로 "docs/진행상황.md를 읽고 이어서 하자"라고 하면 된다. 진행 기록·결정·남은 일이 모두 그 파일에 있다.

## 6. 어디에 무엇이 있나

| 무엇 | 위치 |
|---|---|
| 진행 기록(먼저 읽을 것) | `docs/진행상황.md` |
| 기획서·규칙 명세 | `docs/기획서_GDD.md`, `docs/명세_전투규칙.md`, `docs/명세_메타.md` |
| 스킬 설계와 결정 | `docs/design_skills_v2.md`, `docs/qa/directive_2026-10-13_skills_build.md`(사용자 결정 1~40) |
| 담당별 넘김 메모 | `docs/handoff/` |
| 봇 측정 보고서 | `docs/qa/skills1_bot_report.md`, `skills2_bot_report.md`, `skills2_settled_addendum.md` |
| 문구 기준·검토 기록 | `docs/qa/copy_style_2026-10-18.md`, `docs/qa/copy_review_2026-10-18.md` |
| 소리 점검·라이선스 | `docs/qa/sound_audit_2026-10-18.md`, `docs/licenses/sounds.md`(게임에 든 CC0 소리 목록) |
| 아이폰 튕김 조사 | `docs/qa/ios_reload_2026-10-22.md`, 측정 도구 `tools/mem/` |
| 그림 원본·시안 | `art/raw/`, `art/skills_v1/`(시안 시트 세 장) |
| 소리 원본(CC0) | `art/sfx_src/kenney/` |
| 코드 | `src/game`(시뮬레이션), `src/view`(화면), `src/audio`(소리), `src/meta`(진행·경제), `src/screens`(홈 화면들) |

## 7. 저장소에 없는 것(인계 파일에 넣음)

- `claude_memory/`: Claude Code 메모(위 5번).
- `video/bgm.mp3`: 사용자가 준 패치 영상 배경음악. 재배포 금지라 저장소에서 뺐다. 패치 영상을 다시 만들 때 `video/`에 넣는다(`tools/video/README.md`).
- 지난 패치 영상(`video/*.mp4`)은 용량이 커서 넣지 않았다. 필요하면 `tools/video`로 다시 만든다.

## 8. 지금 상태와 남은 결정(2026-10-24)

- 배포된 빌드: 스킬 열두 개 켜짐, 그림·효과음·튜토리얼 수정·문구 검토·아이폰 메모리 수정 포함.
- 사용자 결정 대기
  - 튜토리얼 4웨이브 정예의 여유(운이 나쁜 판에서 1~2초 남기고 이김)
  - 소리: 호랑이 포효 녹음(ElevenLabs 유료), 음악 크기, 사무라이 "챙" 후보, 안 쓰는 옛 소리 6개
  - 상점 이름("Kitten Pack", "성장 패키지")
- 확인 대기: 아이폰에서 튕김이 멈췄는지(실기기 재시험), 꺼지면 `?scene=diag` 캡처.

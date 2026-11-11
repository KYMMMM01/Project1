# 계정, 클라우드 저장, 랭킹 (Firebase) 와 업적 (Play 게임즈)

2026-11-12 사용자 결정: "랭킹까지 Firebase, 업적은 Play 게임즈로 가자". 그 전 구성(Play 게임즈 로그인, Saved Games 클라우드 저장, Play 게임즈 랭킹)은 출시 전이라 옮길 사용자 데이터가 없다.

| 기능 | 담당 |
|---|---|
| 계정 | Firebase Authentication, 구글 로그인(안드로이드는 Credential Manager, 웹은 팝업) |
| 클라우드 저장 | Firestore `users/{uid}` 문서 하나 |
| 랭킹 | Cloud Functions 가 기록을 검증해 쓰고, 몇 분마다 상위 100명을 문서 하나로 묶음. 게임 안 랭킹 화면 |
| 업적 | Google Play 게임즈 v2(안드로이드만, 자동 연결) |

## 지금 상태 (2026-11-12)

- 프로젝트 `meowguard-4ce6f`(번호 837064889610), Blaze 요금제(2026-11-12 사용자 전환, 월 1만 원 예산 알림 50, 90, 100%). Aside 로 만들었다(사용자 지시 "너가 만들어봐").
- 된 것: 구글 로그인 사용 설정과 승인 도메인 `kymmmm01.github.io`, Firestore `(default)` 서울 프로덕션 모드, 안드로이드 앱(디버그 SHA-1 등록), 웹 앱. 웹 설정값은 `.env.store`, 프로젝트 id 는 `.firebaserc`. `android/app/google-services.json` 도 넣었다(디버그 SHA-1 의 안드로이드 클라이언트와 웹 클라이언트가 들어 있고, Gradle 이 `default_web_client_id` 를 만든다). 업로드 키와 앱 서명 키 SHA-1 을 더하면 이 파일을 다시 받아야 한다.
- 배포(2026-11-12): Firestore 규칙과 색인, 함수 5개(`submitRun`, `setName`, `myRank`, `refreshBoards`, `onUserDeleted`), 모두 `asia-northeast3`. 명령은 `npx firebase-tools deploy --only firestore:rules,firestore:indexes,functions`. 첫 배포 때 1세대 함수 `onUserDeleted` 만 빌드가 실패했고(API 를 막 켠 직후), 그 함수만 다시 올리니 됐다. 함수 이미지 정리 규칙은 1일(`functions:artifacts:setpolicy --days 1`).
- 남은 것: Play Console 첫 AAB 뒤 업로드 키와 앱 서명 키 SHA-1 추가.

## 직접 해야 하는 설정 (사용자)

결제와 약관 동의가 들어가서 사용자가 한다. 끝나면 값만 알려 주면 코드에 넣는다.

1. **Firebase 프로젝트 만들기**: https://console.firebase.google.com 에서 프로젝트 추가. 이름 예: `meowguard`. Google 애널리틱스는 꺼도 된다.
2. **요금제를 Blaze 로**: 랭킹 서버 함수(Cloud Functions)는 Blaze 에서만 된다. 결제 카드 등록, 무료 한도까지는 0원. 등록 직후 Google Cloud 콘솔의 예산 및 알림에서 월 예산(예: 1만 원) 알림을 걸어 둔다.
3. **Authentication**: 시작하기, 로그인 방법에서 Google 사용 설정(지원 이메일 선택). 설정의 승인된 도메인에 `kymmmm01.github.io` 추가(웹 테스트 빌드용).
4. **Firestore Database**: 데이터베이스 만들기, 위치 `asia-northeast3 (서울)`, 프로덕션 모드로 시작(규칙은 코드에서 배포).
5. **Android 앱 등록**: 프로젝트 설정, 앱 추가, Android. 패키지 이름 `com.bulssistudio.meowguard`, 앱 닉네임 `냥이 수비대`. SHA-1 지문 세 개를 등록한다.
   - 디버그 키(이 PC): `38:09:5A:61:5A:94:4C:0D:81:C2:FD:8B:F9:58:45:20:25:64:9C:A6`
   - 업로드 키와 앱 서명 키: Play Console 에 앱을 만들고 첫 AAB 를 올린 뒤, 테스트 및 출시, 앱 무결성, 앱 서명에 둘 다 나온다. 앱 서명 키가 없으면 플레이에서 받은 앱에서만 구글 로그인이 실패한다.
   - 지문을 다 넣은 뒤 `google-services.json` 을 내려받아 `android/app/` 에 둔다.
6. **웹 앱 등록**: 앱 추가, 웹. 나오는 `firebaseConfig`(apiKey, authDomain, projectId, appId 등)를 알려 준다. 공개되는 값이라 비밀이 아니다(규칙과 App Check 로 지킨다).
7. **Firebase CLI 로그인**: 이 PC 의 터미널에서 `npx firebase-tools login` 을 한 번 한다(PowerShell 이 스크립트 실행을 막으면 `npx.cmd firebase-tools login`). 그 뒤 규칙과 함수 배포는 요청할 때 실행한다.
8. **Play Console 업적**: Play 게임즈 서비스 설정(사용자 인증 정보, OAuth 동의 화면) 뒤 업적을 만든다. 업적 목록은 따로 정한다.

## 데이터 구조

- `users/{uid}`: `{ v, device, savedAt, data, bestWave, name, updatedAt }`. `data` 는 프로필 JSON 문자열(문서 한도 1 MiB). 본인만 읽고 쓴다. `bestWave` 는 줄어들 수 없다(규칙).
- `boards/{board}/entries/{uid}`: 랭킹 기록 `{ score, name, at }`. 서버 함수만 읽고 쓴다(공개 목록 읽기는 기록 수만큼 과금되어 막음).
- `boards/endless`, `boards/week`: 상위 100명 묶음 `{ top: [{ uid, name, score }], total, updatedAt, weekId }`. 누구나 읽고, 서버 함수만 쓴다.
- 랭킹 판: `endless`(무한 모드 최고 웨이브, 영구), `week-YYYY-MM-DD`(그 주 월요일, 서울 시간).

## 서버 함수 (functions/, asia-northeast3)

- `submitRun({ run: { waves, seconds } })`: 무한 모드 한 판. 서버가 검사하고 전체와 이번 주 판의 최고 기록을 함께 올린다. 한 사람 20초에 한 번. 게임은 판이 끝날 때마다 보내고, 로그인 전이나 오프라인에서 못 보낸 가장 좋은 판은 다음 로그인 때 보낸다(앱을 끄면 잊음).
- `refreshBoards`: 10분마다 상위 100명과 전체 인원을 묶는다.
- `myRank({ board })`: 내 기록과 순위(더 높은 기록 수 + 1).
- `onUserDeleted`: 계정이 지워지면 세이브, 랭킹 기록, 제출 시각을 지운다.
- `setName({ name })`: 랭킹 닉네임 바꾸기(설정의 계정 줄, 랭킹 화면의 내 기록). 한글 완성형, 영문, 숫자, 가운데 띄어쓰기로 2자에서 12자, 막는 말 목록(`functions/src/rules.ts` 의 `cleanName`, 게임도 같은 파일로 먼저 검사), 한 사람 30초에 한 번. `users/{uid}.name`, 이번 판의 내 기록 두 개, 묶음 문서 두 개의 내 줄을 함께 고쳐 바로 보인다. 클라이언트는 규칙상 `name` 을 직접 쓸 수 없다. 바꾸기 전에는 게임이 주는 기본 닉네임(`집사 1234`, uid 로 만듦).
- 닉네임 입력은 캔버스 위에 겹친 진짜 `<input>` 이라 폰 키보드와 한글 조합이 그대로 된다. 키보드가 아래 절반을 덮어도 보이게 창을 화면 위쪽에 둔다.

## 알려진 한계

- 판 기록은 게임이 보내는 값이라 조작된 앱은 가짜 기록을 보낼 수 있다. 지금은 웨이브당 최소 시간(`MIN_SECONDS_PER_WAVE`, 임시값 3초)과 20초 제한만 본다. 실제 판 기록으로 최소 시간을 맞추고, 나중에 서버에서 판을 다시 돌려 확인하는 검증을 더한다.
- 계정을 지운 직후 1시간 안에 남은 로그인 토큰으로 기록이 다시 생길 수 있다(드문 경우).
- 막는 말 목록은 짧다. 신고 기능이 없어서, 나쁜 닉네임은 개발자가 콘솔에서 `users/{uid}.name` 과 기록을 고친다.
- 구글 로그인 버튼은 지금 발바닥 아이콘이다. 구글 브랜드 지침대로 공식 G 로고를 받아 넣어야 한다.

## 정책과 처리방침 (출시 전 필수)

- 계정 삭제: 앱 안(설정, 계정 삭제)과 웹 페이지 둘 다. Firestore 문서, 랭킹 기록, 인증 계정을 지우고, Firebase 백업에서는 180일 안에 사라진다고 적는다.
- 개인정보 처리방침: 수집 항목(구글 계정 이메일과 ID, 닉네임, 게임 진행), 목적, 보유 기간, 국외 이전(Google LLC, 미국, 인증 서버), 거부 방법(게스트로 플레이)을 더한다.
- 만 14세 미만은 로그인하지 않도록 처음 로그인 때 확인한다(게스트 플레이는 그대로).
- 랭킹 닉네임은 구글 이름을 쓰지 않고 게임 닉네임을 쓴다.

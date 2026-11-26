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
- 배포(2026-11-26): 규칙과 색인, 그다음 함수 11개(호출 7개, 예약 3개 `refreshBoards`, `settleWeek`, `pollVoidedPurchases`, 계정 삭제 1개). 호출 함수는 모두 App Check 를 요구한다(아래 App Check 절).
- 2026-11-12: Android 앱에 앱 서명 키(SHA-1 D6:1B:A0:26:74:52:BF:06:D9:63:F9:EF:49:22:E7:23:FD:51:27:88)와 업로드 키(SHA-1 D0:21:8D:8B:2F:E1:60:C3:20:8B:9A:B7:C6:76:FD:EF:D6:A1:36:23)의 SHA-1, SHA-256 을 `npx.cmd firebase-tools apps:android:sha:create` 로 넣고, `apps:sdkconfig ANDROID` 로 google-services.json 을 다시 받아 바꿨다(Android OAuth 클라이언트 3개, 웹 클라이언트는 그대로).

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
8. **Play Console 업적**: Play 게임즈 서비스 설정(사용자 인증 정보, OAuth 동의 화면) 뒤 업적을 만든다. 업적 목록은 2026-11-23에 정해졌다(30개, 이름과 설명과 점수는 `docs/업적.md`). 만드는 순서는 `docs/출시_구글플레이.md` 의 Play 게임즈 절을 따른다.

## 데이터 구조

- `users/{uid}`: `{ v, device, savedAt, data, bestWave, name, updatedAt }`. `data` 는 프로필 JSON 문자열(문서 한도 1 MiB). 본인만 읽고 쓴다. `bestWave` 는 줄어들 수 없다(규칙).
- `boards/{board}/entries/{uid}`: 랭킹 기록 `{ score, name, at }`. 서버 함수만 읽고 쓴다(공개 목록 읽기는 기록 수만큼 과금되어 막음).
- `refunds/{orderId}`: Google Play 가 환불(무효 처리)한 일회성 상품 주문 `{ voidedAt, reason, source: 'play-voided', seenAt }`. `pollVoidedPurchases` 만 쓰고 `refundedOrders` 만 읽는다. 클라이언트는 규칙상 접근할 수 없다(맨 끝 전체 거부 규칙).
- `meta/refundCursor`: 환불 목록을 어디까지 읽었는지 `{ at, updatedAt }`(밀리초). 서버 전용.
- `boards/endless`, `boards/week`: 상위 100명 묶음 `{ top: [{ uid, name, score }], total, updatedAt, weekId }`. 누구나 읽고, 서버 함수만 쓴다.
- 랭킹 판: `endless`(무한 모드 최고 웨이브, 영구), `week-YYYY-MM-DD`(그 주 월요일, 서울 시간).

## 서버 함수 (functions/, asia-northeast3)

- `startRun()`: 무한 모드 판이 시작될 때 게임이 기다리지 않고 부른다. 서버가 시작 시각과 함께 표(32자리 16진수)를 `runs/{uid}.tickets` 에 적고 돌려준다. 표는 최근 5장, 48시간까지만 유효하다. 직전 표를 준 지 5초가 안 됐으면 새로 만들지 않고 그 표를 다시 준다(판을 시작하자마자 다시 시작한 경우). 첫 요청이 실패하면(로그인이 조금 늦음, 신호 약함) 게임이 판 시작 20초, 45초 뒤에 다시 묻는다. 게임은 표를 진행 중인 판과 함께 저장해서, 앱을 껐다 켜 이어 한 판도 표가 남는다(2026-11-26).
- `submitRun({ run: { waves, seconds }, ticket })`: 무한 모드 한 판. 서버가 검사하고 전체와 이번 주 판의 최고 기록을 함께 올린다. 한 사람 20초에 한 번. 그 판의 표가 있어야 하고, 받아들인 기록의 표와 너무 빠르다고 거절한 기록의 표는 지운다(같은 표로 기준을 떠보지 못하게). 시작 때 오프라인이거나 로그인 전이라 표가 없는 판은 랭킹에 올리지 않는다(기기의 최고 기록에는 남는다). 게임은 판이 끝날 때마다 보내고, 오프라인이나 20초 간격 때문에 못 보낸 가장 좋은 판은 다음 판이나 다음 로그인 때 그 표와 함께 보낸다(앱을 끄면 잊음). 다시 보내도 받아 줄 수 없는 거절(표 없음, 너무 빠름, 상한 초과, 차단)은 버리고 다음 판을 막지 않는다. 중단된 판을 "여기까지 정산"하면 마지막 웨이브 시작 때 저장된 게임 속 시간으로 보낸다.
- `refreshBoards`: 10분마다 상위 100명과 전체 인원을 묶는다.
- `myRank({ board })`: 내 기록과 순위(더 높은 기록 수 + 1).
- `onUserDeleted`: 계정이 지워지면 세이브, 랭킹 기록, 제출 시각, 판 시작 표, 주간 보상 기록을 지운다.
- `pollVoidedPurchases`: 6시간마다(서울 시간 기준 예약) Google Play Developer API 의 `purchases.voidedpurchases.list`(일회성 상품만, 한 번에 1000건, 다음 쪽 토큰을 끝까지)를 읽어 `refunds/{orderId}` 에 쓴다. 시작 시각은 `meta/refundCursor`(첫 실행은 API 가 보는 30일 창의 처음)이고, 모든 쪽을 읽고 쓴 뒤에만 커서를 올린다. 커서는 실행을 시작한 시각보다 하루 뒤처지게 두어, Google 이 환불을 늦게 목록에 올려도 다음 실행들이 다시 읽는다. HTTP 오류나 쓰기 실패는 `firebase-functions/logger` 로 남기고 커서를 그대로 둬 다음 실행이 다시 읽는다. 인증은 함수 실행 서비스 계정의 기본 자격증명(`google-auth-library`).
- `refundedOrders({ orderIds })`: 로그인 없이 부른다(대부분 게스트). 주문 번호 최대 200개를 `functions/src/refunds.ts` 의 `cleanOrderIds` 로 거른다(Play 주문 번호 모양 `GPA.` 로 시작하는 것만, 중복 제거, 배열이 아니거나 200개를 넘으면 `invalid-argument`). `refunds/{id}` 를 `getAll` 로 읽어 있는 번호만 `{ refunded: [...] }` 로 돌려준다. 클라이언트가 환불 표시를 쓸 방법은 없다. 게임은 켤 때마다(복원과 같은 경로, 첫 화면을 막지 않음) 장부에서 지급 상태인 주문을 200개씩 물어 환불된 것만 회수한다. 호출이 실패하면 아무것도 회수하지 않고 다음에 다시 묻는다. 실패해도 복원 결과(설정 화면의 성공과 실패 안내)는 바뀌지 않고, 분석 이벤트 `refund_check_failed` 만 남는다. 다른 함수처럼 App Check 가 있는 요청만 받고(아래 절), 인스턴스 수 제한이 부하를 막는다. 없다는 답으로 환불을 짐작하지 않는다.
- `setName({ name })`: 랭킹 닉네임 바꾸기(설정의 계정 줄, 랭킹 화면의 내 기록). 한글 완성형, 영문, 숫자, 가운데 띄어쓰기로 2자에서 12자, 막는 말 목록(`functions/src/rules.ts` 의 `cleanName`, 게임도 같은 파일로 먼저 검사), 한 사람 30초에 한 번. `users/{uid}.name`, 이번 판의 내 기록 두 개, 묶음 문서 두 개의 내 줄을 함께 고쳐 바로 보인다. 클라이언트는 규칙상 `name` 을 직접 쓸 수 없다. 바꾸기 전에는 게임이 주는 기본 닉네임(`집사 1234`, uid 로 만듦).
- 닉네임 입력은 캔버스 위에 겹친 진짜 `<input>` 이라 폰 키보드와 한글 조합이 그대로 된다. 키보드가 아래 절반을 덮어도 보이게 창을 화면 위쪽에 둔다.

## 환불 확인을 켜는 순서 (사용자, 배포 전)

1. Google Cloud 콘솔의 프로젝트 `meowguard-4ce6f` 에서 API 및 서비스, 라이브러리, Google Play Android Developer API 를 사용 설정한다.
2. 함수가 쓰는 실행 서비스 계정(2세대 함수의 기본값은 Compute Engine 기본 서비스 계정 `837064889610-compute@developer.gserviceaccount.com`, 콘솔 Cloud Run 의 함수 정보에서 확인)을 Play Console 의 사용자 및 권한에서 초대하고, 앱 `com.bulssistudio.meowguard` 에 대해 재무 데이터 보기 권한(주문 및 구독 관리 포함)을 준다. 권한 반영에 몇 시간 걸릴 수 있다.
3. `functions` 폴더에서 `npm install` 을 한 번 해 `package-lock.json` 을 갱신한다(`google-auth-library` 를 의존성에 적었다). 이미 `firebase-admin` 이 들여오는 같은 버전(11.3.4)이다.
4. 배포한다: `npx firebase-tools deploy --only functions:pollVoidedPurchases,functions:refundedOrders`. 규칙은 바꾸지 않았다.
5. 첫 실행 뒤 함수 로그에서 `pollVoidedPurchases done` 이 나오는지, 403 이면 위 1, 2 를 다시 본다. 클라이언트(앱)는 새 빌드에서 `refundedOrders` 를 부른다.

확인 못 한 것(실기기와 실제 응답이 필요): 실제 `voidedpurchases` 응답 모양(문서 기준으로 `voidedPurchases[].orderId`, `voidedTimeMillis` 문자열, `voidedReason` 숫자, `tokenPagination.nextPageToken` 으로 짰다), RevenueCat 의 `transactionIdentifier` 가 Play 주문 번호(`GPA.` 로 시작)와 같은지(다르면 `cleanOrderIds` 가 전부 버려 환불이 영영 안 잡힌다), 서비스 계정 권한. 라이선스 테스터 구매를 환불한 뒤 `refunds/` 에 문서가 생기고 앱이 회수하는지 한 번 확인한다.

## App Check (2026-11-26 배포)

2026-11-26 에 아래 켜는 순서 1번에서 4번까지 했다. Play Integrity API 를 Cloud 프로젝트 meowguard(837064889610)에 연결했고, App Check 에서 Android 앱이 Play Integrity 로 등록됨, versionCode 3 AAB 를 내부 테스트에 출시하고 비공개 테스트(Alpha)는 검토에 제출, Firestore 규칙과 색인, 함수 11개를 배포했다(새로 만든 것 `startRun`, `setLook`, `claimGrants`, `settleWeek`). 배포 뒤 표 없이 `myRank`, `refundedOrders` 를 부르면 401 `UNAUTHENTICATED` 가 온다. Firestore 와 Authentication 강제는 꺼진 채다. 확인 못 한 것: 실기기에서 Play Integrity 표를 받아 호출이 통과하는지(App Check 콘솔 지표의 확인된 요청으로 본다).

진짜 우리 앱에서 온 요청인지 Google 이 확인해 주는 표를 모든 요청에 붙인다. 표가 없거나 가짜인 호출은 서버 함수가 거절한다.

- 앱: `src/platform/firebase.ts` 의 `startAppCheck`. 안드로이드 빌드는 네이티브 플러그인 `@capacitor-firebase/app-check` 가 Play Integrity 로 표를 받고, 웹 SDK 가 그 표를 함수, Firestore, 로그인 요청에 붙인다. 표는 요청에 필요할 때만 받는다(Play Integrity 하루 사용량 한도 때문에 미리 갱신하지 않음). 표를 못 받아도 게임은 그대로 되고, 서버 호출만 오프라인일 때처럼 실패한다.
- 웹 빌드(GitHub Pages 테스트용): `VITE_APPCHECK_SITE_KEY` 에 reCAPTCHA Enterprise 사이트 키를 넣었을 때만 표를 붙인다. 지금은 키가 없어서, 함수를 배포하면 웹 빌드의 랭킹, 닉네임, 주간 보상 호출은 실패한다(로그인과 클라우드 저장은 Firestore 강제를 켜기 전까지 된다).
- 플레이를 거치지 않고 설치한 빌드(케이블로 넣은 APK 등)는 Play Integrity 를 통과하지 못한다. 이런 빌드는 `.env.store` 에 `VITE_APPCHECK_DEBUG=1` 을 넣어 만들고, 처음 켤 때 기기 로그(logcat 의 `DebugAppCheckProvider`)에 나오는 비밀값을 콘솔의 App Check, 앱, 디버그 토큰 관리에 등록한다. 이 값을 넣은 빌드는 플레이에 올리지 않는다.
- 서버: `functions/src/index.ts` 의 `setGlobalOptions` 에 `enforceAppCheck: true`. 앱이 부르는 함수 7개(`startRun`, `submitRun`, `setName`, `setLook`, `claimGrants`, `myRank`, `refundedOrders`)에 모두 걸린다. 예약 함수와 계정 삭제 함수는 앱이 부르지 않아 상관없다.

켜는 순서(사용자, 콘솔):

1. Play Console 의 앱 `냥이 수비대`, 테스트 및 출시, 앱 무결성, Play Integrity API 에서 Google Cloud 프로젝트 `meowguard-4ce6f` 를 연결한다.
2. Firebase 콘솔, App Check, 앱 탭에서 Android 앱에 Play Integrity 를 등록한다. 필요한 SHA-256 지문(앱 서명 키, 업로드 키)은 2026-11-12 에 이미 넣었다.
3. 새 AAB(versionCode 를 올림)를 테스트 트랙에 올려 테스터가 업데이트하게 한다. App Check 콘솔의 지표에서 확인된 요청이 보이면 된다.
4. 그다음 함수를 배포한다. 판 시작 표와 마찬가지로 예전 빌드는 표를 보내지 않으니 배포와 새 빌드 출시를 가깝게 맞춘다.
5. Firestore 와 Authentication 강제는 App Check 콘솔의 API 탭에서 따로 켠다. 지표에서 확인 안 된 요청이 거의 없을 때 켠다(지금은 꺼진 채로 둔다).

## 알려진 한계

- 판 기록은 게임이 보내는 값이라 조작된 앱은 가짜 기록을 보낼 수 있다. 서버(`functions/src/rules.ts`)는 네 가지를 본다(2026-11-26 보안 점검 뒤 강화).
  - 판 시작 표: 표를 받은 때부터 기록을 낸 때까지 실제로 흐른 시간(서버 시계)이 게임 속 시간의 1/3(최대 3배속) 이상이어야 한다. 표를 늦게 받는 경우를 위해 60초를 봐준다. 위조하려는 사람도 실제로 기다려야 하고(130웨이브면 약 5분 반), 표 없이 바로 보내는 위조는 막힌다. 완전히 막지는 못한다. 작정하고 기다리는 위조는 차단 목록으로 처리한다.
  - 웨이브 상한 `MAX_WAVES` 130(150에서 낮춤): 봇 480판의 최고가 111웨이브였고 120을 넘은 판은 없었다. 125웨이브 이상 기록은 함수 로그에 `submitRun near the waves cap` 으로 남으니, 실제 플레이어가 가까워지면 올려서 다시 배포한다.
  - 웨이브 종류별 최소 시뮬레이션 시간 `MIN_WAVE_SECONDS`: 일반 7초, 정예 13초, 보스 16초. 전투 규칙의 바닥(일반 9.6초, 정예 17.5초, 보스 21.5초)보다 약 25% 낮다. 시뮬레이션 시간이라 배속, 일시정지, 광고는 영향이 없고, 무한 모드는 집사 단계 0이라 제한시간이 줄지 않는다. 전투 수치가 바뀌어 바닥이 이 값의 1.25배 아래로 내려가면 `tests/functions.rules.test.ts`가 실패한다.
  - 시간 상한(웨이브 수 + 1) × 120초, 그리고 20초 제출 간격.
- 거부된 제출은 함수 로그에 `submitRun rejected`(uid, 이유, 웨이브, 시간)로 남고, 받아들인 기록에는 그 판의 `seconds`가 함께 저장된다. 테스터 기록이 쌓이면 이 값으로 기준을 다시 맞춘다. 조작된 앱이 맞춰 보내는 값까지 막으려면 서버에서 판을 다시 돌려 확인하는 검증이 필요하다(지금은 하지 않음).
- 환불 확인: Play 가 목록에 올리는 환불만 잡는다(일회성 상품, 환불과 취소와 차지백). 목록은 30일 전까지만 보여 주므로 서버가 30일 넘게 멈추면 그 사이 환불은 놓친다(한 번 쓴 문서는 지우지 않아 이후 영구히 조회된다). 장부는 지급 상태 주문을 최대 1000개(`LEDGER_MAX_ENTRIES`)까지 오래된 것부터 버리며 나이 제한은 없다. 기기가 오프라인이면 다음 켤 때 다시 묻는다. 조회 때 읽기 문서 비용은 주문 수만큼이다.
- 계정을 지운 직후 1시간 안에 남은 로그인 토큰으로 기록이 다시 생길 수 있다(드문 경우).
- 차단 목록: Firebase 콘솔의 Firestore 에서 `bans` 컬렉션에 문서 id 를 그 계정의 uid 로 한 문서를 만들면(필드는 아무것이나, 예 `reason`) 그 계정의 기록 제출이 거절되고, 10분마다 묶는 상위 100과 주간 보상 확정에서 빠진다. 앱 업데이트 없이 바로 적용된다. 차단한 계정의 기록 문서 `boards/endless/entries/{uid}` 와 이번 주 `boards/week-YYYY-MM-DD/entries/{uid}` 도 지워야 다른 사람의 내 순위(`myRank`)와 전체 인원 수가 맞는다. 차단은 계정 단위라, 다른 구글 계정으로 다시 위조하면 그 계정도 따로 막아야 한다. 이미 확정된 주간 보상은 `grants/{uid}` 에서 그 주를 지워야 한다(앱이 아직 받지 않았을 때만 효과가 있다). uid 는 묶음 문서 `boards/endless`, `boards/week` 의 `top` 에서 찾는다.
- 막는 말 목록은 짧다. 신고 기능이 없어서, 나쁜 닉네임은 개발자가 콘솔에서 `users/{uid}.name` 과 기록을 고친다.
- 구글 로그인 버튼은 지금 발바닥 아이콘이다. 구글 브랜드 지침대로 공식 G 로고를 받아 넣어야 한다.

## 정책과 처리방침 (출시 전 필수)

- 계정 삭제: 앱 안(설정, 계정 삭제)과 웹 페이지 둘 다. Firestore 문서, 랭킹 기록, 인증 계정을 지우고, Firebase 백업에서는 180일 안에 사라진다고 적는다.
- 개인정보 처리방침: 수집 항목(구글 계정 이메일과 ID, 닉네임, 게임 진행), 목적, 보유 기간, 국외 이전(Google LLC, 미국, 인증 서버), 거부 방법(게스트로 플레이)을 더한다.
- 만 14세 미만은 로그인하지 않도록 처음 로그인 때 확인한다(게스트 플레이는 그대로).
- 랭킹 닉네임은 구글 이름을 쓰지 않고 게임 닉네임을 쓴다.

# 회원 계정과 선택 재료 레시피

## 인증과 세션

POST /api/auth의 register/login/logout, GET의 내 정보 조회. 서버에서 이름·이메일·한국 휴대전화 형식·확인 비밀번호를 검사하고 이메일 소문자/공백, 전화번호 하이픈·+82를 정규화한다. DB UNIQUE 제약으로 경쟁 가입까지 차단한다. 로그인 오류는 계정 존재와 무관한 동일 문구다.

비밀번호는 bcryptjs3.0.3, cost12, 자동 salt로 해시한다. 12자 이상 및 UTF-8 72바이트 상한으로 bcrypt의 묵시적 잘림을 방지한다. 원문/해시는 응답·로그에 출력하지 않는다. OWASP bcrypt 최소 cost10/72바이트 제한을 참고했다: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html . 비밀번호 재설정·변경 및 이메일/전화 소유 확인은 아직 제공하지 않으며 가입 화면에서 알린다.

세션 토큰은 CSPRNG32바이트이고 DB에는 SHA-256 hash만 저장한다. 운영 HTTPS의 쿠키는 Secure/HttpOnly/SameSite=Lax/Path=/, Domain을 지정하지 않는다. 자동 로그인은30일 Max-Age/서버만료, 일반 로그인은 Max-Age 없는 브라우저 세션/서버12시간. 브라우저의 세션 복원 기능은 일반 쿠키도 복원할 수 있으므로 종료를 확실히 하려면 로그아웃한다. 로그아웃은 해당 토큰 DB 삭제 후 쿠키를 삭제한다. 창간 로그아웃/로그인 알림에는 임의 이벤트 ID만 localStorage에 저장하며 개인정보·토큰·비밀번호를 넣지 않는다.

모든 쓰기는 동일 Origin 및 JSON content type을 요구한다. 인증 요청4096바이트 상한. D1 원자적 카운터로15분당 가입IP5회, 로그인IP40회/식별자10회 제한. 로그에 IP/식별자를 저장하지 않고 시간창을 포함해 hash 저장한다. CF-Connecting-IP가 없는 런타임에서는 안전한 공통 버킷을 사용하므로 동시 가입량이 제한된다. 대규모 출시 전 소유 인증·복구·악용 대응·개인정보 삭제/보존 정책을 보완해야 한다.

## 소유권과 마이그레이션

0003_member_accounts.sql: users, sessions, member_inventories, auth_attempts. sessions.user_id 및 member_inventories.user_id는 users의 FK. 새 계정의 첫 GET은 빈 snapshot만 생성한다. snapshot은 재고와 불변 거래의 동시 갱신을 위해 유지하며 user.id 및 각 item/purchase/transaction/analysis의 userId를 서버가 강제한다. API의 전달 userId/URL은 소유권 결정에 사용하지 않는다. 타인 itemId는 자신의 snapshot에서 찾을 수 없어 거절된다. revision CAS/중복 명령 ID 검사는 유지한다.

legacy inventories와 브라우저 localStorage는 별도 보존하고 회원에 자동 귀속하지 않는다. 익명 import API는 회원 경로에서403이다. 계정 연결/복구가 필요하면 소유 확인 후 별도 migration을 설계해야 한다. 기존0002장부 migration을 재작성하지 않으며 현재 운영 revision5에서는 그 조건이 맞지 않아 장부 해제 효과가 없다.

## 레시피

냉장고 목록 체크박스로1~10개 선택 → 버튼 → 추천3~5개 → 자세히 보기. 사용 가능 여부는 서버에서 현재 수량>0, 한국 날짜 기준 관리기한>=오늘 및 세션 소유권으로 검증한다. API에는 itemIds만 보내고 서버에서 실제 필드를 읽는다. AIProvider.recipes/items 계약은 Mock/OpenAI가 동일하다. recipeSchema와 validateRecipes는 ID/이름/단위/수량/시간/난이도/순서/팁/추가재료를 검증한다. 텍스트는 React로 렌더링하고 임의 HTML은 사용하지 않는다. 레시피들은 선택 대안이며 합산 소비 계획이 아니다.

AI cache는 회원/선택ID/재고revision/한국일자/모델가격에 종속된다. 결과는 회원 범위 캐시에 저장되며 별도 공용 레시피 조회 API는 없다. DB 쓰기나 수량 차감은 하지 않는다. 페이지 진입은 auth/inventory/config만 읽고 AI 호출은0이다. 현재 paid ledger는 차단 상태이므로 실제 운영 유료 추천을 임의로 재개하지 않는다.

## 검증 실행

npm test / npm run typecheck / npm run lint / npm run build.
로컬 별도 D1에 migration을 적용한 뒤 wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/auth-e2e --port 4317 --var AI_PROVIDER:mock.
Playwright 설치 환경에서 npm run test:ui. 별도 제공 런타임은 PLAYWRIGHT_MODULE 파일URL, TEST_BROWSER 실행파일 경로로 지정 가능. 운영URL은 테스트 스크립트가 거절하며 합성 계정만 로컬 DB에 생성한다. 유료 모델 호출은 금지한다.

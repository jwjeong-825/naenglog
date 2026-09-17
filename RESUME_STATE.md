# 재개 상태 · 2026-09-09

## 최신 체크포인트 · 2026-09-17 게스트 이용

- 로그인 화면의 `게스트로 이용하기`가 임시 서버 계정과 세션을 생성한다. 빈 냉장고부터 기존 핵심 기능을 동일하게 체험한다.
- 게스트 내부 식별자는 API 응답에서 숨기며, 비밀번호 변경을 서버에서 거절한다. 이용 종료 시 세션·member_inventories·임시 users 행을 삭제한다.
- 서버 테스트 87/87, typecheck, lint 통과. 실제 AI 호출, 환경변수, 비용 장부 변경 없음.
- 기능 커밋 `9edfba30cc803297608f39c8ceabc728973d7200`을 GitHub main과 Sites 소스에 반영했고, Sites 버전33 배포가 성공했다. 기존 public 접근과 환경 revision13을 유지했다.

## 현재 상태

D1 서버 저장/Mock 검증 구현, 테스트, 문서화, Git 기록, 비공개 배포 및 운영 브라우저 검증 완료. 실제 AI API는 연결하지 않았다. 제출 대표 경험 개선 구현과 최종 빌드를 완료했다. GitHub 반영 커밋은 02114b5다. 다음 우선순위는 아래 최신 체크포인트를 따른다.

## 완료한 구현

- src/validation.ts: Draft/Command/State 런타임 검증, 날짜·수량 정밀도·참조·원장 연속성과 잔액 검사.
- src/ai-service.ts 및 src/ai.ts: 비동기 Provider 계약, JSON 검증, 취소/타임아웃/오류 구분, 규칙 기반 Mock. remote 타입만 있고 실제 구현 없음.
- src/domain.ts: 검증된 변경만 처리, 한국 날짜(Asia/Seoul), 음수·혼합 명령 거절 및 보관 목적지 구분.
- db/schema.ts, drizzle/0000_low_mandroid.sql 및 meta: inventories 스냅샷 테이블. 적용된 SQL 수정 금지.
- src/server/repository.ts: 방문자별 D1 스냅샷, 수량/원장 원자 저장, revision CAS, 재전송 중복 방지, 1회 legacy import.
- src/server/handlers.ts, app/api/inventory/route.ts: GET/POST, HttpOnly SameSite=Strict 세션 쿠키와 해시 저장, Origin/JSON/1MiB 제한.
- src/api.ts, app/page.tsx: 서버 저장/실패/충돌/재시도, focus 새로고침, 기존 localStorage 백업 유지 후 가져오기, 비동기 Mock UI.
- .openai/hosting.json: 기존 Site ID 유지, d1=DB. 로컬 재현은 npm run db:migrate:local 후 npm run dev.

## 검증 결과

- npm test 21/21, lint, typecheck, build 통과. 실제 SQLite 세션 격리/동시 수정/재전송/가져오기/CSRF 및 한국 날짜 테스트.
- 운영 의존성 audit 0건. 전체 audit moderate 4건은 Drizzle 개발 도구의 전이 의존성. force update 금지, 개발 서버 공개하지 않음.
- 로컬 브라우저: 애호박 5개 구매 → 2개 소비 → 3개 → 새로고침 유지 → 냉동 이동. 이미지 선택 → 미리보기 → 모의 분석 4개 → 등록 성공.
- 모바일 390×844 홈 확인 및 docs/screenshots/mobile-home.png 저장, viewport 원복.
- 운영 브라우저: 기존 localStorage 가져오기 성공 → 계란 3개 소비 확인 적용 → 새로고침 후 7개 유지 확인.
- docs/QA.md는 실제 도구로 수행한 수동 E2E 기록이며 자동 E2E 스위트가 아님.

## Git 및 배포

- 구현 커밋 dabed797fbd1d9568686d0652a40f86abfead223. Sites main push 성공. 이후 문서 정리 커밋은 git log로 확인.
- 공식 package-site.sh 성공. work/site.tar.gz에 hosting/DB migration/meta/server entry 포함.
- Site: appgprj_6a9fec0734708191a285871bf04d3f0e (재사용, 생성 금지).
- 배포 버전 2: appgprj_6a9fec0734708191a285871bf04d3f0e~appgver_79d3489418a08191ba274cd42146000e.
- deployment: appgdep_6aa0a42e1cc88191900ab3ed4cf58ec5, succeeded 확인.
- URL: https://naenglog-fridge.vk4yrj847p.chatgpt.site, 본인 전용. owner 1명, 그룹/외부 방문자 없음 확인.
- 공개 전환은 이전 자동 승인 검토에서 명시적 공개 대상 승인 부족으로 거절. 재개 요청을 공개 승인으로 해석하지 말 것.

## 다음 작업 순서

1. 식품별 예상기간 근거 검토 및 데모 정책 표시 개선. 안전성 주장은 공식 근거를 조회한 뒤 문구에 반영한다.
2. 저장 실패/충돌/취소의 UI 회귀 검사와 브라우저 자동화 재현 구조 보강.
3. 동일 구매 재분석 중복 탐지, 입력 변경 도중 진행 중인 해석 결과의 무효화 검토.
4. docs/SUBMISSION_DEMO.md의 90초 시연 초안을 최종 자료로 발전. 특정 대회 회차/공고가 확인되지 않았으므로 규정 충족을 임의로 선언하지 않는다.
5. 승인 범위 내 기능 개선 → 검사 → 문서 → 커밋 → 필요한 경우 기존 비공개 Site 재배포.

## 남은 한계

실제 AI/OCR 없음. 식품 예상기간은 검증 전 데모 정책. 계정 복구/기기 간 공유 없음; 쿠키 삭제 시 익명 재고 복구 불가. DB 자동 보존기간/정리 없음. aggregate JSON 저장으로 분석용 관계형 정규화는 후순위. 공개 심사 URL/최종 제출 자료는 미완료.

## 실행 중 도구

로컬 dev 세션 28534(http://localhost:3000), 이미 local D1 migration 적용됨. 세션이 없으면 npm run db:migrate:local 후 npm run dev.
Browser 스킬/전체 문서 읽음. Node REPL browser와 tab(id 3 로컬), prodTab(id 4 운영) 바인딩 사용. 현재 viewport 기본값. 초기 CDP timeout은 tab.reload로 해결했음.
Sites credential은 짧게 만료되며 파일에 저장하지 않는다. 다음 push 시 새 credential을 받고 per-command 인증을 사용한다.

## 명령 및 환경

Node PATH: C:/Users/jjw08/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin
npm PATH: $env:TEMP/naenglog-sites-setup/node_modules/.bin
Git: C:/Users/jjw08/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe
git은 명령별 -c safe.directory=저장소절대경로, 쓰기는 승인된 실행 사용.
Drizzle generate는 샌드박스에서 uv_os_get_passwd ENOMEM; 승인 실행에서 성공. 의존성 교체 전 dev 종료하여 Windows EBUSY 방지.
로컬 DB: wrangler d1 migrations apply DB --local --config work/d1-local.json --persist-to .wrangler/state
패키징: 기존 ignored work/package-windows.sh가 공식 LF 정규화 스크립트를 WSL/Windows Node로 실행. 새 build 완료 후 bash work/package-windows.sh.



## 공식 GitHub 저장소 · 연결 완료

- Owner: jwjeong-825. Public 저장소: https://github.com/jwjeong-825/naenglog
- origin: https://github.com/jwjeong-825/naenglog.git, main이 origin/main 추적. 기존 커밋 이력을 보존하여 최초 push 성공(2817c1d).
- 저장소 생성 시 README/gitignore/license 자동 초기화 없음. 필수 문서와 AI_PROVIDER_SETUP.md 포함.
- 공개 전 검사: 테스트 21/21, typecheck/lint 통과. Git 이력 135개 blob의 키/토큰/개인키/인증 URL 패턴 및 민감 파일명 검사에서 탐지 없음. 작성자 Codex/codex@local.invalid. .env/DB/빌드/work는 추적되지 않음.
- 이후 의미 있는 기능/설계/문서 변경 시 commit → GitHub main push. Sites 저장소는 배포 소스용으로 별도 사용한다.
- GitHub 인증이 다시 필요할 때만 최소 로그인 행동을 요청하며 토큰/비밀번호를 대화에 요구하지 않는다.
- GitHub 공개 승인은 Sites의 공개 접근 변경 승인이 아니다. 실제 AI API 연결 금지 유지.
- 후속 문서 정리 커밋은 git log -1로 확인. 다음 제품 작업은 TASK_QUEUE.md 순서대로 진행한다.

## 최신 체크포인트 · 제출 경험 집중
- 이전 기능 유지. 홈 대표 CTA를 우선 재료 상세로 연결하고 지난 시점 확인을 우선했다.
- src/product.ts ProductMeaning v1, app/product-review.tsx 확인/수정 UI, domain/validation 서버 검사. 기존 meaning 없는 저장 데이터는 호환된다.
- 테스트23개 통과. 브라우저 100g×5팩→500g, 수량4팩 수정→400g/재확인, 서버 등록/새로고침 복원 확인.
- 필수 제품/AI/구조/QA/시연 문서 갱신. 실제 AI/OCR 호출 없음.
- 운영 Sites는 아직 버전2(이전 UI). 이번 변경의 GitHub push와 운영 배포 여부를 마지막 기록으로 확인한다.
- 다음 우선순위: 제출 시연의 확인 흐름 간소화 검토(필드 수 확장 금지), 식품 정책의 근거/제품 표시 구분, 저장 실패/충돌 회귀 증거.


## 검증 확정
- 최종 typecheck/lint/build exit 0(세션17186). 테스트23/23 통과. 모바일390×844 브리핑 screenshot docs/screenshots/briefing-action.png 확인, viewport 원복.
- 기능과 필수 문서/QA/시연 초안을 의미 단위 커밋으로 GitHub main에 반영한다. 현재 운영 Sites 버전2는 유지, 재배포는 하지 않았다.


## GitHub 완료
02114b5: 브리핑 행동 연결/상품 의미 확인 구현과 문서. main push 성공. 다음은 TASK_QUEUE.md의 제출 UX/정책 표시 점검이며 실제 AI 연결과 기능 확장은 하지 않는다.

## 최신 체크포인트 · AI 연결 직전

- UI AI 호출을 src/ai-client.ts와 /api/ai 서버 경유로 통일했다. 서버는 세션의 D1 상태를 읽는다.
- src/server/ai-provider.ts에 환경설정/선택 지점, remote 구현 없음(503). AI_API_KEY/AI_MODEL은 빈 예시만 제공하고 호출하지 않았다.
- src/analysis.ts + schemas/analysis-result.schema.json: version/rows/unresolved/warnings. 새 분석 meaning 필수, confirmed 무조건 false. 기존 DB 데이터 호환 유지.
- src/image-input.ts: 원본5MiB, JPEG/PNG/WebP 및 파일 헤더 검사. 서버 요청7MiB 제한. 원본 이미지 영구 저장 안 함.
- .env.example 추가, .env/.dev.vars/.key는 ignore. 실제 키 없음.
- 테스트27개 통과, typecheck/lint 및 첫 build 통과. 서버 이미지 UI 검사 완료. 입력 변경 취소/모드 문구 보강 후 최종 build 확인 중.
- 다음: 최종 build 확인/브라우저 이미지 결과/클라이언트 번들 키 경계 검사→GitHub push. 이후 실제 활성화 전 픽셀/EXIF 처리, 비용 한도/호출 제한, 공급자 실측 평가가 우선.
- 현재 운영 Sites는 여전히 버전2이며 이번 변경은 미배포. 실제 API 연결은 사용자 승인 전 금지.

## 최종 검증 결과
테스트27/27, typecheck/lint, 최종 build exit0(82141). /api/ai와 /api/inventory 빌드 포함. 클라이언트 번들 키 설정/서버 미구현 코드 검색 일치 없음. 실제 이미지 fixture 서버 분석4개와 부분 인식 UI 확인 완료. 이 변경을 GitHub main에 커밋/push하며 운영 Sites는 변경하지 않았다. 최신 커밋은 git log -1로 확인한다.

## 2026-09-10 제한 체험 예산 · 구현 및 검증 완료

서버 AIBudget에 글로벌 비용 예약/CAS, 사용자 횟수, 캐시, 사용량 정산, 보호된 관리자 상태를 구현했다. paid27,000원 차단, Mock 장부 분리. 실제 API 없음. migration0001 로컬 적용 완료. 테스트32개/typecheck/lint/build 통과. 클라이언트 번들에 서버 secret 설정명 노출0건, Git 대상 민감정보 패턴0건, diff 검사 통과. 다음: 이 변경을 feat: enforce championship AI trial budget and usage limits로 commit/push 후 main 일치 확인. 이후 TASK_QUEUE의 이미지 정규화부터 재개. 운영에는 새 migration/배포를 적용하지 않았다.

## 2026-09-12 · TOP20 제출 흐름 개선

촬영/업로드 공통 ReceiptInput, FOOD/NON_FOOD/UNCERTAIN 분류, 최대3개 Mock 후보 탐색, 확인/제외/복원 UI, 소비기한 입력을 구현했다. 실제 OCR/Vision/검색/key 없음. 테스트37개·타입/lint·최종 build 통과. 브랜드 보존·반응형 최소폭까지 반영했다. 민감정보 패턴 검사0건, 클라이언트 서버 secret 설정명 노출0건, diff 검사 통과. 내장 브라우저 연결 복구 완료: 촬영 capture=environment/업로드 capture 없음, 비식품 제외→서울1000 후보 선택→확인 전 저장 차단→두 재료 등록→홈 복귀 확인. 762px 화면 가로 넘침 없음. 실기기 카메라/갤러리 선택은 미검증. 공식main에 이번 기능을 commit/push한 뒤 TASK_QUEUE의 실기기·이미지 정규화부터 재개한다. 운영 Sites 버전2 미변경.

## 2026-09-14 · 최신 체크포인트: 생활형 UI

사용자의 새 방향에 따라 홈의 브리핑 중심 UI를 내 냉장고 중심으로 변경했다. 브리핑 기능은 접힌 보관 안내에 유지한다. 4개 보관 탭/곧 소비 토글, 식품 목록, 분류 결과 및 후보 확인, 상세 조작 우선 배치, 균등 하단 메뉴를 구현했다. src/서버/DB/Provider 계약은 변경 없음. 기존 회귀37개 통과, 브라우저 확인 전 등록 차단/후보 선택/수량 수정 후 재확인/2품목 저장/냉동 필터 확인. 최종 빌드·문서/Git 반영 및 소유자 전용 Sites 배포 결과를 후속 기록에서 확인할 것. 다음은 TASK_QUEUE의 실기기/제출 데모 검증. 실제 AI는 연결하지 않는다.

최종 검증: 테스트37/37, 타입 검사/lint/최종 프로덕션 build 모두 통과. 390×844 모바일과 기본 데스크톱에서 홈/상세 레이아웃을 확인했으며 가로 넘침 없음. 브라우저 확인/등록·필터 동작 통과. 클라이언트 번들에 서버 키 설정명 노출 없음. Sites 배포 패키지에 기존0000 및 추가0001 마이그레이션 포함(기존 재고 변경 없음).

## UI 배포 완료 · 2026-09-14

기능 커밋 aabc4a899ec1e9bd76df5f3af30545408a5c7f4c를 GitHub main 및 Sites 소스에 push 완료. Sites 버전3 배포 상태 succeeded, 소유자 전용 접근 유지. 운영 URL: https://naenglog-fridge.vk4yrj847p.chatgpt.site . 실제 AI/키 미연결. 이 기록은 배포 후 문서 커밋으로 GitHub에 남긴다. 다음 실행은 TASK_QUEUE의 실기기 촬영/업로드 및 제출 시연 점검부터 재개한다.

## 최신 체크포인트 · OpenAI 어댑터

사용자가 실제 OpenAI 어댑터 구현을 승인했다. 키 입력/발급/결제/실제 호출은 사용자 직접 수행. src/server/openai-provider.ts와 selectProvider에 openai 모드를 구현하고 구매 기록 remote 매핑, 브리핑 메뉴 표시/이미지 외부 전송 안내를 연결했다. 기존 경계/예산/DB/확인 흐름 유지. 48개(기존37+신규11) 테스트와 build 통과. 자동 테스트는 fetch 대역만 사용. 키/계정 환경은 읽거나 변경하지 않았다. 어댑터는 Sites 버전4로 배포 완료했으며 실제 활성화는 사용자 설정 단계에 남긴다. 최종 검증과 공식 main push 완료. 이후 AI_PROVIDER_SETUP의 설정/실제3~5품목 검증을 사용자가 수행한다.

최종 검증 확정: 테스트48/48, typecheck/lint/build exit0. 클라이언트 번들 서버 키/요금/엔드포인트 표식0건, 변경 대상 민감정보 패턴0건, diff 검사 통과. 새 DB migration/의존성 변경 없음. 외부 미호출 input_limit의 예약만 해제하고 횟수는 유지하도록 보완했다. 공식 GitHub main에 이 기능 단위를 기록하며 실제키·운영환경·실제영수증 검증은 사용자 설정 단계에 남긴다.

## OpenAI 어댑터 배포 완료 · 2026-09-14

기능 커밋 cf3d0acff8b7a88ea66742865c8edaae7f85cca2를 공식 GitHub main과 Sites 소스에 push 완료. 동시 README 수정은 보존해 rebase했다. Sites 버전4 배포 succeeded(deployment appgdep_6aa753d9f5e8819187f51585522b7e1f), URL https://naenglog-fridge.vk4yrj847p.chatgpt.site . 소유자 전용 접근 유지, env_set_revision=0, 키/환경변수 변경 없음. 기본 Mock 상태이며 실제 OpenAI 활성화·과금·인식 정확도 검증은 미실행. 다음 우선순위는 사용자 전용 Project/한도/Secret 설정 후 소량 실측이다.

## 최신 체크포인트 · 2026-09-15 오류 진단
운영 v4/env11은 가격 guard 통과 후 최초 briefing 실패(usage=null), paid 장부 halted=true. 진단 필드가 없어 과거503 원인은 미확정. 새 진단 보존/미전송 예약 처리 구현, 52개 Mock 테스트 통과, typecheck 통과, lint/build 최종 확인 진행. 운영 장부/키 변경과 실제 모델 호출은 금지. 다음: 검증 완료→commit/push 및 코드 배포(장부 유지)→사용자 승인하에 Provider 청구 검토/복구 경로 확보→통제된 단1회 진단. 실패 재현·원인 확정 전 해결 완료라고 말하지 않는다.

최종 검증: npm test 52/52, npm run typecheck/lint/build 모두 exit0. 실제 유료 호출0, 운영 장부 변경0. 진단 어댑터 코드를 기록/배포하며 기존 halted는 유지한다.

배포 완료: 진단 코드80ec6eb6b78e261b3835c161ffb650fee2b45e99를 GitHub main/Sites 소스에 push. Sites 버전5/env revision11 succeeded(appgdep_6aa8143b7a4c819198b9873dc8cd8ad3). 기존 공개 접근 유지. 배포 후 DB 읽기로 paid장부 revision2/halted=true/total12358(0.001원 단위)/entry1 불변 확인. 실제 AI 호출 없음. 다음은 Provider 청구 검토와 별도 승인된 복구 경로/단1회 실측. 현재 오류 원인은 미확정이며 새 요청부터 진단 가능.

## 진행 중 · 승인된 영수증1회 테스트 준비
운영 paid장부 revision2/halted=true/total12358/uncertain1 재확인. 0002 조건부 복구 migration과 receiptTest 원자적1회 제한 추가. 기존 감사/예약/확정과금 기록 보존. Mock 테스트54개/typecheck/lint/build 통과. 외부 호출0. 기존 v5를 임시 Mock으로 배포해 안전한 복구 단계 진행 중. 다음: 배포 성공→새코드+0002 배포→DB 확인→openai 복원 배포→haltedfalse/잔여1/총액불변 최종 확인. 장부 해제는 이번 사용자 요청으로 명시 승인됨.

복구 적용 확인: 버전6 migration 배포 성공(env12 Mock). 운영 paid장부 revision3/halted=false/receiptTest.remaining1/total12358/과거entry1 불변. 감사기록 추가. 원래 OpenAI 설정을 env revision13으로 복원하여 최종 배포 진행 중(appgdep_6aa8908c32ac8191b61400e1ba66446b). 실제 AI 호출0. 서버는 receiptTest가 존재하는 동안 이미지분석1회 이외 paid요청을 차단한다.

최종 완료: 버전6/env13(OpenAI) succeeded. 운영 장부 revision3/haltedfalse/잔여1/총액12358/과거이력1 확인. 실제 모델 미호출. 사용자가 새로고침 후 이미지 분석 버튼1회 실행 가능. 다음은 사용자 테스트 후 diagnostic/usage 확인이며 임의 재충전·장부 초기화 금지.

## 진행 중 · 외부 HTTPS 진단
network 예외분류/키 없는 고정 HEAD진단 경로 추가. ledger revision5/haltedtrue/잔여0 유지, 해제 금지. 모델호출 절대금지. 테스트/빌드 후배포하고 /api/internal/network-diagnostics GET만 실행하여 플랫폼 외부통신·Request헤더 구성 결과 확인 예정.

## 최신 체크포인트 · 2026-09-16
현재 요청은 회원가입/로그인/자동로그인, 회원별 재고 완전 분리, 선택 재료 레시피다. 구현 및 서버 회귀67개 통과. 로컬 Worker Mock 브라우저검증 진행 중. bcrypt3.0.3, migration0003 신규회원별 snapshot, legacy자동import차단, 클릭시만 recipes/provider/budget 경로. paid장부 halted=true/잔여0 유지, 절대 해제·유료호출 금지. network manual수정도 이번 소스에 포함. 다음: 브라우저검증 → 최종 type/lint/build → 민감정보검사 → GitHubmain/Sites소스 push → 현재 audience 유지 재배포 → 공개 비로그인401 확인. 환경키 변경 불필요.

로컬 Worker/Mock 브라우저 검증 통과: 가입→빈 냉장고→재료3개→추천3개→상세/모바일390px넘침없음, 재접속로그인유지, 로그아웃세션무효화, 익명재고401. 페이지/선택/상세 자동모델호출0, 추천버튼에서만1회(Mock). 최종 검증 후Git/배포 예정.

## 재개 후 최신 운영 대조 · 2026-09-16
단순push 전에 다른 최신 변경 발견. origin/main=3c45c95, Sitesv30=91f1f4e(회원schema0003이미적용), env13/public. 로컬구현65a1e5c보존→origin개선923696e병합→Sites변경현재병합중. 기존0003_certain_lethal_legion 원문보존, 미배포0003_member_accounts초안은0004_member_auth_hardening로이동. 기존 회원/토큰/재고 호환복사, 익명재고격리. 운영 paid장부는이미 revision83/halted=false/total880611 milliKRW; agent변경없음. 기존haltedtrue기록은과거상태! 현재누적/설정/장부변경금지,유료테스트금지. 다음:86개(이전67+원격회귀+호환)테스트/타입/lint/build→로컬브라우저재검증→병합커밋→GitHub/Sitespush→현재audience/public으로기존프로젝트재배포→비로그인화면/API401 확인.

통합 최종 검증: 서버86/86, typecheck/lint/build 통과. 별도 로컬D1에0000~0004 적용 성공. 브라우저에서가입/빈재고/회원A등록/B미노출·타인item수정·레시피거절/자동로그인재접속/로그아웃토큰폐기/비회원401/클릭전AI0·Mock추천3개·상세/390px넘침없음 통과. 시크릿·클라이언트credential저장패턴0건. 운영회원·과금스냅샷보존 migration회귀통과. Git병합기록/배포만남음.

## 배포 완료 · 2026-09-16 (이 항목이 최신)

- 배포 코드: adf7f78c50933d8c5a697416176108e010e663ac. GitHubmain 및 Sites소스 push 성공.
- Sites 버전31, deployment appgdep_6aaa6596652481918317739585d72757 succeeded. 기존 project appgprj_6a9fec0734708191a285871bf04d3f0e/public/env revision13 유지.
- URL https://naenglog-fridge.vk4yrj847p.chatgpt.site . 로그인/회원가입/자동로그인 UI, 비로그인inventory401, 회원정보·레시피진입컨트롤번들, 모바일폭 검증. 운영 AI 요청0, 운영 테스트회원 생성0.
- 서버86개/typecheck/lint/build 통과. 로컬 Worker 브라우저에서 회원A/B격리, 타인item수정/레시피거절, 자동로그인재접속, 로그아웃토큰무효화, 명시버튼Mock추천3개/상세 검증.
- 운영0003 원문유지,0004 적용 확인(member_inventories/auth_attempts 존재). 기존 회원/세션/회원재고 호환보존, 익명inventories격리. 기존영수증20품목/일괄확인/D-Day개선도보존.
- 운영 paid장부 배포 전후 revision83/halted=false/total880611 milliKRW 동일, 반환된snapshotprojection동일. Mock장부 revision23/0원 동일. 이번작업장부·누적사용량·환경설정·secret변경0, 실제유료호출0. 과거halted=true중단기록과다르므로 최신읽기값을기준으로할것.
- 다음: 사용자가 본인기기에서 기존계정로그인/자동로그인 확인. 이메일·전화 소유검증/비밀번호찾기는 별도후속범위. 실제AI시험은 사용자별도승인 전수행금지. 문서배포기록커밋은 runtime코드변경없이GitHub에추가한다.

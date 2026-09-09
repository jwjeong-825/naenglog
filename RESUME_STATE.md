# 재개 상태 · 2026-09-09

## 현재 작업
D1 서버 저장과 AI 응답 검증 구현 완료, 최종 문서/빌드/배포 대기. 실제 AI API 호출 없음.

## 이번 실행에서 완료
- 이전 문서 전체와 Git 확인. 시작 시 작업 트리 깨끗, HEAD 6196a98. 이전 마지막 문서 커밋의 Sites push는 사용량 제한으로 실패했었음.
- src/validation.ts: Draft/Command/State 런타임 검증, 거래 연속성·참조·잔액·정밀도 검사.
- src/ai-service.ts: 비동기 Provider 계약(mock/fallback/remote 타입), JSON 검증, 타임아웃/취소/오류 구분. remote 구현은 없음.
- src/ai.ts: Mock Provider 분리. 음수·혼합 명령 거절, 출발/목적 보관 구분.
- src/domain.ts: 한국 날짜(Asia/Seoul), 등록/명령 검증. app/page.tsx: 비동기 브리핑, 취소, 서버 저장/오류/충돌 상태.
- db/schema.ts + drizzle/0000_low_mandroid.sql 및 meta: inventories 테이블 생성. session_hash PK, snapshot, revision, created_at, updated_at.
- src/server/repository.ts: 방문자별 스냅샷, 원장과 잔액 동시 저장, revision CAS, idempotent replay, 1회 legacy import.
- src/server/handlers.ts + app/api/inventory/route.ts: GET/POST API, 256-bit 익명 세션 HttpOnly SameSite=Strict 쿠키, DB에는 세션 해시만 저장. Origin/JSON/본문 크기 검사.
- src/api.ts: 서버 전용 저장, 15초 타임아웃, 기존 localStorage 백업 유지 후 가져오기. 현재 데이터의 source of truth는 D1.
- .openai/hosting.json d1='DB' (기존 project_id 유지). Drizzle ORM 0.45.2 / kit 0.31.10 추가.

## 검증
- npm test: 21/21 통과. 실제 SQLite 마이그레이션/방문자 격리/경쟁 수정/재전송/가져오기/CSRF 포함.
- npm run lint, npm run typecheck 통과(마지막 세션 25762 exit 0).
- 로컬 D1 마이그레이션 적용 완료. npm run dev 세션 28534, http://localhost:3000/. GET / 및 /api/inventory HTTP 200.
- Browser 실제 UI 확인: 직접 입력 애호박 5개 → 분석 확인 → 서버 등록 → '애호박 2개 썼어' → 확인 적용 → 3개. 새로고침 후 유지. 상세 냉동 변경 → 3개 냉동 D-14 확인.
- 모바일 390x844 홈 screenshot 확인. 등록일 UTC 오류 발견 후 한국 날짜로 수정 및 자정 테스트 추가. viewport override는 reset 완료.
- Browser binding은 Node REPL browser, tab id 3. 기존 production tab id 4. 초기 CDP timeout은 tab.reload 후 해결. Browser 스킬과 전체 documentation 이미 읽음.

## 다음 정확한 작업
1. PROJECT/PRODUCT_SPEC/ARCHITECTURE/AI_PROVIDER_SETUP/README/CHANGELOG를 서버 DB와 현재 검증 기준으로 갱신.
2. 이미지 업로드 UI 시나리오와 스크린샷 기록. Browser filechooser API 사용; 지침 이미 읽음. 개인 이미지 대신 테스트 fixture 사용.
3. 새 의존성 audit 확인: Drizzle kit 설치 후 dev transitive esbuild의 moderate 4건 보고. prod audit 별도 확인, 무조건 force update 금지.
4. 최종 npm run build. 신규 migration 포함 package-site.sh 패키징. 타입/lint는 이미 통과했으나 추가 변경 시 재확인.
5. 의미 단위 Git 커밋 → 기존 Sites source push → 새 버전 저장 → 비공개 배포 → production API/브라우저 확인.
6. 실패/완료 결과와 정확한 IDs/URL/다음 작업을 이 문서에 갱신.

## 현재 Git
이 실행 변경은 아직 커밋 전. 기존 사용자 변경 없음. 주요 변경: .openai/hosting.json, app/page.tsx, package files, src/*, app/api/*, db/*, drizzle/*, tests/domain.test.mjs.

## 배포와 제한
- 기존 Site project_id appgprj_6a9fec0734708191a285871bf04d3f0e 재사용. 새 Site 생성 금지.
- 현재 배포는 이전 localStorage 버전: https://naenglog-fridge.vk4yrj847p.chatgpt.site (본인 전용).
- 공개 전환은 이전 자동 승인 검토가 '명시적 공개 대상 승인 부족'으로 거절. 우회하지 않고 별도 공개 승인 필요. 현재 사용자 재개 요청은 공개 전환 명시 승인이 아님.
- 실 AI/OCR 없음. 식품 기간은 검증 전 데모 정책. 식품 근거 검토, 완전한 E2E 자동화, 공개 제출 URL, 제출 자료는 미완료.
- DB는 개별 엔티티를 포함한 aggregate JSON을 단일 CAS로 저장. 분석용 관계형 정규화는 후순위. 쿠키 삭제 시 기존 익명 재고 복구/다른 기기 동기화 불가. 계정/복구 UI는 미구현.

## 명령 및 환경
Node PATH: C:/Users/jjw08/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin
npm PATH: $env:TEMP/naenglog-sites-setup/node_modules/.bin
Git: C:/Users/jjw08/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe
git은 명령별 -c safe.directory=저장소절대경로, 쓰기는 승인된 실행 사용.
Drizzle generate는 샌드박스에서 uv_os_get_passwd ENOMEM; 승인 실행에서 성공. 의존성 교체 전 dev 종료하여 Windows EBUSY 방지.
로컬 DB: wrangler d1 migrations apply DB --local --config work/d1-local.json --persist-to .wrangler/state
패키징: 기존 ignored work/package-windows.sh가 공식 LF 정규화 스크립트를 WSL/Windows Node로 실행. 새 build 완료 후 bash work/package-windows.sh.

## 후속 검증 업데이트
- 이미지 업로드/모의 분석/4개 등록 성공. docs/screenshots/mobile-home.png 저장, viewport 원복.
- 최종 build exit 0, prod audit 0. 전체 audit dev moderate 4건.
- README 및 docs/QA.md 갱신. 재현용 wrangler.local.json 및 db 스크립트 추가.
- 다음은 Git 커밋, 패키징, push/save/private deploy 및 운영 확인.


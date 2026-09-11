# 아키텍처

## 구성
Sites 공식 Vinext + React 19 + TypeScript + Shadcn/Base UI를 유지한다. 서버는 Cloudflare Worker, 저장은 Sites가 제공하는 D1이다. 실제 AI API는 연결하지 않는다.

UI → 비동기 AI service → 결과 검증 → 사용자 확인 → POST /api/inventory → 도메인 검증/계산 → D1 원자적 저장 → 최신 snapshot.

- src/domain.ts: 수량/구매/원장/보관/우선순위. 모든 달력일은 Asia/Seoul.
- src/validation.ts: 신뢰 경계의 Draft/Command/State 검증. 원장 연속성, 참조, 잔액, 중복 ID, 날짜 검사.
- src/ai-service.ts: Provider 계약, JSON 검증, 취소, 타임아웃, 외부 오류 메시지 차단.
- src/ai.ts: Mock 구현과 동기 기본 브리핑. 원격 구현 없음.
- src/api.ts: 서버 통신, 15초 타임아웃, 검증된 legacy 가져오기.
- src/server/repository.ts: D1 prepared statements, optimistic concurrency(CAS), 재전송 처리.
- src/server/handlers.ts: HTTP/세션/Origin/본문 제한.
- app/api/inventory/route.ts: 런타임 DB 바인딩 연결.
- db/schema.ts, drizzle/: 생성된 스키마 마이그레이션. 런타임 DDL 없음.

## DB 설계
inventories(session_hash PK, snapshot JSON, revision, created_at, updated_at).
snapshot 안에서 User/InventoryItem/Purchase/AIAnalysis/InventoryTransaction을 구분한다. 현재 제품은 냉장고 전체를 한 번에 읽고 원장과 잔액을 함께 변경하므로 aggregate를 택했다. UPDATE ... WHERE session_hash=? AND revision=? 한 문장으로 둘의 불일치와 lost update를 방지한다. 분석 쿼리가 필요한 시점에 관계형 테이블로 점진 전환한다.

## 방문자 분리
로그인 없이 256-bit 랜덤 세션을 HttpOnly, SameSite=Strict 쿠키로 발급한다. HTTPS에서는 Secure이며 최대 유지 기간은 1년이다. DB에는 토큰의 SHA-256만 저장한다. 재고 ID를 알더라도 다른 세션의 식재료는 수정할 수 없다. 응답은 no-store/Vary Cookie. POST는 동일 Origin, JSON과 최대 1MiB 본문만 받는다.
쿠키를 지우면 기존 익명 냉장고에 다시 접근할 수 없다. 계정 연결/복구/다른 기기 동기화는 미구현이다. D1에 과거 익명 레코드의 자동 보존기간 정리는 아직 없으므로 실제 서비스 정책 결정 전 고려해야 한다.

## 일관성과 가져오기
서버 상태 revision이 요청과 다르면 409로 거절하고 UI에서 최신 값을 읽는다. 구매 batchId와 명령 id의 재전송은 다시 차감하지 않는다. reset은 명시 확인 후 진행한다.
이전 localStorage snapshot은 서버 revision=0일 때만 검증 후 가져온다. 원본은 백업으로 보존하고 성공 표시를 로컬에 기록한다. 서버에 이미 변경이 있으면 가져오기로 덮어쓰지 않는다. 브라우저 저장소를 읽을 수 없어도 새 서버 데모는 사용할 수 있다.

## 이미지와 AI
이미지는 선택/미리보기 후 분석 시 서비스 서버로 전달하며 영구 저장하지 않는다. 외부 AI 전송은 아직 없다. 현재 이미지 분석은 고정 샘플이다. 실제 Provider 연결은 사용자 승인 후 서버를 통해서만 수행한다. Provider가 날짜/수량을 직접 저장하지 않으며 최종 수정은 서버 도메인 로직이 담당한다.

## 상품 해석 경계
Draft.meaning optional v1로 기존 snapshot/DB migration 없이 호환한다. src/product.ts가 Mock 의미 해석을 수행하고 app/product-review.tsx가 수정/확인을 제공한다. 서버 등록에서 미확인 의미/잘못된 총량을 거절한다. 구매 총량은 재고 소비 이후에도 원본 의미로 보존된다.

## 서버 AI 게이트웨이

src/ai-client.ts → app/api/ai/route.ts → src/server/ai-handlers.ts → src/server/ai-provider.ts → AIProvider. 현재 Mock도 이 경로로 실행된다. 분석은 src/analysis.ts 및 schemas/analysis-result.schema.json의 envelope를 사용한다. 이미지 공통 제한은 src/image-input.ts. HTTP 입력은 크기 제한 스트림을 읽고 서버 세션의 D1 상태로 interpret/briefing을 실행한다.

실제 어댑터는 서버 composition root에만 추가한다. 환경변수는 Cloudflare 서버 env에서 읽고 브라우저 번들로 전달하지 않는다. remote는 미구현 상태에서 503으로 닫히며 재고 조회 자체는 AI 설정 오류와 분리한다.

## 제한 체험 예산 경계

/api/ai → AIBudget.run 예약(CAS) → createAIService 검증/timeout → 정산 → 검증된 결과 캐시. db/schema.ts의 ai_budget(snapshot/revision) 단일 장부에서 전역 비용·세션 횟수·진행중 요청을 함께 원자적으로 변경한다. ai_cache는 세션/입력/모델/가격 정책의 SHA-256 키로 분리한다. migration0001 추가. 입력 이미지는 저장하지 않는다. 불명확한 과금은 예약을 유지하고 유료 호출을 중단한다. /api/inventory는 예산 경로를 사용하지 않는다. 보호된 내부 상태는 /api/internal/ai-budget. 상세 비용 단위와 제약은 AI_PROVIDER_SETUP.md 참조.

## 영수증 입력/분류 확장

app/receipt-input.tsx는 두 파일 선택 UI와 하나의 파일 이벤트를 제공한다. Home의 selectImage/encodeImage/server 경계는 공통이다. src/receipt-resolution.ts는 OCR 이후 텍스트의 로컬 분류·후보 탐색을 담당하며 ProductExplorer 계약으로 분리한다. app/receipt-review.tsx는 unresolved 수정/제외/비식품 복원을 담당한다. ProductMeaning.resolution과 Draft.expiryDate는 optional이므로 D1 스키마 migration은 필요 없다. validateAnalysis/assertDraft가 신규 필드와 FOOD 상태를 검사한다. 구조화 JSON schema도 갱신했다. 분석 캐시 정책 version을2로 올렸으며 비용 장부/체험 quota는 초기화하지 않았다.

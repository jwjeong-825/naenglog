# OpenAI Provider 설정

## 현재 상태와 경계

OpenAI Responses API 서버 어댑터를 구현했다. 기본값은 AI_PROVIDER=mock. 실제 키 입력·계정 설정·외부 AI 호출·과금 실측은 수행하지 않았다. 아래 설정을 사용자가 완료해야 실제 인식이 활성화된다.

UI → src/ai-client.ts → POST /api/ai → ai-handlers → selectProvider → AIBudget 예약 → createAIService → openai-provider. UI/DB/도메인 계약은 유지한다. AI_PROVIDER=openai는 응답과 구매 기록에서 mode=remote로 매핑한다. 기존 remote 설정 문자열은 미지원이며 새 활성화 값은 openai다. 실제 키는 Worker 서버 env에서만 읽는다.

## 공식 API와 모델

서버 fetch로 POST https://api.openai.com/v1/responses를 1회 호출한다. 공식 REST 계약을 사용하며 SDK 의존성은 추가하지 않았다. 자동 retry0, redirect=error, AbortSignal, store=false, tools=[], service_tier=default, reasoning.effort=none. 호출 실패를 Mock 샘플 성공으로 바꾸지 않는다.

AI_MODEL 하나로 모델을 지정한다. 검증된 비용 프로필은 gpt-5.4-mini 또는 gpt-5.4-mini-2026-03-17이다. 다른 모델은 비전 상한/출력 옵션/가격 검증 후 지원 목록을 확장한다. 2026-09-14 공식 표준 단가: 입력 $0.75/1M, 출력 $4.50/1M. 이미지 토큰은 input에 이미 포함되므로 imagePerRequest=0. 캐시 할인을 가정하지 않는다. 이미지·텍스트·구조화 출력을 지원하고 짧은 설명/명령/영수증 분석의 비용과 지연을 고려했다. [모델/가격](https://developers.openai.com/api/docs/models/gpt-5.4-mini)

text.format=json_schema, strict=true를 사용한다. schemas/analysis-result.schema.json에서 모든 속성을 required로 바꾼 요청용 스키마를 만든다. 선택 expiryDate는 null을 받아 생략하며 resolution은 원격 응답에서 필수다. 기존 validateAnalysis/assertDraft/날짜·총량·정밀도 교차 검사는 계속 적용한다. schema 변경/추가 필드가 UI나 DB 계약 변경으로 이어지지 않는다. [구조화 출력](https://developers.openai.com/api/docs/guides/structured-outputs)

## 기능 및 안전장치

- analyze: 촬영/업로드/온라인 캡처가 동일 image={mimeType,base64}를 사용한다. 한 호출에서 이미지 인식→원본 상품명→상품 의미→정규화→FOOD rows/NON_FOOD excluded/UNCERTAIN unresolved를 반환한다. 원본명/브랜드/수량/단위/중량/구매일/보관 후보/개봉 구분/reasons 유지. 완제품을 분해하지 않고 가격을 수량으로 쓰지 않는다. 알 수 없는 의미 값은 null. 구매일 누락은 오늘을 확인용으로 제시하고 경고, 표시되지 않은 소비기한은 생성 금지.
- 원격 resolution.method=direct_ai만 허용. 웹 검색은 없다. 낮은 confidence 또는 score<0.7은 코드에서도 미확인 품목으로 이동한다. score는 모델 자기평가이며 보정된 확률이 아니다. confirmed는 항상 false로 초기화한다. 비식품은 제외 목록에서 복원 가능하다.
- interpret: 서버가 읽은 최신 재고의 활성 ID/이름/수량/단위/보관/days만 전달한다. 단일 Command 후보 또는 확인 질문만 반환한다. 같은 이름의 복수 로트/없는 대상/초과 소비/잘못된 명령은 거절한다. ID는 서버에서 생성한다. apply를 저장 없이 검사하며 최종 저장은 사용자 확인 후 기존 API에서 재검증한다. 부정·애매한 문장은 질문하도록 요청하지만 실제 문장 품질 실측은 남아 있다.
- briefing: D-Day/순위는 일반 코드가 계산한다. 설명/활용 아이디어만 생성한다. 빈 재고 또는 지난 시점이 있으면 코드에서도 menu를 비운다. 안전한 음식이라고 확정하지 않는다. 홈의 접힌 보관 안내에 표시한다.
- 잘못된 JSON/schema/refusal/incomplete/API 오류는 실패. 브리핑만 기존 기본 규칙 fallback과 출처 표시를 유지한다. 분석 실패를 실제 결과인 것처럼 대체하지 않는다.
- 영수증/OCR/재고 문자열은 명령 아닌 데이터라는 지침, 외부 도구0개, DB 쓰기 미제공, 검증/확인 경계를 함께 적용한다. 프롬프트만으로 완전한 인젝션 방어를 보장하지 않는다.

## 이미지·개인정보·한도

JPEG/PNG/WebP 1장/5MiB, MIME/magic bytes 검사, 전체 HTTP JSON7MiB 제한 유지. 원격 이미지 URL은 받지 않는다. 이미지/원본 문장/base64/키를 로그나 장부에 저장하지 않는다. 검증된 결과만 세션별 캐시/구매 기록에 저장한다. OpenAI 활성화 시 이미지와 입력은 OpenAI로 전송된다. 개인정보가 있는 영역은 업로드 전에 가리는 것을 권장한다. store=false는 제공자의 모든 보존 정책이 0일이라는 뜻이 아니다.

high detail 고정. 공식 모델 상한2,500 patches×1.2=3,000 vision tokens보다 넉넉한4,096을 입력 계산에 포함한다. 텍스트/지침/schema UTF-8 바이트 수와 프레이밍1,024를 합쳐 상한 검사. 완전 디코딩/픽셀 사전 검사/EXIF 제거/방향 정규화는 미구현이다. [이미지 계산](https://developers.openai.com/api/docs/guides/images-vision)

기존 AIBudget의 D1 CAS 선예약·정산·사용 횟수·캐시·중복 방지를 유지한다. 0.001원 단위 올림, 비용=(inputTokens×inputPrice+outputTokens×outputPrice)/1M×환율×1.2. 비전/추론을 포함한 실제 usage를 보고하며 응답 스냅샷을 검증한 뒤 설정 모델에 귀속한다. 실패 시 max(예약,실제), usage 누락/불명확/상한 초과는 예약 유지 및 후속 유료 요청 차단이다. 과금 확인 없이 장부를 초기화하지 않는다.

- 20,000원 경고/25,000원 강한 경고/27,000원 차단. 전체 동시3건·세션1건, 유료 요청 간격3초, 장부 최대1,000건. Mock은 별도0원 장부.
- 세션 분석4회/명령15회/브리핑 하루5회(한국 날짜). 실패도 포함. 재고 조회/직접 수량 수정/필터/저장은 무제한.
- 입력 토큰 분석16,000/기타6,000, 출력 분석3,000/명령500/브리핑700. retry0/호출1회. 식품5개를 우선하고 나머지는 미확인으로 보고하도록 요청한다. 출력 부족 시 부분 JSON을 등록하지 않는다.
- 표준 요금에20% 여유를 둔 예약은 분석$0.0306, 명령$0.0081, 브리핑$0.00918 상당. 첫날4/15/5회는 최대$0.2898×설정 환율 원(올림 제외). 실제 품질/비용 실측 후 조정.
- 결과 캐시24시간, 동일 요청 중복 방지, 상태 revision/한국 날짜 기반 명령·브리핑 키. 쿠키 삭제는 새 세션이지만 전역 예산은 유지된다.
- GET /api/internal/ai-budget에 별도 AI_BUDGET_ADMIN_TOKEN을 Authorization: Bearer 헤더로 보내면 비용/토큰/남은예산/기능별횟수/최근50건 확인. URL에 토큰을 넣지 않는다.

## 사용자가 직접 할 작업

1. [OpenAI Platform](https://platform.openai.com/)에서 냉로그 대회 전용 Project와 그 프로젝트 전용 API Key를 생성한다. 관리용 키를 앱에 넣거나 키를 채팅/GitHub에 공유하지 않는다.
2. Project settings → Limits → Spend → Edit spend limit에서 환율·수수료 여유를 둔 약30,000원 미만 상당 Monthly spend limit을 설정하고 **Enforce a hard limit**을 켠다. 알림과 구분한다. 계정에 강제 차단 옵션이 없으면 활성화하지 않는다. 월별 리셋은 대회 누적 한도가 아니므로 다음 달 한도를 남은 대회 예산 이하로 낮추고 종료 시 키를 폐기한다. [공식 한도 설정](https://developers.openai.com/api/docs/guides/spend-limits)
3. .env.example의 이름을 루트의 Git 무시 파일 `.dev.vars`에 복사한다. 사용자가 직접 AI_API_KEY와 해당 AI_PROJECT_ID를 넣는다. 같은 Project를 요청 헤더에도 지정한다.
4. AI_PROVIDER=openai, AI_MODEL=gpt-5.4-mini, AI_TIMEOUT_MS=15000. 실제 한도 설정 확인 후에만 AI_HARD_LIMIT_VERIFIED=true.
5. AI_PRICING_JSON에 아래 JSON을 넣되 krwPerCurrency를 실제 USD→KRW 결제 환율로, verifiedAt을 가격/환율 확인 ISO 시각으로 채운다. 7일 경과/미래 시각은 차단된다. 아래0/빈 시각은 **호출을 막는 자리표시자**이며 실제 가격 변경 시 단가도 갱신한다.

```json
{"model":"gpt-5.4-mini","currency":"USD","inputPerMillion":0.75,"outputPerMillion":4.5,"imagePerRequest":0,"krwPerCurrency":0,"verifiedAt":""}
```

6. 필요하면 별도 무작위32자 이상 AI_BUDGET_ADMIN_TOKEN을 server secret으로 설정한다. 어떤 키에도 NEXT_PUBLIC_/VITE_를 붙이지 않는다.
7. 아래 명령으로 실행한다. .dev.vars 변경 후 개발 서버 재시작. 자동 테스트는 fetch 대역만 사용한다. 실제 사진 분석은 사용자가 실행하는 순간 과금될 수 있다.

```sh
npm ci
npm run db:migrate:local
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

8. 운영은 Sites가 호스팅하는 Cloudflare Worker다. 해당 Site의 서버 설정에 **동일한 환경변수 이름**을 등록해야 하며 로컬 .dev.vars는 업로드되지 않는다. AI_API_KEY와 관리자 토큰은 Secret으로, 나머지도 서버 설정으로만 넣는다. 최신 어댑터 코드 및 기존0001 예산 migration 배포를 확인한 뒤 활성화한다. 다른 Worker나 공개 GitHub 설정에 넣지 않는다. 별도 Cloudflare Worker를 직접 운영하면 그 Worker의 Variables and Secrets에 같은 이름을 등록한다.

## 실제 영수증 확인

전용 테스트 세션에서 홈을 열고 브리핑 종료 후3초 이상 기다린다. 사진3~5품목 → 촬영/업로드 → 버튼이 예시가 아닌 이미지 분석인지 확인 → 사진 원본명/정규화명/수량/보관/비식품/미확인 후보와 비교 → 확인 후 등록. 중복 이름 없는 식품으로 빠른 기록의 소비/보관 이동을 확인하고 기록·새로고침·보관 안내까지 점검한다.

Network에는 서비스의 /api/ai만 있고 OpenAI 키는 없어야 한다. 내부 비용 상태의 paid 요청 수와 실제 input/output 토큰 증가를 확인한다. 실패 시 키를 공유하지 말고 오류 종류와 설정명만 확인한다. 자동 테스트는 실제 사진 정확도·계정 모델 접근권·실제 지연·실제 청구액을 검증하지 않는다. 이러한 실측 전에는 실제 연결 검증 완료라고 주장하지 않는다.

입력 예산 사전 검사에서 외부 호출 전에 거절한 input_limit만 예약액을 해제한다. 횟수는 유지한다. 실제 요청 실패/timeout/불명확한 usage에는 이 예외를 적용하지 않는다.

# AI Provider 연결 준비

## 현재 경계

UI → src/ai-client.ts → POST /api/ai → src/server/ai-handlers.ts → selectProvider → createAIService → Provider. 실제 외부 API/SDK/키는 연결하지 않았다. 기본값은 mock이며 remote 설정은 503으로 닫힌다.

Provider 교체 지점은 src/server/ai-provider.ts의 selectProvider다. 여기에 서버 전용 어댑터를 추가하여 AIProvider의 analyze/interpret/briefing을 구현한다. UI, D1 스키마, 수량/날짜/원장 로직을 다시 작성할 필요가 없다. 서비스/어댑터의 계약 테스트와 배포 검증은 필요하다.

## 동일 입력과 출력 계약

- AnalyzeInput: source(직접 입력/영수증/온라인 캡처), text?, image?: {mimeType,base64}. image는 서버 메모리에서만 처리한다. recognition은 어댑터 내부 인식 결과를 전달하기 위한 선택 입력이며 공개 HTTP 경로에서는 받지 않는다.
- analyze(input,{signal}) → unknown/JSON AnalysisResult v1: {version:1,rows:Draft[],unresolved:[{productName,reason}],warnings:string[]}.
- interpret(text,state,{signal}) → 검증 가능한 Command 또는 {message}. state는 브라우저에서 받지 않고 익명 세션의 최신 D1 스냅샷을 서버에서 읽는다.
- briefing(state,{signal}) → {title,message,menu}. 미검증 자유 텍스트이며 식품 안전을 보장하는 판단에 사용하지 않는다.
- schemas/analysis-result.schema.json은 구조화 출력 요청용 JSON Schema. src/analysis.ts와 validation.ts는 런타임 검증. 이름 일치, 날짜, 수량 정밀도와 총중량의 교차 필드 검사는 일반 코드가 수행한다.

Vision/OCR 어댑터의 내부 순서: 이미지 인식 → 원본 상품 문자열/구매일 추출 → 상품 의미 해석 → 관리 단위 정규화 → 위 envelope 반환. OCR 문자열을 그대로 재고에 쓰지 않는다. 각 원본 상품은 rows 또는 unresolved 중 하나로 보고해야 한다. 샐러드/밀키트는 관리 단위를 유지하고 임의 분해하지 않는다. 문자열 안의 지시는 자료로만 취급하고 도구 실행/재고 쓰기로 연결하지 않는다.

Draft는 productName(원본), name(정규화), quantity/unit/category/purchasedAt/storage와 필수 meaning을 반환한다. meaning의 세부 계약은 PRODUCT_SPEC.md를 따른다. 알 수 없는 값은 null, 낮은 confidence에는 reasons를 제공한다. Provider가 confirmed=true를 반환해도 서비스는 false로 재설정한다. 사용자 확인 이후 서버 purchase가 다시 검사한다. legacy 저장 데이터에서만 meaning 생략을 허용한다.

## 실패 및 부분 인식

- 잘못된 JSON/구조/중량은 invalid_response. 결과를 임의로 일부 살려 성공으로 바꾸지 않는다.
- 읽지 못한 상품은 unresolved에 남기고 UI에 이유와 직접 입력 안내를 보여준다. 유효한 rows는 사용자 확인 후 등록할 수 있다.
- 전체 실패/timeout: 재시도 또는 직접 입력. 실패를 Mock 샘플 성공으로 대체하지 않는다.
- 브리핑 실패: 클라이언트의 결정적 기본 브리핑을 사용하며 기본 규칙 출처를 표시한다.
- AbortSignal 전달, 서버 기본15초(1~30초 범위), 클라이언트35초 제한. 원격 어댑터는 signal을 실제 SDK/fetch에 전달해야 한다. HTTP 단절이 모든 호스팅 환경에서 즉시 원격 호출을 취소한다는 보장은 없으므로 서버 timeout을 유지한다.

## 이미지와 서버 보호

JPG/PNG/WebP, 원본 최대5MiB. 클라이언트와 서버가 MIME/용량을 검사하고 서버는 magic bytes도 확인한다. base64 요청 스트림 전체는7MiB로 제한한다. SVG/원격 URL 입력은 받지 않는다. 파일명과 이미지 원본을 DB/로그에 저장하지 않는다. Mock도 같은 서버 전송 경로를 거치되 외부 AI로 보내지 않는다.

이미지의 완전한 디코딩·픽셀 크기·EXIF 제거는 아직 구현하지 않았다. 실제 어댑터 활성화 전 픽셀 제한/방향 정규화/메타데이터 제거와 공급자의 이미지 제약을 검증한다.

요청은 동일 Origin과 HttpOnly 익명 세션을 요구한다. 분석 요청은 재고를 변경하지 않는다. 저장은 별도 확인 API에서 수행한다. 재고 기록의 provider는 저장 시 서버에 설정된 모드이며 개별 호출의 암호학적 출처 증명은 아니다.

## 환경변수

.env.example은 빈 키를 포함한 문서용 템플릿이다. Cloudflare 로컬은 ignored .dev.vars에 넣고 운영은 Sites 서버 환경변수/secret 설정을 이용한다. .env/.dev.vars 실제 파일은 Git에서 제외한다.

- AI_PROVIDER=mock: 기본값. remote는 현재 구현 없음.
- AI_TIMEOUT_MS=15000: 1000~30000.
- AI_MODEL=: 어댑터 선택 후 정할 모델 이름.
- AI_API_KEY=: 실제 연결 승인 후 서버 secret에만 저장.

NEXT_PUBLIC/VITE 접두사를 키에 사용하지 않는다. 키를 UI props, 응답, 로그, Git, 채팅에 넣지 않는다. 특정 공급자 endpoint/SDK/모델은 아직 선택하지 않았다.

## 실제 연결 시 사용자 최소 작업

1. 사용할 공급자/모델 및 비용 한도를 정하고 실제 연결을 승인한다.
2. 해당 공급자의 API 키를 운영 서버 secret 입력란에 직접 저장한다. 채팅/저장소에 전달하지 않는다.
3. 어댑터 구현·회귀 검증 완료 후 AI_MODEL/AI_PROVIDER를 활성화하고 비공개 실측 데모를 확인한다.

키만 넣는다고 현재 코드가 실제 호출을 시작하지 않는다. 개발자가 서버 어댑터를 구현해야 한다. 비용 guard는 아래와 같이 구현했다. 활성화 전 공급자 데이터 보존 정책, 실제 사진 품질/부분 인식 및 prompt-injection 평가가 남아 있다. 이는 지금 외부 호출로 검증하지 않는다.

## 대회 제한 체험 비용 통제 · 2026-09-10

현재 실제 모델/가격/환율은 선택하거나 설정하지 않았다. 모든 테스트 요금은 가상 값이며 유료 호출은 없다. 아래 준비만으로 실과금 30,000원 보장을 선언하지 않는다. 전용 Provider 한도와 환율/세금, 실제 adapter의 토큰 상한을 활성화 전에 함께 검증한다.

- 전체 대회 누적 장부 ID는 championship-2026로 고정한다. 월/배포/모델/키 교체로 초기화하지 않는다. Mock 장부는 별도이며 예상 과금은 0이다.
- 20,000원 경고 / 25,000원 강한 경고 / 최대 요청 비용을 예약했을 때 27,000원 초과하면 차단. 경고 상태는 보호된 내부 조회에 제공한다.
- 계산 단위는 정수 milliKRW(1/1000원). 요청 비용 = ceil(((inputTokens × inputPerMillion + outputTokens × outputPerMillion)/1,000,000 + imagePerRequest) × krwPerCurrency × 1.2 × 1000). 이미지 토큰은 inputTokens에 포함하며 별도 이미지 요금이 없는 모델은 imagePerRequest=0이다. 캐시 할인은 보수적으로 무시한다. 20% 여유는 세금/환율 오차 완충이며 환율 고정 보장이 아니다.
- 성공 시 서버 adapter가 보고한 전체 청구 토큰으로 정산한다. 실패/잘못된 JSON/timeout은 최대 예약비를 유지한다. 사용량 누락/잘못된 모델/상한 초과는 유료 장부를 중단 상태로 만든다. 이후 자동으로 다시 열지 않으며 운영자가 청구 내역과 장부를 대조해야 한다. 진행 중 요청이 120초를 넘으면 다음 요청에서 uncertain으로 표시하되 예약비를 환불하지 않는다.
- 익명 세션당 분석4회, 자연어15회(대회 누적), 브리핑5회/한국 날짜. 실패도 횟수에 포함. 실제 가격 확정 후 아래 요청 상한으로 최대 세션 비용을 계산해 필요하면 하향한다. 현재 횟수는 실측 최적화 값이 아니다.
- 동시에 전체3건/세션1건, 유료 요청 간격3초, 실패한 동일 요청60초 대기. 자동 재시도0, 요청당 Provider 호출1회. Vision→정규화는 한 호출의 구조화 응답으로 처리하거나, 여러 호출이 필요한 Provider라면 합산 예약 계약부터 확장해야 한다.
- 분석 입력12,000자, 자연어2,000자, 브리핑/명령의 서버 snapshot24,000자. 최대 입력 토큰 분석16,000/나머지6,000, 출력 토큰 분석3,000/명령500/브리핑700. 이미지1장/JPEG·PNG·WebP/5MiB, HTTP7MiB. 실제 adapter는 system prompt/JSON schema/이미지/추론 토큰을 포함해 이 상한을 강제해야 하며 SDK retries=0과 AbortSignal을 적용한다. 외부 도구/검색/별도 요금은 금지한다.
- 검증된 결과만 세션별 해시 캐시에24시간 보관한다. 동일 이미지의 입력 출처 변경은 같은 캐시를 사용한다. 명령/브리핑은 재고 revision 및 한국 날짜가 바뀌면 다시 판단한다. 캐시 조회는 횟수와 예산을 쓰지 않는다. 원본 이미지/입력 문장은 장부에 저장하지 않는다. 캐시 결과에는 상품 정보가 포함되므로 서버 비공개 저장이며 다음 성공 요청 시 만료 항목을 정리한다.
- 장부당 최대1,000건도 안전 차단한다. 제한 체험용 bounded aggregate이며 범용 대규모 서비스 설계가 아니다. 완료 결과 캐시가 만료되면 동일 요청은 중복 방지를 위해 다시 과금하지 않고 거절한다. 기존 등록 재고는 계속 조회할 수 있다.
- 쿠키 삭제/새 브라우저는 새 익명 세션이다. 개인별 강한 신원 제한은 아니지만 전역 예약 예산은 그대로 유지된다. 의미상 같은 이미지의 재인코딩/크롭은 별도 입력으로 취급된다.

### 서버 환경설정

.env.example에 빈 항목을 추가했다. 실제 값은 ignored .dev.vars 또는 운영 server secret에만 저장한다.

- AI_MODEL: 가격표의 model과 정확히 같아야 한다.
- AI_PRICING_JSON: {model,currency,inputPerMillion,outputPerMillion,imagePerRequest,krwPerCurrency,verifiedAt}. 숫자는 Provider 결제 통화 기준이며 verifiedAt은 가격과 환율을 확인한 ISO 시각. 7일이 지나거나 미래 시각이면 유료 호출 차단. 실가격 예시는 아직 제공하지 않는다.
- AI_PROJECT_ID: 다른 서비스와 공유하지 않는 대회 전용 프로젝트.
- AI_HARD_LIMIT_VERIFIED=false: 실제 하드 차단 설정을 확인한 뒤에만 true. 이 값은 운영자의 확인 표시이며 Provider 설정을 자동 생성/검증하지 않는다.
- AI_BUDGET_ADMIN_TOKEN: 선택적 내부 조회용 무작위32자 이상 secret. 미설정/인증 실패는404.
- 기존 AI_PROVIDER=mock, AI_TIMEOUT_MS=15000, AI_API_KEY 빈 값 유지.

GET /api/internal/ai-budget에 Authorization: Bearer 헤더로 내부 secret을 전달하면 유료/Mock 누적 토큰, 비용, 남은 예산, 기능별 횟수, 경고, 최근50건(세션 해시 제외)을 읽는다. URL 쿼리로 secret을 보내지 않는다. 공개 관리자 화면은 없다. 사용량이 없는 응답은 unknownUsage에 포함하고 비용은 예약 상한을 유지한다.

### Provider 쪽 이중 한도

공급자는 아직 미선택이다. OpenAI를 선택할 경우 현재 공식 [Projects API 문서](https://developers.openai.com/api/reference/typescript/resources/admin/subresources/organization/subresources/projects)는 project spend_limit을 hard spend limit으로 정의한다. spend alerts와 혼동하지 않는다. 실제 계정에서 제공되는 currency/interval/threshold 단위와 enforcement를 조회해 확인한 후, 결제 통화의 약30,000원보다 낮은 상당액으로 설정한다. 이 문서는 관리 API 호출이나 계정 변경을 수행했다는 뜻이 아니다.

하드 한도가 월별로 초기화되면 전체 대회 누적 한도가 아니다. 대회가 월을 넘기면 남은 대회 예산 이하로 다음 기간 한도를 낮추거나 종료 시 키를 폐기한다. 수수료/환율 여유를 남기며, 공급자가 확실한 차단을 제공하지 않으면 활성화하지 않는다. 관리 권한 키는 앱에 넣지 않는다.

### 활성화 전 최소 작업과 미완료

개발자가 서버 adapter에서 limits/reportUsage 계약, 모델 일치, 토크나이저/비전 상한, 과금 응답 매핑을 구현하고 가상 Provider 테스트를 통과시킨다. 사용자 승인 후 전용 Project/Key와 하드 한도를 설정하고 서버 secret에 직접 입력한다. 가격/환율 JSON 및 확인값을 설정하고 새 D1 migration을 운영에 적용한 다음 비공개로 작은 실제 요청을 검증한다. 아직 운영 migration/Provider hard limit/실제 가격/실제 adapter/유료 호출은 실행하지 않았다. 이미지 픽셀·EXIF 정규화와 인식 품질 실측도 남아 있다.

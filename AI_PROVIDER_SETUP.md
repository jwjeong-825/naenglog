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

키만 넣는다고 현재 코드가 실제 호출을 시작하지 않는다. 개발자가 서버 어댑터를 구현해야 한다. 활성화 전 요청당/세션당 비용 제한, 공급자 데이터 보존 정책, 실제 사진 품질/부분 인식 및 prompt-injection 평가가 남아 있다. 이는 지금 외부 호출로 검증하지 않는다.

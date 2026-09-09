# AI Provider 연결 안내

외부 AI 호출 없음. 실제 구현은 mockProvider 하나다.

## 계약
src/ai-service.ts의 AIProvider:
- mode: mock | fallback | remote (remote는 미래 교체를 위한 타입이며 구현 없음)
- analyze({source,text?}, {signal}) → Promise<unknown>
- interpret(text,state,{signal}) → Promise<unknown>
- briefing(state,{signal}) → Promise<unknown>

createAIService(provider)는 모든 unknown/JSON을 런타임 검증한 뒤 다음 값을 반환한다.
- analyze → Draft[] (1~50개, 이름/상품명/수량/단위/분류/구매일/보관)
- interpret → Command 또는 단일 message. command itemId는 현재 재고에 존재해야 한다.
- briefing → {title,message,menu}; 길이·필수 필드 검사.

## 실패/취소
5초 기본 타임아웃, AbortSignal 전달, invalid_response/timeout/cancelled/unavailable 구분. 화면 이동은 요청을 취소하고 오래된 결과를 적용하지 않는다. 잘못된 JSON이나 명령은 재고 수정으로 이어지지 않는다. 원격 Provider의 내부 오류/키 정보는 사용자에게 노출하지 않는다.
브리핑 실패 때만 명시적으로 '분석 지연 · 기본 규칙 안내'를 표시해 결정적 브리핑을 사용한다. 이미지 분석 실패는 샘플 성공으로 위장하지 않는다. 현재 이미지 모드는 샘플 체험임을 항상 고지한다.

## 향후 실제 연결
사용자 허가 후 서버 Provider/API를 작성하고 기존 인터페이스에 연결한다. 이미지 입력 계약은 서버 파일 식별자로 확장해야 한다. API 키와 모델은 아직 정하지 않았으며 .env에 키를 만들지 않았다. 키를 NEXT_PUBLIC이나 브라우저에 넣지 않는다.
현재 서버 API는 /api/inventory이며 수량·보관 수정만 담당한다. AI 응답은 UI에서 검증되고, 재고 변경은 서버에서 다시 검증한다. 교체 이후에도 이 두 경계를 유지한다.

## 상품 의미 해석을 위한 확장

AnalyzeInput은 source/text 외에 recognition?: {text, purchasedAt?, assetId?}를 받을 수 있다. 향후 서버 Vision/OCR 어댑터가 이미지 식별자로 인식을 수행한 뒤 상품 의미를 해석하여 Draft[]를 반환한다. 현재 assetId를 업로드/조회하는 구현은 없고, 직접 입력에서 recognition.text를 사용할 수 있다. 이미지 모드는 입력 이미지와 무관한 명시적 고정 예시다. recognition.purchasedAt 추출 결과의 적용은 향후 어댑터 책임이며 현재 Mock은 오늘을 제안한다.

Draft.meaning: ProductMeaning v1(src/product.ts). 원본 productName은 그대로 보존하고 name/meaning.normalizedFoodName이 정규화된 관리 단위다. category/quantity/unit/purchasedAt/storage는 Draft 기존 필드, brand/weightPerUnit/weightUnit/totalWeight/packaging/storageCandidates/processed/openingSensitive/confidence/reasons/confirmed는 meaning 필드다. API 어댑터는 refrigerated/frozen/ambient를 냉장/냉동/실온으로 명시 변환한다.

응답의 확인 완료 표시는 신뢰하지 않는다. createAIService가 confirmed=false로 재설정하고 사용자 UI에서 확인한다. 의미가 불분명하면 confidence=low와 이유, 미확인 null을 반환한다. 완제품은 관리 단위를 유지한다. 서버는 등록 전 의미 스키마와 총량, 확인 여부를 다시 검사한다. 기존 D1 데이터 호환을 위해 meaning은 optional이다. 새 Mock 분석은 항상 meaning을 포함한다.

이 계약은 향후 Provider 연결 경계이며 실제 OCR/AI 성능 검증 완료를 의미하지 않는다. 모델 호출, 키, 유료 API는 추가하지 않았다.

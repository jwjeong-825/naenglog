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

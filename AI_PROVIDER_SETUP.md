# AI Provider 연결 안내

현재 외부 AI 호출은 0회다. src/ai.ts의 AIProvider 계약과 mock 구현만 존재한다.
- analyze({source,text?}) → Draft[]: name, productName, quantity, unit, category, purchasedAt, storage.
- interpret(text,state) → {id,itemId,action,quantity?,storage?} 또는 {message}.
- briefing(state) → {title,message,menu}.
UI는 Provider에만 의존하며 수량/날짜/실행은 src/domain.ts가 담당한다.

## 향후 연결 위치
사용자 허가 후 서버 API와 RealProvider를 추가한다. 이미지 입력 계약은 File 자체 대신 업로드된 파일 식별자로 확장한다. Provider 응답을 런타임 스키마로 검증하고 itemId가 사용자 재고인지 확인한다. 보관 정책은 출처와 개봉 상태를 포함하도록 보강한다.
서버 환경 변수의 구체적 키명/모델은 아직 정하지 않는다. 키는 클라이언트 코드나 NEXT_PUBLIC 변수에 두지 않는다.
현재 briefing은 동기 규칙 함수다. 실제 원격 브리핑 단계에서 비동기 결과 상태 훅을 추가해야 하며 단순 파일 교체만으로 네트워크 로딩이 완성되지는 않는다.

## 실패 정책
시간 초과/JSON 오류/할당량/키 누락을 분류하고 친절한 재시도 안내를 반환한다. 규칙 기반 결과를 보여줄 때 반드시 fallback 출처를 표시한다. 이미지 분석 실패를 고정 샘플 성공으로 위장하지 않는다. 재고 변경은 검증/확인 후 별도 실행하며 AI가 직접 DB 수량을 변경하지 않는다.

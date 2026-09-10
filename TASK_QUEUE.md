# 작업 큐 · 2026-09-10

## 현재 사이클

제한 체험 비용 guard/캐시/세션 quota/관리 상태/한도 UX 구현. 실제 API/키/가격 미설정. 테스트32개/typecheck/lint/build/로컬 migration/민감정보 검사 완료. 기능 단위 commit/push 후 아래 다음 우선순위를 따른다.

## 다음 우선순위

1. 이미지 픽셀 상한·방향·EXIF 정규화와 대표 영수증 품질 평가 fixture.
2. 변경된 migration과 데모 흐름을 비공개 배포에서 확인(운영 현재 버전2).
3. 실제 연결 승인 후에만 Provider adapter/tokenizer/usage 매핑 및 전용 Project hard limit·가격·환율 설정. 현재 설정만으로 실제 호출은 불가능하다.
4. 동일 이름 로트가 없는 대표 시연, 식품 정책 표시 검토. 기능 수 확대는 후순위.

## 유지

유료 API/secret 입력 없음. GitHub main이 공식 기록. GitHub 공개와 Sites 공개 승인은 별개다. 전역 비용 장부를 배포/월별로 초기화하지 않는다.

# 아키텍처

Sites 공식 Vinext + React 19 + TypeScript + 기본 Shadcn 컴포넌트를 유지한다. 모바일 웹과 Sites 배포를 빠르게 연결하기 위한 선택이다.

UI → AIProvider(현재 Mock) → 검증된 Command/Draft → 도메인 함수 → 저장 어댑터 → UI.
src/domain.ts: 순수 계산과 원장 갱신. src/ai.ts: 교체 가능한 async Provider. src/storage.ts: 버전 스냅샷 저장/검증. app/page.tsx: 화면 통합.
Demo는 회원가입 없는 브라우저별 저장. 서버 DB는 아직 없고 localStorage는 관계형 DB를 대체하는 생산 환경 설계가 아니다. 구매·거래·분석 엔티티를 나눠 향후 서버 트랜잭션으로 이동한다.
이미지는 브라우저 미리보기만 제공하고 저장·외부 전송하지 않는다. 실제 OCR이 없으므로 샘플 결과 표시. 실제 Provider는 향후 서버 경유하며 키를 클라이언트에 두지 않는다.

# 재개 상태 · 2026-09-08

## 완료
- 빈 저장소 분석, 공식 Sites 템플릿 생성, 제품/명세/개발규칙/아키텍처/AI 연결 문서.
- src/domain.ts 재고·구매·원장·날짜·우선순위, src/ai.ts 모의 분석/자연어/브리핑, src/storage.ts 저장 및 오류 검증.
- app/page.tsx 모바일 6화면, 이미지 선택/미리보기/샘플 분석/수정/등록, 명령 확인, 상세 편집, 기록과 초기화.
- 기존 7개 도메인 시나리오 테스트 통과. 부정 명령/이미지 샘플 테스트 2개 추가 후 재검증 필요.
- 1차 타입검사/직접 작성 코드 lint/프로덕션 빌드 통과. 의존성 보안 수정 후 최종 재검증 진행.
- 문서 커밋 cfc9887. 기능 커밋은 최종 검사 후 수행.

## 진행 및 문제
- 배포 URL 미확정. Sites project_id는 .openai/hosting.json에 저장됨. 절대로 새 Site를 생성하지 말 것.
- 새 의존성 조합으로 빌드 진행 중. 로컬 HTTP 확인이 초기 500/시간 초과를 보여 해결 필요.
- npm audit 남은 6건은 오래된 직접 devDependency wrangler 4.92.0 계열. wrangler@4.129.1로 교체하려면 @cloudflare/workers-types@5.20260907.1 이상을 함께 설치해야 함. peer 검증을 끄지 말 것.
- lint:all의 템플릿 UI 기존 경고는 별도이며 직접 작성 코드 검사에서 숨기지 않았음.
- 서버 DB/실제 OCR/AI/공개 심사용 접근/스크린샷/E2E는 아직 완료 아님. 현재 저장은 localStorage.

## 다음 정확한 작업
1. 진행 중 설치/빌드 결과 확인 후 Wrangler와 workers-types 호환 버전을 함께 설치.
2. npm run typecheck, npm test, npm run lint, npm run build 모두 확인.
3. npm run dev 출력 Local URL에 HTTP 200 확인 후 미리보기 열기. 500 원인을 실제 로그로 해결.
4. 기능 단위 Git 커밋. 기존 Sites에 소스 push → 공식 package-site.sh 패키징 → 버전 저장 → 배포 상태 확인.
5. 요청한 무로그인 심사용 공개 접근 가능 여부 확인. 완료 결과/한계를 README·TASK_QUEUE·CHANGELOG에 갱신.
6. 서버 DB 및 실제 브라우저 E2E, 식품 정책 근거 검토. 실제 AI는 사용자가 명시적으로 허용하기 전 금지.

## Windows 실행
PATH에 다음 Node 폴더와 npm 폴더를 추가:
- C:/Users/jjw08/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin
- $env:TEMP/naenglog-sites-setup/node_modules/.bin
Git: C:/Users/jjw08/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe
셸 소유권 경고 시 명령별 -c safe.directory=현재 저장소 절대경로. 전역 safe.directory 변경 금지.
내장 pnpm create는 Windows 링크 오류. 공식 생성기는 임시 디렉터리에 hoisted/copy 설치했으며 이미 초기화 완료. 재초기화하지 말 것.

## 최신 갱신
Wrangler/Workers 타입 업데이트 성공, npm audit 0건. 9개 테스트 및 타입/lint 통과. 로컬 GET / HTTP 200 확인 및 미리보기 열기 요청 성공(queued). 초기 500은 개발 번들 준비 중 발생했고 재시도 200. 최종 빌드 진행 중.
기능 엔진 커밋 24a2822. 배포 패키징용 공식 스크립트의 LF 정규화 사본과 Windows Node 브리지는 ignored work/에 준비. `bash work/package-windows.sh`로 실행(WSL). 원본은 변경하지 않았다.

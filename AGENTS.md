# 한글 UI 플러그인 작업 규칙

- README.md를 읽고 작업한다. 이 레포는 Paperclip UI 오버레이만 관리한다.
- 문구는 locales의 카탈로그에 둔다. 한/EN 전환 시 원문 복원을 유지한다.
- 이슈 본문·코드·로그·상태 토큰·모델 ID·SKILL.md 원문은 번역하지 않는다.
- Paperclip 공식 dist, 회사 DB, 인증 값은 수정하거나 이 레포에 넣지 않는다.
- npm ci와 npm run build로 검증한다. UI 변경은 실제 한/EN 전환도 확인한다.
- PR에 변경 범위·검증 결과·호환 Paperclip 버전을 적는다. 릴리스는 사람 승인 후 진행한다.

# Paperclip 2026.916.1 한글 UI 페이지 점검 범위

기준: Paperclip 소스 `bd2c7e197`의 `ui/src/App.tsx`, 한글 오버레이 플러그인 브랜치 `codex/upstream-korean-ui-20260926` v1.1.29. 이 문서는 실제 화면을 모두 확인했다는 증거가 아니다.

`App.tsx`의 문자열 `path` 선언 231회, 고유 패턴 170개를 추출했다. 동적 `path={...}` 2곳은 이 목록에 포함되지 않는다. 같은 경로가 기능 플래그에 따라 다른 화면을 렌더링하거나 리다이렉트할 수 있다.

| 화면군 | 고유 경로 수 | 이번 카탈로그 대조·패치 | 실제 브라우저 |
|---|---:|---|---|
| 인증·가입 | 7 | 초대·CLI 인증·보드 소유권 문구 일부를 1.1.28에서 추가 | 인증 화면 미검증; 기존 로그인 상태에서 리다이렉트됨 |
| 대시보드·셸 | 2 | 사이드바, 알림, 에이전트 채팅 문구를 1.1.27에서 추가 | 대시보드 DOM 확인 |
| 인박스·작업 | 17 | 이슈 카드 항목 판정과 작업 메뉴를 1.1.26–29에서 추가 | 인박스·작업 상세 DOM 확인, 작업 상세 한/EN 왕복 |
| 대화·회의실 | 3 | 채팅 선택기 일부를 1.1.27에서 추가; 대화 본문은 번역 대상 제외 | 미검증 |
| 회사·인스턴스 설정 | 32 | 실험 설정, 내보내기·가져오기, 시크릿, 어댑터 문구를 1.1.27–29에서 추가 | 실험 설정·환경 생성·플러그인·시크릿·가져오기 DOM, 실험 설정 화면·한/EN 왕복 |
| 앱·커넥터 | 29 | 연결·권한·신원 범위·서비스 설명을 1.1.27–29에서 추가 | 앱 목록·직접 연결 DOM, 앱 목록 화면·한/EN 왕복; OAuth 흐름 미검증 |
| 에이전트 | 5 | 상세 문맥 탭과 지침/실행 패널 문구를 1.1.27–29에서 추가 | 에이전트 생성·상세 DOM; 생성 대화상자 뒤의 언어 토글은 클릭 불가 |
| 프로젝트·작업공간 | 16 | 실행 작업공간·파일 뷰어 문구를 1.1.28–29에서 추가 | 프로젝트·작업공간 목록 DOM; 상세·파일 뷰어 미검증 |
| 스킬·위키 | 6 | 스킬 스튜디오 문구를 1.1.28에서 추가; 위키 일부는 기존 카탈로그 유지 | 스킬 스튜디오 DOM; 위키 미검증 |
| 루틴·파이프라인·케이스 | 13 | 루틴·단계·케이스 문구를 1.1.27–29에서 추가 | 루틴 목록 DOM; 파이프라인·케이스는 기능 플래그/리다이렉트로 미검증 |
| 목표·승인·산출물 | 9 | 기존 카탈로그 유지; 신규 전체 고정 문구 대조는 미완료 | 승인 목록 DOM; 목표·산출물 미검증 |
| 감사·상태·비용 | 22 | 감사·재무·타임라인 문구를 1.1.27–29에서 추가 | 비용 화면 DOM·한/EN 왕복; 다른 감사 화면은 미검증 |
| 개발·실험 | 6 | 실험/개발 경로는 실제 화면 미검증; 신규 고정 문구 대조 미완료 | 미검증 |
| 기타·동적 | 3 | 동적·와일드카드 경로는 페이지 단위 검증 불가; 플러그인 자체 라우트 별도 확인 필요 | 미검증 |

1.1.28에서 추가한 영어 키 1,034개 중 1,029개는 위 Paperclip UI 소스에 정확한 문자열로 존재한다. 나머지 5개는 조합/접근성 문구 또는 과거 버전 호환 문구로서 별도 DOM 확인이 필요하다. 이 수치는 **추가된 키의 출처 확인**이며 UI 전체 영어 문구의 누락률을 뜻하지 않는다. 1.1.29는 아래 브라우저 검수에서 발견한 항목을 추가로 고쳤다.

`npm ci`, `npm test`(51개 통과), `npm run build`, `npm pack --dry-run`은 분리된 작업 트리에서 통과했다. 모의 DOM 테스트는 일부 대표 라우트의 KO 치환과 EN 원문 복원을 검사한다. 실제 플러그인 설치·권한별 화면·모든 모달 상태는 확인하지 못했다. 특히 인증/온보딩, 승인/결정, 앱 OAuth, 동적 플러그인 라우트는 라이브 적용 뒤 별도 검수가 필요하다.

## 2026-09-26 브라우저 검수

인증된 로컬 Paperclip `2026.916.1-aoom.8`을 헤드리스 Chromium으로 열고, 브라우저 응답에서 현재 설치된 한글 UI 번들만 이 작업 트리의 빌드로 일시 교체했다. 서버의 설치 플러그인·DB·공식 dist는 바꾸지 않았다. 이 방식은 UI 렌더링 확인에는 유용하지만 **v1.1.29 설치 검증은 아니다**. 실회사 화면의 캡처·로그는 공개 레포에 넣지 않았다.

- 위 목록 중 매개변수와 와일드카드가 없는 경로 104개를 열어 HTTP/렌더링 오류를 살폈다. 브라우저 탐색 자체는 전건 성공했고 26개는 실제 경로가 다른 곳으로 이동했다. 이 경로 탐색을 104개 페이지의 시각 검수로 계산하지 않는다.
- 18개 대표 경로에서 DOM의 문구·접근성 속성·스크립트 오류를 살폈다. 수집 시점의 페이지 스크립트 오류는 0건이었다. 설정 실험 화면과 앱 목록의 첫 화면을 눈으로 확인했다.
- 설정 실험, 앱 목록, 비용, 작업 상세에서 브라우저 버튼으로 **한→EN→한** 전환과 원문 복원을 확인했다. 에이전트 생성 대화상자는 배경의 언어 버튼을 가려 그 자리에서 전환할 수 없었다.
- 남은 영어를 찾아 설정 설명·환경 필드·앱 카탈로그 설명·비용 통계·루틴 분할 텍스트를 보강했다. 기존 카탈로그의 특정 회사 작업 판단 문장도 제거했다. API 원문·회사명·에이전트명·상태 토큰은 번역하지 않는 경계를 유지했다.
- 다음 검수는 실제 v1.1.29 설치·재시작, 인증 화면, 모든 데이터/빈 화면 조합, 동적 상세·모달, 별도 회사 격리, 키보드/모바일, 원문 복원 및 남은 영어의 화면별 수집이다.

## App.tsx 경로 목록

아래는 소스에 선언된 경로 인벤토리다. 목록에 있다는 사실만으로 해당 페이지의 모든 문구가 번역되거나 실제 화면이 검증됐다는 뜻은 아니다.

### 인증·가입

- `auth`
- `board-claim/:token`
- `cli-auth/:id`
- `companies`
- `invite/:token`
- `oauth-handoff`
- `onboarding`

### 대시보드·셸

- `dashboard`
- `dashboard/live`

### 인박스·작업

- `inbox`
- `inbox/all`
- `inbox/blocked`
- `inbox/mine`
- `inbox/new`
- `inbox/recent`
- `inbox/requests`
- `inbox/unread`
- `issues`
- `issues/:issueId`
- `issues/active`
- `issues/all`
- `issues/backlog`
- `issues/done`
- `issues/recent`
- `search`
- `tasks`

### 대화·회의실

- `board-chat`
- `chat-identity/confirm`
- `chats/:agentRef`

### 회사·인스턴스 설정

- `company/export/*`
- `company/import`
- `company/settings`
- `company/settings/:settingsRoutePath/*`
- `company/settings/access`
- `company/settings/cloud-upstream`
- `company/settings/environments`
- `company/settings/instance`
- `company/settings/instance/access`
- `company/settings/instance/adapters`
- `company/settings/instance/environments`
- `company/settings/instance/environments/:environmentId/edit`
- `company/settings/instance/environments/new`
- `company/settings/instance/experimental`
- `company/settings/instance/general`
- `company/settings/instance/heartbeats`
- `company/settings/instance/plugins`
- `company/settings/instance/plugins/:pluginId`
- `company/settings/instance/profile`
- `company/settings/invites`
- `company/settings/members`
- `company/settings/secrets`
- `company/settings/tools`
- `company/settings/tools/:tab`
- `instance`
- `instance/settings`
- `instance/settings/*`
- `instance/settings/adapters`
- `settings`
- `settings/*`
- `tools`
- `tools/:tab`

### 앱·커넥터

- `apps`
- `apps/:connectionId`
- `apps/:connectionId/:tab`
- `apps/advanced`
- `apps/advanced/:tab`
- `apps/advanced/audit`
- `apps/advanced/gateways`
- `apps/advanced/profiles/:profileId`
- `apps/advanced/profiles/:profileId/edit`
- `apps/advanced/profiles/new`
- `apps/advanced/run-your-own`
- `apps/app/:applicationId`
- `apps/app/:applicationId/:tab`
- `apps/attention`
- `apps/browse`
- `apps/byo`
- `apps/chat/:endpointId`
- `apps/chat/:endpointId/:tab`
- `apps/chat/connect`
- `apps/connect`
- `apps/connect/:appKey`
- `apps/connect/:appKey/:stage`
- `apps/connections`
- `apps/gateways`
- `apps/gateways/:gatewayId`
- `apps/gateways/:gatewayId/:tab`
- `apps/review`
- `apps/vercel-connect`
- `plugins/:pluginId`

### 에이전트

- `agents`
- `agents/:agentId`
- `agents/:agentId/:tab`
- `agents/:agentId/runs/:runId`
- `agents/new`

### 프로젝트·작업공간

- `execution-workspaces/:workspaceId`
- `execution-workspaces/:workspaceId/configuration`
- `execution-workspaces/:workspaceId/issues`
- `execution-workspaces/:workspaceId/routines`
- `execution-workspaces/:workspaceId/runtime-logs`
- `execution-workspaces/:workspaceId/services`
- `projects`
- `projects/:projectId`
- `projects/:projectId/budget`
- `projects/:projectId/configuration`
- `projects/:projectId/issues`
- `projects/:projectId/issues/:filter`
- `projects/:projectId/overview`
- `projects/:projectId/workspaces`
- `projects/:projectId/workspaces/:workspaceId`
- `workspaces`

### 스킬·위키

- `skills/*`
- `skills/:skillId/studio`
- `skills/studio`
- `skills/studio/:skillId`
- `skills/studio/new`
- `u/:userSlug`

### 루틴·파이프라인·케이스

- `cases`
- `cases/:caseIdentifier`
- `learnings`
- `pipelines`
- `pipelines/:pipelineId`
- `pipelines/:pipelineId/add`
- `pipelines/:pipelineId/cases/:caseId`
- `pipelines/:pipelineId/items/:caseId`
- `pipelines/:pipelineId/settings`
- `review-queue`
- `routines`
- `routines/:routineId`
- `routines/:routineId/:section`

### 목표·승인·산출물

- `approvals`
- `approvals/:approvalId`
- `approvals/all`
- `approvals/pending`
- `artifacts`
- `decisions`
- `decisions/queues/:key`
- `goals`
- `goals/:goalId`

### 감사·상태·비용

- `activity`
- `activity/*`
- `activity/budgets`
- `activity/costs`
- `activity/runs`
- `activity/timeline`
- `audit`
- `audit/*`
- `audit/activity`
- `audit/budgets`
- `audit/costs`
- `audit/runs`
- `audit/timeline`
- `budgets`
- `costs`
- `org`
- `runs`
- `status`
- `status-cards`
- `status-cards/:cardId`
- `status/:cardId`
- `timeline`

### 개발·실험

- `design-guide`
- `dev/task-chat-lab`
- `tests/perf/long-thread`
- `ux-lab/bootstrap-setup`
- `ux-lab/cross-issue-collaboration`
- `ux-lab/responsible-user-denial`

### 기타·동적

- `*`
- `:companyPrefix`
- `:pluginRoutePath/*`

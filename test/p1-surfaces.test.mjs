import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const overlaySource = readFileSync(new URL('../src/ui/overlay.js', import.meta.url), 'utf8')
  .replaceAll('export function', 'function');

function loadOverlay(pathname) {
  const context = vm.createContext({
    chromeCatalog: JSON.parse(readFileSync(new URL('../locales/chrome.ko.json', import.meta.url))),
    window: {
      location: { pathname },
      innerHeight: 800,
      getComputedStyle: () => ({ transform: 'none' }),
      localStorage: { getItem: () => 'ko', setItem() {} },
    },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    NodeFilter: { SHOW_TEXT: 4 },
    HTMLElement: class HTMLElement {},
    document: { title: '', createTreeWalker() { return { nextNode: () => false }; } },
  });
  vm.runInContext(
    overlaySource + '\nthis.translateTextNode = translateTextNode;\nthis.translatePageTitle = translatePageTitle;\nthis.translateAttrs = translateAttrs;',
    context,
  );
  return context;
}

function ko(pathname, value) {
  const ctx = loadOverlay(pathname);
  const node = { nodeType: 3, nodeValue: value, parentElement: { closest: () => null } };
  ctx.translateTextNode(node, 'ko');
  return node.nodeValue;
}

test('live QA findings translate only on their pages and restore English', () => {
  const rows = [
    ['/EXAMPLE/company/settings/instance/experimental', 'Turning this off preserves conversations and lets active runs finish, but prevents new messages.', '끄면 기존 대화는 보존하고 진행 중인 실행은 마칠 수 있지만, 새 메시지는 보낼 수 없습니다.'],
    ['/EXAMPLE/company/settings/instance/environments/new', 'Strict host key checking', '호스트 키 엄격 검증'],
    ['/EXAMPLE/apps', "Connect Cloudflare's provider-hosted MCP server.", 'Cloudflare가 호스팅하는 MCP 서버에 연결합니다.'],
    ['/EXAMPLE/activity/costs', 'Last 30 Days', '최근 30일'],
    ['/EXAMPLE/routines', '4 routines', '루틴 4개'],
    ['/EXAMPLE/workspaces', 'Showing 50 of 141 workspaces.', '작업공간 141개 중 50개 표시'],
    ['/EXAMPLE/issues/EX-1', 'Automatic recovery of this task stopped.', '이 작업의 자동 복구가 중단되었습니다.'],
    ['/EXAMPLE/projects', '5 tasks', '작업 5개'],
    ['/EXAMPLE/apps/byo', 'Any remote tool URL works here — including a local MCP server like', '원격 도구 URL을 입력하세요. 로컬 MCP 서버도 사용할 수 있습니다. 예:'],
  ];
  for (const [pathname, en, expected] of rows) {
    const ctx = loadOverlay(pathname);
    const node = { nodeType: 3, nodeValue: en, parentElement: { closest: () => null } };
    ctx.translateTextNode(node, 'ko');
    assert.equal(node.nodeValue, expected, `${pathname}: KO`);
    ctx.translateTextNode(node, 'en');
    assert.equal(node.nodeValue, en, `${pathname}: EN`);
  }
  assert.equal(ko('/EXAMPLE/dashboard', 'Last 30 Days'), 'Last 30 Days');
  assert.equal(ko('/EXAMPLE/dashboard', 'Strict host key checking'), 'Strict host key checking');
  const catalog = JSON.parse(readFileSync(new URL('../locales/chrome.ko.json', import.meta.url)));
  assert.equal(JSON.stringify(catalog).includes('Definish Finish'), false);
  const ctx = loadOverlay('/EXAMPLE/dashboard');
  const attrs = { 'aria-label': 'Open Example organization switcher' };
  const switcher = {
    nodeType: 1,
    closest: selector => selector === 'button' ? {} : null,
    hasAttribute: name => name in attrs,
    getAttribute: name => attrs[name] ?? null,
    setAttribute: (name, value) => { attrs[name] = value; },
  };
  ctx.translateAttrs(switcher, 'ko');
  assert.equal(attrs['aria-label'], 'Example 조직 전환 열기');
  ctx.translateAttrs(switcher, 'en');
  assert.equal(attrs['aria-label'], 'Open Example organization switcher');
});

test('experimental, settings, and skill controls translate and restore without touching content', () => {
  const rows = [
    ['/EXAMPLE/company/settings/instance/experimental', 'Toggle it off and back on to arm execution for tasks created here.', '이곳에서 생성한 작업을 실행 가능하게 하려면 껐다가 다시 켜세요.'],
    ['/EXAMPLE/instance/settings/general', 'Configure instance-wide preferences', '인스턴스 전체 설정'],
    ['/EXAMPLE/company/settings/instance/adapters', 'Adapter reinstalled', '어댑터를 다시 설치했습니다'],
    ['/EXAMPLE/company/settings/secrets', 'Paperclip never re-displays stored values.', 'Paperclip은 저장된 값을 다시 표시하지 않습니다.'],
    ['/EXAMPLE/skills', 'This skill cannot be installed — content is not valid Agent Skills markdown.', '유효한 Agent Skills 마크다운이 아니므로 설치할 수 없습니다.'],
    ['/EXAMPLE/skills', 'Installed skills', '설치된 스킬'],
    ['/EXAMPLE/skills', 'Skills available to this organization.', '이 조직에서 사용할 수 있는 스킬입니다.'],
    ['/EXAMPLE/skills', 'Enabled for 1 agent', '에이전트 1명에게 사용 설정됨'],
    ['/EXAMPLE/skills', '24 skills', '스킬 24개'],
    ['/EXAMPLE/skills/example/studio', 'Unsaved edits live only in this Studio session. Save to create the next version before running tests or switching files.', '저장하지 않은 변경은 현재 스튜디오 세션에만 남습니다. 테스트를 실행하거나 파일을 바꾸기 전에 저장해 다음 버전을 만드세요.'],
    ['/EXAMPLE/agents/example/skills', 'Automatic and detected skills (read-only)', '자동·감지된 스킬(읽기 전용)'],
  ];
  for (const [pathname, en, expected] of rows) {
    const ctx = loadOverlay(pathname);
    const node = { nodeType: 3, nodeValue: en, parentElement: { closest: () => null } };
    ctx.translateTextNode(node, 'ko');
    assert.equal(node.nodeValue, expected, `${pathname}: KO`);
    ctx.translateTextNode(node, 'en');
    assert.equal(node.nodeValue, en, `${pathname}: EN`);
  }
  assert.equal(ko('/EXAMPLE/dashboard', 'Adapter reinstalled'), 'Adapter reinstalled');
  const ctx = loadOverlay('/EXAMPLE/skills/example/studio');
  const original = 'Unsaved edits live only in this Studio session. Save to create the next version before running tests or switching files.';
  const content = { nodeType: 3, nodeValue: original, parentElement: { closest: (selector) => selector.includes('.prose') ? {} : null } };
  ctx.translateTextNode(content, 'ko');
  assert.equal(content.nodeValue, original);
  for (const selector of [
    'a[href*="/skills/"] span.font-medium',
    'div.truncate.font-mono.text-sm.font-medium.text-foreground',
    'p.max-w-3xl.text-sm.text-muted-foreground',
    'h1.text-2xl.font-semibold',
  ]) {
    const skillValue = { nodeType: 3, nodeValue: 'Source', parentElement: { closest: (candidate) => candidate === selector ? {} : null } };
    ctx.translateTextNode(skillValue, 'ko');
    assert.equal(skillValue.nodeValue, 'Source', `stored skill metadata: ${selector}`);
  }
});

test('routine folder hint split across React text nodes restores the original', () => {
  const ctx = loadOverlay('/EXAMPLE/routines');
  const raw = ['Group these ', 'routines', ' into folders to keep things tidy.'];
  const nodes = raw.map(value => ({ nodeType: 3, nodeValue: value }));
  const parent = { closest: () => null, get textContent() { return nodes.map(node => node.nodeValue).join(''); } };
  for (const node of nodes) node.parentElement = parent;
  for (const node of nodes) ctx.translateTextNode(node, 'ko');
  assert.equal(parent.textContent, '이 루틴을 폴더에 묶어 정리하세요.');
  for (const node of nodes) ctx.translateTextNode(node, 'en');
  assert.equal(parent.textContent, raw.join(''));
});

test('project task counts split across text nodes restore every node', () => {
  const ctx = loadOverlay('/EXAMPLE/projects');
  const raw = ['5', ' task', 's'];
  const nodes = raw.map(value => ({ nodeType: 3, nodeValue: value }));
  const parent = {
    closest: () => null,
    classList: { contains: name => name === 'tabular-nums' },
    childNodes: nodes,
    get textContent() { return nodes.map(node => node.nodeValue).join(''); },
  };
  for (const node of nodes) node.parentElement = parent;
  for (const node of nodes) ctx.translateTextNode(node, 'ko');
  assert.equal(parent.textContent, '5개 작업');
  for (const node of nodes) ctx.translateTextNode(node, 'en');
  assert.equal(parent.textContent, '5 tasks');
});

test('P1 board chat chrome #15', () => {
  const path = '/DEF/inbox';
  assert.equal(ko(path, 'Conference Room'), '회의실');
  assert.equal(ko(path, 'Agent Feed'), '에이전트 피드');
  assert.equal(ko(path, 'Live activity from your agents'), '에이전트의 실시간 활동');
  assert.equal(ko(path, 'Ask anything about your organization...'), '조직에 대해 무엇이든 물어보세요...');
});

test('P1 issues chrome #17', () => {
  const path = '/DEF/issues';
  assert.equal(ko(path, 'Tasks'), '작업');
  assert.equal(ko(path, 'Search tasks...'), '작업 검색...');
  assert.equal(ko(path, 'In Review'), '검토 중');
  assert.equal(ko(path, 'Done'), '완료');
  assert.equal(ko(path, 'Backlog'), '백로그');
  assert.equal(ko(path, 'Blocked'), '막힘');
  assert.equal(ko(path, 'OLDER THAN A DAY'), '하루가 지난 항목');
  assert.equal(ko(path, 'Blocked · 1 blocker needs attention'), '막힘 · 확인이 필요한 차단 1건');
});

test('P1 wiki chrome #20', () => {
  const path = '/DEF/wiki';
  const ctx = loadOverlay(path);
  const tab = (value) => {
    const node = { nodeType: 3, nodeValue: value, parentElement: { closest: (sel) => String(sel).includes('[role="tab"]') || String(sel).includes('button') ? { tagName: 'BUTTON' } : null } };
    ctx.translateTextNode(node, 'ko');
    return node.nodeValue;
  };
  const heading = (value) => {
    const node = { nodeType: 3, nodeValue: value, parentElement: { closest: (sel) => String(sel).includes('h1') ? { tagName: 'H1' } : null } };
    ctx.translateTextNode(node, 'ko');
    return node.nodeValue;
  };
  assert.equal(tab('Ask'), '질문');
  assert.equal(tab('History'), '기록');
  assert.equal(heading('Ask'), 'Ask');
  assert.equal(heading('History'), 'History');
  assert.equal(ko(path, 'Add Content'), '내용 추가');
  assert.equal(ko(path, 'SHARED WIKI SPACES'), '공유 위키 공간');
  assert.equal(ko(path, 'Shared Wiki Spaces'), '공유 위키 공간');
  assert.equal(tab('Edit page'), '페이지 편집');
  assert.equal(ko(path, 'On this page'), '이 페이지에서');
  assert.equal(ko('/DEF/issues', 'Ask'), 'Ask');
  assert.equal(ko('/DEF/issues', 'History'), 'History');
});

test('P1 settings title company duplicate #19', () => {
  const ctx = loadOverlay('/DEF/company/settings');
  assert.equal(ctx.translatePageTitle('설정 • Definish • Definish • Paperclip'), '설정 • Definish • Paperclip');
  assert.equal(ctx.translatePageTitle('Settings • Definish • Definish • Paperclip'), '설정 • Definish • Paperclip');
});
test('P1 stored wiki prose and issue titles stay English', () => {
  const ctx = loadOverlay('/DEF/wiki');
  const proseClosest = (sel) => String(sel).includes('.prose') ? {} : null;
  for (const value of ['Ask', 'History', 'Done', 'Backlog', '1w ago']) {
    const node = { nodeType: 3, nodeValue: value, parentElement: { closest: proseClosest } };
    ctx.translateTextNode(node, 'ko');
    assert.equal(node.nodeValue, value, value);
  }
});

test('P1 textarea placeholder translates while value stays', () => {
  const ctx = loadOverlay('/DEF/board-chat');
  const attrs = { placeholder: 'Ask anything about your organization...' };
  const el = {
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrs, name),
    getAttribute: (name) => attrs[name] ?? null,
    setAttribute: (name, value) => { attrs[name] = value; },
    closest: () => null,
  };
  ctx.translateAttrs(el, 'ko');
  assert.equal(attrs.placeholder, '조직에 대해 무엇이든 물어보세요...');
  const text = { nodeType: 3, nodeValue: 'Ask anything about your organization...', parentElement: { closest: (sel) => String(sel).includes('textarea') ? {} : null, tagName: 'TEXTAREA' } };
  ctx.translateTextNode(text, 'ko');
  assert.equal(text.nodeValue, 'Ask anything about your organization...');
});

test('P1 board-chat document title translates Conference Room', () => {
  const ctx = loadOverlay('/DEF/board-chat');
  assert.equal(ctx.translatePageTitle('Conference Room • Definish • Paperclip'), '회의실 • Definish • Paperclip');
  assert.equal(ctx.translatePageTitle('Conference Room • Tasks • Definish • Paperclip'), 'Conference Room • 작업 • Definish • Paperclip');
});

test('P1 host headings stay translated and wiki article h1 is preserved', () => {
  const board = loadOverlay('/DEF/board-chat');
  const hostH1 = (ctx, value) => {
    const node = { nodeType: 3, nodeValue: value, parentElement: { closest: (sel) => String(sel).includes('article header h1') ? null : (String(sel).includes('h1') ? { tagName: 'H1' } : null) } };
    ctx.translateTextNode(node, 'ko');
    return node.nodeValue;
  };
  assert.equal(hostH1(board, 'Conference Room'), '회의실');
  assert.equal(hostH1(board, 'Agent Feed'), '에이전트 피드');
  const issues = loadOverlay('/DEF/issues');
  assert.equal(hostH1(issues, 'Tasks'), '작업');
  const wiki = loadOverlay('/DEF/wiki');
  const pageTitle = { nodeType: 3, nodeValue: 'Ask', parentElement: { closest: (sel) => String(sel).includes('article header h1') ? { tagName: 'H1' } : null } };
  wiki.translateTextNode(pageTitle, 'ko');
  assert.equal(pageTitle.nodeValue, 'Ask');
  const updated = { nodeType: 3, nodeValue: 'Updated 18분 전', parentElement: { closest: () => null } };
  wiki.translateTextNode(updated, 'ko');
  assert.equal(updated.nodeValue, '갱신 18분 전');
  const onThis = { nodeType: 3, nodeValue: 'On this page', parentElement: { closest: (sel) => String(sel).includes('button') ? { tagName: 'BUTTON' } : null } };
  wiki.translateTextNode(onThis, 'ko');
  assert.equal(onThis.nodeValue, '이 페이지에서');
});

test('P1 wiki file-tree document names stay English while Add Content chrome translates', () => {
  const ctx = loadOverlay('/DEF/wiki');
  const treeItem = {};
  const treeName = {
    closest(sel) {
      const s = String(sel);
      if (s.includes('button') || s.includes('[role="tab"]') || s === 'nav' || s.startsWith('nav,')) return null;
      if (s.includes('[data-file-tree-path]') || s.includes('[role="treeitem"]')) return treeItem;
      return null;
    },
  };
  const node = { nodeType: 3, nodeValue: 'Add Content', parentElement: treeName };
  ctx.translateTextNode(node, 'ko');
  assert.equal(node.nodeValue, 'Add Content');
  assert.equal(ko('/DEF/wiki', 'Add Content'), '내용 추가');
});

test('AOO item-verdict chrome translates on decisions and issue cards', () => {
  assert.equal(ko('/AOO/decisions', 'Approve all'), '모두 승인');
  assert.equal(ko('/AOO/decisions', 'Approve'), '승인');
  assert.equal(ko('/AOO/decisions', 'Reject'), '거부');
  assert.equal(ko('/AOO/decisions', 'Apply 0 decisions'), '결정 0건 적용');
  assert.equal(ko('/AOO/decisions', 'Apply 2 decisions'), '결정 2건 적용');
  assert.equal(ko('/AOO/decisions', '1 draft verdict ready to apply'), '적용할 초안 1건');
  assert.equal(ko('/AOO/decisions', 'Mark verdicts, then apply them in one pass.'), '항목을 고른 뒤 한 번에 적용합니다.');
  const issue = loadOverlay('/AOO/issues/AOO-43');
  const verdict = (value) => {
    const node = {
      nodeType: 3,
      nodeValue: value,
      parentElement: { closest: () => null },
    };
    issue.translateTextNode(node, 'ko');
    return node.nodeValue;
  };
  assert.equal(verdict('Approve all'), '모두 승인');
  assert.equal(verdict('Approve this item'), '이 항목 승인');
  assert.equal(verdict('Apply 1 decision'), '결정 1건 적용');
  const attrs = { 'aria-label': 'Approve this item' };
  const el = {
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrs, name),
    getAttribute: (name) => attrs[name] ?? null,
    setAttribute: (name, value) => { attrs[name] = value; },
    closest: () => null,
  };
  issue.translateAttrs(el, 'ko');
  assert.equal(attrs['aria-label'], '이 항목 승인');
});

test('P1 issue-row titles stay English while Done filter chrome translates', () => {
  const ctx = loadOverlay('/DEF/issues');
  const group = { querySelector(sel) { return String(sel).includes('data-inbox-issue-link') ? {} : null; } };
  const titleSpan = {
    closest(sel) {
      const s = String(sel);
      if (s.includes('data-inbox-issue-link')) return null;
      if (s.includes('span.line-clamp-2')) return titleSpan;
      if (s.includes('button') || s.includes('nav') || s.includes('[role="tab"]')) return null;
      if (s.includes('.group')) return group;
      return null;
    },
  };
  const titleNode = { nodeType: 3, nodeValue: 'Done', parentElement: titleSpan };
  ctx.translateTextNode(titleNode, 'ko');
  assert.equal(titleNode.nodeValue, 'Done');
  const overlay = {
    closest(sel) { return String(sel).includes('data-inbox-issue-link') ? overlay : null; },
  };
  const sr = { nodeType: 3, nodeValue: 'Open DEF-99: Done', parentElement: overlay };
  ctx.translateTextNode(sr, 'ko');
  assert.equal(sr.nodeValue, 'Open DEF-99: Done');
  const filter = { closest() { return null; }, tagName: 'BUTTON' };
  const filterNode = { nodeType: 3, nodeValue: 'Done', parentElement: filter };
  ctx.translateTextNode(filterNode, 'ko');
  assert.equal(filterNode.nodeValue, '완료');
});

test('upstream 2026.916 chrome additions translate on their routes', () => {
  // Nav
  const navCtx = loadOverlay('/DEF/dashboard');
  const navNode = (val) => {
    const node = { nodeType: 3, nodeValue: val, parentElement: { closest: (s) => String(s).includes('nav') ? {} : null } };
    navCtx.translateTextNode(node, 'ko');
    return node.nodeValue;
  };
  assert.equal(navNode('Connectors'), '연결');
  assert.equal(navNode('Audit'), '감사');
  assert.equal(navNode('Chats'), '채팅');
  assert.equal(navNode('Recent Tasks'), '최근 작업');

  // Experimental settings
  assert.equal(ko('/DEF/company/settings/instance/experimental', 'Streamlined UI'), '간소화 UI');
  assert.equal(ko('/DEF/company/settings/instance/experimental', 'Agent Chat'), '에이전트 채팅');
  assert.equal(ko('/DEF/company/settings/instance/experimental', 'Chat connectors'), '채팅 연결');
  assert.equal(ko('/DEF/company/settings/instance/experimental', 'Paperclip Runner'), 'Paperclip Runner');

  // Agent detail contextual views
  assert.equal(ko('/DEF/agents/agent-1', 'Harness / Runtime'), '실행 환경 / 런타임');
  assert.equal(ko('/DEF/agents/agent-1', 'Permissions / Trust'), '권한 / 신뢰');
  assert.equal(ko('/DEF/agents/agent-1', 'Revisions'), '수정 이력');

  // Apps / Connectors
  assert.equal(ko('/DEF/apps', 'Services'), '서비스');
  assert.equal(ko('/DEF/apps', 'Add connection'), '연결 추가');
  assert.equal(ko('/DEF/apps', 'Who can use this identity'), '이 신원을 사용할 수 있는 사용자');

  // Global announcements and chats
  assert.equal(ko('/DEF/dashboard', 'Chat with an agent'), '에이전트와 대화');
  assert.equal(ko('/DEF/dashboard', 'Dismiss announcement'), '안내 닫기');
});

test('upstream 2026.916 page-by-page chrome additions translate', () => {
  // Export/Import & Secrets
  assert.equal(ko('/DEF/company/export', 'Package files'), '패키지 파일');
  assert.equal(ko('/DEF/company/settings/secrets', 'Provider vault'), '제공자 금고');
  assert.equal(ko('/DEF/company/settings/instance/plugins', 'Installed Plugins'), '설치된 플러그인');
  assert.equal(ko('/DEF/company/settings/instance/adapters', 'Installed from npm'), 'NPM에서 설치됨');
  assert.equal(ko('/DEF/execution-workspaces/ws-1', 'Execution workspace name'), '실행 작업공간 이름');
  assert.equal(ko('/DEF/issues/DEF-1', 'This task is hidden'), '이 작업은 숨겨져 있습니다');
  assert.equal(ko('/DEF/pipelines', 'Move to stage'), '단계로 이동');
  assert.equal(ko('/DEF/routines', 'Default agent'), '기본 에이전트');
  assert.equal(ko('/DEF/activity/costs', 'Inference ledger'), '추론 원장');
  assert.equal(ko('/DEF/cases', 'Desktop case rows'), '데스크톱 케이스 행');
  assert.equal(ko('/auth', 'Board ownership claimed'), '보드 소유권 등록 완료');
});

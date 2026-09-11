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
  assert.equal(ko(path, 'Ask'), '질문');
  assert.equal(ko(path, 'Add Content'), '내용 추가');
  assert.equal(ko(path, 'SHARED WIKI SPACES'), '공유 위키 공간');
  assert.equal(ko(path, 'Shared Wiki Spaces'), '공유 위키 공간');
  assert.equal(ko(path, 'Edit page'), '페이지 편집');
  assert.equal(ko(path, 'Updated'), '갱신');
  assert.equal(ko(path, 'On this page'), '이 페이지에서');
  assert.equal(ko(path, 'History'), '기록');
  assert.equal(ko('/DEF/issues', 'Ask'), 'Ask');
  assert.equal(ko('/DEF/issues', 'History'), 'History');
});

test('P1 settings title company duplicate #19', () => {
  const ctx = loadOverlay('/DEF/company/settings');
  assert.equal(ctx.translatePageTitle('설정 • Definish • Definish • Paperclip'), '설정 • Definish • Paperclip');
  assert.equal(ctx.translatePageTitle('Settings • Definish • Definish • Paperclip'), '설정 • Definish • Paperclip');
});


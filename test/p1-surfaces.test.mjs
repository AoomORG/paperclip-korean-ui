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
  for (const value of ['Ask', 'History', 'Done', 'Backlog']) {
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const overlaySource = readFileSync(new URL('../src/ui/overlay.js', import.meta.url), 'utf8')
  .replaceAll('export function', 'function');

function loadOverlay(pathname = '/AOO/agents/agent-7c304493/runs') {
  const context = vm.createContext({
    chromeCatalog: JSON.parse(readFileSync(new URL('../locales/chrome.ko.json', import.meta.url))),
    window: {
      location: { pathname },
      innerHeight: 800,
      getComputedStyle: () => ({ transform: 'none' }),
      localStorage: { getItem: () => 'ko', setItem() {}, },
    },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    NodeFilter: { SHOW_TEXT: 4 },
    HTMLElement: class HTMLElement {},
    document: { title: "", createTreeWalker() { return { nextNode: () => false }; } },
  });
  vm.runInContext(
    overlaySource +
      "\nthis.translateRunChrome = translateRunChrome;" +
      "\nthis.looksLikeMarkdown = looksLikeMarkdown;" +
      "\nthis.stripMarkdownPreview = stripMarkdownPreview;" +
      "\nthis.decorateConnectLinks = decorateConnectLinks;" +
      "\nthis.softenRunListMarkdown = softenRunListMarkdown;" +
      "\nthis.translateTextNode = translateTextNode;" +
      "\nthis.translatePageTitle = translatePageTitle;" +
      "\nthis.applyDocumentTitle = applyDocumentTitle;" +
      "\nthis.exposeRunSummaryOriginal = exposeRunSummaryOriginal;" +
      "\nthis.extractRunOriginal = extractRunOriginal;" +
      "\nthis.parseRunDetailId = parseRunDetailId;" +
      "\nthis.renderRunOriginalPanel = renderRunOriginalPanel;" +
      "\nthis.CLIP_FIX_CSS = CLIP_FIX_CSS;",
    context,
  );
  return context;
}

test('P0 run chrome translates Tasks Touched counts', () => {
  const ctx = loadOverlay();
  assert.equal(ctx.translateRunChrome('Tasks Touched (3)'), '관련 작업 (3)');
  assert.equal(ctx.translateRunChrome('Tasks Touched ('), '관련 작업 (');
  assert.equal(ctx.translateRunChrome('12 tok'), '12 토큰');
  assert.equal(ctx.translateRunChrome('See All →'), '모두 보기 →');
  assert.equal(ctx.translateRunChrome('plain'), null);
  assert.equal(ctx.translateRunChrome('0 running, 1 paused, 2 errors'), '실행 0, 일시정지 1, 오류 2');
  assert.equal(ctx.translateRunChrome('18 open, 2 blocked'), '열림 18, 막힘 2');
  assert.equal(ctx.translateRunChrome('Failed after 1 second'), '1초 후 실패');
  assert.equal(ctx.translateRunChrome('Transcript (12)'), '기록 (12)');
  assert.equal(ctx.translateRunChrome('Transcript(1)'), '기록 (1)');
  assert.equal(ctx.translateRunChrome('Transcript ('), '기록 (');
  assert.equal(ctx.translateRunChrome('Transcript('), '기록(');
});

test('P0 run list markdown preview strips markers without touching plain text', () => {
  const ctx = loadOverlay();
  assert.equal(ctx.looksLikeMarkdown('**hello** world'), true);
  assert.equal(ctx.stripMarkdownPreview('**hello** world'), 'hello world');
  assert.equal(ctx.stripMarkdownPreview('# Title'), 'Title');
  assert.equal(ctx.stripMarkdownPreview('[label](https://example.com)'), 'label');
  assert.equal(ctx.looksLikeMarkdown('plain summary without markup'), false);
});

test('public overlay does not hardcode Aoom connect brand fallback', () => {
  assert.equal(overlaySource.includes('아움 커넥트'), false);
});

test('run markdown preview restores original English when language is en', () => {
  const ctx = loadOverlay('/AOO/agents/agent-7c304493/runs');
  const original = '**blocked** next step';
  let writes = 0;
  const textNode = {
    nodeType: 3,
    _v: original,
    get nodeValue() { return this._v; },
    set nodeValue(v) { writes += 1; this._v = v; },
    parentElement: null,
  };
  const span = {
    nodeType: 1,
    closest: () => null,
    childNodes: [textNode],
  };
  textNode.parentElement = span;
  const link = { querySelectorAll: () => [span] };
  const root = {
    querySelectorAll: (sel) => (String(sel).includes('truncate') ? [span] : []),
  };
  ctx.document.createTreeWalker = () => {
    let done = false;
    return {
      currentNode: null,
      nextNode() {
        if (done) return false;
        done = true;
        this.currentNode = textNode;
        return true;
      },
    };
  };
  ctx.softenRunListMarkdown(root, 'ko');
  assert.equal(textNode.nodeValue.includes('**'), false);
  assert.match(textNode.nodeValue, /blocked/);
  const afterKo = writes;
  ctx.softenRunListMarkdown(root, 'ko');
  assert.equal(writes, afterKo);
  ctx.softenRunListMarkdown(root, 'en');
  assert.equal(textNode.nodeValue, original);
  const afterEn = writes;
  ctx.softenRunListMarkdown(root, 'en');
  assert.equal(writes, afterEn);
});

test('connect link title uses visible text and skips empty labels', () => {
  const ctx = loadOverlay('/AOO/dashboard');
  const attrs = {};
  const emptyAttrs = {};
  const filled = {
    textContent: '  Connect  ',
    getAttribute: (k) => attrs[k] ?? null,
    setAttribute: (k, v) => { attrs[k] = v; },
  };
  const empty = {
    textContent: '   ',
    getAttribute: (k) => emptyAttrs[k] ?? null,
    setAttribute: (k, v) => { emptyAttrs[k] = v; },
  };
  const root = { querySelectorAll: () => [filled, empty] };
  ctx.decorateConnectLinks(root);
  assert.equal(attrs.title, 'Connect');
  assert.equal(attrs['aria-label'], 'Connect');
  assert.equal(Object.keys(emptyAttrs).length, 0);
});


test('account, decisions, and run chrome labels translate and restore', () => {
  const dash = loadOverlay('/AOO');
  for (const original of ['Switch to dark mode', 'Toggle the app appearance.', 'Last restarted', 'Running commit']) {
    const node = { nodeType: 3, nodeValue: original, parentElement: { closest: () => null } };
    dash.translateTextNode(node, 'ko');
    assert.match(node.nodeValue, /[가-힣]/, original);
    dash.translateTextNode(node, 'en');
    assert.equal(node.nodeValue, original);
  }
  const star = { nodeType: 3, nodeValue: 'Star 조운영', parentElement: { closest: () => null } };
  dash.translateTextNode(star, 'ko');
  assert.equal(star.nodeValue, '즐겨찾기 조운영');
  dash.translateTextNode(star, 'en');
  assert.equal(star.nodeValue, 'Star 조운영');
  const dec = loadOverlay('/AOO/decisions');
  for (const original of ['Aging', 'Decide now', 'view run', 'Not now?']) {
    const node = { nodeType: 3, nodeValue: original, parentElement: { closest: () => null } };
    dec.translateTextNode(node, 'ko');
    assert.match(node.nodeValue, /[가-힣]/, original);
    dec.translateTextNode(node, 'en');
    assert.equal(node.nodeValue, original);
  }
  const run = loadOverlay('/AOO/agents/agent-7c304493/runs/abc');
  for (const original of ['clear session for these tasks', '(changed)', 'Failed to clear sessions']) {
    const node = { nodeType: 3, nodeValue: original, parentElement: { closest: () => null } };
    run.translateTextNode(node, 'ko');
    assert.match(node.nodeValue, /[가-힣]/, original);
    run.translateTextNode(node, 'en');
    assert.equal(node.nodeValue, original);
  }
});

test('status beta account and decisions title chrome translate', () => {
  const dash = loadOverlay('/AOO');
  for (const [original, ko] of [['Status', '상태'], ['beta', '베타'], ['Account', '계정']]) {
    const node = { nodeType: 3, nodeValue: original, parentElement: { closest: () => null } };
    dash.translateTextNode(node, 'ko');
    assert.equal(node.nodeValue, ko, original);
    dash.translateTextNode(node, 'en');
    assert.equal(node.nodeValue, original);
  }
  assert.equal(dash.translatePageTitle('Decisions • Status • Paperclip'), '결정 • Status • Paperclip');
  assert.equal(dash.translatePageTitle('Status • Aoom • Paperclip'), '상태 • Aoom • Paperclip');
  assert.equal(dash.translatePageTitle('상태 • Aoom • Paperclip'), '상태 • Aoom • Paperclip');
  assert.equal(dash.translatePageTitle('Paperclip'), 'Paperclip');
  assert.equal(dash.translatePageTitle('Status • Projects • Aoom • Paperclip'), 'Status • 프로젝트 • Aoom • Paperclip');
  assert.equal(dash.translatePageTitle('조운영 • Agents • Aoom • Paperclip'), '조운영 • 에이전트 • Aoom • Paperclip');
  assert.equal(dash.translatePageTitle('Need Status review • Tasks • Aoom • Paperclip'), 'Need Status review • 작업 • Aoom • Paperclip');
  assert.equal(dash.translatePageTitle('Status • Paperclip'), 'Status • Paperclip');
  assert.equal(dash.translatePageTitle('Apps • Aoom • Aoom • Paperclip'), '앱 • Aoom • Aoom • Paperclip');
  assert.equal(dash.translatePageTitle('Settings • Aoom • Aoom • Paperclip'), '설정 • Aoom • Aoom • Paperclip');
  assert.equal(dash.translatePageTitle('Connect an app • Apps • Aoom • Aoom • Paperclip'), 'Connect an app • 앱 • Aoom • Aoom • Paperclip');
  const empty = { nodeType: 3, nodeValue: 'No status cards yet', parentElement: { closest: () => null } };
  dash.translateTextNode(empty, 'ko');
  assert.match(empty.nodeValue, /상태 카드/);
});


test('document title remembers original and does not invert unknown Korean company titles', () => {
  const ctx = loadOverlay('/AOO');
  ctx.document.title = 'Decisions • Status • Paperclip';
  ctx.applyDocumentTitle('ko');
  assert.equal(ctx.document.title, '결정 • Status • Paperclip');
  ctx.applyDocumentTitle('en');
  assert.equal(ctx.document.title, 'Decisions • Status • Paperclip');

  const ctx2 = loadOverlay('/AOO');
  ctx2.document.title = '상태 • Aoom • Paperclip';
  ctx2.applyDocumentTitle('en');
  assert.equal(ctx2.document.title, '상태 • Aoom • Paperclip');
  ctx2.applyDocumentTitle('ko');
  assert.equal(ctx2.document.title, '상태 • Aoom • Paperclip');

  const ctx3 = loadOverlay('/AOO');
  ctx3.document.title = 'Status • Aoom • Paperclip';
  ctx3.applyDocumentTitle('ko');
  assert.equal(ctx3.document.title, '상태 • Aoom • Paperclip');
  ctx3.applyDocumentTitle('en');
  assert.equal(ctx3.document.title, 'Status • Aoom • Paperclip');
});

test('document title preserves dynamic names and restores originals across routes', () => {
  const ctx = loadOverlay('/AOO');
  ctx.document.title = 'Status • Paperclip';
  ctx.applyDocumentTitle('ko');
  assert.equal(ctx.document.title, 'Status • Paperclip');

  ctx.window.location.pathname = '/AOO/status';
  ctx.document.title = 'Status • Aoom • Paperclip';
  ctx.applyDocumentTitle('ko');
  assert.equal(ctx.document.title, '상태 • Aoom • Paperclip');

  ctx.window.location.pathname = '/AOO/projects/status-project';
  ctx.document.title = 'Status • Projects • Aoom • Paperclip';
  ctx.applyDocumentTitle('ko');
  assert.equal(ctx.document.title, 'Status • 프로젝트 • Aoom • Paperclip');
  ctx.applyDocumentTitle('en');
  assert.equal(ctx.document.title, 'Status • Projects • Aoom • Paperclip');

  ctx.window.location.pathname = '/AOO/apps';
  ctx.document.title = 'Apps • Aoom • Aoom • Paperclip';
  ctx.applyDocumentTitle('ko');
  assert.equal(ctx.document.title, '앱 • Aoom • Aoom • Paperclip');
  ctx.applyDocumentTitle('en');
  assert.equal(ctx.document.title, 'Apps • Aoom • Aoom • Paperclip');

  ctx.window.location.pathname = '/AOO/agents/agent-7c304493';
  ctx.document.title = '조운영 • Agents • Aoom • Paperclip';
  ctx.applyDocumentTitle('ko');
  assert.equal(ctx.document.title, '조운영 • 에이전트 • Aoom • Paperclip');
  ctx.applyDocumentTitle('en');
  assert.equal(ctx.document.title, '조운영 • Agents • Aoom • Paperclip');
});

test('dashboard and runs chrome labels translate without touching names', () => {
  const dash = loadOverlay('/DEF/dashboard');
  const node = (value) => {
    const n = { nodeType: 3, nodeValue: value, parentElement: { closest: () => null } };
    dash.translateTextNode(n, 'ko');
    return n.nodeValue;
  };
  assert.equal(node('Agents'), '에이전트');
  assert.equal(node('running'), '실행 중');
  assert.equal(node('paused'), '일시정지');
  assert.equal(node('errors'), '오류');
  assert.equal(node('In Review'), '검토 중');
  assert.equal(node('Done'), '완료');
  assert.equal(node('Blocked'), '막힘');
  assert.equal(node('Backlog'), '백로그');
  assert.equal(node('Failed after 1 second'), '1초 후 실패');
  assert.equal(node('조운영'), '조운영');

  const runs = loadOverlay('/DEF/agents/a-def-8f083281/runs/abc');
  const runNode = (value) => {
    const n = { nodeType: 3, nodeValue: value, parentElement: { closest: () => null } };
    runs.translateTextNode(n, 'ko');
    return n.nodeValue;
  };
  assert.equal(runNode('Workspace recovery'), '작업 경로 복구');
  assert.equal(runNode('Clear error'), '오류 지우기');
  assert.equal(runNode('Transcript'), '기록');
  assert.equal(runNode('nice'), '보기 쉽게');
  assert.equal(runNode('raw'), '원문');
  assert.equal(runNode('failed'), '실패');

  const apps = loadOverlay('/DEF/apps');
  const appNode = (value) => {
    const n = { nodeType: 3, nodeValue: value, parentElement: { closest: () => null } };
    apps.translateTextNode(n, 'ko');
    return n.nodeValue;
  };
  assert.equal(appNode('Browse'), '둘러보기');
  assert.equal(appNode('Review'), '검토');
  assert.equal(appNode('Developer'), '개발자');
  assert.equal(appNode('Connections'), '연결');
  assert.equal(appNode('Choose an app or connect your own MCP server.'), '앱을 고르거나 직접 MCP 서버를 연결하세요.');
  assert.equal(appNode('Popular'), '인기');
  assert.equal(appNode('All apps'), '모든 앱');
  assert.equal(appNode('Coming soon'), '곧 제공');
  assert.equal(appNode('Connect your own tool'), '내 도구 연결');
  assert.equal(appNode('Gateways'), '게이트웨이');
  assert.equal(appNode('Profiles'), '프로필');
  assert.equal(appNode('Rules'), '규칙');
  assert.equal(appNode('Health'), '상태');
});

test('P0 #24 CLIP_FIX_CSS wraps run summary and exposes focus-visible', () => {
  const ctx = loadOverlay('/DEF/agents/agent-123/runs');
  assert.match(ctx.CLIP_FIX_CSS, /white-space:\s*normal\s*!important/);
  assert.match(ctx.CLIP_FIX_CSS, /overflow:\s*visible\s*!important/);
  assert.match(ctx.CLIP_FIX_CSS, /text-overflow:\s*clip\s*!important/);
  assert.match(ctx.CLIP_FIX_CSS, /word-break:\s*break-word\s*!important/);
  assert.match(ctx.CLIP_FIX_CSS, /focus-visible/);
  assert.match(ctx.CLIP_FIX_CSS, /\[data-pc-run-original-text\]/);
});

test('P0 #24 exposeRunSummaryOriginal updates title without stale and provides accessible label', () => {
  const ctx = loadOverlay('/DEF/agents/agent-123/runs');
  const attrs = new Map();
  const spanAttrs = new Map();
  const textNode = { nodeType: 3, nodeValue: 'Run summary line 1 and line 2' };
  const span = {
    tagName: 'SPAN',
    className: 'text-xs text-muted-foreground truncate',
    getAttribute: (k) => spanAttrs.get(k) || null,
    setAttribute: (k, v) => spanAttrs.set(k, v),
  };
  const link = {
    tagName: 'A',
    getAttribute: (k) => attrs.get(k) || null,
    setAttribute: (k, v) => attrs.set(k, v),
    querySelector: (sel) => (sel === 'span.truncate' ? span : null),
  };
  ctx.document.createTreeWalker = () => {
    let visited = false;
    return {
      nextNode: () => {
        if (!visited) {
          visited = true;
          return true;
        }
        return false;
      },
      currentNode: textNode,
    };
  };
  span.closest = (sel) => {
    if (String(sel).includes('nav')) return null;
    if (String(sel).includes("a[href*='/runs']")) return link;
    return null;
  };
  link.closest = (sel) => (String(sel).includes('nav') ? null : null);
  const root = {
    querySelectorAll: (sel) => (String(sel).includes('span.truncate') ? [span] : []),
  };

  ctx.exposeRunSummaryOriginal(root);
  assert.equal(attrs.get('title'), 'Run summary line 1 and line 2');
  assert.equal(attrs.get('data-pc-original-summary'), 'Run summary line 1 and line 2');
  assert.equal(attrs.get('aria-label'), 'Run summary line 1 and line 2');
  assert.equal(spanAttrs.get('title'), 'Run summary line 1 and line 2');

  // Verify dynamic DOM update does not stay stale
  textNode.nodeValue = 'Updated run summary dynamically';
  ctx.document.createTreeWalker = () => {
    let visited = false;
    return {
      nextNode: () => {
        if (!visited) {
          visited = true;
          return true;
        }
        return false;
      },
      currentNode: textNode,
    };
  };
  ctx.exposeRunSummaryOriginal(root);
  assert.equal(attrs.get('title'), 'Updated run summary dynamically');
  assert.equal(attrs.get('data-pc-original-summary'), 'Updated run summary dynamically');
  assert.equal(spanAttrs.get('title'), 'Updated run summary dynamically');

  // Native aria-label preservation
  const nativeAttrs = new Map([['aria-label', 'Pre-existing native run action']]);
  const nativeLink = {
    tagName: 'A',
    getAttribute: (k) => nativeAttrs.get(k) || null,
    setAttribute: (k, v) => nativeAttrs.set(k, v),
    querySelector: () => null,
  };
  ctx.exposeRunSummaryOriginal({ querySelectorAll: () => [] });
  assert.equal(nativeAttrs.get('aria-label'), 'Pre-existing native run action');
  assert.equal(nativeAttrs.get('data-pc-has-summary-label'), undefined);
});

test('P0 #24 dynamic text node markdown update does not use stale originalText cache', () => {
  const ctx = loadOverlay('/DEF/agents/agent-123/runs');
  const textNode = { nodeType: 3, nodeValue: '**blocked** initial step' };
  const span = { nodeType: 1, tagName: 'SPAN', className: 'truncate', closest: () => null };
  textNode.parentElement = span;
  ctx.document.createTreeWalker = () => {
    let visited = false;
    return {
      currentNode: null,
      nextNode() {
        if (!visited) { visited = true; this.currentNode = textNode; return true; }
        return false;
      },
    };
  };
  const root = {
    querySelectorAll: (sel) => (String(sel).includes('truncate') ? [span] : []),
  };
  ctx.softenRunListMarkdown(root, 'ko');
  assert.equal(textNode.nodeValue, 'blocked initial step');

  // External update from app changing text to new markdown
  textNode.nodeValue = '**failed** updated step';
  ctx.document.createTreeWalker = () => {
    let visited = false;
    return {
      currentNode: null,
      nextNode() {
        if (!visited) { visited = true; this.currentNode = textNode; return true; }
        return false;
      },
    };
  };
  ctx.softenRunListMarkdown(root, 'ko');
  assert.equal(textNode.nodeValue, 'failed updated step');
});

test('P0 #24 host-split Transcript prefix translates without waiting for the count node', () => {
  const ctx = loadOverlay('/DEF/agents/a-def-8f083281/runs/abc');
  const n = { nodeType: 3, nodeValue: 'Transcript (', parentElement: { closest: () => null } };
  ctx.translateTextNode(n, 'ko');
  assert.equal(n.nodeValue, '기록 (');
  ctx.translateTextNode(n, 'en');
  assert.equal(n.nodeValue, 'Transcript (');
});

test('P0 #24 extractRunOriginal prefers summary then result then error', () => {
  const ctx = loadOverlay('/DEF/agents/a-def-8f083281/runs/be7ab0fd-d415-42da-8a01-03ea61a83a7b');
  assert.equal(ctx.parseRunDetailId('/DEF/agents/a-def-8f083281/runs/be7ab0fd-d415-42da-8a01-03ea61a83a7b'), 'be7ab0fd-d415-42da-8a01-03ea61a83a7b');
  assert.equal(ctx.parseRunDetailId('/DEF/agents/a-def-8f083281/runs'), null);
  const summary = 'A'.repeat(641);
  const fromSummary = ctx.extractRunOriginal({ resultJson: { summary, result: 'nope' }, error: 'err' });
  assert.equal(fromSummary.text, summary);
  assert.equal(fromSummary.field, 'resultJson.summary');
  const fromResult = ctx.extractRunOriginal({ resultJson: { result: 'full result' } });
  assert.equal(fromResult.text, 'full result');
  assert.equal(fromResult.field, 'resultJson.result');
  const fromError = ctx.extractRunOriginal({ resultJson: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, error: 'x'.repeat(111) });
  assert.equal(fromError.text, 'x'.repeat(111));
  assert.equal(fromError.field, 'error');
  const fromListError = ctx.extractRunOriginal({ resultJson: null, error: 'list-error' });
  assert.equal(fromListError.text, 'list-error');
  assert.equal(fromListError.field, 'error');
});

test('P0 #24 breadcrumb Runs link is not treated as a summary original', () => {
  const ctx = loadOverlay('/DEF/agents/example/runs/be7ab0fd-d415-42da-8a01-03ea61a83a7b');
  const crumbAttrs = new Map();
  const crumb = {
    tagName: 'A',
    getAttribute: (k) => crumbAttrs.get(k) || null,
    setAttribute: (k, v) => crumbAttrs.set(k, v),
    closest: (sel) => (String(sel).includes('nav') ? { tagName: 'NAV' } : crumb),
    querySelector: () => null,
  };
  const historyAttrs = new Map();
  const historySpanAttrs = new Map();
  const historyText = { nodeType: 3, nodeValue: '원문 요약을 보존합니다' };
  let historyLink;
  const historySpan = {
    tagName: 'SPAN',
    className: 'truncate',
    getAttribute: (k) => historySpanAttrs.get(k) || null,
    setAttribute: (k, v) => historySpanAttrs.set(k, v),
    closest: (sel) => {
      if (String(sel).includes('nav')) return null;
      if (String(sel).includes("a[href*='/runs']")) return historyLink;
      return null;
    },
  };
  historyLink = {
    tagName: 'A',
    getAttribute: (k) => historyAttrs.get(k) || null,
    setAttribute: (k, v) => historyAttrs.set(k, v),
    closest: (sel) => (String(sel).includes('nav') ? null : null),
  };
  ctx.document.createTreeWalker = () => {
    let visited = false;
    return {
      currentNode: historyText,
      nextNode() {
        if (visited) return false;
        visited = true;
        return true;
      },
    };
  };
  ctx.exposeRunSummaryOriginal({
    querySelectorAll: (sel) => (String(sel).includes('span.truncate') ? [historySpan] : [crumb, historyLink]),
  });
  assert.equal(crumbAttrs.get('title'), undefined);
  assert.equal(crumbAttrs.get('aria-label'), undefined);
  assert.equal(historyAttrs.get('title'), '원문 요약을 보존합니다');
  assert.equal(historySpanAttrs.get('title'), '원문 요약을 보존합니다');
});

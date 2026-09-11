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
    document: { createTreeWalker() { return { nextNode: () => false }; } },
  });
  vm.runInContext(
    overlaySource +
      "\nthis.translateRunChrome = translateRunChrome;" +
      "\nthis.looksLikeMarkdown = looksLikeMarkdown;" +
      "\nthis.stripMarkdownPreview = stripMarkdownPreview;" +
      "\nthis.decorateConnectLinks = decorateConnectLinks;" +
      "\nthis.softenRunListMarkdown = softenRunListMarkdown;" +
      "\nthis.translateTextNode = translateTextNode;",
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(path = '/AOO/decisions', selectors = []) {
  const context = vm.createContext({
    chromeCatalog: JSON.parse(readFileSync(new URL('../locales/chrome.ko.json', import.meta.url))),
    window: { location: { pathname: path } },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
  });
  const source = readFileSync(new URL('../src/ui/overlay.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
  vm.runInContext(source + '\nthis.translateTextNode = translateTextNode;', context);
  const parentElement = { closest: selector => selectors.some(s => selector.includes(s)) ? {} : null };
  return { translate: context.translateTextNode, node: text => ({ nodeType: 3, nodeValue: text, parentElement }) };
}

test('system recovery, truncated preview, and submenu labels translate and restore', () => {
  const f = fixture();
  const samples = ['Decisions', 'Blocked dependency', 'Missing Disposition', 'Resolve…', 'Try again', 'Board decision required',
    'Blocks 2 tasks and needs human attention.',
    '“Board operator: inspect the run evidence, then explicitly choose a valid issue disposition, retry the original owner, reassign, or intentionally resolve the ta...”'];
  for (const original of samples) {
    const node = f.node(original);
    f.translate(node, 'ko');
    assert.match(node.nodeValue, /[가-힣]/, original);
    f.translate(node, 'en');
    assert.equal(node.nodeValue, original);
  }
});

test('issue body, code, identifiers, raw status and other screens stay unchanged', () => {
  for (const [path, selectors, text] of [
    ['/AOO/issues/AOO-10', ['.prose'], 'Board decision required'],
    ['/AOO/decisions', ['code'], 'Missing Disposition'],
    ['/AOO/decisions', ['textarea'], 'Try again'],
    ['/AOO/decisions', [], 'blocked'],
    ['/AOO/decisions', [], 'AOO-10'],
    ['/AOO/projects', [], 'Try again'],
  ]) {
    const f = fixture(path, selectors); const node = f.node(text);
    f.translate(node, 'ko'); assert.equal(node.nodeValue, text);
  }
});

test('recovery panel outside decisions uses the same catalog', () => {
  const f = fixture('/AOO/issues/AOO-10', ['data-recovery-state']);
  const node = f.node('RECOVERY ESCALATED');
  f.translate(node, 'ko'); assert.match(node.nodeValue, /관리자 조치/);
});

test('system notice inside issue prose translates registered copy and restores English', () => {
  const sentence = "Paperclip could not resolve this issue's missing disposition automatically. The source assignment is unchanged and a board decision is required.";
  const f = fixture('/AOO/issues/AOO-10', ['.prose', 'data-testid="task-chat-system-notice"']);
  const node = f.node(sentence);
  f.translate(node, 'ko');
  assert.match(node.nodeValue, /[가-힣]/);
  assert.match(node.nodeValue, /관리자/);
  f.translate(node, 'en');
  assert.equal(node.nodeValue, sentence);
});

test('ordinary issue chat prose with the same sentence stays English', () => {
  const sentence = "Paperclip could not resolve this issue's missing disposition automatically. The source assignment is unchanged and a board decision is required.";
  const f = fixture('/AOO/issues/AOO-10', ['.prose']);
  const node = f.node(sentence);
  f.translate(node, 'ko');
  assert.equal(node.nodeValue, sentence);
});

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
test('collapsed system notice title and metadata labels translate', () => {
  const f = fixture('/AOO/issues/AOO-10', ['data-testid="task-chat-system-notice"']);
  for (const original of ['Missing issue disposition', 'Missing disposition', 'Run evidence', 'Automatic retry']) {
    const node = f.node(original);
    f.translate(node, 'ko');
    assert.match(node.nodeValue, /[가-힣]/, original);
    f.translate(node, 'en');
    assert.equal(node.nodeValue, original);
  }
});

test('issue properties chrome translates on issue pages only', () => {
  const f = fixture('/AOO/issues/AOO-10', []);
  for (const original of ['Properties', 'Relationships', 'Execution', 'Blocked by']) {
    const node = f.node(original);
    f.translate(node, 'ko');
    assert.match(node.nodeValue, /[가-힣]/, original);
    f.translate(node, 'en');
    assert.equal(node.nodeValue, original);
  }
  const prose = fixture('/AOO/issues/AOO-10', ['.prose']);
  const node = prose.node('Properties');
  prose.translate(node, 'ko');
  assert.equal(node.nodeValue, 'Properties');
  const other = fixture('/AOO/projects', []);
  const n2 = other.node('Properties');
  other.translate(n2, 'ko');
  assert.equal(n2.nodeValue, 'Properties');
});

test('issue status tokens stay English on the properties panel', () => {
  const f = fixture('/AOO/issues/AOO-10', []);
  for (const original of ['blocked', 'AOO-10', 'todo']) {
    const node = f.node(original);
    f.translate(node, 'ko');
    assert.equal(node.nodeValue, original);
  }
});
test('agent configuration chrome translates on agent pages only', () => {
  const f = fixture('/AOO/agents/agent-7c304493/configuration', []);
  for (const original of ['Configuration', 'Assign Task', 'Run Heartbeat', 'Identity', 'Reports to', 'Permissions', 'API Keys']) {
    const node = f.node(original);
    f.translate(node, 'ko');
    assert.match(node.nodeValue, /[가-힣]/, original);
    f.translate(node, 'en');
    assert.equal(node.nodeValue, original);
  }
  const other = fixture('/AOO/projects', []);
  const n2 = other.node('Assign Task');
  other.translate(n2, 'ko');
  assert.equal(n2.nodeValue, 'Assign Task');
});

test('agent runtime statuses stay English', () => {
  const f = fixture('/AOO/agents/agent-7c304493/configuration', []);
  for (const original of ['idle', 'succeeded', 'paused']) {
    const node = f.node(original);
    f.translate(node, 'ko');
    assert.equal(node.nodeValue, original);
  }
});

test('agent skills tab and dashboard chart labels translate', () => {
  const f = fixture('/AOO/agents/agent-7c304493', []);
  for (const original of ['Skills', 'Instructions', 'In Review']) {
    const node = f.node(original);
    f.translate(node, 'ko');
    assert.match(node.nodeValue, /[가-힣]/, original);
    f.translate(node, 'en');
    assert.equal(node.nodeValue, original);
  }
});

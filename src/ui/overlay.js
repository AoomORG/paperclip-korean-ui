const STORAGE_KEY = "paperclip.uiLanguage";
const SKIP_TEXT_SELECTOR = [
  "code",
  "pre",
  "kbd",
  "samp",
  "textarea",
  "script",
  "style",
  "[contenteditable='true']",
  "[contenteditable='']",
  ".cm-editor",
  ".monaco-editor",
  "[data-pc-i18n-skip]",
  "input",
  "[role='textbox']",
].join(",");
const SKIP_ATTR_SELECTOR = [
  "code",
  "pre",
  "kbd",
  "samp",
  "script",
  "style",
  ".cm-editor",
  ".monaco-editor",
  "[data-pc-i18n-skip]",
  ".prose",
].join(",");
const STATUS_SKIP = new Set([
  "todo",
  "in_progress",
  "blocked",
  "done",
  "High",
  "Medium",
  "Low",
  "idle",
  "paused",
  "error",
  "succeeded",
  "running",
  "failed",
  "unknown",
]);
const ATTRS = ["aria-label", "title", "placeholder"];

const originalText = new WeakMap();
const originalAttr = new WeakMap();
let observer = null;
let started = false;
const overlayOwned = new WeakSet();
const overlaySetValues = new WeakMap();
let applyingOverlay = false;
let layoutFixFrame = 0;
const runOriginalById = new Map();
let runOriginalFetchId = null;
const RUN_ORIGINAL_ID = "pc-korean-ui-run-original";
let lastSeenRunId = null;
let runOriginalMountedId = null;
let runOriginalSeq = 0;
let runOriginalAbort = null;

export function getUiLanguage() {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "en" ? "en" : "ko";
}

export function setUiLanguage(lang) {
  window.localStorage.setItem(STORAGE_KEY, lang === "en" ? "en" : "ko");
  window.dispatchEvent(new Event("paperclip-ui-language"));
}

function isIssueId(text) {
  return /^[A-Z]{2,5}-\d+$/.test(text);
}

function isAgentKey(text) {
  return /^[A-Z][A-Z0-9]+(-[A-Z0-9]+)+$/.test(text);
}

function isPathish(text) {
  return text.startsWith("/") || text.startsWith("~") || text.startsWith("http://") || text.startsWith("https://");
}

function shouldSkipNode(node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!el) return true;
  if (el.closest(SKIP_TEXT_SELECTOR)) return true;
  if (el.closest("[data-language-toggle]")) return true;
  return false;
}

function inNav(node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return Boolean(el && el.closest("nav"));
}

function inInbox(node) {
  if (window.location.pathname.includes("/inbox")) return true;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return Boolean(el && el.closest('[role="tablist"]'));
}

function inSkills() {
  return window.location.pathname.includes("/skills");
}

function inSettings() {
  const path = window.location.pathname;
  return (
    path.includes("/company/settings") ||
    path.includes("/company/export") ||
    path.includes("/company/import")
  );
}

function inAgent() {
  return /\/agents(\/|$)/.test(window.location.pathname);
}

function inDashboard() {
  return /\/dashboard(\/|$)/.test(window.location.pathname);
}

function inApps() {
  return /\/apps(\/|$)/.test(window.location.pathname);
}

function isStoredWikiTitle(el) {
  if (!inWiki()) return false;
  return Boolean(el?.closest('article header h1'));
}
function isStoredFileTreeTitle(el) {
  if (!el) return false;
  if (el.closest('button, [role="tab"], nav')) return false;
  return Boolean(el.closest('[role="treeitem"][data-file-tree-path]'));
}
function isStoredIssueTitle(el) {
  if (!el) return false;
  if (el.closest('[data-inbox-issue-link]')) return true;
  const titleSpan = el.closest('span.line-clamp-2');
  if (!titleSpan) return false;
  if (titleSpan.closest('button, nav, [role="tab"]')) return false;
  const row = titleSpan.closest('.group');
  return Boolean(row && typeof row.querySelector === 'function' && row.querySelector('[data-inbox-issue-link]'));
}
function isStoredUserContent(el) {
  return isStoredWikiTitle(el) || isStoredFileTreeTitle(el) || isStoredIssueTitle(el);
}
function isWikiChromeControl(el) {
  if (!el || isStoredWikiTitle(el)) return false;
  return Boolean(el.closest('button, [role="tab"], [role="tablist"], nav, [aria-label="On this page"]'));
}
const WIKI_UNIQUE_CHROME = new Set(["Add Content", "SHARED WIKI SPACES", "Shared Wiki Spaces", "Edit page", "On this page", "Updated"]);
function inWiki() {
  return /\/wiki(\/|$)/.test(window.location.pathname);
}

function inRuns() {
  return /\/runs(\/|$)/.test(window.location.pathname);
}

function translateCollapseExpand(text) {
  const nav = chromeCatalog.nav || {};
  for (const prefix of ["Collapse ", "Expand "]) {
    if (!text.startsWith(prefix)) continue;
    const rest = text.slice(prefix.length);
    const restKo = nav[rest] || (chromeCatalog.global && chromeCatalog.global[rest]) || rest;
    return prefix === "Collapse " ? restKo + " 접기" : restKo + " 펼치기";
  }
  return null;
}

function translateRelativeTime(text) {
  let out = text;
  out = out.replace(/\b(\d+)h ago\b/g, "$1시간 전");
  out = out.replace(/\b(\d+)m ago\b/g, "$1분 전");
  out = out.replace(/\b(\d+)s ago\b/g, "$1초 전");
  out = out.replace(/\b(\d+)d ago\b/g, "$1일 전");
  out = out.replace(/\b(\d+)w ago\b/g, "$1주 전");
  out = out.replace(/\bJust now\b/g, "방금");
  return out === text ? null : out;
}

function translateSettingsPrefix(text) {
  if (!inSettings()) return null;
  const settings = chromeCatalog.settings || {};
  if (text.startsWith("Default resolver audience for ")) {
    const rest = text.slice("Default resolver audience for ".length);
    return (settings[rest] || rest) + " 기본 응답 대상";
  }
  if (text.startsWith("Resolver cap for ")) {
    const rest = text.slice("Resolver cap for ".length);
    return (settings[rest] || rest) + " 상한";
  }
  if (text.startsWith("Toggle ") && text.endsWith(" experimental setting")) {
    const inner = text.slice("Toggle ".length, -" experimental setting".length);
    return (settings[inner] || inner) + " 실험 설정 켜기/끄기";
  }
  return null;
}

function translateWorkedFor(text) {
  let m = text.match(/^worked for (\d+) minutes?$/);
  if (m) return m[1] + "분 작업";
  m = text.match(/^worked for (\d+) seconds?$/);
  if (m) return m[1] + "초 작업";
  m = text.match(/^Finished (.+)$/);
  if (m) {
    const rel = translateRelativeTime(m[1]) || m[1];
    return "완료 " + rel;
  }
  return null;
}

function translateRunChrome(text) {
  if (text.startsWith("Tasks Touched")) return "관련 작업" + text.slice("Tasks Touched".length);
  let m = text.match(/^(\d+) tok$/);
  if (m) return m[1] + " 토큰";
  if (text === "See All →" || text === "See All ->") return "모두 보기 →";
  m = text.match(/^(\d+) running, (\d+) paused, (\d+) errors$/);
  if (m) return "실행 " + m[1] + ", 일시정지 " + m[2] + ", 오류 " + m[3];
  m = text.match(/^(\d+) open, (\d+) blocked$/);
  if (m) return "열림 " + m[1] + ", 막힘 " + m[2];
  m = text.match(/^Failed after (.+)$/i);
  if (m) return translateDurationChunk(m[1]) + " 후 실패";
  m = text.match(/^Timed out after (.+)$/i);
  if (m) return translateDurationChunk(m[1]) + " 후 시간 초과";
  m = text.match(/^Transcript \((\d+)\)$/);
  if (m) return "기록 (" + m[1] + ")";
  m = text.match(/^Transcript\((\d+)\)$/);
  if (m) return "기록 (" + m[1] + ")";
  // Host preview can split the tab label across text nodes: "Transcript (" + "1)".
  if (text === "Transcript (") return "기록 (";
  if (text === "Transcript(") return "기록(";
  return null;
}

function translateDurationChunk(text) {
  return text
    .replace(/\b(\d+) seconds?\b/g, "$1초")
    .replace(/\b(\d+) minutes?\b/g, "$1분")
    .replace(/\b(\d+) hours?\b/g, "$1시간");
}

const ISSUE_CHROME = new Set([
  "Properties", "Triage", "TRIAGE", "Status", "Labels", "Assignee", "Project",
  "Relationships", "RELATIONSHIPS", "Parent", "Blocked by", "Blocking", "Related tasks",
  "Execution", "EXECUTION", "Reviewers", "Approvers", "Monitor", "Watchdog",
  "About", "ABOUT", "Originating", "Started", "Created", "Updated",
  "Add blocker", "+ Add blocker", "Worked", "Auto mode",
]);

const ITEM_VERDICT_CHROME = new Set([
  "Approve", "Reject", "Defer", "Approve all",
  "Apply 0 decisions", "Applying…",
  "Approve this item", "Reject this item", "Defer this item",
  "Choose a verdict", "Items to review",
  "Mark verdicts, then apply them in one pass.",
  "Reason needed", "Human only",
]);

function lookup(text, node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (isStoredUserContent(el)) return null;
  const organizationSwitcher = text.match(/^Open (.+) organization switcher$/);
  if (organizationSwitcher && el?.closest('button')) return `${organizationSwitcher[1]} 조직 전환 열기`;
  // System UI only: never translate editable/source content or stored issue prose.
  const systemNotice = Boolean(el?.closest('[data-testid="task-chat-system-notice"], [data-testid="task-chat-system-notice-details"]'));
  const decisionSurface = /\/(decisions|inbox)(\/|$)/.test(window.location.pathname)
    || Boolean(el?.closest('[data-testid="issue-recovery-action-card"], [data-recovery-state], [data-radix-popper-content-wrapper], [data-attention-actions], [data-verdict], [aria-label="Choose a verdict"], [aria-label="Approve this item"], [aria-label="Reject this item"], [aria-label="Defer this item"]'));
  if (systemNotice || (decisionSurface && !el?.closest('.prose, [data-pc-i18n-skip]'))) {
    const catalog = chromeCatalog.decisions || {};
    const normalized = text.replace(/\s+/g, " ").replace(/[’]/g, "'");
    if (catalog[normalized]) return catalog[normalized];
    if (catalog[text.replace(/[’]/g, "'")]) return catalog[text.replace(/[’]/g, "'")];
    // The decision feed abbreviates known system messages before rendering.
    const quoted = normalized.replace(/^[“"]|[”"]$/g, "");
    const abbreviated = /(?:\.\.\.|…)$/u.test(quoted);
    const prefix = quoted.replace(/(?:\.\.\.|…)$/u, "");
    if (/^Board operator: inspect (the run evidence|the evidence),/.test(prefix)) {
      const key = Object.keys(catalog).find(k => k === quoted || (abbreviated && prefix.length > 100 && k.startsWith(prefix)));
      if (key) return catalog[key];
    }
    let match = normalized.match(/^Blocks (\d+) tasks and needs human attention\.$/);
    if (match) return `후속 작업 ${match[1]}개가 막혀 있습니다. 담당자의 확인이 필요합니다.`;
    match = normalized.match(/^(\d+) decisions?$/);
    if (match) return `결정 ${match[1]}건`;
    match = normalized.match(/^Recovery in progress · (\d+)\/(\d+)$/);
    if (match) return `복구 진행 중 · ${match[1]}/${match[2]}`;
    match = normalized.match(/^Blocked · (\d+) blockers? needs? attention$/);
    if (match) return `막힘 · 확인이 필요한 차단 ${match[1]}건`;
    match = normalized.match(/^Apply (\d+) decisions?$/);
    if (match) return `결정 ${match[1]}건 적용`;
    match = normalized.match(/^(\d+) draft verdicts? ready to apply$/);
    if (match) return `적용할 초안 ${match[1]}건`;
    if (systemNotice) return null;
  }
  const issueChrome = /\/issues(\/|$)/.test(window.location.pathname)
    && !el?.closest('.prose, [data-pc-i18n-skip]');
  if (issueChrome) {
    const catalog = chromeCatalog.decisions || {};
    const chromeText = text.replace(/\s+/g, " ");
    if (ISSUE_CHROME.has(chromeText) && catalog[chromeText]) return catalog[chromeText];
    if (ITEM_VERDICT_CHROME.has(chromeText) && catalog[chromeText]) return catalog[chromeText];
    let m = text.match(/^Called (\d+) tools$/);
    if (m) return `도구 ${m[1]}회 호출`;
    m = text.match(/^Blocked · (\d+) blockers? needs? attention$/);
    if (m) return `막힘 · 확인이 필요한 차단 ${m[1]}건`;
    m = chromeText.match(/^Apply (\d+) decisions?$/);
    if (m) return `결정 ${m[1]}건 적용`;
    m = chromeText.match(/^(\d+) draft verdicts? ready to apply$/);
    if (m) return `적용할 초안 ${m[1]}건`;
  }
  if (inAgent() && !el?.closest('.prose, [data-pc-i18n-skip]')) {
    const agents = chromeCatalog.agents || {};
    if (agents[text]) return agents[text];
  }
  const skipProse = Boolean(el?.closest('.prose, [data-pc-i18n-skip]'));
  if (skipProse) return null;
  if (!skipProse) {
    const path = window.location.pathname;
    if (/\/routines(\/|$)/.test(path)) {
      const folderHint = 'into folders to keep things tidy.';
      if (text === 'Group these' && el?.textContent?.includes(folderHint)) return '이';
      if (text === 'routines' && el?.textContent?.includes(folderHint)) return '루틴을';
      if (text === folderHint) return '폴더에 묶어 정리하세요.';
    }
    if (/\/apps(\/|$)/.test(path) && el?.closest('button')) {
      const addAccount = text.match(/^Add account (.+)$/);
      if (addAccount) return `${addAccount[1]} 계정 추가`;
      const addConnection = text.match(/^Add connection (.+)$/);
      if (addConnection) return `${addConnection[1]} 연결 추가`;
      const connect = text.match(/^Connect (.+)$/);
      if (connect && !text.includes(' server') && !text.endsWith('.')) return `${connect[1]} 연결`;
    }
    const routeCatalogs = [
      [/\/(activity|audit|costs|budgets|timeline)(\/|$)/, chromeCatalog.activity],
      [/\/routines(\/|$)/, chromeCatalog.routines],
      [/\/projects(\/|$)/, chromeCatalog.projects],
      [/\/workspaces(\/|$)/, chromeCatalog.workspaces],
      [/\/issues(\/|$)/, chromeCatalog.issues],
      [/\/approvals(\/|$)/, chromeCatalog.approvals],
    ];
    for (const [pattern, catalog] of routeCatalogs) {
      if (pattern.test(path) && catalog?.[text]) return catalog[text];
    }
    if (/\/routines(\/|$)/.test(path)) {
      const count = text.match(/^(\d+) routines?$/);
      if (count) return `루틴 ${count[1]}개`;
    }
    if (/\/projects(\/|$)/.test(path)) {
      const count = text.match(/^(\d+) (projects?|tasks?)$/);
      if (count) return `${count[2].startsWith('project') ? '프로젝트' : '작업'} ${count[1]}개`;
      if (text.startsWith('Sort: ')) return `정렬: ${text.slice(6)}`;
    }
    if (/\/workspaces(\/|$)/.test(path)) {
      const count = text.match(/^(\d+) workspaces?$/);
      if (count) return `작업공간 ${count[1]}개`;
      const shown = text.match(/^Showing (\d+) of (\d+) workspaces\.$/);
      if (shown) return `작업공간 ${shown[2]}개 중 ${shown[1]}개 표시`;
    }
    if (/\/activity(\/|$)/.test(path)) {
      const events = text.match(/^(\d+) total events in range$/);
      if (events) return `선택 기간 이벤트 ${events[1]}건`;
      const tokenEvents = text.match(/^([\d.]+[KMB]?) tokens across request-scoped events$/);
      if (tokenEvents) return `요청별 이벤트에서 토큰 ${tokenEvents[1]}개 사용`;
      const debits = text.match(/^(\$[\d,.]+) debits · (\$[\d,.]+) credits$/);
      if (debits) return `차변 ${debits[1]} · 대변 ${debits[2]}`;
      const estimate = text.match(/^(\$[\d,.]+) estimated in range$/);
      if (estimate) return `선택 기간 예상액 ${estimate[1]}`;
      const inOut = text.match(/^in ([\d.]+[KMB]?) · out ([\d.]+[KMB]?)$/);
      if (inOut) return `입력 ${inOut[1]} · 출력 ${inOut[2]}`;
      const biller = text.match(/^(\d+) api · (\d+) subscription$/);
      if (biller) return `API ${biller[1]} · 구독 ${biller[2]}`;
    }
    if (/\/approvals(\/|$)/.test(path) && text.startsWith('Approval request created ')) {
      const when = text.slice('Approval request created '.length);
      return `승인 요청 생성 ${translateRelativeTime(when) || when}`;
    }
    const runChromeEarly = translateRunChrome(text);
    if (runChromeEarly) return runChromeEarly;
    if (inDashboard()) {
      const dashTokens = { running: "실행 중", paused: "일시정지", errors: "오류", open: "열림", blocked: "막힘", Backlog: "백로그" };
      if (dashTokens[text]) return dashTokens[text];
      if (chromeCatalog.agents && chromeCatalog.agents[text]) return chromeCatalog.agents[text];
    }
    if (inRuns()) {
      if (text === "failed") return "실패";
      if (text === "blocked") return "막힘";
      if (text === "error") return "오류";
      if (chromeCatalog.agents && chromeCatalog.agents[text]) return chromeCatalog.agents[text];
    }
    if (inApps() && chromeCatalog.apps && chromeCatalog.apps[text]) return chromeCatalog.apps[text];
    if (inDashboard() && chromeCatalog.global && chromeCatalog.global[text]) return chromeCatalog.global[text];
  }
  if (!text || STATUS_SKIP.has(text) || isIssueId(text) || isAgentKey(text) || isPathish(text)) {
    return null;
  }
  if (!skipProse && !isStoredWikiTitle(el)) {
    if (inWiki() && !isStoredWikiTitle(el) && text.startsWith("Updated ")) {
      return "갱신 " + text.slice("Updated ".length);
    }
    if (inWiki() && chromeCatalog.wiki && chromeCatalog.wiki[text] && (isWikiChromeControl(el) || WIKI_UNIQUE_CHROME.has(text))) {
      return chromeCatalog.wiki[text];
    }
    if (chromeCatalog.global && chromeCatalog.global[text]) return chromeCatalog.global[text];
  }
  if (chromeCatalog.dashboard && chromeCatalog.dashboard[text]) return chromeCatalog.dashboard[text];
  if (text.startsWith("Open actions for ")) {
    return "작업 열기: " + text.slice("Open actions for ".length);
  }
  if (text.startsWith("Star ")) {
    return "즐겨찾기 " + text.slice("Star ".length);
  }
  if (text.startsWith("Unstar ")) {
    return "즐겨찾기 해제 " + text.slice("Unstar ".length);
  }
  if (text.startsWith("Idle past ") && text.includes("kept off the queue")) {
    const m = text.match(/^Idle past (\d+) days/);
    if (m) return m[1] + "일 넘게 멈춰 대기열에서 빼 둔 항목입니다. 다시 보이게 할 것은 남겨 두세요.";
  }
  if (text.startsWith("Change status (current: ") && text.endsWith(")")) {
    const inner = text.slice("Change status (current: ".length, -1);
    return "상태 변경 (현재: " + inner + ")";
  }
  if (text.startsWith("Open ") && /^Open [A-Z]{2,5}-\d+:/.test(text)) {
    return "열기 " + text.slice(5);
  }
  const worked = translateWorkedFor(text);
  if (worked) return worked;
  const runChrome = translateRunChrome(text);
  if (runChrome) return runChrome;
  const rel = translateRelativeTime(text);
  if (rel) return rel;
  const collapse = translateCollapseExpand(text);
  if (collapse) return collapse;
  if (chromeCatalog.nav && inNav(node)) {
    if (chromeCatalog.nav[text]) return chromeCatalog.nav[text];
    for (const [en, ko] of Object.entries(chromeCatalog.nav)) {
      if (text.startsWith(en + " ") || text.startsWith(en + ",") || text.startsWith(en + " ")) {
        return text.replace(en, ko).replace(" unread", " 안 읽음").replace(" unread,", " 안 읽음,");
      }
    }
  }
  if (chromeCatalog.inbox && chromeCatalog.inbox[text] && inInbox(node)) return chromeCatalog.inbox[text];
  if (inSkills() && chromeCatalog.skills && chromeCatalog.skills[text]) return chromeCatalog.skills[text];
  const settingsPrefix = translateSettingsPrefix(text);
  if (settingsPrefix) return settingsPrefix;
  if (inSettings() && chromeCatalog.settings && chromeCatalog.settings[text]) {
    return chromeCatalog.settings[text];
  }
  if (inAgent() && !el?.closest('.prose, [data-pc-i18n-skip]')) {
    const agents = chromeCatalog.agents || {};
    if (agents[text]) return agents[text];
    if (chromeCatalog.settings && chromeCatalog.settings[text]) return chromeCatalog.settings[text];
    let m = text.match(/^Called (\d+) tools$/);
    if (m) return `도구 ${m[1]}회 호출`;
    m = text.match(/^Used (\d+) tools \((\d+) calls\)$/);
    if (m) return `도구 ${m[1]}개 사용(호출 ${m[2]}회)`;
    m = text.match(/^Blocked · (\d+) blockers? needs? attention$/);
    if (m) return `막힘 · 확인이 필요한 차단 ${m[1]}건`;
    m = text.match(/^(\d+) of (\d+)$/);
    if (m) return `${m[1]}/${m[2]}`;
  }
  const fr = chromeCatalog.fragments || {};
  let mixed = text;
  for (const [en, ko] of Object.entries(fr)) {
    if (mixed.includes(en)) mixed = mixed.split(en).join(ko);
  }
  return mixed === text ? null : mixed;
}

function translateTextNode(node, lang) {
  if (shouldSkipNode(node)) return;
  const raw = node.nodeValue ?? "";
  const trimmed = raw.trim();
  if (lang !== "ko") {
    if (originalText.has(node)) {
      node.nodeValue = originalText.get(node);
      originalText.delete(node);
    }
    return;
  }
  if (!trimmed) return;
  const parent = node.parentElement;
  if (/\/projects(\/|$)/.test(window.location.pathname) && parent?.classList?.contains('tabular-nums')) {
    const count = parent.textContent.trim().match(/^(\d+) (tasks?|projects?)$/);
    const parts = [...parent.childNodes].filter(child => child.nodeType === Node.TEXT_NODE);
    if (count && parts.length > 1 && parts[0] === node) {
      for (const part of parts) if (!originalText.has(part)) originalText.set(part, part.nodeValue ?? '');
      parts[0].nodeValue = `${count[1]}개 ${count[2].startsWith('task') ? '작업' : '프로젝트'}`;
      for (const part of parts.slice(1)) part.nodeValue = '';
      return;
    }
  }
  const translated = lookup(trimmed, node);
  if (!translated || translated === trimmed) return;
  if (!originalText.has(node)) originalText.set(node, raw);
  node.nodeValue = raw.replace(trimmed, translated);
}

function shouldSkipAttrs(el) {
  if (!el) return true;
  if (el.closest(SKIP_ATTR_SELECTOR)) return true;
  return false;
}

function translateAttrs(el, lang) {
  if (shouldSkipAttrs(el)) return;
  if (el.getAttribute?.("data-pc-original-summary") || el.closest?.("nav a[href*='/runs'], nav a[href*='/runs/']")) return;
  for (const attr of ATTRS) {
    if (!el.hasAttribute(attr)) continue;
    const current = el.getAttribute(attr) ?? "";
    const trimmed = current.trim();
    if (!trimmed) continue;
    const bag = originalAttr.get(el) ?? {};
    if (lang !== "ko") {
      if (bag[attr] != null) {
        el.setAttribute(attr, bag[attr]);
        delete bag[attr];
      }
      continue;
    }
    const translated = lookup(trimmed, el);
    if (!translated || translated === trimmed) continue;
    if (bag[attr] == null) bag[attr] = current;
    originalAttr.set(el, bag);
    el.setAttribute(attr, current.replace(trimmed, translated));
  }
}

function restoreSkillParagraph(p) {
  if (p.childNodes.length === 1 && p.firstChild && p.firstChild.nodeType === Node.TEXT_NODE && originalText.has(p.firstChild)) {
    p.firstChild.nodeValue = originalText.get(p.firstChild);
    originalText.delete(p.firstChild);
  }
}

function isSkillCardRoot(el) {
  if (!el || el === document.body) return false;
  const role = el.getAttribute?.("role") || "";
  if (role === "listitem" || role === "article") return true;
  const tag = el.tagName;
  return tag === "LI" || tag === "ARTICLE";
}

function countSkillNames(root, nameSet) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = 0;
  while (walker.nextNode()) {
    const label = (walker.currentNode.nodeValue ?? "").trim();
    if (nameSet.has(label)) n += 1;
    if (n > 1) return n;
  }
  return n;
}

function closestSkillCard(nameNode, nameSet) {
  const label = (nameNode.nodeValue ?? "").trim();
  let el = nameNode.parentElement;
  while (el && el !== document.body) {
    if (isSkillCardRoot(el) && countSkillNames(el, nameSet) <= 1) return el;
    el = el.parentElement;
  }
  el = nameNode.parentElement;
  while (el && el !== document.body) {
    const blob = (el.textContent || "").trim();
    if (blob.length > label.length + 40 && countSkillNames(el, nameSet) <= 1) return el;
    el = el.parentElement;
  }
  return nameNode.parentElement;
}

function applySkills(root, lang) {
  if (!window.location.pathname.includes("/skills")) return;
  const catalog = skillsCatalog;
  if (!catalog) return;
  if (!root) return;
  const nameSet = new Set(Object.keys(catalog));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (shouldSkipNode(node)) continue;
    const label = (node.nodeValue ?? "").trim();
    if (!nameSet.has(label)) continue;
    hits.push({ node, label });
  }
  for (const { node, label } of hits) {
    const card = closestSkillCard(node, nameSet);
    if (!card || card === document.body) continue;
    const translated = catalog[label];
    const textWalker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    while (textWalker.nextNode()) {
      const desc = textWalker.currentNode;
      if (desc === node) continue;
      if (shouldSkipNode(desc)) continue;
      const text = (desc.nodeValue ?? "").trim();
      if (text.length < 40) continue;
      if (lang !== "ko") {
        if (originalText.has(desc)) {
          const orig = originalText.get(desc);
          const cur = desc.nodeValue ?? "";
          if (cur === orig || (translated && cur.trim() === translated.trim())) {
            desc.nodeValue = orig;
          }
          originalText.delete(desc);
          overlayOwned.delete(desc);
        }
        continue;
      }
      if (!translated) continue;
      if (text === translated) break;
      if (!originalText.has(desc)) originalText.set(desc, desc.nodeValue ?? "");
      overlayOwned.add(desc);
      desc.nodeValue = translated;
      break;
    }
  }
}

function applyTree(root, lang) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, lang);
    else if (node.nodeType === Node.ELEMENT_NODE) translateAttrs(node, lang);
  }
  const skillRoot = root instanceof Document ? root.body : root;
  if (skillRoot) applySkills(skillRoot, lang);
}

const CLIP_STYLE_ID = "paperclip-korean-ui-clip-fix";
const CLIP_FIX_CSS = `
a[href*="agent-connect"] {
  min-width: 0 !important;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
a[href*="agent-connect"] > span:last-of-type {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-radix-popper-content-wrapper]:has(a[href*="/company/settings/instance/profile"]) {
  top: 8px !important;
  bottom: auto !important;
  transform: none !important;
  max-height: calc(100vh - 16px) !important;
}
[data-radix-popper-content-wrapper]:has(a[href*="/company/settings/instance/profile"]) > * {
  max-height: calc(100vh - 16px) !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
}
a[href*="/runs"] span.truncate,
a[href*="/runs/"] span.truncate {
  display: block !important;
  min-width: 0 !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
  line-height: 1.35 !important;
}
a[href*="/runs"]:focus-visible,
a[href*="/runs/"]:focus-visible {
  outline: 2px solid var(--ring, #2563eb) !important;
  outline-offset: -2px !important;
  background-color: var(--accent, rgba(0, 0, 0, 0.05)) !important;
}
[data-pc-run-original] {
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  flex: 0 0 auto !important;
  align-self: stretch !important;
  grid-column: 1 / -1 !important;
  box-sizing: border-box !important;
  margin: 0.75rem 0 1rem !important;
  padding: 0.75rem 0.9rem !important;
  border: 1px solid var(--border, rgba(127,127,127,0.35));
  border-radius: 8px;
}
[data-pc-run-original-text] {
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  white-space: pre-wrap !important;
  overflow: visible !important;
  text-overflow: clip !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
  margin: 0 !important;
  font: inherit !important;
}
html.pc-ui16-board-chat #main-content {
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
}
html.pc-ui16-board-chat #main-content > div.flex.flex-col {
  margin: 0 !important;
  min-height: 0 !important;
  flex: 1 1 auto !important;
}
`;

function looksLikeMarkdown(text) {
  return /(^|\s)#{1,6}\s|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|^\s*[-*+]\s|\[[^\]]+\]\([^)]+\)/m.test(text);
}

function stripMarkdownPreview(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function injectClipFixCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(CLIP_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CLIP_STYLE_ID;
  style.textContent = CLIP_FIX_CSS;
  document.head.appendChild(style);
}

function decorateConnectLinks(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const links = root.querySelectorAll('a[href*="agent-connect"]');
  for (const link of links) {
    const label = (link.textContent || "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    if (!link.getAttribute("title")) link.setAttribute("title", label);
    if (!link.getAttribute("aria-label")) link.setAttribute("aria-label", label);
  }
}

function fitAccountPopoverOnce() {
  if (typeof document === "undefined") return false;
  let clipped = false;
  const wrappers = document.querySelectorAll("[data-radix-popper-content-wrapper]");
  for (const wrap of wrappers) {
    if (!(wrap instanceof HTMLElement)) continue;
    if (!wrap.querySelector('a[href*="/company/settings/instance/profile"]')) continue;
    const max = Math.max(240, window.innerHeight - 16);
    const inner = wrap.firstElementChild;
    if (inner instanceof HTMLElement) {
      inner.style.setProperty("max-height", max + "px", "important");
      inner.style.setProperty("overflow-y", "auto", "important");
      inner.style.setProperty("overflow-x", "hidden", "important");
    }
    wrap.style.setProperty("max-height", max + "px", "important");
    const rect = wrap.getBoundingClientRect();
    if (rect.top >= 8 && rect.bottom <= window.innerHeight - 8) continue;
    wrap.style.setProperty("left", Math.max(8, rect.left) + "px", "important");
    wrap.style.setProperty("top", "8px", "important");
    wrap.style.setProperty("bottom", "auto", "important");
    wrap.style.setProperty("transform", "translate3d(0px, 0px, 0px)", "important");
    if (wrap.getBoundingClientRect().top < 8) clipped = true;
  }
  return clipped;
}

function fitAccountPopover() {
  if (!fitAccountPopoverOnce()) return;
  requestAnimationFrame(() => {
    if (!fitAccountPopoverOnce()) return;
    setTimeout(fitAccountPopoverOnce, 50);
    setTimeout(fitAccountPopoverOnce, 160);
  });
}

function setNodeValueIfChanged(node, next) {
  if (node.nodeValue === next) return false;
  node.nodeValue = next;
  return true;
}

function softenRunListMarkdown(root, lang) {
  if (typeof window === "undefined") return;
  if (!new RegExp("/agents/[^/]+/runs").test(window.location.pathname)) return;
  const scope = root && root.querySelectorAll ? root : document.body;
  if (!scope || typeof scope.querySelectorAll !== "function") return;
  const spans = scope.querySelectorAll("a[href*='/runs'] span.truncate, a[href*='/runs/'] span.truncate");
  for (const span of spans) {
    if (shouldSkipNode(span)) continue;
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const raw = node.nodeValue ?? "";
      if (lang !== "ko") {
        if (originalText.has(node)) {
          setNodeValueIfChanged(node, originalText.get(node));
          originalText.delete(node);
          overlayOwned.delete(node);
          overlaySetValues.delete(node);
        }
        continue;
      }
      const prevSoftened = overlaySetValues.get(node);
      if (originalText.has(node) && prevSoftened != null && raw !== prevSoftened) {
        originalText.delete(node);
        overlayOwned.delete(node);
        overlaySetValues.delete(node);
      }
      const source = originalText.get(node) ?? raw;
      const trimmed = source.trim();
      if (!trimmed || !looksLikeMarkdown(trimmed)) continue;
      const stripped = stripMarkdownPreview(trimmed);
      if (!stripped || stripped === trimmed) continue;
      const next = source.replace(trimmed, stripped);
      if (!originalText.has(node)) originalText.set(node, source);
      overlayOwned.add(node);
      overlaySetValues.set(node, next);
      setNodeValueIfChanged(node, next);
    }
  }
}

function exposeRunSummaryOriginal(root) {
  if (typeof window === "undefined") return;
  const scope = root && root.querySelectorAll ? root : document.body;
  if (!scope || typeof scope.querySelectorAll !== "function") return;
  const spans = scope.querySelectorAll("a[href*='/runs'] span.truncate, a[href*='/runs/'] span.truncate");
  for (const summarySpan of spans) {
    const link = summarySpan.closest("a[href*='/runs'], a[href*='/runs/']");
    if (!link) continue;
    if (link.closest("nav")) continue;
    const walker = document.createTreeWalker(summarySpan, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      parts.push(originalText.has(node) ? originalText.get(node) : (node.nodeValue ?? ""));
    }
    const full = parts.join("").replace(/\s+/g, " ").trim();
    if (!full) continue;
    if (link.getAttribute("data-pc-original-summary") !== full) {
      link.setAttribute("data-pc-original-summary", full);
    }
    if (link.getAttribute("title") !== full) {
      link.setAttribute("title", full);
    }
    if (summarySpan.getAttribute("data-pc-original-summary") !== full) {
      summarySpan.setAttribute("data-pc-original-summary", full);
    }
    if (summarySpan.getAttribute("title") !== full) {
      summarySpan.setAttribute("title", full);
    }
    const currentAria = link.getAttribute("aria-label");
    const hasOwnerLabel = link.getAttribute("data-pc-has-summary-label") === "true";
    if (!currentAria || hasOwnerLabel) {
      if (currentAria !== full) {
        link.setAttribute("aria-label", full);
      }
      if (!hasOwnerLabel) {
        link.setAttribute("data-pc-has-summary-label", "true");
      }
    }
  }
}

function liftRunPreviewClip(root) {
  if (typeof window === "undefined") return;
  if (!new RegExp("/agents(/|$)").test(window.location.pathname)) return;
  const scope = root && root.querySelectorAll ? root : document.body;
  if (!scope || typeof scope.querySelectorAll !== "function") return;
  const nodes = scope.querySelectorAll("a[href*='/runs'] div.overflow-hidden.max-h-16, a[href*='/runs/'] div.overflow-hidden.max-h-16, a[href*='/issues/'] div.overflow-hidden.max-h-16");
  for (const el of nodes) {
    if (el instanceof HTMLElement) el.style.maxHeight = "7.5rem";
  }
}

function parseRunDetailId(pathname) {
  const match = String(pathname || "").match(/\/runs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match ? match[1].toLowerCase() : null;
}

function extractRunOriginal(run) {
  if (!run || typeof run !== "object") return { text: "", field: null };
  const resultJson = run.resultJson && typeof run.resultJson === "object" ? run.resultJson : null;
  if (resultJson) {
    if (typeof resultJson.summary === "string" && resultJson.summary.length > 0) {
      return { text: resultJson.summary, field: "resultJson.summary" };
    }
    if (typeof resultJson.result === "string" && resultJson.result.length > 0) {
      return { text: resultJson.result, field: "resultJson.result" };
    }
  }
  if (typeof run.error === "string" && run.error.length > 0) {
    return { text: run.error, field: "error" };
  }
  return { text: "", field: null };
}

function renderRunOriginalPanel(rec) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return;
  let el = document.getElementById?.(RUN_ORIGINAL_ID) || null;
  const currentId = typeof window !== "undefined" ? parseRunDetailId(window.location?.pathname) : null;
  if (!rec || rec.status !== "ok" || !rec.text || rec.runId !== currentId || rec.seq !== runOriginalSeq) {
    if (el) el.remove();
    runOriginalMountedId = null;
    return;
  }
  if (!el) {
    el = document.createElement("section");
    el.id = RUN_ORIGINAL_ID;
    el.setAttribute("data-pc-run-original", "true");
    el.setAttribute("data-pc-i18n-skip", "true");
    const pre = document.createElement("pre");
    pre.setAttribute("data-pc-run-original-text", "true");
    pre.setAttribute("data-pc-i18n-skip", "true");
    el.appendChild(pre);
  }
  const pre = el.querySelector("[data-pc-run-original-text]");
  if (pre && pre.textContent !== rec.text) pre.textContent = rec.text;
  el.setAttribute("data-pc-run-original-field", rec.field || "");
  el.setAttribute("data-pc-run-original-len", String(rec.text.length));
  runOriginalMountedId = rec.runId;
  placeRunOriginalPanel(el);
}

function findAgentPageHeaderRow() {
  const heading = document.querySelector("main h1, main h2, h1, h2");
  if (!heading) return null;
  let el = heading.parentElement;
  while (el && el !== document.body) {
    const className = String(el.className || "");
    if (className.includes("justify-between") && el.querySelector("button")) return el;
    el = el.parentElement;
  }
  return null;
}

function placeRunOriginalPanel(el) {
  const headerRow = findAgentPageHeaderRow();
  if (headerRow && headerRow.parentElement) {
    if (el.previousElementSibling === headerRow && el.parentElement === headerRow.parentElement) return;
    headerRow.insertAdjacentElement("afterend", el);
    return;
  }
  const main = document.querySelector("main") || document.body;
  if (el.parentElement === main) return;
  main.appendChild(el);
}

function mountRunOriginalSummary() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (typeof document.getElementById !== "function") return;
  const runId = parseRunDetailId(window.location?.pathname);
  if (lastSeenRunId !== runId) {
    if (lastSeenRunId) runOriginalById.delete(lastSeenRunId);
    runOriginalSeq += 1;
    if (runOriginalAbort) {
      try { runOriginalAbort.abort(); } catch {}
      runOriginalAbort = null;
    }
    runOriginalFetchId = null;
    const stale = document.getElementById(RUN_ORIGINAL_ID);
    if (stale) stale.remove();
    runOriginalMountedId = null;
    lastSeenRunId = runId;
  }
  if (!runId) return;
  const cached = runOriginalById.get(runId);
  if (cached && cached.seq === runOriginalSeq) {
    if (cached.status === "ok" && cached.text) renderRunOriginalPanel(cached);
    else {
      const el = document.getElementById(RUN_ORIGINAL_ID);
      if (el) el.remove();
      runOriginalMountedId = null;
    }
    return;
  }
  if (runOriginalFetchId === runId || typeof window.fetch !== "function") return;
  const seq = runOriginalSeq;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  runOriginalAbort = controller;
  runOriginalFetchId = runId;
  const requestPath = "/api/heartbeat-runs/" + runId;
  const applyIfCurrent = (writer) => {
    if (seq !== runOriginalSeq) return false;
    if (parseRunDetailId(window.location?.pathname) !== runId) return false;
    writer();
    return true;
  };
  const clearPanel = () => {
    const el = document.getElementById(RUN_ORIGINAL_ID);
    if (el) el.remove();
    runOriginalMountedId = null;
  };
  window.fetch(requestPath, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: controller ? controller.signal : undefined,
  }).then((res) => {
    if (seq !== runOriginalSeq || parseRunDetailId(window.location?.pathname) !== runId) return null;
    if (!res || !res.ok) {
      applyIfCurrent(() => {
        runOriginalById.set(runId, { status: "denied", http: res?.status ?? 0, text: "", field: null, runId, seq });
        clearPanel();
      });
      return null;
    }
    return res.json().then((run) => {
      if (seq !== runOriginalSeq || parseRunDetailId(window.location?.pathname) !== runId) return;
      const bodyId = typeof run?.id === "string" ? run.id.toLowerCase() : "";
      if (bodyId !== runId) {
        applyIfCurrent(() => {
          runOriginalById.set(runId, { status: "denied", http: res.status, text: "", field: null, runId, seq });
          clearPanel();
        });
        return;
      }
      const extracted = extractRunOriginal(run);
      if (!extracted.text) {
        applyIfCurrent(() => {
          runOriginalById.set(runId, { status: "empty", http: res.status, text: "", field: extracted.field, runId, seq });
          clearPanel();
        });
        return;
      }
      applyIfCurrent(() => {
        const rec = { status: "ok", http: res.status, text: extracted.text, field: extracted.field, runId, seq };
        runOriginalById.set(runId, rec);
        renderRunOriginalPanel(rec);
      });
    });
  }).catch((err) => {
    if (seq !== runOriginalSeq) return;
    if (err && err.name === "AbortError") return;
    applyIfCurrent(() => {
      runOriginalById.set(runId, { status: "error", http: 0, text: "", field: null, runId, seq });
      clearPanel();
    });
  }).finally(() => {
    if (seq !== runOriginalSeq) return;
    if (runOriginalFetchId === runId) runOriginalFetchId = null;
    if (runOriginalAbort === controller) runOriginalAbort = null;
  });
}

function mutationInsideRunOriginal(mutation) {
  const target = mutation.target;
  const el = target && target.nodeType === Node.ELEMENT_NODE ? target : target && target.parentElement;
  return Boolean(el && el.closest && el.closest("[data-pc-run-original]"));
}

function scheduleLayoutFixes(lang) {
  const run = () => {
    if (applyingOverlay) return;
    applyingOverlay = true;
    try {
      applyLayoutFixes(document.body, lang);
    } finally {
      applyingOverlay = false;
    }
  };
  if (typeof requestAnimationFrame !== "function") {
    run();
    return;
  }
  if (layoutFixFrame) return;
  layoutFixFrame = requestAnimationFrame(() => {
    layoutFixFrame = 0;
    run();
  });
}


function inBoardChat() {
  return /\/board-chat(\/|$)/.test(window.location.pathname);
}

const boardChatStylePrev = new WeakMap();

function rememberInline(el, prop) {
  const raw = el.style.getPropertyValue(prop);
  return raw ? { value: raw, priority: el.style.getPropertyPriority(prop) } : null;
}

function applyRemembered(el, props) {
  let bag = boardChatStylePrev.get(el);
  if (!bag) {
    bag = {};
    boardChatStylePrev.set(el, bag);
  }
  for (const [prop, next] of Object.entries(props)) {
    if (!(prop in bag)) bag[prop] = rememberInline(el, prop);
    el.style.setProperty(prop, next, 'important');
  }
}
function restoreRemembered(el, props) {
  const bag = boardChatStylePrev.get(el);
  if (!bag) return;
  for (const prop of props) {
    if (!(prop in bag)) continue;
    const prev = bag[prop];
    if (!prev) el.style.removeProperty(prop);
    else el.style.setProperty(prop, prev.value, prev.priority || '');
    delete bag[prop];
  }
}

function restoreBoardChatLayout() {
  document.documentElement.classList.remove('pc-ui16-board-chat');
  const main = document.getElementById('main-content');
  const nodes = new Set();
  if (main) nodes.add(main);
  for (const el of document.querySelectorAll('[data-pc-ui16-board]')) nodes.add(el);
  for (const el of nodes) {
    const bag = boardChatStylePrev.get(el);
    if (!bag) continue;
    for (const [prop, prev] of Object.entries(bag)) {
      if (!prev) el.style.removeProperty(prop);
      else el.style.setProperty(prop, prev.value, prev.priority || '');
    }
    boardChatStylePrev.delete(el);
    el.removeAttribute('data-pc-ui16-board');
  }
}

function boardChatHasMessages() {
  const main = document.getElementById('main-content');
  if (!main) return false;
  if (main.querySelector('a[href^="#comment-"]')) return true;
  if (main.querySelector('.flex.justify-end .bg-blue-600, .justify-end .bg-blue-600')) return true;
  return false;
}

function boardEmptyGuideText() {
  return getUiLanguage() === 'en'
    ? 'There are no messages yet. Type below to start the conversation.'
    : '아직 대화가 없습니다. 아래에 메시지를 입력해 대화를 시작하세요.';
}

function clearBoardEmptyGuide() {
  const main = document.getElementById('main-content');
  document.getElementById('pc-ui16-board-empty-guide')?.remove();
  if (!main) return;
  for (const el of main.querySelectorAll('[data-pc-ui16-hidden-intro-typing]')) {
    el.style.removeProperty('display');
    el.removeAttribute('data-pc-ui16-hidden-intro-typing');
  }
}

function syncBoardEmptyGuide() {
  const main = document.getElementById('main-content');
  if (!inBoardChat() || !main) {
    clearBoardEmptyGuide();
    return { emptyUnassigned: false, hasMessages: false };
  }
  const hasMessages = boardChatHasMessages();
  const text = main.innerText || '';
  const welcome = /Welcome to |I've read through what you shared/.test(text);
  const orgNone = /No organization selected/.test(text);
  const introTyping = main.querySelector('.typing-dots[aria-label="typing"]');
  const emptyConversation = !hasMessages && !welcome && !orgNone;
  if (hasMessages || welcome || orgNone || !emptyConversation) {
    clearBoardEmptyGuide();
    return { emptyUnassigned: false, hasMessages, welcome, orgNone };
  }
  if (introTyping && !hasMessages) {
    const intro = introTyping.closest('.flex.justify-start');
    if (intro instanceof HTMLElement && intro.getAttribute('data-pc-ui16-hidden-intro-typing') !== 'true') {
      intro.setAttribute('data-pc-ui16-hidden-intro-typing', 'true');
      intro.style.setProperty('display', 'none');
    }
  }
  let box = document.getElementById('pc-ui16-board-empty-guide');
  if (!box) {
    box = document.createElement('div');
    box.id = 'pc-ui16-board-empty-guide';
    box.setAttribute('data-pc-i18n-skip', 'true');
    box.setAttribute('data-pc-ui16-board-empty', 'true');
    box.style.cssText = 'margin:0.5rem 0 1rem;padding:0.9rem 1rem;border:1px solid var(--border, rgba(127,127,127,0.35));border-radius:12px;max-width:36rem;font-size:14px;line-height:1.45;';
    const list = main.querySelector('.flex.flex-col.gap-4');
    (list || main).appendChild(box);
  }
  const nextGuide = boardEmptyGuideText();
  if (box.textContent !== nextGuide) box.textContent = nextGuide;
  return { emptyUnassigned: true, hasMessages: false, welcome: false, orgNone: false };
}

function mobileBoardNav() {
  const candidates = [...document.querySelectorAll('nav, footer')];
  return candidates.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 200 && r.height > 24 && r.height < 140 && r.bottom >= window.innerHeight - 16 && r.top > window.innerHeight - 160;
  }) || null;
}

const BOARD_SPLIT_MIN_PANE_PX = 280;
const BOARD_SPLIT_DIVIDER_PX = 12;

function findBoardChatSplit(main, textarea) {
  if (!main || !textarea) return null;
  const separator = main.querySelector('[role="separator"][aria-orientation="vertical"]')
    || main.querySelector('[role="separator"]');
  if (!(separator instanceof HTMLElement)) return null;
  const row = separator.parentElement;
  if (!(row instanceof HTMLElement) || !row.contains(textarea)) return null;
  const kids = [];
  for (const kid of row.children) {
    if (kid instanceof HTMLElement) kids.push(kid);
  }
  const chatPane = kids.find((el) => el.contains(textarea));
  if (!(chatPane instanceof HTMLElement) || chatPane === separator) return null;
  const feed = kids.find((el) => el !== chatPane && el !== separator)
    || (separator.nextElementSibling instanceof HTMLElement ? separator.nextElementSibling : null);
  return { row, chatPane, resizer: separator, feed };
}

function findBoardChatFeedToggle(main) {
  if (!main) return null;
  const buttons = main.querySelectorAll('button');
  for (const btn of buttons) {
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (!label.includes('feed') && !label.includes('피드')) continue;
    let wrap = btn.parentElement;
    while (wrap && wrap !== main) {
      const cls = wrap.getAttribute('class') || '';
      if (cls.split(/\s+/).includes('md:hidden')) return { button: btn, wrap };
      wrap = wrap.parentElement;
    }
  }
  return null;
}

function applyBoardChatSplit(split, feedToggle, singlePane) {
  if (split) {
    split.row.setAttribute('data-pc-ui16-board', 'split-row');
    split.chatPane.setAttribute('data-pc-ui16-board', 'chat-pane');
    split.resizer.setAttribute('data-pc-ui16-board', 'resizer');
    if (split.feed) split.feed.setAttribute('data-pc-ui16-board', 'feed');
    if (singlePane) {
      applyRemembered(split.chatPane, { width: '100%', flex: '1 1 auto', 'min-width': '0px' });
      applyRemembered(split.resizer, { display: 'none' });
      if (split.feed) applyRemembered(split.feed, { display: 'none' });
    } else {
      restoreRemembered(split.chatPane, ['width', 'flex', 'min-width']);
      restoreRemembered(split.resizer, ['display']);
      if (split.feed) restoreRemembered(split.feed, ['display']);
    }
  }
  if (feedToggle && feedToggle.wrap instanceof HTMLElement) {
    feedToggle.wrap.setAttribute('data-pc-ui16-board', 'feed-toggle');
    if (singlePane) applyRemembered(feedToggle.wrap, { display: 'block' });
    else restoreRemembered(feedToggle.wrap, ['display']);
  }
}

function fitBoardChatLayout() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (!inBoardChat()) {
    restoreBoardChatLayout();
    clearBoardEmptyGuide();
    return;
  }
  document.documentElement.classList.add('pc-ui16-board-chat');
  const main = document.getElementById('main-content');
  const ta = document.querySelector('#main-content textarea');
  if (!main) return;
  const sticky = main.parentElement && main.parentElement.previousElementSibling;
  const top = Math.max(sticky instanceof HTMLElement ? sticky.getBoundingClientRect().bottom : 0, main.getBoundingClientRect().top, 48);
  const nav = mobileBoardNav();
  const vv = window.visualViewport;
  const viewBottom = vv ? Math.floor(vv.offsetTop + vv.height) : window.innerHeight;
  const navTop = nav ? Math.floor(nav.getBoundingClientRect().top) : viewBottom;
  const bottomLimit = Math.min(viewBottom, navTop);
  const avail = Math.max(240, bottomLimit - top);
  applyRemembered(main, { height: avail + 'px', 'max-height': avail + 'px', 'padding-bottom': '0px' });
  if (ta) {
    let shell = ta.parentElement;
    while (shell && shell !== main) {
      const style = window.getComputedStyle(shell);
      if (parseFloat(style.marginTop) < 0) break;
      shell = shell.parentElement;
    }
    if (shell instanceof HTMLElement && shell !== main) {
      shell.setAttribute('data-pc-ui16-board', 'shell');
      applyRemembered(shell, { margin: '0px', height: '100%', 'max-height': '100%', 'min-height': '0px' });
    }
    let pane = ta.parentElement;
    while (pane && pane !== main) {
      const style = window.getComputedStyle(pane);
      if (style.position === 'relative') break;
      pane = pane.parentElement;
    }
    if (pane instanceof HTMLElement) {
      pane.setAttribute('data-pc-ui16-board', 'pane');
      applyRemembered(pane, { height: '100%', 'min-height': '0px' });
      restoreRemembered(pane, ['width', 'flex']);
    }
    let dock = ta.parentElement;
    while (dock && dock !== main) {
      const style = window.getComputedStyle(dock);
      if (style.position === 'absolute') break;
      dock = dock.parentElement;
    }
    if (dock instanceof HTMLElement) {
      dock.setAttribute('data-pc-ui16-board', 'dock');
      applyRemembered(dock, { top: 'auto', bottom: '0px', height: 'auto', 'max-height': 'none' });
    }
    const split = findBoardChatSplit(main, ta);
    const feedToggle = findBoardChatFeedToggle(main);
    const rowW = split ? split.row.getBoundingClientRect().width : 0;
    const singlePane = Boolean(
      split && (rowW < (BOARD_SPLIT_MIN_PANE_PX * 2 + BOARD_SPLIT_DIVIDER_PX)
        || (window.innerWidth >= 768 && window.innerHeight <= 500)),
    );
    applyBoardChatSplit(split, feedToggle, singlePane);
  }
  const empty = syncBoardEmptyGuide();
  document.documentElement.classList.toggle('pc-ui16-board-chat-has-messages', empty.hasMessages);
}


const ADAPTER_TYPE_LABELS = { Ocx: "OpenCodex (ocx)" };
function decorateAdapterTypeLabels(root) {
  if (typeof document === "undefined") return;
  const scope = root && root.querySelectorAll ? root : document.body;
  if (!scope) return;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const raw = node.nodeValue ?? "";
    const trimmed = raw.trim();
    const mapped = ADAPTER_TYPE_LABELS[trimmed];
    if (!mapped) continue;
    const next = raw.replace(trimmed, mapped);
    if (node.nodeValue !== next) node.nodeValue = next;
  }
}
function applyLayoutFixes(root, lang = getUiLanguage()) {
  injectClipFixCss();
  decorateAdapterTypeLabels(root && root.querySelectorAll ? root : document.body);
  decorateConnectLinks(root && root.querySelectorAll ? root : document.body);
  fitAccountPopover();
  liftRunPreviewClip(root);
  softenRunListMarkdown(root, lang);
  exposeRunSummaryOriginal(root);
  mountRunOriginalSummary();
  fitBoardChatLayout();
  applyDocumentTitle(lang);
}

let titleOriginal = null;
let titleTranslated = null;
let titlePath = null;

function translatePageTitle(raw) {
  const parts = (raw || "").split(" • ");
  const nav = chromeCatalog.nav || {};
  const resourceParents = new Set([
    "Projects", "Agents", "Tasks", "Goals", "Routines", "Cases",
    "Artifacts", "Workspaces", "Pipelines", "Decisions", "Inbox",
    "Skills", "Org", "Users", "Plugins",
  ]);
  let brandIdx = -1;
  let companyIdx = -1;
  if (parts.length >= 1 && parts[parts.length - 1] === "Paperclip") {
    brandIdx = parts.length - 1;
    if (parts.length === 2) companyIdx = 0;
    else if (parts.length >= 3) companyIdx = parts.length - 2;
  }
  const skip = new Set();
  if (brandIdx >= 0) skip.add(brandIdx);
  if (companyIdx >= 0) skip.add(companyIdx);
  if (brandIdx >= 0 && companyIdx >= 1) {
    const company = parts[companyIdx];
    while (companyIdx >= 1 && parts[companyIdx - 1] === company) {
      parts.splice(companyIdx - 1, 1);
      brandIdx = parts.length - 1;
      companyIdx = parts.length - 2;
    }
    skip.add(brandIdx);
    skip.add(companyIdx);
  }
  return parts.map((part, index) => {
    if (skip.has(index)) return part;
    if (typeof isIssueId === "function" && isIssueId(part)) return part;
    if (typeof isAgentKey === "function" && isAgentKey(part)) return part;
    const translated = nav[part] || (chromeCatalog.global && chromeCatalog.global[part]);
    if (!translated) return part;
    const nextKept = parts.find((other, otherIdx) => otherIdx > index && !skip.has(otherIdx));
    if (nextKept && resourceParents.has(nextKept)) return part;
    return translated;
  }).join(" • ");
}

function applyDocumentTitle(lang) {
  const path = typeof window !== "undefined" && window.location ? window.location.pathname : "";
  const current = document.title || "";
  const hostChanged = current !== titleTranslated;
  if (titlePath !== path) {
    titlePath = path;
    if (hostChanged) titleOriginal = current;
  } else if (hostChanged) {
    titleOriginal = current;
  }
  const source = titleOriginal || current;
  const next = lang === "ko" ? translatePageTitle(source) : source;
  titleTranslated = lang === "ko" ? next : null;
  if (next !== current) document.title = next;
}

function applyAll() {
  const lang = getUiLanguage();
  applyTree(document.body, lang);
  document.documentElement.lang = lang === "ko" ? "ko" : "en";
  applyLayoutFixes(document.body, lang);
  applyDocumentTitle(lang);
}

export function startOverlay() {
  if (started) {
    applyAll();
    return;
  }
  started = true;
  applyAll();
  observer = new MutationObserver((mutations) => {
    if (applyingOverlay) return;
    const lang = getUiLanguage();
    const skillRoots = new Set();
    for (const mutation of mutations) {
      if (mutationInsideRunOriginal(mutation)) continue;
      if (mutation.type === "characterData") {
        if (overlayOwned.has(mutation.target)) {
          if (overlaySetValues.get(mutation.target) === mutation.target.nodeValue) {
            continue;
          }
          overlayOwned.delete(mutation.target);
          originalText.delete(mutation.target);
          overlaySetValues.delete(mutation.target);
        }
        if (mutation.target) {
          translateTextNode(mutation.target, lang);
        }
      }
      for (const added of mutation.addedNodes) {
        if (added.nodeType === Node.ELEMENT_NODE && added.closest?.("[data-pc-run-original]")) continue;
        if (added.nodeType === Node.TEXT_NODE) translateTextNode(added, lang);
        else if (added.nodeType === Node.ELEMENT_NODE) applyTree(added, lang);
      }
      if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
        if (ATTRS.includes(mutation.attributeName || "")) {
          const el = mutation.target;
          if (!(el.getAttribute("data-pc-original-summary") || el.closest("[data-pc-run-original], nav a[href*='/runs'], nav a[href*='/runs/']"))) {
            translateAttrs(el, lang);
          }
        }
      }
      if (window.location.pathname.includes("/skills")) {
        const target = mutation.target;
        if (target && target.nodeType === Node.ELEMENT_NODE) skillRoots.add(target);
        else if (target && target.parentElement) skillRoots.add(target.parentElement);
        for (const added of mutation.addedNodes) {
          if (added.nodeType === Node.ELEMENT_NODE) skillRoots.add(added);
        }
      }
    }
    scheduleLayoutFixes(lang);
    if (skillRoots.size) {
      applyingOverlay = true;
      try {
        for (const root of skillRoots) applySkills(root, lang);
      } finally {
        applyingOverlay = false;
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  const titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(() => applyDocumentTitle(getUiLanguage())).observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  window.addEventListener("paperclip-ui-language", applyAll);
  window.addEventListener("popstate", applyAll);
  window.addEventListener("resize", () => scheduleLayoutFixes(getUiLanguage()));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => scheduleLayoutFixes(getUiLanguage()));
    window.visualViewport.addEventListener("scroll", () => scheduleLayoutFixes(getUiLanguage()));
  }
}

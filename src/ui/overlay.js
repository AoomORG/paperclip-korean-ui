const STORAGE_KEY = "paperclip.uiLanguage";
const SKIP_SELECTOR = [
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
].join(",");
const STATUS_SKIP = new Set([
  "todo",
  "in_progress",
  "blocked",
  "done",
  "Backlog",
  "Done",
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
  if (el.closest(SKIP_SELECTOR)) return true;
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

function lookup(text, node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  // System UI only: never translate editable/source content or stored issue prose.
  const systemNotice = Boolean(el?.closest('[data-testid="task-chat-system-notice"], [data-testid="task-chat-system-notice-details"]'));
  const decisionSurface = /\/(decisions|inbox)(\/|$)/.test(window.location.pathname)
    || Boolean(el?.closest('[data-testid="issue-recovery-action-card"], [data-recovery-state], [data-radix-popper-content-wrapper]'));
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
    match = normalized.match(/^Blocked · (\d+) blockers? need attention$/);
    if (match) return `막힘 · 확인이 필요한 차단 ${match[1]}건`;
    if (systemNotice) return null;
  }
  const issueChrome = /\/issues(\/|$)/.test(window.location.pathname)
    && !el?.closest('.prose, [data-pc-i18n-skip]');
  if (issueChrome) {
    const catalog = chromeCatalog.decisions || {};
    const chromeText = text.replace(/\s+/g, " ");
    if (ISSUE_CHROME.has(chromeText) && catalog[chromeText]) return catalog[chromeText];
    let m = text.match(/^Called (\d+) tools$/);
    if (m) return `도구 ${m[1]}회 호출`;
    m = text.match(/^Blocked · (\d+) blockers? need attention$/);
    if (m) return `막힘 · 확인이 필요한 차단 ${m[1]}건`;
  }
  if (inAgent() && !el?.closest('.prose, [data-pc-i18n-skip]')) {
    const agents = chromeCatalog.agents || {};
    if (agents[text]) return agents[text];
  }
  const skipProse = Boolean(el?.closest('.prose, [data-pc-i18n-skip]'));
  if (!skipProse) {
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
  if (chromeCatalog.global && chromeCatalog.global[text]) return chromeCatalog.global[text];
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
    m = text.match(/^Blocked · (\d+) blockers? need attention$/);
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
  if (!trimmed) return;
  if (lang !== "ko") {
    if (originalText.has(node)) {
      node.nodeValue = originalText.get(node);
      originalText.delete(node);
    }
    return;
  }
  const translated = lookup(trimmed, node);
  if (!translated || translated === trimmed) return;
  if (!originalText.has(node)) originalText.set(node, raw);
  node.nodeValue = raw.replace(trimmed, translated);
}

function translateAttrs(el, lang) {
  if (shouldSkipNode(el)) return;
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
  const links = scope.querySelectorAll("a[href*='/runs'], a[href*='/runs/']");
  for (const link of links) {
    const summarySpan = link.querySelector("span.truncate");
    const targetNode = summarySpan || link;
    const walker = document.createTreeWalker(targetNode, NodeFilter.SHOW_TEXT);
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
    if (summarySpan) {
      if (summarySpan.getAttribute("data-pc-original-summary") !== full) {
        summarySpan.setAttribute("data-pc-original-summary", full);
      }
      if (summarySpan.getAttribute("title") !== full) {
        summarySpan.setAttribute("title", full);
      }
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

function applyLayoutFixes(root, lang = getUiLanguage()) {
  injectClipFixCss();
  decorateConnectLinks(root && root.querySelectorAll ? root : document.body);
  fitAccountPopover();
  liftRunPreviewClip(root);
  softenRunListMarkdown(root, lang);
  exposeRunSummaryOriginal(root);
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
  if (companyIdx >= 2 && parts[companyIdx - 1] === parts[companyIdx]) {
    skip.add(companyIdx - 1);
  }
  return parts.map((part, index) => {
    if (skip.has(index)) return part;
    if (part === "Aoom" || part === "Definish") return part;
    if (typeof isIssueId === "function" && isIssueId(part)) return part;
    if (typeof isAgentKey === "function" && isAgentKey(part)) return part;
    if (!nav[part]) return part;
    const nextKept = parts.find((other, otherIdx) => otherIdx > index && !skip.has(otherIdx));
    if (nextKept && resourceParents.has(nextKept)) return part;
    return nav[part];
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
        if (added.nodeType === Node.TEXT_NODE) translateTextNode(added, lang);
        else if (added.nodeType === Node.ELEMENT_NODE) applyTree(added, lang);
      }
      if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
        if (ATTRS.includes(mutation.attributeName || "")) translateAttrs(mutation.target, lang);
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
    applyingOverlay = true;
    try {
      applyLayoutFixes(document.body, lang);
      for (const root of skillRoots) applySkills(root, lang);
    } finally {
      applyingOverlay = false;
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
}

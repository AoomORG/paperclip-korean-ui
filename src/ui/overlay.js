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
  "beta",
]);
const ATTRS = ["aria-label", "title", "placeholder"];

const originalText = new WeakMap();
const originalAttr = new WeakMap();
let observer = null;
let started = false;
const overlayOwned = new WeakSet();
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

function lookup(text, node) {
  if (!text || STATUS_SKIP.has(text) || isIssueId(text) || isAgentKey(text) || isPathish(text)) {
    return null;
  }
  if (chromeCatalog.global && chromeCatalog.global[text]) return chromeCatalog.global[text];
  if (chromeCatalog.dashboard && chromeCatalog.dashboard[text]) return chromeCatalog.dashboard[text];
  if (text.startsWith("Open actions for ")) {
    return "작업 열기: " + text.slice("Open actions for ".length);
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

function applyAll() {
  const lang = getUiLanguage();
  applyTree(document.body, lang);
  document.documentElement.lang = lang === "ko" ? "ko" : "en";
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
      if (mutation.type === "characterData" && overlayOwned.has(mutation.target)) continue;
      if (mutation.type === "characterData" && mutation.target) {
        translateTextNode(mutation.target, lang);
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
    if (skillRoots.size === 0) return;
    applyingOverlay = true;
    try {
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
  window.addEventListener("paperclip-ui-language", applyAll);
  window.addEventListener("popstate", applyAll);
}

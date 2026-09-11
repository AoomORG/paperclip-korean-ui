import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '/home/aoom/.local/share/aoom-browser/node_modules/playwright-core/index.mjs';

const libraries = '/home/aoom/.local/share/aoom-browser/runtime/usr/lib/x86_64-linux-gnu';
const overlaySource = readFileSync(new URL('../src/ui/overlay.js', import.meta.url), 'utf8')
  .replaceAll('export function', 'function');
const chromeCatalog = readFileSync(new URL('../locales/chrome.ko.json', import.meta.url), 'utf8');

async function withPage(run) {
  const browser = await chromium.launch({
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: libraries },
  });
  try {
    const page = await browser.newPage();
    await page.route('http://overlay.test/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body></body></html>',
      });
    });
    await page.goto('http://overlay.test/AOO/agents/agent-7c304493/runs/abc');
    await run(page);
  } finally {
    await browser.close();
  }
}

test('MutationObserver markdown preview settles without a write loop', async () => {
  await withPage(async (page) => {
    const result = await page.evaluate(async ({ overlaySource, chromeCatalog }) => {
      window.localStorage.setItem('paperclip.uiLanguage', 'ko');
      document.body.innerHTML = '<a href="/AOO/agents/agent-7c304493/runs/abc"><span class="truncate">**blocked** next step</span></a>';
      const script = document.createElement('script');
      script.textContent = 'const chromeCatalog = ' + chromeCatalog + ';\nconst skillsCatalog = {};\n' + overlaySource + '\nwindow.startOverlay = startOverlay;\nwindow.setUiLanguage = setUiLanguage;\nwindow.applyAll = typeof applyAll === "function" ? applyAll : null;';
      document.documentElement.appendChild(script);
      let characterData = 0;
      const probe = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'characterData') characterData += 1;
        }
      });
      probe.observe(document.body, { subtree: true, characterData: true, childList: true });
      window.startOverlay();
      await new Promise((r) => setTimeout(r, 80));
      const afterStart = characterData;
      await new Promise((r) => setTimeout(r, 250));
      const afterWait = characterData;
      const koText = document.querySelector('span.truncate').textContent;
      window.setUiLanguage('en');
      if (typeof window.applyAll === 'function') window.applyAll();
      else window.dispatchEvent(new Event('paperclip-ui-language'));
      await new Promise((r) => setTimeout(r, 80));
      const enText = document.querySelector('span.truncate').textContent;
      const afterEn = characterData;
      await new Promise((r) => setTimeout(r, 200));
      const afterEnWait = characterData;
      window.setUiLanguage('ko');
      window.dispatchEvent(new Event('paperclip-ui-language'));
      await new Promise((r) => setTimeout(r, 80));
      const koAgain = document.querySelector('span.truncate').textContent;
      const afterKo = characterData;
      await new Promise((r) => setTimeout(r, 200));
      const afterKoWait = characterData;
      probe.disconnect();
      return { afterStart, afterWait, afterEn, afterEnWait, afterKo, afterKoWait, koText, enText, koAgain };
    }, { overlaySource, chromeCatalog });

    assert.equal(result.afterWait, result.afterStart);
    assert.ok(result.afterStart < 8, 'start overlay should not loop, got ' + result.afterStart);
    assert.match(result.koText, /blocked/);
    assert.equal(result.koText.includes('**'), false);
    assert.equal(result.enText, '**blocked** next step');
    assert.equal(result.afterEnWait, result.afterEn);
    assert.equal(result.koAgain.includes('**'), false);
    assert.equal(result.afterKoWait, result.afterKo);
  });
});

test('breadcrumb Runs link does not cycle title/aria with expose+translate', async () => {
  await withPage(async (page) => {
    const result = await page.evaluate(async ({ overlaySource, chromeCatalog }) => {
      window.localStorage.setItem('paperclip.uiLanguage', 'ko');
      document.body.innerHTML = '<nav><a href="/DEF/agents/example/runs">Runs</a></nav><a href="/DEF/agents/example/runs/be7ab0fd-d415-42da-8a01-03ea61a83a7b"><span class="truncate">원문 요약을 보존합니다</span></a><main><h1>Run be7ab0fd</h1></main>';
      const script = document.createElement('script');
      script.textContent = 'const chromeCatalog = ' + chromeCatalog + ';\nconst skillsCatalog = {};\n' + overlaySource + '\nwindow.startOverlay = startOverlay;\nwindow.exposeRunSummaryOriginal = exposeRunSummaryOriginal;\nwindow.translateAttrs = translateAttrs;\nwindow.translateTextNode = translateTextNode;\nwindow.applyAll = applyAll;';
      document.documentElement.appendChild(script);
      window.startOverlay();
      const crumb = document.querySelector('nav a[href$="/runs"]');
      const history = document.querySelector('a[href*="/runs/"] span.truncate');
      const rounds = [];
      for (let i = 0; i < 3; i += 1) {
        window.exposeRunSummaryOriginal(document.body);
        const afterExpose = { title: crumb.getAttribute('title'), aria: crumb.getAttribute('aria-label'), historyTitle: history.getAttribute('title') };
        window.translateAttrs(crumb, 'ko');
        const afterTranslate = { title: crumb.getAttribute('title'), aria: crumb.getAttribute('aria-label'), historyTitle: history.getAttribute('title') };
        rounds.push({ exposed: afterExpose, translated: afterTranslate });
      }
      await new Promise((r) => setTimeout(r, 250));
      return {
        rounds,
        crumbText: crumb.textContent.trim(),
        crumbTitle: crumb.getAttribute('title'),
        crumbAria: crumb.getAttribute('aria-label'),
        historyTitle: history.getAttribute('title'),
        cycle: rounds.some((round, idx, all) => idx && round.exposed.title !== all[0].exposed.title),
      };
    }, { overlaySource, chromeCatalog });
    assert.equal(result.cycle, false);
    assert.equal(result.crumbTitle, null);
    assert.equal(result.crumbAria, null);
    assert.equal(result.historyTitle, '원문 요약을 보존합니다');
    assert.equal(result.crumbText, '실행');
  });
});

test('run detail panel shows API summary original without translating it', async () => {
  await withPage(async (page) => {
    const summary = 'OC 댓글은 창업자 확인을 기다리라는 접수입니다. ' + '확인 카드가 아직 유효한지만 대조한 뒤 in_review를 유지합니다 '.repeat(8);
    const result = await page.evaluate(async ({ overlaySource, chromeCatalog, summary }) => {
      window.localStorage.setItem('paperclip.uiLanguage', 'ko');
      history.replaceState({}, '', '/DEF/agents/a-def-8f083281/runs/be7ab0fd-d415-42da-8a01-03ea61a83a7b');
      document.body.innerHTML = '<main><h1>A박기획DEF</h1><p>기록을 기다리는 중...</p></main>';
      let fetches = 0;
      window.fetch = async (input) => {
        fetches += 1;
        const url = String(input);
        if (!url.includes('/api/heartbeat-runs/be7ab0fd-d415-42da-8a01-03ea61a83a7b') || url.includes('/log')) {
          throw new Error('unexpected fetch ' + url);
        }
        return {
          ok: true,
          status: 200,
          clone() { return this; },
          json: async () => ({ id: 'be7ab0fd-d415-42da-8a01-03ea61a83a7b', resultJson: { summary } }),
        };
      };
      const script = document.createElement('script');
      script.textContent = 'const chromeCatalog = ' + chromeCatalog + ';\nconst skillsCatalog = {};\n' + overlaySource + '\nwindow.startOverlay = startOverlay;';
      document.documentElement.appendChild(script);
      window.startOverlay();
      await new Promise((r) => setTimeout(r, 80));
      const panel = document.querySelector('[data-pc-run-original-text]');
      const after = panel ? panel.textContent : '';
      await new Promise((r) => setTimeout(r, 200));
      const later = document.querySelector('[data-pc-run-original-text]')?.textContent || '';
      return {
        fetches,
        after,
        later,
        len: after.length,
        translated: after.includes('기록') && !summary.includes('기록'),
        present: after === summary,
      };
    }, { overlaySource, chromeCatalog, summary });
    assert.equal(result.present, true);
    assert.equal(result.later, summary);
    assert.ok(result.len > 60);
    assert.equal(result.translated, false);
    assert.ok(result.fetches >= 1 && result.fetches <= 2);
  });
});

test('run original panel clears on run switch 403 and ignores foreign origin payloads', async () => {
  await withPage(async (page) => {
    const runA = 'be7ab0fd-d415-42da-8a01-03ea61a83a7b';
    const runB = '7793e42f-497c-45c6-b614-1e91a476df84';
    const summaryA = '원문A-' + '확인 카드가 아직 유효한지만 대조한 뒤 in_review를 유지합니다'.repeat(6);
    const result = await page.evaluate(async ({ overlaySource, chromeCatalog, runA, runB, summaryA }) => {
      window.localStorage.setItem('paperclip.uiLanguage', 'ko');
      history.replaceState({}, '', '/DEF/agents/a-def-8f083281/runs/' + runA);
      document.body.innerHTML = '<main><h1>Run A</h1></main>';
      const calls = [];
      const nativeFetch = window.fetch;
      const script = document.createElement('script');
      script.textContent = 'const chromeCatalog = ' + chromeCatalog + ';\nconst skillsCatalog = {};\n' + overlaySource + '\nwindow.startOverlay = startOverlay;';
      document.documentElement.appendChild(script);
      const wrappedAfterLoad = Boolean(window.fetch.__pcKoreanUiTapped);
      const mockFetch = async (input, init) => {
        const url = String(input);
        calls.push(url);
        if (url.startsWith('https://foreign.example/')) {
          return { ok: true, status: 200, json: async () => ({ id: runB, resultJson: { summary: 'FOREIGN' } }) };
        }
        if (url === '/api/heartbeat-runs/' + runA) {
          return { ok: true, status: 200, json: async () => ({ id: runA, resultJson: { summary: summaryA } }) };
        }
        if (url === '/api/heartbeat-runs/' + runB) {
          return { ok: false, status: 403, json: async () => ({ error: 'forbidden' }) };
        }
        throw new Error('unexpected fetch ' + url);
      };
      window.fetch = async (input, init) => {
        return mockFetch(input, init);
      };
      window.startOverlay();
      await new Promise((r) => setTimeout(r, 80));
      const afterA = document.querySelector('[data-pc-run-original-text]')?.textContent || '';
      await window.fetch('https://foreign.example/api/heartbeat-runs/' + runB);
      const afterForeign = document.querySelector('[data-pc-run-original-text]')?.textContent || '';
      history.replaceState({}, '', '/DEF/agents/a-def-8f083281/runs/' + runB);
      window.startOverlay();
      await new Promise((r) => setTimeout(r, 80));
      const afterB = document.querySelector('[data-pc-run-original-text]')?.textContent || '';
      const panelAfterB = Boolean(document.querySelector('[data-pc-run-original]'));
      return {
        afterA,
        afterForeign,
        afterB,
        panelAfterB,
        calls,
        wrappedAfterLoad,
        wrappedAfterStart: Boolean(window.fetch.__pcKoreanUiTapped),
        fetchStillMock: window.fetch !== nativeFetch,
      };
    }, { overlaySource, chromeCatalog, runA, runB, summaryA });
    assert.equal(result.afterA, summaryA);
    assert.equal(result.afterForeign, summaryA);
    assert.equal(result.afterB, '');
    assert.equal(result.panelAfterB, false);
    assert.equal(result.wrappedAfterLoad, false);
    assert.equal(result.wrappedAfterStart, false);
    assert.equal(result.fetchStillMock, true);
    assert.ok(result.calls.includes('/api/heartbeat-runs/' + runA));
    assert.ok(result.calls.includes('/api/heartbeat-runs/' + runB));
    assert.ok(result.calls.includes('https://foreign.example/api/heartbeat-runs/' + runB));
  });
});

test('late first-run 200 does not overwrite a later same-id 403', async () => {
  await withPage(async (page) => {
    const runA = 'be7ab0fd-d415-42da-8a01-03ea61a83a7b';
    const runB = '7793e42f-497c-45c6-b614-1e91a476df84';
    const result = await page.evaluate(async ({ overlaySource, chromeCatalog, runA, runB }) => {
      window.localStorage.setItem('paperclip.uiLanguage', 'ko');
      history.replaceState({}, '', '/DEF/agents/a-def-8f083281/runs/' + runA);
      document.body.innerHTML = '<main><h1>Run A</h1></main>';
      let aCalls = 0;
      let releaseFirstA;
      const firstA = new Promise((resolve) => { releaseFirstA = resolve; });
      window.fetch = async (input) => {
        const url = String(input);
        if (url === '/api/heartbeat-runs/' + runA) {
          aCalls += 1;
          if (aCalls === 1) {
            await firstA;
            return { ok: true, status: 200, json: async () => ({ id: runA, resultJson: { summary: 'OUTDATED_A_RESPONSE' } }) };
          }
          return { ok: false, status: 403, json: async () => ({ error: 'forbidden' }) };
        }
        if (url === '/api/heartbeat-runs/' + runB) {
          return { ok: true, status: 200, json: async () => ({ id: runB, resultJson: { summary: 'B_OK' } }) };
        }
        throw new Error('unexpected fetch ' + url);
      };
      const script = document.createElement('script');
      script.textContent = 'const chromeCatalog = ' + chromeCatalog + ';\nconst skillsCatalog = {};\n' + overlaySource + '\nwindow.startOverlay = startOverlay;';
      document.documentElement.appendChild(script);
      window.startOverlay();
      await new Promise((r) => setTimeout(r, 40));
      history.replaceState({}, '', '/DEF/agents/a-def-8f083281/runs/' + runB);
      window.startOverlay();
      await new Promise((r) => setTimeout(r, 40));
      history.replaceState({}, '', '/DEF/agents/a-def-8f083281/runs/' + runA);
      window.startOverlay();
      await new Promise((r) => setTimeout(r, 40));
      const after403 = document.querySelector('[data-pc-run-original-text]')?.textContent || '';
      const panelAfter403 = Boolean(document.querySelector('[data-pc-run-original]'));
      releaseFirstA();
      await new Promise((r) => setTimeout(r, 80));
      const afterLate = document.querySelector('[data-pc-run-original-text]')?.textContent || '';
      return { aCalls, after403, panelAfter403, afterLate };
    }, { overlaySource, chromeCatalog, runA, runB });
    assert.equal(result.aCalls, 2);
    assert.equal(result.after403, '');
    assert.equal(result.panelAfter403, false);
    assert.equal(result.afterLate, '');
    assert.equal(result.afterLate.includes('OUTDATED_A_RESPONSE'), false);
  });
});

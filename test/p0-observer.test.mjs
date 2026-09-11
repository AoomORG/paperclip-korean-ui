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

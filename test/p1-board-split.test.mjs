import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '/home/aoom/.local/share/aoom-browser/node_modules/playwright-core/index.mjs';

const libraries = '/home/aoom/.local/share/aoom-browser/runtime/usr/lib/x86_64-linux-gnu';
const overlaySource = readFileSync(new URL('../src/ui/overlay.js', import.meta.url), 'utf8')
  .replaceAll('export function', 'function');
const chromeCatalog = readFileSync(new URL('../locales/chrome.ko.json', import.meta.url), 'utf8');

const BOARD_HTML = '<main id="main-content"><div class="flex flex-col" style="margin-top:-24px;display:flex;flex-direction:column;height:100%"><div id="split-row" class="flex flex-row" style="display:flex;flex-direction:row;width:100%;height:300px"><div id="chat-pane" class="relative" style="position:relative;display:flex;flex-direction:column;width:80px;flex:0 0 auto"><div id="dock" style="position:absolute;left:0;right:0;bottom:0"><div id="composer" class="relative pointer-events-auto" style="position:relative;height:80px;width:auto"><textarea></textarea></div></div></div><div id="resizer" role="separator" aria-orientation="vertical" style="width:12px;display:flex"></div><div id="feed" style="display:flex;flex:1 1 auto">feed</div></div><div id="feed-toggle-wrap" class="md:hidden" style="display:none"><button type="button" aria-label="Open agent feed">feed</button></div></div></main>';

test('board split uses separator row, not composer card, and restores feed', async () => {
  const browser = await chromium.launch({
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: libraries },
  });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.route('http://overlay.test/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body></body></html>',
      });
    });
    await page.goto('http://overlay.test/DEF/board-chat');
    const landscape = await page.evaluate(({ overlaySource, chromeCatalog, BOARD_HTML }) => {
      window.localStorage.setItem('paperclip.uiLanguage', 'ko');
      document.body.innerHTML = BOARD_HTML;
      const script = document.createElement('script');
      script.textContent = 'const chromeCatalog = ' + chromeCatalog + ';\nconst skillsCatalog = {};\n' + overlaySource
        + '\nwindow.startOverlay = startOverlay;\nwindow.fitBoardChatLayout = fitBoardChatLayout;';
      document.documentElement.appendChild(script);
      window.startOverlay();
      const read = () => {
        const chat = document.getElementById('chat-pane');
        const feed = document.getElementById('feed');
        const resizer = document.getElementById('resizer');
        const composer = document.getElementById('composer');
        const toggle = document.getElementById('feed-toggle-wrap');
        return {
          chatWidth: chat.style.getPropertyValue('width'),
          chatAttr: chat.getAttribute('data-pc-ui16-board'),
          feedDisplay: getComputedStyle(feed).display,
          resizerDisplay: getComputedStyle(resizer).display,
          composerWidth: composer.style.getPropertyValue('width'),
          composerAttr: composer.getAttribute('data-pc-ui16-board'),
          toggleDisplay: getComputedStyle(toggle).display,
          toggleAttr: toggle.getAttribute('data-pc-ui16-board'),
        };
      };
      return read();
    }, { overlaySource, chromeCatalog, BOARD_HTML });

    assert.equal(landscape.chatAttr, 'chat-pane');
    assert.equal(landscape.composerAttr, 'pane');
    assert.equal(landscape.chatWidth, '100%');
    assert.notEqual(landscape.composerWidth, '100%');
    assert.equal(landscape.feedDisplay, 'none');
    assert.equal(landscape.resizerDisplay, 'none');
    assert.equal(landscape.toggleDisplay, 'block');
    assert.equal(landscape.toggleAttr, 'feed-toggle');

    await page.setViewportSize({ width: 1280, height: 900 });
    const restored = await page.evaluate(() => {
      window.fitBoardChatLayout();
      const chat = document.getElementById('chat-pane');
      const feed = document.getElementById('feed');
      const resizer = document.getElementById('resizer');
      const toggle = document.getElementById('feed-toggle-wrap');
      return {
        chatWidth: chat.style.getPropertyValue('width'),
        feedDisplay: getComputedStyle(feed).display,
        resizerDisplay: getComputedStyle(resizer).display,
        toggleDisplay: getComputedStyle(toggle).display,
      };
    });
    assert.equal(restored.chatWidth, '80px');
    assert.equal(restored.feedDisplay, 'flex');
    assert.equal(restored.resizerDisplay, 'flex');
    assert.equal(restored.toggleDisplay, 'none');
  } finally {
    await browser.close();
  }
});

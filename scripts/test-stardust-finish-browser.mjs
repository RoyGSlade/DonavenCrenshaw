// Finish presentation integration. All hub traffic is intercepted with
// explicit fixtures. No test times are submitted to the public service.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'stardust', 'evidence', 'finish');
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL('C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const port = 4580 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['scripts/preview-stardust.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/projects/Space-Shooter/`;
const browser = await chromium.launch({ headless: true });
let verdict = { status: 'accepted', timeMs: 103370, personalBest: true, rankBefore: 5, best: { rank: 3, timeMs: 103370 } };
let delay = 0, opens = 0;
const errors = [];
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('https://api.donavencrenshaw.com/**', async (route) => {
    const url = route.request().url();
    let data = {};
    if (url.endsWith('/api/users/session')) data = { user: { username: 'rook', displayName: 'Rook' } };
    else if (url.endsWith('/v1/health')) data = { service: 'stardust', version: 1, ok: true };
    else if (/\/stardust$/.test(url)) data = { boards: [{ board: 'weekly-01', version: 1 }, { board: 'full', version: 1 }] };
    else if (url.endsWith('/runs')) { opens++; data = { runId: `fixture-${opens}` }; }
    else if (url.endsWith('/finish')) { if (delay) await new Promise((r) => setTimeout(r, delay)); data = verdict; }
    else if (url.includes('/around-me')) data = { me: { rank: 3 }, entries: [{ rank: 2, displayName: 'Nova', timeMs: 101000 }, { rank: 3, displayName: 'Rook', timeMs: 103370, isMe: true }, { rank: 4, displayName: 'Vega', timeMs: 108400 }] };
    else if (url.endsWith('/me')) data = { bests: {} };
    else if (url.includes('/boards/')) data = { entries: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(base + '?preview=weekly');
  await page.waitForFunction(() => document.getElementById('connection-status').textContent.includes('SIGNED IN'));
  const finish = async ({ previousMs = 113200, preview = false, ms = 103370 } = {}) => {
    const before = opens;
    await page.evaluate((preview) => window.dispatchEvent(new CustomEvent('stardust:weeklyAttempt', { detail: { eventId: 'weekly-01', version: 1, preview } })), preview);
    if (!preview) { for (let i = 0; opens <= before && i < 40; i++) await page.waitForTimeout(25); assert.ok(opens > before, 'recorder opened a mocked board run'); }
    await page.evaluate(async ({ previousMs, preview, ms }) => {
      const { state } = await import('/projects/Space-Shooter/state.js');
      const { openEndOverlay } = await import('/projects/Space-Shooter/ui/overlays.js');
      state.mode = 'roadmap'; state.run = { totalActiveMs: ms, current: {} }; state.ui.showStartOverlay = false;
      document.getElementById('starmap-start').classList.add('hidden');
      openEndOverlay('', { kind: 'weekly', title: 'Week 1 · Gantry Drop', preview, previousMs });
      window.dispatchEvent(new CustomEvent('stardust:weeklyRunComplete', { detail: { eventId: 'weekly-01', totalMs: ms, preview, personalBest: previousMs == null || ms < previousMs, previousMs, title: 'Week 1 · Gantry Drop' } }));
    }, { previousMs, preview, ms });
  };
  await finish();
  await page.waitForFunction(() => document.getElementById('finish-rank-callout').textContent.includes('#5 → #3'));
  assert.equal(await page.textContent('#starmap-end-title'), 'PERSONAL BEST');
  assert.equal(await page.textContent('#finish-delta'), '−9.83s');
  assert.ok((await page.textContent('#finish-rows')).includes('Nova'));
  assert.ok((await page.textContent('#finish-rows')).includes('Vega'));
  await page.waitForTimeout(850);
  await page.screenshot({ path: path.join(out, 'climb-in-motion.png') });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(out, 'personal-best-desktop.png') });
  for (const [width, height, label] of [[390, 844, 'portrait'], [844, 390, 'landscape'], [320, 568, 'small-phone']]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: path.join(out, `personal-best-${label}.png`), fullPage: true });
    const clipped = await page.locator('#starmap-end .finish-grid').evaluate((el) => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth; });
    assert.equal(clipped, false, `${label}: finish grid stays within viewport`);
    if (width <= 700) {
      const actions = await page.locator('#starmap-again-btn').boundingBox();
      assert.ok(actions.y >= 0 && actions.y + actions.height <= height, `${label}: fly again remains on screen`);
    }
    await page.locator('#starmap-again-btn').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#starmap-again-btn').isVisible(), true);
  }
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await finish();
  await page.waitForFunction(() => document.getElementById('finish-rank-callout').textContent.includes('#5 → #3'));
  assert.equal(await page.locator('#starmap-end').evaluate((el) => el.getAnimations({ subtree: true }).length), 0, 'reduced motion has no lift or slam animation');
  verdict = { status: 'accepted', timeMs: 115000, personalBest: false, rankBefore: 3, best: { rank: 3, timeMs: 103370 } };
  await finish({ previousMs: 103370, ms: 115000 });
  await page.waitForFunction(() => document.getElementById('finish-board-status').textContent === 'TIME ACCEPTED');
  assert.equal(await page.textContent('#starmap-end-title'), 'LAP COMPLETE');
  assert.equal((await page.textContent('#finish-rank-callout')).includes('UP'), false);
  await page.screenshot({ path: path.join(out, 'ordinary-finish.png') });
  verdict = { status: 'flagged', timeMs: 103370, personalBest: true, rankBefore: 5, best: { rank: 3 }, reasons: ['fixture'] };
  await finish();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#finish-rank-callout').isVisible(), false, 'flagged lap does not animate a server rank');
  assert.equal(await page.textContent('#starmap-end-title'), 'NEW LOCAL BEST');
  const requestsBeforePreview = opens;
  await finish({ preview: true });
  assert.equal(opens, requestsBeforePreview, 'preview never opens an online run');
  assert.equal(await page.locator('#finish-rank-callout').isVisible(), false);
  await page.screenshot({ path: path.join(out, 'local-best-preview.png') });
  verdict = { status: 'accepted', timeMs: 103370, personalBest: true, rankBefore: 5, best: { rank: 3, timeMs: 103370 } };
  delay = 700;
  await finish();
  await page.evaluate(async () => {
    const { closeEndOverlay } = await import('/projects/Space-Shooter/ui/overlays.js');
    closeEndOverlay();
  });
  await finish({ preview: true, previousMs: null, ms: 140000 });
  await page.waitForTimeout(1000);
  assert.equal(await page.textContent('#starmap-end-title'), 'FIRST FINISH', 'late save cannot overwrite a later finish');
  assert.equal(await page.locator('#finish-rank-callout').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: accepted PB and 5→3 climb, real neighbours, 3 phone sizes, reduced motion, ordinary/flagged/preview finishes, late-save isolation; no page errors.');
  console.log(`Evidence: ${out}`);
} finally { await browser.close(); server.kill(); }

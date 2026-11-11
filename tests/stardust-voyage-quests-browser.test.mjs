// Real browser playthrough of the slice quest (Cold Run) in the quest sandbox.
// Opt-in like the repo's other browser tests: STARDUST_BROWSER_TEST=1. Run it on
// its own, capped: ~/kauto-3d/bin/capped 6G timeout 600 node --test tests/stardust-voyage-quests-browser.test.mjs
// The test plays by reading the page only: it picks options, flies the trip,
// fires in the fight and cracks the cipher lock from its own feedback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const SANDBOX = '/projects/Space-Shooter/voyage/quests/sandbox/index.html';
const SAVE_KEY = 'stardust.voyage.quest-sandbox.v1';

function captainSave(stats) {
  return {
    v: 1, updatedAt: 0, money: 50, rep: {}, items: { scrap: 2 }, flags: {},
    upgrades: { hull: 0, engine: 0, thrusters: 0, guns: 0 }, account: { unlocks: [], maxRep: {} }, quests: {},
    character: { id: 'c-test', name: 'Test Pilot', look: { portrait: 'p1', color: '#5fd4ff' }, stats, earned: 0, permanent: 0, skills: {}, deaths: 0, createdAt: 0 },
  };
}

// All codes of `length` distinct symbols from `symbols`.
function codes(length, symbols) {
  const out = [];
  const walk = prefix => {
    if (prefix.length === length) { out.push(prefix); return; }
    for (let s = 0; s < symbols; s++) if (!prefix.includes(s)) walk([...prefix, s]);
  };
  walk([]);
  return out;
}
function score(code, guess) {
  let exact = 0, shared = 0;
  guess.forEach((s, i) => { if (code[i] === s) exact++; if (code.includes(s)) shared++; });
  return { exact, near: shared - exact };
}

async function playColdRun(page, prefer = null) {
  const seen = [];
  let candidates = null;
  for (let step = 0; step < 200; step++) {
    const main = page.locator('#qs-main');
    const text = await main.innerText();
    if (/JOB DONE|JOB FAILED/.test(text)) return { text, seen };
    // The cipher lock: guess the first code that fits every answer so far.
    if (await page.locator('.qs-cipher').count()) {
      seen.push('cipher');
      const symbols = await page.locator('.qs-pad button').count();
      const length = await page.locator('.qs-slot').count();
      candidates ??= codes(length, symbols);
      const history = await page.locator('.qs-guesses li').allInnerTexts();
      const symbolText = await page.locator('.qs-pad button').allInnerTexts();
      const glyph = symbolText.map(t => t.split(' ')[0]);
      for (const line of history) {
        const [codePart, feedback] = line.split(/\s{2,}/);
        const guess = codePart.trim().split(' ').map(g => glyph.indexOf(g));
        const [, exact, near] = feedback.match(/(\d) in place, (\d) elsewhere/).map(Number);
        candidates = candidates.filter(c => { const s = score(c, guess); return s.exact === exact && s.near === near; });
      }
      const known = await page.locator('.qs-slot.is-known').count();
      if (known) {
        const slots = await page.locator('.qs-slot').evaluateAll(els => els.map(e => e.classList.contains('is-known') ? e.textContent : null));
        slots.forEach((g, i) => { if (g) candidates = candidates.filter(c => c[i] === glyph.indexOf(g)); });
      }
      for (const s of candidates[0]) await page.keyboard.press(String(s + 1));
      await page.keyboard.press('Enter');
      continue;
    }
    if (await page.locator('.qs-fight').count()) { seen.push('fight'); await page.keyboard.press('f'); continue; }
    const enabled = page.locator('.qs-choices button:not([disabled])');
    if (await enabled.count()) {
      if (await page.locator('.qs-map').count()) seen.push('travel');
      if (await page.locator('.qs-event').count()) seen.push('event');
      // Prefer not to hand the cargo over, so the test sees the fight or a quiet run.
      const labels = await enabled.allInnerTexts();
      const wanted = prefer ? labels.findIndex(l => prefer.test(l)) : -1;
      const pick = wanted >= 0 ? wanted : labels.findIndex(l => !/Take it\.|hand the core|Pay the/i.test(l));
      await enabled.nth(Math.max(0, pick)).click();
      continue;
    }
    const primary = page.locator('#qs-main button.primary');
    if (await primary.count()) { await primary.first().click(); continue; }
    throw new Error(`Stuck at: ${text.slice(0, 200)}`);
  }
  throw new Error('Quest did not end in 200 steps');
}

test('quest sandbox: closed without the flag; Cold Run plays start to finish in a real browser', { skip: !process.env.STARDUST_BROWSER_TEST, timeout: 120000 }, async t => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const closed = await browser.newContext();
  await blockHub(closed);
  const closedPage = await closed.newPage();
  await closedPage.goto(server.origin + SANDBOX);
  await closedPage.waitForSelector('#qs-closed:not([hidden])');
  assert.equal(await closedPage.locator('#qs-app').isHidden(), true, 'the sandbox stays shut without ?voyage=on');
  await closed.close();

  const runOnce = async ({ seed = '8', stats = { cha: 3, con: 4, dex: 5, wis: 3 }, prefer = null } = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await blockHub(context);
    await context.addInitScript(([key, save]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, save); } }, [SAVE_KEY, JSON.stringify(captainSave(stats))]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com/.test(m.text())) errors.push(m.text()); });
    await page.goto(`${server.origin}${SANDBOX}?voyage=on`);
    await page.waitForSelector('.qs-giver');
    assert.equal(await page.locator('.qs-giver').count(), 3);
    await page.fill('#qs-seed', seed);
    await page.locator('.qs-jobs li', { hasText: 'Cold Run' }).getByRole('button', { name: 'Take the job' }).click();
    await page.waitForSelector('.qs-dialogue');
    assert.match(await page.locator('.qs-speaker').innerText(), /HASK/i);
    const result = await playColdRun(page, prefer);
    const money = await page.locator('.qs-money').innerText();
    const log = await page.locator('#qs-log').innerText();
    await context.close();
    return { ...result, money, log, errors };
  };

  const first = await runOnce();
  t.diagnostic(`steps: ${first.seen.join(', ')}`);
  t.diagnostic(`ending: ${first.text.split('\n').filter(Boolean).slice(3, 5).join(' / ')}`);
  assert.deepEqual(first.errors, []);
  assert.ok(first.seen.includes('travel'), 'the quest has a trip on the sector map');
  assert.match(first.text, /JOB DONE|JOB FAILED/);
  if (/JOB DONE/.test(first.text)) assert.match(first.text, /Knock fragment/);
  const again = await runOnce();
  assert.equal(again.text, first.text, 'same seed, same choices: same ending');
  assert.equal(again.money, first.money);

  // The loud way: pick the fight, win it, then crack the tamper seal by deduction.
  const loud = await runOnce({ seed: '2', stats: { cha: 2, con: 6, dex: 6, wis: 2 }, prefer: /Guns hot|Turn and fight|Take pad nineteen/ });
  t.diagnostic(`loud steps: ${loud.seen.join(', ')}`);
  t.diagnostic(`loud ending: ${loud.text.split('\n').filter(Boolean).slice(3, 5).join(' / ')}`);
  assert.deepEqual(loud.errors, []);
  assert.ok(loud.seen.includes('fight'), 'the raider fight happened');
  assert.ok(loud.seen.includes('cipher'), 'the tamper seal came up after the fight');
  assert.match(loud.text, /Delivered loud|Core wiped/);
});

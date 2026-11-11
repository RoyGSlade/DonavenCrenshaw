// The slice's whole loop in a real browser, from today's hangar:
//   preview card -> new hangar -> sign on a captain -> Jobs -> take Cold Run from
//   Hask -> play it (trip, events, talk or fight, seal) -> reward in the Ledger ->
//   buy an upgrade in the Ship tab -> the next job starts with the stronger ship.
// Then a phone-size check of the job board. Opt-in like the other browser
// checks (STARDUST_BROWSER_TEST=1); run it on its own, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 600 node --test tests/stardust-slice-browser.test.mjs
// The page's Math.random is seeded so stats and job seeds repeat run to run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub, bootStardust, DESKTOP, PHONE } from '../scripts/stardust-test-kit.mjs';

const HANGAR = '/projects/Space-Shooter/voyage/';
const SAVE_KEY = 'stardust.voyage.v1';

// A seeded Math.random for the page (mulberry32), so the run is repeatable.
const seedRandom = (seed) => {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const readSave = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);

// All codes of `length` distinct symbols out of `symbols`, and the lock's scoring.
function codes(length, symbols) {
  const out = [];
  const walk = (prefix) => {
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

/** Plays the job running in the Jobs tab to its end screen, reading only the page. */
async function playJob(page) {
  const pane = page.locator('#pane-jobs');
  const seen = new Set();
  let candidates = null;
  for (let step = 0; step < 200; step++) {
    const text = await pane.innerText();
    if (/JOB DONE|JOB FAILED/.test(text)) return { text, seen: [...seen] };
    if (await pane.locator('.qs-cipher').count()) {
      seen.add('cipher');
      const symbols = await pane.locator('.qs-pad button').count();
      const length = await pane.locator('.qs-slot').count();
      candidates ??= codes(length, symbols);
      const glyph = (await pane.locator('.qs-pad button').allInnerTexts()).map((t) => t.split(' ')[0]);
      for (const line of await pane.locator('.qs-guesses li').allInnerTexts()) {
        const [codePart, feedback] = line.split(/\s{2,}/);
        const guess = codePart.trim().split(' ').map((g) => glyph.indexOf(g));
        const [, exact, near] = feedback.match(/(\d) in place, (\d) elsewhere/).map(Number);
        candidates = candidates.filter((c) => { const s = score(c, guess); return s.exact === exact && s.near === near; });
      }
      const slots = await pane.locator('.qs-slot').evaluateAll((els) => els.map((e) => (e.classList.contains('is-known') ? e.textContent : null)));
      slots.forEach((g, i) => { if (g) candidates = candidates.filter((c) => c[i] === glyph.indexOf(g)); });
      for (const s of candidates[0]) await page.keyboard.press(String(s + 1));
      await page.keyboard.press('Enter');
      continue;
    }
    if (await pane.locator('.qs-fight').count()) { seen.add('fight'); await page.keyboard.press('f'); continue; }
    if (await pane.locator('.qs-race').count()) { seen.add('race'); await pane.locator('.qs-race .qs-moves button').first().click(); continue; }
    const enabled = pane.locator('.qs-choices button:not([disabled])');
    if (await enabled.count()) {
      if (await pane.locator('.qs-map').count()) seen.add('travel');
      if (await pane.locator('.qs-event').count()) seen.add('event');
      const labels = await enabled.allInnerTexts();
      // Never hand the cargo over; take sure things (a stat line, a decoy) over rolls.
      const sure = labels.findIndex((l) => /Name the debt|Vent two scrap/.test(l));
      const pick = sure >= 0 ? sure : labels.findIndex((l) => !/Take it\.|hand the core|Pay the/i.test(l));
      await enabled.nth(Math.max(0, pick)).click();
      continue;
    }
    const primary = pane.locator('button.primary');
    if (await primary.count()) { await primary.first().click(); continue; }
    throw new Error(`Stuck at: ${text.slice(0, 300)}`);
  }
  throw new Error('The job did not end in 200 steps');
}

test('slice loop: preview card -> captain -> job -> reward -> upgrade -> a stronger next job; phone board', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 240000,
}, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  // 1. Today's hangar, previewing: the card opens the new hangar.
  const entry = await bootStardust(browser, server.origin, { newGame: true });
  t.after(() => entry.context.close());
  await entry.page.locator('#newgame-card a').click();
  await entry.page.waitForURL(/\/voyage\/$/);
  await entry.page.locator('#vy-hangar').waitFor();
  assert.equal(await entry.page.locator('#vy-closed').isVisible(), false);

  // 2. The loop, with a seeded Math.random.
  const context = await browser.newContext({ ...DESKTOP, viewport: { width: 1440, height: 900 } });
  t.after(() => context.close());
  await blockHub(context);
  await context.addInitScript(seedRandom, 20261111);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${server.origin}${HANGAR}?newgame=1`);

  // No captain yet: the Jobs tab sends you to sign on.
  await page.getByRole('tab', { name: 'Jobs' }).click();
  assert.match(await page.locator('#pane-jobs').innerText(), /Sign on a captain first/);
  await page.locator('#pane-jobs button.primary').click();
  await page.locator('#vy-name').fill('Vela Quint');
  await page.getByRole('button', { name: 'Roll stats and sign on' }).click();
  await page.locator('#pane-captain h2', { hasText: 'Vela Quint' }).waitFor();
  const signed = await readSave(page);
  assert.deepEqual({ money: signed.money, scrap: signed.items.scrap }, { money: 80, scrap: 4 }, 'start kit');

  // The board: three givers with portraits and their jobs.
  await page.getByRole('tab', { name: 'Jobs' }).click();
  assert.equal(await page.locator('.vy-giver').count(), 3);
  assert.equal(await page.locator('.vy-giver img.vy-portrait').evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length), 3, 'portraits load');
  const hullBefore = Number(await page.locator('.vy-jobship').getAttribute('data-ship-hull'));

  // Take Cold Run until a job pays enough for hull tier 1 (usually the first).
  let paid = false;
  const runs = [];
  for (let i = 0; i < 6 && !paid; i++) {
    await page.locator('[data-quest="cold-run"] button').click();
    await page.locator('#pane-jobs .qs-quest-head').waitFor();
    assert.equal(Number(await page.locator('#pane-jobs .qs-ship').getAttribute('data-ship-hull')), hullBefore, 'the job flies the ship as it is');
    const result = await playJob(page);
    runs.push(result);
    t.diagnostic(`run ${i + 1}: ${result.seen.join(', ')} -> ${/JOB DONE/.test(result.text) ? 'done' : 'failed'}`);
    await page.locator('#pane-jobs button.primary', { hasText: 'Back to the job board' }).click();
    paid = await page.locator('[data-upgrade="hull"]').isEnabled();
  }
  const afterJobs = await readSave(page);
  assert.ok(afterJobs.quests.done['cold-run'].times >= 1, 'the job record is in the save');
  assert.ok(runs.some((r) => /JOB DONE/.test(r.text)), 'at least one job paid');
  assert.ok(runs.some((r) => r.seen.includes('travel')), 'jobs travel on the sector map');

  // The Ledger shows the reward: credits, Hask's rep and the job record.
  await page.getByRole('tab', { name: 'Ledger' }).click();
  assert.equal(await page.locator('[data-money]').innerText(), `${afterJobs.money.toLocaleString('en-US')} cr`);
  assert.match(await page.locator('#pane-ledger [data-rep="hask"]').innerText(), new RegExp(`^${afterJobs.rep.hask} / 100`));
  assert.match(await page.locator('[data-job="cold-run"]').innerText(), /Cold Run/);

  // Spend it: hull tier 1.
  await page.getByRole('tab', { name: 'Ship' }).click();
  await page.locator('[data-upgrade="hull"]').click();
  const upgraded = await readSave(page);
  assert.equal(upgraded.upgrades.hull, 1);
  assert.ok(upgraded.money < afterJobs.money, 'credits were spent');

  // The next job flies the stronger ship.
  await page.getByRole('tab', { name: 'Jobs' }).click();
  assert.equal(Number(await page.locator('.vy-jobship').getAttribute('data-ship-hull')), hullBefore + 20);
  await page.locator('[data-quest="cold-run"] button').click();
  await page.locator('#pane-jobs .qs-quest-head').waitFor();
  assert.match(await page.locator('#pane-jobs .qs-bar').first().innerText(), new RegExp(`Hull ${hullBefore + 20}/${hullBefore + 20}`));

  // A job in progress survives a reload and picks up where it was.
  await page.reload();
  await page.locator('#pane-jobs .qs-quest-head').waitFor();
  assert.equal(await page.getByRole('tab', { name: 'Jobs' }).getAttribute('aria-selected'), 'true');
  const resumed = await playJob(page);
  assert.match(resumed.text, /JOB DONE|JOB FAILED/);
  assert.deepEqual(errors, []);

  // 3. Phone: the board fits 390 px with no sideways scroll.
  const phone = await browser.newContext({ ...PHONE });
  t.after(() => phone.close());
  await blockHub(phone);
  await phone.addInitScript(([key, save]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, save); } }, [SAVE_KEY, JSON.stringify(upgraded)]);
  const p2 = await phone.newPage();
  const phoneErrors = [];
  p2.on('pageerror', (e) => phoneErrors.push(e.message));
  await p2.goto(`${server.origin}${HANGAR}?newgame=1`);
  await p2.getByRole('tab', { name: 'Jobs' }).click();
  await p2.locator('.vy-giver').first().waitFor();
  assert.equal(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll at 390 px');
  await p2.locator('[data-quest="cold-run"] button').click();
  await p2.locator('#pane-jobs .qs-dialogue').waitFor();
  assert.equal(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'a running job fits too');
  assert.deepEqual(phoneErrors, []);
});

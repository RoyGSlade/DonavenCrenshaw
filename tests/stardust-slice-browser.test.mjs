// The slice's whole loop in a real browser, from today's hangar:
//   preview card -> new hangar -> sign on a captain -> Jobs -> take Cold Run from
//   Hask -> play it (trip, events, talk or fight, seal) -> reward in the Ledger ->
//   buy an upgrade at the pad -> the next job starts with the stronger ship.
// Round 2: the hangar is a place; stations open in place (scripts/stardust-hangar-kit.mjs).
// Then a phone-size check of the job board. Opt-in like the other browser
// checks (STARDUST_BROWSER_TEST=1); run it on its own, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 600 node --test tests/stardust-slice-browser.test.mjs
// The page's Math.random is seeded so stats and job seeds repeat run to run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub, bootStardust, DESKTOP, PHONE } from '../scripts/stardust-test-kit.mjs';
import { signOnCaptain, openStation, openPad, closePad } from '../scripts/stardust-hangar-kit.mjs';
import { playJob, takePosting, doneJob } from '../scripts/stardust-play-kit.mjs';

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

  // No captain yet: the captain's licence opens; roll the stats and sign.
  await signOnCaptain(page, 'Vela Quint');
  const signed = await readSave(page);
  assert.deepEqual({ money: signed.money, scrap: signed.items.scrap }, { money: 80, scrap: 4 }, 'start kit');

  // The board: three givers with portraits and their jobs.
  await openStation(page, 'board');
  // Round 3: the board carries postings from the three givers (they work on other stations).
  assert.equal(await page.locator('.vy-posting').count(), 15);
  assert.ok(await page.locator('.vy-posting img.vy-posting-face').evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length) >= 3, 'portraits load');
  const hullBefore = Number(await page.locator('.vy-jobship').getAttribute('data-ship-hull'));

  // Take Cold Run until a job pays enough for hull tier 1 (usually the first).
  let paid = false;
  const runs = [];
  for (let i = 0; i < 6 && !paid; i++) {
    await takePosting(page, 'cold-run');
    assert.equal((await readSave(page)).quests.active['cold-run'].hullMax, hullBefore, 'the job flies the ship as it is');
    const result = await playJob(page);
    runs.push(result);
    t.diagnostic(`run ${i + 1}: ${result.seen.join(', ')} -> ${/JOB DONE/.test(result.text) ? 'done' : 'failed'}`);
    await doneJob(page);
    paid = await page.locator('[data-upgrade="hull"]').isEnabled();
  }
  const afterJobs = await readSave(page);
  assert.ok(afterJobs.quests.done['cold-run'].times >= 1, 'the job record is in the save');
  assert.ok(runs.some((r) => /JOB DONE/.test(r.text)), 'at least one job paid');
  assert.ok(runs.some((r) => r.seen.includes('travel')), 'jobs travel on the sector map');

  // Round 3: the datapad shows the reward: credits on the Pack page, Hask's rep and the job record on Jobs.
  await openPad(page, 'pack');
  assert.equal(await page.locator('#pane-ledger [data-money]').innerText(), `${afterJobs.money.toLocaleString('en-US')} cr`);
  await openPad(page, 'jobs');
  assert.match(await page.locator('#dp-page-jobs [data-rep="hask"]').innerText(), new RegExp(`^${afterJobs.rep.hask} / 100`));
  assert.match(await page.locator('#dp-page-jobs [data-job="cold-run"]').innerText(), /Cold Run/);
  await closePad(page);

  // Spend it: hull tier 1.
  await openStation(page, 'pad');
  await page.locator('[data-upgrade="hull"]').click();
  const upgraded = await readSave(page);
  assert.equal(upgraded.upgrades.hull, 1);
  assert.ok(upgraded.money < afterJobs.money, 'credits were spent');

  // The next job flies the stronger ship.
  await openStation(page, 'board');
  assert.equal(Number(await page.locator('.vy-jobship').getAttribute('data-ship-hull')), hullBefore + 20);
  await takePosting(page, 'cold-run');
  assert.equal((await readSave(page)).quests.active['cold-run'].hullMax, hullBefore + 20, 'the next job flies the upgraded hull');

  // A job in progress survives a reload: the tracker offers to continue it, and it picks up where it was.
  await page.reload();
  await page.locator('#dp-continue').click();
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
  await openStation(p2, 'board');
  await p2.locator('.vy-posting').first().waitFor();
  assert.equal(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll at 390 px');
  await p2.locator('[data-quest="cold-run"] button').click();
  await p2.locator('#hg-dialogue .ui-dlg-choice').first().waitFor(); // the job's talk plays in the dialogue box
  assert.equal(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'a running job fits too');
  assert.deepEqual(phoneErrors, []);
});

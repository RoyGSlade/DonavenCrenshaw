// Outcome 3 in real browsers: a pilot and two friends, plus one AI crewmate, run a
// job together on the real relay. The pilot hires three AI (tiers 1, 2, 3); each
// friend who joins by room code takes over the lowest AI seat, so the ship ends up
// pilot + two friends + the tier-3 AI. Every station shows the four-seat roster.
// The pilot flies a job while the friends work their stations and the AI takes
// its turns on the pilot's browser (seeded, so a replay plays the same). Then the
// pilot leaves and both friends are told the room closed.
// Opt-in like the other browser checks; run it on its own, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 900 node --test tests/stardust-crew4-browser.test.mjs
// CREW_PROOF_DIR=/some/dir saves the roster screenshots at 1440x900 and 390x844.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadPlaywright, startServer } from '../scripts/stardust-test-kit.mjs';
import { signOnCaptain, openStation } from '../scripts/stardust-hangar-kit.mjs';

const HANGAR = '/projects/Space-Shooter/voyage/?newgame=1';
const HUB = 'https://api.donavencrenshaw.com';
const proofDir = process.env.CREW_PROOF_DIR || null;
const DESK = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

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

// A fake account service: three signed-in friends, nothing else.
async function attachHub(context, who, origin) {
  const users = { nova: 'Nova', vega: 'Vega', lyra: 'Lyra' };
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Accept', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE' };
  await context.route(`${HUB}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/api/users/session') return json(200, { user: { id: `u-${who}`, username: who, displayName: users[who] } });
    if (url.pathname === '/api/friends') return json(200, { friends: Object.keys(users).filter((u) => u !== who).map((u) => ({ username: u, displayName: users[u] })) });
    if (url.pathname === '/api/dogfight/invites') return json(200, { invites: [] });
    if (url.pathname.endsWith('/saves/voyage')) return req.method() === 'PUT' ? json(200, { ok: true }) : json(404, { error: 'not_found' });
    if (url.pathname === '/api/games/stardust') return json(200, { boards: [] });
    return json(404, { error: 'not_found' });
  });
}

async function open(browser, server, who, seed, viewport = DESK) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport === PHONE ? 2 : 1 });
  await attachHub(context, who, server.origin);
  await context.addInitScript(seedRandom, seed);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  await page.goto(`${server.origin}${HANGAR}`);
  return { context, page, errors };
}
const snap = async (page, name) => { if (proofDir) await page.screenshot({ path: path.join(proofDir, name) }); };
// Both sizes of one screen: the page as it is, then at phone size, then back.
async function snapBoth(page, name) {
  if (!proofDir) return;
  const was = page.viewportSize();
  await page.setViewportSize(DESK); await page.waitForTimeout(400); await snap(page, `${name}-1440.png`);
  await page.setViewportSize(PHONE); await page.waitForTimeout(400); await snap(page, `${name}-390.png`);
  await page.setViewportSize(was); await page.waitForTimeout(200);
}

// A friend works the guns (the scopes are left to the AI crewmate in this run).
async function crewTurn(crew, did) {
  const pane = crew.locator('#pane-crew');
  const fire = pane.locator('#cw-fire:not([disabled])');
  if (await fire.count()) {
    const scope = pane.locator('canvas.cw-scope');
    const box = await scope.boundingBox();
    if (box) {
      const { tx, ty } = await scope.evaluate((c) => ({ tx: Number(c.dataset.tx), ty: Number(c.dataset.ty) }));
      await crew.mouse.click(box.x + (tx / 320) * box.width, box.y + (ty / 180) * box.height);
      did.add('turret');
    }
  }
}

// The pilot plays the job (talk in the dialogue box, the rest in the job card), friends taking turns between moves.
async function playJob(pilot, crews, did, seen = []) {
  const pane = pilot.locator('#pane-jobs');
  const talk = pilot.locator('#hg-dialogue:not([hidden]) .ui-dlg-choice:not([disabled]):not(.is-later)');
  for (let step = 0; step < 320; step++) {
    for (const c of crews) await crewTurn(c, did);
    await pilot.waitForTimeout(250); // a pilot tick, so the AI takes its turn
    // Crew acts land in the fight's own log (and the run's): keep every line we see.
    seen.push(...await pilot.evaluate(() => { const r = window.__stardust.jobs.crewView().run; return [...(r?.log || []), ...(r?.part?.state?.log || []), ...(r?.part?.state?.card?.fight?.log || [])]; }));
    if (await talk.count()) {
      const labels = await talk.allInnerTexts();
      const pick = labels.findIndex((l) => !/Take it\.|hand the core|Pay the/i.test(l));
      await talk.nth(Math.max(0, pick)).click();
      await pilot.waitForTimeout(150);
      continue;
    }
    if (!(await pilot.locator('#dp-jobcard').isVisible())) { await pilot.waitForTimeout(200); continue; }
    const text = await pane.innerText();
    if (/JOB DONE|JOB FAILED/.test(text)) return text;
    if (await pane.locator('.qs-cipher').count()) { await pane.getByRole('button', { name: 'Give up' }).click(); continue; }
    if (await pane.locator('.qs-riddle').count()) { await pane.getByRole('button', { name: 'Give up' }).click(); continue; }
    if (await pane.locator('.qs-fight').count()) { await pilot.waitForTimeout(1600); await pilot.keyboard.press('f'); await pilot.waitForTimeout(150); continue; }
    if (await pane.locator('.qs-race').count()) { await pane.locator('.qs-race .qs-moves button').first().click(); continue; }
    const enabled = pane.locator('.qs-choices button:not([disabled])');
    if (await enabled.count()) {
      // Leave a jump a moment before taking it, so a crewmate can scan it first.
      await pilot.waitForTimeout(1600);
      const labels = await enabled.allInnerTexts();
      const pick = labels.findIndex((l) => !/Take it\.|hand the core|Pay the/i.test(l));
      await enabled.nth(Math.max(0, pick)).click();
      await pilot.waitForTimeout(150);
      continue;
    }
    const primary = pane.locator('button.primary');
    if (await primary.count()) { await primary.first().click(); await pilot.waitForTimeout(150); continue; }
    await pilot.waitForTimeout(200);
  }
  throw new Error('The job did not end in 320 steps');
}

async function joinByCode(page, code) {
  await openStation(page, 'hatch', 'crew');
  await page.locator('#cw-code').fill(code);
  await page.locator('#cw-join').click();
  try { await page.locator('.cw-station', { hasText: 'CREW STATION' }).waitFor({ timeout: 20000 }); } catch (error) {
    throw new Error(`Could not join ${code}: ${(await page.locator('#pane-crew').innerText().catch(() => '?')).slice(0, 400)}`);
  }
}

test('crew of four: pilot + two friends + one AI seat run a job; friends take over AI seats; rosters everywhere', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 900000,
}, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  // The pilot hires three AI crew, one of each tier, before anyone joins.
  const P = await open(browser, server, 'nova', 20261116);
  t.after(() => P.context.close().catch(() => {}));
  await signOnCaptain(P.page, 'Vela Quint');
  await openStation(P.page, 'hatch', 'crew');
  await P.page.locator('#cw-open').click();
  const code = await P.page.locator('.cw-code').getAttribute('data-code', { timeout: 10000 });
  for (const tier of ['1', '2', '3']) await P.page.locator(`[data-hire="${tier}"]`).click();
  assert.deepEqual(await P.page.locator('.cw-seats li').evaluateAll((li) => li.map((x) => x.dataset.kind)), ['host', 'ai', 'ai', 'ai']);
  assert.match(await P.page.locator('.cw-seats').innerText(), /AI crew, tier 1[\s\S]*10% of each job[\s\S]*tier 2[\s\S]*15%[\s\S]*tier 3[\s\S]*25%/);

  // Two friends join by room code: each takes the lowest AI seat.
  const A = await open(browser, server, 'vega', 777);
  t.after(() => A.context.close().catch(() => {}));
  await signOnCaptain(A.page, 'Ossa Vey');
  await joinByCode(A.page, code);
  await P.page.locator('.cw-seats', { hasText: 'Ossa Vey' }).waitFor({ timeout: 15000 });
  const B = await open(browser, server, 'lyra', 4242, PHONE);
  t.after(() => B.context.close().catch(() => {}));
  await signOnCaptain(B.page, 'Bryn Hale');
  await joinByCode(B.page, code);
  await P.page.locator('.cw-seats', { hasText: 'Bryn Hale' }).waitFor({ timeout: 15000 });
  const kinds = await P.page.locator('.cw-seats li').evaluateAll((li) => li.map((x) => [x.dataset.kind, x.querySelector('b')?.textContent || '']));
  assert.deepEqual(kinds.map(([k]) => k), ['host', 'human', 'human', 'ai'], 'friends took the two cheapest AI seats; the tier-3 AI stays');
  assert.match(kinds[1][1], /Ossa Vey/);
  assert.match(kinds[2][1], /Bryn Hale/);
  assert.match(kinds[3][1], /Old Moss · level 3 · 25% of each job/);
  await snapBoth(P.page, 'crew4-pilot-roster');

  // The pilot takes a job; every station shows who is aboard.
  await openStation(P.page, 'board');
  await P.page.locator('[data-quest="cold-run"] button').click();
  await P.page.locator('#hg-dialogue .ui-dlg-choice').first().waitFor();
  for (const c of [A.page, B.page]) await c.locator('.cw-roster li').nth(3).waitFor({ timeout: 15000 });
  const roster = await A.page.locator('.cw-roster li').evaluateAll((li) => li.map((x) => [x.dataset.kind, x.querySelector('b')?.textContent || '']));
  assert.deepEqual(roster.map(([k]) => k), ['host', 'human', 'human', 'ai']);
  assert.deepEqual(roster.map(([, n]) => n), ['Vela Quint', 'Ossa Vey', 'Bryn Hale', 'Old Moss']);
  await snapBoth(A.page, 'crew4-friend-station');

  // Fly jobs until the AI has taken a turn (it scans jumps and works the guns on the pilot's browser).
  const did = new Set();
  const logs = [];
  let aiActed = false;
  for (let job = 0; job < 3 && !aiActed; job++) {
    if (job) {
      await P.page.locator('#pane-jobs button.primary', { hasText: 'Done' }).click();
      await openStation(P.page, 'board');
      await P.page.locator('[data-quest="cold-run"] button').click();
      await P.page.locator('#hg-dialogue .ui-dlg-choice').first().waitFor();
    }
    await playJob(P.page, [A.page, B.page], did, logs);
    aiActed = logs.some((l) => /Old Moss/.test(l));
  }
  t.diagnostic(`friends did: ${[...did].join(', ')}; log lines naming the AI: ${[...new Set(logs.filter((l) => /Old Moss/.test(l)))].join(' | ')}`);
  assert.ok(aiActed, 'the AI crewmate took a turn in the job');
  assert.ok(did.size > 0, 'the friends worked their stations');

  // The pilot leaves: both friends are told the room closed.
  await P.context.close();
  for (const c of [A.page, B.page]) await c.locator('#pane-crew', { hasText: /captain left/i }).waitFor({ timeout: 20000 });
  assert.deepEqual([...P.errors, ...A.errors, ...B.errors], []);
});

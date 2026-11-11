// Player two in two real browsers (P11): the pilot opens a crew room in the
// new hangar and invites a friend from the friends list; the friend sees the
// crew invite and joins; the pilot flies jobs while the crew aims the turret,
// holds to repair, scans jumps and takes checks; the crew's share of each
// reward lands in the crew's own save. Then the pilot leaves mid-job (S58):
// the crew keeps what they were paid and the pilot's job is still in the
// pilot's save. The account service is a small fake (sessions, friends, crew
// invites with the new `game` field); the relay is the real one.
// Opt-in like the other browser checks; run it on its own, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 900 node --test tests/stardust-crew-browser.test.mjs
// CREW_PROOF_DIR=/some/dir saves screenshots of both screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadPlaywright, startServer, DESKTOP, PHONE } from '../scripts/stardust-test-kit.mjs';
import { signOnCaptain, openStation } from '../scripts/stardust-hangar-kit.mjs';

const HANGAR = '/projects/Space-Shooter/voyage/?newgame=1';
const SAVE_KEY = 'stardust.voyage.v1';
const HUB = 'https://api.donavencrenshaw.com';
const proofDir = process.env.CREW_PROOF_DIR || null;

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

// A fake account service shared by both browsers: two friends and their invites.
function fakeHub() {
  const users = { nova: { id: 'u-nova', username: 'nova', displayName: 'Nova' }, vega: { id: 'u-vega', username: 'vega', displayName: 'Vega' } };
  const invites = [];
  let n = 0;
  return {
    invites,
    async attach(context, who, origin) {
      const me = users[who];
      const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Accept', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE' };
      await context.route(`${HUB}/**`, async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        if (url.pathname === '/api/users/session') return json(200, { user: me });
        if (url.pathname === '/api/friends') return json(200, { friends: Object.values(users).filter((u) => u !== me).map(({ username, displayName }) => ({ username, displayName })) });
        if (url.pathname === '/api/dogfight/invites' && req.method() === 'POST') {
          const body = req.postDataJSON();
          const to = users[body.to];
          const invite = { id: `inv-${++n}`, code: body.code, game: body.game ?? 'dogfight', from: { username: me.username, displayName: me.displayName }, toId: to.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString() };
          invites.push(invite);
          return json(201, { invite: { ...invite, toId: undefined, to: { username: to.username, displayName: to.displayName } } });
        }
        if (url.pathname === '/api/dogfight/invites') {
          const game = url.searchParams.get('game') || 'dogfight';
          return json(200, { invites: invites.filter((i) => i.toId === me.id && i.game === game).map(({ toId: _t, ...i }) => i) });
        }
        if (url.pathname.startsWith('/api/dogfight/invites/') && req.method() === 'DELETE') {
          const at = invites.findIndex((i) => i.id === url.pathname.split('/').pop() && i.toId === me.id);
          if (at >= 0) invites.splice(at, 1);
          return route.fulfill({ status: 204, headers: cors });
        }
        if (url.pathname.endsWith('/saves/voyage')) return req.method() === 'PUT' ? json(200, { ok: true }) : json(404, { error: 'not_found' });
        if (url.pathname === '/api/games/stardust') return json(200, { boards: [] });
        return json(404, { error: 'not_found' });
      });
    },
  };
}

async function open(browser, server, hub, who, seed, profile = DESKTOP) {
  const context = await browser.newContext({ ...profile, ...(profile === DESKTOP ? { viewport: { width: 1280, height: 900 } } : {}) });
  await hub.attach(context, who, server.origin);
  await context.addInitScript(seedRandom, seed);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com|Failed to load resource/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
  await page.goto(`${server.origin}${HANGAR}`);
  return { context, page, errors };
}

// Round 2: a new player signs the captain's licence with the dice; stations open in place.
const signOn = (page, name) => signOnCaptain(page, name);

const readSave = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const snap = async (page, name) => { if (proofDir) await page.screenshot({ path: path.join(proofDir, name), fullPage: true }); };

// The crew does whatever their station offers: turret, repairs, scans, checks.
async function crewTurn(crew, did) {
  if (/null/.test(await crew.locator('.cw-station').innerText())) throw new Error('The station printed "null"');
  const pane = crew.locator('#pane-crew');
  const fire = pane.locator('#cw-fire:not([disabled])');
  if (await fire.count()) {
    if (!did.has('turret')) await snap(crew, 'crew-04-crew-turret.png');
    const scope = pane.locator('canvas.cw-scope');
    const box = await scope.boundingBox();
    const { tx, ty } = await scope.evaluate((c) => ({ tx: Number(c.dataset.tx), ty: Number(c.dataset.ty) }));
    await crew.mouse.click(box.x + (tx / 320) * box.width, box.y + (ty / 180) * box.height);
    did.add('turret');
    await crew.waitForTimeout(200);
  }
  const hold = pane.locator('.cw-hold:not([disabled])');
  if (await hold.count()) {
    const which = await hold.first().getAttribute('data-repair');
    const b = await hold.first().boundingBox();
    await crew.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await crew.mouse.down();
    await crew.waitForTimeout(1450);
    await crew.mouse.up();
    did.add(`repair:${which}`);
    await crew.waitForTimeout(200);
  }
  const scan = pane.locator('#cw-scan:not([disabled])');
  if (await scan.count()) { await scan.click(); did.add('scan'); await crew.waitForTimeout(200); }
  const check = pane.locator('[data-check]');
  if (await check.count() && !did.has('check')) { await check.first().click(); did.add('check'); await crew.waitForTimeout(250); }
}

// The pilot plays the job in the Jobs tab, giving the crew a turn before each move.
async function playJob(pilot, crew, did, { stopWhen = () => false } = {}) {
  const pane = pilot.locator('#pane-jobs');
  for (let step = 0; step < 220; step++) {
    await crewTurn(crew, did);
    const text = await pane.innerText();
    if (/JOB DONE|JOB FAILED/.test(text)) return text;
    if (await stopWhen()) return null;
    if (await pane.locator('.qs-cipher').count()) { await pane.getByRole('button', { name: 'Give up' }).click(); continue; }
    if (await pane.locator('.qs-riddle').count()) { await pane.getByRole('button', { name: 'Give up' }).click(); continue; }
    if (await pane.locator('.qs-fight').count()) { await pilot.keyboard.press('f'); await pilot.waitForTimeout(150); continue; }
    if (await pane.locator('.qs-race').count()) { await pane.locator('.qs-race .qs-moves button').first().click(); continue; }
    const enabled = pane.locator('.qs-choices button:not([disabled])');
    if (await enabled.count()) {
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
  throw new Error('The job did not end in 220 steps');
}

test('crew: invite, join, turret, repair, scan, checks, rewards to both saves; the pilot leaving keeps both saves', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 600000,
}, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const hub = fakeHub();

  // The pilot: a captain, then a crew room, then an invite to Vega.
  const P = await open(browser, server, hub, 'nova', 20261111);
  t.after(() => P.context.close().catch(() => {}));
  await signOn(P.page, 'Vela Quint');
  await openStation(P.page, 'hatch', 'crew');
  await P.page.locator('#cw-open').click();
  const code = await P.page.locator('.cw-code').getAttribute('data-code', { timeout: 10000 });
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.match(await P.page.locator('#cw-link').inputValue(), new RegExp(`crew=${code}`));
  await P.page.locator('[data-invite="vega"]').click();
  await P.page.locator('#pane-crew', { hasText: 'Invite sent to Vega' }).waitFor();
  assert.deepEqual(hub.invites.map((i) => [i.game, i.code, i.from.username]), [['crew', code, 'nova']], 'the hub got a crew invite');

  // The crew: their own captain, then the invite from the Crew tab.
  const C = await open(browser, server, hub, 'vega', 777);
  t.after(() => C.context.close().catch(() => {}));
  await signOn(C.page, 'Ossa Vey');
  await openStation(C.page, 'hatch', 'crew');
  await C.page.locator(`[data-crew-invite="${code}"]`).waitFor({ timeout: 20000 });
  await C.page.locator(`[data-crew-invite="${code}"] button.primary`).click();
  await C.page.locator('.cw-station', { hasText: 'CREW STATION' }).waitFor();
  assert.equal(hub.invites.length, 0, 'joining dismissed the invite');
  await P.page.locator('.cw-seats', { hasText: 'Ossa Vey' }).waitFor();
  const crewStart = await readSave(C.page);
  await snap(P.page, 'crew-01-pilot-room.png');
  await snap(C.page, 'crew-02-crew-docked.png');

  // Jobs until the crew has fired, repaired and been paid.
  const did = new Set();
  let paid = false;
  const results = [];
  for (let job = 0; job < 8 && !(paid && did.has('turret') && [...did].some((d) => d.startsWith('repair'))); job++) {
    await openStation(P.page, 'board');
    await P.page.locator('[data-quest="cold-run"] button').click();
    await P.page.locator('#pane-jobs .qs-crew', { hasText: 'Ossa Vey' }).waitFor();
    if (job === 0) { await C.page.locator('.cw-station h2', { hasText: 'Cold Run' }).waitFor(); await snap(C.page, 'crew-03-crew-on-the-job.png'); }
    const text = await playJob(P.page, C.page, did);
    results.push(/JOB DONE/.test(text) ? 'done' : 'failed');
    const crewNow = await readSave(C.page);
    paid = crewNow.money > crewStart.money;
    await P.page.locator('#pane-jobs button.primary', { hasText: 'Back to the job board' }).click();
  }
  t.diagnostic(`jobs: ${results.join(', ')}; crew did: ${[...did].join(', ')}`);
  assert.ok(did.has('turret'), 'the crew fired the turret');
  assert.ok([...did].some((d) => d.startsWith('repair')), 'the crew held to repair');
  assert.ok(did.has('check') || did.has('scan'), 'the crew took a check or scanned a jump');

  // Both saves were paid: the pilot's job record and credits, the crew's share.
  const pilotSave = await readSave(P.page);
  const crewSave = await readSave(C.page);
  assert.ok(pilotSave.quests.done['cold-run'].times >= 1);
  assert.ok(results.includes('done'), 'at least one job paid');
  assert.ok(crewSave.money > crewStart.money, `the crew was paid (${crewStart.money} -> ${crewSave.money})`);
  assert.ok((crewSave.rep.hask || 0) > 0, 'the crew earned rep with Hask');
  assert.equal(crewSave.quests?.done?.['cold-run'], undefined, 'the job record is the pilot\'s');
  assert.equal(crewSave.character.name, 'Ossa Vey', 'the crew kept their own captain');

  // S58: the pilot leaves mid-job. The crew is told and keeps their pay; the job stays in the pilot's save.
  await openStation(P.page, 'board');
  await P.page.locator('[data-quest="cold-run"] button').click();
  await P.page.locator('#pane-jobs .qs-quest-head').waitFor();
  await C.page.locator('.cw-station h2', { hasText: 'Cold Run' }).waitFor();
  const crewBefore = await readSave(C.page);
  await P.page.close();
  await C.page.locator('#pane-crew', { hasText: 'The captain left' }).waitFor({ timeout: 10000 });
  const crewAfter = await readSave(C.page);
  assert.equal(crewAfter.money, crewBefore.money, 'the crew keeps every credit already paid');
  await snap(C.page, 'crew-05-captain-left.png');
  const back = await P.context.newPage();
  await back.goto(`${server.origin}${HANGAR}`);
  await back.locator('#pane-jobs .qs-quest-head').waitFor();
  assert.equal(await back.locator('#hg-sheet').getAttribute('data-open-station'), 'board', 'the pilot\'s job resumes from the pilot\'s save');

  // A link join, and the station at phone size with no sideways scroll.
  await openStation(back, 'hatch', 'crew');
  await back.locator('#cw-open').click();
  const code2 = await back.locator('.cw-code').getAttribute('data-code', { timeout: 10000 });
  const phone = await browser.newContext({ ...PHONE });
  t.after(() => phone.close().catch(() => {}));
  await hub.attach(phone, 'vega', server.origin);
  await phone.addInitScript(([key, save]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, save); } }, [SAVE_KEY, JSON.stringify(crewAfter)]);
  const mobile = await phone.newPage();
  const phoneErrors = [];
  mobile.on('pageerror', (e) => phoneErrors.push(e.message));
  await mobile.goto(`${server.origin}${HANGAR}&crew=${code2}`);
  await mobile.locator('.cw-ask', { hasText: code2 }).waitFor();
  await mobile.locator('.cw-ask button.primary').click();
  await mobile.locator('.cw-station').waitFor();
  await back.locator('.cw-seats', { hasText: 'Ossa Vey' }).waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the station fits 390 px');
  await snap(mobile, 'crew-06-phone-station.png');
  assert.deepEqual([...P.errors, ...C.errors, ...phoneErrors], []);
});

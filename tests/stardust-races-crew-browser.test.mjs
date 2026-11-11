// Crew in a live fight, in two real browsers (races lane, round 2): the pilot
// flies a quest fight live on Dogfight's simulation while player two, joined
// through a crew room on the real relay, works the free-aim turret, a repair
// and their own hack ability from the live scope; the pilot uses their own
// ability bar. Dogfight's PvP page and code are not involved.
// Opt-in like the other browser checks; run it on its own, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 900 node --test tests/stardust-races-crew-browser.test.mjs
// RACES_PROOF_DIR=/some/dir saves screenshots of both screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, launchBrowser, DESKTOP } from '../scripts/stardust-test-kit.mjs';
import { openStation } from '../scripts/stardust-hangar-kit.mjs';

const G = '../projects/Space-Shooter';
const { createVoyageStore } = await import(`${G}/voyage/store.js`);
const { startQuest } = await import(`${G}/voyage/quests/engine.js`);
const { QUESTS } = await import(`${G}/voyage/quests/data/quests/index.js`);
const { encodeSave, LOCAL_KEY } = await import(`${G}/voyage/save.js`);

const HANGAR = '/projects/Space-Shooter/voyage/?newgame=1';
const proofDir = process.env.RACES_PROOF_DIR || null;
const snap = async (page, name) => { if (proofDir) await page.screenshot({ path: path.join(proofDir, name) }); };

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function captain(name, skills, fightNode = null) {
  const store = createVoyageStore({ storage: memory(), now: () => 1000 });
  store.createCharacter({ name }, () => 0.5);
  store.update((s) => ({ ...s, character: { ...s.character, earned: 12, skills } }));
  const save = store.get();
  assert.deepEqual(save.character.skills, skills, 'the seeded skills are kept');
  return fightNode ? startQuest({ ...QUESTS['black-lane'], start: fightNode }, save, { seed: 11 }).save : save;
}

async function open(browser, server, save) {
  const context = await browser.newContext({ ...DESKTOP, viewport: { width: 1280, height: 900 } });
  await context.route('https://api.donavencrenshaw.com/**', (route) => route.fulfill({ json: { user: null } }));
  await context.addInitScript(({ save, key }) => {
    try {
      if (!sessionStorage.getItem('__crewLiveInit')) {
        sessionStorage.setItem('__crewLiveInit', '1');
        localStorage.setItem('stardust.newgame', '1');
        localStorage.setItem(key, save);
      }
    } catch { /* storage blocked */ }
  }, { save: encodeSave(save), key: LOCAL_KEY });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${server.origin}${HANGAR}`);
  return { context, page, errors };
}

// Click the scope where the enemy is (the frame's world coords onto the canvas).
async function aimAndFire(crew) {
  const scope = crew.locator('canvas.rc-scope');
  await scope.scrollIntoViewIfNeeded();
  const box = await scope.boundingBox();
  const { fx, fy } = await scope.evaluate((c) => ({ fx: Number(c.dataset.fx), fy: Number(c.dataset.fy) }));
  if (!Number.isFinite(fx)) return false;
  // 400x240 canvas, 10 px per world cell.
  await crew.mouse.click(box.x + ((fx * 10) / 400) * box.width, box.y + ((fy * 10) / 240) * box.height);
  return true;
}

test('crew in a live fight: free-aim turret, repair and abilities through the crew room', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 600000,
}, async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  // Two separate browsers: the pilot's and the crew's.
  const pilotBrowser = await launchBrowser();
  t.after(() => pilotBrowser.close());
  const crewBrowser = await launchBrowser();
  t.after(() => crewBrowser.close());

  const P = await open(pilotBrowser, server, captain('Vela Quint', { gunner: 2 }, 'wave'));
  const C = await open(crewBrowser, server, captain('Ossa Vey', { hacker: 2, mechanic: 3 }));
  t.after(() => P.context.close().catch(() => {}));
  t.after(() => C.context.close().catch(() => {}));

  // The pilot opens a crew room; the crew joins by code.
  await openStation(P.page, 'hatch', 'crew');
  await P.page.locator('#cw-open').click();
  const code = await P.page.locator('.cw-code').getAttribute('data-code', { timeout: 15000 });
  await openStation(C.page, 'hatch', 'crew');
  await C.page.locator('#cw-code').fill(code);
  await C.page.locator('#cw-join').click();
  await C.page.locator('.cw-station', { hasText: 'CREW STATION' }).waitFor({ timeout: 15000 });
  await P.page.locator('.cw-seats', { hasText: 'Ossa Vey' }).waitFor({ timeout: 15000 });

  // The pilot's job is at a ship fight: fly it live.
  await openStation(P.page, 'board');
  await P.page.locator('#pane-jobs .qs-fight').waitFor();
  await P.page.getByRole('button', { name: /Fly it live/ }).click();
  await P.page.locator('.rc-live canvas.qs-live-canvas').waitFor();
  // The pilot's ability bar comes from their skills: Gunner 2 = overcharge (contract v1.2 levels).
  assert.deepEqual(await P.page.locator('.rc-live [data-ability]').evaluateAll((b) => b.map((x) => x.dataset.ability)), ['ship.overcharge']);

  // The crew's live scope appears from the stream.
  await C.page.locator('.rc-crew-live canvas.rc-scope').waitFor({ timeout: 15000 });
  assert.deepEqual(await C.page.locator('[data-crew-ability]').evaluateAll((b) => b.map((x) => x.dataset.crewAbility)), ['ship.hack-jam', 'ship.field-repair']);
  await C.page.waitForFunction(() => Number(document.querySelector('canvas.rc-scope')?.dataset.fx) > 0, null, { timeout: 15000 });
  await snap(C.page, 'races-08-crew-live-scope.png');

  const did = new Set();
  const status = () => C.page.locator('.rc-crew-live .rc-live-log').innerText().catch(() => '');
  const pilotStatus = () => P.page.locator('.rc-live .rc-live-status').innerText().catch(() => '');
  let overcharged = false;
  for (let i = 0; i < 400 && !(did.has('hit') && did.has('repair') && did.has('hack') && overcharged); i++) {
    if (!(await P.page.locator('.rc-live').count())) break; // the fight ended
    const fire = C.page.locator('#rc-crew-fire:not([disabled])');
    // Hold fire until the crew has had something to repair (content's rewrite made this wave shorter).
    if (await fire.count() && (did.has('repair') || i > 150)) { if (await aimAndFire(C.page)) did.add('fire'); }
    const hold = C.page.locator('.rc-crew-live .cw-hold:not([disabled])');
    if (!did.has('repair') && await hold.count()) {
      // Round 2: the crew view sits in the hatch's station panel, which scrolls.
      await hold.first().scrollIntoViewIfNeeded();
      const b = await hold.first().boundingBox();
      await C.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await C.page.mouse.down();
      await C.page.waitForTimeout(1350);
      await C.page.mouse.up();
      did.add('repair-try');
    }
    const hack = C.page.locator('[data-crew-ability="ship.hack-jam"][data-ready="1"]');
    if (!did.has('hack') && await hack.count()) {
      await hack.dispatchEvent('pointerdown');
      await C.page.waitForTimeout(540);
      await hack.dispatchEvent('pointerdown');
      did.add('hack-try');
    }
    if (!overcharged && await P.page.locator('.rc-live [data-ability="ship.overcharge"][data-ready="1"]').count()) {
      await P.page.keyboard.press('2');
      overcharged = /Barrels charged|lands big/.test(await pilotStatus());
    }
    const log = `${await status()} ${await pilotStatus()}`;
    if (/turret hits for \d+/.test(log)) did.add('hit');
    if (/patches the hull|back online/.test(log)) did.add('repair');
    if (/slices their fire control|misses the window/.test(log)) did.add('hack');
    if (i === 20) { await snap(P.page, 'races-09-pilot-live.png'); await snap(C.page, 'races-10-crew-live.png'); }
    await C.page.waitForTimeout(120);
  }
  const endLog = `${(await status()).slice(-200)} | pilot: ${(await pilotStatus()).slice(-200)} | P page: ${(await P.page.locator('#pane-jobs').innerText().catch(() => '')).slice(0, 300)}`;
  assert.ok(did.has('fire'), `the crew fired the turret (did: ${[...did].join(', ')}; ${endLog})`);
  assert.ok(did.has('hit'), `a turret bolt hit (crew did: ${[...did].join(', ')})`);
  assert.ok(did.has('hack'), `the crew's hack reached the pilot's fight (crew did: ${[...did].join(', ')})`);
  assert.ok(overcharged, `the pilot used their own ability (crew did: ${[...did].join(', ')})`);
  assert.ok(did.has('repair'), `the crew repaired something (crew did: ${[...did].join(', ')}; crew log: ${(await status()).slice(-300)}; holds: ${await C.page.locator('.cw-hold').evaluateAll((b) => b.map((x) => `${x.dataset.repair}:${x.disabled}`).join(' '))})`);
  console.log(`crew live: ${[...did].join(', ')}${overcharged ? ', pilot overcharge' : ''}`);

  // Let the fight finish (the turret keeps working) or stop it; the job goes on turn by turn.
  for (let i = 0; i < 600 && await P.page.locator('.rc-live').count(); i++) {
    if (await C.page.locator('#rc-crew-fire:not([disabled])').count()) await aimAndFire(C.page);
    await C.page.waitForTimeout(150);
  }
  if (await P.page.locator('.rc-live').count()) await P.page.getByRole('button', { name: 'Stop and fight turn by turn instead' }).click();
  await P.page.locator('.rc-live').waitFor({ state: 'detached' });
  await C.page.locator('.rc-crew-live').waitFor({ state: 'detached', timeout: 15000 });
  assert.deepEqual(P.errors, []);
  assert.deepEqual(C.errors, []);
});

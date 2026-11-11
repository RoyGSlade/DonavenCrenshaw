// Round 2, one game, end to end in a real browser at 1440: a new captain ->
// the intro -> the licence with the physics dice (five stats) -> the whole
// tutorial on foot (walk to Chibby and get the ship; Ralph's seam -> fly to
// Garrity; Mel's range -> fly to Hask; Edna's talk and lockbox -> fly to Vey)
// -> the job board opens -> the first job -> its reward. Real keys, mouse and
// clicks on the hangar page; the walking is held arrow keys. Then a 390 phone
// pass: intro, licence, the floor, a station sheet and the dialogue box fit.
// Opt-in like the other browser checks; run it on its own, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 1500 node --test tests/stardust-round2-e2e-browser.test.mjs
// PROOF_DIR=<dir> saves screenshots along the way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { loadPlaywright, startServer, blockHub, DESKTOP, PHONE } from '../scripts/stardust-test-kit.mjs';
import { openStation } from '../scripts/stardust-hangar-kit.mjs';
import { sleep, world, onMap, walkTo, walkToInteract, walkThroughDoor, playMining, playRange, playLockbox, flyHop, playJob } from '../scripts/stardust-play-kit.mjs';

const HANGAR = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const SAVE_KEY = 'stardust.voyage.v1';
const readSave = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const step = (page) => page.evaluate(() => window.__stardust.store.get().story?.step ?? null);

/** Waits for the tutorial to reach `id`, tapping through the dialogue box while lines play. */
async function untilStep(page, id, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = await page.evaluate(() => { const st = window.__stardust.store.get().story; return st?.finished ? '__done' : st?.step; });
    if (s === id || (id === '__done' && s === '__done')) return;
    const next = page.locator('#hg-dialogue:not([hidden]) .ui-dlg-next:not([hidden])');
    if (await next.count()) await next.click({ timeout: 1000 }).catch(() => {});
    await sleep(250);
  }
  assert.fail(`the tutorial never reached ${id} (at ${await step(page)})`);
}

/** Back home from a giver's place: out to the ship, the helm, the hop home. */
async function flyHome(page, shot) {
  await walkThroughDoor(page, 'out', 'ship');
  // Up the ship's spine: cargo hold, engine room, round the crew table, the cockpit.
  const T = 48;
  await walkToInteract(page, 'ship', 'helm', [[7.5 * T, 14.5 * T], [7.5 * T, 10.5 * T], [5.4 * T, 9.4 * T], [5.4 * T, 7 * T], [7.5 * T, 6.3 * T], [7.5 * T, 4.5 * T]]);
  await page.keyboard.press('KeyE');
  await page.locator('.of-helm [data-target="home"]').click();
  await flyHop(page, shot);
  await onMap(page, 'hangar');
  await sleep(500);
  // Step off the foot of the ramp (walking up from here goes back aboard).
  const w = await world(page);
  await walkTo(page, w.x + 40, w.y + 90, { near: 14 });
}

/** From the hangar: the launch hatch, then the hop to a giver, then their place. */
async function flyTo(page, target, mapId, shot) {
  await walkToInteract(page, 'station', 'hatch', [[13.5 * 48, 8.5 * 48], [2.5 * 48, 8.5 * 48]]);
  await page.keyboard.press('KeyE');
  await page.locator('#hg-sheet[data-open-station="hatch"]').waitFor();
  await page.locator(`[data-launch="hop-${target}"] button.primary`).click();
  await flyHop(page, shot);
  await onMap(page, mapId);
  await sleep(600);
}

async function talkTo(page, who) {
  await walkToInteract(page, 'npc', who);
  await page.keyboard.press('KeyE');
  await sleep(300);
}

test('round 2 end to end: new captain -> intro -> dice -> full tutorial -> first job -> reward (1440), then 390', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 1200000,
}, async (t) => {
  if (PROOF) mkdirSync(PROOF, { recursive: true });
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); });

  const context = await browser.newContext({ ...DESKTOP, viewport: { width: 1440, height: 900 } });
  await blockHub(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/api\.donavencrenshaw\.com/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  const shot = (name) => async () => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };
  const events = [];
  await page.exposeFunction('__e2eEvent', (type) => events.push(type));

  // 1. The intro: Begin, a couple of beats tapped through, then the rest skipped.
  await page.goto(`${server.origin}${HANGAR}?newgame=1`);
  await page.waitForFunction(() => window.__stardust);
  await page.evaluate(() => window.__stardust.bus.on('*', (type) => window.__e2eEvent(type)));
  await page.locator('.sy-intro .sy-begin').click();
  await page.locator('.sy-intro-words:not([hidden])').waitFor();
  await shot('e2e-01-intro')();
  for (let i = 0; i < 2; i++) { await page.locator('.sy-intro-words').click(); await sleep(400); }
  await page.locator('.sy-intro-skip').click();

  // 2. The licence: a face, a name, then the physics die once per stat (five), then sign.
  await page.locator('#hg-licence:not([hidden])').waitFor();
  assert.equal(await page.locator('#hg-licence .ui-roll-row').count(), 5, 'five stats');
  await page.locator('#hg-licence [data-look="p3"]').click();
  await page.locator('#vy-name').fill('Vela Quint');
  for (let i = 0; i < 5; i++) {
    await page.locator('#hg-roll').click();
    await page.waitForFunction((n) => document.querySelectorAll('#hg-licence .ui-roll-row.is-rolled').length >= n, i + 1, { timeout: 15000 });
  }
  await shot('e2e-02-licence-rolled')();
  await page.locator('#hg-sign').click();
  await page.locator('#hg-licence').waitFor({ state: 'hidden' });
  const signed = await readSave(page);
  assert.equal(signed.character.name, 'Vela Quint');
  assert.equal(Object.keys(signed.character.stats).length, 5);
  assert.equal(signed.character.look.portrait, 'p3');

  // 3. Walk to Chibby at the pad (held arrow keys), talk: the ship is yours.
  await untilStep(page, 'walk');
  const chibby = await page.evaluate(() => document.querySelector('.of-world').__world.npcAt('chibby'));
  await walkTo(page, chibby.x + 20, chibby.y + 60);
  await untilStep(page, 'ship');
  await shot('e2e-03-hangar-floor')();
  await talkTo(page, 'chibby');
  await untilStep(page, 'ralph');

  // 4. Ralph leads to the seam; mine it; fly to Dustfall; meet Garrity.
  await sleep(1500); // Ralph trots to the scrap pile
  await talkTo(page, 'ralph');
  await untilStep(page, 'mine');
  await walkToInteract(page, 'mine', 'scrap-seam');
  await page.keyboard.press('KeyE');
  await playMining(page);
  await untilStep(page, 'hop-garrity');
  assert.ok(((await readSave(page)).items.ore || 0) >= 3, 'the director paid the ore');
  await flyTo(page, 'dustfall', 'garrity-office', shot('e2e-04-hop'));
  await talkTo(page, 'garrity');
  await untilStep(page, 'mel');
  await shot('e2e-05-garrity')();
  await flyHome(page);

  // 5. Mel: talk, clear the range; fly to Alpha Relay; meet Hask.
  await talkTo(page, 'mel');
  await untilStep(page, 'shoot');
  await walkToInteract(page, 'range', 'range');
  await page.keyboard.press('KeyE');
  await playRange(page, shot('e2e-06-range'));
  await untilStep(page, 'hop-hask');
  await flyTo(page, 'alpha', 'hask-office');
  await talkTo(page, 'hask');
  await untilStep(page, 'edna');
  await flyHome(page);

  // 6. Edna: through the back room door, talk her round (an attempt on the dice), her lockbox; fly to Vey.
  await walkThroughDoor(page, 'backroom', 'edna-den');
  await talkTo(page, 'edna');
  await untilStep(page, 'talk');
  await page.locator('#hg-dialogue .ui-dlg-choice[data-kind="attempt"]').first().waitFor({ timeout: 30000 });
  assert.match(await page.locator('#hg-dialogue .ui-dlg-choice[data-kind="attempt"]').first().innerText(), /Roll 2d6 vs \d+: \d+%/);
  assert.equal(await page.locator('#hg-dialogue .ui-dlg-choice[data-kind="skill"][disabled]').count(), 1, 'the Trader option shows, locked, with its reason');
  await shot('e2e-07-edna-talk')();
  await page.locator('#hg-dialogue .ui-dlg-choice[data-kind="attempt"]').first().click();
  await page.locator('#hg-attempt.is-done').waitFor({ timeout: 10000 });
  await shot('e2e-08-attempt-dice')();
  await untilStep(page, 'puzzle');
  await walkToInteract(page, 'puzzle', 'lockbox');
  await page.keyboard.press('KeyE');
  await playLockbox(page);
  await untilStep(page, 'hop-vey');
  await walkThroughDoor(page, 'out', 'hangar');
  await flyTo(page, 'beacon', 'vey-lounge');
  await talkTo(page, 'vey');
  await untilStep(page, '__done', 90000);
  const done = await readSave(page);
  assert.ok(done.story.finished && !done.story.skipped, 'the tutorial finished, not skipped');
  for (const g of ['hask', 'vey', 'garrity']) assert.ok((done.rep[g] || 0) >= 5, `met ${g}`);
  for (const e of ['intro:done', 'captain:created', 'tutorial:arrived', 'met:chibby', 'met:ralph', 'tutorial:mined', 'explore:arrived', 'met:garrity', 'met:mel', 'tutorial:shot', 'met:hask', 'met:edna', 'roll:attempt', 'tutorial:solved', 'met:vey', 'story:done']) assert.ok(events.includes(e), `event ${e}`);

  // 7. Home, the job board, the first job, its reward.
  await flyHome(page);
  await walkToInteract(page, 'station', 'board');
  await page.keyboard.press('KeyE');
  await page.locator('#hg-sheet[data-open-station="board"]').waitFor();
  await page.locator('.vy-giver').first().waitFor();
  await shot('e2e-09-job-board')();
  const before = await readSave(page);
  let result = null;
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-quest="cold-run"] button').click();
    await page.locator('#pane-jobs .qs-quest-head').waitFor();
    result = await playJob(page);
    t.diagnostic(`job ${i + 1}: ${result.seen.join(', ')} -> ${/JOB DONE/.test(result.text) ? 'done' : 'failed'}`);
    if (/JOB DONE/.test(result.text)) break;
    await page.locator('#pane-jobs button.primary', { hasText: 'Back to the job board' }).click();
  }
  assert.match(result.text, /JOB DONE/, 'a job paid');
  await shot('e2e-10-job-reward')();
  const after = await readSave(page);
  assert.ok(after.money > before.money, `paid: ${before.money} -> ${after.money} credits`);
  assert.ok(after.quests.done['cold-run'], 'the job is on the record');
  assert.deepEqual(errors, [], 'no page errors');

  // 8. Phone, 390: the intro, the licence, the floor, a station and the dialogue box fit the screen.
  const phone = await browser.newContext({ ...PHONE });
  await blockHub(phone);
  const p2 = await phone.newPage();
  const shot2 = async (name) => { if (PROOF) await p2.screenshot({ path: `${PROOF}/${name}.png` }); };
  await p2.goto(`${server.origin}${HANGAR}?newgame=1`);
  await p2.locator('.sy-intro .sy-begin').tap();
  await p2.locator('.sy-intro-skip').tap();
  await p2.locator('#hg-licence:not([hidden])').waitFor();
  await p2.locator('#vy-name').fill('Rook');
  for (let i = 0; i < 5; i++) {
    await p2.locator('#hg-roll').tap();
    await p2.waitForFunction((n) => document.querySelectorAll('#hg-licence .ui-roll-row.is-rolled').length >= n, i + 1, { timeout: 15000 });
  }
  await shot2('e2e-11-phone-licence');
  await p2.locator('#hg-sign').tap();
  await p2.locator('#hg-licence').waitFor({ state: 'hidden' });
  await p2.waitForFunction(() => window.__stardust.store.get().story?.step === 'walk', null, { timeout: 30000 });
  const fits = await p2.evaluate(() => {
    const vw = innerWidth;
    const over = [...document.querySelectorAll('#hg-objective, #hg-dialogue, .vy-top')].filter((n) => !n.hidden && n.getBoundingClientRect().width > 0).filter((n) => { const r = n.getBoundingClientRect(); return r.left < -1 || r.right > vw + 1; }).map((n) => n.id || n.className);
    return { over, scroll: document.documentElement.scrollWidth > vw + 1 };
  });
  assert.deepEqual(fits, { over: [], scroll: false }, 'nothing spills sideways at 390');
  assert.ok(await p2.locator('.of-world canvas').isVisible(), 'the floor shows');
  await shot2('e2e-12-phone-floor');
  await openStation(p2, 'quarters');
  const sheet = await p2.locator('#hg-sheet').boundingBox();
  assert.ok(sheet.width <= 391 && sheet.y >= 0, 'the station sheet is a bottom sheet on the phone');
  await shot2('e2e-13-phone-bunk');
  await phone.close();
});

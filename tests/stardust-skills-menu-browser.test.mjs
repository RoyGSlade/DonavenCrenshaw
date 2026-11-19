// The skills menu in a real browser, at 1440x900 and 390x844 (skills-menu lane, 2026-11-18).
// The new game's datapad, Skills page: the rail, the hero ring, the three path cards, pending and
// Lock in, the risk and train panels, the phone layout, the keyboard, the FLUX kit and its fallback.
// Opt-in; run it alone, capped, under the browser lock:
//   PROOF_DIR=~/Desktop/lhc-lanes/stardust/launch/skillsbuild/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-skills-menu-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';
import { signOnCaptain } from '../scripts/stardust-hangar-kit.mjs';

const HANGAR = '/projects/Space-Shooter/voyage/?newgame=1&start=hangar&dev=1';
const SAVE_KEY = 'stardust.voyage.v1';
const PROOF = process.env.PROOF_DIR || null;
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };
const readSave = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const PROFILES = [
  ['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];
// The design's sample captain (Main.dc.html): Repair 4 with 2 points spent, the rest as drawn, last scanned a while ago.
const SEED = { levels: { shooting: 3, piloting: 2, stealth: 1, hacking: 2, repair: 4, crafting: 1, social: 3, navigation: 1 },
  points: { shooting: { reload: 1, ammo: 1 }, piloting: { handling: 1 }, hacking: { time: 1 }, repair: { time: 1, size: 1 }, social: { persuade: 1, haggle: 1 } } };

async function seedCaptain(page) {
  await page.evaluate(async ({ SEED }) => {
    const { XP_CURVE, scan } = await import('/projects/Space-Shooter/voyage/skillSave.js');
    const store = window.__stardust.store;
    store.update((s) => {
      const into = { shooting: 22, piloting: 31, stealth: 9, hacking: 18, repair: 66, crafting: 4, social: 40, navigation: 6 };
      const xp = Object.fromEntries(Object.entries(SEED.levels).map(([id, l]) => [id, XP_CURVE[l - 1] + into[id]]));
      const c = { ...s.character, levels: SEED.levels, xp, points: SEED.points };
      // Scanned with Hacking as it is now, and the others 22/31/... XP short: what a death would cost.
      const scanned = scan({ ...c, xp: { ...xp, hacking: xp.hacking, repair: xp.repair - 66, shooting: xp.shooting - 22, piloting: xp.piloting - 31, stealth: xp.stealth - 9, crafting: xp.crafting - 4, social: xp.social - 12, navigation: xp.navigation - 6 } }, 5);
      return { ...s, money: 200, character: { ...c, scan: scanned.scan } };
    });
  }, { SEED });
}

test('the skills menu: rail, ring, notches, pending and lock in, risk, keyboard, kit and fallback, at both sizes', { skip, timeout: 280000 }, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const [name, profile] of PROFILES) {
    const phone = name === 'phone';
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/voyage/')) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`${server.origin}${HANGAR}`);
    await signOnCaptain(page, 'Vela Quint');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await seedCaptain(page);
    await page.evaluate(() => window.__stardust.pad.open('skills'));
    await page.locator('.dp-pad[data-page="skills"]').waitFor();
    const tile = (id) => page.locator(`[data-skill-tile="${id}"]`);
    const notch = (ci, j) => page.locator(`.sk-cat[data-cat-index="${ci}"] .sk-notch[data-n="${j}"]`);
    const rootVar = (v) => page.evaluate((x) => getComputedStyle(document.querySelector('.sk-page')).getPropertyValue(x).trim(), v);

    // The rail: eight skills, Repair picked, badges where points are free.
    assert.equal(await page.locator('.sk-tile').count(), 8);
    assert.equal(await tile('repair').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.sk-title').innerText(), 'Repair');
    assert.equal((await tile('repair').locator('.sk-badge').innerText()).trim(), '+2');
    assert.equal(await page.locator('[data-chip]').innerText(), '2 points to spend');
    assert.equal(await page.locator('[data-total]').getAttribute('data-count'), '9');
    assert.equal(await page.locator('.sk-ring-svg path.on').count(), 4, 'a 4 on the ring lights four arcs');
    assert.equal(await rootVar('--sk'), '#5EE6E6');
    // The kit's emblem is the picture on the tile; the page took the FLUX files.
    assert.equal(await page.locator('.sk-page.has-notch-art.has-ring-art.has-card-art').count(), 1);
    const emblem = await tile('repair').locator('img.sk-emblem').evaluate((i) => ({ w: i.naturalWidth, kind: i.dataset.art }));
    assert.ok(emblem.w > 0 && emblem.kind === 'lit');
    assert.equal(await tile('piloting').locator('img.sk-emblem').getAttribute('data-art'), 'dim');
    await page.waitForTimeout(500);
    await shot(page, `skillsmenu-${name}-1-repair-selected`);

    // Real numbers: the same words the mini-game's setup gives.
    assert.match(await page.locator('.sk-cat[data-cat-index="0"] [data-now]').innerText(), /deeper pool: \+6 s before a leak floods the line \(126 s\)/);
    assert.match(await page.locator('.sk-cat[data-cat-index="1"] [data-now]').innerText(), /5 x 5 board|\d x \d board/);

    // Re-tint: pick Piloting and the whole page changes colour.
    await tile('piloting').click();
    await page.waitForFunction(() => document.querySelector('.sk-page').dataset.skill === 'piloting');
    assert.equal(await rootVar('--sk'), '#4FC3F7');
    assert.equal(await page.locator('.sk-title').innerText(), 'Piloting');
    assert.equal(await page.locator('.sk-hero-eyebrow').innerText(), 'SKILL · 2 OF 8');
    assert.match(await page.locator('[data-train-game]').innerText(), /Touchdown/);
    await tile('repair').click();

    // A notch fills as pending, with a pulse; the save does not change until Lock in.
    await notch(2, 0).click();
    assert.equal(await notch(2, 0).getAttribute('data-state'), 'pending');
    assert.equal(await notch(2, 0).evaluate((n) => n.classList.contains('is-fresh')), true, 'the pulse is running');
    await page.waitForTimeout(160);
    assert.equal(await page.locator('[data-chip]').innerText(), '1 pending, lock them in');
    await shot(page, `skillsmenu-${name}-2-notch-pulsing`);
    const nb = await notch(2, 3).evaluate((n) => { const r = n.getBoundingClientRect(), c = n.closest('.sk-cat').getBoundingClientRect(); return { h: r.height, w: r.width, card: c.width }; });
    assert.ok(nb.h >= 36, `a notch is a big target: ${JSON.stringify(nb)}`);
    const track = await page.locator('.sk-cat[data-cat-index="2"] .sk-track').evaluate((n) => n.getBoundingClientRect().width);
    assert.ok(track >= (phone ? 150 : nb.card * 0.8), `the track spans the card: ${track} of ${nb.card}`);
    await notch(2, 1).click();
    assert.equal(await page.locator('[data-chip]').innerText(), '2 pending, lock them in');
    assert.equal(await page.locator('[data-lock]').innerText(), 'Lock in 2 points');
    assert.deepEqual((await readSave(page)).character.points.repair, { time: 1, size: 1 }, 'pending is not saved');
    assert.match(await page.locator('.sk-cat[data-cat-index="2"] [data-now]').innerText(), /\+8 quality/);
    await page.waitForTimeout(500);
    await shot(page, `skillsmenu-${name}-3-pending-vs-locked`);
    // "-" takes back only pending; a locked notch answers with the bunk.
    await page.locator('.sk-cat[data-cat-index="2"] [data-minus]').click();
    assert.equal(await notch(2, 1).getAttribute('data-state'), 'empty');
    await notch(0, 0).click();
    assert.equal(await notch(0, 0).getAttribute('data-state'), 'locked');
    assert.match(await page.locator('[data-note]').innerText(), /bunk/);
    await page.locator('.sk-cat[data-cat-index="0"] [data-minus]').click({ force: true });
    assert.equal(await notch(0, 0).getAttribute('data-state'), 'locked', '"-" never takes a locked point');
    // No free point left to spend on Time (both free points are pending in Patch quality again).
    await notch(2, 1).click();
    await page.locator('.sk-cat[data-cat-index="0"] [data-plus]').click({ force: true });
    assert.equal(await notch(0, 1).getAttribute('data-state'), 'empty');
    assert.equal(await page.locator('.sk-cat[data-cat-index="0"] [data-plus]').getAttribute('aria-disabled'), 'true');
    // Undo clears pending without a save; then spend one again and lock it in.
    await page.locator('[data-undo]').click();
    assert.equal(await notch(2, 0).getAttribute('data-state'), 'empty');
    await page.locator('.sk-cat[data-cat-index="2"] [data-plus]').click();
    await page.locator('[data-lock]').click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).character.points.repair.quality === 1, SAVE_KEY);
    assert.equal(await notch(2, 0).getAttribute('data-state'), 'locked');
    assert.equal(await page.locator('[data-lock]').isHidden(), true);
    assert.equal(await page.locator('[data-chip]').innerText(), '1 point to spend', 'locked: the pending words are gone');
    assert.match(await page.locator('[data-bunk-line]').innerText(), /nap at your bunk.*10 credits a point/);
    await page.waitForTimeout(500);
    await shot(page, `skillsmenu-${name}-4-after-lock-in`);

    // If you die now: the risk panel names this skill's loss; a scanned skill is safe.
    assert.match(await page.locator('[data-risk-line]').innerText(), /You lose 66 Repair XP/);
    await tile('hacking').click();
    assert.match(await page.locator('[data-risk-line]').innerText(), /scanned and safe/);
    await tile('repair').click();
    await page.waitForTimeout(450);
    await shot(page, `skillsmenu-${name}-5-risk-and-train`);
    // Shooting has no mini-game: the train button says so.
    await tile('shooting').click();
    assert.match(await page.locator('[data-train-label]').innerText(), /No mini-game/);
    await tile('repair').click();

    // Keyboard: arrows move between skills (and re-tint), then into the notches; Enter spends.
    await tile('repair').focus();
    await page.keyboard.press(phone ? 'ArrowRight' : 'ArrowDown');
    assert.equal(await page.locator('.sk-page').getAttribute('data-skill'), 'crafting');
    await page.keyboard.press(phone ? 'ArrowLeft' : 'ArrowUp');
    assert.equal(await page.locator('.sk-page').getAttribute('data-skill'), 'repair');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.skillTile), 'repair');
    assert.equal(await page.locator('.dp-pad').getAttribute('data-page'), 'skills', 'arrows did not flip the datapad page');
    await page.locator('.sk-cat[data-cat-index="2"] .sk-notch[data-n="1"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.n), '2');
    await page.keyboard.press('ArrowDown'); // already the last path: stays put
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.sk-cat').dataset.catIndex), '1');
    await page.keyboard.press('Escape');
    await page.locator('.dp-scrim').waitFor({ state: 'hidden' });
    await page.evaluate(() => window.__stardust.pad.open('skills'));
    await page.locator('.dp-pad[data-page="skills"]').waitFor();

    // Phone: nothing sideways, every control is a 44px target (after the pad has finished sliding out of the bag).
    await page.waitForTimeout(800);
    const fit = await page.evaluate(() => { const w = document.querySelector('.sk-wrap'); return { over: w.scrollWidth - w.clientWidth, doc: document.documentElement.scrollWidth - innerWidth }; });
    assert.ok(fit.over <= 1 && fit.doc <= 1, `no sideways scroll (${JSON.stringify(fit)})`);
    if (phone) {
      for (const sel of ['.sk-tile', '.sk-minus', '.sk-plus', '.sk-scan', '.sk-train']) {
        const boxes = await page.locator(sel).evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
        assert.ok(boxes.length && boxes.every(([w, h]) => w >= 44 && h >= 44), `${sel} is a 44px target: ${JSON.stringify(boxes.slice(0, 3))}`);
      }
      assert.equal(await page.locator('.sk-rail').evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' ').length), 4, 'the 4 x 2 grid');
    }
    await page.locator('.dp-screen').evaluate((n) => n.scrollTo?.(0, 0));
    if (phone) { await page.locator('.sk-wrap').evaluate((n) => n.scrollTo(0, n.scrollHeight)); await page.waitForTimeout(150); await shot(page, `skillsmenu-${name}-6-bottom-footer`); }

    // The fallback: with no kit pictures the design's own SVG emblems and CSS notches draw.
    const fb = await page.evaluate(async () => {
      const { createSkillsPage } = await import('/projects/Space-Shooter/voyage/skills/skillsPage.js');
      const host = document.createElement('div'); document.body.append(host);
      const p = createSkillsPage({ root: host, store: window.__stardust.store, art: () => null });
      p.render();
      const out = { svg: host.querySelectorAll('svg.sk-emblem-line').length, img: host.querySelectorAll('img.sk-emblem').length, art: host.querySelector('.sk-page').className };
      host.remove();
      return out;
    });
    // With the Hub on, the bunk line says the nap cannot take points back yet.
    const hubLine = await page.evaluate(async () => {
      const { createSkillsPage } = await import('/projects/Space-Shooter/voyage/skills/skillsPage.js');
      const { createSkillSave } = await import('/projects/Space-Shooter/voyage/skillSave.js');
      const real = createSkillSave({ store: window.__stardust.store, economy: { on: false } });
      const fake = { get hub() { return true; }, view: () => real.view(), spend: (...a) => real.spend(...a), scan: () => real.scan() };
      const host = document.createElement('div'); document.body.append(host);
      createSkillsPage({ root: host, store: window.__stardust.store, skillSave: fake }).render();
      const line = host.querySelector('[data-bunk-line]').textContent; host.remove(); return line;
    });
    assert.match(hubLine, /Guild bank/);
    assert.ok(fb.svg >= 8 && fb.img === 0 && !/has-notch-art|has-ring-art|has-card-art/.test(fb.art), JSON.stringify(fb));
    assert.deepEqual(errors, [], 'no page errors');
    await context.close();
  }
});

test('no captain yet: the Skills page asks for the licence, like the Captain page', { skip, timeout: 120000 }, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await blockHub(context);
  const page = await context.newPage();
  await page.goto(`${server.origin}${HANGAR}`);
  await page.locator('.sy-intro-skipall').click();
  await page.evaluate(() => window.__stardust.pad.show('skills'));
  assert.match(await page.locator('.dp-page-skills .dp-empty').textContent(), /Nobody to show yet/);
  assert.equal(await page.locator('.dp-page-skills .sk-wrap').evaluate((n) => n.hidden), true);
  await context.close();
});

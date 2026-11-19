// Real-time stealth in the REAL page: the workbench's patrol yard (?newgame=1&start=workbench, then the yard door), at 1440x900 and
// 390x844. Real keys and a real thumbstick: Ctrl sneaks, Shift runs, E takes a guard down from behind. Live cones clipped by props,
// fog of war (a guard in the fog is not drawn), the meters in real time (1.5 s inspect, 3 s alarm for everyone), noise, takedowns,
// being caught, the console and its XP, and the yard is shut without the flag. With PROOF_DIR set it writes the frame sequence.
// Opt-in, one at a time, under the browser lock:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/stealth2/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-stealth2-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';
import { compileMap } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { YARD_DEF } from '../projects/Space-Shooter/voyage/workbench/yard.js';
import { planStealthRoute } from '../scripts/stardust-stealth-plan.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const only = process.env.ONLY ? process.env.ONLY.split('|') : null;
const YARD = compileMap(YARD_DEF);
const T = 48;
const POSTS = Object.fromEntries(YARD_DEF.stealth.guards.map((g) => [g.id, { x: (g.path[0][0] + 0.5) * 48, y: (g.path[0][1] + 0.5) * 48 }]));

async function bootRoom(page, origin, extra = '') {
  await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
  await page.goto(`${origin}${V}?newgame=1&start=workbench&seed=7${extra}`);
  await page.waitForFunction(() => window.__stardust?.workbench && window.__stardust.onfoot?.world);
  await page.waitForTimeout(900);
}
const world = (page, fn, arg) => page.evaluate(`(() => { const w = window.__stardust.onfoot.world; const st = w.stealth; return (${fn.toString()})(w, st, ${JSON.stringify(arg ?? null)}); })()`);
const key = async (page, code, ms) => { await page.keyboard.down(code); await page.waitForTimeout(ms); await page.keyboard.up(code); };
const goYard = async (page) => {
  await world(page, (w) => w.go('workbench-yard', 'from-bay'));
  await page.waitForFunction(() => window.__stardust.onfoot.world.map.id === 'workbench-yard' && window.__stardust.onfoot.world.stealth);
  await page.waitForTimeout(450);
};
/** Keep one guard (g2, the gap sentry) as the only one near; park the others facing a wall far away, still. Faces: 'up' | 'down' | 'left' | 'right'. */
const isolate = (page, { face = 'down', keep = 'g2' } = {}) => world(page, (w, st, a) => {
  const ang = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
  const park = { g1: [2.5, 2.5, Math.PI], g2: [24.5, 14.5, 0], g3: [25.5, 14.5, 0] };
  for (const g of st.sim.guards) {
    g.state = 'patrol'; g.meter = 0; g.route = []; g.wait = 0; g.found = false;
    if (g.id === a.keep) { const post = a.posts[g.id]; g.sweep = 0; g.path = [{ x: post.x, y: post.y }]; g.pi = 0; g.x = post.x; g.y = post.y; g.base = g.angle = ang[a.face]; }
    else { const [tx, ty, an] = park[g.id] || park.g3; g.sweep = 0; g.x = (tx) * 48; g.y = ty * 48; g.path = [{ x: g.x, y: g.y }]; g.pi = 0; g.base = g.angle = an; }
  }
  st.sim.alarm.on = false; st.sim.caught = false; st.sim.stats.alarms = 0; st.sim.stats.inspects = 0; st.sim.stats.seen = 0; st.sim.stats.takedowns = 0; st.sim.stats.caught = 0;
}, { face, keep, posts: POSTS });
const guard = (page, id) => world(page, (w, st, a) => { const g = st.sim.guards.find((x) => x.id === a); return { x: g.x, y: g.y, angle: g.angle, state: g.state, meter: g.meter }; }, id);
const place = (page, x, y, angle) => world(page, (w, st, a) => w.place(a.x, a.y, a.angle), { x, y, angle });
/** Run until `cond` (an expression over w, st) is true, then pause the world there (so a screenshot catches that very moment). */
const hold = (page, cond) => page.evaluate((c) => new Promise((resolve) => {
  const w = window.__stardust.onfoot.world, st = w.stealth, f = new Function('w', 'st', `return (${c});`);
  const t0 = performance.now();
  const tick = () => { if (f(w, st)) { w.pause(); resolve(true); } else if (performance.now() - t0 > 9000) resolve(`timed out waiting for ${c}: ${JSON.stringify(st.sim.guards.map((g) => [g.id, g.state, +g.meter.toFixed(2)]))} paused=${'?'}`); else requestAnimationFrame(tick); };
  tick();
}), cond).then((r) => { assert.equal(r, true, String(r)); });
const resume = (page) => world(page, (w) => w.resume());
const freezeShot = async (page, name, shot) => { await world(page, (w) => w.pause()); await shot(name); await world(page, (w) => w.resume()); };

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`stealth yard, ${name}`, { skip, timeout: 560000 }, async (t) => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    let frame = 0;
    const shot = async (n) => { await page.waitForTimeout(250); if (PROOF) await page.screenshot({ path: `${PROOF}/${String(++frame).padStart(2, '0')}-${n}-${name}.png` }); };
    const sub = (title, fn) => (!only || only.includes(title) ? t.test(title, fn) : null);
    try {
      await sub('closed without the flag; with the flag but not the workbench, no yard is registered', async () => {
        const p2 = await context.newPage();
        await p2.goto(`${server.origin}${V}?start=workbench`);
        assert.equal(await p2.locator('#vy-closed').isVisible(), true);
        await p2.close();
        const p3 = await context.newPage();
        await p3.goto(`${server.origin}${V}?newgame=1`);
        await p3.waitForFunction(() => window.__stardust?.onfoot?.world);
        const r = await p3.evaluate(async () => ({ map: __stardust.onfoot.world.map.id, st: __stardust.onfoot.world.stealth, hud: document.querySelectorAll('.of-stealth').length, def: (await import('/projects/Space-Shooter/voyage/maps/index.js')).mapDef('workbench-yard') }));
        assert.notEqual(r.map, 'workbench-yard'); assert.equal(r.st, null); assert.equal(r.hud, 0); assert.equal(r.def, null, 'the yard is not even registered');
        await p3.close();
      });

      await bootRoom(page, server.origin);
      await sub('the bay door walks into the yard and the yard door walks back; stealth lives only in the yard', async () => {
        const bay = await world(page, (w, st) => ({ map: w.map.id, st: st, hud: document.querySelectorAll('.of-stealth').length, doors: w.map.doors.map((d) => d.to) }));
        assert.deepEqual(bay, { map: 'workbench', st: null, hud: 0, doors: ['workbench-yard'] });
        await place(page, 22.5 * T + 0, 15.3 * T, -Math.PI / 2 + Math.PI);
        await page.waitForTimeout(700); // the door ignores you for half a second after arriving
        await page.keyboard.down('KeyS');
        await page.waitForFunction(() => window.__stardust.onfoot.world.map.id === 'workbench-yard', null, { timeout: 5000 });
        await page.keyboard.up('KeyS');
        await page.waitForTimeout(500);
        const y = await world(page, (w, st) => ({ st: !!st, hud: document.querySelectorAll('.of-stealth').length, guards: st.sim.guards.length, p: [Math.round(w.player.x / 48), Math.round(w.player.y / 48)] }));
        assert.equal(y.st, true); assert.equal(y.hud, 1); assert.equal(y.guards, 3);
        assert.ok(y.p[0] <= 5 && y.p[1] >= 14, `arrived at the way in (${y.p})`);
        await shot('1-yard-start');
        await place(page, 3.5 * T, 15.3 * T, Math.PI / 2);
        await page.waitForTimeout(700);
        await page.keyboard.down('KeyS');
        await page.waitForFunction(() => window.__stardust.onfoot.world.map.id === 'workbench', null, { timeout: 5000 });
        await page.keyboard.up('KeyS');
        const back = await world(page, (w, st) => ({ st, hud: document.querySelectorAll('.of-stealth').length }));
        assert.deepEqual(back, { st: null, hud: 0 });
        await goYard(page);
      });

      await sub('sneaking along cover: a bot on the real keys walks the planned route to the console under the cones, no inspect, no alarm', async () => {
        const goal = YARD.interacts.find((i) => i.id === 'wb-yard-goal');
        const route = planStealthRoute(YARD, { from: YARD.spawns['from-bay'], to: { x: goal.x, y: goal.y + 40 } });
        assert.ok(route, 'a clean route exists');
        await world(page, (w, st) => { st.reset(); w.place(3.5 * 48, 15.5 * 48, -Math.PI / 2); });
        await page.waitForTimeout(300);
        await page.evaluate((route) => {
          const w = window.__stardust.onfoot.world, st = w.stealth, sim = st.sim, t0 = sim.time, held = new Set();
          const press = (code, on) => { if (on) held.add(code); else if (held.has(code)) held.delete(code); else return; window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true })); }; // keys are re-sent every frame: a pause clears the input's keys
          const at = (tt) => { if (tt <= route[0].t) return route[0]; for (let i = 1; i < route.length; i++) if (tt <= route[i].t) { const a = route[i - 1], b = route[i], f = (tt - a.t) / (b.t - a.t || 1); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; } return route[route.length - 1]; };
          const end = route[route.length - 1].t;
          window.__bot = { done: false };
          press('ControlLeft', true);
          const tick = () => {
            const tt = sim.time - t0, want = at(tt + 0.25), p = w.player, dx = want.x - p.x, dy = want.y - p.y;
            press('ControlLeft', true); press('KeyD', dx > 9); press('KeyA', dx < -9); press('KeyS', dy > 9); press('KeyW', dy < -9);
            window.__bot.t = tt;
            if (tt >= end + 0.4 || sim.alarm.on) { for (const c of [...held]) press(c, false); Object.assign(window.__bot, { done: true, alarms: sim.stats.alarms, inspects: sim.stats.inspects, seen: sim.stats.seen, p: [p.x, p.y] }); return; }
            requestAnimationFrame(tick);
          };
          tick();
        }, route);
        const end = route[route.length - 1].t;
        for (const [i, f] of [0.22, 0.5, 0.78].entries()) {
          await page.waitForFunction((f) => window.__bot.t >= f || window.__bot.done, f * end, { timeout: 60000 });
          await freezeShot(page, `sneak-${i + 1}`, shot);
        }
        await page.waitForFunction(() => window.__bot.done, null, { timeout: 90000 });
        const log = await page.evaluate(() => window.__bot);
        assert.equal(log.alarms, 0, 'no alarm on the careful route'); assert.equal(log.inspects, 0, 'no guard came to look');
        const goalDist = Math.hypot(log.p[0] - goal.x, log.p[1] - (goal.y + 40));
        assert.ok(goalDist < 70, `the bot reached the console (${Math.round(goalDist)} px away)`);
        await shot('at-the-console');
        await world(page, (w, st) => { st.reset(); w.place(3.5 * 48, 14.5 * 48, 0); });
      });

      await sub('gaits: Ctrl sneaks, Shift runs, plain walks; the readout says which; a phone stick picks by strength', async () => {
        await isolate(page);
        const speed = async (code) => {
          await place(page, 3.5 * T, 14.5 * T, 0); await page.waitForTimeout(150);
          const x0 = await world(page, (w) => w.player.x);
          if (code) await page.keyboard.down(code);
          await page.keyboard.down('KeyD'); await page.waitForTimeout(100);
          const word = await page.locator('.of-st-gait').innerText();
          await page.waitForTimeout(600);
          const x1 = await world(page, (w) => w.player.x);
          await page.keyboard.up('KeyD'); if (code) await page.keyboard.up(code);
          return { dx: x1 - x0, word };
        };
        const sneak = await speed('Control'), walk = await speed(null), run = await speed('Shift');
        assert.equal(sneak.word, 'SNEAK'); assert.equal(walk.word, 'WALK'); assert.equal(run.word, 'RUN');
        assert.ok(sneak.dx > 15 && sneak.dx < walk.dx * 0.65, `sneak is slow (${sneak.dx})`);
        assert.ok(run.dx > walk.dx * 1.3, `run is fast (${run.dx} vs ${walk.dx})`);
        if (phone) {
          await place(page, 3.5 * T, 14.5 * T, 0);
          const stick = async (f) => page.evaluate((f) => { const b = document.querySelector('.of-stick-left'), r = b.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const ev = (type, x) => b.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 5, clientX: x, clientY: cy })); ev('pointerdown', cx + 46 * f); ev('pointermove', cx + 46 * f); }, f);
          const release = () => page.evaluate(() => { const b = document.querySelector('.of-stick-left'); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5 })); });
          await stick(0.3); await page.waitForTimeout(250); assert.equal(await page.locator('.of-st-gait').innerText(), 'SNEAK'); await release();
          await stick(0.7); await page.waitForTimeout(250); assert.equal(await page.locator('.of-st-gait').innerText(), 'WALK'); await release();
          await stick(1.0); await page.waitForTimeout(250); assert.equal(await page.locator('.of-st-gait').innerText(), 'RUN'); await release();
        }
      });

      await sub('fog of war: a guard in the fog is not drawn (not even a pixel of it), the same guard in sight is', async () => {
        await isolate(page, { face: 'down' });
        const g = await guard(page, 'g2');
        const lum = (at) => world(page, (w, st, a) => { const s = w.screenOf(a.x, a.y), dpr = w.canvas.width / w.canvas.clientWidth, c = w.canvas.getContext('2d'); const d = c.getImageData(Math.round(s.x * dpr) - 8, Math.round(s.y * dpr) - 8, 16, 16).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; return sum / (d.length / 4) / 3; }, at);
        // Far away, behind the wall: in the fog.
        await place(page, 3.5 * T, 14.5 * T, 0); await page.waitForTimeout(400);
        assert.equal(await world(page, (w, st, a) => st.sim.isVisible(a.x, a.y), g), false, 'the guard is outside your sight');
        assert.equal(await world(page, (w, st) => st.guardBodies(w.canvas.getContext('2d'), 0).length), 0, 'and is not even in the draw list');
        await freezeShot(page, 'fog-hidden', shot);
        const dark = await lum(g);
        // Next to it, in the open.
        await place(page, g.x - 3 * T, g.y + 2 * T, 0); await page.waitForTimeout(400);
        await world(page, (w, st) => { st.sim.guards.find((x) => x.id === 'g2').meter = 0; });
        assert.equal(await world(page, (w, st, a) => st.sim.isVisible(a.x, a.y), g), true);
        assert.equal(await world(page, (w, st) => st.guardBodies(w.canvas.getContext('2d'), 0).length), 1);
        await page.waitForTimeout(150);
        const lit = await lum(g);
        assert.ok(dark < 28, `the fog is dark (${dark.toFixed(1)})`);
        assert.ok(lit > dark + 25, `the guard in sight is clearly brighter than the fog (${lit.toFixed(1)} vs ${dark.toFixed(1)})`);
        await freezeShot(page, 'fog-visible', shot);
      });

      await sub('the cone is clipped by a crate: light beside it, a shadow behind it, on the real floor', async () => {
        await isolate(page, { face: 'right', keep: 'g1' });
        // Build the claim from the page's own geometry: a point right behind any prop in the cone is outside the drawn polygon.
        const r = await page.evaluate(async () => {
          const { viewPolygon, pointInPolygon } = await import('/projects/Space-Shooter/voyage/onfoot/rules/stealth.js');
          const w = window.__stardust.onfoot.world, st = w.stealth, g = st.sim.guards.find((x) => x.id === 'g1');
          g.x = 3.5 * 48; g.y = 12.5 * 48; g.angle = g.base = 0; g.path = [{ x: g.x, y: g.y }]; g.pi = 0;
          const c = st.sim.coneOf(g);
          const poly = viewPolygon(w.map.solids, g.x, g.y, { angle: 0, half: c.half, radius: c.len });
          const open = viewPolygon(w.map.solids.filter((s) => !s.prop && s.prop !== 0), g.x, g.y, { angle: 0, half: c.half, radius: c.len });
          const crate = w.map.props.find((p) => p.art === 'cargo-crate' && p.at[0] === 5 && p.at[1] === 13); // 1.5 tiles ahead, a row below
          return { crate: !!crate, behindIn: pointInPolygon(poly, 7.5 * 48, 13.5 * 48), besideIn: pointInPolygon(poly, 7.5 * 48, 12.5 * 48), openBehindIn: pointInPolygon(open, 7.5 * 48, 13.5 * 48), n: poly.length };
        });
        assert.equal(r.crate, true); assert.equal(r.behindIn, false, 'behind the crate: shadow'); assert.equal(r.besideIn, true, 'beside it: light'); assert.equal(r.openBehindIn, true, 'without the crate it would be lit');
        await place(page, 6.5 * T, 11.5 * T, 0); await page.waitForTimeout(500);
        await freezeShot(page, 'cone-clipped-by-crate', shot);
      });

      await sub('meters in real time: 1.5 s in a cone inspects your spot, 3 s alerts every guard', async () => {
        await isolate(page, { face: 'down' });
        const g = await guard(page, 'g2');
        await place(page, g.x, g.y + 3 * T, -Math.PI / 2);
        const seen = () => world(page, (w, st) => ({ seen: st.sim.stats.seen, states: st.sim.guards.map((x) => x.state), meter: st.sim.guards.find((x) => x.id === 'g2').meter, alarm: st.sim.alarm.on, at: st.sim.guards.find((x) => x.id === 'g2').target }));
        await hold(page, "st.sim.guards.find((x) => x.id === 'g2').meter >= 1.0");
        const mid = await seen();
        assert.ok(mid.meter >= 1.0 && mid.meter < 1.3 && mid.states.every((x) => x === 'patrol'), `the meter is filling and nobody has moved yet (${mid.meter.toFixed(2)})`);
        await shot('meter-filling'); await resume(page);
        await hold(page, "st.sim.guards.find((x) => x.id === 'g2').state === 'inspect'");
        const insp = await seen();
        assert.ok(Math.abs(insp.seen - 1.5) < 0.12, `inspect at 1.5 s of exposure (${insp.seen})`);
        assert.equal(insp.states.filter((x) => x === 'inspect').length, 1, 'only that guard inspects');
        assert.ok(!insp.alarm, 'and there is no alarm yet');
        await shot('inspect'); await resume(page);
        await hold(page, 'st.sim.alarm.on');
        const alarm = await seen();
        assert.ok(Math.abs(alarm.seen - 3) < 0.12, `alarm at 3 s of exposure (${alarm.seen})`);
        assert.deepEqual(alarm.states, ['alert', 'alert', 'alert'], 'every guard is alerted, even the two that never saw you');
        await shot('alert'); await resume(page);
      });

      await sub('the alarm: guards converge on you, and one that reaches you catches you and puts you back at the door', async () => {
        await page.waitForFunction(() => window.__stardust.onfoot.world.stealth.sim.caught, null, { timeout: 15000 });
        await page.waitForFunction(() => !window.__stardust.onfoot.world.stealth.sim.caught && window.__stardust.onfoot.world.stealth.sim.stats.caught === 0, null, { timeout: 6000 });
        const r = await world(page, (w, st) => ({ alarm: st.sim.alarm.on, states: st.sim.guards.map((g) => g.state), p: [w.player.x / 48, w.player.y / 48] }));
        assert.equal(r.alarm, false); assert.ok(r.states.every((s) => s === 'patrol'));
        assert.ok(r.p[0] < 5 && r.p[1] > 13, `back at the way in (${r.p})`);
      });

      await sub('noise: a sneak behind a guard is not heard, a run is: it turns round to look', async () => {
        await isolate(page, { face: 'up' });
        const g = await guard(page, 'g2');
        await place(page, g.x, g.y + 2.7 * T, Math.PI / 2); await page.waitForTimeout(300);
        await page.keyboard.down('Control'); await key(page, 'KeyS', 500); await page.keyboard.up('Control');
        let s = await guard(page, 'g2');
        assert.equal(s.state, 'patrol', 'a sneak at 2.7 tiles is not heard');
        await place(page, g.x, g.y + 2.7 * T, Math.PI / 2); await page.waitForTimeout(200);
        await page.keyboard.down('Shift'); await page.keyboard.down('KeyS');
        await page.waitForFunction(() => window.__stardust.onfoot.world.stealth.sim.guards.find((x) => x.id === 'g2').state === 'look', null, { timeout: 3000 });
        await page.waitForTimeout(250);
        await freezeShot(page, 'noise-run-heard', shot);
        await page.keyboard.up('KeyS'); await page.keyboard.up('Shift');
        s = await guard(page, 'g2');
        assert.ok(Math.abs(Math.abs(s.angle) - Math.PI / 2) > 0.3 || s.state === 'look', 'it turned to look');
        assert.equal(await world(page, (w, st) => st.sim.stats.inspects + st.sim.stats.alarms, null), 0, 'a heard step fills no meter');
      });

      await sub('takedown: from behind with E, silent; not from the front', async () => {
        await isolate(page, { face: 'up' });
        let g = await guard(page, 'g2');
        await place(page, g.x, g.y - 38, Math.PI / 2); await page.waitForTimeout(400);
        assert.notEqual(await world(page, (w) => w.target?.kind ?? null), 'takedown', 'in front of the guard there is no takedown');
        await isolate(page, { face: 'up' });
        await place(page, g.x, g.y + 38, -Math.PI / 2); await page.waitForTimeout(500);
        assert.equal(await world(page, (w) => w.target?.kind ?? null), 'takedown', 'behind it the prompt appears');
        assert.match(await page.locator('.of-prompt-text').innerText(), /takedown/i);
        if (phone) assert.match(await page.locator('.of-tbtn-use').innerText(), /Takedown/);
        await freezeShot(page, 'takedown-prompt', shot);
        if (phone) await page.locator('.of-tbtn-use').dispatchEvent('pointerdown'); else await page.keyboard.press('KeyE');
        await page.waitForFunction(() => window.__stardust.onfoot.world.stealth.sim.guards.find((x) => x.id === 'g2').state === 'down', null, { timeout: 3000 });
        const r = await world(page, (w, st) => ({ takedowns: st.sim.stats.takedowns, alarm: st.sim.alarm.on, others: st.sim.guards.filter((x) => x.id !== 'g2').map((x) => x.state), meters: st.sim.guards.map((x) => x.meter) }));
        assert.equal(r.takedowns, 1); assert.equal(r.alarm, false); assert.deepEqual(r.others, ['patrol', 'patrol']);
        await page.waitForTimeout(150);
        await freezeShot(page, 'takedown-done', shot);
        g = await guard(page, 'g2');
        assert.equal(g.state, 'down', 'the body stays');
        await page.waitForTimeout(1500);
        assert.equal((await guard(page, 'g2')).state, 'down');
      });

      await sub('the vault console: reaching it pays real Stealth XP by how quietly you did it, and the yard resets', async () => {
        await isolate(page, { face: 'up' });
        await world(page, (w, st) => { st.sim.guards.find((x) => x.id === 'g2').state = 'patrol'; st.sim.stats.takedowns = 0; });
        const before = await page.evaluate(() => JSON.parse(JSON.stringify(__stardust.workbench.state.progress)));
        const goal = YARD.interacts.find((i) => i.id === 'wb-yard-goal');
        await place(page, goal.x, goal.y + 52, -Math.PI / 2); await page.waitForTimeout(500);
        assert.equal(await world(page, (w) => w.target?.id ?? null), 'wb-yard-goal');
        await freezeShot(page, 'vault-prompt', shot);
        await page.keyboard.press('KeyE');
        await page.waitForFunction(() => /Vault open/.test(__stardust.workbench.state.said || ''), null, { timeout: 4000 });
        const after = await page.evaluate(() => JSON.parse(JSON.stringify(__stardust.workbench.state)));
        const gain = (after.progress.xp.stealth + 20 * (after.progress.levels.stealth - 1)) - (before.xp.stealth + 20 * (before.levels.stealth - 1));
        assert.equal(gain, 9, 'a clean run: 4 + 3 (no alarm) + 2 (no inspect)');
        assert.match(after.said, /Not one guard noticed you\. \+9 Stealth XP/);
        const p = await world(page, (w) => [w.player.x / 48, w.player.y / 48]);
        assert.ok(p[0] < 5 && p[1] > 13, 'back at the way in');
        await shot('vault-xp');
      });

      await sub('the stealth points change the live numbers: quiet, range and decay', async () => {
        const r = await page.evaluate(async () => {
          const m = await import('/projects/Space-Shooter/voyage/workbench/state.js');
          const w = __stardust.workbench;
          w.state = { ...w.state, progress: { ...w.state.progress, levels: { ...w.state.progress.levels, stealth: 9 }, points: { ...w.state.progress.points, stealth: { quiet: 3, range: 3, decay: 3 } } } };
          __stardust.onfoot.world.go('workbench', 'from-yard');
          await new Promise((r) => setTimeout(r, 400));
          __stardust.onfoot.world.go('workbench-yard', 'from-bay');
          await new Promise((r) => setTimeout(r, 500));
          const t = __stardust.onfoot.world.stealth.sim.tuning;
          return { cone: t.coneTiles, run: t.noise.run, drain: t.drain };
        });
        assert.ok(r.cone < 5.5 && r.run < 5.2 && r.drain > 0.6, `three points in each (all nine of a level 9): shorter cones, quieter steps, faster cool-off (${JSON.stringify(r)})`);
        await page.evaluate(() => { const w = __stardust.workbench; w.state = { ...w.state, progress: { ...w.state.progress, points: { ...w.state.progress.points, stealth: {} } } }; });
      });

    } finally {
      await browser.close();
      await server.close();
    }
    assert.deepEqual(errors.filter((e) => !/Failed to load resource|favicon|net::ERR/.test(e)), [], 'no page errors');
  });
}

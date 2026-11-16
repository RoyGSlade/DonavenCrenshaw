// Stardust launch, arena lane: racing and dogfights in the new game. Written against
// the outcome (launch/arena/PLAN.md): two tracks and two arenas reachable from the
// new game only, one fighter, AI to fly against, paid through the Guild bank (or the
// local save offline), and today's racing page and Dogfight untouched.
// Node only. The real-browser proof is tests/stardust-arena-browser.test.mjs (opt-in).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const G = '../projects/Space-Shooter';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = path.join(repo, 'projects', 'Space-Shooter');
const { LAUNCH_TRACKS, COMING_SOON_TRACKS, LAUNCH_ARENAS, COMING_SOON_ARENAS, ACTIVITY_PAY, SHIP_LOSS, CIRCUITS } = await import(`${G}/voyage/races/data.js`);
const { TRACKS } = await import(`${G}/voyage/quests/data/tracks.js`);
const { racePayout, dogfightPayout, hubJobsFragment, createActivityPay, payLine, raceJob, arenaJob } = await import(`${G}/voyage/races/activity.js`);
const { LAUNCH_ARENA_IDS, LAUNCH_FIGHTER, LAUNCH_BACKDROPS, LAUNCH_ART, COMING_SOON_FIGHTERS, launchFromSearch, launchLoadout, roundOutcome } = await import(`${G}/dogfight/launch.js`);
const { MAPS, createArena } = await import(`${G}/dogfight/maps.js`);
const { SHIP_CLASSES, cleanLoadout } = await import(`${G}/dogfight/ships.js`);
const { createMatch, stepMatch, NEUTRAL, RULES } = await import(`${G}/dogfight/simulation.js`);
const { createBots, botControls } = await import(`${G}/dogfight/bot.js`);
const { RACE_LAUNCHES } = await import(`${G}/voyage/races/hangarLaunches.js`);
const { createVoyageStore } = await import(`${G}/voyage/store.js`);
const { circuitTicket, cleanTicket, resolveTicket, resultMessage, cleanResult, makeToken } = await import(`${G}/voyage/races/questRace.js`);

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function captain() {
  const store = createVoyageStore({ storage: memory(), now: () => 1000 });
  store.createCharacter({ name: 'Vela Quint' }, () => 0.5);
  store.update((s) => ({ ...s, money: 100, upgrades: { ...s.upgrades, engine: 2, thrusters: 1 } }));
  return store;
}

// ---- the launch lists -------------------------------------------------------------

test('racing: two launch tracks, both real, a third reads coming soon', () => {
  assert.equal(LAUNCH_TRACKS.length, 2);
  for (const t of LAUNCH_TRACKS) {
    assert.ok(TRACKS[t.id], `${t.id} has a rival time from the racing game's test pilot`);
    assert.ok(CIRCUITS.some((c) => c.id === t.id), `${t.id} is a flyable circuit`);
    assert.equal(raceJob(t.id), t.job);
    assert.ok(ACTIVITY_PAY[t.job]?.kind === 'race');
  }
  assert.match(COMING_SOON_TRACKS.note, /coming soon/i);
});

test('dogfight: two launch arenas that exist, one fighter, the rest coming soon', () => {
  assert.deepEqual([...LAUNCH_ARENA_IDS], ['shatterbelt', 'stormworks']);
  for (const a of LAUNCH_ARENAS) { assert.ok(MAPS[a.id]); assert.equal(arenaJob(a.id), a.job); assert.equal(ACTIVITY_PAY[a.job].kind, 'dogfight'); assert.equal(ACTIVITY_PAY[a.job].arena, a.id); }
  assert.match(COMING_SOON_ARENAS.note, /coming soon/i);
  assert.equal(LAUNCH_FIGHTER.id, 'fighter-medium');
  assert.equal(LAUNCH_FIGHTER.rival.id, 'fighter-rival');
  assert.ok(SHIP_CLASSES[LAUNCH_FIGHTER.classId], 'the fighter flies on one of today\'s hulls');
  assert.deepEqual(COMING_SOON_FIGHTERS.map((f) => f.name), ['Light', 'Heavy']);
  const loadout = launchLoadout(1);
  assert.ok(cleanLoadout(loadout), 'the relay accepts the launch loadout');
  assert.equal(loadout.classId, 'medium');
});

test('the launch art is shipped: real images, the right shapes', () => {
  for (const rel of LAUNCH_ART) {
    const file = path.join(game, 'dogfight', rel);
    assert.ok(existsSync(file), rel);
    const buf = readFileSync(file);
    assert.equal(buf.subarray(0, 4).toString(), 'RIFF', `${rel} is a webp`);
    assert.equal(buf.subarray(8, 12).toString(), 'WEBP');
    assert.ok(buf.length > 4000 && buf.length < 400000, `${rel} is a sane size`);
  }
  for (const id of LAUNCH_ARENA_IDS) assert.ok(LAUNCH_BACKDROPS[id], `a backdrop for ${id}`);
});

test('launch flag: only `launch=1` with the new game on; anything else is today\'s Dogfight', () => {
  const on = { config: { newGame: false }, storage: { getItem: () => '1', setItem() {}, removeItem() {} } };
  const off = { config: { newGame: false }, storage: { getItem: () => null, setItem() {}, removeItem() {} } };
  assert.deepEqual(launchFromSearch('', on), { on: false, arena: null });
  assert.deepEqual(launchFromSearch('?map=stormworks', on), { on: false, arena: null });
  assert.deepEqual(launchFromSearch('?launch=1', off), { on: false, arena: null }, 'launch alone, new game off');
  assert.deepEqual(launchFromSearch('?launch=1', on), { on: true, arena: 'shatterbelt' });
  assert.deepEqual(launchFromSearch('?launch=1&arena=stormworks', on), { on: true, arena: 'stormworks' });
  assert.equal(launchFromSearch('?launch=1&arena=gravemaw', on).arena, 'shatterbelt', 'only launch arenas');
  assert.equal(launchFromSearch('?launch=1', { config: { newGame: true }, storage: null }).on, true);
});

// ---- guard: today's Dogfight and racing are unchanged -----------------------------------

test('guard: today\'s Dogfight still offers all four arenas and all three classes, with no launch mode on its page', () => {
  assert.deepEqual(Object.keys(MAPS), ['shatterbelt', 'gravemaw', 'stormworks', 'classic']);
  assert.deepEqual(Object.keys(SHIP_CLASSES), ['light', 'medium', 'heavy']);
  const html = readFileSync(path.join(game, 'dogfight', 'index.html'), 'utf8');
  for (const cls of ['light', 'medium', 'heavy']) assert.match(html, new RegExp(`name="ship-class" value="${cls}"`));
  assert.doesNotMatch(html, /fighter-medium|fighter-rival|arena-backdrop|launch=1/, 'the page itself names no launch art');
  // the picker and the builder keep today's behaviour unless handed a launch argument
  const picker = readFileSync(path.join(game, 'dogfight', 'mapPicker.js'), 'utf8');
  assert.match(picker, /Object\.entries\(MAPS\)/);
  const client = readFileSync(path.join(game, 'dogfight', 'client.js'), 'utf8');
  assert.match(client, /launchFromSearch\(location\.search/, "client reads the flag once");
  assert.doesNotMatch(client, /LAUNCH_ARENA_IDS|LAUNCH_ART/, 'client never lists launch arenas directly');
});

test('guard: today\'s racing page and its tickets are unchanged; a paid race is a circuit ticket with a flag', () => {
  const token = makeToken(() => 0.42);
  const plain = circuitTicket('gantry-drop', { token, now: 5 });
  assert.deepEqual(plain, { v: 1, token, kind: 'circuit', track: 'gantry-drop', title: '', at: 5 }, 'practice tickets keep their exact shape');
  const paid = circuitTicket('gantry-drop', { token, now: 5, paid: true });
  assert.equal(paid.paid, true);
  assert.deepEqual(cleanTicket(paid, 5), paid, 'a paid ticket survives the round trip through storage');
  assert.deepEqual(cleanTicket(plain, 5), plain);
  assert.equal(cleanTicket({ ...paid, track: 'gravemaw' }, 5), null);
  const store = captain();
  const r = resolveTicket(paid, store.get());
  assert.equal(r.paid, true);
  assert.equal(r.kind, 'circuit');
  assert.equal(resolveTicket(plain, store.get()).paid, undefined);
  // the racing page's boot file knows nothing of the launch lists
  const boot = readFileSync(path.join(game, 'boot.js'), 'utf8');
  assert.doesNotMatch(boot, /LAUNCH_TRACKS|ACTIVITY_PAY|activity\.js/);
});

test('the new game\'s hatch menu offers the two tracks and the two arenas, never today\'s Sim Pit', () => {
  const ids = RACE_LAUNCHES.map((l) => l.id);
  for (const t of LAUNCH_TRACKS) assert.ok(ids.includes(`race-${t.id}`), t.id);
  for (const a of LAUNCH_ARENAS) assert.ok(ids.includes(`arena-${a.id}`), a.id);
  assert.ok(ids.includes('race-more'), 'a third track entry');
  assert.ok(ids.includes('arena-more'), 'a coming-soon arena entry');
  assert.ok(!ids.includes('arena'), 'the old Sim Pit launch (all 4 arenas, 3 classes) is gone from the new game');
  const save = captain().get();
  for (const l of RACE_LAUNCHES) {
    const a = l.available(save);
    if (/more$/.test(l.id)) { assert.equal(a.ok, false); assert.match(a.reason, /coming soon/i); } else assert.equal(a.ok, true, l.id);
  }
  // every arena launch opens the launch flag, never the bare page
  const seen = [];
  for (const l of RACE_LAUNCHES.filter((x) => /^arena-(shatterbelt|stormworks)$/.test(x.id))) {
    l.run({ assign: (href) => seen.push(href), bus: null });
  }
  assert.equal(seen.length, 2);
  for (const href of seen) { assert.match(href, /dogfight\/\?/); assert.match(href, /launch=1/); assert.match(href, /arena=(shatterbelt|stormworks)/); }
});

// ---- pay --------------------------------------------------------------------------------

test('race pay: finish pays, beating the rival pays more, a wreck is a fee, backing out is nothing; never past the job\'s max', () => {
  for (const t of LAUNCH_TRACKS) {
    const rule = ACTIVITY_PAY[t.job];
    const finish = racePayout(t.job, { timeMs: 200000, finished: true, targetMs: 100000 });
    assert.equal(finish.credits, rule.finish);
    const win = racePayout(t.job, { timeMs: 90000, finished: true, targetMs: 100000 });
    assert.equal(win.credits, rule.finish + rule.win);
    assert.ok(win.credits <= rule.max);
    assert.equal(racePayout(t.job, { timeMs: 0, finished: false }).credits, 0);
    assert.equal(racePayout(t.job, { timeMs: 0, finished: false }).died, false);
    const wreck = racePayout(t.job, { wrecked: true });
    assert.equal(wreck.died, true);
    assert.equal(wreck.net, -SHIP_LOSS.fee);
    assert.equal(wreck.credits, 0);
  }
  assert.equal(racePayout('nope', {}).credits, 0);
});

test('dogfight pay: a round played pays, a win pays more (less in a duel against AI), a lost ship is a fee, an interrupted round pays nothing', () => {
  for (const a of LAUNCH_ARENAS) {
    const r = ACTIVITY_PAY[a.job];
    assert.equal(dogfightPayout(a.job, { outcome: 'loss', died: false }).credits, r.played);
    const win = dogfightPayout(a.job, { outcome: 'win', mode: 'ffa3', vsAi: true, hullFrac: 1 });
    assert.equal(win.credits, r.played + r.win + r.hullBonus);
    assert.ok(win.credits <= r.max);
    const duel = dogfightPayout(a.job, { outcome: 'win', mode: 'duel', vsAi: true, hullFrac: 0.5 });
    assert.equal(duel.credits, r.played + r.duelAiWin + Math.round(r.hullBonus * 0.5));
    assert.ok(duel.credits < win.credits);
    const lost = dogfightPayout(a.job, { outcome: 'loss', died: true });
    assert.equal(lost.died, true);
    assert.equal(lost.fee, SHIP_LOSS.fee);
    assert.equal(lost.net, r.played - SHIP_LOSS.fee);
    assert.equal(dogfightPayout(a.job, { outcome: 'interrupted', died: true }).credits, 0);
    assert.equal(dogfightPayout(a.job, { outcome: 'interrupted', died: true }).died, false);
    // a pilot at human speed can't out-earn the cap in one round
    assert.ok(dogfightPayout(a.job, { outcome: 'win', mode: 'ffa3', hullFrac: 5 }).credits <= r.max);
  }
});

test('the Hub fragment: one jobs entry per launch job, in the shape Hub rules.json validates', () => {
  const frag = hubJobsFragment();
  assert.deepEqual(Object.keys(frag).sort(), Object.keys(ACTIVITY_PAY).sort());
  for (const [id, j] of Object.entries(frag)) {
    assert.match(id, /^[a-z0-9][a-z0-9:-]{0,63}$/);
    assert.deepEqual(Object.keys(j).sort(), ['maxPayout', 'minSeconds']);
    assert.ok(Number.isInteger(j.maxPayout.credits) && j.maxPayout.credits > 0 && j.maxPayout.credits <= 100000);
    assert.ok(Number.isInteger(j.maxPayout.xp) && j.maxPayout.xp >= 0);
    assert.deepEqual(j.maxPayout.items, {});
    assert.ok(Number.isInteger(j.minSeconds) && j.minSeconds >= 0);
    assert.equal(j.maxPayout.credits, ACTIVITY_PAY[id].max, 'the Hub max is the table\'s max');
  }
  // a round can never be paid more than the Hub would let through
  for (const [id, r] of Object.entries(ACTIVITY_PAY)) {
    const most = r.kind === 'race' ? r.finish + r.win : r.played + Math.max(r.win, r.duelAiWin) + r.hullBonus;
    assert.ok(most <= r.max, `${id}: the best case (${most}) fits under max ${r.max}`);
  }
});

function fakeHub({ jobOk = true, held = false } = {}) {
  const calls = [];
  const api = async (url, opts = {}) => {
    calls.push({ url, body: opts.body });
    if (url.endsWith('/v1/jobs')) return jobOk ? { ok: true, status: 200, data: { ok: true, id: 'ticket-1' } } : { ok: false, status: 401, data: { error: 'nope' } };
    if (url.includes('/settle')) return held ? { ok: false, status: 200, data: { ok: false, held: true, paid: { credits: 0 }, flags: ['too-fast'] } } : { ok: true, status: 200, data: { ok: true, paid: { credits: Math.min(opts.body.credits, 160) }, flags: [], account: {} } };
    if (url.endsWith('/v1/death')) return { ok: true, status: 200, data: { ok: true, account: {} } };
    return { ok: false, status: 404, data: null };
  };
  return { api, calls, gamePath: (p) => `https://hub.test/api/games/stardust${p}` };
}

test('pay pipeline, server on and signed in: a job ticket, one settle that names no price, /death for a lost ship', async () => {
  const hub = fakeHub();
  const pay = createActivityPay({ api: hub.api, gamePath: hub.gamePath, serverOn: () => true, signedIn: () => true, store: captain() });
  const round = pay.start('dogfight-shatterbelt');
  const payout = dogfightPayout('dogfight-shatterbelt', { outcome: 'loss', died: true });
  const out = await pay.finish(round, payout, { outcome: 'loss' });
  assert.deepEqual(hub.calls.map((c) => c.url.replace(/^.*stardust/, '')), ['/v1/jobs', '/v1/jobs/ticket-1/settle', '/v1/death']);
  assert.equal(hub.calls[0].body.questId, 'dogfight-shatterbelt');
  assert.deepEqual(Object.keys(hub.calls[1].body).sort(), ['credits', 'items', 'outcome', 'xp']);
  assert.equal(hub.calls[1].body.credits, payout.net, 'the claim is the net change; the Hub caps it');
  assert.equal(out.source, 'server');
  assert.equal(out.died, true);
  // a win: no /death
  const hub2 = fakeHub();
  const pay2 = createActivityPay({ api: hub2.api, gamePath: hub2.gamePath, serverOn: () => true, signedIn: () => true, store: captain() });
  const win = dogfightPayout('dogfight-stormworks', { outcome: 'win', mode: 'ffa3', vsAi: true, hullFrac: 1 });
  const done = await pay2.finish(pay2.start('dogfight-stormworks'), win, { outcome: 'win' });
  assert.equal(hub2.calls.length, 2);
  assert.equal(done.paid, win.net);
  assert.match(payLine(done, win), /Paid \d+ cr/);
  // a held round says so
  const hub3 = fakeHub({ held: true });
  const pay3 = createActivityPay({ api: hub3.api, gamePath: hub3.gamePath, serverOn: () => true, signedIn: () => true, store: captain() });
  const held = await pay3.finish(pay3.start('race-gantry-drop'), racePayout('race-gantry-drop', { timeMs: 50000, finished: true, targetMs: 1 }), { outcome: 'finished' });
  assert.match(held.words, /checking/i);
});

test('pay pipeline: a guest earns nothing real; the hub down pays nothing and says so; server off pays the local save', async () => {
  const win = dogfightPayout('dogfight-shatterbelt', { outcome: 'win', mode: 'ffa3', vsAi: true, hullFrac: 1 });
  const hub = fakeHub();
  const guest = createActivityPay({ api: hub.api, gamePath: hub.gamePath, serverOn: () => true, signedIn: () => false, store: captain() });
  const g = await guest.finish(guest.start('dogfight-shatterbelt'), win, {});
  assert.equal(g.source, 'guest');
  assert.equal(hub.calls.length, 0, 'a guest never calls the bank');
  assert.match(payLine(g, win), /Sign in/);

  const down = fakeHub({ jobOk: false });
  const off = createActivityPay({ api: down.api, gamePath: down.gamePath, serverOn: () => true, signedIn: () => true, store: captain() });
  const o = await off.finish(off.start('dogfight-shatterbelt'), win, {});
  assert.equal(o.source, 'offline');
  assert.ok(!down.calls.some((c) => c.url.includes('/settle')));

  const store = captain();
  const local = createActivityPay({ serverOn: () => false, store });
  const before = store.get().money;
  const l = await local.finish(local.start('dogfight-shatterbelt'), win, {});
  assert.equal(l.source, 'local');
  assert.equal(store.get().money, before + win.net);
  // a lost ship, offline: the fee comes off and the upgrades go
  const lost = dogfightPayout('dogfight-shatterbelt', { outcome: 'loss', died: true });
  await local.finish(local.start('dogfight-shatterbelt'), lost, {});
  assert.equal(store.get().money, before + win.net + lost.net);
  assert.ok(Object.values(store.get().upgrades).every((n) => n === 0), 'upgrades are gone');
  assert.ok(store.get().character, 'the character is safe');
  // never below zero
  const poor = captain(); poor.update((s) => ({ ...s, money: 5 }));
  const p = createActivityPay({ serverOn: () => false, store: poor });
  await p.finish(p.start('race-gantry-drop'), racePayout('race-gantry-drop', { wrecked: true }), {});
  assert.equal(poor.get().money, 0);
  // no captain, nothing paid
  const bare = createVoyageStore({ storage: memory() });
  const b = createActivityPay({ serverOn: () => false, store: bare });
  assert.equal((await b.finish(b.start('race-gantry-drop'), racePayout('race-gantry-drop', { timeMs: 1, finished: true, targetMs: 0 }), {})).source, 'none');
});

test('race results: a wreck message is its own thing and never counts as a time', () => {
  const token = makeToken(() => 0.5);
  assert.equal(cleanResult({ type: 'stardust:questrace', token, timeMs: 0, wrecked: true }, token), null, 'no time, no result');
  const msg = resultMessage(token, 61234, true);
  assert.equal(msg.wrecked, undefined, 'a normal result message keeps its exact shape');
});

// ---- the AI pilot ---------------------------------------------------------------------

function playOut(mapId, mode, humanFn) {
  const m = createMatch(7, 1, [], mapId, mode);
  const botSeats = m.ships.map((s) => s.id).filter((id) => id !== 0 || !humanFn);
  const bots = createBots(botSeats);
  let ticks = 0;
  let outside = 0, inRock = 0;
  while (m.phase !== 'finished' && ticks < 60 * 200) {
    const inputs = m.ships.map((s) => (s.id === 0 && humanFn ? humanFn(m) : bots.controls(m, s.id)));
    stepMatch(m, inputs);
    for (const s of m.ships) if (s.hp > 0) {
      if (s.x < 0 || s.x > RULES.width || s.y < 0 || s.y > RULES.height) outside++;
      if (m.obstacles.some((o) => o.hp !== 0 && Math.hypot(o.x - s.x, o.y - s.y) < o.radius * 0.5)) inRock++;
    }
    ticks++;
  }
  return { m, seconds: ticks / 60, outside, inRock };
}

test('bot: every round ends inside the clock and nobody leaves the arena or sits in a rock (both arenas, both modes, bots only)', () => {
  for (const id of LAUNCH_ARENA_IDS) for (const mode of ['duel', 'ffa3']) {
    const r = playOut(id, mode, null);
    assert.equal(r.m.phase, 'finished', `${id} ${mode}`);
    assert.ok(r.seconds <= RULES.roundSeconds + 3);
    assert.equal(r.outside, 0, `${id} ${mode}: nobody left the arena`);
    assert.equal(r.inRock, 0, `${id} ${mode}: nobody sat inside cover`);
  }
});

test('bot: a pilot who just sits still loses to the AI before the clock runs out, on both arenas', () => {
  for (const id of LAUNCH_ARENA_IDS) {
    const r = playOut(id, 'duel', () => ({ ...NEUTRAL }));
    assert.equal(r.m.phase, 'finished');
    assert.equal(r.m.winner, 1, `${id}: the AI wins against a parked ship`);
    assert.equal(r.m.reason, 'hull');
  }
});

test('bot: it is beatable. A player who fires first from the spawn line wins sometimes; the AI waits to line up', () => {
  // the AI will not fire in its first half second of having a target (reaction time)
  const m = createMatch(7, 1, [], 'shatterbelt', 'duel');
  const mem = { skill: 'rookie' };
  while (m.phase === 'countdown') stepMatch(m, [NEUTRAL, NEUTRAL]);
  let firedEarly = false;
  for (let i = 0; i < 20; i++) { // a third of a second
    if (botControls(m, 1, mem).fire) firedEarly = true;
    stepMatch(m, [NEUTRAL, NEUTRAL]);
  }
  assert.equal(firedEarly, false);
});

test('bot: in a free-for-all it goes for the nearest live enemy', () => {
  const m = createMatch(7, 1, [], 'shatterbelt', 'ffa3');
  while (m.phase === 'countdown') stepMatch(m, [NEUTRAL, NEUTRAL, NEUTRAL]);
  const mem = {};
  botControls(m, 0, mem);
  const me = m.ships[0];
  const near = m.ships.filter((s) => s.id !== 0).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  assert.equal(mem.target, near.id);
  // a dead bot flies nothing
  m.ships[0].hp = 0;
  assert.deepEqual(botControls(m, 0, {}), { ...NEUTRAL });
});

test('bot: deterministic, so the same round plays the same way', () => {
  const a = playOut('stormworks', 'ffa3', null), b = playOut('stormworks', 'ffa3', null);
  assert.deepEqual(a.m.ships.map((s) => Math.round(s.hp)), b.m.ships.map((s) => Math.round(s.hp)));
  assert.equal(a.seconds, b.seconds);
});

test('round outcome for pay: win, loss with a lost ship, draw on time, interrupted', () => {
  const ships = [{ hp: 50, maxHp: 100 }, { hp: 0, maxHp: 100 }];
  assert.deepEqual(roundOutcome({ winner: 0, reason: 'hull', ships, seat: 0 }), { outcome: 'win', died: false, hullFrac: 0.5 });
  assert.deepEqual(roundOutcome({ winner: 0, reason: 'hull', ships, seat: 1 }), { outcome: 'loss', died: true, hullFrac: 0 });
  assert.equal(roundOutcome({ winner: null, reason: 'time', ships: [{ hp: 60, maxHp: 100 }, { hp: 60, maxHp: 100 }], seat: 0 }).outcome, 'draw');
  assert.equal(roundOutcome({ winner: null, reason: 'host-hidden', ships, seat: 0 }).outcome, 'interrupted');
  assert.equal(roundOutcome({ winner: null, reason: 'hull', ships: [{ hp: 0, maxHp: 100 }, { hp: 0, maxHp: 100 }], seat: 0 }).died, true);
});

test('the dogfight page reads the server-mode switch exactly as the new game does', async () => {
  const { launchServerMode } = await import(`${G}/dogfight/launch.js`);
  const { serverMode } = await import(`${G}/voyage/session.js`);
  for (const [config, search, stored] of [[{}, '', null], [{ voyageServer: true }, '', null], [{}, '?vserver=1', null], [{}, '?vserver=0', '1'], [{}, '', '1'], [{}, '?x=1', '0']]) {
    const mk = () => { const m = new Map(stored == null ? [] : [['stardust.voyage.server', stored]]); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
    assert.equal(launchServerMode({ config, search, storage: mk() }), serverMode({ config, search, storage: mk() }), `${JSON.stringify([config, search, stored])}`);
  }
});

test('the launch maps load: both arenas build their cover and the backdrop names match', () => {
  for (const id of LAUNCH_ARENA_IDS) {
    const arena = createArena(id);
    assert.ok(arena.obstacles.length > 4);
    assert.ok(LAUNCH_BACKDROPS[id].includes(id));
  }
  assert.ok(createArena('stormworks').vents.length > 0);
});

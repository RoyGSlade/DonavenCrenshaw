// Races and the arena inside the new game (races lane, round 2): quest race
// tickets and results, the "quest race" mode that blocks every persistent
// write in today's racing code, the upgraded-ship scene beside the weekly
// physics, the live fight layer (crew turret, repairs, knockouts, abilities)
// and the data the Studio edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const G = '../projects/Space-Shooter';
const { QUEST_RACE, makeToken, activeRaceLeg, questTicket, circuitTicket, cleanTicket, resolveTicket, cleanResult, parseReturn, returnHref, parseQuestRaceQuery, recordPractice, practiceBest, readTicket, writeTicket, clearTicket } = await import(`${G}/voyage/races/questRace.js`);
const { setQuestRaceMode, allowPersistentWrite, blockedWrites, resetQuestRaceMode, isQuestRace } = await import(`${G}/systems/questRace.js`);
const { createQuestRaceScene, cleanRaceStats } = await import(`${G}/engine/weekly/questRaceScene.js`);
const { createWeeklyScene, WEEKLY_CONFIG, WEEKLY_PHYSICS } = await import(`${G}/engine/weekly/sim.js`);
const { createWeeklyLayout } = await import(`${G}/engine/weekly/layout.js`);
const { weeklyById } = await import(`${G}/tracks/weekly.js`);
const { createVoyageStore } = await import(`${G}/voyage/store.js`);
const { startQuest, act } = await import(`${G}/voyage/quests/engine.js`);
const { QUESTS } = await import(`${G}/voyage/quests/data/quests/index.js`);
const { TRACKS } = await import(`${G}/voyage/quests/data/tracks.js`);
const { raceStats } = await import(`${G}/voyage/upgrades.js`);
const { CIRCUITS, ABILITIES, ABILITY_UNLOCKS, LIVE_CREW, RACE_COPY } = await import(`${G}/voyage/races/data.js`);
const { SKILLS } = await import(`${G}/voyage/data.js`);
const { liveFightSetup, createLiveFight, liveFightResult } = await import(`${G}/voyage/quests/live/dogfight.js`);
const { createLiveLayer, stepLiveLayer, crewTurret, crewRepair, useAbility, abilitiesFor, liveFrame, crewLiveAct, cooldownLeft, hackWindow } = await import(`${G}/voyage/races/liveFight.js`);
const { cleanCrewData } = await import(`${G}/voyage/crew/protocol.js`);
const { RULES } = await import(`${G}/dogfight/simulation.js`);

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), keys: () => [...m.keys()], m };
}
let seq = 0;
const rand = () => { seq = (seq * 9301 + 49297) % 233280; return seq / 233280; };

/** A save with a captain, some engine and thruster upgrades and the given quest started at `node`. */
function saveAt(questId, node, { upgrades = { engine: 2, thrusters: 1 }, seed = 7 } = {}) {
  const store = createVoyageStore({ storage: memory(), now: () => 1000 });
  store.createCharacter({ name: 'Vela Quint' }, () => 0.5);
  store.update((s) => ({ ...s, upgrades: { ...s.upgrades, ...upgrades } }));
  const quest = { ...QUESTS[questId], start: node };
  return startQuest(quest, store.get(), { seed }).save;
}

test('tickets: a token, a quest race leg, a circuit, and checks on the way back', () => {
  const token = makeToken(rand);
  assert.match(token, /^[a-z0-9]{16}$/);
  const save = saveAt('black-lane', 'chase');
  const leg = activeRaceLeg(save);
  assert.equal(leg.quest, 'black-lane');
  assert.equal(leg.state.track, 'abandoned-mall');
  const ticket = questTicket(save, { token, title: 'Black Lane', now: 5 });
  assert.equal(ticket.kind, 'quest');
  assert.deepEqual(cleanTicket(JSON.parse(JSON.stringify(ticket)), 10), ticket);
  assert.equal(cleanTicket({ ...ticket, at: 0 }, QUEST_RACE.ticketMaxAgeMs + 10), null, 'an old ticket is stale');
  assert.equal(cleanTicket({ ...ticket, token: 'NOPE' }, 10), null);
  assert.equal(questTicket(saveAt('black-lane', 'intro'), { token }), null, 'no race leg, no ticket');
  assert.equal(circuitTicket('gantry-drop', { token }).track, 'gantry-drop');
  assert.equal(circuitTicket('weekly-99', { token }), null);
  // Storage round trip.
  const s = memory();
  assert.equal(writeTicket(ticket, s), true);
  assert.deepEqual(readTicket(s, 10), ticket);
  clearTicket(s);
  assert.equal(readTicket(s, 10), null);
  // The racing page's query.
  assert.deepEqual(parseQuestRaceQuery(`?questrace=${token}&embed=1`), { token, embed: true });
  assert.deepEqual(parseQuestRaceQuery('?questrace=../../etc'), { token: null, embed: false });
  assert.equal(parseQuestRaceQuery('?weekly=weekly-01'), null);
});

test('resolveTicket: the upgraded ship, the rival time from the run, refusals when the job moved on', () => {
  const save = saveAt('railgun-paper-trail', 'armoury-race');
  const token = makeToken(rand);
  const ticket = questTicket(save, { token, title: 'Railgun Paper Trail' });
  const race = resolveTicket(ticket, save);
  assert.equal(race.kind, 'quest');
  assert.equal(race.weekly, 'weekly-01');
  assert.equal(race.targetMs, activeRaceLeg(save).state.targetMs);
  assert.ok(race.stats.topSpeed > race.stock.topSpeed && race.stats.accel > race.stock.accel, 'engine and thrusters upgrades fly faster than stock');
  assert.deepEqual(race.stock, raceStats(save, null, 'classic-race'));
  assert.ok(resolveTicket({ ...ticket, steps: ticket.steps + 1 }, save).error, 'a ticket for an older step is refused');
  assert.ok(resolveTicket(ticket, { ...save, character: null }).error);
  const circuit = resolveTicket(circuitTicket('gantry-drop', { token }), save);
  assert.equal(circuit.targetMs, Math.round(TRACKS['gantry-drop'].pilotMs * CIRCUITS[0].rival.pace));
  assert.equal(circuit.best, null);
});

test('results come back clean, once, for the right ticket; the engine takes a live time', () => {
  const save = saveAt('black-lane', 'chase');
  const token = makeToken(rand);
  const ticket = questTicket(save, { token });
  assert.deepEqual(cleanResult({ token, timeMs: 98765.4, finished: true }, token), { token, timeMs: 98765, finished: true });
  assert.equal(cleanResult({ token: 'x'.repeat(16), timeMs: 1 }, token), null);
  assert.equal(cleanResult({ token, timeMs: -5 }, token), null);
  assert.equal(cleanResult({ token, timeMs: 1e12 }, token), null);
  const href = returnHref(token, 100000, false);
  assert.match(href, /^\.\/voyage\/\?questrace=/);
  assert.deepEqual(parseReturn(href.slice(href.indexOf('?')), ticket), { token, timeMs: 100000, finished: false });
  assert.equal(parseReturn(href.slice(href.indexOf('?')), { ...ticket, token: makeToken(rand) }), null, 'another tab\'s ticket does not match');
  // The quest engine: a live time beating the rival wins; a second one is ignored.
  const run = save.quests.active['black-lane'];
  const target = run.part.state.targetMs;
  const won = act(QUESTS['black-lane'], run, save, { type: 'live', timeMs: target - 500, finished: true });
  assert.equal(won.error, undefined);
  assert.equal(won.run.ended?.outcome, 'caught-him');
  const dnf = act(QUESTS['black-lane'], run, save, { type: 'live', timeMs: target - 500, finished: false });
  assert.notEqual(dnf.run.ended?.outcome, 'caught-him', 'a race not finished is lost');
  assert.match(dnf.run.log.join(' '), /race: lose/);
});

test('practice laps are the new game\'s own record, never a board', () => {
  let save = saveAt('black-lane', 'intro');
  let out = recordPractice(save, 'gantry-drop', 90000, { now: 1 });
  assert.equal(out.best, true);
  save = out.save;
  assert.equal(practiceBest(save, 'gantry-drop'), 90000);
  out = recordPractice(save, 'gantry-drop', 95000, { now: 2 });
  assert.equal(out.best, false);
  assert.equal(practiceBest(out.save, 'gantry-drop'), 90000);
  assert.equal(out.save.races.laps, 2);
  assert.equal(recordPractice(save, 'gantry-drop', 80000, { finished: false }).best, false, 'an unfinished lap never counts');
});

test('quest race mode: the gate refuses every persistent write and notes it; outside it, all is as today', (t) => {
  t.after(() => resetQuestRaceMode());
  for (const kind of ['best', 'ghost', 'weekly', 'saving', 'settings']) assert.equal(allowPersistentWrite(kind), true);
  assert.deepEqual(blockedWrites(), [], 'nothing noted outside the mode');
  setQuestRaceMode({ kind: 'quest', token: 'abcdefghijklmnop' });
  assert.equal(isQuestRace(), true);
  for (const kind of ['best', 'ghost', 'weekly', 'saving', 'settings']) assert.equal(allowPersistentWrite(kind), false);
  assert.deepEqual([...new Set(blockedWrites())].sort(), ['best', 'ghost', 'saving', 'settings', 'weekly']);
});

test('quest races fly in their own mode: today\'s weekly mode, bests, ghosts and hub runs are not touched', () => {
  const src = (p) => readFileSync(new URL(`${G}/${p}`, import.meta.url), 'utf8');
  const mode = src('engine/modes/questRace.js');
  // The quest race mode keeps nothing: no storage, no best, no ghost, no run-saving events, no hub.
  assert.doesNotMatch(mode, /localStorage|setItem|saveLocalBest|setWeeklyGhost|weeklyRunComplete|weeklyAttempt|encodeInputLog|fetch\(|hubRuns/);
  // It asks about each write today's weekly finish makes.
  assert.match(mode, /allowPersistentWrite\("best"\), ghost: allowPersistentWrite\("ghost"\), weekly: allowPersistentWrite\("weekly"\)/);
  const manager = src('engine/modeManager.js');
  assert.match(manager, /if \(state\.run\?\.questRace\) updateQuestRace\(dt\);/);
  assert.match(manager, /if \(quest\) startQuestRace\(event, quest\);\s*else startWeekly\(event, \{ preview: !!preview, ship: preview \? ship : null \}\);/);
  assert.match(src('systems/runSaving.js'), /if \(!allowPersistentWrite\('saving'\)\) return;/);
  assert.match(src('ui/raceIntro.js'), /if \(allowPersistentWrite\('settings'\)\) updateFlightSettings/);
  // The mode goes on before the page does anything else; share import and run saving never start.
  const boot = src('boot.js');
  assert.ok(boot.indexOf('setQuestRaceMode(') < boot.indexOf('initAudioUnlock()'));
  assert.match(boot, /if \(ready && !questRace\) initShareImport/);
  assert.match(boot, /\} else if \(questRace\) \{\s*\/\/ Saves nothing/);
  // Today's weekly mode does not know quest races exist.
  assert.doesNotMatch(src('engine/modes/weekly.js'), /questRace|allowPersistentWrite/);
});

test('quest race scene: upgraded multipliers beside the weekly physics, which stay as they are', () => {
  const event = weeklyById('weekly-01');
  const layout = createWeeklyLayout(event);
  const frozen = JSON.stringify(WEEKLY_CONFIG);
  const stock = createQuestRaceScene(layout, { stats: { topSpeed: 1, accel: 1, grip: 1, boost: 1, brake: 1 } });
  const today = createWeeklyScene(layout);
  assert.equal(stock.config, today.config, 'a stock ship with no upgrades flies today\'s physics exactly');
  assert.equal(stock.physics, WEEKLY_PHYSICS.HULL);
  const up = createQuestRaceScene(layout, { stats: { topSpeed: 1.2, accel: 1.1, grip: 1.05, boost: 1, brake: 1 } });
  assert.equal(up.physics, WEEKLY_PHYSICS.HULL, 'still the hull physics');
  assert.ok(Math.abs(up.config.MAX_SPEED - WEEKLY_CONFIG.MAX_SPEED * 1.2) < 1e-9);
  assert.ok(Math.abs(up.config.THRUST_ACCEL - WEEKLY_CONFIG.THRUST_ACCEL * 1.1) < 1e-9);
  assert.equal(up.questRace, true);
  assert.equal(JSON.stringify(WEEKLY_CONFIG), frozen, 'WEEKLY_CONFIG is untouched');
  assert.equal(createWeeklyScene(layout).config, undefined, 'today\'s scene is unchanged afterwards');
  assert.deepEqual(cleanRaceStats({ topSpeed: 9, accel: NaN }), { topSpeed: 2, accel: 1, grip: 1, boost: 1, brake: 1 });
});

// ---- live fights -----------------------------------------------------------
const ENEMY = { name: 'Raider', hp: 30, damage: [4, 6], movement: 'charge', abilities: [] };
const card = (skills = {}) => ({ name: 'Ossa Vey', stats: { cha: 3, con: 4, dex: 3, wis: 3 }, skills });
function fight({ pilot = null, crew = null } = {}) {
  const setup = liveFightSetup(ENEMY, { hull: 100, damage: 8 }, 42);
  const match = createLiveFight(setup);
  const layer = createLiveLayer(setup, { pilot, crew });
  const run = (steps, input) => { for (let i = 0; i < steps && match.phase !== 'finished'; i++) stepLiveLayer(layer, match, setup, input); };
  run(Math.ceil(RULES.countdown / RULES.step) + 2);
  return { setup, match, layer, run };
}

test('live crew: free-aim turret bolts hit the enemy; one shot per cooldown; solo has no turret', () => {
  const solo = fight();
  assert.equal(crewTurret(solo.layer, solo.match, 0), 'No crew aboard.');
  const { match, layer, run } = fight({ crew: card() });
  assert.equal(match.phase, 'playing');
  const [me, foe] = match.ships;
  const aim = Math.atan2(foe.y - me.y, foe.x - me.x);
  const hp = foe.hp;
  assert.equal(crewTurret(layer, match, aim), null);
  assert.equal(crewTurret(layer, match, aim), 'The turret is cycling.');
  // Freeze the foe in place so the bolt flies true.
  for (let i = 0; i < 90 && foe.hp === hp; i++) { foe.vx = 0; foe.vy = 0; run(1); }
  assert.ok(foe.hp < hp, 'the bolt hit');
  assert.ok(layer.log.some((l) => /turret hits for \d+/.test(l)));
  assert.equal(crewTurret(layer, match, NaN), 'Aim first.');
});

test('live crew: knockouts only with a crew, repairs fix them, hull patches have a cooldown', () => {
  const { match, layer, setup } = fight({ crew: card({ 'patch-kit': 2 }) });
  layer.systems.guns = true;
  assert.equal(crewRepair(layer, match, setup, 'engine'), 'The engine is working.');
  assert.equal(crewRepair(layer, match, setup, 'guns'), null);
  assert.equal(layer.systems.guns, false);
  assert.equal(crewRepair(layer, match, setup, 'hull'), 'Still patching the last one.');
  layer.t += LIVE_CREW.repair.cooldown;
  match.ships[0].hp -= 40;
  const hp = match.ships[0].hp;
  assert.equal(crewRepair(layer, match, setup, 'hull'), null);
  assert.ok(match.ships[0].hp > hp);
  // Guns down: the pilot's trigger does nothing.
  layer.systems.guns = true;
  const bullets = match.bullets.filter((b) => b.owner === match.ships[0].id).length;
  for (let i = 0; i < 30; i++) stepLiveLayer(layer, match, setup, { turn: 0, thrust: false, reverse: false, boost: false, brake: false, fire: true, trap: false });
  assert.equal(match.bullets.filter((b) => b.owner === match.ships[0].id).length, bullets, 'no pilot shots while the guns are out');
  // Solo: hits never knock anything out.
  const solo = fight();
  solo.layer.rand = () => 0;
  solo.match.ships[0].hp -= 1;
  for (let i = 0; i < 600 && solo.match.phase !== 'finished'; i++) stepLiveLayer(solo.layer, solo.match, solo.setup, undefined);
  assert.deepEqual(solo.layer.systems, { guns: false, engine: false });
});

test('abilities: data-driven by id, gated by skill level, cooldowns, hack-jam silences their guns', () => {
  // Whichever skill list this branch has: the contract's levelled trees (grant) or the slice's (legacy).
  const levelled = SKILLS.some((s) => Array.isArray(s.levels));
  const ids = new Set(SKILLS.map((s) => s.id));
  for (const a of ABILITIES) {
    assert.match(a.id, /^ship\.[a-z-]+$/, 'contract ability ids (ROUND2-CONTRACT.md section 9)');
    const g = levelled ? a.grant : a.legacy;
    assert.ok(ids.has(g.skill), `${a.id} names a real skill`);
    assert.ok(g.level <= SKILLS.find((s) => s.id === g.skill).max, `${a.id} is reachable`);
    assert.ok(a.cooldown > 0 && /^[1-9]$/.test(a.key));
  }
  assert.equal(new Set(ABILITIES.map((a) => a.key)).size, ABILITIES.length, 'one key each');
  assert.deepEqual(ABILITY_UNLOCKS[0], { skill: 'hacker', level: 2, unlocks: [{ type: 'ability', id: 'ship.hack-jam', text: ABILITIES[0].name }] });
  assert.deepEqual(abilitiesFor({ skills: {} }).map((a) => a.id), []);
  const all = {};
  for (const a of ABILITIES) { const g = levelled ? a.grant : a.legacy; all[g.skill] = Math.max(all[g.skill] || 0, g.level); }
  const pilot = { name: 'Vela', skills: { ...all } };
  assert.deepEqual(abilitiesFor(pilot).map((a) => a.id), ['ship.hack-jam', 'ship.overcharge', 'ship.field-repair', 'ship.drift', 'ship.afterburner']);
  assert.deepEqual(abilitiesFor(pilot, 'crew').map((a) => a.id), ['ship.hack-jam', 'ship.field-repair'], 'the crew only gets "any seat" abilities');
  assert.ok(hackWindow(2) > hackWindow(1), 'a higher level widens the hack window');

  const { match, layer, setup, run } = fight({ pilot });
  assert.equal(useAbility(layer, match, setup, 'ship.hack-jam', { hit: false }), null);
  assert.ok(cooldownLeft(layer, 'ship.hack-jam') > 0 && cooldownLeft(layer, 'ship.hack-jam') <= ABILITIES[0].cooldown / 2, 'a missed hack cools down half as long');
  assert.match(useAbility(layer, match, setup, 'ship.hack-jam', { hit: true }), /cooling down/);
  layer.ready = {};
  assert.equal(useAbility(layer, match, setup, 'ship.hack-jam', { hit: true }), null);
  assert.ok(layer.fx.jam > layer.t);
  const enemyShots = () => match.bullets.filter((b) => b.owner === match.ships[1].id).length;
  match.bullets = [];
  run(Math.floor(2.5 / RULES.step));
  assert.equal(enemyShots(), 0, 'jammed guns do not fire');
  // Overcharge: the next hit lands as one big shot, then it is spent.
  assert.equal(useAbility(layer, match, setup, 'ship.overcharge'), null);
  assert.ok(layer.fx.overcharge > layer.t);
  const foe = match.ships[1];
  const hp = foe.hp;
  foe.vx = 0; foe.vy = 0;
  match.bullets = [{ id: 9999, owner: match.ships[0].id, x: foe.x - 0.35, y: foe.y, vx: 30, vy: 0, life: 1 }];
  stepLiveLayer(layer, match, setup, undefined);
  assert.ok(hp - foe.hp >= RULES.damage * 3 - 1e-6, `an overcharged hit lands three times as hard (${hp - foe.hp})`);
  assert.equal(layer.fx.overcharge, 0, 'and the charge is spent');
  // Field repair and drift.
  match.ships[0].hp -= 30;
  const before = match.ships[0].hp;
  assert.equal(useAbility(layer, match, setup, 'ship.field-repair'), null);
  assert.ok(match.ships[0].hp > before);
  assert.equal(useAbility(layer, match, setup, 'ship.drift'), null);
  assert.ok(layer.fx.guard > layer.t);
  const foeNow = match.ships[1], meNow = match.ships[0];
  assert.ok(Math.abs(Math.atan2(Math.sin(meNow.angle - Math.atan2(foeNow.y - meNow.y, foeNow.x - meNow.x)), Math.cos(meNow.angle - Math.atan2(foeNow.y - meNow.y, foeNow.x - meNow.x)))) < 1e-9, 'drift swings the nose onto them');
  const speed = Math.hypot(meNow.vx, meNow.vy);
  assert.equal(useAbility(layer, match, setup, 'ship.afterburner'), null);
  assert.ok(Math.hypot(meNow.vx, meNow.vy) > speed, 'afterburner kicks forward');
  assert.match(useAbility({ ...layer, pilot: { skills: {} } }, match, setup, 'ship.drift'), /needs more training/);
  assert.match(useAbility(layer, match, setup, 'ship.drift', { seat: 'crew' }), /No crew aboard|pilot's/);
});

test('live frames fit the crew room and crew actions route through the layer', () => {
  const levelled = SKILLS.some((s) => Array.isArray(s.levels));
  const crew = card(levelled ? { hacker: 2 } : { slicer: 1 });
  const { match, layer, setup } = fight({ crew, pilot: { skills: {} } });
  const frame = liveFrame(layer, match, setup);
  const msg = cleanCrewData('host', { kind: 'state', v: 1, step: 'live', captain: 'Vela', checks: [], log: [], frame });
  assert.ok(msg, 'the relay accepts a live frame as a crew state');
  assert.equal(msg.frame.me.length, 5);
  assert.ok('ship_hack-jam' in msg.frame.cd, 'cooldowns keyed without dots for the relay');
  assert.ok(JSON.stringify(msg).length < 4000, 'small enough to send 15 times a second');
  assert.ok(cleanCrewData('guest', { kind: 'act', job: 'live-turret', aim: 1.2 }));
  assert.equal(crewLiveAct(layer, match, setup, { job: 'live-turret', aim: 0.3 }), null);
  assert.equal(crewLiveAct(layer, match, setup, { job: 'live-ability', id: 'ship.hack-jam', hit: true }), null);
  assert.ok(layer.fx.jam > layer.t, 'the crew hacked with their own Slicer');
  assert.match(crewLiveAct(layer, match, setup, { job: 'live-ability', id: 'ship.overcharge' }), /pilot's/);
  assert.match(crewLiveAct(layer, match, setup, { job: 'turret', hit: true }), /live/);
});

test('a live fight with the layer still ends with Dogfight\'s own result', () => {
  const { match, setup, run } = fight({ crew: card() });
  match.ships[1].hp = 0.001;
  match.ships[1].hp = 0;
  run(2);
  assert.equal(liveFightResult(match, setup)?.outcome, 'win');
});

test('copy and circuits are data the Studio can edit', () => {
  assert.ok(CIRCUITS.every((c) => TRACKS[c.id] && c.rival.pace > 0.5 && c.rival.pace < 1.5));
  for (const k of ['win', 'lose']) assert.ok(RACE_COPY[k].length >= 2 && RACE_COPY[k].every((l) => l.includes('{gap}')));
  // Nothing in the arena path touches Dogfight's code: the launch only opens its page.
  const launch = readFileSync(new URL(`${G}/voyage/races/launch.js`, import.meta.url), 'utf8');
  assert.doesNotMatch(launch, /from '..\/..\/dogfight\//);
  const live = readFileSync(new URL(`${G}/voyage/races/liveFight.js`, import.meta.url), 'utf8');
  assert.doesNotMatch(live, /localStorage|fetch\(/, 'the live layer keeps nothing');
});

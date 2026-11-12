// Round 3 basics (no browser): the tracker's steps for the tutorial and for jobs, the
// objective's way through doors, the nap's price, the skill tree's layout and the data shapes.
import test from 'node:test';
import assert from 'node:assert/strict';

const V = '../projects/Space-Shooter/voyage';
const { tutorialTrack, jobTrack, questSteps, deriveSteps, stepStates, trackerLines, currentTrack } = await import(`${V}/datapad/steps.js`);
const { mapsHolding, doorToward } = await import(`${V}/datapad/route.js`);
const { BASICS_DATA } = await import(`${V}/datapad/data.js`);
const { napQuote } = await import(`${V}/datapad/nap.js`);
const { QUESTS } = await import(`${V}/quests/data/quests/index.js`);
const { validateQuest } = await import(`${V}/quests/validate.js`);
const { MAP_DEFS } = await import(`${V}/maps/index.js`);
const { treeLayout } = await import(`${V}/hangarSkills.js`);
const { HANGAR_DATA } = await import(`${V}/hangarData.js`);
const { startQuest, act } = await import(`${V}/quests/engine.js`);
const { emptySave } = await import(`${V}/save.js`);
const { createCharacter } = await import(`${V}/character.js`);

const story = (step, done) => ({ v: 1, step, done, unlocks: [], paid: [], finished: false, skipped: false });

test('tutorial tracker: the leg in progress, ticked off, aimed at the step\'s station or giver', () => {
  const t = tutorialTrack({ story: story('shoot', ['intro', 'create', 'walk', 'ship', 'ralph', 'mine', 'hop-garrity', 'garrity', 'mel']) });
  assert.equal(t.kind, 'tutorial');
  assert.equal(t.title, 'Mel\'s range');
  assert.deepEqual(t.steps.map((s) => s.state), ['done', 'now', 'next', 'next']);
  assert.deepEqual(t.target, { station: 'range' });
  const g = tutorialTrack({ story: story('garrity', ['intro', 'create', 'walk', 'ship', 'ralph', 'mine', 'hop-garrity']) });
  assert.deepEqual(g.target, { npc: 'garrity' });
  assert.equal(tutorialTrack({ story: { ...story(null, []), finished: true } }), null);
  assert.deepEqual(trackerLines(t, 4).map((s) => s.id), ['shoot', 'hop-hask', 'hask']);
});

test('every quest has steps that validate, and each names real nodes in play order', () => {
  for (const q of Object.values(QUESTS)) {
    assert.ok(Array.isArray(q.steps) && q.steps.length >= 3, `${q.id} has steps`);
    assert.deepEqual(validateQuest(q), [], q.id);
    assert.ok(q.steps[0].nodes.includes(q.start), `${q.id}: the first step holds the start node`);
  }
  // A bad step is caught.
  const bad = { ...QUESTS['cold-run'], steps: [{ id: 'x', text: 'X', nodes: ['nope'] }] };
  assert.ok(validateQuest(bad).some((e) => /missing node nope/.test(e)));
});

test('job tracker follows a real run: the furthest step reached is now, the ones before are done', () => {
  const quest = QUESTS['cold-run'];
  const c = createCharacter({ name: 'Test', look: { portrait: 'p1', color: '#81e6df' } }, () => 0.5, () => 1);
  let save = { ...emptySave(), character: c };
  const started = startQuest(quest, save, { seed: 7, now: 1 });
  save = started.save;
  let track = jobTrack(save);
  assert.equal(track.kind, 'job');
  assert.equal(track.title, 'Cold Run');
  assert.equal(track.steps[0].state, 'now');
  assert.equal(track.target, null, 'a job you have taken plays wherever you are (no floor marker)');
  // Walk the dialogue on until the run reaches the trip.
  let run = started.run;
  for (let i = 0; i < 8 && !run.visits.trip; i++) {
    const out = act(quest, run, save, { type: 'choose', index: 0 }, { now: 2 });
    if (out.error) break;
    run = out.run; save = out.save;
  }
  assert.ok(run.visits.trip, 'the run reached the trip');
  const states = stepStates(quest, run).map((s) => s.state);
  assert.equal(states[0], 'done');
  assert.equal(states[1], 'now');
  assert.equal(currentTrack({ ...save, story: { ...story(null, []), finished: true } })?.kind ?? 'job', 'job');
});

test('a quest without steps still breaks down (made from its nodes)', () => {
  const { steps, ...plain } = QUESTS['black-lane'];
  const made = questSteps(plain);
  assert.ok(deriveSteps(plain).some((s) => /Fly to/.test(s.text)));
  assert.equal(made.at(-1).id, 'paid');
});

test('the objective marker finds its way through doors', () => {
  const lockerMaps = mapsHolding({ station: 'locker' }, MAP_DEFS);
  assert.ok(lockerMaps.includes('hangar'));
  assert.equal(doorToward('hangar', lockerMaps, MAP_DEFS), null, 'already there');
  assert.equal(doorToward('workshop', mapsHolding({ station: 'range' }, MAP_DEFS), MAP_DEFS), 'out');
  assert.equal(doorToward('cantina', mapsHolding({ npc: 'edna' }, MAP_DEFS), MAP_DEFS), 'staff');
});

test('the nap: you pick which ranks to take back; the tree holds; the respec rule prices it', async () => {
  const { canPick, canUnpick, applyPlan, planPoints } = await import(`${V}/datapad/nap.js`);
  const c = { ...createCharacter({ name: 'N', look: { portrait: 'p1', color: '#fff' } }, () => 0.5, () => 1), skills: { pilot: 2, navigator: 1, gunner: 1 } };
  const fee = HANGAR_DATA.respec.feePerPoint;
  const save = (money) => ({ ...emptySave(), character: c, money });
  assert.equal(napQuote(save(500), false, {}).ok, false, 'nothing picked: no nap');
  assert.equal(napQuote(save(500), false, {}).reason, BASICS_DATA.nap.pickFirst);
  const q = napQuote(save(500), false, { gunner: 1, pilot: 1 });
  assert.equal(q.ok, true);
  assert.equal(q.cost, 2 * fee, 'priced per point picked');
  assert.equal(napQuote(save(0), true, { gunner: 1 }).cost, 0, 'free in the tutorial');
  assert.equal(napQuote(save(0), false, { gunner: 1 }).ok, false, 'not enough credits says so');
  // The tree holds: Navigator stands on Helm points, so Pilot can't all go while Navigator stays.
  const all = { pilot: 2 };
  assert.equal(canPick(c, { pilot: 1 }, 'pilot').ok, false);
  assert.match(canPick(c, { pilot: 1 }, 'pilot').reason, /Navigator/);
  assert.equal(canPick(c, { pilot: 1, navigator: 1 }, 'pilot').ok, true, 'with Navigator picked too, Pilot can go');
  assert.equal(canUnpick(c, { pilot: 2, navigator: 1 }, 'navigator').ok, false, 'Navigator can\'t be kept on no Helm points');
  assert.deepEqual(applyPlan(c, { gunner: 1, pilot: 1 }).skills, { pilot: 1, navigator: 1 });
  assert.equal(planPoints({ gunner: 1, pilot: 1 }), 2);
  assert.equal(napQuote({ ...emptySave(), character: { ...c, skills: {} }, money: 500 }, false, {}).reason, BASICS_DATA.nap.nothing);
  void all;
});

test('jobs you have not taken are in the world: givers in person, the hangar board for off-station givers', async () => {
  const { offersAt, payText, whereText, giverOffers } = await import(`${V}/quests/offers.js`);
  const c = createCharacter({ name: 'J', look: { portrait: 'p1', color: '#fff' } }, () => 0.5, () => 1);
  const save = { ...emptySave(), character: c };
  assert.equal(offersAt({ map: 'hask-office', npc: 'hask' }, save).length, 5, 'Hask offers his five jobs in his office');
  assert.equal(offersAt({ map: 'hangar', npc: 'hask' }, save).length, 0, 'not somewhere he doesn\'t work');
  assert.equal(offersAt({ map: 'hangar', board: true }, save).length, 15, 'the hangar board posts all three off-station givers');
  assert.equal(payText(QUESTS['cold-run']), '70-95 credits');
  assert.match(whereText('vey'), /Beacon Prime/);
  // Every job can be taken from somewhere (in person and on the board).
  for (const id of Object.keys(QUESTS)) assert.ok(offersAt({ map: 'hangar', board: true }, save).some((o) => o.id === id), `${id} is posted`);
  // One job at a time.
  const busy = { ...save, quests: { active: { 'cold-run': { quest: 'cold-run' } } } };
  assert.ok(giverOffers('vey', busy).every((o) => !o.ok && /Finish the job/.test(o.reasons[0])));
});

test('the skill tree lays out with room: no two nodes on top of each other, branch names past the ends', () => {
  const L = treeLayout();
  for (const a of L.nodes) for (const b of L.nodes) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.24, `${a.id} vs ${b.id}`);
  for (const br of L.branches) {
    const own = L.nodes.filter((n) => n.trees.length === 1 && n.trees[0] === br.tree);
    const far = Math.max(...own.map((n) => Math.hypot(n.x, n.y)));
    assert.ok(Math.hypot(br.x, br.y) > far, `${br.tree} name sits past its last node`);
  }
});

test('basics data is strict and complete', () => {
  assert.equal(BASICS_DATA.version, 1);
  assert.deepEqual(BASICS_DATA.pages.map((p) => p.id), ['captain', 'pack', 'jobs', 'map']);
  for (const k of Object.keys(BASICS_DATA.marks.kinds)) assert.ok(BASICS_DATA.marks.kinds[k].icon && BASICS_DATA.marks.kinds[k].accent);
  for (const s of HANGAR_DATA.stations) assert.ok(BASICS_DATA.marks.stations[s.id], `marks for station ${s.id}`);
  for (const s of HANGAR_DATA.stations) assert.ok(s.prompt, `prompt words for ${s.id}`);
  assert.ok(BASICS_DATA.tracker.maxLines <= 4);
  assert.ok(BASICS_DATA.pad.openMs >= 250 && BASICS_DATA.pad.openMs <= 450);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { WEEKLY_EVENTS } from '../projects/Space-Shooter/tracks/weekly.js';
import { WEEK2_DRAFT, WEEKLY_ROLLOUT } from '../projects/Space-Shooter/tracks/weeklyRollout.js';
import { applyShipPlan, parseArgs, planShipWeeklyTrack, printShipPlan, trackHash, ENABLE_FLAGS } from '../scripts/stardust/ship-weekly-track.mjs';

const site = fileURLToPath(new URL('../', import.meta.url));
const hub = path.resolve(process.env.STARDUST_HUB_ROOT || path.join(site, '../hub'));
const tool = path.join(site, 'scripts/stardust/ship-weekly-track.mjs');
const paired = existsSync(path.join(hub, 'api/games/stardust/replay/verify.js'));
const synthetic = () => ({ ...structuredClone(WEEKLY_EVENTS[0]), id: 'studio-approved-fixture', version: 99, week: 99,
  // Draft metadata cannot replace release dates, rewards, flags or identity.
  enabled: true, opensAt: '2000-01-01', rewards: { malicious: true } });
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'ship-weekly-site-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const siteRoot = path.join(root, 'site'), hubRoot = path.join(root, 'hub');
  await mkdir(path.join(siteRoot, 'projects/Space-Shooter/tracks'), { recursive: true });
  await cp(path.join(site, 'projects/Space-Shooter/tracks/weeklyRollout.js'), path.join(siteRoot, 'projects/Space-Shooter/tracks/weeklyRollout.js'));
  await cp(path.join(hub, 'api/games/stardust'), path.join(hubRoot, 'api/games/stardust'), { recursive: true });
  await mkdir(path.join(hubRoot, 'api/lib/games'), { recursive: true });
  await cp(path.join(hub, 'api/lib/games/rules.js'), path.join(hubRoot, 'api/lib/games/rules.js'));
  const draft = path.join(root, 'approved.json');
  await writeFile(draft, JSON.stringify(synthetic()));
  return { siteRoot, hubRoot, draft, title: "Owner's {Test} Track", landmark: 'The "Turn"', floorMs: 1000, version: 7 };
}
async function moduleAt(root) {
  const source = await readFile(path.join(root, 'projects/Space-Shooter/tracks/weeklyRollout.js'), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
async function snapshots(options) {
  return Promise.all([
    readFile(path.join(options.siteRoot, 'projects/Space-Shooter/tracks/weeklyRollout.js'), 'utf8'),
    readFile(path.join(options.hubRoot, 'api/games/stardust/rules.json'), 'utf8'),
    readFile(path.join(options.hubRoot, 'api/games/stardust/replay/catalog.json'), 'utf8'),
    readFile(path.join(options.hubRoot, 'api/games/stardust/replay/provenance.json'), 'utf8'),
  ]);
}

test('CLI requires explicit release inputs and rejects malformed numbers/options', () => {
  const args = ['--draft', 'approved.json', '--title', 'Test', '--landmark', 'Turn', '--floor-ms', '1000'];
  assert.deepEqual(parseArgs(args), { draft: 'approved.json', title: 'Test', landmark: 'Turn', floorMs: 1000, hub: '../hub', version: 1, enable: false, dryRun: false });
  assert.equal(parseArgs([...args, '--enable', '--dry-run']).enable, true);
  for (const invalid of [[], [...args, '--wat'], [...args, '--version'], [...args, '--title', 'duplicate']]) assert.throws(() => parseArgs(invalid));
  for (const value of ['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
    assert.throws(() => parseArgs([...args.slice(0, -1), value]));
    assert.throws(() => parseArgs([...args, '--version', value]));
  }
});

test('dry plan validates a synthetic lap and server replay; write binds identical geometry without activation', { skip: !paired }, async t => {
  const options = await fixture(t);
  const before = await snapshots(options);
  const plan = await planShipWeeklyTrack(options);
  assert.deepEqual(await snapshots(options), before, 'planning writes nothing');
  assert.equal(plan.siteHash, plan.hubHash);
  assert.equal(plan.event.id, 'weekly-02');
  assert.equal(plan.event.week, 2);
  assert.equal(plan.event.version, 7);
  assert.equal(plan.event.title, options.title);
  assert.equal(plan.event.track.landmark, options.landmark);
  assert.deepEqual(plan.event.track.points, synthetic().track.points);
  assert.deepEqual(plan.event.rewards, WEEK2_DRAFT.rewards);
  assert.ok(plan.pilot.timeMs > 1000);
  const lines = [];
  printShipPlan(plan, { dryRun: true, log: line => lines.push(line) });
  assert.match(lines.join('\n'), /DRY RUN/);
  assert.match(lines.join('\n'), /npm run test:stardust/);
  assert.match(lines.join('\n'), /npm test/);
  await applyShipPlan(plan);
  const shipped = await moduleAt(options.siteRoot);
  const after = await snapshots(options);
  const rules = JSON.parse(after[1]), catalog = JSON.parse(after[2]);
  assert.equal(shipped.WEEK2_DRAFT.enabled, WEEK2_DRAFT.enabled);
  assert.deepEqual(shipped.WEEKLY_ROLLOUT, WEEKLY_ROLLOUT);
  assert.deepEqual(catalog['weekly-02'].track, shipped.WEEK2_DRAFT.track);
  assert.equal(catalog['weekly-02'].week, 2);
  assert.equal(trackHash(catalog['weekly-02']), trackHash(shipped.WEEK2_DRAFT));
  const priorRules = JSON.parse(before[1]);
  const level = rules.levels.find(l => l.id === 'weekly-02');
  assert.equal(level.version, 7);
  assert.equal(level.minTimeMs, 1000);
  assert.match(level.name, /Owner's/);
  assert.equal(level.enabled, priorRules.levels.find(l => l.id === 'weekly-02').enabled);
  assert.equal(rules.events.find(e => e.id === 'weekly-02').enabled, priorRules.events.find(e => e.id === 'weekly-02').enabled);
  assert.deepEqual(rules.weeklyRollout, priorRules.weeklyRollout);
  assert.deepEqual(rules.levels.filter(l => l.id !== 'weekly-02'), priorRules.levels.filter(l => l.id !== 'weekly-02'));
  assert.deepEqual(rules.events.find(e => e.id === 'weekly-02').rewards, priorRules.events.find(e => e.id === 'weekly-02').rewards);
  assert.equal(after[3], before[3], 'physics manifest is not geometry-bound');
  // Rerun from the rewritten module; quotes/braces in names stay valid and
  // a prepared disabled track remains disabled without --enable.
  const repeat = await planShipWeeklyTrack(options);
  assert.ok(repeat.files.every(file => file.before === file.after), 'shipping is idempotent');
  await applyShipPlan(repeat);
});

test('--enable changes exactly the two site and three Hub activation flags, preserving retirement boundaries', { skip: !paired }, async t => {
  const options = await fixture(t);
  const plan = await planShipWeeklyTrack({ ...options, enable: true });
  await applyShipPlan(plan);
  const shipped = await moduleAt(options.siteRoot);
  assert.equal(shipped.WEEK2_DRAFT.enabled, true);
  assert.equal(shipped.WEEKLY_ROLLOUT.enabled, true);
  assert.deepEqual(shipped.WEEKLY_ROLLOUT, { ...WEEKLY_ROLLOUT, enabled: true });
  assert.equal(plan.rules.levels.find(l => l.id === 'weekly-02').enabled, true);
  assert.equal(plan.rules.events.find(e => e.id === 'weekly-02').enabled, true);
  assert.equal(plan.rules.weeklyRollout.enabled, true);
  assert.equal(ENABLE_FLAGS.length, 5);
  const repeat = await planShipWeeklyTrack(options);
  assert.equal(repeat.event.enabled, true, 'omitting --enable never disables an already active release');
  assert.ok(repeat.files.every(file => file.before === file.after));
});

test('invalid geometry, unfinishable pilot lap and impossible floor leave both repos untouched', { skip: !paired }, async t => {
  const options = await fixture(t), before = await snapshots(options);
  for (const track of [null, { ...synthetic().track, width: 0 }, { ...synthetic().track, shards: [{ seg: 999, t: 0.5 }] }]) {
    await writeFile(options.draft, JSON.stringify({ id: 'fixture', track }));
    await assert.rejects(planShipWeeklyTrack(options));
    assert.deepEqual(await snapshots(options), before);
  }
  const impossible = synthetic();
  impossible.track.shards[0].off = 10000;
  await writeFile(options.draft, JSON.stringify(impossible));
  await assert.rejects(planShipWeeklyTrack(options), /pilot failed to finish/);
  assert.deepEqual(await snapshots(options), before);
  await writeFile(options.draft, JSON.stringify(synthetic()));
  await assert.rejects(planShipWeeklyTrack({ ...options, floorMs: 9999999 }), /below the verified pilot/);
  assert.deepEqual(await snapshots(options), before);
});

test('schedule drift, tampered snapshot and concurrent edits refuse shipping', { skip: !paired }, async t => {
  const options = await fixture(t), before = await snapshots(options);
  const rulesFile = path.join(options.hubRoot, 'api/games/stardust/rules.json');
  await writeFile(rulesFile, before[1].replaceAll('2026-10-06T15:00:00-07:00', '2026-10-06T16:00:00-07:00'));
  await assert.rejects(planShipWeeklyTrack(options), /must remain/);
  assert.deepEqual((await snapshots(options)).filter((_, i) => i !== 1), before.filter((_, i) => i !== 1));
  await writeFile(rulesFile, before[1]);
  const plan = await planShipWeeklyTrack(options);
  await writeFile(rulesFile, before[1] + '\n');
  await assert.rejects(applyShipPlan(plan), /File changed while validating/);
  assert.deepEqual((await snapshots(options)).filter((_, i) => i !== 1), before.filter((_, i) => i !== 1));
  await writeFile(rulesFile, before[1]);
  const physicsFile = path.join(options.hubRoot, 'api/games/stardust/replay/physics/engine/weekly/layout.js');
  await writeFile(physicsFile, (await readFile(physicsFile, 'utf8')) + '\n// tampered\n');
  await assert.rejects(planShipWeeklyTrack(options), /snapshot differs/);
  assert.deepEqual(await snapshots(options), before);
});

test('CLI dry-run reports both hashes without writing release files', { skip: !paired }, async t => {
  const options = await fixture(t);
  // The CLI uses its real site checkout and a disposable Hub, exercising the
  // requested command syntax while checking the real site stays byte-identical.
  const rolloutFile = path.join(site, 'projects/Space-Shooter/tracks/weeklyRollout.js');
  const siteBefore = await readFile(rolloutFile, 'utf8');
  const before = await snapshots(options);
  const result = spawnSync(process.execPath, [tool, '--draft', options.draft, '--title', 'CLI Track', '--landmark', 'CLI Turn', '--floor-ms', '1000', '--hub', options.hubRoot, '--dry-run'], { cwd: site, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /DRY RUN/);
  const hashes = [...result.stdout.matchAll(/(?:site:|hub:)\s+([a-f0-9]{64})/g)].map(m => m[1]);
  assert.equal(hashes.length, 2);
  assert.equal(hashes[0], hashes[1]);
  assert.equal(await readFile(rolloutFile, 'utf8'), siteBefore);
  assert.deepEqual(await snapshots(options), before);
});

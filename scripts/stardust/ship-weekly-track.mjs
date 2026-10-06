#!/usr/bin/env node
// Local preparation only: never commits, publishes, deploys or changes physics.
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createWeeklyLayout, WEEKLY_RULES } from '../../projects/Space-Shooter/engine/weekly/layout.js';
import { flyWeeklyLap } from '../../projects/Space-Shooter/engine/weekly/pilot.js';
import { encodeInputLog } from '../../projects/Space-Shooter/engine/weekly/replay.js';

const SITE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ROLLOUT_PATH = 'projects/Space-Shooter/tracks/weeklyRollout.js';
const GAME_PATH = 'api/games/stardust';
const WINDOW = Object.freeze({
  opensAt: '2026-10-06T15:00:00-07:00',
  exclusiveAt: '2026-10-06T19:00:00-07:00',
  closesAt: '2026-10-13T14:45:00-07:00',
});
export const ENABLE_FLAGS = Object.freeze([
  'site: WEEK2_DRAFT.enabled = true',
  'site: WEEKLY_ROLLOUT.enabled = true',
  'hub: levels[weekly-02].enabled = true',
  'hub: events[weekly-02].enabled = true',
  'hub: weeklyRollout.enabled = true',
]);
const USAGE = 'node scripts/stardust/ship-weekly-track.mjs --draft <approved-event.json> --title "<Track>" --landmark "<Landmark>" --floor-ms <N> [--hub ../hub] [--version 1] [--enable] [--dry-run]';
const json = value => JSON.stringify(value, null, 2);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function check(ok, message) { if (!ok) throw new Error(message); }
function positiveInteger(value, name) {
  check(/^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0, `${name} must be a positive safe integer.`);
  return Number(value);
}
export function parseArgs(argv) {
  const result = { hub: '../hub', version: 1, enable: false, dryRun: false };
  const values = { '--draft': 'draft', '--title': 'title', '--landmark': 'landmark', '--floor-ms': 'floorMs', '--hub': 'hub', '--version': 'version' };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    check(!seen.has(arg), `Duplicate option: ${arg}`); seen.add(arg);
    if (arg === '--enable' || arg === '--dry-run') result[arg === '--enable' ? 'enable' : 'dryRun'] = true;
    else {
      check(Object.hasOwn(values, arg), `Unknown option: ${arg}\n${USAGE}`);
      check(argv[i + 1] && !argv[i + 1].startsWith('--'), `Missing value for ${arg}`);
      result[values[arg]] = argv[++i];
    }
  }
  for (const key of ['draft', 'title', 'landmark', 'floorMs']) check(result[key] !== undefined, `Missing ${key}\n${USAGE}`);
  result.floorMs = positiveInteger(result.floorMs, '--floor-ms');
  result.version = positiveInteger(result.version, '--version');
  return result;
}

// Source is repository-owned. Drafts are parsed strictly as JSON, never imported.
async function rolloutModule(source) {
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
// Find an exported object while respecting strings and comments (including
// braces in display names). Refuse unfamiliar source instead of guessing.
function exportRange(source, name) {
  const matches = [...source.matchAll(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\{`, 'g'))];
  check(matches.length === 1, `Expected exactly one exported ${name} object.`);
  const start = matches[0].index + matches[0][0].lastIndexOf('{');
  let depth = 0, quote = null, comment = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment === 'line') { if (c === '\n') comment = null; continue; }
    if (comment === 'block') { if (c === '*' && next === '/') { comment = null; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (c === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    check(c !== '`', `Template literals in ${name} require manual review.`);
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return { start, end: i + 1 };
  }
  throw new Error(`Unclosed ${name} object.`);
}
function replaceExport(source, name, value) {
  const { start, end } = exportRange(source, name);
  return source.slice(0, start) + json(value) + source.slice(end);
}
function assertWindow(value, label, exclusive = false) {
  check(object(value), `${label} is missing.`);
  for (const key of exclusive ? Object.keys(WINDOW) : ['opensAt', 'closesAt']) {
    check(value[key] === WINDOW[key], `${label}.${key} must remain ${WINDOW[key]}; reconcile dates manually.`);
  }
}
function validateTrack(track) {
  check(object(track), 'Draft must contain a track object.');
  check(Number.isFinite(track.width) && track.width >= WEEKLY_RULES.MIN_WIDTH && track.width <= WEEKLY_RULES.MAX_WIDTH, 'Track width is outside the weekly rules.');
  check(Array.isArray(track.points) && track.points.length >= 3, 'Track needs at least three points.');
  track.points.forEach((p, i) => {
    check(Array.isArray(p) && p.length === 2 && p.every(Number.isFinite), `Invalid point ${i}.`);
    const next = track.points[(i + 1) % track.points.length];
    check(!Array.isArray(next) || p[0] !== next[0] || p[1] !== next[1], `Zero-length segment ${i}.`);
  });
  for (const key of ['shards', 'mines', 'bouncers', 'sentries', 'stations']) {
    if (key === 'stations' && track[key] === undefined) continue;
    check(Array.isArray(track[key]), `track.${key} must be an array.`);
    for (const [i, item] of track[key].entries()) {
      check(object(item), `Invalid ${key}[${i}].`);
      const index = key === 'sentries' ? item.point : item.seg;
      check(Number.isInteger(index) && index >= 0 && index < track.points.length, `Invalid ${key}[${i}] point/segment.`);
      if (key === 'sentries') check(['inside', 'outside'].includes(item.side), `Invalid sentry side ${i}.`);
      else {
        check(Number.isFinite(item.t) && item.t >= 0 && item.t <= 1, `Invalid ${key}[${i}].t.`);
        if (item.off !== undefined) check(Number.isFinite(item.off), `Invalid ${key}[${i}].off.`);
        if (key === 'bouncers') {
          check(Number.isFinite(item.radius) && item.radius > 0 && item.radius < track.width / 2 - 0.05, `Invalid bouncer radius ${i}.`);
          check(Number.isFinite(item.speed) && item.speed > 0, `Invalid bouncer speed ${i}.`);
          if (item.phase !== undefined) check(Number.isFinite(item.phase), `Invalid bouncer phase ${i}.`);
        }
      }
    }
  }
  check(track.shards.length >= WEEKLY_RULES.MIN_SHARDS, 'Track has too few shards.');
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]));
  return value;
}
export function trackHash(event) {
  return createHash('sha256').update(JSON.stringify(sorted({ id: event.id, week: event.week, version: event.version, track: event.track }))).digest('hex');
}

export async function planShipWeeklyTrack({ draft, title, landmark, floorMs, version = 1, enable = false, siteRoot = SITE_ROOT, hubRoot = path.resolve(siteRoot, '../hub') }) {
  floorMs = positiveInteger(floorMs, '--floor-ms');
  version = positiveInteger(version, '--version');
  for (const [label, value] of Object.entries({ title, landmark })) check(typeof value === 'string' && value.trim() && !/[\r\n\0]/.test(value), `${label} must be a nonempty single line.`);
  title = title.trim(); landmark = landmark.trim();
  check(!/pending/i.test(title), 'Choose the approved track title, not a pending name.');
  const rolloutFile = path.resolve(siteRoot, ROLLOUT_PATH);
  const rulesFile = path.resolve(hubRoot, GAME_PATH, 'rules.json');
  const catalogFile = path.resolve(hubRoot, GAME_PATH, 'replay/catalog.json');
  const [source, rulesText, catalogText, draftText] = await Promise.all([
    readFile(rolloutFile, 'utf8'), readFile(rulesFile, 'utf8'), readFile(catalogFile, 'utf8'), readFile(draft, 'utf8'),
  ]);
  const approved = JSON.parse(draftText);
  check(object(approved) && typeof approved.id === 'string' && approved.id.trim(), 'Draft must be a weekly event JSON with an id and track.');
  validateTrack(approved.track);
  const { WEEK2_DRAFT, WEEKLY_ROLLOUT } = await rolloutModule(source);
  const rules = JSON.parse(rulesText), catalog = JSON.parse(catalogText);
  check(object(catalog), 'Replay catalog must be an object.');
  const levels = rules.levels.filter(l => l.id === 'weekly-02');
  const events = rules.events.filter(e => e.id === 'weekly-02');
  check(levels.length === 1 && events.length === 1, 'Hub needs exactly one weekly-02 level and event.');
  const level = levels[0], hubEvent = events[0];
  check(WEEK2_DRAFT.id === 'weekly-02' && WEEK2_DRAFT.week === 2 && WEEKLY_ROLLOUT.eventId === 'weekly-02' && rules.weeklyRollout.eventId === 'weekly-02' && hubEvent.board === 'weekly-02', 'Week 2 identities do not match.');
  assertWindow(WEEK2_DRAFT, 'WEEK2_DRAFT');
  assertWindow(WEEKLY_ROLLOUT, 'WEEKLY_ROLLOUT', true);
  assertWindow(level, 'Hub weekly-02 level');
  assertWindow(hubEvent, 'Hub weekly-02 event');
  assertWindow(rules.weeklyRollout, 'Hub weeklyRollout', true);
  check(JSON.stringify(sorted(WEEKLY_ROLLOUT)) === JSON.stringify(sorted(rules.weeklyRollout)), 'Site and Hub rollout gates differ; reconcile before shipping.');
  const event = { ...WEEK2_DRAFT, title, landmark, version, track: { ...approved.track, title, landmark } };
  if (enable) event.enabled = true;
  const rollout = { ...WEEKLY_ROLLOUT, ...(enable ? { enabled: true } : {}) };
  const layout = createWeeklyLayout(event);
  check(Number.isFinite(layout.track.length) && layout.track.length >= WEEKLY_RULES.MIN_LENGTH, 'Track is shorter than the weekly minimum.');
  const lap = flyWeeklyLap(layout);
  check(lap.finished && !lap.dead && Number.isFinite(lap.time) && lap.time > 0 && lap.scene.shards.size === layout.shards.length, `Scripted pilot failed to finish: dead=${lap.dead}, shards=${lap.scene.shards.size}/${layout.shards.length}.`);
  check(floorMs < Math.round(lap.time), '--floor-ms must be below the verified pilot finish. The pilot is cautious; owner evidence still determines the competitive floor.');
  const inputLog = encodeInputLog({ eventId: event.id, version, frames: lap.frames, finishMs: lap.time, physics: lap.physics, ship: lap.ship });
  // Preserve server-only catalog fields and every other board. Simulation
  // needs week for shard IDs. Activation is owned by rules, not this catalog.
  catalog['weekly-02'] = { ...catalog['weekly-02'], id: event.id, week: event.week,
    version, title, landmark, tagline: event.tagline, track: event.track };
  Object.assign(level, { name: `Weekly 2 \u00b7 ${title}`, version, minTimeMs: floorMs });
  hubEvent.name = `Week 2 \u2014 ${title}`;
  if (enable) { level.enabled = true; hubEvent.enabled = true; rules.weeklyRollout.enabled = true; }
  const require = createRequire(import.meta.url);
  const replay = require(path.resolve(hubRoot, GAME_PATH, 'replay/verify.js'));
  replay.verifyPhysicsSnapshot(); // Manifest binds physics only; do not rewrite it.
  const verifier = replay.createWeeklyVerifier({ events: catalog });
  const verdict = await verifier.verifyReplay({ rules, run: { board: event.id, boardVersion: version }, timeMs: Math.round(lap.time), inputLog, client: { build: lap.ship || null } });
  check(verdict.ok && verdict.finishMs === Math.round(lap.time), `Hub pilot replay refused: ${verdict.reason || 'finish mismatch'}. No files written.`);
  const { validateRules, listSecretFiles } = require(path.resolve(hubRoot, 'api/lib/games/rules.js'));
  const plugin = require(path.resolve(hubRoot, GAME_PATH, 'plugin.js'));
  const errors = validateRules(rules, { plugin: { ...plugin, ...verifier }, secretFiles: new Set(listSecretFiles(path.resolve(hubRoot, GAME_PATH, 'secret')).keys()) });
  check(errors.length === 0, `Hub rules refused:\n${errors.join('\n')}`);
  let nextSource = replaceExport(source, 'WEEK2_DRAFT', event);
  if (enable) nextSource = replaceExport(nextSource, 'WEEKLY_ROLLOUT', rollout);
  const rendered = await rolloutModule(nextSource);
  const nextCatalog = json(catalog) + '\n';
  const siteHash = trackHash(rendered.WEEK2_DRAFT);
  const hubHash = trackHash(JSON.parse(nextCatalog)['weekly-02']);
  check(siteHash === hubHash, 'Site and Hub track hashes differ.');
  return {
    siteRoot, hubRoot, event, rules, catalog, siteHash, hubHash, enable,
    pilot: { timeMs: Math.round(lap.time), inputLog, physics: lap.physics },
    files: [
      { path: rolloutFile, before: source, after: nextSource },
      { path: rulesFile, before: rulesText, after: json(rules) + '\n' },
      { path: catalogFile, before: catalogText, after: nextCatalog },
    ],
  };
}

// Stage all three files first. Reject concurrent edits; roll back completed
// replacements on an ordinary I/O failure. A crash across two repos still
// requires reviewing both diffs before release.
export async function applyShipPlan(plan) {
  for (const file of plan.files) check(await readFile(file.path, 'utf8') === file.before, `File changed while validating: ${file.path}. Rerun the tool.`);
  const staged = [], written = [];
  try {
    for (const file of plan.files.filter(f => f.before !== f.after)) {
      const temp = `${file.path}.ship-${randomUUID()}.tmp`;
      staged.push({ ...file, temp });
      await writeFile(temp, file.after, { encoding: 'utf8', flag: 'wx' });
    }
    for (const file of staged) { await rename(file.temp, file.path); written.push(file); }
  } catch (error) {
    for (const file of written.reverse()) {
      try { await writeFile(file.path, file.before, 'utf8'); }
      catch (rollbackError) { throw new AggregateError([error, rollbackError], `Rollback failed for ${file.path}; review both repos before release.`); }
    }
    throw error;
  } finally {
    await Promise.all(staged.map(file => unlink(file.temp).catch(error => { if (error.code !== 'ENOENT') throw error; })));
  }
}

export function printShipPlan(plan, { dryRun = false, log = console.log } = {}) {
  log(`${dryRun ? 'DRY RUN: planned' : 'Prepared'} weekly-02 v${plan.event.version}: ${plan.event.title} / ${plan.event.track.landmark}`);
  log(`Pilot and Hub replay: ${plan.pilot.timeMs} ms; Hub floor: ${plan.rules.levels.find(l => l.id === 'weekly-02').minTimeMs} ms`);
  log('Track SHA256 (sorted-key JSON of id/week/version/track):');
  log(`  site: ${plan.siteHash}\n  hub:  ${plan.hubHash}`);
  for (const file of plan.files) log(`  ${file.before === file.after ? 'unchanged' : dryRun ? 'would update' : 'updated'}: ${file.path}`);
  log(`Dates kept: opens ${WINDOW.opensAt}; exclusive ${WINDOW.exclusiveAt}; closes ${WINDOW.closesAt}`);
  log(plan.enable ? `--enable sets exactly:\n  ${ENABLE_FLAGS.join('\n  ')}` : 'All existing event, level and retirement flags preserved.');
  log('Physics/provenance unchanged. Rewards, historical boards and other modes retained.');
  log('Next checks (site root):\n  node --test tests/stardust-ship-weekly-track.test.mjs\n  npm run test:site\n  npm run test:stardust\n  npm run build\n  npm run verify:site\n  npm run check:privacy');
  log(`Next checks (Hub api, ${path.resolve(plan.hubRoot, 'api')}):\n  node --test test/games.ship-weekly-track.test.js\n  npm test`);
  log('Hub integration commands (fresh migrated loopback test DB, TZ=UTC; never production):\n  node test/integration/accounts-flow.mjs\n  node test/integration/games-flow.mjs\n  node test/integration/social-flow.mjs\n  node test/integration/titles-flow.mjs\n  node test/integration/dogfight-flow.mjs\n  node test/integration/weekly-replay-flow.mjs\n  node test/integration/weekly-rollout-flow.mjs');
  log('weekly-rollout-flow requires HUB_WEEK2_TEST_FIXTURE=1. In a separate fresh security_test DB with SECURITY_SYNTHETIC_FIXTURE=1:\n  node test/integration/security-flow.mjs');
  log('Run the preserved priority-polls backend/browser fixture per WEEK2-RELEASE.md. Review owner-track phone screenshots and competitive floor before release.');
}

export async function shipWeeklyTrack(options) {
  const plan = await planShipWeeklyTrack(options);
  if (!options.dryRun) await applyShipPlan(plan);
  printShipPlan(plan, { dryRun: options.dryRun });
  return plan;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    await shipWeeklyTrack({ ...options, draft: path.resolve(options.draft), hubRoot: path.resolve(options.hub) });
  } catch (error) {
    console.error(`ship-weekly-track: ${error.message}`);
    process.exitCode = 1;
  }
}

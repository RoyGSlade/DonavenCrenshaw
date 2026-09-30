// Flies the scripted test pilot round a weekly track in every garage build and
// prints the lap-time spread, to check the stat table (engine/shipStats.js) for
// balance before players see it.
//
//   node scripts/stardust-build-laps.mjs [eventId] [--csv]
//
// The pilot is careful, not fast, and plans its speeds from each build's stats
// with a simple model (it does not drift like a human), so treat the spread as
// a first check: it under-rates grip and over-rates nothing in particular.
import { WEEKLY_EVENTS } from '../projects/Space-Shooter/tracks/weekly.js';
import { createWeeklyLayout } from '../projects/Space-Shooter/engine/weekly/layout.js';
import { flyWeeklyLap } from '../projects/Space-Shooter/engine/weekly/pilot.js';
import { WEEKLY_PHYSICS } from '../projects/Space-Shooter/engine/weekly/sim.js';
import { encodeInputLog, replayInputLog } from '../projects/Space-Shooter/engine/weekly/replay.js';
import { ALL_BUILDS, buildStats, buildHull, buildHullSize } from '../projects/Space-Shooter/engine/shipStats.js';

const args = process.argv.slice(2);
const event = WEEKLY_EVENTS.find((e) => e.id === args.find((a) => !a.startsWith('--'))) || WEEKLY_EVENTS[0];
const layout = createWeeklyLayout(event);
const rows = [];
const standard = flyWeeklyLap(layout, { physics: WEEKLY_PHYSICS.HULL });
rows.push({ build: 'standard (today)', time: standard.time, dead: standard.dead, walls: standard.scene.wallHits, stats: null, size: null, replay: true });
const seen = new Map();
for (const build of ALL_BUILDS) {
  // Builds with the same outline and the same stats fly identically (the cockpit is usually cosmetic): fly one.
  const hull = buildHull(build);
  const twinOf = [...seen.values()].find((r) => r.hull === hull && JSON.stringify(r.stats) === JSON.stringify(buildStats(build)));
  if (twinOf) { twinOf.also.push(build); continue; }
  const twin = build;
  const lap = flyWeeklyLap(layout, { physics: WEEKLY_PHYSICS.BUILD, ship: build });
  let replay = null;
  if (lap.finished) {
    const log = encodeInputLog({ eventId: event.id, version: event.version, frames: lap.frames, finishMs: lap.time, physics: WEEKLY_PHYSICS.BUILD, ship: build });
    replay = replayInputLog(layout, log).matches;
  }
  const row = { build: twin, time: lap.time, dead: lap.dead, walls: lap.scene.wallHits, stats: buildStats(build), size: buildHullSize(build), replay, hull, also: [] };
  seen.set(twin, row);
  rows.push(row);
}
const finished = rows.filter((r) => r.time != null).sort((a, b) => a.time - b.time);
const failed = rows.filter((r) => r.time == null);
const s = (ms) => (ms / 1000).toFixed(2);
const pct = (v) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`.padStart(5);
if (args.includes('--csv')) {
  console.log('build,seconds,dead,walls,topSpeed,accel,grip,boost,brake,width,length,area,replayExact');
  for (const r of rows) console.log([r.build, r.time != null ? s(r.time) : '', r.dead || '', r.walls, r.stats?.topSpeed ?? '', r.stats?.accel ?? '', r.stats?.grip ?? '', r.stats?.boost ?? '', r.stats?.brake ?? '', r.size?.width ?? '', r.size?.length ?? '', r.size?.area ?? '', r.replay ?? ''].join(','));
} else {
  console.log(`${event.id} "${event.title}": ${rows.length} distinct ships (${ALL_BUILDS.length} builds; identical ones flown once)`);
  console.log('lap s   walls  build            top  accel  grip  boost brake   width x length');
  for (const r of finished) console.log(`${s(r.time).padStart(6)}  ${String(r.walls).padStart(4)}   ${r.build.padEnd(16)} ${r.stats ? `${pct(r.stats.topSpeed)} ${pct(r.stats.accel)} ${pct(r.stats.grip)} ${pct(r.stats.boost)} ${pct(r.stats.brake)}   ${r.size.width.toFixed(2)} x ${r.size.length.toFixed(2)}` : ''}${r.replay === false ? '  REPLAY MISMATCH' : ''}`);
  for (const r of failed) console.log(`   DNF  ${String(r.walls).padStart(4)}   ${r.build.padEnd(16)} ${r.dead || 'timed out'}`);
  if (finished.length) console.log(`\nfastest ${s(finished[0].time)} (${finished[0].build}), slowest ${s(finished.at(-1).time)} (${finished.at(-1).build}), spread ${s(finished.at(-1).time - finished[0].time)} s; ${failed.length} did not finish; replays exact: ${finished.filter((r) => r.replay !== false).length}/${finished.length}`);
}

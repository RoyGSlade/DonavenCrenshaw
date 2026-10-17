import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WEEKLY_EVENTS, currentWeekly } from '../projects/Space-Shooter/tracks/weekly.js';
import { WEEK2_DRAFT, WEEK3_DRAFT, WEEKLY_ROLLOUT } from '../projects/Space-Shooter/tracks/weeklyRollout.js';
import { weeklyAccess, canLaunchWeeklyMode } from '../projects/Space-Shooter/systems/weeklyAccess.js';
import { weeklyStatus } from '../projects/Space-Shooter/systems/weekly.js';

// The paired Hub checkout: a sibling by default, or STARDUST_HUB_ROOT.
const hubFile = (rel) => path.join(process.env.STARDUST_HUB_ROOT || fileURLToPath(new URL('../../hub', import.meta.url)), rel);

const w1 = WEEKLY_EVENTS[0];
const w2 = WEEK2_DRAFT;
const ready3 = { ...WEEK3_DRAFT, enabled: true, track: w1.track, title: 'Fixture' };
// Handoff fixtures never depend on whether the ship tool has filled the real draft.
const blank3 = { ...WEEK3_DRAFT, enabled: false, track: null };
const close2 = Date.parse(w2.closesAt), open3 = Date.parse(WEEK3_DRAFT.opensAt);
const ms = (iso) => Date.parse(iso);

test('Week 3 candidate is registered, disabled and trackless; dates follow the fixed Pacific cadence', () => {
  assert.equal(WEEKLY_EVENTS.at(-1), WEEK3_DRAFT);
  assert.equal(WEEK3_DRAFT.id, 'weekly-03');
  assert.equal(WEEK3_DRAFT.week, 3);
  assert.equal(WEEK3_DRAFT.commentsPage, 'stardust-weekly-03');
  // Candidate state: disabled, trackless, pending title. After the ship tool
  // fills the track the draft may be enabled, but never without a track.
  if (!WEEK3_DRAFT.track) {
    assert.equal(WEEK3_DRAFT.enabled, false, 'ship tool --enable is the only way to activate it');
    assert.match(WEEK3_DRAFT.title, /pending/i);
  } else {
    assert.ok(WEEK3_DRAFT.track.points.length >= 3 && WEEK3_DRAFT.track.shards.length > 0);
    assert.doesNotMatch(WEEK3_DRAFT.title, /pending/i, 'a filled track has its approved title');
  }
  if (WEEK3_DRAFT.enabled) assert.ok(WEEK3_DRAFT.track, 'enabled needs a track');
  assert.equal(new Date(WEEK3_DRAFT.opensAt).toISOString(), '2026-10-13T22:00:00.000Z');
  assert.equal(new Date(WEEK3_DRAFT.closesAt).toISOString(), '2026-10-20T21:45:00.000Z');
  assert.equal(open3 - close2, 15 * 60000, 'Week 2 closes 2:45 PM, Week 3 opens 3 PM');
  assert.equal(ms(WEEK3_DRAFT.closesAt) - open3, 7 * 86400000 - 15 * 60000);
  assert.equal(WEEKLY_ROLLOUT.eventId, 'weekly-02', 'the one-time retirement gate is still Week 2\'s');
  assert.ok(WEEK3_DRAFT.rewards.champion && WEEK3_DRAFT.rewards.podiumSize === 3);
});

test('handoff with Week 3 still disabled: Week 2 stays the featured archive, nothing new is playable', () => {
  const t = close2 + 1, events = [w1, w2, blank3];
  assert.equal(currentWeekly(close2 - 1, events).id, 'weekly-02');
  assert.equal(currentWeekly(t, events).id, 'weekly-02', 'disabled draft never replaces it');
  assert.equal(currentWeekly(open3 + 86400000, events).id, 'weekly-02');
  // A filled-in but still disabled draft is equally inert.
  assert.equal(currentWeekly(open3 + 1, [w1, w2, { ...ready3, enabled: false }]).id, 'weekly-02');
  assert.equal(weeklyStatus(w2, t).state, 'closed');
  assert.equal(weeklyAccess('weekly-02', close2 - 1), 'open');
  assert.equal(weeklyAccess('weekly-02', close2), 'retired', 'new Week 2 starts stop exactly at the close');
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: blank3, preview: true }, open3), false);
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: blank3 }, open3 + 1), false);
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: { ...ready3, enabled: false } }, open3 + 1), false);
  // Existing Week 2 rollout behavior is unchanged by the candidate.
  assert.equal(weeklyAccess('full', t), 'legacy');
  assert.equal(weeklyAccess('dogfight', t), 'open');
});

test('handoff once Week 3 is enabled with a track: Week 3 is featured at 3 PM and playable only inside its window', () => {
  const events = [w1, w2, ready3];
  assert.equal(currentWeekly(close2 - 1, events).id, 'weekly-02');
  assert.equal(currentWeekly(open3 - 1, events).id, 'weekly-03', 'between 2:45 and 3 PM the next week is teased, not Week 2');
  assert.equal(currentWeekly(open3, events).id, 'weekly-03');
  assert.equal(currentWeekly(ms(ready3.closesAt) - 1, events).id, 'weekly-03');
  assert.equal(currentWeekly(ms(ready3.closesAt), events).id, 'weekly-03', 'archive after close');
  assert.equal(weeklyAccess('weekly-03', close2 - 1), 'week2-only', 'cannot start before Week 2 closes');
  assert.equal(weeklyAccess('weekly-03', close2), 'open');
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: ready3 }, open3 - 1), false);
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: ready3 }, open3), true);
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: ready3 }, ms(ready3.closesAt)), false);
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: w2 }, open3), false, 'Week 2 is retired');
});

test('Hub and site agree on weekly-03 access at every boundary; Hub week-3 stub mirrors the site', {
  skip: !existsSync(hubFile('api/games/stardust/rules.json')),
}, () => {
  const rules = JSON.parse(readFileSync(hubFile('api/games/stardust/rules.json')));
  const catalog = JSON.parse(readFileSync(hubFile('api/games/stardust/replay/catalog.json')));
  const level = rules.levels.find((l) => l.id === 'weekly-03'), event = rules.events.find((e) => e.id === 'weekly-03');
  assert.ok(level && event && event.board === 'weekly-03');
  for (const x of [level, event]) {
    assert.equal(x.enabled, WEEK3_DRAFT.enabled);
    assert.equal(ms(x.opensAt), open3);
    assert.equal(ms(x.closesAt), ms(WEEK3_DRAFT.closesAt));
  }
  assert.equal(level.version, WEEK3_DRAFT.version);
  assert.equal(level.network, false);
  assert.equal(level.replay, 'verify');
  assert.equal(level.staffHidden, true);
  assert.deepEqual(catalog['weekly-03'].track, WEEK3_DRAFT.track, 'trusted Hub geometry is the site geometry');
  assert.equal(catalog['weekly-03'].week, 3);
  assert.deepEqual(rules.weeklyRollout, WEEKLY_ROLLOUT, 'the Week 2 gate is unchanged on both sides');
  const require = createRequire(import.meta.url);
  const { weeklyAccess: hubAccess } = require(hubFile('api/lib/games/weeklyAccess.js'));
  const live = { ...WEEKLY_ROLLOUT, enabled: true };
  for (const t of [close2 - 1, close2, open3 - 1, open3, ms(WEEK3_DRAFT.closesAt)]) {
    for (const board of ['weekly-01', 'weekly-02', 'weekly-03', 'dogfight', ...WEEKLY_ROLLOUT.legacyBoards]) {
      assert.equal(hubAccess({ weeklyRollout: live }, board, new Date(t)), weeklyAccess(board, t, live), `${board} at ${t}`);
    }
  }
});

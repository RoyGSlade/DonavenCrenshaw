import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { WEEKLY_EVENTS, currentWeekly } from '../projects/Space-Shooter/tracks/weekly.js';
import { WEEK2_DRAFT, WEEKLY_ROLLOUT } from '../projects/Space-Shooter/tracks/weeklyRollout.js';
import { weeklyAccess, canLaunchWeeklyMode } from '../projects/Space-Shooter/systems/weeklyAccess.js';
import { week2WinnerLivery } from '../projects/Space-Shooter/systems/weeklyRewards.js';
import { decodeShipCode } from '../projects/Space-Shooter/systems/shipShare.js';

const w1 = WEEKLY_EVENTS[0];
const w2 = { ...WEEK2_DRAFT, enabled: true, track: w1.track };
const liveRollout = { ...WEEKLY_ROLLOUT, enabled: true };

test('draft and retirement stay disabled; no owner track is guessed', () => {
  assert.equal(WEEK2_DRAFT.enabled, false);
  assert.equal(WEEK2_DRAFT.track, null);
  assert.equal(WEEKLY_ROLLOUT.enabled, false);
  assert.equal(currentWeekly(Date.parse(w2.opensAt)).id, 'weekly-01');
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: WEEK2_DRAFT, preview: true }), false);
  assert.equal(weeklyAccess('full', Date.parse(w2.opensAt)), 'open');
});

test('feature the live week, then newest live during overlap; Gantry remains selectable', () => {
  const events = [w1, w2];
  const open = Date.parse(w2.opensAt), close = Date.parse(w1.closesAt);
  assert.equal(currentWeekly(open - 1, events).id, 'weekly-01');
  assert.equal(currentWeekly(open, events).id, 'weekly-02');
  assert.equal(weeklyAccess('weekly-01', close - 1, liveRollout), 'open');
  assert.equal(weeklyAccess('weekly-01', close, liveRollout), 'retired');
  assert.equal(weeklyAccess('full', open, liveRollout), 'legacy');
  assert.equal(weeklyAccess('dogfight', open, liveRollout), 'week2-only');
  assert.equal(weeklyAccess('weekly-02', Date.parse(w2.closesAt), liveRollout), 'retired');
  assert.equal(weeklyAccess('full', Date.parse(w2.closesAt) + 1, liveRollout), 'legacy');
});

test('site and Hub release configuration and every gate boundary match', {
  skip: !existsSync(new URL('../../hub/api/games/stardust/rules.json', import.meta.url)),
}, () => {
  const rules = JSON.parse(readFileSync(new URL('../../hub/api/games/stardust/rules.json', import.meta.url)));
  assert.deepEqual(rules.weeklyRollout, WEEKLY_ROLLOUT);
  const require = createRequire(import.meta.url);
  const { weeklyAccess: hubAccess } = require('../../hub/api/lib/games/weeklyAccess.js');
  for (const t of [Date.parse(w2.opensAt) - 1, Date.parse(w2.opensAt), Date.parse(w1.closesAt) - 1, Date.parse(w1.closesAt), Date.parse(w2.closesAt)]) {
    for (const board of [...WEEKLY_ROLLOUT.legacyBoards, 'weekly-01', 'weekly-02', 'dogfight']) {
      assert.equal(hubAccess({ weeklyRollout: liveRollout }, board, new Date(t)), weeklyAccess(board, t, liveRollout), `${board} at ${t}`);
    }
  }
});

test('winner-named livery requires final results and uses the existing share format', () => {
  const results = { id: 'weekly-02', status: 'final', finalizedAt: '2026-10-14T05:00:00Z', awards: [{ rank: 1, username: 'nova' }], rewards: { namedHull: { family: 'courier' } } };
  const reward = week2WinnerLivery(results);
  assert.equal(reward.name, "nova's courier");
  assert.equal(reward.appearance.family, 'courier');
  assert.deepEqual(decodeShipCode(reward.shipCode), reward.appearance);
  assert.equal(week2WinnerLivery({ ...results, status: 'live' }), null);
  assert.equal(week2WinnerLivery({ ...results, awards: [{ rank: 1, username: '<script>' }] }), null);
  assert.equal(week2WinnerLivery({ ...results, awards: [...results.awards, ...results.awards] }), null);
});

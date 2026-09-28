// The custom track's release timer and hangar states (systems/customTrack.js),
// shared by the hangar card, the Stardust landing page and the editor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  releaseCountdown, releaseText, customTrackView, parseCustomQuery, isCustomTrackLive, readDraft, pickTrackFields, DRAFT_KEY,
} from '../projects/Space-Shooter/systems/customTrack.js';
import { CUSTOM_TRACK } from '../projects/Space-Shooter/tracks/custom-track.js';

const RELEASE = '2026-09-29T19:00:00-07:00';
const AT = Date.parse(RELEASE);
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

test('the countdown reads days, then hh:mm:ss, and never shows zero before release', () => {
  assert.deepEqual(releaseCountdown(RELEASE, AT - (D + 4 * H + 12 * M + 33 * S)), { valid: true, released: false, remainingMs: D + 4 * H + 12 * M + 33 * S, label: '1d 04:12:33' });
  assert.equal(releaseCountdown(RELEASE, AT - (4 * H + 12 * M + 33 * S)).label, '04:12:33');
  assert.equal(releaseCountdown(RELEASE, AT - (3 * D)).label, '3d 00:00:00');
  // Seconds round up: 0.4 s left is still 00:00:01, not released.
  const last = releaseCountdown(RELEASE, AT - 400);
  assert.equal(last.released, false);
  assert.equal(last.label, '00:00:01');
  assert.equal(last.remainingMs, 400);
});

test('at and after the release time it is released', () => {
  assert.deepEqual(releaseCountdown(RELEASE, AT), { valid: true, released: true, remainingMs: 0, label: '00:00:00' });
  assert.equal(releaseCountdown(RELEASE, AT + D).released, true);
  // The offset matters: 19:00 at UTC-7 is 02:00 UTC the next day.
  assert.equal(releaseCountdown(RELEASE, Date.parse('2026-09-30T01:59:59Z')).released, false);
  assert.equal(releaseCountdown(RELEASE, Date.parse('2026-09-30T02:00:00Z')).released, true);
});

test('an unreadable release time is never released', () => {
  for (const bad of ['', 'tomorrow', null, undefined, 42]) {
    const c = releaseCountdown(bad, AT + D);
    assert.equal(c.valid, false);
    assert.equal(c.released, false);
  }
  assert.equal(releaseCountdown(RELEASE, NaN).valid, false);
});

test('the release date reads the same for everyone, with its offset', () => {
  assert.equal(releaseText(RELEASE), '29 Sep 2026, 19:00 UTC-7');
  assert.equal(releaseText('2026-10-01T08:30:00Z'), '1 Oct 2026, 08:30 UTC');
  assert.equal(releaseText('2026-10-01T08:30:00+05:30'), '1 Oct 2026, 08:30 UTC+5:30');
  assert.equal(releaseText('nope'), '');
});

test('the hangar card: locked with a countdown, then open; a placeholder stays shut; previews always fly', () => {
  const real = { ...CUSTOM_TRACK, releaseAt: RELEASE, placeholder: false };
  const locked = customTrackView({ track: real, now: AT - (4 * H + 12 * M + 33 * S) });
  assert.equal(locked.state, 'locked');
  assert.equal(locked.enabled, false);
  assert.equal(locked.button, 'New track in 04:12:33');
  const open = customTrackView({ track: real, now: AT + 1 });
  assert.deepEqual([open.state, open.enabled, open.button], ['open', true, 'Fly the custom track']);
  const placeholder = customTrackView({ track: { ...real, placeholder: true }, now: AT + 1 });
  assert.deepEqual([placeholder.state, placeholder.enabled], ['pending', false]);
  const preview = customTrackView({ track: real, now: AT - D, preview: true });
  assert.deepEqual([preview.state, preview.enabled, preview.button], ['preview', true, 'Preview the custom track']);
  const broken = customTrackView({ track: real, now: AT + 1, valid: false });
  assert.deepEqual([broken.state, broken.enabled], ['invalid', false]);
  assert.equal(customTrackView({ track: real, now: AT + 1, preview: true, valid: false }).enabled, false);
  assert.equal(customTrackView({ track: { ...real, releaseAt: 'soon' }, now: AT + 1 }).state, 'invalid');
});

test('the Stardust page shows Play and the board only for a released, real track', () => {
  const real = { ...CUSTOM_TRACK, releaseAt: RELEASE, placeholder: false };
  assert.equal(isCustomTrackLive(real, AT - 1), false);
  assert.equal(isCustomTrackLive(real, AT), true);
  assert.equal(isCustomTrackLive({ ...real, placeholder: true }, AT + D), false);
});

test('launch flags: ?track=custom focuses the card, ?preview=custom previews, draft only with preview', () => {
  assert.deepEqual(parseCustomQuery(''), { preview: false, draft: false, focus: false });
  assert.deepEqual(parseCustomQuery('?track=custom'), { preview: false, draft: false, focus: true });
  assert.deepEqual(parseCustomQuery('?preview=custom'), { preview: true, draft: false, focus: true });
  assert.deepEqual(parseCustomQuery('?preview=custom&draft=1'), { preview: true, draft: true, focus: true });
  assert.deepEqual(parseCustomQuery('?draft=1'), { preview: false, draft: false, focus: false });
  assert.deepEqual(parseCustomQuery('?preview=other&lab'), { preview: false, draft: false, focus: false });
});

test('an editor draft is read defensively: only track fields, with the right types', () => {
  const store = (value) => ({ getItem: (key) => (key === DRAFT_KEY ? value : null) });
  assert.match(readDraft(store(null)).error, /No editor draft/);
  assert.match(readDraft(store('{oops')).error, /damaged/);
  assert.match(readDraft({ getItem() { throw new Error('blocked'); } }).error, /blocked/);
  const { track } = readDraft(store(JSON.stringify({ ...CUSTOM_TRACK, id: 'hack', title: 'X'.repeat(500), script: '<img onerror=1>', points: [[1, 'a']] })));
  assert.equal(track.id, 'custom-track');
  assert.equal(track.title.length, 60);
  assert.equal('script' in track, false);
  assert.deepEqual(track.points, [[1, undefined]]);
  assert.deepEqual(Object.keys(pickTrackFields({})).sort(), ['apexes', 'id', 'landmark', 'lesson', 'music', 'points', 'releaseAt', 'rocks', 'rumor', 'title', 'version', 'width'].sort());
});

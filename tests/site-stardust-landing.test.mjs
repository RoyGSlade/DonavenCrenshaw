import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SHIP_STYLES } from '../projects/Space-Shooter/systems/shipLivery.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const landing = read('content/stardust/index.md');
const home = read('content/index.md');

test('Stardust landing keeps the launch route and all garage family names', () => {
  assert.match(landing, /href="games\/stardust\/" data-sd-play>Play now/);
  for (const { name } of SHIP_STYLES) assert.ok(landing.includes(name), name);
  assert.match(landing, /own stats and hitbox/);
  assert.match(landing, /ranked weekly attempts/);
  assert.match(landing, /same leaderboards/);
  assert.doesNotMatch(landing, /ranked runs stay.*standard|builds are for practice/i);
});

test('landing separates network challenges, weekly ghosts and casual Dogfight', () => {
  assert.match(landing, /full network, send a challenge link/);
  assert.match(landing, /weekly track, race ghosts/);
  assert.match(landing, /Three-player matches are casual, with no saved rankings or match history/);
  assert.match(landing, /Tilt needs motion support and permission/);
  assert.match(landing, /sync status tells you when they're saved/);
});

test('landing preserves the leaderboard insertion point and labels older screenshots', () => {
  assert.equal(landing.split('<!-- sd-leaderboard -->').length, 2);
  assert.match(landing, /Earlier build screenshots/);
  assert.match(landing, /id="how-it-plays"/);
  assert.match(landing, /id="garage"/);
  assert.match(landing, /id="race-friends"/);
});

test('homepage presents challenges as playable rather than a future milestone', () => {
  assert.match(home, /custom builds in ranked runs/);
  assert.match(home, /href="stardust\/weekly\/"/);
  assert.doesNotMatch(home, />Next<|Friend challenges: find/);
});

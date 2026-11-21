// Playtest 1, item 6: the Tin Duchess's sound bed is a quiet room tone.
import test from 'node:test';
import assert from 'node:assert/strict';

test('item 6: every Tin Duchess room plays the quiet ship bed, at least 12 dB under the old hangar bed', async () => {
  const { bedIdFor, ambienceFor, AMBIENCE } = await import('../projects/Space-Shooter/voyage/ui/assets.js');
  for (const room of ['duchess-mess', 'duchess-pad', 'duchess-corridor', 'duchess-holodeck']) assert.equal(bedIdFor('ship-hum', room), 'ship', room);
  assert.equal(bedIdFor('hangar', 'hangar'), 'hangar', 'the real hangar is unchanged');
  assert.equal(bedIdFor('workshop', 'workshop'), 'workshop');
  const db = 20 * Math.log10(AMBIENCE.ship.gain / AMBIENCE.hangar.gain);
  assert.ok(db <= -11.9, `${db.toFixed(1)} dB`);
  assert.ok(ambienceFor('ship', () => 'probably').url.endsWith('hangar-hum.ogg'));
});

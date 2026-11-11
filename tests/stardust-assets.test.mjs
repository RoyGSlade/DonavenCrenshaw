// Stardust round 2: the cast art, voice and ambience that ship with the game. Every file the asset maps
// name exists; no scratch (placeholder) voice ships; no lhc-lanes path leaks into shipped files; the
// folders stay under a size budget. Node only, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST_DATA } from '../projects/Space-Shooter/voyage/story/data/cast.js';
import { CAST, CAST_IDS, castPortrait as storyPortrait } from '../projects/Space-Shooter/voyage/story/cast.js';
import { VOICE, VOICE_MS, voiceUrl, voiceMs, loadScratchVoice, scratchRequested, SCRATCH_ROUTE } from '../projects/Space-Shooter/voyage/story/voice.js';
import { LINES } from '../projects/Space-Shooter/voyage/story/lines.js';
import { castPortrait as uiPortrait, CAST_PORTRAITS, AMBIENCE, ambienceFor } from '../projects/Space-Shooter/voyage/ui/assets.js';
import { CAST_FILES, CAST_LOOK, CAPTAIN_LOOKS, captainLookId } from '../projects/Space-Shooter/voyage/onfoot/assets.js';
import { shippableLines, voiceBlock } from '../scripts/stardust-assets.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const voyage = path.join(repo, 'projects', 'Space-Shooter', 'voyage');
const FACES = ['neutral', 'happy', 'annoyed'];
const SHIPPED_IDS = [...CAST_IDS.filter((id) => id !== 'narrator'), 'cap-a', 'cap-b', 'cap-c', 'cap-d'];

/** Budget for everything the cast and audio add (bytes). Now about 3.9 MB (1.7 MB of beds and 2.3 MB added here); the rest is room for the real voices. */
const BUDGET_BYTES = 14 * 1024 * 1024;

function dirSize(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}
function files(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out); else out.push(p);
  }
  return out;
}
const fromUrl = (url) => fileURLToPath(url);

test('portraits: every cast member and captain look has three expressions, all files present, small', () => {
  for (const id of SHIPPED_IDS) {
    const set = CAST_DATA.portraits[id];
    assert.ok(set, `${id} has portraits`);
    for (const face of FACES) {
      const file = path.join(voyage, 'art', 'cast', set[face]);
      assert.ok(existsSync(file), `${id} ${face}: ${set[face]}`);
      assert.match(set[face], /\.webp$/);
      assert.ok(statSync(file).size < 60_000, `${id} ${face} is small`);
    }
  }
  for (const id of Object.keys(CAST_DATA.portraits)) assert.ok(SHIPPED_IDS.includes(id), `${id} in portraits is a cast id or captain look`);
});

test('portraits: story and the hangar give the same file for the same face; emotions map to expressions', () => {
  for (const id of SHIPPED_IDS) {
    for (const emotion of ['neutral', 'warm', 'grumpy', undefined]) {
      assert.equal(uiPortrait(id, emotion), storyPortrait(id, emotion), `${id} ${emotion}`);
    }
  }
  assert.match(uiPortrait('chibby', 'warm'), /chibby-happy\.webp$/);
  assert.match(uiPortrait('mel', 'grumpy'), /mel-annoyed\.webp$/);
  assert.match(uiPortrait('hask'), /hask-neutral\.webp$/, 'the givers use the cast lane art, not the old art.js portraits');
  assert.match(uiPortrait('p2', 'neutral'), /cap-b-neutral\.webp$/, 'hangar look ids p1..p4 are the captain looks');
  assert.equal(uiPortrait('nobody'), null);
  assert.equal(CAST_PORTRAITS, CAST_DATA.portraits, 'one source of truth');
  assert.ok(CAST.hask && uiPortrait('narrator') === null, 'the narrator has no face');
});

test('cast sprites: every CAST_FILES file exists, 128 px WebP, captain looks chosen by look id', () => {
  for (const [id, file] of Object.entries(CAST_FILES)) {
    assert.ok(file, `${id} has a sprite`);
    const p = path.join(voyage, 'onfoot', 'art', 'cast', file);
    assert.ok(existsSync(p), `${id}: ${file}`);
    assert.ok(statSync(p).size < 20_000, `${id} sprite is small`);
    const look = CAST_LOOK[id];
    assert.ok(look && look.scale > 1 && look.scale < 3, `${id} has a sane scale (${look?.scale})`);
  }
  for (const file of Object.values(CAPTAIN_LOOKS)) assert.ok(existsSync(path.join(voyage, 'onfoot', 'art', 'cast', file)), file);
  assert.deepEqual(['cap-a', 'cap-b', 'cap-c', 'cap-d'], Object.keys(CAPTAIN_LOOKS));
  assert.equal(captainLookId('p3'), 'cap-c');
  assert.equal(captainLookId('cap-d'), 'cap-d');
  assert.equal(captainLookId('nonsense'), 'cap-a');
  assert.equal(captainLookId(undefined), 'cap-a');
  const head = readFileSync(path.join(voyage, 'onfoot', 'art', 'cast', 'chibby.webp')).subarray(0, 12).toString('latin1');
  assert.ok(head.startsWith('RIFF') && head.endsWith('WEBP'), 'a real WebP file');
});

test('voice: every VOICE file exists and is a small mp3; each is a real line; no scratch voice ships', () => {
  const ids = new Set(LINES.map((l) => l.id));
  for (const [id, file] of Object.entries(VOICE)) {
    const p = path.join(voyage, 'audio', 'voice', file);
    assert.ok(existsSync(p), `${id}: ${file}`);
    assert.match(file, /\.mp3$/);
    assert.ok(statSync(p).size <= 200_000, `${id} is small`);
    assert.equal(voiceUrl(id), new URL(`../audio/voice/${file}`, new URL('../projects/Space-Shooter/voyage/story/voice.js', import.meta.url)).href);
    assert.ok(voiceMs(id) === (VOICE_MS[id] || 0));
  }
  assert.ok(Object.keys(VOICE).every((id) => ids.has(id) || id.startsWith('ralph.')), 'VOICE names known lines');
  assert.equal(voiceUrl('no.such.line'), null);
  // Everything under audio/voice is in the map (no stray or placeholder file).
  const dir = path.join(voyage, 'audio', 'voice');
  const onDisk = existsSync(dir) ? files(dir).map((f) => path.relative(dir, f).split(path.sep).join('/')) : [];
  assert.deepEqual(onDisk.sort(), Object.values(VOICE).sort());
  // The voice lane's manifest (only on a machine that has it) must not mark any shipped file scratch.
  const manifestPath = path.join(process.env.HOME || '', 'Desktop', 'lhc-lanes', 'stardust', 'voice', 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const id of Object.keys(VOICE)) assert.notEqual(manifest.lines[id]?.scratch, true, `${id} is a scratch placeholder and must not ship`);
    for (const f of onDisk) assert.ok(!f.includes('scratch'), f);
  }
});

test('voice generator: scratch lines never ship, real lines map to speaker/id.mp3, the block is stable', () => {
  const manifest = { lines: {
    'chibby.ship.1': { file: 'lines/chibby/chibby.ship.1.mp3', speaker: 'chibby', durationMs: 2310.4, scratch: true },
    'chibby.ship.2': { file: 'lines/chibby/chibby.ship.2.mp3', speaker: 'chibby', durationMs: 1800, scratch: false },
    'ralph.open.1': { file: 'lines-scratch/ralph/ralph.open.1.mp3', speaker: 'ralph', durationMs: 1250 },
    'Bad Id': { file: 'x.mp3', speaker: 'x' },
    'mel.nofile': { speaker: 'mel' },
  } };
  const lines = shippableLines(manifest);
  assert.deepEqual(lines.map((l) => [l.id, l.rel, l.ms]), [['chibby.ship.2', 'chibby/chibby.ship.2.mp3', 1800], ['ralph.open.1', 'ralph/ralph.open.1.mp3', 1250]]);
  const block = voiceBlock(lines);
  assert.match(block, /^\/\/ BEGIN GENERATED/);
  assert.match(block, /"chibby\.ship\.2": "chibby\/chibby\.ship\.2\.mp3"/);
  assert.equal(voiceBlock(shippableLines(manifest)), block);
  assert.match(voiceBlock([]), /VOICE = Object\.freeze\(\{\}\)/);
});

test('voice: scratch audio is dev only (local page + ?voice=scratch), silent on any failure, never in VOICE', async () => {
  const at = (hostname, search = '') => ({ hostname, search, origin: `http://${hostname}:4173` });
  assert.equal(scratchRequested(at('127.0.0.1', '?voice=scratch')), true);
  assert.equal(scratchRequested(at('localhost', '?x=1&voice=scratch')), true);
  assert.equal(scratchRequested(at('127.0.0.1', '')), false);
  assert.equal(scratchRequested(at('donavencrenshaw.com', '?voice=scratch')), false, 'never on the real site');
  assert.equal(scratchRequested(null), false);
  let calls = 0;
  const fetchFn = async (url) => { calls += 1; assert.equal(url, `http://127.0.0.1:4173${SCRATCH_ROUTE}manifest.json`); return { ok: true, json: async () => ({ lines: { 'chibby.ship.1': { file: 'lines-scratch/chibby/chibby.ship.1.mp3', durationMs: 2000 }, 'evil.1': { file: '../../etc/x.mp3' } } }) }; };
  assert.equal(await loadScratchVoice({ loc: at('example.com', '?voice=scratch'), fetchFn }), 0);
  assert.equal(calls, 0, 'no request off localhost');
  assert.equal(await loadScratchVoice({ loc: at('127.0.0.1'), fetchFn }), 0);
  assert.equal(calls, 0, 'no request without ?voice=scratch');
  assert.equal(await loadScratchVoice({ loc: at('127.0.0.1', '?voice=scratch'), fetchFn: async () => ({ ok: false }) }), 0, '404 = text only');
  assert.equal(await loadScratchVoice({ loc: at('127.0.0.1', '?voice=scratch'), fetchFn: async () => { throw new Error('refused'); } }), 0, 'network failure = text only');
  assert.equal(voiceUrl('chibby.ship.1'), null);
  assert.equal(await loadScratchVoice({ loc: at('127.0.0.1', '?voice=scratch'), fetchFn }), 1);
  assert.equal(voiceUrl('chibby.ship.1'), `http://127.0.0.1:4173${SCRATCH_ROUTE}lines-scratch/chibby/chibby.ship.1.mp3`);
  assert.equal(voiceMs('chibby.ship.1'), 2000);
  assert.equal(voiceUrl('evil.1'), null, 'path tricks are refused');
  assert.equal(VOICE['chibby.ship.1'], undefined, 'scratch never enters the shipped map');
});

test('ambience: every bed in AMBIENCE has both files, small enough, and both formats resolve', () => {
  for (const id of ['hangar', 'workshop', 'den']) assert.ok(AMBIENCE[id], id);
  for (const [id, bed] of Object.entries(AMBIENCE)) {
    for (const ext of ['ogg', 'mp3']) {
      const p = path.join(voyage, 'ui', bed[ext]);
      assert.ok(existsSync(p), `${id}.${ext}`);
      assert.ok(statSync(p).size < 1_000_000, `${id}.${ext} under 1 MB`);
    }
    assert.match(ambienceFor(id, (t) => (t.includes('ogg') ? 'probably' : '')).url, /\.ogg$/);
    assert.match(ambienceFor(id, () => '').url, /\.mp3$/);
    assert.ok(existsSync(fromUrl(ambienceFor(id, () => 'maybe').url)));
  }
  const lanes = ['tinker-bench', 'night-shift'].flatMap((n) => ['ogg', 'mp3'].map((e) => statSync(path.join(voyage, 'audio', 'ambience', `${n}.${e}`)).size));
  assert.ok(lanes.reduce((a, b) => a + b, 0) < 2.5 * 1024 * 1024, 'the two new beds together stay under 2.5 MB');
});

test('shipped files do not point at lhc-lanes (the only dev hook is the /__stardust-scratch-voice route)', () => {
  const skip = /\.(webp|png|jpg|jpeg|ogg|mp3|woff2?|json|md)$/i; // JSON holds prose ("about" notes), not paths the game loads
  for (const f of files(voyage)) {
    if (skip.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    // Prose in comments may name the lane folder; code and strings must not.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !/^\s*\/\//.test(line)).map((line) => line.replace(/\s\/\/ .*$/, '')).join('\n');
    assert.ok(!/lhc-lanes/.test(code), `${path.relative(repo, f)} names lhc-lanes in code`);
  }
  const voiceJs = readFileSync(path.join(voyage, 'story', 'voice.js'), 'utf8');
  assert.match(voiceJs, /__stardust-scratch-voice/);
  const server = readFileSync(path.join(repo, 'scripts', 'preview-stardust.mjs'), 'utf8');
  assert.match(server, /STARDUST_SCRATCH_VOICE/);
  assert.match(server, /scratchRealRoot && requestPath\.startsWith/, 'the route exists only when the variable is set');
});

test('size budget: cast portraits + cast sprites + audio stay under 14 MB', () => {
  const sizes = ['art/cast', 'onfoot/art/cast', 'audio'].map((d) => dirSize(path.join(voyage, d)));
  const total = sizes.reduce((a, b) => a + b, 0);
  console.log(`# cast portraits ${sizes[0]} B, cast sprites ${sizes[1]} B, audio ${sizes[2]} B, total ${total} B of ${BUDGET_BYTES}`);
  assert.ok(total < BUDGET_BYTES, `${total} bytes is over the budget`);
});

#!/usr/bin/env node
// Stardust round 2: copy the voice lane's shippable audio into the game.
//
//   node scripts/stardust-assets.mjs voice      # real (non-scratch) voice lines -> voyage/audio/voice + story/voice.js
//   node scripts/stardust-assets.mjs ambience   # tinker-bench + night-shift beds (re-encoded small) -> voyage/audio/ambience
//   node scripts/stardust-assets.mjs            # both
//   flags: --dry (print only), --force (re-copy / re-encode existing files), --voice-dir <dir>
//
// Cast art is a separate script (scripts/stardust-art.py, needs PIL).
//
// Voice: reads <voice dir>/manifest.json (default ~/Desktop/lhc-lanes/stardust/voice, or
// STARDUST_VOICE_DIR). Only lines whose entry is not `scratch: true` ship. Their mp3 goes to
// voyage/audio/voice/<speaker>/<line id>.mp3 and VOICE / VOICE_MS in story/voice.js are rewritten
// between the BEGIN/END GENERATED markers. Stale files under audio/voice are pruned. When the
// voice lane re-renders with the real voices, run this again: no code change.
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const voyage = path.join(repoRoot, 'projects', 'Space-Shooter', 'voyage');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const voiceDir = path.resolve(valueOf('--voice-dir') || process.env.STARDUST_VOICE_DIR || path.join(os.homedir(), 'Desktop', 'lhc-lanes', 'stardust', 'voice'));
const dry = flag('--dry');
const force = flag('--force');
const what = args.find((a) => ['voice', 'ambience', 'all'].includes(a)) || 'all';

/** One voice line may be at most this big (mp3 mono 56 kbps is about 7 KB a second). */
export const MAX_LINE_BYTES = 200_000;
const BEGIN = '// BEGIN GENERATED (scripts/stardust-assets.mjs voice)';
const END = '// END GENERATED';

/** The shippable lines of a voice manifest: [{ id, src, rel, bytes, ms }], sorted by id. Pure; used by the test too. */
export function shippableLines(manifest) {
  const out = [];
  for (const [id, line] of Object.entries(manifest?.lines || {})) {
    if (!line || line.scratch === true || typeof line.file !== 'string' || !/\.mp3$/.test(line.file)) continue;
    if (!/^[a-z0-9][a-z0-9.-]{0,47}$/.test(id)) continue;
    const speaker = String(line.speaker || id.split('.')[0]).replace(/[^a-z0-9-]/g, '');
    if (!speaker) continue;
    out.push({ id, src: line.file, rel: `${speaker}/${id}.mp3`, bytes: Number(line.bytes) || 0, ms: Math.round(Number(line.durationMs) || 0) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** The generated block of story/voice.js for a list of shippable lines. */
export function voiceBlock(lines) {
  const map = lines.map((l) => `  ${JSON.stringify(l.id)}: ${JSON.stringify(l.rel)},`).join('\n');
  const ms = lines.filter((l) => l.ms).map((l) => `  ${JSON.stringify(l.id)}: ${l.ms},`).join('\n');
  return [
    BEGIN,
    `export const VOICE = Object.freeze({${map ? `\n${map}\n` : ''}});`,
    '// Known lengths in ms, from the same manifest (optional; reading time is used otherwise).',
    `export const VOICE_MS = Object.freeze({${ms ? `\n${ms}\n` : ''}});`,
    END,
  ].join('\n');
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

async function doVoice() {
  const manifest = JSON.parse(await readFile(path.join(voiceDir, 'manifest.json'), 'utf8'));
  const all = Object.keys(manifest.lines || {}).length;
  const picked = [];
  for (const l of shippableLines(manifest)) {
    const src = path.join(voiceDir, l.src);
    if (!existsSync(src)) { console.warn(`skip ${l.id}: ${src} is missing`); continue; }
    const size = (await stat(src)).size;
    if (size > MAX_LINE_BYTES) { console.warn(`skip ${l.id}: ${size} bytes is over ${MAX_LINE_BYTES}`); continue; }
    picked.push({ ...l, src, bytes: size });
  }
  console.log(`voice: ${picked.length} of ${all} manifest lines are real (not scratch) and small enough; ${all - picked.length} stay text only`);
  const dest = path.join(voyage, 'audio', 'voice');
  const keep = new Set(picked.map((l) => path.join(dest, l.rel)));
  if (!dry) {
    for (const l of picked) {
      const to = path.join(dest, l.rel);
      await mkdir(path.dirname(to), { recursive: true });
      if (force || !existsSync(to) || (await stat(to)).size !== l.bytes) await copyFile(l.src, to);
    }
    for (const f of await walk(dest)) if (!keep.has(f)) { await rm(f); console.log(`pruned ${path.relative(repoRoot, f)}`); }
    const vp = path.join(voyage, 'story', 'voice.js');
    const text = await readFile(vp, 'utf8');
    const a = text.indexOf(BEGIN);
    const b = text.indexOf(END);
    if (a < 0 || b < a) throw new Error('story/voice.js has no BEGIN/END GENERATED markers');
    const next = text.slice(0, a) + voiceBlock(picked) + text.slice(b + END.length);
    if (next !== text) await writeFile(vp, next);
  }
  console.log(`voice: ${picked.reduce((n, l) => n + l.bytes, 0)} bytes of mp3 ${dry ? '(dry run, nothing written)' : 'copied'}`);
}

// Beds approved for the game. hangar-hum is already in the repo; the other two are re-encoded
// to about 80 kbps (the lane's files are 160-180 kbps) so the three beds stay small.
const BEDS = ['hangar-hum', 'tinker-bench', 'night-shift'];
const BED_KBPS = 80;

async function doAmbience() {
  const dest = path.join(voyage, 'audio', 'ambience');
  await mkdir(dest, { recursive: true });
  for (const id of BEDS) {
    const src = path.join(voiceDir, 'ambience', `${id}.ogg`);
    for (const ext of ['ogg', 'mp3']) {
      const to = path.join(dest, `${id}.${ext}`);
      if (existsSync(to) && !force) { console.log(`ambience: ${id}.${ext} already in the repo`); continue; }
      if (!existsSync(src)) { console.warn(`ambience: ${src} is missing`); continue; }
      const codec = ext === 'ogg' ? ['-c:a', 'libvorbis'] : ['-c:a', 'libmp3lame'];
      const cmd = ['-y', '-v', 'error', '-i', src, '-vn', '-map_metadata', '-1', ...codec, '-b:a', `${BED_KBPS}k`, to];
      console.log(`ambience: ffmpeg ${cmd.join(' ')}`);
      if (!dry) { const r = spawnSync('ffmpeg', cmd, { stdio: 'inherit' }); if (r.status !== 0) throw new Error(`ffmpeg failed for ${id}.${ext}`); }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (what === 'voice' || what === 'all') await doVoice();
  if (what === 'ambience' || what === 'all') await doAmbience();
}

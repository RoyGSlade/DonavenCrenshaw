// Optional technical audio QA. No subjective listening or seamless-loop claim.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const page = await browser.newPage();
const errors = [], failures = [], playback = [], decoding = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (['warning','error'].includes(message.type())) errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) failures.push({ url: response.url(), status: response.status() }); });
const evidence = 'docs/stardust/evidence';
await mkdir(evidence, { recursive: true });
try {
  await page.goto(process.env.STARDUST_TEST_URL || 'http://127.0.0.1:4173/projects/Space-Shooter/');
  await page.waitForFunction(() => !document.getElementById('starmap-start-btn').disabled);
  await page.evaluate(async () => { window.__audioQA = await import('./audio.js'); });
  const beforeGesture = await page.evaluate(() => window.__audioQA.getMusicStatus());
  assert.equal(beforeGesture.requested, 'menu'); assert.equal(beforeGesture.current, null);
  await page.locator('#starmap-settings-btn-start').click();
  const cues = await page.evaluate(async () => Object.keys((await import('./systems/music.js')).MUSIC_CUES));
  for (const cue of cues) {
    await page.evaluate(track => window.__audioQA.playMusic(track), cue);
    await page.waitForFunction(track => {
      const status = window.__audioQA.getMusicStatus();
      return status.current?.track === track && status.current.playing && status.current.readyState >= 3 && status.current.time > 0.15 && !status.outgoing;
    }, cue);
    const first = await page.evaluate(() => window.__audioQA.getMusicStatus());
    await page.waitForTimeout(180);
    const second = await page.evaluate(() => window.__audioQA.getMusicStatus());
    assert.ok(second.current.time > first.current.time, `${cue} playhead must advance`);
    playback.push(second.current);
    const decoded = await page.evaluate(async track => {
      const cue = (await import('./systems/music.js')).MUSIC_CUES[track];
      const bytes = await fetch(`../../assets/audio/stardust/${cue.file}`).then(response => {
        if (!response.ok) throw new Error(`Media HTTP ${response.status}`); return response.arrayBuffer();
      });
      const context = new OfflineAudioContext(2, 1, 48000);
      const buffer = await context.decodeAudioData(bytes);
      let peak = 0, energy = 0, nonFinite = 0, overFullScale = 0, firstSignal = buffer.length, lastSignal = -1;
      // -60 dBFS threshold; descriptive measurement, not perceptual loudness.
      const threshold = 0.001;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) {
          const value = samples[i], amplitude = Math.abs(value);
          if (!Number.isFinite(value)) { nonFinite++; continue; }
          peak = Math.max(peak, amplitude); energy += value * value;
          if (amplitude > 1) overFullScale++;
          if (amplitude > threshold) { firstSignal = Math.min(firstSignal, i); lastSignal = Math.max(lastSignal, i); }
        }
      }
      return { track, file: cue.file, decoded: true, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels,
        durationSeconds: buffer.duration, peak, peakDbfs: 20 * Math.log10(peak),
        rmsDbfs: 20 * Math.log10(Math.sqrt(energy / (buffer.length * buffer.numberOfChannels))),
        nonFiniteSamples: nonFinite, samplesOverFullScale: overFullScale,
        leadingBelowThresholdSeconds: firstSignal / buffer.sampleRate,
        trailingBelowThresholdSeconds: (buffer.length - 1 - lastSignal) / buffer.sampleRate,
      };
    }, cue);
    assert.equal(decoded.nonFiniteSamples, 0); assert.ok(decoded.peak > 0); assert.ok(decoded.durationSeconds > 10);
    decoding.push(decoded);
  }
  // Exercise the real settings slider while two tracks are fading.
  await page.evaluate(() => window.__audioQA.playMusic('level1'));
  await page.waitForFunction(() => !!window.__audioQA.getMusicStatus().outgoing);
  await page.locator('#setting-music-vol').focus();
  await page.keyboard.press('Home');
  const muted = await page.evaluate(() => window.__audioQA.getMusicStatus());
  assert.equal(muted.current.volume, 0); assert.equal(muted.outgoing.volume, 0);
  await page.locator('#settings-cancel-btn').click();
  await page.evaluate(() => { window.__audioQA.stopMusic(); window.__audioQA.playMusic('menu'); });
  await page.waitForFunction(() => window.__audioQA.getMusicStatus().current?.track === 'menu' && !window.__audioQA.getMusicStatus().outgoing);
  const restored = await page.evaluate(() => window.__audioQA.getMusicStatus());
  assert.ok(restored.current.volume > 0);
  const inventory = JSON.parse(await readFile(`${evidence}/audio-inspection.json`, 'utf8'));
  const integrity = [];
  for (const track of inventory.tracks) {
    const bytes = await readFile(track.runtime_path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, track.sha256);
    integrity.push({ path: track.runtime_path, bytes: bytes.length, sha256, matchesInspectedSource: true });
  }
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  const report = { inspectedAt: new Date().toISOString(), browser: await browser.version(), beforeGesture, playback, decoding,
    integrity, muted, restored, errors, failures,
    limitations: ['Technical decoding/playhead/volume tests, not a listening review.', 'RMS is not LUFS; no normalization or loop editing was performed.', 'A -60 dBFS threshold describes near-silence; it does not establish a seamless musical loop.'] };
  await writeFile(`${evidence}/audio-browser.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ decoded: decoding.length, played: playback.length, hashesMatched: integrity.length, errors, failures,
    levels: decoding.map(d => ({ track: d.track, peakDbfs: +d.peakDbfs.toFixed(2), rmsDbfs: +d.rmsDbfs.toFixed(2), leading: +d.leadingBelowThresholdSeconds.toFixed(3), trailing: +d.trailingBelowThresholdSeconds.toFixed(3) })) }, null, 2));
} finally { await browser.close(); }

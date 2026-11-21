// Claw: sounds made in code (Web Audio), so the module ships no audio files. The audio context only starts after a real tap or key.
// A winch hum that rises with reel speed, a cable creak when it goes taut, a scrape on the rock, a clamp when the jaws bite, a knock,
// a slip, a drop, a crack, and the find landing on the bay floor. Everything is quiet and short; `mute()` silences it.

export function makeAudio() {
  let ac = null, master = null, noiseBuf = null, muted = false;
  let hum = null, humGain = null, humLp = null, creakAt = -1, scrapeAt = -1, lampT = -1;
  const ready = () => {
    if (ac) return ac.state !== 'closed';
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let s = 987654321;
      for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    } catch { ac = null; return false; }
    return true;
  };
  const now = () => ac.currentTime;
  const tone = (freq, dur, { type = 'sine', gain = 0.12, slide = 1, delay = 0 } = {}) => {
    if (muted || !ac) return;
    const t = now() + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  };
  const burst = (dur, { freq = 800, q = 1, gain = 0.15, type = 'bandpass', delay = 0, slide = 1 } = {}) => {
    if (muted || !ac) return;
    const t = now() + delay, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = 0.8 + ((t * 7919) % 1) * 0.4;
    f.type = type; f.frequency.setValueAtTime(freq, t); if (slide !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur); f.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.05);
  };
  return {
    unlock() { if (ready() && ac.state === 'suspended') ac.resume?.(); },
    mute(v = true) { muted = v; if (v) this.winch(0); },
    /** The winch: silent at 0, a hum whose pitch and grit rise with the reel speed (0..1 of the way from still to full). */
    winch(speed01, taut = 0) {
      if (!ac) return;
      if (speed01 <= 0.01) { if (humGain) humGain.gain.setTargetAtTime(0.0001, now(), 0.06); return; }
      if (muted) return;
      if (!hum) {
        hum = ac.createOscillator(); humGain = ac.createGain(); humLp = ac.createBiquadFilter();
        hum.type = 'sawtooth'; hum.frequency.value = 70; humLp.type = 'lowpass'; humLp.frequency.value = 420;
        hum.connect(humLp); humLp.connect(humGain); humGain.connect(master); humGain.gain.value = 0.0001; hum.start();
      }
      hum.frequency.setTargetAtTime(62 + speed01 * 150, now(), 0.07);
      humLp.frequency.setTargetAtTime(300 + speed01 * 900, now(), 0.08);
      humGain.gain.setTargetAtTime(0.022 + speed01 * 0.05, now(), 0.06);
      // the cable creaks when it is taut and moving
      const t = now();
      if (taut > 0.3 && t - creakAt > 0.45 - 0.25 * taut) { creakAt = t; tone(520 + taut * 380, 0.16, { type: 'triangle', gain: 0.018 + 0.02 * taut, slide: 0.6 + 0.2 * (1 - taut) }); }
    },
    scrape(loaded = false) { if (!ready()) return; const t = now(); if (t - scrapeAt < 0.1) return; scrapeAt = t; burst(0.12, { freq: loaded ? 1300 : 900, q: 1.4, gain: loaded ? 0.07 : 0.035, slide: 0.7 }); },
    /** The jaws bite: a clank, with a low thud under it. */
    clamp() { if (!ready()) return; tone(210, 0.12, { type: 'square', gain: 0.09, slide: 0.5 }); tone(1180, 0.07, { type: 'triangle', gain: 0.07, delay: 0.01 }); burst(0.18, { freq: 700, q: 3, gain: 0.1 }); tone(90, 0.22, { type: 'sine', gain: 0.12, slide: 0.6, delay: 0.02 }); },
    tear() { if (!ready()) return; burst(0.28, { freq: 1800, q: 0.7, gain: 0.14, type: 'highpass' }); tone(140, 0.3, { type: 'sawtooth', gain: 0.05, slide: 0.5 }); },
    open() { if (!ready()) return; tone(620, 0.09, { type: 'triangle', gain: 0.04, slide: 1.3 }); },
    /** A knock: a thump and a crack of rock. Harder is lower and longer. */
    knock(sev = 0.5) { if (!ready()) return; tone(130 - 40 * sev, 0.2 + 0.1 * sev, { type: 'sine', gain: 0.18, slide: 0.45 }); burst(0.14 + 0.1 * sev, { freq: 1500, q: 0.9, gain: 0.12 + 0.08 * sev, type: 'highpass' }); },
    /** The jaws slip: a short rattle going down. Level 2 is worse. */
    slip(level = 1) { if (!ready()) return; for (let i = 0; i < 2 + level; i++) tone(900 - i * 90 - level * 100, 0.06, { type: 'square', gain: 0.03, delay: i * 0.05 }); },
    buried() { if (!ready()) return; tone(150, 0.16, { type: 'square', gain: 0.07, slide: 0.7 }); burst(0.08, { freq: 500, q: 2, gain: 0.08 }); },
    /** The wall warning: two short ticks, rising. */
    warn() { if (!ready()) return; tone(880, 0.06, { type: 'square', gain: 0.035 }); tone(1180, 0.07, { type: 'square', gain: 0.035, delay: 0.08 }); },
    miss() { if (!ready()) return; tone(320, 0.1, { type: 'triangle', gain: 0.05, slide: 0.7 }); },
    drop() { if (!ready()) return; tone(520, 0.5, { type: 'triangle', gain: 0.09, slide: 0.25 }); burst(0.3, { freq: 900, q: 0.8, gain: 0.1, delay: 0.32 }); tone(80, 0.25, { type: 'sine', gain: 0.16, slide: 0.5, delay: 0.34 }); },
    crack() { if (!ready()) return; burst(0.22, { freq: 2600, q: 0.8, gain: 0.2, type: 'highpass' }); tone(190, 0.25, { type: 'square', gain: 0.08, slide: 0.5 }); },
    shatter() { if (!ready()) return; burst(0.6, { freq: 2200, q: 0.6, gain: 0.25, type: 'highpass' }); tone(90, 0.6, { type: 'sawtooth', gain: 0.1, slide: 0.3 }); },
    /** Coming up into the bay light: a rising shimmer. */
    light() { if (!ready()) return; const t = now(); if (t - lampT < 0.3) return; lampT = t; [440, 660, 880, 1320].forEach((f, i) => tone(f, 0.5, { type: 'sine', gain: 0.04, delay: i * 0.09, slide: 1.04 })); },
    /** The find lands on the bay floor: a thud, a chime. */
    land() { if (!ready()) return; tone(100, 0.3, { type: 'sine', gain: 0.22, slide: 0.45 }); burst(0.12, { freq: 400, q: 1.2, gain: 0.12, type: 'lowpass' }); [784, 1175, 1568].forEach((f, i) => tone(f, 0.45, { type: 'triangle', gain: 0.07, delay: 0.12 + i * 0.1 })); },
    win() { if (!ready()) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.08, delay: i * 0.11 })); },
    lose() { if (!ready()) return; tone(260, 0.55, { type: 'triangle', gain: 0.08, slide: 0.45 }); },
    destroy() { try { hum?.stop(); } catch { /* already stopped */ } try { ac?.close(); } catch { /* closed */ } ac = null; hum = null; humGain = null; },
  };
}

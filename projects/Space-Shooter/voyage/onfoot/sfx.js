// Sound effects for on-foot play, made in Web Audio so every action has a sound before real recordings exist (opening B, outcome 7).
// A page can pass its own play(id) instead (ids: events.js SOUNDS). Never throws, no files.
//
// What is here: footsteps, doors, shots, hits, hurt, kills, pickups, unlocks and the breach (the alarm klaxon and the torch are loops:
// sound.loop(id, on)). What is NOT here, and wants real recordings (listed in opening-b/READY): foot foley by surface, real door
// foley (the slide and the cycle hiss), gun shots by weapon, flesh and metal hits, a recorded klaxon, a recorded cutting torch, a
// recorded breach explosion, UI clicks, the tense music cue (composed), and every voice (hooks only: bus 'voice:line').
let ctx = null;
let noiseBuf = null;

const get = () => {
  ctx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};
const noiseBuffer = (c) => {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
};

/** One oscillator note: freq slides by `slide` Hz over its length, with a fast attack and an exponential fall. */
function tone(c, out, at, { freq, len, type = 'sine', gain = 0.1, slide = 0 }) {
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), at + len);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  osc.connect(g).connect(out);
  osc.start(at); osc.stop(at + len + 0.03);
}
/** A burst of filtered noise: the filter sweeps from `from` to `to` Hz. */
function noise(c, out, at, { len, type = 'lowpass', from = 1200, to = 300, gain = 0.1, q = 0.8 }) {
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, to), at + len);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random()); src.stop(at + len + 0.03);
}

// The recipes. t = the start time; v = a little random variation (footsteps never repeat exactly).
const RECIPES = {
  step: (c, o, t, v) => { noise(c, o, t, { len: 0.07, type: 'bandpass', from: 380 + v * 160, to: 180, gain: 0.2, q: 1.2 }); tone(c, o, t, { freq: 95 + v * 30, len: 0.06, type: 'sine', gain: 0.12, slide: -40 }); },
  door: (c, o, t) => { noise(c, o, t, { len: 0.38, type: 'lowpass', from: 400, to: 2200, gain: 0.16 }); tone(c, o, t + 0.34, { freq: 110, len: 0.16, type: 'triangle', gain: 0.16, slide: -50 }); },
  talk: (c, o, t) => tone(c, o, t, { freq: 660, len: 0.06, type: 'sine', gain: 0.07, slide: 80 }),
  shot: (c, o, t, v) => { noise(c, o, t, { len: 0.11, type: 'highpass', from: 2400, to: 700, gain: 0.2 }); tone(c, o, t, { freq: 900 + v * 120, len: 0.1, type: 'square', gain: 0.11, slide: -650 }); },
  hit: (c, o, t) => { noise(c, o, t, { len: 0.09, type: 'bandpass', from: 900, to: 300, gain: 0.2, q: 1.5 }); tone(c, o, t, { freq: 190, len: 0.09, type: 'square', gain: 0.12, slide: -110 }); },
  hurt: (c, o, t) => { tone(c, o, t, { freq: 210, len: 0.22, type: 'sawtooth', gain: 0.16, slide: -110 }); noise(c, o, t, { len: 0.12, type: 'lowpass', from: 900, to: 200, gain: 0.18 }); },
  kill: (c, o, t) => { noise(c, o, t, { len: 0.4, type: 'lowpass', from: 2400, to: 160, gain: 0.22 }); tone(c, o, t, { freq: 120, len: 0.35, type: 'sawtooth', gain: 0.13, slide: -80 }); },
  dash: (c, o, t) => noise(c, o, t, { len: 0.16, type: 'bandpass', from: 500, to: 2600, gain: 0.14 }),
  guard: (c, o, t) => tone(c, o, t, { freq: 1200, len: 0.14, type: 'triangle', gain: 0.1, slide: -400 }),
  drill: (c, o, t) => tone(c, o, t, { freq: 95, len: 0.09, type: 'sawtooth', gain: 0.06, slide: 10 }),
  crack: (c, o, t) => { noise(c, o, t, { len: 0.16, type: 'highpass', from: 1800, to: 600, gain: 0.16 }); tone(c, o, t, { freq: 260, len: 0.12, type: 'square', gain: 0.08, slide: -200 }); },
  jam: (c, o, t) => tone(c, o, t, { freq: 100, len: 0.34, type: 'sawtooth', gain: 0.13, slide: -45 }),
  ore: (c, o, t) => tone(c, o, t, { freq: 990, len: 0.14, type: 'triangle', gain: 0.1, slide: 300 }),
  turn: (c, o, t) => tone(c, o, t, { freq: 520, len: 0.05, type: 'triangle', gain: 0.07, slide: 60 }),
  power: (c, o, t) => tone(c, o, t, { freq: 440, len: 0.4, type: 'sine', gain: 0.1, slide: 440 }),
  unlock: (c, o, t) => { tone(c, o, t, { freq: 660, len: 0.18, type: 'triangle', gain: 0.1, slide: 0 }); tone(c, o, t + 0.12, { freq: 990, len: 0.3, type: 'triangle', gain: 0.1, slide: 0 }); },
  scan: (c, o, t) => tone(c, o, t, { freq: 740, len: 0.2, type: 'sine', gain: 0.08, slide: 200 }),
  boost: (c, o, t) => tone(c, o, t, { freq: 160, len: 0.25, type: 'sawtooth', gain: 0.07, slide: 260 }),
  bump: (c, o, t) => tone(c, o, t, { freq: 80, len: 0.18, type: 'square', gain: 0.11, slide: -25 }),
  dock: (c, o, t) => tone(c, o, t, { freq: 330, len: 0.5, type: 'sine', gain: 0.09, slide: -110 }),
  // opening B: new
  pickup: (c, o, t) => { tone(c, o, t, { freq: 880, len: 0.1, type: 'sine', gain: 0.1 }); tone(c, o, t + 0.07, { freq: 1320, len: 0.18, type: 'sine', gain: 0.1 }); },
  thud: (c, o, t) => { tone(c, o, t, { freq: 95, len: 0.3, type: 'sine', gain: 0.2, slide: -55 }); noise(c, o, t, { len: 0.12, type: 'lowpass', from: 500, to: 120, gain: 0.14 }); },
  boots: (c, o, t) => { for (let i = 0; i < 4; i++) { noise(c, o, t + i * 0.16, { len: 0.08, type: 'bandpass', from: 320, to: 150, gain: 0.16, q: 1.1 }); tone(c, o, t + i * 0.16, { freq: 80, len: 0.07, type: 'sine', gain: 0.12, slide: -30 }); } },
  breach: (c, o, t) => { noise(c, o, t, { len: 0.9, type: 'lowpass', from: 3200, to: 120, gain: 0.34 }); tone(c, o, t, { freq: 70, len: 0.7, type: 'sine', gain: 0.3, slide: -40 }); noise(c, o, t + 0.05, { len: 0.3, type: 'highpass', from: 4000, to: 1200, gain: 0.16 }); },
};

/** Loops: the klaxon and the torch. start(c, out) returns stop(). */
const LOOPS = {
  // Two alternating tones, a siren on a square wave through a low-pass, on and off in half-second pulses.
  klaxon: (c, out) => {
    const osc = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    osc.type = 'square'; f.type = 'lowpass'; f.frequency.value = 1500; g.gain.value = 0;
    osc.connect(f).connect(g).connect(out);
    const t0 = c.currentTime;
    for (let i = 0; i < 240; i++) { const at = t0 + i * 0.5; osc.frequency.setValueAtTime(i % 2 ? 380 : 560, at); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.11, at + 0.04); g.gain.setValueAtTime(0.11, at + 0.4); g.gain.linearRampToValueAtTime(0.0001, at + 0.48); }
    osc.start(t0);
    return () => { try { g.gain.cancelScheduledValues(c.currentTime); g.gain.setTargetAtTime(0.0001, c.currentTime, 0.04); osc.stop(c.currentTime + 0.2); } catch { /* done */ } };
  },
  // A hiss with crackle: high-passed noise with a slow flutter.
  torch: (c, out) => {
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    src.buffer = noiseBuffer(c); src.loop = true; f.type = 'highpass'; f.frequency.value = 2600; g.gain.value = 0.05;
    lfo.frequency.value = 14; lg.gain.value = 0.03; lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(out);
    src.start(0, Math.random()); lfo.start();
    return () => { try { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.05); src.stop(c.currentTime + 0.3); lfo.stop(c.currentTime + 0.3); } catch { /* done */ } };
  },
};

export const SFX_IDS = Object.freeze(Object.keys(RECIPES));
export const LOOP_IDS = Object.freeze(Object.keys(LOOPS));

/**
 * createSfx({ play, muted, volume }) -> sound(id), with sound.loop(id, on) and sound.stopAll().
 * play(id): a page's own player (it gets every id). muted(): true silences all. volume(): 0..1, the page's effects level.
 */
export function createSfx({ play = null, muted = () => false, volume = () => 1 } = {}) {
  const running = new Map(); // loop id -> stop()
  function sound(id) {
    if (play) { try { play(id); } catch { /* the page's player failed; stay quiet */ } return; }
    if (muted()) return;
    const make = RECIPES[id];
    const level = Math.max(0, Math.min(1, volume()));
    if (!make || level <= 0) return;
    try {
      const c = get(), out = c.createGain();
      out.gain.value = level;
      out.connect(c.destination);
      make(c, out, c.currentTime + 0.005, Math.random());
    } catch { /* no audio here */ }
  }
  sound.loop = (id, on) => {
    const start = LOOPS[id];
    if (!start) return false;
    const stop = running.get(id);
    if (!on) { if (stop) { stop(); running.delete(id); } return true; }
    if (running.has(id) || muted() || volume() <= 0) return true;
    try {
      const c = get(), out = c.createGain();
      out.gain.value = Math.max(0, Math.min(1, volume()));
      out.connect(c.destination);
      running.set(id, start(c, out));
    } catch { /* no audio here */ }
    return true;
  };
  sound.stopAll = () => { for (const [id, stop] of running) { try { stop(); } catch { /* done */ } running.delete(id); } };
  sound.running = () => [...running.keys()];
  return sound;
}

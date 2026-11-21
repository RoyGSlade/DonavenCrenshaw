// Crate look sounds, made in code with the Web Audio API (the game has no sound effect files). The module asks the host for a
// sound by id through ctx.sound(id); a host plays it with playSfx(id) from here. Every sound is a short one-shot (under 1.3 s), so
// nothing is left running when the player leaves. No files, no network.
export const SOUND_IDS = ['latch', 'creak', 'thud', 'straw', 'clink', 'thunk', 'chalk', 'deny', 'dig', 'slip', 'rattle'];

let ac = null;
let voices = 0;
let master = null;
const ctxOf = () => {
  if (ac) return ac;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try { ac = new AC(); master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination); } catch { ac = null; }
  return ac;
};

function noise(a, secs) {
  const n = Math.max(1, Math.floor(a.sampleRate * secs));
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < n; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
  return buf;
}
function env(a, g, t0, atk, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + dec);
}
function done(node, t) { voices += 1; node.onended = () => { voices = Math.max(0, voices - 1); }; node.stop(t); }
function tone(a, { type = 'sine', f0, f1, t = 0, atk = 0.004, peak = 0.3, dec = 0.12, q }) {
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; const t0 = a.currentTime + t;
  o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + atk + dec);
  env(a, g, t0, atk, peak, dec); o.connect(g); g.connect(master); o.start(t0); done(o, t0 + atk + dec + 0.05);
  return o;
}
function burst(a, { t = 0, dec = 0.1, peak = 0.3, type = 'bandpass', f = 1800, q = 1, f1 }) {
  const s = a.createBufferSource(); s.buffer = noise(a, dec + 0.1);
  const fl = a.createBiquadFilter(); fl.type = type; const t0 = a.currentTime + t;
  fl.frequency.setValueAtTime(f, t0); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t0 + dec); fl.Q.value = q;
  const g = a.createGain(); env(a, g, t0, 0.004, peak, dec);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t0); done(s, t0 + dec + 0.1);
}

const RECIPES = {
  latch(a) { tone(a, { type: 'square', f0: 1500, f1: 700, peak: 0.12, dec: 0.03 }); tone(a, { type: 'square', f0: 2100, f1: 1100, t: 0.07, peak: 0.1, dec: 0.04 }); burst(a, { t: 0.02, dec: 0.04, f: 3200, q: 2, peak: 0.12 }); },
  creak(a) { const o = tone(a, { type: 'sawtooth', f0: 150, f1: 260, atk: 0.1, peak: 0.07, dec: 0.5 }); o.frequency.setValueCurveAtTime?.(new Float32Array([150, 210, 170, 280, 230, 330]), a.currentTime, 0.6); burst(a, { dec: 0.55, f: 420, f1: 900, q: 6, peak: 0.07 }); },
  thud(a) { tone(a, { f0: 120, f1: 45, peak: 0.55, dec: 0.28 }); burst(a, { dec: 0.12, type: 'lowpass', f: 700, peak: 0.3 }); },
  straw(a) { burst(a, { dec: 0.18, f: 4200, f1: 2400, q: 0.7, peak: 0.16 }); burst(a, { t: 0.07, dec: 0.12, f: 5200, q: 0.8, peak: 0.1 }); },
  clink(a) { tone(a, { f0: 2400, peak: 0.16, dec: 0.28 }); tone(a, { f0: 3560, t: 0.012, peak: 0.1, dec: 0.2 }); burst(a, { dec: 0.03, f: 6000, q: 2, peak: 0.1 }); },
  thunk(a) { tone(a, { f0: 190, f1: 80, peak: 0.4, dec: 0.16 }); burst(a, { dec: 0.07, type: 'lowpass', f: 1200, peak: 0.25 }); },
  chalk(a) { burst(a, { dec: 0.32, f: 2600, f1: 6200, q: 3, peak: 0.12 }); tone(a, { type: 'triangle', f0: 3800, f1: 5200, peak: 0.025, dec: 0.28 }); },
  deny(a) { tone(a, { type: 'square', f0: 160, f1: 130, peak: 0.1, dec: 0.09 }); tone(a, { type: 'square', f0: 160, f1: 130, t: 0.12, peak: 0.1, dec: 0.09 }); },
  dig(a) { burst(a, { dec: 0.2, f: 3000, f1: 1500, q: 0.7, peak: 0.16 }); tone(a, { f0: 1760, t: 0.14, peak: 0.1, dec: 0.4 }); tone(a, { f0: 2640, t: 0.17, peak: 0.07, dec: 0.5 }); },
  slip(a) { burst(a, { dec: 0.16, f: 5500, f1: 3000, q: 0.5, peak: 0.1 }); },
  rattle(a) { for (let i = 0; i < 5; i++) { tone(a, { type: 'square', f0: 600 + (i % 2) * 140, f1: 300, t: i * 0.05, peak: 0.07, dec: 0.03 }); } burst(a, { dec: 0.3, f: 1800, q: 1.5, peak: 0.08 }); },
};

/** Play one sound by id. Quietly ignores ids it does not know (voice and music ids go to the host). */
export function playSfx(id) {
  const fn = RECIPES[id];
  if (!fn) return false;
  const a = ctxOf(); if (!a) return false;
  try { if (a.state === 'suspended') a.resume?.(); fn(a); return true; } catch { return false; }
}
/** How many sounds are sounding right now (the browser test checks it is zero after Leave). */
export const activeVoices = () => voices;
export function stopAll() { try { ac?.close?.(); } catch { /* nothing to stop */ } ac = null; master = null; voices = 0; }

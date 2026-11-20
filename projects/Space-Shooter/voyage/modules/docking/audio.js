// Docking's own sounds, made in code (WebAudio; nothing to load). The sound is a clue: a guide tone rises in pitch as you centre in the
// corridor, a wall warning pulses faster as the wall nears, the thruster hisses while you burn. The browser only lets audio start after a
// touch or a key, so `unlock()` is called from the first one; before that every call is a quiet no-op. Never throws.
//   const a = createAudio();  a.unlock();  a.update({ thrust, centred, warn, wall });  a.scrape('wall'); a.clamp(); a.lightOut(); a.tug();  a.close();
let liveContexts = 0;
/** How many AudioContexts this module has open right now (the Leave test checks it is 0 after Leave). */
export const liveAudioContexts = () => liveContexts;

export function createAudio({ enabled = true } = {}) {
  let ac = null, master = null, thr = null, thrGain = null, guide = null, guideGain = null, warnOsc = null, warnGain = null, dead = false;
  const Ctor = typeof globalThis !== 'undefined' ? (globalThis.AudioContext || globalThis.webkitAudioContext) : null;
  const ok = () => ac && !dead && ac.state !== 'closed';
  function noiseBuffer(seconds = 1) {
    const b = ac.createBuffer(1, Math.round(ac.sampleRate * seconds), ac.sampleRate), d = b.getChannelData(0);
    let a = 12345; for (let i = 0; i < d.length; i++) { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; d[i] = a / 2147483648 - 1; }
    return b;
  }
  function unlock() {
    if (!enabled || dead || !Ctor) return;
    try {
      if (!ac) {
        ac = new Ctor(); liveContexts++; master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
        const src = ac.createBufferSource(); src.buffer = noiseBuffer(1); src.loop = true;
        const bp = ac.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 520; thrGain = ac.createGain(); thrGain.gain.value = 0;
        src.connect(bp); bp.connect(thrGain); thrGain.connect(master); src.start(); thr = src;
        guide = ac.createOscillator(); guide.type = 'sine'; guide.frequency.value = 220; guideGain = ac.createGain(); guideGain.gain.value = 0;
        guide.connect(guideGain); guideGain.connect(master); guide.start();
        warnOsc = ac.createOscillator(); warnOsc.type = 'square'; warnOsc.frequency.value = 330; warnGain = ac.createGain(); warnGain.gain.value = 0;
        warnOsc.connect(warnGain); warnGain.connect(master); warnOsc.start();
      }
      if (ac.state === 'suspended') ac.resume();
    } catch { ac = null; }
  }
  const now = () => ac.currentTime;
  const ramp = (p, v, t = 0.06) => { try { p.cancelScheduledValues(now()); p.setTargetAtTime(v, now(), t); } catch {} };
  /** Per frame: thrust 0..1, centred 0..1 (1 = dead centre, null = not in the corridor), wall 0..1 (how near the wall), t seconds for the pulse. */
  function update({ thrust = 0, centred = null, wall = 0, t = 0 } = {}) {
    if (!ok()) return;
    ramp(thrGain.gain, 0.16 * thrust, 0.05);
    if (centred == null) ramp(guideGain.gain, 0, 0.08);
    else { guide.frequency.setTargetAtTime(220 * Math.pow(2, 2 * centred), now(), 0.05); ramp(guideGain.gain, 0.035 + 0.03 * centred, 0.08); }
    // the wall warning: a pulse that gets faster as the wall nears (it starts at the edge of the glow, so a longer warning starts it sooner)
    const on = wall > 0 && Math.sin(t * (10 + 26 * wall)) > 0;
    ramp(warnGain.gain, on ? 0.02 + 0.03 * wall : 0, 0.01);
  }
  function blip(freq, dur, type = 'sine', gain = 0.12, slide = 0) {
    if (!ok()) return;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(freq, now());
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), now() + dur);
    g.gain.setValueAtTime(gain, now()); g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(now() + dur + 0.02);
  }
  function burst(dur, gain = 0.25, freq = 900) {
    if (!ok()) return;
    const s = ac.createBufferSource(); s.buffer = noiseBuffer(dur + 0.1);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; const g = ac.createGain();
    g.gain.setValueAtTime(gain, now()); g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(); s.stop(now() + dur + 0.05);
  }
  return {
    unlock, update,
    scrape(kind) { burst(0.35, kind === 'wall' ? 0.22 : 0.4, kind === 'wall' ? 1400 : 600); blip(kind === 'wall' ? 160 : 90, 0.3, 'sawtooth', 0.14, -50); },
    clamp() { blip(95, 0.28, 'sine', 0.35, -45); setTimeout(() => { if (ok()) { blip(80, 0.3, 'sine', 0.4, -40); burst(0.1, 0.18, 2200); } }, 170); setTimeout(() => blip(660, 0.5, 'triangle', 0.1), 420); setTimeout(() => blip(880, 0.6, 'triangle', 0.1), 560); },
    lightOut() { blip(520, 0.25, 'triangle', 0.1, -300); },
    tug() { blip(130, 0.9, 'sawtooth', 0.08, 30); burst(0.5, 0.1, 400); },
    close() { dead = true; if (ac) liveContexts = Math.max(0, liveContexts - 1); try { thr?.stop(); guide?.stop(); warnOsc?.stop(); ac?.close(); } catch {} ac = null; },
    get live() { return ok(); },
  };
}

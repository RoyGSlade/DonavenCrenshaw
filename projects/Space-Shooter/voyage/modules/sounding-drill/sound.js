// Sounds made in code (WebAudio), so the module ships no audio files. The audio context is only made after a real tap or key.
// A drill whine whose pitch follows the rock, a ping on each ring, an echo "tink" on a find (its pitch is a clue to its kind),
// a grind in a vein, a clunk on a seize, a crack. Everything is quiet and short; `mute()` silences it.

const TINK = { ore: 300, gem: 1180, relic: 620, oddity: 840 };

export function makeSound() {
  let ac = null, master = null, whine = null, whineGain = null, noiseBuf = null, muted = false, lastGrind = -1;
  const ready = () => {
    if (ac) return ac.state !== 'closed';
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    try {
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let s = 1234567;
      for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    } catch { ac = null; return false; }
    return true;
  };
  const now = () => ac.currentTime;
  const tone = (freq, dur, { type = 'sine', gain = 0.12, slide = 1, delay = 0 } = {}) => {
    if (muted || !ac) return;
    const t = now() + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  };
  const burst = (dur, { freq = 800, q = 1, gain = 0.15, type = 'bandpass' } = {}) => {
    if (muted || !ac) return;
    const t = now(), src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.05);
  };
  return {
    unlock() { if (ready() && ac.state === 'suspended') ac.resume?.(); },
    mute(v = true) { muted = v; if (v) this.drill(false); },
    /** The drill whine: `hardness` 0 (open) .. 1 (hard vein) sets its pitch down and its grit up. */
    drill(on, hardness = 0.3) {
      if (!ac) return;
      if (!on) { if (whineGain) { whineGain.gain.setTargetAtTime(0.0001, now(), 0.05); } return; }
      if (muted) return;
      if (!whine) {
        whine = ac.createOscillator(); whineGain = ac.createGain();
        whine.type = 'sawtooth'; whine.frequency.value = 220;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        whine.connect(lp); lp.connect(whineGain); whineGain.connect(master); whineGain.gain.value = 0.0001; whine.start();
        whine._lp = lp;
      }
      const f = 330 - hardness * 190;
      whine.frequency.setTargetAtTime(f, now(), 0.08);
      whine._lp.frequency.setTargetAtTime(1100 - hardness * 600, now(), 0.1);
      whineGain.gain.setTargetAtTime(0.035 + hardness * 0.02, now(), 0.06);
    },
    ping(reach = 1) { if (!ready()) return; tone(520 * (1 + 0.2 * (1 - Math.min(1.6, reach))), 0.5, { type: 'sine', gain: 0.05, slide: 0.55 }); },
    listen() { if (!ready()) return; tone(300, 1.0, { type: 'sine', gain: 0.07, slide: 0.5 }); tone(450, 1.2, { type: 'sine', gain: 0.04, slide: 0.45, delay: 0.1 }); },
    /** The echo off a find: kind sets the pitch, distance the loudness, so you can hear it before you see it. */
    tink(kind = 'ore', d = 200, reach = 200) {
      if (!ready()) return;
      const loud = Math.max(0.03, 0.16 * (1 - Math.min(1, d / (reach * 1.3))));
      const f = TINK[kind] || 700;
      tone(f, 0.55, { type: 'triangle', gain: loud, slide: 0.98 }); tone(f * 1.5, 0.35, { type: 'sine', gain: loud * 0.5, delay: 0.03 });
    },
    grind() { if (!ready()) return; const t = ac.currentTime; if (t - lastGrind < 0.12) return; lastGrind = t; burst(0.14, { freq: 260, q: 2, gain: 0.07 }); },
    clunk() { if (!ready()) return; tone(110, 0.35, { type: 'square', gain: 0.1, slide: 0.4 }); burst(0.18, { freq: 200, q: 1, gain: 0.12, type: 'lowpass' }); },
    crack() { if (!ready()) return; burst(0.22, { freq: 2600, q: 0.8, gain: 0.2, type: 'highpass' }); tone(190, 0.25, { type: 'square', gain: 0.08, slide: 0.5 }); },
    shatter() { if (!ready()) return; burst(0.6, { freq: 2200, q: 0.6, gain: 0.25, type: 'highpass' }); tone(90, 0.6, { type: 'sawtooth', gain: 0.1, slide: 0.3 }); },
    low() { if (!ready()) return; tone(200, 0.18, { type: 'square', gain: 0.05 }); tone(200, 0.18, { type: 'square', gain: 0.05, delay: 0.24 }); },
    claw() { if (!ready()) return; tone(180, 0.6, { type: 'sawtooth', gain: 0.05, slide: 0.6 }); tone(380, 0.25, { type: 'triangle', gain: 0.09, delay: 0.62, slide: 1.2 }); },
    win() { if (!ready()) return; [520, 660, 880].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.08, delay: i * 0.11 })); },
    lose() { if (!ready()) return; tone(260, 0.5, { type: 'triangle', gain: 0.08, slide: 0.5 }); },
    destroy() { try { whine?.stop(); } catch { /* already stopped */ } try { ac?.close(); } catch { /* closed */ } ac = null; whine = null; },
  };
}

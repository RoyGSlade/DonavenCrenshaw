// Ralph's sounds, made in code with the Web Audio API (the game has no sound effect files).
// No bark and no whine: a fake dog voice is worse than none. Everything here is a ball, a claw, a bowl, a tail or a breath.
// createSfx() -> { play(id), stop(), resume() }. The host asks for sounds by id through ctx.sound(id); nothing here loops.
export const IDS = ['throw', 'bounce1', 'bounce2', 'bounce3', 'knock', 'roll', 'claw', 'skid', 'pickup', 'drop', 'give', 'crunch', 'pour', 'bowl', 'kick', 'shake', 'found', 'pocket', 'bond', 'dig', 'pet', 'thump', 'pant', 'chew', 'wake', 'tray', 'ralph-stop'];

export function createSfx(AC = (typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null)) {
  let ac = null, master = null, noiseBuf = null; const live = new Set(); const last = {};
  const ensure = () => {
    if (ac || !AC) return ac;
    try { ac = new AC(); master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination); } catch { ac = null; return null; }
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate); const d = noiseBuf.getChannelData(0); let x = 7; for (let i = 0; i < d.length; i++) { x = (x * 1664525 + 1013904223) >>> 0; d[i] = x / 2147483648 - 1; }
    return ac;
  };
  const track = (node) => { live.add(node); node.onended = () => live.delete(node); return node; };
  const env = (g, t0, a, peak, d) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); };
  const tone = (t0, f0, f1, a, d, vol, type = 'sine') => { const o = track(ac.createOscillator()), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + a + d); env(g, t0, a, vol, d); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + a + d + 0.05); };
  const noise = (t0, a, d, vol, f, q = 1, kind = 'bandpass', f2 = null) => { const s = track(ac.createBufferSource()), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noiseBuf; s.loop = true; fl.type = kind; fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + a + d); fl.Q.value = q; env(g, t0, a, vol, d); s.connect(fl); fl.connect(g); g.connect(master); s.start(t0); s.stop(t0 + a + d + 0.05); };
  const SOUNDS = {
    throw: (t) => { noise(t, 0.04, 0.22, 0.22, 500, 0.8, 'bandpass', 2400); },
    bounce1: (t) => { tone(t, 220, 90, 0.004, 0.12, 0.34); noise(t, 0.002, 0.04, 0.1, 1800); },
    bounce2: (t) => { tone(t, 280, 120, 0.003, 0.09, 0.26); noise(t, 0.002, 0.03, 0.08, 2000); },
    bounce3: (t) => { tone(t, 340, 160, 0.003, 0.06, 0.16); },
    knock: (t) => { tone(t, 150, 60, 0.003, 0.14, 0.4, 'triangle'); noise(t, 0.002, 0.05, 0.16, 700); },
    roll: (t) => { noise(t, 0.01, 0.1, 0.05, 260, 1.2); },
    claw: (t) => { noise(t, 0.001, 0.025, 0.07, 3200, 3); tone(t, 900, 500, 0.001, 0.02, 0.03, 'square'); },
    skid: (t) => { noise(t, 0.01, 0.3, 0.2, 1400, 1.4, 'bandpass', 500); },
    pickup: (t) => { tone(t, 420, 600, 0.004, 0.05, 0.12); noise(t, 0.002, 0.03, 0.06, 2500); },
    drop: (t) => { tone(t, 300, 180, 0.004, 0.08, 0.14); },
    give: (t) => { tone(t, 380, 700, 0.004, 0.08, 0.14); tone(t + 0.07, 520, 520, 0.004, 0.08, 0.1); },
    crunch: (t) => { noise(t, 0.002, 0.05, 0.22, 2600, 2); noise(t + 0.06, 0.002, 0.05, 0.18, 2100, 2); noise(t + 0.12, 0.002, 0.04, 0.12, 3000, 2); },
    pour: (t) => { for (let i = 0; i < 9; i++) noise(t + i * 0.04, 0.001, 0.03, 0.1 + 0.05 * (i % 3), 3400 - i * 120, 3); },
    bowl: (t) => { tone(t, 1760, 1700, 0.002, 0.35, 0.13, 'sine'); tone(t, 2640, 2600, 0.002, 0.2, 0.06); },
    kick: (t) => { for (let i = 0; i < 6; i++) tone(t + i * 0.085, 110, 70, 0.003, 0.07, 0.22, 'triangle'); },
    shake: (t) => { for (let i = 0; i < 10; i++) { tone(t + i * 0.045, 2400 + (i % 3) * 400, 2200, 0.001, 0.05, 0.05); } noise(t, 0.02, 0.35, 0.06, 900, 0.6); },
    found: (t) => { tone(t, 523, 523, 0.005, 0.18, 0.14); tone(t + 0.1, 659, 659, 0.005, 0.18, 0.14); tone(t + 0.2, 784, 784, 0.005, 0.3, 0.14); },
    pocket: (t) => { tone(t, 700, 1100, 0.004, 0.08, 0.1); tone(t + 0.06, 1100, 1400, 0.004, 0.1, 0.08); },
    bond: (t) => { tone(t, 330, 330, 0.01, 0.4, 0.12, 'triangle'); tone(t + 0.14, 495, 495, 0.01, 0.5, 0.12, 'triangle'); },
    dig: (t) => { for (let i = 0; i < 5; i++) noise(t + i * 0.11, 0.004, 0.09, 0.14, 1500 - i * 80, 1, 'bandpass', 700); },
    pet: (t) => { noise(t, 0.04, 0.18, 0.07, 1100, 0.5, 'lowpass'); },
    thump: (t) => { tone(t, 90, 50, 0.004, 0.12, 0.35, 'triangle'); },
    pant: (t) => { for (let i = 0; i < 4; i++) noise(t + i * 0.24, 0.06, 0.12, 0.07, 1800, 0.7, 'bandpass', 900); },
    chew: (t) => { noise(t, 0.003, 0.05, 0.1, 900, 1.5); noise(t + 0.18, 0.003, 0.05, 0.08, 800, 1.5); },
    wake: (t) => { noise(t, 0.1, 0.4, 0.05, 700, 0.5, 'lowpass', 300); },
    tray: (t) => { tone(t, 660, 520, 0.003, 0.06, 0.07); },
  };
  function play(id) {
    if (id === 'ralph-stop') { stop(); return; }
    const f = SOUNDS[id]; if (!f || !ensure()) return;
    if (ac.state === 'suspended') ac.resume?.();
    const now = ac.currentTime; if (last[id] != null && now - last[id] < 0.03) return; last[id] = now;
    if (live.size > 40) return; // never pile up
    try { f(now + 0.005); } catch { /* a sound is never worth a crash */ }
  }
  function stop() { for (const n of [...live]) { try { n.stop(); } catch { /* already stopped */ } } live.clear(); }
  return { play, stop, resume: () => ensure() && ac.resume?.(), get running() { return live.size; } };
}

// Small synth blips for on-foot feedback, so every action has a sound before
// the voice lane's real effects land. A page can pass its own play(id) instead
// (ids: events.js SOUNDS). Quiet by default, never throws, no files.
let ctx = null;
const PRESETS = {
  step: [180, 0.03, 'triangle', 0.04, -60], door: [220, 0.18, 'sine', 0.08, 220], talk: [660, 0.06, 'sine', 0.05, 80],
  shot: [880, 0.05, 'square', 0.05, -500], hit: [320, 0.06, 'square', 0.06, -150], hurt: [140, 0.16, 'sawtooth', 0.09, -60],
  kill: [200, 0.25, 'sawtooth', 0.08, -150], dash: [500, 0.1, 'sine', 0.05, 400], guard: [1200, 0.12, 'triangle', 0.06, -400],
  drill: [95, 0.08, 'sawtooth', 0.025, 10], crack: [260, 0.14, 'square', 0.08, -200], jam: [90, 0.35, 'sawtooth', 0.09, -40],
  ore: [990, 0.12, 'triangle', 0.07, 300], turn: [520, 0.04, 'triangle', 0.05, 60], power: [440, 0.4, 'sine', 0.08, 440],
  unlock: [660, 0.3, 'triangle', 0.08, 330], scan: [740, 0.2, 'sine', 0.05, 200], boost: [160, 0.25, 'sawtooth', 0.04, 260],
  bump: [70, 0.18, 'square', 0.08, -20], dock: [330, 0.5, 'sine', 0.07, -110],
};

export function createSfx({ play = null, muted = () => false } = {}) {
  return function sound(id) {
    if (play) { try { play(id); } catch { /* the page's player failed; stay quiet */ } return; }
    if (muted()) return;
    const p = PRESETS[id];
    if (!p) return;
    try {
      ctx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const [freq, len, type, gain, slide] = p;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + len);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
    } catch { /* no audio here */ }
  };
}

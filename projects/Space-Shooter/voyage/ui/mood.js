// The music reacts to danger (opening B, outcome 7). Three moods:
//   calm    the ship's own bed plays (ui/audio.js ambience);
//   danger  the bed is CUT and a tense bed takes over: a low drone and a slow pulse, with a hit as it comes in (the alarm, the Reavers aboard);
//   combat  the same bed, faster and harder (a live fight).
// The tense bed is synthesised (no file exists yet: listed in opening-b/READY as wanting a composed cue). Nothing plays before the first
// touch, and mute and the volume are the hangar's (audio.settings()). The pure table is what the tests read.
export const MOODS = Object.freeze({
  calm: Object.freeze({ bed: 1, drone: 0, pulseEvery: 0, hat: 0 }),
  danger: Object.freeze({ bed: 0, drone: 0.07, pulseEvery: 0.9, hat: 0 }),
  combat: Object.freeze({ bed: 0, drone: 0.09, pulseEvery: 0.5, hat: 0.05 }),
});
export const MOOD_NAMES = Object.freeze(Object.keys(MOODS));
/** A mood's parameters; an unknown name is calm. */
export const moodOf = (name) => MOODS[name] || MOODS.calm;

/**
 * createMood({ audio, settings, ctxFactory }) -> { set(mode), mode, destroy() }.
 * audio: the hangar audio (setMoodFactor). settings(): { muted, ambience } (default audio.settings()). ctxFactory(): an AudioContext (tests pass none).
 */
export function createMood({ audio, settings = () => audio?.settings?.() || { muted: false, ambience: 0.6 }, ctxFactory = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)() }) {
  let mode = 'calm', ctx = null, drone = null, pulseTimer = 0, fade = 0, level = 1;
  const level01 = () => { const s = settings(); return s.muted ? 0 : Math.max(0, Math.min(1, (s.ambience ?? 0.6) * 1.4)); };

  function ensure() {
    if (ctx) return ctx;
    try { ctx = ctxFactory(); } catch { ctx = null; }
    return ctx;
  }
  function startDrone(target) {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    if (!drone) {
      const g = c.createGain(), f = c.createBiquadFilter(), a = c.createOscillator(), b = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain();
      a.type = 'sawtooth'; b.type = 'sawtooth'; a.frequency.value = 55; b.frequency.value = 55.7; f.type = 'lowpass'; f.frequency.value = 190; g.gain.value = 0.0001;
      lfo.frequency.value = 0.22; lg.gain.value = 0.02; lfo.connect(lg).connect(g.gain);
      a.connect(f); b.connect(f); f.connect(g).connect(c.destination);
      a.start(); b.start(); lfo.start();
      drone = { g, stop() { try { a.stop(); b.stop(); lfo.stop(); } catch { /* done */ } } };
    }
    drone.g.gain.setTargetAtTime(Math.max(0.0001, target * level01()), c.currentTime, 0.35);
  }
  function thump(strong = false) {
    const c = ctx;
    if (!c || level01() <= 0) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(strong ? 70 : 58, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.35);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime((strong ? 0.4 : 0.2) * level01(), t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.45);
  }
  function setPulse(every) {
    clearInterval(pulseTimer); pulseTimer = 0;
    if (every > 0) pulseTimer = setInterval(() => thump(false), every * 1000);
  }
  function ramp(to) {
    clearInterval(fade);
    fade = setInterval(() => {
      level += (to - level) * 0.35;
      if (Math.abs(to - level) < 0.02) { level = to; clearInterval(fade); fade = 0; }
      audio?.setMoodFactor?.(level);
    }, 50);
  }

  return {
    get mode() { return mode; },
    /** Change the mood. Coming into danger cuts the bed and lands a hit; back to calm brings the bed back and lets the tense bed fall away. */
    set(next) {
      const m = MOODS[next] ? next : 'calm';
      if (m === mode) return mode;
      const was = mode;
      mode = m;
      const p = moodOf(m);
      ramp(p.bed);
      if (p.drone > 0) { startDrone(p.drone); if (was === 'calm') thump(true); } else if (drone && ctx) drone.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
      setPulse(p.pulseEvery);
      return mode;
    },
    destroy() { clearInterval(fade); clearInterval(pulseTimer); drone?.stop(); drone = null; audio?.setMoodFactor?.(1); },
  };
}

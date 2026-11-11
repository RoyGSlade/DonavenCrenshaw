// Hangar sound: a looped ambience bed and one voice line at a time, played
// through the story contract's say() path (story:say carries the line's audio
// URL; the dialogue box asks this player to play it). Nothing makes a sound
// until the player has touched the page (browsers block it anyway, and a page
// that starts talking by itself is rude). Mute and the two volumes are kept
// per device; the music level starts from today's Stardust settings.
// Media is injected (createAudio) so tests run without a browser.

export const AUDIO_KEY = 'stardust.newgame.audio';
const LEGACY_KEY = 'starmap.settings'; // today's Stardust: { musicVolume, sfxVolume }
const clamp01 = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

export function readAudioSettings(storage = globalThis.localStorage) {
  let own = {};
  let legacy = {};
  try { own = JSON.parse(storage?.getItem(AUDIO_KEY) || '{}') || {}; } catch { own = {}; }
  try { legacy = JSON.parse(storage?.getItem(LEGACY_KEY) || '{}') || {}; } catch { legacy = {}; }
  return {
    muted: own.muted === true,
    ambience: clamp01(own.ambience, clamp01(legacy.musicVolume, 0.6)),
    voice: clamp01(own.voice, clamp01(legacy.sfxVolume, 1)),
  };
}

export function writeAudioSettings(settings, storage = globalThis.localStorage) {
  const clean = { muted: settings.muted === true, ambience: clamp01(settings.ambience, 0.6), voice: clamp01(settings.voice, 1) };
  try { storage?.setItem(AUDIO_KEY, JSON.stringify(clean)); } catch { /* this page only */ }
  return clean;
}

/**
 * createAudio(src) -> an HTMLAudioElement-like object. storage: localStorage.
 * Returns { unlock(), unlocked, setAmbience(url, gain), playLine(url) -> Promise<'ended'|'stopped'|'failed'|'silent'>,
 *           stopLine(), settings(), set(patch), destroy() }.
 */
export function createHangarAudio({ createAudio = (src) => new Audio(src), storage = globalThis.localStorage, duck = 0.35 } = {}) {
  let prefs = readAudioSettings(storage);
  let unlocked = false;
  let bed = null; // { audio, url, gain }
  let line = null; // { audio, done }
  let wantBed = null;
  let chime = null; // Web Audio context for cue chimes, made on first use

  function bedVolume() {
    if (!bed) return 0;
    const speaking = line ? duck : 1;
    return prefs.muted ? 0 : clamp01(bed.gain * prefs.ambience * speaking, 0);
  }
  function applyBed() {
    if (!bed) return;
    bed.audio.volume = bedVolume();
    if (prefs.muted || !unlocked) { try { bed.audio.pause(); } catch { /* ignore */ } return; }
    if (bed.audio.paused) { try { Promise.resolve(bed.audio.play()).catch(() => {}); } catch { /* blocked */ } }
  }

  function startBed() {
    if (!wantBed || !unlocked) return;
    if (bed?.url === wantBed.url) { bed.gain = wantBed.gain; applyBed(); return; }
    if (bed) { try { bed.audio.pause(); } catch { /* ignore */ } }
    const audio = createAudio(wantBed.url);
    audio.loop = true;
    audio.preload = 'auto';
    bed = { audio, url: wantBed.url, gain: wantBed.gain };
    applyBed();
  }

  return {
    /** Call from a user gesture (pointerdown / keydown). Starts the ambience. */
    unlock() {
      if (unlocked) return false;
      unlocked = true;
      startBed();
      return true;
    },
    get unlocked() { return unlocked; },

    /** The looped bed for this place; null stops it. gain 0..1 is the file's own level. */
    setAmbience(url, gain = 0.5) {
      if (!url) { wantBed = null; if (bed) { try { bed.audio.pause(); } catch { /* ignore */ } bed = null; } return; }
      wantBed = { url, gain: clamp01(gain, 0.5) };
      startBed();
    },

    /**
     * Play one voice line (stops the one before). Resolves when it ends, is
     * stopped or fails. With no url, muted, or before the first gesture it
     * resolves 'silent' at once; the caller times the caption instead.
     */
    playLine(url) {
      this.stopLine();
      if (!url || prefs.muted || !unlocked || prefs.voice <= 0) return Promise.resolve('silent');
      const audio = createAudio(url);
      audio.volume = prefs.voice;
      let settle;
      const done = new Promise((resolve) => { settle = resolve; });
      const current = { audio, done, settle };
      line = current;
      const end = (how) => {
        if (line === current) line = null;
        applyBed();
        current.settle(how);
      };
      audio.onended = () => end('ended');
      audio.onerror = () => end('failed');
      applyBed(); // duck the bed under the voice
      try { Promise.resolve(audio.play()).catch(() => end('failed')); } catch { end('failed'); }
      return done;
    },
    stopLine() {
      if (!line) return;
      const current = line;
      line = null;
      try { current.audio.pause(); } catch { /* ignore */ }
      applyBed();
      current.settle('stopped');
    },
    get speaking() { return Boolean(line); },

    /**
     * A short synthesized chime for the director's cues (objective, unlock, done):
     * two soft sine notes, no file. Silent before a gesture, when muted, or where
     * Web Audio is missing. Returns whether it played.
     */
    cue(kind = 'objective') {
      if (!unlocked || prefs.muted || prefs.voice <= 0) return false;
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) return false;
      try {
        chime ||= new Ctx();
        const notes = { objective: [660, 880], unlock: [523, 784, 1047], done: [392, 523, 659, 784] }[kind] || [660, 880];
        const t0 = chime.currentTime + 0.01;
        notes.forEach((f, i) => {
          const osc = chime.createOscillator();
          const gain = chime.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          const at = t0 + i * 0.09;
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(0.08 * prefs.voice, at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
          osc.connect(gain).connect(chime.destination);
          osc.start(at);
          osc.stop(at + 0.5);
        });
        return true;
      } catch { return false; }
    },

    settings: () => ({ ...prefs }),
    /** Change mute or a volume; saved for this device at once. */
    set(patch) {
      prefs = writeAudioSettings({ ...prefs, ...patch }, storage);
      if (line) line.audio.volume = prefs.muted ? 0 : prefs.voice;
      if (prefs.muted) this.stopLine();
      if (bed) applyBed(); else startBed();
      return { ...prefs };
    },
    get bedVolume() { return bedVolume(); },
    destroy() {
      this.stopLine();
      if (bed) { try { bed.audio.pause(); } catch { /* ignore */ } }
      bed = null;
      wantBed = null;
    },
  };
}

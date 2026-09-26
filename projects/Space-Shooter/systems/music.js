// Full-length, owner-supplied masters. Cue transitions fade; loop points are not edited.
export const MUSIC_CUES = Object.freeze({
  menu: { file: 'menu.mp3', title: 'Stardust: Quiet Orbit', volume: 0.34 },
  level1: { file: 'alpha-relay.mp3', title: 'Alpha Relay: Open Thrust', volume: 0.4 },
  level2: { file: 'beacon-prime.mp3', title: 'Beacon Prime: Gravity Well', volume: 0.4 },
  level3: { file: 'dustfall-station.mp3', title: 'Dustfall Station: Narrow Drift', volume: 0.4 },
  level4: { file: 'nether-crossing.mp3', title: 'Nether Crossing: Predictive Fire', volume: 0.4 },
  level5: { file: 'iron-veil.mp3', title: 'Iron Veil: The Exam', volume: 0.4 },
  secret: { file: 'reverse-gate.mp3', title: 'Reverse Gate: The Other Side', volume: 0.34 },
  boss_theme: { file: 'warden.mp3', title: 'Warden: Mirrored Gravity', volume: 0.4 },
  riddle: { file: 'seal-riddle.mp3', title: 'Anomalous Seal: Four Echoes', volume: 0.24 },
  victory: { file: 'victory.mp3', title: 'Warden Down: Safe Passage', volume: 0.36, loop: false },
});

const bounded = (value, fallback = 1) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

/** Two-voice, gesture-gated player. Inject media/clock functions for deterministic tests. */
export function createMusicPlayer({
  createAudio,
  now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = handle => cancelAnimationFrame(handle),
  fadeMs = 800,
  onError = () => {},
}) {
  let current = null, outgoing = null, desired = null;
  let unlocked = false, volume = 1, generation = 0, frame = null;

  function apply(voice) { if (voice) voice.audio.volume = bounded(voice.relative * voice.gain * volume); }
  function retire(voice) { if (voice) { voice.audio.pause(); voice.audio.volume = 0; } }
  function cancelFade() { if (frame !== null) cancelFrame(frame); frame = null; }
  function retainAudibleVoice() {
    const keep = outgoing && (!current || outgoing.gain * outgoing.relative > current.gain * current.relative) ? outgoing : current;
    if (current !== keep) retire(current);
    if (outgoing !== keep) retire(outgoing);
    outgoing = keep; current = null;
  }
  function fade(token, incoming, previous) {
    const start = now(), initialIn = incoming?.gain || 0, initialOut = previous?.gain || 0;
    function step() {
      if (token !== generation) return;
      const fraction = fadeMs > 0 ? bounded((now() - start) / fadeMs, 0) : 1;
      if (incoming) { incoming.gain = initialIn + (1 - initialIn) * fraction; apply(incoming); }
      if (previous) { previous.gain = initialOut * (1 - fraction); apply(previous); }
      if (fraction < 1) frame = requestFrame(step);
      else { retire(previous); if (outgoing === previous) outgoing = null; frame = null; }
    }
    step();
  }

  function play(track, options = {}) {
    const cue = MUSIC_CUES[track];
    if (!cue) return;
    desired = { track, options };
    if (!unlocked) return;
    if (current?.track === track) {
      current.relative = bounded(options.volume ?? cue.volume);
      current.audio.loop = options.loop ?? cue.loop ?? true;
      apply(current);
      // Completed one-shots stay completed until another cue is selected.
      if (current.audio.paused && !current.starting && (!current.audio.ended || current.audio.loop)) {
        const voice = current;
        voice.starting = true;
        const failed = error => { voice.starting = false; if (current === voice) onError(error, track); };
        try { Promise.resolve(voice.audio.play()).then(() => { voice.starting = false; }, failed); }
        catch (error) { failed(error); }
      }
      return;
    }
    const token = ++generation;
    cancelFade();
    // A quick stop -> play keeps the fading voice rather than cutting it off.
    retainAudibleVoice();
    const previous = outgoing;
    const voice = {
      track, relative: bounded(options.volume ?? cue.volume), gain: 0, starting: true,
      audio: createAudio(`../../assets/audio/stardust/${cue.file}`),
    };
    current = voice;
    voice.audio.loop = options.loop ?? cue.loop ?? true;
    apply(voice);
    function failed(error) {
      if (token !== generation) return;
      retire(voice); current = previous; outgoing = null;
      if (previous) { previous.gain = 1; apply(previous); }
      onError(error, track);
    }
    try {
      Promise.resolve(voice.audio.play()).then(() => {
        if (token !== generation) return;
        voice.starting = false;
        fade(token, voice, previous);
      }, failed);
    } catch (error) { failed(error); }
  }

  return {
    play,
    unlock() {
      unlocked = true;
      if (desired) play(desired.track, desired.options);
    },
    setVolume(value) { volume = bounded(value, volume); apply(current); apply(outgoing); },
    stop() {
      desired = null;
      const token = ++generation;
      cancelFade();
      retainAudibleVoice();
      if (outgoing) fade(token, null, outgoing);
    },
    status() {
      const describe = voice => voice ? {
        track: voice.track, playing: !voice.audio.paused, starting: voice.starting,
        volume: voice.audio.volume, time: voice.audio.currentTime, readyState: voice.audio.readyState,
        src: voice.audio.currentSrc || voice.audio.src, loop: voice.audio.loop,
      } : null;
      return { requested: desired?.track || null, unlocked, volume, current: describe(current), outgoing: describe(outgoing) };
    },
  };
}

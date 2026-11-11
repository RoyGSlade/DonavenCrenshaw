// say(lineId): show a line and play its voice if there is one, then resolve.
// ROUND2-CONTRACT.md section 2. Renderers (caption.js, or a lane's own box)
// listen for 'story:say' and 'story:clear' and draw with textContent; a tap
// emits 'story:said' { seq } to cut the line short. Audio is played here, so it
// works whatever draws the words. Without audio the line holds for its reading
// time. If nothing answers, the line still ends, so a tutorial never stalls.
import { lineById, fillLine } from './lines.js';
import { CAST } from './cast.js';
import { voiceUrl as defaultVoiceUrl, voiceMs } from './voice.js';

export const READ_BASE_MS = 900;
export const READ_PER_CHAR_MS = 55;
export const READ_MAX_MS = 7000;

/** How long a line stays up with no audio. */
export const readMs = (text) => Math.min(READ_MAX_MS, READ_BASE_MS + READ_PER_CHAR_MS * String(text || '').length);

/** A browser audio player: play(url) -> { done: Promise, stop() }, or null when there is no Audio. */
export function browserAudio({ volume = () => 1, muted = () => false } = {}) {
  if (typeof Audio === 'undefined') return null;
  return {
    play(url) {
      const a = new Audio(url);
      a.volume = Math.max(0, Math.min(1, volume()));
      a.muted = Boolean(muted());
      let stop = () => {};
      const done = new Promise((resolve) => {
        const end = () => resolve();
        a.addEventListener('ended', end, { once: true });
        a.addEventListener('error', end, { once: true });
        stop = () => { try { a.pause(); } catch { /* already gone */ } resolve(); };
        a.play().catch(end); // autoplay refused: the text still shows for its reading time
      });
      return { done, stop: () => stop() };
    },
  };
}

/**
 * createSay({ bus, voiceUrl, audio, wait }) -> speak(lineId, { vars, channel }) -> Promise<{ id, skipped }>.
 * wait(ms) is a timer (tests pass a fake). channel: 'intro' lines are drawn by the intro, not the caption.
 */
export function createSay({ bus, voiceUrl = defaultVoiceUrl, audio = null, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let seq = 0;
  return async function speak(lineId, { vars = {}, channel = 'caption' } = {}) {
    const line = lineById(lineId);
    if (!line) { console.warn(`Stardust story: no line ${lineId}`); return { id: lineId, skipped: true, missing: true }; }
    const n = ++seq;
    const text = fillLine(line.text, vars);
    const url = voiceUrl(lineId);
    const durationMs = voiceMs(lineId) || readMs(text);
    const cast = CAST[line.speaker];
    bus.emit('story:say', {
      seq: n, id: line.id, speaker: line.speaker, name: cast?.name || line.name || line.speaker, text,
      emotion: line.emotion, sound: Boolean(cast?.sound), audio: url, durationMs, channel,
    });
    let skipped = false;
    let off = () => {};
    const tapped = new Promise((resolve) => { off = bus.on('story:said', (d) => { if (d?.seq === n) { skipped = true; resolve(); } }); });
    const playing = url && audio ? audio.play(url) : null;
    // With audio: until it ends (plus a short hold), capped by its length + a margin. Without: the reading time.
    const timed = playing
      ? Promise.race([playing.done.then(() => wait(250)), wait(durationMs + 1500)])
      : wait(durationMs);
    await Promise.race([tapped, timed, wait(durationMs + 600 + (playing ? 1500 : 0))]);
    off();
    if (playing) playing.stop();
    bus.emit('story:clear', { seq: n, id: line.id, channel });
    return { id: line.id, skipped };
  };
}

// The voice asset map: line id -> file under voyage/audio/voice/. The voice
// lane hands over lhc-lanes/stardust/voice/manifest.json; integration copies the
// files and fills VOICE from it (ROUND2-CONTRACT.md section 2). An empty map is
// text only, which always works.
export const VOICE = Object.freeze({});
// Known lengths in ms, from the same manifest (optional; reading time is used otherwise).
export const VOICE_MS = Object.freeze({});

/** URL of a line's audio, or null. */
export function voiceUrl(lineId) {
  const file = VOICE[lineId];
  return file ? new URL(`../audio/voice/${file}`, import.meta.url).href : null;
}

export const voiceMs = (lineId) => VOICE_MS[lineId] || 0;

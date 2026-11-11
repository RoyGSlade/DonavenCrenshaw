// Every spoken line in the new Stardust's story: the intro, the tutorial, the
// hangar crew's barks and the quest givers' job talk. The lines themselves are
// data (./data/lines.js, strict JSON for the Stardust Studio); this file reads
// them. lhc-lanes/stardust/story/LINES.json is exported from the data for the
// voice lane (story/export-lines.mjs there). The cast bible is story/CAST.md.
//
// A line: { id, speaker, emotion, text, direction, audioText? }. The speaker is
// the id's first part. `{name}` is the captain's name; such lines carry
// `audioText`, the words to record (TTS cannot know the name). Ralph's lines
// are sounds, not words: his text is the caption, the direction says what to
// make. Emotions: EMOTIONS below. Keep lines short: one breath each.
//
// All names, lines and characters are our own (BRIEF.md S60).

import { LINES_DATA } from './data/lines.js';

export const EMOTIONS = Object.freeze([...LINES_DATA.emotions]);
export const LINE_ID = /^[a-z0-9][a-z0-9.-]{0,47}$/;
const list = LINES_DATA.lines.map((l) => ({ ...l, speaker: l.speaker || l.id.split('.')[0] }));

export const LINES = Object.freeze(list.map((l) => Object.freeze(l)));
const BY_ID = new Map(LINES.map((l) => [l.id, l]));
const ADDED = [];

/**
 * Other lanes' lines (the content lane's quest talk, for one) in the same data
 * shape: addLines({ version: 1, lines: [{ id, speaker, emotion, text, direction,
 * audioText?, name? }] }). `name` is the speaker's display name when the
 * speaker is not in the cast. Ids already taken, bad ids and empty text are
 * skipped and returned as { added, skipped }. say(id) then works for them.
 */
export function addLines(data) {
  const skipped = [];
  let added = 0;
  for (const raw of Array.isArray(data?.lines) ? data.lines : []) {
    const ok = raw && typeof raw.id === 'string' && LINE_ID.test(raw.id) && !BY_ID.has(raw.id)
      && typeof raw.text === 'string' && raw.text.trim() && !(/\{[a-z]+\}/.test(raw.text) && !raw.audioText);
    if (!ok) { skipped.push(raw?.id ?? null); continue; }
    const line = Object.freeze({
      id: raw.id, speaker: raw.speaker || raw.id.split('.')[0], emotion: EMOTIONS.includes(raw.emotion) ? raw.emotion : 'neutral',
      text: raw.text, direction: String(raw.direction || ''), ...(raw.audioText ? { audioText: raw.audioText } : {}), ...(raw.name ? { name: String(raw.name) } : {}),
    });
    BY_ID.set(line.id, line);
    ADDED.push(line);
    added++;
  }
  return { added, skipped };
}

/** Every line: the story's own and any added by other lanes. */
export const allLines = () => [...LINES, ...ADDED];

/** A line by id, or null. */
export const lineById = (id) => BY_ID.get(id) || null;

/** Fills {name} and other {keys} from vars; an unknown key becomes "Captain". */
export function fillLine(text, vars = {}) {
  return String(text).replace(/\{([a-z]+)\}/g, (_, key) => {
    const v = vars[key];
    return typeof v === 'string' && v.trim() ? v.trim() : 'Captain';
  });
}

/** Lines one speaker has, in order. */
export const linesFor = (speaker) => allLines().filter((l) => l.speaker === speaker);
